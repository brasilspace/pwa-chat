/**
 * StammdatenPanel (P-Master) — Pflege der Stundenplan-Stammdaten.
 *
 * Vier Tabs: Fächer, Zeitraster, Räume, Klassen-Gruppen.
 * Inline-CRUD pro Tab. no-modal-Regel — Slide-Over rechts.
 */
import { type JSX, useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import { LehrplanImportDialog } from './lehrplan-import-dialog';
import {
    createStundenplanGateway,
    type FunctionalRole,
    type InstructionGroup,
    type PeriodSlot,
    type Room,
    type StaffMember,
    type Subject,
} from '@/gateways/platform/stundenplan-gateway';

const gateway = createStundenplanGateway();
const TABS = ['rooms', 'subjects', 'period-slots', 'instruction-groups', 'grade-bands', 'staff-roles', 'non-teaching-days', 'plan-rules', 'stundentafel'] as const;
type Tab = (typeof TABS)[number];

// Material-Icons + Sidebar-Gruppierung. Reihenfolge in der Sidebar folgt
// dem typischen Workflow: erst Infrastruktur (Räume, Fächer, Zeiten),
// dann Klassen/Gruppen, dann Personal, dann Plan-Regeln, am Ende
// die Stundentafel-Übersicht.
const TAB_META: Record<Tab, { icon: string; group: 'infra' | 'klassen' | 'personal' | 'regeln' | 'plan' }> = {
    'rooms':              { icon: 'meeting_room',   group: 'infra' },
    'subjects':           { icon: 'menu_book',      group: 'infra' },
    'period-slots':       { icon: 'schedule',       group: 'infra' },
    'instruction-groups': { icon: 'groups',         group: 'klassen' },
    'grade-bands':        { icon: 'layers',         group: 'klassen' },
    'staff-roles':        { icon: 'badge',          group: 'personal' },
    'non-teaching-days':  { icon: 'event_busy',     group: 'regeln' },
    'plan-rules':         { icon: 'rule',           group: 'regeln' },
    'stundentafel':       { icon: 'table_chart',    group: 'plan' },
};
const GROUP_LABELS: Record<'infra' | 'klassen' | 'personal' | 'regeln' | 'plan', string> = {
    infra: 'Infrastruktur',
    klassen: 'Klassen & Gruppen',
    personal: 'Personal',
    regeln: 'Regeln',
    plan: 'Übersicht',
};

const ROLE_OPTIONS: FunctionalRole[] = [
    'teacher',
    'class_lead',
    'subject_lead',
    'principal',
    'vice_principal',
    'substitute_pool',
    'external_teacher',
    'admin_staff',
];

export function StammdatenPanel({
    open,
    jwt,
    onClose,
    onChange,
}: {
    open: boolean;
    jwt: string;
    onClose: () => void;
    onChange: () => void; // Trigger Hub-Reload nach Änderung
}): JSX.Element {
    const t = useT();
    const [tab, setTab] = useState<Tab>('rooms');
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [periodSlots, setPeriodSlots] = useState<PeriodSlot[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [groups, setGroups] = useState<InstructionGroup[]>([]);
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const reload = async () => {
        if (!jwt) return;
        setLoading(true);
        setError(null);
        try {
            const [s, ps, r, g, st] = await Promise.all([
                gateway.listSubjects(jwt),
                gateway.listPeriodSlots(jwt),
                gateway.listRooms(jwt),
                gateway.listInstructionGroups(jwt),
                gateway.listStaffWithRoles(jwt),
            ]);
            setSubjects(s.subjects);
            setPeriodSlots(ps.periodSlots);
            setRooms(r.rooms);
            setGroups(g.instructionGroups);
            setStaff(st.staff);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) void reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const onMutation = async () => {
        await reload();
        onChange();
    };

    // Tabs nach Gruppen sortieren fuer die Sidebar
    const tabsByGroup = useMemo(() => {
        const m = new Map<string, Tab[]>();
        for (const tk of TABS) {
            const g = TAB_META[tk].group;
            const arr = m.get(g) ?? [];
            arr.push(tk);
            m.set(g, arr);
        }
        return m;
    }, []);

    return (
        <div
            className={cn(
                'fixed inset-0 z-40 flex flex-col bg-background transition-opacity duration-150 print:hidden',
                open ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            aria-hidden={!open}
        >
            {/* Top-Bar */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-4">
                <MaterialIcon name="settings" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.stammdaten_title')}</span>
                <span className="text-[11px] text-muted-foreground">— Stundenplan</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('common.close', { defaultValue: 'Schliessen' })}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex min-h-0 flex-1">
                {/* Sidebar links */}
                <aside className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-muted/10 p-3">
                    {(['infra', 'klassen', 'personal', 'regeln', 'plan'] as const).map((group) => {
                        const tabsInGroup = tabsByGroup.get(group) ?? [];
                        if (tabsInGroup.length === 0) return null;
                        return (
                            <div key={group}>
                                <div className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-foreground/70">
                                    {GROUP_LABELS[group]}
                                </div>
                                <ul className="space-y-0.5">
                                    {tabsInGroup.map((k) => {
                                        const active = tab === k;
                                        return (
                                            <li key={k}>
                                                <button
                                                    onClick={() => setTab(k)}
                                                    className={cn(
                                                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                                                        active
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                                    )}
                                                >
                                                    <MaterialIcon name={TAB_META[k].icon} size={16} className={active ? 'text-primary' : 'text-muted-foreground'} />
                                                    <span className="truncate">{t(`stundenplan.stammdaten_tab_${k}`)}</span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                </aside>

                {/* Hauptbereich */}
                <main className="flex-1 overflow-y-auto px-6 py-5">
                    {error && (
                        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                            {error}
                        </div>
                    )}
                    {loading && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-md bg-muted/40 animate-pulse" />)}</div>}

                    {!loading && (
                        <div className="mx-auto max-w-4xl">
                            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                                <MaterialIcon name={TAB_META[tab].icon} size={20} className="text-primary" />
                                {t(`stundenplan.stammdaten_tab_${tab}`)}
                            </h2>

                            {tab === 'subjects' && <SubjectsTab subjects={subjects} rooms={rooms} jwt={jwt} onChange={onMutation} />}
                            {tab === 'period-slots' && <PeriodSlotsTab slots={periodSlots} jwt={jwt} onChange={onMutation} />}
                            {tab === 'rooms' && <RoomsTab rooms={rooms} jwt={jwt} onChange={onMutation} />}
                            {tab === 'instruction-groups' && <GroupsTab groups={groups} jwt={jwt} onChange={onMutation} />}
                            {tab === 'grade-bands' && <GradeBandsTab jwt={jwt} />}
                            {tab === 'staff-roles' && <StaffRolesTab staff={staff} jwt={jwt} rooms={rooms} onChange={onMutation} />}
                            {tab === 'non-teaching-days' && <NonTeachingDaysTab jwt={jwt} onChange={onMutation} />}
                            {tab === 'plan-rules' && <PlanRulesTab jwt={jwt} rooms={rooms} onChange={onMutation} />}
                            {tab === 'stundentafel' && <StundentafelTab jwt={jwt} subjects={subjects} groups={groups} />}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

// ─── Subjects ────────────────────────────────────────────────────

function SubjectsTab({
    subjects, rooms, jwt, onChange,
}: { subjects: Subject[]; rooms: Room[]; jwt: string; onChange: () => void }) {
    const t = useT();
    const [showForm, setShowForm] = useState(false);
    const [key, setKey] = useState('');
    const [label, setLabel] = useState('');
    const [requiredTags, setRequiredTags] = useState('');
    const [preferredTags, setPreferredTags] = useState('');
    const [saving, setSaving] = useState(false);
    const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);

    function parseTags(s: string): string[] {
        return s.split(',').map((x) => x.trim()).filter(Boolean);
    }

    async function save() {
        if (!key.trim() || !label.trim()) return;
        setSaving(true);
        try {
            await gateway.createSubject(jwt, {
                key: key.trim(),
                label: label.trim(),
                requiredResourceTags: parseTags(requiredTags),
                preferredResourceTags: parseTags(preferredTags),
            });
            setKey(''); setLabel(''); setRequiredTags(''); setPreferredTags('');
            setShowForm(false);
            await onChange();
        } finally {
            setSaving(false);
        }
    }
    async function remove(id: string) {
        if (!confirm(t('common.confirm_delete', { defaultValue: 'Wirklich loeschen?' }))) return;
        try {
            await gateway.deleteSubject(jwt, id);
            await onChange();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }

    return (
        <div className="space-y-2">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <MaterialIcon name="info" size={12} className="-mt-0.5 mr-1 inline" />
                {t('stundenplan.subjects_tags_hint')}
            </div>
            {subjects.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    {t('stundenplan.stammdaten_subjects_empty')}
                </p>
            ) : (
                subjects.map((s) => (
                    <SubjectRow
                        key={s.id}
                        subject={s}
                        rooms={rooms}
                        jwt={jwt}
                        onChange={onChange}
                        editing={editingTagsFor === s.id}
                        onToggleEdit={() => setEditingTagsFor(editingTagsFor === s.id ? null : s.id)}
                        onRemove={() => remove(s.id)}
                    />
                ))
            )}
            {!showForm ? (
                <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    <MaterialIcon name="add" size={14} />
                    {t('stundenplan.stammdaten_subject_new')}
                </button>
            ) : (
                <div className="rounded-md border border-border p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_key')}</span>
                            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="MA, DE, BI..." className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono" />
                        </label>
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_label')}</span>
                            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mathematik" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        </label>
                    </div>
                    <label className="block text-xs">
                        <span className="text-muted-foreground">{t('stundenplan.subject_required_tags')}</span>
                        <input value={requiredTags} onChange={(e) => setRequiredTags(e.target.value)} placeholder="lab, sink" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono" />
                    </label>
                    <label className="block text-xs">
                        <span className="text-muted-foreground">{t('stundenplan.subject_preferred_tags')}</span>
                        <input value={preferredTags} onChange={(e) => setPreferredTags(e.target.value)} placeholder="beamer, computer" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono" />
                    </label>
                    <p className="text-[10px] text-muted-foreground">{t('stundenplan.subject_tags_placeholder_hint')}</p>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowForm(false)} className="rounded-md px-3 py-1 text-xs hover:bg-muted">{t('common.cancel', { defaultValue: 'Abbrechen' })}</button>
                        <button onClick={save} disabled={saving || !key.trim() || !label.trim()} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function SubjectRow({
    subject, rooms, jwt, onChange, editing, onToggleEdit, onRemove,
}: {
    subject: Subject;
    rooms: Room[];
    jwt: string;
    onChange: () => void;
    editing: boolean;
    onToggleEdit: () => void;
    onRemove: () => void;
}) {
    const t = useT();
    const [draftKey, setDraftKey] = useState(subject.key);
    const [draftLabel, setDraftLabel] = useState(subject.label);
    const [requiredTags, setRequiredTags] = useState((subject.requiredResourceTags ?? []).join(', '));
    const [preferredTags, setPreferredTags] = useState((subject.preferredResourceTags ?? []).join(', '));
    const [allowedRooms, setAllowedRooms] = useState<Set<string>>(new Set(subject.allowedRoomIds ?? []));
    const [saving, setSaving] = useState(false);

    function parseTags(s: string): string[] {
        return s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    }

    // Beim Auf-Klappen Drafts mit aktuellen Werten neu befuellen, falls die
    // Subject-Daten sich zwischenzeitlich geaendert haben.
    function startEdit() {
        setDraftKey(subject.key);
        setDraftLabel(subject.label);
        setRequiredTags((subject.requiredResourceTags ?? []).join(', '));
        setPreferredTags((subject.preferredResourceTags ?? []).join(', '));
        setAllowedRooms(new Set(subject.allowedRoomIds ?? []));
        onToggleEdit();
    }

    function toggleRoom(roomId: string) {
        const next = new Set(allowedRooms);
        if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
        setAllowedRooms(next);
    }

    async function saveAll() {
        if (!draftLabel.trim() || !draftKey.trim()) return;
        setSaving(true);
        try {
            const patch: { key?: string; label?: string; requiredResourceTags?: string[]; preferredResourceTags?: string[]; allowedRoomIds?: string[] } = {
                requiredResourceTags: parseTags(requiredTags),
                preferredResourceTags: parseTags(preferredTags),
                allowedRoomIds: [...allowedRooms],
            };
            if (draftKey.trim() !== subject.key) patch.key = draftKey.trim();
            if (draftLabel.trim() !== subject.label) patch.label = draftLabel.trim();
            await gateway.patchSubject(jwt, subject.id, patch);
            onToggleEdit();
            await onChange();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className={`rounded-md border ${editing ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
            <div className="flex items-center gap-2 px-3 py-2">
                <span className="inline-flex h-6 min-w-[50px] items-center justify-center rounded bg-muted px-2 text-[11px] font-mono text-muted-foreground">{subject.key}</span>
                <span className="flex-1 text-sm">{subject.label}</span>
                {/* Whitelist-Räume als violett-Chips */}
                {(subject.allowedRoomIds ?? []).length > 0 && (() => {
                    const labels = (subject.allowedRoomIds ?? [])
                        .map((id) => rooms.find((r) => r.id === id)?.label)
                        .filter(Boolean);
                    return (
                        <span
                            className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-900 dark:bg-purple-900/40 dark:text-purple-200"
                            title={`Whitelist: ${labels.join(', ')}`}
                        >
                            🏛 {labels.length} {labels.length === 1 ? 'Raum' : 'Räume'}
                        </span>
                    );
                })()}
                {(subject.requiredResourceTags ?? []).map((tag) => (
                    <span key={tag} className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-mono text-red-900 dark:bg-red-900/40 dark:text-red-200" title={t('stundenplan.subject_required_tags')}>
                        {tag}
                    </span>
                ))}
                {(subject.preferredResourceTags ?? []).map((tag) => (
                    <span key={tag} className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-mono text-blue-900 dark:bg-blue-900/40 dark:text-blue-200" title={t('stundenplan.subject_preferred_tags')}>
                        {tag}
                    </span>
                ))}
                <button
                    onClick={editing ? onToggleEdit : startEdit}
                    className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={editing ? 'Abbrechen' : 'Bearbeiten'}
                >
                    <MaterialIcon name={editing ? 'close' : 'edit'} size={14} />
                </button>
                <button onClick={onRemove} className="text-xs text-destructive hover:underline">
                    {t('common.delete', { defaultValue: 'Löschen' })}
                </button>
            </div>
            {editing && (
                <div className="border-t border-border bg-background/60 px-3 py-2 space-y-2">
                    <div className="grid grid-cols-[100px_1fr] gap-2">
                        <label className="block text-[11px]">
                            <span className="text-muted-foreground">Kürzel</span>
                            <input
                                value={draftKey}
                                onChange={(e) => setDraftKey(e.target.value.toUpperCase().slice(0, 8))}
                                placeholder="MA"
                                className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs font-mono uppercase"
                            />
                        </label>
                        <label className="block text-[11px]">
                            <span className="text-muted-foreground">Name</span>
                            <input
                                value={draftLabel}
                                onChange={(e) => setDraftLabel(e.target.value)}
                                placeholder="Mathematik"
                                className="mt-0.5 block w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                            />
                        </label>
                    </div>
                    {/* Raum-Whitelist — der eigentliche User-Wunsch */}
                    <div>
                        <div className="mb-1 flex items-baseline justify-between text-[11px]">
                            <span className="text-muted-foreground">
                                Erlaubte Räume <span className="opacity-60">— Fach läuft NUR in diesen</span>
                            </span>
                            {allowedRooms.size > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setAllowedRooms(new Set())}
                                    className="text-[10px] text-muted-foreground hover:underline"
                                >
                                    Auswahl löschen (= alle Räume erlaubt)
                                </button>
                            )}
                        </div>
                        {rooms.length === 0 ? (
                            <div className="rounded-md border border-dashed px-2 py-2 text-[11px] text-muted-foreground">
                                Noch keine Räume angelegt. Erst im Räume-Tab welche eintragen.
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {rooms.map((r) => {
                                    const active = allowedRooms.has(r.id);
                                    return (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => toggleRoom(r.id)}
                                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                                                active
                                                    ? 'border-purple-500 bg-purple-100 text-purple-900 dark:border-purple-400 dark:bg-purple-900/40 dark:text-purple-200'
                                                    : 'border-border bg-background hover:border-primary/40 hover:bg-muted/50'
                                            }`}
                                        >
                                            <MaterialIcon name={active ? 'check_box' : 'check_box_outline_blank'} size={12} />
                                            {r.label}
                                            {(r.resourceTags ?? []).length > 0 && (
                                                <span className="ml-1 text-[9px] opacity-60">{r.resourceTags.join(',')}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                            {allowedRooms.size === 0
                                ? '✓ Solver darf alle Räume nutzen (oder die per Tags gefilterten unten).'
                                : `✓ Solver darf NUR ${allowedRooms.size} von ${rooms.length} Räumen für dieses Fach nutzen.`}
                        </p>
                    </div>

                    <label className="block text-[11px]">
                        <span className="text-muted-foreground">Pflicht-Tags <span className="opacity-60">(zusätzlich — Raum MUSS sie haben)</span></span>
                        <input value={requiredTags} onChange={(e) => setRequiredTags(e.target.value)} placeholder="sporthalle, lab" className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs font-mono" />
                    </label>
                    <label className="block text-[11px]">
                        <span className="text-muted-foreground">Wunsch-Tags <span className="opacity-60">(nice to have)</span></span>
                        <input value={preferredTags} onChange={(e) => setPreferredTags(e.target.value)} placeholder="beamer, computer" className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs font-mono" />
                    </label>
                    <div className="flex justify-end gap-2">
                        <button onClick={onToggleEdit} className="rounded-md px-3 py-1 text-xs hover:bg-muted">{t('common.cancel', { defaultValue: 'Abbrechen' })}</button>
                        <button onClick={saveAll} disabled={saving || !draftKey.trim() || !draftLabel.trim()} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── PeriodSlots ─────────────────────────────────────────────────

function PeriodSlotsTab({ slots, jwt, onChange }: { slots: PeriodSlot[]; jwt: string; onChange: () => void }) {
    const t = useT();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ key: '', label: '', ordinal: 1, startsAt: '08:00', endsAt: '08:45', isBreak: false });
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            await gateway.createPeriodSlot(jwt, form);
            setForm({ key: '', label: '', ordinal: 1, startsAt: '08:00', endsAt: '08:45', isBreak: false });
            setShowForm(false);
            await onChange();
        } finally {
            setSaving(false);
        }
    }
    async function remove(id: string) {
        if (!confirm(t('common.confirm_delete', { defaultValue: 'Wirklich loeschen?' }))) return;
        try { await gateway.deletePeriodSlot(jwt, id); await onChange(); }
        catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    }
    async function toggleBreak(slot: PeriodSlot) {
        try { await gateway.patchPeriodSlot(jwt, slot.id, { isBreak: !slot.isBreak }); await onChange(); }
        catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    }
    const sorted = [...slots].sort((a, b) => a.ordinal - b.ordinal);

    return (
        <div className="space-y-2">
            {sorted.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{t('stundenplan.stammdaten_periods_empty')}</p>
            ) : sorted.map((s) => (
                <PeriodSlotRow key={s.id} slot={s} jwt={jwt} onChange={onChange} onDelete={() => remove(s.id)} onToggleBreak={() => toggleBreak(s)} t={t} />
            ))}
            {!showForm ? (
                <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    <MaterialIcon name="add" size={14} />
                    {t('stundenplan.stammdaten_period_new')}
                </button>
            ) : (
                <div className="rounded-md border border-border p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_key')}</span>
                            <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="p1" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono" />
                        </label>
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_ordinal')}</span>
                            <input type="number" min={1} value={form.ordinal} onChange={(e) => setForm({ ...form, ordinal: parseInt(e.target.value) || 1 })} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        </label>
                    </div>
                    <label className="block text-xs">
                        <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_label')}</span>
                        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="1. Stunde" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_starts_at')}</span>
                            <input value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} placeholder="08:00" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono" />
                        </label>
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_ends_at')}</span>
                            <input value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} placeholder="08:45" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono" />
                        </label>
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={form.isBreak} onChange={(e) => setForm({ ...form, isBreak: e.target.checked })} />
                        <span>{t('stundenplan.stammdaten_period_is_break_label')}</span>
                    </label>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowForm(false)} className="rounded-md px-3 py-1 text-xs hover:bg-muted">{t('common.cancel', { defaultValue: 'Abbrechen' })}</button>
                        <button onClick={save} disabled={saving || !form.key.trim() || !form.label.trim()} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Inline editierbare Zeile fuer einen Period-Slot ──────────
function PeriodSlotRow({ slot, jwt, onChange, onDelete, onToggleBreak, t }: {
    slot: PeriodSlot; jwt: string; onChange: () => Promise<void> | void;
    onDelete: () => void; onToggleBreak: () => void; t: (k: string, p?: Record<string, string>) => string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ label: slot.label, startsAt: slot.startsAt, endsAt: slot.endsAt, ordinal: slot.ordinal });
    const [saving, setSaving] = useState(false);
    const cancel = () => { setEditing(false); setDraft({ label: slot.label, startsAt: slot.startsAt, endsAt: slot.endsAt, ordinal: slot.ordinal }); };
    async function save() {
        if (saving) return;
        setSaving(true);
        try {
            await gateway.patchPeriodSlot(jwt, slot.id, {
                label: draft.label.trim(),
                startsAt: draft.startsAt,
                endsAt: draft.endsAt,
                ordinal: draft.ordinal,
            });
            setEditing(false);
            await onChange();
        } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
        finally { setSaving(false); }
    }
    if (editing) {
        return (
            <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${slot.isBreak ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20' : 'border-primary/40 bg-primary/5'}`}>
                <input type="number" min={1} value={draft.ordinal} onChange={(e) => setDraft({ ...draft, ordinal: parseInt(e.target.value) || 1 })} className="h-7 w-14 rounded border bg-background px-1.5 text-[12px] font-mono" />
                <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="h-7 flex-1 rounded border bg-background px-2 text-[12px]" />
                <input value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} placeholder="08:00" className="h-7 w-16 rounded border bg-background px-1.5 text-[12px] font-mono" />
                <input value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} placeholder="08:45" className="h-7 w-16 rounded border bg-background px-1.5 text-[12px] font-mono" />
                <button onClick={save} disabled={saving} className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}</button>
                <button onClick={cancel} className="text-[11px] text-muted-foreground hover:underline">{t('common.cancel', { defaultValue: 'Abbrechen' })}</button>
            </div>
        );
    }
    return (
        <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${slot.isBreak ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20' : 'border-border'}`}>
            <span className="inline-flex h-6 min-w-[40px] items-center justify-center rounded bg-muted px-2 text-[11px] font-mono text-muted-foreground">{slot.ordinal}.</span>
            <span className="flex-1 text-sm">{slot.label}</span>
            {slot.isBreak && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{t('stundenplan.stammdaten_period_is_break')}</span>}
            <span className="text-[11px] text-muted-foreground tabular-nums">{slot.startsAt}–{slot.endsAt}</span>
            <button onClick={() => setEditing(true)} className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Bearbeiten">
                <MaterialIcon name="edit" size={14} />
            </button>
            <button onClick={onToggleBreak} className="text-xs text-primary hover:underline">
                {slot.isBreak ? t('stundenplan.stammdaten_period_unmark_break') : t('stundenplan.stammdaten_period_mark_break')}
            </button>
            <button onClick={onDelete} className="text-xs text-destructive hover:underline">{t('common.delete', { defaultValue: 'Löschen' })}</button>
        </div>
    );
}

// ─── Non-Teaching Days (Ferien/Feiertage) ────────────────────────

function NonTeachingDaysTab({ jwt, onChange }: { jwt: string; onChange: () => void }) {
    const t = useT();
    const [days, setDays] = useState<import('@/gateways/platform/stundenplan-gateway').SchoolNonTeachingDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<{ date: string; rangeEndDate: string; reasonCategory: 'holiday_state' | 'holiday_school' | 'vacation' | 'conference_day' | 'other'; label: string }>({
        date: new Date().toISOString().slice(0, 10),
        rangeEndDate: '',
        reasonCategory: 'holiday_state',
        label: '',
    });
    const [saving, setSaving] = useState(false);

    async function reload() {
        setLoading(true);
        try {
            const r = await gateway.listNonTeachingDays(jwt);
            setDays(r.days);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { reload(); }, [jwt]); // eslint-disable-line react-hooks/exhaustive-deps

    async function save() {
        setSaving(true);
        try {
            await gateway.createNonTeachingDay(jwt, {
                date: form.date,
                rangeEndDate: form.rangeEndDate || undefined,
                reasonCategory: form.reasonCategory,
                label: form.label,
            });
            setForm({ date: new Date().toISOString().slice(0, 10), rangeEndDate: '', reasonCategory: 'holiday_state', label: '' });
            setShowForm(false);
            await reload();
            onChange();
        } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
        finally { setSaving(false); }
    }
    async function remove(id: string) {
        if (!confirm(t('common.confirm_delete', { defaultValue: 'Wirklich loeschen?' }))) return;
        try { await gateway.deleteNonTeachingDay(jwt, id); await reload(); onChange(); }
        catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    }

    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

    return (
        <div className="space-y-2">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 text-[11px] text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <MaterialIcon name="info" size={12} className="-mt-0.5 mr-1 inline" />
                {t('stundenplan.stammdaten_nonteach_hint')}
            </div>
            {loading ? (
                <p className="text-xs text-muted-foreground">…</p>
            ) : sorted.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{t('stundenplan.stammdaten_nonteach_empty')}</p>
            ) : sorted.map((d) => {
                const fromSchoolCal = d.source === 'school_calendar';
                return (
                    <div key={d.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${fromSchoolCal ? 'border-blue-200 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/10' : 'border-border'}`}>
                        <MaterialIcon name={fromSchoolCal ? 'calendar_month' : 'event_busy'} size={14} className="text-muted-foreground" />
                        <span className="font-mono text-[12px]">{d.date.slice(0, 10)}{d.rangeEndDate ? ` – ${d.rangeEndDate.slice(0, 10)}` : ''}</span>
                        <span className="flex-1 text-sm">{d.label}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {t(`stundenplan.nonteach_reason_${d.reasonCategory}` as never, { defaultValue: d.reasonCategory })}
                        </span>
                        {fromSchoolCal ? (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-900 dark:bg-blue-900/40 dark:text-blue-200" title={t('stundenplan.stammdaten_nonteach_source_school_title')}>
                                {t('stundenplan.stammdaten_nonteach_source_school')}
                            </span>
                        ) : (
                            <button onClick={() => remove(d.id)} className="text-xs text-destructive hover:underline">{t('common.delete', { defaultValue: 'Löschen' })}</button>
                        )}
                    </div>
                );
            })}
            {!showForm ? (
                <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    <MaterialIcon name="add" size={14} />
                    {t('stundenplan.stammdaten_nonteach_new')}
                </button>
            ) : (
                <div className="rounded-md border border-border p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_nonteach_field_date')}</span>
                            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        </label>
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_nonteach_field_until')}</span>
                            <input type="date" value={form.rangeEndDate} onChange={(e) => setForm({ ...form, rangeEndDate: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        </label>
                    </div>
                    <label className="block text-xs">
                        <span className="text-muted-foreground">{t('stundenplan.stammdaten_nonteach_field_reason')}</span>
                        <select value={form.reasonCategory} onChange={(e) => setForm({ ...form, reasonCategory: e.target.value as typeof form.reasonCategory })} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm">
                            <option value="holiday_state">{t('stundenplan.nonteach_reason_holiday_state')}</option>
                            <option value="holiday_school">{t('stundenplan.nonteach_reason_holiday_school')}</option>
                            <option value="vacation">{t('stundenplan.nonteach_reason_vacation')}</option>
                            <option value="conference_day">{t('stundenplan.nonteach_reason_conference_day')}</option>
                            <option value="other">{t('stundenplan.nonteach_reason_other')}</option>
                        </select>
                    </label>
                    <label className="block text-xs">
                        <span className="text-muted-foreground">{t('stundenplan.stammdaten_nonteach_field_label')}</span>
                        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t('stundenplan.stammdaten_nonteach_label_placeholder')} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                    </label>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowForm(false)} className="rounded-md px-3 py-1 text-xs hover:bg-muted">{t('common.cancel', { defaultValue: 'Abbrechen' })}</button>
                        <button onClick={save} disabled={saving || !form.date || !form.label.trim()} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Rooms ───────────────────────────────────────────────────────

function RoomsTab({ rooms, jwt, onChange }: { rooms: Room[]; jwt: string; onChange: () => void }) {
    const t = useT();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ label: '', building: '', floor: '', capacity: '', tagsCsv: '' });
    const [saving, setSaving] = useState(false);

    async function save() {
        if (!form.label.trim()) return;
        setSaving(true);
        try {
            const tags = form.tagsCsv.split(/[,;\n]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
            await gateway.createRoom(jwt, {
                label: form.label.trim(),
                building: form.building.trim() || undefined,
                floor: form.floor.trim() || undefined,
                capacity: form.capacity ? parseInt(form.capacity) : undefined,
                resourceTags: tags.length > 0 ? tags : undefined,
            });
            setForm({ label: '', building: '', floor: '', capacity: '', tagsCsv: '' });
            setShowForm(false);
            await onChange();
        } finally {
            setSaving(false);
        }
    }
    async function remove(id: string) {
        if (!confirm(t('common.confirm_delete', { defaultValue: 'Wirklich loeschen?' }))) return;
        try { await gateway.deleteRoom(jwt, id); await onChange(); }
        catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    }
    return (
        <div className="space-y-2">
            {rooms.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{t('stundenplan.stammdaten_rooms_empty')}</p>
            ) : rooms.map((r) => (
                <RoomRow key={r.id} room={r} jwt={jwt} onChange={onChange} onDelete={() => remove(r.id)} t={t} />
            ))}
            {!showForm ? (
                <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    <MaterialIcon name="add" size={14} />
                    {t('stundenplan.stammdaten_room_new')}
                </button>
            ) : (
                <div className="rounded-md border border-border p-3 space-y-2">
                    <label className="block text-xs">
                        <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_label')}</span>
                        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Raum 101" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_building')}</span>
                            <input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} placeholder="Hauptgebäude" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        </label>
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_floor')}</span>
                            <input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="EG" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        </label>
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_capacity')}</span>
                            <input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} type="number" min={0} placeholder="30" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        </label>
                    </div>
                    <label className="block text-xs">
                        <span className="text-muted-foreground">Tags (kommagetrennt)</span>
                        <input value={form.tagsCsv} onChange={(e) => setForm({ ...form, tagsCsv: e.target.value })} placeholder="sporthalle, eurythmiesaal, werkstatt" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        <span className="text-[10px] text-muted-foreground">Faecher mit gleichem requiredResourceTag nutzen diesen Raum bevorzugt.</span>
                    </label>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowForm(false)} className="rounded-md px-3 py-1 text-xs hover:bg-muted">{t('common.cancel', { defaultValue: 'Abbrechen' })}</button>
                        <button onClick={save} disabled={saving || !form.label.trim()} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Inline editierbare Zeile fuer einen Raum ────────────────────
function RoomRow({ room, jwt, onChange, onDelete, t }: {
    room: Room; jwt: string; onChange: () => Promise<void> | void;
    onDelete: () => void; t: (k: string, p?: Record<string, string>) => string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({
        label: room.label,
        building: room.building ?? '',
        floor: room.floor ?? '',
        capacity: room.capacity != null ? String(room.capacity) : '',
        tagsCsv: (room.resourceTags ?? []).join(', '),
    });
    const [saving, setSaving] = useState(false);
    const cancel = () => {
        setEditing(false);
        setDraft({
            label: room.label, building: room.building ?? '', floor: room.floor ?? '',
            capacity: room.capacity != null ? String(room.capacity) : '',
            tagsCsv: (room.resourceTags ?? []).join(', '),
        });
    };
    async function save() {
        if (saving || !draft.label.trim()) return;
        setSaving(true);
        try {
            const tags = draft.tagsCsv.split(/[,;\n]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
            const cap = draft.capacity.trim();
            await gateway.patchRoom(jwt, room.id, {
                label: draft.label.trim(),
                building: draft.building.trim() || null,
                floor: draft.floor.trim() || null,
                capacity: cap ? parseInt(cap, 10) : null,
                resourceTags: tags,
            });
            setEditing(false);
            await onChange();
        } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
        finally { setSaving(false); }
    }
    if (editing) {
        return (
            <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                <div className="flex items-center gap-2">
                    <MaterialIcon name="meeting_room" size={14} className="shrink-0 text-muted-foreground" />
                    <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Raum 101" className="h-7 flex-1 rounded border bg-background px-2 text-[12px]" />
                    <input value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} type="number" min={0} placeholder="Plaetze" className="h-7 w-20 rounded border bg-background px-1.5 text-[12px] tabular-nums" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input value={draft.building} onChange={(e) => setDraft({ ...draft, building: e.target.value })} placeholder="Gebaeude" className="h-7 rounded border bg-background px-2 text-[12px]" />
                    <input value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} placeholder="Stockwerk (EG, OG, …)" className="h-7 rounded border bg-background px-2 text-[12px]" />
                </div>
                <div>
                    <input value={draft.tagsCsv} onChange={(e) => setDraft({ ...draft, tagsCsv: e.target.value })} placeholder="Tags, kommagetrennt: sporthalle, eurythmiesaal, …" className="h-7 w-full rounded border bg-background px-2 text-[12px]" />
                    <span className="text-[10px] text-muted-foreground">Tags machen den Raum fuer Faecher mit gleichem requiredResourceTag verfuegbar.</span>
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={cancel} className="rounded-md px-3 py-1 text-xs hover:bg-muted">{t('common.cancel', { defaultValue: 'Abbrechen' })}</button>
                    <button onClick={save} disabled={saving || !draft.label.trim()} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}</button>
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
            <MaterialIcon name="meeting_room" size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{room.label}</span>
            {(room.resourceTags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {(room.resourceTags ?? []).map((tag) => (
                        <span key={tag} className="rounded-full bg-blue-100 px-1.5 py-0 text-[10px] text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">{tag}</span>
                    ))}
                </div>
            )}
            <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
                {room.building && <span>{room.building}{room.floor ? ` · ${room.floor}` : ''}</span>}
                {room.capacity != null && <span className="tabular-nums">{room.capacity} Plätze</span>}
            </span>
            <button onClick={() => setEditing(true)} className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Bearbeiten">
                <MaterialIcon name="edit" size={14} />
            </button>
            <button onClick={onDelete} className="text-xs text-destructive hover:underline">{t('common.delete', { defaultValue: 'Löschen' })}</button>
        </div>
    );
}

// ─── InstructionGroups ───────────────────────────────────────────

function GroupsTab({ groups, jwt, onChange }: { groups: InstructionGroup[]; jwt: string; onChange: () => void }) {
    const t = useT();

    // Klassen-Spaces (type='class') laden — fuer Quick-List + Dropdown im Form.
    const [classes, setClasses] = useState<Array<{ id: string; name: string; internalName: string | null }>>([]);
    const [classLoading, setClassLoading] = useState(true);
    useEffect(() => {
        let cancel = false;
        gateway
            .listClassSpaces(jwt)
            .then((r) => { if (!cancel) setClasses(r.classes); })
            .catch(() => {})
            .finally(() => { if (!cancel) setClassLoading(false); });
        return () => { cancel = true; };
    }, [jwt]);

    // Klassen-Quick-Add
    const [showClassForm, setShowClassForm] = useState(false);
    const [classFormName, setClassFormName] = useState('');
    const [classSaving, setClassSaving] = useState(false);
    const [classError, setClassError] = useState<string | null>(null);

    async function saveClass() {
        if (!classFormName.trim()) return;
        setClassError(null);
        setClassSaving(true);
        try {
            await gateway.createClassSpaceFromTemplate(jwt, {
                templateKey: 'class-standard',
                name: classFormName.trim(),
            });
            // Klassen neu laden
            const r = await gateway.listClassSpaces(jwt);
            setClasses(r.classes);
            setClassFormName('');
            setShowClassForm(false);
        } catch (e) {
            setClassError(e instanceof Error ? e.message : String(e));
        } finally {
            setClassSaving(false);
        }
    }

    // InstructionGroup-Form
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [groupForm, setGroupForm] = useState({
        classSpaceId: '',
        groupKey: '',
        label: '',
        splitType: 'full_class',
        groupIndex: '1',
        groupCount: '2',
        expectedSize: '',
    });
    const [groupSaving, setGroupSaving] = useState(false);
    const [groupError, setGroupError] = useState<string | null>(null);

    const needsClass = ['full_class', 'half', 'third', 'quarter', 'sport', 'religion', 'language', 'support'].includes(groupForm.splitType);
    const needsIndex = ['half', 'third', 'quarter'].includes(groupForm.splitType);

    // Bulk-Splitter: ½/⅓/¼ fuer mehrere Klassen auf einmal
    type BulkSplit = 'half' | 'third' | 'quarter';
    const BULK_CFG: Record<BulkSplit, { count: number; icon: string; title: string; short: string }> = {
        half: { count: 2, icon: '½', title: 'Halbe Klassen', short: 'h' },
        third: { count: 3, icon: '⅓', title: 'Drittel', short: 'd' },
        quarter: { count: 4, icon: '¼', title: 'Viertel', short: 'v' },
    };
    const [bulkSplit, setBulkSplit] = useState<BulkSplit | null>(null);
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkError, setBulkError] = useState<string | null>(null);
    const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

    function openBulk(type: BulkSplit) {
        setBulkSplit(type);
        setBulkSelected(new Set(classes.map((c) => c.id)));
        setBulkError(null);
        setBulkResult(null);
    }
    function closeBulk() {
        setBulkSplit(null);
        setBulkSelected(new Set());
        setBulkError(null);
        setBulkResult(null);
    }
    function toggleBulkClass(id: string) {
        setBulkSelected((s) => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }
    function slugify(s: string) {
        return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'klasse';
    }
    async function saveBulk() {
        if (!bulkSplit) return;
        const cfg = BULK_CFG[bulkSplit];
        if (bulkSelected.size === 0) {
            setBulkError(t('stundenplan.stammdaten_bulk_no_classes', { defaultValue: 'Mindestens eine Klasse auswaehlen.' }));
            return;
        }
        setBulkSaving(true);
        setBulkError(null);
        let created = 0;
        let skipped = 0;
        const errors: string[] = [];
        const ts = new Date().toISOString();
        for (const classId of Array.from(bulkSelected)) {
            const c = classes.find((x) => x.id === classId);
            if (!c) continue;
            const base = (c.internalName?.trim() || slugify(c.name));
            for (let i = 1; i <= cfg.count; i++) {
                try {
                    await gateway.createInstructionGroup(jwt, {
                        groupKey: `${base}-${cfg.short}${i}`,
                        label: `${c.name} (${i}/${cfg.count})`,
                        splitType: bulkSplit,
                        classSpaceId: classId,
                        groupIndex: i,
                        groupCount: cfg.count,
                        validFrom: ts,
                    });
                    created++;
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    if (/exists|duplicate|already|bereits|409/i.test(msg)) {
                        skipped++;
                    } else {
                        errors.push(`${c.name} (${i}/${cfg.count}): ${msg}`);
                    }
                }
            }
        }
        setBulkResult({ created, skipped, errors });
        setBulkSaving(false);
        await onChange();
    }

    async function saveGroup() {
        if (!groupForm.groupKey.trim() || !groupForm.label.trim()) return;
        if (needsClass && !groupForm.classSpaceId) {
            setGroupError(t('stundenplan.stammdaten_group_class_required'));
            return;
        }
        setGroupError(null);
        setGroupSaving(true);
        try {
            if (needsIndex) {
                // Halbiert/Gedrittelt/Geviertelt → ALLE Gruppen 1..N auf einmal anlegen.
                // groupKey wird zu "<key>-g<i>", Label zu "<label> (i/N)".
                const total = parseInt(groupForm.groupCount, 10);
                const baseKey = groupForm.groupKey.trim();
                const baseLabel = groupForm.label.trim();
                const ts = new Date().toISOString();
                for (let i = 1; i <= total; i++) {
                    await gateway.createInstructionGroup(jwt, {
                        groupKey: `${baseKey}-g${i}`,
                        label: `${baseLabel} (${i}/${total})`,
                        splitType: groupForm.splitType,
                        classSpaceId: groupForm.classSpaceId || undefined,
                        groupIndex: i,
                        groupCount: total,
                        expectedSize: groupForm.expectedSize ? parseInt(groupForm.expectedSize) : undefined,
                        validFrom: ts,
                    });
                }
            } else {
                await gateway.createInstructionGroup(jwt, {
                    groupKey: groupForm.groupKey.trim(),
                    label: groupForm.label.trim(),
                    splitType: groupForm.splitType,
                    classSpaceId: groupForm.classSpaceId || undefined,
                    expectedSize: groupForm.expectedSize ? parseInt(groupForm.expectedSize) : undefined,
                    validFrom: new Date().toISOString(),
                });
            }
            setGroupForm({ classSpaceId: '', groupKey: '', label: '', splitType: 'full_class', groupIndex: '1', groupCount: '2', expectedSize: '' });
            setShowGroupForm(false);
            await onChange();
        } catch (e) {
            setGroupError(e instanceof Error ? e.message : String(e));
        } finally {
            setGroupSaving(false);
        }
    }

    async function removeGroup(id: string) {
        if (!confirm(t('common.confirm_delete', { defaultValue: 'Wirklich loeschen?' }))) return;
        try {
            await gateway.deleteInstructionGroup(jwt, id);
            await onChange();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Wenn der Konflikt-Pfad „wird in N aktiven Eintraegen verwendet"
            // greift, dem User direkt die Alternative anbieten: Gruppe
            // deaktivieren statt loeschen. Das ist sauber, reversibel und
            // bricht keine veroeffentlichten Stunden.
            if (/aktiven Eintraegen verwendet/i.test(msg) || /wird in/i.test(msg)) {
                const ok = confirm(
                    `${msg}\n\n` +
                        t('stundenplan.stammdaten_group_offer_deactivate', {
                            defaultValue:
                                'Stattdessen die Gruppe DEAKTIVIEREN? Sie verschwindet aus den Dropdowns und Listen, ' +
                                'bestehende Stunden bleiben aber funktional und sichtbar. Du kannst sie spaeter wieder aktivieren.',
                        }),
                );
                if (ok) {
                    try {
                        await gateway.patchInstructionGroup(jwt, id, { active: false });
                        await onChange();
                        return;
                    } catch (err2) {
                        alert(err2 instanceof Error ? err2.message : String(err2));
                        return;
                    }
                }
                return;
            }
            alert(msg);
        }
    }

    async function setGroupActive(id: string, active: boolean) {
        try {
            await gateway.patchInstructionGroup(jwt, id, { active });
            await onChange();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }

    return (
        <div className="space-y-4">
            {/* ─── Klassen (Spaces type='class') ─────────────────── */}
            <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('stundenplan.stammdaten_classes_title')}
                </h4>
                <p className="text-[11px] text-muted-foreground">
                    {t('stundenplan.stammdaten_classes_hint')}
                </p>
                {classLoading ? (
                    <p className="text-xs text-muted-foreground">…</p>
                ) : classes.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                        {t('stundenplan.stammdaten_classes_empty')}
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {classes.map((c) => (
                            <li key={c.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs">
                                <MaterialIcon name="groups" size={14} className="text-muted-foreground" />
                                <span className="flex-1 font-medium">{c.name}</span>
                                {c.internalName && c.internalName !== c.name && (
                                    <span className="font-mono text-[10px] text-muted-foreground">({c.internalName})</span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {classError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{classError}</div>
                )}
                {!showClassForm ? (
                    <button onClick={() => setShowClassForm(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                        <MaterialIcon name="add" size={14} />
                        {t('stundenplan.stammdaten_class_new')}
                    </button>
                ) : (
                    <div className="rounded-md border border-border p-3 space-y-2">
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.stammdaten_class_name_label')}</span>
                            <input
                                autoFocus
                                value={classFormName}
                                onChange={(e) => setClassFormName(e.target.value)}
                                placeholder="z.B. 5a"
                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                            />
                        </label>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setShowClassForm(false); setClassError(null); }} className="rounded-md px-3 py-1 text-xs hover:bg-muted">
                                {t('common.cancel', { defaultValue: 'Abbrechen' })}
                            </button>
                            <button onClick={saveClass} disabled={classSaving || !classFormName.trim()} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                                {classSaving ? '…' : t('common.save', { defaultValue: 'Speichern' })}
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* ─── Lerngruppen (InstructionGroup) ──────────────────── */}
            <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('stundenplan.stammdaten_groups_title')}
                </h4>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                    {t('stundenplan.stammdaten_groups_hint')}
                </div>
                {groups.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{t('stundenplan.stammdaten_groups_empty')}</p>
                ) : groups.map((g) => (
                    <div key={g.id} className={cn('flex items-center gap-2 rounded-md border border-border px-3 py-2', !g.active && 'opacity-60 bg-muted/30')}>
                        <span className="inline-flex h-6 min-w-[60px] items-center justify-center rounded bg-muted px-2 text-[11px] font-mono text-muted-foreground">{g.groupKey}</span>
                        <span className="flex-1 text-sm">{g.label}</span>
                        <span className="text-[11px] text-muted-foreground">{g.splitType}</span>
                        {!g.active && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                {t('stundenplan.stammdaten_group_inactive_badge', { defaultValue: 'inaktiv' })}
                            </span>
                        )}
                        <button
                            onClick={() => setGroupActive(g.id, !g.active)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                            title={g.active ? t('stundenplan.stammdaten_group_deactivate', { defaultValue: 'Deaktivieren' }) : t('stundenplan.stammdaten_group_activate', { defaultValue: 'Aktivieren' })}
                        >
                            {g.active
                                ? t('stundenplan.stammdaten_group_deactivate', { defaultValue: 'Deaktivieren' })
                                : t('stundenplan.stammdaten_group_activate', { defaultValue: 'Aktivieren' })}
                        </button>
                        <button onClick={() => removeGroup(g.id)} className="text-xs text-destructive hover:underline">{t('common.delete', { defaultValue: 'Löschen' })}</button>
                    </div>
                ))}
                {groupError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{groupError}</div>
                )}
                {/* ── Bulk-Splitter: ½ / ⅓ / ¼ fuer mehrere Klassen auf einmal ── */}
                {bulkSplit ? (
                    <div className="rounded-md border-2 border-amber-300 bg-amber-50/40 p-3 dark:border-amber-700 dark:bg-amber-950/20">
                        <div className="mb-2 flex items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-amber-200 text-base font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                                {BULK_CFG[bulkSplit].icon}
                            </span>
                            <div className="flex-1">
                                <div className="text-sm font-semibold">{BULK_CFG[bulkSplit].title} erstellen</div>
                                <div className="text-[11px] text-muted-foreground">
                                    Pro ausgewählter Klasse werden {BULK_CFG[bulkSplit].count} Teilgruppen angelegt
                                    (z.B. „5a (1/{BULK_CFG[bulkSplit].count})", „(2/{BULK_CFG[bulkSplit].count})", …).
                                </div>
                            </div>
                        </div>

                        {bulkResult ? (
                            <div className="space-y-2">
                                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                                    <MaterialIcon name="check_circle" size={14} className="-mt-0.5 mr-1 inline" />
                                    <strong>{bulkResult.created}</strong> Gruppen angelegt
                                    {bulkResult.skipped > 0 && <>, <strong>{bulkResult.skipped}</strong> übersprungen (bereits vorhanden)</>}
                                    {bulkResult.errors.length > 0 && <>, <strong>{bulkResult.errors.length}</strong> Fehler</>}.
                                </div>
                                {bulkResult.errors.length > 0 && (
                                    <ul className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                                        {bulkResult.errors.slice(0, 8).map((e, i) => (<li key={i}>• {e}</li>))}
                                    </ul>
                                )}
                                <div className="flex justify-end">
                                    <button onClick={closeBulk} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted">Schließen</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="text-[11px] font-medium text-muted-foreground">
                                        Welche Klassen? ({bulkSelected.size} / {classes.length})
                                    </div>
                                    <div className="flex gap-2 text-[11px]">
                                        <button type="button" onClick={() => setBulkSelected(new Set(classes.map((c) => c.id)))} className="text-primary hover:underline">Alle</button>
                                        <span className="text-muted-foreground">·</span>
                                        <button type="button" onClick={() => setBulkSelected(new Set())} className="text-muted-foreground hover:text-foreground hover:underline">Keine</button>
                                    </div>
                                </div>
                                <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-border bg-background p-2 sm:grid-cols-3 md:grid-cols-4">
                                    {classes.length === 0 ? (
                                        <p className="col-span-full p-3 text-center text-xs text-muted-foreground">Keine Klassen vorhanden.</p>
                                    ) : classes.map((c) => {
                                        const checked = bulkSelected.has(c.id);
                                        return (
                                            <label key={c.id} className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors', checked ? 'bg-amber-100 dark:bg-amber-900/30' : 'hover:bg-muted')}>
                                                <input type="checkbox" checked={checked} onChange={() => toggleBulkClass(c.id)} className="h-3.5 w-3.5 accent-amber-600" />
                                                <span className="flex-1 truncate font-medium">{c.name}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                                {bulkError && (
                                    <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{bulkError}</div>
                                )}
                                <div className="mt-3 flex items-center justify-between">
                                    <div className="text-[11px] text-muted-foreground">
                                        Insgesamt: <strong>{bulkSelected.size * BULK_CFG[bulkSplit].count}</strong> Gruppen
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={closeBulk} className="rounded-md px-3 py-1 text-xs hover:bg-muted">Abbrechen</button>
                                        <button onClick={saveBulk} disabled={bulkSaving || bulkSelected.size === 0} className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                                            {bulkSaving ? 'Wird angelegt …' : `${bulkSelected.size} Klassen aufteilen`}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">Klassen aufteilen:</span>
                        <button onClick={() => openBulk('half')} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/30">
                            <span className="text-sm">½</span> Halbe Klassen
                        </button>
                        <button onClick={() => openBulk('third')} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/30">
                            <span className="text-sm">⅓</span> Drittel
                        </button>
                        <button onClick={() => openBulk('quarter')} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/30">
                            <span className="text-sm">¼</span> Viertel
                        </button>
                    </div>
                )}

                {!showGroupForm ? (
                    <button onClick={() => setShowGroupForm(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                        <MaterialIcon name="add" size={14} />
                        {t('stundenplan.stammdaten_group_new')}
                    </button>
                ) : (
                    <div className="rounded-md border border-border p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <label className="block text-xs">
                                <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_split_type')}</span>
                                <select value={groupForm.splitType} onChange={(e) => setGroupForm({ ...groupForm, splitType: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm">
                                    <option value="full_class">Ganze Klasse</option>
                                    <option value="half">Halbe Klasse</option>
                                    <option value="third">Drittel</option>
                                    <option value="quarter">Viertel</option>
                                    <option value="course">Kurs (klassenübergreifend)</option>
                                    <option value="elective">Wahlfach</option>
                                    <option value="sport">Sport</option>
                                    <option value="religion">Religion</option>
                                    <option value="language">Sprache</option>
                                    <option value="support">Förderung</option>
                                    <option value="upper_school_band">Oberstufen-Band</option>
                                    <option value="project">Projekt</option>
                                </select>
                            </label>
                            <label className="block text-xs">
                                <span className="text-muted-foreground">
                                    {t('stundenplan.stammdaten_field_class_space')}
                                    {needsClass && <span className="text-destructive"> *</span>}
                                </span>
                                <select
                                    value={groupForm.classSpaceId}
                                    onChange={(e) => setGroupForm({ ...groupForm, classSpaceId: e.target.value })}
                                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                                    disabled={!needsClass && groupForm.splitType !== 'course'}
                                >
                                    <option value="">— {t('stundenplan.stammdaten_field_class_none')} —</option>
                                    {classes.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="block text-xs">
                                <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_group_key')}</span>
                                <input value={groupForm.groupKey} onChange={(e) => setGroupForm({ ...groupForm, groupKey: e.target.value })} placeholder="z.B. 7a-voll" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono" />
                            </label>
                            <label className="block text-xs">
                                <span className="text-muted-foreground">{t('stundenplan.stammdaten_field_label')}</span>
                                <input value={groupForm.label} onChange={(e) => setGroupForm({ ...groupForm, label: e.target.value })} placeholder="z.B. Klasse 7a, ganze Gruppe" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                            </label>
                        </div>
                        {needsIndex && (
                            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                                <div className="mb-1 text-[11px] font-medium text-amber-900 dark:text-amber-200">
                                    Wieviele Teil-Gruppen?
                                </div>
                                <div className="flex gap-1">
                                    {[2, 3, 4].map((n) => (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setGroupForm({ ...groupForm, groupCount: String(n) })}
                                            className={`h-9 flex-1 rounded-md border text-sm font-medium transition-colors ${
                                                parseInt(groupForm.groupCount, 10) === n
                                                    ? 'border-amber-500 bg-amber-200 text-amber-900 dark:border-amber-400 dark:bg-amber-900/50 dark:text-amber-100'
                                                    : 'border-border bg-background hover:border-amber-300'
                                            }`}
                                        >
                                            {n === 2 ? '½ · 2 Gruppen' : n === 3 ? '⅓ · 3 Gruppen' : '¼ · 4 Gruppen'}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-2 text-[11px] text-amber-900 dark:text-amber-200">
                                    <MaterialIcon name="auto_fix_high" size={11} className="-mt-0.5 mr-0.5 inline" />
                                    Alle {groupForm.groupCount} Teil-Gruppen werden in einem Klick angelegt
                                    (z.B. „{groupForm.label || 'Label'} (1/{groupForm.groupCount})", „(2/{groupForm.groupCount})", …).
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setShowGroupForm(false); setGroupError(null); }} className="rounded-md px-3 py-1 text-xs hover:bg-muted">{t('common.cancel', { defaultValue: 'Abbrechen' })}</button>
                            <button onClick={saveGroup} disabled={groupSaving || !groupForm.groupKey.trim() || !groupForm.label.trim()} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{groupSaving ? '…' : t('common.save', { defaultValue: 'Speichern' })}</button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

// ─── StaffRoles (MD-1 Lehrer-Profile) ────────────────────────────

function StaffRolesTab({ staff, jwt, rooms, onChange }: { staff: StaffMember[]; jwt: string; rooms: Room[]; onChange: () => void }) {
    const t = useT();
    const [selected, setSelected] = useState<string | null>(null);
    const [addingRole, setAddingRole] = useState<FunctionalRole>('teacher');
    const [addingScope, setAddingScope] = useState('tenant');
    const [saving, setSaving] = useState(false);

    // Bei 50+ Mitarbeitern braucht man eine schnelle Sicht: Faecher + Rollen
    // direkt in der Zeile, plus Filter ueber alles.
    const [filter, setFilter] = useState('');
    const [allQuals, setAllQuals] = useState<import('@/gateways/platform/stundenplan-gateway').TeacherQualification[]>([]);
    const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
    const [qualsReloadTick, setQualsReloadTick] = useState(0);
    useEffect(() => {
        if (!jwt) return;
        let cancel = false;
        Promise.all([
            gateway.listTeacherQualifications(jwt),
            gateway.listSubjects(jwt),
        ]).then(([q, s]) => {
            if (cancel) return;
            setAllQuals(q.qualifications);
            setAllSubjects(s.subjects);
        }).catch(() => { /* silent */ });
        return () => { cancel = true; };
    }, [jwt, qualsReloadTick, staff]);
    const subjectById = useMemo(() => new Map(allSubjects.map((s) => [s.id, s])), [allSubjects]);
    const qualsByTeacher = useMemo(() => {
        const m = new Map<string, typeof allQuals>();
        for (const q of allQuals) {
            const arr = m.get(q.matrixUserId) ?? [];
            arr.push(q);
            m.set(q.matrixUserId, arr);
        }
        return m;
    }, [allQuals]);

    const onChangeWithReload = async () => {
        await onChange();
        setQualsReloadTick((n) => n + 1);
    };

    // Filter-Logik: Suche im Namen, in den Rollen-Labels und in den Fach-Labels.
    const filteredStaff = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return staff;
        return staff.filter((s) => {
            if ((s.displayName ?? '').toLowerCase().includes(q)) return true;
            if (shortLabel(s.matrixUserId).toLowerCase().includes(q)) return true;
            const roleHit = s.grants.some((g) => g.role.toLowerCase().includes(q));
            if (roleHit) return true;
            const subjLabels = (qualsByTeacher.get(s.matrixUserId) ?? [])
                .map((qual) => subjectById.get(qual.subjectId)?.label?.toLowerCase() ?? '');
            return subjLabels.some((l) => l.includes(q));
        });
    }, [staff, filter, qualsByTeacher, subjectById]);

    const selectedMember = staff.find((m) => m.matrixUserId === selected) ?? null;

    async function addRole() {
        if (!selectedMember) return;
        setSaving(true);
        try {
            await gateway.grantRole(jwt, {
                matrixUserId: selectedMember.matrixUserId,
                role: addingRole,
                scope: addingScope.trim() || 'tenant',
            });
            await onChange();
            setAddingScope('tenant');
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }
    async function revokeRole(grantId: string) {
        if (!confirm(t('stundenplan.staff_revoke_confirm'))) return;
        try {
            await gateway.revokeRole(jwt, grantId);
            await onChange();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }

    return (
        <div className="space-y-3">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                {t('stundenplan.staff_roles_hint')}
            </div>

            {/* Filter-Leiste — wichtig bei >50 Mitarbeitern */}
            {staff.length > 0 && (
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <MaterialIcon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Filter nach Name, Fach oder Rolle …"
                            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                        />
                        {filter && (
                            <button
                                type="button"
                                onClick={() => setFilter('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                            >
                                <MaterialIcon name="close" size={12} />
                            </button>
                        )}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {filter ? `${filteredStaff.length} / ${staff.length}` : `${staff.length} Mitarbeiter`}
                    </span>
                </div>
            )}

            {staff.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    {t('stundenplan.staff_empty')}
                </p>
            ) : filteredStaff.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Keine Treffer fuer „{filter}".
                </p>
            ) : (
                <div className="space-y-1">
                    {filteredStaff.map((s) => {
                        const userQuals = qualsByTeacher.get(s.matrixUserId) ?? [];
                        const isTeacher = s.grants.some((g) => g.role === 'teacher');
                        return (
                        <div
                            key={s.matrixUserId}
                            className={cn(
                                'rounded-md border border-border',
                                selected === s.matrixUserId ? 'border-primary/50 bg-primary/5' : '',
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => setSelected(selected === s.matrixUserId ? null : s.matrixUserId)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left"
                            >
                                <MaterialIcon name="person" size={14} className="text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-sm">
                                            {s.displayName ?? shortLabel(s.matrixUserId)}
                                        </span>
                                        {/* Fach-Chips direkt nach dem Namen */}
                                        {userQuals.length > 0 && userQuals.slice(0, 8).map((q) => {
                                            const subj = subjectById.get(q.subjectId);
                                            return (
                                                <span
                                                    key={q.id}
                                                    className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary"
                                                    title={`${subj?.label ?? q.subjectId}${q.gradeLevels?.length ? ` · Stufen: ${q.gradeLevels.join(', ')}` : ''}`}
                                                >
                                                    {subj?.label ?? q.subjectId}
                                                </span>
                                            );
                                        })}
                                        {userQuals.length > 8 && (
                                            <span className="text-[10px] text-muted-foreground">+{userQuals.length - 8}</span>
                                        )}
                                        {isTeacher && userQuals.length === 0 && (
                                            <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                Lehrer ohne Fach
                                            </span>
                                        )}
                                    </div>
                                    <div className="font-mono text-[10px] text-muted-foreground">{s.matrixUserId}</div>
                                </div>
                                {s.grants.length > 0 ? (
                                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                        {s.grants.length} {t('stundenplan.staff_roles_count_label')}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground">{t('stundenplan.staff_no_roles')}</span>
                                )}
                            </button>

                            {selected === s.matrixUserId && (
                                <div className="border-t border-border bg-background px-3 py-2 space-y-2">
                                    {/* MD-2 Qualifikationen */}
                                    <TeacherQualificationsSubPanel jwt={jwt} matrixUserId={s.matrixUserId} />

                                    {/* L-A Praeferenzen (Wunschstufen + Raumkontinuitaet) */}
                                    <TeacherPreferenceSubPanel jwt={jwt} matrixUserId={s.matrixUserId} rooms={rooms} />

                                    {/* MD-3 EmployeeDeputat (Bereich B, gegated) */}
                                    <EmployeeDeputatSubPanel jwt={jwt} matrixUserId={s.matrixUserId} />

                                    {/* Bestehende Rollen */}
                                    {s.grants.length > 0 && (
                                        <ul className="space-y-1">
                                            {s.grants.map((g) => (
                                                <li
                                                    key={g.id}
                                                    className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"
                                                >
                                                    <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[11px] font-medium">
                                                        {t(`stundenplan.role_${g.role}` as never, { defaultValue: g.role })}
                                                    </span>
                                                    {g.scope !== 'tenant' && (
                                                        <span className="font-mono text-muted-foreground">{g.scope}</span>
                                                    )}
                                                    <span className="ml-auto">
                                                        <button
                                                            onClick={() => revokeRole(g.id)}
                                                            className="text-destructive hover:underline"
                                                        >
                                                            {t('common.revoke', { defaultValue: 'Entziehen' })}
                                                        </button>
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {/* Neue Rolle hinzufügen */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <label className="block text-xs">
                                            <span className="text-muted-foreground">{t('stundenplan.staff_role_field')}</span>
                                            <select
                                                value={addingRole}
                                                onChange={(e) => setAddingRole(e.target.value as FunctionalRole)}
                                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                                            >
                                                {ROLE_OPTIONS.map((r) => (
                                                    <option key={r} value={r}>
                                                        {t(`stundenplan.role_${r}` as never, { defaultValue: r })}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="block text-xs">
                                            <span className="text-muted-foreground">{t('stundenplan.staff_scope_field')}</span>
                                            <input
                                                value={addingScope}
                                                onChange={(e) => setAddingScope(e.target.value)}
                                                placeholder="tenant / klasse:7a / fach:MA"
                                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono"
                                            />
                                        </label>
                                        <button
                                            onClick={addRole}
                                            disabled={saving}
                                            className="self-end rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            {saving ? '…' : t('stundenplan.staff_grant_add')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function shortLabel(matrixUserId: string): string {
    const at = matrixUserId.indexOf(':');
    return at > 0 ? matrixUserId.slice(0, at) : matrixUserId;
}

// ─── Auto-Mode 0a Stundentafel-Tab ────────────────────────────────

function StundentafelTab({ jwt, subjects, groups }: { jwt: string; subjects: Subject[]; groups: InstructionGroup[] }) {
    const t = useT();
    const [entries, setEntries] = useState<import('@/gateways/platform/stundenplan-gateway').SubjectGradeHoursEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [editingCell, setEditingCell] = useState<{ subjectId: string; value: string } | null>(null);
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [showLehrplanDialog, setShowLehrplanDialog] = useState(false);

    // Klassen-Spaces aus InstructionGroups ableiten — jede Gruppe mit splitType='full_class' hat ein classSpaceId
    const classSpaces = useMemo(() => {
        const m = new Map<string, { id: string; label: string }>();
        for (const g of groups) {
            if (g.classSpaceId) {
                m.set(g.classSpaceId, { id: g.classSpaceId, label: g.label.replace(/ \(.*\)$/, '') });
            }
        }
        return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [groups]);

    async function reload() {
        setLoading(true);
        try {
            const r = await gateway.listSubjectGradeHours(jwt);
            setEntries(r.entries);
        } finally { setLoading(false); }
    }
    useEffect(() => { reload(); }, [jwt]); // eslint-disable-line react-hooks/exhaustive-deps

    // Wenn noch keine Klasse gewählt: erste verfügbare auswählen
    useEffect(() => {
        if (!selectedClassId && classSpaces.length > 0) {
            setSelectedClassId(classSpaces[0]!.id);
        }
    }, [classSpaces, selectedClassId]);

    const entriesForClass = useMemo(() => {
        const m = new Map<string, import('@/gateways/platform/stundenplan-gateway').SubjectGradeHoursEntry>();
        for (const e of entries) {
            if (e.classSpaceId === selectedClassId) m.set(e.subjectId, e);
        }
        return m;
    }, [entries, selectedClassId]);

    const totalHours = useMemo(() => {
        let sum = 0;
        entriesForClass.forEach((e) => { sum += Number(e.weeklyHours); });
        return sum;
    }, [entriesForClass]);

    async function saveCell(subjectId: string, valueStr: string) {
        const value = parseFloat(valueStr.replace(',', '.'));
        if (isNaN(value)) {
            setEditingCell(null);
            return;
        }
        const existing = entriesForClass.get(subjectId);
        try {
            if (value === 0 && existing) {
                await gateway.deleteSubjectGradeHours(jwt, existing.id);
            } else if (value > 0) {
                await gateway.upsertSubjectGradeHours(jwt, {
                    classSpaceId: selectedClassId,
                    subjectId,
                    weeklyHours: value,
                    preferDoubleSlot: existing?.preferDoubleSlot ?? false,
                });
            }
            setEditingCell(null);
            await reload();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }

    async function toggleDoubleSlot(entry: import('@/gateways/platform/stundenplan-gateway').SubjectGradeHoursEntry) {
        try {
            await gateway.upsertSubjectGradeHours(jwt, {
                classSpaceId: entry.classSpaceId,
                subjectId: entry.subjectId,
                weeklyHours: Number(entry.weeklyHours),
                preferDoubleSlot: !entry.preferDoubleSlot,
            });
            await reload();
        } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    }

    if (loading) return <p className="text-xs text-muted-foreground">…</p>;
    if (classSpaces.length === 0) {
        return (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                {t('stundenplan.stundentafel_no_classes')}
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <MaterialIcon name="info" size={14} className="-mt-0.5 mr-1 inline" />
                {t('stundenplan.stundentafel_hint')}
            </div>

            {/* Klassen-Wahl + Bulk-Kopie */}
            <div className="flex items-center gap-2">
                <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                    {classSpaces.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                </select>
                <span className="text-xs text-muted-foreground">
                    {t('stundenplan.stundentafel_total')}: <strong>{totalHours.toFixed(1)} h/Woche</strong>
                </span>
                <button
                    onClick={() => setShowLehrplanDialog(true)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10"
                    title={t('stundenplan.lehrplan_button_title')}
                >
                    <MaterialIcon name="library_books" size={14} />
                    {t('stundenplan.lehrplan_button')}
                </button>
                <button
                    onClick={() => setShowCopyDialog(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                    title={t('stundenplan.stundentafel_copy_title')}
                >
                    <MaterialIcon name="content_copy" size={14} />
                    {t('stundenplan.stundentafel_copy_button')}
                </button>
            </div>

            {/* Matrix-Editor: Fach × Stunden */}
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1.5 pr-2 font-medium">{t('stundenplan.stundentafel_col_subject')}</th>
                        <th className="py-1.5 pr-2 font-medium w-24">{t('stundenplan.stundentafel_col_hours')}</th>
                        <th className="py-1.5 font-medium">{t('stundenplan.stundentafel_col_double')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                    {subjects.sort((a, b) => a.label.localeCompare(b.label)).map((s) => {
                        const entry = entriesForClass.get(s.id);
                        const isEditing = editingCell?.subjectId === s.id;
                        return (
                            <tr key={s.id} className="hover:bg-muted/30">
                                <td className="py-1.5 pr-2">
                                    <span className="font-medium">{s.label}</span>
                                    <span className="ml-1 text-[10px] font-mono text-muted-foreground">({s.key})</span>
                                </td>
                                <td className="py-1.5 pr-2">
                                    {isEditing ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            inputMode="decimal"
                                            value={editingCell.value}
                                            onChange={(e) => setEditingCell({ subjectId: s.id, value: e.target.value })}
                                            onBlur={() => saveCell(s.id, editingCell.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveCell(s.id, editingCell.value);
                                                if (e.key === 'Escape') setEditingCell(null);
                                            }}
                                            className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-sm font-mono"
                                        />
                                    ) : (
                                        <button
                                            onClick={() => setEditingCell({ subjectId: s.id, value: entry ? String(Number(entry.weeklyHours)) : '' })}
                                            className={`w-16 rounded border border-transparent px-1.5 py-0.5 text-left text-sm font-mono hover:border-input hover:bg-background ${entry ? '' : 'text-muted-foreground/40'}`}
                                        >
                                            {entry ? Number(entry.weeklyHours).toFixed(1) : '—'}
                                        </button>
                                    )}
                                </td>
                                <td className="py-1.5">
                                    {entry && (
                                        <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={entry.preferDoubleSlot}
                                                onChange={() => toggleDoubleSlot(entry)}
                                            />
                                            <span className="text-muted-foreground">{t('stundenplan.stundentafel_prefer_double')}</span>
                                        </label>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {showCopyDialog && (
                <CopyStundentafelDialog
                    jwt={jwt}
                    sourceClassId={selectedClassId}
                    sourceClassLabel={classSpaces.find((c) => c.id === selectedClassId)?.label ?? ''}
                    allClasses={classSpaces}
                    onClose={() => setShowCopyDialog(false)}
                    onCopied={async () => { setShowCopyDialog(false); await reload(); }}
                />
            )}

            {showLehrplanDialog && (
                <LehrplanImportDialog
                    jwt={jwt}
                    classes={classSpaces.map((c) => ({ classSpaceId: c.id, name: c.label }))}
                    onClose={() => setShowLehrplanDialog(false)}
                    onApplied={() => { reload(); }}
                />
            )}
        </div>
    );
}

function CopyStundentafelDialog({
    jwt, sourceClassId, sourceClassLabel, allClasses, onClose, onCopied,
}: {
    jwt: string;
    sourceClassId: string;
    sourceClassLabel: string;
    allClasses: Array<{ id: string; label: string }>;
    onClose: () => void;
    onCopied: () => void;
}) {
    const t = useT();
    const [targetIds, setTargetIds] = useState<Set<string>>(new Set());
    const [overwrite, setOverwrite] = useState(false);
    const [working, setWorking] = useState(false);
    const [result, setResult] = useState<{ copied: number; skipped: number; removed?: number } | null>(null);

    function toggle(id: string) {
        const next = new Set(targetIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setTargetIds(next);
    }

    async function doCopy(forceOverwrite?: boolean) {
        if (targetIds.size === 0) return;
        setWorking(true);
        try {
            const useOverwrite = forceOverwrite ?? overwrite;
            const r = await gateway.copySubjectGradeHours(jwt, {
                sourceClassSpaceId: sourceClassId,
                targetClassSpaceIds: Array.from(targetIds),
                overwrite: useOverwrite,
            });
            setResult(r);
            if (forceOverwrite) setOverwrite(true);
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setWorking(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-lg bg-background p-4 shadow-xl space-y-3">
                <h3 className="text-lg font-semibold">{t('stundenplan.stundentafel_copy_dialog_title')}</h3>
                <p className="text-xs text-muted-foreground">
                    {t('stundenplan.stundentafel_copy_dialog_from', { defaultValue: 'Quelle' })}: <strong>{sourceClassLabel}</strong>
                </p>

                {result ? (
                    result.copied === 0 && result.skipped > 0 ? (
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30 space-y-2">
                            <div>
                                <MaterialIcon name="warning" size={14} className="-mt-0.5 mr-1 inline text-amber-700 dark:text-amber-300" />
                                <strong>Nichts kopiert.</strong> Die Ziel-Klasse(n) hatten bereits {result.skipped} eigene Eintraege.
                                Damit sie überschrieben werden, aktiviere „Bestehende Eintraege überschreiben" und klicke nochmal.
                            </div>
                            <button
                                onClick={() => { setResult(null); doCopy(true); }}
                                disabled={working}
                                className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                                <MaterialIcon name="content_copy" size={12} />
                                {working ? '…' : `Jetzt überschreiben (${targetIds.size} Klasse${targetIds.size === 1 ? '' : 'n'})`}
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                            ✓ <strong>{result.copied}</strong> {t('stundenplan.stundentafel_copied')}
                            {result.skipped > 0 ? <>, <strong>{result.skipped}</strong> {t('stundenplan.bulk_skipped')}</> : ''}
                            {result.removed && result.removed > 0 ? <>, <strong>{result.removed}</strong> ueberzaehlige Eintraege in Ziel-Klasse(n) entfernt</> : ''}.
                        </div>
                    )
                ) : (
                    <>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">{t('stundenplan.stundentafel_copy_targets')}:</p>
                            <div className="max-h-60 overflow-y-auto rounded-md border border-border">
                                {allClasses.filter((c) => c.id !== sourceClassId).map((c) => (
                                    <label key={c.id} className="flex items-center gap-2 px-2 py-1 hover:bg-muted/40 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={targetIds.has(c.id)}
                                            onChange={() => toggle(c.id)}
                                        />
                                        <span className="text-sm">{c.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs cursor-pointer">
                            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="mt-0.5" />
                            <div className="flex-1">
                                <div className="font-medium">{t('stundenplan.stundentafel_copy_overwrite')}</div>
                                <div className="text-[10px] text-muted-foreground">
                                    Mit Haken: Ziel-Klasse(n) werden zu einem <strong>1:1-Klon</strong> der Quelle — bestehende Eintraege werden überschrieben,
                                    Faecher, die nur in der Ziel-Klasse stehen, werden geloescht. Ohne Haken: existierende Eintraege bleiben erhalten,
                                    es werden nur fehlende ergaenzt.
                                </div>
                            </div>
                        </label>
                    </>
                )}

                <div className="flex justify-end gap-2 pt-1">
                    <button onClick={result ? onCopied : onClose} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">
                        {result ? t('common.close', { defaultValue: 'Schliessen' }) : t('common.cancel', { defaultValue: 'Abbrechen' })}
                    </button>
                    {!result && (
                        <button
                            onClick={() => doCopy()}
                            disabled={working || targetIds.size === 0}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            <MaterialIcon name="content_copy" size={14} />
                            {working ? '…' : t('stundenplan.stundentafel_copy_action', { defaultValue: 'Kopieren' })}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── L-C TenantSchedulingPolicy — Plan-Regeln-Tab ─────────────────

function PlanRulesTab({ jwt, rooms, onChange }: { jwt: string; rooms: Room[]; onChange: () => void }) {
    void rooms; void onChange;
    const t = useT();
    const [policy, setPolicy] = useState<import('@/gateways/platform/stundenplan-gateway').SchedulingPolicy | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [maxFree, setMaxFree] = useState(2);
    const [lunchMin, setLunchMin] = useState(30);
    const [maxBlock, setMaxBlock] = useState(4);
    const [earliest, setEarliest] = useState('08:00');
    const [latest, setLatest] = useState('16:00');
    const [enRhy, setEnRhy] = useState(true);
    const [enHw, setEnHw] = useState(true);

    async function load() {
        setLoading(true);
        try {
            const r = await gateway.getSchedulingPolicy(jwt);
            setPolicy(r.policy);
            setMaxFree(r.policy.maxFreePeriodsPerDay);
            setLunchMin(r.policy.minLunchBreakMin);
            setMaxBlock(r.policy.maxConsecutiveBlocks);
            setEarliest(r.policy.earliestStartTime);
            setLatest(r.policy.latestEndTime);
            setEnRhy(r.policy.enableRhythmization);
            setEnHw(r.policy.enableHomeworkBalance);
        } finally { setLoading(false); }
    }
    useEffect(() => { load(); }, [jwt]); // eslint-disable-line react-hooks/exhaustive-deps

    async function save() {
        setSaving(true);
        try {
            const r = await gateway.upsertSchedulingPolicy(jwt, {
                maxFreePeriodsPerDay: maxFree,
                minLunchBreakMin: lunchMin,
                maxConsecutiveBlocks: maxBlock,
                earliestStartTime: earliest,
                latestEndTime: latest,
                enableRhythmization: enRhy,
                enableHomeworkBalance: enHw,
            });
            setPolicy(r.policy);
        } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
        finally { setSaving(false); }
    }

    if (loading) return <p className="text-xs text-muted-foreground">…</p>;

    return (
        <div className="space-y-3">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <MaterialIcon name="info" size={14} className="-mt-0.5 mr-1 inline" />
                {t('stundenplan.plan_rules_hint')}
            </div>

            <Section title={t('stundenplan.plan_rules_section_load')}>
                <NumberRow label={t('stundenplan.plan_rules_max_free')} value={maxFree} onChange={setMaxFree} min={0} max={10} suffix={t('stundenplan.plan_rules_suffix_per_day')} />
                <NumberRow label={t('stundenplan.plan_rules_max_block')} value={maxBlock} onChange={setMaxBlock} min={1} max={12} suffix={t('stundenplan.plan_rules_suffix_blocks')} />
                <NumberRow label={t('stundenplan.plan_rules_min_lunch')} value={lunchMin} onChange={setLunchMin} min={0} max={240} suffix={t('stundenplan.plan_rules_suffix_minutes')} />
            </Section>

            <Section title={t('stundenplan.plan_rules_section_times')}>
                <TimeRow label={t('stundenplan.plan_rules_earliest')} value={earliest} onChange={setEarliest} />
                <TimeRow label={t('stundenplan.plan_rules_latest')} value={latest} onChange={setLatest} />
            </Section>

            <Section title={t('stundenplan.plan_rules_section_pedagogy')}>
                <CheckboxRow label={t('stundenplan.plan_rules_rhy')} value={enRhy} onChange={setEnRhy} />
                <CheckboxRow label={t('stundenplan.plan_rules_hw')} value={enHw} onChange={setEnHw} />
            </Section>

            <Section title="Raum-Belegung">
                <div className="space-y-1.5 px-3 py-2 text-[12px]">
                    <div className="flex items-start gap-2">
                        <MaterialIcon name="rule" size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                        <div className="flex-1">
                            <div className="font-medium">Stammraum-Bevorzugung (aktiv)</div>
                            <div className="text-[11px] text-muted-foreground">
                                Der Solver pinnt jedes Fach automatisch ins Klassenzimmer der Klasse — ausser das Fach
                                hat eine eigene Raum-Whitelist (im Fächer-Tab) oder Pflicht-Tags. Sport, Eurythmie,
                                Werken &amp; Co. landen so in ihren Spezialräumen, alles andere im Stammraum.
                            </div>
                            <div className="mt-1.5 text-[10px] text-muted-foreground">
                                Voraussetzung: pro Klasse ein Stammraum in der „Voraus-Zuweisung" gesetzt.
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            <div className="flex justify-end gap-2 pt-1">
                <button onClick={save} disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    <MaterialIcon name="save" size={14} />
                    {saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}
                </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
                {policy?.updatedAt ? `${t('stundenplan.plan_rules_last_updated')}: ${new Date(policy.updatedAt).toLocaleString()}` : t('stundenplan.plan_rules_defaults')}
            </p>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
            <div className="space-y-1.5">{children}</div>
        </div>
    );
}

function NumberRow({ label, value, onChange, min, max, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; suffix?: string }) {
    return (
        <label className="flex items-center gap-2 text-sm">
            <span className="flex-1">{label}</span>
            <input
                type="number"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm"
            />
            {suffix && <span className="w-16 text-xs text-muted-foreground">{suffix}</span>}
        </label>
    );
}

function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <label className="flex items-center gap-2 text-sm">
            <span className="flex-1">{label}</span>
            <input
                type="time"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm font-mono"
            />
        </label>
    );
}

function CheckboxRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
            <span className="flex-1">{label}</span>
        </label>
    );
}

// ─── L-A TeacherPreference — Sub-Panel (Wunschstufen + Raumwunsch) ──

// Klassenstufen-Baender werden ab Phase „Stammdaten-editierbar" pro Tenant
// in der grade_band-Tabelle gepflegt. STAGE_OPTIONS bleibt als Fallback,
// wird aber nicht mehr aktiv genutzt — TeacherPreferenceSubPanel laedt
// die Baender dynamisch via gateway.listGradeBands.

function TeacherPreferenceSubPanel({ jwt, matrixUserId, rooms }: { jwt: string; matrixUserId: string; rooms: Room[] }) {
    const t = useT();
    const [pref, setPref] = useState<import('@/gateways/platform/stundenplan-gateway').TeacherPreference | null>(null);
    const [stages, setStages] = useState<string[]>([]);
    const [bands, setBands] = useState<import('@/gateways/platform/stundenplan-gateway').GradeBand[]>([]);
    const [roomId, setRoomId] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try {
            const [prefR, bandsR] = await Promise.all([
                gateway.getTeacherPreference(jwt, matrixUserId),
                gateway.listGradeBands(jwt),
            ]);
            setPref(prefR.preference);
            setBands(bandsR.gradeBands);
            if (prefR.preference) {
                setStages(prefR.preference.preferredGradeStages);
                setRoomId(prefR.preference.preferredRoomId ?? '');
                setNotes(prefR.preference.notes ?? '');
            }
        } finally { setLoading(false); }
    }
    useEffect(() => { load(); }, [jwt, matrixUserId]); // eslint-disable-line react-hooks/exhaustive-deps

    function toggleStage(s: string) {
        setStages(stages.includes(s) ? stages.filter((x) => x !== s) : [...stages, s]);
    }

    async function save() {
        setSaving(true);
        try {
            const r = await gateway.upsertTeacherPreference(jwt, {
                matrixUserId,
                preferredGradeStages: stages,
                preferredRoomId: roomId || null,
                notes: notes || null,
            });
            setPref(r.preference);
        } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
        finally { setSaving(false); }
    }

    if (loading) return <p className="text-[11px] text-muted-foreground">…</p>;

    return (
        <div className="rounded-md border border-violet-200 bg-violet-50/30 p-2 dark:border-violet-900/40 dark:bg-violet-950/10">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-900 dark:text-violet-200">
                {t('stundenplan.pref_section_title')}
            </div>
            <div className="space-y-1.5">
                <div>
                    <span className="block text-[11px] text-muted-foreground">{t('stundenplan.pref_field_stages')}</span>
                    {bands.length === 0 ? (
                        <p className="mt-1 text-[11px] italic text-muted-foreground">
                            Noch keine Klassenstufen definiert — in Stammdaten → Klassenstufen anlegen.
                        </p>
                    ) : (
                        <div className="mt-1 flex flex-wrap gap-1">
                            {bands.map((band) => {
                                const selected = stages.includes(band.key);
                                return (
                                    <button
                                        key={band.id}
                                        type="button"
                                        onClick={() => toggleStage(band.key)}
                                        className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                                    >
                                        {band.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                <label className="block text-[11px]">
                    <span className="text-muted-foreground">{t('stundenplan.pref_field_room')}</span>
                    <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs">
                        <option value="">— {t('stundenplan.pref_no_room')} —</option>
                        {rooms.map((r) => (
                            <option key={r.id} value={r.id}>{r.label}{r.building ? ` · ${r.building}` : ''}</option>
                        ))}
                    </select>
                </label>
                <label className="block text-[11px]">
                    <span className="text-muted-foreground">{t('stundenplan.pref_field_notes')}</span>
                    <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('stundenplan.pref_notes_placeholder')} className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs" />
                </label>
                <div className="flex justify-end">
                    <button onClick={save} disabled={saving} className="rounded-md bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {saving ? '…' : pref ? t('common.update', { defaultValue: 'Aktualisieren' }) : t('common.save', { defaultValue: 'Speichern' })}
                    </button>
                </div>
                <p className="text-[10px] text-muted-foreground">{t('stundenplan.pref_hint')}</p>
            </div>
        </div>
    );
}

// ─── MD-3 EmployeeDeputat — Sub-Panel (Bereich B, gegated) ────────

function EmployeeDeputatSubPanel({ jwt, matrixUserId }: { jwt: string; matrixUserId: string }) {
    const t = useT();
    const [deputat, setDeputat] = useState<import('@/gateways/platform/stundenplan-gateway').EmployeeDeputat | null>(null);
    const [gateBlocked, setGateBlocked] = useState(false);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [contracted, setContracted] = useState(25);
    const [fte, setFte] = useState(100);
    const [reduction, setReduction] = useState(0);
    const [reductionReason, setReductionReason] = useState('');
    const [saving, setSaving] = useState(false);

    async function load() {
        setLoading(true);
        setGateBlocked(false);
        try {
            const r = await gateway.listEmployeeDeputats(jwt);
            const mine = r.deputats.find((d) => d.matrixUserId === matrixUserId);
            if (mine) {
                setDeputat(mine);
                setContracted(Number(mine.contractedHoursWeek));
                setFte(mine.ftePercent);
                setReduction(Number(mine.reductionHoursWeek));
                setReductionReason(mine.reductionReason ?? '');
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/DPO_RELEASE_REQUIRED|403/.test(msg)) {
                setGateBlocked(true);
            }
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, [jwt, matrixUserId]); // eslint-disable-line react-hooks/exhaustive-deps

    async function save() {
        setSaving(true);
        try {
            await gateway.upsertEmployeeDeputat(jwt, {
                matrixUserId,
                contractedHoursWeek: contracted,
                ftePercent: fte,
                reductionHoursWeek: reduction,
                reductionReason: reductionReason || undefined,
            });
            setEditing(false);
            await load();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    if (loading) return null;

    // Gate nicht approved → freundlicher Disclaimer, kein UI-Stub
    if (gateBlocked) {
        return (
            <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2 dark:border-amber-900/40 dark:bg-amber-950/10">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                    {t('stundenplan.deputat_section_title')}
                </div>
                <p className="mt-1 text-[11px] text-amber-900/80 dark:text-amber-200/80">
                    <MaterialIcon name="lock" size={12} className="-mt-0.5 mr-1 inline" />
                    {t('stundenplan.deputat_gated')}
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-md border border-rose-200 bg-rose-50/30 p-2 dark:border-rose-900/40 dark:bg-rose-950/10">
            <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-900 dark:text-rose-200">
                    {t('stundenplan.deputat_section_title')}
                </div>
                {!editing && deputat && (
                    <button onClick={() => setEditing(true)} className="text-[11px] text-primary hover:underline">
                        {t('common.edit', { defaultValue: 'Bearbeiten' })}
                    </button>
                )}
            </div>

            {!editing && !deputat && (
                <button
                    onClick={() => setEditing(true)}
                    className="mt-1 inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-0.5 text-[11px] hover:bg-rose-100/40"
                >
                    <MaterialIcon name="add" size={12} />
                    {t('stundenplan.deputat_add')}
                </button>
            )}

            {!editing && deputat && (
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">{t('stundenplan.deputat_field_hours')}</span>
                    <span>{Number(deputat.contractedHoursWeek)} h/Woche · {deputat.ftePercent}%</span>
                    {Number(deputat.reductionHoursWeek) > 0 && (
                        <>
                            <span className="text-muted-foreground">{t('stundenplan.deputat_field_reduction')}</span>
                            <span>−{Number(deputat.reductionHoursWeek)} h ({deputat.reductionReason ?? '—'})</span>
                        </>
                    )}
                </div>
            )}

            {editing && (
                <div className="mt-1 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                        <label className="block text-[11px]">
                            <span className="text-muted-foreground">{t('stundenplan.deputat_field_hours')}</span>
                            <input
                                type="number"
                                step="0.5"
                                min={0}
                                max={60}
                                value={contracted}
                                onChange={(e) => setContracted(parseFloat(e.target.value) || 0)}
                                className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs"
                            />
                        </label>
                        <label className="block text-[11px]">
                            <span className="text-muted-foreground">{t('stundenplan.deputat_field_fte')}</span>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={fte}
                                onChange={(e) => setFte(parseInt(e.target.value) || 0)}
                                className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs"
                            />
                        </label>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        <label className="block text-[11px]">
                            <span className="text-muted-foreground">{t('stundenplan.deputat_field_reduction_hours')}</span>
                            <input
                                type="number"
                                step="0.5"
                                min={0}
                                value={reduction}
                                onChange={(e) => setReduction(parseFloat(e.target.value) || 0)}
                                className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs"
                            />
                        </label>
                        <label className="block text-[11px]">
                            <span className="text-muted-foreground">{t('stundenplan.deputat_field_reduction_reason')}</span>
                            <input
                                value={reductionReason}
                                onChange={(e) => setReductionReason(e.target.value)}
                                placeholder={t('stundenplan.deputat_reason_placeholder')}
                                className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs"
                            />
                        </label>
                    </div>
                    <div className="flex justify-end gap-1">
                        {deputat && (
                            <button onClick={() => setEditing(false)} className="rounded-md px-2 py-0.5 text-[11px] hover:bg-muted">
                                {t('common.cancel', { defaultValue: 'Abbrechen' })}
                            </button>
                        )}
                        <button
                            onClick={save}
                            disabled={saving}
                            className="rounded-md bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── MD-2 TeacherQualification — Sub-Panel ────────────────────────

function TeacherQualificationsSubPanel({ jwt, matrixUserId }: { jwt: string; matrixUserId: string }) {
    const t = useT();
    const [quals, setQuals] = useState<import('@/gateways/platform/stundenplan-gateway').TeacherQualification[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [pickedSubject, setPickedSubject] = useState('');
    const [level, setLevel] = useState<'full' | 'partial' | 'in_training'>('full');
    const [gradesText, setGradesText] = useState('');
    const [saving, setSaving] = useState(false);

    async function reload() {
        setLoading(true);
        try {
            const [q, s] = await Promise.all([
                gateway.listTeacherQualifications(jwt, { matrixUserId }),
                gateway.listSubjects(jwt),
            ]);
            setQuals(q.qualifications);
            setSubjects(s.subjects);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { reload(); }, [jwt, matrixUserId]); // eslint-disable-line react-hooks/exhaustive-deps

    async function add() {
        if (!pickedSubject) return;
        setSaving(true);
        try {
            await gateway.upsertTeacherQualification(jwt, {
                matrixUserId,
                subjectId: pickedSubject,
                qualificationLevel: level,
                gradeLevels: gradesText.split(',').map((s) => s.trim()).filter(Boolean),
            });
            setPickedSubject('');
            setLevel('full');
            setGradesText('');
            setShowForm(false);
            await reload();
        } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
        finally { setSaving(false); }
    }
    async function remove(id: string) {
        if (!confirm(t('common.confirm_delete', { defaultValue: 'Wirklich loeschen?' }))) return;
        try { await gateway.deleteTeacherQualification(jwt, id); await reload(); }
        catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    }

    if (loading) return <p className="text-[11px] text-muted-foreground">…</p>;

    return (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/30 p-2 dark:border-emerald-900/40 dark:bg-emerald-950/10">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
                {t('stundenplan.qual_section_title')}
            </div>
            {quals.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">{t('stundenplan.qual_empty')}</p>
            ) : (
                <ul className="space-y-1">
                    {quals.map((q) => {
                        const subj = subjects.find((s) => s.id === q.subjectId);
                        return (
                            <li key={q.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs">
                                <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                                    {subj ? `${subj.label} (${subj.key})` : q.subjectId}
                                </span>
                                {q.gradeLevels.length > 0 && (
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                        {q.gradeLevels.join(',')}
                                    </span>
                                )}
                                {q.qualificationLevel !== 'full' && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                                        {t(`stundenplan.qual_level_${q.qualificationLevel}` as never, { defaultValue: q.qualificationLevel })}
                                    </span>
                                )}
                                <button onClick={() => remove(q.id)} className="ml-auto text-destructive hover:underline">
                                    ×
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {!showForm ? (
                <button onClick={() => setShowForm(true)} className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-[11px] hover:bg-emerald-100/50">
                    <MaterialIcon name="add" size={12} />
                    {t('stundenplan.qual_add')}
                </button>
            ) : (
                <div className="mt-1.5 rounded-md border border-border bg-background p-2 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                        <label className="block text-[11px]">
                            <span className="text-muted-foreground">{t('stundenplan.qual_field_subject')}</span>
                            <select value={pickedSubject} onChange={(e) => setPickedSubject(e.target.value)} className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs">
                                <option value="">— {t('stundenplan.entry_create_choose')} —</option>
                                {subjects.map((s) => (
                                    <option key={s.id} value={s.id}>{s.label} ({s.key})</option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-[11px]">
                            <span className="text-muted-foreground">{t('stundenplan.qual_field_level')}</span>
                            <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs">
                                <option value="full">{t('stundenplan.qual_level_full')}</option>
                                <option value="partial">{t('stundenplan.qual_level_partial')}</option>
                                <option value="in_training">{t('stundenplan.qual_level_in_training')}</option>
                            </select>
                        </label>
                    </div>
                    <label className="block text-[11px]">
                        <span className="text-muted-foreground">{t('stundenplan.qual_field_grades')}</span>
                        <input value={gradesText} onChange={(e) => setGradesText(e.target.value)} placeholder="5,6,7" className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs font-mono" />
                    </label>
                    <div className="flex justify-end gap-1">
                        <button onClick={() => setShowForm(false)} className="rounded-md px-2 py-0.5 text-[11px] hover:bg-muted">
                            {t('common.cancel', { defaultValue: 'Abbrechen' })}
                        </button>
                        <button onClick={add} disabled={saving || !pickedSubject} className="rounded-md bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── GradeBand-Tab (Klassenstufen-Baender editierbar) ─────────────

function GradeBandsTab({ jwt }: { jwt: string }) {
    type GradeBand = import('@/gateways/platform/stundenplan-gateway').GradeBand;
    const [bands, setBands] = useState<GradeBand[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [newKey, setNewKey] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [saving, setSaving] = useState(false);

    async function reload() {
        setLoading(true);
        try {
            const r = await gateway.listGradeBands(jwt, { includeInactive: true });
            setBands(r.gradeBands);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { reload(); }, [jwt]); // eslint-disable-line react-hooks/exhaustive-deps

    async function addBand() {
        if (!newKey.trim() || !newLabel.trim()) return;
        setSaving(true);
        setError(null);
        try {
            await gateway.createGradeBand(jwt, {
                key: newKey.trim().toLowerCase(),
                label: newLabel.trim(),
                sortOrder: bands.length,
            });
            setNewKey('');
            setNewLabel('');
            setShowForm(false);
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    async function patchBand(id: string, patch: Partial<{ key: string; label: string; sortOrder: number; active: boolean }>) {
        try {
            await gateway.patchGradeBand(jwt, id, patch);
            await reload();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }

    async function removeBand(id: string, label: string) {
        if (!confirm(`Klassenstufen-Band „${label}" wirklich loeschen?\n\nBei Lehrer-Praeferenzen wird es automatisch entfernt.`)) return;
        try {
            await gateway.deleteGradeBand(jwt, id);
            await reload();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }

    async function moveBand(id: string, direction: 'up' | 'down') {
        const idx = bands.findIndex((b) => b.id === id);
        if (idx < 0) return;
        const swap = direction === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= bands.length) return;
        const a = bands[idx];
        const b = bands[swap];
        try {
            await Promise.all([
                gateway.patchGradeBand(jwt, a.id, { sortOrder: b.sortOrder }),
                gateway.patchGradeBand(jwt, b.id, { sortOrder: a.sortOrder }),
            ]);
            await reload();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }

    return (
        <div className="space-y-3">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <strong>Klassenstufen-Bänder</strong> bilden ab, in welchen Klassenstufen-Bereichen
                ein Lehrer bevorzugt unterrichten möchte (z.B. „Mittelstufe 5-8" für Waldorf,
                „Oberstufe 11-13" für Gymnasium). Sie erscheinen als Auswahl-Buttons im Lehrer­profil
                unter „Präferenzen".
            </div>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>
            )}

            {loading ? (
                <p className="text-xs text-muted-foreground">…</p>
            ) : bands.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Noch keine Klassenstufen definiert. Lege z.B. „Unterstufe", „Mittelstufe" und „Oberstufe" an.
                </p>
            ) : (
                <ul className="space-y-1">
                    {bands.map((b, idx) => (
                        <li key={b.id} className={cn('flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs', !b.active && 'bg-muted/30 opacity-60')}>
                            <div className="flex flex-col">
                                <button onClick={() => moveBand(b.id, 'up')} disabled={idx === 0} className="p-0 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Nach oben">
                                    <MaterialIcon name="keyboard_arrow_up" size={14} />
                                </button>
                                <button onClick={() => moveBand(b.id, 'down')} disabled={idx === bands.length - 1} className="p-0 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Nach unten">
                                    <MaterialIcon name="keyboard_arrow_down" size={14} />
                                </button>
                            </div>
                            <span className="inline-flex h-6 min-w-[80px] items-center justify-center rounded bg-muted px-2 font-mono text-[10px] text-muted-foreground">{b.key}</span>
                            <input
                                value={b.label}
                                onChange={(e) => setBands(bands.map((x) => x.id === b.id ? { ...x, label: e.target.value } : x))}
                                onBlur={(e) => {
                                    const next = e.target.value.trim();
                                    if (next && next !== b.label) patchBand(b.id, { label: next });
                                }}
                                className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-0.5 hover:border-input focus:border-input focus:bg-background focus:outline-none"
                            />
                            <button onClick={() => patchBand(b.id, { active: !b.active })} className="text-[11px] text-muted-foreground hover:text-foreground" title={b.active ? 'Deaktivieren' : 'Aktivieren'}>
                                {b.active ? 'aktiv' : 'inaktiv'}
                            </button>
                            <button onClick={() => removeBand(b.id, b.label)} className="text-[11px] text-destructive hover:underline">
                                Löschen
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {!showForm ? (
                <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    <MaterialIcon name="add" size={14} />
                    Klassenstufe hinzufügen
                </button>
            ) : (
                <div className="rounded-md border border-border p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs">
                            <span className="text-muted-foreground">Kürzel (intern)</span>
                            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="z.B. middle" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono" />
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">a-z, 0-9, _, - (nicht änderbar später)</span>
                        </label>
                        <label className="block text-xs">
                            <span className="text-muted-foreground">Anzeige-Name</span>
                            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="z.B. Mittelstufe (5-8)" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        </label>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setShowForm(false); setNewKey(''); setNewLabel(''); }} className="rounded-md px-3 py-1 text-xs hover:bg-muted">Abbrechen</button>
                        <button onClick={addBand} disabled={saving || !newKey.trim() || !newLabel.trim()} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {saving ? '…' : 'Anlegen'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

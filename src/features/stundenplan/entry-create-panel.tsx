/**
 * EntryCreatePanel (P-Master Final) — Stunde via Form anlegen.
 *
 * Wird geoeffnet bei Klick auf eine leere Zelle im Wochenraster.
 * Felder: Fach, Gruppe, Raum, Lehrkraefte (Picker mit Suche), Wochenrhythmus.
 * Speichert als draft (planningStatus). Veroeffentlichen geschieht spaeter
 * via PublishPanel.
 *
 * Slide-Over rechts, no-modal-Regel, ESC schliesst.
 */
import { type JSX, useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import {
    createStundenplanGateway,
    type InstructionGroup,
    type PeriodSlot,
    type Room,
    type Subject,
    type TeacherCandidate,
} from '@/gateways/platform/stundenplan-gateway';

const gateway = createStundenplanGateway();

const DAY_LABELS: Record<number, string> = {
    1: 'stundenplan.monday',
    2: 'stundenplan.tuesday',
    3: 'stundenplan.wednesday',
    4: 'stundenplan.thursday',
    5: 'stundenplan.friday',
    6: 'stundenplan.saturday',
    7: 'stundenplan.sunday',
};

interface PrefilledSlot {
    weekday: number;
    periodSlotId: string;
}

interface StaffPick {
    teacherMatrixUserId: string;
    role: string;
    required: boolean;
}

export function EntryCreatePanel({
    open,
    jwt,
    prefill,
    scenarioId,
    subjects,
    instructionGroups,
    rooms,
    periodSlots,
    onClose,
    onCreated,
}: {
    open: boolean;
    jwt: string;
    prefill: PrefilledSlot | null;
    scenarioId: string | undefined;
    subjects: Subject[];
    instructionGroups: InstructionGroup[];
    rooms: Room[];
    periodSlots: PeriodSlot[];
    onClose: () => void;
    onCreated: () => void;
}): JSX.Element {
    const t = useT();
    const [subjectId, setSubjectId] = useState('');
    const [instructionGroupId, setInstructionGroupId] = useState('');
    const [roomId, setRoomId] = useState('');
    const [weekParity, setWeekParity] = useState<'' | 'even' | 'odd'>('');
    const [staff, setStaff] = useState<StaffPick[]>([]);
    const [validFrom, setValidFrom] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [validUntil, setValidUntil] = useState<string>('');
    const [spansSlots, setSpansSlots] = useState<number>(1);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Reset bei open/close
    useEffect(() => {
        if (!open) {
            setSubjectId('');
            setInstructionGroupId('');
            setRoomId('');
            setWeekParity('');
            setStaff([]);
            setValidUntil('');
            setSpansSlots(1);
            setError(null);
        }
    }, [open]);

    // ESC schliesst
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !saving) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose, saving]);

    const slot = useMemo(
        () => (prefill ? periodSlots.find((p) => p.id === prefill.periodSlotId) ?? null : null),
        [prefill, periodSlots],
    );

    async function save() {
        if (!prefill) return;
        if (!subjectId) {
            setError(t('stundenplan.entry_create_err_subject'));
            return;
        }
        if (!instructionGroupId) {
            setError(t('stundenplan.entry_create_err_group'));
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await gateway.createTimetableEntry(jwt, {
                instructionGroupId,
                subjectId,
                weekday: prefill.weekday,
                periodSlotId: prefill.periodSlotId,
                spansSlots: spansSlots > 1 ? spansSlots : undefined,
                roomId: roomId || undefined,
                weekParity: weekParity === '' ? null : weekParity,
                scenarioId: scenarioId || undefined,
                validFrom: new Date(validFrom).toISOString(),
                validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
                staffAssignments: staff.length > 0 ? staff.map((s, i) => ({ ...s, sortOrder: i })) : undefined,
            });
            onCreated();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    const canSave = !saving && !!subjectId && !!instructionGroupId && !!prefill;

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="add_circle" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.entry_create_title')}</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('common.close', { defaultValue: 'Schliessen' })}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
                {/* Slot-Info (read-only Anzeige) */}
                {prefill && slot && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                        <strong>{t(DAY_LABELS[prefill.weekday] ?? '')}</strong>
                        {' · '}
                        {slot.ordinal}. {t('stundenplan.entry_create_at_slot')} ({slot.startsAt}–{slot.endsAt})
                    </div>
                )}

                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        {error}
                    </div>
                )}

                {/* Fach */}
                <label className="block">
                    <span className="text-xs text-muted-foreground">
                        {t('stundenplan.entry_create_subject')} <span className="text-destructive">*</span>
                    </span>
                    <select
                        value={subjectId}
                        onChange={(e) => setSubjectId(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                        <option value="">— {t('stundenplan.entry_create_choose')} —</option>
                        {subjects.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.label} ({s.key})
                            </option>
                        ))}
                    </select>
                </label>

                {/* Klassen-Gruppe */}
                <label className="block">
                    <span className="text-xs text-muted-foreground">
                        {t('stundenplan.entry_create_group')} <span className="text-destructive">*</span>
                    </span>
                    <select
                        value={instructionGroupId}
                        onChange={(e) => setInstructionGroupId(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                        <option value="">— {t('stundenplan.entry_create_choose')} —</option>
                        {instructionGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.label} ({g.groupKey})
                            </option>
                        ))}
                    </select>
                </label>

                {/* Raum */}
                <label className="block">
                    <span className="text-xs text-muted-foreground">{t('stundenplan.entry_create_room')}</span>
                    <select
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                        <option value="">— {t('stundenplan.entry_create_no_room')} —</option>
                        {rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.label}
                                {r.building ? ` · ${r.building}` : ''}
                            </option>
                        ))}
                    </select>
                </label>

                {/* MUST-3 Doppelstunden */}
                <label className="block">
                    <span className="text-xs text-muted-foreground">{t('stundenplan.entry_create_spans_slots')}</span>
                    <select
                        value={spansSlots}
                        onChange={(e) => setSpansSlots(Number(e.target.value))}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                        <option value={1}>{t('stundenplan.entry_create_spans_1')}</option>
                        <option value={2}>{t('stundenplan.entry_create_spans_2')}</option>
                        <option value={3}>{t('stundenplan.entry_create_spans_3')}</option>
                        <option value={4}>{t('stundenplan.entry_create_spans_4')}</option>
                    </select>
                </label>

                {/* Wochenrhythmus */}
                <label className="block">
                    <span className="text-xs text-muted-foreground">{t('stundenplan.entry_create_week_parity')}</span>
                    <select
                        value={weekParity}
                        onChange={(e) => setWeekParity(e.target.value as '' | 'even' | 'odd')}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                        <option value="">{t('stundenplan.week_parity_weekly')}</option>
                        <option value="even">{t('stundenplan.week_parity_even')}</option>
                        <option value="odd">{t('stundenplan.week_parity_odd')}</option>
                    </select>
                </label>

                {/* Lehrkräfte */}
                <div>
                    <span className="block text-xs text-muted-foreground">{t('stundenplan.entry_create_teachers')}</span>
                    <TeacherPicker jwt={jwt} value={staff} onChange={setStaff} />
                </div>

                {/* Gültigkeit */}
                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className="text-xs text-muted-foreground">{t('stundenplan.entry_create_valid_from')}</span>
                        <input
                            type="date"
                            value={validFrom}
                            onChange={(e) => setValidFrom(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs text-muted-foreground">{t('stundenplan.entry_create_valid_until')}</span>
                        <input
                            type="date"
                            value={validUntil}
                            onChange={(e) => setValidUntil(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        />
                    </label>
                </div>

                <p className="text-[11px] text-muted-foreground">
                    {t('stundenplan.entry_create_draft_hint')}
                </p>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
                <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">
                    {t('common.cancel', { defaultValue: 'Abbrechen' })}
                </button>
                <button
                    onClick={save}
                    disabled={!canSave}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    <MaterialIcon name="save" size={14} />
                    {saving ? '…' : t('stundenplan.entry_create_save')}
                </button>
            </div>
        </div>
    );
}

// ─── TeacherPicker — Inline-Sub-Komponente ───────────────────────

function TeacherPicker({
    jwt,
    value,
    onChange,
}: {
    jwt: string;
    value: StaffPick[];
    onChange: (next: StaffPick[]) => void;
}) {
    const t = useT();
    const [query, setQuery] = useState('');
    const [candidates, setCandidates] = useState<TeacherCandidate[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!jwt) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const r = await gateway.listTeacherCandidates(jwt, query.trim() || undefined);
                if (!cancelled) setCandidates(r.candidates);
            } catch {
                if (!cancelled) setCandidates([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 200);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [jwt, query]);

    const selectedIds = new Set(value.map((v) => v.teacherMatrixUserId));
    const filtered = candidates.filter((c) => !selectedIds.has(c.matrixUserId));

    return (
        <div className="mt-1 space-y-2">
            {/* Bereits ausgewählte */}
            {value.length > 0 && (
                <ul className="space-y-1">
                    {value.map((s, i) => (
                        <li
                            key={s.teacherMatrixUserId}
                            className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"
                        >
                            <MaterialIcon name="person" size={14} className="text-muted-foreground" />
                            <span className="flex-1 font-mono">{shortLabel(s.teacherMatrixUserId)}</span>
                            <select
                                value={s.role}
                                onChange={(e) =>
                                    onChange(value.map((v, j) => (j === i ? { ...v, role: e.target.value } : v)))
                                }
                                className="rounded-md border border-input bg-background px-1.5 py-0.5 text-[11px]"
                            >
                                <option value="primary">{t('stundenplan.staff_role_lead')}</option>
                                <option value="coTeacher">{t('stundenplan.staff_role_lead')} (Co)</option>
                                <option value="assistant">{t('stundenplan.staff_role_assistant')}</option>
                                <option value="observer">{t('stundenplan.staff_role_observer')}</option>
                                <option value="support">{t('stundenplan.staff_role_support')}</option>
                            </select>
                            <button
                                onClick={() => onChange(value.filter((_, j) => j !== i))}
                                className="text-destructive hover:underline"
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('stundenplan.entry_create_teacher_search')}
                className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
                {t('stundenplan.entry_create_teacher_hint')}
            </p>

            {loading && (
                <div className="text-[11px] text-muted-foreground">…</div>
            )}
            {!loading && filtered.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
                    {filtered.slice(0, 20).map((c) => (
                        <li key={c.matrixUserId}>
                            <button
                                type="button"
                                onClick={() =>
                                    onChange([
                                        ...value,
                                        { teacherMatrixUserId: c.matrixUserId, role: 'primary', required: true },
                                    ])
                                }
                                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted"
                            >
                                <MaterialIcon name="person_add" size={14} className="text-muted-foreground" />
                                <span className="flex-1">
                                    {c.displayName ? (
                                        <>
                                            {c.displayName}
                                            <span className="ml-1 font-mono text-muted-foreground">
                                                ({shortLabel(c.matrixUserId)})
                                            </span>
                                        </>
                                    ) : (
                                        <span className="font-mono">{shortLabel(c.matrixUserId)}</span>
                                    )}
                                </span>
                                {c.userTypeLabel && (
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        {c.userTypeLabel}
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function shortLabel(matrixUserId: string): string {
    const at = matrixUserId.indexOf(':');
    return at > 0 ? matrixUserId.slice(0, at) : matrixUserId;
}

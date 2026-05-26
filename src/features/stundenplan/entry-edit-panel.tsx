/**
 * EntryEditPanel (MUST-1) — bestehende Stunde bearbeiten oder loeschen.
 *
 * Slide-Over von rechts, no-modal. Wird vom EntryDetailPanel via "Bearbeiten"
 * geoeffnet. Bei draft: PATCH mit Feld-Patch + Staff-Assignments-Replace.
 * Bei published: supersede — neue Version mit Patch + validFrom, alte
 * Zeile bleibt mit status='superseded'.
 *
 * Loeschen: draft → echtes DELETE; published → retire mit endDate.
 *
 * Anker: project_stundenplaner_active MUST-1, feedback_no_modal_dialogs.
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
    type TimetableEntry,
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

interface StaffPick {
    teacherMatrixUserId: string;
    role: string;
    required: boolean;
}

export function EntryEditPanel({
    open,
    jwt,
    entry,
    subjects,
    instructionGroups,
    rooms,
    periodSlots,
    onClose,
    onSaved,
    onDeleted,
}: {
    open: boolean;
    jwt: string;
    entry: TimetableEntry | null;
    subjects: Subject[];
    instructionGroups: InstructionGroup[];
    rooms: Room[];
    periodSlots: PeriodSlot[];
    onClose: () => void;
    onSaved: () => void;
    onDeleted: () => void;
}): JSX.Element {
    const t = useT();
    const isPublished = entry?.planningStatus === 'published' && entry?.status === 'active';

    // Felder
    const [subjectId, setSubjectId] = useState('');
    const [instructionGroupId, setInstructionGroupId] = useState('');
    const [periodSlotId, setPeriodSlotId] = useState('');
    const [weekday, setWeekday] = useState<number>(1);
    const [roomId, setRoomId] = useState('');
    const [weekParity, setWeekParity] = useState<'' | 'even' | 'odd'>('');
    const [staff, setStaff] = useState<StaffPick[]>([]);
    const [validFrom, setValidFrom] = useState<string>('');
    const [validUntil, setValidUntil] = useState<string>('');
    const [spansSlots, setSpansSlots] = useState<number>(1);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [retireEndDate, setRetireEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

    // Bei Entry-Wechsel: Felder aus dem Entry uebernehmen
    useEffect(() => {
        if (!entry) return;
        setSubjectId(entry.subjectId);
        setInstructionGroupId(entry.instructionGroupId);
        setPeriodSlotId(entry.periodSlotId);
        setWeekday(entry.weekday);
        setRoomId(entry.roomId ?? '');
        setWeekParity((entry.weekParity ?? '') as '' | 'even' | 'odd');
        setStaff((entry.staffAssignments ?? []).map((sa) => ({
            teacherMatrixUserId: sa.teacherMatrixUserId,
            role: sa.role,
            required: sa.required,
        })));
        setValidFrom(new Date(entry.validFrom).toISOString().slice(0, 10));
        setValidUntil(entry.validUntil ? new Date(entry.validUntil).toISOString().slice(0, 10) : '');
        setSpansSlots(entry.spansSlots ?? 1);
        setError(null);
        setShowDelete(false);
    }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ESC schliesst
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !saving && !deleting) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose, saving, deleting]);

    const slot = useMemo(
        () => periodSlots.find((p) => p.id === periodSlotId) ?? null,
        [periodSlots, periodSlotId],
    );

    async function save() {
        if (!entry) return;
        if (!subjectId) { setError(t('stundenplan.entry_create_err_subject')); return; }
        if (!instructionGroupId) { setError(t('stundenplan.entry_create_err_group')); return; }
        setSaving(true);
        setError(null);
        try {
            const patch: Parameters<typeof gateway.patchTimetableEntry>[2] = {
                subjectId,
                instructionGroupId,
                weekday,
                periodSlotId,
                spansSlots,
                roomId: roomId || null,
                weekParity: weekParity === '' ? null : weekParity,
                validFrom: new Date(validFrom).toISOString(),
                validUntil: validUntil ? new Date(validUntil).toISOString() : null,
                staffAssignments: staff.map((s, i) => ({ ...s, coverageMode: 'must_replace', sortOrder: i })),
            };
            await gateway.patchTimetableEntry(jwt, entry.id, patch);
            onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    async function doDelete() {
        if (!entry) return;
        setDeleting(true);
        setError(null);
        try {
            if (isPublished) {
                await gateway.deleteTimetableEntry(jwt, entry.id, { endDate: new Date(retireEndDate).toISOString() });
            } else {
                await gateway.deleteTimetableEntry(jwt, entry.id);
            }
            onDeleted();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setDeleting(false);
        }
    }

    const canSave = !saving && !!subjectId && !!instructionGroupId && !!entry;

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="edit" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.entry_edit_title')}</span>
                {isPublished && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        {t('stundenplan.entry_edit_supersede_badge')}
                    </span>
                )}
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('common.close', { defaultValue: 'Schliessen' })}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
                {isPublished && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <MaterialIcon name="info" size={14} className="-mt-0.5 mr-1 inline" />
                        {t('stundenplan.entry_edit_published_hint')}
                    </div>
                )}

                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        {error}
                    </div>
                )}

                {/* Wochentag + Stunde */}
                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className="text-xs text-muted-foreground">
                            {t('stundenplan.detail_weekday')}
                        </span>
                        <select
                            value={weekday}
                            onChange={(e) => setWeekday(Number(e.target.value))}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        >
                            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                                <option key={d} value={d}>{t(DAY_LABELS[d])}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs text-muted-foreground">{t('stundenplan.detail_period')}</span>
                        <select
                            value={periodSlotId}
                            onChange={(e) => setPeriodSlotId(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        >
                            {periodSlots.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.ordinal}. ({p.startsAt}–{p.endsAt})
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                {slot && (
                    <p className="text-[11px] text-muted-foreground">
                        {t(DAY_LABELS[weekday])} · {slot.ordinal}. ({slot.startsAt}–{slot.endsAt})
                    </p>
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
                            <option key={s.id} value={s.id}>{s.label} ({s.key})</option>
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
                            <option key={g.id} value={g.id}>{g.label} ({g.groupKey})</option>
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
                            <option key={r.id} value={r.id}>{r.label}{r.building ? ` · ${r.building}` : ''}</option>
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

                {/* Lehrkraefte */}
                <div>
                    <span className="block text-xs text-muted-foreground">{t('stundenplan.entry_create_teachers')}</span>
                    <TeacherPicker jwt={jwt} value={staff} onChange={setStaff} />
                </div>

                {/* Gueltigkeit */}
                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className="text-xs text-muted-foreground">
                            {isPublished
                                ? t('stundenplan.entry_edit_new_valid_from')
                                : t('stundenplan.entry_create_valid_from')}
                        </span>
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

                {/* Pin-Constraints (Auto-Mode 0b) */}
                {entry && <EntryPinSection jwt={jwt} entryId={entry.id} />}

                {/* Loeschen-Toggle */}
                {!showDelete ? (
                    <button
                        onClick={() => setShowDelete(true)}
                        className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/5"
                    >
                        <MaterialIcon name="delete" size={14} />
                        {t('stundenplan.entry_edit_delete_open')}
                    </button>
                ) : (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-2">
                        <p className="font-medium text-destructive">
                            {isPublished
                                ? t('stundenplan.entry_edit_retire_confirm')
                                : t('stundenplan.entry_edit_delete_confirm')}
                        </p>
                        {isPublished && (
                            <label className="block">
                                <span className="text-muted-foreground">{t('stundenplan.entry_edit_retire_end_date')}</span>
                                <input
                                    type="date"
                                    value={retireEndDate}
                                    onChange={(e) => setRetireEndDate(e.target.value)}
                                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                                />
                            </label>
                        )}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowDelete(false)}
                                className="rounded-md px-2 py-1 hover:bg-muted"
                                disabled={deleting}
                            >
                                {t('common.cancel', { defaultValue: 'Abbrechen' })}
                            </button>
                            <button
                                onClick={doDelete}
                                disabled={deleting}
                                className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1 font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                            >
                                <MaterialIcon name="delete" size={14} />
                                {deleting ? '…' : isPublished
                                    ? t('stundenplan.entry_edit_retire_button')
                                    : t('stundenplan.entry_edit_delete_button')}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
                <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted" disabled={saving || deleting}>
                    {t('common.cancel', { defaultValue: 'Abbrechen' })}
                </button>
                <button
                    onClick={save}
                    disabled={!canSave || deleting}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    <MaterialIcon name="save" size={14} />
                    {saving ? '…' : isPublished
                        ? t('stundenplan.entry_edit_save_supersede')
                        : t('stundenplan.entry_edit_save')}
                </button>
            </div>
        </div>
    );
}

// ─── TeacherPicker — kleiner als beim Create-Panel, gleiche Mechanik ──

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
        return () => { cancelled = true; clearTimeout(timer); };
    }, [jwt, query]);

    const selectedIds = new Set(value.map((v) => v.teacherMatrixUserId));
    const filtered = candidates.filter((c) => !selectedIds.has(c.matrixUserId));

    return (
        <div className="mt-1 space-y-2">
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
                                <option value="support">{t('stundenplan.staff_role_support')}</option>
                                <option value="assistant">{t('stundenplan.staff_role_assistant')}</option>
                                <option value="observer">{t('stundenplan.staff_role_observer')}</option>
                            </select>
                            <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-destructive hover:underline">
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

            {loading && <div className="text-[11px] text-muted-foreground">…</div>}
            {!loading && filtered.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
                    {filtered.slice(0, 20).map((c) => (
                        <li key={c.matrixUserId}>
                            <button
                                type="button"
                                onClick={() =>
                                    onChange([...value, { teacherMatrixUserId: c.matrixUserId, role: 'primary', required: true }])
                                }
                                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted"
                            >
                                <MaterialIcon name="person_add" size={14} className="text-muted-foreground" />
                                <span className="flex-1">
                                    {c.displayName ? (
                                        <>
                                            {c.displayName}
                                            <span className="ml-1 font-mono text-muted-foreground">({shortLabel(c.matrixUserId)})</span>
                                        </>
                                    ) : (
                                        <span className="font-mono">{shortLabel(c.matrixUserId)}</span>
                                    )}
                                </span>
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

// ─── EntryPinSection — Pin-Constraint-Editor (Auto-Mode 0b) ────────

type PinField = 'weekday' | 'periodSlotId' | 'roomId' | 'staff';

const PIN_FIELD_OPTIONS: Array<{ value: PinField; labelKey: string }> = [
    { value: 'weekday', labelKey: 'stundenplan.pin_field_weekday' },
    { value: 'periodSlotId', labelKey: 'stundenplan.pin_field_slot' },
    { value: 'roomId', labelKey: 'stundenplan.pin_field_room' },
    { value: 'staff', labelKey: 'stundenplan.pin_field_staff' },
];

function EntryPinSection({ jwt, entryId }: { jwt: string; entryId: string }) {
    const t = useT();
    const [pins, setPins] = useState<import('@/gateways/platform/stundenplan-gateway').PinConstraint[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFields, setSelectedFields] = useState<Set<PinField>>(new Set());
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [cascadeNotice, setCascadeNotice] = useState<{ cascadedCount: number } | null>(null);

    async function reload() {
        setLoading(true);
        try {
            const r = await gateway.listPinConstraints(jwt);
            const own = r.pins.filter((p) => p.entryId === entryId);
            setPins(own);
            const primary = own.find((p) => !p.autoCascadeFrom);
            if (primary) {
                setSelectedFields(new Set(primary.lockedFields));
                setReason(primary.reason ?? '');
            } else {
                setSelectedFields(new Set());
                setReason('');
            }
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { reload(); }, [jwt, entryId]); // eslint-disable-line react-hooks/exhaustive-deps

    function toggleField(f: PinField) {
        const next = new Set(selectedFields);
        if (next.has(f)) next.delete(f);
        else next.add(f);
        setSelectedFields(next);
    }

    async function save() {
        setSaving(true);
        setCascadeNotice(null);
        try {
            const result = await gateway.createPinConstraint(jwt, {
                entryId,
                lockedFields: Array.from(selectedFields),
                reason: reason.trim() || undefined,
            });
            if (result.cascadedEntryIds.length > 0) {
                setCascadeNotice({ cascadedCount: result.cascadedEntryIds.length });
            }
            await reload();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    async function removeAll() {
        const own = pins.find((p) => !p.autoCascadeFrom);
        if (!own) return;
        if (!confirm(t('stundenplan.pin_remove_confirm'))) return;
        try {
            await gateway.deletePinConstraint(jwt, own.id, { cascadeRemoval: true });
            await reload();
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }

    if (loading) return null;

    const hasPin = pins.some((p) => !p.autoCascadeFrom);

    return (
        <div className="rounded-md border border-purple-200 bg-purple-50/40 p-2 dark:border-purple-900/40 dark:bg-purple-950/10">
            <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-900 dark:text-purple-200">
                    <MaterialIcon name="push_pin" size={12} className="-mt-0.5 mr-1 inline" />
                    {t('stundenplan.pin_section_title')}
                </div>
                {hasPin && (
                    <button onClick={removeAll} className="text-[11px] text-destructive hover:underline">
                        {t('stundenplan.pin_remove_all')}
                    </button>
                )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{t('stundenplan.pin_section_hint')}</p>

            <div className="mt-2 flex flex-wrap gap-1">
                {PIN_FIELD_OPTIONS.map((opt) => {
                    const selected = selectedFields.has(opt.value);
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleField(opt.value)}
                            className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${selected ? 'border-purple-400 bg-purple-100 text-purple-900 dark:border-purple-600 dark:bg-purple-900/40 dark:text-purple-200' : 'border-border text-muted-foreground hover:bg-muted'}`}
                        >
                            {t(opt.labelKey)}
                        </button>
                    );
                })}
            </div>

            {selectedFields.size > 0 && (
                <label className="mt-2 block text-[11px]">
                    <span className="text-muted-foreground">{t('stundenplan.pin_reason_label')}</span>
                    <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={t('stundenplan.pin_reason_placeholder')}
                        className="mt-0.5 block w-full rounded-md border border-input bg-background px-1.5 py-0.5 text-xs"
                    />
                </label>
            )}

            <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">
                    {hasPin
                        ? t('stundenplan.pin_current_state', { count: selectedFields.size })
                        : t('stundenplan.pin_not_set')}
                </p>
                <button
                    onClick={save}
                    disabled={saving || selectedFields.size === 0}
                    className="rounded-md bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {saving ? '…' : hasPin ? t('common.update', { defaultValue: 'Aktualisieren' }) : t('stundenplan.pin_create')}
                </button>
            </div>

            {cascadeNotice && (
                <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-1.5 text-[10px] text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                    <MaterialIcon name="info" size={10} className="-mt-0.5 mr-1 inline" />
                    {t('stundenplan.pin_cascade_notice', { count: cascadeNotice.cascadedCount })}
                </div>
            )}
        </div>
    );
}

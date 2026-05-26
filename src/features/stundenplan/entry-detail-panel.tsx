/**
 * EntryDetailPanel — P1b Read-only Drilldown.
 *
 * Wird vom Wochen-Kanban geoeffnet, wenn der Nutzer auf eine EntryCard
 * klickt. Slide-Over von rechts (no-modal-Regel, ESC schliesst). Zeigt
 * alle Felder eines TimetableEntry, inkl. der vollen Teacher-Liste und
 * der Version/RevisionGroup-Info — fuer Audit-Verstaendnis und Klarheit
 * im Pilot.
 *
 * Kein Edit, kein Drag, keine Aktionen — S5/P1b-Scope (P0-v2.1 §10.1).
 */
import { type JSX, useEffect } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import type {
    PeriodSlot,
    TimetableEntry,
} from '@/gateways/platform/stundenplan-gateway';
import {
    groupStaffByRole,
    planningStatusKey,
    shortMatrixId,
    statusKey,
    weekParityKey,
} from './stundenplan-helpers';

const DAY_KEYS: Record<number, string> = {
    1: 'stundenplan.monday',
    2: 'stundenplan.tuesday',
    3: 'stundenplan.wednesday',
    4: 'stundenplan.thursday',
    5: 'stundenplan.friday',
    6: 'stundenplan.saturday',
    7: 'stundenplan.sunday',
};

export function EntryDetailPanel({
    entry,
    periodSlot,
    onClose,
    onEdit,
}: {
    entry: TimetableEntry | null;
    periodSlot: PeriodSlot | null;
    onClose: () => void;
    onEdit?: (entry: TimetableEntry) => void;
}): JSX.Element {
    const t = useT();
    const open = entry !== null;

    // ESC schliesst — Hook vor early-return.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const groupedStaff = entry ? groupStaffByRole(entry.staffAssignments ?? []) : [];

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="event_note" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.entry_detail_title')}</span>
                {entry && onEdit && (
                    <button
                        onClick={() => onEdit(entry)}
                        className="ml-auto flex h-8 items-center gap-1 rounded-md px-2 text-xs text-primary hover:bg-muted"
                        title={t('stundenplan.entry_edit_title')}
                    >
                        <MaterialIcon name="edit" size={14} />
                        {t('stundenplan.entry_edit_open_button')}
                    </button>
                )}
                <button
                    onClick={onClose}
                    className={cn('flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground', !(entry && onEdit) && 'ml-auto')}
                    title={t('common.close', { defaultValue: 'Schliessen' })}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
                {entry && (
                    <>
                        {/* Kopf: Fach + Klasse/Gruppe */}
                        <section>
                            <h3 className="text-base font-semibold">
                                {entry.subject?.label ?? entry.subjectKey ?? entry.subjectId}
                            </h3>
                            {entry.instructionGroup?.label && (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {entry.instructionGroup.label}
                                    {entry.instructionGroup.splitType && (
                                        <span className="ml-1 opacity-70">
                                            ·{' '}
                                            {t(
                                                `stundenplan.split_${entry.instructionGroup.splitType}` as never,
                                                { defaultValue: entry.instructionGroup.splitType },
                                            )}
                                        </span>
                                    )}
                                </p>
                            )}
                        </section>

                        {/* Wann */}
                        <Section title={t('stundenplan.detail_when')}>
                            <KeyValue
                                label={t('stundenplan.detail_weekday')}
                                value={t(DAY_KEYS[entry.weekday] ?? `Wt${entry.weekday}`)}
                            />
                            {periodSlot && (
                                <KeyValue
                                    label={t('stundenplan.detail_period')}
                                    value={`${periodSlot.ordinal}. (${periodSlot.startsAt}–${periodSlot.endsAt})`}
                                />
                            )}
                            <KeyValue
                                label={t('stundenplan.detail_week_parity')}
                                value={t(weekParityKey(entry.weekParity))}
                            />
                        </Section>

                        {/* Wo */}
                        <Section title={t('stundenplan.detail_where')}>
                            <KeyValue
                                label={t('stundenplan.detail_room')}
                                value={entry.room?.label ?? '—'}
                            />
                        </Section>

                        {/* Wer */}
                        <Section title={t('stundenplan.detail_who')}>
                            {groupedStaff.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    {t('stundenplan.detail_no_teacher')}
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {groupedStaff.map((group) => (
                                        <div key={group.role}>
                                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                {t(
                                                    `stundenplan.staff_role_${group.role}` as never,
                                                    { defaultValue: group.role },
                                                )}
                                            </div>
                                            <ul className="mt-1 space-y-1">
                                                {group.entries.map((sa) => (
                                                    <li
                                                        key={sa.id}
                                                        className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
                                                    >
                                                        <MaterialIcon
                                                            name="person"
                                                            size={14}
                                                            className="text-muted-foreground"
                                                        />
                                                        <span className="flex-1 font-mono text-xs">
                                                            {shortMatrixId(sa.teacherMatrixUserId)}
                                                        </span>
                                                        {!sa.required && (
                                                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                                {t('stundenplan.staff_optional')}
                                                            </span>
                                                        )}
                                                        {sa.coverageMode !== 'normal' && (
                                                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                                                {t(
                                                                    `stundenplan.coverage_${sa.coverageMode}` as never,
                                                                    { defaultValue: sa.coverageMode },
                                                                )}
                                                            </span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>

                        {/* Audit-Metadaten */}
                        <Section title={t('stundenplan.detail_meta')}>
                            <KeyValue
                                label={t('stundenplan.detail_planning_status')}
                                value={t(planningStatusKey(entry.planningStatus))}
                            />
                            <KeyValue
                                label={t('stundenplan.detail_status')}
                                value={t(statusKey(entry.status))}
                            />
                            <KeyValue
                                label={t('stundenplan.detail_version')}
                                value={String(entry.version)}
                            />
                            <KeyValue
                                label={t('stundenplan.detail_valid_from')}
                                value={new Date(entry.validFrom).toLocaleDateString()}
                            />
                            {entry.validUntil && (
                                <KeyValue
                                    label={t('stundenplan.detail_valid_until')}
                                    value={new Date(entry.validUntil).toLocaleDateString()}
                                />
                            )}
                            <KeyValue
                                label={t('stundenplan.detail_revision_group')}
                                value={entry.revisionGroupId}
                            />
                            <KeyValue
                                label={t('stundenplan.detail_origin')}
                                value={entry.origin}
                            />
                        </Section>

                        {/* Immutability-Hinweis bei published */}
                        {entry.planningStatus === 'published' && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                                <MaterialIcon name="lock" size={14} className="-mt-0.5 mr-1 inline" />
                                {t('stundenplan.detail_published_immutable_hint')}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </h4>
            <div className="space-y-1.5">{children}</div>
        </section>
    );
}

function KeyValue({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline gap-3">
            <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
            <span className="flex-1 text-sm">{value}</span>
        </div>
    );
}

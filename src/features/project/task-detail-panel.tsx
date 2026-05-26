/**
 * TaskDetailPanel — Aufgabendetail mit Kommentaren und Checklisten.
 *
 * Wird in allen Views (Kanban, Liste, Gantt, Mindmap) angezeigt wenn
 * eine Aufgabe selektiert ist. Ersetzt die alte inline-TaskDetail-Funktion
 * in tasks-panel.tsx.
 */

import { type JSX, useState, useCallback, useRef, useMemo, useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import type { WorkItem, WorkItemStatus, WorkItemPriority, BoardGroup, Checklist, ChecklistItemType, WorkItemComment } from './project-types';
import { useComments } from './use-comments';
import { useChecklists } from './use-checklists';
import { Circle, CheckCircle2, Clock, AlertCircle, ArrowRightFromLine } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import type { SpaceMember } from '@/gateways/platform/platform-types';
import { useT } from "@/lib/i18n/use-t";

const platformGateway = createPlatformGateway();

// ─── Status/Priority Config (gespiegelt aus tasks-panel) ────────────────────

const STATUS_CYCLE: WorkItemStatus[] = ['todo', 'in_progress', 'review', 'done'];
const STATUS_CONFIG: Record<WorkItemStatus, { labelKey: string; icon: typeof Circle; color: string }> = {
    todo: { labelKey: 'app.misc.zu_erledigen', icon: Circle, color: 'text-muted-foreground' },
    in_progress: { labelKey: 'app.misc.in_arbeit', icon: Clock, color: 'text-amber-500' },
    review: { labelKey: 'common.review', icon: AlertCircle, color: 'text-blue-500' },
    done: { labelKey: 'common.done', icon: CheckCircle2, color: 'text-emerald-500' },
};

const PRIORITIES: WorkItemPriority[] = ['low', 'medium', 'high', 'critical'];
const PRIORITY_CONFIG: Record<WorkItemPriority, { labelKey: string; dot: string }> = {
    low: { labelKey: 'app.misc.niedrig', dot: 'bg-slate-400' },
    medium: { labelKey: 'app.misc.mittel', dot: 'bg-amber-400' },
    high: { labelKey: 'app.misc.hoch', dot: 'bg-orange-500' },
    critical: { labelKey: 'app.misc.kritisch', dot: 'bg-red-500' },
};

function toDateInputValue(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toISOString().split('T')[0];
}

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.floor(hours / 24);
    return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface TaskDetailPanelProps {
    item: WorkItem;
    allItems: WorkItem[];
    groups?: BoardGroup[];
    spaceId: string;
    onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>;
    /** Phase F: reason ist Pflicht-Begruendung (DSGVO/Compliance). */
    onDelete: (id: string, reason: string) => Promise<void>;
    onClose: () => void;
    /**
     * Phase F: Signal vom Kanban-Drop in die 'Erledigt'-Spalte. Bei jedem
     * neuen Drop schickt der Aufrufer einen frischen Wert (z.B. Date.now()).
     * Wir oeffnen dann automatisch das Inline-Done-Form, damit der User
     * nicht erst auf den Status-Button klicken muss.
     */
    openDoneFlowAt?: number;
}

// Phase F: Resultat-Typen beim Erledigen.
type CompletionType = 'decision' | 'letter' | 'note' | 'snoozed' | 'other';

const COMPLETION_TYPE_OPTIONS: { value: Exclude<CompletionType, 'snoozed'>; label: string; hint: string }[] = [
    { value: 'decision', label: 'Beschluss', hint: 'Eine Entscheidung wurde getroffen' },
    { value: 'letter', label: 'Schreiben', hint: 'Schreiben/Mitteilung wurde versendet' },
    { value: 'note', label: 'Notiz', hint: 'Reine Notiz, kein extern wirksames Resultat' },
    { value: 'other', label: 'Sonstiges', hint: 'Begruendung erforderlich' },
];

const COMPLETION_TYPE_LABEL: Record<CompletionType, string> = {
    decision: 'Beschluss',
    letter: 'Schreiben',
    note: 'Notiz',
    snoozed: 'Eingeschlafen',
    other: 'Sonstiges',
};

export function TaskDetailPanel({ item, allItems, groups, spaceId, onUpdate, onDelete, onClose, openDoneFlowAt }: TaskDetailPanelProps): JSX.Element {
    const t = useT();
    const possibleParents = allItems.filter(i => i.id !== item.id && i.parentId !== item.id);
    const cfg = STATUS_CONFIG[item.status];

    // Space-Mitglieder fuer Verantwortlich-Dropdown
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const myUserId = session.matrix?.userId ?? null;
    const [members, setMembers] = useState<SpaceMember[]>([]);
    useEffect(() => {
        const jwt = session.platform?.token;
        if (!jwt) return;
        platformGateway.getSpaceMembers(jwt, spaceId)
            .then(r => setMembers(r.items))
            .catch(() => setMembers([]));
    }, [session.platform?.token, spaceId]);
    // Sortierung: aktueller User zuerst, dann alphabetisch
    const sortedMembers = useMemo(() => {
        const list = [...members];
        list.sort((a, b) => {
            if (a.userId === myUserId) return -1;
            if (b.userId === myUserId) return 1;
            return (a.user.displayName || a.userId).localeCompare(b.user.displayName || b.userId);
        });
        return list;
    }, [members, myUserId]);

    const { comments, createComment, deleteComment } = useComments(spaceId, item.id);
    const {
        checklists, createChecklist, deleteChecklist,
        createItem: createChecklistItem, updateItem: updateChecklistItem,
        deleteItem: deleteChecklistItem, convertToTask,
    } = useChecklists(spaceId, item.id);

    const activeBoardId = item.boardId;

    // ── Phase F: Inline-Done-Block ───────────────────────────────────────
    // State ist null wenn das Form geschlossen ist. Beim Klick auf den
    // 'Erledigt'-Status oeffnen wir es mit leerem Default — der User muss
    // dann Resultat-Typ waehlen (+ ggf. Notiz fuer snoozed/other) und
    // 'Abschliessen' klicken, damit der Server den Status-Wechsel akzeptiert.
    const [doneFlow, setDoneFlow] = useState<{
        completionType: Exclude<CompletionType, 'snoozed'> | null;
        completionNote: string;
    } | null>(null);
    const [doneSubmitting, setDoneSubmitting] = useState(false);
    const [doneError, setDoneError] = useState<string | null>(null);

    // Inline-Delete-Begruendung. null = Form geschlossen, ansonsten Wert.
    const [deleteReason, setDeleteReason] = useState<string | null>(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    const handleStatusClick = (target: WorkItemStatus) => {
        if (target === item.status) return;
        if (target === 'done' && item.status !== 'done') {
            // Inline-Done-Form oeffnen statt direkt zu commiten.
            setDoneError(null);
            setDoneFlow({ completionType: null, completionNote: '' });
            return;
        }
        // alle anderen Uebergaenge: direkter Patch.
        // Wenn von done weg: Backend resettet completion-Felder automatisch.
        onUpdate(item.id, { status: target });
        setDoneFlow(null);
    };

    // Phase F: Kanban-Drop in 'Erledigt' schickt openDoneFlowAt — wir
    // oeffnen dann automatisch das Inline-Done-Form. Ein Ref verhindert,
    // dass das Form sich neu oeffnet nachdem der User es zugeklickt hat
    // (gleicher Wert == bereits verarbeitet).
    const lastDoneFlowAtRef = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (!openDoneFlowAt || openDoneFlowAt === lastDoneFlowAtRef.current) return;
        lastDoneFlowAtRef.current = openDoneFlowAt;
        if (item.status === 'done') return;
        setDoneError(null);
        setDoneFlow({ completionType: null, completionNote: '' });
    }, [openDoneFlowAt, item.status]);

    const submitDone = async () => {
        if (!doneFlow) return;
        const type = doneFlow.completionType;
        if (!type) {
            setDoneError('Bitte einen Resultat-Typ waehlen.');
            return;
        }
        const note = doneFlow.completionNote.trim();
        if (type === 'other' && note.length === 0) {
            setDoneError('Bei "Sonstiges" ist eine Beschreibung erforderlich.');
            return;
        }
        setDoneSubmitting(true);
        setDoneError(null);
        try {
            await onUpdate(item.id, {
                status: 'done',
                completionType: type,
                completionNote: note.length > 0 ? note : null,
            });
            setDoneFlow(null);
        } catch (err) {
            setDoneError((err as Error)?.message ?? 'Speichern fehlgeschlagen.');
        } finally {
            setDoneSubmitting(false);
        }
    };

    const submitDelete = async () => {
        if (deleteReason === null) return;
        const reason = deleteReason.trim();
        if (reason.length < 3) return;
        setDeleteSubmitting(true);
        try {
            await onDelete(item.id, reason);
        } finally {
            setDeleteSubmitting(false);
        }
    };

    // Soll der Resultat-Block (read-only) gezeigt werden?
    const hasCompletion = item.status === 'done' && !!item.completionType;

    return (
        <div className="border-b bg-muted/30 px-3 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start gap-2">
                <cfg.icon className={cn('mt-0.5 size-4 shrink-0', cfg.color)} />
                <span className="flex-1 text-xs font-medium">{item.title}</span>
                <button onClick={onClose} className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                    <MaterialIcon name="close" size={16} className="size-3.5" />
                </button>
            </div>

            {/* Phase F: Resultat-Block (read-only) — wird oben gezeigt wenn die
                Aufgabe erledigt ist und der Resultat-Typ gesetzt wurde. */}
            {hasCompletion && (
                <CompletionResultBlock item={item} />
            )}

            {/* Phase F: Hinweis fuer erledigte Tasks ohne Resultat-Doku
                (Bestandsdaten vor F.1 — completionType ist null). */}
            {item.status === 'done' && !item.completionType && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                    <div className="flex items-start gap-1.5">
                        <MaterialIcon name="info" size={14} className="mt-0.5 shrink-0" />
                        <span>{t('project.task_detail.diese_aufgabe_wurde_vor_der_resultat-dok')}</span>
                    </div>
                </div>
            )}

            {/* Status */}
            <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t('project.task_detail.status')}</label>
                <div className="mt-1 flex flex-wrap gap-1">
                    {STATUS_CYCLE.map(s => {
                        const sc = STATUS_CONFIG[s];
                        const isActive = item.status === s;
                        const isPending = doneFlow !== null && s === 'done';
                        return (
                            <button key={s} onClick={() => handleStatusClick(s)}
                                className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
                                    isActive ? 'bg-primary/10 text-primary' :
                                        isPending ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-400' :
                                            'text-muted-foreground hover:bg-muted')}>
                                <sc.icon className="size-3" />{t(sc.labelKey)}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Phase F: Inline-Done-Block — erscheint zwischen Status-Buttons
                und den restlichen Detail-Feldern, wenn der User auf 'Erledigt'
                geklickt hat. Mobile-tauglich, da kein Modal. */}
            {doneFlow && (
                <CompletionForm
                    flow={doneFlow}
                    onChange={setDoneFlow}
                    error={doneError}
                    submitting={doneSubmitting}
                    onSubmit={submitDone}
                    onCancel={() => { setDoneFlow(null); setDoneError(null); }}
                />
            )}

            {/* Prioritaet */}
            <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t('project.task_detail.prioritaet')}</label>
                <div className="mt-1 flex flex-wrap gap-1">
                    {PRIORITIES.map(p => {
                        const pc = PRIORITY_CONFIG[p];
                        return (
                            <button key={p} onClick={() => onUpdate(item.id, { priority: p })}
                                className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
                                    item.priority === p ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                                <div className={cn('size-2 rounded-full', pc.dot)} />{t(pc.labelKey)}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Zeitraum */}
            <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t('project.task_detail.zeitraum')}</label>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">{t('project.task_detail.start')}</span>
                        <input type="date" value={toDateInputValue(item.startDate)} onChange={e => onUpdate(item.id, { startDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">{t('project.task_detail.ende')}</span>
                        <input type="date" value={toDateInputValue(item.dueDate)} onChange={e => onUpdate(item.id, { dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                    </div>
                </div>
            </div>

            {/* Verantwortlich */}
            <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t('project.task_detail.verantwortlich')}</label>
                <select
                    value={item.responsibleUserId ?? ''}
                    onChange={e => onUpdate(item.id, { responsibleUserId: e.target.value || null })}
                    className="mt-1 h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                >
                    <option value="">{t('project.task_detail.niemand')}</option>
                    {sortedMembers.map(m => (
                        <option key={m.userId} value={m.userId}>
                            {m.user.displayName || m.userId.split(':')[0].replace('@', '')}
                            {m.userId === myUserId ? ' (du)' : ''}
                        </option>
                    ))}
                </select>
            </div>

            {/* Uebergeordnete Aufgabe */}
            <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t('project.task_detail.uebergeordnete_aufgabe')}</label>
                <select
                    value={item.parentId ?? ''}
                    onChange={e => onUpdate(item.id, { parentId: e.target.value || null })}
                    className="mt-1 h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                >
                    <option value="">{t('project.task_detail.keine_root-aufgabe')}</option>
                    {possibleParents.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
            </div>

            {/* Gruppe */}
            {groups && groups.length > 0 && (
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t('project.task_detail.gruppe')}</label>
                    <select
                        value={item.groupId ?? ''}
                        onChange={e => onUpdate(item.id, { groupId: e.target.value || null })}
                        className="mt-1 h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                    >
                        <option value="">{t('project.task_detail.keine_gruppe')}</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                    </select>
                </div>
            )}

            {/* ═══ Checklisten ═══ */}
            <ChecklistsSection
                checklists={checklists}
                boardId={activeBoardId}
                onCreateChecklist={createChecklist}
                onDeleteChecklist={deleteChecklist}
                onCreateItem={createChecklistItem}
                onUpdateItem={updateChecklistItem}
                onDeleteItem={deleteChecklistItem}
                onConvertToTask={convertToTask}
            />

            {/* ═══ Kommentare ═══ */}
            <CommentsSection
                comments={comments}
                onCreateComment={createComment}
                onDeleteComment={deleteComment}
            />

            {/* Phase F: Loeschen mit Begruendungs-Pflicht. Inline-Form statt
                window.confirm — DSGVO-Begruendung muss strukturiert erfasst
                werden, fliesst in Activity-Log + automatische Berichte ein. */}
            {deleteReason === null ? (
                <button onClick={() => setDeleteReason('')}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10">
                    <MaterialIcon name="delete" size={16} className="size-3" />{t('project.task_detail.aufgabe_loeschen')}
                </button>
            ) : (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
                        <MaterialIcon name="delete" size={14} />
                        {t('project.task_detail.aufgabe_in_papierkorb_verschieben')}
                    </div>
                    <label className="block text-[10px] font-medium text-muted-foreground">
                        {t('project.task_detail.begruendung_pflicht')}
                        <textarea
                            value={deleteReason}
                            onChange={e => setDeleteReason(e.target.value)}
                            placeholder={t('project.task_detail.warum_wird_die_aufgabe_geloescht_diese_b')}
                            rows={3}
                            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-destructive"
                        />
                    </label>
                    <p className="text-[10px] text-muted-foreground/80">
                        {t('project.task_detail.mindestens_3_zeichen_aufgabe_wandert_in_')}
                    </p>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setDeleteReason(null)}
                            disabled={deleteSubmitting}
                            className="rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
                            {t('project.task_detail.abbrechen')}
                        </button>
                        <button onClick={submitDelete}
                            disabled={deleteSubmitting || deleteReason.trim().length < 3}
                            className="rounded-md bg-destructive px-3 py-1.5 text-[11px] font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50">
                            {deleteSubmitting ? 'Loesche…' : 'Loeschen bestaetigen'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Phase F: Resultat-Block (read-only) ───────────────────────────────────

function CompletionResultBlock({ item }: { item: WorkItem }): JSX.Element {
    const t = useT();
    const completedAtLabel = item.completedAt
        ? new Date(item.completedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : null;
    const typeLabel = item.completionType ? COMPLETION_TYPE_LABEL[item.completionType] : null;

    return (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-950/40">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {t('project.task_detail.erledigt')}
                {completedAtLabel && <span className="text-[10px] font-normal text-emerald-700/80 dark:text-emerald-400/80">am {completedAtLabel}</span>}
            </div>
            <dl className="mt-1.5 space-y-1 text-[11px]">
                {typeLabel && (
                    <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-muted-foreground">{t('project.task_detail.resultat-typ')}</dt>
                        <dd className="font-medium">{typeLabel}</dd>
                    </div>
                )}
                {item.completionNote && (
                    <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-muted-foreground">{t('project.task_detail.notiz')}</dt>
                        <dd className="whitespace-pre-wrap">{item.completionNote}</dd>
                    </div>
                )}
                {item.completionDocumentId && (
                    <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-muted-foreground">{t('project.task_detail.akte')}</dt>
                        <dd>
                            <a href={`/documents/${item.completionDocumentId}/edit`}
                                target="_blank"
                                rel="noopener"
                                className="inline-flex items-center gap-1 text-primary hover:underline">
                                <MaterialIcon name="description" size={12} />
                                {t('project.task_detail.beleg_im_dms_oeffnen')}
                            </a>
                        </dd>
                    </div>
                )}
            </dl>
        </div>
    );
}

// ─── Phase F: Inline-Done-Form ─────────────────────────────────────────────

interface CompletionFormState {
    completionType: Exclude<CompletionType, 'snoozed'> | null;
    completionNote: string;
}

function CompletionForm({ flow, onChange, error, submitting, onSubmit, onCancel }: {
    flow: CompletionFormState;
    onChange: (next: CompletionFormState) => void;
    error: string | null;
    submitting: boolean;
    onSubmit: () => void;
    onCancel: () => void;
}): JSX.Element {
    const t = useT();
    const noteRequired = flow.completionType === 'other';
    return (
        <div className="rounded-md border border-emerald-400 bg-emerald-50 p-3 space-y-2.5 dark:border-emerald-600 dark:bg-emerald-950/40">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {t('project.task_detail.aufgabe_abschliessen_resultat_dokumentie')}
            </div>

            {/* Resultat-Typ */}
            <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {t('project.task_detail.resultat-typ')}
                </label>
                <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
                    {COMPLETION_TYPE_OPTIONS.map(opt => (
                        <button key={opt.value} type="button"
                            onClick={() => onChange({ ...flow, completionType: opt.value })}
                            title={opt.hint}
                            className={cn(
                                'rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                                flow.completionType === opt.value
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-input bg-background text-muted-foreground hover:bg-muted',
                            )}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Notiz */}
            <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {t('project.task_detail.resultat-notiz')} {noteRequired && <span className="text-destructive">{t('project.task_detail.pflicht_bei_sonstiges')}</span>}
                    {!noteRequired && <span className="text-muted-foreground/60"> {t('project.task_detail.optional')}</span>}
                </label>
                <textarea
                    value={flow.completionNote}
                    onChange={e => onChange({ ...flow, completionNote: e.target.value })}
                    placeholder={t('project.task_detail.was_wurde_getan_wie_ist_das_resultat_die')}
                    rows={3}
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-primary"
                />
            </div>

            {/* TODO Phase G.4: Beleg aus DMS verknuepfen (Document-Picker).
                Aktuell: Beim Abschliessen wird automatisch eine Akte im DMS
                erzeugt — manuelle Verknuepfung wird in Phase G.4 ergaenzt. */}

            {error && (
                <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
                    {error}
                </div>
            )}

            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel}
                    disabled={submitting}
                    className="rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
                    {t('project.task_detail.abbrechen')}
                </button>
                <button type="button" onClick={onSubmit}
                    disabled={submitting || !flow.completionType}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50">
                    {submitting ? 'Speichere…' : 'Abschliessen'}
                </button>
            </div>
        </div>
    );
}

// ─── Checklisten-Sektion ────────────────────────────────────────────────────

function ChecklistsSection({ checklists, boardId, onCreateChecklist, onDeleteChecklist, onCreateItem, onUpdateItem, onDeleteItem, onConvertToTask }: {
    checklists: Checklist[];
    boardId: string;
    onCreateChecklist: (title: string) => Promise<void>;
    onDeleteChecklist: (id: string) => Promise<void>;
    onCreateItem: (checklistId: string, title: string) => Promise<void>;
    onUpdateItem: (itemId: string, patch: { checked?: boolean; title?: string }) => Promise<void>;
    onDeleteItem: (itemId: string) => Promise<void>;
    onConvertToTask: (itemId: string, boardId: string) => Promise<WorkItem | null>;
}): JSX.Element {
    const t = useT();
    const [showAdd, setShowAdd] = useState(false);
    const [newTitle, setNewTitle] = useState('Checkliste');

    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        await onCreateChecklist(newTitle.trim());
        setNewTitle('Checkliste');
        setShowAdd(false);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    <MaterialIcon name="checklist" size={16} className="size-3" />{t('project.task_detail.checklisten')}
                </label>
                <button onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
                    <MaterialIcon name="add" size={16} className="size-3" />{t('project.task_detail.neu')}
                </button>
            </div>

            {showAdd && (
                <div className="flex items-center gap-1.5">
                    <input
                        type="text"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowAdd(false); }}
                        autoFocus
                        className="flex-1 h-6 rounded border border-border bg-background px-2 text-[11px] outline-none focus:border-primary"
                    />
                    <button onClick={handleCreate} className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90">
                        <MaterialIcon name="check" size={16} className="size-3" />
                    </button>
                </div>
            )}

            {checklists.map(cl => (
                <SingleChecklist key={cl.id} checklist={cl} boardId={boardId}
                    onCreateItem={onCreateItem} onUpdateItem={onUpdateItem}
                    onDeleteItem={onDeleteItem} onDeleteChecklist={onDeleteChecklist}
                    onConvertToTask={onConvertToTask} />
            ))}
        </div>
    );
}

function SingleChecklist({ checklist, boardId, onCreateItem, onUpdateItem, onDeleteItem, onDeleteChecklist, onConvertToTask }: {
    checklist: Checklist;
    boardId: string;
    onCreateItem: (checklistId: string, title: string) => Promise<void>;
    onUpdateItem: (itemId: string, patch: { checked?: boolean; title?: string }) => Promise<void>;
    onDeleteItem: (itemId: string) => Promise<void>;
    onDeleteChecklist: (id: string) => Promise<void>;
    onConvertToTask: (itemId: string, boardId: string) => Promise<WorkItem | null>;
}): JSX.Element {
    const t = useT();
    const [collapsed, setCollapsed] = useState(false);
    const [newItem, setNewItem] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const total = checklist.items.length;
    const done = checklist.items.filter(i => i.checked).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const handleAddItem = async () => {
        if (!newItem.trim()) return;
        await onCreateItem(checklist.id, newItem.trim());
        setNewItem('');
        inputRef.current?.focus();
    };

    return (
        <div className="rounded-md border border-border bg-card">
            {/* Header */}
            <div className="flex items-center gap-2 px-2.5 py-1.5">
                <button onClick={() => setCollapsed(!collapsed)} className="text-muted-foreground hover:text-foreground">
                    {collapsed ? <MaterialIcon name="chevron_right" size={16} className="size-3" /> : <MaterialIcon name="expand_more" size={16} className="size-3" />}
                </button>
                <span className="flex-1 text-[11px] font-medium truncate">{checklist.title}</span>
                {total > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">{done}/{total}</span>
                )}
                <button onClick={() => onDeleteChecklist(checklist.id)} title={t('project.task_detail.checkliste_loeschen')}
                    className="flex size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive">
                    <MaterialIcon name="close" size={16} className="size-3" />
                </button>
            </div>

            {/* Fortschrittsbalken */}
            {total > 0 && (
                <div className="mx-2.5 mb-1.5 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${pct}%` }} />
                </div>
            )}

            {/* Items */}
            {!collapsed && (
                <div className="px-1.5 pb-1.5 space-y-0.5">
                    {checklist.items.map(it => (
                        <div key={it.id} className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted/50">
                            <button
                                onClick={() => onUpdateItem(it.id, { checked: !it.checked })}
                                className={cn('flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                    it.checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border hover:border-primary')}
                            >
                                {it.checked && <MaterialIcon name="check" size={16} className="size-2.5" />}
                            </button>
                            <span className={cn('flex-1 text-[11px]', it.checked && 'line-through text-muted-foreground')}>{it.title}</span>
                            <button
                                onClick={() => onConvertToTask(it.id, boardId)}
                                title={t('project.task_detail.in_aufgabe_umwandeln')}
                                className="hidden size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-primary group-hover:flex"
                            >
                                <ArrowRightFromLine className="size-3" />
                            </button>
                            <button
                                onClick={() => onDeleteItem(it.id)}
                                className="hidden size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive group-hover:flex"
                            >
                                <MaterialIcon name="close" size={16} className="size-2.5" />
                            </button>
                        </div>
                    ))}

                    {/* Neues Item */}
                    <div className="flex items-center gap-1.5 px-1.5 pt-0.5">
                        <MaterialIcon name="add" size={16} className="size-3 shrink-0 text-muted-foreground/40" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={newItem}
                            onChange={e => setNewItem(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddItem(); }}
                            placeholder={t('project.task_detail.eintrag_hinzufuegen')}
                            className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/40"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Kommentare-Sektion ─────────────────────────────────────────────────────

function CommentsSection({ comments, onCreateComment, onDeleteComment }: {
    comments: WorkItemComment[];
    onCreateComment: (content: string, mentions?: string[]) => Promise<void>;
    onDeleteComment: (commentId: string) => Promise<void>;
}): JSX.Element {
    const t = useT();
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!newComment.trim() || submitting) return;
        setSubmitting(true);
        try {
            await onCreateComment(newComment.trim());
            setNewComment('');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                <MaterialIcon name="chat" size={16} className="size-3" />{t('project.task_detail.kommentare')}
                {comments.length > 0 && <span className="text-muted-foreground/60">({comments.length})</span>}
            </label>

            {/* Bestehende Kommentare */}
            {comments.length > 0 && (
                <div className="space-y-1.5">
                    {comments.map(c => (
                        <div key={c.id} className="group rounded-md border border-border bg-card px-2.5 py-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-medium text-foreground">
                                    {c.createdBy.replace(/@.*/, '').replace(/^@/, '')}
                                </span>
                                <div className="flex items-center gap-1">
                                    <span className="text-[9px] text-muted-foreground">{relativeTime(c.createdAt)}</span>
                                    <button onClick={() => onDeleteComment(c.id)}
                                        className="hidden size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive group-hover:flex">
                                        <MaterialIcon name="close" size={16} className="size-2.5" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-[11px] text-foreground/90 whitespace-pre-wrap break-words">{c.content}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Neuer Kommentar */}
            <div className="flex items-end gap-1.5">
                <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                    placeholder={t('project.task_detail.kommentar_schreiben')}
                    rows={1}
                    className="flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                />
                <button
                    onClick={handleSubmit}
                    disabled={!newComment.trim() || submitting}
                    className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                >
                    <MaterialIcon name="send" size={16} className="size-3" />
                </button>
            </div>
        </div>
    );
}

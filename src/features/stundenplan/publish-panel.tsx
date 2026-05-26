/**
 * PublishPanel (P3c) — Publish/Rollback-Dialog als Slide-Over.
 *
 * Zeigt Score-Voraussetzung + Confirmation. Spec §7.0 (hardConstraintScore=100
 * Pflicht). UI-Vorbehalt: kein versteckter Publish — Audit-Grund verlangt.
 */
import { type JSX, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import type {
    PublishEvent,
    ScoreSnapshot,
    TimetableScenario,
} from '@/gateways/platform/stundenplan-gateway';

export function PublishPanel({
    open,
    scenario,
    snapshot,
    events,
    canPublish,
    onPublish,
    onRollback,
    onClose,
}: {
    open: boolean;
    scenario: TimetableScenario | null;
    snapshot: ScoreSnapshot | null;
    events: PublishEvent[];
    canPublish: boolean;
    onPublish: (reason: string) => Promise<void>;
    onRollback: (reason: string) => Promise<void>;
    onClose: () => void;
}): JSX.Element {
    const t = useT();
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [confirmMode, setConfirmMode] = useState<'publish' | 'rollback' | null>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) {
            setReason('');
            setConfirmMode(null);
        }
    }, [open]);

    const hardScore = snapshot?.scores.find((s) => s.code === 'hardConstraintScore');
    const hardOk = hardScore?.value === 100;
    const isAlreadyPublished = scenario?.status === 'published';
    const hasRollbackTarget = events.some((e) => e.action === 'publish');

    async function handleSubmit() {
        if (!confirmMode || !reason.trim()) return;
        setSubmitting(true);
        try {
            if (confirmMode === 'publish') await onPublish(reason.trim());
            else await onRollback(reason.trim());
            setConfirmMode(null);
            setReason('');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="publish" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.publish_panel_title')}</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('common.close', { defaultValue: 'Schliessen' })}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
                {/* Szenario-Header */}
                {scenario && (
                    <div className="rounded-md border border-border bg-muted/30 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t('stundenplan.publish_current_scenario')}
                        </div>
                        <div className="text-sm font-medium">{scenario.name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{scenario.status}</div>
                    </div>
                )}

                {/* Pre-Check Score */}
                <div
                    className={cn(
                        'rounded-md border p-3 text-xs',
                        hardOk
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                            : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200',
                    )}
                >
                    <div className="flex items-center gap-2 font-semibold">
                        <MaterialIcon name={hardOk ? 'check_circle' : 'error'} size={14} />
                        {hardOk ? t('stundenplan.publish_check_ok') : t('stundenplan.publish_check_failed')}
                    </div>
                    <p className="mt-1">{t('stundenplan.publish_check_explain')}</p>
                </div>

                {/* Aktionen */}
                {!confirmMode && (
                    <div className="space-y-2">
                        <button
                            onClick={() => setConfirmMode('publish')}
                            disabled={!canPublish || isAlreadyPublished || !hardOk}
                            className="block w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {t('stundenplan.publish_action_publish')}
                        </button>
                        <button
                            onClick={() => setConfirmMode('rollback')}
                            disabled={!hasRollbackTarget}
                            className="block w-full rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                        >
                            {t('stundenplan.publish_action_rollback')}
                        </button>
                        {isAlreadyPublished && (
                            <p className="text-[11px] text-muted-foreground">
                                {t('stundenplan.publish_already_hint')}
                            </p>
                        )}
                    </div>
                )}

                {/* Confirmation */}
                {confirmMode && (
                    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                            {confirmMode === 'publish'
                                ? t('stundenplan.publish_confirm_publish')
                                : t('stundenplan.publish_confirm_rollback')}
                        </div>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t('stundenplan.publish_reason_placeholder')}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background p-2 text-sm"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setConfirmMode(null);
                                    setReason('');
                                }}
                                className="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
                            >
                                {t('common.cancel', { defaultValue: 'Abbrechen' })}
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || !reason.trim()}
                                className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {submitting ? '…' : t('common.confirm', { defaultValue: 'Bestätigen' })}
                            </button>
                        </div>
                    </div>
                )}

                {/* Audit-History */}
                <div className="pt-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('stundenplan.publish_history')}
                    </h3>
                    {events.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">{t('stundenplan.publish_history_empty')}</p>
                    ) : (
                        <ul className="mt-2 space-y-2">
                            {events.slice(0, 10).map((e) => (
                                <li key={e.id} className="rounded-md border border-border p-2 text-xs">
                                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                                        <span className="font-mono uppercase">{e.action}</span>
                                        <span>{new Date(e.createdAt).toLocaleString('de-DE')}</span>
                                    </div>
                                    {e.scenario?.name && <div className="mt-1 font-medium">{e.scenario.name}</div>}
                                    {e.reason && <div className="mt-0.5 text-muted-foreground">{e.reason}</div>}
                                    {e.actorId && <div className="mt-0.5 text-[10px] text-muted-foreground">{e.actorId}</div>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

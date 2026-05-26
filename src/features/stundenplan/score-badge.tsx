/**
 * ScoreBadge (P2a) — kompakte Anzeige des Plan-Quality-Scores.
 *
 * Spec: P0-v2.1 §7.3 Score-Dashboard. Klick öffnet Drill-down Slide-Over
 * (analog EntryDetailPanel). Wording: "Der Plan ..." (S3-Regel §13.9).
 */
import { type JSX, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import type { ScoreSnapshot, ScoreResult } from '@/gateways/platform/stundenplan-gateway';

export function ScoreBadge({
    snapshot,
    loading,
    onOpen,
}: {
    snapshot: ScoreSnapshot | null;
    loading: boolean;
    onOpen: () => void;
}): JSX.Element | null {
    const t = useT();
    if (loading) {
        return (
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                <MaterialIcon name="sync" size={12} className="animate-spin" />
                {t('stundenplan.score_loading')}
            </span>
        );
    }
    if (!snapshot || snapshot.overall === null) {
        return null;
    }
    const tone = scoreTone(snapshot.overall);
    return (
        <button
            type="button"
            onClick={onOpen}
            title={t('stundenplan.score_open_details')}
            className={cn(
                'ml-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                tone.classes,
            )}
        >
            <MaterialIcon name="insights" size={12} />
            {t('stundenplan.score_label', { value: snapshot.overall })}
        </button>
    );
}

export function ScorePanel({
    open,
    snapshot,
    onClose,
}: {
    open: boolean;
    snapshot: ScoreSnapshot | null;
    onClose: () => void;
}): JSX.Element {
    const t = useT();

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="insights" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.score_panel_title')}</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('common.close', { defaultValue: 'Schliessen' })}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
                {snapshot && (
                    <>
                        {/* Wording-Regel S3: "Der Plan ..." */}
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                            {t('stundenplan.score_disclaimer')}
                        </div>

                        {/* Overall */}
                        {snapshot.overall !== null && (
                            <div className="text-center">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                    {t('stundenplan.score_overall')}
                                </div>
                                <div
                                    className={cn(
                                        'mt-1 text-4xl font-bold',
                                        scoreTone(snapshot.overall).text,
                                    )}
                                >
                                    {snapshot.overall}
                                </div>
                            </div>
                        )}

                        {/* Per-Score */}
                        <div className="space-y-2">
                            {snapshot.scores.map((s) => (
                                <ScoreRow key={s.code} score={s} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function ScoreRow({ score }: { score: ScoreResult }): JSX.Element {
    const t = useT();
    const label = t(`stundenplan.score_code_${score.code}` as never, { defaultValue: score.code });
    const isUnavailable = score.value === null;
    return (
        <div className="rounded-md border border-border p-2.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                {isUnavailable ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t('stundenplan.score_unavailable')}
                    </span>
                ) : (
                    <span
                        className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-semibold',
                            scoreTone(score.value!).chip,
                        )}
                    >
                        {score.value}
                    </span>
                )}
            </div>
            {score.note && (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{score.note}</p>
            )}
        </div>
    );
}

function scoreTone(value: number): {
    classes: string;
    text: string;
    chip: string;
} {
    if (value >= 80) {
        return {
            classes: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
            text: 'text-emerald-700 dark:text-emerald-300',
            chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
        };
    }
    if (value >= 60) {
        return {
            classes: 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
            text: 'text-amber-700 dark:text-amber-300',
            chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
        };
    }
    return {
        classes: 'border-red-300 bg-red-50 text-red-900 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200',
        text: 'text-red-700 dark:text-red-300',
        chip: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    };
}

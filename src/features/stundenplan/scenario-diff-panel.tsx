/**
 * ScenarioDiffPanel (P3a) — Slide-Over Vergleich zweier Szenarien.
 *
 * Zeigt added / removed / changed Entries mit Feld-Detail. Read-only.
 * Spec: P0-v2.1 §10.1 P3a.
 */
import { type JSX, useEffect } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import type {
    DiffEntry,
    ScenarioDiffResult,
    TimetableScenario,
} from '@/gateways/platform/stundenplan-gateway';

export function ScenarioDiffPanel({
    open,
    loading,
    result,
    scenarioA,
    scenarioB,
    onClose,
}: {
    open: boolean;
    loading: boolean;
    result: ScenarioDiffResult | null;
    scenarioA: TimetableScenario | null;
    scenarioB: TimetableScenario | null;
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
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[600px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="compare_arrows" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.diff_panel_title')}</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('common.close', { defaultValue: 'Schliessen' })}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
                {/* Header: A vs B */}
                {scenarioA && scenarioB && (
                    <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-3">
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">A</div>
                            <div className="text-sm font-medium">{scenarioA.name}</div>
                            <div className="text-[11px] text-muted-foreground">{scenarioA.status}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">B</div>
                            <div className="text-sm font-medium">{scenarioB.name}</div>
                            <div className="text-[11px] text-muted-foreground">{scenarioB.status}</div>
                        </div>
                    </div>
                )}

                {loading && (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-14 rounded-md bg-muted/40 animate-pulse" />
                        ))}
                    </div>
                )}

                {!loading && result && (
                    <>
                        {/* Summary */}
                        <div className="grid grid-cols-4 gap-2 text-center">
                            <SummaryStat label={t('stundenplan.diff_added')} value={result.summary.added} tone="emerald" />
                            <SummaryStat label={t('stundenplan.diff_removed')} value={result.summary.removed} tone="red" />
                            <SummaryStat label={t('stundenplan.diff_changed')} value={result.summary.changed} tone="amber" />
                            <SummaryStat label={t('stundenplan.diff_unchanged')} value={result.summary.unchanged} tone="muted" />
                        </div>

                        {/* Diff-List */}
                        {result.diffs.length === 0 ? (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                                <MaterialIcon name="check_circle" size={14} className="-mt-0.5 mr-1 inline" />
                                {t('stundenplan.diff_identical')}
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {result.diffs.map((d) => (
                                    <DiffRow key={d.matchKey} entry={d} />
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function SummaryStat({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone: 'emerald' | 'red' | 'amber' | 'muted';
}) {
    const toneClass = {
        emerald: 'text-emerald-700 dark:text-emerald-300',
        red: 'text-red-700 dark:text-red-300',
        amber: 'text-amber-700 dark:text-amber-300',
        muted: 'text-muted-foreground',
    }[tone];
    return (
        <div className="rounded-md border border-border p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className={`text-xl font-bold ${toneClass}`}>{value}</div>
        </div>
    );
}

function DiffRow({ entry }: { entry: DiffEntry }) {
    const t = useT();
    const kindClass = {
        added: 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20',
        removed: 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20',
        changed: 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20',
    }[entry.kind];

    const kindLabel = t(`stundenplan.diff_kind_${entry.kind}`);
    const subjectLabel =
        entry.b?.subject?.label ?? entry.a?.subject?.label ?? entry.b?.subjectKey ?? entry.a?.subjectKey ?? '?';
    const groupLabel =
        entry.b?.instructionGroup?.label ?? entry.a?.instructionGroup?.label ?? '';

    return (
        <li className={`rounded-md border p-2.5 ${kindClass}`}>
            <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono uppercase tracking-wide opacity-80">{kindLabel}</span>
                <span className="font-medium">
                    {subjectLabel}
                    {groupLabel && <span className="ml-1 opacity-70">· {groupLabel}</span>}
                </span>
            </div>

            {entry.kind === 'changed' && entry.fieldChanges.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                    {entry.fieldChanges.map((fc, i) => (
                        <li key={`${fc.field}-${i}`}>
                            <span className="font-medium">
                                {t(`stundenplan.diff_field_${fc.field}` as never, { defaultValue: fc.field })}:
                            </span>{' '}
                            <span className="text-muted-foreground line-through">{formatVal(fc.before)}</span>
                            {' → '}
                            <span className="font-medium">{formatVal(fc.after)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
}

function formatVal(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) return v.length === 0 ? '∅' : v.join(', ');
    return String(v);
}

/**
 * BereitschaftsPanel (Auto-Mode 0i) — Diagnose-Slide-Over.
 *
 * Zeigt, warum der Auto-Plan noch nicht funktionieren kann. Jeder Vektor
 * (Klassen, Faecher, Raeume, Lehrer, Kapazitaeten, Qualifikationen,
 * Resource-Tags, Stundentafel) erscheint als Zeile mit
 *   - Status-Badge (ok / warning / blocker)
 *   - have/need-Zahlen
 *   - Delta mit Vorzeichen
 *   - klappbaren Detail-Items (z.B. "Mathe / Stufe 5: 0 Lehrer")
 *
 * Lehrer-freundlich: minimaler Jargon, klare Begruendung, klares „was tun".
 */
import { type JSX, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import { useReadiness } from './use-readiness';
import type {
    ReadinessCategory,
    ReadinessReport,
    ReadinessStatus,
    ReadinessVector,
} from '@/gateways/platform/stundenplan-gateway';

interface Props {
    open: boolean;
    onClose: () => void;
    scenarioId?: string;
}

const STATUS_PRESENTATION: Record<
    ReadinessStatus,
    { icon: string; className: string; label: string }
> = {
    ok: {
        icon: 'check_circle',
        className:
            'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
        label: 'ok',
    },
    warning: {
        icon: 'warning',
        className:
            'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        label: 'warnung',
    },
    blocker: {
        icon: 'block',
        className:
            'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200',
        label: 'blocker',
    },
};

const CATEGORY_ORDER: ReadinessCategory[] = [
    'stammdaten',
    'capacity',
    'stundentafel',
    'qualifications',
    'resources',
];

export function BereitschaftsPanel({ open, onClose, scenarioId }: Props): JSX.Element {
    const t = useT();
    const { report, loading, error, refetch } = useReadiness(scenarioId);

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[720px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="fact_check" size={18} className="text-primary" />
                <span className="text-sm font-semibold">{t('stundenplan.readiness_title')}</span>
                {report && <VerdictBadge verdict={report.verdict} t={t} />}
                <button
                    onClick={() => void refetch()}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t('common.refresh')}
                    title={t('common.refresh')}
                >
                    <MaterialIcon name="refresh" size={16} />
                </button>
                <button
                    onClick={onClose}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t('common.close')}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-sm">
                {loading && <p className="text-xs text-muted-foreground">…</p>}
                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        {String(error)}
                    </div>
                )}
                {report && <ReportBody report={report} t={t} />}
            </div>
        </div>
    );
}

function VerdictBadge({ verdict, t }: { verdict: ReadinessReport['verdict']; t: (k: string) => string }): JSX.Element {
    const map: Record<ReadinessReport['verdict'], { className: string; icon: string; label: string }> = {
        ready: {
            className:
                'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
            icon: 'verified',
            label: t('stundenplan.readiness_verdict_ready'),
        },
        warning: {
            className:
                'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
            icon: 'warning',
            label: t('stundenplan.readiness_verdict_warning'),
        },
        blocked: {
            className: 'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200',
            icon: 'block',
            label: t('stundenplan.readiness_verdict_blocked'),
        },
    };
    const v = map[verdict];
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                v.className,
            )}
        >
            <MaterialIcon name={v.icon} size={12} />
            {v.label}
        </span>
    );
}

function ReportBody({ report, t }: { report: ReadinessReport; t: (k: string) => string }): JSX.Element {
    const grouped: Record<ReadinessCategory, ReadinessVector[]> = {
        stammdaten: [],
        capacity: [],
        stundentafel: [],
        qualifications: [],
        resources: [],
    };
    for (const v of report.vectors) grouped[v.category].push(v);

    return (
        <>
            <SummarySection report={report} t={t} />

            {CATEGORY_ORDER.map((cat) => {
                const list = grouped[cat];
                if (!list.length) return null;
                return (
                    <section key={cat} className="space-y-1.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(`stundenplan.readiness_cat_${cat}`)}
                        </h3>
                        <div className="space-y-1.5">
                            {list.map((v) => (
                                <VectorRow key={v.key} vector={v} t={t} />
                            ))}
                        </div>
                    </section>
                );
            })}

            <p className="pt-2 text-[10px] text-muted-foreground">
                {t('stundenplan.readiness_computed_at')}: {new Date(report.computedAt).toLocaleString()}
            </p>
        </>
    );
}

function SummarySection({ report, t }: { report: ReadinessReport; t: (k: string) => string }): JSX.Element {
    const s = report.summary;
    return (
        <section className="rounded-md border bg-card p-3 space-y-2">
            <div className="grid grid-cols-4 gap-2 text-center">
                <SummaryStat label={t('stundenplan.readiness_summary_blockers')} value={s.blockerCount} tone={s.blockerCount > 0 ? 'red' : 'muted'} />
                <SummaryStat label={t('stundenplan.readiness_summary_warnings')} value={s.warningCount} tone={s.warningCount > 0 ? 'amber' : 'muted'} />
                <SummaryStat label={t('stundenplan.readiness_summary_required')} value={s.totalRequiredHours} suffix="h" />
                <SummaryStat label={t('stundenplan.readiness_summary_available')} value={s.totalAvailableClassSlots} suffix="h" />
            </div>
            <div className={cn(
                'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
                s.balance >= 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200',
            )}>
                <MaterialIcon name={s.balance >= 0 ? 'trending_up' : 'trending_down'} size={14} />
                <span className="font-medium">
                    {t('stundenplan.readiness_summary_balance')}: {formatDelta(s.balance)}h
                </span>
                <span className="text-[11px] opacity-75">
                    ({t('stundenplan.readiness_summary_balance_hint')})
                </span>
            </div>
        </section>
    );
}

function SummaryStat({
    label,
    value,
    suffix,
    tone = 'muted',
}: {
    label: string;
    value: number;
    suffix?: string;
    tone?: 'red' | 'amber' | 'muted';
}): JSX.Element {
    const toneClass =
        tone === 'red'
            ? 'text-red-700 dark:text-red-300'
            : tone === 'amber'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-foreground';
    return (
        <div className="rounded-md border bg-background p-1.5">
            <div className="text-[10px] text-muted-foreground">{label}</div>
            <div className={cn('text-lg font-semibold', toneClass)}>
                {value}
                {suffix && <span className="ml-0.5 text-xs opacity-60">{suffix}</span>}
            </div>
        </div>
    );
}

function VectorRow({ vector, t }: { vector: ReadinessVector; t: (k: string) => string }): JSX.Element {
    const [expanded, setExpanded] = useState(false);
    const s = STATUS_PRESENTATION[vector.status];
    const hasDetails = (vector.items?.length ?? 0) > 0;

    return (
        <div className="rounded-md border bg-card">
            <button
                type="button"
                onClick={() => hasDetails && setExpanded((e) => !e)}
                disabled={!hasDetails}
                className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs',
                    hasDetails ? 'hover:bg-muted/40' : 'cursor-default',
                )}
            >
                <span
                    className={cn(
                        'inline-flex size-5 shrink-0 items-center justify-center rounded-full',
                        s.className,
                    )}
                    title={s.label}
                >
                    <MaterialIcon name={s.icon} size={11} />
                </span>
                <span className="flex-1 font-medium">{vector.label}</span>
                <span className="font-mono text-muted-foreground">
                    {vector.have}<span className="opacity-60"> / {vector.need}</span>
                </span>
                <DeltaPill delta={vector.delta} />
                {hasDetails && (
                    <MaterialIcon
                        name={expanded ? 'expand_less' : 'expand_more'}
                        size={14}
                        className="text-muted-foreground"
                    />
                )}
            </button>
            {vector.detail && (
                <p className="px-2.5 pb-1.5 pt-0 text-[11px] text-muted-foreground">{vector.detail}</p>
            )}
            {expanded && hasDetails && (
                <ul className="border-t bg-background/40 px-2.5 py-1.5 space-y-0.5 text-[11px]">
                    {vector.items!.map((item) => (
                        <li key={`${vector.key}::${item.label}`} className="flex items-center gap-1.5">
                            <span
                                className={cn(
                                    'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full',
                                    STATUS_PRESENTATION[item.status].className,
                                )}
                            >
                                <MaterialIcon
                                    name={STATUS_PRESENTATION[item.status].icon}
                                    size={9}
                                />
                            </span>
                            <span className="flex-1 truncate">{item.label}</span>
                            <span className="font-mono text-muted-foreground">
                                {item.have}/{item.need}
                            </span>
                            {item.detail && (
                                <span className="text-muted-foreground opacity-70">— {item.detail}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function DeltaPill({ delta }: { delta: number }): JSX.Element {
    const positive = delta >= 0;
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px]',
                positive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
            )}
            title={positive ? 'Ueberhang' : 'Fehlbetrag'}
        >
            {formatDelta(delta)}
        </span>
    );
}

function formatDelta(n: number): string {
    if (n === 0) return '±0';
    if (n > 0) return `+${n}`;
    return String(n);
}

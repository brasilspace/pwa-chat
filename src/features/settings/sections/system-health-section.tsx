import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { Activity, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';
import { useT } from "@/lib/i18n/use-t";

type Status = 'ok' | 'warning' | 'error';

interface HealthCheck {
    key: string;
    label: string;
    status: Status;
    message: string;
    details?: Record<string, unknown>;
    durationMs?: number;
}

interface HealthResult {
    overall: Status | null;
    checks: HealthCheck[];
    checkedAt: string;
}

const STATUS_META: Record<Status, { icon: typeof CheckCircle2; className: string; labelKey: string }> = {
    ok: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300', labelKey: 'app.misc.ok' },
    warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300', labelKey: 'app.misc.warnung' },
    error: { icon: AlertCircle, className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300', labelKey: 'common.error' },
};

export function SystemHealthSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [result, setResult] = useState<HealthResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const runCheck = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/platform/v1/health/matrix', {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            const data = await res.json();
            setResult(data);
        } catch (e) {
            console.error('[system-health] check failed:', e);
            setError(e instanceof Error ? e.message : 'Gesundheitscheck fehlgeschlagen');
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { runCheck(); }, [runCheck]);

    const overallMeta = result?.overall ? STATUS_META[result.overall] : null;
    const OverallIcon = overallMeta?.icon ?? Activity;

    return (
        <div>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                        <Activity className="size-5" /> {t('settings.system_health.system-gesundheit')}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t('settings.system_health.live-gesundheitscheck_deiner_workspace-i')}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {overallMeta && (
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium', overallMeta.className)}>
                            <OverallIcon className="size-3.5" />
                            {t(overallMeta.labelKey)}
                        </span>
                    )}
                    <button
                        onClick={runCheck}
                        disabled={loading}
                        title={t('settings.system_health.erneut_pruefen')}
                        className="flex size-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-50"
                    >
                        <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {loading && !result && (
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-20 rounded-xl border border-border bg-muted/30 animate-pulse" />
                    ))}
                </div>
            )}

            {result && (
                <>
                    <div className="mt-6 grid gap-3 md:grid-cols-2">
                        {result.checks.map(check => <CheckCard key={check.key} check={check} />)}
                    </div>

                    <p className="mt-4 text-xs text-muted-foreground">
                        {t('settings.system_health.geprueft_am')} {new Date(result.checkedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                </>
            )}
        </div>
    );
}

function CheckCard({ check }: { check: HealthCheck }): JSX.Element {
    const meta = STATUS_META[check.status];
    const Icon = meta.icon;
    const detailsText = check.details && Object.keys(check.details).length > 0
        ? Object.entries(check.details)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' · ')
        : null;
    return (
        <div className={cn('rounded-xl border p-4', meta.className)}>
            <div className="flex items-start gap-3">
                <Icon className="size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{check.label}</p>
                    <p className="mt-0.5 text-xs">{check.message}</p>
                    {detailsText && (
                        <p className="mt-1 text-[10px] opacity-75 truncate">{detailsText}</p>
                    )}
                </div>
                {typeof check.durationMs === 'number' && (
                    <span className="text-[9px] opacity-60 tabular-nums shrink-0">{check.durationMs}ms</span>
                )}
            </div>
        </div>
    );
}

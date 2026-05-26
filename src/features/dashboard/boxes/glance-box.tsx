import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { BoxShell, BoxEmpty, BoxSkeleton } from './box-shell';
import { useT } from "@/lib/i18n/use-t";

interface GlanceData {
    tasks: { count: number; dueSoon: Array<{ id: string; title: string; dueAt: string | null; spaceId: string }> };
    workflowSteps: { count: number };
    inbox: { count: number };
    crisis: { active: boolean; title: string | null; instanceId?: string | null };
}

/**
 * Box "Auf einen Blick" — was wartet auf mich?
 *
 * Phase 1.3 fuellt den Endpoint mit echten Daten. Aktuell: Skeleton + Stub.
 */
export function GlanceBox(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [data, setData] = useState<GlanceData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        const gw = createPlatformGateway();
        gw.fetchJson<GlanceData>(jwt, '/platform/v1/dashboard/glance')
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <BoxShell icon={<MaterialIcon name="notifications" size={16} className="size-4" />} title={t('dashboard.boxes.glance.auf_einen_blick')}>
            {loading && <BoxSkeleton />}
            {!loading && data?.crisis.active && (
                <div className="mb-3 flex items-center gap-2 rounded border border-red-500/50 bg-red-50 p-2 text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    <MaterialIcon name="warning" size={16} className="size-4 shrink-0" />
                    <span className="text-sm font-medium">{t('dashboard.boxes.glance.notfall_aktiv')} {data.crisis.title ?? 'Unbenannt'}</span>
                </div>
            )}
            {!loading && data && (
                <div className="space-y-2">
                    <Row label={t('dashboard.boxes.glance.aufgaben_mit_deadline_24h')} value={data.tasks.count} />
                    {data.tasks.dueSoon.length > 0 && (
                        <ul className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
                            {data.tasks.dueSoon.slice(0, 3).map((_t) => (
                                <li key={_t.id} className="flex items-center justify-between text-xs">
                                    <a href={`/spaces/${_t.spaceId}#task=${_t.id}`} className="truncate hover:underline">{_t.title}</a>
                                    {_t.dueAt && (
                                        <span className="ml-2 shrink-0 text-muted-foreground">
                                            {new Date(_t.dueAt).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    <Row label={t('dashboard.boxes.glance.workflow-schritte_fuer_dich')} value={data.workflowSteps.count} />
                    <Row label={t('dashboard.boxes.glance.neue_postfach-eintraege')} value={data.inbox.count} />
                    {data.tasks.count === 0 && data.workflowSteps.count === 0 && data.inbox.count === 0 && !data.crisis.active && (
                        <BoxEmpty>{t('dashboard.boxes.glance.du_bist_auf_dem_aktuellen_stand')}</BoxEmpty>
                    )}
                </div>
            )}
            {!loading && !data && <BoxEmpty>{t('dashboard.boxes.glance.daten_konnten_nicht_geladen_werden')}</BoxEmpty>}
        </BoxShell>
    );
}

function Row({ label, value }: { label: string; value: number }): JSX.Element {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className={value > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{value}</span>
        </div>
    );
}

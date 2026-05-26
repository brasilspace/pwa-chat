import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { Target } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { BoxShell, BoxEmpty, BoxSkeleton } from './box-shell';
import { useT } from "@/lib/i18n/use-t";

interface DashboardFlow {
    id: string;
    name: string;
    description: string | null;
    kind: string;
    icon: string | null;
}

/**
 * Box "Aktive Flows" — Flows mit show_on_dashboard=true.
 */
export function FlowsBox(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [flows, setFlows] = useState<DashboardFlow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        const gw = createPlatformGateway();
        gw.fetchJson<{ flows: DashboardFlow[] }>(jwt, '/platform/v1/dashboard/flows')
            .then((res) => setFlows(res.flows ?? []))
            .catch(() => setFlows([]))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <BoxShell icon={<Target className="size-4" />} title={t('dashboard.boxes.flows.aktive_flows')}>
            {loading && <BoxSkeleton />}
            {!loading && flows.length === 0 && (
                <BoxEmpty>{t('dashboard.boxes.flows.der_admin_hat_noch_keine_flows_zur_start')}</BoxEmpty>
            )}
            {!loading && flows.length > 0 && (
                <ul className="space-y-2">
                    {flows.map((f) => (
                        <li key={f.id} className="flex items-center justify-between rounded p-2 hover:bg-accent">
                            <div className="flex items-center gap-2 min-w-0">
                                {f.icon && <span>{f.icon}</span>}
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{f.name}</p>
                                    {f.description && <p className="truncate text-xs text-muted-foreground">{f.description}</p>}
                                </div>
                            </div>
                            <button
                                onClick={() => navigate(`/flows/${f.id}/play`)}
                                className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                            >
                                <MaterialIcon name="play_arrow" size={16} className="size-3" /> {t('dashboard.boxes.flows.starten')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </BoxShell>
    );
}

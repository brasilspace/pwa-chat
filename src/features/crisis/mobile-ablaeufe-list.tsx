import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertTriangle, History, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { createCrisisGateway } from './crisis-gateway';
import { useT } from "@/lib/i18n/use-t";

const crisisGateway = createCrisisGateway();

/**
 * MobileAblaeufeList — Mobile-Entry fuer den Ablaeufe-Hub.
 *
 * Spiegelt die Inhalte der WorkflowsWorld-Sidebar als full-width Touch-
 * Liste mit drei Drill-in-Eintraegen: Szenarien, Aktive Krise (nur wenn
 * Krise laeuft), Verlauf. Tap navigiert in die jeweilige Detail-Ansicht.
 */
export function MobileAblaeufeList(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const [activeCount, setActiveCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        crisisGateway.getActiveEvents(jwt)
            .then((r) => setActiveCount(r.items.length))
            .catch(() => { })
            .finally(() => setLoading(false));
        const interval = setInterval(() => {
            crisisGateway.getActiveEvents(jwt)
                .then((r) => setActiveCount(r.items.length))
                .catch(() => { });
        }, 15_000);
        return () => clearInterval(interval);
    }, [jwt]);

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="shrink-0 border-b border-border bg-background px-4 py-3">
                <h1 className="text-lg font-semibold">{t('crisis.mobile_ablaeufe_list.ablaeufe')}</h1>
                <p className="text-xs text-muted-foreground">{t('crisis.mobile_ablaeufe_list.notfall-_und_krisenroutinen')}</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        <Row
                            icon={Shield}
                            label={t('crisis.mobile_ablaeufe_list.szenarien')}
                            description="Vorbereitete Krisen-Ablaeufe"
                            onClick={() => navigate('/ablaeufe?view=scenarios')}
                        />

                        {activeCount > 0 && (
                            <Row
                                icon={AlertTriangle}
                                iconClassName="text-red-500"
                                label={t('crisis.mobile_ablaeufe_list.aktive_krise')}
                                description="Eine Krise laeuft gerade"
                                badge
                                onClick={() => navigate('/ablaeufe?view=active')}
                            />
                        )}

                        <Row
                            icon={History}
                            label={t('crisis.mobile_ablaeufe_list.verlauf')}
                            description="Abgeschlossene Ereignisse"
                            onClick={() => navigate('/ablaeufe?view=history')}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

function Row({ icon: Icon, iconClassName, label, description, badge, onClick }: {
    icon: typeof Shield;
    iconClassName?: string;
    label: string;
    description?: string;
    badge?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex min-h-[60px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors active:bg-muted"
        >
            <Icon className={iconClassName ?? 'size-5 shrink-0 text-muted-foreground'} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-foreground">{label}</span>
                    {badge && <span className="size-2 shrink-0 rounded-full bg-red-500 animate-pulse" />}
                </div>
                {description && (
                    <p className="truncate text-xs text-muted-foreground">{description}</p>
                )}
            </div>
            <MaterialIcon name="chevron_right" size={16} className="size-4 shrink-0 text-muted-foreground/60" />
        </button>
    );
}

import { type JSX, useCallback, useEffect, useSyncExternalStore, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createCrisisGateway } from './crisis-gateway';
import type { CrisisEvent } from './crisis-gateway';
import { cn } from '@/lib/utils';
import { logger } from '@/core/logging/logger';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const crisisGateway = createCrisisGateway();

// ─── Severity Colors ─────────────────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
    CRITICAL: 'bg-red-500/15 text-red-500',
    HIGH: 'bg-orange-500/15 text-orange-500',
    MEDIUM: 'bg-yellow-500/15 text-yellow-500',
};

const SEV_LABELS: Record<string, string> = {
    CRITICAL: 'Kritisch',
    HIGH: 'Hoch',
    MEDIUM: 'Mittel',
};

// ─── Main Component ──────────────────────────────────────────────────────────

interface WorkflowsWorldProps {
    collapsed: boolean;
}

export function WorkflowsWorld({ collapsed }: WorkflowsWorldProps): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const location = useLocation();

    const [activeCount, setActiveCount] = useState(0);

    useEffect(() => {
        if (!jwt) return;
        crisisGateway.getActiveEvents(jwt)
            .then(r => setActiveCount(r.items.length))
            .catch(() => { });
        const interval = setInterval(() => {
            crisisGateway.getActiveEvents(jwt)
                .then(r => setActiveCount(r.items.length))
                .catch(() => { });
        }, 15_000);
        return () => clearInterval(interval);
    }, [jwt]);

    if (collapsed) {
        return (
            <div className="px-2.5 py-3">
                <div className={cn('size-2 rounded-full mx-auto', activeCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-muted')} />
            </div>
        );
    }

    const isActive = (path: string) => location.pathname === '/ablaeufe' && location.search.includes(path);

    return (
        <div className="mb-2">
            <div className="mb-1 flex items-center justify-between px-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('crisis.WorkflowsWorld.ablaeufe')}</p>
            </div>

            <button
                onClick={() => navigate('/ablaeufe')}
                className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-sidebar-accent',
                    location.pathname === '/ablaeufe' && !location.search && 'bg-sidebar-accent font-medium',
                )}
            >
                <MaterialIcon name="shield" size={16} className="size-3.5 text-muted-foreground" />
                <span className="flex-1 text-left">{t('crisis.WorkflowsWorld.szenarien')}</span>
            </button>

            {activeCount > 0 && (
                <button
                    onClick={() => navigate('/ablaeufe?view=active')}
                    className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-sidebar-accent',
                        isActive('view=active') && 'bg-sidebar-accent font-medium',
                    )}
                >
                    <MaterialIcon name="warning" size={16} className="size-3.5 text-red-500" />
                    <span className="flex-1 text-left text-red-500 font-medium">{t('crisis.WorkflowsWorld.aktive_krise')}</span>
                    <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                </button>
            )}

            <button
                onClick={() => navigate('/ablaeufe?view=history')}
                className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-sidebar-accent',
                    isActive('view=history') && 'bg-sidebar-accent font-medium',
                )}
            >
                <MaterialIcon name="history" size={16} className="size-3.5 text-muted-foreground" />
                <span className="flex-1 text-left">{t('crisis.WorkflowsWorld.verlauf')}</span>
            </button>
        </div>
    );
}


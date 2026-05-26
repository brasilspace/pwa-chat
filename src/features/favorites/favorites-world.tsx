import { type JSX, useEffect, useSyncExternalStore, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { cn } from '@/lib/utils';
import { logger } from '@/core/logging/logger';
import type { FavoriteCounts } from '@/features/project/project-types';
import {
    Star, LayoutGrid, Users, FileText, CheckSquare, Loader2,
} from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const gateway = createProjectGateway();

interface FavoritesWorldProps {
    collapsed: boolean;
}

export function FavoritesWorld({ collapsed }: FavoritesWorldProps): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const location = useLocation();

    const [counts, setCounts] = useState<FavoriteCounts>({ total: 0, spaces: 0, contacts: 0, documents: 0, tasks: 0 });
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await gateway.getFavoriteCounts(jwt);
            setCounts(res);
        } catch (err) {
            logger.error('Failed to load favorite counts', { error: err });
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const isActive = (path: string) => location.pathname + location.search === path;

    const goTo = (params?: string) => {
        const path = params ? `/favorites?${params}` : '/favorites';
        navigate(path);
    };

    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-1 py-2">
                <button onClick={() => goTo()} className="rounded-md p-2 hover:bg-muted" title={t('favorites.favorites_world.favoriten')}>
                    <MaterialIcon name="star" size={16} className="size-4" />
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="mb-2">
            <div className="mb-1 flex items-center justify-between px-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('favorites.favorites_world.favoriten')}</p>
            </div>
            <SidebarBtn
                icon={Star}
                label={t('favorites.favorites_world.alle')}
                count={counts.total}
                active={isActive('/favorites')}
                onClick={() => goTo()}
            />
            <SidebarBtn
                icon={LayoutGrid}
                label={t('favorites.favorites_world.spaces')}
                count={counts.spaces}
                active={isActive('/favorites?type=space')}
                onClick={() => goTo('type=space')}
            />
            <SidebarBtn
                icon={Users}
                label={t('favorites.favorites_world.kontakte')}
                count={counts.contacts}
                active={isActive('/favorites?type=contact')}
                onClick={() => goTo('type=contact')}
            />
            <SidebarBtn
                icon={FileText}
                label={t('favorites.favorites_world.dokumente')}
                count={counts.documents}
                active={isActive('/favorites?type=document')}
                onClick={() => goTo('type=document')}
            />
            <SidebarBtn
                icon={CheckSquare}
                label={t('favorites.favorites_world.aufgaben')}
                count={counts.tasks}
                active={isActive('/favorites?type=task')}
                onClick={() => goTo('type=task')}
            />
        </div>
    );
}

function SidebarBtn({
    icon: Icon,
    label,
    count,
    active,
    onClick,
}: {
    icon: typeof Star;
    label: string;
    count?: number;
    active?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted',
                active && 'bg-muted font-medium',
            )}
        >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count !== undefined && count > 0 && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{count}</span>
            )}
        </button>
    );
}

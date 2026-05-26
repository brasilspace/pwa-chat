import { type JSX, useState, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { FavoriteItem, FavoriteType } from '@/features/project/project-types';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const gateway = createProjectGateway();

const TYPE_ICONS: Record<string, string> = {
    space: 'grid_view',
    contact: 'groups',
    document: 'description',
    task: 'check_box',
};

const TYPE_LABELS: Record<string, string> = {
    space: 'Space',
    contact: 'Kontakt',
    document: 'Dokument',
    task: 'Aufgabe',
};

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    });
}

export function FavoritesHub(): JSX.Element {
    const t = useT();
    const [searchParams] = useSearchParams();
    const typeFilter = searchParams.get('type') as FavoriteType | null;
    const navigate = useNavigate();

    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);

    const gw = useMemo(() => createProjectGateway(), []);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await gw.listFavorites(jwt, typeFilter ?? undefined);
            setFavorites(res.favorites);
        } catch {
        } finally {
            setLoading(false);
        }
    }, [jwt, typeFilter, gw]);

    useEffect(() => { load(); }, [load]);

    const handleRemove = useCallback(async (fav: FavoriteItem) => {
        if (!jwt) return;
        await gw.removeFavorite(jwt, fav.id);
        setFavorites(prev => prev.filter(f => f.id !== fav.id));
    }, [jwt, gw]);

    const handleClick = useCallback((fav: FavoriteItem) => {
        switch (fav.type) {
            case 'space':
                navigate(`/spaces/${fav.referenceId}/chat`);
                break;
            case 'contact':
                navigate(`/dm/${fav.referenceId}`);
                break;
            case 'document':
                navigate(`/documents?doc=${fav.referenceId}`);
                break;
            case 'task':
                // Navigate to task's space (referenceId format: spaceId:taskId)
                const [spaceId] = fav.referenceId.split(':');
                if (spaceId) navigate(`/spaces/${spaceId}/tasks`);
                break;
        }
    }, [navigate]);

    const title = typeFilter ? TYPE_LABELS[typeFilter] + ' Favoriten' : 'Favoriten';
    const titleIcon = typeFilter ? TYPE_ICONS[typeFilter] ?? 'star' : 'star';

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center border-b px-4">
                <MaterialIcon name={titleIcon} size={16} className="mr-2 text-muted-foreground" />
                <span className="text-lg font-semibold">{title}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">{favorites.length}</span>
                <div className="flex-1" />
                <button
                    onClick={() => setFullscreen(f => !f)}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={fullscreen ? 'Spaltenansicht' : 'Vollbild'}
                >
                    <MaterialIcon name={fullscreen ? 'close_fullscreen' : 'open_in_full'} size={18} />
                </button>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : favorites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
                        <MaterialIcon name="star" size={40} className="text-muted-foreground/20" />
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">{t('favorites.favorites_hub.keine_favoriten')}</p>
                            <p className="mt-1 text-[12px] text-muted-foreground/70">
                                {t('favorites.favorites_hub.markieren_sie_spaces_kontakte_dokumente_')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y">
                        {favorites.map(fav => {
                            const iconName = TYPE_ICONS[fav.type] ?? 'star';
                            return (
                                <div
                                    key={fav.id}
                                    className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                                    onClick={() => handleClick(fav)}
                                >
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                                        <MaterialIcon name={iconName} size={16} className="text-muted-foreground" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[13px] font-medium">{fav.label}</p>
                                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                                            {TYPE_LABELS[fav.type]} {t('favorites.favorites_hub.hinzugefuegt')} {formatDate(fav.createdAt)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={e => { e.stopPropagation(); handleRemove(fav); }}
                                        className="shrink-0 rounded p-1.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                                        title={t('favorites.favorites_hub.favorit_entfernen')}
                                    >
                                        <MaterialIcon name="delete" size={16} className="text-muted-foreground" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}

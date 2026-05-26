/**
 * DmsWorld — Sidebar-Inhalt fuer die DMS-Welt.
 *
 * Layout (nach Mobile-Vorbild):
 *   1. Spaces + Folder als ein einziger Tree (DmsSpacesPicker)
 *   2. Ansichten (Alle, Zuletzt, Markiert, Papierkorb, Speicher)
 *   3. Tags
 *   4. Gespeicherte Filter (Smart-Folders)
 *   5. Legacy "Alte Ordnersysteme" (folder_trees) — eingeklappt
 *
 * URL-Params (mutual-exklusiv ausser Space+Folder):
 *   ?space=X          — Space-Filter aktiv
 *   ?folder=Y         — Folder im aktiven Space
 *   ?savedSearch=Z    — Smart-Folder
 *   ?legacyFolder=W   — Alter folder_trees-Folder (Coexistenz)
 *   ?view=...         — Ansicht-Filter (all/recent/starred/trash/admin)
 *   ?tag=...          — Tag-Filter
 */

import { type JSX, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { logger } from '@/core/logging/logger';
import type { Tag, DocumentStats, SavedFilter } from '@/features/project/project-types';
import { FileText, Clock, Star, Trash2, HardDrive, Filter, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DmsSpacesPicker } from './dms-spaces-picker';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const gateway = createProjectGateway();

interface Props {
    collapsed: boolean;
}

export function DmsWorld({ collapsed }: Props): JSX.Element | null {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    const spaceId = searchParams.get('space');
    const folderId = searchParams.get('folder');

    const [stats, setStats] = useState<DocumentStats>({ total: 0, starred: 0, recent: 0 });
    const [tags, setTags] = useState<Tag[]>([]);
    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNewFilter, setShowNewFilter] = useState(false);
    const [newFilterLabel, setNewFilterLabel] = useState('');

    const load = useCallback(async () => {
        if (!jwt) return;
        try {
            const [statsRes, tagsRes, filtersRes] = await Promise.all([
                gateway.getDocumentStats(jwt),
                gateway.listTags(jwt),
                gateway.listSavedFilters(jwt),
            ]);
            setStats(statsRes);
            setTags(tagsRes.tags);
            setSavedFilters(filtersRes.filters);
        } catch (err) {
            logger.error('Failed to load DMS sidebar', { error: err });
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const setSpace = (id: string | null) => {
        const next = new URLSearchParams(searchParams);
        if (id) {
            next.set('space', id);
            next.delete('savedSearch');
            next.delete('legacyFolder');
            next.delete('view');
            next.delete('tag');
        } else {
            next.delete('space');
            next.delete('folder');
        }
        setSearchParams(next, { replace: true });
    };

    const setFolder = (id: string | null) => {
        const next = new URLSearchParams(searchParams);
        if (id) {
            next.set('folder', id);
            next.delete('savedSearch');
            next.delete('legacyFolder');
            next.delete('view');
            next.delete('tag');
        } else {
            next.delete('folder');
        }
        setSearchParams(next, { replace: true });
    };

    const goView = (view: string | null) => {
        const params = view ? `view=${view}` : '';
        navigate(params ? `/dms?${params}` : '/dms');
    };
    const goTag = (slug: string) => navigate(`/dms?tag=${slug}`);
    const goFilter = (sf: SavedFilter) => {
        const p = new URLSearchParams(sf.filter as Record<string, string>).toString();
        navigate(`/dms?${p}`);
    };

    const isActive = (path: string) => location.pathname + location.search === path;

    const handleSaveFilter = useCallback(async () => {
        if (!jwt || !newFilterLabel.trim()) return;
        const params = Object.fromEntries(new URLSearchParams(location.search));
        await gateway.createSavedFilter(jwt, { label: newFilterLabel.trim(), filter: params });
        setNewFilterLabel('');
        setShowNewFilter(false);
        load();
    }, [jwt, newFilterLabel, location.search, load]);

    const handleDeleteTag = useCallback(async (tagId: string) => {
        if (!jwt) return;
        if (!window.confirm('Tag loeschen? Er wird von allen Dokumenten entfernt.')) return;
        await gateway.deleteTag(jwt, tagId);
        load();
    }, [jwt, load]);

    const handleDeleteFilter = useCallback(async (filterId: string) => {
        if (!jwt) return;
        await gateway.deleteSavedFilter(jwt, filterId);
        load();
    }, [jwt, load]);

    if (collapsed) return null;
    if (loading) {
        return (
            <div className="flex items-center justify-center p-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-3 px-1">
            {/* 1. Spaces + Folder Tree */}
            <DmsSpacesPicker
                selectedSpaceId={spaceId}
                selectedFolderId={folderId}
                onSelectSpace={setSpace}
                onSelectFolder={setFolder}
            />

            <hr className="border-border" />

            {/* 2. Ansichten */}
            <div>
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('dms.dms_world.ansichten')}
                </p>
                <SidebarBtn
                    icon={FileText}
                    label={t('dms.dms_world.alle_dokumente')}
                    count={stats.total}
                    active={isActive('/dms')}
                    onClick={() => goView(null)}
                />
                <SidebarBtn
                    icon={Clock}
                    label={t('dms.dms_world.zuletzt_geoeffnet')}
                    count={stats.recent}
                    active={isActive('/dms?view=recent')}
                    onClick={() => goView('recent')}
                />
                <SidebarBtn
                    icon={Star}
                    label={t('dms.dms_world.markiert')}
                    count={stats.starred}
                    active={isActive('/dms?view=starred')}
                    onClick={() => goView('starred')}
                />
                <SidebarBtn
                    icon={Trash2}
                    label={t('dms.dms_world.papierkorb')}
                    active={isActive('/dms?view=trash')}
                    onClick={() => goView('trash')}
                />
                <SidebarBtn
                    icon={HardDrive}
                    label={t('dms.dms_world.speicher')}
                    active={isActive('/dms?view=admin')}
                    onClick={() => goView('admin')}
                />
            </div>

            <hr className="border-border" />

            {/* 3. Tags */}
            <div>
                <p className="mb-1 flex items-center px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <MaterialIcon name="sell" size={16} className="mr-1 size-3" />
                    {t('dms.dms_world.tags')}
                </p>
                {tags.length === 0 && (
                    <p className="px-2 text-[11px] text-muted-foreground">{t('dms.dms_world.noch_keine_tags')}</p>
                )}
                {tags.map(tag => (
                    <div key={tag.id} className="group flex items-center">
                        <SidebarBtn
                            label={tag.label}
                            count={tag.documentCount ?? 0}
                            color={tag.color ?? undefined}
                            active={isActive(`/dms?tag=${tag.slug}`)}
                            onClick={() => goTag(tag.slug)}
                        />
                        <button
                            onClick={() => handleDeleteTag(tag.id)}
                            className="mr-1 shrink-0 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                            title={t('dms.dms_world.tag_loeschen')}
                        >
                            <MaterialIcon name="close" size={16} className="size-3 text-muted-foreground" />
                        </button>
                    </div>
                ))}
            </div>

            <hr className="border-border" />

            {/* 4. Gespeicherte Filter */}
            <div>
                <p className="mb-1 flex items-center px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <MaterialIcon name="filter_list" size={16} className="mr-1 size-3" />
                    {t('dms.dms_world.gespeicherte_filter')}
                    <button
                        className="ml-auto rounded p-0.5 hover:bg-muted"
                        title={t('dms.dms_world.aktuellen_filter_speichern')}
                        onClick={() => setShowNewFilter(true)}
                    >
                        <MaterialIcon name="add" size={16} className="size-3" />
                    </button>
                </p>
                {showNewFilter && (
                    <div className="flex items-center gap-1 px-2">
                        <input
                            value={newFilterLabel}
                            onChange={e => setNewFilterLabel(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveFilter()}
                            placeholder={t('dms.dms_world.filtername')}
                            className="h-6 flex-1 rounded border bg-background px-1.5 text-[11px] outline-none focus:ring-1 focus:ring-primary"
                            autoFocus
                        />
                        <button onClick={handleSaveFilter} className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">OK</button>
                        <button onClick={() => setShowNewFilter(false)} className="rounded p-0.5 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-3" /></button>
                    </div>
                )}
                {savedFilters.length === 0 && !showNewFilter && (
                    <p className="px-2 text-[11px] text-muted-foreground">{t('dms.dms_world.noch_keine_filter_gespeichert')}</p>
                )}
                {savedFilters.map(sf => (
                    <div key={sf.id} className="group flex items-center">
                        <SidebarBtn
                            icon={Filter}
                            label={sf.label}
                            active={false}
                            onClick={() => goFilter(sf)}
                        />
                        <button
                            onClick={() => handleDeleteFilter(sf.id)}
                            className="mr-1 shrink-0 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                            title={t('dms.dms_world.filter_loeschen')}
                        >
                            <MaterialIcon name="close" size={16} className="size-3 text-muted-foreground" />
                        </button>
                    </div>
                ))}
            </div>

        </div>
    );
}

// ---------------------------------------------------------------------------
function SidebarBtn({ icon: Icon, label, count, color, active, onClick }: {
    icon?: typeof FileText;
    label: string;
    count?: number;
    color?: string;
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
            {Icon ? (
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : color ? (
                <div className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            ) : (
                <div className="size-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
            )}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count !== undefined && count > 0 && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{count}</span>
            )}
        </button>
    );
}

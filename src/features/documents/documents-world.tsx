import { type JSX, useEffect, useSyncExternalStore, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { cn } from '@/lib/utils';
import { logger } from '@/core/logging/logger';
import type { Tag, DocumentStats, SavedFilter } from '@/features/project/project-types';
import { FileText, Clock, Star, Filter, Loader2, HardDrive, Trash2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const gateway = createProjectGateway();

interface DocumentsWorldProps {
    collapsed: boolean;
}

export function DocumentsWorld({ collapsed }: DocumentsWorldProps): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const location = useLocation();

    const [stats, setStats] = useState<DocumentStats>({ total: 0, starred: 0, recent: 0 });
    const [tags, setTags] = useState<Tag[]>([]);
    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
    const [loading, setLoading] = useState(true);
    const [newFilterLabel, setNewFilterLabel] = useState('');
    const [showNewFilter, setShowNewFilter] = useState(false);

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

    const handleSaveFilter = useCallback(async () => {
        if (!jwt || !newFilterLabel.trim()) return;
        // Save current URL params as filter
        const params = Object.fromEntries(new URLSearchParams(location.search));
        await gateway.createSavedFilter(jwt, { label: newFilterLabel.trim(), filter: params });
        setNewFilterLabel('');
        setShowNewFilter(false);
        load();
    }, [jwt, newFilterLabel, location.search, load]);

    const handleDeleteTag = useCallback(async (tagId: string) => {
        if (!jwt) return;
        const confirmed = window.confirm('Tag loeschen? Er wird von allen Dokumenten entfernt.');
        if (!confirmed) return;
        await gateway.deleteTag(jwt, tagId);
        load();
    }, [jwt, load]);

    const handleDeleteFilter = useCallback(async (filterId: string) => {
        if (!jwt) return;
        await gateway.deleteSavedFilter(jwt, filterId);
        load();
    }, [jwt, load]);

    useEffect(() => { load(); }, [load]);

    const isActive = (path: string) => location.pathname + location.search === path;

    const goTo = (params?: string) => {
        const path = params ? `/documents?${params}` : '/documents';
        navigate(path);
    };

    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-1 py-2">
                <button onClick={() => goTo()} className="rounded-md p-2 hover:bg-muted" title={t('documents.documents_world.dokumente')}>
                    <MaterialIcon name="description" size={16} className="size-4" />
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
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('documents.documents_world.dokumente')}</p>
            </div>
            <SidebarBtn
                icon={FileText}
                label={t('documents.documents_world.alle_dokumente')}
                count={stats.total}
                active={isActive('/documents')}
                onClick={() => goTo()}
            />
            <SidebarBtn
                icon={Clock}
                label={t('documents.documents_world.zuletzt_geoeffnet')}
                count={stats.recent}
                active={isActive('/documents?view=recent')}
                onClick={() => goTo('view=recent')}
            />
            <SidebarBtn
                icon={Star}
                label={t('documents.documents_world.markiert')}
                count={stats.starred}
                active={isActive('/documents?view=starred')}
                onClick={() => goTo('view=starred')}
            />
            <SidebarBtn
                icon={Trash2}
                label={t('documents.documents_world.papierkorb')}
                active={isActive('/documents?view=trash')}
                onClick={() => goTo('view=trash')}
            />
            <SidebarBtn
                icon={HardDrive}
                label={t('documents.documents_world.speicher')}
                active={isActive('/documents?view=admin')}
                onClick={() => goTo('view=admin')}
            />

            {/* Tags */}
            <p className="mt-3 flex items-center px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MaterialIcon name="sell" size={16} className="mr-1 size-3" />
                {t('documents.documents_world.tags')}
                <button
                    className="ml-auto rounded p-0.5 hover:bg-muted"
                    title={t('documents.documents_world.tags_verwalten')}
                    onClick={() => goTo('view=tags')}
                >
                    <MaterialIcon name="add" size={16} className="size-3" />
                </button>
            </p>
            {tags.length === 0 && (
                <p className="px-2 text-[11px] text-muted-foreground">{t('documents.documents_world.noch_keine_tags')}</p>
            )}
            {tags.map(tag => (
                <div key={tag.id} className="group flex items-center">
                    <SidebarBtn
                        label={tag.label}
                        count={tag.documentCount ?? 0}
                        color={tag.color ?? undefined}
                        active={isActive(`/documents?tag=${tag.slug}`)}
                        onClick={() => goTo(`tag=${tag.slug}`)}
                    />
                    <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="mr-1 shrink-0 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                        title={t('documents.documents_world.tag_loeschen')}
                    >
                        <MaterialIcon name="close" size={16} className="size-3 text-muted-foreground" />
                    </button>
                </div>
            ))}

            {/* Gespeicherte Filter */}
            <p className="mt-3 flex items-center px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MaterialIcon name="filter_list" size={16} className="mr-1 size-3" />
                {t('documents.documents_world.gespeicherte_filter')}
                <button
                    className="ml-auto rounded p-0.5 hover:bg-muted"
                    title={t('documents.documents_world.aktuellen_filter_speichern')}
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
                        placeholder={t('documents.documents_world.filtername')}
                        className="h-6 flex-1 rounded border bg-background px-1.5 text-[11px] outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                    />
                    <button onClick={handleSaveFilter} className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">OK</button>
                    <button onClick={() => setShowNewFilter(false)} className="rounded p-0.5 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-3" /></button>
                </div>
            )}
            {savedFilters.length === 0 && !showNewFilter && (
                <p className="px-2 text-[11px] text-muted-foreground">{t('documents.documents_world.noch_keine_filter_gespeichert')}</p>
            )}
            {savedFilters.map(sf => (
                <div key={sf.id} className="group flex items-center">
                    <SidebarBtn
                        icon={Filter}
                        label={sf.label}
                        active={false}
                        onClick={() => {
                            const params = new URLSearchParams(sf.filter as Record<string, string>).toString();
                            goTo(params);
                        }}
                    />
                    <button
                        onClick={() => handleDeleteFilter(sf.id)}
                        className="mr-1 shrink-0 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
                        title={t('documents.documents_world.filter_loeschen')}
                    >
                        <MaterialIcon name="close" size={16} className="size-3 text-muted-foreground" />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Sidebar Button
// ---------------------------------------------------------------------------

function SidebarBtn({
    icon: Icon,
    label,
    count,
    color,
    active,
    onClick,
}: {
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

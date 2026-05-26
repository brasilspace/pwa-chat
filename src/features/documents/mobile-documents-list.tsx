import { type JSX, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, Star, Trash2, HardDrive, ChevronRight, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import type { Tag, DocumentStats } from '@/features/project/project-types';
import { cn } from '@/lib/utils';
import { DmsSpacesPicker } from '@/features/dms/dms-spaces-picker';
import { useT } from "@/lib/i18n/use-t";

const gateway = createProjectGateway();

/**
 * MobileDocumentsList — Mobile-Entry fuer den Dokumente-Hub.
 *
 * Spiegelt die Inhalte der DocumentsWorld-Sidebar als full-width Touch-
 * Liste: Ansichten (Alle, Zuletzt, Markiert, Papierkorb, Speicher) und
 * Tags. Tap navigiert in die jeweilige Detail-Ansicht.
 */
export function MobileDocumentsList(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const [stats, setStats] = useState<DocumentStats>({ total: 0, starred: 0, recent: 0 });
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        try {
            const [statsRes, tagsRes] = await Promise.all([
                gateway.getDocumentStats(jwt),
                gateway.listTags(jwt),
            ]);
            setStats(statsRes);
            setTags(tagsRes.tags);
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="shrink-0 border-b border-border bg-background px-4 py-3">
                <h1 className="text-lg font-semibold">{t('documents.mobile_documents_list.dokumente')}</h1>
                <p className="text-xs text-muted-foreground">{t('documents.mobile_documents_list.dateien_notizen_und_tags')}</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-6">
                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        {/* Spaces + Folder Tree (Filesystem) */}
                        <section className="px-4 pt-4">
                            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('documents.mobile_documents_list.spaces_amp_ordner')}
                            </h2>
                            <div className="rounded-md border bg-card p-1">
                                <DmsSpacesPicker
                                    selectedSpaceId={null}
                                    selectedFolderId={null}
                                    onSelectSpace={(id) => {
                                        if (id) navigate(`/documents?space=${encodeURIComponent(id)}`);
                                    }}
                                    onSelectFolder={(id) => {
                                        if (id) {
                                            const u = new URL(window.location.href);
                                            const space = u.searchParams.get('space');
                                            navigate(`/documents?${space ? `space=${encodeURIComponent(space)}&` : ''}folder=${encodeURIComponent(id)}`);
                                        }
                                    }}
                                />
                            </div>
                        </section>

                        {/* Ansichten */}
                        <section className="px-4 pt-6">
                            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('documents.mobile_documents_list.ansichten')}
                            </h2>
                            <Row
                                icon={FileText}
                                label={t('documents.mobile_documents_list.alle_dokumente')}
                                count={stats.total}
                                onClick={() => navigate('/documents?view=all')}
                            />
                            <Row
                                icon={Clock}
                                label={t('documents.mobile_documents_list.zuletzt_geoeffnet')}
                                count={stats.recent}
                                onClick={() => navigate('/documents?view=recent')}
                            />
                            <Row
                                icon={Star}
                                label={t('documents.mobile_documents_list.markiert')}
                                count={stats.starred}
                                onClick={() => navigate('/documents?view=starred')}
                            />
                            <Row
                                icon={Trash2}
                                label={t('documents.mobile_documents_list.papierkorb')}
                                onClick={() => navigate('/documents?view=trash')}
                            />
                            <Row
                                icon={HardDrive}
                                label={t('documents.mobile_documents_list.speicher-uebersicht')}
                                onClick={() => navigate('/documents?view=admin')}
                            />
                        </section>

                        {/* Tags */}
                        <section className="px-4 pt-6">
                            <h2 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <MaterialIcon name="sell" size={16} className="size-3" />
                                {t('documents.mobile_documents_list.tags')}
                            </h2>
                            {tags.length === 0 ? (
                                <p className="px-2 py-3 text-xs italic text-muted-foreground">
                                    {t('documents.mobile_documents_list.noch_keine_tags_vorhanden')}
                                </p>
                            ) : (
                                tags.map((tag) => (
                                    <Row
                                        key={tag.id}
                                        color={tag.color ?? '#94a3b8'}
                                        label={tag.label}
                                        count={tag.documentCount ?? 0}
                                        onClick={() => navigate(`/documents?tag=${tag.slug}`)}
                                    />
                                ))
                            )}
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}

function Row({ icon: Icon, color, label, count, onClick }: {
    icon?: typeof FileText;
    color?: string;
    label: string;
    count?: number;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors active:bg-muted"
        >
            {Icon ? (
                <Icon className="size-5 shrink-0 text-muted-foreground" />
            ) : (
                <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                />
            )}
            <span className="flex-1 truncate text-[15px] text-foreground">{label}</span>
            {count !== undefined && count > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
            )}
            <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground/60', count !== undefined && count > 0 && 'ml-1')} />
        </button>
    );
}

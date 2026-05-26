/**
 * FolderTreesView — Hauptansicht im DMS-Hub fuer eine ausgewaehlte Quelle.
 *
 * Quelle wird ueber URL-Params gesteuert:
 *   ?folder=<id>      — Folder aus einer Hierarchie
 *   ?savedSearch=<id> — Smart-Folder (gespeicherte Suche)
 *
 * Der Picker (Ordnersysteme + Smart-Folders) lebt in der App-Sidebar
 * (DmsWorld), nicht mehr in dieser View.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { folderTreesApi, useFolderTrees } from './use-folder-trees';
import { savedSearchesApi, useSavedSearches } from './use-saved-searches';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { FileIcon } from './file-icon';
import { useT } from "@/lib/i18n/use-t";

interface DocItem {
    id: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
    scope: string;
    spaceId: string | null;
}

interface Source {
    kind: 'folder' | 'saved-search';
    id: string;
    name: string;
    sub?: string;
}

interface Props {
    selectedDocId: string | null;
    onSelectDoc: (docId: string) => void;
}

export function FolderTreesView({ selectedDocId, onSelectDoc }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [searchParams] = useSearchParams();
    const folderId = searchParams.get('legacyFolder');
    const savedSearchId = searchParams.get('savedSearch');

    const { trees } = useFolderTrees();
    const { items: searches } = useSavedSearches();

    // Source aus URL-Params + bekannten Trees/Searches ableiten
    const source: Source | null = (() => {
        if (folderId) {
            for (const tree of trees) {
                const folder = tree.folders.find((f) => f.id === folderId);
                if (folder) return { kind: 'folder', id: folder.id, name: folder.name, sub: tree.name };
            }
            return { kind: 'folder', id: folderId, name: t('common.folder'), sub: '' };
        }
        if (savedSearchId) {
            const s = searches.find((x) => x.id === savedSearchId);
            return { kind: 'saved-search', id: savedSearchId, name: s?.name ?? 'Smart-Folder' };
        }
        return null;
    })();

    const [docs, setDocs] = useState<DocItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!source || !jwt) { setDocs([]); return; }
        setLoading(true);
        const fetch = source.kind === 'folder'
            ? folderTreesApi.listDocuments(jwt, source.id).then(r => r.documents)
            : savedSearchesApi.run(jwt, source.id).then(r => r.documents);
        fetch
            .then(setDocs)
            .catch(() => setDocs([]))
            .finally(() => setLoading(false));
    }, [source?.kind, source?.id, jwt]);

    if (!source) return <EmptyState />;

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-4 py-2 flex items-center gap-2 text-sm">
                {source.kind === 'folder' ? (
                    <>
                        {source.sub && <span className="text-muted-foreground">{source.sub}</span>}
                        {source.sub && <MaterialIcon name="chevron_right" size={14} className="text-muted-foreground" />}
                    </>
                ) : (
                    <MaterialIcon name="auto_awesome" size={14} className="text-amber-500" />
                )}
                <span className="font-medium">{source.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{docs.length} {t('dms.folder_trees_view.dokument')}{docs.length !== 1 ? 'e' : ''}</span>
            </div>
            {loading ? (
                <div className="flex flex-1 items-center justify-center text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                </div>
            ) : docs.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground">
                    <MaterialIcon name="folder_open" size={40} className="opacity-30" />
                    <p className="text-sm">{t('dms.folder_trees_view.keine_treffer')}</p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto divide-y">
                    {docs.map(d => (
                        <button
                            key={d.id}
                            onClick={() => onSelectDoc(d.id)}
                            className={cn(
                                'flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/50',
                                selectedDocId === d.id && 'bg-muted',
                            )}
                        >
                            <FileIcon fileName={d.title} mimeType={d.mimeType} className="size-4 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{d.title}</div>
                                <div className="text-xs text-muted-foreground">
                                    {d.mimeType} · {formatBytes(d.sizeBytes)} · {new Date(d.createdAt).toLocaleDateString('de-DE')}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function EmptyState(): JSX.Element {
    const t = useT();
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
            <MaterialIcon name="folder_open" size={48} className="opacity-30" />
            <p className="text-sm">{t('dms.folder_trees_view.waehle_links_in_der_sidebar_einen_ordner')}</p>
            <p className="text-xs max-w-xs">{t('dms.folder_trees_view.mehrere_parallele_hierarchien_ein_dokume')}</p>
        </div>
    );
}

function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

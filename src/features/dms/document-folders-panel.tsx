/**
 * DocumentFoldersPanel — zeigt im Doc-Detail in welchen Ordnern (aus welchen
 * Hierarchien) das Dokument haengt. Plus "Hinzufuegen"-Button mit Picker.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { folderTreesApi, type DocumentFolder, useFolderTrees, type FolderTreeNode } from './use-folder-trees';
import { Plus, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { SectionHeader } from '@/components/ui/section-header';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    documentId: string;
    /** Aufruf nach Aenderung — z.B. um Sidebar-Counts zu refreshen. */
    onChange?: () => void;
}

export function DocumentFoldersPanel({ documentId, onChange }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [folders, setFolders] = useState<DocumentFolder[] | null>(null);
    const [picking, setPicking] = useState(false);

    const refresh = () => {
        if (!jwt) return;
        folderTreesApi.documentFolders(jwt, documentId)
            .then(r => setFolders(r.folders))
            .catch(() => setFolders([]));
    };

    useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [documentId, jwt]);

    const remove = async (folderId: string) => {
        if (!jwt) return;
        try {
            await folderTreesApi.removePlacement(jwt, folderId, documentId);
            refresh();
            onChange?.();
        } catch (e) {
            alert('Entfernen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    const place = async (folderId: string) => {
        if (!jwt) return;
        try {
            await folderTreesApi.placeDocument(jwt, folderId, documentId);
            setPicking(false);
            refresh();
            onChange?.();
        } catch (e) {
            alert('Ablegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div>
            <SectionHeader
                action={
                    <button
                        onClick={() => setPicking(!picking)}
                        className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted"
                    >
                        <MaterialIcon name="add" size={16} className="size-3" /> {t('dms.document_folders.ablegen')}
                    </button>
                }
            >
                {t('dms.document_folders.in_ordnern')}
            </SectionHeader>

            {folders === null && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

            {folders && folders.length === 0 && !picking && (
                <p className="text-[11px] text-muted-foreground italic">{t('dms.document_folders.in_keinem_ordner_abgelegt')}</p>
            )}

            {folders && folders.length > 0 && (
                <ul className="space-y-1">
                    {folders.map(f => (
                        <li key={f.id} className="group flex items-center gap-1.5 rounded border border-border bg-muted/20 px-2 py-1 text-xs">
                            {f.tree.iconEmoji ? <span>{f.tree.iconEmoji}</span> : <MaterialIcon name="folder" size={16} className="size-3 text-muted-foreground" />}
                            <span className="text-muted-foreground">{f.tree.name}</span>
                            <MaterialIcon name="chevron_right" size={16} className="size-3 text-muted-foreground" />
                            <span className="flex-1 truncate font-medium">{f.name}</span>
                            <button
                                onClick={() => remove(f.id)}
                                className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                                title={t('dms.document_folders.aus_ordner_entfernen')}
                            >
                                <MaterialIcon name="close" size={16} className="size-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {picking && <FolderPicker onPick={place} onCancel={() => setPicking(false)} />}
        </div>
    );
}

function FolderPicker({ onPick, onCancel }: { onPick: (folderId: string) => void; onCancel: () => void }): JSX.Element {
    const t = useT();
    const { trees, loading } = useFolderTrees();
    const [selectedTreeId, setSelectedTreeId] = useState<string>('');

    const tree = trees.find(_t => _t.id === selectedTreeId);

    return (
        <div className="mt-2 rounded border border-primary/40 bg-background p-2 space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium">{t('dms.document_folders.ordner_waehlen')}</p>
                <button onClick={onCancel} className="rounded p-0.5 hover:bg-muted">
                    <MaterialIcon name="close" size={16} className="size-3" />
                </button>
            </div>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {!loading && trees.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">{t('dms.document_folders.noch_keine_ordner-hierarchien_angelegt_s')}</p>
            )}
            {!loading && trees.length > 0 && (
                <>
                    <select
                        value={selectedTreeId}
                        onChange={e => setSelectedTreeId(e.target.value)}
                        className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
                    >
                        <option value="">{t('dms.document_folders.hierarchie_waehlen')}</option>
                        {trees.map(_t => <option key={_t.id} value={_t.id}>{_t.iconEmoji ? `${_t.iconEmoji} ${_t.name}` : _t.name}</option>)}
                    </select>
                    {tree && <FolderTreePicker tree={tree} onPick={onPick} />}
                </>
            )}
        </div>
    );
}

function FolderTreePicker({ tree, onPick }: { tree: FolderTreeNode; onPick: (folderId: string) => void }): JSX.Element {
    const t = useT();
    const rootFolders = tree.folders.filter(f => !f.parentId);
    if (rootFolders.length === 0) {
        return <p className="text-[11px] text-muted-foreground italic">{t('dms.document_folders.hierarchie_ist_leer')}</p>;
    }
    return (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-border bg-muted/10 p-1">
            {rootFolders.map(f => <PickerRow key={f.id} folder={f} allFolders={tree.folders} depth={0} onPick={onPick} />)}
        </ul>
    );
}

function PickerRow({ folder, allFolders, depth, onPick }: {
    folder: { id: string; name: string; iconEmoji: string | null; parentId: string | null };
    allFolders: Array<{ id: string; name: string; iconEmoji: string | null; parentId: string | null }>;
    depth: number;
    onPick: (folderId: string) => void;
}): JSX.Element {
    const children = allFolders.filter(f => f.parentId === folder.id);
    return (
        <>
            <li>
                <button
                    onClick={() => onPick(folder.id)}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-primary/10"
                    style={{ paddingLeft: `${6 + depth * 12}px` }}
                >
                    {folder.iconEmoji ? <span>{folder.iconEmoji}</span> : <MaterialIcon name="folder" size={16} className="size-3 text-muted-foreground" />}
                    <span>{folder.name}</span>
                </button>
            </li>
            {children.map(c => <PickerRow key={c.id} folder={c} allFolders={allFolders} depth={depth + 1} onPick={onPick} />)}
        </>
    );
}

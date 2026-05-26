/**
 * folder-trees-sidebar — Sidebar-Sektion fuer mehrfache Ordnerhierarchien.
 *
 * Pro Tree ein eigener kollabierbarer Block mit Folder-Tree (rekursiv).
 * Klick auf Folder selektiert ihn (lift onSelect-Callback nach oben →
 * Hauptbereich filtert auf documents in dem folder).
 *
 * Edit-Mode (Plus-Button): neuen Tree / neue Folder anlegen, umbenennen,
 * loeschen.
 */

import { type JSX, useState } from 'react';
import { Plus, Folder, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useFolderTrees, folderTreesApi, type FolderTreeNode, type FolderNode } from './use-folder-trees';
import { useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    selectedFolderId: string | null;
    onSelectFolder: (folder: { id: string; name: string; treeName: string } | null) => void;
}

export function FolderTreesSidebar({ selectedFolderId, onSelectFolder }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const { trees, loading, refresh } = useFolderTrees();
    const [creatingTree, setCreatingTree] = useState(false);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggleTreeCollapsed = (treeId: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(treeId)) next.delete(treeId); else next.add(treeId);
            return next;
        });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('dms.folder_trees_sidebar.ordnersysteme')}</h3>
                {isAdmin && (
                    <button
                        onClick={() => setCreatingTree(true)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t('dms.folder_trees_sidebar.neue_ordnerhierarchie')}
                    >
                        <MaterialIcon name="add" size={16} className="size-3.5" />
                    </button>
                )}
            </div>

            {loading && (
                <div className="flex justify-center py-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>
            )}

            {!loading && trees.length === 0 && !creatingTree && (
                <p className="px-2 text-[11px] text-muted-foreground">
                    {t('dms.folder_trees_sidebar.noch_keine_hierarchien')}{' '}
                    {isAdmin && <button className="underline" onClick={() => setCreatingTree(true)}>{t('dms.folder_trees_sidebar.erste_anlegen')}</button>}
                </p>
            )}

            {creatingTree && jwt && (
                <CreateTreeForm jwt={jwt} onDone={() => { setCreatingTree(false); refresh(); }} />
            )}

            {trees.map(tree => (
                <TreeBlock
                    key={tree.id}
                    tree={tree}
                    collapsed={collapsed.has(tree.id)}
                    onToggleCollapse={() => toggleTreeCollapsed(tree.id)}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={onSelectFolder}
                    isAdmin={isAdmin}
                    refresh={refresh}
                />
            ))}
        </div>
    );
}

// ─── Tree-Block ──────────────────────────────────────────────────────────────

function TreeBlock({ tree, collapsed, onToggleCollapse, selectedFolderId, onSelectFolder, isAdmin, refresh }: {
    tree: FolderTreeNode;
    collapsed: boolean;
    onToggleCollapse: () => void;
    selectedFolderId: string | null;
    onSelectFolder: Props['onSelectFolder'];
    isAdmin: boolean;
    refresh: () => void;
}): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [creatingFolder, setCreatingFolder] = useState<string | null>(null); // parentId or 'ROOT'
    const [editing, setEditing] = useState(false);

    // Tree-Folders zu Hierarchie aufbauen
    const rootFolders = tree.folders.filter(f => !f.parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    return (
        <div className="rounded-md border border-border/50 bg-muted/20">
            <div className="flex items-center px-1.5 py-1 gap-1">
                <button onClick={onToggleCollapse} className="rounded p-0.5 hover:bg-muted">
                    {collapsed ? <MaterialIcon name="chevron_right" size={16} className="size-3.5" /> : <MaterialIcon name="expand_more" size={16} className="size-3.5" />}
                </button>
                {tree.iconEmoji ? <span className="text-sm">{tree.iconEmoji}</span> : <MaterialIcon name="account_tree" size={16} className="size-3.5 text-muted-foreground" />}
                <span className="flex-1 truncate text-xs font-medium">{tree.name}</span>
                {isAdmin && (
                    <>
                        <button
                            onClick={() => setCreatingFolder('ROOT')}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('dms.folder_trees_sidebar.ordner_unter_dieser_hierarchie')}
                        >
                            <MaterialIcon name="add" size={16} className="size-3" />
                        </button>
                        <button
                            onClick={() => setEditing(!editing)}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('dms.folder_trees_sidebar.bearbeiten')}
                        >
                            <MaterialIcon name="edit" size={16} className="size-3" />
                        </button>
                    </>
                )}
            </div>

            {!collapsed && (
                <>
                    {editing && jwt && (
                        <EditTreeForm
                            jwt={jwt}
                            tree={tree}
                            onDone={() => { setEditing(false); refresh(); }}
                        />
                    )}
                    {creatingFolder === 'ROOT' && jwt && (
                        <div className="px-2 py-1">
                            <CreateFolderForm
                                jwt={jwt}
                                treeId={tree.id}
                                parentId={null}
                                onDone={() => { setCreatingFolder(null); refresh(); }}
                            />
                        </div>
                    )}
                    <div className="pb-1">
                        {rootFolders.length === 0 && !creatingFolder && (
                            <p className="px-3 py-1 text-[11px] text-muted-foreground italic">leer</p>
                        )}
                        {rootFolders.map(f => (
                            <FolderRow
                                key={f.id}
                                folder={f}
                                allFolders={tree.folders}
                                treeName={tree.name}
                                depth={0}
                                selectedFolderId={selectedFolderId}
                                onSelectFolder={onSelectFolder}
                                isAdmin={isAdmin}
                                refresh={refresh}
                                creatingFolder={creatingFolder}
                                setCreatingFolder={setCreatingFolder}
                                treeId={tree.id}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Folder-Row (rekursiv) ────────────────────────────────────────────────────

function FolderRow({ folder, allFolders, treeName, depth, selectedFolderId, onSelectFolder, isAdmin, refresh, creatingFolder, setCreatingFolder, treeId }: {
    folder: FolderNode;
    allFolders: FolderNode[];
    treeName: string;
    depth: number;
    selectedFolderId: string | null;
    onSelectFolder: Props['onSelectFolder'];
    isAdmin: boolean;
    refresh: () => void;
    creatingFolder: string | null;
    setCreatingFolder: (v: string | null) => void;
    treeId: string;
}): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const children = allFolders
        .filter(f => f.parentId === folder.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const [collapsed, setCollapsed] = useState(true);
    const [editing, setEditing] = useState(false);
    const isSelected = selectedFolderId === folder.id;
    const hasChildren = children.length > 0;

    const handleDelete = async () => {
        if (!jwt) return;
        if (!confirm(`Ordner "${folder.name}" loeschen?\n\nUnter-Ordner werden mit-geloescht. Documents bleiben im DMS, sie verlieren nur die Folder-Zuordnung.`)) return;
        try {
            await folderTreesApi.deleteFolder(jwt, folder.id);
            if (isSelected) onSelectFolder(null);
            refresh();
        } catch (e) {
            alert('Loeschen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <>
            <div
                className={cn(
                    'group flex items-center gap-1 py-0.5 cursor-pointer hover:bg-muted/50',
                    isSelected && 'bg-primary/10',
                )}
                style={{ paddingLeft: `${8 + depth * 12}px` }}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
                    className={cn('rounded p-0.5', !hasChildren && 'invisible')}
                >
                    {collapsed ? <MaterialIcon name="chevron_right" size={16} className="size-3" /> : <MaterialIcon name="expand_more" size={16} className="size-3" />}
                </button>
                <button
                    onClick={() => onSelectFolder({ id: folder.id, name: folder.name, treeName })}
                    className="flex flex-1 items-center gap-1.5 text-left min-w-0"
                >
                    {folder.iconEmoji ? <span className="text-xs">{folder.iconEmoji}</span> : (
                        isSelected || !collapsed ? <MaterialIcon name="folder_open" size={16} className="size-3 text-muted-foreground" /> : <MaterialIcon name="folder" size={16} className="size-3 text-muted-foreground" />
                    )}
                    <span className="truncate text-xs">{folder.name}</span>
                    {(folder.documentCount ?? 0) > 0 && (
                        <span className="text-[10px] text-muted-foreground">({folder.documentCount})</span>
                    )}
                </button>
                {isAdmin && (
                    <div className="flex opacity-0 group-hover:opacity-100">
                        <button
                            onClick={(e) => { e.stopPropagation(); setCreatingFolder(folder.id); }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('dms.folder_trees_sidebar.unter-ordner_anlegen')}
                        >
                            <MaterialIcon name="add" size={16} className="size-3" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setEditing(!editing); }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('dms.folder_trees_sidebar.umbenennen')}
                        >
                            <MaterialIcon name="edit" size={16} className="size-3" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); void handleDelete(); }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                            title={t('dms.folder_trees_sidebar.loeschen')}
                        >
                            <MaterialIcon name="delete" size={16} className="size-3" />
                        </button>
                    </div>
                )}
            </div>
            {editing && jwt && (
                <div style={{ paddingLeft: `${24 + depth * 12}px` }}>
                    <EditFolderForm jwt={jwt} folder={folder} onDone={() => { setEditing(false); refresh(); }} />
                </div>
            )}
            {creatingFolder === folder.id && jwt && (
                <div style={{ paddingLeft: `${24 + depth * 12}px` }}>
                    <CreateFolderForm
                        jwt={jwt}
                        treeId={treeId}
                        parentId={folder.id}
                        onDone={() => { setCreatingFolder(null); refresh(); }}
                    />
                </div>
            )}
            {!collapsed && children.map(c => (
                <FolderRow
                    key={c.id}
                    folder={c}
                    allFolders={allFolders}
                    treeName={treeName}
                    depth={depth + 1}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={onSelectFolder}
                    isAdmin={isAdmin}
                    refresh={refresh}
                    creatingFolder={creatingFolder}
                    setCreatingFolder={setCreatingFolder}
                    treeId={treeId}
                />
            ))}
        </>
    );
}

// ─── Inline-Forms ─────────────────────────────────────────────────────────────

function CreateTreeForm({ jwt, onDone }: { jwt: string; onDone: () => void }): JSX.Element {
    const t = useT();
    const [name, setName] = useState('');
    const [emoji, setEmoji] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            await folderTreesApi.createTree(jwt, { name: name.trim(), iconEmoji: emoji.trim() || undefined });
            onDone();
        } catch (e) {
            alert('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex items-center gap-1 px-1 py-1 rounded-md border border-primary bg-background">
            <input
                value={emoji}
                onChange={e => setEmoji(e.target.value.slice(0, 2))}
                placeholder="📂"
                className="w-8 rounded border border-border px-1 py-0.5 text-center text-xs"
            />
            <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onDone(); }}
                placeholder={t('dms.folder_trees_sidebar.zb_schuljahr')}
                className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs"
            />
            <button onClick={submit} disabled={saving || !name.trim()} className="rounded bg-primary p-0.5 text-primary-foreground disabled:opacity-50">
                <MaterialIcon name="check" size={16} className="size-3" />
            </button>
            <button onClick={onDone} className="rounded p-0.5 hover:bg-muted">
                <MaterialIcon name="close" size={16} className="size-3" />
            </button>
        </div>
    );
}

function EditTreeForm({ jwt, tree, onDone }: { jwt: string; tree: FolderTreeNode; onDone: () => void }): JSX.Element {
    const t = useT();
    const [name, setName] = useState(tree.name);
    const [emoji, setEmoji] = useState(tree.iconEmoji ?? '');

    const submit = async () => {
        try {
            await folderTreesApi.patchTree(jwt, tree.id, { name: name.trim(), iconEmoji: emoji.trim() });
            onDone();
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    const remove = async () => {
        if (!confirm(`Hierarchie "${tree.name}" mit allen Ordnern loeschen?\n\nDocuments bleiben im DMS, sie verlieren nur die Folder-Zuordnung.`)) return;
        try {
            await folderTreesApi.deleteTree(jwt, tree.id);
            onDone();
        } catch (e) {
            alert('Loeschen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="mx-1 rounded border border-primary/50 bg-background p-1.5 space-y-1">
            <div className="flex gap-1">
                <input value={emoji} onChange={e => setEmoji(e.target.value.slice(0, 2))} className="w-8 rounded border border-border px-1 py-0.5 text-xs" />
                <input value={name} onChange={e => setName(e.target.value)} className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs" />
            </div>
            <div className="flex gap-1">
                <button onClick={submit} className="flex-1 rounded bg-primary py-0.5 text-[11px] text-primary-foreground">{t('dms.folder_trees_sidebar.speichern')}</button>
                <button onClick={onDone} className="rounded border border-border px-1.5 py-0.5 text-[11px]">{t('dms.folder_trees_sidebar.abbrechen')}</button>
                <button onClick={remove} className="rounded border border-red-500/40 px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-500/10" title={t('dms.folder_trees_sidebar.loeschen')}>
                    <MaterialIcon name="delete" size={16} className="size-2.5" />
                </button>
            </div>
        </div>
    );
}

function CreateFolderForm({ jwt, treeId, parentId, onDone }: { jwt: string; treeId: string; parentId: string | null; onDone: () => void }): JSX.Element {
    const t = useT();
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            await folderTreesApi.createFolder(jwt, { treeId, parentId: parentId ?? undefined, name: name.trim() });
            onDone();
        } catch (e) {
            alert('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex items-center gap-1 py-0.5">
            <MaterialIcon name="folder" size={16} className="size-3 text-muted-foreground" />
            <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onDone(); }}
                placeholder={t('dms.folder_trees_sidebar.neuer_ordner')}
                className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
            />
            <button onClick={submit} disabled={saving || !name.trim()} className="rounded bg-primary p-0.5 text-primary-foreground disabled:opacity-50">
                <MaterialIcon name="check" size={16} className="size-3" />
            </button>
            <button onClick={onDone} className="rounded p-0.5 hover:bg-muted">
                <MaterialIcon name="close" size={16} className="size-3" />
            </button>
        </div>
    );
}

function EditFolderForm({ jwt, folder, onDone }: { jwt: string; folder: FolderNode; onDone: () => void }): JSX.Element {
    const [name, setName] = useState(folder.name);

    const submit = async () => {
        try {
            await folderTreesApi.patchFolder(jwt, folder.id, { name: name.trim() });
            onDone();
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="flex items-center gap-1 py-0.5">
            <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onDone(); }}
                className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
            />
            <button onClick={submit} className="rounded bg-primary p-0.5 text-primary-foreground">
                <MaterialIcon name="check" size={16} className="size-3" />
            </button>
            <button onClick={onDone} className="rounded p-0.5 hover:bg-muted">
                <MaterialIcon name="close" size={16} className="size-3" />
            </button>
        </div>
    );
}

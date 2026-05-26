/**
 * DmsSpacesPicker — Spaces + dms_folders in einer einzigen Tree-View.
 *
 * Klick auf einen Space → ?space=<id> in der URL.
 * Klick auf einen Folder → ?folder=<id> in der URL (Container = der Space).
 *
 * Layout: einfaches Filesystem-Tree, keine Boxen/Rahmen pro Space.
 * Subspaces UND Folder erscheinen als Kinder im selben Tree.
 */

import { type JSX, type DragEvent, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSpaces } from '@/features/spaces/use-spaces';
import { useSpaceCan } from '@/core/permissions';
import { buildTree, type SpaceNode } from '@/features/spaces/space-tree';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useDmsFolders, dmsFoldersApi, type DmsFolder } from './use-dms-folders';
import { sessionStore } from '@/core/session/session-store';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    selectedSpaceId: string | null;
    selectedFolderId: string | null;
    onSelectSpace: (id: string | null) => void;
    onSelectFolder: (id: string | null) => void;
}

export function DmsSpacesPicker({ selectedSpaceId, selectedFolderId, onSelectSpace, onSelectFolder }: Props): JSX.Element {
    const t = useT();
    const { spaces, loading } = useSpaces();
    const tree = buildTree(spaces);

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('dms.dms_spaces_picker.spaces')}</h3>
                {(selectedSpaceId || selectedFolderId) && (
                    <button
                        onClick={() => { onSelectSpace(null); onSelectFolder(null); }}
                        title={t('dms.dms_spaces_picker.filter_zuruecksetzen')}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <MaterialIcon name="close" size={14} />
                    </button>
                )}
            </div>

            {loading && spaces.length === 0 && (
                <p className="px-2 text-[11px] text-muted-foreground">{t('dms.dms_spaces_picker.laden')}</p>
            )}

            {!loading && spaces.length === 0 && (
                <p className="px-2 text-[11px] text-muted-foreground">{t('dms.dms_spaces_picker.keine_spaces')}</p>
            )}

            <div>
                {tree.map((node) => (
                    <SpaceRow
                        key={node.space.id}
                        node={node}
                        depth={0}
                        selectedSpaceId={selectedSpaceId}
                        selectedFolderId={selectedFolderId}
                        onSelectSpace={onSelectSpace}
                        onSelectFolder={onSelectFolder}
                    />
                ))}
            </div>
        </div>
    );
}

function SpaceRow({ node, depth, selectedSpaceId, selectedFolderId, onSelectSpace, onSelectFolder }: {
    node: SpaceNode;
    depth: number;
    selectedSpaceId: string | null;
    selectedFolderId: string | null;
    onSelectSpace: (id: string | null) => void;
    onSelectFolder: (id: string | null) => void;
}): JSX.Element {
    const hasSubSpaces = node.children.length > 0;
    // Auto-expand: Root-Level + wenn dieser Space oder einer seiner Folder aktiv ist
    const containsSelectedFolder = !!selectedFolderId && selectedSpaceId === node.space.id;
    const [expanded, setExpanded] = useState(depth < 1 || selectedSpaceId === node.space.id || containsSelectedFolder);
    const [dropOver, setDropOver] = useState(false);
    const isSelected = selectedSpaceId === node.space.id && !selectedFolderId;
    const canWrite = useSpaceCan(node.space.id, 'file:upload');

    const handleDragOver = (e: DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-prilog-doc-id')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropOver(true);
        }
    };
    const handleDrop = async (e: DragEvent) => {
        e.preventDefault();
        setDropOver(false);
        const docId = e.dataTransfer.getData('application/x-prilog-doc-id');
        if (!docId) return;
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        try {
            await dmsFoldersApi.moveDoc(jwt, docId, null);
            const { toast } = await import('@/components/ui/toast');
            toast.success(`Verschoben in ${node.space.name} (Root)`);
        } catch (e2) {
            alert('Verschieben fehlgeschlagen: ' + (e2 instanceof Error ? e2.message : String(e2)));
        }
    };

    return (
        <>
            <div
                onDragOver={handleDragOver}
                onDragLeave={() => setDropOver(false)}
                onDrop={handleDrop}
                className={cn(
                    'group flex items-center gap-1 py-1.5 cursor-pointer rounded hover:bg-muted/50',
                    isSelected && 'bg-primary/10',
                    dropOver && 'bg-primary/20 ring-1 ring-primary',
                )}
                style={{ paddingLeft: `${4 + depth * 14}px` }}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className="rounded p-0.5 text-muted-foreground"
                    title={expanded ? 'Einklappen' : 'Ausklappen'}
                >
                    <MaterialIcon name={expanded ? 'expand_more' : 'chevron_right'} size={18} />
                </button>
                <button
                    onClick={() => {
                        onSelectSpace(node.space.id);
                        onSelectFolder(null);
                        if (!expanded) setExpanded(true);
                    }}
                    className="flex flex-1 items-center gap-2 text-left min-w-0 pr-1"
                >
                    <MaterialIcon
                        name={isSelected || expanded ? 'folder_open' : 'folder'}
                        size={20}
                        fill={1}
                        className="shrink-0"
                        style={{ color: node.rootColor || '#94a3b8' }}
                    />
                    <span className={cn('truncate text-[13px]', isSelected ? 'font-medium text-primary' : 'text-foreground')}>
                        {node.space.name}
                    </span>
                </button>
            </div>
            {expanded && (
                <>
                    {/* Sub-Spaces */}
                    {hasSubSpaces && node.children.map((child) => (
                        <SpaceRow
                            key={child.space.id}
                            node={child}
                            depth={depth + 1}
                            selectedSpaceId={selectedSpaceId}
                            selectedFolderId={selectedFolderId}
                            onSelectSpace={onSelectSpace}
                            onSelectFolder={onSelectFolder}
                        />
                    ))}
                    {/* Folder dieses Spaces */}
                    <FolderChildren
                        spaceId={node.space.id}
                        parentFolderId={null}
                        depth={depth + 1}
                        selectedFolderId={selectedFolderId && selectedSpaceId === node.space.id ? selectedFolderId : null}
                        onSelectFolder={(id) => { onSelectSpace(node.space.id); onSelectFolder(id); }}
                        canWrite={!!canWrite}
                        rootColor={node.rootColor}
                    />
                </>
            )}
        </>
    );
}

function FolderChildren({ spaceId, parentFolderId, depth, selectedFolderId, onSelectFolder, canWrite, rootColor }: {
    spaceId: string;
    parentFolderId: string | null;
    depth: number;
    selectedFolderId: string | null;
    onSelectFolder: (id: string | null) => void;
    canWrite: boolean;
    rootColor: string | null;
}): JSX.Element {
    const t = useT();
    const { folders, refresh } = useDmsFolders({ spaceId }, parentFolderId);
    const [creating, setCreating] = useState(false);
    return (
        <>
            {folders.map((f) => (
                <FolderRow
                    key={f.id}
                    folder={f}
                    spaceId={spaceId}
                    depth={depth}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={onSelectFolder}
                    canWrite={canWrite}
                    rootColor={rootColor}
                    onChange={refresh}
                />
            ))}
            {canWrite && (
                creating ? (
                    <NewFolderInline
                        spaceId={spaceId}
                        parentId={parentFolderId}
                        depth={depth}
                        onDone={() => { setCreating(false); refresh(); }}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="flex w-full items-center gap-1.5 py-1 text-[12px] text-muted-foreground hover:text-foreground"
                        style={{ paddingLeft: `${4 + depth * 14 + 18}px` }}
                    >
                        <MaterialIcon name="add" size={14} />
                        {t('dms.dms_spaces_picker.neuer_ordner')}
                    </button>
                )
            )}
        </>
    );
}

function FolderRow({ folder, spaceId, depth, selectedFolderId, onSelectFolder, canWrite, rootColor, onChange }: {
    folder: DmsFolder;
    spaceId: string;
    depth: number;
    selectedFolderId: string | null;
    onSelectFolder: (id: string | null) => void;
    canWrite: boolean;
    rootColor: string | null;
    onChange: () => void;
}): JSX.Element {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [dropOver, setDropOver] = useState(false);
    const isSelected = selectedFolderId === folder.id;
    const hasChildren = folder.hasChildren ?? false;

    const handleDragOver = (e: DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-prilog-doc-id')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropOver(true);
        }
    };
    const handleDrop = async (e: DragEvent) => {
        e.preventDefault();
        setDropOver(false);
        const docId = e.dataTransfer.getData('application/x-prilog-doc-id');
        if (!docId) return;
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        try {
            await dmsFoldersApi.moveDoc(jwt, docId, folder.id);
            // Visual feedback via toast
            const { toast } = await import('@/components/ui/toast');
            toast.success(`Verschoben nach "${folder.name}"`);
            onChange();
        } catch (e2) {
            alert('Verschieben fehlgeschlagen: ' + (e2 instanceof Error ? e2.message : String(e2)));
        }
    };

    return (
        <>
            <div
                onDragOver={handleDragOver}
                onDragLeave={() => setDropOver(false)}
                onDrop={handleDrop}
                className={cn(
                    'group flex items-center gap-1 py-1.5 cursor-pointer rounded hover:bg-muted/50',
                    isSelected && 'bg-primary/10',
                    dropOver && 'bg-primary/20 ring-1 ring-primary',
                )}
                style={{ paddingLeft: `${4 + depth * 14}px` }}
            >
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded(!expanded); }}
                    className={cn('rounded p-0.5 text-muted-foreground', !hasChildren && 'invisible')}
                >
                    <MaterialIcon name={expanded ? 'expand_more' : 'chevron_right'} size={18} />
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onSelectFolder(folder.id);
                        // Klick auf den Namen expandiert den Ordner zusaetzlich,
                        // damit man sofort die Subfolder + Inhalte sieht.
                        if (hasChildren && !expanded) setExpanded(true);
                    }}
                    className="flex flex-1 items-center gap-2 text-left min-w-0 pr-1"
                >
                    <MaterialIcon
                        name={isSelected || expanded ? 'folder_open' : 'folder'}
                        size={20}
                        fill={1}
                        className="shrink-0"
                        style={{ color: rootColor ?? '#94a3b8' }}
                    />
                    {editing ? (
                        <RenameInline folder={folder} onDone={() => { setEditing(false); onChange(); }} />
                    ) : (
                        <span className={cn('truncate text-[13px]', isSelected ? 'font-medium text-primary' : 'text-foreground')}>
                            {folder.name}
                        </span>
                    )}
                    {folder.documentCount > 0 && !editing && !isSelected && (
                        <span className="text-[11px] text-muted-foreground">({folder.documentCount})</span>
                    )}
                </button>
                {canWrite && !editing && (
                    <div className="flex shrink-0 items-center gap-0 opacity-0 group-hover:opacity-100">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpanded(true); /* user can use children-add */ }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('dms.dms_spaces_picker.erweitern_und_subfolder_anlegen')}
                        >
                            <MaterialIcon name="add" size={12} />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('dms.dms_spaces_picker.umbenennen')}
                        >
                            <MaterialIcon name="edit" size={12} />
                        </button>
                        <button
                            type="button"
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Ordner "${folder.name}" loeschen?\n(Soft-Delete, 30d wiederherstellbar)`)) return;
                                const jwt = sessionStore.getSnapshot().platform?.token;
                                if (!jwt) return;
                                await dmsFoldersApi.delete(jwt, folder.id);
                                if (isSelected) onSelectFolder(null);
                                onChange();
                            }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                            title={t('dms.dms_spaces_picker.loeschen')}
                        >
                            <MaterialIcon name="delete" size={12} />
                        </button>
                    </div>
                )}
            </div>
            {expanded && (
                <FolderChildren
                    spaceId={spaceId}
                    parentFolderId={folder.id}
                    depth={depth + 1}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={onSelectFolder}
                    canWrite={canWrite}
                    rootColor={rootColor}
                />
            )}
        </>
    );
}

function NewFolderInline({ spaceId, parentId, depth, onDone }: {
    spaceId: string;
    parentId: string | null;
    depth: number;
    onDone: () => void;
}): JSX.Element {
    const t = useT();
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (!name.trim()) { onDone(); return; }
        setBusy(true);
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) { setBusy(false); return; }
        try {
            await dmsFoldersApi.create(jwt, { spaceId, parentId: parentId ?? undefined, name: name.trim() });
        } catch (e) {
            alert('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
            onDone();
        }
    };
    return (
        <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: `${4 + depth * 12 + 14}px` }}>
            <MaterialIcon name="folder" size={14} fill={1} className="text-muted-foreground" />
            <input
                autoFocus
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit();
                    if (e.key === 'Escape') onDone();
                }}
                onBlur={submit}
                placeholder={t('dms.dms_spaces_picker.folder-name')}
                className="flex-1 rounded border border-primary/40 bg-background px-1 py-0 text-xs"
            />
        </div>
    );
}

function RenameInline({ folder, onDone }: { folder: DmsFolder; onDone: () => void }): JSX.Element {
    const [name, setName] = useState(folder.name);
    const submit = async () => {
        const t = name.trim();
        if (!t || t === folder.name) { onDone(); return; }
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        try {
            await dmsFoldersApi.patch(jwt, folder.id, { name: t });
        } catch (e) {
            alert('Umbenennen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            onDone();
        }
    };
    return (
        <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onDone(); }}
            onBlur={submit}
            className="rounded border border-primary/40 bg-background px-1 py-0 text-xs"
            style={{ width: '70%' }}
        />
    );
}

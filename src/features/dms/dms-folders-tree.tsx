/**
 * DmsFoldersTree — Lazy-Tree fuer das neue Folder-System.
 *
 * Konzept: prilog_docs/docs/umsetzung/dms-folder-system-konzept.md (v1.2)
 *
 * Wird in DmsWorld pro Space (oder Mein Fach) eingehaengt. Children werden
 * erst beim Expand gefetcht. Selektion via URL-Param `folder=<id>`.
 *
 * Schreibrechte: Caller-Component entscheidet (Space-Member mit `file:upload`
 * oder Mein-Fach-Owner). Bei `canWrite=true` werden Add/Rename/Delete-Actions
 * angezeigt.
 */

import { type JSX, useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { sessionStore } from '@/core/session/session-store';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useDmsFolders, dmsFoldersApi, type DmsFolder } from './use-dms-folders';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    container: { spaceId?: string; meinFach?: boolean };
    selectedFolderId: string | null;
    onSelectFolder: (id: string | null) => void;
    /** Wenn true: Add/Rename/Delete-Actions */
    canWrite: boolean;
    /** Visueller Container — z.B. Space-Farbe fuer das Wurzel-Icon */
    rootColor?: string | null;
}

export function DmsFoldersTree({ container, selectedFolderId, onSelectFolder, canWrite, rootColor }: Props): JSX.Element {
    const t = useT();
    const [creatingAt, setCreatingAt] = useState<string | null | 'ROOT'>(null);
    const { folders, loading, refresh } = useDmsFolders(container, null);

    return (
        <div className="space-y-0.5">
            {loading && folders.length === 0 && (
                <p className="px-2 text-[11px] text-muted-foreground">{t('dms.dms_folders_tree.laden')}</p>
            )}
            {folders.map((f) => (
                <FolderRow
                    key={f.id}
                    folder={f}
                    container={container}
                    depth={0}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={onSelectFolder}
                    canWrite={canWrite}
                    onChange={refresh}
                    rootColor={rootColor ?? null}
                />
            ))}
            {canWrite && (
                creatingAt === 'ROOT' ? (
                    <NewFolderInline
                        container={container}
                        parentId={null}
                        depth={0}
                        onDone={() => { setCreatingAt(null); refresh(); }}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => setCreatingAt('ROOT')}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <MaterialIcon name="add" size={14} />
                        {t('dms.dms_folders_tree.neuer_ordner')}
                    </button>
                )
            )}
        </div>
    );
}

function FolderRow({ folder, container, depth, selectedFolderId, onSelectFolder, canWrite, onChange, rootColor }: {
    folder: DmsFolder;
    container: { spaceId?: string; meinFach?: boolean };
    depth: number;
    selectedFolderId: string | null;
    onSelectFolder: (id: string | null) => void;
    canWrite: boolean;
    onChange: () => void;
    rootColor: string | null;
}): JSX.Element {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [creatingChild, setCreatingChild] = useState(false);
    const isSelected = selectedFolderId === folder.id;
    const hasChildren = folder.hasChildren ?? false;

    return (
        <>
            <div
                className={cn(
                    'group flex items-center gap-1 py-0.5 cursor-pointer hover:bg-muted/50',
                    isSelected && 'bg-primary/10',
                )}
                style={{ paddingLeft: `${4 + depth * 12}px` }}
            >
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className={cn('rounded p-0.5', !hasChildren && 'invisible')}
                    title={expanded ? 'Einklappen' : 'Ausklappen'}
                >
                    <MaterialIcon name={expanded ? 'expand_more' : 'chevron_right'} size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => onSelectFolder(folder.id)}
                    className="flex flex-1 items-center gap-1.5 text-left min-w-0 pr-1"
                >
                    <MaterialIcon
                        name={isSelected || expanded ? 'folder_open' : 'folder'}
                        size={16}
                        fill={1}
                        className="shrink-0"
                        style={{ color: rootColor ?? '#94a3b8' }}
                    />
                    <span className={cn('truncate text-xs', isSelected ? 'font-medium text-primary' : 'text-foreground')}>
                        {editing ? (
                            <RenameInline
                                folder={folder}
                                onDone={() => { setEditing(false); onChange(); }}
                            />
                        ) : folder.name}
                    </span>
                    {folder.documentCount > 0 && !isSelected && (
                        <span className="text-[10px] text-muted-foreground">({folder.documentCount})</span>
                    )}
                </button>
                {canWrite && !editing && (
                    <div className="flex shrink-0 items-center gap-0 opacity-0 group-hover:opacity-100">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setCreatingChild(true); setExpanded(true); }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('dms.dms_folders_tree.unterordner_anlegen')}
                        >
                            <MaterialIcon name="add" size={12} />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('dms.dms_folders_tree.umbenennen')}
                        >
                            <MaterialIcon name="edit" size={12} />
                        </button>
                        <button
                            type="button"
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Ordner "${folder.name}" loeschen?\nUnterordner werden mit-geloescht (Soft-Delete, 30d wiederherstellbar).`)) return;
                                const jwt = sessionStore.getSnapshot().platform?.token;
                                if (!jwt) return;
                                await dmsFoldersApi.delete(jwt, folder.id);
                                if (isSelected) onSelectFolder(null);
                                onChange();
                            }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                            title={t('dms.dms_folders_tree.loeschen')}
                        >
                            <MaterialIcon name="delete" size={12} />
                        </button>
                    </div>
                )}
            </div>
            {expanded && <ChildrenList
                container={container}
                parentId={folder.id}
                depth={depth + 1}
                selectedFolderId={selectedFolderId}
                onSelectFolder={onSelectFolder}
                canWrite={canWrite}
                creatingChild={creatingChild}
                onChildCreateDone={() => { setCreatingChild(false); /* parent re-render to update hasChildren */ onChange(); }}
                rootColor={rootColor}
            />}
        </>
    );
}

function ChildrenList({ container, parentId, depth, selectedFolderId, onSelectFolder, canWrite, creatingChild, onChildCreateDone, rootColor }: {
    container: { spaceId?: string; meinFach?: boolean };
    parentId: string;
    depth: number;
    selectedFolderId: string | null;
    onSelectFolder: (id: string | null) => void;
    canWrite: boolean;
    creatingChild: boolean;
    onChildCreateDone: () => void;
    rootColor: string | null;
}): JSX.Element {
    const { folders, refresh } = useDmsFolders(container, parentId);
    return (
        <>
            {folders.map((f) => (
                <FolderRow
                    key={f.id}
                    folder={f}
                    container={container}
                    depth={depth}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={onSelectFolder}
                    canWrite={canWrite}
                    onChange={refresh}
                    rootColor={rootColor}
                />
            ))}
            {creatingChild && (
                <NewFolderInline
                    container={container}
                    parentId={parentId}
                    depth={depth}
                    onDone={() => { refresh(); onChildCreateDone(); }}
                />
            )}
        </>
    );
}

function NewFolderInline({ container, parentId, depth, onDone }: {
    container: { spaceId?: string; meinFach?: boolean };
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
            await dmsFoldersApi.create(jwt, {
                spaceId: container.spaceId,
                meinFach: container.meinFach,
                parentId: parentId ?? undefined,
                name: name.trim(),
            });
        } catch (e) {
            alert('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
            onDone();
        }
    };
    return (
        <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: `${20 + depth * 12}px` }}>
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
                placeholder={t('dms.dms_folders_tree.ordner-name')}
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

/**
 * DmsFolderPickerModal — Folder-Picker fuer "Doc verschieben".
 *
 * Zeigt eine lazy-Tree-Ansicht der Folder im aktuellen Container und
 * laesst den User einen Ziel-Folder auswaehlen. "Root" ist immer eine
 * Option (= folderId NULL).
 */

import { type JSX, useState } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { dmsFoldersApi, useDmsFolders, type DmsFolder } from './use-dms-folders';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    container: { spaceId?: string; meinFach?: boolean };
    documentId: string;
    currentFolderId: string | null;
    onClose: () => void;
    onMoved: (folderId: string | null) => void;
}

export function DmsFolderPickerModal({ container, documentId, currentFolderId, onClose, onMoved }: Props): JSX.Element {
    const t = useT();
    const [selected, setSelected] = useState<string | null>(currentFolderId);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        setBusy(true);
        try {
            await dmsFoldersApi.moveDoc(jwt, documentId, selected);
            onMoved(selected);
            onClose();
        } catch (e) {
            alert('Verschieben fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="flex w-full max-w-sm flex-col rounded-lg bg-background shadow-xl max-h-[70vh]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <MaterialIcon name="drive_file_move" size={18} />
                        {t('dms.dms_folder_picker_modal.verschieben_nach')}
                    </h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {/* Root als Option */}
                    <button
                        onClick={() => setSelected(null)}
                        className={cn(
                            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                            selected === null && 'bg-primary/10 text-primary',
                        )}
                    >
                        <MaterialIcon name="home" size={16} />
                        <span>{t('dms.dms_folder_picker_modal.root')}{container.meinFach ? 'Mein Fach' : 'Space'})</span>
                    </button>
                    <PickerLevel
                        container={container}
                        parentId={null}
                        depth={0}
                        selectedId={selected}
                        onSelect={setSelected}
                    />
                </div>
                <div className="flex justify-end gap-2 border-t border-border p-3">
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="rounded border border-border px-3 py-1.5 text-xs"
                    >
                        {t('dms.dms_folder_picker_modal.abbrechen')}
                    </button>
                    <button
                        onClick={submit}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="check" size={14} />}
                        {t('dms.dms_folder_picker_modal.verschieben')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PickerLevel({ container, parentId, depth, selectedId, onSelect }: {
    container: { spaceId?: string; meinFach?: boolean };
    parentId: string | null;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
}): JSX.Element {
    const t = useT();
    const { folders, loading } = useDmsFolders(container, parentId);
    if (loading && folders.length === 0) {
        return <div className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />{t('dms.dms_folder_picker_modal.laden')}
        </div>;
    }
    return (
        <>
            {folders.map((f) => (
                <PickerNode
                    key={f.id}
                    container={container}
                    folder={f}
                    depth={depth + 1}
                    selectedId={selectedId}
                    onSelect={onSelect}
                />
            ))}
        </>
    );
}

function PickerNode({ container, folder, depth, selectedId, onSelect }: {
    container: { spaceId?: string; meinFach?: boolean };
    folder: DmsFolder;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
}): JSX.Element {
    const [expanded, setExpanded] = useState(false);
    const isSelected = selectedId === folder.id;
    const hasChildren = folder.hasChildren ?? false;
    return (
        <>
            <div
                className={cn(
                    'flex items-center gap-1 py-0.5 cursor-pointer hover:bg-muted/50',
                    isSelected && 'bg-primary/10',
                )}
                style={{ paddingLeft: `${4 + depth * 12}px` }}
            >
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className={cn('rounded p-0.5', !hasChildren && 'invisible')}
                >
                    <MaterialIcon name={expanded ? 'expand_more' : 'chevron_right'} size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => onSelect(folder.id)}
                    className="flex flex-1 items-center gap-1.5 text-left min-w-0"
                >
                    <MaterialIcon name={expanded ? 'folder_open' : 'folder'} size={14} fill={1} />
                    <span className={cn('truncate text-xs', isSelected && 'font-medium text-primary')}>
                        {folder.name}
                    </span>
                </button>
            </div>
            {expanded && (
                <PickerLevel
                    container={container}
                    parentId={folder.id}
                    depth={depth}
                    selectedId={selectedId}
                    onSelect={onSelect}
                />
            )}
        </>
    );
}

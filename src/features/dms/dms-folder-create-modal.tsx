/**
 * DmsFolderCreateModal — minimaler Dialog zum Anlegen eines Folders.
 *
 * Aufrufkontext-abhaengig:
 *   - Space-Kontext: Container = { spaceId }, parentId optional aus URL
 *   - Mein Fach: Container = { meinFach: true }
 */

import { type JSX, useState } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { dmsFoldersApi } from './use-dms-folders';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Loader2 } from 'lucide-react';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    container: { spaceId?: string; meinFach?: boolean };
    parentId?: string | null;
    onClose: () => void;
    onCreated?: (folder: { id: string; name: string }) => void;
}

export function DmsFolderCreateModal({ container, parentId, onClose, onCreated }: Props): JSX.Element {
    const t = useT();
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        const t = name.trim();
        if (!t) return;
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        setBusy(true);
        try {
            const r = await dmsFoldersApi.create(jwt, {
                spaceId: container.spaceId,
                meinFach: container.meinFach,
                parentId: parentId ?? undefined,
                name: t,
            });
            onCreated?.(r.folder);
            onClose();
        } catch (e) {
            alert('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-sm rounded-lg bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <MaterialIcon name="create_new_folder" size={18} />
                        {t('dms.dms_folder_create_modal.neuer_folder')}
                    </h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} />
                    </button>
                </div>
                <div className="p-4">
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t('dms.dms_folder_create_modal.name')}
                    </label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        placeholder={t('dms.dms_folder_create_modal.zb_mathe')}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') void submit();
                            if (e.key === 'Escape') onClose();
                        }}
                        className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    />
                </div>
                <div className="flex justify-end gap-2 border-t border-border p-3">
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="rounded border border-border px-3 py-1.5 text-xs"
                    >
                        {t('dms.dms_folder_create_modal.abbrechen')}
                    </button>
                    <button
                        onClick={submit}
                        disabled={busy || !name.trim()}
                        className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="add" size={14} />}
                        {t('dms.dms_folder_create_modal.anlegen')}
                    </button>
                </div>
            </div>
        </div>
    );
}

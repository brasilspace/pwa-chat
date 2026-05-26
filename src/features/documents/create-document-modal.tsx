/**
 * CreateDocumentModal — "Neues Dokument" Dialog (leeres Markdown).
 *
 * Erzeugt ein leeres .md-File ueber den Standard-Upload-Flow
 * (request-upload → PUT → confirm). Nach Erstellen ruft `onCreated`
 * mit dem neuen Dokument zurueck — der Caller entscheidet, ob er den
 * Editor oeffnet oder die Liste refresht.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useSpaces } from '@/features/spaces/use-spaces';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { meinFachApi } from '@/features/mein-fach/use-mein-fach';
import type { DocumentItem } from '@/features/project/project-types';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    onClose: () => void;
    onCreated: (doc: DocumentItem) => void;
    /** Wenn gesetzt: Default-Scope=SPACE mit dieser ID, kein Scope-Switch. */
    spaceId?: string;
}

const gateway = createProjectGateway();

export function CreateDocumentModal({ onClose, onCreated, spaceId }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { spaces } = useSpaces();

    const [title, setTitle] = useState('');
    const [scope, setScope] = useState<'PERSONAL' | 'SPACE'>(spaceId ? 'SPACE' : 'PERSONAL');
    const [chosenSpaceId, setChosenSpaceId] = useState(spaceId ?? '');
    const [busy, setBusy] = useState(false);

    const create = async () => {
        if (!jwt) return;
        const t = title.trim();
        if (!t) return;
        if (scope === 'SPACE' && !chosenSpaceId) { alert('Bitte Space auswaehlen'); return; }

        setBusy(true);
        try {
            const fileName = t.endsWith('.md') ? t : `${t}.md`;
            const body = `# ${t}\n\n`;
            const blob = new Blob([body], { type: 'text/markdown' });

            if (scope === 'SPACE') {
                const { uploadUrl, storageKey } = await gateway.requestDocumentUpload(jwt, chosenSpaceId, {
                    fileName, mimeType: 'text/markdown', sizeBytes: blob.size,
                });
                await fetch(uploadUrl, {
                    method: 'PUT', body: blob,
                    headers: { 'Content-Type': 'text/markdown' },
                });
                const { document } = await gateway.confirmDocumentUpload(jwt, chosenSpaceId, {
                    storageKey, fileName, mimeType: 'text/markdown', sizeBytes: blob.size,
                });
                onCreated(document);
            } else {
                // PERSONAL — Mein-Fach Pipeline
                const { uploadUrl, storageKey } = await meinFachApi.getUploadUrl({
                    fileName, mimeType: 'text/markdown', sizeBytes: blob.size,
                });
                await fetch(uploadUrl.url, {
                    method: 'PUT', body: blob,
                    headers: { 'Content-Type': 'text/markdown' },
                });
                const mfDoc = await meinFachApi.confirmUpload({
                    storageKey, fileName, mimeType: 'text/markdown', sizeBytes: blob.size,
                });
                // Mein-Fach-Doc auf DocumentItem mappen (Pflichtfelder)
                onCreated({
                    id: mfDoc.id,
                    spaceId: '',
                    title: mfDoc.title ?? fileName,
                    description: mfDoc.description ?? null,
                    mimeType: 'text/markdown',
                    sizeBytes: blob.size,
                    uploadedBy: mfDoc.uploadedBy ?? '',
                    fileHash: null,
                    starred: mfDoc.starred ?? false,
                    locked: false,
                    version: 1,
                    parentId: null,
                    lastOpenedAt: mfDoc.lastOpenedAt ?? null,
                    expiresAt: null,
                    archivedAt: null,
                    createdAt: mfDoc.createdAt ?? new Date().toISOString(),
                    updatedAt: mfDoc.createdAt ?? new Date().toISOString(),
                    tags: [],
                });
            }
        } catch (e) {
            alert('Erstellen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
        }
    };

    const canSubmit = !!title.trim() && (scope === 'PERSONAL' || !!chosenSpaceId) && !busy;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-md flex flex-col rounded-lg bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="flex items-center gap-2 font-semibold">
                        <MaterialIcon name="description" size={16} className="size-4" /> {t('documents.create_document_modal.neues_dokument')}
                    </h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                </div>

                <div className="space-y-3 p-4">
                    <div>
                        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t('documents.create_document_modal.titel')}</label>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder={t('documents.create_document_modal.zb_protokoll_elternabend')}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) create(); }}
                            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                        />
                    </div>

                    {!spaceId && (
                        <>
                            <div className="flex gap-2">
                                <label className={cn('flex-1 cursor-pointer rounded border p-2 text-xs inline-flex items-center gap-2', scope === 'PERSONAL' ? 'border-primary bg-primary/5' : 'border-border')}>
                                    <input type="radio" checked={scope === 'PERSONAL'} onChange={() => setScope('PERSONAL')} className="hidden" />
                                    <MaterialIcon name="person" size={16} className="size-3.5" /> {t('documents.create_document_modal.mein_fach')}
                                </label>
                                <label className={cn('flex-1 cursor-pointer rounded border p-2 text-xs inline-flex items-center gap-2', scope === 'SPACE' ? 'border-primary bg-primary/5' : 'border-border')}>
                                    <input type="radio" checked={scope === 'SPACE'} onChange={() => setScope('SPACE')} className="hidden" />
                                    <MaterialIcon name="groups" size={16} className="size-3.5" /> {t('documents.create_document_modal.in_space')}
                                </label>
                            </div>
                            {scope === 'SPACE' && (
                                <select
                                    value={chosenSpaceId}
                                    onChange={e => setChosenSpaceId(e.target.value)}
                                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                                >
                                    <option value="">{t('documents.create_document_modal.space_auswaehlen')}</option>
                                    {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-border p-3">
                    <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs">{t('documents.create_document_modal.abbrechen')}</button>
                    <button
                        onClick={create}
                        disabled={!canSubmit}
                        className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="description" size={16} className="size-3" />}
                        {t('documents.create_document_modal.erstellen')}
                    </button>
                </div>
            </div>
        </div>
    );
}

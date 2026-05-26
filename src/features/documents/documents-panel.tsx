import { type JSX, useState, useCallback, useRef } from 'react';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { useSpaceDocuments } from './use-documents';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { DocumentItem } from '@/features/project/project-types';
import { FileText, Image, Film, Music, Archive, File, Loader2, Download, Files } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { TemplatePickerModal } from '@/features/dms/template-picker-modal';
import { CreateSheetModal } from '@/features/sheets/create-sheet-modal';
import { SHEET_MIMETYPE } from '@/features/sheets/use-sheets';
import { AudioPlayerModal } from '@/components/audio/audio-player-modal';
import { CreateDocumentModal } from './create-document-modal';
import { useEnabledModules, useSpaceCan } from '@/core/permissions';
import { toast } from '@/components/ui/toast';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useDmsFolders } from '@/features/dms/use-dms-folders';
import { DmsFolderCreateModal } from '@/features/dms/dms-folder-create-modal';
import { useT } from "@/lib/i18n/use-t";

const gateway = createProjectGateway();

// MIME icons
const MIME_ICONS: [RegExp, typeof FileText][] = [
    [/^image\//, Image],
    [/^video\//, Film],
    [/^audio\//, Music],
    [/^application\/pdf/, FileText],
    [/^application\/(zip|rar|7z|tar|gzip)/, Archive],
    [/^text\//, FileText],
];

function getMimeIcon(mimeType: string) {
    for (const [re, Icon] of MIME_ICONS) {
        if (re.test(mimeType)) return Icon;
    }
    return File;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    });
}

export function DocumentsPanel({ space, onEditDocument }: { space: SpaceItem; fullscreen?: boolean; onEditDocument?: (doc: DocumentItem) => void }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const enabledModules = useEnabledModules();
    const hasSheets = enabledModules.has('sheets' as never);

    const [searchQuery, setSearchQuery] = useState('');
    const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
    const [audioPlayer, setAudioPlayer] = useState<{ title: string; downloadUrl: string } | null>(null);
    const [archivingId, setArchivingId] = useState<string | null>(null);
    const currentFolderId = folderPath.length > 0 ? folderPath[folderPath.length - 1].id : null;
    // Root-Level: nur Docs OHNE Folder zeigen (Finder-Style). Bei Suche: alle.
    const docsFolderFilter = currentFolderId
        ? currentFolderId
        : (searchQuery.trim() ? undefined : '__none__');
    const { documents, loading, refresh } = useSpaceDocuments(space.id, { q: searchQuery || undefined, folderId: docsFolderFilter });
    const { folders: subFolders, refresh: refreshFolders } = useDmsFolders({ spaceId: space.id }, currentFolderId);
    const canUpload = useSpaceCan(space.id, 'file:upload');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [showSheetCreate, setShowSheetCreate] = useState(false);
    const [showDocCreate, setShowDocCreate] = useState(false);
    const [showFolderCreate, setShowFolderCreate] = useState(false);

    const handleUpload = useCallback(async (files: FileList | null) => {
        if (!files || !jwt) return;
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const { uploadUrl, storageKey } = await gateway.requestDocumentUpload(jwt, space.id, {
                    fileName: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    sizeBytes: file.size,
                });
                const putRes = await fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': file.type || 'application/octet-stream' },
                });
                if (!putRes.ok) {
                    throw new Error(`Upload fehlgeschlagen: HTTP ${putRes.status}`);
                }
                await gateway.confirmDocumentUpload(jwt, space.id, {
                    storageKey,
                    fileName: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    sizeBytes: file.size,
                    folderId: currentFolderId,
                });
            }
            refresh();
            refreshFolders();
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [jwt, space.id, refresh, refreshFolders, currentFolderId]);

    const handleDownload = useCallback(async (doc: DocumentItem) => {
        if (!jwt) return;
        const { downloadUrl } = await gateway.getDocumentDownloadUrl(jwt, doc.spaceId, doc.id);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = doc.title;
        a.click();
    }, [jwt]);

    const handleDelete = useCallback(async (doc: DocumentItem) => {
        if (!jwt) return;
        await gateway.deleteDocument(jwt, doc.spaceId, doc.id);
        refresh();
    }, [jwt, refresh]);

    const [dragOver, setDragOver] = useState(false);
    const dragCtr = useRef(0);

    return (
        <div
            className="relative flex h-full flex-col"
            onDragEnter={e => { e.preventDefault(); dragCtr.current++; if (e.dataTransfer.types.includes('Files')) setDragOver(true); }}
            onDragLeave={e => { e.preventDefault(); dragCtr.current--; if (dragCtr.current === 0) setDragOver(false); }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); setDragOver(false); dragCtr.current = 0; if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files); }}
        >
            {dragOver && (
                <div className="absolute inset-0 z-50 flex items-center justify-center rounded border-2 border-dashed border-primary bg-primary/5">
                    <div className="text-center">
                        <MaterialIcon name="upload" size={16} className="mx-auto size-6 text-primary" />
                        <p className="mt-1 text-[12px] font-medium text-primary">{t('documents.documents.ablegen')}</p>
                    </div>
                </div>
            )}
            {/* DMS-Toolbar — Aktions-Buttons + Such-Zeile, einheitlich mit documents-hub */}
            <div className="border-b">
                <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
                    <button
                        onClick={() => setShowTemplatePicker(true)}
                        className="inline-flex size-9 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={t('documents.documents.aus_vorlage_anlegen')}
                    >
                        <MaterialIcon name="content_copy" size={20} />
                    </button>
                    {hasSheets && (
                        <button
                            onClick={() => setShowSheetCreate(true)}
                            className="inline-flex size-9 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title={t('documents.documents.neue_tabelle_anlegen')}
                        >
                            <MaterialIcon name="table_chart" size={20} />
                        </button>
                    )}
                    <button
                        onClick={() => setShowDocCreate(true)}
                        className="inline-flex size-9 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={t('documents.documents.neues_dokument_anlegen')}
                    >
                        <MaterialIcon name="description" size={20} />
                    </button>
                    {canUpload && (
                        <button
                            onClick={() => setShowFolderCreate(true)}
                            className="inline-flex size-9 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title={t('documents.documents.neuer_folder')}
                        >
                            <MaterialIcon name="create_new_folder" size={20} />
                        </button>
                    )}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        title={t('documents.documents.hochladen')}
                        className="ml-auto inline-flex size-9 items-center justify-center rounded-[6px] bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                        {uploading ? <Loader2 className="size-5 animate-spin" /> : <MaterialIcon name="upload" size={20} />}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={e => handleUpload(e.target.files)}
                    />
                </div>
                <div className="px-2 pb-1.5">
                    <div className="relative">
                        <MaterialIcon name="search" size={16} className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder={t('documents.documents.suchen')}
                            className="h-7 w-full rounded border bg-background pl-7 pr-2 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                </div>
            </div>

            {/* Modals */}
            {showTemplatePicker && (
                <TemplatePickerModal
                    spaceId={space.id}
                    onClose={() => setShowTemplatePicker(false)}
                    onCreated={(d) => { toast.success(`"${d.title}" erstellt`); refresh(); }}
                />
            )}
            {showSheetCreate && (
                <CreateSheetModal
                    spaceId={space.id}
                    onClose={() => setShowSheetCreate(false)}
                    onCreated={(s) => {
                        setShowSheetCreate(false);
                        toast.success(`Tabelle "${s.title}" erstellt`);
                        navigate(`/sheets/${s.id}`);
                    }}
                />
            )}
            {showDocCreate && (
                <CreateDocumentModal
                    spaceId={space.id}
                    onClose={() => setShowDocCreate(false)}
                    onCreated={(d) => {
                        setShowDocCreate(false);
                        toast.success(`"${d.title}" erstellt`);
                        refresh();
                        navigate(`/documents/${d.id}/edit`);
                    }}
                />
            )}

            {/* Folder-Breadcrumb */}
            {folderPath.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1 text-[11px]">
                    <button
                        onClick={() => setFolderPath([])}
                        className="rounded px-1 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t('documents.documents.zurueck_zur_wurzel')}
                    >
                        <MaterialIcon name="folder_open" size={14} className="inline align-middle" /> {space.name}
                    </button>
                    {folderPath.map((f, i) => (
                        <span key={f.id} className="flex items-center gap-0.5">
                            <MaterialIcon name="chevron_right" size={12} className="text-muted-foreground/60" />
                            <button
                                onClick={() => setFolderPath(folderPath.slice(0, i + 1))}
                                className={`rounded px-1 py-0.5 hover:bg-muted ${i === folderPath.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {f.name}
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Folder-Liste + Document list */}
            <ScrollArea className="flex-1">
                {/* Subfolder als anklickbare Rows */}
                {subFolders.length > 0 && (
                    <div className="divide-y divide-border/40 border-b">
                        {subFolders.map((f) => (
                            <FolderDropRow
                                key={f.id}
                                folder={f}
                                onClick={() => setFolderPath([...folderPath, { id: f.id, name: f.name }])}
                            />
                        ))}
                    </div>
                )}
                {loading ? (
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                ) : documents.length === 0 && subFolders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-8">
                        <MaterialIcon name="description" size={16} className="size-6 text-muted-foreground/30" />
                        <p className="text-[11px] text-muted-foreground">{t('documents.documents.keine_dokumente')}</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border/40">
                        {documents.map(doc => {
                            const Icon = getMimeIcon(doc.mimeType);
                            const isAudio = /^audio\//.test(doc.mimeType) || /\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i.test(doc.title);
                            const editRoute = doc.mimeType === SHEET_MIMETYPE
                                ? `/sheets/${doc.id}`
                                : (doc.mimeType === 'text/markdown' || doc.mimeType === 'text/plain' || /\.(md|markdown|txt)$/i.test(doc.title))
                                    ? `/documents/${doc.id}/edit`
                                    : null;
                            return (
                                <div
                                    key={doc.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('application/x-prilog-doc-id', doc.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDoubleClick={async () => {
                                        if (isAudio && jwt) {
                                            try {
                                                const gw = createProjectGateway();
                                                const { downloadUrl } = await gw.getDocumentDownloadUrl(jwt, space.id, doc.id);
                                                setAudioPlayer({ title: doc.title, downloadUrl });
                                            } catch (e) {
                                                alert('Audio konnte nicht geladen werden: ' + (e instanceof Error ? e.message : String(e)));
                                            }
                                            return;
                                        }
                                        if (editRoute) navigate(editRoute);
                                    }}
                                    className="group flex items-center gap-2.5 px-2.5 py-2 hover:bg-muted/50 cursor-grab"
                                >
                                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate text-[12px] font-medium">{doc.title}</span>
                                            {doc.starred && <MaterialIcon name="star" size={16} className="size-2.5 shrink-0 fill-yellow-400 text-yellow-400" />}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                            <span>{formatSize(doc.sizeBytes)}</span>
                                            <span>·</span>
                                            <span>{formatDate(doc.createdAt)}</span>
                                            {isAudio && doc.spaceName && (
                                                <>
                                                    <span>·</span>
                                                    <span className="flex items-center gap-0.5 truncate" title={t('documents.documents.origin_space', { defaultValue: 'Herkunft-Space' })}>
                                                        <MaterialIcon name="forum" size={16} className="size-2.5" />
                                                        {doc.spaceName}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                                        {onEditDocument && doc.mimeType === 'text/markdown' && (
                                            <button onClick={() => onEditDocument(doc)} className="rounded p-1 hover:bg-primary/10 text-primary" title={t('documents.documents.bearbeiten')}>
                                                <MaterialIcon name="edit" size={16} className="size-3" />
                                            </button>
                                        )}
                                        <button onClick={() => handleDownload(doc)} className="rounded p-1 hover:bg-muted" title={t('documents.documents.download')}>
                                            <MaterialIcon name="download" size={16} className="size-3" />
                                        </button>
                                        {isAudio && jwt && (
                                            <button
                                                disabled={archivingId === doc.id}
                                                onClick={async () => {
                                                    setArchivingId(doc.id);
                                                    try {
                                                        const r = await gateway.archiveTranscribeDocument(jwt, space.id, doc.id);
                                                        toast.success(`Transkribiert & in „Archiv" abgelegt (${r.transcriptChars} Zeichen)`);
                                                        refresh();
                                                    } catch (e) {
                                                        toast.error('Archivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
                                                    } finally {
                                                        setArchivingId(null);
                                                    }
                                                }}
                                                className="rounded p-1 hover:bg-primary/10 text-primary disabled:opacity-50"
                                                title={t('documents.documents.archive_transcribe', { defaultValue: 'Transkribieren & in „Archiv" ablegen' })}>
                                                <MaterialIcon name={archivingId === doc.id ? 'hourglass_top' : 'inventory_2'} size={16} className="size-3" />
                                            </button>
                                        )}
                                        <button onClick={() => handleDelete(doc)} className="rounded p-1 text-destructive hover:bg-destructive/10" title={t('documents.documents.loeschen')}>
                                            <MaterialIcon name="delete" size={16} className="size-3" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>

            {/* Folder-Create Modal */}
            {showFolderCreate && (
                <DmsFolderCreateModal
                    container={{ spaceId: space.id }}
                    parentId={currentFolderId}
                    onClose={() => setShowFolderCreate(false)}
                    onCreated={() => { setShowFolderCreate(false); refreshFolders(); }}
                />
            )}

            {audioPlayer && (
                <AudioPlayerModal
                    title={audioPlayer.title}
                    downloadUrl={audioPlayer.downloadUrl}
                    onClose={() => setAudioPlayer(null)}
                />
            )}
        </div>
    );
}

/**
 * FolderDropRow — Subfolder-Row mit Drop-Target.
 * Datei drauf ziehen → wird in den Folder verschoben.
 */
function FolderDropRow({ folder, onClick }: { folder: { id: string; name: string; documentCount: number }; onClick: () => void }): JSX.Element {
    const t = useT();
    const [dropOver, setDropOver] = useState(false);
    return (
        <button
            onClick={onClick}
            onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-prilog-doc-id')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropOver(true);
                }
            }}
            onDragLeave={() => setDropOver(false)}
            onDrop={async (e) => {
                e.preventDefault();
                setDropOver(false);
                const docId = e.dataTransfer.getData('application/x-prilog-doc-id');
                if (!docId) return;
                const jwt = sessionStore.getSnapshot().platform?.token;
                if (!jwt) return;
                try {
                    const { dmsFoldersApi } = await import('@/features/dms/use-dms-folders');
                    await dmsFoldersApi.moveDoc(jwt, docId, folder.id);
                    toast.success(`Verschoben nach "${folder.name}"`);
                } catch (e2) {
                    toast.error('Verschieben fehlgeschlagen: ' + (e2 instanceof Error ? e2.message : String(e2)));
                }
            }}
            className={cn(
                'flex w-full items-center gap-2.5 px-2.5 py-2 text-left hover:bg-muted/50',
                dropOver && 'bg-primary/20 ring-1 ring-primary',
            )}
        >
            <MaterialIcon name="folder" size={18} fill={1} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium">{folder.name}</div>
                <div className="text-[10px] text-muted-foreground">
                    {folder.documentCount} {t('documents.documents.dokument')}{folder.documentCount === 1 ? '' : 'e'}
                </div>
            </div>
            <MaterialIcon name="chevron_right" size={14} className="text-muted-foreground/60 shrink-0" />
        </button>
    );
}

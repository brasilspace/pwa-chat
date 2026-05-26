import { type JSX, useState, useCallback, useRef, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocuments, type DocumentFilters } from './use-documents';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { useSwipeRightToBack } from '@/core/responsive/use-swipe-right-to-back';
import { MobileDocumentsList } from './mobile-documents-list';
import { useSpaces } from '@/features/spaces/use-spaces';
import { ResizablePanels } from '@/components/ui/resizable-panels';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { DocumentItem, Tag } from '@/features/project/project-types';
import { toast } from '@/components/ui/toast';
import { FolderTreesView } from '@/features/dms/folder-trees-view';
import { DocumentFoldersPanel } from '@/features/dms/document-folders-panel';
import { DocumentTypePanel } from '@/features/dms/document-type-panel';
import { RetentionPanel } from '@/features/dms/retention-panel';
import { ShareLinkModal } from '@/features/dms/share-link-modal';
import { DocumentShareDialog } from './document-share-dialog';
import { documentVisibilityApi } from './use-document-visibility';
import { SectionHeader } from '@/components/ui/section-header';
import { DocumentRelationsPanel } from '@/features/dms/document-relations-panel';
import { DocumentAnnotationsPanel } from '@/features/dms/document-annotations-panel';
import { SignatureModal } from '@/features/dms/signature-modal';
import { TemplatePickerModal } from '@/features/dms/template-picker-modal';
import { dmsTemplatesApi } from '@/features/dms/use-dms-templates';
import { CreateSheetModal } from '@/features/sheets/create-sheet-modal';
import { CreateDocumentModal } from './create-document-modal';
import { DmsFolderCreateModal } from '@/features/dms/dms-folder-create-modal';
import { DmsFolderPickerModal } from '@/features/dms/dms-folder-picker-modal';
import { MaterialIcon } from '@/components/ui/material-icon';
import { SHEET_MIMETYPE, sheetsApi } from '@/features/sheets/use-sheets';
import { useEnabledModules } from '@/core/permissions';
import { FileIcon } from '@/features/dms/file-icon';
import { Search, List, Download, Trash2, Star, FileText, Image, Film, Music, Archive, File, Loader2, Upload, ChevronDown, Tag as TagIcon, HardDrive, Unlock, Folder, FolderOpen, ChevronRight, Activity, Calendar, Globe, Files } from 'lucide-react';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { AudioPlayerModal } from '@/components/audio/audio-player-modal';
import { PrintButton } from '@/components/print/print-button';
import { TiptapViewer } from './tiptap-viewer';
import { useT } from "@/lib/i18n/use-t";

// ---------------------------------------------------------------------------
// MIME icon helper
// ---------------------------------------------------------------------------

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

function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatUserId(userId: string): string {
    // "@adminweser:weser.prilog.team" → "adminweser"
    return userId.replace(/^@/, '').split(':')[0];
}

const MIME_LABELS: Record<string, string> = {
    'application/pdf': 'PDF-Dokument',
    'application/json': 'JSON',
    'application/xml': 'XML',
    'application/zip': 'ZIP-Archiv',
    'application/octet-stream': 'Datei',
    'text/plain': 'Textdatei',
    'text/markdown': 'Markdown',
    'text/csv': 'CSV-Tabelle',
    'text/html': 'HTML',
};

function friendlyMimeType(mimeType: string): string {
    if (MIME_LABELS[mimeType]) return MIME_LABELS[mimeType];
    if (mimeType.startsWith('image/')) return `Bild (${mimeType.split('/')[1].toUpperCase()})`;
    if (mimeType.startsWith('video/')) return `Video (${mimeType.split('/')[1].toUpperCase()})`;
    if (mimeType.startsWith('audio/')) return `Audio (${mimeType.split('/')[1].toUpperCase()})`;
    return mimeType;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DocumentsHub(): JSX.Element {
    const t = useT();
    const [searchParams] = useSearchParams();
    const currentView = searchParams.get('view');
    const currentTag = searchParams.get('tag');
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const [fullscreen, setFullscreen] = useState(false);

    // Mobile-Entry: ohne View/Tag-Param zeigen wir die Sidebar-Liste
    const showMobileEntry = isMobile && !currentView && !currentTag;
    const isMobileDetail = isMobile && (!!currentView || !!currentTag);
    const swipeBackHandlers = useSwipeRightToBack(isMobileDetail, () => navigate('/documents'));

    if (showMobileEntry) {
        return <MobileDocumentsList />;
    }

    const title = currentView === 'admin' ? 'Speicher-Uebersicht'
        : currentView === 'trash' ? 'Papierkorb'
            : currentView === 'tags' ? 'Tags verwalten'
                : currentView === 'starred' ? 'Markierte Dokumente'
                    : currentView === 'recent' ? 'Zuletzt geoeffnet'
                        : currentTag ? `#${currentTag}`
                            : 'Dokumente';

    const TitleIcon = currentView === 'admin' ? HardDrive
        : currentView === 'trash' ? Trash2
            : currentView === 'tags' ? TagIcon
                : currentView === 'starred' ? Star
                    : FileText;

    return (
        <div className="flex h-full flex-col" {...swipeBackHandlers}>
            {/* Mobile Breadcrumb-Header */}
            {isMobile && (
                <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-2">
                    <button
                        type="button"
                        onClick={() => navigate('/documents')}
                        aria-label={t('documents.documents_hub.zurueck_zur_dokumente-uebersicht')}
                        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors active:bg-muted"
                    >
                        <MaterialIcon name="description" size={16} className="size-5" />
                    </button>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" />
                    <span className="truncate text-sm font-semibold">{title}</span>
                </div>
            )}

            {/* Toolbar – spans full width (Desktop only on Mobile detail) */}
            <div className={cn('flex h-[var(--toolbar-height)] shrink-0 items-center border-b px-4', isMobile && 'hidden')}>
                <TitleIcon className="mr-2 size-4 text-muted-foreground" />
                <span className="text-lg font-semibold">{title}</span>
                <div className="flex-1" />
                <button
                    onClick={() => setFullscreen(f => !f)}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={fullscreen ? 'Spaltenansicht' : 'Vollbild'}
                >
                    {fullscreen ? <MaterialIcon name="close_fullscreen" size={16} className="size-4" /> : <MaterialIcon name="open_in_full" size={16} className="size-4" />}
                </button>
            </div>

            {/* Content */}
            <div className="min-h-0 flex-1">
                {currentView === 'admin' ? <AdminOverviewPanel />
                    : currentView === 'trash' ? <TrashPanel />
                        : currentView === 'tags' ? <TagManagerPanel />
                            : <DocumentsListHub listCollapsed={fullscreen} />}
            </div>
        </div>
    );
}

function DocumentsListHub({ listCollapsed }: { listCollapsed?: boolean }): JSX.Element {
    const t = useT();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const myUserId = session.bootstrap?.user.matrixUserId ?? '';
    const platformJwt = session.platform?.token;
    const [searchInput, setSearchInput] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'grid' | 'timeline'>('list');
    const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
    const [audioPlayer, setAudioPlayer] = useState<{ title: string; downloadUrl: string } | null>(null);

    // Detail-Pane schliessen wenn Folder/Space/View/Tag-Filter wechselt —
    // sonst zeigt der rechte Pane noch die Datei aus dem alten Ordner.
    const selectionContextKey = `${searchParams.get('space') ?? ''}|${searchParams.get('folder') ?? ''}|${searchParams.get('view') ?? ''}|${searchParams.get('tag') ?? ''}|${searchParams.get('savedSearch') ?? ''}|${searchParams.get('legacyFolder') ?? ''}`;
    useEffect(() => {
        setSelectedDoc(null);
    }, [selectionContextKey]);

    const handlePlayAudio = useCallback(async (doc: DocumentItem) => {
        if (!platformJwt) return;
        try {
            const gw = createProjectGateway();
            const { downloadUrl } = await gw.getDocumentDownloadUrl(platformJwt, doc.spaceId, doc.id);
            setAudioPlayer({ title: doc.title, downloadUrl });
        } catch (e) {
            alert('Audio konnte nicht geladen werden: ' + (e instanceof Error ? e.message : String(e)));
        }
    }, [platformJwt]);
    // URL-driven Quelle: Sidebar (DmsWorld) setzt
    //   ?space=    — Space-Filter
    //   ?folder=   — neuer dms_folder (Phase 12)
    //   ?legacyFolder= — alter folder_trees-Folder (zeigt FolderTreesView)
    //   ?savedSearch=  — Smart-Folder
    const spaceParam = searchParams.get('space');
    const folderParam = searchParams.get('folder');
    const legacyFolderParam = searchParams.get('legacyFolder');
    const savedSearchParam = searchParams.get('savedSearch');
    const folderViewActive = Boolean(legacyFolderParam || savedSearchParam);
    const [sortBy, setSortBy] = useState<'date' | 'name' | 'size' | 'type'>('date');
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Derive filters from URL params
    const filters = useMemo<DocumentFilters>(() => {
        const view = searchParams.get('view');
        const tag = searchParams.get('tag');
        // Wenn ein Space gewaehlt ist aber kein Folder: nur Root-Docs (Finder-Style).
        // Bei Suche oder Tag-Filter zeigen wir alle Docs (klassische Such-UX).
        const folderFilter = folderParam
            ? folderParam
            : (spaceParam && !searchInput.trim() && !tag ? '__none__' : undefined);
        return {
            q: searchInput || undefined,
            starred: view === 'starred' ? true : undefined,
            recent: view === 'recent' ? true : undefined,
            tags: tag || undefined,
            spaceId: spaceParam || undefined,
            folderId: folderFilter,
            sort: sortBy,
            order: sortBy === 'name' ? 'asc' : 'desc',
        };
    }, [searchParams, searchInput, sortBy, spaceParam, folderParam]);

    const {
        documents, loading, hasMore, tags,
        loadMore, refresh, uploadDocument, toggleStar, toggleLock,
        deleteDocument, downloadDocument, updateDocument,
        createTag,
    } = useDocuments(filters);

    const handleSearch = useCallback((value: string) => {
        setSearchInput(value);
    }, []);

    const handleSearchDebounced = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchInput(value);
    }, []);

    // Drag & drop state
    const [dragOver, setDragOver] = useState(false);
    const dragCounter = useRef(0);

    // Upload handler with space selection
    const { spaces } = useSpaces();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadSpaceId, setUploadSpaceId] = useState('');
    const [showUploadBar, setShowUploadBar] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [showSheetCreate, setShowSheetCreate] = useState(false);
    const [showDocCreate, setShowDocCreate] = useState(false);
    const [showFolderCreate, setShowFolderCreate] = useState(false);
    const enabledModules = useEnabledModules();
    const hasSheets = enabledModules.has('sheets' as never);
    const pendingFilesRef = useRef<FileList | null>(null);

    const triggerUpload = useCallback(() => {
        if (spaces.length === 1) {
            setUploadSpaceId(spaces[0].id);
            fileInputRef.current?.click();
        } else {
            setShowUploadBar(true);
        }
    }, [spaces]);

    const handleUploadFiles = useCallback(async (files: FileList | null) => {
        const spaceId = uploadSpaceId || spaces[0]?.id;
        if (!files || files.length === 0 || !spaceId) {
            // If no space selected and multiple spaces, show upload bar
            if (spaces.length > 1 && files && files.length > 0) {
                pendingFilesRef.current = files;
                setShowUploadBar(true);
            }
            return;
        }
        setUploading(true);
        try {
            // Aktuell offener Ordner aus URL — wenn der Nutzer in einem Unterordner
            // ist, soll die Datei auch dort landen, nicht im Root.
            const targetFolderId = folderParam ?? null;
            for (const file of Array.from(files)) {
                await uploadDocument(spaceId, file, { folderId: targetFolderId });
            }
            setShowUploadBar(false);
            pendingFilesRef.current = null;
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [uploadSpaceId, spaces, uploadDocument, folderParam]);

    const handleUpload = handleUploadFiles;

    // Drag & drop handlers
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current++;
        if (e.dataTransfer.types.includes('Files')) setDragOver(true);
    }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) setDragOver(false);
    }, []);
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        dragCounter.current = 0;
        if (e.dataTransfer.files.length > 0) {
            handleUploadFiles(e.dataTransfer.files);
        }
    }, [handleUploadFiles]);

    // ── Left Panel: Document List ────────────────────────────────────────────

    const leftPanel = (
        <div
            className="relative flex h-full flex-col"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Vorlage-Picker (DMS Phase 10) */}
            {showTemplatePicker && (
                <TemplatePickerModal
                    onClose={() => setShowTemplatePicker(false)}
                    onCreated={(d) => { toast.success(`"${d.title}" erstellt`); refresh(); }}
                />
            )}
            {/* Sheet-Create */}
            {showSheetCreate && (
                <CreateSheetModal
                    onClose={() => setShowSheetCreate(false)}
                    onCreated={(s) => {
                        setShowSheetCreate(false);
                        toast.success(`Tabelle "${s.title}" erstellt`);
                        navigate(`/sheets/${s.id}`);
                    }}
                />
            )}
            {/* Document-Create */}
            {showDocCreate && (
                <CreateDocumentModal
                    onClose={() => setShowDocCreate(false)}
                    onCreated={(d) => {
                        setShowDocCreate(false);
                        toast.success(`"${d.title}" erstellt`);
                        navigate(`/documents/${d.id}/edit`);
                    }}
                />
            )}
            {/* Folder-Create (nur im Space-Kontext) */}
            {showFolderCreate && spaceParam && (
                <DmsFolderCreateModal
                    container={{ spaceId: spaceParam }}
                    parentId={folderParam}
                    onClose={() => setShowFolderCreate(false)}
                    onCreated={() => {
                        setShowFolderCreate(false);
                        toast.success('Folder angelegt');
                        // DmsWorld-Tree refreshes sich automatisch beim naechsten Render
                    }}
                />
            )}
            {/* Drop overlay */}
            {dragOver && (
                <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
                    <div className="text-center">
                        <MaterialIcon name="upload" size={16} className="mx-auto size-8 text-primary" />
                        <p className="mt-2 text-sm font-medium text-primary">{t('documents.documents_hub.dateien_hier_ablegen')}</p>
                    </div>
                </div>
            )}
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b px-3 py-2">
                {/* Search */}
                <div className="relative flex-1">
                    <MaterialIcon name="search" size={16} className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchInput}
                        onChange={handleSearchDebounced}
                        placeholder={t('documents.documents_hub.dokumente_durchsuchen')}
                        className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                    />
                    {searchInput && (
                        <button
                            onClick={() => setSearchInput('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-muted"
                        >
                            <MaterialIcon name="close" size={16} className="size-3" />
                        </button>
                    )}
                </div>

                {/* Sort */}
                <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as 'date' | 'name' | 'size' | 'type')}
                    className="h-8 rounded-[4px] border bg-background px-2 text-[12px]"
                >
                    <option value="date">{t('documents.documents_hub.datum')}</option>
                    <option value="name">{t('documents.documents_hub.name')}</option>
                    <option value="size">{t('documents.documents_hub.groesse')}</option>
                    <option value="type">{t('documents.documents_hub.typ')}</option>
                </select>

                {/* View toggle */}
                <div className="flex h-9 rounded-[6px]">
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                            'inline-flex size-9 items-center justify-center rounded-[6px] transition-colors',
                            viewMode === 'list'
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        title={t('documents.documents_hub.liste')}
                    >
                        <MaterialIcon name="format_list_bulleted" size={20} />
                    </button>
                    <button
                        onClick={() => setViewMode('grid')}
                        className={cn(
                            'inline-flex size-9 items-center justify-center rounded-[6px] transition-colors',
                            viewMode === 'grid'
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        title={t('documents.documents_hub.kacheln')}
                    >
                        <MaterialIcon name="grid_view" size={20} />
                    </button>
                    <button
                        onClick={() => setViewMode('timeline')}
                        className={cn(
                            'inline-flex size-9 items-center justify-center rounded-[6px] transition-colors',
                            viewMode === 'timeline'
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        title={t('documents.documents_hub.zeitstrom')}
                    >
                        <MaterialIcon name="schedule" size={20} />
                    </button>
                </div>

                {/* Neu aus Vorlage */}
                <button
                    onClick={() => setShowTemplatePicker(true)}
                    className="inline-flex size-9 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={t('documents.documents_hub.aus_vorlage_anlegen')}
                >
                    <MaterialIcon name="content_copy" size={20} />
                </button>
                {/* Neue Tabelle */}
                {hasSheets && (
                    <button
                        onClick={() => setShowSheetCreate(true)}
                        className="inline-flex size-9 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={t('documents.documents_hub.neue_tabelle_anlegen')}
                    >
                        <MaterialIcon name="table_chart" size={20} />
                    </button>
                )}
                {/* Neues Dokument */}
                <button
                    onClick={() => setShowDocCreate(true)}
                    className="inline-flex size-9 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={t('documents.documents_hub.neues_dokument_anlegen')}
                >
                    <MaterialIcon name="description" size={20} />
                </button>
                {/* Neuer Folder — nur wenn Space-Kontext aktiv */}
                {spaceParam && (
                    <button
                        onClick={() => setShowFolderCreate(true)}
                        className="inline-flex size-9 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={t('documents.documents_hub.neuen_folder_anlegen')}
                    >
                        <MaterialIcon name="create_new_folder" size={20} />
                    </button>
                )}
                {/* Upload */}
                <button
                    onClick={triggerUpload}
                    disabled={uploading || spaces.length === 0}
                    title={t('documents.documents_hub.hochladen')}
                    className="inline-flex size-9 items-center justify-center rounded-[6px] bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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

            {/* Active filters */}
            {(filters.tags || filters.starred || filters.recent) && (
                <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
                    {filters.starred && (
                        <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400">
                            <MaterialIcon name="star" size={16} className="size-3" /> {t('documents.documents_hub.markiert')}
                        </span>
                    )}
                    {filters.recent && (
                        <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
                            {t('documents.documents_hub.zuletzt_geoeffnet')}
                        </span>
                    )}
                    {filters.tags && (
                        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                            <MaterialIcon name="sell" size={16} className="size-3" /> {filters.tags}
                        </span>
                    )}
                </div>
            )}

            {/* Upload bar with space selector */}
            {showUploadBar && (
                <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                    <span className="text-[12px] text-muted-foreground">{t('documents.documents_hub.ziel-space')}</span>
                    <select
                        value={uploadSpaceId}
                        onChange={e => setUploadSpaceId(e.target.value)}
                        className="h-7 flex-1 rounded border bg-background px-2 text-[12px]"
                    >
                        <option value="">{t('documents.documents_hub.space_waehlen')}</option>
                        {spaces.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => uploadSpaceId && fileInputRef.current?.click()}
                        disabled={!uploadSpaceId || uploading}
                        className="flex h-7 items-center gap-1 rounded bg-primary px-2.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                        <MaterialIcon name="upload" size={16} className="size-3" />
                        {t('documents.documents_hub.datei_waehlen')}
                    </button>
                    <button onClick={() => setShowUploadBar(false)} className="rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-3.5" />
                    </button>
                </div>
            )}

            {/* Document list */}
            <ScrollArea className="flex-1">
                {loading && documents.length === 0 ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : documents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
                        <MaterialIcon name="description" size={16} className="size-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('documents.documents_hub.keine_dokumente_gefunden')}</p>
                    </div>
                ) : folderViewActive ? (
                    <FolderTreesView
                        selectedDocId={selectedDoc?.id ?? null}
                        onSelectDoc={(id) => {
                            const found = documents.find(d => d.id === id);
                            if (found) setSelectedDoc(found);
                        }}
                    />
                ) : viewMode === 'timeline' ? (
                    <TimelineView
                        documents={documents}
                        tags={tags}
                        selectedDoc={selectedDoc}
                        onSelectDoc={setSelectedDoc}
                    />
                ) : viewMode === 'list' ? (
                    <div className="divide-y">
                        {documents.map(doc => {
                            const isSheet = doc.mimeType === SHEET_MIMETYPE;
                            const canDelete = isSheet ? doc.uploadedBy === myUserId : true;
                            return (
                                <DocumentRow
                                    key={doc.id}
                                    doc={doc}
                                    selected={selectedDoc?.id === doc.id}
                                    onClick={() => setSelectedDoc(doc)}
                                    onPlayAudio={handlePlayAudio}
                                    onDelete={canDelete ? async () => {
                                        if (!confirm(`"${doc.title}" wirklich loeschen?`)) return;
                                        try {
                                            if (isSheet && platformJwt) {
                                                await sheetsApi.delete(platformJwt, doc.id);
                                                refresh();
                                            } else {
                                                await deleteDocument(doc);
                                            }
                                        } catch (e) {
                                            alert('Loeschen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
                                        }
                                    } : undefined}
                                />
                            );
                        })}
                        {hasMore && (
                            <button onClick={loadMore} className="w-full py-3 text-center text-[12px] text-primary hover:underline">
                                {t('documents.documents_hub.mehr_laden')}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-3 xl:grid-cols-4">
                        {documents.map(doc => (
                            <DocumentCard
                                key={doc.id}
                                doc={doc}
                                selected={selectedDoc?.id === doc.id}
                                onClick={() => setSelectedDoc(doc)}
                                onPlayAudio={handlePlayAudio}
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );

    // ── Right Panel: Detail / Preview ────────────────────────────────────────

    const rightPanel = selectedDoc ? (
        <DocumentDetailPanel
            doc={selectedDoc}
            tags={tags}
            onToggleStar={() => toggleStar(selectedDoc)}
            onDownload={() => downloadDocument(selectedDoc)}
            onDelete={async () => { await deleteDocument(selectedDoc); setSelectedDoc(null); }}
            onUpdate={async (patch) => {
                const updated = await updateDocument(selectedDoc, patch);
                if (updated) setSelectedDoc(updated);
            }}
            onCreateTag={createTag}
            onToggleLock={async () => {
                await toggleLock(selectedDoc);
                setSelectedDoc(prev => prev ? { ...prev, locked: !prev.locked } : prev);
            }}
            onClose={() => setSelectedDoc(null)}
            onArchiveTranscribe={async () => {
                if (!platformJwt) return;
                try {
                    const r = await createProjectGateway().archiveTranscribeDocument(platformJwt, selectedDoc.spaceId, selectedDoc.id);
                    toast.success(t('documents.documents_hub.archived_ok', { defaultValue: 'Transkribiert & im Ordner „Archiv" abgelegt' }) + ` (${r.transcriptChars} Zeichen)`);
                    setSelectedDoc(null);
                    await refresh();
                } catch (e) {
                    toast.error(t('documents.documents_hub.archived_fail', { defaultValue: 'Archivieren fehlgeschlagen' }) + ': ' + (e instanceof Error ? e.message : String(e)));
                }
            }}
        />
    ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <MaterialIcon name="description" size={16} className="size-10 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">{t('documents.documents_hub.dokument_auswaehlen_fuer_details_und_vor')}</p>
        </div>
    );

    const audioModal = audioPlayer ? (
        <AudioPlayerModal
            title={audioPlayer.title}
            downloadUrl={audioPlayer.downloadUrl}
            onClose={() => setAudioPlayer(null)}
        />
    ) : null;

    if (listCollapsed) {
        return <><div className="h-full">{rightPanel}</div>{audioModal}</>;
    }

    return (
        <>
            <ResizablePanels
                left={leftPanel}
                right={rightPanel}
                defaultLeftRatio={0.6}
                minLeftRatio={0.4}
                maxLeftRatio={0.8}
            />
            {audioModal}
        </>
    );
}

// ---------------------------------------------------------------------------
// Document Row (List View)
// ---------------------------------------------------------------------------

function getEditRoute(doc: DocumentItem): string | null {
    if (doc.mimeType === SHEET_MIMETYPE) return `/sheets/${doc.id}`;
    const textByExt = /\.(md|markdown|txt)$/i.test(doc.title);
    const isText = doc.mimeType === 'text/markdown' || doc.mimeType === 'text/plain' || textByExt;
    if (isText) return `/documents/${doc.id}/edit`;
    return null;
}

function isAudioFile(doc: DocumentItem): boolean {
    if (/^audio\//.test(doc.mimeType)) return true;
    return /\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i.test(doc.title);
}

function DocumentRow({ doc, selected, onClick, onDelete, onPlayAudio }: { doc: DocumentItem; selected: boolean; onClick: () => void; onDelete?: () => void; onPlayAudio?: (doc: DocumentItem) => void }) {
    const t = useT();
    const navigate = useNavigate();
    const handleDoubleClick = () => {
        if (isAudioFile(doc) && onPlayAudio) { onPlayAudio(doc); return; }
        const route = getEditRoute(doc);
        if (route) navigate(route);
    };
    return (
        <div
            onClick={onClick}
            onDoubleClick={handleDoubleClick}
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('application/x-prilog-doc-id', doc.id);
                e.dataTransfer.effectAllowed = 'move';
            }}
            className={cn(
                'group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50',
                selected && 'bg-primary/5',
            )}
        >
            <FileIcon fileName={doc.title} mimeType={doc.mimeType} className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{doc.title}</span>
                    {doc.starred && <MaterialIcon name="star" size={16} className="size-3 shrink-0 fill-yellow-400 text-yellow-400" />}
                </div>
                {doc.highlight && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground [&>mark]:bg-yellow-200 [&>mark]:text-foreground dark:[&>mark]:bg-yellow-500/30"
                        dangerouslySetInnerHTML={{ __html: doc.highlight }} />
                )}
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{formatDate(doc.createdAt)}</span>
                    <span>·</span>
                    <span>{formatSize(doc.sizeBytes)}</span>
                    {doc.spaceName && <><span>·</span><span className="truncate">{doc.spaceName}</span></>}
                </div>
            </div>
            {doc.tags.length > 0 && (
                <div className="flex shrink-0 items-center gap-1">
                    {doc.tags.slice(0, 3).map(tag => (
                        <div
                            key={tag.id}
                            className="size-2 rounded-full"
                            style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                            title={tag.label}
                        />
                    ))}
                    {doc.tags.length > 3 && (
                        <span className="text-[9px] text-muted-foreground">+{doc.tags.length - 3}</span>
                    )}
                </div>
            )}
            {onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    title={t('documents.documents_hub.loeschen')}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                    <MaterialIcon name="delete" size={16} className="size-3.5" />
                </button>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Document Card (Grid View)
// ---------------------------------------------------------------------------

function DocumentCard({ doc, selected, onClick, onPlayAudio }: { doc: DocumentItem; selected: boolean; onClick: () => void; onPlayAudio?: (doc: DocumentItem) => void }) {
    const navigate = useNavigate();
    const handleDoubleClick = () => {
        if (isAudioFile(doc) && onPlayAudio) { onPlayAudio(doc); return; }
        const route = getEditRoute(doc);
        if (route) navigate(route);
    };
    return (
        <div
            onClick={onClick}
            onDoubleClick={handleDoubleClick}
            className={cn(
                'flex cursor-pointer flex-col rounded-lg border p-3 transition-colors hover:bg-muted/50',
                selected && 'border-primary bg-primary/5',
            )}
        >
            <div className="mb-2 flex items-center justify-between">
                <FileIcon fileName={doc.title} mimeType={doc.mimeType} className="size-6" />
                {doc.starred && <MaterialIcon name="star" size={16} className="size-3 fill-yellow-400 text-yellow-400" />}
            </div>
            <p className="truncate text-[13px] font-medium">{doc.title}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
                {formatSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
            </p>
            {doc.tags.length > 0 && (
                <div className="mt-2 flex items-center gap-1">
                    {doc.tags.slice(0, 3).map(tag => (
                        <span
                            key={tag.id}
                            className="rounded-full px-1.5 py-0.5 text-[9px]"
                            style={{ backgroundColor: (tag.color ?? '#94a3b8') + '20', color: tag.color ?? '#94a3b8' }}
                        >
                            {tag.label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Timeline View — "Zeitstrom" (mit Kalender, Aktivitaet, Mitglieder)
// ---------------------------------------------------------------------------

import { getMonthNames as i18nGetMonthNames } from '@/lib/i18n/locale-date';
// Locale-aware Monatsnamen — werden bei jedem Render frisch ausgewertet
const MONTH_NAMES = new Proxy([] as string[], {
    get(_target, prop) {
        const arr = i18nGetMonthNames();
        if (prop === 'length') return arr.length;
        return arr[Number(prop)];
    },
});

interface TimelineCalendarEvent {
    id: string;
    title: string;
    date: string;
    dateEnd: string | null;
    allDay: boolean;
    location: string | null;
    layerName: string | null;
    layerColor: string | null;
}

interface TimelineContextData {
    calendarEvents: TimelineCalendarEvent[];
    activityByDay: Record<string, number>;
    newMembers: Array<{ userId: string; spaceName: string; date: string }>;
}

interface MonthGroup {
    key: string;
    year: number;
    month: number;
    label: string;
    days: DayGroup[];
    dominantTag: { label: string; color: string } | null;
    activityPerDay: number[];   // Doc-Uploads pro Tag
    totalActivityPerDay: number[]; // Gesamtaktivitaet (Space-Mutations) pro Tag
    milestones: string[];
    calendarEvents: TimelineCalendarEvent[]; // Events dieses Monats
}

interface DayGroup {
    date: string;
    dayLabel: string;
    weekday: string;
    isToday: boolean;
    docs: DocumentItem[];
    calendarEvents: TimelineCalendarEvent[];
    totalActivity: number;       // Space-Mutations an diesem Tag
    newMembers: Array<{ userId: string; spaceName: string }>;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function buildTimelineData(documents: DocumentItem[], tags: Tag[], context?: TimelineContextData | null): MonthGroup[] {
    if (documents.length === 0) return [];

    // Docs nach Datum sortieren (neueste zuerst)
    const sorted = [...documents].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Nach Monat → Tag gruppieren
    const monthMap = new Map<string, Map<string, DocumentItem[]>>();
    for (const doc of sorted) {
        const d = new Date(doc.createdAt);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const dayKey = `${monthKey}-${String(d.getDate()).padStart(2, '0')}`;

        if (!monthMap.has(monthKey)) monthMap.set(monthKey, new Map());
        const dayMap = monthMap.get(monthKey)!;
        if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
        dayMap.get(dayKey)!.push(doc);
    }

    // Tag-Erstellungsdaten fuer Meilensteine
    const tagCreationMap = new Map<string, string[]>();
    for (const tag of tags) {
        if (tag.createdAt) {
            const d = new Date(tag.createdAt);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!tagCreationMap.has(monthKey)) tagCreationMap.set(monthKey, []);
            tagCreationMap.get(monthKey)!.push(tag.label);
        }
    }

    const months: MonthGroup[] = [];
    for (const [monthKey, dayMap] of monthMap) {
        const [yearStr, monthStr] = monthKey.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const daysInMonth = new Date(year, month, 0).getDate();

        // Aktivitaet pro Tag berechnen
        const activityPerDay = Array.from({ length: daysInMonth }, (_, i) => {
            const dayKey = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
            return dayMap.get(dayKey)?.length ?? 0;
        });

        // Dominanter Tag: welcher Tag kommt am oeftesten in diesem Monat vor?
        const tagCounts = new Map<string, { count: number; color: string; label: string }>();
        for (const [, docs] of dayMap) {
            for (const doc of docs) {
                for (const tag of doc.tags) {
                    const existing = tagCounts.get(tag.id) ?? { count: 0, color: tag.color ?? '#94a3b8', label: tag.label };
                    existing.count++;
                    tagCounts.set(tag.id, existing);
                }
            }
        }
        let dominantTag: { label: string; color: string } | null = null;
        let maxCount = 0;
        for (const [, info] of tagCounts) {
            if (info.count > maxCount) {
                maxCount = info.count;
                dominantTag = { label: info.label, color: info.color };
            }
        }

        // Kalender-Events dieses Monats
        const monthCalEvents = (context?.calendarEvents ?? []).filter(e => e.date.startsWith(monthKey));

        // Gesamtaktivitaet pro Tag (Space-Mutations)
        const totalActivityPerDay = Array.from({ length: daysInMonth }, (_, i) => {
            const dayKey = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
            return context?.activityByDay[dayKey] ?? 0;
        });

        // Tage aufbauen
        const days: DayGroup[] = [];
        for (const [dayKey, docs] of dayMap) {
            const d = new Date(dayKey + 'T00:00:00');
            const dayCalEvents = (context?.calendarEvents ?? []).filter(e =>
                e.date === dayKey || (e.dateEnd && e.date <= dayKey && e.dateEnd >= dayKey)
            );
            const dayNewMembers = (context?.newMembers ?? [])
                .filter(m => m.date === dayKey)
                .map(m => ({ userId: m.userId, spaceName: m.spaceName }));

            days.push({
                date: dayKey,
                dayLabel: `${String(d.getDate()).padStart(2, '0')}. ${MONTH_NAMES[d.getMonth()]}`,
                weekday: WEEKDAYS[d.getDay()],
                isToday: dayKey === todayStr,
                docs,
                calendarEvents: dayCalEvents,
                totalActivity: context?.activityByDay[dayKey] ?? 0,
                newMembers: dayNewMembers,
            });
        }

        months.push({
            key: monthKey,
            year,
            month,
            label: `${MONTH_NAMES[month - 1]} ${year}`,
            days,
            dominantTag,
            activityPerDay,
            totalActivityPerDay,
            milestones: tagCreationMap.get(monthKey) ?? [],
            calendarEvents: monthCalEvents,
        });
    }

    return months;
}

/** SVG-Aktivitaetskurve: zwei Layers — Gesamtaktivitaet (hintere Flaeche) + Doc-Uploads (vordere Linie) */
function ActivityCurve({ docData, totalData, color }: { docData: number[]; totalData: number[]; color: string }) {
    const width = 100;
    const height = 40;

    function buildBezier(data: number[], maxVal: number) {
        const points = data.map((v, i) => ({
            x: data.length > 1 ? (i / (data.length - 1)) * width : width / 2,
            y: height - (v / maxVal) * (height - 6) - 3,
        }));
        let path = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
            const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
            path += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
        }
        return path;
    }

    const combinedMax = Math.max(...docData, ...totalData, 1);

    const docPath = buildBezier(docData, combinedMax);
    const totalPath = buildBezier(totalData, combinedMax);
    const totalFill = `${totalPath} L ${width} ${height} L 0 ${height} Z`;
    const docFill = `${docPath} L ${width} ${height} L 0 ${height} Z`;

    const gradId = `grad-${color.replace('#', '')}`;
    const gradId2 = `grad2-${color.replace('#', '')}`;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full" preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id={gradId2} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.03} />
                </linearGradient>
            </defs>
            {/* Hintergrund: Gesamtaktivitaet (grau) */}
            <path d={totalFill} fill={`url(#${gradId})`} />
            <path d={totalPath} fill="none" stroke="#94a3b8" strokeWidth="0.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.4" />
            {/* Vordergrund: Doc-Uploads (Akzentfarbe) */}
            <path d={docFill} fill={`url(#${gradId2})`} />
            <path d={docPath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

function TimelineView({
    documents,
    tags,
    selectedDoc,
    onSelectDoc,
}: {
    documents: DocumentItem[];
    tags: Tag[];
    selectedDoc: DocumentItem | null;
    onSelectDoc: (doc: DocumentItem) => void;
}) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    // Timeline-Kontext laden (Kalender, Aktivitaet, Mitglieder)
    const [context, setContext] = useState<TimelineContextData | null>(null);
    useEffect(() => {
        if (!jwt || documents.length === 0) return;
        // Datumsbereich aus Dokumenten ableiten
        const dates = documents.map(d => d.createdAt.slice(0, 10)).sort();
        const from = dates[0];
        const to = dates[dates.length - 1];
        if (!from || !to) return;

        const gateway = createProjectGateway();
        gateway.getTimelineContext(jwt, from, to).then(setContext).catch(() => { });
    }, [jwt, documents.length]);

    const months = useMemo(() => buildTimelineData(documents, tags, context), [documents, tags, context]);
    const todayRef = useRef<HTMLDivElement>(null);

    // Scroll zu "Heute" beim ersten Render
    useEffect(() => {
        const timeout = setTimeout(() => {
            todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        return () => clearTimeout(timeout);
    }, []);

    if (months.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <Activity className="size-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">{t('documents.documents_hub.noch_keine_dokumente_im_zeitstrom')}</p>
                <p className="text-xs text-muted-foreground/60">{t('documents.documents_hub.lade_dokumente_hoch_um_den_zeitstrom_zu_')}</p>
            </div>
        );
    }

    return (
        <ScrollArea className="h-full">
            <div className="mx-auto max-w-3xl px-4 py-6">
                {months.map((month) => {
                    const accentColor = month.dominantTag?.color ?? '#94a3b8';

                    return (
                        <div key={month.key} className="relative mb-8">
                            {/* Monats-Header */}
                            <div className="mb-3 flex items-center gap-3">
                                <h3 className="text-base font-semibold">{month.label}</h3>
                                {month.dominantTag && (
                                    <span
                                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                        style={{
                                            backgroundColor: accentColor + '18',
                                            color: accentColor,
                                        }}
                                    >
                                        {month.dominantTag.label}
                                    </span>
                                )}
                                <span className="text-[11px] text-muted-foreground">
                                    {month.days.reduce((s, d) => s + d.docs.length, 0)} {t('documents.documents_hub.dokumente')}
                                </span>
                            </div>

                            {/* Aktivitaetskurve — zwei Layer */}
                            <div className="mb-4 overflow-hidden rounded-lg border bg-card/50">
                                <ActivityCurve docData={month.activityPerDay} totalData={month.totalActivityPerDay} color={accentColor} />
                                <div className="flex items-center justify-between px-2 pb-1.5">
                                    <span className="text-[9px] text-muted-foreground/50">1.</span>
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                                            <span className="inline-block h-1.5 w-3 rounded-full" style={{ backgroundColor: accentColor }} /> {t('documents.documents_hub.dokumente')}
                                        </span>
                                        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/40">
                                            <span className="inline-block h-1.5 w-3 rounded-full bg-muted-foreground/30" /> {t('documents.documents_hub.aktivitaet')}
                                        </span>
                                    </div>
                                    <span className="text-[9px] text-muted-foreground/50">{month.activityPerDay.length}.</span>
                                </div>
                            </div>

                            {/* Kalender-Events des Monats als Kontext-Karten */}
                            {month.calendarEvents.length > 0 && (
                                <div className="mb-3 flex flex-wrap gap-1.5">
                                    {month.calendarEvents.slice(0, 6).map(evt => (
                                        <span
                                            key={evt.id}
                                            className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]"
                                            style={{ borderColor: (evt.layerColor ?? '#94a3b8') + '40' }}
                                        >
                                            <Calendar className="size-2.5" style={{ color: evt.layerColor ?? '#94a3b8' }} />
                                            <span className="font-medium">{evt.title}</span>
                                            <span className="text-muted-foreground/50">{evt.date.slice(8, 10)}.</span>
                                        </span>
                                    ))}
                                    {month.calendarEvents.length > 6 && (
                                        <span className="rounded-md border border-dashed px-2 py-1 text-[10px] text-muted-foreground">
                                            +{month.calendarEvents.length - 6} weitere
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Meilensteine */}
                            {month.milestones.length > 0 && (
                                <div className="mb-3 flex flex-wrap gap-1.5">
                                    {month.milestones.map((label) => (
                                        <span
                                            key={label}
                                            className="flex items-center gap-1 rounded-full border border-dashed border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] text-primary"
                                        >
                                            <MaterialIcon name="flag" size={16} className="size-2.5" />
                                            {t('documents.documents_hub.neues_thema')} {label}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Zeitlinie */}
                            <div className="relative ml-4 border-l-2 pl-6" style={{ borderColor: accentColor + '30' }}>
                                {month.days.map((day) => (
                                    <div key={day.date} className="relative mb-5 last:mb-0" ref={day.isToday ? todayRef : undefined}>
                                        {/* Zeitlinie-Punkt */}
                                        <div
                                            className={cn(
                                                'absolute -left-[31px] top-0.5 size-3 rounded-full border-2 bg-background',
                                                day.isToday && 'animate-pulse',
                                            )}
                                            style={{
                                                borderColor: day.isToday ? '#ef4444' : accentColor,
                                                backgroundColor: day.isToday ? '#ef4444' : undefined,
                                            }}
                                        />

                                        {/* Datum + Kontext-Zeile */}
                                        <div className="mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    'text-[12px] font-semibold',
                                                    day.isToday && 'text-red-500',
                                                )}>
                                                    {day.weekday}, {day.dayLabel}
                                                </span>
                                                {day.isToday && (
                                                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                                        {t('documents.documents_hub.heute')}
                                                    </span>
                                                )}
                                                {day.totalActivity > 0 && (
                                                    <span className="text-[10px] text-muted-foreground/50">
                                                        {day.totalActivity} {t('documents.documents_hub.aktionen')}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Kalender-Events an diesem Tag */}
                                            {day.calendarEvents.length > 0 && (
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {day.calendarEvents.map(evt => (
                                                        <span
                                                            key={evt.id}
                                                            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
                                                            style={{
                                                                backgroundColor: (evt.layerColor ?? '#94a3b8') + '15',
                                                                color: evt.layerColor ?? '#64748b',
                                                            }}
                                                        >
                                                            <MaterialIcon name="calendar_today" size={16} className="size-2.5" />
                                                            {evt.title}
                                                            {evt.location && <span className="text-muted-foreground/50">· {evt.location}</span>}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Neue Mitglieder an diesem Tag */}
                                            {day.newMembers.length > 0 && (
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {day.newMembers.slice(0, 3).map((m, i) => (
                                                        <span key={i} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                                                            + {formatUserId(m.userId)} → {m.spaceName}
                                                        </span>
                                                    ))}
                                                    {day.newMembers.length > 3 && (
                                                        <span className="text-[9px] text-muted-foreground">+{day.newMembers.length - 3} weitere</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Dokumente dieses Tages */}
                                        <div className="space-y-1.5">
                                            {day.docs.map((doc) => {
                                                const isSelected = selectedDoc?.id === doc.id;

                                                return (
                                                    <div
                                                        key={doc.id}
                                                        onClick={() => onSelectDoc(doc)}
                                                        className={cn(
                                                            'group flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-all hover:bg-muted/50 hover:shadow-sm',
                                                            isSelected && 'border-primary/40 bg-primary/5 shadow-sm',
                                                        )}
                                                    >
                                                        {/* Icon + Stern */}
                                                        <div className="flex flex-col items-center gap-1 pt-0.5">
                                                            <FileIcon fileName={doc.title} mimeType={doc.mimeType} className="size-5" />
                                                            {doc.starred && (
                                                                <MaterialIcon name="star" size={16} className="size-3 fill-yellow-400 text-yellow-400" />
                                                            )}
                                                        </div>

                                                        {/* Content */}
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-[13px] font-medium leading-tight">{doc.title}</p>
                                                            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                                                                <span>{formatSize(doc.sizeBytes)}</span>
                                                                {doc.spaceName && (
                                                                    <>
                                                                        <span className="text-muted-foreground/30">·</span>
                                                                        <span>{doc.spaceName}</span>
                                                                    </>
                                                                )}
                                                                <span className="text-muted-foreground/30">·</span>
                                                                <span>{formatUserId(doc.uploadedBy)}</span>
                                                            </div>

                                                            {/* Tags als farbige Pillen */}
                                                            {doc.tags.length > 0 && (
                                                                <div className="mt-1.5 flex flex-wrap gap-1">
                                                                    {doc.tags.map((tag) => (
                                                                        <span
                                                                            key={tag.id}
                                                                            className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                                                            style={{
                                                                                backgroundColor: (tag.color ?? '#94a3b8') + '18',
                                                                                color: tag.color ?? '#94a3b8',
                                                                            }}
                                                                        >
                                                                            {tag.label}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Uhrzeit */}
                                                        <span className="shrink-0 text-[10px] text-muted-foreground/60">
                                                            {new Date(doc.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {/* Ende des Zeitstroms */}
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <div className="size-2 rounded-full bg-muted-foreground/20" />
                    <p className="text-[11px] text-muted-foreground/40">{t('documents.documents_hub.beginn_der_aufzeichnung')}</p>
                </div>
            </div>
        </ScrollArea>
    );
}

// ---------------------------------------------------------------------------
// Folder View — Tags als virtuelle Ordner
// ---------------------------------------------------------------------------

interface FolderNode {
    label: string;
    fullPath: string;
    tagSlug: string | null;     // null fuer synthetische Eltern-Ordner
    color: string | null;
    docCount: number;
    children: FolderNode[];
}

function buildFolderTree(tags: Tag[], documents: DocumentItem[]): FolderNode[] {
    const root: FolderNode[] = [];
    const nodeMap = new Map<string, FolderNode>();

    for (const tag of tags) {
        const parts = tag.label.split('/').map(p => p.trim()).filter(Boolean);
        let currentPath = '';
        let siblings = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const isLeaf = i === parts.length - 1;

            let node = nodeMap.get(currentPath);
            if (!node) {
                node = {
                    label: part,
                    fullPath: currentPath,
                    tagSlug: isLeaf ? tag.slug : null,
                    color: isLeaf ? tag.color : null,
                    docCount: isLeaf ? (tag.documentCount ?? 0) : 0,
                    children: [],
                };
                nodeMap.set(currentPath, node);
                siblings.push(node);
            }
            // Wenn ein vorher synthetischer Knoten jetzt ein echtes Tag-Blatt wird
            if (isLeaf && !node.tagSlug) {
                node.tagSlug = tag.slug;
                node.color = tag.color;
                node.docCount = tag.documentCount ?? 0;
            }
            siblings = node.children;
        }
    }

    // "Unsortiert" — Dokumente ohne Tags
    const untaggedCount = documents.filter(d => d.tags.length === 0).length;
    if (untaggedCount > 0) {
        root.push({
            label: 'Unsortiert',
            fullPath: '__untagged__',
            tagSlug: '__untagged__',
            color: null,
            docCount: untaggedCount,
            children: [],
        });
    }

    return root;
}

function FolderView({
    documents,
    tags,
    selectedDoc,
    onSelectDoc,
    hasMore,
    onLoadMore,
}: {
    documents: DocumentItem[];
    tags: Tag[];
    selectedDoc: DocumentItem | null;
    onSelectDoc: (doc: DocumentItem) => void;
    hasMore: boolean;
    onLoadMore: () => void;
}) {
    const t = useT();
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const tree = useMemo(() => buildFolderTree(tags, documents), [tags, documents]);

    // Dokumente im ausgewaehlten Ordner
    const folderDocs = useMemo(() => {
        if (!selectedFolder) return documents;
        if (selectedFolder === '__untagged__') return documents.filter(d => d.tags.length === 0);
        // Finde den Tag-Slug fuer diesen Ordner
        const findSlug = (nodes: FolderNode[]): string | null => {
            for (const n of nodes) {
                if (n.fullPath === selectedFolder) return n.tagSlug;
                const found = findSlug(n.children);
                if (found) return found;
            }
            return null;
        };
        const slug = findSlug(tree);
        if (!slug) return documents;
        return documents.filter(d => d.tags.some(_t => _t.slug === slug));
    }, [documents, selectedFolder, tree]);

    return (
        <div className="flex h-full">
            {/* Ordner-Baum links */}
            <div className="w-48 shrink-0 overflow-y-auto border-r bg-muted/10">
                <div className="p-2">
                    <button
                        onClick={() => setSelectedFolder(null)}
                        className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-muted',
                            !selectedFolder && 'bg-muted font-medium',
                        )}
                    >
                        <MaterialIcon name="folder_open" size={16} className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{t('documents.documents_hub.alle_dokumente')}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{documents.length}</span>
                    </button>
                    {tree.map(node => (
                        <FolderTreeNode
                            key={node.fullPath}
                            node={node}
                            depth={0}
                            selectedFolder={selectedFolder}
                            onSelect={setSelectedFolder}
                        />
                    ))}
                </div>
            </div>

            {/* Dokumente rechts */}
            <div className="min-w-0 flex-1">
                {folderDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
                        <MaterialIcon name="folder" size={16} className="size-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('documents.documents_hub.dieser_ordner_ist_leer')}</p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {folderDocs.map(doc => (
                            <DocumentRow
                                key={doc.id}
                                doc={doc}
                                selected={selectedDoc?.id === doc.id}
                                onClick={() => onSelectDoc(doc)}
                            />
                        ))}
                        {hasMore && (
                            <button onClick={onLoadMore} className="w-full py-3 text-center text-[12px] text-primary hover:underline">
                                {t('documents.documents_hub.mehr_laden')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function FolderTreeNode({
    node,
    depth,
    selectedFolder,
    onSelect,
}: {
    node: FolderNode;
    depth: number;
    selectedFolder: string | null;
    onSelect: (path: string) => void;
}) {
    const [expanded, setExpanded] = useState(depth < 1);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedFolder === node.fullPath;

    return (
        <div>
            <button
                onClick={() => {
                    onSelect(node.fullPath);
                    if (hasChildren) setExpanded(e => !e);
                }}
                className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-muted',
                    isSelected && 'bg-primary/10 font-medium text-primary',
                )}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
            >
                {hasChildren ? (
                    <ChevronRight className={cn('size-3 shrink-0 transition-transform', expanded && 'rotate-90')} />
                ) : (
                    <span className="w-3 shrink-0" />
                )}
                {isSelected ? (
                    <FolderOpen className="size-3.5 shrink-0" style={{ color: node.color ?? undefined }} />
                ) : (
                    <Folder className="size-3.5 shrink-0 text-muted-foreground" style={{ color: node.color ?? undefined }} />
                )}
                <span className="truncate">{node.label}</span>
                {node.docCount > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{node.docCount}</span>
                )}
            </button>
            {hasChildren && expanded && (
                <div>
                    {node.children.map(child => (
                        <FolderTreeNode
                            key={child.fullPath}
                            node={child}
                            depth={depth + 1}
                            selectedFolder={selectedFolder}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Document Detail Panel
// ---------------------------------------------------------------------------

function DocumentDetailPanel({
    doc,
    tags,
    onToggleStar,
    onDownload,
    onDelete,
    onUpdate,
    onCreateTag,
    onToggleLock,
    onClose,
    onArchiveTranscribe,
}: {
    doc: DocumentItem;
    tags: Tag[];
    onToggleStar: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onUpdate: (patch: { title?: string; description?: string | null; tagIds?: string[] }) => void;
    onCreateTag: (label: string, color?: string) => Promise<Tag | undefined>;
    onToggleLock: () => void;
    onClose: () => void;
    onArchiveTranscribe?: () => Promise<void>;
}) {
    const [archiving, setArchiving] = useState(false);
    const t = useT();
    const navigate = useNavigate();
    const [editingTitle, setEditingTitle] = useState(false);
    const [newTagInput, setNewTagInput] = useState('');
    const [creatingTag, setCreatingTag] = useState(false);
    const [titleInput, setTitleInput] = useState(doc.title);
    const [previewTab, setPreviewTab] = useState<'preview' | 'details'>('details');
    const [showShareModal, setShowShareModal] = useState(false);
    const [showSignModal, setShowSignModal] = useState(false);
    const [showCrossShareDialog, setShowCrossShareDialog] = useState(false);
    const [showFolderPicker, setShowFolderPicker] = useState(false);
    const [tenantVisibility, setTenantVisibility] = useState<boolean>(doc.visibleToTenant ?? false);
    const [tenantToggleBusy, setTenantToggleBusy] = useState(false);
    const sessionForVisibility = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const visibilityJwt = sessionForVisibility.platform?.token;

    useEffect(() => {
        setTenantVisibility(doc.visibleToTenant ?? false);
    }, [doc.id, doc.visibleToTenant]);

    const handleToggleTenantVisibility = async () => {
        if (!visibilityJwt) return;
        const next = !tenantVisibility;
        setTenantToggleBusy(true);
        // Optimistisch
        setTenantVisibility(next);
        try {
            await documentVisibilityApi.setTenantVisibility(visibilityJwt, doc.id, next);
            toast.success(next ? 'Schul-weit sichtbar gemacht' : 'Schul-weite Sichtbarkeit entfernt');
        } catch (e) {
            setTenantVisibility(!next);
            toast.error('Sichtbarkeit aendern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setTenantToggleBusy(false);
        }
    };
    const textByExtension = /\.(md|markdown|txt|csv|json|xml|html|htm|yaml|yml|log|ini|conf|toml)$/i.test(doc.title);
    const officeExtension = /\.(docx|xlsx|pptx|odt|ods|odp|rtf|eml|msg|epub)$/i.test(doc.title);
    const isSheet = doc.mimeType === SHEET_MIMETYPE;
    const isAudio = /^audio\//.test(doc.mimeType) || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(doc.title);
    const isVideo = /^video\//.test(doc.mimeType) || /\.(mp4|webm|mov|m4v)$/i.test(doc.title);
    const isMediaForGuide = isAudio || isVideo;
    const isPreviewable = /^(image\/|application\/pdf|text\/)/.test(doc.mimeType) || textByExtension || officeExtension;

    const handleTitleSave = () => {
        if (titleInput.trim() && titleInput !== doc.title) {
            onUpdate({ title: titleInput.trim() });
        }
        setEditingTitle(false);
    };

    const handleTagToggle = (tag: Tag) => {
        const currentIds = doc.tags.map(_t => _t.id);
        const newIds = currentIds.includes(tag.id)
            ? currentIds.filter(id => id !== tag.id)
            : [...currentIds, tag.id];
        onUpdate({ tagIds: newIds });
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-4 py-3">
                <FileIcon fileName={doc.title} mimeType={doc.mimeType} className="size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                    {editingTitle ? (
                        <input
                            value={titleInput}
                            onChange={e => setTitleInput(e.target.value)}
                            onBlur={handleTitleSave}
                            onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
                            className="w-full rounded border bg-background px-1 text-[14px] font-semibold outline-none focus:ring-1 focus:ring-primary"
                            autoFocus
                        />
                    ) : (
                        <h3
                            className="cursor-pointer truncate text-[14px] font-semibold hover:underline"
                            onClick={() => { setEditingTitle(true); setTitleInput(doc.title); }}
                        >
                            {doc.title}
                        </h3>
                    )}
                </div>
                <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                    <MaterialIcon name="close" size={16} className="size-4" />
                </button>
            </div>

            {/* Details / Vorschau tabs — Details zuerst (User-Praeferenz 2026-05-03) */}
            {isPreviewable && (
                <div className="flex border-b">
                    <button
                        onClick={() => setPreviewTab('details')}
                        className={cn('flex-1 py-1.5 text-center text-[11px] font-medium transition-colors', previewTab === 'details' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}
                    >
                        {t('documents.documents_hub.details')}
                    </button>
                    <button
                        onClick={() => setPreviewTab('preview')}
                        className={cn('flex-1 py-1.5 text-center text-[11px] font-medium transition-colors', previewTab === 'preview' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}
                    >
                        {t('documents.documents_hub.vorschau')}
                    </button>
                </div>
            )}

            {/* Preview pane */}
            {previewTab === 'preview' && isPreviewable && (
                <DocumentPreview doc={doc} />
            )}

            {/* Details pane */}
            {(previewTab === 'details' || !isPreviewable) && (
                <ScrollArea className="flex-1">
                    <div className="space-y-4 p-4">
                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2">
                            {isSheet && (
                                <button
                                    onClick={() => navigate(`/sheets/${doc.id}`)}
                                    className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[12px] text-primary-foreground hover:bg-primary/90"
                                >
                                    <MaterialIcon name="table_chart" size={16} className="size-3.5" />
                                    {t('documents.documents_hub.tabelle_oeffnen')}
                                </button>
                            )}
                            {isMediaForGuide && (
                                <button
                                    onClick={() => navigate(`/audio-guides/${doc.id}`)}
                                    className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[12px] text-primary-foreground hover:bg-primary/90"
                                    title={isVideo ? 'Video mit Cue-Markern bespielen' : 'Audio-Datei mit Cue-Markern bespielen oder Marker bearbeiten'}
                                >
                                    <MaterialIcon name="headphones" size={16} className="size-3.5" />
                                    {isVideo ? 'Video-Guide oeffnen' : 'AudioGuide oeffnen'}
                                </button>
                            )}
                            <button onClick={onToggleStar} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted">
                                {doc.starred ? <MaterialIcon name="star" size={16} fill={0} className="size-3.5" /> : <MaterialIcon name="star" size={16} className="size-3.5" />}
                                {doc.starred ? 'Entfernen' : 'Markieren'}
                            </button>
                            <button onClick={onDownload} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted">
                                <MaterialIcon name="download" size={16} className="size-3.5" />
                                {t('documents.documents_hub.download')}
                            </button>
                            {isAudio && onArchiveTranscribe && (
                                <button
                                    disabled={archiving}
                                    onClick={async () => { setArchiving(true); try { await onArchiveTranscribe(); } finally { setArchiving(false); } }}
                                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted disabled:opacity-50"
                                    title={t('documents.documents_hub.archive_transcribe_hint', { defaultValue: 'Transkribieren und als Markdown in den Ordner „Archiv" des Space ablegen' })}>
                                    <MaterialIcon name={archiving ? 'hourglass_top' : 'inventory_2'} size={16} className="size-3.5" />
                                    {archiving
                                        ? t('documents.documents_hub.archiving', { defaultValue: 'Archiviere…' })
                                        : t('documents.documents_hub.archive', { defaultValue: 'Archivieren' })}
                                </button>
                            )}
                            <PrintButton docId={doc.id} />
                            {!isSheet && doc.mimeType !== 'application/pdf' && (
                                <button
                                    onClick={async () => {
                                        try {
                                            const session = sessionStore.getSnapshot();
                                            const jwt = session.platform?.token;
                                            if (!jwt) return;
                                            const res = await fetch(`/api/platform/v1/documents/${doc.id}/save-as-pdf`, {
                                                method: 'POST',
                                                headers: { Authorization: `Bearer ${jwt}` },
                                            });
                                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                            const data = await res.json();
                                            toast.success(`Als PDF gespeichert: ${data.document.title}`);
                                        } catch (e) {
                                            toast.error('PDF-Konvertierung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
                                        }
                                    }}
                                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                                    title={t('documents.documents_hub.als_pdf_speichern_im_selben_ordner')}
                                >
                                    <MaterialIcon name="picture_as_pdf" size={16} className="size-3.5" />
                                    {t('documents.documents_hub.als_pdf')}
                                </button>
                            )}
                            <button
                                onClick={async () => {
                                    const { buildPrilogFileLink } = await import('@/lib/prilog-link');
                                    await navigator.clipboard.writeText(buildPrilogFileLink(doc.id));
                                    toast.success('Interner Link kopiert');
                                }}
                                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                                title={t('documents.documents_hub.interner_prilog-link_funktioniert_in_kur')}
                            >
                                <MaterialIcon name="link" size={16} className="size-3.5" />
                                {t('documents.documents_hub.link_kopieren')}
                            </button>
                            <button
                                onClick={() => setShowCrossShareDialog(true)}
                                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                                title={t('documents.documents_hub.in_andere_spaces_teilen_empfaenger_sehen')}
                            >
                                <MaterialIcon name="groups" size={16} className="size-3.5" />
                                {t('documents.documents_hub.in_space_teilen')}
                            </button>
                            <button
                                onClick={() => setShowShareModal(true)}
                                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                                title={t('documents.documents_hub.public-link_erstellen_fuer_externe_empfa')}
                            >
                                <MaterialIcon name="share" size={16} className="size-3.5" />
                                {t('documents.documents_hub.public-link')}
                            </button>
                            <button
                                onClick={() => setShowSignModal(true)}
                                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                                title={t('documents.documents_hub.elektronische_signatur_einholen_eidas_ar')}
                            >
                                <MaterialIcon name="edit" size={16} className="size-3.5" />
                                {t('documents.documents_hub.signieren')}
                            </button>
                            <button
                                onClick={() => setShowFolderPicker(true)}
                                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                                title={t('documents.documents_hub.in_folder_verschieben')}
                            >
                                <MaterialIcon name="drive_file_move" size={16} className="size-3.5" />
                                {t('documents.documents_hub.verschieben')}
                            </button>
                            <button
                                onClick={onDelete}
                                disabled={doc.locked}
                                className={cn(
                                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px]',
                                    doc.locked ? 'cursor-not-allowed opacity-40' : 'text-destructive hover:bg-destructive/10',
                                )}
                                title={doc.locked ? 'Dokument ist gesperrt' : t('common.delete')}
                            >
                                <MaterialIcon name="delete" size={16} className="size-3.5" />
                                {t('documents.documents_hub.loeschen')}
                            </button>
                            <button
                                onClick={onToggleLock}
                                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                                title={doc.locked ? 'Entsperren (Loeschen erlauben)' : 'Sperren (Loeschen verhindern)'}
                            >
                                {doc.locked ? <MaterialIcon name="lock" size={16} className="size-3.5 text-amber-500" /> : <Unlock className="size-3.5" />}
                            </button>
                        </div>

                        {/* Metadata */}
                        <div className="space-y-2">
                            <SectionHeader>{t('documents.documents_hub.metadaten')}</SectionHeader>
                            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
                                <span className="text-muted-foreground">{t('documents.documents_hub.dateityp')}</span>
                                <span>{friendlyMimeType(doc.mimeType)}</span>

                                <span className="text-muted-foreground">{t('documents.documents_hub.groesse')}</span>
                                <span>{formatSize(doc.sizeBytes)}</span>

                                {doc.spaceName && <>
                                    <span className="text-muted-foreground">{t('documents.documents_hub.space')}</span>
                                    <span className="truncate">{doc.spaceName}</span>
                                </>}

                                <span className="text-muted-foreground">{t('documents.documents_hub.hochgeladen_von')}</span>
                                <span className="truncate">{formatUserId(doc.uploadedBy)}</span>

                                <span className="text-muted-foreground">{t('documents.documents_hub.erstellt')}</span>
                                <span>{formatDateTime(doc.createdAt)}</span>

                                <span className="text-muted-foreground">{t('documents.documents_hub.geaendert')}</span>
                                <span>{formatDateTime(doc.updatedAt)}</span>

                                {doc.lastOpenedAt && <>
                                    <span className="text-muted-foreground">{t('documents.documents_hub.zuletzt_geoeffnet')}</span>
                                    <span>{formatDateTime(doc.lastOpenedAt)}</span>
                                </>}

                                {doc.version > 1 && <>
                                    <span className="text-muted-foreground">{t('documents.documents_hub.version')}</span>
                                    <span>v{doc.version}</span>
                                </>}

                                {doc.fileHash && <>
                                    <span className="text-muted-foreground">{t('documents.documents_hub.sha-256')}</span>
                                    <span className="truncate font-mono text-[10px] text-muted-foreground" title={doc.fileHash}>{doc.fileHash.slice(0, 16)}...</span>
                                </>}
                            </div>
                        </div>

                        {/* Schul-weite Sichtbarkeit (Tenant-Broadcast) */}
                        <div className="space-y-2">
                            <SectionHeader>{t('documents.documents_hub.sichtbarkeit')}</SectionHeader>
                            <button
                                type="button"
                                onClick={handleToggleTenantVisibility}
                                disabled={tenantToggleBusy}
                                className={cn(
                                    'flex w-full items-start gap-2 rounded-md border p-2.5 text-left transition-colors disabled:opacity-60',
                                    tenantVisibility
                                        ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10'
                                        : 'border-border hover:bg-muted/50',
                                )}
                                title={tenantVisibility
                                    ? 'Klicken, um schul-weite Sichtbarkeit aufzuheben'
                                    : 'Klicken, um das Dokument fuer alle Mitarbeiter sichtbar zu machen'}
                            >
                                <Globe className={cn('mt-0.5 size-4 shrink-0', tenantVisibility ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-[12px] font-medium">
                                        {t('documents.documents_hub.schul-weit_sichtbar')}
                                        {tenantVisibility && (
                                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                                aktiv
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        {tenantVisibility
                                            ? 'Alle Mitarbeiter sehen dieses Dokument im "Global"-Bereich.'
                                            : 'Nur Mitglieder dieses Spaces (und gezielt geteilte Spaces) sehen es.'}
                                    </p>
                                </div>
                                <span className={cn(
                                    'mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                                    tenantVisibility ? 'bg-emerald-500' : 'bg-muted-foreground/30',
                                )}>
                                    <span className={cn(
                                        'inline-block size-4 rounded-full bg-background shadow transition-transform',
                                        tenantVisibility ? 'translate-x-4' : 'translate-x-0.5',
                                    )} />
                                </span>
                            </button>
                        </div>

                        {/* Description (editable) */}
                        <EditableDescription
                            value={doc.description}
                            onSave={(desc) => onUpdate({ description: desc })}
                        />

                        {/* Expiry */}
                        <ExpirySection doc={doc} onUpdate={onUpdate} />

                        {/* In Ordnern (DMS Phase 1) */}
                        <DocumentFoldersPanel documentId={doc.id} />

                        {/* Dokument-Typ + Custom Fields (DMS Phase 3) */}
                        <DocumentTypePanel
                            documentId={doc.id}
                            initialTypeId={doc.documentTypeId ?? null}
                            initialCustomFields={doc.customFields ?? null}
                        />

                        {/* Aufbewahrung + Legal Hold (DMS Phase 5) */}
                        <RetentionPanel
                            documentId={doc.id}
                            retentionUntil={doc.retentionUntil ?? null}
                            legalHold={doc.legalHold ?? false}
                            legalHoldReason={doc.legalHoldReason ?? null}
                            legalHoldBy={doc.legalHoldBy ?? null}
                            legalHoldAt={doc.legalHoldAt ?? null}
                        />

                        {/* Beziehungen (DMS Phase 4) */}
                        <DocumentRelationsPanel documentId={doc.id} />

                        {/* Vorlage-Markierung (DMS Phase 10, Admin) */}
                        <TemplateTogglePanel doc={doc} />

                        {/* Kommentare (DMS Phase 10) */}
                        <DocumentAnnotationsPanel documentId={doc.id} />

                        {/* Tags */}
                        <div className="space-y-2">
                            <SectionHeader>{t('documents.documents_hub.tags')}</SectionHeader>
                            <div className="flex flex-wrap gap-1.5">
                                {tags.map(tag => {
                                    const active = doc.tags.some(_t => _t.id === tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            onClick={() => handleTagToggle(tag)}
                                            className={cn(
                                                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                                                active
                                                    ? 'border-transparent font-medium'
                                                    : 'border-dashed opacity-50 hover:opacity-100',
                                            )}
                                            style={active ? {
                                                backgroundColor: (tag.color ?? '#94a3b8') + '20',
                                                color: tag.color ?? '#94a3b8',
                                            } : undefined}
                                        >
                                            <div
                                                className="size-2 rounded-full"
                                                style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                                            />
                                            {tag.label}
                                        </button>
                                    );
                                })}
                                {/* New tag input */}
                                {creatingTag ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            value={newTagInput}
                                            onChange={e => setNewTagInput(e.target.value)}
                                            onKeyDown={async e => {
                                                if (e.key === 'Enter' && newTagInput.trim()) {
                                                    const tag = await onCreateTag(newTagInput.trim());
                                                    if (tag) {
                                                        // Auto-assign to current document
                                                        onUpdate({ tagIds: [...doc.tags.map(_t => _t.id), tag.id] });
                                                    }
                                                    setNewTagInput('');
                                                    setCreatingTag(false);
                                                }
                                                if (e.key === 'Escape') { setCreatingTag(false); setNewTagInput(''); }
                                            }}
                                            placeholder={t('documents.documents_hub.neuer_tag')}
                                            className="h-6 w-24 rounded border bg-background px-1.5 text-[11px] outline-none focus:ring-1 focus:ring-primary"
                                            autoFocus
                                        />
                                        <button onClick={() => { setCreatingTag(false); setNewTagInput(''); }} className="rounded p-0.5 hover:bg-muted">
                                            <MaterialIcon name="close" size={16} className="size-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setCreatingTag(true)}
                                        className="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        {t('documents.documents_hub.tag')}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Versions */}
                        <VersionsSection doc={doc} />

                        {/* Activity */}
                        <ActivitySection doc={doc} />
                    </div>
                </ScrollArea>
            )}

            {showShareModal && (
                <ShareLinkModal
                    documentId={doc.id}
                    documentTitle={doc.title}
                    onClose={() => setShowShareModal(false)}
                />
            )}
            {showSignModal && (
                <SignatureModal
                    documentId={doc.id}
                    documentTitle={doc.title}
                    onClose={() => setShowSignModal(false)}
                />
            )}
            {showCrossShareDialog && (
                <DocumentShareDialog
                    documentId={doc.id}
                    documentTitle={doc.title}
                    sourceSpaceId={doc.spaceId ?? null}
                    onClose={() => setShowCrossShareDialog(false)}
                />
            )}
            {showFolderPicker && (
                <DmsFolderPickerModal
                    container={doc.spaceId ? { spaceId: doc.spaceId } : { meinFach: true }}
                    documentId={doc.id}
                    currentFolderId={(doc as DocumentItem & { folderId?: string | null }).folderId ?? null}
                    onClose={() => setShowFolderPicker(false)}
                    onMoved={() => {
                        toast.success('Dokument verschoben');
                        // Doc-Liste refresht via useDocuments-Filter; Detail bleibt
                    }}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Document Preview
// ---------------------------------------------------------------------------

function DocumentPreview({ doc }: { doc: DocumentItem }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const previewGateway = useMemo(() => createProjectGateway(), []);

    const textByExt = /\.(md|markdown|txt|csv|json|xml|html|htm|yaml|yml|log|ini|conf|toml)$/i.test(doc.title);
    const officeExt = /\.(docx|xlsx|pptx|odt|ods|odp|rtf|eml|msg|epub)$/i.test(doc.title);
    const isText = doc.mimeType.startsWith('text/') || textByExt;
    const isMarkdown = doc.mimeType === 'text/markdown' || doc.title.endsWith('.md') || doc.title.endsWith('.markdown');

    useEffect(() => {
        if (!jwt) return;
        setLoading(true);
        setTextContent(null);

        previewGateway.getDocumentPreviewUrl(jwt, doc.spaceId, doc.id)
            .then(async (res) => {
                setPreviewUrl(res.previewUrl);

                // Office formats: use extracted content from backend
                if (res.extractedContent) {
                    setTextContent(res.extractedContent);
                    return;
                }

                // Text/markdown: fetch raw content for Tiptap rendering
                if ((isText || isMarkdown) && res.previewUrl) {
                    try {
                        const resp = await fetch(res.previewUrl);
                        if (resp.ok) {
                            setTextContent(await resp.text());
                        }
                    } catch { /* fallback to iframe */ }
                }
            })
            .catch(() => setPreviewUrl(null))
            .finally(() => setLoading(false));
    }, [jwt, doc.id, doc.spaceId, previewGateway, isText, isMarkdown]);

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center p-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!previewUrl) {
        return (
            <div className="flex flex-1 items-center justify-center p-8">
                <p className="text-[12px] text-muted-foreground">{t('documents.documents_hub.vorschau_nicht_verfuegbar')}</p>
            </div>
        );
    }

    // PDF
    if (doc.mimeType === 'application/pdf') {
        return (
            <iframe
                src={previewUrl}
                className="flex-1 border-0"
                title={doc.title}
            />
        );
    }

    // Images
    if (doc.mimeType.startsWith('image/')) {
        return (
            <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
                <img
                    src={previewUrl}
                    alt={doc.title}
                    className="max-h-full max-w-full rounded object-contain"
                />
            </div>
        );
    }

    // Markdown / Text / Office extracted content → Tiptap
    if (textContent) {
        return (
            <div className="flex-1 overflow-auto">
                <TiptapViewer content={textContent} />
            </div>
        );
    }

    // Fallback: iframe (if we have a URL)
    if (previewUrl) {
        return (
            <iframe
                src={previewUrl}
                className="flex-1 border-0"
                title={doc.title}
            />
        );
    }

    return (
        <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-[12px] text-muted-foreground">{t('documents.documents_hub.vorschau_wird_noch_verarbeitet')}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Editable Description
// ---------------------------------------------------------------------------

function EditableDescription({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
    const t = useT();
    const [editing, setEditing] = useState(false);
    const [input, setInput] = useState(value ?? '');

    const handleSave = () => {
        const trimmed = input.trim();
        onSave(trimmed || null);
        setEditing(false);
    };

    return (
        <div className="space-y-1.5">
            <SectionHeader>{t('documents.documents_hub.beschreibung')}</SectionHeader>
            {editing ? (
                <div className="space-y-1.5">
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        rows={3}
                        className="w-full rounded border bg-background px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                        placeholder={t('documents.documents_hub.beschreibung_hinzufuegen')}
                        autoFocus
                    />
                    <div className="flex gap-1.5">
                        <button onClick={handleSave} className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">{t('common.save')}</button>
                        <button onClick={() => { setEditing(false); setInput(value ?? ''); }} className="rounded border px-2 py-0.5 text-[11px] hover:bg-muted">{t('common.cancel')}</button>
                    </div>
                </div>
            ) : (
                <p
                    onClick={() => { setEditing(true); setInput(value ?? ''); }}
                    className="cursor-pointer whitespace-pre-wrap rounded px-1 py-0.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted"
                >
                    {value || 'Klicken um Beschreibung hinzuzufuegen...'}
                </p>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Expiry Section
// ---------------------------------------------------------------------------

function ExpirySection({ doc, onUpdate }: { doc: DocumentItem; onUpdate: (patch: any) => void }) {
    const t = useT();
    const isExpired = doc.expiresAt && new Date(doc.expiresAt) < new Date();
    const isArchived = !!doc.archivedAt;

    return (
        <div className="space-y-1.5">
            <SectionHeader>{t('documents.documents_hub.ablaufdatum')}</SectionHeader>
            {isArchived && (
                <p className="text-[11px] font-medium text-orange-500">{t('documents.documents_hub.archiviert_seit')} {formatDate(doc.archivedAt!)}</p>
            )}
            {isExpired && !isArchived && (
                <p className="text-[11px] font-medium text-red-500">{t('documents.documents_hub.abgelaufen_am')} {formatDate(doc.expiresAt!)}</p>
            )}
            <div className="flex items-center gap-2">
                <input
                    type="date"
                    value={doc.expiresAt ? new Date(doc.expiresAt).toISOString().split('T')[0] : ''}
                    onChange={e => {
                        const val = e.target.value;
                        onUpdate({ expiresAt: val ? new Date(val).toISOString() : null });
                    }}
                    className="h-7 rounded border bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-primary"
                />
                {doc.expiresAt && (
                    <button
                        onClick={() => onUpdate({ expiresAt: null })}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                        {t('documents.documents_hub.entfernen')}
                    </button>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Versions Section
// ---------------------------------------------------------------------------

const versionGateway = createProjectGateway();

function VersionsSection({ doc }: { doc: DocumentItem }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [versions, setVersions] = useState<Array<{ id: string; version: number; title: string; sizeBytes: number; uploadedBy: string; createdAt: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!expanded || !jwt) return;
        setLoading(true);
        versionGateway.getDocumentVersions(jwt, doc.spaceId, doc.id)
            .then(res => setVersions(res.versions))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [expanded, jwt, doc.id, doc.spaceId]);

    const handleVersionUpload = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0 || !jwt) return;
        setUploading(true);
        try {
            const file = files[0];
            const { uploadUrl, storageKey } = await versionGateway.requestVersionUpload(jwt, doc.spaceId, doc.id, {
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
            });
            await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
            });
            await versionGateway.confirmVersionUpload(jwt, doc.spaceId, doc.id, {
                storageKey,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
            });
            // Reload versions
            const res = await versionGateway.getDocumentVersions(jwt, doc.spaceId, doc.id);
            setVersions(res.versions);
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    }, [jwt, doc.spaceId, doc.id]);

    return (
        <div className="space-y-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="-mx-4 mb-2 flex w-full items-center gap-1.5 border-y border-border bg-muted/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:bg-muted"
            >
                <MaterialIcon name="history" size={16} className="size-3" />
                {t('documents.documents_hub.versionen')}
                {doc.version > 1 && <span className="ml-1 text-primary">v{doc.version}</span>}
                <ChevronDown className={cn('ml-auto size-3 transition-transform', expanded && 'rotate-180')} />
            </button>
            {expanded && (
                <div className="space-y-2">
                    {loading ? (
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                    ) : versions.length <= 1 ? (
                        <p className="text-[11px] text-muted-foreground">{t('documents.documents_hub.keine_aelteren_versionen')}</p>
                    ) : (
                        <div className="space-y-1">
                            {versions.map(v => (
                                <div key={v.id} className={cn(
                                    'flex items-center gap-2 rounded px-2 py-1.5 text-[11px]',
                                    v.id === doc.id && 'bg-primary/5 font-medium',
                                )}>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">v{v.version}</span>
                                    <span className="min-w-0 flex-1 truncate">{formatSize(v.sizeBytes)}</span>
                                    <span className="shrink-0 text-muted-foreground">{formatDate(v.createdAt)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                        {uploading ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="upload" size={16} className="size-3" />}
                        {t('documents.documents_hub.neue_version_hochladen')}
                    </button>
                    <input ref={fileRef} type="file" className="hidden" onChange={e => handleVersionUpload(e.target.files)} />
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Activity Section
// ---------------------------------------------------------------------------

const ACTIVITY_ICONS: Record<string, string> = {
    'document.upload': 'Hochgeladen',
    'document.view': 'Angesehen',
    'document.download': 'Heruntergeladen',
    'document.delete': 'Geloescht',
    'document.version': 'Neue Version',
    'document.update': 'Bearbeitet',
};

const activityGateway = createProjectGateway();

function ActivitySection({ doc }: { doc: DocumentItem }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [entries, setEntries] = useState<Array<{ id: string; contentType: string; actorId: string; actorName?: string; title: string; occurredAt: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!expanded || !jwt) return;
        setLoading(true);
        activityGateway.getDocumentActivity(jwt, doc.spaceId, doc.id)
            .then(res => setEntries(res.entries))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [expanded, jwt, doc.id, doc.spaceId]);

    return (
        <div className="space-y-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="-mx-4 mb-2 flex w-full items-center gap-1.5 border-y border-border bg-muted/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:bg-muted"
            >
                {t('documents.documents_hub.aktivitaet')}
                <ChevronDown className={cn('ml-auto size-3 transition-transform', expanded && 'rotate-180')} />
            </button>
            {expanded && (
                <div className="space-y-1">
                    {loading ? (
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                    ) : entries.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">{t('documents.documents_hub.keine_aktivitaet')}</p>
                    ) : (
                        entries.map(entry => (
                            <div key={entry.id} className="flex items-start gap-2 py-1 text-[11px]">
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium">
                                    {ACTIVITY_ICONS[entry.contentType] ?? entry.contentType}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <span className="text-muted-foreground">{entry.actorName ?? entry.actorId}</span>
                                    <span className="ml-1.5 text-muted-foreground/60">
                                        {new Date(entry.occurredAt).toLocaleString('de-DE', {
                                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                                        })}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Admin Overview Panel
// ---------------------------------------------------------------------------

function AdminOverviewPanel() {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const adminGw = useMemo(() => createProjectGateway(), []);
    const [spaces, setSpaces] = useState<Array<{ spaceId: string; spaceName: string; documentCount: number; totalBytes: number; archivedCount: number; deletedCount: number }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        adminGw.getAdminOverview(jwt)
            .then(res => setSpaces(res.spaces))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [jwt, adminGw]);

    if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

    const totalBytes = spaces.reduce((s, sp) => s + sp.totalBytes, 0);
    const totalDocs = spaces.reduce((s, sp) => s + sp.documentCount, 0);

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-4 py-3">
                <h2 className="text-[15px] font-semibold">{t('documents.documents_hub.speicher-uebersicht')}</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {totalDocs} {t('documents.documents_hub.dokumente')} {formatSize(totalBytes)} gesamt
                </p>
            </div>
            <ScrollArea className="flex-1">
                <div className="divide-y">
                    {spaces.map(sp => (
                        <div key={sp.spaceId} className="flex items-center gap-4 px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium">{sp.spaceName}</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    {sp.documentCount} {t('documents.documents_hub.dokumente')} {formatSize(sp.totalBytes)}
                                </p>
                            </div>
                            <div className="flex shrink-0 gap-3 text-[10px] text-muted-foreground">
                                {sp.archivedCount > 0 && <span className="text-orange-500">{sp.archivedCount} archiviert</span>}
                                {sp.deletedCount > 0 && <span className="text-red-400">{sp.deletedCount} geloescht</span>}
                            </div>
                        </div>
                    ))}
                    {spaces.length === 0 && (
                        <p className="p-8 text-center text-[12px] text-muted-foreground">{t('documents.documents_hub.keine_dokumente_vorhanden')}</p>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Trash Panel
// ---------------------------------------------------------------------------

function TrashPanel() {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const trashGw = useMemo(() => createProjectGateway(), []);
    const [docs, setDocs] = useState<Array<{ id: string; title: string; spaceId: string; spaceName: string; mimeType: string; sizeBytes: number; deletedAt: string }>>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        trashGw.getTrash(jwt)
            .then(res => setDocs(res.documents))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [jwt, trashGw]);

    useEffect(() => { load(); }, [load]);

    const handleRestore = useCallback(async (docId: string) => {
        if (!jwt) return;
        await trashGw.restoreDocument(jwt, docId);
        load();
    }, [jwt, trashGw, load]);

    if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

    return (
        <div className="flex h-full flex-col">
            <div className="border-b px-4 py-3">
                <h2 className="text-[15px] font-semibold">{t('documents.documents_hub.papierkorb')}</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {docs.length} {t('documents.documents_hub.dokumente_werden_nach_30_tagen_endguelti')}
                </p>
            </div>
            <ScrollArea className="flex-1">
                <div className="divide-y">
                    {docs.map(doc => {
                        return (
                            <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                                <FileIcon fileName={doc.title} mimeType={doc.mimeType} className="size-4 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-medium">{doc.title}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {doc.spaceName} · {formatSize(doc.sizeBytes)} {t('documents.documents_hub.geloescht')} {formatDate(doc.deletedAt)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleRestore(doc.id)}
                                    className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
                                >
                                    {t('documents.documents_hub.wiederherstellen')}
                                </button>
                            </div>
                        );
                    })}
                    {docs.length === 0 && (
                        <p className="p-8 text-center text-[12px] text-muted-foreground">{t('documents.documents_hub.papierkorb_ist_leer')}</p>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Tag Manager Panel
// ---------------------------------------------------------------------------

function TagManagerPanel() {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const tagGw = useMemo(() => createProjectGateway(), []);

    const [tags, setTags] = useState<Array<{ id: string; label: string; slug: string; color: string | null; documentCount?: number }>>([]);
    const [loading, setLoading] = useState(true);
    const [newLabel, setNewLabel] = useState('');
    const [newColor, setNewColor] = useState('#6366f1');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editColor, setEditColor] = useState('');

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        tagGw.listTags(jwt)
            .then(res => setTags(res.tags))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [jwt, tagGw]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = useCallback(async () => {
        if (!jwt || !newLabel.trim()) return;
        await tagGw.createTag(jwt, { label: newLabel.trim(), color: newColor });
        setNewLabel('');
        load();
    }, [jwt, newLabel, newColor, tagGw, load]);

    const handleUpdate = useCallback(async (tagId: string) => {
        if (!jwt || !editLabel.trim()) return;
        await tagGw.updateTag(jwt, tagId, { label: editLabel.trim(), color: editColor || undefined });
        setEditingId(null);
        load();
    }, [jwt, editLabel, editColor, tagGw, load]);

    const handleDelete = useCallback(async (tagId: string) => {
        if (!jwt) return;
        const confirmed = window.confirm('Tag endgueltig loeschen? Er wird von allen Dokumenten entfernt.');
        if (!confirmed) return;
        await tagGw.deleteTag(jwt, tagId);
        load();
    }, [jwt, tagGw, load]);

    const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];

    if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

    return (
        <div className="flex h-full flex-col">
            {/* Create new tag */}
            <div className="border-b px-4 py-3">
                <p className="mb-2 text-[12px] font-medium">{t('documents.documents_hub.neuen_tag_erstellen')}</p>
                <div className="flex items-center gap-2">
                    <input
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                        placeholder={t('documents.documents_hub.tag-name')}
                        className="h-8 flex-1 rounded-md border bg-background px-2 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex items-center gap-1">
                        {COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setNewColor(c)}
                                className={cn('size-5 rounded-full transition-transform', newColor === c && 'ring-2 ring-primary ring-offset-1 scale-110')}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={handleCreate}
                        disabled={!newLabel.trim()}
                        className="h-8 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                        {t('documents.documents_hub.erstellen')}
                    </button>
                </div>
            </div>

            {/* Tag list */}
            <ScrollArea className="flex-1">
                <div className="divide-y">
                    {tags.map(tag => (
                        <div key={tag.id} className="flex items-center gap-3 px-4 py-2.5">
                            {editingId === tag.id ? (
                                <>
                                    <div className="flex items-center gap-1">
                                        {COLORS.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setEditColor(c)}
                                                className={cn('size-4 rounded-full', editColor === c && 'ring-2 ring-primary ring-offset-1')}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                    <input
                                        value={editLabel}
                                        onChange={e => setEditLabel(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleUpdate(tag.id); if (e.key === 'Escape') setEditingId(null); }}
                                        className="h-7 flex-1 rounded border bg-background px-2 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                                        autoFocus
                                    />
                                    <button onClick={() => handleUpdate(tag.id)} className="rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground">OK</button>
                                    <button onClick={() => setEditingId(null)} className="rounded border px-2 py-1 text-[11px] hover:bg-muted">{t('common.cancel')}</button>
                                </>
                            ) : (
                                <>
                                    <div className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color ?? '#94a3b8' }} />
                                    <span
                                        className="min-w-0 flex-1 cursor-pointer truncate text-[13px] font-medium hover:underline"
                                        onClick={() => { setEditingId(tag.id); setEditLabel(tag.label); setEditColor(tag.color ?? '#6366f1'); }}
                                    >
                                        {tag.label}
                                    </span>
                                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                        {tag.documentCount ?? 0} {t('documents.documents_hub.dokumente')}
                                    </span>
                                    <button
                                        onClick={() => handleDelete(tag.id)}
                                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        title={t('documents.documents_hub.tag_loeschen')}
                                    >
                                        <MaterialIcon name="delete" size={16} className="size-3.5" />
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                    {tags.length === 0 && (
                        <p className="p-8 text-center text-[12px] text-muted-foreground">{t('documents.documents_hub.noch_keine_tags_erstellt')}</p>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Template-Toggle (DMS Phase 10) — markiert Doc als wiederverwendbare Vorlage
// ---------------------------------------------------------------------------

function TemplateTogglePanel({ doc }: { doc: DocumentItem }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const jwt = session.platform?.token;
    const [busy, setBusy] = useState(false);
    const [isTpl, setIsTpl] = useState(doc.isTemplate ?? false);
    const [cat, setCat] = useState(doc.templateCategory ?? '');

    useEffect(() => {
        setIsTpl(doc.isTemplate ?? false);
        setCat(doc.templateCategory ?? '');
    }, [doc.id, doc.isTemplate, doc.templateCategory]);

    if (!isAdmin || !jwt) return null;

    const save = async (newIsTpl: boolean, newCat: string) => {
        setBusy(true);
        try {
            await dmsTemplatesApi.setTemplate(jwt, doc.id, newIsTpl, newCat.trim() || null);
            setIsTpl(newIsTpl);
        } catch (e) {
            alert('Fehler: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2">
            <SectionHeader>{t('documents.documents_hub.vorlage')}</SectionHeader>
            <label className="flex items-center gap-2 text-xs">
                <input
                    type="checkbox"
                    checked={isTpl}
                    disabled={busy}
                    onChange={e => save(e.target.checked, cat)}
                    className="size-3.5"
                />
                {t('documents.documents_hub.als_wiederverwendbare_vorlage_markieren')}<span>{t('documents.documents_hub.als_wiederverwendbare_vorlage_markieren')}</span>
            </label>
            {isTpl && (
                <input
                    value={cat}
                    onChange={e => setCat(e.target.value)}
                    onBlur={() => save(true, cat)}
                    placeholder={t('documents.documents_hub.kategorie_optional_zb_vertraege')}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                />
            )}
        </div>
    );
}

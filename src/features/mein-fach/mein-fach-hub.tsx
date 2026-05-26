import { type JSX, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MaterialIcon } from '@/components/ui/material-icon';
import { FileIcon } from '@/features/dms/file-icon';
import { useOwnDocuments, useInbox, useQuota, meinFachApi, type MeinFachDocument } from './use-mein-fach';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ResizablePanels } from '@/components/ui/resizable-panels';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { useFileDrop } from './use-file-drop';
import { useT } from '@/lib/i18n/use-t';
import { MeinFachDetailPanel } from './mein-fach-detail';
import { PersonalCalendarCard } from './personal-calendar-card';

/** Welche Section ist aktiv? Wird ueber den URL-Pfad bestimmt. */
type Section = 'documents' | 'inbox' | 'archive';

function sectionFromPath(path: string): Section {
    if (path.startsWith('/mein-fach/inbox')) return 'inbox';
    if (path.startsWith('/mein-fach/archive')) return 'archive';
    return 'documents';
}

function formatBytes(bytes: number | string): string {
    const n = typeof bytes === 'string' ? Number(bytes) : bytes;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const MeinFachHub = (): JSX.Element => {
    const t = useT();
    const location = useLocation();
    const section: Section = sectionFromPath(location.pathname);
    const { quota } = useQuota();

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <header className="flex items-center justify-between border-b border-border px-6 py-3">
                <h1 className="text-lg font-semibold">
                    {t('mein-fach.mein_fach_hub.mein_fach')}
                    {section === 'inbox' && <span className="ml-2 text-sm font-normal text-muted-foreground">{t('mein-fach.mein_fach_hub.postfach')}</span>}
                    {section === 'archive' && <span className="ml-2 text-sm font-normal text-muted-foreground">{t('mein-fach.mein_fach_hub.archiv')}</span>}
                </h1>
                {quota && (
                    <div className="flex gap-4 text-xs text-muted-foreground">
                        <QuotaBadge label={t('mein-fach.mein_fach_hub.dokumente')} used={quota.personal.used} total={quota.personal.total} percent={quota.personal.percent} />
                        <QuotaBadge label={t('mein-fach.mein_fach_hub.postfach')} used={quota.inbox.used} total={quota.inbox.total} percent={quota.inbox.percent} />
                    </div>
                )}
            </header>

            {/* Navigation kommt aus AppSidebar (MeinFachWorld). 3-Spalten:
                links Master-Liste, rechts Detailfenster. */}
            <main className="flex min-h-0 flex-1 flex-col">
                {section === 'documents' && <DocumentsSection />}
                {section === 'inbox' && <InboxSection />}
                {section === 'archive' && <ArchiveSection />}
            </main>
        </div>
    );
};

// ─── Layout-Helfer: Liste links | Detail rechts ──────────────────────────────

function SplitView({ list, detail, fullscreen }: { list: JSX.Element; detail: JSX.Element; fullscreen: boolean }): JSX.Element {
    return (
        <div className="min-h-0 flex-1">
            {fullscreen ? (
                <div className="h-full">{detail}</div>
            ) : (
                <ResizablePanels left={list} right={detail} defaultLeftRatio={0.42} minLeftRatio={0.28} maxLeftRatio={0.7} />
            )}
        </div>
    );
}

function DetailPlaceholder({ text }: { text: string }): JSX.Element {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <MaterialIcon name="folder_open" size={40} className="text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">{text}</p>
        </div>
    );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function DocumentsSection(): JSX.Element {
    const t = useT();
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const h = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
        return () => clearTimeout(h);
    }, [searchInput]);

    const { docs, loading, refresh } = useOwnDocuments(debouncedSearch ? { q: debouncedSearch } : {});
    const [uploading, setUploading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [detail, setDetail] = useState<MeinFachDocument | null>(null);
    const [fullscreen, setFullscreen] = useState(false);

    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const clearSelection = () => setSelected(new Set());

    const handleBulkDelete = async () => {
        if (selected.size === 0) return;
        if (!confirm(`${selected.size} Dokument(e) in den Papierkorb verschieben?`)) return;
        const ids = Array.from(selected);
        const r = await meinFachApi.bulkDeleteDocuments(ids);
        toast.success(`${r.deleted} geloescht.`);
        clearSelection();
        await refresh();
    };

    const handleUpload = async (file: File) => {
        setUploading(true);
        try {
            const resp = await meinFachApi.getUploadUrl({
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
            });
            if (!resp?.uploadUrl?.url) {
                toast.error('Datei-Speicher ist gerade nicht verfuegbar. Bitte wende dich an den Schul-Admin.');
                return;
            }
            await fetch(resp.uploadUrl.url, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
            });
            await meinFachApi.confirmUpload({
                storageKey: resp.storageKey,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
            });
            toast.success(`${file.name} hochgeladen.`);
            await refresh();
        } catch (err) {
            const msg = (err as Error).message ?? '';
            if (msg.includes('S3_NOT_CONFIGURED') || msg.includes('503')) {
                toast.error('Datei-Speicher ist gerade nicht verfuegbar. Bitte wende dich an den Schul-Admin.');
            } else {
                const { showUploadError } = await import('@/core/upload/upload-error');
                showUploadError(err, 'Upload fehlgeschlagen');
            }
        }
    };

    const handleUploadAll = async (files: File[]) => {
        setUploading(true);
        try {
            for (const file of files) await handleUpload(file);
        } finally {
            setUploading(false);
        }
    };

    const { isDragging, dragHandlers } = useFileDrop({ onDrop: handleUploadAll, disabled: uploading });

    const list = (
        <div {...dragHandlers} className={cn('relative flex h-full flex-col', isDragging && 'ring-2 ring-primary ring-inset')}>
            {isDragging && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/5 backdrop-blur-[1px]">
                    <div className="flex flex-col items-center gap-2 rounded-lg bg-background/90 px-6 py-4 shadow-lg">
                        <MaterialIcon name="upload" size={32} className="text-primary" />
                        <p className="text-sm font-medium">{t('mein-fach.mein_fach_hub.dateien_hier_ablegen')}</p>
                    </div>
                </div>
            )}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
                <div className="relative flex-1">
                    <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="search" placeholder={t('mein-fach.mein_fach_hub.suchen_in_dokumenten_inhalt')}
                        value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                        className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
                </div>
                {selected.size > 0 && (
                    <>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{selected.size}</span>
                        <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                            <MaterialIcon name="delete" size={14} /> {t('mein-fach.mein_fach_hub.loeschen')}
                        </Button>
                    </>
                )}
                <label className="cursor-pointer shrink-0">
                    <input type="file" multiple className="hidden"
                        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length > 0) void handleUploadAll(files); e.target.value = ''; }} />
                    <Button asChild disabled={uploading} size="sm"><span>{uploading ? t('mein-fach.mein_fach_hub.lade', { defaultValue: 'Wird hochgeladen…' }) : t('mein-fach.mein_fach_hub.hochladen', { defaultValue: 'Hochladen' })}</span></Button>
                </label>
            </div>
            <ScrollArea className="flex-1">
                <PersonalCalendarCard />
                {loading && <div className="p-4 text-sm text-muted-foreground">{t('mein-fach.mein_fach_hub.lade')}</div>}
                {!loading && docs.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground">
                        {debouncedSearch ? `Keine Treffer fuer "${debouncedSearch}".` : 'Noch keine Dokumente. „Hochladen" oder Datei hierher ziehen.'}
                    </div>
                )}
                <div className="divide-y">
                    {docs.map((doc) => (
                        <div key={doc.id}
                            onClick={() => setDetail(doc)}
                            className={cn('group flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors',
                                detail?.id === doc.id ? 'bg-primary/5' : 'hover:bg-muted/40')}>
                            <input type="checkbox" checked={selected.has(doc.id)} onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleSelect(doc.id)} className="size-4 cursor-pointer" />
                            <FileIcon fileName={doc.title} mimeType={doc.mimeType} className="size-4 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium">{doc.title}</div>
                                <div className="text-[11px] text-muted-foreground">{formatBytes(doc.sizeBytes)} · {formatDate(doc.createdAt)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );

    const detailPanel = detail
        ? <MeinFachDetailPanel doc={detail} section="documents" onChanged={() => { void refresh(); }}
            onClose={() => setDetail(null)} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)} />
        : <DetailPlaceholder text={t('mein-fach.mein_fach_hub.select_doc', { defaultValue: 'Dokument links auswählen.' })} />;

    return <SplitView list={list} detail={detailPanel} fullscreen={fullscreen && !!detail} />;
}

function InboxSection(): JSX.Element {
    const t = useT();
    const { drops, loading, refresh } = useInbox('new');
    const [detail, setDetail] = useState<MeinFachDocument | null>(null);
    const [fullscreen, setFullscreen] = useState(false);

    const list = (
        <div className="flex h-full flex-col">
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
                <span className="text-[12px] font-medium">{t('mein-fach.mein_fach_hub.postfach_neu')}</span>
                <span className="text-[11px] text-muted-foreground">· {drops.length}</span>
            </div>
            <ScrollArea className="flex-1">
                {loading && <div className="p-4 text-sm text-muted-foreground">{t('mein-fach.mein_fach_hub.lade')}</div>}
                {!loading && drops.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground">{t('mein-fach.mein_fach_hub.postfach_ist_leer_wenn_dir_jemand_etwas_')}</div>
                )}
                <div className="divide-y">
                    {drops.map((drop) => (
                        <div key={drop.id} onClick={() => setDetail(drop)}
                            className={cn('flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors',
                                detail?.id === drop.id ? 'bg-primary/5' : 'hover:bg-muted/40',
                                drop.inboxDrop?.readAt === null && 'border-l-2 border-emerald-500')}>
                            <MaterialIcon name="mail" size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium">{drop.title}</div>
                                <div className="text-[11px] text-muted-foreground">
                                    {t('mein-fach.mein_fach_hub.von')} {drop.inboxDrop?.senderUserId} · {formatDate(drop.createdAt)} · {formatBytes(drop.sizeBytes)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );

    const detailPanel = detail
        ? <MeinFachDetailPanel doc={detail} section="inbox" onChanged={() => { void refresh(); }}
            onClose={() => setDetail(null)} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)} />
        : <DetailPlaceholder text={t('mein-fach.mein_fach_hub.select_drop', { defaultValue: 'Eintrag links auswählen.' })} />;

    return <SplitView list={list} detail={detailPanel} fullscreen={fullscreen && !!detail} />;
}

function ArchiveSection(): JSX.Element {
    const t = useT();
    const { drops, loading } = useInbox('archived');
    const [detail, setDetail] = useState<MeinFachDocument | null>(null);
    const [fullscreen, setFullscreen] = useState(false);

    const list = (
        <div className="flex h-full flex-col">
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
                <span className="text-[12px] font-medium">{t('mein-fach.mein_fach_hub.postfach_archiv')}</span>
                <span className="text-[11px] text-muted-foreground">· {drops.length}</span>
            </div>
            <ScrollArea className="flex-1">
                <p className="px-3 py-2 text-[11px] text-muted-foreground">{t('mein-fach.mein_fach_hub.drops_die_du_behalten_hast_zaehlen_zur_e')}</p>
                {loading && <div className="p-4 text-sm text-muted-foreground">{t('mein-fach.mein_fach_hub.lade')}</div>}
                {!loading && drops.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground">{t('mein-fach.mein_fach_hub.archiv_ist_leer')}</div>
                )}
                <div className="divide-y">
                    {drops.map((drop) => (
                        <div key={drop.id} onClick={() => setDetail(drop)}
                            className={cn('flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors',
                                detail?.id === drop.id ? 'bg-primary/5' : 'hover:bg-muted/40')}>
                            <MaterialIcon name="archive" size={16} className="shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium">{drop.title}</div>
                                <div className="text-[11px] text-muted-foreground">
                                    {t('mein-fach.mein_fach_hub.von')} {drop.inboxDrop?.senderUserId} {t('mein-fach.mein_fach_hub.archiviert_am')} {drop.inboxDrop?.archivedAt && formatDate(drop.inboxDrop.archivedAt)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );

    const detailPanel = detail
        ? <MeinFachDetailPanel doc={detail} section="archive" onChanged={() => { /* read-only */ }}
            onClose={() => setDetail(null)} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)} />
        : <DetailPlaceholder text={t('mein-fach.mein_fach_hub.select_drop', { defaultValue: 'Eintrag links auswählen.' })} />;

    return <SplitView list={list} detail={detailPanel} fullscreen={fullscreen && !!detail} />;
}

// Settings-Section entfaellt — Mein-Fach-spezifische Settings liegen in den
// globalen Settings unter /settings/dms-email.

function QuotaBadge({ label, used, total, percent }: { label: string; used: string; total: string; percent: number }): JSX.Element {
    const color = percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
        <div className="flex items-center gap-2">
            <span>{label}</span>
            <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full transition-all', color)} style={{ width: `${Math.min(percent, 100)}%` }} />
            </div>
            <span className="tabular-nums">{formatBytes(used)} / {formatBytes(total)}</span>
        </div>
    );
}

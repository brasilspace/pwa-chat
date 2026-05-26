/**
 * MeinFachDetailPanel — rechtes Detailfenster der „Mein Fach"-3-Spalten-
 * Ansicht. Vorschau + Metadaten + sektionsspezifische Aktionen.
 *
 * Bewusst schlank/eigenständig (nicht der schwere DMS-DocumentDetailPanel):
 * Mein-Fach ist PERSONAL/INBOX — kein Space, keine Tags, kein Teilen/
 * Signieren/Tenant-Sichtbarkeit. Das rechte Panel ist ein sauberer Slot,
 * der später auch andere Hub-Inhalte aufnehmen kann.
 */
import { type JSX, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileIcon } from '@/features/dms/file-icon';
import { buildPrilogFileLink } from '@/lib/prilog-link';
import { toast } from '@/components/ui/toast';
import { meinFachApi, type MeinFachDocument } from './use-mein-fach';
import { useT } from '@/lib/i18n/use-t';

function fmtBytes(b: number | string): string {
    const n = typeof b === 'string' ? Number(b) : b;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '–';
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type Section = 'documents' | 'inbox' | 'archive';

export function MeinFachDetailPanel({
    doc, section, onChanged, onClose, fullscreen, onToggleFullscreen,
}: {
    doc: MeinFachDocument;
    section: Section;
    onChanged: () => void;
    onClose: () => void;
    fullscreen?: boolean;
    onToggleFullscreen?: () => void;
}): JSX.Element {
    const t = useT();
    const [url, setUrl] = useState<string | null>(null);
    const [textBody, setTextBody] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const isImage = /^image\//.test(doc.mimeType);
    const isPdf = doc.mimeType === 'application/pdf';
    const isAudio = /^audio\//.test(doc.mimeType);
    const isText = /^text\//.test(doc.mimeType) || /\.(md|markdown|txt|csv|log|json|xml|yaml|yml)$/i.test(doc.title);

    useEffect(() => {
        setUrl(null); setTextBody(null);
        let cancelled = false;
        meinFachApi.getDocumentDownloadUrl(doc.id)
            .then(async (r) => {
                if (cancelled || !r?.url) return;
                setUrl(r.url);
                if (isText) {
                    try {
                        const res = await fetch(r.url);
                        const txt = await res.text();
                        if (!cancelled) setTextBody(txt.slice(0, 50000));
                    } catch { /* Vorschau optional */ }
                }
            })
            .catch(() => { /* Vorschau/Download optional */ });
        return () => { cancelled = true; };
    }, [doc.id, isText]);

    const run = async (fn: () => Promise<unknown>, ok: string) => {
        setBusy(true);
        try { await fn(); toast.success(ok); onChanged(); onClose(); }
        catch (e) { toast.error((e instanceof Error ? e.message : String(e))); }
        finally { setBusy(false); }
    };

    const copyLink = async () => {
        await navigator.clipboard.writeText(buildPrilogFileLink(doc.id));
        toast.success(t('mein-fach.detail.link_copied', { defaultValue: 'Interner Link kopiert' }));
    };

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-1.5 border-b px-2">
                <button onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden" title={t('mein-fach.detail.close', { defaultValue: 'Schließen' })}>
                    <MaterialIcon name="arrow_back" size={18} />
                </button>
                <FileIcon fileName={doc.title} mimeType={doc.mimeType} className="size-4 shrink-0" />
                <span className="flex-1 truncate text-[13px] font-medium" title={doc.title}>{doc.title}</span>
                {url && (
                    <a href={url} target="_blank" rel="noreferrer"
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t('mein-fach.detail.download', { defaultValue: 'Herunterladen' })}>
                        <MaterialIcon name="download" size={18} />
                    </a>
                )}
                <button onClick={copyLink} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('mein-fach.detail.copy_link', { defaultValue: 'Internen Link kopieren' })}>
                    <MaterialIcon name="link" size={18} />
                </button>
                {onToggleFullscreen && (
                    <button onClick={onToggleFullscreen} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={fullscreen ? t('mein-fach.detail.column_view', { defaultValue: 'Spaltenansicht' }) : t('mein-fach.detail.fullscreen', { defaultValue: 'Vollbild' })}>
                        <MaterialIcon name={fullscreen ? 'close_fullscreen' : 'open_in_full'} size={18} />
                    </button>
                )}
            </div>

            <ScrollArea className="flex-1">
                <div className="space-y-4 p-4">
                    {/* Vorschau */}
                    <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                        {isImage && url && <img src={url} alt={doc.title} className="max-h-[420px] w-full object-contain" />}
                        {isPdf && url && <iframe src={url} title={doc.title} className="h-[480px] w-full" />}
                        {isAudio && url && <div className="p-4"><audio src={url} controls className="w-full" /></div>}
                        {isText && textBody != null && <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-3 text-[12px] leading-snug">{textBody}</pre>}
                        {!isImage && !isPdf && !isAudio && !isText && (
                            <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                                <FileIcon fileName={doc.title} mimeType={doc.mimeType} className="size-10 text-muted-foreground/40" />
                                <p className="text-[12px] text-muted-foreground">{t('mein-fach.detail.no_preview', { defaultValue: 'Keine Vorschau — bitte herunterladen.' })}</p>
                            </div>
                        )}
                    </div>

                    {/* Inbox-Kontext */}
                    {doc.inboxDrop && (
                        <div className="rounded-lg border border-border p-3 text-[12px]">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('mein-fach.detail.from', { defaultValue: 'Postfach' })}</div>
                            <div>{t('mein-fach.detail.sender', { defaultValue: 'Absender' })}: <b>{doc.inboxDrop.senderUserId}</b></div>
                            {doc.inboxDrop.senderNote && <div className="mt-1 rounded bg-muted px-2 py-1 italic">„{doc.inboxDrop.senderNote}"</div>}
                            {doc.inboxDrop.expiresAt && <div className="mt-1 text-muted-foreground">{t('mein-fach.detail.expires', { defaultValue: 'Läuft ab' })}: {fmtDate(doc.inboxDrop.expiresAt)}</div>}
                            {doc.inboxDrop.archivedAt && <div className="mt-1 text-muted-foreground">{t('mein-fach.detail.archived_at', { defaultValue: 'Archiviert am' })}: {fmtDate(doc.inboxDrop.archivedAt)}</div>}
                        </div>
                    )}

                    {/* Metadaten */}
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                        <span className="text-muted-foreground">{t('mein-fach.detail.type', { defaultValue: 'Typ' })}</span><span>{doc.mimeType}</span>
                        <span className="text-muted-foreground">{t('mein-fach.detail.size', { defaultValue: 'Größe' })}</span><span>{fmtBytes(doc.sizeBytes)}</span>
                        <span className="text-muted-foreground">{t('mein-fach.detail.scope', { defaultValue: 'Bereich' })}</span><span>{doc.scope === 'INBOX' ? t('mein-fach.detail.scope_inbox', { defaultValue: 'Postfach' }) : t('mein-fach.detail.scope_personal', { defaultValue: 'Eigene Dokumente' })}</span>
                        <span className="text-muted-foreground">{t('mein-fach.detail.created', { defaultValue: 'Erstellt' })}</span><span>{fmtDate(doc.createdAt)}</span>
                        <span className="text-muted-foreground">{t('mein-fach.detail.last_opened', { defaultValue: 'Zuletzt geöffnet' })}</span><span>{fmtDate(doc.lastOpenedAt)}</span>
                        {doc.description && <><span className="text-muted-foreground">{t('mein-fach.detail.description', { defaultValue: 'Beschreibung' })}</span><span>{doc.description}</span></>}
                    </div>

                    {/* Aktionen je Sektion */}
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                        {section === 'inbox' && (
                            <>
                                <button disabled={busy} onClick={() => run(() => meinFachApi.moveToDocs(doc.id), t('mein-fach.detail.moved', { defaultValue: 'In eigene Dokumente übernommen.' }))}
                                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted disabled:opacity-50">
                                    <MaterialIcon name="drive_file_move" size={16} /> {t('mein-fach.detail.move_to_docs', { defaultValue: 'In Dokumente' })}
                                </button>
                                <button disabled={busy} onClick={() => run(() => meinFachApi.archiveDrop(doc.id), t('mein-fach.detail.archived', { defaultValue: 'Ins Archiv verschoben.' }))}
                                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted disabled:opacity-50">
                                    <MaterialIcon name="archive" size={16} /> {t('mein-fach.detail.to_archive', { defaultValue: 'Ins Archiv' })}
                                </button>
                                <button disabled={busy} onClick={() => { if (confirm(t('mein-fach.detail.confirm_delete_drop', { defaultValue: 'Drop löschen?' }))) void run(() => meinFachApi.deleteDrop(doc.id), t('mein-fach.detail.drop_deleted', { defaultValue: 'Drop gelöscht.' })); }}
                                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] text-destructive hover:bg-destructive/10 disabled:opacity-50">
                                    <MaterialIcon name="delete" size={16} /> {t('mein-fach.detail.delete', { defaultValue: 'Löschen' })}
                                </button>
                            </>
                        )}
                        {section === 'documents' && (
                            <button disabled={busy} onClick={() => { if (confirm(t('mein-fach.detail.confirm_delete_doc', { defaultValue: 'Dokument in den Papierkorb verschieben?' }))) void run(() => meinFachApi.deleteDocument(doc.id), t('mein-fach.detail.doc_deleted', { defaultValue: 'Dokument gelöscht.' })); }}
                                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] text-destructive hover:bg-destructive/10 disabled:opacity-50">
                                <MaterialIcon name="delete" size={16} /> {t('mein-fach.detail.delete', { defaultValue: 'Löschen' })}
                            </button>
                        )}
                        {section === 'archive' && (
                            <span className="text-[12px] text-muted-foreground">{t('mein-fach.detail.archive_readonly', { defaultValue: 'Archiv — nur Ansicht. Download oben möglich.' })}</span>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}

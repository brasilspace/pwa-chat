import { memo, useSyncExternalStore, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { chatSettings } from '@/core/settings/chat-settings';
import { sessionStore } from '@/core/session/session-store';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { useLongPress } from '@/core/responsive/use-long-press';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useMatrixMedia, triggerMatrixDownload } from '@/components/ui/use-matrix-media';
import { usePdfThumbnail } from '@/features/chat/use-pdf-thumbnail';
import type { ChatMessage, ChatAttachment } from '@/features/chat/chat-types';
import { cn } from '@/lib/utils';
import { Reply, FileType2, Smile, Loader2, X, MoreHorizontal } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import type { Reactions } from '@/features/chat/chat-types';
import { EmojiPicker } from './emoji-picker';
import { ShareDialog } from './share-dialog';
import { saveAttachmentToMeinFach } from '@/features/mein-fach/save-from-chat';
import { sanitizeMatrixHtml } from '@/components/editor/sanitize';
import { useT } from "@/lib/i18n/use-t";

/**
 * MessageBody — rendert formatted_body (HTML, sanitisiert) wenn vorhanden,
 * sonst Plain-Body. Wird von beiden Bubble-Layouts (WhatsApp + Default)
 * benutzt damit Formatierung konsistent ist.
 */
function MessageBody({ body, formattedBody }: { body: string; formattedBody?: string }) {
    if (formattedBody) {
        return (
            <div
                className="rich-message text-[15px] leading-relaxed [&_p]:my-0 [&_p+p]:mt-2 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/10 [&_pre]:p-2 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeMatrixHtml(formattedBody) }}
            />
        );
    }
    return <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{body}</div>;
}

// PDF-Viewer lazy laden — pdfjs-dist ist ~800 KB, den wollen wir nicht
// im Haupt-Bundle haben. Erst wenn jemand tatsaechlich eine PDF oeffnet,
// wird pdfjs geladen. Die ChatBubble bleibt leichtgewichtig.
const PdfViewerModal = lazy(() =>
    import('@/features/chat/pdf-viewer-modal').then((m) => ({ default: m.PdfViewerModal })),
);

function formatTime(ts: number): string {
    return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(ts);
}

interface ChatBubbleProps {
    msg: ChatMessage;
    isSelf: boolean;
    displayName: string;
    avatarMxc?: string | null;
    onCreateTask?: (body: string, eventId: string) => void;
    onReply?: (eventId: string) => void;
    onReact?: (eventId: string, emoji: string) => void;
    reactions?: Reactions;
    threadCount?: number;
    onOpenThread?: (eventId: string) => void;
    /** Wenn aus dieser Nachricht eine Aufgabe entstanden ist:
     *  Status der Aufgabe (todo/in_progress/review/done). Bubble wird
     *  dann mit der Spaltenfarbe umrandet. */
    taskStatus?: 'todo' | 'in_progress' | 'review' | 'done';
    /** Display-Name des Verantwortlichen — wird unter der Zeit angezeigt. */
    taskResponsibleLabel?: string;
    /** Space, in dem dieser Chat gerade geoeffnet ist — Default fuer Share-Dialog. */
    contextSpaceId?: string;
}

// Watercolor-Farben — gleicher Hex wie die Kanban-Spalten (200er-Shades).
const TASK_STATUS_BORDER: Record<string, string> = {
    todo: '#fecaca',         // red-200
    in_progress: '#fde68a',  // amber-200
    review: '#bfdbfe',       // blue-200
    done: '#a7f3d0',         // emerald-200
};

export const ChatBubble = memo(function ChatBubble({ msg, isSelf, displayName, avatarMxc, onCreateTask, onReply, onReact, reactions, threadCount, onOpenThread, taskStatus, taskResponsibleLabel, contextSpaceId }: ChatBubbleProps) {
    const t = useT();
    const { design } = useSyncExternalStore(chatSettings.subscribe, chatSettings.get);
    const [taskCreated, setTaskCreated] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [showMobileSheet, setShowMobileSheet] = useState(false);
    const [showShareDialog, setShowShareDialog] = useState<false | 'chat' | 'task'>(false);
    const myUserId = sessionStore.getSnapshot().matrix?.userId;
    const isMobile = useIsMobile();

    // Long-Press auf der Bubble oeffnet auf Mobile ein Bottom-Sheet mit
    // Aktionen — Ersatz fuer Hover-Menues, die auf Touch nicht existieren.
    const longPressHandlers = useLongPress(() => {
        if (isMobile) setShowMobileSheet(true);
    }, 450);

    // Reaction badges
    const reactionBadges = reactions && reactions.size > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
            {Array.from(reactions.entries()).map(([emoji, users]) => (
                <button
                    key={emoji}
                    onClick={() => onReact?.(msg.eventId, emoji)}
                    className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors hover:bg-muted',
                        users.has(myUserId ?? '') ? 'border-primary/40 bg-white dark:bg-gray-800' : 'border-border bg-white dark:bg-gray-800',
                    )}
                >
                    <span>{emoji}</span>
                    <span className="text-[10px] text-muted-foreground">{users.size}</span>
                </button>
            ))}
        </div>
    ) : null;

    const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    const [showMenu, setShowMenu] = useState(false);
    const [showQuickReactions, setShowQuickReactions] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Klick ausserhalb schliesst Menu + Quick-Reactions
    useEffect(() => {
        if (!showMenu && !showQuickReactions) return;
        const onDocClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
                setShowQuickReactions(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [showMenu, showQuickReactions]);

    const anyAction = onReact || onReply || onCreateTask;

    const hoverMenu = anyAction ? (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => { setShowMenu(!showMenu); setShowQuickReactions(false); }}
                className="flex items-center justify-center size-6 rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={t('app.misc.mehr')}
            >
                <MoreHorizontal className="size-4" />
            </button>
            {showMenu && (
                <div className={cn(
                    'absolute z-50 mt-1 min-w-[180px] rounded-md border bg-popover py-1 shadow-lg',
                    isSelf ? 'right-0' : 'left-0',
                )}>
                    {onReact && (
                        <button
                            type="button"
                            onClick={() => { setShowMenu(false); setShowQuickReactions(true); }}
                            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                        >
                            <Smile className="size-4 text-muted-foreground" />
                            <span>{t('app.misc.reagieren')}</span>
                        </button>
                    )}
                    {onReply && (
                        <button
                            type="button"
                            onClick={() => { onReply(msg.eventId); setShowMenu(false); }}
                            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                        >
                            <Reply className="size-4 text-muted-foreground" />
                            <span>{t('app.misc.antworten')}</span>
                        </button>
                    )}
                    {onCreateTask && (
                        <button
                            type="button"
                            onClick={() => { setShowShareDialog('task'); setShowMenu(false); }}
                            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                        >
                            <MaterialIcon name="check_box" size={16} className="size-4 text-muted-foreground" />
                            <span>{t('app.misc.als_aufgabe_erstellen')}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => { setShowShareDialog('chat'); setShowMenu(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                    >
                        <MaterialIcon name="share" size={16} className="size-4 text-muted-foreground" />
                        <span>{t('app.misc.teilen')}</span>
                    </button>
                </div>
            )}
            {showQuickReactions && onReact && (
                <div className={cn(
                    'absolute z-50 mt-1 flex items-center gap-0.5 rounded-full border bg-popover px-1.5 py-1 shadow-lg',
                    isSelf ? 'right-0' : 'left-0',
                )}>
                    {QUICK_EMOJIS.map(e => (
                        <button
                            key={e}
                            onClick={() => { onReact(msg.eventId, e); setShowQuickReactions(false); }}
                            className="flex items-center justify-center size-8 rounded-full text-lg transition-transform hover:scale-125"
                        >
                            {e}
                        </button>
                    ))}
                    <div className="w-px h-5 bg-border mx-0.5" />
                    <button
                        onClick={() => { setShowQuickReactions(false); setShowReactionPicker(true); }}
                        className="flex items-center justify-center size-8 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={t('app.misc.mehr')}
                    >
                        <Smile className="size-4" />
                    </button>
                </div>
            )}
            {showReactionPicker && onReact && (
                <EmojiPicker
                    onSelect={(emoji) => { onReact(msg.eventId, emoji); setShowReactionPicker(false); }}
                    onClose={() => setShowReactionPicker(false)}
                />
            )}
        </div>
    ) : null;

    const threadBadge = threadCount && threadCount > 0 && onOpenThread ? (
        <button
            onClick={() => onOpenThread(msg.eventId)}
            className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
            <MaterialIcon name="chat" size={16} className="size-3" />
            {threadCount} {threadCount === 1 ? 'Antwort' : 'Antworten'}
        </button>
    ) : null;

    const attachmentView = msg.attachment ? (
        <AttachmentView attachment={msg.attachment} messageTimestamp={msg.timestamp} />
    ) : null;

    if (design === 'whatsapp') {
        return (
            <>
                <div className={cn(
                    'group flex px-4 py-0.5 touch-pan-y',
                    isSelf ? 'justify-end' : 'justify-start',
                    msg.pending && 'opacity-60',
                    msg.failed && 'opacity-40',
                )}>
                    <div className="relative max-w-[75%] touch-pan-y" {...longPressHandlers}>
                        <div
                            className={cn(
                                'rounded-lg px-3 py-1.5 shadow-sm',
                                isSelf
                                    ? 'rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b]'
                                    : 'rounded-tl-none bg-white dark:bg-[#202c33]',
                                taskStatus && 'border-2',
                            )}
                            style={taskStatus ? { borderColor: TASK_STATUS_BORDER[taskStatus] } : undefined}
                            title={taskStatus ? 'Aus dieser Nachricht ist eine Aufgabe entstanden' : undefined}
                        >
                            {!isSelf && (
                                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{displayName}</div>
                            )}
                            {attachmentView ?? <MessageBody body={msg.body} formattedBody={msg.formattedBody} />}
                            <div className="mt-0.5 flex items-center justify-end gap-1">
                                <span className="text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                                {msg.failed && <span className="text-[10px] text-destructive">!</span>}
                            </div>
                            {taskStatus && taskResponsibleLabel && (
                                <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                                    <MaterialIcon name="person" size={12} />
                                    <span className="truncate">{taskResponsibleLabel}</span>
                                </div>
                            )}
                        </div>
                        {/* Hover actions — nur auf Desktop (md+) sichtbar.
                            Mobile bekommt Long-Press + Bottom-Sheet stattdessen. */}
                        <div className={cn(
                            'absolute -top-2.5 z-10 hidden rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm md:group-hover:block',
                            isSelf ? 'right-1' : 'left-1',
                        )}>
                            {hoverMenu}
                        </div>
                        {/* Reaction badges — below bubble */}
                        {reactionBadges && <div className="-mt-1.5 ml-2">{reactionBadges}</div>}
                        {threadBadge}
                    </div>
                </div>
                {showMobileSheet && (
                    <ChatBubbleActionSheet
                        msg={msg}
                        onClose={() => setShowMobileSheet(false)}
                        onReact={onReact}
                        onReply={onReply}
                        onCreateTaskOpen={() => { setShowMobileSheet(false); setShowShareDialog('task'); }}
                        onCreateTask={onCreateTask}
                        onShare={() => { setShowMobileSheet(false); setShowShareDialog('chat'); }}
                    />
                )}
                {showShareDialog && (
                    <ShareDialog
                        messageBody={msg.body}
                        senderDisplayName={displayName}
                        timestamp={msg.timestamp}
                        sourceEventId={msg.eventId}
                        contextSpaceId={contextSpaceId}
                        initialTab={showShareDialog === 'task' ? 'task' : 'chat'}
                        onClose={() => setShowShareDialog(false)}
                    />
                )}
            </>
        );
    }

    // Slack design
    return (
        <>
            <div className={cn(
                'group relative flex gap-3 px-4 py-1.5 touch-pan-y',
                msg.pending && 'opacity-60',
                msg.failed && 'opacity-40',
            )}>
                <div className="mt-0.5">
                    <UserAvatar displayName={displayName} avatarMxc={avatarMxc} size="sm" />
                </div>
                <div className="min-w-0 flex-1 touch-pan-y" {...longPressHandlers}>
                    <div className="mb-0.5 flex items-baseline gap-2">
                        <span className={cn('text-sm font-semibold', isSelf && 'text-primary')}>{displayName}</span>
                        <span className="text-xs text-muted-foreground">{formatTime(msg.timestamp)}</span>
                        {msg.failed && <span className="text-xs text-destructive">{t('app.misc.senden_fehlgeschlagen')}</span>}
                    </div>
                    {taskStatus && taskResponsibleLabel && (
                        <div className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <MaterialIcon name="person" size={12} />
                            <span className="truncate">{t('app.misc.verantwortlich')} {taskResponsibleLabel}</span>
                        </div>
                    )}
                    <div className={cn(
                        'rounded-[var(--chat-bubble-radius)] px-4 py-2.5 text-[15px] leading-relaxed',
                        isSelf
                            ? 'bg-[var(--chat-user-bubble)] text-[var(--chat-user-foreground)]'
                            : 'bg-[var(--chat-assistant-bubble)] text-[var(--chat-assistant-foreground)]',
                        taskStatus && 'border-2',
                    )}
                        style={taskStatus ? { borderColor: TASK_STATUS_BORDER[taskStatus] } : undefined}
                        title={taskStatus ? 'Aus dieser Nachricht ist eine Aufgabe entstanden' : undefined}
                    >
                        {attachmentView ?? <MessageBody body={msg.body} formattedBody={msg.formattedBody} />}
                    </div>
                    {threadBadge}
                    {/* Hover actions — nur auf Desktop (md+) sichtbar */}
                    <div className="mt-0.5 hidden md:group-hover:block">
                        {hoverMenu}
                    </div>
                </div>
            </div>
            {showMobileSheet && (
                <ChatBubbleActionSheet
                    msg={msg}
                    onClose={() => setShowMobileSheet(false)}
                    onReact={onReact}
                    onReply={onReply}
                    onCreateTask={onCreateTask}
                    onCreateTaskOpen={() => { setShowMobileSheet(false); setShowShareDialog('task'); }}
                />
            )}
        </>
    );
});

/**
 * Bottom-Sheet mit Message-Actions fuer Mobile.
 *
 * Oeffnet sich nach Long-Press auf eine Chat-Bubble. Zeigt:
 * - Quick-Emoji-Reactions (wie Messenger-Apps)
 * - Antworten (Thread)
 * - Als Aufgabe erstellen
 *
 * Tap auf Backdrop oder X oder eine der Aktionen schliesst den Sheet.
 * Body-Scroll wird waehrenddessen blockiert, damit der Nutzer nicht
 * ausversehen durch den Chat dahinter scrollt.
 */
function ChatBubbleActionSheet({ msg, onClose, onReact, onReply, onCreateTask, onCreateTaskOpen, onShare }: {
    msg: ChatMessage;
    onClose: () => void;
    onReact?: (eventId: string, emoji: string) => void;
    onReply?: (eventId: string) => void;
    onCreateTask?: (body: string, eventId: string) => void;
    onCreateTaskOpen?: () => void;
    onShare?: () => void;
}) {
    const t = useT();
    // Body-Scroll blockieren waehrend der Sheet offen ist
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end bg-black/40 animate-in fade-in"
            onClick={onClose}
        >
            <div
                className="w-full rounded-t-2xl bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl animate-in slide-in-from-bottom duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drag-Handle */}
                <div className="flex justify-center pt-2 pb-1">
                    <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
                </div>

                {/* Quick-Reactions */}
                {onReact && (
                    <div className="flex items-center justify-around px-2 py-3 border-b border-border">
                        {QUICK_EMOJIS.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => { onReact(msg.eventId, emoji); onClose(); }}
                                className="flex size-12 items-center justify-center rounded-full text-2xl transition-transform active:scale-125"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}

                {/* Action-Liste */}
                <div className="py-2">
                    {onReply && (
                        <button
                            type="button"
                            onClick={() => { onReply(msg.eventId); onClose(); }}
                            className="flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] transition-colors active:bg-muted"
                        >
                            <Reply className="size-5 text-muted-foreground" />
                            <span>{t('app.misc.antworten')}</span>
                        </button>
                    )}
                    {onCreateTaskOpen && (
                        <button
                            type="button"
                            onClick={onCreateTaskOpen}
                            className="flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] transition-colors active:bg-muted"
                        >
                            <MaterialIcon name="check_box" size={16} className="size-5 text-muted-foreground" />
                            <span>{t('app.misc.als_aufgabe_erstellen')}</span>
                        </button>
                    )}
                    {onShare && (
                        <button
                            type="button"
                            onClick={onShare}
                            className="flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] transition-colors active:bg-muted"
                        >
                            <MaterialIcon name="share" size={16} className="size-5 text-muted-foreground" />
                            <span>{t('app.misc.teilen')}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] text-muted-foreground transition-colors active:bg-muted"
                    >
                        <MaterialIcon name="close" size={16} className="size-5" />
                        <span>{t('app.misc.abbrechen')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Attachment Rendering ────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useAccessToken(): string | null {
    return sessionStore.getSnapshot().matrix?.accessToken ?? null;
}

function AttachmentView({ attachment, messageTimestamp }: { attachment: ChatAttachment; messageTimestamp: number }) {
    if (attachment.msgtype === 'm.image') {
        return <ImageAttachment attachment={attachment} />;
    }
    if (attachment.msgtype === 'm.video') {
        return <VideoAttachment attachment={attachment} />;
    }
    if (attachment.msgtype === 'm.audio') {
        return <AudioAttachment attachment={attachment} messageTimestamp={messageTimestamp} />;
    }
    // PDFs bekommen eine eigene Darstellung mit Thumbnail + Modal-Viewer.
    if (attachment.mimetype === 'application/pdf' || attachment.filename.toLowerCase().endsWith('.pdf')) {
        return <PdfAttachment attachment={attachment} />;
    }
    return <FileAttachment attachment={attachment} />;
}

/**
 * AttachmentCaption — Filename + Groesse unter Bild/Video/Audio.
 *
 * Der Filename wird truncated, damit lange Namen den Bubble nie sprengen.
 * Die Groesse hinten ist immer voll sichtbar, weil der Filename schrumpft
 * (min-w-0 + flex-1 + truncate), nicht das ganze Element.
 *
 * Die feste Maximalbreite (320px) gibt dem Browser einen non-circular
 * width-Anker — damit funktioniert truncate auch innerhalb intrinsisch
 * sized Bubble-Containern.
 */
function AttachmentCaption({ filename, size, attachment }: { filename: string; size: number; attachment?: ChatAttachment }) {
    const t = useT();
    const handleSaveToFach = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!attachment) return;
        void saveAttachmentToMeinFach({
            mxcUrl: attachment.mxcUrl,
            fileName: attachment.filename,
            mimeType: attachment.mimetype,
        });
    };
    return (
        <div className="flex max-w-[320px] items-center gap-1 text-[10px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{filename}</span>
            <span className="shrink-0 whitespace-nowrap">— {formatFileSize(size)}</span>
            {attachment && (
                <button
                    type="button"
                    onClick={handleSaveToFach}
                    title={t('app.misc.in_mein_fach_speichern')}
                    className="ml-1 shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground"
                >
                    <MaterialIcon name="inbox" size={16} className="size-3" />
                </button>
            )}
        </div>
    );
}

function ImageAttachment({ attachment }: { attachment: ChatAttachment }) {
    const token = useAccessToken();
    // Thumbnail-Dimensionen passen zum maxH im UI — 800x600 ist die groesste
    // Anzeige, die die bubble hergeben kann, alles darueber ist Bandbreiten-
    // verschwendung.
    const thumbUrl = useMatrixMedia(attachment.mxcUrl, token, { width: 800, height: 600, method: 'scale' });
    // Lokale Vorschau (vom Sender) hat Vorrang waehrend pending — Server-
    // Thumbnail kann fuer fresh uploads ein paar Sekunden brauchen, oder
    // bei HEIC/PSD/exotischen Formaten ganz fehlschlagen.
    const displayUrl = attachment.localBlobUrl ?? thumbUrl;

    const handleClick = async () => {
        if (!token || !attachment.mxcUrl) return;
        await triggerMatrixDownload(attachment.mxcUrl, token, attachment.filename);
    };

    return (
        <div className="space-y-1">
            {displayUrl ? (
                <img
                    src={displayUrl}
                    alt={attachment.filename}
                    onClick={handleClick}
                    className="max-h-64 max-w-full rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                    loading="lazy"
                />
            ) : (
                <ImageSkeleton attachment={attachment} />
            )}
            <AttachmentCaption filename={attachment.filename} size={attachment.size} attachment={attachment} />
        </div>
    );
}

/**
 * Graue Flaeche mit Spinner, deren Seitenverhaeltnis wir aus den
 * Matrix-Metadaten rekonstruieren — damit der Chat beim Laden nicht
 * ruckelt, sobald das Bild fertig ist.
 */
function ImageSkeleton({ attachment }: { attachment: ChatAttachment }) {
    const w = attachment.width ?? 16;
    const h = attachment.height ?? 9;
    return (
        <div
            className="relative flex items-center justify-center rounded-lg bg-muted/40"
            style={{ aspectRatio: `${w} / ${h}`, maxHeight: '16rem', maxWidth: '100%' }}
        >
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
    );
}

function VideoAttachment({ attachment }: { attachment: ChatAttachment }) {
    const token = useAccessToken();
    // Poster laden, sobald vorhanden — das ist meistens sofort da, weil
    // der Thumbnail client-seitig erzeugt und separat hochgeladen wurde.
    const remotePoster = useMatrixMedia(
        attachment.thumbnailMxcUrl ?? null,
        token,
        attachment.thumbnailMxcUrl
            ? { width: 640, height: 360, method: 'scale' }
            : undefined,
    );
    // Lokale Datei-Vorschau hat Vorrang fuer pending Uploads
    const posterUrl = attachment.localBlobUrl ?? remotePoster;
    // Das eigentliche Video holen wir erst wenn der User "abspielen" drueckt —
    // sonst wuerde die ganze Datei (bis zu 200MB) eagerly geladen, nur um im
    // Chat zu haengen. Klick → fetch → blob URL → <video> mit autoplay.
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [loadingVideo, setLoadingVideo] = useState(false);

    const loadVideo = async () => {
        if (videoUrl || loadingVideo || !token) return;
        setLoadingVideo(true);
        const match = attachment.mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
        if (!match) { setLoadingVideo(false); return; }
        try {
            const res = await fetch(
                `${window.location.origin}/_matrix/client/v1/media/download/${match[1]}/${match[2]}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!res.ok) throw new Error(`${res.status}`);
            const blob = await res.blob();
            setVideoUrl(URL.createObjectURL(blob));
        } catch {
            /* ignore */
        } finally {
            setLoadingVideo(false);
        }
    };

    const w = attachment.thumbnailWidth ?? attachment.width ?? 16;
    const h = attachment.thumbnailHeight ?? attachment.height ?? 9;

    return (
        <div className="space-y-1">
            {videoUrl ? (
                <video src={videoUrl} controls autoPlay className="max-h-64 max-w-full rounded-lg" preload="metadata" />
            ) : (
                <button
                    type="button"
                    onClick={loadVideo}
                    disabled={loadingVideo}
                    className="group relative flex max-h-64 items-center justify-center overflow-hidden rounded-lg bg-black"
                    style={{ aspectRatio: `${w} / ${h}`, maxWidth: '100%' }}
                >
                    {posterUrl ? (
                        <img src={posterUrl} alt={attachment.filename} className="h-full w-full object-contain" />
                    ) : (
                        <div className="flex size-full items-center justify-center bg-muted/40">
                            <MaterialIcon name="movie" size={16} className="size-8 text-muted-foreground" />
                        </div>
                    )}
                    {/* Play-Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-opacity group-hover:bg-black/20">
                        {loadingVideo ? (
                            <Loader2 className="size-10 animate-spin text-white drop-shadow-lg" />
                        ) : (
                            <div className="flex size-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
                                <svg viewBox="0 0 24 24" className="ml-1 size-7 fill-black">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </div>
                        )}
                    </div>
                </button>
            )}
            <AttachmentCaption filename={attachment.filename} size={attachment.size} attachment={attachment} />
        </div>
    );
}

function AudioAttachment({ attachment, messageTimestamp }: { attachment: ChatAttachment; messageTimestamp: number }) {
    const t = useT();
    const token = useAccessToken();
    const audioUrl = useMatrixMedia(attachment.mxcUrl, token);

    // "Transkribiere..."-Indikator: zeigt animierte Pünktchen unter der
    // Audio-Bubble solange noch kein Transkript da ist UND die Nachricht
    // juenger als 3 Minuten ist. Nach 3 Minuten ohne Transkript verschwindet
    // der Indikator (Annahme: Transkription deaktiviert oder fehlgeschlagen).
    //
    // Wir tickern jede Sekunde damit der Auto-Hide nach 3 Min sauber feuert.
    const TRANSCRIBE_TIMEOUT_MS = 3 * 60 * 1000;
    const [now, setNow] = useState(() => Date.now());
    const ageMs = now - messageTimestamp;
    const isTranscribing = !attachment.transcript && ageMs < TRANSCRIBE_TIMEOUT_MS;

    useEffect(() => {
        if (!isTranscribing) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [isTranscribing]);

    return (
        <div className="space-y-1">
            {audioUrl ? (
                <audio src={audioUrl} controls className="w-full max-w-xs" preload="metadata" />
            ) : (
                <div className="flex h-10 w-64 items-center justify-center rounded-lg bg-muted/40">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
            )}
            <AttachmentCaption filename={attachment.filename} size={attachment.size} attachment={attachment} />
            {attachment.transcript ? (
                <div className="mt-1 max-w-[320px] rounded-md border border-border/50 bg-background/50 px-2 py-1.5">
                    <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        <span>{t('app.misc.flurfunk-transkript')}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-foreground">
                        {attachment.transcript}
                    </p>
                </div>
            ) : isTranscribing ? (
                <div className="mt-1 flex max-w-[320px] items-center gap-1.5 rounded-md border border-dashed border-border/50 bg-background/30 px-2 py-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t('app.misc.transkribiere')}
                    </span>
                    <span className="flex gap-0.5">
                        <span className="size-1 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: '0ms' }} />
                        <span className="size-1 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: '200ms' }} />
                        <span className="size-1 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: '400ms' }} />
                    </span>
                </div>
            ) : null}
        </div>
    );
}

function FileAttachment({ attachment }: { attachment: ChatAttachment }) {
    const t = useT();
    const token = useAccessToken();
    const [savingToFach, setSavingToFach] = useState(false);
    const handleDownload = async () => {
        if (!token) return;
        await triggerMatrixDownload(attachment.mxcUrl, token, attachment.filename);
    };
    const handleSaveToFach = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (savingToFach) return;
        setSavingToFach(true);
        await saveAttachmentToMeinFach({
            mxcUrl: attachment.mxcUrl,
            fileName: attachment.filename,
            mimeType: attachment.mimetype,
        });
        setSavingToFach(false);
    };
    return (
        <div className="flex w-full items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
            <button
                type="button"
                onClick={handleDownload}
                className="flex flex-1 items-center gap-3 text-left"
                title={t('app.misc.herunterladen')}
            >
                <MaterialIcon name="description" size={16} className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{attachment.filename}</p>
                    <p className="text-[10px] text-muted-foreground">{formatFileSize(attachment.size)}</p>
                </div>
                <MaterialIcon name="download" size={16} className="size-4 shrink-0 text-muted-foreground" />
            </button>
            <button
                type="button"
                onClick={handleSaveToFach}
                disabled={savingToFach}
                title={t('app.misc.in_mein_fach_speichern')}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
                {savingToFach ? <Loader2 className="size-4 animate-spin" /> : <MaterialIcon name="inbox" size={16} className="size-4" />}
            </button>
        </div>
    );
}

function PdfAttachment({ attachment }: { attachment: ChatAttachment }) {
    const t = useT();
    const token = useAccessToken();
    const [open, setOpen] = useState(false);
    const thumb = usePdfThumbnail(attachment.mxcUrl, token);
    // Blob-URL der Original-PDF — wird vom Modal benoetigt. Wir laden
    // sie sowieso fuer das Thumbnail (useMatrixMedia in usePdfThumbnail),
    // also ist der zweite Hook-Aufruf dank Cache ein Gratis-Lookup.
    const pdfBlobUrl = useMatrixMedia(attachment.mxcUrl, token);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="group flex w-full max-w-sm flex-col gap-1.5 rounded-lg border bg-muted/30 p-2 text-left transition-colors hover:bg-muted/50"
            >
                {/* Thumbnail-Bereich */}
                <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {thumb ? (
                        <img src={thumb} alt={attachment.filename} className="h-full w-full object-contain" />
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <FileType2 className="size-10" />
                            <Loader2 className="size-4 animate-spin" />
                        </div>
                    )}
                </div>
                {/* Datei-Info */}
                <div className="flex items-center gap-2 px-1">
                    <FileType2 className="size-4 shrink-0 text-red-500" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{attachment.filename}</p>
                        <p className="text-[10px] text-muted-foreground">{t('app.misc.pdf')} {formatFileSize(attachment.size)}</p>
                    </div>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            void saveAttachmentToMeinFach({
                                mxcUrl: attachment.mxcUrl,
                                fileName: attachment.filename,
                                mimeType: attachment.mimetype,
                            });
                        }}
                        title={t('app.misc.in_mein_fach_speichern')}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <MaterialIcon name="inbox" size={16} className="size-4" />
                    </button>
                </div>
            </button>

            {open && pdfBlobUrl && token && (
                <Suspense fallback={null}>
                    <PdfViewerModal
                        pdfBlobUrl={pdfBlobUrl}
                        filename={attachment.filename}
                        mxcUri={attachment.mxcUrl}
                        accessToken={token}
                        onClose={() => setOpen(false)}
                    />
                </Suspense>
            )}
        </>
    );
}

import { type JSX, useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { chatSettings } from '@/core/settings/chat-settings';
import { chatStore } from '@/features/chat/chat-store';
import { useChatRoom } from '@/features/chat/use-chat-room';
import { createMatrixGateway } from '@/gateways/matrix/matrix-gateway';
import { useMarkRoomAsRead } from '@/features/chat/use-mark-room-as-read';
import { useSwipeRightToBack } from '@/core/responsive/use-swipe-right-to-back';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { ChatThreadPanel } from '@/components/chat/chat-thread-panel';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useMatrixAvatar } from '@/components/ui/matrix-avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ResizablePanels, type ResizablePanelsHandle } from '@/components/ui/resizable-panels';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useContacts } from '@/features/contacts/use-contacts';
import { cn } from '@/lib/utils';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { Loader2, Info, Mail, AtSign, User, ChevronRight, Users } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useNavigate } from 'react-router-dom';
import { useT } from "@/lib/i18n/use-t";

const matrixGateway = createMatrixGateway();

function formatDate(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Heute';
    if (d.toDateString() === yesterday.toDateString()) return 'Gestern';
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function groupByDate<T extends { timestamp: number }>(messages: T[]): [string, T[]][] {
    const groups = new Map<string, T[]>();
    for (const msg of messages) {
        const key = formatDate(msg.timestamp);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(msg);
    }
    return Array.from(groups.entries());
}

export const DmChat = (): JSX.Element => {
    const t = useT();
    const { recipientId } = useParams<{ recipientId: string }>();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const myUserId = session.matrix?.userId;
    const accessToken = session.matrix?.accessToken;

    const decodedRecipient = recipientId ? decodeURIComponent(recipientId) : undefined;
    const recipientName = decodedRecipient?.split(':')[0].replace('@', '') ?? '?';

    const existingRoomId = decodedRecipient ? chatStore.getDirectRoomId(decodedRecipient) : null;

    const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const roomId = existingRoomId ?? createdRoomId;

    useEffect(() => {
        if (!decodedRecipient || !accessToken || !myUserId || roomId) return;

        setCreating(true);
        // Autoritativer DM-Open: verhindert Duplikat-Räume, wenn der
        // lokale directRooms-Cache nach Login noch nicht hydrated ist
        // (rssw-Incident 2026-05-20: 2 DM-Räume, Verlauf wirkte „weg").
        matrixGateway.getOrCreateDirectChat(accessToken, myUserId, decodedRecipient)
            .then((res) => {
                setCreatedRoomId(res.room_id);
                chatStore.setDirectRoom(decodedRecipient, res.room_id);
            })
            .catch(() => setError('Chat konnte nicht erstellt werden.'))
            .finally(() => setCreating(false));
    }, [decodedRecipient, accessToken, myUserId, roomId]);

    const {
        messages, typingUsers, members, sendMessage, sendFile, sendReaction, sendTyping, reactions,
    } = useChatRoom(roomId ?? undefined);

    // Filter: only main timeline (exclude thread replies and Flurfunk-
    // Transkript-Replies — die werden inline in die Audio-Bubble gehaengt)
    const mainMessages = useMemo(
        () => messages.filter(m => !m.threadId && !m.isTranscriptReply),
        [messages],
    );

    const dateGroups = useMemo(() => groupByDate(mainMessages), [mainMessages]);
    const { design: chatDesign, background: chatBg } = useSyncExternalStore(chatSettings.subscribe, chatSettings.get);
    const [panelOpen, setPanelOpen] = useState(true);
    const [activeThread, setActiveThread] = useState<string | null>(null);
    const { contacts } = useContacts();
    const contactInfo = contacts.find(c => c.id === decodedRecipient);

    const scrollRef = useRef<HTMLDivElement>(null);
    const isAtBottom = useRef(true);
    const prevMsgCount = useRef(0);
    const panelsRef = useRef<ResizablePanelsHandle>(null);

    // Mark-as-read via shared hook (m.fully_read + m.read an Synapse).
    const markReadIfBottom = useMarkRoomAsRead({
        roomId,
        messages: mainMessages,
        scrollRef,
    });

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (mainMessages.length > prevMsgCount.current) {
            const wasInitialLoad = prevMsgCount.current === 0;
            if (wasInitialLoad || isAtBottom.current) {
                requestAnimationFrame(() => {
                    el.scrollTop = el.scrollHeight;
                    isAtBottom.current = true;
                    markReadIfBottom(true);
                });
            }
        }
        prevMsgCount.current = mainMessages.length;
    }, [mainMessages.length, markReadIfBottom]);

    useEffect(() => { prevMsgCount.current = 0; }, [roomId]);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        markReadIfBottom();
    }, [markReadIfBottom]);

    const activeTyping = typingUsers.filter((u) => u !== myUserId);
    const typingText = activeTyping.length > 0
        ? `${recipientName} schreibt...`
        : null;

    const handleReply = useCallback((eventId: string) => {
        setActiveThread(eventId);
        setPanelOpen(true);
    }, []);

    const handleOpenThread = useCallback((eventId: string) => {
        setActiveThread(eventId);
        setPanelOpen(true);
    }, []);

    const handleCloseThread = useCallback(() => {
        setActiveThread(null);
    }, []);

    // Swipe-Right-to-Back: Mobile Geste — irgendwo im Chat-Panel nach rechts
    // wischen kehrt zur Kontakte-Liste zurueck.
    const swipeBackHandlers = useSwipeRightToBack(isMobile, () => navigate('/contacts'));

    if (creating) {
        return (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('modules.dm_chat.chat_wird_erstellt')}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
                {error}
            </div>
        );
    }

    const chatPanel = (
        <div className="flex h-full flex-col" {...swipeBackHandlers}>
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-2 md:gap-3 md:px-4">
                {/* Breadcrumb-Pattern (Mobile only): "Kontakte > Name".
                    Users-Icon tap-bar (fuehrt zum Kontakte-Hub), der
                    Chevron rechts daneben ist dekorativer Separator. */}
                <button
                    type="button"
                    onClick={() => navigate('/contacts')}
                    aria-label={t('modules.dm_chat.zurueck_zu_kontakte')}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors active:bg-muted md:hidden"
                >
                    <MaterialIcon name="groups" size={16} className="size-5" />
                </button>
                <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground/60 md:hidden"
                />
                <UserAvatar displayName={recipientName} avatarMxc={members.get(decodedRecipient ?? '')?.avatarMxc} size="md" />
                <span className="flex-1 text-sm font-medium">{recipientName}</span>
                {/* Mobile: Pfeil nach rechts → Info-Panel oeffnen */}
                <button
                    type="button"
                    onClick={() => panelsRef.current?.showInfoPanel()}
                    aria-label={t('modules.dm_chat.info-panel_oeffnen')}
                    className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors active:bg-muted md:hidden"
                >
                    <MaterialIcon name="chevron_right" size={16} className="size-5" />
                </button>
                <button
                    onClick={() => { setPanelOpen(o => !o); setActiveThread(null); }}
                    className="hidden size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
                    title={panelOpen ? 'Info ausblenden' : 'Info anzeigen'}
                >
                    {panelOpen ? <MaterialIcon name="right_panel_close" size={16} className="size-4" /> : <MaterialIcon name="right_panel_open" size={16} className="size-4" />}
                </button>
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className={cn(
                    'min-h-0 flex-1 overflow-y-auto touch-pan-y',
                    !chatBg && chatDesign === 'whatsapp' && 'bg-[#e5ddd5] dark:bg-[#0b141a]',
                )}
                // touch-action: pan-y → horizontale Wisch-Geste propagiert hoch
                // zum Snap-Container, sodass Wischen Chat → Info-Panel funktioniert
                style={{ overscrollBehavior: 'contain', ...(chatBg ? { backgroundColor: chatBg } : {}) }}
            >
                <div className="py-4">
                    {mainMessages.length === 0 && (
                        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                            {t('modules.dm_chat.starte_eine_unterhaltung_mit')} {recipientName}.
                        </div>
                    )}

                    {dateGroups.map(([date, msgs]) => (
                        <div key={date}>
                            <div className="flex items-center gap-3 px-4 py-3">
                                <div className="h-px flex-1 bg-border" />
                                <span className="shrink-0 text-xs font-medium text-muted-foreground">{date}</span>
                                <div className="h-px flex-1 bg-border" />
                            </div>
                            {msgs.map((msg) => (
                                <ChatBubble
                                    key={msg.eventId}
                                    msg={msg}
                                    isSelf={msg.sender === myUserId}
                                    displayName={msg.sender === myUserId ? 'Du' : recipientName}
                                    avatarMxc={members.get(msg.sender)?.avatarMxc ?? null}
                                    onReply={handleReply}
                                    onReact={sendReaction}
                                    reactions={reactions.get(msg.eventId)}
                                    threadCount={roomId ? chatStore.getThreadCount(roomId, msg.eventId) : 0}
                                    onOpenThread={handleOpenThread}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {typingText && (
                <div className="border-t px-4 py-1.5">
                    <span className="text-xs text-muted-foreground italic">{typingText}</span>
                </div>
            )}

            <ChatComposer roomId={roomId ?? undefined} onSend={sendMessage} onSendFile={sendFile} onTyping={sendTyping} />
        </div>
    );

    const recipientMember = members.get(decodedRecipient ?? '');

    // Right panel: thread or user info
    const rightPanel = activeThread && roomId ? (
        <ChatThreadPanel
            roomId={roomId}
            threadRootId={activeThread}
            myUserId={myUserId ?? ''}
            members={members}
            onSendMessage={sendMessage}
            onTyping={sendTyping}
            onClose={handleCloseThread}
        />
    ) : (
        <DmUserInfoPanel
            userId={decodedRecipient ?? ''}
            roomId={roomId ?? undefined}
            displayName={contactInfo?.displayName ?? recipientName}
            username={contactInfo?.username ?? recipientName}
            email={contactInfo?.email}
            userType={contactInfo?.userType}
            avatarMxc={recipientMember?.avatarMxc}
        />
    );

    return (
        <ResizablePanels
            ref={panelsRef}
            left={chatPanel}
            right={rightPanel}
            rightCollapsed={!panelOpen}
            defaultLeftRatio={0.65}
            minLeftRatio={0.4}
            maxLeftRatio={0.85}
        />
    );
};

// ─── User Info Side Panel (like Space-Info) ─────────────────────────────

function DmUserInfoPanel({ userId, roomId, displayName, username, email, userType, avatarMxc }: {
    userId: string; roomId?: string; displayName: string; username: string;
    email?: string | null; userType?: string | null; avatarMxc?: string | null;
}) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const { avatarMode } = useSyncExternalStore(chatSettings.subscribe, chatSettings.get);
    const avatarUrl = useMatrixAvatar(avatarMode === 'image' ? avatarMxc : null, session.matrix?.accessToken);
    const initials = displayName ? displayName.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) : '?';
    const showAvatar = avatarMode !== 'none';

    return (
        <div className="flex h-full flex-col border-l">
            {/* Header */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center border-b px-4">
                <MaterialIcon name="info" size={16} className="size-4 text-muted-foreground" />
            </div>

            <ScrollArea className="flex-1">
                <div className="flex flex-col items-center px-6 py-6">
                    {/* Avatar respects avatarMode setting */}
                    {showAvatar && (
                        <Avatar className="size-24">
                            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                            <AvatarFallback className="bg-primary/10 text-3xl text-primary">
                                {avatarMode === 'initial' ? initials : ''}
                            </AvatarFallback>
                        </Avatar>
                    )}

                    <h3 className={cn('text-lg font-semibold', showAvatar && 'mt-3')}>{displayName}</h3>
                    <p className="text-sm text-muted-foreground">@{username}</p>
                </div>

                <div className="space-y-1 px-4 pb-6">
                    {userType && (
                        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50">
                            <MaterialIcon name="shield" size={16} className="size-4 shrink-0 text-muted-foreground" />
                            <div>
                                <p className="text-[10px] font-medium text-muted-foreground">{t('modules.dm_chat.rolle')}</p>
                                <p className="text-sm">{userType}</p>
                            </div>
                        </div>
                    )}

                    {email && (
                        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50">
                            <MaterialIcon name="mail" size={16} className="size-4 shrink-0 text-muted-foreground" />
                            <div>
                                <p className="text-[10px] font-medium text-muted-foreground">{t('modules.dm_chat.e-mail')}</p>
                                <p className="text-sm">{email}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50">
                        <AtSign className="size-4 shrink-0 text-muted-foreground" />
                        <div>
                            <p className="text-[10px] font-medium text-muted-foreground">{t('modules.dm_chat.matrix-id')}</p>
                            <p className="font-mono text-xs">{userId}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50">
                        <User className="size-4 shrink-0 text-muted-foreground" />
                        <div>
                            <p className="text-[10px] font-medium text-muted-foreground">{t('modules.dm_chat.benutzername')}</p>
                            <p className="text-sm">{username}</p>
                        </div>
                    </div>
                </div>

                {/* Space Memberships */}
                <UserSpaces userId={userId} />

                {/* Shared Media */}
                {roomId && <DmSharedMedia roomId={roomId} />}
            </ScrollArea>
        </div>
    );
}

const spaceGw = createProjectGateway();

function UserSpaces({ userId }: { userId: string }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const [spaces, setSpaces] = useState<Array<{ id: string; name: string; type: string; color: string | null; role: string }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        spaceGw.getUserSpaces(jwt, userId)
            .then(res => setSpaces(res.spaces))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [jwt, userId]);

    if (loading) return null;
    if (spaces.length === 0) return null;

    const ROLE_LABELS: Record<string, string> = {
        ADMIN: 'Admin',
        MODERATOR: 'Moderator',
        MEMBER: t('common.member_singular'),
    };

    return (
        <div className="px-4 pb-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MaterialIcon name="grid_view" size={16} className="size-3" />
                {t('modules.dm_chat.gemeinsame_spaces')}{spaces.length})
            </p>
            <div className="space-y-0.5">
                {spaces.map(space => (
                    <button
                        key={space.id}
                        onClick={() => navigate(`/spaces/${space.id}/chat`)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50"
                    >
                        <div
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: space.color ?? '#94a3b8' }}
                        />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{space.name}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                            {ROLE_LABELS[space.role] ?? space.role}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function DmSharedMedia({ roomId }: { roomId: string }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const chatSnapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
    const token = session.matrix?.accessToken;
    const roomState = chatSnapshot.rooms.get(roomId);

    const mediaItems = (roomState?.messages ?? [])
        .filter(m => m.attachment)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);

    if (mediaItems.length === 0) return null;

    const images = mediaItems.filter(m => m.attachment?.msgtype === 'm.image');
    const files = mediaItems.filter(m => m.attachment && m.attachment.msgtype !== 'm.image');

    function getThumbUrl(mxcUrl: string) {
        return matrixGateway.mxcToHttp(mxcUrl, token ?? undefined);
    }

    function getDlUrl(mxcUrl: string) {
        const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
        if (!match) return '';
        const base = `/_matrix/client/v1/media/download/${match[1]}/${match[2]}`;
        return token ? `${base}?access_token=${encodeURIComponent(token)}` : base;
    }

    return (
        <div className="px-4 pb-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {t('modules.dm_chat.geteilte_medien')}{mediaItems.length})
            </p>

            {images.length > 0 && (
                <div className="grid grid-cols-3 gap-1 mb-3">
                    {images.slice(0, 9).map(m => (
                        <a key={m.eventId} href={getDlUrl(m.attachment!.mxcUrl)} target="_blank" rel="noopener noreferrer"
                            className="aspect-square overflow-hidden rounded hover:opacity-80 transition-opacity">
                            <img src={getThumbUrl(m.attachment!.mxcUrl)} alt={m.attachment!.filename}
                                className="size-full object-cover" loading="lazy" />
                        </a>
                    ))}
                </div>
            )}

            {files.length > 0 && (
                <div className="space-y-1">
                    {files.slice(0, 5).map(m => (
                        <a key={m.eventId} href={getDlUrl(m.attachment!.mxcUrl)} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted transition-colors">
                            <MaterialIcon name="description" size={16} className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="flex-1 truncate">{m.attachment!.filename}</span>
                            <MaterialIcon name="download" size={16} className="size-3 shrink-0 text-muted-foreground" />
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import { chatSettings } from '@/core/settings/chat-settings';
import { chatStore } from '@/features/chat/chat-store';
import { ChatBubble } from './chat-bubble';
import { ChatComposer } from './chat-composer';
import type { ChatMessage, MemberInfo } from '@/features/chat/chat-types';
import { cn } from '@/lib/utils';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface ThreadPanelProps {
    roomId: string;
    threadRootId: string;
    myUserId: string;
    members: Map<string, MemberInfo>;
    onSendMessage: (text: string, html: string | undefined, threadId: string) => void;
    onTyping: () => void;
    onClose: () => void;
}

export function ChatThreadPanel({ roomId, threadRootId, myUserId, members, onSendMessage, onTyping, onClose }: ThreadPanelProps) {
    const t = useT();
    const snapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
    const room = snapshot.rooms.get(roomId);

    const rootMessage = useMemo(
        () => room?.messages.find(m => m.eventId === threadRootId) ?? null,
        [room?.messages, threadRootId],
    );

    const threadMessages = useMemo(
        () => chatStore.getThreadMessages(roomId, threadRootId),
        [roomId, threadRootId, room?.messages],
    );

    const { design: chatDesign, background: chatBg } = useSyncExternalStore(chatSettings.subscribe, chatSettings.get);

    const scrollRef = useRef<HTMLDivElement>(null);
    const prevCount = useRef(0);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (threadMessages.length > prevCount.current || prevCount.current === 0) {
            requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
        }
        prevCount.current = threadMessages.length;
    }, [threadMessages.length]);

    const handleSend = useCallback((text: string, html?: string) => {
        onSendMessage(text, html, threadRootId);
    }, [onSendMessage, threadRootId]);

    const getName = (sender: string) =>
        members.get(sender)?.displayName ?? sender.split(':')[0].replace('@', '');

    return (
        <div className="flex h-full flex-col border-l">
            {/* Header */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-4">
                <MaterialIcon name="chat" size={16} className="size-4 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{t('app.misc.thread')}</span>
                <span className="text-xs text-muted-foreground">
                    {threadMessages.length} {threadMessages.length === 1 ? 'Antwort' : 'Antworten'}
                </span>
                <button
                    onClick={onClose}
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={t('app.misc.thread_schliessen')}
                >
                    <MaterialIcon name="close" size={16} className="size-4" />
                </button>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className={cn(
                    'min-h-0 flex-1 overflow-y-auto',
                    !chatBg && chatDesign === 'whatsapp' && 'bg-[#e5ddd5] dark:bg-[#0b141a]',
                )}
                style={{ overscrollBehavior: 'contain', ...(chatBg ? { backgroundColor: chatBg } : {}) }}
            >
                <div className="py-4">
                    {/* Root message */}
                    {rootMessage && (
                        <>
                            <ChatBubble
                                msg={rootMessage}
                                isSelf={rootMessage.sender === myUserId}
                                displayName={getName(rootMessage.sender)}
                                avatarMxc={members.get(rootMessage.sender)?.avatarMxc ?? null}
                            />
                            <div className="mx-4 my-2 flex items-center gap-3">
                                <div className="h-px flex-1 bg-border" />
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {threadMessages.length} {threadMessages.length === 1 ? 'Antwort' : 'Antworten'}
                                </span>
                                <div className="h-px flex-1 bg-border" />
                            </div>
                        </>
                    )}

                    {/* Thread replies */}
                    {threadMessages.map((msg) => (
                        <ChatBubble
                            key={msg.eventId}
                            msg={msg}
                            isSelf={msg.sender === myUserId}
                            displayName={getName(msg.sender)}
                            avatarMxc={members.get(msg.sender)?.avatarMxc ?? null}
                        />
                    ))}
                </div>
            </div>

            {/* Composer */}
            <ChatComposer
                onSend={handleSend}
                onTyping={onTyping}
                placeholder={t('app.misc.antworten')}
            />
        </div>
    );
}

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Pin, Reply, MoreHorizontal } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

export interface ChatMessageData {
    id: string;
    role: 'user' | 'assistant' | 'system';
    author: string;
    content: string;
    timestamp: string;
    attachments?: { name: string; type: string }[];
}

interface ChatMessageProps {
    message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps) {
    const t = useT();
    const [hovered, setHovered] = useState(false);

    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';

    const bubbleBg = isUser
        ? 'bg-[var(--chat-user-bubble)] text-[var(--chat-user-foreground)]'
        : isSystem
            ? 'bg-[var(--chat-system-bubble)] text-muted-foreground'
            : 'bg-[var(--chat-assistant-bubble)] text-[var(--chat-assistant-foreground)]';

    return (
        <div
            className="group relative flex gap-3 px-4 py-2"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Avatar */}
            <Avatar className="mt-0.5 size-7 shrink-0">
                <AvatarFallback className="text-[10px]">
                    {message.author.charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>

            {/* Content */}
            <div className="min-w-0 max-w-[var(--content-reading-width)] flex-1">
                {/* Meta */}
                <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{message.author}</span>
                    <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                </div>

                {/* Bubble */}
                <div
                    className={cn(
                        'rounded-[var(--chat-bubble-radius)] px-4 py-2.5 text-[15px] leading-relaxed',
                        bubbleBg,
                    )}
                >
                    {message.content}
                </div>

                {/* Attachments */}
                {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {message.attachments.map((att) => (
                            <div
                                key={att.name}
                                className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs"
                            >
                                <span className="truncate">{att.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Actions (hover) */}
            {hovered && (
                <div className="absolute -top-3 right-4 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 shadow-[var(--shadow-xs)]">
                    <MessageAction icon={<Reply className="size-3.5" />} label={t('app.misc.antworten')} />
                    <MessageAction icon={<MaterialIcon name="content_copy" size={16} className="size-3.5" />} label={t('app.misc.kopieren')} />
                    <MessageAction icon={<Pin className="size-3.5" />} label={t('app.misc.anheften')} />
                    <MessageAction icon={<MaterialIcon name="check_box" size={16} className="size-3.5" />} label={t('app.misc.aufgabe_erstellen')} />
                    <MessageAction icon={<MoreHorizontal className="size-3.5" />} label={t('app.misc.mehr')} />
                </div>
            )}
        </div>
    );
}

function MessageAction({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="size-7 p-0">
                    {icon}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

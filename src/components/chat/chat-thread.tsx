import { useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage, type ChatMessageData } from './chat-message';
import { Separator } from '@/components/ui/separator';

interface ChatThreadProps {
    messages: ChatMessageData[];
    className?: string;
}

export function ChatThread({ messages, className }: ChatThreadProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    // Group messages by date
    const groups = groupByDate(messages);

    return (
        <ScrollArea className={className}>
            <div className="py-4">
                {groups.map(([date, msgs]) => (
                    <div key={date}>
                        <div className="flex items-center gap-3 px-4 py-3">
                            <Separator className="flex-1" />
                            <span className="shrink-0 text-xs font-medium text-muted-foreground">{date}</span>
                            <Separator className="flex-1" />
                        </div>
                        {msgs.map((msg) => (
                            <ChatMessage key={msg.id} message={msg} />
                        ))}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </ScrollArea>
    );
}

function groupByDate(messages: ChatMessageData[]): [string, ChatMessageData[]][] {
    const groups = new Map<string, ChatMessageData[]>();
    for (const msg of messages) {
        const dateKey = msg.timestamp.split(',')[0] ?? msg.timestamp.split(' ')[0] ?? 'Heute';
        if (!groups.has(dateKey)) groups.set(dateKey, []);
        groups.get(dateKey)!.push(msg);
    }
    return Array.from(groups.entries());
}

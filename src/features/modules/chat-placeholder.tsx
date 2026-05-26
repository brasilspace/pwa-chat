import type { JSX } from 'react';
import { useParams } from 'react-router-dom';
import { ChatThread } from '@/components/chat/chat-thread';
import { ChatComposer } from '@/components/chat/chat-composer';
import { RightRail } from '@/components/app/right-rail';
import { SectionHeader } from '@/components/app/section-header';
import { ActivityItem, type ActivityItemData } from '@/components/project/activity-item';
import { Separator } from '@/components/ui/separator';
import { SpaceCanGate } from '@/components/app/gate';
import { useSpaceCan } from '@/core/permissions';
import type { ChatMessageData } from '@/components/chat/chat-message';
import { useT } from "@/lib/i18n/use-t";

const DEMO_MESSAGES: ChatMessageData[] = [
    {
        id: '1',
        role: 'user',
        author: 'Frau Müller',
        content: 'Guten Morgen! Wer hat die Hausaufgaben für Mathe schon fertig?',
        timestamp: 'Heute, 08:15',
    },
    {
        id: '2',
        role: 'user',
        author: 'Max',
        content: 'Ich habe sie gestern Abend gemacht. Die dritte Aufgabe war ziemlich knifflig.',
        timestamp: 'Heute, 08:18',
    },
    {
        id: '3',
        role: 'assistant',
        author: 'Prilog AI',
        content: 'Zusammenfassung: 3 von 12 Schülern haben die Mathe-Hausaufgaben bereits abgegeben. Deadline ist morgen, 10:00 Uhr. Soll ich eine Erinnerung an die offenen Abgaben senden?',
        timestamp: 'Heute, 08:19',
    },
    {
        id: '4',
        role: 'user',
        author: 'Frau Müller',
        content: 'Ja bitte, sende eine Erinnerung an alle, die noch nicht abgegeben haben.',
        timestamp: 'Heute, 08:20',
    },
    {
        id: '5',
        role: 'assistant',
        author: 'Prilog AI',
        content: 'Erledigt! 9 Schüler wurden benachrichtigt. Die Erinnerung enthält den Abgabetermin und einen Link zur Aufgabe.',
        timestamp: 'Heute, 08:20',
    },
    {
        id: '6',
        role: 'user',
        author: 'Lisa',
        content: 'Ich habe eine Frage zur Aufgabe 5. Kann mir jemand den Rechenweg erklären?',
        timestamp: 'Heute, 08:35',
    },
];

const DEMO_ACTIVITY: ActivityItemData[] = [
    { id: '1', actor: 'Max', action: 'hat abgegeben', target: 'Mathe Hausaufgabe', timestamp: 'vor 2 Std.' },
    { id: '2', actor: 'Prilog AI', action: 'hat Erinnerung gesendet an', target: '9 Schüler', timestamp: 'vor 1 Std.' },
    { id: '3', actor: 'Lisa', action: 'hat eine Frage gestellt zu', target: 'Aufgabe 5', timestamp: 'vor 45 Min.' },
];

export const ChatPlaceholder = (): JSX.Element => {
    const t = useT();
    const { spaceId } = useParams<{ spaceId: string }>();
    const canRead = useSpaceCan(spaceId, 'message:read');

    // While permissions are loading or not allowed to read
    if (canRead === null) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.chat_placeholder.lade')}
            </div>
        );
    }

    if (canRead === false) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.chat_placeholder.du_hast_keinen_zugriff_auf_den_chat_in_d')}
            </div>
        );
    }

    return (
        <div className="flex h-full">
            {/* Main thread area */}
            <div className="flex min-w-0 flex-1 flex-col">
                {/* Thread header */}
                <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-3 border-b px-4">
                    <span className="text-sm font-medium">{t('modules.chat_placeholder.allgemein')}</span>
                    <span className="text-xs text-muted-foreground">{t('modules.chat_placeholder.12_mitglieder')}</span>
                </div>

                {/* Messages */}
                <ChatThread messages={DEMO_MESSAGES} className="min-h-0 flex-1" />

                {/* Composer — only if user can send messages */}
                <SpaceCanGate spaceId={spaceId} permission="message:create">
                    <ChatComposer />
                </SpaceCanGate>
            </div>

            {/* Right Rail */}
            <RightRail>
                <SectionHeader title={t('modules.chat_placeholder.aktivitaet')} />
                <div className="mt-3 space-y-0">
                    {DEMO_ACTIVITY.map((item) => (
                        <ActivityItem key={item.id} item={item} />
                    ))}
                </div>
                <Separator className="my-4" />
                <SectionHeader title={t('modules.chat_placeholder.dateien')} />
                <p className="mt-2 text-sm text-muted-foreground">{t('modules.chat_placeholder.keine_dateien_in_diesem_chat')}</p>
                <Separator className="my-4" />
                <SectionHeader title={t('modules.chat_placeholder.aufgaben')} />
                <p className="mt-2 text-sm text-muted-foreground">{t('modules.chat_placeholder.3_offene_aufgaben')}</p>
            </RightRail>
        </div>
    );
};

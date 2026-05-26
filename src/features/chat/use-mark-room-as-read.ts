import { useCallback, useRef, type RefObject } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createMatrixGateway } from '@/gateways/matrix/matrix-gateway';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { logger } from '@/core/logging/logger';
import type { ChatMessage } from './chat-types';

const matrixGateway = createMatrixGateway();
const platformGateway = createPlatformGateway();

/**
 * Gemeinsame Mark-As-Read-Logik fuer Space-Chats und DMs.
 *
 * Aufgabe: die zuletzt gesehene Nachricht an Synapse (`m.fully_read` +
 * `m.read` via /read_markers) und optional an die Prilog-Platform-API
 * (fuer Infotafel-Lese-Statistik) melden, sobald der User am Ende
 * angekommen ist. Throttled auf 5s pro neuem Event, damit kein
 * Receipt-Sturm beim Scrollen entsteht.
 *
 * Die Hook gibt `markReadIfBottom(force?)` zurueck. Der Aufrufer ruft
 * sie in folgenden Situationen auf:
 *   1. im `onScroll`-Handler nachdem er `isAtBottomRef` aktualisiert hat
 *   2. im scroll-to-bottom-Effect direkt NACH dem RAF-Scroll, mit
 *      `force=true`, weil zu diesem Zeitpunkt noch kein Scroll-Event
 *      gefeuert hat und wir sicher wissen, dass wir am Ende sind
 *
 * `force=true` umgeht die DOM-Positions-Pruefung. Das ist der Fix fuer
 * den Timing-Race-Bug beim ersten Oeffnen eines Chats, bei dem die
 * Pixelmessung noch 0 zurueckgab, obwohl der Scroll gleich danach ans
 * Ende schoss.
 */
export function useMarkRoomAsRead(opts: {
    roomId: string | null | undefined;
    messages: ChatMessage[];
    scrollRef: RefObject<HTMLDivElement | null>;
    /** Optional: Prilog-Platform-seitiges mark-read fuer Infotafel-Read-Stats. */
    spaceId?: string;
}) {
    const { roomId, messages, scrollRef, spaceId } = opts;
    const lastMarkedEventId = useRef<string | null>(null);
    const lastMarkedAt = useRef(0);

    return useCallback((force = false) => {
        if (!roomId) return;

        if (!force) {
            const el = scrollRef.current;
            if (!el) return;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
            if (!atBottom) return;
        }

        const last = messages[messages.length - 1];
        if (!last) return;
        if (lastMarkedEventId.current === last.eventId) return;
        const now = Date.now();
        if (now - lastMarkedAt.current < 5000 && lastMarkedEventId.current !== null) return;

        const session = sessionStore.getSnapshot();
        const matrixToken = session.matrix?.accessToken;
        const platformJwt = session.platform?.token;
        if (!matrixToken) return;

        lastMarkedEventId.current = last.eventId;
        lastMarkedAt.current = now;

        // Synapse: m.fully_read + m.read in einem Call. Das aktualisiert den
        // unread_notifications.notification_count auf 0 beim naechsten Sync
        // und synct ueber Geraete hinweg via m.fully_read.
        matrixGateway.sendReadMarkers(matrixToken, roomId, last.eventId).catch((err) => {
            logger.warn('sendReadMarkers failed', { error: err });
            // Auf Fehler: Lock aufheben, damit der naechste Trigger es erneut versucht.
            lastMarkedEventId.current = null;
        });

        // Prilog-intern: Infotafel-Lese-Statistik (nur in Space-Chats relevant,
        // dort wird spaceId mitgegeben).
        if (spaceId && platformJwt) {
            platformGateway.markSpaceRead(platformJwt, spaceId, last.eventId, last.timestamp).catch(() => {
                /* best-effort, nicht-kritisch */
            });
        }
    }, [roomId, messages, scrollRef, spaceId]);
}

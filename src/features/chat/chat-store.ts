import type { MatrixSyncResponse, MatrixTimelineEvent } from '@/gateways/matrix/matrix-types';
import type { ChatMessage, ChatStoreSnapshot, DbMessage, DbRoom, RoomState } from './chat-types';
import { loadSyncState, loadAllRooms, loadMessages, saveMessages, saveRooms, saveSyncState, isChatDbOpen } from './chat-db';

const listeners = new Set<() => void>();

const EMPTY_ROOM: RoomState = {
    messages: [],
    prevBatch: null,
    hasMore: false,
    typingUsers: [],
    members: new Map(),
    reactions: new Map(),
    loadingOlder: false,
    unreadCount: 0,
    highlightCount: 0,
};

let snapshot: ChatStoreSnapshot = {
    rooms: new Map(),
    directRooms: new Map(),
    syncState: 'idle',
};

function emit() {
    for (const fn of listeners) fn();
}

function getOrCreateRoom(roomId: string): RoomState {
    return snapshot.rooms.get(roomId) ?? { ...EMPTY_ROOM, messages: [], members: new Map(), reactions: new Map(), typingUsers: [] };
}

const FILE_MSGTYPES = new Set(['m.image', 'm.file', 'm.video', 'm.audio']);

function parseMessage(event: MatrixTimelineEvent): ChatMessage | null {
    if (event.type !== 'm.room.message') return null;
    const content = event.content as Record<string, unknown>;
    const msgtype = content.msgtype as string | undefined;
    const body = content.body as string | undefined;
    if (!body) return null;

    const rel = content['m.relates_to'] as { rel_type?: string; event_id?: string; 'm.in_reply_to'?: { event_id: string } } | undefined;
    const isThread = rel?.rel_type === 'm.thread';

    // Flurfunk-Transkript erkennen: das Backend setzt org.prilog.transcript_for
    // und org.prilog.transcript_text auf der Reply-Message. Wir markieren das
    // Message-Object und der Timeline-Filter blendet es aus — der Text wandert
    // stattdessen ueber applyTranscriptUpdates() in die Audio-Attachment.
    const transcriptFor = content['org.prilog.transcript_for'] as string | undefined;
    const transcriptText = content['org.prilog.transcript_text'] as string | undefined;
    const isTranscriptReply = Boolean(transcriptFor && transcriptText);

    // Parse file/media attachments
    let attachment: ChatMessage['attachment'];
    if (msgtype && FILE_MSGTYPES.has(msgtype)) {
        const info = content.info as {
            mimetype?: string; size?: number; w?: number; h?: number;
            thumbnail_url?: string;
            thumbnail_info?: { w?: number; h?: number };
        } | undefined;
        attachment = {
            msgtype: msgtype as ChatMessage['attachment'] extends undefined ? never : NonNullable<ChatMessage['attachment']>['msgtype'],
            filename: (content.filename as string) ?? body,
            mimetype: info?.mimetype ?? 'application/octet-stream',
            size: info?.size ?? 0,
            mxcUrl: (content.url as string) ?? '',
            width: info?.w,
            height: info?.h,
            thumbnailMxcUrl: info?.thumbnail_url,
            thumbnailWidth: info?.thumbnail_info?.w,
            thumbnailHeight: info?.thumbnail_info?.h,
        };
    }

    const format = content.format as string | undefined;
    const formattedBodyRaw = content.formatted_body as string | undefined;
    const formattedBody = format === 'org.matrix.custom.html' && formattedBodyRaw
        ? formattedBodyRaw
        : undefined;

    return {
        eventId: event.event_id,
        sender: event.sender,
        body,
        formattedBody,
        timestamp: event.origin_server_ts,
        txnId: event.unsigned?.transaction_id,
        threadId: isThread ? rel?.event_id : undefined,
        replyTo: rel?.['m.in_reply_to']?.event_id,
        attachment,
        isTranscriptReply,
        transcriptFor: isTranscriptReply ? transcriptFor : undefined,
        transcriptText: isTranscriptReply ? transcriptText : undefined,
    };
}

/**
 * Verteilt Transkript-Texte aus den TranscriptReply-Messages in die
 * jeweiligen Audio-Attachments. Wird in applySync nach jedem Batch
 * aufgerufen — auch fuer Out-of-Order Delivery (Transcript kommt vor
 * der Audio in einem Sync-Batch).
 *
 * WICHTIG: erstellt NEUE Message-Objekte fuer die geupdateten Audio-
 * Eintraege (immutable update). React-Memoization in der ChatBubble
 * vergleicht per Reference — wenn wir das alte Objekt mutieren, sieht
 * React keine Aenderung und re-rendered erst beim naechsten Reload.
 *
 * Mutiert die uebergebene messages-Liste in-place (Array-Eintraege
 * ersetzt) und gibt die Anzahl der angewendeten Updates zurueck.
 */
function applyTranscriptUpdates(messages: ChatMessage[]): number {
    let updates = 0;
    for (const m of messages) {
        if (!m.isTranscriptReply || !m.transcriptFor || !m.transcriptText) continue;
        const targetIdx = messages.findIndex((x) => x.eventId === m.transcriptFor && x.attachment);
        if (targetIdx < 0) continue;
        const target = messages[targetIdx];
        if (!target.attachment || target.attachment.transcript === m.transcriptText) continue;
        // NEUES Objekt — nicht mutieren, sonst sieht React keine Aenderung
        messages[targetIdx] = {
            ...target,
            attachment: { ...target.attachment, transcript: m.transcriptText },
        };
        updates++;
    }
    return updates;
}

// --- Write-behind batching ---

let pendingDbMessages: DbMessage[] = [];
let pendingDbRooms: Map<string, DbRoom> = new Map();
let dbWriteScheduled = false;

function queueDbMessages(roomId: string, messages: ChatMessage[]) {
    for (const m of messages) {
        if (m.pending || m.failed) continue; // don't persist transient messages
        pendingDbMessages.push({
            eventId: m.eventId,
            roomId,
            sender: m.sender,
            body: m.body,
            timestamp: m.timestamp,
            txnId: m.txnId,
            threadId: m.threadId,
            replyTo: m.replyTo,
        });
    }
    scheduleDbFlush();
}

function queueDbRoom(roomId: string, room: RoomState) {
    pendingDbRooms.set(roomId, {
        roomId,
        prevBatch: room.prevBatch,
        hasMore: room.hasMore,
        members: Array.from(room.members.entries()),
    });
    scheduleDbFlush();
}

function scheduleDbFlush() {
    if (dbWriteScheduled) return;
    dbWriteScheduled = true;
    queueMicrotask(flushToDb);
}

async function flushToDb() {
    const msgs = pendingDbMessages;
    const rooms = Array.from(pendingDbRooms.values());
    pendingDbMessages = [];
    pendingDbRooms = new Map();
    dbWriteScheduled = false;

    await Promise.all([
        saveMessages(msgs),
        saveRooms(rooms),
    ]);
}

// Track which rooms have been loaded from DB
const roomsLoadedFromDb = new Set<string>();

export const chatStore = {
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },

    getSnapshot(): ChatStoreSnapshot {
        return snapshot;
    },

    getRoomState(roomId: string): RoomState {
        return snapshot.rooms.get(roomId) ?? EMPTY_ROOM;
    },

    getReactions(roomId: string, eventId: string): Map<string, Set<string>> {
        return snapshot.rooms.get(roomId)?.reactions.get(eventId) ?? new Map();
    },

    addReaction(roomId: string, eventId: string, emoji: string, userId: string) {
        const room = getOrCreateRoom(roomId);
        const nextReactions = new Map(room.reactions);
        const msgReactions = new Map(nextReactions.get(eventId) ?? new Map<string, Set<string>>());
        const users = new Set(msgReactions.get(emoji) ?? new Set<string>());
        users.add(userId);
        msgReactions.set(emoji, users);
        nextReactions.set(eventId, msgReactions);

        const nextRooms = new Map(snapshot.rooms);
        nextRooms.set(roomId, { ...room, reactions: nextReactions });
        snapshot = { ...snapshot, rooms: nextRooms };
        emit();
    },

    getUnreadCount(roomId: string): number {
        return snapshot.rooms.get(roomId)?.unreadCount ?? 0;
    },

    setSyncState(state: ChatStoreSnapshot['syncState']) {
        snapshot = { ...snapshot, syncState: state };
        emit();
    },

    getDirectRoomId(userId: string): string | null {
        return snapshot.directRooms.get(userId) ?? null;
    },

    setDirectRoom(userId: string, roomId: string) {
        const next = new Map(snapshot.directRooms);
        next.set(userId, roomId);
        snapshot = { ...snapshot, directRooms: next };
        emit();
        saveSyncState(null, snapshot.directRooms);
    },

    // --- IndexedDB hydration ---

    async hydrateFromDb(): Promise<string | null> {
        const [syncState, dbRooms] = await Promise.all([
            loadSyncState(),
            loadAllRooms(),
        ]);

        const nextRooms = new Map(snapshot.rooms);
        for (const dbRoom of dbRooms) {
            const existing = nextRooms.get(dbRoom.roomId);
            if (!existing || existing.messages.length === 0) {
                nextRooms.set(dbRoom.roomId, {
                    messages: [], // loaded on demand
                    prevBatch: dbRoom.prevBatch,
                    hasMore: dbRoom.hasMore,
                    typingUsers: [],
                    members: new Map(dbRoom.members.map(([k, v]) =>
                        typeof v === 'string' ? [k, { displayName: v, avatarMxc: null }] : [k, v],
                    )),
                    reactions: new Map(),
                    loadingOlder: false,
                    unreadCount: 0,
                    highlightCount: 0,
                });
            }
        }

        const directRooms = syncState?.directRooms ?? snapshot.directRooms;

        snapshot = { ...snapshot, rooms: nextRooms, directRooms };
        emit();

        return syncState?.sinceToken ?? null;
    },

    async loadRoomFromDb(roomId: string): Promise<void> {
        if (roomsLoadedFromDb.has(roomId)) return;

        // Don't mark as loaded if DB isn't open yet — the caller will retry
        if (!isChatDbOpen()) return;
        roomsLoadedFromDb.add(roomId);

        const dbMessages = await loadMessages(roomId, 50);
        if (dbMessages.length === 0) return;

        // Merge with any messages the sync already delivered while we were reading.
        // Sync may have added new messages that aren't in IndexedDB yet.
        const current = getOrCreateRoom(roomId);
        const existingIds = new Set(current.messages.map((m) => m.eventId));
        const olderFromDb = dbMessages.filter((m) => !existingIds.has(m.eventId));

        if (olderFromDb.length === 0) return;

        const nextRooms = new Map(snapshot.rooms);
        nextRooms.set(roomId, { ...current, messages: [...olderFromDb, ...current.messages] });
        snapshot = { ...snapshot, rooms: nextRooms };
        emit();
    },

    // --- Sync processing ---

    applySync(response: MatrixSyncResponse) {
        // Parse m.direct account data (maps userId → [roomId, ...])
        let directRooms = snapshot.directRooms;
        for (const event of response.account_data?.events ?? []) {
            if (event.type === 'm.direct') {
                const next = new Map<string, string>();
                for (const [userId, roomIds] of Object.entries(event.content)) {
                    const arr = roomIds as string[];
                    if (arr.length > 0) {
                        next.set(userId, arr[arr.length - 1]);
                    }
                }
                directRooms = next;
            }
        }

        const joinedRooms = response.rooms?.join;
        if (!joinedRooms) {
            if (snapshot.syncState !== 'syncing' || directRooms !== snapshot.directRooms) {
                snapshot = { ...snapshot, syncState: 'syncing', directRooms };
                emit();
            }
            return;
        }

        let changed = directRooms !== snapshot.directRooms;
        const nextRooms = new Map(snapshot.rooms);

        for (const [roomId, roomData] of Object.entries(joinedRooms)) {
            const current = getOrCreateRoom(roomId);
            const nextMembers = new Map(current.members);
            let membersChanged = false;

            for (const event of roomData.state?.events ?? []) {
                if (event.type === 'm.room.member' && event.content) {
                    const c = event.content as { displayname?: string; avatar_url?: string };
                    const existing = nextMembers.get(event.sender);
                    if (c.displayname && (!existing || existing.displayName !== c.displayname || existing.avatarMxc !== (c.avatar_url ?? null))) {
                        nextMembers.set(event.sender, { displayName: c.displayname, avatarMxc: c.avatar_url ?? null });
                        membersChanged = true;
                    }
                }
            }

            const newMessages: ChatMessage[] = [];
            for (const event of roomData.timeline?.events ?? []) {
                if (event.type === 'm.room.member' && event.content) {
                    const c = event.content as { displayname?: string; avatar_url?: string };
                    const existing = nextMembers.get(event.sender);
                    if (c.displayname && (!existing || existing.displayName !== c.displayname || existing.avatarMxc !== (c.avatar_url ?? null))) {
                        nextMembers.set(event.sender, { displayName: c.displayname, avatarMxc: c.avatar_url ?? null });
                        membersChanged = true;
                    }
                }

                const msg = parseMessage(event);
                if (!msg) continue;

                const existingIdx = current.messages.findIndex(
                    (m) => m.pending && m.txnId && m.txnId === msg.txnId,
                );
                if (existingIdx >= 0) {
                    current.messages[existingIdx] = msg;
                    changed = true;
                } else if (!current.messages.some((m) => m.eventId === msg.eventId)) {
                    newMessages.push(msg);
                }
            }

            // Process reactions (m.reaction events)
            const nextReactions = new Map(current.reactions);
            let reactionsChanged = false;
            for (const event of roomData.timeline?.events ?? []) {
                if (event.type === 'm.reaction' && event.content) {
                    const rel = (event.content as Record<string, unknown>)['m.relates_to'] as {
                        rel_type?: string; event_id?: string; key?: string;
                    } | undefined;
                    if (rel?.rel_type === 'm.annotation' && rel.event_id && rel.key) {
                        const msgReactions = nextReactions.get(rel.event_id) ?? new Map<string, Set<string>>();
                        const users = msgReactions.get(rel.key) ?? new Set<string>();
                        if (!users.has(event.sender)) {
                            users.add(event.sender);
                            msgReactions.set(rel.key, users);
                            nextReactions.set(rel.event_id, msgReactions);
                            reactionsChanged = true;
                        }
                    }
                }
            }

            let typingUsers = current.typingUsers;
            for (const event of roomData.ephemeral?.events ?? []) {
                if (event.type === 'm.typing') {
                    const newTyping = (event.content as { user_ids?: string[] }).user_ids ?? [];
                    if (JSON.stringify(newTyping) !== JSON.stringify(typingUsers)) {
                        typingUsers = newTyping;
                        changed = true;
                    }
                }
            }

            // Unread count from server
            const unreadCount = roomData.unread_notifications?.notification_count ?? current.unreadCount;
            const highlightCount = roomData.unread_notifications?.highlight_count ?? current.highlightCount;

            if (newMessages.length > 0 || membersChanged || reactionsChanged || changed || unreadCount !== current.unreadCount || highlightCount !== current.highlightCount || !snapshot.rooms.has(roomId)) {
                const prevBatch = roomData.timeline?.prev_batch ?? current.prevBatch;
                // Flurfunk-Transkripte auf ihre Audio-Parents anwenden.
                // Wir machen das auf der zusammengefuegten Liste damit auch
                // Out-of-Order Delivery (Transcript ankommt, Audio schon im
                // Store) sauber funktioniert.
                const mergedMessages = newMessages.length > 0
                    ? [...current.messages, ...newMessages]
                    : current.messages.slice();
                applyTranscriptUpdates(mergedMessages);

                const updatedRoom: RoomState = {
                    ...current,
                    messages: mergedMessages,
                    members: membersChanged ? nextMembers : current.members,
                    reactions: reactionsChanged ? nextReactions : current.reactions,
                    typingUsers,
                    prevBatch,
                    hasMore: prevBatch !== null,
                    unreadCount,
                    highlightCount,
                };
                nextRooms.set(roomId, updatedRoom);
                changed = true;

                // Queue write-behind for new messages and room metadata
                if (newMessages.length > 0) queueDbMessages(roomId, newMessages);
                queueDbRoom(roomId, updatedRoom);
            }
        }

        if (changed || snapshot.syncState !== 'syncing') {
            snapshot = { ...snapshot, rooms: nextRooms, directRooms, syncState: 'syncing' };
            emit();
        }
    },

    prependMessages(roomId: string, messages: ChatMessage[], prevBatch: string | null) {
        const current = getOrCreateRoom(roomId);
        const existing = new Set(current.messages.map((m) => m.eventId));
        const unique = messages.filter((m) => !existing.has(m.eventId));

        const nextRooms = new Map(snapshot.rooms);
        const updatedRoom: RoomState = {
            ...current,
            messages: [...unique, ...current.messages],
            prevBatch,
            hasMore: prevBatch !== null,
            loadingOlder: false,
        };
        nextRooms.set(roomId, updatedRoom);

        snapshot = { ...snapshot, rooms: nextRooms };
        emit();

        // Persist older messages to DB
        queueDbMessages(roomId, unique);
        queueDbRoom(roomId, updatedRoom);
    },

    setLoadingOlder(roomId: string, loading: boolean) {
        const current = getOrCreateRoom(roomId);
        const nextRooms = new Map(snapshot.rooms);
        nextRooms.set(roomId, { ...current, loadingOlder: loading });
        snapshot = { ...snapshot, rooms: nextRooms };
        emit();
    },

    addOptimisticMessage(roomId: string, message: ChatMessage) {
        const current = getOrCreateRoom(roomId);
        const nextRooms = new Map(snapshot.rooms);
        nextRooms.set(roomId, {
            ...current,
            messages: [...current.messages, message],
        });
        snapshot = { ...snapshot, rooms: nextRooms };
        emit();
    },

    confirmMessage(roomId: string, txnId: string, eventId: string) {
        const current = getOrCreateRoom(roomId);
        const confirmed = current.messages.map((m) =>
            m.txnId === txnId ? { ...m, eventId, pending: false } : m,
        );
        const nextRooms = new Map(snapshot.rooms);
        nextRooms.set(roomId, { ...current, messages: confirmed });
        snapshot = { ...snapshot, rooms: nextRooms };
        emit();

        // Now persist the confirmed message
        const msg = confirmed.find((m) => m.eventId === eventId);
        if (msg) queueDbMessages(roomId, [msg]);
    },

    /**
     * Update das Attachment einer optimistischen Nachricht (per txnId).
     * Wird von sendFile() nach dem Matrix-Upload aufgerufen, um die bis
     * dahin leere mxcUrl durch die echte content_uri zu ersetzen. Ohne
     * diesen Schritt bleibt das Bild-Skeleton ewig stehen, weil der
     * useMatrixMedia-Hook mit leerer URI nichts laden kann.
     */
    updateOptimisticAttachment(roomId: string, txnId: string, attachment: ChatMessage['attachment']) {
        const current = getOrCreateRoom(roomId);
        const updated = current.messages.map((m) =>
            m.txnId === txnId ? { ...m, attachment } : m,
        );
        const nextRooms = new Map(snapshot.rooms);
        nextRooms.set(roomId, { ...current, messages: updated });
        snapshot = { ...snapshot, rooms: nextRooms };
        emit();
    },

    failMessage(roomId: string, txnId: string) {
        const current = getOrCreateRoom(roomId);
        const nextRooms = new Map(snapshot.rooms);
        nextRooms.set(roomId, {
            ...current,
            messages: current.messages.map((m) =>
                m.txnId === txnId ? { ...m, pending: false, failed: true } : m,
            ),
        });
        snapshot = { ...snapshot, rooms: nextRooms };
        emit();
    },

    // --- Thread helpers ---

    /** Get all messages belonging to a thread (excluding the root message itself) */
    getThreadMessages(roomId: string, threadRootId: string): ChatMessage[] {
        const room = snapshot.rooms.get(roomId);
        if (!room) return [];
        return room.messages.filter(m => m.threadId === threadRootId);
    },

    /** Count how many replies a thread root has */
    getThreadCount(roomId: string, threadRootId: string): number {
        const room = snapshot.rooms.get(roomId);
        if (!room) return 0;
        return room.messages.reduce((n, m) => m.threadId === threadRootId ? n + 1 : n, 0);
    },

    /** Get the latest reply in a thread (for preview badge) */
    getThreadLatestReply(roomId: string, threadRootId: string): ChatMessage | null {
        const room = snapshot.rooms.get(roomId);
        if (!room) return null;
        const replies = room.messages.filter(m => m.threadId === threadRootId);
        return replies.length > 0 ? replies[replies.length - 1] : null;
    },

    /** Get main timeline messages (root messages + non-thread messages) */
    getMainTimelineMessages(roomId: string): ChatMessage[] {
        const room = snapshot.rooms.get(roomId);
        if (!room) return [];
        return room.messages.filter(m => !m.threadId);
    },
};

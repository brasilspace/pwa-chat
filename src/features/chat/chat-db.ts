import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { ChatMessage, DbMessage, DbRoom, DbSyncState } from './chat-types';
import { logger } from '@/core/logging/logger';

interface ChatDBSchema extends DBSchema {
    messages: {
        key: string;
        value: DbMessage;
        indexes: {
            roomId: string;
            roomId_timestamp: [string, number];
            roomId_threadId: [string, string];
        };
    };
    rooms: {
        key: string;
        value: DbRoom;
    };
    syncState: {
        key: string;
        value: DbSyncState;
    };
}

let db: IDBPDatabase<ChatDBSchema> | null = null;

export function isChatDbOpen(): boolean {
    return db !== null;
}

export async function openChatDb(userId: string): Promise<void> {
    try {
        const safeName = `prilog-chat-${userId.replace(/[^a-zA-Z0-9@:._-]/g, '_')}`;
        db = await openDB<ChatDBSchema>(safeName, 3, {
            upgrade(database, oldVersion, _newVersion, transaction) {
                if (oldVersion < 1) {
                    const msgStore = database.createObjectStore('messages', { keyPath: 'eventId' });
                    msgStore.createIndex('roomId', 'roomId');
                    msgStore.createIndex('roomId_timestamp', ['roomId', 'timestamp']);
                    database.createObjectStore('rooms', { keyPath: 'roomId' });
                    database.createObjectStore('syncState', { keyPath: 'key' });
                }
                if (oldVersion < 2) {
                    // V2: members now include avatarMxc — clear rooms + syncState
                    // to force a fresh sync that picks up avatar_url from member events
                    transaction.objectStore('rooms').clear();
                    transaction.objectStore('syncState').clear();
                }
                if (oldVersion < 3) {
                    // V3: thread support — add threadId index for querying thread messages
                    const msgStore = transaction.objectStore('messages');
                    msgStore.createIndex('roomId_threadId', ['roomId', 'threadId']);
                    // Clear sync to pick up relates_to from re-synced events
                    transaction.objectStore('rooms').clear();
                    transaction.objectStore('syncState').clear();
                }
            },
        });
    } catch (err) {
        logger.warn('IndexedDB not available, running in-memory only', { error: err });
        db = null;
    }
}

export function closeChatDb(): void {
    db?.close();
    db = null;
}

// --- Sync state ---

export async function loadSyncState(): Promise<{ sinceToken: string | null; directRooms: Map<string, string> } | null> {
    if (!db) return null;
    try {
        const record = await db.get('syncState', 'sync');
        if (!record) return null;
        return {
            sinceToken: record.sinceToken,
            directRooms: new Map(record.directRooms),
        };
    } catch (err) {
        logger.warn('Failed to load sync state from DB', { error: err });
        return null;
    }
}

export async function saveSyncState(sinceToken: string | null, directRooms: Map<string, string>): Promise<void> {
    if (!db) return;
    try {
        await db.put('syncState', {
            key: 'sync',
            sinceToken,
            directRooms: Array.from(directRooms.entries()),
        });
    } catch (err) {
        logger.warn('Failed to save sync state to DB', { error: err });
    }
}

export async function clearSyncState(): Promise<void> {
    if (!db) return;
    try {
        await db.delete('syncState', 'sync');
    } catch (err) {
        logger.warn('Failed to clear sync state from DB', { error: err });
    }
}

// --- Room metadata ---

export async function loadAllRooms(): Promise<DbRoom[]> {
    if (!db) return [];
    try {
        return await db.getAll('rooms');
    } catch (err) {
        logger.warn('Failed to load rooms from DB', { error: err });
        return [];
    }
}

export async function saveRooms(rooms: DbRoom[]): Promise<void> {
    if (!db || rooms.length === 0) return;
    try {
        const tx = db.transaction('rooms', 'readwrite');
        for (const room of rooms) {
            tx.store.put(room);
        }
        await tx.done;
    } catch (err) {
        logger.warn('Failed to save rooms to DB', { error: err });
    }
}

// --- Messages ---

export async function loadMessages(roomId: string, limit = 50): Promise<ChatMessage[]> {
    if (!db) return [];
    try {
        const messages: ChatMessage[] = [];
        const index = db.transaction('messages', 'readonly').store.index('roomId_timestamp');

        // Open cursor at the end of the range for this roomId, iterate backwards
        const range = IDBKeyRange.bound([roomId, 0], [roomId, Number.MAX_SAFE_INTEGER]);
        let cursor = await index.openCursor(range, 'prev');

        while (cursor && messages.length < limit) {
            const rec = cursor.value;
            messages.push({
                eventId: rec.eventId,
                sender: rec.sender,
                body: rec.body,
                timestamp: rec.timestamp,
                txnId: rec.txnId,
                threadId: rec.threadId,
                replyTo: rec.replyTo,
            });
            cursor = await cursor.continue();
        }

        return messages.reverse(); // oldest first
    } catch (err) {
        logger.warn('Failed to load messages from DB', { error: err });
        return [];
    }
}

export async function saveMessages(messages: DbMessage[]): Promise<void> {
    if (!db || messages.length === 0) return;
    try {
        const tx = db.transaction('messages', 'readwrite');
        for (const msg of messages) {
            tx.store.put(msg);
        }
        await tx.done;
    } catch (err) {
        logger.warn('Failed to save messages to DB', { error: err });
    }
}

// --- Cleanup ---

export async function deleteChatDb(userId: string): Promise<void> {
    closeChatDb();
    try {
        const safeName = `prilog-chat-${userId.replace(/[^a-zA-Z0-9@:._-]/g, '_')}`;
        const { deleteDB } = await import('idb');
        await deleteDB(safeName);
    } catch (err) {
        logger.warn('Failed to delete chat DB', { error: err });
    }
}

import { sessionStore } from '@/core/session/session-store';
import { sessionMachine } from '@/core/session/session-machine';
import { env } from '@/core/config/env';
import { chatStore } from './chat-store';
import { saveSyncState, clearSyncState } from './chat-db';
import { createMatrixGateway } from '@/gateways/matrix/matrix-gateway';
import { logger } from '@/core/logging/logger';

const matrixGateway = createMatrixGateway();

const SYNC_FILTER = JSON.stringify({
    room: {
        timeline: { limit: 50, types: ['m.room.message', 'm.room.member', 'm.reaction'] },
        state: { types: ['m.room.member'], lazy_load_members: true },
        ephemeral: { types: ['m.typing'] },
    },
    presence: { types: [] },
});

let running = false;
let abortController: AbortController | null = null;
let sinceToken: string | null = null;
const pendingJoins = new Set<string>();

// Nach so vielen aufeinanderfolgenden 401 gilt das Access-Token als
// endgültig ungültig → Session verwerfen + Re-Login statt Endlos-Retry.
// >1, damit ein einzelner transienter 401 nicht unnötig ausloggt.
const MAX_AUTH_401 = 3;
let auth401Count = 0;

async function joinWithRetry(accessToken: string, roomId: string, attempt = 0) {
    try {
        await matrixGateway.joinRoom(accessToken, roomId);
        pendingJoins.delete(roomId);
        logger.info('Joined room', { roomId });
    } catch {
        if (attempt < 3) {
            const delay = 2000 * (attempt + 1);
            logger.warn('Join failed, retrying', { roomId, attempt, delay });
            setTimeout(() => joinWithRetry(accessToken, roomId, attempt + 1), delay);
        } else {
            pendingJoins.delete(roomId);
            logger.error('Join failed permanently', { roomId });
        }
    }
}

export async function startSync() {
    if (running) return;
    running = true;

    // Don't await hydrateFromDb — IndexedDB may hang. Start sync immediately
    // with a full initial sync (sinceToken=null). The DB is nice-to-have cache
    // only; all messages come fresh from Synapse on every page load.
    sinceToken = null;
    chatStore.setSyncState('initial');
    syncLoop();
}

export function stopSync() {
    running = false;
    abortController?.abort();
    abortController = null;
}

async function syncLoop() {
    let backoffMs = 1000;

    while (running) {
        const session = sessionStore.getSnapshot();
        const accessToken = session.matrix?.accessToken;

        if (!accessToken) {
            logger.warn('Sync: no access token, stopping');
            stopSync();
            return;
        }

        try {
            abortController = new AbortController();
            const isInitial = sinceToken === null;
            const timeout = isInitial ? 0 : 30000;

            const params = new URLSearchParams();
            if (sinceToken) params.set('since', sinceToken);
            params.set('filter', SYNC_FILTER);
            if (timeout > 0) params.set('timeout', String(timeout));

            const url = `${env.matrixBaseUrl}/client/v3/sync?${params}`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: abortController.signal,
            });

            if (!running) return;

            // Stale sinceToken — server purged the position
            if (res.status === 400 && sinceToken) {
                logger.warn('Sync token stale, resetting to initial sync');
                sinceToken = null;
                await clearSyncState();
                continue;
            }

            // Ungültiges/fremdes Access-Token (Secret-Rotation, JWT-only-
            // Migration, Tenant-Wechsel, veraltete Cross-Tenant-Session).
            // Synapse → 401 (M_UNKNOWN_TOKEN). Ohne Sonderfall würde der
            // Loop ewig weiter 401en gegen u.U. den falschen Homeserver
            // (leander-Macaroon-Spam 2026-05-19). Erst nach mehreren
            // 401 in Folge ausloggen — ein transienter 401 killt die
            // Session nicht.
            if (res.status === 401) {
                auth401Count += 1;
                logger.warn('Sync 401 — Access-Token ungültig', { consecutive: auth401Count });
                if (auth401Count >= MAX_AUTH_401) {
                    logger.error('Sync: Access-Token dauerhaft ungültig — Session verwerfen, Re-Login erzwingen');
                    stopSync();
                    await clearSyncState();
                    sessionMachine.logout();
                    return;
                }
                throw new Error('Sync HTTP 401');
            }

            if (!res.ok) {
                throw new Error(`Sync HTTP ${res.status}`);
            }

            const response = await res.json();

            chatStore.applySync(response);
            sinceToken = response.next_batch;
            auth401Count = 0;

            // Auto-accept room invites (with retry for rate-limited joins)
            const invites = response.rooms?.invite;
            if (invites) {
                for (const roomId of Object.keys(invites)) {
                    if (pendingJoins.has(roomId)) continue;
                    pendingJoins.add(roomId);
                    joinWithRetry(accessToken, roomId);
                }
            }

            // Persist sinceToken + directRooms to IndexedDB
            saveSyncState(sinceToken, chatStore.getSnapshot().directRooms);

            backoffMs = 1000;
        } catch (error) {
            if (!running) return;
            if (error instanceof DOMException && error.name === 'AbortError') return;

            logger.error('Sync failed, retrying...', { error });

            await new Promise((r) => setTimeout(r, backoffMs));
            backoffMs = Math.min(backoffMs * 2, 30000);
        }
    }
}

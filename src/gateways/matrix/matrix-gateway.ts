import { env } from '../../core/config/env';
import { requestJson } from '../../core/http/http-client';
import type {
    MatrixLoginRequest,
    MatrixLoginResponse,
    MatrixMessagesResponse,
    MatrixSendResponse,
    MatrixSyncResponse,
    MatrixWhoAmIResponse,
} from './matrix-types';

export interface MatrixProfile {
    displayname?: string;
    avatar_url?: string;
}

export interface MatrixGateway {
    login(input: MatrixLoginRequest): Promise<MatrixLoginResponse>;
    whoAmI(accessToken: string): Promise<MatrixWhoAmIResponse>;
    sync(accessToken: string, since?: string, filter?: string, timeout?: number): Promise<MatrixSyncResponse>;
    getMessages(accessToken: string, roomId: string, from: string, limit?: number): Promise<MatrixMessagesResponse>;
    sendMessage(accessToken: string, roomId: string, txnId: string, body: string, formattedBody?: string, threadId?: string, replyTo?: string): Promise<MatrixSendResponse>;
    createDirectChat(accessToken: string, userId: string): Promise<{ room_id: string }>;
    /**
     * Autoritativer DM-Open: liefert bestehenden 1:1-DM-Raum (aus
     * server-seitigem m.direct) ODER legt einen neuen an + trägt ihn
     * in m.direct ein. Verhindert Duplikate, wenn der lokale
     * directRooms-Cache noch nicht hydrated ist (Race nach Login).
     */
    getOrCreateDirectChat(accessToken: string, myUserId: string, targetUserId: string): Promise<{ room_id: string; created: boolean }>;
    joinRoom(accessToken: string, roomId: string): Promise<{ room_id: string }>;
    leaveRoom(accessToken: string, roomId: string): Promise<void>;
    sendTyping(accessToken: string, roomId: string, userId: string, typing: boolean): Promise<void>;
    /**
     * Moderne Matrix-Read-Markers-API. Setzt in einem Call:
     *   - m.fully_read — persistenter "bis hierhin gelesen"-Marker, der
     *     ueber Geraete synchronisiert (User liest auf Mobile → Web-Client
     *     weiss Bescheid beim naechsten Sync).
     *   - m.read — oeffentliche Leseempfangsbestaetigung (andere sehen es).
     * Ersetzt den Legacy-Endpoint /receipt/m.read/{eventId}.
     */
    sendReadMarkers(accessToken: string, roomId: string, eventId: string): Promise<void>;
    /**
     * Matrix-Media-Config. Liefert u.a. m.upload.size (max Bytes). Wir
     * cachen das client-seitig und pruefen Datei-Groessen vor dem Upload,
     * damit der User eine saubere Fehlermeldung bekommt statt ein HTTP 413.
     */
    getMediaConfig(accessToken: string): Promise<{ 'm.upload.size'?: number }>;
    getAccountData(accessToken: string, userId: string, type: string): Promise<Record<string, unknown>>;
    setAccountData(accessToken: string, userId: string, type: string, content: Record<string, unknown>): Promise<void>;
    getProfile(accessToken: string, userId: string): Promise<MatrixProfile>;
    setDisplayName(accessToken: string, userId: string, displayname: string): Promise<void>;
    setAvatarUrl(accessToken: string, userId: string, avatarUrl: string): Promise<void>;
    uploadMedia(accessToken: string, blob: Blob, filename: string, contentType: string): Promise<{ content_uri: string }>;
    mxcToHttp(mxcUri: string, accessToken?: string): string;
}

export const createMatrixGateway = (): MatrixGateway => ({
    login(input) {
        return requestJson<MatrixLoginResponse>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: '/client/v3/login',
            method: 'POST',
            body: JSON.stringify(input),
        });
    },

    whoAmI(accessToken) {
        return requestJson<MatrixWhoAmIResponse>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: '/client/v3/account/whoami',
            method: 'GET',
            bearerToken: accessToken,
        });
    },

    sync(accessToken, since, filter, timeout) {
        const params = new URLSearchParams();
        if (since) params.set('since', since);
        if (filter) params.set('filter', filter);
        if (timeout !== undefined) params.set('timeout', String(timeout));
        const query = params.toString() ? `?${params}` : '';

        return requestJson<MatrixSyncResponse>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/sync${query}`,
            method: 'GET',
            bearerToken: accessToken,
        });
    },

    getMessages(accessToken, roomId, from, limit = 50) {
        const params = new URLSearchParams({
            from,
            dir: 'b',
            limit: String(limit),
        });

        return requestJson<MatrixMessagesResponse>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
            method: 'GET',
            bearerToken: accessToken,
        });
    },

    sendMessage(accessToken, roomId, txnId, body, formattedBody?, threadId?, replyTo?) {
        const content: Record<string, unknown> = { msgtype: 'm.text', body };
        if (formattedBody) {
            content.format = 'org.matrix.custom.html';
            content.formatted_body = formattedBody;
        }
        if (threadId) {
            content['m.relates_to'] = {
                rel_type: 'm.thread',
                event_id: threadId,
                'm.in_reply_to': { event_id: replyTo ?? threadId },
            };
        }
        return requestJson<MatrixSendResponse>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`,
            method: 'PUT',
            bearerToken: accessToken,
            body: JSON.stringify(content),
        });
    },

    createDirectChat(accessToken, userId) {
        return requestJson<{ room_id: string }>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: '/client/v3/createRoom',
            method: 'POST',
            bearerToken: accessToken,
            body: JSON.stringify({
                is_direct: true,
                invite: [userId],
                preset: 'trusted_private_chat',
            }),
        });
    },

    async getOrCreateDirectChat(accessToken, myUserId, targetUserId) {
        // 1. Autoritativer Server-Check: existiert in m.direct schon ein
        //    Raum mit dem Empfänger? (verhindert Duplikat-DMs, wenn der
        //    lokale directRooms-Cache nach Login noch nicht hydrated ist)
        let mDirect: Record<string, string[]> = {};
        try {
            mDirect = (await this.getAccountData(accessToken, myUserId, 'm.direct')) as Record<string, string[]>;
        } catch { /* 404 = noch kein m.direct */ }
        const existing = (mDirect[targetUserId] ?? []).filter((rid) => typeof rid === 'string' && rid.length > 0);
        if (existing.length > 0) {
            return { room_id: existing[0], created: false };
        }
        // 2. Neu anlegen.
        const res = await this.createDirectChat(accessToken, targetUserId);
        // 3. In m.direct eintragen (best-effort; Anlage selbst hat schon geklappt).
        try {
            const next: Record<string, string[]> = { ...mDirect };
            next[targetUserId] = [...(next[targetUserId] ?? []), res.room_id];
            await this.setAccountData(accessToken, myUserId, 'm.direct', next);
        } catch { /* nicht kritisch */ }
        return { room_id: res.room_id, created: true };
    },

    joinRoom(accessToken, roomId) {
        return requestJson<{ room_id: string }>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/join/${encodeURIComponent(roomId)}`,
            method: 'POST',
            bearerToken: accessToken,
            body: '{}',
        });
    },

    leaveRoom(accessToken, roomId) {
        return requestJson<void>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/rooms/${encodeURIComponent(roomId)}/leave`,
            method: 'POST',
            bearerToken: accessToken,
            body: '{}',
        });
    },

    sendTyping(accessToken, roomId, userId, typing) {
        return requestJson<void>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(userId)}`,
            method: 'PUT',
            bearerToken: accessToken,
            body: JSON.stringify({ typing, timeout: typing ? 4000 : undefined }),
        });
    },

    sendReadMarkers(accessToken, roomId, eventId) {
        return requestJson<void>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/rooms/${encodeURIComponent(roomId)}/read_markers`,
            method: 'POST',
            bearerToken: accessToken,
            body: JSON.stringify({
                'm.fully_read': eventId,
                'm.read': eventId,
            }),
        });
    },

    getMediaConfig(accessToken) {
        return requestJson<{ 'm.upload.size'?: number }>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: '/client/v1/media/config',
            method: 'GET',
            bearerToken: accessToken,
        });
    },

    getAccountData(accessToken, userId, type) {
        return requestJson<Record<string, unknown>>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/user/${encodeURIComponent(userId)}/account_data/${encodeURIComponent(type)}`,
            method: 'GET',
            bearerToken: accessToken,
        });
    },

    setAccountData(accessToken, userId, type, content) {
        return requestJson<void>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/user/${encodeURIComponent(userId)}/account_data/${encodeURIComponent(type)}`,
            method: 'PUT',
            bearerToken: accessToken,
            body: JSON.stringify(content),
        });
    },

    getProfile(accessToken, userId) {
        return requestJson<MatrixProfile>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/profile/${encodeURIComponent(userId)}`,
            method: 'GET',
            bearerToken: accessToken,
        });
    },

    setDisplayName(accessToken, userId, displayname) {
        return requestJson<void>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/profile/${encodeURIComponent(userId)}/displayname`,
            method: 'PUT',
            bearerToken: accessToken,
            body: JSON.stringify({ displayname }),
        });
    },

    setAvatarUrl(accessToken, userId, avatarUrl) {
        return requestJson<void>({
            target: 'matrix',
            baseUrl: env.matrixBaseUrl,
            path: `/client/v3/profile/${encodeURIComponent(userId)}/avatar_url`,
            method: 'PUT',
            bearerToken: accessToken,
            body: JSON.stringify({ avatar_url: avatarUrl }),
        });
    },

    async uploadMedia(accessToken, blob, filename, contentType) {
        const params = new URLSearchParams({ filename });
        // /media/v3/upload — modernes Endpoint. /media/r0/ ist deprecated
        // und in neueren Synapse-Versionen entfernt. cache: 'no-store'
        // umgeht den Service Worker komplett, sonst kann ein veralteter
        // SW POSTs verschlucken (Symptom: Spinner ewig).
        const url = `${env.matrixBaseUrl}/media/v3/upload?${params}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': contentType,
            },
            body: blob,
            cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        return res.json() as Promise<{ content_uri: string }>;
    },

    mxcToHttp(mxcUri, accessToken?) {
        const match = mxcUri.match(/^mxc:\/\/([^/]+)\/(.+)$/);
        if (!match) return '';
        // Use authenticated client media endpoint (Synapse 1.96+)
        const base = `${env.matrixBaseUrl}/client/v1/media/thumbnail/${match[1]}/${match[2]}?width=256&height=256&method=crop`;
        // Append access_token as query param so <img src> works
        return accessToken ? `${base}&access_token=${encodeURIComponent(accessToken)}` : base;
    },
});

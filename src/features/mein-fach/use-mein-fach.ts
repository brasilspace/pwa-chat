import { useEffect, useState, useCallback } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

/**
 * Eine ungelesene Drop oder ein eigenes Dokument.
 * Backend liefert dasselbe Document-Schema fuer scope=PERSONAL und scope=INBOX.
 */
export interface MeinFachDocument {
    id: string;
    title: string;
    description: string | null;
    mimeType: string;
    sizeBytes: number;
    scope: 'PERSONAL' | 'INBOX';
    starred: boolean;
    uploadedBy: string;
    createdAt: string;
    lastOpenedAt: string | null;
    inboxDrop?: {
        senderUserId: string;
        senderNote: string | null;
        readAt: string | null;
        archivedByOwner: boolean;
        archivedAt: string | null;
        expiresAt: string;
    } | null;
}

export interface QuotaInfo {
    used: string;
    total: string;
    percent: number;
}

export interface PostfachSettings {
    whoCanDrop: 'ALL' | 'STAFF_ONLY' | 'CONTACTS' | 'NOBODY';
    blockList: string[];
    retentionDays: number;
    keepReadDrops: boolean;
    warnBeforeDelete: boolean;
    notificationMode: 'CHAT' | 'BELL' | 'BOTH' | 'NONE';
}

const apiBase = '/platform/v1';

function getJwt(): string | null {
    const session = sessionStore.getSnapshot();
    return session.platform?.token ?? null;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const jwt = getJwt();
    if (!jwt) throw new Error('Not authenticated');
    return requestJson<T>({
        target: 'platform',
        baseUrl: env.platformBaseUrl,
        path: `${apiBase}${path}`,
        method: init?.method ?? 'GET',
        bearerToken: jwt,
        body: init?.body,
        headers: init?.headers,
    });
}

export function useOwnDocuments(query: { q?: string; tags?: string } = {}) {
    const [docs, setDocs] = useState<MeinFachDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            if (query.q) qs.set('q', query.q);
            if (query.tags) qs.set('tags', query.tags);
            const path = `/personal-fach/documents${qs.toString() ? `?${qs.toString()}` : ''}`;
            const data = await fetchJson<{ documents: MeinFachDocument[] }>(path);
            setDocs(data.documents);
            setError(null);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [query.q, query.tags]);

    useEffect(() => { void refresh(); }, [refresh]);

    return { docs, loading, error, refresh };
}

export function useInbox(status: 'new' | 'archived' = 'new') {
    const [drops, setDrops] = useState<MeinFachDocument[]>([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchJson<{ drops: MeinFachDocument[]; unread: number }>(
                `/personal-fach/inbox?status=${status}`,
            );
            setDrops(data.drops);
            setUnread(data.unread);
            setError(null);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => { void refresh(); }, [refresh]);

    return { drops, unread, loading, error, refresh };
}

export function useQuota() {
    const [quota, setQuota] = useState<{ personal: QuotaInfo; inbox: QuotaInfo } | null>(null);

    const refresh = useCallback(async () => {
        try {
            const data = await fetchJson<{ personal: QuotaInfo; inbox: QuotaInfo }>('/personal-fach/quota');
            setQuota(data);
        } catch {
            setQuota(null);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    return { quota, refresh };
}

export function useSettings() {
    const [settings, setSettings] = useState<PostfachSettings | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchJson<PostfachSettings>('/personal-fach/settings');
            setSettings(data);
        } finally {
            setLoading(false);
        }
    }, []);

    const update = useCallback(async (patch: Partial<PostfachSettings>) => {
        const data = await fetchJson<PostfachSettings>('/personal-fach/settings', {
            method: 'PATCH',
            body: JSON.stringify(patch),
        });
        setSettings(data);
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    return { settings, loading, refresh, update };
}

export const meinFachApi = {
    listDocuments: (params: { q?: string; tags?: string }) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set('q', params.q);
        if (params.tags) qs.set('tags', params.tags);
        const path = `/personal-fach/documents${qs.toString() ? `?${qs.toString()}` : ''}`;
        return fetchJson<{ documents: MeinFachDocument[] }>(path);
    },

    listTags: () =>
        fetchJson<{ tags: Array<{ id: string; label: string; slug: string; color: string | null }> }>('/personal-fach/tags'),

    addTag: (docId: string, label: string) =>
        fetchJson<{ tag: { id: string; label: string; slug: string } }>(
            `/personal-fach/documents/${docId}/tags`,
            { method: 'POST', body: JSON.stringify({ label }) },
        ),

    removeTag: (docId: string, tagId: string) =>
        fetchJson<{ ok: true }>(`/personal-fach/documents/${docId}/tags/${tagId}`, { method: 'DELETE' }),

    listVersions: (docId: string) =>
        fetchJson<{ rootId: string; versions: Array<{ id: string; version: number; sizeBytes: number; createdAt: string; deletedAt: string | null }> }>(
            `/personal-fach/documents/${docId}/versions`,
        ),

    bulkDeleteDocuments: (ids: string[]) =>
        fetchJson<{ deleted: number }>('/personal-fach/documents/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ ids }),
        }),

    bulkInbox: (ids: string[], action: 'archive' | 'move-to-docs' | 'delete') =>
        fetchJson<{ count: number }>('/personal-fach/inbox/bulk', {
            method: 'POST',
            body: JSON.stringify({ ids, action }),
        }),

    getUploadUrl: (params: { fileName: string; mimeType: string; sizeBytes: number }) =>
        fetchJson<{ storageKey: string; uploadUrl: { url: string } }>(
            '/personal-fach/documents/upload-url',
            { method: 'POST', body: JSON.stringify(params) },
        ),

    confirmUpload: (params: {
        storageKey: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        description?: string | null;
        fileHash?: string | null;
    }) =>
        fetchJson<MeinFachDocument>('/personal-fach/documents/confirm', {
            method: 'POST',
            body: JSON.stringify(params),
        }),

    deleteDocument: (id: string) =>
        fetchJson<{ ok: true }>(`/personal-fach/documents/${id}`, { method: 'DELETE' }),

    getDocumentDownloadUrl: (id: string) =>
        fetchJson<{ url: string }>(`/personal-fach/documents/${id}/download`),

    archiveDrop: (id: string) =>
        fetchJson<{ ok: true }>(`/personal-fach/inbox/${id}/archive`, { method: 'POST' }),

    moveToDocs: (id: string) =>
        fetchJson<{ ok: true }>(`/personal-fach/inbox/${id}/move-to-docs`, { method: 'POST' }),

    deleteDrop: (id: string) =>
        fetchJson<{ ok: true }>(`/personal-fach/inbox/${id}`, { method: 'DELETE' }),

    sendDrop: (params: {
        recipientUserId: string;
        storageKey: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        senderNote?: string | null;
        fileHash?: string | null;
    }) =>
        fetchJson<{ dropId: string }>('/personal-fach/drops', {
            method: 'POST',
            body: JSON.stringify(params),
        }),
};

/**
 * use-saved-searches — Smart Folders / gespeicherte Suchen (DMS Phase 2).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface SavedSearchQuery {
    q?: string;
    tagIds?: string[];
    scope?: 'SPACE' | 'PERSONAL' | 'INBOX' | 'GLOBAL';
    spaceId?: string;
    dateFrom?: string;
    dateTo?: string;
    starred?: boolean;
}

export interface SavedSearch {
    id: string;
    tenantId: string;
    ownerUserId: string | null;
    name: string;
    description: string | null;
    iconEmoji: string | null;
    query: SavedSearchQuery;
    sortOrder: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface SavedSearchDocument {
    id: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
    scope: string;
    spaceId: string | null;
}

const base = env.platformBaseUrl;

export const savedSearchesApi = {
    list: (jwt: string) =>
        requestJson<{ savedSearches: SavedSearch[] }>({
            target: 'platform', baseUrl: base, path: '/platform/v1/saved-searches',
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, data: { name: string; iconEmoji?: string; description?: string; query: SavedSearchQuery; shared?: boolean }) =>
        requestJson<{ savedSearch: SavedSearch }>({
            target: 'platform', baseUrl: base, path: '/platform/v1/saved-searches',
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    patch: (jwt: string, id: string, data: Partial<{ name: string; iconEmoji: string; description: string; query: SavedSearchQuery; sortOrder: number }>) =>
        requestJson<{ savedSearch: SavedSearch }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/saved-searches/${encodeURIComponent(id)}`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify(data),
        }),
    delete: (jwt: string, id: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base, path: `/platform/v1/saved-searches/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
    run: (jwt: string, id: string) =>
        requestJson<{ documents: SavedSearchDocument[] }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/saved-searches/${encodeURIComponent(id)}/run`,
            method: 'GET', bearerToken: jwt,
        }),
};

export function useSavedSearches() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [items, setItems] = useState<SavedSearch[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        savedSearchesApi.list(jwt)
            .then(r => setItems(r.savedSearches))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { refresh(); }, [refresh]);

    return { items, loading, refresh };
}

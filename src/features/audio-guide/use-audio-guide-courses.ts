/**
 * use-audio-guide-courses — Kollektionen + Play-Sessions (Phase D).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface CollectionListItem {
    id: string;
    title: string;
    description: string | null;
    visibility: 'PUBLIC' | 'SPACE';
    spaceId: string | null;
    memberCount: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface CollectionMember {
    id: string;
    documentId: string;
    sortOrder: number;
    title: string;
    cueCount: number;
    available: boolean;
}

export interface CollectionDetail {
    collection: {
        id: string;
        tenantId: string;
        title: string;
        description: string | null;
        visibility: 'PUBLIC' | 'SPACE';
        spaceId: string | null;
        createdBy: string;
        createdAt: string;
        updatedAt: string;
    };
    canEdit: boolean;
    members: CollectionMember[];
}

export interface PlaySession {
    id: string;
    documentId: string;
    collectionId: string | null;
    startedAt: string;
    completedAt: string | null;
    lastPosition: number;
}

export interface CollectionAnalytics {
    totals: { uniqueUsers: number; sessions: number; completed: number };
    perLesson: Array<{
        documentId: string;
        started: number;
        completed: number;
        averageLastPosition: number;
    }>;
}

const base = env.platformBaseUrl;

export const audioGuideCoursesApi = {
    list: (jwt: string) =>
        requestJson<{ collections: CollectionListItem[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guide-collections`,
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, data: { title: string; description?: string | null; visibility?: 'PUBLIC' | 'SPACE'; spaceId?: string | null }) =>
        requestJson<{ collection: CollectionListItem }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guide-collections`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    get: (jwt: string, id: string) =>
        requestJson<CollectionDetail>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guide-collections/${encodeURIComponent(id)}`,
            method: 'GET', bearerToken: jwt,
        }),
    update: (jwt: string, id: string, patch: Partial<{ title: string; description: string | null; visibility: 'PUBLIC' | 'SPACE'; spaceId: string | null }>) =>
        requestJson<{ collection: CollectionListItem }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guide-collections/${encodeURIComponent(id)}`,
            method: 'PUT', bearerToken: jwt, body: JSON.stringify(patch),
        }),
    saveMembers: (jwt: string, id: string, members: Array<{ documentId: string }>) =>
        requestJson<{ ok: true }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guide-collections/${encodeURIComponent(id)}/members`,
            method: 'PUT', bearerToken: jwt, body: JSON.stringify({ members }),
        }),
    delete: (jwt: string, id: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guide-collections/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
    upsertSession: (jwt: string, data: { documentId: string; collectionId?: string | null; lastPosition: number; completed?: boolean }) =>
        requestJson<{ session: PlaySession }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guide-play-sessions`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    mySessions: (jwt: string) =>
        requestJson<{ sessions: PlaySession[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guide-play-sessions/me`,
            method: 'GET', bearerToken: jwt,
        }),
    analytics: (jwt: string, id: string) =>
        requestJson<CollectionAnalytics>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guide-collections/${encodeURIComponent(id)}/analytics`,
            method: 'GET', bearerToken: jwt,
        }),
};

export function useAudioGuideCourses() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [collections, setCollections] = useState<CollectionListItem[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt) { setLoading(false); return; }
        setLoading(true);
        audioGuideCoursesApi.list(jwt)
            .then((r) => setCollections(r.collections))
            .catch(() => setCollections([]))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { refresh(); }, [refresh]);
    return { collections, loading, refresh };
}

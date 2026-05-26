/**
 * use-audio-guide — Cue-Liste eines Audio-Documents laden + speichern.
 *
 * Eine AudioGuide ist ein Document mit Audio-Inhalt + n persistierte
 * Cues, die der Player visuell und akustisch bespielt.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export type AudioGuideActionType =
    | 'none'
    | 'navigate-url'
    | 'show-overlay'
    | 'pause-and-wait'
    | 'start-flow'
    | 'highlight-element';

export interface AudioGuideCueRecord {
    id: string;
    documentId: string;
    atSeconds: number;
    duration: number;
    iconName: string;
    label: string;
    actionType: AudioGuideActionType;
    actionTarget: string | null;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
}

export interface AudioGuideDocumentMeta {
    id: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
}

export interface AudioGuideCueInput {
    atSeconds: number;
    duration: number;
    iconName: string;
    label: string;
    actionType?: AudioGuideActionType;
    actionTarget?: string | null;
    sortOrder?: number;
}

const base = env.platformBaseUrl;

export interface AudioGuideListItem {
    documentId: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
    scope: 'SPACE' | 'PERSONAL';
    spaceId: string | null;
    cueCount: number;
    updatedAt: string;
}

export const audioGuideApi = {
    list: (jwt: string) =>
        requestJson<{ audioGuides: AudioGuideListItem[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guides`,
            method: 'GET', bearerToken: jwt,
        }),
    get: (jwt: string, documentId: string) =>
        requestJson<{ cues: AudioGuideCueRecord[]; canEdit: boolean; document: AudioGuideDocumentMeta }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/audio-guide`,
            method: 'GET', bearerToken: jwt,
        }),
    save: (jwt: string, documentId: string, cues: AudioGuideCueInput[]) =>
        requestJson<{ cues: AudioGuideCueRecord[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/audio-guide`,
            method: 'PUT', bearerToken: jwt, body: JSON.stringify({ cues }),
        }),
    streamUrl: (jwt: string, documentId: string) =>
        requestJson<{ url: string; expiresAt: string }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/audio-guide/stream`,
            method: 'GET', bearerToken: jwt,
        }),
    listRoutes: (jwt: string) =>
        requestJson<{ routes: Array<{ id: string; routePattern: string; documentId: string }> }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guides/routes`,
            method: 'GET', bearerToken: jwt,
        }),
    saveRoutes: (jwt: string, routes: Array<{ routePattern: string; documentId: string }>) =>
        requestJson<{ routes: Array<{ id: string; routePattern: string; documentId: string }> }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/audio-guides/routes`,
            method: 'PUT', bearerToken: jwt, body: JSON.stringify({ routes }),
        }),
};

/**
 * Findet zu einem Pfad das beste passende Route-Pattern.
 * Exakter Match gewinnt vor Glob (laengster Match zuerst).
 * Glob: `*` als Wildcard am Ende (z.B. `/spaces/*` matcht `/spaces/abc`).
 */
export function matchRoute(
    routes: Array<{ routePattern: string; documentId: string }>,
    pathname: string,
): { documentId: string; routePattern: string } | null {
    const exact = routes.find((r) => r.routePattern === pathname);
    if (exact) return { documentId: exact.documentId, routePattern: exact.routePattern };
    const candidates = routes
        .filter((r) => r.routePattern.endsWith('*'))
        .map((r) => ({ ...r, prefix: r.routePattern.slice(0, -1) }))
        .filter((r) => pathname.startsWith(r.prefix))
        .sort((a, b) => b.prefix.length - a.prefix.length);
    return candidates[0] ?? null;
}

export function useAudioGuide(documentId: string | null) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [cues, setCues] = useState<AudioGuideCueRecord[]>([]);
    const [meta, setMeta] = useState<AudioGuideDocumentMeta | null>(null);
    const [canEdit, setCanEdit] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(() => {
        if (!jwt || !documentId) { setLoading(false); return; }
        setLoading(true);
        setError(null);
        audioGuideApi.get(jwt, documentId)
            .then((r) => {
                setCues(r.cues);
                setMeta(r.document);
                setCanEdit(r.canEdit);
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { cues, meta, canEdit, loading, error, refresh };
}

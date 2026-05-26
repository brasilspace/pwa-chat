/**
 * use-document-annotations — Thread-Kommentare auf Documents (DMS Phase 10).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface DocumentAnnotation {
    id: string;
    documentId: string;
    parentId: string | null;
    authorId: string;
    body: string;
    pageNumber: number | null;
    posX: number | null;
    posY: number | null;
    posWidth: number | null;
    posHeight: number | null;
    /** Sheets: A1-Notation der Zelle, z.B. "Sheet1!A3". Null = doc-level. */
    cellRef: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

const base = env.platformBaseUrl;

export const documentAnnotationsApi = {
    list: (jwt: string, documentId: string) =>
        requestJson<{ annotations: DocumentAnnotation[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/annotations`,
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, documentId: string, data: { body: string; parentId?: string; pageNumber?: number; posX?: number; posY?: number; posWidth?: number; posHeight?: number; cellRef?: string }) =>
        requestJson<{ annotation: DocumentAnnotation }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/annotations`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    patch: (jwt: string, id: string, body: string) =>
        requestJson<{ annotation: DocumentAnnotation }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/annotations/${encodeURIComponent(id)}`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify({ body }),
        }),
    resolve: (jwt: string, id: string) =>
        requestJson<{ annotation: DocumentAnnotation }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/annotations/${encodeURIComponent(id)}/resolve`,
            method: 'POST', bearerToken: jwt,
        }),
    reopen: (jwt: string, id: string) =>
        requestJson<{ annotation: DocumentAnnotation }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/annotations/${encodeURIComponent(id)}/reopen`,
            method: 'POST', bearerToken: jwt,
        }),
    delete: (jwt: string, id: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/annotations/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
};

export function useDocumentAnnotations(documentId: string | null) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt || !documentId) { setLoading(false); return; }
        setLoading(true);
        documentAnnotationsApi.list(jwt, documentId)
            .then(r => setAnnotations(r.annotations))
            .catch(() => setAnnotations([]))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { annotations, loading, refresh };
}

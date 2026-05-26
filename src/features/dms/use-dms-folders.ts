/**
 * use-dms-folders — Frontend-API + Hook fuer das neue Folder-System.
 *
 * Konzept: prilog_docs/docs/umsetzung/dms-folder-system-konzept.md (v1.2)
 *
 * Lazy: jeder Hook laedt nur die direkten Kinder. Sub-Trees werden
 * erst beim Expand geladen.
 */

import { useEffect, useState, useCallback } from 'react';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import { sessionStore } from '@/core/session/session-store';

export interface DmsFolder {
    id: string;
    tenantId: string;
    spaceId: string | null;
    ownerUserId: string | null;
    parentId: string | null;
    name: string;
    sortKey: string;
    depth: number;
    documentCount: number;
    deletedAt: string | null;
    watchConfig: unknown;
    createdAt: string;
    createdBy: string;
    updatedAt: string;
    /** Vom Listing-Endpoint mitgeliefert: hat dieser Folder Kinder? */
    hasChildren?: boolean;
}

const base = env.platformBaseUrl;

export const dmsFoldersApi = {
    create: (jwt: string, body: { spaceId?: string; meinFach?: boolean; parentId?: string; name: string }) =>
        requestJson<{ folder: DmsFolder }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms-folders`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify(body),
        }),

    listSpace: (jwt: string, spaceId: string, parentId: string | null) => {
        const qp = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
        return requestJson<{ folders: DmsFolder[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/dms-folders${qp}`,
            method: 'GET', bearerToken: jwt,
        });
    },

    listMeinFach: (jwt: string, parentId: string | null) => {
        const qp = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
        return requestJson<{ folders: DmsFolder[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/personal-fach/dms-folders${qp}`,
            method: 'GET', bearerToken: jwt,
        });
    },

    patch: (jwt: string, id: string, body: { name?: string; parentId?: string | null; watchConfig?: unknown }) =>
        requestJson<{ folder: DmsFolder }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms-folders/${encodeURIComponent(id)}`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify(body),
        }),

    delete: (jwt: string, id: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms-folders/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        }),

    restore: (jwt: string, id: string, name?: string) =>
        requestJson<{ folder: DmsFolder }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms-folders/${encodeURIComponent(id)}/restore`,
            method: 'POST', bearerToken: jwt,
            body: JSON.stringify(name ? { name } : {}),
        }),

    moveDoc: (jwt: string, docId: string, folderId: string | null) =>
        requestJson<{ ok: true }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(docId)}/move`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify({ folderId }),
        }),

    moveDocsBatch: (jwt: string, docIds: string[], folderId: string | null) =>
        requestJson<{ moved: number }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/move-batch`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify({ docIds, folderId }),
        }),
};

/**
 * Lazy-Folder-Children-Hook.
 *
 * @param container — { spaceId } oder { meinFach: true }
 * @param parentId  — null = Root-Ebene; sonst Children dieses Folders
 */
export function useDmsFolders(
    container: { spaceId?: string; meinFach?: boolean } | null,
    parentId: string | null,
): { folders: DmsFolder[]; loading: boolean; refresh: () => void } {
    const [folders, setFolders] = useState<DmsFolder[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt || !container) return;
        setLoading(true);
        try {
            const res = container.spaceId
                ? await dmsFoldersApi.listSpace(jwt, container.spaceId, parentId)
                : container.meinFach
                    ? await dmsFoldersApi.listMeinFach(jwt, parentId)
                    : { folders: [] };
            setFolders(res.folders);
        } catch {
            setFolders([]);
        } finally {
            setLoading(false);
        }
    }, [container?.spaceId, container?.meinFach, parentId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { folders, loading, refresh };
}

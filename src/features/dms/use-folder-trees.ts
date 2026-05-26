/**
 * use-folder-trees — Hook + Client fuer Mehrfache Ordner-Hierarchien (DMS Phase 1).
 *
 * Konzept: Tenant hat n FolderTrees, jeder Tree hat hierarchische Folders.
 * Documents haengen via DocumentFolderPlacement in beliebig vielen Folders.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface FolderNode {
    id: string;
    name: string;
    iconEmoji: string | null;
    parentId: string | null;
    sortOrder: number;
    documentCount?: number;
}

export interface FolderTreeNode {
    id: string;
    name: string;
    description: string | null;
    iconEmoji: string | null;
    sortOrder: number;
    folders: FolderNode[];
    createdBy: string;
    createdAt: string;
}

export interface DocumentFolder {
    id: string;
    name: string;
    iconEmoji: string | null;
    parentId: string | null;
    tree: { id: string; name: string; iconEmoji: string | null };
}

const base = env.platformBaseUrl;

export const folderTreesApi = {
    list: (jwt: string) =>
        requestJson<{ trees: FolderTreeNode[] }>({
            target: 'platform', baseUrl: base, path: '/platform/v1/folder-trees',
            method: 'GET', bearerToken: jwt,
        }),
    createTree: (jwt: string, data: { name: string; iconEmoji?: string; description?: string }) =>
        requestJson<{ tree: FolderTreeNode }>({
            target: 'platform', baseUrl: base, path: '/platform/v1/folder-trees',
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    patchTree: (jwt: string, id: string, data: Partial<{ name: string; iconEmoji: string; description: string; sortOrder: number }>) =>
        requestJson<{ tree: FolderTreeNode }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/folder-trees/${encodeURIComponent(id)}`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify(data),
        }),
    deleteTree: (jwt: string, id: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base, path: `/platform/v1/folder-trees/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
    createFolder: (jwt: string, data: { treeId: string; parentId?: string; name: string; iconEmoji?: string }) =>
        requestJson<{ folder: FolderNode }>({
            target: 'platform', baseUrl: base, path: '/platform/v1/folders',
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    patchFolder: (jwt: string, id: string, data: Partial<{ name: string; iconEmoji: string; sortOrder: number; parentId: string | null }>) =>
        requestJson<{ folder: FolderNode }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/folders/${encodeURIComponent(id)}`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify(data),
        }),
    deleteFolder: (jwt: string, id: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base, path: `/platform/v1/folders/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
    placeDocument: (jwt: string, folderId: string, documentId: string) =>
        requestJson<{ placement: { id: string } }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/folders/${encodeURIComponent(folderId)}/documents`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify({ documentId }),
        }),
    removePlacement: (jwt: string, folderId: string, documentId: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/folders/${encodeURIComponent(folderId)}/documents/${encodeURIComponent(documentId)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
    listDocuments: (jwt: string, folderId: string) =>
        requestJson<{ documents: Array<{ id: string; title: string; mimeType: string; sizeBytes: number; createdAt: string; updatedAt: string; scope: string; spaceId: string | null }> }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/folders/${encodeURIComponent(folderId)}/documents`,
            method: 'GET', bearerToken: jwt,
        }),
    documentFolders: (jwt: string, documentId: string) =>
        requestJson<{ folders: DocumentFolder[] }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/documents/${encodeURIComponent(documentId)}/folders`,
            method: 'GET', bearerToken: jwt,
        }),
};

export function useFolderTrees() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [trees, setTrees] = useState<FolderTreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        folderTreesApi.list(jwt)
            .then(r => { setTrees(r.trees); setError(null); })
            .catch(e => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { refresh(); }, [refresh]);

    return { trees, loading, error, refresh };
}

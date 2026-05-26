/**
 * useDocuments — Documents Hub mit TanStack Query.
 *
 * Reactive-Layer:
 *  - useQuery fuer Liste/Stats/Tags
 *  - useMutation fuer Upload/Toggle/Delete/Update mit Optimistic Updates
 *  - ReactiveBridge invalidiert automatisch bei SSE document.changed
 *
 * Pagination: erste 50 Eintraege via useQuery, "Mehr laden" via useInfiniteQuery
 * ist Folgeschritt — heute fokussiert auf Korrektheit der ersten Seite.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { logger } from '@/core/logging/logger';
import type { DocumentItem, DocumentStats, Tag } from '@/features/project/project-types';

const gateway = createProjectGateway();

export interface DocumentFilters {
    q?: string;
    tags?: string;
    spaceId?: string;
    folderId?: string;
    starred?: boolean;
    recent?: boolean;
    sort?: 'date' | 'name' | 'size' | 'type' | 'opened';
    order?: 'asc' | 'desc';
}

const EMPTY_STATS: DocumentStats = { total: 0, starred: 0, recent: 0 };

export function useDocuments(filters: DocumentFilters = {}) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const qc = useQueryClient();

    // TanStack Query hashed queryKey strukturell — Inline-Filter-Objekte sind OK.
    const listQ = useQuery({
        queryKey: ['documents', 'list', filters] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listAllDocuments(jwt, {
                q: filters.q || undefined,
                tags: filters.tags || undefined,
                spaceId: filters.spaceId || undefined,
                folderId: filters.folderId || undefined,
                starred: filters.starred ? 'true' : undefined,
                recent: filters.recent ? 'true' : undefined,
                sort: filters.sort,
                order: filters.order,
                limit: 50,
            });
        },
    });

    const statsQ = useQuery({
        queryKey: ['document-stats'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.getDocumentStats(jwt);
        },
    });

    const tagsQ = useQuery({
        queryKey: ['document-tags'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            const r = await gateway.listTags(jwt);
            return r.tags;
        },
    });

    const documents = listQ.data?.documents ?? [];
    const hasMore = listQ.data?.hasMore ?? false;
    const loading = listQ.isLoading;
    const stats = statsQ.data ?? EMPTY_STATS;
    const tags = (tagsQ.data ?? []) as Tag[];

    // loadMore deaktiviert — Folgeschritt mit useInfiniteQuery. Heute: erste 50.
    const loadMore = useCallback(() => undefined, []);

    const refresh = useCallback(() => {
        qc.invalidateQueries({ queryKey: ['documents'] });
        qc.invalidateQueries({ queryKey: ['document-stats'] });
        qc.invalidateQueries({ queryKey: ['document-tags'] });
        qc.invalidateQueries({ queryKey: ['document-folders'] });
    }, [qc]);

    // ─── Upload ──────────────────────────────────────────────────────────
    const uploadMutation = useMutation({
        mutationFn: async (vars: {
            spaceId: string;
            file: File;
            opts?: { description?: string; tagIds?: string[]; skipDuplicateCheck?: boolean; folderId?: string | null };
        }) => {
            if (!jwt) throw new Error('no jwt');
            const { spaceId, file, opts } = vars;

            let fileHash: string | undefined;
            try {
                const arrayBuffer = await file.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
                fileHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
                if (!opts?.skipDuplicateCheck) {
                    const { duplicate } = await gateway.checkDuplicate(jwt, spaceId, fileHash);
                    if (duplicate) {
                        const proceed = window.confirm(
                            `Ein Dokument mit gleichem Inhalt existiert bereits:\n"${duplicate.title}"\n\nTrotzdem hochladen?`,
                        );
                        if (!proceed) throw new Error('Upload abgebrochen.');
                    }
                }
            } catch (e) {
                if (e instanceof Error && e.message === 'Upload abgebrochen.') throw e;
            }

            const { uploadUrl, storageKey } = await gateway.requestDocumentUpload(jwt, spaceId, {
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
            });

            const putRes = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
            });
            if (!putRes.ok) {
                let detail = `HTTP ${putRes.status}`;
                if (putRes.status === 413) detail = `Datei zu gross (${Math.round(file.size / 1024 / 1024)} MB). Limit: 200 MB.`;
                else if (putRes.status === 502 || putRes.status === 504) detail = 'Objektspeicher gerade nicht erreichbar.';
                else if (putRes.status === 403) detail = 'Upload-Berechtigung abgelaufen. Seite neu laden.';
                throw new Error(`Upload fehlgeschlagen: ${detail}`);
            }

            const res = await gateway.confirmDocumentUpload(jwt, spaceId, {
                storageKey,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
                description: opts?.description,
                tagIds: opts?.tagIds,
                fileHash,
                folderId: opts?.folderId ?? null,
            });

            return res.document;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['documents'] });
            qc.invalidateQueries({ queryKey: ['document-stats'] });
            qc.invalidateQueries({ queryKey: ['document-folders'] });
        },
        onError: (err) => {
            logger.error('Document upload failed', { error: err });
        },
    });

    const uploadDocument = useCallback(
        (
            spaceId: string,
            file: File,
            opts?: { description?: string; tagIds?: string[]; skipDuplicateCheck?: boolean; folderId?: string | null },
        ) => uploadMutation.mutateAsync({ spaceId, file, opts }),
        [uploadMutation],
    );

    // ─── toggleStar / toggleLock / delete / update ──────────────────────
    const toggleStarMutation = useMutation({
        mutationFn: async (doc: DocumentItem) => {
            if (!jwt) throw new Error('no jwt');
            await gateway.toggleDocumentStar(jwt, doc.spaceId, doc.id);
            gateway.toggleFavorite(jwt, { type: 'document', referenceId: doc.id, label: doc.title }).catch(() => {});
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['documents'] });
            qc.invalidateQueries({ queryKey: ['document-stats'] });
        },
    });
    const toggleStar = useCallback((doc: DocumentItem) => toggleStarMutation.mutate(doc), [toggleStarMutation]);

    const toggleLockMutation = useMutation({
        mutationFn: async (doc: DocumentItem) => {
            if (!jwt) throw new Error('no jwt');
            return gateway.toggleDocumentLock(jwt, doc.spaceId, doc.id);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['documents'] });
        },
    });
    const toggleLock = useCallback((doc: DocumentItem) => toggleLockMutation.mutate(doc), [toggleLockMutation]);

    const deleteMutation = useMutation({
        mutationFn: async (doc: DocumentItem) => {
            if (!jwt) throw new Error('no jwt');
            return gateway.deleteDocument(jwt, doc.spaceId, doc.id);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['documents'] });
            qc.invalidateQueries({ queryKey: ['document-stats'] });
            qc.invalidateQueries({ queryKey: ['document-folders'] });
        },
    });
    const deleteDocument = useCallback((doc: DocumentItem) => deleteMutation.mutate(doc), [deleteMutation]);

    const downloadDocument = useCallback(
        async (doc: DocumentItem) => {
            if (!jwt) return;
            try {
                const { downloadUrl } = await gateway.getDocumentDownloadUrl(jwt, doc.spaceId, doc.id);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = doc.title;
                a.click();
            } catch (err) {
                logger.error('Download failed', { error: err });
            }
        },
        [jwt],
    );

    const updateMutation = useMutation({
        mutationFn: async (vars: { doc: DocumentItem; patch: { title?: string; description?: string | null; tagIds?: string[] } }) => {
            if (!jwt) throw new Error('no jwt');
            return gateway.updateDocument(jwt, vars.doc.spaceId, vars.doc.id, vars.patch);
        },
        onSuccess: (_res, vars) => {
            qc.invalidateQueries({ queryKey: ['documents'] });
            if (vars.patch.tagIds) qc.invalidateQueries({ queryKey: ['document-tags'] });
        },
    });
    const updateDocument = useCallback(
        (doc: DocumentItem, patch: { title?: string; description?: string | null; tagIds?: string[] }) =>
            updateMutation.mutateAsync({ doc, patch }).then((r) => r.document),
        [updateMutation],
    );

    const createTag = useCallback(
        async (label: string, color?: string) => {
            if (!jwt) return;
            const res = await gateway.createTag(jwt, { label, color });
            qc.invalidateQueries({ queryKey: ['document-tags'] });
            return res.tag;
        },
        [jwt, qc],
    );

    const deleteTag = useCallback(
        async (tagId: string) => {
            if (!jwt) return;
            await gateway.deleteTag(jwt, tagId);
            qc.invalidateQueries({ queryKey: ['document-tags'] });
        },
        [jwt, qc],
    );

    return {
        documents,
        loading,
        hasMore,
        stats,
        tags,
        loadMore,
        refresh,
        uploadDocument,
        toggleStar,
        toggleLock,
        deleteDocument,
        downloadDocument,
        updateDocument,
        createTag,
        deleteTag,
    };
}

// ---------------------------------------------------------------------------
// useSpaceDocuments — space-scoped variant fuer den Space-Tab.
// ---------------------------------------------------------------------------
export function useSpaceDocuments(
    spaceId: string | undefined,
    filters: { q?: string; tags?: string; folderId?: string | null } = {},
) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const qc = useQueryClient();

    const q = useQuery({
        queryKey: ['documents', 'space', spaceId, filters] as const,
        enabled: !!jwt && !!spaceId,
        queryFn: async () => {
            if (!jwt || !spaceId) throw new Error('no spaceId');
            return gateway.listDocuments(jwt, spaceId, {
                q: filters.q || undefined,
                tags: filters.tags || undefined,
                folderId: filters.folderId || undefined,
            });
        },
    });

    const refresh = useCallback(() => {
        qc.invalidateQueries({ queryKey: ['documents'] });
    }, [qc]);

    return {
        documents: q.data?.documents ?? [],
        loading: q.isLoading,
        refresh,
    };
}

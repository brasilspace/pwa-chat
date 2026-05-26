import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import type {
    FileFolder, FileItem, StorageUsage, Board, BoardGroup, WorkItem, MyTaskItem, ActivityEntry,
    DocumentItem, DocumentListResponse, DocumentStats, Tag, SavedFilter,
    FavoriteItem, FavoriteCounts, FavoriteType,
    WorkItemComment, Checklist, ChecklistItemType,
} from '@/features/project/project-types';

const base = (spaceId: string) => `/platform/v1/spaces/${encodeURIComponent(spaceId)}`;

export interface TimelineCalendarEvent {
    id: string;
    title: string;
    date: string;
    dateEnd: string | null;
    allDay: boolean;
    location: string | null;
    layerName: string | null;
    layerColor: string | null;
}

export interface TimelineContext {
    calendarEvents: TimelineCalendarEvent[];
    activityByDay: Record<string, number>;
    newMembers: Array<{ userId: string; spaceName: string; date: string }>;
}

export interface ProjectGateway {
    // --- Files ---
    listFolders(jwt: string, spaceId: string): Promise<{ folders: FileFolder[] }>;
    createFolder(jwt: string, spaceId: string, body: { name: string; parentId?: string }): Promise<{ folder: FileFolder }>;
    deleteFolder(jwt: string, spaceId: string, folderId: string): Promise<void>;
    listFilesInFolder(jwt: string, spaceId: string, folderId: string): Promise<{ files: FileItem[] }>;
    searchFiles(jwt: string, spaceId: string, q: string): Promise<{ files: FileItem[] }>;
    requestUpload(jwt: string, spaceId: string, body: { fileName: string; mimeType: string; sizeBytes: number; folderId: string }): Promise<{ uploadUrl: string; storageKey: string; expiresAt: string }>;
    confirmUpload(jwt: string, spaceId: string, body: { storageKey: string; fileName: string; mimeType: string; sizeBytes: number; folderId: string }): Promise<{ file: FileItem }>;
    getDownloadUrl(jwt: string, spaceId: string, fileId: string): Promise<{ downloadUrl: string; fileName: string; mimeType: string }>;
    getPreviewUrl(jwt: string, spaceId: string, fileId: string): Promise<{ previewUrl: string; fileName: string; mimeType: string }>;
    deleteFile(jwt: string, spaceId: string, fileId: string): Promise<void>;
    moveFile(jwt: string, spaceId: string, fileId: string, folderId: string): Promise<{ file: FileItem }>;
    getUsage(jwt: string, spaceId: string): Promise<StorageUsage>;

    // --- Boards ---
    listBoards(jwt: string, spaceId: string): Promise<{ boards: Board[] }>;
    createBoard(jwt: string, spaceId: string, body: { name: string; type?: string }): Promise<{ board: Board }>;
    listItems(jwt: string, spaceId: string, boardId: string, filters?: Record<string, string>): Promise<{ items: WorkItem[] }>;
    createItem(jwt: string, spaceId: string, boardId: string, body: { title: string; description?: string; status?: string; priority?: string; assignees?: string[]; responsibleUserId?: string | null; dueDate?: string; parentId?: string }): Promise<{ item: WorkItem }>;
    updateItem(jwt: string, spaceId: string, itemId: string, patch: Record<string, unknown>): Promise<{ item: WorkItem }>;
    moveItem(jwt: string, spaceId: string, itemId: string, body: { status?: string; boardId?: string; sortOrder?: number }): Promise<{ item: WorkItem }>;
    deleteItem(jwt: string, spaceId: string, itemId: string, reason: string): Promise<void>;
    createItemFromMessage(jwt: string, spaceId: string, body: { title: string; body?: string; sourceMatrixEventId?: string; responsibleUserId?: string | null }): Promise<{ item: WorkItem; boardId: string }>;
    /** Liefert pro Matrix-Event-ID die Aufgabe + ihren Status — fuer Chat-Bubble-Border. */
    getItemsByEvents(jwt: string, spaceId: string, eventIds: string[]): Promise<{ items: Record<string, { itemId: string; status: string; title: string; boardId: string; responsibleUserId: string | null }> }>;
    // --- Phase 14: Soft-Delete + Reede ---
    listTrash(jwt: string, spaceId: string): Promise<{ items: Array<{ id: string; title: string; status: string; boardId: string; deletedAt: string; deletedBy: string | null; responsibleUserId: string | null }> }>;
    restoreItem(jwt: string, spaceId: string, itemId: string): Promise<{ item: WorkItem }>;
    purgeItem(jwt: string, spaceId: string, itemId: string): Promise<void>;
    parkItem(jwt: string, spaceId: string, itemId: string, body?: { note?: string }): Promise<{ item: WorkItem }>;
    reviveItem(jwt: string, spaceId: string, itemId: string, body?: { dueDate?: string }): Promise<{ item: WorkItem }>;

    // --- My Tasks (cross-space) ---
    getMyTasks(jwt: string, params?: { status?: string; includeDone?: boolean; sort?: string }): Promise<{ items: MyTaskItem[] }>;

    // --- Board Groups ---
    listGroups(jwt: string, spaceId: string, boardId: string): Promise<{ groups: BoardGroup[] }>;
    createGroup(jwt: string, spaceId: string, boardId: string, body: { title: string; color?: string }): Promise<{ group: BoardGroup }>;
    updateGroup(jwt: string, spaceId: string, groupId: string, patch: Partial<BoardGroup>): Promise<{ group: BoardGroup }>;
    deleteGroup(jwt: string, spaceId: string, groupId: string): Promise<{ success: boolean }>;

    // --- Documents (space-scoped) ---
    listDocuments(jwt: string, spaceId: string, params?: { q?: string; tags?: string; folderId?: string; sort?: string; order?: string; cursor?: string; limit?: number }): Promise<DocumentListResponse>;
    getDocument(jwt: string, spaceId: string, docId: string): Promise<{ document: DocumentItem }>;
    requestDocumentUpload(jwt: string, spaceId: string, body: { fileName: string; mimeType: string; sizeBytes: number }): Promise<{ uploadUrl: string; storageKey: string; expiresAt: string }>;
    confirmDocumentUpload(jwt: string, spaceId: string, body: { storageKey: string; fileName: string; mimeType: string; sizeBytes: number; description?: string; tagIds?: string[]; fileHash?: string; folderId?: string | null }): Promise<{ document: DocumentItem }>;
    updateDocument(jwt: string, spaceId: string, docId: string, patch: { title?: string; description?: string | null; tagIds?: string[] }): Promise<{ document: DocumentItem }>;
    deleteDocument(jwt: string, spaceId: string, docId: string): Promise<void>;
    getDocumentDownloadUrl(jwt: string, spaceId: string, docId: string): Promise<{ downloadUrl: string; fileName: string }>;
    archiveTranscribeDocument(jwt: string, spaceId: string, docId: string): Promise<{ mdDocumentId: string; archiveFolderId: string; transcriptChars: number }>;
    getDocumentPreviewUrl(jwt: string, spaceId: string, docId: string): Promise<{ previewUrl: string | null; extractedContent?: string | null; mimeType: string }>;
    toggleDocumentStar(jwt: string, spaceId: string, docId: string): Promise<{ starred: boolean }>;
    toggleDocumentLock(jwt: string, spaceId: string, docId: string): Promise<{ locked: boolean }>;
    getDocumentUsage(jwt: string, spaceId: string): Promise<StorageUsage>;
    checkDuplicate(jwt: string, spaceId: string, hash: string): Promise<{ duplicate: { id: string; title: string; createdAt: string } | null }>;
    requestVersionUpload(jwt: string, spaceId: string, docId: string, body: { fileName: string; mimeType: string; sizeBytes: number }): Promise<{ uploadUrl: string; storageKey: string; expiresAt: string; parentId: string }>;
    confirmVersionUpload(jwt: string, spaceId: string, docId: string, body: { storageKey: string; fileName: string; mimeType: string; sizeBytes: number }): Promise<{ document: DocumentItem }>;
    getDocumentVersions(jwt: string, spaceId: string, docId: string): Promise<{ versions: Array<{ id: string; version: number; title: string; mimeType: string; sizeBytes: number; uploadedBy: string; createdAt: string }> }>;
    getDocumentActivity(jwt: string, spaceId: string, docId: string): Promise<{ entries: Array<{ id: string; contentType: string; actorId: string; actorName?: string; title: string; occurredAt: string }> }>;

    // --- Documents (global / cross-space) ---
    listAllDocuments(jwt: string, params?: { q?: string; tags?: string; spaceId?: string; folderId?: string; starred?: string; recent?: string; sort?: string; order?: string; cursor?: string; limit?: number }): Promise<DocumentListResponse>;
    getDocumentStats(jwt: string): Promise<DocumentStats>;
    getAdminOverview(jwt: string): Promise<{ spaces: Array<{ spaceId: string; spaceName: string; documentCount: number; totalBytes: number; archivedCount: number; deletedCount: number }> }>;
    getTrash(jwt: string): Promise<{ documents: Array<{ id: string; title: string; spaceId: string; spaceName: string; mimeType: string; sizeBytes: number; deletedAt: string }> }>;
    restoreDocument(jwt: string, docId: string): Promise<{ restored: boolean }>;
    getTimelineContext(jwt: string, from: string, to: string): Promise<TimelineContext>;

    // --- Tags ---
    listTags(jwt: string): Promise<{ tags: Tag[] }>;
    createTag(jwt: string, body: { label: string; color?: string }): Promise<{ tag: Tag }>;
    updateTag(jwt: string, tagId: string, patch: { label?: string; color?: string | null }): Promise<{ tag: Tag }>;
    deleteTag(jwt: string, tagId: string): Promise<void>;

    // --- Favorites ---
    listFavorites(jwt: string, type?: FavoriteType): Promise<{ favorites: FavoriteItem[] }>;
    getFavoriteCounts(jwt: string): Promise<FavoriteCounts>;
    toggleFavorite(jwt: string, body: { type: FavoriteType; referenceId: string; label: string }): Promise<{ favorited: boolean; favorite?: FavoriteItem }>;
    removeFavorite(jwt: string, id: string): Promise<void>;

    // --- Saved Filters ---
    listSavedFilters(jwt: string): Promise<{ filters: SavedFilter[] }>;
    createSavedFilter(jwt: string, body: { label: string; filter: Record<string, unknown> }): Promise<{ filter: SavedFilter }>;
    updateSavedFilter(jwt: string, filterId: string, patch: { label?: string; filter?: Record<string, unknown> }): Promise<{ filter: SavedFilter }>;
    deleteSavedFilter(jwt: string, filterId: string): Promise<void>;

    // --- User Spaces ---
    getUserSpaces(jwt: string, userId: string): Promise<{ spaces: Array<{ id: string; name: string; type: string; color: string | null; role: string }> }>;

    // --- Family Relations ---
    getUserFamily(jwt: string, userId: string): Promise<{
        contacts: Array<{ id: string; userId: string; relationType: string; isPrimaryContact: boolean; canPickUp: boolean; receivesReports: boolean; receivesEmergency: boolean; notes: string | null }>;
        responsibleFor: Array<{ id: string; userId: string; relationType: string; isPrimaryContact: boolean; canPickUp: boolean; receivesReports: boolean; receivesEmergency: boolean; notes: string | null }>;
    }>;
    createFamilyRelation(jwt: string, body: { personUserId: string; contactUserId: string; relationType: string; isPrimaryContact?: boolean; canPickUp?: boolean; receivesReports?: boolean; receivesEmergency?: boolean; notes?: string }): Promise<{ relation: unknown }>;
    updateFamilyRelation(jwt: string, id: string, patch: Record<string, unknown>): Promise<{ relation: unknown }>;
    deleteFamilyRelation(jwt: string, id: string): Promise<void>;

    // --- Contact Tags (eigenständig, getrennt von DMS-Tags) ---
    listContactTags(jwt: string): Promise<{ tags: Array<{ id: string; label: string; slug: string; color: string | null; contactCount: number; createdAt: string }> }>;
    createContactTag(jwt: string, body: { label: string; color?: string }): Promise<{ tag: { id: string; label: string; slug: string; color: string | null } }>;
    updateContactTag(jwt: string, tagId: string, patch: { label?: string; color?: string | null }): Promise<{ tag: unknown }>;
    deleteContactTag(jwt: string, tagId: string): Promise<void>;
    getContactTags(jwt: string, userId: string): Promise<{ tags: Array<{ id: string; label: string; slug: string; color: string | null }> }>;
    setContactTags(jwt: string, userId: string, tagIds: string[]): Promise<{ tagIds: string[] }>;
    addContactTag(jwt: string, userId: string, tagId: string): Promise<{ success: boolean }>;
    removeContactTag(jwt: string, userId: string, tagId: string): Promise<void>;

    // --- Contact Groups (struktur. Zugehoerigkeit, anders als Tags) ---
    listContactGroups(jwt: string): Promise<{ groups: Array<{ id: string; label: string; slug: string; category: string | null; color: string | null; description: string | null; internal: boolean; memberCount: number; createdAt: string }> }>;
    createContactGroup(jwt: string, body: { label: string; category?: string; color?: string; description?: string; internal?: boolean }): Promise<{ group: { id: string; label: string; slug: string } }>;
    updateContactGroup(jwt: string, groupId: string, patch: { label?: string; category?: string | null; color?: string | null; description?: string | null; internal?: boolean }): Promise<{ group: unknown }>;
    deleteContactGroup(jwt: string, groupId: string): Promise<void>;
    bulkAssignContactGroups(jwt: string, body: { groupIds: string[]; contacts: Array<{ userMatrixId?: string; externalContactId?: string }> }): Promise<{ batchId: string; affectedCount: number }>;
    bulkRemoveContactGroups(jwt: string, body: { groupIds: string[]; contacts: Array<{ userMatrixId?: string; externalContactId?: string }> }): Promise<{ batchId: string; affectedCount: number }>;
    bulkAddContactTags(jwt: string, body: { tagIds: string[]; contacts: Array<{ userMatrixId: string }> }): Promise<{ batchId: string; affectedCount: number }>;
    bulkRemoveContactTags(jwt: string, body: { tagIds: string[]; contacts: Array<{ userMatrixId: string }> }): Promise<{ batchId: string; affectedCount: number }>;

    // --- Contact Action Batches (Verlauf + Undo) ---
    listContactBatches(jwt: string, opts?: { limit?: number; onlyMine?: boolean }): Promise<{ batches: Array<{ id: string; actorId: string; actionType: string; affectedCount: number; summary: string; status: string; undoUntil: string; undoneAt: string | null; undoneBy: string | null; undoNote: string | null; createdAt: string; canUndoNow: boolean }> }>;
    getContactBatch(jwt: string, batchId: string): Promise<{ batch: { id: string; actorId: string; actionType: string; affectedCount: number; summary: string; status: string; payloadBefore: unknown; payloadAfter: unknown; undoUntil: string; canUndoNow: boolean } }>;
    undoContactBatch(jwt: string, batchId: string, opts?: { forceOverride?: boolean }): Promise<{ result: { batchId: string; reverted: string[]; skipped: Array<{ contactId: string; reason: string }>; newStatus: string } }>;

    // --- Comments ---
    listComments(jwt: string, spaceId: string, itemId: string): Promise<{ comments: WorkItemComment[] }>;
    createComment(jwt: string, spaceId: string, itemId: string, body: { content: string; mentions?: string[] }): Promise<{ comment: WorkItemComment }>;
    updateComment(jwt: string, spaceId: string, commentId: string, body: { content: string; mentions?: string[] }): Promise<{ comment: WorkItemComment }>;
    deleteComment(jwt: string, spaceId: string, commentId: string): Promise<void>;

    // --- Checklists ---
    listChecklists(jwt: string, spaceId: string, itemId: string): Promise<{ checklists: Checklist[] }>;
    createChecklist(jwt: string, spaceId: string, itemId: string, body: { title: string }): Promise<{ checklist: Checklist }>;
    updateChecklist(jwt: string, spaceId: string, checklistId: string, body: { title?: string; sortOrder?: number }): Promise<{ checklist: Checklist }>;
    deleteChecklist(jwt: string, spaceId: string, checklistId: string): Promise<void>;
    createChecklistItem(jwt: string, spaceId: string, checklistId: string, body: { title: string; assigneeId?: string; dueDate?: string }): Promise<{ item: ChecklistItemType }>;
    updateChecklistItem(jwt: string, spaceId: string, itemId: string, body: { title?: string; checked?: boolean; sortOrder?: number; assigneeId?: string | null; dueDate?: string | null }): Promise<{ item: ChecklistItemType }>;
    deleteChecklistItem(jwt: string, spaceId: string, itemId: string): Promise<void>;
    reorderChecklistItems(jwt: string, spaceId: string, checklistId: string, body: { itemIds: string[] }): Promise<void>;
    convertChecklistItem(jwt: string, spaceId: string, itemId: string, body: { boardId: string }): Promise<{ item: WorkItem }>;

    // --- Activity ---
    getSpaceActivity(jwt: string, spaceId: string, params?: { limit?: number; cursor?: string }): Promise<{ entries: ActivityEntry[]; nextCursor: string | null }>;
    getSpaceCalendar(jwt: string, spaceId: string, from: string, to: string): Promise<{ entries: ActivityEntry[] }>;
    getPersonalCalendar(jwt: string, from: string, to: string): Promise<{ entries: ActivityEntry[] }>;
}

export const createProjectGateway = (): ProjectGateway => ({
    // --- Files ---

    listFolders(jwt, spaceId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/folders`, method: 'GET', bearerToken: jwt });
    },
    createFolder(jwt, spaceId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/folders`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    deleteFolder(jwt, spaceId, folderId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/folders/${encodeURIComponent(folderId)}`, method: 'DELETE', bearerToken: jwt });
    },
    listFilesInFolder(jwt, spaceId, folderId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/folders/${encodeURIComponent(folderId)}/files`, method: 'GET', bearerToken: jwt });
    },
    searchFiles(jwt, spaceId, q) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/search?q=${encodeURIComponent(q)}`, method: 'GET', bearerToken: jwt });
    },
    requestUpload(jwt, spaceId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/upload`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    confirmUpload(jwt, spaceId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/confirm-upload`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    getDownloadUrl(jwt, spaceId, fileId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/${encodeURIComponent(fileId)}/download`, method: 'GET', bearerToken: jwt });
    },
    getPreviewUrl(jwt, spaceId, fileId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/${encodeURIComponent(fileId)}/preview`, method: 'GET', bearerToken: jwt });
    },
    deleteFile(jwt, spaceId, fileId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/${encodeURIComponent(fileId)}`, method: 'DELETE', bearerToken: jwt });
    },
    moveFile(jwt, spaceId, fileId, folderId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/${encodeURIComponent(fileId)}/move`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify({ folderId }) });
    },
    getUsage(jwt, spaceId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/files/usage`, method: 'GET', bearerToken: jwt });
    },

    // --- Boards ---

    listBoards(jwt, spaceId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/boards`, method: 'GET', bearerToken: jwt });
    },
    createBoard(jwt, spaceId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/boards`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    listItems(jwt, spaceId, boardId, filters) {
        const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/boards/${encodeURIComponent(boardId)}/items${params}`, method: 'GET', bearerToken: jwt });
    },
    createItem(jwt, spaceId, boardId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/boards/${encodeURIComponent(boardId)}/items`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateItem(jwt, spaceId, itemId, patch) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    moveItem(jwt, spaceId, itemId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}/move`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(body) });
    },
    deleteItem(jwt, spaceId, itemId, reason) {
        // Phase F: Loesch-Begruendung als Pflicht-Body — DSGVO-konforme
        // Nachvollziehbarkeit, fliesst in automatische Berichte ein.
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}`,
            method: 'DELETE',
            bearerToken: jwt,
            body: JSON.stringify({ reason }),
        });
    },
    createItemFromMessage(jwt, spaceId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/from-message`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    getItemsByEvents(jwt, spaceId, eventIds) {
        const qs = `?eventIds=${encodeURIComponent(eventIds.join(','))}`;
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/by-events${qs}`, method: 'GET', bearerToken: jwt });
    },

    // --- Phase 14: Soft-Delete + Reede ---
    listTrash(jwt, spaceId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/trash`, method: 'GET', bearerToken: jwt });
    },
    restoreItem(jwt, spaceId, itemId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}/restore`, method: 'POST', bearerToken: jwt });
    },
    purgeItem(jwt, spaceId, itemId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}/purge`, method: 'POST', bearerToken: jwt });
    },
    parkItem(jwt, spaceId, itemId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}/park`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body ?? {}) });
    },
    reviveItem(jwt, spaceId, itemId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}/revive`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body ?? {}) });
    },

    // --- Documents (space-scoped) ---

    listDocuments(jwt, spaceId, params) {
        const qs = new URLSearchParams();
        if (params?.q) qs.set('q', params.q);
        if (params?.tags) qs.set('tags', params.tags);
        if (params?.folderId) qs.set('folderId', params.folderId);
        if (params?.sort) qs.set('sort', params.sort);
        if (params?.order) qs.set('order', params.order);
        if (params?.cursor) qs.set('cursor', params.cursor);
        if (params?.limit) qs.set('limit', String(params.limit));
        const query = qs.toString() ? `?${qs}` : '';
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents${query}`, method: 'GET', bearerToken: jwt });
    },
    getDocument(jwt, spaceId, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}`, method: 'GET', bearerToken: jwt });
    },
    requestDocumentUpload(jwt, spaceId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/upload`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    confirmDocumentUpload(jwt, spaceId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/confirm-upload`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateDocument(jwt, spaceId, docId, patch) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    deleteDocument(jwt, spaceId, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}`, method: 'DELETE', bearerToken: jwt });
    },
    getDocumentDownloadUrl(jwt, spaceId, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}/download`, method: 'GET', bearerToken: jwt });
    },
    archiveTranscribeDocument(jwt, spaceId, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}/archive-transcribe`, method: 'POST', bearerToken: jwt, body: '{}' });
    },
    getDocumentPreviewUrl(jwt, spaceId, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}/preview`, method: 'GET', bearerToken: jwt });
    },
    toggleDocumentStar(jwt, spaceId, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}/star`, method: 'POST', bearerToken: jwt, body: '{}' });
    },
    toggleDocumentLock(jwt, spaceId, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}/lock`, method: 'POST', bearerToken: jwt, body: '{}' });
    },
    getDocumentUsage(jwt, spaceId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/usage`, method: 'GET', bearerToken: jwt });
    },
    checkDuplicate(jwt, spaceId, hash) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/duplicate-check?hash=${encodeURIComponent(hash)}`, method: 'GET', bearerToken: jwt });
    },
    requestVersionUpload(jwt, spaceId, docId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}/versions`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    confirmVersionUpload(jwt, spaceId, docId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}/versions/confirm`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    getDocumentVersions(jwt, spaceId, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}/versions`, method: 'GET', bearerToken: jwt });
    },
    getDocumentActivity(jwt, spaceId, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/documents/${encodeURIComponent(docId)}/activity`, method: 'GET', bearerToken: jwt });
    },

    // --- Documents (global / cross-space) ---

    listAllDocuments(jwt, params) {
        const qs = new URLSearchParams();
        if (params?.q) qs.set('q', params.q);
        if (params?.tags) qs.set('tags', params.tags);
        if (params?.spaceId) qs.set('spaceId', params.spaceId);
        if (params?.folderId) qs.set('folderId', params.folderId);
        if (params?.starred) qs.set('starred', params.starred);
        if (params?.recent) qs.set('recent', params.recent);
        if (params?.sort) qs.set('sort', params.sort);
        if (params?.order) qs.set('order', params.order);
        if (params?.cursor) qs.set('cursor', params.cursor);
        if (params?.limit) qs.set('limit', String(params.limit));
        const query = qs.toString() ? `?${qs}` : '';
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/documents${query}`, method: 'GET', bearerToken: jwt });
    },
    getDocumentStats(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/documents/stats`, method: 'GET', bearerToken: jwt });
    },
    getAdminOverview(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/documents/admin/overview`, method: 'GET', bearerToken: jwt });
    },
    getTrash(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/documents/admin/trash`, method: 'GET', bearerToken: jwt });
    },
    restoreDocument(jwt, docId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/documents/admin/restore/${encodeURIComponent(docId)}`, method: 'POST', bearerToken: jwt, body: '{}' });
    },
    getTimelineContext(jwt, from, to) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/documents/timeline-context?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, method: 'GET', bearerToken: jwt });
    },

    // --- Tags ---

    listTags(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/tags`, method: 'GET', bearerToken: jwt });
    },
    createTag(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/tags`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateTag(jwt, tagId, patch) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/tags/${encodeURIComponent(tagId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    deleteTag(jwt, tagId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/tags/${encodeURIComponent(tagId)}`, method: 'DELETE', bearerToken: jwt });
    },

    // --- Favorites ---

    listFavorites(jwt, type) {
        const qs = type ? `?type=${type}` : '';
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/favorites${qs}`, method: 'GET', bearerToken: jwt });
    },
    getFavoriteCounts(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/favorites/counts`, method: 'GET', bearerToken: jwt });
    },
    toggleFavorite(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/favorites/toggle`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    removeFavorite(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/favorites/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },

    // --- Saved Filters ---

    listSavedFilters(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/saved-filters`, method: 'GET', bearerToken: jwt });
    },
    createSavedFilter(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/saved-filters`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateSavedFilter(jwt, filterId, patch) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/saved-filters/${encodeURIComponent(filterId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    deleteSavedFilter(jwt, filterId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/saved-filters/${encodeURIComponent(filterId)}`, method: 'DELETE', bearerToken: jwt });
    },

    // --- User Spaces ---

    getUserSpaces(jwt, userId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/users/${encodeURIComponent(userId)}/spaces`, method: 'GET', bearerToken: jwt });
    },

    // --- Family Relations ---
    getUserFamily(jwt, userId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/users/${encodeURIComponent(userId)}/family`, method: 'GET', bearerToken: jwt });
    },
    createFamilyRelation(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/family-relations`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateFamilyRelation(jwt, id, patch) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/family-relations/${encodeURIComponent(id)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    deleteFamilyRelation(jwt, id) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/family-relations/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },

    // --- Contact Tags (eigenständig, getrennt von DMS-Tags) ---
    listContactTags(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-tags`, method: 'GET', bearerToken: jwt });
    },
    createContactTag(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-tags`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateContactTag(jwt, tagId, patch) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-tags/${encodeURIComponent(tagId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    deleteContactTag(jwt, tagId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-tags/${encodeURIComponent(tagId)}`, method: 'DELETE', bearerToken: jwt });
    },
    getContactTags(jwt, userId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/users/${encodeURIComponent(userId)}/tags`, method: 'GET', bearerToken: jwt });
    },
    setContactTags(jwt, userId, tagIds) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/users/${encodeURIComponent(userId)}/tags`, method: 'PUT', bearerToken: jwt, body: JSON.stringify({ tagIds }) });
    },
    addContactTag(jwt, userId, tagId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/users/${encodeURIComponent(userId)}/tags/${encodeURIComponent(tagId)}`, method: 'POST', bearerToken: jwt, body: '{}' });
    },
    removeContactTag(jwt, userId, tagId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/users/${encodeURIComponent(userId)}/tags/${encodeURIComponent(tagId)}`, method: 'DELETE', bearerToken: jwt });
    },

    // --- Contact Groups ---
    listContactGroups(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-groups`, method: 'GET', bearerToken: jwt });
    },
    createContactGroup(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-groups`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateContactGroup(jwt, groupId, patch) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-groups/${encodeURIComponent(groupId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    deleteContactGroup(jwt, groupId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-groups/${encodeURIComponent(groupId)}`, method: 'DELETE', bearerToken: jwt });
    },
    bulkAssignContactGroups(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-groups/bulk-assign`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    bulkRemoveContactGroups(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-groups/bulk-remove`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    bulkAddContactTags(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-tags/bulk-add`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    bulkRemoveContactTags(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-tags/bulk-remove`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },

    // --- Contact Action Batches (Verlauf + Undo) ---
    listContactBatches(jwt, opts) {
        const params = new URLSearchParams();
        if (opts?.limit) params.set('limit', String(opts.limit));
        if (opts?.onlyMine) params.set('onlyMine', '1');
        const qs = params.toString() ? `?${params.toString()}` : '';
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-batches${qs}`, method: 'GET', bearerToken: jwt });
    },
    getContactBatch(jwt, batchId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-batches/${encodeURIComponent(batchId)}`, method: 'GET', bearerToken: jwt });
    },
    undoContactBatch(jwt, batchId, opts) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/contact-batches/${encodeURIComponent(batchId)}/undo`, method: 'POST', bearerToken: jwt, body: JSON.stringify(opts ?? {}) });
    },

    // --- Comments ---

    listComments(jwt, spaceId, itemId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}/comments`, method: 'GET', bearerToken: jwt });
    },
    createComment(jwt, spaceId, itemId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}/comments`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateComment(jwt, spaceId, commentId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/comments/${encodeURIComponent(commentId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(body) });
    },
    deleteComment(jwt, spaceId, commentId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/comments/${encodeURIComponent(commentId)}`, method: 'DELETE', bearerToken: jwt });
    },

    // --- Checklists ---

    listChecklists(jwt, spaceId, itemId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}/checklists`, method: 'GET', bearerToken: jwt });
    },
    createChecklist(jwt, spaceId, itemId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/items/${encodeURIComponent(itemId)}/checklists`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateChecklist(jwt, spaceId, checklistId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/checklists/${encodeURIComponent(checklistId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(body) });
    },
    deleteChecklist(jwt, spaceId, checklistId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/checklists/${encodeURIComponent(checklistId)}`, method: 'DELETE', bearerToken: jwt });
    },
    createChecklistItem(jwt, spaceId, checklistId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/checklists/${encodeURIComponent(checklistId)}/items`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateChecklistItem(jwt, spaceId, itemId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/checklist-items/${encodeURIComponent(itemId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(body) });
    },
    deleteChecklistItem(jwt, spaceId, itemId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/checklist-items/${encodeURIComponent(itemId)}`, method: 'DELETE', bearerToken: jwt });
    },
    reorderChecklistItems(jwt, spaceId, checklistId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/checklists/${encodeURIComponent(checklistId)}/reorder`, method: 'PUT', bearerToken: jwt, body: JSON.stringify(body) });
    },
    convertChecklistItem(jwt, spaceId, itemId, body) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/checklist-items/${encodeURIComponent(itemId)}/convert`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },

    // --- Activity ---

    getSpaceActivity(jwt, spaceId, params) {
        const qs = new URLSearchParams();
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.cursor) qs.set('cursor', params.cursor);
        const query = qs.toString() ? `?${qs}` : '';
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/activity${query}`, method: 'GET', bearerToken: jwt });
    },
    getSpaceCalendar(jwt, spaceId, from, to) {
        const qs = new URLSearchParams({ from, to });
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/calendar?${qs}`, method: 'GET', bearerToken: jwt });
    },
    getPersonalCalendar(jwt, from, to) {
        const qs = new URLSearchParams({ from, to });
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/me/calendar?${qs}`, method: 'GET', bearerToken: jwt });
    },

    getMyTasks(jwt: string, params?: { status?: string; includeDone?: boolean; sort?: string }): Promise<{ items: MyTaskItem[] }> {
        const qs = new URLSearchParams();
        if (params?.status) qs.set('status', params.status);
        if (params?.includeDone) qs.set('includeDone', 'true');
        if (params?.sort) qs.set('sort', params.sort);
        const q = qs.toString() ? `?${qs}` : '';
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `/platform/v1/me/tasks${q}`, method: 'GET', bearerToken: jwt });
    },

    // --- Board Groups ---
    listGroups(jwt: string, spaceId: string, boardId: string): Promise<{ groups: BoardGroup[] }> {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/boards/${encodeURIComponent(boardId)}/groups`, method: 'GET', bearerToken: jwt });
    },
    createGroup(jwt: string, spaceId: string, boardId: string, body: { title: string; color?: string }): Promise<{ group: BoardGroup }> {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/boards/${encodeURIComponent(boardId)}/groups`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateGroup(jwt: string, spaceId: string, groupId: string, patch: Partial<BoardGroup>): Promise<{ group: BoardGroup }> {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/groups/${encodeURIComponent(groupId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    deleteGroup(jwt: string, spaceId: string, groupId: string): Promise<{ success: boolean }> {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: `${base(spaceId)}/groups/${encodeURIComponent(groupId)}`, method: 'DELETE', bearerToken: jwt });
    },
});

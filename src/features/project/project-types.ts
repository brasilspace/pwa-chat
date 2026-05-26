// --- Files ---

export interface FileFolder {
    id: string;
    spaceId: string;
    name: string;
    parentId: string | null;
    sortOrder: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface FileItem {
    id: string;
    spaceId: string;
    folderId: string;
    name: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: string;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface FileVersion {
    id: string;
    fileId: string;
    version: number;
    storageKey: string;
    sizeBytes: number;
    uploadedBy: string;
    createdAt: string;
    downloadUrl?: string | null;
}

export interface StorageUsage {
    usedBytes: number;
    fileCount: number;
    limitBytes: number;
    tierKey: string;
    usagePercent: number;
}

// --- DMS: Documents & Tags ---

export interface Tag {
    id: string;
    label: string;
    slug: string;
    color: string | null;
    createdAt: string;
    documentCount?: number;
}

export interface DocumentItem {
    id: string;
    spaceId: string;
    spaceName?: string;
    title: string;
    description: string | null;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: string;
    fileHash: string | null;
    starred: boolean;
    locked: boolean;
    version: number;
    parentId: string | null;
    lastOpenedAt: string | null;
    expiresAt: string | null;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
    rank?: number;
    highlight?: string;
    tags: Tag[];
    /** Phase 3: Document Type + Custom Fields */
    documentTypeId?: string | null;
    customFields?: Record<string, unknown> | null;
    /** Phase 5: Retention + Legal Hold */
    retentionUntil?: string | null;
    legalHold?: boolean;
    legalHoldReason?: string | null;
    legalHoldBy?: string | null;
    legalHoldAt?: string | null;
    /** Phase 10: Vorlagen */
    isTemplate?: boolean;
    templateCategory?: string | null;
    /** Phase 11: 3-Stufen-Sichtbarkeit (Tenant-Broadcast) */
    visibleToTenant?: boolean;
    /** Phase 12: Folder-System (dms_folders.id) */
    folderId?: string | null;
}

export interface DocumentListResponse {
    documents: DocumentItem[];
    hasMore: boolean;
    cursor?: string;
}

export interface DocumentStats {
    total: number;
    starred: number;
    recent: number;
}

export interface SavedFilter {
    id: string;
    label: string;
    filter: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

// --- Favorites ---

export type FavoriteType = 'space' | 'contact' | 'document' | 'task';

export interface FavoriteItem {
    id: string;
    type: FavoriteType;
    referenceId: string;
    label: string;
    sortOrder: number;
    createdAt: string;
}

export interface FavoriteCounts {
    total: number;
    spaces: number;
    contacts: number;
    documents: number;
    tasks: number;
}

// --- Boards / Tasks ---

export interface BoardColumn {
    key: string;
    label: string;
    color: string;
}

export interface Board {
    id: string;
    spaceId: string;
    name: string;
    type: string;
    config: { columns?: BoardColumn[] };
    sortOrder: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface BoardGroup {
    id: string;
    boardId: string;
    title: string;
    color: string;
    sortOrder: number;
    collapsed: boolean;
}

export interface MyTaskItem extends WorkItem {
    spaceName: string;
    spaceColor: string | null;
    boardName: string;
}

export type WorkItemStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type WorkItemPriority = 'low' | 'medium' | 'high' | 'critical';

export interface WorkItemAttachment {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
}

export interface WorkItemChild {
    id: string;
    title: string;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    assignees: string[];
    dueDate: string | null;
    sortOrder: number;
}

export interface WorkItem {
    id: string;
    spaceId: string;
    boardId: string;
    title: string;
    description: string | null;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    assignees: string[];
    /** Phase 13: Verantwortlicher (single, separat von assignees[]). */
    responsibleUserId: string | null;
    /** Phase 14: Soft-Delete (Papierkorb 30d) — nur in Trash-View sichtbar. */
    deletedAt?: string | null;
    deletedBy?: string | null;
    /** Phase 14: Vertagt — raus aus aktiven Listen, kein Auto-Reede. */
    parkedAt?: string | null;
    parkedBy?: string | null;
    parkedNote?: string | null;
    /** Phase F: Begruendung beim Soft-Delete (Pflicht im Backend). */
    deletionReason?: string | null;
    /** Phase F: Resultat-Dokumentation beim Erledigen.
     *  decision = Beschluss / letter = Schreiben / note = Notiz /
     *  snoozed = aus Reede heraus eingeschlafen / other = Sonstiges */
    completionType?: 'decision' | 'letter' | 'note' | 'snoozed' | 'other' | null;
    completionNote?: string | null;
    completionDocumentId?: string | null;
    completedAt?: string | null;
    completedBy?: string | null;
    startDate: string | null;
    dueDate: string | null;
    sortOrder: number;
    parentId: string | null;
    groupId: string | null;
    group?: { id: string; title: string; color: string } | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    attachments: WorkItemAttachment[];
    children?: WorkItemChild[];
    /** Anzahl Kommentare (vom Backend angereichert) */
    commentCount?: number;
    /** Gesamtzahl Checklist-Items ueber alle Checklisten */
    checklistTotal?: number;
    /** Davon erledigt */
    checklistDone?: number;
}

// --- Comments ---

export interface WorkItemComment {
    id: string;
    workItemId: string;
    content: string;
    mentions: string[];
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

// --- Checklists ---

export interface ChecklistItemType {
    id: string;
    checklistId: string;
    title: string;
    checked: boolean;
    sortOrder: number;
    assigneeId: string | null;
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Checklist {
    id: string;
    workItemId: string;
    title: string;
    sortOrder: number;
    items: ChecklistItemType[];
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

// --- Activity ---

export interface ActivityEntry {
    id: string;
    spaceId: string;
    contentType: string;
    referenceType: string;
    referenceId: string;
    actorId: string;
    actorName?: string;
    title: string;
    body?: string | null;
    metadata: Record<string, unknown>;
    dueDate: string | null;
    startDate: string | null;
    endDate?: string | null;
    occurredAt: string;
}

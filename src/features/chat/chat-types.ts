export interface ChatAttachment {
    msgtype: 'm.image' | 'm.file' | 'm.video' | 'm.audio';
    filename: string;
    mimetype: string;
    size: number;
    mxcUrl: string;
    width?: number;
    height?: number;
    /**
     * Transkription einer Sprachnachricht ("Flurfunk"). Wird vom Backend
     * via reply-Message mit org.prilog.transcript_text gesetzt; der
     * Web-Client ordnet das Reply der Audio-Nachricht zu und kopiert den
     * Text in dieses Feld. Nur fuer m.audio relevant.
     */
    transcript?: string;
    /**
     * Fuer m.video: mxc-URI eines clientseitig generierten Poster-Frames.
     * Entspricht Matrix-Spec info.thumbnail_url. Wird beim Upload von
     * generateVideoThumbnail angelegt und ist ein eigenes m.image-Upload.
     */
    thumbnailMxcUrl?: string;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    /**
     * Lokale blob: URL der gerade hochgeladenen Datei. Nur fuer
     * optimistische Nachrichten gesetzt — der Sender sieht das Bild
     * sofort, unabhaengig davon ob der Server-Thumbnail-Endpoint die
     * Datei schon verarbeitet hat (kann bei HEIC oder grossen Files
     * ein paar Sekunden dauern). Wird nicht persistiert, lebt nur im
     * Client-State waehrend die Nachricht pending ist.
     */
    localBlobUrl?: string;
}

export interface ChatMessage {
    eventId: string;
    sender: string;
    body: string;
    /** HTML aus Matrix formatted_body (format=org.matrix.custom.html). Optional — wenn gesetzt, sollte der Renderer die HTML (sanitisiert) anzeigen. */
    formattedBody?: string;
    timestamp: number;
    pending?: boolean;
    failed?: boolean;
    txnId?: string;
    /** Event-ID of the thread root (set on replies within a thread) */
    threadId?: string;
    /** Event-ID this message directly replies to */
    replyTo?: string;
    /** File/media attachment (m.image, m.file, m.video, m.audio) */
    attachment?: ChatAttachment;
    /**
     * Markiert eine vom Backend gepostete Transkript-Antwort auf eine
     * Sprachnachricht. Wird vom Timeline-Filter ausgeschlossen — der
     * Text wird stattdessen direkt unter die Original-Audio-Bubble
     * gehaengt (Attachment.transcript).
     */
    isTranscriptReply?: boolean;
    /** Event-ID der Audio-Nachricht zu der dieses Reply ein Transkript ist */
    transcriptFor?: string;
    /** Reiner Transkript-Text (ohne 🎙️-Praefix) */
    transcriptText?: string;
}

export interface MemberInfo {
    displayName: string;
    avatarMxc: string | null;
}

/** Emoji reaction on a message: emoji → Set of userIds */
export type Reactions = Map<string, Set<string>>;

export interface RoomState {
    messages: ChatMessage[];
    prevBatch: string | null;
    hasMore: boolean;
    typingUsers: string[];
    members: Map<string, MemberInfo>; // userId -> member info
    reactions: Map<string, Reactions>; // eventId -> emoji -> userIds
    loadingOlder: boolean;
    /** Gesamter ungelesener Zaehler aus Matrix unread_notifications.notification_count. */
    unreadCount: number;
    /** Erwaehnungen des eigenen Users. Treiber fuer rote Badges. */
    highlightCount: number;
}

export interface ChatStoreSnapshot {
    rooms: Map<string, RoomState>;
    /** Maps Matrix userId → roomId for 1:1 direct chats */
    directRooms: Map<string, string>;
    syncState: 'idle' | 'initial' | 'syncing' | 'error';
}

// --- IndexedDB record types ---

export interface DbMessage {
    eventId: string;
    roomId: string;
    sender: string;
    body: string;
    timestamp: number;
    txnId?: string;
    threadId?: string;
    replyTo?: string;
}

export interface DbRoom {
    roomId: string;
    prevBatch: string | null;
    hasMore: boolean;
    members: [string, { displayName: string; avatarMxc: string | null }][]; // serialized Map entries
}

export interface DbSyncState {
    key: 'sync';
    sinceToken: string | null;
    directRooms: [string, string][]; // serialized Map entries
}

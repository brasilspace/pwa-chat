export interface MatrixLoginRequest {
    type: 'm.login.password';
    identifier: {
        type: 'm.id.user';
        user: string;
    };
    password: string;
}

export interface MatrixLoginResponse {
    access_token: string;
    device_id: string;
    user_id: string;
}

export interface MatrixWhoAmIResponse {
    user_id: string;
}

// --- Sync ---

export interface MatrixSyncResponse {
    next_batch: string;
    rooms?: {
        join?: Record<string, MatrixJoinedRoom>;
        invite?: Record<string, { invite_state?: { events?: MatrixTimelineEvent[] } }>;
    };
    account_data?: {
        events?: Array<{ type: string; content: Record<string, unknown> }>;
    };
}

export interface MatrixJoinedRoom {
    timeline?: {
        events: MatrixTimelineEvent[];
        prev_batch?: string;
        limited?: boolean;
    };
    state?: {
        events: MatrixTimelineEvent[];
    };
    ephemeral?: {
        events: MatrixEphemeralEvent[];
    };
    unread_notifications?: {
        notification_count?: number;
        highlight_count?: number;
    };
}

export interface MatrixRelatesTo {
    rel_type?: string;           // 'm.thread', 'm.annotation', etc.
    event_id?: string;           // thread root event ID
    'm.in_reply_to'?: {
        event_id: string;        // direct parent event ID
    };
}

export interface MatrixTimelineEvent {
    event_id: string;
    type: string;
    content: Record<string, unknown> & {
        'm.relates_to'?: MatrixRelatesTo;
    };
    sender: string;
    origin_server_ts: number;
    unsigned?: {
        transaction_id?: string;
        'm.relations'?: Record<string, unknown>;
    };
}

export interface MatrixEphemeralEvent {
    type: string;
    content: Record<string, unknown>;
}

// --- Messages ---

export interface MatrixMessagesResponse {
    start: string;
    end?: string;
    chunk: MatrixTimelineEvent[];
    state?: MatrixTimelineEvent[];
}

export interface MatrixSendResponse {
    event_id: string;
}

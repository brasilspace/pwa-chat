import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createMatrixGateway } from '@/gateways/matrix/matrix-gateway';
import { chatStore } from './chat-store';
import type { ChatMessage } from './chat-types';
import type { MatrixTimelineEvent } from '@/gateways/matrix/matrix-types';
import { logger } from '@/core/logging/logger';
import { generateVideoThumbnail } from './generate-video-thumbnail';
import { uploadFileForChat } from './dms-chat-upload';

const matrixGateway = createMatrixGateway();

let txnCounter = 0;

function parseMessageEvent(event: MatrixTimelineEvent): ChatMessage | null {
    if (event.type !== 'm.room.message') return null;
    const content = event.content as { body?: string; format?: string; formatted_body?: string };
    if (!content.body) return null;

    const rel = event.content['m.relates_to'] as { rel_type?: string; event_id?: string; 'm.in_reply_to'?: { event_id: string } } | undefined;
    const isThread = rel?.rel_type === 'm.thread';

    // formatted_body nur uebernehmen, wenn das Matrix-Format passt
    const formattedBody = content.format === 'org.matrix.custom.html' && content.formatted_body
        ? content.formatted_body
        : undefined;

    return {
        eventId: event.event_id,
        sender: event.sender,
        body: content.body,
        formattedBody,
        timestamp: event.origin_server_ts,
        threadId: isThread ? rel?.event_id : undefined,
        replyTo: rel?.['m.in_reply_to']?.event_id,
    };
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src); };
        img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(img.src); };
        img.src = URL.createObjectURL(file);
    });
}

export function useChatRoom(roomId: string | undefined) {
    const roomState = useSyncExternalStore(
        chatStore.subscribe,
        () => roomId ? chatStore.getRoomState(roomId) : null,
    );

    // Sync state — used to re-trigger DB load after the chat DB is opened.
    // On page reload, useChatRoom fires before openChatDb() completes,
    // so the first loadRoomFromDb call is a no-op (DB not open yet).
    // Once the sync starts, syncState changes to 'initial'/'syncing',
    // which re-triggers this effect and loads messages from IndexedDB.
    const syncState = useSyncExternalStore(
        chatStore.subscribe,
        () => chatStore.getSnapshot().syncState,
    );

    // Load messages from IndexedDB when entering a room with no messages
    useEffect(() => {
        if (roomId) chatStore.loadRoomFromDb(roomId);
    }, [roomId, syncState]);

    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadOlder = useCallback(async () => {
        if (!roomId || !roomState?.prevBatch || roomState.loadingOlder) return;

        const session = sessionStore.getSnapshot();
        const token = session.matrix?.accessToken;
        if (!token) return;

        chatStore.setLoadingOlder(roomId, true);

        try {
            const response = await matrixGateway.getMessages(token, roomId, roomState.prevBatch);
            const messages = response.chunk
                .map(parseMessageEvent)
                .filter((m): m is ChatMessage => m !== null)
                .reverse();

            chatStore.prependMessages(roomId, messages, response.end ?? null);
        } catch (error) {
            logger.error('Failed to load older messages', { error });
            chatStore.setLoadingOlder(roomId, false);
        }
    }, [roomId, roomState?.prevBatch, roomState?.loadingOlder]);

    const sendMessage = useCallback((text: string, html?: string, threadId?: string) => {
        if (!roomId) return;

        const session = sessionStore.getSnapshot();
        const token = session.matrix?.accessToken;
        const userId = session.matrix?.userId;
        if (!token || !userId) return;

        const txnId = `m${Date.now()}.${++txnCounter}`;

        // For thread replies, find the latest message in the thread to set replyTo
        let replyTo: string | undefined;
        if (threadId) {
            const latest = chatStore.getThreadLatestReply(roomId, threadId);
            replyTo = latest?.eventId ?? threadId;
        }

        chatStore.addOptimisticMessage(roomId, {
            eventId: txnId,
            sender: userId,
            body: text,
            formattedBody: html,
            timestamp: Date.now(),
            pending: true,
            txnId,
            threadId,
            replyTo,
        });

        matrixGateway.sendMessage(token, roomId, txnId, text, html, threadId, replyTo)
            .then((response) => {
                chatStore.confirmMessage(roomId, txnId, response.event_id);
            })
            .catch(() => {
                chatStore.failMessage(roomId, txnId);
            });
    }, [roomId]);

    const sendFile = useCallback(async (file: File, spaceId?: string): Promise<{ mxcUri: string } | null> => {
        if (!roomId) return null;

        const session = sessionStore.getSnapshot();
        const matrixToken = session.matrix?.accessToken;
        const platformToken = session.platform?.token;
        const userId = session.matrix?.userId;
        if (!matrixToken || !platformToken || !userId) return null;
        if (!spaceId) {
            logger.warn('sendFile: ohne spaceId nicht moeglich (DMS-Upload braucht Space-Scope)');
            chatStore.failMessage(roomId, `f${Date.now()}.${++txnCounter}`);
            return null;
        }

        const txnId = `f${Date.now()}.${++txnCounter}`;

        // Determine message type
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        const msgtype = isImage ? 'm.image' : isVideo ? 'm.video' : isAudio ? 'm.audio' : 'm.file';

        // Lokale Vorschau-URL fuer Bilder/Videos: damit der Sender das
        // Bild sofort sieht, ohne auf den Server-Roundtrip zu warten.
        const localBlobUrl = (isImage || isVideo) ? URL.createObjectURL(file) : undefined;

        // Optimistic message
        chatStore.addOptimisticMessage(roomId, {
            eventId: txnId,
            sender: userId,
            body: file.name,
            timestamp: Date.now(),
            pending: true,
            txnId,
            attachment: {
                msgtype: msgtype as any,
                filename: file.name,
                mimetype: file.type || 'application/octet-stream',
                size: file.size,
                mxcUrl: '',
                localBlobUrl,
            },
        });

        try {
            // Phase 11: Datei direkt ins DMS (Per-Tenant-S3, Document-Eintrag).
            const dms = await uploadFileForChat(platformToken, spaceId, file);

            const info: Record<string, unknown> = {
                mimetype: file.type || 'application/octet-stream',
                size: file.size,
            };
            let imageDims: { width: number; height: number } | undefined;

            if (isImage) {
                imageDims = await getImageDimensions(file);
                info.w = imageDims.width;
                info.h = imageDims.height;
            }

            // Video-Thumbnail clientseitig erzeugen + als zweites Document-Upload
            // (DMS-Upload), damit Player ein Poster ohne den ganzen Stream rendern kann.
            let videoThumbDocId: string | undefined;
            let videoThumbW: number | undefined;
            let videoThumbH: number | undefined;
            if (isVideo) {
                const thumb = await generateVideoThumbnail(file);
                if (thumb) {
                    try {
                        const thumbFile = new File([thumb.blob], `${file.name}.thumb.jpg`, { type: 'image/jpeg' });
                        const thumbDms = await uploadFileForChat(platformToken, spaceId, thumbFile);
                        videoThumbDocId = thumbDms.documentId;
                        videoThumbW = thumb.width;
                        videoThumbH = thumb.height;
                        info.thumbnail_url = thumbDms.pseudoMxcUrl;
                        info['org.prilog.attachment.thumbnailDocumentId'] = thumbDms.documentId;
                        info.thumbnail_info = {
                            mimetype: 'image/jpeg',
                            size: thumb.blob.size,
                            w: videoThumbW,
                            h: videoThumbH,
                        };
                    } catch (err) {
                        logger.warn('video thumbnail upload failed, sending without poster', { error: err });
                    }
                }
            }

            // Optimistic-Message Update mit der pseudo-mxc-URL — der Renderer
            // erkennt mxc://__prilog__/<docId> und holt die presigned URL.
            chatStore.updateOptimisticAttachment(roomId, txnId, {
                msgtype: msgtype as any,
                filename: file.name,
                mimetype: file.type || 'application/octet-stream',
                size: file.size,
                mxcUrl: dms.pseudoMxcUrl,
                width: imageDims?.width,
                height: imageDims?.height,
                thumbnailMxcUrl: videoThumbDocId ? `mxc://__prilog__/${videoThumbDocId}` : undefined,
                thumbnailWidth: videoThumbW,
                thumbnailHeight: videoThumbH,
                localBlobUrl,
            });

            // Send Matrix-Message mit Pseudo-mxc + Custom-Field
            const content: Record<string, unknown> = {
                msgtype,
                body: file.name,
                filename: file.name,
                url: dms.pseudoMxcUrl,
                info,
                'org.prilog.attachment': {
                    documentId: dms.documentId,
                    storageKey: dms.storageKey,
                    source: 'chat',
                    spaceId,
                },
            };

            const res = await fetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${matrixToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(content),
            });

            if (!res.ok) throw new Error(`Send failed: ${res.status}`);
            const result = await res.json();
            chatStore.confirmMessage(roomId, txnId, result.event_id);
            // dms.pseudoMxcUrl ist die mxc-URI, die im m.audio-Event landet
            // und vom Connector-Hook gesehen wird. Caller (Composer) nutzt
            // sie fuer den Flurfunk-Heartbeat #3 (synapse_upload_done).
            return { mxcUri: dms.pseudoMxcUrl };
        } catch (err) {
            logger.error('Failed to send file', { error: err });
            chatStore.failMessage(roomId, txnId);
            return null;
        }
    }, [roomId]);

    const sendReaction = useCallback((eventId: string, emoji: string) => {
        if (!roomId) return;
        const session = sessionStore.getSnapshot();
        const token = session.matrix?.accessToken;
        const userId = session.matrix?.userId;
        if (!token || !userId) return;

        chatStore.addReaction(roomId, eventId, emoji, userId);

        const txnId = `r${Date.now()}.${++txnCounter}`;
        fetch(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.reaction/${encodeURIComponent(txnId)}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key: emoji } }),
        }).catch(err => logger.error('Failed to send reaction', { error: err }));
    }, [roomId]);

    const sendTyping = useCallback(() => {
        if (!roomId) return;
        const session = sessionStore.getSnapshot();
        const token = session.matrix?.accessToken;
        const userId = session.matrix?.userId;
        if (!token || !userId) return;

        matrixGateway.sendTyping(token, roomId, userId, true).catch(() => {});
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
            matrixGateway.sendTyping(token, roomId, userId, false).catch(() => {});
        }, 4000);
    }, [roomId]);

    // Freemium: Visibility-Cutoff aus Bootstrap. Wenn gesetzt (= ohne Abo,
    // Trial abgelaufen), Messages aelter cutoff ausblenden.
    const session = sessionStore.getSnapshot();
    const cutoffIso = session.bootstrap?.visibilityCutoff;
    const cutoffTs = cutoffIso ? new Date(cutoffIso).getTime() : null;
    const visibleMessages = cutoffTs
        ? (roomState?.messages ?? []).filter(m => m.timestamp >= cutoffTs)
        : (roomState?.messages ?? []);

    return {
        messages: visibleMessages,
        typingUsers: roomState?.typingUsers ?? [],
        reactions: roomState?.reactions ?? new Map(),
        members: roomState?.members ?? new Map(),
        hasMore: roomState?.hasMore ?? false,
        loadingOlder: roomState?.loadingOlder ?? false,
        unreadCount: roomState?.unreadCount ?? 0,
        loadOlder,
        sendMessage,
        sendFile,
        sendReaction,
        sendTyping,
    };
}

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { logger } from '@/core/logging/logger';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import type { WorkItemComment } from './project-types';

const gateway = createProjectGateway();

export function useComments(spaceId: string | undefined, workItemId: string | undefined) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [comments, setComments] = useState<WorkItemComment[]>([]);
    const [loading, setLoading] = useState(false);
    const mountedRef = useRef(true);

    const load = useCallback(async () => {
        if (!jwt || !spaceId || !workItemId) return;
        setLoading(true);
        try {
            const res = await gateway.listComments(jwt, spaceId, workItemId);
            if (mountedRef.current) setComments(res.comments);
        } catch (err) {
            logger.error('Failed to load comments', { error: err });
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [jwt, spaceId, workItemId]);

    useEffect(() => {
        mountedRef.current = true;
        load();
        return () => { mountedRef.current = false; };
    }, [load]);

    // SSE: Auto-Reload bei Aenderungen an Kommentaren dieser Aufgabe
    useWorkflowEvents((event, data) => {
        if (event !== 'comment.changed') return;
        const d = data as { workItemId?: string };
        if (d.workItemId === workItemId) load();
    });

    const createComment = useCallback(async (content: string, mentions: string[] = []) => {
        if (!jwt || !spaceId || !workItemId) return;
        try {
            await gateway.createComment(jwt, spaceId, workItemId, { content, mentions });
            await load();
        } catch (err) {
            logger.error('Create comment failed', { error: err });
            throw err;
        }
    }, [jwt, spaceId, workItemId, load]);

    const updateComment = useCallback(async (commentId: string, content: string, mentions: string[] = []) => {
        if (!jwt || !spaceId) return;
        try {
            await gateway.updateComment(jwt, spaceId, commentId, { content, mentions });
            await load();
        } catch (err) {
            logger.error('Update comment failed', { error: err });
            throw err;
        }
    }, [jwt, spaceId, load]);

    const deleteComment = useCallback(async (commentId: string) => {
        if (!jwt || !spaceId) return;
        setComments(prev => prev.filter(c => c.id !== commentId));
        try {
            await gateway.deleteComment(jwt, spaceId, commentId);
        } catch (err) {
            logger.error('Delete comment failed', { error: err });
            await load();
        }
    }, [jwt, spaceId, load]);

    return { comments, loading, createComment, updateComment, deleteComment, refresh: load };
}

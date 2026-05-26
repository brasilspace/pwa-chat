import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { logger } from '@/core/logging/logger';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import type { Checklist, WorkItem } from './project-types';

const gateway = createProjectGateway();

export function useChecklists(spaceId: string | undefined, workItemId: string | undefined) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [checklists, setChecklists] = useState<Checklist[]>([]);
    const [loading, setLoading] = useState(false);
    const mountedRef = useRef(true);

    const load = useCallback(async () => {
        if (!jwt || !spaceId || !workItemId) return;
        setLoading(true);
        try {
            const res = await gateway.listChecklists(jwt, spaceId, workItemId);
            if (mountedRef.current) setChecklists(res.checklists);
        } catch (err) {
            logger.error('Failed to load checklists', { error: err });
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [jwt, spaceId, workItemId]);

    useEffect(() => {
        mountedRef.current = true;
        load();
        return () => { mountedRef.current = false; };
    }, [load]);

    useWorkflowEvents((event, data) => {
        if (event !== 'checklist.changed') return;
        const d = data as { workItemId?: string };
        if (d.workItemId === workItemId) load();
    });

    const createChecklist = useCallback(async (title: string) => {
        if (!jwt || !spaceId || !workItemId) return;
        try {
            await gateway.createChecklist(jwt, spaceId, workItemId, { title });
            await load();
        } catch (err) {
            logger.error('Create checklist failed', { error: err });
            throw err;
        }
    }, [jwt, spaceId, workItemId, load]);

    const updateChecklist = useCallback(async (checklistId: string, patch: { title?: string; sortOrder?: number }) => {
        if (!jwt || !spaceId) return;
        try {
            await gateway.updateChecklist(jwt, spaceId, checklistId, patch);
            await load();
        } catch (err) {
            logger.error('Update checklist failed', { error: err });
        }
    }, [jwt, spaceId, load]);

    const deleteChecklist = useCallback(async (checklistId: string) => {
        if (!jwt || !spaceId) return;
        setChecklists(prev => prev.filter(c => c.id !== checklistId));
        try {
            await gateway.deleteChecklist(jwt, spaceId, checklistId);
        } catch (err) {
            logger.error('Delete checklist failed', { error: err });
            await load();
        }
    }, [jwt, spaceId, load]);

    const createItem = useCallback(async (checklistId: string, title: string) => {
        if (!jwt || !spaceId) return;
        try {
            await gateway.createChecklistItem(jwt, spaceId, checklistId, { title });
            await load();
        } catch (err) {
            logger.error('Create checklist item failed', { error: err });
            throw err;
        }
    }, [jwt, spaceId, load]);

    const updateItem = useCallback(async (itemId: string, patch: { title?: string; checked?: boolean; assigneeId?: string | null; dueDate?: string | null }) => {
        if (!jwt || !spaceId) return;
        // Optimistic toggle fuer checked
        if (patch.checked !== undefined) {
            setChecklists(prev => prev.map(cl => ({
                ...cl,
                items: cl.items.map(it => it.id === itemId ? { ...it, checked: patch.checked! } : it),
            })));
        }
        try {
            await gateway.updateChecklistItem(jwt, spaceId, itemId, patch);
        } catch (err) {
            logger.error('Update checklist item failed', { error: err });
            await load();
        }
    }, [jwt, spaceId, load]);

    const deleteItem = useCallback(async (itemId: string) => {
        if (!jwt || !spaceId) return;
        setChecklists(prev => prev.map(cl => ({
            ...cl,
            items: cl.items.filter(it => it.id !== itemId),
        })));
        try {
            await gateway.deleteChecklistItem(jwt, spaceId, itemId);
        } catch (err) {
            logger.error('Delete checklist item failed', { error: err });
            await load();
        }
    }, [jwt, spaceId, load]);

    const reorderItems = useCallback(async (checklistId: string, itemIds: string[]) => {
        if (!jwt || !spaceId) return;
        try {
            await gateway.reorderChecklistItems(jwt, spaceId, checklistId, { itemIds });
            await load();
        } catch (err) {
            logger.error('Reorder checklist items failed', { error: err });
        }
    }, [jwt, spaceId, load]);

    const convertToTask = useCallback(async (itemId: string, boardId: string): Promise<WorkItem | null> => {
        if (!jwt || !spaceId) return null;
        try {
            const res = await gateway.convertChecklistItem(jwt, spaceId, itemId, { boardId });
            await load();
            return res.item;
        } catch (err) {
            logger.error('Convert checklist item failed', { error: err });
            return null;
        }
    }, [jwt, spaceId, load]);

    return {
        checklists, loading,
        createChecklist, updateChecklist, deleteChecklist,
        createItem, updateItem, deleteItem,
        reorderItems, convertToTask,
        refresh: load,
    };
}

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { logger } from '@/core/logging/logger';
import type { Board, BoardGroup, WorkItem, WorkItemStatus } from './project-types';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';

const gateway = createProjectGateway();

export function useBoard(spaceId: string | undefined) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [boards, setBoards] = useState<Board[]>([]);
    const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
    const [items, setItems] = useState<WorkItem[]>([]);
    const [groups, setGroups] = useState<BoardGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0] ?? null;

    const loadItems = useCallback(async (boardId: string) => {
        if (!jwt || !spaceId) return;
        try {
            const [itemsRes, groupsRes] = await Promise.all([
                gateway.listItems(jwt, spaceId, boardId),
                gateway.listGroups(jwt, spaceId, boardId),
            ]);
            if (mountedRef.current) {
                setItems(itemsRes.items);
                setGroups(groupsRes.groups);
            }
        } catch (err) {
            logger.error('Failed to load items', { error: err });
        }
    }, [jwt, spaceId]);

    const loadBoards = useCallback(async () => {
        if (!jwt || !spaceId) return;
        setLoading(true);
        try {
            const res = await gateway.listBoards(jwt, spaceId);
            if (!mountedRef.current) return;
            setBoards(res.boards);

            const targetBoard = activeBoardId ? res.boards.find(b => b.id === activeBoardId) : res.boards[0];
            if (targetBoard) {
                setActiveBoardId(targetBoard.id);
                await loadItems(targetBoard.id);
            } else {
                setItems([]);
            }
        } catch (err) {
            logger.error('Failed to load boards', { error: err });
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [jwt, spaceId, activeBoardId, loadItems]);

    useEffect(() => {
        mountedRef.current = true;
        if (session.state === 'ready' && spaceId) loadBoards();
        return () => { mountedRef.current = false; };
    }, [session.state, spaceId, loadBoards]);

    // SSE: Backend pusht 'task.changed' — wenn es im aktiven Space war,
    // lade Items neu.
    useWorkflowEvents((event, data) => {
        if (event !== 'task.changed') return;
        const incomingSpaceId = (data as { spaceId?: string }).spaceId;
        if ((!incomingSpaceId || incomingSpaceId === spaceId) && activeBoard) {
            loadItems(activeBoard.id);
        }
    });

    const setActiveBoard = useCallback((boardId: string) => {
        setActiveBoardId(boardId);
        loadItems(boardId);
    }, [loadItems]);

    const createItem = useCallback(async (data: { title: string; description?: string; status?: WorkItemStatus; priority?: string; assignees?: string[]; dueDate?: string; parentId?: string }) => {
        if (!jwt || !spaceId || !activeBoard) return;
        try {
            await gateway.createItem(jwt, spaceId, activeBoard.id, data);
            await loadItems(activeBoard.id);
        } catch (err) {
            logger.error('Create item failed', { error: err });
            throw err;
        }
    }, [jwt, spaceId, activeBoard, loadItems]);

    const updateItem = useCallback(async (itemId: string, patch: Record<string, unknown>) => {
        if (!jwt || !spaceId) return;
        try {
            await gateway.updateItem(jwt, spaceId, itemId, patch);
            if (activeBoard) await loadItems(activeBoard.id);
        } catch (err) {
            logger.error('Update item failed', { error: err });
        }
    }, [jwt, spaceId, activeBoard, loadItems]);

    const moveItem = useCallback(async (itemId: string, status: WorkItemStatus) => {
        if (!jwt || !spaceId) return;
        // Optimistic update
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, status } : i));
        try {
            await gateway.moveItem(jwt, spaceId, itemId, { status });
        } catch (err) {
            logger.error('Move item failed', { error: err });
            if (activeBoard) await loadItems(activeBoard.id); // revert
        }
    }, [jwt, spaceId, activeBoard, loadItems]);

    const deleteItem = useCallback(async (itemId: string, reason: string) => {
        if (!jwt || !spaceId) return;
        setItems(prev => prev.filter(i => i.id !== itemId));
        try {
            await gateway.deleteItem(jwt, spaceId, itemId, reason);
        } catch (err) {
            logger.error('Delete item failed', { error: err });
            if (activeBoard) await loadItems(activeBoard.id);
        }
    }, [jwt, spaceId, activeBoard, loadItems]);

    const createBoard = useCallback(async (name: string) => {
        if (!jwt || !spaceId) return;
        try {
            const res = await gateway.createBoard(jwt, spaceId, { name });
            await loadBoards();
            setActiveBoardId(res.board.id);
        } catch (err) {
            logger.error('Create board failed', { error: err });
        }
    }, [jwt, spaceId, loadBoards]);

    const createGroup = useCallback(async (title: string, color?: string) => {
        if (!jwt || !spaceId || !activeBoard) return;
        try {
            await gateway.createGroup(jwt, spaceId, activeBoard.id, { title, color });
            await loadItems(activeBoard.id);
        } catch (err) { logger.error('Create group failed', { error: err }); }
    }, [jwt, spaceId, activeBoard, loadItems]);

    const updateGroup = useCallback(async (groupId: string, patch: Partial<BoardGroup>) => {
        if (!jwt || !spaceId) return;
        // Optimistic update for collapse
        if (patch.collapsed !== undefined) {
            setGroups(prev => prev.map(g => g.id === groupId ? { ...g, ...patch } : g));
        }
        try {
            await gateway.updateGroup(jwt, spaceId, groupId, patch);
        } catch (err) { logger.error('Update group failed', { error: err }); }
    }, [jwt, spaceId]);

    const deleteGroup = useCallback(async (groupId: string) => {
        if (!jwt || !spaceId || !activeBoard) return;
        setGroups(prev => prev.filter(g => g.id !== groupId));
        try {
            await gateway.deleteGroup(jwt, spaceId, groupId);
            await loadItems(activeBoard.id);
        } catch (err) { logger.error('Delete group failed', { error: err }); }
    }, [jwt, spaceId, activeBoard, loadItems]);

    return {
        boards, activeBoard, items, groups, loading,
        setActiveBoard, createItem, updateItem, moveItem, deleteItem, createBoard,
        createGroup, updateGroup, deleteGroup,
        refresh: loadBoards,
    };
}

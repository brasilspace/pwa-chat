/**
 * use-sheet-row-tasks — Mapping Zeile → WorkItem (P3.14).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface RowTaskWorkItem {
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    assignees: string[];
}

export interface SheetRowTask {
    id: string;
    sheetId: string;
    worksheetId: string;
    row: number;
    workItemId: string;
    createdBy: string;
    createdAt: string;
    workItem: RowTaskWorkItem | null;
}

export interface BoardOption {
    id: string;
    name: string;
}

const base = env.platformBaseUrl;

export const sheetRowTasksApi = {
    list: (jwt: string, sheetId: string) =>
        requestJson<{ rowTasks: SheetRowTask[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/row-tasks`,
            method: 'GET', bearerToken: jwt,
        }),
    listBoards: (jwt: string, sheetId: string) =>
        requestJson<{ boards: BoardOption[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/boards`,
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, sheetId: string, data: {
        worksheetId: string;
        row: number;
        boardId: string;
        title: string;
        description?: string | null;
        status?: string;
        priority?: string;
        assignees?: string[];
        dueDate?: string | null;
    }) =>
        requestJson<{ rowTask: SheetRowTask; workItem: RowTaskWorkItem }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/rows/task`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    delete: (jwt: string, sheetId: string, worksheetId: string, row: number) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/rows/${row}/task?worksheetId=${encodeURIComponent(worksheetId)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
};

export function useSheetRowTasks(sheetId: string | null) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [rowTasks, setRowTasks] = useState<SheetRowTask[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt || !sheetId) { setLoading(false); return; }
        setLoading(true);
        sheetRowTasksApi.list(jwt, sheetId)
            .then(r => setRowTasks(r.rowTasks))
            .catch(() => setRowTasks([]))
            .finally(() => setLoading(false));
    }, [jwt, sheetId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { rowTasks, loading, refresh };
}

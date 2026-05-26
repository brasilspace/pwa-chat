/**
 * use-sheet-history — Liste der letzten Cell-Aenderungen.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface SheetCellVersion {
    id: string;
    sheetId: string;
    worksheetId: string;
    row: number;
    col: number;
    oldValue: string | null;
    newValue: string | null;
    userId: string;
    changedAt: string;
}

const base = env.platformBaseUrl;

export const sheetHistoryApi = {
    list: (jwt: string, sheetId: string, params?: { limit?: number; worksheetId?: string; row?: number; col?: number }) => {
        const q = new URLSearchParams();
        if (params?.limit) q.set('limit', String(params.limit));
        if (params?.worksheetId) q.set('worksheetId', params.worksheetId);
        if (params?.row !== undefined) q.set('row', String(params.row));
        if (params?.col !== undefined) q.set('col', String(params.col));
        const query = q.toString() ? `?${q}` : '';
        return requestJson<{ versions: SheetCellVersion[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/history${query}`,
            method: 'GET', bearerToken: jwt,
        });
    },
};

export function useSheetHistory(sheetId: string | null, opts?: { autoRefreshMs?: number }) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [versions, setVersions] = useState<SheetCellVersion[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt || !sheetId) { setLoading(false); return; }
        setLoading(true);
        sheetHistoryApi.list(jwt, sheetId, { limit: 200 })
            .then(r => setVersions(r.versions))
            .catch(() => setVersions([]))
            .finally(() => setLoading(false));
    }, [jwt, sheetId]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        if (!opts?.autoRefreshMs) return;
        const t = setInterval(refresh, opts.autoRefreshMs);
        return () => clearInterval(t);
    }, [opts?.autoRefreshMs, refresh]);

    return { versions, loading, refresh };
}

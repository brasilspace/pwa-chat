/**
 * use-sheets — Tabellen-Liste + Create.
 *
 * Sheets sind reguläre DMS-Documents mit fixem mimeType. Lesen/Saven
 * laeuft direkt gegen die Document-Endpoints — fuer Versionen,
 * Aufbewahrung, Sharing.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export const SHEET_MIMETYPE = 'application/vnd.prilog.sheet+json';

export interface SheetSummary {
    id: string;
    title: string;
    description: string | null;
    sizeBytes: number;
    scope: 'SPACE' | 'PERSONAL';
    spaceId: string | null;
    ownerUserId: string | null;
    createdAt: string;
    updatedAt: string;
    uploadedBy: string;
}

const base = env.platformBaseUrl;

export const sheetsApi = {
    list: (jwt: string) =>
        requestJson<{ sheets: SheetSummary[] }>({
            target: 'platform', baseUrl: base,
            path: '/platform/v1/sheets',
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, data: { title: string; scope?: 'PERSONAL' | 'SPACE'; spaceId?: string }) =>
        requestJson<{ sheet: SheetSummary }>({
            target: 'platform', baseUrl: base,
            path: '/platform/v1/sheets',
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    get: (jwt: string, id: string) =>
        requestJson<{ sheet: { id: string; title: string; scope: 'SPACE' | 'PERSONAL'; spaceId: string | null; ownerUserId: string | null; updatedAt: string; role: SheetRole; mode: 'protocol' | null }; workbook: Record<string, unknown> }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(id)}`,
            method: 'GET', bearerToken: jwt,
        }),
    save: (jwt: string, id: string, workbook: Record<string, unknown>) =>
        requestJson<{ sheet: { id: string; updatedAt: string; sizeBytes: number } }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(id)}`,
            method: 'PUT', bearerToken: jwt, body: JSON.stringify({ workbook }),
        }),
    delete: (jwt: string, id: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
    listTemplates: (jwt: string) =>
        requestJson<{ templates: SheetTemplate[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/templates`,
            method: 'GET', bearerToken: jwt,
        }),
    seedTemplates: (jwt: string) =>
        requestJson<{ created: Array<{ key: string; id: string; title: string }>; totalTemplates: number }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/templates/seed`,
            method: 'POST', bearerToken: jwt,
        }),
};

export interface SheetTemplate {
    id: string;
    title: string;
    description: string | null;
    sizeBytes: number;
    templateCategory: string | null;
    createdAt: string;
    uploadedBy: string;
}

export type SheetRole = 'OWNER' | 'EDITOR' | 'COMMENTER' | 'VIEWER';

export interface SheetPermission {
    id: string;
    sheetId: string;
    userId: string;
    role: 'EDITOR' | 'COMMENTER' | 'VIEWER';
    grantedAt: string;
    grantedBy: string;
}

export const sheetPermissionsApi = {
    list: (jwt: string, sheetId: string) =>
        requestJson<{
            permissions: SheetPermission[];
            myRole: SheetRole;
            ownerUserId: string | null;
            scope: 'SPACE' | 'PERSONAL' | null;
            spaceId: string | null;
        }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/permissions`,
            method: 'GET', bearerToken: jwt,
        }),
    grant: (jwt: string, sheetId: string, userId: string, role: 'EDITOR' | 'COMMENTER' | 'VIEWER') =>
        requestJson<{ permission: SheetPermission }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/permissions`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify({ userId, role }),
        }),
    update: (jwt: string, sheetId: string, permissionId: string, role: 'EDITOR' | 'COMMENTER' | 'VIEWER') =>
        requestJson<{ permission: SheetPermission }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/permissions/${encodeURIComponent(permissionId)}`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify({ role }),
        }),
    revoke: (jwt: string, sheetId: string, permissionId: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/permissions/${encodeURIComponent(permissionId)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
};

export function useSheets() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [sheets, setSheets] = useState<SheetSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt) { setLoading(false); return; }
        setLoading(true);
        sheetsApi.list(jwt)
            .then(r => setSheets(r.sheets))
            .catch(() => setSheets([]))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { refresh(); }, [refresh]);

    return { sheets, loading, refresh };
}

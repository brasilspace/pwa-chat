/**
 * use-document-visibility — 3-Stufen-Sichtbarkeit (Tenant-Broadcast +
 * Cross-Space-Share).
 */

import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface DocumentSpaceShare {
    id: string;
    documentId: string;
    spaceId: string;
    sharedBy: string;
    sharedAt: string;
    note: string | null;
    space: { id: string; name: string; color: string | null } | null;
}

export interface IncomingShare {
    shareId: string;
    sharedAt: string;
    sharedBy: string;
    note: string | null;
    document: {
        id: string;
        title: string;
        mimeType: string;
        sizeBytes: number;
        spaceId: string | null;
        scope: string;
        createdAt: string;
        updatedAt: string;
    };
    sourceSpace: { id: string; name: string; color: string | null } | null;
}

const base = env.platformBaseUrl;

export const documentVisibilityApi = {
    setTenantVisibility: (jwt: string, documentId: string, visibleToTenant: boolean) =>
        requestJson<{ document: { id: string; visibleToTenant: boolean } }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/visibility`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify({ visibleToTenant }),
        }),
    listShares: (jwt: string, documentId: string) =>
        requestJson<{ shares: DocumentSpaceShare[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/space-shares`,
            method: 'GET', bearerToken: jwt,
        }),
    addShare: (jwt: string, documentId: string, spaceId: string, note?: string) =>
        requestJson<{ share: DocumentSpaceShare; targetSpace: { id: string; name: string } }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/space-shares`,
            method: 'POST', bearerToken: jwt,
            body: JSON.stringify({ spaceId, note: note?.trim() || undefined }),
        }),
    removeShare: (jwt: string, shareId: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/space-shares/${encodeURIComponent(shareId)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
    listTenantBroadcasts: (jwt: string) =>
        requestJson<{ documents: Array<{
            id: string; title: string; mimeType: string; sizeBytes: number;
            visibleToTenant: boolean; sourceSpace: { id: string; name: string } | null;
        }> }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/tenant-broadcasts`,
            method: 'GET', bearerToken: jwt,
        }),
    incomingShares: (jwt: string, spaceId: string) =>
        requestJson<{ shares: IncomingShare[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/incoming-shares`,
            method: 'GET', bearerToken: jwt,
        }),
};

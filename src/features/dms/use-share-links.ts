/**
 * use-share-links — Public-Share-Links (DMS Phase 6).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface ShareLink {
    id: string;
    slug: string;
    expiresAt: string | null;
    maxViews: number | null;
    views: number;
    watermark: boolean;
    recipientNote: string | null;
    revokedAt: string | null;
    revokedBy: string | null;
    createdBy: string;
    createdAt: string;
    hasPassword: boolean;
}

export interface ShareView {
    id: string;
    shareLinkId: string;
    result: 'granted' | 'denied_password' | 'denied_expired' | 'denied_revoked' | 'denied_max_views' | 'denied_not_found';
    ipAddress: string | null;
    userAgent: string | null;
    recipientEmail: string | null;
    createdAt: string;
}

const base = env.platformBaseUrl;

export const shareLinksApi = {
    list: (jwt: string, documentId: string) =>
        requestJson<{ shares: ShareLink[] }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/documents/${encodeURIComponent(documentId)}/shares`,
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, documentId: string, data: { expiresAt?: string | null; password?: string | null; maxViews?: number | null; watermark?: boolean; recipientNote?: string }) =>
        requestJson<{ share: ShareLink }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/documents/${encodeURIComponent(documentId)}/shares`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    patch: (jwt: string, id: string, data: Partial<{ expiresAt: string | null; password: string | null; maxViews: number | null; watermark: boolean; recipientNote: string }>) =>
        requestJson<{ share: ShareLink }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/shares/${encodeURIComponent(id)}`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify(data),
        }),
    revoke: (jwt: string, id: string) =>
        requestJson<{ ok: boolean }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/shares/${encodeURIComponent(id)}/revoke`,
            method: 'POST', bearerToken: jwt,
        }),
    views: (jwt: string, id: string) =>
        requestJson<{ views: ShareView[] }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/shares/${encodeURIComponent(id)}/views`,
            method: 'GET', bearerToken: jwt,
        }),
};

export function useShareLinks(documentId: string | null) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [shares, setShares] = useState<ShareLink[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt || !documentId) { setLoading(false); return; }
        setLoading(true);
        shareLinksApi.list(jwt, documentId)
            .then(r => setShares(r.shares))
            .catch(() => setShares([]))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { shares, loading, refresh };
}

/** Volle URL zum Public-Link auf dem aktuellen Tenant. */
export function buildPublicShareUrl(slug: string): string {
    return `${window.location.origin}/s/${encodeURIComponent(slug)}`;
}

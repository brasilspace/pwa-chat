/**
 * use-signature-requests — E-Signatur (DMS Phase 9).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface Signature {
    id: string;
    signerEmail: string;
    signerName: string | null;
    status: 'pending' | 'signed' | 'declined';
    invitedAt: string;
    signedAt: string | null;
    declineReason: string | null;
    inviteUrl?: string;
}

export interface SignatureRequest {
    id: string;
    documentId: string;
    title: string | null;
    note: string | null;
    status: 'pending' | 'partially_signed' | 'fully_signed' | 'cancelled' | 'expired';
    expiresAt: string | null;
    cancelledAt: string | null;
    cancelledBy: string | null;
    createdBy: string;
    createdAt: string;
    signatures: Signature[];
}

const base = env.platformBaseUrl;

export const signatureRequestsApi = {
    list: (jwt: string, documentId: string) =>
        requestJson<{ requests: SignatureRequest[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/signature-requests`,
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, documentId: string, data: { signers: Array<{ email: string; name?: string }>; title?: string; note?: string; expiryDays?: number }) =>
        requestJson<{ request: SignatureRequest }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/signature-requests`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    cancel: (jwt: string, id: string) =>
        requestJson<{ ok: boolean }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/signature-requests/${encodeURIComponent(id)}/cancel`,
            method: 'POST', bearerToken: jwt,
        }),
    certificateUrl: (id: string, jwt: string) =>
        `${base}/platform/v1/signature-requests/${encodeURIComponent(id)}/certificate?token=${encodeURIComponent(jwt)}`,
};

export function useSignatureRequests(documentId: string | null) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [requests, setRequests] = useState<SignatureRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt || !documentId) { setLoading(false); return; }
        setLoading(true);
        signatureRequestsApi.list(jwt, documentId)
            .then(r => setRequests(r.requests))
            .catch(() => setRequests([]))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { requests, loading, refresh };
}

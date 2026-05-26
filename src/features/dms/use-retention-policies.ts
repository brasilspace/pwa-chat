/**
 * use-retention-policies — Aufbewahrungs-Regeln (DMS Phase 5).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export type RetentionAction = 'archive' | 'delete' | 'offer';

export interface RetentionPolicy {
    id: string;
    tenantId: string;
    key: string;
    label: string;
    description: string | null;
    durationDays: number;
    triggerField: string;
    actionAfter: RetentionAction;
    legalHoldOverride: boolean;
    createdAt: string;
    updatedAt: string;
    documentTypes?: Array<{ id: string; key: string; label: string }>;
}

export interface ExpiringDoc {
    id: string;
    title: string;
    spaceId: string | null;
    retentionUntil: string;
    legalHold: boolean;
    documentType: string | null;
    retentionPolicy: string | null;
    actionAfter: RetentionAction | null;
}

const base = env.platformBaseUrl;

export const retentionApi = {
    list: (jwt: string) =>
        requestJson<{ policies: RetentionPolicy[] }>({
            target: 'platform', baseUrl: base, path: '/platform/v1/retention-policies',
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, data: { key: string; label: string; description?: string; durationDays: number; triggerField: string; actionAfter: RetentionAction; legalHoldOverride: boolean }) =>
        requestJson<{ policy: RetentionPolicy }>({
            target: 'platform', baseUrl: base, path: '/platform/v1/retention-policies',
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    patch: (jwt: string, id: string, data: Partial<{ label: string; description: string; durationDays: number; triggerField: string; actionAfter: RetentionAction; legalHoldOverride: boolean }>) =>
        requestJson<{ policy: RetentionPolicy }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/retention-policies/${encodeURIComponent(id)}`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify(data),
        }),
    delete: (jwt: string, id: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base, path: `/platform/v1/retention-policies/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
    setLegalHold: (jwt: string, documentId: string, enabled: boolean, reason?: string) =>
        requestJson<{ document: { id: string; legalHold: boolean } }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/documents/${encodeURIComponent(documentId)}/legal-hold`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify({ enabled, reason }),
        }),
    expiring: (jwt: string, horizonDays = 30) =>
        requestJson<{ documents: ExpiringDoc[] }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/documents/expiring?horizonDays=${horizonDays}`,
            method: 'GET', bearerToken: jwt,
        }),
};

export function useRetentionPolicies() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        retentionApi.list(jwt)
            .then(r => setPolicies(r.policies))
            .catch(() => setPolicies([]))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { refresh(); }, [refresh]);

    return { policies, loading, refresh };
}

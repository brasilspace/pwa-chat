/**
 * use-document-types — Document Types + Custom Fields (DMS Phase 3).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export type FieldType = 'text' | 'longtext' | 'number' | 'date' | 'select' | 'money' | 'boolean';

export interface CustomField {
    key: string;
    label: string;
    type: FieldType;
    required?: boolean;
    options?: Array<{ value: string; label: string }>;
    defaultValue?: string | number | boolean;
    helpText?: string;
    /** Phase 7: Regex zum Auto-Befuellen aus document.content. */
    extractionPattern?: string;
}

export interface DocumentType {
    id: string;
    tenantId: string;
    key: string;
    label: string;
    iconEmoji: string | null;
    description: string | null;
    fields: CustomField[];
    sortOrder: number;
    documentCount?: number;
    /** Phase 5: Retention-Policy. Setzt automatisch retentionUntil auf Documents dieses Typs. */
    retentionPolicyId?: string | null;
    createdAt: string;
    updatedAt: string;
}

const base = env.platformBaseUrl;

export const documentTypesApi = {
    list: (jwt: string) =>
        requestJson<{ types: DocumentType[] }>({
            target: 'platform', baseUrl: base, path: '/platform/v1/document-types',
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, data: { key: string; label: string; iconEmoji?: string; description?: string; fields: CustomField[]; retentionPolicyId?: string | null }) =>
        requestJson<{ documentType: DocumentType }>({
            target: 'platform', baseUrl: base, path: '/platform/v1/document-types',
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    patch: (jwt: string, id: string, data: Partial<{ label: string; iconEmoji: string; description: string; fields: CustomField[]; sortOrder: number; retentionPolicyId: string | null }>) =>
        requestJson<{ documentType: DocumentType }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/document-types/${encodeURIComponent(id)}`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify(data),
        }),
    delete: (jwt: string, id: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base, path: `/platform/v1/document-types/${encodeURIComponent(id)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
    setDocumentType: (jwt: string, documentId: string, documentTypeId: string | null, customFields?: Record<string, unknown>) =>
        requestJson<{ document: { id: string; documentTypeId: string | null; customFields: Record<string, unknown> | null } }>({
            target: 'platform', baseUrl: base, path: `/platform/v1/documents/${encodeURIComponent(documentId)}/document-type`,
            method: 'PATCH', bearerToken: jwt, body: JSON.stringify({ documentTypeId, customFields }),
        }),
};

export function useDocumentTypes() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [types, setTypes] = useState<DocumentType[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        documentTypesApi.list(jwt)
            .then(r => setTypes(r.types))
            .catch(() => setTypes([]))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { refresh(); }, [refresh]);

    return { types, loading, refresh };
}

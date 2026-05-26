/**
 * use-dms-templates — DMS-Vorlagen (Phase 10).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface DmsTemplate {
    id: string;
    title: string;
    description: string | null;
    mimeType: string;
    sizeBytes: number;
    templateCategory: string | null;
    createdAt: string;
    uploadedBy: string;
}

export interface InstantiatedDoc { id: string; title: string }

const base = env.platformBaseUrl;

export const dmsTemplatesApi = {
    list: (jwt: string) =>
        requestJson<{ templates: DmsTemplate[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms-templates`,
            method: 'GET', bearerToken: jwt,
        }),
    setTemplate: (jwt: string, documentId: string, isTemplate: boolean, templateCategory?: string | null) =>
        requestJson<{ document: { id: string } }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/template`,
            method: 'PATCH', bearerToken: jwt,
            body: JSON.stringify({ isTemplate, templateCategory: templateCategory ?? null }),
        }),
    instantiate: (jwt: string, templateId: string, data: { title: string; spaceId?: string; scope?: 'PERSONAL' | 'SPACE' }) =>
        requestJson<{ document: InstantiatedDoc }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms-templates/${encodeURIComponent(templateId)}/instantiate`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
};

export function useDmsTemplates() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [templates, setTemplates] = useState<DmsTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt) { setLoading(false); return; }
        setLoading(true);
        dmsTemplatesApi.list(jwt)
            .then(r => setTemplates(r.templates))
            .catch(() => setTemplates([]))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { refresh(); }, [refresh]);

    return { templates, loading, refresh };
}

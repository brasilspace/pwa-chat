/**
 * use-document-relations — Beziehungen zwischen Dokumenten (DMS Phase 4).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export type RelationType = 'BELONGS_TO' | 'RELATED_TO' | 'SUPERSEDES' | 'PART_OF';

export const RELATION_LABELS: Record<RelationType, { outgoing: string; incoming: string; icon: string }> = {
    BELONGS_TO: { outgoing: 'gehört zu', incoming: 'enthält', icon: '↗' },
    RELATED_TO: { outgoing: 'verwandt mit', incoming: 'verwandt mit', icon: '↔' },
    SUPERSEDES: { outgoing: 'ersetzt', incoming: 'ersetzt durch', icon: '⇒' },
    PART_OF:    { outgoing: 'Teil von', incoming: 'enthält', icon: '⊂' },
};

interface DocMeta {
    id: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
    scope: string;
    spaceId: string | null;
}

export interface OutgoingRelation {
    id: string;
    relationType: RelationType;
    note: string | null;
    createdBy: string;
    createdAt: string;
    target: DocMeta;
}

export interface IncomingRelation {
    id: string;
    relationType: RelationType;
    note: string | null;
    createdBy: string;
    createdAt: string;
    source: DocMeta;
}

const base = env.platformBaseUrl;

export const documentRelationsApi = {
    list: (jwt: string, documentId: string) =>
        requestJson<{ outgoing: OutgoingRelation[]; incoming: IncomingRelation[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/relations`,
            method: 'GET', bearerToken: jwt,
        }),
    create: (jwt: string, documentId: string, data: { toId: string; relationType: RelationType; note?: string }) =>
        requestJson<{ relation: { id: string } }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/relations`,
            method: 'POST', bearerToken: jwt, body: JSON.stringify(data),
        }),
    delete: (jwt: string, documentId: string, relationId: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/documents/${encodeURIComponent(documentId)}/relations/${encodeURIComponent(relationId)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
};

export function useDocumentRelations(documentId: string | null) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [outgoing, setOutgoing] = useState<OutgoingRelation[]>([]);
    const [incoming, setIncoming] = useState<IncomingRelation[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt || !documentId) { setLoading(false); return; }
        setLoading(true);
        documentRelationsApi.list(jwt, documentId)
            .then(r => { setOutgoing(r.outgoing); setIncoming(r.incoming); })
            .catch(() => { setOutgoing([]); setIncoming([]); })
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { outgoing, incoming, loading, refresh };
}

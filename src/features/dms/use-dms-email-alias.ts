/**
 * use-dms-email-alias — Mein Fach Email-Adresse (DMS Phase 10).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export interface DmsEmailAlias {
    id: string;
    fullAddress: string;
    enabled: boolean;
    createdAt: string;
    lastReceivedAt: string | null;
}

const base = env.platformBaseUrl;

export const dmsEmailAliasApi = {
    get: (jwt: string) =>
        requestJson<{ alias: DmsEmailAlias | null }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms/email-alias`,
            method: 'GET', bearerToken: jwt,
        }),
    enable: (jwt: string) =>
        requestJson<{ alias: DmsEmailAlias }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms/email-alias/enable`,
            method: 'POST', bearerToken: jwt,
        }),
    disable: (jwt: string) =>
        requestJson<{ alias: DmsEmailAlias }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms/email-alias/disable`,
            method: 'POST', bearerToken: jwt,
        }),
    rotate: (jwt: string) =>
        requestJson<{ alias: DmsEmailAlias }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/dms/email-alias/rotate`,
            method: 'POST', bearerToken: jwt,
        }),
};

export function useDmsEmailAlias() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [alias, setAlias] = useState<DmsEmailAlias | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt) { setLoading(false); return; }
        setLoading(true);
        dmsEmailAliasApi.get(jwt)
            .then(r => setAlias(r.alias))
            .catch(() => setAlias(null))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { refresh(); }, [refresh]);

    return { alias, loading, refresh };
}

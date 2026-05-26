import { useEffect, useState } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

/**
 * Hook fuer die globale Unread-Drop-Anzeige (Welt-Icon-Badge).
 * Polled alle 60s — fuer haeufigere Updates spaeter WebSocket-Push.
 *
 * Liefert 0 wenn nicht eingeloggt oder Backend (noch) nicht erreichbar.
 */
export function useInboxUnread(): number {
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function fetchOnce() {
            const jwt = sessionStore.getSnapshot().platform?.token;
            if (!jwt) return;

            try {
                const res = await requestJson<{ unread: number }>({
                    target: 'platform',
                    baseUrl: env.platformBaseUrl,
                    path: '/platform/v1/personal-fach/inbox?status=new',
                    method: 'GET',
                    bearerToken: jwt,
                });
                if (!cancelled) setUnread(res.unread ?? 0);
            } catch { /* silently ignore — Endpoint kann 404 sein wenn Modul aus */ }
        }

        void fetchOnce();
        const handle = window.setInterval(fetchOnce, 60_000);

        return () => {
            cancelled = true;
            window.clearInterval(handle);
        };
    }, []);

    return unread;
}

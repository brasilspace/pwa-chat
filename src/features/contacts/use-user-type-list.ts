import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { logger } from '@/core/logging/logger';

const platformGateway = createPlatformGateway();
const REFRESH_INTERVAL = 60_000;

/**
 * Liefert die Liste aller im Tenant vorhandenen Benutzertyp-Labels
 * (alphabetisch sortiert, ohne null/leer) sowie den Typ des eingeloggten
 * Benutzers selbst. Basis: /platform/v1/users.
 */
export function useUserTypeList(): { types: string[]; mine: string | null; loading: boolean } {
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const [types, setTypes] = useState<string[]>([]);
    const [mine, setMine] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        const token = snapshot.platform?.token;
        const myUserId = snapshot.matrix?.userId;
        if (snapshot.state !== 'ready' || !token || !myUserId) {
            setTypes([]);
            setMine(null);
            setLoading(false);
            return;
        }

        const load = () => {
            platformGateway
                .getUsers(token)
                .then((res) => {
                    if (!mountedRef.current) return;
                    const uniqueTypes = new Set<string>();
                    let myType: string | null = null;
                    for (const user of res.users) {
                        if (user.userType) uniqueTypes.add(user.userType);
                        if (user.id === myUserId) myType = user.userType ?? null;
                    }
                    setTypes(Array.from(uniqueTypes).sort((a, b) => a.localeCompare(b, 'de')));
                    setMine(myType);
                })
                .catch((err: unknown) => {
                    logger.error('Failed to load user type list', { error: err });
                })
                .finally(() => {
                    if (mountedRef.current) setLoading(false);
                });
        };

        load();
        const interval = setInterval(load, REFRESH_INTERVAL);
        return () => {
            mountedRef.current = false;
            clearInterval(interval);
        };
    }, [snapshot.state, snapshot.platform?.token, snapshot.matrix?.userId]);

    return { types, mine, loading };
}

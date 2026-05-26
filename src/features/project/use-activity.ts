import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { logger } from '@/core/logging/logger';
import type { ActivityEntry } from './project-types';

const gateway = createProjectGateway();

export function useActivity(spaceId: string | undefined) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [entries, setEntries] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(false);
    const cursorRef = useRef<string | null>(null);
    const mountedRef = useRef(true);

    const load = useCallback(async (append = false) => {
        if (!jwt || !spaceId) return;
        if (!append) setLoading(true);
        try {
            const res = await gateway.getSpaceActivity(jwt, spaceId, {
                limit: 50,
                cursor: append ? cursorRef.current ?? undefined : undefined,
            });
            if (!mountedRef.current) return;
            setEntries(prev => append ? [...prev, ...res.entries] : res.entries);
            cursorRef.current = res.nextCursor;
            setHasMore(res.nextCursor !== null);
        } catch (err) {
            logger.error('Failed to load activity', { error: err });
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [jwt, spaceId]);

    useEffect(() => {
        mountedRef.current = true;
        if (session.state === 'ready' && spaceId) load(false);
        return () => { mountedRef.current = false; };
    }, [session.state, spaceId, load]);

    const loadMore = useCallback(() => load(true), [load]);

    return { entries, loading, hasMore, loadMore, refresh: () => load(false) };
}

export function useCalendar(spaceId: string | undefined, from: Date, to: Date) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [entries, setEntries] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        if (session.state !== 'ready' || !jwt || !spaceId) return;

        setLoading(true);
        gateway.getSpaceCalendar(jwt, spaceId, from.toISOString(), to.toISOString())
            .then(res => { if (mountedRef.current) setEntries(res.entries); })
            .catch(err => logger.error('Failed to load calendar', { error: err }))
            .finally(() => { if (mountedRef.current) setLoading(false); });

        return () => { mountedRef.current = false; };
    }, [session.state, jwt, spaceId, from.getTime(), to.getTime()]);

    return { entries, loading };
}

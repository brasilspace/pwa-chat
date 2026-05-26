import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { logger } from '@/core/logging/logger';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';

const platformGateway = createPlatformGateway();

export function useSpaces(): { spaces: SpaceItem[]; loading: boolean; refresh: () => void } {
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const [spaces, setSpaces] = useState<SpaceItem[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        const token = snapshot.platform?.token;
        if (!token) return;

        platformGateway.getSpaces(token)
            .then((res) => setSpaces(res.items))
            .catch((err) => {
                logger.error('Failed to load spaces', { error: err });
            })
            .finally(() => setLoading(false));
    }, [snapshot.platform?.token]);

    // Initial load
    useEffect(() => {
        if (snapshot.state !== 'ready' || !snapshot.platform?.token) {
            setSpaces([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        load();
    }, [snapshot.state, snapshot.platform?.token, load]);

    // SSE: Space-Liste aktualisieren bei space.changed
    useWorkflowEvents(useCallback((eventType: string) => {
        if (eventType === 'space.changed') {
            load();
        }
    }, [load]));

    // Custom-Event: CreateSpacePage feuert nach Space-Erstellung
    useEffect(() => {
        const handler = () => load();
        window.addEventListener('prilog:spaces-changed', handler);
        return () => window.removeEventListener('prilog:spaces-changed', handler);
    }, [load]);

    return { spaces, loading, refresh: load };
}

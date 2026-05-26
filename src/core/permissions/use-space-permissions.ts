import { useEffect, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { spacePermissionCache } from './space-permission-cache';
import type { SpacePermissionSet } from './permission-types';

const platformGateway = createPlatformGateway();

/**
 * Lazily loads and caches space permissions for the given spaceId.
 * Returns null while loading, then the permission set once available.
 *
 * Only fires 1 request per space (deduplicated + cached for 5 min).
 */
export function useSpacePermissions(spaceId: string | undefined): SpacePermissionSet | null {
    // Subscribe to cache updates
    useSyncExternalStore(
        spacePermissionCache.subscribe.bind(spacePermissionCache),
        () => spaceId ? spacePermissionCache.get(spaceId) : null,
    );

    useEffect(() => {
        if (!spaceId) return;

        // Already cached? Nothing to do.
        if (spacePermissionCache.get(spaceId)) return;

        const snapshot = sessionStore.getSnapshot();
        if (!snapshot.platform) return;

        const jwt = snapshot.platform.token;

        spacePermissionCache.load(spaceId, () =>
            platformGateway.getSpacePermissions(jwt, spaceId),
        );
    }, [spaceId]);

    return spaceId ? spacePermissionCache.get(spaceId) : null;
}

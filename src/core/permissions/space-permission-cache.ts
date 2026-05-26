import { logger } from '@/core/logging/logger';
import type { SpacePermission, SpacePermissionSet } from './permission-types';

/** TTL for cached space permissions (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * In-memory cache for space permissions.
 * - Loaded lazily when a space is first visited
 * - Auto-expires after 5 minutes
 * - Single in-flight request per space (deduplication)
 */
class SpacePermissionCache {
    private cache = new Map<string, SpacePermissionSet>();
    private inflight = new Map<string, Promise<SpacePermissionSet>>();
    private listeners = new Set<() => void>();

    /** Get a space's permissions (null if not yet loaded) */
    get(spaceId: string): SpacePermissionSet | null {
        const entry = this.cache.get(spaceId);
        if (!entry) return null;

        // Expire stale entries
        if (Date.now() - entry.loadedAt > CACHE_TTL_MS) {
            this.cache.delete(spaceId);
            return null;
        }

        return entry;
    }

    /** Get the full cache map (for passing to context) */
    getAll(): Map<string, SpacePermissionSet> {
        return this.cache;
    }

    /**
     * Load space permissions, with inflight deduplication.
     * The fetcher is provided by the caller (gateway call).
     */
    async load(
        spaceId: string,
        fetcher: () => Promise<{ permissions: string[]; membershipRole: string }>,
    ): Promise<SpacePermissionSet> {
        // Return cached if fresh
        const cached = this.get(spaceId);
        if (cached) return cached;

        // Deduplicate inflight requests
        const existing = this.inflight.get(spaceId);
        if (existing) return existing;

        const promise = (async (): Promise<SpacePermissionSet> => {
            try {
                const response = await fetcher();
                const entry: SpacePermissionSet = {
                    spaceId,
                    permissions: new Set(response.permissions as SpacePermission[]),
                    membershipRole: response.membershipRole,
                    loadedAt: Date.now(),
                };
                this.cache.set(spaceId, entry);
                this.emit();
                return entry;
            } catch (error) {
                logger.error('Failed to load space permissions', { spaceId });
                // Fallback: grant no permissions but don't block rendering
                const fallback: SpacePermissionSet = {
                    spaceId,
                    permissions: new Set<SpacePermission>(),
                    membershipRole: 'GUEST',
                    loadedAt: Date.now(),
                };
                this.cache.set(spaceId, fallback);
                this.emit();
                return fallback;
            } finally {
                this.inflight.delete(spaceId);
            }
        })();

        this.inflight.set(spaceId, promise);
        return promise;
    }

    /** Invalidate a specific space */
    invalidate(spaceId: string): void {
        this.cache.delete(spaceId);
        this.emit();
    }

    /** Clear everything */
    clear(): void {
        this.cache.clear();
        this.inflight.clear();
        this.emit();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private emit(): void {
        for (const l of this.listeners) l();
    }
}

export const spacePermissionCache = new SpacePermissionCache();

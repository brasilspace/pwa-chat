import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type {
    InstanceCapability,
    ModuleKey,
    PermissionBundle,
    SpacePermission,
    SpacePermissionSet,
} from './permission-types';

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface PermissionContextValue {
    bundle: PermissionBundle;
    /** Get cached space permissions (null if not loaded yet) */
    getSpacePermissions: (spaceId: string) => SpacePermissionSet | null;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

interface PermissionProviderProps {
    bundle: PermissionBundle;
    spacePermissions: Map<string, SpacePermissionSet>;
    children: ReactNode;
}

export function PermissionProvider({ bundle, spacePermissions, children }: PermissionProviderProps) {
    const value = useMemo<PermissionContextValue>(
        () => ({
            bundle,
            getSpacePermissions: (spaceId) => spacePermissions.get(spaceId) ?? null,
        }),
        [bundle, spacePermissions],
    );

    return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function usePermissions(): PermissionContextValue {
    const ctx = useContext(PermissionContext);
    if (!ctx) throw new Error('usePermissions must be used within PermissionProvider');
    return ctx;
}

/**
 * Check if the current user has an instance-level capability.
 *
 * ```tsx
 * const canManageUsers = useCan('manageUsers');
 * ```
 */
export function useCan(capability: InstanceCapability): boolean {
    const { bundle } = usePermissions();
    return bundle.capabilities.has(capability);
}

/**
 * Check multiple capabilities at once. Returns true if ALL are present.
 *
 * ```tsx
 * const canAdmin = useCanAll('manageUsers', 'manageSpaces');
 * ```
 */
export function useCanAll(...capabilities: InstanceCapability[]): boolean {
    const { bundle } = usePermissions();
    return capabilities.every((c) => bundle.capabilities.has(c));
}

/**
 * Check if ANY of the listed capabilities is present.
 */
export function useCanAny(...capabilities: InstanceCapability[]): boolean {
    const { bundle } = usePermissions();
    return capabilities.some((c) => bundle.capabilities.has(c));
}

/**
 * Check if a module is enabled for this instance.
 *
 * ```tsx
 * const hasChat = useModule('chat');
 * ```
 */
export function useModule(key: ModuleKey): boolean {
    const { bundle } = usePermissions();
    return bundle.enabledModules.has(key);
}

/**
 * Get the full set of enabled module keys.
 */
export function useEnabledModules(): Set<ModuleKey> {
    const { bundle } = usePermissions();
    return bundle.enabledModules;
}

/**
 * Check a feature flag.
 */
export function useFeatureFlag(flag: string): boolean {
    const { bundle } = usePermissions();
    return bundle.featureFlags[flag] === true;
}

/**
 * Check a space-level permission.
 * Returns `null` if space permissions aren't loaded yet.
 *
 * ```tsx
 * const canSend = useSpaceCan(spaceId, 'message:create');
 * // null = loading, true/false = resolved
 * ```
 */
export function useSpaceCan(spaceId: string | undefined, permission: SpacePermission): boolean | null {
    const { getSpacePermissions } = usePermissions();
    if (!spaceId) return null;
    const set = getSpacePermissions(spaceId);
    if (!set) return null;
    return set.permissions.has(permission);
}

/**
 * Get the current user's instance role.
 */
export function useInstanceRole() {
    const { bundle } = usePermissions();
    return bundle.instanceRole;
}

/**
 * Get the full permission bundle (for advanced use cases).
 */
export function usePermissionBundle(): PermissionBundle {
    const { bundle } = usePermissions();
    return bundle;
}

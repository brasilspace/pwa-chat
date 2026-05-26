import type { ReactNode } from 'react';
import type { InstanceCapability, ModuleKey, SpacePermission } from '@/core/permissions';
import { useCan, useCanAny, useModule, useSpaceCan } from '@/core/permissions';

/**
 * Conditionally renders children based on instance capability.
 * Renders nothing if the user lacks the capability.
 */
export function CanGate({
    capability,
    children,
    fallback,
}: {
    capability: InstanceCapability;
    children: ReactNode;
    fallback?: ReactNode;
}) {
    const allowed = useCan(capability);
    return <>{allowed ? children : (fallback ?? null)}</>;
}

/**
 * Conditionally renders children based on ANY of the listed capabilities.
 */
export function CanAnyGate({
    capabilities,
    children,
    fallback,
}: {
    capabilities: InstanceCapability[];
    children: ReactNode;
    fallback?: ReactNode;
}) {
    const allowed = useCanAny(...capabilities);
    return <>{allowed ? children : (fallback ?? null)}</>;
}

/**
 * Conditionally renders children if a module is enabled.
 */
export function ModuleGate({
    module: key,
    children,
    fallback,
}: {
    module: ModuleKey;
    children: ReactNode;
    fallback?: ReactNode;
}) {
    const enabled = useModule(key);
    return <>{enabled ? children : (fallback ?? null)}</>;
}

/**
 * Conditionally renders children based on a space-level permission.
 * While loading, renders fallback (or nothing).
 */
export function SpaceCanGate({
    spaceId,
    permission,
    children,
    fallback,
}: {
    spaceId: string | undefined;
    permission: SpacePermission;
    children: ReactNode;
    fallback?: ReactNode;
}) {
    const allowed = useSpaceCan(spaceId, permission);
    // null = still loading → hide
    if (allowed === null || allowed === false) return <>{fallback ?? null}</>;
    return <>{children}</>;
}

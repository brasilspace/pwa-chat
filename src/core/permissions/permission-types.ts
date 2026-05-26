/**
 * Instance-level capabilities (from backend PrilogCapabilityKey).
 * Loaded once at bootstrap — no extra request needed.
 */
export type InstanceCapability =
    | 'viewPortal'
    | 'viewInvoices'
    | 'manageContactData'
    | 'createSupportRequest'
    | 'viewUsers'
    | 'manageUsers'
    | 'manageUserTypes'
    | 'viewSpaces'
    | 'manageSpaces'
    | 'manageModules'
    | 'manageRuntime'
    | 'managePortalAccounts';

/**
 * Space-level permissions (from backend).
 * Loaded once per space on first visit, then cached.
 */
export type SpacePermission =
    | 'space:view'
    | 'space:update'
    | 'space:delete'
    | 'space:capabilities:update'
    | 'room:view'
    | 'room:create'
    | 'room:update'
    | 'room:delete'
    | 'message:read'
    | 'message:create'
    | 'message:delete_own'
    | 'message:delete_any'
    | 'message:moderate'
    | 'file:upload'
    | 'file:download'
    | 'file:delete_own'
    | 'file:delete_any'
    | 'member:list'
    | 'member:invite'
    | 'member:update_status'
    | 'member:remove'
    | 'member:change_role'
    | 'auth:context:read'
    | 'auth:check';

/**
 * Module keys — determines which features are available.
 */
export type ModuleKey = 'chat' | 'files' | 'tasks' | 'calendar' | 'project' | string;

/**
 * Instance role hierarchy (highest to lowest).
 */
export type InstanceRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'GUEST';

/**
 * Complete permission bundle loaded at bootstrap.
 * This is the SINGLE payload — no 300 requests.
 */
export interface PermissionBundle {
    /** Effective instance role for the current user */
    instanceRole: InstanceRole;
    /** Flat set of instance-level capabilities */
    capabilities: Set<InstanceCapability>;
    /** Enabled module keys */
    enabledModules: Set<ModuleKey>;
    /** Feature flags from bootstrap */
    featureFlags: Record<string, boolean>;
}

/**
 * Per-space permission set — loaded lazily, cached in memory.
 */
export interface SpacePermissionSet {
    spaceId: string;
    permissions: Set<SpacePermission>;
    membershipRole: string;
    loadedAt: number;
}

/** Role-to-capabilities mapping (mirroring backend logic) */
const ROLE_CAPABILITIES: Record<InstanceRole, readonly InstanceCapability[]> = {
    GUEST: ['viewPortal', 'createSupportRequest', 'viewSpaces', 'viewUsers'],
    // Schueler, Eltern, Standardnutzer: nur eigene Kontaktdaten, keine globalen Listen, keine Rechnungen.
    MEMBER: ['viewPortal', 'createSupportRequest', 'manageContactData', 'viewSpaces', 'viewUsers'],
    // Lehrkraft: sieht und verwaltet globale Benutzer-/Space-Listen, aber keine Rechnungen.
    MANAGER: ['viewPortal', 'createSupportRequest', 'manageContactData', 'viewUsers', 'viewSpaces', 'manageUsers', 'manageSpaces'],
    // Schulleitung: zusaetzlich Rechnungen, Benutzertypen, Module, Server-Einstellungen.
    ADMIN: ['viewPortal', 'createSupportRequest', 'viewInvoices', 'manageContactData', 'viewUsers', 'viewSpaces', 'manageUsers', 'manageSpaces', 'manageUserTypes', 'manageModules', 'manageRuntime'],
    // Schultraeger / Geschaeftsfuehrung: zusaetzlich Portal-Accounts.
    OWNER: ['viewPortal', 'createSupportRequest', 'viewInvoices', 'manageContactData', 'viewUsers', 'viewSpaces', 'manageUsers', 'manageSpaces', 'manageUserTypes', 'manageModules', 'manageRuntime', 'managePortalAccounts'],
};

/** Map role strings from bootstrap to InstanceRole */
function resolveInstanceRole(roles: string[]): InstanceRole {
    const normalized = roles.map((r) => r.toLowerCase());
    if (normalized.includes('owner')) return 'OWNER';
    if (normalized.includes('admin')) return 'ADMIN';
    if (normalized.includes('manager')) return 'MANAGER';
    if (normalized.includes('member')) return 'MEMBER';
    return 'GUEST';
}

/** Build a PermissionBundle from bootstrap + optional permissions response */
export function buildPermissionBundle(
    roles: string[],
    modules: Array<{ key: string; enabled: boolean }>,
    featureFlags: Record<string, boolean>,
    serverCapabilities?: string[],
): PermissionBundle {
    const instanceRole = resolveInstanceRole(roles);

    // Use server-provided capabilities if available, otherwise derive from role
    const caps: Set<InstanceCapability> = serverCapabilities
        ? new Set(serverCapabilities as InstanceCapability[])
        : new Set(ROLE_CAPABILITIES[instanceRole]);

    const enabledModules = new Set<ModuleKey>(
        modules.filter((m) => m.enabled).map((m) => m.key),
    );

    return { instanceRole, capabilities: caps, enabledModules, featureFlags };
}

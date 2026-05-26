/**
 * Update-Switch — Platform-Gateway (P2 Settings-UI).
 *
 * Backend: /api/platform/v1/workspace/update-switch/*
 */

import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export type UpdateMode =
    | 'continuous'
    | 'auto_stable'
    | 'patch_only'
    | 'manual_approval'
    | 'major_bundle_only'
    | 'frozen'
    | 'pilot';

export type FreezeLevel =
    | 'none'
    | 'frontend_only'
    | 'compatibility_window'
    | 'tenant_box'
    | 'full_instance';

export interface TenantUpdatePolicy {
    id: string;
    tenantId: string;
    updateMode: UpdateMode;
    freezeLevel: FreezeLevel;
    pinnedFrontendReleaseId: string | null;
    pinnedBackendApiVersion: string | null;
    pinnedTenantBoxVersion: string | null;
    pinnedSchemaVersion: string | null;
    allowSecurityUpdates: boolean;
    allowPatchUpdates: boolean;
    allowMinorUpdates: boolean;
    allowMajorUpdates: boolean;
    requireAdminApproval: boolean;
    maintenanceWindow: string | null;
    freezeReason: string | null;
    freezeUntil: string | null;
    lastReviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ReleaseManifest {
    releaseId: string;
    gitSha: string;
    buildTime: string;
    releaseClass: string;
    channel: string;
    frontendVersion: string | null;
    backendApiVersion: string | null;
    tenantBoxVersion: string | null;
    schemaVersion: string | null;
    requiresMigration: boolean;
    migrationType: string;
    releaseNotes: string | null;
    createdAt: string;
}

export interface UpdateAuditEntry {
    id: string;
    tenantId: string;
    action: string;
    oldPolicy: unknown;
    newPolicy: unknown;
    releaseId: string | null;
    actorId: string | null;
    reason: string | null;
    createdAt: string;
}

export interface DesiredReleaseInfo {
    releaseId: string | null;
    reason: string;
}

export interface UpdateSwitchGateway {
    getPolicy(jwt: string): Promise<{ policy: TenantUpdatePolicy }>;
    putPolicy(
        jwt: string,
        patch: Partial<TenantUpdatePolicy> & { reason?: string },
    ): Promise<{ policy: TenantUpdatePolicy }>;
    listAudit(jwt: string): Promise<{ audit: UpdateAuditEntry[] }>;
    listReleases(jwt: string, channel?: string): Promise<{ releases: ReleaseManifest[] }>;
    getLatestRelease(jwt: string, channel?: string): Promise<{ release: ReleaseManifest | null }>;
    getDesiredRelease(jwt: string): Promise<DesiredReleaseInfo>;
}

const B = env.platformBaseUrl;
const P = '/platform/v1/workspace/update-switch';

function qs(params: Record<string, string | undefined>): string {
    const parts = Object.entries(params)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
    return parts.length ? `?${parts.join('&')}` : '';
}

export const createUpdateSwitchGateway = (): UpdateSwitchGateway => ({
    getPolicy(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/policy`, method: 'GET', bearerToken: jwt });
    },
    putPolicy(jwt, patch) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/policy`,
            method: 'PUT',
            bearerToken: jwt,
            body: JSON.stringify(patch),
        });
    },
    listAudit(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/audit`, method: 'GET', bearerToken: jwt });
    },
    listReleases(jwt, channel) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/releases${qs({ channel })}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    getLatestRelease(jwt, channel) {
        return requestJson({
            target: 'platform',
            baseUrl: B,
            path: `${P}/releases/latest${qs({ channel })}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },
    getDesiredRelease(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/desired-release`, method: 'GET', bearerToken: jwt });
    },
});

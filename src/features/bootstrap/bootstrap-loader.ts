import { logger } from '../../core/logging/logger';
import { sessionMachine } from '../../core/session/session-machine';
import { sessionStore } from '../../core/session/session-store';
import { ownProfileStore } from '../../core/session/own-profile-store';
import { createPlatformGateway } from '../../gateways/platform/platform-gateway';

const platformGateway = createPlatformGateway();

export const bootstrapLoader = {
    async load(): Promise<void> {
        const snapshot = sessionStore.getSnapshot();

        if (!snapshot.platform) {
            throw new Error('No platform session available');
        }

        const jwt = snapshot.platform.token;

        // Load bootstrap + permissions in parallel — 2 requests, not 300
        const [bootstrap, permissions] = await Promise.all([
            platformGateway.getBootstrap(jwt),
            platformGateway.getMyPermissions(jwt).catch((err) => {
                // Permissions endpoint may not exist yet — graceful fallback
                logger.warn('Permissions endpoint unavailable, falling back to role-based', { error: err });
                return null;
            }),
        ]);

        if (permissions) {
            sessionStore.setPermissions({
                effectiveInstanceRole: permissions.effectiveInstanceRole,
                capabilities: permissions.capabilities,
                effectivePermissions: permissions.effectivePermissions,
                roleAssignments: permissions.roleAssignments,
                canBroadcast: permissions.canBroadcast ?? false,
                canUseTranscription: permissions.canUseTranscription ?? false,
                whisperAvailable: permissions.whisperAvailable ?? false,
                paymentHealthStatus: permissions.paymentHealthStatus ?? 'ok',
                userTypeKey: permissions.userTypeKey ?? null,
                audience: permissions.audience ?? 'staff',
                visibilityMatrix: permissions.visibilityMatrix ?? null,
            });
        }

        sessionMachine.ready(bootstrap);

        // Eigenes Profil im Hintergrund laden (nach Reload haben wir noch
        // keine Avatar-MXC im Store) — nicht blockierend.
        const matrix = sessionStore.getSnapshot().matrix;
        if (matrix) {
            void ownProfileStore.loadFromMatrix(matrix.accessToken, matrix.userId);
        }

        // Workspace-Switcher: jetzt mit displayName aus dem Bootstrap auch das
        // human-readable Label fuer den aktuellen Tenant nachpflegen.
        if (matrix?.homeserver) {
            const { knownWorkspaces } = await import('../../core/workspaces/known-workspaces-store');
            const tenantName = bootstrap.branding?.tenantName ?? null;
            knownWorkspaces.upsert(matrix.homeserver, tenantName);
        }
    },
};

import { logger } from '../../core/logging/logger';
import { mapError } from '../../core/errors/error-mapper';
import { sessionMachine } from '../../core/session/session-machine';
import { sessionStore } from '../../core/session/session-store';
import { createPlatformGateway } from '../../gateways/platform/platform-gateway';
import { bootstrapLoader } from '../bootstrap/bootstrap-loader';
import type { BootstrapData } from '../../core/session/session-types';

const platformGateway = createPlatformGateway();

const extractHomeserver = (identifier: string, server?: string): { username: string; homeserver: string } => {
    if (identifier.startsWith('@') && identifier.includes(':')) {
        const [, rest] = identifier.split('@');
        const [username, homeserver] = rest.split(':');

        if (!username || !homeserver) {
            throw new Error('Invalid Matrix ID');
        }

        return { username, homeserver };
    }

    if (!server) {
        throw new Error('Homeserver is required when no Matrix ID is provided');
    }

    return { username: identifier, homeserver: server };
};

export interface LoginInput {
    identifier: string;
    password: string;
    server?: string;
}

// Dev-only mock login — bypasses Matrix and Platform auth
const DEV_MODE = import.meta.env.DEV;
const DEV_USER = 'dev';
const DEV_PASSWORD = 'dev';

async function devLogin(): Promise<BootstrapData> {
    logger.info('DEV MODE: Mock-Login aktiv');

    sessionMachine.startMatrixLogin();
    sessionMachine.matrixAuthenticated({
        accessToken: 'dev-matrix-token',
        deviceId: 'dev-device',
        userId: '@lehrer1:test-schule.prilog.team',
        homeserver: 'test-schule.prilog.team',
    });

    sessionMachine.startExchange();
    sessionMachine.platformAuthenticated({
        token: 'dev-platform-jwt',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    const mockBootstrap: BootstrapData = {
        user: {
            matrixUserId: '@lehrer1:test-schule.prilog.team',
            displayName: 'Max Mustermann',
        },
        context: {
            schoolId: 't-test-001',
            orgId: 'ORD-TEST-001',
            roles: ['admin'],
        },
        modules: [
            { key: 'chat', version: '1.0', enabled: true },
            { key: 'files', version: '1.0', enabled: true },
            { key: 'tasks', version: '1.0', enabled: true },
            { key: 'calendar', version: '1.0', enabled: true },
        ],
        branding: {
            tenantName: 'Test-Schule Berlin',
        },
    };

    sessionStore.setPermissions({
        effectiveInstanceRole: 'ADMIN',
        capabilities: [
            'viewPortal', 'viewInvoices', 'manageContactData', 'createSupportRequest',
            'viewUsers', 'manageUsers', 'manageUserTypes', 'viewSpaces', 'manageSpaces',
            'manageModules', 'manageRuntime',
        ],
        effectivePermissions: [],
        roleAssignments: ['admin'],
        canBroadcast: true,
    });

    sessionMachine.ready(mockBootstrap);

    return mockBootstrap;
}

export const authService = {
    async login(input: LoginInput): Promise<BootstrapData> {
        // Dev bypass: user "dev" / password "dev"
        if (DEV_MODE && input.identifier === DEV_USER && input.password === DEV_PASSWORD) {
            return devLogin();
        }

        const { username, homeserver } = extractHomeserver(input.identifier, input.server);

        try {
            // Phase D3: Login geht durchs Backend. Backend prueft Password
            // gegen Prilog-DB, mintet JWT fuer Synapse, holt Matrix-Token,
            // gibt beides in einem Call zurueck. Externe Matrix-Clients
            // koennen sich nicht mehr direkt einloggen.
            sessionMachine.startMatrixLogin();

            const loginResponse = await platformGateway.passwordLogin({
                tenant: homeserver,
                username,
                password: input.password,
                deviceName: 'prilog Chat PWA',
                issueRefreshToken: true,
            });

            // Refresh-Token persistieren — PWAs erwarten lange Sessions.
            if (loginResponse.refreshToken) {
                try {
                    localStorage.setItem('prilog.chat.refreshToken', JSON.stringify({
                        token: loginResponse.refreshToken,
                        expiresAt: loginResponse.refreshTokenExpiresAt,
                        tenant: homeserver,
                        userId: loginResponse.matrixUserId,
                    }));
                } catch { /* ignore */ }
            }

            const matrixSession = {
                accessToken: loginResponse.matrixAccessToken,
                deviceId: '',  // device_id wird vom Backend nicht zurueckgegeben — Sync funktioniert auch ohne
                userId: loginResponse.matrixUserId,
                homeserver,
            };

            sessionMachine.matrixAuthenticated(matrixSession);

            const { knownWorkspaces } = await import('../../core/workspaces/known-workspaces-store');
            knownWorkspaces.upsert(homeserver);

            logger.info('Login successful', { target: 'platform' });

            // Token + expiresIn kommen schon vom Backend mit — kein separater Exchange noetig.
            sessionMachine.startExchange();
            const platformSession = {
                token: loginResponse.token,
                expiresAt: Date.now() + loginResponse.expiresIn * 1000,
            };
            sessionMachine.platformAuthenticated(platformSession);

            // Step 3: Bootstrap
            await bootstrapLoader.load();

            const snapshot = sessionStore.getSnapshot();

            logger.info('Bootstrap complete');

            return snapshot.bootstrap!;
        } catch (error) {
            const mapped = mapError(error);

            logger.error('Login failed', { target: 'platform', path: mapped.reason });

            if (mapped.action === 'logout') {
                sessionMachine.logout();
            } else {
                sessionMachine.invalidate(mapped.reason);
            }

            throw error;
        }
    },
};

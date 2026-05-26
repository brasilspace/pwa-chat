import { sessionStore } from './session-store';
import { ownProfileStore } from './own-profile-store';
import { spacePermissionCache } from '../permissions/space-permission-cache';
import { deleteChatDb } from '@/features/chat/chat-db';
import type { BootstrapData, MatrixSession, PlatformSession } from './session-types';

export const sessionMachine = {
    startMatrixLogin(): void {
        sessionStore.setState('matrix_authenticating');
    },

    matrixAuthenticated(matrix: MatrixSession): void {
        sessionStore.setMatrix(matrix);
        sessionStore.setState('matrix_authenticated');
        // Eigenes Profil im Hintergrund laden, damit Header/Top-Bar sofort
        // ein Avatarbild zeigen koennen — nicht blockierend.
        void ownProfileStore.loadFromMatrix(matrix.accessToken, matrix.userId);
    },

    startExchange(): void {
        sessionStore.setState('platform_exchanging');
    },

    platformAuthenticated(platform: PlatformSession): void {
        sessionStore.setPlatform(platform);
    },

    ready(bootstrap: BootstrapData): void {
        sessionStore.setBootstrap(bootstrap);
        sessionStore.setState('ready');
    },

    markPlatformTokenExpired(): void {
        sessionStore.setState('platform_token_expired');
    },

    startRefresh(): void {
        sessionStore.setState('refreshing_platform_token');
    },

    invalidate(reason: string): void {
        sessionStore.setState('session_invalid', reason);
    },

    logout(): void {
        const userId = sessionStore.getSnapshot().matrix?.userId;
        spacePermissionCache.clear();
        ownProfileStore.clear();
        sessionStore.clear();
        if (userId) deleteChatDb(userId);
    },
};
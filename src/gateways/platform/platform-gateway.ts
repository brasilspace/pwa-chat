import { env } from '../../core/config/env';
import { requestJson } from '../../core/http/http-client';
import type {
    BootstrapResponse,
    ChangesResponse,
    ExchangeRequest,
    ExchangeResponse,
    JobResponse,
    ModulesResponse,
    PermissionsResponse,
    SpaceMembersResponse,
    SpaceMode,
    SpacePermissionsResponse,
    SpaceReadStats,
    SpacesResponse,
} from './platform-types';

export interface PlatformGateway {
    exchangeToken(input: ExchangeRequest): Promise<ExchangeResponse>;
    /**
     * All-in-One Login (Phase D3): Username/Password via Backend, das prueft
     * gegen Prilog-DB und mintet Matrix-Token + Prilog-JWT.
     */
    passwordLogin(input: {
        tenant: string;
        username: string;
        password: string;
        deviceName?: string;
        issueRefreshToken?: boolean;
    }): Promise<{
        token: string;
        expiresIn: number;
        matrixAccessToken: string;
        matrixUserId: string;
        homeserver: string;
        refreshToken?: string;
        refreshTokenExpiresAt?: string;
    }>;
    changePassword(jwt: string, input: { currentPassword: string; newPassword: string }): Promise<void>;
    getBootstrap(jwt: string): Promise<BootstrapResponse>;
    getMyPermissions(jwt: string): Promise<PermissionsResponse>;
    getSpacePermissions(jwt: string, spaceId: string): Promise<SpacePermissionsResponse>;
    getSpaces(jwt: string): Promise<SpacesResponse>;
    updateSpace(jwt: string, spaceId: string, data: Record<string, unknown>): Promise<unknown>;
    getUsers(jwt: string): Promise<{ users: Array<{ id: string; username: string; displayName: string; email: string | null; userType: string | null; showAvatar?: boolean }> }>;
    getProfileVisibility(jwt: string): Promise<{ visibility: Record<string, boolean> }>;
    setProfileVisibility(jwt: string, visibility: Record<string, boolean>): Promise<{ visibility: Record<string, boolean> }>;
    /** Start-View nach Login: dashboard | space | calendar | personal-fach | hub | last-route */
    getStartView(jwt: string): Promise<{ view: string; spaceId: string | null }>;
    setStartView(jwt: string, view: string, spaceId?: string): Promise<{ ok: boolean }>;
    /** Reihenfolge der Dashboard-Boxen pro User */
    getStartLayout(jwt: string): Promise<{ boxes: string[] }>;
    setStartLayout(jwt: string, boxes: string[]): Promise<{ ok: boolean }>;
    /** Tenant-weite Box-Sichtbarkeit (vom Admin gesetzt). */
    getDashboardBoxVisibility(jwt: string): Promise<{ visibility: Record<string, boolean> }>;
    getSpaceMembers(jwt: string, spaceId: string): Promise<SpaceMembersResponse>;
    addSpaceMember(jwt: string, spaceId: string, userId: string, role?: string): Promise<unknown>;
    removeSpaceMember(jwt: string, spaceId: string, userId: string): Promise<void>;
    updateSpaceParent(jwt: string, spaceId: string, parentSpaceId: string | null): Promise<unknown>;
    /** Schaltet einen Space zwischen CHAT und INFOTAFEL um. */
    updateSpaceMode(jwt: string, spaceId: string, data: { mode?: SpaceMode; allowReactions?: boolean; showReadStats?: boolean; disabledTabs?: string[] }): Promise<unknown>;
    /** Meldet, dass der aktuelle User eine Nachricht gelesen hat. */
    markSpaceRead(jwt: string, spaceId: string, eventId: string, eventTs: number): Promise<void>;
    /** Holt Lese-Statistik fuer einen Zeitpunkt. since = unix ms. */
    getSpaceReadStats(jwt: string, spaceId: string, since?: number): Promise<SpaceReadStats>;
    getModules(jwt: string): Promise<ModulesResponse>;
    getChanges(jwt: string, since?: string): Promise<ChangesResponse>;
    getJob(jwt: string, jobId: string): Promise<JobResponse>;
    fetchJson<T = unknown>(jwt: string, path: string): Promise<T>;

    /** Space erstellen */
    createSpace(jwt: string, data: {
        name: string;
        internalName?: string;
        type?: string;
        visibility?: 'PUBLIC' | 'PRIVATE';
        description?: string;
        color?: string;
        parentSpaceId?: string;
    }): Promise<{ space: { id: string; name: string } }>;

    /** Nutzer einladen */
    createInvitation(jwt: string, data: {
        email: string;
        fullName?: string;
        userTypeId?: string;
        requestedSpaceId?: string;
        requestedRole?: string;
        message?: string;
    }): Promise<{ invitation: { id: string; token: string; inviteUrl: string } }>;

    /** Einladungen auflisten */
    getInvitations(jwt: string): Promise<{ invitations: Array<{ id: string; email: string; fullName: string | null; status: string; createdAt: string; inviteUrl: string }> }>;
}

export const createPlatformGateway = (): PlatformGateway => ({
    exchangeToken(input) {
        return requestJson<ExchangeResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/auth/v1/exchange',
            method: 'POST',
            body: JSON.stringify(input),
        });
    },

    passwordLogin(input) {
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/auth/v1/login',
            method: 'POST',
            body: JSON.stringify(input),
        });
    },

    async changePassword(jwt, input) {
        await requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/auth/v1/change-password',
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(input),
        });
    },

    getBootstrap(jwt) {
        return requestJson<BootstrapResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/platform/v1/bootstrap',
            method: 'GET',
            bearerToken: jwt,
        });
    },

    getMyPermissions(jwt) {
        return requestJson<PermissionsResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/platform/v1/permissions/me',
            method: 'GET',
            bearerToken: jwt,
        });
    },

    getSpacePermissions(jwt, spaceId) {
        return requestJson<SpacePermissionsResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/auth/context`,
            method: 'GET',
            bearerToken: jwt,
        });
    },

    getSpaces(jwt) {
        return requestJson<SpacesResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/platform/v1/spaces?pageSize=200',
            method: 'GET',
            bearerToken: jwt,
        });
    },

    updateSpace(jwt, spaceId, data) {
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}`,
            method: 'PATCH',
            bearerToken: jwt,
            body: JSON.stringify(data),
        });
    },

    getProfileVisibility(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: '/platform/v1/profile/visibility', method: 'GET', bearerToken: jwt });
    },
    setProfileVisibility(jwt, visibility) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: '/platform/v1/profile/visibility', method: 'PATCH', bearerToken: jwt, body: JSON.stringify(visibility) });
    },
    getStartView(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: '/platform/v1/dashboard/profile/start-view', method: 'GET', bearerToken: jwt });
    },
    setStartView(jwt, view, spaceId) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: '/platform/v1/dashboard/profile/start-view', method: 'PUT', bearerToken: jwt, body: JSON.stringify({ view, spaceId }) });
    },
    getStartLayout(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: '/platform/v1/dashboard/profile/start-layout', method: 'GET', bearerToken: jwt });
    },
    setStartLayout(jwt, boxes) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: '/platform/v1/dashboard/profile/start-layout', method: 'PUT', bearerToken: jwt, body: JSON.stringify({ boxes }) });
    },
    getDashboardBoxVisibility(jwt) {
        return requestJson({ target: 'platform', baseUrl: env.platformBaseUrl, path: '/platform/v1/dashboard/box-visibility', method: 'GET', bearerToken: jwt });
    },
    getUsers(jwt) {
        return requestJson<{ users: Array<{ id: string; username: string; displayName: string; email: string | null; userType: string | null }> }>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/platform/v1/users',
            method: 'GET',
            bearerToken: jwt,
        });
    },

    getSpaceMembers(jwt, spaceId) {
        return requestJson<SpaceMembersResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/members?pageSize=200`,
            method: 'GET',
            bearerToken: jwt,
        });
    },

    addSpaceMember(jwt, spaceId, userId, role) {
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/members`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(role ? { userId, role } : { userId }),
        });
    },

    removeSpaceMember(jwt, spaceId, userId) {
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}`,
            method: 'DELETE',
            bearerToken: jwt,
        });
    },

    updateSpaceParent(jwt, spaceId, parentSpaceId) {
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/parent`,
            method: 'PATCH',
            bearerToken: jwt,
            body: JSON.stringify({ parentSpaceId }),
        });
    },

    updateSpaceMode(jwt, spaceId, data) {
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/mode`,
            method: 'PATCH',
            bearerToken: jwt,
            body: JSON.stringify(data),
        });
    },

    markSpaceRead(jwt, spaceId, eventId, eventTs) {
        return requestJson<void>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/mark-read`,
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify({ eventId, eventTs }),
        });
    },

    getSpaceReadStats(jwt, spaceId, since) {
        const query = since !== undefined ? `?since=${since}` : '';
        return requestJson<SpaceReadStats>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/read-stats${query}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },

    getModules(jwt) {
        return requestJson<ModulesResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/platform/v1/modules',
            method: 'GET',
            bearerToken: jwt,
        });
    },

    getChanges(jwt, since) {
        const query = since ? `?since=${encodeURIComponent(since)}` : '';

        return requestJson<ChangesResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/changes${query}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },

    getJob(jwt, jobId) {
        return requestJson<JobResponse>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: `/platform/v1/jobs/${encodeURIComponent(jobId)}`,
            method: 'GET',
            bearerToken: jwt,
        });
    },

    fetchJson<T = unknown>(jwt: string, path: string): Promise<T> {
        return requestJson<T>({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path,
            method: 'GET',
            bearerToken: jwt,
        });
    },

    createSpace(jwt, data) {
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/platform/v1/spaces',
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify({
                name: data.name,
                type: data.type ?? 'default',
                visibility: data.visibility ?? 'PRIVATE',
                description: data.description ?? '',
                parentSpaceId: data.parentSpaceId,
            }),
        });
    },

    createInvitation(jwt, data) {
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/platform/v1/invitations',
            method: 'POST',
            bearerToken: jwt,
            body: JSON.stringify(data),
        });
    },

    getInvitations(jwt) {
        return requestJson({
            target: 'platform',
            baseUrl: env.platformBaseUrl,
            path: '/platform/v1/invitations',
            method: 'GET',
            bearerToken: jwt,
        });
    },
});

/**
 * space-governance-gateway — Space-Benutzertyp-Policy (Zutritt).
 * Übernimmt die Portal-Funktion „Erlaubte Benutzertypen" in den
 * Web-Client (Portal-Abbau). Backend-Endpoints existieren bereits
 * (platform-v1, Permission space:update / manageSpaces).
 */
import { requestJson } from '../../core/http/http-client';
import { env } from '../../core/config/env';

export interface TenantUserType {
    id: string;
    key: string;
    label: string;
    description?: string | null;
    sortOrder?: number;
    isDefault?: boolean;
}

export interface SpacePolicy {
    userTypeId: string;
    defaultRole: string;
    source: 'explicit' | 'inherited';
    inheritedFromSpaceId: string | null;
    inheritedFromSpaceName: string | null;
    userType: { id: string; key: string; label: string; description?: string | null };
}

const base = () => ({ target: 'platform' as const, baseUrl: env.platformBaseUrl });

export const spaceGovernanceGateway = {
    /** Alle aktiven Benutzertypen des Tenants (Katalog). */
    listUserTypes(jwt: string): Promise<{ userTypes: TenantUserType[] }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/user-types', method: 'GET', bearerToken: jwt });
    },
    /** Effektive Policy des Space (explizit ∪ vererbt). */
    getSpacePolicies(jwt: string, spaceId: string): Promise<{ policies: SpacePolicy[] }> {
        return requestJson({ ...base(), path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/user-types`, method: 'GET', bearerToken: jwt });
    },
    /** Ersetzt ALLE expliziten Policies des Space (leer = zurück auf Vererbung). */
    setSpacePolicies(
        jwt: string,
        spaceId: string,
        policies: { userTypeId: string; defaultRole?: string | null }[],
    ): Promise<unknown> {
        return requestJson({
            ...base(),
            path: `/platform/v1/spaces/${encodeURIComponent(spaceId)}/user-types`,
            method: 'PUT',
            bearerToken: jwt,
            body: JSON.stringify({ policies }),
        });
    },
};

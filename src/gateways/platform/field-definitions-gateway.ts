/**
 * field-definitions-gateway — CRM-Foundation B (Custom-Felder).
 * Backend: /platform/v1/workspace/field-definitions (Flag-gated, Admin).
 */
import { requestJson } from '../../core/http/http-client';
import { env } from '../../core/config/env';

export type FieldType =
    | 'TEXT' | 'LONGTEXT' | 'NUMBER' | 'DATE' | 'DATETIME' | 'BOOLEAN'
    | 'SELECT' | 'MULTISELECT' | 'PERSON_REF' | 'ORG_REF'
    | 'EMAIL' | 'PHONE' | 'URL' | 'FORMULA' | 'CURRENCY';

export interface FieldDef {
    id: string;
    entityType: string;
    key: string;
    label: Record<string, string>;
    description: Record<string, string>;
    type: FieldType;
    options: { choices?: Array<{ value: string; label: Record<string, string> }> };
    required: boolean;
    unique: boolean;
    visibility: Record<string, unknown>;
    sortOrder: number;
    deprecated: boolean;
}

const base = () => ({ target: 'platform' as const, baseUrl: env.platformBaseUrl });

export const fieldDefinitionsGateway = {
    list(jwt: string): Promise<{ fields: FieldDef[]; crmV2: boolean }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/field-definitions', method: 'GET', bearerToken: jwt });
    },
    create(jwt: string, input: Partial<FieldDef>): Promise<{ field: FieldDef }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/field-definitions', method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    update(jwt: string, id: string, patch: Partial<FieldDef>): Promise<{ field: FieldDef }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/field-definitions/${id}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    deprecate(jwt: string, id: string): Promise<{ success: boolean }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/field-definitions/${id}`, method: 'DELETE', bearerToken: jwt });
    },
    getPersonFields(jwt: string, directoryId: string): Promise<{ crmV2: boolean; customFields: Record<string, unknown>; fields: FieldDef[] }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/users/${directoryId}/custom-fields`, method: 'GET', bearerToken: jwt });
    },
    setPersonFields(jwt: string, directoryId: string, customFields: Record<string, unknown>): Promise<{ success: boolean }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/users/${directoryId}/custom-fields`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify({ customFields }) });
    },
};

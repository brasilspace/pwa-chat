/**
 * view-definitions-gateway — CRM-Foundation C (List-Builder).
 * Backend: /platform/v1/workspace/views (Flag-gated).
 *   list: jeder Member · create/update/delete USER: Member ·
 *   SHARED/SYSTEM mutieren: Workspace-Admin · SYSTEM immutable.
 */
import { requestJson } from '../../core/http/http-client';
import { env } from '../../core/config/env';
import type { ViewDef } from '@/lib/view-engine';

export type { ViewDef } from '@/lib/view-engine';

const base = () => ({ target: 'platform' as const, baseUrl: env.platformBaseUrl });

export interface RolloutGateInfo { eligible: boolean }
export interface ViewCompatInfo { resolvable: boolean; hits: { reasonCode: string }[] }

/**
 * P1.4-Entscheidung (pure, testbar): Soll für die aktive Ansicht statt
 * Liste die „nicht auflösbar"-Meldung gezeigt werden? Nur wenn der
 * P1-Pfad für den Tenant scharf ist UND die Ansicht serverseitig nicht
 * auflösbar — sonst bleibt das bestehende Verhalten unverändert.
 */
export function evalViewBlock(
    gate: RolloutGateInfo,
    compat: ViewCompatInfo,
): { reason: string } | null {
    if (!gate.eligible || compat.resolvable) return null;
    return { reason: compat.hits[0]?.reasonCode ?? 'UNRESOLVABLE' };
}

export const viewDefinitionsGateway = {
    list(jwt: string, entityType = 'person'): Promise<{ crmV2: boolean; views: ViewDef[] }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/views?entityType=${encodeURIComponent(entityType)}`, method: 'GET', bearerToken: jwt });
    },
    create(jwt: string, input: Partial<ViewDef> & { ownerType: ViewDef['ownerType']; name: string }): Promise<{ view: ViewDef }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/views', method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
    },
    update(jwt: string, id: string, patch: Partial<ViewDef>): Promise<{ view: ViewDef }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/views/${id}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    remove(jwt: string, id: string): Promise<{ success: boolean }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/views/${id}`, method: 'DELETE', bearerToken: jwt });
    },
    clone(jwt: string, id: string, name?: string): Promise<{ view: ViewDef }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/views/${id}/clone`, method: 'POST', bearerToken: jwt, body: JSON.stringify({ name }) });
    },
    /** P1.4: Rollout-Gate-Status für den Tenant (read-only). */
    rolloutGate(jwt: string): Promise<{
        eligible: boolean; scanned: boolean; enabled: boolean;
        viewUnusable: number | null; viewsTotal: number | null;
        scannedAt: string | null; reason: string;
    }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/segments/rollout-gate', method: 'GET', bearerToken: jwt });
    },
    /** P1.4: Einzel-View-Kompatibilität gegen die Server-Logik (read-only). */
    viewCompat(jwt: string, viewId: string): Promise<{
        viewId: string; viewName: string; resolvable: boolean;
        category: 'auto_trivial' | 'needs_owner_action' | 'view_unusable' | null;
        hits: { filterIndex: number; field: string; op: string; reasonCode: string; category: string }[];
    }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/segments/view-compat/${encodeURIComponent(viewId)}`, method: 'GET', bearerToken: jwt });
    },
    serienbrief(jwt: string, viewId: string, template: string, name: string): Promise<{ count: number; samples: { personId: string; name: string; text: string }[] }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/serienbrief', method: 'POST', bearerToken: jwt, body: JSON.stringify({ viewId, template, name }) });
    },
};

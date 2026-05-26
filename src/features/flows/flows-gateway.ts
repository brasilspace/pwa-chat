/**
 * Flows-Gateway — Process-Engine API client (Phase 5).
 *
 * Spricht /api/platform/v1/process/* an. Drittanbieter-Aequivalent fuer
 * Schul-Admins die ihre eigenen Workflows anlegen wollen.
 */

import { env } from '../../core/config/env';
import { requestJson } from '../../core/http/http-client';

export type AppKind = 'flow' | 'concept' | 'crisis' | 'n8n' | 'custom' | 'guide';

export interface ProcessTemplate {
    id: string;
    tenantId: string;
    appKind: AppKind;
    name: string;
    description: string | null;
    status: 'draft' | 'active' | 'archived';
    version: number;
    metadata: Record<string, unknown>;
    sortOrder: number;
    showOnDashboard?: boolean;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProcessComponent {
    id: string;
    templateId: string;
    kind: string;
    label: string;
    config: Record<string, unknown>;
    position: { x: number; y: number; width?: number; height?: number } | null;
    sortOrder: number;
    groupId: string | null;
}

export type EdgeCondition =
    | { type: 'always' }
    | { type: 'if'; expr: Record<string, unknown> }
    | { type: 'delay'; ms: number };

export interface ProcessEdge {
    id: string;
    templateId: string;
    sourceId: string;
    targetId: string;
    condition: EdgeCondition | null;
    label: string | null;
    sortOrder: number;
}

export interface ProcessTemplateDetail {
    template: ProcessTemplate & { components: ProcessComponent[]; edges: ProcessEdge[] };
}

/** Property-Field-Schema — Backend liefert dies pro Component-Kind, Web-Client
 *  rendert generische Formulare ohne Kind-spezifischen Code. */
export type PropertyField =
    | { key: string; type: 'text'; label: string; placeholder?: string; required?: boolean; helpText?: string }
    | { key: string; type: 'longtext'; label: string; rows?: number; placeholder?: string; helpText?: string }
    | { key: string; type: 'number'; label: string; min?: number; max?: number; step?: number; helpText?: string }
    | { key: string; type: 'boolean'; label: string; helpText?: string }
    | { key: string; type: 'select'; label: string; options: Array<{ value: string; label: string }>; helpText?: string }
    | { key: string; type: 'string-array'; label: string; placeholder?: string; helpText?: string }
    | { key: string; type: 'choice-options'; label: string; helpText?: string }
    | { key: string; type: 'screen-ref'; label: string; helpText?: string }
    | { key: string; type: 'json'; label: string; rows?: number; helpText?: string }
    | { key: string; type: 'color'; label: string; helpText?: string }
    /** Datei-URL: Text-Input + "Aus DMS waehlen"-Button → prilog://file/<id> */
    | { key: string; type: 'file-url'; label: string; placeholder?: string; helpText?: string };

export interface ComponentKindDesigner {
    icon: string;
    color: string;
    description?: string;
    defaultConfig?: Record<string, unknown>;
    propertiesSchema?: PropertyField[];
    canBeRoot?: boolean;
}

export interface ComponentKind {
    key: string;
    appKind: AppKind;
    label: string;
    designer?: ComponentKindDesigner | null;
}

/** App-Metadaten zur Sektion-Anzeige im KindPicker. */
export interface AppMeta {
    appKind: AppKind;
    displayName: string;
    moduleKey: string | null;
    isSystemApp: boolean;
}

export interface ProcessInstance {
    id: string;
    templateId: string;
    tenantId: string;
    status: 'pending' | 'active' | 'paused' | 'completed' | 'aborted';
    startedAt: string;
    completedAt: string | null;
    startedBy: string;
    inputData: Record<string, unknown> | null;
    data: Record<string, unknown>;
}

export interface ProcessComponentState {
    id: string;
    instanceId: string;
    componentId: string;
    status: 'pending' | 'active' | 'completed' | 'skipped' | 'failed';
    startedAt: string | null;
    completedAt: string | null;
    output: Record<string, unknown> | null;
    assignedTo: string | null;
}

export interface ProcessEvent {
    id: string;
    instanceId: string;
    type: string;
    actorId: string | null;
    componentId: string | null;
    payload: Record<string, unknown> | null;
    createdAt: string;
}

export interface ProcessInstanceState {
    instance: ProcessInstance;
    componentStates: ProcessComponentState[];
}

export function createFlowsGateway() {
    const base = env.platformBaseUrl;

    return {
        listTemplates(jwt: string, appKind?: AppKind) {
            const query = appKind ? `?appKind=${encodeURIComponent(appKind)}` : '';
            return requestJson<{ templates: ProcessTemplate[] }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/templates${query}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        getTemplate(jwt: string, id: string) {
            return requestJson<ProcessTemplateDetail>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/templates/${encodeURIComponent(id)}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        createTemplate(jwt: string, data: { appKind: AppKind; name: string; description?: string }) {
            return requestJson<{ template: ProcessTemplate }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/process/templates',
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify(data),
            });
        },

        updateTemplate(jwt: string, id: string, patch: Partial<{ name: string; description: string | null; status: 'draft' | 'active' | 'archived'; showOnDashboard: boolean }>) {
            return requestJson<{ template: ProcessTemplate }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/templates/${encodeURIComponent(id)}`,
                method: 'PUT', bearerToken: jwt,
                body: JSON.stringify(patch),
            });
        },

        /** Soft-Delete: setzt Status auf 'archived'. Audit bleibt erhalten. */
        deleteTemplate(jwt: string, id: string) {
            return requestJson<void>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/templates/${encodeURIComponent(id)}`,
                method: 'DELETE', bearerToken: jwt,
            });
        },

        /** Hard-Delete: endgueltig. Backend verlangt status='archived'. */
        hardDeleteTemplate(jwt: string, id: string) {
            return requestJson<void>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/templates/${encodeURIComponent(id)}/hard`,
                method: 'DELETE', bearerToken: jwt,
            });
        },

        addComponent(jwt: string, templateId: string, data: { kind: string; label: string; config?: Record<string, unknown>; position?: { x: number; y: number }; sortOrder?: number }) {
            return requestJson<{ component: ProcessComponent }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/templates/${encodeURIComponent(templateId)}/components`,
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify(data),
            });
        },

        updateComponent(jwt: string, componentId: string, patch: Partial<{ label: string; config: Record<string, unknown>; position: { x: number; y: number }; sortOrder: number }>) {
            return requestJson<{ component: ProcessComponent }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/components/${encodeURIComponent(componentId)}`,
                method: 'PUT', bearerToken: jwt,
                body: JSON.stringify(patch),
            });
        },

        deleteComponent(jwt: string, componentId: string) {
            return requestJson<void>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/components/${encodeURIComponent(componentId)}`,
                method: 'DELETE', bearerToken: jwt,
            });
        },

        addEdge(jwt: string, templateId: string, data: { sourceId: string; targetId: string; condition?: EdgeCondition; label?: string }) {
            return requestJson<{ edge: ProcessEdge }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/templates/${encodeURIComponent(templateId)}/edges`,
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify(data),
            });
        },

        deleteEdge(jwt: string, edgeId: string) {
            return requestJson<void>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/edges/${encodeURIComponent(edgeId)}`,
                method: 'DELETE', bearerToken: jwt,
            });
        },

        listKinds(jwt: string) {
            return requestJson<{ kinds: ComponentKind[]; apps: AppMeta[] }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/process/components/kinds',
                method: 'GET', bearerToken: jwt,
            });
        },

        listInstances(jwt: string, templateId: string) {
            return requestJson<{ instances: ProcessInstance[] }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/templates/${encodeURIComponent(templateId)}/instances`,
                method: 'GET', bearerToken: jwt,
            });
        },

        startInstance(jwt: string, templateId: string, inputData?: Record<string, unknown>) {
            return requestJson<{ instance: ProcessInstance }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/process/instances',
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ templateId, inputData: inputData ?? {} }),
            });
        },

        getInstanceState(jwt: string, instanceId: string) {
            return requestJson<ProcessInstanceState>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/instances/${encodeURIComponent(instanceId)}/state`,
                method: 'GET', bearerToken: jwt,
            });
        },

        getInstanceEvents(jwt: string, instanceId: string) {
            return requestJson<{ events: ProcessEvent[] }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/instances/${encodeURIComponent(instanceId)}/events`,
                method: 'GET', bearerToken: jwt,
            });
        },

        cloneTemplate(jwt: string, id: string, opts?: { name?: string; bumpVersion?: boolean }) {
            return requestJson<{ template: ProcessTemplate }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/process/templates/${encodeURIComponent(id)}/clone`,
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify(opts ?? {}),
            });
        },

        async exportTemplate(jwt: string, id: string): Promise<{ blob: Blob; filename: string }> {
            const res = await fetch(`${base}/platform/v1/process/templates/${encodeURIComponent(id)}/export`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${jwt}` },
            });
            if (!res.ok) throw new Error(`Export fehlgeschlagen: HTTP ${res.status}`);
            const blob = await res.blob();
            const cd = res.headers.get('Content-Disposition') ?? '';
            const m = /filename="([^"]+)"/.exec(cd);
            return { blob, filename: m?.[1] ?? 'flow.json' };
        },

        importTemplate(jwt: string, payload: Record<string, unknown>) {
            return requestJson<{ template: ProcessTemplate; componentsImported: number; edgesImported: number }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/process/templates/import',
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify(payload),
            });
        },
    };
}

export const flowsGateway = createFlowsGateway();

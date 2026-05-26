/**
 * Concept Framework Gateway — Web-Client
 */

import { env } from '../../core/config/env';
import { requestJson } from '../../core/http/http-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConceptTemplate {
    id: string;
    key: string;
    name: string;
    description: string | null;
    icon: string | null;
    category: string;
    version: number;
    status: string;
    bausteine: Array<{ key: string; label: string }>;
    monthlyPriceCents: number;
    isSystem: boolean;
}

export interface ConceptInstance {
    id: string;
    tenantId: string;
    templateId: string;
    name: string;
    status: string;
    activatedBy: string;
    activatedAt: string;
    archivedAt: string | null;
    config: Record<string, unknown>;
    template?: { key: string; name: string; icon: string | null; category: string };
    bausteine?: ConceptBaustein[];
}

export interface ConceptBaustein {
    id: string;
    instanceId: string;
    bausteinKey: string;
    sortOrder: number;
    config: Record<string, unknown>;
    dmsFolderId: string | null;
    calendarLayerId: string | null;
    boardId: string | null;
    matrixRoomId: string | null;
    workflowTemplateId: string | null;
    cascadeBoardId: string | null;
    richTextContent: string | null;
}

export interface BausteinDefinition {
    key: string;
    defaultLabel: string;
    icon: string;
    description: string;
    sortOrder: number;
}

// ─── Gateway ─────────────────────────────────────────────────────────────────

export function createConceptGateway() {
    const base = env.platformBaseUrl;

    return {
        getTemplates(jwt: string) {
            return requestJson<{ items: ConceptTemplate[] }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/concepts/templates',
                method: 'GET', bearerToken: jwt,
            });
        },

        getTemplate(jwt: string, key: string) {
            return requestJson<{ template: ConceptTemplate }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/concepts/templates/${key}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        getBausteinDefinitions(jwt: string) {
            return requestJson<{ items: BausteinDefinition[] }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/concepts/baustein-definitions',
                method: 'GET', bearerToken: jwt,
            });
        },

        getInstances(jwt: string, status?: string) {
            const qs = status ? `?status=${status}` : '';
            return requestJson<{ items: ConceptInstance[] }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/concepts/instances${qs}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        getInstance(jwt: string, id: string) {
            return requestJson<{ instance: ConceptInstance }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/concepts/instances/${id}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        activateConcept(jwt: string, templateId: string, name?: string) {
            return requestJson<{ instance: ConceptInstance }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/concepts/instances',
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ templateId, name }),
            });
        },

        archiveConcept(jwt: string, instanceId: string) {
            return requestJson<{ instance: ConceptInstance }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/concepts/instances/${instanceId}/archive`,
                method: 'POST', bearerToken: jwt, body: '{}',
            });
        },

        getBaustein(jwt: string, instanceId: string, key: string) {
            return requestJson<{ baustein: ConceptBaustein }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/concepts/instances/${instanceId}/bausteine/${key}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        updateBaustein(jwt: string, instanceId: string, key: string, data: { richTextContent?: string; config?: Record<string, unknown>; workflowTemplateId?: string; cascadeBoardId?: string; calendarLayerId?: string | null }) {
            return requestJson<{ baustein: ConceptBaustein }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/concepts/instances/${instanceId}/bausteine/${key}`,
                method: 'PUT', bearerToken: jwt,
                body: JSON.stringify(data),
            });
        },
        // ─── Evaluation ─────────────────────────────────────────────

        // ─── Reports ─────────────────────────────────────────────

        getReports(jwt: string) {
            return requestJson<{ items: Array<{ id: string; title: string; runId: string; createdAt: string }> }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/workflow/reports',
                method: 'GET', bearerToken: jwt,
            });
        },

        getReport(jwt: string, reportId: string) {
            return requestJson<{ report: { id: string; title: string; htmlContent: string; runId: string; createdAt: string } }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/reports/${reportId}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        getReportHtmlUrl(reportId: string) {
            return `${base}/platform/v1/workflow/reports/${reportId}/html`;
        },

        // ─── Evaluation ─────────────────────────────────────────────

        getEvaluationKpis(jwt: string, instanceId: string) {
            return requestJson<{
                kpis: EvaluationKpis;
                activityTimeline: Array<{ date: string; count: number }>;
            }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/concepts/instances/${instanceId}/evaluation/kpis`,
                method: 'GET', bearerToken: jwt,
            });
        },

        getEvaluationOverview(jwt: string) {
            return requestJson<{ items: EvaluationOverviewItem[] }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/concepts/evaluation/overview',
                method: 'GET', bearerToken: jwt,
            });
        },
    };
}

// ─── Evaluation Types ────────────────────────────────────────────────────────

export interface EvaluationKpis {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    activeRuns: number;
    slaBreachedRuns: number;
    avgCompletionMinutes: number | null;
    totalCheckpoints: number;
    confirmedCheckpoints: number;
    rejectedCheckpoints: number;
    confirmationRate: number | null;
    avgCheckpointResponseMinutes: number | null;
    formResponseCount: number;
    bausteinCompletionPercent: number;
    bausteinStatus: Array<{ key: string; hasContent: boolean }>;
}

export interface EvaluationOverviewItem {
    instanceId: string;
    name: string;
    template: { key: string; name: string; icon: string | null; category: string };
    totalRuns: number;
    completedRuns: number;
    activeRuns: number;
    slaBreached: number;
    avgCompletionMinutes: number | null;
    bausteinCompletionPercent: number;
}

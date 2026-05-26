/**
 * Workflow Engine Gateway — Web-Client
 *
 * Nutzt Platform-API mit PrilogJwt.
 * Endpoints unter /api/platform/v1/workflow/
 */

import { env } from '../../core/config/env';
import { requestJson } from '../../core/http/http-client';
import type {
    WorkflowTemplate,
    WorkflowRun,
    WorkflowTimelineEntry,
    WorkflowCheckpoint,
    BuilderNodeDefinition,
} from './workflow-types';

export function createWorkflowGateway() {
    const base = env.platformBaseUrl;

    return {
        // ─── Palette ─────────────────────────────────────────────────

        getPalette(jwt: string) {
            return requestJson<{
                items: BuilderNodeDefinition[];
                grouped: Record<string, BuilderNodeDefinition[]>;
            }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/workflow/palette',
                method: 'GET', bearerToken: jwt,
            });
        },

        // ─── Templates ──────────────────────────────────────────────

        getTemplates(jwt: string) {
            return requestJson<{ items: WorkflowTemplate[] }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/workflow/templates',
                method: 'GET', bearerToken: jwt,
            });
        },

        getTemplate(jwt: string, id: string) {
            return requestJson<{ template: WorkflowTemplate }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/templates/${id}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        createTemplate(jwt: string, data: {
            name: string;
            slug?: string;
            description?: string;
            category?: string;
            graph: object;
            variables?: unknown[];
            roles?: unknown[];
            triggers?: unknown[];
            icon?: string;
            color?: string;
            tags?: string[];
        }) {
            return requestJson<{ template: WorkflowTemplate }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/workflow/templates',
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify(data),
            });
        },

        updateTemplate(jwt: string, id: string, data: Record<string, unknown>) {
            return requestJson<{ template: WorkflowTemplate; newVersion?: boolean }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/templates/${id}`,
                method: 'PUT', bearerToken: jwt,
                body: JSON.stringify(data),
            });
        },

        approveTemplate(jwt: string, id: string) {
            return requestJson<{ template: WorkflowTemplate }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/templates/${id}/approve`,
                method: 'POST', bearerToken: jwt,
                body: '{}',
            });
        },

        // ─── Runs ───────────────────────────────────────────────────

        startRun(jwt: string, templateId: string, context?: Record<string, unknown>) {
            return requestJson<{ run: WorkflowRun }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/workflow/runs',
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ templateId, context }),
            });
        },

        getRuns(jwt: string, params?: { status?: string; templateId?: string; limit?: number }) {
            const query = new URLSearchParams();
            if (params?.status) query.set('status', params.status);
            if (params?.templateId) query.set('templateId', params.templateId);
            if (params?.limit) query.set('limit', String(params.limit));
            const qs = query.toString() ? `?${query.toString()}` : '';

            return requestJson<{ items: WorkflowRun[] }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/runs${qs}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        getRun(jwt: string, id: string) {
            return requestJson<{ run: WorkflowRun }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/runs/${id}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        getTimeline(jwt: string, runId: string) {
            return requestJson<{ items: WorkflowTimelineEntry[] }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/runs/${runId}/timeline`,
                method: 'GET', bearerToken: jwt,
            });
        },

        cancelRun(jwt: string, runId: string) {
            return requestJson<{ success: boolean }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/runs/${runId}/cancel`,
                method: 'POST', bearerToken: jwt,
                body: '{}',
            });
        },

        // ─── Checkpoints ────────────────────────────────────────────

        confirmCheckpoint(jwt: string, runId: string, checkpointId: string, note?: string) {
            return requestJson<{ checkpoint: WorkflowCheckpoint }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/runs/${runId}/checkpoints/${checkpointId}/confirm`,
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ note }),
            });
        },

        rejectCheckpoint(jwt: string, runId: string, checkpointId: string, note?: string) {
            return requestJson<{ success: boolean }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/runs/${runId}/checkpoints/${checkpointId}/reject`,
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ note }),
            });
        },

        // ─── Forms ──────────────────────────────────────────────────

        submitForm(jwt: string, runId: string, nodeId: string, data: Record<string, unknown>, files?: unknown[]) {
            return requestJson<{ success: boolean }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/workflow/runs/${runId}/forms/${nodeId}/submit`,
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ data, files }),
            });
        },
    };
}

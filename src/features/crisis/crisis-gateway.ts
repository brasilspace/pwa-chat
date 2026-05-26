/**
 * Crisis Management Gateway — Web-Client
 *
 * Nutzt Platform-API mit PrilogJwt (Matrix-Token).
 * Endpoints sind über das Modul-System unter /api/platform/v1/crisis/ registriert.
 */

import { env } from '../../core/config/env';
import { requestJson } from '../../core/http/http-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CrisisScenario {
    id: string;
    name: string;
    nameSlug: string;
    severity: string;
    type: string;
    description: string | null;
    version: number;
    approvedBy: string | null;
    notifyRoles: string[];
    checklistItems: Array<{ id: string; order: number; title: string; assignedRole: string; isMandatory: boolean }>;
    externalContacts: Array<{ label: string; phone: string }>;
    workflowTemplateId?: string | null;
    icon?: string | null;
    silent?: boolean;
    autoDeactivateAfterMinutes?: number | null;
}

export interface CrisisEvent {
    id: string;
    scenarioId: string;
    matrixRoomId: string | null;
    activatedBy: string;
    activatedAt: string;
    activationNote: string | null;
    status: string;
    isFalseAlarm: boolean;
    scenario?: { name: string; severity: string };
    tasks?: CrisisTask[];
}

export interface CrisisTask {
    id: string;
    eventId: string;
    title: string;
    assignedRole: string;
    assignedUserId?: string | null;
    status: string;
    doneBy: string | null;
    doneAt: string | null;
    escalationLevel: number;
}

export interface ActivatePreview {
    scenario: { id: string; name: string; severity: string; description: string | null };
    willNotify: string[];
    willCreateRoom: string;
    checklistCount: number;
}

// ─── Gateway ─────────────────────────────────────────────────────────────────

export function createCrisisGateway() {
    const base = env.platformBaseUrl;

    return {
        getScenarios(jwt: string, approved?: boolean) {
            const query = approved ? '?approved=true' : '';
            return requestJson<{ items: CrisisScenario[]; total: number }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/crisis/scenarios${query}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        getActiveEvents(jwt: string) {
            return requestJson<{ items: CrisisEvent[]; total: number }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/crisis/active',
                method: 'GET', bearerToken: jwt,
            });
        },

        getEvent(jwt: string, eventId: string) {
            return requestJson<CrisisEvent>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/crisis/${eventId}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        activatePreview(jwt: string, scenarioId: string) {
            return requestJson<ActivatePreview>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/crisis/activate',
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ scenarioId, confirm: false }),
            });
        },

        activateConfirm(jwt: string, scenarioId: string, activationNote?: string, isTest?: boolean) {
            return requestJson<{ eventId: string; matrixRoomId: string | null; tasksCreated: number; workflowRunId?: string | null }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/crisis/activate',
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ scenarioId, confirm: true, activationNote, isTest: isTest ?? false }),
            });
        },

        deactivate(jwt: string, eventId: string) {
            return requestJson<{ success: boolean }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/crisis/${eventId}/deactivate`,
                method: 'POST', bearerToken: jwt,
                body: '{}',
            });
        },

        markFalseAlarm(jwt: string, eventId: string, note: string) {
            return requestJson<{ success: boolean }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/crisis/${eventId}/false-alarm`,
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ note }),
            });
        },

        updateTaskStatus(jwt: string, eventId: string, taskId: string, status: string) {
            return requestJson<{ success: boolean }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/crisis/${eventId}/tasks/${taskId}/status`,
                method: 'PATCH', bearerToken: jwt,
                body: JSON.stringify({ status }),
            });
        },

        assignTask(jwt: string, eventId: string, taskId: string, userId: string | null) {
            return requestJson<{ success: boolean }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/crisis/${eventId}/tasks/${taskId}/assign`,
                method: 'PATCH', bearerToken: jwt,
                body: JSON.stringify({ userId }),
            });
        },

        getEvents(jwt: string) {
            return requestJson<{ items: CrisisEvent[]; total: number }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/crisis/events',
                method: 'GET', bearerToken: jwt,
            });
        },
    };
}

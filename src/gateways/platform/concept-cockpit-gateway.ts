/**
 * concept-cockpit-gateway — Konzept-Verankerung P1a.
 * Backend: /platform/v1/workspace/concepts/:flowId/* (Admin).
 * Kanon: prilog_docs/umsetzung/konzept-verankerung/ (v2).
 */
import { requestJson } from '../../core/http/http-client';
import { env } from '../../core/config/env';

export type ConceptWorkStatus =
    | 'entwurf' | 'in_bearbeitung' | 'bereit_zur_beschlussfassung'
    | 'beschlossen' | 'in_umsetzung' | 'review_faellig' | 'archiviert';

export interface ConceptDecision {
    status: ConceptWorkStatus;
    statusDerived: ConceptWorkStatus;
    statusOverridden: boolean;
    statusReason: string;
    nextAction: { key: string; label: string; tab: string } | null;
    openPoints: string[];
    reviewDue: { due: boolean; overdue: boolean };
}

export interface ConceptCockpit {
    anchor: { id: string; conceptFlowId: string; status: string };
    name: string | null;
    targetGroups: Array<{ id: string; scopeType: string; userTypeKey: string | null; spaceId: string | null; responseRequired: boolean }>;
    practice: Array<{ id: string; kind: string; title: string; refType: string | null; refId: string | null; awareness: string | null; sortOrder: number; body?: { bausteinKey?: string; description?: string | null; source?: string } | null }>;
    responsibilities: Array<{ id: string; userId: string; role: string }>;
    nudges: Array<{ id: string; triggerType: string; channel: string; message: string; active: boolean; targetGroupId: string | null; dueDate: string | null }>;
    surveys: Array<{ id: string; formRef: string | null; anonymous: boolean; periodFrom: string | null; periodTo: string | null }>;
    score: ConceptScore | null;
    decision: ConceptDecision;
}

export interface ConceptScore {
    periodStart: string;
    periodEnd: string;
    computedAt: string;
    bekanntheitValue: number | null;
    anwendungValue: number | null;
    beteiligungValue: number | null;
    verstaendnisValue: number | null;
    nachhaltigValue: number | null;
    gesamtValue: number | null;
    trend: 'up' | 'flat' | 'down' | null;
    suppressed: boolean;
    suppressionReason: string | null;
    calculationVersion: string;
}

const base = () => ({ target: 'platform' as const, baseUrl: env.platformBaseUrl });
const p = (flowId: string, suffix = '') =>
    `/platform/v1/workspace/concepts/${encodeURIComponent(flowId)}${suffix}`;

export interface ConceptFlowSummary {
    id: string; name: string; status: string; updatedAt: string;
    summary: {
        hasAnchor: boolean;
        score?: { gesamt: number | null; trend: string | null; suppressed: boolean; suppressionReason: string | null } | null;
        requirement?: { total: number; fulfilled: number; open: number; notApplicable: number } | null;
        adoption?: { status: string; expired: boolean } | null;
        agencyCount?: number; surveyCount?: number; practiceCount?: number; targetGroupCount?: number;
        nextTask?: { title: string; dueDate: string | null } | null;
        nextEvaluation?: { date: string; kind: string } | null;
        openTodos?: number;
        decision?: ConceptDecision;
    };
}

export const conceptCockpitGateway = {
    listConcepts(jwt: string): Promise<{ concepts: ConceptFlowSummary[] }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/concepts', method: 'GET', bearerToken: jwt });
    },
    createConcept(jwt: string, name: string): Promise<{ id: string }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/concepts', method: 'POST', bearerToken: jwt, body: JSON.stringify({ name }) });
    },
    createConceptFromTemplate(jwt: string, templateKey: string): Promise<{ id: string; seeded: number }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/concepts', method: 'POST', bearerToken: jwt, body: JSON.stringify({ templateKey }) });
    },
    listCuratedTemplates(jwt: string): Promise<{ items: Array<{ key: string; name: string; description: string | null; category: string; bausteine: Array<{ key: string; label: string }> }> }> {
        return requestJson({ ...base(), path: '/platform/v1/concepts/templates', method: 'GET', bearerToken: jwt });
    },
    patchConcept(jwt: string, flowId: string, body: { name?: string; status?: string; statusOverride?: ConceptWorkStatus | 'auto' | null }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: p(flowId), method: 'PATCH', bearerToken: jwt, body: JSON.stringify(body) });
    },
    cockpit(jwt: string, flowId: string): Promise<ConceptCockpit> {
        return requestJson({ ...base(), path: p(flowId, '/cockpit'), method: 'GET', bearerToken: jwt });
    },
    addTargetGroup(jwt: string, flowId: string, body: { scopeType: string; userTypeKey?: string | null; spaceId?: string | null; responseRequired?: boolean }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: p(flowId, '/target-groups'), method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    addPractice(jwt: string, flowId: string, body: { kind: string; title: string; refType?: string | null; refId?: string | null; awareness?: string | null; sortOrder?: number }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: p(flowId, '/practice'), method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    addResponsibility(jwt: string, flowId: string, body: { userId: string; role: string }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: p(flowId, '/responsibilities'), method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    materializePractice(jwt: string, practiceId: string, body: { spaceId: string; dueDate?: string | null; responsibleUserId?: string | null }): Promise<{ workItemId: string }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/concepts/practice/${encodeURIComponent(practiceId)}/materialize`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    deletePractice(jwt: string, id: string): Promise<unknown> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/concepts/practice/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    addNudge(jwt: string, flowId: string, body: { triggerType: string; channel: string; message: string }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: p(flowId, '/nudges'), method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    addSurvey(jwt: string, flowId: string, body: { formRef?: string | null; anonymous?: boolean }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: p(flowId, '/surveys'), method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    deleteNudge(jwt: string, id: string): Promise<unknown> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/concepts/nudges/${encodeURIComponent(id)}`, method: 'DELETE', bearerToken: jwt });
    },
    updateNudge(jwt: string, id: string, body: { message?: string; dueDate?: string | null }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/concepts/nudges/${encodeURIComponent(id)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(body) });
    },
    setPracticeRef(jwt: string, practiceId: string, body: { refType: string | null; refId: string | null }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/concepts/practice/${encodeURIComponent(practiceId)}/ref`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(body) });
    },
    listHelp(jwt: string): Promise<{ items: Record<string, { body: string; updatedAt: string; updatedBy: string | null }>; canEdit: boolean }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/concepts/help', method: 'GET', bearerToken: jwt });
    },
    setHelp(jwt: string, topicKey: string, body: string): Promise<{ topicKey: string }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/concepts/help/${encodeURIComponent(topicKey)}`, method: 'PUT', bearerToken: jwt, body: JSON.stringify({ body }) });
    },
    recomputeScore(jwt: string, flowId: string): Promise<{ score: ConceptScore }> {
        return requestJson({ ...base(), path: p(flowId, '/score/recompute'), method: 'POST', bearerToken: jwt, body: '{}' });
    },
    schutzkonzept(jwt: string, flowId: string): Promise<SchutzkonzeptView> {
        return requestJson({ ...base(), path: p(flowId, '/schutzkonzept'), method: 'GET', bearerToken: jwt });
    },
    setRequirementCheck(jwt: string, checkId: string, body: { status: string; adminNote?: string | null; notApplicableReason?: string | null; evidenceRefType?: string | null; evidenceRefId?: string | null }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/concepts/requirement-check/${encodeURIComponent(checkId)}`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    setAdoption(jwt: string, flowId: string, body: { status: string; gremium?: string | null; decidedAt?: string | null; validUntil?: string | null; resolutionRef?: string | null }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: p(flowId, '/adoption'), method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    listAgencies(jwt: string): Promise<{ agencies: AgencyOption[] }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/schutzkonzept/agencies', method: 'GET', bearerToken: jwt });
    },
    createAgency(jwt: string, body: { name: string; kind: string; contact?: string | null; url?: string | null }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: '/platform/v1/workspace/schutzkonzept/agencies', method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    linkAgency(jwt: string, flowId: string, body: { agencyId: string; role: string; adminNote?: string | null }): Promise<{ id: string }> {
        return requestJson({ ...base(), path: p(flowId, '/agency-links'), method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    unlinkAgency(jwt: string, linkId: string): Promise<unknown> {
        return requestJson({ ...base(), path: `/platform/v1/workspace/concepts/agency-links/${encodeURIComponent(linkId)}`, method: 'DELETE', bearerToken: jwt });
    },
};

export interface SchutzkonzeptView {
    catalog: { scope: string; version: string; status: string; title: string };
    scopeFallback: boolean;
    disclaimer: string;
    items: Array<{ requirementId: string; key: string; label: string; mandatory: boolean; checkId: string; status: string; adminNote: string | null; notApplicableReason: string | null; evidenceRefType: string | null; evidenceRefId: string | null }>;
    summary: { total: number; open: number; fulfilled: number; not_applicable: number };
    adoption: { id: string; status: string; gremium: string | null; decidedAt: string | null; validUntil: string | null; resolutionRef: string | null; signatureStatus: string; isCurrent: boolean; isExpired: boolean } | null;
    agencyLinks: Array<{ id: string; agencyId: string; role: string; adminNote: string | null; agency: { name: string; kind: string; scope: string; contact: string | null; url: string | null; active: boolean } }>;
}

export interface AgencyOption {
    id: string; scope: string; name: string; kind: string; contact: string | null; url: string | null; active: boolean;
}

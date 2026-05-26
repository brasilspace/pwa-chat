/**
 * Compliance-Gateway — DSB-Konsole API-Client.
 */
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

const B = env.platformBaseUrl;
const P = '/platform/v1/compliance';

export type GateStatus = 'not_started' | 'in_review' | 'approved' | 'rejected' | 'expired';
export type GateCategory =
    | 'mandatory_contract'
    | 'employee_data'
    | 'ai_processing'
    | 'encryption'
    | 'analytics'
    | 'third_party';

export interface ChecklistItem {
    key: string;
    labelKey: string;
}

export interface DocumentRef {
    docsPath: string;
    labelKey: string;
    requiresUpload?: boolean;
}

export interface GateDefinition {
    key: string;
    category: GateCategory;
    mandatoryAnnex: boolean;
    titleKey: string;
    summaryKey: string;
    contextKeys: {
        whatItIs: string;
        dataInvolved: string;
        legalBasis: string;
        risks: string;
        toms: string;
    };
    documents: DocumentRef[];
    checklist: ChecklistItem[];
    revalidationMonths?: number | null;
}

export interface GateView {
    key: string;
    status: GateStatus;
    approvedAt: string | null;
    approvedBy: string | null;
    approvedByRole: 'dpo' | 'admin' | 'system' | null;
    approvalReason: string | null;
    rejectionReason: string | null;
    expiresAt: string | null;
    checklistState: Record<string, boolean>;
    linkedDocuments: Array<Record<string, unknown>>;
    definition: GateDefinition;
}

export interface DpoProfile {
    id: string;
    tenantId: string;
    dpoName: string;
    dpoEmail: string;
    dpoPhone: string | null;
    isExternal: boolean;
    externalOrg: string | null;
    validFrom: string;
    validUntil: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AuditEntry {
    id: string;
    tenantId: string;
    gateKey: string | null;
    action: string;
    actorId: string | null;
    actorRole: string | null;
    beforeStatus: string | null;
    afterStatus: string | null;
    reason: string | null;
    metadata: Record<string, unknown>;
    timestamp: string;
}

export interface ComplianceGateway {
    getDpoProfile(jwt: string): Promise<{ profile: DpoProfile | null }>;
    upsertDpoProfile(jwt: string, input: {
        dpoName: string;
        dpoEmail: string;
        dpoPhone?: string;
        isExternal?: boolean;
        externalOrg?: string;
        validFrom?: string;
        validUntil?: string;
        notes?: string;
    }): Promise<{ profile: DpoProfile }>;
    listGates(jwt: string): Promise<{ gates: GateView[] }>;
    changeGateStatus(jwt: string, gateKey: string, input: {
        action: 'start_review' | 'approve' | 'reject' | 'reopen';
        actorRole?: 'dpo' | 'admin';
        reason?: string;
    }): Promise<{ gate: GateView }>;
    setChecklistItem(jwt: string, gateKey: string, itemKey: string, checked: boolean, actorRole?: 'dpo' | 'admin'): Promise<{ gate: GateView }>;
    listAuditLog(jwt: string, opts?: { gateKey?: string; limit?: number }): Promise<{ entries: AuditEntry[] }>;
}

export function createComplianceGateway(): ComplianceGateway {
    return {
        getDpoProfile(jwt) {
            return requestJson({ target: 'platform', baseUrl: B, path: `${P}/dpo`, method: 'GET', bearerToken: jwt });
        },
        upsertDpoProfile(jwt, input) {
            return requestJson({ target: 'platform', baseUrl: B, path: `${P}/dpo`, method: 'PUT', bearerToken: jwt, body: JSON.stringify(input) });
        },
        listGates(jwt) {
            return requestJson({ target: 'platform', baseUrl: B, path: `${P}/gates`, method: 'GET', bearerToken: jwt });
        },
        changeGateStatus(jwt, gateKey, input) {
            return requestJson({ target: 'platform', baseUrl: B, path: `${P}/gates/${encodeURIComponent(gateKey)}/status`, method: 'POST', bearerToken: jwt, body: JSON.stringify(input) });
        },
        setChecklistItem(jwt, gateKey, itemKey, checked, actorRole = 'admin') {
            return requestJson({ target: 'platform', baseUrl: B, path: `${P}/gates/${encodeURIComponent(gateKey)}/checklist`, method: 'POST', bearerToken: jwt, body: JSON.stringify({ itemKey, checked, actorRole }) });
        },
        listAuditLog(jwt, opts) {
            const qs = opts ? new URLSearchParams() : null;
            if (qs && opts?.gateKey) qs.set('gateKey', opts.gateKey);
            if (qs && opts?.limit) qs.set('limit', String(opts.limit));
            const query = qs && qs.toString() ? `?${qs.toString()}` : '';
            return requestJson({ target: 'platform', baseUrl: B, path: `${P}/audit-log${query}`, method: 'GET', bearerToken: jwt });
        },
    };
}

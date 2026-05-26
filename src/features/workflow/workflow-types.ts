// ─────────────────────────────────────────────────────────────────────────────
// Workflow Engine — Frontend Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type WorkflowNodeType =
    | 'start' | 'finish' | 'decision' | 'parallel_gateway' | 'loop' | 'subprocess'
    | 'checkpoint' | 'approval' | 'form'
    | 'announce' | 'escalation' | 'action'
    | 'delay' | 'timer';

export interface WorkflowNodeDef {
    id: string;
    type: WorkflowNodeType;
    name: string;
    config: Record<string, unknown>;
    next: string[];
    position?: { x: number; y: number };
    sla?: { warningMinutes?: number; escalationMinutes?: number; autoAction?: string };
}

export interface WorkflowEdgeDef {
    id: string;
    source: string;
    target: string;
    label?: string;
    condition?: string;
}

export interface WorkflowGraph {
    nodes: WorkflowNodeDef[];
    edges: WorkflowEdgeDef[];
}

export interface WorkflowTemplate {
    id: string;
    tenantId: string | null;
    name: string;
    slug: string;
    description: string | null;
    category: string | null;
    version: number;
    status: string;
    graph: WorkflowGraph;
    variables: Array<{ key: string; label: string; type: string; required: boolean }>;
    roles: Array<{ key: string; label: string; required: boolean }>;
    triggers: Array<{ type: string; config: Record<string, unknown> }>;
    icon: string | null;
    color: string | null;
    tags: string[];
    isSystem: boolean;
    createdBy: string;
    approvedBy: string | null;
    approvedAt: string | null;
    createdAt: string;
}

export interface WorkflowRun {
    id: string;
    tenantId: string;
    templateId: string;
    templateVersion: number;
    status: string;
    activeNodeIds: string[];
    context: Record<string, unknown>;
    startedAt: string;
    startedBy: string | null;
    completedAt: string | null;
    triggeredBy: string;
    slaBreached: boolean;
    template?: { name: string; slug: string; icon: string | null; color: string | null };
    checkpoints?: WorkflowCheckpoint[];
    formResponses?: WorkflowFormResponse[];
}

export interface WorkflowCheckpoint {
    id: string;
    runId: string;
    nodeId: string;
    title: string;
    description: string | null;
    assignedRole: string;
    requiredApprovals: number;
    status: string;
    confirmedAt: string | null;
    confirmedBy: string | null;
    approvals?: WorkflowApproval[];
}

export interface WorkflowApproval {
    id: string;
    checkpointId: string;
    userId: string;
    decision: string;
    note: string | null;
    decidedAt: string;
}

export interface WorkflowFormResponse {
    id: string;
    runId: string;
    nodeId: string;
    data: Record<string, unknown>;
    files: Array<{ fieldKey: string; storageKey: string; fileName: string }>;
    submittedBy: string;
    submittedAt: string;
}

export interface WorkflowTimelineEntry {
    id: string;
    runId: string;
    nodeId: string | null;
    type: string;
    status: string;
    actor: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
}

export interface BuilderNodeDefinition {
    type: WorkflowNodeType;
    label: string;
    description: string;
    category: string;
    icon: string;
    color: string;
    allowedNext: WorkflowNodeType[];
    fields: Array<{
        key: string;
        label: string;
        type: string;
        required: boolean;
        options?: string[];
        helpText?: string;
    }>;
}

// ─── Node Colors Map ─────────────────────────────────────────────────────────

export const NODE_COLORS: Record<WorkflowNodeType, string> = {
    start: '#3b82f6',
    finish: '#334155',
    decision: '#a855f7',
    parallel_gateway: '#06b6d4',
    loop: '#8b5cf6',
    subprocess: '#0ea5e9',
    checkpoint: '#10b981',
    approval: '#059669',
    form: '#14b8a6',
    announce: '#f59e0b',
    escalation: '#ef4444',
    action: '#f97316',
    delay: '#94a3b8',
    timer: '#64748b',
};

export const NODE_ICONS: Record<WorkflowNodeType, string> = {
    start: 'Play',
    finish: 'CircleCheck',
    decision: 'GitBranch',
    parallel_gateway: 'GitFork',
    loop: 'Repeat',
    subprocess: 'Layers',
    checkpoint: 'UserCheck',
    approval: 'ShieldCheck',
    form: 'ClipboardList',
    announce: 'MessageSquare',
    escalation: 'AlertTriangle',
    action: 'Zap',
    delay: 'Clock',
    timer: 'CalendarClock',
};

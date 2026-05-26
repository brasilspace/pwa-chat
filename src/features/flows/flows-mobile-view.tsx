/**
 * FlowsMobileView — Read-Only-Listen-Ansicht des Editors fuer Mobile (Phase 8.1).
 *
 * React-Flow ist auf Mobile schwer bedienbar (Pinch-Zoom kollidiert mit Pan,
 * Component-Boxen sind zu klein). Stattdessen: vertikale Liste der Components
 * mit Verbindungs-Hinweis + "Bearbeiten am Desktop"-CTA.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Monitor, History, GitBranch, Webhook, Clock, Send, Mail, FileText, CheckSquare, AlertTriangle, ListChecks, Database, Repeat, Workflow, ArrowDown } from 'lucide-react';
import type { ProcessTemplate, ProcessComponent, ProcessEdge } from './flows-gateway';
import { useT } from "@/lib/i18n/use-t";

const KIND_ICON: Record<string, typeof GitBranch> = {
    'flow.webhook-trigger': Webhook,
    'flow.schedule-trigger': Clock,
    'flow.http-request': Send,
    'flow.set-data': Database,
    'flow.delay': Clock,
    'flow.matrix-message': Send,
    'flow.send-email': Mail,
    'flow.dms-write': FileText,
    'flow.create-task': CheckSquare,
    'flow.sub-process': Workflow,
    'flow.loop': Repeat,
    'crisis.alarm': AlertTriangle,
    'crisis.task-template': ListChecks,
    'crisis.escalate': AlertTriangle,
    'crisis.notify-roles': Send,
    'crisis.report': FileText,
    'n8n.trigger': Workflow,
    'n8n.callback': Workflow,
};

function colorForKind(kind: string): string {
    if (kind.startsWith('crisis.')) return 'border-red-300 bg-red-50';
    if (kind.startsWith('flow.webhook') || kind.startsWith('flow.schedule')) return 'border-emerald-300 bg-emerald-50';
    if (kind.startsWith('flow.')) return 'border-blue-300 bg-blue-50';
    if (kind.startsWith('baustein.')) return 'border-purple-300 bg-purple-50';
    if (kind.startsWith('n8n.')) return 'border-yellow-300 bg-yellow-50';
    return 'border-gray-300 bg-white';
}

export function FlowsMobileView({
    template, components, edges,
}: {
    template: ProcessTemplate;
    components: ProcessComponent[];
    edges: ProcessEdge[];
}) {
    const t = useT();
    const navigate = useNavigate();

    // Topologie-Sortierung: Entry-Points zuerst, dann nach sortOrder
    const sorted = [...components].sort((a, b) => a.sortOrder - b.sortOrder);

    // Edges-Map: sourceId → outgoing edges
    const outgoing = new Map<string, ProcessEdge[]>();
    for (const e of edges) {
        if (!outgoing.has(e.sourceId)) outgoing.set(e.sourceId, []);
        outgoing.get(e.sourceId)!.push(e);
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50">
            {/* Top-Bar */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-2 z-10">
                <button onClick={() => navigate('/flows')} className="p-2 hover:bg-gray-100 rounded">
                    <ArrowLeft size={18} />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{template.name}</div>
                    <div className="text-xs text-gray-500">{template.appKind} · {components.length} {t('flows.flows_mobile_view.components')} {edges.length} {t('flows.flows_mobile_view.edges')}</div>
                </div>
                <button
                    onClick={() => navigate(`/flows/${template.id}/runs`)}
                    className="p-2 hover:bg-gray-100 rounded"
                    title={t('flows.flows_mobile_view.runs')}
                >
                    <History size={18} />
                </button>
            </div>

            {/* Mobile-Banner */}
            <div className="m-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <Monitor size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                    <div className="font-medium mb-0.5">{t('flows.flows_mobile_view.read-only_auf_mobile')}</div>
                    {t('flows.flows_mobile_view.der_visuelle_editor_mit_drag-and-drop_is')}
                </div>
            </div>

            {/* Component-Liste */}
            <div className="p-3 space-y-2">
                {sorted.length === 0 && (
                    <div className="text-center py-12 text-sm text-gray-500">
                        {t('flows.flows_mobile_view.noch_keine_components_editor_am_desktop_')}
                    </div>
                )}

                {sorted.map((c, idx) => {
                    const Icon = KIND_ICON[c.kind] ?? GitBranch;
                    const color = colorForKind(c.kind);
                    const out = outgoing.get(c.id) ?? [];
                    return (
                        <div key={c.id}>
                            <div className={`p-3 border-2 rounded-lg ${color}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon size={16} className="flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{c.label}</div>
                                        <div className="text-xs text-gray-500 font-mono truncate">{c.kind}</div>
                                    </div>
                                </div>
                                {Object.keys(c.config).length > 0 && (
                                    <details className="mt-2">
                                        <summary className="text-xs text-gray-500 cursor-pointer">{t('flows.flows_mobile_view.config')}</summary>
                                        <pre className="text-[10px] bg-white/60 p-1.5 rounded mt-1 overflow-x-auto">{JSON.stringify(c.config, null, 2)}</pre>
                                    </details>
                                )}
                            </div>
                            {idx < sorted.length - 1 && out.length > 0 && (
                                <div className="flex justify-center py-1.5 text-gray-400">
                                    {out.map(e => {
                                        const target = components.find(x => x.id === e.targetId);
                                        const condLabel = e.condition?.type === 'delay' ? `${Math.round(e.condition.ms / 1000)}s warten` : e.condition?.type === 'if' ? 'wenn …' : null;
                                        return (
                                            <div key={e.id} className="flex flex-col items-center text-[10px]">
                                                <ArrowDown size={14} className={e.condition?.type === 'delay' ? 'text-amber-500' : 'text-gray-400'} />
                                                {condLabel && <span className="text-amber-600">{condLabel}</span>}
                                                {target && <span className="text-gray-500 truncate max-w-[120px]">→ {target.label}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

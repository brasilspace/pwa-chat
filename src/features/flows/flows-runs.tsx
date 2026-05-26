/**
 * FlowsRuns — Liste aller ProcessInstances eines Templates (Phase 7.1).
 *
 * /flows/:templateId/runs
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Pause, Circle } from 'lucide-react';
import { sessionStore } from '../../core/session/session-store';
import { flowsGateway, type ProcessInstance, type ProcessTemplate } from './flows-gateway';
import { useT } from "@/lib/i18n/use-t";

const STATUS_BADGE: Record<string, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
    pending: { label: 'pending', className: 'bg-gray-100 text-gray-700', Icon: Circle },
    active: { label: 'aktiv', className: 'bg-blue-100 text-blue-700', Icon: Loader2 },
    paused: { label: 'pausiert', className: 'bg-amber-100 text-amber-700', Icon: Pause },
    completed: { label: 'fertig', className: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
    aborted: { label: 'abgebrochen', className: 'bg-red-100 text-red-700', Icon: AlertCircle },
};

function formatDuration(start: string, end: string | null): string {
    const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
    return `${Math.round(ms / 86_400_000)}d`;
}

export function FlowsRuns() {
    const t = useT();
    const { templateId } = useParams<{ templateId: string }>();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [template, setTemplate] = useState<ProcessTemplate | null>(null);
    const [instances, setInstances] = useState<ProcessInstance[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jwt || !templateId) return;
        Promise.all([
            flowsGateway.getTemplate(jwt, templateId),
            flowsGateway.listInstances(jwt, templateId),
        ])
            .then(([tpl, inst]) => {
                setTemplate(tpl.template);
                setInstances(inst.instances);
            })
            .catch(err => setError(err instanceof Error ? err.message : String(err)));
    }, [jwt, templateId]);

    if (!jwt || !templateId) return null;
    if (error) return <div className="p-6 text-red-600">{error}</div>;

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-4xl mx-auto p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(`/flows/${templateId}`)} className="p-2 hover:bg-gray-100 rounded-lg">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold">{template?.name ?? 'Lade…'}</h1>
                        <div className="text-sm text-gray-500">{t('flows.flows_runs.alle_runs')}</div>
                    </div>
                </div>

                {instances === null && (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                        <Loader2 size={24} className="animate-spin" />
                    </div>
                )}

                {instances && instances.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg bg-white">
                        <p className="text-gray-500">{t('flows.flows_runs.noch_keine_runs_click_quottest-runquot_i')}</p>
                    </div>
                )}

                {instances && instances.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        {instances.map((inst, idx) => {
                            const badge = STATUS_BADGE[inst.status] ?? STATUS_BADGE.pending;
                            const Icon = badge.Icon;
                            return (
                                <button
                                    key={inst.id}
                                    onClick={() => navigate(`/flows/${templateId}/runs/${inst.id}`)}
                                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 ${idx > 0 ? 'border-t border-gray-100' : ''}`}
                                >
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase flex items-center gap-1 ${badge.className}`}>
                                        <Icon size={12} className={inst.status === 'active' ? 'animate-spin' : ''} />
                                        {badge.label}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-mono text-gray-700">#{inst.id.slice(-8)}</div>
                                        <div className="text-xs text-gray-500">
                                            {t('flows.flows_runs.gestartet_von')} {inst.startedBy} · {new Date(inst.startedAt).toLocaleString('de-DE')}
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {formatDuration(inst.startedAt, inst.completedAt)}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

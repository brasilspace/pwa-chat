/**
 * FlowsInstanceDetail — laufende oder abgeschlossene Instance ansehen (Phase 6.3).
 *
 * Layout:
 *   [Status-Header]
 *   [ComponentStates-Liste pro Component mit Status-Farbe]
 *   [ProcessEvent-Timeline]
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, AlertCircle, Loader2 } from 'lucide-react';
import { sessionStore } from '../../core/session/session-store';
import {
    flowsGateway,
    type ProcessInstance,
    type ProcessComponentState,
    type ProcessEvent,
    type ProcessTemplateDetail,
} from './flows-gateway';
import { useT } from "@/lib/i18n/use-t";

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
    pending: Circle,
    active: Loader2,
    completed: CheckCircle2,
    skipped: Circle,
    failed: AlertCircle,
};

const STATUS_COLORS: Record<string, string> = {
    pending: 'text-gray-400',
    active: 'text-blue-500 animate-spin',
    completed: 'text-emerald-500',
    skipped: 'text-gray-300',
    failed: 'text-red-500',
};

const INSTANCE_STATUS_COLORS: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    active: 'bg-blue-100 text-blue-700',
    paused: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    aborted: 'bg-red-100 text-red-700',
};

export function FlowsInstanceDetail() {
    const t = useT();
    const { templateId, instanceId } = useParams<{ templateId: string; instanceId: string }>();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [instance, setInstance] = useState<ProcessInstance | null>(null);
    const [componentStates, setComponentStates] = useState<ProcessComponentState[]>([]);
    const [events, setEvents] = useState<ProcessEvent[]>([]);
    const [template, setTemplate] = useState<ProcessTemplateDetail['template'] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshTick, setRefreshTick] = useState(0);

    useEffect(() => {
        if (!jwt || !instanceId || !templateId) return;
        Promise.all([
            flowsGateway.getInstanceState(jwt, instanceId),
            flowsGateway.getInstanceEvents(jwt, instanceId),
            flowsGateway.getTemplate(jwt, templateId),
        ])
            .then(([state, evt, tpl]) => {
                setInstance(state.instance);
                setComponentStates(state.componentStates);
                setEvents(evt.events);
                setTemplate(tpl.template);
            })
            .catch(err => setError(err instanceof Error ? err.message : String(err)));
    }, [jwt, instanceId, templateId, refreshTick]);

    // Phase 7.4: Auto-Refresh fuer aktive/pending Instances alle 5s
    useEffect(() => {
        if (!instance) return;
        if (instance.status !== 'active' && instance.status !== 'pending') return;
        const handle = window.setInterval(() => setRefreshTick(_t => _t + 1), 5000);
        return () => window.clearInterval(handle);
    }, [instance]);

    if (!jwt || !instanceId || !templateId) return null;
    if (error) return <div className="p-6 text-red-600">{error}</div>;
    if (!instance || !template) return <div className="p-6">{t('flows.flows_instance_detail.lade')}</div>;

    const componentById = new Map(template.components.map(c => [c.id, c]));

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-4xl mx-auto p-6 space-y-6">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(`/flows/${templateId}`)} className="p-2 hover:bg-gray-100 rounded-lg">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold">{template.name}</h1>
                        <div className="text-sm text-gray-500">{t('flows.flows_instance_detail.run')}{instance.id.slice(-8)}</div>
                    </div>
                    {(instance.status === 'active' || instance.status === 'pending') && (
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" />
                            {t('flows.flows_instance_detail.auto-refresh_5s')}
                        </span>
                    )}
                    <button
                        onClick={() => setRefreshTick(_t => _t + 1)}
                        className="px-3 py-1.5 border border-gray-300 hover:bg-gray-100 rounded-lg text-sm"
                    >
                        {t('flows.flows_instance_detail.aktualisieren')}
                    </button>
                </div>

                {/* Status-Header */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium uppercase ${INSTANCE_STATUS_COLORS[instance.status] ?? 'bg-gray-100'}`}>
                            {instance.status}
                        </span>
                        <span className="text-sm text-gray-500">
                            {t('flows.flows_instance_detail.gestartet_von')} {instance.startedBy} · {new Date(instance.startedAt).toLocaleString('de-DE')}
                        </span>
                    </div>
                    {instance.completedAt && (
                        <div className="text-sm text-gray-500">
                            {t('flows.flows_instance_detail.beendet')} {new Date(instance.completedAt).toLocaleString('de-DE')}
                        </div>
                    )}
                    {Object.keys(instance.data).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="text-xs font-medium text-gray-500 mb-1">{t('flows.flows_instance_detail.daten')}</div>
                            <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">{JSON.stringify(instance.data, null, 2)}</pre>
                        </div>
                    )}
                </div>

                {/* Component-States */}
                <div>
                    <h2 className="text-sm font-semibold mb-3">{t('flows.flows_instance_detail.komponenten')}{componentStates.length} {t('flows.flows_instance_detail.aktiv')}</h2>
                    {componentStates.length === 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
                            {t('flows.flows_instance_detail.noch_keine_component-states_der_run_hat_')}
                        </div>
                    )}
                    <div className="space-y-2">
                        {componentStates.map(s => {
                            const comp = componentById.get(s.componentId);
                            const StatusIcon = STATUS_ICONS[s.status] ?? Circle;
                            const colorClass = STATUS_COLORS[s.status] ?? 'text-gray-400';
                            return (
                                <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-start gap-3">
                                    <StatusIcon size={20} className={`flex-shrink-0 mt-0.5 ${colorClass}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{comp?.label ?? s.componentId}</span>
                                            <span className="text-xs text-gray-500 font-mono">{comp?.kind ?? '?'}</span>
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{s.status}</span>
                                        </div>
                                        {s.startedAt && (
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                {new Date(s.startedAt).toLocaleString('de-DE')}
                                                {s.completedAt && ` → ${new Date(s.completedAt).toLocaleString('de-DE')}`}
                                            </div>
                                        )}
                                        {s.output && Object.keys(s.output).length > 0 && (
                                            <details className="mt-2">
                                                <summary className="text-xs text-gray-500 cursor-pointer">{t('flows.flows_instance_detail.output')}</summary>
                                                <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(s.output, null, 2)}</pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Audit-Log */}
                <div>
                    <h2 className="text-sm font-semibold mb-3">{t('flows.flows_instance_detail.audit-log')}{events.length} {t('flows.flows_instance_detail.events')}</h2>
                    {events.length === 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
                            {t('flows.flows_instance_detail.noch_keine_events')}
                        </div>
                    )}
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        {events.map((e, idx) => {
                            const comp = e.componentId ? componentById.get(e.componentId) : null;
                            return (
                                <div key={e.id} className={`px-4 py-3 flex items-start gap-3 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                                    <div className="flex-shrink-0 text-xs text-gray-400 font-mono w-32">
                                        {new Date(e.createdAt).toLocaleTimeString('de-DE')}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm">
                                            <span className="font-medium">{e.type}</span>
                                            {comp && <span className="text-gray-500"> · {comp.label}</span>}
                                            {e.actorId && <span className="text-gray-500"> · {e.actorId}</span>}
                                        </div>
                                        {e.payload && Object.keys(e.payload).length > 0 && (
                                            <pre className="text-xs bg-gray-50 p-1.5 rounded mt-1 overflow-x-auto">{JSON.stringify(e.payload, null, 2)}</pre>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * FlowsEditor — visueller Process-Engine Editor (Phase 5).
 *
 * Layout:
 *   ┌──────────────────────────────────────────┬───────────────┐
 *   │  React-Flow Canvas (drag, zoom, pan)     │  Properties   │
 *   │                                           │  (selected    │
 *   │  ┌─[Trigger]──[Action]──[Action]→         │   Component)  │
 *   │           │                               │               │
 *   │           ↓                               │               │
 *   │      [Action]                             │               │
 *   ├──────────────────────────────────────────┴───────────────┤
 *   │  Component-Kind-Picker (drag-drop in canvas)              │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Save-Strategie: Optimistic local state, debounced PUT auf Component-Level.
 * Add/Delete von Components/Edges geht direkt an die API.
 */

import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ReactFlow, Background, Controls, MiniMap, Handle, Position,
    useNodesState, useEdgesState, addEdge as addRfEdge,
    useReactFlow, ReactFlowProvider,
    type Node as RfNode, type Edge as RfEdge, type Connection, type NodeProps,
    MarkerType, BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Trash2, X, Play, History } from 'lucide-react';
import { toast } from '../../components/ui/toast';
import { sessionStore } from '../../core/session/session-store';
import { useIsMobile } from '../../core/responsive/use-is-mobile';
import { FlowsMobileView } from './flows-mobile-view';
import {
    flowsGateway,
    type AppMeta,
    type ComponentKind,
    type ProcessComponent,
    type ProcessEdge,
    type ProcessTemplate,
    type EdgeCondition,
} from './flows-gateway';
import { GenericPropertiesForm, iconForKind, colorClassForKind } from './generic-properties-form';
import { EdgeConditionEditor } from './edge-condition-editor';
import { TemplateHeaderEdit, TemplateActionsMenu } from './editor-header-shared';
import { useT } from "@/lib/i18n/use-t";

// ─── Custom Node Renderer ──────────────────────────────────────────────────

interface ComponentNodeData {
    component: ProcessComponent;
    kind: ComponentKind | null;
    onSelect: () => void;
    selected: boolean;
    [key: string]: unknown;
}

function ComponentNode({ data }: NodeProps): JSX.Element {
    const d = data as unknown as ComponentNodeData;
    const designer = d.kind?.designer ?? null;
    const Icon = iconForKind(designer?.icon);
    const colorClass = colorClassForKind(designer?.color);
    return (
        <div
            onClick={d.onSelect}
            className={`px-3 py-2 rounded-lg border-2 cursor-pointer min-w-[180px] ${colorClass} ${d.selected ? 'ring-2 ring-blue-500' : ''}`}
        >
            <Handle type="target" position={Position.Left} />
            <div className="flex items-center gap-2">
                <Icon size={16} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.component.label}</div>
                    <div className="text-xs text-gray-500 truncate">{d.component.kind}</div>
                </div>
            </div>
            <Handle type="source" position={Position.Right} />
        </div>
    );
}

const nodeTypes = { component: ComponentNode };

// ─── Helpers ────────────────────────────────────────────────────────────────

function componentToNode(c: ProcessComponent, kind: ComponentKind | null, onSelect: (id: string) => void, selectedId: string | null): RfNode {
    const pos = c.position ?? { x: 100 + c.sortOrder * 50, y: 100 + (c.sortOrder % 5) * 100 };
    return {
        id: c.id,
        type: 'component',
        position: { x: pos.x, y: pos.y },
        data: {
            component: c,
            kind,
            onSelect: () => onSelect(c.id),
            selected: selectedId === c.id,
        } as ComponentNodeData,
    };
}

function edgeToRf(e: ProcessEdge): RfEdge {
    const condLabel = e.condition?.type === 'delay'
        ? `delay ${Math.round(e.condition.ms / 1000)}s`
        : e.condition?.type === 'if'
            ? 'if'
            : null;
    return {
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        label: e.label ?? condLabel ?? undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: e.condition?.type === 'delay' ? { stroke: '#f59e0b', strokeDasharray: '5,5' } : undefined,
    };
}

// ─── Main Editor ────────────────────────────────────────────────────────────

export function FlowsEditor() {
    return (
        <ReactFlowProvider>
            <FlowsEditorInner />
        </ReactFlowProvider>
    );
}

function FlowsEditorInner() {
    const t = useT();
    const { templateId } = useParams<{ templateId: string }>();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const isMobile = useIsMobile();
    const { screenToFlowPosition } = useReactFlow();

    const [template, setTemplate] = useState<ProcessTemplate | null>(null);
    const [components, setComponents] = useState<ProcessComponent[]>([]);
    const [edges, setEdges] = useState<ProcessEdge[]>([]);
    const [kinds, setKinds] = useState<ComponentKind[]>([]);
    const [apps, setApps] = useState<AppMeta[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!jwt || !templateId) return;
        try {
            const r = await flowsGateway.getTemplate(jwt, templateId);
            setTemplate(r.template);
            setComponents(r.template.components);
            setEdges(r.template.edges);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [jwt, templateId]);

    useEffect(() => {
        if (!jwt) return;
        flowsGateway.listKinds(jwt).then(r => { setKinds(r.kinds); setApps(r.apps); }).catch(() => undefined);
        void reload();
    }, [jwt, reload]);

    const kindByKey = (k: string) => kinds.find(x => x.key === k) ?? null;

    const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RfNode>([]);
    const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<RfEdge>([]);

    useEffect(() => {
        setRfNodes(components.map(c => componentToNode(c, kinds.find(k => k.key === c.kind) ?? null, setSelectedId, selectedId)));
        setRfEdges(edges.map(edgeToRf));
    }, [components, edges, kinds, selectedId, setRfNodes, setRfEdges]);

    const onConnect = useCallback(async (conn: Connection) => {
        if (!jwt || !templateId || !conn.source || !conn.target) return;
        try {
            const r = await flowsGateway.addEdge(jwt, templateId, {
                sourceId: conn.source,
                targetId: conn.target,
                condition: { type: 'always' },
            });
            setEdges(es => [...es, r.edge]);
            setRfEdges(es => addRfEdge({ ...conn, id: r.edge.id, markerEnd: { type: MarkerType.ArrowClosed } }, es));
        } catch (err) {
            toast.error('Edge konnte nicht angelegt werden: ' + (err instanceof Error ? err.message : String(err)));
        }
    }, [jwt, templateId, setRfEdges]);

    const onNodeDragStop = useCallback(async (_evt: React.MouseEvent, node: RfNode) => {
        if (!jwt) return;
        const comp = components.find(c => c.id === node.id);
        if (!comp) return;
        try {
            const r = await flowsGateway.updateComponent(jwt, comp.id, {
                position: { x: node.position.x, y: node.position.y },
            });
            setComponents(cs => cs.map(c => c.id === r.component.id ? r.component : c));
        } catch { /* ignore — UI bleibt optimistisch */ }
    }, [jwt, components]);

    const handleAddComponent = useCallback(async (kind: ComponentKind, position?: { x: number; y: number }) => {
        if (!jwt || !templateId) return;
        try {
            const r = await flowsGateway.addComponent(jwt, templateId, {
                kind: kind.key,
                label: kind.label,
                config: kind.designer?.defaultConfig ?? {},
                position: position ?? { x: 250, y: 100 + components.length * 80 },
                sortOrder: components.length,
            });
            setComponents(cs => [...cs, r.component]);
            toast.success(`${kind.label} hinzugefügt`);
        } catch (err) {
            toast.error('Component konnte nicht angelegt werden: ' + (err instanceof Error ? err.message : String(err)));
        }
    }, [jwt, templateId, components.length]);

    const handleDrop = useCallback((evt: React.DragEvent) => {
        evt.preventDefault();
        const raw = evt.dataTransfer.getData('application/prilog-component-kind');
        if (!raw) return;
        try {
            const kind = JSON.parse(raw) as ComponentKind;
            const position = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
            void handleAddComponent(kind, position);
        } catch { /* ignore */ }
    }, [handleAddComponent, screenToFlowPosition]);

    const handleDragOver = useCallback((evt: React.DragEvent) => {
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy';
    }, []);

    const handleDeleteComponent = useCallback(async (id: string) => {
        if (!jwt) return;
        if (!confirm('Component wirklich löschen?')) return;
        try {
            await flowsGateway.deleteComponent(jwt, id);
            setComponents(cs => cs.filter(c => c.id !== id));
            setEdges(es => es.filter(e => e.sourceId !== id && e.targetId !== id));
            setSelectedId(null);
            toast.success('Component gelöscht');
        } catch (err) {
            toast.error('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
        }
    }, [jwt]);

    const selectedComponent = components.find(c => c.id === selectedId) ?? null;

    if (!templateId) return <div>{t('flows.flows_editor.kein_templateid')}</div>;
    if (error) return <div className="p-6 text-red-600">{error}</div>;
    if (!template) return <div className="p-6">{t('flows.flows_editor.lade')}</div>;

    // Mobile: Read-Only-Listen-Ansicht
    if (isMobile) {
        return <FlowsMobileView template={template} components={components} edges={edges} />;
    }

    return (
        <div className="flex-1 flex flex-col h-full">
            {/* Top-Bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
                <button onClick={() => navigate('/flows')} className="p-2 hover:bg-gray-100 rounded-lg">
                    <ArrowLeft size={18} />
                </button>
                <TemplateHeaderEdit
                    template={template}
                    subtitle={`${template.appKind} · v${template.version} · ${components.length} Components · ${edges.length} Edges`}
                    jwt={jwt!}
                    onUpdated={(_t) => setTemplate(_t)}
                />
                <TemplateActionsMenu jwt={jwt!} template={template} onUpdated={(_t) => setTemplate(_t)} navigate={navigate} />
                <button
                    onClick={() => navigate(`/flows/${template.id}/runs`)}
                    className="px-3 py-1.5 border border-gray-300 hover:bg-gray-100 rounded-lg text-sm flex items-center gap-1"
                    title={t('flows.flows_editor.alle_runs')}
                >
                    <History size={14} /> {t('flows.flows_editor.runs')}
                </button>
                <button
                    onClick={async () => {
                        if (!jwt) return;
                        try {
                            const r = await flowsGateway.startInstance(jwt, template.id);
                            toast.success('Run gestartet');
                            navigate(`/flows/${template.id}/runs/${r.instance.id}`);
                        } catch (err) {
                            toast.error('Start fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
                        }
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-1"
                >
                    <Play size={14} /> {t('flows.flows_editor.test-run')}
                </button>
            </div>

            {/* Canvas + Properties */}
            <div className="flex-1 flex overflow-hidden">
                {/* Bausteine-Sidebar links (vertikale Liste, alle gruppen) */}
                <KindPicker kinds={kinds} apps={apps} onAdd={handleAddComponent} />
                <div className="flex-1 relative" onDragOver={handleDragOver} onDrop={handleDrop}>
                    <ReactFlow
                        nodes={rfNodes}
                        edges={rfEdges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeDragStop={onNodeDragStop}
                        onEdgeClick={(_e, edge) => setSelectedEdgeId(edge.id)}
                        nodeTypes={nodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.2 }}
                    >
                        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                        <Controls />
                        <MiniMap zoomable pannable />
                    </ReactFlow>
                </div>

                {/* Properties-Panel */}
                {selectedComponent && (
                    <PropertiesPanel
                        component={selectedComponent}
                        kind={kindByKey(selectedComponent.kind)}
                        onClose={() => setSelectedId(null)}
                        onDelete={() => handleDeleteComponent(selectedComponent.id)}
                        onUpdated={(c) => setComponents(cs => cs.map(x => x.id === c.id ? c : x))}
                        jwt={jwt!}
                    />
                )}
            </div>

            {/* Edge-Condition-Editor Modal */}
            {selectedEdgeId && jwt && (() => {
                const edge = edges.find(e => e.id === selectedEdgeId);
                if (!edge) return null;
                return (
                    <EdgeConditionEditor
                        jwt={jwt}
                        edge={edge}
                        onClose={() => setSelectedEdgeId(null)}
                        onUpdated={(newEdge) => {
                            setEdges(es => es.filter(e => e.id !== edge.id).concat(newEdge));
                            setSelectedEdgeId(null);
                        }}
                        onDeleted={() => {
                            setEdges(es => es.filter(e => e.id !== edge.id));
                            setSelectedEdgeId(null);
                        }}
                    />
                );
            })()}
        </div>
    );
}

// ─── Kind-Picker (drag-source ist Phase 5.5+, hier reicht Click-to-Add) ────

function KindPicker({ kinds, apps, onAdd }: { kinds: ComponentKind[]; apps: AppMeta[]; onAdd: (k: ComponentKind) => void }) {
    const t = useT();
    // Gruppieren nach appKind, App-Metadaten kommen vom Backend (gefiltert
    // nach aktiven Modulen, daher kommen Crisis-Bausteine z.B. nur wenn der
    // Tenant das Crisis-Modul installiert hat).
    const grouped = kinds.reduce<Record<string, ComponentKind[]>>((acc, k) => {
        (acc[k.appKind] = acc[k.appKind] ?? []).push(k);
        return acc;
    }, {});
    // System-Apps zuerst (flow-core etc.), dann Module-Apps alphabetisch.
    const orderedApps = [...apps].sort((a, b) => {
        if (a.isSystemApp !== b.isSystemApp) return a.isSystemApp ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
    });

    return (
        <aside className="w-52 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <div className="p-3 sticky top-0 bg-white border-b border-gray-100">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t('flows.flows_editor.bausteine')}</div>
                <p className="mt-0.5 text-[10px] text-gray-400">{t('flows.flows_editor.klicken_oder_in_canvas_ziehen')}</p>
            </div>
            <div className="p-3 space-y-4">
                {orderedApps.filter(a => grouped[a.appKind]?.length).map(app => (
                    <div key={app.appKind}>
                        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            {app.displayName}
                        </div>
                        <div className="space-y-1">
                            {grouped[app.appKind].map(k => {
                                const Icon = iconForKind(k.designer?.icon);
                                const colorCls = colorClassForKind(k.designer?.color);
                                return (
                                    <button
                                        key={k.key}
                                        draggable
                                        onDragStart={(evt) => {
                                            evt.dataTransfer.setData('application/prilog-component-kind', JSON.stringify(k));
                                            evt.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        onClick={() => onAdd(k)}
                                        className="w-full px-2 py-1.5 border border-gray-200 bg-white rounded-md flex items-center gap-2 text-xs text-left hover:bg-gray-50 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
                                        title={k.designer?.description ?? k.key}
                                    >
                                        <span className={`flex size-5 items-center justify-center rounded shrink-0 ${colorCls}`}>
                                            <Icon size={11} />
                                        </span>
                                        <span className="truncate text-gray-700">{k.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}

// ─── PropertiesPanel ────────────────────────────────────────────────────────

interface PropertiesPanelProps {
    component: ProcessComponent;
    kind: ComponentKind | null;
    onClose: () => void;
    onDelete: () => void;
    onUpdated: (c: ProcessComponent) => void;
    jwt: string;
}

function PropertiesPanel({ component, kind, onClose, onDelete, onUpdated, jwt }: PropertiesPanelProps): JSX.Element {
    const t = useT();
    const [label, setLabel] = useState(component.label);
    const [config, setConfig] = useState<Record<string, unknown>>(component.config);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        setLabel(component.label);
        setConfig(component.config);
    }, [component]);

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            const r = await flowsGateway.updateComponent(jwt, component.id, { label, config });
            onUpdated(r.component);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
        } finally {
            setSaving(false);
        }
    };

    const schema = kind?.designer?.propertiesSchema ?? null;

    return (
        <div className="w-96 border-l border-gray-200 bg-white flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <div className="font-semibold text-sm">{kind?.label ?? 'Eigenschaften'}</div>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
                    <X size={16} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {kind?.designer?.description && (
                    <div className="text-xs text-gray-500">{kind.designer.description}</div>
                )}
                <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">{t('common.type')}</label>
                    <div className="text-sm font-mono bg-gray-50 px-2 py-1 rounded">{component.kind}</div>
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">{t('flows.flows_editor.label')}</label>
                    <input
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                </div>
                {schema && schema.length > 0 ? (
                    <div className="border-t border-gray-100 pt-3">
                        <GenericPropertiesForm
                            component={{ ...component, config }}
                            schema={schema}
                            onChange={(patch) => setConfig(c => ({ ...c, ...patch }))}
                        />
                    </div>
                ) : (
                    <div className="border-t border-gray-100 pt-3">
                        <label className="text-xs font-medium text-gray-500 block mb-1">{t('flows.flows_editor.config_json')}</label>
                        <textarea
                            value={JSON.stringify(config, null, 2)}
                            onChange={e => {
                                try { setConfig(JSON.parse(e.target.value)); } catch { /* user weiter tippen lassen */ }
                            }}
                            rows={10}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs font-mono"
                        />
                        <p className="mt-1 text-[10px] text-gray-400">{t('flows.flows_editor.kein_schema_fuer_dieses_kind_roh-json')}</p>
                    </div>
                )}
                {saveError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                        {saveError}
                    </div>
                )}
            </div>
            <div className="border-t border-gray-200 p-3 flex items-center justify-between">
                <button
                    onClick={onDelete}
                    className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm flex items-center gap-1"
                >
                    <Trash2 size={14} /> {t('common.delete')}
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50"
                >
                    {saving ? 'Speichere…' : t('common.save')}
                </button>
            </div>
        </div>
    );
}

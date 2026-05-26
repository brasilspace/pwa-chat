/**
 * topology-canvas.tsx — 2D Topologie-Graph Canvas (React Flow)
 *
 * Nutzt @xyflow/react fuer professionelles Graph-Editing:
 *   - Zoom + Pan built-in
 *   - Edge-Drawing mit Handles/Ports
 *   - Custom Nodes mit unserer Element-Registry
 */

import { type JSX, useCallback, useMemo, useState } from 'react';
import {
    ReactFlow, Background, Controls, MiniMap,
    Handle, Position, useNodesState, useEdgesState,
    type Node, type Edge, type Connection, type NodeProps,
    MarkerType, BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { chatStore } from '@/features/chat/chat-store';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { cn } from '@/lib/utils';
import { Paintbrush, Flag } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { ELEMENT_TYPES, getElementDef, isElementVisible } from './cascade-elements';
import { useT } from "@/lib/i18n/use-t";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GraphNode {
    id: string;
    title: string;
    color: string | null;
    posX: number;
    posY: number;
    filterMode: string;
    formMode: string;
    gateMode: string;
    gateDelayMin: number;
    spaces: Array<{ id: string; spaceId: string }>;
    nodeStatus?: { status: string; confirmedBy: string | null };
    nodeType?: string;
    nodeConfig?: any;
    nodeState?: any;
}

export interface GraphEdge {
    id: string;
    sourceColumnId: string;
    targetColumnId: string;
    direction: string;
    autoForward: boolean;
    condition?: { answer?: string; routing?: string } | null;
}

interface TopologyCanvasProps {
    nodes: GraphNode[];
    edges: GraphEdge[];
    allSpaces: SpaceItem[];
    boardId: string;
    boardName: string;
    jwt: string;
    onNodeClick: (nodeId: string) => void;
    onNodeMove: (nodeId: string, posX: number, posY: number) => void;
    onEdgeCreate: (sourceId: string, targetId: string, exitInfo?: { exitType: string; elementIdx?: number }) => void;
    onEdgeDelete: (edgeId: string) => void;
    onEdgeUpdate: (edgeId: string, patch: Record<string, unknown>) => void;
    onNodeCreate: (posX: number, posY: number) => void;
    onStatusChange: (nodeId: string, status: string) => void;
    onNodeDelete: (nodeId: string) => void;
    onNodeColorChange: (nodeId: string, color: string) => void;
    onNodeStateChange: (nodeId: string, nodeState: any) => void;
    onAddSpaceToNode: (nodeId: string) => void;
    onConvertNode: (nodeId: string, nodeType: string) => void;
    onDesignNode: (nodeId: string) => void;
    onRemoveSpaceFromNode: (entryId: string) => void;
    startColumnId?: string | null;
    onSetStartNode: (nodeId: string) => void;
}

// ─── Grid Constants ─────────────────────────────────────────────────────────

const GRID_X = 220;
const GRID_Y = 180;
const NODE_W = 200;

const NODE_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

// ─── Custom Node Component ──────────────────────────────────────────────────

function CascadeNode({ data, selected }: NodeProps) {
    const t = useT();
    const d = data as any;
    const node: GraphNode = d.graphNode;
    const allSpaces: SpaceItem[] = d.allSpaces;
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [colorPickerOpen, setColorPickerOpen] = useState(false);

    const elements = node.nodeConfig?.elements ?? [];
    const borderColor = node.color ?? '#6b7280';

    // Warnungen berechnen
    const warnings: string[] = [];
    const allNodeIds: Set<string> = d.allNodeIds ?? new Set();
    const hasOutgoing: boolean = d.hasOutgoing ?? false;
    for (const el of elements) {
        if (el.thenGoTo && !allNodeIds.has(el.thenGoTo)) warnings.push(`"${el.question ?? el.label ?? el.type}": Ziel-Knoten gelöscht`);
        if (el.thenGoToYes && !allNodeIds.has(el.thenGoToYes)) warnings.push(`"${el.yesLabel ?? 'Ja'}"-Pfad: Ziel-Knoten gelöscht`);
        if (el.thenGoToNo && !allNodeIds.has(el.thenGoToNo)) warnings.push(`"${el.noLabel ?? 'Nein'}"-Pfad: Ziel-Knoten gelöscht`);
    }
    if (!hasOutgoing && elements.length === 0 && !d.isStart) warnings.push('Sackgasse: keine Elemente, keine ausgehende Verbindung');

    return (
        <div className={cn("rounded-xl border-2 bg-card shadow-sm", selected && "ring-2 ring-primary ring-offset-2")}
            style={{ borderColor: warnings.length > 0 ? '#ef4444' : borderColor, width: NODE_W, minHeight: 60 }}>

            {/* Input Handle (top) */}
            <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />

            {/* Header */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b" style={{ borderColor: borderColor + '30' }}>
                <div className="relative">
                    <div className="size-2.5 rounded-full cursor-pointer hover:ring-2 hover:ring-primary/40"
                        style={{ backgroundColor: borderColor }}
                        onClick={() => setColorPickerOpen(!colorPickerOpen)} />
                    {colorPickerOpen && (
                        <div className="absolute top-full left-0 mt-1 flex gap-1 bg-card border rounded-lg p-1.5 z-50 shadow-lg">
                            {NODE_COLORS.map(c => (
                                <button key={c} onClick={() => { d.onColorChange(node.id, c); setColorPickerOpen(false); }}
                                    className="size-5 rounded-full border-2 border-border/40 hover:scale-125 transition-transform"
                                    style={{ backgroundColor: c }} />
                            ))}
                        </div>
                    )}
                </div>
                <span className="text-[8px] text-muted-foreground/50 font-mono">#{d.nodeIndex + 1}</span>
                <span className="text-[11px] font-semibold truncate flex-1">{node.title}</span>
                <button onClick={(e) => { e.stopPropagation(); d.onSetStart(node.id); }} title={t('cascade.topology_canvas.als_startknoten_setzen')}
                    className={cn("size-5 flex items-center justify-center rounded-md transition-colors shrink-0",
                        d.isStart ? "bg-emerald-500/20 text-emerald-600" : "text-muted-foreground/40 hover:text-emerald-500 hover:bg-emerald-500/10")}>
                    <Flag className="size-3.5" style={d.isStart ? { fill: 'currentColor' } : undefined} />
                </button>
                <button onClick={() => d.onDesign(node.id)}
                    className="size-4 flex items-center justify-center rounded hover:bg-primary/20 text-muted-foreground hover:text-primary">
                    <Paintbrush className="size-3" />
                </button>
                <button onClick={() => { if (confirm(`"${node.title}" löschen?`)) d.onDelete(node.id); }}
                    className="size-4 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
                    <MaterialIcon name="close" size={16} className="size-3" />
                </button>
            </div>

            {/* Body */}
            <div className="px-2 py-1 relative">
                {/* Internal flow line */}
                {(elements.length > 0 || node.spaces.length > 0) && (
                    <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary/15 rounded-full" />
                )}

                {/* Spaces */}
                {node.spaces.map(cs => {
                    const sp = allSpaces.find(s => s.id === cs.spaceId);
                    return (
                        <div key={cs.id} className="flex items-center gap-1 py-0.5 group/space">
                            <span className="text-[9px] truncate flex-1 text-muted-foreground">{sp?.name ?? cs.spaceId}</span>
                            <button onClick={() => d.onRemoveSpace(cs.id)}
                                className="size-3 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive opacity-0 group-hover/space:opacity-100">
                                <MaterialIcon name="close" size={16} className="size-2" />
                            </button>
                        </div>
                    );
                })}

                {/* Elements */}
                {elements.map((el: any, idx: number) => {
                    const def = getElementDef(el.type);
                    if (!def) return null;
                    if (!isElementVisible(el, elements, node.nodeState)) return null;
                    const hasBranch = !!el.thenGoTo || !!el.thenGoToYes || el.type === 'decision';
                    return (
                        <div key={idx} className="relative border-t border-border/30 mt-1 pt-1">
                            <div className={cn("absolute -left-2 top-2 size-1.5 rounded-full", hasBranch ? "bg-primary" : "bg-primary/30")} />
                            {def.renderGraph({ el, idx, nodeState: node.nodeState, allElements: elements, onStateChange: (s) => d.onStateChange(node.id, s), t })}
                        </div>
                    );
                })}

                {/* Warnungen */}
                {warnings.length > 0 && (
                    <div className="mt-1 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-1.5 py-1">
                        {warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-1 text-[8px] text-red-600 dark:text-red-400">
                                <span className="shrink-0">⚠</span>
                                <span>{w}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add menu */}
                {addMenuOpen ? (
                    <div className="flex flex-col gap-0.5 mt-1 p-1 rounded-lg border bg-card shadow-md">
                        <button onClick={() => { setAddMenuOpen(false); d.onAddSpace(node.id); }}
                            className="flex items-center gap-1 py-0.5 text-[9px] text-muted-foreground hover:text-primary">
                            <MaterialIcon name="chat" size={16} className="size-2.5" /> {t('cascade.topology_canvas.space')}
                        </button>
                        {ELEMENT_TYPES.map(def => (
                            <button key={def.type} onClick={() => { setAddMenuOpen(false); d.onConvert(node.id, def.type); }}
                                className={cn("flex items-center gap-1 py-0.5 text-[9px] text-muted-foreground transition-colors", def.color)}>
                                {def.icon} {def.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <button onClick={() => setAddMenuOpen(true)}
                        className="flex items-center gap-1 py-0.5 text-[9px] text-muted-foreground/50 hover:text-primary transition-colors w-full mt-0.5">
                        <MaterialIcon name="add" size={16} className="size-2.5" /> {t('cascade.topology_canvas.hinzufuegen')}
                    </button>
                )}
            </div>

            {/* Output Handle (bottom) */}
            <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />

            {/* Side handles for decision elements */}
            {elements.some((el: any) => el.type === 'decision') && (
                <>
                    {(() => {
                        // Exakte Pixel-Position der Ja/Nein Buttons berechnen
                        // Header: ~28px, Body padding: 4px
                        let y = 28 + 4;
                        // Spaces: je ~18px
                        y += node.spaces.length * 18;
                        // Elemente vor dem Decision: je ~23px (border-t 1 + mt 4 + pt 4 + content ~14)
                        const decIdx = elements.findIndex((el: any) => el.type === 'decision');
                        for (let i = 0; i < decIdx; i++) {
                            if (!isElementVisible(elements[i], elements, node.nodeState)) continue;
                            const def = getElementDef(elements[i].type);
                            y += 9 + (def ? def.heightRows(elements[i]) * 14 : 14);
                        }
                        // Decision: border-t + mt + pt = 9px, Frage-Label = 14px
                        y += 9 + 14;
                        // Jetzt sind wir auf Oberkante der Buttons
                        return (
                            <>
                                <Handle type="source" position={Position.Right} id="yes"
                                    className="!w-3.5 !h-3.5 !bg-emerald-500 !border-2 !border-white !right-[-7px]"
                                    style={{ top: y + 4, position: 'absolute' }} />
                                <Handle type="source" position={Position.Right} id="no"
                                    className="!w-3.5 !h-3.5 !bg-red-500 !border-2 !border-white !right-[-7px]"
                                    style={{ top: y + 18, position: 'absolute' }} />
                                <div className="absolute right-[-28px] text-[7px] font-bold text-emerald-600" style={{ top: y }}>{t('cascade.topology_canvas.ja')}</div>
                                <div className="absolute right-[-38px] text-[7px] font-bold text-red-600" style={{ top: y + 14 }}>{t('cascade.topology_canvas.nein')}</div>
                            </>
                        );
                    })()}
                </>
            )}
        </div>
    );
}

const nodeTypes = { cascade: CascadeNode };

// ─── Main Component ─────────────────────────────────────────────────────────

export function TopologyCanvas({
    nodes: graphNodes, edges: graphEdges, allSpaces, boardId, boardName, jwt,
    onNodeClick, onNodeMove, onEdgeCreate, onEdgeDelete, onEdgeUpdate,
    onNodeCreate, onStatusChange, onNodeDelete, onNodeColorChange,
    onNodeStateChange, onAddSpaceToNode, onConvertNode, onDesignNode, onRemoveSpaceFromNode,
    startColumnId, onSetStartNode,
}: TopologyCanvasProps): JSX.Element {
    const t = useT();

    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

    // Vorberechnete Sets für Warnungen
    const allNodeIds = useMemo(() => new Set(graphNodes.map(n => n.id)), [graphNodes]);
    const outgoingMap = useMemo(() => {
        const m = new Set<string>();
        for (const e of graphEdges) m.add(e.sourceColumnId);
        return m;
    }, [graphEdges]);

    // Convert our data to React Flow format
    const rfNodes: Node[] = useMemo(() => graphNodes.map((n, idx) => ({
        id: n.id,
        type: 'cascade',
        position: { x: n.posX * GRID_X, y: n.posY * GRID_Y },
        data: {
            graphNode: n,
            allSpaces,
            allNodeIds,
            hasOutgoing: outgoingMap.has(n.id),
            nodeIndex: idx,
            isStart: startColumnId ? n.id === startColumnId : idx === 0,
            onSetStart: onSetStartNode,
            onDesign: onDesignNode,
            onDelete: onNodeDelete,
            onColorChange: onNodeColorChange,
            onStateChange: onNodeStateChange,
            onAddSpace: onAddSpaceToNode,
            onConvert: onConvertNode,
            onRemoveSpace: onRemoveSpaceFromNode,
        },
    })), [graphNodes, allSpaces, startColumnId, onSetStartNode, allNodeIds, outgoingMap]);

    const rfEdges: Edge[] = useMemo(() => graphEdges.map(e => {
        const cond = e.condition as any;
        const label = cond?.routing
            ? (() => {
                const src = graphNodes.find(n => n.id === e.sourceColumnId);
                const [elKey, val] = (cond.routing as string).split(':');
                const elIdx = parseInt(elKey.replace('el_', ''));
                const el = src?.nodeConfig?.elements?.[elIdx];
                if (el) {
                    if (val === 'yes' || val === 'then') return el.yesLabel ?? el.thenLabel ?? 'Ja';
                    if (val === 'no' || val === 'else') return el.noLabel ?? el.elseLabel ?? 'Nein';
                    const opt = el.options?.find((o: any) => o.id === val);
                    return opt?.label ?? val;
                }
                return '';
            })()
            : '';

        const isSelected = e.id === selectedEdgeId;
        return {
            id: e.id,
            source: e.sourceColumnId,
            target: e.targetColumnId,
            label: isSelected ? '✕ Löschen' : (label || undefined),
            labelStyle: isSelected ? { cursor: 'pointer', fill: '#ef4444', fontWeight: 700, fontSize: 12 } : undefined,
            labelBgStyle: isSelected ? { fill: '#fef2f2', stroke: '#ef4444', strokeWidth: 1 } : undefined,
            labelBgPadding: isSelected ? [6, 4] as [number, number] : undefined,
            type: 'smoothstep',
            pathOptions: { borderRadius: 12, offset: 20 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            style: { strokeWidth: isSelected ? 3 : 2, stroke: isSelected ? '#ef4444' : undefined },
            animated: e.autoForward,
        };
    }), [graphEdges, graphNodes, selectedEdgeId]);

    // Handlers
    const onNodesChange = useCallback((changes: any[]) => {
        for (const change of changes) {
            if (change.type === 'position' && change.position && change.dragging === false) {
                const posX = Math.max(0, Math.round(change.position.x / GRID_X));
                const posY = Math.max(0, Math.round(change.position.y / GRID_Y));
                onNodeMove(change.id, posX, posY);
            }
        }
    }, [onNodeMove]);

    const onConnect = useCallback((connection: Connection) => {
        if (connection.source && connection.target) {
            let exitInfo: { exitType: string; elementIdx: number } | undefined;
            if (connection.sourceHandle === 'yes' || connection.sourceHandle === 'no') {
                // Finde den Index des ersten Decision-Elements
                const sourceNode = graphNodes.find(n => n.id === connection.source);
                const decIdx = (sourceNode?.nodeConfig?.elements ?? []).findIndex((el: any) => el.type === 'decision');
                if (decIdx >= 0) {
                    exitInfo = {
                        exitType: connection.sourceHandle === 'yes' ? 'sideYes' : 'sideNo',
                        elementIdx: decIdx,
                    };
                }
            }
            onEdgeCreate(connection.source, connection.target, exitInfo);
        }
    }, [onEdgeCreate, graphNodes]);

    const onEdgeClick = useCallback((_: any, edge: Edge) => {
        setSelectedEdgeId(prev => prev === edge.id ? null : edge.id);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedEdgeId(null);
    }, []);

    // Finde die Quell-Elemente fuer das Edge-Routing-Dropdown
    const selectedGraphEdge = selectedEdgeId ? graphEdges.find(e => e.id === selectedEdgeId) : null;
    const sourceNode = selectedGraphEdge ? graphNodes.find(n => n.id === selectedGraphEdge.sourceColumnId) : null;
    const sourceElements: Array<{ idx: number; label: string; options: Array<{ value: string; label: string }> }> = [];
    if (sourceNode) {
        const els = sourceNode.nodeConfig?.elements ?? [];
        els.forEach((el: any, idx: number) => {
            const name = el.question ?? el.label ?? `#${idx + 1}`;
            if (el.type === 'decision') {
                sourceElements.push({
                    idx, label: name, options: [
                        { value: `el_${idx}:yes`, label: el.yesLabel ?? 'Ja' },
                        { value: `el_${idx}:no`, label: el.noLabel ?? 'Nein' },
                    ]
                });
            } else if ((el.type === 'dropdown' || el.type === 'radio') && el.options) {
                sourceElements.push({ idx, label: name, options: el.options.map((o: any) => ({ value: `el_${idx}:${o.id}`, label: o.label })) });
            }
        });
    }

    return (
        <div className="w-full h-full relative">
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onConnect={onConnect}
                onEdgeClick={onEdgeClick}
                onNodeDoubleClick={(_, node) => onDesignNode(node.id)}
                onPaneClick={onPaneClick}
                snapToGrid
                snapGrid={[GRID_X / 4, GRID_Y / 4]}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                deleteKeyCode={null}
                minZoom={0.2}
                maxZoom={3}
                defaultEdgeOptions={{ type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }}
            >
                <Background variant={BackgroundVariant.Dots} gap={[GRID_X / 4, GRID_Y / 4]} size={1} />
                <Controls showInteractive={false} />
                <MiniMap nodeStrokeWidth={3} pannable zoomable />
            </ReactFlow>

            {/* Edge Popover */}
            {selectedEdgeId && selectedGraphEdge && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 rounded-xl border bg-card shadow-lg p-3 min-w-[240px]"
                    onClick={(e) => e.stopPropagation()}>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">{t('cascade.topology_canvas.verbindung')}</p>
                    {sourceElements.length > 0 && (
                        <div className="mb-2">
                            <label className="text-[9px] text-muted-foreground">{t('cascade.topology_canvas.bedingung_wann_diese_kante')}</label>
                            <select value={selectedGraphEdge.condition?.routing as string ?? ''}
                                onChange={(e) => {
                                    onEdgeUpdate(selectedEdgeId, { condition: e.target.value ? { routing: e.target.value } : null });
                                    setSelectedEdgeId(null);
                                }}
                                className="mt-0.5 h-7 w-full rounded-lg border bg-background px-2 text-[10px] outline-none focus:ring-1 focus:ring-primary">
                                <option value="">{t('cascade.topology_canvas.immer_standard')}</option>
                                {sourceElements.map(se => (
                                    <optgroup key={se.idx} label={se.label}>
                                        {se.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="flex gap-1">
                        <button onClick={() => setSelectedEdgeId(null)}
                            className="flex-1 rounded-md border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted">{t('cascade.topology_canvas.schliessen')}</button>
                        <button onClick={() => { onEdgeDelete(selectedEdgeId); setSelectedEdgeId(null); }}
                            className="rounded-md border border-destructive/30 px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10">{t('cascade.topology_canvas.loeschen')}</button>
                    </div>
                </div>
            )}
        </div>
    );
}

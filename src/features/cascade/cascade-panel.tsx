/**
 * cascade-panel.tsx — Kaskaden-Board UI
 *
 * Topologie-Graph mit interaktiven Knoten und Kanten.
 * FocusChat oeffnet Chat inline, Freigabe-Dialog fuer Pending-Messages.
 */

import { type JSX, useState, useEffect, useCallback, useRef, useSyncExternalStore, Component, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { useSpaces } from '@/features/spaces/use-spaces';
import { useChatRoom } from '@/features/chat/use-chat-room';
import { chatStore } from '@/features/chat/chat-store';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { ChatComposer } from '@/components/chat/chat-composer';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { cn } from '@/lib/utils';
import { Loader2, Forward, XCircle } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { env } from '@/core/config/env';
import { TopologyCanvas } from './topology-canvas';
import { CollabEditor } from './collab-editor';
import { CascadeDesigner, CascadePlayer, CascadeFlowLog, CascadeResults, CascadeRunsPanel } from './cascade-designer';
import { getElementDef, ELEMENT_TYPES } from './cascade-elements';
import { useT } from "@/lib/i18n/use-t";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Board {
    id: string;
    name: string;
    startColumnId?: string | null;
    version?: number;
    status?: string;
    columns: Column[];
}

interface Column {
    id: string;
    title: string;
    color: string | null;
    sortOrder: number;
    filterMode: string;
    filterKeywords: string | null;
    formMode: string;
    formTemplate: string | null;
    gateMode: string;
    gateDelayMin: number;
    gateApprover: string | null;
    nodeType?: string;
    nodeConfig?: any;
    nodeState?: any;
    spaces: ColumnSpace[];
}

interface ColumnSpace {
    id: string;
    spaceId: string;
    sortOrder: number;
}

interface PendingMessage {
    id: string;
    originalMessage: string;
    transformedMessage: string;
    status: string;
    targetSpaceId: string;
    createdAt: string;
}

// ─── API ────────────────────────────────────────────────────────────────────

const API = `${env.platformBaseUrl}/platform/v1`;

async function fetchJson<T>(path: string, jwt: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ─── Label Maps ─────────────────────────────────────────────────────────────


// ─── Error Boundary (DEBUG) ─────────────────────────────────────────────────

class CascadeErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    state: { error: Error | null } = { error: null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    render() {
        if (this.state.error) return (
            <div className="p-4 bg-destructive/10 text-destructive text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[50vh]">
                <p className="font-bold mb-2">Cascade-Fehler</p>
                <p>{this.state.error.message}</p>
                <p className="mt-2 text-[10px] opacity-60">{this.state.error.stack}</p>
            </div>
        );
        return this.props.children;
    }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CascadePanel({ space, boardId: requestedBoardId }: { space: SpaceItem; boardId?: string }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const { spaces: allSpaces } = useSpaces();

    const [board, setBoard] = useState<Board | null>(null);
    const [loading, setLoading] = useState(true);
    const [focusColumnId, setFocusColumnId] = useState<string | null>(null);
    const [focusSpaceId, setFocusSpaceId] = useState<string | null>(null);
    const [collabDocId, setCollabDocId] = useState<string | null>(null);
    const [addingSpaceTo, setAddingSpaceTo] = useState<string | null>(null);
    const [designNodeId, setDesignNodeId] = useState<string | null>(null);
    const [playerOpen, setPlayerOpen] = useState(false);
    const [logOpen, setLogOpen] = useState(false);
    const [resultsOpen, setResultsOpen] = useState(false);
    const [runsOpen, setRunsOpen] = useState(false);
    const [pendingByColumn, setPendingByColumn] = useState<Record<string, PendingMessage[]>>({});
    const [approvalDialog, setApprovalDialog] = useState<PendingMessage | null>(null);
    const [approvalEdit, setApprovalEdit] = useState('');
    const [undoStack, setUndoStack] = useState<Array<{ type: string; data: any }>>([]);

    const pushUndo = useCallback((entry: { type: string; data: any }) => {
        setUndoStack(prev => [...prev.slice(-19), entry]);
    }, []);

    // Load board
    const loadBoard = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            // Wenn eine bestimmte Board-ID angefragt ist, lade per Graph-Endpoint
            if (requestedBoardId) {
                const data = await fetchJson<{ board: Board }>(`/cascade-boards/${requestedBoardId}/graph`, jwt);
                setBoard(data.board);
            } else {
                const data = await fetchJson<{ boards: Board[] }>(`/spaces/${space.id}/cascade-boards`, jwt);
                if (data.boards.length > 0) {
                    setBoard(data.boards[0]);
                } else {
                    const created = await fetchJson<{ board: Board }>(`/spaces/${space.id}/cascade-boards`, jwt, {
                        method: 'POST',
                        body: JSON.stringify({ name: `${space.name}` }),
                    });
                    setBoard(created.board);
                }
            }
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }, [jwt, space.id, space.name, requestedBoardId]);

    const handleUndo = useCallback(async () => {
        if (!jwt || !board || undoStack.length === 0) return;
        const last = undoStack[undoStack.length - 1];
        setUndoStack(prev => prev.slice(0, -1));
        try {
            if (last.type === 'deleteNode') {
                await fetchJson(`/cascade-boards/${board.id}/columns`, jwt, {
                    method: 'POST', body: JSON.stringify(last.data),
                });
            } else if (last.type === 'deleteEdge') {
                await fetchJson(`/cascade-boards/${board.id}/edges`, jwt, {
                    method: 'POST', body: JSON.stringify(last.data),
                });
            }
            loadBoard();
        } catch { /* ignore */ }
    }, [jwt, board, undoStack, loadBoard]);

    useEffect(() => { loadBoard(); }, [loadBoard]);

    // Load pending messages for all columns
    const loadPending = useCallback(async () => {
        if (!jwt || !board) return;
        const pending: Record<string, PendingMessage[]> = {};
        for (const col of board.columns) {
            if (col.gateMode !== 'open') {
                try {
                    const data = await fetchJson<{ messages: PendingMessage[] }>(`/cascade-columns/${col.id}/pending`, jwt);
                    if (data.messages.length > 0) pending[col.id] = data.messages;
                } catch { /* ignore */ }
            }
        }
        setPendingByColumn(pending);
    }, [jwt, board]);

    useEffect(() => { loadPending(); }, [loadPending]);

    // Forward message through lens
    const handleForward = async (columnId: string, message: string, isMarked: boolean) => {
        if (!jwt) return;
        const result = await fetchJson<{ success: boolean; action: string; message?: string }>(`/cascade-columns/${columnId}/forward`, jwt, {
            method: 'POST',
            body: JSON.stringify({ message, isMarked }),
        });
        loadPending();
        return result;
    };

    // Approval
    const handleApprove = async (messageId: string, editedMessage?: string) => {
        if (!jwt) return;
        await fetchJson(`/cascade-pending/${messageId}/approve`, jwt, {
            method: 'POST',
            body: JSON.stringify({ editedMessage }),
        });
        setApprovalDialog(null);
        loadPending();
    };

    const handleReject = async (messageId: string) => {
        if (!jwt) return;
        await fetchJson(`/cascade-pending/${messageId}/reject`, jwt, { method: 'POST' });
        setApprovalDialog(null);
        loadPending();
    };

    if (loading) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }
    if (!board) {
        return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('cascade.cascade.board_konnte_nicht_geladen_werden')}</div>;
    }

    return (
        <div className="relative flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
                <span className="text-xs font-semibold">{board.name}</span>
                <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                    board.status === 'active' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : board.status === 'archived' ? "bg-muted text-muted-foreground"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400")}>
                    {board.status === 'active' ? t('common.active') : board.status === 'archived' ? 'Archiviert' : 'Entwurf'}
                    {board.version ? ` v${board.version}` : ''}
                </span>
                {board.status !== 'active' && (
                    <button onClick={async () => {
                        if (!jwt) return;
                        await fetchJson(`/cascade-boards/${board.id}`, jwt, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
                        setBoard({ ...board, status: 'active', version: (board.version ?? 1) + 1 });
                    }} className="rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-600 transition-colors">
                        {t('cascade.cascade.veroeffentlichen')}
                    </button>
                )}
                {board.status === 'active' && (
                    <button onClick={async () => {
                        if (!jwt) return;
                        await fetchJson(`/cascade-boards/${board.id}`, jwt, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) });
                        setBoard({ ...board, status: 'draft' });
                    }} className="rounded-md px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors">
                        {t('cascade.cascade.bearbeiten')}
                    </button>
                )}
                {undoStack.length > 0 && (
                    <button onClick={handleUndo}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        {t('cascade.cascade.zurueck')}
                    </button>
                )}
                <div className="flex-1" />
                <button
                    onClick={async () => {
                        if (!jwt) return;
                        const title = prompt('Knotenname:');
                        if (!title?.trim()) return;
                        await fetchJson(`/cascade-boards/${board.id}/columns`, jwt, { method: 'POST', body: JSON.stringify({ title: title.trim(), posX: 0, posY: 0 }) });
                        loadBoard();
                    }}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    <MaterialIcon name="add" size={16} className="size-3" /> {t('cascade.cascade.knoten')}
                </button>
                {board.columns.length > 0 && (
                    <>
                        <button onClick={async () => {
                            if (!jwt || !board) return;
                            const name = prompt('Vorlagenname:', board.name + ' (Vorlage)');
                            if (!name?.trim()) return;
                            await fetchJson(`/cascade-boards/${board.id}/save-as-template`, jwt, { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
                            alert('Vorlage gespeichert!');
                        }} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            {t('cascade.cascade.vorlage')}
                        </button>
                        <button onClick={() => setRunsOpen(true)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            {t('cascade.cascade.runs')}
                        </button>
                        <button onClick={() => setResultsOpen(true)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            {t('cascade.cascade.ergebnisse')}
                        </button>
                        <button onClick={() => setLogOpen(true)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            {t('cascade.cascade.protokoll')}
                        </button>
                        <button onClick={() => setPlayerOpen(true)}
                            className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 transition-colors">
                            {t('cascade.cascade.abspielen')}
                        </button>
                    </>
                )}
            </div>

            {/* Approval Dialog */}
            {approvalDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setApprovalDialog(null)}>
                    <div className="w-full max-w-lg rounded-xl bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 border-b px-4 py-3">
                            <MaterialIcon name="shield" size={16} className="size-4 text-amber-500" />
                            <h3 className="text-sm font-semibold">{t('cascade.cascade.freigabe_erforderlich')}</h3>
                            <div className="flex-1" />
                            <button onClick={() => setApprovalDialog(null)} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div>
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('cascade.cascade.original')}</label>
                                <p className="mt-1 rounded-lg bg-muted/40 px-3 py-2 text-sm">{approvalDialog.originalMessage}</p>
                            </div>
                            <div>
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('cascade.cascade.wird_gesendet_als')}</label>
                                <textarea
                                    value={approvalEdit}
                                    onChange={(e) => setApprovalEdit(e.target.value)}
                                    className="mt-1 h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 border-t px-4 py-3">
                            <button onClick={() => handleApprove(approvalDialog.id, approvalEdit)}
                                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
                                <MaterialIcon name="check" size={16} className="size-3.5" /> {t('cascade.cascade.freigeben')}
                            </button>
                            <button onClick={() => handleReject(approvalDialog.id)}
                                className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-4 py-2 text-xs font-medium text-destructive">
                                <XCircle className="size-3.5" /> {t('cascade.cascade.verwerfen')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Graph View with Left Palette */}
            {board && !focusColumnId && (
                <div className="flex flex-1 min-h-0">
                    {/* Element Palette — permanente linke Spalte */}
                    <div className="w-48 shrink-0 border-r overflow-y-auto bg-muted/10 py-2">
                        <p className="px-3 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">{t('cascade.cascade.elemente')}</p>
                        {[
                            { key: 'input', label: 'Eingabe', types: ['decision', 'dropdown', 'checklist', 'radio', 'textfield', 'form', 'rating', 'quiz', 'table'] },
                            { key: 'display', label: 'Anzeige', types: ['info', 'video', 'notification'] },
                            { key: 'data', label: 'Daten', types: ['setVariable', 'createDocument', 'webhook'] },
                            { key: 'logic', label: 'Logik', types: ['condition', 'timestamp', 'delay'] },
                            { key: 'actions', label: 'Aktionen', types: ['link', 'space', 'createSpace', 'createTasks', 'button'] },
                            { key: 'flow', label: 'Flow-Steuerung', types: ['parallel_split', 'parallel_join', 'checkpoint'] },
                        ].map(cat => {
                            const defs = cat.types.map(_t => ELEMENT_TYPES.find(d => d.type === _t)).filter(Boolean) as typeof ELEMENT_TYPES;
                            return (
                                <div key={cat.key} className="mb-3 px-3">
                                    <p className="text-[8px] text-muted-foreground/60 uppercase tracking-widest mb-1">{cat.label}</p>
                                    <div className="space-y-0.5">
                                        {defs.map(def => (
                                            <button key={def.type}
                                                onClick={() => {
                                                    if (!designNodeId && board.columns.length > 0) {
                                                        // Oeffne den Designer fuer den ersten Knoten und fuege das Element hinzu
                                                        const firstCol = board.columns[0];
                                                        setDesignNodeId(firstCol.id);
                                                        // Element wird beim Designer-Save hinzugefuegt — hier nur visueller Hinweis
                                                    }
                                                }}
                                                draggable
                                                onDragStart={(e) => e.dataTransfer.setData('cascade-element-type', def.type)}
                                                className={cn("flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] transition-colors hover:bg-background hover:shadow-sm cursor-grab active:cursor-grabbing", def.color)}>
                                                {def.icon}
                                                <span className="truncate">{def.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Graph Canvas */}
                    <div className="flex-1 min-h-0">
                        <CascadeErrorBoundary>
                            <TopologyCanvas
                                nodes={board.columns.map(c => ({ ...c, posX: (c as any).posX ?? c.sortOrder, posY: (c as any).posY ?? 0 }))}
                                edges={(board as any).edges ?? []}
                                allSpaces={allSpaces}
                                boardId={board.id}
                                boardName={board.name}
                                jwt={jwt!}
                                onNodeClick={(nodeId) => {
                                    const col = board.columns.find(c => c.id === nodeId);
                                    if (col?.spaces.length) { setFocusColumnId(nodeId); setFocusSpaceId(col.spaces[0].spaceId); }
                                }}
                                onNodeMove={async (nodeId, posX, posY) => {
                                    if (!jwt || !board) return;
                                    // Lokaler State sofort aktualisieren (kein Board-Reload, behaelt Fokus)
                                    setBoard({
                                        ...board,
                                        columns: board.columns.map(c => c.id === nodeId ? { ...c, posX, posY } as any : c),
                                    });
                                    // Im Hintergrund speichern
                                    fetchJson(`/cascade-columns/${nodeId}/position`, jwt, { method: 'PATCH', body: JSON.stringify({ posX, posY }) }).catch(() => { });
                                }}
                                onEdgeCreate={async (sourceId, targetId, exitInfo) => {
                                    if (!jwt || !board) return;

                                    // Kante erstellen
                                    const res = await fetchJson<{ edge: { id: string } }>(`/cascade-boards/${board.id}/edges`, jwt, {
                                        method: 'POST', body: JSON.stringify({ sourceColumnId: sourceId, targetColumnId: targetId }),
                                    });

                                    // Side exit: Routing-Bedingung auf der Kante setzen + thenGoTo auf dem Element
                                    if (exitInfo && exitInfo.elementIdx !== undefined && res?.edge?.id) {
                                        const elIdx = exitInfo.elementIdx;
                                        const routingVal = exitInfo.exitType === 'sideYes' ? 'yes' : exitInfo.exitType === 'sideNo' ? 'no' : 'then';
                                        await fetchJson(`/cascade-edges/${res.edge.id}`, jwt, {
                                            method: 'PATCH', body: JSON.stringify({ condition: { routing: `el_${elIdx}:${routingVal}` } }),
                                        });
                                        // Auch thenGoTo auf dem Element setzen (für Player)
                                        const sourceNode = board.columns.find(c => c.id === sourceId);
                                        const existing = (sourceNode as any)?.nodeConfig ?? {};
                                        const elements = [...(existing.elements ?? [])];
                                        const el = elements[elIdx];
                                        if (el) {
                                            if (exitInfo.exitType === 'sideYes') el.thenGoToYes = targetId;
                                            else if (exitInfo.exitType === 'sideNo') el.thenGoToNo = targetId;
                                            else el.thenGoTo = targetId;
                                            await fetchJson(`/cascade-columns/${sourceId}`, jwt, {
                                                method: 'PATCH', body: JSON.stringify({ nodeConfig: { ...existing, elements } }),
                                            });
                                        }
                                    }
                                    loadBoard();
                                }}
                                onEdgeUpdate={async (edgeId, patch) => {
                                    if (!jwt) return;
                                    // Direction / autoForward aendern → Edge-Endpoint
                                    const edgePatch: Record<string, unknown> = {};
                                    if (patch.direction) edgePatch.direction = patch.direction;
                                    if (patch.autoForward !== undefined) edgePatch.autoForward = patch.autoForward;
                                    if (patch.condition !== undefined) edgePatch.condition = patch.condition;
                                    if (Object.keys(edgePatch).length > 0) {
                                        await fetchJson(`/cascade-edges/${edgeId}`, jwt, { method: 'PATCH', body: JSON.stringify(edgePatch) });
                                    }
                                    // Filter/Form/Gate aendern → Ziel-Column-Endpoint
                                    const edge = (board as any).edges?.find((e: any) => e.id === edgeId);
                                    if (edge) {
                                        const colPatch: Record<string, unknown> = {};
                                        if (patch.targetFilter) colPatch.filterMode = patch.targetFilter;
                                        if (patch.targetForm) colPatch.formMode = patch.targetForm;
                                        if (patch.targetGate) colPatch.gateMode = patch.targetGate;
                                        if (Object.keys(colPatch).length > 0) {
                                            await fetchJson(`/cascade-columns/${edge.targetColumnId}`, jwt, { method: 'PATCH', body: JSON.stringify(colPatch) });
                                        }
                                    }
                                    loadBoard();
                                }}
                                onEdgeDelete={async (edgeId) => {
                                    if (!jwt || !board) return;
                                    const edge = ((board as any).edges ?? []).find((e: any) => e.id === edgeId);
                                    if (edge) pushUndo({ type: 'deleteEdge', data: { sourceColumnId: edge.sourceColumnId, targetColumnId: edge.targetColumnId } });
                                    await fetchJson(`/cascade-edges/${edgeId}`, jwt, { method: 'DELETE' });
                                    loadBoard();
                                }}
                                onNodeCreate={async (posX, posY) => {
                                    if (!jwt) return;
                                    const title = prompt('Knotenname:');
                                    if (!title?.trim()) return;
                                    await fetchJson(`/cascade-boards/${board.id}/columns`, jwt, { method: 'POST', body: JSON.stringify({ title: title.trim(), posX, posY }) });
                                    loadBoard();
                                }}
                                onNodeDelete={async (nodeId) => {
                                    if (!jwt || !board) return;
                                    const node = board.columns.find(c => c.id === nodeId);
                                    if (node) pushUndo({ type: 'deleteNode', data: { title: node.title, color: node.color, posX: (node as any).posX, posY: (node as any).posY, sortOrder: node.sortOrder, nodeType: (node as any).nodeType, nodeConfig: (node as any).nodeConfig } });
                                    await fetchJson(`/cascade-columns/${nodeId}`, jwt, { method: 'DELETE' });
                                    loadBoard();
                                }}
                                onNodeColorChange={async (nodeId, color) => {
                                    if (!jwt) return;
                                    await fetchJson(`/cascade-columns/${nodeId}`, jwt, { method: 'PATCH', body: JSON.stringify({ color }) });
                                    loadBoard();
                                }}
                                onNodeStateChange={async (nodeId, nodeState) => {
                                    if (!jwt || !board) return;
                                    setBoard({ ...board, columns: board.columns.map(c => c.id === nodeId ? { ...c, nodeState } : c) } as any);
                                    await fetchJson(`/cascade-columns/${nodeId}/state`, jwt, { method: 'PATCH', body: JSON.stringify({ nodeState }) });
                                }}
                                onStatusChange={async (nodeId, status) => {
                                    if (!jwt) return;
                                    await fetchJson(`/cascade-columns/${nodeId}/status`, jwt, { method: 'POST', body: JSON.stringify({ status }) });
                                    loadBoard();
                                }}
                                onAddSpaceToNode={(nodeId) => {
                                    setAddingSpaceTo(nodeId);
                                }}
                                onConvertNode={async (nodeId, elType) => {
                                    if (!jwt || !board) return;
                                    const def = getElementDef(elType);
                                    if (!def) return;
                                    const node = board.columns.find(c => c.id === nodeId);
                                    const existing = (node as any)?.nodeConfig ?? {};
                                    const elements = existing.elements ?? [];
                                    const newEl = def.defaultConfig();
                                    await fetchJson(`/cascade-columns/${nodeId}`, jwt, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ nodeConfig: { ...existing, elements: [...elements, newEl] } }),
                                    });
                                    await loadBoard();
                                    setDesignNodeId(nodeId);
                                }}
                                onDesignNode={(nodeId) => setDesignNodeId(nodeId)}
                                onRemoveSpaceFromNode={async (entryId) => {
                                    if (!jwt) return;
                                    await fetchJson(`/cascade-column-spaces/${entryId}`, jwt, { method: 'DELETE' });
                                    loadBoard();
                                }}
                                startColumnId={board.startColumnId}
                                onSetStartNode={async (nodeId) => {
                                    if (!jwt || !board) return;
                                    await fetchJson(`/cascade-boards/${board.id}`, jwt, { method: 'PATCH', body: JSON.stringify({ startColumnId: nodeId }) });
                                    setBoard({ ...board, startColumnId: nodeId });
                                }}
                            />
                        </CascadeErrorBoundary>
                    </div>
                </div>
            )}

            {/* Space Picker Overlay (graph view) */}
            {addingSpaceTo && board && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20" onClick={() => setAddingSpaceTo(null)}>
                    <div className="w-64" onClick={(e) => e.stopPropagation()}>
                        <SpacePicker
                            allSpaces={allSpaces}
                            excludeIds={new Set(board.columns.find(c => c.id === addingSpaceTo)?.spaces.map(s => s.spaceId) ?? [])}
                            onSelect={async (spaceId) => {
                                if (!jwt) return;
                                await fetchJson(`/cascade-columns/${addingSpaceTo}/spaces`, jwt, { method: 'POST', body: JSON.stringify({ spaceId }) });
                                setAddingSpaceTo(null);
                                loadBoard();
                            }}
                            onCancel={() => setAddingSpaceTo(null)}
                        />
                    </div>
                </div>
            )}

            {/* Focus Chat (when a node is clicked in graph view) */}
            {focusColumnId && focusSpaceId && board && (() => {
                const col = board.columns.find(c => c.id === focusColumnId);
                if (!col) return null;
                const colIdx = board.columns.indexOf(col);
                const nextCol = board.columns[colIdx + 1];
                return (
                    <div className="flex h-full">
                        {/* Chat (left side) */}
                        <div className={cn("flex flex-col", collabDocId ? "w-1/2 border-r" : "flex-1")}>
                            <button onClick={() => { setFocusColumnId(null); setFocusSpaceId(null); setCollabDocId(null); }}
                                className="flex items-center gap-1 border-b px-3 py-2 text-xs text-muted-foreground hover:text-foreground shrink-0">
                                {t('cascade.cascade.zurueck_zum_graph')}
                            </button>
                            <div className="flex-1 min-h-0">
                                <FocusChat
                                    spaceId={focusSpaceId}
                                    allSpaces={allSpaces}
                                    boardId={board.id}
                                    boardName={board.name}
                                    columnId={col.id}
                                    columnTitle={col.title}
                                    isFirstColumn={colIdx === 0}
                                    nextColumnId={nextCol?.id}
                                    onForward={handleForward}
                                    onCollabText={async () => {
                                        if (!jwt || !focusColumnId) return;
                                        const res = await fetchJson<{ doc: { id: string } }>(`/cascade-columns/${focusColumnId}/collab-doc`, jwt, { method: 'POST', body: JSON.stringify({}) });
                                        if (res?.doc) setCollabDocId(res.doc.id);
                                    }}
                                />
                            </div>
                        </div>
                        {/* Collab Panel (right side detail panel) */}
                        {collabDocId && jwt && focusSpaceId && (
                            <div className="w-1/2 flex flex-col">
                                <CollabEditor
                                    jwt={jwt}
                                    userId={session.matrix?.userId ?? 'unknown'}
                                    displayName={session.bootstrap?.user?.displayName ?? session.matrix?.userId ?? 'Unbekannt'}
                                    spaceId={focusSpaceId}
                                    onClose={() => setCollabDocId(null)}
                                />
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Designer Panel (right side) */}
            {designNodeId && board && board.columns.find(c => c.id === designNodeId) && (
                <div className="absolute right-0 top-0 bottom-0 w-80 z-30 border-l bg-background shadow-xl">
                    <CascadeDesigner
                        key={designNodeId}
                        node={board.columns.find(c => c.id === designNodeId)!}
                        allNodes={board.columns.map(c => ({ id: c.id, title: c.title }))}
                        onSave={async (design) => {
                            if (!jwt) return;
                            const existing = (board?.columns.find(c => c.id === designNodeId) as any)?.nodeConfig ?? {};
                            // Dropdown-Optionen aus dem Design extrahieren
                            const { _elements, ...cleanDesign } = design as any;
                            const nodeConfig = { ...existing, design: cleanDesign };
                            if (_elements) nodeConfig.elements = _elements;
                            // Titel = Überschrift synchron halten
                            const patch: Record<string, unknown> = { nodeConfig };
                            if (cleanDesign.heading) {
                                patch.title = cleanDesign.heading;
                                nodeConfig.question = cleanDesign.heading;
                            }
                            await fetchJson(`/cascade-columns/${designNodeId}`, jwt, {
                                method: 'PATCH',
                                body: JSON.stringify(patch),
                            });
                            setDesignNodeId(null);
                            loadBoard();
                        }}
                        onClose={() => setDesignNodeId(null)}
                        onPreview={() => { setDesignNodeId(null); setPlayerOpen(true); }}
                    />
                </div>
            )}

            {/* Player (fullscreen end-user view) */}
            {playerOpen && board && jwt && (
                <CascadePlayer
                    nodes={board.columns}
                    edges={(board as any).edges ?? []}
                    startNodeId={board.startColumnId ?? board.columns[0]?.id}
                    boardId={board.id}
                    jwt={jwt}
                    userId={session.matrix?.userId ?? 'unknown'}
                    userName={session.bootstrap?.user?.displayName ?? 'Unbekannt'}
                    onNavigateApp={(path) => { setPlayerOpen(false); navigate(path); }}
                    onClose={() => setPlayerOpen(false)}
                />
            )}

            {/* Flow-Log Panel (right side) */}
            {logOpen && board && jwt && (
                <div className="absolute right-0 top-0 bottom-0 w-80 z-30 border-l bg-background shadow-xl">
                    <CascadeFlowLog boardId={board.id} jwt={jwt} onClose={() => setLogOpen(false)} />
                </div>
            )}

            {runsOpen && board && jwt && (
                <div className="absolute right-0 top-0 bottom-0 w-96 z-30 border-l bg-background shadow-xl">
                    <CascadeRunsPanel boardId={board.id} jwt={jwt} onClose={() => setRunsOpen(false)} />
                </div>
            )}

            {resultsOpen && board && jwt && (
                <div className="absolute right-0 top-0 bottom-0 w-96 z-30 border-l bg-background shadow-xl">
                    <CascadeResults boardId={board.id} boardName={board.name} jwt={jwt} onClose={() => setResultsOpen(false)} />
                </div>
            )}

        </div>
    );
}

// ─── Focus Chat ─────────────────────────────────────────────────────────────

function FocusChat({ spaceId, allSpaces, boardId, boardName, columnId, columnTitle, isFirstColumn, nextColumnId, onForward, onCollabText }: {
    spaceId: string;
    allSpaces: SpaceItem[];
    boardId: string;
    boardName: string;
    columnId: string;
    columnTitle: string;
    isFirstColumn: boolean;
    nextColumnId?: string;
    onForward: (columnId: string, message: string, isMarked: boolean) => Promise<any>;
    onCollabText?: () => void;
}) {
    const t = useT();
    const space = allSpaces.find(s => s.id === spaceId);
    const matrixRoomId = space?.matrixChatRoomId ?? space?.matrixRoomId ?? undefined;
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const myUserId = session.matrix?.userId;

    const { messages, members, sendMessage, sendTyping } = useChatRoom(matrixRoomId);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [sending, setSending] = useState(false);
    const [forwardFeedback, setForwardFeedback] = useState('');

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages.length]);

    const handleSend = async (text: string) => {
        if (isFirstColumn) {
            sendMessage(text);
        } else if (jwt) {
            setSending(true);
            try {
                await fetchJson(`/cascade-boards/${boardId}/broadcast`, jwt, {
                    method: 'POST',
                    body: JSON.stringify({ fromColumnId: columnId, toSpaceId: spaceId, message: text }),
                });
            } catch (err) { console.error('Cascade broadcast failed', err); }
            finally { setSending(false); }
        }
    };

    const handleForwardMessage = async (msgBody: string) => {
        if (!nextColumnId) return;
        setForwardFeedback('');
        const result = await onForward(nextColumnId, msgBody, true);
        if (result?.action === 'sent') setForwardFeedback('Weitergeleitet');
        else if (result?.action === 'queued') setForwardFeedback('Wartet auf Freigabe');
        else if (result?.action === 'scheduled') setForwardFeedback('Verzögert gesendet');
        else if (result?.action === 'filtered') setForwardFeedback('Vom Filter blockiert');
        setTimeout(() => setForwardFeedback(''), 3000);
    };

    if (!matrixRoomId) {
        return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{t('cascade.cascade.kein_chat-raum')}</div>;
    }

    const mainMessages = messages.filter(m => !m.threadId && !m.isTranscriptReply);

    return (
        <div className="flex h-full flex-col">
            {/* Downstream indicator */}
            {!isFirstColumn && (
                <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 shrink-0">
                    <span className="size-2 rounded-full bg-primary shrink-0" />
                    <span className="text-[11px] text-muted-foreground">{t('cascade.cascade.nachrichten_werden_als')} <strong>{boardName}</strong> gesendet</span>
                </div>
            )}

            {/* Forward feedback */}
            {forwardFeedback && (
                <div className="flex items-center gap-2 border-b bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 shrink-0">
                    <MaterialIcon name="check" size={16} className="size-3 text-emerald-600" />
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400">{forwardFeedback}</span>
                </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                {mainMessages.map((msg) => {
                    const isCascadeMsg = msg.sender !== myUserId && !msg.sender?.includes(myUserId ?? '___');
                    return (
                        <div key={msg.eventId} className="group relative">
                            <div className={cn(isCascadeMsg && msg.body.includes(':') && 'bg-muted/30 rounded-lg px-2 py-1 border border-primary/10')}>
                                <ChatBubble
                                    msg={msg}
                                    isSelf={msg.sender === myUserId}
                                    displayName={members.get(msg.sender)?.displayName ?? msg.sender.split(':')[0].replace('@', '')}
                                    avatarMxc={members.get(msg.sender)?.avatarMxc ?? null}
                                />
                            </div>
                            {/* Forward button — only in first column, if there's a next column */}
                            {isFirstColumn && nextColumnId && (
                                <button
                                    onClick={() => handleForwardMessage(msg.body)}
                                    className="hidden group-hover:flex absolute right-1 top-1 items-center gap-1 rounded-md bg-card border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-primary hover:border-primary/40 shadow-sm"
                                    title={t('cascade.cascade.an_naechste_spalte_weiterleiten')}
                                >
                                    <Forward className="size-3" /> {t('common.next')}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Composer */}
            <div className="border-t shrink-0">
                <ChatComposer
                    onSend={handleSend}
                    onTyping={isFirstColumn ? sendTyping : () => { }}
                    onCollabText={onCollabText}
                    placeholder={isFirstColumn ? `Nachricht an ${space?.name ?? 'Chat'}...` : `Als ${boardName} an ${space?.name ?? 'Chat'} senden...`}
                />
            </div>
        </div>
    );
}

// ─── Space Picker ───────────────────────────────────────────────────────────

function SpacePicker({ allSpaces, excludeIds, onSelect, onCancel }: {
    allSpaces: SpaceItem[];
    excludeIds: Set<string>;
    onSelect: (spaceId: string) => void;
    onCancel: () => void;
}) {
    const t = useT();
    const [search, setSearch] = useState('');
    const filtered = allSpaces
        .filter(s => !excludeIds.has(s.id))
        .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 10);

    return (
        <div className="rounded-lg border border-border bg-card p-2">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
                placeholder={t('cascade.cascade.space_suchen')} className="h-7 w-full rounded border bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-primary mb-1" />
            <div className="max-h-32 overflow-y-auto space-y-0.5">
                {filtered.map(s => (
                    <button key={s.id} onClick={() => onSelect(s.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] text-left hover:bg-muted">
                        <MaterialIcon name="chat" size={16} className="size-3 text-muted-foreground" />{s.name}
                    </button>
                ))}
                {filtered.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-2">{t('cascade.cascade.keine_spaces_gefunden')}</p>}
            </div>
            <button onClick={onCancel} className="mt-1 w-full rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">{t('common.cancel')}</button>
        </div>
    );
}

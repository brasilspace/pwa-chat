/**
 * Graph Editor Store — manages editor state via useSyncExternalStore pattern
 */

import type { WorkflowNodeDef, WorkflowEdgeDef, WorkflowGraph } from './workflow-types';

// ─── State ───────────────────────────────────────────────────────────────────

interface GraphEditorState {
    nodes: WorkflowNodeDef[];
    edges: WorkflowEdgeDef[];
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    connectingFrom: string | null; // node ID we're drawing an edge from
    zoom: number;
    panX: number;
    panY: number;
    dirty: boolean;
}

let state: GraphEditorState = {
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    connectingFrom: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    dirty: false,
};

const listeners = new Set<() => void>();

function emit() {
    for (const fn of listeners) fn();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const graphStore = {
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    getSnapshot(): GraphEditorState {
        return state;
    },

    // ─── Graph Management ────────────────────────────────────────────

    loadGraph(graph: WorkflowGraph) {
        state = {
            ...state,
            nodes: graph.nodes ?? [],
            edges: graph.edges ?? [],
            selectedNodeId: null,
            selectedEdgeId: null,
            connectingFrom: null,
            dirty: false,
        };
        emit();
    },

    getGraph(): WorkflowGraph {
        return { nodes: state.nodes, edges: state.edges };
    },

    // ─── Node Operations ─────────────────────────────────────────────

    addNode(node: WorkflowNodeDef) {
        state = { ...state, nodes: [...state.nodes, node], selectedNodeId: node.id, dirty: true };
        emit();
    },

    updateNode(nodeId: string, updates: Partial<WorkflowNodeDef>) {
        state = {
            ...state,
            nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
            dirty: true,
        };
        emit();
    },

    moveNode(nodeId: string, x: number, y: number) {
        state = {
            ...state,
            nodes: state.nodes.map((n) =>
                n.id === nodeId ? { ...n, position: { x, y } } : n,
            ),
            dirty: true,
        };
        emit();
    },

    removeNode(nodeId: string) {
        state = {
            ...state,
            nodes: state.nodes.filter((n) => n.id !== nodeId),
            edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
            dirty: true,
        };
        emit();
    },

    selectNode(nodeId: string | null) {
        state = { ...state, selectedNodeId: nodeId, selectedEdgeId: null };
        emit();
    },

    // ─── Edge Operations ─────────────────────────────────────────────

    addEdge(edge: WorkflowEdgeDef) {
        // Prevent duplicate edges
        const exists = state.edges.some((e) => e.source === edge.source && e.target === edge.target);
        if (exists) return;

        state = {
            ...state,
            edges: [...state.edges, edge],
            // Also update source node's next array
            nodes: state.nodes.map((n) =>
                n.id === edge.source && !n.next.includes(edge.target)
                    ? { ...n, next: [...n.next, edge.target] }
                    : n,
            ),
            dirty: true,
        };
        emit();
    },

    removeEdge(edgeId: string) {
        const edge = state.edges.find((e) => e.id === edgeId);
        state = {
            ...state,
            edges: state.edges.filter((e) => e.id !== edgeId),
            // Also update source node's next array
            nodes: edge
                ? state.nodes.map((n) =>
                      n.id === edge.source ? { ...n, next: n.next.filter((t) => t !== edge.target) } : n,
                  )
                : state.nodes,
            selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
            dirty: true,
        };
        emit();
    },

    selectEdge(edgeId: string | null) {
        state = { ...state, selectedEdgeId: edgeId, selectedNodeId: null };
        emit();
    },

    // ─── Connection Mode ─────────────────────────────────────────────

    startConnecting(nodeId: string) {
        state = { ...state, connectingFrom: nodeId };
        emit();
    },

    cancelConnecting() {
        state = { ...state, connectingFrom: null };
        emit();
    },

    // ─── Viewport ────────────────────────────────────────────────────

    setZoom(zoom: number) {
        state = { ...state, zoom: Math.max(0.25, Math.min(2, zoom)) };
        emit();
    },

    setPan(x: number, y: number) {
        state = { ...state, panX: x, panY: y };
        emit();
    },

    // ─── Dirty State ──────────────────────────────────────────────��──

    markClean() {
        state = { ...state, dirty: false };
        emit();
    },
};

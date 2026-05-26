/**
 * GraphCanvas — SVG-Canvas fuer den visuellen Graph-Editor
 *
 * Rendert Nodes und Edges, handelt Pan & Zoom, Selektion und Edge-Erstellung.
 */

import { useRef, useCallback, useSyncExternalStore } from 'react';
import { graphStore } from './graph-store';
import { GraphNode } from './graph-node';
import { GraphEdge } from './graph-edge';
import { useT } from "@/lib/i18n/use-t";

let edgeIdCounter = 0;

export function GraphCanvas() {
    const t = useT();
    const state = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot);
    const svgRef = useRef<SVGSVGElement>(null);
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0 });
    const dragNodeId = useRef<string | null>(null);
    const dragOffset = useRef({ x: 0, y: 0 });

    const { nodes, edges, selectedNodeId, selectedEdgeId, connectingFrom, zoom, panX, panY } = state;

    // ─── Pan handling ────────────────────────────────────────────────

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'rect') {
            // Clicked on background — deselect
            graphStore.selectNode(null);
            graphStore.selectEdge(null);
            graphStore.cancelConnecting();
        }

        // Start panning if clicking on background
        if (e.target === svgRef.current) {
            isPanning.current = true;
            panStart.current = { x: e.clientX - panX, y: e.clientY - panY };
        }
    }, [panX, panY]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanning.current) {
            graphStore.setPan(e.clientX - panStart.current.x, e.clientY - panStart.current.y);
        }
        if (dragNodeId.current) {
            const svg = svgRef.current;
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            const x = (e.clientX - rect.left - panX) / zoom - dragOffset.current.x;
            const y = (e.clientY - rect.top - panY) / zoom - dragOffset.current.y;
            graphStore.moveNode(dragNodeId.current, Math.round(x / 20) * 20, Math.round(y / 20) * 20);
        }
    }, [panX, panY, zoom]);

    const handleMouseUp = useCallback(() => {
        isPanning.current = false;
        dragNodeId.current = null;
    }, []);

    // ─── Zoom handling ───────────────────────────────────────────────

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        graphStore.setZoom(zoom + delta);
    }, [zoom]);

    // ─── Node drag ───────────────────────────────────────────────────

    const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;

        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();

        dragNodeId.current = nodeId;
        dragOffset.current = {
            x: (e.clientX - rect.left - panX) / zoom - (node.position?.x ?? 0),
            y: (e.clientY - rect.top - panY) / zoom - (node.position?.y ?? 0),
        };
    }, [nodes, panX, panY, zoom]);

    // ─── Edge creation ───────────────────────────────────────────────

    const handleStartConnect = useCallback((nodeId: string) => {
        graphStore.startConnecting(nodeId);
    }, []);

    const handleCompleteConnect = useCallback((targetId: string) => {
        if (!connectingFrom || connectingFrom === targetId) {
            graphStore.cancelConnecting();
            return;
        }

        edgeIdCounter++;
        graphStore.addEdge({
            id: `edge_${Date.now()}_${edgeIdCounter}`,
            source: connectingFrom,
            target: targetId,
        });
        graphStore.cancelConnecting();
    }, [connectingFrom]);

    // ─── Render ──────────────────────────────────────────────────────

    return (
        <svg
            ref={svgRef}
            className="h-full w-full bg-[var(--background)]"
            style={{ cursor: isPanning.current ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        >
            {/* Defs */}
            <defs>
                <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon points="0 0, 10 3.5, 0 7" fill="var(--border)" />
                </marker>

                {/* Grid pattern */}
                <pattern id="grid" width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse"
                    x={panX % (20 * zoom)} y={panY % (20 * zoom)}>
                    <circle cx={1} cy={1} r={0.5} fill="var(--muted-foreground)" opacity={0.15} />
                </pattern>
            </defs>

            {/* Background grid */}
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Transform group for pan & zoom */}
            <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
                {/* Edges first (behind nodes) */}
                {edges.map((edge) => {
                    const source = nodes.find((n) => n.id === edge.source);
                    const target = nodes.find((n) => n.id === edge.target);
                    if (!source || !target) return null;

                    return (
                        <GraphEdge
                            key={edge.id}
                            edge={edge}
                            sourceNode={source}
                            targetNode={target}
                            selected={selectedEdgeId === edge.id}
                            onSelect={graphStore.selectEdge}
                        />
                    );
                })}

                {/* Nodes */}
                {nodes.map((node) => (
                    <g
                        key={node.id}
                        onMouseDown={(e) => handleNodeDragStart(node.id, e)}
                    >
                        <GraphNode
                            node={node}
                            selected={selectedNodeId === node.id}
                            isActive={false}
                            onSelect={graphStore.selectNode}
                            onStartConnect={handleStartConnect}
                            onCompleteConnect={handleCompleteConnect}
                            connectingFrom={connectingFrom}
                        />
                    </g>
                ))}
            </g>

            {/* Connecting indicator */}
            {connectingFrom && (
                <text
                    x={12}
                    y={24}
                    fill="var(--primary)"
                    fontSize={12}
                    fontFamily="inherit"
                >
                    {t('workflow.graph_canvas.klicke_auf_einen_ziel-node_um_eine_verbi')}
                </text>
            )}
        </svg>
    );
}

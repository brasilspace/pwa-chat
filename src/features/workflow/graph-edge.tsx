/**
 * GraphEdge — Bezier-Kurve zwischen zwei Nodes
 */

import type { WorkflowEdgeDef, WorkflowNodeDef } from './workflow-types';
import { NODE_WIDTH, NODE_HEIGHT } from './graph-node';

interface GraphEdgeProps {
    edge: WorkflowEdgeDef;
    sourceNode: WorkflowNodeDef;
    targetNode: WorkflowNodeDef;
    selected: boolean;
    onSelect: (id: string) => void;
}

export function GraphEdge({ edge, sourceNode, targetNode, selected, onSelect }: GraphEdgeProps) {
    const sx = (sourceNode.position?.x ?? 0) + NODE_WIDTH;
    const sy = (sourceNode.position?.y ?? 0) + NODE_HEIGHT / 2;
    const tx = targetNode.position?.x ?? 0;
    const ty = (targetNode.position?.y ?? 0) + NODE_HEIGHT / 2;

    // Bezier control points
    const dx = Math.abs(tx - sx);
    const cx = Math.max(50, dx * 0.4);
    const path = `M ${sx} ${sy} C ${sx + cx} ${sy}, ${tx - cx} ${ty}, ${tx} ${ty}`;

    return (
        <g onClick={(e) => { e.stopPropagation(); onSelect(edge.id); }}>
            {/* Invisible wider hit area */}
            <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                className="cursor-pointer"
            />

            {/* Visible edge */}
            <path
                d={path}
                fill="none"
                stroke={selected ? '#3b82f6' : 'var(--border)'}
                strokeWidth={selected ? 2.5 : 1.5}
                strokeLinecap="round"
                markerEnd="url(#arrowhead)"
            />

            {/* Edge label */}
            {edge.label && (
                <text
                    x={(sx + tx) / 2}
                    y={(sy + ty) / 2 - 8}
                    textAnchor="middle"
                    fill="var(--muted-foreground)"
                    fontSize={11}
                    fontFamily="inherit"
                    className="select-none pointer-events-none"
                >
                    {edge.label}
                </text>
            )}
        </g>
    );
}

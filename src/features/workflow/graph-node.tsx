/**
 * GraphNode — Einzelner Node im Graph-Canvas
 *
 * Gerundetes Rechteck mit Icon, Label und farbigem Akzent.
 * Klickbar fuer Selektion, mit Ausgangs-Port fuer Edge-Erstellung.
 */

import {
    Play, CircleCheck, GitBranch, GitFork, Repeat, Layers,
    UserCheck, ShieldCheck, ClipboardList,
    MessageSquare, AlertTriangle, Zap,
    Clock, CalendarClock,
} from 'lucide-react';
import type { WorkflowNodeDef, WorkflowNodeType } from './workflow-types';
import { NODE_COLORS } from './workflow-types';

const ICON_MAP: Record<WorkflowNodeType, typeof Play> = {
    start: Play, finish: CircleCheck, decision: GitBranch,
    parallel_gateway: GitFork, loop: Repeat, subprocess: Layers,
    checkpoint: UserCheck, approval: ShieldCheck, form: ClipboardList,
    announce: MessageSquare, escalation: AlertTriangle, action: Zap,
    delay: Clock, timer: CalendarClock,
};

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;
const PORT_RADIUS = 6;

interface GraphNodeProps {
    node: WorkflowNodeDef;
    selected: boolean;
    isActive: boolean;
    onSelect: (id: string) => void;
    onStartConnect: (id: string) => void;
    onCompleteConnect: (id: string) => void;
    connectingFrom: string | null;
}

export function GraphNode({
    node, selected, isActive, onSelect, onStartConnect, onCompleteConnect, connectingFrom,
}: GraphNodeProps) {
    const x = node.position?.x ?? 0;
    const y = node.position?.y ?? 0;
    const color = NODE_COLORS[node.type] ?? '#64748b';
    const Icon = ICON_MAP[node.type] ?? Zap;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (connectingFrom && connectingFrom !== node.id) {
            onCompleteConnect(node.id);
        } else {
            onSelect(node.id);
        }
    };

    const handlePortClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onStartConnect(node.id);
    };

    return (
        <g
            transform={`translate(${x}, ${y})`}
            onClick={handleClick}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
        >
            {/* Shadow */}
            <rect
                x={1}
                y={2}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={12}
                fill="rgba(0,0,0,0.08)"
            />

            {/* Main body */}
            <rect
                x={0}
                y={0}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={12}
                fill="var(--card)"
                stroke={selected ? color : isActive ? '#22c55e' : 'var(--border)'}
                strokeWidth={selected ? 2.5 : isActive ? 2 : 1}
            />

            {/* Color accent bar */}
            <rect
                x={0}
                y={0}
                width={6}
                height={NODE_HEIGHT}
                rx={3}
                fill={color}
            />

            {/* Icon */}
            <foreignObject x={16} y={(NODE_HEIGHT - 20) / 2} width={20} height={20}>
                <Icon size={20} color={color} />
            </foreignObject>

            {/* Label */}
            <text
                x={44}
                y={NODE_HEIGHT / 2}
                dominantBaseline="central"
                fill="var(--foreground)"
                fontSize={13}
                fontWeight={500}
                fontFamily="inherit"
                className="select-none"
            >
                {node.name.length > 16 ? node.name.slice(0, 15) + '\u2026' : node.name}
            </text>

            {/* Output port (right side) — only if not finish */}
            {node.type !== 'finish' && (
                <circle
                    cx={NODE_WIDTH}
                    cy={NODE_HEIGHT / 2}
                    r={PORT_RADIUS}
                    fill={connectingFrom ? '#3b82f6' : 'var(--muted)'}
                    stroke="var(--border)"
                    strokeWidth={1}
                    onClick={handlePortClick}
                    className="cursor-crosshair hover:fill-blue-500 transition-colors"
                />
            )}

            {/* Input port (left side) — only if not start */}
            {node.type !== 'start' && (
                <circle
                    cx={0}
                    cy={NODE_HEIGHT / 2}
                    r={PORT_RADIUS}
                    fill={connectingFrom ? '#10b981' : 'var(--muted)'}
                    stroke="var(--border)"
                    strokeWidth={1}
                    onClick={handleClick}
                    className={connectingFrom ? 'cursor-pointer hover:fill-emerald-500 transition-colors' : ''}
                />
            )}
        </g>
    );
}

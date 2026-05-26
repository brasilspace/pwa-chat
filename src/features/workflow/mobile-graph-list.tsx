/**
 * MobileGraphList — Mobile Fallback fuer den Graph-Editor
 *
 * Zeigt den Workflow als vertikale Karten-Liste statt Canvas.
 * Jede Karte ist ein Node mit seinen Verbindungen.
 */

import { useSyncExternalStore } from 'react';
import { Play, CircleCheck, GitBranch, GitFork, Repeat, Layers, UserCheck, ShieldCheck, ClipboardList, MessageSquare, AlertTriangle, Zap, Clock, CalendarClock, ArrowDown } from 'lucide-react';
import type { BuilderNodeDefinition, WorkflowNodeType } from './workflow-types';
import { NODE_COLORS } from './workflow-types';
import { graphStore } from './graph-store';
import { useT } from "@/lib/i18n/use-t";

const ICON_MAP: Record<string, typeof Play> = {
    Play, CircleCheck, GitBranch, GitFork, Repeat, Layers,
    UserCheck, ShieldCheck, ClipboardList,
    MessageSquare, AlertTriangle, Zap,
    Clock, CalendarClock,
};

const ICON_BY_TYPE: Record<WorkflowNodeType, string> = {
    start: 'Play', finish: 'CircleCheck', decision: 'GitBranch',
    parallel_gateway: 'GitFork', loop: 'Repeat', subprocess: 'Layers',
    checkpoint: 'UserCheck', approval: 'ShieldCheck', form: 'ClipboardList',
    announce: 'MessageSquare', escalation: 'AlertTriangle', action: 'Zap',
    delay: 'Clock', timer: 'CalendarClock',
};

interface MobileGraphListProps {
    palette: BuilderNodeDefinition[];
}

export function MobileGraphList({ palette }: MobileGraphListProps) {
    const t = useT();
    const state = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot);
    const { nodes, edges, selectedNodeId } = state;

    // Build ordered node list by following edges from start
    const orderedNodes = getOrderedNodes(nodes, edges);

    return (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
            {orderedNodes.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-[var(--muted-foreground)]">
                    <p>{t('workflow.mobile_graph_list.noch_keine_schritte_definiert')}</p>
                </div>
            )}

            {orderedNodes.map((node, idx) => {
                const color = NODE_COLORS[node.type as WorkflowNodeType] ?? '#64748b';
                const iconName = ICON_BY_TYPE[node.type as WorkflowNodeType] ?? 'Zap';
                const Icon = ICON_MAP[iconName] ?? Zap;
                const isSelected = selectedNodeId === node.id;

                return (
                    <div key={node.id}>
                        <button
                            onClick={() => graphStore.selectNode(isSelected ? null : node.id)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${isSelected
                                    ? 'border-[var(--primary)] bg-[var(--accent)]'
                                    : 'border-[var(--border)] bg-[var(--card)]'
                                }`}
                        >
                            <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                                style={{ backgroundColor: color + '18' }}
                            >
                                <Icon size={18} color={color} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-[var(--foreground)]">{node.name}</p>
                                <p className="text-xs text-[var(--muted-foreground)]">{node.type}</p>
                            </div>
                            <div
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: color }}
                            />
                        </button>

                        {/* Arrow between nodes */}
                        {idx < orderedNodes.length - 1 && (
                            <div className="flex justify-center py-1">
                                <ArrowDown size={16} className="text-[var(--muted-foreground)]" />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** Follow edges from start node to build an ordered list */
function getOrderedNodes(
    nodes: typeof graphStore extends { getSnapshot: () => infer S } ? S extends { nodes: infer N } ? N : never : never,
    edges: Array<{ source: string; target: string }>,
) {
    const startNode = (nodes as any[]).find((n: any) => n.type === 'start');
    if (!startNode) return nodes as any[];

    const visited = new Set<string>();
    const ordered: any[] = [];
    const queue = [startNode.id];

    while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);

        const node = (nodes as any[]).find((n: any) => n.id === id);
        if (node) ordered.push(node);

        // Find outgoing edges
        for (const edge of edges) {
            if (edge.source === id && !visited.has(edge.target)) {
                queue.push(edge.target);
            }
        }
        // Also check node.next
        for (const nextId of (node?.next ?? [])) {
            if (!visited.has(nextId)) queue.push(nextId);
        }
    }

    // Add any unvisited nodes at the end
    for (const node of nodes as any[]) {
        if (!visited.has(node.id)) ordered.push(node);
    }

    return ordered;
}

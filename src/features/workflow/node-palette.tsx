/**
 * NodePalette — Seitenleiste mit den verfuegbaren Node-Typen
 *
 * Klicke auf einen Node-Typ, um ihn dem Canvas hinzuzufuegen.
 * Gruppiert nach Kategorie: Fluss, Mensch, Kommunikation, Zeit.
 */

import { useState, useSyncExternalStore } from 'react';
import {
    Play, CircleCheck, GitBranch, GitFork, Repeat, Layers,
    UserCheck, ShieldCheck, ClipboardList,
    MessageSquare, AlertTriangle, Zap,
    Clock, CalendarClock,
    ChevronDown, ChevronRight,
} from 'lucide-react';
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

const CATEGORY_LABELS: Record<string, string> = {
    flow: 'Flusssteuerung',
    human: 'Menschliche Interaktion',
    communication: 'Kommunikation & Aktion',
    time: 'Zeitsteuerung',
};

interface NodePaletteProps {
    palette: BuilderNodeDefinition[];
}

let nodeIdCounter = 0;

export function NodePalette({ palette }: NodePaletteProps) {
    const t = useT();
    const state = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const grouped: Record<string, BuilderNodeDefinition[]> = {};
    for (const node of palette) {
        const group = grouped[node.category] ?? [];
        group.push(node);
        grouped[node.category] = group;
    }

    const handleAddNode = (def: BuilderNodeDefinition) => {
        nodeIdCounter++;
        const id = `node_${Date.now()}_${nodeIdCounter}`;

        // Place new nodes at a reasonable position
        const existingNodes = state.nodes;
        const maxX = existingNodes.reduce((max, n) => Math.max(max, n.position?.x ?? 0), 0);
        const maxY = existingNodes.reduce((max, n) => Math.max(max, n.position?.y ?? 0), 0);

        const x = existingNodes.length === 0 ? 100 : maxX + 240;
        const y = existingNodes.length === 0 ? 100 : maxY;

        graphStore.addNode({
            id,
            type: def.type,
            name: def.label,
            config: {},
            next: [],
            position: { x, y },
        });
    };

    const toggleCategory = (cat: string) => {
        setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
    };

    return (
        <div className="flex h-full flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--sidebar-background)] p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {t('workflow.node_palette.bausteine')}
            </h3>

            {Object.entries(grouped).map(([category, nodes]) => (
                <div key={category} className="mb-3">
                    <button
                        onClick={() => toggleCategory(category)}
                        className="mb-1 flex w-full items-center gap-1 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                        {collapsed[category] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        {CATEGORY_LABELS[category] ?? category}
                    </button>

                    {!collapsed[category] && (
                        <div className="flex flex-col gap-1">
                            {nodes.map((def) => {
                                const Icon = ICON_MAP[def.icon] ?? Zap;
                                const color = NODE_COLORS[def.type] ?? '#64748b';

                                return (
                                    <button
                                        key={def.type}
                                        onClick={() => handleAddNode(def)}
                                        className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm transition-colors hover:border-[var(--border)] hover:bg-[var(--accent)]"
                                        title={def.description}
                                    >
                                        <div
                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                                            style={{ backgroundColor: color + '18' }}
                                        >
                                            <Icon size={15} color={color} />
                                        </div>
                                        <span className="truncate text-[var(--foreground)]">{def.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

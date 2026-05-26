/**
 * SpacesAdapter — Beziehungs-Graph mit Space als Root.
 *
 * Verknuepfungen:
 *   - Mitglieder des Spaces (kategorisiert nach Audience: Staff/Guardian/Minor)
 *   - Sub-Spaces (Kinder in der Hierarchie)
 *   - Parent-Space (Vater)
 *   - Optional: andere Spaces in denen die Mitglieder ueberlappen
 */

import type { GraphAdapter, GraphData, GraphNode, GraphEdge, GraphCategory, GraphPivotCandidate } from '../graph-types';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import type { Contact } from '@/features/contacts/use-contacts';
import type { SpaceItem } from '@/gateways/platform/platform-types';

const CATEGORIES: GraphCategory[] = [
    { name: 'Klasse/Space',      color: '#1d4ed8' },  // 0 — Root
    { name: 'Eltern-Space',      color: '#7c3aed' },  // 1 — Parent
    { name: 'Sub-Space',         color: '#9333ea' },  // 2 — Children
    { name: 'Lehrkraefte',       color: '#dc2626' },  // 3
    { name: 'Erziehungsberecht.',color: '#0891b2' },  // 4
    { name: 'Schueler:innen',    color: '#059669' },  // 5
    { name: 'Externe',           color: '#64748b' },  // 6
];

const CAT_ROOT = 0, CAT_PARENT = 1, CAT_CHILD_SPACE = 2;
const CAT_STAFF = 3, CAT_GUARDIAN = 4, CAT_MINOR = 5, CAT_OTHER = 6;

function audienceCat(audience: string | undefined): number {
    if (audience === 'staff') return CAT_STAFF;
    if (audience === 'guardian') return CAT_GUARDIAN;
    if (audience === 'minor') return CAT_MINOR;
    return CAT_OTHER;
}

export interface SpacesAdapterOptions {
    showMembers?: boolean;
    showHierarchy?: boolean;
    /** Hop-Tiefe ab Root (1 = nur direkte Nachbarn, 2 = bis Enkel/Grosseltern, ...). */
    hopLimit?: number;
    /** Max Aeste pro Knoten (Mitglieder + Sub-Spaces). 0 = unbegrenzt. */
    branchLimit?: number;
    /** Pro Space top-N Aufgaben als zusaetzliche Knoten anhaengen. */
    showTasks?: boolean;
    /** Pro Space top-N Dateien als zusaetzliche Knoten anhaengen. */
    showFiles?: boolean;
}

export function createSpacesAdapter(spaces: SpaceItem[], contacts: Contact[]): GraphAdapter {
    const platformGw = createPlatformGateway();

    const spaceById = new Map(spaces.map(s => [s.id, s]));
    const contactById = new Map(contacts.map(c => [c.id, c]));

    const childrenOf = (spaceId: string): SpaceItem[] =>
        spaces.filter(s => s.parentSpaceId === spaceId);

    // Hierarchie-Tiefe von oben (0 = top-level Space, 1 = einmal eingenistet, ...)
    // Wird als visueller Hint fuer die Ring-Anzahl beim Space-Symbol genutzt.
    const depthCache = new Map<string, number>();
    const hierarchyDepth = (spaceId: string): number => {
        const cached = depthCache.get(spaceId);
        if (cached !== undefined) return cached;
        let depth = 0;
        let current = spaceById.get(spaceId);
        while (current?.parentSpaceId) {
            depth++;
            if (depth > 10) break; // Defensive gegen Zyklen
            current = spaceById.get(current.parentSpaceId);
        }
        depthCache.set(spaceId, depth);
        return depth;
    };

    // Tree-Root-Farbe: alle Spaces einer Hierarchie teilen die Farbe des
    // obersten Vorfahren (= "Schule"). Wenn der Top-Space eine eigene
    // space.color hat, nutzen wir die — sonst pickt eine deterministische
    // Palette (aus der Top-Space-ID gehasht) eine stabile Fallback-Farbe.
    // So bleibt die Faerbung pro Baum auch ohne explizit gesetzte
    // space.color konsistent — und unterschiedliche Baeume bekommen
    // unterschiedliche Farben.
    const TREE_PALETTE = [
        '#10b981', // emerald
        '#6366f1', // indigo
        '#f59e0b', // amber
        '#ec4899', // pink
        '#14b8a6', // teal
        '#8b5cf6', // violet
        '#0ea5e9', // sky
        '#ef4444', // red
        '#84cc16', // lime
    ];
    function hashStr(s: string): number {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
        return Math.abs(h);
    }
    const treeRootColorCache = new Map<string, string>();
    const treeRootColor = (spaceId: string): string => {
        const cached = treeRootColorCache.get(spaceId);
        if (cached !== undefined) return cached;
        let current = spaceById.get(spaceId);
        let guard = 0;
        while (current?.parentSpaceId && guard++ < 10) {
            const parent = spaceById.get(current.parentSpaceId);
            if (!parent) break;
            current = parent;
        }
        const topId = current?.id ?? spaceId;
        const top = spaceById.get(topId);
        const color = top?.color ?? TREE_PALETTE[hashStr(topId) % TREE_PALETTE.length];
        treeRootColorCache.set(spaceId, color);
        // Auch alle Vorfahren auf demselben Pfad mit der gleichen Farbe cachen
        treeRootColorCache.set(topId, color);
        return color;
    };

    const visualForPerson = (audience: string | undefined, userType: string | undefined): GraphNode['visualType'] => {
        if (audience === 'minor') return 'student';
        if (audience === 'guardian') return 'parents';
        if (audience === 'staff') return 'staff';
        const ut = (userType ?? '').toLowerCase();
        if (ut.includes('schueler') || ut.includes('schüler') || ut.includes('kind')) return 'student';
        if (ut.includes('eltern') || ut.includes('mutter') || ut.includes('vater')) return 'parents';
        if (ut.includes('extern')) return 'external-contact';
        return 'staff';
    };

    return {
        domain: 'Space-Netz',
        icon: 'hub',

        async loadGraph({ rootId, jwt, options }) {
            const opts = (options ?? {}) as SpacesAdapterOptions;
            const showMembers = opts.showMembers !== false;
            const showHierarchy = opts.showHierarchy !== false;

            const root = spaceById.get(rootId);
            const rootName = root?.name ?? rootId;

            const nodeMap = new Map<string, GraphNode>();
            const edges: GraphEdge[] = [];

            const ensureSpace = (id: string, category: number, name?: string, symbolSize?: number) => {
                if (!nodeMap.has(id)) {
                    const sp = spaceById.get(id);
                    const depth = hierarchyDepth(id);
                    // Ring-Anzahl: 0=top→1Ring, 1→2Ringe, 2+→3Ringe
                    const visualType: GraphNode['visualType'] =
                        depth === 0 ? 'space-1' : depth === 1 ? 'space-2' : 'space-3';
                    // Alle Spaces einer Hierarchie teilen die Farbe des
                    // Top-Spaces. Reihenfolge: eigene space.color (explizit
                    // gesetzt) → Tree-Root-Farbe (vererbt oder Palette-Fallback).
                    // Damit ist die Hierarchie auch ohne in der DB gesetzte
                    // Farbe visuell konsistent gefaerbt.
                    const color = sp?.color ?? treeRootColor(id);
                    nodeMap.set(id, {
                        id, name: name ?? sp?.name ?? id, kind: 'space',
                        category, symbolSize: symbolSize ?? 50,
                        subtitle: sp?.type, pivotable: true,
                        visualType, hierarchyDepth: depth,
                        color,
                    });
                }
            };
            const ensurePerson = (id: string, audience: string | undefined, displayName: string, symbolSize = 30) => {
                if (!nodeMap.has(id)) {
                    const cat = audienceCat(audience);
                    const userType = contactById.get(id)?.userType ?? undefined;
                    nodeMap.set(id, {
                        id, name: displayName, kind: 'person', category: cat, symbolSize,
                        subtitle: userType,
                        pivotable: true,  // Klick auf Person pivotiert zu ihr (wechselt evtl. den Adapter im Caller-Hub)
                        visualType: visualForPerson(audience, userType),
                    });
                }
            };
            const ensureTask = (taskId: string, title: string, spaceId: string) => {
                const id = `task:${taskId}`;
                if (!nodeMap.has(id)) {
                    nodeMap.set(id, {
                        id, name: title, kind: 'task',
                        category: CAT_OTHER, symbolSize: 24,
                        subtitle: 'Aufgabe', visualType: 'task', pivotable: true,
                    });
                    edges.push({ source: spaceId, target: id, dashed: true, width: 1.5 });
                }
            };
            const ensureFile = (fileId: string, title: string, spaceId: string) => {
                const id = `doc:${fileId}`;
                if (!nodeMap.has(id)) {
                    nodeMap.set(id, {
                        id, name: title, kind: 'file',
                        category: CAT_OTHER, symbolSize: 22,
                        subtitle: 'Dokument', visualType: 'document', pivotable: true,
                    });
                    edges.push({ source: spaceId, target: id, dashed: true, width: 1.2 });
                }
            };

            const hopLimit = Math.max(1, Math.min(4, opts.hopLimit ?? 1));
            const branchLimit = opts.branchLimit ?? 0;
            const limitItems = <T,>(arr: T[]): T[] => branchLimit > 0 ? arr.slice(0, branchLimit) : arr;

            // Root
            ensureSpace(rootId, CAT_ROOT, rootName, 60);

            // ─── BFS Hierarchie: bis hopLimit-Hops ueber parent/child-Kanten ───
            // Sammelt zugleich alle erreichbaren Spaces, deren Mitglieder
            // wir spaeter (auf Hop 1) optional laden.
            if (showHierarchy) {
                const queue: Array<{ id: string; hop: number }> = [{ id: rootId, hop: 0 }];
                const visited = new Set<string>([rootId]);
                while (queue.length) {
                    const { id: cur, hop } = queue.shift()!;
                    if (hop >= hopLimit) continue;
                    const node = spaceById.get(cur);
                    if (!node) continue;
                    // Parent
                    if (node.parentSpaceId && !visited.has(node.parentSpaceId)) {
                        const parent = spaceById.get(node.parentSpaceId);
                        if (parent) {
                            visited.add(parent.id);
                            ensureSpace(parent.id, CAT_PARENT, parent.name, hop === 0 ? 50 : 38);
                            edges.push({ source: parent.id, target: cur, label: 'enthaelt' });
                            queue.push({ id: parent.id, hop: hop + 1 });
                        }
                    }
                    // Children
                    const kids = limitItems(childrenOf(cur));
                    for (const child of kids) {
                        if (visited.has(child.id)) continue;
                        visited.add(child.id);
                        ensureSpace(child.id, CAT_CHILD_SPACE, child.name, hop === 0 ? 42 : 32);
                        edges.push({ source: cur, target: child.id, label: 'enthaelt' });
                        queue.push({ id: child.id, hop: hop + 1 });
                    }
                }
            }

            // ─── Mitglieder ─── (nur Root-Space, sonst explodiert die Sichtbarkeit)
            if (showMembers) {
                try {
                    const members = await platformGw.getSpaceMembers(jwt, rootId);
                    for (const m of limitItems(members.items)) {
                        const c = contactById.get(m.userId);
                        const audience = c?.audience;
                        const displayName = m.user.displayName || c?.displayName || m.userId;
                        const symbolSize = audience === 'staff' ? 38 : 28;
                        ensurePerson(m.userId, audience, displayName, symbolSize);
                        edges.push({
                            source: rootId, target: m.userId,
                            label: m.role && m.role !== 'MEMBER' ? m.role : undefined,
                        });
                    }
                } catch { /* ignore */ }
            }

            // ─── Tasks + Files pro Space (Batch) ───
            if ((opts.showTasks || opts.showFiles)) {
                const spaceIdsInGraph = Array.from(nodeMap.values())
                    .filter(n => n.kind === 'space')
                    .map(n => n.id)
                    .slice(0, 50);
                if (spaceIdsInGraph.length > 0) {
                    try {
                        const res = await fetch('/api/platform/v1/graph/space-extras', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
                            body: JSON.stringify({ spaceIds: spaceIdsInGraph, limitPerSpace: 3 }),
                        });
                        if (res.ok) {
                            const data: { byId: Record<string, { tasks: Array<{ id: string; title: string }>; files: Array<{ id: string; title: string }> }> } = await res.json();
                            for (const [spaceId, extras] of Object.entries(data.byId)) {
                                if (opts.showTasks) for (const t of extras.tasks) ensureTask(t.id, t.title, spaceId);
                                if (opts.showFiles) for (const f of extras.files) ensureFile(f.id, f.title, spaceId);
                            }
                        }
                    } catch { /* graph-extras sind optional */ }
                }
            }

            return {
                rootId, rootName,
                nodes: Array.from(nodeMap.values()),
                edges,
                categories: CATEGORIES,
            };
        },

        searchPivotTargets(query: string): GraphPivotCandidate[] {
            const q = query.toLowerCase();
            return spaces
                .filter(s => s.name.toLowerCase().includes(q))
                .map(s => ({ id: s.id, name: s.name, subtitle: s.type }));
        },

        nodeActions(node) {
            if (node.kind === 'space') {
                return [{
                    icon: 'open_in_new', label: 'Space oeffnen',
                    onClick: (navigate, onClose) => {
                        navigate(`/spaces/${encodeURIComponent(node.id)}`);
                        onClose();
                    },
                }];
            }
            return [
                {
                    icon: 'open_in_new', label: 'Im Kontakte-Hub oeffnen',
                    onClick: (navigate, onClose) => {
                        navigate(`/contacts?focus=${encodeURIComponent(node.id)}`);
                        onClose();
                    },
                },
                {
                    icon: 'chat', label: 'Nachricht schicken',
                    onClick: (navigate, onClose) => {
                        navigate(`/dm/${encodeURIComponent(node.id)}`);
                        onClose();
                    },
                },
            ];
        },
    };
}

/**
 * ContactsAdapter — Beziehungs-Graph mit Person als Root.
 *
 * Verknuepfungen:
 *   - Familie: Eltern (-1) / Geschwister (0) / Kinder (1) / Enkel (2)
 *   - Schule: Spaces der Person, Lehrkraefte/Mitglieder dieser Spaces
 *
 * Toggle-Optionen:
 *   - showFamily: BFS-Familien-Suche (default true)
 *   - showSpaces: Klassen + Mitglieder (default true)
 *   - showAllMembers: bei Spaces nicht nur Lehrkraefte sondern alle (default false)
 */

import type { GraphAdapter, GraphData, GraphNode, GraphEdge, GraphCategory, GraphPivotCandidate } from '../graph-types';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import type { Contact } from '@/features/contacts/use-contacts';

interface FamilyRelation {
    id: string;
    userId: string;
    relationType: string;
    isPrimaryContact: boolean;
}

const RELATION_LABELS: Record<string, string> = {
    parent: 'Elternteil', guardian: 'Sorgeberechtigt',
    emergency_contact: 'Notfallkontakt', sibling: 'Geschwister',
    partner: 'Partner', other: 'Sonstige',
};

const CATEGORIES: GraphCategory[] = [
    { name: 'Eltern',         color: '#7c3aed' },  // 0
    { name: 'Geschwister',    color: '#0891b2' },  // 1
    { name: 'Person',         color: '#1d4ed8' },  // 2
    { name: 'Kinder',         color: '#059669' },  // 3
    { name: 'Enkel',          color: '#9333ea' },  // 4
    { name: 'Klasse/Space',   color: '#f59e0b' },  // 5
    { name: 'Lehrkraefte',    color: '#dc2626' },  // 6
];

const CAT_PARENT = 0, CAT_SIBLING = 1, CAT_PERSON = 2, CAT_CHILD = 3, CAT_GRANDCHILD = 4;
const CAT_SPACE = 5, CAT_STAFF = 6;

export interface ContactsAdapterOptions {
    showFamily?: boolean;
    showSpaces?: boolean;
    showAllMembers?: boolean;
    /** Tiefe ueber Familie/Spaces hinaus (1=heute, 2+=erweitert). */
    hopLimit?: number;
    /** Max Aeste pro Ebene. 0=unbegrenzt. */
    branchLimit?: number;
    /** Pro Space (im Personen-Graph) Top-N Aufgaben anhaengen. */
    showTasks?: boolean;
    /** Pro Space Top-N Dateien anhaengen. */
    showFiles?: boolean;
}

export function createContactsAdapter(contacts: Contact[]): GraphAdapter {
    const gw = createProjectGateway();
    const platformGw = createPlatformGateway();

    const nameOf = (uid: string): string =>
        contacts.find(c => c.id === uid)?.displayName ?? uid.replace(/^@/, '').split(':')[0];

    return {
        domain: 'Familiengraph',
        icon: 'account_tree',

        async loadGraph({ rootId, jwt, options }) {
            const opts = (options ?? {}) as ContactsAdapterOptions;
            const showFamily = opts.showFamily !== false;
            const showSpaces = opts.showSpaces !== false;
            const showAllMembers = opts.showAllMembers === true;
            const hopLimit = Math.max(1, Math.min(4, opts.hopLimit ?? 1));
            const branchLimit = opts.branchLimit ?? 0;
            const limitItems = <T,>(arr: T[]): T[] => branchLimit > 0 ? arr.slice(0, branchLimit) : arr;

            const familyByUser = new Map<string, { contacts: FamilyRelation[]; responsibleFor: FamilyRelation[] }>();

            // ─── Familien-BFS ───
            if (showFamily) {
                const visited = new Set<string>();
                const queue: { userId: string; depth: number }[] = [{ userId: rootId, depth: 0 }];
                while (queue.length > 0) {
                    const { userId, depth } = queue.shift()!;
                    if (visited.has(userId) || depth > 1) continue;
                    visited.add(userId);
                    try {
                        const res = await gw.getUserFamily(jwt, userId);
                        familyByUser.set(userId, res);
                        if (depth < 1) {
                            for (const r of [...res.contacts, ...res.responsibleFor]) {
                                if (!visited.has(r.userId)) queue.push({ userId: r.userId, depth: depth + 1 });
                            }
                        }
                    } catch { /* ignore */ }
                }
            }

            const rootFam = familyByUser.get(rootId) ?? { contacts: [], responsibleFor: [] };
            const rootName = nameOf(rootId);

            const nodeMap = new Map<string, GraphNode>();
            const edges: GraphEdge[] = [];

            // VisualType-Heuristik aus Kategorie + Kind. Person-Untertypen
            // werden ueber die Kategorie unterschieden (CAT_PARENT=Eltern,
            // CAT_CHILD=Kind/Schueler, CAT_STAFF=Mitarbeiter etc.) — die
            // Form folgt der Rolle, die Farbe weiter der Kategorie.
            const visualForNode = (id: string, category: number, kind: GraphNode['kind']): GraphNode['visualType'] => {
                if (kind === 'space') return 'space-1';
                // Person-Mapping aus Category-Konstanten
                if (category === CAT_PARENT) return 'parents';
                if (category === CAT_CHILD || category === CAT_SIBLING || category === CAT_GRANDCHILD) return 'student';
                if (category === CAT_STAFF) return 'staff';
                // CAT_PERSON = Root oder unbekannt
                return id === rootId ? 'staff' : 'staff';
            };

            const ensure = (id: string, category: number, opts?: { subtitle?: string; symbolSize?: number; color?: string; name?: string }) => {
                if (!nodeMap.has(id)) {
                    const kind: GraphNode['kind'] = id.startsWith('space:') ? 'space' : 'person';
                    // Name-Reihenfolge: expliziter Override → Root-Name →
                    // Personen-Lookup ueber nameOf. Bei Space-IDs (kein
                    // contacts-Eintrag) wuerde nameOf "space" liefern,
                    // deshalb MUSS der Caller bei spaces den Namen mitgeben.
                    const name = opts?.name
                        ?? (id === rootId ? rootName : (kind === 'space' ? id.replace(/^space:/, '') : nameOf(id)));
                    nodeMap.set(id, {
                        id, name,
                        kind,
                        category,
                        symbolSize: opts?.symbolSize ?? (id === rootId ? 60 : 38),
                        subtitle: opts?.subtitle,
                        pivotable: true,  // Alle Knoten klickbar — Caller (Hub) entscheidet wohin pivotiert wird
                        visualType: visualForNode(id, category, kind),
                        color: opts?.color,
                    });
                }
            };

            // Root
            ensure(rootId, CAT_PERSON, { symbolSize: 60 });

            // Familie — BFS bis hopLimit
            if (showFamily) {
                // Eltern direkt
                for (const r of limitItems(rootFam.contacts)) {
                    ensure(r.userId, CAT_PARENT, { symbolSize: 48, subtitle: RELATION_LABELS[r.relationType] });
                    edges.push({ source: r.userId, target: rootId, label: RELATION_LABELS[r.relationType] });
                }
                // Kinder direkt
                for (const r of limitItems(rootFam.responsibleFor)) {
                    ensure(r.userId, CAT_CHILD, { symbolSize: 48, subtitle: 'Kind' });
                    edges.push({ source: rootId, target: r.userId, label: RELATION_LABELS[r.relationType] });
                }
                // Geschwister (hop 2: andere Kinder der eigenen Eltern)
                if (hopLimit >= 2) {
                    for (const r of limitItems(rootFam.contacts)) {
                        const parentFam = familyByUser.get(r.userId);
                        if (!parentFam) continue;
                        for (const sib of limitItems(parentFam.responsibleFor)) {
                            if (sib.userId === rootId) continue;
                            ensure(sib.userId, CAT_SIBLING, { symbolSize: 40 });
                            edges.push({ source: r.userId, target: sib.userId, dashed: true, width: 1.5 });
                        }
                    }
                }
                // Enkel (hop 2: Kinder der eigenen Kinder)
                if (hopLimit >= 2) {
                    for (const r of limitItems(rootFam.responsibleFor)) {
                        const childFam = familyByUser.get(r.userId);
                        if (!childFam) continue;
                        for (const er of limitItems(childFam.responsibleFor)) {
                            if (er.userId === rootId) continue;
                            ensure(er.userId, CAT_GRANDCHILD, { symbolSize: 36 });
                            edges.push({ source: r.userId, target: er.userId, dashed: true, width: 1.5 });
                        }
                    }
                }
                // Hop 3+: Grosseltern, Cousins ueber Eltern-Eltern; sehr selten
                // sinnvoll, daher konservativ implementiert (nur Grosseltern).
                if (hopLimit >= 3) {
                    for (const r of limitItems(rootFam.contacts)) {
                        const parentFam = familyByUser.get(r.userId);
                        if (!parentFam) continue;
                        for (const gp of limitItems(parentFam.contacts)) {
                            if (gp.userId === rootId) continue;
                            ensure(gp.userId, CAT_PARENT, { symbolSize: 32, subtitle: 'Grosselternteil' });
                            edges.push({ source: gp.userId, target: r.userId, dashed: true, width: 1.5 });
                        }
                    }
                }
            }

            // ─── Schul-Spaces ───
            if (showSpaces) {
                try {
                    const spacesRes = await gw.getUserSpaces(jwt, rootId);
                    for (const space of limitItems(spacesRes.spaces)) {
                        const spaceNodeId = `space:${space.id}`;
                        ensure(spaceNodeId, CAT_SPACE, {
                            name: space.name,
                            subtitle: space.role || 'Mitglied',
                            symbolSize: 50,
                            // Eigene Space-Farbe — Personen-Graph zeigt mehrere
                            // Schul-Spaces gleichzeitig, jeder mit eigener Farbe.
                            color: space.color ?? undefined,
                        });
                        edges.push({
                            source: rootId, target: spaceNodeId,
                            label: space.role || 'Mitglied', color: space.color || '#f59e0b',
                        });

                        try {
                            const members = await platformGw.getSpaceMembers(jwt, space.id);
                            for (const m of limitItems(members.items)) {
                                if (m.userId === rootId) continue;
                                const memberContact = contacts.find(c => c.id === m.userId);
                                const isStaff = memberContact?.audience === 'staff';
                                if (!showAllMembers && !isStaff) continue;
                                if (!nodeMap.has(m.userId)) {
                                    ensure(m.userId, isStaff ? CAT_STAFF : (memberContact?.audience === 'minor' ? CAT_SIBLING : CAT_PERSON),
                                        { subtitle: memberContact?.userType ?? '', symbolSize: isStaff ? 40 : 30 });
                                }
                                edges.push({
                                    source: spaceNodeId, target: m.userId,
                                    color: space.color || '#f59e0b', dashed: true, width: 1.2,
                                });
                            }
                        } catch { /* space members nicht ladbar */ }
                    }
                } catch { /* keine spaces */ }
            }

            // ─── Tasks + Files pro Space anhaengen ───
            if (opts.showTasks || opts.showFiles) {
                const spaceNodeIds = Array.from(nodeMap.values())
                    .filter(n => n.kind === 'space')
                    .map(n => n.id);
                const rawSpaceIds = spaceNodeIds.map(id => id.replace(/^space:/, '')).slice(0, 50);
                if (rawSpaceIds.length > 0) {
                    try {
                        const res = await fetch('/api/platform/v1/graph/space-extras', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
                            body: JSON.stringify({ spaceIds: rawSpaceIds, limitPerSpace: 3 }),
                        });
                        if (res.ok) {
                            const data: { byId: Record<string, { tasks: Array<{ id: string; title: string }>; files: Array<{ id: string; title: string }> }> } = await res.json();
                            for (const [spaceRawId, extras] of Object.entries(data.byId)) {
                                const spaceNodeId = `space:${spaceRawId}`;
                                if (opts.showTasks) {
                                    for (const t of extras.tasks) {
                                        const tid = `task:${t.id}`;
                                        if (!nodeMap.has(tid)) {
                                            nodeMap.set(tid, {
                                                id: tid, name: t.title, kind: 'task',
                                                category: CAT_PERSON, symbolSize: 24,
                                                subtitle: 'Aufgabe', visualType: 'task', pivotable: true,
                                            });
                                            edges.push({ source: spaceNodeId, target: tid, dashed: true, width: 1.2 });
                                        }
                                    }
                                }
                                if (opts.showFiles) {
                                    for (const f of extras.files) {
                                        const fid = `doc:${f.id}`;
                                        if (!nodeMap.has(fid)) {
                                            nodeMap.set(fid, {
                                                id: fid, name: f.title, kind: 'file',
                                                category: CAT_PERSON, symbolSize: 22,
                                                subtitle: 'Dokument', visualType: 'document', pivotable: true,
                                            });
                                            edges.push({ source: spaceNodeId, target: fid, dashed: true, width: 1 });
                                        }
                                    }
                                }
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
            return contacts
                .filter(c =>
                    c.displayName.toLowerCase().includes(q) ||
                    c.username.toLowerCase().includes(q),
                )
                .map(c => ({
                    id: c.id, name: c.displayName,
                    subtitle: c.userType ? c.userType : '@' + c.username,
                }));
        },

        nodeActions(node) {
            if (node.kind === 'space') {
                return [{
                    icon: 'open_in_new', label: 'Klasse oeffnen',
                    onClick: (navigate, onClose) => {
                        navigate(`/spaces/${encodeURIComponent(node.id.slice('space:'.length))}`);
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

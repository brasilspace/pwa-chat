import type { SpaceUserType } from '@/gateways/platform/platform-types';

/**
 * Geteilte Helfer fuer den Space-Hierarchie-Baum.
 *
 * Wird sowohl von der Desktop-Sidebar (SpacesWorld in app-sidebar.tsx) als
 * auch von der Mobile-Spaces-Liste (mobile-spaces-list.tsx) verwendet —
 * damit Hierarchie, Farb-Vererbung und Unread-Aggregation in beiden
 * Welten identisch funktionieren und nur einmal gepflegt werden muessen.
 */

const DEFAULT_SPACE_COLORS = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e',
    '#06b6d4', '#ec4899', '#14b8a6', '#6366f1', '#f97316',
];

export function fallbackColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return DEFAULT_SPACE_COLORS[Math.abs(hash) % DEFAULT_SPACE_COLORS.length];
}

export interface SpaceData {
    id: string;
    name: string;
    color?: string | null;
    parentSpaceId?: string | null;
    matrixRoomId?: string | null;
    matrixChatRoomId?: string | null;
    userTypes?: SpaceUserType[];
    /** Vertretung-App: aktive Vertretung → Klasse orange in der Liste. */
    vertretungActive?: boolean;
}

export interface SpaceNode {
    space: SpaceData;
    children: SpaceNode[];
    /** Vererbte Wurzelfarbe fuer die ganze Hierarchie unter diesem Knoten. */
    rootColor: string;
}

export function buildTree(spaces: SpaceData[]): SpaceNode[] {
    const map = new Map<string, SpaceNode>();
    const roots: SpaceNode[] = [];
    for (const s of spaces) map.set(s.id, { space: s, children: [], rootColor: '' });
    for (const node of map.values()) {
        const pid = node.space.parentSpaceId;
        if (pid && map.has(pid)) {
            map.get(pid)!.children.push(node);
        } else {
            roots.push(node);
        }
    }
    // Eigene space.color schlaegt vererbte Farbe — nur wenn der Knoten
    // KEINE eigene Farbe hat, erbt er vom Vorgaenger. Das hat den Effekt:
    //   - Wurzel ohne Farbe → Hash-Fallback, an alle Nachkommen ohne eigene
    //     Farbe vererbt (klassische Hierarchie-Faerbung).
    //   - Kind mit eigener Farbe → wird respektiert, und sein eigener
    //     Sub-Baum erbt dann diese Farbe weiter.
    function assignColor(node: SpaceNode, inheritedColor: string) {
        const own = node.space.color || inheritedColor;
        node.rootColor = own;
        for (const child of node.children) assignColor(child, own);
    }
    for (const root of roots) {
        assignColor(root, root.space.color || fallbackColor(root.space.name));
    }
    return roots;
}

export interface UnreadAgg {
    unread: number;
    highlight: number;
}

/**
 * Fuer jeden Space die Summe eigener + aller Nachkommen-Unreads/-Highlights.
 *
 * Ein eingeklappter Parent kann damit "hier unten sind 5 ungelesen, davon
 * 1 Erwaehnung" anzeigen, ohne dass der User die Hierarchie aufklappen muss.
 */
export function buildUnreadMap(
    tree: SpaceNode[],
    chatSnapshot: { rooms: Map<string, { unreadCount: number; highlightCount: number }> },
): Map<string, UnreadAgg> {
    const map = new Map<string, UnreadAgg>();
    function walk(node: SpaceNode): UnreadAgg {
        const roomId = node.space.matrixChatRoomId ?? node.space.matrixRoomId;
        const room = roomId ? chatSnapshot.rooms.get(roomId) : undefined;
        let unread = room?.unreadCount ?? 0;
        let highlight = room?.highlightCount ?? 0;
        for (const child of node.children) {
            const childAgg = walk(child);
            unread += childAgg.unread;
            highlight += childAgg.highlight;
        }
        const agg = { unread, highlight };
        map.set(node.space.id, agg);
        return agg;
    }
    for (const root of tree) walk(root);
    return map;
}

import { type JSX, useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { useSpaces } from './use-spaces';
import { chatStore } from '@/features/chat/chat-store';
import { buildTree, buildUnreadMap, type SpaceNode, type UnreadAgg } from './space-tree';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

/**
 * Mobile-Variante der Spaces-Liste.
 *
 * Wird auf der Startseite (`/`) auf Mobile-Viewports gerendert. Ersetzt
 * die nicht vorhandene Sidebar — dort wo auf Desktop links der Spaces-
 * Tree liegt, ist hier der ganze Hauptbereich der Spaces-Tree.
 *
 * UX-Prinzipien:
 * - Hierarchisch (mit Aufklapp-Pfeil) wie auf Desktop, aber 44px Touch-
 *   Targets statt der kompakten Sidebar-Zeilen
 * - Unread-Badges aggregieren von eingeklappten Parents nach oben
 * - Suchfeld oben fuer schnelles Filtern bei vielen Spaces
 * - Tap auf einen Space → Navigation zu /spaces/<id>/chat
 *
 * Auf Desktop wird dieses Component nie gerendert — dort uebernimmt die
 * AppSidebar die Tree-Anzeige. Damit gibt es nirgends in der App eine
 * Spaces-Liste im Hauptbereich UND in der Sidebar gleichzeitig.
 */
export function MobileSpacesList(): JSX.Element {
    const t = useT();
    const { spaces } = useSpaces();
    const navigate = useNavigate();
    const chatSnapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const tenantName = session.bootstrap?.branding?.tenantName ?? 'Prilog';

    const [query, setQuery] = useState('');

    // Tree und Unread-Map werden bei jedem Sync neu berechnet
    const tree = useMemo(() => buildTree(spaces), [spaces]);
    const unreadMap = useMemo(() => buildUnreadMap(tree, chatSnapshot), [tree, chatSnapshot.rooms]);

    // Suche: filtert flach. Wenn Treffer gefunden werden, expandieren wir
    // automatisch alle Vorfahren-Knoten der Treffer, damit der User sie sieht.
    const matchesQuery = useCallback((name: string) => {
        if (!query.trim()) return true;
        return name.toLowerCase().includes(query.trim().toLowerCase());
    }, [query]);

    // Aufklapp-State pro Knoten. Beim ersten Mount alle Roots auf, alles andere zu.
    const [expanded, setExpanded] = useState<Set<string>>(() => {
        const initial = new Set<string>();
        for (const root of tree) initial.add(root.space.id);
        return initial;
    });

    // Wenn der User sucht, klappen wir alles auf, damit Treffer in tieferen
    // Ebenen sichtbar werden.
    useEffect(() => {
        if (!query.trim()) return;
        const all = new Set<string>();
        function collect(node: SpaceNode) {
            all.add(node.space.id);
            for (const child of node.children) collect(child);
        }
        for (const root of tree) collect(root);
        setExpanded(all);
    }, [query, tree]);

    const toggle = useCallback((id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    return (
        <div className="flex h-full flex-col bg-background">
            {/* Header mit Tenant-Name + Suche */}
            <div className="shrink-0 border-b border-border bg-background px-4 py-3">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                    <h1 className="text-lg font-semibold">{tenantName}</h1>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {spaces.length} {t('spaces.mobile_spaces_list.space')}{spaces.length === 1 ? '' : 's'}
                    </span>
                </div>
                <div className="relative">
                    <MaterialIcon name="search" size={16} className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('spaces.mobile_spaces_list.spaces_durchsuchen')}
                        className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
                    />
                </div>
            </div>

            {/* Quick-Links: Konzepte + Favoriten */}
            <div className="flex gap-2 border-b border-border px-4 py-2.5">
                <button
                    onClick={() => navigate('/konzepte')}
                    className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium transition-colors active:bg-muted"
                >
                    <MaterialIcon name="menu_book" size={16} className="size-4 text-primary" />
                    {t('spaces.mobile_spaces_list.konzepte')}
                </button>
                <button
                    onClick={() => navigate('/favorites')}
                    className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium transition-colors active:bg-muted"
                >
                    <MaterialIcon name="star" size={16} className="size-4 text-amber-500" />
                    {t('spaces.mobile_spaces_list.favoriten')}
                </button>
            </div>

            {/* Tree */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {tree.length === 0 ? (
                    <EmptyState />
                ) : (
                    <ul className="py-1 pl-4">
                        {tree.map((node, i) => (
                            <SpaceTreeRow
                                key={node.space.id}
                                node={node}
                                depth={0}
                                isLast={i === tree.length - 1}
                                parentLines={[]}
                                expanded={expanded}
                                onToggle={toggle}
                                unreadMap={unreadMap}
                                matchesQuery={matchesQuery}
                                onSelect={(id) => navigate(`/spaces/${id}/chat`)}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function EmptyState() {
    const t = useT();
    return (
        <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">{t('spaces.mobile_spaces_list.noch_keine_spaces_vorhanden')}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
                {t('spaces.mobile_spaces_list.frag_deinen_schul-admin_dich_einem_space')}
            </p>
        </div>
    );
}

interface SpaceTreeRowProps {
    node: SpaceNode;
    depth: number;
    isLast: boolean;
    parentLines: boolean[]; // pro Tiefenebene: hat der Vorfahr noch Geschwister? (zeichnet │)
    expanded: Set<string>;
    onToggle: (id: string) => void;
    unreadMap: Map<string, UnreadAgg>;
    matchesQuery: (name: string) => boolean;
    onSelect: (id: string) => void;
}

function SpaceTreeRow({ node, depth, isLast, parentLines, expanded, onToggle, unreadMap, matchesQuery, onSelect }: SpaceTreeRowProps): JSX.Element | null {
    const { space, children, rootColor } = node;
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(space.id);
    const isRoot = depth === 0;

    // Wenn der Knoten selbst nicht zur Suche passt, aber ein Nachfahre schon,
    // muessen wir ihn trotzdem rendern, damit der Treffer sichtbar ist.
    const selfMatches = matchesQuery(space.name);
    function anyDescendantMatches(n: SpaceNode): boolean {
        if (matchesQuery(n.space.name)) return true;
        return n.children.some(anyDescendantMatches);
    }
    if (!selfMatches && !anyDescendantMatches(node)) return null;

    const subtreeUnread = unreadMap.get(space.id) ?? { unread: 0, highlight: 0 };
    // Eingeklappt zeigen wir die Subtree-Summe, aufgeklappt nur unseren eigenen Count.
    const displayedUnread = hasChildren && isExpanded
        ? 0  // Kinder zeigen ihre eigenen Counts
        : subtreeUnread.unread;
    const displayedHighlight = hasChildren && isExpanded ? 0 : subtreeUnread.highlight;

    // ── SVG Tree-Connectors — Linien starten unter dem Farbpunkt der
    // Eltern-Zeile. Dot-Center jeder Zeile sitzt auf der Spalte
    // x_spine(d) = d*COL + COL/2; das ergibt eine durchgehende vertikale
    // Achse vom Eltern-Punkt zum Kind-Punkt. ─────────────────────────────
    const COL = 20;          // px Breite pro Tiefenstufe
    const ROW = 48;          // Zeilenhoehe
    const DOT_SIZE = 12;     // size-3
    const R = 6;             // Eckradius des Verbinders
    const SW = 1.5;          // Strichstaerke
    const MID = ROW / 2;
    // SVG-Breite so gewaehlt, dass der direkt nach dem SVG positionierte
    // Dot mit seiner Mitte exakt auf x_spine(depth) = depth*COL + COL/2
    // landet. svgW = x_spine - DOT_SIZE/2 = depth*COL + 4.
    const svgW = depth * COL + (COL / 2 - DOT_SIZE / 2);
    const opacity = 0.45;

    const paths: string[] = [];
    if (!isRoot) {
        // Ancestor-Linien: durchgezogene Verticals durch die Eltern-Spalten
        for (let i = 0; i < depth - 1; i++) {
            if (parentLines[i]) {
                const x = i * COL + COL / 2;
                paths.push(`M${x},0 V${ROW}`);
            }
        }
        // Verbinder vom Eltern-Punkt zum eigenen Punkt
        const bx = (depth - 1) * COL + COL / 2;
        // endX = svgW + DOT_SIZE/2 = direkt unter den Mittelpunkt des Dots,
        // damit die Linie visuell im Punkt verschwindet.
        const endX = svgW + DOT_SIZE / 2;
        if (isLast) {
            // └── : runde Ecke nach rechts
            paths.push(`M${bx},0 V${MID - R} Q${bx},${MID} ${bx + R},${MID} H${endX}`);
        } else {
            // ├── : voller Vertikalstrich + horizontaler Arm
            paths.push(`M${bx},0 V${ROW}`);
            paths.push(`M${bx},${MID} H${endX}`);
        }
    }

    return (
        <>
            <li>
                <div className="flex items-center pr-3" style={{ height: ROW }}>
                    {/* SVG Tree-Linien */}
                    <svg
                        className="shrink-0"
                        width={svgW}
                        height={ROW}
                        style={{ overflow: 'visible' }}
                    >
                        {paths.map((d, i) => (
                            <path
                                key={i}
                                d={d}
                                fill="none"
                                stroke={rootColor}
                                strokeWidth={SW}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={opacity}
                            />
                        ))}
                    </svg>

                    {/* Farb-Punkt — sitzt jetzt VOR dem Pfeil und liegt
                        exakt auf der Tree-Spalte, sodass die Verbindungs-
                        linien zu Kindern direkt unter ihm beginnen. */}
                    <div
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: rootColor }}
                    />

                    {/* Aufklapp-Pfeil — nach dem Dot. Spacer haelt Leaf-
                        Zeilen mit Parent-Zeilen buendig. */}
                    {hasChildren ? (
                        <button
                            type="button"
                            onClick={() => onToggle(space.id)}
                            aria-label={isExpanded ? 'Einklappen' : 'Ausklappen'}
                            className="flex size-9 shrink-0 items-center justify-center text-muted-foreground active:text-foreground"
                        >
                            <ChevronRight className={cn('size-4 transition-transform', isExpanded && 'rotate-90')} />
                        </button>
                    ) : (
                        <div className="size-9 shrink-0" />
                    )}

                    {/* Space-Name + Badge — Tap navigiert in den Chat */}
                    <button
                        type="button"
                        onClick={() => onSelect(space.id)}
                        className="flex h-11 flex-1 items-center gap-3 rounded-lg px-1 text-left transition-colors active:bg-muted"
                    >
                        <span className={cn(
                            'truncate flex-1 text-[15px]',
                            displayedUnread > 0 ? 'font-semibold text-foreground' : 'text-foreground',
                        )}>
                            {space.name}
                        </span>
                        {displayedUnread > 0 && (
                            <span className={cn(
                                'shrink-0 rounded-full px-1.5 py-0 text-[10px] font-bold leading-[18px] text-white tabular-nums min-w-[18px] text-center',
                                displayedHighlight > 0 ? 'bg-red-500' : 'bg-emerald-500',
                            )}>
                                {displayedUnread > 99 ? '99+' : displayedUnread}
                            </span>
                        )}
                    </button>
                </div>
            </li>

            {/* Kinder rekursiv, nur wenn aufgeklappt */}
            {hasChildren && isExpanded && children.map((child, i) => (
                <SpaceTreeRow
                    key={child.space.id}
                    node={child}
                    depth={depth + 1}
                    isLast={i === children.length - 1}
                    parentLines={[...parentLines, !isLast]}
                    expanded={expanded}
                    onToggle={onToggle}
                    unreadMap={unreadMap}
                    matchesQuery={matchesQuery}
                    onSelect={onSelect}
                />
            ))}
        </>
    );
}

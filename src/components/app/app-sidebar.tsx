import { type JSX, useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { NavLink, useNavigate, useParams, useLocation } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { useModule, useCan, useEnabledModules } from '@/core/permissions';
import type { ModuleKey } from '@/core/permissions';
import { useSpaces } from '@/features/spaces/use-spaces';
import { useContacts, type Contact } from '@/features/contacts/use-contacts';
import { chatStore } from '@/features/chat/chat-store';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/user-avatar';
// WorkflowsWorld import entfernt (Phase 4.7)
import { DocumentsWorld } from '@/features/documents/documents-world';
import { DmsWorld } from '@/features/dms/dms-world';
import { CalendarWorld } from '@/features/calendar/calendar-world';
import { MyTasksWorld } from '@/features/my-tasks/my-tasks-world';
import { FavoritesWorld } from '@/features/favorites/favorites-world';
import { MeinFachWorld } from '@/features/mein-fach/mein-fach-world';
import { StundenplanWorld } from '@/features/stundenplan/stundenplan-world';
import { VerankerungSidebar } from '@/features/verankerung/verankerung-sidebar';
import { findenFilterStore, FINDEN_ALL_TYPES, type FindenResultType } from '@/features/finden/finden-filter-store';
import { findenCountsStore } from '@/features/finden/finden-counts-store';
// ConceptsWorld import entfernt (Phase 4.7)
// UserInfoPanel now lives in the DM chat side panel
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MaterialIcon } from '@/components/ui/material-icon';
import { SidebarUserTypeFilter, hashHue } from './sidebar-user-type-filter';
import { userTypeFilterStore } from '@/features/contacts/user-type-filter-store';
import { sourceFilterStore, officeFilterStore, tagFilterStore } from '@/features/contacts/contacts-filters';
import { memberToView, externalToView, hasBirthdayWithin, isExpiringSoon, isExpiredActive, isOrphan } from '@/features/contacts/unified/contact-view';
import { bulkSelectionStore } from '@/features/contacts/bulk/bulk-selection-store';
import { showUndoToast } from '@/features/contacts/bulk/undo-toast';
import { externalContactsApi, type ExternalContactSummary } from '@/gateways/platform/external-contacts-gateway';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { spaceUserTypeFilterStore } from '@/features/spaces/space-user-type-filter-store';
import { buildTree, buildUnreadMap, type SpaceData, type SpaceNode, type UnreadAgg } from '@/features/spaces/space-tree';
import { SpaceHierarchyManager } from '@/features/spaces/space-hierarchy-manager';
import type { SpaceUserType } from '@/gateways/platform/platform-types';
import { Button } from '@/components/ui/button';
import { useVisibility } from '@/core/permissions';
import { hoermiCueStore } from './hoermi-cue-store';
import { useT } from "@/lib/i18n/use-t";

// Mapping: World-Key → Visibility-Matrix-Key. Jeder Hub hat seinen eigenen
// Schluessel, damit Admins z.B. "Termine sichtbar, Aufgaben nicht" pro
// Benutzertyp einstellen koennen. Frueher waren calendar/my-tasks/documents
// alle ueber hub_spaces gegated — pauschal auf/zu, was zu unflexibel war.
const WORLD_VISIBILITY_MAP: Record<string, string> = {
    users: 'hub_contacts',
    spaces: 'hub_spaces',
    'my-tasks': 'hub_my_tasks',
    calendar: 'hub_calendar',
    dms: 'hub_spaces', // DMS-Welt teilt sich Sichtbarkeit mit Spaces-Hub (Default an)
    flows: 'hub_workflows',
    verankerung: 'hub_workflows', // Konzept-Verankerung/Schutzkonzept — Process-Engine-Familie
    'konzept-bildung': 'hub_workflows', // Konzept-Bildung (9 Bausteine) — Bewertungsmodus
    documents: 'hub_spaces', // Dokumente-Cross-Space-Ansicht haengt am Spaces-Hub
    favorites: 'hub_favorites',
    'import-export': 'hub_spaces', // Import/Export sichtbar wenn Spaces sichtbar
    finden: 'hub_spaces', // Globale Suche immer sichtbar wenn Spaces sichtbar
};

// Mein Fach ist KEINE Welt — wandert in den Header neben Favoriten + Avatar
// (siehe app-header.tsx), weil es ein User-eigenes Konstrukt ist und nicht
// in die Tenant-weite Welten-Leiste gehoert.
type SidebarWorld = 'users' | 'spaces' | 'calendar' | 'my-tasks' | 'dms' | 'flows' | 'documents' | 'favorites' | 'mein-fach' | 'import-export' | 'finden' | 'verankerung' | 'konzept-bildung' | 'stundenplan';

// Reihenfolge ist verbindlich: Adressen → Spaces → Aufgaben → Termine →
// requiresModule koppelt eine Welt an ein App-Feature-Flag: ist die App
// nicht aktiv (Settings → Apps), verschwindet die Welt aus der Sidebar.
//
// Phase 5 (2026-04-30): "Flows"-Welt ist generischer Process-Engine-Editor.
// Ersetzt die alten Cascade + Konzept-Welten.
const WORLDS: { key: Exclude<SidebarWorld, 'favorites'>; label: string; icon: string; defaultUrl: string; requiresModule?: string }[] = [
    { key: 'users', label: 'Adressen', icon: 'groups', defaultUrl: '/contacts' },
    { key: 'spaces', label: 'Spaces', icon: 'grid_view', defaultUrl: '/' },
    { key: 'my-tasks', label: 'Aufgaben', icon: 'check_box', defaultUrl: '/meine-aufgaben', requiresModule: 'project' },
    { key: 'calendar', label: 'Termine', icon: 'calendar_today', defaultUrl: '/calendar', requiresModule: 'calendar' },
    { key: 'dms', label: 'DMS', icon: 'folder_open', defaultUrl: '/dms', requiresModule: 'personal-fach' },
    { key: 'flows', label: 'Flows', icon: 'schema', defaultUrl: '/flows' },
    { key: 'verankerung', label: 'Verankerung', icon: 'architecture', defaultUrl: '/verankerung' },
    { key: 'stundenplan', label: 'Stundenplan', icon: 'schedule', defaultUrl: '/stundenplan', requiresModule: 'stundenplan' },
    { key: 'import-export', label: 'Import/Export', icon: 'import_export', defaultUrl: '/import-export', requiresModule: 'import-export' },
    // 'finden' lebt jetzt als Quick-Access im Header VOR Favoriten
    // (app-header.tsx) — Route + Sidebar-Inhalt bleiben URL-getrieben.
];

function getActiveWorldFromPath(path: string): SidebarWorld {
    if (path.startsWith('/favorites')) return 'favorites';
    if (path.startsWith('/mein-fach')) return 'mein-fach';
    if (path.startsWith('/spaces/')) return 'spaces';
    if (path.startsWith('/dm/') || path.startsWith('/contacts')) return 'users';
    if (path.startsWith('/dms')) return 'dms';
    if (path.startsWith('/sheets')) return 'dms'; // Sheets ist Teil des DMS
    if (path.startsWith('/documents')) return 'documents';
    if (path.startsWith('/calendar')) return 'calendar';
    if (path.startsWith('/meine-aufgaben')) return 'my-tasks';
    if (path.startsWith('/flows')) return 'flows';
    if (path.startsWith('/ablaeufe')) return 'flows';
    if (path.startsWith('/verankerung') || path.startsWith('/konzept-cockpit') || path.startsWith('/schutzkonzept-cockpit')) return 'verankerung';
    // /konzepte bleibt als sekundärer Vorlagen-/Erklärbereich erreichbar,
    // ist aber keine eigene Welt mehr — Nutzerführung bündelt auf Verankerung.
    if (path.startsWith('/konzepte')) return 'verankerung';
    if (path.startsWith('/import-export')) return 'import-export';
    if (path.startsWith('/stundenplan')) return 'stundenplan';
    if (path.startsWith('/finden')) return 'finden';
    return 'spaces'; // default fuer / und alles andere
}

interface ModuleLink {
    key: ModuleKey;
    label: string;
    icon: string;
}

const MODULE_LINKS: ModuleLink[] = [
    { key: 'chat', label: 'Chat', icon: 'chat' },
    { key: 'files', label: 'Dateien', icon: 'folder_open' },
    { key: 'tasks', label: 'Aufgaben', icon: 'check_box' },
    { key: 'calendar', label: 'Kalender', icon: 'calendar_today' },
];

interface AppSidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps): JSX.Element {
    const t = useT();
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const { spaceId } = useParams<{ spaceId: string }>();
    const canViewSpaces = useCan('viewSpaces');
    const { isVisible } = useVisibility();
    const enabledModules = useEnabledModules();

    // Welten filtern: erst nach UserType-Sichtbarkeit, dann nach App-Aktivierung
    // (wenn requiresModule gesetzt ist und die App nicht installiert).
    const visibleWorlds = WORLDS.filter(w => {
        if (!isVisible(WORLD_VISIBILITY_MAP[w.key] ?? 'hub_spaces')) return false;
        if (w.requiresModule && !enabledModules.has(w.requiresModule as any)) return false;
        return true;
    });
    const canManageSpaces = useCan('manageSpaces');
    const { spaces } = useSpaces();
    const { contacts } = useContacts();
    const location = useLocation();
    const navigate = useNavigate();
    const activeWorld = getActiveWorldFromPath(location.pathname);
    // Hoermi-Cue: wenn waehrend einer Audio-Hilfe ein Welt-Schluessel
    // publiziert wird, leuchtet das passende Hub-Icon auf.
    const cueHub = useSyncExternalStore(hoermiCueStore.subscribe, hoermiCueStore.getSnapshot);

    // Klick auf einen Welten-Button: navigiere zur Default-URL der Welt.
    // Sonderfall Spaces:
    //   1) wenn wir schon in einem Space sind → bleiben (Kontext nicht verlieren)
    //   2) sonst: zum letzten Space (localStorage.prilog.lastSpaceRoute), gepflegt
    //      vom ShellLayout. Default `/` (Dashboard) waere falsch — der User will
    //      ueber den Spaces-Button immer in einen Space, nicht ins Dashboard.
    //   3) Fallback wenn noch nie ein Space geoeffnet wurde: erster Space der
    //      sichtbaren Liste; gibt es keinen, dann doch `/` (Empty-State / Dashboard).
    const handleWorldClick = useCallback((world: typeof WORLDS[number]) => {
        if (world.key === 'spaces') {
            if (location.pathname.startsWith('/spaces/')) return;
            try {
                const last = localStorage.getItem('prilog.lastSpaceRoute');
                if (last && last.startsWith('/spaces/')) {
                    // Pruefen, dass der Space noch existiert (und nicht z.B.
                    // archiviert wurde) — sonst Fallback unten.
                    const m = last.match(/^\/spaces\/([^/?]+)/);
                    const id = m?.[1];
                    if (id && spaces.some(s => s.id === id)) {
                        navigate(last);
                        return;
                    }
                }
            } catch { /* ignore */ }
            if (spaces.length > 0) {
                navigate(`/spaces/${spaces[0].id}`);
                return;
            }
        }
        navigate(world.defaultUrl);
    }, [location.pathname, navigate, spaces]);

    return (
        <aside
            className={cn(
                'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background transition-[width] duration-[var(--dur-base)] ease-[var(--ease-standard)]',
                collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
            )}
        >
            {/* Header — aligned with app-header (--header-height + border-b) */}
            <div className="flex h-[var(--header-height)] items-center justify-between border-b border-sidebar-border px-3">
                {!collapsed && (
                    <span className="text-base font-semibold">
                        <span className="text-foreground">{t('app.misc.prilog')}</span>
                        <span className="text-primary">team</span>
                    </span>
                )}
                <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={onToggle}>
                    <MaterialIcon name={collapsed ? 'chevron_right' : 'chevron_left'} size={20} />
                </Button>
            </div>

            {/* World Switcher — expanded: horizontale Toolbar-Zeile;
                collapsed: vertikaler Stapel (eine fixe --toolbar-height
                wuerde alle 6 Icons in eine Zeile quetschen → "Hub-Salat"). */}
            <div className={cn(
                'flex border-b border-sidebar-border',
                collapsed
                    ? 'flex-col items-center gap-1 py-2'
                    : 'h-[var(--toolbar-height)] items-center justify-start gap-0.5 px-2',
            )}>
                {visibleWorlds.map((world) => (
                    <Tooltip key={world.key}>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => handleWorldClick(world)}
                                className={cn(
                                    'flex h-8 w-8 items-center justify-center rounded transition-all',
                                    activeWorld === world.key
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                                    (cueHub === world.key || cueHub === '*') && 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-sidebar-background scale-110',
                                )}
                            >
                                <MaterialIcon name={world.icon} size={20} />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side={collapsed ? 'right' : 'bottom'} className="text-xs">
                            {world.label}
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>

            {/* Dynamic content based on active world (= URL-derived). */}
            <ScrollArea className="flex-1">
                <nav className="p-2">
                    {activeWorld === 'spaces' && (
                        <SpacesWorld
                            spaces={spaces}
                            spaceId={spaceId}
                            collapsed={collapsed}
                            canViewSpaces={canViewSpaces}
                            canManageSpaces={canManageSpaces}
                        />
                    )}

                    {activeWorld === 'users' && (
                        <UsersWorld collapsed={collapsed} contacts={contacts} />
                    )}

                    {activeWorld === 'calendar' && (
                        <CalendarWorld collapsed={collapsed} />
                    )}

                    {activeWorld === 'my-tasks' && (
                        <MyTasksWorld collapsed={collapsed} />
                    )}

                    {/* Phase 4.7: cascades + concepts Welten entfernt. */}

                    {activeWorld === 'documents' && (
                        <DocumentsWorld collapsed={collapsed} />
                    )}

                    {activeWorld === 'dms' && (
                        <DmsWorld collapsed={collapsed} />
                    )}

                    {activeWorld === 'mein-fach' && (
                        <MeinFachWorld collapsed={collapsed} />
                    )}

                    {activeWorld === 'favorites' && (
                        <FavoritesWorld collapsed={collapsed} />
                    )}

                    {activeWorld === 'stundenplan' && (
                        <StundenplanWorld collapsed={collapsed} />
                    )}

                    {activeWorld === 'verankerung' && !collapsed && (
                        <VerankerungSidebar collapsed={collapsed} />
                    )}

                    {activeWorld === 'finden' && !collapsed && (
                        <FindenWorld />
                    )}
                </nav>
            </ScrollArea>

            {/* Footer */}
            <Separator />
            <div className="p-2 space-y-1">
                {!collapsed ? (
                    <>
                        <SupportButton collapsed={false} />
                        <NavLink
                            to="/settings"
                            className={({ isActive }) =>
                                cn(
                                    'flex items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium transition-colors w-full',
                                    isActive
                                        ? 'bg-sidebar-active text-sidebar-accent-foreground'
                                        : 'text-sidebar-foreground hover:bg-sidebar-accent',
                                )
                            }
                        >
                            <MaterialIcon name="settings" size={20} />
                            <span>{t('app.misc.einstellungen')}</span>
                        </NavLink>
                    </>
                ) : (
                    <>
                        <SupportButton collapsed={true} />
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <NavLink
                                    to="/settings"
                                    className={({ isActive }) =>
                                        cn(
                                            'flex items-center justify-center rounded py-2 text-sm font-medium transition-colors w-full',
                                            isActive
                                                ? 'bg-sidebar-active text-sidebar-accent-foreground'
                                                : 'text-sidebar-foreground hover:bg-sidebar-accent',
                                        )
                                    }
                                >
                                    <MaterialIcon name="settings" size={20} />
                                </NavLink>
                            </TooltipTrigger>
                            <TooltipContent side="right">{t('app.misc.einstellungen')}</TooltipContent>
                        </Tooltip>
                    </>
                )}
            </div>
        </aside>
    );
}

/* --- Spaces World (Arc/Figma style with colored accent bars) --- */

const ANTHRACITE = '#6b7280'; // inactive bar color

// Tree-Bau und Unread-Aggregation wurden nach features/spaces/space-tree.ts
// extrahiert, damit die Mobile-Spaces-Liste denselben Code nutzen kann.
// SpaceData / SpaceNode / UnreadAgg / buildTree / buildUnreadMap kommen
// jetzt aus dem geteilten Modul.

function SpacesWorld({ spaces, spaceId, collapsed, canViewSpaces, canManageSpaces }: {
    spaces: SpaceData[];
    spaceId: string | undefined;
    collapsed: boolean;
    canViewSpaces: boolean;
    canManageSpaces: boolean;
}) {
    const t = useT();
    const navigate = useNavigate();
    const chatSnapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
    const tree = useMemo(() => buildTree(spaces), [spaces]);
    const unreadMap = useMemo(() => buildUnreadMap(tree, chatSnapshot), [tree, chatSnapshot.rooms]);
    const [showHierarchyManager, setShowHierarchyManager] = useState(false);

    // Find all ancestor IDs for a given spaceId
    const getAncestors = useCallback((targetId: string | undefined): string[] => {
        if (!targetId) return [];
        const parentMap = new Map<string, string>();
        for (const s of spaces) {
            if (s.parentSpaceId) parentMap.set(s.id, s.parentSpaceId);
        }
        const ancestors: string[] = [];
        let current = parentMap.get(targetId);
        while (current) {
            ancestors.push(current);
            current = parentMap.get(current);
        }
        return ancestors;
    }, [spaces]);

    const [expanded, setExpanded] = useState<Set<string>>(() => {
        const initial = new Set(tree.filter(n => n.children.length > 0).map(n => n.space.id));
        // Also expand ancestors of active space
        for (const id of getAncestors(spaceId)) initial.add(id);
        return initial;
    });

    // Auto-expand ancestors when active space changes
    useEffect(() => {
        if (!spaceId) return;
        const ancestors = getAncestors(spaceId);
        if (ancestors.length === 0) return;
        setExpanded(prev => {
            const next = new Set(prev);
            let changed = false;
            for (const id of ancestors) {
                if (!next.has(id)) { next.add(id); changed = true; }
            }
            return changed ? next : prev;
        });
    }, [spaceId, getAncestors]);

    const toggle = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    if (!canViewSpaces) return null;

    return (
        <SidebarGroup
            label={t('app.misc.spaces')}
            collapsed={collapsed}
        >
            {tree.map((node, i) => (
                <SpaceTreeNode
                    key={node.space.id}
                    node={node}
                    depth={0}
                    collapsed={collapsed}
                    expanded={expanded}
                    onToggle={toggle}
                    activeSpaceId={spaceId}
                    isLast={i === tree.length - 1}
                    parentLines={[]}
                    unreadMap={unreadMap}
                />
            ))}
            {!collapsed && canManageSpaces && (
                <>
                    <li>
                        <button
                            onClick={() => navigate(spaceId ? `/spaces/new?parent=${encodeURIComponent(spaceId)}` : '/spaces/new')}
                            className="mt-1 flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                            title={spaceId ? 'Space anlegen (optional als Unterspace des aktuellen Spaces)' : 'Neuen Space anlegen'}
                        >
                            <MaterialIcon name={spaceId ? 'subdirectory_arrow_right' : 'add'} size={20} />
                            Space anlegen
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setShowHierarchyManager(true)}
                            className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                            title={t('app.misc.hierarchie_per_dragdrop_neu_ordnen')}
                        >
                            <MaterialIcon name="account_tree" size={20} />
                            {t('app.misc.hierarchie_ordnen')}
                        </button>
                    </li>
                </>
            )}
            {showHierarchyManager && (
                <SpaceHierarchyManager onClose={() => setShowHierarchyManager(false)} />
            )}
        </SidebarGroup>
    );
}

function SpaceUserTypeFilterChips({ types, active, onSelect }: {
    types: SpaceUserType[];
    active: string | null;
    onSelect: (key: string | null) => void;
}) {
    const t = useT();
    return (
        <div className="px-1 pb-2">
            <div className="flex flex-wrap gap-1">
                <button
                    type="button"
                    onClick={() => onSelect(null)}
                    className={cn(
                        'rounded-full px-2 py-0.5 text-[0.625rem] font-medium transition-all duration-150',
                        active === null
                            ? 'bg-foreground text-background shadow-sm'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                >
                    {t('app.misc.alle')}
                </button>
                <button
                    type="button"
                    onClick={() => onSelect('__unassigned__')}
                    className={cn(
                        'rounded-full px-2 py-0.5 text-[0.625rem] font-medium transition-all duration-150',
                        active === '__unassigned__'
                            ? 'bg-foreground text-background shadow-sm'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                >
                    {t('app.misc.ohne_zuweisung')}
                </button>
                {types.map((ut) => {
                    const hue = hashHue(ut.label);
                    const isActive = active === ut.key;
                    return (
                        <button
                            key={ut.key}
                            type="button"
                            onClick={() => onSelect(ut.key)}
                            className={cn(
                                'rounded-full px-2 py-0.5 text-[0.625rem] font-medium text-white transition-all duration-150',
                                isActive
                                    ? 'ring-1 ring-offset-1 ring-offset-sidebar-background shadow-sm'
                                    : 'opacity-60 hover:opacity-100',
                            )}
                            style={{
                                backgroundColor: `hsl(${hue} 55% 45%)`,
                                ...(isActive ? { ringColor: `hsl(${hue} 55% 45%)` } : {}),
                            }}
                        >
                            {ut.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function SpaceTreeNode({ node, depth, collapsed, expanded, onToggle, activeSpaceId, isLast, parentLines, unreadMap }: {
    node: SpaceNode;
    depth: number;
    collapsed: boolean;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    activeSpaceId: string | undefined;
    isLast: boolean;
    parentLines: boolean[]; // true = parent has more siblings (draw │), per depth level
    unreadMap: Map<string, UnreadAgg>;
}) {
    const { space, children, rootColor } = node;
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(space.id);
    const isActive = activeSpaceId === space.id;
    const isRoot = depth === 0;
    const chatSnapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);

    // Unread-Anzeige: eingeklappt → Subtree-Summe (damit eingeklappte
    // Parents sichtbar machen, dass unten ungelesene Nachrichten liegen).
    // Aufgeklappt → nur eigener Count, die Kinder zeigen ihre eigene Summe.
    // Highlights (@-Erwaehnungen) bekommen einen roten Badge, normale
    // Unreads sind gruen — wie bei Slack.
    const subtreeAgg = unreadMap.get(space.id) ?? { unread: 0, highlight: 0 };
    const ownRoomId = space.matrixChatRoomId ?? space.matrixRoomId;
    const ownRoom = ownRoomId ? chatSnapshot.rooms.get(ownRoomId) : undefined;
    const ownUnread = ownRoom?.unreadCount ?? 0;
    const ownHighlight = ownRoom?.highlightCount ?? 0;
    const displayedUnread = hasChildren && isExpanded ? ownUnread : subtreeAgg.unread;
    const displayedHighlight = hasChildren && isExpanded ? ownHighlight : subtreeAgg.highlight;
    // Collapsed mode — Initialen-Tile in der Space-Farbe.
    // Aktiv: voller rootColor + weisse Schrift + Ring.
    // Inaktiv: rootColor mit ~14% Hintergrund, Text in rootColor.
    // Kleiner Radius (rounded-sm) statt voll-rund — bewusste Linie zur
    // Unterscheidung von User-Avataren (die sind kreisrund).
    if (collapsed) {
        // Initialen: erster Buchstabe gross, zweiter (falls vorhanden + kein
        // Whitespace) klein. "Fachbereich" → "Fa", "tttt" → "Tt", "X" → "X",
        // "AG" → "Ag", "Klasse 7a" → "Kl" (kein Wort-Split, nur erste 2 Chars).
        const name = (space.name?.trim() || '?');
        const c1 = name.slice(0, 1).toUpperCase();
        const c2 = name.slice(1, 2);
        const initial = c2 && c2.trim() ? c1 + c2.toLowerCase() : c1;
        // Aktiv: voller rootColor + weisser Text + Ring.
        // Inaktiv: neutral grau. Hover: rootColor in 14% Opacity + farbiger Text.
        // Die Space-Farbe wird via CSS-Var an den Hover-Klasse-State weitergereicht
        // (Tailwind kann sie dort via arbitrary value lesen).
        const tile = (
            <NavLink
                to={`/spaces/${space.id}`}
                onClick={() => { if (hasChildren && !isExpanded) onToggle(space.id); }}
                className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded text-[11px] font-semibold transition-all',
                    !isActive && 'bg-muted text-muted-foreground hover:bg-[color-mix(in_srgb,var(--space-c)_18%,transparent)] hover:text-[var(--space-c)]',
                )}
                style={{
                    ['--space-c' as string]: rootColor,
                    ...(isActive ? { backgroundColor: rootColor, color: '#fff', boxShadow: `0 0 0 1px ${rootColor}` } : {}),
                }}
            >
                {initial}
                {subtreeAgg.unread > 0 && (
                    <span className={cn(
                        'absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full text-[8px] font-bold text-white ring-2 ring-sidebar-background',
                        subtreeAgg.highlight > 0 ? 'bg-red-500' : 'bg-emerald-500',
                    )}>
                        {subtreeAgg.unread > 9 ? '9+' : subtreeAgg.unread}
                    </span>
                )}
            </NavLink>
        );
        return (
            <li className="flex justify-center">
                <Tooltip>
                    <TooltipTrigger asChild>{tile}</TooltipTrigger>
                    <TooltipContent side="right">
                        {space.name}
                        {subtreeAgg.unread > 0 && ` · ${subtreeAgg.unread} ungelesen`}
                        {subtreeAgg.highlight > 0 && ` · ${subtreeAgg.highlight} Erwaehnung${subtreeAgg.highlight === 1 ? '' : 'en'}`}
                    </TooltipContent>
                </Tooltip>
            </li>
        );
    }

    // ── SVG tree connectors — single path per line, zero gaps ─────────
    const COL = 14;        // px per depth column
    const ROW = 30;        // row height
    const R = 5;           // corner radius
    const SW = 1.5;        // stroke width
    const MID = ROW / 2;   // vertical midpoint
    const svgW = depth * COL + (isRoot ? 0 : 10); // total guide width incl. horizontal arm
    const color = rootColor;
    const opacity = 0.5;

    // Build SVG paths
    const paths: string[] = [];

    if (!isRoot) {
        // Ancestor pass-through lines: full-height verticals
        for (let i = 0; i < depth - 1; i++) {
            if (parentLines[i]) {
                const x = i * COL + COL / 2;
                paths.push(`M${x},0 V${ROW}`);
            }
        }

        // Branch connector at current depth: vertical down + rounded corner + horizontal arm
        const bx = (depth - 1) * COL + COL / 2; // x of the branch vertical
        const endX = depth * COL + 10;           // end of horizontal arm

        if (isLast) {
            // └── : vertical from top to mid-R, curve right, horizontal to end
            paths.push(`M${bx},0 V${MID - R} Q${bx},${MID} ${bx + R},${MID} H${endX}`);
        } else {
            // ├── : full vertical + horizontal arm from midpoint
            paths.push(`M${bx},0 V${ROW}`);
            paths.push(`M${bx},${MID} H${endX}`);
        }
    }

    // Root with expanded children: half-line down from mid
    if (isRoot && hasChildren && isExpanded) {
        // draw nothing in the SVG — the first child's branch will connect
    }

    return (
        <>
            <li>
                <div className="flex items-center" style={{ height: ROW, marginTop: -1, marginBottom: -1 }}>
                    {/* SVG guide area */}
                    {svgW > 0 && (
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
                                    stroke={color}
                                    strokeWidth={SW}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    opacity={opacity}
                                />
                            ))}
                        </svg>
                    )}

                    {/* Space link */}
                    <NavLink
                        to={`/spaces/${space.id}`}
                        onClick={() => { if (hasChildren && !isExpanded) onToggle(space.id); }}
                        className={cn(
                            'flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors duration-[var(--dur-fast)] min-w-0',
                            isActive
                                ? 'text-sidebar-accent-foreground font-semibold'
                                : 'text-sidebar-foreground hover:bg-sidebar-accent',
                            isRoot && 'font-semibold',
                        )}
                        style={isActive ? { backgroundColor: `${rootColor}15` } : {}}
                    >
                        {space.vertretungActive && (
                            <span
                                className="size-2 shrink-0 rounded-full bg-orange-500"
                                title="Vertretung aktiv – Infos/Material für diese Klasse verfügbar"
                            />
                        )}
                        <span className={cn(
                            'truncate flex-1',
                            displayedUnread > 0 && !isActive && 'font-semibold',
                            space.vertretungActive && 'text-orange-500 font-semibold',
                        )}>{space.name}</span>
                        {displayedUnread > 0 && (
                            <span className={cn(
                                'shrink-0 rounded-full px-1.5 py-0 text-[10px] font-bold leading-[14px] text-white tabular-nums',
                                displayedHighlight > 0 ? 'bg-red-500' : 'bg-emerald-500',
                            )}>
                                {displayedUnread > 99 ? '99+' : displayedUnread}
                            </span>
                        )}
                    </NavLink>

                    {hasChildren && (
                        <button
                            onClick={(e) => { e.preventDefault(); onToggle(space.id); }}
                            className="flex shrink-0 items-center px-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <MaterialIcon name="chevron_right" size={16} className={cn('transition-transform', isExpanded && 'rotate-90')} />
                        </button>
                    )}
                </div>
            </li>

            {hasChildren && isExpanded && children.map((child, i) => (
                <SpaceTreeNode
                    key={child.space.id}
                    node={child}
                    depth={depth + 1}
                    collapsed={collapsed}
                    expanded={expanded}
                    onToggle={onToggle}
                    activeSpaceId={activeSpaceId}
                    isLast={i === children.length - 1}
                    parentLines={[...parentLines, !isLast]}
                    unreadMap={unreadMap}
                />
            ))}

            {depth === 0 && <li className="h-2" />}
        </>
    );
}

/* --- Users/Contacts World --- */

function UsersWorld({ collapsed, contacts }: { collapsed: boolean; contacts: Contact[] }) {
    const t = useT();
    const navigate = useNavigate();
    const sessionSnap = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const role = sessionSnap.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const enabledModules = useEnabledModules();
    const hasCrmApp = enabledModules.has('contacts_crm' as ModuleKey);
    const jwt = sessionSnap.platform?.token;

    const activeUserTypeFilter = useSyncExternalStore(userTypeFilterStore.subscribe, userTypeFilterStore.getSnapshot, () => null);
    const sourceFilter = useSyncExternalStore(sourceFilterStore.subscribe, sourceFilterStore.getSnapshot);
    const officeFilter = useSyncExternalStore(officeFilterStore.subscribe, officeFilterStore.getSnapshot);
    const activeTagSlug = useSyncExternalStore(tagFilterStore.subscribe, tagFilterStore.getSnapshot);

    // Externe Kontakte fuer Source-Counter (nur wenn CRM aktiv)
    const [externals, setExternals] = useState<ExternalContactSummary[]>([]);
    useEffect(() => {
        if (!hasCrmApp || !jwt) return;
        externalContactsApi.list({ limit: 500 }).then(r => setExternals(r.items)).catch(() => { });
    }, [hasCrmApp, jwt]);

    // Tags fuer den Tag-Block
    const [tags, setTags] = useState<{ id: string; label: string; slug: string; color: string | null; contactCount?: number }[]>([]);
    // Gruppen fuer den Gruppen-Block — neu fuer das "+ Button"-Feature
    const [groups, setGroups] = useState<{ id: string; label: string; slug: string; color: string | null; category: string | null; memberCount: number }[]>([]);
    const [refreshTick, setRefreshTick] = useState(0);
    useEffect(() => {
        if (!jwt) return;
        const gw = createProjectGateway();
        gw.listContactTags(jwt).then(r => setTags((r.tags as typeof tags) ?? [])).catch(() => { });
        gw.listContactGroups(jwt).then(r => setGroups((r.groups as typeof groups) ?? [])).catch(() => { });
    }, [jwt, refreshTick]);

    // Live-Snapshot der aktuellen Bulk-Selektion (vom Hub gepflegt)
    const selection = useSyncExternalStore(bulkSelectionStore.subscribe, bulkSelectionStore.getSnapshot);
    const selectionCount = selection.entries.size;
    const memberSelectionCount = useMemo(() => {
        let n = 0; for (const e of selection.entries.values()) if (e.source === 'member') n++; return n;
    }, [selection]);

    const assignTag = useCallback(async (tagId: string, tagLabel: string) => {
        if (!jwt) return;
        const contacts = bulkSelectionStore.memberTargets();
        if (contacts.length === 0) return;
        const gw = createProjectGateway();
        const res = await gw.bulkAddContactTags(jwt, { tagIds: [tagId], contacts });
        setRefreshTick(n => n + 1);
        showUndoToast({
            jwt,
            batchId: res.batchId,
            summary: `Tag „${tagLabel}" zu ${res.affectedCount} Kontakten hinzugefuegt.`,
            onUndone: () => setRefreshTick(n => n + 1),
        });
    }, [jwt]);

    const assignGroup = useCallback(async (groupId: string, groupLabel: string) => {
        if (!jwt) return;
        const contacts = bulkSelectionStore.contactTargets();
        if (contacts.length === 0) return;
        const gw = createProjectGateway();
        const res = await gw.bulkAssignContactGroups(jwt, { groupIds: [groupId], contacts });
        setRefreshTick(n => n + 1);
        showUndoToast({
            jwt,
            batchId: res.batchId,
            summary: `${res.affectedCount} Kontakte der Gruppe „${groupLabel}" zugeordnet.`,
            onUndone: () => setRefreshTick(n => n + 1),
        });
    }, [jwt]);

    // UserTypes (mit Counts) aus den Kontakten ableiten
    const userTypeStats = useMemo(() => {
        const map = new Map<string, number>();
        for (const c of contacts) if (c.userType) map.set(c.userType, (map.get(c.userType) ?? 0) + 1);
        return Array.from(map.entries()).map(([label, count]) => ({ label, count }))
            .sort((a, b) => a.label.localeCompare(b.label, 'de'));
    }, [contacts]);

    // Office-Counts (Geburtstage etc.) — nur Admin sieht den Block
    const officeCounts = useMemo(() => {
        if (!isAdmin) return { birthdays: 0, expiring: 0, expiredActive: 0, noSpace: 0 };
        const all = [
            ...contacts.map(memberToView),
            ...(hasCrmApp ? externals.map(externalToView) : []),
        ];
        return {
            birthdays: all.filter(c => hasBirthdayWithin(c, 7)).length,
            expiring: all.filter(c => isExpiringSoon(c, 30)).length,
            expiredActive: all.filter(c => isExpiredActive(c)).length,
            noSpace: all.filter(c => isOrphan(c)).length,
        };
    }, [contacts, externals, hasCrmApp, isAdmin]);

    // Source-Counts
    const memberCount = contacts.length;
    const externalCount = externals.length;

    // Reset alle Filter zugleich
    const anyFilterActive = Boolean(
        activeUserTypeFilter || officeFilter || activeTagSlug || sourceFilter !== 'all',
    );
    const resetAll = () => {
        userTypeFilterStore.set(null);
        sourceFilterStore.set('all');
        officeFilterStore.set(null);
        tagFilterStore.set(null);
    };

    return (
        <>
            {/* ── Hauptaktion: Liste ── */}
            <SidebarGroup label={t('app.misc.kontakte')} collapsed={collapsed}>
                <li>
                    <NavLink to="/contacts" className={({ isActive }) => cn(
                        'flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm transition-colors',
                        isActive ? 'bg-sidebar-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                    )}>
                        <MaterialIcon name="groups" size={20} />
                        {!collapsed && <span className="flex-1">{t('app.misc.alle_kontakte')}</span>}
                        {!collapsed && <span className="text-[10px] text-muted-foreground">{memberCount + externalCount}</span>}
                    </NavLink>
                </li>
                {!collapsed && (
                    <li>
                        <button onClick={() => navigate('/invite')}
                            className="mt-1 flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
                            <MaterialIcon name="add" size={20} />
                            {t('app.misc.nutzer_einladen')}
                        </button>
                    </li>
                )}
                {!collapsed && anyFilterActive && (
                    <li>
                        <button onClick={resetAll}
                            className="mt-0.5 flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
                            <MaterialIcon name="filter_alt_off" size={16} />
                            {t('app.misc.alle_filter_zuruecksetzen')}
                        </button>
                    </li>
                )}
            </SidebarGroup>

            {/* ── Sicht: Mitglieder vs Externe ── */}
            {!collapsed && hasCrmApp && (
                <SidebarGroup label={t('app.misc.sicht')} collapsed={collapsed}>
                    <FilterRow active={sourceFilter === 'all'} icon="all_inclusive" label={t('app.misc.alle')}
                        count={memberCount + externalCount}
                        onClick={() => sourceFilterStore.set('all')} />
                    <FilterRow active={sourceFilter === 'members'} icon="verified_user" label={t('app.misc.mitglieder')}
                        count={memberCount}
                        onClick={() => sourceFilterStore.set('members')} />
                    <FilterRow active={sourceFilter === 'external'} icon="contacts" label={t('app.misc.externe')}
                        count={externalCount}
                        onClick={() => sourceFilterStore.set('external')} />
                </SidebarGroup>
            )}

            {/* ── Benutzertypen ── */}
            {!collapsed && userTypeStats.length > 0 && (
                <SidebarGroup label={t('app.misc.benutzertypen')} collapsed={collapsed}>
                    {userTypeStats.map(ut => (
                        <FilterRow key={ut.label}
                            active={activeUserTypeFilter === ut.label}
                            icon="account_circle"
                            label={ut.label}
                            count={ut.count}
                            onClick={() => userTypeFilterStore.set(activeUserTypeFilter === ut.label ? null : ut.label)} />
                    ))}
                </SidebarGroup>
            )}

            {/* ── Sekretariat (Office-Filter) — nur Admin ── */}
            {!collapsed && isAdmin && (
                <SidebarGroup label={t('app.misc.sekretariat')} collapsed={collapsed}>
                    <FilterRow active={officeFilter === 'birthdays'}
                        icon="cake" iconColor="#ec4899"
                        label={t('app.misc.geburtstage')} count={officeCounts.birthdays}
                        onClick={() => officeFilterStore.set(officeFilter === 'birthdays' ? null : 'birthdays')} />
                    <FilterRow active={officeFilter === 'expiring'}
                        icon="schedule" iconColor="#f59e0b"
                        label={t('app.misc.laeuft_ab')} count={officeCounts.expiring}
                        onClick={() => officeFilterStore.set(officeFilter === 'expiring' ? null : 'expiring')} />
                    <FilterRow active={officeFilter === 'expired-active'}
                        icon="warning" iconColor="#ef4444"
                        label={t('app.misc.karteileichen')} count={officeCounts.expiredActive}
                        onClick={() => officeFilterStore.set(officeFilter === 'expired-active' ? null : 'expired-active')} />
                    <FilterRow active={officeFilter === 'no-space'}
                        icon="folder_off" iconColor="#64748b"
                        label={t('app.misc.ohne_space')} count={officeCounts.noSpace}
                        onClick={() => officeFilterStore.set(officeFilter === 'no-space' ? null : 'no-space')} />
                </SidebarGroup>
            )}

            {/* ── Gruppen ── */}
            {!collapsed && groups.length > 0 && (
                <SidebarGroup label={t('app.misc.gruppen', { defaultValue: 'Gruppen' })} collapsed={collapsed}>
                    {groups.map(group => (
                        <FilterRow key={group.id}
                            active={false}
                            icon="group" iconColor={group.color ?? '#64748b'}
                            label={group.label}
                            count={group.memberCount}
                            onClick={() => { /* Filter folgt spaeter, vorerst Visualisierung + Quick-Add */ }}
                            assignAction={selectionCount > 0 ? {
                                selectionCount,
                                title: `${selectionCount} markierte Kontakte zu „${group.label}" hinzufuegen`,
                                onAssign: () => assignGroup(group.id, group.label),
                            } : undefined}
                        />
                    ))}
                </SidebarGroup>
            )}

            {/* ── Tags ── */}
            {!collapsed && tags.length > 0 && (
                <SidebarGroup label={t('app.misc.tags')} collapsed={collapsed}>
                    {tags.map(tag => (
                        <FilterRow key={tag.id}
                            active={activeTagSlug === tag.slug}
                            icon="sell" iconColor={tag.color ?? '#94a3b8'}
                            label={tag.label}
                            count={tag.contactCount}
                            onClick={() => {
                                if (activeTagSlug === tag.slug) tagFilterStore.set(null);
                                else tagFilterStore.set(tag.slug);
                            }}
                            assignAction={memberSelectionCount > 0 ? {
                                selectionCount: memberSelectionCount,
                                title: `${memberSelectionCount} markierte Mitglieder mit „${tag.label}" taggen`,
                                onAssign: () => assignTag(tag.id, tag.label),
                            } : undefined}
                        />
                    ))}
                </SidebarGroup>
            )}
        </>
    );
}

// ─── Filter-Row: einheitliches Pattern fuer alle Sidebar-Filter ──────
//
// Optionales `assignAction`: zeigt einen "+N"-Quick-Button rechts in der Row
// wenn N>0 Kontakte markiert sind. Klick fuegt die aktuelle Selektion dieser
// Tag-/Gruppen-Zeile zu (mit Undo-Toast).
function FilterRow({ active, icon, iconColor, label, count, onClick, assignAction }: {
    active: boolean; icon: string; iconColor?: string; label: string; count?: number; onClick: () => void;
    assignAction?: { selectionCount: number; onAssign: () => void; title: string };
}) {
    return (
        <li>
            <div className={cn(
                'group flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[12px] transition-colors',
                active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
            )}>
                <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <MaterialIcon name={icon} size={14}
                        style={iconColor && !active ? { color: iconColor } : undefined} />
                    <span className="flex-1 truncate">{label}</span>
                </button>
                {assignAction && assignAction.selectionCount > 0 && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); assignAction.onAssign(); }}
                        title={assignAction.title}
                        className="inline-flex h-5 items-center gap-0.5 rounded bg-primary px-1.5 text-[10px] font-medium text-primary-foreground opacity-0 transition-opacity hover:bg-primary/90 group-hover:opacity-100 focus:opacity-100"
                    >
                        <MaterialIcon name="add" size={12} />
                        {assignAction.selectionCount}
                    </button>
                )}
                {count !== undefined && (
                    <span className={cn(
                        'rounded px-1.5 py-0 text-[10px] tabular-nums',
                        active ? 'bg-primary/15' : 'bg-muted text-muted-foreground',
                    )}>
                        {count}
                    </span>
                )}
            </div>
        </li>
    );
}

/* --- Placeholder for future worlds --- */

function PlaceholderWorld({ collapsed, title, description }: {
    collapsed: boolean;
    title: string;
    description: string;
}) {
    return (
        <SidebarGroup label={title} collapsed={collapsed}>
            {!collapsed && (
                <p className="px-2.5 py-3 text-xs text-muted-foreground">
                    {description}
                </p>
            )}
        </SidebarGroup>
    );
}

/* --- Module nav with permission filtering --- */

function ModuleNavGroup({ spaceId, collapsed }: { spaceId: string; collapsed: boolean }) {
    const t = useT();
    return (
        <SidebarGroup label={t('app.misc.module')} collapsed={collapsed}>
            {MODULE_LINKS.map((mod) => (
                <ModuleNavItem key={mod.key} mod={mod} spaceId={spaceId} collapsed={collapsed} />
            ))}
        </SidebarGroup>
    );
}

function ModuleNavItem({ mod, spaceId, collapsed }: { mod: ModuleLink; spaceId: string; collapsed: boolean }) {
    const moduleEnabled = useModule(mod.key);
    if (!moduleEnabled) return null;

    return (
        <SidebarItem
            to={`/spaces/${spaceId}/${mod.key}`}
            icon={<MaterialIcon name={mod.icon} size={20} />}
            label={mod.label}
            collapsed={collapsed}
        />
    );
}

/* --- Sub-components --- */

function SidebarGroup({
    label,
    collapsed,
    action,
    children,
}: {
    label: string;
    collapsed: boolean;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="mb-2">
            {!collapsed && (
                <div className="mb-1 flex items-center justify-between px-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {label}
                    </p>
                    {action}
                </div>
            )}
            <ul className="space-y-0.5">{children}</ul>
        </div>
    );
}

function SidebarItem({
    to,
    icon,
    label,
    collapsed,
    badge,
}: {
    to: string;
    icon: React.ReactNode;
    label: string;
    collapsed: boolean;
    badge?: string;
}) {
    const content = (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cn(
                    'flex items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium transition-colors duration-[var(--dur-fast)]',
                    collapsed && 'justify-center px-0',
                    isActive
                        ? 'bg-sidebar-active text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent',
                )
            }
        >
            {badge ? (
                <span className="flex size-6 items-center justify-center rounded bg-muted text-[11px] font-semibold text-muted-foreground">
                    {badge}
                </span>
            ) : (
                icon
            )}
            {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
    );

    if (collapsed) {
        return (
            <li>
                <Tooltip>
                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
            </li>
        );
    }

    return <li>{content}</li>;
}

/* --- Support button with inline form --- */

function SupportButton({ collapsed }: { collapsed: boolean }) {
    const t = useT();
    const navigate = useNavigate();
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const adminId = snapshot.bootstrap?.tenant?.adminMatrixUserId;
    const myId = snapshot.matrix?.userId;

    // Don't show support button if user IS the admin or no admin configured
    if (!adminId || adminId === myId) return null;

    const handleClick = () => {
        navigate(`/dm/${encodeURIComponent(adminId)}`);
    };

    const button = (
        <button
            onClick={handleClick}
            className={cn(
                'flex items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium transition-colors text-sidebar-foreground hover:bg-sidebar-accent w-full',
                collapsed && 'justify-center px-0',
            )}
        >
            <MaterialIcon name="support" size={20} />
            {!collapsed && <span>{t('app.misc.support')}</span>}
        </button>
    );

    if (collapsed) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{t('app.misc.support')}</TooltipContent>
            </Tooltip>
        );
    }

    return button;
}

// ─────────────────────────────────────────────────────────────────────────
// FindenWorld — Filter-Inhalt der globalen Suche, sitzt in der App-Sidebar.
// Liest+schreibt finden-filter-store, zeigt Live-Counts aus
// finden-counts-store (gefuellt von FindenPage nach jedem Fetch).
// ─────────────────────────────────────────────────────────────────────────
function FindenWorld(): JSX.Element {
    const t = useT();
    const filter = useSyncExternalStore(findenFilterStore.subscribe, findenFilterStore.getSnapshot);
    const counts = useSyncExternalStore(findenCountsStore.subscribe, findenCountsStore.getSnapshot);

    const typeLabel: Record<FindenResultType, string> = {
        document: t('app.misc.dokumente'),
        contact: t('common.external'),
        member: t('common.members'),
        space: t('app.misc.spaces'),
        task: t('app.misc.aufgaben'),
        event: t('common.appointments'),
        tag: t('app.misc.tags'),
        transcription: t('app.misc.transkriptionen'),
    };
    const typeIcon: Record<FindenResultType, string> = {
        document: 'description',
        contact: 'contacts',
        member: 'person',
        space: 'grid_view',
        task: 'check_box',
        event: 'calendar_today',
        tag: 'sell',
        transcription: 'mic',
    };

    return (
        <div className="space-y-4 px-2 pb-4 text-[12px] text-sidebar-foreground">
            <div>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">{t('app.misc.typ')}</p>
                <div className="space-y-0.5">
                    {FINDEN_ALL_TYPES.map(_t => (
                        <label key={_t} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-sidebar-accent">
                            <input
                                type="checkbox"
                                checked={filter.enabledTypes.has(_t)}
                                onChange={() => findenFilterStore.toggleType(_t)}
                                className="size-3.5 accent-sidebar-primary"
                            />
                            <MaterialIcon name={typeIcon[_t]} size={14} className="opacity-70" />
                            <span className="flex-1">{typeLabel[_t]}</span>
                            {counts[_t] !== undefined && counts[_t]! > 0 && (
                                <span className="text-[10px] opacity-70">{counts[_t]}</span>
                            )}
                        </label>
                    ))}
                </div>
                <div className="mt-1 flex gap-2 px-1.5 text-[10px] opacity-70">
                    <button onClick={() => findenFilterStore.setAllTypes()} className="hover:underline">{t('app.misc.alle')}</button>
                </div>
            </div>

            <div>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">{t('app.misc.sortieren')}</p>
                <div className="space-y-0.5">
                    {([
                        { k: 'score' as const, label: 'Relevanz' },
                        { k: 'date' as const, label: 'Aenderungsdatum' },
                        { k: 'title' as const, label: 'Titel A–Z' },
                    ]).map(o => (
                        <label key={o.k} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-sidebar-accent">
                            <input
                                type="radio"
                                name="finden-sort"
                                checked={filter.sortBy === o.k}
                                onChange={() => findenFilterStore.setSortBy(o.k)}
                                className="size-3.5 accent-sidebar-primary"
                            />
                            <span>{o.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">{t('app.misc.gruppieren')}</p>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-sidebar-accent">
                    <input
                        type="checkbox"
                        checked={filter.groupByType}
                        onChange={() => findenFilterStore.setGroupByType(!filter.groupByType)}
                        className="size-3.5 accent-sidebar-primary"
                    />
                    {t('app.misc.nach_typ')}<span>{t('app.misc.nach_typ')}</span>
                </label>
            </div>
        </div>
    );
}

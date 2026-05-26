import { lazy, type ComponentType } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ModuleRouteDef {
    /** URL path segment (e.g. "files") */
    path: string;
    /** Display label */
    label: string;
    /** Material Symbols Rounded glyph name (z.B. "chat", "folder_open") */
    icon: string;
    /** Lazily loaded page component */
    component: ComponentType;
}

export interface FrontendModuleDef {
    /** Module key matching bootstrap response (e.g. "chat", "project") */
    key: string;
    /** Routes this module contributes to the space view */
    routes: ModuleRouteDef[];
    /** Default route path (first route if not specified) */
    defaultRoute?: string;
}

/* ------------------------------------------------------------------ */
/*  Lazy components                                                    */
/* ------------------------------------------------------------------ */

const LazyChatModule = lazy(() =>
    import('../../features/modules/chat-module').then(m => ({ default: m.ChatModule })),
);
const LazyFilesPlaceholder = lazy(() =>
    import('../../features/modules/files-placeholder').then(m => ({ default: m.FilesPlaceholder })),
);
const LazyTasksPlaceholder = lazy(() =>
    import('../../features/modules/tasks-placeholder').then(m => ({ default: m.TasksPlaceholder })),
);
const LazyCalendarPlaceholder = lazy(() =>
    import('../../features/modules/calendar-placeholder').then(m => ({ default: m.CalendarPlaceholder })),
);
const LazyLettersPlaceholder = lazy(() =>
    import('../../features/modules/letters-placeholder').then(m => ({ default: m.LettersPlaceholder })),
);
const LazyAbsencePlaceholder = lazy(() =>
    import('../../features/modules/absence-placeholder').then(m => ({ default: m.AbsencePlaceholder })),
);
const LazyNotebookPlaceholder = lazy(() =>
    import('../../features/modules/notebook-placeholder').then(m => ({ default: m.NotebookPlaceholder })),
);
const LazyDistributionTab = lazy(() =>
    import('../../features/mein-fach/distribution-tab').then(m => ({ default: m.DistributionTab })),
);
const LazyRelationshipGraphPlaceholder = lazy(() =>
    import('../../features/modules/relationship-graph-placeholder').then(m => ({ default: m.RelationshipGraphPlaceholder })),
);

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

/**
 * All known frontend modules. Each entry maps a module key to its routes
 * and lazily-loaded components.
 *
 * To add a new module:
 * 1. Create the component(s) in src/features/modules/
 * 2. Add a lazy import above
 * 3. Add an entry here
 * 4. The module will automatically appear in SpaceView when the backend
 *    includes it in the bootstrap response with enabled=true
 */
const MODULES: FrontendModuleDef[] = [
    {
        key: 'chat',
        routes: [
            { path: 'chat', label: 'Chat', icon: 'chat', component: LazyChatModule },
        ],
    },
    {
        key: 'project',
        routes: [
            { path: 'files', label: 'Dateien', icon: 'folder_open', component: LazyFilesPlaceholder },
            { path: 'tasks', label: 'Aufgaben', icon: 'check_box', component: LazyTasksPlaceholder },
        ],
    },
    {
        key: 'calendar',
        routes: [
            { path: 'calendar', label: 'Kalender', icon: 'calendar_today', component: LazyCalendarPlaceholder },
        ],
    },
    {
        key: 'letters',
        routes: [
            { path: 'letters', label: 'Briefe', icon: 'edit_note', component: LazyLettersPlaceholder },
        ],
    },
    {
        key: 'absence',
        routes: [
            { path: 'absence', label: 'Anwesenheit', icon: 'person_off', component: LazyAbsencePlaceholder },
        ],
    },
    {
        key: 'notebook',
        routes: [
            { path: 'notebook', label: 'Mitteilungen', icon: 'menu_book', component: LazyNotebookPlaceholder },
        ],
    },
    // Kaskade: jetzt als eigenstaendiger Hub, nicht mehr als Space-Tab
    {
        key: 'personal-fach',
        routes: [
            { path: 'verteiler', label: 'Verteiler-Fach', icon: 'call_split', component: LazyDistributionTab },
        ],
    },
    {
        key: 'relationship-graph',
        routes: [
            { path: 'graph', label: 'Graph', icon: 'account_tree', component: LazyRelationshipGraphPlaceholder },
        ],
    },
];

// Also register individual keys that map to the same routes
// (backend may send "files", "tasks" als separate Sub-Keys von project)
const COMPAT_KEY_MAP: Record<string, string> = {
    files: 'project',
    tasks: 'project',
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

const moduleMap = new Map<string, FrontendModuleDef>(MODULES.map(m => [m.key, m]));

/**
 * Get all route definitions for modules that are enabled.
 * Returns a flat list of routes to render in the space view.
 */
export function getEnabledModuleRoutes(enabledModuleKeys: Set<string>): ModuleRouteDef[] {
    const routes: ModuleRouteDef[] = [];
    const seen = new Set<string>(); // dedupe routes across compat keys

    for (const key of enabledModuleKeys) {
        const resolvedKey = COMPAT_KEY_MAP[key] ?? key;
        if (seen.has(resolvedKey)) continue;
        seen.add(resolvedKey);

        const mod = moduleMap.get(resolvedKey);
        if (mod) {
            routes.push(...mod.routes);
        }
    }

    return routes;
}

/**
 * Get the default route path. Bevorzugt 'chat' wenn aktiv — die meisten User
 * erwarten beim Oeffnen eines Spaces den Chat, nicht die Datei-Liste. Fallback
 * auf erste verfuegbare Route, sonst 'chat'.
 */
export function getDefaultModuleRoute(enabledModuleKeys: Set<string>): string {
    const routes = getEnabledModuleRoutes(enabledModuleKeys);
    const chatRoute = routes.find((r) => r.path === 'chat');
    if (chatRoute) return 'chat';
    return routes[0]?.path ?? 'chat';
}

/**
 * Get all registered modules (for introspection/debugging).
 */
export function getAllModules(): readonly FrontendModuleDef[] {
    return MODULES;
}

import { type JSX, useState, useEffect, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import { useNavigate } from 'react-router-dom';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { useEnabledModules, useVisibility } from '@/core/permissions';
import { getEnabledModuleRoutes } from '@/core/module-registry';
import { SpaceInfoPanel } from './space-info-panel';
// FilesPanel + MediaPanel entfernt (Phase 11) — alles ueber DocumentsPanel/DMS.
import { DocumentsPanel } from '@/features/documents/documents-panel';
import { TasksPanel } from './panels/tasks-panel';
import { CalendarPanel } from './panels/calendar-panel';
import { ActivityPanel } from './panels/activity-panel';
import { ActivityChartPanel } from './panels/activity-chart-panel';
import { HierarchyGraphPanel } from './panels/hierarchy-graph-panel';
import { EmailPanel } from './panels/email-panel';
import { LettersPanel } from '@/features/letters/letters-panel';
import { AbsencePanel } from '@/features/absence/absence-panel';
import { NotebookPanel } from '@/features/notebook/notebook-panel';
import { DistributionTab } from '@/features/mein-fach/distribution-tab';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface SpaceSidePanelProps {
    space: SpaceItem;
    fullscreen?: boolean;
    onToggleFullscreen?: () => void;
    activeTab?: string;
    onTabChange?: (tab: string) => void;
    onEditDocument?: (doc: any) => void;
}

const PANEL_COMPONENTS: Record<string, (props: { space: SpaceItem; fullscreen?: boolean }) => JSX.Element> = {
    files: DocumentsPanel,
    tasks: TasksPanel,
    calendar: CalendarPanel,
    letters: LettersPanel,
    absence: AbsencePanel,
    notebook: NotebookPanel,
    activity: ActivityPanel,
    'activity-chart': ActivityChartPanel,
    hierarchy: HierarchyGraphPanel,
    email: EmailPanel,
    // Verteiler-Tab kam aus der Modul-Registry in die Tab-Leiste, war aber
    // hier nie gerendert -> Inhalt blieb leer. DistributionTab holt sich
    // spaceId selbst via useParams (Route /spaces/:spaceId/*).
    verteiler: DistributionTab,
};

const TAB_VISIBILITY_MAP: Record<string, string> = {
    files: 'tab_files', tasks: 'tab_tasks', calendar: 'tab_calendar',
    letters: 'tab_letters', absence: 'tab_absence', notebook: 'tab_notebook',
    email: 'tab_letters', // Email sichtbar wenn Briefe sichtbar
    activity: 'tab_activity',
    'activity-chart': 'tab_activity',  // gleiche Sichtbarkeit wie activity-Liste
    hierarchy: 'tab_info',  // Hierarchie-Graph immer sichtbar wenn Info sichtbar
    info: 'tab_info',
};

export function SpaceSidePanel({ space, fullscreen, onToggleFullscreen, activeTab: controlledTab, onTabChange, onEditDocument }: SpaceSidePanelProps): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const enabledModules = useEnabledModules();
    const { isVisible } = useVisibility();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const moduleRoutes = getEnabledModuleRoutes(enabledModules)
        .filter(r => r.path !== 'chat')
        .filter(r => isVisible(TAB_VISIBILITY_MAP[r.path] ?? 'tab_chat'));
    const [internalTab, setInternalTab] = useState(() => {
        try {
            const saved = localStorage.getItem('prilog.sidePanelTab');
            if (saved) return saved;
        } catch { /* ignore */ }
        return moduleRoutes[0]?.path ?? 'info';
    });
    const activeTab = controlledTab ?? internalTab;
    const setActiveTab = onTabChange ?? ((tab: string) => {
        setInternalTab(tab);
        try { localStorage.setItem('prilog.sidePanelTab', tab); } catch { /* ignore */ }
    });

    // Activity-Tab nur wenn Modul aktiv (Workspace-App)
    const hasActivityModule = enabledModules.has('activity-heatmap' as any);

    // Module tabs + feste Tabs, gefiltert nach Visibility
    const allTabs = [
        ...moduleRoutes.map(r => ({ key: r.path, label: r.label, icon: r.icon })),
        // Email-Tab: nur sichtbar wenn Email aktiviert ist,
        // oder wenn der User Admin ist (damit er aktivieren kann)
        ...((space.emailEnabled || session.permissions?.effectiveInstanceRole === 'ADMIN' || session.permissions?.effectiveInstanceRole === 'SUPERADMIN')
            ? [{ key: 'email', label: t('common.email'), icon: 'mail' }] : []),
        // Medien-Tab entfernt (Phase 11) — Chat-Anhaenge landen jetzt im DMS,
        // sichtbar im Dokumente-Tab.
        ...(hasActivityModule ? [
            { key: 'activity', label: 'Aktivitaet', icon: 'monitor_heart' },
            { key: 'activity-chart', label: 'Aktivitaets-Verlauf', icon: 'show_chart' },
        ] : []),
        { key: 'hierarchy', label: 'Hierarchie-Graph', icon: 'hub' },
        { key: 'info', label: 'Info', icon: 'info' },
    ];
    const disabledSet = new Set(space.disabledTabs ?? []);
    const tabs = allTabs.filter(_t =>
        isVisible(TAB_VISIBILITY_MAP[_t.key] ?? 'tab_chat') && !disabledSet.has(_t.key)
    );

    const PanelComponent = activeTab === 'info' ? null : PANEL_COMPONENTS[activeTab];

    // Unread-Count fuer E-Mail-Tab (nur wenn aktiviert)
    const jwt = session.platform?.token ?? '';
    const [emailUnread, setEmailUnread] = useState(0);
    const loadUnread = async () => {
        if (!jwt || !space.emailEnabled) return;
        try {
            const res = await requestJson<{ unread: number }>({
                target: 'platform', baseUrl: env.platformBaseUrl,
                path: `/platform/v1/spaces/${space.id}/emails?status=new`,
                method: 'GET', bearerToken: jwt,
            });
            setEmailUnread(res.unread);
        } catch { }
    };
    useEffect(() => { loadUnread(); }, [jwt, space.id, space.emailEnabled]);
    useWorkflowEvents((evt, data) => {
        if (evt === 'space-email.received' && (data as { spaceId?: string }).spaceId === space.id) {
            loadUnread();
        }
    });

    return (
        <div className={cn('flex h-full flex-col', !fullscreen && 'border-l')}>
            {/* Mobile breadcrumb header — "Spaces > Space-Name" (mobile only) */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-2 md:hidden">
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    aria-label={t('spaces.space_side.zurueck_zu_den_spaces')}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors active:bg-muted"
                >
                    <MaterialIcon name="grid_view" size={20} />
                </button>
                <MaterialIcon name="chevron_right" size={16} className="shrink-0 text-muted-foreground/60" aria-hidden />
                <span className="truncate text-sm font-semibold">{space.name}</span>
            </div>

            {/* Tab bar — icons only */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center border-b px-1.5">
                <div className="flex flex-1 items-center gap-0.5">
                    {tabs.map(tab => (
                        <Tooltip key={tab.key}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setActiveTab(tab.key)}
                                    className={cn(
                                        'relative flex size-8 items-center justify-center rounded-md transition-colors',
                                        activeTab === tab.key
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                    )}
                                >
                                    <MaterialIcon name={tab.icon} size={20} />
                                    {tab.key === 'email' && emailUnread > 0 && (
                                        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                                            {emailUnread > 9 ? '9+' : emailUnread}
                                        </span>
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">{tab.label}</TooltipContent>
                        </Tooltip>
                    ))}
                </div>

                {onToggleFullscreen && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={onToggleFullscreen}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <MaterialIcon name={fullscreen ? 'close_fullscreen' : 'open_in_full'} size={18} />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {fullscreen ? 'Spaltenansicht' : 'Vollbild'}
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>

            {/* Content */}
            <div className="min-h-0 flex-1 overflow-hidden">
                {activeTab === 'info' && <SpaceInfoPanel space={space} />}
                {activeTab === 'files' && <DocumentsPanel space={space} fullscreen={fullscreen} onEditDocument={onEditDocument} />}
                {PanelComponent && activeTab !== 'files' && <PanelComponent space={space} fullscreen={fullscreen} />}
            </div>
        </div>
    );
}

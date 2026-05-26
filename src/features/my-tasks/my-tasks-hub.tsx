/**
 * my-tasks-hub.tsx — Meine Aufgaben (Cross-Space) im 3-Spalten-Layout.
 *
 * Sidebar (AppSidebar → MyTasksWorld):
 *   Filter-Listen — Sicht (offen/erledigt/alle), Dringlichkeit (Heute,
 *   Diese Woche, Ohne Datum, ...), Status, Spaces, Prioritaeten.
 *
 * Hauptfenster (linkes Panel):
 *   Liste der gefilterten Aufgaben mit Suche + View-Switch (Liste/Kanban/Gantt).
 *
 * Detail (rechtes Panel):
 *   TaskDetailPanel der ausgewaehlten Aufgabe (mit Inline-Edit, Kommentaren,
 *   Checklisten). Per Vollbild-Toggle ueberblendet er das Hauptfenster.
 */

import { type JSX, useState, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import type { MyTaskItem, WorkItem, WorkItemStatus, WorkItemPriority } from '@/features/project/project-types';
import { TaskDetailPanel } from '@/features/project/task-detail-panel';
import {
    urgencyFilterStore, statusFilterStore, spaceFilterStore, priorityFilterStore, personFilterStore,
    type UrgencyFilter,
} from './my-tasks-filters';
import { useContacts } from '@/features/contacts/use-contacts';
import { useSpaces } from '@/features/spaces/use-spaces';
import { ResizablePanels } from '@/components/ui/resizable-panels';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const gateway = createProjectGateway();

const STATUS_CONFIG: Record<WorkItemStatus, { icon: string; color: string; labelKey: string }> = {
    todo: { icon: 'radio_button_unchecked', color: 'text-muted-foreground', labelKey: 'common.open' },
    in_progress: { icon: 'schedule', color: 'text-amber-500', labelKey: 'app.misc.in_arbeit' },
    review: { icon: 'error', color: 'text-blue-500', labelKey: 'common.review' },
    done: { icon: 'check_circle', color: 'text-emerald-500', labelKey: 'common.done' },
};

const KANBAN_COLS: { key: WorkItemStatus; labelKey: string; color: string }[] = [
    { key: 'todo', labelKey: 'common.open', color: 'bg-slate-400' },
    { key: 'in_progress', labelKey: 'app.misc.in_arbeit', color: 'bg-amber-400' },
    { key: 'review', labelKey: 'common.review', color: 'bg-blue-400' },
    { key: 'done', labelKey: 'common.done', color: 'bg-emerald-400' },
];

function daysUntilDue(dueDate: string | null): number | null {
    if (!dueDate) return null;
    return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
}

function urgencyOf(t: { dueDate: string | null }): UrgencyFilter {
    const d = daysUntilDue(t.dueDate);
    if (d === null) return 'nodue';
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d <= 7) return 'thisWeek';
    if (d <= 31) return 'thisMonth';
    return 'later';
}

export function MyTasksHub(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const urgencyFilter = useSyncExternalStore(urgencyFilterStore.subscribe, urgencyFilterStore.getSnapshot);
    const statusFilter = useSyncExternalStore(statusFilterStore.subscribe, statusFilterStore.getSnapshot);
    const spaceFilter = useSyncExternalStore(spaceFilterStore.subscribe, spaceFilterStore.getSnapshot);
    const priorityFilter = useSyncExternalStore(priorityFilterStore.subscribe, priorityFilterStore.getSnapshot);
    const personFilter = useSyncExternalStore(personFilterStore.subscribe, personFilterStore.getSnapshot);
    const { contacts } = useContacts();
    const { spaces: allSpaces } = useSpaces();

    const [tasks, setTasks] = useState<MyTaskItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [fullscreen, setFullscreen] = useState(false);
    // Phase F: Kanban-Drop in 'Erledigt' triggert das Inline-Done-Form im
    // TaskDetailPanel. Jeder Drop bekommt ein frisches Date.now().
    const [openDoneFlowAt, setOpenDoneFlowAt] = useState<number | undefined>(undefined);

    // Inline-Composer fuer "Neue Aufgabe"
    const [showCompose, setShowCompose] = useState(false);
    const [composeSpaceId, setComposeSpaceId] = useState<string>('');
    const [composeTitle, setComposeTitle] = useState('');
    const [composing, setComposing] = useState(false);
    const [composeError, setComposeError] = useState<string | null>(null);

    // Detail-Panel hat alle Ansichten als Tabs:
    // - 'details': Detail des selektierten Tasks (TaskDetailPanel)
    // - alle anderen: Uebersichten (zeigen alle gefilterten Tasks)
    type DetailTab = 'details' | 'kanban' | 'gantt' | 'eisenhower' | 'lanes';
    const ALL_DETAIL_TABS: DetailTab[] = ['details', 'kanban', 'gantt', 'eisenhower', 'lanes'];
    const [detailTab, setDetailTab] = useState<DetailTab>(() => {
        try {
            const saved = localStorage.getItem('prilog.myTasks.detailTab');
            if (saved && (ALL_DETAIL_TABS as string[]).includes(saved)) return saved as DetailTab;
        } catch { /* ignore */ }
        return 'eisenhower';  // ohne Auswahl ist Eisenhower der hilfreichste Default
    });
    const setActiveDetailTab = (next: DetailTab) => {
        setDetailTab(next);
        try { localStorage.setItem('prilog.myTasks.detailTab', next); } catch { /* ignore */ }
    };

    // includeDone: server-seitig, sobald der User Erledigte sehen koennen
    // muss — Kanban/Lanes brauchen alle Stati, Status-Filter "done"/"alle"
    // explizit auch.
    const includeDone = detailTab === 'kanban' || detailTab === 'lanes' ||
        statusFilter === 'done' || statusFilter === null;

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await gateway.getMyTasks(jwt, { includeDone });
            setTasks(res.items ?? []);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [jwt, includeDone]);

    useEffect(() => { load(); }, [load]);

    // ── Update / Delete ──────────────────────────────────────────────────
    const updateItem = useCallback(async (id: string, patch: Record<string, unknown>) => {
        const t = tasks.find(x => x.id === id);
        if (!t || !jwt) return;
        await gateway.updateItem(jwt, t.spaceId, id, patch);
        // optimistisch im local state aktualisieren — Server-Response ist
        // identisch fuer den Use-Case
        setTasks(prev => prev.map(x => x.id === id ? { ...x, ...patch } as MyTaskItem : x));
    }, [tasks, jwt]);

    const deleteItem = useCallback(async (id: string, reason: string) => {
        const t = tasks.find(x => x.id === id);
        if (!t || !jwt) return;
        await gateway.deleteItem(jwt, t.spaceId, id, reason);
        setTasks(prev => prev.filter(x => x.id !== id));
    }, [tasks, jwt]);

    // Space-Optionen fuer "Neue Aufgabe": alle Spaces in denen der User
    // Mitglied ist (= alle die useSpaces zurueckliefert). Backend prueft
    // ohnehin file:upload-Permission beim Anlegen — falls fehlt, kommt
    // ein 403 zurueck und der User sieht eine Fehlermeldung.
    const composeSpaceOptions = useMemo(() => {
        return allSpaces
            .map(s => ({ id: s.id, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [allSpaces]);

    // Default-Auswahl beim ersten Oeffnen: erster Space.
    useEffect(() => {
        if (showCompose && !composeSpaceId && composeSpaceOptions.length > 0) {
            setComposeSpaceId(composeSpaceOptions[0].id);
        }
    }, [showCompose, composeSpaceId, composeSpaceOptions]);

    const submitCompose = useCallback(async () => {
        if (!jwt || !composeSpaceId || !composeTitle.trim() || composing) return;
        setComposing(true);
        setComposeError(null);
        try {
            await gateway.createItemFromMessage(jwt, composeSpaceId, { title: composeTitle.trim() });
            setComposeTitle('');
            setShowCompose(false);
            await load();
        } catch (err) {
            setComposeError((err as Error).message || 'Anlegen fehlgeschlagen');
        } finally {
            setComposing(false);
        }
    }, [jwt, composeSpaceId, composeTitle, composing, load]);

    // ── Drag-and-Drop Helpers ────────────────────────────────────────────
    // Kanban: nur Status setzen.
    const moveStatus = useCallback((id: string, status: WorkItemStatus) => {
        updateItem(id, { status });
    }, [updateItem]);

    // Eisenhower: Quadranten-Drop setzt Prioritaet + Faelligkeit so, dass
    // die Aufgabe in den Ziel-Quadranten faellt.
    //   - wichtig:    priority high (critical bleibt critical)
    //   - unwichtig:  priority medium (low bleibt low)
    //   - dringend:   dueDate auf morgen
    //   - nicht dringend: dueDate auf heute + 14 Tage
    // Bestehende Werte werden moeglichst beibehalten — nur was zur Quadranten-
    // Definition widerspricht, wird ueberschrieben.
    const moveEisenhower = useCallback((id: string, target: { important: boolean; urgent: boolean }) => {
        const t = tasks.find(x => x.id === id);
        if (!t) return;
        const patch: Record<string, unknown> = {};

        // Wichtig-Achse
        const isImp = isImportant(t);
        if (target.important && !isImp) patch.priority = 'high';
        if (!target.important && isImp) patch.priority = 'medium';

        // Dringend-Achse
        const isUrg = isUrgent(t);
        if (target.urgent !== isUrg) {
            const days = target.urgent ? 1 : 14;
            const d = new Date();
            d.setHours(12, 0, 0, 0);
            d.setDate(d.getDate() + days);
            patch.dueDate = d.toISOString();
        }

        if (Object.keys(patch).length > 0) updateItem(id, patch);
    }, [tasks, updateItem]);

    // ── Filter pipeline ──────────────────────────────────────────────────
    // Kanban und Verlauf trennen Tasks selbst nach Status auf (jede Spalte/
    // Lane = ein Status). Den Sidebar-Status-Filter ignorieren wir dort,
    // sonst waere die "Erledigt"-Spalte/Lane immer leer wenn der Default
    // "Offene" aktiv ist.
    const ignoreStatusFilter = detailTab === 'kanban' || detailTab === 'lanes';
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return tasks.filter(_t => {
            // status (nur in Tabs die nicht selbst nach Status aufteilen)
            if (!ignoreStatusFilter) {
                if (statusFilter === 'open') { if (_t.status === 'done') return false; }
                else if (statusFilter !== null) { if (_t.status !== statusFilter) return false; }
            }
            // urgency
            if (urgencyFilter && urgencyOf(_t) !== urgencyFilter) return false;
            // space
            if (spaceFilter && _t.spaceId !== spaceFilter) return false;
            // priority
            if (priorityFilter && _t.priority !== priorityFilter) return false;
            // person — User ist Verantwortlicher ODER Bearbeiter
            if (personFilter) {
                const involved = _t.responsibleUserId === personFilter || _t.assignees.includes(personFilter);
                if (!involved) return false;
            }
            // search
            if (q && !_t.title.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [tasks, ignoreStatusFilter, statusFilter, urgencyFilter, spaceFilter, priorityFilter, personFilter, search]);

    const selectedItem = useMemo(
        () => filtered.find(_t => _t.id === selectedId) ?? tasks.find(_t => _t.id === selectedId) ?? null,
        [filtered, tasks, selectedId],
    );

    const openCount = tasks.filter(_t => _t.status !== 'done').length;

    // Aktive Filter zaehlen — fuer eine Reset-Pille im Header
    const activeFilters: { label: string; clear: () => void }[] = [];
    if (statusFilter !== 'open') {
        const lbl = statusFilter === null ? t('app.misc.alle_stati')
            : statusFilter === 'done' ? t('common.done')
                : t(STATUS_CONFIG[statusFilter as WorkItemStatus].labelKey);
        activeFilters.push({ label: lbl, clear: () => statusFilterStore.set('open') });
    }
    if (urgencyFilter) {
        const map: Record<NonNullable<UrgencyFilter>, string> = {
            overdue: t('app.misc.ueberfaellig'), today: t('app.misc.heute'), thisWeek: t('app.misc.diese_woche'),
            thisMonth: t('app.misc.diesen_monat'), later: t('app.misc.spaeter'), nodue: t('app.misc.ohne_datum'),
        };
        activeFilters.push({ label: map[urgencyFilter], clear: () => urgencyFilterStore.set(null) });
    }
    if (spaceFilter) {
        const sp = tasks.find(_t => _t.spaceId === spaceFilter);
        activeFilters.push({ label: sp?.spaceName ?? 'Space', clear: () => spaceFilterStore.set(null) });
    }
    if (priorityFilter) {
        activeFilters.push({ label: priorityFilter, clear: () => priorityFilterStore.set(null) });
    }
    if (personFilter) {
        const c = contacts.find(x => x.id === personFilter);
        activeFilters.push({ label: c?.displayName ?? 'Person', clear: () => personFilterStore.set(null) });
    }

    // ── Left panel: schlanke Liste (Master) ─────────────────────────────
    // Alle Uebersichts-Modi (Kanban/Gantt/Eisenhower/Verlauf) leben als
    // Tabs in der Detail-Spalte. Linke Spalte bleibt immer Liste.
    const leftPanel = (
        <div className="flex h-full flex-col">
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
                <span className="text-xs text-muted-foreground tabular-nums">{openCount} offen</span>
                <div className="relative flex-1">
                    <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t('my-tasks.my_tasks_hub.aufgaben_durchsuchen')}
                        className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" onClick={load}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                            <MaterialIcon name="refresh" size={18} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{t('my-tasks.my_tasks_hub.neu_laden')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" onClick={() => setShowCompose(s => !s)}
                            title={t('my-tasks.my_tasks_hub.neu')}
                            aria-label={t('my-tasks.my_tasks_hub.neue_aufgabe')}
                            className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                            <MaterialIcon name="add" size={18} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{t('my-tasks.my_tasks_hub.neue_aufgabe')}</TooltipContent>
                </Tooltip>
            </div>

            {/* Inline-Composer fuer neue Aufgabe — Space-Picker aus den
                Tasks die schon angezeigt werden (= Spaces wo der User
                Tasks anlegen darf). */}
            {showCompose && (
                <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-3 py-2">
                    <select
                        value={composeSpaceId}
                        onChange={e => setComposeSpaceId(e.target.value)}
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                        <option value="">{t('my-tasks.my_tasks_hub.space_waehlen')}</option>
                        {composeSpaceOptions.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        autoFocus
                        value={composeTitle}
                        onChange={e => setComposeTitle(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') submitCompose();
                            if (e.key === 'Escape') { setShowCompose(false); setComposeTitle(''); }
                        }}
                        placeholder={t('my-tasks.my_tasks_hub.titel_der_neuen_aufgabe')}
                        className="h-8 flex-1 min-w-[200px] rounded-md border bg-background px-2 text-[13px]"
                    />
                    <button
                        type="button"
                        onClick={submitCompose}
                        disabled={composing || !composeSpaceId || !composeTitle.trim()}
                        className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {composing ? t('common.creating') : t('common.create')}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setShowCompose(false); setComposeTitle(''); setComposeError(null); }}
                        className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:bg-muted"
                    >
                        {t('my-tasks.my_tasks_hub.abbrechen')}
                    </button>
                    {composeError && (
                        <div className="w-full text-xs text-red-600">{composeError}</div>
                    )}
                </div>
            )}

            {/* Aktive Filter-Bar */}
            {activeFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-3 py-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('my-tasks.my_tasks_hub.filter')}</span>
                    {activeFilters.map((f, i) => (
                        <button key={i} type="button" onClick={f.clear}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20">
                            {f.label}
                            <MaterialIcon name="close" size={12} />
                        </button>
                    ))}
                </div>
            )}

            {/* Body */}
            <div className="min-h-0 flex-1">
                {loading ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground">
                        <MaterialIcon name="check_circle" size={40} className="text-muted-foreground/20" />
                        <p className="text-sm">{t('my-tasks.my_tasks_hub.keine_aufgaben_gefunden')}</p>
                        {activeFilters.length > 0 && (
                            <p className="text-[11px] text-muted-foreground/60">{t('my-tasks.my_tasks_hub.versuche_einen_filter_zu_entfernen')}</p>
                        )}
                    </div>
                ) : (
                    <ScrollArea className="h-full">
                        <ul className="divide-y">
                            {filtered.map(_t => (
                                <TaskRow
                                    key={_t.id}
                                    item={_t}
                                    selected={selectedId === _t.id}
                                    onClick={() => setSelectedId(_t.id)}
                                />
                            ))}
                        </ul>
                    </ScrollArea>
                )}
            </div>
        </div>
    );

    // ── Right panel: Tabs (Details + alle Uebersichten) ─────────────────
    // Liste lebt links als Master, ALLE anderen Modi sind hier oben als
    // Tab-Icons (gleiches Pattern wie space-side-panel.tsx).
    const TABS: { key: DetailTab; icon: string; label: string }[] = [
        { key: 'details', icon: 'badge', label: t('common.details') },
        { key: 'kanban', icon: 'view_column', label: 'Kanban' },
        { key: 'gantt', icon: 'view_timeline', label: 'Gantt' },
        { key: 'eisenhower', icon: 'grid_view', label: 'Eisenhower (Wichtig × Dringend)' },
        { key: 'lanes', icon: 'timeline', label: 'Verlauf (Status-Lanes ueber Zeit)' },
    ];

    const showSubHeader = detailTab === 'details' && selectedItem;

    const rightPanel = (
        <div className="flex h-full flex-col">
            {/* Detail-Toolbar — Tabs als Icons + Aktions-Icons rechts */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-0.5 border-b px-1.5">
                <div className="flex flex-1 items-center gap-0.5">
                    {TABS.map(_t => (
                        <Tooltip key={_t.key}>
                            <TooltipTrigger asChild>
                                <button type="button"
                                    onClick={() => setActiveDetailTab(_t.key)}
                                    className={cn(
                                        'flex size-8 items-center justify-center rounded-md transition-colors',
                                        detailTab === _t.key
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                    )}>
                                    <MaterialIcon name={_t.icon} size={20} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">{_t.label}</TooltipContent>
                        </Tooltip>
                    ))}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                    {selectedItem && detailTab === 'details' && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button type="button"
                                    onClick={() => navigate(`/spaces/${selectedItem.spaceId}/tasks`)}
                                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                                    <MaterialIcon name="open_in_new" size={18} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {t('my-tasks.my_tasks_hub.im_space_oeffnen')}{selectedItem.spaceName})
                            </TooltipContent>
                        </Tooltip>
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button"
                                onClick={() => setFullscreen(f => !f)}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                                <MaterialIcon name={fullscreen ? 'close_fullscreen' : 'open_in_full'} size={18} />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {fullscreen ? 'Spaltenansicht' : 'Vollbild'}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Sub-Header: Space/Board-Crumbs nur im Details-Tab mit Auswahl */}
            {showSubHeader && (
                <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-1.5 text-xs">
                    <span className="size-2 rounded-full" style={{ backgroundColor: selectedItem.spaceColor ?? '#94a3b8' }} />
                    <button type="button"
                        onClick={() => navigate(`/spaces/${selectedItem.spaceId}`)}
                        className="font-medium hover:text-primary hover:underline">
                        {selectedItem.spaceName}
                    </button>
                    {selectedItem.boardName && (
                        <>
                            <span className="text-muted-foreground/60">/</span>
                            <span className="text-muted-foreground">{selectedItem.boardName}</span>
                        </>
                    )}
                </div>
            )}

            {/* Tab-Content */}
            <div className="min-h-0 flex-1">
                {detailTab === 'details' ? (
                    selectedItem ? (
                        <div className="h-full overflow-y-auto">
                            <TaskDetailPanel
                                item={selectedItem as WorkItem}
                                allItems={tasks as WorkItem[]}
                                spaceId={selectedItem.spaceId}
                                onUpdate={updateItem}
                                onDelete={async (id, reason) => { await deleteItem(id, reason); setSelectedId(null); }}
                                onClose={() => setSelectedId(null)}
                                openDoneFlowAt={openDoneFlowAt}
                            />
                        </div>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                            <MaterialIcon name="check_box" size={40} className="text-muted-foreground/20" />
                            <p className="text-xs text-muted-foreground">{t('my-tasks.my_tasks_hub.aufgabe_links_waehlen_fuer_details')}</p>
                        </div>
                    )
                ) : detailTab === 'kanban' ? (
                    <KanbanView
                        items={filtered}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onMove={moveStatus}
                        onRequestDone={(id) => {
                            // Phase F: Drop in 'Erledigt' — Detail-Tab oeffnen
                            // und Inline-Done-Form triggern (sieht der User
                            // sonst nicht, weil das TaskDetailPanel im
                            // Kanban-Tab nicht gerendert wird).
                            setSelectedId(id);
                            setOpenDoneFlowAt(Date.now());
                            setDetailTab('details');
                        }}
                    />
                ) : detailTab === 'gantt' ? (
                    <GanttView
                        items={filtered}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                    />
                ) : detailTab === 'eisenhower' ? (
                    <EisenhowerMatrix
                        tasks={filtered}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onMove={moveEisenhower}
                    />
                ) : (
                    <StatusLanes
                        tasks={filtered}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                    />
                )}
            </div>
        </div>
    );

    return (
        <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">
                {fullscreen ? (
                    <div className="h-full">{rightPanel}</div>
                ) : (
                    <ResizablePanels
                        left={leftPanel}
                        right={rightPanel}
                        defaultLeftRatio={0.55}
                        minLeftRatio={0.3}
                        maxLeftRatio={0.8}
                    />
                )}
            </div>
        </div>
    );
}

// ─── Eisenhower-Matrix: Wichtig × Dringend ───────────────────────────────────
//
// Vier Quadranten (im Uhrzeigersinn ab oben links):
//   • Wichtig + Dringend   → "Sofort tun"
//   • Wichtig, nicht dringend  → "Planen"
//   • Dringend, nicht wichtig  → "Delegieren"
//   • Weder noch           → "Spaeter / weglassen"
//
// Schwellen:
//   • Dringend = dueDate <= heute + 3 Tage (oder ueberfaellig)
//   • Wichtig  = priority high oder critical
// Tasks ohne Datum gelten als "nicht dringend".

const PRIO_LABEL: Record<WorkItemPriority, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch' };
const STATUS_COLOR: Record<WorkItemStatus, string> = {
    todo: '#94a3b8',
    in_progress: '#f59e0b',
    review: '#3b82f6',
    done: '#10b981',
};

const URGENT_THRESHOLD_DAYS = 3;

function isUrgent(t: { dueDate: string | null }): boolean {
    if (!t.dueDate) return false;
    const d = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / 86400000);
    return d <= URGENT_THRESHOLD_DAYS;
}

function isImportant(t: { priority: WorkItemPriority }): boolean {
    return t.priority === 'high' || t.priority === 'critical';
}

function EisenhowerMatrix({ tasks, selectedId, onSelect, onMove }: {
    tasks: MyTaskItem[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onMove: (id: string, target: { important: boolean; urgent: boolean }) => void;
}) {
    const t = useT();
    const buckets = useMemo(() => {
        const q1: MyTaskItem[] = []; // important + urgent
        const q2: MyTaskItem[] = []; // important + not urgent
        const q3: MyTaskItem[] = []; // not important + urgent
        const q4: MyTaskItem[] = []; // not important + not urgent
        for (const t of tasks) {
            const imp = isImportant(t);
            const urg = isUrgent(t);
            if (imp && urg) q1.push(t);
            else if (imp) q2.push(t);
            else if (urg) q3.push(t);
            else q4.push(t);
        }
        // jeder Quadrant intern sortieren: zuerst critical/high, dann nach Datum
        const PRIO_RANK: Record<WorkItemPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        const sortFn = (a: MyTaskItem, b: MyTaskItem) => {
            const r = PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
            if (r !== 0) return r;
            const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return ad - bd;
        };
        return {
            q1: q1.sort(sortFn),
            q2: q2.sort(sortFn),
            q3: q3.sort(sortFn),
            q4: q4.sort(sortFn),
        };
    }, [tasks]);

    if (tasks.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <MaterialIcon name="grid_view" size={40} className="text-muted-foreground/20 mb-3" />
                {t('my-tasks.my_tasks_hub.keine_aufgaben_fuer_die_matrix')}<p className="text-sm">{t('my-tasks.my_tasks_hub.keine_aufgaben_fuer_die_matrix')}</p>
            </div>
        );
    }

    return (
        <div className="grid h-full grid-cols-[auto_1fr_1fr] grid-rows-[auto_1fr_1fr] gap-0 overflow-hidden bg-background">
            {/* Achsen-Labels */}
            <div className="border-b border-r" />
            <div className="flex items-center justify-center border-b border-r bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('common.urgent')}
            </div>
            <div className="flex items-center justify-center border-b bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('common.not_urgent')}
            </div>

            {/* Q1 + Q2: Wichtig */}
            <div className="flex items-center justify-center border-r bg-muted/30 px-1.5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                {t('common.important')}
            </div>
            <Quadrant title={t('my-tasks.my_tasks_hub.sofort_tun')} subtitle="Wichtig × Dringend" accent="#dc2626"
                tasks={buckets.q1} selectedId={selectedId} onSelect={onSelect}
                onDrop={(id) => onMove(id, { important: true, urgent: true })}
                className="border-b border-r" />
            <Quadrant title={t('my-tasks.my_tasks_hub.planen')} subtitle="Wichtig × Nicht dringend" accent="#3b82f6"
                tasks={buckets.q2} selectedId={selectedId} onSelect={onSelect}
                onDrop={(id) => onMove(id, { important: true, urgent: false })}
                className="border-b" />

            {/* Q3 + Q4: Nicht wichtig */}
            <div className="flex items-center justify-center border-r bg-muted/30 px-1.5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                {t('common.less_important')}
            </div>
            <Quadrant title={t('my-tasks.my_tasks_hub.delegieren')} subtitle="Dringend × Weniger wichtig" accent="#f59e0b"
                tasks={buckets.q3} selectedId={selectedId} onSelect={onSelect}
                onDrop={(id) => onMove(id, { important: false, urgent: true })}
                className="border-r" />
            <Quadrant title={t('my-tasks.my_tasks_hub.spaeter')} subtitle="Weniger wichtig × Nicht dringend" accent="#94a3b8"
                tasks={buckets.q4} selectedId={selectedId} onSelect={onSelect}
                onDrop={(id) => onMove(id, { important: false, urgent: false })} />
        </div>
    );
}

function Quadrant({ title, subtitle, accent, tasks, selectedId, onSelect, onDrop, className }: {
    title: string;
    subtitle: string;
    accent: string;
    tasks: MyTaskItem[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onDrop: (id: string) => void;
    className?: string;
}) {
    const t = useT();
    return (
        <div className={cn('flex min-h-0 flex-col overflow-hidden transition-colors', className)}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/5'); }}
            onDragLeave={e => e.currentTarget.classList.remove('bg-primary/5')}
            onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove('bg-primary/5');
                const id = e.dataTransfer.getData('text/plain');
                if (id) onDrop(id);
            }}>
            <div className="shrink-0 border-b px-3 py-2" style={{ backgroundColor: accent + '11' }}>
                <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full" style={{ backgroundColor: accent }} />
                    <span className="text-xs font-semibold" style={{ color: accent }}>{title}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{tasks.length}</span>
                </div>
                <div className="text-[10px] text-muted-foreground/70">{subtitle}</div>
            </div>
            <ScrollArea className="flex-1">
                <ul className="space-y-1 p-2">
                    {tasks.length === 0 ? (
                        <li className="rounded-md border border-dashed py-3 text-center text-[10px] text-muted-foreground/40">
                            {t('my-tasks.my_tasks_hub.hierhin_ziehen')}
                        </li>
                    ) : (
                        tasks.map(_t => (
                            <EisenhowerCard key={_t.id} item={_t}
                                selected={selectedId === _t.id}
                                onClick={() => onSelect(_t.id)} />
                        ))
                    )}
                </ul>
            </ScrollArea>
        </div>
    );
}

function EisenhowerCard({ item, selected, onClick }: { item: MyTaskItem; selected: boolean; onClick: () => void }) {
    const days = daysUntilDue(item.dueDate);
    const dueLabel = days === null ? 'ohne Datum'
        : days < 0 ? `${Math.abs(days)}d ueberfaellig`
            : days === 0 ? 'Heute'
                : days === 1 ? 'Morgen'
                    : `in ${days}d`;
    const dueColor = days === null ? 'text-muted-foreground'
        : days < 0 ? 'text-destructive font-medium'
            : days <= URGENT_THRESHOLD_DAYS ? 'text-amber-600 font-medium'
                : 'text-muted-foreground';
    return (
        <li>
            <div
                draggable
                onDragStart={e => {
                    e.dataTransfer.setData('text/plain', item.id);
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={onClick}
                className={cn(
                    'flex w-full cursor-grab items-start gap-2 rounded-md border bg-card p-2 text-left transition-colors hover:bg-muted/40 active:cursor-grabbing',
                    selected && 'ring-2 ring-primary',
                    item.status === 'done' && 'opacity-60',
                )}>
                <div className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[item.status] }} />
                <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-[12px] font-medium', item.status === 'done' && 'line-through')}>
                        {item.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
                        <span className="rounded px-1 py-0" style={{ backgroundColor: (item.spaceColor ?? '#94a3b8') + '22', color: item.spaceColor ?? '#94a3b8' }}>
                            {item.spaceName}
                        </span>
                        <span className={dueColor}>{dueLabel}</span>
                    </div>
                </div>
            </div>
        </li>
    );
}

// ─── Status-Lanes ueber Zeit ─────────────────────────────────────────────────
//
// 4 horizontale Bahnen (eine pro Status). Jede Aufgabe als Bar:
//   • horizontale Position = Faelligkeitsdatum (Tasks ohne Datum landen
//     in einer separaten "ohne Datum"-Sammelzeile am Anfang)
//   • Bar-Laenge = startDate → dueDate (ein Tag breit wenn nur dueDate)
//   • Bar-Hoehe / Linkes Akzent = Prioritaet
// Plus rote "Heute"-Linie.

function StatusLanes({ tasks, selectedId, onSelect }: { tasks: MyTaskItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
    const t = useT();
    if (tasks.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <MaterialIcon name="view_timeline" size={40} className="text-muted-foreground/20 mb-3" />
                {t('my-tasks.my_tasks_hub.keine_aufgaben_fuer_den_verlauf')}<p className="text-sm">{t('my-tasks.my_tasks_hub.keine_aufgaben_fuer_den_verlauf')}</p>
            </div>
        );
    }

    const dated = tasks.filter(_t => _t.dueDate);
    const undated = tasks.filter(_t => !_t.dueDate);

    const today = Date.now();
    const allTimes = dated.flatMap(_t => [
        new Date(_t.dueDate!).getTime(),
        _t.startDate ? new Date(_t.startDate).getTime() : new Date(_t.dueDate!).getTime(),
    ]).concat([today]);
    const minT = Math.min(...allTimes) - 86400000 * 2;
    const maxT = Math.max(...allTimes) + 86400000 * 5;
    const range = Math.max(1, maxT - minT);
    const todayPct = ((today - minT) / range) * 100;

    const PRIO_HEIGHT: Record<WorkItemPriority, number> = { low: 14, medium: 18, high: 22, critical: 26 };
    const STATUSES: { key: WorkItemStatus; label: string }[] = [
        { key: 'todo', label: t('common.open') },
        { key: 'in_progress', label: 'In Arbeit' },
        { key: 'review', label: t('common.review') },
        { key: 'done', label: t('common.done') },
    ];

    // Datum-Ticks fuer die Header-Skala — alle 7 Tage
    const ticks: { time: number; label: string }[] = [];
    {
        const startDay = new Date(minT);
        startDay.setHours(0, 0, 0, 0);
        for (let t = startDay.getTime(); t <= maxT; t += 86400000 * 7) {
            ticks.push({
                time: t,
                label: new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }),
            });
        }
    }

    return (
        <ScrollArea className="h-full">
            <div className="min-w-[560px] p-3">
                {/* Ohne-Datum Sammelzeile */}
                {undated.length > 0 && (
                    <div className="mb-3 rounded-md border bg-muted/20 p-2">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('my-tasks.my_tasks_hub.ohne_datum')}{undated.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {undated.map(_t => (
                                <button key={_t.id} type="button" onClick={() => onSelect(_t.id)}
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11px] hover:bg-muted/40',
                                        selectedId === _t.id && 'ring-2 ring-primary',
                                    )}
                                    style={{ borderLeft: `3px solid ${STATUS_COLOR[_t.status]}` }}>
                                    <span className="truncate">{_t.title}</span>
                                    <span className="text-[9px] text-muted-foreground">· {PRIO_LABEL[_t.priority]}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Datums-Header */}
                <div className="relative mb-1 ml-[110px] h-5 border-b text-[9px] text-muted-foreground">
                    {ticks.map((tk, i) => {
                        const left = ((tk.time - minT) / range) * 100;
                        return (
                            <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${left}%` }}>
                                {tk.label}
                            </span>
                        );
                    })}
                </div>

                {/* 4 Lanes */}
                <div className="relative">
                    {/* Heute-Linie ueber alle Lanes */}
                    <div className="pointer-events-none absolute top-0 z-10" style={{
                        left: `calc(110px + ${todayPct}% * (100% - 110px) / 100%)`,
                        height: `${STATUSES.length * 56}px`,
                    }}>
                        <div className="h-full w-px border-l-2 border-dashed border-destructive/70" />
                        <span className="absolute -top-2 -translate-x-1/2 rounded bg-destructive px-1 py-0 text-[8px] font-medium text-white">
                            {t('my-tasks.my_tasks_hub.heute')}
                        </span>
                    </div>

                    {STATUSES.map(lane => {
                        const laneTasks = dated.filter(_t => _t.status === lane.key);
                        return (
                            <div key={lane.key} className="flex h-14 items-center border-b last:border-b-0">
                                <div className="flex w-[110px] shrink-0 items-center gap-1.5 px-2 text-xs">
                                    <div className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[lane.key] }} />
                                    <span className="font-medium">{lane.label}</span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">{laneTasks.length}</span>
                                </div>
                                <div className="relative h-full flex-1">
                                    {laneTasks.map((_t, idx) => {
                                        const start = _t.startDate ? new Date(_t.startDate).getTime() : new Date(_t.dueDate!).getTime();
                                        const end = new Date(_t.dueDate!).getTime();
                                        const leftPct = ((start - minT) / range) * 100;
                                        const widthPct = Math.max(0.5, ((end - start) / range) * 100) || 0.8;
                                        const overdue = end < today && _t.status !== 'done';
                                        const height = PRIO_HEIGHT[_t.priority];
                                        // einfache vertikale Streuung um Ueberlappung sichtbarer zu machen
                                        const topOffset = (idx % 2) * 4;
                                        return (
                                            <button key={_t.id} type="button" onClick={() => onSelect(_t.id)}
                                                className={cn(
                                                    'absolute flex items-center gap-1 overflow-hidden rounded px-1.5 text-[10px] font-medium hover:opacity-90',
                                                    selectedId === _t.id && 'ring-2 ring-primary z-10',
                                                )}
                                                style={{
                                                    left: `${leftPct}%`,
                                                    width: `${widthPct}%`,
                                                    minWidth: 18,
                                                    height,
                                                    top: `calc(50% - ${height / 2}px + ${topOffset}px)`,
                                                    backgroundColor: STATUS_COLOR[_t.status] + '33',
                                                    borderLeft: `3px solid ${STATUS_COLOR[_t.status]}`,
                                                    color: STATUS_COLOR[_t.status],
                                                    opacity: _t.status === 'done' ? 0.5 : 1,
                                                }}
                                                title={`${_t.title} · ${PRIO_LABEL[_t.priority]} · ${new Date(end).toLocaleDateString('de-DE')}${overdue ? ' (ueberfaellig)' : ''}`}>
                                                <span className="truncate">{_t.title}</span>
                                                {overdue && <span className="ml-auto shrink-0 text-destructive">!</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Legende */}
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                    <span>{t('my-tasks.my_tasks_hub.bar-hoehe_prioritaet')}</span>
                    {(['critical', 'high', 'medium', 'low'] as WorkItemPriority[]).map(p => (
                        <span key={p} className="flex items-center gap-1">
                            <span className="rounded" style={{ width: 18, height: PRIO_HEIGHT[p], backgroundColor: '#94a3b833', borderLeft: '3px solid #64748b' }} />
                            {PRIO_LABEL[p]}
                        </span>
                    ))}
                </div>
            </div>
        </ScrollArea>
    );
}

// ─── List row ────────────────────────────────────────────────────────────────

function TaskRow({ item, selected, onClick }: { item: MyTaskItem; selected: boolean; onClick: () => void }) {
    const t = useT();
    const cfg = STATUS_CONFIG[item.status];
    const days = daysUntilDue(item.dueDate);
    const dueLabel = days === null ? null
        : days < 0 ? `${Math.abs(days)}d ${t('app.misc.ueberfaellig')}`
            : days === 0 ? t('app.misc.heute')
                : days === 1 ? t('app.misc.morgen')
                    : new Date(item.dueDate!).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

    return (
        <li>
            <button type="button" onClick={onClick}
                className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
                    selected ? 'bg-primary/10' : 'hover:bg-muted/40',
                )}>
                <MaterialIcon name={cfg.icon} size={16} className={cn('mt-0.5 shrink-0', cfg.color)} />
                <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-[13px] font-medium', item.status === 'done' && 'line-through text-muted-foreground')}>
                        {item.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="rounded px-1 py-0.5 text-[9px]" style={{ backgroundColor: (item.spaceColor ?? '#94a3b8') + '22', color: item.spaceColor ?? '#94a3b8' }}>
                            {item.spaceName}
                        </span>
                        {dueLabel && (
                            <span className={cn('text-[10px]', days !== null && days < 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                                <MaterialIcon name="calendar_today" size={11} className="inline mr-0.5 align-middle" />{dueLabel}
                            </span>
                        )}
                    </div>
                </div>
            </button>
        </li>
    );
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

function KanbanView({ items, selectedId, onSelect, onMove, onRequestDone }: {
    items: MyTaskItem[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onMove: (id: string, status: WorkItemStatus) => void;
    /** Phase F: Drop in 'Erledigt' — Aufrufer oeffnet Detail-Panel mit Done-Form. */
    onRequestDone: (id: string) => void;
}) {
    const t = useT();
    return (
        <div className="flex h-full gap-3 overflow-x-auto p-3">
            {KANBAN_COLS.map(col => {
                const colItems = items.filter(_t => _t.status === col.key);
                return (
                    <div key={col.key} className="flex w-64 shrink-0 flex-col">
                        <div className="mb-2 flex items-center gap-2">
                            <div className={cn('size-2 rounded-full', col.color)} />
                            <span className="text-xs font-semibold">{t(col.labelKey)}</span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{colItems.length}</span>
                        </div>
                        <div className="flex-1 rounded-lg transition-colors"
                            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/5'); }}
                            onDragLeave={e => e.currentTarget.classList.remove('bg-primary/5')}
                            onDrop={e => {
                                e.preventDefault();
                                e.currentTarget.classList.remove('bg-primary/5');
                                const id = e.dataTransfer.getData('text/plain');
                                if (!id) return;
                                // Phase F: Drop in 'done' triggert das Inline-
                                // Done-Form (Detail-Tab + Resultat-Form auf).
                                // Direktes Setzen ginge in 400 (completionType
                                // fehlt) — Server erzwingt Resultat-Doku.
                                if (col.key === 'done') { onRequestDone(id); return; }
                                onMove(id, col.key);
                            }}>
                            <ScrollArea className="h-full">
                                <div className="space-y-1.5 p-1.5 pr-2">
                                    {colItems.map(_t => (
                                        <div key={_t.id}
                                            draggable
                                            onDragStart={e => e.dataTransfer.setData('text/plain', _t.id)}
                                            onClick={() => onSelect(_t.id)}
                                            className={cn(
                                                'block w-full cursor-grab rounded-lg border bg-card p-2.5 text-left transition-shadow hover:shadow-sm active:cursor-grabbing',
                                                selectedId === _t.id && 'ring-2 ring-primary',
                                            )}>
                                            <p className="text-xs font-medium">{_t.title}</p>
                                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                <span className="rounded px-1 py-0.5 text-[9px]" style={{ backgroundColor: (_t.spaceColor ?? '#94a3b8') + '22', color: _t.spaceColor ?? '#94a3b8' }}>
                                                    {_t.spaceName}
                                                </span>
                                                {_t.dueDate && (() => {
                                                    const days = daysUntilDue(_t.dueDate);
                                                    return days !== null && days < 0 ? (
                                                        <span className="text-[9px] font-medium text-destructive">{Math.abs(days)}{t('my-tasks.my_tasks_hub.d_ueberfaellig')}</span>
                                                    ) : days === 0 ? (
                                                        <span className="text-[9px] font-medium text-amber-600">{t('my-tasks.my_tasks_hub.heute')}</span>
                                                    ) : (
                                                        <span className="text-[9px] text-muted-foreground">{new Date(_t.dueDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    ))}
                                    {colItems.length === 0 && (
                                        <div className="rounded-lg border border-dashed p-4 text-center text-[10px] text-muted-foreground/40">{t('my-tasks.my_tasks_hub.hierhin_ziehen')}</div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Gantt ───────────────────────────────────────────────────────────────────

function GanttView({ items, selectedId, onSelect }: { items: MyTaskItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
    const t = useT();
    const tasks = useMemo(() => items.filter(_t => _t.dueDate || _t.startDate).sort((a, b) => {
        const da = a.startDate ?? a.dueDate ?? '';
        const db = b.startDate ?? b.dueDate ?? '';
        return da.localeCompare(db);
    }), [items]);

    if (tasks.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <MaterialIcon name="view_timeline" size={40} className="text-muted-foreground/20 mb-3" />
                <p className="text-sm">{t('my-tasks.my_tasks_hub.aufgaben_brauchen_ein_faelligkeitsdatum_')}</p>
                <p className="text-[11px] text-muted-foreground/60">{t('my-tasks.my_tasks_hub.aufgaben_brauchen_ein_faelligkeitsdatum_')}</p>
            </div>
        );
    }

    const allDates = tasks.flatMap(_t => [_t.startDate, _t.dueDate].filter(Boolean) as string[]).map(d => new Date(d).getTime());
    const minDate = new Date(Math.min(...allDates) - 86400000 * 2);
    const maxDate = new Date(Math.max(...allDates) + 86400000 * 5);
    const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000);
    const dayWidth = 24;
    const today = new Date();
    const todayOffset = Math.floor((today.getTime() - minDate.getTime()) / 86400000) * dayWidth;

    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) days.push(new Date(minDate.getTime() + i * 86400000));

    return (
        <div className="h-full overflow-auto p-2">
            <div className="relative" style={{ width: totalDays * dayWidth + 200, minHeight: tasks.length * 32 + 40 }}>
                <div className="sticky top-0 z-10 flex border-b bg-background" style={{ paddingLeft: 200 }}>
                    {days.map((d, i) => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        const isToday = d.toDateString() === today.toDateString();
                        return (
                            <div key={i} className={cn('shrink-0 border-r py-1 text-center', isWeekend && 'bg-muted/30', isToday && 'bg-primary/10')}
                                style={{ width: dayWidth }}>
                                <span className="text-[8px] text-muted-foreground">{d.getDate()}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="absolute bottom-0 top-0 z-20 w-px bg-destructive/50" style={{ left: 200 + todayOffset + dayWidth / 2 }} />
                {tasks.map((task) => {
                    const start = task.startDate ? new Date(task.startDate) : task.dueDate ? new Date(task.dueDate) : null;
                    const end = task.dueDate ? new Date(task.dueDate) : start;
                    if (!start || !end) return null;
                    const startOffset = Math.floor((start.getTime() - minDate.getTime()) / 86400000) * dayWidth;
                    const duration = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
                    const barColor = task.status === 'done' ? '#10b981' : task.status === 'in_progress' ? '#f59e0b' : task.status === 'review' ? '#3b82f6' : '#94a3b8';
                    const isOverdue = task.dueDate && new Date(task.dueDate) < today && task.status !== 'done';
                    return (
                        <div key={task.id} className={cn('relative flex h-8 items-center', selectedId === task.id && 'bg-primary/5')}>
                            <button type="button" onClick={() => onSelect(task.id)}
                                className="w-[200px] shrink-0 truncate px-2 text-left text-[10px] font-medium hover:text-primary">
                                {task.title}
                            </button>
                            <button type="button" onClick={() => onSelect(task.id)}
                                className="absolute flex h-5 cursor-pointer items-center rounded-md px-1.5 hover:opacity-80"
                                style={{ left: 200 + startOffset, width: duration * dayWidth, backgroundColor: barColor + '30', borderLeft: `3px solid ${barColor}`, top: 6 }}>
                                <span className="truncate text-[8px]" style={{ color: barColor }}>{task.spaceName}</span>
                                {isOverdue && <span className="ml-auto text-[7px] font-bold text-destructive">!</span>}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

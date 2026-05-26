/**
 * Stundenplan-Hub (P1a — read-only Pilot-App).
 *
 * Zeigt eine Wochenansicht des aktiven Szenarios mit 3 Filter-Modi:
 * Klasse / Lehrkraft / Raum. Keine Schreibpfade, kein Drag&Drop.
 *
 * Module-Gate: enabledModules.has('stundenplan'). Andere Tenants sehen
 * die Welt nicht (app-sidebar.tsx WORLDS requiresModule='stundenplan').
 */

import { type JSX, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useEnabledModules } from '@/core/permissions';
import { sessionStore } from '@/core/session/session-store';
import { useT } from '@/lib/i18n/use-t';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import {
    createStundenplanGateway,
    type InstructionGroup,
    type PeriodSlot,
    type Room,
    type Subject,
    type TimetableEntry,
    type TimetableScenario,
} from '@/gateways/platform/stundenplan-gateway';
import { EntryDetailPanel } from './entry-detail-panel';
import { ScoreBadge, ScorePanel } from './score-badge';
import { ScenarioDiffPanel } from './scenario-diff-panel';
import { CouplingsPanel } from './couplings-panel';
import { PublishPanel } from './publish-panel';
import { StammdatenPanel } from './stammdaten-panel';
import { PrePinningEditor } from './pre-pinning-editor';
import { EntryCreatePanel } from './entry-create-panel';
import { EntryEditPanel } from './entry-edit-panel';
import { BulkImportPanel } from './bulk-import-panel';
import { SolverPanel } from './solver-panel';
import { BereitschaftsPanel } from './bereitschaft-panel';
import { useReadiness } from './use-readiness';
import { ScenarioCreatePanel } from './scenario-create-panel';
import { stundenplanStore } from './stundenplan-store';
import { setupWizardStore } from './setup-wizard-store';
import { SetupWizardPanel } from './setup-wizard-panel';
import { useQueryClient } from '@tanstack/react-query';
import {
    compactTeacherLabel,
    freeSlots,
    shortMatrixId,
    simulateMove,
    type MoveSpec,
} from './stundenplan-helpers';
import type {
    CheckPlanResult,
    PublishEvent,
    ScenarioDiffResult,
    ScoreSnapshot,
} from '@/gateways/platform/stundenplan-gateway';

const gateway = createStundenplanGateway();

type ViewMode = 'class' | 'teacher' | 'room';

export function StundenplanHub(): JSX.Element {
    const t = useT();
    const enabledModules = useEnabledModules();
    const jwt = sessionStore.getSnapshot().platform?.token;
    const qc = useQueryClient();

    const [view, setView] = useState<ViewMode>('class');
    // scenarioId wird via stundenplanStore mit der Sidebar (StundenplanWorld)
    // synchronisiert. setScenarioId schreibt in den Store + local state.
    const ui = useSyncExternalStore(stundenplanStore.subscribe, stundenplanStore.getSnapshot);
    const [scenarioId, setScenarioIdLocal] = useState<string | undefined>(undefined);
    const setScenarioId = (id: string | undefined) => {
        setScenarioIdLocal(id);
        stundenplanStore.setScenarioId(id);
    };
    // Sidebar -> Hub: wenn Sidebar das Szenario wechselt, lokal mitziehen.
    useEffect(() => {
        if (ui.scenarioId !== scenarioId) setScenarioIdLocal(ui.scenarioId);
    }, [ui.scenarioId, scenarioId]);
    const [filterId, setFilterId] = useState<string>('');
    const [scenarios, setScenarios] = useState<TimetableScenario[]>([]);
    const [periodSlots, setPeriodSlots] = useState<PeriodSlot[]>([]);
    const [groups, setGroups] = useState<InstructionGroup[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [teachers, setTeachers] = useState<string[]>([]);
    const [entries, setEntries] = useState<TimetableEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [subjectsPanelOpen, setSubjectsPanelOpen] = useState(false);
    const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
    const [simulation, setSimulation] = useState<{ move: MoveSpec; result: CheckPlanResult } | null>(null);
    const [simulationLoading, setSimulationLoading] = useState(false);
    const [scoreSnapshot, setScoreSnapshot] = useState<ScoreSnapshot | null>(null);
    const [scoreLoading, setScoreLoading] = useState(false);
    const [scorePanelOpen, setScorePanelOpen] = useState(false);
    const [couplingsPanelOpen, setCouplingsPanelOpen] = useState(false);
    const [publishPanelOpen, setPublishPanelOpen] = useState(false);
    const [publishEvents, setPublishEvents] = useState<PublishEvent[]>([]);
    const [stammdatenPanelOpen, setStammdatenPanelOpen] = useState(false);
    const [prePinningOpen, setPrePinningOpen] = useState(false);
    const [bulkImportPanelOpen, setBulkImportPanelOpen] = useState(false);
    const [solverPanelOpen, setSolverPanelOpen] = useState(false);
    const [bereitschaftPanelOpen, setBereitschaftPanelOpen] = useState(false);
    const [scenarioCreatePanelOpen, setScenarioCreatePanelOpen] = useState(false);

    // Sidebar -> Hub: Panel-Toggles via Store.
    useEffect(() => {
        switch (ui.openPanel) {
            case 'stammdaten':
                setStammdatenPanelOpen(true);
                break;
            case 'bands':
                setCouplingsPanelOpen(true);
                break;
            case 'bulk-import':
                setBulkImportPanelOpen(true);
                break;
            case 'publish':
                setPublishPanelOpen(true);
                break;
            case 'pre-pinning':
                setPrePinningOpen(true);
                break;
            case null:
                break;
        }
    }, [ui.openPanel]);

    // Sidebar -> Hub: + Knopf in Sidebar feuert dieses Event.
    useEffect(() => {
        const handler = () => setScenarioCreatePanelOpen(true);
        window.addEventListener('stundenplan:scenario-create', handler);
        return () => window.removeEventListener('stundenplan:scenario-create', handler);
    }, []);
    // Edit-Mode: zeigt am EntryCard ein Minus-Icon zum schnellen Loeschen
    // direkt aus dem WeekGrid heraus. Nur fuer Admins sichtbar/aktivierbar.
    const [editMode, setEditMode] = useState(false);
    const [reloadCounter, setReloadCounter] = useState(0);
    const [createCellPrefill, setCreateCellPrefill] = useState<{ weekday: number; periodSlotId: string } | null>(null);
    const [compareWithId, setCompareWithId] = useState<string>('');
    const [diffResult, setDiffResult] = useState<ScenarioDiffResult | null>(null);
    const [diffLoading, setDiffLoading] = useState(false);
    const [diffPanelOpen, setDiffPanelOpen] = useState(false);

    // MUST-2: Admin sieht den vollen Hub, andere Rollen sehen Default 'mein Plan'.
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const [viewMode, setViewMode] = useState<'full' | 'mine'>(isAdmin ? 'full' : 'mine');

    const hasModule = enabledModules.has('stundenplan' as never);

    // Auto-Mode 0i: Bereitschafts-Verdict fuer den Hub-Toolbar-Badge.
    // Polling braucht's nicht — ReactiveBridge invalidiert bei
    // `solve.changed` und `stundenplan.changed`.
    const readiness = useReadiness(scenarioId);

    // Stamm-Daten laden (auch bei Reload-Counter-Erhoehung)
    useEffect(() => {
        if (!jwt || !hasModule) return;
        let cancelled = false;
        (async () => {
            try {
                const [scen, slots, gs, rs, subs] = await Promise.all([
                    gateway.listScenarios(jwt),
                    gateway.listPeriodSlots(jwt),
                    gateway.listInstructionGroups(jwt),
                    gateway.listRooms(jwt),
                    gateway.listSubjects(jwt),
                ]);
                if (cancelled) return;
                setScenarios(scen.scenarios);
                setPeriodSlots(slots.periodSlots);
                setGroups(gs.instructionGroups);
                setRooms(rs.rooms);
                setSubjects(subs.subjects);
                const published = scen.scenarios.find((s) => s.status === 'published');
                if (published && !scenarioId) setScenarioId(published.id);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt, hasModule, reloadCounter]);

    // P2a Scores fuer aktives Szenario nachladen — sobald sich entries aendern.
    useEffect(() => {
        if (!jwt || !hasModule || !scenarioId) return;
        let cancelled = false;
        setScoreLoading(true);
        (async () => {
            try {
                const r = await gateway.computeScores(jwt, { scenarioId, planningStatus: 'published' });
                if (!cancelled) setScoreSnapshot(r);
            } catch {
                if (!cancelled) setScoreSnapshot(null);
            } finally {
                if (!cancelled) setScoreLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [jwt, hasModule, scenarioId]);

    // Entries laden — je nach Modus 'full' (alle published) oder 'mine' (eigener Plan)
    useEffect(() => {
        if (!jwt || !hasModule) return;
        // 'full'-Modus braucht scenarioId; 'mine'-Modus kommt ohne aus.
        if (viewMode === 'full' && !scenarioId) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const data = viewMode === 'mine'
                    ? await gateway.getMyPlan(jwt)
                    : await gateway.listTimetableEntries(jwt, {
                          scenarioId: scenarioId!,
                          planningStatus: 'published',
                      });
                if (cancelled) return;
                setEntries(data.entries);
                const tset = new Set<string>();
                for (const e of data.entries) {
                    for (const sa of e.staffAssignments ?? []) tset.add(sa.teacherMatrixUserId);
                }
                setTeachers(Array.from(tset).sort());
                setError(null);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [jwt, hasModule, scenarioId, viewMode, reloadCounter]);

    // Filter-Liste je View
    const filterOptions = useMemo(() => {
        if (view === 'class') {
            return groups.map((g) => ({ id: g.id, label: g.label }));
        }
        if (view === 'teacher') {
            return teachers.map((tid) => ({ id: tid, label: shortMatrixId(tid) }));
        }
        return rooms.map((r) => ({ id: r.id, label: r.label }));
    }, [view, groups, teachers, rooms]);

    // Entries gefiltert
    const filtered = useMemo(() => {
        if (!filterId) return entries;
        if (view === 'class') return entries.filter((e) => e.instructionGroupId === filterId);
        if (view === 'teacher') {
            return entries.filter((e) => (e.staffAssignments ?? []).some((sa) => sa.teacherMatrixUserId === filterId));
        }
        return entries.filter((e) => e.roomId === filterId);
    }, [entries, view, filterId]);

    // Detail-Drilldown: aktuelle Auswahl + zugehoeriger PeriodSlot
    const selectedEntry = useMemo(
        () => (selectedEntryId ? entries.find((e) => e.id === selectedEntryId) ?? null : null),
        [entries, selectedEntryId],
    );
    const selectedPeriodSlot = useMemo(
        () =>
            selectedEntry
                ? periodSlots.find((p) => p.id === selectedEntry.periodSlotId) ?? null
                : null,
        [periodSlots, selectedEntry],
    );

    // P1d: simulierte Entries fuer Anzeige (nur weekday + periodSlot umgezogen)
    const displayEntries = useMemo(
        () => (simulation ? simulateMove(entries, simulation.move) : entries),
        [entries, simulation],
    );

    // Freie Slots fuer Drag-Highlighting
    const freeSlotsSet = useMemo(
        () =>
            draggingEntryId
                ? freeSlots(displayEntries, {
                      weekdays: [1, 2, 3, 4, 5],
                      periodSlotIds: periodSlots.map((p) => p.id),
                  })
                : new Set<string>(),
        [draggingEntryId, displayEntries, periodSlots],
    );

    // Simulation triggern, sobald Drop erfolgt
    const triggerSimulation = useCallback(
        async (move: MoveSpec) => {
            if (!jwt) return;
            setSimulationLoading(true);
            try {
                const simulated = simulateMove(entries, move);
                const overrideEntries = simulated.map((e) => ({
                    id: e.id,
                    weekday: e.weekday,
                    periodSlotId: e.periodSlotId,
                    weekParity: e.weekParity,
                    roomId: e.roomId,
                    instructionGroupId: e.instructionGroupId,
                    staffAssignments: (e.staffAssignments ?? []).map((sa) => ({
                        teacherMatrixUserId: sa.teacherMatrixUserId,
                        required: sa.required,
                    })),
                }));
                const result = await gateway.checkPlan(jwt, { overrideEntries });
                setSimulation({ move, result });
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setSimulation(null);
            } finally {
                setSimulationLoading(false);
            }
        },
        [jwt, entries],
    );

    if (!hasModule) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <p className="text-sm text-muted-foreground">Stundenplan-Modul nicht aktiv.</p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="schedule" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.world_label')}</span>

                {/* Szenario-Name als Headline (Variante A: Auswahl + Anlage + Loeschen
                    leben jetzt in der Sidebar, siehe stundenplan-world.tsx). */}
                {scenarios.length > 0 && (
                    <span className="ml-3 truncate text-xs font-medium text-foreground/80" title={scenarios.find(s => s.id === scenarioId)?.name ?? ''}>
                        {scenarios.find((s) => s.id === scenarioId)?.name ?? '—'}
                        {(() => {
                            const s = scenarios.find((x) => x.id === scenarioId);
                            return s?.status === 'published'
                                ? <span className="ml-2 rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">live</span>
                                : null;
                        })()}
                    </span>
                )}

                {/* View-Tabs */}
                <div className="ml-auto flex gap-0.5">
                    {(['class', 'teacher', 'room'] as const).map((v) => (
                        <button
                            key={v}
                            onClick={() => {
                                setView(v);
                                setFilterId('');
                            }}
                            className={cn(
                                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                view === v
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                        >
                            {t(`stundenplan.view_${v}`)}
                        </button>
                    ))}
                </div>

                {/* P3a Vergleichen-mit-Dropdown */}
                <select
                    value={compareWithId}
                    onChange={async (e) => {
                        const otherId = e.target.value;
                        setCompareWithId(otherId);
                        if (!otherId || !scenarioId || !jwt) {
                            setDiffResult(null);
                            setDiffPanelOpen(false);
                            return;
                        }
                        setDiffLoading(true);
                        setDiffPanelOpen(true);
                        try {
                            const r = await gateway.diffScenarios(jwt, {
                                scenarioIdA: scenarioId,
                                scenarioIdB: otherId,
                            });
                            setDiffResult(r);
                        } catch (err) {
                            setError(err instanceof Error ? err.message : String(err));
                            setDiffResult(null);
                        } finally {
                            setDiffLoading(false);
                        }
                    }}
                    className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-xs"
                    title={t('stundenplan.diff_compare_with')}
                >
                    <option value="">{t('stundenplan.diff_compare_placeholder')}</option>
                    {scenarios
                        .filter((s) => s.id !== scenarioId)
                        .map((s) => (
                            <option key={s.id} value={s.id}>
                                {t('stundenplan.diff_compare_option_prefix')} {s.name}
                            </option>
                        ))}
                </select>

                {/* P2a Score-Badge */}
                <ScoreBadge
                    snapshot={scoreSnapshot}
                    loading={scoreLoading}
                    onOpen={() => setScorePanelOpen(true)}
                />

                {/* MUST-2 Sichten-Toggle */}
                <div className="ml-2 flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
                    <button
                        onClick={() => setViewMode('mine')}
                        className={cn(
                            'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                            viewMode === 'mine' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                        )}
                        title={t('stundenplan.view_mine_title')}
                    >
                        {t('stundenplan.view_mine')}
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setViewMode('full')}
                            className={cn(
                                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                viewMode === 'full' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                            )}
                            title={t('stundenplan.view_full_title')}
                        >
                            {t('stundenplan.view_full')}
                        </button>
                    )}
                </div>

                {/* Admin-Funktionen nur in 'full'-Sicht — Stammdaten/Baender/
                    Bulk-Import/Veroeffentlichen sind nach Variante A in die
                    Sidebar gewandert (StundenplanWorld). Hier bleiben nur die
                    Aktionen auf der aktuellen Sicht: Bereitschaft, Auto-Plan,
                    Bearbeiten. */}
                {isAdmin && viewMode === 'full' && (
                    <>
                        <button
                            onClick={() => setBereitschaftPanelOpen(true)}
                            className={cn(
                                'relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                readiness.report?.verdict === 'blocked'
                                    ? 'bg-red-100 text-red-900 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-200'
                                    : readiness.report?.verdict === 'warning'
                                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-200'
                                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                            title={t('stundenplan.readiness_button_title')}
                        >
                            <MaterialIcon name="fact_check" size={14} className="-mt-0.5 mr-1 inline" />
                            {t('stundenplan.readiness_button')}
                            {readiness.report &&
                                (readiness.report.summary.blockerCount > 0 ||
                                    readiness.report.summary.warningCount > 0) && (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 font-mono text-[10px]">
                                        {readiness.report.summary.blockerCount > 0 && (
                                            <span className="rounded bg-red-200 px-1 text-red-900 dark:bg-red-900/60 dark:text-red-100">
                                                {readiness.report.summary.blockerCount}
                                            </span>
                                        )}
                                        {readiness.report.summary.warningCount > 0 && (
                                            <span className="rounded bg-amber-200 px-1 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                                                {readiness.report.summary.warningCount}
                                            </span>
                                        )}
                                    </span>
                                )}
                        </button>

                        <button
                            onClick={() => setSolverPanelOpen(true)}
                            className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                            title={t('stundenplan.solver_button_title')}
                        >
                            <MaterialIcon name="auto_awesome" size={14} className="-mt-0.5 mr-1 inline" />
                            {t('stundenplan.solver_button')}
                        </button>

                        <button
                            onClick={() => setEditMode((m) => !m)}
                            className={cn(
                                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                editMode
                                    ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-200'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                            title={editMode
                                ? t('stundenplan.edit_mode_off_title', { defaultValue: 'Bearbeiten beenden' })
                                : t('stundenplan.edit_mode_on_title', { defaultValue: 'Bearbeiten aktivieren — Stunden direkt im Raster loeschen' })}
                        >
                            <MaterialIcon
                                name={editMode ? 'edit_off' : 'edit'}
                                size={14}
                                className="-mt-0.5 mr-1 inline"
                            />
                            {editMode
                                ? t('stundenplan.edit_mode_active', { defaultValue: 'Bearbeiten aktiv' })
                                : t('stundenplan.edit_mode', { defaultValue: 'Bearbeiten' })}
                        </button>
                    </>
                )}

                {/* MUST-5 Drucken */}
                <button
                    onClick={() => window.print()}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground print:hidden"
                    title={t('stundenplan.weekgrid_print_button')}
                >
                    <MaterialIcon name="print" size={14} className="-mt-0.5 mr-1 inline" />
                    {t('stundenplan.weekgrid_print_button')}
                </button>
            </div>

            <SubjectsPanel
                open={subjectsPanelOpen}
                subjects={subjects}
                onClose={() => setSubjectsPanelOpen(false)}
            />

            {/* Filter */}
            <div className="border-b px-3 py-2">
                <select
                    value={filterId}
                    onChange={(e) => setFilterId(e.target.value)}
                    className="w-full max-w-md rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                    <option value="">
                        {view === 'class'
                            ? t('stundenplan.all_classes')
                            : view === 'teacher'
                              ? t('stundenplan.all_teachers')
                              : t('stundenplan.all_rooms')}
                    </option>
                    {filterOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-auto">
                {error && (
                    <div className="m-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                        {error}
                    </div>
                )}
                {loading && !entries.length && (
                    <div className="flex h-full items-center justify-center">
                        <p className="text-xs text-muted-foreground">Lädt …</p>
                    </div>
                )}
                {!loading && !error && entries.length === 0 && scenarios.length === 0 && isAdmin && (
                    <WelcomeEmptyState
                        unfinishedWizard={setupWizardStore.hasUnfinished()}
                    />
                )}
                {!loading && !error && entries.length === 0 && scenarios.length > 0 && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                        <MaterialIcon name="schedule" size={40} className="text-muted-foreground/30" />
                        <h3 className="text-sm font-medium">{t('stundenplan.no_data_title')}</h3>
                        <p className="max-w-md text-xs text-muted-foreground">{t('stundenplan.no_data_hint')}</p>
                    </div>
                )}
                {periodSlots.length > 0 && (
                    <WeekGrid
                        entries={
                            // gefiltert UND mit simulierter Verschiebung angewendet
                            simulation
                                ? simulateMove(filtered, simulation.move)
                                : filtered
                        }
                        periodSlots={periodSlots}
                        view={view}
                        onSelect={setSelectedEntryId}
                        selectedEntryId={selectedEntryId}
                        draggingEntryId={draggingEntryId}
                        freeSlotsSet={freeSlotsSet}
                        onDragStart={setDraggingEntryId}
                        onDragEnd={() => setDraggingEntryId(null)}
                        onDrop={(move) => {
                            setDraggingEntryId(null);
                            void triggerSimulation(move);
                        }}
                        onCreateEntry={
                            isAdmin && viewMode === 'full'
                                ? (weekday, periodSlotId) => setCreateCellPrefill({ weekday, periodSlotId })
                                : () => undefined
                        }
                        editMode={editMode && isAdmin}
                        onDeleteEntry={async (entryId) => {
                            const entry = entries.find((e) => e.id === entryId);
                            if (!entry) return;
                            const label =
                                entry.subject?.label ?? entry.subjectKey ?? entry.subjectId;
                            if (
                                !confirm(
                                    t('stundenplan.weekgrid_delete_confirm', {
                                        defaultValue: `Stunde "${label}" wirklich loeschen?`,
                                    }),
                                )
                            )
                                return;
                            try {
                                await gateway.deleteTimetableEntry(jwt ?? '', entryId);
                                setReloadCounter((c) => c + 1);
                            } catch (e) {
                                alert(e instanceof Error ? e.message : String(e));
                            }
                        }}
                    />
                )}
            </div>

            {/* P1d Simulation-Banner */}
            {(simulationLoading || simulation) && (
                <SimulationBanner
                    loading={simulationLoading}
                    simulation={simulation}
                    onDiscard={() => setSimulation(null)}
                />
            )}

            <EntryDetailPanel
                entry={selectedEntry}
                periodSlot={selectedPeriodSlot}
                onClose={() => setSelectedEntryId(null)}
                onEdit={isAdmin && viewMode === 'full' ? (e) => {
                    setEditingEntryId(e.id);
                    setSelectedEntryId(null);
                } : undefined}
            />

            <EntryEditPanel
                open={editingEntryId !== null}
                jwt={jwt ?? ''}
                entry={entries.find((e) => e.id === editingEntryId) ?? null}
                subjects={subjects}
                instructionGroups={groups}
                rooms={rooms}
                periodSlots={periodSlots}
                onClose={() => setEditingEntryId(null)}
                onSaved={() => setReloadCounter((c) => c + 1)}
                onDeleted={() => setReloadCounter((c) => c + 1)}
            />

            <ScorePanel
                open={scorePanelOpen}
                snapshot={scoreSnapshot}
                onClose={() => setScorePanelOpen(false)}
            />

            <ScenarioDiffPanel
                open={diffPanelOpen}
                loading={diffLoading}
                result={diffResult}
                scenarioA={scenarios.find((s) => s.id === scenarioId) ?? null}
                scenarioB={scenarios.find((s) => s.id === compareWithId) ?? null}
                onClose={() => setDiffPanelOpen(false)}
            />

            <CouplingsPanel
                open={couplingsPanelOpen}
                jwt={jwt ?? ''}
                onClose={() => { setCouplingsPanelOpen(false); stundenplanStore.closePanel(); }}
            />

            <StammdatenPanel
                open={stammdatenPanelOpen}
                jwt={jwt ?? ''}
                onClose={() => { setStammdatenPanelOpen(false); stundenplanStore.closePanel(); }}
                onChange={() => setReloadCounter((c) => c + 1)}
            />

            {prePinningOpen && (
                <PrePinningEditor
                    onClose={() => { setPrePinningOpen(false); stundenplanStore.closePanel(); }}
                />
            )}

            <BulkImportPanel
                open={bulkImportPanelOpen}
                jwt={jwt ?? ''}
                scenarios={scenarios}
                currentScenarioId={scenarioId}
                onClose={() => { setBulkImportPanelOpen(false); stundenplanStore.closePanel(); }}
                onImported={() => setReloadCounter((c) => c + 1)}
            />

            <SolverPanel
                open={solverPanelOpen}
                onClose={() => setSolverPanelOpen(false)}
                scenarioId={scenarioId}
            />

            <BereitschaftsPanel
                open={bereitschaftPanelOpen}
                onClose={() => setBereitschaftPanelOpen(false)}
                scenarioId={scenarioId}
            />

            <ScenarioCreatePanel
                open={scenarioCreatePanelOpen}
                onClose={() => setScenarioCreatePanelOpen(false)}
                onCreated={(newId) => {
                    setScenarioId(newId);
                    setReloadCounter((c) => c + 1);
                    // Sidebar-Cache invalidieren, damit die neue Karte
                    // sofort in der StundenplanWorld auftaucht.
                    qc.invalidateQueries({ queryKey: ['stundenplan-scenarios'] });
                }}
                jwt={jwt ?? ''}
                scenarios={scenarios}
            />

            <EntryCreatePanel
                open={createCellPrefill !== null}
                jwt={jwt ?? ''}
                prefill={createCellPrefill}
                scenarioId={scenarioId}
                subjects={subjects}
                instructionGroups={groups}
                rooms={rooms}
                periodSlots={periodSlots}
                onClose={() => setCreateCellPrefill(null)}
                onCreated={() => setReloadCounter((c) => c + 1)}
            />

            <PublishPanel
                open={publishPanelOpen}
                scenario={scenarios.find((s) => s.id === scenarioId) ?? null}
                snapshot={scoreSnapshot}
                events={publishEvents}
                canPublish={!!scenarioId && !!jwt}
                onPublish={async (reason) => {
                    if (!jwt || !scenarioId) return;
                    try {
                        await gateway.publishScenario(jwt, scenarioId, { reason });
                        // Reload scenarios + events
                        const [sc, ev] = await Promise.all([
                            gateway.listScenarios(jwt),
                            gateway.listPublishEvents(jwt),
                        ]);
                        setScenarios(sc.scenarios);
                        setPublishEvents(ev.events);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                    }
                }}
                onRollback={async (reason) => {
                    if (!jwt) return;
                    try {
                        await gateway.rollbackPublish(jwt, { reason });
                        const [sc, ev] = await Promise.all([
                            gateway.listScenarios(jwt),
                            gateway.listPublishEvents(jwt),
                        ]);
                        setScenarios(sc.scenarios);
                        setPublishEvents(ev.events);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                    }
                }}
                onClose={() => { setPublishPanelOpen(false); stundenplanStore.closePanel(); }}
            />

            <SetupWizardPanel />
        </div>
    );
}

/**
 * WelcomeEmptyState — wenn der Tenant noch KEIN Szenario hat. Statt einer
 * leeren Wochenansicht zeigen wir eine CTA-Card, die direkt den geführten
 * Setup-Wizard startet. „Branchen-Primus"-UX: kein Rätselraten.
 */
function WelcomeEmptyState({ unfinishedWizard }: { unfinishedWizard: boolean }): JSX.Element {
    const t = useT();
    return (
        <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MaterialIcon name="calendar_month" size={40} />
            </div>
            <div className="max-w-md space-y-2">
                <h2 className="text-xl font-semibold">
                    {t('stundenplan.welcome_title', { defaultValue: 'Willkommen beim Stundenplaner!' })}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('stundenplan.welcome_intro', {
                        defaultValue:
                            'Du hast noch kein Schuljahr angelegt. Wir helfen Dir Schritt fuer Schritt — in 5 Minuten hast Du Deinen ersten Stundenplan-Entwurf.',
                    })}
                </p>
            </div>
            {unfinishedWizard && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <MaterialIcon name="schedule" size={13} className="-mt-0.5 mr-1 inline" />
                    {t('stundenplan.welcome_unfinished', {
                        defaultValue: 'Du hast einen begonnenen Wizard — willst Du dort weitermachen?',
                    })}
                </div>
            )}
            <div className="space-y-2">
                <button
                    onClick={() => setupWizardStore.open()}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                    <MaterialIcon name="auto_awesome" size={18} />
                    {unfinishedWizard
                        ? t('stundenplan.welcome_resume', { defaultValue: 'Wizard fortsetzen' })
                        : t('stundenplan.welcome_cta', {
                              defaultValue: 'Mein erstes Schuljahr in 5 Minuten anlegen',
                          })}
                </button>
                <div>
                    <button
                        onClick={() => {
                            // Custom-Event wie der + Knopf in der Sidebar
                            window.dispatchEvent(new CustomEvent('stundenplan:scenario-create'));
                        }}
                        className="text-xs text-muted-foreground hover:underline"
                    >
                        {t('stundenplan.welcome_empty_scenario', {
                            defaultValue: 'oder: Mit leerem Szenario starten',
                        })}
                    </button>
                </div>
            </div>
        </div>
    );
}

function WeekGrid({
    entries,
    periodSlots,
    view,
    onSelect,
    selectedEntryId,
    draggingEntryId,
    freeSlotsSet,
    onDragStart,
    onDragEnd,
    onDrop,
    onCreateEntry,
    editMode = false,
    onDeleteEntry,
}: {
    entries: TimetableEntry[];
    periodSlots: PeriodSlot[];
    view: ViewMode;
    onSelect: (id: string) => void;
    selectedEntryId: string | null;
    draggingEntryId: string | null;
    freeSlotsSet: Set<string>;
    onDragStart: (id: string) => void;
    onDragEnd: () => void;
    onDrop: (move: MoveSpec) => void;
    onCreateEntry: (weekday: number, periodSlotId: string) => void;
    editMode?: boolean;
    onDeleteEntry?: (entryId: string) => void;
}) {
    const t = useT();
    const weekdays = [1, 2, 3, 4, 5] as const; // Mo–Fr, Sa/So optional
    const dayLabels = {
        1: t('stundenplan.monday'),
        2: t('stundenplan.tuesday'),
        3: t('stundenplan.wednesday'),
        4: t('stundenplan.thursday'),
        5: t('stundenplan.friday'),
    } as const;

    // Lookup-Map (slot,weekday) → entries[]
    const byCell = useMemo(() => {
        const map = new Map<string, TimetableEntry[]>();
        for (const e of entries) {
            const k = `${e.periodSlotId}|${e.weekday}`;
            const arr = map.get(k) ?? [];
            arr.push(e);
            map.set(k, arr);
        }
        return map;
    }, [entries]);

    // MUST-3: ordinale Slot-Reihenfolge fuer spansSlots-Rendering (skipt
    // Pausen, weil isBreak-Reihen ihren eigenen <tr> bekommen).
    const teachingSlots = useMemo(() => periodSlots.filter((s) => !s.isBreak), [periodSlots]);
    const slotIdToIdx = useMemo(() => {
        const m = new Map<string, number>();
        teachingSlots.forEach((s, i) => m.set(s.id, i));
        return m;
    }, [teachingSlots]);

    // Cells die bereits durch eine vorangehende Doppelstunde belegt sind und
    // daher nicht erneut gerendert werden (kein <td>, der rowspan-td haengt
    // vom Anker-slot ab).
    const occupiedByPreceding = useMemo(() => {
        const occ = new Set<string>();
        for (const e of entries) {
            const span = e.spansSlots ?? 1;
            if (span <= 1) continue;
            const idx = slotIdToIdx.get(e.periodSlotId);
            if (idx === undefined) continue;
            for (let k = 1; k < span; k++) {
                const followUp = teachingSlots[idx + k];
                if (followUp) occ.add(`${followUp.id}|${e.weekday}`);
            }
        }
        return occ;
    }, [entries, teachingSlots, slotIdToIdx]);

    return (
        <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                    <th className="w-20 border-r px-2 py-1 text-left font-normal text-muted-foreground">
                        {t('stundenplan.scenario_label')}
                    </th>
                    {weekdays.map((w) => (
                        <th key={w} className="border-r px-2 py-1 text-left font-semibold">
                            {dayLabels[w]}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {periodSlots.map((slot) => slot.isBreak ? (
                    <tr key={slot.id} className="border-b bg-amber-50/30 dark:bg-amber-950/10 print:bg-gray-100">
                        <td className="w-20 border-r px-2 py-0.5 text-[10px] text-amber-900 dark:text-amber-200">
                            <div className="font-medium">{t('stundenplan.weekgrid_break_label')}</div>
                            <div className="text-[9px] opacity-70">{slot.startsAt}–{slot.endsAt}</div>
                        </td>
                        <td colSpan={weekdays.length} className="px-2 py-0.5 text-center text-[10px] italic text-amber-900/70 dark:text-amber-200/70">
                            {slot.label}
                        </td>
                    </tr>
                ) : (
                    <tr key={slot.id} className="border-b align-top">
                        <td className="w-20 border-r px-2 py-1 text-muted-foreground">
                            <div className="font-medium text-foreground">{slot.ordinal}.</div>
                            <div className="text-[10px]">
                                {slot.startsAt}–{slot.endsAt}
                            </div>
                        </td>
                        {weekdays.map((w) => {
                            const cellEntries = byCell.get(`${slot.id}|${w}`) ?? [];
                            const cellKey = `${w}|${slot.id}`;
                            const isFreeHighlight = draggingEntryId && freeSlotsSet.has(cellKey);
                            // MUST-3: Cell ist durch Doppelstunde von oben belegt → kein <td>
                            if (occupiedByPreceding.has(`${slot.id}|${w}`)) return null;
                            // Wenn diese Cell Anker einer Doppelstunde ist: rowspan
                            const anchorEntry = cellEntries.find((e) => (e.spansSlots ?? 1) > 1);
                            const cellRowSpan = anchorEntry ? Math.min(anchorEntry.spansSlots ?? 1, teachingSlots.length - (slotIdToIdx.get(slot.id) ?? 0)) : 1;
                            return (
                                <td
                                    key={w}
                                    rowSpan={cellRowSpan}
                                    className={cn(
                                        'border-r p-1 min-h-[64px] transition-colors',
                                        isFreeHighlight && 'bg-emerald-50/40 outline-1 outline-dashed outline-emerald-300',
                                        cellRowSpan > 1 && 'bg-blue-50/30 dark:bg-blue-950/15',
                                    )}
                                    onDragOver={(e) => {
                                        if (!draggingEntryId) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const id = e.dataTransfer.getData('text/plain') || draggingEntryId;
                                        if (!id) return;
                                        onDrop({ entryId: id, toWeekday: w, toPeriodSlotId: slot.id });
                                    }}
                                >
                                    {cellEntries.length === 0 && (
                                        <button
                                            type="button"
                                            onClick={() => onCreateEntry(w, slot.id)}
                                            className="flex h-full w-full items-center justify-center rounded text-[10px] text-muted-foreground/40 hover:bg-primary/5 hover:text-primary print:hidden"
                                            title="Stunde hier anlegen"
                                        >
                                            +
                                        </button>
                                    )}
                                    {cellEntries.map((e) => (
                                        <EntryCard
                                            key={e.id}
                                            entry={e}
                                            view={view}
                                            onSelect={onSelect}
                                            isSelected={e.id === selectedEntryId}
                                            onDragStart={onDragStart}
                                            onDragEnd={onDragEnd}
                                            isBeingDragged={e.id === draggingEntryId}
                                            editMode={editMode}
                                            onDelete={onDeleteEntry}
                                        />
                                    ))}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function EntryCard({
    entry,
    view,
    onSelect,
    isSelected,
    onDragStart,
    onDragEnd,
    isBeingDragged,
    editMode = false,
    onDelete,
}: {
    entry: TimetableEntry;
    view: ViewMode;
    onSelect: (id: string) => void;
    isSelected: boolean;
    onDragStart: (id: string) => void;
    onDragEnd: () => void;
    isBeingDragged: boolean;
    editMode?: boolean;
    onDelete?: (id: string) => void;
}) {
    const t = useT();
    const compact = compactTeacherLabel(entry);

    return (
        <div
            className={cn(
                'relative mb-1 last:mb-0',
                editMode && 'group',
            )}
        >
            {editMode && onDelete && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(entry.id);
                    }}
                    className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-destructive text-white opacity-90 shadow-sm hover:opacity-100 hover:scale-110 transition-transform print:hidden"
                    title={t('stundenplan.weekgrid_delete_inline', {
                        defaultValue: 'Diese Stunde loeschen',
                    })}
                    aria-label={t('stundenplan.weekgrid_delete_inline', {
                        defaultValue: 'Diese Stunde loeschen',
                    })}
                >
                    <MaterialIcon name="remove" size={13} />
                </button>
            )}
            <button
            type="button"
            onClick={() => onSelect(entry.id)}
            draggable={!editMode}
            onDragStart={(e) => {
                if (editMode) { e.preventDefault(); return; }
                e.dataTransfer.setData('text/plain', entry.id);
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(entry.id);
            }}
            onDragEnd={onDragEnd}
            aria-pressed={isSelected}
            className={cn(
                'block w-full rounded-md border p-1.5 text-left transition-colors',
                isBeingDragged && 'opacity-50',
                isSelected
                    ? 'border-primary/50 bg-primary/15 ring-1 ring-primary/30'
                    : 'border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10',
                editMode && 'ring-1 ring-amber-300/50',
            )}
            title={editMode ? t('stundenplan.entry_card_edit_mode_hint', { defaultValue: 'Klicken: Details · Minus oben rechts: loeschen' }) : t('stundenplan.entry_card_drag_hint')}
        >
            <div className="text-[11px] font-medium leading-tight">
                {entry.subject?.label ?? entry.subjectKey ?? entry.subjectId}
                {entry.instructionGroup?.label && view !== 'class' && (
                    <span className="ml-1 font-normal text-muted-foreground">
                        · {entry.instructionGroup.label}
                    </span>
                )}
            </div>
            {entry.room?.label && view !== 'room' && (
                <div className="text-[10px] text-muted-foreground">{entry.room.label}</div>
            )}
            {compact.kind !== 'none' && view !== 'teacher' && (
                <div className="text-[10px] text-muted-foreground">
                    {compact.kind === 'team' ? (
                        <span title={t('stundenplan.teamteaching')}>
                            {t('stundenplan.team_with_n_teachers', { count: compact.count })}
                        </span>
                    ) : (
                        compact.label
                    )}
                </div>
            )}
            </button>
        </div>
    );
}

/**
 * SubjectsPanel — Slide-Over von rechts, Read-only Faecher-Liste (P1a).
 *
 * P1b wird hier den CRUD-Editor einbauen (Anlage, Bearbeiten, Loeschen).
 * Heute zeigt das Panel nur den aktuellen Bestand + Hinweis "Pflegen folgt".
 *
 * Memory-Regel `no_modal_dialogs`: Slide-Over rechts statt zentrales Modal.
 */
function SubjectsPanel({
    open,
    subjects,
    onClose,
}: {
    open: boolean;
    subjects: Subject[];
    onClose: () => void;
}) {
    const t = useT();

    // ESC zum Schliessen — Hook MUSS vor jedem early-return stehen.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[440px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
        >
            {/* Header */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="menu_book" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.subjects_panel_title')}</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('common.close', { defaultValue: 'Schliessen' })}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Liste */}
                {subjects.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        {t('stundenplan.subjects_empty')}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {subjects.map((s) => (
                            <div
                                key={s.id}
                                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                            >
                                <span className="inline-flex h-6 w-12 items-center justify-center rounded bg-muted px-1.5 text-[11px] font-mono font-medium text-muted-foreground">
                                    {s.key}
                                </span>
                                <span className="flex-1 text-sm">{s.label}</span>
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                    {t('stundenplan.subjects_p1b_hint')}
                </p>
            </div>
        </div>
    );
}

/**
 * SimulationBanner — zeigt das Ergebnis von checkPlan nach einem Drag-Drop.
 * "Diagnose statt Aktion" (S5): keine Persistenz, nur Anzeige.
 */
function SimulationBanner({
    loading,
    simulation,
    onDiscard,
}: {
    loading: boolean;
    simulation: { move: MoveSpec; result: CheckPlanResult } | null;
    onDiscard: () => void;
}): JSX.Element {
    const t = useT();
    const violations = simulation?.result.violations ?? [];
    const hasViolations = violations.length > 0;

    return (
        <div
            className={cn(
                'shrink-0 border-t px-4 py-2 text-xs',
                loading
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : hasViolations
                      ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
            )}
        >
            <div className="flex items-center gap-2">
                <MaterialIcon
                    name={loading ? 'sync' : hasViolations ? 'error' : 'check_circle'}
                    size={16}
                    className={loading ? 'animate-spin' : ''}
                />
                <strong>
                    {loading
                        ? t('stundenplan.simulation_loading')
                        : hasViolations
                          ? t('stundenplan.simulation_violations', { count: violations.length })
                          : t('stundenplan.simulation_ok')}
                </strong>
                <button
                    onClick={onDiscard}
                    className="ml-auto rounded-md border border-current px-2 py-0.5 text-[11px] hover:bg-current/10"
                >
                    {t('stundenplan.simulation_discard')}
                </button>
            </div>
            {hasViolations && (
                <ul className="mt-1 ml-6 list-disc space-y-0.5">
                    {violations.slice(0, 5).map((v, i) => (
                        <li key={`${v.code}-${i}`}>
                            <strong>{t(`stundenplan.constraint_${v.code}` as never, { defaultValue: v.code })}</strong>
                            {v.context && Object.keys(v.context).length > 0 && (
                                <span className="ml-1 opacity-80">
                                    ({Object.entries(v.context)
                                        .filter(([k]) => k !== 'periodSlotId')
                                        .map(([k, val]) => `${k}=${String(val)}`)
                                        .join(', ')})
                                </span>
                            )}
                        </li>
                    ))}
                    {violations.length > 5 && (
                        <li className="opacity-70">
                            {t('stundenplan.simulation_more_violations', { count: violations.length - 5 })}
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}

// (ViolationFinding-Typ wird im SimulationBanner verwendet)

import { type JSX, useCallback, useEffect, useSyncExternalStore, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createCrisisGateway } from './crisis-gateway';
import type { CrisisScenario, CrisisEvent, CrisisTask, ActivatePreview } from './crisis-gateway';
import { cn } from '@/lib/utils';
import { logger } from '@/core/logging/logger';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { useSwipeRightToBack } from '@/core/responsive/use-swipe-right-to-back';
import { MobileAblaeufeList } from './mobile-ablaeufe-list';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const crisisGateway = createCrisisGateway();

const SEV_COLORS: Record<string, string> = {
    CRITICAL: 'border-red-500/40 bg-red-500/5',
    HIGH: 'border-orange-500/40 bg-orange-500/5',
    MEDIUM: 'border-yellow-500/40 bg-yellow-500/5',
};
const SEV_TEXT: Record<string, string> = {
    CRITICAL: 'text-red-500',
    HIGH: 'text-orange-500',
    MEDIUM: 'text-yellow-500',
};
const SEV_LABELS: Record<string, string> = {
    CRITICAL: 'Kritisch',
    HIGH: 'Hoch',
    MEDIUM: 'Mittel',
};

export function AblaeufeHub(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [searchParams] = useSearchParams();
    const currentView = searchParams.get('view');
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const swipeBackHandlers = useSwipeRightToBack(isMobile && !!currentView, () => navigate('/ablaeufe'));

    const [activeEvents, setActiveEvents] = useState<CrisisEvent[]>([]);
    const [scenarios, setScenarios] = useState<CrisisScenario[]>([]);
    const [pastEvents, setPastEvents] = useState<CrisisEvent[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        try {
            const [evts, scens, past] = await Promise.all([
                crisisGateway.getActiveEvents(jwt),
                crisisGateway.getScenarios(jwt, true),
                crisisGateway.getEvents(jwt),
            ]);
            setActiveEvents(evts.items);
            setScenarios(scens.items);
            setPastEvents(past.items.filter(e => e.status !== 'ACTIVE').slice(0, 20));
        } catch (err) {
            logger.error('Ablaeufe: Laden fehlgeschlagen', { error: err });
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useWorkflowEvents((event) => {
        if (event === 'crisis.changed') load();
    });

    useEffect(() => {
        load();
        // Polling-Fallback alle 60s (SSE liefert sonst Echtzeit-Updates).
        const interval = setInterval(load, 60_000);
        return () => clearInterval(interval);
    }, [load]);

    const title = currentView === 'active' ? 'Aktive Krise'
        : currentView === 'history' ? 'Verlauf'
            : 'Abläufe';

    // Mobile-Entry: ohne View-Param zeigen wir die Sidebar-Liste
    if (isMobile && !currentView) {
        return <MobileAblaeufeList />;
    }

    return (
        <div className="flex h-full flex-col" {...swipeBackHandlers}>
            {/* Mobile Breadcrumb-Header */}
            {isMobile && (
                <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-2">
                    <button
                        type="button"
                        onClick={() => navigate('/ablaeufe')}
                        aria-label={t('crisis.ablaeufe_hub.zurueck_zur_ablaeufe-uebersicht')}
                        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors active:bg-muted"
                    >
                        <MaterialIcon name="schema" size={20} />
                    </button>
                    <MaterialIcon name="chevron_right" size={16} className="shrink-0 text-muted-foreground/60" aria-hidden />
                    <span className="truncate text-sm font-semibold">{title}</span>
                </div>
            )}
            <div className={cn('flex h-[var(--toolbar-height)] shrink-0 items-center border-b px-4', isMobile && 'hidden')}>
                <MaterialIcon name="schema" size={16} className="mr-2 text-muted-foreground" />
                <span className="text-lg font-semibold">{title}</span>
                {activeEvents.length > 0 && (
                    <span className="ml-2 flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-500">
                        <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                        {t('crisis.ablaeufe_hub.krise_aktiv')}
                    </span>
                )}
            </div>

            <ScrollArea className="flex-1">
                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : currentView === 'active' && activeEvents.length > 0 ? (
                    <ActiveCrisisPanel event={activeEvents[0]} onRefresh={load} />
                ) : currentView === 'history' ? (
                    <HistoryPanel events={pastEvents} />
                ) : (
                    <ScenariosPanel scenarios={scenarios} activeEvents={activeEvents} onRefresh={load} />
                )}
            </ScrollArea>
        </div>
    );
}

// ─── Szenarien-Panel ────────────────────────────────────────────────────────

function ScenariosPanel({ scenarios, activeEvents, onRefresh }: {
    scenarios: CrisisScenario[];
    activeEvents: CrisisEvent[];
    onRefresh: () => void;
}) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [activating, setActivating] = useState<string | null>(null);
    const [preview, setPreview] = useState<ActivatePreview | null>(null);
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleActivate = async (scenario: CrisisScenario) => {
        if (!jwt) return;
        try {
            const p = await crisisGateway.activatePreview(jwt, scenario.id);
            setPreview(p);
            setActivating(scenario.id);
        } catch { setError('Vorschau fehlgeschlagen'); }
    };

    const handleConfirm = async () => {
        if (!jwt || !activating) return;
        try {
            await crisisGateway.activateConfirm(jwt, activating, note || undefined);
            setActivating(null);
            setPreview(null);
            setNote('');
            onRefresh();
        } catch (err: any) {
            setError(err.message ?? 'Aktivierung fehlgeschlagen');
        }
    };

    if (scenarios.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <MaterialIcon name="shield" size={40} className="text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">{t('crisis.ablaeufe_hub.keine_freigegebenen_szenarien')}</p>
                <p className="text-xs text-muted-foreground/60">{t('crisis.ablaeufe_hub.szenarien_werden_im_portal_unter_ablaeuf')}</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl p-6 space-y-4">
            {error && (
                <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
                    {error}
                    <button onClick={() => setError(null)}><MaterialIcon name="close" size={16} /></button>
                </div>
            )}

            {activeEvents.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border-2 border-red-500/40 bg-red-500/5 px-4 py-3">
                    <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-bold text-red-500">{t('crisis.ablaeufe_hub.aktive_krise')} {activeEvents[0].scenario?.name}</span>
                </div>
            )}

            {scenarios.map(scenario => (
                <div
                    key={scenario.id}
                    className={cn(
                        'rounded-lg border p-4 transition-colors',
                        activating === scenario.id ? SEV_COLORS[scenario.severity] : 'hover:bg-muted/30',
                    )}
                >
                    <div className="flex items-start gap-3">
                        <MaterialIcon name="warning" size={20} className={cn('mt-0.5 shrink-0', SEV_TEXT[scenario.severity])} />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold">{scenario.name}</h3>
                                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', SEV_TEXT[scenario.severity])}>
                                    {SEV_LABELS[scenario.severity]}
                                </span>
                            </div>
                            {scenario.description && (
                                <p className="mt-1 text-xs text-muted-foreground">{scenario.description}</p>
                            )}
                        </div>

                        {activating !== scenario.id && activeEvents.length === 0 && (
                            <button
                                onClick={() => handleActivate(scenario)}
                                className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                <MaterialIcon name="play_arrow" size={14} />
                                {t('crisis.ablaeufe_hub.aktivieren')}
                            </button>
                        )}
                    </div>

                    {/* Aktivierungs-Wizard */}
                    {activating === scenario.id && preview && (
                        <div className="mt-4 space-y-3 border-t pt-3">
                            <p className="text-xs font-semibold text-red-500">{t('crisis.ablaeufe_hub.szenario_wirklich_aktivieren')}</p>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                                <span>{t('crisis.ablaeufe_hub.raum')} {preview.willCreateRoom}</span>
                                <span>{t('crisis.ablaeufe_hub.benachrichtigt')} {preview.willNotify.join(', ')}</span>
                            </div>
                            <textarea
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder={t('crisis.ablaeufe_hub.situationsbeschreibung_optional')}
                                rows={2}
                                className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setActivating(null); setPreview(null); setNote(''); }}
                                    className="flex-1 rounded-md border px-3 py-2 text-xs hover:bg-muted"
                                >
                                    {t('crisis.ablaeufe_hub.abbrechen')}
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className="flex-1 rounded-md bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
                                >
                                    {t('crisis.ablaeufe_hub.krise_aktivieren')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Aktive Krise Panel ─────────────────────────────────────────────────────

function ActiveCrisisPanel({ event, onRefresh }: { event: CrisisEvent; onRefresh: () => void }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [tasks, setTasks] = useState<CrisisTask[]>(event.tasks ?? []);
    const [falseAlarmNote, setFalseAlarmNote] = useState('');

    useEffect(() => {
        if (!jwt) return;
        const poll = () => crisisGateway.getEvent(jwt, event.id)
            .then(e => setTasks(e.tasks ?? []))
            .catch(() => { });
        poll();
        const interval = setInterval(poll, 10_000);
        return () => clearInterval(interval);
    }, [jwt, event.id]);

    const elapsed = Math.floor((Date.now() - new Date(event.activatedAt).getTime()) / 60_000);
    const doneCount = tasks.filter(_t => _t.status === 'DONE').length;

    const handleTaskDone = async (taskId: string) => {
        if (!jwt) return;
        await crisisGateway.updateTaskStatus(jwt, event.id, taskId, 'DONE');
        const e = await crisisGateway.getEvent(jwt, event.id);
        setTasks(e.tasks ?? []);
    };

    const myUserId = session.matrix?.userId ?? null;
    const handleAssign = async (taskId: string, userId: string | null) => {
        if (!jwt) return;
        await crisisGateway.assignTask(jwt, event.id, taskId, userId);
        const e = await crisisGateway.getEvent(jwt, event.id);
        setTasks(e.tasks ?? []);
    };

    const handleDeactivate = async () => {
        if (!jwt) return;
        await crisisGateway.deactivate(jwt, event.id);
        onRefresh();
    };

    const handleFalseAlarm = async () => {
        if (!jwt || !falseAlarmNote.trim()) return;
        await crisisGateway.markFalseAlarm(jwt, event.id, falseAlarmNote);
        setFalseAlarmNote('');
        onRefresh();
    };

    return (
        <div className="mx-auto max-w-2xl p-6 space-y-6">
            {/* Header */}
            <div className="rounded-xl border-2 border-red-500/50 bg-red-500/5 p-5">
                <div className="flex items-center gap-3">
                    <span className="size-3 rounded-full bg-red-500 animate-pulse" />
                    <h2 className="text-lg font-bold text-red-500">{event.scenario?.name ?? 'Krise aktiv'}</h2>
                    <span className="ml-auto text-sm text-muted-foreground">{elapsed} {t('crisis.ablaeufe_hub.min')}</span>
                </div>

                {/* Fortschritt */}
                <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{t('crisis.ablaeufe_hub.fortschritt')}</span>
                        <span>{doneCount} / {tasks.length} erledigt</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                        <div
                            className="h-2 rounded-full bg-emerald-500 transition-all"
                            style={{ width: tasks.length > 0 ? `${(doneCount / tasks.length) * 100}%` : '0%' }}
                        />
                    </div>
                </div>
            </div>

            {/* Checkliste */}
            <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t('crisis.ablaeufe_hub.aufgaben')}</h3>
                {tasks.map(task => (
                    <div
                        key={task.id}
                        className={cn(
                            'flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
                            task.status === 'DONE' && 'bg-emerald-50/50 dark:bg-emerald-500/5',
                            task.status === 'ESCALATED' && 'border-red-300 bg-red-50/50 dark:bg-red-500/5',
                        )}
                    >
                        {task.status === 'DONE' ? (
                            <MaterialIcon name="check_circle" size={20} className="shrink-0 text-emerald-500" />
                        ) : task.status === 'ESCALATED' ? (
                            <MaterialIcon name="warning" size={20} className="shrink-0 text-red-500" />
                        ) : (
                            <button
                                onClick={() => handleTaskDone(task.id)}
                                className="size-5 shrink-0 rounded-md border-2 border-muted-foreground/30 hover:border-emerald-500 hover:bg-emerald-500/10 transition-colors"
                            />
                        )}
                        <div className="min-w-0 flex-1">
                            <p className={cn('text-sm', task.status === 'DONE' && 'line-through text-muted-foreground')}>
                                {task.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {task.assignedRole}
                                {task.assignedUserId && ` · ${task.assignedUserId.split(':')[0].replace('@', '')}`}
                            </p>
                        </div>
                        {task.status !== 'DONE' && (
                            task.assignedUserId === myUserId ? (
                                <button
                                    onClick={() => handleAssign(task.id, null)}
                                    className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                                    title={t('crisis.ablaeufe_hub.zuweisung_aufheben')}
                                >
                                    {t('crisis.ablaeufe_hub.mir_zugewiesen')}
                                </button>
                            ) : !task.assignedUserId && (
                                <button
                                    onClick={() => handleAssign(task.id, myUserId)}
                                    className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                                >
                                    {t('crisis.ablaeufe_hub.mir_zuweisen')}
                                </button>
                            )
                        )}
                        {task.status === 'ESCALATED' && (
                            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-500">
                                {t('crisis.ablaeufe_hub.eskaliert')}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Aktionen */}
            <div className="space-y-3 rounded-lg border p-4">
                <h3 className="text-sm font-semibold">{t('crisis.ablaeufe_hub.aktionen')}</h3>
                <button
                    onClick={handleDeactivate}
                    className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                    {t('crisis.ablaeufe_hub.krise_beenden')}
                </button>
                <div className="flex gap-2">
                    <input
                        value={falseAlarmNote}
                        onChange={e => setFalseAlarmNote(e.target.value)}
                        placeholder={t('crisis.ablaeufe_hub.begruendung_fuer_fehlalarm')}
                        className="flex-1 rounded-md border bg-background px-3 py-2 text-xs"
                    />
                    <button
                        onClick={handleFalseAlarm}
                        disabled={!falseAlarmNote.trim()}
                        className="rounded-md border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                        {t('crisis.ablaeufe_hub.fehlalarm')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Verlauf Panel ──────────────────────────────────────────────────────────

function HistoryPanel({ events }: { events: CrisisEvent[] }) {
    const t = useT();
    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <MaterialIcon name="history" size={40} className="text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">{t('crisis.ablaeufe_hub.noch_keine_abgeschlossenen_ereignisse')}</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl p-6 space-y-2">
            {events.map(e => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border px-4 py-3">
                    <span className={cn('size-2 rounded-full', e.isFalseAlarm ? 'bg-orange-400' : 'bg-emerald-400')} />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{e.scenario?.name ?? '?'}</p>
                        <p className="text-[10px] text-muted-foreground">
                            {e.isFalseAlarm ? 'Fehlalarm' : 'Beendet'} · {new Date(e.activatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                    </div>
                    <MaterialIcon name="chevron_right" size={16} className="text-muted-foreground" />
                </div>
            ))}
        </div>
    );
}

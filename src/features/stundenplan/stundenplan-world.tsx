/**
 * StundenplanWorld — Sidebar-Inhalt fuer den Stundenplan-Hub.
 *
 * Zwei Bloecke:
 *   1. SZENARIEN  — vertikale Liste, Klick = aktiv, Inline-Aktionen
 *                   (Anlegen, Loeschen), Status-Badge je Szenario.
 *   2. VERWALTUNG — admin-only Block mit Buttons fuer Stammdaten /
 *                   Baender / Bulk-Import / Veroeffentlichen. Klick
 *                   oeffnet das jeweilige Slide-Over im Hub via
 *                   stundenplanStore.openPanel(...).
 *
 * Score, Mein/Voll, Auto-Plan, Bereitschaft, Edit-Mode + Drucken bleiben
 * in der Hub-Toolbar oben — die sind Aktionen auf der aktuellen Sicht,
 * keine Navigation.
 */
import { type JSX, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/use-t';
import { useCan } from '@/core/permissions';
import { sessionStore } from '@/core/session/session-store';
import { createStundenplanGateway } from '@/gateways/platform/stundenplan-gateway';
import { stundenplanStore, type StundenplanPanel } from './stundenplan-store';
import { setupWizardStore } from './setup-wizard-store';

const gateway = createStundenplanGateway();

interface Props {
    collapsed: boolean;
}

export function StundenplanWorld({ collapsed }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const ui = useSyncExternalStore(stundenplanStore.subscribe, stundenplanStore.getSnapshot);
    const jwt = session.platform?.token;
    const isAdmin = useCan('manageSpaces');
    const qc = useQueryClient();

    const scenariosQ = useQuery({
        queryKey: ['stundenplan-scenarios'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listScenarios(jwt);
        },
    });
    const scenarios = scenariosQ.data?.scenarios ?? [];

    // Beim ersten Laden: wenn noch kein Szenario gewaehlt, das published
    // (oder erste) automatisch auswaehlen.
    if (!ui.scenarioId && scenarios.length > 0) {
        const initial = scenarios.find((s) => s.status === 'published') ?? scenarios[0];
        if (initial) stundenplanStore.setScenarioId(initial.id);
    }

    async function handleDelete(scenarioId: string) {
        if (!jwt) return;
        const current = scenarios.find((s) => s.id === scenarioId);
        if (!current) return;
        if (current.status === 'published') {
            alert(
                t('stundenplan.scenario_delete_published_blocked', {
                    defaultValue:
                        'Veroeffentlichte Szenarien koennen nicht geloescht werden. Bitte erst Status aendern.',
                }),
            );
            return;
        }
        try {
            const dry = await gateway.deleteScenario(jwt, scenarioId, { dryRun: true });
            const w = dry.result.wouldDelete;
            const sum = w.entries + w.pinConstraints + w.solveJobs + w.publishEvents;
            const msg =
                sum === 0
                    ? t('stundenplan.scenario_delete_confirm_empty', {
                          defaultValue: `Szenario "${current.name}" loeschen? Es enthaelt keine Eintraege.`,
                      })
                    : `${t('stundenplan.scenario_delete_confirm', {
                          defaultValue: 'Szenario wirklich loeschen?',
                      })}\n\nMitloeschen: ${w.entries} Stunden · ${w.pinConstraints} Pins · ${w.solveJobs} Solver-Laeufe · ${w.publishEvents} Publish-Events`;
            if (!confirm(msg)) return;
            await gateway.deleteScenario(jwt, scenarioId);
            // Nach dem Loeschen: auf naechstes Szenario wechseln, Liste neu laden
            await qc.invalidateQueries({ queryKey: ['stundenplan-scenarios'] });
            const remaining = scenarios.filter((s) => s.id !== scenarioId);
            stundenplanStore.setScenarioId(remaining[0]?.id);
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }

    function handleCreate() {
        // Variante C: der Wizard ist der bevorzugte Weg. Erfahrene User
        // koennen jederzeit "Spaeter weitermachen" druecken und auf
        // Schritt 1 nur Name eintippen — das ist der „Schnellpfad".
        setupWizardStore.open();
    }

    if (collapsed) {
        // Kollabierte Sidebar zeigt nur Icons fuer die Verwaltung-Buttons.
        return (
            <div className="space-y-1 pt-2">
                {isAdmin && (
                    <>
                        <CollapsedButton
                            icon="folder_special"
                            title={t('stundenplan.stammdaten_button_title', { defaultValue: 'Stammdaten' })}
                            onClick={() => stundenplanStore.openPanel('stammdaten')}
                        />
                        <CollapsedButton
                            icon="push_pin"
                            title="Voraus-Zuweisung"
                            onClick={() => stundenplanStore.openPanel('pre-pinning')}
                        />
                        <CollapsedButton
                            icon="link"
                            title={t('stundenplan.couplings_button_title', { defaultValue: 'Baender & Kopplungen' })}
                            onClick={() => stundenplanStore.openPanel('bands')}
                        />
                        <CollapsedButton
                            icon="upload_file"
                            title={t('stundenplan.bulk_import_title', { defaultValue: 'Bulk-Import' })}
                            onClick={() => stundenplanStore.openPanel('bulk-import')}
                        />
                        <CollapsedButton
                            icon="rocket_launch"
                            title={t('stundenplan.publish_button_title', { defaultValue: 'Veroeffentlichen' })}
                            onClick={() => stundenplanStore.openPanel('publish')}
                        />
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-4 px-1">
            {/* ── SZENARIEN ───────────────────────────────────────── */}
            <section className="space-y-1">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('stundenplan.sidebar_section_scenarios', { defaultValue: 'Schuljahre' })}
                    </h3>
                </div>
                {isAdmin && (
                    <button
                        onClick={handleCreate}
                        className="flex w-full items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/15"
                        title={t('stundenplan.sidebar_start_wizard', { defaultValue: 'Schuljahr in 5 Min anlegen' })}
                    >
                        <MaterialIcon name="auto_awesome" size={13} />
                        {t('stundenplan.sidebar_new_scenario', { defaultValue: 'Neues Schuljahr anlegen' })}
                    </button>
                )}
                {scenariosQ.isLoading ? (
                    <p className="px-2 text-xs text-muted-foreground">…</p>
                ) : scenarios.length === 0 ? (
                    <div className="px-1 space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                            {t('stundenplan.sidebar_no_scenarios', { defaultValue: 'Noch kein Szenario angelegt.' })}
                        </p>
                        {isAdmin && (
                            <button
                                onClick={() => setupWizardStore.open()}
                                className="inline-flex w-full items-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                            >
                                <MaterialIcon name="auto_awesome" size={12} />
                                {t('stundenplan.sidebar_start_wizard', { defaultValue: 'Schuljahr in 5 Min anlegen' })}
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className="space-y-0.5">
                        {scenarios.map((s) => {
                            const isActive = s.id === ui.scenarioId;
                            const isPublished = s.status === 'published';
                            return (
                                <li
                                    key={s.id}
                                    className={cn(
                                        'group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs',
                                        isActive
                                            ? 'bg-sidebar-active text-sidebar-accent-foreground'
                                            : 'text-sidebar-foreground hover:bg-sidebar-accent',
                                    )}
                                >
                                    <button
                                        onClick={() => stundenplanStore.setScenarioId(s.id)}
                                        className="flex flex-1 items-center gap-1.5 truncate text-left"
                                    >
                                        <MaterialIcon
                                            name={isPublished ? 'event_available' : 'event_note'}
                                            size={13}
                                            className={isPublished ? 'text-emerald-600' : 'opacity-60'}
                                        />
                                        <span className="truncate font-medium">{s.name}</span>
                                        {isPublished && (
                                            <span className="ml-auto rounded bg-emerald-100 px-1 text-[9px] font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                                                live
                                            </span>
                                        )}
                                    </button>
                                    {isAdmin && !isPublished && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handleDelete(s.id);
                                            }}
                                            className="hidden rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                                            title={t('stundenplan.scenario_delete_title', {
                                                defaultValue: 'Loeschen',
                                            })}
                                            aria-label={t('stundenplan.scenario_delete_title', {
                                                defaultValue: 'Loeschen',
                                            })}
                                        >
                                            <MaterialIcon name="delete_outline" size={12} />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {/* ── VERWALTUNG (admin) ─────────────────────────────── */}
            {isAdmin && (
                <section className="space-y-1">
                    <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('stundenplan.sidebar_section_admin', { defaultValue: 'Verwaltung' })}
                    </h3>
                    <ul className="space-y-0.5">
                        <SidebarAction
                            panel="stammdaten"
                            icon="folder_special"
                            label={t('stundenplan.stammdaten_button', { defaultValue: 'Stammdaten' })}
                            currentOpen={ui.openPanel}
                        />
                        <SidebarAction
                            panel="pre-pinning"
                            icon="push_pin"
                            label="Voraus-Zuweisung"
                            currentOpen={ui.openPanel}
                        />
                        <SidebarAction
                            panel="bands"
                            icon="link"
                            label={t('stundenplan.couplings_button', { defaultValue: 'Baender' })}
                            currentOpen={ui.openPanel}
                        />
                        <SidebarAction
                            panel="bulk-import"
                            icon="upload_file"
                            label={t('stundenplan.bulk_import_button', { defaultValue: 'Bulk-Import' })}
                            currentOpen={ui.openPanel}
                        />
                        <SidebarAction
                            panel="publish"
                            icon="rocket_launch"
                            label={t('stundenplan.publish_button', { defaultValue: 'Veroeffentlichen' })}
                            currentOpen={ui.openPanel}
                        />
                    </ul>
                </section>
            )}
        </div>
    );
}

function SidebarAction({
    panel,
    icon,
    label,
    currentOpen,
}: {
    panel: Exclude<StundenplanPanel, null>;
    icon: string;
    label: string;
    currentOpen: StundenplanPanel;
}): JSX.Element {
    const active = currentOpen === panel;
    return (
        <li>
            <button
                onClick={() => stundenplanStore.openPanel(panel)}
                className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    active
                        ? 'bg-sidebar-active text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent',
                )}
            >
                <MaterialIcon name={icon} size={14} className="text-muted-foreground" />
                {label}
            </button>
        </li>
    );
}

function CollapsedButton({
    icon,
    title,
    onClick,
}: {
    icon: string;
    title: string;
    onClick: () => void;
}): JSX.Element {
    return (
        <button
            onClick={onClick}
            title={title}
            aria-label={title}
            className="flex w-full items-center justify-center rounded-md py-2 text-sidebar-foreground hover:bg-sidebar-accent"
        >
            <MaterialIcon name={icon} size={18} />
        </button>
    );
}

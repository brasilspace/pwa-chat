/**
 * SetupWizardPanel — Geführter 7-Schritt-Assistent fuers Schuljahr-Setup.
 *
 * Slide-Over rechts (mobile: vollflächig). Persistiert Zwischenstand via
 * setupWizardStore → User kann zwischendurch abbrechen und beim
 * nächsten Klick weitermachen.
 *
 * Schritte:
 *   1. Name (mit Smart-Default aus aktuellem Datum)
 *   2. Bundesland + Schulform (lädt passende Lehrplan-Vorlage)
 *   3. Klassen-Check (existierende auflisten, Inline-„+"-Aktion)
 *   4. Lehrer-Qualifikationen-Check
 *   5. Räume
 *   6. Stundentafel via Lehrplan-Auto-Mapping
 *   7. Final mit Auto-Plan-Knopf + Confetti
 *
 * Adaptive Logik:
 *   - Wenn Stammdaten schon vorhanden → grüner Haken, „Weiter"-Knopf
 *   - Wenn nicht → Inline-Hinweis + Skip-Option
 */
import { type JSX, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import { sessionStore } from '@/core/session/session-store';
import {
    createStundenplanGateway,
    type LehrplanSummary,
} from '@/gateways/platform/stundenplan-gateway';
import { setupWizardStore, type WizardStep } from './setup-wizard-store';
import { stundenplanStore } from './stundenplan-store';
import { fireConfetti } from './confetti';
import { WizardKennzahlenChips } from './wizard-kennzahlen-chips';
import { useWizardKennzahlen } from './use-wizard-kennzahlen';

const gateway = createStundenplanGateway();

const STEPS: { num: WizardStep; key: string; defaultLabel: string }[] = [
    { num: 1, key: 'wizard_step_name', defaultLabel: 'Name' },
    { num: 2, key: 'wizard_step_school', defaultLabel: 'Schule' },
    { num: 3, key: 'wizard_step_classes', defaultLabel: 'Klassen' },
    { num: 4, key: 'wizard_step_teachers', defaultLabel: 'Lehrer' },
    { num: 5, key: 'wizard_step_rooms', defaultLabel: 'Räume' },
    { num: 6, key: 'wizard_step_stundentafel', defaultLabel: 'Stundentafel' },
    { num: 7, key: 'wizard_step_done', defaultLabel: 'Fertig' },
];

export function SetupWizardPanel(): JSX.Element | null {
    const t = useT();
    const ui = useSyncExternalStore(setupWizardStore.subscribe, setupWizardStore.getSnapshot);

    if (!ui.open) return null;

    const progress = Math.round((ui.currentStep / 7) * 100);

    return (
        <div
            className="fixed inset-0 z-50 flex"
            role="dialog"
            aria-modal="true"
        >
            {/* Backdrop */}
            <button
                type="button"
                onClick={() => setupWizardStore.close()}
                className="flex-1 bg-foreground/40 backdrop-blur-sm"
                aria-label={t('common.close')}
            />
            {/* Panel — Breite je nach Modus */}
            <div className={cn(
                'flex h-full w-full flex-col border-l bg-background shadow-2xl',
                ui.expanded ? 'max-w-[1280px]' : 'max-w-[560px]',
            )}>
                {/* Header */}
                <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
                    <MaterialIcon name="auto_awesome" size={20} className="text-primary" />
                    <div className="flex-1">
                        <div className="text-sm font-semibold">
                            {t('stundenplan.wizard_title', { defaultValue: 'Schuljahr-Setup' })}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                            {t('stundenplan.wizard_step_label', {
                                defaultValue: 'Schritt {current} von {total}',
                            })
                                .replace('{current}', String(ui.currentStep))
                                .replace('{total}', '7')}{' '}
                            · {progress}%
                        </div>
                    </div>
                    {/* Live-Kennzahlen rechts: Bedarf, Angebot, fehlende Faecher */}
                    <WizardKennzahlenChips compact />

                    <button
                        onClick={() => setupWizardStore.toggleExpanded()}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={ui.expanded ? 'Auf Standardbreite verkleinern' : 'Auf Vollbreite vergroessern'}
                        aria-label={ui.expanded ? 'Schmal' : 'Breit'}
                    >
                        <MaterialIcon name={ui.expanded ? 'close_fullscreen' : 'open_in_full'} size={16} />
                    </button>
                    <button
                        onClick={() => setupWizardStore.close()}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t('common.close')}
                        aria-label={t('common.close')}
                    >
                        <MaterialIcon name="close" size={18} />
                    </button>
                </div>

                {/* Progress-Bar */}
                <div className="h-1 bg-muted">
                    <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Stepper-Pills */}
                <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-5 py-2 text-[11px]">
                    {STEPS.map((s) => (
                        <button
                            key={s.num}
                            onClick={() => setupWizardStore.goTo(s.num)}
                            className={cn(
                                'flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors',
                                s.num === ui.currentStep
                                    ? 'bg-primary text-primary-foreground'
                                    : s.num < ui.currentStep
                                      ? 'text-emerald-700 hover:bg-muted'
                                      : 'text-muted-foreground hover:bg-muted',
                            )}
                            title={t(`stundenplan.${s.key}`, { defaultValue: s.defaultLabel })}
                        >
                            {s.num < ui.currentStep ? (
                                <MaterialIcon name="check_circle" size={11} />
                            ) : (
                                <span className="w-3 text-center font-mono">{s.num}</span>
                            )}
                            <span className="hidden sm:inline">
                                {t(`stundenplan.${s.key}`, { defaultValue: s.defaultLabel })}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Step content */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {ui.currentStep === 1 && <Step1Name />}
                    {ui.currentStep === 2 && <Step2School />}
                    {ui.currentStep === 3 && <Step3Classes />}
                    {ui.currentStep === 4 && <Step4Teachers />}
                    {ui.currentStep === 5 && <Step5Rooms />}
                    {ui.currentStep === 6 && <Step6Stundentafel />}
                    {ui.currentStep === 7 && <Step7Done />}
                </div>

                {/* Footer-Navigation */}
                {ui.currentStep < 7 && (
                    <div className="flex shrink-0 items-center gap-2 border-t px-5 py-3">
                        <button
                            onClick={() => setupWizardStore.prev()}
                            disabled={ui.currentStep === 1}
                            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        >
                            ← {t('common.back', { defaultValue: 'Zurueck' })}
                        </button>
                        <button
                            onClick={() => setupWizardStore.close()}
                            className="text-xs text-muted-foreground hover:underline"
                        >
                            {t('stundenplan.wizard_later', { defaultValue: 'Spaeter weitermachen' })}
                        </button>
                        <button
                            onClick={() => setupWizardStore.next()}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            {t('common.next', { defaultValue: 'Weiter' })} →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Schritte
// ═══════════════════════════════════════════════════════════════════════════

function StepHeader({
    icon,
    title,
    intro,
}: {
    icon: string;
    title: string;
    intro?: string;
}): JSX.Element {
    return (
        <header className="mb-4 space-y-1.5">
            <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <MaterialIcon name={icon} size={20} />
                </span>
                <h2 className="text-base font-semibold">{title}</h2>
            </div>
            {intro && <p className="text-xs leading-relaxed text-muted-foreground">{intro}</p>}
        </header>
    );
}

function HintBox({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <MaterialIcon name="lightbulb" size={13} className="-mt-0.5 mr-1 inline" />
            {children}
        </div>
    );
}

/**
 * Ausfuehrlicher Versorgungs-Banner. Zeigt:
 *   - Bedarf (mit Quellen-Annotation)
 *   - Angebot (mit Quellen-Annotation)
 *   - Versorgungs-Prozentbalken mit Farbe (rot/amber/gruen)
 *   - Liste der Faecher, fuer die kein Lehrer qualifiziert ist
 */
function KennzahlenBanner({ kennzahlen: k }: { kennzahlen: ReturnType<typeof useWizardKennzahlen> }): JSX.Element {
    const r = k.coverageRatio;
    const pct = r == null ? null : Math.round(r * 100);
    const barColor = r == null ? 'bg-muted'
        : r >= 1.0 ? 'bg-emerald-500'
            : r >= 0.8 ? 'bg-amber-500'
                : 'bg-red-500';
    const borderColor = r == null ? 'border-border'
        : r >= 1.0 ? 'border-emerald-200 dark:border-emerald-900'
            : r >= 0.8 ? 'border-amber-200 dark:border-amber-900'
                : 'border-red-200 dark:border-red-900';
    const bgColor = r == null ? 'bg-muted/30'
        : r >= 1.0 ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
            : r >= 0.8 ? 'bg-amber-50/50 dark:bg-amber-950/20'
                : 'bg-red-50/50 dark:bg-red-950/20';
    // Wenn der Backend-Readiness-Report einen Verdict liefert, hat der
    // Vorrang ueber die heuristische coverageRatio — der Solver entscheidet
    // letztlich auf Basis dieses Reports, also zeigen wir, was er sehen wird.
    const verdict = k.readinessVerdict;
    const verdictBadge = verdict === 'ready'
        ? { icon: 'check_circle', label: 'Bereit fuer Auto-Plan', tone: 'bg-emerald-600 text-white' }
        : verdict === 'warning'
            ? { icon: 'warning', label: `${k.warningCount} Hinweis${k.warningCount === 1 ? '' : 'e'} — startet, aber suboptimal`, tone: 'bg-amber-600 text-white' }
            : verdict === 'blocked'
                ? { icon: 'block', label: `${k.blockerCount} Blocker — Auto-Plan kann noch nicht starten`, tone: 'bg-red-600 text-white' }
                : null;
    return (
        <div className={cn('rounded-md border p-3 text-xs', borderColor, bgColor)}>
            {verdictBadge && (
                <div className="mb-2 flex items-center justify-between">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium', verdictBadge.tone)}>
                        <MaterialIcon name={verdictBadge.icon} size={13} />
                        {verdictBadge.label}
                    </span>
                </div>
            )}
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">
                    {k.teacherCount} Lehrer fuer {k.classCount} Klassen
                </span>
                <span className="text-[11px] text-muted-foreground">
                    Angebot <strong>{k.supplyHours}h</strong>
                    {k.supplySource === 'pauschal-geschaetzt' && <span className="ml-0.5 opacity-60">(pauschal 25h/Lehrer)</span>}
                    {' '}vs. Bedarf <strong>{k.demandSource === 'stundentafel' ? '' : '~'}{k.demandHours}h</strong>
                    {k.demandSource === 'lehrplan-geschaetzt' && <span className="ml-0.5 opacity-60">(Lehrplan-Schaetzung)</span>}
                </span>
                {pct != null && (
                    <span className="ml-auto text-sm font-semibold tabular-nums">
                        {pct}%
                    </span>
                )}
            </div>
            {pct != null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full transition-all', barColor)} style={{ width: `${Math.min(150, pct)}%` }} />
                </div>
            )}

            {/* Blocker und Warnings aus dem Readiness-Report */}
            {k.blockerSummaries.length > 0 && (
                <div className="mt-2 space-y-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-red-700 dark:text-red-300">
                        <MaterialIcon name="block" size={11} className="-mt-0.5 mr-0.5 inline" />
                        Blocker (Solver kann nicht starten):
                    </div>
                    <ul className="ml-4 list-disc space-y-0 text-[11px] text-red-900 dark:text-red-200">
                        {k.blockerSummaries.slice(0, 6).map((s, i) => <li key={i}>{s}</li>)}
                        {k.blockerSummaries.length > 6 && <li className="text-muted-foreground">+{k.blockerSummaries.length - 6} weitere…</li>}
                    </ul>
                </div>
            )}
            {k.warningSummaries.length > 0 && (
                <div className="mt-2 space-y-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        <MaterialIcon name="warning" size={11} className="-mt-0.5 mr-0.5 inline" />
                        Hinweise (suboptimal, aber nicht blockierend):
                    </div>
                    <ul className="ml-4 list-disc space-y-0 text-[11px] text-amber-900 dark:text-amber-200">
                        {k.warningSummaries.slice(0, 6).map((s, i) => <li key={i}>{s}</li>)}
                        {k.warningSummaries.length > 6 && <li className="text-muted-foreground">+{k.warningSummaries.length - 6} weitere…</li>}
                    </ul>
                </div>
            )}

            {k.missingSubjectEntities.length > 0 && (
                <MissingSubjectsAdder subjects={k.missingSubjectEntities} />
            )}

            {/* Pro-Fach-Versorgung: welche Faecher decken die Lehrer ab? */}
            {k.perSubject.length > 0 && (
                <PerSubjectCoverage perSubject={k.perSubject} />
            )}
            {k.missingTeacherSubjects.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">
                        <MaterialIcon name="error_outline" size={11} className="-mt-0.5 mr-0.5 inline text-red-600" />
                        Kein Lehrer fuer diese Faecher:
                    </span>
                    {k.missingTeacherSubjects.map(s => (
                        <span key={s.key} className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-900 dark:bg-red-950/40 dark:text-red-200">
                            {s.label}
                        </span>
                    ))}
                </div>
            )}
            {k.missingStundentafelSubjects.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">
                        <MaterialIcon name="info" size={11} className="-mt-0.5 mr-0.5 inline text-amber-600" />
                        Im Lehrplan, aber noch nicht in der Stundentafel:
                    </span>
                    {k.missingStundentafelSubjects.slice(0, 8).map(s => (
                        <span key={s.key} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            {s.label}
                        </span>
                    ))}
                    {k.missingStundentafelSubjects.length > 8 && (
                        <span className="text-[10px] text-muted-foreground">+{k.missingStundentafelSubjects.length - 8} weitere</span>
                    )}
                </div>
            )}
        </div>
    );
}

function Step1Name(): JSX.Element {
    const t = useT();
    const ui = useSyncExternalStore(setupWizardStore.subscribe, setupWizardStore.getSnapshot);
    return (
        <div className="space-y-4">
            <StepHeader
                icon="edit_calendar"
                title={t('stundenplan.wizard_step1_title', {
                    defaultValue: 'Wie soll Dein Schuljahr heißen?',
                })}
                intro={t('stundenplan.wizard_step1_intro', {
                    defaultValue:
                        'Wir schlagen das aktuelle Schuljahr vor. Du kannst den Namen jederzeit aendern.',
                })}
            />
            <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                    {t('stundenplan.wizard_step1_name_label', { defaultValue: 'Name' })}
                </span>
                <input
                    type="text"
                    value={ui.form.name}
                    onChange={(e) => setupWizardStore.setForm({ name: e.target.value })}
                    autoFocus
                    maxLength={120}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
            </label>
            <HintBox>
                {t('stundenplan.wizard_step1_hint', {
                    defaultValue:
                        'Wenn Du spaeter mehrere Varianten vergleichen willst, leg einfach noch ein Szenario an (z.B. „Variante mit weniger Hohlstunden").',
                })}
            </HintBox>
        </div>
    );
}

function Step2School(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const ui = useSyncExternalStore(setupWizardStore.subscribe, setupWizardStore.getSnapshot);

    const templatesQ = useQuery({
        queryKey: ['stundenplan-lehrplaene'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listLehrplaene(jwt);
        },
    });
    const templates = templatesQ.data?.templates ?? [];

    // Auto-Pick wenn nur 1 passender Template
    useEffect(() => {
        if (templates.length === 0) return;
        // Wenn lehrplanKey schon gesetzt und gueltig: nichts tun
        if (ui.form.lehrplanKey && templates.some((t) => t.key === ui.form.lehrplanKey)) return;
        // Sonst: matching template suchen
        const matches = templates.filter((tpl) => {
            const bundesland = tpl.bundesland.toLowerCase().replace(/[^a-z]/g, '');
            return bundesland.includes(ui.form.region.toLowerCase()) ||
                ui.form.region.toLowerCase().includes(bundesland);
        });
        if (matches.length === 1) {
            setupWizardStore.setForm({ lehrplanKey: matches[0].key });
        }
    }, [templates, ui.form.region, ui.form.lehrplanKey]);

    const regions = useMemo(() => {
        const set = new Set(templates.map((t) => t.bundesland));
        return Array.from(set).sort();
    }, [templates]);

    const schoolTypesForRegion = useMemo(() => {
        if (!ui.form.region) return [];
        return templates.filter((tpl) => tpl.bundesland.toLowerCase() === ui.form.region.toLowerCase());
    }, [templates, ui.form.region]);

    return (
        <div className="space-y-4">
            <StepHeader
                icon="school"
                title={t('stundenplan.wizard_step2_title', {
                    defaultValue: 'Welche Schulform unterrichtest Du?',
                })}
                intro={t('stundenplan.wizard_step2_intro', {
                    defaultValue:
                        'Wir laden fuer Dich die passende Stundentafel — Du musst sie nicht von Hand pflegen.',
                })}
            />

            {templatesQ.isLoading && <p className="text-xs text-muted-foreground">…</p>}

            <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                    {t('stundenplan.wizard_step2_region', { defaultValue: 'Bundesland' })}
                </span>
                <select
                    value={ui.form.region}
                    onChange={(e) =>
                        setupWizardStore.setForm({ region: e.target.value, lehrplanKey: null })
                    }
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                    {regions.length === 0 && <option value="">—</option>}
                    {regions.map((r) => (
                        <option key={r} value={r.toLowerCase()}>
                            {r}
                        </option>
                    ))}
                </select>
            </label>

            <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                    {t('stundenplan.wizard_step2_school_type', { defaultValue: 'Schulform' })}
                </span>
                <select
                    value={ui.form.lehrplanKey ?? ''}
                    onChange={(e) => setupWizardStore.setForm({ lehrplanKey: e.target.value || null })}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                    <option value="">
                        {schoolTypesForRegion.length === 0
                            ? t('stundenplan.wizard_step2_no_template', {
                                  defaultValue: 'Keine Vorlage fuer dieses Bundesland',
                              })
                            : '—'}
                    </option>
                    {schoolTypesForRegion.map((tpl) => (
                        <option key={tpl.key} value={tpl.key}>
                            {tpl.schulform}
                            {tpl.trackVariant ? ` (${tpl.trackVariant})` : ''}
                        </option>
                    ))}
                </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                    type="checkbox"
                    checked={ui.form.skipLehrplan}
                    onChange={(e) => setupWizardStore.setForm({ skipLehrplan: e.target.checked })}
                />
                {t('stundenplan.wizard_step2_skip', {
                    defaultValue: 'Ich habe keine passende Vorlage — manuell pflegen',
                })}
            </label>

            <HintBox>
                {t('stundenplan.wizard_step2_hint', {
                    defaultValue:
                        'Die Vorlage liefert eine Standard-Stundentafel pro Klassenstufe. Du kannst sie spaeter pro Klasse anpassen.',
                })}
            </HintBox>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stammdaten-Inspector — Schritte 3-5
// ═══════════════════════════════════════════════════════════════════════════

function Step3Classes(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const qc = useQueryClient();
    const kennzahlen = useWizardKennzahlen();

    const classesQ = useQuery({
        queryKey: ['stundenplan-class-spaces'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listClassSpaces(jwt);
        },
    });
    const classes = classesQ.data?.classes ?? [];

    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [lastCreated, setLastCreated] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    // Parser: akzeptiert sowohl Komma als auch Newline als Trennzeichen
    // ("1a, 1b, 1c" oder eine Klasse pro Zeile). Trim + Dedupe.
    function parseClassNames(input: string): string[] {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const raw of input.split(/[,\n;]+/)) {
            const v = raw.trim();
            if (!v) continue;
            const key = v.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(v);
        }
        return out;
    }

    async function createClass() {
        const names = parseClassNames(name);
        if (names.length === 0) {
            setError(t('stundenplan.wizard_step3_name_missing', { defaultValue: 'Bitte Namen eingeben.' }));
            return;
        }
        if (!jwt) {
            setError(t('stundenplan.wizard_step3_no_jwt', { defaultValue: 'Nicht eingeloggt — bitte Seite neu laden.' }));
            return;
        }
        setSaving(true);
        setError(null);
        setProgress({ done: 0, total: names.length });
        const created: string[] = [];
        try {
            for (const n of names) {
                await gateway.createClassSpaceFromTemplate(jwt, {
                    templateKey: 'class-standard',
                    name: n,
                });
                created.push(n);
                setProgress({ done: created.length, total: names.length });
            }
            await qc.invalidateQueries({ queryKey: ['stundenplan-class-spaces'] });
            await classesQ.refetch();
            setLastCreated(created.join(', '));
            setName('');
            setTimeout(() => setLastCreated(null), 5000);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const prefix = created.length > 0
                ? `${created.length}/${names.length} angelegt (${created.join(', ')}). Fehler bei „${names[created.length]}": `
                : '';
            setError(prefix + (msg || t('stundenplan.wizard_step3_create_failed', { defaultValue: 'Anlegen fehlgeschlagen — Backend antwortet nicht wie erwartet.' })));
            if (created.length > 0) {
                await qc.invalidateQueries({ queryKey: ['stundenplan-class-spaces'] });
                await classesQ.refetch();
                // Belasse die noch nicht angelegten im Input, damit der User direkt korrigieren kann.
                setName(names.slice(created.length).join(', '));
            }
        } finally {
            setSaving(false);
            setProgress(null);
        }
    }

    return (
        <div className="space-y-4">
            <StepHeader
                icon="groups"
                title={t('stundenplan.wizard_step3_title', {
                    defaultValue: 'Sind alle Deine Klassen angelegt?',
                })}
                intro={t('stundenplan.wizard_step3_intro', {
                    defaultValue:
                        'Eine Klasse ist eine Lerneinheit wie „5a" oder „Q1". Sie wird im Plan, in der Stundentafel und beim Auto-Plan benutzt.',
                })}
            />

            {classesQ.isLoading ? (
                <p className="text-xs text-muted-foreground">…</p>
            ) : classes.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {t('stundenplan.wizard_step3_empty', {
                        defaultValue:
                            'Noch keine Klassen. Lege wenigstens eine Klasse an — sonst hat der Plan nichts zu fuellen.',
                    })}
                </div>
            ) : (
                <div>
                    <div className="text-xs text-muted-foreground">
                        {t('stundenplan.wizard_step3_found', { defaultValue: 'Gefunden:' })}{' '}
                        {classes.length} {t('stundenplan.classes_plural', { defaultValue: 'Klassen' })}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                        {classes.map((c) => (
                            <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                                <MaterialIcon name="check" size={11} />
                                {c.name}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {!showForm ? (
                <button
                    onClick={() => setShowForm(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                    <MaterialIcon name="add" size={14} />
                    {t('stundenplan.wizard_step3_add', { defaultValue: 'Klasse anlegen' })}
                </button>
            ) : (
                <div className="rounded-md border border-border p-3 space-y-2">
                    <label className="block text-xs">
                        <span className="text-muted-foreground">
                            {t('stundenplan.wizard_step3_name_label_multi', {
                                defaultValue: 'Klassen-Namen — eine pro Zeile oder mit Komma getrennt',
                            })}
                        </span>
                        <textarea
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={'1a, 1b, 1c\n2a, 2b\n3a'}
                            rows={4}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono"
                            onKeyDown={(e) => {
                                // Ctrl/Cmd+Enter = Speichern (Enter alleine bleibt Zeilenumbruch)
                                if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                                    e.preventDefault();
                                    void createClass();
                                }
                                if (e.key === 'Escape') setShowForm(false);
                            }}
                        />
                        <span className="mt-1 block text-[10px] text-muted-foreground">
                            {(() => {
                                const n = parseClassNames(name).length;
                                if (n === 0) return t('stundenplan.wizard_step3_hint_multi', { defaultValue: 'Beispiel: „1a, 1b, 1c" legt 3 Klassen an. Strg+Enter zum Speichern.' });
                                return t('stundenplan.wizard_step3_count_preview', { defaultValue: `${n} Klasse(n) werden angelegt`, count: n });
                            })()}
                        </span>
                    </label>
                    {error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                            {error}
                        </div>
                    )}
                    {progress && (
                        <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                            <MaterialIcon name="hourglass_top" size={12} className="-mt-0.5 mr-1 inline" />
                            Lege {progress.done + 1}/{progress.total} an…
                        </div>
                    )}
                    {lastCreated && (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                            <MaterialIcon name="check_circle" size={12} className="-mt-0.5 mr-1 inline" />
                            {t('stundenplan.wizard_step3_created', { defaultValue: 'Klasse angelegt:' })} <strong>{lastCreated}</strong>
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setShowForm(false); setLastCreated(null); }} className="rounded-md px-3 py-1 text-xs hover:bg-muted">
                            {t('common.done', { defaultValue: 'Fertig' })}
                        </button>
                        <button
                            onClick={createClass}
                            disabled={saving || parseClassNames(name).length === 0}
                            className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving
                                ? '…'
                                : parseClassNames(name).length > 1
                                    ? t('stundenplan.wizard_step3_save_n', { defaultValue: `${parseClassNames(name).length} anlegen`, count: parseClassNames(name).length })
                                    : t('common.save', { defaultValue: 'Speichern' })}
                        </button>
                    </div>
                </div>
            )}

            {/* Umkehr-Sicht: was bedeuten X Klassen fuer Lehrer-/Fach-Bedarf? */}
            {!kennzahlen.loading && classes.length > 0 && (
                <ReverseSummary kennzahlen={kennzahlen} mode="classes" />
            )}

            <HintBox>
                {t('stundenplan.wizard_step3_hint', {
                    defaultValue:
                        'Klassen kannst Du auch spaeter noch hinzufuegen — sie tauchen automatisch im Plan auf.',
                })}
            </HintBox>
        </div>
    );
}

/**
 * Umkehr-Sicht: zeigt aus Sicht der Struktur, was das fuer den
 * Personalbedarf bedeutet. mode='classes' → von Klassen zu Lehrern/
 * Faechern. mode='teachers' → von Lehrern zu Klassen.
 */
function ReverseSummary({ kennzahlen: k, mode }: {
    kennzahlen: ReturnType<typeof useWizardKennzahlen>;
    mode: 'classes' | 'teachers';
}): JSX.Element {
    return (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {mode === 'classes' ? 'Was das fuer Lehrer & Faecher bedeutet' : 'Was das fuer Klassen bedeutet'}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <KennzahlInline icon="groups" label={`${k.classCount} Klassen`} />
                <KennzahlInline icon="school" label={`${k.teacherCount} Lehrer`} muted={k.teacherCount === 0} />
                <KennzahlInline icon="book" label={`${k.requiredSubjectKeys.size} Faecher`} muted={k.requiredSubjectKeys.size === 0} />
                {k.demandHours > 0 && (
                    <KennzahlInline icon="schedule" label={`${k.demandSource === 'stundentafel' ? '' : '~'}${k.demandHours}h/Woche Bedarf`} />
                )}
                {k.coverageRatio != null && (
                    <KennzahlInline
                        icon={k.coverageRatio >= 1.0 ? 'check_circle' : 'warning'}
                        label={`${Math.round(k.coverageRatio * 100)}% Versorgung`}
                        tone={k.coverageRatio >= 1.0 ? 'good' : k.coverageRatio >= 0.8 ? 'warn' : 'bad'}
                    />
                )}
            </div>
            {k.missingTeacherSubjects.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-red-700 dark:text-red-300">
                    <MaterialIcon name="error_outline" size={11} className="-mt-0.5 mr-0.5 inline" />
                    <span>
                        Fehlende Lehrer-Qualifikation: <strong>{k.missingTeacherSubjects.map(s => s.label).join(', ')}</strong>
                    </span>
                    <button
                        type="button"
                        onClick={() => setupWizardStore.goTo(4)}
                        className="ml-1 inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-900/30"
                        title='Springt zu Schritt 4 — dort beim Lehrer "+ Fach" anklicken'
                    >
                        <MaterialIcon name="arrow_forward" size={11} />
                        In Schritt 4 zuordnen
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Adder fuer Lehrplan-Faecher, die in der DB als Subject-Entity noch
 * fehlen. Pro Zeile ein Inline-„+"-Knopf, plus ein „Alle anlegen"-Knopf.
 * Erfolg invalidiert die subjects-Query → Banner aktualisiert sich
 * automatisch und der Eintrag verschwindet.
 */
function MissingSubjectsAdder({ subjects }: { subjects: Array<{ key: string; label: string }> }): JSX.Element {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const qc = useQueryClient();
    const [adding, setAdding] = useState<Set<string>>(new Set());
    const [allRunning, setAllRunning] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    async function addOne(key: string, label: string) {
        if (!jwt || adding.has(key)) return;
        setAdding((prev) => new Set(prev).add(key));
        setErrorKey(null);
        try {
            await gateway.createSubject(jwt, { key, label });
            // subjects + readiness + sgHours frisch holen — letzteres weil
            // missing-Listen davon abhaengen.
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['stundenplan-subjects'] }),
                qc.invalidateQueries({ queryKey: ['stundenplan-readiness'] }),
            ]);
        } catch (e) {
            setErrorKey(key);
            console.error('createSubject failed', e);
        } finally {
            setAdding((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    }

    async function addAll() {
        if (!jwt || allRunning) return;
        setAllRunning(true);
        setErrorKey(null);
        try {
            for (const s of subjects) {
                try { await gateway.createSubject(jwt, { key: s.key, label: s.label }); }
                catch (e) { console.error(`createSubject(${s.key}) failed`, e); }
            }
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['stundenplan-subjects'] }),
                qc.invalidateQueries({ queryKey: ['stundenplan-readiness'] }),
            ]);
        } finally {
            setAllRunning(false);
        }
    }

    return (
        <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">
                    <MaterialIcon name="library_add" size={11} className="-mt-0.5 mr-0.5 inline text-rose-600" />
                    {subjects.length} Lehrplan-Faecher in Prilog noch nicht angelegt:
                </span>
                <button
                    type="button"
                    onClick={addAll}
                    disabled={allRunning}
                    className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                    title="Alle fehlenden Faecher mit ihrem Standard-Label aus dem Lehrplan anlegen"
                >
                    <MaterialIcon name={allRunning ? 'autorenew' : 'playlist_add'} size={11} className={allRunning ? 'animate-spin' : ''} />
                    {allRunning ? 'Wird angelegt…' : `Alle ${subjects.length} anlegen`}
                </button>
            </div>
            <div className="flex flex-wrap gap-1">
                {subjects.map((s) => {
                    const busy = adding.has(s.key);
                    const failed = errorKey === s.key;
                    return (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => addOne(s.key, s.label)}
                            disabled={busy || allRunning}
                            className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                                failed
                                    ? 'border-red-400 bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200'
                                    : 'border-rose-300 bg-rose-100 text-rose-900 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-900/50',
                                (busy || allRunning) && 'opacity-50',
                            )}
                            title={`Fach „${s.label}" mit Key „${s.key}" anlegen`}
                        >
                            <MaterialIcon name={busy ? 'autorenew' : failed ? 'error' : 'add'} size={10} className={busy ? 'animate-spin' : ''} />
                            {s.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Tabellarische Per-Fach-Versorgung. Pro Fach: benoetigte Wochenstunden,
 * Anzahl qualifizierte Lehrer, anteilige Deputat-Stunden, Status-Balken.
 * Sortiert nach Status (Blocker oben).
 */
function PerSubjectCoverage({ perSubject }: { perSubject: ReturnType<typeof useWizardKennzahlen>['perSubject'] }): JSX.Element {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? perSubject : perSubject.slice(0, 8);
    const blockers = perSubject.filter(p => p.status === 'blocker').length;
    const warnings = perSubject.filter(p => p.status === 'warning').length;
    const ok = perSubject.filter(p => p.status === 'ok').length;
    return (
        <details className="mt-2 rounded-md border border-border bg-background/50 p-2 text-xs" open>
            <summary className="cursor-pointer select-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <MaterialIcon name="bar_chart" size={11} className="-mt-0.5 mr-0.5 inline" />
                Fach-Versorgung: {ok} ok · {warnings} knapp · {blockers} kritisch
            </summary>
            <div className="mt-2 overflow-hidden rounded border border-border/40">
                <table className="w-full text-[11px]">
                    <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-2 py-1 text-left font-medium">Fach</th>
                            <th className="px-2 py-1 text-right font-medium w-[80px]">Bedarf</th>
                            <th className="px-2 py-1 text-right font-medium w-[80px]">Angebot</th>
                            <th className="px-2 py-1 text-right font-medium w-[60px]">Lehrer</th>
                            <th className="px-2 py-1 text-left font-medium w-[110px]">Deckung</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((p) => {
                            const ratio = p.requiredHours > 0 ? p.availableHours / p.requiredHours : 1;
                            const pct = Math.round(ratio * 100);
                            const barClr =
                                p.status === 'ok' ? 'bg-emerald-500'
                                    : p.status === 'warning' ? 'bg-amber-500'
                                        : 'bg-red-500';
                            const rowClr =
                                p.status === 'blocker' ? 'bg-red-50/40 dark:bg-red-950/10'
                                    : p.status === 'warning' ? 'bg-amber-50/30 dark:bg-amber-950/10'
                                        : '';
                            return (
                                <tr key={p.subjectKey} className={cn('border-t border-border/30', rowClr)}>
                                    <td className="px-2 py-1.5">{p.subjectLabel}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{p.requiredHours}h</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{p.availableHours}h</td>
                                    <td className={cn(
                                        'px-2 py-1.5 text-right tabular-nums',
                                        p.qualifiedTeacherCount === 0 && 'font-medium text-red-700 dark:text-red-300',
                                    )}>
                                        {p.qualifiedTeacherCount}
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                <div className={cn('h-full', barClr)} style={{ width: `${Math.min(150, Math.max(0, pct))}%` }} />
                                            </div>
                                            <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">
                                                {pct}%
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {perSubject.length > 8 && (
                <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    className="mt-1 text-[10px] text-muted-foreground hover:underline"
                >
                    {expanded ? 'Weniger anzeigen' : `+${perSubject.length - 8} weitere Faecher anzeigen`}
                </button>
            )}
        </details>
    );
}

function KennzahlInline({ icon, label, muted, tone }: {
    icon: string; label: string; muted?: boolean; tone?: 'good' | 'warn' | 'bad';
}): JSX.Element {
    const toneCls = tone === 'good' ? 'text-emerald-700 dark:text-emerald-300'
        : tone === 'warn' ? 'text-amber-700 dark:text-amber-300'
            : tone === 'bad' ? 'text-red-700 dark:text-red-300'
                : muted ? 'text-muted-foreground/60'
                    : 'text-foreground';
    return (
        <span className={cn('inline-flex items-center gap-1', toneCls)}>
            <MaterialIcon name={icon} size={12} />
            {label}
        </span>
    );
}

function Step4Teachers(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const ui = useSyncExternalStore(setupWizardStore.subscribe, setupWizardStore.getSnapshot);
    const qc = useQueryClient();
    const kennzahlen = useWizardKennzahlen();

    const staffQ = useQuery({
        queryKey: ['stundenplan-staff'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listStaffWithRoles(jwt);
        },
    });
    const qualsQ = useQuery({
        queryKey: ['stundenplan-quals'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listTeacherQualifications(jwt);
        },
    });
    const subjectsQ = useQuery({
        queryKey: ['stundenplan-subjects'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listSubjects(jwt);
        },
    });

    const allStaff = staffQ.data?.staff ?? [];
    const quals = qualsQ.data?.qualifications ?? [];
    // Subjects deduplizieren — falls trotz idempotentem Backend doch noch
    // historische Dubletten in der DB liegen (gleiches Label, anderer Key),
    // zeigt der Picker sie sonst doppelt. Behaelt jeweils das erste.
    const subjectsRaw = subjectsQ.data?.subjects ?? [];
    const subjects = (() => {
        const seen = new Set<string>();
        const out: typeof subjectsRaw = [];
        for (const s of subjectsRaw) {
            const k = s.label.trim().toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(s);
        }
        return out;
    })();
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    const teacherIds = new Set(allStaff.filter((s) => s.grants?.some((g) => g.role === 'teacher')).map((s) => s.matrixUserId));
    const qualsByUser = new Map<string, typeof quals>();
    for (const q of quals) {
        const arr = qualsByUser.get(q.matrixUserId) ?? [];
        arr.push(q);
        qualsByUser.set(q.matrixUserId, arr);
    }
    const withQuals = [...teacherIds].filter((id) => (qualsByUser.get(id) ?? []).length > 0).length;
    const withoutQuals = teacherIds.size - withQuals;

    const [busy, setBusy] = useState<string | null>(null);
    const [addOpenFor, setAddOpenFor] = useState<string | null>(null);

    // Bei vielen Mitarbeitern automatisch in den Breit-Modus wechseln —
    // einmalig pro Step-Aufruf, der User kann es manuell wieder
    // zurueckdrehen.
    const autoExpandedRef = useMemo(() => ({ done: false }), []);
    useEffect(() => {
        if (autoExpandedRef.done) return;
        const n = allStaff.length;
        if (n >= 20 && !ui.expanded) {
            setupWizardStore.toggleExpanded();
            autoExpandedRef.done = true;
        }
    }, [allStaff.length, ui.expanded, autoExpandedRef]);

    async function toggleTeacher(matrixUserId: string, makeTeacher: boolean) {
        if (!jwt || busy) return;
        setBusy(matrixUserId + ':role');
        try {
            if (makeTeacher) {
                await gateway.grantRole(jwt, { matrixUserId, role: 'teacher' });
            } else {
                // Existierenden Teacher-Grant suchen + entziehen
                const staff = allStaff.find((s) => s.matrixUserId === matrixUserId);
                const grant = staff?.grants?.find((g) => g.role === 'teacher');
                if (grant) await gateway.revokeRole(jwt, grant.id);
            }
            // Readiness und alle abgeleiteten Kennzahlen muessen mit —
            // sonst aendert sich der Verdict-Chip nicht, wenn der User
            // einen Lehrer hinzufuegt/entfernt.
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['stundenplan-staff'] }),
                qc.invalidateQueries({ queryKey: ['stundenplan-readiness'] }),
            ]);
        } finally {
            setBusy(null);
        }
    }

    async function addQual(matrixUserId: string, subjectId: string) {
        if (!jwt || busy) return;
        setBusy(matrixUserId + ':addQ:' + subjectId);
        try {
            await gateway.upsertTeacherQualification(jwt, { matrixUserId, subjectId });
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['stundenplan-quals'] }),
                qc.invalidateQueries({ queryKey: ['stundenplan-readiness'] }),
            ]);
            setAddOpenFor(null);
        } finally {
            setBusy(null);
        }
    }

    async function removeQual(qualId: string, matrixUserId: string) {
        if (!jwt || busy) return;
        setBusy(matrixUserId + ':rmQ:' + qualId);
        try {
            await gateway.deleteTeacherQualification(jwt, qualId);
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['stundenplan-quals'] }),
                qc.invalidateQueries({ queryKey: ['stundenplan-readiness'] }),
            ]);
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-4">
            <StepHeader
                icon="school"
                title={t('stundenplan.wizard_step4_title', { defaultValue: 'Lehrer & Faecher' })}
                intro={t('stundenplan.wizard_step4_intro_v2', {
                    defaultValue:
                        'Markiere die Personen, die unterrichten — und welche Faecher sie geben. Der Auto-Plan nutzt das, damit z.B. „Frau Schmidt nur Mathe in Stufe 5-7" eingehalten wird.',
                })}
            />

            {/* Versorgungs-Banner: Bedarf vs. Angebot + fehlende Faecher */}
            {!kennzahlen.loading && (kennzahlen.demandHours > 0 || kennzahlen.teacherCount > 0) && (
                <KennzahlenBanner kennzahlen={kennzahlen} />
            )}

            {/* Erklaerung Quelle */}
            <div className="rounded-md border border-sky-200 bg-sky-50/50 p-2 text-[11px] text-sky-900 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-200">
                <MaterialIcon name="info" size={12} className="-mt-0.5 mr-1 inline" />
                Gelistet werden <strong>alle Workspace-User</strong> deren Benutzertyp die Audience „staff" hat
                (auf typischen Schul-Tenants: <em>Mitarbeiter</em> + <em>Externe</em>).
                Schueler/Eltern bleiben aussen vor. Audience wird in der Workspace-Verwaltung pro Benutzertyp gesetzt.
                {allStaff.length > 0 && (
                    <> Bei vielen Lehrern: oben rechts <MaterialIcon name="open_in_full" size={12} className="-mt-0.5 inline" /> klicken — Panel wird breit.</>
                )}
            </div>

            {staffQ.isLoading || qualsQ.isLoading || subjectsQ.isLoading ? (
                <p className="text-xs text-muted-foreground">…</p>
            ) : allStaff.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {t('stundenplan.wizard_step4_no_staff', {
                        defaultValue:
                            'Keine Mitarbeiter im Workspace. Lade zuerst Kollegen in der Mitarbeiter-Verwaltung ein.',
                    })}
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                            <MaterialIcon name="school" size={11} />
                            {teacherIds.size} Lehrer
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                            <MaterialIcon name="check" size={11} />
                            {withQuals} mit Faechern
                        </span>
                        {withoutQuals > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                <MaterialIcon name="warning" size={11} />
                                {withoutQuals} ohne Faecher
                            </span>
                        )}
                    </div>

                    {subjects.length === 0 && (
                        <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-[11px] text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                            <MaterialIcon name="info" size={11} className="-mt-0.5 mr-1 inline" />
                            Noch keine Faecher angelegt. Faecher-Liste pflegst Du in den Stammdaten — bis dahin kannst Du hier nur die Lehrer-Rolle setzen.
                        </div>
                    )}

                    <div className={cn(
                        'overflow-y-auto rounded-md border border-border',
                        // Im Vollbreit-Modus mehr Hoehe, sonst kompakt
                        ui.expanded ? 'max-h-[calc(100vh-340px)]' : 'max-h-[420px]',
                    )}>
                        <table className="w-full text-[13px]">
                            <thead className="sticky top-0 bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="w-[44%] px-3 py-2 font-medium">Name</th>
                                    <th className="w-[90px] px-3 py-2 font-medium">Lehrer</th>
                                    <th className="px-3 py-2 font-medium">Faecher</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allStaff.map((s) => {
                                    const isTeacher = teacherIds.has(s.matrixUserId);
                                    const userQuals = qualsByUser.get(s.matrixUserId) ?? [];
                                    const rowBusy = busy?.startsWith(s.matrixUserId + ':') ?? false;
                                    return (
                                        <tr key={s.matrixUserId} className="border-t border-border/60 hover:bg-muted/30">
                                            <td className="px-3 py-2 align-top">
                                                <div className="font-medium">{s.displayName ?? s.matrixUserId.split(':')[0].slice(1)}</div>
                                                {s.userTypeLabel && (
                                                    <div className="text-[10px] text-muted-foreground">{s.userTypeLabel}{s.email ? ` · ${s.email}` : ''}</div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 align-top">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleTeacher(s.matrixUserId, !isTeacher)}
                                                    disabled={rowBusy}
                                                    className={cn(
                                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                                        isTeacher ? 'bg-primary' : 'bg-muted',
                                                        rowBusy && 'opacity-50',
                                                    )}
                                                    aria-pressed={isTeacher}
                                                    title={isTeacher ? 'Lehrer-Rolle entziehen' : 'Als Lehrer markieren'}
                                                >
                                                    <span
                                                        className={cn(
                                                            'inline-block size-4 transform rounded-full bg-background transition-transform',
                                                            isTeacher ? 'translate-x-4' : 'translate-x-0.5',
                                                        )}
                                                    />
                                                </button>
                                            </td>
                                            <td className="px-3 py-2 align-top">
                                                {!isTeacher ? (
                                                    <span className="text-[10px] text-muted-foreground">—</span>
                                                ) : (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {userQuals.map((q) => {
                                                            const subj = subjectById.get(q.subjectId);
                                                            return (
                                                                <span key={q.id} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                                                                    {subj?.label ?? q.subjectId}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeQual(q.id, s.matrixUserId)}
                                                                        disabled={rowBusy}
                                                                        className="ml-0.5 rounded-full hover:bg-primary/20 disabled:opacity-50"
                                                                        title="Fach entfernen"
                                                                    >
                                                                        <MaterialIcon name="close" size={10} />
                                                                    </button>
                                                                </span>
                                                            );
                                                        })}
                                                        {subjects.length > 0 && (
                                                            <div className="relative">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setAddOpenFor(addOpenFor === s.matrixUserId ? null : s.matrixUserId)}
                                                                    disabled={rowBusy}
                                                                    className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-primary/40 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/5 disabled:opacity-50"
                                                                >
                                                                    <MaterialIcon name="add" size={10} />
                                                                    Fach
                                                                </button>
                                                                {addOpenFor === s.matrixUserId && (
                                                                    <div className="absolute right-0 top-full z-10 mt-1 max-h-48 w-44 overflow-y-auto rounded-md border border-border bg-background p-1 shadow-md">
                                                                        {subjects
                                                                            .filter((subj) => !userQuals.some((q) => q.subjectId === subj.id))
                                                                            .map((subj) => (
                                                                                <button
                                                                                    key={subj.id}
                                                                                    type="button"
                                                                                    onClick={() => addQual(s.matrixUserId, subj.id)}
                                                                                    className="block w-full rounded px-2 py-1 text-left text-[11px] hover:bg-muted"
                                                                                >
                                                                                    {subj.label}
                                                                                </button>
                                                                            ))}
                                                                        {subjects.every((subj) => userQuals.some((q) => q.subjectId === subj.id)) && (
                                                                            <div className="px-2 py-1 text-[10px] text-muted-foreground">Alle Faecher zugeordnet.</div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                    type="checkbox"
                    checked={ui.form.skipTeacherWarning}
                    onChange={(e) =>
                        setupWizardStore.setForm({ skipTeacherWarning: e.target.checked })
                    }
                />
                {t('stundenplan.wizard_step4_skip', {
                    defaultValue: 'Spaeter bearbeiten — Auto-Plan-Score wird dann ungenau',
                })}
            </label>

            {/* Umkehr-Sicht: was decken die Lehrer von der Schul-Struktur ab? */}
            {!kennzahlen.loading && kennzahlen.teacherCount > 0 && (
                <ReverseSummary kennzahlen={kennzahlen} mode="teachers" />
            )}

            <HintBox>
                {t('stundenplan.wizard_step4_hint', {
                    defaultValue:
                        'Wenn Du Qualifikationen pflegst, kann der Auto-Plan z.B. „Frau Schmidt nur Mathe in Stufe 5-7" einhalten.',
                })}
            </HintBox>
        </div>
    );
}

function Step5Rooms(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const qc = useQueryClient();
    const kennzahlen = useWizardKennzahlen();

    const roomsQ = useQuery({
        queryKey: ['stundenplan-rooms'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listRooms(jwt);
        },
    });
    const rooms = roomsQ.data?.rooms ?? [];

    // Inline-Anlage analog zu Step 3 (Klassen):
    //   „R101, R102, R103" oder eine pro Zeile.
    //   Optional Tag-Annotation: „Sporthalle#sporthalle" → Label „Sporthalle", Tag „sporthalle".
    const [showForm, setShowForm] = useState(false);
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastCreated, setLastCreated] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    function parseRoomLines(input: string): Array<{ label: string; tags: string[] }> {
        const seen = new Set<string>();
        const out: Array<{ label: string; tags: string[] }> = [];
        for (const raw of input.split(/[,\n;]+/)) {
            const trimmed = raw.trim();
            if (!trimmed) continue;
            const [labelRaw, ...tagParts] = trimmed.split('#');
            const label = labelRaw.trim();
            if (!label) continue;
            const key = label.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const tags = tagParts.map((s) => s.trim()).filter(Boolean);
            out.push({ label, tags });
        }
        return out;
    }

    async function createRooms() {
        const parsed = parseRoomLines(text);
        if (parsed.length === 0) {
            setError('Bitte mindestens einen Raum-Namen eingeben.');
            return;
        }
        if (!jwt) {
            setError('Nicht eingeloggt — bitte Seite neu laden.');
            return;
        }
        setSaving(true);
        setError(null);
        setProgress({ done: 0, total: parsed.length });
        const created: string[] = [];
        try {
            for (const p of parsed) {
                await gateway.createRoom(jwt, { label: p.label, resourceTags: p.tags });
                created.push(p.label);
                setProgress({ done: created.length, total: parsed.length });
            }
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['stundenplan-rooms'] }),
                qc.invalidateQueries({ queryKey: ['stundenplan-readiness'] }),
            ]);
            setLastCreated(created.join(', '));
            setText('');
            setTimeout(() => setLastCreated(null), 5000);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const prefix = created.length > 0
                ? `${created.length}/${parsed.length} angelegt (${created.join(', ')}). Fehler bei „${parsed[created.length]?.label}": `
                : '';
            setError(prefix + msg);
            if (created.length > 0) {
                await qc.invalidateQueries({ queryKey: ['stundenplan-rooms'] });
                setText(parsed.slice(created.length).map((p) => p.tags.length > 0 ? `${p.label}#${p.tags.join('#')}` : p.label).join(', '));
            }
        } finally {
            setSaving(false);
            setProgress(null);
        }
    }

    const parsedCount = parseRoomLines(text).length;

    return (
        <div className="space-y-4">
            <StepHeader
                icon="meeting_room"
                title={t('stundenplan.wizard_step5_title', { defaultValue: 'Welche Räume gibt es?' })}
                intro={t('stundenplan.wizard_step5_intro_v2', {
                    defaultValue: 'Jeder Raum kann zur gleichen Stunde nur EINE Klasse (oder einen Lehrer) aufnehmen. Daher brauchst Du im Minimum so viele Stammräume wie Klassen — plus Spezialräume für Fächer wie Sport oder Eurythmie.',
                })}
            />

            {/* Bedarfs-Auswertung — sofort sichtbar */}
            {!kennzahlen.loading && (
                <RoomsCoverageBanner rooms={kennzahlen.rooms} />
            )}

            {/* Existierende Räume */}
            {roomsQ.isLoading ? (
                <p className="text-xs text-muted-foreground">…</p>
            ) : rooms.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {t('stundenplan.wizard_step5_empty', {
                        defaultValue: 'Noch keine Raeume. Lege wenigstens einen Raum an — sonst hat der Plan keinen Platz.',
                    })}
                </div>
            ) : (
                <div>
                    <div className="text-xs text-muted-foreground">
                        Gefunden: {rooms.length} {rooms.length === 1 ? 'Raum' : 'Räume'}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                        {rooms.map((r) => (
                            <li key={r.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                                <MaterialIcon name="meeting_room" size={11} />
                                {r.label}
                                {r.resourceTags.length > 0 && (
                                    <span className="ml-1 rounded bg-blue-100 px-1 text-[9px] text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                                        {r.resourceTags.join(',')}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Inline-Anlage mehrerer Räume */}
            {!showForm ? (
                <button
                    onClick={() => setShowForm(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                    <MaterialIcon name="add" size={14} />
                    Räume anlegen
                </button>
            ) : (
                <div className="rounded-md border border-border p-3 space-y-2">
                    <label className="block text-xs">
                        <span className="text-muted-foreground">
                            Raum-Namen — eine pro Zeile oder mit Komma getrennt. Tags mit „#": <code className="rounded bg-muted px-1">Sporthalle#sporthalle</code>
                        </span>
                        <textarea
                            autoFocus
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder={'R101\nR102\nR103\nSporthalle#sporthalle\nEurythmiesaal#eurythmiesaal\nWerkstatt#werkstatt'}
                            rows={5}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono"
                            onKeyDown={(e) => {
                                if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                                    e.preventDefault();
                                    void createRooms();
                                }
                                if (e.key === 'Escape') setShowForm(false);
                            }}
                        />
                        <span className="mt-1 block text-[10px] text-muted-foreground">
                            {parsedCount === 0
                                ? 'Beispiel: „R101, R102, Sporthalle#sporthalle" legt 3 Räume an. Strg+Enter zum Speichern.'
                                : `${parsedCount} Raum/Räume werden angelegt`}
                        </span>
                    </label>
                    {error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                            {error}
                        </div>
                    )}
                    {progress && (
                        <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                            <MaterialIcon name="hourglass_top" size={12} className="-mt-0.5 mr-1 inline" />
                            Lege {progress.done + 1}/{progress.total} an…
                        </div>
                    )}
                    {lastCreated && (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                            <MaterialIcon name="check_circle" size={12} className="-mt-0.5 mr-1 inline" />
                            Raum angelegt: <strong>{lastCreated}</strong>
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setShowForm(false); setLastCreated(null); }} className="rounded-md px-3 py-1 text-xs hover:bg-muted">
                            Fertig
                        </button>
                        <button
                            onClick={createRooms}
                            disabled={saving || parsedCount === 0}
                            className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? '…' : parsedCount > 1 ? `${parsedCount} anlegen` : 'Speichern'}
                        </button>
                    </div>
                </div>
            )}

            <HintBox>
                Ein Raum kann pro Stunde nur EINE Klasse aufnehmen. Bei zwei parallelen Sport-Stunden brauchst Du also zwei Sporthallen — der Solver weicht sonst auf Stammräume aus, was bei „Sport-Pflicht-Tag" zu Konflikten führt.
                Markiere Spezialräume mit Tags (<code className="rounded bg-muted px-1">sporthalle</code>, <code className="rounded bg-muted px-1">eurythmiesaal</code>, <code className="rounded bg-muted px-1">werkstatt</code>), die Fächer holen sich den passenden Raum dann automatisch.
            </HintBox>
        </div>
    );
}

/**
 * Banner mit Raum-Bedarfs-Auswertung:
 *  - Stammraum-Quote (have/needed = classCount)
 *  - Pro Spezial-Tag aus Subject.requiredResourceTags: have vs need
 */
function RoomsCoverageBanner({ rooms }: { rooms: ReturnType<typeof useWizardKennzahlen>['rooms'] }): JSX.Element {
    const stammraumStatus: 'ok' | 'warning' | 'blocker' =
        rooms.stammraumNeeded === 0 ? 'ok'
            : rooms.stammraumHave >= rooms.stammraumNeeded ? 'ok'
                : rooms.stammraumHave >= rooms.stammraumNeeded * 0.7 ? 'warning'
                    : 'blocker';
    const borderClr = stammraumStatus === 'ok' ? 'border-emerald-200 dark:border-emerald-900'
        : stammraumStatus === 'warning' ? 'border-amber-200 dark:border-amber-900'
            : 'border-red-200 dark:border-red-900';
    const bgClr = stammraumStatus === 'ok' ? 'bg-emerald-50/40 dark:bg-emerald-950/15'
        : stammraumStatus === 'warning' ? 'bg-amber-50/40 dark:bg-amber-950/15'
            : 'bg-red-50/40 dark:bg-red-950/15';
    return (
        <div className={cn('rounded-md border p-3 text-xs', borderClr, bgClr)}>
            <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">
                    <MaterialIcon name="meeting_room" size={13} className="-mt-0.5 mr-1 inline" />
                    Raum-Bedarf
                </span>
                <span className="text-[11px] text-muted-foreground">
                    Ein Raum = eine Klasse pro Stunde
                </span>
            </div>

            <div className="space-y-1.5">
                {/* Stammraum-Zeile */}
                <RoomCoverageRow
                    label="Stammräume (1 pro Klasse)"
                    have={rooms.stammraumHave}
                    need={rooms.stammraumNeeded}
                    status={stammraumStatus}
                    usedByLabel={rooms.stammraumNeeded > 0 ? `${rooms.stammraumNeeded} Klassen brauchen je einen Stammraum` : undefined}
                />
                {/* Spezialraum-Zeilen */}
                {rooms.specialRooms.map((r) => (
                    <RoomCoverageRow
                        key={r.tag}
                        label={`Spezialraum: ${r.tag}`}
                        have={r.have}
                        need={r.need}
                        status={r.status}
                        usedByLabel={r.usedBy.length > 0 ? `für: ${r.usedBy.join(', ')}` : undefined}
                    />
                ))}
                {rooms.specialRooms.length === 0 && rooms.stammraumNeeded > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                        Keine Fächer mit Spezialraum-Tag — der Solver legt alles in Stammräume.
                    </div>
                )}
            </div>
        </div>
    );
}

function RoomCoverageRow({ label, have, need, status, usedByLabel }: {
    label: string; have: number; need: number; status: 'ok' | 'warning' | 'blocker'; usedByLabel?: string;
}): JSX.Element {
    const ratio = need > 0 ? have / need : 1;
    const pct = Math.round(ratio * 100);
    const barClr = status === 'ok' ? 'bg-emerald-500'
        : status === 'warning' ? 'bg-amber-500'
            : 'bg-red-500';
    const icon = status === 'ok' ? 'check_circle' : status === 'warning' ? 'warning' : 'error';
    const iconClr = status === 'ok' ? 'text-emerald-600'
        : status === 'warning' ? 'text-amber-600'
            : 'text-red-600';
    return (
        <div className="flex items-center gap-2">
            <MaterialIcon name={icon} size={12} className={iconClr} />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-[11px]">
                    <span className="truncate">{label}</span>
                    <span className="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                        {have} / {need}
                    </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full', barClr)} style={{ width: `${Math.min(150, Math.max(0, pct))}%` }} />
                    </div>
                    <span className="w-8 text-right text-[9px] tabular-nums text-muted-foreground">{pct}%</span>
                </div>
                {usedByLabel && (
                    <div className="text-[10px] text-muted-foreground/80">{usedByLabel}</div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 6+7
// ═══════════════════════════════════════════════════════════════════════════

function Step6Stundentafel(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const ui = useSyncExternalStore(setupWizardStore.subscribe, setupWizardStore.getSnapshot);
    const qc = useQueryClient();
    const kennzahlen = useWizardKennzahlen();

    const templatesQ = useQuery({
        queryKey: ['stundenplan-lehrplaene'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listLehrplaene(jwt);
        },
    });
    const classesQ = useQuery({
        queryKey: ['stundenplan-class-spaces'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listClassSpaces(jwt);
        },
    });
    const sgHoursQ = useQuery({
        queryKey: ['stundenplan-subject-grade-hours'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listSubjectGradeHours(jwt);
        },
    });

    const template = (templatesQ.data?.templates ?? []).find((tpl) => tpl.key === ui.form.lehrplanKey);
    const classes = classesQ.data?.classes ?? [];
    const sgEntries = sgHoursQ.data?.entries ?? [];
    const classesWithEntries = new Set(sgEntries.map((e) => e.classSpaceId));
    const filledClassCount = classesWithEntries.size;

    const [mappingPreview, setMappingPreview] = useState<{
        mapped: Array<{ classSpaceId: string; gradeStageKey: string }>;
        unmapped: Array<{ classSpaceId: string; name: string; guessedStage: string | null }>;
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Apply-Status: hier kommt der eigentliche Schreib-Vorgang her,
    // nicht erst in Step 7. Damit der Verdict-Chip im Header sofort
    // auf gruen springt, wenn der User in Step 6 fertig ist.
    const [applying, setApplying] = useState(false);
    const [applyResult, setApplyResult] = useState<{ created: number; overwritten: number } | null>(null);
    const [overwrite, setOverwrite] = useState(false);

    async function applyNow() {
        if (!jwt || !ui.form.lehrplanKey || !mappingPreview) return;
        if (mappingPreview.mapped.length === 0) {
            setError('Keine Klasse konnte auf eine Stufe gemappt werden — Klassennamen pruefen.');
            return;
        }
        setApplying(true);
        setError(null);
        setApplyResult(null);
        try {
            const result = await gateway.applyLehrplan(jwt, ui.form.lehrplanKey, {
                classMappings: mappingPreview.mapped,
                overwrite,
            });
            setApplyResult({
                created: result.createdEntries,
                overwritten: result.overwrittenEntries,
            });
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['stundenplan-subject-grade-hours'] }),
                qc.invalidateQueries({ queryKey: ['stundenplan-readiness'] }),
                qc.invalidateQueries({ queryKey: ['stundenplan-subjects'] }),
            ]);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setApplying(false);
        }
    }

    useEffect(() => {
        if (!jwt || !ui.form.lehrplanKey || ui.form.skipLehrplan || classes.length === 0) {
            setMappingPreview(null);
            return;
        }
        let cancel = false;
        setLoading(true);
        gateway
            .autoMapLehrplan(jwt, ui.form.lehrplanKey, {
                classes: classes.map((c) => ({ classSpaceId: c.id, name: c.name })),
            })
            .then((r) => {
                if (!cancel) setMappingPreview(r);
            })
            .catch((e) => {
                if (!cancel) setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancel) setLoading(false);
            });
        return () => {
            cancel = true;
        };
    }, [jwt, ui.form.lehrplanKey, ui.form.skipLehrplan, classes.map((c) => c.id).join(',')]);

    return (
        <div className="space-y-4">
            <StepHeader
                icon="auto_stories"
                title={t('stundenplan.wizard_step6_title', { defaultValue: 'Stundentafel laden' })}
                intro={
                    ui.form.skipLehrplan
                        ? t('stundenplan.wizard_step6_intro_skip', {
                              defaultValue:
                                  'Du pflegst die Stundentafel manuell. Wir oeffnen Dir nach dem Anlegen direkt das Stundentafel-Panel.',
                          })
                        : t('stundenplan.wizard_step6_intro', {
                              defaultValue:
                                  'Wir ordnen Deine Klassen automatisch der Vorlage zu. Du kannst hinterher pro Klasse anpassen.',
                          })
                }
            />

            {ui.form.skipLehrplan ? (
                <HintBox>
                    {t('stundenplan.wizard_step6_skip_hint', {
                        defaultValue:
                            'Kein Stundentafel-Import. Du fuellst Mathe-4h-Deutsch-4h-… pro Klasse spaeter im Stammdaten-Panel.',
                    })}
                </HintBox>
            ) : !template && filledClassCount > 0 ? (
                // Stundentafel ist in der DB schon befuellt — nur die Wahl
                // der Quelle ist nicht im aktuellen Wizard-State.
                // Z.B. von einem frueheren Wizard-Lauf oder manueller Pflege.
                <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                    <MaterialIcon name="check_circle" size={13} className="-mt-0.5 mr-1 inline" />
                    <strong>Stundentafel ist bereits befuellt</strong> ({filledClassCount} von {classes.length} Klassen, {sgEntries.length} Eintraege).
                    Quelle nicht im aktuellen Wizard-Schritt gesetzt — vermutlich aus einem frueheren Lauf oder manuell gepflegt. Kein Handlungsbedarf.
                    Wenn Du mit einem anderen Lehrplan neu laden willst: zu Schritt 2 zurueck und Vorlage neu waehlen.
                </div>
            ) : !template ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <MaterialIcon name="warning" size={13} className="-mt-0.5 mr-1 inline" />
                    <strong>Stundentafel fehlt komplett</strong> — und keine Lehrplan-Vorlage gewählt.
                    Zurueck zu Schritt 2 und Bundesland/Schulform setzen, ODER die „manuell"-Checkbox aktivieren.
                    Ohne befuellte Stundentafel kann der Solver keinen Plan erstellen.
                </div>
            ) : loading ? (
                <p className="text-xs text-muted-foreground">…</p>
            ) : (
                <>
                    {/* Erklaerung was die Stundentafel ueberhaupt ist */}
                    <div className="rounded-md border border-sky-200 bg-sky-50/50 p-2 text-[11px] text-sky-900 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-200">
                        <MaterialIcon name="info" size={11} className="-mt-0.5 mr-0.5 inline" />
                        <strong>Stundentafel</strong> = pro Klasse × Fach hinterlegte Soll-Stunden pro Woche (z.B. „Klasse 5a · Deutsch · 4h"). Der Solver braucht das als Vorgabe.
                        „Laden" uebernimmt die Stundentafel aus dem Lehrplan-Template in einem Rutsch — Du kannst pro Klasse danach weiter anpassen.
                    </div>

                    <div className="rounded-md border border-border bg-card p-3 text-xs">
                        <div className="font-medium">{template.name}</div>
                        <div className="text-muted-foreground">
                            {template.bundesland} · {template.schulform}
                        </div>
                    </div>

                    {/* Aktueller Stundentafel-Status (live) */}
                    <div className={cn(
                        'rounded-md border p-2 text-[11px]',
                        filledClassCount === 0 ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20'
                            : filledClassCount < classes.length ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20'
                                : 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20',
                    )}>
                        <MaterialIcon
                            name={filledClassCount === classes.length ? 'check_circle' : 'pending'}
                            size={12}
                            className={cn('-mt-0.5 mr-0.5 inline', filledClassCount === classes.length ? 'text-emerald-600' : 'text-amber-600')}
                        />
                        <strong>{filledClassCount} von {classes.length} Klassen</strong> haben bereits Stundentafel-Eintraege ({sgEntries.length} Eintraege gesamt).
                    </div>

                    {mappingPreview && (
                        <div className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground">
                                {t('stundenplan.wizard_step6_mapping_label', {
                                    defaultValue: 'Auto-Mapping Deiner Klassen:',
                                })}
                            </div>
                            <ul className="space-y-0.5 text-xs">
                                {mappingPreview.mapped.map((m) => (
                                    <li key={m.classSpaceId} className="flex items-center gap-2">
                                        <MaterialIcon name="check" size={13} className="text-emerald-600" />
                                        {classes.find((c) => c.id === m.classSpaceId)?.name} → {' '}
                                        <span className="font-medium">Stufe {m.gradeStageKey}</span>
                                        {classesWithEntries.has(m.classSpaceId) && (
                                            <span className="rounded-full bg-emerald-100 px-1.5 py-0 text-[9px] text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                                                schon befuellt
                                            </span>
                                        )}
                                    </li>
                                ))}
                                {mappingPreview.unmapped.map((u) => (
                                    <li key={u.classSpaceId} className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                                        <MaterialIcon name="warning" size={13} />
                                        {u.name} {' '}
                                        ({t('stundenplan.wizard_step6_not_mapped', {
                                            defaultValue: 'keine passende Stufe',
                                        })})
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Apply-Knopf: das eigentliche Schreiben */}
                    {mappingPreview && mappingPreview.mapped.length > 0 && (
                        <div className="rounded-md border border-border p-3 space-y-2">
                            {filledClassCount > 0 && (
                                <label className="flex items-start gap-2 text-[11px]">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5"
                                        checked={overwrite}
                                        onChange={(e) => setOverwrite(e.target.checked)}
                                    />
                                    <span>
                                        Bereits existierende Stundentafel-Eintraege <strong>ueberschreiben</strong>
                                        <span className="block text-[10px] text-muted-foreground">
                                            Ohne Haken: vorhandene Klassen bleiben unangetastet, nur leere bekommen Eintraege.
                                        </span>
                                    </span>
                                </label>
                            )}
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] text-muted-foreground">
                                    Wird angelegt: ~{mappingPreview.mapped.length * 14} Eintraege ({mappingPreview.mapped.length} Klassen × Faecher der Stufe)
                                </div>
                                <button
                                    type="button"
                                    onClick={applyNow}
                                    disabled={applying || mappingPreview.mapped.length === 0}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                    <MaterialIcon
                                        name={applying ? 'autorenew' : 'auto_stories'}
                                        size={14}
                                        className={applying ? 'animate-spin' : ''}
                                    />
                                    {applying
                                        ? 'Lade…'
                                        : filledClassCount === 0
                                            ? 'Stundentafel jetzt laden'
                                            : `${overwrite ? 'Alle' : 'Fehlende'} Klassen nachladen`}
                                </button>
                            </div>
                            {applyResult && (
                                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                                    <MaterialIcon name="check_circle" size={12} className="-mt-0.5 mr-1 inline" />
                                    <strong>{applyResult.created} neue Eintraege</strong> angelegt
                                    {applyResult.overwritten > 0 && <span>, {applyResult.overwritten} ueberschrieben</span>}.
                                    Stundentafel ist jetzt befuellt — der Bereitschafts-Check oben aktualisiert sich.
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                            {error}
                        </div>
                    )}

                    {/* Live-Kennzahlen direkt in Step 6 — Solver-Bereitschaft wird sichtbar */}
                    {!kennzahlen.loading && filledClassCount > 0 && (
                        <KennzahlenBanner kennzahlen={kennzahlen} />
                    )}
                </>
            )}
        </div>
    );
}

function Step7Done(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const ui = useSyncExternalStore(setupWizardStore.subscribe, setupWizardStore.getSnapshot);
    const qc = useQueryClient();
    const kennzahlen = useWizardKennzahlen();

    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confettiFired, setConfettiFired] = useState(false);
    // Solver-Zeitbudget: User waehlt zwischen schnell (300s) und gruendlich (30 min)
    const [solveBudget, setSolveBudget] = useState(300);

    const classesQ = useQuery({
        queryKey: ['stundenplan-class-spaces'] as const,
        enabled: !!jwt,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listClassSpaces(jwt);
        },
    });

    // Wenn wir hier ankommen: Szenario evtl. noch nicht angelegt — automatisch
    // anlegen, dann (optional) Lehrplan anwenden.
    async function finalize(triggerSolver: boolean) {
        if (!jwt) return;
        setRunning(true);
        setError(null);
        try {
            // Pre-Flight wenn Solver angefordert
            if (triggerSolver) {
                // 0) Stundentafel — Pflicht. Ohne Eintraege gibt es nichts
                //    zu loesen, der Solver wuerde leere entries
                //    zurueckgeben. Wir pruefen direkt im sgHours-Cache.
                const sgEntries = qc.getQueryData<{ entries: unknown[] }>(['stundenplan-subject-grade-hours']);
                const haveStundentafel = (sgEntries?.entries.length ?? 0) > 0
                    || kennzahlen.demandSource === 'stundentafel';
                if (!haveStundentafel) {
                    throw new Error(
                        'Stundentafel ist leer. Zurueck zu Schritt 6 und „Stundentafel jetzt laden" klicken — sonst hat der Solver keinen Plan-Bedarf.',
                    );
                }
                // 1) Stammdaten-Readiness
                if (kennzahlen.readinessVerdict === 'blocked') {
                    throw new Error(
                        `Stammdaten unvollstaendig: ${kennzahlen.blockerSummaries.slice(0, 2).join('; ')}`,
                    );
                }
                // 2) Solver-Health
                try {
                    const r = await gateway.getSolverHealth(jwt);
                    if (r.health.status !== 'ok') {
                        throw new Error(`Solver-Service ist nicht bereit (Status: ${r.health.status}). ${r.health.error ?? ''}`);
                    }
                } catch (e) {
                    throw new Error(
                        `Solver-Service nicht erreichbar — bitte spaeter erneut versuchen.\n${e instanceof Error ? e.message : ''}`,
                    );
                }
            }

            let scenarioId = ui.createdScenarioId;

            // 1. Szenario anlegen falls nicht vorhanden
            if (!scenarioId) {
                const r = await gateway.createScenario(jwt, { name: ui.form.name.trim() });
                scenarioId = r.scenario.id;
                setupWizardStore.setCreatedScenarioId(scenarioId);
                await qc.invalidateQueries({ queryKey: ['stundenplan-scenarios'] });
                stundenplanStore.setScenarioId(scenarioId);
            }

            // 2. Lehrplan anwenden (wenn gewuenscht + Mapping moeglich)
            if (!ui.form.skipLehrplan && ui.form.lehrplanKey) {
                const classes = classesQ.data?.classes ?? [];
                if (classes.length > 0) {
                    const mapping = await gateway.autoMapLehrplan(jwt, ui.form.lehrplanKey, {
                        classes: classes.map((c) => ({ classSpaceId: c.id, name: c.name })),
                    });
                    if (mapping.mapped.length > 0) {
                        await gateway.applyLehrplan(jwt, ui.form.lehrplanKey, {
                            classMappings: mapping.mapped,
                            overwrite: false,
                        });
                    }
                }
            }

            // 3. Optional Auto-Plan starten — Job-ID speichern fuer Live-Status
            if (triggerSolver && scenarioId) {
                // Default-Timeout: 180s — bei realistischen Schulen (20+ Klassen,
                // 200+ Stundentafel-Eintraegen) braucht der CP-SAT-Modellaufbau
                // allein 60–120s. 60s waren regelmaessig zu wenig.
                const job = await gateway.createSolveJob(jwt, { scenarioId, timeoutSeconds: solveBudget });
                setupWizardStore.setForm({ finalSolveJobId: job.job.id });
                stundenplanStore.setScenarioId(scenarioId);
            }

            // 4. Confetti — Wizard bleibt offen, damit der User den Job-
            //    Fortschritt sieht. Schliessen via Knopf oder bei
            //    Done/Failed automatisch.
            if (!confettiFired && triggerSolver) {
                fireConfetti();
                setConfettiFired(true);
            }
            // Nur wenn KEIN Solver getriggert wurde: direkt schliessen.
            if (!triggerSolver) {
                setTimeout(() => setupWizardStore.finish(), 800);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setRunning(false);
        }
    }

    return (
        <div className="space-y-4 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <MaterialIcon name="celebration" size={32} />
            </div>
            <h2 className="text-lg font-semibold">
                {t('stundenplan.wizard_step7_title', {
                    defaultValue: 'Glueckwunsch — fast geschafft!',
                })}
            </h2>
            <p className="text-xs text-muted-foreground">
                {t('stundenplan.wizard_step7_intro', {
                    defaultValue:
                        'Du hast alle Stammdaten zusammen. Jetzt entscheidest Du: gleich Auto-Plan starten oder erst selbst nachschauen.',
                })}
            </p>

            <ul className="mx-auto inline-block space-y-1 text-left text-xs">
                <li className="flex items-center gap-2">
                    <MaterialIcon name="check_circle" size={13} className="text-emerald-600" />
                    {t('stundenplan.wizard_step7_summary_name', { defaultValue: 'Name' })}: {' '}
                    <span className="font-medium">{ui.form.name}</span>
                </li>
                {!ui.form.skipLehrplan && ui.form.lehrplanKey && (
                    <li className="flex items-center gap-2">
                        <MaterialIcon name="check_circle" size={13} className="text-emerald-600" />
                        {t('stundenplan.wizard_step7_summary_template', { defaultValue: 'Vorlage' })}: {' '}
                        <span className="font-medium">{ui.form.lehrplanKey}</span>
                    </li>
                )}
                <li className="flex items-center gap-2">
                    <MaterialIcon name="check_circle" size={13} className="text-emerald-600" />
                    {classesQ.data?.classes?.length ?? 0} {t('stundenplan.classes_plural', { defaultValue: 'Klassen' })}
                </li>
            </ul>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    {error}
                </div>
            )}

            {/* Live-Job-Status — wenn ein Solve-Job laeuft */}
            {ui.form.finalSolveJobId && (
                <SolveJobStatus
                    jobId={ui.form.finalSolveJobId}
                    onDone={() => { /* User entscheidet selbst wann er schliesst */ }}
                />
            )}

            {/* Bereitschafts-Check + Auto-Plan-Knopf nur sichtbar wenn noch kein Job laeuft */}
            {!ui.form.finalSolveJobId && (
                <>
                    {!kennzahlen.loading && (kennzahlen.demandHours > 0 || kennzahlen.teacherCount > 0) && (
                        <div className="text-left">
                            <KennzahlenBanner kennzahlen={kennzahlen} />
                        </div>
                    )}

                    {/* Solver-Zeitbudget */}
                    <div className="rounded-md border border-border bg-muted/30 p-3 text-left text-xs">
                        <div className="mb-1 flex items-center justify-between">
                            <span className="font-medium">Solver-Zeitbudget</span>
                            <span className="tabular-nums text-muted-foreground">
                                {solveBudget < 60 ? `${solveBudget}s`
                                    : solveBudget < 3600 ? `${Math.round(solveBudget / 60)} Min`
                                        : `${(solveBudget / 3600).toFixed(1)} Std`}
                            </span>
                        </div>
                        <input
                            type="range"
                            min={60} max={1800} step={60}
                            value={solveBudget}
                            onChange={(e) => setSolveBudget(parseInt(e.target.value, 10))}
                            className="w-full"
                        />
                        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                            <span>schnell · 1 Min</span>
                            <span>gruendlich · 30 Min</span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                            {solveBudget <= 300 && 'Reicht fuer kleine Schulen (≤10 Klassen).'}
                            {solveBudget > 300 && solveBudget <= 900 && 'Empfohlen fuer mittlere Schulen (10-25 Klassen).'}
                            {solveBudget > 900 && 'Fuer grosse oder enge Stundentafeln. Du kannst den Tab schliessen — Status laeuft im Hintergrund weiter.'}
                        </div>
                    </div>

                    <div className="space-y-2 pt-2">
                        <button
                            onClick={() => finalize(true)}
                            disabled={running || kennzahlen.readinessVerdict === 'blocked'}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            title={kennzahlen.readinessVerdict === 'blocked'
                                ? `Auto-Plan blockiert: ${kennzahlen.blockerSummaries.slice(0, 3).join('; ')}`
                                : undefined}
                        >
                            <MaterialIcon
                                name={running ? 'autorenew' : kennzahlen.readinessVerdict === 'blocked' ? 'block' : 'auto_awesome'}
                                size={16}
                                className={running ? 'animate-spin' : ''}
                            />
                            {running
                                ? t('stundenplan.wizard_step7_busy', { defaultValue: 'Wird angelegt…' })
                                : kennzahlen.readinessVerdict === 'blocked'
                                    ? `Auto-Plan blockiert (${kennzahlen.blockerCount} Blocker)`
                                    : t('stundenplan.wizard_step7_action_auto', {
                                        defaultValue: 'Auto-Plan starten (1 Knopfdruck)',
                                    })}
                        </button>
                        <button
                            onClick={() => finalize(false)}
                            disabled={running}
                            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                        >
                            {kennzahlen.readinessVerdict === 'blocked'
                                ? 'Trotzdem Szenario anlegen — Plan spaeter starten'
                                : t('stundenplan.wizard_step7_action_manual', {
                                    defaultValue: 'Lieber zuerst manuell anschauen',
                                })}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Live-Status fuer einen laufenden SolveJob. Polled alle 2s solange
 * der Job in queued/running ist. Zeigt Status-Phase, Progress-Balken
 * und bei Done/Failed eine entsprechende Folge-Aktion.
 */
function SolveJobStatus({ jobId, onDone }: { jobId: string; onDone: () => void }): JSX.Element {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [elapsed, setElapsed] = useState(0);
    const startedAtRef = useMemo(() => ({ at: Date.now() }), []);

    const jobQ = useQuery({
        queryKey: ['stundenplan-solve-job', jobId] as const,
        enabled: !!jwt,
        queryFn: async () => gateway.getSolveJob(jwt!, jobId),
        refetchInterval: (q) => {
            const job = (q.state.data as { job: import('@/gateways/platform/stundenplan-gateway').SolveJob } | undefined)?.job;
            if (!job) return 2000;
            return (job.status === 'queued' || job.status === 'running') ? 2000 : false;
        },
        refetchIntervalInBackground: true,
    });

    // Stop-Uhr: solange Status queued/running → Sekunden hochzaehlen
    const job = jobQ.data?.job;
    useEffect(() => {
        if (!job) return;
        if (job.status !== 'queued' && job.status !== 'running') return;
        const i = window.setInterval(() => {
            setElapsed(Math.floor((Date.now() - startedAtRef.at) / 1000));
        }, 1000);
        return () => window.clearInterval(i);
    }, [job?.status, startedAtRef]);

    useEffect(() => {
        if (job && (job.status === 'done' || job.status === 'failed')) {
            onDone();
        }
    }, [job?.status, onDone, job]);

    if (jobQ.isLoading && !job) {
        return <SolveSkeleton message="Job wird gestartet …" />;
    }
    if (!job) {
        return (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                Konnte Job-Status nicht laden.
            </div>
        );
    }

    const statusLabel = {
        queued: 'In Warteschlange — Worker greift gleich zu',
        running: 'Solver arbeitet',
        done: 'Plan ist fertig',
        failed: 'Solver-Fehler',
        cancelled: 'Abgebrochen',
    }[job.status];

    const statusIcon = {
        queued: 'schedule',
        running: 'autorenew',
        done: 'check_circle',
        failed: 'error',
        cancelled: 'cancel',
    }[job.status];

    const borderClr = job.status === 'done' ? 'border-emerald-200 dark:border-emerald-900'
        : job.status === 'failed' ? 'border-red-200 dark:border-red-900'
            : job.status === 'cancelled' ? 'border-muted'
                : 'border-sky-200 dark:border-sky-900';
    const bgClr = job.status === 'done' ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
        : job.status === 'failed' ? 'bg-red-50/50 dark:bg-red-950/20'
            : job.status === 'cancelled' ? 'bg-muted/30'
                : 'bg-sky-50/50 dark:bg-sky-950/20';
    const iconClr = job.status === 'done' ? 'text-emerald-600'
        : job.status === 'failed' ? 'text-red-600'
            : job.status === 'cancelled' ? 'text-muted-foreground'
                : 'text-sky-600';
    const barClr = job.status === 'done' ? 'bg-emerald-500'
        : job.status === 'failed' ? 'bg-red-500'
            : job.status === 'cancelled' ? 'bg-muted-foreground/40'
                : 'bg-sky-500';
    const isActive = job.status === 'queued' || job.status === 'running';
    const progress = Math.max(0, Math.min(100, job.progress ?? 0));

    async function cancelJob() {
        if (!jwt) return;
        if (!confirm('Solver-Job wirklich abbrechen?')) return;
        try { await gateway.cancelSolveJob(jwt, jobId); jobQ.refetch(); } catch (e) { alert(String(e)); }
    }

    return (
        <div className={cn('rounded-md border p-3 text-left text-xs', borderClr, bgClr)}>
            <div className="mb-2 flex items-center gap-2">
                <MaterialIcon
                    name={statusIcon}
                    size={16}
                    className={cn(iconClr, job.status === 'running' && 'animate-spin')}
                />
                <span className="font-medium">{statusLabel}</span>
                {isActive && (
                    <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                        {elapsed}s · max {job.timeoutSeconds}s
                    </span>
                )}
                {job.finishedAt && (
                    <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                        {Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt ?? job.createdAt).getTime()) / 1000)}s
                    </span>
                )}
            </div>

            {/* Progress-Bar */}
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn('h-full transition-all', barClr, isActive && progress === 0 && 'animate-pulse')}
                    style={{ width: `${Math.max(progress, isActive ? 5 : 0)}%` }}
                />
            </div>
            <div className="mt-1 flex items-baseline justify-between text-[10px] text-muted-foreground">
                <span>
                    {job.status === 'queued' && 'Wartet auf freien Worker …'}
                    {job.status === 'running' && `Sucht Loesung — laeuft bis zu ${job.timeoutSeconds}s, Modellaufbau zaehlt mit`}
                    {job.status === 'done' && (
                        <>
                            {job.result?.entries.length ?? 0} Zuweisungen
                            {(job.result?.unplaced.length ?? 0) > 0 &&
                                ` · ${job.result?.unplaced.length} ungeplant`}
                            {job.result?.status && job.result.status !== 'optimal' &&
                                ` · ${job.result.status}`}
                        </>
                    )}
                    {job.status === 'failed' && job.error}
                    {job.status === 'cancelled' && 'Vom User abgebrochen'}
                </span>
                <span className="tabular-nums">{progress}%</span>
            </div>

            {/* Aktionen */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
                {isActive && (
                    <button
                        type="button"
                        onClick={cancelJob}
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
                    >
                        <MaterialIcon name="cancel" size={12} />
                        Abbrechen
                    </button>
                )}
                {job.status === 'done' && (
                    <>
                        <button
                            type="button"
                            onClick={() => setupWizardStore.finish()}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-700"
                        >
                            <MaterialIcon name="visibility" size={13} />
                            Plan ansehen
                        </button>
                        <button
                            type="button"
                            onClick={() => setupWizardStore.finish()}
                            className="text-[11px] text-muted-foreground hover:underline"
                        >
                            Wizard schliessen
                        </button>
                    </>
                )}
                {job.status === 'failed' && (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setupWizardStore.setForm({ finalSolveJobId: null });
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            <MaterialIcon name="refresh" size={13} />
                            Erneut versuchen
                        </button>
                        <button
                            type="button"
                            onClick={() => setupWizardStore.finish()}
                            className="text-[11px] text-muted-foreground hover:underline"
                        >
                            Wizard schliessen
                        </button>
                    </>
                )}
                {job.status === 'cancelled' && (
                    <button
                        type="button"
                        onClick={() => {
                            setupWizardStore.setForm({ finalSolveJobId: null });
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <MaterialIcon name="refresh" size={13} />
                        Neu starten
                    </button>
                )}
            </div>
        </div>
    );
}

function SolveSkeleton({ message }: { message: string }): JSX.Element {
    return (
        <div className="rounded-md border border-sky-200 bg-sky-50/50 p-3 text-left text-xs dark:border-sky-900 dark:bg-sky-950/20">
            <div className="mb-2 flex items-center gap-2">
                <MaterialIcon name="autorenew" size={16} className="animate-spin text-sky-600" />
                <span className="font-medium">{message}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full animate-pulse bg-sky-500" style={{ width: '20%' }} />
            </div>
        </div>
    );
}

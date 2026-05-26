/**
 * Notfall-Auslöser — Panic-Pattern
 *
 * Drei Komponenten:
 *  - openPanic()          → globale Funktion, oeffnet das Overlay
 *  - <PanicTriggerDesktop /> → Pill im AppHeader (neben Avatar)
 *  - <PanicOverlay />     → Vollbild-Picker + Countdown (wird einmal im Shell gerendert)
 *
 * Mobile: kein sichtbarer Button. Auslöser ist 5x-Tap auf die Top-Bar
 * innerhalb von 2 Sekunden (wird separat in MobileTopBar integriert und
 * ruft openPanic() auf).
 *
 * Phase 1: Scenarios hardcoded, Trigger = Toast.
 * Phase 2: Scenarios aus crisisGateway, Trigger = activateConfirm.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, Baby, Flame, Shield, HeartPulse, Search, Loader2, Mic, MicOff } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { sessionStore } from '@/core/session/session-store';
import { createCrisisGateway, type CrisisScenario } from '@/features/crisis/crisis-gateway';
import { useT } from "@/lib/i18n/use-t";

const crisisGateway = createCrisisGateway();

/**
 * Szenarien kommen vom Backend (tenant-spezifisch). Jeder Kunde
 * konfiguriert seine eigenen Notfallplaene im Admin-Portal.
 * Das Icon leiten wir aus `nameSlug` / `type` ab — im Schema gibt's
 * (noch) kein Icon-Feld.
 */
function pickIcon(s: CrisisScenario): React.ComponentType<{ className?: string }> {
    const slug = (s.nameSlug ?? '').toLowerCase();
    const type = (s.type ?? '').toLowerCase();
    const blob = `${slug} ${type}`;
    if (blob.includes('kind') && (blob.includes('wohl') || blob.includes('schutz'))) return Baby;
    if (blob.includes('amok') || blob.includes('gewalt') || blob.includes('eindring')) return Shield;
    if (blob.includes('brand') || blob.includes('feuer')) return Flame;
    if (blob.includes('med') || blob.includes('gesund') || blob.includes('unfall')) return HeartPulse;
    if (blob.includes('vermisst') || blob.includes('such')) return Search;
    return AlertTriangle;
}

const PANIC_EVENT = 'prilog:open-panic';

export function openPanic() {
    window.dispatchEvent(new CustomEvent(PANIC_EVENT));
}

// ─── Desktop-Trigger (inline, fuer AppHeader) ────────────────────────────────

export function PanicTriggerDesktop() {
    const t = useT();
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.altKey && (e.key === 'n' || e.key === 'N')) {
                e.preventDefault();
                openPanic();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <button
            type="button"
            onClick={() => openPanic()}
            aria-label={t('emergency.panic_button.notfall_ausloesen_strgaltn')}
            title={t('emergency.panic_button.notfall_strgaltn')}
            className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition-colors hover:bg-red-700"
        >
            <MaterialIcon name="warning" size={16} className="size-3.5" />
            <span>{t('emergency.panic_button.notfall')}</span>
        </button>
    );
}

// ─── Mobile-5x-Tap Hook (wird in MobileTopBar verwendet) ─────────────────────

/**
 * useFiveTapTrigger — registriert einen Fuenf-Tap-Gesture-Handler auf dem
 * ElementRef. Fuenf Taps innerhalb von 2 Sekunden loesen openPanic() aus.
 *
 * Bewusst keine Visuals/Icon auf Mobile: Lee moechte keinen dominanten
 * Button im Alltag. Das Wissen "5x auf die Top-Bar tippen" muss
 * vorher kommuniziert werden (z.B. im Onboarding oder Settings-Hinweis).
 */
export function attachFiveTapHandler(el: HTMLElement | null): () => void {
    if (!el) return () => { };
    const taps: number[] = [];
    const onTap = () => {
        const now = Date.now();
        taps.push(now);
        // alles vor 1.2s entfernen — enger Zeitfenster, damit normale
        // Navigations-Taps (Hub-Icons) nicht versehentlich triggern.
        while (taps.length > 0 && now - taps[0] > 1200) taps.shift();
        if (taps.length >= 5) {
            taps.length = 0;
            openPanic();
        }
    };
    el.addEventListener('click', onTap);
    return () => el.removeEventListener('click', onTap);
}

// ─── Overlay + Countdown (im Shell einmal gemountet) ────────────────────────

export function PanicOverlay() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = () => setOpen(true);
        window.addEventListener(PANIC_EVENT, handler);
        return () => window.removeEventListener(PANIC_EVENT, handler);
    }, []);

    if (!open) return null;
    return <ScenarioPicker onClose={() => setOpen(false)} />;
}

function ScenarioPicker({ onClose }: { onClose: () => void }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? null;

    const [pending, setPending] = useState<{ scenario: CrisisScenario; isTest: boolean } | null>(null);
    const [scenarios, setScenarios] = useState<CrisisScenario[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose, pending]);

    useEffect(() => {
        if (!jwt) return;
        crisisGateway.getScenarios(jwt, true)
            .then((res) => setScenarios(res.items))
            .catch((e) => setLoadError(e instanceof Error ? e.message : 'Fehler beim Laden'));
    }, [jwt]);

    if (pending) return (
        <Countdown
            scenario={pending.scenario}
            isTest={pending.isTest}
            onAbort={() => setPending(null)}
            onDone={onClose}
        />
    );

    return (
        <div className="fixed inset-0 z-[80] flex flex-col bg-background">
            <div className="flex items-center justify-between border-b border-red-600/20 bg-red-600/5 px-4 py-3">
                <div>
                    <h2 className="text-lg font-bold text-red-700 dark:text-red-400">{t('emergency.panic_button.notfall_ausloesen')}</h2>
                    <p className="text-xs text-muted-foreground">{t('emergency.panic_button.waehle_das_passende_szenario')}</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={t('emergency.panic_button.abbrechen')}
                >
                    <MaterialIcon name="close" size={16} className="size-6" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                {scenarios === null && !loadError && (
                    <div className="flex justify-center p-10">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                )}
                {loadError && (
                    <p className="p-6 text-center text-sm text-destructive">{loadError}</p>
                )}
                {scenarios && scenarios.length === 0 && (
                    <div className="mx-auto max-w-md p-6 text-center">
                        <MaterialIcon name="warning" size={16} className="mx-auto mb-3 size-10 text-muted-foreground" />
                        <p className="text-sm font-medium">{t('emergency.panic_button.keine_notfall-szenarien_konfiguriert')}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                            {t('emergency.panic_button.der_admin_kann_szenarien_im_portal_unter')}
                        </p>
                    </div>
                )}
                {scenarios && scenarios.length > 0 && (
                    <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3">
                        {scenarios.map((s) => (
                            <ScenarioTile
                                key={s.id}
                                scenario={s}
                                onTrigger={(isTest) => setPending({ scenario: s, isTest })}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="border-t p-3 text-center text-xs text-muted-foreground">
                {t('emergency.panic_button.tipp')} <strong>{t('emergency.panic_button.lang_druecken')}</strong> {t('emergency.panic_button.auf_eine_kachel_startet_die_uebung_keine')} <kbd className="rounded border px-1">{t('emergency.panic_button.esc')}</kbd>.
            </div>
        </div>
    );
}

function ScenarioTile({ scenario, onTrigger }: { scenario: CrisisScenario; onTrigger: (isTest: boolean) => void }) {
    const Icon = pickIcon(scenario);
    const pressTimer = useRef<number | null>(null);
    const wasLong = useRef(false);

    const clearTimer = () => {
        if (pressTimer.current) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    const startPress = () => {
        wasLong.current = false;
        clearTimer();
        pressTimer.current = window.setTimeout(() => {
            wasLong.current = true;
            onTrigger(true); // Probe-Modus
        }, 600);
    };
    const endPress = () => {
        clearTimer();
    };
    const handleClick = () => {
        if (wasLong.current) return; // Long-Press hat bereits getriggert
        onTrigger(false);
    };

    return (
        <button
            type="button"
            onPointerDown={startPress}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onPointerLeave={endPress}
            onClick={handleClick}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
                'flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border-2 border-red-600/20 bg-red-600/5 p-4',
                'transition-all active:scale-95 active:bg-red-600/15 hover:bg-red-600/10',
                'select-none',
            )}
        >
            <Icon className="size-12 text-red-600 dark:text-red-400" />
            <span className="text-center text-base font-semibold leading-tight">{scenario.name}</span>
        </button>
    );
}

function Countdown({ scenario, isTest, onAbort, onDone }: { scenario: CrisisScenario; isTest: boolean; onAbort: () => void; onDone: () => void }) {
    const t = useT();
    const [seconds, setSeconds] = useState(5);
    const [firing, setFiring] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [eventId, setEventId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const noteRef = useRef('');
    noteRef.current = note;
    const [recording, setRecording] = useState(false);
    const recogRef = useRef<any>(null);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const startRec = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        try {
            const r = new SR();
            r.lang = 'de-DE';
            r.interimResults = true;
            r.continuous = true;
            r.onresult = (e: any) => {
                let text = '';
                for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
                setNote(text.trim());
            };
            r.onerror = () => setRecording(false);
            r.onend = () => setRecording(false);
            r.start();
            recogRef.current = r;
            setRecording(true);
        } catch { /* unsupported */ }
    };
    const stopRec = () => {
        try { recogRef.current?.stop(); } catch { }
        setRecording(false);
    };

    useEffect(() => {
        if (firing || error || eventId) return;
        if (seconds <= 0) {
            setFiring(true);
            if (!jwt) {
                setError('Nicht angemeldet.');
                return;
            }
            // Haptic-Feedback bei Auslösung — nur wenn nicht silent.
            if (!scenario.silent && !isTest && typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }
            stopRec();
            crisisGateway.activateConfirm(jwt, scenario.id, noteRef.current.trim() || undefined, isTest)
                .then((res) => setEventId(res.eventId))
                .catch((e) => setError(e instanceof Error ? e.message : 'Auslösung fehlgeschlagen'));
            return;
        }
        const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [seconds, scenario, jwt, firing, error, eventId, isTest]);

    if (eventId) {
        return <NextStep scenario={scenario} isTest={isTest} onClose={onDone} />;
    }

    const Icon = pickIcon(scenario);
    const bg = isTest ? 'bg-amber-600' : (scenario.silent ? 'bg-slate-800' : 'bg-red-600');
    const textAccent = isTest ? 'text-amber-700' : (scenario.silent ? 'text-slate-800' : 'text-red-700');

    return (
        <div className={cn('fixed inset-0 z-[80] flex flex-col items-center justify-center p-6 text-white', bg)}>
            {isTest && (
                <div className="mb-4 rounded-full bg-white/20 px-4 py-1 text-sm font-bold uppercase tracking-wider">
                    {t('emergency.panic_button.uebung')}
                </div>
            )}
            {!isTest && scenario.silent && (
                <div className="mb-4 rounded-full bg-white/20 px-4 py-1 text-sm font-bold uppercase tracking-wider">
                    {t('emergency.panic_button.stille_ausloesung')}
                </div>
            )}
            <Icon className="mb-4 size-20 animate-pulse" />
            <p className="text-center text-xl font-medium">
                {firing ? 'Wird ausgelöst …' : 'Wird ausgelöst'}
            </p>
            <p className="mt-2 text-center text-3xl font-bold">{scenario.name}</p>
            {!firing && !error ? (
                <p className="mt-8 text-7xl font-bold tabular-nums">{seconds}</p>
            ) : firing ? (
                <Loader2 className="mt-8 size-14 animate-spin" />
            ) : null}

            {/* Sprach-Dictat fuer Aktivierungsnotiz */}
            {!firing && !error && (
                <div className="mt-6 w-full max-w-md">
                    <button
                        type="button"
                        onClick={recording ? stopRec : startRec}
                        className={cn(
                            'flex w-full items-center justify-center gap-2 rounded-xl bg-white/15 py-3 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/25',
                            recording && 'animate-pulse',
                        )}
                    >
                        {recording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                        {recording ? 'Aufnahme läuft – tippe zum Stoppen' : 'Notiz diktieren (optional)'}
                    </button>
                    {note && (
                        <p className="mt-2 max-h-20 overflow-auto rounded-md bg-white/10 px-3 py-2 text-left text-xs">
                            {note}
                        </p>
                    )}
                </div>
            )}

            {error && (
                <p className="mt-4 max-w-md rounded-lg bg-white/10 px-4 py-2 text-center text-sm">
                    {error}
                </p>
            )}
            <button
                type="button"
                onClick={onAbort}
                className={cn(
                    'mt-10 w-full max-w-md rounded-2xl bg-white py-6 text-2xl font-bold shadow-xl transition-transform active:scale-95 disabled:opacity-60',
                    textAccent,
                )}
                disabled={firing}
            >
                {error ? 'SCHLIESSEN' : 'ABBRECHEN'}
            </button>
        </div>
    );
}

// ─── Nächster-Schritt-Anzeige nach erfolgreicher Auslösung ──────────────────

function NextStep({ scenario, isTest, onClose }: { scenario: CrisisScenario; isTest: boolean; onClose: () => void }) {
    const t = useT();
    const [stepIndex, setStepIndex] = useState(0);
    const steps = (scenario.checklistItems ?? []).slice().sort((a, b) => a.order - b.order);
    const step = steps[stepIndex];
    const extContact = (scenario.externalContacts ?? [])[0];
    const Icon = pickIcon(scenario);

    if (!step) {
        // Keine Checklisten-Items → nur Bestätigung
        return (
            <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-emerald-700 p-6 text-white">
                <Icon className="mb-4 size-20" />
                <p className="text-2xl font-bold">{t('emergency.panic_button.ausgeloest')}</p>
                <p className="mt-2 text-center text-lg">{scenario.name}{isTest && ' (Übung)'}</p>
                <p className="mt-4 max-w-md text-center text-sm opacity-90">{t('emergency.panic_button.team_wird_informiert')}</p>
                <button
                    type="button"
                    onClick={onClose}
                    className="mt-10 w-full max-w-md rounded-2xl bg-white py-6 text-2xl font-bold text-emerald-700 shadow-xl transition-transform active:scale-95"
                >
                    SCHLIESSEN
                </button>
            </div>
        );
    }

    const isLast = stepIndex >= steps.length - 1;

    return (
        <div className="fixed inset-0 z-[80] flex flex-col bg-background">
            {/* Header */}
            <div className={cn('border-b px-4 py-3', isTest ? 'bg-amber-600' : 'bg-red-600')}>
                <div className="flex items-center justify-between text-white">
                    <div>
                        <p className="text-xs uppercase tracking-wider opacity-90">{isTest ? t('common.exercise') : 'Aktiver Notfall'}</p>
                        <p className="text-lg font-bold">{scenario.name}</p>
                    </div>
                    <div className="text-right text-xs opacity-90">
                        <p>{t('emergency.panic_button.schritt')} {stepIndex + 1} / {steps.length}</p>
                    </div>
                </div>
            </div>

            {/* Nächster Schritt */}
            <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('emergency.panic_button.naechster_schritt')}
                </p>
                <p className="max-w-md text-center text-3xl font-bold leading-tight">{step.title}</p>
                {step.assignedRole && (
                    <p className="text-sm text-muted-foreground">{t('emergency.panic_button.zustaendig')} {step.assignedRole}</p>
                )}

                {/* Schnellwahl: wenn externer Kontakt mit Telefonnummer */}
                {stepIndex === 0 && extContact?.phone && (
                    <a
                        href={`tel:${extContact.phone.replace(/\s+/g, '')}`}
                        className="flex w-full max-w-md items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-5 text-xl font-bold text-white shadow-lg active:scale-95"
                    >
                        📞 {extContact.label}: {extContact.phone}
                    </a>
                )}
            </div>

            {/* Aktionen */}
            <div className="border-t p-4">
                <div className="mx-auto flex max-w-md gap-2">
                    <button
                        type="button"
                        onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
                        disabled={isLast}
                        className="flex-1 rounded-xl bg-primary py-4 text-base font-bold text-primary-foreground shadow transition-transform active:scale-95 disabled:opacity-40"
                    >
                        {t('emergency.panic_button.erledigt_weiter')}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border px-4 py-4 text-sm text-muted-foreground hover:bg-muted"
                    >
                        {t('emergency.panic_button.schliessen')}
                    </button>
                </div>
            </div>
        </div>
    );
}

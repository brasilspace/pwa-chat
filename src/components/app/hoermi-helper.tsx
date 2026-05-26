/**
 * HoermiHelper — Audio-Hilfe als kleines Persona-Symbol im Header.
 *
 * Klick auf das Headphones-Icon oeffnet einen Mini-Player mit dem
 * Hoermi-Mia-Dialog zur aktuellen Sektion. Welche mp3 + Cue-Liste
 * gespielt wird, ergibt sich aus der aktuellen Route:
 *
 *   1. Match in audioGuideApi.listRoutes() → DB-AudioGuide laden
 *      (presigned URL + persistierte Cues).
 *   2. Kein Match → lokales Hauptmenue-mp3 + hardcodierte Hub-Cues
 *      (Default-Tutorial fuer "/" und alles, was nicht explizit
 *      gemappt ist).
 *
 * Wiedergabe:
 *   - DB-Cues haben `iconName` (Lucide-Name). Wenn der Name einem
 *     Hub-Icon entspricht, wird der zugehoerige Hub-Key an den
 *     hoermiCueStore publiziert → Sidebar-Icon leuchtet auf.
 *   - DB-Cues mit `actionType=navigate-url` und internem Pfad
 *     navigieren waehrend der Wiedergabe automatisch.
 *   - Fallback-Cues (Hauptmenue) sind hub-typisiert wie bisher.
 *
 * Discovery-Pulse: wenn fuer die aktuelle Route ein noch nicht
 * gehoerter Guide existiert, pulsiert das Icon einmalig (lokal in
 * localStorage als "schon gehoert" persistiert).
 */

import { useEffect, useRef, useState, useSyncExternalStore, type JSX } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Headphones, Pause } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { sessionStore } from '@/core/session/session-store';
import { hoermiPrefStore } from './hoermi-pref-store';
import { hoermiCueStore, findActiveCue, HUB_URLS, type HoermiCue, type CueTarget, type HubKey } from './hoermi-cue-store';
import { hoermiPlaybackStore } from './hoermi-playback-store';
import { audioGuideApi, matchRoute, type AudioGuideCueRecord } from '@/features/audio-guide/use-audio-guide';
import { audioGuideActionStore } from '@/components/audio-guide/audio-guide-action-store';
import { useT } from "@/lib/i18n/use-t";

// Lokales Hauptmenue-Audio + hardcodierte Hub-Cues — Fallback wenn keine
// Route-Mapping fuer den aktuellen Pfad existiert.
const FALLBACK_AUDIO_SRC = '/audio/hoermi-hauptmenu.mp3';
const FALLBACK_CUES: HoermiCue[] = [
    { at: 6.6, duration: 16.9, hub: '*' },
    { at: 25.7, duration: 57.3, hub: 'spaces' },
    { at: 83.0, duration: 26.5, hub: 'users' },
    { at: 109.5, duration: 42.5, hub: 'my-tasks' },
    { at: 152.0, duration: 32.0, hub: 'calendar' },
    { at: 184.0, duration: 38.0, hub: 'dms' },
    { at: 222.0, duration: 38.5, hub: 'flows' },
    { at: 260.5, duration: 24.5, hub: 'favorites' },
    { at: 285.0, duration: 26.0, hub: 'mein-fach' },
    { at: 311.0, duration: 23.0, hub: '*' },
];
const FALLBACK_TITLE = 'Das Hauptmenue';

// Mapping Lucide-Icon-Name → Hub-Key fuer den Sidebar-Highlight bei
// DB-cues. Wenn der iconName eines Cues einem Hub entspricht, leuchtet
// das jeweilige Welt-Icon auf.
const ICON_TO_HUB: Record<string, HubKey> = {
    'layout-grid': 'spaces',
    'users': 'users',
    'check-square': 'my-tasks',
    'calendar': 'calendar',
    'folder-open': 'dms',
    'git-branch': 'flows',
    'star': 'favorites',
    'inbox': 'mein-fach',
};

interface ResolvedAudio {
    /** Wo kommt der Stream her — preset URL oder presigned. */
    audioUrl: string;
    /** Cue-Liste in HoermiCue-Form (hub: HubKey | '*'). */
    cues: HoermiCue[];
    /** Anzeige-Titel im Popover. */
    title: string;
    /** documentId wenn DB-bound, sonst null. */
    documentId: string | null;
    /** DB-Original (falls vorhanden) — fuer Action-Navigation. */
    rawCues: AudioGuideCueRecord[] | null;
}

const HEARD_KEY = 'prilog-hoermi-heard';
function getHeardSet(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
        const raw = window.localStorage.getItem(HEARD_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}
function markHeard(documentId: string) {
    if (typeof window === 'undefined') return;
    try {
        const set = getHeardSet();
        set.add(documentId);
        window.localStorage.setItem(HEARD_KEY, JSON.stringify([...set]));
    } catch { /* noop */ }
}

/**
 * Reagiert auf Cue-Actions (navigate-url, show-overlay, pause-and-wait,
 * start-flow, highlight-element). Wird beim Cue-Start einmalig gerufen.
 */
function handleCueAction(
    cue: AudioGuideCueRecord,
    navigate: (path: string) => void,
    pauseAndWait: () => Promise<void>,
): void {
    const target = cue.actionTarget?.trim() ?? '';
    switch (cue.actionType) {
        case 'navigate-url': {
            if (!target) return;
            if (target.startsWith('/')) navigate(target);
            else if (/^https?:\/\//i.test(target)) window.open(target, '_blank', 'noopener');
            return;
        }
        case 'show-overlay': {
            audioGuideActionStore.setActiveAction({
                type: 'show-overlay',
                target,
                label: cue.label,
                cueId: cue.id,
            });
            return;
        }
        case 'pause-and-wait': {
            audioGuideActionStore.setActiveAction({
                type: 'pause-and-wait',
                target,
                label: cue.label,
                cueId: cue.id,
            });
            void pauseAndWait();
            return;
        }
        case 'highlight-element': {
            audioGuideActionStore.setActiveAction({
                type: 'highlight-element',
                target,
                label: cue.label,
                cueId: cue.id,
            });
            return;
        }
        case 'start-flow': {
            if (target) navigate(`/flows/${target}/play`);
            return;
        }
        case 'none':
        default:
            // Reset bestehende Action wenn vorher gesetzt war.
            audioGuideActionStore.setActiveAction(null);
            return;
    }
}

export function HoermiHelper(): JSX.Element | null {
    const t = useT();
    const enabled = useSyncExternalStore(hoermiPrefStore.subscribe, hoermiPrefStore.getSnapshot);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [open, setOpen] = useState(false);
    const [playing, setPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const navigate = useNavigate();
    const location = useLocation();
    const returnPathRef = useRef<string | null>(null);
    const lastNavigatedRef = useRef<string | null>(null);

    // Routes-Cache — einmalig laden, wenn JWT vorhanden.
    const [routes, setRoutes] = useState<Array<{ routePattern: string; documentId: string }>>([]);
    useEffect(() => {
        if (!jwt) return;
        audioGuideApi.listRoutes(jwt).then((r) => setRoutes(r.routes)).catch(() => setRoutes([]));
    }, [jwt]);

    // Resolved-Audio fuer den aktuellen Pfad. State, damit useEffect bei
    // Route-Wechsel re-rendert.
    const [resolved, setResolved] = useState<ResolvedAudio>({
        audioUrl: FALLBACK_AUDIO_SRC,
        cues: FALLBACK_CUES,
        title: FALLBACK_TITLE,
        documentId: null,
        rawCues: null,
    });

    // Beim Route-Wechsel: passenden Guide auflösen.
    useEffect(() => {
        if (!jwt) return;
        let cancelled = false;
        const match = matchRoute(routes, location.pathname);
        if (!match) {
            // Fallback nur setzen wenn nicht schon der Fallback aktiv ist
            // (verhindert unnoetige State-Updates).
            setResolved((prev) => prev.documentId === null ? prev : {
                audioUrl: FALLBACK_AUDIO_SRC,
                cues: FALLBACK_CUES,
                title: FALLBACK_TITLE,
                documentId: null,
                rawCues: null,
            });
            return;
        }
        // DB-Guide laden: presigned URL + cues parallel.
        Promise.all([
            audioGuideApi.streamUrl(jwt, match.documentId),
            audioGuideApi.get(jwt, match.documentId),
        ]).then(([streamRes, getRes]) => {
            if (cancelled) return;
            const cues: HoermiCue[] = getRes.cues.map((c) => ({
                at: c.atSeconds,
                duration: c.duration,
                hub: ICON_TO_HUB[c.iconName] ?? '*',
            }));
            setResolved({
                audioUrl: streamRes.url,
                cues,
                title: getRes.document.title,
                documentId: match.documentId,
                rawCues: getRes.cues,
            });
        }).catch(() => {
            // Fehlschlag: Fallback bleibt aktiv (oder vorheriger State).
        });
        return () => { cancelled = true; };
    }, [jwt, routes, location.pathname]);

    // Discovery-Pulse: ist fuer aktuellen Pfad ein DB-Guide gemappt, den
    // der User noch nicht gehoert hat?
    const [pulse, setPulse] = useState(false);
    useEffect(() => {
        if (!resolved.documentId) { setPulse(false); return; }
        const heard = getHeardSet();
        setPulse(!heard.has(resolved.documentId));
    }, [resolved.documentId]);

    // Cleanup beim Unmount.
    useEffect(() => {
        return () => {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            audioRef.current?.pause();
            hoermiCueStore.setActiveHub(null);
        };
    }, []);

    // Klick ausserhalb / Escape schliesst Popover.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const startPlayback = () => {
        returnPathRef.current = location.pathname + location.search;
        lastNavigatedRef.current = null;

        // Beim Start als gehoert markieren — Pulse stoppt.
        if (resolved.documentId) {
            markHeard(resolved.documentId);
            setPulse(false);
        }

        // Bestehendes audio cleanup — wir bauen pro Start ein frisches
        // Element (URL-Wechsel zwischen Routen sonst flaky).
        audioRef.current?.pause();
        const a = new Audio(resolved.audioUrl);
        audioRef.current = a;

        const seek = (_t: number) => {
            a.currentTime = Math.max(0, Math.min(a.duration || _t, _t));
            hoermiPlaybackStore.update({ currentTime: a.currentTime });
        };
        hoermiPlaybackStore.update({
            active: true,
            playing: false,
            currentTime: 0,
            duration: 0,
            cues: resolved.cues,
            seek,
        });

        a.onloadedmetadata = () => {
            hoermiPlaybackStore.update({ duration: a.duration });
        };
        a.ontimeupdate = () => {
            hoermiPlaybackStore.update({ currentTime: a.currentTime });
            const hub = findActiveCue(resolved.cues, a.currentTime);
            hoermiCueStore.setActiveHub(hub);

            // Hub-basierte Auto-Navigation (nur fuer Fallback-Cues).
            if (hub && hub !== lastNavigatedRef.current && hub !== '*' && resolved.documentId === null) {
                lastNavigatedRef.current = hub;
                navigate(HUB_URLS[hub as HubKey]);
            }

            // DB-Cues: erweiterte Action-Typen.
            if (resolved.rawCues) {
                const active = resolved.rawCues.find(
                    (c) => c.atSeconds <= a.currentTime && a.currentTime < c.atSeconds + c.duration,
                );
                if (active && active.id !== lastNavigatedRef.current) {
                    lastNavigatedRef.current = active.id;
                    handleCueAction(active, navigate, async () => {
                        // pause-and-wait: Audio pausieren bis User klickt.
                        a.pause();
                        await audioGuideActionStore.waitForContinue();
                        a.play().catch(() => { /* noop */ });
                    });
                }
                // Wenn KEINE Action mehr aktiv ist (User ist aus dem Cue
                // herausgewandert), Overlay-State zuruecksetzen.
                if (!active && audioGuideActionStore.getSnapshot()?.type === 'show-overlay') {
                    audioGuideActionStore.dismissOverlay();
                }
            }
        };
        a.onended = () => {
            hoermiCueStore.setActiveHub(null);
            lastNavigatedRef.current = null;
            setPlaying(false);
            hoermiPlaybackStore.update({ playing: false, currentTime: a.duration });
            if (returnPathRef.current) navigate(returnPathRef.current);
        };
        a.onerror = () => {
            hoermiCueStore.setActiveHub(null);
            lastNavigatedRef.current = null;
            setPlaying(false);
            hoermiPlaybackStore.update({ playing: false });
        };
        a.play().then(() => {
            setPlaying(true);
            hoermiPlaybackStore.update({ playing: true });
        }).catch(() => setPlaying(false));
    };

    const stopPlayback = () => {
        audioRef.current?.pause();
        hoermiCueStore.setActiveHub(null);
        audioGuideActionStore.setActiveAction(null);
        lastNavigatedRef.current = null;
        setPlaying(false);
        hoermiPlaybackStore.update({ playing: false });
        if (returnPathRef.current) {
            navigate(returnPathRef.current);
            returnPathRef.current = null;
        }
    };

    const togglePlayback = () => {
        if (playing) stopPlayback();
        else startPlayback();
    };

    if (!enabled) return null;

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                title={playing ? 'Hörmi spricht…' : (pulse ? `Hörmi & Mia: ${resolved.title}` : 'Hörmi & Mia Audio-Hilfe')}
                aria-label={t('app.misc.hoermi_mia_audio-hilfe_oeffnen')}
                className={cn(
                    'flex size-8 items-center justify-center rounded transition-colors relative',
                    open ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                    playing && 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse',
                )}
            >
                <MaterialIcon name="headphones" size={16} className="size-4" />
                {pulse && !playing && !open && (
                    <span
                        className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse"
                        aria-hidden
                    />
                )}
            </button>

            {open && (
                <div
                    ref={popoverRef}
                    className="absolute right-0 top-full z-50 mt-2 w-72 rounded border border-border bg-popover p-3 text-popover-foreground shadow-lg"
                >
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('app.misc.hoermi_mia_erklaeren')}
                            </p>
                            <p className="mt-0.5 text-sm font-medium leading-tight">
                                {resolved.title}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                            aria-label={t('app.misc.schliessen')}
                        >
                            <MaterialIcon name="close" size={16} className="size-3.5" />
                        </button>
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground">
                        {resolved.documentId
                            ? 'Hörmi & Mia sprechen über diesen Bereich. Während der Wiedergabe leuchten die erklärten Stellen auf.'
                            : 'Allgemeine Tour übers Hauptmenü. Während der Wiedergabe wechselt die Ansicht automatisch zur jeweils erklärten Welt.'}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={togglePlayback}
                            className={cn(
                                'flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors',
                                playing
                                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                            )}
                        >
                            {playing ? (
                                <>
                                    <Pause className="size-3.5" />
                                    {t('app.misc.pause')}
                                </>
                            ) : (
                                <>
                                    <MaterialIcon name="play_arrow" size={16} className="size-3.5" />
                                    {t('app.misc.anhoeren')}
                                </>
                            )}
                        </button>
                        {playing && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                                spricht
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

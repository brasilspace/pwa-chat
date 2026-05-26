/**
 * hoermi-playback-store — Wiedergabe-State des Hoermi-Players.
 *
 * HoermiHelper publiziert hier { playing, currentTime, duration, cues, seek }.
 * Die ProgressBar im Header (HoermiProgressBar) liest und rendert.
 *
 * Der Store ist nur fuer die UI-Anzeige da — die eigentliche Wiedergabe-
 * Steuerung (play, pause, neue Cue navigieren) liegt weiter im Helper.
 * `seek` ist eine Callback-Referenz, die der Helper bei start/stop setzt.
 */

import type { HoermiCue } from './hoermi-cue-store';

export interface PlaybackState {
    /** Wurde der Audio-Player schon mal gestartet? Bestimmt, ob die ProgressBar
     *  ueberhaupt sichtbar wird. False vor erstem Klick auf Anhoeren. */
    active: boolean;
    /** Gerade Wiedergabe lauft. */
    playing: boolean;
    /** Aktuelle Position in Sekunden. */
    currentTime: number;
    /** Gesamt-Dauer in Sekunden (0 bis Metadata-Load). */
    duration: number;
    /** Cue-Liste fuer Marker-Position. */
    cues: HoermiCue[];
    /** Callback: zur Sekunde t springen. */
    seek: ((t: number) => void) | null;
}

const initial: PlaybackState = {
    active: false,
    playing: false,
    currentTime: 0,
    duration: 0,
    cues: [],
    seek: null,
};

let state: PlaybackState = initial;
const listeners = new Set<() => void>();

export const hoermiPlaybackStore = {
    getSnapshot(): PlaybackState {
        return state;
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    update(patch: Partial<PlaybackState>): void {
        state = { ...state, ...patch };
        for (const l of listeners) l();
    },
    reset(): void {
        state = initial;
        for (const l of listeners) l();
    },
};

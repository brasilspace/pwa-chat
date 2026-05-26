/**
 * audio-guide-types — Generischer Datenvertrag fuer AudioGuides.
 *
 * Ein AudioGuide ist eine Audiodatei mit Zeitmarken, an denen UI-Aktionen
 * ausgeloest werden. Der Spezialfall "Hoermi & Mia" benutzt Welt-Schluessel
 * als Cue-Ziel; spaetere Guides (Kurs-Lektionen, Flow-Erklaerungen) benutzen
 * andere Aktions-Typen.
 *
 * Der Player hier kennt nur `key` als Opaque-Identifier. Was passieren soll
 * wenn ein Cue aktiv wird, entscheidet der Aufrufer ueber den onCueChange-
 * Callback.
 */

import type { LucideIcon } from 'lucide-react';

export interface AudioGuideCue<TKey extends string = string> {
    /** Sekunde im Audio, ab der der Cue aktiv wird. */
    at: number;
    /** Sekunden, die der Cue aktiv bleibt. */
    duration: number;
    /** Ziel-Identifier (z.B. Hub-Key, Element-ID, Slide-Nummer). */
    key: TKey;
}

export interface AudioGuideMarkerMeta {
    icon: LucideIcon;
    label: string;
}

/**
 * Metadaten pro Cue-Key fuer die ProgressBar — welches Icon der Marker
 * zeigt und was im Tooltip steht. Spezifisch zum Aufrufer.
 */
export type AudioGuideMarkerMap<TKey extends string> = Record<TKey, AudioGuideMarkerMeta>;

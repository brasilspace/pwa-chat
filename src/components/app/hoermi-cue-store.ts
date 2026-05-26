/**
 * hoermi-cue-store — Welche Welt(en) sollen gerade leuchten?
 *
 * HoermiHelper publiziert waehrend einer Audio-Wiedergabe den aktuellen
 * Welt-Schluessel; die AppSidebar liest und setzt einen "highlighted"-State
 * auf das passende Hub-Icon.
 *
 * Ein Cue wird mit setActiveHub('users') aktiviert und mit setActiveHub(null)
 * wieder deaktiviert. HoermiHelper steuert das beim timeupdate-Event des
 * Audio-Players.
 *
 * Welten-Schluessel matchen die Keys in WORLDS in app-sidebar.tsx
 * (users / spaces / my-tasks / calendar / dms / flows).
 */

import type { LucideIcon } from 'lucide-react';
import { Users, LayoutGrid, CheckSquare, Calendar, FolderOpen, GitBranch, Star, Inbox, Sparkles } from 'lucide-react';

export type HubKey = 'users' | 'spaces' | 'my-tasks' | 'calendar' | 'dms' | 'flows' | 'favorites' | 'mein-fach';

/** Cue-Ziel: einzelne Welt oder '*' = alle gleichzeitig (Intro/Outro). */
export type CueTarget = HubKey | '*';

/** Icon pro Hub — fuer den Progress-Bar-Marker. '*' bekommt Sparkles. */
export const HUB_ICONS: Record<CueTarget, LucideIcon> = {
    users: Users,
    spaces: LayoutGrid,
    'my-tasks': CheckSquare,
    calendar: Calendar,
    dms: FolderOpen,
    flows: GitBranch,
    favorites: Star,
    'mein-fach': Inbox,
    '*': Sparkles,
};

/** Anzeige-Label pro Cue-Ziel — Tooltip im Progress-Bar. */
export const HUB_LABELS: Record<CueTarget, string> = {
    users: 'Adressen',
    spaces: 'Spaces',
    'my-tasks': 'Aufgaben',
    calendar: 'Termine',
    dms: 'DMS',
    flows: 'Flows',
    favorites: 'Favoriten',
    'mein-fach': 'Mein Fach',
    '*': 'Alle Welten',
};

/**
 * URL pro Hub. Wird vom HoermiHelper benutzt, um waehrend einer Cue
 * automatisch dorthin zu navigieren — der User soll waehrend der
 * Erklaerung den jeweiligen Bereich sehen, nicht nur ein Highlight.
 *
 * '*' (alle Welten) hat bewusst keine URL: bei Intro/Zusammenfassung
 * bleibt der User dort, wo er ist; alle Hub-Icons leuchten parallel.
 */
export const HUB_URLS: Record<HubKey, string> = {
    users: '/contacts',
    spaces: '/',
    'my-tasks': '/meine-aufgaben',
    calendar: '/calendar',
    dms: '/dms',
    flows: '/flows',
    favorites: '/favorites',
    'mein-fach': '/mein-fach',
};

let activeHub: CueTarget | null = null;
const listeners = new Set<() => void>();

export const hoermiCueStore = {
    getSnapshot(): CueTarget | null {
        return activeHub;
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    setActiveHub(key: CueTarget | null): void {
        if (activeHub === key) return;
        activeHub = key;
        for (const l of listeners) l();
    },
};

/**
 * Cue-Format: zu welchem Sekunden-Offset welches Hub leuchten soll, und
 * wie lange. Verwendet als Liste, die HoermiHelper beim timeupdate
 * abscannt.
 */
export interface HoermiCue {
    /** Sekunde im Audio, ab der der Cue aktiv wird. */
    at: number;
    /** Sekunden, die der Highlight bleibt. */
    duration: number;
    /** Welche Welt leuchtet — oder '*' fuer alle Welten gleichzeitig. */
    hub: CueTarget;
}

/**
 * Findet aus einer sortierten Cue-Liste den aktiven Eintrag fuer
 * currentTime. Nimmt den letzten passenden — ueberlappende Cues sind
 * erlaubt, dann gewinnt der zuletzt eingestiegene.
 */
export function findActiveCue(cues: HoermiCue[], currentTime: number): CueTarget | null {
    let active: CueTarget | null = null;
    for (const c of cues) {
        if (c.at <= currentTime && currentTime < c.at + c.duration) {
            active = c.hub;
        } else if (c.at > currentTime) {
            break;
        }
    }
    return active;
}

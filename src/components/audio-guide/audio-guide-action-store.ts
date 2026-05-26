/**
 * audio-guide-action-store — globaler Pub/Sub fuer aktive Cue-Aktionen.
 *
 * Player (Hoermi-Helper, AudioGuide-Page, Embed) publizieren hier eine
 * aktive Aktion. AudioGuideActionOverlay rendert daraufhin Overlay /
 * Highlight / Pause-Bubble. Eine zweite Komponente kann auf
 * `requestContinue()` reagieren (Player nimmt Wiedergabe auf).
 */

export type ActionKind = 'show-overlay' | 'pause-and-wait' | 'highlight-element';

export interface ActiveAction {
    type: ActionKind;
    /** Action-spezifischer Wert: Markdown / data-tour-Attribut / Pause-Hinweis. */
    target: string | null;
    /** Sprecher-Label aus dem Cue, fuer Anzeige (z.B. "Probier's aus"). */
    label: string;
    /** Cue-ID, damit derselbe Cue nicht doppelt feuert. */
    cueId: string;
}

let active: ActiveAction | null = null;
let continueWaiter: (() => void) | null = null;
const listeners = new Set<() => void>();

export const audioGuideActionStore = {
    getSnapshot(): ActiveAction | null {
        return active;
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    setActiveAction(a: ActiveAction | null): void {
        if (active?.cueId === a?.cueId && active?.type === a?.type) return;
        active = a;
        for (const l of listeners) l();
    },
    /** Player kann hier auf User-"Weiter" warten (pause-and-wait). */
    waitForContinue(): Promise<void> {
        return new Promise<void>((resolve) => {
            continueWaiter = () => {
                continueWaiter = null;
                resolve();
            };
        });
    },
    /** Vom Overlay-Continue-Button gerufen — loest den waitForContinue. */
    requestContinue(): void {
        // Aktion verschwinden lassen, damit Bubble weg ist.
        active = null;
        for (const l of listeners) l();
        continueWaiter?.();
    },
    dismissOverlay(): void {
        if (!active || active.type !== 'show-overlay') return;
        active = null;
        for (const l of listeners) l();
    },
};

import { useSyncExternalStore } from 'react';

/**
 * Liefert true, wenn der Viewport schmaler als 768px ist (Tailwind md-Breakpoint).
 *
 * Implementation per useSyncExternalStore + matchMedia, damit React beim
 * Resize automatisch re-rendert. Kein eigenes Polling, kein Listener-
 * Leakage. Auf SSR / wo window fehlt liefern wir false zurueck.
 *
 * Das ist die *einzige* Quelle der Wahrheit fuer "bin ich auf Mobile?".
 * Komponenten mit Conditional-Render nutzen diesen Hook, alles andere
 * laeuft per CSS (Tailwind md:-Prefix) — siehe project_mobile_concept.md.
 */
const MOBILE_QUERY = '(max-width: 767px)';

function getSnapshot(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const mql = window.matchMedia(MOBILE_QUERY);
    // Safari seit 14 (2020) hat addEventListener — Legacy-Fallback nicht noetig.
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
}

export function useIsMobile(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

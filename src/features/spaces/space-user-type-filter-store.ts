/**
 * Store fuer den aktiven Benutzertyp-Filter im Space-Baum.
 * Null = "Alle". Persistiert in localStorage.
 */

const STORAGE_KEY = 'prilog.spaceUserTypeFilter';

type Listener = () => void;

let value: string | null = null;
const listeners = new Set<Listener>();
let hydrated = false;

function hydrate() {
    if (hydrated || typeof window === 'undefined') return;
    hydrated = true;
    // Filter-Chips wurden aus der Sidebar entfernt — gespeicherte Werte
    // wuerden einen Filter setzen, den der Benutzer nicht zuruecksetzen kann.
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    value = null;
}

export const spaceUserTypeFilterStore = {
    subscribe(listener: Listener): () => void {
        hydrate();
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    getSnapshot(): string | null {
        hydrate();
        return value;
    },
    set(next: string | null): void {
        hydrate();
        if (value === next) return;
        value = next;
        try {
            if (typeof window !== 'undefined') {
                if (next === null) window.localStorage.removeItem(STORAGE_KEY);
                else window.localStorage.setItem(STORAGE_KEY, next);
            }
        } catch {
            /* ignore */
        }
        listeners.forEach((l) => l());
    },
};

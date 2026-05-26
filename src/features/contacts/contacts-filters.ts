/**
 * Filter-Stores fuer den Kontakte-Hub.
 *
 * Drei Filter, die ueber Sidebar gesteuert und im Hauptbereich angezeigt werden:
 *
 *   - sourceFilter: 'all' | 'members' | 'external'
 *   - officeFilter: null | 'birthdays' | 'expiring' | 'expired-active' | 'no-space'
 *   - tagFilter:    null | <slug>
 *
 * Plus der existierende userTypeFilterStore in user-type-filter-store.ts.
 *
 * Pattern wie userTypeFilterStore: Module-Level State + Listener + localStorage.
 * Cross-Component-Subscription via useSyncExternalStore.
 */

type Listener = () => void;

// ─── source-filter ────────────────────────────────────────────────────────

const SOURCE_KEY = 'prilog.contactsSourceFilter';
export type SourceFilter = 'all' | 'members' | 'external';
let sourceValue: SourceFilter = 'all';
const sourceListeners = new Set<Listener>();
let sourceHydrated = false;

function hydrateSource() {
    if (sourceHydrated || typeof window === 'undefined') return;
    sourceHydrated = true;
    try {
        const raw = window.localStorage.getItem(SOURCE_KEY);
        if (raw === 'members' || raw === 'external') sourceValue = raw;
    } catch { /* ignore */ }
}

export const sourceFilterStore = {
    subscribe(listener: Listener): () => void {
        hydrateSource();
        sourceListeners.add(listener);
        return () => sourceListeners.delete(listener);
    },
    getSnapshot(): SourceFilter {
        hydrateSource();
        return sourceValue;
    },
    set(next: SourceFilter): void {
        hydrateSource();
        if (sourceValue === next) return;
        sourceValue = next;
        try {
            if (typeof window !== 'undefined') {
                if (next === 'all') window.localStorage.removeItem(SOURCE_KEY);
                else window.localStorage.setItem(SOURCE_KEY, next);
            }
        } catch { /* ignore */ }
        sourceListeners.forEach((l) => l());
    },
};

// ─── office-filter ────────────────────────────────────────────────────────

const OFFICE_KEY = 'prilog.contactsOfficeFilter';
export type OfficeFilter = 'birthdays' | 'expiring' | 'expired-active' | 'no-space';
const VALID_OFFICE: ReadonlySet<string> = new Set(['birthdays', 'expiring', 'expired-active', 'no-space']);
let officeValue: OfficeFilter | null = null;
const officeListeners = new Set<Listener>();
let officeHydrated = false;

function hydrateOffice() {
    if (officeHydrated || typeof window === 'undefined') return;
    officeHydrated = true;
    try {
        const raw = window.localStorage.getItem(OFFICE_KEY);
        if (raw && VALID_OFFICE.has(raw)) officeValue = raw as OfficeFilter;
    } catch { /* ignore */ }
}

export const officeFilterStore = {
    subscribe(listener: Listener): () => void {
        hydrateOffice();
        officeListeners.add(listener);
        return () => officeListeners.delete(listener);
    },
    getSnapshot(): OfficeFilter | null {
        hydrateOffice();
        return officeValue;
    },
    set(next: OfficeFilter | null): void {
        hydrateOffice();
        if (officeValue === next) return;
        officeValue = next;
        try {
            if (typeof window !== 'undefined') {
                if (next === null) window.localStorage.removeItem(OFFICE_KEY);
                else window.localStorage.setItem(OFFICE_KEY, next);
            }
        } catch { /* ignore */ }
        officeListeners.forEach((l) => l());
    },
};

// ─── tag-filter ───────────────────────────────────────────────────────────
// URL-Param '?tag=<slug>' bleibt zusaetzlich erhalten fuer Bookmarking.
// Sidebar-Klicks aktualisieren den Store + URL parallel.

let tagValue: string | null = null;
const tagListeners = new Set<Listener>();

export const tagFilterStore = {
    subscribe(listener: Listener): () => void {
        tagListeners.add(listener);
        return () => tagListeners.delete(listener);
    },
    getSnapshot(): string | null {
        return tagValue;
    },
    set(next: string | null): void {
        if (tagValue === next) return;
        tagValue = next;
        tagListeners.forEach((l) => l());
    },
    /** Sync mit URL-Param ohne Listener-Trigger (fuer initiales Hydrate). */
    setFromUrl(next: string | null): void {
        tagValue = next;
        tagListeners.forEach((l) => l());
    },
};

/**
 * Reset-Helper: setzt alle drei Filter auf neutral. UserType-Filter wird
 * separat ueber den existierenden Store zurueckgesetzt — Caller muss das
 * selbst machen, weil hier kein Cross-Import.
 */
export function resetAllContactFilters(): void {
    sourceFilterStore.set('all');
    officeFilterStore.set(null);
    tagFilterStore.set(null);
}

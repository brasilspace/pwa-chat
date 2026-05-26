/**
 * finden-filter-store — geteilter State zwischen App-Sidebar und FindenPage.
 *
 * Pattern wie tagFilterStore: subscribe/getSnapshot fuer useSyncExternalStore.
 * Persistierung in localStorage damit Filter Tab-Wechsel ueberleben.
 */

export type FindenResultType = 'document' | 'contact' | 'member' | 'space' | 'task' | 'event' | 'tag' | 'transcription';
export type FindenSortKey = 'score' | 'date' | 'title';

export const FINDEN_ALL_TYPES: FindenResultType[] = [
    'document', 'contact', 'member', 'space', 'task', 'event', 'tag', 'transcription',
];

interface FindenFilterState {
    /** Aktivierte Typen — leer = alle. Wir speichern positiv um den Empty-State sauber zu rendern. */
    enabledTypes: Set<FindenResultType>;
    sortBy: FindenSortKey;
    groupByType: boolean;
}

const STORAGE_KEY = 'prilog:finden:filters';

function loadFromStorage(): FindenFilterState {
    if (typeof window === 'undefined') {
        return defaults();
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults();
        const parsed = JSON.parse(raw);
        const types = Array.isArray(parsed.enabledTypes)
            ? new Set<FindenResultType>(parsed.enabledTypes.filter((t: unknown): t is FindenResultType =>
                FINDEN_ALL_TYPES.includes(t as FindenResultType)))
            : new Set<FindenResultType>(FINDEN_ALL_TYPES);
        const sortBy: FindenSortKey = parsed.sortBy === 'date' || parsed.sortBy === 'title' ? parsed.sortBy : 'score';
        const groupByType = parsed.groupByType !== false;
        return { enabledTypes: types.size > 0 ? types : new Set(FINDEN_ALL_TYPES), sortBy, groupByType };
    } catch {
        return defaults();
    }
}

function defaults(): FindenFilterState {
    return { enabledTypes: new Set(FINDEN_ALL_TYPES), sortBy: 'score', groupByType: true };
}

function persist(state: FindenFilterState): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            enabledTypes: Array.from(state.enabledTypes),
            sortBy: state.sortBy,
            groupByType: state.groupByType,
        }));
    } catch { /* ignore */ }
}

let state: FindenFilterState = loadFromStorage();
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export const findenFilterStore = {
    getSnapshot(): FindenFilterState {
        return state;
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    toggleType(type: FindenResultType): void {
        const next = new Set(state.enabledTypes);
        if (next.has(type)) next.delete(type); else next.add(type);
        state = { ...state, enabledTypes: next };
        persist(state);
        emit();
    },
    setOnlyType(type: FindenResultType): void {
        state = { ...state, enabledTypes: new Set([type]) };
        persist(state);
        emit();
    },
    setAllTypes(): void {
        state = { ...state, enabledTypes: new Set(FINDEN_ALL_TYPES) };
        persist(state);
        emit();
    },
    setSortBy(sortBy: FindenSortKey): void {
        state = { ...state, sortBy };
        persist(state);
        emit();
    },
    setGroupByType(groupByType: boolean): void {
        state = { ...state, groupByType };
        persist(state);
        emit();
    },
};

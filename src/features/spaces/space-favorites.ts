const STORAGE_KEY = 'prilog.space.favorites';
const listeners = new Set<() => void>();

let current: Set<string> = new Set(
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[],
);
let snapshot = current;

function emit() {
    snapshot = new Set(current);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
    for (const fn of listeners) fn();
}

export const spaceFavorites = {
    get(): Set<string> {
        return snapshot;
    },

    isFavorite(spaceId: string): boolean {
        return snapshot.has(spaceId);
    },

    toggle(spaceId: string) {
        if (current.has(spaceId)) {
            current.delete(spaceId);
        } else {
            current.add(spaceId);
        }
        emit();
    },

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
};

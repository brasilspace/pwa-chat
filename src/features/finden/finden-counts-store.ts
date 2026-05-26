/**
 * finden-counts-store — gibt der Sidebar die aktuellen Treffer-Counts
 * pro Typ, damit die Checkboxen "Dokumente (3)" zeigen koennen.
 *
 * FindenPage setzt counts nach jedem Fetch; FindenWorld liest sie.
 * Kein Persist — bei Page-Verlassen ist's wieder leer.
 */

import type { FindenResultType } from './finden-filter-store';

type Counts = Partial<Record<FindenResultType, number>>;

let counts: Counts = {};
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export const findenCountsStore = {
    getSnapshot(): Counts {
        return counts;
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    setCounts(next: Counts): void {
        counts = next;
        emit();
    },
    clear(): void {
        counts = {};
        emit();
    },
};

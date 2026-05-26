/**
 * Filter-Stores fuer den Aufgaben-Hub.
 *
 * Vier Filter, gesteuert ueber die MyTasksWorld-Sidebar, gelesen vom Hub:
 *   - urgencyFilter: 'overdue' | 'today' | 'thisWeek' | 'thisMonth' | 'later' | 'nodue' | null
 *   - statusFilter:  'open' | WorkItemStatus | null
 *   - spaceFilter:   spaceId | null
 *   - priorityFilter: WorkItemPriority | null
 *
 * Pattern wie contacts-filters: Module-Level State + Listener + localStorage.
 */

import type { WorkItemStatus, WorkItemPriority } from '@/features/project/project-types';

type Listener = () => void;

function makeStore<T>(key: string, isValid: (raw: string) => T | null, initial: T) {
    let value: T = initial;
    const listeners = new Set<Listener>();
    let hydrated = false;

    function hydrate() {
        if (hydrated || typeof window === 'undefined') return;
        hydrated = true;
        try {
            const raw = window.localStorage.getItem(key);
            if (raw !== null) {
                const parsed = isValid(raw);
                if (parsed !== null) value = parsed;
            }
        } catch { /* ignore */ }
    }

    return {
        subscribe(listener: Listener): () => void {
            hydrate();
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getSnapshot(): T {
            hydrate();
            return value;
        },
        set(next: T): void {
            hydrate();
            if (Object.is(value, next)) return;
            value = next;
            try {
                if (typeof window !== 'undefined') {
                    if (next === null || next === undefined) {
                        window.localStorage.removeItem(key);
                    } else {
                        window.localStorage.setItem(key, String(next));
                    }
                }
            } catch { /* ignore */ }
            for (const l of listeners) l();
        },
    };
}

// ─── Urgency ──────────────────────────────────────────────────────────────

export type UrgencyFilter = 'overdue' | 'today' | 'thisWeek' | 'thisMonth' | 'later' | 'nodue' | null;
const URGENCY_VALUES: UrgencyFilter[] = ['overdue', 'today', 'thisWeek', 'thisMonth', 'later', 'nodue'];
export const urgencyFilterStore = makeStore<UrgencyFilter>(
    'prilog.myTasks.urgencyFilter',
    (raw) => (URGENCY_VALUES as string[]).includes(raw) ? (raw as UrgencyFilter) : null,
    null,
);

// ─── Status ───────────────────────────────────────────────────────────────

export type StatusFilter = 'open' | WorkItemStatus | null;
const STATUS_VALUES: StatusFilter[] = ['open', 'todo', 'in_progress', 'review', 'done'];
export const statusFilterStore = makeStore<StatusFilter>(
    'prilog.myTasks.statusFilter',
    (raw) => (STATUS_VALUES as string[]).includes(raw) ? (raw as StatusFilter) : null,
    'open',  // Default: nur offene Aufgaben (sonst ueberfluten Erledigte die Liste)
);

// ─── Space ────────────────────────────────────────────────────────────────

export const spaceFilterStore = makeStore<string | null>(
    'prilog.myTasks.spaceFilter',
    (raw) => raw && raw.length > 0 ? raw : null,
    null,
);

// ─── Priority ─────────────────────────────────────────────────────────────

const PRIORITY_VALUES: WorkItemPriority[] = ['low', 'medium', 'high', 'critical'];
export const priorityFilterStore = makeStore<WorkItemPriority | null>(
    'prilog.myTasks.priorityFilter',
    (raw) => (PRIORITY_VALUES as string[]).includes(raw) ? (raw as WorkItemPriority) : null,
    null,
);

// ─── Person (Verantwortliche/Bearbeiter) ──────────────────────────────────

export const personFilterStore = makeStore<string | null>(
    'prilog.myTasks.personFilter',
    (raw) => raw && raw.length > 0 ? raw : null,
    null,
);

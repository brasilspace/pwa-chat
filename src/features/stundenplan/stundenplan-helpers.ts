/**
 * Stundenplan-Helpers — pure Funktionen fuer das Read-only-UI (P1b).
 *
 * Bewusst keine React-Abhaengigkeit hier — alles testbar als Funktion.
 * UI-Komponenten konsumieren das Ergebnis und i18n-Keys.
 */

import type {
    TimetableEntry,
    TimetableStaffAssignment,
} from '@/gateways/platform/stundenplan-gateway';

/** Liefert den i18n-Key fuer die Anzeige des WeekParity-Werts. */
export function weekParityKey(weekParity: TimetableEntry['weekParity']): string {
    if (weekParity === 'even') return 'stundenplan.week_parity_even';
    if (weekParity === 'odd') return 'stundenplan.week_parity_odd';
    return 'stundenplan.week_parity_weekly';
}

/** Liefert den i18n-Key fuer den planningStatus eines Eintrags. */
export function planningStatusKey(status: TimetableEntry['planningStatus']): string {
    return `stundenplan.planning_status_${status}`;
}

/** Liefert den i18n-Key fuer den status eines Eintrags. */
export function statusKey(status: TimetableEntry['status']): string {
    return `stundenplan.entry_status_${status}`;
}

/**
 * Gruppiert StaffAssignments nach `role` und sortiert nach `sortOrder`.
 * Stabil — gleiche Rolle behaelt Reihenfolge.
 */
export function groupStaffByRole(
    assignments: TimetableStaffAssignment[],
): Array<{ role: string; entries: TimetableStaffAssignment[] }> {
    if (!assignments.length) return [];
    const sorted = [...assignments].sort((a, b) => a.sortOrder - b.sortOrder);
    const map = new Map<string, TimetableStaffAssignment[]>();
    for (const a of sorted) {
        const arr = map.get(a.role) ?? [];
        arr.push(a);
        map.set(a.role, arr);
    }
    return [...map.entries()].map(([role, entries]) => ({ role, entries }));
}

/**
 * Matrix-ID `@andreas:leander.prilog.team` → `@andreas` (Kurz-Anzeige).
 * Fuer ID ohne `:` unveraendert.
 */
export function shortMatrixId(matrixUserId: string): string {
    const at = matrixUserId.indexOf(':');
    return at > 0 ? matrixUserId.slice(0, at) : matrixUserId;
}

/**
 * Identifiziert Teamteaching (mehr als ein staff-Assignment).
 * Wird im UI fuer Badge-Anzeige verwendet.
 */
export function isTeamteaching(entry: TimetableEntry): boolean {
    return (entry.staffAssignments?.length ?? 0) > 1;
}

/**
 * Liefert eine kompakte Beschreibung "wer unterrichtet" — wenn nur ein
 * Teacher: shortMatrixId; bei Teamteaching: "Team (N)".
 * Wird in EntryCard genutzt; das Detail-Panel zeigt die volle Liste.
 */
export function compactTeacherLabel(entry: TimetableEntry): {
    kind: 'none' | 'single' | 'team';
    label: string;
    count: number;
} {
    const teachers = entry.staffAssignments ?? [];
    if (teachers.length === 0) return { kind: 'none', label: '', count: 0 };
    if (teachers.length === 1) {
        return { kind: 'single', label: shortMatrixId(teachers[0]!.teacherMatrixUserId), count: 1 };
    }
    return { kind: 'team', label: '', count: teachers.length };
}

// ─── P1d Drag & Drop Simulation ────────────────────────────────

export interface MoveSpec {
    entryId: string;
    toWeekday: number;
    toPeriodSlotId: string;
}

/**
 * Pure: wendet einen geplanten Move auf die Entries an, ohne den
 * Original-Array zu mutieren. Eintrag wird in (weekday, periodSlot)
 * verschoben. Wenn entryId nicht existiert → unveraendert.
 *
 * S5: keine Auto-Repair-Logik. Nur die Position aendert sich; alle
 * anderen Felder (Lehrer, Raum, Gruppe) bleiben. Konsequenzen werden
 * im naechsten Schritt von checkPlan ermittelt.
 */
export function simulateMove(
    entries: TimetableEntry[],
    move: MoveSpec,
): TimetableEntry[] {
    return entries.map((e) =>
        e.id === move.entryId
            ? { ...e, weekday: move.toWeekday, periodSlotId: move.toPeriodSlotId }
            : e,
    );
}

/**
 * Welche (weekday, periodSlot)-Zellen sind komplett leer in der
 * aktuellen Entry-Liste? Wird waehrend Drag verwendet, um freie
 * Slots optisch hervorzuheben (Spec §10.1: Freie-Slots-Diagnose).
 */
export function freeSlots(
    entries: TimetableEntry[],
    options: { weekdays: number[]; periodSlotIds: string[] },
): Set<string> {
    const occupied = new Set<string>();
    for (const e of entries) occupied.add(`${e.weekday}|${e.periodSlotId}`);
    const free = new Set<string>();
    for (const w of options.weekdays) {
        for (const p of options.periodSlotIds) {
            const k = `${w}|${p}`;
            if (!occupied.has(k)) free.add(k);
        }
    }
    return free;
}

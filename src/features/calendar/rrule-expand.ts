/**
 * RRULE-Expansion fuer das Kalender-Frontend.
 *
 * Backend speichert nur die rrule-Spalte (FREQ/INTERVAL/UNTIL/COUNT/BYDAY) —
 * expandiert die Serie aber NICHT. Damit wir wiederkehrende Termine in
 * Jahres-/Monats-/Wochen-/Tages-Ansicht wirklich an jedem Wochentag sehen,
 * expandieren wir im Frontend pro sichtbarem Range.
 *
 * Wichtige Eigenschaften:
 *  - Virtuelle Vorkommnisse behalten die Original-`id` (Click → originales
 *    Event-Detail oeffnet). dtstart/dtend werden auf den jeweiligen Slot
 *    geschoben; alle anderen Felder bleiben gleich.
 *  - `exdates` werden respektiert (ausgenommene Tage).
 *  - Performance: nur Vorkommnisse innerhalb [from, to] werden erzeugt.
 *  - Events ohne rrule passieren durch.
 */
import { RRule } from 'rrule';
import type { CalendarEvent } from './calendar-types';
import { logger } from '@/core/logging/logger';

/**
 * Erzeugt fuer jedes Recurring-Event Vorkommnisse innerhalb [from, to] und
 * fuegt sie der Liste hinzu. Nicht-recurrente Events bleiben unveraendert.
 */
export function expandRecurringEvents(events: CalendarEvent[], from: Date, to: Date): CalendarEvent[] {
    const out: CalendarEvent[] = [];
    for (const ev of events) {
        if (!ev.rrule) {
            out.push(ev);
            continue;
        }
        try {
            const start = new Date(ev.dtstart);
            const end = ev.dtend ? new Date(ev.dtend) : start;
            const duration = end.getTime() - start.getTime();

            // RRULE-String muss DTSTART enthalten, damit `rrule` korrekt expandiert.
            // Wir bauen den vollstaendigen "RRULE:..."-Block aus rrule-Spalte + dtstart.
            const rule = RRule.fromString(`DTSTART:${toIcal(start)}\nRRULE:${ev.rrule}`);
            const occurrences = rule.between(from, to, true);

            // Ausgenommene Tage (EXDATE) filtern. exdates sind im Backend pro
            // Event-Tag gespeichert; wir vergleichen auf Tagesbasis.
            const exSet = new Set((ev.exdates ?? []).map(d => new Date(d).toDateString()));

            for (const occ of occurrences) {
                if (exSet.has(occ.toDateString())) continue;
                // Die erste Instanz ist der Original-Termin (dtstart == start).
                // Den behalten wir 1:1, damit Edit/Drag das echte Event trifft.
                if (occ.getTime() === start.getTime()) {
                    out.push(ev);
                    continue;
                }
                out.push({
                    ...ev,
                    dtstart: occ.toISOString(),
                    dtend: duration > 0 ? new Date(occ.getTime() + duration).toISOString() : null,
                });
            }
        } catch (err) {
            logger.warn('expandRecurringEvents: rrule parse failed', { eventId: ev.id, rrule: ev.rrule, err });
            // Bei kaputter Regel zeigen wir wenigstens die Ursprungs-Instanz.
            out.push(ev);
        }
    }
    return out;
}

/** Date → iCal-UTC-Format YYYYMMDDTHHmmssZ (was RRule.fromString erwartet). */
function toIcal(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// ── RRULE-String <-> Editor-State ─────────────────────────────────────

export type RecurEnd =
    | { kind: 'never' }
    | { kind: 'count'; count: number }
    | { kind: 'until'; date: string /* YYYY-MM-DD */ };

/** Parst einen rrule-String und trennt Base-Pattern vom End-Anteil (UNTIL/COUNT). */
export function parseRruleEnd(value: string): { base: string; end: RecurEnd } {
    if (!value) return { base: '', end: { kind: 'never' } };
    const parts = value.split(';').filter(Boolean);
    const baseParts: string[] = [];
    let end: RecurEnd = { kind: 'never' };
    for (const p of parts) {
        const [k, v] = p.split('=');
        if (k === 'UNTIL' && v) {
            // YYYYMMDD oder YYYYMMDDTHHmmssZ
            const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
            end = m ? { kind: 'until', date: `${m[1]}-${m[2]}-${m[3]}` } : end;
        } else if (k === 'COUNT' && v) {
            end = { kind: 'count', count: Number(v) };
        } else {
            baseParts.push(p);
        }
    }
    return { base: baseParts.join(';'), end };
}

/** Setzt UNTIL/COUNT auf ein Base-Pattern. Leer-Base → leerer Output. */
export function buildRrule(base: string, end: RecurEnd): string {
    if (!base) return '';
    if (end.kind === 'never') return base;
    if (end.kind === 'count') return `${base};COUNT=${end.count}`;
    // UNTIL muss in UTC sein und 23:59:59 setzen, damit das Datum komplett
    // included ist (Spec: UNTIL ist exklusiv, aber bei Datum-Vergleich + Zeit
    // 23:59:59Z deckt es den ganzen Tag ab).
    const [y, m, d] = end.date.split('-');
    return `${base};UNTIL=${y}${m}${d}T235959Z`;
}

/**
 * Hilfsfunktion: gibt das Ende des Schuljahres fuer ein gegebenes Datum zurueck.
 * Schuljahr endet konventionell 31.07. — wenn das aktuelle Datum nach dem 31.07.
 * liegt, nehmen wir den 31.07. des Folgejahres.
 */
export function schoolYearEnd(reference: Date = new Date()): string {
    const y = reference.getFullYear();
    const summerEnd = new Date(y, 6, 31); // Juli = month 6 (0-based)
    if (reference > summerEnd) return `${y + 1}-07-31`;
    return `${y}-07-31`;
}

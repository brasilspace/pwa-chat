/**
 * Tests fuer RRULE-Frontend-Expansion und String-Bau/Parse.
 *
 * Pure Funktionen, keine Mocks noetig. Standard-Coverage:
 *  - parseRruleEnd: leer, base-only, COUNT, UNTIL, kombiniert
 *  - buildRrule: leer-Base, never/count/until
 *  - schoolYearEnd: vor/nach Juli, Schaltjahr
 *  - expandRecurringEvents: non-recurring durchreichen, DAILY, WEEKLY,
 *    EXDATE-Filter, kaputte rrule, Original-Instanz behaelt id+felder
 */
import { describe, it, expect } from 'vitest';
import { buildRrule, parseRruleEnd, schoolYearEnd, expandRecurringEvents } from './rrule-expand';
import type { CalendarEvent } from './calendar-types';

const baseEvent = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
    id: 'ev1',
    layerId: 'layer1',
    tenantId: 'tenant1',
    uid: 'uid-ev1',
    title: 'Test',
    description: null,
    location: null,
    dtstart: '2026-05-04T08:00:00.000Z',
    dtend: '2026-05-04T09:00:00.000Z',
    allDay: false,
    rrule: null,
    exdates: [],
    status: 'CONFIRMED',
    transparency: 'OPAQUE',
    color: null,
    categories: [],
    organizerId: 'user1',
    attendees: [],
    version: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    layer: { color: '#3b82f6', name: 'Test', level: 2 },
    ...overrides,
});

describe('parseRruleEnd', () => {
    it('leerer String → never', () => {
        expect(parseRruleEnd('')).toEqual({ base: '', end: { kind: 'never' } });
    });

    it('FREQ=WEEKLY ohne End → never', () => {
        expect(parseRruleEnd('FREQ=WEEKLY')).toEqual({
            base: 'FREQ=WEEKLY',
            end: { kind: 'never' },
        });
    });

    it('FREQ=WEEKLY;COUNT=10 → count:10', () => {
        expect(parseRruleEnd('FREQ=WEEKLY;COUNT=10')).toEqual({
            base: 'FREQ=WEEKLY',
            end: { kind: 'count', count: 10 },
        });
    });

    it('FREQ=DAILY;UNTIL=20260731T235959Z → until 2026-07-31', () => {
        expect(parseRruleEnd('FREQ=DAILY;UNTIL=20260731T235959Z')).toEqual({
            base: 'FREQ=DAILY',
            end: { kind: 'until', date: '2026-07-31' },
        });
    });

    it('Date-only UNTIL (8-stellig)', () => {
        expect(parseRruleEnd('FREQ=WEEKLY;UNTIL=20270131')).toEqual({
            base: 'FREQ=WEEKLY',
            end: { kind: 'until', date: '2027-01-31' },
        });
    });

    it('komplexes Pattern mit BYDAY bleibt im Base', () => {
        expect(parseRruleEnd('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=20')).toEqual({
            base: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
            end: { kind: 'count', count: 20 },
        });
    });
});

describe('buildRrule', () => {
    it('leeres Base → leerer String egal welches End', () => {
        expect(buildRrule('', { kind: 'never' })).toBe('');
        expect(buildRrule('', { kind: 'count', count: 5 })).toBe('');
        expect(buildRrule('', { kind: 'until', date: '2026-12-31' })).toBe('');
    });

    it('never gibt nur das Base zurueck', () => {
        expect(buildRrule('FREQ=WEEKLY', { kind: 'never' })).toBe('FREQ=WEEKLY');
    });

    it('count haengt COUNT=N an', () => {
        expect(buildRrule('FREQ=WEEKLY', { kind: 'count', count: 10 })).toBe('FREQ=WEEKLY;COUNT=10');
    });

    it('until haengt UNTIL=YYYYMMDDT235959Z an', () => {
        expect(buildRrule('FREQ=DAILY', { kind: 'until', date: '2026-07-31' }))
            .toBe('FREQ=DAILY;UNTIL=20260731T235959Z');
    });

    it('Roundtrip parse → build = identitaet', () => {
        const input = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=20';
        const { base, end } = parseRruleEnd(input);
        expect(buildRrule(base, end)).toBe(input);
    });
});

describe('schoolYearEnd', () => {
    it('vor 31.07. → diesjaehriger Sommer', () => {
        expect(schoolYearEnd(new Date('2026-03-15'))).toBe('2026-07-31');
    });

    it('am 31.07. selbst → diesjaehriger Sommer', () => {
        expect(schoolYearEnd(new Date('2026-07-31'))).toBe('2026-07-31');
    });

    it('nach 31.07. → naechster Sommer', () => {
        expect(schoolYearEnd(new Date('2026-08-15'))).toBe('2027-07-31');
    });

    it('Schaltjahr passt durch', () => {
        expect(schoolYearEnd(new Date('2024-02-29'))).toBe('2024-07-31');
    });
});

describe('expandRecurringEvents', () => {
    const from = new Date('2026-05-01T00:00:00.000Z');
    const to = new Date('2026-05-31T23:59:59.000Z');

    it('non-recurring Event wird unveraendert durchgereicht', () => {
        const ev = baseEvent({ rrule: null });
        const out = expandRecurringEvents([ev], from, to);
        expect(out).toHaveLength(1);
        expect(out[0]).toBe(ev); // referentiell gleich
    });

    it('FREQ=DAILY erzeugt eine Instanz pro Tag', () => {
        const ev = baseEvent({
            dtstart: '2026-05-04T08:00:00.000Z',
            dtend: '2026-05-04T09:00:00.000Z',
            rrule: 'FREQ=DAILY;COUNT=5',
        });
        const out = expandRecurringEvents([ev], from, to);
        expect(out).toHaveLength(5);
        // Erste Instanz = Original (gleiche dtstart)
        expect(out[0].dtstart).toBe('2026-05-04T08:00:00.000Z');
        // Letzte Instanz = Original + 4 Tage
        expect(out[4].dtstart).toBe('2026-05-08T08:00:00.000Z');
        // Alle haben Original-id
        expect(out.every(e => e.id === 'ev1')).toBe(true);
    });

    it('FREQ=WEEKLY erzeugt eine Instanz pro Woche', () => {
        const ev = baseEvent({
            dtstart: '2026-05-04T08:00:00.000Z', // Montag
            dtend: '2026-05-04T09:00:00.000Z',
            rrule: 'FREQ=WEEKLY',
        });
        const out = expandRecurringEvents([ev], from, to);
        // Mai 2026: Mo 4./11./18./25. → 4 Instanzen im Range
        expect(out).toHaveLength(4);
        expect(out[0].dtstart).toBe('2026-05-04T08:00:00.000Z');
        expect(out[1].dtstart).toBe('2026-05-11T08:00:00.000Z');
        expect(out[2].dtstart).toBe('2026-05-18T08:00:00.000Z');
        expect(out[3].dtstart).toBe('2026-05-25T08:00:00.000Z');
    });

    it('Dauer wird pro Instanz beibehalten', () => {
        const ev = baseEvent({
            dtstart: '2026-05-04T08:00:00.000Z',
            dtend: '2026-05-04T10:30:00.000Z', // 2.5h
            rrule: 'FREQ=WEEKLY;COUNT=2',
        });
        const out = expandRecurringEvents([ev], from, to);
        const dur0 = new Date(out[0].dtend!).getTime() - new Date(out[0].dtstart).getTime();
        const dur1 = new Date(out[1].dtend!).getTime() - new Date(out[1].dtstart).getTime();
        expect(dur0).toBe(dur1);
        expect(dur0).toBe(2.5 * 3600 * 1000);
    });

    it('EXDATE-Tage werden ausgenommen', () => {
        const ev = baseEvent({
            dtstart: '2026-05-04T08:00:00.000Z',
            dtend: '2026-05-04T09:00:00.000Z',
            rrule: 'FREQ=WEEKLY;COUNT=4',
            exdates: ['2026-05-11T08:00:00.000Z'], // 2. Woche ausnehmen
        });
        const out = expandRecurringEvents([ev], from, to);
        expect(out).toHaveLength(3);
        expect(out.map(e => e.dtstart)).toEqual([
            '2026-05-04T08:00:00.000Z',
            '2026-05-18T08:00:00.000Z',
            '2026-05-25T08:00:00.000Z',
        ]);
    });

    it('Original-Instanz behaelt alle Felder (kein Klone, gleiche Referenz)', () => {
        const ev = baseEvent({
            dtstart: '2026-05-04T08:00:00.000Z',
            rrule: 'FREQ=WEEKLY;COUNT=3',
        });
        const out = expandRecurringEvents([ev], from, to);
        // out[0] ist die Original-Instanz und wird per Referenz durchgereicht
        expect(out[0]).toBe(ev);
        // Folge-Instanzen sind Klone — id+title+layer gleich, dtstart anders
        expect(out[1]).not.toBe(ev);
        expect(out[1].id).toBe(ev.id);
        expect(out[1].title).toBe(ev.title);
        expect(out[1].layer).toBe(ev.layer);
    });

    it('Kaputte rrule → faellt auf Original-Event zurueck, kein Crash', () => {
        const ev = baseEvent({ rrule: 'TOTAL-JUNK-NICHT-RFC-5545' });
        const out = expandRecurringEvents([ev], from, to);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe('ev1');
    });

    it('Mehrere Events: gemischt recurring + nicht-recurring', () => {
        const a = baseEvent({ id: 'a', rrule: null, dtstart: '2026-05-10T10:00:00.000Z' });
        const b = baseEvent({ id: 'b', rrule: 'FREQ=DAILY;COUNT=3', dtstart: '2026-05-15T10:00:00.000Z' });
        const out = expandRecurringEvents([a, b], from, to);
        expect(out).toHaveLength(4); // 1× a + 3× b
        expect(out.filter(e => e.id === 'a')).toHaveLength(1);
        expect(out.filter(e => e.id === 'b')).toHaveLength(3);
    });

    it('Range-Beschneidung: nur Vorkommnisse im [from,to] werden zurueckgeliefert', () => {
        const ev = baseEvent({
            dtstart: '2026-05-04T08:00:00.000Z',
            rrule: 'FREQ=WEEKLY;COUNT=20', // 20 Wochen → laeuft bis September
        });
        const out = expandRecurringEvents([ev], from, to);
        // Mai 2026 = 4 Vorkommnisse, nicht alle 20
        expect(out.length).toBeLessThanOrEqual(5);
        for (const o of out) {
            const t = new Date(o.dtstart).getTime();
            expect(t).toBeGreaterThanOrEqual(from.getTime());
            expect(t).toBeLessThanOrEqual(to.getTime());
        }
    });
});

/**
 * Tests fuer Stundenplan-P1b Pure-Funktionen.
 * Pattern wie rrule-expand.test.ts — keine Mocks, deterministisch.
 */
import { describe, expect, it } from 'vitest';
import {
    compactTeacherLabel,
    freeSlots,
    groupStaffByRole,
    isTeamteaching,
    planningStatusKey,
    shortMatrixId,
    simulateMove,
    statusKey,
    weekParityKey,
} from './stundenplan-helpers';
import type {
    TimetableEntry,
    TimetableStaffAssignment,
} from '@/gateways/platform/stundenplan-gateway';

const baseAssignment = (
    overrides: Partial<TimetableStaffAssignment> = {},
): TimetableStaffAssignment => ({
    id: 'sa1',
    timetableEntryId: 'te1',
    teacherMatrixUserId: '@andreas:leander.prilog.team',
    role: 'lead',
    required: true,
    coverageMode: 'normal',
    sortOrder: 0,
    ...overrides,
});

const baseEntry = (overrides: Partial<TimetableEntry> = {}): TimetableEntry => ({
    id: 'e1',
    tenantId: 't1',
    revisionGroupId: 'rg1',
    version: 1,
    status: 'active',
    planningStatus: 'published',
    weekday: 1,
    periodSlotId: 'p1',
    weekParity: null,
    roomId: null,
    instructionGroupId: 'ig1',
    subjectId: 's1',
    subjectKey: 'MA',
    classSpaceId: null,
    groupKey: null,
    scenarioId: null,
    origin: 'manual',
    source: 'manual',
    validFrom: '2026-08-01T00:00:00.000Z',
    validUntil: null,
    ...overrides,
});

describe('weekParityKey', () => {
    it('null → weekly', () => {
        expect(weekParityKey(null)).toBe('stundenplan.week_parity_weekly');
    });
    it('even / odd', () => {
        expect(weekParityKey('even')).toBe('stundenplan.week_parity_even');
        expect(weekParityKey('odd')).toBe('stundenplan.week_parity_odd');
    });
});

describe('planningStatusKey / statusKey', () => {
    it('liefert namespaced Key fuer jeden Wert', () => {
        expect(planningStatusKey('draft')).toBe('stundenplan.planning_status_draft');
        expect(planningStatusKey('published')).toBe('stundenplan.planning_status_published');
        expect(planningStatusKey('archived')).toBe('stundenplan.planning_status_archived');
        expect(statusKey('active')).toBe('stundenplan.entry_status_active');
        expect(statusKey('superseded')).toBe('stundenplan.entry_status_superseded');
        expect(statusKey('retired')).toBe('stundenplan.entry_status_retired');
    });
});

describe('shortMatrixId', () => {
    it('extrahiert local-part', () => {
        expect(shortMatrixId('@andreas:leander.prilog.team')).toBe('@andreas');
    });
    it('laesst Strings ohne : durch', () => {
        expect(shortMatrixId('@andreas')).toBe('@andreas');
    });
});

describe('groupStaffByRole', () => {
    it('leer-Input → leer-Output', () => {
        expect(groupStaffByRole([])).toEqual([]);
    });
    it('gruppiert nach role und sortiert nach sortOrder', () => {
        const out = groupStaffByRole([
            baseAssignment({ id: '2', role: 'lead', sortOrder: 2, teacherMatrixUserId: '@b:x' }),
            baseAssignment({ id: '1', role: 'lead', sortOrder: 1, teacherMatrixUserId: '@a:x' }),
            baseAssignment({ id: '3', role: 'support', sortOrder: 3, teacherMatrixUserId: '@c:x' }),
        ]);
        expect(out).toHaveLength(2);
        expect(out[0]!.role).toBe('lead');
        expect(out[0]!.entries.map((e) => e.id)).toEqual(['1', '2']);
        expect(out[1]!.role).toBe('support');
        expect(out[1]!.entries.map((e) => e.id)).toEqual(['3']);
    });
});

describe('simulateMove (P1d)', () => {
    it('verschiebt einen Eintrag auf neue (weekday, periodSlot)', () => {
        const entries = [
            baseEntry({ id: 'a', weekday: 1, periodSlotId: 'p1' }),
            baseEntry({ id: 'b', weekday: 2, periodSlotId: 'p2' }),
        ];
        const out = simulateMove(entries, { entryId: 'a', toWeekday: 5, toPeriodSlotId: 'p3' });
        expect(out[0]!.weekday).toBe(5);
        expect(out[0]!.periodSlotId).toBe('p3');
        // andere unveraendert
        expect(out[1]!.weekday).toBe(2);
        // Original-Array unveraendert (no mutate)
        expect(entries[0]!.weekday).toBe(1);
    });
    it('liefert unveraendert bei unbekannter id', () => {
        const entries = [baseEntry({ id: 'a' })];
        const out = simulateMove(entries, { entryId: 'unknown', toWeekday: 5, toPeriodSlotId: 'p3' });
        expect(out).toEqual(entries);
    });
});

describe('freeSlots (P1d Freie-Slots-Diagnose)', () => {
    it('leerer Plan: alle Zellen frei', () => {
        const f = freeSlots([], { weekdays: [1, 2], periodSlotIds: ['p1', 'p2'] });
        expect(f.size).toBe(4);
        expect(f.has('1|p1')).toBe(true);
        expect(f.has('2|p2')).toBe(true);
    });
    it('belegte Zelle ist nicht frei', () => {
        const entries = [baseEntry({ id: 'a', weekday: 1, periodSlotId: 'p1' })];
        const f = freeSlots(entries, { weekdays: [1, 2], periodSlotIds: ['p1', 'p2'] });
        expect(f.has('1|p1')).toBe(false);
        expect(f.size).toBe(3);
    });
});

describe('isTeamteaching / compactTeacherLabel', () => {
    it('keine Teacher', () => {
        const e = baseEntry({ staffAssignments: [] });
        expect(isTeamteaching(e)).toBe(false);
        expect(compactTeacherLabel(e).kind).toBe('none');
    });
    it('genau ein Teacher', () => {
        const e = baseEntry({ staffAssignments: [baseAssignment()] });
        expect(isTeamteaching(e)).toBe(false);
        const c = compactTeacherLabel(e);
        expect(c.kind).toBe('single');
        expect(c.label).toBe('@andreas');
    });
    it('Teamteaching ab 2 Teacher', () => {
        const e = baseEntry({
            staffAssignments: [
                baseAssignment({ id: '1' }),
                baseAssignment({ id: '2', teacherMatrixUserId: '@b:x' }),
                baseAssignment({ id: '3', teacherMatrixUserId: '@c:x' }),
            ],
        });
        expect(isTeamteaching(e)).toBe(true);
        const c = compactTeacherLabel(e);
        expect(c.kind).toBe('team');
        expect(c.count).toBe(3);
    });
    it('undefined staffAssignments verhaelt sich wie leer', () => {
        const e = baseEntry({ staffAssignments: undefined });
        expect(isTeamteaching(e)).toBe(false);
        expect(compactTeacherLabel(e).kind).toBe('none');
    });
});

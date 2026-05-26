import { describe, it, expect } from 'vitest';
import type { Contact } from './use-contacts';

// Test the filtering logic used in space-info-panel and contacts-hub

function filterPotentialContacts(
    contacts: Contact[],
    spaceUserTypes: Array<{ label: string }>,
): Contact[] {
    // This mirrors the logic in space-info-panel.tsx SpaceMembersList
    return spaceUserTypes.length > 0
        ? contacts.filter((c) => c.userType && spaceUserTypes.some((ut) => ut.label === c.userType))
        : [];
}

function filterFamilyDialogContacts(
    contacts: Contact[],
    personIsChild: boolean,
    mode: 'contact' | 'child',
    personUserId: string,
): Contact[] {
    let list = contacts.filter(c => c.id !== personUserId);

    if (mode === 'contact' && personIsChild) {
        list = list.filter(c => c.audience !== 'minor');
    }
    if (mode === 'child') {
        list = list.filter(c => c.audience === 'minor');
    }

    return list;
}

const mockContacts: Contact[] = [
    { id: '1', username: 'lehrer1', displayName: 'Max Lehrer', email: null, userType: 'Mitarbeiter', audience: 'staff' },
    { id: '2', username: 'eltern1', displayName: 'Anna Becker', email: null, userType: 'Eltern', audience: 'guardian' },
    { id: '3', username: 'schueler1', displayName: 'Tim Becker', email: null, userType: 'Schueler', audience: 'minor' },
    { id: '4', username: 'schueler2', displayName: 'Lisa Mueller', email: null, userType: 'Schueler', audience: 'minor' },
    { id: '5', username: 'extern1', displayName: 'Dr. Schmidt', email: null, userType: 'Externe', audience: 'external' },
];

describe('space potential contacts (Deny by Default)', () => {
    it('returns empty list when space has no userTypes', () => {
        const result = filterPotentialContacts(mockContacts, []);
        expect(result).toEqual([]);
    });

    it('returns only matching userType when space has userTypes', () => {
        const result = filterPotentialContacts(mockContacts, [{ label: 'Mitarbeiter' }]);
        expect(result).toHaveLength(1);
        expect(result[0].displayName).toBe('Max Lehrer');
    });

    it('returns multiple matching types', () => {
        const result = filterPotentialContacts(mockContacts, [{ label: 'Mitarbeiter' }, { label: 'Eltern' }]);
        expect(result).toHaveLength(2);
    });
});

describe('family dialog filtering (audience-based)', () => {
    it('adding contact to child: excludes other children', () => {
        const result = filterFamilyDialogContacts(mockContacts, true, 'contact', '3');
        expect(result.every(c => c.audience !== 'minor')).toBe(true);
        expect(result.map(c => c.displayName)).toContain('Anna Becker');
        expect(result.map(c => c.displayName)).toContain('Max Lehrer');
        expect(result.map(c => c.displayName)).not.toContain('Lisa Mueller');
    });

    it('adding child to adult: only shows children', () => {
        const result = filterFamilyDialogContacts(mockContacts, false, 'child', '2');
        expect(result.every(c => c.audience === 'minor')).toBe(true);
        expect(result).toHaveLength(2); // Tim + Lisa
    });

    it('excludes the person themselves', () => {
        const result = filterFamilyDialogContacts(mockContacts, true, 'contact', '3');
        expect(result.map(c => c.id)).not.toContain('3');
    });

    it('uses audience field, not string matching on userType', () => {
        // A user with userType "Forschende" (contains "sch") but audience "staff"
        // must NOT be filtered out
        const edgeCase: Contact[] = [
            ...mockContacts,
            { id: '6', username: 'forsch', displayName: 'Dr. Forscher', email: null, userType: 'Forschende', audience: 'staff' },
        ];
        const result = filterFamilyDialogContacts(edgeCase, true, 'contact', '3');
        expect(result.map(c => c.displayName)).toContain('Dr. Forscher');
    });
});

describe('family dialog sorting (last name match)', () => {
    it('sorts contacts with matching last name first', () => {
        const personLastName = 'becker';
        const sorted = [...mockContacts]
            .filter(c => c.audience !== 'minor')
            .sort((a, b) => {
                const aLast = a.displayName.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
                const bLast = b.displayName.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
                const aMatch = personLastName && aLast === personLastName ? 0 : 1;
                const bMatch = personLastName && bLast === personLastName ? 0 : 1;
                if (aMatch !== bMatch) return aMatch - bMatch;
                return a.displayName.localeCompare(b.displayName, 'de');
            });

        // Anna Becker should be first (matching last name)
        expect(sorted[0].displayName).toBe('Anna Becker');
    });
});

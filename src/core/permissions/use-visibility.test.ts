import { describe, it, expect } from 'vitest';

// Test the visibility logic directly (without React hooks)
// This mirrors the logic in use-visibility.ts

function isVisible(
    key: string,
    audience: string,
    userTypeKey: string | null,
    matrix: Record<string, Record<string, boolean>> | null,
): boolean {
    if (!matrix || !userTypeKey) return true;
    if (audience === 'staff') return true;

    const typeConfig = matrix[userTypeKey];
    if (!typeConfig) return true;
    return typeConfig[key] !== false;
}

describe('visibility logic', () => {
    const matrix = {
        mitarbeiter_innen: { hub_contacts: true, tab_files: true },
        schueler_in: { hub_contacts: false, tab_files: false, tab_chat: true },
        elternteil: { hub_contacts: false, tab_chat: true },
    };

    it('staff sees everything regardless of matrix config', () => {
        expect(isVisible('hub_contacts', 'staff', 'mitarbeiter_innen', matrix)).toBe(true);
        expect(isVisible('anything', 'staff', 'mitarbeiter_innen', matrix)).toBe(true);
    });

    it('staff detection works with any userTypeKey (not hardcoded)', () => {
        // This was the bug: hardcoded 'mitarbeiter' didn't match 'mitarbeiter_innen'
        expect(isVisible('hub_contacts', 'staff', 'mitarbeiter_innen', matrix)).toBe(true);
        expect(isVisible('hub_contacts', 'staff', 'lehrkraefte', matrix)).toBe(true);
        expect(isVisible('hub_contacts', 'staff', 'verwaltung', matrix)).toBe(true);
    });

    it('minor cannot see hub_contacts when matrix says false', () => {
        expect(isVisible('hub_contacts', 'minor', 'schueler_in', matrix)).toBe(false);
    });

    it('minor can see tab_chat when matrix says true', () => {
        expect(isVisible('tab_chat', 'minor', 'schueler_in', matrix)).toBe(true);
    });

    it('guardian follows matrix config', () => {
        expect(isVisible('hub_contacts', 'guardian', 'elternteil', matrix)).toBe(false);
        expect(isVisible('tab_chat', 'guardian', 'elternteil', matrix)).toBe(true);
    });

    it('unknown keys default to visible', () => {
        expect(isVisible('unknown_feature', 'minor', 'schueler_in', matrix)).toBe(true);
    });

    it('without matrix, everything is visible', () => {
        expect(isVisible('hub_contacts', 'minor', 'schueler_in', null)).toBe(true);
    });

    it('without userTypeKey, everything is visible', () => {
        expect(isVisible('hub_contacts', 'minor', null, matrix)).toBe(true);
    });
});

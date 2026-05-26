import { describe, it, expect } from 'vitest';
import { evalViewBlock } from './view-definitions-gateway';

describe('evalViewBlock — P1.4 UI-Entscheidung', () => {
    it('Gate aus → kein Block (bestehendes Client-Verhalten bleibt)', () => {
        expect(evalViewBlock({ eligible: false }, { resolvable: false, hits: [{ reasonCode: 'FIELD_NOT_REGISTERED' }] })).toBeNull();
    });
    it('Gate scharf + auflösbar → kein Block', () => {
        expect(evalViewBlock({ eligible: true }, { resolvable: true, hits: [] })).toBeNull();
    });
    it('Gate scharf + nicht auflösbar → Block mit reasonCode', () => {
        expect(evalViewBlock(
            { eligible: true },
            { resolvable: false, hits: [{ reasonCode: 'FIELD_NOT_SUPPORTED_FOR_BACKEND' }] },
        )).toEqual({ reason: 'FIELD_NOT_SUPPORTED_FOR_BACKEND' });
    });
    it('nicht auflösbar ohne hits → generischer Grund, nie stilles 0', () => {
        expect(evalViewBlock({ eligible: true }, { resolvable: false, hits: [] }))
            .toEqual({ reason: 'UNRESOLVABLE' });
    });
});

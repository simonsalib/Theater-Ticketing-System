import { describe, expect, it } from 'vitest';
import { createSeatKey, parseSeatKey } from './seatKey';

describe('seat key serialization', () => {
    it('round-trips row names that contain hyphens', () => {
        const key = createSeatKey('balcony', 'BALC-A', 12);

        expect(key).toBe('balcony-BALC-A-12');
        expect(parseSeatKey(key)).toEqual({
            section: 'balcony',
            row: 'BALC-A',
            seatNumber: 12,
        });
    });

    it('rejects malformed seat keys instead of creating a NaN seat number', () => {
        expect(parseSeatKey('balcony-BALC-A-not-a-number')).toBeNull();
        expect(parseSeatKey('missing-parts')).toBeNull();
    });
});

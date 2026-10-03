import { describe, expect, it } from 'vitest';
import { findActiveUnpaidBooking } from './unpaidBooking';

const now = Date.parse('2026-10-03T12:00:00Z');

describe('active unpaid booking', () => {
    it('finds an unpaid booking with time remaining', () => {
        expect(findActiveUnpaidBooking([
            { _id: 'paid', status: 'pending', isReceiptUploaded: true, pendingExpiresAt: '2026-10-03T13:00:00Z' },
            { _id: 'active', status: 'pending', isReceiptUploaded: false, pendingExpiresAt: '2026-10-03T13:00:00Z' },
        ], now)?._id).toBe('active');
    });

    it('does not block after expiry or receipt upload', () => {
        expect(findActiveUnpaidBooking([
            { _id: 'expired', status: 'pending', pendingExpiresAt: '2026-10-03T11:59:00Z' },
            { _id: 'paid', status: 'pending', isReceiptUploaded: true, pendingExpiresAt: '2026-10-03T13:00:00Z' },
        ], now)).toBeNull();
    });
});

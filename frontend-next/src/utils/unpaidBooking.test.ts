import { describe, expect, it } from 'vitest';
import { findActiveUnpaidBookings, getUnpaidBookingEventId } from './unpaidBooking';

const now = Date.parse('2026-10-03T12:00:00Z');

describe('active unpaid booking', () => {
    it('finds an unpaid booking with time remaining', () => {
        expect(findActiveUnpaidBookings([
            { _id: 'paid', status: 'pending', isReceiptUploaded: true, pendingExpiresAt: '2026-10-03T13:00:00Z' },
            { _id: 'active', eventId: 'event-1', status: 'pending', isReceiptUploaded: false, pendingExpiresAt: '2026-10-03T13:00:00Z' },
            { _id: 'other', eventId: { _id: 'event-2', title: 'Other event' }, status: 'pending', pendingExpiresAt: '2026-10-03T13:00:00Z' },
        ], now).map(booking => getUnpaidBookingEventId(booking))).toEqual(['event-1', 'event-2']);
    });

    it('accepts the older unpaid-only response without status', () => {
        expect(findActiveUnpaidBookings([
            { _id: 'active', pendingExpiresAt: '2026-10-03T13:00:00Z' },
        ], now)).toEqual([expect.objectContaining({ _id: 'active', status: 'pending' })]);
    });

    it('does not block after expiry or receipt upload', () => {
        expect(findActiveUnpaidBookings([
            { _id: 'expired', status: 'pending', pendingExpiresAt: '2026-10-03T11:59:00Z' },
            { _id: 'paid', status: 'pending', isReceiptUploaded: true, pendingExpiresAt: '2026-10-03T13:00:00Z' },
        ], now)).toEqual([]);
    });
});

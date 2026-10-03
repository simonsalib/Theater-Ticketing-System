export interface UnpaidBooking {
    _id: string;
    status: string;
    pendingExpiresAt: string;
    isReceiptUploaded?: boolean;
    eventId?: string | { _id: string; title?: string };
    numberOfTickets?: number;
}

export function getUnpaidBookingEventId(booking: UnpaidBooking): string | undefined {
    return typeof booking.eventId === 'string' ? booking.eventId : booking.eventId?._id;
}

export function findActiveUnpaidBookings(value: unknown, now = Date.now()): UnpaidBooking[] {
    if (!Array.isArray(value)) return [];

    const active: UnpaidBooking[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const booking = item as Partial<UnpaidBooking>;
        // Older versions of the unpaid-only endpoint omitted status from their projection.
        if (typeof booking._id !== 'string' || (booking.status !== undefined && booking.status !== 'pending') || booking.isReceiptUploaded) continue;
        if (typeof booking.pendingExpiresAt !== 'string') continue;
        if (new Date(booking.pendingExpiresAt).getTime() <= now) continue;
        active.push({ ...booking, status: 'pending' } as UnpaidBooking);
    }
    return active;
}

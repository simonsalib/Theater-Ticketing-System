export interface UnpaidBooking {
    _id: string;
    status: string;
    pendingExpiresAt: string;
    isReceiptUploaded?: boolean;
    eventId?: string | { _id: string; title?: string };
    numberOfTickets?: number;
}

export function findActiveUnpaidBooking(value: unknown, now = Date.now()): UnpaidBooking | null {
    if (!Array.isArray(value)) return null;

    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const booking = item as Partial<UnpaidBooking>;
        if (typeof booking._id !== 'string' || booking.status !== 'pending' || booking.isReceiptUploaded) continue;
        if (typeof booking.pendingExpiresAt !== 'string') continue;
        if (new Date(booking.pendingExpiresAt).getTime() > now) return booking as UnpaidBooking;
    }
    return null;
}

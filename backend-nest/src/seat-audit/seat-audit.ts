export interface AuditSeat {
  row?: string;
  seatRow?: string;
  seatNumber: number;
  section?: string;
  bookingId?: unknown;
  holdId?: unknown;
}

export interface AuditBooking {
  _id: unknown;
  StandardId: unknown;
  status: string;
  numberOfTickets: number;
  selectedSeats?: AuditSeat[];
  pendingExpiresAt?: Date;
  isReceiptUploaded?: boolean;
}

export interface AuditHold {
  _id: unknown;
  userId: unknown;
  seats: AuditSeat[];
  expiresAt: Date;
}

export interface AuditTicket extends AuditSeat {
  _id: unknown;
  bookingId: unknown;
  userId: unknown;
  qrData?: string;
  hasQrImage: boolean;
}

export interface AuditSnapshot {
  event: {
    _id: unknown;
    totalTickets: number;
    remainingTickets: number;
    bookedSeats: AuditSeat[];
  };
  bookings: AuditBooking[];
  holds: AuditHold[];
  tickets: AuditTicket[];
  userIds: string[];
}

export interface SeatAuditIssue {
  code: string;
  seat?: string;
  reference?: string;
}

export interface SeatAuditReport {
  eventId: string;
  checkedAt: string;
  counts: {
    capacity: number;
    remaining: number;
    occupied: number;
    organizerBlocked: number;
    confirmedSeats: number;
    pendingSeats: number;
    heldSeats: number;
    tickets: number;
  };
  issues: SeatAuditIssue[];
}

export const auditId = (value: unknown): string => {
  if (value == null) return '';
  if (['string', 'number', 'bigint', 'boolean'].includes(typeof value)) {
    return `${value as string | number | bigint | boolean}`;
  }
  if (typeof value === 'object' && 'toHexString' in value) {
    const method = value.toHexString;
    if (typeof method === 'function') {
      const result: unknown = Reflect.apply(method, value, []);
      if (typeof result === 'string') return result;
    }
  }
  return '';
};
export const auditSeatKey = (seat: AuditSeat): string =>
  `${seat.section || 'main'}-${seat.row ?? seat.seatRow}-${Number(seat.seatNumber)}`;
export const issueKey = (issue: SeatAuditIssue): string =>
  JSON.stringify(issue);

// Pure rules shared by the CLI, scheduled monitor and concurrency tests.
// No attendee details or QR payloads are included in the returned report.
export function auditSeats(
  snapshot: AuditSnapshot,
  now = new Date(),
  expiryGraceMs = 120_000,
): SeatAuditReport {
  const { event, bookings, holds, tickets } = snapshot;
  const issues: SeatAuditIssue[] = [];
  const add = (code: string, seat?: string, reference?: unknown) => {
    issues.push({
      code,
      ...(seat ? { seat } : {}),
      ...(reference ? { reference: auditId(reference) } : {}),
    });
  };
  const users = new Set(snapshot.userIds);
  const bookingById = new Map(bookings.map((b) => [auditId(b._id), b]));
  const holdById = new Map(holds.map((h) => [auditId(h._id), h]));
  const occupied = new Map<string, AuditSeat[]>();
  const claims = new Map<string, string[]>();
  const qrOwners = new Map<string, AuditTicket[]>();
  const ticketsBySeat = new Map<string, AuditTicket[]>();
  const ticketsByBookingSeat = new Map<string, AuditTicket[]>();
  const active = (booking: AuditBooking) =>
    ['pending', 'confirmed'].includes(booking.status);
  const claim = (s: AuditSeat, owner: string) => {
    const key = auditSeatKey(s);
    claims.set(key, [...(claims.get(key) || []), owner]);
  };

  for (const t of tickets) {
    const key = auditSeatKey(t);
    ticketsBySeat.set(key, [...(ticketsBySeat.get(key) || []), t]);
    const ownerKey = `${auditId(t.bookingId)}/${key}`;
    ticketsByBookingSeat.set(ownerKey, [
      ...(ticketsByBookingSeat.get(ownerKey) || []),
      t,
    ]);
    if (t.qrData)
      qrOwners.set(t.qrData, [...(qrOwners.get(t.qrData) || []), t]);
    else add('MISSING_QR_DATA', key, t._id);
    if (!t.hasQrImage) add('MISSING_QR_IMAGE', key, t._id);
    const booking = bookingById.get(auditId(t.bookingId));
    if (!booking || booking.status !== 'confirmed')
      add('TICKET_WITHOUT_CONFIRMED_BOOKING', key, t._id);
    if (
      booking &&
      !(booking.selectedSeats || []).some((s) => auditSeatKey(s) === key)
    )
      add('TICKET_OUTSIDE_BOOKING', key, t._id);
    if (booking && auditId(t.userId) !== auditId(booking.StandardId))
      add('TICKET_USER_MISMATCH', key, t._id);
  }

  for (const s of event.bookedSeats) {
    const key = auditSeatKey(s);
    occupied.set(key, [...(occupied.get(key) || []), s]);
    if (s.bookingId && s.holdId) add('AMBIGUOUS_SEAT_OWNER', key);
    if (s.bookingId) {
      const booking = bookingById.get(auditId(s.bookingId));
      if (!booking || !active(booking))
        add('GHOST_BOOKING_SEAT', key, s.bookingId);
      else if (
        !(booking.selectedSeats || []).some((x) => auditSeatKey(x) === key)
      )
        add('SEAT_OUTSIDE_BOOKING', key, s.bookingId);
    }
    if (s.holdId) {
      const hold = holdById.get(auditId(s.holdId));
      if (!hold) add('GHOST_HOLD_SEAT', key, s.holdId);
      else if (!hold.seats.some((x) => auditSeatKey(x) === key))
        add('SEAT_OUTSIDE_HOLD', key, s.holdId);
    }
    // Ownerless entries are explicitly reserved by the organizer in this schema.
  }
  for (const [key, entries] of occupied)
    if (entries.length > 1) add('DUPLICATE_EVENT_SEAT', key);

  for (const b of bookings.filter(active)) {
    const seats = b.selectedSeats || [];
    if (!users.has(auditId(b.StandardId)))
      add('BOOKING_WITHOUT_USER', undefined, b._id);
    if (seats.length !== b.numberOfTickets)
      add('BOOKING_QUANTITY_MISMATCH', undefined, b._id);
    if (
      b.status === 'pending' &&
      !b.isReceiptUploaded &&
      b.pendingExpiresAt &&
      new Date(b.pendingExpiresAt).getTime() + expiryGraceMs <= now.getTime()
    )
      add('EXPIRED_PENDING_BOOKING', undefined, b._id);
    for (const s of seats) {
      const key = auditSeatKey(s);
      claim(s, `booking:${auditId(b._id)}`);
      const matches = (occupied.get(key) || []).filter(
        (x) => auditId(x.bookingId) === auditId(b._id),
      );
      if (matches.length !== 1) add('ORPHAN_BOOKING_SEAT', key, b._id);
      const qrCount = (
        ticketsByBookingSeat.get(`${auditId(b._id)}/${key}`) || []
      ).length;
      if (b.status === 'confirmed' && qrCount !== 1)
        add('CONFIRMED_SEAT_QR_COUNT', key, b._id);
      if (b.status === 'pending' && qrCount !== 0)
        add('PENDING_SEAT_HAS_QR', key, b._id);
    }
  }
  for (const h of holds) {
    if (!users.has(auditId(h.userId)))
      add('HOLD_WITHOUT_USER', undefined, h._id);
    if (new Date(h.expiresAt).getTime() <= now.getTime()) {
      if (new Date(h.expiresAt).getTime() + expiryGraceMs <= now.getTime())
        add('EXPIRED_HOLD', undefined, h._id);
      continue;
    }
    for (const s of h.seats) {
      const key = auditSeatKey(s);
      claim(s, `hold:${auditId(h._id)}`);
      if (
        (occupied.get(key) || []).filter(
          (x) => auditId(x.holdId) === auditId(h._id),
        ).length !== 1
      )
        add('ORPHAN_HOLD_SEAT', key, h._id);
    }
  }
  for (const [key, owners] of claims)
    if (owners.length > 1) add('MULTIPLE_SEAT_CLAIMS', key);
  for (const [key, records] of ticketsBySeat)
    if (records.length > 1) add('MULTIPLE_SEAT_TICKETS', key);
  for (const records of qrOwners.values())
    if (records.length > 1) {
      for (const ticket of records)
        add('DUPLICATE_QR', auditSeatKey(ticket), ticket._id);
    }
  if (
    event.remainingTickets !== event.totalTickets - event.bookedSeats.length ||
    event.remainingTickets < 0 ||
    event.remainingTickets > event.totalTickets
  )
    add('REMAINING_TICKETS_MISMATCH');

  return {
    eventId: auditId(event._id),
    checkedAt: now.toISOString(),
    counts: {
      capacity: event.totalTickets,
      remaining: event.remainingTickets,
      occupied: event.bookedSeats.length,
      organizerBlocked: event.bookedSeats.filter(
        (s) => !s.bookingId && !s.holdId,
      ).length,
      confirmedSeats: bookings
        .filter((b) => b.status === 'confirmed')
        .reduce((n, b) => n + (b.selectedSeats || []).length, 0),
      pendingSeats: bookings
        .filter((b) => b.status === 'pending')
        .reduce((n, b) => n + (b.selectedSeats || []).length, 0),
      heldSeats: holds
        .filter((h) => new Date(h.expiresAt) > now)
        .reduce((n, h) => n + h.seats.length, 0),
      tickets: tickets.length,
    },
    issues: [...new Map(issues.map((i) => [issueKey(i), i])).values()],
  };
}

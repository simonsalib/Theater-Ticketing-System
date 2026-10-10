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
  eventId?: unknown;
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
  theaterLayout?: AuditTheaterLayout | null;
}

export interface AuditTheaterLayout {
  mainFloor: { rows: number; seatsPerRow: number; rowLabels?: string[] };
  hasBalcony: boolean;
  balcony?: { rows: number; seatsPerRow: number; rowLabels?: string[] } | null;
  removedSeats?: string[];
  disabledSeats?: string[];
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
  sections: Record<
    'main' | 'balcony',
    {
      occupied: number;
      organizerBlocked: number;
      confirmedSeats: number;
      pendingSeats: number;
      heldSeats: number;
      tickets: number;
    }
  >;
  organizerBlockedSeats: string[];
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
  const validLayoutSeat = (seat: AuditSeat): boolean => {
    const layout = snapshot.theaterLayout;
    if (!layout) return true;
    const section = seat.section || 'main';
    if (section !== 'main' && section !== 'balcony') return false;
    if (section === 'balcony' && !layout.hasBalcony) return false;
    const floor = section === 'main' ? layout.mainFloor : layout.balcony;
    if (!floor) return false;
    const rows = floor.rowLabels?.length
      ? floor.rowLabels
      : Array.from(
          { length: Number(floor.rows) || 0 },
          (_, index) =>
            `${section === 'balcony' ? 'BALC-' : ''}${String.fromCharCode(65 + index)}`,
        );
    const key = auditSeatKey(seat);
    return (
      rows.includes(String(seat.row ?? seat.seatRow)) &&
      Number.isInteger(seat.seatNumber) &&
      seat.seatNumber >= 1 &&
      seat.seatNumber <= Number(floor.seatsPerRow) &&
      !layout.removedSeats?.includes(key) &&
      !layout.disabledSeats?.includes(key)
    );
  };
  const checkLayoutSeat = (seat: AuditSeat, reference?: unknown) => {
    if (!validLayoutSeat(seat))
      add('UNAVAILABLE_OR_UNKNOWN_SEAT', auditSeatKey(seat), reference);
  };
  const claim = (s: AuditSeat, owner: string) => {
    const key = auditSeatKey(s);
    claims.set(key, [...(claims.get(key) || []), owner]);
  };

  if (snapshot.theaterLayout === null) add('THEATER_NOT_FOUND');

  for (const t of tickets) {
    const key = auditSeatKey(t);
    checkLayoutSeat(t, t._id);
    if (t.eventId && auditId(t.eventId) !== auditId(event._id))
      add('TICKET_EVENT_MISMATCH', key, t._id);
    ticketsBySeat.set(key, [...(ticketsBySeat.get(key) || []), t]);
    const ownerKey = `${auditId(t.bookingId)}/${key}`;
    ticketsByBookingSeat.set(ownerKey, [
      ...(ticketsByBookingSeat.get(ownerKey) || []),
      t,
    ]);
    if (t.qrData?.trim())
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
    checkLayoutSeat(s);
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
      checkLayoutSeat(s, b._id);
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
      checkLayoutSeat(s, h._id);
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

  const sections = Object.fromEntries(
    (['main', 'balcony'] as const).map((section) => {
      const inSection = (seat: AuditSeat) =>
        (seat.section || 'main') === section;
      return [
        section,
        {
          occupied: event.bookedSeats.filter(inSection).length,
          organizerBlocked: event.bookedSeats.filter(
            (seat) => inSection(seat) && !seat.bookingId && !seat.holdId,
          ).length,
          confirmedSeats: bookings
            .filter((b) => b.status === 'confirmed')
            .reduce(
              (n, b) => n + (b.selectedSeats || []).filter(inSection).length,
              0,
            ),
          pendingSeats: bookings
            .filter((b) => b.status === 'pending')
            .reduce(
              (n, b) => n + (b.selectedSeats || []).filter(inSection).length,
              0,
            ),
          heldSeats: holds
            .filter((h) => new Date(h.expiresAt) > now)
            .reduce((n, h) => n + h.seats.filter(inSection).length, 0),
          tickets: tickets.filter(inSection).length,
        },
      ];
    }),
  ) as SeatAuditReport['sections'];

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
    sections,
    organizerBlockedSeats: event.bookedSeats
      .filter((seat) => !seat.bookingId && !seat.holdId)
      .map(auditSeatKey)
      .sort(),
    issues: [...new Map(issues.map((i) => [issueKey(i), i])).values()],
  };
}

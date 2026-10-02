import { auditSeats, AuditSnapshot } from './seat-audit';

const snapshot = (): AuditSnapshot => ({
  event: {
    _id: 'event-1',
    totalTickets: 2,
    remainingTickets: 1,
    bookedSeats: [
      { row: 'A', seatNumber: 1, section: 'main', bookingId: 'booking-1' },
    ],
  },
  bookings: [
    {
      _id: 'booking-1',
      StandardId: 'user-1',
      status: 'confirmed',
      numberOfTickets: 1,
      selectedSeats: [{ row: 'A', seatNumber: 1, section: 'main' }],
    },
  ],
  holds: [],
  tickets: [
    {
      _id: 'ticket-1',
      bookingId: 'booking-1',
      userId: 'user-1',
      seatRow: 'A',
      seatNumber: 1,
      section: 'main',
      qrData: 'unique-qr',
      hasQrImage: true,
    },
  ],
  userIds: ['user-1'],
});

describe('seat integrity rules', () => {
  it('accepts exactly one user and one QR for a confirmed seat', () => {
    expect(auditSeats(snapshot()).issues).toEqual([]);
  });

  it('finds double claims and duplicate seat QR records without exposing QR payloads', () => {
    const data = snapshot();
    data.bookings.push({
      _id: 'booking-2',
      StandardId: 'user-2',
      status: 'confirmed',
      numberOfTickets: 1,
      selectedSeats: [{ row: 'A', seatNumber: 1, section: 'main' }],
    });
    data.tickets.push({
      _id: 'ticket-2',
      bookingId: 'booking-2',
      userId: 'user-2',
      seatRow: 'A',
      seatNumber: 1,
      section: 'main',
      qrData: 'second-secret-qr',
      hasQrImage: true,
    });
    data.userIds.push('user-2');
    const report = auditSeats(data);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'MULTIPLE_SEAT_CLAIMS',
        'MULTIPLE_SEAT_TICKETS',
        'ORPHAN_BOOKING_SEAT',
      ]),
    );
    expect(JSON.stringify(report)).not.toContain('second-secret-qr');
  });

  it('finds ghost and orphan seats while allowing organizer-blocked seats', () => {
    const data = snapshot();
    data.event.totalTickets = 4;
    data.event.remainingTickets = 1;
    data.event.bookedSeats.push(
      {
        row: 'A',
        seatNumber: 2,
        section: 'main',
        bookingId: 'missing-booking',
      },
      { row: 'A', seatNumber: 3, section: 'main' },
    );
    data.bookings[0].selectedSeats!.push({
      row: 'A',
      seatNumber: 4,
      section: 'main',
    });
    data.bookings[0].numberOfTickets = 2;
    const codes = auditSeats(data).issues.map((issue) => issue.code);
    expect(codes).toContain('GHOST_BOOKING_SEAT');
    expect(codes).toContain('ORPHAN_BOOKING_SEAT');
    expect(codes).not.toContain('GHOST_ORGANIZER_SEAT');
  });
});

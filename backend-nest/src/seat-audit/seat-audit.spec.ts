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
    const report = auditSeats(data);
    const codes = report.issues.map((issue) => issue.code);
    expect(codes).toContain('GHOST_BOOKING_SEAT');
    expect(codes).toContain('ORPHAN_BOOKING_SEAT');
    expect(codes).not.toContain('GHOST_ORGANIZER_SEAT');
    expect(report.organizerBlockedSeats).toEqual(['main-A-3']);
  });

  it('audits main floor and balcony separately, including one user and QR per seat', () => {
    const data = snapshot();
    data.event.totalTickets = 4;
    data.event.remainingTickets = 1;
    data.event.bookedSeats.push(
      { row: 'K', seatNumber: 1, section: 'balcony', bookingId: 'booking-2' },
      { row: 'K', seatNumber: 2, section: 'balcony' },
    );
    data.bookings.push({
      _id: 'booking-2',
      StandardId: 'user-2',
      status: 'confirmed',
      numberOfTickets: 1,
      selectedSeats: [{ row: 'K', seatNumber: 1, section: 'balcony' }],
    });
    data.tickets.push({
      _id: 'ticket-2',
      bookingId: 'booking-2',
      userId: 'user-2',
      eventId: 'event-1',
      seatRow: 'K',
      seatNumber: 1,
      section: 'balcony',
      qrData: 'balcony-qr',
      hasQrImage: true,
    });
    data.userIds.push('user-2');
    data.theaterLayout = {
      mainFloor: { rows: 1, seatsPerRow: 2, rowLabels: ['A'] },
      hasBalcony: true,
      balcony: { rows: 1, seatsPerRow: 2, rowLabels: ['K'] },
    };

    const report = auditSeats(data);
    expect(report.issues).toEqual([]);
    expect(report.sections.main).toMatchObject({
      occupied: 1,
      confirmedSeats: 1,
      tickets: 1,
    });
    expect(report.sections.balcony).toMatchObject({
      occupied: 2,
      organizerBlocked: 1,
      confirmedSeats: 1,
      tickets: 1,
    });
    expect(report.organizerBlockedSeats).toEqual(['balcony-K-2']);
  });

  it('finds wrong-event and malformed QR tickets', () => {
    const data = snapshot();
    data.tickets[0].eventId = 'another-event';
    data.tickets[0].qrData = '   ';
    data.tickets[0].hasQrImage = false;
    data.tickets[0].userId = 'another-user';
    expect(auditSeats(data).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'TICKET_EVENT_MISMATCH',
        'MISSING_QR_DATA',
        'MISSING_QR_IMAGE',
        'TICKET_USER_MISMATCH',
      ]),
    );
  });

  it('finds a booked balcony chair without a booking and a confirmed chair left available', () => {
    const data = snapshot();
    data.event.totalTickets = 3;
    data.event.remainingTickets = 2;
    data.event.bookedSeats = [
      {
        row: 'K',
        seatNumber: 1,
        section: 'balcony',
        bookingId: 'deleted-booking',
      },
    ];
    data.theaterLayout = {
      mainFloor: { rows: 1, seatsPerRow: 1, rowLabels: ['A'] },
      hasBalcony: true,
      balcony: { rows: 1, seatsPerRow: 2, rowLabels: ['K'] },
    };
    const report = auditSeats(data);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GHOST_BOOKING_SEAT',
          seat: 'balcony-K-1',
        }),
        expect.objectContaining({
          code: 'ORPHAN_BOOKING_SEAT',
          seat: 'main-A-1',
        }),
      ]),
    );
  });

  it('finds seats outside the theater layout and missing theater records', () => {
    const data = snapshot();
    data.theaterLayout = {
      mainFloor: { rows: 1, seatsPerRow: 1, rowLabels: ['A'] },
      hasBalcony: false,
    };
    data.event.bookedSeats.push({
      row: 'Z',
      seatNumber: 9,
      section: 'balcony',
    });
    expect(auditSeats(data).issues.map((issue) => issue.code)).toContain(
      'UNAVAILABLE_OR_UNKNOWN_SEAT',
    );
    data.theaterLayout = null;
    expect(auditSeats(data).issues.map((issue) => issue.code)).toContain(
      'THEATER_NOT_FOUND',
    );
  });

  it('allows pending seats without QR but requires one ticket after confirmation', () => {
    const data = snapshot();
    data.bookings[0].status = 'pending';
    data.tickets = [];
    expect(auditSeats(data).issues).toEqual([]);
    data.bookings[0].status = 'confirmed';
    expect(auditSeats(data).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONFIRMED_SEAT_QR_COUNT',
          seat: 'main-A-1',
        }),
      ]),
    );
  });

  it('finds two users holding the same balcony chair', () => {
    const data = snapshot();
    const expiresAt = new Date(Date.now() + 60_000);
    data.event.totalTickets = 3;
    data.event.remainingTickets = 1;
    data.event.bookedSeats.push({
      row: 'K',
      seatNumber: 1,
      section: 'balcony',
      holdId: 'hold-1',
    });
    data.holds.push(
      {
        _id: 'hold-1',
        userId: 'user-2',
        seats: [{ row: 'K', seatNumber: 1, section: 'balcony' }],
        expiresAt,
      },
      {
        _id: 'hold-2',
        userId: 'user-3',
        seats: [{ row: 'K', seatNumber: 1, section: 'balcony' }],
        expiresAt,
      },
    );
    data.userIds.push('user-2', 'user-3');
    expect(auditSeats(data).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['MULTIPLE_SEAT_CLAIMS', 'ORPHAN_HOLD_SEAT']),
    );
  });

  it('finds duplicate QR payloads across distinct confirmed seats', () => {
    const data = snapshot();
    data.event.bookedSeats.push({
      row: 'A',
      seatNumber: 2,
      section: 'main',
      bookingId: 'booking-2',
    });
    data.event.remainingTickets = 0;
    data.bookings.push({
      _id: 'booking-2',
      StandardId: 'user-2',
      status: 'confirmed',
      numberOfTickets: 1,
      selectedSeats: [{ row: 'A', seatNumber: 2, section: 'main' }],
    });
    data.tickets.push({
      _id: 'ticket-2',
      bookingId: 'booking-2',
      userId: 'user-2',
      seatRow: 'A',
      seatNumber: 2,
      section: 'main',
      qrData: 'unique-qr',
      hasQrImage: true,
    });
    data.userIds.push('user-2');
    expect(
      auditSeats(data).issues.filter((issue) => issue.code === 'DUPLICATE_QR'),
    ).toHaveLength(2);
  });
});

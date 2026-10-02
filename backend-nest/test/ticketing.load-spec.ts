/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string */
import { performance } from 'node:perf_hooks';
import { readSeatAudit } from '../src/seat-audit/read-seat-audit';
import { TicketingHarness, seat } from './support/ticketing-harness';

describe('multi-user seat lifecycle load test', () => {
  const h = new TicketingHarness();
  let f: Awaited<ReturnType<TicketingHarness['fixture']>>;
  const cleanup = () => (h.bookings as any).cleanupExpiredBookings();

  beforeAll(async () => {
    await h.start();
    f = await h.fixture();
    await h.model('Theater').updateOne(
      { _id: f.theater._id },
      {
        $set: {
          'layout.mainFloor': {
            rows: 4,
            seatsPerRow: 10,
            rowLabels: ['A', 'B', 'C', 'D'],
            aislePositions: [],
          },
          'layout.hasBalcony': true,
          'layout.balcony': {
            rows: 2,
            seatsPerRow: 10,
            rowLabels: ['A', 'B'],
            aislePositions: [],
          },
          'layout.removedSeats': [],
          'layout.disabledSeats': [],
          seatConfig: [],
          totalSeats: 60,
        },
      },
    );
    await h.model('Event').updateOne(
      { _id: f.eventId },
      {
        $set: {
          totalTickets: 60,
          remainingTickets: 60,
          bookedSeats: [],
          seatConfig: [],
          requiresOrganizerApproval: true,
        },
      },
    );
  }, 600000);

  afterAll(() => h.stop());

  const numberedSeat = (index: number) => {
    const section = index < 40 ? 'main' : 'balcony';
    const local = section === 'main' ? index : index - 40;
    return seat(
      (local % 10) + 1,
      section,
      String.fromCharCode(65 + Math.floor(local / 10)),
    );
  };

  const check = async (stage: string, expectedRemaining?: number) => {
    await h.assertIntegrity(f.eventId);
    const report = await readSeatAudit(h.connection, f.eventId, 0);
    expect({ stage, issues: report.issues }).toEqual({ stage, issues: [] });
    if (expectedRemaining != null)
      expect(report.counts.remaining).toBe(expectedRemaining);
    return report;
  };

  test('62 users exercise holds, cancellations, expiry, confirmation and same-seat contention', async () => {
    const users = await Promise.all(Array.from({ length: 32 }, () => h.user()));
    const startedAt = performance.now();

    // 24 simultaneous users claim different main-floor and balcony seats.
    const holdResults = await Promise.allSettled(
      users
        .slice(0, 24)
        .map((user, index) =>
          h.bookings.holdSeats(
            f.eventId,
            [numberedSeat(index)],
            user._id.toString(),
          ),
        ),
    );
    expect(
      holdResults.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(24);
    await check('24 parallel holds', 36);

    const holds = holdResults.map((result) =>
      result.status === 'fulfilled' ? result.value : null,
    );
    await Promise.all(
      holds
        .slice(0, 6)
        .map((hold, index) =>
          h.bookings.releaseHold(hold!.holdId, users[index]._id.toString()),
        ),
    );
    await check('6 hold cancellations', 42);

    const pending = await Promise.all(
      holds.slice(6, 24).map((hold, offset) => {
        const index = offset + 6;
        return h.bookings.create(
          {
            eventId: f.eventId,
            selectedSeats: [numberedSeat(index)],
            holdId: hold!.holdId,
          },
          users[index]._id.toString(),
        );
      }),
    );
    await check('18 hold-to-pending conversions', 42);

    await Promise.all(
      pending
        .slice(0, 4)
        .map((booking, index) =>
          h.bookings.delete(
            booking._id.toString(),
            users[index + 6]._id.toString(),
          ),
        ),
    );
    await check('4 pending cancellations', 46);

    const toExpire = pending.slice(4, 8);
    await h
      .model('Booking')
      .updateMany(
        { _id: { $in: toExpire.map((booking) => booking._id) } },
        { pendingExpiresAt: new Date(0) },
      );
    await cleanup();
    await check('4 pending expirations', 50);

    const confirmed = await Promise.all(
      pending
        .slice(8)
        .map((booking) =>
          h.bookings.updateBookingStatus(
            booking._id.toString(),
            'confirmed',
            f.owner,
          ),
        ),
    );
    await check('10 confirmations with one QR each', 50);

    await Promise.all(
      confirmed
        .slice(0, 3)
        .map((booking) =>
          h.bookings.requestCancellation(
            booking._id.toString(),
            booking.StandardId.toString(),
            [],
            true,
            'load test',
          ),
        ),
    );
    await Promise.all(
      confirmed
        .slice(0, 3)
        .map((booking) =>
          h.bookings.approveCancellation(booking._id.toString(), f.owner),
        ),
    );
    await check('3 confirmed cancellations', 53);

    const contenders = await Promise.all(
      Array.from({ length: 30 }, () => h.user()),
    );
    const contested = numberedSeat(30);
    const contest = await Promise.allSettled(
      contenders.map((user) =>
        h.bookings.holdSeats(f.eventId, [contested], user._id.toString()),
      ),
    );
    expect(
      contest.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await check('30 users contend for one seat', 52);

    const elapsedMs = Math.round(performance.now() - startedAt);
    process.stdout.write(
      `\nLOAD_RESULT users=62 stages=7 elapsedMs=${elapsedMs} finalRemaining=52 integrity=healthy\n`,
    );
  }, 600000);

  test('100 simultaneous buyers cannot oversell 60 physical seats', async () => {
    await Promise.all([
      h.model('Ticket').deleteMany({ eventId: f.event._id }),
      h.model('Booking').deleteMany({ eventId: f.eventId }),
      h.model('SeatHold').deleteMany({ eventId: f.eventId }),
    ]);
    await h
      .model('Event')
      .updateOne(
        { _id: f.eventId },
        { $set: { bookedSeats: [], remainingTickets: 60 } },
      );

    const buyers = await Promise.all(
      Array.from({ length: 100 }, () => h.user()),
    );
    const startedAt = performance.now();
    const attempts = await Promise.allSettled(
      buyers.map((buyer, index) =>
        h.bookings.create(
          { eventId: f.eventId, selectedSeats: [numberedSeat(index % 60)] },
          buyer._id.toString(),
        ),
      ),
    );
    const winners = attempts.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    expect(winners).toHaveLength(60);
    await check('100 buyers compete for 60 seats', 0);

    await Promise.all(
      winners.map((booking) =>
        h.bookings.delete(
          booking._id.toString(),
          booking.StandardId.toString(),
        ),
      ),
    );
    await check('60 parallel pending cancellations', 60);

    const elapsedMs = Math.round(performance.now() - startedAt);
    process.stdout.write(
      `\nCAPACITY_RESULT attempts=100 winners=60 rejected=40 elapsedMs=${elapsedMs} finalRemaining=60 integrity=healthy\n`,
    );
  }, 600000);
});

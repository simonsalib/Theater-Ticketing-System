import { Types } from 'mongoose';
import { TicketingHarness, seat } from './support/ticketing-harness';
import { UserRole } from '../src/users/schemas/user.schema';
import { EventsService } from '../src/events/events.service';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Force a specific overlapping-read schedule, while keeping real Mongo queries/writes.
function synchronizeReads(model: any, method: string, count: number) {
  const original = model[method].bind(model);
  let arrivals = 0;
  let release: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  jest.spyOn(model, method).mockImplementation((...args: any[]) => {
    const query = original(...args);
    const exec = query.exec.bind(query);
    query.exec = async (...execArgs: any[]) => {
      const result = await exec(...execArgs);
      if (arrivals < count) {
        arrivals++;
        if (arrivals === count) release();
        await barrier;
      }
      return result;
    };
    return query;
  });
}

describe('Ticketing integration audit', () => {
  const h = new TicketingHarness();
  let f: Awaited<ReturnType<TicketingHarness['fixture']>>;
  const auth = (user: any) => `Bearer ${h.token(user)}`;
  const cleanup = () => (h.bookings as any).cleanupExpiredBookings();
  const freshEvent = () => h.model('Event').findById(f.eventId);
  const confirm = (b: any) => h.bookings.updateBookingStatus(b._id.toString(), 'confirmed', f.owner);

  beforeAll(() => h.start(), 600000);
  afterAll(() => h.stop());
  beforeEach(async () => { await h.reset(); f = await h.fixture(); });

  describe('Working journeys and invariants', () => {
    test('FLOW-01 real HTTP login, hold main/balcony, receipt, confirmation, QR, scan and partial cancellation', async () => {
      const email = 'journey@example.invalid';
      const password = 'Test-only-password-942!';
      await h.http().post('/api/v1/auth/register').send({ email, password, name: 'Journey User', phone: '01000000000' }).expect(201);
      const pending = await h.model('PendingRegistration').findOne({ email });
      await h.http().post('/api/v1/auth/verify-registration').send({ email, otp: pending.otp }).expect(200);
      const login = await h.http().post('/api/v1/auth/login').send({ email, password }).expect(200);
      const bearer = `Bearer ${login.body.data.token}`;
      const selectedSeats = [seat(1), seat(1, 'balcony')];
      const hold = await h.http().post('/api/v1/booking/hold-seats').set('Authorization', bearer).send({ eventId: f.eventId, seats: selectedSeats }).expect(201);
      const created = await h.http().post('/api/v1/booking').set('Authorization', bearer).send({ eventId: f.eventId, selectedSeats, holdId: hold.body.data.holdId }).expect(201);
      const id = created.body.data._id;
      expect(created.body.data.status).toBe('pending');
      await h.assertIntegrity(f.eventId);
      // A tiny valid PNG fixture, never an actual payment or customer receipt.
      const receipt = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XkAAAAASUVORK5CYII=';
      await h.http().post(`/api/v1/booking/${id}/receipt`).set('Authorization', bearer).send({ receiptBase64: receipt }).expect(201);
      await h.http().patch(`/api/v1/booking/${id}/status`).set('Authorization', auth(f.owner)).send({ status: 'confirmed' }).expect(200);
      const result = await h.http().get(`/api/v1/tickets/booking/${id}`).set('Authorization', bearer).expect(200);
      expect(result.body.tickets).toHaveLength(2);
      expect(result.body.tickets[0].qrCodeImage).toMatch(/^data:image\/png;base64,/);
      await h.assertIntegrity(f.eventId);
      const scanned = await h.http().post('/api/v1/tickets/scan').set('Authorization', auth(f.scanner)).send({ qrData: result.body.tickets[0].qrData, eventId: f.eventId }).expect(201);
      expect(scanned.body.isFree).toBe(true);
      const other = result.body.tickets[1];
      await h.http().post(`/api/v1/booking/${id}/request-cancellation`).set('Authorization', bearer).send({ seatKeys: [`${other.section}-${other.seatRow}-${other.seatNumber}`], cancelAll: false }).expect(201);
      await h.http().patch(`/api/v1/booking/${id}/approve-cancellation`).set('Authorization', auth(f.owner)).expect(200);
      await h.assertIntegrity(f.eventId);
      expect(await h.model('Ticket').countDocuments({ bookingId: new Types.ObjectId(id) })).toBe(1);
    });

    test('FLOW-02 event creation persists organizer-selected timers and confirmation mode', async () => {
      const result = await h.http().post('/api/v1/event').set('Authorization', auth(f.owner)).send({
        title: 'New test event', description: 'Test', date: new Date(Date.now() + 86400000), location: 'Test',
        theater: f.theater._id, hasTheaterSeating: true, totalTickets: 14,
        requiresOrganizerApproval: false, paymentDeadlineMinutes: 90, seatHoldDeadlineMinutes: 120,
      }).expect(201);
      expect(result.body.data).toMatchObject({ status: 'pending', requiresOrganizerApproval: false, paymentDeadlineMinutes: 90, seatHoldDeadlineMinutes: 120 });
    });

    test('FLOW-03 instant confirmation produces one QR per main and balcony seat', async () => {
      await h.model('Event').updateOne({ _id: f.eventId }, { requiresOrganizerApproval: false });
      const b = await h.book(f, [seat(1), seat(1, 'balcony')]);
      expect(b.status).toBe('confirmed');
      expect(b.pendingExpiresAt).toBeNull();
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-04 hold timer uses 120 minutes and payment timer uses 90 minutes', async () => {
      const before = Date.now();
      const hold = await h.bookings.holdSeats(f.eventId, [seat()], f.buyer._id.toString());
      expect(hold.expiresAt.getTime() - before).toBeGreaterThanOrEqual(120 * 60000);
      expect(hold.expiresAt.getTime() - before).toBeLessThan(120 * 60000 + 5000);
      const b = await h.book(f, [seat()], { holdId: hold.holdId });
      expect(b.pendingExpiresAt.getTime() - before).toBeGreaterThanOrEqual(90 * 60000);
      expect(b.pendingExpiresAt.getTime() - before).toBeLessThan(90 * 60000 + 5000);
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-05 server ignores a forged price and confirmed status', async () => {
      const b = await h.book(f, [{ ...seat(2), price: 1 }], { totalPrice: 1, status: 'confirmed' });
      expect(b.totalPrice).toBe(150);
      expect(b.status).toBe('pending');
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-06 twenty competing users cannot hold the same seat', async () => {
      const users = await Promise.all(Array.from({ length: 20 }, () => h.user()));
      const results = await Promise.allSettled(users.map(u => h.bookings.holdSeats(f.eventId, [seat()], u._id.toString())));
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(await h.model('SeatHold').countDocuments({ eventId: f.eventId })).toBe(1);
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-07 twenty direct bookings for the same seat produce one winner', async () => {
      const users = await Promise.all(Array.from({ length: 20 }, () => h.user()));
      const results = await Promise.allSettled(users.map(u => h.bookings.create({ eventId: f.eventId, selectedSeats: [seat()] }, u._id.toString())));
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-08 sequential hold release is idempotent', async () => {
      const hold = await h.bookings.holdSeats(f.eventId, [seat()], f.buyer._id.toString());
      await h.bookings.releaseHold(hold.holdId, f.buyer._id.toString());
      await h.bookings.releaseHold(hold.holdId, f.buyer._id.toString());
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-08B logout releases only the current user seat holds', async () => {
      await h.bookings.holdSeats(f.eventId, [seat(1)], f.buyer._id.toString());
      await h.bookings.holdSeats(f.eventId, [seat(2)], f.stranger._id.toString());
      const pendingBooking = await h.book(f, [seat(3)]);

      await h.http()
        .post('/api/v1/auth/logout')
        .set('Authorization', auth(f.buyer))
        .expect(200);

      expect(await h.model('SeatHold').countDocuments({ userId: f.buyer._id })).toBe(0);
      expect(await h.model('SeatHold').countDocuments({ userId: f.stranger._id })).toBe(1);
      expect(await h.model('Booking').countDocuments({ _id: pendingBooking._id, status: 'pending' })).toBe(1);
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-09 expired holds and pending bookings release seats on cleanup', async () => {
      const hold = await h.bookings.holdSeats(f.eventId, [seat()], f.buyer._id.toString());
      await h.model('SeatHold').updateOne({ _id: hold.holdId }, { expiresAt: new Date(0) });
      const b = await h.book(f, [seat(2)]);
      await h.model('Booking').updateOne({ _id: b._id }, { pendingExpiresAt: new Date(0) });
      await cleanup();
      expect(await h.model('Booking').countDocuments()).toBe(0);
      expect(await h.model('SeatHold').countDocuments()).toBe(0);
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-10 an uploaded receipt survives expiry cleanup', async () => {
      const b = await h.book(f);
      await h.bookings.uploadReceipt(b._id.toString(), f.buyer._id.toString(), 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XkAAAAASUVORK5CYII=');
      await cleanup();
      expect(await h.model('Booking').countDocuments()).toBe(1);
      expect((await h.model('Booking').findById(b._id)).pendingExpiresAt).toBeNull();
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-11 sequential repeat scan admits once', async () => {
      const b = await confirm(await h.book(f));
      const [ticket] = await h.tickets.getTicketsByBooking(b._id.toString());
      expect((await h.tickets.scanTicket(ticket.qrData, f.scanner._id.toString(), f.eventId)).isFree).toBe(true);
      expect((await h.tickets.scanTicket(ticket.qrData, f.scanner._id.toString(), f.eventId)).isFree).toBe(false);
    });

    test('FLOW-12 supplied wrong event rejects scanning', async () => {
      const b = await confirm(await h.book(f));
      const [ticket] = await h.tickets.getTicketsByBooking(b._id.toString());
      await expect(h.tickets.scanTicket(ticket.qrData, f.scanner._id.toString(), new Types.ObjectId().toString())).rejects.toThrow('not this event');
    });

    test('FLOW-13 partial pending cancellation preserves the remaining seat and price', async () => {
      const b = await h.book(f, [seat(1), seat(2)]);
      await h.bookings.cancelSelectedSeats(b._id.toString(), f.buyer._id.toString(), ['main-A-1'], false);
      await h.assertIntegrity(f.eventId);
      expect((await h.model('Booking').findById(b._id)).totalPrice).toBe(150);
    });

    test('FLOW-14 full cancellation deletes QR tickets and frees seats', async () => {
      const b = await confirm(await h.book(f));
      await h.bookings.requestCancellation(b._id.toString(), f.buyer._id.toString(), [], true, 'test');
      await h.bookings.approveCancellation(b._id.toString(), f.owner);
      await h.assertIntegrity(f.eventId);
      expect(await h.model('Ticket').countDocuments()).toBe(0);
    });

    test('FLOW-15 cancellation rejection keeps seats and QR codes', async () => {
      const b = await confirm(await h.book(f));
      await h.bookings.requestCancellation(b._id.toString(), f.buyer._id.toString(), [], true, 'test');
      await h.bookings.rejectCancellation(b._id.toString(), f.owner);
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-16 a stranger cannot upload, cancel or confirm another booking', async () => {
      const b = await h.book(f);
      await expect(h.bookings.uploadReceipt(b._id.toString(), f.stranger._id.toString(), 'receipt')).rejects.toThrow();
      await expect(h.bookings.delete(b._id.toString(), f.stranger._id.toString())).rejects.toThrow();
      await expect(h.bookings.updateBookingStatus(b._id.toString(), 'confirmed', f.stranger)).rejects.toThrow();
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-17 expired or foreign holds cannot be consumed', async () => {
      const hold = await h.bookings.holdSeats(f.eventId, [seat()], f.buyer._id.toString());
      await expect(h.bookings.create({ eventId: f.eventId, selectedSeats: [seat()], holdId: hold.holdId }, f.stranger._id.toString())).rejects.toThrow();
      await h.model('SeatHold').updateOne({ _id: hold.holdId }, { expiresAt: new Date(0) });
      await expect(h.book(f, [seat()], { holdId: hold.holdId })).rejects.toThrow('expired');
      await h.assertIntegrity(f.eventId);
    });

    test('FLOW-18 a theater in use cannot be deleted', async () => {
      await h.http().delete(`/api/v1/theater/${f.theater._id}`).set('Authorization', auth(f.admin)).expect(400);
    });

    test('FLOW-19 every sellable main/balcony chair has exactly one buyer and one QR', async () => {
      await h.model('Event').updateOne({ _id: f.eventId }, { requiresOrganizerApproval: false });
      const available = await h.bookings.getAvailableSeats(f.eventId);
      const sellable = available.seats.filter((s: any) => s.isActive && !s.isBooked);
      expect(sellable).toHaveLength(14);
      for (const s of sellable) {
        const buyer = await h.user();
        await h.bookings.create({ eventId: f.eventId, selectedSeats: [{ ...seat(s.seatNumber, s.section, s.row) }] }, buyer._id.toString());
      }
      await h.assertIntegrity(f.eventId);
      expect((await h.bookings.getAvailableSeats(f.eventId)).availableCount).toBe(0);
      expect(await h.model('Ticket').countDocuments({ eventId: new Types.ObjectId(f.eventId) })).toBe(14);
    });

    test('FLOW-20 local 504-chair availability sample records latency and payload size', async () => {
      await h.model('Theater').updateOne({ _id: f.theater._id }, {
        'layout.mainFloor': { rows: 16, seatsPerRow: 22, rowLabels: [] },
        'layout.balcony': { rows: 8, seatsPerRow: 19, rowLabels: [] },
        'layout.removedSeats': [], 'layout.disabledSeats': [], totalSeats: 504,
      });
      await h.model('Event').updateOne({ _id: f.eventId }, { totalTickets: 504, remainingTickets: 504 });
      const samples: number[] = [];
      let bytes = 0;
      for (let i = 0; i < 25; i++) {
        const start = performance.now();
        const result = await h.http().get(`/api/v1/booking/event/${f.eventId}/seats`).expect(200);
        samples.push(performance.now() - start);
        bytes = Buffer.byteLength(JSON.stringify(result.body));
        expect(result.body.data.seats).toHaveLength(504);
      }
      samples.sort((a, b) => a - b);
      mkdirSync(resolve('coverage'), { recursive: true });
      writeFileSync(resolve('coverage/availability-benchmark.json'), JSON.stringify({
        environment: 'local disposable MongoDB; no production traffic; no concurrent load',
        node: process.version, samples: samples.length, chairs: 504, bytes,
        p50Ms: samples[Math.floor(samples.length * 0.5)], p95Ms: samples[Math.floor(samples.length * 0.95)],
      }, null, 2));
    });

    test('FLOW-21 balcony fallback row returned by availability can be held', async () => {
      await h.model('Theater').updateOne(
        { _id: f.theater._id },
        { 'layout.balcony.rowLabels': [] },
      );

      const availability = await h.http()
        .get(`/api/v1/booking/event/${f.eventId}/seats`)
        .expect(200);
      const balconySeat = availability.body.data.seats.find(
        (candidate: any) => candidate.section === 'balcony' && candidate.isActive && !candidate.isBooked,
      );

      expect(balconySeat).toMatchObject({ section: 'balcony', row: 'BALC-A' });
      const hold = await h.http()
        .post('/api/v1/booking/hold-seats')
        .set('Authorization', auth(f.buyer))
        .send({
          eventId: f.eventId,
          seats: [{
            row: balconySeat.row,
            seatNumber: balconySeat.seatNumber,
            section: balconySeat.section,
          }],
        })
        .expect(201);

      expect(hold.body.data.seats).toEqual([
        expect.objectContaining({ section: 'balcony', row: 'BALC-A' }),
      ]);
      await h.assertIntegrity(f.eventId);
    });
  });

  describe('Authorization and data exposure contracts', () => {
    test.each(['booking', 'receipt', 'tickets', 'event-bookings', 'cancellations'] as const)('AUTH-01 stranger cannot read %s', async kind => {
      const b = await confirm(await h.book(f));
      await h.model('Booking').updateOne({ _id: b._id }, { instapayReceipt: 'private-test-receipt' });
      const paths: Record<typeof kind, string> = {
        booking: `/api/v1/booking/${b._id}`, receipt: `/api/v1/booking/${b._id}/receipt`,
        tickets: `/api/v1/tickets/booking/${b._id}`, 'event-bookings': `/api/v1/booking/event/${f.eventId}/bookings`,
        cancellations: `/api/v1/booking/event/${f.eventId}/cancellation-requests`,
      };
      await h.http().get(paths[kind]).set('Authorization', auth(f.stranger)).expect(403);
    });

    test('AUTH-02 single ticket cannot be fetched by another customer', async () => {
      const b = await confirm(await h.book(f));
      const [ticket] = await h.tickets.getTicketsByBooking(b._id.toString());
      await h.http().get(`/api/v1/tickets/${ticket._id}`).set('Authorization', auth(f.stranger)).expect(403);
    });

    test('AUTH-03 unrelated organizer cannot list another event tickets', async () => {
      const other = await h.user(UserRole.ORGANIZER);
      await h.http().get(`/api/v1/tickets/event/${f.eventId}`).set('Authorization', auth(other)).expect(403);
    });

    test('AUTH-04 unrelated organizer cannot scan another event', async () => {
      const other = await h.user(UserRole.ORGANIZER);
      const b = await confirm(await h.book(f));
      const [ticket] = await h.tickets.getTicketsByBooking(b._id.toString());
      await h.http().post('/api/v1/tickets/scan').set('Authorization', auth(other)).send({ qrData: ticket.qrData }).expect(403);
    });

    test('AUTH-05 standard user cannot edit theater', async () => {
      await h.http().put(`/api/v1/theater/${f.theater._id}`).set('Authorization', auth(f.stranger)).send({ name: 'Unauthorized edit' }).expect(403);
    });

    test('AUTH-06 profile excludes password hash and active OTP', async () => {
      await h.model('User').updateOne({ _id: f.buyer._id }, { otp: '123456', otpExpires: new Date(Date.now() + 60000) });
      const res = await h.http().get('/api/v1/user/profile').set('Authorization', auth(f.buyer)).expect(200);
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.body.data).not.toHaveProperty('otp');
    });

    test('AUTH-07 blocking a user invalidates an existing token', async () => {
      const token = auth(f.buyer);
      await h.model('User').updateOne({ _id: f.buyer._id }, { isBlocked: true });
      const res = await h.http().get('/api/v1/user/profile').set('Authorization', token);
      expect([401, 403]).toContain(res.status);
    });

    test('AUTH-08 public event excludes deletion OTP and booking identifiers', async () => {
      await h.book(f);
      await h.model('Event').updateOne({ _id: f.eventId }, { otp: '123456', otpExpires: new Date(Date.now() + 60000) });
      const res = await h.http().get(`/api/v1/event/${f.eventId}`).expect(200);
      expect(res.body.data).not.toHaveProperty('otp');
      expect(JSON.stringify(res.body.data)).not.toContain('bookingId');
    });

    test('AUTH-09 deletion OTP verification requires admin authorization', async () => {
      await h.model('Event').updateOne({ _id: f.eventId }, { otp: '123456', otpExpires: new Date(Date.now() + 60000) });
      await h.http().post('/api/v1/event/verify-deletion-otp').set('Authorization', auth(f.stranger)).send({ eventId: f.eventId, otp: '123456' }).expect(403);
    });

    test('AUTH-10 organizer cannot self-approve event', async () => {
      await h.model('Event').updateOne({ _id: f.eventId }, { status: 'pending' });
      await h.http().put(`/api/v1/event/${f.eventId}`).set('Authorization', auth(f.owner)).send({ status: 'approved' }).expect(403);
    });

    test('AUTH-11 reset password revokes the previous bearer token', async () => {
      const token = auth(f.buyer);
      await h.http().post('/api/v1/auth/forget-password').send({ email: f.buyer.email }).expect(200);
      const user = await h.model('User').findById(f.buyer._id);
      await h.http().post('/api/v1/auth/reset-password').send({ email: user.email, otp: user.otp, newPassword: 'New-test-password-123!' }).expect(200);
      await h.http().get('/api/v1/user/profile').set('Authorization', token).expect(401);
    });

    test('AUTH-12 reset OTP cannot activate an admin-created account', async () => {
      await h.model('User').updateOne({ _id: f.buyer._id }, { requiresPasswordChange: true, isVerified: false });
      await h.http().post('/api/v1/auth/forget-password').send({ email: f.buyer.email }).expect(200);
      const user = await h.model('User').findById(f.buyer._id);
      await h.http().post('/api/v1/auth/verify-activate').send({ email: user.email, otp: user.otp }).expect(400);
    });

    test('AUTH-13 JWT must be valid and signed by this server', async () => {
      await h.http().get('/api/v1/user/profile').expect(401);
      await h.http().get('/api/v1/user/profile').set('Authorization', 'Bearer invalid-token').expect(401);
      const expired = h.jwt.sign({ sub: f.buyer._id.toString() }, { expiresIn: -10 });
      await h.http().get('/api/v1/user/profile').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    test('AUTH-14 expired reset OTP is rejected', async () => {
      await h.model('User').updateOne({ _id: f.buyer._id }, { otp: '123456', otpExpires: new Date(0) });
      await h.http().post('/api/v1/auth/reset-password').send({ email: f.buyer.email, otp: '123456', newPassword: 'New-test-password-123!' }).expect(400);
    });
  });

  describe('Input and state-transition contracts', () => {
    test.each([seat(99), seat(6, 'main', 'B'), seat(5, 'main', 'B')])('STATE-01 cannot hold unavailable or nonexistent seat %j', async s => {
      await h.http().post('/api/v1/booking/hold-seats').set('Authorization', auth(f.buyer)).send({ eventId: f.eventId, seats: [s] }).expect(400);
    });

    test.each([seat(99), seat(6, 'main', 'B'), seat(5, 'main', 'B')])('STATE-02 cannot directly book unavailable or nonexistent seat %j', async s => {
      await h.http().post('/api/v1/booking').set('Authorization', auth(f.buyer)).send({ eventId: f.eventId, selectedSeats: [s] }).expect(400);
    });

    test('STATE-03 duplicate seat entries must be rejected', async () => {
      await h.http().post('/api/v1/booking').set('Authorization', auth(f.buyer)).send({ eventId: f.eventId, selectedSeats: [seat(), seat()] }).expect(400);
    });

    test('STATE-04 theater booking cannot omit selected seats', async () => {
      await h.http().post('/api/v1/booking').set('Authorization', auth(f.buyer)).send({ eventId: f.eventId, numberOfTickets: 1 }).expect(400);
    });

    test.each(['pending', 'declined', 'expired'])('STATE-05 %s event cannot be booked', async status => {
      await h.model('Event').updateOne({ _id: f.eventId }, status === 'expired' ? { date: new Date(0) } : { status });
      await h.http().post('/api/v1/booking').set('Authorization', auth(f.buyer)).send({ eventId: f.eventId, selectedSeats: [seat()] }).expect(400);
    });

    test('STATE-06 receipt body must actually be a supported image', async () => {
      const b = await h.book(f);
      await h.http().post(`/api/v1/booking/${b._id}/receipt`).set('Authorization', auth(f.buyer)).send({ receiptBase64: 'not-an-image' }).expect(400);
    });

    test('STATE-07 expired booking cannot upload a receipt before the cleanup tick', async () => {
      const b = await h.book(f);
      await h.model('Booking').updateOne({ _id: b._id }, { pendingExpiresAt: new Date(0) });
      await h.http().post(`/api/v1/booking/${b._id}/receipt`).set('Authorization', auth(f.buyer)).send({ receiptBase64: 'test' }).expect(400);
    });

    test('STATE-08 rejecting a booking twice cannot increase capacity twice', async () => {
      const b = await h.book(f);
      await h.bookings.updateBookingStatus(b._id.toString(), 'rejected', f.owner);
      try { await h.bookings.updateBookingStatus(b._id.toString(), 'rejected', f.owner); } catch { /* rejection is also valid */ }
      await h.assertIntegrity(f.eventId);
    });

    test('STATE-09 deleting a rejected booking cannot release seats again', async () => {
      const b = await h.book(f);
      await h.bookings.updateBookingStatus(b._id.toString(), 'rejected', f.owner);
      try { await h.bookings.delete(b._id.toString(), f.buyer._id.toString()); } catch { /* rejection is also valid */ }
      await h.assertIntegrity(f.eventId);
    });

    test('STATE-10 rejected booking cannot be reconfirmed after another buyer takes its seat', async () => {
      const b = await h.book(f);
      await h.bookings.updateBookingStatus(b._id.toString(), 'rejected', f.owner);
      await h.bookings.create({ eventId: f.eventId, selectedSeats: [seat()] }, f.stranger._id.toString());
      await expect(confirm(b)).rejects.toThrow();
    });

    test('STATE-11 cancellation deadline is enforced on the server', async () => {
      const b = await confirm(await h.book(f));
      await h.model('Event').updateOne({ _id: f.eventId }, { cancellationDeadline: new Date(0) });
      await expect(h.bookings.requestCancellation(b._id.toString(), f.buyer._id.toString(), [], true, '')).rejects.toThrow();
    });

    test('STATE-12 cancel-all preserves an already scanned seat', async () => {
      const b = await confirm(await h.book(f, [seat(1), seat(2)]));
      const [ticket] = await h.tickets.getTicketsByBooking(b._id.toString());
      await h.tickets.scanTicket(ticket.qrData, f.scanner._id.toString(), f.eventId);
      await h.bookings.requestCancellation(b._id.toString(), f.buyer._id.toString(), [], true, '');
      await h.bookings.approveCancellation(b._id.toString(), f.owner);
      expect(await h.model('Ticket').countDocuments({ _id: ticket._id, isScanned: true })).toBe(1);
      await h.assertIntegrity(f.eventId);
    });

    test('STATE-13 unmatched cancellation keys cannot inflate remainingTickets', async () => {
      const b = await confirm(await h.book(f, [seat(1), seat(2)]));
      try {
        await h.bookings.requestCancellation(b._id.toString(), f.buyer._id.toString(), ['main-Z-99'], false, '');
        await h.bookings.approveCancellation(b._id.toString(), f.owner);
      } catch { /* input rejection preserves the invariant */ }
      await h.assertIntegrity(f.eventId);
    });

    test('STATE-14 editing organizer reservations preserves active holds', async () => {
      await h.bookings.holdSeats(f.eventId, [seat()], f.buyer._id.toString());
      await h.app.get(EventsService).update(f.eventId, { preBookedSeats: [] }, f.owner);
      expect((await freshEvent()).bookedSeats).toHaveLength(1);
    });

    test('STATE-15 a subset of held seats releases unused capacity or rejects the request', async () => {
      const hold = await h.bookings.holdSeats(f.eventId, [seat(1), seat(2)], f.buyer._id.toString());
      try { await h.book(f, [seat(1)], { holdId: hold.holdId }); } catch { /* exact-set validation is also valid */ }
      await h.assertIntegrity(f.eventId);
    });

    test('STATE-16 missing attendee data is rejected by the API', async () => {
      await h.http().post('/api/v1/booking').set('Authorization', auth(f.buyer)).send({ eventId: f.eventId, selectedSeats: [{ row: 'A', seatNumber: 1, section: 'main' }] }).expect(400);
    });

    test('STATE-17 fractional ticket quantities are rejected', async () => {
      await h.model('Event').updateOne({ _id: f.eventId }, { hasTheaterSeating: false });
      await h.http().post('/api/v1/booking').set('Authorization', auth(f.buyer)).send({ eventId: f.eventId, numberOfTickets: 1.5 }).expect(400);
    });

    test('STATE-18 pending bookings and holds are not counted as earned revenue', async () => {
      await h.book(f, [seat(2)]);
      await h.bookings.holdSeats(f.eventId, [seat(1)], f.buyer._id.toString());
      expect((await h.app.get(EventsService).getOrganizerAnalytics(f.owner._id.toString())).totalRevenue).toBe(0);
    });

    test('STATE-19 duplicate invalid cancellation keys cannot cancel all pending seats', async () => {
      const b = await h.book(f, [seat(1), seat(2)]);
      await expect(h.bookings.cancelSelectedSeats(b._id.toString(), f.buyer._id.toString(), ['main-Z-99', 'main-Z-99'], false)).rejects.toThrow();
    });

    test('STATE-20 cleanup removes a ghost event seat that has no booking owner', async () => {
      await h.model('Event').updateOne(
        { _id: f.eventId },
        {
          $push: { bookedSeats: { row: 'A', seatNumber: 3, section: 'main', bookingId: new Types.ObjectId() } },
          $inc: { remainingTickets: -1 },
        },
      );
      await cleanup();
      await h.assertIntegrity(f.eventId);
    });

    test('STATE-21 cleanup restores an orphaned active booking seat before it can be sold again', async () => {
      const b = await h.book(f);
      await h.model('Event').updateOne(
        { _id: f.eventId },
        { $pull: { bookedSeats: { bookingId: b._id } }, $inc: { remainingTickets: 1 } },
      );
      await cleanup();
      await h.assertIntegrity(f.eventId);
      await expect(h.bookings.create({ eventId: f.eventId, selectedSeats: [seat()] }, f.stranger._id.toString())).rejects.toThrow();
    });
  });

  describe('Concurrency, retry and failure injection', () => {
    test('RACE-01 two requests cannot consume the same hold twice', async () => {
      const hold = await h.bookings.holdSeats(f.eventId, [seat()], f.buyer._id.toString());
      synchronizeReads(h.model('SeatHold'), 'findById', 2);
      const results = await Promise.allSettled([h.book(f, [seat()], { holdId: hold.holdId }), h.book(f, [seat()], { holdId: hold.holdId })]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      await h.assertIntegrity(f.eventId);
    });

    test('RACE-02 concurrent releases do not increment capacity twice', async () => {
      const hold = await h.bookings.holdSeats(f.eventId, [seat()], f.buyer._id.toString());
      synchronizeReads(h.model('SeatHold'), 'findById', 2);
      await Promise.allSettled([h.bookings.releaseHold(hold.holdId, f.buyer._id.toString()), h.bookings.releaseHold(hold.holdId, f.buyer._id.toString())]);
      await h.assertIntegrity(f.eventId);
    });

    test('RACE-03 parallel scanners admit one QR only once', async () => {
      const b = await confirm(await h.book(f));
      const [ticket] = await h.tickets.getTicketsByBooking(b._id.toString());
      synchronizeReads(h.model('Ticket'), 'findOne', 2);
      const scans = await Promise.all([h.tickets.scanTicket(ticket.qrData, f.scanner._id.toString(), f.eventId), h.tickets.scanTicket(ticket.qrData, f.scanner._id.toString(), f.eventId)]);
      expect(scans.filter(s => s.isFree)).toHaveLength(1);
    });

    test('RACE-04 concurrent lazy QR generation cannot duplicate a seat ticket', async () => {
      const b = await h.book(f);
      await h.model('Booking').updateOne({ _id: b._id }, { status: 'confirmed' });
      synchronizeReads(h.model('Ticket'), 'find', 2);
      await Promise.all([h.tickets.getTicketsByBooking(b._id.toString()), h.tickets.getTicketsByBooking(b._id.toString())]);
      await h.assertIntegrity(f.eventId);
    });

    test('RACE-05 quantity-based events cannot oversell under concurrency', async () => {
      await h.model('Event').updateOne({ _id: f.eventId }, { hasTheaterSeating: false, totalTickets: 1, remainingTickets: 1 });
      synchronizeReads(h.model('Event'), 'findById', 2);
      const results = await Promise.allSettled([f.buyer, f.stranger].map(u => h.bookings.create({ eventId: f.eventId, numberOfTickets: 1 }, u._id.toString())));
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect((await freshEvent()).remainingTickets).toBe(0);
    });

    test('RACE-06 two cleanup workers cannot release one pending booking twice', async () => {
      const b = await h.book(f);
      await h.model('Booking').updateOne({ _id: b._id }, { pendingExpiresAt: new Date(0) });
      synchronizeReads(h.model('Booking'), 'find', 2);
      await Promise.all([cleanup(), cleanup()]);
      await h.assertIntegrity(f.eventId);
    });

    test('FAIL-01 a missing ticket is repaired without replacing existing QR codes', async () => {
      const b = await confirm(await h.book(f, [seat(1), seat(2)]));
      const tickets = await h.tickets.getTicketsByBooking(b._id.toString());
      await h.model('Ticket').deleteOne({ _id: tickets[1]._id });
      const repaired = await h.tickets.getTicketsByBooking(b._id.toString());
      expect(repaired).toHaveLength(2);
      expect(repaired.some(t => t.qrData === tickets[0].qrData)).toBe(true);
      await h.assertIntegrity(f.eventId);
    });

    test('FAIL-02 failed booking persistence cannot decrement quantity-event inventory', async () => {
      await h.model('Event').updateOne({ _id: f.eventId }, { hasTheaterSeating: false });
      jest.spyOn(h.model('Booking').prototype, 'save').mockRejectedValueOnce(new Error('injected storage failure'));
      await expect(h.bookings.create({ eventId: f.eventId, numberOfTickets: 1 }, f.buyer._id.toString())).rejects.toThrow();
      expect((await freshEvent()).remainingTickets).toBe(14);
    });

    test('FAIL-03 confirmed booking cannot silently succeed without a QR', async () => {
      await h.model('Event').updateOne({ _id: f.eventId }, { requiresOrganizerApproval: false });
      jest.spyOn(h.tickets, 'generateTicketsForBooking').mockRejectedValueOnce(new Error('injected QR failure'));
      try { await h.book(f); } catch { /* explicit failure is acceptable if rolled back */ }
      await h.assertIntegrity(f.eventId);
    });

    test('FAIL-04 quantity-based instant tickets also need QR codes', async () => {
      await h.model('Event').updateOne({ _id: f.eventId }, { requiresOrganizerApproval: false, hasTheaterSeating: false });
      const b = await h.bookings.create({ eventId: f.eventId, numberOfTickets: 2 }, f.buyer._id.toString());
      expect(await h.tickets.getTicketsByBooking(b._id.toString())).toHaveLength(2);
    });
  });
});

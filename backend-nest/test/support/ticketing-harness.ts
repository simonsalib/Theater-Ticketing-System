import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { PendingRegistration, PendingRegistrationSchema } from '../../src/auth/schemas/pending-registration.schema';
import { BookingsController } from '../../src/bookings/bookings.controller';
import { BookingsService } from '../../src/bookings/bookings.service';
import { Booking, BookingSchema } from '../../src/bookings/schemas/booking.schema';
import { SeatHold, SeatHoldSchema } from '../../src/bookings/schemas/seat-hold.schema';
import { EventsController } from '../../src/events/events.controller';
import { EventsService } from '../../src/events/events.service';
import { Event, EventSchema } from '../../src/events/schemas/event.schema';
import { MailService } from '../../src/mail/mail.service';
import { TheatersController } from '../../src/theaters/theaters.controller';
import { TheatersService } from '../../src/theaters/theaters.service';
import { Theater, TheaterSchema } from '../../src/theaters/schemas/theater.schema';
import { TicketsController } from '../../src/tickets/tickets.controller';
import { TicketsService } from '../../src/tickets/tickets.service';
import { Ticket, TicketSchema } from '../../src/tickets/schemas/ticket.schema';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { User, UserSchema, UserRole } from '../../src/users/schemas/user.schema';

export const schemas = [
  { name: User.name, schema: UserSchema },
  { name: PendingRegistration.name, schema: PendingRegistrationSchema },
  { name: Theater.name, schema: TheaterSchema },
  { name: Event.name, schema: EventSchema },
  { name: Booking.name, schema: BookingSchema },
  { name: SeatHold.name, schema: SeatHoldSchema },
  { name: Ticket.name, schema: TicketSchema },
];

export type TestSeat = {
  row: string;
  seatNumber: number;
  section: string;
  attendeeFirstName: string;
  attendeeLastName: string;
  attendeePhone: string;
  price?: number;
};

export const seat = (seatNumber = 1, section = 'main', row = 'A'): TestSeat => ({
  row, seatNumber, section, attendeeFirstName: 'Test',
  attendeeLastName: `Attendee${seatNumber}`, attendeePhone: '01000000000',
});

export class TicketingHarness {
  app: INestApplication;
  mongo: MongoMemoryReplSet;
  connection: Connection;
  bookings: BookingsService;
  tickets: TicketsService;
  jwt: JwtService;
  mail = {
    sendVerificationOTP: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetOTP: jest.fn().mockResolvedValue(undefined),
  };

  async start() {
    // Never load AppModule or .env: all models use only this disposable server.
    this.mongo = await MongoMemoryReplSet.create({
      binary: { version: '7.0.14' },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    try {
      const fixture = await Test.createTestingModule({
        imports: [
          MongooseModule.forRoot(this.mongo.getUri('ticketing_integration')),
          MongooseModule.forFeature(schemas),
          PassportModule,
          JwtModule.register({ secret: 'isolated-integration-test-secret', signOptions: { expiresIn: '1h' } }),
        ],
        controllers: [AuthController, UsersController, EventsController, TheatersController, BookingsController, TicketsController],
        providers: [
          AuthService, UsersService, EventsService, TheatersService, BookingsService, TicketsService, JwtStrategy,
          { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: 'isolated-integration-test-secret' }) },
          { provide: MailService, useValue: this.mail },
        ],
      }).compile();
      this.app = fixture.createNestApplication({ logger: false });
      this.bookings = fixture.get(BookingsService);
      this.tickets = fixture.get(TicketsService);
      this.jwt = fixture.get(JwtService);
      // Drive expiry explicitly; the production interval otherwise leaks at shutdown.
      jest.spyOn(this.bookings, 'onModuleInit').mockImplementation(() => undefined);
      this.app.enableCors({ origin: true, credentials: true });
      await this.app.init();
      this.connection = fixture.get(getConnectionToken());
      for (const { name } of schemas) {
        await this.model(name).init();
      }
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  model(name: string): Model<any> {
    return this.app.get(getModelToken(name));
  }

  async reset() {
    for (const { name } of schemas) {
      await this.model(name).deleteMany({});
    }
  }

  async stop() {
    await this.app?.close();
    await this.mongo?.stop();
  }

  http() { return request(this.app.getHttpServer()); }

  token(user: any) { return this.jwt.sign({ sub: user._id.toString(), role: user.role }); }

  async user(role = UserRole.STANDARD, extra: Record<string, unknown> = {}) {
    return this.model(User.name).create({
      name: 'Integration User', email: `test-${randomUUID()}@example.invalid`,
      password: 'test-fixture-not-a-login-password', role, isVerified: true, ...extra,
    });
  }

  async fixture(overrides: Record<string, unknown> = {}) {
    const owner = await this.user(UserRole.ORGANIZER);
    const buyer = await this.user();
    const stranger = await this.user();
    const scanner = await this.user(UserRole.SCANNER);
    const admin = await this.user(UserRole.ADMIN);
    const theater = await this.model(Theater.name).create({
      name: 'Isolated Integration Theater', createdBy: admin._id,
      layout: {
        mainFloor: { rows: 2, seatsPerRow: 6, rowLabels: ['A', 'B'] },
        hasBalcony: true, balcony: { rows: 1, seatsPerRow: 4, rowLabels: ['A'] },
        removedSeats: ['main-B-6'], disabledSeats: ['main-B-5'], labels: [],
      },
      seatConfig: [{ row: 'A', seatNumber: 2, section: 'main', seatType: 'vip', isActive: true }],
    });
    const event = await this.model(Event.name).create({
      title: 'Isolated integration event', description: 'Disposable test fixture',
      date: new Date(Date.now() + 86400000 * 7), location: 'Test venue', organizerId: owner._id,
      status: 'approved', theater: theater._id, hasTheaterSeating: true,
      requiresOrganizerApproval: true, seatHoldDeadlineMinutes: 120, paymentDeadlineMinutes: 90,
      ticketPrice: 80, totalTickets: 14, remainingTickets: 14,
      seatPricing: [{ seatType: 'standard', price: 80 }, { seatType: 'vip', price: 150 }],
      bookedSeats: [], ...overrides,
    });
    return { owner, buyer, stranger, scanner, admin, theater, event, eventId: event._id.toString() };
  }

  async book(f: any, seats = [seat()], extra: Record<string, unknown> = {}) {
    return this.bookings.create({ eventId: f.eventId, selectedSeats: seats, ...extra }, f.buyer._id.toString());
  }

  async assertIntegrity(eventId: string) {
    const event = await this.model(Event.name).findById(eventId).lean();
    const bookings = await this.model(Booking.name).find({ eventId, status: { $in: ['pending', 'confirmed'] } }).lean();
    const tickets = await this.model(Ticket.name).find({ eventId: new Types.ObjectId(eventId) }).lean();
    const holds = await this.model(SeatHold.name).find({ eventId }).lean();
    const key = (s: any) => `${s.section || 'main'}-${s.row ?? s.seatRow}-${s.seatNumber}`;
    const occupied = event.bookedSeats.map(key);
    expect(new Set(occupied).size).toBe(occupied.length);
    expect(event.remainingTickets).toBe(event.totalTickets - occupied.length);
    const claims = bookings.flatMap(b => b.selectedSeats.map((s: any) => key(s)));
    expect(new Set(claims).size).toBe(claims.length);
    for (const b of bookings) {
      expect(b.numberOfTickets).toBe(b.selectedSeats.length);
      expect(b.totalPrice).toBe(b.selectedSeats.reduce((sum: number, s: any) => sum + s.price, 0));
      for (const s of b.selectedSeats) {
        expect(event.bookedSeats.filter((x: any) => key(x) === key(s) && String(x.bookingId) === String(b._id))).toHaveLength(1);
        const matches = tickets.filter(t => String(t.bookingId) === String(b._id) && key(t) === key(s));
        expect(matches).toHaveLength(b.status === 'confirmed' ? 1 : 0);
        for (const t of matches) {
          // Ticket reads populate userId, while booking reads keep StandardId as an ObjectId.
          const ticketUserId = (t.userId as any)?._id ?? t.userId;
          expect(String(ticketUserId)).toBe(String(b.StandardId));
        }
      }
    }
    for (const s of event.bookedSeats) {
      if (s.bookingId) expect(bookings.some(b => String(b._id) === String(s.bookingId) && b.selectedSeats.some((x: any) => key(x) === key(s)))).toBe(true);
      if (s.holdId) expect(holds.some(h => String(h._id) === String(s.holdId) && h.seats.some((x: any) => key(x) === key(s)))).toBe(true);
    }
    for (const t of tickets) {
      expect(bookings.some(b => b.status === 'confirmed' && String(b._id) === String(t.bookingId) && b.selectedSeats.some((s: any) => key(s) === key(t)))).toBe(true);
    }
    expect(new Set(tickets.map(t => t.qrData)).size).toBe(tickets.length);
  }
}

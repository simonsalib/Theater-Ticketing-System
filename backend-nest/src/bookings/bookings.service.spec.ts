import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BookingsService } from './bookings.service';
import { Booking } from './schemas/booking.schema';
import { SeatHold } from './schemas/seat-hold.schema';
import { Event } from '../events/schemas/event.schema';
import { Theater } from '../theaters/schemas/theater.schema';
import { User } from '../users/schemas/user.schema';
import { TicketsService } from '../tickets/tickets.service';

describe('BookingsService', () => {
  let service: BookingsService;
  const bookingExec = jest.fn();
  const eventExec = jest.fn();
  const bookingQuery: any = {};
  bookingQuery.select = jest.fn().mockReturnValue(bookingQuery);
  bookingQuery.populate = jest.fn().mockReturnValue(bookingQuery);
  bookingQuery.sort = jest.fn().mockReturnValue(bookingQuery);
  bookingQuery.lean = jest.fn().mockReturnValue(bookingQuery);
  bookingQuery.exec = bookingExec;
  const find = jest.fn().mockReturnValue(bookingQuery);
  const findById = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: eventExec }),
    }),
  });
  const currentEventId = '6abfb1b648f17761a0a02f12';
  const priorEventId = '6abfad2148f17761a09fe3cc';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getModelToken(Booking.name), useValue: { find } },
        { provide: getModelToken(SeatHold.name), useValue: {} },
        { provide: getModelToken(Event.name), useValue: { findById } },
        { provide: getModelToken(Theater.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: TicketsService, useValue: {} },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('keeps receipt images and heavy event seating data out of booking lists', async () => {
    bookingExec.mockResolvedValue([]);

    await service.findAllForUser('user-1');

    expect(bookingQuery.select).toHaveBeenCalledWith(
      expect.not.stringContaining('instapayReceipt'),
    );
    expect(bookingQuery.populate).toHaveBeenCalledWith(expect.objectContaining({
      path: 'eventId',
      select: expect.not.stringContaining('bookedSeats'),
    }));
  });

  it('includes the organizer payment QR only for bookings still awaiting payment', async () => {
    bookingExec.mockResolvedValue([
      {
        toObject: () => ({
          _id: 'unpaid',
          status: 'pending',
          isReceiptUploaded: false,
          eventId: { organizerId: { instapayQR: 'qr-data' } },
        }),
      },
      {
        toObject: () => ({
          _id: 'confirmed',
          status: 'confirmed',
          isReceiptUploaded: true,
          eventId: { organizerId: { instapayQR: 'qr-data' } },
        }),
      },
    ]);

    const result = await service.findAllForUser('user-1');

    expect(result[0].eventId.organizerId.instapayQR).toBe('qr-data');
    expect(result[1].eventId.organizerId.instapayQR).toBeUndefined();
  });

  it('returns only distinct confirmed seats for the requested event and user', async () => {
    eventExec.mockResolvedValue({ hasTheaterSeating: true });
    bookingExec.mockResolvedValue([
      { selectedSeats: [{ row: 'H', seatNumber: 12, section: 'main' }] },
      { selectedSeats: [
        { row: 'H', seatNumber: 12, section: 'main' },
        { row: 'K', seatNumber: 2, section: 'balcony' },
      ] },
    ]);

    const seats = await service.findMyConfirmedEventSeats(currentEventId, 'user-1');

    expect(find).toHaveBeenCalledWith({
      eventId: currentEventId,
      StandardId: 'user-1',
      status: 'confirmed',
      hasTheaterSeating: true,
    });
    expect(seats).toEqual({
      currentSeats: [
        { row: 'H', seatNumber: 12, section: 'main' },
        { row: 'K', seatNumber: 2, section: 'balcony' },
      ],
    });
  });

  it('scopes the lookup to the other performance when that event is opened', async () => {
    eventExec.mockResolvedValue({ hasTheaterSeating: true });
    bookingExec.mockResolvedValue([{ selectedSeats: [{ row: 'G', seatNumber: 9, section: 'main' }] }]);

    await expect(service.findMyConfirmedEventSeats(priorEventId, 'user-1'))
      .resolves.toEqual({ currentSeats: [{ row: 'G', seatNumber: 9, section: 'main' }] });
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ eventId: priorEventId, StandardId: 'user-1' }));
  });

  it('rejects an invalid event ID without querying bookings', async () => {
    await expect(service.findMyConfirmedEventSeats('invalid', 'user-1'))
      .rejects.toThrow('Invalid event ID');
    expect(find).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
  });

  it('does not query theater seats for a general-admission event', async () => {
    eventExec.mockResolvedValue({ hasTheaterSeating: false });

    await expect(service.findMyConfirmedEventSeats(currentEventId, 'user-1'))
      .resolves.toEqual({ currentSeats: [] });
    expect(find).not.toHaveBeenCalled();
  });

  it('does not return seats for a missing event', async () => {
    eventExec.mockResolvedValue(null);

    await expect(service.findMyConfirmedEventSeats(currentEventId, 'user-1'))
      .rejects.toThrow('Event not found');
    expect(find).not.toHaveBeenCalled();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

describe('BookingsController', () => {
  let controller: BookingsController;
  const findMyConfirmedEventSeats = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: { findMyConfirmedEventSeats } },
      ],
    }).compile();

    controller = module.get<BookingsController>(BookingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('uses the authenticated user to fetch their seats', async () => {
    const seats = { currentSeats: [{ row: 'K', seatNumber: 2, section: 'balcony' }] };
    findMyConfirmedEventSeats.mockResolvedValue(seats);

    await expect(controller.getMyConfirmedEventSeats('event-1', {
      user: { _id: 'user-1' },
    })).resolves.toEqual({ success: true, data: seats });
    expect(findMyConfirmedEventSeats).toHaveBeenCalledWith('event-1', 'user-1');
  });
});

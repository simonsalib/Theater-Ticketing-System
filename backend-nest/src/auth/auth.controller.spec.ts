import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BookingsService } from '../bookings/bookings.service';

describe('AuthController', () => {
  let controller: AuthController;
  const bookingsService = {
    releaseAllUserHolds: jest.fn(),
  };

  beforeEach(async () => {
    bookingsService.releaseAllUserHolds.mockReset().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: BookingsService, useValue: bookingsService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('releases the current user holds before clearing the auth cookie', async () => {
    const clearCookie = jest.fn();

    await controller.logout(
      { user: { _id: { toString: () => 'user-1' } } },
      { clearCookie } as any,
    );

    expect(bookingsService.releaseAllUserHolds).toHaveBeenCalledWith('user-1');
    expect(clearCookie).toHaveBeenCalledWith('token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });
    expect(bookingsService.releaseAllUserHolds.mock.invocationCallOrder[0])
      .toBeLessThan(clearCookie.mock.invocationCallOrder[0]);
  });
});

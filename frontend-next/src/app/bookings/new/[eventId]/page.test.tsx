import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
}));

vi.mock('@/services/api', () => ({ default: { get: mocks.get, post: mocks.post, delete: vi.fn() } }));
vi.mock('next/navigation', () => ({
    useParams: () => ({ eventId: 'event-1' }),
    useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));
vi.mock('@/auth/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/contexts/LanguageContext', () => ({
    useLanguage: () => ({ t: (key: string) => key, isRTL: false }),
}));
vi.mock('@/components/Booking component/SeatSelector', () => ({ default: () => <div data-testid="seat-selector" /> }));
vi.mock('@/components/Booking component/CancelSeatsModal', () => ({ default: () => null }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import BookTicketPage from './page';

describe('new booking page integration', () => {
    beforeEach(() => {
        mocks.get.mockReset();
        mocks.post.mockReset();
        mocks.push.mockReset();
        mocks.back.mockReset();
        mocks.get.mockImplementation((url: string) => {
            if (url === '/event/event-1') {
                return Promise.resolve({
                    data: {
                        success: true,
                        data: {
                            _id: 'event-1', title: 'Instant General Admission', description: 'Test event',
                            date: '2030-01-01T20:00:00.000Z', location: 'Cairo', category: 'Music',
                            ticketPrice: 150, remainingTickets: 10, totalTickets: 10,
                            status: 'approved', hasTheaterSeating: false, requiresOrganizerApproval: false,
                        },
                    },
                });
            }
            return Promise.resolve({ data: { success: true, data: { seats: [] } } });
        });
        mocks.post.mockResolvedValue({ data: { success: true, data: { _id: 'booking-1', status: 'confirmed' } } });
    });

    it('opens QR tickets after an instant general-admission booking', async () => {
        const actor = userEvent.setup();
        render(<BookTicketPage />);

        expect(await screen.findByText('Instant General Admission')).toBeInTheDocument();
        await actor.click(screen.getByRole('button', { name: 'Confirm Booking' }));

        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/booking', {
            eventId: 'event-1', holdId: undefined, numberOfTickets: 1,
        }));
        expect(mocks.push).toHaveBeenCalledWith('/bookings/booking-1/tickets');
    });
});

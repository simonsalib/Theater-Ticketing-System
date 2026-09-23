import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    event: null as Record<string, unknown> | null,
}));

vi.mock('@/services/api', () => ({ default: { get: mocks.get, post: mocks.post, delete: mocks.delete } }));
vi.mock('next/navigation', () => ({
    useParams: () => ({ eventId: 'event-1' }),
    useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));
vi.mock('@/auth/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/contexts/LanguageContext', () => ({
    useLanguage: () => ({ t: (key: string) => key, isRTL: false }),
}));
vi.mock('@/components/Booking component/SeatSelector', () => ({
    default: ({ onSeatsSelected }: { onSeatsSelected?: (seats: unknown[], total: number) => void }) => (
        <button
            data-testid="seat-selector"
            onClick={() => onSeatsSelected?.([{
                _id: 'seat-1', row: 'A', seatNumber: 1, section: 'main',
                seatLabel: 'A1', seatType: 'standard', price: 100,
            }], 100)}
        >
            Select A1
        </button>
    ),
}));
vi.mock('@/components/Booking component/CancelSeatsModal', () => ({ default: () => null }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import BookTicketPage from './page';

describe('new booking page integration', () => {
    beforeEach(() => {
        mocks.get.mockReset();
        mocks.post.mockReset();
        mocks.delete.mockReset();
        mocks.delete.mockResolvedValue({ data: { success: true } });
        mocks.push.mockReset();
        mocks.back.mockReset();
        mocks.event = {
            _id: 'event-1', title: 'Instant General Admission', description: 'Test event',
            date: '2030-01-01T20:00:00.000Z', location: 'Cairo', category: 'Music',
            ticketPrice: 150, remainingTickets: 10, totalTickets: 10,
            status: 'approved', hasTheaterSeating: false, requiresOrganizerApproval: false,
        };
        mocks.get.mockImplementation((url: string) => {
            if (url === '/event/event-1') {
                return Promise.resolve({
                    data: {
                        success: true,
                        data: mocks.event,
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

    it('holds a theater seat, submits attendee ownership, and opens its instant QR', async () => {
        const actor = userEvent.setup();
        mocks.event = {
            _id: 'event-1', title: 'Instant Theater Event', description: 'Test event',
            date: '2030-01-01T20:00:00.000Z', location: 'Cairo', category: 'Theater',
            ticketPrice: 100, remainingTickets: 1, totalTickets: 1,
            status: 'approved', hasTheaterSeating: true, requiresOrganizerApproval: false,
        };
        mocks.post.mockImplementation((url: string) => {
            if (url === '/booking/hold-seats') {
                return Promise.resolve({
                    data: {
                        success: true,
                        data: { holdId: 'hold-1', expiresAt: '2030-01-01T19:59:00.000Z' },
                    },
                });
            }
            return Promise.resolve({ data: { success: true, data: { _id: 'booking-2', status: 'confirmed' } } });
        });

        render(<BookTicketPage />);

        expect(await screen.findByText('Instant Theater Event')).toBeInTheDocument();
        await actor.click(screen.getByRole('button', { name: 'Select A1' }));
        await actor.click(screen.getByRole('button', { name: /gen\.next/ }));

        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/booking/hold-seats', {
            eventId: 'event-1',
            seats: [{ row: 'A', seatNumber: 1, section: 'main' }],
        }));

        await actor.type(await screen.findByPlaceholderText('attendee.firstName.placeholder'), 'Mina');
        await actor.type(screen.getByPlaceholderText('attendee.lastName.placeholder'), 'Nabil');
        await actor.type(screen.getByPlaceholderText('attendee.phone.placeholder'), '01012345678');
        await actor.click(screen.getByRole('button', { name: /Get QR Tickets/i }));

        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/booking', {
            eventId: 'event-1',
            holdId: 'hold-1',
            selectedSeats: [{
                row: 'A', seatNumber: 1, section: 'main', seatLabel: 'A1',
                attendeeFirstName: 'Mina', attendeeLastName: 'Nabil', attendeePhone: '01012345678',
            }],
        }));
        expect(mocks.push).toHaveBeenCalledWith('/bookings/booking-2/tickets');
    });
});

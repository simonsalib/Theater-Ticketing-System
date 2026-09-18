import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('next/navigation', () => ({
    useRouter: () => routerMocks,
}));

vi.mock('@/auth/AuthContext', () => ({
    useAuth: () => ({ user: { _id: 'organizer-1', role: 'Organizer' } }),
}));

vi.mock('@/services/api', () => ({
    default: apiMocks,
}));

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import EventForm from './EventForm';

describe('EventForm integration', () => {
    it('sends organizer-selected approval and payment hold settings when creating an event', async () => {
        const user = userEvent.setup();
        apiMocks.get.mockResolvedValue({ data: { success: true, data: [] } });
        apiMocks.post.mockResolvedValue({ data: { success: true, data: { _id: 'event-1' } } });

        render(<EventForm />);

        await user.type(screen.getByLabelText('Event Title*'), 'Frontend integration event');
        await user.type(screen.getByLabelText('Description*'), 'Verifies payment settings are preserved.');
        fireEvent.change(screen.getByLabelText('Event Date*'), { target: { value: '2027-01-20' } });
        fireEvent.change(screen.getByLabelText('Ticket Cancellation Request Deadline*'), { target: { value: '2027-01-19' } });
        fireEvent.change(screen.getByLabelText('Start Time*'), { target: { value: '18:00' } });
        fireEvent.change(screen.getByLabelText('End Time*'), { target: { value: '20:00' } });
        await user.type(screen.getByLabelText('Location*'), 'Cairo');
        fireEvent.change(screen.getByLabelText('Payment Time Limit (minutes)*'), { target: { value: '120' } });
        fireEvent.change(screen.getByLabelText('Seat Hold Time Limit (minutes)*'), { target: { value: '15' } });
        fireEvent.change(screen.getByLabelText('Available Tickets*'), { target: { value: '50' } });
        fireEvent.change(screen.getByLabelText('Base Ticket Price (EGP)*'), { target: { value: '240' } });

        await user.click(screen.getByRole('button', { name: 'Create Event' }));

        await waitFor(() => {
            expect(apiMocks.post).toHaveBeenCalledWith('/event', expect.objectContaining({
                requiresOrganizerApproval: true,
                paymentDeadlineMinutes: 120,
                seatHoldDeadlineMinutes: 15,
                ticketPrice: 240,
                totalTickets: 50,
            }));
        });
        expect(routerMocks.push).toHaveBeenCalledWith('/my-events');
    });
});

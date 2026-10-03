import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), push: vi.fn() }));

vi.mock('@/services/api', () => ({ default: { get: mocks.get } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'user-1', name: 'Test User', role: 'Standard User' }, loading: false }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => ({
    'events.paymentTitle': 'Complete your ticket payment',
    'events.paymentAction': 'Complete payment',
    'events.paymentBlocked': 'Complete payment first',
}[key] || key) }) }));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));

import EventListPage from './page';

const event = {
    _id: 'event-1', title: 'Friday Concert', description: 'Concert',
    date: '2030-01-01T20:00:00.000Z', location: 'Cairo', category: 'Music',
    ticketPrice: 100, remainingTickets: 20, totalTickets: 20,
    status: 'approved', hasTheaterSeating: false,
};
const otherEvent = { ...event, _id: 'event-2', title: 'Saturday Concert' };

describe('event list with pending payment', () => {
    beforeEach(() => {
        mocks.get.mockReset();
        mocks.push.mockReset();
    });

    it('shows the payment timer and disables new booking while a receipt is due', async () => {
        mocks.get.mockImplementation((url: string) => Promise.resolve({ data: { success: true, data: url === '/event/approved'
            ? [event, otherEvent]
            : [{ _id: 'booking-1', eventId: 'event-1', numberOfTickets: 2,
                pendingExpiresAt: '2030-01-01T19:00:00.000Z' }] } }));

        render(<EventListPage />);

        expect(await screen.findByText('Complete your ticket payment')).toBeInTheDocument();
        expect(within(screen.getByRole('status')).getByText(/Friday Concert/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Complete payment/i })).toHaveAttribute('href', '/bookings?payment=booking-1');
        const blockedCard = screen.getByRole('heading', { name: 'Friday Concert' }).closest('.event-card-wrapper') as HTMLElement;
        const availableCard = screen.getByRole('heading', { name: 'Saturday Concert' }).closest('.event-card-wrapper') as HTMLElement;
        expect(within(blockedCard).getByRole('button', { name: 'Complete payment first' })).toBeDisabled();
        expect(within(availableCard).getByRole('button', { name: 'card.bookNow' })).toBeEnabled();
        expect(within(blockedCard).getByRole('button', { name: 'card.details' })).toBeEnabled();
        expect(mocks.get).toHaveBeenCalledWith('/booking/my-bookings?unpaidOnly=true');
    });

    it('shows a separate payment reminder for each event with an unpaid booking', async () => {
        mocks.get.mockImplementation((url: string) => Promise.resolve({ data: { success: true, data: url === '/event/approved'
            ? [event, otherEvent]
            : [
                { _id: 'booking-1', eventId: 'event-1', status: 'pending', pendingExpiresAt: '2030-01-01T19:00:00.000Z' },
                { _id: 'booking-2', eventId: 'event-2', status: 'pending', pendingExpiresAt: '2030-01-01T19:00:00.000Z' },
            ] } }));

        render(<EventListPage />);

        await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(2));
        expect(screen.getAllByRole('link', { name: /Complete payment/i }).map(link => link.getAttribute('href')))
            .toEqual(['/bookings?payment=booking-1', '/bookings?payment=booking-2']);
        expect(screen.getAllByRole('button', { name: 'Complete payment first' })).toHaveLength(2);
    });

    it('allows new booking after the receipt is uploaded', async () => {
        mocks.get.mockImplementation((url: string) => Promise.resolve({ data: { success: true, data: url === '/event/approved'
            ? [event]
            : [{ _id: 'booking-1', status: 'pending', isReceiptUploaded: true,
                pendingExpiresAt: '2030-01-01T19:00:00.000Z' }] } }));

        render(<EventListPage />);

        await waitFor(() => expect(screen.getByRole('button', { name: 'card.bookNow' })).toBeEnabled());
        expect(screen.queryByText('Complete your ticket payment')).not.toBeInTheDocument();
    });
});

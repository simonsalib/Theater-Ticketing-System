import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), push: vi.fn() }));

vi.mock('@/services/api', () => ({ default: { get: mocks.get } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'user-1', name: 'Test User', role: 'Standard User' }, loading: false }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));

import EventListPage from './page';

const event = {
    _id: 'event-1', title: 'Friday Concert', description: 'Concert',
    date: '2030-01-01T20:00:00.000Z', location: 'Cairo', category: 'Music',
    ticketPrice: 100, remainingTickets: 20, totalTickets: 20,
    status: 'approved', hasTheaterSeating: false,
};

describe('event list with pending payment', () => {
    beforeEach(() => {
        mocks.get.mockReset();
        mocks.push.mockReset();
    });

    it('shows the payment timer and disables new booking while a receipt is due', async () => {
        mocks.get.mockImplementation((url: string) => Promise.resolve({ data: { success: true, data: url === '/event/approved'
            ? [event]
            : [{ _id: 'booking-1', eventId: 'event-1', status: 'pending', numberOfTickets: 2,
                isReceiptUploaded: false, pendingExpiresAt: '2030-01-01T19:00:00.000Z' }] } }));

        render(<EventListPage />);

        expect(await screen.findByText('Complete your ticket payment')).toBeInTheDocument();
        expect(screen.getByText(/Friday Concert.*2 tickets/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Complete payment/i })).toHaveAttribute('href', '/bookings?payment=booking-1');
        expect(screen.getByRole('button', { name: 'Complete payment first' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'card.details' })).toBeEnabled();
        expect(mocks.get).toHaveBeenCalledWith('/booking/my-bookings?unpaidOnly=true');
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

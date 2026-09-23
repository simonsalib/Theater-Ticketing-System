import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/services/api', () => ({ default: { get: apiMocks.get } }));

import SeatSelector from './SeatSelector';

const theater = {
    _id: 'theater-1',
    name: 'Custom Hall',
    location: 'Cairo',
    totalSeats: 1,
    active: true,
    layout: {
        mainFloor: { rows: 1, seatsPerRow: 1, rowLabels: ['Orchestra'] },
        hasBalcony: true,
        balcony: { rows: 1, seatsPerRow: 1, rowLabels: ['Gallery'] },
        stage: { position: 'top' as const },
    },
};

const availableSeat = {
    _id: 'seat-1', eventId: 'event-1', section: 'main', row: 'Orchestra', seatNumber: 1,
    seatType: 'standard' as const, price: 100, isBooked: false, isPending: false, isActive: true,
};

describe('SeatSelector integration', () => {
    afterEach(() => vi.useRealTimers());

    it('renders configured row labels and refreshes an eager seat snapshot', async () => {
        vi.useFakeTimers();
        apiMocks.get.mockResolvedValue({
            data: {
                success: true,
                data: { theater, seatPricing: [{ seatType: 'standard', price: 100 }], seats: [{ ...availableSeat, isBooked: true }] },
            },
        });

        const { container } = render(
            <SeatSelector
                eventId="event-1"
                initialSeatsData={{ theater, seatPricing: [{ seatType: 'standard', price: 100 }], seats: [availableSeat] }}
            />,
        );

        expect(screen.getByText('Orchestra Left')).toBeInTheDocument();
        const seatButton = () => container.querySelector<HTMLButtonElement>('.seat-btn');
        expect(seatButton()).not.toBeDisabled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });

        expect(apiMocks.get).toHaveBeenCalledWith('/booking/event/event-1/seats');
        expect(seatButton()).toBeDisabled();
    });

    it('renders the configured balcony when the user switches sections', async () => {
        const user = userEvent.setup();
        render(
            <SeatSelector
                eventId="event-1"
                initialSeatsData={{
                    theater,
                    seatPricing: [{ seatType: 'standard', price: 100 }],
                    seats: [availableSeat, {
                        ...availableSeat,
                        _id: 'seat-2',
                        section: 'balcony',
                        row: 'Gallery',
                    }],
                }}
            />,
        );

        await user.click(screen.getByRole('button', { name: /balcony/i }));

        expect(screen.getByText('Gallery Left')).toBeInTheDocument();
        expect(screen.getByText('Gallery Right')).toBeInTheDocument();
    });
});

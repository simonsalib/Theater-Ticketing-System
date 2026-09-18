import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../Theater/TheaterDesigner', () => ({
    default: ({ initialLayout, seatCategoryMap }: {
        initialLayout: { mainFloor: { rowLabels?: string[] }; balcony: { rowLabels?: string[] } };
        seatCategoryMap: Record<string, string>;
    }) => (
        <div>
            <output data-testid="main-row-labels">{JSON.stringify(initialLayout.mainFloor.rowLabels)}</output>
            <output data-testid="balcony-row-labels">{JSON.stringify(initialLayout.balcony.rowLabels)}</output>
            <output data-testid="seat-map">{JSON.stringify(seatCategoryMap)}</output>
        </div>
    ),
}));

import EventSeatConfigurator from './EventSeatConfigurator';

const theaterLayout = {
    stage: { position: 'top' as const, width: 80, height: 15 },
    mainFloor: { rows: 1, seatsPerRow: 2, rowLabels: ['Orchestra-A'] },
    hasBalcony: true,
    balcony: { rows: 1, seatsPerRow: 3, rowLabels: ['BALC-A'] },
};

describe('EventSeatConfigurator integration', () => {
    it('preserves custom row labels and saves hyphenated seat rows accurately', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();

        render(
            <EventSeatConfigurator
                theaterLayout={theaterLayout}
                initialSeatConfig={[{ section: 'balcony', row: 'BALC-A', seatNumber: 2, seatType: 'vip' }]}
                initialPreBookedSeats={[{ section: 'balcony', row: 'BALC-A', seatNumber: 3 }]}
                onSave={onSave}
                onCancel={vi.fn()}
            />,
        );

        expect(screen.getByTestId('main-row-labels')).toHaveTextContent('["Orchestra-A"]');
        expect(screen.getByTestId('balcony-row-labels')).toHaveTextContent('["BALC-A"]');
        await waitFor(() => {
            expect(screen.getByTestId('seat-map')).toHaveTextContent('balcony-BALC-A-2');
        });

        await user.click(screen.getByRole('button', { name: /save configuration/i }));

        expect(onSave).toHaveBeenCalledWith(
            [{ section: 'balcony', row: 'BALC-A', seatNumber: 2, seatType: 'vip' }],
            expect.any(Array),
            [{ section: 'balcony', row: 'BALC-A', seatNumber: 3 }],
        );
    });
});

export interface SeatKeyParts {
    section: string;
    row: string;
    seatNumber: number;
}

// Rows can contain hyphens (for example, BALC-A), so only the first and
// final separators belong to the section and seat number.
export const createSeatKey = (section: string, row: string, seatNumber: number) =>
    `${section}-${row}-${seatNumber}`;

export const parseSeatKey = (key: string): SeatKeyParts | null => {
    const firstSeparator = key.indexOf('-');
    const finalSeparator = key.lastIndexOf('-');

    if (firstSeparator <= 0 || finalSeparator <= firstSeparator + 1) {
        return null;
    }

    const section = key.slice(0, firstSeparator);
    const row = key.slice(firstSeparator + 1, finalSeparator);
    const seatNumber = Number(key.slice(finalSeparator + 1));

    if (!section || !row || !Number.isInteger(seatNumber) || seatNumber < 1) {
        return null;
    }

    return { section, row, seatNumber };
};

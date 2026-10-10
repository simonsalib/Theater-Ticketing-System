import { Connection, Types } from 'mongoose';
import {
  AuditSnapshot,
  AuditTheaterLayout,
  auditId,
  auditSeats,
  SeatAuditReport,
} from './seat-audit';

export async function readSeatAudit(
  connection: Connection,
  eventId: string,
  expiryGraceMs = 120_000,
): Promise<SeatAuditReport> {
  if (!Types.ObjectId.isValid(eventId)) throw new Error('Invalid event ID');
  const db = connection.db!;
  const session = await connection.startSession();
  try {
    // Sequential reads in one snapshot; do not mix states from different instants.
    return await session.withTransaction(
      async () => {
        const options = { session, maxTimeMS: 30_000 };
        const _id = new Types.ObjectId(eventId);
        const event = await db.collection('events').findOne(
          { _id },
          {
            ...options,
            projection: {
              totalTickets: 1,
              remainingTickets: 1,
              bookedSeats: 1,
              hasTheaterSeating: 1,
              theater: 1,
            },
          },
        );
        if (!event?.hasTheaterSeating)
          throw new Error('Seated event not found');
        const theater = Types.ObjectId.isValid(String(event.theater || ''))
          ? await db
              .collection('theaters')
              .findOne(
                { _id: new Types.ObjectId(String(event.theater)) },
                { ...options, projection: { layout: 1 } },
              )
          : null;
        const bookings = await db
          .collection('bookings')
          .find(
            { eventId: _id },
            {
              ...options,
              projection: {
                StandardId: 1,
                status: 1,
                numberOfTickets: 1,
                pendingExpiresAt: 1,
                isReceiptUploaded: 1,
                'selectedSeats.row': 1,
                'selectedSeats.seatNumber': 1,
                'selectedSeats.section': 1,
              },
            },
          )
          .toArray();
        const holds = await db
          .collection('seatholds')
          .find(
            { eventId: _id },
            {
              ...options,
              projection: { userId: 1, seats: 1, expiresAt: 1 },
            },
          )
          .toArray();
        const tickets = await db
          .collection('tickets')
          .aggregate(
            [
              {
                $match: {
                  $or: [
                    { eventId: _id },
                    { bookingId: { $in: bookings.map((b) => b._id) } },
                  ],
                },
              },
              {
                $project: {
                  bookingId: 1,
                  eventId: 1,
                  userId: 1,
                  seatRow: 1,
                  seatNumber: 1,
                  section: 1,
                  qrData: 1,
                  hasQrImage: {
                    $regexMatch: {
                      input: {
                        $cond: [
                          { $eq: [{ $type: '$qrCodeImage' }, 'string'] },
                          '$qrCodeImage',
                          '',
                        ],
                      },
                      regex: '^data:image/png;base64,iVBORw0KGgo',
                    },
                  },
                },
              },
            ],
            options,
          )
          .toArray();
        const userIds = [
          ...new Set([
            ...bookings.map((b) => auditId(b.StandardId)),
            ...holds.map((h) => auditId(h.userId)),
          ]),
        ]
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id));
        const users = await db
          .collection('users')
          .find(
            { _id: { $in: userIds } },
            { ...options, projection: { _id: 1 } },
          )
          .toArray();
        return auditSeats(
          {
            event,
            bookings,
            holds,
            tickets,
            userIds: users.map((u) => auditId(u._id)),
            theaterLayout: (theater?.layout ??
              null) as AuditTheaterLayout | null,
          } as unknown as AuditSnapshot,
          new Date(),
          expiryGraceMs,
        );
      },
      { readConcern: { level: 'snapshot' }, maxCommitTimeMS: 30_000 },
    );
  } finally {
    await session.endSession();
  }
}

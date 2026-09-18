import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { Booking, BookingDocument } from '../bookings/schemas/booking.schema';
import { Event, EventDocument } from '../events/schemas/event.schema';
import { UserRole } from '../users/schemas/user.schema';
import { randomUUID } from 'node:crypto';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectModel(Ticket.name)
    private ticketModel: Model<TicketDocument>,
    @InjectModel(Booking.name)
    private bookingModel: Model<BookingDocument>,
    @InjectModel(Event.name)
    private eventModel: Model<EventDocument>,
  ) { }

  /**
   * Generate tickets with QR codes for a confirmed booking.
   * Called when organizer approves payment.
   */
  async generateTicketsForBooking(
    bookingId: string,
    eventId: string,
    userId: string,
    selectedSeats: Array<{
      row: string;
      seatNumber: number;
      section: string;
      seatType: string;
      price: number;
      attendeeFirstName?: string;
      attendeeLastName?: string;
      attendeePhone?: string;
      seatLabel?: string;
    }>,
  ): Promise<TicketDocument[]> {
    const tickets: TicketDocument[] = [];

    for (const seat of selectedSeats) {
      const seatFilter = {
        bookingId: new Types.ObjectId(bookingId),
        section: seat.section,
        seatRow: seat.row,
        seatNumber: seat.seatNumber,
      };
      const existing = await this.ticketModel.findOne(seatFilter).exec();
      if (existing) {
        tickets.push(existing);
        continue;
      }

      const qrData = `TICKET-${bookingId}-${randomUUID()}`;

      // Generate QR code as base64 data URL
      const qrCodeImage = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H',
      });

      const ticket = new this.ticketModel({
        bookingId: new Types.ObjectId(bookingId),
        eventId: new Types.ObjectId(eventId),
        userId: new Types.ObjectId(userId),
        seatRow: seat.row,
        seatNumber: seat.seatNumber,
        section: seat.section,
        seatType: seat.seatType,
        price: seat.price,
        attendeeFirstName: seat.attendeeFirstName || '',
        attendeeLastName: seat.attendeeLastName || '',
        attendeePhone: seat.attendeePhone || '',
        seatLabel: seat.seatLabel || '',
        qrData,
        qrCodeImage,
        isScanned: false,
        scannedAt: null,
        scannedBy: null,
      });

      try {
        tickets.push(await ticket.save());
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        const concurrentTicket = await this.ticketModel.findOne(seatFilter).exec();
        if (!concurrentTicket) throw error;
        tickets.push(concurrentTicket);
      }
    }

    return tickets;
  }

  /**
   * Get all tickets for a specific booking (for user to download).
   * Auto-generates tickets if the booking is confirmed but tickets don't exist yet.
   */
  private isAdmin(user: any): boolean {
    return user?.role === UserRole.ADMIN;
  }

  private async assertBookingAccess(bookingId: string, user?: any): Promise<BookingDocument> {
    const booking = await this.bookingModel.findById(bookingId).exec();
    if (!booking) throw new NotFoundException('Booking not found');
    if (!user || this.isAdmin(user) || booking.StandardId.toString() === user._id?.toString()) {
      return booking;
    }
    const event = await this.eventModel.findById(booking.eventId).exec();
    if (!event || event.organizerId.toString() !== user._id?.toString()) {
      throw new ForbiddenException('You are not authorised to access these tickets');
    }
    return booking;
  }

  private async assertEventAccess(eventId: any, user?: any): Promise<EventDocument> {
    const event = await this.eventModel.findById(eventId).exec();
    if (!event) throw new NotFoundException('Event not found');
    if (!user || this.isAdmin(user) || user.role === UserRole.SCANNER || event.organizerId.toString() === user._id?.toString()) {
      return event;
    }
    throw new ForbiddenException('You are not authorised to access this event tickets');
  }

  async getTicketsByBooking(bookingId: string, user?: any): Promise<TicketDocument[]> {
    const booking = await this.assertBookingAccess(bookingId, user);
    let tickets = await this.ticketModel
      .find({ bookingId: new Types.ObjectId(bookingId) })
      .populate('eventId', 'title date location')
      .populate('userId', 'name email phone')
      .exec();

    if (booking.status === 'confirmed') {
      const ticketSeats = booking.hasTheaterSeating
        ? (booking.selectedSeats || []).map((s: any) => ({
          row: s.row,
          seatNumber: s.seatNumber,
          section: s.section || 'main',
          seatType: s.seatType || 'standard',
          price: s.price || 0,
          attendeeFirstName: s.attendeeFirstName || '',
          attendeeLastName: s.attendeeLastName || '',
          attendeePhone: s.attendeePhone || '',
          seatLabel: s.seatLabel || '',
        }))
        : Array.from({ length: booking.numberOfTickets }, (_, index) => ({
          row: 'General', seatNumber: index + 1, section: 'general',
          seatType: 'standard', price: booking.totalPrice / booking.numberOfTickets,
          attendeeFirstName: '', attendeeLastName: '', attendeePhone: '', seatLabel: `General admission ${index + 1}`,
        }));

      // This is idempotent per seat. It repairs missing QR tickets without changing existing QR data.
      await this.generateTicketsForBooking(bookingId, booking.eventId.toString(), booking.StandardId.toString(), ticketSeats);
      tickets = await this.ticketModel
        .find({ bookingId: new Types.ObjectId(bookingId) })
        .populate('eventId', 'title date location')
        .populate('userId', 'name email phone')
        .exec();
    }

    return tickets;
  }

  /**
   * Get all tickets for an event (for organizer).
   */
  async getTicketsByEvent(eventId: string, user?: any): Promise<TicketDocument[]> {
    await this.assertEventAccess(eventId, user);
    return this.ticketModel
      .find({ eventId: new Types.ObjectId(eventId) })
      .populate('userId', 'name email phone')
      .populate('bookingId', 'status totalPrice')
      .exec();
  }

  /**
   * Scan a QR code - returns ticket details and marks as scanned.
   * If already scanned, returns info but flags it as not free.
   */
  async scanTicket(
    qrData: string,
    scannedByUserId: string,
    expectedEventId?: string,
    requestingUser?: any,
  ): Promise<{
    ticket: TicketDocument;
    userEmail: string;
    userPhone: string;
    userName: string;
    seatRow: string;
    seatNumber: number;
    section: string;
    seatType: string;
    seatLabel: string;
    attendeeFirstName: string;
    attendeeLastName: string;
    attendeePhone: string;
    isFree: boolean;
    message: string;
    eventId: string;
    eventTitle: string;
    eventDate: string;
    eventLocation: string;
    startTime: string;
    endTime: string;
  }> {
    const ticket = await this.ticketModel
      .findOne({ qrData })
      .populate('userId', 'name email phone')
      .populate('eventId', 'title date location startTime endTime')
      .populate('bookingId', 'status')
      .exec();

    if (!ticket) {
      throw new NotFoundException('Invalid QR code - no ticket found');
    }

    const eventData = ticket.eventId as any;
    await this.assertEventAccess(eventData?._id ?? ticket.eventId, requestingUser);

    // Check that the ticket belongs to the expected event
    if (expectedEventId) {
      const ticketEventId = eventData?._id?.toString() || ticket.eventId?.toString();
      if (ticketEventId !== expectedEventId) {
        const eventTitle = eventData?.title || 'another event';
        throw new BadRequestException(
          `This ticket belongs to "${eventTitle}", not this event.`,
        );
      }
    }

    // Check if event is expired
    if (eventData && eventData.date) {
      const eventDate = new Date(eventData.date);
      const expirationDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000); // 1 day after event date
      const now = new Date();
      if (now >= expirationDate) {
        throw new BadRequestException('This event has already expired. Tickets cannot be scanned anymore.');
      }
    }

    // Check if booking is confirmed
    const booking = ticket.bookingId as any;
    if (!booking || booking.status !== 'confirmed') {
      throw new BadRequestException(
        `This ticket belongs to a ${booking.status} booking`,
      );
    }

    const user = ticket.userId as any;

    const baseResponse = {
      ticket,
      userEmail: user?.email || '',
      userPhone: user?.phone || '',
      userName: user?.name || '',
      seatRow: ticket.seatRow,
      seatNumber: ticket.seatNumber,
      section: ticket.section,
      seatType: ticket.seatType,
      seatLabel: ticket.seatLabel || '',
      attendeeFirstName: ticket.attendeeFirstName,
      attendeeLastName: ticket.attendeeLastName,
      attendeePhone: ticket.attendeePhone,
      eventId: eventData?._id?.toString() || '',
      eventTitle: eventData?.title || '',
      eventDate: eventData?.date || '',
      eventLocation: eventData?.location || '',
      startTime: eventData?.startTime || '',
      endTime: eventData?.endTime || '',
    };

    if (ticket.isScanned) {
      // Already scanned - not free
      return {
        ...baseResponse,
        isFree: false,
        message: `⚠️ This ticket was already scanned on ${ticket.scannedAt?.toLocaleString('en-US', { timeZone: 'Africa/Cairo' })}. This seat is NOT free.`,
      };
    }

    // First scan - mark as scanned
    const scannedAt = new Date();
    const claimedTicket = await this.ticketModel.findOneAndUpdate(
      { _id: ticket._id, isScanned: false },
      { $set: { isScanned: true, scannedAt, scannedBy: new Types.ObjectId(scannedByUserId) } },
      { returnDocument: 'after' },
    ).exec();
    if (!claimedTicket) {
      return {
        ...baseResponse,
        isFree: false,
        message: 'This ticket was already scanned. This seat is NOT free.',
      };
    }

    // Remove this seat from any pending cancellation request on the booking
    try {
      const fullBooking = await this.bookingModel.findById(ticket.bookingId).exec();
      if (fullBooking?.cancellationRequest?.status === 'pending') {
        const seatKey = `${ticket.section}-${ticket.seatRow}-${ticket.seatNumber}`;
        const remaining = (fullBooking.cancellationRequest.seatsToCancel || []).filter(
          (s: any) => `${s.section}-${s.row}-${s.seatNumber}` !== seatKey,
        );
        if (remaining.length === 0) {
          // No seats left in the request — reset it
          fullBooking.cancellationRequest = {
            status: 'none',
            requestedAt: null,
            reason: '',
            seatsToCancel: [],
            cancelAll: false,
          } as any;
        } else {
          fullBooking.cancellationRequest.seatsToCancel = remaining as any;
          fullBooking.cancellationRequest.cancelAll = false;
        }
        await fullBooking.save();
      }
    } catch (err) {
      this.logger.error(`Error updating cancellation request after scan:`, err);
    }

    return {
      ...baseResponse,
      isFree: true,
      message: '✅ Valid ticket! This is the first scan. Seat is free to enter.',
    };
  }

  /**
   * Get all scanned tickets for a booking (used to exclude from cancellation).
   */
  async getScannedSeatsForBooking(bookingId: string): Promise<TicketDocument[]> {
    return this.ticketModel
      .find({
        bookingId: new Types.ObjectId(bookingId),
        isScanned: true,
      })
      .exec();
  }

  /**
   * Delete all tickets for a booking (used when cancellation is approved).
   */
  async deleteTicketsForBooking(bookingId: string): Promise<number> {
    const result = await this.ticketModel
      .deleteMany({ bookingId: new Types.ObjectId(bookingId) })
      .exec();
    this.logger.log(`Deleted ${result.deletedCount} tickets for booking ${bookingId}`);
    return result.deletedCount;
  }

  /**
   * Delete tickets for specific seats of a booking (partial cancellation).
   */
  async deleteTicketsForSeats(
    bookingId: string,
    seats: Array<{ row: string; seatNumber: number; section: string }>,
  ): Promise<number> {
    let deletedCount = 0;
    for (const seat of seats) {
      const result = await this.ticketModel
        .deleteMany({
          bookingId: new Types.ObjectId(bookingId),
          seatRow: seat.row,
          seatNumber: seat.seatNumber,
          section: seat.section,
        })
        .exec();
      deletedCount += result.deletedCount;
    }
    this.logger.log(`Deleted ${deletedCount} tickets for partial cancellation of booking ${bookingId}`);
    return deletedCount;
  }

  /**
   * Get a single ticket by ID.
   */
  async getTicketById(ticketId: string, user?: any): Promise<TicketDocument> {
    const ticket = await this.ticketModel
      .findById(ticketId)
      .populate('eventId', 'title date location')
      .populate('userId', 'name email phone')
      .exec();

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    await this.assertBookingAccess(ticket.bookingId.toString(), user);

    return ticket;
  }

  /**
   * Get all tickets scanned by a specific user (Scanner).
   */
  async getTicketsScannedBy(scannerId: string): Promise<TicketDocument[]> {
    return this.ticketModel
      .find({ scannedBy: new Types.ObjectId(scannerId) })
      .populate('eventId', 'title date location')
      .populate('userId', 'name email phone')
      .sort({ scannedAt: -1 })
      .exec();
  }

  /**
   * Get scan statistics for an event.
   */
  async getEventScanStats(eventId: string) {
    const total = await this.ticketModel
      .countDocuments({ eventId: new Types.ObjectId(eventId) })
      .exec();
    const scanned = await this.ticketModel
      .countDocuments({
        eventId: new Types.ObjectId(eventId),
        isScanned: true,
      })
      .exec();

    return {
      total,
      scanned,
      remaining: total - scanned,
      percentage: total > 0 ? Math.round((scanned / total) * 100) : 0,
    };
  }
}

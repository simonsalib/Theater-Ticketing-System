import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Event, EventDocument } from './schemas/event.schema';
import { Booking, BookingDocument } from '../bookings/schemas/booking.schema';
import { MailService } from '../mail/mail.service';
import { UserRole } from '../users/schemas/user.schema';

const EVENT_STATUSES = ['approved', 'pending', 'declined'];
const PRICED_SEAT_TYPES = ['standard', 'vip', 'premium', 'wheelchair'];
const DEFAULT_PAYMENT_DEADLINE_MINUTES = 30;
const MIN_PAYMENT_DEADLINE_MINUTES = 1;
const MAX_PAYMENT_DEADLINE_MINUTES = 7 * 24 * 60;
const DEFAULT_SEAT_HOLD_DEADLINE_MINUTES = 3;
const MAX_SEAT_HOLD_DEADLINE_MINUTES = 24 * 60;

@Injectable()
export class EventsService {
    constructor(
        @InjectModel(Event.name) private eventModel: Model<EventDocument>,
        @InjectModel(Booking.name) private bookingModel: Model<BookingDocument>,
        private mailService: MailService,
    ) { }

    async create(createDto: any, userId: string, role: string): Promise<EventDocument> {
        if (role !== UserRole.ORGANIZER) {
            throw new ForbiddenException('Only organizers can create events');
        }

        const {
            title,
            description,
            date,
            startTime,
            endTime,
            cancellationDeadline,
            location,
            category,
            ticketPrice,
            totalTickets,
            image,
            theater,
            hasTheaterSeating,
            requiresOrganizerApproval,
            paymentDeadlineMinutes,
            seatHoldDeadlineMinutes,
            seatPricing,
            seatConfig,
            preBookedSeats,
        } = createDto;

        const isTheater = hasTheaterSeating === 'true' || hasTheaterSeating === true;
        const normalizedRequiresApproval = this.normalizeBoolean(requiresOrganizerApproval, true);
        const normalizedPaymentDeadline = this.normalizePaymentDeadlineMinutes(paymentDeadlineMinutes);
        const normalizedSeatHoldDeadline = this.normalizeSeatHoldDeadlineMinutes(seatHoldDeadlineMinutes);
        const normalizedSeatPricing = this.normalizeSeatPricing(seatPricing);
        const normalizedSeatConfig = this.normalizeSeatConfig(seatConfig);

        // Convert preBookedSeats to bookedSeats format (no bookingId = organizer-reserved)
        const bookedSeats = [];
        if (isTheater && preBookedSeats && Array.isArray(preBookedSeats)) {
            for (const s of preBookedSeats) {
                bookedSeats.push({
                    row: s.row,
                    seatNumber: s.seatNumber,
                    section: s.section || 'main',
                });
            }
        }

        const event = new this.eventModel({
            organizerId: userId,
            title,
            description,
            date,
            startTime,
            endTime,
            cancellationDeadline,
            location,
            category,
            ticketPrice,
            totalTickets,
            remainingTickets: totalTickets,
            image: image || 'default-image.jpg',
            theater: isTheater ? theater : null,
            hasTheaterSeating: isTheater,
            requiresOrganizerApproval: normalizedRequiresApproval,
            paymentDeadlineMinutes: normalizedPaymentDeadline,
            seatHoldDeadlineMinutes: normalizedSeatHoldDeadline,
            seatPricing: normalizedSeatPricing,
            seatConfig: normalizedSeatConfig,
            bookedSeats,
        });

        return this.saveEvent(event);
    }

    async findAllApproved(): Promise<EventDocument[]> {
        return this.eventModel.find({ status: 'approved' }).exec();
    }

    async findAll(): Promise<EventDocument[]> {
        return this.eventModel.find().exec();
    }

    async findOne(id: string): Promise<EventDocument> {
        const event = await this.eventModel.findById(id).populate('organizerId', 'name instapayNumber instapayQR instapayLink').exec();
        if (!event) {
            throw new NotFoundException('Event not found');
        }
        return event;
    }

    async update(id: string, updateDto: any, user?: any): Promise<EventDocument> {
        const event = await this.eventModel.findById(id).exec();
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        // Only the event organizer or an admin can update the event
        if (user) {
            const isAdmin = user.role === 'System Admin';
            const isOwner = event.organizerId.toString() === user._id.toString();
            if (!isAdmin && !isOwner) {
                throw new ForbiddenException('You are not authorised to update this event');
            }
        }

        // Prevent revoking an approved event if it has bookings
        if (
            event.status === 'approved' &&
            updateDto.status &&
            updateDto.status !== 'approved'
        ) {
            const bookingCount = await this.bookingModel.countDocuments({ eventId: event._id } as any);
            if (bookingCount > 0) {
                throw new BadRequestException(
                    `Cannot revoke event with ${bookingCount} existing booking(s). Please cancel all bookings first.`
                );
            }
        }

        if (updateDto.venue !== undefined && updateDto.location === undefined) {
            updateDto.location = updateDto.venue;
            delete updateDto.venue;
        }

        if (updateDto.imageUrl !== undefined) {
            updateDto.image = updateDto.imageUrl;
            delete updateDto.imageUrl;
        }

        if (updateDto.status !== undefined) {
            updateDto.status = String(updateDto.status).toLowerCase();
            if (!EVENT_STATUSES.includes(updateDto.status)) {
                throw new BadRequestException('Invalid event status');
            }
        }

        if (updateDto.hasTheaterSeating !== undefined) {
            updateDto.hasTheaterSeating =
                updateDto.hasTheaterSeating === 'true' ||
                updateDto.hasTheaterSeating === true;
        }

        if (updateDto.requiresOrganizerApproval !== undefined) {
            updateDto.requiresOrganizerApproval = this.normalizeBoolean(
                updateDto.requiresOrganizerApproval,
                true,
            );
        }

        if (updateDto.paymentDeadlineMinutes !== undefined) {
            updateDto.paymentDeadlineMinutes = this.normalizePaymentDeadlineMinutes(
                updateDto.paymentDeadlineMinutes,
            );
        }

        if (updateDto.seatHoldDeadlineMinutes !== undefined) {
            updateDto.seatHoldDeadlineMinutes = this.normalizeSeatHoldDeadlineMinutes(
                updateDto.seatHoldDeadlineMinutes,
            );
        }

        if (updateDto.ticketPrice !== undefined) {
            updateDto.ticketPrice = Number(updateDto.ticketPrice) || 0;
        }

        if (updateDto.totalTickets !== undefined) {
            updateDto.totalTickets = Number(updateDto.totalTickets) || 0;
        }

        if (updateDto.seatPricing !== undefined) {
            updateDto.seatPricing = this.normalizeSeatPricing(updateDto.seatPricing);
        }

        if (updateDto.seatConfig !== undefined) {
            updateDto.seatConfig = this.normalizeSeatConfig(updateDto.seatConfig);
        }

        // Handle preBookedSeats: replace organizer-reserved seats (those without bookingId)
        if (updateDto.preBookedSeats && Array.isArray(updateDto.preBookedSeats)) {
            // Keep booking-linked seats, replace organizer-reserved ones
            const bookingLinkedSeats = (event.bookedSeats || []).filter(
                (s: any) => s.bookingId,
            );
            const newOrganizerSeats = updateDto.preBookedSeats.map((s: any) => ({
                row: s.row,
                seatNumber: s.seatNumber,
                section: s.section || 'main',
            }));
            event.bookedSeats = [...bookingLinkedSeats, ...newOrganizerSeats];
            event.markModified('bookedSeats');
            delete updateDto.preBookedSeats;
        }

        Object.assign(event, updateDto);
        return this.saveEvent(event);
    }

    private parseArrayField(value: any, fieldName: string): any[] {
        if (value === undefined || value === null || value === '') {
            return [];
        }

        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                if (!Array.isArray(parsed)) {
                    throw new Error();
                }
                return parsed;
            } catch {
                throw new BadRequestException(`Invalid ${fieldName}`);
            }
        }

        if (!Array.isArray(value)) {
            throw new BadRequestException(`Invalid ${fieldName}`);
        }

        return value;
    }

    private normalizeSeatPricing(value: any): any[] {
        return this.parseArrayField(value, 'seatPricing')
            .filter((item: any) => PRICED_SEAT_TYPES.includes(String(item?.seatType || '').toLowerCase()))
            .map((item: any) => ({
                seatType: String(item.seatType).toLowerCase(),
                price: Number(item.price) || 0,
            }));
    }

    private normalizeSeatConfig(value: any): any[] {
        return this.parseArrayField(value, 'seatConfig').map((item: any) => ({
            row: item.row,
            seatNumber: Number(item.seatNumber),
            section: item.section || 'main',
            seatType: String(item.seatType || 'standard').toLowerCase(),
            seatLabel: item.seatLabel || '',
        }));
    }

    private normalizeBoolean(value: any, defaultValue: boolean): boolean {
        if (value === undefined || value === null || value === '') {
            return defaultValue;
        }
        if (typeof value === 'boolean') {
            return value;
        }
        const normalized = String(value).trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'off'].includes(normalized)) {
            return false;
        }
        return defaultValue;
    }

    private normalizePaymentDeadlineMinutes(value: any): number {
        const minutes = Number(value);
        if (!Number.isFinite(minutes)) {
            return DEFAULT_PAYMENT_DEADLINE_MINUTES;
        }
        return Math.min(
            MAX_PAYMENT_DEADLINE_MINUTES,
            Math.max(MIN_PAYMENT_DEADLINE_MINUTES, Math.floor(minutes)),
        );
    }

    private normalizeSeatHoldDeadlineMinutes(value: any): number {
        const minutes = Number(value);
        if (!Number.isFinite(minutes)) {
            return DEFAULT_SEAT_HOLD_DEADLINE_MINUTES;
        }
        return Math.min(
            MAX_SEAT_HOLD_DEADLINE_MINUTES,
            Math.max(MIN_PAYMENT_DEADLINE_MINUTES, Math.floor(minutes)),
        );
    }

    private async saveEvent(event: EventDocument): Promise<EventDocument> {
        try {
            return await event.save();
        } catch (err: any) {
            if (err?.name === 'ValidationError' || err?.name === 'CastError') {
                throw new BadRequestException(err.message);
            }
            throw err;
        }
    }

    async requestDeletionOTP(id: string, user: any): Promise<void> {
        const event = await this.eventModel.findById(id).exec();
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        // Only admin can delete approved events
        if (user.role !== 'System Admin') {
            throw new ForbiddenException('Only admins can delete approved events');
        }

        if (event.status !== 'approved') {
            throw new BadRequestException(
                'OTP verification is only required for approved events',
            );
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        event.otp = otp;
        event.otpExpires = otpExpires;
        await event.save();

        await this.mailService.sendVerificationOTP(user.email, otp);
    }

    async verifyDeletionOTP(id: string, otp: string): Promise<void> {
        const event = await this.eventModel.findById(id).exec();
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        if (
            !event.otp ||
            event.otp !== otp ||
            !event.otpExpires ||
            event.otpExpires < new Date()
        ) {
            throw new BadRequestException('Invalid or expired OTP');
        }

        // Check for existing bookings before deletion
        const bookingCount = await this.bookingModel.countDocuments({ eventId: event._id } as any);
        if (bookingCount > 0) {
            throw new BadRequestException(
                `Cannot delete event with ${bookingCount} existing booking(s). Please cancel all bookings first.`
            );
        }

        await this.bookingModel.deleteMany({ eventId: event._id } as any).exec();
        await this.eventModel.deleteOne({ _id: event._id }).exec();
    }

    async delete(id: string, user?: any): Promise<void> {
        const event = await this.eventModel.findById(id).exec();
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        // Only the event organizer or an admin can delete the event
        if (user) {
            const isAdmin = user.role === 'System Admin';
            const isOwner = event.organizerId.toString() === user._id.toString();
            if (!isAdmin && !isOwner) {
                throw new ForbiddenException('You are not authorised to delete this event');
            }
        }

        if (event.status === 'approved') {
            throw new BadRequestException(
                'Approved events require OTP verification. Please use the OTP verification endpoint.',
            );
        }

        // Check for existing bookings before deletion
        const bookingCount = await this.bookingModel.countDocuments({ eventId: event._id } as any);
        if (bookingCount > 0) {
            throw new BadRequestException(
                `Cannot delete event with ${bookingCount} existing booking(s). Please cancel all bookings first.`
            );
        }

        await this.bookingModel.deleteMany({ eventId: event._id } as any).exec();
        await this.eventModel.deleteOne({ _id: event._id }).exec();
    }

    async findByOrganizer(organizerId: string): Promise<EventDocument[]> {
        return this.eventModel.find({ organizerId } as any).exec();
    }

    async getOrganizerAnalytics(organizerId: string): Promise<any> {
        const events = await this.eventModel.find({ organizerId } as any).exec();

        if (events.length === 0) {
            return {
                totalEvents: 0,
                totalRevenue: 0,
                averageSoldPercentage: '0.00',
                events: [],
            };
        }

        const analytics = events.map((event) => {
            const ticketsSold = event.totalTickets - event.remainingTickets;
            const percentageSold =
                event.totalTickets > 0
                    ? (ticketsSold / event.totalTickets) * 100
                    : 0;

            // For theater-seated events, revenue is the sum of prices from booked seats.
            // For non-seated events, use ticketPrice * ticketsSold.
            let revenue: number;
            if (event.hasTheaterSeating && event.bookedSeats && event.seatPricing?.length > 0) {
                // We can't access selectedSeats here easily, so approximate using
                // the average seat price across all pricing tiers.
                const avgPrice =
                    event.seatPricing.reduce((s: number, p: any) => s + (p.price || 0), 0) /
                    (event.seatPricing.length || 1);
                revenue = ticketsSold * avgPrice;
            } else {
                revenue = ticketsSold * event.ticketPrice;
            }

            return {
                eventId: event._id,
                eventTitle: event.title,
                totalTickets: event.totalTickets,
                ticketsSold: ticketsSold,
                ticketsAvailable: event.remainingTickets,
                percentageSold: percentageSold.toFixed(2),
                revenue,
            };
        });

        const totalRevenue = analytics.reduce((sum, item) => sum + item.revenue, 0);
        const averageSoldPercentage =
            analytics.reduce((sum, item) => sum + parseFloat(item.percentageSold), 0) /
            analytics.length;

        return {
            totalEvents: analytics.length,
            totalRevenue: totalRevenue,
            averageSoldPercentage: averageSoldPercentage.toFixed(2),
            events: analytics.sort((a, b) => parseFloat(b.percentageSold) - parseFloat(a.percentageSold)),
        };
    }
}

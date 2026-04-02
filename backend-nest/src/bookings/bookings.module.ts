import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { SeatHold, SeatHoldSchema } from './schemas/seat-hold.schema';
import { Event, EventSchema } from '../events/schemas/event.schema';
import { Theater, TheaterSchema } from '../theaters/schemas/theater.schema';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: SeatHold.name, schema: SeatHoldSchema },
      { name: Event.name, schema: EventSchema },
      { name: Theater.name, schema: TheaterSchema },
    ]),
    TicketsModule,
  ],
  providers: [BookingsService],
  controllers: [BookingsController],
  exports: [BookingsService],
})
export class BookingsModule { }

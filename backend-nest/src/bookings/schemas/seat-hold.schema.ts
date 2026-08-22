import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Event } from '../../events/schemas/event.schema';

export type SeatHoldDocument = SeatHold & Document;

@Schema()
class HeldSeat {
    @Prop({ required: true })
    row: string;

    @Prop({ required: true })
    seatNumber: number;

    @Prop({ enum: ['main', 'balcony'], default: 'main' })
    section: string;
}

@Schema({ timestamps: true })
export class SeatHold {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    userId: User | MongooseSchema.Types.ObjectId;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Event', required: true })
    eventId: Event | MongooseSchema.Types.ObjectId;

    @Prop({ type: [HeldSeat], required: true })
    seats: HeldSeat[];

    @Prop({ type: Date, required: true })
    expiresAt: Date;
}

export const SeatHoldSchema = SchemaFactory.createForClass(SeatHold);

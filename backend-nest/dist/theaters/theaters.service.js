"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TheatersService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const theater_schema_1 = require("./schemas/theater.schema");
let TheatersService = class TheatersService {
    theaterModel;
    eventModel;
    constructor(theaterModel, eventModel) {
        this.theaterModel = theaterModel;
        this.eventModel = eventModel;
    }
    async getTheaterForEvent(theaterId, eventId) {
        const theater = await this.theaterModel.findById(theaterId).exec();
        if (!theater) {
            throw new common_1.NotFoundException('Theater not found');
        }
        const event = await this.eventModel
            .findById(eventId)
            .select('bookedSeats seatPricing hasTheaterSeating')
            .exec();
        if (!event) {
            throw new common_1.NotFoundException('Event not found');
        }
        const bookedSeatsMap = new Map();
        event.bookedSeats.forEach((seat) => {
            const key = `${seat.section}-${seat.row}-${seat.seatNumber}`;
            bookedSeatsMap.set(key, seat.bookingId);
        });
        return {
            theater,
            bookedSeats: event.bookedSeats,
            seatPricing: event.seatPricing,
            bookedSeatsMap: Object.fromEntries(bookedSeatsMap),
        };
    }
    async create(createTheaterDto, userId) {
        const { name, description, layout, seatConfig, image } = createTheaterDto;
        if (!name || !layout?.mainFloor?.rows || !layout?.mainFloor?.seatsPerRow) {
            throw new common_1.BadRequestException('Name, rows, and seatsPerRow are required');
        }
        try {
            const mainFloor = layout.mainFloor || { rows: 0, seatsPerRow: 0, aislePositions: [], rowLabels: [] };
            const balcony = layout.balcony || { rows: 0, seatsPerRow: 0, aislePositions: [], rowLabels: [] };
            const theater = new this.theaterModel({
                name,
                description,
                createdBy: userId,
                layout: {
                    stage: layout.stage || { position: 'top', width: 80, height: 15 },
                    mainFloor: {
                        rows: mainFloor.rows,
                        seatsPerRow: mainFloor.seatsPerRow,
                        aislePositions: mainFloor.aislePositions || [],
                        rowLabels: mainFloor.rowLabels ||
                            this.generateRowLabels(mainFloor.rows, ''),
                    },
                    hasBalcony: layout.hasBalcony || false,
                    balcony: layout.hasBalcony
                        ? {
                            rows: balcony.rows || 0,
                            seatsPerRow: balcony.seatsPerRow || 0,
                            aislePositions: balcony.aislePositions || [],
                            rowLabels: balcony.rowLabels ||
                                this.generateRowLabels(balcony.rows || 0, 'BALC-'),
                        }
                        : { rows: 0, seatsPerRow: 0, aislePositions: [], rowLabels: [] },
                    removedSeats: layout.removedSeats || [],
                    disabledSeats: layout.disabledSeats || [],
                    hCorridors: layout.hCorridors || {},
                    vCorridors: layout.vCorridors || {},
                    seatCategories: layout.seatCategories || {},
                    labels: layout.labels || [],
                },
                seatConfig: seatConfig || [],
                image,
            });
            return await theater.save();
        }
        catch (error) {
            if (error.name === 'ValidationError') {
                throw new common_1.BadRequestException(Object.values(error.errors).map((e) => e.message).join('; '));
            }
            throw error;
        }
    }
    async findAll(activeOnly = false) {
        const filter = {};
        if (activeOnly) {
            filter.isActive = true;
        }
        return this.theaterModel
            .find(filter)
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .exec();
    }
    async findOne(id) {
        const theater = await this.theaterModel
            .findById(id)
            .populate('createdBy', 'name email')
            .exec();
        if (!theater) {
            throw new common_1.NotFoundException('Theater not found');
        }
        return theater;
    }
    async update(id, updateDto) {
        const theater = await this.theaterModel.findById(id).exec();
        if (!theater) {
            throw new common_1.NotFoundException('Theater not found');
        }
        const { name, description, layout, seatConfig, isActive, image } = updateDto;
        if (name)
            theater.name = name;
        if (description !== undefined)
            theater.description = description;
        if (isActive !== undefined)
            theater.isActive = isActive;
        if (image !== undefined)
            theater.image = image;
        if (layout) {
            if (layout.stage) {
                theater.layout.stage = { ...theater.layout.stage, ...layout.stage };
            }
            if (layout.mainFloor) {
                theater.layout.mainFloor = {
                    ...theater.layout.mainFloor,
                    ...layout.mainFloor,
                    rowLabels: layout.mainFloor.rowLabels ||
                        this.generateRowLabels(layout.mainFloor.rows || theater.layout.mainFloor.rows, ''),
                };
            }
            if (layout.hasBalcony !== undefined) {
                theater.layout.hasBalcony = layout.hasBalcony;
            }
            if (layout.balcony) {
                theater.layout.balcony = {
                    ...theater.layout.balcony,
                    ...layout.balcony,
                    rowLabels: layout.balcony.rowLabels ||
                        this.generateRowLabels(layout.balcony.rows || theater.layout.balcony.rows, 'BALC-'),
                };
            }
            if (layout.removedSeats !== undefined)
                theater.layout.removedSeats = layout.removedSeats;
            if (layout.disabledSeats !== undefined)
                theater.layout.disabledSeats = layout.disabledSeats;
            if (layout.hCorridors !== undefined)
                theater.layout.hCorridors = layout.hCorridors;
            if (layout.vCorridors !== undefined)
                theater.layout.vCorridors = layout.vCorridors;
            if (layout.seatCategories !== undefined)
                theater.layout.seatCategories = layout.seatCategories;
            if (layout.labels !== undefined)
                theater.layout.labels = layout.labels;
            theater.markModified('layout.hCorridors');
            theater.markModified('layout.vCorridors');
            theater.markModified('layout.seatCategories');
            theater.markModified('layout.labels');
        }
        if (seatConfig) {
            theater.seatConfig = seatConfig;
        }
        try {
            const updatedTheater = await theater.save();
            return updatedTheater;
        }
        catch (error) {
            if (error.name === 'ValidationError') {
                throw new common_1.BadRequestException(Object.values(error.errors).map((e) => e.message).join('; '));
            }
            throw error;
        }
    }
    async hardDelete(id) {
        const theater = await this.theaterModel.findById(id).exec();
        if (!theater) {
            throw new common_1.NotFoundException('Theater not found');
        }
        const eventsUsingTheater = await this.eventModel.countDocuments({ theater: id }).exec();
        if (eventsUsingTheater > 0) {
            throw new common_1.BadRequestException(`Cannot delete theater. ${eventsUsingTheater} event(s) are using this theater. Please remove or reassign those events first.`);
        }
        await this.theaterModel.findByIdAndDelete(id).exec();
    }
    async updateSeatConfig(id, seatConfig) {
        const theater = await this.theaterModel.findById(id).exec();
        if (!theater) {
            throw new common_1.NotFoundException('Theater not found');
        }
        seatConfig.forEach((newSeat) => {
            const existingIndex = theater.seatConfig.findIndex((s) => s.row === newSeat.row &&
                s.seatNumber === newSeat.seatNumber &&
                s.section === newSeat.section);
            if (existingIndex >= 0) {
                theater.seatConfig[existingIndex] = {
                    ...theater.seatConfig[existingIndex],
                    ...newSeat,
                };
            }
            else {
                theater.seatConfig.push(newSeat);
            }
        });
        return theater.save();
    }
    generateRowLabels(count, prefix = '') {
        const labels = [];
        for (let i = 0; i < count; i++) {
            if (i < 26) {
                labels.push(prefix + String.fromCharCode(65 + i));
            }
            else {
                labels.push(prefix + 'R' + (i + 1));
            }
        }
        return labels;
    }
};
exports.TheatersService = TheatersService;
exports.TheatersService = TheatersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(theater_schema_1.Theater.name)),
    __param(1, (0, mongoose_1.InjectModel)('Event')),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], TheatersService);
//# sourceMappingURL=theaters.service.js.map
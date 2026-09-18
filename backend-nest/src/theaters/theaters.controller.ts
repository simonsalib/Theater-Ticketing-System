import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Req,
} from '@nestjs/common';
import { TheatersService } from './theaters.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('api/v1/theater')
export class TheatersController {
    constructor(private readonly theatersService: TheatersService) { }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
    async create(@Body() createTheaterDto: any, @Req() req: any) {
        const data = await this.theatersService.create(createTheaterDto, req.user._id);
        return { success: true, data };
    }

    @Get()
    async findAll(@Query('active') active: string) {
        const data = await this.theatersService.findAll(active === 'true');
        return { success: true, count: data.length, data };
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const data = await this.theatersService.findOne(id);
        return { success: true, data };
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
    async update(@Param('id') id: string, @Body() updateTheaterDto: any, @Req() req: any) {
        const data = await this.theatersService.update(id, updateTheaterDto, req.user);
        return { success: true, data };
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
    async remove(@Param('id') id: string, @Req() req: any) {
        await this.theatersService.hardDelete(id, req.user);
        return { success: true, message: 'Theater deleted successfully' };
    }

    @Put(':id/seat-config')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
    async updateSeatConfig(
        @Param('id') id: string,
        @Body('seatConfig') seatConfig: any[],
        @Req() req: any,
    ) {
        const data = await this.theatersService.updateSeatConfig(id, seatConfig, req.user);
        return { success: true, data };
    }

    @Get('event-layout/:theaterId/:eventId')
    async getTheaterForEvent(
        @Param('theaterId') theaterId: string,
        @Param('eventId') eventId: string,
    ) {
        const data = await this.theatersService.getTheaterForEvent(theaterId, eventId);
        return { success: true, data };
    }
}

import { Controller, Post, Body, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

const getCookieOptions = () => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' as const : 'lax' as const,
    expires: new Date(Date.now() + 30 * 60 * 1000), // 30 mins
});

@Controller('api/v1/auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('register')
    async register(@Body() registerDto: any) {
        const data = await this.authService.register(registerDto);
        return { success: true, data };
    }

    @Post('verify-registration')
    @HttpCode(HttpStatus.OK)
    async verifyRegistration(@Body('email') email: string, @Body('otp') otp: string) {
        const data = await this.authService.verifyRegistration(email, otp);
        return { success: true, data };
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() loginDto: any, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.login(loginDto);

        // Set cookie
        res.cookie('token', result.token, getCookieOptions());

        return { success: true, data: result };
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Res({ passthrough: true }) res: Response) {
        const opts = getCookieOptions();
        res.clearCookie('token', {
            httpOnly: opts.httpOnly,
            secure: opts.secure,
            sameSite: opts.sameSite,
        });
        return { success: true, message: 'Logged out successfully' };
    }

    @Post('forget-password')
    @HttpCode(HttpStatus.OK)
    async forgetPassword(@Body('email') email: string) {
        const data = await this.authService.forgetPassword(email);
        return { success: true, data };
    }

    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    async resetPassword(@Body() resetDto: any) {
        const data = await this.authService.resetPassword(resetDto);
        return { success: true, data };
    }

    // Route alias for frontend
    @Post('verify-otp')
    @HttpCode(HttpStatus.OK)
    async verifyOtp(@Body() resetDto: any) {
        const data = await this.authService.resetPassword(resetDto);
        return { success: true, data };
    }

    // Step 1: Admin-created user submits their new password
    @Post('submit-password')
    @HttpCode(HttpStatus.OK)
    async submitNewPassword(@Body() submitDto: any) {
        const result = await this.authService.submitNewPassword(submitDto);
        return { success: true, data: result };
    }

    // Step 2: Verify OTP and activate account
    @Post('verify-activate')
    @HttpCode(HttpStatus.OK)
    async verifyAndActivate(@Body() verifyDto: any, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.verifyAndActivate(verifyDto);

        // Set cookie for auto-login
        res.cookie('token', result.token, getCookieOptions());

        return { success: true, data: result };
    }
}

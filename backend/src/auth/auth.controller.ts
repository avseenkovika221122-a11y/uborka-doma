import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

class RegisterDto { @IsEmail() @MaxLength(254) email: string; @IsString() @MinLength(10) @MaxLength(128) password: string; @IsString() @MinLength(1) @MaxLength(80) @Matches(/\S/) displayName: string; }
class LoginDto { @IsEmail() @MaxLength(254) email: string; @IsString() @MaxLength(128) password: string; }
class TokenDto { @IsString() @MinLength(32) @MaxLength(128) token: string; }
class ResetDto { @IsString() token: string; @IsString() @MinLength(10) @MaxLength(128) password: string; }
class EmailDto { @IsEmail() @MaxLength(254) email: string; }
class ChangePasswordDto { @IsString() @MaxLength(128) currentPassword: string; @IsString() @MinLength(10) @MaxLength(128) newPassword: string; }
@Controller('auth') @UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private auth: AuthService) {}
  @Get('me') @UseGuards(AuthGuard) me(@Req() req: Request) { return (req as any).user; }
  @Post('register') @Throttle({ default: { limit: 5, ttl: 60000 } }) register(@Body() dto: RegisterDto) { return this.auth.register(dto.email, dto.password, dto.displayName); }
  @Post('verify-email') @Throttle({ default: { limit: 10, ttl: 60000 } }) verify(@Body() dto: TokenDto) { return this.auth.verifyEmail(dto.token); }
  @Post('login') @Throttle({ default: { limit: 5, ttl: 60000 } }) async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password);
    res.cookie('session', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 86400000, path: '/' });
    return { user: result.user };
  }
  @Post('logout') @UseGuards(AuthGuard) async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.session || req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    await this.auth.logout(token, (req as any).user.id); res.clearCookie('session', { path: '/' }); return { message: 'Вы вышли из аккаунта' };
  }
  @Post('password/change') @UseGuards(AuthGuard) async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) { const result = await this.auth.changePassword((req as any).user.id, dto.currentPassword, dto.newPassword); res.clearCookie('session', { path: '/' }); return result; }
  @Post('password-reset/request') @Throttle({ default: { limit: 3, ttl: 60000 } }) requestReset(@Body() dto: EmailDto) { return this.auth.requestPasswordReset(dto.email); }
  @Post('password-reset/confirm') @Throttle({ default: { limit: 5, ttl: 60000 } }) reset(@Body() dto: ResetDto) { return this.auth.resetPassword(dto.token, dto.password); }
}

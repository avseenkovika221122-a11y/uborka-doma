import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

class CredentialsDto {
  @IsString() @MinLength(2) @MaxLength(40) @Matches(/\S/) displayName: string;
  @IsString() @MinLength(6) @MaxLength(12) @Matches(/^\d{6,12}$/) pin: string;
}
class ChangePinDto {
  @IsString() @MinLength(6) @MaxLength(12) @Matches(/^\d{6,12}$/) currentPassword: string;
  @IsString() @MinLength(6) @MaxLength(12) @Matches(/^\d{6,12}$/) newPassword: string;
}
@Controller('auth') @UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private auth: AuthService) {}
  @Get('me') @UseGuards(AuthGuard) me(@Req() req: Request) { return (req as any).user; }
  @Post('register') @Throttle({ default: { limit: 5, ttl: 60000 } }) register(@Body() dto: CredentialsDto) { return this.auth.register(dto.displayName, dto.pin); }
  @Post('login') @Throttle({ default: { limit: 5, ttl: 60000 } }) login(@Body() dto: CredentialsDto) { return this.auth.login(dto.displayName, dto.pin); }
  @Post('logout') @UseGuards(AuthGuard) async logout(@Req() req: Request) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    return this.auth.logout(token, (req as any).user.id);
  }
  @Post('password/change') @UseGuards(AuthGuard) async changePassword(@Req() req: Request, @Body() dto: ChangePinDto) {
    return this.auth.changePassword((req as any).user.id, dto.currentPassword, dto.newPassword);
  }
}

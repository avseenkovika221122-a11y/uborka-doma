import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Требуется вход');
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET! });
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const session = await this.prisma.session.findUnique({ where: { tokenHash } });
      if (!session || session.userId !== payload.sub || session.expiresAt <= new Date()) throw new UnauthorizedException('Сессия завершена');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, displayName: true } });
      if (!user) throw new UnauthorizedException('Пользователь не найден');
      req.user = user;
      return true;
    } catch { throw new UnauthorizedException('Сессия недействительна или истекла'); }
  }
}

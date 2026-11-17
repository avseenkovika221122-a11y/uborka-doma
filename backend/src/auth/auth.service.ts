import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { EventsGateway } from '../events.gateway';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const pinDigest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ');

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private events: EventsGateway) {}

  private validatePin(pin: string) {
    if (!/^\d{6,12}$/.test(pin)) throw new BadRequestException('PIN должен содержать от 6 до 12 цифр');
  }

  private async createSession(user: { id: string; email: string; displayName: string }) {
    const token = await this.jwt.signAsync({ sub: user.id }, { secret: process.env.JWT_SECRET!, expiresIn: '7d' });
    await this.prisma.session.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 7 * 86400000) } });
    return { token, user: { id: user.id, email: user.email, displayName: user.displayName } };
  }

  async register(displayNameRaw: string, pin: string) {
    this.validatePin(pin);
    const displayName = normalizeName(displayNameRaw);
    if (displayName.length < 2 || displayName.length > 40) throw new BadRequestException('Имя должно содержать от 2 до 40 символов');
    const existing = await this.prisma.user.findFirst({ where: { displayName: { equals: displayName, mode: 'insensitive' } } });
    if (existing) throw new ConflictException('Это имя уже занято. Добавь фамилию или отличительный знак.');
    // The legacy email column remains internal for database compatibility; no email is collected or sent.
    const internalEmail = `local-${randomBytes(16).toString('hex')}@users.uborka.local`;
    const user = await this.prisma.user.create({ data: {
      email: internalEmail,
      passwordHash: await bcrypt.hash(pinDigest(pin), 12),
      displayName,
      emailVerifiedAt: new Date(),
    } });
    return this.createSession(user);
  }

  async login(displayNameRaw: string, pin: string) {
    this.validatePin(pin);
    const displayName = normalizeName(displayNameRaw);
    const user = await this.prisma.user.findFirst({ where: { displayName: { equals: displayName, mode: 'insensitive' } } });
    if (!user || !(await bcrypt.compare(pinDigest(pin), user.passwordHash))) throw new UnauthorizedException('Неверное имя или PIN-код');
    return this.createSession(user);
  }

  async logout(token: string, userId: string) {
    await this.prisma.session.deleteMany({ where: { tokenHash: hash(token) } });
    await this.events.disconnectUser(userId);
    return { message: 'Вы вышли из аккаунта' };
  }

  async changePassword(userId: string, currentPin: string, newPin: string) {
    this.validatePin(newPin);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(pinDigest(currentPin), user.passwordHash))) throw new UnauthorizedException('Текущий PIN-код указан неверно');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(pinDigest(newPin), 12) } }),
      this.prisma.session.deleteMany({ where: { userId } }),
    ]);
    await this.events.disconnectUser(userId);
    return { message: 'PIN-код изменён. Войдите снова.' };
  }
}

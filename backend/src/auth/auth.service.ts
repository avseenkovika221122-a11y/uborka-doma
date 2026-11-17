import { BadRequestException, ConflictException, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma.service';
import { EventsGateway } from '../events.gateway';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const passwordDigest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private events: EventsGateway) {}

  private async sendMail(to: string, subject: string, text: string) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Почтовый сервер не настроен. Обратитесь к администратору.');
      return false;
    }
    const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
    return true;
  }

  async register(emailRaw: string, password: string, displayName: string) {
    const email = emailRaw.trim().toLowerCase();
    if (password.length < 10 || password.length > 128) throw new BadRequestException('Пароль должен содержать от 10 до 128 символов');
    if (!displayName.trim()) throw new BadRequestException('Укажи имя для отображения');
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Этот email уже зарегистрирован');
    const verificationToken = randomBytes(32).toString('hex');
    const user = await this.prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(passwordDigest(password), 12), displayName: displayName.trim(), verificationToken: hash(verificationToken), verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    let sent = false;
    try { sent = await this.sendMail(email, 'Подтверждение регистрации — Уборка дома', `Для подтверждения электронной почты откройте ссылку: ${process.env.APP_URL || 'http://localhost:3000'}/#verify=${verificationToken}\nИли введите токен: ${verificationToken}`); } catch (error) { await this.prisma.user.delete({ where: { id: user.id } }); throw error; }
    return { message: 'Аккаунт создан. Подтверди электронную почту.', ...(!sent ? { developmentVerificationToken: verificationToken } : {}), userId: user.id };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({ where: { verificationToken: hash(token), verificationTokenExpires: { gt: new Date() } } });
    if (!user) throw new BadRequestException('Ссылка подтверждения недействительна');
    await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), verificationToken: null, verificationTokenExpires: null } });
    return { message: 'Электронная почта подтверждена' };
  }

  async login(emailRaw: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
    if (!user || !(await bcrypt.compare(passwordDigest(password), user.passwordHash))) throw new UnauthorizedException('Неверный email или пароль');
    if (!user.emailVerifiedAt) throw new UnauthorizedException('Сначала подтверди электронную почту');
    const token = await this.jwt.signAsync({ sub: user.id }, { secret: process.env.JWT_SECRET!, expiresIn: '7d' });
    await this.prisma.session.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 7 * 86400000) } });
    return { token, user: { id: user.id, email: user.email, displayName: user.displayName } };
  }

  async logout(token: string, userId: string) { await this.prisma.session.deleteMany({ where: { tokenHash: hash(token) } }); await this.events.disconnectUser(userId); return { message: 'Вы вышли из аккаунта' }; }

  async requestPasswordReset(emailRaw: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
    if (!user) return { message: 'Если аккаунт существует, инструкция будет отправлена на почту' };
    const resetToken = randomBytes(32).toString('hex');
    await this.prisma.user.update({ where: { id: user.id }, data: { resetToken: hash(resetToken), resetTokenExpires: new Date(Date.now() + 30 * 60 * 1000) } });
    const sent = await this.sendMail(user.email, 'Восстановление пароля — Уборка дома', `Для смены пароля откройте ссылку: ${process.env.APP_URL || 'http://localhost:3000'}/#reset=${resetToken}\nТокен действует 30 минут.`);
    return { message: 'Если аккаунт существует, инструкция будет отправлена на почту', ...(!sent ? { developmentResetToken: resetToken } : {}) };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (newPassword.length < 10 || newPassword.length > 128) throw new BadRequestException('Новый пароль должен содержать от 10 до 128 символов');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(passwordDigest(currentPassword), user.passwordHash))) throw new UnauthorizedException('Текущий пароль указан неверно');
    await this.prisma.$transaction([this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(passwordDigest(newPassword), 12) } }), this.prisma.session.deleteMany({ where: { userId } })]);
    await this.events.disconnectUser(userId);
    return { message: 'Пароль изменён. Войдите снова.' };
  }

  async resetPassword(token: string, password: string) {
    if (password.length < 10 || password.length > 128) throw new BadRequestException('Пароль должен содержать от 10 до 128 символов');
    const user = await this.prisma.user.findFirst({ where: { resetToken: hash(token), resetTokenExpires: { gt: new Date() } } });
    if (!user) throw new BadRequestException('Ссылка восстановления недействительна или истекла');
    await this.prisma.$transaction([this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(passwordDigest(password), 12), resetToken: null, resetTokenExpires: null } }), this.prisma.session.deleteMany({ where: { userId: user.id } })]);
    await this.events.disconnectUser(user.id);
    return { message: 'Пароль изменён. Войди снова.' };
  }
}

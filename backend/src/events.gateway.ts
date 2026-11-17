import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from './prisma.service';

@WebSocketGateway({ namespace: '/updates', cors: { origin: (origin, callback) => { const allowed = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(value => value.trim()); callback(null, !origin || allowed.includes(origin)); }, credentials: true } })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    try {
      const cookie = client.handshake.headers.cookie || '';
      const cookieToken = cookie.split(';').map(v => v.trim()).find(v => v.startsWith('session='))?.slice('session='.length);
      const token = client.handshake.auth?.token || client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') || cookieToken;
      if (!token) return client.disconnect(true);
      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET! });
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const session = await this.prisma.session.findUnique({ where: { tokenHash } });
      if (!session || session.userId !== payload.sub || session.expiresAt <= new Date()) return client.disconnect(true);
      client.data.userId = payload.sub;
    } catch { client.disconnect(true); }
  }

  @SubscribeMessage('group:join')
  async joinGroup(@ConnectedSocket() client: Socket, @MessageBody() body: { groupId?: string }) {
    const userId = client.data.userId;
    if (!userId || !body?.groupId) return { ok: false };
    const membership = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: body.groupId, userId } } });
    if (!membership) return { ok: false, message: 'Нет доступа к группе' };
    await client.join(`group:${body.groupId}`);
    return { ok: true };
  }

  async revokeMember(groupId: string, userId: string) {
    const clients = await this.server?.in(`group:${groupId}`).fetchSockets();
    for (const client of clients || []) if (client.data.userId === userId) await client.leave(`group:${groupId}`);
  }

  async disconnectUser(userId: string) {
    const clients = await this.server?.fetchSockets();
    for (const client of clients || []) if (client.data.userId === userId) client.disconnect(true);
  }

  async revokeGroup(groupId: string) {
    const clients = await this.server?.in(`group:${groupId}`).fetchSockets();
    for (const client of clients || []) await client.leave(`group:${groupId}`);
  }

  emitGroupUpdate(groupId: string, event: string, payload: unknown) {
    this.server?.to(`group:${groupId}`).emit(event, payload);
  }
}


import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { PrismaService } from '../prisma.service';
import { EventsGateway } from '../events.gateway';

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const generateInviteCode = (groupId: string, version: number) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return createHmac('sha256', secret)
    .update(`${groupId}:${version}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
};

@Injectable()
export class GroupsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
  ) {}

  async list(userId: string) {
    return this.prisma.groupMember.findMany({
      where: { userId },
      select: {
        role: true,
        group: {
          select: {
            id: true,
            name: true,
            members: {
              select: {
                userId: true,
                role: true,
                user: {
                  select: {
                    id: true,
                    displayName: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async create(userId: string, name: string) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.householdGroup.create({
        data: {
          name: name.trim(),
          members: {
            create: {
              userId,
              role: 'OWNER',
            },
          },
        },
        select: {
          id: true,
          name: true,
          members: {
            select: {
              userId: true,
              role: true,
            },
          },
          inviteVersion: true,
        },
      });

      const code = generateInviteCode(
        group.id,
        group.inviteVersion,
      );

      await tx.invitation.create({
        data: {
          groupId: group.id,
          codeHash: digest(code),
          expiresAt: new Date(Date.now() + 365 * 86400000),
          usesLimit: 2147483647,
        },
      });

      const { inviteVersion, ...result } = group;

      return {
        ...result,
        inviteCode: code,
      };
    });
  }

  async join(userId: string, codeRaw: string) {
    const code = codeRaw.trim().toUpperCase();

    const invitation = await this.prisma.invitation.findUnique({
      where: {
        codeHash: digest(code),
      },
      include: {
        group: true,
      },
    });

    if (
      !invitation ||
      invitation.expiresAt <= new Date() ||
      invitation.uses >= invitation.usesLimit
    ) {
      throw new NotFoundException(
        'Код приглашения не найден или срок его действия истёк',
      );
    }

    const existing = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: invitation.groupId,
          userId,
        },
      },
    });

    if (!existing) {
      await this.prisma.$transaction([
        this.prisma.groupMember.create({
          data: {
            groupId: invitation.groupId,
            userId,
          },
        }),
        this.prisma.invitation.update({
          where: {
            id: invitation.id,
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        }),
      ]);

      this.events.emitGroupUpdate(
        invitation.groupId,
        'group:members',
        { groupId: invitation.groupId },
      );
    }

    return {
      id: invitation.group.id,
      name: invitation.group.name,
    };
  }

  async assertMember(groupId: string, userId: string) {
    const member = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('Нет доступа к этой группе');
    }

    return member;
  }

  // Получить действующий код приглашения
  async createInvite(groupId: string, userId: string) {
    const member = await this.assertMember(groupId, userId);

    if (member.role !== 'OWNER') {
      throw new ForbiddenException(
        'Только владелец может создавать приглашения',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.householdGroup.findUnique({
        where: { id: groupId },
        select: { inviteVersion: true },
      });

      if (!group) {
        throw new NotFoundException('Группа не найдена');
      }

      const code = generateInviteCode(
        groupId,
        group.inviteVersion,
      );

      const codeHash = digest(code);

      const existing = await tx.invitation.findUnique({
        where: { codeHash },
      });

      const expiresAt = new Date(
        Date.now() + 365 * 86400000,
      );

      if (existing) {
        await tx.invitation.update({
          where: { id: existing.id },
          data: {
            expiresAt,
            uses: 0,
            usesLimit: 2147483647,
          },
        });
      } else {
        await tx.invitation.updateMany({
          where: {
            groupId,
            expiresAt: { gt: new Date() },
          },
          data: {
            expiresAt: new Date(),
          },
        });

        await tx.invitation.create({
          data: {
            groupId,
            codeHash,
            expiresAt,
            usesLimit: 2147483647,
          },
        });
      }

      return { code };
    });
  }

  // Создать новый код и отключить предыдущий
  async refreshInvite(groupId: string, userId: string) {
    const member = await this.assertMember(groupId, userId);

    if (member.role !== 'OWNER') {
      throw new ForbiddenException(
        'Только владелец может обновлять приглашения',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const group = await tx.householdGroup.update({
        where: { id: groupId },
        data: {
          inviteVersion: {
            increment: 1,
          },
        },
        select: {
          inviteVersion: true,
        },
      });

      await tx.invitation.updateMany({
        where: {
          groupId,
          expiresAt: { gt: now },
        },
        data: {
          expiresAt: now,
        },
      });

      const code = generateInviteCode(
        groupId,
        group.inviteVersion,
      );

      await tx.invitation.create({
        data: {
          groupId,
          codeHash: digest(code),
          expiresAt: new Date(Date.now() + 365 * 86400000),
          usesLimit: 2147483647,
        },
      });

      return { code };
    });
  }

  async leave(groupId: string, userId: string) {
    const member = await this.assertMember(groupId, userId);

    if (member.role === 'OWNER') {
      const successor = await this.prisma.groupMember.findFirst({
        where: {
          groupId,
          userId: { not: userId },
        },
        orderBy: {
          joinedAt: 'asc',
        },
      });

      if (successor) {
        await this.prisma.groupMember.update({
          where: { id: successor.id },
          data: { role: 'OWNER' },
        });
      } else {
        await this.prisma.householdGroup.delete({
          where: { id: groupId },
        });

        await this.events.revokeGroup(groupId);

        return {
          ok: true,
          groupDeleted: true,
        };
      }
    }

    await this.prisma.cleaningTask.updateMany({
      where: {
        groupId,
        assigneeId: userId,
      },
      data: {
        assigneeId: null,
      },
    });

    await this.prisma.groupMember.delete({
      where: { id: member.id },
    });

    await this.events.revokeMember(groupId, userId);

    this.events.emitGroupUpdate(
      groupId,
      'group:members',
      { groupId },
    );

    return { ok: true };
  }

  async rename(groupId: string, userId: string, name: string) {
    const member = await this.assertMember(groupId, userId);

    if (member.role !== 'OWNER') {
      throw new ForbiddenException(
        'Только владелец может менять настройки группы',
      );
    }

    const group = await this.prisma.householdGroup.update({
      where: { id: groupId },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
      },
    });

    this.events.emitGroupUpdate(
      groupId,
      'group:updated',
      group,
    );

    return group;
  }

  async removeMember(
    groupId: string,
    actorId: string,
    targetId: string,
  ) {
    const actor = await this.assertMember(groupId, actorId);

    if (actor.role !== 'OWNER' && actorId !== targetId) {
      throw new ForbiddenException('Недостаточно прав');
    }

    const target = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: targetId,
        },
      },
    });

    if (!target) {
      throw new NotFoundException('Участник не найден');
    }

    if (target.role === 'OWNER') {
      throw new ForbiddenException(
        'Нельзя удалить владельца группы',
      );
    }

    await this.prisma.cleaningTask.updateMany({
      where: {
        groupId,
        assigneeId: targetId,
      },
      data: {
        assigneeId: null,
      },
    });

    await this.prisma.groupMember.delete({
      where: { id: target.id },
    });

    await this.events.revokeMember(groupId, targetId);

    this.events.emitGroupUpdate(
      groupId,
      'group:members',
      { groupId },
    );

    return { ok: true };
  }
}

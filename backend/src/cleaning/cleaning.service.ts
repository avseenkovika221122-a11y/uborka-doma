
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GroupsService } from '../groups/groups.service';
import { EventsGateway } from '../events.gateway';

@Injectable()
export class CleaningService {
  constructor(
    private prisma: PrismaService,
    private groups: GroupsService,
    private events: EventsGateway,
  ) {}

  async list(groupId: string, userId: string, from?: string, to?: string) {
    await this.groups.assertMember(groupId, userId);
    await this.generateRecurringTasks(groupId);

    return this.prisma.cleaningTask.findMany({
      where: {
        groupId,
        ...(from || to
          ? {
              scheduledAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        assignee: { select: { id: true, displayName: true } },
        creator: { select: { id: true, displayName: true } },
        completions: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async create(
    groupId: string,
    userId: string,
    data: {
      title: string;
      description?: string;
      scheduledAt: string;
      assigneeId?: string;
    },
  ) {
    await this.groups.assertMember(groupId, userId);

    if (data.assigneeId) {
      await this.groups.assertMember(groupId, data.assigneeId);
    }

    const task = await this.prisma.cleaningTask.create({
      data: {
        groupId,
        creatorId: userId,
        title: data.title.trim(),
        description: data.description,
        scheduledAt: new Date(data.scheduledAt),
        assigneeId: data.assigneeId,
      },
      include: {
        assignee: { select: { id: true, displayName: true } },
        completions: true,
      },
    });

    this.events.emitGroupUpdate(groupId, 'task:created', task);
    return task;
  }

  async update(
    groupId: string,
    taskId: string,
    userId: string,
    data: {
      title?: string;
      description?: string;
      scheduledAt?: string;
      assigneeId?: string | null;
    },
  ) {
    await this.groups.assertMember(groupId, userId);

    const existing = await this.prisma.cleaningTask.findFirst({
      where: { id: taskId, groupId },
    });

    if (!existing) {
      throw new NotFoundException('Задание не найдено');
    }

    if (data.assigneeId) {
      await this.groups.assertMember(groupId, data.assigneeId);
    }

    const task = await this.prisma.cleaningTask.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.scheduledAt
          ? { scheduledAt: new Date(data.scheduledAt) }
          : {}),
        ...(data.assigneeId !== undefined
          ? { assigneeId: data.assigneeId }
          : {}),
      },
      include: {
        assignee: { select: { id: true, displayName: true } },
        completions: true,
      },
    });

    this.events.emitGroupUpdate(groupId, 'task:updated', task);
    return task;
  }

  async complete(
    groupId: string,
    taskId: string,
    userId: string,
    completed: boolean,
  ) {
    await this.groups.assertMember(groupId, userId);

    const task = await this.prisma.cleaningTask.findFirst({
      where: { id: taskId, groupId },
    });

    if (!task) {
      throw new NotFoundException('Задание не найдено');
    }

    if (task.assigneeId && task.assigneeId !== userId) {
      throw new ForbiddenException(
        'Отметить выполнение может назначенный исполнитель',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (completed) {
        await tx.taskCompletion.upsert({
          where: {
            taskId_userId: { taskId, userId },
          },
          create: { taskId, userId },
          update: { completedAt: new Date() },
        });
      } else {
        await tx.taskCompletion.deleteMany({
          where: { taskId, userId },
        });
      }

      const completions = await tx.taskCompletion.findMany({
        where: { taskId },
      });

      return tx.cleaningTask.update({
        where: { id: taskId },
        data: {
          status: completions.length ? 'COMPLETED' : 'OPEN',
          completedAt: completions.length ? new Date() : null,
        },
        include: { completions: true },
      });
    });

    this.events.emitGroupUpdate(groupId, 'task:updated', updated);
    return updated;
  }

  async remove(groupId: string, taskId: string, userId: string) {
    const member = await this.groups.assertMember(groupId, userId);

    const task = await this.prisma.cleaningTask.findFirst({
      where: { id: taskId, groupId },
    });

    if (!task) {
      throw new NotFoundException('Задание не найдено');
    }

    if (member.role !== 'OWNER' && task.creatorId !== userId) {
      throw new ForbiddenException('Нельзя удалить чужое задание');
    }

    await this.prisma.$transaction(async (tx) => {
      if (task.recurringTaskId && task.occurrenceNumber !== null) {
        await tx.$executeRaw`
          INSERT INTO "DeletedRecurringOccurrence"
            ("recurringTaskId", "occurrenceNumber")
          VALUES (${task.recurringTaskId}, ${task.occurrenceNumber})
          ON CONFLICT DO NOTHING
        `;
      }

      await tx.cleaningTask.delete({ where: { id: taskId } });
    });

    this.events.emitGroupUpdate(groupId, 'task:deleted', {
      id: taskId,
    });

    return { ok: true };
  }

  async createRecurring(
    groupId: string,
    userId: string,
    data: {
      title: string;
      alternateTitle?: string;
      description?: string;
      startDate: string;
      assigneeIds: string[];
    },
  ) {
    await this.groups.assertMember(groupId, userId);

    const title = data.title.trim();
    const alternateTitle = data.alternateTitle?.trim();

    if (!title || !data.assigneeIds.length) {
      throw new BadRequestException(
        'Укажите название задачи и участников очереди',
      );
    }

    const uniqueAssigneeIds = [...new Set(data.assigneeIds)];

    for (const assigneeId of uniqueAssigneeIds) {
      await this.groups.assertMember(groupId, assigneeId);
    }

    const startDate = new Date(data.startDate);

    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Некорректная дата начала');
    }

    const recurring = await this.prisma.recurringTask.create({
      data: {
        groupId,
        creatorId: userId,
        title,
        alternateTitle,
        description: data.description,
        startDate,
        assigneeIds: uniqueAssigneeIds,
      },
    });

    await this.generateRecurringTasks(groupId, false);

    this.events.emitGroupUpdate(groupId, 'task:created', {
      recurringTaskId: recurring.id,
    });

    return recurring;
  }

  async listRecurring(groupId: string, userId: string) {
    await this.groups.assertMember(groupId, userId);

    return this.prisma.recurringTask.findMany({
      where: { groupId, active: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateRecurring(
    groupId: string,
    recurringId: string,
    userId: string,
    data: {
      title?: string;
      alternateTitle?: string | null;
      description?: string | null;
      assigneeIds?: string[];
      active?: boolean;
    },
  ) {
    const member = await this.groups.assertMember(groupId, userId);

    const existing = await this.prisma.recurringTask.findFirst({
      where: { id: recurringId, groupId },
    });

    if (!existing) {
      throw new NotFoundException('Правило повторения не найдено');
    }

    if (member.role !== 'OWNER' && existing.creatorId !== userId) {
      throw new ForbiddenException('Нельзя изменить чужое правило');
    }

    const assigneeIds =
      data.assigneeIds !== undefined
        ? [...new Set(data.assigneeIds)]
        : undefined;

    if (assigneeIds) {
      if (!assigneeIds.length) {
        throw new BadRequestException('Очередь участников не может быть пустой');
      }

      for (const id of assigneeIds) {
        await this.groups.assertMember(groupId, id);
      }
    }

    const updated = await this.prisma.recurringTask.update({
      where: { id: recurringId },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.alternateTitle !== undefined
          ? { alternateTitle: data.alternateTitle }
          : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(assigneeIds ? { assigneeIds } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });

    this.events.emitGroupUpdate(groupId, 'task:updated', updated);
    return updated;
  }

  async removeRecurring(
    groupId: string,
    recurringId: string,
    userId: string,
  ) {
    const member = await this.groups.assertMember(groupId, userId);

    const existing = await this.prisma.recurringTask.findFirst({
      where: { id: recurringId, groupId },
    });

    if (!existing) {
      throw new NotFoundException('Правило повторения не найдено');
    }

    if (member.role !== 'OWNER' && existing.creatorId !== userId) {
      throw new ForbiddenException('Нельзя удалить чужое правило');
    }

    const updated = await this.prisma.recurringTask.update({
      where: { id: recurringId },
      data: { active: false },
    });

    this.events.emitGroupUpdate(groupId, 'task:updated', updated);
    return { ok: true };
  }

  private async generateRecurringTasks(groupId: string, emitUpdate = true) {
    const rules = await this.prisma.recurringTask.findMany({
      where: { groupId, active: true },
    });

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 364);

    // Отключаем повторяющиеся правила-дубликаты, оставляя самое раннее.
    const uniqueRules = new Map<string, (typeof rules)[number]>();
    const duplicateRuleIds: string[] = [];

    for (const rule of rules.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    )) {
      const signature = JSON.stringify({
        title: rule.title.trim(),
        alternateTitle: rule.alternateTitle?.trim() ?? null,
        description: rule.description ?? null,
        startDate: rule.startDate.toISOString(),
        assigneeIds: rule.assigneeIds,
      });

      if (uniqueRules.has(signature)) {
        duplicateRuleIds.push(rule.id);
      } else {
        uniqueRules.set(signature, rule);
      }
    }

    if (duplicateRuleIds.length) {
      await this.prisma.$transaction([
        this.prisma.cleaningTask.deleteMany({
          where: { recurringTaskId: { in: duplicateRuleIds } },
        }),
        this.prisma.recurringTask.updateMany({
          where: { id: { in: duplicateRuleIds } },
          data: { active: false },
        }),
      ]);
    }

    const rulesToGenerate = [...uniqueRules.values()];
    let createdAny = false;

    for (const rule of rulesToGenerate) {
      if (!rule.assigneeIds.length) continue;

      const deletedRows = await this.prisma.$queryRaw<
        Array<{ occurrenceNumber: number }>
      >`
        SELECT "occurrenceNumber"
        FROM "DeletedRecurringOccurrence"
        WHERE "recurringTaskId" = ${rule.id}
      `;
      const deletedOccurrences = new Set(
        deletedRows.map((row) => row.occurrenceNumber),
      );

      const start = new Date(rule.startDate);
      const current = new Date(start);

      let occurrenceNumber = 0;

      while (current <= horizon) {
        const assigneeId =
          rule.assigneeIds[occurrenceNumber % rule.assigneeIds.length];

        const title =
          rule.alternateTitle && (occurrenceNumber + 1) % 4 === 0
            ? rule.alternateTitle
            : rule.title;

        const existing = await this.prisma.cleaningTask.findUnique({
          where: {
            recurringTaskId_occurrenceNumber: {
              recurringTaskId: rule.id,
              occurrenceNumber,
            },
          },
        });

        if (!existing && !deletedOccurrences.has(occurrenceNumber)) {
          await this.prisma.cleaningTask.create({
            data: {
              groupId,
              creatorId: rule.creatorId,
              recurringTaskId: rule.id,
              occurrenceNumber,
              title,
              description: rule.description,
              scheduledAt: new Date(current),
              assigneeId,
            },
            include: {
              assignee: {
                select: { id: true, displayName: true },
              },
              completions: true,
            },
          });

          createdAny = true;
        }

        occurrenceNumber++;
        current.setDate(current.getDate() + 7);
      }
    }

    if (createdAny && emitUpdate) {
      this.events.emitGroupUpdate(groupId, 'task:created', {
        generated: true,
      });
    }
  }

  async rating(groupId: string, userId: string) {
    await this.groups.assertMember(groupId, userId);

    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    const result = await Promise.all(
      members.map(async (member) => {
        const [completed, assigned, overdue] = await Promise.all([
          this.prisma.taskCompletion.count({
            where: {
              userId: member.userId,
              task: { groupId },
            },
          }),
          this.prisma.cleaningTask.count({
            where: {
              groupId,
              assigneeId: member.userId,
            },
          }),
          this.prisma.cleaningTask.count({
            where: {
              groupId,
              assigneeId: member.userId,
              status: 'OPEN',
              scheduledAt: { lt: new Date() },
            },
          }),
        ]);

        return {
          userId: member.userId,
          name: member.user.displayName,
          completed,
          assigned,
          overdue,
          score: completed * 10 - overdue * 3,
        };
      }),
    );

    return result.sort((a, b) => b.score - a.score);
  }
}

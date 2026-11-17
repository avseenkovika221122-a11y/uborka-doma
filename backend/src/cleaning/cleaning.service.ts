import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GroupsService } from '../groups/groups.service';
import { EventsGateway } from '../events.gateway';
@Injectable()
export class CleaningService {
  constructor(private prisma: PrismaService, private groups: GroupsService, private events: EventsGateway) {}
  async list(groupId: string, userId: string, from?: string, to?: string) {
    await this.groups.assertMember(groupId, userId);
    return this.prisma.cleaningTask.findMany({ where: { groupId, ...(from || to ? { scheduledAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) }, include: { assignee: { select: { id: true, displayName: true } }, creator: { select: { id: true, displayName: true } }, completions: true }, orderBy: { scheduledAt: 'asc' } });
  }
  async create(groupId: string, userId: string, data: { title: string; description?: string; scheduledAt: string; assigneeId?: string }) {
    await this.groups.assertMember(groupId, userId);
    if (data.assigneeId) await this.groups.assertMember(groupId, data.assigneeId);
    const task = await this.prisma.cleaningTask.create({ data: { groupId, creatorId: userId, title: data.title.trim(), description: data.description, scheduledAt: new Date(data.scheduledAt), assigneeId: data.assigneeId }, include: { assignee: { select: { id: true, displayName: true } }, completions: true } });
    this.events.emitGroupUpdate(groupId, 'task:created', task); return task;
  }
  async update(groupId: string, taskId: string, userId: string, data: { title?: string; description?: string; scheduledAt?: string; assigneeId?: string | null }) {
    await this.groups.assertMember(groupId, userId);
    const existing = await this.prisma.cleaningTask.findFirst({ where: { id: taskId, groupId } });
    if (!existing) throw new NotFoundException('Задание не найдено');
    if (data.assigneeId) await this.groups.assertMember(groupId, data.assigneeId);
    const task = await this.prisma.cleaningTask.update({ where: { id: taskId }, data: { ...data, ...(data.scheduledAt ? { scheduledAt: new Date(data.scheduledAt) } : {}) }, include: { assignee: { select: { id: true, displayName: true } }, completions: true } });
    this.events.emitGroupUpdate(groupId, 'task:updated', task); return task;
  }
  async complete(groupId: string, taskId: string, userId: string, completed: boolean) {
    await this.groups.assertMember(groupId, userId);
    const task = await this.prisma.cleaningTask.findFirst({ where: { id: taskId, groupId } });
    if (!task) throw new NotFoundException('Задание не найдено');
    if (task.assigneeId && task.assigneeId !== userId) throw new ForbiddenException('Отметить выполнение может назначенный исполнитель');
    const updated = await this.prisma.$transaction(async tx => {
      if (completed) await tx.taskCompletion.upsert({ where: { taskId_userId: { taskId, userId } }, create: { taskId, userId }, update: { completedAt: new Date() } });
      else await tx.taskCompletion.deleteMany({ where: { taskId, userId } });
      const completions = await tx.taskCompletion.findMany({ where: { taskId } });
      return tx.cleaningTask.update({ where: { id: taskId }, data: { status: completions.length ? 'COMPLETED' : 'OPEN', completedAt: completions.length ? new Date() : null }, include: { completions: true } });
    });
    this.events.emitGroupUpdate(groupId, 'task:updated', updated); return updated;
  }
  async remove(groupId: string, taskId: string, userId: string) {
    const member = await this.groups.assertMember(groupId, userId);
    const task = await this.prisma.cleaningTask.findFirst({ where: { id: taskId, groupId } });
    if (!task) throw new NotFoundException('Задание не найдено');
    if (member.role !== 'OWNER' && task.creatorId !== userId) throw new ForbiddenException('Нельзя удалить чужое задание');
    await this.prisma.cleaningTask.delete({ where: { id: taskId } });
    this.events.emitGroupUpdate(groupId, 'task:deleted', { id: taskId }); return { ok: true };
  }
  async rating(groupId: string, userId: string) {
    await this.groups.assertMember(groupId, userId);
    const members = await this.prisma.groupMember.findMany({ where: { groupId }, include: { user: { select: { id: true, displayName: true } } } });
    const result = await Promise.all(members.map(async m => {
      const [completed, assigned, overdue] = await Promise.all([
        this.prisma.taskCompletion.count({ where: { userId: m.userId, task: { groupId } } }),
        this.prisma.cleaningTask.count({ where: { groupId, assigneeId: m.userId } }),
        this.prisma.cleaningTask.count({ where: { groupId, assigneeId: m.userId, status: 'OPEN', scheduledAt: { lt: new Date() } } }),
      ]);
      return { userId: m.userId, name: m.user.displayName, completed, assigned, overdue, score: completed * 10 - overdue * 3 };
    }));
    return result.sort((a,b) => b.score - a.score);
  }
}

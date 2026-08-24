import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

/** Server-local today as a date-only Date. */
function today(): Date {
  const n = new Date();
  return new Date(
    `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`,
  );
}

/**
 * The accountant's personal workspace on the Accounting Dashboard:
 *   - a free-text notepad ("To-Do's")
 *   - dated reminders they manage ("Upcoming Due Dates")
 *   - system-derived deadlines (open accounting-period closes)
 */
@Injectable()
export class AccountingWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(orgId: string, userId: string) {
    const [note, reminders, systemDueDates] = await Promise.all([
      this.prisma.userNote.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      }),
      this.prisma.userReminder.findMany({
        where: { organizationId: orgId, userId },
        orderBy: [{ done: 'asc' }, { dueDate: 'asc' }],
      }),
      this.systemDueDates(orgId),
    ]);
    return {
      notes: note?.content ?? '',
      notesUpdatedAt: note?.updatedAt ?? null,
      reminders: reminders.map((r) => ({
        id: r.id,
        title: r.title,
        dueDate: r.dueDate,
        done: r.done,
      })),
      systemDueDates,
    };
  }

  async saveNotes(orgId: string, userId: string, content: string) {
    const saved = await this.prisma.userNote.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      update: { content: content ?? '' },
      create: { organizationId: orgId, userId, content: content ?? '' },
    });
    return { content: saved.content, notesUpdatedAt: saved.updatedAt };
  }

  async addReminder(orgId: string, userId: string, title: string, dueDate: string) {
    if (!title?.trim()) throw new BadRequestException('A reminder title is required.');
    const d = new Date(dueDate);
    if (isNaN(d.getTime())) throw new BadRequestException('A valid due date is required.');
    return this.prisma.userReminder.create({
      data: { organizationId: orgId, userId, title: title.trim(), dueDate: d },
    });
  }

  async updateReminder(
    orgId: string,
    userId: string,
    id: string,
    data: { done?: boolean; title?: string; dueDate?: string },
  ) {
    await this.own(orgId, userId, id);
    return this.prisma.userReminder.update({
      where: { id },
      data: {
        ...(data.done !== undefined ? { done: data.done } : {}),
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.dueDate ? { dueDate: new Date(data.dueDate) } : {}),
      },
    });
  }

  async deleteReminder(orgId: string, userId: string, id: string) {
    await this.own(orgId, userId, id);
    await this.prisma.userReminder.delete({ where: { id } });
    return { ok: true };
  }

  private async own(orgId: string, userId: string, id: string) {
    const r = await this.prisma.userReminder.findFirst({
      where: { id, organizationId: orgId, userId },
    });
    if (!r) throw new NotFoundException('Reminder not found.');
    return r;
  }

  /** Upcoming open accounting-period closes — read-only system deadlines. */
  private async systemDueDates(orgId: string) {
    const periods = await this.prisma.accountingPeriod.findMany({
      where: {
        status: 'open',
        endDate: { gte: today() },
        fiscalYear: { organizationId: orgId },
      },
      orderBy: { endDate: 'asc' },
      take: 6,
      select: { name: true, endDate: true },
    });
    return periods.map((p) => ({
      label: `Accounting period ${p.name} closes`,
      dueDate: p.endDate,
      source: 'system' as const,
    }));
  }
}

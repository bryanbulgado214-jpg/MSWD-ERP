import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const FY_SELECT = {
  id: true,
  year: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
  closedAt: true,
  closer: { select: { username: true } },
  createdAt: true,
  version: true,
  _count: { select: { accountingPeriods: true } },
} as const;

const PERIOD_SELECT = {
  id: true,
  periodNumber: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
  lockedAt: true,
  locker: { select: { username: true } },
  createdAt: true,
  version: true,
  _count: { select: { journalEntryVouchers: true } },
} as const;

@Injectable()
export class PeriodService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Fiscal Years ──

  async getFiscalYears(organizationId: string) {
    return this.prisma.fiscalYear.findMany({
      where: { organizationId },
      select: FY_SELECT,
      orderBy: { year: 'desc' },
    });
  }

  async createFiscalYear(
    organizationId: string,
    userId: string,
    data: { year: number; name: string; startDate: string; endDate: string },
  ) {
    const existing = await this.prisma.fiscalYear.findUnique({
      where: { organizationId_year: { organizationId, year: data.year } },
    });
    if (existing) throw new BadRequestException(`Fiscal year ${data.year} already exists.`);

    return runAudited(this.prisma, userId, async (tx) => {
      const fy = await tx.fiscalYear.create({
        data: {
          organizationId,
          year: data.year,
          name: data.name,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
        },
        select: FY_SELECT,
      });

      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];

      for (let i = 0; i < 12; i++) {
        const start = new Date(data.year, i, 1);
        const end = new Date(data.year, i + 1, 0);
        await tx.accountingPeriod.create({
          data: {
            fiscalYearId: fy.id,
            periodNumber: i + 1,
            name: `${months[i]} ${data.year}`,
            startDate: start,
            endDate: end,
          },
        });
      }

      return fy;
    });
  }

  async closeFiscalYear(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
  ) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id, organizationId },
      include: { accountingPeriods: { select: { status: true } } },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found.');
    if (fy.status === 'closed') throw new BadRequestException('Fiscal year is already closed.');
    if (fy.version !== expectedVersion) {
      throw new ConflictException('Fiscal year was modified. Please refresh.');
    }

    const openPeriods = fy.accountingPeriods.filter((p) => p.status === 'open');
    if (openPeriods.length > 0) {
      throw new BadRequestException(`Cannot close fiscal year — ${openPeriods.length} period(s) are still open. Close all periods first.`);
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.fiscalYear.update({
        where: { id },
        data: {
          status: 'closed',
          closedAt: new Date(),
          closedBy: userId,
          version: { increment: 1 },
        },
        select: FY_SELECT,
      }),
    );
  }

  // ── Accounting Periods ──

  async getPeriods(organizationId: string, fiscalYearId: string) {
    return this.prisma.accountingPeriod.findMany({
      where: {
        fiscalYearId,
        fiscalYear: { organizationId },
      },
      select: PERIOD_SELECT,
      orderBy: { periodNumber: 'asc' },
    });
  }

  async lockPeriod(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
  ) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id, fiscalYear: { organizationId } },
    });
    if (!period) throw new NotFoundException('Period not found.');
    if (period.status !== 'open') throw new BadRequestException('Only open periods can be locked.');
    if (period.lockedAt) throw new BadRequestException('Period is already locked.');
    if (period.version !== expectedVersion) {
      throw new ConflictException('Period was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.accountingPeriod.update({
        where: { id },
        data: {
          lockedAt: new Date(),
          lockedBy: userId,
          version: { increment: 1 },
        },
        select: PERIOD_SELECT,
      }),
    );
  }

  async unlockPeriod(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
  ) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id, fiscalYear: { organizationId } },
    });
    if (!period) throw new NotFoundException('Period not found.');
    if (!period.lockedAt) throw new BadRequestException('Period is not locked.');
    if (period.status !== 'open') throw new BadRequestException('Closed periods cannot be unlocked.');
    if (period.version !== expectedVersion) {
      throw new ConflictException('Period was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.accountingPeriod.update({
        where: { id },
        data: {
          lockedAt: null,
          lockedBy: null,
          version: { increment: 1 },
        },
        select: PERIOD_SELECT,
      }),
    );
  }

  async closePeriod(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
  ) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id, fiscalYear: { organizationId } },
      include: {
        journalEntryVouchers: {
          where: { status: { in: ['draft', 'for_review'] } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!period) throw new NotFoundException('Period not found.');
    if (period.status !== 'open') throw new BadRequestException('Period is already closed.');
    if (period.version !== expectedVersion) {
      throw new ConflictException('Period was modified. Please refresh.');
    }

    if (period.journalEntryVouchers.length > 0) {
      throw new BadRequestException('Cannot close period — there are unposted JEVs (draft or for_review). Post or void them first.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.accountingPeriod.update({
        where: { id },
        data: {
          status: 'closed',
          lockedAt: period.lockedAt ?? new Date(),
          lockedBy: period.lockedBy ?? userId,
          version: { increment: 1 },
        },
        select: PERIOD_SELECT,
      }),
    );
  }

  async reopenPeriod(
    organizationId: string,
    id: string,
    userId: string,
    expectedVersion: number,
  ) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id, fiscalYear: { organizationId } },
      include: { fiscalYear: { select: { status: true } } },
    });
    if (!period) throw new NotFoundException('Period not found.');
    if (period.status !== 'closed') throw new BadRequestException('Only closed periods can be reopened.');
    if (period.fiscalYear.status === 'closed') {
      throw new BadRequestException('Cannot reopen a period in a closed fiscal year.');
    }
    if (period.version !== expectedVersion) {
      throw new ConflictException('Period was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.accountingPeriod.update({
        where: { id },
        data: {
          status: 'open',
          lockedAt: null,
          lockedBy: null,
          version: { increment: 1 },
        },
        select: PERIOD_SELECT,
      }),
    );
  }
}

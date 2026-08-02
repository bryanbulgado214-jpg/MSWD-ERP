import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const COA_SELECT = {
  id: true,
  accountCode: true,
  name: true,
  accountType: true,
  normalBalance: true,
  level: true,
  isHeader: true,
  isActive: true,
  uacsCode: true,
  parentAccountId: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const;

@Injectable()
export class ChartOfAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { accountType?: string; includeInactive?: boolean; search?: string },
  ) {
    return this.prisma.chartOfAccount.findMany({
      where: {
        organizationId,
        ...(filters?.accountType ? { accountType: filters.accountType as any } : {}),
        ...(!filters?.includeInactive ? { isActive: true } : {}),
        ...(filters?.search
          ? {
              OR: [
                { accountCode: { contains: filters.search, mode: 'insensitive' as const } },
                { name: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        ...COA_SELECT,
        parentAccount: { select: { id: true, accountCode: true, name: true } },
      },
      orderBy: { accountCode: 'asc' },
    });
  }

  async findTree(organizationId: string) {
    const all = await this.prisma.chartOfAccount.findMany({
      where: { organizationId, isActive: true },
      select: COA_SELECT,
      orderBy: { accountCode: 'asc' },
    });
    return all;
  }

  async findOne(organizationId: string, id: string) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, organizationId },
      select: {
        ...COA_SELECT,
        parentAccount: { select: { id: true, accountCode: true, name: true } },
        childAccounts: {
          select: { id: true, accountCode: true, name: true, isActive: true },
          orderBy: { accountCode: 'asc' },
        },
      },
    });
    if (!account) throw new NotFoundException('Account not found.');
    return account;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      accountCode: string;
      name: string;
      accountType: any;
      normalBalance: any;
      level: number;
      isHeader: boolean;
      parentAccountId?: string;
      uacsCode?: string;
    },
  ) {
    const existing = await this.prisma.chartOfAccount.findFirst({
      where: { organizationId, accountCode: data.accountCode },
    });
    if (existing) throw new ConflictException('An account with this code already exists.');

    if (data.parentAccountId) {
      const parent = await this.prisma.chartOfAccount.findFirst({
        where: { id: data.parentAccountId, organizationId },
      });
      if (!parent) throw new NotFoundException('Parent account not found.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.chartOfAccount.create({
        data: {
          organizationId,
          accountCode: data.accountCode,
          name: data.name,
          accountType: data.accountType,
          normalBalance: data.normalBalance,
          level: data.level,
          isHeader: data.isHeader,
          ...(data.parentAccountId ? { parentAccountId: data.parentAccountId } : {}),
          ...(data.uacsCode ? { uacsCode: data.uacsCode } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: COA_SELECT,
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    userId: string,
    data: { expectedVersion: number; name?: string; isActive?: boolean; uacsCode?: string },
  ) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, organizationId },
    });
    if (!account) throw new NotFoundException('Account not found.');
    if (account.version !== data.expectedVersion) {
      throw new ConflictException('Account was modified by another user. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.chartOfAccount.update({
        where: { id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.uacsCode !== undefined ? { uacsCode: data.uacsCode || null } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: COA_SELECT,
      }),
    );
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const BANK_SELECT = {
  id: true,
  code: true,
  name: true,
  branch: true,
  swiftCode: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const BANK_ACCOUNT_SELECT = {
  id: true,
  accountNumber: true,
  accountName: true,
  accountType: true,
  currentBalance: true,
  status: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  bank: { select: { id: true, code: true, name: true } },
  fundSource: { select: { id: true, code: true, name: true } },
  chartOfAccount: { select: { id: true, accountCode: true, name: true } },
} as const;

@Injectable()
export class BankService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Banks ──

  async findAllBanks(organizationId: string) {
    return this.prisma.bank.findMany({
      where: { organizationId },
      select: {
        ...BANK_SELECT,
        _count: { select: { bankAccounts: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async createBank(
    organizationId: string,
    data: { code: string; name: string; branch?: string; swiftCode?: string },
  ) {
    const existing = await this.prisma.bank.findFirst({
      where: { organizationId, code: data.code },
    });
    if (existing) throw new ConflictException('A bank with this code already exists.');

    return this.prisma.bank.create({
      data: {
        organizationId,
        code: data.code,
        name: data.name,
        ...(data.branch ? { branch: data.branch } : {}),
        ...(data.swiftCode ? { swiftCode: data.swiftCode } : {}),
      },
      select: BANK_SELECT,
    });
  }

  async updateBank(
    organizationId: string,
    id: string,
    data: { name?: string; branch?: string; swiftCode?: string; isActive?: boolean },
  ) {
    const bank = await this.prisma.bank.findFirst({ where: { id, organizationId } });
    if (!bank) throw new NotFoundException('Bank not found.');

    return this.prisma.bank.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.branch !== undefined ? { branch: data.branch || null } : {}),
        ...(data.swiftCode !== undefined ? { swiftCode: data.swiftCode || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      select: BANK_SELECT,
    });
  }

  // ── Bank Accounts ──

  async findAllBankAccounts(
    organizationId: string,
    filters?: { bankId?: string; status?: string },
  ) {
    return this.prisma.bankAccount.findMany({
      where: {
        organizationId,
        ...(filters?.bankId ? { bankId: filters.bankId } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
      },
      select: BANK_ACCOUNT_SELECT,
      orderBy: { accountNumber: 'asc' },
    });
  }

  async findOneBankAccount(organizationId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId },
      select: BANK_ACCOUNT_SELECT,
    });
    if (!account) throw new NotFoundException('Bank account not found.');
    return account;
  }

  async createBankAccount(
    organizationId: string,
    userId: string,
    data: {
      bankId: string;
      fundSourceId?: string;
      accountNumber: string;
      accountName: string;
      accountType: any;
      isDefault?: boolean;
    },
  ) {
    const bank = await this.prisma.bank.findFirst({
      where: { id: data.bankId, organizationId },
    });
    if (!bank) throw new NotFoundException('Bank not found.');

    const existing = await this.prisma.bankAccount.findFirst({
      where: { organizationId, accountNumber: data.accountNumber },
    });
    if (existing) throw new ConflictException('An account with this number already exists.');

    return runAudited(this.prisma, userId, async (tx) => {
      if (data.isDefault) {
        await tx.bankAccount.updateMany({
          where: { organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.bankAccount.create({
        data: {
          organizationId,
          bankId: data.bankId,
          ...(data.fundSourceId ? { fundSourceId: data.fundSourceId } : {}),
          accountNumber: data.accountNumber,
          accountName: data.accountName,
          accountType: data.accountType,
          ...(data.isDefault ? { isDefault: true } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: BANK_ACCOUNT_SELECT,
      });
    });
  }

  async updateBankAccount(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      accountName?: string;
      fundSourceId?: string;
      isDefault?: boolean;
      status?: any;
    },
  ) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId },
    });
    if (!account) throw new NotFoundException('Bank account not found.');
    if (account.version !== data.expectedVersion) {
      throw new ConflictException('Bank account was modified by another user. Please refresh.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      if (data.isDefault) {
        await tx.bankAccount.updateMany({
          where: { organizationId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.bankAccount.update({
        where: { id },
        data: {
          ...(data.accountName ? { accountName: data.accountName } : {}),
          ...(data.fundSourceId !== undefined ? { fundSourceId: data.fundSourceId || null } : {}),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
          ...(data.status ? { status: data.status } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: BANK_ACCOUNT_SELECT,
      });
    });
  }
}

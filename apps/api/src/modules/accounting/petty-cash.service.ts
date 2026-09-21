import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import { NotificationService } from '../notification/notification.service';

import { AutoJevService } from './auto-jev.service';
import {
  CreatePettyCashFundDto,
  CreatePettyCashVoucherDto,
  PrepareReplenishmentDto,
  UpdatePettyCashFundDto,
  UpdatePettyCashVoucherDto,
} from './dto/petty-cash.dto';

const num = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

/**
 * Petty Cash Fund — imprest system.
 *
 * Individual disbursements are recorded as petty-cash vouchers (PCVs) with NO
 * journal entry. The journal entry is recorded ONLY on replenishment: the
 * accountant posts one JEV (Dr each voucher's expense account, Cr Cash in Bank),
 * restoring the fund to its imprest amount. Cash on hand = imprest − the total
 * of still-unreplenished vouchers.
 */
@Injectable()
export class PettyCashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Active, postable expense accounts — for the custodian's charge-account picker.
   * Exposed under petty_cash.read so the cashier (who lacks accounting.read) can
   * choose an expense account when recording a voucher.
   */
  async listExpenseAccounts(organizationId: string) {
    return this.prisma.chartOfAccount.findMany({
      where: { organizationId, accountType: 'expense', isHeader: false, isActive: true },
      select: { id: true, accountCode: true, name: true },
      orderBy: { accountCode: 'asc' },
    });
  }

  // ── shared helpers ─────────────────────────────────────────────────────────

  private async accountMap(
    organizationId: string,
    ids: (string | null | undefined)[],
  ): Promise<Map<string, { id: string; accountCode: string; name: string }>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.chartOfAccount.findMany({
      where: { organizationId, id: { in: unique } },
      select: { id: true, accountCode: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private async userMap(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, username: true, fullName: true },
    });
    return new Map(rows.map((r) => [r.id, r.fullName || r.username]));
  }

  private async requireOrgAccount(organizationId: string, id: string, label: string) {
    const acct = await this.prisma.chartOfAccount.findFirst({
      where: { organizationId, id, isActive: true },
      select: { id: true, accountCode: true, name: true },
    });
    if (!acct) throw new BadRequestException(`${label} is not a valid active chart-of-accounts entry.`);
    return acct;
  }

  private async generateNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
    documentType: string,
    prefix: string,
    year: number,
    pad: number,
  ): Promise<string> {
    const [seq] = await tx.$queryRaw<[{ next_number: bigint }]>`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = NOW()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = ${documentType}
      RETURNING next_number
    `;
    if (seq) return `${prefix}${year}-${String(seq.next_number).padStart(pad, '0')}`;
    const [inserted] = await tx.$queryRaw<[{ next_number: bigint }]>`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, ${documentType}, ${prefix}, 1)
      RETURNING next_number
    `;
    if (!inserted) throw new Error('Failed to generate a document number.');
    return `${prefix}${year}-${String(inserted.next_number).padStart(pad, '0')}`;
  }

  /** Total of still-unreplenished vouchers per fund (reduces cash on hand). */
  private async unreplenishedTotals(
    organizationId: string,
    fundIds: string[],
  ): Promise<Map<string, number>> {
    if (fundIds.length === 0) return new Map();
    const rows = await this.prisma.pettyCashVoucher.groupBy({
      by: ['fundId'],
      where: { organizationId, fundId: { in: fundIds }, status: 'unreplenished' },
      _sum: { amount: true },
    });
    return new Map(rows.map((r) => [r.fundId, num(r._sum.amount)]));
  }

  // ── funds ──────────────────────────────────────────────────────────────────

  async listFunds(organizationId: string) {
    const funds = await this.prisma.pettyCashFund.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    const accounts = await this.accountMap(
      organizationId,
      funds.flatMap((f) => [f.pettyCashAccountId, f.cashInBankAccountId]),
    );
    const users = await this.userMap(funds.map((f) => f.custodianUserId));
    const spent = await this.unreplenishedTotals(
      organizationId,
      funds.map((f) => f.id),
    );
    return funds.map((f) => this.presentFund(f, accounts, users, spent.get(f.id) ?? 0));
  }

  async getFund(organizationId: string, id: string) {
    const fund = await this.prisma.pettyCashFund.findFirst({ where: { organizationId, id } });
    if (!fund) throw new NotFoundException('Petty cash fund not found.');
    const accounts = await this.accountMap(organizationId, [
      fund.pettyCashAccountId,
      fund.cashInBankAccountId,
    ]);
    const users = await this.userMap([fund.custodianUserId]);
    const spent = (await this.unreplenishedTotals(organizationId, [fund.id])).get(fund.id) ?? 0;
    return this.presentFund(fund, accounts, users, spent);
  }

  private presentFund(
    f: {
      id: string;
      name: string;
      imprestAmount: Prisma.Decimal;
      pettyCashAccountId: string;
      cashInBankAccountId: string;
      custodianUserId: string | null;
      status: string;
      version: number;
    },
    accounts: Map<string, { id: string; accountCode: string; name: string }>,
    users: Map<string, string>,
    unreplenished: number,
  ) {
    const imprest = num(f.imprestAmount);
    return {
      id: f.id,
      name: f.name,
      imprestAmount: imprest,
      status: f.status,
      version: f.version,
      pettyCashAccountId: f.pettyCashAccountId,
      pettyCashAccount: accounts.get(f.pettyCashAccountId) ?? null,
      cashInBankAccountId: f.cashInBankAccountId,
      cashInBankAccount: accounts.get(f.cashInBankAccountId) ?? null,
      custodianUserId: f.custodianUserId,
      custodianName: f.custodianUserId ? (users.get(f.custodianUserId) ?? null) : null,
      unreplenishedTotal: unreplenished,
      cashOnHand: Math.round((imprest - unreplenished) * 100) / 100,
    };
  }

  async createFund(organizationId: string, userId: string, dto: CreatePettyCashFundDto) {
    await this.requireOrgAccount(organizationId, dto.pettyCashAccountId, 'Petty Cash Fund account');
    await this.requireOrgAccount(organizationId, dto.cashInBankAccountId, 'Cash in Bank account');
    if (dto.custodianUserId) {
      const custodian = await this.prisma.user.findFirst({
        where: { id: dto.custodianUserId, organizationId },
        select: { id: true },
      });
      if (!custodian) throw new BadRequestException('Custodian must be a user in this organization.');
    }
    const fund = await this.prisma.pettyCashFund.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        imprestAmount: dto.imprestAmount,
        pettyCashAccountId: dto.pettyCashAccountId,
        cashInBankAccountId: dto.cashInBankAccountId,
        custodianUserId: dto.custodianUserId ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return this.getFund(organizationId, fund.id);
  }

  async updateFund(organizationId: string, userId: string, id: string, dto: UpdatePettyCashFundDto) {
    const fund = await this.prisma.pettyCashFund.findFirst({ where: { organizationId, id } });
    if (!fund) throw new NotFoundException('Petty cash fund not found.');
    if (dto.pettyCashAccountId)
      await this.requireOrgAccount(organizationId, dto.pettyCashAccountId, 'Petty Cash Fund account');
    if (dto.cashInBankAccountId)
      await this.requireOrgAccount(organizationId, dto.cashInBankAccountId, 'Cash in Bank account');
    if (dto.custodianUserId) {
      const custodian = await this.prisma.user.findFirst({
        where: { id: dto.custodianUserId, organizationId },
        select: { id: true },
      });
      if (!custodian) throw new BadRequestException('Custodian must be a user in this organization.');
    }
    await this.prisma.pettyCashFund.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.imprestAmount !== undefined ? { imprestAmount: dto.imprestAmount } : {}),
        ...(dto.pettyCashAccountId ? { pettyCashAccountId: dto.pettyCashAccountId } : {}),
        ...(dto.cashInBankAccountId ? { cashInBankAccountId: dto.cashInBankAccountId } : {}),
        ...(dto.custodianUserId !== undefined ? { custodianUserId: dto.custodianUserId } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    return this.getFund(organizationId, id);
  }

  // ── vouchers ───────────────────────────────────────────────────────────────

  async listVouchers(organizationId: string, fundId?: string, status?: string) {
    const vouchers = await this.prisma.pettyCashVoucher.findMany({
      where: {
        organizationId,
        ...(fundId ? { fundId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: [{ pcvDate: 'desc' }, { pcvNumber: 'desc' }],
    });
    const accounts = await this.accountMap(
      organizationId,
      vouchers.map((v) => v.chargeAccountId),
    );
    return vouchers.map((v) => this.presentVoucher(v, accounts));
  }

  private presentVoucher(
    v: {
      id: string;
      fundId: string;
      pcvNumber: string;
      pcvDate: Date;
      payeeName: string;
      particulars: string;
      amount: Prisma.Decimal;
      chargeAccountId: string | null;
      status: string;
      replenishmentId: string | null;
      version: number;
    },
    accounts: Map<string, { id: string; accountCode: string; name: string }>,
  ) {
    return {
      id: v.id,
      fundId: v.fundId,
      pcvNumber: v.pcvNumber,
      pcvDate: v.pcvDate,
      payeeName: v.payeeName,
      particulars: v.particulars,
      amount: num(v.amount),
      chargeAccountId: v.chargeAccountId,
      chargeAccount: v.chargeAccountId ? (accounts.get(v.chargeAccountId) ?? null) : null,
      status: v.status,
      replenishmentId: v.replenishmentId,
      version: v.version,
    };
  }

  async createVoucher(organizationId: string, userId: string, dto: CreatePettyCashVoucherDto) {
    const fund = await this.prisma.pettyCashFund.findFirst({
      where: { organizationId, id: dto.fundId },
    });
    if (!fund) throw new NotFoundException('Petty cash fund not found.');
    if (fund.status !== 'active')
      throw new BadRequestException('This petty cash fund is closed.');
    // The expense account is assigned later by the accountant (optional here).
    if (dto.chargeAccountId)
      await this.requireOrgAccount(organizationId, dto.chargeAccountId, 'Charge (expense) account');

    const spent =
      (await this.unreplenishedTotals(organizationId, [fund.id])).get(fund.id) ?? 0;
    const cashOnHand = num(fund.imprestAmount) - spent;
    if (dto.amount > cashOnHand + 0.005)
      throw new BadRequestException(
        `Amount exceeds petty cash on hand (₱${cashOnHand.toLocaleString('en-PH', { minimumFractionDigits: 2 })}). Replenish the fund first.`,
      );

    const pcvNumber = await this.prisma.$transaction((tx) =>
      this.generateNumber(
        tx,
        organizationId,
        'petty_cash_voucher',
        'PCV-',
        new Date(dto.pcvDate).getUTCFullYear(),
        4,
      ),
    );
    const created = await this.prisma.pettyCashVoucher.create({
      data: {
        organizationId,
        fundId: dto.fundId,
        pcvNumber,
        pcvDate: new Date(dto.pcvDate),
        payeeName: dto.payeeName.trim(),
        particulars: dto.particulars.trim(),
        amount: dto.amount,
        chargeAccountId: dto.chargeAccountId ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    // Reminder to the custodian: this voucher is unreplenished. Auto-cleared
    // when it is replenished or cancelled (see below).
    await this.notifications
      .create({
        organizationId,
        userId,
        title: `Petty cash voucher ${created.pcvNumber} — awaiting replenishment`,
        body: `${created.payeeName}: ₱${num(created.amount).toLocaleString('en-PH', {
          minimumFractionDigits: 2,
        })} — ${created.particulars}. Prepare a replenishment when ready.`,
        linkUrl: '/accounting/petty-cash',
        relatedTable: 'petty_cash_vouchers',
        relatedId: created.id,
      })
      .catch(() => undefined);

    const accounts = await this.accountMap(
      organizationId,
      created.chargeAccountId ? [created.chargeAccountId] : [],
    );
    return this.presentVoucher(created, accounts);
  }

  async updateVoucher(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdatePettyCashVoucherDto,
  ) {
    const v = await this.prisma.pettyCashVoucher.findFirst({ where: { organizationId, id } });
    if (!v) throw new NotFoundException('Petty cash voucher not found.');
    if (v.status !== 'unreplenished' || v.replenishmentId)
      throw new BadRequestException('Only an unreplenished voucher not yet in a replenishment can be edited.');
    if (dto.chargeAccountId)
      await this.requireOrgAccount(organizationId, dto.chargeAccountId, 'Charge (expense) account');
    await this.prisma.pettyCashVoucher.update({
      where: { id },
      data: {
        ...(dto.pcvDate ? { pcvDate: new Date(dto.pcvDate) } : {}),
        ...(dto.payeeName !== undefined ? { payeeName: dto.payeeName.trim() } : {}),
        ...(dto.particulars !== undefined ? { particulars: dto.particulars.trim() } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.chargeAccountId ? { chargeAccountId: dto.chargeAccountId } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    return this.listVouchers(organizationId, v.fundId).then((rows) => rows.find((r) => r.id === id));
  }

  async cancelVoucher(organizationId: string, userId: string, id: string) {
    const v = await this.prisma.pettyCashVoucher.findFirst({ where: { organizationId, id } });
    if (!v) throw new NotFoundException('Petty cash voucher not found.');
    if (v.status !== 'unreplenished' || v.replenishmentId)
      throw new BadRequestException('Only an unreplenished voucher not yet in a replenishment can be cancelled.');
    await this.prisma.pettyCashVoucher.update({
      where: { id },
      data: { status: 'cancelled', updatedBy: userId, version: { increment: 1 } },
    });
    await this.notifications
      .markReadByRelated(organizationId, 'petty_cash_vouchers', [id])
      .catch(() => undefined);
    return { ok: true };
  }

  // ── replenishments ───────────────────────────────────────────────────────────

  async listReplenishments(organizationId: string, fundId?: string) {
    const reps = await this.prisma.pettyCashReplenishment.findMany({
      where: { organizationId, ...(fundId ? { fundId } : {}) },
      orderBy: [{ replDate: 'desc' }, { replNumber: 'desc' }],
    });
    const jevs = await this.prisma.journalEntryVoucher.findMany({
      where: { id: { in: reps.map((r) => r.jevId).filter((x): x is string => !!x) } },
      select: { id: true, jevNumber: true },
    });
    const jevMap = new Map(jevs.map((j) => [j.id, j.jevNumber]));
    const users = await this.userMap(reps.flatMap((r) => [r.preparedBy, r.postedBy]));
    return reps.map((r) => ({
      id: r.id,
      fundId: r.fundId,
      replNumber: r.replNumber,
      replDate: r.replDate,
      status: r.status,
      totalAmount: num(r.totalAmount),
      jevId: r.jevId,
      jevNumber: r.jevId ? (jevMap.get(r.jevId) ?? null) : null,
      preparedBy: r.preparedBy,
      preparedName: r.preparedBy ? (users.get(r.preparedBy) ?? null) : null,
      postedBy: r.postedBy,
      postedName: r.postedBy ? (users.get(r.postedBy) ?? null) : null,
      version: r.version,
    }));
  }

  /** Detail incl. the vouchers and the (proposed or posted) journal entry lines. */
  async getReplenishment(organizationId: string, id: string) {
    const rep = await this.prisma.pettyCashReplenishment.findFirst({ where: { organizationId, id } });
    if (!rep) throw new NotFoundException('Replenishment not found.');
    const fund = await this.prisma.pettyCashFund.findFirst({
      where: { organizationId, id: rep.fundId },
    });
    const vouchers = await this.prisma.pettyCashVoucher.findMany({
      where: { organizationId, replenishmentId: rep.id },
      orderBy: [{ pcvDate: 'asc' }, { pcvNumber: 'asc' }],
    });
    const accounts = await this.accountMap(organizationId, [
      ...vouchers.map((v) => v.chargeAccountId),
      ...(fund ? [fund.cashInBankAccountId] : []),
    ]);
    const users = await this.userMap([rep.preparedBy, rep.postedBy]);
    const jev = rep.jevId
      ? await this.prisma.journalEntryVoucher.findUnique({
          where: { id: rep.jevId },
          select: { id: true, jevNumber: true },
        })
      : null;

    // Proposed/posted JE: Dr each charge account (grouped), Cr Cash in Bank.
    // Vouchers the accountant has not yet classified are excluded until assigned.
    const byAccount = new Map<string, number>();
    for (const v of vouchers) {
      if (!v.chargeAccountId) continue;
      byAccount.set(v.chargeAccountId, (byAccount.get(v.chargeAccountId) ?? 0) + num(v.amount));
    }
    const total = [...byAccount.values()].reduce((s, a) => s + a, 0);
    const jeLines = [
      ...[...byAccount.entries()].map(([accId, amt]) => ({
        accountId: accId,
        account: accounts.get(accId) ?? null,
        debit: Math.round(amt * 100) / 100,
        credit: 0,
      })),
      ...(fund
        ? [
            {
              accountId: fund.cashInBankAccountId,
              account: accounts.get(fund.cashInBankAccountId) ?? null,
              debit: 0,
              credit: Math.round(total * 100) / 100,
            },
          ]
        : []),
    ];

    return {
      id: rep.id,
      fundId: rep.fundId,
      fundName: fund?.name ?? null,
      replNumber: rep.replNumber,
      replDate: rep.replDate,
      status: rep.status,
      totalAmount: num(rep.totalAmount),
      jevId: rep.jevId,
      jevNumber: jev?.jevNumber ?? null,
      preparedBy: rep.preparedBy,
      preparedName: rep.preparedBy ? (users.get(rep.preparedBy) ?? null) : null,
      postedBy: rep.postedBy,
      postedName: rep.postedBy ? (users.get(rep.postedBy) ?? null) : null,
      version: rep.version,
      unassignedCount: vouchers.filter((v) => !v.chargeAccountId).length,
      vouchers: vouchers.map((v) => this.presentVoucher(v, accounts)),
      jeLines,
    };
  }

  /** Accountant assigns/changes a voucher's expense account (at replenishment review). */
  async setVoucherChargeAccount(
    organizationId: string,
    userId: string,
    id: string,
    chargeAccountId: string,
  ) {
    const v = await this.prisma.pettyCashVoucher.findFirst({ where: { organizationId, id } });
    if (!v) throw new NotFoundException('Petty cash voucher not found.');
    if (v.status !== 'unreplenished')
      throw new BadRequestException('This voucher has already been replenished.');
    await this.requireOrgAccount(organizationId, chargeAccountId, 'Charge (expense) account');
    await this.prisma.pettyCashVoucher.update({
      where: { id },
      data: { chargeAccountId, updatedBy: userId, version: { increment: 1 } },
    });
    return { ok: true };
  }

  async prepareReplenishment(organizationId: string, userId: string, dto: PrepareReplenishmentDto) {
    const fund = await this.prisma.pettyCashFund.findFirst({
      where: { organizationId, id: dto.fundId },
    });
    if (!fund) throw new NotFoundException('Petty cash fund not found.');
    const vouchers = await this.prisma.pettyCashVoucher.findMany({
      where: { organizationId, fundId: dto.fundId, id: { in: dto.voucherIds } },
    });
    if (vouchers.length !== dto.voucherIds.length)
      throw new BadRequestException('Some selected vouchers were not found in this fund.');
    const bad = vouchers.find((v) => v.status !== 'unreplenished' || v.replenishmentId);
    if (bad)
      throw new BadRequestException(
        `Voucher ${bad.pcvNumber} is already replenished or part of another replenishment.`,
      );
    const total = vouchers.reduce((s, v) => s + num(v.amount), 0);

    const rep = await this.prisma.$transaction(async (tx) => {
      const replNumber = await this.generateNumber(
        tx,
        organizationId,
        'petty_cash_replenishment',
        'PCREP-',
        new Date(dto.replDate).getUTCFullYear(),
        4,
      );
      const created = await tx.pettyCashReplenishment.create({
        data: {
          organizationId,
          fundId: dto.fundId,
          replNumber,
          replDate: new Date(dto.replDate),
          totalAmount: total,
          preparedBy: userId,
          preparedAt: new Date(),
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.pettyCashVoucher.updateMany({
        where: { id: { in: dto.voucherIds } },
        data: { replenishmentId: created.id, updatedBy: userId },
      });
      return created;
    });
    // The custodian has done their part — clear their per-voucher reminders
    // (these vouchers are now the accountant's to review & post).
    await this.notifications
      .markReadByRelated(organizationId, 'petty_cash_vouchers', dto.voucherIds)
      .catch(() => undefined);
    // Hand off to the accountant: the replenishment awaits review & posting.
    await this.notifications
      .notifyUsersWithPermission(
        organizationId,
        'accounting.petty_cash.manage',
        {
          title: `Petty cash replenishment ${rep.replNumber} — review & post`,
          body: `The custodian prepared a replenishment for ${fund.name} totalling ₱${total.toLocaleString(
            'en-PH',
            { minimumFractionDigits: 2 },
          )}. Assign expense accounts, then post the journal entry.`,
          linkUrl: '/accounting/petty-cash',
          relatedTable: 'petty_cash_replenishments',
          relatedId: rep.id,
        },
        userId,
      )
      .catch(() => undefined);
    return this.getReplenishment(organizationId, rep.id);
  }

  /** Accountant: review & post — records the ONE journal entry for the imprest cycle. */
  async postReplenishment(organizationId: string, userId: string, id: string) {
    const rep = await this.prisma.pettyCashReplenishment.findFirst({ where: { organizationId, id } });
    if (!rep) throw new NotFoundException('Replenishment not found.');
    if (rep.status !== 'draft')
      throw new BadRequestException('Only a draft replenishment can be posted.');
    const fund = await this.prisma.pettyCashFund.findFirst({
      where: { organizationId, id: rep.fundId },
    });
    if (!fund) throw new NotFoundException('Petty cash fund not found.');
    const vouchers = await this.prisma.pettyCashVoucher.findMany({
      where: { organizationId, replenishmentId: rep.id, status: 'unreplenished' },
    });
    if (vouchers.length === 0)
      throw new BadRequestException('This replenishment has no vouchers to post.');
    const unassigned = vouchers.filter((v) => !v.chargeAccountId).length;
    if (unassigned > 0)
      throw new BadRequestException(
        `Assign an expense account to every voucher before posting (${unassigned} still unassigned).`,
      );

    const byAccount = new Map<string, number>();
    for (const v of vouchers)
      byAccount.set(v.chargeAccountId!, (byAccount.get(v.chargeAccountId!) ?? 0) + num(v.amount));
    const total = [...byAccount.values()].reduce((s, a) => s + a, 0);
    const lines = [
      ...[...byAccount.entries()].map(([accountId, amt]) => ({
        chartOfAccountId: accountId,
        debitAmount: Math.round(amt * 100) / 100,
        creditAmount: 0,
        description: `Petty cash replenishment ${rep.replNumber}`,
      })),
      {
        chartOfAccountId: fund.cashInBankAccountId,
        debitAmount: 0,
        creditAmount: Math.round(total * 100) / 100,
        description: `Replenishment of ${fund.name}`,
      },
    ];

    let jevNumber = '';
    await this.prisma.$transaction(async (tx) => {
      const jev = await this.autoJev.createAutoJev(tx, {
        organizationId,
        userId,
        jevDate: new Date(rep.replDate),
        sourceType: 'petty_cash',
        sourceTable: 'petty_cash_replenishments',
        sourceId: rep.id,
        particulars: `Replenishment of ${fund.name} (${rep.replNumber}) — ${vouchers.length} voucher(s)`,
        status: 'posted',
        lines,
      });
      if (!jev)
        throw new BadRequestException(
          'Could not record the journal entry. Ensure an accounting period is open for the replenishment date.',
        );
      jevNumber = jev.jevNumber;
      await tx.pettyCashReplenishment.update({
        where: { id: rep.id },
        data: {
          status: 'posted',
          jevId: jev.id,
          totalAmount: total,
          postedBy: userId,
          postedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      await tx.pettyCashVoucher.updateMany({
        where: { id: { in: vouchers.map((v) => v.id) } },
        data: { status: 'replenished', updatedBy: userId },
      });
    });
    // Vouchers are replenished and the replenishment posted — clear the
    // custodian's per-voucher reminders and the accountant's review notice.
    await this.notifications
      .markReadByRelated(
        organizationId,
        'petty_cash_vouchers',
        vouchers.map((v) => v.id),
      )
      .catch(() => undefined);
    await this.notifications
      .markReadByRelated(organizationId, 'petty_cash_replenishments', [rep.id])
      .catch(() => undefined);
    // Confirm back to the custodian who prepared it.
    if (rep.preparedBy && rep.preparedBy !== userId) {
      await this.notifications
        .create({
          organizationId,
          userId: rep.preparedBy,
          title: `Petty cash replenishment ${rep.replNumber} posted`,
          body: `The accountant posted the replenishment (${jevNumber}). The fund has been replenished.`,
          linkUrl: '/accounting/petty-cash',
          relatedTable: 'petty_cash_replenishments',
          relatedId: rep.id,
        })
        .catch(() => undefined);
    }
    return this.getReplenishment(organizationId, rep.id);
  }

  async cancelReplenishment(organizationId: string, userId: string, id: string) {
    const rep = await this.prisma.pettyCashReplenishment.findFirst({ where: { organizationId, id } });
    if (!rep) throw new NotFoundException('Replenishment not found.');
    if (rep.status !== 'draft')
      throw new BadRequestException('Only a draft replenishment can be cancelled.');
    await this.prisma.$transaction(async (tx) => {
      await tx.pettyCashVoucher.updateMany({
        where: { organizationId, replenishmentId: rep.id },
        data: { replenishmentId: null, updatedBy: userId },
      });
      await tx.pettyCashReplenishment.update({
        where: { id: rep.id },
        data: { status: 'cancelled', updatedBy: userId, version: { increment: 1 } },
      });
    });
    await this.notifications
      .markReadByRelated(organizationId, 'petty_cash_replenishments', [rep.id])
      .catch(() => undefined);
    return { ok: true };
  }
}

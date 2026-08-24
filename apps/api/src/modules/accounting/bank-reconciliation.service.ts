import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { AutoJevService } from './auto-jev.service';

// Uploaded bank-statement files live on disk under the API working dir; the
// Attachment row keeps the relative path. (uploads/ is gitignored.)
const UPLOAD_SUBDIR = path.join('uploads', 'reconciliations');
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];

const round2 = (n: number) => Math.round(n * 100) / 100;

const RECON_SELECT = {
  id: true,
  reconciliationDate: true,
  bookBalance: true,
  bankBalance: true,
  adjustedBookBalance: true,
  adjustedBankBalance: true,
  difference: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  bankAccount: {
    select: {
      id: true,
      accountNumber: true,
      accountName: true,
      bank: { select: { code: true, name: true } },
    },
  },
  accountingPeriod: { select: { id: true, name: true, periodNumber: true } },
  preparer: { select: { username: true } },
  approver: { select: { username: true } },
  approvedAt: true,
} as const;

const RECON_DETAIL_SELECT = {
  ...RECON_SELECT,
  items: {
    select: {
      id: true,
      itemType: true,
      referenceNumber: true,
      referenceDate: true,
      amount: true,
      description: true,
      checkId: true,
      check: { select: { id: true, checkNumber: true, payeeName: true, status: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class BankReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  async findAll(organizationId: string, filters?: { bankAccountId?: string; status?: string }) {
    return this.prisma.bankReconciliation.findMany({
      where: {
        organizationId,
        ...(filters?.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
      },
      select: RECON_SELECT,
      orderBy: { reconciliationDate: 'desc' },
      take: 100,
    });
  }

  async findOne(organizationId: string, id: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
      select: RECON_DETAIL_SELECT,
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    return recon;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      bankAccountId: string;
      accountingPeriodId: string;
      reconciliationDate: string;
      bookBalance: number;
      bankBalance: number;
    },
  ) {
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, organizationId },
      select: { id: true, chartOfAccountId: true },
    });
    if (!bankAccount) throw new BadRequestException('Bank account not found.');

    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id: data.accountingPeriodId, fiscalYear: { organizationId } },
      select: { fiscalYearId: true },
    });
    if (!period) throw new BadRequestException('Accounting period not found.');

    // One reconciliation per bank account per period (DB unique constraint) —
    // surface it as a clear message rather than a 500.
    const existing = await this.prisma.bankReconciliation.findFirst({
      where: {
        organizationId,
        bankAccountId: data.bankAccountId,
        accountingPeriodId: data.accountingPeriodId,
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'A reconciliation already exists for this bank account and period. Open it from the list instead.',
      );
    }

    // The book balance is authoritative from the GL — the cash-in-bank account's
    // balance as at the reconciliation date, never a hand-typed figure.
    const bookBalance = await this.glCashBalance(
      organizationId,
      bankAccount.chartOfAccountId,
      new Date(data.reconciliationDate),
      period.fiscalYearId,
    );

    return runAudited(this.prisma, userId, (tx) =>
      tx.bankReconciliation.create({
        data: {
          organizationId,
          bankAccountId: data.bankAccountId,
          accountingPeriodId: data.accountingPeriodId,
          reconciliationDate: new Date(data.reconciliationDate),
          bookBalance,
          bankBalance: data.bankBalance,
          adjustedBookBalance: bookBalance,
          adjustedBankBalance: data.bankBalance,
          difference: round2(bookBalance - data.bankBalance),
          status: 'in_progress',
          preparedBy: userId,
          createdBy: userId,
          updatedBy: userId,
        },
        select: RECON_DETAIL_SELECT,
      }),
    );
  }

  /**
   * GL balance of a bank account's Cash-in-Bank account as at a date, scoped to
   * one fiscal year — matching how the GL/SFP present it (each FY carries its
   * own opening-balance entry, so summing across years would double-count).
   */
  private async glCashBalance(
    orgId: string,
    cashCoaId: string | null,
    asOf: Date,
    fiscalYearId: string,
  ): Promise<number> {
    if (!cashCoaId) return 0;
    const agg = await this.prisma.jevLine.aggregate({
      where: {
        chartOfAccountId: cashCoaId,
        jev: {
          organizationId: orgId,
          status: 'posted',
          jevDate: { lte: asOf },
          accountingPeriod: { fiscalYearId },
        },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    return round2(Number(agg._sum.debitAmount ?? 0) - Number(agg._sum.creditAmount ?? 0));
  }

  /** Book-balance lookup for the create form's auto-fill. */
  async getGlCashBalance(
    orgId: string,
    bankAccountId: string,
    asOfDate: string,
    accountingPeriodId: string,
  ) {
    const ba = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId: orgId },
      select: { chartOfAccountId: true },
    });
    if (!ba) throw new NotFoundException('Bank account not found.');
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id: accountingPeriodId, fiscalYear: { organizationId: orgId } },
      select: { fiscalYearId: true },
    });
    if (!period) throw new BadRequestException('Accounting period not found.');
    return {
      bookBalance: await this.glCashBalance(
        orgId,
        ba.chartOfAccountId,
        new Date(asOfDate),
        period.fiscalYearId,
      ),
      hasCashAccount: !!ba.chartOfAccountId,
    };
  }

  async addItem(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      itemType: string;
      referenceNumber?: string;
      referenceDate: string;
      amount: number;
      description: string;
      checkId?: string;
    },
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved')
      throw new BadRequestException('Cannot modify an approved reconciliation.');
    if (recon.version !== data.expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.bankReconciliationItem.create({
        data: {
          bankReconciliationId: id,
          itemType: data.itemType as any,
          ...(data.referenceNumber ? { referenceNumber: data.referenceNumber } : {}),
          referenceDate: new Date(data.referenceDate),
          amount: data.amount,
          description: data.description,
          ...(data.checkId ? { checkId: data.checkId } : {}),
        },
      });

      const updated = await this.recalculate(tx, id, userId);
      return updated;
    });
  }

  async removeItem(
    organizationId: string,
    reconId: string,
    itemId: string,
    userId: string,
    expectedVersion: number,
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id: reconId, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved')
      throw new BadRequestException('Cannot modify an approved reconciliation.');
    if (recon.version !== expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.bankReconciliationItem.delete({ where: { id: itemId } });
      return this.recalculate(tx, reconId, userId);
    });
  }

  /** Import bank-statement transactions (from CSV) as statement lines to match. */
  async importStatementLines(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      lines: Array<{
        transactionDate: string;
        description: string;
        amount: number;
        referenceNumber?: string;
      }>;
    },
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({ where: { id, organizationId } });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved') {
      throw new BadRequestException('Cannot modify an approved reconciliation.');
    }
    if (recon.version !== data.expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }
    if (!data.lines?.length) throw new BadRequestException('No transactions to import.');

    await runAudited(this.prisma, userId, async (tx) => {
      await tx.bankStatementLine.createMany({
        data: data.lines.map((l) => ({
          bankReconciliationId: id,
          transactionDate: new Date(l.transactionDate),
          description: l.description,
          referenceNumber: l.referenceNumber ?? null,
          amount: l.amount,
        })),
      });
      await this.refreshBalances(tx, id);
    });
    return this.getMatchView(organizationId, id);
  }

  /**
   * The QuickBooks-style match board: imported bank statement lines vs. the bank
   * account's still-uncleared book (GL cash) entries, with an unmatched counter
   * on each side. Reconciled when both counters hit zero.
   */
  async getMatchView(organizationId: string, id: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        status: true,
        version: true,
        reconciliationDate: true,
        bookBalance: true,
        bankBalance: true,
        organization: { select: { name: true } },
        bankAccount: {
          select: {
            id: true,
            accountName: true,
            accountNumber: true,
            chartOfAccountId: true,
            bank: { select: { code: true, name: true } },
          },
        },
        accountingPeriod: { select: { name: true, fiscalYearId: true } },
      },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    const cashCoaId = recon.bankAccount.chartOfAccountId;
    const fiscalYearId = recon.accountingPeriod.fiscalYearId;

    const lines = await this.prisma.bankStatementLine.findMany({
      where: { bankReconciliationId: id },
      orderBy: { transactionDate: 'asc' },
      select: {
        id: true,
        transactionDate: true,
        description: true,
        referenceNumber: true,
        amount: true,
        matchGroupId: true,
      },
    });

    // Book side = posted GL lines on this bank's Cash-in-Bank account. Two sets:
    //  • unmatched candidates — dated on/before the recon date, in this fiscal
    //    year, not yet in any match group;
    //  • already-matched — the lines cleared by THIS reconciliation's groups
    //    (kept in the view so the Reconciled tab can show them).
    const bookSelect = {
      id: true,
      debitAmount: true,
      creditAmount: true,
      description: true,
      matchGroupId: true,
      jev: { select: { jevNumber: true, jevDate: true, particulars: true } },
    } as const;

    const bookUnmatchedRaw = cashCoaId
      ? await this.prisma.jevLine.findMany({
          where: {
            chartOfAccountId: cashCoaId,
            matchGroupId: null,
            jev: {
              organizationId,
              status: 'posted',
              jevDate: { lte: recon.reconciliationDate },
              accountingPeriod: { fiscalYearId },
            },
          },
          select: bookSelect,
        })
      : [];

    const bookMatchedRaw = cashCoaId
      ? await this.prisma.jevLine.findMany({
          where: { chartOfAccountId: cashCoaId, matchGroup: { bankReconciliationId: id } },
          select: bookSelect,
        })
      : [];

    const book = [...bookUnmatchedRaw, ...bookMatchedRaw]
      .map((l) => ({
        jevLineId: l.id,
        jevNumber: l.jev.jevNumber,
        jevDate: l.jev.jevDate,
        description: l.description ?? l.jev.particulars,
        amount: round2(Number(l.debitAmount) - Number(l.creditAmount)),
        matched: l.matchGroupId !== null,
        matchGroupId: l.matchGroupId,
      }))
      .sort((a, b) => a.jevDate.getTime() - b.jevDate.getTime());

    const bank = lines.map((l) => ({
      id: l.id,
      transactionDate: l.transactionDate,
      description: l.description,
      referenceNumber: l.referenceNumber,
      amount: Number(l.amount),
      matched: l.matchGroupId !== null,
      matchGroupId: l.matchGroupId,
    }));

    const unmatchedBankLines = bank.filter((b) => !b.matched);
    const unmatchedBookLines = book.filter((b) => !b.matched);
    const unmatchedBank = unmatchedBankLines.length;
    const unmatchedBook = unmatchedBookLines.length;
    // Peso value still unreconciled on each side — both reach 0 when matched.
    const unmatchedBankAmount = round2(unmatchedBankLines.reduce((s, b) => s + b.amount, 0));
    const unmatchedBookAmount = round2(unmatchedBookLines.reduce((s, b) => s + b.amount, 0));

    // Book balance is the LIVE GL cash (not the stored snapshot) so "Add to
    // books" keeps the reconciliation stable.
    const bankBalance = Number(recon.bankBalance);
    const bookBalance = cashCoaId
      ? await this.glCashBalance(organizationId, cashCoaId, recon.reconciliationDate, fiscalYearId)
      : Number(recon.bookBalance);
    // Adjusted balances (kept for reference on the report).
    const adjustedBook = round2(bookBalance + unmatchedBankAmount);
    const adjustedBank = round2(bankBalance + unmatchedBookAmount);
    // Reconciliation progress, measured against the BOOK balance: the net of the
    // book (GL cash) entries not yet matched to a bank transaction. It starts at
    // the full book balance (nothing reconciled) and reaches zero only when every
    // book entry is matched and every bank-only item has been added to the books.
    const difference = round2(unmatchedBookAmount);
    const fullyReconciled = unmatchedBank === 0 && unmatchedBook === 0;

    return {
      recon: {
        id: recon.id,
        status: recon.status,
        version: recon.version,
        reconciliationDate: recon.reconciliationDate,
        organizationName: recon.organization.name,
        bookBalance,
        bankBalance,
        bankAccount: {
          id: recon.bankAccount.id,
          label: `${recon.bankAccount.bank.code} — ${recon.bankAccount.accountName} (${recon.bankAccount.accountNumber})`,
          hasCashAccount: !!cashCoaId,
        },
        periodName: recon.accountingPeriod.name,
      },
      bank,
      book,
      summary: {
        unmatchedBank,
        unmatchedBook,
        matched: bank.length - unmatchedBank,
        unmatchedBankAmount,
        unmatchedBookAmount,
        adjustedBook,
        adjustedBank,
        difference,
        // Reconciled once every entry on both sides is matched (bank-only items
        // are matched by "Add to books").
        reconciled: fullyReconciled && bank.length > 0,
      },
    };
  }

  private async requireEditable(organizationId: string, id: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true, bankAccount: { select: { chartOfAccountId: true } } },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved') {
      throw new BadRequestException('Cannot modify an approved reconciliation.');
    }
    return recon;
  }

  /**
   * Match a SET of bank statement lines to a SET of book (GL cash) lines whose
   * signed totals are equal — many-to-many. Creates one match group and puts
   * every selected line (both sides) into it, clearing them all together.
   */
  async match(
    organizationId: string,
    id: string,
    userId: string,
    data: { statementLineIds: string[]; jevLineIds: string[] },
  ) {
    const recon = await this.requireEditable(organizationId, id);
    const cashCoaId = recon.bankAccount.chartOfAccountId;
    if (!cashCoaId) {
      throw new BadRequestException(
        'This bank account is not linked to a Cash-in-Bank ledger account.',
      );
    }
    const statementLineIds = [...new Set(data.statementLineIds)];
    const jevLineIds = [...new Set(data.jevLineIds)];
    if (!statementLineIds.length) throw new BadRequestException('Select at least one bank line.');
    if (!jevLineIds.length) throw new BadRequestException('Select at least one book entry.');

    const statementLines = await this.prisma.bankStatementLine.findMany({
      where: { id: { in: statementLineIds }, bankReconciliationId: id, matchGroupId: null },
      select: { id: true, amount: true },
    });
    if (statementLines.length !== statementLineIds.length) {
      throw new BadRequestException('One or more bank lines are not available to match.');
    }

    const jevLines = await this.prisma.jevLine.findMany({
      where: {
        id: { in: jevLineIds },
        chartOfAccountId: cashCoaId,
        matchGroupId: null,
        jev: { organizationId, status: 'posted' },
      },
      select: { id: true, debitAmount: true, creditAmount: true },
    });
    if (jevLines.length !== jevLineIds.length) {
      throw new BadRequestException('One or more book entries are not available to match.');
    }

    const bankTotal = round2(statementLines.reduce((s, l) => s + Number(l.amount), 0));
    const bookTotal = round2(
      jevLines.reduce((s, l) => s + Number(l.debitAmount) - Number(l.creditAmount), 0),
    );
    if (Math.abs(bookTotal - bankTotal) > 0.01) {
      throw new BadRequestException(
        `Selected bank lines total ${bankTotal.toFixed(2)}, but the book entries total ${bookTotal.toFixed(2)}. They must be equal.`,
      );
    }

    await runAudited(this.prisma, userId, async (tx) => {
      const group = await tx.bankMatchGroup.create({
        data: { bankReconciliationId: id, matchedBy: userId, matchedAt: new Date() },
        select: { id: true },
      });
      await tx.bankStatementLine.updateMany({
        where: { id: { in: statementLineIds } },
        data: { matchGroupId: group.id },
      });
      await tx.jevLine.updateMany({
        where: { id: { in: jevLineIds } },
        data: { matchGroupId: group.id },
      });
      await this.refreshBalances(tx, id);
    });
    return this.getMatchView(organizationId, id);
  }

  /** Unmatch a whole match group — every line in it returns to unreconciled. */
  async unmatch(
    organizationId: string,
    id: string,
    userId: string,
    data: { matchGroupId: string },
  ) {
    await this.requireEditable(organizationId, id);
    const group = await this.prisma.bankMatchGroup.findFirst({
      where: { id: data.matchGroupId, bankReconciliationId: id },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Match group not found.');
    // Deleting the group SetNulls both link columns, freeing every line in it.
    await runAudited(this.prisma, userId, async (tx) => {
      await tx.bankMatchGroup.delete({ where: { id: group.id } });
      await this.refreshBalances(tx, id);
    });
    return this.getMatchView(organizationId, id);
  }

  /**
   * Auto-match: pair every unmatched bank line with an unmatched book (GL cash)
   * line of the same amount — one-to-one, nearest date first. Clears everything
   * that lines up in a single pass; genuine bank-only lines (charges) remain for
   * "Add to books".
   */
  async autoMatch(organizationId: string, id: string, userId: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
      select: {
        status: true,
        reconciliationDate: true,
        bankAccount: { select: { chartOfAccountId: true } },
        accountingPeriod: { select: { fiscalYearId: true } },
      },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved') {
      throw new BadRequestException('Cannot modify an approved reconciliation.');
    }
    const cashCoaId = recon.bankAccount.chartOfAccountId;
    if (!cashCoaId) return this.getMatchView(organizationId, id);

    const bankLines = await this.prisma.bankStatementLine.findMany({
      where: { bankReconciliationId: id, matchGroupId: null },
      orderBy: { transactionDate: 'asc' },
      select: { id: true, amount: true },
    });
    const bookLines = await this.prisma.jevLine.findMany({
      where: {
        chartOfAccountId: cashCoaId,
        matchGroupId: null,
        jev: {
          organizationId,
          status: 'posted',
          jevDate: { lte: recon.reconciliationDate },
          accountingPeriod: { fiscalYearId: recon.accountingPeriod.fiscalYearId },
        },
      },
      orderBy: { jev: { jevDate: 'asc' } },
      select: { id: true, debitAmount: true, creditAmount: true },
    });

    // Pool book-line ids by signed amount (2dp key), consumed one per match.
    const pool = new Map<string, string[]>();
    for (const b of bookLines) {
      const key = round2(Number(b.debitAmount) - Number(b.creditAmount)).toFixed(2);
      const arr = pool.get(key);
      if (arr) arr.push(b.id);
      else pool.set(key, [b.id]);
    }
    const pairs: Array<{ statementLineId: string; jevLineId: string }> = [];
    for (const bl of bankLines) {
      const arr = pool.get(round2(Number(bl.amount)).toFixed(2));
      const jevLineId = arr?.shift();
      if (jevLineId) pairs.push({ statementLineId: bl.id, jevLineId });
    }

    if (pairs.length) {
      await runAudited(this.prisma, userId, async (tx) => {
        // Each auto-matched pair is its own 1:1 group.
        for (const p of pairs) {
          const group = await tx.bankMatchGroup.create({
            data: { bankReconciliationId: id, matchedBy: userId, matchedAt: new Date() },
            select: { id: true },
          });
          await tx.bankStatementLine.update({
            where: { id: p.statementLineId },
            data: { matchGroupId: group.id },
          });
          await tx.jevLine.update({
            where: { id: p.jevLineId },
            data: { matchGroupId: group.id },
          });
        }
        await this.refreshBalances(tx, id);
      });
    }
    return this.getMatchView(organizationId, id);
  }

  /**
   * Record a bank-only line (e.g. a service charge) directly to the books: post
   * a JEV against the chosen account and the bank's cash account, then match the
   * statement line to the newly-created cash line. Money-out debits the account
   * / credits cash; money-in debits cash / credits the account.
   */
  async createEntryFromLine(
    organizationId: string,
    id: string,
    userId: string,
    data: { statementLineId: string; accountId: string; description?: string },
  ) {
    const recon = await this.requireEditable(organizationId, id);
    const cashCoaId = recon.bankAccount.chartOfAccountId;
    if (!cashCoaId) {
      throw new BadRequestException(
        'This bank account is not linked to a Cash-in-Bank ledger account.',
      );
    }
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: data.statementLineId, bankReconciliationId: id },
      select: {
        id: true,
        amount: true,
        description: true,
        transactionDate: true,
        matchGroupId: true,
      },
    });
    if (!line) throw new NotFoundException('Statement line not found.');
    if (line.matchGroupId) throw new BadRequestException('That bank line is already matched.');
    if (data.accountId === cashCoaId) {
      throw new BadRequestException('Choose the income/expense account, not the cash account.');
    }
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id: data.accountId, organizationId, isHeader: false, isActive: true },
      select: { id: true },
    });
    if (!account) throw new BadRequestException('Invalid or inactive account.');

    const amt = Number(line.amount);
    const abs = round2(Math.abs(amt));
    const desc = (data.description?.trim() || line.description).slice(0, 500);
    const jevLines =
      amt >= 0
        ? [
            { chartOfAccountId: cashCoaId, debitAmount: abs, creditAmount: 0, description: desc },
            {
              chartOfAccountId: data.accountId,
              debitAmount: 0,
              creditAmount: abs,
              description: desc,
            },
          ]
        : [
            {
              chartOfAccountId: data.accountId,
              debitAmount: abs,
              creditAmount: 0,
              description: desc,
            },
            { chartOfAccountId: cashCoaId, debitAmount: 0, creditAmount: abs, description: desc },
          ];

    await runAudited(this.prisma, userId, async (tx) => {
      const jev = await this.autoJev.createAutoJev(tx, {
        organizationId,
        userId,
        jevDate: line.transactionDate,
        sourceType: 'manual',
        sourceTable: 'bank_statement_lines',
        sourceId: line.id,
        particulars: `Bank reconciliation — ${desc}`,
        status: 'posted',
        lines: jevLines,
      });
      if (!jev) {
        throw new BadRequestException(
          'Could not post the entry — ensure an accounting period is open for the transaction date.',
        );
      }
      const cashLine = await tx.jevLine.findFirst({
        where: { jevId: jev.id, chartOfAccountId: cashCoaId },
        select: { id: true },
      });
      if (cashLine) {
        // A 1:1 match group linking the bank line to its new cash line.
        const group = await tx.bankMatchGroup.create({
          data: { bankReconciliationId: id, matchedBy: userId, matchedAt: new Date() },
          select: { id: true },
        });
        await tx.bankStatementLine.update({
          where: { id: line.id },
          data: { matchGroupId: group.id },
        });
        await tx.jevLine.update({
          where: { id: cashLine.id },
          data: { matchGroupId: group.id },
        });
      }
      await this.refreshBalances(tx, id);
    });
    return this.getMatchView(organizationId, id);
  }

  /** Store an uploaded bank-statement file (PDF/PNG/JPEG) against the recon. */
  async addAttachment(
    organizationId: string,
    id: string,
    userId: string,
    file?: Express.Multer.File,
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF, PNG, or JPEG files are allowed.');
    }

    const dir = path.join(process.cwd(), UPLOAD_SUBDIR);
    fs.mkdirSync(dir, { recursive: true });
    const stored = `${randomUUID()}${path.extname(file.originalname)}`;
    fs.writeFileSync(path.join(dir, stored), file.buffer);

    const att = await this.prisma.attachment.create({
      data: {
        organizationId,
        attachableTable: 'bank_reconciliations',
        attachableId: id,
        fileName: file.originalname,
        filePath: path.join(UPLOAD_SUBDIR, stored),
        mimeType: file.mimetype,
        fileSizeBytes: BigInt(file.size),
        uploadedBy: userId,
      },
      select: { id: true, fileName: true, mimeType: true, fileSizeBytes: true, createdAt: true },
    });
    return { ...att, fileSizeBytes: Number(att.fileSizeBytes) };
  }

  async listAttachments(organizationId: string, id: string) {
    const atts = await this.prisma.attachment.findMany({
      where: { organizationId, attachableTable: 'bank_reconciliations', attachableId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSizeBytes: true,
        createdAt: true,
        uploader: { select: { username: true } },
      },
    });
    return atts.map((a) => ({ ...a, fileSizeBytes: Number(a.fileSizeBytes) }));
  }

  async getAttachmentFile(organizationId: string, id: string, attId: string) {
    const att = await this.prisma.attachment.findFirst({
      where: {
        id: attId,
        organizationId,
        attachableTable: 'bank_reconciliations',
        attachableId: id,
      },
      select: { fileName: true, filePath: true, mimeType: true },
    });
    if (!att) throw new NotFoundException('Attachment not found.');
    const abs = path.join(process.cwd(), att.filePath);
    if (!fs.existsSync(abs)) throw new NotFoundException('The file is missing on the server.');
    return { abs, fileName: att.fileName, mimeType: att.mimeType };
  }

  async complete(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status !== 'in_progress')
      throw new BadRequestException('Only in-progress reconciliations can be completed.');
    if (recon.version !== expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    // A reconciliation can only be completed when every entry on both sides has
    // been accounted for: each bank transaction matched to a book (GL cash) entry,
    // and each bank-only item added to the books. Nothing may be left unmatched.
    const { unmatchedBankCount, unmatchedBookCount } = await this.computeBalances(this.prisma, id);
    if (unmatchedBankCount > 0 || unmatchedBookCount > 0) {
      const parts: string[] = [];
      if (unmatchedBankCount > 0) parts.push(`${unmatchedBankCount} bank transaction(s)`);
      if (unmatchedBookCount > 0) parts.push(`${unmatchedBookCount} book entry(ies)`);
      throw new BadRequestException(
        `Cannot complete — ${parts.join(' and ')} still unreconciled. ` +
          `Match every bank transaction to its book entry, and use "Add to books" for ` +
          `bank-only items (charges, interest), until nothing remains.`,
      );
    }

    return runAudited(this.prisma, userId, async (tx) => {
      await this.refreshBalances(tx, id);
      return tx.bankReconciliation.update({
        where: { id },
        data: { status: 'completed', updatedBy: userId, version: { increment: 1 } },
        select: RECON_DETAIL_SELECT,
      });
    });
  }

  async approve(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status !== 'completed')
      throw new BadRequestException('Only completed reconciliations can be approved.');
    if (recon.version !== expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.bankReconciliation.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: RECON_DETAIL_SELECT,
      }),
    );
  }

  /**
   * Delete / undo a reconciliation (any status, including approved).
   * Every book line this reconciliation had cleared is returned to the
   * uncleared pool (match link + matcher + timestamp cleared). Reconciling
   * items and imported statement lines cascade away with the record;
   * attachment rows (polymorphic — no cascade FK) and their files are
   * removed too. The "Add to books" journal entries this reconciliation
   * posted (bank charges, interest, etc.) are also reverted — they were
   * created as part of this reconciliation, so undoing it removes them,
   * leaving the ledger as it was before. Otherwise those entries would
   * linger as unmatched book lines and get wrongly auto-matched next time.
   */
  async remove(organizationId: string, userId: string, id: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');

    // How many book lines this recon had cleared (for the response message).
    const unmatchedBookLines = await this.prisma.jevLine.count({
      where: { matchGroup: { bankReconciliationId: id } },
    });

    // "Add to books" JEVs are sourced from this reconciliation's statement lines
    // (sourceTable='bank_statement_lines'); collect them so they can be reverted.
    const stmtLineIds = (
      await this.prisma.bankStatementLine.findMany({
        where: { bankReconciliationId: id },
        select: { id: true },
      })
    ).map((l) => l.id);
    const addToBooksJevs = stmtLineIds.length
      ? await this.prisma.journalEntryVoucher.count({
          where: {
            organizationId,
            sourceTable: 'bank_statement_lines',
            sourceId: { in: stmtLineIds },
          },
        })
      : 0;

    // Grab attachment file paths up front for best-effort disk cleanup.
    const atts = await this.prisma.attachment.findMany({
      where: { organizationId, attachableTable: 'bank_reconciliations', attachableId: id },
      select: { filePath: true },
    });

    await runAudited(this.prisma, userId, async (tx) => {
      await tx.attachment.deleteMany({
        where: { organizationId, attachableTable: 'bank_reconciliations', attachableId: id },
      });
      // Revert the "Add to books" journal entries (jev_lines cascade).
      if (stmtLineIds.length) {
        await tx.journalEntryVoucher.deleteMany({
          where: {
            organizationId,
            sourceTable: 'bank_statement_lines',
            sourceId: { in: stmtLineIds },
          },
        });
      }
      // Cascades reconciling items, imported statement lines, and match groups.
      // Deleting the groups SetNulls jev_lines.match_group_id, so every book
      // line cleared by this recon returns to the uncleared pool automatically.
      await tx.bankReconciliation.delete({ where: { id } });
    });

    for (const a of atts) {
      try {
        fs.unlinkSync(path.join(process.cwd(), a.filePath));
      } catch {
        /* file already gone — ignore */
      }
    }

    return { deleted: true, unmatchedBookLines, revertedEntries: addToBooksJevs };
  }

  /**
   * Adjusted-balance reconciliation computed from the match state. The
   * reconciling items are the still-unmatched lines:
   *   • unmatched BANK lines  → bank items not yet booked (charges / credits)
   *     → adjust the BOOK balance
   *   • unmatched BOOK lines  → book items not yet on the bank (deposits in
   *     transit / outstanding checks) → adjust the BANK balance
   * Reconciled ⇔ adjusted book = adjusted bank (difference ≈ 0).
   *
   * "Balance per books" is the LIVE GL cash balance (recomputed each time, not a
   * snapshot) so that posting an adjusting entry via "Add to books" keeps the
   * reconciliation stable: the entry raises the live GL by exactly the amount it
   * removes from the unmatched-bank adjustment.
   */
  private async computeBalances(client: any, reconId: string) {
    const recon = await client.bankReconciliation.findUnique({
      where: { id: reconId },
      select: {
        organizationId: true,
        bookBalance: true,
        bankBalance: true,
        reconciliationDate: true,
        accountingPeriod: { select: { fiscalYearId: true } },
        bankAccount: { select: { chartOfAccountId: true } },
      },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    const cash = recon.bankAccount.chartOfAccountId;
    let bookBalance = Number(recon.bookBalance);
    let unmatchedBankSum = 0;
    let unmatchedBookSum = 0;
    let unmatchedBankCount = 0;
    let unmatchedBookCount = 0;
    if (cash) {
      const jevWhere = {
        organizationId: recon.organizationId,
        status: 'posted',
        jevDate: { lte: recon.reconciliationDate },
        accountingPeriod: { fiscalYearId: recon.accountingPeriod.fiscalYearId },
      };
      // Live GL cash balance (all posted cash lines up to the recon date).
      const gl = await client.jevLine.aggregate({
        _sum: { debitAmount: true, creditAmount: true },
        where: { chartOfAccountId: cash, jev: jevWhere },
      });
      bookBalance = round2(Number(gl._sum.debitAmount ?? 0) - Number(gl._sum.creditAmount ?? 0));

      const ub = await client.bankStatementLine.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: { bankReconciliationId: reconId, matchGroupId: null },
      });
      unmatchedBankSum = Number(ub._sum.amount ?? 0);
      unmatchedBankCount = ub._count._all;
      const bk = await client.jevLine.findMany({
        where: { chartOfAccountId: cash, matchGroupId: null, jev: jevWhere },
        select: { debitAmount: true, creditAmount: true },
      });
      unmatchedBookCount = bk.length;
      unmatchedBookSum = bk.reduce(
        (s: number, l: { debitAmount: unknown; creditAmount: unknown }) =>
          s + Number(l.debitAmount) - Number(l.creditAmount),
        0,
      );
    }
    const bankBalance = Number(recon.bankBalance);
    const adjustedBook = round2(bookBalance + unmatchedBankSum);
    const adjustedBank = round2(bankBalance + unmatchedBookSum);
    // Reconciliation progress = net book entries not yet matched to the bank.
    const difference = round2(unmatchedBookSum);
    return {
      bookBalance,
      bankBalance,
      adjustedBook,
      adjustedBank,
      difference,
      unmatchedBankCount,
      unmatchedBookCount,
    };
  }

  /** Recompute and persist the (live) balances/difference after a match change. */
  private async refreshBalances(tx: any, reconId: string) {
    const b = await this.computeBalances(tx, reconId);
    await tx.bankReconciliation.update({
      where: { id: reconId },
      data: {
        bookBalance: b.bookBalance,
        adjustedBookBalance: b.adjustedBook,
        adjustedBankBalance: b.adjustedBank,
        difference: b.difference,
      },
    });
    return b;
  }

  private async recalculate(tx: any, reconId: string, userId: string) {
    const recon = await tx.bankReconciliation.findUnique({
      where: { id: reconId },
      include: { items: true },
    });

    let bookAdjustment = 0;
    let bankAdjustment = 0;

    for (const item of recon.items) {
      const amt = Number(item.amount);
      switch (item.itemType) {
        case 'deposit_in_transit':
          bankAdjustment += amt;
          break;
        case 'outstanding_check':
          bankAdjustment -= amt;
          break;
        case 'bank_charge':
          bookAdjustment -= amt;
          break;
        case 'bank_credit':
          bookAdjustment += amt;
          break;
        case 'book_error':
          bookAdjustment += amt;
          break;
        case 'bank_error':
          bankAdjustment += amt;
          break;
      }
    }

    const adjustedBook = Number(recon.bookBalance) + bookAdjustment;
    const adjustedBank = Number(recon.bankBalance) + bankAdjustment;
    const difference = adjustedBook - adjustedBank;

    return tx.bankReconciliation.update({
      where: { id: reconId },
      data: {
        adjustedBookBalance: adjustedBook,
        adjustedBankBalance: adjustedBank,
        difference,
        updatedBy: userId,
        version: { increment: 1 },
      },
      select: RECON_DETAIL_SELECT,
    });
  }
}

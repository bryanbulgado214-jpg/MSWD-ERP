import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

type Col = {
  key: string;
  label: string;
  kind?: 'money' | 'number' | 'date' | 'text';
  align?: 'right';
};
type Report = {
  title: string;
  columns: Col[];
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, number>;
};

/**
 * Collection reports — each returns a generic { columns, rows, totals } shape so
 * one renderer/exporter can present any of them. All reconcile to the same
 * collection batches, receipts, deposits, and posted JEVs.
 */
@Injectable()
export class CollectionReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async run(orgId: string, kind: string, from?: string, to?: string): Promise<Report> {
    switch (kind) {
      case 'daily-summary':
        return this.dailySummary(orgId, from, to);
      case 'register':
        return this.register(orgId, from, to);
      case 'deposits':
        return this.depositRegister(orgId, from, to);
      case 'posting':
        return this.postingRegister(orgId, from, to);
      case 'undeposited':
        return this.undeposited(orgId, from, to);
      case 'by-method':
        return this.byMethod(orgId, from, to);
      case 'by-type':
        return this.byType(orgId, from, to);
      case 'cashier-accountability':
        return this.cashierAccountability(orgId, from, to);
      case 'exceptions':
        return this.exceptions(orgId, from, to);
      default:
        throw new BadRequestException(`Unknown report "${kind}".`);
    }
  }

  private async userNames(ids: (string | null)[]) {
    const uids = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uids.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({
      where: { id: { in: uids } },
      select: { id: true, username: true },
    });
    return new Map(users.map((u) => [u.id, u.username]));
  }

  private range(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  private async jevNumbers(ids: (string | null)[]) {
    const jevIds = ids.filter((x): x is string => !!x);
    if (!jevIds.length) return new Map<string, string>();
    const jevs = await this.prisma.journalEntryVoucher.findMany({
      where: { id: { in: jevIds } },
      select: { id: true, jevNumber: true },
    });
    return new Map(jevs.map((j) => [j.id, j.jevNumber]));
  }

  private async dailySummary(orgId: string, from?: string, to?: string): Promise<Report> {
    const collectionDate = this.range(from, to);
    const batches = await this.prisma.collectionAccountingBatch.findMany({
      where: { organizationId: orgId, ...(collectionDate ? { collectionDate } : {}) },
      orderBy: { collectionDate: 'desc' },
    });
    const jevMap = await this.jevNumbers(batches.map((b) => b.jevId));
    const deposits = await this.prisma.collectionDeposit.findMany({
      where: { organizationId: orgId, collectionBatchId: { in: batches.map((b) => b.id) } },
      select: { collectionBatchId: true, depositAmount: true },
    });
    const depByBatch = new Map<string, number>();
    for (const d of deposits) {
      if (!d.collectionBatchId) continue;
      depByBatch.set(
        d.collectionBatchId,
        (depByBatch.get(d.collectionBatchId) ?? 0) + Number(d.depositAmount),
      );
    }

    const rows = batches.map((b) => {
      const electronic = round2(
        Number(b.onlineAmount) + Number(b.bankTransferAmount) + Number(b.otherAmount),
      );
      const physical = Number(b.cashAmount) + Number(b.checkAmount);
      const deposited = round2(depByBatch.get(b.id) ?? 0);
      return {
        batchNumber: b.batchNumber,
        collectionDate: b.collectionDate,
        receipts: b.transactionCount,
        cash: Number(b.cashAmount),
        check: Number(b.checkAmount),
        electronic,
        total: Number(b.totalCollections),
        deposited,
        undeposited: round2(physical - deposited),
        jev: b.jevId ? (jevMap.get(b.jevId) ?? '') : '',
        status: b.status,
      };
    });
    return {
      title: 'Daily Collection Summary',
      columns: [
        { key: 'batchNumber', label: 'Batch #' },
        { key: 'collectionDate', label: 'Date', kind: 'date' },
        { key: 'receipts', label: 'Receipts', kind: 'number', align: 'right' },
        { key: 'cash', label: 'Cash', kind: 'money', align: 'right' },
        { key: 'check', label: 'Check', kind: 'money', align: 'right' },
        { key: 'electronic', label: 'Electronic', kind: 'money', align: 'right' },
        { key: 'total', label: 'Total', kind: 'money', align: 'right' },
        { key: 'deposited', label: 'Deposited', kind: 'money', align: 'right' },
        { key: 'undeposited', label: 'Undeposited', kind: 'money', align: 'right' },
        { key: 'jev', label: 'JEV' },
        { key: 'status', label: 'Status' },
      ],
      rows,
      totals: this.sum(rows, ['cash', 'check', 'electronic', 'total', 'deposited', 'undeposited']),
    };
  }

  private async register(orgId: string, from?: string, to?: string): Promise<Report> {
    const paymentDate = this.range(from, to);
    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, status: 'valid', ...(paymentDate ? { paymentDate } : {}) },
      include: {
        consumer: { select: { accountNumber: true, lastName: true, firstName: true } },
        allocations: { include: { bill: { select: { billNumber: true } } } },
      },
      orderBy: [{ paymentDate: 'desc' }, { orNumber: 'asc' }],
    });
    const batchIds = [
      ...new Set(payments.map((p) => p.collectionBatchId).filter((x): x is string => !!x)),
    ];
    const batches = batchIds.length
      ? await this.prisma.collectionAccountingBatch.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, batchNumber: true },
        })
      : [];
    const batchName = new Map(batches.map((b) => [b.id, b.batchNumber]));
    const typeIds = [
      ...new Set(
        payments
          .flatMap((p) => p.allocations.map((a) => a.collectionTypeId))
          .filter((x): x is string => !!x),
      ),
    ];
    const types = typeIds.length
      ? await this.prisma.collectionType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, name: true },
        })
      : [];
    const typeName = new Map(types.map((t) => [t.id, t.name]));

    const rows = payments.map((p) => ({
      paymentDate: p.paymentDate,
      orNumber: p.orNumber,
      payer: p.consumer
        ? `${p.consumer.accountNumber} — ${p.consumer.lastName}, ${p.consumer.firstName}`
        : (p.payerName ?? 'Walk-in'),
      method: p.paymentMethod.replace('_', ' '),
      components: p.allocations
        .map(
          (a) => a.bill?.billNumber ?? (a.collectionTypeId ? typeName.get(a.collectionTypeId) : ''),
        )
        .filter(Boolean)
        .join(', '),
      amount: Number(p.totalAmount),
      batch: p.collectionBatchId ? (batchName.get(p.collectionBatchId) ?? '') : '',
    }));
    return {
      title: 'Collection Register',
      columns: [
        { key: 'paymentDate', label: 'Date', kind: 'date' },
        { key: 'orNumber', label: 'OR #' },
        { key: 'payer', label: 'Payer' },
        { key: 'method', label: 'Method' },
        { key: 'components', label: 'For' },
        { key: 'amount', label: 'Amount', kind: 'money', align: 'right' },
        { key: 'batch', label: 'Batch' },
      ],
      rows,
      totals: this.sum(rows, ['amount']),
    };
  }

  private async depositRegister(orgId: string, from?: string, to?: string): Promise<Report> {
    const depositDate = this.range(from, to);
    const deposits = await this.prisma.collectionDeposit.findMany({
      where: { organizationId: orgId, ...(depositDate ? { depositDate } : {}) },
      orderBy: { depositDate: 'desc' },
    });
    const batchIds = [
      ...new Set(deposits.map((d) => d.collectionBatchId).filter((x): x is string => !!x)),
    ];
    const batches = batchIds.length
      ? await this.prisma.collectionAccountingBatch.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, batchNumber: true },
        })
      : [];
    const batchName = new Map(batches.map((b) => [b.id, b.batchNumber]));
    const jevMap = await this.jevNumbers(deposits.map((d) => d.jevId));

    const rows = deposits.map((d) => ({
      depositDate: d.depositDate,
      slip: d.depositSlipNumber ?? '',
      bankRef: d.bankReference ?? '',
      batch: d.collectionBatchId ? (batchName.get(d.collectionBatchId) ?? '') : '',
      amount: Number(d.depositAmount),
      jev: d.jevId ? (jevMap.get(d.jevId) ?? '') : '',
      status: d.status,
    }));
    return {
      title: 'Deposit Register',
      columns: [
        { key: 'depositDate', label: 'Deposit Date', kind: 'date' },
        { key: 'slip', label: 'Slip #' },
        { key: 'bankRef', label: 'Bank Ref' },
        { key: 'batch', label: 'Batch' },
        { key: 'amount', label: 'Amount', kind: 'money', align: 'right' },
        { key: 'jev', label: 'JEV' },
        { key: 'status', label: 'Status' },
      ],
      rows,
      totals: this.sum(rows, ['amount']),
    };
  }

  private async postingRegister(orgId: string, from?: string, to?: string): Promise<Report> {
    const collectionDate = this.range(from, to);
    const batches = await this.prisma.collectionAccountingBatch.findMany({
      where: {
        organizationId: orgId,
        status: 'posted',
        ...(collectionDate ? { collectionDate } : {}),
      },
      orderBy: { collectionDate: 'desc' },
      select: { batchNumber: true, collectionDate: true, jevId: true },
    });
    const jevIds = batches.map((b) => b.jevId).filter((x): x is string => !!x);
    const jevs = jevIds.length
      ? await this.prisma.journalEntryVoucher.findMany({
          where: { id: { in: jevIds } },
          select: { id: true, jevNumber: true, lines: true },
        })
      : [];
    const jevById = new Map(jevs.map((j) => [j.id, j]));
    const acctIds = [...new Set(jevs.flatMap((j) => j.lines.map((l) => l.chartOfAccountId)))];
    const accts = acctIds.length
      ? await this.prisma.chartOfAccount.findMany({
          where: { id: { in: acctIds } },
          select: { id: true, accountCode: true, name: true },
        })
      : [];
    const acctById = new Map(accts.map((a) => [a.id, a]));

    const rows: Array<Record<string, unknown>> = [];
    for (const b of batches) {
      const jev = b.jevId ? jevById.get(b.jevId) : null;
      if (!jev) continue;
      for (const l of jev.lines) {
        const a = acctById.get(l.chartOfAccountId);
        rows.push({
          collectionDate: b.collectionDate,
          batch: b.batchNumber,
          jev: jev.jevNumber,
          account: `${a?.accountCode ?? '?'} ${a?.name ?? ''}`.trim(),
          debit: Number(l.debitAmount),
          credit: Number(l.creditAmount),
        });
      }
    }
    return {
      title: 'Collection Posting Register',
      columns: [
        { key: 'collectionDate', label: 'Date', kind: 'date' },
        { key: 'batch', label: 'Batch' },
        { key: 'jev', label: 'JEV' },
        { key: 'account', label: 'Account' },
        { key: 'debit', label: 'Debit', kind: 'money', align: 'right' },
        { key: 'credit', label: 'Credit', kind: 'money', align: 'right' },
      ],
      rows,
      totals: this.sum(rows, ['debit', 'credit']),
    };
  }

  /** Posted batches whose physical (cash + check) collections are not yet fully deposited. */
  private async undeposited(orgId: string, from?: string, to?: string): Promise<Report> {
    const collectionDate = this.range(from, to);
    const batches = await this.prisma.collectionAccountingBatch.findMany({
      where: {
        organizationId: orgId,
        status: 'posted',
        ...(collectionDate ? { collectionDate } : {}),
      },
      orderBy: { collectionDate: 'asc' },
      select: {
        id: true,
        batchNumber: true,
        collectionDate: true,
        cashAmount: true,
        checkAmount: true,
        cashierId: true,
      },
    });
    const deposits = await this.prisma.collectionDeposit.findMany({
      where: { organizationId: orgId, collectionBatchId: { in: batches.map((b) => b.id) } },
      select: { collectionBatchId: true, depositAmount: true },
    });
    const depByBatch = new Map<string, number>();
    for (const d of deposits) {
      if (!d.collectionBatchId) continue;
      depByBatch.set(
        d.collectionBatchId,
        (depByBatch.get(d.collectionBatchId) ?? 0) + Number(d.depositAmount),
      );
    }
    const cashierName = await this.userNames(batches.map((b) => b.cashierId));
    const today = new Date();
    const rows: Array<Record<string, unknown>> = [];
    for (const b of batches) {
      const physical = round2(Number(b.cashAmount) + Number(b.checkAmount));
      const deposited = round2(depByBatch.get(b.id) ?? 0);
      const undeposited = round2(physical - deposited);
      if (undeposited <= 0.005) continue;
      const ageDays = Math.max(
        0,
        Math.floor((today.getTime() - new Date(b.collectionDate).getTime()) / 86400000),
      );
      rows.push({
        batchNumber: b.batchNumber,
        collectionDate: b.collectionDate,
        cashier: cashierName.get(b.cashierId) ?? '',
        physical,
        deposited,
        undeposited,
        ageDays,
      });
    }
    return {
      title: 'Undeposited Collections',
      columns: [
        { key: 'batchNumber', label: 'Batch #' },
        { key: 'collectionDate', label: 'Collection Date', kind: 'date' },
        { key: 'cashier', label: 'Cashier' },
        { key: 'physical', label: 'Physical Collectible', kind: 'money', align: 'right' },
        { key: 'deposited', label: 'Deposited', kind: 'money', align: 'right' },
        { key: 'undeposited', label: 'Undeposited', kind: 'money', align: 'right' },
        { key: 'ageDays', label: 'Age (days)', kind: 'number', align: 'right' },
      ],
      rows,
      totals: this.sum(rows, ['physical', 'deposited', 'undeposited']),
    };
  }

  /** Valid collections grouped by tender type. */
  private async byMethod(orgId: string, from?: string, to?: string): Promise<Report> {
    const paymentDate = this.range(from, to);
    const grouped = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: { organizationId: orgId, status: 'valid', ...(paymentDate ? { paymentDate } : {}) },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    const rows = grouped
      .map((g) => ({
        method: g.paymentMethod.replace('_', ' '),
        count: g._count._all,
        amount: round2(Number(g._sum.totalAmount ?? 0)),
      }))
      .sort((a, b) => b.amount - a.amount);
    return {
      title: 'Collections by Payment Method',
      columns: [
        { key: 'method', label: 'Payment Method' },
        { key: 'count', label: 'Receipts', kind: 'number', align: 'right' },
        { key: 'amount', label: 'Amount', kind: 'money', align: 'right' },
      ],
      rows,
      totals: this.sum(rows, ['count', 'amount']),
    };
  }

  /**
   * Valid collections grouped by what they settle — water-bill A/R vs. each
   * non-revenue collection type — with the GL nature so the revenue-recognition
   * split is visible (A/R settlements are not new income).
   */
  private async byType(orgId: string, from?: string, to?: string): Promise<Report> {
    const paymentDate = this.range(from, to);
    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, status: 'valid', ...(paymentDate ? { paymentDate } : {}) },
      select: {
        allocations: { select: { billId: true, collectionTypeId: true, amountApplied: true } },
      },
    });
    const types = await this.prisma.collectionType.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, nature: true },
    });
    const typeById = new Map(types.map((t) => [t.id, t]));
    const acc = new Map<string, { label: string; nature: string; count: number; amount: number }>();
    const bump = (key: string, label: string, nature: string, amt: number) => {
      const cur = acc.get(key) ?? { label, nature, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += amt;
      acc.set(key, cur);
    };
    for (const p of payments) {
      for (const a of p.allocations) {
        const amt = Number(a.amountApplied);
        if (a.billId) {
          bump('__bill__', 'Water Bills', 'receivable_settlement', amt);
        } else if (a.collectionTypeId) {
          const t = typeById.get(a.collectionTypeId);
          bump(a.collectionTypeId, t?.name ?? 'Unknown type', t?.nature ?? 'income', amt);
        } else {
          bump('__unmapped__', 'Unmapped', 'income', amt);
        }
      }
    }
    const natureLabel: Record<string, string> = {
      receivable_settlement: 'A/R settlement',
      income: 'Income',
      liability: 'Liability',
    };
    const rows = [...acc.values()]
      .map((v) => ({
        type: v.label,
        nature: natureLabel[v.nature] ?? v.nature,
        count: v.count,
        amount: round2(v.amount),
      }))
      .sort((a, b) => b.amount - a.amount);
    return {
      title: 'Collections by Type',
      columns: [
        { key: 'type', label: 'Collection Type' },
        { key: 'nature', label: 'Nature' },
        { key: 'count', label: 'Allocations', kind: 'number', align: 'right' },
        { key: 'amount', label: 'Amount', kind: 'money', align: 'right' },
      ],
      rows,
      totals: this.sum(rows, ['count', 'amount']),
    };
  }

  /** Per-cashier accountability across posted collection days. */
  private async cashierAccountability(orgId: string, from?: string, to?: string): Promise<Report> {
    const collectionDate = this.range(from, to);
    const batches = await this.prisma.collectionAccountingBatch.findMany({
      where: {
        organizationId: orgId,
        status: 'posted',
        ...(collectionDate ? { collectionDate } : {}),
      },
      select: {
        id: true,
        cashierId: true,
        cashAmount: true,
        checkAmount: true,
        totalCollections: true,
      },
    });
    const deposits = await this.prisma.collectionDeposit.findMany({
      where: { organizationId: orgId, collectionBatchId: { in: batches.map((b) => b.id) } },
      select: { collectionBatchId: true, depositAmount: true },
    });
    const depByBatch = new Map<string, number>();
    for (const d of deposits) {
      if (!d.collectionBatchId) continue;
      depByBatch.set(
        d.collectionBatchId,
        (depByBatch.get(d.collectionBatchId) ?? 0) + Number(d.depositAmount),
      );
    }
    const acc = new Map<
      string,
      { batches: number; gross: number; physical: number; deposited: number }
    >();
    for (const b of batches) {
      const cur = acc.get(b.cashierId) ?? { batches: 0, gross: 0, physical: 0, deposited: 0 };
      cur.batches += 1;
      cur.gross += Number(b.totalCollections);
      cur.physical += Number(b.cashAmount) + Number(b.checkAmount);
      cur.deposited += depByBatch.get(b.id) ?? 0;
      acc.set(b.cashierId, cur);
    }
    const names = await this.userNames([...acc.keys()]);
    const rows = [...acc.entries()]
      .map(([cashierId, v]) => ({
        cashier: names.get(cashierId) ?? cashierId,
        batches: v.batches,
        gross: round2(v.gross),
        deposited: round2(v.deposited),
        undeposited: round2(v.physical - v.deposited),
      }))
      .sort((a, b) => b.gross - a.gross);
    return {
      title: 'Cashier Accountability',
      columns: [
        { key: 'cashier', label: 'Cashier' },
        { key: 'batches', label: 'Days Posted', kind: 'number', align: 'right' },
        { key: 'gross', label: 'Gross Collections', kind: 'money', align: 'right' },
        { key: 'deposited', label: 'Deposited', kind: 'money', align: 'right' },
        { key: 'undeposited', label: 'Undeposited (cash/check)', kind: 'money', align: 'right' },
      ],
      rows,
      totals: this.sum(rows, ['batches', 'gross', 'deposited', 'undeposited']),
    };
  }

  /** Control register of voided receipts and reversed collection batches. */
  private async exceptions(orgId: string, from?: string, to?: string): Promise<Report> {
    const window = this.range(from, to);
    const voided = await this.prisma.payment.findMany({
      where: {
        organizationId: orgId,
        status: 'voided',
        ...(window ? { paymentDate: window } : {}),
      },
      select: {
        paymentDate: true,
        orNumber: true,
        totalAmount: true,
        voidReason: true,
        voidedBy: true,
      },
      orderBy: { paymentDate: 'desc' },
    });
    const reversed = await this.prisma.collectionAccountingBatch.findMany({
      where: {
        organizationId: orgId,
        status: 'reversed',
        ...(window ? { collectionDate: window } : {}),
      },
      select: { batchNumber: true, collectionDate: true, totalCollections: true, remarks: true },
      orderBy: { collectionDate: 'desc' },
    });
    const names = await this.userNames(voided.map((v) => v.voidedBy));
    const rows: Array<Record<string, unknown>> = [];
    for (const v of voided) {
      rows.push({
        date: v.paymentDate,
        entryType: 'Voided receipt',
        ref: v.orNumber,
        amount: Number(v.totalAmount),
        reason: v.voidReason ?? '',
        by: v.voidedBy ? (names.get(v.voidedBy) ?? '') : '',
      });
    }
    for (const r of reversed) {
      rows.push({
        date: r.collectionDate,
        entryType: 'Reversed batch',
        ref: r.batchNumber,
        amount: Number(r.totalCollections),
        reason: r.remarks ?? '',
        by: '',
      });
    }
    rows.sort((a, b) => new Date(b.date as Date).getTime() - new Date(a.date as Date).getTime());
    return {
      title: 'Voided & Reversed Register',
      columns: [
        { key: 'date', label: 'Date', kind: 'date' },
        { key: 'entryType', label: 'Type' },
        { key: 'ref', label: 'Reference' },
        { key: 'amount', label: 'Amount', kind: 'money', align: 'right' },
        { key: 'reason', label: 'Reason' },
        { key: 'by', label: 'By' },
      ],
      rows,
      totals: this.sum(rows, ['amount']),
    };
  }

  private sum(rows: Array<Record<string, unknown>>, keys: string[]) {
    const totals: Record<string, number> = {};
    for (const k of keys) {
      totals[k] = round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
    }
    return totals;
  }
}

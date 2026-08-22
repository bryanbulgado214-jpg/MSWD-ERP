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
      default:
        throw new BadRequestException(`Unknown report "${kind}".`);
    }
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

  private sum(rows: Array<Record<string, unknown>>, keys: string[]) {
    const totals: Record<string, number> = {};
    for (const k of keys) {
      totals[k] = round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
    }
    return totals;
  }
}

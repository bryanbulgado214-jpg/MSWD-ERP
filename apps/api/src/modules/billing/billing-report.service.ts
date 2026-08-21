import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class BillingReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getCollectionSummary(orgId: string, startDate: string, endDate: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId: orgId,
        status: 'valid',
        paymentDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        consumer: {
          select: { accountNumber: true, firstName: true, lastName: true, consumerType: true },
        },
        cashier: { select: { username: true } },
        allocations: {
          include: {
            bill: { select: { billNumber: true, billingPeriod: { select: { name: true } } } },
          },
        },
      },
      orderBy: { paymentDate: 'asc' },
    });

    const byMethod: Record<string, number> = {};
    const byCashier: Record<string, number> = {};
    let totalCollected = 0;

    for (const p of payments) {
      const amount = Number(p.totalAmount);
      totalCollected += amount;
      byMethod[p.paymentMethod] = (byMethod[p.paymentMethod] ?? 0) + amount;
      const cashierName = p.cashier?.username ?? 'unknown';
      byCashier[cashierName] = (byCashier[cashierName] ?? 0) + amount;
    }

    return {
      startDate,
      endDate,
      totalCollected,
      paymentCount: payments.length,
      byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })),
      byCashier: Object.entries(byCashier).map(([cashier, amount]) => ({ cashier, amount })),
      payments: payments.map((p) => ({
        orNumber: p.orNumber,
        paymentDate: p.paymentDate,
        consumer: `${p.consumer.accountNumber} — ${p.consumer.lastName}, ${p.consumer.firstName}`,
        consumerType: p.consumer.consumerType,
        amount: p.totalAmount,
        method: p.paymentMethod,
        cashier: p.cashier?.username ?? '',
        bills: p.allocations.map((a) => a.bill.billNumber).join(', '),
      })),
    };
  }

  async getAgingReport(orgId: string) {
    const unpaidBills = await this.prisma.bill.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['unpaid', 'partial'] },
      },
      include: {
        consumer: {
          select: {
            id: true,
            accountNumber: true,
            firstName: true,
            lastName: true,
            consumerType: true,
          },
        },
        billingPeriod: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const today = new Date();
    const results = unpaidBills.map((b) => {
      const dueDate = new Date(b.dueDate);
      const daysOverdue = Math.max(
        0,
        Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      let bracket = 'current';
      if (daysOverdue > 0 && daysOverdue <= 30) bracket = '1-30';
      else if (daysOverdue > 30 && daysOverdue <= 60) bracket = '31-60';
      else if (daysOverdue > 60 && daysOverdue <= 90) bracket = '61-90';
      else if (daysOverdue > 90) bracket = '90+';

      return {
        consumerId: b.consumer.id,
        accountNumber: b.consumer.accountNumber,
        consumer: `${b.consumer.lastName}, ${b.consumer.firstName}`,
        consumerType: b.consumer.consumerType,
        billNumber: b.billNumber,
        period: b.billingPeriod.name,
        totalAmount: b.totalAmount,
        amountPaid: b.amountPaid,
        balance: b.balance,
        dueDate: b.dueDate,
        daysOverdue,
        bracket,
      };
    });

    const summary: Record<string, { count: number; total: number }> = {
      current: { count: 0, total: 0 },
      '1-30': { count: 0, total: 0 },
      '31-60': { count: 0, total: 0 },
      '61-90': { count: 0, total: 0 },
      '90+': { count: 0, total: 0 },
    };
    for (const r of results) {
      const entry = summary[r.bracket];
      if (entry) {
        entry.count++;
        entry.total += Number(r.balance);
      }
    }

    return {
      totalOutstanding: results.reduce((s, r) => s + Number(r.balance), 0),
      billCount: results.length,
      summary: Object.entries(summary).map(([bracket, data]) => ({ bracket, ...data })),
      bills: results,
    };
  }

  async getConsumerLedger(orgId: string, consumerId: string) {
    const consumer = await this.prisma.consumer.findFirst({
      where: { id: consumerId, organizationId: orgId },
      select: {
        id: true,
        accountNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        address: true,
        barangay: true,
        consumerType: true,
        status: true,
      },
    });

    const bills = await this.prisma.bill.findMany({
      where: { organizationId: orgId, consumerId },
      include: {
        billingPeriod: { select: { name: true, billingMonth: true, billingYear: true } },
        charges: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, consumerId },
      include: {
        allocations: {
          include: { bill: { select: { billNumber: true } } },
        },
      },
      orderBy: { paymentDate: 'asc' },
    });

    const totalBilled = bills.reduce((s, b) => s + Number(b.totalAmount), 0);
    const totalPaid = payments
      .filter((p) => p.status === 'valid')
      .reduce((s, p) => s + Number(p.totalAmount), 0);

    // Interleaved, date-ordered ledger with a running balance ("passbook" view):
    // a bill charges the account (debit), a valid payment settles it (credit).
    // Voided payments are excluded — they net to zero.
    const rows: Array<{
      date: Date;
      type: 'bill' | 'payment';
      reference: string;
      particulars: string;
      charges: number;
      payments: number;
    }> = [];
    for (const b of bills) {
      rows.push({
        // The billing period's month-end (matches the accrual date) — not the
        // bulk-generation timestamp, which would misorder against payments.
        date: new Date(Date.UTC(b.billingPeriod.billingYear, b.billingPeriod.billingMonth, 0)),
        type: 'bill',
        reference: b.billNumber,
        particulars: `${b.billingPeriod.name} — ${Number(b.consumption)} cu.m.`,
        charges: Number(b.totalAmount),
        payments: 0,
      });
    }
    for (const p of payments) {
      if (p.status !== 'valid') continue;
      rows.push({
        date: p.paymentDate,
        type: 'payment',
        reference: p.orNumber,
        particulars: `Payment — ${p.paymentMethod.replace('_', ' ')}`,
        charges: 0,
        payments: Number(p.totalAmount),
      });
    }
    // Chronological; on the same date a bill is charged before a payment settles it.
    rows.sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() || (a.type === b.type ? 0 : a.type === 'bill' ? -1 : 1),
    );
    let running = 0;
    const ledger = rows.map((r) => {
      running = Math.round((running + r.charges - r.payments) * 100) / 100;
      return {
        date: r.date,
        reference: r.reference,
        particulars: r.particulars,
        charges: r.charges,
        payments: r.payments,
        balance: running,
      };
    });

    return {
      consumer,
      totalBilled,
      totalPaid,
      balance: totalBilled - totalPaid,
      ledger,
      bills: bills.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        period: b.billingPeriod.name,
        totalAmount: b.totalAmount,
        amountPaid: b.amountPaid,
        balance: b.balance,
        dueDate: b.dueDate,
        status: b.status,
        consumption: b.consumption,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        orNumber: p.orNumber,
        paymentDate: p.paymentDate,
        totalAmount: p.totalAmount,
        paymentMethod: p.paymentMethod,
        status: p.status,
        allocations: p.allocations.map((a) => ({
          billNumber: a.bill.billNumber,
          amountApplied: a.amountApplied,
        })),
      })),
    };
  }

  async getBillingSummary(orgId: string, billingPeriodId?: string) {
    const where: Prisma.BillWhereInput = { organizationId: orgId };
    if (billingPeriodId) where.billingPeriodId = billingPeriodId;

    const bills = await this.prisma.bill.findMany({
      where,
      select: {
        totalAmount: true,
        amountPaid: true,
        balance: true,
        status: true,
        consumption: true,
      },
    });

    const totalBilled = bills.reduce((s, b) => s + Number(b.totalAmount), 0);
    const totalCollected = bills.reduce((s, b) => s + Number(b.amountPaid), 0);
    const totalBalance = bills.reduce((s, b) => s + Number(b.balance), 0);
    const totalConsumption = bills.reduce((s, b) => s + Number(b.consumption), 0);

    const byStatus: Record<string, { count: number; amount: number }> = {};
    for (const b of bills) {
      if (!byStatus[b.status]) byStatus[b.status] = { count: 0, amount: 0 };
      const entry = byStatus[b.status]!;
      entry.count++;
      entry.amount += Number(b.totalAmount);
    }

    return {
      totalBills: bills.length,
      totalBilled,
      totalCollected,
      totalBalance,
      totalConsumption,
      collectionRate: totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0,
      byStatus: Object.entries(byStatus).map(([status, data]) => ({ status, ...data })),
    };
  }
}

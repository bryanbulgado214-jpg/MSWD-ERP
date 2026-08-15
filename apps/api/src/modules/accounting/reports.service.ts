import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

interface AgingBracket {
  key: string;
  label: string;
  total: number;
  count: number;
}

@Injectable()
export class AccountingReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accounts-payable aging. Outstanding payables are the Disbursement Vouchers
   * not yet settled by a released/cleared check, aged by DV date.
   */
  async apAging(organizationId: string) {
    const dvs = await this.prisma.disbursementVoucher.findMany({
      where: { organizationId },
      select: {
        dvNumber: true,
        dvDate: true,
        payeeName: true,
        netAmount: true,
        status: true,
        supplier: { select: { name: true } },
        checks: { select: { status: true } },
      },
      orderBy: { dvDate: 'asc' },
    });

    const today = new Date();
    const brackets: (AgingBracket & { min: number; max: number })[] = [
      { key: 'current', label: '0–30 days', min: 0, max: 30, total: 0, count: 0 },
      { key: 'd31_60', label: '31–60 days', min: 31, max: 60, total: 0, count: 0 },
      { key: 'd61_90', label: '61–90 days', min: 61, max: 90, total: 0, count: 0 },
      {
        key: 'over90',
        label: 'Over 90 days',
        min: 91,
        max: Number.POSITIVE_INFINITY,
        total: 0,
        count: 0,
      },
    ];

    const rows: Array<{
      dvNumber: string;
      dvDate: Date;
      payee: string;
      amount: string;
      ageDays: number;
      bracket: string;
    }> = [];
    let total = 0;

    for (const dv of dvs) {
      const paid = dv.checks.some((c) => c.status === 'released' || c.status === 'cleared');
      if (paid) continue; // settled — no longer an open payable
      const ageDays = Math.max(
        0,
        Math.floor((today.getTime() - new Date(dv.dvDate).getTime()) / 86_400_000),
      );
      const amount = Number(dv.netAmount);
      const bucket = brackets.find((b) => ageDays >= b.min && ageDays <= b.max)!;
      bucket.total += amount;
      bucket.count += 1;
      total += amount;
      rows.push({
        dvNumber: dv.dvNumber,
        dvDate: dv.dvDate,
        payee: dv.supplier?.name ?? dv.payeeName ?? '—',
        amount: dv.netAmount.toString(),
        ageDays,
        bracket: bucket.key,
      });
    }

    return {
      asOf: today.toISOString().slice(0, 10),
      total,
      brackets: brackets.map(({ min: _min, max: _max, ...b }) => b),
      rows,
    };
  }
}

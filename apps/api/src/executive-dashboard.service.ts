import { Injectable } from '@nestjs/common';
import type { PurchaseRequestStatus } from '@prisma/client';

import { PrismaService } from './database/prisma.service';

export interface ExecutiveSummary {
  billing: {
    totalBilled: string;
    totalCollected: string;
    collectionRate: number;
    outstandingBalance: string;
    activeConsumers: number;
    disconnectedConsumers: number;
  };
  procurement: {
    activePRs: number;
    activePRValue: string;
    approvedPOs: number;
    approvedPOValue: string;
    releasedDVs: number;
    releasedDVValue: string;
  };
  hr: {
    totalEmployees: number;
    activeEmployees: number;
    onLeave: number;
    totalPayrollGross: string;
    totalPayrollNet: string;
    paidPayrollRuns: number;
  };
  budget: {
    approvedBudget: string;
    totalReleased: string;
    totalObligated: string;
    utilizationRate: number;
  };
  inventory: {
    totalItems: number;
    totalValue: string;
    belowReorder: number;
  };
  accounting: {
    postedJevs: number;
    totalDebits: string;
    recentJevs: Array<{
      id: string;
      jevNumber: string;
      jevDate: string;
      particulars: string;
      totalDebit: string;
      sourceType: string;
    }>;
  };
}

@Injectable()
export class ExecutiveDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string): Promise<ExecutiveSummary> {
    const [billing, procurement, hr, budget, inventory, accounting] =
      await Promise.all([
        this.getBilling(organizationId),
        this.getProcurement(organizationId),
        this.getHr(organizationId),
        this.getBudget(organizationId),
        this.getInventory(organizationId),
        this.getAccounting(organizationId),
      ]);

    return { billing, procurement, hr, budget, inventory, accounting };
  }

  private async getBilling(orgId: string): Promise<ExecutiveSummary['billing']> {
    const [billAgg, paymentAgg, consumerCounts] = await Promise.all([
      this.prisma.bill.aggregate({
        where: { organizationId: orgId, status: { not: 'cancelled' } },
        _sum: { totalAmount: true, balance: true },
      }),
      this.prisma.payment.aggregate({
        where: { organizationId: orgId, status: 'valid' },
        _sum: { totalAmount: true },
      }),
      this.prisma.consumer.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: true,
      }),
    ]);

    const totalBilled = billAgg._sum.totalAmount?.toString() ?? '0';
    const totalCollected = paymentAgg._sum.totalAmount?.toString() ?? '0';
    const outstandingBalance = billAgg._sum.balance?.toString() ?? '0';
    const billedNum = Number(totalBilled);
    const collectedNum = Number(totalCollected);
    const collectionRate = billedNum > 0 ? Math.round((collectedNum / billedNum) * 10000) / 100 : 0;

    const activeConsumers = consumerCounts.find((c) => c.status === 'active')?._count ?? 0;
    const disconnectedConsumers = consumerCounts.find((c) => c.status === 'disconnected')?._count ?? 0;

    return { totalBilled, totalCollected, collectionRate, outstandingBalance, activeConsumers, disconnectedConsumers };
  }

  private async getProcurement(orgId: string): Promise<ExecutiveSummary['procurement']> {
    const terminalStatuses: PurchaseRequestStatus[] = ['cancelled', 'rejected', 'voided', 'completed'];

    const [activePRs, activePRAgg, approvedPOs, approvedPOAgg, releasedDVs, releasedDVAgg] =
      await Promise.all([
        this.prisma.purchaseRequest.count({
          where: { organizationId: orgId, status: { notIn: terminalStatuses } },
        }),
        this.prisma.purchaseRequest.aggregate({
          where: { organizationId: orgId, status: { notIn: terminalStatuses } },
          _sum: { totalAmount: true },
        }),
        this.prisma.purchaseOrder.count({
          where: { organizationId: orgId, status: 'approved' },
        }),
        this.prisma.purchaseOrder.aggregate({
          where: { organizationId: orgId, status: 'approved' },
          _sum: { contractAmount: true },
        }),
        this.prisma.disbursementVoucher.count({
          where: { organizationId: orgId, status: 'released' },
        }),
        this.prisma.disbursementVoucher.aggregate({
          where: { organizationId: orgId, status: 'released' },
          _sum: { netAmount: true },
        }),
      ]);

    return {
      activePRs,
      activePRValue: activePRAgg._sum?.totalAmount?.toString() ?? '0',
      approvedPOs,
      approvedPOValue: approvedPOAgg._sum?.contractAmount?.toString() ?? '0',
      releasedDVs,
      releasedDVValue: releasedDVAgg._sum?.netAmount?.toString() ?? '0',
    };
  }

  private async getHr(orgId: string): Promise<ExecutiveSummary['hr']> {
    const [totalEmployees, activeEmployees, onLeave, payrollAgg, paidRuns] =
      await Promise.all([
        this.prisma.employee.count({ where: { organizationId: orgId } }),
        this.prisma.employee.count({ where: { organizationId: orgId, isActive: true } }),
        this.prisma.employee.count({ where: { organizationId: orgId, employmentStatus: 'on_leave' } }),
        this.prisma.payrollRun.aggregate({
          where: { organizationId: orgId, status: { in: ['approved', 'paid'] } },
          _sum: { totalGross: true, totalNet: true },
        }),
        this.prisma.payrollRun.count({
          where: { organizationId: orgId, status: 'paid' },
        }),
      ]);

    return {
      totalEmployees,
      activeEmployees,
      onLeave,
      totalPayrollGross: payrollAgg._sum.totalGross?.toString() ?? '0',
      totalPayrollNet: payrollAgg._sum.totalNet?.toString() ?? '0',
      paidPayrollRuns: paidRuns,
    };
  }

  private async getBudget(orgId: string): Promise<ExecutiveSummary['budget']> {
    const [budgetAgg, releaseAgg] = await Promise.all([
      this.prisma.budgetHeader.aggregate({
        where: { organizationId: orgId, status: 'approved' },
        _sum: { totalAmount: true },
      }),
      this.prisma.budgetRelease.aggregate({
        where: { organizationId: orgId, status: 'released' },
        _sum: { releasedAmount: true, reservedAmount: true },
      }),
    ]);

    const approvedBudget = budgetAgg._sum.totalAmount?.toString() ?? '0';
    const totalReleased = releaseAgg._sum.releasedAmount?.toString() ?? '0';
    const totalObligated = releaseAgg._sum.reservedAmount?.toString() ?? '0';
    const releasedNum = Number(totalReleased);
    const obligatedNum = Number(totalObligated);
    const utilizationRate = releasedNum > 0 ? Math.round((obligatedNum / releasedNum) * 10000) / 100 : 0;

    return { approvedBudget, totalReleased, totalObligated, utilizationRate };
  }

  private async getInventory(orgId: string): Promise<ExecutiveSummary['inventory']> {
    const [totalItems, items] = await Promise.all([
      this.prisma.inventoryItem.count({
        where: { organizationId: orgId, isActive: true },
      }),
      this.prisma.inventoryItem.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { onHandQuantity: true, unitCost: true, reorderPoint: true },
      }),
    ]);

    let totalValue = 0;
    let belowReorder = 0;
    for (const item of items) {
      totalValue += Number(item.onHandQuantity) * Number(item.unitCost);
      if (Number(item.onHandQuantity) < Number(item.reorderPoint)) {
        belowReorder++;
      }
    }

    return {
      totalItems,
      totalValue: totalValue.toFixed(2),
      belowReorder,
    };
  }

  private async getAccounting(orgId: string): Promise<ExecutiveSummary['accounting']> {
    const [postedJevs, jevAgg, recentJevs] = await Promise.all([
      this.prisma.journalEntryVoucher.count({
        where: { organizationId: orgId, status: 'posted' },
      }),
      this.prisma.journalEntryVoucher.aggregate({
        where: { organizationId: orgId, status: 'posted' },
        _sum: { totalDebit: true },
      }),
      this.prisma.journalEntryVoucher.findMany({
        where: { organizationId: orgId, status: 'posted' },
        orderBy: { jevDate: 'desc' },
        take: 5,
        select: {
          id: true,
          jevNumber: true,
          jevDate: true,
          particulars: true,
          totalDebit: true,
          sourceType: true,
        },
      }),
    ]);

    return {
      postedJevs,
      totalDebits: jevAgg._sum.totalDebit?.toString() ?? '0',
      recentJevs: recentJevs.map((j) => ({
        id: j.id,
        jevNumber: j.jevNumber,
        jevDate: j.jevDate.toISOString(),
        particulars: j.particulars,
        totalDebit: j.totalDebit.toString(),
        sourceType: j.sourceType,
      })),
    };
  }
}

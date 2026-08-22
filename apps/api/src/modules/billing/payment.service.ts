import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';

// The 10% late penalty accrues on the 25th of the bill's due month: a customer
// has the first 24 days to pay; an unpaid bill is penalized on the 25th onward.
export function penaltyDateFor(dueDate: Date): Date {
  return new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 25));
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  async findByConsumer(orgId: string, consumerId: string) {
    return this.prisma.payment.findMany({
      where: { organizationId: orgId, consumerId },
      include: {
        consumer: { select: { id: true, accountNumber: true, firstName: true, lastName: true } },
        cashier: { select: { id: true, username: true } },
        allocations: {
          include: {
            bill: { select: { id: true, billNumber: true, billingPeriodId: true } },
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async findRecent(orgId: string, limit = 50) {
    return this.prisma.payment.findMany({
      where: { organizationId: orgId },
      include: {
        consumer: { select: { id: true, accountNumber: true, firstName: true, lastName: true } },
        cashier: { select: { id: true, username: true } },
        allocations: {
          include: {
            bill: { select: { id: true, billNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findOne(orgId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId: orgId },
      include: {
        consumer: {
          select: {
            id: true,
            accountNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            address: true,
            barangay: true,
            consumerType: true,
          },
        },
        cashier: { select: { id: true, username: true } },
        voider: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
        allocations: {
          include: {
            bill: {
              select: {
                id: true,
                billNumber: true,
                totalAmount: true,
                amountPaid: true,
                balance: true,
                status: true,
                billingPeriod: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    return payment;
  }

  async getUnpaidBills(orgId: string, consumerId: string) {
    return this.prisma.bill.findMany({
      where: {
        organizationId: orgId,
        consumerId,
        status: { in: ['unpaid', 'partial'] },
      },
      include: {
        billingPeriod: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async create(
    orgId: string,
    userId: string,
    data: {
      orNumber: string;
      consumerId: string;
      paymentDate: string;
      totalAmount: number;
      paymentMethod: string;
      checkNumber?: string;
      checkDate?: string;
      bankName?: string;
      referenceNumber?: string;
      remarks?: string;
      allocations: Array<{ billId: string; amountApplied: number }>;
    },
  ) {
    const existing = await this.prisma.payment.findFirst({
      where: { organizationId: orgId, orNumber: data.orNumber },
    });
    if (existing) throw new ConflictException(`OR Number "${data.orNumber}" already exists.`);

    const consumer = await this.prisma.consumer.findFirst({
      where: { id: data.consumerId, organizationId: orgId },
    });
    if (!consumer) throw new NotFoundException('Consumer not found.');

    // A bill's balance already includes any 10% late penalty accrued on the 25th
    // (booked to A/R by the accrual JEV), so a collection simply settles A/R —
    // the total tendered equals the sum applied across bills.
    const allocationTotal = data.allocations.reduce((sum, a) => sum + a.amountApplied, 0);
    if (Math.abs(allocationTotal - data.totalAmount) > 0.01) {
      throw new BadRequestException(
        `Total amount (${data.totalAmount}) does not match allocation sum (${allocationTotal}).`,
      );
    }

    for (const alloc of data.allocations) {
      const bill = await this.prisma.bill.findFirst({
        where: { id: alloc.billId, organizationId: orgId, consumerId: data.consumerId },
      });
      if (!bill) throw new NotFoundException(`Bill not found: ${alloc.billId}`);
      const currentBalance = Number(bill.balance);
      if (alloc.amountApplied > currentBalance + 0.01) {
        throw new BadRequestException(
          `Payment of ${alloc.amountApplied} exceeds balance of ${currentBalance} on bill ${bill.billNumber}.`,
        );
      }
    }

    return runAudited(this.prisma, userId, async (tx) => {
      const payment = await tx.payment.create({
        data: {
          organizationId: orgId,
          orNumber: data.orNumber,
          consumerId: data.consumerId,
          paymentDate: new Date(data.paymentDate),
          totalAmount: data.totalAmount,
          paymentMethod: data.paymentMethod as 'cash' | 'check' | 'online' | 'bank_deposit',
          ...(data.checkNumber ? { checkNumber: data.checkNumber } : {}),
          ...(data.checkDate ? { checkDate: new Date(data.checkDate) } : {}),
          ...(data.bankName ? { bankName: data.bankName } : {}),
          ...(data.referenceNumber ? { referenceNumber: data.referenceNumber } : {}),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          cashierId: userId,
          createdBy: userId,
          updatedBy: userId,
          allocations: {
            createMany: {
              data: data.allocations.map((a) => ({
                billId: a.billId,
                amountApplied: a.amountApplied,
              })),
            },
          },
        },
      });

      for (const alloc of data.allocations) {
        const bill = await tx.bill.findUniqueOrThrow({ where: { id: alloc.billId } });
        const newPaid = Number(bill.amountPaid) + alloc.amountApplied;
        // Owed = principal + accrued penalty − paid.
        const newBalance = Number(bill.totalAmount) + Number(bill.penaltyAmount) - newPaid;
        const newStatus = newBalance <= 0.01 ? 'paid' : 'partial';

        await tx.bill.update({
          where: { id: alloc.billId },
          data: {
            amountPaid: newPaid,
            balance: Math.max(0, newBalance),
            status: newStatus,
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      }

      // Post the collection: Dr Cash-Collecting Officers, Cr A/R. Any penalty was
      // already recognised as income when it accrued, so it just settles A/R.
      await this.autoJev.onPaymentReceived(tx, orgId, userId, {
        id: payment.id,
        orNumber: payment.orNumber,
        paymentDate: payment.paymentDate,
        totalAmount: Number(payment.totalAmount),
      });

      return payment;
    });
  }

  async voidPayment(
    orgId: string,
    userId: string,
    paymentId: string,
    expectedVersion: number,
    voidReason: string,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId: orgId },
      include: { allocations: true },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    if (payment.status === 'voided') throw new BadRequestException('Payment is already voided.');
    if (payment.version !== expectedVersion)
      throw new ConflictException('Payment was modified — please reload.');

    return runAudited(this.prisma, userId, async (tx) => {
      for (const alloc of payment.allocations) {
        const bill = await tx.bill.findUniqueOrThrow({ where: { id: alloc.billId } });
        const newPaid = Math.max(0, Number(bill.amountPaid) - Number(alloc.amountApplied));
        const newBalance = Number(bill.totalAmount) + Number(bill.penaltyAmount) - newPaid;
        const newStatus = newPaid <= 0.01 ? 'unpaid' : 'partial';

        await tx.bill.update({
          where: { id: alloc.billId },
          data: {
            amountPaid: newPaid,
            balance: newBalance,
            status: newStatus,
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
      }

      const voided = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: userId,
          voidReason,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });

      // Reverse the collection: Dr A/R, Cr Cash-Collecting Officers. Any penalty
      // stays accrued on the reinstated bill balance (its own JEV is untouched).
      await this.autoJev.onPaymentVoided(tx, orgId, userId, {
        id: payment.id,
        orNumber: payment.orNumber,
        totalAmount: Number(payment.totalAmount),
        voidDate: new Date(),
      });

      return voided;
    });
  }

  async getNextOrNumber(orgId: string) {
    // Only auto-number within our own "OR-#######" series. Foreign OR formats
    // (e.g. migrated/seed "SMP-OR-0001") are deliberately ignored: mixing them in
    // — as the old lexicographic "take the last row and +1 its suffix" did — could
    // suggest an OR number that already exists (SMP-OR-0003 sorts above OR-0000004,
    // so its suffix 3 yielded a duplicate OR-0000004). Taking the true numeric max
    // of the OR- series guarantees the suggestion is free.
    const rows = await this.prisma.payment.findMany({
      where: { organizationId: orgId, orNumber: { startsWith: 'OR-' } },
      select: { orNumber: true },
    });
    let maxNum = 0;
    for (const { orNumber } of rows) {
      const match = orNumber.match(/^OR-(\d+)$/);
      if (match) {
        const n = parseInt(match[1]!, 10);
        if (n > maxNum) maxNum = n;
      }
    }
    return { nextOrNumber: `OR-${String(maxNum + 1).padStart(7, '0')}` };
  }
}

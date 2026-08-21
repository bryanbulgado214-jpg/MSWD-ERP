import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';
import { runAudited } from '../budgeting/audit-actor.util';

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
        const newBalance = Number(bill.totalAmount) - newPaid;
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

      // Post the collection: Dr Cash-Collecting Officers, Cr A/R.
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
        const newBalance = Number(bill.totalAmount) - newPaid;
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

      // Reverse the collection: Dr A/R, Cr Cash-Collecting Officers.
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
    const last = await this.prisma.payment.findFirst({
      where: { organizationId: orgId },
      orderBy: { orNumber: 'desc' },
      select: { orNumber: true },
    });
    let nextNum = 1;
    if (last) {
      const match = last.orNumber.match(/\d+$/);
      if (match) nextNum = parseInt(match[0], 10) + 1;
    }
    return { nextOrNumber: `OR-${String(nextNum).padStart(7, '0')}` };
  }
}

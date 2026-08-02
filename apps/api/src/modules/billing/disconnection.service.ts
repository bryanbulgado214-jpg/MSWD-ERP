import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

@Injectable()
export class DisconnectionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string, status?: string) {
    return this.prisma.disconnectionOrder.findMany({
      where: {
        organizationId: orgId,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        consumer: {
          select: { id: true, accountNumber: true, firstName: true, lastName: true, consumerType: true, status: true },
        },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const order = await this.prisma.disconnectionOrder.findFirst({
      where: { id, organizationId: orgId },
      include: {
        consumer: {
          select: {
            id: true, accountNumber: true, firstName: true, middleName: true, lastName: true,
            address: true, barangay: true, consumerType: true, status: true,
          },
        },
        server: { select: { id: true, username: true } },
        disconnector: { select: { id: true, username: true } },
        reconnector: { select: { id: true, username: true } },
        canceller: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
      },
    });
    if (!order) throw new NotFoundException('Disconnection order not found.');
    return order;
  }

  async getConsumersInArrears(orgId: string) {
    const consumers = await this.prisma.consumer.findMany({
      where: {
        organizationId: orgId,
        status: 'active',
        bills: {
          some: { status: { in: ['unpaid', 'partial'] } },
        },
      },
      select: {
        id: true,
        accountNumber: true,
        firstName: true,
        lastName: true,
        consumerType: true,
        bills: {
          where: { status: { in: ['unpaid', 'partial'] } },
          select: { id: true, billNumber: true, balance: true, dueDate: true, billingPeriod: { select: { name: true } } },
          orderBy: { dueDate: 'asc' },
        },
      },
      orderBy: { accountNumber: 'asc' },
    });

    return consumers.map((c) => ({
      ...c,
      totalArrears: c.bills.reduce((sum, b) => sum + Number(b.balance), 0),
      unpaidCount: c.bills.length,
    }));
  }

  async create(
    orgId: string,
    userId: string,
    data: { consumerId: string; noticeDate: string; scheduledDate: string; remarks?: string },
  ) {
    const consumer = await this.prisma.consumer.findFirst({
      where: { id: data.consumerId, organizationId: orgId },
    });
    if (!consumer) throw new NotFoundException('Consumer not found.');

    const unpaidBills = await this.prisma.bill.findMany({
      where: { organizationId: orgId, consumerId: data.consumerId, status: { in: ['unpaid', 'partial'] } },
      select: { balance: true },
    });
    const totalArrears = unpaidBills.reduce((sum, b) => sum + Number(b.balance), 0);

    const lastOrder = await this.prisma.disconnectionOrder.findFirst({
      where: { organizationId: orgId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    let nextNum = 1;
    if (lastOrder) {
      const match = lastOrder.orderNumber.match(/\d+$/);
      if (match) nextNum = parseInt(match[0], 10) + 1;
    }
    const orderNumber = `DC-${String(nextNum).padStart(7, '0')}`;

    return runAudited(this.prisma, userId, async (tx) => {
      return tx.disconnectionOrder.create({
        data: {
          organizationId: orgId,
          orderNumber,
          consumerId: data.consumerId,
          noticeDate: new Date(data.noticeDate),
          scheduledDate: new Date(data.scheduledDate),
          totalArrears,
          ...(data.remarks ? { remarks: data.remarks } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
      });
    });
  }

  async transition(
    orgId: string,
    userId: string,
    id: string,
    data: { expectedVersion: number; action: string; date?: string; reason?: string; reconnectionFee?: number },
  ) {
    const order = await this.prisma.disconnectionOrder.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!order) throw new NotFoundException('Disconnection order not found.');
    if (order.version !== data.expectedVersion) throw new ConflictException('Record was modified — please reload.');

    const actionDate = data.date ? new Date(data.date) : new Date();

    return runAudited(this.prisma, userId, async (tx) => {
      switch (data.action) {
        case 'serve':
          if (order.status !== 'notice_issued') throw new BadRequestException('Can only serve a notice that is issued.');
          return tx.disconnectionOrder.update({
            where: { id },
            data: { status: 'served', servedDate: actionDate, servedBy: userId, updatedBy: userId, version: { increment: 1 } },
          });

        case 'disconnect':
          if (order.status !== 'served') throw new BadRequestException('Can only disconnect after notice is served.');
          await tx.consumer.update({
            where: { id: order.consumerId },
            data: { status: 'disconnected', updatedBy: userId, version: { increment: 1 } },
          });
          return tx.disconnectionOrder.update({
            where: { id },
            data: { status: 'disconnected', disconnectedDate: actionDate, disconnectedBy: userId, updatedBy: userId, version: { increment: 1 } },
          });

        case 'reconnect':
          if (order.status !== 'disconnected') throw new BadRequestException('Can only reconnect a disconnected account.');
          await tx.consumer.update({
            where: { id: order.consumerId },
            data: { status: 'active', updatedBy: userId, version: { increment: 1 } },
          });
          return tx.disconnectionOrder.update({
            where: { id },
            data: {
              status: 'reconnected',
              reconnectedDate: actionDate,
              reconnectedBy: userId,
              ...(data.reconnectionFee != null ? { reconnectionFee: data.reconnectionFee } : {}),
              updatedBy: userId,
              version: { increment: 1 },
            },
          });

        case 'cancel':
          if (order.status === 'reconnected' || order.status === 'cancelled')
            throw new BadRequestException('Cannot cancel this order.');
          if (order.status === 'disconnected') {
            await tx.consumer.update({
              where: { id: order.consumerId },
              data: { status: 'active', updatedBy: userId, version: { increment: 1 } },
            });
          }
          return tx.disconnectionOrder.update({
            where: { id },
            data: {
              status: 'cancelled',
              cancelledDate: actionDate,
              cancelledBy: userId,
              ...(data.reason ? { cancelReason: data.reason } : {}),
              updatedBy: userId,
              version: { increment: 1 },
            },
          });

        default:
          throw new BadRequestException(`Unknown action: ${data.action}`);
      }
    });
  }

  async applyPenalties(orgId: string, userId: string) {
    const overdueBills = await this.prisma.bill.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['unpaid', 'partial'] },
        penaltyDate: { lte: new Date() },
        penaltyAmount: 0,
      },
      include: {
        billingPeriod: { select: { name: true } },
      },
    });

    if (overdueBills.length === 0) return { applied: 0 };

    let applied = 0;
    await runAudited(this.prisma, userId, async (tx) => {
      for (const bill of overdueBills) {
        const penaltyRate = 0.10;
        const penaltyAmount = Number(bill.totalAmount) * penaltyRate;
        const newTotal = Number(bill.totalAmount) + penaltyAmount;
        const newBalance = newTotal - Number(bill.amountPaid);

        await tx.billCharge.create({
          data: {
            billId: bill.id,
            chargeType: 'penalty',
            description: `Late payment penalty (10%)`,
            amount: penaltyAmount,
            sortOrder: 10,
          },
        });

        await tx.bill.update({
          where: { id: bill.id },
          data: {
            penaltyAmount,
            totalAmount: newTotal,
            balance: newBalance,
            status: newBalance > 0.01 ? (Number(bill.amountPaid) > 0 ? 'partial' : 'unpaid') : 'paid',
            updatedBy: userId,
            version: { increment: 1 },
          },
        });
        applied++;
      }
    });

    return { applied };
  }
}

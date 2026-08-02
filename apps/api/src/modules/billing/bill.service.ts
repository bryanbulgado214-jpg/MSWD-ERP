import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const SENIOR_DISCOUNT_PERCENT = 5;
const PWD_DISCOUNT_PERCENT = 5;

@Injectable()
export class BillService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPeriod(orgId: string, billingPeriodId: string) {
    return this.prisma.bill.findMany({
      where: { organizationId: orgId, billingPeriodId },
      include: {
        consumer: { select: { id: true, accountNumber: true, firstName: true, lastName: true, consumerType: true } },
        meterReading: { select: { id: true, readingDate: true } },
      },
      orderBy: { consumer: { accountNumber: 'asc' } },
    });
  }

  async findByConsumer(orgId: string, consumerId: string) {
    return this.prisma.bill.findMany({
      where: { organizationId: orgId, consumerId },
      include: {
        billingPeriod: { select: { id: true, name: true, billingMonth: true, billingYear: true } },
        charges: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(orgId: string, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId: orgId },
      include: {
        consumer: {
          select: {
            id: true, accountNumber: true, firstName: true, middleName: true, lastName: true,
            address: true, barangay: true, consumerType: true, isSeniorCitizen: true, isPwd: true,
          },
        },
        billingPeriod: { select: { id: true, name: true, billingMonth: true, billingYear: true } },
        meterReading: {
          select: { id: true, readingDate: true, previousReading: true, currentReading: true, consumption: true },
        },
        charges: { orderBy: { sortOrder: 'asc' } },
        creator: { select: { id: true, username: true } },
      },
    });
    if (!bill) throw new NotFoundException('Bill not found.');
    return bill;
  }

  async generateBills(orgId: string, userId: string, billingPeriodId: string) {
    const period = await this.prisma.billingPeriod.findFirst({
      where: { id: billingPeriodId, organizationId: orgId },
    });
    if (!period) throw new NotFoundException('Billing period not found.');
    if (period.status !== 'billing' && period.status !== 'reading')
      throw new BadRequestException('Billing period must be in "reading" or "billing" status to generate bills.');

    const readings = await this.prisma.meterReading.findMany({
      where: {
        organizationId: orgId,
        billingPeriodId,
        status: { in: ['confirmed', 'pending'] },
      },
      include: {
        consumer: {
          select: { id: true, accountNumber: true, consumerType: true, isSeniorCitizen: true, isPwd: true },
        },
      },
    });

    if (readings.length === 0)
      throw new BadRequestException('No meter readings found for this billing period.');

    const existingBills = await this.prisma.bill.findMany({
      where: { organizationId: orgId, billingPeriodId },
      select: { consumerId: true },
    });
    const billedConsumerIds = new Set(existingBills.map((b) => b.consumerId));
    const unbilledReadings = readings.filter((r) => !billedConsumerIds.has(r.consumerId));

    if (unbilledReadings.length === 0)
      throw new BadRequestException('All consumers with readings have already been billed.');

    const rateSchedules = await this.prisma.rateSchedule.findMany({
      where: { organizationId: orgId, isActive: true },
      include: { tiers: { orderBy: { sortOrder: 'asc' } } },
    });

    const rateByType = new Map<string, typeof rateSchedules[number]>();
    for (const rs of rateSchedules) {
      const existing = rateByType.get(rs.consumerType);
      if (!existing || new Date(rs.effectiveDate) > new Date(existing.effectiveDate)) {
        rateByType.set(rs.consumerType, rs);
      }
    }

    const lastBillNumber = await this.prisma.bill.findFirst({
      where: { organizationId: orgId },
      orderBy: { billNumber: 'desc' },
      select: { billNumber: true },
    });
    let nextNum = 1;
    if (lastBillNumber) {
      const match = lastBillNumber.billNumber.match(/\d+$/);
      if (match) nextNum = parseInt(match[0], 10) + 1;
    }

    const results: Array<{ consumerId: string; billNumber: string; totalAmount: number }> = [];

    await runAudited(this.prisma, userId, async (tx) => {
      for (const reading of unbilledReadings) {
        const rate = rateByType.get(reading.consumer.consumerType);
        if (!rate) continue;

        const consumption = Number(reading.consumption);
        const calc = this.calculateCharges(consumption, rate);

        let discountPercent = 0;
        let isSenior = false;
        let isPwd = false;
        if (reading.consumer.isSeniorCitizen) {
          discountPercent = SENIOR_DISCOUNT_PERCENT;
          isSenior = true;
        } else if (reading.consumer.isPwd) {
          discountPercent = PWD_DISCOUNT_PERCENT;
          isPwd = true;
        }
        const discountAmount = calc.waterCharge * (discountPercent / 100);

        const totalAmount = calc.waterCharge + calc.environmentalFee + calc.sewerCharge
          + calc.maintenanceFee - discountAmount;

        const billNumber = `BILL-${String(nextNum).padStart(7, '0')}`;
        nextNum++;

        const charges: Prisma.BillChargeCreateManyBillInput[] = [
          { chargeType: 'water', description: `Water charge (${consumption} cu.m.)`, amount: calc.waterCharge, sortOrder: 1 },
        ];
        if (calc.environmentalFee > 0) {
          charges.push({ chargeType: 'environmental', description: 'Environmental fee', amount: calc.environmentalFee, sortOrder: 2 });
        }
        if (calc.sewerCharge > 0) {
          charges.push({ chargeType: 'sewer', description: 'Sewer charge', amount: calc.sewerCharge, sortOrder: 3 });
        }
        if (calc.maintenanceFee > 0) {
          charges.push({ chargeType: 'maintenance', description: 'Maintenance fee', amount: calc.maintenanceFee, sortOrder: 4 });
        }
        if (discountAmount > 0) {
          charges.push({
            chargeType: isSenior ? 'senior_discount' : 'pwd_discount',
            description: `${isSenior ? 'Senior citizen' : 'PWD'} discount (${discountPercent}%)`,
            amount: -discountAmount,
            sortOrder: 5,
          });
        }

        await tx.bill.create({
          data: {
            organizationId: orgId,
            billNumber,
            consumerId: reading.consumerId,
            billingPeriodId,
            meterReadingId: reading.id,
            previousReading: reading.previousReading,
            currentReading: reading.currentReading,
            consumption: reading.consumption,
            waterCharge: calc.waterCharge,
            environmentalFee: calc.environmentalFee,
            sewerCharge: calc.sewerCharge,
            maintenanceFee: calc.maintenanceFee,
            discountAmount,
            isSeniorDiscount: isSenior,
            isPwdDiscount: isPwd,
            discountPercentage: discountPercent,
            totalAmount,
            balance: totalAmount,
            dueDate: period.dueDate,
            penaltyDate: period.penaltyDate,
            createdBy: userId,
            updatedBy: userId,
            charges: { createMany: { data: charges } },
          },
        });

        results.push({ consumerId: reading.consumerId, billNumber, totalAmount });
      }

      if (period.status === 'reading') {
        await tx.billingPeriod.update({
          where: { id: billingPeriodId },
          data: { status: 'billing', updatedBy: userId, version: { increment: 1 } },
        });
      }
    });

    return { generated: results.length, bills: results };
  }

  private calculateCharges(
    consumption: number,
    rate: {
      minimumCharge: Prisma.Decimal;
      minimumConsumption: Prisma.Decimal;
      environmentalFee: Prisma.Decimal;
      sewerCharge: Prisma.Decimal;
      maintenanceFee: Prisma.Decimal;
      tiers: Array<{
        minConsumption: Prisma.Decimal;
        maxConsumption: Prisma.Decimal | null;
        ratePerCubicMeter: Prisma.Decimal;
      }>;
    },
  ) {
    const minCharge = Number(rate.minimumCharge);
    const minConsumption = Number(rate.minimumConsumption);

    let waterCharge = 0;
    if (consumption <= minConsumption) {
      waterCharge = minCharge;
    } else {
      waterCharge = minCharge;
      for (const tier of rate.tiers) {
        const tierMin = Number(tier.minConsumption);
        const tierMax = tier.maxConsumption ? Number(tier.maxConsumption) : Infinity;
        const tierRate = Number(tier.ratePerCubicMeter);

        if (tierMin > consumption) break;
        if (tierMin < minConsumption) continue;

        const effectiveMin = Math.max(tierMin, minConsumption);
        const effectiveMax = Math.min(tierMax, consumption);
        if (effectiveMax <= effectiveMin) continue;

        const cubicMeters = effectiveMax - effectiveMin;
        waterCharge += cubicMeters * tierRate;
      }
    }

    return {
      waterCharge: Math.round(waterCharge * 100) / 100,
      environmentalFee: Number(rate.environmentalFee),
      sewerCharge: Number(rate.sewerCharge),
      maintenanceFee: Number(rate.maintenanceFee),
    };
  }
}

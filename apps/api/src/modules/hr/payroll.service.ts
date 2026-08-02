import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';
import { AutoJevService } from '../accounting/auto-jev.service';
import type {
  CreatePayrollPeriodDto, LockPayrollPeriodDto,
  CreatePayrollRunDto, ComputePayrollDto,
  ApprovePayrollDto, PayPayrollDto, VoidPayrollDto,
  PayrollRunQueryDto, PayrollPeriodQueryDto,
} from './dto/payroll.dto';

const WORKING_DAYS_PER_MONTH = 22;
const HOURS_PER_DAY = 8;

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  // ── Payroll Periods ──

  async findPeriods(orgId: string, query: PayrollPeriodQueryDto) {
    const where: Prisma.PayrollPeriodWhereInput = { organizationId: orgId };
    if (query.year) {
      where.startDate = {
        gte: new Date(`${query.year}-01-01`),
        lt: new Date(`${query.year + 1}-01-01`),
      };
    }
    return this.prisma.payrollPeriod.findMany({
      where,
      include: {
        _count: { select: { payrollRuns: true } },
        creator: { select: { id: true, username: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async createPeriod(orgId: string, userId: string, dto: CreatePayrollPeriodDto) {
    const existing = await this.prisma.payrollPeriod.findUnique({
      where: { organizationId_name: { organizationId: orgId, name: dto.name } },
    });
    if (existing) throw new ConflictException(`Period name "${dto.name}" already exists`);

    return runAudited(this.prisma, userId, (tx) =>
      tx.payrollPeriod.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          ...(dto.periodType ? { periodType: dto.periodType } : {}),
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          payDate: new Date(dto.payDate),
          createdBy: userId,
        },
      }),
    );
  }

  async lockPeriod(orgId: string, userId: string, periodId: string, dto: LockPayrollPeriodDto) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, organizationId: orgId },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    if (period.version !== dto.expectedVersion) throw new ConflictException('Modified concurrently — reload.');

    return runAudited(this.prisma, userId, (tx) =>
      tx.payrollPeriod.update({
        where: { id: periodId },
        data: { isLocked: !period.isLocked, version: { increment: 1 } },
      }),
    );
  }

  // ── Payroll Runs ──

  async findRuns(orgId: string, query: PayrollRunQueryDto) {
    const where: Prisma.PayrollRunWhereInput = { organizationId: orgId };
    if (query.payrollPeriodId) where.payrollPeriodId = query.payrollPeriodId;
    if (query.status) where.status = query.status as any;

    return this.prisma.payrollRun.findMany({
      where,
      include: {
        payrollPeriod: { select: { id: true, name: true, startDate: true, endDate: true, payDate: true } },
        creator: { select: { id: true, username: true } },
        approver: { select: { id: true, username: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findRun(orgId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
      include: {
        payrollPeriod: true,
        creator: { select: { id: true, username: true } },
        approver: { select: { id: true, username: true } },
        voider: { select: { id: true, username: true } },
        items: {
          include: {
            employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, basicSalary: true } },
            details: { orderBy: { detailType: 'asc' } },
          },
          orderBy: { employee: { lastName: 'asc' } },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async createRun(orgId: string, userId: string, dto: CreatePayrollRunDto) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: dto.payrollPeriodId, organizationId: orgId },
    });
    if (!period) throw new NotFoundException('Payroll period not found');

    const runCount = await this.prisma.payrollRun.count({
      where: { organizationId: orgId },
    });
    const runNumber = `PR-${String(runCount + 1).padStart(6, '0')}`;

    return runAudited(this.prisma, userId, (tx) =>
      tx.payrollRun.create({
        data: {
          organizationId: orgId,
          payrollPeriodId: dto.payrollPeriodId,
          runNumber,
          status: 'draft',
          ...(dto.remarks ? { remarks: dto.remarks } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        include: {
          payrollPeriod: { select: { id: true, name: true, startDate: true, endDate: true, payDate: true } },
        },
      }),
    );
  }

  async computeRun(orgId: string, userId: string, runId: string, dto: ComputePayrollDto) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
      include: { payrollPeriod: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.version !== dto.expectedVersion) throw new ConflictException('Modified concurrently — reload.');
    if (run.status !== 'draft' && run.status !== 'computed') {
      throw new BadRequestException('Can only compute a draft or re-compute a computed run');
    }

    const period = run.payrollPeriod;
    const periodStart = period.startDate;
    const periodEnd = period.endDate;
    const isSemiMonthly = period.periodType === 'semi_monthly';

    const employees = await this.prisma.employee.findMany({
      where: { organizationId: orgId, isActive: true, employmentStatus: 'active' },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        basicSalary: true,
      },
    });

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.payrollRun.update({
        where: { id: runId },
        data: { status: 'computing', updatedBy: userId },
      });

      // Delete previous items if re-computing
      await tx.payrollItemDetail.deleteMany({
        where: { payrollItem: { payrollRunId: runId } },
      });
      await tx.payrollItem.deleteMany({ where: { payrollRunId: runId } });

      let runTotalGross = new Prisma.Decimal(0);
      let runTotalDeductions = new Prisma.Decimal(0);
      let runTotalNet = new Prisma.Decimal(0);

      for (const emp of employees) {
        const monthlySalary = emp.basicSalary ? new Prisma.Decimal(emp.basicSalary.toString()) : new Prisma.Decimal(0);
        const dailyRate = monthlySalary.div(WORKING_DAYS_PER_MONTH);
        const hourlyRate = dailyRate.div(HOURS_PER_DAY);

        // Fetch DTR records for this period
        const dtrRecords = await tx.dtrRecord.findMany({
          where: {
            employeeId: emp.id,
            recordDate: { gte: periodStart, lte: periodEnd },
          },
        });

        let daysWorked = new Prisma.Decimal(0);
        let daysAbsent = new Prisma.Decimal(0);
        let totalLateHours = new Prisma.Decimal(0);
        let totalUndertimeHours = new Prisma.Decimal(0);
        let totalOvertimeHours = new Prisma.Decimal(0);

        for (const dtr of dtrRecords) {
          if (dtr.isAbsent) {
            daysAbsent = daysAbsent.add(1);
          } else if (!dtr.isHoliday && !dtr.isRestDay) {
            const worked = new Prisma.Decimal(dtr.hoursWorked.toString());
            if (worked.gt(0)) {
              daysWorked = daysWorked.add(1);
            }
          } else {
            // Holiday/rest day still counts as paid
            daysWorked = daysWorked.add(1);
          }
          totalLateHours = totalLateHours.add(new Prisma.Decimal(dtr.hoursLate.toString()));
          totalUndertimeHours = totalUndertimeHours.add(new Prisma.Decimal(dtr.hoursUndertime.toString()));
          totalOvertimeHours = totalOvertimeHours.add(new Prisma.Decimal(dtr.hoursOvertime.toString()));
        }

        // Calculate base pay
        let basicPay: Prisma.Decimal;
        if (dtrRecords.length === 0) {
          // No DTR records — assume full pay for the period
          basicPay = isSemiMonthly ? monthlySalary.div(2) : monthlySalary;
        } else {
          basicPay = dailyRate.mul(daysWorked);
        }

        // Deductions from DTR
        const lateDeduction = hourlyRate.mul(totalLateHours);
        const undertimeDeduction = hourlyRate.mul(totalUndertimeHours);
        const absentDeduction = dailyRate.mul(daysAbsent);
        const overtimePay = hourlyRate.mul(totalOvertimeHours).mul(1.25);

        // Fetch employee allowances
        const empAllowances = await tx.employeeAllowance.findMany({
          where: {
            employeeId: emp.id,
            organizationId: orgId,
            isActive: true,
            effectiveDate: { lte: periodEnd },
            OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
          },
          include: { allowanceType: true },
        });

        let totalAllowances = new Prisma.Decimal(0);
        const allowanceDetails: Array<{ code: string; name: string; amount: Prisma.Decimal }> = [];

        for (const ea of empAllowances) {
          let amt = new Prisma.Decimal(ea.amount.toString());
          if (isSemiMonthly) amt = amt.div(2);
          totalAllowances = totalAllowances.add(amt);
          allowanceDetails.push({
            code: ea.allowanceType.code,
            name: ea.allowanceType.name,
            amount: amt,
          });
        }

        const grossPay = basicPay.add(totalAllowances).add(overtimePay);

        // Fetch employee deductions
        const empDeductions = await tx.employeeDeduction.findMany({
          where: {
            employeeId: emp.id,
            organizationId: orgId,
            isActive: true,
            OR: [{ startDate: null }, { startDate: { lte: periodEnd } }],
          },
          include: { deductionType: true },
        });

        let totalDeductionAmt = new Prisma.Decimal(0);
        const deductionDetails: Array<{ code: string; name: string; amount: Prisma.Decimal; employerShare: Prisma.Decimal }> = [];

        for (const ed of empDeductions) {
          let eeAmt: Prisma.Decimal;
          let erAmt: Prisma.Decimal;

          if (ed.deductionType.isPercentage) {
            const eeRate = new Prisma.Decimal(ed.deductionType.employeeShare.toString()).div(100);
            const erRate = new Prisma.Decimal(ed.deductionType.employerShare.toString()).div(100);
            eeAmt = grossPay.mul(eeRate);
            erAmt = grossPay.mul(erRate);
          } else {
            eeAmt = new Prisma.Decimal(ed.amount.toString());
            erAmt = new Prisma.Decimal(ed.deductionType.employerShare.toString());
          }

          if (isSemiMonthly) {
            eeAmt = eeAmt.div(2);
            erAmt = erAmt.div(2);
          }

          totalDeductionAmt = totalDeductionAmt.add(eeAmt);
          deductionDetails.push({
            code: ed.deductionType.code,
            name: ed.deductionType.name,
            amount: eeAmt,
            employerShare: erAmt,
          });
        }

        // Add DTR-based deductions to total
        totalDeductionAmt = totalDeductionAmt.add(lateDeduction).add(undertimeDeduction).add(absentDeduction);

        const netPay = grossPay.sub(totalDeductionAmt);

        // Create PayrollItem
        const item = await tx.payrollItem.create({
          data: {
            organizationId: orgId,
            payrollRunId: runId,
            employeeId: emp.id,
            basicPay: basicPay.toDecimalPlaces(2),
            totalAllowances: totalAllowances.toDecimalPlaces(2),
            grossPay: grossPay.toDecimalPlaces(2),
            totalDeductions: totalDeductionAmt.toDecimalPlaces(2),
            netPay: netPay.toDecimalPlaces(2),
            daysWorked: daysWorked.toDecimalPlaces(1),
            daysAbsent: daysAbsent.toDecimalPlaces(1),
            hoursLate: totalLateHours.toDecimalPlaces(2),
            hoursUndertime: totalUndertimeHours.toDecimalPlaces(2),
            hoursOvertime: totalOvertimeHours.toDecimalPlaces(2),
            lateDeduction: lateDeduction.toDecimalPlaces(2),
            undertimeDeduction: undertimeDeduction.toDecimalPlaces(2),
            overtimePay: overtimePay.toDecimalPlaces(2),
            absentDeduction: absentDeduction.toDecimalPlaces(2),
          },
        });

        // Create detail rows for allowances
        for (const ad of allowanceDetails) {
          await tx.payrollItemDetail.create({
            data: {
              payrollItemId: item.id,
              detailType: 'allowance',
              referenceCode: ad.code,
              referenceName: ad.name,
              amount: ad.amount.toDecimalPlaces(2),
            },
          });
        }

        // Create detail rows for deductions
        for (const dd of deductionDetails) {
          await tx.payrollItemDetail.create({
            data: {
              payrollItemId: item.id,
              detailType: 'deduction',
              referenceCode: dd.code,
              referenceName: dd.name,
              amount: dd.amount.toDecimalPlaces(2),
              employerShare: dd.employerShare.toDecimalPlaces(2),
            },
          });
        }

        // DTR-based deduction details
        if (lateDeduction.gt(0)) {
          await tx.payrollItemDetail.create({
            data: { payrollItemId: item.id, detailType: 'deduction', referenceCode: 'LATE', referenceName: 'Late Deduction', amount: lateDeduction.toDecimalPlaces(2) },
          });
        }
        if (undertimeDeduction.gt(0)) {
          await tx.payrollItemDetail.create({
            data: { payrollItemId: item.id, detailType: 'deduction', referenceCode: 'UNDERTIME', referenceName: 'Undertime Deduction', amount: undertimeDeduction.toDecimalPlaces(2) },
          });
        }
        if (absentDeduction.gt(0)) {
          await tx.payrollItemDetail.create({
            data: { payrollItemId: item.id, detailType: 'deduction', referenceCode: 'ABSENT', referenceName: 'Absent Deduction', amount: absentDeduction.toDecimalPlaces(2) },
          });
        }
        if (overtimePay.gt(0)) {
          await tx.payrollItemDetail.create({
            data: { payrollItemId: item.id, detailType: 'allowance', referenceCode: 'OT', referenceName: 'Overtime Pay', amount: overtimePay.toDecimalPlaces(2) },
          });
        }

        runTotalGross = runTotalGross.add(grossPay);
        runTotalDeductions = runTotalDeductions.add(totalDeductionAmt);
        runTotalNet = runTotalNet.add(netPay);
      }

      return tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'computed',
          totalGross: runTotalGross.toDecimalPlaces(2),
          totalDeductions: runTotalDeductions.toDecimalPlaces(2),
          totalNet: runTotalNet.toDecimalPlaces(2),
          employeeCount: employees.length,
          computedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        include: {
          payrollPeriod: { select: { id: true, name: true, startDate: true, endDate: true, payDate: true } },
          _count: { select: { items: true } },
        },
      });
    });
  }

  async approveRun(orgId: string, userId: string, runId: string, dto: ApprovePayrollDto) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.version !== dto.expectedVersion) throw new ConflictException('Modified concurrently — reload.');
    if (run.status !== 'computed') throw new BadRequestException('Only computed runs can be approved');

    return runAudited(this.prisma, userId, (tx) =>
      tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
      }),
    );
  }

  async payRun(orgId: string, userId: string, runId: string, dto: PayPayrollDto) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
      include: { payrollPeriod: { select: { payDate: true } } },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.version !== dto.expectedVersion) throw new ConflictException('Modified concurrently — reload.');
    if (run.status !== 'approved') throw new BadRequestException('Only approved runs can be marked as paid');

    return runAudited(this.prisma, userId, async (tx) => {
      const updated = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'paid',
          paidAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });

      await this.autoJev.onPayrollPaid(tx, orgId, userId, {
        id: run.id,
        runNumber: run.runNumber,
        payDate: run.payrollPeriod.payDate,
        totalGross: Number(run.totalGross),
        totalDeductions: Number(run.totalDeductions),
        totalNet: Number(run.totalNet),
      });

      return updated;
    });
  }

  async voidRun(orgId: string, userId: string, runId: string, dto: VoidPayrollDto) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.version !== dto.expectedVersion) throw new ConflictException('Modified concurrently — reload.');
    if (run.status === 'voided') throw new BadRequestException('Already voided');
    if (run.status === 'paid') throw new BadRequestException('Cannot void a paid run');

    return runAudited(this.prisma, userId, (tx) =>
      tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'voided',
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: dto.voidReason,
          updatedBy: userId,
          version: { increment: 1 },
        },
      }),
    );
  }
}

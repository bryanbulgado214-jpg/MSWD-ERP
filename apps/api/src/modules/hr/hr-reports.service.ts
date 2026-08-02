import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class HrReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEmployeeRoster(orgId: string, query: { departmentId?: string; status?: string }) {
    const where: Prisma.EmployeeWhereInput = { organizationId: orgId };
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.status) where.employmentStatus = query.status as any;
    else where.isActive = true;

    return this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        suffix: true,
        dateOfBirth: true,
        gender: true,
        civilStatus: true,
        contactNumber: true,
        email: true,
        employmentType: true,
        employmentStatus: true,
        dateHired: true,
        basicSalary: true,
        salaryGrade: true,
        salaryStep: true,
        tin: true,
        sssGsisNumber: true,
        philhealthNumber: true,
        pagibigNumber: true,
        department: { select: { code: true, name: true } },
        position: { select: { code: true, title: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async getPayrollRegister(orgId: string, payrollRunId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: payrollRunId, organizationId: orgId },
      include: {
        payrollPeriod: true,
        creator: { select: { username: true } },
        approver: { select: { username: true } },
        items: {
          include: {
            employee: {
              select: {
                employeeNumber: true,
                firstName: true,
                middleName: true,
                lastName: true,
                suffix: true,
                department: { select: { name: true } },
                position: { select: { title: true } },
              },
            },
            details: { orderBy: [{ detailType: 'asc' }, { referenceCode: 'asc' }] },
          },
          orderBy: { employee: { lastName: 'asc' } },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async getLeaveSummary(orgId: string, query: { year?: number }) {
    const year = query.year ?? new Date().getFullYear();

    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        employee: { organizationId: orgId, isActive: true },
        year,
      },
      include: {
        employee: {
          select: { employeeNumber: true, firstName: true, lastName: true, department: { select: { name: true } } },
        },
        leaveType: { select: { code: true, name: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { leaveType: { code: 'asc' } }],
    });

    return { year, balances };
  }

  async getPayslip(orgId: string, payrollItemId: string) {
    const item = await this.prisma.payrollItem.findFirst({
      where: { id: payrollItemId, organizationId: orgId },
      include: {
        payrollRun: {
          include: {
            payrollPeriod: true,
            approver: { select: { username: true } },
          },
        },
        employee: {
          select: {
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            suffix: true,
            basicSalary: true,
            department: { select: { name: true } },
            position: { select: { title: true } },
            tin: true,
            sssGsisNumber: true,
            philhealthNumber: true,
            pagibigNumber: true,
          },
        },
        details: { orderBy: [{ detailType: 'asc' }, { referenceCode: 'asc' }] },
      },
    });
    if (!item) throw new NotFoundException('Payroll item not found');
    return item;
  }

  async getAttendanceSummary(orgId: string, query: { month: number; year: number }) {
    const startDate = new Date(`${query.year}-${String(query.month).padStart(2, '0')}-01`);
    const endDate = new Date(query.year, query.month, 0);

    const employees = await this.prisma.employee.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, employeeNumber: true, firstName: true, lastName: true, department: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }],
    });

    const records = await this.prisma.dtrRecord.findMany({
      where: {
        employee: { organizationId: orgId },
        recordDate: { gte: startDate, lte: endDate },
      },
    });

    const recordsByEmployee = new Map<string, typeof records>();
    for (const r of records) {
      const list = recordsByEmployee.get(r.employeeId) ?? [];
      list.push(r);
      recordsByEmployee.set(r.employeeId, list);
    }

    return {
      month: query.month,
      year: query.year,
      employees: employees.map((emp) => {
        const empRecords = recordsByEmployee.get(emp.id) ?? [];
        let daysPresent = 0;
        let daysAbsent = 0;
        let totalLate = 0;
        let totalUndertime = 0;
        let totalOvertime = 0;
        let totalHoursWorked = 0;

        for (const r of empRecords) {
          if (r.isAbsent) daysAbsent++;
          else daysPresent++;
          totalLate += Number(r.hoursLate);
          totalUndertime += Number(r.hoursUndertime);
          totalOvertime += Number(r.hoursOvertime);
          totalHoursWorked += Number(r.hoursWorked);
        }

        return {
          ...emp,
          dtrCount: empRecords.length,
          daysPresent,
          daysAbsent,
          totalLate: Math.round(totalLate * 100) / 100,
          totalUndertime: Math.round(totalUndertime * 100) / 100,
          totalOvertime: Math.round(totalOvertime * 100) / 100,
          totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
        };
      }),
    };
  }
}

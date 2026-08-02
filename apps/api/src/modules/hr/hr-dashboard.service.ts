import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class HrDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(orgId: string) {
    const [
      totalEmployees,
      activeEmployees,
      onLeaveCount,
      pendingLeaveApps,
      recentPayrollRuns,
      departmentCounts,
      statusCounts,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { organizationId: orgId } }),
      this.prisma.employee.count({ where: { organizationId: orgId, isActive: true, employmentStatus: 'active' } }),
      this.prisma.employee.count({ where: { organizationId: orgId, isActive: true, employmentStatus: 'on_leave' } }),
      this.prisma.leaveApplication.count({ where: { organizationId: orgId, status: 'pending' } }),
      this.prisma.payrollRun.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          runNumber: true,
          status: true,
          employeeCount: true,
          totalGross: true,
          totalDeductions: true,
          totalNet: true,
          computedAt: true,
          paidAt: true,
          payrollPeriod: { select: { name: true, payDate: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.employee.groupBy({
        by: ['departmentId'],
        where: { organizationId: orgId, isActive: true },
        _count: true,
      }),
      this.prisma.employee.groupBy({
        by: ['employmentStatus'],
        where: { organizationId: orgId },
        _count: true,
      }),
    ]);

    const deptIds = departmentCounts.map((d) => d.departmentId).filter(Boolean) as string[];
    const departments = deptIds.length
      ? await this.prisma.department.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];

    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const departmentBreakdown = departmentCounts
      .filter((d) => d.departmentId)
      .map((d) => ({ department: deptMap.get(d.departmentId!) ?? 'Unknown', count: d._count }))
      .sort((a, b) => b.count - a.count);

    const statusBreakdown = statusCounts.map((s) => ({
      status: s.employmentStatus,
      count: s._count,
    }));

    return {
      totalEmployees,
      activeEmployees,
      onLeaveCount,
      pendingLeaveApps,
      recentPayrollRuns,
      departmentBreakdown,
      statusBreakdown,
    };
  }
}

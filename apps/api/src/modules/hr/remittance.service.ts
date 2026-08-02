import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

const AGENCY_MAP: Record<string, string> = {
  GSIS: 'GSIS',
  PHILHEALTH: 'PhilHealth',
  PAGIBIG: 'Pag-IBIG',
  BIR: 'BIR',
};

const AGENCY_CODES = Object.keys(AGENCY_MAP);

@Injectable()
export class RemittanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(orgId: string, query: { payrollRunId?: string; payrollPeriodId?: string; year?: number; month?: number }) {
    const runWhere: any = { organizationId: orgId, status: { in: ['computed', 'approved', 'paid'] } };
    if (query.payrollRunId) runWhere.id = query.payrollRunId;
    if (query.payrollPeriodId) runWhere.payrollPeriodId = query.payrollPeriodId;
    if (query.year || query.month) {
      runWhere.payrollPeriod = {};
      if (query.year) {
        runWhere.payrollPeriod.startDate = {
          gte: new Date(`${query.year}-01-01`),
          lt: new Date(`${query.year + 1}-01-01`),
        };
      }
    }

    const runs = await this.prisma.payrollRun.findMany({
      where: runWhere,
      select: { id: true, runNumber: true, status: true, payrollPeriod: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (runs.length === 0) return { runs: [], agencies: [] };

    const runIds = runs.map((r) => r.id);

    const details = await this.prisma.payrollItemDetail.findMany({
      where: {
        payrollItem: { payrollRunId: { in: runIds } },
        detailType: 'deduction',
        referenceCode: { in: AGENCY_CODES },
      },
      include: {
        payrollItem: {
          select: {
            payrollRunId: true,
            employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    const agencyTotals: Record<string, { code: string; name: string; totalEmployee: number; totalEmployer: number; employeeCount: number; employees: any[] }> = {};

    for (const code of AGENCY_CODES) {
      agencyTotals[code] = {
        code,
        name: AGENCY_MAP[code]!,
        totalEmployee: 0,
        totalEmployer: 0,
        employeeCount: 0,
        employees: [],
      };
    }

    const seenEmployees: Record<string, Set<string>> = {};
    for (const code of AGENCY_CODES) seenEmployees[code] = new Set();

    for (const d of details) {
      const code = d.referenceCode;
      const agency = agencyTotals[code];
      if (!agency) continue;

      const empAmt = Number(d.amount);
      const erAmt = Number(d.employerShare);
      agency.totalEmployee += empAmt;
      agency.totalEmployer += erAmt;

      const emp = d.payrollItem.employee;
      if (!seenEmployees[code]!.has(emp.id)) {
        seenEmployees[code]!.add(emp.id);
        agency.employeeCount++;
      }

      agency.employees.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        employeeName: `${emp.lastName}, ${emp.firstName}`,
        payrollRunId: d.payrollItem.payrollRunId,
        employeeShare: empAmt,
        employerShare: erAmt,
        total: empAmt + erAmt,
      });
    }

    return {
      runs: runs.map((r) => ({ id: r.id, runNumber: r.runNumber, status: r.status, periodName: r.payrollPeriod.name })),
      agencies: Object.values(agencyTotals).filter((a) => a.totalEmployee > 0 || a.totalEmployer > 0),
    };
  }

  async getAgencyDetail(orgId: string, agencyCode: string, query: { payrollRunId?: string; payrollPeriodId?: string }) {
    if (!AGENCY_CODES.includes(agencyCode)) throw new NotFoundException('Unknown agency code');

    const runWhere: any = { organizationId: orgId, status: { in: ['computed', 'approved', 'paid'] } };
    if (query.payrollRunId) runWhere.id = query.payrollRunId;
    if (query.payrollPeriodId) runWhere.payrollPeriodId = query.payrollPeriodId;

    const runs = await this.prisma.payrollRun.findMany({ where: runWhere, select: { id: true } });
    const runIds = runs.map((r) => r.id);

    const details = await this.prisma.payrollItemDetail.findMany({
      where: {
        payrollItem: { payrollRunId: { in: runIds } },
        detailType: 'deduction',
        referenceCode: agencyCode,
      },
      include: {
        payrollItem: {
          select: {
            payrollRun: { select: { runNumber: true, payrollPeriod: { select: { name: true } } } },
            employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, sssGsisNumber: true, philhealthNumber: true, pagibigNumber: true, tin: true } },
          },
        },
      },
    });

    return {
      agencyCode,
      agencyName: AGENCY_MAP[agencyCode],
      records: details.map((d) => ({
        employeeNumber: d.payrollItem.employee.employeeNumber,
        employeeName: `${d.payrollItem.employee.lastName}, ${d.payrollItem.employee.firstName}`,
        membershipNumber: getMembershipNumber(d.payrollItem.employee, agencyCode),
        runNumber: d.payrollItem.payrollRun.runNumber,
        periodName: d.payrollItem.payrollRun.payrollPeriod.name,
        employeeShare: Number(d.amount),
        employerShare: Number(d.employerShare),
        total: Number(d.amount) + Number(d.employerShare),
      })),
    };
  }
}

function getMembershipNumber(emp: { sssGsisNumber: string | null; philhealthNumber: string | null; pagibigNumber: string | null; tin: string | null }, code: string): string | null {
  switch (code) {
    case 'GSIS': return emp.sssGsisNumber;
    case 'PHILHEALTH': return emp.philhealthNumber;
    case 'PAGIBIG': return emp.pagibigNumber;
    case 'BIR': return emp.tin;
    default: return null;
  }
}

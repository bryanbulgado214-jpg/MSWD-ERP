import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import type {
  BudgetUtilizationSectionValue,
  CreateBudgetUtilizationLineDto,
  UpdateBudgetUtilizationLineDto,
} from './dto/budget-utilization.dto';

const SECTION_ORDER: BudgetUtilizationSectionValue[] = [
  'personnel_services',
  'mooe',
  'capital_outlay',
];

// Standard DBM Form 703 line items, pre-loaded for a fresh fiscal year. The
// budget officer then fills in the amounts and maps the GL accounts.
type DefaultLine = { name: string; appCrossCheck?: boolean };
const DEFAULT_LINES: Record<BudgetUtilizationSectionValue, DefaultLine[]> = {
  personnel_services: [{ name: 'Personnel Services' }],
  mooe: [
    { name: 'Travelling Expenses' },
    { name: 'Training and Scholarship Expenses' },
    { name: 'Supplies and Materials Expenses', appCrossCheck: true },
    { name: 'Utility Expenses' },
    { name: 'Communication Expenses' },
    { name: 'Generation, Transmission and Distribution Expenses' },
    { name: 'Extraordinary and Miscellaneous Expenses' },
    { name: 'Professional Services' },
    { name: 'General Services' },
    { name: 'Repairs and Maintenance Expense' },
    { name: "Directors and Committee Members' Fee" },
    { name: 'Taxes, Insurance Premiums and Other Fees' },
    { name: 'Other Maintenance and Operating Expenses' },
  ],
  capital_outlay: [
    { name: 'Investment Outlay' },
    { name: 'Loans Outlay' },
    { name: 'Investment Property Outlay' },
    { name: 'Land and Land Improvements Outlay' },
    { name: 'Infrastructure Outlay' },
    { name: 'Buildings and Other Structures' },
    { name: 'Machinery and Equipment Outlay' },
    { name: 'Transportation Equipment' },
    { name: 'Furniture and Fixtures, Books Outlay' },
    { name: 'Biological Assets Outlay' },
    { name: 'Intangible Assets Outlay' },
    { name: 'Other Property, Plant and Equipment' },
  ],
};

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class BudgetUtilizationService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireFiscalYear(orgId: string, fiscalYearId: string) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId: orgId },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found.');
    return fy;
  }

  // ── Configuration (lines + GL-account mapping) ──

  async listLines(orgId: string, fiscalYearId: string) {
    const lines = await this.prisma.budgetUtilizationLine.findMany({
      where: { organizationId: orgId, fiscalYearId },
      include: { accounts: true },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    const accountIds = [
      ...new Set(lines.flatMap((l) => l.accounts.map((a) => a.chartOfAccountId))),
    ];
    const coas = accountIds.length
      ? await this.prisma.chartOfAccount.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, accountCode: true, name: true },
        })
      : [];
    const coaMap = new Map(coas.map((c) => [c.id, c]));
    return lines.map((l) => ({
      id: l.id,
      section: l.section,
      name: l.name,
      sortOrder: l.sortOrder,
      budgetAmount: l.budgetAmount,
      appCrossCheck: l.appCrossCheck,
      version: l.version,
      accounts: l.accounts.map((a) => ({
        id: a.chartOfAccountId,
        accountCode: coaMap.get(a.chartOfAccountId)?.accountCode ?? '',
        name: coaMap.get(a.chartOfAccountId)?.name ?? '',
      })),
    }));
  }

  async createLine(orgId: string, userId: string, dto: CreateBudgetUtilizationLineDto) {
    await this.requireFiscalYear(orgId, dto.fiscalYearId);
    return this.prisma.budgetUtilizationLine.create({
      data: {
        organizationId: orgId,
        fiscalYearId: dto.fiscalYearId,
        section: dto.section as never,
        name: dto.name.trim(),
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.budgetAmount != null ? { budgetAmount: dto.budgetAmount } : {}),
        ...(dto.appCrossCheck != null ? { appCrossCheck: dto.appCrossCheck } : {}),
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async updateLine(
    orgId: string,
    userId: string,
    id: string,
    dto: UpdateBudgetUtilizationLineDto,
  ) {
    const line = await this.prisma.budgetUtilizationLine.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!line) throw new NotFoundException('Budget utilization line not found.');
    if (line.version !== dto.expectedVersion) {
      throw new ConflictException('This line was modified by someone else. Please refresh.');
    }
    return this.prisma.budgetUtilizationLine.update({
      where: { id },
      data: {
        ...(dto.section ? { section: dto.section as never } : {}),
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.budgetAmount != null ? { budgetAmount: dto.budgetAmount } : {}),
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.appCrossCheck != null ? { appCrossCheck: dto.appCrossCheck } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async deleteLine(orgId: string, id: string) {
    const line = await this.prisma.budgetUtilizationLine.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!line) throw new NotFoundException('Budget utilization line not found.');
    await this.prisma.budgetUtilizationLine.delete({ where: { id } });
    return { id, deleted: true };
  }

  // Replace the GL accounts mapped to a line.
  async setAccounts(orgId: string, lineId: string, accountIds: string[]) {
    const line = await this.prisma.budgetUtilizationLine.findFirst({
      where: { id: lineId, organizationId: orgId },
    });
    if (!line) throw new NotFoundException('Budget utilization line not found.');
    const ids = [...new Set(accountIds)];
    if (ids.length) {
      const count = await this.prisma.chartOfAccount.count({
        where: { organizationId: orgId, id: { in: ids } },
      });
      if (count !== ids.length) throw new BadRequestException('One or more accounts are invalid.');
    }
    await this.prisma.$transaction([
      this.prisma.budgetUtilizationAccount.deleteMany({
        where: { budgetUtilizationLineId: lineId },
      }),
      ...(ids.length
        ? [
            this.prisma.budgetUtilizationAccount.createMany({
              data: ids.map((chartOfAccountId) => ({
                budgetUtilizationLineId: lineId,
                chartOfAccountId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    return this.listLines(orgId, line.fiscalYearId);
  }

  // Pre-load the standard DBM Form 703 lines for a fiscal year that has none yet.
  async seedDefaults(orgId: string, userId: string, fiscalYearId: string) {
    await this.requireFiscalYear(orgId, fiscalYearId);
    const existing = await this.prisma.budgetUtilizationLine.count({
      where: { organizationId: orgId, fiscalYearId },
    });
    if (existing > 0) {
      throw new BadRequestException(
        'This fiscal year already has utilization lines. Remove them first to reload the defaults.',
      );
    }
    const rows: Prisma.BudgetUtilizationLineCreateManyInput[] = [];
    for (const section of SECTION_ORDER) {
      DEFAULT_LINES[section].forEach((l, i) => {
        rows.push({
          organizationId: orgId,
          fiscalYearId,
          section: section as never,
          name: l.name,
          sortOrder: i,
          appCrossCheck: !!l.appCrossCheck,
          createdBy: userId,
          updatedBy: userId,
        });
      });
    }
    await this.prisma.budgetUtilizationLine.createMany({ data: rows });
    return this.listLines(orgId, fiscalYearId);
  }

  // ── The report ──

  async report(orgId: string, fiscalYearId: string, startDate?: string, endDate?: string) {
    const fy = await this.requireFiscalYear(orgId, fiscalYearId);
    const start = startDate ? new Date(startDate) : fy.startDate;
    const end = endDate ? new Date(endDate) : fy.endDate;

    const lines = await this.prisma.budgetUtilizationLine.findMany({
      where: { organizationId: orgId, fiscalYearId },
      include: { accounts: true },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Net disbursement (debit − credit) per GL account over the period, taken
    // only from posted/reversed DV-sourced journal vouchers.
    const agg = await this.prisma.$queryRaw<Array<{ account_id: string; net: string }>>(Prisma.sql`
      SELECT l.chart_of_account_id AS account_id,
             (COALESCE(SUM(l.debit_amount), 0) - COALESCE(SUM(l.credit_amount), 0))::text AS net
      FROM jev_lines l
      JOIN journal_entry_vouchers j ON j.id = l.jev_id
      WHERE j.organization_id = ${orgId}::uuid
        AND j.source_type = 'disbursement'
        AND j.status IN ('posted', 'reversed')
        AND j.jev_date BETWEEN ${start}::date AND ${end}::date
      GROUP BY l.chart_of_account_id
    `);
    const netByAccount = new Map<string, number>();
    for (const r of agg) netByAccount.set(r.account_id, Number(r.net));

    // APP commitment total (non-cancelled PO contract amounts) for the Supplies
    // & Materials cross-check — computed once if any line asks for it.
    let appUtilization = 0;
    if (lines.some((l) => l.appCrossCheck)) {
      const poAgg = await this.prisma.purchaseOrder.aggregate({
        where: {
          organizationId: orgId,
          status: { not: 'cancelled' },
          purchaseRequest: { fiscalYearId },
        },
        _sum: { contractAmount: true },
      });
      appUtilization = Number(poAgg._sum.contractAmount ?? 0);
    }

    const reportLines = lines.map((l) => {
      const utilization = round2(
        l.accounts.reduce((s, a) => s + (netByAccount.get(a.chartOfAccountId) ?? 0), 0),
      );
      const budget = round2(Number(l.budgetAmount));
      return {
        id: l.id,
        section: l.section,
        name: l.name,
        appCrossCheck: l.appCrossCheck,
        accountCount: l.accounts.length,
        budget,
        utilization,
        remaining: round2(budget - utilization),
        utilizationPct: budget > 0 ? round2((utilization / budget) * 100) : 0,
        overBudget: utilization > budget,
        ...(l.appCrossCheck ? { appUtilization: round2(appUtilization) } : {}),
      };
    });

    const sections = SECTION_ORDER.map((section) => {
      const secLines = reportLines.filter((l) => l.section === section);
      const budget = round2(secLines.reduce((s, l) => s + l.budget, 0));
      const utilization = round2(secLines.reduce((s, l) => s + l.utilization, 0));
      return {
        section,
        lines: secLines,
        budget,
        utilization,
        remaining: round2(budget - utilization),
        utilizationPct: budget > 0 ? round2((utilization / budget) * 100) : 0,
        overBudget: utilization > budget,
      };
    });

    const totalBudget = round2(sections.reduce((s, x) => s + x.budget, 0));
    const totalUtil = round2(sections.reduce((s, x) => s + x.utilization, 0));

    return {
      fiscalYear: { id: fy.id, year: fy.year, name: fy.name, startDate: fy.startDate, endDate: fy.endDate },
      period: { startDate: start, endDate: end },
      sections,
      total: {
        budget: totalBudget,
        utilization: totalUtil,
        remaining: round2(totalBudget - totalUtil),
        utilizationPct: totalBudget > 0 ? round2((totalUtil / totalBudget) * 100) : 0,
      },
    };
  }

  // The disbursements behind one line's utilization figure (drill-down).
  async lineBreakdown(orgId: string, lineId: string, startDate?: string, endDate?: string) {
    const line = await this.prisma.budgetUtilizationLine.findFirst({
      where: { id: lineId, organizationId: orgId },
      include: { accounts: true },
    });
    if (!line) throw new NotFoundException('Budget utilization line not found.');
    const fy = await this.requireFiscalYear(orgId, line.fiscalYearId);
    const start = startDate ? new Date(startDate) : fy.startDate;
    const end = endDate ? new Date(endDate) : fy.endDate;
    const accountIds = line.accounts.map((a) => a.chartOfAccountId);
    if (!accountIds.length) {
      return { line: { id: line.id, name: line.name }, period: { startDate: start, endDate: end }, rows: [], total: 0 };
    }
    const rows = await this.prisma.$queryRaw<
      Array<{
        jev_id: string;
        jev_number: string;
        jev_date: Date;
        particulars: string | null;
        account_code: string;
        account_name: string;
        amount: string;
      }>
    >(Prisma.sql`
      SELECT j.id AS jev_id, j.jev_number, j.jev_date, j.particulars,
             c.account_code, c.name AS account_name,
             (COALESCE(l.debit_amount, 0) - COALESCE(l.credit_amount, 0))::text AS amount
      FROM jev_lines l
      JOIN journal_entry_vouchers j ON j.id = l.jev_id
      JOIN chart_of_accounts c ON c.id = l.chart_of_account_id
      WHERE j.organization_id = ${orgId}::uuid
        AND j.source_type = 'disbursement'
        AND j.status IN ('posted', 'reversed')
        AND j.jev_date BETWEEN ${start}::date AND ${end}::date
        AND l.chart_of_account_id IN (${Prisma.join(accountIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY j.jev_date ASC, j.jev_number ASC
    `);
    const mapped = rows.map((r) => ({
      jevId: r.jev_id,
      jevNumber: r.jev_number,
      jevDate: r.jev_date,
      particulars: r.particulars ?? '',
      accountCode: r.account_code,
      accountName: r.account_name,
      amount: Number(r.amount),
    }));
    const total = round2(mapped.reduce((s, r) => s + r.amount, 0));
    return {
      line: { id: line.id, name: line.name },
      period: { startDate: start, endDate: end },
      rows: mapped,
      total,
    };
  }
}

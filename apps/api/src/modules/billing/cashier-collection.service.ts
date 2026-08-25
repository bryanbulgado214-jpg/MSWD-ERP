import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import {
  COLLECTION_HOLDING_DEFAULT_GL,
  COLLECTION_HOLDING_MAPPING_KEY,
  COLLECTION_TYPES,
  collectionTypeByKey,
} from './collection-types';
import {
  CreateCashierReportDto,
  SubmitCashierReportDto,
  UpdateCashierReportDto,
  UpsertCashierEntryDto,
  UpsertCollectionAreaDto,
  UpsertCollectorDto,
} from './dto/cashier-collection.dto';

// PH peso denominations counted by quantity on the teller cash-count sheet.
const PESO_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
// Assorted loose coins the teller enters as a single peso amount (not a count),
// rather than tallying every centavo denomination.
const OTHER_COINS_KEY = 'other';
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Value of a cash-count map. Numeric-denomination keys are quantities; the
 * special "other" key is a direct peso amount (loose coins). Summed in centavos.
 */
function cashCountTotal(count: Record<string, number> | null | undefined): number {
  if (!count) return 0;
  const cents =
    PESO_DENOMINATIONS.reduce(
      (s, d) => s + Math.round(d * 100) * (Number(count[String(d)]) || 0),
      0,
    ) + Math.round((Number(count[OTHER_COINS_KEY]) || 0) * 100);
  return cents / 100;
}

export interface CheckItem {
  checkNumber: string;
  bankName?: string;
  amount: number;
}
export interface CollectionLine {
  collectionType: string;
  amount: number;
  description?: string;
}
function checksTotal(checks: CheckItem[] | null | undefined): number {
  if (!Array.isArray(checks)) return 0;
  return round2(checks.reduce((s, c) => s + (Number(c.amount) || 0), 0));
}

/** Sum two cash-count maps (for the combined cash-count summary). */
function addCashCounts(
  a: Record<string, number>,
  b: Record<string, number> | null | undefined,
): Record<string, number> {
  const out = { ...a };
  if (b) {
    for (const d of PESO_DENOMINATIONS)
      out[String(d)] = (out[String(d)] || 0) + (Number(b[String(d)]) || 0);
    // "other" is a peso amount, not a count — add it (rounded) directly.
    out[OTHER_COINS_KEY] = round2((out[OTHER_COINS_KEY] || 0) + (Number(b[OTHER_COINS_KEY]) || 0));
  }
  return out;
}

@Injectable()
export class CashierCollectionService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin-managed collector list ──

  listCollectors(orgId: string, activeOnly = false) {
    return this.prisma.collector.findMany({
      where: { organizationId: orgId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCollector(orgId: string, dto: UpsertCollectorDto) {
    const dup = await this.prisma.collector.findFirst({
      where: { organizationId: orgId, name: dto.name.trim() },
      select: { id: true },
    });
    if (dup) throw new ConflictException(`A collector named "${dto.name.trim()}" already exists.`);
    return this.prisma.collector.create({
      data: {
        organizationId: orgId,
        name: dto.name.trim(),
        isCashier: dto.isCashier ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCollector(orgId: string, id: string, dto: UpsertCollectorDto) {
    const c = await this.prisma.collector.findFirst({ where: { id, organizationId: orgId } });
    if (!c) throw new NotFoundException('Collector not found.');
    return this.prisma.collector.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        ...(dto.isCashier !== undefined ? { isCashier: dto.isCashier } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async deleteCollector(orgId: string, id: string) {
    const c = await this.prisma.collector.findFirst({ where: { id, organizationId: orgId } });
    if (!c) throw new NotFoundException('Collector not found.');
    const used = await this.prisma.cashierCollectionEntry.count({ where: { collectorId: id } });
    if (used > 0) {
      // Keep referential history — deactivate instead of hard-deleting.
      return this.prisma.collector.update({ where: { id }, data: { isActive: false } });
    }
    await this.prisma.collector.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Admin-managed collection-area list ──

  listAreas(orgId: string, activeOnly = false) {
    return this.prisma.collectionArea.findMany({
      where: { organizationId: orgId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createArea(orgId: string, dto: UpsertCollectionAreaDto) {
    const dup = await this.prisma.collectionArea.findFirst({
      where: { organizationId: orgId, name: dto.name.trim() },
      select: { id: true },
    });
    if (dup)
      throw new ConflictException(`A collection area named "${dto.name.trim()}" already exists.`);
    return this.prisma.collectionArea.create({
      data: {
        organizationId: orgId,
        name: dto.name.trim(),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateArea(orgId: string, id: string, dto: UpsertCollectionAreaDto) {
    const a = await this.prisma.collectionArea.findFirst({ where: { id, organizationId: orgId } });
    if (!a) throw new NotFoundException('Collection area not found.');
    return this.prisma.collectionArea.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async deleteArea(orgId: string, id: string) {
    const a = await this.prisma.collectionArea.findFirst({ where: { id, organizationId: orgId } });
    if (!a) throw new NotFoundException('Collection area not found.');
    const used = await this.prisma.cashierCollectionEntry.count({
      where: { collectionAreaId: id },
    });
    if (used > 0)
      return this.prisma.collectionArea.update({ where: { id }, data: { isActive: false } });
    await this.prisma.collectionArea.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Form options for the cashier ──

  async getFormOptions(orgId: string) {
    const [collectors, areas, collGl] = await Promise.all([
      this.listCollectors(orgId, true),
      this.listAreas(orgId, true),
      this.resolveCollectionGl(orgId),
    ]);
    // The cashier picks a type of collection; standard types resolve to a GL
    // account via the account mappings (shown for reference). "Other" carries no
    // fixed GL — the accountant assigns it during review — and needs a description.
    const collectionTypes = COLLECTION_TYPES.map((t) => {
      const gl = collGl.get(t.key);
      return {
        key: t.key,
        label: t.label,
        glAccountCode: gl?.accountCode ?? null,
        glAccountName: gl?.name ?? null,
        mapped: !!gl,
        requiresDescription: !!t.requiresDescription,
        classifiedByAccountant: !!t.classifiedByAccountant,
      };
    });
    return { collectors, areas, collectionTypes, denominations: PESO_DENOMINATIONS };
  }

  /** Resolve each standard collection type's mapped GL account (typeKey → account). */
  private async resolveCollectionGl(orgId: string) {
    const mappingKeys = COLLECTION_TYPES.map((t) => t.mappingKey).filter((k): k is string => !!k);
    const maps = await this.prisma.accountMapping.findMany({
      where: { organizationId: orgId, mappingKey: { in: mappingKeys }, isActive: true },
      select: {
        mappingKey: true,
        chartOfAccount: { select: { id: true, accountCode: true, name: true } },
      },
    });
    const byMappingKey = new Map(maps.map((m) => [m.mappingKey, m.chartOfAccount]));
    const out = new Map<string, { id: string; accountCode: string; name: string }>();
    for (const t of COLLECTION_TYPES) {
      const gl = t.mappingKey ? byMappingKey.get(t.mappingKey) : undefined;
      if (gl) out.set(t.key, gl);
    }
    return out;
  }

  /**
   * Resolve the holding/suspense account an unclassified "Other" collection
   * credits until the accountant reclassifies it. Prefers the accountant's
   * mapping, falling back to the default COA code.
   */
  private async resolveHoldingAccount(orgId: string) {
    const mapped = await this.prisma.accountMapping.findFirst({
      where: { organizationId: orgId, mappingKey: COLLECTION_HOLDING_MAPPING_KEY, isActive: true },
      select: { chartOfAccount: { select: { id: true, accountCode: true, name: true } } },
    });
    if (mapped?.chartOfAccount) return mapped.chartOfAccount;
    return this.prisma.chartOfAccount.findFirst({
      where: {
        organizationId: orgId,
        accountCode: COLLECTION_HOLDING_DEFAULT_GL,
        isHeader: false,
        isActive: true,
      },
      select: { id: true, accountCode: true, name: true },
    });
  }

  // ── Reports ──

  async listReports(orgId: string) {
    const reports = await this.prisma.cashierCollectionReport.findMany({
      where: { organizationId: orgId },
      orderBy: { reportDate: 'desc' },
      take: 200,
      include: { _count: { select: { entries: true } } },
    });
    const jevIds = [
      ...new Set(
        reports
          .flatMap((r) => [r.journalEntryId, r.depositJournalEntryId])
          .filter((x): x is string => !!x),
      ),
    ];
    const jevs = jevIds.length
      ? await this.prisma.journalEntryVoucher.findMany({
          where: { id: { in: jevIds } },
          select: { id: true, jevNumber: true, status: true },
        })
      : [];
    const jevById = new Map(jevs.map((j) => [j.id, { jevNumber: j.jevNumber, status: j.status }]));
    return reports.map((r) => ({
      id: r.id,
      reportNumber: r.reportNumber,
      reportDate: r.reportDate,
      status: r.status,
      totalAmount: Number(r.totalAmount),
      entryCount: r._count.entries,
      submittedAt: r.submittedAt,
      collectionJev: r.journalEntryId ? (jevById.get(r.journalEntryId) ?? null) : null,
      depositRecordedAt: r.depositRecordedAt,
      depositDate: r.depositDate,
      depositJev: r.depositJournalEntryId ? (jevById.get(r.depositJournalEntryId) ?? null) : null,
    }));
  }

  private async generateReportNumber(orgId: string, year: number): Promise<string> {
    const rows = await this.prisma.cashierCollectionReport.findMany({
      where: { organizationId: orgId, reportNumber: { startsWith: `CDR-${year}-` } },
      select: { reportNumber: true },
    });
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.reportNumber.split('-')[2] ?? '0', 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `CDR-${year}-${String(max + 1).padStart(4, '0')}`;
  }

  async createReport(orgId: string, userId: string, dto: CreateCashierReportDto) {
    const reportDate = new Date(dto.reportDate);
    const reportNumber = await this.generateReportNumber(orgId, reportDate.getUTCFullYear());
    const report = await runAudited(this.prisma, userId, (tx) =>
      tx.cashierCollectionReport.create({
        data: {
          organizationId: orgId,
          reportNumber,
          reportDate,
          status: 'draft',
          cashierId: userId,
          ...(dto.remarks ? { remarks: dto.remarks } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: { id: true },
      }),
    );
    return this.getReport(orgId, report.id);
  }

  async getReport(orgId: string, id: string) {
    const report = await this.prisma.cashierCollectionReport.findFirst({
      where: { id, organizationId: orgId },
      include: { entries: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!report) throw new NotFoundException('Report not found.');

    // Resolve display fields for the entries.
    const collectorIds = [...new Set(report.entries.map((e) => e.collectorId))];
    const areaIds = [
      ...new Set(report.entries.map((e) => e.collectionAreaId).filter(Boolean)),
    ] as string[];
    const [collectors, areas, collGl, cashier, jev] = await Promise.all([
      this.prisma.collector.findMany({
        where: { id: { in: collectorIds } },
        select: { id: true, name: true },
      }),
      this.prisma.collectionArea.findMany({
        where: { id: { in: areaIds } },
        select: { id: true, name: true },
      }),
      this.resolveCollectionGl(orgId),
      this.prisma.user.findUnique({ where: { id: report.cashierId }, select: { username: true } }),
      report.journalEntryId
        ? this.prisma.journalEntryVoucher.findUnique({
            where: { id: report.journalEntryId },
            select: { jevNumber: true, status: true },
          })
        : Promise.resolve(null),
    ]);
    const cMap = new Map(collectors.map((c) => [c.id, c.name]));
    const aMap = new Map(areas.map((a) => [a.id, a.name]));

    let combined: Record<string, number> = {};
    let combinedChecks = 0;
    const entries = report.entries.map((e) => {
      const cc = (e.cashCount as Record<string, number> | null) ?? {};
      combined = addCashCounts(combined, cc);
      const glLines = ((e.glLines as CollectionLine[] | null) ?? []).map((l) => {
        const type = collectionTypeByKey.get(l.collectionType);
        const gl = collGl.get(l.collectionType);
        // "Other" carries no fixed GL — the accountant assigns it on review.
        const classifiedByAccountant = !!type?.classifiedByAccountant;
        return {
          collectionType: l.collectionType,
          collectionTypeLabel: type?.label ?? l.collectionType,
          description: l.description ?? '',
          glAccountCode: gl?.accountCode ?? '',
          glAccountName:
            gl?.name ?? (classifiedByAccountant ? 'To be classified by accountant' : '(unmapped)'),
          classifiedByAccountant,
          amount: round2(Number(l.amount)),
        };
      });
      const checks = (e.checks as CheckItem[] | null) ?? [];
      const chkTotal = checksTotal(checks);
      const cashTotal = round2(cashCountTotal(cc));
      const total = Number(e.amount); // declared total remittance
      // Checks are part of the collection: counted = cash + checks.
      const countedTotal = round2(cashTotal + chkTotal);
      // Over/(short): counted collection vs the teller's declared remittance.
      const variance = round2(countedTotal - total);
      combinedChecks = round2(combinedChecks + chkTotal);
      return {
        id: e.id,
        collectorId: e.collectorId,
        collectorName: cMap.get(e.collectorId) ?? '—',
        collectionAreaId: e.collectionAreaId,
        collectionAreaName: e.collectionAreaId ? (aMap.get(e.collectionAreaId) ?? '—') : null,
        collectionDate: e.collectionDate,
        glLines,
        orSeries: e.orSeries,
        amount: total,
        totalRemittance: total,
        checks,
        checksTotal: chkTotal,
        cashCountTotal: cashTotal,
        countedTotal,
        variance,
        cashCount: cc,
      };
    });

    return {
      id: report.id,
      reportNumber: report.reportNumber,
      reportDate: report.reportDate,
      status: report.status,
      totalAmount: Number(report.totalAmount),
      remarks: report.remarks,
      version: report.version,
      cashierName: cashier?.username ?? '',
      submittedAt: report.submittedAt,
      journalEntry: jev
        ? { id: report.journalEntryId, jevNumber: jev.jevNumber, status: jev.status }
        : null,
      entries,
      combinedCashCount: combined,
      combinedCashCountTotal: round2(cashCountTotal(combined)),
      combinedChecksTotal: combinedChecks,
      // Overall: counted collection (cash + checks) vs the declared total.
      overallCountedTotal: round2(cashCountTotal(combined) + combinedChecks),
      overallVariance: round2(
        cashCountTotal(combined) + combinedChecks - Number(report.totalAmount),
      ),
      denominations: PESO_DENOMINATIONS,
    };
  }

  private async requireDraft(orgId: string, id: string) {
    const report = await this.prisma.cashierCollectionReport.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.status !== 'draft') {
      throw new BadRequestException('This report has been submitted and can no longer be edited.');
    }
    return report;
  }

  async updateReport(orgId: string, id: string, userId: string, dto: UpdateCashierReportDto) {
    await this.requireDraft(orgId, id);
    await runAudited(this.prisma, userId, (tx) =>
      tx.cashierCollectionReport.update({
        where: { id },
        data: {
          ...(dto.reportDate ? { reportDate: new Date(dto.reportDate) } : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
          updatedBy: userId,
        },
      }),
    );
    return this.getReport(orgId, id);
  }

  async deleteReport(orgId: string, id: string, userId: string) {
    const report = await this.prisma.cashierCollectionReport.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true },
    });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.status !== 'draft') {
      throw new BadRequestException('Only draft reports can be deleted.');
    }
    await runAudited(this.prisma, userId, (tx) =>
      tx.cashierCollectionReport.delete({ where: { id } }),
    );
    return { deleted: true };
  }

  private async recomputeTotal(tx: Prisma.TransactionClient, reportId: string, userId: string) {
    const agg = await tx.cashierCollectionEntry.aggregate({
      where: { reportId },
      _sum: { amount: true },
    });
    await tx.cashierCollectionReport.update({
      where: { id: reportId },
      data: {
        totalAmount: Number(agg._sum.amount ?? 0),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  private async validateEntry(orgId: string, dto: UpsertCashierEntryDto) {
    const collector = await this.prisma.collector.findFirst({
      where: { id: dto.collectorId, organizationId: orgId },
      select: { id: true },
    });
    if (!collector) throw new BadRequestException('Select a valid collector.');
    if (dto.collectionAreaId) {
      const area = await this.prisma.collectionArea.findFirst({
        where: { id: dto.collectionAreaId, organizationId: orgId },
        select: { id: true },
      });
      if (!area) throw new BadRequestException('Select a valid collection area.');
    }
    if (!dto.lines?.length) throw new BadRequestException('Add at least one type of collection.');
    const lines: CollectionLine[] = dto.lines.map((l) => {
      const type = collectionTypeByKey.get(l.collectionType);
      if (!type) {
        throw new BadRequestException('Select a valid type of collection.');
      }
      const amt = round2(Number(l.amount));
      if (amt <= 0)
        throw new BadRequestException('Each collection amount must be greater than zero.');
      const description = l.description?.trim();
      if (type.requiresDescription && !description) {
        throw new BadRequestException(`Describe the collection for "${type.label}".`);
      }
      return {
        collectionType: l.collectionType,
        amount: amt,
        ...(description ? { description } : {}),
      };
    });
    const amount = round2(lines.reduce((s, l) => s + l.amount, 0));
    if (amount <= 0)
      throw new BadRequestException('The total remittance must be greater than zero.');
    const ct = checksTotal(dto.checks as CheckItem[] | undefined);
    if (ct > amount + 0.005)
      throw new BadRequestException('The checks total cannot exceed the total remittance.');
    return { amount, lines };
  }

  async addEntry(orgId: string, reportId: string, userId: string, dto: UpsertCashierEntryDto) {
    await this.requireDraft(orgId, reportId);
    const { amount, lines } = await this.validateEntry(orgId, dto);
    await runAudited(this.prisma, userId, async (tx) => {
      const count = await tx.cashierCollectionEntry.count({ where: { reportId } });
      await tx.cashierCollectionEntry.create({
        data: {
          reportId,
          collectorId: dto.collectorId,
          ...(dto.collectionAreaId ? { collectionAreaId: dto.collectionAreaId } : {}),
          collectionDate: new Date(dto.collectionDate),
          glLines: lines as unknown as object[],
          orSeries: dto.orSeries.trim(),
          amount,
          checks: (dto.checks as object[] | undefined) ?? [],
          cashCount: dto.cashCount,
          sortOrder: count,
        },
      });
      await this.recomputeTotal(tx, reportId, userId);
    });
    return this.getReport(orgId, reportId);
  }

  async updateEntry(
    orgId: string,
    reportId: string,
    entryId: string,
    userId: string,
    dto: UpsertCashierEntryDto,
  ) {
    await this.requireDraft(orgId, reportId);
    const entry = await this.prisma.cashierCollectionEntry.findFirst({
      where: { id: entryId, reportId },
      select: { id: true },
    });
    if (!entry) throw new NotFoundException('Entry not found.');
    const { amount, lines } = await this.validateEntry(orgId, dto);
    await runAudited(this.prisma, userId, async (tx) => {
      await tx.cashierCollectionEntry.update({
        where: { id: entryId },
        data: {
          collectorId: dto.collectorId,
          collectionAreaId: dto.collectionAreaId ?? null,
          collectionDate: new Date(dto.collectionDate),
          glLines: lines as unknown as object[],
          orSeries: dto.orSeries.trim(),
          amount,
          checks: (dto.checks as object[] | undefined) ?? [],
          cashCount: dto.cashCount,
        },
      });
      await this.recomputeTotal(tx, reportId, userId);
    });
    return this.getReport(orgId, reportId);
  }

  async deleteEntry(orgId: string, reportId: string, entryId: string, userId: string) {
    await this.requireDraft(orgId, reportId);
    const entry = await this.prisma.cashierCollectionEntry.findFirst({
      where: { id: entryId, reportId },
      select: { id: true },
    });
    if (!entry) throw new NotFoundException('Entry not found.');
    await runAudited(this.prisma, userId, async (tx) => {
      await tx.cashierCollectionEntry.delete({ where: { id: entryId } });
      await this.recomputeTotal(tx, reportId, userId);
    });
    return this.getReport(orgId, reportId);
  }

  private async nextJevNumber(
    tx: Prisma.TransactionClient,
    orgId: string,
    year: number,
  ): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ next_number: bigint }>>`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = NOW()
      WHERE organization_id = ${orgId}::uuid AND document_type = 'jev'
      RETURNING next_number`;
    if (rows[0]) return `JEV-${year}-${String(rows[0].next_number).padStart(6, '0')}`;
    const ins = await tx.$queryRaw<Array<{ next_number: bigint }>>`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${orgId}::uuid, 'jev', 'JEV-', 1)
      RETURNING next_number`;
    return `JEV-${year}-${String(ins[0]!.next_number).padStart(6, '0')}`;
  }

  /**
   * Submit the report: creates a DRAFT (for-review) journal entry for the
   * accountant — Dr Cash - Collecting Officer (total) / Cr each teller entry's
   * chosen GL account — and marks the report submitted.
   */
  async submitReport(orgId: string, id: string, userId: string, dto: SubmitCashierReportDto) {
    const report = await this.prisma.cashierCollectionReport.findFirst({
      where: { id, organizationId: orgId },
      include: { entries: true },
    });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.status !== 'draft')
      throw new BadRequestException('This report has already been submitted.');
    if (report.version !== dto.expectedVersion) {
      throw new ConflictException('The report was modified. Please refresh and try again.');
    }
    if (report.entries.length === 0) {
      throw new BadRequestException('Add at least one teller collection before submitting.');
    }
    const total = round2(report.entries.reduce((s, e) => s + Number(e.amount), 0));
    if (total <= 0)
      throw new BadRequestException('The total collection must be greater than zero.');

    // Debit account: Cash - Collecting Officer (from the posting-account mapping).
    const cashMap = await this.prisma.accountMapping.findFirst({
      where: { organizationId: orgId, mappingKey: 'cash.collecting_officer', isActive: true },
      select: { chartOfAccountId: true },
    });
    if (!cashMap?.chartOfAccountId) {
      throw new BadRequestException(
        'The "Cash - Collecting Officer" posting account is not configured. Set it up before submitting.',
      );
    }

    // Open accounting period for the report date.
    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYear: { organizationId: orgId },
        status: 'open',
        lockedAt: null,
        startDate: { lte: report.reportDate },
        endDate: { gte: report.reportDate },
      },
      select: { id: true },
    });
    if (!period) {
      throw new BadRequestException(
        `No open accounting period covers ${report.reportDate.toISOString().slice(0, 10)}. Open the period, then submit.`,
      );
    }

    // Resolve collector names for the credit-line descriptions.
    const collectors = await this.prisma.collector.findMany({
      where: { id: { in: report.entries.map((e) => e.collectorId) } },
      select: { id: true, name: true },
    });
    const cName = new Map(collectors.map((c) => [c.id, c.name]));

    const dateStr = report.reportDate.toISOString().slice(0, 10);
    // Resolve each standard collection type to its mapped GL account (the
    // accountant sets these in Accounting → Account Mappings).
    const collGl = await this.resolveCollectionGl(orgId);
    // Does any line need the holding account? Resolve it only if so.
    const hasOther = report.entries.some((e) =>
      ((e.glLines as CollectionLine[] | null) ?? []).some(
        (l) => collectionTypeByKey.get(l.collectionType)?.classifiedByAccountant,
      ),
    );
    const holding = hasOther ? await this.resolveHoldingAccount(orgId) : null;
    if (hasOther && !holding) {
      throw new BadRequestException(
        'The holding account for unclassified "Other" collections is not configured. Set "Collection — Unclassified (holding)" in Accounting → Account Mappings.',
      );
    }
    // Cr each collection line across every teller entry (a remittance may split
    // across several types — water sales, new-connection fee, guaranty deposit, …).
    // "Other" lines credit the holding account and are flagged for the accountant
    // to reclassify before the JEV can be posted.
    const creditLines = report.entries.flatMap((e) =>
      ((e.glLines as CollectionLine[] | null) ?? []).map((l) => {
        const type = collectionTypeByKey.get(l.collectionType);
        const collector = cName.get(e.collectorId) ?? 'Collector';
        if (type?.classifiedByAccountant) {
          return {
            chartOfAccountId: holding!.id,
            debitAmount: 0,
            creditAmount: round2(Number(l.amount)),
            description: `Other — ${l.description ?? ''} (${collector}, OR ${e.orSeries})`.trim(),
            pendingClassification: true,
          };
        }
        const gl = collGl.get(l.collectionType);
        if (!gl) {
          throw new BadRequestException(
            `"${type?.label ?? l.collectionType}" has no GL account mapping. Set it in Accounting → Account Mappings, then submit.`,
          );
        }
        return {
          chartOfAccountId: gl.id,
          debitAmount: 0,
          creditAmount: round2(Number(l.amount)),
          description: `${collector} — OR ${e.orSeries}`,
        };
      }),
    );
    const lines = [
      {
        chartOfAccountId: cashMap.chartOfAccountId,
        debitAmount: total,
        creditAmount: 0,
        description: `Daily collections — ${dateStr} (${report.reportNumber})`,
      },
      ...creditLines,
    ];

    const jev = await runAudited(this.prisma, userId, async (tx) => {
      const created = await tx.journalEntryVoucher.create({
        data: {
          organizationId: orgId,
          jevNumber: await this.nextJevNumber(tx, orgId, report.reportDate.getUTCFullYear()),
          jevDate: report.reportDate,
          accountingPeriodId: period.id,
          sourceType: 'collection' as never,
          sourceTable: 'cashier_collection_reports',
          sourceId: report.id,
          particulars: `Cashier daily collection report — ${dateStr} (${report.reportNumber})`,
          totalDebit: total,
          totalCredit: total,
          status: 'for_review' as never,
          createdBy: userId,
          updatedBy: userId,
          lines: { create: lines },
        },
        select: { id: true, jevNumber: true },
      });
      await tx.cashierCollectionReport.update({
        where: { id: report.id },
        data: {
          status: 'submitted',
          journalEntryId: created.id,
          submittedAt: new Date(),
          submittedBy: userId,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      return created;
    });

    return { ...(await this.getReport(orgId, id)), jevNumber: jev.jevNumber };
  }

  /** Active bank accounts the cashier can deposit to (id + display label). */
  async listBankAccounts(orgId: string) {
    const accts = await this.prisma.bankAccount.findMany({
      where: { organizationId: orgId, status: 'active' },
      orderBy: { accountName: 'asc' },
      select: {
        id: true,
        accountName: true,
        accountNumber: true,
        chartOfAccountId: true,
        bank: { select: { code: true } },
      },
    });
    return accts.map((a) => ({
      id: a.id,
      label: `${a.bank.code} — ${a.accountName} (${a.accountNumber})`,
      hasGl: !!a.chartOfAccountId,
    }));
  }

  /**
   * Record that a submitted report's collections now appear in the bank
   * passbook/statement. Creates a DRAFT (for-review) journal entry —
   * Dr Cash in Bank / Cr Cash - Collecting Officer — for the accountant to post.
   */
  async recordDeposit(
    orgId: string,
    id: string,
    userId: string,
    dto: { depositDate: string; bankAccountId: string },
  ) {
    const report = await this.prisma.cashierCollectionReport.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.status !== 'submitted') {
      throw new BadRequestException('Only a submitted report can be marked as deposited.');
    }
    if (report.depositRecordedAt) {
      throw new BadRequestException('The deposit for this report has already been recorded.');
    }
    const total = round2(Number(report.totalAmount));
    if (total <= 0) throw new BadRequestException('This report has no collection to deposit.');

    const bank = await this.prisma.bankAccount.findFirst({
      where: { id: dto.bankAccountId, organizationId: orgId, status: 'active' },
      select: {
        id: true,
        chartOfAccountId: true,
        accountName: true,
        bank: { select: { code: true } },
      },
    });
    if (!bank) throw new BadRequestException('Select a valid bank account.');
    if (!bank.chartOfAccountId) {
      throw new BadRequestException('The selected bank account is not linked to a GL account.');
    }

    const cashMap = await this.prisma.accountMapping.findFirst({
      where: { organizationId: orgId, mappingKey: 'cash.collecting_officer', isActive: true },
      select: { chartOfAccountId: true },
    });
    if (!cashMap?.chartOfAccountId) {
      throw new BadRequestException(
        'The "Cash - Collecting Officer" posting account is not configured.',
      );
    }

    const depositDate = new Date(dto.depositDate);
    if (isNaN(depositDate.getTime()))
      throw new BadRequestException('A valid deposit date is required.');
    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        fiscalYear: { organizationId: orgId },
        status: 'open',
        lockedAt: null,
        startDate: { lte: depositDate },
        endDate: { gte: depositDate },
      },
      select: { id: true },
    });
    if (!period) {
      throw new BadRequestException(
        `No open accounting period covers ${dto.depositDate}. Open the period, then record the deposit.`,
      );
    }

    const dateStr = depositDate.toISOString().slice(0, 10);
    const bankLabel = `${bank.bank.code} — ${bank.accountName}`;
    const lines = [
      {
        chartOfAccountId: bank.chartOfAccountId,
        debitAmount: total,
        creditAmount: 0,
        description: `Deposit to ${bankLabel}`,
      },
      {
        chartOfAccountId: cashMap.chartOfAccountId,
        debitAmount: 0,
        creditAmount: total,
        description: `Deposit of collections — ${report.reportNumber}`,
      },
    ];

    const jev = await runAudited(this.prisma, userId, async (tx) => {
      const created = await tx.journalEntryVoucher.create({
        data: {
          organizationId: orgId,
          jevNumber: await this.nextJevNumber(tx, orgId, depositDate.getUTCFullYear()),
          jevDate: depositDate,
          accountingPeriodId: period.id,
          sourceType: 'collection' as never,
          sourceTable: 'cashier_collection_reports',
          sourceId: report.id,
          particulars: `Deposit of daily collections to ${bankLabel} — ${dateStr} (${report.reportNumber})`,
          totalDebit: total,
          totalCredit: total,
          status: 'for_review' as never,
          createdBy: userId,
          updatedBy: userId,
          lines: { create: lines },
        },
        select: { id: true, jevNumber: true },
      });
      await tx.cashierCollectionReport.update({
        where: { id: report.id },
        data: {
          depositRecordedAt: new Date(),
          depositDate,
          depositJournalEntryId: created.id,
          depositBankAccountId: bank.id,
          depositRecordedBy: userId,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      return created;
    });
    return { depositJevNumber: jev.jevNumber };
  }

  /** Counts for the Cashiering Dashboard tiles (each links to its worklist). */
  async getDashboardCounts(orgId: string) {
    const reports = await this.prisma.cashierCollectionReport.findMany({
      where: { organizationId: orgId },
      select: {
        status: true,
        depositRecordedAt: true,
        journalEntryId: true,
        depositJournalEntryId: true,
      },
    });
    const collectionJevIds = reports.map((r) => r.journalEntryId).filter((x): x is string => !!x);
    const depositJevIds = reports
      .map((r) => r.depositJournalEntryId)
      .filter((x): x is string => !!x);
    const allJevIds = [...collectionJevIds, ...depositJevIds];
    const [checksDueForPrinting, unclearedChecks, notPostedJevs] = await Promise.all([
      this.prisma.check.count({ where: { organizationId: orgId, status: 'pending' } }),
      this.prisma.check.count({
        where: { organizationId: orgId, status: { in: ['printed', 'released'] } },
      }),
      allJevIds.length
        ? this.prisma.journalEntryVoucher.findMany({
            where: { id: { in: allJevIds }, status: { in: ['for_review', 'approved'] } },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);
    const notPosted = new Set(notPostedJevs.map((j) => j.id));
    return {
      checksDueForPrinting,
      unclearedChecks,
      undepositedCollections: reports.filter(
        (r) => r.status === 'submitted' && !r.depositRecordedAt,
      ).length,
      collectionsNotPosted: collectionJevIds.filter((jid) => notPosted.has(jid)).length,
      depositsNotPosted: depositJevIds.filter((jid) => notPosted.has(jid)).length,
    };
  }
}

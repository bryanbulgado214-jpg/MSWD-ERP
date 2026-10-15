import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

type Category = 'goods' | 'services' | 'infrastructure' | 'consulting_services';
type Classification = 'inventory' | 'asset' | 'expense' | 'infrastructure' | 'service';

export interface CreateAppItemInput {
  fiscalYearId: string;
  // Optional: omit for a direct APP line (an item in the APP that is not in any
  // PPMP, e.g. a GenSet). When set, it must be an approved PPMP item.
  ppmpItemId?: string;
  // Optional: auto-generated (APP-<year>-NNN) when omitted.
  appNumber?: string;
  procurementProjectTitle: string;
  procurementCategory: Category;
  approvedBudget: number | string;
  procurementMode?: string;
  scheduleMonth?: number;
  // Direct-line detail (used when there is no PPMP parent).
  departmentId?: string;
  endUserId?: string;
  quantity?: number | string;
  unitOfMeasure?: string;
  estimatedUnitCost?: number | string;
  classification?: Classification;
  createdBy?: string;
}

export interface AppUploadResult {
  created: number;
  skipped: number; // rows already in the APP (deduped by title + office)
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
}

// ── Upload template ──
const APP_TEMPLATE_HEADERS = [
  'Procurement Project / Item',
  'Category',
  'Classification (CAPEX / MOOE)',
  'Office / Department (code or name)',
  'End-User (name, optional)',
  'Mode of Procurement',
  'Schedule (Month 1-12)',
  'Quantity',
  'Unit of Measure',
  'Estimated Unit Cost',
  'Approved Budget (ABC)',
];
const APP_TEMPLATE_EXAMPLE = [
  'Generator Set (GenSet), 50 kVA',
  'goods',
  'CAPEX',
  'GSO',
  '',
  'Public Bidding',
  6,
  1,
  'unit',
  850000,
  850000,
];

function normKey(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}
function normalizeCategory(raw: string): Category | null {
  const n = normKey(raw);
  if (!n) return 'goods';
  if (n === 'goods' || n === 'good') return 'goods';
  if (n === 'services' || n === 'service') return 'services';
  if (n === 'infrastructure' || n === 'infra') return 'infrastructure';
  if (n.startsWith('consulting')) return 'consulting_services';
  return null;
}
// CAPEX (capital outlay) → asset; MOOE (operating) → expense; explicit class
// names are accepted as-is. Blank → no hint.
function normalizeClassification(raw: string): Classification | null {
  const n = normKey(raw);
  if (!n) return null;
  if (n === 'capex' || n === 'capitaloutlay' || n === 'co' || n === 'capital') return 'asset';
  if (n === 'mooe' || n === 'operating' || n === 'opex') return 'expense';
  if (n === 'asset' || n === 'ppe' || n === 'assets') return 'asset';
  if (n === 'infrastructure' || n === 'infra') return 'infrastructure';
  if (n === 'expense' || n === 'expenses') return 'expense';
  if (n === 'inventory' || n === 'supplies') return 'inventory';
  if (n === 'service' || n === 'services') return 'service';
  return null;
}

@Injectable()
export class AppItemService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, input: CreateAppItemInput) {
    // Two kinds of APP line: one derived from an approved PPMP item, or a direct
    // entry (in the APP but not in any PPMP) that carries its own detail.
    if (input.ppmpItemId) {
      const ppmpItem = await this.prisma.ppmpItem.findFirst({
        where: { id: input.ppmpItemId, organizationId, status: 'approved' },
      });
      if (!ppmpItem) {
        throw new BadRequestException('APP item must reference an approved PPMP item.');
      }
    } else if (!input.procurementProjectTitle?.trim()) {
      throw new BadRequestException('A direct APP item needs a procurement project / item title.');
    }

    const appNumber = input.appNumber ?? (await this.nextAppNumber(organizationId, input.fiscalYearId));

    return runAudited(this.prisma, input.createdBy, (tx) =>
      tx.appItem.create({
        data: {
          organizationId,
          fiscalYearId: input.fiscalYearId,
          ppmpItemId: input.ppmpItemId ?? null,
          appNumber,
          procurementProjectTitle: input.procurementProjectTitle,
          procurementCategory: input.procurementCategory,
          approvedBudget: new Prisma.Decimal(input.approvedBudget),
          procurementMode: input.procurementMode ?? null,
          scheduleMonth: input.scheduleMonth ?? null,
          // Direct-line detail; left null for PPMP-derived lines (read via ppmpItem).
          departmentId: input.ppmpItemId ? null : (input.departmentId ?? null),
          endUserId: input.ppmpItemId ? null : (input.endUserId ?? null),
          quantity:
            !input.ppmpItemId && input.quantity != null
              ? new Prisma.Decimal(input.quantity)
              : null,
          unitOfMeasure: input.ppmpItemId ? null : (input.unitOfMeasure ?? null),
          estimatedUnitCost:
            !input.ppmpItemId && input.estimatedUnitCost != null
              ? new Prisma.Decimal(input.estimatedUnitCost)
              : null,
          classification: input.ppmpItemId ? null : (input.classification ?? null),
          // A direct APP line is a management/BAC decision already approved, so it
          // is immediately citeable on a PR and visible in the utilization report.
          status: input.ppmpItemId ? 'draft' : 'approved',
          createdBy: input.createdBy ?? null,
        },
      }),
    );
  }

  /** Next free APP number (APP-<year>-NNN) for a fiscal year. */
  private async nextAppNumber(organizationId: string, fiscalYearId: string): Promise<string> {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId },
      select: { year: true },
    });
    if (!fy) throw new BadRequestException('Fiscal year not found.');
    const existing = await this.prisma.appItem.findMany({
      where: { organizationId, fiscalYearId },
      select: { appNumber: true },
    });
    const used = new Set(existing.map((a) => a.appNumber));
    let seq = existing.length + 1;
    let n: string;
    do {
      n = `APP-${fy.year}-${String(seq).padStart(3, '0')}`;
      seq++;
    } while (used.has(n));
    return n;
  }

  async findAll(organizationId: string, filters?: { fiscalYearId?: string; status?: string }) {
    return this.prisma.appItem.findMany({
      where: {
        organizationId,
        ...(filters?.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
        ...(filters?.status ? { status: filters.status as 'draft' | 'approved' | 'cancelled' } : {}),
      },
      include: {
        ppmpItem: {
          select: {
            id: true,
            code: true,
            itemDescription: true,
            quantity: true,
            unitOfMeasure: true,
            estimatedTotalCost: true,
            scheduleQuarter: true,
            department: { select: { id: true, code: true, name: true } },
            assignedUser: { select: { id: true, username: true } },
          },
        },
        // Own office / end-user for direct (non-PPMP) lines.
        department: { select: { id: true, code: true, name: true } },
        endUser: { select: { id: true, name: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
      },
      orderBy: { appNumber: 'asc' },
    });
  }

  /**
   * Consolidate the Annual Procurement Plan: for every APPROVED PPMP item in the
   * fiscal year that is not yet on the APP, create an APP line (one per PPMP
   * item, so the APP lists each end-user office's planned procurements). Safe to
   * re-run — it only adds what is missing.
   */
  async consolidate(organizationId: string, fiscalYearId: string, actorUserId: string) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id: fiscalYearId, organizationId },
    });
    if (!fy) throw new BadRequestException('Fiscal year not found.');

    const approved = await this.prisma.ppmpItem.findMany({
      where: { organizationId, fiscalYearId, status: 'approved' },
      orderBy: { code: 'asc' },
    });

    const existingApp = await this.prisma.appItem.findMany({
      where: { organizationId, fiscalYearId },
      select: { ppmpItemId: true, appNumber: true },
    });
    const covered = new Set(existingApp.map((a) => a.ppmpItemId));
    const usedNumbers = new Set(existingApp.map((a) => a.appNumber));

    const toAdd = approved.filter((p) => !covered.has(p.id));
    const quarterToMonth: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 };
    let seq = existingApp.length + 1;
    const genAppNumber = (): string => {
      let n: string;
      do {
        n = `APP-${fy.year}-${String(seq).padStart(3, '0')}`;
        seq++;
      } while (usedNumbers.has(n));
      usedNumbers.add(n);
      return n;
    };

    if (toAdd.length > 0) {
      await runAudited(this.prisma, actorUserId, async (tx) => {
        for (const p of toAdd) {
          await tx.appItem.create({
            data: {
              organizationId,
              fiscalYearId,
              ppmpItemId: p.id,
              appNumber: genAppNumber(),
              procurementProjectTitle: p.itemDescription,
              procurementCategory: p.procurementCategory,
              approvedBudget: p.estimatedTotalCost,
              procurementMode: p.modeOfProcurement ?? null,
              scheduleMonth:
                p.scheduleQuarter != null ? (quarterToMonth[p.scheduleQuarter] ?? null) : null,
              // PPMPs are the approved budget, so the APP lines they produce are
              // approved too (ready to be cited on a purchase request).
              status: 'approved',
              createdBy: actorUserId,
            },
          });
        }
      });
    }

    const grandTotal = approved.reduce(
      (sum, p) => sum.add(p.estimatedTotalCost),
      new Prisma.Decimal(0),
    );

    return {
      created: toAdd.length,
      alreadyInApp: covered.size,
      totalApprovedPpmp: approved.length,
      grandTotalBudget: grandTotal.toString(),
    };
  }

  async findOne(organizationId: string, id: string) {
    const item = await this.prisma.appItem.findFirst({
      where: { id, organizationId },
      include: {
        ppmpItem: { select: { id: true, code: true, itemDescription: true, estimatedTotalCost: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
        purchaseRequests: { select: { id: true, prNumber: true, totalAmount: true, status: true } },
      },
    });
    if (!item) throw new NotFoundException(`APP item ${id} not found.`);
    return item;
  }

  async approve(organizationId: string, id: string, actorUserId: string) {
    const item = await this.prisma.appItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException(`APP item ${id} not found.`);
    if (item.status !== 'draft') {
      throw new BadRequestException(`APP item is "${item.status}" and cannot be approved.`);
    }
    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.appItem.update({
        where: { id },
        data: { status: 'approved' },
      }),
    );
  }

  /** Blank "Upload Official APP" template (.xlsx) with one example row. */
  buildTemplate(): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([APP_TEMPLATE_HEADERS, APP_TEMPLATE_EXAMPLE]);
    ws['!cols'] = APP_TEMPLATE_HEADERS.map(() => ({ wch: 26 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'APP');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Bulk-create direct APP items (in the APP but not in any PPMP, e.g. CAPEX)
   * from an uploaded Excel file, scoped to one fiscal year. Rows already present
   * in the APP (same title + office) are skipped so re-uploading is safe. Valid
   * rows are created approved in one audited transaction.
   */
  async uploadExcel(
    organizationId: string,
    buffer: Buffer,
    opts: { fiscalYearId: string; actorUserId: string },
  ): Promise<AppUploadResult> {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id: opts.fiscalYearId, organizationId },
      select: { id: true, year: true },
    });
    if (!fy) throw new BadRequestException('Fiscal year not found.');

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('Could not read the file — is it a valid .xlsx workbook?');
    }
    const firstSheetName = workbook.SheetNames[0];
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
    if (!sheet) throw new BadRequestException('The uploaded file has no worksheet.');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (rows.length === 0) throw new BadRequestException('The uploaded file has no data rows.');

    const sampleKeys = Object.keys(rows[0] as Record<string, unknown>);
    const keyFor = (candidates: string[]): string | null => {
      for (const k of sampleKeys) {
        const nk = normKey(k);
        if (candidates.some((c) => nk === c || nk.includes(c))) return k;
      }
      return null;
    };
    const colTitle = keyFor(['procurementproject', 'projecttitle', 'item', 'description', 'project']);
    const colCat = keyFor(['category', 'procurementcategory']);
    const colClass = keyFor(['classification', 'capex', 'expenseclass']);
    const colDept = keyFor(['office', 'department', 'dept']);
    const colEndUser = keyFor(['enduser', 'user']);
    const colMode = keyFor(['modeofprocurement', 'mode']);
    const colSched = keyFor(['schedule', 'month']);
    const colQty = keyFor(['quantity', 'qty']);
    const colUom = keyFor(['unitofmeasure', 'uom', 'unit']);
    const colUnitCost = keyFor(['estimatedunitcost', 'unitcost', 'estunitcost']);
    const colBudget = keyFor(['approvedbudget', 'abc', 'budget']);

    if (!colTitle) {
      throw new BadRequestException(
        'Missing the "Procurement Project / Item" column. Download the template to see the expected columns.',
      );
    }

    // Office + end-user lookups (match by code or name).
    const departments = await this.prisma.department.findMany({
      where: { organizationId },
      select: { id: true, code: true, name: true },
    });
    const deptByKey = new Map<string, string>();
    for (const d of departments) {
      deptByKey.set(normKey(d.code), d.id);
      deptByKey.set(normKey(d.name), d.id);
    }
    const endUsers = await this.prisma.ppmpEndUser.findMany({
      where: { organizationId },
      select: { id: true, name: true, departmentId: true },
    });

    // Existing APP lines (this fiscal year) for dedupe by title + office. A
    // PPMP-derived line's office comes through its PPMP item.
    const existing = await this.prisma.appItem.findMany({
      where: { organizationId, fiscalYearId: opts.fiscalYearId },
      select: {
        appNumber: true,
        procurementProjectTitle: true,
        departmentId: true,
        ppmpItem: { select: { departmentId: true } },
      },
    });
    const usedNumbers = new Set(existing.map((e) => e.appNumber));
    const dedupeKey = (title: string, deptId: string | null) => `${normKey(title)}|${deptId ?? ''}`;
    const existingKeys = new Set(
      existing.map((e) => dedupeKey(e.procurementProjectTitle, e.departmentId ?? e.ppmpItem?.departmentId ?? null)),
    );

    let seq = existing.length + 1;
    const genAppNumber = (): string => {
      let n: string;
      do {
        n = `APP-${fy.year}-${String(seq).padStart(3, '0')}`;
        seq++;
      } while (usedNumbers.has(n));
      usedNumbers.add(n);
      return n;
    };

    const errors: { row: number; message: string }[] = [];
    const warnings: { row: number; message: string }[] = [];
    const toCreate: Prisma.AppItemUncheckedCreateInput[] = [];
    let skipped = 0;

    rows.forEach((raw, i) => {
      const rowNum = i + 2; // header occupies row 1
      const title = String(raw[colTitle] ?? '').trim();
      const budgetStr = colBudget ? String(raw[colBudget] ?? '').trim() : '';
      const qtyStr = colQty ? String(raw[colQty] ?? '').trim() : '';
      const costStr = colUnitCost ? String(raw[colUnitCost] ?? '').trim() : '';
      // Ignore fully-blank rows (trailing empty lines).
      if (!title && !budgetStr && !qtyStr && !costStr) return;
      if (!title) {
        errors.push({ row: rowNum, message: 'Missing procurement project / item.' });
        return;
      }

      const qty = qtyStr ? Number(qtyStr.replace(/,/g, '')) : null;
      const cost = costStr ? Number(costStr.replace(/,/g, '')) : null;
      if (qty != null && (!Number.isFinite(qty) || qty < 0)) {
        errors.push({ row: rowNum, message: 'Quantity must be a non-negative number.' });
        return;
      }
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
        errors.push({ row: rowNum, message: 'Estimated unit cost must be a non-negative number.' });
        return;
      }
      let budget = budgetStr ? Number(budgetStr.replace(/,/g, '')) : NaN;
      if (!Number.isFinite(budget)) {
        if (qty != null && cost != null) budget = qty * cost;
        else {
          errors.push({
            row: rowNum,
            message: 'Enter an Approved Budget (ABC), or both Quantity and Estimated Unit Cost.',
          });
          return;
        }
      }
      if (budget <= 0) {
        errors.push({ row: rowNum, message: 'Approved Budget must be greater than zero.' });
        return;
      }

      const catRaw = colCat ? String(raw[colCat] ?? '') : '';
      const category = normalizeCategory(catRaw);
      if (category === null) {
        errors.push({
          row: rowNum,
          message: `Unknown category "${catRaw}". Use goods, services, infrastructure, or consulting_services.`,
        });
        return;
      }
      const classification = normalizeClassification(colClass ? String(raw[colClass] ?? '') : '');

      let departmentId: string | null = null;
      if (colDept) {
        const dRaw = String(raw[colDept] ?? '').trim();
        if (dRaw) {
          const did = deptByKey.get(normKey(dRaw));
          if (did) departmentId = did;
          else warnings.push({ row: rowNum, message: `Office "${dRaw}" not found — left unassigned.` });
        }
      }

      // Dedupe against what is already in the APP (title + office).
      if (existingKeys.has(dedupeKey(title, departmentId))) {
        skipped++;
        return;
      }
      existingKeys.add(dedupeKey(title, departmentId));

      let endUserId: string | null = null;
      if (colEndUser) {
        const uRaw = String(raw[colEndUser] ?? '').trim();
        if (uRaw) {
          const matches = endUsers.filter((u) => normKey(u.name) === normKey(uRaw));
          const pick =
            matches.find((u) => departmentId && u.departmentId === departmentId) ?? matches[0];
          if (pick) endUserId = pick.id;
          else warnings.push({ row: rowNum, message: `End-user "${uRaw}" not found — left blank.` });
        }
      }

      let scheduleMonth: number | null = null;
      if (colSched) {
        const m = parseInt(String(raw[colSched] ?? '').replace(/[^0-9]/g, ''), 10);
        if (m >= 1 && m <= 12) scheduleMonth = m;
      }

      toCreate.push({
        organizationId,
        fiscalYearId: opts.fiscalYearId,
        appNumber: genAppNumber(),
        procurementProjectTitle: title,
        procurementCategory: category,
        approvedBudget: new Prisma.Decimal(budget),
        ...(colMode && String(raw[colMode] ?? '').trim()
          ? { procurementMode: String(raw[colMode]).trim() }
          : {}),
        ...(scheduleMonth != null ? { scheduleMonth } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(endUserId ? { endUserId } : {}),
        ...(qty != null ? { quantity: new Prisma.Decimal(qty) } : {}),
        ...(colUom && String(raw[colUom] ?? '').trim()
          ? { unitOfMeasure: String(raw[colUom]).trim() }
          : {}),
        ...(cost != null ? { estimatedUnitCost: new Prisma.Decimal(cost) } : {}),
        ...(classification ? { classification } : {}),
        status: 'approved',
        createdBy: opts.actorUserId,
      });
    });

    if (toCreate.length > 0) {
      await runAudited(this.prisma, opts.actorUserId, async (tx) => {
        for (const data of toCreate) {
          await tx.appItem.create({ data });
        }
      });
    }

    return { created: toCreate.length, skipped, errors, warnings };
  }
}

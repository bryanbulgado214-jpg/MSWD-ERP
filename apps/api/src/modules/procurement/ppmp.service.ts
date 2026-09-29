import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

/** Column headers for the PPMP upload template, in order. */
const TEMPLATE_HEADERS = [
  'Code (optional)',
  'Item Description',
  'Category',
  'Unit of Measure',
  'Quantity',
  'Estimated Unit Cost',
  'Mode of Procurement',
  'Schedule (Quarter 1-4)',
  'Assigned End-User (username, optional)',
  'Notes',
];

const TEMPLATE_EXAMPLE = [
  'ADM-001',
  'Bond paper A4, 80gsm',
  'goods',
  'ream',
  50,
  250,
  'Small Value Procurement',
  1,
  '',
  'For office use',
];

/** Normalise a header/label to letters+digits only, for fuzzy column matching. */
function normKey(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Map a free-text category to a valid enum value, or null if unrecognised. */
function normalizeCategory(raw: string): 'goods' | 'services' | 'infrastructure' | 'consulting_services' | null {
  const n = normKey(raw);
  if (!n) return 'goods';
  if (n === 'goods' || n === 'good') return 'goods';
  if (n === 'services' || n === 'service') return 'services';
  if (n === 'infrastructure' || n === 'infra') return 'infrastructure';
  if (n.startsWith('consulting')) return 'consulting_services';
  return null;
}

export interface PpmpUploadResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
}

export interface CreatePpmpItemInput {
  fiscalYearId: string;
  departmentId: string;
  assignedUserId?: string;
  code: string;
  itemDescription: string;
  procurementCategory: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
  unitOfMeasure: string;
  quantity: number | string;
  estimatedUnitCost: number | string;
  modeOfProcurement?: string;
  scheduleQuarter?: number;
  cboNotes?: string;
  createdBy?: string;
}

export interface UpdatePpmpItemInput {
  assignedUserId?: string | null;
  itemDescription?: string;
  procurementCategory?: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
  unitOfMeasure?: string;
  quantity?: number | string;
  estimatedUnitCost?: number | string;
  modeOfProcurement?: string | null;
  scheduleQuarter?: number | null;
  cboNotes?: string | null;
  updatedBy?: string;
}

@Injectable()
export class PpmpService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, input: CreatePpmpItemInput) {
    const qty = new Prisma.Decimal(input.quantity);
    const unitCost = new Prisma.Decimal(input.estimatedUnitCost);
    const totalCost = qty.mul(unitCost);

    return runAudited(this.prisma, input.createdBy, (tx) =>
      tx.ppmpItem.create({
        data: {
          organizationId,
          fiscalYearId: input.fiscalYearId,
          departmentId: input.departmentId,
          ...(input.assignedUserId ? { assignedUserId: input.assignedUserId } : {}),
          code: input.code,
          itemDescription: input.itemDescription,
          procurementCategory: input.procurementCategory,
          unitOfMeasure: input.unitOfMeasure,
          quantity: qty,
          estimatedUnitCost: unitCost,
          estimatedTotalCost: totalCost,
          ...(input.modeOfProcurement ? { modeOfProcurement: input.modeOfProcurement } : {}),
          ...(input.scheduleQuarter != null ? { scheduleQuarter: input.scheduleQuarter } : {}),
          ...(input.cboNotes ? { cboNotes: input.cboNotes } : {}),
          // A water district's PPMP is its approved budget (funds are on hand
          // from internally-generated income), so items are approved on entry.
          status: 'approved',
          approvedBy: input.createdBy ?? null,
          approvedAt: new Date(),
          createdBy: input.createdBy ?? null,
        },
        include: {
          department: { select: { id: true, code: true, name: true } },
          assignedUser: { select: { id: true, username: true, email: true } },
        },
      }),
    );
  }

  async update(organizationId: string, id: string, input: UpdatePpmpItemInput) {
    const item = await this.prisma.ppmpItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException(`PPMP item ${id} not found.`);
    if (item.status !== 'draft') {
      throw new BadRequestException(`Cannot update PPMP item in "${item.status}" status.`);
    }

    const updates: Prisma.PpmpItemUncheckedUpdateInput = {};

    if (input.updatedBy) updates.updatedBy = input.updatedBy;
    if (input.assignedUserId !== undefined) updates.assignedUserId = input.assignedUserId;
    if (input.itemDescription !== undefined) updates.itemDescription = input.itemDescription;
    if (input.procurementCategory !== undefined) updates.procurementCategory = input.procurementCategory;
    if (input.unitOfMeasure !== undefined) updates.unitOfMeasure = input.unitOfMeasure;
    if (input.modeOfProcurement !== undefined) updates.modeOfProcurement = input.modeOfProcurement;
    if (input.scheduleQuarter !== undefined) updates.scheduleQuarter = input.scheduleQuarter;
    if (input.cboNotes !== undefined) updates.cboNotes = input.cboNotes;

    if (input.quantity !== undefined || input.estimatedUnitCost !== undefined) {
      const qty = input.quantity !== undefined ? new Prisma.Decimal(input.quantity) : item.quantity;
      const unitCost = input.estimatedUnitCost !== undefined
        ? new Prisma.Decimal(input.estimatedUnitCost)
        : item.estimatedUnitCost;
      updates.quantity = qty;
      updates.estimatedUnitCost = unitCost;
      updates.estimatedTotalCost = qty.mul(unitCost);
    }

    return runAudited(this.prisma, input.updatedBy, (tx) =>
      tx.ppmpItem.update({
        where: { id },
        data: updates,
        include: {
          department: { select: { id: true, code: true, name: true } },
          assignedUser: { select: { id: true, username: true, email: true } },
        },
      }),
    );
  }

  async findAll(organizationId: string, filters?: {
    fiscalYearId?: string;
    departmentId?: string;
    assignedUserId?: string;
    status?: string;
  }) {
    return this.prisma.ppmpItem.findMany({
      where: {
        organizationId,
        ...(filters?.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
        ...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters?.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
        ...(filters?.status ? { status: filters.status as 'draft' | 'approved' | 'cancelled' } : {}),
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
        assignedUser: { select: { id: true, username: true, email: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findMyItems(organizationId: string, userId: string, fiscalYearId?: string) {
    const items = await this.prisma.ppmpItem.findMany({
      where: {
        organizationId,
        assignedUserId: userId,
        status: 'approved',
        ...(fiscalYearId ? { fiscalYearId } : {}),
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
      },
      orderBy: { code: 'asc' },
    });

    const itemsWithRemaining = await Promise.all(
      items.map(async (item) => {
        const prTotals = await this.prisma.purchaseRequest.aggregate({
          where: {
            ppmpItemId: item.id,
            organizationId,
            status: { notIn: ['cancelled', 'rejected', 'voided'] },
          },
          _sum: { totalAmount: true },
        });
        const requested = prTotals._sum.totalAmount ?? new Prisma.Decimal(0);
        const prQty = await this.prisma.purchaseRequestItem.aggregate({
          where: {
            purchaseRequest: {
              ppmpItemId: item.id,
              organizationId,
              status: { notIn: ['cancelled', 'rejected', 'voided'] },
            },
          },
          _sum: { quantity: true },
        });
        const usedQty = prQty._sum.quantity ?? new Prisma.Decimal(0);
        return {
          ...item,
          requestedAmount: requested,
          remainingAmount: item.estimatedTotalCost.sub(requested),
          usedQuantity: usedQty,
          remainingQuantity: item.quantity.sub(usedQty),
        };
      }),
    );

    return itemsWithRemaining;
  }

  async findOne(organizationId: string, id: string) {
    const item = await this.prisma.ppmpItem.findFirst({
      where: { id, organizationId },
      include: {
        department: { select: { id: true, code: true, name: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
        assignedUser: { select: { id: true, username: true, email: true } },
        appItems: true,
        purchaseRequests: { select: { id: true, prNumber: true, totalAmount: true, status: true } },
      },
    });
    if (!item) throw new NotFoundException(`PPMP item ${id} not found.`);
    return item;
  }

  async approve(organizationId: string, id: string, actorUserId: string) {
    const item = await this.prisma.ppmpItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException(`PPMP item ${id} not found.`);
    if (item.status !== 'draft') {
      throw new BadRequestException(`PPMP item is "${item.status}" and cannot be approved.`);
    }
    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.ppmpItem.update({
        where: { id },
        data: { status: 'approved', approvedBy: actorUserId, approvedAt: new Date() },
      }),
    );
  }

  async bulkApprove(organizationId: string, ids: string[], actorUserId: string) {
    return runAudited(this.prisma, actorUserId, (tx) =>
      tx.ppmpItem.updateMany({
        where: {
          id: { in: ids },
          organizationId,
          status: 'draft',
        },
        data: { status: 'approved', approvedBy: actorUserId, approvedAt: new Date() },
      }),
    );
  }

  /** Build the blank PPMP upload template (.xlsx) with one example row. */
  buildTemplate(): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]);
    ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 24 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PPMP');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Bulk-create PPMP items from an uploaded Excel file, scoped to one fiscal
   * year + end-user department. Valid rows are created together in one audited
   * transaction; invalid rows are skipped and reported. A blank "Code" cell is
   * auto-numbered from the department code.
   */
  async uploadExcel(
    organizationId: string,
    buffer: Buffer,
    opts: {
      fiscalYearId: string;
      departmentId: string;
      defaultAssignedUserId?: string;
      actorUserId: string;
    },
  ): Promise<PpmpUploadResult> {
    const department = await this.prisma.department.findFirst({
      where: { id: opts.departmentId, organizationId },
    });
    if (!department) throw new BadRequestException('Department not found.');
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id: opts.fiscalYearId, organizationId },
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
    const colCode = keyFor(['code']);
    const colDesc = keyFor(['itemdescription', 'description', 'generaldescription', 'item']);
    const colCat = keyFor(['category', 'procurementcategory']);
    const colUom = keyFor(['unitofmeasure', 'uom', 'unit']);
    const colQty = keyFor(['quantity', 'qty']);
    const colUnitCost = keyFor(['estimatedunitcost', 'unitcost', 'estunitcost']);
    const colMode = keyFor(['modeofprocurement', 'mode']);
    const colQuarter = keyFor(['schedulequarter', 'quarter', 'schedule']);
    const colAssigned = keyFor(['assignedenduser', 'assigneduser', 'enduser', 'assignedto']);
    const colNotes = keyFor(['notes', 'cbonotes', 'remarks']);

    if (!colDesc || !colQty || !colUnitCost) {
      throw new BadRequestException(
        'Missing required columns. The file needs Item Description, Quantity, and Estimated Unit Cost columns.',
      );
    }

    const existing = await this.prisma.ppmpItem.findMany({
      where: { organizationId },
      select: { code: true },
    });
    const usedCodes = new Set(existing.map((e) => e.code.toLowerCase()));
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      select: { id: true, username: true, email: true },
    });
    const userByName = new Map<string, string>();
    for (const u of users) {
      userByName.set(u.username.toLowerCase(), u.id);
      if (u.email) userByName.set(u.email.toLowerCase(), u.id);
    }

    const errors: { row: number; message: string }[] = [];
    const warnings: { row: number; message: string }[] = [];
    const toCreate: Prisma.PpmpItemUncheckedCreateInput[] = [];

    let seq = 1;
    const baseCode = (department.code || 'PPMP').toUpperCase().replace(/\s+/g, '');
    const genCode = (): string => {
      let code: string;
      do {
        code = `${baseCode}-${fy.year}-${String(seq).padStart(3, '0')}`;
        seq++;
      } while (usedCodes.has(code.toLowerCase()));
      usedCodes.add(code.toLowerCase());
      return code;
    };

    rows.forEach((raw, i) => {
      const rowNum = i + 2; // header occupies row 1
      const desc = String(raw[colDesc] ?? '').trim();
      const qtyStr = String(raw[colQty] ?? '').trim();
      const costStr = String(raw[colUnitCost] ?? '').trim();
      // Silently ignore fully-blank rows (trailing empty lines).
      if (!desc && !qtyStr && !costStr) return;
      if (!desc) {
        errors.push({ row: rowNum, message: 'Missing item description.' });
        return;
      }
      const qty = Number(qtyStr.replace(/,/g, ''));
      const cost = Number(costStr.replace(/,/g, ''));
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push({ row: rowNum, message: 'Quantity must be a positive number.' });
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        errors.push({ row: rowNum, message: 'Estimated unit cost must be a non-negative number.' });
        return;
      }
      const catRaw = colCat ? String(raw[colCat] ?? '').trim() : '';
      const category = normalizeCategory(catRaw);
      if (category === null) {
        errors.push({
          row: rowNum,
          message: `Unknown category "${catRaw}". Use goods, services, infrastructure, or consulting_services.`,
        });
        return;
      }

      let code = colCode ? String(raw[colCode] ?? '').trim() : '';
      if (code) {
        if (usedCodes.has(code.toLowerCase())) {
          errors.push({ row: rowNum, message: `Duplicate PPMP code "${code}".` });
          return;
        }
        usedCodes.add(code.toLowerCase());
      } else {
        code = genCode();
      }

      let scheduleQuarter: number | null = null;
      if (colQuarter) {
        const qraw = String(raw[colQuarter] ?? '').replace(/[^0-9]/g, '');
        if (qraw) {
          const q = parseInt(qraw, 10);
          if (q >= 1 && q <= 4) scheduleQuarter = q;
        }
      }

      let assignedUserId: string | null = opts.defaultAssignedUserId ?? null;
      if (colAssigned) {
        const aname = String(raw[colAssigned] ?? '').trim();
        if (aname) {
          const uid = userByName.get(aname.toLowerCase());
          if (uid) assignedUserId = uid;
          else warnings.push({ row: rowNum, message: `End-user "${aname}" not found — item left with the default assignment.` });
        }
      }

      const qtyD = new Prisma.Decimal(qty);
      const costD = new Prisma.Decimal(cost);
      toCreate.push({
        organizationId,
        fiscalYearId: opts.fiscalYearId,
        departmentId: opts.departmentId,
        ...(assignedUserId ? { assignedUserId } : {}),
        code,
        itemDescription: desc,
        procurementCategory: category,
        unitOfMeasure: colUom ? String(raw[colUom] ?? '').trim() || 'unit' : 'unit',
        quantity: qtyD,
        estimatedUnitCost: costD,
        estimatedTotalCost: qtyD.mul(costD),
        ...(colMode && String(raw[colMode] ?? '').trim()
          ? { modeOfProcurement: String(raw[colMode]).trim() }
          : {}),
        ...(scheduleQuarter != null ? { scheduleQuarter } : {}),
        ...(colNotes && String(raw[colNotes] ?? '').trim()
          ? { cboNotes: String(raw[colNotes]).trim() }
          : {}),
        // Uploaded PPMP items constitute the approved budget — approve on upload.
        status: 'approved',
        approvedBy: opts.actorUserId,
        approvedAt: new Date(),
        createdBy: opts.actorUserId,
      });
    });

    if (toCreate.length > 0) {
      await runAudited(this.prisma, opts.actorUserId, async (tx) => {
        for (const data of toCreate) {
          await tx.ppmpItem.create({ data });
        }
      });
    }

    return { created: toCreate.length, skipped: errors.length, errors, warnings };
  }

  async getRemainingPlannedAmount(organizationId: string, ppmpItemId: string) {
    const item = await this.prisma.ppmpItem.findFirst({
      where: { id: ppmpItemId, organizationId },
    });
    if (!item) throw new NotFoundException(`PPMP item ${ppmpItemId} not found.`);

    const prTotals = await this.prisma.purchaseRequest.aggregate({
      where: {
        ppmpItemId,
        organizationId,
        status: { notIn: ['cancelled', 'rejected', 'voided'] },
      },
      _sum: { totalAmount: true },
    });

    const requested = prTotals._sum.totalAmount ?? new Prisma.Decimal(0);
    const remaining = item.estimatedTotalCost.sub(requested);

    return {
      ppmpItemId,
      estimatedTotalCost: item.estimatedTotalCost,
      requestedAmount: requested,
      remainingPlannedAmount: remaining,
    };
  }
}

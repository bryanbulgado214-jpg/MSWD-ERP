import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
  endUserId?: string;
  code: string;
  itemDescription: string;
  procurementCategory: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
  unitOfMeasure: string;
  quantity: number | string;
  estimatedUnitCost: number | string;
  modeOfProcurement?: string;
  scheduleQuarter?: number;
  // Quantity split across quarters, e.g. { "1": 6, "3": 6, "4": 6 }. When
  // provided, the values must sum to `quantity`.
  scheduleByQuarter?: Record<string, number> | null;
  cboNotes?: string;
  // Draft = still editable; approved = locked and flows into the APP. The budget
  // officer chooses "Save as Draft" vs "Finalize" when saving.
  status?: 'draft' | 'approved';
  createdBy?: string;
}

export interface UpdatePpmpItemInput {
  assignedUserId?: string | null;
  endUserId?: string | null;
  code?: string;
  itemDescription?: string;
  procurementCategory?: 'goods' | 'services' | 'infrastructure' | 'consulting_services';
  unitOfMeasure?: string;
  quantity?: number | string;
  estimatedUnitCost?: number | string;
  modeOfProcurement?: string | null;
  scheduleQuarter?: number | null;
  scheduleByQuarter?: Record<string, number> | null;
  cboNotes?: string | null;
  updatedBy?: string;
}

/** Keep only quarters 1-4 with a positive quantity, or null if none. */
function normalizeSchedule(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, number> = {};
  for (const q of ['1', '2', '3', '4']) {
    const v = Number((raw as Record<string, unknown>)[q] ?? 0);
    if (Number.isFinite(v) && v > 0) out[q] = v;
  }
  return Object.keys(out).length ? out : null;
}

function scheduleTotal(sched: Record<string, number> | null): number {
  return sched ? Object.values(sched).reduce((a, b) => a + Number(b), 0) : 0;
}

/** Throws if a provided quarter schedule does not sum to the item quantity. */
function assertScheduleMatches(sched: Record<string, number> | null, quantity: number | string) {
  if (!sched) return;
  const total = scheduleTotal(sched);
  const qty = Number(quantity);
  if (Math.abs(total - qty) > 0.0001) {
    throw new BadRequestException(
      `The quarter schedule totals ${total}, but the item quantity is ${qty}. They must match.`,
    );
  }
}

const PPMP_ITEM_INCLUDE = {
  department: { select: { id: true, code: true, name: true } },
  assignedUser: { select: { id: true, username: true, email: true } },
  endUser: {
    select: {
      id: true,
      name: true,
      position: true,
      department: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.PpmpItemInclude;

@Injectable()
export class PpmpService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, input: CreatePpmpItemInput) {
    const qty = new Prisma.Decimal(input.quantity);
    const unitCost = new Prisma.Decimal(input.estimatedUnitCost);
    const totalCost = qty.mul(unitCost);
    const schedule = normalizeSchedule(input.scheduleByQuarter);
    assertScheduleMatches(schedule, input.quantity);

    const approved = (input.status ?? 'approved') === 'approved';

    return runAudited(this.prisma, input.createdBy, (tx) =>
      tx.ppmpItem.create({
        data: {
          organizationId,
          fiscalYearId: input.fiscalYearId,
          departmentId: input.departmentId,
          ...(input.assignedUserId ? { assignedUserId: input.assignedUserId } : {}),
          ...(input.endUserId ? { endUserId: input.endUserId } : {}),
          code: input.code,
          itemDescription: input.itemDescription,
          procurementCategory: input.procurementCategory,
          unitOfMeasure: input.unitOfMeasure,
          quantity: qty,
          estimatedUnitCost: unitCost,
          estimatedTotalCost: totalCost,
          ...(input.modeOfProcurement ? { modeOfProcurement: input.modeOfProcurement } : {}),
          ...(input.scheduleQuarter != null ? { scheduleQuarter: input.scheduleQuarter } : {}),
          ...(schedule ? { scheduleByQuarter: schedule } : {}),
          ...(input.cboNotes ? { cboNotes: input.cboNotes } : {}),
          // A water district's PPMP is its approved budget, so items default to
          // approved on entry — but the budget officer can Save as Draft to keep
          // editing before finalizing (drafts are excluded from the APP).
          status: approved ? 'approved' : 'draft',
          ...(approved ? { approvedBy: input.createdBy ?? null, approvedAt: new Date() } : {}),
          createdBy: input.createdBy ?? null,
        },
        include: PPMP_ITEM_INCLUDE,
      }),
    );
  }

  /**
   * Save a whole PPMP for one end-user at once: all items in a single
   * transaction, then the caller reconsolidates the APP once. Approved items
   * flow into the APP; drafts stay editable.
   */
  async createBatch(
    organizationId: string,
    common: {
      fiscalYearId: string;
      departmentId: string;
      endUserId?: string;
      assignedUserId?: string;
      status?: 'draft' | 'approved';
      createdBy?: string;
    },
    items: Array<
      Pick<
        CreatePpmpItemInput,
        | 'code'
        | 'itemDescription'
        | 'procurementCategory'
        | 'unitOfMeasure'
        | 'quantity'
        | 'estimatedUnitCost'
        | 'modeOfProcurement'
        | 'scheduleQuarter'
        | 'scheduleByQuarter'
        | 'cboNotes'
      >
    >,
  ) {
    const approved = (common.status ?? 'approved') === 'approved';
    const now = new Date();

    return runAudited(this.prisma, common.createdBy, async (tx) => {
      const created = [];
      for (const it of items) {
        const qty = new Prisma.Decimal(it.quantity);
        const unitCost = new Prisma.Decimal(it.estimatedUnitCost);
        const schedule = normalizeSchedule(it.scheduleByQuarter);
        assertScheduleMatches(schedule, it.quantity);
        const row = await tx.ppmpItem.create({
          data: {
            organizationId,
            fiscalYearId: common.fiscalYearId,
            departmentId: common.departmentId,
            ...(common.assignedUserId ? { assignedUserId: common.assignedUserId } : {}),
            ...(common.endUserId ? { endUserId: common.endUserId } : {}),
            code: it.code,
            itemDescription: it.itemDescription,
            procurementCategory: it.procurementCategory,
            unitOfMeasure: it.unitOfMeasure,
            quantity: qty,
            estimatedUnitCost: unitCost,
            estimatedTotalCost: qty.mul(unitCost),
            ...(it.modeOfProcurement ? { modeOfProcurement: it.modeOfProcurement } : {}),
            ...(it.scheduleQuarter != null ? { scheduleQuarter: it.scheduleQuarter } : {}),
            ...(schedule ? { scheduleByQuarter: schedule } : {}),
            ...(it.cboNotes ? { cboNotes: it.cboNotes } : {}),
            status: approved ? 'approved' : 'draft',
            ...(approved ? { approvedBy: common.createdBy ?? null, approvedAt: now } : {}),
            createdBy: common.createdBy ?? null,
          },
          include: PPMP_ITEM_INCLUDE,
        });
        created.push(row);
      }
      return created;
    });
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
    if (input.endUserId !== undefined) updates.endUserId = input.endUserId;
    if (input.code !== undefined) {
      const code = input.code.trim();
      if (!code) throw new BadRequestException('PPMP code is required.');
      if (code.length > 30) throw new BadRequestException('PPMP code must be 30 characters or fewer.');
      if (code !== item.code) {
        const dup = await this.prisma.ppmpItem.findFirst({
          where: { organizationId, code, id: { not: id } },
          select: { id: true },
        });
        if (dup) throw new ConflictException(`PPMP code "${code}" is already in use.`);
      }
      updates.code = code;
    }
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

    // Keep the quarter schedule consistent with the (possibly new) quantity.
    const nextQty = input.quantity !== undefined ? Number(input.quantity) : Number(item.quantity);
    let nextSchedule: Record<string, number> | null | undefined;
    if (input.scheduleByQuarter !== undefined) {
      nextSchedule = normalizeSchedule(input.scheduleByQuarter);
      updates.scheduleByQuarter = nextSchedule ?? Prisma.DbNull;
    }
    const scheduleToCheck =
      nextSchedule !== undefined ? nextSchedule : normalizeSchedule(item.scheduleByQuarter);
    assertScheduleMatches(scheduleToCheck, nextQty);

    return runAudited(this.prisma, input.updatedBy, (tx) =>
      tx.ppmpItem.update({
        where: { id },
        data: updates,
        include: PPMP_ITEM_INCLUDE,
      }),
    );
  }

  async findAll(organizationId: string, filters?: {
    fiscalYearId?: string;
    departmentId?: string;
    assignedUserId?: string;
    endUserId?: string;
    status?: string;
  }) {
    return this.prisma.ppmpItem.findMany({
      where: {
        organizationId,
        ...(filters?.fiscalYearId ? { fiscalYearId: filters.fiscalYearId } : {}),
        ...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters?.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
        ...(filters?.endUserId ? { endUserId: filters.endUserId } : {}),
        ...(filters?.status ? { status: filters.status as 'draft' | 'approved' | 'cancelled' } : {}),
      },
      include: {
        ...PPMP_ITEM_INCLUDE,
        fiscalYear: { select: { id: true, year: true, name: true } },
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

  /**
   * Approved PPMP items assigned to a specific end-user (from the managed
   * master list), with amounts/quantities already committed to purchase
   * requests netted out. This is what the PR form reads to show a requesting
   * end-user's remaining allocations.
   */
  async allocationsForEndUser(organizationId: string, endUserId: string, fiscalYearId?: string) {
    const items = await this.prisma.ppmpItem.findMany({
      where: {
        organizationId,
        endUserId,
        status: 'approved',
        ...(fiscalYearId ? { fiscalYearId } : {}),
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
        fiscalYear: { select: { id: true, year: true, name: true } },
      },
      orderBy: { code: 'asc' },
    });

    return Promise.all(
      items.map(async (item) => {
        // PR line quantities for this PPMP item — matched either by the line's own
        // ppmpItemId (new, multi-item PRs) or the PR header (legacy single-item PRs).
        const ppmpMatch = (headerLink: boolean) =>
          headerLink
            ? { ppmpItemId: null, purchaseRequest: { ppmpItemId: item.id, organizationId } }
            : { ppmpItemId: item.id, purchaseRequest: { organizationId } };

        // Purchased = quantity on PRs that reached a non-cancelled Purchase Order.
        const purchasedAgg = await this.prisma.purchaseRequestItem.aggregate({
          where: {
            OR: [true, false].map((h) => {
              const m = ppmpMatch(h);
              return {
                ...m,
                purchaseRequest: {
                  ...m.purchaseRequest,
                  status: { notIn: ['cancelled', 'rejected', 'voided'] },
                  purchaseOrders: { some: { status: { not: 'cancelled' } } },
                },
              };
            }),
          },
          _sum: { quantity: true },
        });
        const purchasedQty = purchasedAgg._sum.quantity ?? new Prisma.Decimal(0);

        // Requested (any non-cancelled PR, whether or not a PO exists yet).
        const usedAgg = await this.prisma.purchaseRequestItem.aggregate({
          where: {
            OR: [true, false].map((h) => {
              const m = ppmpMatch(h);
              return {
                ...m,
                purchaseRequest: {
                  ...m.purchaseRequest,
                  status: { notIn: ['cancelled', 'rejected', 'voided'] },
                },
              };
            }),
          },
          _sum: { quantity: true },
        });
        const usedQty = usedAgg._sum.quantity ?? new Prisma.Decimal(0);
        const purchasedAmount = purchasedQty.mul(item.estimatedUnitCost);

        return {
          ...item,
          purchasedQuantity: purchasedQty,
          purchasedAmount,
          usedQuantity: usedQty,
          requestedAmount: usedQty.mul(item.estimatedUnitCost),
          // Remaining to purchase = approved − actually purchased (via POs).
          remainingQuantity: item.quantity.sub(purchasedQty),
          remainingAmount: item.estimatedTotalCost.sub(purchasedAmount),
        };
      }),
    );
  }

  /**
   * The documents (POs and their DVs) that recorded actual acquisitions of a
   * PPMP item — for the "purchased to date" drill-down on the PR form. Petty
   * cash vouchers are not attributable (no PCV→PPMP link in the model).
   */
  async acquisitionsForPpmpItem(organizationId: string, ppmpItemId: string) {
    const pos = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId,
        status: { not: 'cancelled' },
        purchaseRequest: {
          OR: [{ ppmpItemId }, { items: { some: { ppmpItemId } } }],
        },
      },
      select: {
        poNumber: true,
        poDate: true,
        contractAmount: true,
        supplier: { select: { name: true } },
        purchaseRequest: {
          select: {
            prNumber: true,
            ppmpItemId: true,
            items: {
              where: { OR: [{ ppmpItemId }, { ppmpItemId: null }] },
              select: { quantity: true, estimatedUnitCost: true, ppmpItemId: true },
            },
          },
        },
        disbursementVouchers: {
          where: { status: { not: 'cancelled' } },
          select: { dvNumber: true, dvDate: true, netAmount: true, status: true },
          orderBy: { dvDate: 'asc' },
        },
      },
      orderBy: { poDate: 'asc' },
    });

    const documents: Array<{
      type: string;
      reference: string;
      date: string | null;
      quantity: string | null;
      unitCost: string | null;
      totalAmount: string;
      relatedTo?: string;
      supplier?: string;
    }> = [];

    for (const po of pos) {
      // Quantity/unit-cost for THIS ppmp item come from the matching PR lines.
      const lines = po.purchaseRequest.items.filter(
        (i) => i.ppmpItemId === ppmpItemId || (i.ppmpItemId === null && po.purchaseRequest.ppmpItemId === ppmpItemId),
      );
      const qty = lines.reduce((s, l) => s.add(l.quantity), new Prisma.Decimal(0));
      const unit = lines[0]?.estimatedUnitCost ?? null;
      documents.push({
        type: 'Purchase Order',
        reference: po.poNumber,
        date: po.poDate ? po.poDate.toISOString().slice(0, 10) : null,
        quantity: qty.gt(0) ? qty.toString() : null,
        unitCost: unit ? unit.toString() : null,
        totalAmount: po.contractAmount.toString(),
        ...(po.supplier ? { supplier: po.supplier.name } : {}),
      });
      for (const dv of po.disbursementVouchers) {
        documents.push({
          type: 'Disbursement Voucher',
          reference: dv.dvNumber,
          date: dv.dvDate ? dv.dvDate.toISOString().slice(0, 10) : null,
          quantity: null,
          unitCost: null,
          totalAmount: dv.netAmount.toString(),
          relatedTo: po.poNumber,
        });
      }
    }

    return { documents };
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
      defaultEndUserId?: string;
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
        ...(opts.defaultEndUserId ? { endUserId: opts.defaultEndUserId } : {}),
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

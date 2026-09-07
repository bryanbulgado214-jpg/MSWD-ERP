import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

const INVENTORY_MAPPING_KEY: Record<string, string> = {
  expendable: 'inventory.expendable',
  semi_expendable: 'inventory.semi_expendable',
  ppe: 'inventory.ppe',
};

/**
 * Supplies Ledger Card — the ACCOUNTING-side valued subsidiary ledger, kept by
 * the accountant. It's the peso view of the same perpetual movements the Stock
 * Card records (kept by Supply), and it reconciles to the GL Inventory control
 * account. Read-only here; corrections are posted as accounting adjustments.
 */
@Injectable()
export class SupplyLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Items with a stock card, for the ledger picker. */
  async listItems(organizationId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId },
      select: {
        id: true,
        itemCode: true,
        description: true,
        unitOfMeasure: true,
        classification: true,
        accountCode: true,
        isActive: true,
        stockCard: {
          select: { balanceQuantity: true, balanceUnitCost: true, balanceTotalCost: true },
        },
      },
      orderBy: { itemCode: 'asc' },
    });
    return items.map((i) => ({
      id: i.id,
      itemCode: i.itemCode,
      description: i.description,
      unitOfMeasure: i.unitOfMeasure,
      classification: i.classification,
      isActive: i.isActive,
      balanceQuantity: Number(i.stockCard?.balanceQuantity ?? 0),
      balanceAmount: Number(i.stockCard?.balanceTotalCost ?? 0),
    }));
  }

  /** The valued ledger for one item: opening balance + dated movements. */
  async card(organizationId: string, itemId: string, from?: string, to?: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, organizationId },
      select: {
        id: true,
        itemCode: true,
        description: true,
        unitOfMeasure: true,
        classification: true,
        stockCard: { select: { id: true } },
      },
    });
    if (!item || !item.stockCard) throw new NotFoundException('Item or stock card not found.');

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    // Opening balance = the running balance of the last entry strictly before `from`.
    let opening = { quantity: 0, amount: 0 };
    if (fromDate) {
      const prior = await this.prisma.stockCardEntry.findFirst({
        where: { stockCardId: item.stockCard.id, entryDate: { lt: fromDate } },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        select: { balanceQuantity: true, balanceTotalCost: true },
      });
      if (prior) {
        opening = {
          quantity: Number(prior.balanceQuantity),
          amount: Number(prior.balanceTotalCost),
        };
      }
    }

    const entries = await this.prisma.stockCardEntry.findMany({
      where: {
        stockCardId: item.stockCard.id,
        ...(fromDate || toDate
          ? {
              entryDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        entryDate: true,
        entryType: true,
        referenceNumber: true,
        receiptQuantity: true,
        receiptTotalCost: true,
        issueQuantity: true,
        issueTotalCost: true,
        balanceQuantity: true,
        balanceTotalCost: true,
        glRunId: true,
      },
    });

    const rows = entries.map((e) => ({
      entryDate: e.entryDate,
      entryType: e.entryType,
      reference: e.referenceNumber,
      receiptQuantity: e.receiptQuantity != null ? Number(e.receiptQuantity) : null,
      receiptAmount: e.receiptTotalCost != null ? Number(e.receiptTotalCost) : null,
      issueQuantity: e.issueQuantity != null ? Number(e.issueQuantity) : null,
      issueAmount: e.issueTotalCost != null ? Number(e.issueTotalCost) : null,
      balanceQuantity: Number(e.balanceQuantity),
      balanceAmount: Number(e.balanceTotalCost),
      journalized: e.glRunId != null,
    }));

    const closing = rows.length
      ? {
          quantity: rows[rows.length - 1]!.balanceQuantity,
          amount: rows[rows.length - 1]!.balanceAmount,
        }
      : opening;

    return {
      item: {
        id: item.id,
        itemCode: item.itemCode,
        description: item.description,
        unitOfMeasure: item.unitOfMeasure,
        classification: item.classification,
      },
      opening,
      rows,
      closing,
    };
  }

  /**
   * Per-inventory-account reconciliation: the SLC control total (Σ stock-card
   * value grouped by the item's inventory GL account) beside the GL Inventory
   * control-account balance (posted JEVs), with the variance the accountant
   * chases down.
   */
  async reconciliation(organizationId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId },
      select: {
        accountCode: true,
        classification: true,
        stockCard: { select: { balanceTotalCost: true } },
      },
    });

    // Resolve each item's inventory account (own code, else classification default).
    const mappings = await this.prisma.accountMapping.findMany({
      where: {
        organizationId,
        isActive: true,
        mappingKey: { in: Object.values(INVENTORY_MAPPING_KEY) },
      },
      select: {
        mappingKey: true,
        chartOfAccount: { select: { id: true, accountCode: true, name: true } },
      },
    });
    const mapByKey = new Map(mappings.map((m) => [m.mappingKey, m.chartOfAccount]));

    const codes = [...new Set(items.map((i) => i.accountCode).filter((c): c is string => !!c))];
    const coa = codes.length
      ? await this.prisma.chartOfAccount.findMany({
          where: { organizationId, accountCode: { in: codes }, isHeader: false },
          select: { id: true, accountCode: true, name: true },
        })
      : [];
    const coaByCode = new Map(coa.map((c) => [c.accountCode, c]));

    const slcByAccount = new Map<string, { accountCode: string; name: string; slc: number }>();
    for (const i of items) {
      const acct =
        (i.accountCode ? coaByCode.get(i.accountCode) : undefined) ??
        mapByKey.get(INVENTORY_MAPPING_KEY[i.classification] ?? 'inventory.expendable');
      if (!acct) continue;
      const row = slcByAccount.get(acct.id) ?? {
        accountCode: acct.accountCode,
        name: acct.name,
        slc: 0,
      };
      row.slc = round2(row.slc + Number(i.stockCard?.balanceTotalCost ?? 0));
      slcByAccount.set(acct.id, row);
    }

    const accountIds = [...slcByAccount.keys()];
    const glByAccount = new Map<string, number>();
    if (accountIds.length) {
      const glRows = await this.prisma.$queryRaw<{ accountId: string; net: string }[]>(Prisma.sql`
        SELECT l.chart_of_account_id AS "accountId",
               COALESCE(SUM(l.debit_amount - l.credit_amount), 0)::text AS "net"
        FROM jev_lines l
        JOIN journal_entry_vouchers j ON j.id = l.jev_id
        WHERE j.organization_id = ${organizationId}::uuid
          AND j.status = 'posted'
          AND l.chart_of_account_id::text IN (${Prisma.join(accountIds)})
        GROUP BY l.chart_of_account_id
      `);
      for (const r of glRows) glByAccount.set(r.accountId, round2(Number(r.net)));
    }

    const rows = accountIds.map((id) => {
      const s = slcByAccount.get(id)!;
      const gl = glByAccount.get(id) ?? 0;
      return {
        accountCode: s.accountCode,
        accountName: s.name,
        slcBalance: s.slc,
        glBalance: gl,
        variance: round2(s.slc - gl),
      };
    });
    rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    return {
      rows,
      totals: {
        slcBalance: round2(rows.reduce((t, r) => t + r.slcBalance, 0)),
        glBalance: round2(rows.reduce((t, r) => t + r.glBalance, 0)),
        variance: round2(rows.reduce((t, r) => t + r.variance, 0)),
      },
    };
  }
}

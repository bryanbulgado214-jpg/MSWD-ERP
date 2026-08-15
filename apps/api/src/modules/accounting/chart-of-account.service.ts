import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AccountType, NormalBalance } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const VALID_ACCOUNT_TYPES: readonly string[] = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
];
const VALID_NORMAL_BALANCES: readonly string[] = ['debit', 'credit'];
const REQUIRED_HEADERS: readonly string[] = ['accountcode', 'name', 'accounttype', 'normalbalance'];

type CoaImportAction = 'create' | 'update' | 'error';

export interface CoaImportRow {
  rowNumber: number;
  accountCode: string;
  name: string;
  accountType: string;
  normalBalance: string;
  level: number;
  isHeader: boolean;
  parentCode: string;
  uacsCode: string;
  action: CoaImportAction;
  errors: string[];
}

export interface CoaImportPreviewResult {
  rows: CoaImportRow[];
  summary: { total: number; toCreate: number; toUpdate: number; errors: number };
}

/**
 * Minimal, dependency-free RFC-4180-ish CSV tokenizer. Handles quoted fields
 * (double-quote escaping via ""), commas and newlines inside quotes, and CRLF.
 * Returns raw rows of raw (un-trimmed) cell strings; blank-line filtering and
 * per-cell trimming happen in the validation pass.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function parseBool(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'y') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'n') return false;
  return undefined;
}

const COA_SELECT = {
  id: true,
  accountCode: true,
  name: true,
  accountType: true,
  normalBalance: true,
  level: true,
  isHeader: true,
  isActive: true,
  uacsCode: true,
  parentAccountId: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const;

@Injectable()
export class ChartOfAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { accountType?: string; includeInactive?: boolean; search?: string },
  ) {
    return this.prisma.chartOfAccount.findMany({
      where: {
        organizationId,
        ...(filters?.accountType ? { accountType: filters.accountType as any } : {}),
        ...(!filters?.includeInactive ? { isActive: true } : {}),
        ...(filters?.search
          ? {
              OR: [
                { accountCode: { contains: filters.search, mode: 'insensitive' as const } },
                { name: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        ...COA_SELECT,
        parentAccount: { select: { id: true, accountCode: true, name: true } },
      },
      orderBy: { accountCode: 'asc' },
    });
  }

  async findTree(organizationId: string) {
    const all = await this.prisma.chartOfAccount.findMany({
      where: { organizationId, isActive: true },
      select: COA_SELECT,
      orderBy: { accountCode: 'asc' },
    });
    return all;
  }

  async findOne(organizationId: string, id: string) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, organizationId },
      select: {
        ...COA_SELECT,
        parentAccount: { select: { id: true, accountCode: true, name: true } },
        childAccounts: {
          select: { id: true, accountCode: true, name: true, isActive: true },
          orderBy: { accountCode: 'asc' },
        },
      },
    });
    if (!account) throw new NotFoundException('Account not found.');
    return account;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      accountCode: string;
      name: string;
      accountType: any;
      normalBalance: any;
      level: number;
      isHeader: boolean;
      parentAccountId?: string;
      uacsCode?: string;
    },
  ) {
    const existing = await this.prisma.chartOfAccount.findFirst({
      where: { organizationId, accountCode: data.accountCode },
    });
    if (existing) throw new ConflictException('An account with this code already exists.');

    if (data.parentAccountId) {
      const parent = await this.prisma.chartOfAccount.findFirst({
        where: { id: data.parentAccountId, organizationId },
      });
      if (!parent) throw new NotFoundException('Parent account not found.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.chartOfAccount.create({
        data: {
          organizationId,
          accountCode: data.accountCode,
          name: data.name,
          accountType: data.accountType,
          normalBalance: data.normalBalance,
          level: data.level,
          isHeader: data.isHeader,
          ...(data.parentAccountId ? { parentAccountId: data.parentAccountId } : {}),
          ...(data.uacsCode ? { uacsCode: data.uacsCode } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: COA_SELECT,
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    userId: string,
    data: { expectedVersion: number; name?: string; isActive?: boolean; uacsCode?: string },
  ) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, organizationId },
    });
    if (!account) throw new NotFoundException('Account not found.');
    if (account.version !== data.expectedVersion) {
      throw new ConflictException('Account was modified by another user. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.chartOfAccount.update({
        where: { id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.uacsCode !== undefined ? { uacsCode: data.uacsCode || null } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: COA_SELECT,
      }),
    );
  }

  // ── CSV Import ──

  /**
   * Parse + validate every data row of a Chart-of-Accounts CSV without
   * writing anything. Shared by both the preview and confirm endpoints so the
   * two can never disagree on what is valid. Returns the public per-row shape
   * plus the set of accountCodes that already exist in the org (used by
   * confirm to decide create-vs-update counts).
   */
  private async parseAndValidate(
    organizationId: string,
    csv: string,
  ): Promise<{ rows: CoaImportRow[]; existingCodes: Set<string> }> {
    const allRows = parseCsvRows(csv);

    // Locate the header: first row containing any non-blank cell.
    let headerIndex = -1;
    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i];
      if (r && r.some((c) => c.trim() !== '')) {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex === -1) {
      throw new BadRequestException('CSV is empty — no header row found.');
    }

    const headerCells = (allRows[headerIndex] ?? []).map((c) => c.trim().toLowerCase());
    const colIndex = new Map<string, number>();
    headerCells.forEach((h, idx) => {
      if (h && !colIndex.has(h)) colIndex.set(h, idx);
    });

    const missing = REQUIRED_HEADERS.filter((k) => !colIndex.has(k));
    if (missing.length > 0) {
      throw new BadRequestException(
        `CSV header is missing required column(s): ${missing.join(', ')}. ` +
          'Expected columns: accountCode, name, accountType, normalBalance, level, isHeader, parentCode, uacsCode.',
      );
    }

    // Existing org accounts (for update detection + parent resolution).
    const existing = await this.prisma.chartOfAccount.findMany({
      where: { organizationId },
      select: { accountCode: true, level: true },
    });
    const existingByCode = new Map<string, number>();
    for (const e of existing) existingByCode.set(e.accountCode, e.level);

    const cell = (cells: string[], key: string): string => {
      const idx = colIndex.get(key);
      if (idx === undefined) return '';
      const v = cells[idx];
      return v === undefined ? '' : v.trim();
    };

    const seenByCode = new Map<string, { rowNumber: number; level: number }>();
    const rows: CoaImportRow[] = [];

    for (let i = headerIndex + 1; i < allRows.length; i++) {
      const cells = allRows[i];
      if (!cells || cells.every((c) => c.trim() === '')) continue; // ignore blank lines
      const rowNumber = i + 1; // 1-based, aligns with the source file line

      const errors: string[] = [];
      const accountCode = cell(cells, 'accountcode');
      const name = cell(cells, 'name');
      const accountType = cell(cells, 'accounttype').toLowerCase();
      const normalBalance = cell(cells, 'normalbalance').toLowerCase();
      const parentCode = cell(cells, 'parentcode');
      const uacsCode = cell(cells, 'uacscode');
      const levelRaw = cell(cells, 'level');
      const isHeaderRaw = cell(cells, 'isheader');

      if (!accountCode) errors.push('accountCode is required.');
      if (!name) errors.push('name is required.');
      if (!accountType) errors.push('accountType is required.');
      else if (!VALID_ACCOUNT_TYPES.includes(accountType)) {
        errors.push(
          `accountType "${accountType}" is invalid (expected asset, liability, equity, revenue, or expense).`,
        );
      }
      if (!normalBalance) errors.push('normalBalance is required.');
      else if (!VALID_NORMAL_BALANCES.includes(normalBalance)) {
        errors.push(`normalBalance "${normalBalance}" is invalid (expected debit or credit).`);
      }

      if (accountCode) {
        const prior = seenByCode.get(accountCode);
        if (prior)
          errors.push(
            `Duplicate accountCode "${accountCode}" within the file (first seen on row ${prior.rowNumber}).`,
          );
      }

      let isHeader = false;
      if (isHeaderRaw) {
        const parsed = parseBool(isHeaderRaw);
        if (parsed === undefined)
          errors.push(`isHeader "${isHeaderRaw}" is invalid (expected true/false/1/0/yes/no).`);
        else isHeader = parsed;
      }

      let parentLevel: number | undefined;
      if (parentCode) {
        const inFile = seenByCode.get(parentCode);
        const inDbLevel = existingByCode.get(parentCode);
        if (inFile) parentLevel = inFile.level;
        else if (inDbLevel !== undefined) parentLevel = inDbLevel;
        else {
          errors.push(
            `parentCode "${parentCode}" not found (must match an accountCode already in the system or earlier in this file).`,
          );
        }
      }

      let level: number;
      if (levelRaw) {
        const n = Number(levelRaw);
        if (!Number.isInteger(n) || n < 1) {
          errors.push(`level "${levelRaw}" is invalid (expected a positive integer).`);
          level = parentLevel !== undefined ? parentLevel + 1 : 1;
        } else {
          level = n;
        }
      } else {
        level = parentLevel !== undefined ? parentLevel + 1 : 1;
      }

      if (accountCode && !seenByCode.has(accountCode)) {
        seenByCode.set(accountCode, { rowNumber, level });
      }

      const action: CoaImportAction =
        errors.length > 0 ? 'error' : existingByCode.has(accountCode) ? 'update' : 'create';

      rows.push({
        rowNumber,
        accountCode,
        name,
        accountType,
        normalBalance,
        level,
        isHeader,
        parentCode,
        uacsCode,
        action,
        errors,
      });
    }

    if (rows.length === 0) {
      throw new BadRequestException('CSV contains a header but no data rows.');
    }

    const existingCodes = new Set(existingByCode.keys());
    return { rows, existingCodes };
  }

  async importPreview(organizationId: string, csv: string): Promise<CoaImportPreviewResult> {
    const { rows } = await this.parseAndValidate(organizationId, csv);
    const summary = {
      total: rows.length,
      toCreate: rows.filter((r) => r.action === 'create').length,
      toUpdate: rows.filter((r) => r.action === 'update').length,
      errors: rows.filter((r) => r.action === 'error').length,
    };
    return { rows, summary };
  }

  async importConfirm(
    organizationId: string,
    userId: string,
    csv: string,
  ): Promise<{ created: number; updated: number }> {
    const { rows, existingCodes } = await this.parseAndValidate(organizationId, csv);

    const errorRows = rows.filter((r) => r.action === 'error');
    if (errorRows.length > 0) {
      const messages = errorRows.map(
        (r) => `Row ${r.rowNumber} (${r.accountCode || 'blank'}): ${r.errors.join(' ')}`,
      );
      throw new BadRequestException({
        message: messages,
        error: 'Import validation failed',
        statusCode: 400,
      });
    }

    // Parents before children: sort by level asc, stable by source row order.
    const ordered = [...rows].sort((a, b) => a.level - b.level || a.rowNumber - b.rowNumber);

    let created = 0;
    let updated = 0;

    await runAudited(this.prisma, userId, async (tx) => {
      // code → id map, seeded with existing accounts so in-file parents that
      // are created earlier in this same transaction resolve for their children.
      const existingRecords = await tx.chartOfAccount.findMany({
        where: { organizationId },
        select: { id: true, accountCode: true },
      });
      const codeToId = new Map<string, string>();
      for (const e of existingRecords) codeToId.set(e.accountCode, e.id);

      for (const row of ordered) {
        const parentAccountId = row.parentCode ? (codeToId.get(row.parentCode) ?? null) : null;
        const result = await tx.chartOfAccount.upsert({
          where: { organizationId_accountCode: { organizationId, accountCode: row.accountCode } },
          create: {
            organizationId,
            accountCode: row.accountCode,
            name: row.name,
            accountType: row.accountType as AccountType,
            normalBalance: row.normalBalance as NormalBalance,
            level: row.level,
            isHeader: row.isHeader,
            parentAccountId,
            uacsCode: row.uacsCode || null,
            createdBy: userId,
            updatedBy: userId,
          },
          update: {
            name: row.name,
            accountType: row.accountType as AccountType,
            normalBalance: row.normalBalance as NormalBalance,
            level: row.level,
            isHeader: row.isHeader,
            parentAccountId,
            uacsCode: row.uacsCode || null,
            updatedBy: userId,
            version: { increment: 1 },
          },
          select: { id: true, accountCode: true },
        });
        codeToId.set(result.accountCode, result.id);
        if (existingCodes.has(row.accountCode)) updated++;
        else created++;
      }
    });

    return { created, updated };
  }
}

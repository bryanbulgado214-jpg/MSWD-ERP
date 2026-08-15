import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';

/**
 * Maps database tables to the functional module they belong to, so the
 * audit trail can be filtered/labelled by module. Tables not listed fall
 * back to the "other" bucket. This is display metadata only — the audit
 * rows themselves are written by the Core Platform trigger `fn_audit_log`.
 */
const MODULE_TABLES: Record<string, string[]> = {
  accounting: [
    'journal_entry_vouchers',
    'jev_lines',
    'chart_of_accounts',
    'banks',
    'bank_accounts',
    'account_mappings',
    'checks',
    'check_status_history',
    'bank_reconciliations',
    'bank_reconciliation_items',
    'accounting_periods',
    'fiscal_years',
    'document_sequences',
  ],
  budgeting: [
    'budget_cycles',
    'budget_versions',
    'budget_headers',
    'budget_lines',
    'budget_releases',
    'budget_reservations',
  ],
  procurement: [
    'purchase_requests',
    'purchase_request_items',
    'purchase_orders',
    'certifications_of_availability',
    'obligation_requests',
    'ors_children',
    'ors_adjustments',
    'suppliers',
    'delegation_authorities',
    'inspection_reports',
    'disbursement_vouchers',
    'ppmp_items',
    'app_items',
  ],
  billing: [
    'consumers',
    'meters',
    'meter_readings',
    'bills',
    'bill_line_items',
    'payments',
    'billing_periods',
    'rate_schedules',
    'disconnections',
  ],
  hr: [
    'employees',
    'positions',
    'leave_requests',
    'daily_time_records',
    'payrolls',
    'payroll_items',
    'remittances',
    'compensations',
  ],
  inventory: [
    'inventory_items',
    'stock_receipts',
    'stock_cards',
    'requisition_issue_slips',
    'property_records',
    'physical_counts',
    'disposal_requests',
    'accountability_records',
  ],
  assets: ['assets', 'asset_categories', 'depreciation_runs', 'asset_transfers'],
  workorder: ['work_orders', 'work_order_tasks', 'complaints'],
  core: [
    'users',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'organizations',
    'organization_settings',
    'organizational_units',
    'departments',
    'responsibility_centers',
    'fund_sources',
    'locations',
    'system_settings',
  ],
};

const TABLE_TO_MODULE = new Map<string, string>();
for (const [mod, tables] of Object.entries(MODULE_TABLES)) {
  for (const t of tables) TABLE_TO_MODULE.set(t, mod);
}

function prettyTable(table: string): string {
  return table.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface AuditLogFilters {
  module?: string;
  tableName?: string;
  recordId?: string;
  performedBy?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  static modules(): string[] {
    return Object.keys(MODULE_TABLES);
  }

  async list(organizationId: string, filters: AuditLogFilters) {
    const limit = Math.min(filters.limit && filters.limit > 0 ? filters.limit : 100, 500);

    const where: Prisma.AuditLogWhereInput = { organizationId };

    const moduleTables = filters.module ? MODULE_TABLES[filters.module] : undefined;
    if (filters.tableName) {
      where.tableName = filters.tableName;
    } else if (moduleTables) {
      where.tableName = { in: moduleTables };
    }
    if (filters.recordId) where.recordId = filters.recordId;
    if (filters.performedBy) where.performedBy = filters.performedBy;
    if (filters.action) where.action = filters.action as AuditAction;
    if (filters.from || filters.to) {
      where.performedAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: { performer: { select: { id: true, username: true } } },
      orderBy: { performedAt: 'desc' },
      take: limit,
    });

    return {
      total: logs.length,
      limit,
      rows: logs.map((log) => ({
        id: log.id,
        tableName: log.tableName,
        tableLabel: prettyTable(log.tableName),
        module: TABLE_TO_MODULE.get(log.tableName) ?? 'other',
        recordId: log.recordId,
        action: log.action,
        changedFields: log.changedFields,
        performedBy: log.performer
          ? { id: log.performer.id, username: log.performer.username }
          : null,
        performedAt: log.performedAt.toISOString(),
      })),
    };
  }

  /** Distinct users who appear in this organization's audit log (for the filter dropdown). */
  async actors(organizationId: string) {
    const grouped = await this.prisma.auditLog.groupBy({
      by: ['performedBy'],
      where: { organizationId, performedBy: { not: null } },
    });
    const ids = grouped.map((g) => g.performedBy).filter((x): x is string => !!x);
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
    });
    return users;
  }
}

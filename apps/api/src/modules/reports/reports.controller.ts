import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('procurement-summary')
  @RequirePermissions('procurement.read')
  async procurementSummary(@CurrentUser() user: AuthenticatedUser) {
    const orgId = user.organizationId;

    const statusGroups = await this.prisma.purchaseRequest.groupBy({
      by: ['status'],
      where: { organizationId: orgId },
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    const byStatus = statusGroups.map((g) => ({
      status: g.status,
      count: g._count.id,
      totalAmount: g._sum.totalAmount?.toString() ?? '0',
    }));

    const totalPRs = byStatus.reduce((s, r) => s + r.count, 0);
    const totalAmount = statusGroups
      .reduce((s, g) => s + Number(g._sum.totalAmount ?? 0), 0)
      .toString();

    const [poCount, cafCount, orsCount] = await Promise.all([
      this.prisma.purchaseOrder.count({ where: { organizationId: orgId } }),
      this.prisma.certificationOfAvailability.count({ where: { organizationId: orgId } }),
      this.prisma.obligationRequest.count({ where: { organizationId: orgId } }),
    ]);

    return { totalPRs, totalAmount, byStatus, poCount, cafCount, orsCount };
  }

  @Get('procurement-by-department')
  @RequirePermissions('procurement.read')
  async procurementByDepartment(@CurrentUser() user: AuthenticatedUser) {
    const orgId = user.organizationId;

    const rows: Array<{
      department_id: string;
      department_code: string;
      department_name: string;
      pr_count: bigint;
      total_amount: string;
      completed_count: bigint;
      cancelled_count: bigint;
    }> = await this.prisma.$queryRaw`
      SELECT
        d.id AS department_id,
        d.code AS department_code,
        d.name AS department_name,
        COUNT(pr.id) AS pr_count,
        COALESCE(SUM(pr.total_amount), 0)::text AS total_amount,
        COUNT(pr.id) FILTER (WHERE pr.status = 'completed') AS completed_count,
        COUNT(pr.id) FILTER (WHERE pr.status = 'cancelled') AS cancelled_count
      FROM departments d
      LEFT JOIN purchase_requests pr ON pr.department_id = d.id
        AND pr.organization_id = ${orgId}::uuid
      WHERE d.organization_id = ${orgId}::uuid
      GROUP BY d.id, d.code, d.name
      ORDER BY total_amount DESC
    `;

    return rows.map((r) => ({
      departmentId: r.department_id,
      departmentCode: r.department_code,
      departmentName: r.department_name,
      prCount: Number(r.pr_count),
      totalAmount: r.total_amount,
      completedCount: Number(r.completed_count),
      cancelledCount: Number(r.cancelled_count),
    }));
  }

  @Get('procurement-by-category')
  @RequirePermissions('procurement.read')
  async procurementByCategory(@CurrentUser() user: AuthenticatedUser) {
    const orgId = user.organizationId;

    const rows: Array<{
      classification: string;
      item_count: bigint;
      total_amount: string;
    }> = await this.prisma.$queryRaw`
      SELECT
        COALESCE(pri.classification::text, 'unclassified') AS classification,
        COUNT(pri.id) AS item_count,
        COALESCE(SUM(pri.estimated_total_cost), 0)::text AS total_amount
      FROM purchase_request_items pri
      JOIN purchase_requests pr ON pr.id = pri.purchase_request_id
      WHERE pr.organization_id = ${orgId}::uuid
      GROUP BY pri.classification
      ORDER BY total_amount DESC
    `;

    return rows.map((r) => ({
      classification: r.classification,
      itemCount: Number(r.item_count),
      totalAmount: r.total_amount,
    }));
  }

  @Get('budget-utilization')
  @RequirePermissions('budgeting.read')
  async budgetUtilization(
    @CurrentUser() user: AuthenticatedUser,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    const orgId = user.organizationId;

    const baseQuery = `
      SELECT
        rc.code AS rc_code,
        rc.name AS rc_name,
        fs.code AS fs_code,
        fs.name AS fs_name,
        COALESCE(SUM(bh.total_amount), 0)::text AS approved_amount,
        COALESCE(SUM(br.released_amount), 0)::text AS released_amount,
        COALESCE(SUM(br.reserved_amount), 0)::text AS reserved_amount,
        COALESCE(SUM(br.available_amount), 0)::text AS available_amount
      FROM budget_headers bh
      JOIN budget_versions bv ON bv.id = bh.budget_version_id
      JOIN responsibility_centers rc ON rc.id = bh.responsibility_center_id
      JOIN fund_sources fs ON fs.id = bh.fund_source_id
      LEFT JOIN budget_releases br ON br.budget_header_id = bh.id AND br.status = 'released'
      WHERE bh.organization_id = $1::uuid
        AND bh.status = 'approved'
    `;

    const rows: Array<{
      rc_code: string;
      rc_name: string;
      fs_code: string;
      fs_name: string;
      approved_amount: string;
      released_amount: string;
      reserved_amount: string;
      available_amount: string;
    }> = fiscalYearId
      ? await this.prisma.$queryRawUnsafe(
          baseQuery + ` AND bv.fiscal_year_id = $2::uuid GROUP BY rc.code, rc.name, fs.code, fs.name ORDER BY rc.code, fs.code`,
          orgId,
          fiscalYearId,
        )
      : await this.prisma.$queryRawUnsafe(
          baseQuery + ` GROUP BY rc.code, rc.name, fs.code, fs.name ORDER BY rc.code, fs.code`,
          orgId,
        );

    return rows.map((r) => ({
      rcCode: r.rc_code,
      rcName: r.rc_name,
      fsCode: r.fs_code,
      fsName: r.fs_name,
      approvedAmount: r.approved_amount,
      releasedAmount: r.released_amount,
      reservedAmount: r.reserved_amount,
      availableAmount: r.available_amount,
    }));
  }

  @Get('monthly-procurement')
  @RequirePermissions('procurement.read')
  async monthlyProcurement(@CurrentUser() user: AuthenticatedUser) {
    const orgId = user.organizationId;

    const rows: Array<{
      month: string;
      pr_count: bigint;
      total_amount: string;
      po_count: bigint;
      po_amount: string;
    }> = await this.prisma.$queryRaw`
      SELECT
        TO_CHAR(months.m, 'YYYY-MM') AS month,
        COUNT(DISTINCT pr.id) AS pr_count,
        COALESCE(SUM(pr.total_amount), 0)::text AS total_amount,
        COUNT(DISTINCT po.id) AS po_count,
        COALESCE(SUM(po.contract_amount), 0)::text AS po_amount
      FROM generate_series(
        DATE_TRUNC('year', CURRENT_DATE),
        DATE_TRUNC('month', CURRENT_DATE),
        '1 month'::interval
      ) AS months(m)
      LEFT JOIN purchase_requests pr ON pr.organization_id = ${orgId}::uuid
        AND DATE_TRUNC('month', pr.created_at) = months.m
      LEFT JOIN purchase_orders po ON po.organization_id = ${orgId}::uuid
        AND DATE_TRUNC('month', po.created_at) = months.m
      GROUP BY months.m
      ORDER BY months.m
    `;

    return rows.map((r) => ({
      month: r.month,
      prCount: Number(r.pr_count),
      totalAmount: r.total_amount,
      poCount: Number(r.po_count),
      poAmount: r.po_amount,
    }));
  }

  @Get('supplier-activity')
  @RequirePermissions('procurement.read')
  async supplierActivity(@CurrentUser() user: AuthenticatedUser) {
    const orgId = user.organizationId;

    const rows: Array<{
      supplier_id: string;
      supplier_name: string;
      supplier_tin: string | null;
      po_count: bigint;
      total_contract: string;
      approved_pos: bigint;
    }> = await this.prisma.$queryRaw`
      SELECT
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.tin AS supplier_tin,
        COUNT(po.id) AS po_count,
        COALESCE(SUM(po.contract_amount), 0)::text AS total_contract,
        COUNT(po.id) FILTER (WHERE po.status = 'approved') AS approved_pos
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id
        AND po.organization_id = ${orgId}::uuid
      WHERE s.organization_id = ${orgId}::uuid
        AND s.is_active = true
      GROUP BY s.id, s.name, s.tin
      ORDER BY total_contract DESC
    `;

    return rows.map((r) => ({
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      supplierTin: r.supplier_tin,
      poCount: Number(r.po_count),
      totalContract: r.total_contract,
      approvedPOs: Number(r.approved_pos),
    }));
  }

  @Get('fiscal-years')
  @RequirePermissions('procurement.read')
  async fiscalYears(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.fiscalYear.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, year: true, name: true, status: true },
      orderBy: { year: 'desc' },
    });
  }
}

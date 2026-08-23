import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from './common/decorators/current-user.decorator';
import { PrismaService } from './database/prisma.service';
import { ExecutiveDashboardService } from './executive-dashboard.service';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import type { AuthenticatedUser } from './modules/auth/jwt.strategy';

interface PendingActionItem {
  id: string;
  module: string;
  type: string;
  label: string;
  description: string;
  amount: string;
  createdAt: string;
  actionLabel: string;
  link: string;
  createdBy?: string;
}

function prItem(
  pr: {
    id: string;
    prNumber: string;
    title: string;
    totalAmount: { toString(): string };
    createdAt: Date;
    creator?: { username: string } | null;
  },
  type: string,
  actionLabel: string,
): PendingActionItem {
  return {
    id: pr.id,
    module: 'procurement',
    type,
    label: pr.prNumber,
    description: pr.title,
    amount: pr.totalAmount.toString(),
    createdAt: pr.createdAt.toISOString(),
    actionLabel,
    link: `/procurement/purchase-requests/${pr.id}`,
    ...(pr.creator ? { createdBy: pr.creator.username } : {}),
  };
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executiveDashboard: ExecutiveDashboardService,
  ) {}

  @Get('pending-actions')
  async getPendingActions(@CurrentUser() user: AuthenticatedUser) {
    const orgId = user.organizationId;
    const perms = await this.getPermissions(user.userId);
    const items: PendingActionItem[] = [];

    const prInclude = { creator: { select: { username: true } } } as const;
    const prOrder = { createdAt: 'asc' as const };

    if (perms.has('procurement.pr.endorse')) {
      const prs = await this.prisma.purchaseRequest.findMany({
        where: { organizationId: orgId, status: 'submitted' },
        include: prInclude,
        orderBy: prOrder,
        take: 20,
      });
      for (const pr of prs) items.push(prItem(pr, 'pr_endorsement', 'Endorse'));
    }

    if (perms.has('procurement.pr.budget_certify')) {
      const prs = await this.prisma.purchaseRequest.findMany({
        where: { organizationId: orgId, status: 'endorsed' },
        include: prInclude,
        orderBy: prOrder,
        take: 20,
      });
      for (const pr of prs) items.push(prItem(pr, 'pr_budget_certification', 'Certify Budget'));
    }

    if (perms.has('procurement.pr.final_approve')) {
      const prs = await this.prisma.purchaseRequest.findMany({
        where: { organizationId: orgId, status: 'budget_certified' },
        include: prInclude,
        orderBy: prOrder,
        take: 20,
      });
      for (const pr of prs) items.push(prItem(pr, 'pr_approval', 'Approve'));
    }

    if (perms.has('procurement.pr.accept_procurement')) {
      const prs = await this.prisma.purchaseRequest.findMany({
        where: { organizationId: orgId, status: 'approved' },
        include: prInclude,
        orderBy: prOrder,
        take: 20,
      });
      for (const pr of prs)
        items.push(prItem(pr, 'pr_procurement_accept', 'Accept for Procurement'));
    }

    if (perms.has('budgeting.header.approve')) {
      const budgets = await this.prisma.budgetHeader.findMany({
        where: { organizationId: orgId, status: 'submitted' },
        include: {
          responsibilityCenter: { select: { code: true, name: true } },
          fundSource: { select: { code: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const b of budgets) {
        items.push({
          id: b.id,
          module: 'budgeting',
          type: 'budget_approval',
          label: `${b.responsibilityCenter.code} / ${b.fundSource.code}`,
          description: `${b.responsibilityCenter.name} — ${b.fundSource.name}`,
          amount: b.totalAmount.toString(),
          createdAt: b.createdAt.toISOString(),
          actionLabel: 'Approve Budget',
          link: `/budgeting/budgets/${b.id}`,
        });
      }
    }

    // ── CAF pending certification ──
    if (perms.has('procurement.caf.certify')) {
      const cafs = await this.prisma.certificationOfAvailability.findMany({
        where: { organizationId: orgId, status: 'for_certification' },
        include: {
          purchaseRequest: { select: { prNumber: true, title: true } },
          creator: { select: { username: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const caf of cafs) {
        items.push({
          id: caf.id,
          module: 'procurement',
          type: 'caf_certification',
          label: caf.cafNumber,
          description: `CAF for ${caf.purchaseRequest.prNumber} — ${caf.purchaseRequest.title}`,
          amount: caf.certifiedAmount.toString(),
          createdAt: caf.createdAt.toISOString(),
          actionLabel: 'Certify CAF',
          link: `/procurement/cafs/${caf.id}`,
          ...(caf.creator ? { createdBy: caf.creator.username } : {}),
        });
      }
    }

    // ── ORS pending requesting office certification ──
    if (perms.has('procurement.ors.requesting_certify')) {
      const orsList = await this.prisma.obligationRequest.findMany({
        where: { organizationId: orgId, status: 'for_requesting_certification' },
        include: {
          purchaseRequest: { select: { prNumber: true, title: true } },
          creator: { select: { username: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const ors of orsList) {
        items.push({
          id: ors.id,
          module: 'procurement',
          type: 'ors_requesting_certification',
          label: ors.orsNumber,
          description: `ORS for ${ors.purchaseRequest.prNumber} — ${ors.purchaseRequest.title}`,
          amount: ors.originalAmount.toString(),
          createdAt: ors.createdAt.toISOString(),
          actionLabel: 'Certify (Requesting)',
          link: `/procurement/ors/${ors.id}`,
          ...(ors.creator ? { createdBy: ors.creator.username } : {}),
        });
      }
    }

    // ── ORS pending budget certification ──
    if (perms.has('procurement.ors.budget_certify')) {
      const orsList = await this.prisma.obligationRequest.findMany({
        where: { organizationId: orgId, status: 'for_budget_certification' },
        include: {
          purchaseRequest: { select: { prNumber: true, title: true } },
          creator: { select: { username: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const ors of orsList) {
        items.push({
          id: ors.id,
          module: 'procurement',
          type: 'ors_budget_certification',
          label: ors.orsNumber,
          description: `ORS for ${ors.purchaseRequest.prNumber} — ${ors.purchaseRequest.title}`,
          amount: ors.originalAmount.toString(),
          createdAt: ors.createdAt.toISOString(),
          actionLabel: 'Certify & Post Obligation',
          link: `/procurement/ors/${ors.id}`,
          ...(ors.creator ? { createdBy: ors.creator.username } : {}),
        });
      }
    }

    // ── PO pending approval ──
    if (perms.has('procurement.po.approve')) {
      const pos = await this.prisma.purchaseOrder.findMany({
        where: { organizationId: orgId, status: 'for_approval' },
        include: {
          purchaseRequest: { select: { prNumber: true, title: true } },
          supplier: { select: { name: true } },
          creator: { select: { username: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const po of pos) {
        items.push({
          id: po.id,
          module: 'procurement',
          type: 'po_approval',
          label: po.poNumber,
          description: `PO for ${po.purchaseRequest.prNumber} — ${po.supplier.name}`,
          amount: po.contractAmount.toString(),
          createdAt: po.createdAt.toISOString(),
          actionLabel: 'Approve PO',
          link: `/procurement/purchase-orders/${po.id}`,
          ...(po.creator ? { createdBy: po.creator.username } : {}),
        });
      }
    }

    const returnedPrs = await this.prisma.purchaseRequest.findMany({
      where: { organizationId: orgId, status: 'returned', createdBy: user.userId },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    for (const pr of returnedPrs) {
      items.push({
        id: pr.id,
        module: 'procurement',
        type: 'pr_returned',
        label: pr.prNumber,
        description: pr.remarks
          ? `${pr.title} — ${pr.remarks}`
          : `${pr.title} — returned for correction`,
        amount: pr.totalAmount.toString(),
        createdAt: pr.updatedAt.toISOString(),
        actionLabel: 'Edit & Resubmit',
        link: `/procurement/purchase-requests/${pr.id}`,
      });
    }

    // ── Teller remittances awaiting the cashier's acceptance ──
    if (perms.has('collections.remittance.receive')) {
      const remittances = await this.prisma.tellerSession.findMany({
        where: { organizationId: orgId, status: 'remitted' },
        orderBy: { remittedAt: 'asc' },
        take: 20,
      });
      const tellerIds = [...new Set(remittances.map((s) => s.tellerId))];
      const tellers = tellerIds.length
        ? await this.prisma.user.findMany({
            where: { id: { in: tellerIds } },
            select: { id: true, username: true },
          })
        : [];
      const nameById = new Map(tellers.map((t) => [t.id, t.username]));
      for (const s of remittances) {
        const teller = nameById.get(s.tellerId) ?? 'teller';
        const so = Number(s.shortageOverage);
        const soNote =
          so === 0
            ? ''
            : ` — ${so > 0 ? 'overage' : 'shortage'} of ₱${Math.abs(so).toLocaleString('en-PH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;
        items.push({
          id: s.id,
          module: 'billing',
          type: 'teller_remittance',
          label: s.sessionNumber,
          description: `Remittance from ${teller}${soNote}`,
          amount: s.totalActualRemittance.toString(),
          createdAt: (s.remittedAt ?? s.createdAt).toISOString(),
          actionLabel: 'Receive',
          link: '/billing/remittances',
          createdBy: teller,
        });
      }
    }

    return { items, total: items.length };
  }

  @Get('stats')
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    const orgId = user.organizationId;
    const perms = await this.getPermissions(user.userId);

    const stats: { label: string; value: number; color: string; link?: string }[] = [];

    if (perms.has('procurement.read')) {
      const [myDrafts, totalActive] = await Promise.all([
        this.prisma.purchaseRequest.count({
          where: { organizationId: orgId, createdBy: user.userId, status: 'draft' },
        }),
        this.prisma.purchaseRequest.count({
          where: {
            organizationId: orgId,
            status: { notIn: ['cancelled', 'rejected', 'voided', 'completed'] },
          },
        }),
      ]);
      stats.push({
        label: 'My Drafts',
        value: myDrafts,
        color: '#667085',
        link: '/procurement?status=draft',
      });
      stats.push({
        label: 'Active PRs',
        value: totalActive,
        color: '#175cd3',
        link: '/procurement?status=active',
      });
    }

    if (perms.has('procurement.pr.endorse')) {
      const count = await this.prisma.purchaseRequest.count({
        where: { organizationId: orgId, status: 'submitted' },
      });
      stats.push({
        label: 'Awaiting Endorsement',
        value: count,
        color: '#f59e0b',
        link: '/procurement?status=submitted',
      });
    }

    if (perms.has('procurement.pr.budget_certify')) {
      const count = await this.prisma.purchaseRequest.count({
        where: { organizationId: orgId, status: 'endorsed' },
      });
      stats.push({
        label: 'Awaiting Budget Cert.',
        value: count,
        color: '#f59e0b',
        link: '/procurement?status=endorsed',
      });
    }

    if (perms.has('procurement.pr.final_approve')) {
      const count = await this.prisma.purchaseRequest.count({
        where: { organizationId: orgId, status: 'budget_certified' },
      });
      stats.push({
        label: 'Awaiting Approval',
        value: count,
        color: '#f59e0b',
        link: '/procurement?status=budget_certified',
      });
    }

    if (perms.has('procurement.po.create') || perms.has('procurement.pr.accept_procurement')) {
      const [completedPRs, activePOs] = await Promise.all([
        this.prisma.purchaseRequest.count({
          where: { organizationId: orgId, status: 'completed' },
        }),
        this.prisma.purchaseOrder.count({
          where: { organizationId: orgId, status: { notIn: ['cancelled'] } },
        }),
      ]);
      stats.push({
        label: 'Completed PRs',
        value: completedPRs,
        color: '#067647',
        link: '/procurement?status=completed',
      });
      stats.push({
        label: 'Active POs',
        value: activePOs,
        color: '#0369a1',
        link: '/procurement/purchase-orders?status=active',
      });
    }

    return { stats };
  }

  @Get('executive')
  async getExecutiveSummary(@CurrentUser() user: AuthenticatedUser) {
    const perms = await this.getPermissions(user.userId);
    return this.executiveDashboard.getSummary(user.organizationId, perms);
  }

  private async getPermissions(userId: string): Promise<Set<string>> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    const roleIds = userRoles.map((ur) => ur.roleId);
    if (roleIds.length === 0) return new Set();

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
      include: { permission: { select: { code: true } } },
    });
    return new Set(rolePermissions.map((rp) => rp.permission.code));
  }
}

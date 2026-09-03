import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from './common/decorators/current-user.decorator';
import { getGrantedPermissionCodes } from './common/guards/get-granted-permission-codes';
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

    // ── Collection batches awaiting the accountant (review → approve → post) ──
    const batchStages: Array<{ perm: string; status: string; type: string; action: string }> = [
      {
        perm: 'collections.accounting.review',
        status: 'for_review',
        type: 'collection_batch_review',
        action: 'Review',
      },
      {
        perm: 'collections.accounting.approve',
        status: 'reviewed',
        type: 'collection_batch_approve',
        action: 'Approve',
      },
      {
        perm: 'collections.accounting.post',
        status: 'approved',
        type: 'collection_batch_post',
        action: 'Post to GL',
      },
    ];
    for (const stage of batchStages) {
      if (!perms.has(stage.perm)) continue;
      const batches = await this.prisma.collectionAccountingBatch.findMany({
        where: { organizationId: orgId, status: stage.status as never },
        orderBy: { collectionDate: 'asc' },
        take: 20,
      });
      for (const b of batches) {
        items.push({
          id: b.id,
          module: 'accounting',
          type: stage.type,
          label: b.batchNumber,
          description: `Collections for ${b.collectionDate.toISOString().slice(0, 10)} — ${b.transactionCount} receipt(s)`,
          amount: b.totalCollections.toString(),
          createdAt: (b.preparedAt ?? b.createdAt).toISOString(),
          actionLabel: stage.action,
          link: `/accounting/collection-batches/${b.id}`,
        });
      }
    }

    // ── Cashier daily collection reports submitted for the accountant's review ──
    if (perms.has('accounting.jev.approve')) {
      const jevs = await this.prisma.journalEntryVoucher.findMany({
        where: {
          organizationId: orgId,
          status: 'for_review',
          sourceTable: 'cashier_collection_reports',
        },
        orderBy: { jevDate: 'asc' },
        take: 20,
        select: {
          id: true,
          jevNumber: true,
          particulars: true,
          totalCredit: true,
          createdAt: true,
          lines: { where: { pendingClassification: true }, select: { id: true } },
        },
      });
      for (const j of jevs) {
        const needsClassification = j.lines.length > 0;
        items.push({
          id: j.id,
          module: 'accounting',
          type: 'collection_jev_review',
          label: j.jevNumber,
          description: needsClassification
            ? `${j.particulars} — ${j.lines.length} "Other" line(s) need a GL account`
            : j.particulars,
          amount: j.totalCredit.toString(),
          createdAt: j.createdAt.toISOString(),
          actionLabel: needsClassification ? 'Classify & Post' : 'Review JEV',
          link: `/accounting/jev/${j.id}`,
        });
      }
    }

    // ── JEVs a data-entry user submitted for the accountant to review/post ──
    // (Cashier-collection JEVs are handled by their own block above; exclude
    // them here so they aren't listed twice.)
    if (perms.has('accounting.jev.post') || perms.has('accounting.jev.approve')) {
      const jevs = await this.prisma.journalEntryVoucher.findMany({
        where: {
          organizationId: orgId,
          status: 'for_review',
          sourceType: { not: 'disbursement' },
        },
        orderBy: { jevDate: 'asc' },
        take: 20,
        select: {
          id: true,
          jevNumber: true,
          particulars: true,
          totalDebit: true,
          createdAt: true,
          sourceTable: true,
          creator: { select: { username: true } },
        },
      });
      for (const j of jevs) {
        if (j.sourceTable === 'cashier_collection_reports') continue;
        items.push({
          id: j.id,
          module: 'accounting',
          type: 'jev_review',
          label: j.jevNumber,
          description: j.particulars,
          amount: j.totalDebit.toString(),
          createdAt: j.createdAt.toISOString(),
          actionLabel: 'Review JEV',
          link: `/accounting/jev/${j.id}`,
          ...(j.creator ? { createdBy: j.creator.username } : {}),
        });
      }
    }

    // ── Draft DVs a data-entry user saved for the accountant to review & post ──
    if (perms.has('accounting.dv.post')) {
      const dvs = await this.prisma.disbursementVoucher.findMany({
        where: { organizationId: orgId, status: 'draft' },
        orderBy: { dvDate: 'asc' },
        take: 20,
        select: {
          id: true,
          dvNumber: true,
          payeeName: true,
          particulars: true,
          netAmount: true,
          createdAt: true,
          creator: { select: { username: true } },
        },
      });
      for (const d of dvs) {
        items.push({
          id: d.id,
          module: 'accounting',
          type: 'dv_review',
          label: d.dvNumber,
          description: d.payeeName ? `${d.payeeName} — ${d.particulars}` : d.particulars,
          amount: d.netAmount.toString(),
          createdAt: d.createdAt.toISOString(),
          actionLabel: 'Review & Post DV',
          link: `/accounting/disbursements/${d.id}`,
          ...(d.creator ? { createdBy: d.creator.username } : {}),
        });
      }
    }

    // ── Checks awaiting printing by the cashier ──
    if (perms.has('accounting.check.print')) {
      const checks = await this.prisma.check.findMany({
        where: { organizationId: orgId, status: 'pending' },
        orderBy: { checkDate: 'asc' },
        take: 20,
        select: {
          id: true,
          checkDate: true,
          payeeName: true,
          amount: true,
          createdAt: true,
          disbursementVoucher: { select: { dvNumber: true } },
        },
      });
      for (const c of checks) {
        const dv = c.disbursementVoucher?.dvNumber;
        items.push({
          id: c.id,
          module: 'accounting',
          type: 'check_to_print',
          label: dv ? `Check for ${dv}` : 'Check to print',
          description: `Print check payable to ${c.payeeName}`,
          amount: c.amount.toString(),
          createdAt: c.createdAt.toISOString(),
          actionLabel: 'Print check',
          link: '/accounting/checks',
        });
      }
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
    // Include direct per-user grants and delegations, not just role permissions —
    // live access is granted per-user, so a role-only check would hide the
    // accountant's pending actions.
    return getGrantedPermissionCodes(this.prisma, userId);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CurrentUser } from './common/decorators/current-user.decorator';
import { PrismaService } from './database/prisma.service';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import type { AuthenticatedUser } from './modules/auth/jwt.strategy';

interface SearchItem {
  id: string;
  label: string;
  description: string;
  amount: string;
  date: string;
  status?: string;
  link: string;
}
interface SearchGroup {
  category: string;
  items: SearchItem[];
}

const TAKE = 15;

/**
 * Global quick search across the documents a user can see — journal entries,
 * disbursement vouchers, checks, and collections — matched by number, name,
 * particulars, or exact amount. Each category is included only when the user
 * holds the permission that guards it, so a result never leads to a 403.
 */
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(@CurrentUser() user: AuthenticatedUser, @Query('q') q?: string) {
    const orgId = user.organizationId;
    const query = (q ?? '').trim();
    if (!query) return { query: '', total: 0, groups: [] };

    const perms = await this.getPermissions(user.userId);
    const groups: SearchGroup[] = [];

    const like: Prisma.StringFilter = { contains: query, mode: 'insensitive' };
    const parsed = parseFloat(query.replace(/[^0-9.]/g, ''));
    const amount = !isNaN(parsed) && parsed > 0 ? parsed : null;

    // ── Journal Entries ──
    if (perms.has('accounting.read')) {
      const or: Prisma.JournalEntryVoucherWhereInput[] = [
        { jevNumber: like },
        { particulars: like },
      ];
      if (amount !== null) or.push({ totalDebit: amount });
      const rows = await this.prisma.journalEntryVoucher.findMany({
        where: { organizationId: orgId, OR: or },
        orderBy: { jevDate: 'desc' },
        take: TAKE,
        select: {
          id: true,
          jevNumber: true,
          particulars: true,
          totalDebit: true,
          jevDate: true,
          status: true,
        },
      });
      if (rows.length) {
        groups.push({
          category: 'Journal Entries',
          items: rows.map((j) => ({
            id: j.id,
            label: j.jevNumber,
            description: j.particulars,
            amount: j.totalDebit.toString(),
            date: j.jevDate.toISOString(),
            status: j.status,
            link: `/accounting/jev/${j.id}`,
          })),
        });
      }
    }

    // ── Disbursement Vouchers ──
    if (perms.has('accounting.dv.read')) {
      const or: Prisma.DisbursementVoucherWhereInput[] = [
        { dvNumber: like },
        { payeeName: like },
        { particulars: like },
      ];
      if (amount !== null) or.push({ netAmount: amount }, { grossAmount: amount });
      const rows = await this.prisma.disbursementVoucher.findMany({
        where: { organizationId: orgId, OR: or },
        orderBy: { dvDate: 'desc' },
        take: TAKE,
        select: {
          id: true,
          dvNumber: true,
          payeeName: true,
          particulars: true,
          netAmount: true,
          dvDate: true,
          status: true,
        },
      });
      if (rows.length) {
        groups.push({
          category: 'Disbursement Vouchers',
          items: rows.map((d) => ({
            id: d.id,
            label: d.dvNumber,
            description: [d.payeeName, d.particulars].filter(Boolean).join(' — ').slice(0, 140),
            amount: d.netAmount.toString(),
            date: d.dvDate.toISOString(),
            status: d.status,
            link: `/accounting/disbursements/${d.id}`,
          })),
        });
      }
    }

    // ── Checks ──
    if (perms.has('accounting.check.read')) {
      const or: Prisma.CheckWhereInput[] = [{ checkNumber: like }, { payeeName: like }];
      if (amount !== null) or.push({ amount });
      const rows = await this.prisma.check.findMany({
        where: { organizationId: orgId, OR: or },
        orderBy: { checkDate: 'desc' },
        take: TAKE,
        select: {
          id: true,
          checkNumber: true,
          payeeName: true,
          amount: true,
          checkDate: true,
          status: true,
          disbursementVoucherId: true,
        },
      });
      if (rows.length) {
        groups.push({
          category: 'Checks',
          items: rows.map((c) => ({
            id: c.id,
            label: c.checkNumber ?? '(unnumbered)',
            description: c.payeeName,
            amount: c.amount.toString(),
            date: c.checkDate.toISOString(),
            status: c.status,
            // No standalone check page — open the disbursement it belongs to.
            link: c.disbursementVoucherId
              ? `/accounting/disbursements/${c.disbursementVoucherId}`
              : '/accounting/checks',
          })),
        });
      }
    }

    // ── Collections (payments) ──
    if (perms.has('billing.read')) {
      const or: Prisma.PaymentWhereInput[] = [
        { orNumber: like },
        { payerName: like },
        {
          consumer: {
            is: { OR: [{ firstName: like }, { lastName: like }, { accountNumber: like }] },
          },
        },
      ];
      if (amount !== null) or.push({ totalAmount: amount });
      const rows = await this.prisma.payment.findMany({
        where: { organizationId: orgId, OR: or },
        orderBy: { paymentDate: 'desc' },
        take: TAKE,
        select: {
          id: true,
          orNumber: true,
          payerName: true,
          totalAmount: true,
          paymentDate: true,
          status: true,
          consumer: { select: { accountNumber: true, firstName: true, lastName: true } },
        },
      });
      if (rows.length) {
        groups.push({
          category: 'Collections',
          items: rows.map((p) => ({
            id: p.id,
            label: p.orNumber,
            description: p.consumer
              ? `${p.consumer.accountNumber} — ${p.consumer.lastName}, ${p.consumer.firstName}`
              : (p.payerName ?? 'Walk-in'),
            amount: p.totalAmount.toString(),
            date: p.paymentDate.toISOString(),
            status: p.status,
            link: `/billing/payments/${p.id}`,
          })),
        });
      }
    }

    return { query, total: groups.reduce((s, g) => s + g.items.length, 0), groups };
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

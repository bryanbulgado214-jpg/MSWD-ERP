import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

// Money is accumulated in integer centavos to avoid floating-point drift.
const toCents = (v: unknown) => Math.round(Number(v) * 100);
const toPeso = (c: number) => c / 100;

/** Today's date (server-local) as a date-only Date, matching how bills/payments
 * store dates elsewhere. */
function today(): { str: string; date: Date } {
  const n = new Date();
  const str = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
    n.getDate(),
  ).padStart(2, '0')}`;
  return { str, date: new Date(str) };
}

type PaymentRow = {
  orNumber: string;
  totalAmount: unknown;
  paymentMethod: string;
  status: string;
  createdAt: Date;
};

/**
 * Teller cash session (shift). A teller OPENS a session, collects receipts
 * against it, CLOSES it (the system tallies the receipts), then REMITS the
 * physical cash/checks to the cashier who RECEIVES it — producing the
 * shortage/overage and the audit chain that precedes accounting consolidation.
 *
 *   open → closed → remitted → accepted
 */
@Injectable()
export class TellerSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** The teller's own currently-open session, or null. */
  async current(orgId: string, tellerId: string) {
    return this.prisma.tellerSession.findFirst({
      where: { organizationId: orgId, tellerId, status: 'open' },
      orderBy: { openedAt: 'desc' },
    });
  }

  async list(orgId: string, filters: { status?: string; tellerId?: string; date?: string }) {
    const sessions = await this.prisma.tellerSession.findMany({
      where: {
        organizationId: orgId,
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.tellerId ? { tellerId: filters.tellerId } : {}),
        ...(filters.date ? { collectionDate: new Date(filters.date) } : {}),
      },
      orderBy: [{ openedAt: 'desc' }],
    });
    const tellerIds = [...new Set(sessions.map((s) => s.tellerId))];
    const tellers = tellerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: tellerIds } },
          select: { id: true, username: true },
        })
      : [];
    const nameById = new Map(tellers.map((t) => [t.id, t.username]));
    return sessions.map((s) => ({ ...s, tellerName: nameById.get(s.tellerId) ?? '' }));
  }

  async getDetail(orgId: string, id: string) {
    const session = await this.prisma.tellerSession.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!session) throw new NotFoundException('Teller session not found.');

    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, tellerSessionId: id },
      select: {
        id: true,
        orNumber: true,
        paymentDate: true,
        totalAmount: true,
        paymentMethod: true,
        status: true,
        payerName: true,
        createdAt: true,
        consumer: { select: { accountNumber: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const [teller, cashier] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: session.tellerId },
        select: { username: true },
      }),
      session.receivedByCashierId
        ? this.prisma.user.findUnique({
            where: { id: session.receivedByCashierId },
            select: { username: true },
          })
        : Promise.resolve(null),
    ]);

    // A live tally so an OPEN session shows running totals before it is closed.
    const live = this.tally(payments);

    return {
      session,
      live,
      tellerName: teller?.username ?? '',
      cashierName: cashier?.username ?? '',
      payments,
    };
  }

  /** Tally valid receipts by tender; electronic = online + bank_deposit. */
  private tally(payments: PaymentRow[]) {
    const valid = payments.filter((p) => p.status === 'valid');
    let cash = 0;
    let check = 0;
    let electronic = 0;
    let other = 0;
    for (const p of valid) {
      const c = toCents(p.totalAmount);
      if (p.paymentMethod === 'cash') cash += c;
      else if (p.paymentMethod === 'check') check += c;
      else if (p.paymentMethod === 'online' || p.paymentMethod === 'bank_deposit') electronic += c;
      else other += c;
    }
    const ordered = [...valid].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return {
      transactionCount: valid.length,
      voidedReceiptCount: payments.length - valid.length,
      beginningOrNumber: ordered[0]?.orNumber ?? null,
      endingOrNumber: ordered[ordered.length - 1]?.orNumber ?? null,
      cashAmount: toPeso(cash),
      checkAmount: toPeso(check),
      electronicAmount: toPeso(electronic),
      otherAmount: toPeso(other),
      totalCollections: toPeso(cash + check + electronic + other),
      // Physical cash + checks the teller must hand over (electronic goes to bank).
      expectedRemittance: toPeso(cash + check),
    };
  }

  /** Open a shift. A teller may hold only one open session at a time. */
  async open(orgId: string, tellerId: string) {
    const existing = await this.current(orgId, tellerId);
    if (existing) {
      throw new ConflictException(
        'You already have an open session — close it before opening another.',
      );
    }
    const { str, date } = today();
    return runAudited(this.prisma, tellerId, async (tx) => {
      // Derive the next sequence from the highest existing suffix for the day —
      // robust to gaps (a deleted session) that a plain count() would collide on.
      const prefix = `TS-${str.replace(/-/g, '')}-`;
      const last = await tx.tellerSession.findFirst({
        where: { organizationId: orgId, sessionNumber: { startsWith: prefix } },
        orderBy: { sessionNumber: 'desc' },
        select: { sessionNumber: true },
      });
      const lastSeq = last ? parseInt(last.sessionNumber.slice(prefix.length), 10) || 0 : 0;
      const sessionNumber = `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
      return tx.tellerSession.create({
        data: {
          organizationId: orgId,
          tellerId,
          sessionNumber,
          collectionDate: date,
          status: 'open',
        },
      });
    });
  }

  /** Close the shift and tally its receipts. */
  async close(orgId: string, tellerId: string, id: string) {
    const session = await this.own(orgId, tellerId, id);
    if (session.status !== 'open') {
      throw new BadRequestException(`Only an open session can be closed (is ${session.status}).`);
    }
    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, tellerSessionId: id },
      select: {
        orNumber: true,
        totalAmount: true,
        paymentMethod: true,
        status: true,
        createdAt: true,
      },
    });
    const t = this.tally(payments);
    return runAudited(this.prisma, tellerId, (tx) =>
      tx.tellerSession.update({
        where: { id },
        data: {
          status: 'closed',
          closedAt: new Date(),
          transactionCount: t.transactionCount,
          voidedReceiptCount: t.voidedReceiptCount,
          beginningOrNumber: t.beginningOrNumber,
          endingOrNumber: t.endingOrNumber,
          cashAmount: t.cashAmount,
          checkAmount: t.checkAmount,
          electronicAmount: t.electronicAmount,
          otherAmount: t.otherAmount,
          totalCollections: t.totalCollections,
          expectedRemittance: t.expectedRemittance,
        },
      }),
    );
  }

  /** Remit physical cash/checks to the cashier; compute shortage/overage. */
  async remit(
    orgId: string,
    tellerId: string,
    id: string,
    data: {
      actualCashRemitted: number;
      actualChecksRemitted: number;
      remarks?: string;
      cashCount?: Record<string, number>;
    },
  ) {
    const session = await this.own(orgId, tellerId, id);
    if (session.status !== 'closed') {
      throw new BadRequestException(
        `Only a closed session can be remitted (is ${session.status}).`,
      );
    }
    const totalCents = toCents(data.actualCashRemitted) + toCents(data.actualChecksRemitted);
    const shortageCents = totalCents - toCents(session.expectedRemittance);
    return runAudited(this.prisma, tellerId, (tx) =>
      tx.tellerSession.update({
        where: { id },
        data: {
          status: 'remitted',
          actualCashRemitted: data.actualCashRemitted,
          actualChecksRemitted: data.actualChecksRemitted,
          totalActualRemittance: toPeso(totalCents),
          shortageOverage: toPeso(shortageCents),
          remittedAt: new Date(),
          ...(data.cashCount ? { cashCount: data.cashCount } : {}),
          ...(data.remarks ? { remarks: data.remarks } : {}),
        },
      }),
    );
  }

  /** Cashier accepts the remittance, closing the handoff loop. */
  async receive(orgId: string, cashierId: string, id: string, remarks?: string) {
    const session = await this.prisma.tellerSession.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!session) throw new NotFoundException('Teller session not found.');
    if (session.status !== 'remitted') {
      throw new BadRequestException(
        `Only a remitted session can be received (is ${session.status}).`,
      );
    }
    return runAudited(this.prisma, cashierId, (tx) =>
      tx.tellerSession.update({
        where: { id },
        data: {
          status: 'accepted',
          receivedByCashierId: cashierId,
          receivedAt: new Date(),
          ...(remarks ? { remarks } : {}),
        },
      }),
    );
  }

  private async own(orgId: string, tellerId: string, id: string) {
    const session = await this.prisma.tellerSession.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!session) throw new NotFoundException('Teller session not found.');
    if (session.tellerId !== tellerId) {
      throw new BadRequestException('This session belongs to another teller.');
    }
    return session;
  }
}

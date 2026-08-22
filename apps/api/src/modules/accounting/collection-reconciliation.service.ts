import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

type ReconCard = {
  left: number;
  right: number;
  difference: number;
  balanced: boolean;
};
const card = (left: number, right: number): ReconCard => {
  const difference = round2(left - right);
  return {
    left: round2(left),
    right: round2(right),
    difference,
    balanced: Math.abs(difference) <= 0.005,
  };
};

/**
 * Collections reconciliation control center. Compares the collection subledger,
 * the deposits, and the general ledger so Accounting can prove — as of now —
 * that the receivable subledger ties to GL A/R, that physical collections are
 * fully deposited, and that the collecting officer's cash accountability agrees
 * with the ledger.
 */
@Injectable()
export class CollectionReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(orgId: string) {
    const [ar, co] = await Promise.all([
      this.mapping(orgId, 'ar.trade_receivable'),
      this.mapping(orgId, 'cash.collecting_officer'),
    ]);

    const [arGl, coGl] = await Promise.all([this.glBalance(orgId, ar), this.glBalance(orgId, co)]);

    // AR subledger = every consumer bill's outstanding balance (principal + any
    // accrued penalty − payments).
    const billAgg = await this.prisma.bill.aggregate({
      where: { organizationId: orgId, balance: { gt: 0 } },
      _sum: { balance: true },
    });
    const arSubledger = round2(Number(billAgg._sum.balance ?? 0));

    const postedBatches = await this.prisma.collectionAccountingBatch.findMany({
      where: { organizationId: orgId, status: 'posted' },
      select: { totalCollections: true, cashAmount: true, checkAmount: true },
    });
    const collectionsPosted = round2(
      postedBatches.reduce((s, b) => s + Number(b.totalCollections), 0),
    );
    const physicalCollections = round2(
      postedBatches.reduce((s, b) => s + Number(b.cashAmount) + Number(b.checkAmount), 0),
    );

    const unpostedAgg = await this.prisma.collectionAccountingBatch.aggregate({
      where: {
        organizationId: orgId,
        status: { in: ['open', 'for_review', 'reviewed', 'approved'] },
      },
      _sum: { totalCollections: true },
    });
    const unpostedCollections = round2(Number(unpostedAgg._sum.totalCollections ?? 0));

    const depAgg = await this.prisma.collectionDeposit.aggregate({
      where: { organizationId: orgId },
      _sum: { depositAmount: true },
    });
    const deposited = round2(Number(depAgg._sum.depositAmount ?? 0));

    return {
      // Collections reduce the subledger at the teller but only credit GL A/R when
      // the Cashier finalizes — so unposted collections are one component of any
      // difference (other components would be prior/opening GL A/R activity).
      arSubledgerVsGl: {
        ...card(arSubledger, arGl),
        note: unpostedCollections
          ? `Includes ${unpostedCollections.toFixed(2)} of collections recorded but awaiting Cashier finalize; finalizing the open batches settles that portion in the GL.`
          : 'No collections awaiting finalize.',
      },
      collectionsVsDeposits: {
        ...card(physicalCollections, deposited),
        undeposited: round2(physicalCollections - deposited),
      },
      cashInCustody: {
        ...card(collectionsPosted - deposited, coGl),
        note: 'Posted collections less deposits should equal the GL Cash - Collecting Officer balance.',
      },
      context: { collectionsPosted, unpostedCollections, physicalCollections, deposited },
    };
  }

  private async glBalance(orgId: string, accountId: string | null) {
    if (!accountId) return 0;
    const agg = await this.prisma.jevLine.aggregate({
      where: { chartOfAccountId: accountId, jev: { organizationId: orgId, status: 'posted' } },
      _sum: { debitAmount: true, creditAmount: true },
    });
    return round2(Number(agg._sum.debitAmount ?? 0) - Number(agg._sum.creditAmount ?? 0));
  }

  private async mapping(orgId: string, key: string) {
    const m = await this.prisma.accountMapping.findFirst({
      where: { organizationId: orgId, mappingKey: key, isActive: true },
      select: { chartOfAccountId: true },
    });
    return m?.chartOfAccountId ?? null;
  }
}

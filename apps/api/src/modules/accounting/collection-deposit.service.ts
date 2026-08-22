import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { AutoJevService } from './auto-jev.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Bank deposit of a collection batch's physical (cash + check) collections. On
 * record the ERP auto-posts the second JEV of the cycle —
 * Dr Cash in Bank, Cr Cash - Collecting Officer — moving the money from the
 * collecting officer's custody to the bank. Electronic collections settle
 * directly to the bank at collection and are not re-deposited here.
 */
@Injectable()
export class CollectionDepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJev: AutoJevService,
  ) {}

  /** Physical collectible, deposited, and undeposited for a posted batch. */
  async summaryForBatch(orgId: string, batchId: string) {
    const batch = await this.prisma.collectionAccountingBatch.findFirst({
      where: { id: batchId, organizationId: orgId },
      select: { cashAmount: true, checkAmount: true, status: true },
    });
    if (!batch) throw new NotFoundException('Collection batch not found.');
    const physical = round2(Number(batch.cashAmount) + Number(batch.checkAmount));
    const deposits = await this.prisma.collectionDeposit.findMany({
      where: { organizationId: orgId, collectionBatchId: batchId },
      orderBy: { depositDate: 'asc' },
    });
    const deposited = round2(deposits.reduce((s, d) => s + Number(d.depositAmount), 0));
    const undeposited = round2(physical - deposited);
    const depositStatus =
      physical <= 0.005 || deposited <= 0.005
        ? deposited <= 0.005
          ? 'not_deposited'
          : 'fully_deposited'
        : undeposited <= 0.005
          ? 'fully_deposited'
          : 'partially_deposited';
    return { physicalCollectible: physical, deposited, undeposited, depositStatus, deposits };
  }

  async record(
    orgId: string,
    userId: string,
    dto: {
      collectionBatchId: string;
      depositDate: string;
      depositAmount: number;
      bankAccountId?: string;
      depositSlipNumber?: string;
      bankReference?: string;
    },
  ) {
    const batch = await this.prisma.collectionAccountingBatch.findFirst({
      where: { id: dto.collectionBatchId, organizationId: orgId },
    });
    if (!batch) throw new NotFoundException('Collection batch not found.');
    if (batch.status !== 'posted') {
      throw new BadRequestException(
        'The collection batch must be finalized/posted before its collections can be deposited.',
      );
    }

    const summary = await this.summaryForBatch(orgId, dto.collectionBatchId);
    if (dto.depositAmount <= 0) {
      throw new BadRequestException('Deposit amount must be greater than zero.');
    }
    if (dto.depositAmount > summary.undeposited + 0.01) {
      throw new BadRequestException(
        `Deposit of ${dto.depositAmount} exceeds the undeposited balance of ${summary.undeposited}.`,
      );
    }

    const cashInBank = await this.mapping(orgId, 'cash.in_bank');
    const collectingOfficer = await this.mapping(orgId, 'cash.collecting_officer');
    if (!cashInBank || !collectingOfficer) {
      throw new BadRequestException(
        'Cash in Bank and/or Cash - Collecting Officer posting accounts are not configured.',
      );
    }
    const depositDate = new Date(dto.depositDate);

    return runAudited(this.prisma, userId, async (tx) => {
      const deposit = await tx.collectionDeposit.create({
        data: {
          organizationId: orgId,
          collectionBatchId: dto.collectionBatchId,
          depositDate,
          depositAmount: dto.depositAmount,
          verifiedAmount: dto.depositAmount,
          status: 'verified',
          depositedBy: userId,
          verifiedBy: userId,
          verifiedAt: new Date(),
          ...(dto.bankAccountId ? { bankAccountId: dto.bankAccountId } : {}),
          ...(dto.depositSlipNumber ? { depositSlipNumber: dto.depositSlipNumber } : {}),
          ...(dto.bankReference ? { bankReference: dto.bankReference } : {}),
        },
      });

      const jev = await this.autoJev.createAutoJev(tx, {
        organizationId: orgId,
        userId,
        jevDate: depositDate,
        sourceType: 'collection',
        sourceTable: 'collection_deposits',
        sourceId: deposit.id,
        particulars:
          `To record bank deposit of collections — ${batch.batchNumber}` +
          (dto.depositSlipNumber ? ` (slip ${dto.depositSlipNumber})` : ''),
        lines: [
          {
            chartOfAccountId: cashInBank,
            debitAmount: dto.depositAmount,
            creditAmount: 0,
            description: `Bank deposit — ${batch.batchNumber}`,
          },
          {
            chartOfAccountId: collectingOfficer,
            debitAmount: 0,
            creditAmount: dto.depositAmount,
            description: `Remitted to bank — ${batch.batchNumber}`,
          },
        ],
      });
      if (!jev) {
        throw new BadRequestException(
          'No open accounting period for the deposit date — cannot post.',
        );
      }

      return tx.collectionDeposit.update({ where: { id: deposit.id }, data: { jevId: jev.id } });
    });
  }

  private async mapping(orgId: string, key: string) {
    const m = await this.prisma.accountMapping.findFirst({
      where: { organizationId: orgId, mappingKey: key, isActive: true },
      select: { chartOfAccountId: true },
    });
    return m?.chartOfAccountId ?? null;
  }
}

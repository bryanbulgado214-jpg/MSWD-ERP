import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

// Uploaded bank-statement files live on disk under the API working dir; the
// Attachment row keeps the relative path. (uploads/ is gitignored.)
const UPLOAD_SUBDIR = path.join('uploads', 'reconciliations');
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];

const RECON_SELECT = {
  id: true,
  reconciliationDate: true,
  bookBalance: true,
  bankBalance: true,
  adjustedBookBalance: true,
  adjustedBankBalance: true,
  difference: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  bankAccount: {
    select: {
      id: true,
      accountNumber: true,
      accountName: true,
      bank: { select: { code: true, name: true } },
    },
  },
  accountingPeriod: { select: { id: true, name: true, periodNumber: true } },
  preparer: { select: { username: true } },
  approver: { select: { username: true } },
  approvedAt: true,
} as const;

const RECON_DETAIL_SELECT = {
  ...RECON_SELECT,
  items: {
    select: {
      id: true,
      itemType: true,
      referenceNumber: true,
      referenceDate: true,
      amount: true,
      description: true,
      checkId: true,
      check: { select: { id: true, checkNumber: true, payeeName: true, status: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class BankReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters?: { bankAccountId?: string; status?: string }) {
    return this.prisma.bankReconciliation.findMany({
      where: {
        organizationId,
        ...(filters?.bankAccountId ? { bankAccountId: filters.bankAccountId } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
      },
      select: RECON_SELECT,
      orderBy: { reconciliationDate: 'desc' },
      take: 100,
    });
  }

  async findOne(organizationId: string, id: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
      select: RECON_DETAIL_SELECT,
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    return recon;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      bankAccountId: string;
      accountingPeriodId: string;
      reconciliationDate: string;
      bookBalance: number;
      bankBalance: number;
    },
  ) {
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, organizationId },
    });
    if (!bankAccount) throw new BadRequestException('Bank account not found.');

    return runAudited(this.prisma, userId, (tx) =>
      tx.bankReconciliation.create({
        data: {
          organizationId,
          bankAccountId: data.bankAccountId,
          accountingPeriodId: data.accountingPeriodId,
          reconciliationDate: new Date(data.reconciliationDate),
          bookBalance: data.bookBalance,
          bankBalance: data.bankBalance,
          adjustedBookBalance: data.bookBalance,
          adjustedBankBalance: data.bankBalance,
          difference: data.bookBalance - data.bankBalance,
          status: 'in_progress',
          preparedBy: userId,
          createdBy: userId,
          updatedBy: userId,
        },
        select: RECON_DETAIL_SELECT,
      }),
    );
  }

  async addItem(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      itemType: string;
      referenceNumber?: string;
      referenceDate: string;
      amount: number;
      description: string;
      checkId?: string;
    },
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved')
      throw new BadRequestException('Cannot modify an approved reconciliation.');
    if (recon.version !== data.expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.bankReconciliationItem.create({
        data: {
          bankReconciliationId: id,
          itemType: data.itemType as any,
          ...(data.referenceNumber ? { referenceNumber: data.referenceNumber } : {}),
          referenceDate: new Date(data.referenceDate),
          amount: data.amount,
          description: data.description,
          ...(data.checkId ? { checkId: data.checkId } : {}),
        },
      });

      const updated = await this.recalculate(tx, id, userId);
      return updated;
    });
  }

  async removeItem(
    organizationId: string,
    reconId: string,
    itemId: string,
    userId: string,
    expectedVersion: number,
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id: reconId, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved')
      throw new BadRequestException('Cannot modify an approved reconciliation.');
    if (recon.version !== expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.bankReconciliationItem.delete({ where: { id: itemId } });
      return this.recalculate(tx, reconId, userId);
    });
  }

  /** Bulk-add reconciling items — used by the CSV bank-transaction import. */
  async addItemsBulk(
    organizationId: string,
    id: string,
    userId: string,
    data: {
      expectedVersion: number;
      items: Array<{
        itemType: string;
        referenceNumber?: string;
        referenceDate: string;
        amount: number;
        description: string;
      }>;
    },
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({ where: { id, organizationId } });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status === 'approved') {
      throw new BadRequestException('Cannot modify an approved reconciliation.');
    }
    if (recon.version !== data.expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }
    if (!data.items?.length) throw new BadRequestException('No transactions to import.');

    return runAudited(this.prisma, userId, async (tx) => {
      await tx.bankReconciliationItem.createMany({
        data: data.items.map((it) => ({
          bankReconciliationId: id,
          itemType: it.itemType as any,
          referenceNumber: it.referenceNumber ?? null,
          referenceDate: new Date(it.referenceDate),
          amount: it.amount,
          description: it.description,
        })),
      });
      return this.recalculate(tx, id, userId);
    });
  }

  /** Store an uploaded bank-statement file (PDF/PNG/JPEG) against the recon. */
  async addAttachment(
    organizationId: string,
    id: string,
    userId: string,
    file?: Express.Multer.File,
  ) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF, PNG, or JPEG files are allowed.');
    }

    const dir = path.join(process.cwd(), UPLOAD_SUBDIR);
    fs.mkdirSync(dir, { recursive: true });
    const stored = `${randomUUID()}${path.extname(file.originalname)}`;
    fs.writeFileSync(path.join(dir, stored), file.buffer);

    const att = await this.prisma.attachment.create({
      data: {
        organizationId,
        attachableTable: 'bank_reconciliations',
        attachableId: id,
        fileName: file.originalname,
        filePath: path.join(UPLOAD_SUBDIR, stored),
        mimeType: file.mimetype,
        fileSizeBytes: BigInt(file.size),
        uploadedBy: userId,
      },
      select: { id: true, fileName: true, mimeType: true, fileSizeBytes: true, createdAt: true },
    });
    return { ...att, fileSizeBytes: Number(att.fileSizeBytes) };
  }

  async listAttachments(organizationId: string, id: string) {
    const atts = await this.prisma.attachment.findMany({
      where: { organizationId, attachableTable: 'bank_reconciliations', attachableId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSizeBytes: true,
        createdAt: true,
        uploader: { select: { username: true } },
      },
    });
    return atts.map((a) => ({ ...a, fileSizeBytes: Number(a.fileSizeBytes) }));
  }

  async getAttachmentFile(organizationId: string, id: string, attId: string) {
    const att = await this.prisma.attachment.findFirst({
      where: {
        id: attId,
        organizationId,
        attachableTable: 'bank_reconciliations',
        attachableId: id,
      },
      select: { fileName: true, filePath: true, mimeType: true },
    });
    if (!att) throw new NotFoundException('Attachment not found.');
    const abs = path.join(process.cwd(), att.filePath);
    if (!fs.existsSync(abs)) throw new NotFoundException('The file is missing on the server.');
    return { abs, fileName: att.fileName, mimeType: att.mimeType };
  }

  async complete(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status !== 'in_progress')
      throw new BadRequestException('Only in-progress reconciliations can be completed.');
    if (recon.version !== expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.bankReconciliation.update({
        where: { id },
        data: { status: 'completed', updatedBy: userId, version: { increment: 1 } },
        select: RECON_DETAIL_SELECT,
      }),
    );
  }

  async approve(organizationId: string, id: string, userId: string, expectedVersion: number) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, organizationId },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found.');
    if (recon.status !== 'completed')
      throw new BadRequestException('Only completed reconciliations can be approved.');
    if (recon.version !== expectedVersion) {
      throw new ConflictException('Reconciliation was modified. Please refresh.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.bankReconciliation.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: RECON_DETAIL_SELECT,
      }),
    );
  }

  private async recalculate(tx: any, reconId: string, userId: string) {
    const recon = await tx.bankReconciliation.findUnique({
      where: { id: reconId },
      include: { items: true },
    });

    let bookAdjustment = 0;
    let bankAdjustment = 0;

    for (const item of recon.items) {
      const amt = Number(item.amount);
      switch (item.itemType) {
        case 'deposit_in_transit':
          bankAdjustment += amt;
          break;
        case 'outstanding_check':
          bankAdjustment -= amt;
          break;
        case 'bank_charge':
          bookAdjustment -= amt;
          break;
        case 'bank_credit':
          bookAdjustment += amt;
          break;
        case 'book_error':
          bookAdjustment += amt;
          break;
        case 'bank_error':
          bankAdjustment += amt;
          break;
      }
    }

    const adjustedBook = Number(recon.bookBalance) + bookAdjustment;
    const adjustedBank = Number(recon.bankBalance) + bankAdjustment;
    const difference = adjustedBook - adjustedBank;

    return tx.bankReconciliation.update({
      where: { id: reconId },
      data: {
        adjustedBookBalance: adjustedBook,
        adjustedBankBalance: adjustedBank,
        difference,
        updatedBy: userId,
        version: { increment: 1 },
      },
      select: RECON_DETAIL_SELECT,
    });
  }
}

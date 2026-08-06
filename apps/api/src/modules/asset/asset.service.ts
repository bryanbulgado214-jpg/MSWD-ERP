import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AutoJevService } from '../accounting/auto-jev.service';

import type {
  AssignCategoryDto,
  CreateAssetCategoryDto,
  CreateAssetTransferDto,
  CreateDepreciationRunDto,
  UpdateAssetCategoryDto,
} from './dto/asset.dto';

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoJevService: AutoJevService,
  ) {}

  /* ═══════════════════════ Asset Categories ═══════════════════════ */

  async findAllCategories(organizationId: string) {
    return this.prisma.assetCategory.findMany({
      where: { organizationId },
      orderBy: { code: 'asc' },
    });
  }

  async findCategoryById(organizationId: string, id: string) {
    const cat = await this.prisma.assetCategory.findFirst({
      where: { id, organizationId },
    });
    if (!cat) throw new NotFoundException('Asset category not found.');
    return cat;
  }

  async createCategory(organizationId: string, userId: string, dto: CreateAssetCategoryDto) {
    const existing = await this.prisma.assetCategory.findFirst({
      where: { organizationId, code: dto.code },
    });
    if (existing) throw new ConflictException(`Category code "${dto.code}" already exists.`);

    return this.prisma.assetCategory.create({
      data: {
        organizationId,
        code: dto.code,
        name: dto.name,
        ...(dto.description ? { description: dto.description } : {}),
        ...(dto.depreciationMethod ? { depreciationMethod: dto.depreciationMethod as any } : {}),
        ...(dto.defaultUsefulLife !== undefined ? { defaultUsefulLife: dto.defaultUsefulLife } : {}),
        ...(dto.ppeAccountCode ? { ppeAccountCode: dto.ppeAccountCode } : {}),
        ...(dto.accumDeprAccountCode ? { accumDeprAccountCode: dto.accumDeprAccountCode } : {}),
        ...(dto.deprExpenseAccountCode ? { deprExpenseAccountCode: dto.deprExpenseAccountCode } : {}),
      },
    });
  }

  async updateCategory(organizationId: string, id: string, dto: UpdateAssetCategoryDto) {
    await this.findCategoryById(organizationId, id);

    const data: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(dto)) {
      if (val !== undefined) data[key] = val;
    }

    return this.prisma.assetCategory.update({
      where: { id },
      data,
    });
  }

  async assignCategory(organizationId: string, propertyRecordId: string, dto: AssignCategoryDto) {
    const pr = await this.prisma.propertyRecord.findFirst({
      where: { id: propertyRecordId, organizationId },
    });
    if (!pr) throw new NotFoundException('Property record not found.');

    await this.findCategoryById(organizationId, dto.assetCategoryId);

    return this.prisma.propertyRecord.update({
      where: { id: propertyRecordId },
      data: { assetCategoryId: dto.assetCategoryId },
    });
  }

  /* ═══════════════════════ Depreciation Runs ═══════════════════════ */

  async findAllRuns(organizationId: string, status?: string) {
    return this.prisma.depreciationRun.findMany({
      where: {
        organizationId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      include: {
        poster: { select: { id: true, username: true } },
        voider: { select: { id: true, username: true } },
        jev: { select: { id: true, jevNumber: true } },
      },
    });
  }

  async findRunById(organizationId: string, id: string) {
    const run = await this.prisma.depreciationRun.findFirst({
      where: { id, organizationId },
      include: {
        poster: { select: { id: true, username: true } },
        voider: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
        jev: { select: { id: true, jevNumber: true } },
        items: {
          include: {
            propertyRecord: {
              select: {
                id: true,
                propertyNumber: true,
                description: true,
                acquisitionCost: true,
                inventoryItem: { select: { description: true } },
              },
            },
            assetCategory: { select: { id: true, code: true, name: true } },
          },
          orderBy: { propertyRecord: { propertyNumber: 'asc' } },
        },
      },
    });
    if (!run) throw new NotFoundException('Depreciation run not found.');
    return run;
  }

  async createRun(organizationId: string, userId: string, dto: CreateDepreciationRunDto) {
    const existing = await this.prisma.depreciationRun.findFirst({
      where: {
        organizationId,
        periodMonth: dto.periodMonth,
        periodYear: dto.periodYear,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Depreciation run for ${dto.periodYear}-${String(dto.periodMonth).padStart(2, '0')} already exists.`,
      );
    }

    const runNumber = await this.generateRunNumber(organizationId);

    const eligibleAssets = await this.prisma.propertyRecord.findMany({
      where: {
        organizationId,
        isDisposed: false,
        assetCategoryId: { not: null },
        monthlyDepreciation: { not: null, gt: 0 },
      },
      include: {
        assetCategory: { select: { id: true, code: true, name: true } },
      },
    });

    const items: Array<{
      propertyRecordId: string;
      assetCategoryId: string | null;
      depreciationAmount: number;
      accumBefore: number;
      accumAfter: number;
      bookValueBefore: number;
      bookValueAfter: number;
    }> = [];

    for (const asset of eligibleAssets) {
      const acquisitionCost = Number(asset.acquisitionCost);
      const salvageValue = Number(asset.salvageValue ?? 0);
      const accumDepr = Number(asset.accumulatedDepreciation);
      const bookValue = acquisitionCost - accumDepr;
      const monthlyDepr = Number(asset.monthlyDepreciation);

      const remainingDepreciable = bookValue - salvageValue;
      if (remainingDepreciable <= 0) continue;

      const amount = Math.min(monthlyDepr, remainingDepreciable);
      if (amount <= 0) continue;

      items.push({
        propertyRecordId: asset.id,
        assetCategoryId: asset.assetCategoryId,
        depreciationAmount: amount,
        accumBefore: accumDepr,
        accumAfter: accumDepr + amount,
        bookValueBefore: bookValue,
        bookValueAfter: bookValue - amount,
      });
    }

    const totalDepreciation = items.reduce((s, i) => s + i.depreciationAmount, 0);

    const run = await this.prisma.depreciationRun.create({
      data: {
        organizationId,
        runNumber,
        periodMonth: dto.periodMonth,
        periodYear: dto.periodYear,
        status: 'draft',
        totalDepreciation,
        assetCount: items.length,
        createdBy: userId,
        items: {
          create: items.map((item) => ({
            propertyRecordId: item.propertyRecordId,
            assetCategoryId: item.assetCategoryId,
            depreciationAmount: item.depreciationAmount,
            accumBefore: item.accumBefore,
            accumAfter: item.accumAfter,
            bookValueBefore: item.bookValueBefore,
            bookValueAfter: item.bookValueAfter,
          })),
        },
      },
      include: {
        items: {
          include: {
            propertyRecord: {
              select: { id: true, propertyNumber: true, description: true },
            },
            assetCategory: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    this.logger.log(`Depreciation run ${runNumber} created with ${items.length} assets, total: ${totalDepreciation}`);
    return run;
  }

  async postRun(organizationId: string, userId: string, id: string, version: number) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.depreciationRun.findFirst({
        where: { id, organizationId },
        include: {
          items: {
            include: {
              assetCategory: true,
            },
          },
        },
      });
      if (!run) throw new NotFoundException('Depreciation run not found.');
      if (run.status !== 'draft') throw new BadRequestException('Only draft runs can be posted.');
      if (run.version !== version) {
        throw new ConflictException('Run has been modified. Refresh and try again.');
      }

      if (run.items.length === 0) {
        throw new BadRequestException('Cannot post an empty depreciation run.');
      }

      const categoryTotals = new Map<
        string,
        { categoryName: string; deprExpenseAccountCode: string; accumDeprAccountCode: string; totalAmount: number }
      >();

      for (const item of run.items) {
        const cat = item.assetCategory;
        if (!cat || !cat.deprExpenseAccountCode || !cat.accumDeprAccountCode) continue;

        const key = cat.id;
        const existing = categoryTotals.get(key);
        if (existing) {
          existing.totalAmount += Number(item.depreciationAmount);
        } else {
          categoryTotals.set(key, {
            categoryName: cat.name,
            deprExpenseAccountCode: cat.deprExpenseAccountCode,
            accumDeprAccountCode: cat.accumDeprAccountCode,
            totalAmount: Number(item.depreciationAmount),
          });
        }
      }

      const jev = await this.autoJevService.onDepreciationPosted(tx, organizationId, userId, {
        id: run.id,
        runNumber: run.runNumber,
        periodMonth: run.periodMonth,
        periodYear: run.periodYear,
        categoryTotals: Array.from(categoryTotals.values()),
      });

      for (const item of run.items) {
        await tx.propertyRecord.update({
          where: { id: item.propertyRecordId },
          data: {
            accumulatedDepreciation: item.accumAfter,
            bookValue: item.bookValueAfter,
          },
        });
      }

      const updated = await tx.depreciationRun.update({
        where: { id },
        data: {
          status: 'posted',
          postedBy: userId,
          postedAt: new Date(),
          ...(jev ? { jevId: jev.id } : {}),
          version: { increment: 1 },
        },
      });

      this.logger.log(`Depreciation run ${run.runNumber} posted, JEV: ${jev?.jevNumber ?? 'none'}`);
      return updated;
    });
  }

  async voidRun(organizationId: string, userId: string, id: string, version: number) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.depreciationRun.findFirst({
        where: { id, organizationId },
        include: { items: true },
      });
      if (!run) throw new NotFoundException('Depreciation run not found.');
      if (run.status !== 'posted') throw new BadRequestException('Only posted runs can be voided.');
      if (run.version !== version) {
        throw new ConflictException('Run has been modified. Refresh and try again.');
      }

      for (const item of run.items) {
        await tx.propertyRecord.update({
          where: { id: item.propertyRecordId },
          data: {
            accumulatedDepreciation: item.accumBefore,
            bookValue: item.bookValueBefore,
          },
        });
      }

      if (run.jevId) {
        await tx.journalEntryVoucher.update({
          where: { id: run.jevId },
          data: { status: 'voided' },
        });
      }

      const updated = await tx.depreciationRun.update({
        where: { id },
        data: {
          status: 'voided',
          voidedBy: userId,
          voidedAt: new Date(),
          version: { increment: 1 },
        },
      });

      this.logger.log(`Depreciation run ${run.runNumber} voided.`);
      return updated;
    });
  }

  /* ═══════════════════════ Asset Transfers ═══════════════════════ */

  async findAllTransfers(organizationId: string, status?: string) {
    return this.prisma.assetTransfer.findMany({
      where: {
        organizationId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        propertyRecord: {
          select: {
            id: true,
            propertyNumber: true,
            description: true,
            inventoryItem: { select: { description: true } },
          },
        },
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
        approver: { select: { id: true, username: true } },
      },
    });
  }

  async findTransferById(organizationId: string, id: string) {
    const transfer = await this.prisma.assetTransfer.findFirst({
      where: { id, organizationId },
      include: {
        propertyRecord: {
          select: {
            id: true,
            propertyNumber: true,
            description: true,
            acquisitionCost: true,
            bookValue: true,
            condition: true,
            inventoryItem: { select: { description: true } },
            assetCategory: { select: { id: true, code: true, name: true } },
          },
        },
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
        approver: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
      },
    });
    if (!transfer) throw new NotFoundException('Asset transfer not found.');
    return transfer;
  }

  async createTransfer(organizationId: string, userId: string, dto: CreateAssetTransferDto) {
    const pr = await this.prisma.propertyRecord.findFirst({
      where: { id: dto.propertyRecordId, organizationId, isDisposed: false },
    });
    if (!pr) throw new NotFoundException('Property record not found or already disposed.');

    const transferNumber = await this.generateTransferNumber(organizationId);

    return this.prisma.assetTransfer.create({
      data: {
        organizationId,
        transferNumber,
        propertyRecordId: dto.propertyRecordId,
        fromUserId: pr.accountableUserId,
        toUserId: dto.toUserId,
        fromLocationId: pr.locationId,
        ...(dto.toLocationId ? { toLocationId: dto.toLocationId } : {}),
        transferDate: new Date(),
        ...(dto.reason ? { reason: dto.reason } : {}),
        status: 'pending',
        createdBy: userId,
      },
      include: {
        propertyRecord: {
          select: { id: true, propertyNumber: true, description: true },
        },
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    });
  }

  async approveTransfer(organizationId: string, userId: string, id: string, version: number) {
    const transfer = await this.findTransferById(organizationId, id);
    if (transfer.status !== 'pending') {
      throw new BadRequestException('Only pending transfers can be approved.');
    }
    if (transfer.version !== version) {
      throw new ConflictException('Transfer has been modified. Refresh and try again.');
    }

    return this.prisma.assetTransfer.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }

  async rejectTransfer(organizationId: string, userId: string, id: string, version: number, reason?: string) {
    const transfer = await this.findTransferById(organizationId, id);
    if (transfer.status !== 'pending') {
      throw new BadRequestException('Only pending transfers can be rejected.');
    }
    if (transfer.version !== version) {
      throw new ConflictException('Transfer has been modified. Refresh and try again.');
    }

    return this.prisma.assetTransfer.update({
      where: { id },
      data: {
        status: 'rejected',
        approvedBy: userId,
        approvedAt: new Date(),
        ...(reason ? { reason } : {}),
        version: { increment: 1 },
      },
    });
  }

  async completeTransfer(organizationId: string, userId: string, id: string, version: number) {
    const transfer = await this.findTransferById(organizationId, id);
    if (transfer.status !== 'approved') {
      throw new BadRequestException('Only approved transfers can be completed.');
    }
    if (transfer.version !== version) {
      throw new ConflictException('Transfer has been modified. Refresh and try again.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.propertyRecord.update({
        where: { id: transfer.propertyRecordId },
        data: {
          accountableUserId: transfer.toUserId,
          ...(transfer.toLocationId ? { locationId: transfer.toLocationId } : {}),
        },
      });

      return tx.assetTransfer.update({
        where: { id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
    });
  }

  /* ═══════════════════════ Reports ═══════════════════════ */

  async getAssetRegister(organizationId: string, categoryId?: string, isDisposed?: string) {
    return this.prisma.propertyRecord.findMany({
      where: {
        organizationId,
        ...(categoryId ? { assetCategoryId: categoryId } : {}),
        ...(isDisposed === 'true' ? { isDisposed: true } : isDisposed === 'false' ? { isDisposed: false } : {}),
      },
      include: {
        inventoryItem: { select: { itemCode: true, description: true } },
        assetCategory: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, name: true } },
        accountableUser: { select: { id: true, username: true } },
      },
      orderBy: { propertyNumber: 'asc' },
    });
  }

  async getDashboard(organizationId: string) {
    const [totalAssets, disposedCount, categories, recentTransfers, recentRuns] = await Promise.all([
      this.prisma.propertyRecord.count({
        where: { organizationId, isDisposed: false },
      }),
      this.prisma.propertyRecord.count({
        where: { organizationId, isDisposed: true },
      }),
      this.prisma.assetCategory.findMany({
        where: { organizationId, isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          _count: { select: { propertyRecords: true } },
        },
      }),
      this.prisma.assetTransfer.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          propertyRecord: { select: { propertyNumber: true, description: true } },
          toUser: { select: { username: true } },
        },
      }),
      this.prisma.depreciationRun.findMany({
        where: { organizationId },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        take: 5,
        select: {
          id: true,
          runNumber: true,
          periodMonth: true,
          periodYear: true,
          status: true,
          totalDepreciation: true,
          assetCount: true,
        },
      }),
    ]);

    const aggregates = await this.prisma.propertyRecord.aggregate({
      where: { organizationId, isDisposed: false },
      _sum: { acquisitionCost: true, accumulatedDepreciation: true, bookValue: true },
    });

    const pendingTransfers = await this.prisma.assetTransfer.count({
      where: { organizationId, status: 'pending' },
    });

    return {
      totalAssets,
      disposedCount,
      pendingTransfers,
      totalAcquisitionCost: Number(aggregates._sum.acquisitionCost ?? 0),
      totalAccumulatedDepreciation: Number(aggregates._sum.accumulatedDepreciation ?? 0),
      totalBookValue: Number(aggregates._sum.bookValue ?? 0),
      categoryCounts: categories.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        count: c._count.propertyRecords,
      })),
      recentTransfers,
      recentRuns,
    };
  }

  async getDepreciationSchedule(organizationId: string, categoryId?: string) {
    const assets = await this.prisma.propertyRecord.findMany({
      where: {
        organizationId,
        isDisposed: false,
        monthlyDepreciation: { not: null, gt: 0 },
        ...(categoryId ? { assetCategoryId: categoryId } : {}),
      },
      include: {
        inventoryItem: { select: { description: true } },
        assetCategory: { select: { code: true, name: true } },
      },
      orderBy: { propertyNumber: 'asc' },
    });

    return assets.map((a) => ({
      id: a.id,
      propertyNumber: a.propertyNumber,
      description: a.description,
      itemName: a.inventoryItem.description,
      category: a.assetCategory ? `${a.assetCategory.code} - ${a.assetCategory.name}` : 'Uncategorized',
      acquisitionCost: Number(a.acquisitionCost),
      salvageValue: Number(a.salvageValue ?? 0),
      estimatedUsefulLife: a.estimatedUsefulLife,
      monthlyDepreciation: Number(a.monthlyDepreciation),
      accumulatedDepreciation: Number(a.accumulatedDepreciation),
      bookValue: Number(a.bookValue ?? (Number(a.acquisitionCost) - Number(a.accumulatedDepreciation))),
      remainingLife: a.estimatedUsefulLife && Number(a.monthlyDepreciation) > 0
        ? Math.max(
            0,
            Math.ceil(
              (Number(a.bookValue ?? (Number(a.acquisitionCost) - Number(a.accumulatedDepreciation))) -
                Number(a.salvageValue ?? 0)) /
                Number(a.monthlyDepreciation),
            ),
          )
        : null,
    }));
  }

  /* ═══════════════════════ Helpers ═══════════════════════ */

  private async generateRunNumber(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'depreciation_run'
      RETURNING next_number
    `);
    if (updated.length > 0) {
      return `DR-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }
    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'depreciation_run', 'DR-', 1)
      RETURNING next_number
    `);
    if (!inserted[0]) throw new Error('Failed to generate depreciation run number.');
    return `DR-${String(Number(inserted[0].next_number)).padStart(6, '0')}`;
  }

  private async generateTransferNumber(organizationId: string): Promise<string> {
    const updated = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      UPDATE document_sequences
      SET next_number = next_number + 1, last_generated_at = now()
      WHERE organization_id = ${organizationId}::uuid
        AND document_type = 'asset_transfer'
      RETURNING next_number
    `);
    if (updated.length > 0) {
      return `AT-${String(Number(updated[0]!.next_number)).padStart(6, '0')}`;
    }
    const inserted = await this.prisma.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO document_sequences (organization_id, document_type, prefix, next_number)
      VALUES (${organizationId}::uuid, 'asset_transfer', 'AT-', 1)
      RETURNING next_number
    `);
    if (!inserted[0]) throw new Error('Failed to generate asset transfer number.');
    return `AT-${String(Number(inserted[0].next_number)).padStart(6, '0')}`;
  }
}

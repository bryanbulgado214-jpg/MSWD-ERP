import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

/**
 * Collection Account Mapping — the configurable catalog of collection components
 * (water bill, penalty, fees, deposits) and the GL account each posts to. A type
 * with no GL account is "unmapped" and blocks a batch from posting until an
 * accounting user configures it.
 */
@Injectable()
export class CollectionTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string) {
    const types = await this.prisma.collectionType.findMany({
      where: { organizationId: orgId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const accountIds = types.map((t) => t.glAccountId).filter((x): x is string => !!x);
    const accounts = accountIds.length
      ? await this.prisma.chartOfAccount.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, accountCode: true, name: true },
        })
      : [];
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      nature: t.nature,
      glAccountId: t.glAccountId,
      glAccount: t.glAccountId ? (byId.get(t.glAccountId) ?? null) : null,
      isMapped: !!t.glAccountId,
      requiresConsumer: t.requiresConsumer,
      isSystem: t.isSystem,
      isActive: t.isActive,
      sortOrder: t.sortOrder,
    }));
  }

  /** Active types that cannot post yet because they have no GL account. */
  async unmapped(orgId: string) {
    const rows = await this.prisma.collectionType.findMany({
      where: { organizationId: orgId, isActive: true, glAccountId: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, nature: true },
    });
    return { count: rows.length, types: rows };
  }

  async update(
    orgId: string,
    userId: string,
    id: string,
    dto: {
      glAccountId?: string | null;
      name?: string;
      isActive?: boolean;
      requiresConsumer?: boolean;
    },
  ) {
    const type = await this.prisma.collectionType.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!type) throw new NotFoundException('Collection type not found.');

    if (dto.glAccountId) {
      const acct = await this.prisma.chartOfAccount.findFirst({
        where: { id: dto.glAccountId, organizationId: orgId, isActive: true },
        select: { id: true, isHeader: true },
      });
      if (!acct) throw new BadRequestException('GL account not found for this organization.');
      if (acct.isHeader) {
        throw new BadRequestException('Choose a postable (non-header) GL account.');
      }
    }

    return this.prisma.collectionType.update({
      where: { id },
      data: {
        ...(dto.glAccountId !== undefined ? { glAccountId: dto.glAccountId } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.requiresConsumer !== undefined ? { requiresConsumer: dto.requiresConsumer } : {}),
        updatedBy: userId,
      },
    });
  }
}

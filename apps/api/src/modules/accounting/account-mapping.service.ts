import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const MAPPING_SELECT = {
  id: true,
  mappingKey: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  chartOfAccount: {
    select: { id: true, accountCode: true, name: true, accountType: true },
  },
} as const;

@Injectable()
export class AccountMappingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.accountMapping.findMany({
      where: { organizationId },
      select: MAPPING_SELECT,
      orderBy: { mappingKey: 'asc' },
    });
  }

  async upsert(
    organizationId: string,
    userId: string,
    data: { mappingKey: string; chartOfAccountId: string },
  ) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id: data.chartOfAccountId, organizationId, isHeader: false },
    });
    if (!account) throw new NotFoundException('Chart of account not found or is a header account.');

    return runAudited(this.prisma, userId, (tx) =>
      tx.accountMapping.upsert({
        where: {
          organizationId_mappingKey: {
            organizationId,
            mappingKey: data.mappingKey,
          },
        },
        update: {
          chartOfAccountId: data.chartOfAccountId,
          updatedBy: userId,
        },
        create: {
          organizationId,
          mappingKey: data.mappingKey,
          chartOfAccountId: data.chartOfAccountId,
          createdBy: userId,
          updatedBy: userId,
        },
        select: MAPPING_SELECT,
      }),
    );
  }

  async remove(organizationId: string, userId: string, mappingKey: string) {
    const existing = await this.prisma.accountMapping.findUnique({
      where: { organizationId_mappingKey: { organizationId, mappingKey } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Mapping not found.');
    return runAudited(this.prisma, userId, (tx) =>
      tx.accountMapping.delete({
        where: { organizationId_mappingKey: { organizationId, mappingKey } },
      }),
    );
  }

  async resolve(organizationId: string, mappingKey: string) {
    const mapping = await this.prisma.accountMapping.findFirst({
      where: { organizationId, mappingKey, isActive: true },
      select: { chartOfAccount: { select: { id: true, accountCode: true, name: true } } },
    });
    return mapping?.chartOfAccount ?? null;
  }
}

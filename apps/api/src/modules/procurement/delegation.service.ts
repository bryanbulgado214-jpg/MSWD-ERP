import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const DELEGATION_SELECT = {
  id: true,
  organizationId: true,
  delegatorUserId: true,
  delegateUserId: true,
  permissionCode: true,
  effectiveDate: true,
  expirationDate: true,
  amountLimit: true,
  scopeDepartmentId: true,
  status: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  version: true,
  delegator: { select: { id: true, username: true } },
  delegate: { select: { id: true, username: true } },
  scopeDepartment: { select: { id: true, name: true } },
  creator: { select: { id: true, username: true } },
} as const;

@Injectable()
export class DelegationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters?: { delegatorUserId?: string; delegateUserId?: string; status?: string }) {
    const where: Record<string, unknown> = { organizationId };
    if (filters?.delegatorUserId) where.delegatorUserId = filters.delegatorUserId;
    if (filters?.delegateUserId) where.delegateUserId = filters.delegateUserId;
    if (filters?.status) where.status = filters.status;

    return this.prisma.delegationAuthority.findMany({
      where,
      select: DELEGATION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const delegation = await this.prisma.delegationAuthority.findFirst({
      where: { id, organizationId },
      select: DELEGATION_SELECT,
    });
    if (!delegation) throw new NotFoundException('Delegation not found.');
    return delegation;
  }

  async create(
    organizationId: string,
    userId: string,
    data: {
      delegateUserId: string;
      permissionCode: string;
      effectiveDate: string;
      expirationDate: string;
      amountLimit?: number;
      scopeDepartmentId?: string;
      remarks?: string;
    },
  ) {
    if (data.delegateUserId === userId) {
      throw new BadRequestException('Cannot delegate to yourself.');
    }

    const effective = new Date(data.effectiveDate);
    const expiration = new Date(data.expirationDate);
    if (expiration < effective) {
      throw new BadRequestException('Expiration date must be on or after effective date.');
    }

    const permission = await this.prisma.permission.findFirst({
      where: { code: data.permissionCode },
    });
    if (!permission) {
      throw new BadRequestException(`Permission code "${data.permissionCode}" does not exist.`);
    }

    const delegate = await this.prisma.user.findFirst({
      where: { id: data.delegateUserId, organizationId },
    });
    if (!delegate) {
      throw new BadRequestException('Delegate user not found in this organization.');
    }

    const existing = await this.prisma.delegationAuthority.findFirst({
      where: {
        organizationId,
        delegatorUserId: userId,
        delegateUserId: data.delegateUserId,
        permissionCode: data.permissionCode,
        status: 'active',
      },
    });
    if (existing) {
      throw new ConflictException('An active delegation for this permission to this user already exists.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.delegationAuthority.create({
        data: {
          organizationId,
          delegatorUserId: userId,
          delegateUserId: data.delegateUserId,
          permissionCode: data.permissionCode,
          effectiveDate: effective,
          expirationDate: expiration,
          ...(data.amountLimit !== undefined ? { amountLimit: data.amountLimit } : {}),
          ...(data.scopeDepartmentId ? { scopeDepartmentId: data.scopeDepartmentId } : {}),
          ...(data.remarks ? { remarks: data.remarks } : {}),
          createdBy: userId,
        },
        select: DELEGATION_SELECT,
      }),
    );
  }

  async revoke(
    organizationId: string,
    userId: string,
    id: string,
    data: { expectedVersion: number; remarks?: string },
  ) {
    const delegation = await this.prisma.delegationAuthority.findFirst({
      where: { id, organizationId },
    });
    if (!delegation) throw new NotFoundException('Delegation not found.');
    if (delegation.version !== data.expectedVersion) {
      throw new ConflictException('Record was modified. Please refresh and try again.');
    }
    if (delegation.status !== 'active') {
      throw new BadRequestException('Only active delegations can be revoked.');
    }

    return runAudited(this.prisma, userId, (tx) =>
      tx.delegationAuthority.update({
        where: { id },
        data: {
          status: 'revoked',
          ...(data.remarks ? { remarks: data.remarks } : {}),
          version: { increment: 1 },
        },
        select: DELEGATION_SELECT,
      }),
    );
  }

  async getActiveDelegatedPermissions(userId: string): Promise<Set<string>> {
    const today = new Date();
    const delegations = await this.prisma.delegationAuthority.findMany({
      where: {
        delegateUserId: userId,
        status: 'active',
        effectiveDate: { lte: today },
        expirationDate: { gte: today },
      },
      select: { permissionCode: true },
    });
    return new Set(delegations.map((d) => d.permissionCode));
  }
}

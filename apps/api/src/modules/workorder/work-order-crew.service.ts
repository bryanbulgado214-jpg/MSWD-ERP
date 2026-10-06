import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkOrderNature } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

const PERSONNEL_SELECT = {
  id: true,
  name: true,
  designation: true,
  section: true,
  contactNumber: true,
  isActive: true,
  version: true,
} as const;

const TEAM_SELECT = {
  id: true,
  name: true,
  section: true,
  leaderId: true,
  isActive: true,
  version: true,
  leader: { select: { id: true, name: true, designation: true } },
  members: {
    select: {
      personnel: { select: { id: true, name: true, designation: true, section: true } },
    },
  },
} as const;

interface PersonnelInput {
  name: string;
  designation?: string;
  section?: WorkOrderNature | null;
  contactNumber?: string;
  isActive?: boolean;
}

interface TeamInput {
  name: string;
  section?: WorkOrderNature | null;
  leaderId?: string | null;
  memberIds?: string[];
  isActive?: boolean;
}

@Injectable()
export class WorkOrderCrewService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Field personnel roster ──

  async listPersonnel(organizationId: string, opts?: { section?: string; includeInactive?: boolean }) {
    return this.prisma.workOrderPersonnel.findMany({
      where: {
        organizationId,
        ...(opts?.section ? { section: opts.section as WorkOrderNature } : {}),
        ...(opts?.includeInactive ? {} : { isActive: true }),
      },
      select: PERSONNEL_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async createPersonnel(organizationId: string, userId: string, input: PersonnelInput) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Name is required.');
    return runAudited(this.prisma, userId, (tx) =>
      tx.workOrderPersonnel.create({
        data: {
          organizationId,
          name,
          designation: input.designation?.trim() || null,
          section: input.section ?? null,
          contactNumber: input.contactNumber?.trim() || null,
          createdBy: userId,
          updatedBy: userId,
        },
        select: PERSONNEL_SELECT,
      }),
    );
  }

  async updatePersonnel(organizationId: string, id: string, userId: string, input: Partial<PersonnelInput>) {
    const existing = await this.prisma.workOrderPersonnel.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Personnel not found.');
    return runAudited(this.prisma, userId, (tx) =>
      tx.workOrderPersonnel.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.designation !== undefined ? { designation: input.designation.trim() || null } : {}),
          ...(input.section !== undefined ? { section: input.section } : {}),
          ...(input.contactNumber !== undefined ? { contactNumber: input.contactNumber.trim() || null } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: PERSONNEL_SELECT,
      }),
    );
  }

  // ── Reusable teams ──

  async listTeams(organizationId: string, opts?: { section?: string; includeInactive?: boolean }) {
    return this.prisma.workOrderTeam.findMany({
      where: {
        organizationId,
        ...(opts?.section ? { section: opts.section as WorkOrderNature } : {}),
        ...(opts?.includeInactive ? {} : { isActive: true }),
      },
      select: TEAM_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  private async assertPersonnelInOrg(organizationId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const found = await this.prisma.workOrderPersonnel.count({
      where: { organizationId, id: { in: unique } },
    });
    if (found !== unique.length) throw new BadRequestException('One or more personnel are invalid.');
  }

  async createTeam(organizationId: string, userId: string, input: TeamInput) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Team name is required.');
    const dup = await this.prisma.workOrderTeam.findFirst({ where: { organizationId, name }, select: { id: true } });
    if (dup) throw new ConflictException(`A team named "${name}" already exists.`);

    const memberIds = input.memberIds ?? [];
    await this.assertPersonnelInOrg(organizationId, [...(input.leaderId ? [input.leaderId] : []), ...memberIds]);

    return runAudited(this.prisma, userId, (tx) =>
      tx.workOrderTeam.create({
        data: {
          organizationId,
          name,
          section: input.section ?? null,
          leaderId: input.leaderId ?? null,
          createdBy: userId,
          updatedBy: userId,
          members: { create: memberIds.map((personnelId) => ({ personnelId })) },
        },
        select: TEAM_SELECT,
      }),
    );
  }

  async updateTeam(organizationId: string, id: string, userId: string, input: Partial<TeamInput>) {
    const existing = await this.prisma.workOrderTeam.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
    if (!existing) throw new NotFoundException('Team not found.');
    if (input.name !== undefined && input.name.trim() !== existing.name) {
      const dup = await this.prisma.workOrderTeam.findFirst({
        where: { organizationId, name: input.name.trim(), id: { not: id } },
        select: { id: true },
      });
      if (dup) throw new ConflictException(`A team named "${input.name.trim()}" already exists.`);
    }
    if (input.memberIds !== undefined || input.leaderId) {
      await this.assertPersonnelInOrg(organizationId, [
        ...(input.leaderId ? [input.leaderId] : []),
        ...(input.memberIds ?? []),
      ]);
    }

    return runAudited(this.prisma, userId, async (tx) => {
      if (input.memberIds !== undefined) {
        await tx.workOrderTeamMember.deleteMany({ where: { teamId: id } });
        if (input.memberIds.length) {
          await tx.workOrderTeamMember.createMany({
            data: input.memberIds.map((personnelId) => ({ teamId: id, personnelId })),
          });
        }
      }
      return tx.workOrderTeam.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.section !== undefined ? { section: input.section } : {}),
          ...(input.leaderId !== undefined ? { leaderId: input.leaderId } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: TEAM_SELECT,
      });
    });
  }
}

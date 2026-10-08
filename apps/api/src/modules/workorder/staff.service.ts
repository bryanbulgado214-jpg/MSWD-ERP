import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import type { CreateStaffDto, SetStaffStatusDto, UpdateStaffDto } from './dto/staff.dto';

const STAFF_SELECT = {
  id: true,
  name: true,
  designation: true,
  department: true,
  contactNumber: true,
  status: true,
  statusNote: true,
  isFieldPersonnel: true,
  workOrderPersonnelId: true,
  isActive: true,
  version: true,
  workOrderPersonnel: { select: { id: true, name: true } },
} as const;

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string) {
    return this.prisma.staffMember.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: STAFF_SELECT,
    });
  }

  // Field personnel not yet linked to a staff record (for the link dropdown).
  async linkOptions(orgId: string) {
    const [personnel, linked] = await Promise.all([
      this.prisma.workOrderPersonnel.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, designation: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.staffMember.findMany({
        where: { organizationId: orgId, workOrderPersonnelId: { not: null } },
        select: { workOrderPersonnelId: true },
      }),
    ]);
    const used = new Set(linked.map((l) => l.workOrderPersonnelId));
    return personnel.filter((p) => !used.has(p.id));
  }

  private async assertPersonnelFree(orgId: string, personnelId: string, exceptStaffId?: string) {
    const p = await this.prisma.workOrderPersonnel.findFirst({
      where: { id: personnelId, organizationId: orgId },
      select: { id: true },
    });
    if (!p) throw new BadRequestException('Select a valid field personnel to link.');
    const clash = await this.prisma.staffMember.findFirst({
      where: {
        organizationId: orgId,
        workOrderPersonnelId: personnelId,
        ...(exceptStaffId ? { id: { not: exceptStaffId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('That field personnel is already linked to another staff record.');
    }
  }

  async create(orgId: string, userId: string, dto: CreateStaffDto) {
    if (dto.workOrderPersonnelId) await this.assertPersonnelFree(orgId, dto.workOrderPersonnelId);
    return runAudited(this.prisma, userId, (tx) =>
      tx.staffMember.create({
        data: {
          organizationId: orgId,
          name: dto.name.trim(),
          ...(dto.designation ? { designation: dto.designation.trim() } : {}),
          ...(dto.department ? { department: dto.department.trim() } : {}),
          ...(dto.contactNumber ? { contactNumber: dto.contactNumber.trim() } : {}),
          isFieldPersonnel: dto.isFieldPersonnel ?? !!dto.workOrderPersonnelId,
          ...(dto.workOrderPersonnelId ? { workOrderPersonnelId: dto.workOrderPersonnelId } : {}),
          createdBy: userId,
          updatedBy: userId,
        },
        select: STAFF_SELECT,
      }),
    );
  }

  async update(orgId: string, userId: string, id: string, dto: UpdateStaffDto) {
    const existing = await this.prisma.staffMember.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Staff member not found.');
    let link: { workOrderPersonnelId?: string | null } = {};
    if (dto.workOrderPersonnelId !== undefined) {
      const v = dto.workOrderPersonnelId.trim();
      if (v) {
        await this.assertPersonnelFree(orgId, v, id);
        link = { workOrderPersonnelId: v };
      } else {
        link = { workOrderPersonnelId: null };
      }
    }
    return runAudited(this.prisma, userId, (tx) =>
      tx.staffMember.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.designation !== undefined ? { designation: dto.designation.trim() || null } : {}),
          ...(dto.department !== undefined ? { department: dto.department.trim() || null } : {}),
          ...(dto.contactNumber !== undefined
            ? { contactNumber: dto.contactNumber.trim() || null }
            : {}),
          ...(dto.isFieldPersonnel !== undefined ? { isFieldPersonnel: dto.isFieldPersonnel } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...link,
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: STAFF_SELECT,
      }),
    );
  }

  async setStatus(orgId: string, userId: string, id: string, dto: SetStaffStatusDto) {
    const existing = await this.prisma.staffMember.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Staff member not found.');
    return runAudited(this.prisma, userId, (tx) =>
      tx.staffMember.update({
        where: { id },
        data: {
          status: dto.status,
          statusNote: dto.statusNote?.trim() || null,
          updatedBy: userId,
          version: { increment: 1 },
        },
        select: STAFF_SELECT,
      }),
    );
  }

  async remove(orgId: string, userId: string, id: string) {
    const existing = await this.prisma.staffMember.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Staff member not found.');
    // Soft-delete (deactivate) to preserve history and any crew link.
    return runAudited(this.prisma, userId, (tx) =>
      tx.staffMember.update({
        where: { id },
        data: { isActive: false, updatedBy: userId },
        select: STAFF_SELECT,
      }),
    );
  }
}

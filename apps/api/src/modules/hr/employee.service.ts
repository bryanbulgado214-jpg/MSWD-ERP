import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    orgId: string,
    filters?: {
      status?: string;
      departmentId?: string;
      employmentType?: string;
      search?: string;
    },
  ) {
    return this.prisma.employee.findMany({
      where: {
        organizationId: orgId,
        ...(filters?.status ? { employmentStatus: filters.status as any } : {}),
        ...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters?.employmentType ? { employmentType: filters.employmentType as any } : {}),
        ...(filters?.search
          ? {
              OR: [
                { employeeNumber: { contains: filters.search, mode: 'insensitive' as const } },
                { firstName: { contains: filters.search, mode: 'insensitive' as const } },
                { lastName: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
        position: { select: { id: true, code: true, title: true } },
        user: { select: { id: true, username: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(orgId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId: orgId },
      include: {
        department: { select: { id: true, code: true, name: true } },
        position: { select: { id: true, code: true, title: true } },
        user: { select: { id: true, username: true } },
        creator: { select: { id: true, username: true } },
        updater: { select: { id: true, username: true } },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async create(orgId: string, dto: CreateEmployeeDto, actorId: string) {
    const existing = await this.prisma.employee.findUnique({
      where: {
        organizationId_employeeNumber: {
          organizationId: orgId,
          employeeNumber: dto.employeeNumber,
        },
      },
    });
    if (existing)
      throw new ConflictException(`Employee number ${dto.employeeNumber} already exists`);

    return runAudited(this.prisma, actorId, (tx) =>
      tx.employee.create({
        data: {
          organizationId: orgId,
          employeeNumber: dto.employeeNumber,
          firstName: dto.firstName,
          lastName: dto.lastName,
          ...(dto.middleName ? { middleName: dto.middleName } : {}),
          ...(dto.suffix ? { suffix: dto.suffix } : {}),
          ...(dto.dateOfBirth ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
          ...(dto.gender ? { gender: dto.gender } : {}),
          ...(dto.civilStatus ? { civilStatus: dto.civilStatus } : {}),
          ...(dto.address ? { address: dto.address } : {}),
          ...(dto.contactNumber ? { contactNumber: dto.contactNumber } : {}),
          ...(dto.email ? { email: dto.email } : {}),
          ...(dto.tin ? { tin: dto.tin } : {}),
          ...(dto.sssGsisNumber ? { sssGsisNumber: dto.sssGsisNumber } : {}),
          ...(dto.philhealthNumber ? { philhealthNumber: dto.philhealthNumber } : {}),
          ...(dto.pagibigNumber ? { pagibigNumber: dto.pagibigNumber } : {}),
          ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
          ...(dto.positionId ? { positionId: dto.positionId } : {}),
          ...(dto.userId ? { userId: dto.userId } : {}),
          ...(dto.employmentType ? { employmentType: dto.employmentType as any } : {}),
          ...(dto.employmentStatus ? { employmentStatus: dto.employmentStatus as any } : {}),
          ...(dto.dateHired ? { dateHired: new Date(dto.dateHired) } : {}),
          ...(dto.dateRegularized ? { dateRegularized: new Date(dto.dateRegularized) } : {}),
          ...(dto.basicSalary !== undefined ? { basicSalary: dto.basicSalary } : {}),
          ...(dto.salaryGrade !== undefined ? { salaryGrade: dto.salaryGrade } : {}),
          ...(dto.salaryStep !== undefined ? { salaryStep: dto.salaryStep } : {}),
          createdBy: actorId,
          updatedBy: actorId,
        },
        include: {
          department: { select: { id: true, code: true, name: true } },
          position: { select: { id: true, code: true, title: true } },
        },
      }),
    );
  }

  async update(orgId: string, id: string, dto: UpdateEmployeeDto, actorId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.version !== dto.expectedVersion) {
      throw new ConflictException(
        'Record was modified by another user. Please refresh and try again.',
      );
    }

    return runAudited(this.prisma, actorId, (tx) =>
      tx.employee.update({
        where: { id },
        data: {
          ...(dto.firstName ? { firstName: dto.firstName } : {}),
          ...(dto.lastName ? { lastName: dto.lastName } : {}),
          ...(dto.middleName !== undefined ? { middleName: dto.middleName || null } : {}),
          ...(dto.suffix !== undefined ? { suffix: dto.suffix || null } : {}),
          ...(dto.dateOfBirth ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
          ...(dto.gender !== undefined ? { gender: dto.gender || null } : {}),
          ...(dto.civilStatus !== undefined ? { civilStatus: dto.civilStatus || null } : {}),
          ...(dto.address !== undefined ? { address: dto.address || null } : {}),
          ...(dto.contactNumber !== undefined ? { contactNumber: dto.contactNumber || null } : {}),
          ...(dto.email !== undefined ? { email: dto.email || null } : {}),
          ...(dto.tin !== undefined ? { tin: dto.tin || null } : {}),
          ...(dto.sssGsisNumber !== undefined ? { sssGsisNumber: dto.sssGsisNumber || null } : {}),
          ...(dto.philhealthNumber !== undefined
            ? { philhealthNumber: dto.philhealthNumber || null }
            : {}),
          ...(dto.pagibigNumber !== undefined ? { pagibigNumber: dto.pagibigNumber || null } : {}),
          ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId || null } : {}),
          ...(dto.positionId !== undefined ? { positionId: dto.positionId || null } : {}),
          ...(dto.userId !== undefined ? { userId: dto.userId || null } : {}),
          ...(dto.employmentType ? { employmentType: dto.employmentType as any } : {}),
          ...(dto.employmentStatus ? { employmentStatus: dto.employmentStatus as any } : {}),
          ...(dto.dateHired ? { dateHired: new Date(dto.dateHired) } : {}),
          ...(dto.dateRegularized ? { dateRegularized: new Date(dto.dateRegularized) } : {}),
          ...(dto.dateSeparated ? { dateSeparated: new Date(dto.dateSeparated) } : {}),
          ...(dto.separationReason !== undefined
            ? { separationReason: dto.separationReason || null }
            : {}),
          ...(dto.basicSalary !== undefined ? { basicSalary: dto.basicSalary } : {}),
          ...(dto.salaryGrade !== undefined ? { salaryGrade: dto.salaryGrade } : {}),
          ...(dto.salaryStep !== undefined ? { salaryStep: dto.salaryStep } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedBy: actorId,
          version: { increment: 1 },
        },
        include: {
          department: { select: { id: true, code: true, name: true } },
          position: { select: { id: true, code: true, title: true } },
        },
      }),
    );
  }
}

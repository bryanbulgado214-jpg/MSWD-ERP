import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type {
  CreateAllowanceTypeDto, UpdateAllowanceTypeDto,
  CreateDeductionTypeDto, UpdateDeductionTypeDto,
  CreateEmployeeAllowanceDto, UpdateEmployeeAllowanceDto,
  CreateEmployeeDeductionDto, UpdateEmployeeDeductionDto,
} from './dto/compensation.dto';

@Injectable()
export class CompensationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Allowance Types ──

  async findAllowanceTypes(orgId: string) {
    return this.prisma.allowanceType.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { employeeAllowances: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createAllowanceType(orgId: string, dto: CreateAllowanceTypeDto) {
    const existing = await this.prisma.allowanceType.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Allowance type code ${dto.code} already exists`);

    return this.prisma.allowanceType.create({
      data: {
        organizationId: orgId,
        code: dto.code,
        name: dto.name,
        ...(dto.isTaxable !== undefined ? { isTaxable: dto.isTaxable } : {}),
        ...(dto.isFixed !== undefined ? { isFixed: dto.isFixed } : {}),
        ...(dto.defaultAmount !== undefined ? { defaultAmount: dto.defaultAmount } : {}),
      },
    });
  }

  async updateAllowanceType(orgId: string, id: string, dto: UpdateAllowanceTypeDto) {
    const type = await this.prisma.allowanceType.findFirst({ where: { id, organizationId: orgId } });
    if (!type) throw new NotFoundException('Allowance type not found');

    return this.prisma.allowanceType.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.isTaxable !== undefined ? { isTaxable: dto.isTaxable } : {}),
        ...(dto.isFixed !== undefined ? { isFixed: dto.isFixed } : {}),
        ...(dto.defaultAmount !== undefined ? { defaultAmount: dto.defaultAmount } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // ── Deduction Types ──

  async findDeductionTypes(orgId: string) {
    return this.prisma.deductionType.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { employeeDeductions: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createDeductionType(orgId: string, dto: CreateDeductionTypeDto) {
    const existing = await this.prisma.deductionType.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Deduction type code ${dto.code} already exists`);

    return this.prisma.deductionType.create({
      data: {
        organizationId: orgId,
        code: dto.code,
        name: dto.name,
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.isPercentage !== undefined ? { isPercentage: dto.isPercentage } : {}),
        ...(dto.employerShare !== undefined ? { employerShare: dto.employerShare } : {}),
        ...(dto.employeeShare !== undefined ? { employeeShare: dto.employeeShare } : {}),
      },
    });
  }

  async updateDeductionType(orgId: string, id: string, dto: UpdateDeductionTypeDto) {
    const type = await this.prisma.deductionType.findFirst({ where: { id, organizationId: orgId } });
    if (!type) throw new NotFoundException('Deduction type not found');

    return this.prisma.deductionType.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.isPercentage !== undefined ? { isPercentage: dto.isPercentage } : {}),
        ...(dto.employerShare !== undefined ? { employerShare: dto.employerShare } : {}),
        ...(dto.employeeShare !== undefined ? { employeeShare: dto.employeeShare } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // ── Employee Allowances ──

  async findEmployeeAllowances(orgId: string, employeeId: string) {
    return this.prisma.employeeAllowance.findMany({
      where: { organizationId: orgId, employeeId },
      include: { allowanceType: { select: { id: true, code: true, name: true, isTaxable: true } } },
      orderBy: { allowanceType: { code: 'asc' } },
    });
  }

  async createEmployeeAllowance(orgId: string, dto: CreateEmployeeAllowanceDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: orgId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.employeeAllowance.create({
      data: {
        organizationId: orgId,
        employeeId: dto.employeeId,
        allowanceTypeId: dto.allowanceTypeId,
        amount: dto.amount,
        effectiveDate: new Date(dto.effectiveDate),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
      },
      include: { allowanceType: { select: { id: true, code: true, name: true, isTaxable: true } } },
    });
  }

  async updateEmployeeAllowance(orgId: string, id: string, dto: UpdateEmployeeAllowanceDto) {
    const allowance = await this.prisma.employeeAllowance.findFirst({ where: { id, organizationId: orgId } });
    if (!allowance) throw new NotFoundException('Employee allowance not found');

    return this.prisma.employeeAllowance.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { allowanceType: { select: { id: true, code: true, name: true, isTaxable: true } } },
    });
  }

  // ── Employee Deductions ──

  async findEmployeeDeductions(orgId: string, employeeId: string) {
    return this.prisma.employeeDeduction.findMany({
      where: { organizationId: orgId, employeeId },
      include: { deductionType: { select: { id: true, code: true, name: true, category: true, isPercentage: true } } },
      orderBy: { deductionType: { code: 'asc' } },
    });
  }

  async createEmployeeDeduction(orgId: string, dto: CreateEmployeeDeductionDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: orgId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.employeeDeduction.create({
      data: {
        organizationId: orgId,
        employeeId: dto.employeeId,
        deductionTypeId: dto.deductionTypeId,
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.remainingBalance !== undefined ? { remainingBalance: dto.remainingBalance } : {}),
        ...(dto.remarks ? { remarks: dto.remarks } : {}),
      },
      include: { deductionType: { select: { id: true, code: true, name: true, category: true, isPercentage: true } } },
    });
  }

  async updateEmployeeDeduction(orgId: string, id: string, dto: UpdateEmployeeDeductionDto) {
    const deduction = await this.prisma.employeeDeduction.findFirst({ where: { id, organizationId: orgId } });
    if (!deduction) throw new NotFoundException('Employee deduction not found');

    return this.prisma.employeeDeduction.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.remainingBalance !== undefined ? { remainingBalance: dto.remainingBalance } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks || null } : {}),
      },
      include: { deductionType: { select: { id: true, code: true, name: true, category: true, isPercentage: true } } },
    });
  }
}

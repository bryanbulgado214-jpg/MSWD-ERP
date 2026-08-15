import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

import { CreatePositionDto, UpdatePositionDto } from './dto/employee.dto';

@Injectable()
export class PositionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.position.findMany({
      where: { organizationId: orgId },
      orderBy: { code: 'asc' },
      include: { _count: { select: { employees: true } } },
    });
  }

  async findOne(orgId: string, id: string) {
    const position = await this.prisma.position.findFirst({
      where: { id, organizationId: orgId },
      include: { _count: { select: { employees: true } } },
    });
    if (!position) throw new NotFoundException('Position not found');
    return position;
  }

  async create(orgId: string, dto: CreatePositionDto) {
    const existing = await this.prisma.position.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: dto.code } },
    });
    if (existing) throw new ConflictException(`Position code ${dto.code} already exists`);

    return this.prisma.position.create({
      data: {
        organizationId: orgId,
        code: dto.code,
        title: dto.title,
        ...(dto.salaryGrade !== undefined ? { salaryGrade: dto.salaryGrade } : {}),
        ...(dto.salaryStep !== undefined ? { salaryStep: dto.salaryStep } : {}),
      },
    });
  }

  async update(orgId: string, id: string, dto: UpdatePositionDto) {
    const position = await this.prisma.position.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!position) throw new NotFoundException('Position not found');

    return this.prisma.position.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.salaryGrade !== undefined ? { salaryGrade: dto.salaryGrade } : {}),
        ...(dto.salaryStep !== undefined ? { salaryStep: dto.salaryStep } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }
}

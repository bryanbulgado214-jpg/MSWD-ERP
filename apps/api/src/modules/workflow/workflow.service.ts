import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowActionDecision } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefinition(
    organizationId: string,
    name: string,
    appliesToTable: string,
    steps: { name: string; approverRoleCode: string; isFinalStep?: boolean }[],
  ) {
    const existing = await this.prisma.workflowDefinition.findFirst({
      where: { organizationId, name, appliesToTable, isActive: true },
    });
    if (existing) return existing;

    const roles = await this.prisma.role.findMany({
      where: {
        organizationId,
        code: { in: steps.map((s) => s.approverRoleCode) },
      },
    });
    const roleMap = new Map(roles.map((r) => [r.code, r.id]));

    return this.prisma.workflowDefinition.create({
      data: {
        organizationId,
        name,
        appliesToTable,
        steps: {
          create: steps.map((s, idx) => {
            const roleId = roleMap.get(s.approverRoleCode);
            if (!roleId) throw new Error(`Role ${s.approverRoleCode} not found for workflow step "${s.name}".`);
            return {
              stepOrder: idx + 1,
              name: s.name,
              approverRoleId: roleId,
              isFinalStep: s.isFinalStep ?? false,
            };
          }),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }

  async startInstance(
    organizationId: string,
    workflowDefinitionId: string,
    subjectTable: string,
    subjectId: string,
  ) {
    const existing = await this.prisma.workflowInstance.findFirst({
      where: { organizationId, subjectTable, subjectId, status: 'in_progress' },
    });
    if (existing) return existing;

    return this.prisma.workflowInstance.create({
      data: {
        organizationId,
        workflowDefinitionId,
        subjectTable,
        subjectId,
        status: 'in_progress',
      },
    });
  }

  async recordAction(
    organizationId: string,
    subjectTable: string,
    subjectId: string,
    stepOrder: number,
    actorUserId: string,
    decision: WorkflowActionDecision,
    remarks?: string,
  ) {
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { organizationId, subjectTable, subjectId, status: 'in_progress' },
      include: {
        workflowDefinition: {
          include: { steps: { orderBy: { stepOrder: 'asc' } } },
        },
      },
    });
    if (!instance) {
      throw new NotFoundException('No active workflow instance found for this document.');
    }

    const step = instance.workflowDefinition.steps.find((s) => s.stepOrder === stepOrder);
    if (!step) {
      throw new BadRequestException(`Workflow step ${stepOrder} not found.`);
    }

    return runAudited(this.prisma, actorUserId, async (tx) => {
      const action = await tx.workflowAction.create({
        data: {
          workflowInstanceId: instance.id,
          workflowStepId: step.id,
          actorUserId,
          decision,
          ...(remarks ? { remarks } : {}),
        },
      });

      if (decision === 'rejected' || decision === 'cancelled') {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { status: decision === 'rejected' ? 'rejected' : 'cancelled' },
        });
      } else if (decision === 'approved' && step.isFinalStep) {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { status: 'approved' },
        });
      }

      return action;
    });
  }

  async getInstanceWithActions(
    organizationId: string,
    subjectTable: string,
    subjectId: string,
  ) {
    return this.prisma.workflowInstance.findFirst({
      where: { organizationId, subjectTable, subjectId },
      orderBy: { createdAt: 'desc' },
      include: {
        workflowDefinition: {
          include: { steps: { orderBy: { stepOrder: 'asc' } } },
        },
        actions: {
          orderBy: { actedAt: 'asc' },
          include: {
            actor: { select: { id: true, username: true } },
            workflowStep: { select: { id: true, stepOrder: true, name: true } },
          },
        },
      },
    });
  }

  async cancelInstance(
    organizationId: string,
    subjectTable: string,
    subjectId: string,
  ) {
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { organizationId, subjectTable, subjectId, status: 'in_progress' },
    });
    if (!instance) return;

    await this.prisma.workflowInstance.update({
      where: { id: instance.id },
      data: { status: 'cancelled' },
    });
  }
}

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

export interface OrganizationProfile {
  id: string;
  name: string;
  legalName: string;
  address: string | null;
  contact: string | null;
  logoUrl: string | null;
}

const norm = (s?: string): string | null => (s && s.trim() ? s.trim() : null);

@Injectable()
export class OrganizationProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string): Promise<OrganizationProfile> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        settings: { select: { legalName: true, address: true, contact: true, logoUrl: true } },
      },
    });
    return {
      id: org.id,
      name: org.name,
      legalName: org.settings?.legalName ?? org.name,
      address: org.settings?.address ?? null,
      contact: org.settings?.contact ?? null,
      logoUrl: org.settings?.logoUrl ?? null,
    };
  }

  async update(
    organizationId: string,
    userId: string,
    data: {
      name?: string;
      legalName?: string;
      address?: string;
      contact?: string;
      logoUrl?: string;
    },
  ): Promise<OrganizationProfile> {
    await runAudited(this.prisma, userId, async (tx) => {
      if (data.name && data.name.trim()) {
        await tx.organization.update({
          where: { id: organizationId },
          data: { name: data.name.trim() },
        });
      }
      const existing = await tx.organizationSettings.findUnique({ where: { organizationId } });
      // Partial update: only touch fields actually present in the payload
      // (an omitted field is left unchanged; an empty string clears it).
      const patch: Record<string, string | null> = { updatedBy: userId };
      if (data.legalName !== undefined && data.legalName.trim())
        patch.legalName = data.legalName.trim();
      if (data.address !== undefined) patch.address = norm(data.address);
      if (data.contact !== undefined) patch.contact = norm(data.contact);
      if (data.logoUrl !== undefined) patch.logoUrl = norm(data.logoUrl);

      if (existing) {
        await tx.organizationSettings.update({ where: { organizationId }, data: patch });
      } else {
        const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
        await tx.organizationSettings.create({
          data: {
            organizationId,
            legalName: (patch.legalName as string) ?? org.name,
            address: (patch.address as string | null) ?? null,
            contact: (patch.contact as string | null) ?? null,
            logoUrl: (patch.logoUrl as string | null) ?? null,
            updatedBy: userId,
          },
        });
      }
    });
    return this.get(organizationId);
  }
}

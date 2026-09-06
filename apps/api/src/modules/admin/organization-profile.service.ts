import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { runAudited } from '../budgeting/audit-actor.util';

export interface Signatory {
  name: string;
  title: string;
}
/** Keyed by document (e.g. "jev") then slot (e.g. "preparedBy"). */
export type SignatoryMap = Record<string, Record<string, Signatory>>;

export interface OrganizationProfile {
  id: string;
  name: string;
  legalName: string;
  address: string | null;
  contact: string | null;
  logoUrl: string | null;
  manualDocumentNumbering: boolean;
  signatories: SignatoryMap;
  // Payor identity for BIR forms (Form 2307): the district's TIN + ZIP and the
  // authorized representative who signs (name / designation / TIN).
  tin: string | null;
  zipCode: string | null;
  birRepName: string | null;
  birRepDesignation: string | null;
  birRepTin: string | null;
}

const norm = (s?: string): string | null => (s && s.trim() ? s.trim() : null);

/**
 * Keep only a clean {doc: {slot: {name, title}}} shape from admin-supplied JSON:
 * coerce name/title to trimmed strings (capped), drop slots that are entirely
 * empty and docs left with no slots. Guards the DB against malformed payloads.
 */
function sanitizeSignatories(input: unknown): SignatoryMap {
  const out: SignatoryMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [docKey, slots] of Object.entries(input as Record<string, unknown>)) {
    if (!slots || typeof slots !== 'object') continue;
    const cleanSlots: Record<string, Signatory> = {};
    for (const [slotKey, val] of Object.entries(slots as Record<string, unknown>)) {
      const v = (val ?? {}) as Record<string, unknown>;
      const name = typeof v.name === 'string' ? v.name.trim().slice(0, 120) : '';
      const title = typeof v.title === 'string' ? v.title.trim().slice(0, 120) : '';
      if (name || title) cleanSlots[slotKey.slice(0, 60)] = { name, title };
    }
    if (Object.keys(cleanSlots).length) out[docKey.slice(0, 60)] = cleanSlots;
  }
  return out;
}

@Injectable()
export class OrganizationProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string): Promise<OrganizationProfile> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        settings: {
          select: {
            legalName: true,
            address: true,
            contact: true,
            logoUrl: true,
            manualDocumentNumbering: true,
            signatories: true,
            tin: true,
            zipCode: true,
            birRepName: true,
            birRepDesignation: true,
            birRepTin: true,
          },
        },
      },
    });
    return {
      id: org.id,
      name: org.name,
      legalName: org.settings?.legalName ?? org.name,
      address: org.settings?.address ?? null,
      contact: org.settings?.contact ?? null,
      logoUrl: org.settings?.logoUrl ?? null,
      manualDocumentNumbering: org.settings?.manualDocumentNumbering ?? false,
      signatories: sanitizeSignatories(org.settings?.signatories),
      tin: org.settings?.tin ?? null,
      zipCode: org.settings?.zipCode ?? null,
      birRepName: org.settings?.birRepName ?? null,
      birRepDesignation: org.settings?.birRepDesignation ?? null,
      birRepTin: org.settings?.birRepTin ?? null,
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
      manualDocumentNumbering?: boolean;
      signatories?: SignatoryMap;
      tin?: string;
      zipCode?: string;
      birRepName?: string;
      birRepDesignation?: string;
      birRepTin?: string;
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
      const patch: Record<string, unknown> = { updatedBy: userId };
      if (data.legalName !== undefined && data.legalName.trim())
        patch.legalName = data.legalName.trim();
      if (data.address !== undefined) patch.address = norm(data.address);
      if (data.contact !== undefined) patch.contact = norm(data.contact);
      if (data.logoUrl !== undefined) patch.logoUrl = norm(data.logoUrl);
      if (data.manualDocumentNumbering !== undefined)
        patch.manualDocumentNumbering = data.manualDocumentNumbering;
      if (data.signatories !== undefined) patch.signatories = sanitizeSignatories(data.signatories);
      if (data.tin !== undefined) patch.tin = norm(data.tin);
      if (data.zipCode !== undefined) patch.zipCode = norm(data.zipCode);
      if (data.birRepName !== undefined) patch.birRepName = norm(data.birRepName);
      if (data.birRepDesignation !== undefined)
        patch.birRepDesignation = norm(data.birRepDesignation);
      if (data.birRepTin !== undefined) patch.birRepTin = norm(data.birRepTin);

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
            manualDocumentNumbering:
              (patch.manualDocumentNumbering as boolean | undefined) ?? false,
            signatories: (patch.signatories as Prisma.InputJsonValue | undefined) ?? {},
            tin: (patch.tin as string | null) ?? null,
            zipCode: (patch.zipCode as string | null) ?? null,
            birRepName: (patch.birRepName as string | null) ?? null,
            birRepDesignation: (patch.birRepDesignation as string | null) ?? null,
            birRepTin: (patch.birRepTin as string | null) ?? null,
            updatedBy: userId,
          },
        });
      }
    });
    return this.get(organizationId);
  }
}

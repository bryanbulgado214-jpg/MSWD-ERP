import type { Prisma } from '@prisma/client';

export interface CreateReleaseInput {
  budgetHeaderId: string;
  releaseNumber: string;
  releaseDate: Date;
  releasedAmount: Prisma.Decimal | number | string;
  createdBy?: string;
}

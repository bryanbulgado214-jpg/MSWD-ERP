import type { Prisma } from '@prisma/client';

export interface CreateReservationDraftInput {
  budgetReleaseId: string;
  /** Must be > 0 — validated in the service. */
  reservationAmount: Prisma.Decimal | number | string;
  /** Polymorphic reference to whatever future document this reservation backs (e.g. a Purchase Order) — optional, may be set later via editDraft. */
  subjectTable?: string;
  subjectId?: string;
  createdBy?: string;
}

export interface EditReservationDraftInput {
  reservationAmount?: Prisma.Decimal | number | string;
  subjectTable?: string | null;
  subjectId?: string | null;
  updatedBy?: string;
}

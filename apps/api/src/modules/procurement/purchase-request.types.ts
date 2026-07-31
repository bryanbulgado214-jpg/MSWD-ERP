export interface CreatePurchaseRequestInput {
  title: string;
  description?: string;
  purpose?: string;
  budgetReleaseId?: string;
  fiscalYearId?: string;
  departmentId?: string;
  departmentHeadId?: string;
  procurementCategoryId?: string;
  requestedDeliveryDate?: string;
  deliveryLocationId?: string;
  ppmpItemId?: string;
  appItemId?: string;
  budgetLineId?: string;
  responsibilityCenterId?: string;
  fundSourceId?: string;
  items: CreatePurchaseRequestItemInput[];
  createdBy?: string;
}

export interface CreatePurchaseRequestItemInput {
  description: string;
  quantity: number;
  unitOfMeasure: string;
  estimatedUnitCost: number;
  accountCode?: string;
  technicalSpecification?: string;
  classification?: 'inventory' | 'asset' | 'expense' | 'infrastructure' | 'service';
}

export interface UpdatePurchaseRequestInput {
  title?: string;
  description?: string | null;
  purpose?: string | null;
  budgetReleaseId?: string | null;
  fiscalYearId?: string | null;
  departmentId?: string | null;
  departmentHeadId?: string | null;
  procurementCategoryId?: string | null;
  requestedDeliveryDate?: string | null;
  deliveryLocationId?: string | null;
  ppmpItemId?: string | null;
  appItemId?: string | null;
  budgetLineId?: string | null;
  responsibilityCenterId?: string | null;
  fundSourceId?: string | null;
  items?: CreatePurchaseRequestItemInput[];
  updatedBy?: string;
}

export const PR_SUBJECT_TABLE = 'procurement.purchase_requests';

import type { PurchaseRequest, PurchaseRequestItem } from '@prisma/client';

export type PurchaseRequestWithItems = PurchaseRequest & { items: PurchaseRequestItem[] };

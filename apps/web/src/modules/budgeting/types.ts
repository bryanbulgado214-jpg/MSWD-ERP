/**
 * Mirrors apps/api's BudgetAmountSummary (see
 * apps/api/src/modules/budgeting/budget-calculation.types.ts). The API
 * serializes Prisma.Decimal fields as JSON strings (e.g. "800000.00"),
 * not numbers — that's why every amount here is typed as a string, not
 * a number. Never parse these into a JS `number` for display or
 * arithmetic; format the string directly (see formatCurrency in
 * budget-dashboard.utils.ts) — floating point can't represent money
 * exactly, which is the same reason the backend never uses it either.
 */
export interface BudgetAmountSummary {
  approvedAmount: string;
  releasedAmount: string;
  reservedAmount: string;
  obligatedAmount: string;
  utilizedAmount: string;
  availableAmount: string;
  isConsistent: boolean;
}

export type BudgetHeaderStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

/** One row in the Budget List page — mirrors apps/api's
 * BudgetHeaderListItem (BudgetHeaderService.findAllPaginated). */
export interface BudgetHeaderListItem {
  id: string;
  budgetVersionId: string;
  totalAmount: string;
  currencyCode: string;
  status: BudgetHeaderStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  responsibilityCenter: { name: string; code: string };
  fundSource: { name: string; code: string };
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BudgetLineItem {
  id: string;
  accountCode: string;
  description: string | null;
  amount: string;
}

/** Mirrors the existing `POST /budgeting/budget-lines` request body
 * (CreateBudgetLineDto) exactly — no backend change. */
export interface CreateBudgetLineInput {
  budgetHeaderId: string;
  accountCode: string;
  description?: string;
  amount: number;
}

/** Mirrors the existing `PATCH /budgeting/budget-lines/:id` request
 * body (UpdateBudgetLineDto) exactly — no backend change. */
export interface UpdateBudgetLineInput {
  accountCode?: string;
  description?: string;
  amount?: number;
}

export type BudgetReleaseStatus = 'draft' | 'released' | 'cancelled';

export interface BudgetReleaseItem {
  id: string;
  releaseNumber: string;
  releaseDate: string;
  releasedAmount: string;
  reservedAmount: string;
  availableAmount: string;
  status: BudgetReleaseStatus;
}

/** Mirrors the existing `POST /budgeting/budget-releases` request body
 * (CreateReleaseDto) exactly — no backend change to the DTO shape. The
 * backend method this calls was extended (see BudgetReleaseService's
 * comment) with an eligibility check and an over-release guard, but the
 * REQUEST shape is unchanged. */
export interface CreateBudgetReleaseInput {
  budgetHeaderId: string;
  releaseNumber: string;
  releaseDate: string;
  releasedAmount: number;
}

export type ReservationStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'active' | 'released' | 'cancelled';

export interface ReservationDetail {
  id: string;
  budgetReleaseId: string;
  reservationAmount: string;
  status: ReservationStatus;
  subjectTable: string | null;
  subjectId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReservationInput {
  budgetReleaseId: string;
  reservationAmount: number;
  subjectTable?: string;
  subjectId?: string;
}

export interface EditReservationInput {
  reservationAmount?: number;
  subjectTable?: string;
  subjectId?: string;
}

export interface ReservationListItem {
  id: string;
  reservationAmount: string;
  status: ReservationStatus;
  subjectTable: string | null;
  subjectId: string | null;
  createdAt: string;
  budgetRelease: { releaseNumber: string };
}

export type BudgetHeaderSortField = 'totalAmount' | 'status' | 'createdAt' | 'updatedAt';

export interface ListBudgetHeadersParams {
  search?: string;
  status?: BudgetHeaderStatus;
  budgetVersionId?: string;
  responsibilityCenterId?: string;
  fundSourceId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: BudgetHeaderSortField;
  sortOrder?: 'asc' | 'desc';
}

export type BudgetVersionStatus = 'draft' | 'submitted' | 'approved' | 'superseded' | 'rejected';

/** Mirrors the raw BudgetVersion record returned by the existing
 * `GET /budgeting/budget-versions/:id` endpoint — used by the Dashboard
 * to show which budget cycle/version a header belongs to. */
export interface BudgetVersionSummary {
  id: string;
  budgetCycleId: string;
  versionNumber: number;
  name: string;
  status: BudgetVersionStatus;
  isCurrent: boolean;
}

export type BudgetCycleStatus = 'planning' | 'active' | 'closed';

/** Mirrors the raw BudgetCycle record returned by the existing
 * `GET /budgeting/budget-cycles/:id` endpoint. `name` is where the
 * fiscal year is actually conveyed (e.g. "FY2026 Budget Cycle") — there
 * is no separate fiscal-year-lookup endpoint in the current system. */
export interface BudgetCycleSummary {
  id: string;
  fiscalYearId: string;
  code: string;
  name: string;
  status: BudgetCycleStatus;
}

/**
 * Mirrors the existing `POST /budgeting/budget-headers` request body
 * (CreateBudgetHeaderDto) exactly — every field here is already
 * required/accepted by that endpoint today. `totalAmount` is required
 * by the existing API even though it wasn't in the Create Budget page's
 * requested field list — there's no way to create a header without it
 * (see CreateBudgetHeaderPage.tsx's header comment).
 */
export interface CreateBudgetHeaderInput {
  budgetVersionId: string;
  responsibilityCenterId: string;
  fundSourceId: string;
  totalAmount: number;
  currencyCode?: string;
}

/** Mirrors the existing `POST /budgeting/budget-versions` request body
 * — used only by the optional "create a new version" affordance on the
 * Create Budget page; no backend change. */
export interface CreateBudgetVersionInput {
  budgetCycleId: string;
  versionNumber: number;
  name: string;
}

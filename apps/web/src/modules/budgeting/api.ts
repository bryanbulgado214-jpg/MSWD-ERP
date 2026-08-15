import type {
  BudgetAmountSummary,
  BudgetCycleSummary,
  BudgetHeaderListItem,
  BudgetLineItem,
  BudgetReleaseItem,
  BudgetVersionSummary,
  CreateBudgetHeaderInput,
  CreateBudgetLineInput,
  CreateBudgetReleaseInput,
  CreateBudgetVersionInput,
  CreateReservationInput,
  EditReservationInput,
  ListBudgetHeadersParams,
  PaginatedResult,
  ReservationDetail,
  ReservationListItem,
  UpdateBudgetLineInput,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * Reads the signed-in user's access token. There is no login screen
 * built yet anywhere in apps/web — wiring an actual authentication flow
 * that populates this value is a separate, future task. Until then,
 * this page works once a token has been placed here by any means (e.g.
 * manually, via browser dev tools, for testing against the real API).
 */
function getAccessToken(): string | null {
  return localStorage.getItem('mswd_access_token');
}

export class BudgetSummaryApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BudgetSummaryApiError';
  }
}

async function authFetch(path: string): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.status === 401) {
    throw new BudgetSummaryApiError('Not signed in, or your session has expired.', 401);
  }
  if (response.status === 403) {
    throw new BudgetSummaryApiError('You do not have permission to view this.', 403);
  }
  if (response.status === 404) {
    throw new BudgetSummaryApiError('Not found.', 404);
  }
  if (!response.ok) {
    throw new BudgetSummaryApiError(`Request failed (${response.status}).`, response.status);
  }
  return response;
}

/** Pulls the real message out of a NestJS error response body — for
 * validation failures (400) the body's `message` is an array of
 * strings (one per failed rule); for everything else it's a single
 * string. Falls back to a generic message if the body isn't JSON at
 * all (e.g. a proxy/network-level failure with an HTML error page). */
async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (Array.isArray(body.message)) return body.message.join(' ');
    if (typeof body.message === 'string') return body.message;
  } catch {
    // response body wasn't JSON — fall through to the generic message
  }
  return fallback;
}

async function authFetchMutate(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401) {
    throw new BudgetSummaryApiError('Not signed in, or your session has expired.', 401);
  }
  if (response.status === 403) {
    throw new BudgetSummaryApiError(
      await extractErrorMessage(response, 'You do not have permission to do this.'),
      403,
    );
  }
  if (response.status === 404) {
    throw new BudgetSummaryApiError('Not found.', 404);
  }
  if (response.status === 409) {
    throw new BudgetSummaryApiError(
      await extractErrorMessage(
        response,
        'This was changed by someone else — reload and try again.',
      ),
      409,
    );
  }
  if (response.status === 400) {
    throw new BudgetSummaryApiError(
      await extractErrorMessage(response, 'That request was invalid.'),
      400,
    );
  }
  if (!response.ok) {
    throw new BudgetSummaryApiError(
      await extractErrorMessage(response, `Request failed (${response.status}).`),
      response.status,
    );
  }
  return response;
}

export async function getReservation(id: string): Promise<ReservationDetail> {
  return (await authFetch(`/budgeting/reservations/${id}`)).json();
}

export async function createReservation(input: CreateReservationInput): Promise<ReservationDetail> {
  return (await authFetchMutate('/budgeting/reservations', 'POST', input)).json();
}

export async function editReservationDraft(
  id: string,
  expectedVersion: number,
  input: EditReservationInput,
): Promise<ReservationDetail> {
  return (
    await authFetchMutate(`/budgeting/reservations/${id}`, 'PATCH', { ...input, expectedVersion })
  ).json();
}

export async function submitReservation(
  id: string,
  expectedVersion: number,
): Promise<ReservationDetail> {
  return (
    await authFetchMutate(`/budgeting/reservations/${id}/submit`, 'POST', { expectedVersion })
  ).json();
}

export async function approveReservation(
  id: string,
  expectedVersion: number,
): Promise<ReservationDetail> {
  return (
    await authFetchMutate(`/budgeting/reservations/${id}/approve`, 'POST', { expectedVersion })
  ).json();
}

export async function rejectReservation(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<ReservationDetail> {
  return (
    await authFetchMutate(`/budgeting/reservations/${id}/reject`, 'POST', {
      expectedVersion,
      remarks,
    })
  ).json();
}

export async function cancelReservation(
  id: string,
  expectedVersion: number,
  remarks?: string,
): Promise<ReservationDetail> {
  return (
    await authFetchMutate(`/budgeting/reservations/${id}/cancel`, 'POST', {
      expectedVersion,
      remarks,
    })
  ).json();
}

/** Wraps the existing `GET /budgeting/budget-cycles` endpoint — no
 * backend change. Used by the Annual Budgets page's Fiscal Year filter
 * dropdown (cycles are few in number for any one organization, so a
 * single unpaginated fetch is appropriate here, same as the backend
 * itself treats this list). */
export async function listBudgetCycles(): Promise<BudgetCycleSummary[]> {
  return (await authFetch('/budgeting/budget-cycles')).json();
}

/** Wraps the existing `GET /budgeting/budget-versions?budgetCycleId=`
 * endpoint — no backend change. */
export async function listBudgetVersionsForCycle(
  budgetCycleId: string,
): Promise<BudgetVersionSummary[]> {
  return (await authFetch(`/budgeting/budget-versions?budgetCycleId=${budgetCycleId}`)).json();
}

/** Wraps the existing `POST /budgeting/budget-versions` endpoint — no
 * backend change. Used only by the Create Budget page's optional
 * "create a new version" affordance. */
export async function createBudgetVersion(
  input: CreateBudgetVersionInput,
): Promise<BudgetVersionSummary> {
  return (await authFetchMutate('/budgeting/budget-versions', 'POST', input)).json();
}

/** Wraps the existing `POST /budgeting/budget-headers` endpoint — no
 * backend change. */
export async function createBudgetHeader(
  input: CreateBudgetHeaderInput,
): Promise<BudgetHeaderListItem> {
  return (await authFetchMutate('/budgeting/budget-headers', 'POST', input)).json();
}

export async function getBudgetHeader(id: string): Promise<BudgetHeaderListItem> {
  return (await authFetch(`/budgeting/budget-headers/${id}`)).json();
}

/** Wraps the existing generic `PATCH /budgeting/budget-headers/:id`
 * endpoint — no backend change, no new endpoint. NOTE: this endpoint
 * has no dedicated submit/approve/reject actions (unlike reservations,
 * which have four separate ones) — it's the same single status-setting
 * call for all three transitions, and the backend does not validate
 * that the transition itself is legal (see BudgetHeaderService.update,
 * which accepts any status value regardless of the current one). The
 * Budget Detail page is responsible for only offering the buttons that
 * make sense for the current status — see its own comments. */
export async function updateBudgetHeaderStatus(
  id: string,
  status: 'submitted' | 'approved' | 'rejected' | 'draft',
): Promise<BudgetHeaderListItem> {
  return (await authFetchMutate(`/budgeting/budget-headers/${id}`, 'PATCH', { status })).json();
}

/** Wraps the existing `GET /budgeting/budget-versions/:id` endpoint —
 * no backend change, just a frontend caller that didn't exist before
 * (the Dashboard is the first page needing to show cycle/version
 * context, whereas the List/Detail pages never needed it). */
export async function getBudgetVersion(id: string): Promise<BudgetVersionSummary> {
  return (await authFetch(`/budgeting/budget-versions/${id}`)).json();
}

/** Wraps the existing `GET /budgeting/budget-cycles/:id` endpoint —
 * same as getBudgetVersion above. */
export async function getBudgetCycle(id: string): Promise<BudgetCycleSummary> {
  return (await authFetch(`/budgeting/budget-cycles/${id}`)).json();
}

export async function listBudgetLinesForHeader(budgetHeaderId: string): Promise<BudgetLineItem[]> {
  return (await authFetch(`/budgeting/budget-lines?budgetHeaderId=${budgetHeaderId}`)).json();
}

/** Wraps the existing `DELETE /budgeting/budget-lines/:id` endpoint —
 * no backend change. That endpoint returns 204 No Content on success,
 * so this resolves to void rather than parsing a body that isn't there. */
export async function deleteBudgetLine(id: string): Promise<void> {
  await authFetchMutate(`/budgeting/budget-lines/${id}`, 'DELETE');
}

/** Wraps the existing `POST /budgeting/budget-lines` endpoint — no
 * backend change; this is its first frontend caller. */
export async function createBudgetLine(input: CreateBudgetLineInput): Promise<BudgetLineItem> {
  return (await authFetchMutate('/budgeting/budget-lines', 'POST', input)).json();
}

/** Wraps the existing `PATCH /budgeting/budget-lines/:id` endpoint —
 * no backend change; this is its first frontend caller. */
export async function updateBudgetLine(
  id: string,
  input: UpdateBudgetLineInput,
): Promise<BudgetLineItem> {
  return (await authFetchMutate(`/budgeting/budget-lines/${id}`, 'PATCH', input)).json();
}

export async function listBudgetReleasesForHeader(
  budgetHeaderId: string,
): Promise<BudgetReleaseItem[]> {
  return (await authFetch(`/budgeting/budget-releases?budgetHeaderId=${budgetHeaderId}`)).json();
}

/** Wraps the existing `POST /budgeting/budget-releases` endpoint — no
 * new endpoint; this is its first frontend caller. */
export async function createBudgetRelease(
  input: CreateBudgetReleaseInput,
): Promise<BudgetReleaseItem> {
  return (await authFetchMutate('/budgeting/budget-releases', 'POST', input)).json();
}

export async function listReservationsForHeader(
  budgetHeaderId: string,
): Promise<ReservationListItem[]> {
  return (await authFetch(`/budgeting/reservations?budgetHeaderId=${budgetHeaderId}`)).json();
}

export async function listBudgetHeaders(
  params: ListBudgetHeadersParams,
): Promise<PaginatedResult<BudgetHeaderListItem>> {
  const token = getAccessToken();
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.status) searchParams.set('status', params.status);
  if (params.budgetVersionId) searchParams.set('budgetVersionId', params.budgetVersionId);
  if (params.responsibilityCenterId)
    searchParams.set('responsibilityCenterId', params.responsibilityCenterId);
  if (params.fundSourceId) searchParams.set('fundSourceId', params.fundSourceId);
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('pageSize', String(params.pageSize ?? 20));
  searchParams.set('sortBy', params.sortBy ?? 'createdAt');
  searchParams.set('sortOrder', params.sortOrder ?? 'desc');

  const response = await fetch(
    `${API_BASE_URL}/budgeting/budget-headers?${searchParams.toString()}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  if (response.status === 401) {
    throw new BudgetSummaryApiError('Not signed in, or your session has expired.', 401);
  }
  if (response.status === 403) {
    throw new BudgetSummaryApiError('You do not have permission to view budgets.', 403);
  }
  if (!response.ok) {
    throw new BudgetSummaryApiError(`Request failed (${response.status}).`, response.status);
  }

  return response.json();
}

export async function getBudgetHeaderSummary(budgetHeaderId: string): Promise<BudgetAmountSummary> {
  const token = getAccessToken();
  const response = await fetch(
    `${API_BASE_URL}/budgeting/budget-headers/${budgetHeaderId}/summary`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  if (response.status === 401) {
    throw new BudgetSummaryApiError('Not signed in, or your session has expired.', 401);
  }
  if (response.status === 403) {
    throw new BudgetSummaryApiError('You do not have permission to view this budget.', 403);
  }
  if (response.status === 404) {
    throw new BudgetSummaryApiError('This budget could not be found.', 404);
  }
  if (!response.ok) {
    throw new BudgetSummaryApiError(`Request failed (${response.status}).`, response.status);
  }

  return response.json();
}

// ── Lookup endpoints ──

export interface LookupItem {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export async function listResponsibilityCenters(): Promise<LookupItem[]> {
  return (await authFetch('/budgeting/lookups/responsibility-centers')).json();
}

export async function listFundSources(): Promise<LookupItem[]> {
  return (await authFetch('/budgeting/lookups/fund-sources')).json();
}

export async function listDepartments(): Promise<LookupItem[]> {
  return (await authFetch('/budgeting/lookups/departments')).json();
}

export async function listLocations(): Promise<LookupItem[]> {
  return (await authFetch('/budgeting/lookups/locations')).json();
}

export interface UserLookupItem {
  id: string;
  username: string;
  email: string;
}

export async function listUsers(): Promise<UserLookupItem[]> {
  return (await authFetch('/budgeting/lookups/users')).json();
}

export interface FiscalYearLookupItem {
  id: string;
  year: number;
  name: string;
  startDate: string;
  endDate: string;
}

export async function listFiscalYears(): Promise<FiscalYearLookupItem[]> {
  return (await authFetch('/budgeting/lookups/fiscal-years')).json();
}

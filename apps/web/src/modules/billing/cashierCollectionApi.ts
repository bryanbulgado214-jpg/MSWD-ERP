const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

function token(): string | null {
  return localStorage.getItem('mswd_access_token');
}

export class CashierCollectionApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'CashierCollectionApiError';
  }
}

async function req<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const t = token();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      const b = await res.json();
      if (Array.isArray(b.message)) msg = b.message.join(' ');
      else if (typeof b.message === 'string') msg = b.message;
    } catch {
      /* not JSON */
    }
    throw new CashierCollectionApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const BASE = '/billing/cashier-collection';

// ── Types ──

export interface Collector {
  id: string;
  name: string;
  isCashier: boolean;
  isActive: boolean;
  sortOrder: number;
}
export interface CollectionArea {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}
export interface CollectionTypeOption {
  key: string;
  label: string;
  glAccountCode: string | null;
  glAccountName: string | null;
  mapped: boolean;
  requiresDescription: boolean;
  classifiedByAccountant: boolean;
}
export interface FormOptions {
  collectors: Collector[];
  areas: CollectionArea[];
  collectionTypes: CollectionTypeOption[];
  denominations: number[];
}
export interface JevRef {
  jevNumber: string;
  status: 'draft' | 'for_review' | 'approved' | 'posted' | 'voided' | 'reversed';
}
export interface CashierReportListItem {
  id: string;
  reportNumber: string;
  reportDate: string;
  status: 'draft' | 'submitted';
  totalAmount: number;
  entryCount: number;
  submittedAt: string | null;
  collectionJev: JevRef | null;
  depositRecordedAt: string | null;
  depositDate: string | null;
  depositJev: JevRef | null;
}
export interface CashierDashboardCounts {
  checksDueForPrinting: number;
  unclearedChecks: number;
  undepositedCollections: number;
  collectionsNotPosted: number;
  depositsNotPosted: number;
}
export interface BankAccountOption {
  id: string;
  label: string;
  hasGl: boolean;
}
export interface CheckItem {
  checkNumber: string;
  bankName?: string;
  amount: number;
}
export interface CollectionLineInput {
  collectionType: string;
  amount: number;
  description?: string;
}
export interface CollectionLineDetail {
  collectionType: string;
  collectionTypeLabel: string;
  description: string;
  glAccountCode: string;
  glAccountName: string;
  classifiedByAccountant: boolean;
  amount: number;
}
export interface CashierEntry {
  id: string;
  collectorId: string;
  collectorName: string;
  collectionAreaId: string | null;
  collectionAreaName: string | null;
  collectionDate: string;
  glLines: CollectionLineDetail[];
  orSeries: string;
  amount: number;
  totalRemittance: number;
  checks: CheckItem[];
  checksTotal: number;
  cashCountTotal: number;
  countedTotal: number;
  variance: number;
  cashCount: Record<string, number>;
}
export interface CashierReport {
  id: string;
  reportNumber: string;
  reportDate: string;
  status: 'draft' | 'submitted';
  totalAmount: number;
  remarks: string | null;
  version: number;
  cashierName: string;
  submittedAt: string | null;
  journalEntry: { id: string | null; jevNumber: string; status: string } | null;
  entries: CashierEntry[];
  combinedCashCount: Record<string, number>;
  combinedCashCountTotal: number;
  combinedChecksTotal: number;
  overallCountedTotal: number;
  overallVariance: number;
  denominations: number[];
}

export interface EntryInput {
  collectorId: string;
  collectionAreaId?: string;
  collectionDate: string;
  orSeries: string;
  lines: CollectionLineInput[];
  checks?: CheckItem[];
  cashCount: Record<string, number>;
}

// ── Admin: collectors & areas ──

export const listCollectors = (activeOnly = false) =>
  req<Collector[]>(`${BASE}/collectors${activeOnly ? '?activeOnly=true' : ''}`);
export const createCollector = (data: Partial<Collector> & { name: string }) =>
  req<Collector>(`${BASE}/collectors`, 'POST', data);
export const updateCollector = (id: string, data: Partial<Collector> & { name: string }) =>
  req<Collector>(`${BASE}/collectors/${id}`, 'PATCH', data);
export const deleteCollector = (id: string) => req(`${BASE}/collectors/${id}`, 'DELETE');

export const listAreas = (activeOnly = false) =>
  req<CollectionArea[]>(`${BASE}/areas${activeOnly ? '?activeOnly=true' : ''}`);
export const createArea = (data: Partial<CollectionArea> & { name: string }) =>
  req<CollectionArea>(`${BASE}/areas`, 'POST', data);
export const updateArea = (id: string, data: Partial<CollectionArea> & { name: string }) =>
  req<CollectionArea>(`${BASE}/areas/${id}`, 'PATCH', data);
export const deleteArea = (id: string) => req(`${BASE}/areas/${id}`, 'DELETE');

// ── Cashier report ──

export const getFormOptions = () => req<FormOptions>(`${BASE}/form-options`);
export const getDashboardCounts = () => req<CashierDashboardCounts>(`${BASE}/dashboard-counts`);
export const listBankAccounts = () => req<BankAccountOption[]>(`${BASE}/bank-accounts`);
export const recordDeposit = (id: string, data: { depositDate: string; bankAccountId: string }) =>
  req<{ depositJevNumber: string }>(`${BASE}/reports/${id}/deposit`, 'POST', data);
export const listReports = () => req<CashierReportListItem[]>(`${BASE}/reports`);
export const createReport = (reportDate: string, remarks?: string) =>
  req<CashierReport>(`${BASE}/reports`, 'POST', { reportDate, ...(remarks ? { remarks } : {}) });
export const getReport = (id: string) => req<CashierReport>(`${BASE}/reports/${id}`);
export const updateReport = (id: string, data: { reportDate?: string; remarks?: string }) =>
  req<CashierReport>(`${BASE}/reports/${id}`, 'PATCH', data);
export const deleteReport = (id: string) => req(`${BASE}/reports/${id}`, 'DELETE');
export const addEntry = (reportId: string, data: EntryInput) =>
  req<CashierReport>(`${BASE}/reports/${reportId}/entries`, 'POST', data);
export const updateEntry = (reportId: string, entryId: string, data: EntryInput) =>
  req<CashierReport>(`${BASE}/reports/${reportId}/entries/${entryId}`, 'PATCH', data);
export const deleteEntry = (reportId: string, entryId: string) =>
  req<CashierReport>(`${BASE}/reports/${reportId}/entries/${entryId}`, 'DELETE');
export const submitReport = (id: string, expectedVersion: number) =>
  req<CashierReport & { jevNumber?: string }>(`${BASE}/reports/${id}/submit`, 'POST', {
    expectedVersion,
  });

// ── Cash-count helper (mirrors the teller sheet) ──

// Assorted loose coins are entered as one peso amount under this key rather than
// tallied per centavo denomination.
export const OTHER_COINS_KEY = 'other';

export function cashCountTotal(
  denominations: number[],
  count: Record<string, number> | null | undefined,
): number {
  if (!count) return 0;
  const cents =
    denominations.reduce((s, d) => s + Math.round(d * 100) * (Number(count[String(d)]) || 0), 0) +
    Math.round((Number(count[OTHER_COINS_KEY]) || 0) * 100);
  return cents / 100;
}
export function denomLabel(d: number): string {
  return d < 1 ? `${Math.round(d * 100)}¢` : `₱${d.toLocaleString('en-PH')}`;
}

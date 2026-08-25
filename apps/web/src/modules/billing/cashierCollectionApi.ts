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
export interface GlAccountOption {
  id: string;
  accountCode: string;
  name: string;
}
export interface FormOptions {
  collectors: Collector[];
  areas: CollectionArea[];
  glAccounts: GlAccountOption[];
  denominations: number[];
}
export interface CashierReportListItem {
  id: string;
  reportNumber: string;
  reportDate: string;
  status: 'draft' | 'submitted';
  totalAmount: number;
  entryCount: number;
  submittedAt: string | null;
}
export interface CheckItem {
  checkNumber: string;
  bankName?: string;
  amount: number;
}
export interface CashierEntry {
  id: string;
  collectorId: string;
  collectorName: string;
  collectionAreaId: string | null;
  collectionAreaName: string | null;
  collectionDate: string;
  glAccountId: string;
  glAccountCode: string;
  glAccountName: string;
  orSeries: string;
  amount: number;
  totalRemittance: number;
  checks: CheckItem[];
  checksTotal: number;
  cashCountTotal: number;
  expectedCash: number;
  cashVariance: number;
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
  overallExpectedCash: number;
  overallCashVariance: number;
  denominations: number[];
}

export interface EntryInput {
  collectorId: string;
  collectionAreaId?: string;
  collectionDate: string;
  glAccountId: string;
  orSeries: string;
  totalRemittance: number;
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

export function cashCountTotal(
  denominations: number[],
  count: Record<string, number> | null | undefined,
): number {
  if (!count) return 0;
  const cents = denominations.reduce(
    (s, d) => s + Math.round(d * 100) * (Number(count[String(d)]) || 0),
    0,
  );
  return cents / 100;
}
export function denomLabel(d: number): string {
  return d < 1 ? `${Math.round(d * 100)}¢` : `₱${d.toLocaleString('en-PH')}`;
}

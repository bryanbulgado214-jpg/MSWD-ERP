import type {
  AccountabilityListItem,
  AccountabilityRecord,
  DisposalListItem,
  InventoryGlPreview,
  InventoryGlRun,
  InventoryItem,
  InventorySummary,
  PhysicalCountListItem,
  PropertyRecord,
  Ris,
  RisListItem,
  StockReceipt,
  StockReceiptListItem,
  SupplyLedgerCard,
  SupplyLedgerItem,
  SupplyLedgerReconciliation,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

function getAccessToken(): string | null {
  return localStorage.getItem('mswd_access_token');
}

export class InventoryApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'InventoryApiError';
  }
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (Array.isArray(body.message)) return body.message.join(' ');
    if (typeof body.message === 'string') return body.message;
  } catch {
    /* not JSON */
  }
  return fallback;
}

async function authFetch(path: string): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401)
    throw new InventoryApiError('Not signed in, or your session has expired.', 401);
  if (response.status === 403)
    throw new InventoryApiError('You do not have permission to view this.', 403);
  if (response.status === 404) throw new InventoryApiError('Not found.', 404);
  if (!response.ok)
    throw new InventoryApiError(`Request failed (${response.status}).`, response.status);
  return response;
}

async function authFetchMutate(
  path: string,
  method: 'POST' | 'PATCH',
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
  if (response.status === 401) throw new InventoryApiError('Not signed in.', 401);
  if (response.status === 403)
    throw new InventoryApiError(await extractErrorMessage(response, 'Forbidden.'), 403);
  if (response.status === 404) throw new InventoryApiError('Not found.', 404);
  if (response.status === 409)
    throw new InventoryApiError(
      await extractErrorMessage(response, 'Modified concurrently — reload.'),
      409,
    );
  if (response.status === 400)
    throw new InventoryApiError(await extractErrorMessage(response, 'Invalid request.'), 400);
  if (!response.ok)
    throw new InventoryApiError(
      await extractErrorMessage(response, `Failed (${response.status}).`),
      response.status,
    );
  return response;
}

// ── Inventory Items ──

export async function getInventoryItems(params?: string): Promise<InventoryItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/inventory/items${qs}`);
  return res.json();
}

export async function getInventoryItem(id: string): Promise<InventoryItem> {
  const res = await authFetch(`/inventory/items/${id}`);
  return res.json();
}

export async function createInventoryItem(data: {
  itemCode: string;
  description: string;
  unitOfMeasure: string;
  classification: string;
  category?: string;
  accountCode?: string;
  reorderPoint?: number;
}): Promise<InventoryItem> {
  const res = await authFetchMutate('/inventory/items', 'POST', data);
  return res.json();
}

export async function updateInventoryItem(
  id: string,
  data: {
    expectedVersion: number;
    description?: string;
    unitOfMeasure?: string;
    category?: string;
    accountCode?: string;
    reorderPoint?: number;
    isActive?: boolean;
  },
): Promise<InventoryItem> {
  const res = await authFetchMutate(`/inventory/items/${id}`, 'PATCH', data);
  return res.json();
}

export async function setBeginningBalance(
  id: string,
  data: { quantity: number; unitCost: number; asOfDate: string },
): Promise<InventoryItem> {
  const res = await authFetchMutate(`/inventory/items/${id}/beginning-balance`, 'POST', data);
  return res.json();
}

// ── Stock Receipts ──

export async function getStockReceipts(params?: string): Promise<StockReceiptListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/inventory/stock-receipts${qs}`);
  return res.json();
}

export async function getStockReceipt(id: string): Promise<StockReceipt> {
  const res = await authFetch(`/inventory/stock-receipts/${id}`);
  return res.json();
}

export async function createStockReceipt(data: unknown): Promise<StockReceipt> {
  const res = await authFetchMutate('/inventory/stock-receipts', 'POST', data);
  return res.json();
}

export async function postStockReceipt(id: string, expectedVersion: number): Promise<StockReceipt> {
  const res = await authFetchMutate(`/inventory/stock-receipts/${id}/post`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function cancelStockReceipt(
  id: string,
  expectedVersion: number,
): Promise<StockReceipt> {
  const res = await authFetchMutate(`/inventory/stock-receipts/${id}/cancel`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

// ── RIS ──

export async function getRisList(params?: string): Promise<RisListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/inventory/ris${qs}`);
  return res.json();
}

export async function getRis(id: string): Promise<Ris> {
  const res = await authFetch(`/inventory/ris/${id}`);
  return res.json();
}

export async function createRis(data: unknown): Promise<Ris> {
  const res = await authFetchMutate('/inventory/ris', 'POST', data);
  return res.json();
}

export async function submitRis(id: string, expectedVersion: number): Promise<Ris> {
  const res = await authFetchMutate(`/inventory/ris/${id}/submit`, 'POST', { expectedVersion });
  return res.json();
}

export async function approveRis(id: string, expectedVersion: number): Promise<Ris> {
  const res = await authFetchMutate(`/inventory/ris/${id}/approve`, 'POST', { expectedVersion });
  return res.json();
}

export async function issueRis(
  id: string,
  data: { expectedVersion: number; items: Array<{ risItemId: string; quantityIssued: number }> },
): Promise<Ris> {
  const res = await authFetchMutate(`/inventory/ris/${id}/issue`, 'POST', data);
  return res.json();
}

export async function cancelRis(id: string, expectedVersion: number): Promise<Ris> {
  const res = await authFetchMutate(`/inventory/ris/${id}/cancel`, 'POST', { expectedVersion });
  return res.json();
}

// ── Property Records ──

export async function getPropertyRecords(params?: string): Promise<PropertyRecord[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/inventory/property-records${qs}`);
  return res.json();
}

export async function getPropertyRecord(id: string): Promise<PropertyRecord> {
  const res = await authFetch(`/inventory/property-records/${id}`);
  return res.json();
}

export async function createPropertyRecord(data: unknown): Promise<PropertyRecord> {
  const res = await authFetchMutate('/inventory/property-records', 'POST', data);
  return res.json();
}

export async function updatePropertyRecord(id: string, data: unknown): Promise<PropertyRecord> {
  const res = await authFetchMutate(`/inventory/property-records/${id}`, 'PATCH', data);
  return res.json();
}

// ── Accountability Records ──

export async function getAccountabilityRecords(params?: string): Promise<AccountabilityListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/inventory/accountability-records${qs}`);
  return res.json();
}

export async function getAccountabilityRecord(id: string): Promise<AccountabilityRecord> {
  const res = await authFetch(`/inventory/accountability-records/${id}`);
  return res.json();
}

export async function createAccountabilityRecord(data: unknown): Promise<AccountabilityRecord> {
  const res = await authFetchMutate('/inventory/accountability-records', 'POST', data);
  return res.json();
}

export async function returnAccountability(
  id: string,
  data: { expectedVersion: number; returnDate: string },
): Promise<AccountabilityRecord> {
  const res = await authFetchMutate(`/inventory/accountability-records/${id}/return`, 'POST', data);
  return res.json();
}

export async function transferAccountability(
  id: string,
  data: { expectedVersion: number; newUserId: string },
): Promise<AccountabilityRecord> {
  const res = await authFetchMutate(
    `/inventory/accountability-records/${id}/transfer`,
    'POST',
    data,
  );
  return res.json();
}

// ── Physical Counts ──

export async function getPhysicalCounts(params?: string): Promise<PhysicalCountListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/inventory/physical-counts${qs}`);
  return res.json();
}

// ── Disposal Requests ──

export async function getDisposalRequests(params?: string): Promise<DisposalListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/inventory/disposal-requests${qs}`);
  return res.json();
}

// ── Reports ──

export async function getInventorySummary(): Promise<InventorySummary> {
  const res = await authFetch('/inventory/reports/summary');
  return res.json();
}

export async function getStockCardReport(inventoryItemId: string): Promise<unknown> {
  const res = await authFetch(`/inventory/reports/stock-card/${inventoryItemId}`);
  return res.json();
}

// ── Month-End Inventory JEV (RSMI) ──

export async function getInventoryGlRuns(): Promise<InventoryGlRun[]> {
  const res = await authFetch('/inventory/gl/runs');
  return res.json();
}

export async function previewInventoryGl(month: number, year: number): Promise<InventoryGlPreview> {
  const res = await authFetch(`/inventory/gl/preview?month=${month}&year=${year}`);
  return res.json();
}

export async function postInventoryGl(month: number, year: number): Promise<InventoryGlRun> {
  const res = await authFetchMutate('/inventory/gl/post', 'POST', { month, year });
  return res.json();
}

export async function voidInventoryGl(
  id: string,
  expectedVersion: number,
): Promise<InventoryGlRun> {
  const res = await authFetchMutate(`/inventory/gl/runs/${id}/void`, 'POST', { expectedVersion });
  return res.json();
}

// ── Supplies Ledger Card (accountant) ──

export async function getSupplyLedgerItems(): Promise<SupplyLedgerItem[]> {
  const res = await authFetch('/accounting/supply-ledger/items');
  return res.json();
}

export async function getSupplyLedgerCard(
  id: string,
  from?: string,
  to?: string,
): Promise<SupplyLedgerCard> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await authFetch(`/accounting/supply-ledger/items/${id}${suffix}`);
  return res.json();
}

export async function getSupplyLedgerReconciliation(): Promise<SupplyLedgerReconciliation> {
  const res = await authFetch('/accounting/supply-ledger/reconciliation');
  return res.json();
}

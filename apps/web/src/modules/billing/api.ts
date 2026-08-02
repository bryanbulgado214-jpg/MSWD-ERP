import type { Bill, BillListItem, BillingPeriod, Consumer, ConsumerArrears, ConsumerListItem, ConsumerMeterAssignment, DisconnectionOrder, DisconnectionOrderListItem, Meter, MeterListItem, MeterReading, Payment, PaymentListItem, RateSchedule, UnpaidBill } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

function getAccessToken(): string | null {
  return localStorage.getItem('mswd_access_token');
}

export class BillingApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BillingApiError';
  }
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (Array.isArray(body.message)) return body.message.join(' ');
    if (typeof body.message === 'string') return body.message;
  } catch { /* not JSON */ }
  return fallback;
}

async function authFetch(path: string): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401) throw new BillingApiError('Not signed in, or your session has expired.', 401);
  if (response.status === 403) throw new BillingApiError('You do not have permission to view this.', 403);
  if (response.status === 404) throw new BillingApiError('Not found.', 404);
  if (!response.ok) throw new BillingApiError(`Request failed (${response.status}).`, response.status);
  return response;
}

async function authFetchMutate(path: string, method: 'POST' | 'PATCH', body?: unknown): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) throw new BillingApiError('Not signed in.', 401);
  if (response.status === 403) throw new BillingApiError(await extractErrorMessage(response, 'Forbidden.'), 403);
  if (response.status === 404) throw new BillingApiError('Not found.', 404);
  if (response.status === 409) throw new BillingApiError(await extractErrorMessage(response, 'Modified concurrently — reload.'), 409);
  if (response.status === 400) throw new BillingApiError(await extractErrorMessage(response, 'Invalid request.'), 400);
  if (!response.ok) throw new BillingApiError(await extractErrorMessage(response, `Failed (${response.status}).`), response.status);
  return response;
}

// ── Consumers ──

export async function getConsumers(params?: string): Promise<ConsumerListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/billing/consumers${qs}`);
  return res.json();
}

export async function getConsumer(id: string): Promise<Consumer> {
  const res = await authFetch(`/billing/consumers/${id}`);
  return res.json();
}

export async function createConsumer(data: {
  accountNumber: string; firstName: string; lastName: string; address: string;
  middleName?: string; businessName?: string; consumerType?: string;
  barangay?: string; municipality?: string; province?: string;
  contactNumber?: string; email?: string;
  isSeniorCitizen?: boolean; isPwd?: boolean;
  connectionDate?: string; notes?: string;
}): Promise<Consumer> {
  const res = await authFetchMutate('/billing/consumers', 'POST', data);
  return res.json();
}

export async function updateConsumer(id: string, data: {
  expectedVersion: number;
  firstName?: string; middleName?: string; lastName?: string;
  businessName?: string; address?: string; barangay?: string;
  contactNumber?: string; email?: string;
  isSeniorCitizen?: boolean; isPwd?: boolean;
  status?: string; notes?: string;
}): Promise<Consumer> {
  const res = await authFetchMutate(`/billing/consumers/${id}`, 'PATCH', data);
  return res.json();
}

export async function assignMeter(consumerId: string, data: {
  meterId: string; installedDate: string; remarks?: string;
}): Promise<ConsumerMeterAssignment> {
  const res = await authFetchMutate(`/billing/consumers/${consumerId}/assign-meter`, 'POST', data);
  return res.json();
}

export async function getBarangays(): Promise<string[]> {
  const res = await authFetch('/billing/consumers/barangays');
  return res.json();
}

// ── Meters ──

export async function getMeters(params?: string): Promise<MeterListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/billing/meters${qs}`);
  return res.json();
}

export async function getMeter(id: string): Promise<Meter> {
  const res = await authFetch(`/billing/meters/${id}`);
  return res.json();
}

export async function createMeter(data: {
  serialNumber: string; brand?: string; size?: string;
  initialReading?: number; notes?: string;
}): Promise<Meter> {
  const res = await authFetchMutate('/billing/meters', 'POST', data);
  return res.json();
}

export async function updateMeter(id: string, data: {
  brand?: string; status?: string; notes?: string;
}): Promise<Meter> {
  const res = await authFetchMutate(`/billing/meters/${id}`, 'PATCH', data);
  return res.json();
}

export async function getUnassignedMeters(): Promise<MeterListItem[]> {
  const res = await authFetch('/billing/meters/unassigned');
  return res.json();
}

// ── Rate Schedules ──

export async function getRateSchedules(params?: string): Promise<RateSchedule[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/billing/rate-schedules${qs}`);
  return res.json();
}

export async function getRateSchedule(id: string): Promise<RateSchedule> {
  const res = await authFetch(`/billing/rate-schedules/${id}`);
  return res.json();
}

export async function createRateSchedule(data: {
  name: string; consumerType: string; effectiveDate: string;
  endDate?: string; minimumCharge: number; minimumConsumption?: number;
  environmentalFee?: number; sewerCharge?: number; maintenanceFee?: number;
  tiers: Array<{ minConsumption: number; maxConsumption?: number | null; ratePerCubicMeter: number; sortOrder?: number }>;
}): Promise<RateSchedule> {
  const res = await authFetchMutate('/billing/rate-schedules', 'POST', data);
  return res.json();
}

export async function updateRateSchedule(id: string, data: {
  expectedVersion: number; name?: string; effectiveDate?: string;
  endDate?: string | null; minimumCharge?: number; minimumConsumption?: number;
  environmentalFee?: number; sewerCharge?: number; maintenanceFee?: number;
  isActive?: boolean;
  tiers?: Array<{ minConsumption: number; maxConsumption?: number | null; ratePerCubicMeter: number; sortOrder?: number }>;
}): Promise<RateSchedule> {
  const res = await authFetchMutate(`/billing/rate-schedules/${id}`, 'PATCH', data);
  return res.json();
}

// ── Billing Periods ──

export async function getBillingPeriods(params?: string): Promise<BillingPeriod[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/billing/periods${qs}`);
  return res.json();
}

export async function getBillingPeriod(id: string): Promise<BillingPeriod> {
  const res = await authFetch(`/billing/periods/${id}`);
  return res.json();
}

export async function createBillingPeriod(data: {
  name: string; billingMonth: number; billingYear: number;
  readingStartDate?: string; readingEndDate?: string;
  dueDate: string; penaltyDate: string;
}): Promise<BillingPeriod> {
  const res = await authFetchMutate('/billing/periods', 'POST', data);
  return res.json();
}

export async function updateBillingPeriod(id: string, data: {
  expectedVersion: number; name?: string;
  readingStartDate?: string; readingEndDate?: string;
  dueDate?: string; penaltyDate?: string;
}): Promise<BillingPeriod> {
  const res = await authFetchMutate(`/billing/periods/${id}`, 'PATCH', data);
  return res.json();
}

export async function transitionPeriod(id: string, data: {
  expectedVersion: number; status: 'reading' | 'billing' | 'closed';
}): Promise<BillingPeriod> {
  const res = await authFetchMutate(`/billing/periods/${id}/transition`, 'POST', data);
  return res.json();
}

// ── Meter Readings ──

export async function getMeterReadings(billingPeriodId: string): Promise<MeterReading[]> {
  const res = await authFetch(`/billing/readings?billingPeriodId=${billingPeriodId}`);
  return res.json();
}

export async function getUnreadConsumers(billingPeriodId: string): Promise<Array<{
  id: string; accountNumber: string; firstName: string; lastName: string; consumerType: string;
  consumerMeters: Array<{ isCurrent: boolean; meter: { id: string; serialNumber: string; initialReading: number } }>;
}>> {
  const res = await authFetch(`/billing/readings/unread?billingPeriodId=${billingPeriodId}`);
  return res.json();
}

export async function createMeterReading(data: {
  consumerId: string; meterId: string; billingPeriodId: string;
  readingDate: string; previousReading: number; currentReading: number;
  remarks?: string;
}): Promise<MeterReading> {
  const res = await authFetchMutate('/billing/readings', 'POST', data);
  return res.json();
}

export async function updateMeterReading(id: string, data: {
  currentReading?: number; readingDate?: string; remarks?: string; status?: string;
}): Promise<MeterReading> {
  const res = await authFetchMutate(`/billing/readings/${id}`, 'PATCH', data);
  return res.json();
}

// ── Bills ──

export async function getBills(params?: string): Promise<BillListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/billing/bills${qs}`);
  return res.json();
}

export async function getBill(id: string): Promise<Bill> {
  const res = await authFetch(`/billing/bills/${id}`);
  return res.json();
}

export async function generateBills(billingPeriodId: string): Promise<{ generated: number; bills: Array<{ consumerId: string; billNumber: string; totalAmount: number }> }> {
  const res = await authFetchMutate('/billing/bills/generate', 'POST', { billingPeriodId });
  return res.json();
}

// ── Payments ──

export async function getPayments(params?: string): Promise<PaymentListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/billing/payments${qs}`);
  return res.json();
}

export async function getPayment(id: string): Promise<Payment> {
  const res = await authFetch(`/billing/payments/${id}`);
  return res.json();
}

export async function getNextOrNumber(): Promise<{ nextOrNumber: string }> {
  const res = await authFetch('/billing/payments/next-or');
  return res.json();
}

export async function getUnpaidBills(consumerId: string): Promise<UnpaidBill[]> {
  const res = await authFetch(`/billing/payments/unpaid-bills?consumerId=${consumerId}`);
  return res.json();
}

export async function createPayment(data: {
  orNumber: string;
  consumerId: string;
  paymentDate: string;
  totalAmount: number;
  paymentMethod: string;
  checkNumber?: string;
  checkDate?: string;
  bankName?: string;
  referenceNumber?: string;
  remarks?: string;
  allocations: Array<{ billId: string; amountApplied: number }>;
}): Promise<Payment> {
  const res = await authFetchMutate('/billing/payments', 'POST', data);
  return res.json();
}

export async function voidPayment(id: string, data: {
  expectedVersion: number;
  voidReason: string;
}): Promise<Payment> {
  const res = await authFetchMutate(`/billing/payments/${id}/void`, 'POST', data);
  return res.json();
}

// ── Disconnections ──

export async function getDisconnectionOrders(params?: string): Promise<DisconnectionOrderListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/billing/disconnections${qs}`);
  return res.json();
}

export async function getDisconnectionOrder(id: string): Promise<DisconnectionOrder> {
  const res = await authFetch(`/billing/disconnections/${id}`);
  return res.json();
}

export async function getConsumersInArrears(): Promise<ConsumerArrears[]> {
  const res = await authFetch('/billing/disconnections/arrears');
  return res.json();
}

export async function createDisconnectionOrder(data: {
  consumerId: string;
  noticeDate: string;
  scheduledDate: string;
  remarks?: string;
}): Promise<DisconnectionOrder> {
  const res = await authFetchMutate('/billing/disconnections', 'POST', data);
  return res.json();
}

export async function transitionDisconnection(id: string, data: {
  expectedVersion: number;
  action: string;
  date?: string;
  reason?: string;
  reconnectionFee?: number;
}): Promise<DisconnectionOrder> {
  const res = await authFetchMutate(`/billing/disconnections/${id}/transition`, 'POST', data);
  return res.json();
}

export async function applyPenalties(): Promise<{ applied: number }> {
  const res = await authFetchMutate('/billing/disconnections/apply-penalties', 'POST');
  return res.json();
}

// ── Reports ──

export async function getCollectionSummary(startDate: string, endDate: string): Promise<unknown> {
  const res = await authFetch(`/billing/reports/collection-summary?startDate=${startDate}&endDate=${endDate}`);
  return res.json();
}

export async function getAgingReport(): Promise<unknown> {
  const res = await authFetch('/billing/reports/aging');
  return res.json();
}

export async function getConsumerLedger(consumerId: string): Promise<unknown> {
  const res = await authFetch(`/billing/reports/consumer-ledger?consumerId=${consumerId}`);
  return res.json();
}

export async function getBillingSummary(billingPeriodId?: string): Promise<unknown> {
  const qs = billingPeriodId ? `?billingPeriodId=${billingPeriodId}` : '';
  const res = await authFetch(`/billing/reports/billing-summary${qs}`);
  return res.json();
}

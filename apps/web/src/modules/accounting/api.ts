import type {
  AccountMapping,
  AccountingDashboardResult,
  AccountingPeriod,
  Bank,
  BankAccount,
  BankReconciliationDetail,
  BankReconciliationListItem,
  CheckDetail,
  CheckListItem,
  ChartOfAccount,
  CoaImportConfirmResult,
  CoaImportPreviewResult,
  ApAgingResult,
  CashActivityResult,
  CreateDisbursementInput,
  ChangesInEquityResult,
  DetailedStatement,
  DisbursementDetail,
  DisbursementSummary,
  FinancialStatementResult,
  FiscalYearDetail,
  FiscalYearOption,
  GeneralLedgerRow,
  JevDetail,
  JevListItem,
  PeriodDetail,
  PeriodOption,
  SubsidiaryLedgerResult,
  TrialBalanceRow,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

function getAccessToken(): string | null {
  return localStorage.getItem('mswd_access_token');
}

export class AccountingApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AccountingApiError';
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
    throw new AccountingApiError('Not signed in, or your session has expired.', 401);
  if (response.status === 403)
    throw new AccountingApiError('You do not have permission to view this.', 403);
  if (response.status === 404) throw new AccountingApiError('Not found.', 404);
  if (!response.ok)
    throw new AccountingApiError(`Request failed (${response.status}).`, response.status);
  return response;
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
  if (response.status === 401) throw new AccountingApiError('Not signed in.', 401);
  if (response.status === 403)
    throw new AccountingApiError(await extractErrorMessage(response, 'Forbidden.'), 403);
  if (response.status === 404) throw new AccountingApiError('Not found.', 404);
  if (response.status === 409)
    throw new AccountingApiError(
      await extractErrorMessage(response, 'Modified concurrently — reload.'),
      409,
    );
  if (response.status === 400)
    throw new AccountingApiError(await extractErrorMessage(response, 'Invalid request.'), 400);
  if (!response.ok)
    throw new AccountingApiError(
      await extractErrorMessage(response, `Failed (${response.status}).`),
      response.status,
    );
  return response;
}

// ── Chart of Accounts ──

export async function getChartOfAccounts(params?: string): Promise<ChartOfAccount[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/coa${qs}`);
  return res.json();
}

export async function getChartOfAccountTree(): Promise<ChartOfAccount[]> {
  const res = await authFetch('/accounting/coa/tree');
  return res.json();
}

export async function getChartOfAccount(id: string): Promise<ChartOfAccount> {
  const res = await authFetch(`/accounting/coa/${id}`);
  return res.json();
}

export async function createChartOfAccount(data: {
  accountCode: string;
  name: string;
  accountType: string;
  normalBalance: string;
  level: number;
  isHeader: boolean;
  parentAccountId?: string;
  uacsCode?: string;
}): Promise<ChartOfAccount> {
  const res = await authFetchMutate('/accounting/coa', 'POST', data);
  return res.json();
}

export async function updateChartOfAccount(
  id: string,
  data: {
    expectedVersion: number;
    name?: string;
    isActive?: boolean;
    uacsCode?: string;
  },
): Promise<ChartOfAccount> {
  const res = await authFetchMutate(`/accounting/coa/${id}`, 'PATCH', data);
  return res.json();
}

export async function getCoaImportPreview(csv: string): Promise<CoaImportPreviewResult> {
  const res = await authFetchMutate('/accounting/coa/import/preview', 'POST', { csv });
  return res.json();
}

export async function confirmCoaImport(csv: string): Promise<CoaImportConfirmResult> {
  const res = await authFetchMutate('/accounting/coa/import/confirm', 'POST', { csv });
  return res.json();
}

// ── Banks ──

export async function getBanks(): Promise<Bank[]> {
  const res = await authFetch('/accounting/banks');
  return res.json();
}

export async function createBank(data: {
  code: string;
  name: string;
  branch?: string;
  swiftCode?: string;
}): Promise<Bank> {
  const res = await authFetchMutate('/accounting/banks', 'POST', data);
  return res.json();
}

export async function updateBank(
  id: string,
  data: {
    name?: string;
    branch?: string;
    swiftCode?: string;
    isActive?: boolean;
  },
): Promise<Bank> {
  const res = await authFetchMutate(`/accounting/banks/${id}`, 'PATCH', data);
  return res.json();
}

// ── Bank Accounts ──

export async function getBankAccounts(params?: string): Promise<BankAccount[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/banks/accounts${qs}`);
  return res.json();
}

export async function getBankAccount(id: string): Promise<BankAccount> {
  const res = await authFetch(`/accounting/banks/accounts/${id}`);
  return res.json();
}

export async function createBankAccount(data: {
  bankId: string;
  fundSourceId?: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  isDefault?: boolean;
}): Promise<BankAccount> {
  const res = await authFetchMutate('/accounting/banks/accounts', 'POST', data);
  return res.json();
}

export async function updateBankAccount(
  id: string,
  data: {
    expectedVersion: number;
    accountName?: string;
    fundSourceId?: string;
    isDefault?: boolean;
    status?: string;
  },
): Promise<BankAccount> {
  const res = await authFetchMutate(`/accounting/banks/accounts/${id}`, 'PATCH', data);
  return res.json();
}

// ── Account Mappings ──

export async function getAccountMappings(): Promise<AccountMapping[]> {
  const res = await authFetch('/accounting/mappings');
  return res.json();
}

export async function upsertAccountMapping(data: {
  mappingKey: string;
  chartOfAccountId: string;
}): Promise<AccountMapping> {
  const res = await authFetchMutate('/accounting/mappings', 'POST', data);
  return res.json();
}

// ── JEV ──

export async function getJevList(params?: string): Promise<JevListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/jev${qs}`);
  return res.json();
}

export async function getJev(id: string): Promise<JevDetail> {
  const res = await authFetch(`/accounting/jev/${id}`);
  return res.json();
}

export async function getOpenPeriods(): Promise<AccountingPeriod[]> {
  const res = await authFetch('/accounting/jev/periods');
  return res.json();
}

export async function createJev(data: {
  jevDate: string;
  particulars: string;
  responsibilityCenterId?: string;
  fundSourceId?: string;
  lines: Array<{
    chartOfAccountId: string;
    debitAmount: number;
    creditAmount: number;
    description?: string;
  }>;
}): Promise<JevDetail> {
  const res = await authFetchMutate('/accounting/jev', 'POST', data);
  return res.json();
}

export async function updateJev(
  id: string,
  data: {
    expectedVersion: number;
    jevDate?: string;
    particulars?: string;
    responsibilityCenterId?: string;
    fundSourceId?: string;
    lines?: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description?: string;
    }>;
  },
): Promise<JevDetail> {
  const res = await authFetchMutate(`/accounting/jev/${id}`, 'PATCH', data);
  return res.json();
}

export async function submitJev(id: string, expectedVersion: number): Promise<JevDetail> {
  const res = await authFetchMutate(`/accounting/jev/${id}/submit`, 'POST', { expectedVersion });
  return res.json();
}

export async function approveJev(id: string, expectedVersion: number): Promise<JevDetail> {
  const res = await authFetchMutate(`/accounting/jev/${id}/approve`, 'POST', { expectedVersion });
  return res.json();
}

export async function postJev(id: string, expectedVersion: number): Promise<JevDetail> {
  const res = await authFetchMutate(`/accounting/jev/${id}/post`, 'POST', { expectedVersion });
  return res.json();
}

export async function voidJev(
  id: string,
  data: { expectedVersion: number; voidReason: string },
): Promise<JevDetail> {
  const res = await authFetchMutate(`/accounting/jev/${id}/void`, 'POST', data);
  return res.json();
}

export async function reverseJev(
  id: string,
  data: { expectedVersion: number; reason?: string; reversalDate?: string },
): Promise<JevDetail> {
  const res = await authFetchMutate(`/accounting/jev/${id}/reverse`, 'POST', data);
  return res.json();
}

// ── Accounting Dashboard ──

export async function getAccountingDashboard(
  fiscalYearId?: string,
): Promise<AccountingDashboardResult> {
  const qs = fiscalYearId ? `?fiscalYearId=${fiscalYearId}` : '';
  const res = await authFetch(`/accounting/dashboard${qs}`);
  return res.json();
}

export async function getJevsBySource(
  sourceTable: string,
  sourceId: string,
): Promise<
  Array<{
    id: string;
    jevNumber: string;
    status: string;
    totalDebit: string;
    totalCredit: string;
    sourceType: string;
    createdAt: string;
  }>
> {
  const res = await authFetch(`/accounting/jev/by-source/${sourceTable}/${sourceId}`);
  return res.json();
}

// ── GL / Trial Balance / Subsidiary Ledger ──

export async function getTrialBalance(params?: string): Promise<TrialBalanceRow[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/gl/trial-balance${qs}`);
  return res.json();
}

export async function getGeneralLedger(params?: string): Promise<GeneralLedgerRow[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/gl/general-ledger${qs}`);
  return res.json();
}

export async function getSubsidiaryLedger(
  accountId: string,
  params?: string,
): Promise<SubsidiaryLedgerResult> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/gl/subsidiary/${accountId}${qs}`);
  return res.json();
}

export async function getGlFiscalYears(): Promise<FiscalYearOption[]> {
  const res = await authFetch('/accounting/gl/fiscal-years');
  return res.json();
}

export async function getGlPeriods(fiscalYearId: string): Promise<PeriodOption[]> {
  const res = await authFetch(`/accounting/gl/periods/${fiscalYearId}`);
  return res.json();
}

// ── Check Register ──

export async function getChecks(params?: string): Promise<CheckListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/checks${qs}`);
  return res.json();
}

export async function getCheck(id: string): Promise<CheckDetail> {
  const res = await authFetch(`/accounting/checks/${id}`);
  return res.json();
}

// Cashier assigns the physical check number to a pending check and prints it.
export async function printCheck(
  id: string,
  data: {
    checkNumber: string;
    checkDate?: string;
  },
): Promise<CheckDetail> {
  const res = await authFetchMutate(`/accounting/checks/${id}/print`, 'POST', data);
  return res.json();
}

// Cashier records the forward lifecycle (release, clearing). Void/spoil are not
// allowed here — see voidCheck (approver-only).
export async function transitionCheck(
  id: string,
  data: {
    expectedVersion: number;
    toStatus: 'released' | 'cleared' | 'stale_dated';
    clearedDate?: string;
  },
): Promise<CheckDetail> {
  const res = await authFetchMutate(`/accounting/checks/${id}/transition`, 'POST', data);
  return res.json();
}

// Approver-only (General Manager): void or spoil a check. The server enforces
// that the voider is not the person who prepared/printed/released it.
export async function voidCheck(
  id: string,
  data: {
    expectedVersion: number;
    toStatus: 'voided' | 'spoiled';
    remarks: string;
  },
): Promise<CheckDetail> {
  const res = await authFetchMutate(`/accounting/checks/${id}/void`, 'POST', data);
  return res.json();
}

// ── Bank Reconciliation ──

export async function getReconciliations(params?: string): Promise<BankReconciliationListItem[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/reconciliations${qs}`);
  return res.json();
}

export async function getReconciliation(id: string): Promise<BankReconciliationDetail> {
  const res = await authFetch(`/accounting/reconciliations/${id}`);
  return res.json();
}

export async function createReconciliation(data: {
  bankAccountId: string;
  accountingPeriodId: string;
  reconciliationDate: string;
  bookBalance: number;
  bankBalance: number;
}): Promise<BankReconciliationDetail> {
  const res = await authFetchMutate('/accounting/reconciliations', 'POST', data);
  return res.json();
}

export async function addReconItem(
  reconId: string,
  data: {
    expectedVersion: number;
    itemType: string;
    referenceNumber?: string;
    referenceDate: string;
    amount: number;
    description: string;
    checkId?: string;
  },
): Promise<BankReconciliationDetail> {
  const res = await authFetchMutate(`/accounting/reconciliations/${reconId}/items`, 'POST', data);
  return res.json();
}

export async function deleteReconciliation(
  id: string,
): Promise<{ deleted: boolean; unmatchedBookLines: number }> {
  const res = await authFetchMutate(`/accounting/reconciliations/${id}`, 'DELETE');
  return res.json();
}

export async function completeReconciliation(
  id: string,
  expectedVersion: number,
): Promise<BankReconciliationDetail> {
  const res = await authFetchMutate(`/accounting/reconciliations/${id}/complete`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function approveReconciliation(
  id: string,
  expectedVersion: number,
): Promise<BankReconciliationDetail> {
  const res = await authFetchMutate(`/accounting/reconciliations/${id}/approve`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

// ── Match-and-clear reconciliation ──

export interface MatchView {
  recon: {
    id: string;
    status: string;
    version: number;
    reconciliationDate: string;
    organizationName: string;
    bookBalance: number;
    bankBalance: number;
    bankAccount: { id: string; label: string; hasCashAccount: boolean };
    periodName: string;
  };
  bank: Array<{
    id: string;
    transactionDate: string;
    description: string;
    referenceNumber: string | null;
    amount: number;
    matched: boolean;
    matchGroupId: string | null;
  }>;
  book: Array<{
    jevLineId: string;
    jevNumber: string;
    jevDate: string;
    description: string;
    amount: number;
    matched: boolean;
    matchGroupId: string | null;
  }>;
  summary: {
    unmatchedBank: number;
    unmatchedBook: number;
    matched: number;
    unmatchedBankAmount: number;
    unmatchedBookAmount: number;
    adjustedBook: number;
    adjustedBank: number;
    difference: number;
    reconciled: boolean;
  };
}

export async function getMatchView(reconId: string): Promise<MatchView> {
  const res = await authFetch(`/accounting/reconciliations/${reconId}/match`);
  return res.json();
}

export async function getGlCashBalance(
  bankAccountId: string,
  asOfDate: string,
  accountingPeriodId: string,
): Promise<{ bookBalance: number; hasCashAccount: boolean }> {
  const qs = new URLSearchParams({ bankAccountId, asOfDate, accountingPeriodId }).toString();
  const res = await authFetch(`/accounting/reconciliations/gl-balance?${qs}`);
  return res.json();
}

export async function importBankStatement(
  reconId: string,
  data: {
    expectedVersion: number;
    lines: Array<{
      transactionDate: string;
      description: string;
      amount: number;
      referenceNumber?: string;
    }>;
  },
): Promise<MatchView> {
  const res = await authFetchMutate(`/accounting/reconciliations/${reconId}/import`, 'POST', data);
  return res.json();
}

export async function matchLines(
  reconId: string,
  data: { statementLineIds: string[]; jevLineIds: string[] },
): Promise<MatchView> {
  const res = await authFetchMutate(`/accounting/reconciliations/${reconId}/match`, 'POST', data);
  return res.json();
}

export async function autoMatchBankLines(reconId: string): Promise<MatchView> {
  const res = await authFetchMutate(`/accounting/reconciliations/${reconId}/auto-match`, 'POST');
  return res.json();
}

export async function unmatchGroup(reconId: string, matchGroupId: string): Promise<MatchView> {
  const res = await authFetchMutate(`/accounting/reconciliations/${reconId}/unmatch`, 'POST', {
    matchGroupId,
  });
  return res.json();
}

export async function createEntryFromBankLine(
  reconId: string,
  data: { statementLineId: string; accountId: string; description?: string },
): Promise<MatchView> {
  const res = await authFetchMutate(
    `/accounting/reconciliations/${reconId}/create-entry`,
    'POST',
    data,
  );
  return res.json();
}

export interface ReconAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
  uploader?: { username: string } | null;
}

export async function getReconAttachments(reconId: string): Promise<ReconAttachment[]> {
  const res = await authFetch(`/accounting/reconciliations/${reconId}/attachments`);
  return res.json();
}

export async function uploadReconAttachment(reconId: string, file: File): Promise<ReconAttachment> {
  const token = getAccessToken();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE_URL}/accounting/reconciliations/${reconId}/attachments`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: fd,
  });
  if (!res.ok) {
    throw new AccountingApiError(await extractErrorMessage(res, 'Upload failed.'), res.status);
  }
  return res.json();
}

export async function downloadReconAttachment(
  reconId: string,
  attId: string,
  fileName: string,
): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(
    `${API_BASE_URL}/accounting/reconciliations/${reconId}/attachments/${attId}/download`,
    { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
  );
  if (!res.ok) throw new AccountingApiError('Download failed.', res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Period Management ──

export async function getPeriodFiscalYears(): Promise<FiscalYearDetail[]> {
  const res = await authFetch('/accounting/periods/fiscal-years');
  return res.json();
}

export async function createFiscalYear(data: {
  year: number;
  name: string;
  startDate: string;
  endDate: string;
}): Promise<FiscalYearDetail> {
  const res = await authFetchMutate('/accounting/periods/fiscal-years', 'POST', data);
  return res.json();
}

export async function closeFiscalYear(
  id: string,
  expectedVersion: number,
): Promise<FiscalYearDetail> {
  const res = await authFetchMutate(`/accounting/periods/fiscal-years/${id}/close`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function getPeriodList(fiscalYearId: string): Promise<PeriodDetail[]> {
  const res = await authFetch(`/accounting/periods/${fiscalYearId}`);
  return res.json();
}

export async function lockPeriod(id: string, expectedVersion: number): Promise<PeriodDetail> {
  const res = await authFetchMutate(`/accounting/periods/${id}/lock`, 'POST', { expectedVersion });
  return res.json();
}

export async function unlockPeriod(id: string, expectedVersion: number): Promise<PeriodDetail> {
  const res = await authFetchMutate(`/accounting/periods/${id}/unlock`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

export async function closePeriod(id: string, expectedVersion: number): Promise<PeriodDetail> {
  const res = await authFetchMutate(`/accounting/periods/${id}/close`, 'POST', { expectedVersion });
  return res.json();
}

export async function reopenPeriod(id: string, expectedVersion: number): Promise<PeriodDetail> {
  const res = await authFetchMutate(`/accounting/periods/${id}/reopen`, 'POST', {
    expectedVersion,
  });
  return res.json();
}

// ── Financial Statements ──

export async function getFinancialStatements(params?: string): Promise<FinancialStatementResult> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/financial-statements${qs}`);
  return res.json();
}

/** Detailed COA Statement of Financial Position (as-of month-end vs prior year). */
export async function getDetailedSfp(params?: string): Promise<DetailedStatement> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/financial-statements/sfp${qs}`);
  return res.json();
}

/** Detailed COA Statement of Comprehensive Income (Current Month vs Year-to-Date). */
export async function getDetailedSci(params?: string): Promise<DetailedStatement> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/financial-statements/sci${qs}`);
  return res.json();
}

/** Direct-method Statement of Cash Flows (Current Month vs Year-to-Date). */
export async function getDetailedScf(params?: string): Promise<DetailedStatement> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/financial-statements/scf${qs}`);
  return res.json();
}

/** Year-end Statement of Changes in Equity. */
export async function getChangesInEquity(params?: string): Promise<ChangesInEquityResult> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/financial-statements/sce${qs}`);
  return res.json();
}

// ── Disbursement Vouchers ──

export async function getDisbursements(params?: string): Promise<DisbursementSummary[]> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/disbursements${qs}`);
  return res.json();
}

export async function getDisbursement(id: string): Promise<DisbursementDetail> {
  const res = await authFetch(`/accounting/disbursements/${id}`);
  return res.json();
}

export interface Bir2307Line {
  accountCode: string;
  accountName: string;
  description: string;
  amount: number;
}

export interface Bir2307Data {
  dvNumber: string;
  dvDate: string;
  particulars: string;
  incomePayment: number;
  taxWithheld: number;
  net: number;
  jevNumber: string | null;
  payee: { name: string; tin: string; address: string };
  payor: { name: string; tin: string; address: string };
  incomeLines: Bir2307Line[];
  withholdingLines: Bir2307Line[];
}

/** Prefill data for BIR Form 2307 assembled from a disbursement voucher. */
export async function getBir2307(id: string): Promise<Bir2307Data> {
  const res = await authFetch(`/accounting/disbursements/${id}/bir-2307`);
  return res.json();
}

export async function createDisbursement(
  input: CreateDisbursementInput,
): Promise<DisbursementDetail> {
  const res = await authFetchMutate('/accounting/disbursements', 'POST', input);
  return res.json();
}

export async function postDisbursement(id: string): Promise<DisbursementDetail> {
  const res = await authFetchMutate(`/accounting/disbursements/${id}/post`, 'POST');
  return res.json();
}

export async function updateDisbursement(
  id: string,
  input: CreateDisbursementInput,
): Promise<DisbursementDetail> {
  const res = await authFetchMutate(`/accounting/disbursements/${id}`, 'PATCH', input);
  return res.json();
}

export async function deleteDisbursement(id: string): Promise<{ deleted: boolean }> {
  const res = await authFetchMutate(`/accounting/disbursements/${id}`, 'DELETE');
  return res.json();
}

// ── Loans & Amortization ──

export interface LoanSummary {
  id: string;
  name: string;
  loanType: string;
  principal: number;
  status: string;
  annualRatePct: number | null;
  termPeriods: number | null;
  paid: number;
  total: number;
}

export interface LoanAmortizationLine {
  id: string;
  seq: number;
  dueDate: string;
  beginningBalance: number;
  payment: number;
  interest: number;
  principal: number;
  endingBalance: number;
  paidManual: boolean;
  status: 'paid' | 'for_payment' | 'overdue' | 'upcoming';
  dvId: string | null;
  dvNumber: string | null;
}

export interface LoanDetail {
  id: string;
  name: string;
  loanType: string;
  principal: number;
  annualRatePct: number | null;
  termPeriods: number | null;
  frequency: string | null;
  method: string | null;
  startDate: string | null;
  firstPaymentDate: string | null;
  status: string;
  drawdownJevId: string | null;
  remarks: string | null;
  version: number;
  accounts: { loansPayable: string; interestExpense: string; bank: string };
  amortizations: LoanAmortizationLine[];
}

export interface CreateLoanInput {
  loanType: 'new' | 'existing';
  name: string;
  principal: number;
  loansPayableAccountId: string;
  interestExpenseAccountId: string;
  bankAccountId: string;
  remarks?: string;
  annualRatePct?: number;
  termPeriods?: number;
  frequency?: string;
  method?: string;
  startDate?: string;
  firstPaymentDate?: string;
  schedule?: Array<{
    seq: number;
    dueDate: string;
    beginningBalance: number;
    payment: number;
    interest: number;
    principal: number;
    endingBalance: number;
  }>;
}

export async function getLoans(): Promise<LoanSummary[]> {
  const res = await authFetch('/accounting/loans');
  return res.json();
}
export async function getLoan(id: string): Promise<LoanDetail> {
  const res = await authFetch(`/accounting/loans/${id}`);
  return res.json();
}
export async function createLoan(input: CreateLoanInput): Promise<LoanDetail> {
  const res = await authFetchMutate('/accounting/loans', 'POST', input);
  return res.json();
}
export async function postLoan(id: string): Promise<LoanDetail> {
  const res = await authFetchMutate(`/accounting/loans/${id}/post`, 'POST');
  return res.json();
}
export async function createLoanLineDv(
  loanId: string,
  amId: string,
  dvDate?: string,
): Promise<LoanDetail> {
  const res = await authFetchMutate(
    `/accounting/loans/${loanId}/amortizations/${amId}/dv`,
    'POST',
    dvDate ? { dvDate } : {},
  );
  return res.json();
}
export async function markLoanLinePaid(
  loanId: string,
  amId: string,
  paid: boolean,
): Promise<LoanDetail> {
  const res = await authFetchMutate(
    `/accounting/loans/${loanId}/amortizations/${amId}/mark-paid`,
    'POST',
    { paid },
  );
  return res.json();
}
export async function deleteLoan(id: string): Promise<{ deleted: boolean }> {
  const res = await authFetchMutate(`/accounting/loans/${id}`, 'DELETE');
  return res.json();
}

// ── Accounts-Payable Aging ──
export async function getApAging(): Promise<ApAgingResult> {
  const res = await authFetch('/accounting/reports/ap-aging');
  return res.json();
}

export async function getCashActivity(params?: string): Promise<CashActivityResult> {
  const qs = params ? `?${params}` : '';
  const res = await authFetch(`/accounting/reports/cash-activity${qs}`);
  return res.json();
}

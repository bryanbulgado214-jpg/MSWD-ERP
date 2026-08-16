export interface ChartOfAccount {
  id: string;
  accountCode: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  level: number;
  isHeader: boolean;
  isActive: boolean;
  uacsCode: string | null;
  parentAccountId: string | null;
  parentAccount?: { id: string; accountCode: string; name: string } | null;
  childAccounts?: { id: string; accountCode: string; name: string; isActive: boolean }[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CoaImportRow {
  rowNumber: number;
  accountCode: string;
  name: string;
  accountType: string;
  normalBalance: string;
  level: number;
  isHeader: boolean;
  parentCode: string;
  uacsCode: string;
  action: 'create' | 'update' | 'error';
  errors: string[];
}

export interface CoaImportPreviewResult {
  rows: CoaImportRow[];
  summary: { total: number; toCreate: number; toUpdate: number; errors: number };
}

export interface CoaImportConfirmResult {
  created: number;
  updated: number;
}

export interface Bank {
  id: string;
  code: string;
  name: string;
  branch: string | null;
  swiftCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { bankAccounts: number };
}

export interface BankAccount {
  id: string;
  accountNumber: string;
  accountName: string;
  accountType: 'checking' | 'savings' | 'trust';
  currentBalance: string;
  status: 'active' | 'inactive' | 'closed';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  bank: { id: string; code: string; name: string };
  fundSource: { id: string; code: string; name: string } | null;
  chartOfAccount: { id: string; accountCode: string; name: string } | null;
}

export interface AccountMapping {
  id: string;
  mappingKey: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  chartOfAccount: { id: string; accountCode: string; name: string; accountType: string };
}

export interface JevLine {
  id: string;
  debitAmount: string;
  creditAmount: string;
  description: string | null;
  chartOfAccount: { id: string; accountCode: string; name: string; accountType: string };
}

export interface JevListItem {
  id: string;
  jevNumber: string;
  jevDate: string;
  sourceType: string;
  particulars: string;
  totalDebit: string;
  totalCredit: string;
  status: 'draft' | 'for_review' | 'approved' | 'posted' | 'voided' | 'reversed';
  createdAt: string;
  updatedAt: string;
  version: number;
  accountingPeriod: { id: string; name: string; periodNumber: number };
  responsibilityCenter: { id: string; code: string; name: string } | null;
  fundSource: { id: string; code: string; name: string } | null;
  creator: { id: string; username: string } | null;
  reviewer: { id: string; username: string } | null;
  poster: { id: string; username: string } | null;
  voider: { id: string; username: string } | null;
}

export interface JevRef {
  id: string;
  jevNumber: string;
  status: string;
  jevDate: string;
}

export interface JevDetail extends JevListItem {
  reviewedAt: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  sourceTable: string | null;
  sourceId: string | null;
  createdBy: string | null;
  reversalOfId: string | null;
  reversalOf: JevRef | null;
  reversedBy: JevRef | null;
  lines: JevLine[];
}

export interface AccountingPeriod {
  id: string;
  name: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
}

// ── GL / Trial Balance / Subsidiary Ledger ──

export interface FiscalYearOption {
  id: string;
  year: number;
  name: string;
  status: string;
}

export interface PeriodOption {
  id: string;
  name: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
  status: string;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  level: number;
  isHeader: boolean;
  totalDebit: string;
  totalCredit: string;
  balance: string;
}

export interface GeneralLedgerRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  periodId: string;
  periodName: string;
  periodNumber: number;
  totalDebit: string;
  totalCredit: string;
  balance: string;
}

export interface SubsidiaryLedgerEntry {
  jevLineId: string;
  jevId: string;
  jevNumber: string;
  jevDate: string;
  particulars: string;
  sourceType: string;
  debitAmount: string;
  creditAmount: string;
  periodName: string;
}

export interface SubsidiaryLedgerResult {
  account: {
    id: string;
    accountCode: string;
    name: string;
    accountType: string;
    normalBalance: string;
  };
  entries: SubsidiaryLedgerEntry[];
}

// ── Check Register ──

export interface CheckListItem {
  id: string;
  checkNumber: string | null;
  checkDate: string;
  amount: string;
  payeeName: string;
  status: string;
  clearedDate: string | null;
  voidReason: string | null;
  createdAt: string;
  version: number;
  bankAccount: {
    id: string;
    accountNumber: string;
    accountName: string;
    bank: { code: string; name: string };
  };
  disbursementVoucher: { id: string; dvNumber: string; status: string; dvDate: string } | null;
  releaser: { username: string } | null;
  voider: { username: string } | null;
  creator: { username: string } | null;
}

export interface CheckDetail extends CheckListItem {
  releasedAt: string | null;
  voidedAt: string | null;
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedAt: string;
    remarks: string | null;
    changer: { username: string };
  }>;
}

// ── Bank Reconciliation ──

export interface BankReconciliationListItem {
  id: string;
  reconciliationDate: string;
  bookBalance: string;
  bankBalance: string;
  adjustedBookBalance: string;
  adjustedBankBalance: string;
  difference: string;
  status: string;
  createdAt: string;
  version: number;
  bankAccount: {
    id: string;
    accountNumber: string;
    accountName: string;
    bank: { code: string; name: string };
  };
  accountingPeriod: { id: string; name: string; periodNumber: number };
  preparer: { username: string } | null;
  approver: { username: string } | null;
  approvedAt: string | null;
}

// ── Period Management ──

export interface FiscalYearDetail {
  id: string;
  year: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  closedAt: string | null;
  closer: { username: string } | null;
  createdAt: string;
  version: number;
  _count: { accountingPeriods: number };
}

export interface PeriodDetail {
  id: string;
  periodNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  lockedAt: string | null;
  locker: { username: string } | null;
  createdAt: string;
  version: number;
  _count: { journalEntryVouchers: number };
}

// ── Financial Statements ──

export interface FinancialStatementRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  level: number;
  parentAccountId: string | null;
  isHeader: boolean;
  totalDebit: string;
  totalCredit: string;
  balance: string;
}

export interface FinancialStatementResult {
  asOfDate: string;
  periodName: string;
  rows: FinancialStatementRow[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  totalRevenue: string;
  totalExpenses: string;
  netIncome: string;
}

// ── Detailed COA statements (SFP / SCI) — current + comparative columns ──
export interface DetailedStatementRow {
  code: string | null;
  label: string;
  level: number;
  kind: 'section' | 'header' | 'account' | 'total' | 'grand_total' | 'spacer';
  current: number;
  compare: number;
}

export interface DetailedStatement {
  kind: 'sfp' | 'sci' | 'scf';
  title: string;
  organizationName: string;
  headingPeriod: string;
  currentLabel: string;
  compareLabel: string;
  fiscalYear: { id: string; name: string };
  period: { id: string; name: string; periodNumber: number };
  rows: DetailedStatementRow[];
  totals: Record<string, number>;
  preparedBy: string;
  notedBy: string;
}

export interface SceRow {
  label: string;
  level: number;
  kind: 'header' | 'account' | 'total' | 'spacer';
  values: number[];
}

export interface ChangesInEquityResult {
  title: string;
  organizationName: string;
  headingPeriod: string;
  columns: string[];
  fiscalYear: { id: string; name: string };
  rows: SceRow[];
  preparedBy: string;
  notedBy: string;
}

export interface CashActivityAccount {
  code: string;
  name: string;
  opening: number;
  receipts: number;
  disbursements: number;
  closing: number;
}

export interface CashActivityResult {
  fiscalYear: { id: string; name: string };
  period: { id: string; name: string; periodNumber: number };
  accounts: CashActivityAccount[];
  totals: { opening: number; receipts: number; disbursements: number; closing: number };
}

export interface BankReconciliationDetail extends BankReconciliationListItem {
  items: Array<{
    id: string;
    itemType: string;
    referenceNumber: string | null;
    referenceDate: string;
    amount: string;
    description: string;
    checkId: string | null;
    check: { id: string; checkNumber: string; payeeName: string; status: string } | null;
    createdAt: string;
  }>;
}

export interface AccountingDashboardResult {
  fiscalYear: { id: string; year: number; name: string };
  asOf: string;
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  cash: string;
  cashAccountId: string | null;
  receivables: string;
  receivablesAccountId: string | null;
  revenueYtd: string;
  expensesYtd: string;
  netSurplus: string;
  counts: {
    draft: number;
    forReview: number;
    approved: number;
    posted: number;
    reversed: number;
    voided: number;
  };
}

// ── Disbursement Vouchers (Accounting register) ──

export interface DisbursementSummary {
  id: string;
  dvNumber: string;
  dvDate: string;
  dvType: string;
  particulars: string;
  grossAmount: string;
  netAmount: string;
  status: string;
  /** Latest issued check's status (cashier's payment lifecycle), or null if no check yet. */
  checkStatus: string | null;
  /** Timestamp of the action behind the current check status (printed/released/cleared/voided). */
  checkStatusDate: string | null;
  payeeName: string | null;
  supplier: { name: string } | null;
}

export interface DisbursementDetail {
  id: string;
  dvNumber: string;
  dvDate: string;
  dvType: string;
  particulars: string;
  paymentMode: string;
  grossAmount: string;
  taxAmount: string;
  otherDeductions: string;
  netAmount: string;
  accountCode: string | null;
  checkNumber: string | null;
  checkDate: string | null;
  bankName: string | null;
  status: string;
  version: number;
  certifiedAt: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  payeeName: string | null;
  payeeTin: string | null;
  payeeAddress: string | null;
  ors: { id: string; orsNumber: string; originalAmount: string; status: string } | null;
  purchaseRequest: { id: string; prNumber: string; title: string; status: string } | null;
  purchaseOrder: {
    id: string;
    poNumber: string;
    contractAmount: string;
    supplier: { id: string; name: string };
  } | null;
  supplier: { id: string; name: string; tin: string | null; address: string | null } | null;
  inspectionReport: { id: string; reportNumber: string; overallResult: string } | null;
  fundSource: { id: string; code: string; name: string } | null;
  responsibilityCenter: { id: string; code: string; name: string } | null;
  certifier: { id: string; username: string } | null;
  approver: { id: string; username: string } | null;
  releaser: { id: string; username: string } | null;
  creator: { id: string; username: string } | null;
  journalEntry: {
    id: string;
    jevNumber: string;
    jevDate: string;
    status: string;
    lines: Array<{
      debitAmount: string;
      creditAmount: string;
      description: string | null;
      chartOfAccount: { accountCode: string; name: string };
    }>;
  } | null;
}

export interface CreateDisbursementLineInput {
  chartOfAccountId: string;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

export interface CreateDisbursementInput {
  dvType: string;
  dvDate: string;
  payeeName: string;
  payeeTin?: string;
  payeeAddress?: string;
  particulars: string;
  paymentMode?: string;
  checkNumber?: string;
  checkDate?: string;
  // The paying bank account; its Cash-in-Bank ledger account is auto-credited.
  bankAccountId: string;
  fundSourceId?: string;
  // Save without posting to the GL (held as a draft JEV).
  asDraft?: boolean;
  // Charge/deduction lines only — the cash credit is added from the bank account.
  lines: CreateDisbursementLineInput[];
}

// ── Accounts-Payable Aging report ──
export interface ApAgingBracket {
  key: string;
  label: string;
  total: number;
  count: number;
}
export interface ApAgingRow {
  dvNumber: string;
  dvDate: string;
  payee: string;
  amount: string;
  ageDays: number;
  bracket: string;
}
export interface ApAgingResult {
  asOf: string;
  total: number;
  brackets: ApAgingBracket[];
  rows: ApAgingRow[];
}

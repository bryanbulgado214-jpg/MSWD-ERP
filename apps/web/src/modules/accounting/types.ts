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
  status: 'draft' | 'for_review' | 'posted' | 'voided';
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

export interface JevDetail extends JevListItem {
  reviewedAt: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  sourceTable: string | null;
  sourceId: string | null;
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
  checkNumber: string;
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
  disbursementVoucher: { id: string; dvNumber: string } | null;
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

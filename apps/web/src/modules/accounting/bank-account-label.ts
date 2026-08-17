/**
 * One consistent bank-account label used across every picker so it always
 * matches the Bank Accounts tab: the exact account name, the account number,
 * and the linked GL code.
 */
export function bankAccountLabel(a: {
  accountName: string;
  accountNumber: string;
  bank?: { code?: string; name?: string } | null;
  chartOfAccount?: { accountCode: string } | null;
}): string {
  const gl = a.chartOfAccount ? ` — GL ${a.chartOfAccount.accountCode}` : '';
  return `${a.accountName} — ${a.accountNumber}${gl}`;
}

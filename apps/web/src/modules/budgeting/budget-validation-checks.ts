import type { BudgetAmountSummary, BudgetLineItem } from './types';

export interface ValidationWarning {
  label: string;
  detail: string;
}

export function checkBudgetValidation(
  lines: BudgetLineItem[],
  summary: BudgetAmountSummary,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (lines.length === 0) {
    warnings.push({
      label: 'No budget lines',
      detail: 'At least one budget line is required before this budget can be submitted.',
    });
  }

  const toCents = (s: string) => {
    const parts = s.split('.');
    return parseInt(parts[0] ?? '0', 10) * 100 + parseInt((parts[1] ?? '0').padEnd(2, '0').slice(0, 2), 10);
  };
  const lineTotal = lines.reduce((sum, l) => sum + toCents(l.amount), 0);
  const approvedCents = toCents(summary.approvedAmount);

  if (lineTotal !== approvedCents) {
    warnings.push({
      label: 'Line total mismatch',
      detail: `Budget lines total does not match the approved amount. Lines sum to ${(lineTotal / 100).toFixed(2)} but approved amount is ${summary.approvedAmount}.`,
    });
  }

  const duplicateCodes = lines
    .map((l) => l.accountCode)
    .filter((code, i, arr) => arr.indexOf(code) !== i);
  if (duplicateCodes.length > 0) {
    warnings.push({
      label: 'Duplicate account codes',
      detail: `The following account codes appear more than once: ${[...new Set(duplicateCodes)].join(', ')}.`,
    });
  }

  return warnings;
}

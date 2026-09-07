// Shared status labels and status-date logic for the DV register, the DV detail
// view, and the Check register — so a check's status (and the date it entered
// that status) reads the same everywhere, for every kind of user.

export const STATUS_LABELS: Record<string, string> = {
  // DV lifecycle (accountant / procurement side)
  draft: 'Draft',
  for_certification: 'For Certification',
  certified: 'Certified',
  for_approval: 'For Approval',
  approved: 'Approved',
  released: 'Released',
  cancelled: 'Cancelled',
  // Check lifecycle (cashier side) — shown once a check has been issued so the
  // DV register mirrors the cashier's Check Register.
  pending: 'Pending (for printing)',
  assigned: 'Assigned',
  printed: 'Printed',
  cleared: 'Cleared',
  stale_dated: 'Stale-dated',
  spoiled: 'Spoiled',
  voided: 'Voided',
};

export function statusLabel(status: string, opts?: { isAda?: boolean }): string {
  // An ADA (Advice to Debit Account) has no printed check and no cashier
  // print/release step — the bank debits the account directly. So any state
  // before it reflects in the passbook reads "For Clearing", never
  // "Pending (for printing)" or "Released".
  if (opts?.isAda) {
    if (status === 'cleared') return 'Cleared';
    if (status === 'voided') return 'Voided';
    if (status === 'spoiled') return 'Spoiled';
    if (status === 'stale_dated') return 'Stale-dated';
    return 'For Clearing';
  }
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

/** The date of the action that put a check into its current status. */
export function checkStatusDate(c: {
  status: string;
  printedAt?: string | null;
  releasedAt?: string | null;
  clearedDate?: string | null;
  voidedAt?: string | null;
}): string | null {
  switch (c.status) {
    case 'cleared':
      return c.clearedDate ?? null;
    case 'released':
      return c.releasedAt ?? null;
    case 'printed':
      return c.printedAt ?? null;
    case 'voided':
    case 'spoiled':
      return c.voidedAt ?? null;
    default:
      return null;
  }
}

export function formatStatusDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-PH');
}

/**
 * Admin-configured signatories for printed documents.
 *
 * The admin sets a name + designation for each signature slot of each document
 * (Admin → Signatories). The config is delivered to every user via `/auth/me`
 * (see `useAuth().organization.signatories`) and read by the print views, the
 * same channel the letterhead uses.
 *
 * Rule everywhere: when a slot is configured, its name/title print; when it is
 * left blank, the document keeps its previous behavior (the workflow actor's
 * name, the hard-coded title, or a blank line). So the feature changes nothing
 * until the admin fills it in.
 */

export interface Signatory {
  name: string;
  title: string;
}
/** Keyed by document (e.g. "jev") then slot (e.g. "preparedBy"). */
export type SignatoryMap = Record<string, Record<string, Signatory>>;

export interface SignatorySlot {
  key: string;
  /** Shown as the field label on the admin page. */
  label: string;
  /** The document's existing hard-coded designation — used when the admin
   * leaves the title blank, and pre-filled as a hint on the admin page. */
  defaultTitle: string;
}
export interface SignatoryDoc {
  key: string;
  label: string;
  /** A short note under the document heading on the admin page. */
  note?: string;
  slots: SignatorySlot[];
}

/**
 * The documents currently printed on the live system, and their signature
 * slots. Keys here must match what the print views look up.
 */
export const SIGNATORY_DOCS: SignatoryDoc[] = [
  {
    key: 'jev',
    label: 'Journal Entry Voucher (JEV)',
    slots: [
      { key: 'preparedBy', label: 'Prepared by', defaultTitle: 'Accounting Personnel' },
      {
        key: 'certifiedBy',
        label: 'Certified Correct',
        defaultTitle: 'Head, Accounting Division/Unit',
      },
    ],
  },
  {
    key: 'dv',
    label: 'Disbursement Voucher (DV)',
    slots: [
      {
        key: 'boxA',
        label: 'Box A — Certified (Head of Office)',
        defaultTitle: 'Head of Office / Supervisor',
      },
      {
        key: 'boxC',
        label: 'Box C — Certified: Funds available',
        defaultTitle: 'Head, Accounting Unit / Authorized Representative',
      },
      {
        key: 'boxD',
        label: 'Box D — Approved for Payment',
        defaultTitle: 'Agency Head / Authorized Representative',
      },
    ],
  },
  {
    key: 'check',
    label: 'Check',
    slots: [{ key: 'authorized', label: 'Authorized signatory', defaultTitle: '' }],
  },
  {
    key: 'financialStatements',
    label: 'Financial Statements',
    note: 'Balance Sheet, Income Statement, Cash Flows, Changes in Equity.',
    slots: [
      { key: 'preparedBy', label: 'Prepared by', defaultTitle: 'Accountant' },
      { key: 'notedBy', label: 'Noted by', defaultTitle: 'General Manager' },
    ],
  },
  {
    key: 'rci',
    label: 'Report of Checks Issued (RCI)',
    slots: [
      {
        key: 'disbursingOfficer',
        label: 'Disbursing Officer / Cashier',
        defaultTitle: 'Disbursing Officer',
      },
    ],
  },
  {
    key: 'cashierCollection',
    label: 'Cashier Collection Report',
    note: '"Prepared/Remitted by" always shows the actual cashier; set the accounting reviewer here.',
    slots: [{ key: 'reviewedBy', label: 'Reviewed by — Accounting', defaultTitle: 'Accounting' }],
  },
];

/**
 * Look up a configured signatory. Returns the raw {name, title} (either may be
 * empty) when the slot exists, or null when nothing is configured — callers
 * apply their own fallback for the empty parts.
 */
export function signatoryFor(
  map: SignatoryMap | undefined | null,
  doc: string,
  slot: string,
): Signatory | null {
  const s = map?.[doc]?.[slot];
  if (!s) return null;
  const name = typeof s.name === 'string' ? s.name : '';
  const title = typeof s.title === 'string' ? s.title : '';
  if (!name && !title) return null;
  return { name, title };
}

/**
 * Types of collection the cashier picks from (instead of a raw GL account).
 * Each standard type maps to a COA account via an AccountMapping (mappingKey),
 * which the accountant can change any time in Accounting → Account Mappings.
 * defaultGlCode is only the seeded default.
 *
 * The special "Other" type has no fixed GL: the cashier must describe it, and
 * the accountant assigns the correct account while reviewing the journal entry.
 * Until then it credits a temporary holding account (see COLLECTION_HOLDING_*)
 * and the JEV cannot be posted.
 */
export interface CollectionType {
  key: string;
  label: string;
  mappingKey: string | null;
  defaultGlCode: string | null;
  /** Cashier must type a description for this type (the "Other" catch-all). */
  requiresDescription?: boolean;
  /** GL is assigned by the accountant during review, not by a fixed mapping. */
  classifiedByAccountant?: boolean;
}

export const OTHER_COLLECTION_KEY = 'other';

/**
 * Temporary holding account an unclassified "Other" collection credits until the
 * accountant reclassifies it. Editable by the accountant in Account Mappings.
 */
export const COLLECTION_HOLDING_MAPPING_KEY = 'collection.unclassified';
export const COLLECTION_HOLDING_DEFAULT_GL = '2-99-99-990'; // Other Payables

export const COLLECTION_TYPES: CollectionType[] = [
  {
    key: 'water_sales',
    label: 'Water sales',
    mappingKey: 'collection.water_sales',
    defaultGlCode: '1-03-01-010', // Accounts Receivable
  },
  {
    key: 'new_connection',
    label: 'New connection fee',
    mappingKey: 'collection.new_connection',
    defaultGlCode: '3-01-01-030', // Contributed Capital
  },
  {
    key: 'reconnection',
    label: 'Reconnection fee',
    mappingKey: 'collection.reconnection',
    defaultGlCode: '4-06-03-990', // Miscellaneous Income
  },
  {
    key: 'relocation',
    label: 'Relocation fee',
    mappingKey: 'collection.relocation',
    defaultGlCode: '4-06-03-990', // Miscellaneous Income
  },
  {
    key: 'guaranty_deposit',
    label: 'Guaranty deposit',
    mappingKey: 'collection.guaranty_deposit',
    defaultGlCode: '2-04-01-040', // Guaranty/Security Deposits Payable
  },
  {
    key: OTHER_COLLECTION_KEY,
    label: 'Other (specify)',
    mappingKey: null,
    defaultGlCode: null,
    requiresDescription: true,
    classifiedByAccountant: true,
  },
];

export const collectionTypeByKey = new Map(COLLECTION_TYPES.map((t) => [t.key, t]));

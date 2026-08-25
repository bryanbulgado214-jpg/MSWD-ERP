/**
 * Types of collection the cashier picks from (instead of a raw GL account).
 * Each maps to a COA account via an AccountMapping (mappingKey), which the
 * accountant can change any time in Accounting → Account Mappings. defaultGlCode
 * is only the seeded default.
 */
export interface CollectionType {
  key: string;
  label: string;
  mappingKey: string;
  defaultGlCode: string;
}

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
];

export const collectionTypeByKey = new Map(COLLECTION_TYPES.map((t) => [t.key, t]));

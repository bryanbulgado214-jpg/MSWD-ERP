export type InventoryClassification = 'expendable' | 'semi_expendable' | 'ppe';
export type StockReceiptStatus = 'draft' | 'received' | 'cancelled';
export type RisStatus = 'draft' | 'submitted' | 'approved' | 'issued' | 'partially_issued' | 'cancelled';
export type AccountabilityType = 'par' | 'ics';
export type AccountabilityStatus = 'active' | 'returned' | 'transferred' | 'disposed' | 'lost';
export type PropertyCondition = 'brand_new' | 'serviceable' | 'unserviceable' | 'poor' | 'beyond_repair';
export type PhysicalCountStatus = 'draft' | 'in_progress' | 'completed' | 'approved';
export type CountType = 'semi_annual_supplies' | 'annual_ppe' | 'annual_semi_expendable' | 'spot_check';
export type DisposalStatus = 'draft' | 'for_appraisal' | 'appraised' | 'for_approval' | 'approved' | 'disposed' | 'cancelled';
export type DisposalMethod = 'public_auction' | 'negotiated_sale' | 'barter' | 'donation' | 'destruction' | 'transfer_to_agency';

export interface UserRef { username: string }
export interface UserRefWithId { id: string; username: string }

export interface InventoryItem {
  id: string;
  itemCode: string;
  description: string;
  unitOfMeasure: string;
  classification: InventoryClassification;
  category: string | null;
  accountCode: string | null;
  reorderPoint: string;
  unitCost: string;
  onHandQuantity: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  stockCard?: {
    id: string;
    balanceQuantity: string;
    balanceUnitCost: string;
    balanceTotalCost: string;
  };
}

export interface StockReceiptListItem {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  status: StockReceiptStatus;
  createdAt: string;
  purchaseOrder: { id: string; poNumber: string } | null;
  supplier: { id: string; name: string } | null;
  receiver: UserRef | null;
  items: { id: string }[];
}

export interface StockReceipt extends StockReceiptListItem {
  remarks: string | null;
  updatedAt: string;
  version: number;
  inspectionReport: { id: string; reportNumber: string } | null;
  creator: UserRef | null;
  items: {
    id: string;
    inventoryItem: { id: string; itemCode: string; description: string; unitOfMeasure: string };
    quantityReceived: string;
    unitCost: string;
    totalCost: string;
    lotNumber: string | null;
    expiryDate: string | null;
  }[];
}

export interface RisListItem {
  id: string;
  risNumber: string;
  risDate: string;
  purpose: string | null;
  status: RisStatus;
  createdAt: string;
  requestingDepartment: { id: string; name: string };
  requester: UserRef | null;
  items: { id: string }[];
}

export interface Ris extends RisListItem {
  remarks: string | null;
  updatedAt: string;
  version: number;
  approver: UserRef | null;
  issuer: UserRef | null;
  creator: UserRef | null;
  items: {
    id: string;
    inventoryItemId: string;
    stockNumber: string;
    description: string;
    unitOfMeasure: string;
    quantityRequested: string;
    quantityIssued: string;
    unitCost: string;
    remarks: string | null;
  }[];
}

export interface PropertyRecord {
  id: string;
  propertyNumber: string;
  serialNumber: string | null;
  description: string;
  dateAcquired: string;
  acquisitionCost: string;
  estimatedUsefulLife: number | null;
  salvageValue: string | null;
  monthlyDepreciation: string | null;
  accumulatedDepreciation: string;
  bookValue: string | null;
  condition: PropertyCondition;
  isDisposed: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  inventoryItem: { id: string; itemCode: string; description: string; classification: InventoryClassification };
  location: { id: string; name: string } | null;
  accountableUser: UserRefWithId | null;
}

export interface AccountabilityListItem {
  id: string;
  accountabilityType: AccountabilityType;
  accountabilityNumber: string;
  issuedDate: string;
  status: AccountabilityStatus;
  createdAt: string;
  issuedTo: UserRefWithId;
  items: { id: string }[];
}

export interface AccountabilityRecord extends AccountabilityListItem {
  returnDate: string | null;
  parRenewalDate: string | null;
  remarks: string | null;
  updatedAt: string;
  version: number;
  issuer: UserRef | null;
  creator: UserRef | null;
  items: {
    id: string;
    quantity: string;
    unitCost: string;
    totalCost: string;
    remarks: string | null;
    propertyRecord: {
      id: string;
      propertyNumber: string;
      description: string;
      serialNumber: string | null;
      condition: PropertyCondition;
    };
  }[];
}

export interface PhysicalCountListItem {
  id: string;
  countNumber: string;
  countDate: string;
  countType: CountType;
  status: PhysicalCountStatus;
  createdAt: string;
  counter: UserRef | null;
  items: { id: string }[];
}

export interface DisposalListItem {
  id: string;
  requestNumber: string;
  requestDate: string;
  status: DisposalStatus;
  disposalMethod: DisposalMethod | null;
  totalAppraised: string | null;
  createdAt: string;
  requester: UserRef | null;
  items: { id: string }[];
}

export interface InventorySummary {
  totalItems: number;
  expendable: InventoryItem[];
  semiExpendable: InventoryItem[];
  ppe: InventoryItem[];
  belowReorderPoint: InventoryItem[];
}

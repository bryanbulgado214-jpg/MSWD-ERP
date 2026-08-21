export type ItemClassification = 'inventory' | 'asset' | 'expense' | 'infrastructure' | 'service';

export interface PurchaseRequestItem {
  id: string;
  itemNumber: number;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  estimatedUnitCost: string;
  estimatedTotalCost: string;
  accountCode: string | null;
  technicalSpecification: string | null;
  classification: ItemClassification | null;
}

export type PurchaseRequestStatus =
  | 'draft'
  | 'submitted'
  | 'endorsed'
  | 'budget_review'
  | 'budget_certified'
  | 'approved'
  | 'procurement_review'
  | 'accepted_for_procurement'
  | 'procurement_in_progress'
  | 'awarded'
  | 'po_issued'
  | 'delivered'
  | 'inspected'
  | 'completed'
  | 'returned'
  | 'rejected'
  | 'cancelled'
  | 'voided';

export interface UserRef {
  id: string;
  username: string;
}

export interface PurchaseRequest {
  id: string;
  organizationId: string;
  prNumber: string;
  title: string;
  description: string | null;
  budgetReleaseId: string | null;
  totalAmount: string;
  status: PurchaseRequestStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  version: number;
  remarks: string | null;
  endorsedBy: string | null;
  endorsedAt: string | null;
  budgetCertifiedBy: string | null;
  budgetCertifiedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  items: PurchaseRequestItem[];
  budgetRelease?: {
    releaseNumber: string;
    availableAmount?: string;
    budgetHeader?: {
      id?: string;
      responsibilityCenter?: { id: string; code: string; name: string };
      fundSource?: { id: string; code: string; name: string };
    };
  };
  creator?: UserRef;
  endorser?: UserRef;
  budgetCertifier?: UserRef;
  approver?: UserRef;
  department?: { id: string; code: string; name: string };
  responsibilityCenter?: { id: string; code: string; name: string };
  fundSource?: { id: string; code: string; name: string };
  purpose?: string;
  ppmpItem?: { id: string; code: string; itemDescription: string };
  appItem?: { id: string; appNumber: string; procurementProjectTitle: string };
  requestedDeliveryDate?: string | null;
  departmentId?: string | null;
}

export interface CreatePurchaseRequestItemInput {
  description: string;
  quantity: number;
  unitOfMeasure: string;
  estimatedUnitCost: number;
  accountCode?: string;
  technicalSpecification?: string;
  classification?: ItemClassification;
}

export interface CreatePurchaseRequestInput {
  budgetReleaseId: string;
  title: string;
  description?: string;
  purpose?: string;
  departmentId?: string;
  requestedDeliveryDate?: string;
  ppmpItemId?: string;
  appItemId?: string;
  fiscalYearId?: string;
  items: CreatePurchaseRequestItemInput[];
}

export interface UpdatePurchaseRequestInput {
  expectedVersion: number;
  title?: string;
  description?: string;
  purpose?: string;
  departmentId?: string;
  requestedDeliveryDate?: string;
  budgetReleaseId?: string;
  ppmpItemId?: string;
  appItemId?: string;
  items?: CreatePurchaseRequestItemInput[];
}

// ── Supplier ──

export interface Supplier {
  id: string;
  name: string;
  tin: string | null;
  address: string | null;
  contactPerson: string | null;
  contactNumber: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ── Purchase Order ──

export type PurchaseOrderStatus =
  'draft' | 'pending_caf' | 'for_approval' | 'approved' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  poDate: string;
  contractAmount: string;
  awardDate: string | null;
  awardNoticeNumber: string | null;
  modeOfProcurement: string | null;
  deliveryTerms: string | null;
  paymentTerms: string | null;
  status: PurchaseOrderStatus;
  remarks: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  purchaseRequest: {
    id: string;
    prNumber: string;
    title: string;
    totalAmount: string;
    status: string;
  };
  supplier: { id: string; name: string; tin: string | null; address: string | null };
  approver?: UserRef;
  creator?: UserRef;
}

// ── CAF ──

export type CafStatus =
  'draft' | 'for_certification' | 'certified' | 'rejected' | 'cancelled' | 'superseded';

export interface Caf {
  id: string;
  cafNumber: string;
  certificationDate: string | null;
  accountCode: string | null;
  certifiedAmount: string;
  availableBefore: string;
  availableAfter: string;
  certifiedAt: string | null;
  status: CafStatus;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  purchaseRequest: {
    id: string;
    prNumber: string;
    title: string;
    totalAmount: string;
    status: string;
    department?: { id: string; code: string; name: string };
    creator?: UserRef;
  };
  purchaseOrder?: {
    id: string;
    poNumber: string;
    contractAmount: string;
    status: string;
    supplier?: { id: string; name: string; tin: string | null; address: string | null };
  };
  budgetRelease: {
    id: string;
    releaseNumber: string;
    releasedAmount: string;
    availableAmount: string;
    budgetHeader?: {
      id: string;
      totalAmount: string;
      responsibilityCenter?: { id: string; code: string; name: string };
      fundSource?: { id: string; code: string; name: string };
    };
  };
  budgetLine?: { id: string; accountCode: string; description: string | null; amount: string };
  fiscalYear: { id: string; year: number; name: string };
  fundSource: { id: string; code: string; name: string };
  responsibilityCenter: { id: string; code: string; name: string };
  certifier?: UserRef;
  creator?: UserRef;
}

// ── ORS ──

export type OrsStatus =
  | 'draft'
  | 'for_requesting_certification'
  | 'for_budget_certification'
  | 'obligated'
  | 'partially_payable'
  | 'partially_paid'
  | 'fully_paid'
  | 'adjusted'
  | 'cancelled'
  | 'closed';

export interface OrsChild {
  id: string;
  childType: string;
  referenceNumber: string | null;
  childDate: string;
  amount: string;
  description: string | null;
  status: string;
  remarks: string | null;
  createdAt: string;
  version: number;
  certifier?: UserRef;
  creator?: UserRef;
}

export interface OrsAdjustment {
  id: string;
  adjustmentType: string;
  signedAmount: string;
  reason: string;
  status: string;
  createdAt: string;
  approver?: UserRef;
  creator?: UserRef;
}

export interface Ors {
  id: string;
  orsNumber: string;
  orsDate: string;
  accountCode: string | null;
  originalAmount: string;
  adjustmentAmount: string;
  adjustedAmount: string;
  cumulativePayable: string;
  cumulativePaid: string;
  remainingUnpaid: string;
  deobligatedAmount: string;
  requestingOfficeCertifiedAt: string | null;
  budgetCertifiedAt: string | null;
  obligationPostingDate: string | null;
  status: OrsStatus;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  caf: { id: string; cafNumber: string; certifiedAmount: string; status: string };
  purchaseRequest: { id: string; prNumber: string; title: string; totalAmount: string };
  purchaseOrder?: {
    id: string;
    poNumber: string;
    contractAmount: string;
    supplier?: { id: string; name: string; tin: string | null; address: string | null };
  };
  supplier?: { id: string; name: string; tin: string | null; address: string | null };
  budgetRelease: {
    id: string;
    releaseNumber: string;
    budgetHeader?: {
      responsibilityCenter?: { id: string; code: string; name: string };
      fundSource?: { id: string; code: string; name: string };
    };
  };
  budgetLine?: { id: string; accountCode: string; description: string | null };
  fundSource: { id: string; code: string; name: string };
  responsibilityCenter: { id: string; code: string; name: string };
  requestingOffice?: { id: string; code: string; name: string };
  requestingOfficeCertifier?: UserRef;
  budgetCertifier?: UserRef;
  creator?: UserRef;
  children: OrsChild[];
  adjustments: OrsAdjustment[];
}

// ── Inspection ──

export type InspectionStatus = 'draft' | 'submitted' | 'accepted' | 'rejected' | 'cancelled';

export interface InspectionReportItem {
  id: string;
  prItemId: string | null;
  description: string;
  unitOfMeasure: string | null;
  quantityOrdered: string;
  quantityDelivered: string;
  quantityAccepted: string;
  quantityRejected: string;
  result: string;
  remarks: string | null;
  itemNumber: number;
}

export interface InspectionReport {
  id: string;
  reportNumber: string;
  reportDate: string;
  deliveryDate: string;
  deliveryNote: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  overallResult: string;
  findings: string | null;
  recommendations: string | null;
  status: InspectionStatus;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  inspectedAt: string | null;
  acceptedAt: string | null;
  purchaseOrder: {
    id: string;
    poNumber: string;
    contractAmount: string;
    status: string;
    supplier: { id: string; name: string };
  };
  purchaseRequest: { id: string; prNumber: string; title: string; status: string };
  supplier: { id: string; name: string; tin: string | null };
  inspector: UserRef | null;
  accepter: UserRef | null;
  creator: UserRef | null;
  items: InspectionReportItem[];
}

export type DvStatus =
  | 'draft'
  | 'for_certification'
  | 'certified'
  | 'for_approval'
  | 'approved'
  | 'released'
  | 'cancelled';
export type PaymentMode = 'check' | 'ada' | 'others';

export interface DisbursementVoucher {
  id: string;
  dvNumber: string;
  dvDate: string;
  particulars: string;
  paymentMode: PaymentMode;
  grossAmount: string;
  taxAmount: string;
  otherDeductions: string;
  // Free-form deduction lines (retention, non-tax withholding); each credits
  // its own liability account on release. `otherDeductions` is their total.
  deductions: Array<{
    id: string;
    label: string;
    amount: string;
    chartOfAccountId: string;
    sortOrder: number;
    chartOfAccount: { id: string; accountCode: string; name: string };
  }>;
  netAmount: string;
  payeeName: string | null;
  payeeTin: string | null;
  payeeAddress: string | null;
  checkNumber: string | null;
  checkDate: string | null;
  bankName: string | null;
  accountCode: string | null;
  status: DvStatus;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  certifiedAt: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  // Nullable: non-procurement DVs (travel, reimbursement, payroll) have no ORS
  // chain, and historical/irregular vouchers may lack a supplier/PR.
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
  certifier: UserRef | null;
  approver: UserRef | null;
  releaser: UserRef | null;
  creator: UserRef | null;
  updater: UserRef | null;
  // Posted accounting entry (auto-generated JEV on release). Drives Box B of
  // the printed DV. Null until the DV is released and the JEV is posted.
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

export type ConsumerType =
  'residential' | 'commercial' | 'industrial' | 'government' | 'institutional';
export type ConsumerStatus = 'active' | 'inactive' | 'disconnected' | 'closed';
export type MeterStatus = 'active' | 'inactive' | 'condemned' | 'for_repair';
export type MeterSize =
  | 'half_inch'
  | 'three_quarter_inch'
  | 'one_inch'
  | 'one_half_inch'
  | 'two_inch'
  | 'three_inch'
  | 'four_inch';

export interface UserRef {
  id: string;
  username: string;
}

export interface MeterRef {
  id: string;
  serialNumber: string;
  brand: string | null;
  size: string | null;
  status: MeterStatus;
}

export interface ConsumerRef {
  id: string;
  accountNumber: string;
  firstName: string;
  lastName: string;
}

export interface ConsumerMeterAssignment {
  id: string;
  meterId: string;
  consumerId: string;
  installedDate: string;
  removedDate: string | null;
  isCurrent: boolean;
  installationRemarks: string | null;
  meter: MeterRef;
  consumer?: ConsumerRef & { status: ConsumerStatus };
}

export interface ConsumerListItem {
  id: string;
  accountNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  businessName: string | null;
  consumerType: ConsumerType;
  status: ConsumerStatus;
  address: string;
  barangay: string | null;
  contactNumber: string | null;
  isSeniorCitizen: boolean;
  isPwd: boolean;
  createdAt: string;
  consumerMeters: Array<{ isCurrent: boolean; meter: MeterRef }>;
  creator: UserRef;
}

export interface Consumer extends ConsumerListItem {
  municipality: string | null;
  province: string | null;
  email: string | null;
  connectionDate: string | null;
  notes: string | null;
  version: number;
  updatedAt: string;
  consumerMeters: ConsumerMeterAssignment[];
  updater: UserRef | null;
}

export interface MeterListItem {
  id: string;
  serialNumber: string;
  brand: string | null;
  size: string | null;
  status: MeterStatus;
  initialReading: number;
  lastReading: number | null;
  createdAt: string;
  consumerMeters: Array<{ isCurrent: boolean; consumer: ConsumerRef }>;
  creator: UserRef;
}

export interface Meter extends MeterListItem {
  notes: string | null;
  version: number;
  updatedAt: string;
  consumerMeters: Array<
    ConsumerMeterAssignment & { consumer: ConsumerRef & { status: ConsumerStatus } }
  >;
  updater: UserRef | null;
}

export type BillingPeriodStatus = 'open' | 'reading' | 'billing' | 'closed';
export type ReadingStatus = 'pending' | 'confirmed' | 'adjusted';
export type BillStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled' | 'written_off';

export interface BillingPeriod {
  id: string;
  name: string;
  billingMonth: number;
  billingYear: number;
  readingStartDate: string | null;
  readingEndDate: string | null;
  dueDate: string;
  penaltyDate: string;
  status: BillingPeriodStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  creator: UserRef | null;
  updater?: UserRef | null;
  _count: { meterReadings: number; bills: number };
}

export interface MeterReading {
  id: string;
  consumerId: string;
  meterId: string;
  billingPeriodId: string;
  readingDate: string;
  previousReading: string;
  currentReading: string;
  consumption: string;
  status: ReadingStatus;
  remarks: string | null;
  consumer: ConsumerRef & { consumerType: ConsumerType; status?: ConsumerStatus };
  meter: { id: string; serialNumber: string };
  reader?: UserRef | null;
  creator?: UserRef | null;
}

export interface BillCharge {
  id: string;
  billId: string;
  chargeType: string;
  description: string;
  amount: string;
  sortOrder: number;
}

export interface BillListItem {
  id: string;
  billNumber: string;
  consumerId: string;
  billingPeriodId: string;
  previousReading: string;
  currentReading: string;
  consumption: string;
  waterCharge: string;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  dueDate: string;
  status: BillStatus;
  isSeniorDiscount: boolean;
  isPwdDiscount: boolean;
  consumer: ConsumerRef & { consumerType: ConsumerType };
  meterReading: { id: string; readingDate: string } | null;
}

export interface Bill extends BillListItem {
  environmentalFee: string;
  sewerCharge: string;
  maintenanceFee: string;
  penaltyAmount: string;
  discountAmount: string;
  arrearsAmount: string;
  otherCharges: string;
  penaltyDate: string;
  discountPercentage: string;
  notes: string | null;
  version: number;
  createdAt: string;
  consumer: ConsumerRef & {
    consumerType: ConsumerType;
    middleName: string | null;
    address: string;
    barangay: string | null;
    isSeniorCitizen: boolean;
    isPwd: boolean;
  };
  billingPeriod: { id: string; name: string; billingMonth: number; billingYear: number };
  meterReading: {
    id: string;
    readingDate: string;
    previousReading: string;
    currentReading: string;
    consumption: string;
  } | null;
  charges: BillCharge[];
  creator: UserRef | null;
}

export type PaymentMethod = 'cash' | 'check' | 'online' | 'bank_deposit';
export type PaymentStatus = 'valid' | 'voided';

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  billId: string | null;
  collectionTypeId?: string | null;
  collectionTypeName?: string | null;
  amountApplied: string;
  bill: {
    id: string;
    billNumber: string;
    billingPeriodId?: string;
    totalAmount?: string;
    amountPaid?: string;
    balance?: string;
    status?: BillStatus;
    billingPeriod?: { id: string; name: string };
  } | null;
}

export interface PaymentListItem {
  id: string;
  orNumber: string;
  consumerId: string;
  paymentDate: string;
  totalAmount: string;
  paymentMethod: PaymentMethod;
  checkNumber: string | null;
  referenceNumber: string | null;
  remarks: string | null;
  status: PaymentStatus;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  version: number;
  consumer: ConsumerRef;
  cashier: UserRef | null;
  allocations: PaymentAllocation[];
}

export interface Payment extends PaymentListItem {
  checkDate: string | null;
  bankName: string | null;
  updatedAt: string;
  consumer: ConsumerRef & {
    middleName: string | null;
    address: string;
    barangay: string | null;
    consumerType: ConsumerType;
  };
  voider: UserRef | null;
  creator: UserRef | null;
}

export interface UnpaidBill {
  id: string;
  billNumber: string;
  consumerId: string;
  totalAmount: string;
  amountPaid: string;
  penaltyAmount: string;
  balance: string;
  dueDate: string;
  status: BillStatus;
  consumption: string;
  billingPeriod: { id: string; name: string };
}

export type DisconnectionStatus =
  'notice_issued' | 'served' | 'disconnected' | 'cancelled' | 'reconnected';

export interface DisconnectionOrderListItem {
  id: string;
  orderNumber: string;
  consumerId: string;
  noticeDate: string;
  scheduledDate: string;
  totalArrears: string;
  status: DisconnectionStatus;
  remarks: string | null;
  version: number;
  createdAt: string;
  consumer: ConsumerRef & { consumerType: ConsumerType; status: ConsumerStatus };
  creator: UserRef | null;
}

export interface DisconnectionOrder extends DisconnectionOrderListItem {
  servedDate: string | null;
  disconnectedDate: string | null;
  reconnectedDate: string | null;
  reconnectionFee: string | null;
  cancelledDate: string | null;
  cancelReason: string | null;
  updatedAt: string;
  consumer: ConsumerRef & {
    consumerType: ConsumerType;
    status: ConsumerStatus;
    middleName: string | null;
    address: string;
    barangay: string | null;
  };
  server: UserRef | null;
  disconnector: UserRef | null;
  reconnector: UserRef | null;
  canceller: UserRef | null;
}

export interface ConsumerArrears {
  id: string;
  accountNumber: string;
  firstName: string;
  lastName: string;
  consumerType: ConsumerType;
  totalArrears: number;
  unpaidCount: number;
  bills: Array<{
    id: string;
    billNumber: string;
    balance: string;
    dueDate: string;
    billingPeriod: { name: string };
  }>;
}

export interface RateTier {
  id: string;
  rateScheduleId: string;
  minConsumption: string;
  maxConsumption: string | null;
  ratePerCubicMeter: string;
  sortOrder: number;
}

export interface RateSchedule {
  id: string;
  name: string;
  consumerType: ConsumerType;
  effectiveDate: string;
  endDate: string | null;
  minimumCharge: string;
  minimumConsumption: string;
  environmentalFee: string;
  sewerCharge: string;
  maintenanceFee: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  tiers: RateTier[];
  creator: UserRef | null;
  updater?: UserRef | null;
}

export interface CollectibleType {
  id: string;
  code: string;
  name: string;
  nature: 'receivable_settlement' | 'income' | 'liability';
  requiresConsumer: boolean;
}

// Types and constants shared between frontend and backend

export enum UserRole {
  ADMIN = 'ADMIN',
  SCM = 'SCM',
  APPOINTMENT_OWNER = 'APPOINTMENT_OWNER',
  WAREHOUSE_OWNER = 'WAREHOUSE_OWNER',
  LOGISTICS_OWNER = 'LOGISTICS_OWNER',
  GRN_OWNER = 'GRN_OWNER',
  OPS_EXECUTIVE = 'OPS_EXECUTIVE',
  VIEWER = 'VIEWER',
}

export enum POStatus {
  RECEIVED = 'RECEIVED',
  APPOINTMENT_REQUESTED = 'APPOINTMENT_REQUESTED',
  APPOINTMENT_CONFIRMED = 'APPOINTMENT_CONFIRMED',
  READY_FOR_DISPATCH = 'READY_FOR_DISPATCH',
  DISPATCHED = 'DISPATCHED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  GRN_PENDING = 'GRN_PENDING',
  RECONCILED = 'RECONCILED',
  CLOSED = 'CLOSED',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

export enum RiskStatus {
  BLACK = 'BLACK',
  RED = 'RED',
  ORANGE = 'ORANGE',
  YELLOW = 'YELLOW',
  GREEN = 'GREEN',
}

export enum TaskType {
  APPOINTMENT = 'APPOINTMENT',
  DISPATCH = 'DISPATCH',
  AVV_FOLLOWUP = 'AVV_FOLLOWUP',
  LOGISTICS = 'LOGISTICS',
  DELIVERY = 'DELIVERY',
  GRN = 'GRN',
  DISCREPANCY = 'DISCREPANCY',
  RETURN_CN = 'RETURN_CN',
  ESCALATION = 'ESCALATION',
}

export enum GRNOutcome {
  MATCHED = 'MATCHED',
  MISMATCHED = 'MISMATCHED',
  SHORTAGE = 'SHORTAGE',
  DAMAGE = 'DAMAGE',
  OTHER = 'OTHER',
  NO_GRN = 'NO_GRN',
}

// --- Location Master / Dispatch Date Engine ---

export enum LocationType {
  LOCAL = 'LOCAL',
  NON_LOCAL = 'NON_LOCAL',
}

export enum PendingLocationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum DispatchPlanStatus {
  NOT_DUE = 'NOT_DUE',
  DISPATCH_NOW = 'DISPATCH_NOW',
  DISPATCH_OVERDUE = 'DISPATCH_OVERDUE',
  CRITICAL = 'CRITICAL',
  DISPATCHED = 'DISPATCHED',
}

export enum DispatchVarianceLabel {
  EARLY = 'EARLY',
  ON_TIME = 'ON_TIME',
  LATE = 'LATE',
}

export interface LocationMaster {
  id: string;
  locationName: string;
  warehouseCode: string;
  platform?: string | null;
  city?: string;
  state?: string;
  locationType: LocationType;
  localTatHours?: number;
  nonLocalTatMinDays?: number;
  nonLocalTatMaxDays?: number;
  tatRuleDescription?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingLocation {
  id: string;
  locationName: string;
  normalizedName: string;
  platform: string | null;
  examplePoNumber: string | null;
  occurrenceCount: number;
  status: PendingLocationStatus;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  createdLocationId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

// --- Bulk PO Compilation Engine ---

export enum UploadBatchStatus {
  UPLOADING = 'UPLOADING',
  READING = 'READING',
  PROCESSING = 'PROCESSING',
  VALIDATING = 'VALIDATING',
  COMPILING = 'COMPILING',
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_EXCEPTIONS = 'COMPLETED_WITH_EXCEPTIONS',
  FAILED = 'FAILED',
}

export enum DedupClassification {
  NEW = 'NEW',
  EXACT_DUPLICATE = 'EXACT_DUPLICATE',
  UPDATED = 'UPDATED',
  POSSIBLE_DUPLICATE = 'POSSIBLE_DUPLICATE',
}

export enum ExceptionType {
  MISSING_PO = 'MISSING_PO',
  DUPLICATE = 'DUPLICATE',
  MISSING_SKU = 'MISSING_SKU',
  MISSING_WAREHOUSE = 'MISSING_WAREHOUSE',
  QUANTITY_MISMATCH = 'QUANTITY_MISMATCH',
  VALUE_MISMATCH = 'VALUE_MISMATCH',
  APPOINTMENT_EXPIRED = 'APPOINTMENT_EXPIRED',
  PO_EXPIRED = 'PO_EXPIRED',
  CANCELLED_PO = 'CANCELLED_PO',
  MISSING_APPOINTMENT = 'MISSING_APPOINTMENT',
  NEGATIVE_QUANTITY = 'NEGATIVE_QUANTITY',
  INVALID_DATE = 'INVALID_DATE',
  MISSING_MANDATORY_DATA = 'MISSING_MANDATORY_DATA',
  UNKNOWN_SKU = 'UNKNOWN_SKU',
  UNKNOWN_WAREHOUSE = 'UNKNOWN_WAREHOUSE',
  POSSIBLE_DUPLICATE = 'POSSIBLE_DUPLICATE',
  MRP_MISMATCH = 'MRP_MISMATCH',
}

export enum ExceptionSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ExceptionResolutionStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  IGNORED = 'IGNORED',
}

export enum FulfilmentStatus {
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  ORANGE = 'ORANGE',
  RED = 'RED',
}

export const STANDARD_BULK_FIELDS = [
  'platform',
  'po_number',
  'po_date',
  'appointment_date',
  'appointment_time',
  'warehouse',
  'sku_code',
  'upc',
  'product_name',
  'mrp',
  'ordered_qty',
  'accepted_qty',
  'dispatched_qty',
  'delivered_qty',
  'rejected_qty',
  'pending_qty',
  'unit_price',
  'po_value',
  'appointment_status',
  'delivery_status',
  'po_status',
  'expiry_date',
] as const;

export type StandardBulkField = (typeof STANDARD_BULK_FIELDS)[number];

/**
 * A PO's (recalculated) order value below this is flagged as "Low PO Value" on
 * the PO Detail / Edit PO screens. No business-confirmed number exists yet -
 * this is a placeholder default, tune it once ops gives a real threshold.
 */
export const LOW_PO_VALUE_THRESHOLD = 5000;

/** Business decision on whether a PO will actually be fulfilled - orthogonal to
 * the system-computed `isLowPoValue` flag. A low-value flag is just a signal;
 * this is the human call, and it always needs a reason attached. */
export enum FulfilmentDecision {
  FULFILLED = 'FULFILLED',
  NOT_FULFILLED = 'NOT_FULFILLED',
}

export enum NonFulfilmentReason {
  PO_VALUE_TOO_LOW = 'PO_VALUE_TOO_LOW',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  PRODUCT_UNAVAILABLE = 'PRODUCT_UNAVAILABLE',
  PO_EXPIRY_RISK = 'PO_EXPIRY_RISK',
  APPOINTMENT_NOT_AVAILABLE = 'APPOINTMENT_NOT_AVAILABLE',
  LOGISTICS_ISSUE = 'LOGISTICS_ISSUE',
  LOCATION_ISSUE = 'LOCATION_ISSUE',
  COMMERCIALLY_NOT_VIABLE = 'COMMERCIALLY_NOT_VIABLE',
  CUSTOMER_PLATFORM_ISSUE = 'CUSTOMER_PLATFORM_ISSUE',
  DUPLICATE_PO = 'DUPLICATE_PO',
  PO_CANCELLED = 'PO_CANCELLED',
  MANAGEMENT_DECISION = 'MANAGEMENT_DECISION',
  OTHER = 'OTHER',
}

export const NON_FULFILMENT_REASON_LABELS: Record<NonFulfilmentReason, string> = {
  [NonFulfilmentReason.PO_VALUE_TOO_LOW]: 'PO Value Too Low',
  [NonFulfilmentReason.INSUFFICIENT_STOCK]: 'Insufficient Stock',
  [NonFulfilmentReason.PRODUCT_UNAVAILABLE]: 'Product Unavailable',
  [NonFulfilmentReason.PO_EXPIRY_RISK]: 'PO Expiry Risk',
  [NonFulfilmentReason.APPOINTMENT_NOT_AVAILABLE]: 'Appointment Not Available',
  [NonFulfilmentReason.LOGISTICS_ISSUE]: 'Logistics Issue',
  [NonFulfilmentReason.LOCATION_ISSUE]: 'Location Issue',
  [NonFulfilmentReason.COMMERCIALLY_NOT_VIABLE]: 'Commercially Not Viable',
  [NonFulfilmentReason.CUSTOMER_PLATFORM_ISSUE]: 'Customer / Platform Issue',
  [NonFulfilmentReason.DUPLICATE_PO]: 'Duplicate PO',
  [NonFulfilmentReason.PO_CANCELLED]: 'PO Cancelled',
  [NonFulfilmentReason.MANAGEMENT_DECISION]: 'Management Decision',
  [NonFulfilmentReason.OTHER]: 'Other',
};

export interface PODeletionAudit {
  id: string;
  poNumber: string;
  deletedByUserId: string;
  deletedAt: Date;
  permanentlyDeletedByUserId?: string | null;
  permanentlyDeletedAt?: Date | null;
  reason?: string | null;
}

export interface UploadBatch {
  id: string;
  batchCode: string;
  fileName: string;
  platform: string;
  uploadedByUserId: string;
  uploadedAt: Date;
  status: UploadBatchStatus;
  totalRows: number;
  poCount: number;
  skuCount: number;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  newRecords: number;
  updatedRecords: number;
  duplicateRecords: number;
  exceptionRecords: number;
  failedRecords: number;
  errorMessage?: string;
}

export interface BulkException {
  id: string;
  batchId?: string;
  poId?: string;
  poNumber?: string;
  skuCode?: string;
  warehouse?: string;
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  financialImpact?: number;
  detectedAt: Date;
  ownerId?: string;
  recommendedAction?: string;
  resolutionStatus: ExceptionResolutionStatus;
}

export interface POChangeHistoryEntry {
  id: string;
  poId: string;
  skuCode?: string;
  fieldName: string;
  oldValue?: string;
  newValue?: string;
  changeType: string;
  sourceBatchId?: string;
  sourceFileName?: string;
  changedByUserId?: string;
  changedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  whatsappNumber?: string;
  phone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface POMaster {
  id: string;
  poNumber: string;
  poDate: Date;
  poExpiryDate: Date;
  channelId: string;
  customerId: string;
  location: string;
  poValue: number;
  status: POStatus;
  riskStatus: RiskStatus;
  priorityScore: number;
  overallOwnerId: string;
  appointmentOwnerId?: string;
  dispatchOwnerId?: string;
  logisticsOwnerId?: string;
  grnOwnerId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastStatusChangeAt?: Date;
  // Bulk Compilation Engine
  sourceType?: 'MANUAL' | 'BULK_IMPORT';
  lastBulkBatchId?: string;
  fulfilmentStatus?: FulfilmentStatus;
  appointmentStatusRaw?: string;
  deliveryStatusRaw?: string;
  poStatusRaw?: string;
  remarks?: string | null;
  availableStockValue?: number | null;
  dispatchValue?: number | null;
  fulfilmentPercent?: number | null;
  isLowPoValue?: boolean;
  // PO Bin (soft delete)
  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedByUserId?: string | null;
  // Non-fulfilment
  fulfilmentDecision?: FulfilmentDecision;
  nonFulfilmentReason?: NonFulfilmentReason | null;
  nonFulfilmentRemarks?: string | null;
  nonFulfilmentSystemRemarks?: string | null;
  nonFulfilmentAt?: Date | null;
  nonFulfilmentByUserId?: string | null;
}

export interface POLineItem {
  id: string;
  poId: string;
  skuCode: string;
  skuName: string;
  quantity: number;
  quantityReceived?: number;
  availability: 'AVAILABLE' | 'SHORT' | 'NOT_AVAILABLE';
  createdAt: Date;
  upc?: string;
  mrp?: number;
  // Bulk Compilation Engine
  acceptedQuantity?: number;
  dispatchedQuantity?: number;
  deliveredQuantity?: number;
  rejectedQuantity?: number;
  pendingQuantity?: number;
  unitPrice?: number;
  lineValue?: number;
  fulfilmentPercent?: number;
  pendingPercent?: number;
  availableQuantity?: number | null;
  remarks?: string | null;
}

export interface Appointment {
  id: string;
  poId: string;
  requestedAt?: Date;
  confirmedAt?: Date;
  appointmentDate?: Date;
  appointmentWindow?: string;
  slaStatus: 'ON_TIME' | 'ESCALATED' | 'BREACHED';
  extensionRequested: boolean;
  extensionGranted: boolean;
  newExpiryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  appointmentId?: string | null;
  appointmentTime?: string | null;
  appointmentLocation?: string | null;
  extensionRequestedAt?: Date | null;
  extensionReason?: string | null;
  remarks?: string | null;
}

export interface Dispatch {
  id: string;
  poId: string;
  idealDispatchDate: Date;
  latestSafeDispatchDate: Date;
  actualDispatchDate?: Date;
  docketNumber?: string;
  transporterId?: string;
  createdAt: Date;
  updatedAt: Date;
  // Location-based Dynamic Dispatch Date Engine
  locationType?: LocationType;
  tatRuleDescription?: string;
  dispatchWindowEarliest?: Date;
  dispatchWindowLatest?: Date;
  recommendedDispatchDate?: Date;
  dispatchPlanStatus?: DispatchPlanStatus;
  dispatchVarianceDays?: number;
  dispatchVarianceLabel?: DispatchVarianceLabel;
  plannedDispatchDate?: Date | null;
  dispatchStatus?: string | null;
  invoiceNumber?: string | null;
  ewayBillNumber?: string | null;
  vehicleNumber?: string | null;
  lrNumber?: string | null;
  remarks?: string | null;
}

export interface LogisticsTracker {
  id: string;
  poId: string;
  docketNumber: string;
  transporterId: string;
  lastTrackedStatus?: string;
  lastUpdateTime?: Date;
  hoursWithoutMovement?: number;
  receivedAndActioned: boolean;
  receivedAndActionedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  vehicleNumber?: string | null;
  pickupDate?: Date | null;
  expectedDeliveryDate?: Date | null;
  actualDeliveryDate?: Date | null;
  delayReason?: string | null;
  remarks?: string | null;
}

export interface GRNTracker {
  id: string;
  poId: string;
  grnNumber?: string;
  grnValue?: number;
  grnDate?: Date;
  outcome?: GRNOutcome;
  discrepancyReason?: string;
  discrepancyAmount?: number;
  creditNoteNumber?: string;
  debitNoteNumber?: string;
  slaStatus: 'ON_TIME' | 'ESCALATED' | 'BREACHED';
  createdAt: Date;
  updatedAt: Date;
  grnQuantity?: number | null;
  acceptedQuantity?: number | null;
  rejectedQuantity?: number | null;
  shortQuantity?: number | null;
  remarks?: string | null;
}

export interface ReturnTracker {
  id: string;
  poId: string;
  returnDate: Date;
  returnType: 'RECALL_NOT_DELIVERED' | 'REJECTED_GRN' | 'DAMAGE' | 'SHORTAGE';
  rootCause?: string;
  creditNoteNumber?: string;
  lossAmount?: number;
  createdAt: Date;
  updatedAt: Date;
  returnStatus?: string | null;
  returnQuantity?: number | null;
  remarks?: string | null;
}

export interface DocumentRecord {
  id: string;
  poId: string;
  documentType: string;
  fileName: string;
  filePath: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface Task {
  id: string;
  poId: string;
  taskType: TaskType;
  ownerId: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'ESCALATED';
  slaDueAt: Date;
  createdAt: Date;
  completedAt?: Date;
  notes?: string;
}

export interface CustomerMaster {
  id: string;
  name: string;
  channel: string;
  appointmentRequirementInDays: number;
  receivingDays: string[]; // e.g., ['MON', 'WED', 'FRI']
  escalationContactEmail: string;
  escalationContactPhone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransporterMaster {
  id: string;
  name: string;
  transitTimeDays: number;
  onTimePercentage: number;
  cutOffTime?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnerMaster {
  id: string;
  userId: string;
  channel?: string;
  location?: string;
  responsibility: string;
  backupOwnerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  tableName: string;
  recordId: string;
  fieldName: string;
  oldValue?: string;
  newValue?: string;
  userId: string;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  poId?: string;
  taskId?: string;
  type: string;
  channel: 'WHATSAPP' | 'EMAIL' | 'IN_APP';
  title: string;
  message: string;
  isRead: boolean;
  sentAt: Date;
  readAt?: Date;
}

export interface Document {
  id: string;
  poId: string;
  documentType: 'CUSTOMER_PO' | 'APPOINTMENT_CONFIRMATION' | 'INVOICE' | 'DISPATCH_DOCUMENT' | 'DOCKET' | 'POD' | 'GRN' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  fileName: string;
  filePath: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface RiskThresholds {
  blackDaysToExpiry: number;
  redDaysToExpiry: number;
  orangeDaysToExpiry: number;
  yellowDaysToExpiry: number;
}

export interface SLAThresholds {
  appointmentRequestSLAHours: number;
  appointmentRequestEscalationHours: number;
  grnSLAHours: number[];
  avvFollowUpInitialDays: number;
  avvFollowUpRepeatDays: number;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export enum StuckStockReason {
  EXPIRED_PO = 'EXPIRED_PO',
  APPOINTMENT_EXPIRED = 'APPOINTMENT_EXPIRED',
  PO_CANCELLED = 'PO_CANCELLED',
  APPOINTMENT_MISSED = 'APPOINTMENT_MISSED',
  DELIVERY_REJECTED = 'DELIVERY_REJECTED',
  RTO = 'RTO',
  WAREHOUSE_REJECTION = 'WAREHOUSE_REJECTION',
  CHANNEL_ISSUE = 'CHANNEL_ISSUE',
  OTHER = 'OTHER',
}

export enum StuckStockStatus {
  OPEN = 'OPEN',
  PARTIALLY_MAPPED = 'PARTIALLY_MAPPED',
  MAPPED = 'MAPPED',
  RESOLVED = 'RESOLVED',
  WRITTEN_OFF = 'WRITTEN_OFF',
}

export enum POMappingStatus {
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export const STUCK_STOCK_AGING_BUCKETS = ['0-7', '8-15', '16-30', '31-60', '60+'] as const;
export type StuckStockAgingBucket = (typeof STUCK_STOCK_AGING_BUCKETS)[number];

export interface CreatePORequest {
  poNumber: string;
  poDate: Date;
  poExpiryDate: Date;
  channelId: string;
  customerId: string;
  location: string;
  poValue: number;
  lineItems: Array<{
    skuCode: string;
    skuName: string;
    quantity: number;
    mrp?: number | null;
    upc?: string | null;
    unitPrice?: number | null;
  }>;
}

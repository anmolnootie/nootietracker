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
  }>;
}

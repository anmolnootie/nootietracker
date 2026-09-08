export interface EditPOMasterFields {
  poNumber?: string;
  poDate?: string;
  channelId?: string;
  location?: string;
  customerId?: string;
  poExpiryDate?: string;
  status?: string;
  remarks?: string;
}

export interface EditLineItemFields {
  id: string;
  skuCode?: string;
  skuName?: string;
  quantity?: number;
  availableQuantity?: number;
  dispatchedQuantity?: number;
  mrp?: number;
  unitPrice?: number;
  remarks?: string;
}

export interface EditAppointmentFields {
  requestedAt?: string;
  confirmedAt?: string;
  appointmentDate?: string;
  appointmentWindow?: string;
  appointmentId?: string;
  appointmentTime?: string;
  appointmentLocation?: string;
  slaStatus?: string;
  extensionRequested?: boolean;
  extensionGranted?: boolean;
  extensionRequestedAt?: string;
  extensionReason?: string;
  newExpiryDate?: string;
  remarks?: string;
}

export interface EditDispatchFields {
  plannedDispatchDate?: string;
  actualDispatchDate?: string;
  dispatchStatus?: string;
  invoiceNumber?: string;
  ewayBillNumber?: string;
  vehicleNumber?: string;
  lrNumber?: string;
  docketNumber?: string;
  transporterId?: string;
  remarks?: string;
}

export interface EditLogisticsFields {
  transporterId?: string;
  vehicleNumber?: string;
  docketNumber?: string;
  pickupDate?: string;
  expectedDeliveryDate?: string;
  actualDeliveryDate?: string;
  lastTrackedStatus?: string;
  delayReason?: string;
  remarks?: string;
}

export interface EditGRNFields {
  grnNumber?: string;
  grnDate?: string;
  grnQuantity?: number;
  acceptedQuantity?: number;
  rejectedQuantity?: number;
  shortQuantity?: number;
  grnValue?: number;
  outcome?: string;
  remarks?: string;
}

export interface EditReturnFields {
  returnStatus?: string;
  returnQuantity?: number;
  lossAmount?: number;
  rootCause?: string;
  returnDate?: string;
  remarks?: string;
}

export interface EditPORequest {
  po?: EditPOMasterFields;
  lineItems?: EditLineItemFields[];
  appointment?: EditAppointmentFields;
  dispatch?: EditDispatchFields;
  logistics?: EditLogisticsFields;
  grn?: EditGRNFields;
  returnRecord?: EditReturnFields;
}

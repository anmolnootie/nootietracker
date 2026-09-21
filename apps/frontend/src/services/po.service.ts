import api from '@/lib/api';
import { CreatePORequest, POMaster, POLineItem, NonFulfilmentReason } from '@po-control-tower/shared';

export type POView = 'active' | 'at_risk' | 'expiring_soon' | 'low_value' | 'not_fulfilled';

export interface InventoryRow {
  skuCode: string;
  upc: string | null;
  name: string;
  unitsOrdered: number;
  unitsDispatched: number;
  unitsAvailable: number;
  unitsPending: number;
  totalValue: number;
  poCount: number;
  fulfilmentPercent: number;
}

export interface POListFilters {
  channelId?: string;
  customerId?: string;
  status?: string;
  risk?: string;
  view?: POView;
  search?: string;
  location?: string;
  dateField?: 'poDate' | 'expiry' | 'dispatch' | 'appointment' | 'invoice';
  dateFrom?: string;
  dateTo?: string;
  valueMin?: number;
  valueMax?: number;
  fulfilmentDecision?: string;
  fulfilmentStatus?: string;
  sourceType?: string;
  invoiced?: 'yes' | 'no';
  reattempt?: 'yes' | 'no';
}

export interface DispatchDashboardParams {
  fy?: number;
  channel?: string;
  month?: string;
  status?: string;
  partner?: string;
  aging?: string;
}

export type DispatchKpi = 'all' | 'delivered' | 'inTransit' | 'grnDone' | 'grnPending' | 'invoiceValue';

export interface DispatchDashboardListRow {
  id: string;
  poNumber: string;
  location: string;
  channel: string;
  dispatchDate: string;
  invoiceNumber: string | null;
  invoiceValue: number;
  partner: string;
  awb: string | null;
  status: string;
  grn: string;
}

export interface DispatchDashboardList {
  fyLabel: string;
  kpi: DispatchKpi;
  total: number;
  invoiceValue: number;
  truncated: boolean;
  rows: DispatchDashboardListRow[];
}

export interface DispatchDashboardData {
  fy: number;
  fyLabel: string;
  fyOptions: number[];
  kpis: { totalPOs: number; delivered: number; inTransit: number; grnDone: number; grnPending: number; totalInvoiceValue: number };
  slicers: {
    channels: { name: string; count: number }[];
    months: { value: string; label: string; count: number }[];
    statuses: { name: string; count: number }[];
  };
  byPartner: { name: string; count: number }[];
  byAging: { name: string; count: number }[];
  byMonth: { value: string; label: string; count: number; invoiceValue: number }[];
  table: {
    total: number;
    rows: {
      id: string;
      poNumber: string;
      location: string;
      channel: string;
      dispatchDate: string;
      invoiceNumber: string | null;
      invoiceValue: number;
      partner: string;
      awb: string | null;
      status: string;
      grn: string;
    }[];
  };
}

export const poService = {
  createPO: async (data: CreatePORequest) => {
    const response = await api.post('/pos', data);
    return response.data;
  },

  checkDuplicate: async (poNumber: string): Promise<{ exists: boolean; po?: POMaster }> => {
    const response = await api.get(`/pos/check-duplicate/${encodeURIComponent(poNumber)}`);
    return response.data;
  },

  getAllPOs: async (filters?: POListFilters) => {
    const response = await api.get('/pos', { params: filters });
    return response.data;
  },

  getDispatchDashboard: async (params: DispatchDashboardParams): Promise<DispatchDashboardData> => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    const response = await api.get('/pos/dispatch-dashboard', { params: clean });
    return response.data;
  },

  /** Every PO behind one dashboard tile (respecting the active filters), for the list that opens on click. */
  getDispatchDashboardList: async (kpi: DispatchKpi, params: DispatchDashboardParams): Promise<DispatchDashboardList> => {
    const clean = Object.fromEntries(Object.entries({ ...params, kpi }).filter(([, v]) => v !== undefined && v !== ''));
    const response = await api.get('/pos/dispatch-dashboard/list', { params: clean });
    return response.data;
  },

  getFilterOptions: async (): Promise<{ channels: string[]; locations: string[]; customers: string[] }> => {
    const response = await api.get('/pos/filter-options');
    return response.data;
  },

  getBin: async (): Promise<POMaster[]> => {
    const response = await api.get('/pos/bin');
    return response.data;
  },

  softDeletePO: async (poId: string): Promise<POMaster> => {
    const response = await api.delete(`/pos/${poId}`);
    return response.data;
  },

  bulkSoftDeletePO: async (poIds: string[]): Promise<{ deleted: string[]; failed: { poId: string; reason: string }[] }> => {
    const response = await api.post('/pos/bulk-delete', { poIds });
    return response.data;
  },

  restorePO: async (poId: string): Promise<POMaster> => {
    const response = await api.post(`/pos/${poId}/restore`);
    return response.data;
  },

  bulkRestorePO: async (poIds: string[]): Promise<{ restored: string[]; failed: { poId: string; reason: string }[] }> => {
    const response = await api.post('/pos/bulk-restore', { poIds });
    return response.data;
  },

  permanentlyDeletePO: async (poId: string, reason?: string): Promise<void> => {
    await api.delete(`/pos/${poId}/permanent`, { data: { reason } });
  },

  bulkPermanentlyDeletePO: async (poIds: string[], reason?: string): Promise<{ deleted: string[]; failed: { poId: string; reason: string }[] }> => {
    const response = await api.post('/pos/bulk-permanent-delete', { poIds, reason });
    return response.data;
  },

  markNotFulfilled: async (poId: string, reason: NonFulfilmentReason, remarks?: string): Promise<POMaster> => {
    const response = await api.post(`/pos/${poId}/mark-not-fulfilled`, { reason, remarks });
    return response.data;
  },

  getNonFulfilmentDiagnosis: async (poId: string): Promise<{ diagnosis: string }> => {
    const response = await api.get(`/pos/${poId}/non-fulfilment-diagnosis`);
    return response.data;
  },

  markFulfilled: async (poId: string): Promise<POMaster> => {
    const response = await api.post(`/pos/${poId}/mark-fulfilled`);
    return response.data;
  },

  getNotFulfilledDashboard: async (): Promise<{
    totalPOs: number;
    totalValue: number;
    potentiallyLostValue: number;
    breakdown: { reason: string; count: number; value: number }[];
  }> => {
    const response = await api.get('/pos/not-fulfilled/dashboard');
    return response.data;
  },

  getPOById: async (poId: string): Promise<POMaster> => {
    const response = await api.get(`/pos/${poId}`);
    return response.data;
  },

  downloadPdf: async (poId: string, poNumber: string): Promise<void> => {
    const response = await api.get(`/pos/${poId}/pdf`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${poNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  getLineItems: async (poId: string): Promise<POLineItem[]> => {
    const response = await api.get(`/pos/${poId}/line-items`);
    return response.data;
  },

  getTimeline: async (poId: string): Promise<any> => {
    const response = await api.get(`/pos/${poId}/timeline`);
    return response.data;
  },

  requestAppointment: async (poId: string) => {
    const response = await api.post(`/pos/${poId}/appointment/request`);
    return response.data;
  },

  confirmAppointment: async (poId: string, appointmentDate: Date) => {
    const response = await api.post(`/pos/${poId}/appointment/confirm`, {
      appointmentDate: appointmentDate.toISOString(),
    });
    return response.data;
  },

  markDispatched: async (poId: string, docketNumber: string, transporterId: string) => {
    const response = await api.post(`/pos/${poId}/dispatch/mark`, {
      docketNumber,
      transporterId,
    });
    return response.data;
  },

  updateLogisticsStatus: async (poId: string, status: string) => {
    const response = await api.post(`/pos/${poId}/logistics/update-status`, { status });
    return response.data;
  },

  markAVVReceived: async (poId: string) => {
    const response = await api.post(`/pos/${poId}/avv/mark-received`);
    return response.data;
  },

  recordGRN: async (
    poId: string,
    data: {
      grnNumber: string;
      grnValue: number;
      outcome: string;
      discrepancyReason?: string;
      discrepancyAmount?: number;
    },
  ) => {
    const response = await api.post(`/pos/${poId}/grn/record`, data);
    return response.data;
  },

  getDashboardMetrics: async () => {
    const response = await api.get('/pos/dashboard/metrics');
    return response.data;
  },

  getInventoryRollup: async (): Promise<InventoryRow[]> => {
    const response = await api.get('/pos/inventory/summary');
    return response.data;
  },

  listLogisticsTrackers: async (): Promise<any[]> => {
    const response = await api.get('/pos/logistics/list');
    return response.data;
  },

  listReadyToDispatch: async (): Promise<any[]> => {
    const response = await api.get('/pos/dispatch/ready');
    return response.data;
  },

  getChangeHistory: async (poId: string): Promise<any[]> => {
    const response = await api.get(`/pos/${poId}/change-history`);
    return response.data;
  },

  getSource: async (poId: string): Promise<any> => {
    const response = await api.get(`/pos/${poId}/source`);
    return response.data;
  },

  getSensitiveFields: async (): Promise<{ fields: string[] }> => {
    const response = await api.get('/pos/edit-meta/sensitive-fields');
    return response.data;
  },

  editPO: async (poId: string, payload: EditPOPayload): Promise<POMaster> => {
    const response = await api.patch(`/pos/${poId}`, payload);
    return response.data;
  },

  reattemptDelivery: async (poId: string): Promise<{ newPo: POMaster; mapping: any }> => {
    const response = await api.post(`/pos/${poId}/reattempt`);
    return response.data;
  },
};

export interface EditPOPayload {
  po?: Partial<{
    poNumber: string;
    poDate: string;
    channelId: string;
    location: string;
    customerId: string;
    poExpiryDate: string;
    status: string;
    remarks: string | null;
  }>;
  lineItems?: Array<
    Partial<{
      skuCode: string;
      skuName: string;
      quantity: number;
      availableQuantity: number | null;
      dispatchedQuantity: number | null;
      mrp: number | null;
      unitPrice: number | null;
      remarks: string | null;
    }> & { id: string }
  >;
  appointment?: Partial<{
    requestedAt: string | null;
    confirmedAt: string | null;
    appointmentDate: string | null;
    appointmentWindow: string | null;
    appointmentId: string | null;
    appointmentTime: string | null;
    appointmentLocation: string | null;
    slaStatus: string;
    extensionRequested: boolean;
    extensionGranted: boolean;
    extensionRequestedAt: string | null;
    extensionReason: string | null;
    newExpiryDate: string | null;
    remarks: string | null;
  }>;
  dispatch?: Partial<{
    plannedDispatchDate: string | null;
    actualDispatchDate: string | null;
    dispatchStatus: string | null;
    invoiceNumber: string | null;
    invoiceValue: number | null;
    invoiceDate: string | null;
    awbNumber: string | null;
    ewayBillNumber: string | null;
    vehicleNumber: string | null;
    lrNumber: string | null;
    docketNumber: string | null;
    transporterId: string | null;
    remarks: string | null;
  }>;
  logistics?: Partial<{
    transporterId: string | null;
    vehicleNumber: string | null;
    docketNumber: string | null;
    pickupDate: string | null;
    expectedDeliveryDate: string | null;
    actualDeliveryDate: string | null;
    lastTrackedStatus: string | null;
    delayReason: string | null;
    remarks: string | null;
  }>;
  grn?: Partial<{
    grnNumber: string | null;
    grnDate: string | null;
    grnQuantity: number | null;
    acceptedQuantity: number | null;
    rejectedQuantity: number | null;
    shortQuantity: number | null;
    grnValue: number | null;
    outcome: string | null;
    remarks: string | null;
  }>;
  returnRecord?: Partial<{
    returnStatus: string | null;
    returnQuantity: number | null;
    lossAmount: number | null;
    rootCause: string | null;
    returnDate: string | null;
    remarks: string | null;
  }>;
}

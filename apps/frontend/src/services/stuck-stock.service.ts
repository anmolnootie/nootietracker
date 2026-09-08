import api from '@/lib/api';

export type StuckStockReason =
  | 'EXPIRED_PO'
  | 'APPOINTMENT_EXPIRED'
  | 'PO_CANCELLED'
  | 'APPOINTMENT_MISSED'
  | 'DELIVERY_REJECTED'
  | 'RTO'
  | 'WAREHOUSE_REJECTION'
  | 'CHANNEL_ISSUE'
  | 'OTHER';

export type StuckStockStatus = 'OPEN' | 'PARTIALLY_MAPPED' | 'MAPPED' | 'RESOLVED' | 'WRITTEN_OFF';
export type AgingBucket = '0-7' | '8-15' | '16-30' | '31-60' | '60+';

export interface StuckStockRow {
  id: string;
  poId: string;
  poNumber: string;
  skuCode: string;
  skuName: string;
  quantity: number;
  value: number;
  warehouse: string | null;
  dateDispatched: string | null;
  reason: StuckStockReason;
  status: StuckStockStatus;
  mappedPoId: string | null;
  ownerId: string | null;
  recoveredQuantity: number;
  remarks: string | null;
  resolvedAt: string | null;
  firstDetectedAt: string;
  updatedAt: string;
  daysStuck: number;
  agingBucket: AgingBucket;
}

export interface StuckStockSummary {
  totalValue: number;
  totalQuantity: number;
  totalRecords: number;
  byStatus: Record<string, number>;
  byAgingBucket: Record<AgingBucket, { count: number; value: number }>;
  valueStuckOver30Days: number;
}

export interface DetectionResult {
  scanned: number;
  created: number;
  updated: number;
  autoResolved: number;
}

export interface StuckStockByPO {
  poId: string;
  poNumber: string;
  channelId: string;
  poValue: number;
  stuckValue: number;
  stuckQuantity: number;
  reasons: StuckStockReason[];
  maxDaysStuck: number;
  status: 'OPEN' | 'PARTIALLY_MAPPED' | 'MAPPED';
  lines: StuckStockRow[];
}

export const stuckStockService = {
  detect: async (): Promise<DetectionResult> => (await api.post('/stuck-stock/detect')).data,

  list: async (filters?: { status?: StuckStockStatus; reason?: StuckStockReason; warehouse?: string }): Promise<StuckStockRow[]> =>
    (await api.get('/stuck-stock', { params: filters })).data,

  getSummary: async (): Promise<StuckStockSummary> => (await api.get('/stuck-stock/summary')).data,

  listByPO: async (): Promise<StuckStockByPO[]> => (await api.get('/stuck-stock/by-po')).data,

  getById: async (id: string): Promise<StuckStockRow> => (await api.get(`/stuck-stock/${id}`)).data,

  update: async (id: string, data: { ownerId?: string | null; remarks?: string | null; status?: 'RESOLVED' | 'WRITTEN_OFF' | 'OPEN' }): Promise<StuckStockRow> =>
    (await api.patch(`/stuck-stock/${id}`, data)).data,
};

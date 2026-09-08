import api from '@/lib/api';

export type POMappingStatus = 'ACTIVE' | 'REJECTED' | 'CANCELLED';
export type MappingExecutionStatus = 'APPOINTMENT_PENDING' | 'APPOINTMENT_BOOKED' | 'DISPATCHED' | 'RECEIVED';

export interface POMappingRow {
  id: string;
  originalPoId: string;
  originalPoNumber: string;
  skuCode: string;
  skuName: string;
  newPoId: string;
  newPoNumber: string;
  originalQuantity: number;
  availableQuantity: number;
  quantityMapped: number;
  quantityRemaining: number;
  originalValue: number;
  valueMapped: number;
  valueRemaining: number;
  mappingDate: string;
  reason: string | null;
  newAppointmentDate: string | null;
  remarks: string | null;
  status: POMappingStatus;
  createdByUserId: string | null;
  recoveredAt: string | null;
  executionStatus: MappingExecutionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MapWholePOInput {
  originalPoId: string;
  newPoId: string;
  lines: { skuCode: string; quantityMapped: number }[];
  reason?: string;
  newAppointmentDate?: string;
  remarks?: string;
}

export interface MapWholePOResult {
  mappings: POMappingRow[];
  totalValueMapped: number;
  newPoValue: number;
  coveragePercent: number;
}

export interface AutoMapWholePOInput {
  originalPoId: string;
  reason?: string;
  remarks?: string;
  newAppointmentDate?: string;
}

export interface AutoMapWholePOResult extends MapWholePOResult {
  candidatesConsidered: number;
}

export interface MappedStockForNewPo {
  newPoId: string;
  totalQuantityMapped: number;
  totalValueMapped: number;
  lines: POMappingRow[];
}

export const poMappingService = {
  mapWholePO: async (data: MapWholePOInput): Promise<MapWholePOResult> => (await api.post('/po-mapping/whole-po', data)).data,

  autoMapWholePO: async (data: AutoMapWholePOInput): Promise<AutoMapWholePOResult> => (await api.post('/po-mapping/auto-map-whole-po', data)).data,

  list: async (filters?: { originalPoId?: string; newPoId?: string; status?: POMappingStatus }): Promise<POMappingRow[]> =>
    (await api.get('/po-mapping', { params: filters })).data,

  listForStuckStock: async (originalPoId: string, skuCode: string): Promise<POMappingRow[]> =>
    (await api.get('/po-mapping/for-stuck-stock', { params: { originalPoId, skuCode } })).data,

  getMappedStockForNewPo: async (newPoId: string): Promise<MappedStockForNewPo> =>
    (await api.get('/po-mapping/for-new-po', { params: { newPoId } })).data,

  listBatch: async (originalPoId: string, newPoId: string, mappingDate: string): Promise<POMappingRow[]> =>
    (await api.get('/po-mapping/batch', { params: { originalPoId, newPoId, mappingDate } })).data,

  updateBatch: async (
    originalPoId: string,
    newPoId: string,
    mappingDate: string,
    data: { status?: POMappingStatus; remarks?: string; newAppointmentDate?: string | null },
  ): Promise<POMappingRow[]> => (await api.patch('/po-mapping/batch', data, { params: { originalPoId, newPoId, mappingDate } })).data,

  getById: async (id: string): Promise<POMappingRow> => (await api.get(`/po-mapping/${id}`)).data,

  update: async (id: string, data: { status?: POMappingStatus; remarks?: string; newAppointmentDate?: string | null }): Promise<POMappingRow> =>
    (await api.patch(`/po-mapping/${id}`, data)).data,
};

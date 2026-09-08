import api from '@/lib/api';

export interface SkuMasterRow {
  id: string;
  skuCode: string;
  skuName: string;
  upc: string | null;
  mrp: number | null;
  unitPrice: number | null;
  stockQuantity: number;
  sourceFileName: string | null;
  lastUploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadSkuFileResult {
  fileName: string;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

export interface UpdateSkuMasterInput {
  skuName?: string;
  upc?: string | null;
  mrp?: number | null;
  unitPrice?: number | null;
  stockQuantity?: number;
}

export interface CreateSkuMasterInput extends UpdateSkuMasterInput {
  skuCode: string;
  skuName: string;
}

export interface HighestMovingSku {
  skuCode: string;
  skuName: string;
  unitsOrdered: number;
  unitsDispatched: number;
  stockQuantity: number | null;
}

export interface DeadStockSku {
  skuCode: string;
  skuName: string;
  stockQuantity: number;
  unitPrice: number | null;
  mrp: number | null;
  valueAtRisk: number;
  reason: 'NEVER_ORDERED' | 'ZERO_DISPATCHED';
  lastUploadedAt: string | null;
}

export interface InventoryDashboard {
  summary: {
    totalSkus: number;
    totalStockUnits: number;
    totalStockValue: number;
    deadStockSkuCount: number;
    deadStockValue: number;
  };
  highestMoving: HighestMovingSku[];
  deadStock: DeadStockSku[];
}

export const inventoryService = {
  uploadSkuFile: async (file: File): Promise<UploadSkuFileResult> => {
    const form = new FormData();
    form.append('file', file);
    // Leave Content-Type unset so the browser fills in the multipart boundary.
    const response = await api.post('/inventory/upload', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  getDashboard: async (): Promise<InventoryDashboard> => {
    const response = await api.get('/inventory/dashboard');
    return response.data;
  },

  listSkuMaster: async (search?: string): Promise<SkuMasterRow[]> => {
    const response = await api.get('/inventory/sku-master', { params: search ? { search } : undefined });
    return response.data;
  },

  createSkuMaster: async (data: CreateSkuMasterInput): Promise<SkuMasterRow> => {
    const response = await api.post('/inventory/sku-master', data);
    return response.data;
  },

  updateSkuMaster: async (id: string, data: UpdateSkuMasterInput): Promise<SkuMasterRow> => {
    const response = await api.patch(`/inventory/sku-master/${id}`, data);
    return response.data;
  },

  deleteSkuMaster: async (id: string): Promise<void> => {
    await api.delete(`/inventory/sku-master/${id}`);
  },
};

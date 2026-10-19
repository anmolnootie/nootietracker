import api from '@/lib/api';

export interface DnUploadBatch {
  id: string;
  batchCode: string;
  fileName: string;
  uploadedByUserId: string;
  uploadedAt: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  errorMessage: string | null;
}

export interface DnImportRow {
  id: string;
  batchId: string;
  rowIndex: number;
  facilityName: string | null;
  dnId: string | null;
  dnDate: string | null;
  vendorName: string | null;
  vendorGstin: string | null;
  purchaseNumber: string | null;
  manufacturer: string | null;
  invoiceId: string | null;
  itemId: string | null;
  productName: string | null;
  upcId: string | null;
  dnQuantity: number | null;
  unitLandingPrice: number | null;
  itemDnAmount: number | null;
  dnNetAmount: number | null;
  remark: string | null;
  reason: string | null;
  errorMessage: string | null;
}

export const dnImportService = {
  upload: async (file: File): Promise<DnUploadBatch> => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/dn-import/upload', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  listBatches: async (): Promise<DnUploadBatch[]> => (await api.get('/dn-import/batches')).data,

  getBatch: async (id: string): Promise<DnUploadBatch> => (await api.get(`/dn-import/batches/${id}`)).data,

  getRows: async (id: string): Promise<DnImportRow[]> => (await api.get(`/dn-import/batches/${id}/rows`)).data,

  deleteBatch: async (id: string): Promise<void> => {
    await api.delete(`/dn-import/batches/${id}`);
  },
};

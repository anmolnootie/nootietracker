import api from '@/lib/api';

export interface GrnUploadBatch {
  id: string;
  batchCode: string;
  fileName: string;
  uploadedByUserId: string;
  uploadedAt: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  errorMessage: string | null;
}

export interface GrnImportRow {
  id: string;
  batchId: string;
  rowIndex: number;
  poNumber: string | null;
  invoiceNumber: string | null;
  grnNumber: string | null;
  grnValue: number | null;
  outcome: string | null;
  discrepancyReason: string | null;
  discrepancyAmount: number | null;
  matchStatus: 'MATCHED' | 'PO_NOT_FOUND' | 'INVALID';
  matchedPoId: string | null;
  errorMessage: string | null;
}

export const grnImportService = {
  upload: async (file: File): Promise<GrnUploadBatch> => {
    const form = new FormData();
    form.append('file', file);
    // Leave Content-Type unset - see bulk-import.service.ts for why an explicit
    // multipart override here would break the multipart boundary.
    const response = await api.post('/grn-import/upload', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  listBatches: async (): Promise<GrnUploadBatch[]> => (await api.get('/grn-import/batches')).data,

  getBatch: async (id: string): Promise<GrnUploadBatch> => (await api.get(`/grn-import/batches/${id}`)).data,

  getRows: async (id: string): Promise<GrnImportRow[]> => (await api.get(`/grn-import/batches/${id}/rows`)).data,

  deleteBatch: async (id: string): Promise<void> => {
    await api.delete(`/grn-import/batches/${id}`);
  },
};

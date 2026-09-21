import api from '@/lib/api';

export interface InvoiceUploadBatch {
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

export interface InvoiceImportRow {
  id: string;
  batchId: string;
  rowIndex: number;
  poNumber: string | null;
  invoiceNumber: string | null;
  invoiceValue: number | null;
  invoiceDate: string | null;
  awbNumber: string | null;
  customerName: string | null;
  matchStatus: 'MATCHED' | 'PO_NOT_FOUND' | 'NO_DISPATCH_RECORD' | 'INVALID';
  matchedPoId: string | null;
  errorMessage: string | null;
}

export const invoiceImportService = {
  upload: async (file: File): Promise<InvoiceUploadBatch> => {
    const form = new FormData();
    form.append('file', file);
    // Leave Content-Type unset - see bulk-import.service.ts for why an explicit
    // multipart override here would break the multipart boundary.
    const response = await api.post('/invoice-import/upload', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  listBatches: async (): Promise<InvoiceUploadBatch[]> => (await api.get('/invoice-import/batches')).data,

  getBatch: async (id: string): Promise<InvoiceUploadBatch> => (await api.get(`/invoice-import/batches/${id}`)).data,

  getRows: async (id: string): Promise<InvoiceImportRow[]> => (await api.get(`/invoice-import/batches/${id}/rows`)).data,

  deleteBatch: async (id: string): Promise<void> => {
    await api.delete(`/invoice-import/batches/${id}`);
  },
};

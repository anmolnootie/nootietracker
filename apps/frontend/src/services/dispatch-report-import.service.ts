import api from '@/lib/api';

export interface DispatchReportUploadBatch {
  id: string;
  batchCode: string;
  fileName: string;
  platform: string | null;
  uploadedByUserId: string;
  uploadedAt: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  reconciledCount: number;
  mismatchCount: number;
  errorMessage: string | null;
}

export interface DispatchReportRow {
  id: string;
  batchId: string;
  rowIndex: number;
  poNumber: string | null;
  invoiceNumber: string | null;
  invoiceValue: number | null;
  matchStatus: 'RECONCILED' | 'MISMATCH' | 'INVALID';
  matchedPoId: string | null;
  errorMessage: string | null;
}

export const dispatchReportImportService = {
  upload: async (file: File, platform: string): Promise<DispatchReportUploadBatch> => {
    const form = new FormData();
    form.append('file', file);
    form.append('platform', platform);
    // Leave Content-Type unset - see bulk-import.service.ts for why an explicit
    // multipart override here would break the multipart boundary.
    const response = await api.post('/dispatch-report-import/upload', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  listBatches: async (): Promise<DispatchReportUploadBatch[]> => (await api.get('/dispatch-report-import/batches')).data,

  getBatch: async (id: string): Promise<DispatchReportUploadBatch> => (await api.get(`/dispatch-report-import/batches/${id}`)).data,

  getRows: async (id: string): Promise<DispatchReportRow[]> => (await api.get(`/dispatch-report-import/batches/${id}/rows`)).data,
};

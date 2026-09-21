import api from '@/lib/api';

export interface SheetTrackerBatch {
  id: string;
  batchCode: string;
  fileName: string;
  uploadedAt: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  appliedCount: number;
  skippedCount: number;
  errorMessage: string | null;
}

export interface SheetTrackerRow {
  id: string;
  rowIndex: number;
  poNumber: string | null;
  invoiceNumber: string | null;
  channel: string | null;
  location: string | null;
  dispatchDate: string | null;
  invoiceValue: number | null;
  docketAwb: string | null;
  deliveryPartner: string | null;
  deliveryStatus: string | null;
  grnStatus: string | null;
  netDiscrepancy: number | null;
  creditNoteNumber: string | null;
  matchStatus: 'APPLIED' | 'PO_NOT_FOUND' | 'INVALID';
  matchedPoId: string | null;
  actions: string | null;
  errorMessage: string | null;
}

export const sheetTrackerImportService = {
  upload: async (file: File): Promise<SheetTrackerBatch> => {
    const form = new FormData();
    form.append('file', file);
    // Leave Content-Type unset - see bulk-import.service.ts for why.
    return (await api.post('/sheet-tracker-import/upload', form, { headers: { 'Content-Type': undefined } })).data;
  },
  listBatches: async (): Promise<SheetTrackerBatch[]> => (await api.get('/sheet-tracker-import/batches')).data,
  getBatch: async (id: string): Promise<SheetTrackerBatch> => (await api.get(`/sheet-tracker-import/batches/${id}`)).data,
  getRows: async (id: string): Promise<SheetTrackerRow[]> => (await api.get(`/sheet-tracker-import/batches/${id}/rows`)).data,
  deleteBatch: async (id: string): Promise<void> => {
    await api.delete(`/sheet-tracker-import/batches/${id}`);
  },
};

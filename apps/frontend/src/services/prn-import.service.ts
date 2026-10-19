import api from '@/lib/api';

export interface PrnUploadBatch {
  id: string;
  batchCode: string;
  fileName: string;
  uploadedByUserId: string;
  uploadedAt: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  errorMessage: string | null;
}

export interface PrnImportRow {
  id: string;
  batchId: string;
  rowIndex: number;
  lookupCategory: string | null;
  fromDispatchedFc: string | null;
  fromDispatchedFacilityName: string | null;
  stoInvoiceId: string | null;
  wmsOrderId: string | null;
  posFacilityId: string | null;
  posFacilityName: string | null;
  gstTin: string | null;
  legalName: string | null;
  merchantId: string | null;
  merchantName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  invoiceId: string | null;
  invoiceTypeId: number | null;
  invoiceDescription: string | null;
  posTimestamp: string | null;
  itemId: string | null;
  manufacturerId: string | null;
  manufacturer: string | null;
  inventoryType: string | null;
  upcId: string | null;
  productName: string | null;
  mrp: number | null;
  quantity: number | null;
  landingPrice: number | null;
  totalTax: number | null;
  totalCostPrice: number | null;
  prnValue: number | null;
  merchantInvoiceId: string | null;
  txnSign: number | null;
  errorMessage: string | null;
}

export const prnImportService = {
  upload: async (file: File): Promise<PrnUploadBatch> => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/prn-import/upload', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  listBatches: async (): Promise<PrnUploadBatch[]> => (await api.get('/prn-import/batches')).data,

  getBatch: async (id: string): Promise<PrnUploadBatch> => (await api.get(`/prn-import/batches/${id}`)).data,

  getRows: async (id: string): Promise<PrnImportRow[]> => (await api.get(`/prn-import/batches/${id}/rows`)).data,

  deleteBatch: async (id: string): Promise<void> => {
    await api.delete(`/prn-import/batches/${id}`);
  },
};

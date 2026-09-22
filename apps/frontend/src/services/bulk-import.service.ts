import api from '@/lib/api';

export const bulkImportService = {
  upload: async (files: File[], platform: string) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    form.append('platform', platform);
    // Leave Content-Type unset - see po-import.service.ts for why an explicit
    // multipart override here would break the multipart boundary.
    const response = await api.post('/bulk-import/upload', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  listBatches: async (): Promise<any[]> => (await api.get('/bulk-import/batches')).data,

  getBatch: async (id: string): Promise<any> => (await api.get(`/bulk-import/batches/${id}`)).data,

  getRawRows: async (id: string): Promise<any[]> => (await api.get(`/bulk-import/batches/${id}/raw`)).data,

  getProcessedRows: async (id: string): Promise<any[]> => (await api.get(`/bulk-import/batches/${id}/processed`)).data,

  getDeletePreview: async (id: string): Promise<any> => (await api.get(`/bulk-import/batches/${id}/delete-preview`)).data,

  deleteBatch: async (id: string): Promise<any> => (await api.delete(`/bulk-import/batches/${id}`)).data,

  cancelBatch: async (id: string): Promise<any> => (await api.post(`/bulk-import/batches/${id}/cancel`)).data,

  reprocessRow: async (processedRowId: string, corrections: Record<string, any>): Promise<any> =>
    (await api.post(`/bulk-import/processed-rows/${processedRowId}/reprocess`, corrections)).data,

  listColumnMappings: async (): Promise<any[]> => (await api.get('/bulk-import/column-mappings')).data,

  createColumnMapping: async (data: { platform?: string; standardField: string; rawColumnAlias: string }) =>
    (await api.post('/bulk-import/column-mappings', data)).data,

  getSkuSummary: async (filters: { batchId?: string; platform?: string }): Promise<any> =>
    (await api.get('/bulk-import/reports/sku-summary', { params: filters })).data,

  getPoSummary: async (filters: { batchId?: string; platform?: string }): Promise<any> =>
    (await api.get('/bulk-import/reports/po-summary', { params: filters })).data,

  downloadReport: async (report: 'sku-summary' | 'po-summary', filters: { batchId?: string; platform?: string }) => {
    const response = await api.get(`/bulk-import/reports/${report}.xlsx`, { params: filters, responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

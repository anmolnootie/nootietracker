import api from '@/lib/api';

export interface CompilationFilters {
  platform?: string;
  location?: string;
  vendor?: string;
  status?: string;
  poDateFrom?: string;
  poDateTo?: string;
  expiryDateFrom?: string;
  expiryDateTo?: string;
  appointmentDateFrom?: string;
  appointmentDateTo?: string;
  skuCode?: string;
  dispatchStatus?: 'DISPATCHED' | 'NOT_DISPATCHED';
}

export const compilationsService = {
  preview: async (filters: CompilationFilters): Promise<any[]> => (await api.post('/compilations/preview', filters)).data,

  create: async (data: { name?: string; filters: CompilationFilters; poIds: string[] }): Promise<any> =>
    (await api.post('/compilations', data)).data,

  list: async (): Promise<any[]> => (await api.get('/compilations')).data,

  getById: async (id: string): Promise<any> => (await api.get(`/compilations/${id}`)).data,

  delete: async (id: string) => (await api.delete(`/compilations/${id}`)).data,

  getSkuSummary: async (id: string): Promise<any> => (await api.get(`/compilations/${id}/sku-summary`)).data,

  getPoSummary: async (id: string): Promise<any> => (await api.get(`/compilations/${id}/po-summary`)).data,

  downloadReport: async (id: string, report: 'sku-summary' | 'po-summary', code: string) => {
    const response = await api.get(`/compilations/${id}/${report}.xlsx`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${code}-${report}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

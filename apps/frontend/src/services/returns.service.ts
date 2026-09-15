import api from '@/lib/api';
import { ReturnTracker } from '@po-control-tower/shared';

export const returnsService = {
  list: async (): Promise<ReturnTracker[]> => {
    const response = await api.get('/returns');
    return response.data;
  },

  close: async (id: string, data: { rootCause: string; creditNoteNumber?: string; lossAmount?: number; dncnType?: 'DEBIT' | 'CREDIT'; dncnValue?: number }) => {
    const response = await api.put(`/returns/${id}/close`, data);
    return response.data;
  },
};

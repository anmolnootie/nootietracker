import api from '@/lib/api';
import { CreatePORequest, POMaster, POLineItem } from '@po-control-tower/shared';

export const poService = {
  createPO: async (data: CreatePORequest) => {
    const response = await api.post('/pos', data);
    return response.data;
  },

  getAllPOs: async (filters?: { channelId?: string; customerId?: string; status?: string; risk?: string }) => {
    const response = await api.get('/pos', { params: filters });
    return response.data;
  },

  getPOById: async (poId: string): Promise<POMaster> => {
    const response = await api.get(`/pos/${poId}`);
    return response.data;
  },

  getLineItems: async (poId: string): Promise<POLineItem[]> => {
    const response = await api.get(`/pos/${poId}/line-items`);
    return response.data;
  },

  requestAppointment: async (poId: string) => {
    const response = await api.post(`/pos/${poId}/appointment/request`);
    return response.data;
  },

  confirmAppointment: async (poId: string, appointmentDate: Date) => {
    const response = await api.post(`/pos/${poId}/appointment/confirm`, {
      appointmentDate: appointmentDate.toISOString(),
    });
    return response.data;
  },

  markDispatched: async (poId: string, docketNumber: string, transporterId: string) => {
    const response = await api.post(`/pos/${poId}/dispatch/mark`, {
      docketNumber,
      transporterId,
    });
    return response.data;
  },

  updateLogisticsStatus: async (poId: string, status: string) => {
    const response = await api.post(`/pos/${poId}/logistics/update-status`, { status });
    return response.data;
  },

  markAVVReceived: async (poId: string) => {
    const response = await api.post(`/pos/${poId}/avv/mark-received`);
    return response.data;
  },

  recordGRN: async (
    poId: string,
    data: {
      grnNumber: string;
      grnValue: number;
      outcome: string;
      discrepancyReason?: string;
      discrepancyAmount?: number;
    },
  ) => {
    const response = await api.post(`/pos/${poId}/grn/record`, data);
    return response.data;
  },

  getDashboardMetrics: async () => {
    const response = await api.get('/pos/dashboard/metrics');
    return response.data;
  },
};

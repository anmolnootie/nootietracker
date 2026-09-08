import api from '@/lib/api';
import { Task } from '@po-control-tower/shared';

export const tasksService = {
  list: async (params?: { mine?: boolean; status?: string }): Promise<Task[]> => {
    const response = await api.get('/tasks', {
      params: { mine: params?.mine ? 'true' : undefined, status: params?.status },
    });
    return response.data;
  },

  complete: async (id: string, notes?: string) => {
    const response = await api.post(`/tasks/${id}/complete`, { notes });
    return response.data;
  },

  reassign: async (id: string, ownerId: string) => {
    const response = await api.post(`/tasks/${id}/reassign`, { ownerId });
    return response.data;
  },

  escalate: async (id: string) => {
    const response = await api.post(`/tasks/${id}/escalate`);
    return response.data;
  },

  comment: async (id: string, text: string) => {
    const response = await api.post(`/tasks/${id}/comment`, { text });
    return response.data;
  },
};

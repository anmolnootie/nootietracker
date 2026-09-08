import api from '@/lib/api';
import { Notification } from '@po-control-tower/shared';

export const notificationsService = {
  list: async (): Promise<Notification[]> => (await api.get('/notifications')).data,
  unreadCount: async (): Promise<number> => (await api.get('/notifications/unread-count')).data.count,
  markRead: async (id: string) => (await api.post(`/notifications/${id}/read`)).data,
  markAllRead: async () => (await api.post('/notifications/read-all')).data,
};

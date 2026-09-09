import api from '@/lib/api';
import { User, UserRole } from '@po-control-tower/shared';

export const usersService = {
  list: async (): Promise<User[]> => (await api.get('/users')).data,
  create: async (data: { email: string; password: string; name: string; roles: UserRole[] }): Promise<User> =>
    (await api.post('/users', data)).data,
  updateRoles: async (id: string, roles: UserRole[]) => (await api.put(`/users/${id}/roles`, { roles })).data,
  deactivate: async (id: string) => (await api.put(`/users/${id}/deactivate`)).data,
  activate: async (id: string) => (await api.put(`/users/${id}/activate`)).data,
};

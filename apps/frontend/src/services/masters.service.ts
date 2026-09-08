import api from '@/lib/api';
import { CustomerMaster, TransporterMaster, OwnerMaster } from '@po-control-tower/shared';

export const mastersService = {
  listCustomers: async (): Promise<CustomerMaster[]> => (await api.get('/masters/customers')).data,
  createCustomer: async (data: Partial<CustomerMaster>) => (await api.post('/masters/customers', data)).data,

  listTransporters: async (): Promise<TransporterMaster[]> => (await api.get('/masters/transporters')).data,
  createTransporter: async (data: Partial<TransporterMaster>) => (await api.post('/masters/transporters', data)).data,

  listOwners: async (): Promise<OwnerMaster[]> => (await api.get('/masters/owners')).data,
  createOwner: async (data: Partial<OwnerMaster>) => (await api.post('/masters/owners', data)).data,
};

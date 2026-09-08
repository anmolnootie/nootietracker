import api from '@/lib/api';
import { LocationMaster, PendingLocation, PendingLocationStatus, LocationType } from '@po-control-tower/shared';

export interface ApprovePendingLocationInput {
  locationName?: string;
  warehouseCode: string;
  city?: string;
  state?: string;
  platform?: string;
  locationType: LocationType;
  localTatHours?: number;
  nonLocalTatMinDays?: number;
  nonLocalTatMaxDays?: number;
  tatRuleDescription?: string;
}

export const locationsService = {
  list: async (): Promise<LocationMaster[]> => (await api.get('/locations')).data,
  create: async (data: Partial<LocationMaster>) => (await api.post('/locations', data)).data,
  update: async (id: string, data: Partial<LocationMaster>) => (await api.put(`/locations/${id}`, data)).data,

  listPending: async (status?: PendingLocationStatus): Promise<PendingLocation[]> =>
    (await api.get('/locations/pending', { params: status ? { status } : undefined })).data,

  approvePending: async (id: string, data: ApprovePendingLocationInput): Promise<{ location: LocationMaster; resolvedExceptions: number }> =>
    (await api.post(`/locations/pending/${id}/approve`, data)).data,

  rejectPending: async (id: string): Promise<void> => {
    await api.post(`/locations/pending/${id}/reject`);
  },
};

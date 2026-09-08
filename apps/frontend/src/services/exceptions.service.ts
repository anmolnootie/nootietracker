import api from '@/lib/api';
import { BulkException, ExceptionResolutionStatus, ExceptionSeverity, ExceptionType } from '@po-control-tower/shared';

export const exceptionsService = {
  list: async (filters?: { status?: ExceptionResolutionStatus; severity?: ExceptionSeverity; type?: ExceptionType; batchId?: string }): Promise<BulkException[]> =>
    (await api.get('/exceptions', { params: filters })).data,

  resolve: async (id: string, resolutionNotes?: string, resolutionStatus?: ExceptionResolutionStatus) =>
    (await api.put(`/exceptions/${id}/resolve`, { resolutionNotes, resolutionStatus })).data,

  getDetail: async (id: string): Promise<any> => (await api.get(`/exceptions/${id}/detail`)).data,
};

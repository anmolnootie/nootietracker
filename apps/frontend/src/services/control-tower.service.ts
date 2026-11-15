import api from '@/lib/api';

export interface CtQuery {
  from?: string;
  to?: string;
  platform?: string;
  gap?: string;
  stage?: number;
  flag?: number;
  q?: string;
  open?: boolean;
}

const params = (q: CtQuery) => {
  const p: Record<string, string> = {};
  if (q.from) p.from = q.from;
  if (q.to) p.to = q.to;
  if (q.platform && q.platform !== 'ALL') p.platform = q.platform;
  if (q.gap) p.gap = q.gap;
  if (q.stage) p.stage = String(q.stage);
  if (q.flag) p.flag = String(q.flag);
  if (q.q) p.q = q.q;
  if (q.open) p.open = '1';
  return p;
};

export const controlTowerService = {
  meta: async () => (await api.get('/control-tower/meta')).data,
  summary: async (q: CtQuery) => (await api.get('/control-tower/summary', { params: params(q) })).data,
  journey: async (q: CtQuery) => (await api.get('/control-tower/journey', { params: params(q) })).data,
  register: async (q: CtQuery) => (await api.get('/control-tower/register', { params: params(q) })).data,
  po: async (poNumber: string) => (await api.get(`/control-tower/po/${encodeURIComponent(poNumber)}`)).data,
  getTracking: async (poNumber: string) => (await api.get(`/control-tower/po/${encodeURIComponent(poNumber)}/tracking`)).data,
  updateTracking: async (poNumber: string, body: Record<string, string | null>) =>
    (await api.patch(`/control-tower/po/${encodeURIComponent(poNumber)}/tracking`, body)).data,
  issues: async (q: { po?: string; status?: string; open?: boolean; platform?: string; assignee?: string }) =>
    (await api.get('/control-tower/issues', { params: { ...q, open: q.open ? '1' : undefined } })).data,
  createIssue: async (body: Record<string, unknown>) => (await api.post('/control-tower/issues', body)).data,
  updateIssue: async (id: string, body: Record<string, unknown>) => (await api.patch(`/control-tower/issues/${id}`, body)).data,
  audit: async (q: { po?: string; limit?: number }) => (await api.get('/control-tower/audit', { params: q })).data,
  handover: async (body: { mode: 'handed' | 'ack'; date: string; person: string; poNumbers: string[] | string }) =>
    (await api.post('/control-tower/handover', body)).data,
  getSla: async () => (await api.get('/config/control-tower-sla')).data,
  updateSla: async (body: Record<string, number>) => (await api.patch('/config/control-tower-sla', body)).data,
};

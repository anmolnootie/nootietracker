import api from '@/lib/api';

const REPORTS: Record<string, string> = {
  'Open PO Report': 'open-pos.csv',
  'Expiry Report': 'expiry.csv',
  'GRN Ageing Report': 'grn-ageing.csv',
  'Return / Loss Report': 'returns.csv',
};

export const reportsService = {
  available: Object.keys(REPORTS),

  download: async (label: string) => {
    const path = REPORTS[label];
    const response = await api.get(`/reports/${path}`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = path;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

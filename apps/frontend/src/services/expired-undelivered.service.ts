import api from '@/lib/api';

export interface ExpiredUndeliveredRow {
  returnId: string;
  poId: string;
  poNumber: string;
  channel: string;
  location: string;
  invoiceValue: number;
  dispatchDate: string | null;
  poExpiryDate: string;
  daysOverdue: number;
  courierStatus: string | null;
  deliveryPartner: string | null;
  awb: string | null;
  recalledAt: string;
  creditNoteStatus: string | null;
  closed: boolean;
  rootCause: string | null;
  creditNoteNumber: string | null;
}

export interface ExpiredUndeliveredDashboard {
  total: number;
  totalInvoiceValue: number;
  openCreditNoteTasks: number;
  rows: ExpiredUndeliveredRow[];
}

export const expiredUndeliveredService = {
  get: async (): Promise<ExpiredUndeliveredDashboard> => (await api.get('/returns/expired-undelivered')).data,

  downloadExcel: async (): Promise<void> => {
    const response = await api.get('/returns/expired-undelivered/export.xlsx', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'expired-dispatched-not-delivered.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

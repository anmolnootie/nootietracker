import api from '@/lib/api';

export interface ExtractedLineItem {
  skuCode: string;
  skuName: string;
  quantity: number;
  mrp?: number | null;
  upc?: string | null;
  unitPrice?: number | null;
}

export interface ExtractedPODraft {
  poNumber: string | null;
  poDate: string | null;
  poExpiryDate: string | null;
  poDeliveryDate: string | null;
  channelId: string | null;
  customerId: string | null;
  location: string | null;
  poValue: number | null;
  lineItems: ExtractedLineItem[];
  warnings: string[];
}

export const poImportService = {
  extract: async (pdf: File, linesFile?: File): Promise<ExtractedPODraft> => {
    const form = new FormData();
    form.append('pdf', pdf);
    if (linesFile) form.append('linesFile', linesFile);
    // Leave Content-Type unset so the browser generates the multipart boundary itself -
    // the shared `api` instance defaults to application/json, and an explicit
    // 'multipart/form-data' override here would omit the boundary and break parsing.
    const response = await api.post('/po-import/extract', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  extractFromExcel: async (excel: File, platform?: string): Promise<ExtractedPODraft> => {
    const form = new FormData();
    form.append('excel', excel);
    if (platform) form.append('platform', platform);
    const response = await api.post('/po-import/extract-excel', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },
};

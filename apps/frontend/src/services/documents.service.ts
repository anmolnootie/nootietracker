import api from '@/lib/api';
import { DocumentRecord } from '@po-control-tower/shared';

export const documentsService = {
  upload: async (poId: string, documentType: string, file: File): Promise<DocumentRecord> => {
    const form = new FormData();
    form.append('poId', poId);
    form.append('documentType', documentType);
    form.append('file', file);
    // Leave Content-Type unset so the browser generates the multipart boundary itself.
    const response = await api.post('/documents/upload', form, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  listByPo: async (poId: string): Promise<DocumentRecord[]> => {
    const response = await api.get(`/documents/by-po/${poId}`);
    return response.data;
  },

  // The download route requires the JWT bearer header, so a plain <a href>
  // link (no header) won't authenticate - always fetch as a blob instead.
  fetchFile: async (documentId: string): Promise<Blob> => {
    const response = await api.get(`/documents/${documentId}/download`, { responseType: 'blob' });
    return response.data;
  },

  download: async (documentId: string, fileName: string): Promise<void> => {
    const blob = await documentsService.fetchFile(documentId);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  delete: async (documentId: string): Promise<void> => {
    await api.delete(`/documents/${documentId}`);
  },
};

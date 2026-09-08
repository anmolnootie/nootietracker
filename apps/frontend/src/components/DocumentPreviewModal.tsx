import React, { useEffect, useState } from 'react';
import { documentsService } from '@/services/documents.service';
import { DocumentRecord } from '@po-control-tower/shared';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];

const getExtension = (fileName: string): string => fileName.split('.').pop()?.toLowerCase() || '';

interface DocumentPreviewModalProps {
  doc: DocumentRecord;
  onClose: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({ doc, onClose }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    (async () => {
      try {
        const blob = await documentsService.fetchFile(doc.id);
        url = window.URL.createObjectURL(blob);
        if (!cancelled) {
          setBlobUrl(url);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load preview.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (url) window.URL.revokeObjectURL(url);
    };
  }, [doc.id]);

  const ext = getExtension(doc.fileName);
  const isImage = IMAGE_EXTENSIONS.includes(ext);
  const isPdf = ext === 'pdf';

  const handleDownload = () => {
    if (!blobUrl) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = doc.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 py-3 border-b shrink-0">
          <p className="font-medium text-gray-800 truncate pr-4">{doc.fileName}</p>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleDownload}
              disabled={!blobUrl}
              className="px-3 py-1.5 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              Download
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1">
              &times;
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-4 min-h-[300px]">
          {loading && <p className="text-gray-500 text-sm">Loading preview...</p>}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {!loading && !error && blobUrl && (
            <>
              {isImage && <img src={blobUrl} alt={doc.fileName} className="max-w-full max-h-[75vh] object-contain" />}
              {isPdf && <iframe src={blobUrl} title={doc.fileName} className="w-full h-[75vh] border-0" />}
              {!isImage && !isPdf && (
                <div className="text-center">
                  <p className="text-gray-500 text-sm mb-3">No inline preview available for this file type.</p>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm font-medium rounded-lg"
                  >
                    Download to view
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

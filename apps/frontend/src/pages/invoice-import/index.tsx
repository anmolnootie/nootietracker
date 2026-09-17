import React, { useEffect, useRef, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { invoiceImportService, InvoiceUploadBatch } from '@/services/invoice-import.service';
import { format } from 'date-fns';

const STATUS_STYLES: Record<string, string> = {
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

export default function InvoiceImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<InvoiceUploadBatch | null>(null);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState<InvoiceUploadBatch[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadBatches = async () => setBatches(await invoiceImportService.listBatches());

  const handleDelete = async (batch: InvoiceUploadBatch) => {
    if (!window.confirm(`Delete upload history for ${batch.batchCode}? This only removes the upload record - it does not undo any invoice data already written to POs.`)) return;
    setDeletingId(batch.id);
    try {
      await invoiceImportService.deleteBatch(batch.id);
      await loadBatches();
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const handleFile = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setFile(fileList[0]);
    setResult(null);
    setError('');
  };

  const upload = async () => {
    if (!file) {
      setError('Choose or drop an invoice file first.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const res = await invoiceImportService.upload(file);
      setResult(res);
      setFile(null);
      await loadBatches();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8 mb-6">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Invoice Bulk Upload</h2>
        <p className="text-gray-500 text-sm mb-6">
          Upload an invoice sheet (PO Number, Invoice Number, Invoice Value, Invoice Date, AWB Number) - each row is
          matched to its PO, the dispatch record is updated, and Fill Rate % is recomputed automatically.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            dragging ? 'border-nootie-orange bg-nootie-orange-light' : 'border-gray-300 hover:border-nootie-orange'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files)}
          />
          <p className="text-gray-600 font-medium">Drag &amp; drop an Excel/CSV file here, or click to browse</p>
          {file && <p className="mt-4 text-sm text-gray-700">📄 {file.name}</p>}
        </div>

        {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

        <button
          disabled={uploading || !file}
          onClick={upload}
          className="mt-6 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
        >
          {uploading ? 'Processing...' : 'Upload Invoices'}
        </button>

        {result && (
          <div className="mt-8 border rounded-lg p-5 bg-nootie-cream">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-800">{result.fileName}</p>
                <p className="text-xs text-gray-500">{result.batchCode}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[result.status]}`}>{result.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <Stat label="Rows" value={result.totalRows} />
              <Stat label="Matched" value={result.matchedCount} accent="text-green-600" />
              <Stat label="Unmatched" value={result.unmatchedCount} accent="text-nootie-orange-dark" />
            </div>
            <a href={`/invoice-import/${result.id}`} className="text-sm text-nootie-orange-dark hover:underline mt-4 inline-block">
              View Results →
            </a>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-800">Upload History</h3>
        </div>
        {batches.length === 0 ? (
          <p className="p-6 text-gray-500">No uploads yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Batch</th>
                <th className="px-4 py-3 text-left">Uploaded</th>
                <th className="px-4 py-3 text-left">Rows</th>
                <th className="px-4 py-3 text-left">Matched</th>
                <th className="px-4 py-3 text-left">Unmatched</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <a href={`/invoice-import/${b.id}`} className="text-nootie-orange-dark hover:underline">
                      {b.batchCode}
                    </a>
                    <p className="text-xs text-gray-400">{b.fileName}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{format(new Date(b.uploadedAt), 'dd MMM yyyy HH:mm')}</td>
                  <td className="px-4 py-3">{b.totalRows}</td>
                  <td className="px-4 py-3 text-green-700">{b.matchedCount}</td>
                  <td className="px-4 py-3 text-nootie-orange-dark">{b.unmatchedCount}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[b.status]}`}>{b.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button disabled={deletingId === b.id} onClick={() => handleDelete(b)} className="text-xs text-red-600 hover:underline disabled:opacity-50">
                      {deletingId === b.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MainLayout>
  );
}

const Stat: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
  <div>
    <p className={`text-2xl font-bold ${accent || 'text-gray-800'}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);

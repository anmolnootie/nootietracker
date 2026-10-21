import React, { useEffect, useRef, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { prnImportService, PrnUploadBatch } from '@/services/prn-import.service';
import { useBatchProgress } from '@/hooks/useBatchProgress';
import { format } from 'date-fns';

const STATUS_STYLES: Record<string, string> = {
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

export default function PrnImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState<PrnUploadBatch[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadBatches = async () => setBatches(await prnImportService.listBatches());

  // The upload call itself returns almost instantly now (the import runs in
  // the background) - this polls the batch so the page shows live progress
  // instead of a static "Processing..." button with no feedback.
  const liveBatch = useBatchProgress(activeBatchId, prnImportService.getBatch, () => loadBatches());
  const isRunning = liveBatch?.status === 'PROCESSING';

  const handleDelete = async (batch: PrnUploadBatch) => {
    if (!window.confirm(`Delete upload history for ${batch.batchCode}? This only removes the upload record - the rows it already saved stay as they are.`)) return;
    setDeletingId(batch.id);
    try {
      await prnImportService.deleteBatch(batch.id);
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
    setActiveBatchId(null);
    setError('');
  };

  const upload = async () => {
    if (!file) {
      setError('Choose or drop a PRN file first.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const batch = await prnImportService.upload(file);
      setActiveBatchId(batch.id);
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold text-gray-800">Bulk PRN Upload</h2>
          <div className="flex gap-4 text-sm">
            <a href="/invoice-import" className="text-nootie-orange-dark hover:underline">
              ← Invoice Bulk Upload
            </a>
            <a href="/dn-import" className="text-nootie-orange-dark hover:underline">
              Bulk DN Upload →
            </a>
          </div>
        </div>
        <p className="text-gray-500 text-sm mb-6">
          Upload the Purchase Return Note (PRN) export from the quick-commerce portal - debit notes and purchase
          returns line by line (item, quantity, cost price, PRN value). Every row is saved as-is for browsing and
          export; it isn&apos;t matched against POs or returns.
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
          disabled={uploading || isRunning || !file}
          onClick={upload}
          className="mt-6 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
        >
          {uploading ? 'Starting...' : 'Upload PRN File'}
        </button>

        {liveBatch && (
          <div className="mt-8 border rounded-lg p-5 bg-nootie-cream">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-800">{liveBatch.fileName}</p>
                <p className="text-xs text-gray-500">{liveBatch.batchCode}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[liveBatch.status]}`}>
                {isRunning && <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse mr-1.5 align-middle" />}
                {isRunning ? 'Processing' : liveBatch.status}
              </span>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-800">{liveBatch.totalRows}</p>
              <p className="text-xs text-gray-500 mt-1">Rows saved</p>
            </div>
            {isRunning ? (
              <p className="text-xs text-gray-500 mt-4 text-center">Running in the background - this updates automatically, feel free to navigate away.</p>
            ) : (
              <a href={`/prn-import/${liveBatch.id}`} className="text-sm text-nootie-orange-dark hover:underline mt-4 inline-block">
                View Rows →
              </a>
            )}
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
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <a href={`/prn-import/${b.id}`} className="text-nootie-orange-dark hover:underline">
                      {b.batchCode}
                    </a>
                    <p className="text-xs text-gray-400">{b.fileName}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{format(new Date(b.uploadedAt), 'dd MMM yyyy HH:mm')}</td>
                  <td className="px-4 py-3">{b.totalRows}</td>
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

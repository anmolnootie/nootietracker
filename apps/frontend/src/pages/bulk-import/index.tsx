import React, { useEffect, useRef, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { bulkImportService } from '@/services/bulk-import.service';
import { format } from 'date-fns';

const PLATFORMS = ['Blinkit', 'Zepto', 'Instamart', 'BigBasket', 'Flipkart', 'Other'];

const STATUS_STYLES: Record<string, string> = {
  UPLOADING: 'bg-gray-100 text-gray-600',
  READING: 'bg-gray-100 text-gray-600',
  PROCESSING: 'bg-blue-100 text-blue-700',
  VALIDATING: 'bg-blue-100 text-blue-700',
  COMPILING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  COMPLETED_WITH_EXCEPTIONS: 'bg-nootie-orange-light text-nootie-orange-dark',
  FAILED: 'bg-red-100 text-red-700',
};

export default function BulkImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState('Blinkit');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState<any[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ batch: any; preview: any } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadBatches = async () => setBatches(await bulkImportService.listBatches());

  useEffect(() => {
    loadBatches();
  }, []);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setFiles(Array.from(fileList));
    setResults(null);
    setError('');
  };

  const openDeletePreview = async (batch: any) => {
    const preview = await bulkImportService.getDeletePreview(batch.id);
    setDeleteTarget({ batch, preview });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await bulkImportService.deleteBatch(deleteTarget.batch.id);
      setDeleteTarget(null);
      await loadBatches();
    } finally {
      setDeleting(false);
    }
  };

  const upload = async () => {
    if (files.length === 0) {
      setError('Choose or drop at least one file first.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const res = await bulkImportService.upload(files, platform);
      setResults(res);
      setFiles([]);
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
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Import Bulk PO Data</h2>
        <p className="text-gray-500 text-sm mb-6">
          Download the PO export from your Quick Commerce platform, then drop it here. The system reads, cleans,
          maps columns, deduplicates, compiles into the PO Master, reconciles, and flags exceptions - automatically.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            dragging ? 'border-nootie-orange bg-nootie-orange-light' : 'border-gray-300 hover:border-nootie-orange'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <p className="text-gray-600 font-medium">Drag &amp; drop Excel/CSV files here, or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">Multiple files can be uploaded together (e.g. one per day)</p>
          {files.length > 0 && (
            <ul className="mt-4 text-sm text-gray-700 space-y-1">
              {files.map((f) => (
                <li key={f.name}>📄 {f.name}</li>
              ))}
            </ul>
          )}
        </div>

        {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

        <button
          disabled={uploading || files.length === 0}
          onClick={upload}
          className="mt-6 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
        >
          {uploading ? 'Processing...' : 'Import Bulk PO Data'}
        </button>

        {results && (
          <div className="mt-8 space-y-4">
            {results.map((batch) => (
              <div key={batch.id} className="border rounded-lg p-5 bg-nootie-cream">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-800">{batch.fileName}</p>
                    <p className="text-xs text-gray-500">{batch.batchCode}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[batch.status]}`}>
                    {batch.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
                  <Stat label="Rows" value={batch.totalRows} />
                  <Stat label="POs" value={batch.poCount} />
                  <Stat label="New" value={batch.newRecords} accent="text-green-600" />
                  <Stat label="Updated" value={batch.updatedRecords} accent="text-blue-600" />
                  <Stat label="Duplicates" value={batch.duplicateRecords} />
                  <Stat label="Exceptions" value={batch.exceptionRecords} accent="text-nootie-orange-dark" />
                </div>
                <div className="flex gap-4 mt-4">
                  <a href={`/bulk-import/${batch.id}`} className="text-sm text-nootie-orange-dark hover:underline">
                    View Results →
                  </a>
                  <a href={`/bulk-import/reports?batchId=${batch.id}`} className="text-sm text-nootie-orange-dark hover:underline">
                    View SKU &amp; PO Reports →
                  </a>
                </div>
              </div>
            ))}
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
                <th className="px-4 py-3 text-left">Platform</th>
                <th className="px-4 py-3 text-left">Uploaded</th>
                <th className="px-4 py-3 text-left">Rows</th>
                <th className="px-4 py-3 text-left">New / Updated / Dup</th>
                <th className="px-4 py-3 text-left">Exceptions</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <a href={`/bulk-import/${b.id}`} className="text-nootie-orange-dark hover:underline">
                      {b.batchCode}
                    </a>
                    <p className="text-xs text-gray-400">{b.fileName}</p>
                  </td>
                  <td className="px-4 py-3">{b.platform}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{format(new Date(b.uploadedAt), 'dd MMM yyyy HH:mm')}</td>
                  <td className="px-4 py-3">{b.totalRows}</td>
                  <td className="px-4 py-3">
                    {b.newRecords} / {b.updatedRecords} / {b.duplicateRecords}
                  </td>
                  <td className="px-4 py-3">
                    {b.exceptionRecords > 0 ? (
                      <a href={`/bulk-import/${b.id}?tab=exceptions`} className="text-nootie-orange-dark hover:underline font-medium">
                        {b.exceptionRecords}
                      </a>
                    ) : (
                      b.exceptionRecords
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[b.status]}`}>{b.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openDeletePreview(b)} className="text-xs text-red-600 hover:underline">
                      Delete Import
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Delete {deleteTarget.batch.batchCode}?</h3>
            <p className="text-sm text-gray-500 mb-4">{deleteTarget.batch.fileName}</p>
            <div className="border rounded-lg p-4 space-y-2 text-sm mb-6">
              <p>
                <span className="font-semibold text-red-600">{deleteTarget.preview.exclusivePoIds.length}</span> newly created PO record(s) will be permanently removed.
              </p>
              <p>
                <span className="font-semibold text-gray-700">{deleteTarget.preview.preservedPoIds.length}</span> PO(s) touched by this import will be preserved (also referenced by other imports or existed before) - only this import's record of them is removed.
              </p>
              <p className="text-xs text-gray-400 pt-2 border-t">{deleteTarget.preview.totalRows} row(s) from this file will be removed from import history either way.</p>
            </div>
            <div className="flex gap-3">
              <button disabled={deleting} onClick={confirmDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete Import'}
              </button>
              <button disabled={deleting} onClick={() => setDeleteTarget(null)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}

const Stat: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
  <div>
    <p className={`text-2xl font-bold ${accent || 'text-gray-800'}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);

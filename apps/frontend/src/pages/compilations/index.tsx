import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { compilationsService } from '@/services/compilations.service';
import { format } from 'date-fns';

export default function Compilations() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setList(await compilationsService.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await compilationsService.delete(id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Saved Compilations</h2>
            <p className="text-sm text-gray-500 mt-1">
              Named, reusable selections of POs for reporting - these reference the PO Master live, they never copy data.
            </p>
          </div>
          <a href="/compilations/new" className="bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-4 rounded-lg text-sm">
            + Create Compilation
          </a>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : list.length === 0 ? (
          <p className="p-6 text-gray-500">No compilations yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Compilation</th>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-left">Filters</th>
                <th className="px-4 py-3 text-right">POs</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <a href={`/compilations/${c.id}`} className="text-nootie-orange-dark hover:underline">{c.compilationCode}</a>
                    {c.name && <p className="text-xs text-gray-400">{c.name}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {c.periodStart && c.periodEnd ? `${format(new Date(c.periodStart), 'dd MMM')} - ${format(new Date(c.periodEnd), 'dd MMM yyyy')}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {Object.entries(c.filters || {}).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}
                  </td>
                  <td className="px-4 py-3 text-right">{c.poIds?.length ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{format(new Date(c.createdAt), 'dd MMM yyyy HH:mm')}</td>
                  <td className="px-4 py-3">
                    <button disabled={busy === c.id} onClick={() => remove(c.id)} className="text-xs text-red-600 hover:underline disabled:opacity-50">
                      Delete
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

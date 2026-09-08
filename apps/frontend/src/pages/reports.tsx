import React, { useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { reportsService } from '@/services/reports.service';

export default function Reports() {
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (label: string) => {
    setBusy(label);
    try {
      await reportsService.download(label);
    } finally {
      setBusy(null);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Reports</h2>
        <p className="text-gray-600 mb-6">Download live CSV exports.</p>

        <div className="grid grid-cols-2 gap-4">
          {reportsService.available.map((label) => (
            <button
              key={label}
              disabled={busy === label}
              onClick={() => download(label)}
              className="text-left border rounded-lg p-4 hover:border-nootie-orange hover:bg-nootie-orange-light transition-colors disabled:opacity-50"
            >
              <p className="font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-500 mt-1">{busy === label ? 'Downloading...' : 'Click to download CSV'}</p>
            </button>
          ))}
        </div>

        <div className="mt-8 p-4 bg-nootie-orange-light border border-nootie-gold rounded text-nootie-orange-dark text-sm">
          More reports (owner/transporter/customer performance, SLA breach, scheduled digests) will read from the
          same live data as it accumulates.
        </div>
      </div>
    </MainLayout>
  );
}

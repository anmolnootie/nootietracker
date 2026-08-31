import React from 'react';
import { MainLayout } from '@/components/Layout';

export default function GRN() {
  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">GRN Module</h2>
        <p className="text-gray-600">This module will manage Goods Received Notes:</p>
        <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
          <li>Queue of delivered POs awaiting GRN with SLA aging (24h/48h/72h)</li>
          <li>GRN entry form: Value, discrepancy breakdown</li>
          <li>Dropdown-based outcomes: Matched, Mismatched, Shortage, Damage, Other</li>
          <li>Mandatory reason field for non-matched outcomes</li>
          <li>Auto-flag for missing reasons after 5 days</li>
          <li>Credit Note / Debit Note generation</li>
          <li>Automatic routing to Returns/CN if no GRN received</li>
        </ul>
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
          <strong>Coming in Phase 2:</strong> Full GRN workflow with credit note management
        </div>
      </div>
    </MainLayout>
  );
}

import React from 'react';
import { MainLayout } from '@/components/Layout';

export default function Reports() {
  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Reports & Analytics</h2>
        <p className="text-gray-600">Generate and download reports:</p>
        <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
          <li>Open PO report</li>
          <li>Expiry report</li>
          <li>Appointment SLA report</li>
          <li>Dispatch report (with safety buffer visibility)</li>
          <li>Logistics delay report</li>
          <li>GRN aging report</li>
          <li>Discrepancy report</li>
          <li>Return & Loss report</li>
          <li>Owner performance report</li>
          <li>Transporter performance report</li>
          <li>Customer performance report</li>
          <li>SLA breach report</li>
          <li>Scheduled daily 9AM digest and 6PM pending report</li>
        </ul>
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
          <strong>Coming in Phase 4:</strong> Full reporting engine with Excel/PDF exports and dashboards
        </div>
      </div>
    </MainLayout>
  );
}

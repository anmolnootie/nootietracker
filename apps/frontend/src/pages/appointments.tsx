import React from 'react';
import { MainLayout } from '@/components/Layout';

export default function Appointments() {
  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Appointments Module</h2>
        <p className="text-gray-600">This module will allow managing PO appointments with:</p>
        <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
          <li>Queue of POs needing appointment action</li>
          <li>SLA clock tracking (T+12h, T+24h)</li>
          <li>Appointment booking window management (3-4 days before expiry)</li>
          <li>Extension request handling</li>
          <li>Available slot checking and confirmation</li>
        </ul>
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
          <strong>Coming in Phase 2:</strong> Full appointment workflow with integration to customer portals
        </div>
      </div>
    </MainLayout>
  );
}

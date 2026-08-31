import React from 'react';
import { MainLayout } from '@/components/Layout';

export default function Dispatch() {
  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Dispatch Module</h2>
        <p className="text-gray-600">This module will enable warehouse/dispatch owners to:</p>
        <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
          <li>View POs ready for dispatch (sorted by Latest Safe Dispatch Date)</li>
          <li>Compute Ideal Dispatch Date (forward: PO Date + transit time)</li>
          <li>Calculate Latest Safe Dispatch Date (backward from expiry)</li>
          <li>Track dispatch status and mark dispatched</li>
          <li>Generate and capture docket/AWB numbers</li>
          <li>Automatic appointment booking trigger on dispatch</li>
        </ul>
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
          <strong>Coming in Phase 2:</strong> Warehouse inventory integration and dispatch scheduling
        </div>
      </div>
    </MainLayout>
  );
}

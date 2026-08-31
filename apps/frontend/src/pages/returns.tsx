import React from 'react';
import { MainLayout } from '@/components/Layout';

export default function Returns() {
  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Returns Module</h2>
        <p className="text-gray-600">This module will handle returns and credit notes:</p>
        <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
          <li>Auto-created when delivery is rejected or PO expires undelivered</li>
          <li>Mandatory root cause field before closing</li>
          <li>Recall + CN flow for undelivered/expired POs</li>
          <li>Loss calculation: freight + damage + resalable value gap</li>
          <li>CN number, value, and date tracking</li>
          <li>Unified path for all "PO didn't make it" scenarios</li>
        </ul>
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
          <strong>Coming in Phase 2:</strong> Full returns workflow with automated CN creation
        </div>
      </div>
    </MainLayout>
  );
}

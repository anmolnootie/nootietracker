import React from 'react';
import { MainLayout } from '@/components/Layout';

export default function Logistics() {
  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Logistics Tracking</h2>
        <p className="text-gray-600">This module will track shipments in transit:</p>
        <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
          <li>Real-time tracking updates from transporters</li>
          <li>Last movement timestamp and status</li>
          <li>Auto-flag for stale shipments (>24h no movement)</li>
          <li>AVV/Docket Follow-up Tracker with checkbox confirmation</li>
          <li>Automatic reminders (Dispatch Date +3 days, then every 2 days)</li>
          <li>Filterable view of pending AVV confirmations</li>
        </ul>
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
          <strong>Coming in Phase 2:</strong> Transporter API integration for real-time updates
        </div>
      </div>
    </MainLayout>
  );
}

import React from 'react';
import { MainLayout } from '@/components/Layout';

export default function Settings() {
  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">System Settings</h2>
        <p className="text-gray-600">Configure system parameters without code changes:</p>
        
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Risk Thresholds</h3>
            <p className="text-sm text-gray-600">Days-to-expiry bands for Green/Yellow/Orange/Red/Black colors</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">SLA Thresholds</h3>
            <p className="text-sm text-gray-600">Appointment (12h/24h), GRN (24h/48h/72h), AVV follow-up cadence</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Master Data</h3>
            <p className="text-sm text-gray-600">Manage customers, transporters, locations, owner assignments</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">User Management</h3>
            <p className="text-sm text-gray-600">Add/edit/deactivate users, assign roles and responsibilities</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Escalation Matrix</h3>
            <p className="text-sm text-gray-600">Define L1-L4 thresholds and escalation paths</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Notification Rules</h3>
            <p className="text-sm text-gray-600">Configure alert routing, channels (WhatsApp/Email), and preferences</p>
          </div>
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
          <strong>Coming in Phase 4:</strong> Full admin panel with all configuration options
        </div>
      </div>
    </MainLayout>
  );
}

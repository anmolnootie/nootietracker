import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import api from '@/lib/api';

export default function Settings() {
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    api.get('/config/thresholds').then((res) => setConfig(res.data));
  }, []);

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">System Settings</h2>
        <p className="text-gray-600 mb-6">Live values the Status/Risk/SLA engines run on. Master data lives under Masters, users under Users.</p>

        {config && (
          <div className="grid grid-cols-2 gap-6">
            <div className="border rounded p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Risk Thresholds (days to expiry)</h3>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  <tr><td className="py-1 text-gray-600">BLACK</td><td className="py-1 text-right font-medium">&lt; {config.risk.black}</td></tr>
                  <tr><td className="py-1 text-gray-600">RED</td><td className="py-1 text-right font-medium">&lt; {config.risk.red}</td></tr>
                  <tr><td className="py-1 text-gray-600">ORANGE</td><td className="py-1 text-right font-medium">&lt; {config.risk.orange}</td></tr>
                  <tr><td className="py-1 text-gray-600">YELLOW</td><td className="py-1 text-right font-medium">&lt; {config.risk.yellow}</td></tr>
                  <tr><td className="py-1 text-gray-600">GREEN</td><td className="py-1 text-right font-medium">&ge; {config.risk.yellow}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="border rounded p-4">
              <h3 className="font-semibold text-gray-800 mb-3">SLA Thresholds</h3>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  <tr><td className="py-1 text-gray-600">Appointment first reminder</td><td className="py-1 text-right font-medium">{config.sla.appointmentRequestSLAHours}h</td></tr>
                  <tr><td className="py-1 text-gray-600">Appointment escalation</td><td className="py-1 text-right font-medium">{config.sla.appointmentRequestEscalationHours}h</td></tr>
                  <tr><td className="py-1 text-gray-600">GRN ageing bands</td><td className="py-1 text-right font-medium">{config.sla.grnSLAHours.join('h / ')}h</td></tr>
                  <tr><td className="py-1 text-gray-600">AVV follow-up first nag</td><td className="py-1 text-right font-medium">+{config.sla.avvFollowUpInitialDays}d</td></tr>
                  <tr><td className="py-1 text-gray-600">AVV follow-up repeat</td><td className="py-1 text-right font-medium">every {config.sla.avvFollowUpRepeatDays}d</td></tr>
                  <tr><td className="py-1 text-gray-600">Appointment extension window</td><td className="py-1 text-right font-medium">&le; {config.sla.appointmentExtensionWindowDays}d to expiry</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4">
          <a href="/masters" className="border rounded-lg p-4 hover:border-nootie-orange hover:bg-nootie-orange-light">
            <p className="font-medium text-gray-800">Master Data</p>
            <p className="text-xs text-gray-500 mt-1">Customers, transporters, owner assignments</p>
          </a>
          <a href="/users" className="border rounded-lg p-4 hover:border-nootie-orange hover:bg-nootie-orange-light">
            <p className="font-medium text-gray-800">User Management</p>
            <p className="text-xs text-gray-500 mt-1">Add/edit/deactivate users, assign roles</p>
          </a>
        </div>
      </div>
    </MainLayout>
  );
}

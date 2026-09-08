import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { mastersService } from '@/services/masters.service';
import { CustomerMaster, TransporterMaster } from '@po-control-tower/shared';

export default function Masters() {
  const [tab, setTab] = useState<'customers' | 'transporters'>('customers');
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [transporters, setTransporters] = useState<TransporterMaster[]>([]);
  const [customerForm, setCustomerForm] = useState({ name: '', channel: '', appointmentRequirementInDays: '3', escalationContactEmail: '', escalationContactPhone: '' });
  const [transporterForm, setTransporterForm] = useState({ name: '', transitTimeDays: '2', onTimePercentage: '95', cutOffTime: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [c, t] = await Promise.all([mastersService.listCustomers(), mastersService.listTransporters()]);
    setCustomers(c);
    setTransporters(t);
  };

  useEffect(() => {
    load();
  }, []);

  const addCustomer = async () => {
    if (!customerForm.name || !customerForm.channel) return;
    setBusy(true);
    try {
      await mastersService.createCustomer({
        ...customerForm,
        appointmentRequirementInDays: Number(customerForm.appointmentRequirementInDays),
        receivingDays: ['MON', 'WED', 'FRI'],
      });
      setCustomerForm({ name: '', channel: '', appointmentRequirementInDays: '3', escalationContactEmail: '', escalationContactPhone: '' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const addTransporter = async () => {
    if (!transporterForm.name) return;
    setBusy(true);
    try {
      await mastersService.createTransporter({
        name: transporterForm.name,
        transitTimeDays: Number(transporterForm.transitTimeDays),
        onTimePercentage: Number(transporterForm.onTimePercentage),
        cutOffTime: transporterForm.cutOffTime || undefined,
      });
      setTransporterForm({ name: '', transitTimeDays: '2', onTimePercentage: '95', cutOffTime: '' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Master Data</h2>
          <div className="flex gap-1">
            {(['customers', 'transporters'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded text-sm capitalize ${tab === t ? 'bg-nootie-orange-dark text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === 'customers' && (
          <div className="p-6">
            <div className="grid grid-cols-5 gap-2 mb-4">
              <input className="border rounded px-2 py-1 text-sm" placeholder="Name" value={customerForm.name} onChange={(e) => setCustomerForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="border rounded px-2 py-1 text-sm" placeholder="Channel" value={customerForm.channel} onChange={(e) => setCustomerForm((f) => ({ ...f, channel: e.target.value }))} />
              <input className="border rounded px-2 py-1 text-sm" placeholder="Appointment req. days" type="number" value={customerForm.appointmentRequirementInDays} onChange={(e) => setCustomerForm((f) => ({ ...f, appointmentRequirementInDays: e.target.value }))} />
              <input className="border rounded px-2 py-1 text-sm" placeholder="Escalation email" value={customerForm.escalationContactEmail} onChange={(e) => setCustomerForm((f) => ({ ...f, escalationContactEmail: e.target.value }))} />
              <button disabled={busy} onClick={addCustomer} className="px-3 py-1 bg-nootie-orange-dark text-white rounded text-sm hover:bg-nootie-orange disabled:opacity-50">Add Customer</button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Channel</th>
                  <th className="px-3 py-2 text-left">Appt. req. days</th>
                  <th className="px-3 py-2 text-left">Receiving days</th>
                  <th className="px-3 py-2 text-left">Escalation</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2">{c.channel}</td>
                    <td className="px-3 py-2">{c.appointmentRequirementInDays}</td>
                    <td className="px-3 py-2">{c.receivingDays?.join(', ')}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{c.escalationContactEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'transporters' && (
          <div className="p-6">
            <div className="grid grid-cols-5 gap-2 mb-4">
              <input className="border rounded px-2 py-1 text-sm" placeholder="Name" value={transporterForm.name} onChange={(e) => setTransporterForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="border rounded px-2 py-1 text-sm" placeholder="Transit days" type="number" value={transporterForm.transitTimeDays} onChange={(e) => setTransporterForm((f) => ({ ...f, transitTimeDays: e.target.value }))} />
              <input className="border rounded px-2 py-1 text-sm" placeholder="On-time %" type="number" value={transporterForm.onTimePercentage} onChange={(e) => setTransporterForm((f) => ({ ...f, onTimePercentage: e.target.value }))} />
              <input className="border rounded px-2 py-1 text-sm" placeholder="Cut-off time" value={transporterForm.cutOffTime} onChange={(e) => setTransporterForm((f) => ({ ...f, cutOffTime: e.target.value }))} />
              <button disabled={busy} onClick={addTransporter} className="px-3 py-1 bg-nootie-orange-dark text-white rounded text-sm hover:bg-nootie-orange disabled:opacity-50">Add Transporter</button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Transit (days)</th>
                  <th className="px-3 py-2 text-left">On-time %</th>
                  <th className="px-3 py-2 text-left">Cut-off</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transporters.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2">{t.transitTimeDays}</td>
                    <td className="px-3 py-2">{t.onTimePercentage}%</td>
                    <td className="px-3 py-2">{t.cutOffTime || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

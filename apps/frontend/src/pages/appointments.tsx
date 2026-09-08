import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { RiskBadge } from '@/components/Badges';
import { tasksService } from '@/services/tasks.service';
import { poService } from '@/services/po.service';
import { Task, TaskType } from '@po-control-tower/shared';
import { format } from 'date-fns';

export default function Appointments() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const all = await tasksService.list({ status: 'OPEN' });
      setTasks(all.filter((t: any) => t.taskType === TaskType.APPOINTMENT));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const request = async (poId: string) => {
    setBusy(poId);
    try {
      await poService.requestAppointment(poId);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (poId: string, taskId: string) => {
    const date = dateDrafts[taskId];
    if (!date) return;
    setBusy(poId);
    try {
      await poService.confirmAppointment(poId, new Date(date));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const escalate = async (taskId: string) => {
    setBusy(taskId);
    try {
      await tasksService.escalate(taskId);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Appointment Queue</h2>
          <p className="text-sm text-gray-500 mt-1">
            Appointment should land 3-4 days before PO expiry. Extension requests are auto-flagged when no slot is
            booked as expiry approaches.
          </p>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="p-6 text-gray-500">No POs currently need appointment action.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">PO</th>
                <th className="px-4 py-3 text-left">Risk</th>
                <th className="px-4 py-3 text-left">Expiry</th>
                <th className="px-4 py-3 text-left">SLA Due</th>
                <th className="px-4 py-3 text-left">Notes</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tasks.map((task: any) => (
                <tr key={task.id} className={task.status === 'ESCALATED' ? 'bg-red-50' : ''}>
                  <td className="px-4 py-3 font-medium">
                    <a href={`/pos/${task.poId}`} className="text-nootie-orange-dark hover:underline">
                      {task.po?.poNumber}
                    </a>
                  </td>
                  <td className="px-4 py-3">{task.po && <RiskBadge risk={task.po.riskStatus} size="sm" />}</td>
                  <td className="px-4 py-3">{task.po && format(new Date(task.po.poExpiryDate), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3">{format(new Date(task.slaDueAt), 'dd MMM HH:mm')}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate" title={task.notes}>
                    {task.notes || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        disabled={busy === task.poId}
                        onClick={() => request(task.poId)}
                        className="px-2 py-1 bg-nootie-orange-light text-nootie-orange-dark rounded text-xs hover:bg-orange-100 disabled:opacity-50"
                      >
                        Request
                      </button>
                      <input
                        type="date"
                        className="border rounded px-2 py-1 text-xs"
                        value={dateDrafts[task.id] || ''}
                        onChange={(e) => setDateDrafts((d) => ({ ...d, [task.id]: e.target.value }))}
                      />
                      <button
                        disabled={busy === task.poId || !dateDrafts[task.id]}
                        onClick={() => confirm(task.poId, task.id)}
                        className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs hover:bg-green-100 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        disabled={busy === task.id}
                        onClick={() => escalate(task.id)}
                        className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs hover:bg-red-100 disabled:opacity-50"
                      >
                        Escalate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MainLayout>
  );
}

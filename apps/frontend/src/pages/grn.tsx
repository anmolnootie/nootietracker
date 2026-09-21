import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { RiskBadge } from '@/components/Badges';
import { tasksService } from '@/services/tasks.service';
import { poService } from '@/services/po.service';
import { Task, TaskType, GRNOutcome } from '@po-control-tower/shared';
import { formatDistanceToNow } from 'date-fns';

const OUTCOME_LABELS: Record<string, string> = {
  [GRNOutcome.MATCHED]: 'Matched',
  [GRNOutcome.MISMATCHED]: 'Mismatched - reason required',
  [GRNOutcome.SHORTAGE]: 'Shortage',
  [GRNOutcome.DAMAGE]: 'Damage',
  [GRNOutcome.OTHER]: 'Other GRN-level issue',
  [GRNOutcome.NO_GRN]: 'No GRN - invoice not receipted',
};

interface FormState {
  grnNumber: string;
  grnValue: string;
  outcome: string;
  discrepancyReason: string;
  discrepancyAmount: string;
}

export default function GRN() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // ESCALATED is a GRN that has sat past its SLA - still awaiting GRN, so it
      // must stay in the queue (and stand out), not drop off it.
      const all = await tasksService.list({ status: 'OPEN,IN_PROGRESS,ESCALATED' });
      setTasks(all.filter((t: any) => t.taskType === TaskType.GRN));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const form = (poId: string): FormState =>
    forms[poId] || { grnNumber: '', grnValue: '', outcome: '', discrepancyReason: '', discrepancyAmount: '' };

  const setField = (poId: string, field: keyof FormState, value: string) => {
    setForms((f) => ({ ...f, [poId]: { ...form(poId), [field]: value } }));
  };

  const submit = async (poId: string) => {
    const f = form(poId);
    setError(null);
    if (!f.grnNumber || !f.grnValue || !f.outcome) {
      setError('GRN number, value and outcome are required.');
      return;
    }
    if (f.outcome !== GRNOutcome.MATCHED && !f.discrepancyReason) {
      setError('A reason is required unless the outcome is Matched.');
      return;
    }
    setBusy(poId);
    try {
      await poService.recordGRN(poId, {
        grnNumber: f.grnNumber,
        grnValue: Number(f.grnValue),
        outcome: f.outcome,
        discrepancyReason: f.discrepancyReason || undefined,
        discrepancyAmount: f.discrepancyAmount ? Number(f.discrepancyAmount) : undefined,
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to record GRN');
    } finally {
      setBusy(null);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-800">GRN Queue</h2>
          <p className="text-sm text-gray-500 mt-1">Delivered POs awaiting GRN. "No GRN" auto-routes to Returns/CN.</p>
        </div>

        {error && <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{error}</div>}

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="p-6 text-gray-500">No POs currently awaiting GRN.</p>
        ) : (
          <div className="divide-y">
            {tasks.map((task: any) => {
              const f = form(task.poId);
              const needsReason = f.outcome && f.outcome !== GRNOutcome.MATCHED;
              return (
                <div key={task.id} className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <a href={`/pos/${task.poId}`} className="font-medium text-nootie-orange-dark hover:underline">
                        {task.po?.poNumber}
                      </a>
                      {task.po && <span className="ml-3"><RiskBadge risk={task.po.riskStatus} size="sm" /></span>}
                      {task.status === 'ESCALATED' && (
                        <span className="ml-3 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Overdue - escalated</span>
                      )}
                      <span className="ml-3 text-xs text-gray-500">
                        in queue {formatDistanceToNow(new Date(task.createdAt))}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-6 gap-3 items-start">
                    <input
                      className="border rounded px-2 py-1 text-sm col-span-1"
                      placeholder="GRN Number"
                      value={f.grnNumber}
                      onChange={(e) => setField(task.poId, 'grnNumber', e.target.value)}
                    />
                    <input
                      className="border rounded px-2 py-1 text-sm col-span-1"
                      placeholder="GRN Value"
                      type="number"
                      value={f.grnValue}
                      onChange={(e) => setField(task.poId, 'grnValue', e.target.value)}
                    />
                    <select
                      className="border rounded px-2 py-1 text-sm col-span-2"
                      value={f.outcome}
                      onChange={(e) => setField(task.poId, 'outcome', e.target.value)}
                    >
                      <option value="">Outcome...</option>
                      {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="border rounded px-2 py-1 text-sm col-span-1 disabled:bg-gray-100"
                      placeholder="Discrepancy amount"
                      type="number"
                      disabled={!needsReason}
                      value={f.discrepancyAmount}
                      onChange={(e) => setField(task.poId, 'discrepancyAmount', e.target.value)}
                    />
                    <button
                      disabled={busy === task.poId}
                      onClick={() => submit(task.poId)}
                      className="px-3 py-1 bg-nootie-orange-dark text-white rounded text-sm hover:bg-nootie-orange disabled:opacity-50"
                    >
                      Record GRN
                    </button>
                  </div>
                  {needsReason && (
                    <textarea
                      className="mt-3 w-full border rounded px-2 py-1 text-sm"
                      placeholder="Reason (required)"
                      value={f.discrepancyReason}
                      onChange={(e) => setField(task.poId, 'discrepancyReason', e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

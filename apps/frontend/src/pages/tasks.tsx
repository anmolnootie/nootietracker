import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { RiskBadge } from '@/components/Badges';
import { tasksService } from '@/services/tasks.service';
import { Task } from '@po-control-tower/shared';
import { format } from 'date-fns';

const STATUS_TABS = ['OPEN', 'ESCALATED', 'COMPLETED'];

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('OPEN');
  const [busy, setBusy] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      setTasks(await tasksService.list({ mine: true }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const complete = async (id: string) => {
    setBusy(id);
    try {
      await tasksService.complete(id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const escalate = async (id: string) => {
    setBusy(id);
    try {
      await tasksService.escalate(id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const comment = async (id: string) => {
    const text = commentDrafts[id];
    if (!text) return;
    setBusy(id);
    try {
      await tasksService.comment(id, text);
      setCommentDrafts((d) => ({ ...d, [id]: '' }));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const filtered = tasks.filter((t: any) => t.status === tab);

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">My Tasks</h2>
            <p className="text-sm text-gray-500 mt-1">Your personal worklist across every module.</p>
          </div>
          <div className="flex gap-1">
            {STATUS_TABS.map((s) => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`px-3 py-1.5 rounded text-sm ${tab === s ? 'bg-nootie-orange-dark text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {s} ({tasks.filter((t: any) => t.status === s).length})
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-gray-500">Nothing here.</p>
        ) : (
          <div className="divide-y">
            {filtered.map((task: any) => (
              <div key={task.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">{task.taskType.replace(/_/g, ' ')}</span>
                      <a href={`/pos/${task.poId}`} className="font-medium text-nootie-orange-dark hover:underline">
                        {task.po?.poNumber}
                      </a>
                      {task.po && <RiskBadge risk={task.po.riskStatus} size="sm" />}
                    </div>
                    {task.notes && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{task.notes}</p>}
                    <p className="text-xs text-gray-400 mt-2">
                      SLA due {format(new Date(task.slaDueAt), 'dd MMM yyyy HH:mm')} · created {format(new Date(task.createdAt), 'dd MMM')}
                    </p>
                  </div>
                  {tab !== 'COMPLETED' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        disabled={busy === task.id}
                        onClick={() => complete(task.id)}
                        className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs hover:bg-green-100 disabled:opacity-50"
                      >
                        Complete
                      </button>
                      <button
                        disabled={busy === task.id}
                        onClick={() => escalate(task.id)}
                        className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs hover:bg-red-100 disabled:opacity-50"
                      >
                        Escalate
                      </button>
                    </div>
                  )}
                </div>
                {tab !== 'COMPLETED' && (
                  <div className="mt-3 flex gap-2">
                    <input
                      className="flex-1 border rounded px-2 py-1 text-sm"
                      placeholder="Add a comment..."
                      value={commentDrafts[task.id] || ''}
                      onChange={(e) => setCommentDrafts((d) => ({ ...d, [task.id]: e.target.value }))}
                    />
                    <button
                      disabled={busy === task.id || !commentDrafts[task.id]}
                      onClick={() => comment(task.id)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 disabled:opacity-50"
                    >
                      Comment
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

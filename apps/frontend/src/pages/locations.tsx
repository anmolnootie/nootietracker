import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { locationsService } from '@/services/locations.service';
import { LocationType, PendingLocation } from '@po-control-tower/shared';

interface EditDraft {
  locationName: string;
  warehouseCode: string;
  platform: string;
  city: string;
  state: string;
  locationType: LocationType;
  localTatHours: string;
  nonLocalTatMinDays: string;
  nonLocalTatMaxDays: string;
}

const emptyDraft: EditDraft = {
  locationName: '',
  warehouseCode: '',
  platform: '',
  city: '',
  state: '',
  locationType: LocationType.NON_LOCAL,
  localTatHours: '48',
  nonLocalTatMinDays: '10',
  nonLocalTatMaxDays: '8',
};

export default function Locations() {
  const [locations, setLocations] = useState<any[]>([]);
  const [pending, setPending] = useState<PendingLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    locationName: '',
    warehouseCode: '',
    platform: '',
    city: '',
    state: '',
    locationType: LocationType.NON_LOCAL,
    localTatHours: '48',
    nonLocalTatMinDays: '10',
    nonLocalTatMaxDays: '8',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(emptyDraft);

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveDraft, setApproveDraft] = useState<EditDraft>(emptyDraft);
  const [approveMessage, setApproveMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [locs, pend] = await Promise.all([locationsService.list(), locationsService.listPending('PENDING' as any)]);
      setLocations(locs);
      setPending(pend);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addLocation = async () => {
    if (!form.locationName || !form.warehouseCode) return;
    setBusy('new');
    try {
      await locationsService.create({
        locationName: form.locationName,
        warehouseCode: form.warehouseCode,
        platform: form.platform || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        locationType: form.locationType,
        localTatHours: Number(form.localTatHours),
        nonLocalTatMinDays: Number(form.nonLocalTatMinDays),
        nonLocalTatMaxDays: Number(form.nonLocalTatMaxDays),
        tatRuleDescription:
          form.locationType === LocationType.LOCAL
            ? `Local TAT: ${form.localTatHours} Hours`
            : `${form.nonLocalTatMaxDays}-${form.nonLocalTatMinDays} Days before expiry`,
      });
      setForm({ ...form, locationName: '', warehouseCode: '', platform: '', city: '', state: '' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (loc: any) => {
    setBusy(loc.id);
    try {
      await locationsService.update(loc.id, { isActive: !loc.isActive });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (loc: any) => {
    setEditingId(loc.id);
    setEditDraft({
      locationName: loc.locationName,
      warehouseCode: loc.warehouseCode,
      platform: loc.platform || '',
      city: loc.city || '',
      state: loc.state || '',
      locationType: loc.locationType,
      localTatHours: String(loc.localTatHours ?? '48'),
      nonLocalTatMinDays: String(loc.nonLocalTatMinDays ?? '10'),
      nonLocalTatMaxDays: String(loc.nonLocalTatMaxDays ?? '8'),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft);
  };

  const saveEdit = async (id: string) => {
    setBusy(id);
    try {
      await locationsService.update(id, {
        locationName: editDraft.locationName,
        warehouseCode: editDraft.warehouseCode,
        platform: editDraft.platform || null,
        city: editDraft.city || undefined,
        state: editDraft.state || undefined,
        locationType: editDraft.locationType,
        localTatHours: Number(editDraft.localTatHours),
        nonLocalTatMinDays: Number(editDraft.nonLocalTatMinDays),
        nonLocalTatMaxDays: Number(editDraft.nonLocalTatMaxDays),
        tatRuleDescription:
          editDraft.locationType === LocationType.LOCAL
            ? `Local TAT: ${editDraft.localTatHours} Hours`
            : `${editDraft.nonLocalTatMaxDays}-${editDraft.nonLocalTatMinDays} Days before expiry`,
      });
      setEditingId(null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const startApprove = (p: PendingLocation) => {
    setApprovingId(p.id);
    setApproveDraft({
      ...emptyDraft,
      locationName: p.locationName,
      warehouseCode: p.locationName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      platform: p.platform || '',
    });
  };

  const cancelApprove = () => {
    setApprovingId(null);
    setApproveDraft(emptyDraft);
  };

  const submitApprove = async (id: string) => {
    if (!approveDraft.warehouseCode) return;
    setBusy(id);
    setApproveMessage(null);
    try {
      const result = await locationsService.approvePending(id, {
        locationName: approveDraft.locationName,
        warehouseCode: approveDraft.warehouseCode,
        platform: approveDraft.platform || undefined,
        city: approveDraft.city || undefined,
        state: approveDraft.state || undefined,
        locationType: approveDraft.locationType,
        localTatHours: Number(approveDraft.localTatHours),
        nonLocalTatMinDays: Number(approveDraft.nonLocalTatMinDays),
        nonLocalTatMaxDays: Number(approveDraft.nonLocalTatMaxDays),
      });
      setApprovingId(null);
      setApproveMessage(
        result.resolvedExceptions > 0
          ? `✅ "${result.location.locationName}" approved - ${result.resolvedExceptions} related exception(s) resolved.`
          : `✅ "${result.location.locationName}" approved.`,
      );
      await load();
    } finally {
      setBusy(null);
    }
  };

  const rejectPending = async (id: string) => {
    setBusy(id);
    try {
      await locationsService.rejectPending(id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <MainLayout>
      <div className="flex justify-end mb-4">
        <button
          onClick={load}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {approveMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">{approveMessage}</div>
      )}

      {pending.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-800">🆕 New Locations Awaiting Approval ({pending.length})</h2>
            <p className="text-sm text-gray-500 mt-1">
              Warehouse names seen on incoming POs that don't match the Location Master yet - they're defaulting to NON-LOCAL TAT until approved.
            </p>
          </div>
          <div className="divide-y">
            {pending.map((p) => (
              <div key={p.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{p.locationName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Seen {p.occurrenceCount}x - platform: {p.platform || 'unknown'} - e.g. PO {p.examplePoNumber || '-'}
                    </p>
                  </div>
                  {approvingId !== p.id && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => startApprove(p)}
                        className="text-xs bg-nootie-orange-dark hover:bg-nootie-orange text-white px-3 py-1.5 rounded"
                      >
                        Approve
                      </button>
                      <button disabled={busy === p.id} onClick={() => rejectPending(p.id)} className="text-xs text-red-600 hover:underline">
                        Reject
                      </button>
                    </div>
                  )}
                </div>

                {approvingId === p.id && (
                  <div className="mt-3 bg-nootie-cream rounded-lg p-4 grid grid-cols-8 gap-2 items-end">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Location Name</label>
                      <input
                        className="w-full border rounded px-2 py-1.5 text-sm"
                        value={approveDraft.locationName}
                        onChange={(e) => setApproveDraft((d) => ({ ...d, locationName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Warehouse Code</label>
                      <input
                        className="w-full border rounded px-2 py-1.5 text-sm"
                        value={approveDraft.warehouseCode}
                        onChange={(e) => setApproveDraft((d) => ({ ...d, warehouseCode: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Platform</label>
                      <input
                        className="w-full border rounded px-2 py-1.5 text-sm"
                        value={approveDraft.platform}
                        onChange={(e) => setApproveDraft((d) => ({ ...d, platform: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">City</label>
                      <input
                        className="w-full border rounded px-2 py-1.5 text-sm"
                        value={approveDraft.city}
                        onChange={(e) => setApproveDraft((d) => ({ ...d, city: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Type</label>
                      <select
                        className="w-full border rounded px-2 py-1.5 text-sm"
                        value={approveDraft.locationType}
                        onChange={(e) => setApproveDraft((d) => ({ ...d, locationType: e.target.value as LocationType }))}
                      >
                        <option value={LocationType.LOCAL}>LOCAL</option>
                        <option value={LocationType.NON_LOCAL}>NON_LOCAL</option>
                      </select>
                    </div>
                    {approveDraft.locationType === LocationType.LOCAL ? (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Local TAT (hrs)</label>
                        <input
                          type="number"
                          className="w-full border rounded px-2 py-1.5 text-sm"
                          value={approveDraft.localTatHours}
                          onChange={(e) => setApproveDraft((d) => ({ ...d, localTatHours: e.target.value }))}
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">TAT Max (days)</label>
                          <input
                            type="number"
                            className="w-full border rounded px-2 py-1.5 text-sm"
                            value={approveDraft.nonLocalTatMaxDays}
                            onChange={(e) => setApproveDraft((d) => ({ ...d, nonLocalTatMaxDays: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">TAT Min (days)</label>
                          <input
                            type="number"
                            className="w-full border rounded px-2 py-1.5 text-sm"
                            value={approveDraft.nonLocalTatMinDays}
                            onChange={(e) => setApproveDraft((d) => ({ ...d, nonLocalTatMinDays: e.target.value }))}
                          />
                        </div>
                      </>
                    )}
                    <div className="flex gap-2">
                      <button
                        disabled={busy === p.id}
                        onClick={() => submitApprove(p.id)}
                        className="bg-green-600 hover:bg-green-700 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button onClick={cancelApprove} className="text-sm text-gray-500 hover:underline px-2">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Location &amp; TAT Master</h2>
          <p className="text-sm text-gray-500 mt-1">
            Source of truth for LOCAL vs NON-LOCAL dispatch TAT. LOCAL dispatches 48h before expiry by default;
            NON-LOCAL dispatches 8-10 days before expiry. Change it here, not in code.
          </p>
        </div>

        <div className="p-6 border-b grid grid-cols-9 gap-2 items-end">
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Location Name</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" value={form.locationName} onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Warehouse Code</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" value={form.warehouseCode} onChange={(e) => setForm((f) => ({ ...f, warehouseCode: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Platform</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">City</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select className="w-full border rounded px-2 py-1.5 text-sm" value={form.locationType} onChange={(e) => setForm((f) => ({ ...f, locationType: e.target.value as LocationType }))}>
              <option value={LocationType.LOCAL}>LOCAL</option>
              <option value={LocationType.NON_LOCAL}>NON_LOCAL</option>
            </select>
          </div>
          {form.locationType === LocationType.LOCAL ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Local TAT (hrs)</label>
              <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={form.localTatHours} onChange={(e) => setForm((f) => ({ ...f, localTatHours: e.target.value }))} />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">TAT Max (days)</label>
                <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={form.nonLocalTatMaxDays} onChange={(e) => setForm((f) => ({ ...f, nonLocalTatMaxDays: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">TAT Min (days)</label>
                <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={form.nonLocalTatMinDays} onChange={(e) => setForm((f) => ({ ...f, nonLocalTatMinDays: e.target.value }))} />
              </div>
            </>
          )}
          <button disabled={busy === 'new'} onClick={addLocation} className="bg-nootie-orange-dark hover:bg-nootie-orange text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
            + Add
          </button>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Location</th>
                  <th className="px-4 py-3 text-left">Warehouse Code</th>
                  <th className="px-4 py-3 text-left">Platform</th>
                  <th className="px-4 py-3 text-left">City / State</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">TAT Rule</th>
                  <th className="px-4 py-3 text-left">Active</th>
                  <th className="px-4 py-3 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {locations.map((loc) =>
                  editingId === loc.id ? (
                    <tr key={loc.id} className="bg-nootie-orange-light/40">
                      <td className="px-4 py-2">
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={editDraft.locationName}
                          onChange={(e) => setEditDraft((d) => ({ ...d, locationName: e.target.value }))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={editDraft.warehouseCode}
                          onChange={(e) => setEditDraft((d) => ({ ...d, warehouseCode: e.target.value }))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={editDraft.platform}
                          onChange={(e) => setEditDraft((d) => ({ ...d, platform: e.target.value }))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <input
                            placeholder="City"
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={editDraft.city}
                            onChange={(e) => setEditDraft((d) => ({ ...d, city: e.target.value }))}
                          />
                          <input
                            placeholder="State"
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={editDraft.state}
                            onChange={(e) => setEditDraft((d) => ({ ...d, state: e.target.value }))}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={editDraft.locationType}
                          onChange={(e) => setEditDraft((d) => ({ ...d, locationType: e.target.value as LocationType }))}
                        >
                          <option value={LocationType.LOCAL}>LOCAL</option>
                          <option value={LocationType.NON_LOCAL}>NON_LOCAL</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        {editDraft.locationType === LocationType.LOCAL ? (
                          <input
                            type="number"
                            placeholder="Hours"
                            className="w-20 border rounded px-2 py-1 text-sm"
                            value={editDraft.localTatHours}
                            onChange={(e) => setEditDraft((d) => ({ ...d, localTatHours: e.target.value }))}
                          />
                        ) : (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Max"
                              className="w-16 border rounded px-2 py-1 text-sm"
                              value={editDraft.nonLocalTatMaxDays}
                              onChange={(e) => setEditDraft((d) => ({ ...d, nonLocalTatMaxDays: e.target.value }))}
                            />
                            <input
                              type="number"
                              placeholder="Min"
                              className="w-16 border rounded px-2 py-1 text-sm"
                              value={editDraft.nonLocalTatMinDays}
                              onChange={(e) => setEditDraft((d) => ({ ...d, nonLocalTatMinDays: e.target.value }))}
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400">{loc.isActive ? 'Active' : 'Inactive'}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button disabled={busy === loc.id} onClick={() => saveEdit(loc.id)} className="text-xs text-green-600 hover:underline mr-3 disabled:opacity-50">
                          Save
                        </button>
                        <button onClick={cancelEdit} className="text-xs text-gray-500 hover:underline">
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={loc.id}>
                      <td className="px-4 py-3 font-medium">{loc.locationName}</td>
                      <td className="px-4 py-3">{loc.warehouseCode}</td>
                      <td className="px-4 py-3">
                        {loc.platform ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">{loc.platform}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{[loc.city, loc.state].filter(Boolean).join(', ') || '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${loc.locationType === 'LOCAL' ? 'bg-nootie-orange-light text-nootie-orange-dark' : 'bg-blue-100 text-blue-700'}`}
                        >
                          {loc.locationType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {loc.locationType === 'LOCAL' ? `Local TAT: ${loc.localTatHours} Hours` : `${loc.nonLocalTatMaxDays}-${loc.nonLocalTatMinDays} Days before expiry`}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          disabled={busy === loc.id}
                          onClick={() => toggleActive(loc)}
                          className={`px-2 py-1 rounded text-xs ${loc.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                        >
                          {loc.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => startEdit(loc)} className="text-xs text-nootie-orange-dark hover:underline">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

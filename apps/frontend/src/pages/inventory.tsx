import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { poService, InventoryRow } from '@/services/po.service';
import { inventoryService, SkuMasterRow, UploadSkuFileResult, InventoryDashboard, UpdateSkuMasterInput } from '@/services/inventory.service';

type SortKey = 'unitsOrdered' | 'unitsDispatched' | 'unitsAvailable' | 'unitsPending' | 'totalValue' | 'fulfilmentPercent';
type Tab = 'insights' | 'sku-master' | 'rollup';

const TABS: { key: Tab; label: string }[] = [
  { key: 'insights', label: '📊 Insights' },
  { key: 'sku-master', label: '🏷 SKU Master' },
  { key: 'rollup', label: '📦 SKU Rollup' },
];

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<Tab>('insights');
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('unitsOrdered');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [skuRows, setSkuRows] = useState<SkuMasterRow[]>([]);
  const [skuLoading, setSkuLoading] = useState(true);
  const [skuSearch, setSkuSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadSkuFileResult | null>(null);
  const [uploadError, setUploadError] = useState('');

  const [dashboard, setDashboard] = useState<InventoryDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<UpdateSkuMasterInput>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newSku, setNewSku] = useState({ skuCode: '', skuName: '', upc: '', mrp: '', unitPrice: '', stockQuantity: '' });
  const [addError, setAddError] = useState('');

  const loadDashboard = () => {
    setDashboardLoading(true);
    inventoryService
      .getDashboard()
      .then(setDashboard)
      .finally(() => setDashboardLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    poService
      .getInventoryRollup()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  const loadSkuMaster = () => {
    setSkuLoading(true);
    inventoryService
      .listSkuMaster()
      .then(setSkuRows)
      .finally(() => setSkuLoading(false));
  };

  useEffect(() => {
    loadSkuMaster();
  }, []);

  useEffect(() => {
    const q = skuSearch.trim();
    const timer = setTimeout(() => {
      inventoryService.listSkuMaster(q || undefined).then(setSkuRows);
    }, 250);
    return () => clearTimeout(timer);
  }, [skuSearch]);

  const handleFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    setUploadResult(null);
    try {
      const result = await inventoryService.uploadSkuFile(file);
      setUploadResult(result);
      loadSkuMaster();
      loadDashboard();
    } catch (err: any) {
      setUploadError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeSku = async (id: string) => {
    await inventoryService.deleteSkuMaster(id);
    setSkuRows((rs) => rs.filter((r) => r.id !== id));
    loadDashboard();
  };

  const startEdit = (row: SkuMasterRow) => {
    setEditingId(row.id);
    setEditDraft({
      skuName: row.skuName,
      upc: row.upc,
      mrp: row.mrp,
      unitPrice: row.unitPrice,
      stockQuantity: row.stockQuantity,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const saveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      const updated = await inventoryService.updateSkuMaster(id, editDraft);
      setSkuRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
      setEditingId(null);
      setEditDraft({});
      loadDashboard();
    } finally {
      setSavingEdit(false);
    }
  };

  const submitNewSku = async () => {
    setAddError('');
    if (!newSku.skuCode.trim() || !newSku.skuName.trim()) {
      setAddError('SKU code and product name are required.');
      return;
    }
    try {
      const created = await inventoryService.createSkuMaster({
        skuCode: newSku.skuCode.trim(),
        skuName: newSku.skuName.trim(),
        upc: newSku.upc.trim() || null,
        mrp: newSku.mrp ? Number(newSku.mrp) : null,
        unitPrice: newSku.unitPrice ? Number(newSku.unitPrice) : null,
        stockQuantity: newSku.stockQuantity ? Number(newSku.stockQuantity) : 0,
      });
      setSkuRows((rs) => [created, ...rs]);
      setAddingNew(false);
      setNewSku({ skuCode: '', skuName: '', upc: '', mrp: '', unitPrice: '', stockQuantity: '' });
      loadDashboard();
    } catch (err: any) {
      setAddError(err.response?.data?.message || 'Could not add SKU');
    }
  };

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          skuCount: acc.skuCount + 1,
          unitsOrdered: acc.unitsOrdered + r.unitsOrdered,
          unitsDispatched: acc.unitsDispatched + r.unitsDispatched,
          unitsPending: acc.unitsPending + r.unitsPending,
          totalValue: acc.totalValue + r.totalValue,
        }),
        { skuCount: 0, unitsOrdered: 0, unitsDispatched: 0, unitsPending: 0, totalValue: 0 },
      ),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.skuCode.toLowerCase().includes(q) || (r.upc || '').includes(q)) : rows;
    return [...filtered].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [rows, search, sortKey]);

  return (
    <MainLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Inventory</h2>
        <p className="text-sm text-gray-500 mt-1">
          Movement across every live PO, per product - there's no separate stock/goods-receipt system, so this reflects ordered, dispatched, available, and pending quantities from PO line items.
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === t.key
                ? 'bg-white text-nootie-orange-dark border border-b-0 border-gray-200 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Inventory Insights */}
      {activeTab === 'insights' && (
      <div className="mb-8">
        {dashboardLoading ? (
          <p className="text-gray-500">Analysing...</p>
        ) : !dashboard ? null : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <StatTile label="SKUs in Master" value={dashboard.summary.totalSkus.toLocaleString()} color="blue" />
              <StatTile label="Stock on Hand (Units)" value={dashboard.summary.totalStockUnits.toLocaleString()} color="blue" />
              <StatTile
                label="Dead Stock Value"
                value={`₹${dashboard.summary.deadStockValue.toLocaleString()} (${dashboard.summary.deadStockSkuCount} SKUs)`}
                color="orange"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <h4 className="font-semibold text-gray-800">🔥 Highest-Moving SKUs</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Ranked by units dispatched across every live PO</p>
                </div>
                {dashboard.highestMoving.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">No dispatch activity yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {dashboard.highestMoving.map((r, i) => (
                        <tr key={r.skuCode}>
                          <td className="px-4 py-2 text-gray-400 text-xs w-6">{i + 1}</td>
                          <td className="px-4 py-2">
                            <p className="font-medium text-gray-800">{r.skuName}</p>
                            <p className="text-xs text-gray-400 font-mono">{r.skuCode}</p>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <p className="font-semibold text-green-600">{r.unitsDispatched.toLocaleString()}</p>
                            <p className="text-xs text-gray-400">dispatched</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <h4 className="font-semibold text-gray-800">💀 Dead Stock</h4>
                  <p className="text-xs text-gray-500 mt-0.5">In SKU Master with stock on hand but nothing ever dispatched</p>
                </div>
                {dashboard.deadStock.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">No dead stock detected.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {dashboard.deadStock.map((r) => (
                        <tr key={r.skuCode}>
                          <td className="px-4 py-2">
                            <p className="font-medium text-gray-800">{r.skuName}</p>
                            <p className="text-xs text-gray-400 font-mono">{r.skuCode}</p>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <p className="text-gray-700">{r.stockQuantity.toLocaleString()} units</p>
                            <p className="text-xs text-nootie-orange-dark">₹{r.valueAtRisk.toLocaleString()} at risk</p>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">
                              {r.reason === 'NEVER_ORDERED' ? 'Never Ordered' : 'Zero Dispatched'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* SKU Master Upload */}
      {activeTab === 'sku-master' && (
      <>
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Upload SKU / Stock File</h3>
        <p className="text-sm text-gray-500 mb-4">
          Upload an Excel/CSV stock or SKU list - the system extracts SKU code, name, UPC, MRP, unit price, and stock
          quantity and updates the SKU Master below (matched by SKU code).
        </p>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors border-gray-300 hover:border-nootie-orange"
        >
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFile(e.target.files)} />
          <p className="text-gray-600 font-medium">{uploading ? 'Processing...' : 'Click to choose an Excel/CSV file'}</p>
        </div>

        {uploadError && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{uploadError}</div>}

        {uploadResult && (
          <div className="mt-4 border rounded-lg p-4 bg-nootie-cream">
            <p className="font-medium text-gray-800 mb-2">{uploadResult.fileName}</p>
            <div className="grid grid-cols-4 gap-4 text-center mb-2">
              <div>
                <p className="text-xs text-gray-500">Rows Read</p>
                <p className="text-lg font-semibold">{uploadResult.totalRows}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Created</p>
                <p className="text-lg font-semibold text-green-600">{uploadResult.created}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Updated</p>
                <p className="text-lg font-semibold text-blue-600">{uploadResult.updated}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Skipped</p>
                <p className="text-lg font-semibold text-gray-500">{uploadResult.skipped}</p>
              </div>
            </div>
            {uploadResult.warnings.length > 0 && (
              <ul className="text-xs text-nootie-orange-dark list-disc list-inside space-y-0.5">
                {uploadResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* SKU Master */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6 border-b flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-800">SKU Master ({skuRows.length})</h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search SKU code, name, or UPC..."
              value={skuSearch}
              onChange={(e) => setSkuSearch(e.target.value)}
              className="w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              onClick={() => {
                setAddingNew((v) => !v);
                setAddError('');
              }}
              className="px-3 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm rounded-lg whitespace-nowrap"
            >
              {addingNew ? 'Cancel' : '+ Add SKU'}
            </button>
          </div>
        </div>

        {addingNew && (
          <div className="p-4 bg-nootie-cream border-b">
            <div className="grid grid-cols-6 gap-2 mb-2">
              <input
                placeholder="SKU Code"
                value={newSku.skuCode}
                onChange={(e) => setNewSku((s) => ({ ...s, skuCode: e.target.value }))}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
              <input
                placeholder="Product Name"
                value={newSku.skuName}
                onChange={(e) => setNewSku((s) => ({ ...s, skuName: e.target.value }))}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
              <input
                placeholder="UPC"
                value={newSku.upc}
                onChange={(e) => setNewSku((s) => ({ ...s, upc: e.target.value }))}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
              <input
                placeholder="MRP"
                type="number"
                value={newSku.mrp}
                onChange={(e) => setNewSku((s) => ({ ...s, mrp: e.target.value }))}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
              <input
                placeholder="Unit Price"
                type="number"
                value={newSku.unitPrice}
                onChange={(e) => setNewSku((s) => ({ ...s, unitPrice: e.target.value }))}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
              <input
                placeholder="Stock Qty"
                type="number"
                value={newSku.stockQuantity}
                onChange={(e) => setNewSku((s) => ({ ...s, stockQuantity: e.target.value }))}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              />
            </div>
            {addError && <p className="text-xs text-red-600 mb-2">{addError}</p>}
            <button onClick={submitNewSku} className="px-3 py-1.5 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-xs rounded-lg">
              Save SKU
            </button>
          </div>
        )}

        {skuLoading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : skuRows.length === 0 ? (
          <p className="p-6 text-gray-500">No SKUs uploaded yet. Use the upload box above to add your first file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">SKU Code</th>
                  <th className="px-4 py-3 text-left">Product Name</th>
                  <th className="px-4 py-3 text-left">UPC</th>
                  <th className="px-4 py-3 text-right">MRP</th>
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Stock Qty</th>
                  <th className="px-4 py-3 text-left">Last Uploaded</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {skuRows.map((r) =>
                  editingId === r.id ? (
                    <tr key={r.id} className="bg-nootie-orange-light/40">
                      <td className="px-4 py-3 font-mono text-xs">{r.skuCode}</td>
                      <td className="px-4 py-2">
                        <input
                          value={editDraft.skuName ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, skuName: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={editDraft.upc ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, upc: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={editDraft.mrp ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, mrp: e.target.value ? Number(e.target.value) : null }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={editDraft.unitPrice ?? ''}
                          onChange={(e) => setEditDraft((d) => ({ ...d, unitPrice: e.target.value ? Number(e.target.value) : null }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={editDraft.stockQuantity ?? 0}
                          onChange={(e) => setEditDraft((d) => ({ ...d, stockQuantity: Number(e.target.value) }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right"
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {r.lastUploadedAt ? new Date(r.lastUploadedAt).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          disabled={savingEdit}
                          onClick={() => saveEdit(r.id)}
                          className="text-xs text-green-600 hover:underline mr-3 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button onClick={cancelEdit} className="text-xs text-gray-500 hover:underline">
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-mono text-xs">{r.skuCode}</td>
                      <td className="px-4 py-3">{r.skuName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.upc || '-'}</td>
                      <td className="px-4 py-3 text-right">{r.mrp != null ? `₹${Number(r.mrp).toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 text-right">{r.unitPrice != null ? `₹${Number(r.unitPrice).toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 text-right">{r.stockQuantity.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {r.lastUploadedAt ? new Date(r.lastUploadedAt).toLocaleString() : '-'}
                        {r.sourceFileName && <span className="block text-gray-400">{r.sourceFileName}</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => startEdit(r)} className="text-xs text-nootie-orange-dark hover:underline mr-3">
                          Edit
                        </button>
                        <button onClick={() => removeSku(r.id)} className="text-xs text-red-600 hover:underline">
                          Remove
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
      </>
      )}

      {/* SKU Rollup */}
      {activeTab === 'rollup' && (
      <>
      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatTile label="SKUs Tracked" value={totals.skuCount.toLocaleString()} color="blue" />
        <StatTile label="Units Ordered" value={totals.unitsOrdered.toLocaleString()} color="blue" />
        <StatTile label="Units Dispatched" value={totals.unitsDispatched.toLocaleString()} color="green" />
        <StatTile label="Units Pending" value={totals.unitsPending.toLocaleString()} color="orange" />
        <StatTile label="Total Value" value={`₹${(totals.totalValue / 100000).toFixed(1)}L`} color="blue" />
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-800">SKU Rollup</h3>
          <input
            type="text"
            placeholder="Search product name, item code, or UPC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : filteredRows.length === 0 ? (
          <p className="p-6 text-gray-500">{rows.length === 0 ? 'No line items on any live PO yet.' : 'No products match your search.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Product Name</th>
                  <th className="px-4 py-3 text-left">Item Code</th>
                  <SortableHeader label="Units Ordered" sortKey="unitsOrdered" active={sortKey} onSort={setSortKey} />
                  <SortableHeader label="Dispatched" sortKey="unitsDispatched" active={sortKey} onSort={setSortKey} />
                  <SortableHeader label="Available" sortKey="unitsAvailable" active={sortKey} onSort={setSortKey} />
                  <SortableHeader label="Pending" sortKey="unitsPending" active={sortKey} onSort={setSortKey} />
                  <SortableHeader label="Fulfilment %" sortKey="fulfilmentPercent" active={sortKey} onSort={setSortKey} />
                  <SortableHeader label="Value" sortKey="totalValue" active={sortKey} onSort={setSortKey} />
                  <th className="px-4 py-3 text-right">POs</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((r) => (
                  <tr key={r.skuCode}>
                    <td className="px-4 py-3">{r.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {r.skuCode}
                      {r.upc && r.upc !== r.skuCode && <span className="block text-gray-400">UPC: {r.upc}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{r.unitsOrdered.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{r.unitsDispatched.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{r.unitsAvailable.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={r.unitsPending > 0 ? 'text-nootie-orange-dark font-medium' : ''}>{r.unitsPending.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.fulfilmentPercent >= 100
                            ? 'bg-green-100 text-green-800'
                            : r.fulfilmentPercent > 0
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.fulfilmentPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">₹{r.totalValue.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{r.poCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
    </MainLayout>
  );
}

const SortableHeader: React.FC<{ label: string; sortKey: SortKey; active: SortKey; onSort: (k: SortKey) => void }> = ({ label, sortKey, active, onSort }) => (
  <th
    onClick={() => onSort(sortKey)}
    className={`px-4 py-3 text-right cursor-pointer select-none hover:text-nootie-orange-dark ${active === sortKey ? 'text-nootie-orange-dark' : ''}`}
  >
    {label}
    {active === sortKey && ' ↓'}
  </th>
);

const StatTile: React.FC<{ label: string; value: string; color: 'blue' | 'green' | 'orange' }> = ({ label, value, color }) => {
  const colorClasses = {
    blue: 'bg-nootie-orange-light border-nootie-gold text-nootie-orange-dark',
    green: 'bg-green-50 border-green-200 text-green-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
  };
  return (
    <div className={`border-l-4 p-6 rounded bg-white shadow ${colorClasses[color].split(' ').slice(0, 2).join(' ')}`}>
      <p className="text-gray-600 text-sm">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${colorClasses[color].split(' ')[2]}`}>{value}</p>
    </div>
  );
};

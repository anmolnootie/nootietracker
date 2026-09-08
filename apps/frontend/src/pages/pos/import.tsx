import React, { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { DuplicatePOModal } from '@/components/DuplicatePOModal';
import { poService } from '@/services/po.service';
import { poImportService, ExtractedPODraft } from '@/services/po-import.service';
import { CreatePORequest, POMaster } from '@po-control-tower/shared';

const toDateInputValue = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export default function ImportPO() {
  const router = useRouter();
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const linesInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'choose' | 'pdf' | 'excel'>('choose');
  const [excelPlatform, setExcelPlatform] = useState('blinkit');

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [draft, setDraft] = useState<ExtractedPODraft | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [duplicate, setDuplicate] = useState<POMaster | null>(null);

  const [formData, setFormData] = useState({
    poNumber: '',
    poDate: '',
    poExpiryDate: '',
    channelId: '',
    customerId: '',
    location: '',
    poValue: '',
    lineItems: [{ skuCode: '', skuName: '', quantity: '', mrp: '', unitPrice: '' }],
  });

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    const pdf = pdfInputRef.current?.files?.[0];
    if (!pdf) {
      setExtractError('Please choose the PO PDF.');
      return;
    }
    setExtracting(true);
    setExtractError('');
    try {
      const linesFile = linesInputRef.current?.files?.[0];
      const result = await poImportService.extract(pdf, linesFile);
      setDraft(result);
      setFormData({
        poNumber: result.poNumber || '',
        poDate: toDateInputValue(result.poDate),
        poExpiryDate: toDateInputValue(result.poExpiryDate),
        channelId: result.channelId || '',
        customerId: result.customerId || '',
        location: result.location || '',
        poValue: result.poValue != null ? String(result.poValue) : '',
        lineItems:
          result.lineItems.length > 0
            ? result.lineItems.map((li) => ({
                skuCode: li.skuCode,
                skuName: li.skuName,
                quantity: String(li.quantity),
                mrp: li.mrp != null ? String(li.mrp) : '',
                unitPrice: li.unitPrice != null ? String(li.unitPrice) : '',
              }))
            : [{ skuCode: '', skuName: '', quantity: '', mrp: '', unitPrice: '' }],
      });
    } catch (err: any) {
      setExtractError(err.response?.data?.message || 'Failed to extract PO. You can still enter it manually.');
    } finally {
      setExtracting(false);
    }
  };

  const handleExtractExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    const excel = excelInputRef.current?.files?.[0];
    if (!excel) {
      setExtractError('Please choose an Excel/CSV file.');
      return;
    }
    setExtracting(true);
    setExtractError('');
    try {
      const result = await poImportService.extractFromExcel(excel, excelPlatform || undefined);
      setDraft(result);
      setFormData({
        poNumber: result.poNumber || '',
        poDate: toDateInputValue(result.poDate),
        poExpiryDate: toDateInputValue(result.poExpiryDate),
        channelId: result.channelId || '',
        customerId: result.customerId || '',
        location: result.location || '',
        poValue: result.poValue != null ? String(result.poValue) : '',
        lineItems:
          result.lineItems.length > 0
            ? result.lineItems.map((li) => ({
                skuCode: li.skuCode,
                skuName: li.skuName,
                quantity: String(li.quantity),
                mrp: li.mrp != null ? String(li.mrp) : '',
                unitPrice: li.unitPrice != null ? String(li.unitPrice) : '',
              }))
            : [{ skuCode: '', skuName: '', quantity: '', mrp: '', unitPrice: '' }],
      });
    } catch (err: any) {
      setExtractError(err.response?.data?.message || 'Failed to read the Excel/CSV file. You can still enter it manually.');
    } finally {
      setExtracting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((f) => ({ ...f, [name]: value }));
  };

  const handleLineItemChange = (index: number, field: string, value: string) => {
    const updated = [...formData.lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setFormData((f) => ({ ...f, lineItems: updated }));
  };

  const addLineItem = () => {
    setFormData((f) => ({
      ...f,
      lineItems: [...f.lineItems, { skuCode: '', skuName: '', quantity: '', mrp: '', unitPrice: '' }],
    }));
  };

  const removeLineItem = (index: number) => {
    setFormData((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== index) }));
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const dupCheck = await poService.checkDuplicate(formData.poNumber);
      if (dupCheck.exists && dupCheck.po) {
        setDuplicate(dupCheck.po);
        setCreating(false);
        return;
      }

      const createRequest: CreatePORequest = {
        poNumber: formData.poNumber,
        poDate: new Date(formData.poDate),
        poExpiryDate: new Date(formData.poExpiryDate),
        channelId: formData.channelId,
        customerId: formData.customerId,
        location: formData.location,
        poValue: parseFloat(formData.poValue),
        lineItems: formData.lineItems
          .filter((li) => li.skuCode && li.skuName && li.quantity)
          .map((li) => ({
            skuCode: li.skuCode,
            skuName: li.skuName,
            quantity: parseFloat(li.quantity),
            mrp: li.mrp ? parseFloat(li.mrp) : null,
            unitPrice: li.unitPrice ? parseFloat(li.unitPrice) : null,
          })),
      };
      const result = await poService.createPO(createRequest);
      router.push(`/pos/${result.id}`);
    } catch (err: any) {
      setCreateError(err.response?.data?.message || 'Failed to create PO');
    } finally {
      setCreating(false);
    }
  };

  if (mode === 'choose') {
    return (
      <MainLayout>
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Import PO</h2>
          <p className="text-gray-500 text-sm mb-6">How would you like to bring this PO into the system?</p>

          <div className="grid grid-cols-2 gap-6">
            <button
              onClick={() => setMode('pdf')}
              className="text-left bg-white rounded-lg shadow p-6 border-2 border-transparent hover:border-nootie-orange transition-colors"
            >
              <p className="text-3xl mb-3">📄</p>
              <h3 className="text-lg font-semibold text-gray-800 mb-1">Upload PDF</h3>
              <p className="text-sm text-gray-500">
                For a single PO. Upload the customer's PO PDF (and an Excel/CSV line-item export if they provide
                one) - the system extracts what it can, then you review and confirm before it's saved.
              </p>
            </button>

            <button
              onClick={() => setMode('excel')}
              className="text-left bg-white rounded-lg shadow p-6 border-2 border-transparent hover:border-nootie-orange transition-colors"
            >
              <p className="text-3xl mb-3">📊</p>
              <h3 className="text-lg font-semibold text-gray-800 mb-1">Upload Excel / CSV</h3>
              <p className="text-sm text-gray-500">
                For a single PO. Upload one Excel/CSV file with this PO's line items - the system guesses the
                columns, then you review and confirm before it's saved.
              </p>
            </button>
          </div>

          <p className="text-sm text-gray-500 mt-6">
            Need to upload many POs across multiple files at once, with automatic deduplication? Use{' '}
            <button onClick={() => router.push('/bulk-import')} className="text-nootie-orange-dark hover:underline font-medium">
              Bulk Import
            </button>{' '}
            instead.
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold text-gray-800">
            Import PO — {mode === 'pdf' ? 'Upload PDF' : 'Upload Excel / CSV'}
          </h2>
          <button
            onClick={() => {
              setMode('choose');
              setDraft(null);
              setExtractError('');
            }}
            className="text-sm text-nootie-orange-dark hover:underline"
          >
            ← Choose a different method
          </button>
        </div>
        <p className="text-gray-500 text-sm mb-6">
          {mode === 'pdf'
            ? 'Upload the PO PDF (and the line-items Excel export, if the customer portal provides one) to pre-fill the form below.'
            : "Upload one Excel/CSV file containing this PO's header details and line items to pre-fill the form below."}{' '}
          Review every field before confirming - this is a NEEDS REVIEW step, nothing is saved yet.
        </p>

        {!draft && mode === 'pdf' && (
          <form onSubmit={handleExtract} className="space-y-4 border-b pb-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PO PDF *</label>
              <input ref={pdfInputRef} type="file" accept=".pdf" className="w-full text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Line-items Excel/CSV <span className="text-gray-400">(optional, but strongly recommended)</span>
              </label>
              <input ref={linesInputRef} type="file" accept=".xlsx,.xls,.csv" className="w-full text-sm" />
              <p className="text-xs text-gray-400 mt-1">
                PDF tables don't extract reliably - if the portal also exports an Excel/CSV line-item list for the
                same PO, upload it here for accurate SKUs and quantities.
              </p>
            </div>
            {extractError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{extractError}</div>}
            <button
              type="submit"
              disabled={extracting}
              className="bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              {extracting ? 'Extracting...' : 'Extract PO Data'}
            </button>
          </form>
        )}

        {!draft && mode === 'excel' && (
          <form onSubmit={handleExtractExcel} className="space-y-4 border-b pb-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
              <select
                value={excelPlatform}
                onChange={(e) => setExcelPlatform(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Generic / Other</option>
                <option value="blinkit">Blinkit</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Picking the platform lets the system recognize that platform's exact export columns (e.g. Blinkit's
                "item_id" / "units_ordered") instead of only generic guesses.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Excel / CSV File *</label>
              <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="w-full text-sm" required />
              <p className="text-xs text-gray-400 mt-1">
                One file, one PO - the first row should be column headers (PO Number, PO Date, Expiry Date,
                Platform, Warehouse, SKU, Product Name, Quantity, etc.), with a row per line item.
              </p>
            </div>
            {extractError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{extractError}</div>}
            <button
              type="submit"
              disabled={extracting}
              className="bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              {extracting ? 'Reading file...' : 'Extract PO Data'}
            </button>
          </form>
        )}

        {draft && (
          <>
            {draft.warnings.length > 0 && (
              <div className="bg-nootie-orange-light border border-nootie-gold text-nootie-orange-dark px-4 py-3 rounded mb-6 text-sm">
                <p className="font-medium mb-1">Please double-check the following before confirming:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {draft.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleConfirm} className="space-y-6">
              <div className="border-b pb-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-700">PO Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PO Number *</label>
                    <input type="text" name="poNumber" value={formData.poNumber} onChange={handleInputChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Channel *</label>
                    <input type="text" name="channelId" value={formData.channelId} onChange={handleInputChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                    <input type="text" name="customerId" value={formData.customerId} onChange={handleInputChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                    <input type="text" name="location" value={formData.location} onChange={handleInputChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PO Date *</label>
                    <input type="date" name="poDate" value={formData.poDate} onChange={handleInputChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date *</label>
                    <input type="date" name="poExpiryDate" value={formData.poExpiryDate} onChange={handleInputChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PO Value *</label>
                    <input type="number" name="poValue" value={formData.poValue} onChange={handleInputChange} required step="0.01" className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 text-gray-700">Line Items</h3>
                <div className="space-y-4">
                  {formData.lineItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-6 gap-4 pb-4 border-b">
                      <input type="text" placeholder="SKU Code" value={item.skuCode} onChange={(e) => handleLineItemChange(index, 'skuCode', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" required />
                      <input type="text" placeholder="SKU Name" value={item.skuName} onChange={(e) => handleLineItemChange(index, 'skuName', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" required />
                      <input type="number" placeholder="Quantity" value={item.quantity} onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" required step="0.01" />
                      <input type="number" placeholder="MRP" value={item.mrp} onChange={(e) => handleLineItemChange(index, 'mrp', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" step="0.01" />
                      <input type="number" placeholder="Unit Price" value={item.unitPrice} onChange={(e) => handleLineItemChange(index, 'unitPrice', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" step="0.01" />
                      {formData.lineItems.length > 1 && (
                        <button type="button" onClick={() => removeLineItem(index)} className="w-full px-3 py-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg text-sm">
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addLineItem} className="mt-4 px-4 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-gray-400">
                  + Add Line Item
                </button>
              </div>

              {createError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{createError}</div>}

              <div className="flex gap-4 pt-6 border-t">
                <button type="submit" disabled={creating} className="flex-1 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50">
                  {creating ? 'Creating...' : 'Confirm & Create PO'}
                </button>
                <button type="button" onClick={() => setDraft(null)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 rounded-lg">
                  Start Over
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {duplicate && (
        <DuplicatePOModal poNumber={formData.poNumber} existing={duplicate} onCancel={() => setDuplicate(null)} />
      )}
    </MainLayout>
  );
}

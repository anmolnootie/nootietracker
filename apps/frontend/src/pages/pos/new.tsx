import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { DuplicatePOModal } from '@/components/DuplicatePOModal';
import { poService } from '@/services/po.service';
import { CreatePORequest, POMaster } from '@po-control-tower/shared';

export default function CreatePO() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState<POMaster | null>(null);
  const [formData, setFormData] = useState({
    poNumber: '',
    poDate: '',
    poExpiryDate: '',
    channelId: '',
    customerId: '',
    location: '',
    poValue: '',
    lineItems: [{ skuCode: '', skuName: '', quantity: '' }],
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleLineItemChange = (
    index: number,
    field: string,
    value: string,
  ) => {
    const updatedItems = [...formData.lineItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setFormData({ ...formData, lineItems: updatedItems });
  };

  const addLineItem = () => {
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, { skuCode: '', skuName: '', quantity: '' }],
    });
  };

  const removeLineItem = (index: number) => {
    setFormData({
      ...formData,
      lineItems: formData.lineItems.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const dupCheck = await poService.checkDuplicate(formData.poNumber);
      if (dupCheck.exists && dupCheck.po) {
        setDuplicate(dupCheck.po);
        setLoading(false);
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
        lineItems: formData.lineItems.map((item) => ({
          skuCode: item.skuCode,
          skuName: item.skuName,
          quantity: parseFloat(item.quantity),
        })),
      };

      const result = await poService.createPO(createRequest);
      router.push(`/pos/${result.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create PO');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8 max-w-3xl">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Create New PO</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="border-b pb-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-700">PO Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PO Number *</label>
                <input
                  type="text"
                  name="poNumber"
                  value={formData.poNumber}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Channel *</label>
                <input
                  type="text"
                  name="channelId"
                  value={formData.channelId}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Blinkit, BigBasket"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                <input
                  type="text"
                  name="customerId"
                  value={formData.customerId}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PO Date *</label>
                <input
                  type="date"
                  name="poDate"
                  value={formData.poDate}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date *</label>
                <input
                  type="date"
                  name="poExpiryDate"
                  value={formData.poExpiryDate}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PO Value *</label>
                <input
                  type="number"
                  name="poValue"
                  value={formData.poValue}
                  onChange={handleInputChange}
                  required
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-700">Line Items</h3>
            <div className="space-y-4">
              {formData.lineItems.map((item, index) => (
                <div key={index} className="grid grid-cols-4 gap-4 pb-4 border-b">
                  <div>
                    <input
                      type="text"
                      placeholder="SKU Code"
                      value={item.skuCode}
                      onChange={(e) => handleLineItemChange(index, 'skuCode', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="SKU Name"
                      value={item.skuName}
                      onChange={(e) => handleLineItemChange(index, 'skuName', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="Quantity"
                      value={item.quantity}
                      onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                      required
                      step="0.01"
                    />
                  </div>
                  <div>
                    {formData.lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="w-full px-3 py-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addLineItem}
              className="mt-4 px-4 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-gray-400"
            >
              + Add Line Item
            </button>
          </div>

          {/* Buttons */}
          <div className="flex gap-4 pt-6 border-t">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create PO'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {duplicate && (
        <DuplicatePOModal poNumber={formData.poNumber} existing={duplicate} onCancel={() => setDuplicate(null)} />
      )}
    </MainLayout>
  );
}

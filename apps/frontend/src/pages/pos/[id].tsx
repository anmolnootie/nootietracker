import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { RiskBadge, StatusBadge } from '@/components/Badges';
import { poService } from '@/services/po.service';
import { POMaster, POLineItem } from '@po-control-tower/shared';
import { format } from 'date-fns';

export default function PODetail() {
  const router = useRouter();
  const { id } = router.query;
  const [po, setPO] = useState<POMaster | null>(null);
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!id) return;

    const fetchPO = async () => {
      try {
        const [poData, itemsData] = await Promise.all([
          poService.getPOById(id as string),
          poService.getLineItems(id as string),
        ]);
        setPO(poData);
        setLineItems(itemsData);
      } catch (error) {
        console.error('Failed to fetch PO', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPO();
  }, [id]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading PO details...</p>
        </div>
      </MainLayout>
    );
  }

  if (!po) {
    return (
      <MainLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded">
          PO not found
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* PO Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{po.poNumber}</h2>
            <p className="text-gray-500 text-sm mt-1">ID: {po.id}</p>
          </div>
          <div className="text-right">
            <div className="mb-2">
              <RiskBadge risk={po.riskStatus} size="lg" />
            </div>
            <p className="text-sm text-gray-600">Priority: {po.priorityScore.toFixed(1)}/100</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <InfoBox label="PO Date" value={format(new Date(po.poDate), 'dd MMM yyyy')} />
          <InfoBox label="Expiry Date" value={format(new Date(po.poExpiryDate), 'dd MMM yyyy')} />
          <InfoBox label="PO Value" value={`₹${po.poValue.toLocaleString()}`} />
          <InfoBox label="Status" value={<StatusBadge status={po.status} />} />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <InfoBox label="Channel" value={po.channelId} />
          <InfoBox label="Customer" value={po.customerId} />
          <InfoBox label="Location" value={po.location} />
          <InfoBox label="Overall Owner" value={po.overallOwnerId} />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex">
            {['overview', 'appointment', 'dispatch', 'logistics', 'grn'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-4 font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Line Items</h3>
              {lineItems.length === 0 ? (
                <p className="text-gray-500">No line items</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left">SKU Code</th>
                      <th className="px-4 py-2 text-left">SKU Name</th>
                      <th className="px-4 py-2 text-right">Quantity</th>
                      <th className="px-4 py-2 text-left">Availability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-medium">{item.skuCode}</td>
                        <td className="px-4 py-3">{item.skuName}</td>
                        <td className="px-4 py-3 text-right">{item.quantity}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              item.availability === 'AVAILABLE'
                                ? 'bg-green-100 text-green-800'
                                : item.availability === 'SHORT'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {item.availability}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'appointment' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Appointment Details</h3>
              <p className="text-gray-500">Appointment details coming soon...</p>
            </div>
          )}

          {activeTab === 'dispatch' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Dispatch Details</h3>
              <p className="text-gray-500">Dispatch details coming soon...</p>
            </div>
          )}

          {activeTab === 'logistics' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Logistics Tracking</h3>
              <p className="text-gray-500">Logistics details coming soon...</p>
            </div>
          )}

          {activeTab === 'grn' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">GRN Details</h3>
              <p className="text-gray-500">GRN details coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

interface InfoBoxProps {
  label: string;
  value: string | React.ReactNode;
}

const InfoBox: React.FC<InfoBoxProps> = ({ label, value }) => (
  <div className="border rounded p-3">
    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
    <p className="text-sm font-medium text-gray-800">{value}</p>
  </div>
);

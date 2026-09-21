import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { RiskBadge } from '@/components/Badges';
import { PowerBIEmbed } from '@/components/PowerBIEmbed';
import { poService } from '@/services/po.service';

interface DashboardMetrics {
  totalPOs: number;
  byRisk: Record<string, number>;
  byStatus: Record<string, number>;
  byFulfilment: Record<string, number>;
  totalValue: number;
  expiringToday: number;
  bulkImportCount: number;
  openExceptions: number;
  totalOrderedQty: number;
  totalDeliveredQty: number;
  totalPendingQty: number;
  totalPendingValue: number;
  readyToDispatchCount: number;
}

const DISPATCH_STATUS_STYLES: Record<string, string> = {
  DISPATCH_NOW: 'bg-orange-100 text-orange-800',
  DISPATCH_OVERDUE: 'bg-red-100 text-red-700',
  CRITICAL: 'bg-gray-800 text-white',
};

const DISPATCH_STATUS_LABELS: Record<string, string> = {
  DISPATCH_NOW: 'Due Today',
  DISPATCH_OVERDUE: 'Overdue',
  CRITICAL: 'Critical',
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [readyModalOpen, setReadyModalOpen] = useState(false);
  const [readyList, setReadyList] = useState<any[]>([]);
  const [readyLoading, setReadyLoading] = useState(false);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await poService.getDashboardMetrics();
        setMetrics(data);
      } catch (error) {
        console.error('Failed to fetch metrics', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  const openReadyToDispatch = async () => {
    setReadyModalOpen(true);
    setReadyLoading(true);
    try {
      const data = await poService.listReadyToDispatch();
      setReadyList(data);
    } catch (error) {
      console.error('Failed to fetch ready-to-dispatch list', error);
      setReadyList([]);
    } finally {
      setReadyLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </MainLayout>
    );
  }

  if (!metrics) {
    return (
      <MainLayout>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded">
          Failed to load dashboard metrics
        </div>
      </MainLayout>
    );
  }

  const riskData = [
    { label: 'BLACK', value: metrics.byRisk.black, color: 'bg-gray-800', textColor: 'text-gray-800' },
    { label: 'RED', value: metrics.byRisk.red, color: 'bg-red-600', textColor: 'text-red-600' },
    { label: 'ORANGE', value: metrics.byRisk.orange, color: 'bg-orange-500', textColor: 'text-orange-500' },
    { label: 'YELLOW', value: metrics.byRisk.yellow, color: 'bg-yellow-400', textColor: 'text-yellow-400' },
    { label: 'GREEN', value: metrics.byRisk.green, color: 'bg-green-600', textColor: 'text-green-600' },
  ];

  return (
    <MainLayout>
      {/* KPI Tiles */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <KPITile label="Critical POs" value={metrics.byRisk.black} color="red" />
        <KPITile label="High Risk POs" value={metrics.byRisk.red} color="orange" />
        <KPITile label="Open Value" value={`₹${(metrics.totalValue / 100000).toFixed(1)}L`} color="blue" />
        <KPITile label="Expiring Today" value={metrics.expiringToday} color="red" />
        <KPITile label="Ready to Dispatch" value={metrics.readyToDispatchCount} color="green" onClick={openReadyToDispatch} />
      </div>

      {/* Risk Distribution */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h3 className="text-lg font-semibold mb-6 text-gray-800">Risk Distribution</h3>
        <div className="flex gap-4">
          {riskData.map((item) => (
            <div key={item.label} className="flex-1 text-center">
              <div className={`text-3xl font-bold ${item.textColor} mb-2`}>{item.value}</div>
              <div className={`h-2 rounded ${item.color} mb-2`}></div>
              <div className="text-sm text-gray-600">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bulk Import / Fulfilment Overview */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Fulfilment Status</h3>
          <div className="space-y-2 text-sm">
            {[
              { label: 'GREEN', value: metrics.byFulfilment.green, color: 'text-green-600' },
              { label: 'YELLOW', value: metrics.byFulfilment.yellow, color: 'text-yellow-500' },
              { label: 'ORANGE', value: metrics.byFulfilment.orange, color: 'text-orange-500' },
              { label: 'RED', value: metrics.byFulfilment.red, color: 'text-red-600' },
            ].map((f) => (
              <div key={f.label} className="flex justify-between">
                <span className="text-gray-600">{f.label}</span>
                <span className={`font-medium ${f.color}`}>{f.value}</span>
              </div>
            ))}
          </div>
          <a href="/bulk-import" className="block mt-4 text-xs text-nootie-orange-dark hover:underline">
            {metrics.bulkImportCount} PO(s) from bulk import →
          </a>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Operational Overview</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Total Ordered Qty</span><span className="font-medium">{metrics.totalOrderedQty}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Total Delivered Qty</span><span className="font-medium">{metrics.totalDeliveredQty}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Total Pending Qty</span><span className="font-medium">{metrics.totalPendingQty}</span></div>
            <div className="flex justify-between pt-2 border-t"><span className="text-gray-600">Fulfilment %</span><span className="font-medium">{metrics.totalOrderedQty > 0 ? ((metrics.totalDeliveredQty / metrics.totalOrderedQty) * 100).toFixed(1) : '0.0'}%</span></div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Financial Overview</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Total PO Value</span><span className="font-medium">₹{(metrics.totalValue / 100000).toFixed(1)}L</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Pending Value</span><span className="font-medium">₹{Number(metrics.totalPendingValue).toLocaleString()}</span></div>
            <div className="flex justify-between pt-2 border-t"><span className="text-gray-600">Open Exceptions</span><span className="font-medium text-nootie-orange-dark">{metrics.openExceptions}</span></div>
          </div>
          <a href="/exceptions" className="block mt-4 text-xs text-nootie-orange-dark hover:underline">
            View exception queue →
          </a>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">PO Status Overview</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Received</span>
              <span className="font-medium">{metrics.byStatus.received}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Appointment Confirmed</span>
              <span className="font-medium">{metrics.byStatus.appointmentConfirmed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Ready for Dispatch</span>
              <span className="font-medium">{metrics.byStatus.readyForDispatch}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">In Transit</span>
              <span className="font-medium">{metrics.byStatus.inTransit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">GRN Pending</span>
              <span className="font-medium">{metrics.byStatus.grnPending}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Summary Stats</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Open POs</span>
              <span className="font-medium text-lg">{metrics.totalPOs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Value</span>
              <span className="font-medium text-lg">₹{(metrics.totalValue / 100000).toFixed(1)}L</span>
            </div>
            <div className="flex justify-between pt-4 border-t">
              <span className="text-gray-600">Critical + High Risk</span>
              <span className="font-medium">{metrics.byRisk.black + metrics.byRisk.red}</span>
            </div>
          </div>
        </div>
      </div>

      {readyModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Ready to Dispatch</h3>
                <p className="text-sm text-gray-500 mt-1">Dispatch window open and not yet shipped - due today, or overdue.</p>
              </div>
              <button onClick={() => setReadyModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                &times;
              </button>
            </div>
            <div className="overflow-y-auto">
              {readyLoading ? (
                <p className="p-6 text-gray-500">Loading...</p>
              ) : readyList.length === 0 ? (
                <p className="p-6 text-gray-500">No POs are currently ready to dispatch.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left">PO</th>
                      <th className="px-4 py-3 text-left">Location</th>
                      <th className="px-4 py-3 text-left">Risk</th>
                      <th className="px-4 py-3 text-left">Recommended Dispatch Date</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {readyList.map((d) => (
                      <tr key={d.id}>
                        <td className="px-4 py-3 font-medium">
                          <a href={`/pos/${d.po.id}`} className="text-nootie-orange-dark hover:underline">
                            {d.po.poNumber}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{d.po.location}</td>
                        <td className="px-4 py-3">
                          <RiskBadge risk={d.po.riskStatus} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {d.recommendedDispatchDate ? new Date(d.recommendedDispatchDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${DISPATCH_STATUS_STYLES[d.dispatchPlanStatus] || 'bg-gray-100 text-gray-700'}`}>
                            {DISPATCH_STATUS_LABELS[d.dispatchPlanStatus] || d.dispatchPlanStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Power BI - below the operational dashboard */}
      <div className="mt-8">
        <PowerBIEmbed title="Power BI Dashboard" height="85vh" />
      </div>
    </MainLayout>
  );
}

interface KPITileProps {
  label: string;
  value: string | number;
  color: 'red' | 'orange' | 'blue' | 'green';
  onClick?: () => void;
}

const KPITile: React.FC<KPITileProps> = ({ label, value, color, onClick }) => {
  const colorClasses = {
    red: 'bg-red-50 border-red-200',
    orange: 'bg-orange-50 border-orange-200',
    blue: 'bg-nootie-orange-light border-nootie-gold',
    green: 'bg-green-50 border-green-200',
  };

  const textClasses = {
    red: 'text-red-600',
    orange: 'text-orange-600',
    blue: 'text-nootie-orange-dark',
    green: 'text-green-600',
  };

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={`border-l-4 p-6 rounded bg-white shadow text-left w-full ${colorClasses[color]} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <p className="text-gray-600 text-sm">{label}</p>
      <p className={`text-3xl font-bold ${textClasses[color]} mt-2`}>{value}</p>
    </Wrapper>
  );
};

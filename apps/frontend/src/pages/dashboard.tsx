import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { RiskBadge } from '@/components/Badges';
import { poService } from '@/services/po.service';

interface DashboardMetrics {
  totalPOs: number;
  byRisk: Record<string, number>;
  byStatus: Record<string, number>;
  totalValue: number;
  expiringToday: number;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KPITile label="Critical POs" value={metrics.byRisk.black} color="red" />
        <KPITile label="High Risk POs" value={metrics.byRisk.red} color="orange" />
        <KPITile label="Open Value" value={`₹${(metrics.totalValue / 100000).toFixed(1)}L`} color="blue" />
        <KPITile label="Expiring Today" value={metrics.expiringToday} color="red" />
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
    </MainLayout>
  );
}

interface KPITileProps {
  label: string;
  value: string | number;
  color: 'red' | 'orange' | 'blue' | 'green';
}

const KPITile: React.FC<KPITileProps> = ({ label, value, color }) => {
  const colorClasses = {
    red: 'bg-red-50 border-red-200',
    orange: 'bg-orange-50 border-orange-200',
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
  };

  const textClasses = {
    red: 'text-red-600',
    orange: 'text-orange-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
  };

  return (
    <div className={`border-l-4 p-6 rounded bg-white shadow ${colorClasses[color]}`}>
      <p className="text-gray-600 text-sm">{label}</p>
      <p className={`text-3xl font-bold ${textClasses[color]} mt-2`}>{value}</p>
    </div>
  );
};

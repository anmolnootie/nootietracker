import React from 'react';
import { RiskStatus } from '@po-control-tower/shared';

interface RiskBadgeProps {
  risk: RiskStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ risk, size = 'md' }) => {
  const colorMap: Record<RiskStatus, { bg: string; text: string; dot: string }> = {
    BLACK: { bg: 'bg-gray-800', text: 'text-white', dot: '🟫' },
    RED: { bg: 'bg-red-600', text: 'text-white', dot: '🔴' },
    ORANGE: { bg: 'bg-orange-500', text: 'text-white', dot: '🟠' },
    YELLOW: { bg: 'bg-yellow-400', text: 'text-black', dot: '🟡' },
    GREEN: { bg: 'bg-green-600', text: 'text-white', dot: '🟢' },
  };

  const sizeMap = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const { bg, text } = colorMap[risk] || colorMap.GREEN;

  return (
    <span className={`inline-block rounded font-medium ${bg} ${text} ${sizeMap[size]}`}>
      {risk}
    </span>
  );
};

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusColors: Record<string, string> = {
    RECEIVED: 'bg-blue-100 text-blue-800',
    APPOINTMENT_REQUESTED: 'bg-purple-100 text-purple-800',
    APPOINTMENT_CONFIRMED: 'bg-indigo-100 text-indigo-800',
    READY_FOR_DISPATCH: 'bg-cyan-100 text-cyan-800',
    DISPATCHED: 'bg-teal-100 text-teal-800',
    IN_TRANSIT: 'bg-green-100 text-green-800',
    DELIVERED: 'bg-emerald-100 text-emerald-800',
    GRN_PENDING: 'bg-yellow-100 text-yellow-800',
    RECONCILED: 'bg-lime-100 text-lime-800',
    CLOSED: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

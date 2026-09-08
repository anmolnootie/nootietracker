import React from 'react';
import { RiskBadge, StatusBadge } from '@/components/Badges';
import { POMaster } from '@po-control-tower/shared';
import { format } from 'date-fns';

interface Props {
  poNumber: string;
  existing: POMaster;
  onCancel: () => void;
}

export const DuplicatePOModal: React.FC<Props> = ({ poNumber, existing, onCancel }) => (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="text-2xl">⚠️</span>
        <div>
          <h3 className="text-lg font-bold text-gray-800">{poNumber} already exists</h3>
          <p className="text-sm text-gray-500 mt-1">This PO Number is already in the system - it was not created again.</p>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-2 text-sm mb-6">
        <div className="flex justify-between"><span className="text-gray-500">Existing PO Date</span><span className="font-medium">{format(new Date(existing.poDate), 'dd MMM yyyy')}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Source / Platform</span><span className="font-medium">{existing.channelId}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Location</span><span className="font-medium">{existing.location}</span></div>
        <div className="flex justify-between items-center"><span className="text-gray-500">Current Status</span><StatusBadge status={existing.status} /></div>
        <div className="flex justify-between items-center"><span className="text-gray-500">Risk</span><RiskBadge risk={existing.riskStatus} size="sm" /></div>
      </div>

      <div className="flex gap-3">
        <a
          href={`/pos/${existing.id}`}
          className="flex-1 text-center bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 rounded-lg"
        >
          View Existing PO
        </a>
        <button onClick={onCancel} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 rounded-lg">
          Cancel
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Comparing the uploaded file against the existing record or updating just the missing fields isn't built yet -
        for now, open the existing PO and edit it directly, or cancel and re-check the PO number.
      </p>
    </div>
  </div>
);

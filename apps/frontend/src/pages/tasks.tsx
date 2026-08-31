import React from 'react';
import { MainLayout } from '@/components/Layout';

export default function Tasks() {
  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">My Tasks</h2>
        <p className="text-gray-600">This is your personal action list:</p>
        <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
          <li>Personalized per login - see only your tasks</li>
          <li>Task types: Appointment, Dispatch, AVV Follow-up, Logistics, GRN, Discrepancy, Return, Escalation</li>
          <li>Each task carries its own SLA clock and priority</li>
          <li>Quick actions: Complete, Reassign, Escalate, Add Comment</li>
          <li>Sortable by: Status, SLA, Priority, Due Date</li>
          <li>Filter by: Owner, Type, Status, Urgency</li>
        </ul>
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm">
          <strong>Coming in Phase 3:</strong> Full task management with notifications and escalation
        </div>
      </div>
    </MainLayout>
  );
}

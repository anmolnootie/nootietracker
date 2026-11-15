import React from 'react';
import { ControlTowerShell } from '@/components/control-tower/Shell';

/** Overall control tower: every platform together. Tabs via ?tab=. */
export default function OverallTowerPage() {
  return <ControlTowerShell platform="ALL" />;
}

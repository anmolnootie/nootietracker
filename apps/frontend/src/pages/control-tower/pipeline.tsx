import React from 'react';
import { useRouter } from 'next/router';
import { ControlTowerShell } from '@/components/control-tower/Shell';
import { CT_PLATFORMS } from '@/components/control-tower/brand';

/** Kept for old links: the pipeline tab of the overall tower (or of ?platform=<name>). */
export default function LegacyPipelinePage() {
  const router = useRouter();
  if (!router.isReady) return null;
  const p = String(router.query.platform || '');
  return <ControlTowerShell platform={CT_PLATFORMS.includes(p) ? p : 'ALL'} defaultTab="pipeline" />;
}

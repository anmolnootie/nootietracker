import React from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { ControlTowerShell } from '@/components/control-tower/Shell';
import { platformFromSlug } from '@/components/control-tower/brand';

/** One platform's control tower, e.g. /control-tower/zepto or /control-tower/swiggy-instamart. Tabs via ?tab=. */
export default function PlatformTowerPage() {
  const router = useRouter();
  if (!router.isReady) return null;
  const platform = platformFromSlug(String(router.query.platform || ''));
  if (!platform) return <MainLayout><p className="text-gray-500">Unknown platform &ldquo;{String(router.query.platform)}&rdquo;.</p></MainLayout>;
  return <ControlTowerShell key={platform} platform={platform} />;
}

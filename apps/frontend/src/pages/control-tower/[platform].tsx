import React from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { platformSlug, Tower } from '@/components/control-tower/Tower';

const PLATS = ['Blinkit', 'Zepto', 'Swiggy Instamart', 'BigBasket', 'Flipkart', 'Amazon', 'Supertails', 'FirstClub', 'Tata 1mg', 'Other'];

/** One platform's control tower, e.g. /control-tower/blinkit or /control-tower/swiggy-instamart. */
export default function PlatformTowerPage() {
  const router = useRouter();
  const slug = String(router.query.platform || '');
  const platform = PLATS.find((p) => platformSlug(p) === slug);
  return (
    <MainLayout>
      {!router.isReady ? null : platform ? <Tower platform={platform} /> : <p className="text-gray-500">Unknown platform &ldquo;{slug}&rdquo;.</p>}
    </MainLayout>
  );
}

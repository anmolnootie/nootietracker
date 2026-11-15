import React from 'react';
import { MainLayout } from '@/components/Layout';
import { Tower } from '@/components/control-tower/Tower';

/** Overall control tower: every platform together, with a tile per platform. */
export default function OverallTowerPage() {
  return (
    <MainLayout>
      <Tower platform="ALL" />
    </MainLayout>
  );
}

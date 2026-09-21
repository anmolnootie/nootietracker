import React from 'react';
import { MainLayout } from '@/components/Layout';
import { PowerBIEmbed } from '@/components/PowerBIEmbed';

export default function PowerBIDashboard() {
  return (
    <MainLayout>
      <PowerBIEmbed />
    </MainLayout>
  );
}

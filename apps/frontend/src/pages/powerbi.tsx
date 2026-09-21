import React, { useState } from 'react';
import { MainLayout } from '@/components/Layout';

// Power BI's own "secure embed" address for this report. These are identifiers,
// not secrets - who can actually see the report is still decided by Power BI:
// each person signs in with their Microsoft account and must have access to it.
const REPORT_ID = '73f08f01-4a57-456a-9d87-e5cece29064f';
const TENANT_ID = '73961a19-b5f4-4988-b51f-8f02934e23e2';
const EMBED_URL = `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}&autoAuth=true&ctid=${TENANT_ID}`;
const OPEN_URL = `https://app.powerbi.com/groups/me/reports/${REPORT_ID}?ctid=${TENANT_ID}&experience=power-bi`;

export default function PowerBIDashboard() {
  const [loaded, setLoaded] = useState(false);

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            Live from Power BI. You&apos;ll be asked to sign in with your Microsoft account the first time, and you only see it if you have access to the report.
          </p>
          <a
            href={OPEN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-sm px-4 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Open in Power BI ↗
          </a>
        </div>

        <div className="relative bg-gray-50" style={{ height: '78vh' }}>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none">
              Loading report...
            </div>
          )}
          <iframe
            title="Power BI report"
            src={EMBED_URL}
            onLoad={() => setLoaded(true)}
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>

        <div className="p-3 border-t text-xs text-gray-500">
          Blank, or stuck on a sign-in message? Some browsers block Microsoft sign-in inside a page (private windows, blocked third-party cookies). Use{' '}
          <b>Open in Power BI</b> above, or allow cookies for this site.
        </div>
      </div>
    </MainLayout>
  );
}

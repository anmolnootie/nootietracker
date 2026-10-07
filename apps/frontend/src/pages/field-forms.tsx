import React, { useState } from 'react';
import Head from 'next/head';

// Public page, no login - field staff open this from a shared link on their
// phones. Kept deliberately free of MainLayout (no sidebar/logout/notification
// bell, no dependency on an authenticated session) and excluded from the
// app-wide login redirect in _app.tsx.

// Each location's forms carry a pre-filled "Location" field via its own Google
// Form entry.* param (baked into the URL below) - that's why every link is
// different per form, not just the form ID. Only one location's links have
// been provided so far; add more locations here as their links come in.
const LOCATIONS: { label: string; forms: { icon: string; label: string; href: string }[] }[] = [
  {
    label: 'VK – Vasant Kunj',
    forms: [
      { icon: '⭐', label: 'Review', href: 'https://docs.google.com/forms/d/e/1FAIpQLScJAp9MZpJOGY0rG-DhygUeAFy1z-TDPPEDTFuD1pt1Mtfg_w/viewform?usp=pp_url&entry.1252228781=VK+%E2%80%93+Vasant+Kunj' },
      { icon: '✅', label: 'Checklist', href: 'https://docs.google.com/forms/d/e/1FAIpQLSeqS-esHMyBRMMJtoHt2P1iffQFjUacG824CtUshXBKuHPzTg/viewform?usp=pp_url&entry.2067705702=VK+%E2%80%93+Vasant+Kunj' },
      { icon: '📦', label: 'Demand', href: 'https://docs.google.com/forms/d/e/1FAIpQLSeCz9Rzlj0Hcptciv_215hzz2nvTK4K3I1o_OAF_deFjSOhVQ/viewform?usp=pp_url&entry.366065296=VK+%E2%80%93+Vasant+Kunj' },
      { icon: '🔧', label: 'Issue', href: 'https://docs.google.com/forms/d/e/1FAIpQLSdU2weD5RofixWtmuETNq7BxP3rghzaoxGq6Rl5EfcJmbtzKg/viewform?usp=pp_url&entry.1208429901=VK+%E2%80%93+Vasant+Kunj' },
    ],
  },
];

export default function FieldForms() {
  const [locationIdx, setLocationIdx] = useState(0);
  const location = LOCATIONS[locationIdx];

  return (
    <>
      <Head>
        <title>Field Forms · nootie</title>
      </Head>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-xl">
          <div className="mb-6 text-center">
            <h1 className="font-brand text-xl font-bold text-nootie-gold-dark tracking-tight">
              n<span className="text-nootie-orange">oo</span>tie
            </h1>
            <h2 className="text-lg font-semibold text-gray-800 mt-3">📝 Field Forms</h2>
            <p className="text-sm text-gray-500 mt-1">Tap a form to open it, pre-filled for this location.</p>
          </div>

          {LOCATIONS.length > 1 && (
            <div className="mb-6">
              <label className="block text-xs text-gray-500 mb-1">Location</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
                value={locationIdx}
                onChange={(e) => setLocationIdx(Number(e.target.value))}
              >
                {LOCATIONS.map((l, i) => (
                  <option key={l.label} value={i}>{l.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tab bar: a horizontally scrollable strip on narrow/mobile screens,
              each tab a large tap target that opens the form in a new tab. */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible">
            {location.forms.map((f) => (
              <a
                key={f.label}
                href={f.href}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 sm:shrink flex flex-col items-center justify-center gap-1.5 min-w-[88px] sm:min-w-0 px-4 py-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-nootie-orange active:scale-95 transition-all text-center"
              >
                <span className="text-2xl">{f.icon}</span>
                <span className="text-sm font-medium text-gray-800">{f.label}</span>
              </a>
            ))}
          </div>

          <p className="mt-6 text-xs text-gray-400 text-center">
            Opens in a new tab - come back here to fill out another form for {location.label}.
          </p>
        </div>
      </div>
    </>
  );
}

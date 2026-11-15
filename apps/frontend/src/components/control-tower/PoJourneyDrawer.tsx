import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { controlTowerService } from '@/services/control-tower.service';
import { fd, money } from './ui';

/** One PO's story. Step 2 shows the basics; the full journey (invoices, GRN, team fields) is added in step 3. */
export const PoJourneyDrawer: React.FC<{ po: string | null; onClose: () => void }> = ({ po, onClose }) => {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    setD(null);
    if (po) controlTowerService.po(po).then(setD).catch(() => setD({ error: true }));
  }, [po]);
  if (!po) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="w-full max-w-lg h-full overflow-y-auto bg-white shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <h2 className="font-mono text-lg font-bold">{po}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">✕</button>
        </div>
        {!d && <p className="text-gray-500 mt-4">Loading...</p>}
        {d && !d.error && (
          <div className="mt-3 text-sm space-y-1">
            <p>{d.plat} · {d.loc} · {money(d.value)}</p>
            <p>PO date {fd(d.orderDate)} · expiry {fd(d.exp)}</p>
            <p>Stage: <b>{d.stageShort}</b>{d.flagName ? ` · ${d.flagName}` : ''}</p>
            {d.id && <Link className="text-ct-orange underline" href={`/pos/${d.id}`}>Open PO detail</Link>}
          </div>
        )}
      </aside>
    </div>
  );
};

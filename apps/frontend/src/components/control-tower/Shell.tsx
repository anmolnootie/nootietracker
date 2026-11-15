import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { controlTowerService } from '@/services/control-tower.service';
import { periodLabel, usePeriodStore } from '@/store/period.store';
import { CtRow, PeriodBar } from './ui';
import { PlatformLogo, platformSlug } from './brand';
import { PoJourneyDrawer } from './PoJourneyDrawer';
import { CompareTab, HandoverTab, IssuesTab, OverviewTab, PipelineTab, ReconTab, RegisterTab, WorklistTab } from './tabs';

export type TabKey = 'overview' | 'pipeline' | 'register' | 'worklist' | 'handover' | 'recon' | 'issues' | 'compare';
const TABS: { k: TabKey; label: string; overallOnly?: boolean }[] = [
  { k: 'overview', label: 'Overview' },
  { k: 'pipeline', label: 'Pipeline' },
  { k: 'register', label: 'All POs' },
  { k: 'worklist', label: 'Worklist' },
  { k: 'handover', label: 'Handover check' },
  { k: 'recon', label: 'Daily recon' },
  { k: 'issues', label: 'Issues' },
  { k: 'compare', label: 'Compare platforms', overallOnly: true },
];

export interface CtContext {
  platform: string;
  isAll: boolean;
  range: { from: string; to: string } | null;
  summary: any;
  rows: CtRow[];
  meta: any;
  loading: boolean;
  reload: () => void;
  openPo: (po: string) => void;
  /** Link to another tab of this tower, keeping the scope; extra query params optional. */
  tabHref: (tab: TabKey, extra?: Record<string, string>) => { pathname: string; query: Record<string, string> };
}
const Ctx = createContext<CtContext | null>(null);
export const useCt = () => useContext(Ctx)!;

/**
 * One control tower (Overall when platform = 'ALL', else one platform), the
 * artifact's frame: scope header, period bar, PO search and tabs. Data for the
 * scope + period is loaded once here and shared by every tab.
 */
export const ControlTowerShell: React.FC<{ platform: string; defaultTab?: TabKey }> = ({ platform, defaultTab = 'overview' }) => {
  const router = useRouter();
  const isAll = platform === 'ALL';
  const { range, pkey } = usePeriodStore();
  const qTab = router.query.tab as TabKey | undefined;
  const tab: TabKey = (qTab && TABS.some((t) => t.k === qTab) ? qTab : defaultTab) as TabKey;
  const [summary, setSummary] = useState<any>(null);
  const [rows, setRows] = useState<CtRow[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => { controlTowerService.meta().then(setMeta); }, []);
  useEffect(() => {
    const q = { ...(range || {}), platform };
    setLoading(true);
    setError('');
    Promise.all([controlTowerService.summary(q), controlTowerService.register(q)])
      .then(([s, r]) => { setSummary(s); setRows(r.rows); })
      .catch((e) => setError(e?.response?.data?.message || 'Could not load the control tower'))
      .finally(() => setLoading(false));
  }, [range, platform, nonce]);

  const base = isAll ? '/control-tower' : `/control-tower/${platformSlug(platform)}`;
  const tabHref = (t: TabKey, extra: Record<string, string> = {}) => ({ pathname: base, query: { ...(t === 'overview' ? {} : { tab: t }), ...extra } });
  const ctx: CtContext = { platform, isAll, range, summary, rows, meta, loading, reload, openPo: setOpen, tabHref };
  const urgent = summary?.aggregate?.urgent || 0;
  const Body = { overview: OverviewTab, pipeline: PipelineTab, register: RegisterTab, worklist: WorklistTab, handover: HandoverTab, recon: ReconTab, issues: IssuesTab, compare: CompareTab }[tab];

  return (
    <MainLayout>
      <Ctx.Provider value={ctx}>
        <div className="-m-2 md:-m-4 min-h-full bg-ct-cream rounded-2xl">
          {/* Scope header */}
          <div className="px-5 pt-5 pb-3 border-b border-[#efe3d6] bg-white/70 backdrop-blur rounded-t-2xl">
            <div className="flex flex-wrap items-center gap-4 justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {isAll ? (
                  <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-ct-orange to-ct-yellow text-white flex items-center justify-center shadow-sm text-xl font-bold">CT</span>
                ) : (
                  <PlatformLogo p={platform} size={48} />
                )}
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-gray-500">
                    <Link href="/control-tower" className="hover:text-ct-orange">Control tower</Link>
                    {!isAll && <> <span className="mx-1">/</span> {platform}</>}
                  </p>
                  <h1 className="text-2xl font-bold text-ct-ink leading-tight truncate">{isAll ? 'Overall control tower' : `${platform} control tower`}</h1>
                  <p className="text-xs text-gray-500">{periodLabel(pkey, range)}{urgent ? <> · <b className="text-red-700">{urgent} urgent</b></> : ''}</p>
                </div>
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); router.push(tabHref('register', search ? { q: search } : {})); }}
                className="flex items-center gap-2"
              >
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a PO number or facility" className="w-64 border border-[#e6d9cb] rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-ct-orange" />
                <Link href="/pos/new" className="px-3 py-1.5 rounded-lg bg-ct-orange text-white text-sm font-medium hover:opacity-90 whitespace-nowrap">+ Add PO</Link>
              </form>
            </div>
            <div className="mt-3"><PeriodBar /></div>
            <nav className="mt-3 -mb-3 flex gap-1 overflow-x-auto" aria-label="Control tower views">
              {TABS.filter((t) => !t.overallOnly || isAll).map((t) => (
                <Link
                  key={t.k}
                  href={tabHref(t.k)}
                  aria-current={tab === t.k ? 'page' : undefined}
                  className={`px-3.5 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${tab === t.k ? 'border-ct-orange text-ct-ink font-semibold' : 'border-transparent text-gray-500 hover:text-ct-ink'}`}
                >
                  {t.label}
                  {t.k === 'worklist' && urgent > 0 && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-600 text-white align-middle">{urgent}</span>}
                </Link>
              ))}
            </nav>
          </div>

          <div className="p-5 space-y-5">
            {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
            {loading && !summary ? <Skeleton /> : <Body />}
          </div>
        </div>
        <PoJourneyDrawer po={open} onClose={() => { setOpen(null); reload(); }} />
      </Ctx.Provider>
    </MainLayout>
  );
};

const Skeleton = () => (
  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 animate-pulse">
    {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-white/80" />)}
  </div>
);

import {
  aggregate, CtInvoice, CtPo, CtTracking, DEFAULT_CFG, deriveAll, GAPS, inGapOf, inPeriod, journey, journeyOf, normChan, periodRange,
} from './control-tower.core';

const ASOF = '2026-11-15';
const po = (p: Partial<CtPo> & { po: string }): CtPo => ({
  plat: 'Blinkit', date: '2026-11-10', exp: '2026-12-31', loc: 'X', qty: 10, amt: 1000, dec: 'Pending', reason: '', rem: '', src: 'test', ...p,
});
const inv = (i: Partial<CtInvoice> & { po: string }): CtInvoice => ({
  inv: `INV-${i.po}`, disp: '2026-11-01', val: 1000, awb: 'AWB', partner: '', status: 'Delivered', grn: 'Done', deliv: null,
  sq: null, sv: null, dq: null, dv: null, eq: null, ev: null, cn: '', cnv: null, gno: '', gdate: null, gamt: null, ...i,
});

// One PO per stage/flag, numbers worked out by hand from core.js.
const P: CtPo[] = [
  po({ po: 'A', date: ASOF, exp: '2026-11-30' }), // stage 1, no flag (age 0)
  po({ po: 'B' }), // stage 1, flag 7 no decision (age 5 > sla_decision 1)
  po({ po: 'C', date: '2026-09-01' }), // stage 1, flag 10 legacy (age 75 > 30)
  po({ po: 'D' }), // tracking: Accepted -> stage 2, flag 3
  po({ po: 'E' }), // handed 3 days ago, no ack -> stage 3, flag 4
  po({ po: 'F' }), // acked, age 5 > sla_dispatch 3 -> stage 4, flag 5
  po({ po: 'G', exp: '2026-11-14' }), // expired, not dispatched -> flag 1
  po({ po: 'H', exp: '2026-11-17' }), // expires in 2 days -> flag 2
  po({ po: 'I' }), // in transit 14 days -> stage 5, flag 6
  po({ po: 'J' }), // delivered, GRN pending 14 days -> stage 6, flag 8
  po({ po: 'K' }), // RTO without credit note -> stage 7, flag 9
  po({ po: 'L' }), // delivered + GRN done -> stage 8
  po({ po: 'M', dec: 'Declined' }), // stage 9
];
const I: CtInvoice[] = [
  inv({ po: 'I', status: 'In Transit', grn: '' }),
  inv({ po: 'J', status: 'Delivered', grn: 'Pending' }),
  inv({ po: 'K', status: 'RTO', grn: 'NA' }),
  inv({ po: 'L', status: 'Delivered', grn: 'Done' }),
];
const T: Record<string, CtTracking> = {
  D: { dec: 'Accepted' },
  E: { dec: 'Accepted', handed: '2026-11-12' },
  F: { dec: 'Accepted', handed: '2026-11-12', ack: '2026-11-13' },
};
const D = deriveAll(P, I, T, [{ po: 'B', status: 'Open' }, { po: 'B', status: 'Resolved' }], DEFAULT_CFG, ASOF);
const by = Object.fromEntries(D.map((d) => [d.po, d]));

describe('control tower core (port of core.js)', () => {
  it('assigns stages 1-9', () => {
    expect(['A', 'B', 'C', 'G', 'H'].map((k) => by[k].stage)).toEqual([1, 1, 1, 1, 1]);
    expect(['D', 'E', 'F', 'I', 'J', 'K', 'L', 'M'].map((k) => by[k].stage)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('assigns flags in priority order', () => {
    const flags = Object.fromEntries(D.map((d) => [d.po, d.pri]));
    expect(flags).toEqual({ A: 0, B: 7, C: 10, D: 3, E: 4, F: 5, G: 1, H: 2, I: 6, J: 8, K: 9, L: 0, M: 0 });
  });

  it('counts only unresolved issues', () => {
    expect(by.B.openIssues).toBe(1);
  });

  it('aggregates stage counts and expiring', () => {
    const a = aggregate(D);
    expect(a.n).toBe(13);
    expect(a.stage[1].n).toBe(5);
    expect(a.dispatched).toBe(4);
    expect(a.expiring).toBe(2);
    expect(a.flags).toBe(10);
  });

  it('funnel: a later step implies the earlier ones', () => {
    const { steps, side } = journey(D);
    const n = Object.fromEntries(steps.map((s) => [s.k, s.n]));
    expect(n).toEqual({ recv: 13, acc: 7, hand: 6, ack: 5, inv: 4, disp: 4, deliv: 2, grn: 1 });
    expect(side.rto.n).toBe(1);
    expect(side.ewbNeed).toBe(4);
    for (const d of D) {
      const j = journeyOf(d);
      const order = ['recv', 'acc', 'hand', 'ack', 'inv'] as const;
      order.forEach((k, i) => { if (j[k] && i > 0) expect(j[order[i - 1]]).toBe(true); });
      if (j.grn) expect(j.deliv).toBe(true);
    }
    const gap = (k: string) => { const g = GAPS.find((x) => x.k === k)!; return n[g.from] - n[g.to]; };
    expect([gap('not_accepted'), gap('not_handed'), gap('not_delivered'), gap('no_grn')]).toEqual([6, 1, 2, 1]);
    // Gap pills exclude stage 9 (declined M reached 'recv' but is not counted as 'not accepted').
    const pill = (k: string) => D.filter((d) => inGapOf(d, GAPS.find((x) => x.k === k)!)).length;
    expect([pill('not_accepted'), pill('not_handed'), pill('not_delivered'), pill('no_grn')]).toEqual([5, 1, 2, 1]);
  });

  it('period ranges match v3.js setPeriod', () => {
    expect(periodRange('fy', ASOF)).toEqual({ from: '2026-04-01', to: ASOF });
    expect(periodRange('7d', ASOF)).toEqual({ from: '2026-11-08', to: ASOF });
    expect(periodRange('month', ASOF)).toEqual({ from: '2026-11-01', to: ASOF });
    expect(periodRange('last', ASOF)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('custom', ASOF, '2026-11-20', '2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-20' });
    expect(periodRange('all', ASOF)).toBeNull();
  });

  it('undated POs only appear with no range', () => {
    const r = { from: '2026-11-01', to: '2026-11-30' };
    expect(inPeriod({ date: null }, r)).toBe(false);
    expect(inPeriod({ date: null }, null)).toBe(true);
    expect(inPeriod({ date: '2026-11-15' }, r)).toBe(true);
    expect(inPeriod({ date: '2026-10-31' }, r)).toBe(false);
  });

  it('normalises channel names', () => {
    expect(['blinkit', 'Instamart', 'swiggy', 'eTrade', 'Big Basket', 'xyz', ''].map(normChan)).toEqual(
      ['Blinkit', 'Swiggy Instamart', 'Swiggy Instamart', 'Amazon', 'BigBasket', 'Other', ''],
    );
  });
});

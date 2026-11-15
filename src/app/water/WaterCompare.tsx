"use client";
// "Compare" tab: production over the months, one month against another, by outlet, and milk waste.
// Charts are plain SVG (no chart library). Colours: still = blue, sparkling = orange (validated pair);
// the comparison month is always neutral grey so the month you are looking at stands out.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowUpRight, ArrowDownRight, Minus, Table2, BarChart3 } from 'lucide-react';
import { aggregateMonths, MonthAgg, OUTLETS, monthLabel, shiftMonth, fmtL, WaterRow, MilkRow, emptyMonth, firstDays, daysIn, SIZES } from './waterMath';

const C = {
  still: '#2a78d6',
  spk: '#eb6834',
  base: '#a3a29c',   // comparison month
  milk: '#e34948',
  brk: '#6250d6',
  grid: '#e7e6e2',
  axis: '#8a8984',
  text: '#52514e',
};

// --- small hooks -------------------------------------------------------------
const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(e => setW(Math.max(260, Math.floor(e[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
};

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};

type Tip = { x: number; y: number; title: string; rows: { color: string; label: string; value: string; dash?: boolean }[] } | null;

const Tooltip = ({ tip }: { tip: Tip }) => !tip ? null : (
  <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl bg-slate-900 text-white px-3 py-2 shadow-xl text-[11px] whitespace-nowrap"
    style={{ left: tip.x, top: tip.y - 10 }}>
    <p className="font-black mb-1">{tip.title}</p>
    {tip.rows.map(r => (
      <p key={r.label} className="flex items-center gap-2 font-semibold">
        <svg width="14" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke={r.color} strokeWidth="3" strokeDasharray={r.dash ? '3 2' : undefined} strokeLinecap="round" /></svg>
        <span className="text-white/70">{r.label}</span><span className="ml-auto pl-3 font-black tabular-nums">{r.value}</span>
      </p>
    ))}
  </div>
);

const Legend = ({ items }: { items: { color: string; label: string; dash?: boolean; box?: boolean }[] }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-600">
    {items.map(i => (
      <span key={i.label} className="flex items-center gap-1.5">
        {i.box ? <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />
          : <svg width="16" height="6"><line x1="1" y1="3" x2="15" y2="3" stroke={i.color} strokeWidth="2.5" strokeDasharray={i.dash ? '3 2' : undefined} strokeLinecap="round" /></svg>}
        {i.label}
      </span>
    ))}
  </div>
);

const Card = ({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 min-w-0 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
      <div>
        <h3 className="text-sm font-black text-slate-800">{title}</h3>
        {sub && <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

const Delta = ({ now, before, invert = false, unit = '%' }: { now: number; before: number; invert?: boolean; unit?: string }) => {
  if (!before) return <span className="text-[11px] font-bold text-slate-400">no data to compare</span>;
  const pct = ((now - before) / before) * 100;
  const flat = Math.abs(pct) < 0.5;
  const good = invert ? pct < 0 : pct > 0;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-black ${flat ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-rose-700'}`}>
      <Icon size={13} />{flat ? 'same' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}${unit}`}
    </span>
  );
};

// --- charts --------------------------------------------------------------------
const PAD = { l: 40, r: 12, t: 12, b: 26 };

/** Stacked monthly bars: still + sparkling litres. */
const MonthlyBars = ({ months, focus, onPick }: { months: MonthAgg[]; focus: string; onPick: (m: string) => void }) => {
  const [ref, w] = useWidth();
  const [tip, setTip] = useState<Tip>(null);
  const h = 240;
  const max = niceMax(Math.max(...months.map(m => m.total), 1));
  const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b;
  const slot = iw / Math.max(months.length, 1);
  const bw = Math.min(36, slot * 0.62);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);
  const step = Math.max(1, Math.ceil(months.length / Math.floor(iw / 48)));
  const fi = months.findIndex(m => m.month === focus);
  const showLabel = (i: number) => i === fi || (i % step === 0 && (fi < 0 || Math.abs(i - fi) >= step));
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg width={w} height={h} role="img" aria-label="Litres produced per month, still and sparkling">
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={C.axis}>{fmtL(t)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          const hs = (m.still / max) * ih, hk = (m.spk / max) * ih;
          const isFocus = m.month === focus;
          return (
            <g key={m.month} className="cursor-pointer" onClick={() => onPick(m.month)}
              onMouseMove={() => setTip({ x: cx, y: y(m.total), title: monthLabel(m.month, true), rows: [
                { color: C.still, label: 'Still', value: `${m.still.toFixed(0)} L` },
                { color: C.spk, label: 'Sparkling', value: `${m.spk.toFixed(0)} L` },
                { color: '#fff', label: 'Total', value: `${m.total.toFixed(0)} L` },
                { color: '#fff', label: 'Days logged', value: String(m.days) },
              ] })}>
              <rect x={cx - slot / 2} y={PAD.t} width={slot} height={ih} fill={isFocus ? '#6D2158' : 'transparent'} opacity={isFocus ? 0.06 : 0} />
              {/* still at the base, 2px gap, sparkling on top; rounded data end */}
              <rect x={cx - bw / 2} y={PAD.t + ih - hs} width={bw} height={Math.max(0, hs)} fill={C.still} rx={hk > 2 ? 0 : 4} />
              {hk > 0 && <rect x={cx - bw / 2} y={PAD.t + ih - hs - hk} width={bw} height={Math.max(0, hk - 2)} fill={C.spk} rx={3} />}
              {showLabel(i) && <text x={cx} y={h - 8} textAnchor="middle" fontSize="10" fontWeight={isFocus ? 800 : 500} fill={isFocus ? '#6D2158' : C.axis}>{monthLabel(m.month)}</text>}
            </g>
          );
        })}
        <line x1={PAD.l} x2={w - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={C.axis} />
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
};

/** Running total through the month: focus month vs comparison month. */
const PaceLines = ({ a, b }: { a: MonthAgg; b?: MonthAgg }) => {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const h = 220;
  const cum = (m?: MonthAgg) => { if (!m) return []; let s = 0; return m.daily.map(v => (s += v)); };
  // Stop the focus line at its last logged day (month may be in progress)
  const lastA = a.daily.reduce((last, v, i) => v > 0 ? i : last, -1);
  const ca = cum(a).slice(0, lastA + 1), cb = cum(b);
  const days = Math.max(a.daily.length, b?.daily.length || 0);
  const max = niceMax(Math.max(...ca, ...cb, 1));
  const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / Math.max(days - 1, 1)) * iw;
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, 0.5, 1].map(f => f * max);
  const hi = hover !== null ? Math.min(hover, days - 1) : null;
  return (
    <div ref={ref} className="relative w-full"
      onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - PAD.l) / iw) * (days - 1)); setHover(i < 0 || i >= days ? null : i); }}
      onMouseLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Running total of litres through the month">
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={C.axis}>{fmtL(t)}</text>
          </g>
        ))}
        {[1, 10, 20, days].map(d => <text key={d} x={x(d - 1)} y={h - 8} textAnchor="middle" fontSize="10" fill={C.axis}>{d}</text>)}
        {cb.length > 0 && <path d={path(cb)} fill="none" stroke={C.base} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />}
        {ca.length > 0 && <path d={path(ca)} fill="none" stroke={C.still} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {ca.length > 0 && <circle cx={x(ca.length - 1)} cy={y(ca[ca.length - 1])} r="4.5" fill={C.still} stroke="#fff" strokeWidth="2" />}
        {hi !== null && (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={PAD.t + ih} stroke={C.axis} strokeDasharray="2 3" />
            {cb[hi] !== undefined && <circle cx={x(hi)} cy={y(cb[hi])} r="4" fill={C.base} stroke="#fff" strokeWidth="2" />}
            {ca[hi] !== undefined && <circle cx={x(hi)} cy={y(ca[hi])} r="4" fill={C.still} stroke="#fff" strokeWidth="2" />}
          </g>
        )}
      </svg>
      {hi !== null && <Tooltip tip={{ x: x(hi), y: PAD.t + 4, title: `By day ${hi + 1}`, rows: [
        { color: C.still, label: monthLabel(a.month), value: ca[hi] !== undefined ? `${ca[hi].toFixed(0)} L` : '—' },
        ...(b ? [{ color: C.base, label: monthLabel(b.month), value: cb[hi] !== undefined ? `${cb[hi].toFixed(0)} L` : '—', dash: true }] : []),
      ] }} />}
    </div>
  );
};

/** Litres by outlet, focus month bar with comparison month as a thin grey bar beneath. */
const OutletBars = ({ a, b }: { a: MonthAgg; b?: MonthAgg }) => {
  const rows = OUTLETS.map(o => ({ ...o, va: a.outlets[o.key], vb: b?.outlets[o.key] || 0 })).filter(r => r.va > 0 || r.vb > 0).sort((x, y) => y.va - x.va);
  const max = Math.max(...rows.map(r => Math.max(r.va, r.vb)), 1);
  if (rows.length === 0) return <p className="text-sm text-slate-400 py-8 text-center">No production logged.</p>;
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.key} className="grid grid-cols-[88px_1fr_auto] items-center gap-3" title={`${r.label}: ${r.va.toFixed(0)} L${b ? ` (${monthLabel(b.month)}: ${r.vb.toFixed(0)} L)` : ''}`}>
          <span className="text-xs font-bold text-slate-600 truncate">{r.label}</span>
          <div className="space-y-1">
            <div className="h-3 rounded-r-[4px] bg-[#2a78d6]" style={{ width: `${(r.va / max) * 100}%`, minWidth: r.va ? 3 : 0 }} />
            {b && <div className="h-1.5 rounded-r-[3px]" style={{ width: `${(r.vb / max) * 100}%`, minWidth: r.vb ? 3 : 0, background: C.base }} />}
          </div>
          <span className="text-right min-w-[84px]">
            <span className="block text-xs font-black text-slate-800 tabular-nums">{r.va.toFixed(0)} L</span>
            {b && <Delta now={r.va} before={r.vb} />}
          </span>
        </div>
      ))}
    </div>
  );
};

/** One value per month (single series): milk waste, breakage. */
const MonthValueBars = ({ months, focus, value, color, label, fmt, extra }: {
  months: MonthAgg[]; focus: string; value: (m: MonthAgg) => number; color: string; label: string;
  fmt: (v: number) => string; extra?: (m: MonthAgg) => { label: string; value: string }[];
}) => {
  const [ref, w] = useWidth();
  const [tip, setTip] = useState<Tip>(null);
  const h = 200;
  const max = niceMax(Math.max(...months.map(value), 1));
  const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b;
  const slot = iw / Math.max(months.length, 1);
  const bw = Math.min(30, slot * 0.6);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const step = Math.max(1, Math.ceil(months.length / Math.floor(iw / 48)));
  const fi = months.findIndex(m => m.month === focus);
  const showLabel = (i: number) => i === fi || (i % step === 0 && (fi < 0 || Math.abs(i - fi) >= step));
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setTip(null)}>
      <svg width={w} height={h} role="img" aria-label={`${label} per month`}>
        {[0, 0.5, 1].map(f => f * max).map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={C.axis}>{fmtL(t)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          const v = value(m);
          const isFocus = m.month === focus;
          return (
            <g key={m.month} onMouseMove={() => setTip({ x: cx, y: y(v), title: monthLabel(m.month, true), rows: [
              { color, label, value: fmt(v) },
              ...(extra ? extra(m).map(e => ({ color: '#fff', ...e })) : []),
            ] })}>
              <rect x={cx - slot / 2} y={PAD.t} width={slot} height={ih} fill="transparent" />
              <rect x={cx - bw / 2} y={y(v)} width={bw} height={Math.max(0, PAD.t + ih - y(v))} rx={4} fill={color} opacity={isFocus ? 1 : 0.55} />
              {showLabel(i) && <text x={cx} y={h - 8} textAnchor="middle" fontSize="10" fontWeight={isFocus ? 800 : 500} fill={isFocus ? '#6D2158' : C.axis}>{monthLabel(m.month)}</text>}
            </g>
          );
        })}
        <line x1={PAD.l} x2={w - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={C.axis} />
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
};

/** Breakage by bottle size: focus month vs comparison month, with the rate per 1,000 filled. */
const BreakageBySize = ({ a, b }: { a: MonthAgg; b?: MonthAgg }) => {
  const rows = SIZES.map(sz => ({ ...sz, va: a.broken[sz.key], vb: b?.broken[sz.key] || 0, filled: a.filled[sz.key] }))
    .filter(r => r.va > 0 || r.vb > 0);
  const max = Math.max(...rows.map(r => Math.max(r.va, r.vb)), 1);
  if (rows.length === 0) return <p className="text-sm text-slate-400 py-8 text-center">No breakage logged.</p>;
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.key} className="grid grid-cols-[64px_1fr_auto] items-center gap-3">
          <span className="text-xs font-bold text-slate-600">{r.label}</span>
          <div className="space-y-1">
            <div className="h-3 rounded-r-[4px]" style={{ width: `${(r.va / max) * 100}%`, minWidth: r.va ? 3 : 0, background: C.brk }} />
            {b && <div className="h-1.5 rounded-r-[3px]" style={{ width: `${(r.vb / max) * 100}%`, minWidth: r.vb ? 3 : 0, background: C.base }} />}
          </div>
          <span className="text-right min-w-[96px]">
            <span className="block text-xs font-black text-slate-800 tabular-nums">{r.va} broken</span>
            <span className="block text-[10px] font-semibold text-slate-400">{r.filled ? `${((r.va / r.filled) * 1000).toFixed(1)} per 1,000 filled` : 'not filled here'}</span>
            {b && <Delta now={r.va} before={r.vb} invert />}
          </span>
        </div>
      ))}
    </div>
  );
};

// --- tab -----------------------------------------------------------------------
export default function WaterCompare({ initialMonth }: { initialMonth: string }) {
  const [loading, setLoading] = useState(true);
  const [byMonth, setByMonth] = useState<Map<string, MonthAgg>>(new Map());
  const [focus, setFocus] = useState(initialMonth);
  const [base, setBase] = useState(shiftMonth(initialMonth, -1));
  const [range, setRange] = useState<6 | 12 | 0>(12);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from('water_records').select('*').order('date'),
      supabase.from('milk_records').select('date, total_ml').order('date'),
    ]).then(([w, m]) => {
      if (!alive) return;
      setByMonth(aggregateMonths((w.data || []) as WaterRow[], (m.data || []) as MilkRow[]));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Continuous run of months (gaps shown as empty) ending at the latest month with data or the focus month
  const months = useMemo(() => {
    const keys = [...byMonth.keys()].sort();
    if (keys.length === 0) return [];
    const last = [keys[keys.length - 1], focus].sort()[1];
    const first = range ? shiftMonth(last, -(range - 1)) : keys[0];
    const out: MonthAgg[] = [];
    for (let m = first; m <= last; m = shiftMonth(m, 1)) {
      out.push(byMonth.get(m) || emptyMonth(m));
    }
    return out;
  }, [byMonth, range, focus]);

  const allMonths = useMemo(() => [...byMonth.keys()].sort().reverse(), [byMonth]);
  const A = byMonth.get(focus) || emptyMonth(focus);
  const Bfull = byMonth.get(base);
  // A month still being filled in is compared with the same days of the other month (1–10 vs 1–10).
  const lastLogged = Math.max(A.dayRecs.reduce((l, r, i) => (r && r.total > 0 ? i + 1 : l), 0), A.milkDaily.reduce((l, v, i) => (v > 0 ? i + 1 : l), 0));
  const partial = lastLogged > 0 && lastLogged < daysIn(focus);
  const B = Bfull && partial ? firstDays(Bfull, lastLogged) : Bfull;
  const vsLabel = B ? (partial ? `vs ${monthLabel(base)} 1–${lastLogged}` : `vs ${monthLabel(base)}`) : '';
  const perDay = (m?: MonthAgg) => m && m.days ? m.total / m.days : 0;
  const brkRate = (m?: MonthAgg) => m && m.bottles ? (m.breakage / m.bottles) * 1000 : 0;
  const best = months.reduce<MonthAgg | null>((b, m) => !b || m.total > b.total ? m : b, null);

  const pickFocus = (m: string) => { setFocus(m); setBase(shiftMonth(m, -1)); };

  if (loading) return <div className="py-24 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;

  const kpis = [
    { label: 'Total produced', value: `${A.total.toFixed(0)} L`, delta: <Delta now={A.total} before={B?.total || 0} /> },
    { label: 'Per logged day', value: `${perDay(A).toFixed(0)} L`, delta: <Delta now={perDay(A)} before={perDay(B)} />, note: `${A.days} days logged` },
    { label: 'Bottles filled', value: A.bottles.toLocaleString(), delta: <Delta now={A.bottles} before={B?.bottles || 0} /> },
    { label: 'Breakage', value: A.breakage.toLocaleString(), delta: <Delta now={brkRate(A)} before={brkRate(B)} invert />, note: `${brkRate(A).toFixed(1)} per 1,000 bottles` },
    { label: 'Milk wasted', value: `${A.milkL.toFixed(1)} L`, delta: <Delta now={A.milkL} before={B?.milkL || 0} invert /> },
  ];

  return (
    <div className="space-y-4">
      {partial && B && (
        <p className="text-[11px] font-semibold text-slate-500 -mb-1">{monthLabel(focus, true)} is logged up to day {lastLogged}, so it is compared with days 1–{lastLogged} of {monthLabel(base, true)}.</p>
      )}
      {/* Controls: one row */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">Month
          <select value={focus} onChange={e => pickFocus(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-black text-slate-800 outline-none focus:border-[#6D2158]">
            {[...new Set([focus, ...allMonths])].sort().reverse().map(m => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">compared with
          <select value={base} onChange={e => setBase(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-black text-slate-800 outline-none focus:border-[#6D2158]">
            {[...new Set([base, ...allMonths])].filter(m => m !== focus).sort().reverse().map(m => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
          </select>
        </label>
        <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-black">
          {([6, 12, 0] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 rounded-md ${range === r ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500'}`}>{r ? `${r} months` : 'All'}</button>
          ))}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{k.label}</p>
            <p className="text-2xl font-black text-slate-900 tabular-nums mt-1">{k.value}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2">{k.delta}<span className="text-[10px] font-semibold text-slate-400">{vsLabel}</span></div>
            {k.note && <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{k.note}</p>}
          </div>
        ))}
      </div>

      <Card title="Production by month" sub={best ? `Click a month to compare it. Highest: ${monthLabel(best.month, true)}, ${best.total.toFixed(0)} L` : undefined}
        right={<div className="flex items-center gap-3"><Legend items={[{ color: C.still, label: 'Still', box: true }, { color: C.spk, label: 'Sparkling', box: true }]} />
          <button onClick={() => setShowTable(s => !s)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-50">
            {showTable ? <BarChart3 size={13} /> : <Table2 size={13} />}{showTable ? 'Chart' : 'Table'}</button></div>}>
        {showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400 text-right">
                <th className="text-left py-2">Month</th><th>Still L</th><th>Sparkling L</th><th>Total L</th><th>Days</th><th>L / day</th><th>Bottles</th><th>Breakage</th><th>Per 1,000</th><th>Milk L</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...months].reverse().map(m => (
                  <tr key={m.month} className={`text-right tabular-nums font-semibold text-slate-700 ${m.month === focus ? 'bg-[#6D2158]/5' : ''}`}>
                    <td className="text-left py-2 font-black">{monthLabel(m.month, true)}</td>
                    <td>{m.still.toFixed(0)}</td><td>{m.spk.toFixed(0)}</td><td className="font-black text-slate-900">{m.total.toFixed(0)}</td>
                    <td>{m.days}</td><td>{perDay(m).toFixed(0)}</td><td>{m.bottles.toLocaleString()}</td><td>{m.breakage}</td><td>{brkRate(m).toFixed(1)}</td><td>{m.milkL.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <MonthlyBars months={months} focus={focus} onPick={pickFocus} />}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Pace through the month" sub="Running total of litres, day by day"
          right={<Legend items={[{ color: C.still, label: monthLabel(focus) }, ...(B ? [{ color: C.base, label: monthLabel(base), dash: true }] : [])]} />}>
          <PaceLines a={A} b={Bfull} />
        </Card>
        <Card title="Litres by outlet" sub={B ? `${monthLabel(focus, true)}, with ${monthLabel(base, true)} in grey${partial ? ` (days 1–${lastLogged} of both)` : ''}` : monthLabel(focus, true)}
          right={<Legend items={[{ color: C.still, label: monthLabel(focus), box: true }, ...(B ? [{ color: C.base, label: monthLabel(base), box: true }] : [])]} />}>
          <OutletBars a={A} b={B} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Bottle breakage by month" sub={`${monthLabel(focus, true)}: ${A.breakage} broken on ${A.breakDays} day${A.breakDays === 1 ? '' : 's'} · ${brkRate(A).toFixed(1)} per 1,000 bottles`}>
          <MonthValueBars months={months} focus={focus} value={m => m.breakage} color={C.brk} label="Broken" fmt={v => `${v} bottles`}
            extra={m => [{ label: 'Per 1,000 filled', value: brkRate(m).toFixed(1) }, { label: 'Days with breakage', value: String(m.breakDays) }]} />
        </Card>
        <Card title="Breakage by bottle size" sub={B ? `${monthLabel(focus, true)}, with ${monthLabel(base, true)} in grey${partial ? ` (days 1–${lastLogged} of both)` : ''}` : monthLabel(focus, true)}
          right={<Legend items={[{ color: C.brk, label: monthLabel(focus), box: true }, ...(B ? [{ color: C.base, label: monthLabel(base), box: true }] : [])]} />}>
          <BreakageBySize a={A} b={B} />
        </Card>
      </div>

      <Card title="Milk waste by month" sub={`${monthLabel(focus, true)}: ${A.milkL.toFixed(1)} L over ${A.milkDays} logged days`}>
        <MonthValueBars months={months} focus={focus} value={m => m.milkL} color={C.milk} label="Wasted" fmt={v => `${v.toFixed(1)} L`}
          extra={m => [{ label: 'Per logged day', value: m.milkDays ? `${(m.milkL / m.milkDays).toFixed(1)} L` : '—' }]} />
      </Card>
    </div>
  );
}

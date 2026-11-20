"use client";
// Guest History — every stay as one profile: who, which villa(s) incl. moves, dates, GEM, notes,
// requests & minibar during the stay, who looked after the villa each day, and earlier stays (repeaters).
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search, Loader2, ArrowLeft, BedDouble, CalendarDays, Users, Utensils, UserRound, StickyNote, Wine,
  History, Printer, ArrowRight, Repeat, X, ChevronRight, Milk,
} from 'lucide-react';
import AdminOnly from '@/components/AdminOnly';
import { getDhakaDateStr } from '@/lib/dateUtils';
import { isCoordinator } from '@/lib/requestsShared';
import { parseVillas } from '@/app/allocation/lib/constants';
import {
  searchStays, loadStay, pastStays, stayRequests, stayAttendants, occasionsOf, type Stay, type StayRequest,
} from '@/lib/guestHistory';
import { loadMilkList, loadMilkRange, type MilkList } from '@/lib/milkRequests';
import MilkPanel from './MilkPanel';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (iso?: string, year = true) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS[+m - 1]}${year ? ` ${y}` : ''}`; };
const hhmm = (ts: string) => { const d = new Date(ts); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
const people = (name: string) => name.split('&').map(s => s.trim()).filter(Boolean);
const villasLabel = (vs: string[]) => vs.map(v => `V${v}`).join(' → ');

type Phase = 'In house' | 'Arriving' | 'Departed' | 'Departing today' | 'Arriving today';
const phaseOf = (s: Stay, today: string): Phase =>
  s.arr === today ? 'Arriving today' : s.dep === today ? 'Departing today' : s.arr > today ? 'Arriving' : s.dep && s.dep < today ? 'Departed' : 'In house';
const PHASE_STYLE: Record<Phase, string> = {
  'In house': 'bg-emerald-100 text-emerald-800',
  'Arriving today': 'bg-lime-100 text-lime-800',
  Arriving: 'bg-sky-100 text-sky-800',
  'Departing today': 'bg-rose-100 text-rose-700',
  Departed: 'bg-slate-100 text-slate-500',
};
type Filter = 'ALL' | 'IN' | 'ARR' | 'DEP';

// "2x Heineken" lines → totals per item
const itemTotals = (reqs: StayRequest[]) => {
  const m = new Map<string, number>();
  reqs.forEach(r => String(r.item_details || '').split('\n').forEach(line => {
    const x = line.trim().replace(/^[✓✔]\s*/, '').match(/^(\d+)\s*x\s+(.+)$/i);
    if (x) m.set(x[2].trim(), (m.get(x[2].trim()) || 0) + parseInt(x[1], 10));
  }));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

function GuestHistoryInner() {
  const router = useRouter();
  const params = useSearchParams();
  const today = getDhakaDateStr();
  const [query, setQuery] = useState(params.get('q') || '');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [results, setResults] = useState<Stay[]>([]);
  const [searching, setSearching] = useState(true);
  const [stay, setStay] = useState<Stay | null>(null);
  const [loadingStay, setLoadingStay] = useState(false);
  const [requests, setRequests] = useState<StayRequest[]>([]);
  const [attendants, setAttendants] = useState<Record<string, string>>({});
  const [past, setPast] = useState<Stay[] | null>(null);
  const stayKey = params.get('stay') || '';
  const [milkOpen, setMilkOpen] = useState(false);
  const [todayMilk, setTodayMilk] = useState<MilkList | null>(null);
  const [stayMilk, setStayMilk] = useState<{ date: string; villa: string; items: string[]; until: string; note: string }[]>([]);
  useEffect(() => { loadMilkList(today).then(setTodayMilk).catch(() => {}); }, [today]);
  const milkToday = (villa: string) => todayMilk?.entries.find(e => e.villa === villa);

  // Search (debounced)
  useEffect(() => {
    let alive = true;
    setSearching(true);
    const h = setTimeout(() => {
      searchStays(query, today).then(r => { if (alive) setResults(r); }).catch(() => { if (alive) setResults([]); }).finally(() => { if (alive) setSearching(false); });
    }, query ? 350 : 0);
    return () => { alive = false; clearTimeout(h); };
  }, [query, today]);

  const open = (s: Stay) => {
    const p = new URLSearchParams({ stay: s.key, v: s.villas.join(','), a: s.arr, d: s.dep, n: s.name });
    if (query) p.set('q', query);
    router.push(`/guests/history?${p.toString()}`, { scroll: false });
  };
  const close = () => router.push(query ? `/guests/history?q=${encodeURIComponent(query)}` : '/guests/history', { scroll: false });

  // Load the selected stay with everything around it
  const loadProfile = useCallback(async (key: string) => {
    setLoadingStay(true); setPast(null); setRequests([]); setAttendants({}); setStayMilk([]);
    try {
      const hint = params.get('v') ? { villas: (params.get('v') || '').split(',').filter(Boolean), arr: params.get('a') || '', dep: params.get('d') || '', name: params.get('n') || '' } : undefined;
      const s = await loadStay(key, hint);
      setStay(s);
      if (!s) return;
      const [req, att] = await Promise.all([stayRequests(s, isCoordinator()), stayAttendants(s, parseVillas)]);
      setRequests(req); setAttendants(att);
      pastStays(s).then(setPast).catch(() => setPast([]));
      // Milk lists on the days of the stay, for the villa the guest was in that day
      const villaOn = new Map(s.days.map(d => [d.report_date, d.villa_number]));
      loadMilkRange(s.arr, s.dep || s.lastSeen).then(lists => setStayMilk(lists.flatMap(l => {
        const v = villaOn.get(l.date) || (s.villas.length === 1 ? s.villas[0] : '');
        const e = l.entries.find(x => x.villa === v);
        return e ? [{ date: l.date, villa: e.villa, items: e.items, until: e.until, note: e.note }] : [];
      }))).catch(() => {});
    } finally { setLoadingStay(false); }
  }, [params]);
  useEffect(() => { if (stayKey) loadProfile(stayKey); else setStay(null); }, [stayKey, loadProfile]);

  const shown = useMemo(() => results.filter(s => {
    const ph = phaseOf(s, today);
    if (filter === 'IN') return ph === 'In house' || ph === 'Departing today' || ph === 'Arriving today';
    if (filter === 'ARR') return ph === 'Arriving today' || ph === 'Arriving';
    if (filter === 'DEP') return ph === 'Departed' || ph === 'Departing today';
    return true;
  }), [results, filter, today]);

  const totals = useMemo(() => itemTotals(requests), [requests]);
  const reqByDay = useMemo(() => { const m = new Map<string, StayRequest[]>(); requests.forEach(r => { const d = r.request_time.slice(0, 10); (m.get(d) || m.set(d, []).get(d)!).push(r); }); return [...m.entries()]; }, [requests]);

  /* ---------------- list ---------------- */
  const list = (
    <div className={`${stayKey ? 'hidden lg:block' : ''} lg:w-[380px] lg:shrink-0 print:hidden`}>
      <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2 lg:sticky lg:top-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Guest name or villa (V50)" autoFocus
            className="w-full h-11 pl-9 pr-9 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
          {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear"><X size={16} /></button>}
        </div>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {([['ALL', 'All'], ['IN', 'In house'], ['ARR', 'Arriving'], ['DEP', 'Departed']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`shrink-0 h-8 px-3 rounded-lg text-xs font-black ${filter === k ? 'bg-[#6D2158] text-white' : 'bg-slate-100 text-slate-500'}`}>{l}</button>
          ))}
        </div>
        <p className="text-[11px] font-semibold text-slate-400 px-1">{query ? `${shown.length} stay${shown.length === 1 ? '' : 's'} found` : 'In house and the last 14 days · search for older stays'}</p>
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto -mx-1 px-1 space-y-1.5">
          {searching ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>
            : shown.length === 0 ? <p className="py-10 text-center text-sm font-semibold text-slate-400">No stays found.</p>
            : shown.map(s => {
              const ph = phaseOf(s, today);
              return (
                <button key={s.key} onClick={() => open(s)} className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition-colors ${stayKey === s.key ? 'border-[#6D2158] bg-[#6D2158]/5' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className="w-12 shrink-0 text-center">
                    <span className="block text-base font-black text-slate-800 leading-none">V{s.villas[s.villas.length - 1]}</span>
                    {s.villas.length > 1 && <span className="block text-[10px] font-bold text-slate-400 mt-0.5">from V{s.villas[0]}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-slate-800 truncate">{people(s.name).join(', ')}</span>
                    <span className="block text-xs font-semibold text-slate-500">{nice(s.arr, false)} → {nice(s.dep, false)} · {s.nights} night{s.nights === 1 ? '' : 's'}{s.gem ? ` · ${s.gem}` : ''}</span>
                  </span>
                  <span className="shrink-0 flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PHASE_STYLE[ph]}`}>{ph}</span>
                    {ph !== 'Departed' && milkToday(s.villas[s.villas.length - 1]) && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 flex items-center gap-0.5" title={milkToday(s.villas[s.villas.length - 1])!.items.join(' + ')}><Milk size={10} /> Milk</span>}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );

  /* ---------------- profile ---------------- */
  const profile = stayKey && (
    <div className="flex-1 min-w-0">
      <button onClick={close} className="lg:hidden mb-3 h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm font-black text-slate-600 flex items-center gap-1.5 print:hidden"><ArrowLeft size={16} /> All stays</button>
      {loadingStay ? <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>
        : !stay ? <p className="py-20 text-center text-sm font-semibold text-slate-400">This stay could not be found.</p>
        : (() => {
          const ph = phaseOf(stay, today);
          const tags = occasionsOf(stay);
          const repeater = (past?.length || 0) > 0 || tags.includes('Repeater');
          return (
            <div className="space-y-3">
              {/* Header */}
              <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${PHASE_STYLE[ph]}`}>{ph}</span>
                      {repeater && <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#6D2158] text-white flex items-center gap-1"><Repeat size={11} /> Repeater{past?.length ? ` · ${past.length + 1} stays` : ''}</span>}
                      {tags.filter(t => t !== 'Repeater').map(t => <span key={t} className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{t}</span>)}
                    </div>
                    {people(stay.name).map(p => <h1 key={p} className="text-lg sm:text-xl font-black text-slate-800 leading-tight">{p}</h1>)}
                  </div>
                  <button onClick={() => window.print()} className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 print:hidden" title="Print profile"><Printer size={17} /></button>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([
                    [BedDouble, 'Villa', villasLabel(stay.villas)],
                    [CalendarDays, 'Arrival', `${nice(stay.arr)}${stay.arrTime ? ` · ${stay.arrTime}` : ''}`],
                    [CalendarDays, 'Departure', `${nice(stay.dep)}${stay.depTime ? ` · ${stay.depTime}` : ''}`],
                    [History, 'Nights', String(stay.nights)],
                    [Users, 'Guests', `${stay.adults} adult${stay.adults === 1 ? '' : 's'}${stay.kids ? ` · ${stay.kids} child${stay.kids === 1 ? '' : 'ren'}` : ''}`],
                    [Utensils, 'Meal plan', stay.mealPlan || '—'],
                    [UserRound, 'GEM', stay.gem || '—'],
                  ] as const).map(([Icon, label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 flex items-center gap-1"><Icon size={11} /> {label}</p>
                      <p className="text-sm font-black text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Notes */}
              <section className="bg-white rounded-2xl border border-slate-200">
                <h2 className="px-4 py-3 border-b border-slate-100 text-sm font-black text-slate-800 flex items-center gap-2"><StickyNote size={15} className="text-[#6D2158]" /> Notes & preferences</h2>
                {stay.notes.length === 0 ? <p className="px-4 py-6 text-sm font-semibold text-slate-400">No notes recorded.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {stay.notes.map((n, i) => (
                      <li key={i} className="px-4 py-2.5 flex gap-3">
                        <span className="text-sm font-semibold text-slate-700 flex-1 whitespace-pre-wrap">{n.text}</span>
                        <span className="text-[11px] font-bold text-slate-400 shrink-0">{nice(n.first, false)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Milk */}
              {stayMilk.length > 0 && (() => {
                const items = [...new Set(stayMilk.flatMap(m => m.items))];
                const notes = [...new Set(stayMilk.map(m => m.note).filter(Boolean))];
                return (
                  <section className="bg-white rounded-2xl border border-slate-200">
                    <h2 className="px-4 py-3 border-b border-slate-100 text-sm font-black text-slate-800 flex items-center gap-2"><Milk size={15} className="text-sky-600" /> Daily milk</h2>
                    <div className="px-4 py-3 space-y-2">
                      <p className="text-sm font-black text-slate-800">{items.join(' + ')}{notes.length ? <span className="ml-2 text-xs font-bold text-sky-700">{notes.join(' · ')}</span> : null}</p>
                      <p className="text-xs font-semibold text-slate-500">On the milk list {stayMilk.length} day{stayMilk.length === 1 ? '' : 's'}: {nice(stayMilk[0].date, false)} – {nice(stayMilk[stayMilk.length - 1].date, false)} · until {nice(stayMilk[stayMilk.length - 1].until, false)}</p>
                      <div className="flex flex-wrap gap-1">
                        {stayMilk.map(m => <span key={m.date} className="px-2 py-0.5 rounded-md bg-sky-50 text-[11px] font-bold text-sky-800" title={m.items.join(' + ')}>{nice(m.date, false)}</span>)}
                      </div>
                    </div>
                  </section>
                );
              })()}

              {/* Requests & minibar */}
              <section className="bg-white rounded-2xl border border-slate-200">
                <h2 className="px-4 py-3 border-b border-slate-100 text-sm font-black text-slate-800 flex items-center gap-2"><Wine size={15} className="text-[#6D2158]" /> Requests & minibar <span className="text-slate-400 font-bold">· {requests.length}</span></h2>
                {requests.length === 0 ? <p className="px-4 py-6 text-sm font-semibold text-slate-400">No requests during this stay.</p> : (
                  <>
                    {totals.length > 0 && (
                      <div className="px-4 pt-3 flex flex-wrap gap-1.5">
                        {totals.slice(0, 18).map(([item, n]) => <span key={item} className="px-2.5 py-1 rounded-lg bg-[#6D2158]/5 text-xs font-bold text-slate-700"><span className="text-[#6D2158] font-black">{n}×</span> {item}</span>)}
                      </div>
                    )}
                    <div className="p-2">
                      {reqByDay.map(([day, rs]) => (
                        <div key={day} className="px-2 py-2">
                          <p className="text-[11px] font-black text-slate-400 uppercase tracking-wide mb-1">{nice(day, false)}</p>
                          <div className="space-y-1.5">
                            {rs.map(r => (
                              <div key={r.id} className="rounded-xl border border-slate-100 px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs font-black text-slate-700">
                                  <span className="text-slate-400 font-bold">{hhmm(r.request_time)}</span>
                                  <span>{r.request_type}</span>
                                  {r.package_tag && <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px]">{r.package_tag}</span>}
                                  {stay.villas.length > 1 && <span className="text-slate-400 font-bold">V{r.villa_number}</span>}
                                  {r.attendant_name && <span className="ml-auto text-[11px] font-semibold text-slate-400">{r.attendant_name}</span>}
                                </div>
                                <p className="mt-0.5 text-xs font-semibold text-slate-600 whitespace-pre-line">{String(r.item_details || '').replace(/^[✓✔]\s*/gm, '')}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* Day by day */}
              <section className="bg-white rounded-2xl border border-slate-200">
                <h2 className="px-4 py-3 border-b border-slate-100 text-sm font-black text-slate-800 flex items-center gap-2"><CalendarDays size={15} className="text-[#6D2158]" /> Day by day</h2>
                <div className="divide-y divide-slate-100">
                  {stay.days.map(d => (
                    <div key={d.id} className="px-4 py-2 grid grid-cols-[70px_52px_1fr_auto] gap-2 items-center text-sm">
                      <span className="font-bold text-slate-500">{nice(d.report_date, false)}</span>
                      <span className="font-black text-slate-800">V{d.villa_number}</span>
                      <span className="text-xs font-bold text-slate-500 truncate">{attendants[d.report_date] ? `VA: ${attendants[d.report_date]}` : ''}</span>
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{d.status}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Earlier stays */}
              <section className="bg-white rounded-2xl border border-slate-200 print:hidden">
                <h2 className="px-4 py-3 border-b border-slate-100 text-sm font-black text-slate-800 flex items-center gap-2"><Repeat size={15} className="text-[#6D2158]" /> Other stays (same name)</h2>
                {past === null ? <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
                  : past.length === 0 ? <p className="px-4 py-6 text-sm font-semibold text-slate-400">No other stays on record (history starts Jan 2026).</p>
                  : (
                    <div className="p-2 space-y-1.5">
                      {past.map(p => (
                        <button key={p.key} onClick={() => open(p)} className="w-full text-left rounded-xl border border-slate-200 hover:border-[#6D2158] px-3 py-2.5 flex items-center gap-3">
                          <span className="text-sm font-black text-slate-800 w-16 shrink-0">{villasLabel(p.villas)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-slate-700 truncate">{people(p.name).join(', ')}</span>
                            <span className="block text-xs font-semibold text-slate-400">{nice(p.arr)} → {nice(p.dep)} · {p.nights} nights{p.gem ? ` · ${p.gem}` : ''}</span>
                          </span>
                          <ChevronRight size={16} className="text-slate-300" />
                        </button>
                      ))}
                    </div>
                  )}
              </section>
            </div>
          );
        })()}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-32 md:pb-12 print:bg-white print:pb-0">
      <div className="bg-white border-b border-slate-200 print:hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-[#6D2158] leading-tight">Guest History</h1>
            <p className="text-xs font-semibold text-slate-400">Every stay: villa, dates, notes, requests and minibar</p>
          </div>
          <button onClick={() => setMilkOpen(true)} className="h-10 px-3 rounded-xl bg-sky-50 border border-sky-200 text-xs font-black text-sky-700 flex items-center gap-1.5">
            <Milk size={15} /> Daily milk{todayMilk?.entries.length ? <span className="ml-0.5 px-1.5 rounded-full bg-sky-600 text-white text-[10px]">{todayMilk.entries.length}</span> : null}
          </button>
          <Link href="/guests" className="hidden sm:flex h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-600 items-center gap-1.5">Guest List <ArrowRight size={14} /></Link>
        </div>
      </div>
      {milkOpen && <MilkPanel today={today} onClose={() => setMilkOpen(false)} onSaved={() => { loadMilkList(today).then(setTodayMilk).catch(() => {}); if (stayKey) loadProfile(stayKey); }} />}
      <div className="max-w-6xl mx-auto px-4 pt-4 flex flex-col lg:flex-row gap-4 items-start">
        {list}
        {profile || (
          <div className="hidden lg:flex flex-1 min-h-[50vh] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-sm font-bold text-slate-400">
            Choose a stay to see the guest profile
          </div>
        )}
      </div>
    </div>
  );
}

export default function GuestHistoryPage() {
  return (
    <AdminOnly what="Guest History">
      <Suspense fallback={<div className="py-24 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>}>
        <GuestHistoryInner />
      </Suspense>
    </AdminOnly>
  );
}

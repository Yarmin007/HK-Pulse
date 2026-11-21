"use client";
import { MAINTENANCE_TYPE } from '@/lib/requestRouting';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bike, Check, CheckCheck, Clock, Loader2, MapPin, RefreshCw, Ticket, User, Wine, ClipboardList, Star,
  Package, Plus, Minus, X, Search, Undo2, Home, Send, Shuffle, PackageMinus, ArrowRight, Wrench,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr, getDhakaTime, formatDisplayTime } from '@/lib/dateUtils';
import {
  classifyTarget, parseVillas, isOnlyRefills, splitItems, normalizeVillaNumber, packageOf,
  deliveryOf, deliveryPatch, undoPatch, sameName, isMissingColumn, MISSING_COLUMN_HINT, shortHHMM, isForToday, itemsPending, GENERIC_RUNNER,
  type Delivery, type Session,
} from '@/lib/requestsShared';
import PackageRibbon from '@/components/PackageRibbon';
import QtyEditor from '@/app/minibar/live-tracking/QtyEditor';
import PushToggle from '@/components/PushToggle';
import { notifyRunners, notifyVillaVA } from '@/lib/requestNotify';
import { insertMovements, loadLedger, newBatchId, type Ledger } from '@/lib/minibarLedgerData';
import { OFFICE, moveRows, qtyAt, villaLoc, locLabel, type Loc } from '@/lib/minibarLedger';

// Requests for Runners and Villa Attendants. No posting, bills or CHK numbers here.
//  • Runner: sees every request (except private ones) → Take → To Villa / To Pantry.
//  • VA: sees only their allocated villas → confirms pantry drops in the villa, and can add requests.

export type StaffMode = { kind: 'runner' } | { kind: 'va'; villas: string[] };

type Req = {
  id: string;
  villa_number: string;
  request_type: string;
  item_details: string;
  request_time: string;
  is_sent: boolean;
  is_done: boolean;
  is_private?: boolean;
  guest_name?: string;
  attendant_name?: string;
  logged_by?: string;
  delivery_status?: string | null;
  taken_by?: string | null;
  taken_at?: string | null;
  pantry_by?: string | null;
  pantry_at?: string | null;
  delivered_by?: string | null;
  delivered_at?: string | null;
  reassigned_on?: string | null;
};

type Host = { id: string; host_id: string; full_name: string; nicknames?: string | null; mvpn?: string | null };
type Guest = { villa_number: string; guest_name?: string; meal_plan?: string; status?: string; remarks?: string; stay_dates?: string };
type CatalogItem = { article_number: string; article_name: string; generic_name?: string; category: string; is_minibar_item: boolean; image_url?: string };

const shortName = (h?: Host | null) => (h ? (h.nicknames ? h.nicknames.split(',')[0].trim() : h.full_name) : '');
const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const agoLabel = (m: number) => (m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`);

const extractMainGuest = (full: string) => {
  if (!full) return '';
  const parts = full.split(/[\/&]/).map(s => s.trim());
  return parts.find(p => /\b(Mr|Mrs|Ms|Dr)\.?\b/.test(p)) || parts[0];
};
const parseDepInfo = (remarks?: string): { name?: string } | null => {
  const m = String(remarks || '').match(/\[DEP_INFO\](.*?)\[\/DEP_INFO\]/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};

const TYPE_STYLE: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  Minibar: { label: 'Minibar', cls: 'bg-rose-50 text-rose-700 border-rose-100', icon: Wine },
  'GEM Request': { label: 'GEM', cls: 'bg-amber-50 text-amber-700 border-amber-100', icon: Star },
};
const typeStyle = (t: string) => TYPE_STYLE[t] || { label: 'Request', cls: 'bg-violet-50 text-violet-700 border-violet-100', icon: ClipboardList };

// Same zones as the coordinator's Requests page.
const JETTIES = ['All', 'Jetty A', 'Jetty B', 'Jetty C', 'Beach'] as const;
type Jetty = (typeof JETTIES)[number];
const jettyOf = (villa: string): Jetty | null => {
  const t = classifyTarget(villa);
  if (t.kind !== 'villa') return null;
  const n = parseInt(t.base, 10);
  if (n >= 1 && n <= 35) return 'Jetty A';
  if (n >= 37 && n <= 50) return 'Jetty B';
  if (n >= 59 && n <= 79) return 'Jetty C';
  return 'Beach';
};

const CATEGORY_ORDER = ['bites', 'sweets', 'juices', 'soft drinks', 'water', 'beer', 'wines', 'spirits', 'retail', 'general requests'];

export default function StaffRequests({ mode, session }: { mode: StaffMode; session: Session }) {
  const isRunner = mode.kind === 'runner';
  const me = session.nicknames?.split(',')[0].trim() || session.full_name || (isRunner ? 'Runner' : 'VA');

  const [requests, setRequests] = useState<Req[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [allocs, setAllocs] = useState<{ host_id: string; area: string; shift: string; task_details: string }[]>([]);
  const [guests, setGuests] = useState<Record<string, Guest>>({});
  const [doubleVillas, setDoubleVillas] = useState<string[]>([]);
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [jetty, setJetty] = useState<Jetty>(() => {
    try { return (localStorage.getItem('hk_runner_jetty') as Jetty) || 'All'; } catch { return 'All'; }
  });
  const pickJetty = (j: Jetty) => { setJetty(j); try { localStorage.setItem('hk_runner_jetty', j); } catch { /* private mode */ } };
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // New request sheet (VA)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [newVilla, setNewVilla] = useState('');
  const [newKind, setNewKind] = useState<'Minibar' | 'General'>('Minibar');
  const [cart, setCart] = useState<{ name: string; qty: number; refill: boolean }[]>([]);
  const [note, setNote] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Minibar moves (VA): remove a whole minibar, or transfer between their own villas.
  const [mbPickOpen, setMbPickOpen] = useState(false);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [mbAction, setMbAction] = useState<{ type: 'removal'; loc: Loc } | { type: 'transfer'; from: Loc; to: Loc } | null>(null);

  const today = getDhakaDateStr();
  const myVillas = useMemo(() => new Set(mode.kind === 'va' ? mode.villas.map(v => normalizeVillaNumber(v)) : []), [mode]);
  const isMine = useCallback((villa: string) => {
    if (mode.kind !== 'va') return true;
    const t = classifyTarget(villa);
    return t.kind === 'villa' && (myVillas.has(t.value) || myVillas.has(t.base));
  }, [mode.kind, myVillas]);

  const load = useCallback(async () => {
    const start = `${today}T00:00:00+06:00`;
    const end = `${today}T23:59:59+06:00`;
    const weekAgo = getDhakaDateStr(new Date(getDhakaTime().getTime() - 7 * 86400000));
    const [todayRes, olderRes, allocRes, hostRes, dvRes, guestRes] = await Promise.all([
      supabase.from('hsk_daily_requests').select('*').gte('request_time', start).lte('request_time', end).order('request_time', { ascending: false }),
      supabase.from('hsk_daily_requests').select('*').gte('request_time', `${weekAgo}T00:00:00+06:00`).lt('request_time', start).order('request_time', { ascending: false }),
      supabase.from('hsk_allocations').select('host_id, area, shift, task_details').eq('report_date', today),
      supabase.from('hsk_hosts').select('id, host_id, full_name, nicknames, mvpn').eq('status', 'Active'),
      supabase.from('hsk_constants').select('label').eq('type', 'double_mb_villas'),
      supabase.from('hsk_daily_summary').select('villa_number, guest_name, meal_plan, status, remarks, stay_dates').eq('report_date', today),
    ]);
    // Only today's requests — an older open one shows when the coordinator re-assigns it to today.
    // Private requests never show here.
    const older = ((olderRes.data || []) as Req[]).filter(r => isForToday(r, today) && deliveryOf(r) !== 'delivered');
    setRequests([...(todayRes.data || []) as Req[], ...older].filter(r => !r.is_private && r.request_type !== 'Time Edit Request' && isMine(r.villa_number)));
    setAllocs(allocRes.data || []);
    setHosts((hostRes.data || []) as Host[]);
    setDoubleVillas((dvRes.data || []).flatMap((c: { label: string }) => c.label.split(',').map(v => v.trim())).filter(Boolean));
    const gm: Record<string, Guest> = {};
    for (const g of (guestRes.data || []) as Guest[]) gm[normalizeVillaNumber(g.villa_number)] = g;
    setGuests(gm);
    setLoading(false);
  }, [today, isMine]);

  useEffect(() => { load(); }, [load]);

  // Live updates + keep "x min ago" fresh.
  useEffect(() => {
    const ch = supabase.channel(`staff_requests_${mode.kind}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, () => { load(); })
      .subscribe();
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [load, mode.kind]);

  const hostById = useMemo(() => {
    const m = new Map<string, Host>();
    for (const h of hosts) { m.set(h.id, h); if (h.host_id) m.set(h.host_id, h); }
    return m;
  }, [hosts]);

  const villaVA = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of allocs) {
      if (a.area !== 'villa') continue;
      const name = shortName(hostById.get(a.host_id));
      if (!name) continue;
      for (const v of parseVillas(a.task_details || '', doubleVillas)) if (!map[v]) map[v] = name;
    }
    return map;
  }, [allocs, hostById, doubleVillas]);

  // Runner: their part ends at the pantry. VA: a pantry drop is still theirs to finish.
  // Runner: handed to them (or to "Runner") is theirs; it's done for them once it is at the pantry, with the VA or in the villa.
  const isMineRunner = (r: Req) => deliveryOf(r) === 'taken' && (!r.taken_by || sameName(r.taken_by, me) || r.taken_by === GENERIC_RUNNER);
  const isTodo = (r: Req) => {
    const d = deliveryOf(r);
    if (d === 'delivered') return false;
    if (isRunner) return d === 'new' || d === 'taken';
    return true;
  };
  // Runner groups: 0 handed to you · 1 still at the office · 2 with another runner. VA: with you / at pantry first.
  const groupOf = (r: Req) => {
    const d = deliveryOf(r);
    if (isRunner) return isMineRunner(r) ? 0 : d === 'new' ? 1 : 2;
    return d === 'va' || d === 'pantry' ? 0 : 1;
  };
  const rank = groupOf;
  // Runner's jetty filter; comp codes / "Beach bar" style targets show under All only.
  const inJetty = (r: Req) => !isRunner || jetty === 'All' || jettyOf(r.villa_number) === jetty;
  const vaOf = (villa: string) => { const t = classifyTarget(villa); return t.kind === 'villa' ? (villaVA[t.value] || villaVA[t.base] || '') : ''; };
  // VA-only jobs (handed to the villa attendant) are not the runner's business.
  const forMe = (r: Req) => {
    if (!isRunner) return true;
    const d = deliveryOf(r);
    if (d === 'va') return false;
    if (r.request_type === MAINTENANCE_TYPE) return false; // Engineering's job, not the runner's
    return !(d === 'delivered' && !r.pantry_at && r.taken_by && sameName(r.taken_by, vaOf(r.villa_number)));
  };
  const jettyCount = (j: Jetty) => requests.filter(r => forMe(r) && isTodo(r) && (j === 'All' || jettyOf(r.villa_number) === j)).length;
  const todo = requests.filter(r => forMe(r) && isTodo(r) && inJetty(r)).sort((a, b) => rank(a) - rank(b) || a.request_time.localeCompare(b.request_time));
  const done = requests.filter(r => forMe(r) && !isTodo(r) && inJetty(r)).sort((a, b) => (b.delivered_at || b.pantry_at || b.request_time).localeCompare(a.delivered_at || a.pantry_at || a.request_time));
  const list = tab === 'todo' ? todo : done;
  const pantryCount = requests.filter(r => deliveryOf(r) === 'pantry' || deliveryOf(r) === 'va').length;
  const GROUP_TITLE = isRunner
    ? ['Handed to you — take it out', 'At the office — not handed over yet', 'With another runner']
    : ['With you or at the pantry — put it in the villa', 'Coming — not with you yet'];

  const move = async (r: Req, to: Delivery | 'undo', holder?: string) => {
    const patch = to === 'undo' ? undoPatch(r, isRunner ? undefined : me) : deliveryPatch(r, to, me, holder);
    setBusy(r.id);
    setRequests(prev => prev.map(x => (x.id === r.id ? { ...x, ...patch } as Req : x)));
    const { error } = await supabase.from('hsk_daily_requests').update(patch).eq('id', r.id);
    setBusy(null);
    if (error) { toast.error(isMissingColumn(error) ? MISSING_COLUMN_HINT : 'Not saved — check your connection'); load(); return; }
    if (to === 'delivered') toast.success('In villa — done');
    else if (to === 'pantry') {
      toast.success('Left at pantry — VA will confirm');
      notifyVillaVA(r.villa_number, `📦 At pantry · ${classifyTarget(r.villa_number).label}`, r.item_details, doubleVillas);
    }
    else if (to === 'taken') toast.success('With you');
    else if (to === 'va') toast.success(`Handed to ${holder || 'VA'}`);
    else if (to === 'undo') toast.success('Undone');
  };

  // ---------------- New request (VA) ----------------
  const openSheet = async () => {
    setNewVilla(mode.kind === 'va' && mode.villas.length === 1 ? normalizeVillaNumber(mode.villas[0]) : '');
    setNewKind('Minibar'); setCart([]); setNote(''); setItemSearch('');
    setSheetOpen(true);
    if (!catalog.length) {
      const { data } = await supabase.from('hsk_master_catalog').select('article_number, article_name, generic_name, category, is_minibar_item, image_url').eq('is_minibar_item', true);
      setCatalog((data || []) as CatalogItem[]);
    }
  };
  const itemLabel = (i: CatalogItem) => (i.generic_name || i.article_name || '').trim();
  const shownItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return catalog
      .filter(i => !/\bqr\b/i.test(`${i.article_name} ${i.generic_name}`))
      .filter(i => !q || `${i.article_name} ${i.generic_name} ${i.category}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const ca = CATEGORY_ORDER.indexOf((a.category || '').toLowerCase()), cb = CATEGORY_ORDER.indexOf((b.category || '').toLowerCase());
        return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) || itemLabel(a).localeCompare(itemLabel(b));
      });
  }, [catalog, itemSearch]);
  const addItem = (name: string, d: number) => setCart(prev => {
    const ex = prev.find(i => i.name === name);
    if (!ex) return d > 0 ? [...prev, { name, qty: 1, refill: false }] : prev;
    return prev.map(i => (i.name === name ? { ...i, qty: i.qty + d } : i)).filter(i => i.qty > 0);
  });

  const saveNew = async () => {
    const v = normalizeVillaNumber(newVilla);
    if (!v || !isMine(v)) return toast.error('Pick one of your villas');
    const details = newKind === 'Minibar' ? cart.map(i => `${i.qty}x ${i.name}${i.refill ? ' (Refill)' : ''}`).join('\n') : note.trim();
    if (!details) return toast.error(newKind === 'Minibar' ? 'Add at least one item' : 'Write the request');
    const base = classifyTarget(v).base;
    const g = guests[base];
    // Minibar on a DEP/ARR day belongs to the departing guest, other requests to the arriving one.
    const st = String(g?.status || '').toUpperCase();
    const depName = st === 'DEP/ARR' ? parseDepInfo(g?.remarks)?.name || '' : '';
    const guestFull = newKind === 'Minibar' && depName ? depName : g?.guest_name || '';
    const meal = newKind === 'Minibar' && depName ? '' : g?.meal_plan || '';
    setSaving(true);
    const { error } = await supabase.from('hsk_daily_requests').insert({
      villa_number: v,
      request_type: newKind,
      item_details: details,
      request_time: new Date().toISOString(),
      attendant_name: me,
      guest_name: extractMainGuest(guestFull),
      package_tag: packageOf(meal) || meal,
      logged_by: me,
    });
    setSaving(false);
    if (error) return toast.error('Not saved — check your connection');
    toast.success('Request sent');
    notifyRunners(v, newKind, details);
    setSheetOpen(false);
    load();
  };

  // A double-minibar villa ("87") is split into 87-1 / 87-2 in the minibar ledger.
  const myBars = (): Loc[] => (mode.kind === 'va' ? mode.villas : []).flatMap(v => {
    const nv = normalizeVillaNumber(v);
    return !nv.includes('-') && doubleVillas.includes(nv) ? [villaLoc(`${nv}-1`), villaLoc(`${nv}-2`)] : [villaLoc(nv)];
  });
  const openMinibarMoves = async () => {
    setMbPickOpen(true);
    const l = await loadLedger();
    if (!l.started) { toast.error('Minibar tracking has not started yet — ask the coordinator.'); setMbPickOpen(false); return; }
    setLedger(l);
  };
  const saveMoves = async (rows: Record<string, unknown>[], msg: string) => {
    const { error } = await insertMovements(rows);
    if (error) { toast.error('Not saved — check your connection'); return false; }
    toast.success(msg);
    setMbAction(null); setMbPickOpen(false); setLedger(null);
    return true;
  };

  if (loading) {
    return <div className="min-h-[70dvh] flex items-center justify-center text-[#6D2158]"><Loader2 className="animate-spin" /></div>;
  }

  const headerTone = isRunner ? 'from-orange-600 to-amber-500 shadow-orange-600/20' : 'from-[#6D2158] to-[#9b3a82] shadow-[#6D2158]/20';
  const villasLabel = mode.kind === 'va' ? mode.villas.map(v => normalizeVillaNumber(v)).join(', ') : '';

  return (
    <div className="min-h-full bg-[#F7F5F8] font-sans text-slate-800">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-3 md:pt-8 pb-28 space-y-3">

        {/* HEADER */}
        <header className={`rounded-3xl bg-gradient-to-br text-white p-4 md:p-5 shadow-lg ${headerTone}`}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">{isRunner ? <Bike size={22} /> : <Home size={22} />}</div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-black leading-tight">Requests</h1>
              <p className="text-xs font-semibold text-white/80 truncate">
                {isRunner ? 'Runner · all villas' : `My villas · ${villasLabel || '—'}`}
              </p>
            </div>
            <button onClick={() => load()} className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25" title="Refresh"><RefreshCw size={16} /></button>
          </div>
          {!isRunner && (
            <button onClick={openMinibarMoves} className="mt-3 w-full px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-black flex items-center justify-center gap-1.5">
              <Shuffle size={14} /> Minibar transfer / removal
            </button>
          )}
          {!isRunner && pantryCount > 0 && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-amber-400 text-amber-950 text-xs font-black flex items-center gap-2">
              <Package size={14} /> {pantryCount} with you or at the pantry — put in the villa and confirm
            </div>
          )}
        </header>

        <PushToggle hostId={session.id} what={isRunner ? 'new requests' : 'pantry drops for your villas'} />

        {/* TABS */}
        <div className="flex bg-white border border-slate-200 p-1 rounded-2xl sticky top-2 z-10 shadow-sm">
          {([['todo', 'To do', todo.length], ['done', 'Done', done.length]] as const).map(([k, l, n]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-colors ${tab === k ? (k === 'todo' ? (isRunner ? 'bg-orange-600 text-white' : 'bg-[#6D2158] text-white') : 'bg-emerald-600 text-white') : 'text-slate-500'}`}>
              {l} <span className={`text-[11px] px-1.5 rounded-md ${tab === k ? 'bg-white/20' : 'bg-slate-100'}`}>{n}</span>
            </button>
          ))}
        </div>

        {isRunner && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {JETTIES.map(j => {
              const n = jettyCount(j);
              return (
                <button key={j} onClick={() => pickJetty(j)}
                  className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-colors ${jetty === j ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                  {j}{n > 0 && <span className={`px-1.5 rounded-md text-[10px] ${jetty === j ? 'bg-white/20' : 'bg-orange-100 text-orange-700'}`}>{n}</span>}
                </button>
              );
            })}
          </div>
        )}

        {list.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <CheckCheck size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">{tab === 'todo' ? 'Nothing to do right now.' : 'Nothing finished yet today.'}</p>
          </div>
        )}

        {list.map((r, idx) => {
          const grp = tab === 'todo' ? groupOf(r) : -1;
          const showHead = tab === 'todo' && (idx === 0 || groupOf(list[idx - 1]) !== grp);
          const target = classifyTarget(r.villa_number);
          const g = target.kind === 'villa' ? guests[target.base] : undefined;
          const va = target.kind === 'villa' ? (villaVA[target.value] || villaVA[target.base] || '') : '';
          const items = splitItems(r.item_details);
          const ts = typeStyle(r.request_type);
          const d = deliveryOf(r);
          const mins = minutesAgo(r.request_time);
          const late = d !== 'delivered' && mins >= 30;
          const notToday = getDhakaDateStr(new Date(new Date(r.request_time).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }))) !== today;
          const pkg = packageOf(g?.meal_plan);
          const guestName = r.guest_name || extractMainGuest(g?.guest_name || '');
          const pantryWait = d === 'pantry' ? minutesAgo(r.pantry_at || r.request_time) : 0;
          const pending = d === 'new' ? items.length : itemsPending(r.item_details);
          const partial = r.request_type === 'Minibar' && d !== 'new' && pending > 0;
          return (
            <React.Fragment key={r.id}>
            {showHead && <h2 className={`px-1 pt-2 text-[11px] font-black uppercase tracking-wider ${grp === 0 ? (isRunner ? 'text-orange-600' : 'text-amber-700') : 'text-slate-400'}`}>{GROUP_TITLE[grp]}</h2>}
            <article className={`relative bg-white rounded-3xl border shadow-sm overflow-hidden ${d === 'pantry' && !isRunner ? 'border-amber-300 ring-2 ring-amber-100' : late ? 'border-rose-200' : 'border-slate-200'}`}>
              <PackageRibbon pkg={pkg} />
              <div className="flex items-start gap-3 p-4 pb-3">
                <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0 ${target.kind === 'villa' ? 'bg-[#6D2158] text-white' : 'bg-slate-800 text-white'}`}>
                  {target.kind === 'villa' ? (<><span className="text-[10px] font-bold opacity-70 leading-none">VILLA</span><span className="text-2xl font-black leading-none mt-0.5">{target.value}</span></>)
                    : target.kind === 'code' ? (<><Ticket size={16} /><span className="text-[11px] font-black mt-1">{target.value}</span></>)
                    : (<><MapPin size={16} /><span className="text-[10px] font-black mt-1 px-1 text-center leading-tight line-clamp-2">{target.value}</span></>)}
                </div>
                <div className={`min-w-0 flex-1 ${pkg ? 'pr-10' : ''}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${ts.cls}`}><ts.icon size={11} /> {ts.label}</span>
                    {isOnlyRefills(r.item_details) && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-100">Refill</span>}
                    {target.kind === 'code' && <span className="text-[10px] font-bold text-slate-500">Complimentary code</span>}
                  </div>
                  {guestName && <p className="text-xs font-bold text-slate-800 mt-1.5 truncate flex items-center gap-1"><User size={12} className="text-slate-400 shrink-0" /> {guestName}</p>}
                  <p className={`text-xs font-semibold mt-1 flex items-center gap-1 ${late ? 'text-rose-600' : 'text-slate-500'}`}>
                    <Clock size={12} /> {formatDisplayTime(r.request_time)} · {notToday ? new Date(r.request_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : agoLabel(mins)}
                  </p>
                  {isRunner && va && <p className="text-xs font-bold text-slate-700 mt-1">VA: {va}</p>}
                </div>
              </div>

              {/* Each item: handed over (left the office) or still at the office */}
              <ul className="px-4 pb-2 space-y-1">
                {items.map((it, i) => {
                  const handed = d !== 'new' && it.sent;
                  const atOffice = d === 'new' || (d !== 'delivered' && !it.sent);
                  return (
                    <li key={i} className="text-[15px] font-semibold flex items-center gap-2 text-slate-800">
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${handed ? 'bg-emerald-500 text-white' : 'border-2 border-slate-200'}`}>{handed && <Check size={12} strokeWidth={3} />}</span>
                      <span className="flex-1 min-w-0">{it.name}</span>
                      {d !== 'delivered' && (atOffice
                        ? <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">at office</span>
                        : <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 shrink-0">handed</span>)}
                    </li>
                  );
                })}
              </ul>

              {/* Where it is now */}
              {d !== 'new' && (
                <div className={`mx-3 mb-2 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${d === 'delivered' ? 'bg-emerald-50 text-emerald-700' : d === 'pantry' || d === 'va' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>
                  {d === 'taken' && r.request_type === MAINTENANCE_TYPE && <><Wrench size={13} /> Reported to Engineering · {shortHHMM(r.taken_at)}</>}
                  {d === 'taken' && r.request_type !== MAINTENANCE_TYPE && <><Bike size={13} /> {r.taken_by === me ? 'With you' : !r.taken_by || r.taken_by === GENERIC_RUNNER ? (isRunner ? 'Handed to runner — that is you' : 'With the runner') : `With ${r.taken_by}`} · {shortHHMM(r.taken_at)}{partial ? ` · ${pending} still at office` : ''}</>}
                  {d === 'va' && <><User size={13} /> {r.taken_by === me ? 'Handed to you' : `Handed to ${r.taken_by || 'the VA'}`} · {shortHHMM(r.taken_at)}</>}
                  {d === 'pantry' && <><Package size={13} /> At pantry since {shortHHMM(r.pantry_at)}{r.pantry_by ? ` (${r.pantry_by})` : ''}{pantryWait >= 30 ? ` · ${agoLabel(pantryWait)}` : ''}{isRunner ? ' — waiting for VA' : ''}</>}
                  {d === 'delivered' && <><Check size={13} /> In villa · {r.delivered_by === me ? 'you' : r.delivered_by} {shortHHMM(r.delivered_at)}{r.pantry_at ? ' · via pantry' : ''}</>}
                </div>
              )}

              <div className="px-3 pb-3 pt-1 space-y-2">
                {isRunner && (d === 'va' || (d === 'pantry' && !sameName(r.pantry_by, me)) || (d === 'delivered' && !sameName(r.delivered_by, me))) ? null
                : d === 'delivered' || (isRunner && d === 'pantry') ? (
                  // Undo one step
                  <button onClick={() => move(r, 'undo')} disabled={busy === r.id}
                    className="w-full py-2.5 rounded-2xl text-xs font-bold text-slate-500 bg-slate-100 flex items-center justify-center gap-1.5"><Undo2 size={13} /> Undo</button>
                ) : isRunner && d === 'new' ? (
                  <button onClick={() => move(r, 'taken')} disabled={busy === r.id}
                    className="w-full py-3 rounded-2xl text-sm font-bold text-slate-600 bg-slate-100 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60">
                    {busy === r.id ? <Loader2 size={16} className="animate-spin" /> : <Bike size={17} />} I collected it from the office
                  </button>
                ) : isRunner ? (
                  <>
                    {partial && (
                      <button onClick={() => move(r, 'taken', r.taken_by || undefined)} disabled={busy === r.id}
                        className="w-full py-2 rounded-2xl text-xs font-bold text-slate-600 bg-slate-100">I have the rest too ({pending} at office)</button>
                    )}
                    {!isMineRunner(r) && <p className="text-center text-[11px] font-bold text-slate-400">With {r.taken_by} — you can still finish it</p>}
                    <div className={`grid gap-2 ${classifyTarget(r.villa_number).kind === 'villa' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <button onClick={() => move(r, 'delivered')} disabled={busy === r.id || partial}
                        className="py-3 rounded-2xl text-sm font-black text-white bg-emerald-600 active:scale-[0.99] flex items-center justify-center gap-1.5 disabled:opacity-40"><Home size={17} /> Villa</button>
                      <button onClick={() => move(r, 'pantry')} disabled={busy === r.id || partial}
                        className="py-3 rounded-2xl text-sm font-black text-amber-950 bg-amber-400 active:scale-[0.99] flex items-center justify-center gap-1.5 disabled:opacity-40"><Package size={17} /> Pantry</button>
                      {classifyTarget(r.villa_number).kind === 'villa' && (
                        <button onClick={() => move(r, 'va', vaOf(r.villa_number) || 'VA')} disabled={busy === r.id || partial}
                          className="py-3 rounded-2xl text-sm font-black text-amber-900 bg-amber-100 border border-amber-300 active:scale-[0.99] flex items-center justify-center gap-1.5 disabled:opacity-40"><User size={17} /> To VA</button>
                      )}
                    </div>
                    {partial && <p className="text-center text-[11px] font-semibold text-slate-400">Wait until everything is handed over, or tap “I have the rest too”.</p>}
                    <button onClick={() => move(r, 'new')} disabled={busy === r.id} className="w-full py-1.5 text-[11px] font-bold text-slate-400">Return to office</button>
                  </>
                ) : (
                  <button onClick={() => move(r, 'delivered')} disabled={busy === r.id}
                    className={`w-full py-3 rounded-2xl text-sm font-black text-white active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60 ${d === 'pantry' || d === 'va' ? 'bg-amber-600' : 'bg-emerald-600'}`}>
                    {busy === r.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={18} />}
                    {r.request_type === MAINTENANCE_TYPE ? 'Fixed' : d === 'pantry' ? 'Collected from pantry — in villa' : d === 'va' ? 'Done' : 'Placed in villa'}
                  </button>
                )}
              </div>
            </article>
            </React.Fragment>
          );
        })}
      </div>

      {/* NEW REQUEST (VA) */}
      {!isRunner && (
        <button onClick={openSheet}
          className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-8 z-20 px-5 py-3.5 rounded-2xl bg-[#6D2158] text-white text-sm font-black shadow-xl shadow-[#6D2158]/30 flex items-center gap-2 active:scale-95">
          <Plus size={18} /> New request
        </button>
      )}

      {mbPickOpen && !mbAction && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center" onClick={() => { setMbPickOpen(false); setLedger(null); }}>
          <div className="bg-white w-full md:max-w-md max-h-[85dvh] rounded-t-3xl md:rounded-3xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-slate-800">Minibar transfer / removal</h3>
                <p className="text-[11px] font-semibold text-slate-400">Every move is logged with your name</p>
              </div>
              <button onClick={() => { setMbPickOpen(false); setLedger(null); }} className="p-2 rounded-full bg-slate-100 text-slate-500" aria-label="Close"><X size={16} /></button>
            </div>
            {!ledger ? (
              <div className="py-16 flex justify-center text-[#6D2158]"><Loader2 className="animate-spin" /></div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {myBars().map(loc => {
                  const units = ledger.items.reduce((s, i) => s + Math.max(0, qtyAt(ledger.bal, loc, i.article_number)), 0);
                  const others = myBars().filter(l => l !== loc);
                  const occupied = !!guests[classifyTarget(loc.slice(2)).base]?.guest_name;
                  return (
                    <div key={loc} className="p-3 rounded-2xl border border-slate-200 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-[#6D2158] text-white flex flex-col items-center justify-center shrink-0">
                        <span className="text-base font-black leading-none">{loc.slice(2)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800">{units} items</p>
                        <p className="text-[10px] font-semibold text-slate-400">{occupied ? 'Occupied' : 'Vacant'}</p>
                      </div>
                      <button disabled={!others.length || !units} onClick={() => setMbAction({ type: 'transfer', from: loc, to: others[0] })}
                        className="px-2.5 py-2 rounded-xl bg-violet-50 text-violet-700 text-[11px] font-black flex items-center gap-1 disabled:opacity-40"><Shuffle size={13} /> Transfer</button>
                      <button disabled={!units} onClick={() => setMbAction({ type: 'removal', loc })}
                        className="px-2.5 py-2 rounded-xl bg-rose-50 text-rose-700 text-[11px] font-black flex items-center gap-1 disabled:opacity-40"><PackageMinus size={13} /> Remove all</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {mbAction && ledger && mbAction.type === 'removal' && (
        <QtyEditor
          title={`Remove minibar · ${locLabel(mbAction.loc)}`}
          subtitle="Take everything to the office — the coordinator checks it in"
          items={ledger.items}
          initial={Object.fromEntries(ledger.items.map(i => [i.article_number, qtyAt(ledger.bal, mbAction.loc, i.article_number)]).filter(([, q]) => (q as number) > 0))}
          hint={a => `in villa ${qtyAt(ledger.bal, mbAction.loc, a)}`}
          saveLabel="Send to office"
          onClose={() => setMbAction(null)}
          onSave={qty => saveMoves(moveRows('removal', mbAction.loc, OFFICE, qty, me, newBatchId(), 'Full minibar removed'), 'Logged — take it to the office')}
        />
      )}

      {mbAction && ledger && mbAction.type === 'transfer' && (
        <QtyEditor
          key={`${mbAction.from}>${mbAction.to}`}
          title="Transfer between your villas"
          items={ledger.items}
          initial={Object.fromEntries(ledger.items.map(i => [i.article_number, 0]))}
          header={
            <div className="flex items-center gap-2">
              <span className="px-3 py-2.5 rounded-xl bg-slate-100 text-sm font-black">{locLabel(mbAction.from)}</span>
              <ArrowRight size={16} className="text-slate-400" />
              <select value={mbAction.to} onChange={e => setMbAction({ ...mbAction, to: e.target.value })} className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none">
                {myBars().filter(l => l !== mbAction.from).map(l => <option key={l} value={l}>{locLabel(l)}</option>)}
              </select>
            </div>
          }
          presets={[{ label: 'Full bag', values: Object.fromEntries(ledger.items.map(i => [i.article_number, qtyAt(ledger.bal, mbAction.from, i.article_number)]).filter(([, q]) => (q as number) > 0)) }]}
          hint={a => `${locLabel(mbAction.from)} ${qtyAt(ledger.bal, mbAction.from, a)} → ${locLabel(mbAction.to)} ${qtyAt(ledger.bal, mbAction.to, a)}`}
          saveLabel="Transfer"
          onClose={() => setMbAction(null)}
          onSave={qty => saveMoves(moveRows('transfer', mbAction.from, mbAction.to, qty, me, newBatchId()), `Moved ${locLabel(mbAction.from)} → ${locLabel(mbAction.to)}`)}
        />
      )}

      {sheetOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center" onClick={() => setSheetOpen(false)}>
          <div className="bg-white w-full md:max-w-2xl h-[92dvh] md:h-[85vh] rounded-t-3xl md:rounded-3xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-black text-slate-800">New request</h3>
              <button onClick={() => setSheetOpen(false)} className="p-2 rounded-full bg-slate-100 text-slate-500" aria-label="Close"><X size={16} /></button>
            </div>

            <div className="p-4 space-y-3 border-b border-slate-100 shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Villa</p>
                <div className="flex flex-wrap gap-1.5">
                  {mode.kind === 'va' && mode.villas.map(v => {
                    const nv = normalizeVillaNumber(v);
                    const g = guests[classifyTarget(nv).base];
                    const occupied = !!g?.guest_name;
                    const p = packageOf(g?.meal_plan);
                    return (
                      <button key={nv} onClick={() => setNewVilla(nv)}
                        className={`min-w-[3.25rem] px-3 py-2 rounded-xl text-sm font-black border-2 transition-colors relative ${newVilla === nv ? 'bg-[#6D2158] border-[#6D2158] text-white' : occupied ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                        {nv}
                        {p && <span className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border-2 border-white ${p === 'Sinner' ? 'bg-orange-500' : 'bg-emerald-500'}`} />}
                      </button>
                    );
                  })}
                </div>
                {newVilla && guests[classifyTarget(newVilla).base]?.guest_name && (
                  <p className="text-xs font-bold text-slate-600 mt-2 flex items-center gap-1.5">
                    <User size={12} className="text-slate-400" /> {extractMainGuest(guests[classifyTarget(newVilla).base]?.guest_name || '')}
                    {packageOf(guests[classifyTarget(newVilla).base]?.meal_plan) && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-white ${packageOf(guests[classifyTarget(newVilla).base]?.meal_plan) === 'Sinner' ? 'bg-orange-600' : 'bg-emerald-600'}`}>{packageOf(guests[classifyTarget(newVilla).base]?.meal_plan)}</span>
                    )}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl">
                {(['Minibar', 'General'] as const).map(k => (
                  <button key={k} onClick={() => setNewKind(k)} className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 ${newKind === k ? 'bg-white shadow-xs text-[#6D2158]' : 'text-slate-500'}`}>
                    {k === 'Minibar' ? <><Wine size={14} /> Minibar</> : <><ClipboardList size={14} /> Other request</>}
                  </button>
                ))}
              </div>
            </div>

            {newKind === 'Minibar' ? (
              <>
                <div className="px-4 pt-3 shrink-0">
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Search items..." className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-sm font-bold outline-none focus:border-[#6D2158]" />
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
                  {shownItems.map(i => {
                    const name = itemLabel(i);
                    const inCart = cart.find(c => c.name === name);
                    return (
                      <div key={i.article_number} className={`p-2 rounded-2xl border-2 flex flex-col ${inCart ? 'border-[#6D2158] bg-[#6D2158]/5' : 'border-slate-100 bg-white'}`}>
                        <button onClick={() => addItem(name, 1)} className="flex-1 text-left">
                          <div className="h-14 flex items-center justify-center mb-1">
                            {i.image_url ? <img src={i.image_url} alt={name} className="h-full object-contain" /> : <Wine size={20} className="text-rose-200" />}
                          </div>
                          <p className="text-xs font-bold text-slate-700 leading-tight line-clamp-2">{name}</p>
                        </button>
                        {inCart && (
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <button onClick={() => addItem(name, -1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center" aria-label="Less"><Minus size={13} /></button>
                            <span className="font-mono font-black">{inCart.qty}</span>
                            <button onClick={() => addItem(name, 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center" aria-label="More"><Plus size={13} /></button>
                          </div>
                        )}
                        {inCart && (
                          <button onClick={() => setCart(prev => prev.map(c => (c.name === name ? { ...c, refill: !c.refill } : c)))}
                            className={`mt-1.5 py-1 rounded-lg text-[10px] font-black uppercase ${inCart.refill ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {inCart.refill ? '✓ Refill only' : '+ Refill only'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-0 p-4">
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. 2 extra pillows, baby cot, ironing..." className="w-full h-full min-h-40 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-base md:text-sm font-semibold outline-none focus:border-[#6D2158] resize-none" />
              </div>
            )}

            <div className="p-3 border-t border-slate-200 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <button onClick={saveNew} disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-[#6D2158] text-white text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {newKind === 'Minibar' ? `Send minibar${cart.length ? ` (${cart.reduce((s, i) => s + i.qty, 0)})` : ''}` : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

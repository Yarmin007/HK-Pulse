"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity, AlertTriangle, ArrowRight, Bike, Boxes, ClipboardCheck, History, Loader2, Lock, Package, PackageCheck,
  PackageMinus, PackagePlus, RefreshCw, Search, Settings2, Shuffle, Warehouse, Wine, X, Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/components/ConfirmProvider';
import { isAdminSession, readSession } from '@/lib/requestsShared';
import {
  STORE, TRANSIT, PANTRY, OFFICE, MISSING, SUPPLIER, KIND_LABEL, allVillaLocs, countRows, moveRows, isVillaLoc, locLabel,
  pendingRemovals, qtyAt, totalAt, villaOfLoc, type Loc, type Movement,
} from '@/lib/minibarLedger';
import { insertMovements, itemName, loadLedger, newBatchId, type Ledger } from '@/lib/minibarLedgerData';
import QtyEditor from './QtyEditor';

// Minibar live tracking: where every minibar item is right now, and every move it made.

type Editor =
  | { type: 'count'; loc: Loc }
  | { type: 'stock_in' }
  | { type: 'transfer'; from: Loc; to: Loc }
  | { type: 'removal'; loc: Loc }
  | { type: 'office'; batch: string }
  | { type: 'par' };

type Tab = 'overview' | 'villas' | 'store' | 'log';

const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const minsSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const ageLabel = (m: number) => (m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`);
const LATE_TRANSIT_MIN = 60;
const LATE_PANTRY_MIN = 120;

export default function MinibarLiveTracking() {
  const { confirmAction } = useConfirm();
  const [access, setAccess] = useState<'checking' | 'yes' | 'no'>('checking');
  const [me, setMe] = useState('Coordinator');
  const [L, setL] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [villa, setVilla] = useState<Loc | null>(null);
  const [villaQ, setVillaQ] = useState('');
  const [logLoc, setLogLoc] = useState('');
  const [logItem, setLogItem] = useState('');
  const [logKind, setLogKind] = useState('');
  const [logLimit, setLogLimit] = useState(200);

  const reload = useCallback(async () => {
    const data = await loadLedger();
    setL(data);
    setLoading(false);
    return data;
  }, []);

  useEffect(() => {
    const s = readSession();
    const ok = isAdminSession(s) || (!s.id && localStorage.getItem('hk_pulse_admin_auth') === 'true');
    setAccess(ok ? 'yes' : 'no');
    setMe(s.full_name || 'Coordinator');
    if (ok) reload();
  }, [reload]);

  // Live: requests and stored moves both change the picture.
  useEffect(() => {
    if (access !== 'yes') return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const soon = () => { if (t) clearTimeout(t); t = setTimeout(() => reload(), 800); };
    const ch = supabase.channel('mb_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_minibar_movements' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, soon)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [access, reload]);

  const itemsByArt = useMemo(() => new Map((L?.items || []).map(i => [i.article_number, i])), [L]);
  const nameOf = useCallback((a: string) => itemName(itemsByArt.get(a)) || a, [itemsByArt]);
  const villaLocs = useMemo(() => allVillaLocs(L?.doubleVillas || []), [L]);
  const parOf = useCallback((a: string) => L?.par[a] || 0, [L]);
  const hasPar = useMemo(() => Object.values(L?.par || {}).some(p => p > 0), [L]);

  // Per villa: units now and how far below par.
  const villaStats = useMemo(() => {
    const out = new Map<Loc, { units: number; short: number; over: number; negative: boolean; counted: boolean }>();
    if (!L) return out;
    const counted = new Set(L.stored.filter(m => m.kind === 'count' && m.to).map(m => m.to as Loc));
    for (const loc of villaLocs) {
      let units = 0, short = 0, over = 0, negative = false;
      for (const i of L.items) {
        const q = qtyAt(L.bal, loc, i.article_number);
        const p = parOf(i.article_number);
        units += q;
        if (q < 0) negative = true;
        if (p > 0 && q < p) short += p - q;
        if (q > p && p > 0) over += q - p;
      }
      out.set(loc, { units, short, over, negative, counted: counted.has(loc) });
    }
    return out;
  }, [L, villaLocs, parOf]);

  const pending = useMemo(() => (L ? pendingRemovals(L.stored) : []), [L]);
  const openTransit = useMemo(() => (L?.open || []).filter(o => o.at === TRANSIT), [L]);
  const openPantry = useMemo(() => (L?.open || []).filter(o => o.at === PANTRY), [L]);
  const lateCount = (L?.open || []).filter(o => minsSince(o.since) >= (o.at === PANTRY ? LATE_PANTRY_MIN : LATE_TRANSIT_MIN)).length;
  const storeUnits = L ? totalAt(L.bal, STORE) : 0;
  const villasShort = [...villaStats.values()].filter(v => v.short > 0).length;

  // ---------------- writes ----------------
  const save = async (rows: Record<string, unknown>[], msg: string) => {
    const { error } = await insertMovements(rows);
    if (error) {
      toast.error(/relation|does not exist|schema cache/i.test(error.message) ? 'Run the minibar ledger SQL in Supabase first.' : `Not saved: ${error.message}`);
      return false;
    }
    toast.success(msg);
    reload();
    return true;
  };

  const prefillFromMonthly = async () => {
    if (!L) return;
    const { data, error } = await supabase.from('hsk_villa_minibar_inventory').select('villa_number, inventory_data, logged_at').order('logged_at', { ascending: false }).limit(2000);
    if (error) return toast.error('Could not read the monthly minibar counts');
    const latest = new Map<string, { inventory_data: { article_number: string; qty: number }[]; logged_at: string }>();
    for (const r of (data || []) as { villa_number: string; inventory_data: { article_number: string; qty: number }[]; logged_at: string }[]) {
      const v = String(r.villa_number).trim();
      if (!latest.has(v)) latest.set(v, r);
    }
    const locs = villaLocs.filter(l => latest.has(villaOfLoc(l)));
    const missing = villaLocs.filter(l => !latest.has(villaOfLoc(l))).map(l => villaOfLoc(l));
    const ok = await confirmAction({
      title: 'Pre-fill villas from the monthly count?',
      message: `${locs.length} villas get their latest monthly minibar count as opening stock${missing.length ? `. No count for: ${missing.join(', ')} — count those by hand` : ''}. You can recount any villa afterwards.`,
      confirmText: 'Pre-fill villas',
    });
    if (!ok) return;
    const batch = newBatchId();
    const rows = locs.flatMap(loc => {
      const rec = latest.get(villaOfLoc(loc))!;
      const counts: Record<string, number> = {};
      for (const i of L.items) counts[i.article_number] = 0;
      for (const d of rec.inventory_data || []) if (d.article_number in counts) counts[d.article_number] = Number(d.qty) || 0;
      return countRows(loc, counts, me, batch, `Opening from monthly count ${rec.logged_at.slice(0, 10)}`);
    });
    await save(rows, `Opening stock set for ${locs.length} villas`);
  };

  const exportCsv = () => {
    if (!L) return;
    const locs = [STORE, ...villaLocs, TRANSIT, PANTRY, OFFICE];
    const head = ['Item', 'Par', ...locs.map(locLabel), 'Total'];
    const lines = L.items.map(i => {
      const vals = locs.map(l => qtyAt(L.bal, l, i.article_number));
      return [itemName(i), parOf(i.article_number), ...vals, vals.reduce((a, b) => a + b, 0)];
    });
    const csv = [head, ...lines].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `minibar-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ---------------- render guards ----------------
  if (access === 'checking' || (access === 'yes' && loading)) {
    return <div className="min-h-[70dvh] flex items-center justify-center text-[#6D2158]"><Loader2 className="animate-spin" /></div>;
  }
  if (access === 'no') {
    return (
      <div className="min-h-[70dvh] flex items-center justify-center p-6">
        <div className="max-w-sm text-center bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4"><Lock size={24} /></div>
          <h1 className="text-lg font-black text-slate-800">Admins only</h1>
          <p className="text-sm text-slate-500 mt-1">Minibar live tracking is for the coordinator and admins.</p>
          <Link href="/" className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-[#6D2158] text-white text-xs font-bold">Back to dashboard</Link>
        </div>
      </div>
    );
  }
  if (!L) return null;

  const storeCounted = L.stored.some(m => m.kind === 'count' && m.to === STORE);
  const villasCounted = [...villaStats.values()].filter(v => v.counted).length;

  // ---------------- editor modal ----------------
  const renderEditor = () => {
    if (!editor) return null;
    const close = () => setEditor(null);
    const allZero = Object.fromEntries(L.items.map(i => [i.article_number, 0]));
    const current = (loc: Loc) => Object.fromEntries(L.items.map(i => [i.article_number, Math.max(0, qtyAt(L.bal, loc, i.article_number))]));
    const positives = (loc: Loc) => Object.fromEntries(L.items.map(i => [i.article_number, qtyAt(L.bal, loc, i.article_number)]).filter(([, q]) => (q as number) > 0));

    if (editor.type === 'count') {
      const loc = editor.loc;
      const first = !L.stored.some(m => m.kind === 'count' && m.to === loc);
      const par = Object.fromEntries(L.items.map(i => [i.article_number, parOf(i.article_number)]));
      return (
        <QtyEditor
          title={`${first ? 'Opening count' : 'Recount'} · ${locLabel(loc)}`}
          subtitle={first ? 'What is physically there now. This becomes the starting stock.' : 'Differences from the system are saved as variance.'}
          items={L.items} initial={current(loc)} allowZeroSave
          presets={[{ label: 'All 0', values: allZero }, ...(isVillaLoc(loc) && hasPar ? [{ label: 'Full par', values: par }] : [])]}
          hint={a => `system ${qtyAt(L.bal, loc, a)}${parOf(a) ? ` · par ${parOf(a)}` : ''}`}
          saveLabel="Save count" onClose={close}
          onSave={qty => save(countRows(loc, qty, me, newBatchId(), first ? 'Opening count' : 'Recount'), `${locLabel(loc)} counted`)}
        />
      );
    }
    if (editor.type === 'stock_in') {
      return (
        <QtyEditor title="Stock in · Store" subtitle="Items received into the minibar store" items={L.items} initial={allZero}
          hint={a => `store ${qtyAt(L.bal, STORE, a)}`} saveLabel="Add to store" onClose={close}
          onSave={qty => save(moveRows('stock_in', SUPPLIER, STORE, qty, me, newBatchId()), 'Added to store')} />
      );
    }
    if (editor.type === 'transfer') {
      const { from, to } = editor;
      const options = [STORE, ...villaLocs];
      const pick = (which: 'from' | 'to') => (
        <select value={which === 'from' ? from : to} onChange={e => setEditor({ ...editor, [which]: e.target.value })}
          className="flex-1 min-w-0 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none">
          {options.map(l => <option key={l} value={l}>{locLabel(l)}</option>)}
        </select>
      );
      return (
        <QtyEditor key={`${from}>${to}`} title="Transfer" subtitle="Move items or a full bag between villas and the store" items={L.items} initial={allZero}
          header={<div className="flex items-center gap-2">{pick('from')}<ArrowRight size={16} className="text-slate-400 shrink-0" />{pick('to')}</div>}
          presets={[{ label: 'Full bag', values: positives(from) }]}
          hint={a => `${locLabel(from)} ${qtyAt(L.bal, from, a)} → ${locLabel(to)} ${qtyAt(L.bal, to, a)}`}
          saveLabel="Transfer" onClose={close}
          onSave={async qty => {
            if (from === to) { toast.error('Pick two different places'); return false; }
            return save(moveRows('transfer', from, to, qty, me, newBatchId()), `Moved ${locLabel(from)} → ${locLabel(to)}`);
          }} />
      );
    }
    if (editor.type === 'removal') {
      const loc = editor.loc;
      return (
        <QtyEditor title={`Remove minibar · ${locLabel(loc)}`} subtitle="Everything goes to the office until you check it in" items={L.items} initial={positives(loc)}
          hint={a => `in villa ${qtyAt(L.bal, loc, a)}`} saveLabel="Send to office" onClose={close}
          onSave={qty => save(moveRows('removal', loc, OFFICE, qty, me, newBatchId(), 'Full minibar removed'), `${locLabel(loc)} minibar sent to office`)} />
      );
    }
    if (editor.type === 'office') {
      const b = pending.find(x => x.batch === editor.batch);
      if (!b) return null;
      return (
        <QtyEditor title={`Office check · ${locLabel(b.from)}`} subtitle={`Removed ${fmtTime(b.at)}${b.by ? ` by ${b.by}` : ''}. Enter what actually arrived — the rest is logged as missing.`}
          items={L.items} initial={{ ...b.items }} onlyListed allowZeroSave
          hint={a => `sent ${b.items[a] || 0}`} saveLabel="Check in to store" onClose={close}
          onSave={qty => {
            const note = `check:${b.batch}`;
            const got: Record<string, number> = {}, lost: Record<string, number> = {};
            for (const [a, sent] of Object.entries(b.items)) {
              const r = Math.min(sent, qty[a] || 0);
              got[a] = r;
              if (sent - r > 0) lost[a] = sent - r;
            }
            const rows = [...moveRows('office_in', OFFICE, STORE, got, me, b.batch, note), ...moveRows('missing', OFFICE, MISSING, lost, me, b.batch, note)];
            // A check with nothing received still needs a row so the batch closes.
            if (!rows.length) return Promise.resolve(false);
            const short = Object.values(lost).reduce((s, q) => s + q, 0);
            return save(rows, short ? `Checked in · ${short} missing` : 'All tallied — added to store');
          }} />
      );
    }
    if (editor.type === 'par') {
      return (
        <QtyEditor title="Par levels" subtitle="How many of each item one minibar should hold" items={L.items} initial={Object.fromEntries(L.items.map(i => [i.article_number, parOf(i.article_number)]))}
          allowZeroSave saveLabel="Save par" onClose={close}
          onSave={async qty => {
            const rows = Object.entries(qty).map(([article_number, par]) => ({ article_number, par, updated_at: new Date().toISOString() }));
            const { error } = await supabase.from('hsk_minibar_par').upsert(rows, { onConflict: 'article_number' });
            if (error) { toast.error(/relation|does not exist|schema cache/i.test(error.message) ? 'Run the minibar ledger SQL in Supabase first.' : 'Par not saved'); return false; }
            toast.success('Par levels saved');
            reload();
            return true;
          }} />
      );
    }
    return null;
  };

  // ---------------- pieces ----------------
  const stat = (label: string, value: React.ReactNode, tone: string, icon: React.ElementType, onClick?: () => void) => {
    const Icon = icon;
    return (
      <button onClick={onClick} className={`text-left p-3.5 rounded-2xl border bg-white shadow-xs ${onClick ? 'hover:border-[#6D2158]/30' : 'cursor-default'}`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${tone}`}><Icon size={16} /></div>
        <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
        <p className="text-[11px] font-bold text-slate-400 mt-1">{label}</p>
      </button>
    );
  };

  const openLineRow = (o: (typeof L.open)[number]) => {
    const m = minsSince(o.since);
    const late = m >= (o.at === PANTRY ? LATE_PANTRY_MIN : LATE_TRANSIT_MIN);
    return (
      <div key={`${o.requestId}:${o.article}`} className={`flex items-center gap-3 px-3 py-2.5 text-xs ${late ? 'bg-rose-50/60' : ''}`}>
        <span className="font-mono font-black text-slate-800 w-14 shrink-0">{o.targetLabel}</span>
        <span className="font-bold text-slate-700 flex-1 min-w-0 truncate">{o.qty}x {o.name}</span>
        <span className="text-slate-500 font-semibold truncate max-w-[30%]">{o.holder || (o.at === TRANSIT ? 'at office — not handed over' : '')}</span>
        <span className={`font-mono font-black shrink-0 ${late ? 'text-rose-600' : 'text-slate-400'}`}>{ageLabel(m)}</span>
      </div>
    );
  };

  const logRows = (moves: Movement[], limit: number) => {
    const rows = [...moves].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
    if (!rows.length) return <p className="text-center text-xs font-bold text-slate-400 py-10">No movements</p>;
    return (
      <div className="divide-y divide-slate-100">
        {rows.map(m => {
          const variance = m.kind === 'count' ? L.variances.find(v => v.id === m.id) : undefined;
          return (
            <div key={m.id} className="px-3 py-2 flex items-center gap-3 text-xs">
              <span className="font-mono text-[10px] text-slate-400 w-24 shrink-0">{fmtTime(m.at)}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${m.derived ? 'bg-blue-50 text-blue-700' : m.kind === 'missing' ? 'bg-rose-100 text-rose-700' : m.kind === 'count' ? 'bg-slate-100 text-slate-600' : 'bg-violet-50 text-violet-700'}`}>{KIND_LABEL[m.kind]}</span>
              <span className="font-bold text-slate-800 flex-1 min-w-0 truncate">
                {m.kind === 'count' ? `${nameOf(m.article)} = ${m.qty}` : `${m.qty}x ${nameOf(m.article)}`}
                {variance && <span className={`ml-1.5 font-black ${variance.counted < variance.expected ? 'text-rose-600' : 'text-amber-600'}`}>({variance.counted - variance.expected > 0 ? '+' : ''}{variance.counted - variance.expected})</span>}
              </span>
              <span className="text-slate-500 font-semibold shrink-0 hidden sm:inline">{m.kind === 'count' ? locLabel(m.to) : `${locLabel(m.from)} → ${locLabel(m.to)}`}</span>
              <span className="text-slate-400 font-semibold shrink-0 w-20 truncate text-right">{m.by || ''}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // ---------------- villa detail ----------------
  const renderVilla = () => {
    if (!villa) return null;
    const moves = L.moves.filter(m => m.from === villa || m.to === villa);
    const rows = L.items.map(i => ({ i, q: qtyAt(L.bal, villa, i.article_number), p: parOf(i.article_number) })).filter(r => r.q !== 0 || r.p > 0);
    const incoming = L.open.filter(o => o.target === villa);
    return (
      <div className="fixed inset-0 z-[9990] bg-black/50 flex justify-end" onClick={() => setVilla(null)}>
        <div className="bg-white w-full max-w-lg h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-[#6D2158] text-white flex items-center justify-center font-black text-lg">{villaOfLoc(villa)}</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-black text-slate-800">Villa {villaOfLoc(villa)}</h3>
              <p className="text-[11px] font-semibold text-slate-400">{totalAt(L.bal, villa)} items{incoming.length ? ` · ${incoming.reduce((s, o) => s + o.qty, 0)} on the way` : ''}</p>
            </div>
            <button onClick={() => setVilla(null)} className="p-2 rounded-full bg-slate-100 text-slate-500" aria-label="Close"><X size={16} /></button>
          </div>
          <div className="p-3 grid grid-cols-2 gap-2 border-b border-slate-100 shrink-0">
            <button onClick={() => setEditor({ type: 'count', loc: villa })} className="py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-black flex items-center justify-center gap-1.5"><ClipboardCheck size={14} /> Count</button>
            <button onClick={() => setEditor({ type: 'transfer', from: STORE, to: villa })} className="py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black flex items-center justify-center gap-1.5"><PackagePlus size={14} /> Refill from store</button>
            <button onClick={() => setEditor({ type: 'transfer', from: villa, to: villaLocs.find(l => l !== villa) || STORE })} className="py-2.5 rounded-xl bg-violet-50 text-violet-700 text-xs font-black flex items-center justify-center gap-1.5"><Shuffle size={14} /> Transfer</button>
            <button onClick={() => setEditor({ type: 'removal', loc: villa })} className="py-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-black flex items-center justify-center gap-1.5"><PackageMinus size={14} /> Remove minibar</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-3">
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {rows.length === 0 && <p className="text-center text-xs font-bold text-slate-400 py-6">Empty — no stock and no par set</p>}
                {rows.map(({ i, q, p }) => (
                  <div key={i.article_number} className="px-3 py-2 flex items-center gap-3 text-xs">
                    <span className="font-bold text-slate-800 flex-1 truncate">{itemName(i)}</span>
                    {p > 0 && <span className="text-slate-400 font-semibold">par {p}</span>}
                    <span className={`w-8 text-right font-mono font-black ${q < 0 ? 'text-rose-600' : p > 0 && q < p ? 'text-amber-600' : 'text-slate-800'}`}>{q}</span>
                  </div>
                ))}
              </div>
              {incoming.length > 0 && (
                <div className="mt-3 border border-blue-100 rounded-xl overflow-hidden">
                  <p className="px-3 py-1.5 bg-blue-50 text-[10px] font-black uppercase tracking-wider text-blue-700">On the way</p>
                  <div className="divide-y divide-slate-100">{incoming.map(openLineRow)}</div>
                </div>
              )}
            </div>
            <p className="px-4 pt-2 text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1"><History size={11} /> Movements</p>
            {logRows(moves, 150)}
          </div>
        </div>
      </div>
    );
  };

  // ---------------- tabs ----------------
  const filteredLog = L.moves.filter(m => (!logLoc || m.from === logLoc || m.to === logLoc) && (!logItem || m.article === logItem) && (!logKind || m.kind === logKind));
  const villaFilter = villaQ.trim();

  return (
    <div className="min-h-full bg-[#F7F5F8] font-sans text-slate-800">
      <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-3 md:pt-8 pb-16 space-y-4">

        <header className="flex flex-wrap items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0"><Activity size={22} /></div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-black leading-tight">Minibar Live Tracking</h1>
            <p className="text-xs font-semibold text-slate-400">{L.started ? `Live since ${fmtTime(L.start!)}` : 'Not started — set the initial inventory'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditor({ type: 'par' })} className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-1.5"><Settings2 size={14} /> Par</button>
            <button onClick={exportCsv} className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-1.5" title="Download stock by location"><Download size={14} /><span className="hidden sm:inline">CSV</span></button>
            <button onClick={() => reload()} className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500" title="Refresh"><RefreshCw size={16} /></button>
          </div>
        </header>

        {L.ledgerError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm font-bold text-rose-700 flex items-start gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" /> The ledger tables are not in Supabase yet — run the minibar ledger SQL, then refresh.
          </div>
        )}

        {/* SETUP — until the store and villas are counted */}
        {(!storeCounted || villasCounted < villaLocs.length || !hasPar) && (
          <section className="bg-white border border-slate-200 rounded-3xl p-4 md:p-5 shadow-xs">
            <h2 className="text-sm font-black text-slate-800 mb-3">Set the initial inventory</h2>
            <div className="grid sm:grid-cols-3 gap-2">
              <button onClick={() => setEditor({ type: 'par' })} className={`text-left p-3 rounded-2xl border ${hasPar ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 1</p>
                <p className="text-sm font-black text-slate-800">Par levels {hasPar && '✓'}</p>
                <p className="text-[11px] font-semibold text-slate-500">How much one minibar holds</p>
              </button>
              <button onClick={() => setEditor({ type: 'count', loc: STORE })} className={`text-left p-3 rounded-2xl border ${storeCounted ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 2</p>
                <p className="text-sm font-black text-slate-800">Count the store {storeCounted && '✓'}</p>
                <p className="text-[11px] font-semibold text-slate-500">Everything in the minibar store</p>
              </button>
              <div className={`p-3 rounded-2xl border ${villasCounted === villaLocs.length ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 3</p>
                <p className="text-sm font-black text-slate-800">Villas counted {villasCounted}/{villaLocs.length}</p>
                <div className="flex gap-1.5 mt-1.5">
                  <button onClick={prefillFromMonthly} className="px-2.5 py-1.5 rounded-lg bg-[#6D2158] text-white text-[11px] font-black">Pre-fill from monthly count</button>
                  <button onClick={() => setTab('villas')} className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-600">Count by villa</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {stat('in the store', storeUnits, 'bg-amber-50 text-amber-700', Warehouse, () => setTab('store'))}
          {stat('villas below par', hasPar ? villasShort : '—', 'bg-rose-50 text-rose-600', Wine, () => setTab('villas'))}
          {stat('in transit', openTransit.reduce((s, o) => s + o.qty, 0), 'bg-blue-50 text-blue-600', Bike, () => setTab('overview'))}
          {stat('at pantry', openPantry.reduce((s, o) => s + o.qty, 0), 'bg-orange-50 text-orange-600', Package, () => setTab('overview'))}
          {stat('removals to check', pending.length, 'bg-violet-50 text-violet-600', PackageCheck, () => setTab('overview'))}
        </div>

        {/* TABS */}
        <div className="flex bg-white border border-slate-200 p-1 rounded-2xl shadow-xs overflow-x-auto">
          {([['overview', 'Live', Activity], ['villas', 'Villas', Wine], ['store', 'Store', Boxes], ['log', 'Full log', History]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 min-w-[5.5rem] py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 ${tab === k ? 'bg-[#6D2158] text-white' : 'text-slate-500'}`}><I size={14} /> {l}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-4">
            <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5"><Bike size={15} className="text-blue-600" /> Taken from store, not in villa yet</h2>
                {lateCount > 0 && <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">{lateCount} late</span>}
              </div>
              {openTransit.length === 0 ? <p className="text-center text-xs font-bold text-slate-400 py-8">Nothing on the way</p> : <div className="divide-y divide-slate-100">{openTransit.sort((a, b) => a.since.localeCompare(b.since)).map(openLineRow)}</div>}
            </section>
            <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
              <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5"><Package size={15} className="text-orange-600" /> At pantry — waiting for the VA</h2></div>
              {openPantry.length === 0 ? <p className="text-center text-xs font-bold text-slate-400 py-8">Nothing at the pantries</p> : <div className="divide-y divide-slate-100">{openPantry.sort((a, b) => a.since.localeCompare(b.since)).map(openLineRow)}</div>}
            </section>
            <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs md:col-span-2">
              <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5"><PackageCheck size={15} className="text-violet-600" /> Removed minibars — check at the office</h2></div>
              {pending.length === 0 ? <p className="text-center text-xs font-bold text-slate-400 py-8">No removals waiting</p> : (
                <div className="divide-y divide-slate-100">
                  {pending.map(b => (
                    <div key={b.batch} className="px-4 py-3 flex items-center gap-3">
                      <span className="font-mono font-black text-slate-800 w-14">{locLabel(b.from)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{Object.entries(b.items).map(([a, q]) => `${q}x ${nameOf(a)}`).join(', ')}</p>
                        <p className="text-[10px] font-semibold text-slate-400">{fmtTime(b.at)}{b.by ? ` · ${b.by}` : ''} · {ageLabel(minsSince(b.at))} ago</p>
                      </div>
                      <button onClick={() => setEditor({ type: 'office', batch: b.batch })} className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-black shrink-0">Check in</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {L.variances.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs md:col-span-2">
                <div className="px-4 py-3 border-b border-slate-100"><h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5"><AlertTriangle size={15} className="text-amber-600" /> Count differences</h2></div>
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {[...L.variances].reverse().slice(0, 100).map(v => (
                    <div key={v.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                      <span className="font-mono text-[10px] text-slate-400 w-24">{fmtTime(v.at)}</span>
                      <span className="font-mono font-black w-14">{locLabel(v.loc)}</span>
                      <span className="font-bold text-slate-700 flex-1 truncate">{nameOf(v.article)}</span>
                      <span className="text-slate-400">system {v.expected} · counted {v.counted}</span>
                      <span className={`font-black w-8 text-right ${v.counted < v.expected ? 'text-rose-600' : 'text-amber-600'}`}>{v.counted - v.expected > 0 ? '+' : ''}{v.counted - v.expected}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {L.unmatched.length > 0 && (
              <p className="md:col-span-2 text-[11px] font-semibold text-slate-400">Not tracked (name not in the minibar catalog): {L.unmatched.join(', ')}</p>
            )}
          </div>
        )}

        {tab === 'villas' && (
          <section className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={villaQ} onChange={e => setVillaQ(e.target.value)} placeholder="Villa number..." className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158]" />
              </div>
              <button onClick={() => setEditor({ type: 'transfer', from: villaLocs[0], to: villaLocs[1] || STORE })} className="px-3 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-black flex items-center gap-1.5"><Shuffle size={14} /> Transfer</button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {villaLocs.filter(l => !villaFilter || villaOfLoc(l).startsWith(villaFilter)).map(loc => {
                const s = villaStats.get(loc)!;
                const tone = !s.counted ? 'bg-slate-50 border-dashed border-slate-300 text-slate-400'
                  : s.negative ? 'bg-rose-600 border-rose-600 text-white'
                  : s.short > 0 ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-800';
                const incoming = L.open.filter(o => o.target === loc).length;
                return (
                  <button key={loc} onClick={() => (s.counted ? setVilla(loc) : setEditor({ type: 'count', loc }))} className={`relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center ${tone}`}>
                    <span className="text-lg font-black leading-none">{villaOfLoc(loc)}</span>
                    <span className="text-[10px] font-bold mt-1 opacity-80">{!s.counted ? 'count' : s.short > 0 ? `−${s.short}` : `${s.units}`}</span>
                    {incoming > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-blue-500" title="Refill on the way" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] font-semibold text-slate-400">Amber = below par (number missing) · red = more taken out than the system had (recount) · dashed = not counted yet · blue dot = refill on the way.</p>
          </section>
        )}

        {tab === 'store' && (
          <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-black text-slate-800 flex-1">Minibar store</h2>
              <button onClick={() => setEditor({ type: 'stock_in' })} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5"><PackagePlus size={14} /> Stock in</button>
              <button onClick={() => setEditor({ type: 'count', loc: STORE })} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black flex items-center gap-1.5"><ClipboardCheck size={14} /> Recount</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <tr><th className="text-left px-4 py-2">Item</th><th className="px-2 py-2 text-right">Store</th><th className="px-2 py-2 text-right">Villas</th><th className="px-2 py-2 text-right">On the way</th><th className="px-2 py-2 text-right">Office</th><th className="px-4 py-2 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {L.items.map(i => {
                    const a = i.article_number;
                    const st = qtyAt(L.bal, STORE, a);
                    const vl = villaLocs.reduce((s, l) => s + qtyAt(L.bal, l, a), 0);
                    const way = qtyAt(L.bal, TRANSIT, a) + qtyAt(L.bal, PANTRY, a);
                    const of = qtyAt(L.bal, OFFICE, a);
                    return (
                      <tr key={a}>
                        <td className="px-4 py-2 font-bold text-slate-800">{itemName(i)}</td>
                        <td className={`px-2 py-2 text-right font-mono font-black ${st < 0 ? 'text-rose-600' : st === 0 ? 'text-slate-300' : ''}`}>{st}</td>
                        <td className="px-2 py-2 text-right font-mono">{vl}</td>
                        <td className="px-2 py-2 text-right font-mono text-blue-600">{way || ''}</td>
                        <td className="px-2 py-2 text-right font-mono text-violet-600">{of || ''}</td>
                        <td className="px-4 py-2 text-right font-mono font-black">{st + vl + way + of}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'log' && (
          <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
            <div className="p-3 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select value={logLoc} onChange={e => setLogLoc(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                <option value="">All places</option>
                {[STORE, TRANSIT, PANTRY, OFFICE, MISSING, ...villaLocs].map(l => <option key={l} value={l}>{locLabel(l)}</option>)}
              </select>
              <select value={logItem} onChange={e => setLogItem(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                <option value="">All items</option>
                {L.items.map(i => <option key={i.article_number} value={i.article_number}>{itemName(i)}</option>)}
              </select>
              <select value={logKind} onChange={e => setLogKind(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                <option value="">All movements</option>
                {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {logRows(filteredLog, logLimit)}
            {filteredLog.length > logLimit && (
              <button onClick={() => setLogLimit(n => n + 300)} className="w-full py-3 text-xs font-bold text-[#6D2158] border-t border-slate-100">Show more ({filteredLog.length - logLimit} older)</button>
            )}
          </section>
        )}
      </div>

      {renderVilla()}
      {renderEditor()}
    </div>
  );
}


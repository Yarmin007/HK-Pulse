"use client";
// Pantry Supply board — for the houseman / store / supervisor (and admins).
// Lists: one card per pantry for the chosen day → tick items as packed → give to a runner → delivered.
// Items (admin): the preset list attendants tick from, mostly picked from the Master Catalog.
// Supply days (admin): which weekday(s) each pantry is supplied.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, ChevronLeft, ChevronRight, Check, Truck, PackageCheck, Copy, Undo2, Search, Plus, Trash2,
  Package, ListChecks, Boxes, CalendarDays, Zap, ShieldAlert, Send, Eye, EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr } from '@/lib/dateUtils';
import { hasFullControl } from '@/lib/fullControl';
import { useConfirm } from '@/components/ConfirmProvider';
import { riderDutyOf, isOffShift } from '@/app/allocation/lib/riders';
import {
  PANTRIES, pantryShort, WEEKDAYS, loadSupplyDays, saveSupplyDays, isSupplyDay, nextSupplyDate, supplyDaysLabel,
  loadRequests, loadPantryItems, isMissingTable, STATUS_STEPS, SupplyDays, PantryItem, PantryRequest, PantryLine, PantryStatus,
} from '@/lib/pantrySupply';

type Tab = 'LISTS' | 'ITEMS' | 'DAYS';
const niceDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' }) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', opts);
const shiftDate = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const timeOf = (ts?: string | null) => (ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

// Who can work the board: admins, plus housemen, store and supervisors
const canDispatch = () => {
  if (hasFullControl()) return true;
  try {
    const s = JSON.parse(localStorage.getItem('hk_pulse_session') || 'null');
    const r = `${s?.role || ''} ${s?.department || ''}`.toLowerCase();
    return /house\s*m|store|supervisor|asst|assistant|executive|manager|coordinator/.test(r) || (s?.allowed_modules || []).includes('pantry');
  } catch { return false; }
};

const STATUS_STYLE: Record<PantryStatus, string> = {
  Open: 'bg-amber-100 text-amber-800',
  Packed: 'bg-sky-100 text-sky-800',
  'With runner': 'bg-violet-100 text-violet-800',
  Delivered: 'bg-emerald-100 text-emerald-800',
};

export default function PantrySupplyPage() {
  const { confirmAction } = useConfirm();
  const today = getDhakaDateStr();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [me, setMe] = useState<{ id: string; full_name: string } | null>(null);
  const [tab, setTab] = useState<Tab>('LISTS');
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [days, setDays] = useState<SupplyDays>({});
  const [requests, setRequests] = useState<PantryRequest[]>([]);
  const [items, setItems] = useState<PantryItem[]>([]);
  const [runners, setRunners] = useState<{ id: string; name: string }[]>([]);
  const [runnerPick, setRunnerPick] = useState<PantryRequest | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setAllowed(canDispatch());
    setAdmin(hasFullControl());
    try { const s = JSON.parse(localStorage.getItem('hk_pulse_session') || 'null'); if (s?.id) setMe({ id: s.id, full_name: s.full_name }); } catch { /* no session */ }
    setReady(true);
  }, []);

  const load = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true);
    try {
      const [d, reqs, it, alloc, hosts] = await Promise.all([
        loadSupplyDays(),
        loadRequests(date),
        loadPantryItems(false),
        supabase.from('hsk_allocations').select('host_id, area, shift, task_details').eq('report_date', date).eq('area', 'riders'),
        supabase.from('hsk_hosts').select('id, full_name, nicknames, role'),
      ]);
      setDays(d); setRequests(reqs); setItems(it); setMissing(false);
      const hmap = new Map((hosts.data || []).map((h: any) => [h.id, h]));
      const rs = (alloc.data || []).filter((a: any) => a.host_id && !isOffShift(a.shift) && riderDutyOf(a, hmap.get(a.host_id)) === 'Runner')
        .map((a: any) => { const h: any = hmap.get(a.host_id); return { id: a.host_id, name: h ? (h.nicknames ? String(h.nicknames).split(',')[0].trim() : h.full_name) : 'Runner' }; });
      setRunners([...new Map(rs.map(r => [r.id, r])).values()]);
    } catch (err) {
      if (isMissingTable(err)) setMissing(true); else toast.error('Could not load: ' + ((err as Error)?.message || 'error'));
    } finally { if (spinner) setLoading(false); }
  }, [date]);
  useEffect(() => { if (ready && allowed) load(true); }, [ready, allowed, load]);
  useEffect(() => {
    if (!ready || !allowed) return;
    const ch = supabase.channel('pantry_board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_pantry_request_lines' }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_pantry_requests' }, () => load(false))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ready, allowed, load]);

  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const catOf = (l: PantryLine) => (l.item_id ? itemById.get(l.item_id)?.category : null) || (l.is_custom ? 'Typed in' : 'General');

  /* ---------- list actions ---------- */
  const setLine = async (l: PantryLine, status: PantryLine['status']) => {
    setRequests(rs => rs.map(r => ({ ...r, lines: (r.lines || []).map(x => (x.id === l.id ? { ...x, status } : x)) })));
    const { error } = await supabase.from('hsk_pantry_request_lines').update({ status }).eq('id', l.id);
    if (error) { toast.error('Could not update'); load(false); }
  };
  const setStatus = async (r: PantryRequest, status: PantryStatus, extra: Record<string, unknown> = {}) => {
    setBusy(r.id);
    const { error } = await supabase.from('hsk_pantry_requests').update({ status, ...extra }).eq('id', r.id);
    setBusy('');
    if (error) { toast.error('Could not update: ' + error.message); return false; }
    load(false);
    return true;
  };
  const markPacked = async (r: PantryRequest) => {
    const open = (r.lines || []).filter(l => l.status === 'Needed');
    if (open.length) {
      const ok = await confirmAction({ title: `${open.length} not ticked yet`, message: `Mark them packed too? (${open.map(l => l.name).join(', ')})`, confirmText: 'Pack all', cancelText: 'Cancel', icon: 'question' });
      if (!ok) return;
      await supabase.from('hsk_pantry_request_lines').update({ status: 'Packed' }).in('id', open.map(l => l.id));
    }
    if (await setStatus(r, 'Packed', { packed_by: me?.full_name || null, packed_at: new Date().toISOString() })) toast.success(`${pantryShort(r.pantry)} packed`);
  };
  const giveToRunner = async (r: PantryRequest, runner: { id: string; name: string }) => {
    setRunnerPick(null);
    if (!(await setStatus(r, 'With runner', { runner_id: runner.id || null, runner_name: runner.name, sent_at: new Date().toISOString() }))) return;
    toast.success(`Given to ${runner.name}`);
    const n = (r.lines || []).filter(l => l.status === 'Packed').length;
    if (runner.id) fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Pantry delivery', body: `${pantryShort(r.pantry)} pantry: ${n} item${n === 1 ? '' : 's'} to take from the store`, url: '/my-tasks', hostIds: [runner.id] }) }).catch(() => {});
  };
  const delivered = async (r: PantryRequest) => { if (await setStatus(r, 'Delivered', { delivered_at: new Date().toISOString() })) toast.success(`${pantryShort(r.pantry)} delivered`); };
  const stepBack = async (r: PantryRequest) => {
    const i = STATUS_STEPS.indexOf(r.status);
    if (i <= 0) return;
    const prev = STATUS_STEPS[i - 1];
    const ok = await confirmAction({ title: `Back to “${prev}”?`, message: `${pantryShort(r.pantry)} list goes back one step.`, confirmText: 'Go back', icon: 'question' });
    if (ok) setStatus(r, prev, prev === 'Packed' ? { runner_id: null, runner_name: null, sent_at: null } : prev === 'With runner' ? { delivered_at: null } : { packed_at: null, packed_by: null });
  };
  const copyList = async (r: PantryRequest) => {
    const ls = (r.lines || []).filter(l => l.status !== 'Not available');
    const text = [`*${pantryShort(r.pantry)} pantry* · ${niceDate(r.supply_date, { weekday: 'short', day: 'numeric', month: 'short' })}${r.kind === 'Extra' ? ' (urgent)' : ''}`, '', ...ls.map(l => `• ${l.name}`)].join('\n');
    try { await navigator.clipboard.writeText(text); toast.success('List copied'); } catch { toast.error('Could not copy'); }
  };

  if (!ready) return null;
  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4"><ShieldAlert size={22} /></div>
          <h1 className="text-lg font-black text-slate-800">Pantry Supply board</h1>
          <p className="text-xs font-semibold text-slate-500 mt-1.5">For housemen, store and supervisors. To ask for items, use Pantry Request.</p>
          <Link href="/pantry/request" className="inline-block mt-5 px-4 py-2.5 bg-[#6D2158] text-white rounded-xl text-xs font-black">Open Pantry Request</Link>
        </div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: React.ElementType; admin?: boolean }[] = [
    { key: 'LISTS', label: 'Lists', icon: ListChecks },
    { key: 'ITEMS', label: 'Items', icon: Boxes, admin: true },
    { key: 'DAYS', label: 'Supply days', icon: CalendarDays, admin: true },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-32 md:pb-12">
      <div className="bg-white border-b border-slate-200" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-2 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-[#6D2158] leading-tight">Pantry Supply</h1>
            <p className="text-xs font-semibold text-slate-400">What each pantry needs, packed and sent with a runner</p>
          </div>
          <Link href="/pantry/request" className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-black text-[#6D2158] flex items-center gap-1.5"><Plus size={14} /> Add a request</Link>
        </div>
        <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.filter(t => !t.admin || admin).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 h-11 px-3.5 flex items-center gap-2 text-sm font-black border-b-2 ${tab === t.key ? 'border-[#6D2158] text-[#6D2158]' : 'border-transparent text-slate-400'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-4">
        {missing ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm font-bold text-amber-900">
            Pantry Supply needs its database tables. Run <code className="px-1.5 py-0.5 bg-white rounded">supabase/pantry_supply.sql</code> once in Supabase → SQL Editor, then reload.
          </div>
        ) : loading ? (
          <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>
        ) : tab === 'LISTS' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setDate(d => shiftDate(d, -1))} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center" aria-label="Previous day"><ChevronLeft size={18} /></button>
              <label className="relative flex-1 sm:flex-none">
                <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Date" />
                <span className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-sm font-black text-slate-700 flex items-center justify-center sm:min-w-[220px]">{date === today ? 'Today · ' : ''}{niceDate(date)}</span>
              </label>
              <button onClick={() => setDate(d => shiftDate(d, 1))} className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center" aria-label="Next day"><ChevronRight size={18} /></button>
              {date !== today && <button onClick={() => setDate(today)} className="h-10 px-3 rounded-xl text-xs font-black text-[#6D2158]">Today</button>}
            </div>

            <div className="grid md:grid-cols-2 gap-3 items-start">
              {PANTRIES.map(p => {
                const reqs = requests.filter(r => r.pantry === p).sort((a, b) => (a.kind === 'Scheduled' ? -1 : 1) - (b.kind === 'Scheduled' ? -1 : 1));
                const supplyDay = isSupplyDay(days, p, date);
                const nxt = nextSupplyDate(days, p, date);
                return (
                  <section key={p} className={`bg-white rounded-2xl border ${supplyDay ? 'border-[#6D2158]/40' : 'border-slate-200'}`}>
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                      <h2 className="text-base font-black text-slate-800 flex-1">{pantryShort(p)}</h2>
                      {supplyDay ? <span className="text-[11px] font-black px-2 py-1 rounded-full bg-[#6D2158] text-white">Supply day</span>
                        : <span className="text-[11px] font-bold text-slate-400">{nxt ? `Next: ${niceDate(nxt, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'No supply day set'}</span>}
                    </div>
                    {reqs.length === 0 && <p className="px-4 py-8 text-center text-sm font-semibold text-slate-400">{supplyDay ? 'Nothing asked for yet.' : 'No list for this day.'}</p>}
                    {reqs.map(r => {
                      const ls = [...(r.lines || [])].sort((a, b) => catOf(a).localeCompare(catOf(b)) || a.name.localeCompare(b.name));
                      const packed = ls.filter(l => l.status === 'Packed').length;
                      const na = ls.filter(l => l.status === 'Not available').length;
                      const stepIdx = STATUS_STEPS.indexOf(r.status);
                      const editable = r.status === 'Open' || r.status === 'Packed';
                      return (
                        <div key={r.id} className="border-b last:border-b-0 border-slate-100">
                          <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
                            {r.kind === 'Extra' && <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 flex items-center gap-1"><Zap size={11} /> Urgent</span>}
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status]}`}>{r.status}{r.status === 'With runner' && r.runner_name ? ` · ${r.runner_name}` : ''}</span>
                            <span className="text-xs font-bold text-slate-400">{packed}/{ls.length} packed{na ? ` · ${na} n/a` : ''}</span>
                            <div className="ml-auto flex gap-1">
                              <button onClick={() => copyList(r)} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center" title="Copy list"><Copy size={14} /></button>
                              {stepIdx > 0 && <button onClick={() => stepBack(r)} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center" title="Back one step"><Undo2 size={14} /></button>}
                            </div>
                          </div>
                          {/* progress */}
                          <div className="px-4 pt-2 flex gap-1">
                            {STATUS_STEPS.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-[#6D2158]' : 'bg-slate-200'}`} title={s} />)}
                          </div>
                          <ul className="px-2 py-2">
                            {ls.map(l => (
                              <li key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-50">
                                <button disabled={!editable} onClick={() => setLine(l, l.status === 'Packed' ? 'Needed' : 'Packed')}
                                  className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 ${l.status === 'Packed' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300'} disabled:opacity-60`} aria-label={`Packed ${l.name}`}>
                                  {l.status === 'Packed' && <Check size={14} />}
                                </button>
                                <span className="min-w-0 flex-1">
                                  <span className={`block text-sm font-bold truncate ${l.status === 'Not available' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{l.name}{l.is_custom && <span className="ml-1.5 text-[10px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">typed</span>}</span>
                                  <span className="block text-[11px] font-semibold text-slate-400 truncate">{l.requested_by_name || ''}</span>
                                </span>
                                {editable && (
                                  <button onClick={() => setLine(l, l.status === 'Not available' ? 'Needed' : 'Not available')} className={`h-7 px-2 rounded-lg text-[11px] font-black shrink-0 ${l.status === 'Not available' ? 'bg-rose-100 text-rose-700' : 'text-slate-400 hover:bg-slate-100'}`} title="Not available in the store">N/A</button>
                                )}
                              </li>
                            ))}
                          </ul>
                          <div className="px-4 pb-3">
                            {r.status === 'Open' && <button disabled={busy === r.id || !ls.length} onClick={() => markPacked(r)} className="w-full h-11 rounded-xl bg-sky-600 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"><PackageCheck size={16} /> Mark packed</button>}
                            {r.status === 'Packed' && <button disabled={busy === r.id} onClick={() => setRunnerPick(r)} className="w-full h-11 rounded-xl bg-violet-600 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"><Truck size={16} /> Give to runner</button>}
                            {r.status === 'With runner' && <button disabled={busy === r.id} onClick={() => delivered(r)} className="w-full h-11 rounded-xl bg-emerald-600 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"><Check size={16} /> Delivered</button>}
                            {r.status === 'Delivered' && <p className="text-xs font-bold text-emerald-700 text-center">Delivered {timeOf(r.delivered_at)}{r.runner_name ? ` by ${r.runner_name}` : ''}{r.packed_by ? ` · packed by ${r.packed_by}` : ''}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </div>
        ) : tab === 'ITEMS' ? (
          <ItemsTab items={items} onChange={() => load(false)} />
        ) : (
          <DaysTab days={days} onSaved={d => setDays(d)} />
        )}
      </div>

      {/* Runner picker */}
      {runnerPick && (
        <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setRunnerPick(null)} />
          <div className="relative w-full md:max-w-sm bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
            <p className="text-base font-black text-slate-800">Give {pantryShort(runnerPick.pantry)} list to</p>
            <p className="text-xs font-semibold text-slate-400 mb-3">They get a notification</p>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {runners.map(r => (
                <button key={r.id} onClick={() => giveToRunner(runnerPick, r)} className="w-full h-12 px-4 rounded-xl bg-violet-50 text-violet-800 text-sm font-black flex items-center justify-between">
                  {r.name} <Send size={15} />
                </button>
              ))}
              {runners.length === 0 && <p className="py-4 text-center text-sm font-semibold text-slate-400">No runner on the board for this day.</p>}
              <RunnerFree onPick={name => giveToRunner(runnerPick, { id: '', name })} />
            </div>
            <button onClick={() => setRunnerPick(null)} className="mt-3 w-full h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-black">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Someone not on the runner board (e.g. the houseman takes it himself) */
function RunnerFree({ onPick }: { onPick: (name: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-2 pt-1">
      <input value={v} onChange={e => setV(e.target.value)} placeholder="Someone else (name)" className="flex-1 h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
      <button disabled={!v.trim()} onClick={() => onPick(v.trim())} className="h-11 px-4 rounded-xl bg-slate-800 text-white text-xs font-black disabled:opacity-40">Give</button>
    </div>
  );
}

/* ================= Items (admin) ================= */
function ItemsTab({ items, onChange }: { items: PantryItem[]; onChange: () => void }) {
  const { confirmAction } = useConfirm();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [category, setCategory] = useState('General');
  const [custom, setCustom] = useState('');
  const categories = useMemo(() => [...new Set(['General', ...items.map(i => i.category || 'General')])].sort(), [items]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setResults([]); return; }
    const h = setTimeout(async () => {
      const { data } = await supabase.from('hsk_master_catalog').select('article_number, article_name, generic_name, unit, image_url, category')
        .or(`article_name.ilike.%${t.replace(/[%,()]/g, '')}%,generic_name.ilike.%${t.replace(/[%,()]/g, '')}%,article_number.ilike.%${t.replace(/[%,()]/g, '')}%`).limit(30);
      setResults(data || []);
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const have = new Set(items.map(i => i.article_number).filter(Boolean));
  const add = async (row: { article_number: string | null; name: string; unit?: string | null; image_url?: string | null }) => {
    const { error } = await supabase.from('hsk_pantry_items').insert([{ ...row, category: category.trim() || 'General', sort_order: items.length }]);
    if (error) toast.error('Could not add: ' + error.message); else { toast.success(`${row.name} added`); onChange(); }
  };
  const update = async (id: string, patch: Partial<PantryItem>) => {
    const { error } = await supabase.from('hsk_pantry_items').update(patch).eq('id', id);
    if (error) toast.error('Could not save'); else onChange();
  };
  const remove = async (it: PantryItem) => {
    if (!(await confirmAction({ title: `Remove ${it.name}?`, message: 'It disappears from the request list. Past requests keep it.', confirmText: 'Remove', isDestructive: true }))) return;
    const { error } = await supabase.from('hsk_pantry_items').delete().eq('id', it.id);
    if (error) toast.error('Could not remove'); else onChange();
  };

  const grouped = useMemo(() => { const g: Record<string, PantryItem[]> = {}; items.forEach(i => { (g[i.category || 'General'] ||= []).push(i); }); return Object.entries(g).sort(([a], [b]) => a.localeCompare(b)); }, [items]);

  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-start">
      <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div>
          <p className="text-sm font-black text-slate-800">Add items</p>
          <p className="text-xs font-semibold text-slate-400">From the Master Catalog, or type your own</p>
        </div>
        <label className="block">
          <span className="text-xs font-black text-slate-500">Into category</span>
          <input list="pantry-cats" value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
          <datalist id="pantry-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
        </label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search Master Catalog" className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
        </div>
        {results.length > 0 && (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {results.map(r => {
              const added = have.has(r.article_number);
              return (
                <div key={r.article_number} className="px-3 py-2 flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800 truncate">{r.generic_name || r.article_name}</span>
                    <span className="block text-[11px] font-semibold text-slate-400 truncate">{r.article_number}{r.category ? ` · ${r.category}` : ''}</span>
                  </span>
                  <button disabled={added} onClick={() => add({ article_number: r.article_number, name: r.generic_name || r.article_name, unit: r.unit, image_url: r.image_url })} className="h-8 px-3 rounded-lg bg-[#6D2158] text-white text-xs font-black disabled:bg-slate-100 disabled:text-slate-400">{added ? 'Added' : 'Add'}</button>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Custom item (not in catalog)" className="flex-1 h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
          <button disabled={!custom.trim()} onClick={() => { add({ article_number: null, name: custom.trim() }); setCustom(''); }} className="h-10 px-4 rounded-xl bg-slate-800 text-white text-xs font-black disabled:opacity-40 flex items-center gap-1"><Plus size={14} /> Add</button>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-black text-slate-800">The pantry list · {items.filter(i => i.active).length} items</p>
          <p className="text-xs font-semibold text-slate-400">What attendants can tick. Hide an item to take it off without deleting.</p>
        </div>
        {items.length === 0 && <p className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No items yet. Add from the left.</p>}
        {grouped.map(([cat, list]) => (
          <div key={cat}>
            <p className="px-4 pt-3 pb-1 text-xs font-black text-slate-400 uppercase tracking-wide">{cat}</p>
            {list.map(it => (
              <div key={it.id} className={`px-4 py-2 flex items-center gap-2 ${it.active ? '' : 'opacity-50'}`}>
                <span className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">{it.image_url ? <img src={it.image_url} alt="" className="w-full h-full object-contain" /> : <Package size={16} className="text-slate-300" />}</span>
                <span className="min-w-0 flex-1 text-sm font-bold text-slate-800 truncate">{it.name}{!it.article_number && <span className="ml-1.5 text-[10px] font-black text-slate-400">custom</span>}</span>
                <select value={it.category} onChange={e => update(it.id, { category: e.target.value })} className="h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold max-w-[120px]" aria-label="Category">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => update(it.id, { active: !it.active })} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center" title={it.active ? 'Hide' : 'Show'}>{it.active ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <button onClick={() => remove(it)} className="w-8 h-8 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center" aria-label="Remove"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

/* ================= Supply days (admin) ================= */
function DaysTab({ days, onSaved }: { days: SupplyDays; onSaved: (d: SupplyDays) => void }) {
  const [draft, setDraft] = useState<SupplyDays>(days);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(days);
  const toggle = (p: string, d: number) => setDraft(prev => { const cur = prev[p] || []; return { ...prev, [p]: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort() }; });
  const save = async () => {
    setSaving(true);
    try { await saveSupplyDays(draft); onSaved(draft); toast.success('Supply days saved'); }
    catch (e) { toast.error('Could not save: ' + ((e as Error)?.message || 'error')); }
    finally { setSaving(false); }
  };
  return (
    <section className="bg-white rounded-2xl border border-slate-200 max-w-2xl">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-black text-slate-800">Supply day for each pantry</p>
        <p className="text-xs font-semibold text-slate-400">Requests made on other days wait for the next supply day, unless marked urgent</p>
      </div>
      <div className="divide-y divide-slate-100">
        {PANTRIES.map(p => (
          <div key={p} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-black text-slate-800">{pantryShort(p)}</p>
              <p className="text-xs font-semibold text-slate-400">{supplyDaysLabel(draft, p)}</p>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((w, i) => {
                const on = (draft[p] || []).includes(i);
                return <button key={w} onClick={() => toggle(p, i)} className={`h-10 rounded-xl text-xs font-black border-2 ${on ? 'bg-[#6D2158] border-[#6D2158] text-white' : 'bg-white border-slate-200 text-slate-500'}`}>{w}</button>;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-slate-100">
        <button onClick={save} disabled={!dirty || saving} className={`w-full h-11 rounded-xl text-sm font-black flex items-center justify-center gap-2 ${dirty ? 'bg-[#6D2158] text-white' : 'bg-slate-100 text-slate-400'}`}>
          {saving && <Loader2 size={16} className="animate-spin" />}{dirty ? 'Save supply days' : 'Saved'}
        </button>
      </div>
    </section>
  );
}

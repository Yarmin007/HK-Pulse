"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bike, Check, CheckCheck, Clock, Loader2, MapPin, RefreshCw, Ticket, User, Wine, ClipboardList, Star, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr, getDhakaTime, formatDisplayTime } from '@/lib/dateUtils';
import { classifyTarget, parseVillas, isOnlyRefills, splitItems } from '@/lib/requestsShared';
import { riderDutyOf, isOffShift } from '@/app/allocation/lib/riders';

// Runner view of guest requests: where to go, what to bring, and the villa's attendant.
// Deliberately leaves out guest names, bill/CHK numbers, meal plans and package details.

type Req = {
  id: string;
  villa_number: string;
  request_type: string;
  item_details: string;
  request_time: string;
  is_sent: boolean;
  is_done: boolean;
};

type Host = { id: string; host_id: string; full_name: string; nicknames?: string | null; role?: string | null; sub_department?: string | null; mvpn?: string | null };

const shortName = (h?: Host | null) => (h ? (h.nicknames ? h.nicknames.split(',')[0].trim() : h.full_name) : '');
const isDelivered = (r: Req) => (r.request_type === 'Minibar' ? r.is_sent : r.is_done);
const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const agoLabel = (m: number) => (m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`);

const TYPE_STYLE: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  Minibar: { label: 'Minibar', cls: 'bg-rose-50 text-rose-700 border-rose-100', icon: Wine },
  'GEM Request': { label: 'GEM', cls: 'bg-amber-50 text-amber-700 border-amber-100', icon: Star },
};
const typeStyle = (t: string) => TYPE_STYLE[t] || { label: 'Request', cls: 'bg-violet-50 text-violet-700 border-violet-100', icon: ClipboardList };

export default function RunnerPage() {
  const [access, setAccess] = useState<'checking' | 'yes' | 'no'>('checking');
  const [me, setMe] = useState<{ id?: string; name?: string; admin?: boolean }>({});
  const [requests, setRequests] = useState<Req[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [allocs, setAllocs] = useState<{ host_id: string; area: string; shift: string; task_details: string }[]>([]);
  const [doubleVillas, setDoubleVillas] = useState<string[]>([]);
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const today = getDhakaDateStr();

  const load = useCallback(async () => {
    const start = `${today}T00:00:00+06:00`;
    const end = `${today}T23:59:59+06:00`;
    const twoDaysAgo = getDhakaDateStr(new Date(getDhakaTime().getTime() - 2 * 86400000));
    const fields = 'id, villa_number, request_type, item_details, request_time, is_sent, is_done';
    const [todayRes, olderRes, allocRes, hostRes, dvRes] = await Promise.all([
      supabase.from('hsk_daily_requests').select(fields).gte('request_time', start).lte('request_time', end).order('request_time', { ascending: false }),
      supabase.from('hsk_daily_requests').select(fields).gte('request_time', `${twoDaysAgo}T00:00:00+06:00`).lt('request_time', start).order('request_time', { ascending: false }),
      supabase.from('hsk_allocations').select('host_id, area, shift, task_details').eq('report_date', today),
      supabase.from('hsk_hosts').select('id, host_id, full_name, nicknames, role, sub_department, mvpn').eq('status', 'Active'),
      supabase.from('hsk_constants').select('label').eq('type', 'double_mb_villas'),
    ]);
    // Undelivered requests from the last two days stay on the list.
    const older = ((olderRes.data || []) as Req[]).filter(r => !isDelivered(r));
    setRequests([...(todayRes.data || []) as Req[], ...older]);
    setAllocs(allocRes.data || []);
    setHosts((hostRes.data || []) as Host[]);
    setDoubleVillas((dvRes.data || []).flatMap((c: { label: string }) => c.label.split(',').map(v => v.trim())).filter(Boolean));
    setLoading(false);
    return { allocs: allocRes.data || [], hosts: (hostRes.data || []) as Host[] };
  }, [today]);

  // Who can see this page: admins, and whoever is on Runner duty today.
  useEffect(() => {
    (async () => {
      let session: { id?: string; full_name?: string; system_role?: string; is_super_admin?: boolean; impersonating_from?: unknown } = {};
      try { session = JSON.parse(localStorage.getItem('hk_pulse_session') || '{}'); } catch { /* not logged in */ }
      const admin = !session.impersonating_from && (session.system_role === 'admin' || session.is_super_admin === true);
      setMe({ id: session.id, name: session.full_name, admin });
      const data = await load();
      const host = data.hosts.find(h => h.id === session.id);
      const onDuty = data.allocs.some(a => a.area === 'riders' && a.host_id === session.id && !isOffShift(a.shift) && riderDutyOf(a, host) === 'Runner');
      setAccess(admin || onDuty ? 'yes' : 'no');
    })();
  }, [load]);

  // Live updates + keep "x min ago" fresh.
  useEffect(() => {
    if (access !== 'yes') return;
    const ch = supabase.channel('runner_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, () => { load(); })
      .subscribe();
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [access, load]);

  const hostById = useMemo(() => new Map(hosts.map(h => [h.id, h])), [hosts]);

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

  const runnersToday = useMemo(() => allocs
    .filter(a => a.area === 'riders' && !isOffShift(a.shift) && riderDutyOf(a, hostById.get(a.host_id)) === 'Runner')
    .map(a => ({ name: shortName(hostById.get(a.host_id)), shift: a.shift, mvpn: hostById.get(a.host_id)?.mvpn || '' }))
    .filter(r => r.name), [allocs, hostById]);

  const todo = requests.filter(r => !isDelivered(r)).sort((a, b) => a.request_time.localeCompare(b.request_time)); // oldest first
  const done = requests.filter(isDelivered).sort((a, b) => b.request_time.localeCompare(a.request_time));
  const list = tab === 'todo' ? todo : done;

  // Writes the "(SENT)" marks and the delivered flag (Minibar: sent · others: done).
  const saveItems = async (r: Req, items: { name: string; sent: boolean }[]) => {
    const allSent = items.length > 0 && items.every(i => i.sent);
    const item_details = items.map(i => (i.sent ? `${i.name} (SENT)` : i.name)).join('\n');
    const patch = r.request_type === 'Minibar' ? { item_details, is_sent: allSent } : { item_details, is_done: allSent };
    setBusy(r.id);
    setRequests(prev => prev.map(x => (x.id === r.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from('hsk_daily_requests').update(patch).eq('id', r.id);
    setBusy(null);
    if (error) { toast.error('Not saved — check your connection'); load(); }
    else if (allSent) toast.success('Delivered');
  };

  const toggleItem = (r: Req, idx: number) => {
    const items = splitItems(r.item_details).map((it, i) => ({ name: it.name, sent: i === idx ? !it.sent : it.sent }));
    saveItems(r, items);
  };
  const setAll = (r: Req, sent: boolean) => saveItems(r, splitItems(r.item_details).map(it => ({ name: it.name, sent })));

  if (access === 'checking' || loading) {
    return <div className="min-h-[70dvh] flex items-center justify-center text-[#6D2158]"><Loader2 className="animate-spin" /></div>;
  }

  if (access === 'no') {
    return (
      <div className="min-h-[70dvh] flex items-center justify-center p-6">
        <div className="max-w-sm text-center bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4"><Lock size={24} /></div>
          <h1 className="text-lg font-black text-slate-800">Runner duty only</h1>
          <p className="text-sm text-slate-500 mt-1">This page opens for whoever is on <strong>Runner</strong> duty today in the allocation.</p>
          {runnersToday.length > 0 && <p className="text-xs text-slate-400 mt-3">Today: {runnersToday.map(r => r.name).join(', ')}</p>}
          <Link href="/" className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-[#6D2158] text-white text-xs font-bold">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F7F5F8] font-sans text-slate-800">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-3 md:pt-8 pb-10 space-y-3">

        {/* HEADER */}
        <header className="rounded-3xl bg-gradient-to-br from-orange-600 to-amber-500 text-white p-4 md:p-5 shadow-lg shadow-orange-600/20">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><Bike size={22} /></div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-black leading-tight">Runner</h1>
              <p className="text-xs font-semibold text-white/80">{getDhakaTime().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <button onClick={() => load()} className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25" title="Refresh"><RefreshCw size={16} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {runnersToday.length === 0
              ? <span className="text-[11px] font-semibold text-white/80">No runner allocated today</span>
              : runnersToday.map((r, i) => (
                <span key={i} className="text-[11px] font-bold bg-white/15 border border-white/20 rounded-lg px-2 py-1">{r.name} · {r.shift}{r.mvpn ? ` · ${r.mvpn}` : ''}</span>
              ))}
          </div>
        </header>

        {/* TABS */}
        <div className="flex bg-white border border-slate-200 p-1 rounded-2xl sticky top-2 z-10 shadow-sm">
          {([['todo', 'To deliver', todo.length], ['done', 'Delivered', done.length]] as const).map(([k, l, n]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-colors ${tab === k ? (k === 'todo' ? 'bg-orange-600 text-white' : 'bg-emerald-600 text-white') : 'text-slate-500'}`}>
              {l} <span className={`text-[11px] px-1.5 rounded-md ${tab === k ? 'bg-white/20' : 'bg-slate-100'}`}>{n}</span>
            </button>
          ))}
        </div>

        {list.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <CheckCheck size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">{tab === 'todo' ? 'Nothing to deliver right now.' : 'Nothing delivered yet today.'}</p>
          </div>
        )}

        {list.map(r => {
          const target = classifyTarget(r.villa_number);
          const va = target.kind === 'villa' ? (villaVA[target.value] || villaVA[target.base] || '') : '';
          const items = splitItems(r.item_details);
          const sentCount = items.filter(i => i.sent).length;
          const ts = typeStyle(r.request_type);
          const mins = minutesAgo(r.request_time);
          const late = !isDelivered(r) && mins >= 30;
          const notToday = getDhakaDateStr(new Date(new Date(r.request_time).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }))) !== today;
          return (
            <article key={r.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${late ? 'border-rose-200' : 'border-slate-200'}`}>
              <div className="flex items-start gap-3 p-4 pb-3">
                <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0 ${target.kind === 'villa' ? 'bg-[#6D2158] text-white' : 'bg-slate-800 text-white'}`}>
                  {target.kind === 'villa' ? (<><span className="text-[10px] font-bold opacity-70 leading-none">VILLA</span><span className="text-2xl font-black leading-none mt-0.5">{target.value}</span></>)
                    : target.kind === 'code' ? (<><Ticket size={16} /><span className="text-[11px] font-black mt-1">{target.value}</span></>)
                    : (<><MapPin size={16} /><span className="text-[10px] font-black mt-1 px-1 text-center leading-tight line-clamp-2">{target.value}</span></>)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${ts.cls}`}><ts.icon size={11} /> {ts.label}</span>
                    {isOnlyRefills(r.item_details) && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-100">Refill</span>}
                    {target.kind === 'code' && <span className="text-[10px] font-bold text-slate-500">Complimentary code</span>}
                  </div>
                  <p className={`text-xs font-semibold mt-1.5 flex items-center gap-1 ${late ? 'text-rose-600' : 'text-slate-500'}`}>
                    <Clock size={12} /> {formatDisplayTime(r.request_time)} · {notToday ? new Date(r.request_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : agoLabel(mins)}
                  </p>
                  {va && <p className="text-xs font-bold text-slate-700 mt-1 flex items-center gap-1"><User size={12} className="text-slate-400" /> VA: {va}</p>}
                </div>
              </div>

              <ul className="px-3 pb-2 space-y-1">
                {items.map((it, i) => (
                  <li key={i}>
                    <button disabled={busy === r.id} onClick={() => toggleItem(r, i)}
                      className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-2xl border transition-colors ${it.sent ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 active:bg-slate-100'}`}>
                      <span className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 ${it.sent ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>{it.sent && <Check size={14} strokeWidth={3} />}</span>
                      <span className={`text-[15px] font-semibold ${it.sent ? 'text-emerald-800 line-through decoration-emerald-400' : 'text-slate-800'}`}>{it.name}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="px-3 pb-3 pt-1">
                {isDelivered(r) ? (
                  <button onClick={() => setAll(r, false)} disabled={busy === r.id} className="w-full py-2.5 rounded-2xl text-xs font-bold text-slate-500 bg-slate-100">Undo delivered</button>
                ) : (
                  <button onClick={() => setAll(r, true)} disabled={busy === r.id}
                    className="w-full py-3 rounded-2xl text-sm font-black text-white bg-emerald-600 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60">
                    {busy === r.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={18} />}
                    {sentCount > 0 ? `Delivered all (${sentCount}/${items.length} ticked)` : 'Delivered'}
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {me.admin && <p className="text-center text-[11px] text-slate-400 pt-2">You see this page as an admin. Runners see the same page.</p>}
      </div>
    </div>
  );
}

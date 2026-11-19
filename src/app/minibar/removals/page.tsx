"use client";
// Expiry & Refills — one removal ROUND at a time (several rounds can happen in a month).
// Work order: 1 Items (what to look for) → 2 Villas (who checks which villas) → 3 Progress (villa map)
// → 4 Send (what to dispatch) → History. Staff do the checking on My Tasks (live round only).
// Data: hsk_expiry_targets / _allocations / _removals keyed by round in `month_period`; batches in hsk_expiry_batches.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Loader2, X, Search, CheckCircle2, Trash2, Bell, Users, Target, Plus, Minus,
  Send, MessageCircle, AlertTriangle, Edit3, Archive, Sparkles, Lock, History,
  Radio, CalendarPlus, Map as MapIcon, PackageCheck, Copy, ChevronRight, Save,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { getDhakaDateStr } from '@/lib/dateUtils';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  roundLabel, loadActiveRound, saveActiveRound, listRounds, isVillaToken, villaBase, TOTAL_VILLAS,
} from '@/lib/expiryRounds';
import { JETTY_A, JETTY_B, JETTY_C, BEACH } from '@/app/allocation/lib/constants';

/* ------------------------------------------------------------------ helpers */

const getLocalMonth = () => {
  const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).substring(0, 7);
};

const parseVillas = (input: string, doubleVillas: string[]) => {
  const result = new Set<string>();
  for (const p of String(input || '').split(',').map(s => s.trim())) {
    if (p.includes('-') && !p.includes('-1') && !p.includes('-2')) {
      const [start, end] = p.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          const v = String(i);
          if (doubleVillas.includes(v)) { result.add(`${v}-1`); result.add(`${v}-2`); } else result.add(v);
        }
      }
    } else if (p) {
      if (!p.includes('-') && doubleVillas.includes(p)) { result.add(`${p}-1`); result.add(`${p}-2`); } else result.add(p);
    }
  }
  return Array.from(result).sort((a, b) => parseFloat(a.replace('-', '.')) - parseFloat(b.replace('-', '.')));
};

const jettyOf = (n: number) => (n >= 1 && n <= 35 ? 1 : n >= 37 && n <= 50 ? 2 : n >= 59 && n <= 79 ? 3 : n === 9999 ? 5 : 4);
const sortHostsJettyWise = (ids: string[], alloc: Record<string, string>, dv: string[]) => [...ids].sort((a, b) => {
  const va = parseVillas(alloc[a] || '', dv).filter(isVillaToken), vb = parseVillas(alloc[b] || '', dv).filter(isVillaToken);
  const ma = va.length ? parseFloat(va[0].replace('-', '.')) : 9999, mb = vb.length ? parseFloat(vb[0].replace('-', '.')) : 9999;
  return (jettyOf(ma) - jettyOf(mb)) || ma - mb;
});
const sortRounds = (list: string[]) => [...list].sort((x, y) => (y.length === 7 ? `${y}-00` : y).localeCompare(x.length === 7 ? `${x}-00` : x));
const villaSort = (a: any, b: any) => parseFloat(String(a.villa_number).replace('-', '.')) - parseFloat(String(b.villa_number).replace('-', '.'));

type VStatus = 'Pending' | 'All OK' | 'Removed' | 'Sent' | 'Refilled' | 'Nobody';
const STATUS: Record<VStatus, { label: string; tile: string; dot: string }> = {
  Nobody:   { label: 'No attendant',  tile: 'bg-slate-50 border-dashed border-slate-300 text-slate-300', dot: 'bg-slate-200' },
  Pending:  { label: 'Not checked',   tile: 'bg-white border-slate-300 text-slate-700',                 dot: 'bg-white border border-slate-400' },
  'All OK': { label: 'Nothing found', tile: 'bg-emerald-100 border-emerald-300 text-emerald-800',       dot: 'bg-emerald-200' },
  Removed:  { label: 'To send',       tile: 'bg-amber-400 border-amber-500 text-slate-900',             dot: 'bg-amber-400' },
  Sent:     { label: 'Sent, waiting', tile: 'bg-violet-600 border-violet-700 text-white',               dot: 'bg-violet-600' },
  Refilled: { label: 'Refilled',      tile: 'bg-emerald-600 border-emerald-700 text-white',             dot: 'bg-emerald-600' },
};
const LEGEND: VStatus[] = ['Pending', 'Removed', 'Sent', 'Refilled', 'All OK', 'Nobody'];

type Step = 'ITEMS' | 'VILLAS' | 'PROGRESS' | 'SEND' | 'HISTORY';
const fmtDate = (d: string, f = 'dd MMM yyyy') => { try { return format(parseISO(d), f); } catch { return d; } };
const isBatchDate = (d?: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
// What actually goes back to the villa: the coordinator's edited qty (even 0), else what was removed
const sentQty = (it: any): number => (it.qty_edited ? (it.refilled_qty ?? it.qty) : (it.refilled_qty > 0 ? it.refilled_qty : it.qty)) || 0;

/* ------------------------------------------------------------------ villa tag input */

function VillaTagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tags = value.split(',').map(s => s.trim()).filter(Boolean);
  const okTag = (t: string) => /^\d+(-\d+)?$/.test(t) && parseVillas(t, []).some(isVillaToken);
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^v/i, '');
    if (!t) return;
    if (!okTag(t)) { toast.error(`"${raw.trim()}" is not a villa number`); return; }
    if (!tags.includes(t)) onChange([...tags, t].join(', '));
  };
  return (
    <div className="flex flex-wrap gap-1.5 items-center bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-xl focus-within:border-[#6D2158] focus-within:bg-white min-h-[44px]">
      {tags.map(t => (
        <span key={t} className={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg text-sm font-black border ${okTag(t) ? 'bg-white border-slate-200 text-slate-800' : 'bg-rose-50 border-rose-300 text-rose-600 line-through'}`} title={okTag(t) ? '' : 'Not a villa number'}>
          {t}
          <button onClick={() => onChange(tags.filter(x => x !== t).join(', '))} className="p-0.5 rounded text-slate-300 hover:text-rose-500" aria-label={`Remove ${t}`}><X size={13} /></button>
        </span>
      ))}
      <input type="text" inputMode="numeric" placeholder={tags.length ? 'Add…' : 'Villa no. + Enter (or 1-5)'}
        className="bg-transparent outline-none flex-1 min-w-[90px] text-sm font-bold text-slate-700 py-1"
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === ',') { e.preventDefault(); addTag(e.currentTarget.value); e.currentTarget.value = ''; }
          else if (e.key === 'Backspace' && e.currentTarget.value === '' && tags.length) onChange(tags.slice(0, -1).join(', '));
        }}
        onBlur={e => { addTag(e.target.value); e.target.value = ''; }} />
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function ExpiryRemovalsAdmin() {
  const { confirmAction } = useConfirm();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<Step | null>(null);

  // round
  const [selectedRound, setSelectedRound] = useState('');
  const [rounds, setRounds] = useState<string[]>([]);
  const [activeRound, setActiveRound] = useState('');
  const [isLocked, setIsLocked] = useState(true);
  const [newRound, setNewRound] = useState({ open: false, date: '', copyTargets: true, copyAlloc: false, makeLive: true });

  // data
  const [targets, setTargets] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [allocationOrder, setAllocationOrder] = useState<string[]>([]);
  const [allocDirty, setAllocDirty] = useState(false);
  const [removals, setRemovals] = useState<any[]>([]);
  const [hosts, setHosts] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [dvStr, setDvStr] = useState('');

  // ui
  const [hostSearch, setHostSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [addMode, setAddMode] = useState<'BATCHES' | 'CATALOG'>('BATCHES');
  const [newBatch, setNewBatch] = useState<{ item: any | null; date: string; q: string }>({ item: null, date: '', q: '' });
  const [autoFillDate, setAutoFillDate] = useState(getDhakaDateStr());
  const [mapFilter, setMapFilter] = useState<string>('ALL');
  const [villaSheet, setVillaSheet] = useState<string | null>(null);
  const [editLog, setEditLog] = useState<{ villa: string; status: string; data: any[] } | null>(null);
  const [notify, setNotify] = useState<{ host: string; name: string; msg: string } | null>(null);

  const dvList = useMemo(() => dvStr.split(',').map(s => s.trim()).filter(Boolean), [dvStr]);
  const hostOf = useCallback((key: string) => hosts.find((h: any) => h.id === key || h.host_id === key), [hosts]);
  const nameOf = useCallback((key: string) => { const h = hostOf(key); return h ? (h.nicknames ? String(h.nicknames).split(',')[0].trim() : h.full_name) : 'Unknown'; }, [hostOf]);

  /* ---------------- load ---------------- */

  const refreshRounds = useCallback(async () => {
    const [list, live] = await Promise.all([listRounds(), loadActiveRound()]);
    const current = live || getLocalMonth();
    setActiveRound(live);
    setRounds(sortRounds(list.includes(current) ? list : [current, ...list]));
    return current;
  }, []);

  const fetchData = useCallback(async (showLoading = true) => {
    if (!selectedRound) return;
    if (showLoading) setIsLoading(true);
    const [t, a, r, b, m, h, c] = await Promise.all([
      supabase.from('hsk_expiry_targets').select('*').eq('month_period', selectedRound),
      supabase.from('hsk_expiry_allocations').select('*').eq('month_period', selectedRound).order('created_at', { ascending: true }),
      supabase.from('hsk_expiry_removals').select('*').eq('month_period', selectedRound),
      supabase.from('hsk_expiry_batches').select('*').neq('status', 'Archived'),
      supabase.from('hsk_master_catalog').select('article_number, article_name, generic_name, image_url, unit, is_minibar_item, has_expiry'),
      supabase.from('hsk_hosts').select('id, host_id, full_name, nicknames, role, sub_department, image_url, status').neq('status', 'Resigned').order('full_name'),
      supabase.from('hsk_constants').select('type, label').in('type', ['double_mb_villas', 'expiry_inv_status']),
    ]);
    const dv = (c.data || []).find((x: any) => x.type === 'double_mb_villas')?.label || '';
    setDvStr(dv);
    const lock = (c.data || []).find((x: any) => x.type === 'expiry_inv_status');
    setIsLocked(lock ? lock.label === 'CLOSED' : true);
    setTargets(t.data || []);
    setRemovals(r.data || []);
    setHosts(h.data || []);
    setCatalog(m.data || []);
    const nameMap = new Map((m.data || []).map((x: any) => [x.article_number, x.generic_name || x.article_name]));
    setBatches((b.data || []).map((x: any) => ({ ...x, article_name: nameMap.get(x.article_number) || x.article_number })));
    const map: Record<string, string> = {}; const order: string[] = [];
    (a.data || []).forEach((x: any) => { map[x.host_id] = x.villas; if (!order.includes(x.host_id)) order.push(x.host_id); });
    const dvl = dv.split(',').map((s: string) => s.trim()).filter(Boolean);
    setAllocations(map);
    setAllocationOrder(sortHostsJettyWise(order, map, dvl));
    setAllocDirty(false);
    if (showLoading) setIsLoading(false);
  }, [selectedRound]);

  useEffect(() => { setIsMounted(true); refreshRounds().then(cur => setSelectedRound(prev => prev || cur)); }, [refreshRounds]);
  useEffect(() => { if (isMounted && selectedRound) { setStep(null); fetchData(true); } }, [selectedRound, isMounted, fetchData]);
  useEffect(() => {
    if (!isMounted) return;
    const ch = supabase.channel('admin_expiry_removals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_expiry_removals' }, () => fetchData(false))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchData, isMounted]);
  useEffect(() => {
    if (!allocDirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [allocDirty]);

  /* ---------------- derived ---------------- */

  const villaTiles = useMemo(() => {
    const list: string[] = [];
    for (let i = 1; i <= TOTAL_VILLAS; i++) { const v = String(i); if (dvList.includes(v)) list.push(`${v}-1`, `${v}-2`); else list.push(v); }
    return list;
  }, [dvList]);

  const owners = useMemo(() => {
    const m: Record<string, string[]> = {};
    allocationOrder.forEach(id => {
      [...new Set(parseVillas(allocations[id] || '', dvList).filter(isVillaToken).map(villaBase))].forEach(b => { (m[b] ||= []).push(id); });
    });
    return m;
  }, [allocations, allocationOrder, dvList]);

  const logOf = useMemo(() => { const m: Record<string, any> = {}; removals.forEach(r => { m[r.villa_number] = r; }); return m; }, [removals]);
  const statusOf = useCallback((v: string): VStatus => {
    const s = logOf[v]?.status;
    if (s === 'All OK' || s === 'Removed' || s === 'Sent' || s === 'Refilled') return s;
    return owners[villaBase(v)] ? 'Pending' : 'Nobody';
  }, [logOf, owners]);

  const counts = useMemo(() => {
    const c: Record<VStatus, number> = { Pending: 0, 'All OK': 0, Removed: 0, Sent: 0, Refilled: 0, Nobody: 0 };
    villaTiles.forEach(v => { c[statusOf(v)]++; });
    return c;
  }, [villaTiles, statusOf]);
  const assignedTiles = villaTiles.length - counts.Nobody;
  const checkedTiles = counts['All OK'] + counts.Removed + counts.Sent + counts.Refilled;

  const coverage = useMemo(() => {
    const notVilla = allocationOrder.filter(id => (allocations[id] || '').trim() && !parseVillas(allocations[id], dvList).some(isVillaToken));
    const uncovered: number[] = []; for (let i = 1; i <= TOTAL_VILLAS; i++) if (!owners[String(i)]) uncovered.push(i);
    const doubles = Object.entries(owners).filter(([, ids]) => ids.length > 1).map(([villa, ids]) => ({ villa, ids }));
    return { notVilla, uncovered, doubles };
  }, [allocations, allocationOrder, dvList, owners]);
  const villaWarn = coverage.notVilla.length + (allocationOrder.length ? (coverage.uncovered.length ? 1 : 0) + coverage.doubles.length : 0);

  const toSend = useMemo(() => removals.filter(r => r.status === 'Removed').sort(villaSort), [removals]);
  const waiting = useMemo(() => removals.filter(r => r.status === 'Sent').sort(villaSort), [removals]);
  const pickList = useMemo(() => {
    const m: Record<string, { name: string; qty: number }> = {};
    toSend.forEach(r => (r.removal_data || []).forEach((it: any) => {
      const q = sentQty(it); if (!q) return;
      (m[it.article_number] ||= { name: it.name || it.article_number, qty: 0 }).qty += q;
    }));
    return Object.values(m).sort((a, b) => b.qty - a.qty);
  }, [toSend]);

  const summary = useMemo(() => {
    const agg: Record<string, { name: string; batch: string; removed: number; refilled: number; villas: { villa: string; qty: number }[] }> = {};
    removals.forEach(r => {
      if (!r.status || r.status === 'Pending') return;
      (r.removal_data || []).forEach((it: any) => {
        const q = it.qty || 0; if (q <= 0) return;
        const t = targets.find(x => x.article_number === it.article_number);
        const a = (agg[it.article_number] ||= { name: it.name || t?.article_name || 'Unknown item', batch: t?.expiry_date || 'MISSING', removed: 0, refilled: 0, villas: [] });
        a.removed += q;
        a.refilled += r.status === 'Refilled' ? (it.refilled_qty ?? q) : 0;
        a.villas.push({ villa: r.villa_number, qty: q });
      });
    });
    return Object.values(agg).sort((a, b) => b.removed - a.removed);
  }, [removals, targets]);

  const availableBatches = useMemo(() => batches
    .filter(b => isBatchDate(b.expiry_date) && !targets.some(t => t.article_number === b.article_number && t.expiry_date === b.expiry_date))
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)), [batches, targets]);

  // Where to start: a new round opens on Items, a running one on what needs doing
  const defaultStep: Step = targets.length === 0 ? 'ITEMS' : allocationOrder.length === 0 ? 'VILLAS' : toSend.length > 0 ? 'SEND' : 'PROGRESS';
  const current: Step = step || defaultStep;

  /* ---------------- round actions ---------------- */

  const switchRound = async (k: string) => {
    if (allocDirty && !(await confirmAction({ title: 'Unsaved villa changes', message: 'You changed attendants / villas and did not save. Leave them?', confirmText: 'Leave', cancelText: 'Stay', icon: 'warning' }))) return;
    setSelectedRound(k);
  };

  const makeLive = async (k: string) => {
    try { await saveActiveRound(k); setActiveRound(k); toast.success(`${roundLabel(k)} is now live on My Tasks`); }
    catch (e: any) { toast.error('Could not set the live round: ' + (e?.message || 'error')); }
  };

  const setOpen = async (open: boolean) => {
    if (open && selectedRound !== activeRound) {
      try { await saveActiveRound(selectedRound); setActiveRound(selectedRound); }
      catch (e: any) { toast.error('Could not set the live round: ' + (e?.message || 'error')); return; }
    }
    const prev = isLocked;
    setIsLocked(!open);
    // delete + insert (hsk_constants update trips an updated_at trigger)
    await supabase.from('hsk_constants').delete().eq('type', 'expiry_inv_status');
    const { error } = await supabase.from('hsk_constants').insert([{ type: 'expiry_inv_status', label: open ? 'OPEN' : 'CLOSED' }]);
    if (error) { setIsLocked(prev); toast.error('Could not change: ' + error.message); return; }
    toast.success(open ? `Round ${roundLabel(selectedRound)} is open on My Tasks` : 'Closed: staff no longer see the expiry check');
  };

  const createRound = async () => {
    const key = newRound.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { toast.error('Pick the removal date'); return; }
    if (rounds.includes(key)) { setSelectedRound(key); setNewRound(n => ({ ...n, open: false })); toast('That round already exists, opened it'); return; }
    const from = selectedRound;
    setIsSaving(true);
    try {
      if (newRound.copyTargets && from) {
        const { data } = await supabase.from('hsk_expiry_targets').select('article_number, article_name, expiry_date').eq('month_period', from);
        if (data?.length) { const { error } = await supabase.from('hsk_expiry_targets').insert(data.map((t: any) => ({ ...t, month_period: key }))); if (error) throw error; }
      }
      if (newRound.copyAlloc && from) {
        const { data } = await supabase.from('hsk_expiry_allocations').select('host_id, villas').eq('month_period', from).order('created_at');
        const rows = (data || []).filter((a: any) => parseVillas(a.villas || '', dvList).some(isVillaToken));
        if (rows.length) {
          const now = Date.now();
          const { error } = await supabase.from('hsk_expiry_allocations').insert(rows.map((a: any, i: number) => ({ month_period: key, host_id: a.host_id, villas: a.villas, created_at: new Date(now + i * 1000).toISOString() })));
          if (error) throw error;
        }
      }
      if (newRound.makeLive) { await saveActiveRound(key); setActiveRound(key); }
      setRounds(prev => sortRounds([key, ...prev.filter(x => x !== key)]));
      setSelectedRound(key);
      setNewRound(n => ({ ...n, open: false }));
      toast.success(`Round ${roundLabel(key)} created${newRound.makeLive ? ' and live' : ''}`);
    } catch (e: any) { toast.error('Could not create the round: ' + (e?.message || 'error')); }
    finally { setIsSaving(false); }
  };

  /* ---------------- items ---------------- */

  const addBatchTarget = async (b: any) => {
    if (targets.some(t => t.article_number === b.article_number && t.expiry_date === b.expiry_date)) { toast.error('Already on the list'); return; }
    const { error } = await supabase.from('hsk_expiry_targets').insert([{ month_period: selectedRound, article_number: b.article_number, article_name: b.article_name, expiry_date: b.expiry_date }]);
    if (error) toast.error('Could not add: ' + error.message); else fetchData(false);
  };
  const addSoonBatches = async () => {
    const soon = availableBatches.filter(b => differenceInCalendarDays(parseISO(b.expiry_date), new Date()) <= 60);
    if (!soon.length) { toast('No batches expiring within 60 days'); return; }
    const { error } = await supabase.from('hsk_expiry_targets').insert(soon.map(b => ({ month_period: selectedRound, article_number: b.article_number, article_name: b.article_name, expiry_date: b.expiry_date })));
    if (error) toast.error('Could not add: ' + error.message); else { toast.success(`Added ${soon.length} batches`); fetchData(false); }
  };
  const addCatalogTarget = async (item: any, type: 'MISSING' | 'REFILL') => {
    const { error } = await supabase.from('hsk_expiry_targets').insert([{ month_period: selectedRound, article_number: item.article_number, article_name: item.generic_name || item.article_name, expiry_date: type === 'MISSING' ? null : type }]);
    if (error) toast.error('Could not add: ' + error.message); else { toast.success(type === 'MISSING' ? 'Missing check added' : 'Refill task added'); fetchData(false); }
  };
  const removeTarget = async (id: string) => {
    const { error } = await supabase.from('hsk_expiry_targets').delete().eq('id', id);
    if (error) toast.error('Could not remove: ' + error.message); else fetchData(false);
  };
  const archiveBatch = async (t: any) => {
    const ok = await confirmAction({ title: 'Archive this batch?', message: `${t.article_name} (${fmtDate(t.expiry_date, 'MMM yyyy')}) leaves the batch list for future rounds. It stays on this round until you remove it.`, confirmText: 'Archive', isDestructive: true });
    if (!ok) return;
    const { error } = await supabase.from('hsk_expiry_batches').update({ status: 'Archived' }).match({ article_number: t.article_number, expiry_date: t.expiry_date });
    if (error) toast.error('Could not archive: ' + error.message); else { toast.success('Batch archived'); fetchData(false); }
  };
  const trackBatch = async () => {
    if (!newBatch.item || !newBatch.date) { toast.error('Pick the item and its expiry date'); return; }
    if (batches.some(b => b.article_number === newBatch.item.article_number && b.expiry_date === newBatch.date)) { toast.error('That batch is already tracked'); return; }
    const { error } = await supabase.from('hsk_expiry_batches').insert({ article_number: newBatch.item.article_number, expiry_date: newBatch.date, quantity: 0, location: 'General', status: 'Active' });
    if (error) { toast.error('Could not save: ' + error.message); return; }
    toast.success('Batch saved');
    setNewBatch({ item: null, date: '', q: '' });
    fetchData(false);
  };
  const untrackBatch = async (b: any) => {
    const ok = await confirmAction({ title: 'Stop tracking this batch?', message: `${b.article_name} · ${fmtDate(b.expiry_date)}`, confirmText: 'Remove', isDestructive: true });
    if (!ok) return;
    const { error } = await supabase.from('hsk_expiry_batches').delete().eq('id', b.id);
    if (error) toast.error('Could not remove: ' + error.message); else fetchData(false);
  };

  /* ---------------- villas ---------------- */

  const setVillas = (id: string, v: string) => { setAllocations(prev => ({ ...prev, [id]: v })); setAllocDirty(true); };
  const removeHosts = (ids: string[]) => {
    setAllocations(prev => { const u = { ...prev }; ids.forEach(id => delete u[id]); return u; });
    setAllocationOrder(prev => prev.filter(id => !ids.includes(id)));
    setAllocDirty(true);
  };
  const addHost = (h: any) => {
    if (allocationOrder.some(id => id === h.id || id === h.host_id)) { toast('Already on the list'); return; }
    setAllocations(prev => ({ ...prev, [h.id]: '' }));
    setAllocationOrder(prev => [...prev, h.id]);
    setAllocDirty(true);
    setHostSearch('');
  };

  const autoFill = async () => {
    // Only villa attendants do the expiry removal: the Villa Attendant board, nothing else
    const { data, error } = await supabase.from('hsk_allocations').select('host_id, task_details').eq('report_date', autoFillDate).eq('area', 'villa').not('host_id', 'is', null);
    if (error) { toast.error('Could not read the allocation board'); return; }
    const byHost: Record<string, string[]> = {};
    (data || []).forEach((a: any) => {
      const vs = String(a.task_details || '').split(',').map((v: string) => v.trim()).filter(Boolean).filter((v: string) => parseVillas(v, dvList).some(isVillaToken));
      if (vs.length) (byHost[a.host_id] ||= []).push(...vs);
    });
    const ids = Object.keys(byHost);
    if (!ids.length) { toast.error(`No villa attendants with villas on ${fmtDate(autoFillDate, 'dd MMM')}`); return; }
    const next = { ...allocations }; const order = [...allocationOrder];
    ids.forEach(id => {
      const h = hosts.find((x: any) => x.id === id);
      if (h && next[h.host_id] !== undefined) { delete next[h.host_id]; const i = order.indexOf(h.host_id); if (i >= 0) order.splice(i, 1); }
      next[id] = [...new Set(byHost[id])].join(', ');
      if (!order.includes(id)) order.push(id);
    });
    setAllocations(next);
    setAllocationOrder(sortHostsJettyWise(order, next, dvList));
    setAllocDirty(true);
    toast.success(`Filled ${ids.length} villa attendants from ${fmtDate(autoFillDate, 'dd MMM')}. Check, then Save.`);
  };

  const saveAllocations = async () => {
    if (coverage.notVilla.length) { toast.error('Remove the people with no villa numbers first'); return; }
    setIsSaving(true);
    const order = sortHostsJettyWise(allocationOrder, allocations, dvList);
    const now = Date.now();
    const rows = order.filter(id => (allocations[id] || '').trim()).map((host_id, i) => ({ month_period: selectedRound, host_id, villas: allocations[host_id], created_at: new Date(now + i * 1000).toISOString() }));
    // Insert the new list first, then delete the old rows: a failed save never wipes the round
    const { data: old, error: readErr } = await supabase.from('hsk_expiry_allocations').select('id').eq('month_period', selectedRound);
    if (readErr) { toast.error('Save failed: ' + readErr.message); setIsSaving(false); return; }
    if (rows.length) {
      const { error } = await supabase.from('hsk_expiry_allocations').insert(rows);
      if (error) { toast.error('Save failed (nothing changed): ' + error.message); setIsSaving(false); return; }
    }
    const oldIds = (old || []).map((r: any) => r.id);
    if (oldIds.length) {
      const { error } = await supabase.from('hsk_expiry_allocations').delete().in('id', oldIds);
      if (error) toast.error('Saved, but old rows were not cleared: ' + error.message);
    }
    setIsSaving(false);
    setAllocDirty(false);
    if (!rounds.includes(selectedRound)) setRounds(prev => sortRounds([selectedRound, ...prev]));
    toast.success(`Saved ${rows.length} attendants for ${roundLabel(selectedRound)}`);
    fetchData(false);
  };

  const sendWhatsApp = (key: string) => {
    const h = hostOf(key); if (!h) return;
    const text = `*Expiry & Refills* 🚨\n\nHi ${String(h.full_name).split(' ')[0]},\nPlease check these villas for the target items (round of ${roundLabel(selectedRound)}):\n*Villas:* ${allocations[key] || ''}\n\nOpen your tasks:\n${window.location.origin}/my-tasks`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
  const sendPush = async () => {
    if (!notify) return;
    const keys = notify.host ? [notify.host] : allocationOrder.filter(id => (allocations[id] || '').trim());
    const hostIds = [...new Set(keys.map(k => hostOf(k)?.id).filter(Boolean))];
    if (!hostIds.length) { toast.error('Nobody is allocated on this round yet'); return; }
    const res = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Expiry & Refills', body: notify.msg, url: '/my-tasks', hostIds }) }).then(x => x.json()).catch(() => null);
    if (!res?.success) { toast.error('Notification failed'); return; }
    toast.success(`Sent to ${res.count ?? hostIds.length} device(s)`);
    setNotify(null);
  };

  /* ---------------- logs ---------------- */

  const markStatus = async (villa: string, status: 'Sent' | 'Refilled', silent = false) => {
    const log = logOf[villa]; if (!log) return false;
    const data = (log.removal_data || []).map((it: any) => ({ ...it, refilled_qty: sentQty(it) }));
    const { error } = await supabase.from('hsk_expiry_removals').update({ status, removal_data: data }).match({ villa_number: villa, month_period: selectedRound });
    if (error) { toast.error(`V${villa}: ${error.message}`); return false; }
    if (!silent) { toast.success(`V${villa} ${status === 'Sent' ? 'marked sent' : 'marked refilled'}`); fetchData(false); }
    return true;
  };
  const sendAll = async () => {
    const ok = await confirmAction({ title: `Mark all ${toSend.length} villas sent?`, message: 'Use this when everything on the pick list has gone out.', confirmText: 'Mark all sent', icon: 'question' });
    if (!ok) return;
    setIsSaving(true);
    const res = await Promise.all(toSend.map(r => markStatus(r.villa_number, 'Sent', true)));
    setIsSaving(false);
    toast.success(`${res.filter(Boolean).length} villas marked sent`);
    fetchData(false);
  };
  const deleteLog = async (villa: string) => {
    const ok = await confirmAction({ title: `Reset V${villa}?`, message: 'Deletes this villa’s log. It goes back to “Not checked” for the attendant.', confirmText: 'Reset', isDestructive: true });
    if (!ok) return;
    const { error } = await supabase.from('hsk_expiry_removals').delete().match({ villa_number: villa, month_period: selectedRound });
    if (error) toast.error('Could not reset: ' + error.message); else { toast.success(`V${villa} reset`); setVillaSheet(null); fetchData(false); }
  };
  const saveEditLog = async () => {
    if (!editLog) return;
    const { error } = editLog.status === 'Pending'
      ? await supabase.from('hsk_expiry_removals').delete().match({ villa_number: editLog.villa, month_period: selectedRound })
      : await supabase.from('hsk_expiry_removals').update({ status: editLog.status, removal_data: editLog.data }).match({ villa_number: editLog.villa, month_period: selectedRound });
    if (error) { toast.error('Could not update: ' + error.message); return; }
    toast.success(`V${editLog.villa} updated`);
    setEditLog(null); setVillaSheet(null); fetchData(false);
  };
  const copyPickList = async () => {
    const lines = [`Expiry refills · round of ${roundLabel(selectedRound)}`, '', ...pickList.map(p => `${p.qty}× ${p.name}`), '', ...toSend.map(r => `V${r.villa_number}: ${(r.removal_data || []).filter((i: any) => sentQty(i) > 0).map((i: any) => `${sentQty(i)} ${i.name}`).join(', ')}`)];
    try { await navigator.clipboard.writeText(lines.join('\n')); toast.success('Pick list copied'); } catch { toast.error('Could not copy'); }
  };

  if (!isMounted) return null;

  /* ================================================================== render */

  const isLive = selectedRound === activeRound;
  const pct = assignedTiles ? Math.round((checkedTiles / assignedTiles) * 100) : 0;
  const STEPS: { key: Step; n: string; label: string; icon: React.ElementType; badge?: number; warn?: boolean }[] = [
    { key: 'ITEMS', n: '1', label: 'Items', icon: Target, badge: targets.length },
    { key: 'VILLAS', n: '2', label: 'Villas', icon: Users, badge: allocationOrder.length },
    { key: 'PROGRESS', n: '3', label: 'Progress', icon: MapIcon, badge: checkedTiles },
    { key: 'SEND', n: '4', label: 'Send', icon: PackageCheck, badge: toSend.length, warn: toSend.length > 0 },
    { key: 'HISTORY', n: '', label: 'History', icon: History },
  ];

  const mapHosts = allocationOrder.filter(id => parseVillas(allocations[id] || '', dvList).some(isVillaToken));
  const tileVisible = (v: string) => mapFilter === 'ALL' || (owners[villaBase(v)] || []).includes(mapFilter);
  const zones = [
    { name: 'Jetty A', villas: JETTY_A }, { name: 'Jetty B', villas: JETTY_B }, { name: 'Jetty C', villas: JETTY_C }, { name: 'Beach', villas: BEACH },
  ];

  const sheetLog = villaSheet ? logOf[villaSheet] : null;
  const sheetStatus: VStatus = villaSheet ? statusOf(villaSheet) : 'Pending';

  return (
    <div className="min-h-screen bg-slate-50 pb-32 md:pb-12 text-slate-800">
      {/* ===== Header ===== */}
      <div className="bg-white border-b border-slate-200" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black text-[#6D2158] leading-tight">Expiry & Refills</h1>
              <p className="text-xs font-semibold text-slate-400">Remove expiring minibar items, villa by villa</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="relative flex-1 sm:flex-none">
                <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select value={selectedRound} onChange={e => switchRound(e.target.value)} aria-label="Removal round"
                  className="w-full sm:w-56 h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158]">
                  {rounds.map(k => <option key={k} value={k}>{roundLabel(k)}{k === activeRound ? ' · Live' : ''}</option>)}
                </select>
              </label>
              <button onClick={() => setNewRound({ open: true, date: getDhakaDateStr(), copyTargets: true, copyAlloc: false, makeLive: true })}
                className="h-10 px-3 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center gap-1.5 shrink-0">
                <CalendarPlus size={15} /> New round
              </button>
            </div>
          </div>

          {/* Round card */}
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Round</p>
                <p className="text-base font-black text-slate-800 leading-tight">{roundLabel(selectedRound)}</p>
              </div>
              {isLive ? (
                <button onClick={() => setOpen(isLocked)} className={`h-9 px-3 rounded-full text-xs font-black flex items-center gap-1.5 border ${isLocked ? 'bg-white border-slate-300 text-slate-600' : 'bg-emerald-50 border-emerald-300 text-emerald-700'}`}
                  title={isLocked ? 'Tap to open it on My Tasks' : 'Tap to close it on My Tasks'}>
                  {isLocked ? <Lock size={13} /> : <Radio size={13} className="animate-pulse" />} {isLocked ? 'Closed for staff · tap to open' : 'Open on My Tasks'}
                </button>
              ) : (
                <button onClick={() => makeLive(selectedRound)} className="h-9 px-3 rounded-full text-xs font-black flex items-center gap-1.5 border bg-white border-slate-300 text-slate-500 hover:border-[#6D2158] hover:text-[#6D2158]">
                  <Radio size={13} /> Not live{activeRound ? ` (live: ${roundLabel(activeRound)})` : ''} · make live
                </button>
              )}
            </div>
            <div className="flex-1 md:ml-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                <span>{checkedTiles} of {assignedTiles} villas checked</span>
                <span className="text-slate-400">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden flex">
                {(['Refilled', 'All OK', 'Sent', 'Removed'] as VStatus[]).map(s => counts[s] > 0 && (
                  <div key={s} className={STATUS[s].dot} style={{ width: `${(counts[s] / Math.max(1, assignedTiles)) * 100}%` }} />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold">
                <span className="text-amber-700">{counts.Removed} to send</span>
                <span className="text-violet-700">{counts.Sent} waiting confirmation</span>
                <span className="text-emerald-700">{counts.Refilled + counts['All OK']} done</span>
                {counts.Nobody > 0 && allocationOrder.length > 0 && <span className="text-slate-400">{counts.Nobody} with no attendant</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {STEPS.map(s => {
              const on = current === s.key;
              const Icon = s.icon;
              return (
                <button key={s.key} onClick={() => setStep(s.key)}
                  className={`shrink-0 h-11 px-3.5 flex items-center gap-2 text-sm font-black border-b-2 transition-colors ${on ? 'border-[#6D2158] text-[#6D2158]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  {s.n ? <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center ${on ? 'bg-[#6D2158] text-white' : 'bg-slate-100 text-slate-500'}`}>{s.n}</span> : <Icon size={15} />}
                  {s.label}
                  {s.badge !== undefined && s.badge > 0 && <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] leading-5 text-center ${s.warn ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{s.badge}</span>}
                  {s.key === 'VILLAS' && villaWarn > 0 && <AlertTriangle size={13} className="text-amber-500" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-4">
        {isLoading ? (
          <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>
        ) : current === 'ITEMS' ? (
          /* ===================== 1 ITEMS ===================== */
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <section className="bg-white rounded-2xl border border-slate-200">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-black text-slate-800">What to look for this round</h2>
                <p className="text-xs font-semibold text-slate-400">Shown to the attendants on My Tasks</p>
              </div>
              <div className="divide-y divide-slate-100">
                {targets.length === 0 && <p className="px-4 py-10 text-center text-sm font-semibold text-slate-400">Nothing yet. Add batches or items on the right.</p>}
                {[...targets].sort((a, b) => String(a.article_name).localeCompare(String(b.article_name))).map(t => {
                  const kind = t.expiry_date === 'REFILL' ? 'refill' : isBatchDate(t.expiry_date) ? 'batch' : 'missing';
                  const days = kind === 'batch' ? differenceInCalendarDays(parseISO(t.expiry_date), new Date()) : 0;
                  return (
                    <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{t.article_name}</p>
                        {kind === 'batch' && <p className={`text-xs font-bold ${days < 0 ? 'text-rose-600' : days <= 30 ? 'text-amber-700' : 'text-slate-500'}`}>Expires {fmtDate(t.expiry_date)}{days < 0 ? ' · expired' : days === 0 ? ' · today' : ` · ${days} days`}</p>}
                        {kind === 'missing' && <p className="text-xs font-bold text-sky-700">Missing check</p>}
                        {kind === 'refill' && <p className="text-xs font-bold text-emerald-700">Refill task</p>}
                      </div>
                      {kind === 'batch' && <button onClick={() => archiveBatch(t)} className="h-9 px-2.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-1" title="Archive this batch for future rounds"><Archive size={13} /> Archive</button>}
                      <button onClick={() => removeTarget(t.id)} className="w-9 h-9 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center" aria-label="Remove"><Trash2 size={15} /></button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200">
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <div className="flex p-0.5 rounded-xl bg-slate-100">
                  {([['BATCHES', 'Expiry batches'], ['CATALOG', 'Missing / refill']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setAddMode(k)} className={`h-8 px-3 rounded-lg text-xs font-black ${addMode === k ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500'}`}>{l}</button>
                  ))}
                </div>
                {addMode === 'BATCHES' && availableBatches.length > 0 && (
                  <button onClick={addSoonBatches} className="ml-auto h-8 px-3 rounded-lg bg-rose-50 text-rose-700 text-xs font-black flex items-center gap-1"><Sparkles size={13} /> Add all ≤ 60 days</button>
                )}
              </div>

              {addMode === 'BATCHES' ? (
                <>
                  {/* Track a new batch date (same list as Expiry Control) */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <p className="text-xs font-black text-slate-500 mb-2">Track a new batch</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        {newBatch.item ? (
                          <button onClick={() => setNewBatch(n => ({ ...n, item: null }))} className="w-full h-10 px-3 rounded-xl bg-white border border-slate-300 text-left text-sm font-bold flex items-center justify-between gap-2">
                            <span className="truncate">{newBatch.item.generic_name || newBatch.item.article_name}</span> <X size={14} className="text-slate-400 shrink-0" />
                          </button>
                        ) : (
                          <>
                            <input value={newBatch.q} onChange={e => setNewBatch(n => ({ ...n, q: e.target.value }))} placeholder="Item…" className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                            {newBatch.q.trim() && (
                              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl max-h-56 overflow-y-auto">
                                {catalog.filter(c => c.has_expiry && `${c.article_name} ${c.generic_name || ''} ${c.article_number}`.toLowerCase().includes(newBatch.q.toLowerCase())).slice(0, 20).map(c => (
                                  <button key={c.article_number} onClick={() => setNewBatch(n => ({ ...n, item: c, q: '' }))} className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-slate-50">{c.generic_name || c.article_name}</button>
                                ))}
                                {!catalog.some(c => c.has_expiry && `${c.article_name} ${c.generic_name || ''} ${c.article_number}`.toLowerCase().includes(newBatch.q.toLowerCase())) && <p className="px-3 py-3 text-xs font-semibold text-slate-400">No item with expiry tracking. Turn it on in Settings.</p>}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <input type="date" value={newBatch.date} onChange={e => setNewBatch(n => ({ ...n, date: e.target.value }))} className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" aria-label="Expiry date" />
                      <button onClick={trackBatch} className="h-10 px-4 rounded-xl bg-slate-800 text-white text-xs font-black flex items-center justify-center gap-1"><Plus size={14} /> Save</button>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                    {availableBatches.length === 0 && <p className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No other tracked batches.</p>}
                    {availableBatches.map(b => {
                      const days = differenceInCalendarDays(parseISO(b.expiry_date), new Date());
                      return (
                        <div key={b.id} className="px-4 py-2.5 flex items-center gap-3">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${days < 0 ? 'bg-rose-500' : days <= 60 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800 truncate">{b.article_name}</p>
                            <p className="text-xs font-semibold text-slate-500">{fmtDate(b.expiry_date)} · {days < 0 ? `expired ${-days}d ago` : days === 0 ? 'expires today' : `${days} days left`}</p>
                          </div>
                          <button onClick={() => untrackBatch(b)} className="w-9 h-9 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center" aria-label="Stop tracking"><Trash2 size={14} /></button>
                          <button onClick={() => addBatchTarget(b)} className="h-9 px-3 rounded-lg bg-[#6D2158] text-white text-xs font-black flex items-center gap-1"><Plus size={14} /> Add</button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-slate-100">
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Search minibar items" className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                    {!itemSearch.trim() && <p className="px-4 py-10 text-center text-sm font-semibold text-slate-400">Search an item to add a <b>missing check</b> or a <b>refill task</b>.</p>}
                    {itemSearch.trim() && catalog.filter(c => c.is_minibar_item && `${c.article_name} ${c.generic_name || ''} ${c.article_number}`.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 40).map(c => {
                      const hasM = targets.some(t => t.article_number === c.article_number && (!t.expiry_date || t.expiry_date === 'MISSING'));
                      const hasR = targets.some(t => t.article_number === c.article_number && t.expiry_date === 'REFILL');
                      return (
                        <div key={c.article_number} className="px-4 py-2.5 flex items-center gap-2">
                          <p className="flex-1 min-w-0 text-sm font-bold text-slate-800 truncate">{c.generic_name || c.article_name}</p>
                          <button disabled={hasM} onClick={() => addCatalogTarget(c, 'MISSING')} className="h-9 px-3 rounded-lg bg-sky-50 text-sky-700 text-xs font-black disabled:opacity-40">{hasM ? 'Added' : '+ Missing'}</button>
                          <button disabled={hasR} onClick={() => addCatalogTarget(c, 'REFILL')} className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black disabled:opacity-40">{hasR ? 'Added' : '+ Refill'}</button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </div>
        ) : current === 'VILLAS' ? (
          /* ===================== 2 VILLAS ===================== */
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col lg:flex-row gap-2 lg:items-center">
              <div className="flex items-stretch rounded-xl overflow-hidden border border-purple-200">
                <input type="date" value={autoFillDate} onChange={e => setAutoFillDate(e.target.value)} className="px-3 h-10 bg-purple-50 text-[#6D2158] text-sm font-bold outline-none flex-1" aria-label="Board date" />
                <button onClick={autoFill} className="px-3 h-10 bg-purple-100 text-[#6D2158] text-xs font-black flex items-center gap-1.5 border-l border-purple-200 whitespace-nowrap"><Sparkles size={14} /> Fill from board</button>
              </div>
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={hostSearch} onChange={e => setHostSearch(e.target.value)} placeholder="Add an attendant by name or SSL" className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                {hostSearch.trim() && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl max-h-64 overflow-y-auto">
                    {hosts.filter(h => !allocationOrder.some(id => id === h.id || id === h.host_id))
                      .filter(h => `${h.full_name} ${h.nicknames || ''} ${h.host_id}`.toLowerCase().includes(hostSearch.toLowerCase()))
                      .sort((a, b) => (/villa|room att/i.test(`${a.sub_department} ${a.role}`) ? 0 : 1) - (/villa|room att/i.test(`${b.sub_department} ${b.role}`) ? 0 : 1))
                      .slice(0, 20).map(h => (
                        <button key={h.id} onClick={() => addHost(h)} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                          <span className="block text-sm font-bold text-slate-800">{h.full_name}</span>
                          <span className="block text-xs font-semibold text-slate-400">{h.host_id} · {h.role}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setNotify({ host: '', name: '', msg: 'Please check your assigned villas for expiring minibar items. Open My Tasks.' })} className="flex-1 lg:flex-none h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-black text-blue-600 flex items-center justify-center gap-1.5"><Bell size={14} /> Notify all</button>
                <button onClick={saveAllocations} disabled={isSaving || !allocDirty} className={`flex-1 lg:flex-none h-10 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 ${allocDirty ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {allocDirty ? 'Save changes' : 'Saved'}
                </button>
              </div>
            </div>

            {allocationOrder.length > 0 && coverage.notVilla.length > 0 && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <p className="flex-1 text-sm font-bold text-rose-700"><AlertTriangle size={14} className="inline -mt-0.5 mr-1" />{coverage.notVilla.length} not villa attendants (no villa numbers): <span className="font-semibold">{coverage.notVilla.map(id => `${nameOf(id)} (${allocations[id]})`).join(', ')}</span></p>
                <button onClick={() => removeHosts(coverage.notVilla)} className="shrink-0 h-9 px-3 rounded-lg bg-rose-600 text-white text-xs font-black">Remove them</button>
              </div>
            )}
            {allocationOrder.length > 0 && coverage.uncovered.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-bold text-amber-800"><AlertTriangle size={14} className="inline -mt-0.5 mr-1" />{coverage.uncovered.length} villas have nobody</p>
                <p className="mt-1 text-xs font-bold text-amber-700 leading-relaxed">{coverage.uncovered.map(v => `V${v}`).join(' · ')}</p>
                <p className="mt-1 text-xs font-semibold text-amber-700/80">Add their attendant below, or fill from another day&apos;s board to pick up who was off.</p>
              </div>
            )}
            {coverage.doubles.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800"><AlertTriangle size={14} className="inline -mt-0.5 mr-1" />Given to two people: {coverage.doubles.map(d => `V${d.villa} (${d.ids.map(nameOf).join(' & ')})`).join(', ')}</div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {allocationOrder.length === 0 && <p className="px-4 py-12 text-center text-sm font-semibold text-slate-400">No attendants yet. <b>Fill from board</b> takes the villa attendants and their villas from a day&apos;s allocation.</p>}
              {allocationOrder.map(id => {
                const h = hostOf(id);
                const n = parseVillas(allocations[id] || '', dvList).filter(isVillaToken).length;
                const bad = coverage.notVilla.includes(id);
                return (
                  <div key={id} className={`px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 ${bad ? 'bg-rose-50/50' : ''}`}>
                    <div className="sm:w-52 shrink-0 flex items-center gap-2.5">
                      {h?.image_url ? <img src={h.image_url} alt="" className="w-9 h-9 rounded-full object-cover" /> : <span className="w-9 h-9 rounded-full bg-[#6D2158]/10 text-[#6D2158] text-sm font-black flex items-center justify-center">{nameOf(id).charAt(0)}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-slate-800 truncate">{h?.full_name || 'Unknown'}</p>
                        <p className="text-xs font-semibold text-slate-400">{h?.host_id || ''} · {n} villa{n === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex sm:hidden gap-1">
                        <button onClick={() => sendWhatsApp(id)} className="w-9 h-9 rounded-lg text-emerald-600 bg-emerald-50 flex items-center justify-center" aria-label="WhatsApp"><MessageCircle size={15} /></button>
                        <button onClick={() => setNotify({ host: id, name: h?.full_name || '', msg: 'Please check your assigned villas for expiring minibar items. Open My Tasks.' })} className="w-9 h-9 rounded-lg text-blue-500 bg-blue-50 flex items-center justify-center" aria-label="Notify"><Bell size={15} /></button>
                        <button onClick={() => removeHosts([id])} className="w-9 h-9 rounded-lg text-slate-400 bg-slate-50 flex items-center justify-center" aria-label="Remove"><Trash2 size={15} /></button>
                      </div>
                    </div>
                    <div className="flex-1"><VillaTagInput value={allocations[id] || ''} onChange={v => setVillas(id, v)} /></div>
                    <div className="hidden sm:flex gap-1">
                      <button onClick={() => sendWhatsApp(id)} className="w-9 h-9 rounded-lg text-emerald-600 hover:bg-emerald-50 flex items-center justify-center" title="Send villas on WhatsApp"><MessageCircle size={15} /></button>
                      <button onClick={() => setNotify({ host: id, name: h?.full_name || '', msg: 'Please check your assigned villas for expiring minibar items. Open My Tasks.' })} className="w-9 h-9 rounded-lg text-blue-500 hover:bg-blue-50 flex items-center justify-center" title="Push notification"><Bell size={15} /></button>
                      <button onClick={() => removeHosts([id])} className="w-9 h-9 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center" title="Remove"><Trash2 size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : current === 'PROGRESS' ? (
          /* ===================== 3 PROGRESS (villa map) ===================== */
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col md:flex-row md:items-center gap-3">
              <select value={mapFilter} onChange={e => setMapFilter(e.target.value)} className="h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none md:w-60" aria-label="Attendant">
                <option value="ALL">All attendants</option>
                {mapHosts.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
              </select>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {LEGEND.map(s => (
                  <span key={s} className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><span className={`w-3 h-3 rounded ${STATUS[s].dot}`} /> {STATUS[s].label} <span className="text-slate-400">{counts[s]}</span></span>
                ))}
              </div>
            </div>
            {zones.map(z => {
              const tiles = villaTiles.filter(v => z.villas.includes(+villaBase(v))).filter(tileVisible);
              if (!tiles.length) return null;
              return (
                <section key={z.name} className="bg-white rounded-2xl border border-slate-200 p-3">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-wide mb-2">{z.name}</h3>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5">
                    {tiles.map(v => {
                      const st = statusOf(v);
                      const own = owners[villaBase(v)] || [];
                      return (
                        <button key={v} onClick={() => setVillaSheet(v)} title={`V${v} · ${STATUS[st].label}${own.length ? ` · ${own.map(nameOf).join(' & ')}` : ''}`}
                          className={`h-14 rounded-xl border-2 flex flex-col items-center justify-center active:scale-95 ${STATUS[st].tile}`}>
                          <span className="text-base font-black leading-none">{v.replace('-', '·')}</span>
                          <span className="text-[10px] font-bold leading-none mt-1 opacity-80 truncate max-w-[50px]">{own.length ? nameOf(own[0]).split(' ')[0] : '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : current === 'SEND' ? (
          /* ===================== 4 SEND ===================== */
          <div className="space-y-4">
            {toSend.length === 0 && waiting.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
                <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-sm font-black text-slate-700">Nothing to send</p>
                <p className="text-xs font-semibold text-slate-400 mt-1">Villas appear here when an attendant records removals.</p>
              </div>
            )}

            {toSend.length > 0 && (
              <>
                <section className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <h2 className="text-sm font-black text-amber-900 flex-1">Pick list · {toSend.length} villa{toSend.length === 1 ? '' : 's'}</h2>
                    <button onClick={copyPickList} className="h-9 px-3 rounded-lg bg-white border border-amber-200 text-amber-800 text-xs font-black flex items-center gap-1.5"><Copy size={13} /> Copy</button>
                    <button onClick={sendAll} disabled={isSaving} className="h-9 px-3 rounded-lg bg-violet-600 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50">{isSaving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Mark all sent</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pickList.map(p => <span key={p.name} className="px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-sm font-black text-slate-800"><span className="text-amber-700">{p.qty}×</span> {p.name}</span>)}
                  </div>
                </section>
                <section className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                  {toSend.map(r => (
                    <div key={r.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex items-center gap-3 sm:w-48 shrink-0">
                        <span className="w-12 h-12 rounded-xl bg-amber-400 text-slate-900 text-lg font-black flex items-center justify-center">{String(r.villa_number).replace('-', '·')}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800 truncate">{r.host_name || '—'}</p>
                          <p className="text-xs font-semibold text-slate-400">{r.logged_at ? format(new Date(r.logged_at), 'dd MMM, HH:mm') : ''}</p>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-wrap gap-1.5">
                        {(r.removal_data || []).map((it: any) => (
                          <span key={it.article_number} className={`px-2 py-1 rounded-lg text-xs font-bold ${sentQty(it) !== it.qty ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
                            {sentQty(it)}× {it.name}{sentQty(it) !== it.qty ? ` (removed ${it.qty})` : ''}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => setEditLog({ villa: r.villa_number, status: r.status, data: JSON.parse(JSON.stringify(r.removal_data || [])) })} className="h-10 px-3 rounded-xl bg-slate-100 text-slate-600 text-xs font-black flex items-center gap-1"><Edit3 size={13} /> Qty</button>
                        <button onClick={() => markStatus(r.villa_number, 'Sent')} className="flex-1 sm:flex-none h-10 px-4 rounded-xl bg-violet-600 text-white text-xs font-black flex items-center justify-center gap-1.5"><Send size={13} /> Mark sent</button>
                      </div>
                    </div>
                  ))}
                </section>
              </>
            )}

            {waiting.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-black text-slate-800">Sent, waiting for the attendant to confirm · {waiting.length}</h2>
                  <p className="text-xs font-semibold text-slate-400">They confirm on My Tasks once the items are in the villa</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {waiting.map(r => (
                    <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-violet-600 text-white font-black flex items-center justify-center shrink-0">{String(r.villa_number).replace('-', '·')}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{r.host_name || '—'}</p>
                        <p className="text-xs font-semibold text-slate-400 truncate">{(r.removal_data || []).map((it: any) => `${sentQty(it)} ${it.name}`).join(', ')}</p>
                      </div>
                      <button onClick={() => markStatus(r.villa_number, 'Refilled')} className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black flex items-center gap-1 shrink-0" title="Confirm for the attendant"><CheckCircle2 size={13} /> Refilled</button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          /* ===================== HISTORY ===================== */
          <section className="bg-white rounded-2xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-black text-slate-800">Totals for {roundLabel(selectedRound)}</h2>
              <p className="text-xs font-semibold text-slate-400">Everything removed this round, and how much went back in</p>
            </div>
            {summary.length === 0 ? <p className="px-4 py-12 text-center text-sm font-semibold text-slate-400">No removals recorded yet.</p> : (
              <div className="divide-y divide-slate-100">
                {summary.map(s => (
                  <div key={s.name} className="px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">{s.name}</p>
                      <p className="text-xs font-semibold text-slate-400">{s.batch === 'REFILL' ? 'Refill task' : isBatchDate(s.batch) ? `Batch ${fmtDate(s.batch, 'MMM yyyy')}` : 'Missing check'}</p>
                    </div>
                    <div className="text-center"><p className="text-lg font-black text-rose-600 leading-none">{s.removed}</p><p className="text-[11px] font-bold text-slate-400">removed</p></div>
                    <div className="text-center"><p className={`text-lg font-black leading-none ${s.refilled < s.removed ? 'text-amber-600' : 'text-emerald-600'}`}>{s.refilled}</p><p className="text-[11px] font-bold text-slate-400">refilled</p></div>
                    <p className="col-span-3 text-xs font-semibold text-slate-500 leading-relaxed">{s.villas.map(v => `V${v.villa} (${v.qty})`).join(' · ')}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ===== Villa sheet ===== */}
      {villaSheet && (
        <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setVillaSheet(null)} />
          <div className="relative w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center gap-3">
              <span className={`w-12 h-12 rounded-2xl border-2 text-lg font-black flex items-center justify-center ${STATUS[sheetStatus].tile}`}>{villaSheet.replace('-', '·')}</span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-black text-slate-800">Villa {villaSheet}</p>
                <p className="text-xs font-bold text-slate-400 truncate">{STATUS[sheetStatus].label} · {(owners[villaBase(villaSheet)] || []).map(nameOf).join(' & ') || 'No attendant'}</p>
              </div>
              <button onClick={() => setVillaSheet(null)} className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {!sheetLog && <p className="py-6 text-center text-sm font-semibold text-slate-400">{sheetStatus === 'Nobody' ? 'Nobody is checking this villa. Add it on step 2 (Villas).' : 'Not checked yet.'}</p>}
              {sheetLog && sheetStatus === 'All OK' && <p className="py-6 text-center text-sm font-bold text-emerald-700"><CheckCircle2 size={20} className="mx-auto mb-1" /> Nothing found</p>}
              {sheetLog && (sheetLog.removal_data || []).map((it: any) => (
                <div key={it.article_number} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-50">
                  <span className="text-sm font-bold text-slate-700">{it.name}</span>
                  <span className="text-sm font-black text-slate-800 shrink-0">{it.qty} removed{sheetStatus !== 'Removed' && <span className={sentQty(it) < it.qty ? 'text-amber-600' : 'text-emerald-600'}> · {sentQty(it)} back</span>}</span>
                </div>
              ))}
              {sheetLog?.logged_at && <p className="text-xs font-semibold text-slate-400 pt-1">Logged by {sheetLog.host_name || '—'} · {format(new Date(sheetLog.logged_at), 'dd MMM, HH:mm')}</p>}
            </div>
            {sheetLog && (
              <div className="px-5 py-3 border-t border-slate-100 grid grid-cols-3 gap-2">
                <button onClick={() => deleteLog(villaSheet)} className="h-11 rounded-xl bg-rose-50 text-rose-600 text-xs font-black flex items-center justify-center gap-1"><Trash2 size={14} /> Reset</button>
                <button onClick={() => setEditLog({ villa: villaSheet, status: sheetLog.status, data: JSON.parse(JSON.stringify(sheetLog.removal_data || [])) })} className="h-11 rounded-xl bg-slate-100 text-slate-700 text-xs font-black flex items-center justify-center gap-1"><Edit3 size={14} /> Edit</button>
                {sheetStatus === 'Removed' ? <button onClick={async () => { if (await markStatus(villaSheet, 'Sent')) setVillaSheet(null); }} className="h-11 rounded-xl bg-violet-600 text-white text-xs font-black flex items-center justify-center gap-1"><Send size={14} /> Sent</button>
                  : sheetStatus === 'Sent' ? <button onClick={async () => { if (await markStatus(villaSheet, 'Refilled')) setVillaSheet(null); }} className="h-11 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-1"><CheckCircle2 size={14} /> Refilled</button>
                  : <span />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Edit log ===== */}
      {editLog && (
        <div className="fixed inset-0 z-[1010] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setEditLog(null)} />
          <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div><p className="text-base font-black text-slate-800">Villa {editLog.villa}</p><p className="text-xs font-bold text-slate-400">Status and quantities to send</p></div>
              <button onClick={() => setEditLog(null)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Close"><X size={16} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              <select value={editLog.status} onChange={e => setEditLog({ ...editLog, status: e.target.value })} className="w-full h-11 px-3 rounded-xl bg-white border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]">
                <option value="All OK">Nothing found</option>
                <option value="Removed">To send</option>
                <option value="Sent">Sent, waiting confirmation</option>
                <option value="Refilled">Refilled</option>
                <option value="Pending">Reset (delete the log)</option>
              </select>
              {editLog.status !== 'Pending' && editLog.status !== 'All OK' && editLog.data.map((it: any, i: number) => {
                const val = sentQty(it);
                const set = (n: number) => { const d = [...editLog.data]; d[i] = { ...it, refilled_qty: Math.max(0, n), qty_edited: true }; setEditLog({ ...editLog, data: d }); };
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <div className="flex-1 min-w-0"><p className="text-sm font-bold text-slate-800 truncate">{it.name}</p><p className="text-xs font-semibold text-slate-400">Removed {it.qty} · send</p></div>
                    <button onClick={() => set(val - 1)} className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-center" aria-label="Less"><Minus size={14} /></button>
                    <span className="w-6 text-center text-base font-black">{val}</span>
                    <button onClick={() => set(val + 1)} className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-center" aria-label="More"><Plus size={14} /></button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-slate-100">
              <button onClick={saveEditLog} className={`w-full h-12 rounded-xl text-white text-sm font-black ${editLog.status === 'Pending' ? 'bg-rose-600' : 'bg-[#6D2158]'}`}>{editLog.status === 'Pending' ? 'Reset villa' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== New round ===== */}
      {newRound.open && (
        <div className="fixed inset-0 z-[1010] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setNewRound(n => ({ ...n, open: false }))} />
          <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-base font-black text-slate-800 flex items-center gap-2"><CalendarPlus size={18} className="text-[#6D2158]" /> New removal round</p>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">There can be more than one in a month.</p>
              </div>
              <button onClick={() => setNewRound(n => ({ ...n, open: false }))} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Close"><X size={16} /></button>
            </div>
            <label className="block text-xs font-black text-slate-500 mb-1.5">Removal date</label>
            <input type="date" value={newRound.date} onChange={e => setNewRound(n => ({ ...n, date: e.target.value }))} className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
            <div className="mt-4 space-y-3">
              {([
                ['copyTargets', `Copy the items from ${roundLabel(selectedRound) || 'this round'}`],
                ['copyAlloc', 'Copy the attendants & villas too'],
                ['makeLive', 'Make it live on My Tasks now'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-start gap-2.5 text-sm font-semibold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={newRound[k]} onChange={e => setNewRound(n => ({ ...n, [k]: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-[#6D2158]" />
                  {label}
                </label>
              ))}
            </div>
            {newRound.makeLive && activeRound && <p className="mt-3 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2.5">Staff will stop seeing {roundLabel(activeRound)}. Its logs stay under that round.</p>}
            <button onClick={createRound} disabled={isSaving} className="w-full mt-5 h-12 rounded-xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />} Create round
            </button>
          </div>
        </div>
      )}

      {/* ===== Notify ===== */}
      {notify && (
        <div className="fixed inset-0 z-[1010] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setNotify(null)} />
          <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-5">
            <p className="text-base font-black text-slate-800">{notify.host ? `Notify ${notify.name}` : `Notify all ${allocationOrder.length} attendants on this round`}</p>
            <p className="text-xs font-semibold text-slate-400 mb-3">Push notification, opens My Tasks</p>
            <textarea value={notify.msg} onChange={e => setNotify({ ...notify, msg: e.target.value })} className="w-full h-28 p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold outline-none focus:border-[#6D2158] resize-none" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setNotify(null)} className="flex-1 h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-black">Cancel</button>
              <button onClick={sendPush} className="flex-[1.5] h-11 rounded-xl bg-blue-600 text-white text-sm font-black flex items-center justify-center gap-1.5"><Send size={14} /> Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

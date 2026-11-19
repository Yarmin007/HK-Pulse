"use client";
// Pantry Request — a villa attendant (or the PA on duty) ticks what their pantry needs. No quantities.
// Goes on the pantry's list for its supply day; "urgent" puts it on an extra list for today.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Plus, Send, X, Zap, PackageCheck, Truck, CalendarDays, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr } from '@/lib/dateUtils';
import {
  PANTRIES, pantryShort, pantryOfVilla, loadSupplyDays, isSupplyDay, nextSupplyDate, supplyDaysLabel,
  loadPantryItems, getOrCreateRequest, isMissingTable, SupplyDays, PantryItem, PantryRequest, PantryLine,
} from '@/lib/pantrySupply';

type Me = { id: string; full_name: string; host_id: string };
const niceDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function PantryRequestPage() {
  const today = getDhakaDateStr();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [days, setDays] = useState<SupplyDays>({});
  const [items, setItems] = useState<PantryItem[]>([]);
  const [myPantries, setMyPantries] = useState<string[]>([]);
  const [pantry, setPantry] = useState<string>('');
  const [urgent, setUrgent] = useState(false);
  const [request, setRequest] = useState<PantryRequest | null>(null);
  const [lines, setLines] = useState<PantryLine[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [sending, setSending] = useState(false);

  // Which list this goes on: today if it's the supply day (or urgent), else the next supply day
  const supplyToday = pantry ? isSupplyDay(days, pantry, today) : false;
  const next = pantry ? nextSupplyDate(days, pantry, today) : null;
  const kind: 'Scheduled' | 'Extra' = urgent || !next ? 'Extra' : 'Scheduled';
  const targetDate = kind === 'Extra' ? today : (supplyToday ? today : next!);

  // Who am I and where do I work today
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('hk_pulse_session') || 'null');
      if (!s?.id) { window.location.href = '/'; return; }
      setMe({ id: s.id, full_name: s.full_name, host_id: s.host_id || s.id });
    } catch { window.location.href = '/'; }
  }, []);

  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        const [d, it, alloc] = await Promise.all([
          loadSupplyDays(),
          loadPantryItems(true),
          supabase.from('hsk_allocations').select('area, task_details').eq('report_date', today).eq('host_id', me.id),
        ]);
        setDays(d); setItems(it);
        const villas = (alloc.data || []).filter((a: any) => a.area === 'villa').flatMap((a: any) => String(a.task_details || '').split(','));
        const mine = [...new Set(villas.map(v => pantryOfVilla(v.trim())).filter(Boolean) as string[])];
        setMyPantries(mine);
        setPantry(p => p || mine[0] || '');
      } catch (err) {
        if (isMissingTable(err)) setMissing(true); else toast.error('Could not load');
      } finally { setLoading(false); }
    })();
  }, [me, today]);

  const loadList = useCallback(async () => {
    if (!pantry || !targetDate) { setRequest(null); setLines([]); return; }
    const { data } = await supabase.from('hsk_pantry_requests').select('*, lines:hsk_pantry_request_lines(*)').match({ pantry, supply_date: targetDate, kind }).maybeSingle();
    setRequest((data as PantryRequest) || null);
    setLines(((data as PantryRequest)?.lines || []) as PantryLine[]);
  }, [pantry, targetDate, kind]);
  useEffect(() => { setPicked(new Set()); setCustom([]); loadList(); }, [loadList]);

  const onList = useMemo(() => { const m = new Map<string, PantryLine>(); lines.forEach(l => { if (l.item_id) m.set(l.item_id, l); }); return m; }, [lines]);
  const groups = useMemo(() => {
    const g: Record<string, PantryItem[]> = {};
    items.forEach(i => { (g[i.category || 'General'] ||= []).push(i); });
    return Object.entries(g);
  }, [items]);
  const locked = !!request && (request.status === 'With runner' || request.status === 'Delivered');
  const count = picked.size + custom.length;

  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addCustom = () => {
    const t = customText.trim();
    if (!t) return;
    if (custom.some(c => c.toLowerCase() === t.toLowerCase())) { setCustomText(''); return; }
    setCustom(c => [...c, t]); setCustomText('');
  };
  const removeMine = async (l: PantryLine) => {
    const { error } = await supabase.from('hsk_pantry_request_lines').delete().eq('id', l.id);
    if (error) toast.error('Could not remove'); else loadList();
  };

  const send = async () => {
    if (!me || !pantry || !count) return;
    if (locked) { toast.error('This list has already gone out. Tick "Urgent" to send an extra list.'); return; }
    setSending(true);
    try {
      const req = await getOrCreateRequest(pantry, targetDate, kind);
      if (req.status === 'With runner' || req.status === 'Delivered') { toast.error('This list just went out. Tick "Urgent" to send an extra list.'); loadList(); return; }
      const { data: existing } = await supabase.from('hsk_pantry_request_lines').select('item_id, name').eq('request_id', req.id);
      const haveIds = new Set((existing || []).map((x: any) => x.item_id).filter(Boolean));
      const haveNames = new Set((existing || []).map((x: any) => String(x.name).toLowerCase()));
      const by = { requested_by_id: me.id, requested_by_name: me.full_name };
      const rows = [
        ...[...picked].filter(id => !haveIds.has(id)).map(id => { const it = items.find(i => i.id === id)!; return { request_id: req.id, item_id: id, name: it.name, is_custom: false, ...by }; }),
        ...custom.filter(c => !haveNames.has(c.toLowerCase())).map(c => ({ request_id: req.id, item_id: null, name: c, is_custom: true, ...by })),
      ];
      if (rows.length) {
        const { error } = await supabase.from('hsk_pantry_request_lines').insert(rows);
        if (error) throw error;
      }
      // Packed already? New items reopen it so the store sees them
      if (req.status === 'Packed' && rows.length) await supabase.from('hsk_pantry_requests').update({ status: 'Open' }).eq('id', req.id);
      toast.success(rows.length ? `Sent ${rows.length} item${rows.length === 1 ? '' : 's'} for ${pantryShort(pantry)}` : 'Already on the list');
      setPicked(new Set()); setCustom([]);
      loadList();
    } catch (err) {
      toast.error(isMissingTable(err) ? 'Pantry Supply is not set up yet' : 'Could not send: ' + ((err as Error)?.message || 'error'));
    } finally { setSending(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>;
  if (missing) return <div className="min-h-[60vh] flex items-center justify-center p-6 text-center"><p className="text-sm font-bold text-slate-500">Pantry Supply is not set up yet. Ask the coordinator.</p></div>;

  const statusLine = request && request.status !== 'Open' && (
    <div className={`rounded-2xl p-3 flex items-center gap-2.5 text-sm font-bold ${request.status === 'Delivered' ? 'bg-emerald-50 text-emerald-800' : request.status === 'With runner' ? 'bg-violet-50 text-violet-800' : 'bg-sky-50 text-sky-800'}`}>
      {request.status === 'Delivered' ? <Check size={16} /> : request.status === 'With runner' ? <Truck size={16} /> : <PackageCheck size={16} />}
      {request.status === 'Packed' && 'Packed at the store, waiting for a runner'}
      {request.status === 'With runner' && `On the way with ${request.runner_name || 'the runner'}`}
      {request.status === 'Delivered' && 'Delivered to the pantry'}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-40">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/my-tasks" className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Back"><ArrowLeft size={18} /></Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-[#6D2158] leading-tight">Pantry Request</h1>
            <p className="text-xs font-semibold text-slate-400">Tick what the pantry needs</p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
          {PANTRIES.map(p => (
            <button key={p} onClick={() => setPantry(p)} className={`shrink-0 h-10 px-3.5 rounded-xl text-sm font-black border ${pantry === p ? 'bg-[#6D2158] border-[#6D2158] text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
              {pantryShort(p)}{myPantries.includes(p) && <span className={`ml-1.5 text-[10px] ${pantry === p ? 'text-white/70' : 'text-[#6D2158]'}`}>mine</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {!pantry ? (
          <p className="py-16 text-center text-sm font-bold text-slate-400">Choose your pantry above.</p>
        ) : (
          <>
            {/* Which list */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kind === 'Extra' ? 'bg-rose-50 text-rose-600' : 'bg-[#6D2158]/10 text-[#6D2158]'}`}>{kind === 'Extra' ? <Zap size={18} /> : <CalendarDays size={18} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-800">
                    {kind === 'Extra' ? `Urgent list for today (${niceDate(today)})` : supplyToday ? 'Today is the supply day' : `Goes on the ${niceDate(targetDate)} list`}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">{pantryShort(pantry)} supply day: {supplyDaysLabel(days, pantry)}</p>
                </div>
              </div>
              {next && (
                <label className="mt-3 flex items-center gap-2.5 text-sm font-bold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="w-4 h-4 accent-rose-600" />
                  Urgent: needed today{supplyToday ? ' (after the supply list went out)' : ''}
                </label>
              )}
            </div>

            {statusLine}

            {/* Already on the list */}
            {lines.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black text-slate-500 mb-2">Already on this list · {lines.length}</p>
                <div className="flex flex-wrap gap-1.5">
                  {lines.map(l => (
                    <span key={l.id} className={`inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1.5 rounded-xl text-xs font-bold ${l.status === 'Not available' ? 'bg-rose-50 text-rose-600 line-through' : l.status === 'Packed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`} title={l.requested_by_name ? `Asked by ${l.requested_by_name}` : ''}>
                      {l.status === 'Packed' && <Check size={12} />}{l.name}
                      {l.requested_by_id === me?.id && l.status === 'Needed' && !locked && request?.status === 'Open' && (
                        <button onClick={() => removeMine(l)} className="p-0.5 text-slate-400 hover:text-rose-500" aria-label={`Remove ${l.name}`}><X size={12} /></button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {locked ? (
              <p className="text-center text-sm font-bold text-slate-500 py-4">This list has gone out. Need something more? Tick <b>Urgent</b> above.</p>
            ) : (
              <>
                {items.length === 0 && <p className="text-center text-sm font-semibold text-slate-400 py-6">The item list is empty. Use “Something else” below.</p>}
                {groups.map(([cat, list]) => (
                  <section key={cat}>
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-wide mb-2">{cat}</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {list.map(it => {
                        const already = onList.get(it.id);
                        const on = picked.has(it.id);
                        return (
                          <button key={it.id} disabled={!!already} onClick={() => toggle(it.id)}
                            className={`relative rounded-2xl border-2 p-2 flex flex-col items-center text-center active:scale-95 transition-all ${already ? 'bg-slate-50 border-slate-200 opacity-60' : on ? 'bg-[#6D2158]/5 border-[#6D2158]' : 'bg-white border-slate-200'}`}>
                            {(on || already) && <span className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center ${already ? 'bg-slate-400' : 'bg-[#6D2158]'} text-white`}><Check size={12} /></span>}
                            <span className="w-full aspect-square rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden">
                              {it.image_url ? <img src={it.image_url} alt="" className="w-full h-full object-contain p-1.5" /> : <Package size={22} className="text-slate-300" />}
                            </span>
                            <span className="mt-1.5 text-xs font-black text-slate-800 leading-tight line-clamp-2">{it.name}</span>
                            {already && <span className="text-[10px] font-bold text-slate-400 truncate max-w-full">on list</span>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}

                <section className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-black text-slate-500 mb-2">Something else</p>
                  <div className="flex gap-2">
                    <input value={customText} onChange={e => setCustomText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                      placeholder="Type an item not in the list" className="flex-1 h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                    <button onClick={addCustom} className="h-11 px-4 rounded-xl bg-slate-800 text-white text-xs font-black flex items-center gap-1"><Plus size={14} /> Add</button>
                  </div>
                  {custom.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {custom.map(c => (
                        <span key={c} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1.5 rounded-xl bg-[#6D2158]/5 border border-[#6D2158]/20 text-xs font-bold text-[#6D2158]">
                          {c}<button onClick={() => setCustom(x => x.filter(y => y !== c))} className="p-0.5" aria-label={`Remove ${c}`}><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>

      {pantry && !locked && (
        <div className="fixed bottom-20 md:bottom-0 left-0 right-0 md:left-64 p-3 bg-white/95 backdrop-blur border-t border-slate-200 z-30" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
          <div className="max-w-3xl mx-auto">
            <button onClick={send} disabled={!count || sending} className={`w-full h-12 rounded-2xl text-sm font-black flex items-center justify-center gap-2 ${count ? (kind === 'Extra' ? 'bg-rose-600 text-white' : 'bg-[#6D2158] text-white') : 'bg-slate-100 text-slate-400'}`}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {count ? `Send ${count} item${count === 1 ? '' : 's'} · ${pantryShort(pantry)}${kind === 'Extra' ? ' (urgent)' : ''}` : 'Tick what you need'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

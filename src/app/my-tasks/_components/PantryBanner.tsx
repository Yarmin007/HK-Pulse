"use client";
// My Tasks card: your pantry's supply day and where its list is (open / packed / on the way / delivered).
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Package, Truck, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr } from '@/lib/dateUtils';
import { pantryOfVilla, pantryShort, loadSupplyDays, isSupplyDay, nextSupplyDate } from '@/lib/pantrySupply';

const niceDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function PantryBanner({ villas }: { villas: string[] }) {
  const [info, setInfo] = useState<{ pantry: string; text: string; tone: 'due' | 'moving' | 'done' | 'plain' } | null>(null);
  const pantry = villas.map(v => pantryOfVilla(v)).find(Boolean) || null;

  useEffect(() => {
    if (!pantry) return;
    let alive = true;
    (async () => {
      try {
        const today = getDhakaDateStr();
        const days = await loadSupplyDays();
        const due = isSupplyDay(days, pantry, today);
        const next = nextSupplyDate(days, pantry, today);
        const { data } = await supabase.from('hsk_pantry_requests').select('status, runner_name, kind').eq('pantry', pantry).eq('supply_date', today);
        if (!alive) return;
        const live = (data || []).find((r: any) => r.status === 'With runner') || (data || []).find((r: any) => r.kind === 'Scheduled');
        if (live?.status === 'With runner') setInfo({ pantry, text: `On the way with ${live.runner_name || 'the runner'}`, tone: 'moving' });
        else if (live?.status === 'Delivered') setInfo({ pantry, text: 'Today’s supply delivered', tone: 'done' });
        else if (due) setInfo({ pantry, text: 'Supply day today · tick what the pantry needs', tone: 'due' });
        else setInfo({ pantry, text: next ? `Next supply ${niceDate(next)} · add what you need` : 'Tap to ask for pantry items', tone: 'plain' });
      } catch { /* tables not set up yet: hide */ }
    })();
    return () => { alive = false; };
  }, [pantry]);

  if (!pantry || !info) return null;
  const tone = info.tone === 'due' ? 'bg-[#6D2158] text-white border-[#6D2158]' : info.tone === 'moving' ? 'bg-violet-50 border-violet-200' : 'bg-white border-slate-100';
  return (
    <Link href="/pantry/request" className={`flex items-center gap-3 p-4 rounded-3xl border shadow-sm ${tone}`}>
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${info.tone === 'due' ? 'bg-white/15 text-white' : info.tone === 'moving' ? 'bg-violet-600 text-white' : info.tone === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#6D2158]/10 text-[#6D2158]'}`}>
        {info.tone === 'moving' ? <Truck size={20} /> : info.tone === 'done' ? <Check size={20} /> : <Package size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-black ${info.tone === 'due' ? 'text-white' : 'text-slate-800'}`}>{pantryShort(info.pantry)} pantry</p>
        <p className={`text-xs font-semibold truncate ${info.tone === 'due' ? 'text-white/80' : 'text-slate-500'}`}>{info.text}</p>
      </div>
      <ChevronRight size={18} className={info.tone === 'due' ? 'text-white/70' : 'text-slate-300'} />
    </Link>
  );
}

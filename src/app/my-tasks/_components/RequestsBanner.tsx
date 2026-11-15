"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ClipboardList, Package, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr } from '@/lib/dateUtils';
import { classifyTarget, deliveryOf, normalizeVillaNumber, type DeliveryFields } from '@/lib/requestsShared';

// My Tasks: open requests for the VA's villas, with a shortcut to the Requests page.
export default function RequestsBanner({ villas }: { villas: string[] }) {
  const [counts, setCounts] = useState({ open: 0, pantry: 0 });

  useEffect(() => {
    if (!villas.length) return;
    const mine = new Set(villas.map(v => normalizeVillaNumber(v)));
    const today = getDhakaDateStr();
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('hsk_daily_requests').select('*').gte('request_time', `${today}T00:00:00+06:00`).lte('request_time', `${today}T23:59:59+06:00`);
      if (!alive) return;
      const rows = ((data || []) as (DeliveryFields & { villa_number: string; is_private?: boolean })[]).filter(r => {
        if (r.is_private || r.request_type === 'Time Edit Request') return false;
        const t = classifyTarget(r.villa_number);
        return t.kind === 'villa' && (mine.has(t.value) || mine.has(t.base));
      });
      setCounts({ open: rows.filter(r => deliveryOf(r) !== 'delivered').length, pantry: rows.filter(r => deliveryOf(r) === 'pantry').length });
    };
    load();
    const ch = supabase.channel('my_tasks_requests').on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, load).subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [villas]);

  if (!villas.length) return null;
  return (
    <Link href="/requests" className={`flex items-center gap-3 p-4 rounded-3xl border shadow-sm transition-colors ${counts.pantry ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-100 hover:border-[#6D2158]/30'}`}>
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${counts.pantry ? 'bg-amber-400 text-amber-950' : 'bg-[#6D2158]/10 text-[#6D2158]'}`}>
        {counts.pantry ? <Package size={20} /> : <ClipboardList size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-slate-800">Requests</p>
        <p className="text-xs font-semibold text-slate-500 truncate">
          {counts.pantry ? `${counts.pantry} waiting at the pantry · ` : ''}{counts.open ? `${counts.open} open for your villas` : 'Nothing open · tap to add a minibar or request'}
        </p>
      </div>
      {!counts.open && <Plus size={18} className="text-[#6D2158] shrink-0" />}
      <ChevronRight size={18} className="text-slate-300 shrink-0" />
    </Link>
  );
}

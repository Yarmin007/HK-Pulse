"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr } from '@/lib/dateUtils';
import { isAdminSession, readSession, type Session } from '@/lib/requestsShared';
import { riderDutyOf, isOffShift } from '@/app/allocation/lib/riders';
import AdminRequests from './AdminRequests';
import StaffRequests, { type StaffMode } from './StaffRequests';

// One Requests page, three views:
//  • admins → the full log (posting, bills; the coordinator also sees private requests + banking)
//  • whoever is on Runner duty today → every request, delivery only
//  • a Villa Attendant → only their allocated villas
type View = { kind: 'loading' } | { kind: 'admin' } | { kind: 'staff'; mode: StaffMode } | { kind: 'none' };

export default function RequestsPage() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [session, setSession] = useState<Session>({});

  useEffect(() => {
    const s = readSession();
    setSession(s);
    if (isAdminSession(s) || (!s.id && localStorage.getItem('hk_pulse_admin_auth') === 'true')) { setView({ kind: 'admin' }); return; }
    if (!s.id) { setView({ kind: 'none' }); return; }
    (async () => {
      const { data } = await supabase.from('hsk_allocations').select('host_id, area, shift, task_details').eq('report_date', getDhakaDateStr());
      const mine = (data || []).filter(a => a.host_id === s.id || (s.host_id && a.host_id === s.host_id));
      if (mine.some(a => a.area === 'riders' && !isOffShift(a.shift) && riderDutyOf(a, { role: s.role }) === 'Runner')) {
        setView({ kind: 'staff', mode: { kind: 'runner' } });
        return;
      }
      const villaAlloc = mine.filter(a => a.area === 'villa' && !isOffShift(a.shift));
      const villas = Array.from(new Set(villaAlloc.flatMap(a => String(a.task_details || '').split(/[,&\s]+/).flatMap(part => {
        const m = part.match(/^(\d+)-(\d+)$/);
        if (m && parseInt(m[2], 10) > 2) { // "10-14" is a range; "12-1" is the first half of villa 12
          const out: string[] = [];
          for (let i = parseInt(m[1], 10); i <= parseInt(m[2], 10) && out.length < 120; i++) out.push(String(i));
          return out;
        }
        return part.replace(/[^\d-]/g, '') ? [part.replace(/[^\d-]/g, '')] : [];
      })))).sort((a, b) => parseFloat(a.replace('-', '.')) - parseFloat(b.replace('-', '.')));
      setView(villas.length ? { kind: 'staff', mode: { kind: 'va', villas } } : { kind: 'none' });
    })();
  }, []);

  if (view.kind === 'loading') return <div className="min-h-[70dvh] flex items-center justify-center text-[#6D2158]"><Loader2 className="animate-spin" /></div>;
  if (view.kind === 'admin') return <AdminRequests />;
  if (view.kind === 'staff') return <StaffRequests mode={view.mode} session={session} />;

  return (
    <div className="min-h-[70dvh] flex items-center justify-center p-6">
      <div className="max-w-sm text-center bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4"><Lock size={24} /></div>
        <h1 className="text-lg font-black text-slate-800">No requests for you today</h1>
        <p className="text-sm text-slate-500 mt-1">Requests open for <strong>Runners</strong> on duty and <strong>Villa Attendants</strong> with villas in today&apos;s allocation.</p>
        <Link href="/" className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-[#6D2158] text-white text-xs font-bold">Back to dashboard</Link>
      </div>
    </div>
  );
}

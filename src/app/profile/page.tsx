"use client";
// My Profile: everything we know about the logged-in host — details, contact numbers, leave balances,
// today's duty, their tricycle / bicycle, this pay period's attendance and their next leave.
import React, { useState, useEffect } from 'react';
import {
  User, LogOut, Loader2, Phone, Smartphone, Hash, Briefcase, CalendarDays, Award, Building2,
  Plane, Bike, ClipboardList, BadgeCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr } from '@/lib/dateUtils';
import { computeLeaveBalancesRPC, getPayrollPeriod } from '@/lib/payrollMath';
import { fetchROEvents, isWorkedLeave } from '@/lib/attendanceData';
import { buildLeavePeriods, isAway } from '@/lib/leavePeriods';
import { loadFleet, type CycleUnit } from '@/lib/cycleFleet';
import { AREAS, parseVillas } from '@/app/allocation/lib/constants';

type Host = Record<string, any>;
type Balances = Record<string, any> | null;
type Duty = { area: string; shift: string; task_details: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (iso?: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${+d} ${MONTHS[+m - 1]} ${y}` : '—';
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const serviceLength = (iso?: string | null) => {
  if (!iso) return '';
  const from = new Date(`${String(iso).slice(0, 10)}T00:00:00`), now = new Date();
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months--;
  if (months < 0) return '';
  const y = Math.floor(months / 12), m = months % 12;
  return [y && `${y} yr${y > 1 ? 's' : ''}`, m && `${m} mo`].filter(Boolean).join(' ') || 'Less than a month';
};
const areaLabel = (area: string) =>
  area === 'housemate' ? 'Housemate' : area === 'taskforce' ? 'Special Task Force' : area === 'gardening' ? 'Garden'
    : area === 'laundry' || area === 'tailor' ? (area === 'laundry' ? 'Laundry' : 'Tailor')
    : AREAS.find(a => a.id === area)?.label || area;

const ATT_LABEL: Record<string, string> = { P: 'Present', O: 'Off', RO: 'RO', AL: 'Annual leave', SL: 'Sick', EL: 'Emergency', PH: 'Public hol.', CL: 'Casual', OT: 'Overtime' };

function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }){
  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-5">
      <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5"><Icon size={13} /> {title}</h2>
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const [host, setHost] = useState<Host | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [balances, setBalances] = useState<Balances>(null);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [cycle, setCycle] = useState<CycleUnit | null>(null);
  const [period, setPeriod] = useState<{ from: string; to: string; counts: [string, number][] } | null>(null);
  const [nextLeave, setNextLeave] = useState<{ from: string; to: string; days: number; category: string } | null>(null);

  useEffect(() => {
    setIsMounted(true);
    (async () => {
      const sessionData = localStorage.getItem('hk_pulse_session');
      if (!sessionData) { setIsLoading(false); return; }
      const parsed = JSON.parse(sessionData);
      // Freshest data from the database (new photo, numbers…); local session as a fallback
      const { data } = await supabase.from('hsk_hosts').select('*').eq('host_id', parsed.host_id).maybeSingle();
      const h: Host = data || parsed;
      setHost(h);
      setIsLoading(false);
      if (!h?.host_id) return;

      const today = getDhakaDateStr();
      const pp = getPayrollPeriod(new Date(`${today}T12:00:00`));
      const [ppFrom, ppTo] = [ymd(pp.start), ymd(pp.end)];
      const ahead = ymd(new Date(new Date(`${today}T12:00:00`).getTime() + 150 * 86400000));

      // Everything else loads in parallel; each part fills in when ready
      const [stats, consts, anniv, ro, alloc, att, future] = await Promise.all([
        supabase.rpc('get_all_attendance_stats', { p_target_date: today }),
        supabase.from('hsk_constants').select('type, label').eq('type', 'public_holiday'),
        supabase.from('hsk_attendance').select('host_id, date, status_code').eq('host_id', h.host_id).in('status_code', ['SL', 'EL', 'RR']).gte('date', '2025-01-01'),
        fetchROEvents(h.host_id).catch(() => []),
        h.id ? supabase.from('hsk_allocations').select('area, shift, task_details').eq('report_date', today).eq('host_id', h.id) : Promise.resolve({ data: [] }),
        supabase.from('hsk_attendance').select('date, status_code, shift_note').eq('host_id', h.host_id).gte('date', ppFrom).lte('date', ppTo),
        supabase.from('hsk_attendance').select('host_id, date, status_code, shift_note').eq('host_id', h.host_id).gt('date', today).lte('date', ahead).order('date'),
      ]);

      // Leave balances — same calculation as the dashboard
      try {
        const holidays = (consts.data || []).map((c: any) => { const [date, name] = String(c.label).split('::'); return { date, name }; });
        setBalances(computeLeaveBalancesRPC(h, [], stats.data || [], today, holidays, anniv.data || [], ro as any[]));
      } catch { setBalances(null); }

      setDuties(((alloc as any).data || []).filter((d: Duty) => !/^(off|al|sl|ph|el|leave)/i.test(d.shift || '')));

      // This pay period: count each attendance code
      const counts = new Map<string, number>();
      (att.data || []).forEach((r: any) => {
        const code = String(r.status_code || '').trim().toUpperCase();
        if (!code) return;
        const key = isWorkedLeave(r) ? 'P' : code; // an off with a "working day" note was a worked day
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      setPeriod({ from: ppFrom, to: ppTo, counts: [...counts.entries()].sort((a, b) => b[1] - a[1]) });

      // Next leave: the first future day away, followed through to its last day
      const rows = (future.data || []).map((r: any) => ({ ...r, date: String(r.date).slice(0, 10) }));
      const first = rows.find((r: any) => isAway(r));
      if (first) {
        const p = buildLeavePeriods(rows, first.date)[0];
        if (p) setNextLeave({ from: p.from, to: p.to, days: p.days, category: p.category });
      }

      try { const fleet = await loadFleet(); const dep = String(h.sub_department || '').trim().toLowerCase();
        setCycle(fleet.units.find(u => u.host_id === h.id) || (dep ? fleet.units.find(u => !u.host_id && u.dept.toLowerCase() === dep) : undefined) || null); } catch { /* not set up */ }
    })();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('hk_pulse_session');
    localStorage.removeItem('hk_pulse_admin_auth');
    window.location.href = '/';
  };

  if (!isMounted) return null;
  if (isLoading) return <div className="min-h-screen bg-[#FDFBFD] flex items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={32} /></div>;

  const nick = String(host?.nicknames || '').split(',').map(s => s.trim()).find(n => n && !/[\d()]/.test(n)) || '';
  const dept = host?.sub_department || '';
  const contacts = [
    { label: 'MVPN', value: host?.mvpn, icon: Hash },
    { label: 'Work mobile', value: host?.company_mobile, icon: Phone },
    { label: 'Personal mobile', value: host?.personal_mobile, icon: Smartphone },
  ];
  const details: [string, React.ReactNode, React.ElementType][] = [
    ['Designation', host?.role || '—', Briefcase],
    ['Level', host?.host_level || '—', Award],
    ['Department', dept || '—', Building2],
    ['Joined', <span key="j">{nice(host?.joining_date)}{serviceLength(host?.joining_date) && <span className="block text-[11px] font-semibold text-slate-400">{serviceLength(host?.joining_date)} of service</span>}</span>, CalendarDays],
  ];
  const bal = balances;
  const balTiles: [string, any, string][] = bal ? [
    ['Total', bal.balTotal, 'bg-[#6D2158] text-white'],
    ['Off', bal.balOff, ''],
    ['Annual', bal.balAL, ''],
    ['Public hol.', bal.balPH, ''],
    ['Sick', bal.balSL, ''],
    ['RO', bal.balRO, ''],
  ] : [];

  return (
    <div className="min-h-screen bg-[#FDFBFD] px-4 py-6 pb-28 font-antiqua text-[#6D2158] max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col items-center bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="w-28 h-28 bg-[#6D2158] text-white rounded-full flex items-center justify-center font-bold text-4xl shadow-xl shadow-[#6D2158]/20 mb-4 overflow-hidden border-4 border-white ring-1 ring-slate-100">
          {host?.image_url ? <img src={host.image_url} alt="Profile" className="w-full h-full object-cover" /> : (host?.full_name?.charAt(0) || <User size={40} />)}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-800 text-center leading-tight">{host?.full_name}</h1>
        {nick && <p className="text-sm font-bold text-slate-400 mt-0.5">&ldquo;{nick}&rdquo;</p>}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">{host?.host_id}</span>
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-100 px-3 py-1.5 rounded-full border border-emerald-200">{host?.role || 'Staff'}</span>
          {host?.status && <span className="text-[10px] font-bold text-sky-700 uppercase tracking-widest bg-sky-50 px-3 py-1.5 rounded-full border border-sky-200 flex items-center gap-1"><BadgeCheck size={11} /> {host.status}</span>}
        </div>
      </div>

      <Card title="Details" icon={Briefcase}>
        <div className="grid grid-cols-2 gap-3">
          {details.map(([label, value, Icon]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1"><Icon size={11} /> {label}</p>
              <div className="text-sm font-black text-slate-800 mt-0.5">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Contact" icon={Phone}>
        <div className="space-y-2">
          {contacts.map(({ label, value, icon: Icon }) => (
            value ? (
              <a key={label} href={`tel:${String(value).replace(/\s/g, '')}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 active:scale-[0.99]">
                <span className="w-9 h-9 rounded-xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center"><Icon size={16} /></span>
                <span className="flex-1"><span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span><span className="block text-sm font-black text-slate-800 tabular-nums">{value}</span></span>
              </a>
            ) : (
              <div key={label} className="flex items-center gap-3 rounded-2xl bg-slate-50/60 px-3 py-2.5">
                <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-300 flex items-center justify-center"><Icon size={16} /></span>
                <span className="flex-1"><span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span><span className="block text-xs font-bold text-slate-300">Not set</span></span>
              </div>
            )
          ))}
        </div>
      </Card>

      {balTiles.length > 0 && (
        <Card title="Leave balance" icon={Plane}>
          <div className="grid grid-cols-3 gap-2">
            {balTiles.map(([label, v, cls]) => (
              <div key={label} className={`rounded-2xl p-3 text-center ${cls || 'bg-slate-50'}`}>
                <p className={`text-xl font-black tabular-nums leading-none ${cls ? '' : 'text-slate-800'}`}>{v ?? '—'}</p>
                <p className={`text-[10px] font-black uppercase tracking-wider mt-1 ${cls ? 'text-white/70' : 'text-slate-400'}`}>{label}</p>
              </div>
            ))}
          </div>
          {nextLeave && (
            <p className="mt-3 text-xs font-bold text-slate-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Next {nextLeave.category === 'AL' ? 'annual leave' : nextLeave.category === 'SICK' ? 'sick leave' : 'day off'}: <b>{nice(nextLeave.from)}{nextLeave.to !== nextLeave.from ? ` → ${nice(nextLeave.to)}` : ''}</b> · {nextLeave.days} day{nextLeave.days > 1 ? 's' : ''}
            </p>
          )}
        </Card>
      )}

      <Card title="Today" icon={ClipboardList}>
        {duties.length === 0 ? (
          <p className="text-sm font-semibold text-slate-400">No duty allocated today.</p>
        ) : (
          <div className="space-y-2">
            {duties.map((d, i) => {
              const villas = d.area === 'villa' ? parseVillas(d.task_details || '') : [];
              return (
                <div key={i} className="rounded-2xl bg-slate-50 px-3 py-2.5">
                  <p className="text-sm font-black text-slate-800">{areaLabel(d.area)}{d.shift && d.shift !== 'Unassigned' ? <span className="text-slate-400 font-bold"> · {d.shift}</span> : null}</p>
                  {villas.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">{villas.map(v => <span key={v} className="px-2 py-0.5 rounded-lg bg-[#6D2158] text-white text-xs font-black">V{v}</span>)}</div>
                  ) : d.task_details && d.area !== 'villa' ? (
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">{String(d.task_details).replace(/^::/, '').replace('::', ' · ')}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        {cycle && (
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center"><Bike size={16} /></span>
            <span className="flex-1">
              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{cycle.host_id ? 'My' : `${cycle.dept}'s shared`} {cycle.type.toLowerCase()}</span>
              <span className="block text-sm font-black text-slate-800">{cycle.code}{cycle.status === 'Repair' && <span className="ml-2 text-[10px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">In repair</span>}{(cycle.status === 'Beyond Repair' || cycle.status === 'Lost') && <span className="ml-2 text-[10px] font-black text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">{cycle.status}</span>}</span>
            </span>
            {cycle.assigned_on && <span className="text-[11px] font-semibold text-slate-400">since {nice(cycle.assigned_on)}</span>}
          </div>
        )}
      </Card>

      {period && period.counts.length > 0 && (
        <Card title={`This pay period · ${nice(period.from)} – ${nice(period.to)}`} icon={CalendarDays}>
          <div className="flex flex-wrap gap-2">
            {period.counts.map(([code, n]) => (
              <span key={code} className="flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-100 pl-1 pr-2.5 py-1">
                <span className="min-w-[26px] h-6 px-1 rounded-lg bg-white border border-slate-200 text-xs font-black text-slate-800 flex items-center justify-center tabular-nums">{n}</span>
                <span className="text-[11px] font-bold text-slate-600">{ATT_LABEL[code] || code}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <button onClick={handleLogout} className="w-full py-5 bg-rose-50 text-rose-600 rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-rose-100 hover:text-rose-700 active:scale-95 transition-all shadow-sm border border-rose-100">
        <LogOut size={18} /> Sign Out Safely
      </button>
    </div>
  );
}

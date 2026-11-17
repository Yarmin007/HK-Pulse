"use client";
// Leave Clearance: Annual Leave (EOY projection), Pending Offs (per payroll cycle) and PH 60-day expiry.
// Speed: attendance / stats / RO rows are indexed per host once, and the heavy balance maths runs once per
// data load (or cycle change) — searching, filtering and sorting only re-filter the precomputed rows.
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CalendarDays, AlertTriangle, ShieldCheck, Loader2, Download, Search, ChevronLeft, ChevronRight,
  X, ArrowDownWideNarrow, ArrowUpNarrowWide, CheckCircle2, Users,
} from 'lucide-react';
import { fetchROEvents } from '@/lib/attendanceData';
import { supabase } from '@/lib/supabase';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { computeLeaveBalancesRPC } from '@/lib/payrollMath';

type Tab = 'AL' | 'OFF' | 'PH';
type AttRow = { host_id: string; date: string; status_code: string };
type PH = { date: string; name: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Host = Record<string, any> & { host_id: string; full_name: string; role?: string; projectedAL: number; rank: number };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NONE_ROW: AttRow[] = [{ host_id: '__none__', date: '', status_code: '' }];

const countFridays = (start: Date, end: Date) => {
  let n = 0;
  const d = new Date(start);
  while (d <= end) { if (d.getDay() === 5) n++; d.setDate(d.getDate() + 1); }
  return n;
};

const groupBy = <T extends { host_id: string }>(rows: T[]) => {
  const m = new Map<string, T[]>();
  rows.forEach(r => {
    const k = String(r.host_id).trim();
    const arr = m.get(k);
    if (arr) arr.push(r); else m.set(k, [r]);
  });
  return m;
};

const SORTS = {
  AL: [
    { key: 'bal-desc', label: 'Balance: high → low' },
    { key: 'bal-asc', label: 'Balance: low → high' },
    { key: 'taken-desc', label: 'Most AL taken' },
    { key: 'name', label: 'Name A–Z' },
    { key: 'rank', label: 'Rank / SSL' },
  ],
  OFF: [
    { key: 'clear-desc', label: 'To clear: high → low' },
    { key: 'clear-asc', label: 'To clear: low → high' },
    { key: 'bf-desc', label: 'B/F balance: high → low' },
    { key: 'name', label: 'Name A–Z' },
  ],
  PH: [
    { key: 'urgent', label: 'Expiring soonest' },
    { key: 'bal-desc', label: 'Most PH pending' },
    { key: 'name', label: 'Name A–Z' },
  ],
} as const;

const balTone = (v: number) =>
  v < 0 ? 'bg-rose-600 text-white' : v >= 20 ? 'bg-[#6D2158] text-white' : v >= 10 ? 'bg-[#6D2158]/80 text-white' : v > 0 ? 'bg-[#6D2158]/10 text-[#6D2158]' : 'bg-slate-100 text-slate-500';

export default function LeaveClearancePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('AL');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Payroll cycle for Pending Offs (21st → 20th). Month index = the month the cycle ENDS in.
  const [offCycleMonth, setOffCycleMonth] = useState(() => { const d = new Date(); return d.getDate() >= 21 ? (d.getMonth() + 1) % 12 : d.getMonth(); });
  const [offCycleYear, setOffCycleYear] = useState(() => { const d = new Date(); return d.getDate() >= 21 && d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear(); });

  const [hosts, setHosts] = useState<Host[]>([]);
  const [attendance, setAttendance] = useState<AttRow[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<PH[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [historicalStats, setHistoricalStats] = useState<any[]>([]);
  const [roEvents, setRoEvents] = useState<AttRow[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [teamConfig, setTeamConfig] = useState<any>({ hostDepartments: {}, nicknames: {}, excludeAttendance: {} });

  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<Record<Tab, string>>({ AL: 'bal-desc', OFF: 'clear-desc', PH: 'urgent' });
  const loadId = useRef(0);

  // ---------------- LOAD ----------------
  const loadAttendance = async (year: number) => {
    const all: AttRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('hsk_attendance')
        .select('host_id, date, status_code')
        .gte('date', `${year - 1}-12-01`) // prev Dec for the Dec 21 → Jan 20 payroll cycle
        .lte('date', `${year}-12-31`)
        .range(from, from + 999);
      if (error) throw error;
      if (!data?.length) break;
      all.push(...data.map(a => ({ host_id: String(a.host_id).trim(), date: a.date ? String(a.date).slice(0, 10) : '', status_code: String(a.status_code || '').trim().toUpperCase() })));
      if (data.length < 1000) break;
    }
    return all;
  };

  const fetchData = useCallback(async (year: number) => {
    const id = ++loadId.current;
    setIsLoading(true);
    try {
      const eoy = `${year}-12-20`;
      const [constRes, hostRes, rpcRes, rawAtt, ro] = await Promise.all([
        supabase.from('hsk_constants').select('type, label').in('type', ['public_holiday', 'role_rank', 'team_viewer_config']),
        supabase.from('hsk_hosts').select('*').neq('status', 'Resigned'),
        supabase.rpc('get_all_attendance_stats', { p_target_date: eoy }),
        loadAttendance(year),
        fetchROEvents(),
      ]);
      if (hostRes.error) throw hostRes.error;
      if (id !== loadId.current) return; // a newer load started — drop this one

      const ranks: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let config: any = { hostDepartments: {}, excludeAttendance: {} };
      const phs: PH[] = [];
      (constRes.data || []).forEach((c: { type: string; label: string }) => {
        if (c.type === 'role_rank') { const [role, rank] = c.label.split('::'); if (role && rank) ranks[role.toLowerCase().trim()] = parseInt(rank, 10); }
        else if (c.type === 'team_viewer_config') { try { config = JSON.parse(c.label); } catch { /* keep default */ } }
        else if (c.type === 'public_holiday') { const [d, n] = c.label.split('::'); phs.push({ date: d, name: n }); }
      });

      const stats = rpcRes.data || [];
      const attBy = groupBy(rawAtt);
      const statsBy = groupBy(stats as { host_id: string }[]);
      const roBy = groupBy(ro as AttRow[]);
      const hasAtt = rawAtt.length > 0;

      const hostsWithBals: Host[] = (hostRes.data || []).map(h => {
        const key = String(h.host_id).trim();
        const rank = ranks[(h.role || '').toLowerCase().trim()] ?? 999;
        // Per-host slices: identical results to passing the full arrays, without rescanning them per host
        const bals = computeLeaveBalancesRPC(h, hasAtt ? (attBy.get(key) || NONE_ROW) : [], statsBy.get(key) || [], eoy, phs, [], roBy.get(key) || []);
        return { ...h, ...bals, rank, projectedAL: parseFloat(bals?.balAL || '0') || 0 } as Host;
      });

      setTeamConfig(config);
      setPublicHolidays(phs);
      setHistoricalStats(stats);
      setAttendance(rawAtt);
      setRoEvents(ro as AttRow[]);
      setHosts(hostsWithBals);
    } catch (err) {
      if (id === loadId.current) toast.error('Could not load leave data: ' + ((err as { message?: string })?.message || 'Unknown error'));
    } finally {
      if (id === loadId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(selectedYear); }, [selectedYear, fetchData]);

  // Pending Offs needs the cycle's year loaded
  useEffect(() => {
    if (activeTab === 'OFF' && offCycleYear !== selectedYear) setSelectedYear(offCycleYear);
  }, [activeTab, offCycleYear, selectedYear]);

  // ---------------- INDEXES ----------------
  const attBy = useMemo(() => groupBy(attendance), [attendance]);
  const statsBy = useMemo(() => groupBy(historicalStats as { host_id: string }[]), [historicalStats]);
  const roBy = useMemo(() => groupBy(roEvents), [roEvents]);

  const deptOf = useCallback((h: Host) => teamConfig.hostDepartments?.[h.host_id] || h.role || 'Unassigned', [teamConfig]);
  const included = useMemo(() => hosts.filter(h => !teamConfig.excludeAttendance?.[h.host_id]), [hosts, teamConfig]);
  const departments = useMemo(() => {
    const m = new Map<string, number>();
    included.forEach(h => m.set(deptOf(h), (m.get(deptOf(h)) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [included, deptOf]);

  const q = searchQuery.trim().toLowerCase();
  const visibleIds = useMemo(() => new Set(included
    .filter(h => selectedDepartment === 'All' || deptOf(h) === selectedDepartment)
    .filter(h => !q || h.full_name.toLowerCase().includes(q) || String(h.host_id).toLowerCase().includes(q) || String(h.role || '').toLowerCase().includes(q))
    .map(h => h.host_id)), [included, selectedDepartment, deptOf, q]);

  const rankSort = (a: Host, b: Host) => a.rank - b.rank || ((parseInt(String(a.host_id).replace(/\D/g, ''), 10) || 999999) - (parseInt(String(b.host_id).replace(/\D/g, ''), 10) || 999999));

  // ---------------- 1. ANNUAL LEAVE ----------------
  const alAll = useMemo(() => included.map(h => {
    const monthly = Array(12).fill(0);
    let totalTaken = 0;
    const yr = String(selectedYear);
    (attBy.get(String(h.host_id).trim()) || []).forEach(a => {
      if ((a.status_code === 'AL' || a.status_code === 'VAC') && a.date.startsWith(yr)) {
        monthly[parseInt(a.date.slice(5, 7), 10) - 1]++;
        totalTaken++;
      }
    });
    return { ...h, monthly, totalTaken };
  }), [included, attBy, selectedYear]);

  const alData = useMemo(() => {
    const rows = alAll.filter(h => visibleIds.has(h.host_id));
    const s = sortKey.AL;
    return rows.sort((a, b) =>
      s === 'bal-desc' ? b.projectedAL - a.projectedAL || rankSort(a, b)
      : s === 'bal-asc' ? a.projectedAL - b.projectedAL || rankSort(a, b)
      : s === 'taken-desc' ? b.totalTaken - a.totalTaken || rankSort(a, b)
      : s === 'name' ? a.full_name.localeCompare(b.full_name)
      : rankSort(a, b));
  }, [alAll, visibleIds, sortKey.AL]);

  const alTotals = useMemo(() => {
    const monthlyTotals = Array(12).fill(0);
    let taken = 0, balance = 0, negative = 0, high = 0;
    alData.forEach(h => {
      h.monthly.forEach((v: number, i: number) => { monthlyTotals[i] += v; });
      taken += h.totalTaken;
      balance += h.projectedAL;
      if (h.projectedAL < 0) negative++;
      if (h.projectedAL >= 20) high++;
    });
    return { monthlyTotals, taken, balance, negative, high, avg: alData.length ? balance / alData.length : 0 };
  }, [alData]);

  // ---------------- 2. PENDING OFFS ----------------
  const offCycle = useMemo(() => {
    const start = new Date(offCycleYear, offCycleMonth - 1, 21);
    const end = new Date(offCycleYear, offCycleMonth, 20);
    const prevEnd = new Date(offCycleYear, offCycleMonth - 1, 20);
    return { start, end, totalFridays: countFridays(start, end), startStr: format(start, 'yyyy-MM-dd'), endStr: format(end, 'yyyy-MM-dd'), prevEndStr: format(prevEnd, 'yyyy-MM-dd') };
  }, [offCycleMonth, offCycleYear]);

  // Heavy part: only when data or the cycle changes — never on search/filter/sort
  const offAll = useMemo(() => {
    if (activeTab !== 'OFF' || isLoading) return [];
    const { startStr, endStr, prevEndStr } = offCycle;
    const hasAtt = attendance.length > 0;
    return included.map(h => {
      const key = String(h.host_id).trim();
      const rows = attBy.get(key) || [];
      let takenInCycle = 0;
      let lastTakenDate: string | null = null;
      rows.forEach(a => {
        if ((a.status_code === 'O' || a.status_code === 'OFF') && a.date >= startStr && a.date <= endStr) {
          takenInCycle++;
          if (!lastTakenDate || a.date > lastTakenDate) lastTakenDate = a.date;
        }
      });
      const att = hasAtt ? (rows.length ? rows : NONE_ROW) : [];
      const prev = computeLeaveBalancesRPC(h, att, statsBy.get(key) || [], prevEndStr, publicHolidays, [], roBy.get(key) || []);
      const curr = computeLeaveBalancesRPC(h, att, statsBy.get(key) || [], endStr, publicHolidays, [], roBy.get(key) || []);
      const prevPending = parseInt(prev?.balOff || '0', 10) || 0;
      const totalPending = parseInt(curr?.balOff || '0', 10) || 0;
      return { ...h, takenInCycle, earnedInCycle: totalPending - prevPending + takenInCycle, prevPending, totalPending, uncleared: prevPending - takenInCycle, lastTakenDate };
    }).filter(h => h.prevPending > 0);
  }, [activeTab, isLoading, offCycle, included, attBy, statsBy, roBy, publicHolidays, attendance.length]);

  const offData = useMemo(() => {
    const s = sortKey.OFF;
    return offAll.filter(h => visibleIds.has(h.host_id)).sort((a, b) =>
      s === 'clear-desc' ? b.uncleared - a.uncleared || b.prevPending - a.prevPending
      : s === 'clear-asc' ? a.uncleared - b.uncleared
      : s === 'bf-desc' ? b.prevPending - a.prevPending
      : a.full_name.localeCompare(b.full_name));
  }, [offAll, visibleIds, sortKey.OFF]);

  // ---------------- 3. PH EXPIRY (FIFO, 60 days) ----------------
  const phAll = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const yr = String(selectedYear);
    const out: (Host & { pendingPHs: { date: string; expiry: string; daysLeft: number; isCF: boolean }[]; mostUrgent: number; actualBal: number })[] = [];
    included.forEach(h => {
      const joinStr = h.joining_date ? String(h.joining_date).slice(0, 10) : '2026-01-01';
      const cfPH = Math.round(parseFloat(h.calcCfPH) || 0);
      const earned: string[] = Array(cfPH).fill(`${yr}-01-01`); // B/F from previous years
      // Only this year's PHs + this year's PH days: previous years are already inside the B/F figure
      publicHolidays.forEach(ph => { if (ph.date.startsWith(yr) && ph.date <= todayStr && ph.date >= joinStr) earned.push(ph.date); });
      let takenCount = (attBy.get(String(h.host_id).trim()) || []).filter(a => a.status_code === 'PH' && a.date.startsWith(yr)).length;
      earned.sort();
      const pending: { date: string; expiry: string; daysLeft: number; isCF: boolean }[] = [];
      earned.forEach((d, i) => {
        if (takenCount > 0) { takenCount--; return; }
        const expiry = addDays(parseISO(d), 60);
        const daysLeft = differenceInDays(expiry, new Date());
        if (daysLeft > 0) pending.push({ date: d, expiry: format(expiry, 'yyyy-MM-dd'), daysLeft, isCF: i < cfPH });
      });
      if (pending.length) out.push({ ...h, pendingPHs: pending, mostUrgent: Math.min(...pending.map(p => p.daysLeft)), actualBal: pending.length });
    });
    return out;
  }, [included, attBy, publicHolidays, selectedYear]);

  const phData = useMemo(() => {
    const s = sortKey.PH;
    return phAll.filter(h => visibleIds.has(h.host_id)).sort((a, b) =>
      s === 'urgent' ? a.mostUrgent - b.mostUrgent
      : s === 'bal-desc' ? b.actualBal - a.actualBal || a.mostUrgent - b.mostUrgent
      : a.full_name.localeCompare(b.full_name));
  }, [phAll, visibleIds, sortKey.PH]);

  // ---------------- EXPORT ----------------
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const dept = selectedDepartment.replace(/[^\w-]+/g, '_');
    if (activeTab === 'AL') {
      const rows = alData.map((h, i) => [i + 1, h.host_id, h.full_name, h.role, ...h.monthly, h.totalTaken, Number(h.projectedAL.toFixed(2))]);
      rows.push(['', '', 'TOTALS', '', ...alTotals.monthlyTotals, alTotals.taken, Number(alTotals.balance.toFixed(2))]);
      rows.push(['', '', `Average balance per host: ${alTotals.avg.toFixed(2)}`]);
      const ws = XLSX.utils.aoa_to_sheet([['#', 'SSL No', 'Name', 'Designation', ...MONTHS, 'Total Taken', `EOY Balance (20 Dec ${selectedYear})`], ...rows]);
      ws['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 28 }, { wch: 22 }, ...MONTHS.map(() => ({ wch: 5 })), { wch: 11 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Annual Leave');
      XLSX.writeFile(wb, `AL_Clearance_${selectedYear}_${dept}.xlsx`);
    } else if (activeTab === 'OFF') {
      const ws = XLSX.utils.aoa_to_sheet([
        ['#', 'SSL No', 'Name', 'Designation', 'B/F Balance', 'Earned (cycle)', 'Taken (cycle)', 'To Clear', 'Last Off Taken'],
        ...offData.map((h, i) => [i + 1, h.host_id, h.full_name, h.role, h.prevPending, h.earnedInCycle, h.takenInCycle, Math.max(0, h.uncleared), h.lastTakenDate || '']),
      ]);
      ws['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 28 }, { wch: 22 }, { wch: 11 }, { wch: 13 }, { wch: 12 }, { wch: 9 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Pending Offs');
      XLSX.writeFile(wb, `Pending_Offs_${offCycle.endStr.slice(0, 7)}_${dept}.xlsx`);
    } else {
      const ws = XLSX.utils.aoa_to_sheet([
        ['#', 'SSL No', 'Name', 'Designation', 'PH Pending', 'Earned on', 'Expires', 'Days Left'],
        ...phData.flatMap((h, i) => h.pendingPHs.map((p, j) => [j === 0 ? i + 1 : '', j === 0 ? h.host_id : '', j === 0 ? h.full_name : '', j === 0 ? h.role : '', j === 0 ? h.actualBal : '', p.isCF ? 'Brought forward' : p.date, p.expiry, p.daysLeft])),
      ]);
      ws['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 28 }, { wch: 22 }, { wch: 11 }, { wch: 16 }, { wch: 12 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, 'PH Expiry');
      XLSX.writeFile(wb, `PH_Expiry_${selectedYear}_${dept}.xlsx`);
    }
  };

  const shiftCycle = (delta: number) => {
    let m = offCycleMonth + delta, y = offCycleYear;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setOffCycleMonth(m); setOffCycleYear(y);
  };

  const toggleSort = (tab: Tab, desc: string, asc: string) => setSortKey(s => ({ ...s, [tab]: s[tab] === desc ? asc : desc }));

  const count = activeTab === 'AL' ? alData.length : activeTab === 'OFF' ? offData.length : phData.length;

  // =====================================================================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col pb-24 md:pb-6">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <Link href="/attendance" className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 shrink-0" aria-label="Back to attendance"><ArrowLeft size={17} /></Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-[#6D2158] leading-tight">Leave Clearance</h1>
            <p className="text-[11px] font-bold text-slate-400">AL balances · Pending offs · PH expiry</p>
          </div>

          {activeTab === 'OFF' ? (
            <div className="flex items-center rounded-xl border border-amber-200 bg-amber-50">
              <button onClick={() => shiftCycle(-1)} className="w-9 h-9 flex items-center justify-center text-amber-700" aria-label="Previous cycle"><ChevronLeft size={16} /></button>
              <div className="px-1 text-center leading-tight">
                <div className="text-xs font-black text-amber-800">{format(new Date(offCycleYear, offCycleMonth, 1), 'MMM yyyy')} cycle</div>
                <div className="text-[10px] font-bold text-amber-600">{format(offCycle.start, 'd MMM')} – {format(offCycle.end, 'd MMM')}</div>
              </div>
              <button onClick={() => shiftCycle(1)} className="w-9 h-9 flex items-center justify-center text-amber-700" aria-label="Next cycle"><ChevronRight size={16} /></button>
            </div>
          ) : (
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50">
              <button onClick={() => setSelectedYear(y => y - 1)} className="w-9 h-9 flex items-center justify-center text-slate-500" aria-label="Previous year"><ChevronLeft size={16} /></button>
              <span className="w-12 text-center text-sm font-black text-[#6D2158]">{selectedYear}</span>
              <button onClick={() => setSelectedYear(y => y + 1)} className="w-9 h-9 flex items-center justify-center text-slate-500" aria-label="Next year"><ChevronRight size={16} /></button>
            </div>
          )}

          <button onClick={handleExport} disabled={isLoading || count === 0} className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-40">
            <Download size={14} /> Excel
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-[1600px] mx-auto px-4 pb-3">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 max-w-xl">
            {([['AL', 'Annual Leave', CalendarDays], ['OFF', 'Pending Offs', AlertTriangle], ['PH', 'PH Expiry', ShieldCheck]] as const).map(([k, label, Icon]) => (
              <button key={k} onClick={() => setActiveTab(k)} className={`h-10 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition-all ${activeTab === k ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <Icon size={15} className="hidden sm:block" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-[1600px] mx-auto w-full px-4 pt-4 flex flex-col gap-3">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1 md:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search name, SSL or role" className="w-full h-10 pl-9 pr-9 rounded-xl bg-white border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear search"><X size={15} /></button>}
          </div>
          <div className="grid grid-cols-2 md:flex gap-2">
            <select value={selectedDepartment} onChange={e => setSelectedDepartment(e.target.value)} className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] md:min-w-[200px]">
              <option value="All">All departments ({included.length})</option>
              {departments.map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
            </select>
            <select value={sortKey[activeTab]} onChange={e => setSortKey(s => ({ ...s, [activeTab]: e.target.value }))} className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] md:min-w-[200px]" aria-label="Sort">
              {SORTS[activeTab].map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div className="md:ml-auto flex items-center gap-1.5 text-xs font-bold text-slate-400"><Users size={14} /> {isLoading ? '…' : count} {activeTab === 'AL' ? 'hosts' : activeTab === 'OFF' ? 'with B/F offs' : 'with pending PH'}</div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24 text-slate-400">
            <Loader2 size={28} className="animate-spin text-[#6D2158] mb-3" />
            <span className="text-xs font-bold">Loading {activeTab === 'OFF' ? offCycleYear : selectedYear} ledgers…</span>
          </div>
        ) : activeTab === 'AL' ? (
          <>
            {/* AL stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                ['Total EOY balance', alTotals.balance.toFixed(1), 'text-[#6D2158]'],
                ['Average per host', alTotals.avg.toFixed(1), 'text-slate-800'],
                ['20+ days to clear', String(alTotals.high), 'text-amber-600'],
                ['Negative balance', String(alTotals.negative), alTotals.negative ? 'text-rose-600' : 'text-slate-400'],
              ].map(([l, v, c]) => (
                <div key={l} className="bg-white rounded-2xl border border-slate-200 p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{l}</p>
                  <p className={`text-2xl font-black mt-0.5 ${c}`}>{v}</p>
                </div>
              ))}
            </div>

            {alData.length === 0 ? <Empty text="No hosts match." /> : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="overflow-auto max-h-[calc(100vh-330px)]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-20 bg-slate-50">
                        <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          <th className="px-3 py-2.5 text-left w-8">#</th>
                          <th className="px-3 py-2.5 text-left sticky left-0 bg-slate-50 z-10 min-w-[220px]">Host</th>
                          {MONTHS.map(m => <th key={m} className="px-1 py-2.5 text-center w-10">{m}</th>)}
                          <th className="px-2 py-2.5 text-center w-20">
                            <button onClick={() => toggleSort('AL', 'taken-desc', 'name')} className={`inline-flex items-center gap-1 ${sortKey.AL === 'taken-desc' ? 'text-rose-600' : 'hover:text-slate-600'}`}>Taken <SortIcon on={sortKey.AL === 'taken-desc'} desc /></button>
                          </th>
                          <th className="px-3 py-2.5 text-center w-28">
                            <button onClick={() => toggleSort('AL', 'bal-desc', 'bal-asc')} className={`inline-flex items-center gap-1 ${sortKey.AL.startsWith('bal') ? 'text-[#6D2158]' : 'hover:text-slate-600'}`} title={`Projected balance on 20 Dec ${selectedYear}`}>EOY balance <SortIcon on={sortKey.AL.startsWith('bal')} desc={sortKey.AL === 'bal-desc'} /></button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {alData.map((h, i) => (
                          <tr key={h.host_id} className="group hover:bg-purple-50/40">
                            <td className="px-3 py-2 text-slate-400 font-bold">{i + 1}</td>
                            <td className="px-3 py-2 sticky left-0 bg-white group-hover:bg-[#faf6f9] z-10">
                              <div className="font-black text-slate-800 truncate max-w-[240px]" title={h.full_name}>{h.full_name}</div>
                              <div className="text-[10px] font-bold text-slate-400 truncate max-w-[240px]">{h.host_id} · {h.role}</div>
                            </td>
                            {h.monthly.map((v: number, m: number) => (
                              <td key={m} className="px-1 py-2 text-center">
                                {v > 0 ? <span className="inline-block min-w-[22px] px-1 py-0.5 rounded-md bg-cyan-50 text-cyan-700 font-black">{v}</span> : <span className="text-slate-200">·</span>}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center font-black text-rose-600">{h.totalTaken || <span className="text-slate-300">0</span>}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-block min-w-[56px] px-2 py-1 rounded-lg font-black text-[13px] ${balTone(h.projectedAL)}`}>{h.projectedAL.toFixed(2)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-slate-50 z-20 border-t border-slate-200">
                        <tr className="font-black">
                          <td />
                          <td className="px-3 py-2.5 sticky left-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">Totals</td>
                          {alTotals.monthlyTotals.map((v, m) => <td key={m} className="px-1 py-2.5 text-center text-slate-600">{v || ''}</td>)}
                          <td className="px-2 py-2.5 text-center text-rose-700">{alTotals.taken}</td>
                          <td className="px-3 py-2.5 text-center text-[#6D2158]">{alTotals.balance.toFixed(1)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {alData.map((h, i) => (
                    <div key={h.host_id} className="bg-white rounded-2xl border border-slate-200 p-3">
                      <div className="flex items-center gap-3">
                        <span className="w-7 text-center text-xs font-black text-slate-300">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-800 truncate">{h.full_name}</p>
                          <p className="text-[11px] font-bold text-slate-400 truncate">{h.host_id} · {h.role}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`inline-block px-2.5 py-1 rounded-lg font-black text-sm ${balTone(h.projectedAL)}`}>{h.projectedAL.toFixed(2)}</span>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">{h.totalTaken} taken</p>
                        </div>
                      </div>
                      {h.totalTaken > 0 && (
                        <div className="mt-2 ml-10 flex gap-[3px] items-end h-6" aria-label="AL taken per month">
                          {h.monthly.map((v: number, m: number) => (
                            <div key={m} className="flex-1 flex flex-col items-center justify-end h-full" title={`${MONTHS[m]}: ${v}`}>
                              <div className={`w-full rounded-sm ${v ? 'bg-cyan-400' : 'bg-slate-100'}`} style={{ height: v ? `${Math.min(100, 25 + v * 6)}%` : '3px' }} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : activeTab === 'OFF' ? (
          offData.length === 0 ? <Empty text="All clear — nobody brought pending offs into this cycle." good /> : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="hidden md:grid grid-cols-[40px_1fr_90px_110px_110px_120px] px-4 py-2.5 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <span>#</span><span>Host</span>
                <button onClick={() => toggleSort('OFF', 'bf-desc', 'name')} className={`text-center inline-flex justify-center items-center gap-1 ${sortKey.OFF === 'bf-desc' ? 'text-slate-700' : ''}`}>B/F <SortIcon on={sortKey.OFF === 'bf-desc'} desc /></button>
                <span className="text-center text-amber-600">Earned</span>
                <span className="text-center text-emerald-600">Taken</span>
                <button onClick={() => toggleSort('OFF', 'clear-desc', 'clear-asc')} className="text-center inline-flex justify-center items-center gap-1 text-[#6D2158]">To clear <SortIcon on={sortKey.OFF.startsWith('clear')} desc={sortKey.OFF === 'clear-desc'} /></button>
              </div>
              <div className="divide-y divide-slate-100">
                {offData.map((h, i) => {
                  const cleared = h.uncleared <= 0;
                  return (
                    <div key={h.host_id} className={`px-4 py-3 grid grid-cols-[1fr_auto] md:grid-cols-[40px_1fr_90px_110px_110px_120px] items-center gap-y-2 ${cleared ? 'bg-slate-50/50' : ''}`}>
                      <span className="hidden md:block text-xs font-bold text-slate-400">{i + 1}</span>
                      <div className="min-w-0">
                        <p className={`text-sm font-black truncate ${cleared ? 'text-slate-500' : 'text-slate-800'}`}>{h.full_name}</p>
                        <p className="text-[11px] font-bold text-slate-400 truncate">{h.host_id} · {h.role}</p>
                      </div>
                      <div className="md:hidden row-span-2 text-right">
                        {cleared ? <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black">Cleared</span> : <span className="px-2.5 py-1.5 rounded-lg bg-[#6D2158] text-white text-sm font-black">+{h.uncleared}</span>}
                      </div>
                      <div className="md:hidden flex gap-3 text-[11px] font-bold text-slate-500">
                        <span>B/F <b className="text-slate-700">{h.prevPending}</b></span>
                        <span>Earned <b className="text-amber-600">{h.earnedInCycle}</b></span>
                        <span>Taken <b className="text-emerald-600">{h.takenInCycle}</b></span>
                      </div>
                      <span className="hidden md:block text-center text-sm font-black text-slate-600">{h.prevPending}</span>
                      <span className="hidden md:block text-center"><span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-sm font-black">{h.earnedInCycle}</span></span>
                      <span className="hidden md:block text-center"><span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-black">{h.takenInCycle}</span></span>
                      <span className="hidden md:flex flex-col items-center">
                        {cleared ? (
                          <>
                            <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black flex items-center gap-1"><CheckCircle2 size={12} /> Cleared</span>
                            {h.lastTakenDate && <span className="text-[10px] font-bold text-slate-400 mt-0.5">Last {format(parseISO(h.lastTakenDate), 'd MMM')}</span>}
                          </>
                        ) : <span className="px-3 py-1.5 rounded-lg bg-[#6D2158] text-white text-sm font-black">+{h.uncleared}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          phData.length === 0 ? <Empty text="All clear — no pending public holidays." good /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {phData.map(h => (
                <div key={h.host_id} className={`bg-white rounded-2xl border p-4 ${h.mostUrgent <= 14 ? 'border-rose-200' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">{h.full_name}</p>
                      <p className="text-[11px] font-bold text-slate-400 truncate">{h.host_id} · {h.role}</p>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-black">{h.actualBal} PH</span>
                  </div>
                  <div className="space-y-2">
                    {h.pendingPHs.map((p, i) => {
                      const danger = p.daysLeft <= 14;
                      return (
                        <div key={i} className="p-2.5 rounded-xl bg-slate-50">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-slate-600">{p.isCF ? 'Brought forward' : format(parseISO(p.date), 'd MMM yyyy')}</span>
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${danger ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{p.daysLeft} days left</span>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div className={`h-full ${danger ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(3, Math.min(100, (p.daysLeft / 60) * 100))}%` }} />
                          </div>
                          <p className="mt-1 text-[10px] font-bold text-slate-400 text-right">Expires {format(parseISO(p.expiry), 'd MMM yyyy')}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function SortIcon({ on, desc }: { on: boolean; desc: boolean }) {
  return on ? (desc ? <ArrowDownWideNarrow size={12} /> : <ArrowUpNarrowWide size={12} />) : null;
}

function Empty({ text, good }: { text: string; good?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
      <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3 ${good ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {good ? <CheckCircle2 size={26} /> : <Search size={24} />}
      </div>
      <p className="text-sm font-bold text-slate-500 px-6">{text}</p>
    </div>
  );
}

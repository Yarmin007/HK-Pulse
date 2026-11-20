"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Printer, ArrowLeft, Download, CalendarDays, X, Search, FileCheck2, MonitorCheck, Check } from 'lucide-react';
import { isOnAttendance, hostSubDept, subDeptOrder, getResignedOn } from '@/lib/hostProfile';
import { fetchAttendanceRange, isWorkedLeave, isRO, roForDay, roTakenOn, workedNoteWithoutRO } from '@/lib/attendanceData';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { computeLeaveBalancesRPC } from '@/lib/payrollMath';
import { loadRosterChecks, saveRosterCheck, checkState, type RosterCheck } from '@/lib/rosterChecks';
import RosterPrint, { type Paper } from './RosterPrint';
import { exportRosterXlsx } from './rosterExcel';
import { CODE_COLORS, CODE_NAMES, FRIDAY_FILL, PH_FILL, type RosterCell, type RosterGroup } from './rosterShared';

const STATUS_CODES = ['P', 'O', 'AL', 'PH', 'RR', 'SL', 'NP', 'A', 'CL', 'PA', 'MA', 'EL', 'OT', 'RO'];


// The sheet runs 21st → 20th and is named after the month of the 20th: from the 21st, today is in next month's sheet.
const sheetMonthFor = (d: Date) => (d.getDate() >= 21 ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : new Date(d.getFullYear(), d.getMonth(), 1));

export default function MonthlyAttendanceSheet() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => sheetMonthFor(new Date()));
  const loadSeq = useRef(0);
  
  const [hosts, setHosts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  
  const [teamConfig, setTeamConfig] = useState<any>({});
  const [publicHolidays, setPublicHolidays] = useState<any[]>([]);
  const [roleRanks, setRoleRanks] = useState<Record<string, number>>({});

  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  
  const [editCell, setEditCell] = useState<{ hostId: string, hostName: string, dateStr: string, status: string } | null>(null);
  const [search, setSearch] = useState('');
  const [checks, setChecks] = useState<Record<string, RosterCheck>>({});
  const [checkFilter, setCheckFilter] = useState<'all' | 'sheet' | 'fusion'>('all');
  const [checkEdit, setCheckEdit] = useState<{ host: any; sheet: string; fusion: string } | null>(null);
  const [savingCheck, setSavingCheck] = useState(false);
  const [paper, setPaper] = useState<Paper>('A4');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Generate array of date strings from 21st of prev month to 20th of current month
  const monthDates = useMemo(() => {
      const dates = [];
      const start = new Date(year, month - 1, 21);
      const end = new Date(year, month, 20);
      
      let curr = new Date(start);
      while (curr <= end) {
          dates.push(format(curr, 'yyyy-MM-dd'));
          curr.setDate(curr.getDate() + 1);
      }
      return dates;
  }, [year, month]);

  const targetDateStr = useMemo(() => format(new Date(year, month, 20), 'yyyy-MM-dd'), [year, month]);
  // End of the previous roster: its balances are what this roster starts with (carried forward)
  const prevTargetStr = useMemo(() => format(new Date(year, month - 1, 20), 'yyyy-MM-dd'), [year, month]);
  const periodKey = useMemo(() => format(new Date(year, month, 20), 'yyyy-MM'), [year, month]);

  useEffect(() => {
      fetchData();
  }, [year, month]);

  const fetchData = async (showLoading = true) => {
      const seq = ++loadSeq.current;
      if (showLoading) setIsLoading(true);

      // Only this sheet's 21st–20th rows are needed for the grid; balances come from the
      // database's year-to-date totals plus the RO rows. Everything loads at once.
      const periodStart = format(new Date(year, month - 1, 21), 'yyyy-MM-dd');
      const [constRes, hostRes, rpcRes, rpcPrev, formattedAtt, checkRows] = await Promise.all([
          supabase.from('hsk_constants').select('*').in('type', ['public_holiday', 'role_rank', 'team_viewer_config']),
          supabase.from('hsk_hosts').select('*'),
          supabase.rpc('get_all_attendance_stats', { p_target_date: targetDateStr }),
          supabase.rpc('get_all_attendance_stats', { p_target_date: prevTargetStr }),
          fetchAttendanceRange(periodStart, targetDateStr, 'id, host_id, date, status_code, shift_note'),
          loadRosterChecks(periodKey).catch(() => ({} as Record<string, RosterCheck>)),
      ]);
      // A newer month was opened while this one was loading: drop this answer
      if (seq !== loadSeq.current) return;
      
      let ranks: Record<string, number> = {};
      let config: any = {};
      let phs: any[] = [];

      if (constRes.data) {
          constRes.data.forEach((c: any) => {
              if (c.type === 'role_rank') {
                  const [role, rank] = c.label.split('::');
                  if (role && rank) ranks[role.toLowerCase().trim()] = parseInt(rank, 10);
              } else if (c.type === 'team_viewer_config') {
                  try { config = JSON.parse(c.label); } catch(e) {}
              } else if (c.type === 'public_holiday') {
                  const [d, n] = c.label.split('::');
                  phs.push({ date: d, name: n });
              }
          });
          setRoleRanks(ranks);
          setTeamConfig(config);
          setPublicHolidays(phs);
      }
      

      let sortedHosts = [];
      if (hostRes.data) {
          // Permanent hosts only; resigned hosts stay for periods that started before their last working day.
          sortedHosts = hostRes.data.filter((h: any) => isOnAttendance(config, h, periodStart)).sort((a, b) => {
              const rankA = ranks[(a.role || '').toLowerCase().trim()] ?? 999;
              const rankB = ranks[(b.role || '').toLowerCase().trim()] ?? 999;
              if (rankA !== rankB) return rankA - rankB;
              
              const numA = parseInt((a.host_id || '').replace(/\D/g, ''), 10) || 999999;
              const numB = parseInt((b.host_id || '').replace(/\D/g, ''), 10) || 999999;
              return numA - numB;
          });
      }

      // Balances at the end of this roster (the 20th), and at the end of the previous one (carried forward).
      // Before the system start (1 Jan 2026) the carried-forward figures are the opening balances on the profile.
      const hostsWithBals = sortedHosts.map(h => {
           const b = computeLeaveBalancesRPC(h, [], rpcRes.data || [], targetDateStr, phs, []);
           const prev = prevTargetStr < '2026-01-01'
               ? { balOff: String(h.cf_off || 0), balPH: String(h.cf_ph || 0) }
               : computeLeaveBalancesRPC(h, [], rpcPrev.data || [], prevTargetStr, phs, []);
           return { ...h, ...(b || {}), cfOff: prev?.balOff ?? '0', cfPH: prev?.balPH ?? '0' };
      });

      setHosts(hostsWithBals);
      setChecks(checkRows);
      setAttendance(formattedAtt);
      
      if (showLoading) setIsLoading(false);
  };

  const handleSaveCell = async (newStatus: string) => {
      if (!editCell) return;
      const { hostId, dateStr } = editCell;

      setEditCell(null);

      const { data: existingArr } = await supabase.from('hsk_attendance').select('id, status_code, shift_note, shift_type').eq('host_id', hostId).eq('date', dateStr).order('id');
      const existing = existingArr?.[0];
      // Same rule as the main sheet: one row per person per day
      if (existingArr && existingArr.length > 1) await supabase.from('hsk_attendance').delete().in('id', existingArr.slice(1).map(r => r.id));

      // Keep RO ↔ worked-day links tidy (the main sheet does the same)
      let note = existing?.shift_note || '';
      const links: { date: string; note: string }[] = [];
      const RO_FOR_RE = /\s*[-–·|,]?\s*RO\s+FOR\s+DAY\s+WORKED\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/gi;
      const RO_TAKEN_RE = /\s*[-–·|,]?\s*RO\s+TAKEN\s+ON\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/gi;
      const lookup = async (d: string) => (await supabase.from('hsk_attendance').select('shift_note').eq('host_id', hostId).eq('date', d).limit(1)).data?.[0];
      if (existing && isRO(existing) && newStatus !== 'RO') {
          // No longer an RO: the worked day it paid back becomes pending again
          const worked = roForDay(existing.shift_note);
          note = note.replace(RO_FOR_RE, '').trim();
          const w = worked ? await lookup(worked) : null;
          if (worked && w) links.push({ date: worked, note: workedNoteWithoutRO(w.shift_note) });
      } else if (existing && isWorkedLeave(existing) && !isWorkedLeave({ status_code: newStatus, shift_note: existing.shift_note })) {
          // No longer a worked leave day: the RO linked to it becomes unallocated
          const ro = roTakenOn(existing.shift_note);
          note = note.replace(RO_TAKEN_RE, '').trim();
          const r = ro ? await lookup(ro) : null;
          if (ro && r && roForDay(r.shift_note) === dateStr) links.push({ date: ro, note: String(r.shift_note || '').replace(RO_FOR_RE, '').trim() });
      }

      setAttendance(prev => {
          const newAtt = [...prev];
          const idx = newAtt.findIndex(a => a.host_id === hostId && a.date === dateStr);
          if (newStatus === '' && !note && !existing?.shift_type) {
              if (idx > -1) newAtt.splice(idx, 1);
          } else {
              if (idx > -1) newAtt[idx] = { ...newAtt[idx], status_code: newStatus, shift_note: note };
              else newAtt.push({ host_id: hostId, date: dateStr, status_code: newStatus, shift_note: note });
          }
          return newAtt;
      });

      let error = null;
      if (newStatus === '') {
          if (existing && existing.id) {
              if (!note && !existing.shift_type) {
                  const res = await supabase.from('hsk_attendance').delete().eq('id', existing.id);
                  error = res.error;
              } else {
                  const res = await supabase.from('hsk_attendance').update({ status_code: '', shift_note: note }).eq('id', existing.id);
                  error = res.error;
              }
          }
      } else {
          if (existing && existing.id) {
              const res = await supabase.from('hsk_attendance').update({ status_code: newStatus, shift_note: note }).eq('id', existing.id);
              error = res.error;
          } else {
              const res = await supabase.from('hsk_attendance').insert({ host_id: hostId, date: dateStr, status_code: newStatus, shift_note: '', shift_type: '' });
              error = res.error;
          }
      }
      for (const l of links) {
          const res = await supabase.from('hsk_attendance').update({ shift_note: l.note }).eq('host_id', hostId).eq('date', l.date);
          error = error || res.error;
      }

      if (error) {
          toast.error("Failed to sync entry");
      } else if (links.length) {
          toast.success('Saved · RO link updated');
      }
      
      fetchData(false);
  };

  // host + date → row (the old version searched the whole list for every cell)
  const attMap = useMemo(() => {
      const m = new Map<string, any>();
      attendance.forEach(a => m.set(`${a.host_id}_${a.date}`, a));
      return m;
  }, [attendance]);

  const periodEnd = targetDateStr;
  const q = search.trim().toLowerCase();
  const groupedHosts = useMemo(() => {
      const groups: Record<string, any[]> = {};
      hosts.forEach(h => {
          if (q) {
              const nick = String(teamConfig.nicknames?.[h.host_id] || '');
              const hay = `${h.full_name} ${h.host_id} ${h.nicknames || ''} ${nick}`.toLowerCase();
              // "1718" finds "SSL 1718"
              if (!hay.includes(q) && !String(h.host_id).replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')) return;
          }
          const sheetDone = checkState(checks[h.host_id]?.sheet_upto || '', periodEnd) === 'done';
          const fusionDone = checkState(checks[h.host_id]?.fusion_upto || '', periodEnd) === 'done';
          if (checkFilter === 'sheet' && sheetDone) return;
          if (checkFilter === 'fusion' && fusionDone) return;
          const dep = hostSubDept(teamConfig, h);
          if (!groups[dep]) groups[dep] = [];
          groups[dep].push(h);
      });
      return groups;
  }, [hosts, teamConfig, q, checkFilter, checks, periodEnd]);

  // Department buttons always list every group (not just the ones the search left)
  const allDepartments = useMemo(() => [...new Set(hosts.map(h => hostSubDept(teamConfig, h)))].sort((a, b) => subDeptOrder(a) - subDeptOrder(b) || a.localeCompare(b)), [hosts, teamConfig]);
  const checkTotals = useMemo(() => {
      const t = { sheet: 0, fusion: 0, total: hosts.length };
      hosts.forEach(h => {
          const sd = checkState(checks[h.host_id]?.sheet_upto || '', periodEnd) === 'done';
          const fd = checkState(checks[h.host_id]?.fusion_upto || '', periodEnd) === 'done';
          if (sd) t.sheet++;
          if (fd) t.fusion++;
      });
      return t;
  }, [hosts, checks, periodEnd]);

  const me = () => { try { return JSON.parse(localStorage.getItem('hk_pulse_session') || 'null')?.full_name || ''; } catch { return ''; } };
  const openCheck = (host: any) => {
      const c = checks[host.host_id];
      setCheckEdit({ host, sheet: c?.sheet_upto || '', fusion: c?.fusion_upto || '' });
  };
  const saveCheck = async () => {
      if (!checkEdit) return;
      const { host, sheet, fusion } = checkEdit;
      const prev = checks[host.host_id];
      const now = new Date().toISOString();
      const who = me();
      const next: RosterCheck = {
          ...(prev || {}), period: periodKey, host_id: host.host_id, sheet_upto: sheet, fusion_upto: fusion,
          ...(sheet !== (prev?.sheet_upto || '') ? { sheet_by: who, sheet_at: now } : {}),
          ...(fusion !== (prev?.fusion_upto || '') ? { fusion_by: who, fusion_at: now } : {}),
      };
      setSavingCheck(true);
      try {
          // Re-read first: someone else may have ticked this person meanwhile
          const fresh = (await loadRosterChecks(periodKey))[host.host_id];
          const saved = await saveRosterCheck({ ...next, _id: fresh?._id });
          setChecks(c => { const n = { ...c }; if (saved.sheet_upto || saved.fusion_upto) n[host.host_id] = saved; else delete n[host.host_id]; return n; });
          setCheckEdit(null);
          toast.success(`${host.full_name.split(' ')[0]}: checklist saved`);
      } catch (e: any) {
          toast.error(`Could not save: ${e?.message || 'error'}`);
      } finally { setSavingCheck(false); }
  };

  const departmentsList = Object.keys(groupedHosts).sort((a, b) => subDeptOrder(a) - subDeptOrder(b) || a.localeCompare(b));
  const fmtUpto = (d: string) => (d ? format(parseISO(d), 'dd/MM') : '');
  const displayedDepartments = selectedDepartment === 'All' ? departmentsList : departmentsList.filter(d => d === selectedDepartment);
  const deptCount = useMemo(() => {
      const m: Record<string, number> = {};
      hosts.forEach(h => { const d = hostSubDept(teamConfig, h); m[d] = (m[d] || 0) + 1; });
      return m;
  }, [hosts, teamConfig]);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const thisRoster = sheetMonthFor(new Date());
  const isThisRoster = thisRoster.getFullYear() === year && thisRoster.getMonth() === month;
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // ---- shared by print + Excel ----
  const phDates = useMemo(() => new Set(publicHolidays.map((p: any) => p.date)), [publicHolidays]);
  const phName = (d: string) => publicHolidays.find((p: any) => p.date === d)?.name;
  const cellOf = (hostId: string, dateStr: string): RosterCell => {
      const host = hosts.find(h => h.host_id === hostId);
      const joined = host?.joining_date ? String(host.joining_date).slice(0, 10) : '';
      const lastDay = host?.status === 'Resigned' ? getResignedOn(teamConfig, hostId) : '';
      if (joined && dateStr < joined) return { code: '', worked: false, blocked: 'join' };
      if (lastDay && dateStr > lastDay) return { code: '', worked: false, blocked: 'left' };
      const r = attMap.get(`${hostId}_${dateStr}`);
      return { code: String(r?.status_code || '').trim().toUpperCase(), worked: !!r && isWorkedLeave(r), note: r?.shift_note || '', blocked: '' };
  };
  const visibleGroups: RosterGroup[] = displayedDepartments.map(dep => ({ dep, hosts: groupedHosts[dep] }));
  const periodTitle = format(currentDate, 'MMMM yyyy');
  const periodRange = `21 ${format(new Date(year, month - 1, 21), 'MMM')} – 20 ${format(new Date(year, month, 20), 'MMM yyyy')}`;
  const scopeLabel = selectedDepartment === 'All' ? 'All sub-departments' : selectedDepartment;
  const cfLabel = format(parseISO(prevTargetStr), 'dd MMM');
  const balLabel = format(parseISO(targetDateStr), 'dd MMM');

  const handlePrint = () => {
      if (!visibleGroups.length) return toast.error('Nobody to print');
      window.print();
  };

  const [exporting, setExporting] = useState(false);
  const handleExportXlsx = async () => {
      if (!visibleGroups.length) return toast.error('Nobody to export');
      setExporting(true);
      try {
          await exportRosterXlsx({
              fileName: `Roster ${selectedDepartment === 'All' ? 'All' : selectedDepartment} ${format(currentDate, 'MMM yyyy')}.xlsx`,
              title: periodTitle, range: periodRange, scope: scopeLabel, dates: monthDates, phDates, groups: visibleGroups,
              cellOf, cfLabel, balLabel, periodEnd, checks,
          });
          toast.success('Excel downloaded');
      } catch (e: any) {
          toast.error(`Export failed: ${e?.message || 'error'}`);
      } finally { setExporting(false); }
  };

  const legendCodes = ['O', 'AL', 'PH', 'SL', 'RO', 'RR', 'EL', 'NP', 'A'];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col p-3 md:p-6 gap-3">

      {/* HEADER */}
      <div className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link href="/attendance" className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center shrink-0" aria-label="Back to attendance">
                <ArrowLeft size={18} className="text-slate-600"/>
            </Link>
            <div className="min-w-0">
                <h1 className="text-lg font-black text-[#6D2158] tracking-tight">Monthly Roster</h1>
                <p className="text-[11px] font-bold text-slate-400">Roster runs 21st to 20th · tap a day to change it</p>
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button onClick={handlePrevMonth} className="w-9 h-9 hover:bg-white rounded-lg text-slate-500 flex items-center justify-center" aria-label="Previous roster"><ChevronLeft size={16}/></button>
                <div className="w-44 text-center leading-tight">
                    <div className="text-sm font-black text-[#6D2158]">{periodTitle}</div>
                    <div className="text-[10px] font-bold text-slate-500">{periodRange}</div>
                </div>
                <button onClick={handleNextMonth} className="w-9 h-9 hover:bg-white rounded-lg text-slate-500 flex items-center justify-center" aria-label="Next roster"><ChevronRight size={16}/></button>
            </div>
            {!isThisRoster && (
                <button onClick={() => setCurrentDate(thisRoster)} className="h-10 px-3 rounded-xl bg-amber-100 text-amber-800 text-xs font-black">This roster</button>
            )}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200" title="Paper size for printing">
                {(['A4', 'A3'] as const).map(pz => (
                    <button key={pz} onClick={() => setPaper(pz)} className={`h-8 px-2.5 rounded-lg text-[11px] font-black ${paper === pz ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500'}`}>{pz}</button>
                ))}
            </div>
            <button onClick={handlePrint} disabled={isLoading} className="h-10 px-3.5 bg-[#6D2158] text-white rounded-xl hover:bg-[#5a1b49] text-xs font-black flex items-center gap-1.5 disabled:opacity-40">
                <Printer size={15}/> Print
            </button>
            <button onClick={handleExportXlsx} disabled={isLoading || exporting} className="h-10 px-3.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-xs font-black flex items-center gap-1.5 disabled:opacity-40">
                {exporting ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>} Excel
            </button>
        </div>
      </div>

      {!isLoading && (
        <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2.5">
          {/* Search + checklist */}
          <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a host: name, nickname or SSL"
                      className="w-full h-10 pl-9 pr-8 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#6D2158] focus:bg-white" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600" aria-label="Clear search"><X size={14} /></button>}
              </div>
              <div className="flex flex-wrap items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                  {([['all', 'All', checkTotals.total], ['sheet', 'Sheet pending', checkTotals.total - checkTotals.sheet], ['fusion', 'Fusion pending', checkTotals.total - checkTotals.fusion]] as const).map(([k, label, n]) => (
                      <button key={k} onClick={() => setCheckFilter(k)} title={k === 'sheet' ? 'Signing sheet not checked to the 20th' : k === 'fusion' ? 'Fusion not updated to the 20th' : undefined}
                          className={`h-8 px-3 rounded-lg text-[11px] font-black flex items-center gap-1.5 ${checkFilter === k ? 'bg-[#6D2158] text-white' : 'text-slate-500 hover:bg-white'}`}>
                          {label}<span className={`px-1.5 rounded-md text-[10px] ${checkFilter === k ? 'bg-white/20' : 'bg-slate-200/70'}`}>{n}</span>
                      </button>
                  ))}
              </div>
              <div className="ml-auto flex items-center gap-3 text-[11px] font-bold text-slate-500">
                  <span className="flex items-center gap-1.5"><FileCheck2 size={13} className="text-emerald-600"/> Sheet {checkTotals.sheet}/{checkTotals.total}</span>
                  <span className="flex items-center gap-1.5"><MonitorCheck size={13} className="text-emerald-600"/> Fusion {checkTotals.fusion}/{checkTotals.total}</span>
              </div>
          </div>
          {/* Sub-departments */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
              {[['All', hosts.length] as const, ...allDepartments.map(d => [d, deptCount[d] || 0] as const)].map(([dep, n]) => (
                  <button key={dep} onClick={() => setSelectedDepartment(dep)}
                      className={`h-8 px-3 rounded-lg text-[11px] font-black whitespace-nowrap flex items-center gap-1.5 ${selectedDepartment === dep ? 'bg-[#6D2158] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {dep === 'All' ? 'All sub-departments' : dep}<span className={`text-[10px] ${selectedDepartment === dep ? 'text-white/70' : 'text-slate-400'}`}>{n}</span>
                  </button>
              ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
              {legendCodes.map(c => (
                  <span key={c} className="flex items-center gap-1">
                      <span className="inline-flex min-w-[22px] h-4 px-1 items-center justify-center rounded text-[9px] font-black" style={{ background: CODE_COLORS[c][0], color: CODE_COLORS[c][1] }}>{c}</span>{CODE_NAMES[c]}
                  </span>
              ))}
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Leave day worked (earns RO)</span>
              <span className="flex items-center gap-1"><span className="w-4 h-3 rounded-sm bg-slate-800" /> Not joined</span>
              <span>Blank = present</span>
          </div>
        </div>
      )}

      {/* SPREADSHEET */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 size={28} className="animate-spin text-[#6D2158] mb-3"/>
                  <span className="font-bold text-xs">Loading the roster…</span>
              </div>
          ) : !visibleGroups.length ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Search size={22} />
                  <span className="font-bold text-sm">{q ? `No host matches “${search}”` : checkFilter !== 'all' ? 'Everyone is done for this roster' : 'Nobody on this roster'}</span>
                  {(q || checkFilter !== 'all' || selectedDepartment !== 'All') && <button onClick={() => { setSearch(''); setCheckFilter('all'); setSelectedDepartment('All'); }} className="text-xs font-black text-[#6D2158]">Show everyone</button>}
              </div>
          ) : (
              <div className="overflow-auto w-full max-h-[calc(100vh-220px)]">
                  <table className="w-full border-separate border-spacing-0 text-[11px] bg-white select-none">
                      <thead>
                          <tr>
                              <th className="sticky top-0 left-0 z-30 bg-slate-100 border-b border-r border-slate-300 px-3 py-1.5 text-left font-black text-slate-500 text-[10px] uppercase tracking-wider min-w-[170px]">Host</th>
                              {monthDates.map(dateStr => {
                                  const d = parseISO(dateStr);
                                  const isFriday = d.getDay() === 5;
                                  const isPH = phDates.has(dateStr);
                                  const isToday = dateStr === todayStr;
                                  const cls = isToday ? 'bg-amber-300 text-amber-950' : isPH ? 'bg-blue-100 text-blue-800' : isFriday ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-500';
                                  return (
                                      <th key={dateStr} title={isPH ? phName(dateStr) : isToday ? 'Today' : undefined} className={`sticky top-0 z-20 border-b border-r border-slate-300 px-0 py-1 text-center min-w-[28px] font-black ${cls}`}>
                                          <div className="text-[11px] leading-none">{format(d, 'd')}</div>
                                          <div className="text-[8px] uppercase mt-0.5 font-bold opacity-80">{format(d, 'EEEEE')}</div>
                                      </th>
                                  );
                              })}
                              <th className="sticky top-0 z-20 border-b border-r border-l-2 border-l-slate-400 border-slate-300 px-1 py-1 text-center font-black text-emerald-700 bg-emerald-50 leading-tight min-w-[38px] text-[10px]" title={`OFF carried forward from the previous roster (${cfLabel})`}>CF<br/>OFF</th>
                              <th className="sticky top-0 z-20 border-b border-r border-slate-300 px-1 py-1 text-center font-black text-blue-700 bg-blue-50 leading-tight min-w-[38px] text-[10px]" title={`PH carried forward from the previous roster (${cfLabel})`}>CF<br/>PH</th>
                              <th className="sticky top-0 z-20 border-b border-r border-l-2 border-l-slate-400 border-slate-300 px-1 py-1 text-center font-black text-emerald-800 bg-emerald-100 leading-tight min-w-[38px] text-[10px]" title={`OFF balance at ${balLabel}`}>OFF<br/>BAL</th>
                              <th className="sticky top-0 z-20 border-b border-r border-slate-300 px-1 py-1 text-center font-black text-blue-800 bg-blue-100 leading-tight min-w-[38px] text-[10px]" title={`PH balance at ${balLabel}`}>PH<br/>BAL</th>
                              <th className="sticky top-0 z-20 border-b border-r border-slate-300 px-1 py-1 text-center font-black text-cyan-800 bg-cyan-100 leading-tight min-w-[42px] text-[10px]" title={`Annual leave balance at ${balLabel}`}>AL<br/>BAL</th>
                              <th className="sticky top-0 z-20 border-b border-l-2 border-l-slate-400 border-slate-300 px-1 py-1 text-center font-black text-slate-500 bg-slate-100 min-w-[96px] text-[10px] uppercase tracking-wider" title="Signing sheet checked / Fusion updated, up to">Check</th>
                          </tr>
                      </thead>
                      <tbody className="text-slate-700">
                          {visibleGroups.map(({ dep, hosts: list }) => {
                              const sheetDone = list.filter(h => checkState(checks[h.host_id]?.sheet_upto || '', periodEnd) === 'done').length;
                              const fusionDone = list.filter(h => checkState(checks[h.host_id]?.fusion_upto || '', periodEnd) === 'done').length;
                              return (
                              <React.Fragment key={dep}>
                                  <tr>
                                      <td className="sticky left-0 z-10 bg-slate-200 border-b border-slate-300 px-3 py-1.5">
                                          <div className="font-black text-[#6D2158] uppercase tracking-wider text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                                              <CalendarDays size={13}/> {dep} <span className="text-slate-500 font-bold normal-case tracking-normal">· {list.length}</span>
                                          </div>
                                      </td>
                                      <td colSpan={monthDates.length + 6} className="bg-slate-200 border-b border-slate-300 px-3 text-right text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                          Sheet {sheetDone}/{list.length} · Fusion {fusionDone}/{list.length}
                                      </td>
                                  </tr>

                                  {list.map((host: any) => {
                                      const nick = teamConfig.nicknames?.[host.host_id];
                                      const c = checks[host.host_id];
                                      const chip = (upto: string, label: string, Icon: React.ElementType) => {
                                          const st = checkState(upto, periodEnd);
                                          return (
                                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black whitespace-nowrap ${st === 'done' ? 'bg-emerald-100 text-emerald-700' : st === 'part' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-400'}`}>
                                                  {st === 'done' ? <Check size={9} /> : <Icon size={9} />} {label}{st === 'part' ? ` ${fmtUpto(upto)}` : ''}
                                              </span>
                                          );
                                      };
                                      return (
                                          <tr key={host.host_id} className="group">
                                              <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 px-3 py-1">
                                                  <div className="font-bold text-slate-800 truncate max-w-[200px]" title={host.full_name}>{host.full_name}</div>
                                                  <div className="text-[9px] text-slate-400 font-semibold truncate max-w-[200px]">{host.host_id}{nick ? ` · ${nick}` : ''} · {host.role}</div>
                                              </td>

                                              {monthDates.map(dateStr => {
                                                  const cell = cellOf(host.host_id, dateStr);
                                                  if (cell.blocked === 'join') return <td key={dateStr} title="Not joined yet" className="border-b border-r border-slate-700 bg-slate-800" />;
                                                  if (cell.blocked === 'left') return <td key={dateStr} title="After last working day" className="border-b border-r border-slate-300 bg-slate-300" />;
                                                  const col = CODE_COLORS[cell.code];
                                                  const d = parseISO(dateStr);
                                                  const isToday = dateStr === todayStr;
                                                  const plainBg = isToday ? '#FEF9C3' : phDates.has(dateStr) ? PH_FILL : d.getDay() === 5 ? FRIDAY_FILL : undefined;
                                                  const tip = [`${host.full_name} · ${format(d, 'EEE d MMM')}`, cell.code ? (CODE_NAMES[cell.code] || cell.code) : 'Not filled', cell.worked ? 'worked: earns 1 RO' : '', cell.note || ''].filter(Boolean).join('\n');
                                                  return (
                                                      <td key={dateStr} title={tip}
                                                          onClick={() => setEditCell({ hostId: host.host_id, hostName: host.full_name, dateStr, status: cell.code })}
                                                          className="relative border-b border-r border-slate-200 p-0 text-center font-black cursor-pointer hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-[#6D2158]"
                                                          style={{ background: col ? col[0] : plainBg, color: col ? col[1] : undefined }}>
                                                          <div className="h-7 flex items-center justify-center text-[10px]">{cell.code === 'P' ? '' : cell.code}</div>
                                                          {cell.worked && <span className="absolute bottom-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                                                          {cell.note && !cell.worked && <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-rose-400" />}
                                                      </td>
                                                  );
                                              })}

                                              <td className="border-b border-r border-l-2 border-l-slate-400 border-slate-200 px-1 text-center font-bold bg-emerald-50 text-emerald-700">{host.cfOff || '0'}</td>
                                              <td className="border-b border-r border-slate-200 px-1 text-center font-bold bg-blue-50 text-blue-700">{host.cfPH || '0'}</td>
                                              <td className="border-b border-r border-l-2 border-l-slate-400 border-slate-200 px-1 text-center font-black bg-emerald-100 text-emerald-800">{host.balOff || '0'}</td>
                                              <td className="border-b border-r border-slate-200 px-1 text-center font-black bg-blue-100 text-blue-800">{host.balPH || '0'}</td>
                                              <td className="border-b border-r border-slate-200 px-1 text-center font-black bg-cyan-100 text-cyan-800">{host.balAL || '0'}</td>
                                              <td className="border-b border-l-2 border-l-slate-400 border-slate-200 p-0.5 text-center">
                                                  <button onClick={() => openCheck(host)} className="w-full flex flex-col items-center gap-0.5 py-0.5 rounded-lg hover:bg-slate-100"
                                                      title={[c?.sheet_upto ? `Sheet checked to ${c.sheet_upto}${c.sheet_by ? ` by ${c.sheet_by}` : ''}` : 'Sheet not checked', c?.fusion_upto ? `Fusion updated to ${c.fusion_upto}${c.fusion_by ? ` by ${c.fusion_by}` : ''}` : 'Fusion not updated'].join('\n')}>
                                                      {chip(c?.sheet_upto || '', 'Sheet', FileCheck2)}
                                                      {chip(c?.fusion_upto || '', 'Fusion', MonitorCheck)}
                                                  </button>
                                              </td>
                                          </tr>
                                      );
                                  })}
                              </React.Fragment>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          )}
      </div>

      {/* PRINT-ONLY SHEET (rendered into <body>) */}
      {!isLoading && (
          <RosterPrint paper={paper} title={periodTitle} range={periodRange} scope={scopeLabel} dates={monthDates} phDates={phDates}
              groups={visibleGroups} cellOf={cellOf} cfLabel={cfLabel} balLabel={balLabel} printedBy={me()} />
      )}

      {/* CHECKLIST MODAL */}
      {checkEdit && (() => {
          const periodStartStr = format(new Date(year, month - 1, 21), 'yyyy-MM-dd');
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          const defaultUpto = todayStr < periodEnd ? (todayStr < periodStartStr ? periodStartStr : todayStr) : periodEnd;
          const c = checks[checkEdit.host.host_id];
          const row = (key: 'sheet' | 'fusion', title: string, hint: string, Icon: React.ElementType, by?: string, at?: string) => {
              const v = checkEdit[key];
              const st = checkState(v, periodEnd);
              return (
                  <div className={`rounded-2xl border p-3 ${st === 'done' ? 'border-emerald-200 bg-emerald-50/50' : st === 'part' ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200'}`}>
                      <div className="flex items-center gap-2">
                          <Icon size={16} className="text-[#6D2158]" />
                          <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-800">{title}</p>
                              <p className="text-[10px] font-semibold text-slate-400">{hint}</p>
                          </div>
                          <button onClick={() => setCheckEdit({ ...checkEdit, [key]: v ? '' : periodEnd })}
                              className={`h-8 px-3 rounded-lg text-[11px] font-black ${st === 'done' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                              {st === 'done' ? 'Full roster ✓' : 'Full roster'}
                          </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Up to</label>
                          <input type="date" min={periodStartStr} max={periodEnd} value={v}
                              onChange={e => setCheckEdit({ ...checkEdit, [key]: e.target.value })}
                              className="h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold" />
                          {!v && <button onClick={() => setCheckEdit({ ...checkEdit, [key]: defaultUpto })} className="text-[11px] font-bold text-[#6D2158]">to {format(parseISO(defaultUpto), 'dd MMM')}</button>}
                          {v && <button onClick={() => setCheckEdit({ ...checkEdit, [key]: '' })} className="text-[11px] font-bold text-rose-500">Clear</button>}
                      </div>
                      {by && <p className="mt-1 text-[10px] font-semibold text-slate-400">Last set by {by}{at ? ` · ${format(new Date(at), 'dd MMM HH:mm')}` : ''}</p>}
                  </div>
              );
          };
          return (
              <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget && !savingCheck) setCheckEdit(null); }}>
                  <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                          <div>
                              <h3 className="font-black text-lg text-[#6D2158]">{checkEdit.host.full_name}</h3>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{checkEdit.host.host_id} · roster 21 {format(new Date(year, month - 1, 21), 'MMM')} – 20 {format(new Date(year, month, 20), 'MMM')}</p>
                          </div>
                          <button onClick={() => setCheckEdit(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500" aria-label="Close"><X size={16} /></button>
                      </div>
                      {row('sheet', 'Signing sheet checked', 'Signed sheet tallies with this roster', FileCheck2, c?.sheet_by, c?.sheet_at)}
                      {row('fusion', 'Fusion updated', 'Days entered in Fusion', MonitorCheck, c?.fusion_by, c?.fusion_at)}
                      <button onClick={saveCheck} disabled={savingCheck} className="h-11 rounded-xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">
                          {savingCheck ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save
                      </button>
                  </div>
              </div>
          );
      })()}

      {/* EDITOR MODAL */}
      {editCell && (
          <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={e => { if (e.target === e.currentTarget) setEditCell(null); }}>
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-5 animate-in zoom-in-95 flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                      <div>
                          <h3 className="font-black text-lg text-[#6D2158]">{format(parseISO(editCell.dateStr), 'EEEE d MMM yyyy')}</h3>
                          <p className="text-xs font-bold text-slate-400 mt-0.5">{editCell.hostName}{phDates.has(editCell.dateStr) ? ` · PH: ${phName(editCell.dateStr) || 'public holiday'}` : ''}</p>
                      </div>
                      <button onClick={() => setEditCell(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500" aria-label="Close"><X size={18}/></button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                      {STATUS_CODES.map(code => {
                          const isSelected = editCell.status === code || (code === 'O' && editCell.status === 'OFF') || (code === 'AL' && editCell.status === 'VAC');
                          const col = CODE_COLORS[code];
                          return (
                              <button key={code} onClick={() => handleSaveCell(code)} title={CODE_NAMES[code] || code}
                                  className={`h-12 rounded-xl text-xs font-black border-2 transition-all active:scale-95 flex flex-col items-center justify-center leading-none ${isSelected ? 'border-[#6D2158] ring-2 ring-[#6D2158]/20' : 'border-transparent hover:border-slate-300'}`}
                                  style={{ background: col ? col[0] : '#F1F5F9', color: col ? col[1] : '#334155' }}>
                                  {code}
                                  {CODE_NAMES[code] && <span className="text-[8px] font-bold opacity-70 mt-1 truncate max-w-full px-1">{CODE_NAMES[code]}</span>}
                              </button>
                          );
                      })}
                      <button onClick={() => handleSaveCell('')} title="Clear this day"
                          className={`h-12 rounded-xl text-xs font-black border-2 transition-all active:scale-95 ${editCell.status === '' ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-transparent bg-slate-50 text-rose-500 hover:border-rose-200'}`}>
                          Clear
                      </button>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400">Notes and “working day” comments are kept. Edit them on the main attendance sheet.</p>
              </div>
          </div>
      )}
    </div>
  );
}

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

const STATUS_CODES = ['P', 'O', 'AL', 'PH', 'RR', 'SL', 'NP', 'A', 'CL', 'PA', 'MA', 'EL', 'OT', 'RO'];

const STATUS_COLORS: Record<string, string> = {
  'O': 'text-emerald-600 bg-emerald-50',
  'OFF': 'text-emerald-600 bg-emerald-50',
  'AL': 'text-cyan-600 bg-cyan-50', 
  'VAC': 'text-cyan-600 bg-cyan-50', 
  'PH': 'text-blue-600 bg-blue-50', 
  'RR': 'text-fuchsia-600 bg-fuchsia-50',
  'SL': 'text-rose-600 bg-rose-50',
  'NP': 'text-rose-800 bg-rose-200',
  'A': 'text-white bg-red-500',
  'RO': 'text-yellow-800 bg-yellow-200',
  'CL': 'text-amber-700 bg-amber-50',
  'PA': 'text-teal-700 bg-teal-50',
  'MA': 'text-pink-700 bg-pink-50',
  'EL': 'text-orange-700 bg-orange-50',
  'OT': 'text-slate-800 bg-slate-100',
};

// The sheet runs 21st → 20th and is named after the month of the 20th: from the 21st, today is in next month's sheet.
const sheetMonthFor = (d: Date) => (d.getDate() >= 21 ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : new Date(d.getFullYear(), d.getMonth(), 1));
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

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
          if (checkFilter === 'sheet' && checkState(checks[h.host_id]?.sheet_upto || '', periodEnd) === 'done') return;
          if (checkFilter === 'fusion' && checkState(checks[h.host_id]?.fusion_upto || '', periodEnd) === 'done') return;
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
          if (checkState(checks[h.host_id]?.sheet_upto || '', periodEnd) === 'done') t.sheet++;
          if (checkState(checks[h.host_id]?.fusion_upto || '', periodEnd) === 'done') t.fusion++;
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

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
      let csv = 'Sub-department,Host ID,Name,Role,';
      monthDates.forEach(d => csv += `${format(parseISO(d), 'dd MMM')},`);
      csv += `CF OFF (${prevTargetStr}),CF PH,OFF (${targetDateStr}),PH,AL,Sheet checked to,Fusion updated to\n`;

      displayedDepartments.forEach(dep => {
          groupedHosts[dep].forEach(host => {
              csv += `${csvCell(dep)},${csvCell(host.host_id)},${csvCell(host.full_name)},${csvCell(host.role)},`;
              const joined = host.joining_date ? String(host.joining_date).slice(0, 10) : '';
              const lastDay = host.status === 'Resigned' ? getResignedOn(teamConfig, host.host_id) : '';
              monthDates.forEach(dateStr => {
                  if ((joined && dateStr < joined) || (lastDay && dateStr > lastDay)) { csv += ','; return; }
                  const record = attMap.get(`${host.host_id}_${dateStr}`);
                  const worked = !!record && isWorkedLeave(record);
                  const val = record?.status_code || '';
                  csv += `${val === 'P' ? '' : worked ? `${val}(W)` : val},`;
              });
              const c = checks[host.host_id];
              csv += `${host.cfOff || 0},${host.cfPH || 0},${host.balOff || 0},${host.balPH || 0},${host.balAL || 0},${c?.sheet_upto || ''},${c?.fusion_upto || ''}\n`;
          });
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Roster_${selectedDepartment === 'All' ? 'All' : selectedDepartment}_${format(currentDate, 'MMM_yyyy')}.csv`;
      a.click();
      toast.success("Downloaded CSV");
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col p-4 md:p-8">
      
      {/* HEADER (Hidden in Print) */}
      <div className="print:hidden flex flex-col xl:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-4 gap-4">
        <div className="flex items-center gap-4 w-full xl:w-auto">
            <Link href="/attendance" className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors shrink-0">
                <ArrowLeft size={20} className="text-slate-600"/>
            </Link>
            <div>
                <h1 className="text-xl font-black text-[#6D2158] uppercase tracking-tight">Monthly Roster</h1>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">21st to 20th Planner</p>
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto justify-end">
            <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors"><ChevronLeft size={16}/></button>
                <div className="w-56 text-center font-black text-[#6D2158] uppercase tracking-widest leading-tight">
                    <div className="text-sm">{format(currentDate, 'MMMM yyyy')}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">21 {format(new Date(year, month - 1, 21), 'MMM')} - 20 {format(new Date(year, month, 20), 'MMM')}</div>
                </div>
                <button onClick={handleNextMonth} className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors"><ChevronRight size={16}/></button>
            </div>

            <button onClick={handleExportCSV} className="bg-emerald-100 text-emerald-800 p-2.5 rounded-xl hover:bg-emerald-200 transition-colors shadow-sm" title="Export to Excel">
                <Download size={18}/>
            </button>
            <button onClick={handlePrint} className="bg-[#6D2158] text-white p-2.5 rounded-xl hover:bg-[#5a1b49] transition-colors shadow-md" title="Print Sheet">
                <Printer size={18}/>
            </button>
        </div>
      </div>

      {/* SEARCH + CHECKLIST SUMMARY */}
      {!isLoading && (
          <div className="print:hidden flex flex-wrap items-center gap-2 mb-3">
              <div className="relative w-full sm:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find one host: name, nickname or SSL"
                      className="w-full h-10 pl-9 pr-8 rounded-xl bg-white border border-slate-200 text-xs font-bold outline-none focus:border-[#6D2158]" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600" aria-label="Clear search"><X size={14} /></button>}
              </div>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
                  {([['all', `Everyone · ${checkTotals.total}`], ['sheet', `Sheet to check · ${checkTotals.total - checkTotals.sheet}`], ['fusion', `Fusion to update · ${checkTotals.total - checkTotals.fusion}`]] as const).map(([k, label]) => (
                      <button key={k} onClick={() => setCheckFilter(k)}
                          className={`h-8 px-3 rounded-lg text-[11px] font-black ${checkFilter === k ? 'bg-[#6D2158] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>
                  ))}
              </div>
              <p className="text-[11px] font-bold text-slate-400">Sheet {checkTotals.sheet}/{checkTotals.total} · Fusion {checkTotals.fusion}/{checkTotals.total} done to {format(parseISO(periodEnd), 'dd MMM')}</p>
          </div>
      )}

      {/* DEPARTMENT FILTER BUTTONS */}
      {!isLoading && (
          <div className="print:hidden flex flex-wrap gap-2 mb-4">
              <button 
                  onClick={() => setSelectedDepartment('All')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${selectedDepartment === 'All' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
              >
                  All Departments
              </button>
              {allDepartments.map(dep => (
                  <button 
                      key={dep}
                      onClick={() => setSelectedDepartment(dep)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${selectedDepartment === dep ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                  >
                      {dep}
                  </button>
              ))}
          </div>
      )}

      {/* PRINT HEADER (Only visible in Print) */}
      <div className="hidden print:flex justify-between items-end mb-4 border-b-2 border-slate-800 pb-2">
          <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-black">Monthly Roster & Balances</h1>
              <p className="text-sm font-bold uppercase tracking-widest text-slate-600">
                  {selectedDepartment === 'All' ? 'Housekeeping Department' : selectedDepartment}
              </p>
          </div>
          <div className="text-right">
              <div className="text-xl font-black uppercase tracking-widest text-black">
                  {format(currentDate, 'MMMM yyyy')}
              </div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  21 {format(new Date(year, month - 1, 21), 'MMM')} - 20 {format(new Date(year, month, 20), 'MMM')}
              </div>
          </div>
      </div>

      {/* SPREADSHEET */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-none print:shadow-none print:rounded-none">
          {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 size={32} className="animate-spin text-[#6D2158] mb-4"/>
                  <span className="font-bold tracking-widest uppercase text-xs">Generating Roster...</span>
              </div>
          ) : (
              <div className="overflow-x-auto w-full print:overflow-visible">
                  <table className="w-full table-auto border-collapse text-[10px] bg-white print:text-[8px] select-none">
                      <thead className="bg-slate-100 print:bg-slate-200">
                          <tr>
                              <th className="border border-slate-300 px-2 py-1 text-left font-black uppercase tracking-widest min-w-[140px] md:w-[15%] print:w-40 sticky left-0 z-10 bg-slate-100 print:bg-slate-200">Host Name</th>
                              
                              {/* Highlighted Date Headers */}
                              {monthDates.map(dateStr => {
                                  const d = parseISO(dateStr);
                                  const isFriday = format(d, 'E') === 'Fri';
                                  const isPH = publicHolidays.some(ph => ph.date === dateStr);
                                  const phName = isPH ? publicHolidays.find(ph => ph.date === dateStr)?.name : undefined;

                                  let bgClass = 'bg-slate-100 text-slate-500 print:bg-slate-200 print:text-slate-600';
                                  if (isPH) bgClass = 'bg-blue-200 text-blue-800 print:bg-blue-100';
                                  else if (isFriday) bgClass = 'bg-rose-200 text-rose-800 print:bg-rose-100';

                                  return (
                                      <th key={dateStr} title={phName} className={`border border-slate-300 px-0.5 py-1 text-center min-w-[22px] font-black ${bgClass}`}>
                                          <div className="leading-none">{format(d, 'dd')}</div>
                                          <div className="text-[7px] uppercase mt-0.5">{format(d, 'EE')}</div>
                                      </th>
                                  );
                              })}

                              {/* Balances: carried forward from the previous roster, and at the end of this one */}
                              <th className="border-y border-r border-l-2 border-slate-300 p-1 text-center font-black text-emerald-700 bg-emerald-50 leading-tight min-w-[34px]" title={`OFF balance carried forward (end of previous roster, ${format(parseISO(prevTargetStr), 'dd MMM')})`}>CF<br/>OFF</th>
                              <th className="border border-slate-300 p-1 text-center font-black text-blue-700 bg-blue-50 leading-tight min-w-[34px]" title={`PH balance carried forward (end of previous roster, ${format(parseISO(prevTargetStr), 'dd MMM')})`}>CF<br/>PH</th>
                              <th className="border-y border-r border-l-2 border-slate-300 p-1 text-center font-black text-emerald-800 bg-emerald-200 leading-tight min-w-[34px]" title={`OFF balance at the end of this roster (${format(parseISO(targetDateStr), 'dd MMM')})`}>OFF<br/>BAL</th>
                              <th className="border border-slate-300 p-1 text-center font-black text-blue-800 bg-blue-200 leading-tight min-w-[34px]" title={`PH balance at the end of this roster (${format(parseISO(targetDateStr), 'dd MMM')})`}>PH<br/>BAL</th>
                              <th className="border border-slate-300 p-1 text-center font-black text-cyan-800 bg-cyan-200 leading-tight min-w-[38px]" title={`Annual leave balance (${format(parseISO(targetDateStr), 'dd MMM')})`}>AL<br/>BAL</th>
                              <th className="print:hidden border-y border-r border-l-2 border-slate-300 p-1 text-center font-black text-slate-600 bg-slate-100 leading-tight min-w-[92px]" title="Signing sheet checked / Fusion updated, up to">CHECK</th>
                          </tr>
                      </thead>
                      <tbody className="font-medium text-slate-700">
                          {displayedDepartments.map(dep => (
                              <React.Fragment key={dep}>
                                  {/* Department Subheader */}
                                  <tr className="bg-slate-200 print:bg-slate-300">
                                      <td colSpan={monthDates.length + 7} className="p-2 border border-slate-300">
                                          <div className="font-black text-slate-800 uppercase tracking-widest text-xs flex items-center gap-2">
                                              <CalendarDays size={14} className="text-[#6D2158]"/> {dep}
                                          </div>
                                      </td>
                                  </tr>

                                  {/* Staff Rows */}
                                  {groupedHosts[dep].map(host => {
                                      const lastDay = host.status === 'Resigned' ? getResignedOn(teamConfig, host.host_id) : '';

                                      return (
                                          <tr key={host.host_id} className="hover:bg-slate-50 print:break-inside-avoid">
                                              <td className="border border-slate-200 px-2 py-1 sticky left-0 z-10 bg-white print:bg-transparent">
                                                  <div className="font-bold truncate w-32 md:w-full" title={host.full_name}>{host.full_name}</div>
                                                  <div className="text-[8px] text-slate-400 uppercase tracking-widest truncate">{host.host_id}</div>
                                              </td>

                                              {/* Interactive Cells */}
                                              {monthDates.map(dateStr => {
                                                  const record = attMap.get(`${host.host_id}_${dateStr}`);
                                                  const val = record?.status_code || '';
                                                  // Leave on paper but "working day" in the comment → counted as worked
                                                  const worked = !!record && isWorkedLeave(record);
                                                  const joinedOn = host.joining_date ? String(host.joining_date).slice(0, 10) : '';
                                                  if (joinedOn && dateStr < joinedOn) {
                                                      return <td key={dateStr} title="Not joined yet" className="border border-slate-800 p-0 bg-slate-900 print:bg-black box-border" />;
                                                  }
                                                  if (lastDay && dateStr > lastDay) {
                                                      return <td key={dateStr} title={`Resigned · last working day ${lastDay}`} className="border border-slate-300 p-0 bg-slate-300 print:bg-slate-400 box-border" />;
                                                  }

                                                  const displayVal = val === 'P' ? '' : val;
                                                  const colorClass = STATUS_COLORS[val] || '';

                                                  const d = parseISO(dateStr);
                                                  const isFriday = format(d, 'E') === 'Fri';
                                                  const isPH = publicHolidays.some(ph => ph.date === dateStr);
                                                  
                                                  let cellBg = '';
                                                  if (!val) {
                                                      if (isPH) cellBg = 'bg-blue-50/50 print:bg-transparent';
                                                      else if (isFriday) cellBg = 'bg-rose-50/50 print:bg-transparent';
                                                  }

                                                  return (
                                                      <td 
                                                          key={dateStr} 
                                                          onClick={() => setEditCell({ hostId: host.host_id, hostName: host.full_name, dateStr, status: val })}
                                                          className={`relative border border-slate-200 p-0 text-center font-bold print:border-slate-400 cursor-pointer hover:ring-2 hover:ring-inset hover:ring-[#6D2158] transition-all box-border ${colorClass} ${cellBg}`}
                                                      >
                                                          <div className="w-full h-full min-h-[24px] flex flex-col items-center justify-center leading-none" title={worked ? 'Worked (comment says working day) — earns 1 RO' : record?.shift_note || undefined}>
                                                              {displayVal}
                                                              {worked && <span className="absolute bottom-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 print:bg-black" />}
                                                          </div>
                                                      </td>
                                                  );
                                              })}

                                              {/* Balances */}
                                              <td className="border-y border-r border-l-2 border-slate-300 p-1 text-center font-bold bg-emerald-50/60 text-emerald-700">{host.cfOff || '0'}</td>
                                              <td className="border border-slate-200 p-1 text-center font-bold bg-blue-50/60 text-blue-700">{host.cfPH || '0'}</td>
                                              <td className="border-y border-r border-l-2 border-slate-300 p-1 text-center font-black bg-emerald-100/60 text-emerald-800">{host.balOff || '0'}</td>
                                              <td className="border border-slate-200 p-1 text-center font-black bg-blue-100/60 text-blue-800">{host.balPH || '0'}</td>
                                              <td className="border border-slate-200 p-1 text-center font-black bg-cyan-100/60 text-cyan-800">{host.balAL || '0'}</td>

                                              {/* Checklist: signing sheet checked / Fusion updated, up to */}
                                              {(() => {
                                                  const c = checks[host.host_id];
                                                  const chip = (upto: string, label: string, Icon: React.ElementType) => {
                                                      const st = checkState(upto, periodEnd);
                                                      return (
                                                          <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-black whitespace-nowrap ${st === 'done' ? 'bg-emerald-100 text-emerald-700' : st === 'part' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-400'}`}>
                                                              {st === 'done' ? <Check size={9} /> : <Icon size={9} />} {label}{st === 'part' ? ` ${fmtUpto(upto)}` : ''}
                                                          </span>
                                                      );
                                                  };
                                                  return (
                                                      <td className="print:hidden border-y border-r border-l-2 border-slate-300 p-0.5 text-center">
                                                          <button onClick={() => openCheck(host)} className="w-full flex flex-col items-center gap-0.5 py-0.5 rounded hover:bg-slate-50"
                                                              title={[c?.sheet_upto ? `Sheet checked to ${c.sheet_upto}${c.sheet_by ? ` by ${c.sheet_by}` : ''}` : 'Sheet not checked', c?.fusion_upto ? `Fusion updated to ${c.fusion_upto}${c.fusion_by ? ` by ${c.fusion_by}` : ''}` : 'Fusion not updated'].join('\n')}>
                                                              {chip(c?.sheet_upto || '', 'Sheet', FileCheck2)}
                                                              {chip(c?.fusion_upto || '', 'Fusion', MonitorCheck)}
                                                          </button>
                                                      </td>
                                                  );
                                              })()}
                                          </tr>
                                      );
                                  })}
                              </React.Fragment>
                          ))}
                      </tbody>
                  </table>
              </div>
          )}
      </div>

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
          <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 flex flex-col relative">
                  <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                      <div>
                          <h3 className="font-black text-xl text-[#6D2158] flex items-center gap-2">
                              {format(parseISO(editCell.dateStr), 'dd MMM yyyy')}
                          </h3>
                          <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{editCell.hostName}</p>
                      </div>
                      <button onClick={() => setEditCell(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors text-slate-500"><X size={18}/></button>
                  </div>
                  
                  <div className="mb-6">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">Set Status Code</label>
                      <div className="grid grid-cols-4 gap-2">
                          {STATUS_CODES.map(code => {
                              const isSelected = editCell.status === code || (code === 'O' && editCell.status === 'OFF') || (code === 'AL' && editCell.status === 'VAC');
                              return (
                                  <button 
                                      key={code}
                                      onClick={() => handleSaveCell(code)}
                                      className={`p-3 rounded-xl text-xs font-black border-2 transition-all active:scale-95 ${isSelected ? 'border-[#6D2158] bg-[#6D2158]/10 text-[#6D2158] shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                                  >
                                      {code}
                                  </button>
                              );
                          })}
                          <button 
                              onClick={() => handleSaveCell('')}
                              className={`p-3 rounded-xl text-xs font-black border-2 transition-all active:scale-95 ${editCell.status === '' ? 'border-rose-500 bg-rose-50 text-rose-600 shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-rose-200 hover:text-rose-500'}`}
                              title="Clear Entry"
                          >
                              CLR
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
            body { background: white; margin: 0; padding: 0; }
            @page { size: A4 landscape; margin: 10mm; }
        }
      `}} />
    </div>
  );
}
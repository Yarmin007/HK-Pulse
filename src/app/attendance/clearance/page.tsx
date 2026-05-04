"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, CalendarDays, AlertTriangle, ShieldCheck, 
  Loader2, Download, Search, ChevronLeft, ChevronRight, UserCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { computeLeaveBalancesRPC } from '@/lib/payrollMath';

export default function LeaveClearancePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'AL' | 'OFF' | 'PH'>('AL');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [hosts, setHosts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<{date: string, name: string}[]>([]);
  const [historicalStats, setHistoricalStats] = useState<any[]>([]);
  
  const [teamConfig, setTeamConfig] = useState<any>({ hostDepartments: {}, nicknames: {}, excludeAttendance: {} });
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Payroll Cycle Calculation (For Pending Offs)
  const today = new Date();
  const cycleStart = useMemo(() => {
      let start = new Date(today.getFullYear(), today.getMonth(), 21);
      if (today.getDate() < 21) {
          start = new Date(today.getFullYear(), today.getMonth() - 1, 21);
      }
      return start;
  }, [today]);
  
  const cycleEnd = useMemo(() => new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 20), [cycleStart]);

  const totalFridaysInCycle = useMemo(() => {
      let count = 0;
      let curr = new Date(cycleStart);
      while (curr <= cycleEnd) {
          if (curr.getDay() === 5) count++;
          curr.setDate(curr.getDate() + 1);
      }
      return count;
  }, [cycleStart, cycleEnd]);

  useEffect(() => {
      fetchData();
  }, [selectedYear]);

  const loadAttendanceData = async () => {
      let allData: any[] = [];
      let from = 0;
      let step = 1000;
      let hasMore = true;

      while (hasMore) {
          const { data, error } = await supabase
              .from('hsk_attendance')
              .select('id, host_id, date, status_code')
              .gte('date', `${selectedYear}-01-01`)
              .lte('date', `${selectedYear}-12-31`)
              .range(from, from + step - 1);

          if (error) break;

          if (data && data.length > 0) {
              allData.push(...data);
              from += step;
              if (data.length < step) hasMore = false;
          } else {
              hasMore = false;
          }
      }

      return allData.map(a => ({ ...a, date: a.date ? String(a.date).split('T')[0] : '' }));
  };

  const fetchData = async () => {
      setIsLoading(true);
      const targetDateStr = format(new Date(), 'yyyy-MM-dd'); // Live balances as of today

      const [constRes, hostRes, rpcRes] = await Promise.all([
          supabase.from('hsk_constants').select('*').in('type', ['public_holiday', 'role_rank', 'team_viewer_config']),
          supabase.from('hsk_hosts').select('*').neq('status', 'Resigned'),
          supabase.rpc('get_all_attendance_stats', { p_target_date: targetDateStr })
      ]);
      
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
          setTeamConfig(config);
          setPublicHolidays(phs);
      }
      
      const rawAtt = await loadAttendanceData();

      let sortedHosts = [];
      if (hostRes.data) {
          sortedHosts = hostRes.data.sort((a, b) => {
              const rankA = ranks[(a.role || '').toLowerCase().trim()] ?? 999;
              const rankB = ranks[(b.role || '').toLowerCase().trim()] ?? 999;
              if (rankA !== rankB) return rankA - rankB;
              
              const numA = parseInt((a.host_id || '').replace(/\D/g, ''), 10) || 999999;
              const numB = parseInt((b.host_id || '').replace(/\D/g, ''), 10) || 999999;
              return numA - numB;
          });
      }

      setHistoricalStats(rpcRes.data || []);
      setAttendance(rawAtt);

      const hostsWithBals = sortedHosts.map(h => {
           const b = computeLeaveBalancesRPC(h, rawAtt, rpcRes.data || [], targetDateStr, phs, []);
           return { ...h, ...(b || {}) };
      });

      setHosts(hostsWithBals);
      setIsLoading(false);
  };

  // --- FILTERING ---
  const groupedHosts = useMemo(() => {
      const groups: Record<string, any[]> = {};
      hosts.forEach(h => {
          if (teamConfig.excludeAttendance?.[h.host_id]) return;
          const dep = teamConfig.hostDepartments?.[h.host_id] || h.role || 'Unassigned';
          if (!groups[dep]) groups[dep] = [];
          groups[dep].push(h);
      });
      return groups;
  }, [hosts, teamConfig]);

  const departmentsList = Object.keys(groupedHosts).sort();
  
  const filteredHosts = useMemo(() => {
      let filtered = selectedDepartment === 'All' 
          ? hosts 
          : hosts.filter(h => (teamConfig.hostDepartments?.[h.host_id] || h.role || 'Unassigned') === selectedDepartment);

      filtered = filtered.filter(h => !teamConfig.excludeAttendance?.[h.host_id]);

      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(h => 
              h.full_name.toLowerCase().includes(q) || 
              h.host_id.toLowerCase().includes(q)
          );
      }
      return filtered;
  }, [hosts, selectedDepartment, searchQuery, teamConfig]);

  // --- DATA PROCESSING LOGIC ---

  // 1. Annual Leave Data (Projected EOY Balance)
  const alData = useMemo(() => {
      return filteredHosts.map(host => {
          const monthly = Array(12).fill(0);
          let totalTaken = 0;
          
          attendance.forEach(a => {
              if (a.host_id === host.host_id && ['AL', 'VAC'].includes(a.status_code)) {
                  const m = parseISO(a.date).getMonth();
                  monthly[m]++;
                  totalTaken++;
              }
          });

          // Calculate Projected EOY Balance
          let yearlyEarned = 30; // Standard 30 days AL
          const joinDate = host.joining_date ? parseISO(host.joining_date) : null;
          
          if (joinDate && joinDate.getFullYear() === selectedYear) {
              const joinMonth = joinDate.getMonth();
              yearlyEarned = (12 - joinMonth) * 2.5; // Prorate if joined this year
          } else if (joinDate && joinDate.getFullYear() > selectedYear) {
              yearlyEarned = 0; // Hasn't joined yet in the selected year
          }

          const projectedAL = (host.cf_al || 0) + yearlyEarned - totalTaken;

          return { ...host, monthly, totalTaken, projectedAL };
      });
  }, [filteredHosts, attendance, selectedYear]);

  // AL Footer Stats
  const alTotals = useMemo(() => {
      const monthlyTotals = Array(12).fill(0);
      let grandTotalTaken = 0;
      let grandTotalBalance = 0;

      alData.forEach(h => {
          h.monthly.forEach((val: number, i: number) => monthlyTotals[i] += val);
          grandTotalTaken += h.totalTaken;
          grandTotalBalance += h.projectedAL;
      });

      const avgBalance = alData.length > 0 ? (grandTotalBalance / alData.length).toFixed(1) : 0;
      return { monthlyTotals, grandTotalTaken, grandTotalBalance, avgBalance };
  }, [alData]);

  // 2. Pending OFF Data (21st to 20th)
  const offData = useMemo(() => {
      const startStr = format(cycleStart, 'yyyy-MM-dd');
      const endStr = format(cycleEnd, 'yyyy-MM-dd');

      return filteredHosts.map(host => {
          let takenInCycle = 0;
          attendance.forEach(a => {
              if (a.host_id === host.host_id && ['O', 'OFF'].includes(a.status_code)) {
                  if (a.date >= startStr && a.date <= endStr) {
                      takenInCycle++;
                  }
              }
          });

          return { 
              ...host, 
              takenInCycle, 
              earnedFridays: totalFridaysInCycle 
          };
      });
  }, [filteredHosts, attendance, cycleStart, cycleEnd, totalFridaysInCycle]);

  // 3. Public Holiday Data (FIFO 60-Day Expiry)
  const phData = useMemo(() => {
      const results: any[] = [];
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      filteredHosts.forEach(host => {
          const earned: string[] = [];
          const taken: string[] = [];

          // Find taken PHs
          attendance.forEach(a => {
              if (a.host_id === host.host_id && a.status_code === 'PH') taken.push(a.date);
          });

          // Find earned PHs
          publicHolidays.forEach(ph => {
              if (ph.date > todayStr) return; // Only past/current PHs
              const att = attendance.find(a => a.host_id === host.host_id && a.date === ph.date);
              const status = att?.status_code;
              const leaveCodes = ['O', 'OFF', 'AL', 'VAC', 'PH', 'SL', 'NP', 'MA', 'EL', 'A'];
              if (!leaveCodes.includes(status || '')) {
                  earned.push(ph.date);
              }
          });

          earned.sort();
          taken.sort();

          let takenCount = taken.length;
          const pendingPHs: any[] = [];

          earned.forEach(earnedDate => {
              if (takenCount > 0) {
                  takenCount--;
              } else {
                  const expiry = addDays(parseISO(earnedDate), 60);
                  const daysLeft = differenceInDays(expiry, new Date());
                  pendingPHs.push({ date: earnedDate, expiry: format(expiry, 'yyyy-MM-dd'), daysLeft });
              }
          });

          if (pendingPHs.length > 0) {
              const mostUrgent = Math.min(...pendingPHs.map(p => p.daysLeft));
              results.push({ ...host, pendingPHs, mostUrgent });
          }
      });

      return results.sort((a, b) => a.mostUrgent - b.mostUrgent);
  }, [filteredHosts, attendance, publicHolidays]);

  // --- EXCEL EXPORT ---
  const handleExportAL = () => {
      const headers = ['SSL No', 'Name', 'Designation', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Total Taken', 'Projected EOY Balance'];
      const rows = alData.map(h => [
          h.host_id, h.full_name, h.role,
          ...h.monthly,
          h.totalTaken,
          h.projectedAL.toFixed(1)
      ]);

      rows.push([
          '', 'DEPARTMENT TOTALS', '',
          ...alTotals.monthlyTotals,
          alTotals.grandTotalTaken,
          alTotals.grandTotalBalance.toFixed(1)
      ]);
      rows.push([ '', `Average AL Balance per Staff: ${alTotals.avgBalance}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '' ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Annual_Leave_Clearance");
      XLSX.writeFile(wb, `AL_Clearance_${selectedYear}_${selectedDepartment}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-[#FDFBFD] font-sans text-slate-800 flex flex-col">
      
      {/* COMPACT HEADER */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 shadow-sm z-10 shrink-0">
          <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
              <div className="flex items-center gap-3">
                  <Link href="/attendance" className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors shrink-0 text-slate-500 hover:text-[#6D2158]">
                      <ArrowLeft size={16} />
                  </Link>
                  <div>
                      <h1 className="text-lg font-black text-[#6D2158] uppercase tracking-tight leading-tight">Leave Clearance</h1>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Department Tracking</p>
                  </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-32 md:w-48">
                      <Search className="absolute left-2.5 top-1.5 text-slate-400" size={12}/>
                      <input type="text" placeholder="Search Host..." className="w-full pl-7 pr-2 py-1.5 border border-slate-200 rounded-full font-bold text-[10px] bg-slate-50 focus:bg-white focus:border-[#6D2158] outline-none shadow-inner transition-colors" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                  
                  {activeTab === 'AL' && (
                      <div className="flex items-center bg-slate-50 p-0.5 rounded-full border border-slate-200 shadow-inner">
                          <button onClick={() => setSelectedYear(y => y - 1)} className="p-1 hover:bg-white rounded-full text-slate-500 transition-colors"><ChevronLeft size={14}/></button>
                          <div className="w-10 text-center font-black text-[10px] text-[#6D2158]">{selectedYear}</div>
                          <button onClick={() => setSelectedYear(y => y + 1)} className="p-1 hover:bg-white rounded-full text-slate-500 transition-colors"><ChevronRight size={14}/></button>
                      </div>
                  )}

                  {activeTab === 'AL' && (
                      <button onClick={handleExportAL} className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-emerald-100 transition-colors shadow-sm">
                          <Download size={12}/> Export
                      </button>
                  )}
              </div>
          </div>
      </div>

      <div className="flex-1 p-3 md:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-4">
          
          {/* TABS & FILTERS - COMPACT */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-200 shrink-0">
              
              <div className="flex gap-1 bg-slate-50 p-1 rounded-full border border-slate-100 w-full md:w-auto overflow-x-auto no-scrollbar">
                  <button onClick={() => setActiveTab('AL')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all whitespace-nowrap ${activeTab === 'AL' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white'}`}>
                      <CalendarDays size={14}/> Annual Leave
                  </button>
                  <button onClick={() => setActiveTab('OFF')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all whitespace-nowrap ${activeTab === 'OFF' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white'}`}>
                      <AlertTriangle size={14}/> Pending Offs
                  </button>
                  <button onClick={() => setActiveTab('PH')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all whitespace-nowrap ${activeTab === 'PH' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white'}`}>
                      <ShieldCheck size={14}/> PH Expiry
                  </button>
              </div>

              {!isLoading && (
                  <div className="flex flex-wrap gap-1.5 px-1">
                      <button onClick={() => setSelectedDepartment('All')} className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all shadow-sm ${selectedDepartment === 'All' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>All</button>
                      {departmentsList.map(dep => (
                          <button key={dep} onClick={() => setSelectedDepartment(dep)} className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all shadow-sm ${selectedDepartment === dep ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>{dep}</button>
                      ))}
                  </div>
              )}
          </div>

          {/* MAIN CONTENT AREA */}
          {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 size={32} className="animate-spin text-[#6D2158] mb-4"/>
                  <span className="font-bold tracking-widest uppercase text-[10px]">Loading Ledgers...</span>
              </div>
          ) : (
              <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                  <div className="overflow-auto flex-1 custom-scrollbar w-full">
                      
                      {/* TAB 1: ANNUAL LEAVE */}
                      {activeTab === 'AL' && (
                          <table className="w-full text-left border-collapse text-[10px] select-none">
                              <thead className="bg-white sticky top-0 z-20 shadow-sm border-b border-slate-100">
                                  <tr className="uppercase tracking-widest text-slate-400 font-black">
                                      {/* TIGHTER COLUMNS TO PREVENT HORIZONTAL SCROLL */}
                                      <th className="p-2 w-8 text-center bg-white sticky left-0 z-30 shadow-[2px_0_8px_rgba(0,0,0,0.02)]">#</th>
                                      <th className="p-2 w-14 bg-white sticky left-[32px] z-30 shadow-[2px_0_8px_rgba(0,0,0,0.02)]">SSL</th>
                                      <th className="p-2 w-36 bg-white sticky left-[88px] z-30 shadow-[2px_0_8px_rgba(0,0,0,0.02)]">Host Name</th>
                                      <th className="p-2 w-24 bg-white sticky left-[232px] z-30 shadow-[2px_0_8px_rgba(0,0,0,0.05)]">Role</th>
                                      
                                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
                                          <th key={m} className="p-2 text-center w-8">{m}</th>
                                      ))}
                                      
                                      <th className="p-2 text-center text-rose-500 w-16">Taken</th>
                                      <th className="p-2 text-center text-cyan-600 w-20 pr-4" title="Projected End of Year Balance">EOY Bal</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50 font-medium">
                                  {alData.map((host, idx) => (
                                      <tr key={host.host_id} className="hover:bg-slate-50/50 transition-colors group">
                                          <td className="p-2 text-center font-bold text-slate-400 bg-white group-hover:bg-slate-50/50 sticky left-0 z-10 transition-colors">{idx + 1}</td>
                                          <td className="p-2 font-bold text-[9px] bg-white group-hover:bg-slate-50/50 sticky left-[32px] z-10 transition-colors">{host.host_id}</td>
                                          <td className="p-2 font-bold text-slate-800 truncate max-w-[9rem] bg-white group-hover:bg-slate-50/50 sticky left-[88px] z-10 transition-colors" title={host.full_name}>{host.full_name}</td>
                                          <td className="p-2 text-[8px] text-slate-500 uppercase truncate max-w-[6rem] bg-white group-hover:bg-slate-50/50 sticky left-[232px] z-10 shadow-[2px_0_8px_rgba(0,0,0,0.02)] transition-colors" title={host.role}>{host.role}</td>
                                          
                                          {host.monthly.map((val: number, i: number) => (
                                              <td key={i} className={`p-2 text-center font-bold ${val > 0 ? 'text-cyan-600' : 'text-slate-300'}`}>
                                                  {val > 0 ? val : '-'}
                                              </td>
                                          ))}

                                          <td className="p-2 text-center">
                                              <span className="bg-rose-50 text-rose-600 px-2 py-1 rounded border border-rose-100 font-black inline-block min-w-[24px]">{host.totalTaken}</span>
                                          </td>
                                          <td className="p-2 text-center pr-4">
                                              <div className="bg-[#6D2158] text-white px-2 py-1 rounded font-black inline-block min-w-[32px] shadow-sm text-[10px]">
                                                  {host.projectedAL.toFixed(1)}
                                              </div>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                              <tfoot className="bg-slate-50 sticky bottom-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] font-black uppercase tracking-widest text-[9px]">
                                  <tr>
                                      <td colSpan={4} className="p-3 text-right text-slate-500 sticky left-0 bg-slate-50 z-30">Dept. Totals:</td>
                                      {alTotals.monthlyTotals.map((val: number, i: number) => (
                                          <td key={i} className="p-3 text-center text-slate-700">{val}</td>
                                      ))}
                                      <td className="p-3 text-center text-rose-700">{alTotals.grandTotalTaken}</td>
                                      <td className="p-3 text-center text-[#6D2158] pr-4">
                                          <div className="text-xs">{alTotals.grandTotalBalance.toFixed(1)}</div>
                                          <div className="text-[7px] text-slate-400 mt-0.5 lowercase tracking-normal">avg {alTotals.avgBalance} / host</div>
                                      </td>
                                  </tr>
                              </tfoot>
                          </table>
                      )}

                      {/* TAB 2: PENDING OFF (RO) */}
                      {activeTab === 'OFF' && (
                          <div className="p-4 max-w-4xl mx-auto">
                              <div className="mb-6 p-4 bg-amber-50 rounded-2xl flex items-center justify-between shadow-sm border border-amber-100">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
                                          <AlertTriangle size={20}/>
                                      </div>
                                      <div>
                                          <h3 className="font-black text-amber-800 uppercase tracking-widest text-xs">Payroll Cycle</h3>
                                          <p className="text-[10px] font-bold text-amber-600 mt-0.5">{format(cycleStart, 'dd MMM yyyy')} to {format(cycleEnd, 'dd MMM yyyy')}</p>
                                      </div>
                                  </div>
                                  <div className="text-right bg-white px-4 py-2 rounded-xl shadow-sm border border-amber-100">
                                      <p className="text-2xl font-black text-amber-600">{totalFridaysInCycle}</p>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Fridays to clear</p>
                                  </div>
                              </div>

                              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                                  <table className="w-full text-left border-collapse text-[10px] select-none">
                                      <thead className="bg-slate-50/50 uppercase tracking-widest text-slate-400 font-black border-b border-slate-100">
                                          <tr>
                                              <th className="p-3 w-12 text-center">#</th>
                                              <th className="p-3">Host Identity</th>
                                              <th className="p-3 text-center text-amber-600">Fridays Earned</th>
                                              <th className="p-3 text-center text-emerald-600">Offs Taken</th>
                                              <th className="p-3 text-center text-[#6D2158]">Pending Balance</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50 font-medium">
                                          {offData.map((host, idx) => {
                                              const pending = host.earnedFridays - host.takenInCycle;
                                              const hasPending = pending > 0;
                                              return (
                                                  <tr key={host.host_id} className="hover:bg-slate-50/50 transition-colors">
                                                      <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                                                      <td className="p-3">
                                                          <div className="flex items-center gap-2.5">
                                                              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-black text-[9px] shrink-0">
                                                                  <UserCheck size={12}/>
                                                              </div>
                                                              <div>
                                                                  <div className="font-bold text-slate-800 text-xs">{host.full_name}</div>
                                                                  <div className="text-[8px] text-slate-400 uppercase tracking-widest mt-0.5">{host.host_id} • {host.role}</div>
                                                              </div>
                                                          </div>
                                                      </td>
                                                      <td className="p-3 text-center">
                                                          <span className="font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-100">{host.earnedFridays}</span>
                                                      </td>
                                                      <td className="p-3 text-center">
                                                          <span className="font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">{host.takenInCycle}</span>
                                                      </td>
                                                      <td className="p-3 text-center">
                                                          <span className={`px-3 py-1.5 rounded-lg font-black text-xs shadow-sm inline-block min-w-[40px] ${hasPending ? 'bg-[#6D2158] text-white' : 'bg-slate-100 text-slate-400 shadow-none'}`}>
                                                              {pending > 0 ? `+${pending}` : '0'}
                                                          </span>
                                                      </td>
                                                  </tr>
                                              )
                                          })}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      )}

                      {/* TAB 3: PH CLEARANCE */}
                      {activeTab === 'PH' && (
                          <div className="p-4">
                              <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm gap-3">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                          <ShieldCheck size={20}/>
                                      </div>
                                      <div>
                                          <h3 className="font-black text-blue-800 uppercase tracking-widest text-xs">60-Day Expiry Tracker</h3>
                                          <p className="text-[10px] font-bold text-blue-600 mt-0.5">FIFO matching for Public Holidays</p>
                                      </div>
                                  </div>
                                  <div className="text-right bg-white px-4 py-2 rounded-xl shadow-sm border border-blue-100 w-full md:w-auto flex justify-between md:block items-center">
                                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest md:mb-0.5">Staff with Pending PH</p>
                                      <p className="text-2xl font-black text-blue-700">{phData.length}</p>
                                  </div>
                              </div>

                              {phData.length === 0 ? (
                                  <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl shadow-sm max-w-lg mx-auto">
                                      <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                          <ShieldCheck size={32} className="text-emerald-500"/>
                                      </div>
                                      <p className="text-lg font-black text-slate-700 uppercase tracking-tight">All Clear!</p>
                                      <p className="text-xs font-bold text-slate-400 mt-1">No staff have pending public holidays.</p>
                                  </div>
                              ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                                      {phData.map(host => (
                                          <div key={host.host_id} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col">
                                              <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
                                                  <div className="pr-3">
                                                      <h4 className="font-black text-slate-800 text-xs truncate">{host.full_name}</h4>
                                                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">{host.host_id} • {host.role}</p>
                                                  </div>
                                                  <div className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm shrink-0 border border-blue-100">
                                                      {host.pendingPHs.length} PH
                                                  </div>
                                              </div>
                                              <div className="space-y-3 flex-1">
                                                  {host.pendingPHs.map((ph: any, i: number) => {
                                                      const isDanger = ph.daysLeft <= 14;
                                                      const isExpired = ph.daysLeft <= 0;
                                                      const barColor = isExpired ? 'bg-slate-300' : isDanger ? 'bg-rose-500' : 'bg-emerald-500';
                                                      const pct = isExpired ? 0 : Math.max(0, Math.min(100, (ph.daysLeft / 60) * 100));

                                                      return (
                                                          <div key={i} className="flex flex-col gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                                              <div className="flex justify-between text-[10px] font-bold items-center">
                                                                  <span className="text-slate-600 flex items-center gap-1.5"><CalendarDays size={10} className="text-slate-400"/> {format(parseISO(ph.date), 'dd MMM yyyy')}</span>
                                                                  <span className={`px-2 py-0.5 rounded border uppercase tracking-widest text-[8px] ${isExpired ? 'bg-rose-50 border-rose-100 text-rose-700' : isDanger ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                                                                      {isExpired ? 'EXPIRED' : `${ph.daysLeft} days`}
                                                                  </span>
                                                              </div>
                                                              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden shadow-inner">
                                                                  <div className={`h-full ${barColor} transition-all duration-1000 ease-out`} style={{ width: `${pct}%` }}></div>
                                                              </div>
                                                              <div className="text-[8px] font-bold text-slate-400 text-right uppercase tracking-widest">
                                                                  Expires: <span className={isExpired ? 'text-rose-500' : 'text-slate-500'}>{format(parseISO(ph.expiry), 'dd MMM yyyy')}</span>
                                                              </div>
                                                          </div>
                                                      );
                                                  })}
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      )}

                  </div>
              </div>
          )}
      </div>
    </div>
  );
}
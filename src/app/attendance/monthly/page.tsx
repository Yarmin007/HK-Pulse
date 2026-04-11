"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Printer, ArrowLeft, Download, CalendarDays, Filter, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { computeLeaveBalancesRPC } from '@/lib/payrollMath';

const STATUS_CODES = ['P', 'O', 'AL', 'PH', 'RR', 'SL', 'NP', 'A', 'CL', 'PA', 'MA', 'EL', 'RO'];

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
};

export default function MonthlyAttendanceSheet() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [hosts, setHosts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  
  const [teamConfig, setTeamConfig] = useState<any>({});
  const [publicHolidays, setPublicHolidays] = useState<any[]>([]);
  const [roleRanks, setRoleRanks] = useState<Record<string, number>>({});

  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  
  const [editCell, setEditCell] = useState<{ hostId: string, hostName: string, dateStr: string, status: string } | null>(null);

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

  useEffect(() => {
      fetchData();
  }, [year, month]);

  // ⚡ FIX: Bypasses 1000 row limit by looping through the entire database exactly like the master attendance page does
  const loadAttendanceData = async (startD: string, endD: string) => {
      let allData: any[] = [];
      let from = 0;
      let step = 1000;
      let hasMore = true;

      while (hasMore) {
          const { data, error } = await supabase
              .from('hsk_attendance')
              .select('id, host_id, date, status_code')
              .gte('date', startD)
              .lte('date', endD)
              .range(from, from + step - 1);

          if (error) {
              console.error("Error fetching attendance:", error);
              break;
          }

          if (data && data.length > 0) {
              allData.push(...data);
              from += step;
              if (data.length < step) hasMore = false;
          } else {
              hasMore = false;
          }
      }

      return allData.map(a => ({
          ...a,
          date: a.date ? String(a.date).split('T')[0] : ''
      }));
  };

  const fetchData = async (showLoading = true) => {
      if (showLoading) setIsLoading(true);

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
          setRoleRanks(ranks);
          setTeamConfig(config);
          setPublicHolidays(phs);
      }
      
      const prevYear = year - 1;
      const formattedAtt = await loadAttendanceData(`${prevYear}-12-21`, `${year}-12-31`);

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

      const hostsWithBals = sortedHosts.map(h => {
           const b = computeLeaveBalancesRPC(h, formattedAtt, rpcRes.data || [], targetDateStr, phs, []);
           return { ...h, ...(b || {}) };
      });

      setHosts(hostsWithBals);
      setAttendance(formattedAtt);
      
      if (showLoading) setIsLoading(false);
  };

  const handleSaveCell = async (newStatus: string) => {
      if (!editCell) return;
      const { hostId, dateStr } = editCell;

      setEditCell(null);

      setAttendance(prev => {
          const newAtt = [...prev];
          const idx = newAtt.findIndex(a => a.host_id === hostId && a.date === dateStr);
          if (newStatus === '') {
              if (idx > -1) newAtt.splice(idx, 1);
          } else {
              if (idx > -1) newAtt[idx] = { ...newAtt[idx], status_code: newStatus };
              else newAtt.push({ host_id: hostId, date: dateStr, status_code: newStatus });
          }
          return newAtt;
      });
      
      const { data: existingArr } = await supabase.from('hsk_attendance').select('id, shift_note, shift_type').eq('host_id', hostId).eq('date', dateStr).limit(1);
      const existing = existingArr?.[0];
      
      let error = null;
      if (newStatus === '') {
          if (existing && existing.id) {
              if (!existing.shift_note && !existing.shift_type) {
                  const res = await supabase.from('hsk_attendance').delete().eq('id', existing.id);
                  error = res.error;
              } else {
                  const res = await supabase.from('hsk_attendance').update({ status_code: '' }).eq('id', existing.id);
                  error = res.error;
              }
          }
      } else {
          if (existing && existing.id) {
              const res = await supabase.from('hsk_attendance').update({ status_code: newStatus }).eq('id', existing.id);
              error = res.error;
          } else {
              const res = await supabase.from('hsk_attendance').insert({ host_id: hostId, date: dateStr, status_code: newStatus, shift_note: '', shift_type: '' });
              error = res.error;
          }
      }

      if (error) {
          toast.error("Failed to sync entry");
      }
      
      fetchData(false);
  };

  const groupedHosts = useMemo(() => {
      const groups: Record<string, any[]> = {};
      hosts.forEach(h => {
          const dep = teamConfig.hostDepartments?.[h.host_id] || h.role || 'Unassigned';
          if (!groups[dep]) groups[dep] = [];
          groups[dep].push(h);
      });
      return groups;
  }, [hosts, teamConfig]);

  const departmentsList = Object.keys(groupedHosts).sort();
  const displayedDepartments = selectedDepartment === 'All' ? departmentsList : departmentsList.filter(d => d === selectedDepartment);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
      let csv = 'Department,Host ID,Name,Role,';
      monthDates.forEach(d => csv += `${format(parseISO(d), 'dd MMM')},`);
      csv += 'Bal OFF,Bal PH,Plan OFF,Plan PH,Plan AL\n';

      displayedDepartments.forEach(dep => {
          groupedHosts[dep].forEach(host => {
              csv += `"${dep}",${host.host_id},"${host.full_name}",${host.role},`;
              let o=0, al=0, ph=0;

              monthDates.forEach(dateStr => {
                  const record = attendance.find(a => a.host_id === host.host_id && a.date === dateStr);
                  const val = record?.status_code || '';
                  csv += `${val === 'P' ? '' : val},`;

                  if (['O', 'OFF'].includes(val)) o++;
                  if (['AL', 'VAC'].includes(val)) al++;
                  if (val === 'PH') ph++;
              });
              csv += `${host.balOff || 0},${host.balPH || 0},${o},${ph},${al}\n`;
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

      {/* DEPARTMENT FILTER BUTTONS */}
      {!isLoading && (
          <div className="print:hidden flex flex-wrap gap-2 mb-4">
              <button 
                  onClick={() => setSelectedDepartment('All')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${selectedDepartment === 'All' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
              >
                  All Departments
              </button>
              {departmentsList.map(dep => (
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

                              {/* Summary Columns */}
                              <th className="border-y border-r border-l-2 border-slate-300 p-1 text-center font-black text-emerald-800 bg-emerald-200 leading-tight w-[4%] min-w-[32px]" title="Total Off Balance">BAL<br/>OFF</th>
                              <th className="border border-slate-300 p-1 text-center font-black text-blue-800 bg-blue-200 leading-tight w-[4%] min-w-[32px]" title="Total PH Balance">BAL<br/>PH</th>
                              
                              <th className="border border-slate-300 p-1 text-center font-black text-emerald-700 bg-emerald-100 leading-tight w-[4%] min-w-[32px]" title="Planned/Taken Off Days">PLN<br/>OFF</th>
                              <th className="border border-slate-300 p-1 text-center font-black text-blue-700 bg-blue-100 leading-tight w-[4%] min-w-[32px]" title="Planned/Taken Public Holiday">PLN<br/>PH</th>
                              <th className="border border-slate-300 p-1 text-center font-black text-cyan-700 bg-cyan-100 leading-tight w-[4%] min-w-[32px]" title="Planned/Taken Annual Leave">PLN<br/>AL</th>
                          </tr>
                      </thead>
                      <tbody className="font-medium text-slate-700">
                          {displayedDepartments.map(dep => (
                              <React.Fragment key={dep}>
                                  {/* Department Subheader */}
                                  <tr className="bg-slate-200 print:bg-slate-300">
                                      <td colSpan={monthDates.length + 6} className="p-2 border border-slate-300">
                                          <div className="font-black text-slate-800 uppercase tracking-widest text-xs flex items-center gap-2">
                                              <CalendarDays size={14} className="text-[#6D2158]"/> {dep}
                                          </div>
                                      </td>
                                  </tr>

                                  {/* Staff Rows */}
                                  {groupedHosts[dep].map(host => {
                                      let o=0, al=0, ph=0;

                                      return (
                                          <tr key={host.host_id} className="hover:bg-slate-50 print:break-inside-avoid">
                                              <td className="border border-slate-200 px-2 py-1 sticky left-0 z-10 bg-white print:bg-transparent">
                                                  <div className="font-bold truncate w-32 md:w-full" title={host.full_name}>{host.full_name}</div>
                                                  <div className="text-[8px] text-slate-400 uppercase tracking-widest truncate">{host.host_id}</div>
                                              </td>

                                              {/* Interactive Cells */}
                                              {monthDates.map(dateStr => {
                                                  const record = attendance.find(a => a.host_id === host.host_id && a.date === dateStr);
                                                  const val = record?.status_code || '';
                                                  
                                                  if (['O', 'OFF'].includes(val)) o++;
                                                  if (['AL', 'VAC'].includes(val)) al++;
                                                  if (val === 'PH') ph++;

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
                                                          className={`border border-slate-200 p-0 text-center font-bold print:border-slate-400 cursor-pointer hover:ring-2 hover:ring-inset hover:ring-[#6D2158] transition-all box-border ${colorClass} ${cellBg}`}
                                                      >
                                                          <div className="w-full h-full min-h-[24px] flex items-center justify-center">
                                                              {displayVal}
                                                          </div>
                                                      </td>
                                                  );
                                              })}

                                              {/* Master Balances */}
                                              <td className="border-y border-r border-l-2 border-slate-300 p-1 text-center font-black bg-emerald-100/50 text-emerald-800">{host.balOff || '0'}</td>
                                              <td className="border border-slate-200 p-1 text-center font-black bg-blue-100/50 text-blue-800">{host.balPH || '0'}</td>
                                              
                                              {/* Planned/Taken within this exact grid period */}
                                              <td className="border border-slate-200 p-1 text-center font-black text-emerald-600 bg-slate-50 print:border-slate-400">{o || '-'}</td>
                                              <td className="border border-slate-200 p-1 text-center font-black text-blue-600 bg-slate-50 print:border-slate-400">{ph || '-'}</td>
                                              <td className="border border-slate-200 p-1 text-center font-black text-cyan-600 bg-slate-50 print:border-slate-400">{al || '-'}</td>
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
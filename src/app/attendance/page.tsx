"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Wand2, Loader2, UserCheck, 
  ChevronLeft, ChevronRight, Save, X, Calendar as CalIcon, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { 
  startOfMonth, endOfMonth, eachDayOfInterval, format, 
  differenceInDays, parseISO, isAfter, isBefore 
} from 'date-fns';
import toast from 'react-hot-toast';

// --- CONFIG ---
const STATUS_CODES = ['P', 'O', 'AL', 'PH', 'SL', 'NP', 'A', 'CL', 'PA', 'MA', 'EL', 'OT'];

const STATUS_COLORS: Record<string, string> = {
  'P': 'bg-slate-50 text-slate-700',
  'OT': 'bg-slate-100 text-slate-800 font-black',
  'O': 'bg-emerald-100 text-emerald-700 font-black',
  'AL': 'bg-blue-100 text-blue-700 font-black',
  'PH': 'bg-purple-100 text-purple-700 font-black',
  'SL': 'bg-rose-100 text-rose-700 font-black',
  'NP': 'bg-rose-200 text-rose-800 font-black',
  'A': 'bg-red-500 text-white font-black',
  'CL': 'bg-amber-100 text-amber-700 font-black',
  'PA': 'bg-teal-100 text-teal-700 font-black',
  'MA': 'bg-pink-100 text-pink-700 font-black',
  'EL': 'bg-orange-100 text-orange-700 font-black',
};

export default function AttendancePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Data
  const [hosts, setHosts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Magic Paste State
  const [isMagicOpen, setIsMagicOpen] = useState(false);
  const [magicText, setMagicText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [magicResults, setMagicResults] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const fetchData = async () => {
    setIsLoading(true);
    
    // 1. Fetch Hosts
    const { data: hostData } = await supabase.from('hsk_hosts').select('*').neq('status', 'Resigned').order('full_name');
    if (hostData) setHosts(hostData);

    // 2. Fetch ALL Attendance (Need all history to calculate accurate balances)
    const { data: attData } = await supabase.from('hsk_attendance').select('*');
    if (attData) setAttendance(attData);

    setIsLoading(false);
  };

  // --- MATH ENGINE: CALCULATE BALANCES ---
  const hostBalances = useMemo(() => {
    const today = new Date();
    
    return hosts.map(host => {
      const joinDate = host.joining_date ? parseISO(host.joining_date) : parseISO('2025-01-01');
      const hostRecords = attendance.filter(a => a.host_id === host.host_id);
      
      // 1. Accruals (Off & AL) - Stop counting if date is in the future
      const daysSinceJoin = Math.max(0, differenceInDays(today, joinDate));
      
      // Penalty days pause accrual
      const penaltyDays = hostRecords.filter(a => ['SL', 'NP', 'A'].includes(a.status_code)).length;
      const eligibleDays = Math.max(0, daysSinceJoin - penaltyDays);
      
      const earnedOffs = Math.floor(eligibleDays / 7);
      const earnedAL = Math.floor(eligibleDays / 12);
      
      const takenOffs = hostRecords.filter(a => a.status_code === 'O').length;
      const takenAL = hostRecords.filter(a => a.status_code === 'AL').length;

      // 2. Fixed Quotas (Reset on Anniversary)
      let lastAnniversary = new Date(joinDate);
      lastAnniversary.setFullYear(today.getFullYear());
      if (isAfter(lastAnniversary, today)) {
          lastAnniversary.setFullYear(today.getFullYear() - 1);
      }
      
      const recordsThisYear = hostRecords.filter(a => isAfter(parseISO(a.date), lastAnniversary) || parseISO(a.date).getTime() === lastAnniversary.getTime());
      
      const takenSL = recordsThisYear.filter(a => a.status_code === 'SL').length;
      const takenEL = recordsThisYear.filter(a => a.status_code === 'EL').length;

      return {
        ...host,
        balOff: earnedOffs - takenOffs,
        balAL: earnedAL - takenAL,
        balSL: 30 - takenSL,
        balEL: 10 - takenEL
      };
    });
  }, [hosts, attendance]);

  // --- GRID SETUP ---
  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth)
    });
  }, [currentMonth]);

  // --- HANDLERS ---
  const handleStatusChange = async (hostId: string, dateStr: string, newStatus: string) => {
    // Optimistic UI Update
    const existingIdx = attendance.findIndex(a => a.host_id === hostId && a.date === dateStr);
    const newAtt = [...attendance];
    
    if (newStatus === '') {
        if (existingIdx > -1) newAtt.splice(existingIdx, 1);
        await supabase.from('hsk_attendance').delete().match({ host_id: hostId, date: dateStr });
    } else {
        if (existingIdx > -1) {
            newAtt[existingIdx] = { ...newAtt[existingIdx], status_code: newStatus };
        } else {
            newAtt.push({ host_id: hostId, date: dateStr, status_code: newStatus });
        }
        await supabase.from('hsk_attendance').upsert({ host_id: hostId, date: dateStr, status_code: newStatus }, { onConflict: 'host_id, date' });
    }
    
    setAttendance(newAtt);
  };

  const handleMagicParse = async () => {
    if (!magicText.trim()) return;
    setIsParsing(true);
    try {
        const res = await fetch('/api/magic-roster', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: magicText, 
                date: format(currentMonth, 'yyyy-MM-dd') 
            })
        });
        
        if (!res.ok) throw new Error("API Error");
        const data = await res.json();
        setMagicResults(data);
        toast.success("Parsed successfully!");
    } catch (err) {
        toast.error("Failed to parse message. Please check format.");
    }
    setIsParsing(false);
  };

  const handleMagicSave = async () => {
    if (!magicResults || !magicResults.records) return;
    setIsParsing(true);
    
    const payload = magicResults.records.map((r: any) => ({
        host_id: r.host_id,
        date: magicResults.date,
        status_code: r.status_code,
        shift_note: r.shift_note || ''
    }));

    const { error } = await supabase.from('hsk_attendance').upsert(payload, { onConflict: 'host_id, date' });
    
    setIsParsing(false);
    if (error) {
        toast.error("Error saving roster: " + error.message);
    } else {
        toast.success("Roster Applied!");
        setIsMagicOpen(false);
        setMagicText('');
        setMagicResults(null);
        fetchData(); // Refresh grid
    }
  };

  const filteredHosts = hostBalances.filter(h => h.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || h.host_id.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-[#FDFBFD] font-sans text-slate-800 overflow-hidden">
      
      {/* HEADER */}
      <div className="flex-none flex flex-col md:flex-row justify-between items-center bg-white border-b border-slate-200 px-6 py-4 z-10 shadow-sm gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-[#6D2158]/10 p-2.5 rounded-xl text-[#6D2158] hidden md:block">
             <UserCheck size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#6D2158] uppercase tracking-tight">Attendance & Leave</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Automated HR Engine</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Month Navigator */}
            <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <button onClick={() => setCurrentMonth(startOfMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1))))} className="p-1.5 hover:bg-white rounded-lg text-slate-500"><ChevronLeft size={16}/></button>
                <div className="w-32 text-center font-bold text-sm text-[#6D2158] uppercase tracking-wider">{format(currentMonth, 'MMM yyyy')}</div>
                <button onClick={() => setCurrentMonth(startOfMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1))))} className="p-1.5 hover:bg-white rounded-lg text-slate-500"><ChevronRight size={16}/></button>
            </div>

            <div className="relative flex-1 md:w-48">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                <input type="text" placeholder="Search Host..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl font-bold text-xs bg-slate-50 focus:bg-white focus:border-[#6D2158] outline-none transition-all shadow-inner" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>

            <button onClick={() => setIsMagicOpen(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md hover:bg-emerald-700 transition-all">
                <Wand2 size={14}/> Magic Paste
            </button>
        </div>
      </div>

      {/* SPREADSHEET AREA */}
      <div className="flex-1 p-4 flex flex-col relative overflow-hidden bg-slate-100">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col relative">
              {isLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                      <Loader2 size={32} className="animate-spin text-[#6D2158] mb-4"/>
                      <span className="font-bold tracking-widest uppercase text-xs">Loading Roster...</span>
                  </div>
              ) : (
                  <div className="overflow-auto flex-1 custom-scrollbar w-full relative">
                      <table className="w-max border-separate border-spacing-0 text-[10px] whitespace-nowrap bg-white">
                          <thead className="sticky top-0 z-40 bg-white">
                              <tr>
                                  <th rowSpan={2} className="sticky left-0 z-50 bg-slate-100 border-b-2 border-r border-slate-300 p-3 text-left w-48 min-w-[192px] shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                      <span className="block font-black uppercase text-slate-500 tracking-widest">Host Name</span>
                                      <span className="block text-[8px] font-bold text-slate-400 mt-1">ID & Designation</span>
                                  </th>
                                  
                                  {/* Balance Headers */}
                                  <th colSpan={4} className="bg-slate-50 border-b border-r-2 border-slate-300 p-2 text-center font-black uppercase text-[#6D2158] tracking-widest">Live Balances</th>
                                  
                                  {/* Days Headers */}
                                  {daysInMonth.map((d, i) => (
                                      <th key={i} className={`p-1.5 text-center border-b border-r border-slate-200 w-10 min-w-[40px] text-[9px] font-bold uppercase ${['Sat', 'Sun'].includes(format(d, 'E')) ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400'}`}>
                                          {format(d, 'E')}
                                      </th>
                                  ))}
                              </tr>
                              <tr>
                                  <th className="bg-emerald-50 border-b-2 border-r border-slate-300 p-1.5 text-center font-bold text-emerald-700 w-12" title="Off Days">OFF</th>
                                  <th className="bg-blue-50 border-b-2 border-r border-slate-300 p-1.5 text-center font-bold text-blue-700 w-12" title="Annual Leave">AL</th>
                                  <th className="bg-rose-50 border-b-2 border-r border-slate-300 p-1.5 text-center font-bold text-rose-700 w-12" title="Sick Leave (30 Max)">SL</th>
                                  <th className="bg-orange-50 border-b-2 border-r-2 border-slate-300 p-1.5 text-center font-bold text-orange-700 w-12" title="Emergency Leave (10 Max)">EL</th>
                                  
                                  {/* Day Numbers */}
                                  {daysInMonth.map((d, i) => (
                                      <th key={i} className={`p-1.5 text-center border-b-2 border-r border-slate-300 font-black text-xs ${['Sat', 'Sun'].includes(format(d, 'E')) ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-700'}`}>
                                          {format(d, 'd')}
                                      </th>
                                  ))}
                              </tr>
                          </thead>
                          
                          <tbody className="font-medium">
                              {filteredHosts.map(host => (
                                  <tr key={host.id} className="hover:bg-blue-50/30 transition-colors group">
                                      <td className="sticky left-0 z-30 bg-white group-hover:bg-blue-50/50 border-b border-r border-slate-200 p-3 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                          <div className="font-bold text-slate-800 text-xs truncate w-44">{host.full_name}</div>
                                          <div className="text-[9px] text-slate-400 uppercase mt-0.5">{host.host_id} • {host.role}</div>
                                      </td>
                                      
                                      {/* BALANCES */}
                                      <td className="border-b border-r border-slate-200 p-2 text-center font-black text-emerald-600 bg-emerald-50/30">{host.balOff}</td>
                                      <td className="border-b border-r border-slate-200 p-2 text-center font-black text-blue-600 bg-blue-50/30">{host.balAL}</td>
                                      <td className={`border-b border-r border-slate-200 p-2 text-center font-black bg-rose-50/30 ${host.balSL < 5 ? 'text-rose-600' : 'text-slate-600'}`}>{host.balSL}</td>
                                      <td className="border-b border-r-2 border-slate-300 p-2 text-center font-black text-orange-600 bg-orange-50/30">{host.balEL}</td>

                                      {/* ATTENDANCE CELLS */}
                                      {daysInMonth.map(date => {
                                          const dateStr = format(date, 'yyyy-MM-dd');
                                          const record = attendance.find(a => a.host_id === host.host_id && a.date === dateStr);
                                          const val = record ? record.status_code : '';
                                          const colorClass = val ? STATUS_COLORS[val] : 'bg-white text-slate-300';

                                          return (
                                              <td key={dateStr} className="border-b border-r border-slate-200 p-0 relative h-10 w-10">
                                                  <select 
                                                      className={`w-full h-full appearance-none outline-none text-center text-xs font-bold cursor-pointer transition-colors ${colorClass}`}
                                                      value={val}
                                                      onChange={(e) => handleStatusChange(host.host_id, dateStr, e.target.value)}
                                                  >
                                                      <option value="" className="bg-white text-slate-400">-</option>
                                                      {STATUS_CODES.map(c => <option key={c} value={c} className="bg-white text-slate-800">{c}</option>)}
                                                  </select>
                                                  {record?.shift_note && (
                                                      <div className="absolute bottom-0 left-0 right-0 text-[6px] text-center uppercase font-black text-black/40 truncate px-1 pointer-events-none">
                                                          {record.shift_note}
                                                      </div>
                                                  )}
                                              </td>
                                          );
                                      })}
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      </div>

      {/* MAGIC PASTE MODAL */}
      {isMagicOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                  <div className="p-5 bg-emerald-600 text-white flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="text-lg font-black flex items-center gap-2"><Wand2 size={20}/> Magic Roster Parse</h3>
                          <p className="text-xs text-emerald-100 font-medium mt-1">Paste WhatsApp message. AI will link names and shifts automatically.</p>
                      </div>
                      <button onClick={() => { setIsMagicOpen(false); setMagicResults(null); setMagicText(''); }} className="bg-black/10 p-2 rounded-full hover:bg-black/20"><X size={18}/></button>
                  </div>

                  <div className="flex-1 flex flex-col md:flex-row min-h-0">
                      {/* INPUT AREA */}
                      <div className="w-full md:w-1/2 p-5 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col gap-3 shrink-0">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paste Message Here</label>
                          <textarea 
                              className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:border-emerald-500 resize-none"
                              placeholder="e.g.&#10;Tomorrow's Duty:&#10;Off: Nimal, Ziyad&#10;Morning: Shamil, Eeku"
                              value={magicText}
                              onChange={e => setMagicText(e.target.value)}
                          />
                          <button 
                              onClick={handleMagicParse} 
                              disabled={isParsing || !magicText}
                              className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                          >
                              {isParsing && !magicResults ? <Loader2 size={16} className="animate-spin"/> : <Wand2 size={16}/>}
                              Parse with AI
                          </button>
                      </div>

                      {/* RESULTS AREA */}
                      <div className="w-full md:w-1/2 p-0 flex flex-col bg-slate-50 overflow-hidden">
                          {!magicResults ? (
                              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-8 text-center">
                                  <CalIcon size={48} strokeWidth={1} className="mb-4 opacity-50"/>
                                  <p className="font-bold text-sm">Awaiting Input</p>
                                  <p className="text-xs mt-2">Results will appear here for review before saving.</p>
                              </div>
                          ) : (
                              <div className="flex flex-col h-full">
                                  <div className="p-4 bg-white border-b border-slate-200 shrink-0">
                                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Detected Date: <span className="text-[#6D2158] ml-1">{magicResults.date}</span></p>
                                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Department: <span className="text-emerald-600 ml-1">{magicResults.department}</span></p>
                                  </div>
                                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                      {magicResults.records.map((r: any, idx: number) => (
                                          <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                              <div>
                                                  <p className="font-bold text-slate-800 text-sm">{r.full_name}</p>
                                                  <p className="text-[10px] text-slate-400 font-mono">{r.host_id}</p>
                                              </div>
                                              <div className="text-right">
                                                  <span className={`px-2 py-1 rounded text-xs font-black ${STATUS_COLORS[r.status_code] || 'bg-slate-100 text-slate-600'}`}>{r.status_code}</span>
                                                  {r.shift_note && <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{r.shift_note}</p>}
                                              </div>
                                          </div>
                                      ))}
                                      {magicResults.records.length === 0 && <p className="text-center text-slate-400 italic text-sm mt-10">No valid staff matched.</p>}
                                  </div>
                                  <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                                      <button 
                                          onClick={handleMagicSave} 
                                          disabled={isParsing || magicResults.records.length === 0}
                                          className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                          {isParsing ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                                          Save to Roster
                                      </button>
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
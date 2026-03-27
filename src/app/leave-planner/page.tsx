"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, Plus, X, Loader2, Save, 
  PlaneTakeoff, ChevronLeft, ChevronRight, Edit, AlertTriangle, 
  MapPin, ShieldCheck, CheckCircle2, UserCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { 
  format, parseISO, differenceInDays, startOfMonth, endOfMonth, 
  eachDayOfInterval, isSameDay, isWithinInterval, isAfter, isBefore, addMonths
} from 'date-fns';
import { getDhakaDateStr } from '@/lib/dateUtils';
import toast from 'react-hot-toast';

// --- RESORT CONSTANTS & RULES ---
const VILLA_RULE_PER_VA = 7;

const JETTY_CONFIG = {
    'Jetty A': { id: 'A', villas: Array.from({length: 35}, (_, i) => i + 1) },
    'Jetty B': { id: 'B', villas: Array.from({length: 14}, (_, i) => i + 37) },
    'Jetty C': { id: 'C', villas: Array.from({length: 21}, (_, i) => i + 59) },
    'Beach': { id: 'Beach', villas: [36, ...Array.from({length: 8}, (_, i) => i + 51), ...Array.from({length: 18}, (_, i) => i + 80)] }
};

// --- TYPES ---
type Host = {
  id: string;
  host_id: string;
  full_name: string;
  role: string;
  image_url?: string;
  assigned_jetty?: string;
};

type LeaveRecord = {
  id: string;
  host_id: string;
  status: 'Requested' | 'Assigned' | 'Approved' | 'Active';
  start_date: string;
  return_date: string;
  leave_type: string;
};

export default function LeavePlannerPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  
  const [hosts, setHosts] = useState<Host[]>([]);
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [dailyOccupancy, setDailyOccupancy] = useState<Record<string, Record<string, number>>>({});
  const [configId, setConfigId] = useState<string | null>(null);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LeaveRecord | null>(null);
  
  // Form State
  const [selectedHostId, setSelectedHostId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [leaveStatus, setLeaveStatus] = useState<'Requested' | 'Assigned' | 'Approved' | 'Active'>('Requested');
  const [leaveType, setLeaveType] = useState('Annual Leave');

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const fetchData = async () => {
    setIsLoading(true);
    
    const startStr = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const endStr = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
    const todayStr = getDhakaDateStr();

    // 1. Fetch Active Hosts
    const { data: hostData } = await supabase
      .from('hsk_hosts')
      .select('id, host_id, full_name, role, sub_department, image_url')
      .eq('status', 'Active');
      
    // 2. Fetch Allocations (To map VAs to Jetties)
    const { data: allocData } = await supabase
      .from('hsk_allocations')
      .select('host_id, task_details')
      .eq('report_date', todayStr)
      .eq('area', 'villa');

    if (hostData) {
        let vaStaff = hostData.filter(h => 
            (h.role || '').toLowerCase().includes('villa') || 
            (h.sub_department || '').toLowerCase().includes('villa') ||
            (h.role || '').toLowerCase() === 'va'
        );

        vaStaff = vaStaff.map(h => {
            const alloc = allocData?.find(a => a.host_id === h.id || a.host_id === h.host_id);
            let jetty = 'Floaters';
            if (alloc && alloc.task_details) {
                const firstVilla = parseInt(alloc.task_details.split(',')[0].trim(), 10);
                if (!isNaN(firstVilla)) {
                    if (JETTY_CONFIG['Jetty A'].villas.includes(firstVilla)) jetty = 'Jetty A';
                    else if (JETTY_CONFIG['Jetty B'].villas.includes(firstVilla)) jetty = 'Jetty B';
                    else if (JETTY_CONFIG['Jetty C'].villas.includes(firstVilla)) jetty = 'Jetty C';
                    else if (JETTY_CONFIG['Beach'].villas.includes(firstVilla)) jetty = 'Beach';
                }
            }
            return { ...h, assigned_jetty: jetty };
        }).sort((a, b) => a.full_name.localeCompare(b.full_name));

        setHosts(vaStaff);
    }

    // 3. Fetch Master Leave Roster
    const { data: configData } = await supabase
      .from('hsk_constants')
      .select('*')
      .eq('type', 'master_leave_roster')
      .maybeSingle();

    if (configData) {
      setConfigId(configData.id);
      try { setLeaveRecords(JSON.parse(configData.label)); } 
      catch(e) { setLeaveRecords([]); }
    } else {
      setLeaveRecords([]);
    }

    // 4. Extract Daily Occupied Villas per Jetty (Summary + Forecast)
    const occMap: Record<string, Record<string, number>> = {};
    
    // Fetch Summary (Past & Present)
    const { data: summaryData } = await supabase
        .from('hsk_daily_summary')
        .select('report_date, villa_number, status')
        .gte('report_date', startStr)
        .lte('report_date', endStr)
        .not('status', 'in', '("VAC", "VM/VAC")'); // Only occupied
        
    if (summaryData) {
        summaryData.forEach(row => {
            const d = row.report_date;
            const v = parseInt(row.villa_number, 10);
            if (!occMap[d]) occMap[d] = { 'Jetty A': 0, 'Jetty B': 0, 'Jetty C': 0, 'Beach': 0 };
            
            if (JETTY_CONFIG['Jetty A'].villas.includes(v)) occMap[d]['Jetty A']++;
            else if (JETTY_CONFIG['Jetty B'].villas.includes(v)) occMap[d]['Jetty B']++;
            else if (JETTY_CONFIG['Jetty C'].villas.includes(v)) occMap[d]['Jetty C']++;
            else if (JETTY_CONFIG['Beach'].villas.includes(v)) occMap[d]['Beach']++;
        });
    }

    // Fetch Forecast (Future Arrivals)
    const { data: forecastConfig } = await supabase
        .from('hsk_constants')
        .select('label')
        .eq('type', 'arrivals_forecast')
        .maybeSingle();
        
    if (forecastConfig && forecastConfig.label) {
        try {
            const forecastArr = JSON.parse(forecastConfig.label);
            forecastArr.forEach((f: any) => {
                const d = f.date;
                if (!occMap[d]) occMap[d] = { 'Jetty A': 0, 'Jetty B': 0, 'Jetty C': 0, 'Beach': 0 };
                // Add arrivals to existing occupied (simple estimation model)
                if (f.jettyCounts) {
                    occMap[d]['Jetty A'] += (f.jettyCounts.a || 0);
                    occMap[d]['Jetty B'] += (f.jettyCounts.b || 0);
                    occMap[d]['Jetty C'] += (f.jettyCounts.c || 0);
                    occMap[d]['Beach'] += (f.jettyCounts.beach || 0);
                }
            });
        } catch(e) {}
    }

    setDailyOccupancy(occMap);
    setIsLoading(false);
  };

  const saveRosterToDB = async (updatedRecords: LeaveRecord[]) => {
    setIsSaving(true);
    const payload = JSON.stringify(updatedRecords);
    
    if (configId) {
      await supabase.from('hsk_constants').update({ label: payload }).eq('id', configId);
    } else {
      const { data } = await supabase.from('hsk_constants').insert({ type: 'master_leave_roster', label: payload }).select().single();
      if (data) setConfigId(data.id);
    }
    
    setLeaveRecords(updatedRecords);
    setIsSaving(false);
  };

  // --- ACTIONS ---
  const handleSaveLeave = async () => {
    if (!selectedHostId || !startDate || !returnDate) return toast.error("Please fill all date fields.");

    let newRecords = [...leaveRecords];

    if (editingRecord) {
        const idx = newRecords.findIndex(r => r.id === editingRecord.id);
        if (idx > -1) {
            newRecords[idx] = { ...newRecords[idx], start_date: startDate, return_date: returnDate, status: leaveStatus, leave_type: leaveType };
        }
    } else {
        newRecords.push({
            id: Math.random().toString(36).substr(2, 9),
            host_id: selectedHostId, status: leaveStatus, leave_type: leaveType, start_date: startDate, return_date: returnDate
        });
    }

    await saveRosterToDB(newRecords);
    setIsModalOpen(false);
    resetForm();
    toast.success("Leave plan updated.");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this leave record entirely?")) return;
    const newRecords = leaveRecords.filter(r => r.id !== id);
    await saveRosterToDB(newRecords);
  };

  const openNewModal = (hostId?: string) => { 
      resetForm(); 
      if (hostId) setSelectedHostId(hostId);
      setIsModalOpen(true); 
  };
  
  const openEditModal = (record: LeaveRecord) => {
      setEditingRecord(record); setSelectedHostId(record.host_id); setStartDate(record.start_date);
      setReturnDate(record.return_date); setLeaveStatus(record.status as any); setLeaveType(record.leave_type || 'Annual Leave');
      setIsModalOpen(true);
  };

  const resetForm = () => {
      setEditingRecord(null); setSelectedHostId(''); setStartDate(''); setReturnDate(''); setLeaveStatus('Requested'); setLeaveType('Annual Leave');
  };

  // --- CALENDAR & MATH ENGINE ---
  const daysInMonth = useMemo(() => eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }), [currentMonth]);
  
  const groupedHosts = useMemo(() => {
      const groups: Record<string, Host[]> = { 'Jetty A': [], 'Jetty B': [], 'Jetty C': [], 'Beach': [], 'Floaters': [] };
      hosts.forEach(h => {
          if (groups[h.assigned_jetty || 'Floaters']) groups[h.assigned_jetty || 'Floaters'].push(h);
      });
      return groups;
  }, [hosts]);

  const isHostOnLeave = (hostId: string, day: Date) => {
      return leaveRecords.some(r => {
          if (r.status === 'Requested') return false; // Requested doesn't deduct capacity yet
          const start = parseISO(r.start_date);
          const end = parseISO(r.return_date);
          return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
      });
  };

  if (isLoading) return <div className="min-h-screen bg-[#FDFBFD] flex items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-6 pb-24 font-antiqua text-[#6D2158] flex flex-col h-screen overflow-hidden">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-4 mb-4 gap-4 shrink-0">
        <div>
           <h1 className="text-3xl font-black tracking-tight">Villa Attendant Leave Planner</h1>
           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
               Intelligent Coverage & Rotation Board
           </p>
        </div>
        <div className="flex items-center gap-4">
           {isSaving && <span className="text-blue-500 text-xs font-bold uppercase tracking-widest flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Saving...</span>}
           <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
               <button onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} className="p-2 hover:bg-slate-50 text-slate-500 rounded-lg"><ChevronLeft size={18}/></button>
               <span className="text-sm font-black text-[#6D2158] px-4 min-w-[160px] text-center">{format(currentMonth, 'MMMM yyyy')}</span>
               <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-slate-50 text-slate-500 rounded-lg"><ChevronRight size={18}/></button>
           </div>
           <button onClick={() => openNewModal()} className="bg-[#6D2158] text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md hover:bg-[#5a1b49] transition-all">
               <Plus size={18}/> Log Plan
           </button>
        </div>
      </div>

      {/* SLEEK LEGEND */}
      <div className="flex flex-wrap gap-6 mb-4 shrink-0 bg-transparent text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-amber-100 rounded-full border border-amber-300"></div> Requested</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-100 rounded-full border border-indigo-300"></div> Assigned (Clear Bal)</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-100 rounded-full border border-blue-400"></div> Approved</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#6D2158] rounded-full shadow-sm"></div> Departed (Active)</div>
      </div>

      {/* --- TIMELINE BOARD --- */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col relative">
          <div className="flex-1 overflow-auto custom-scrollbar flex">
              
              {/* STICKY LEFT COLUMN: Names & Jetties */}
              <div className="sticky left-0 z-40 bg-white/90 backdrop-blur-md border-r border-slate-200 flex flex-col shrink-0 w-[240px]">
                  <div className="h-14 bg-white border-b border-slate-100 flex items-center px-5 shrink-0">
                      <span className="font-black text-xs text-slate-400 uppercase tracking-widest">Jetty & Staff</span>
                  </div>
                  
                  <div className="flex-1 overflow-visible">
                      {Object.entries(groupedHosts).map(([jettyName, jettyHosts]) => {
                          if (jettyHosts.length === 0) return null;

                          return (
                              <React.Fragment key={jettyName}>
                                  {/* Jetty Header Row */}
                                  <div className="h-12 bg-slate-50 border-y border-slate-100 flex flex-col justify-center px-5">
                                      <h3 className="font-black text-[11px] text-[#6D2158] uppercase tracking-widest">{jettyName}</h3>
                                  </div>
                                  
                                  {/* Staff Rows */}
                                  {jettyHosts.map(host => (
                                      <div key={host.id} className="h-10 flex items-center border-b border-slate-50 px-5 bg-white hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => openNewModal(host.id)}>
                                          <p className="text-xs font-bold text-slate-700 truncate group-hover:text-[#6D2158]">{host.full_name}</p>
                                      </div>
                                  ))}
                              </React.Fragment>
                          );
                      })}
                  </div>
              </div>

              {/* CALENDAR GRID */}
              <div className="flex flex-col relative min-w-max">
                  {/* Calendar Header Dates */}
                  <div className="h-14 bg-white border-b border-slate-100 flex shrink-0" style={{ display: 'grid', gridTemplateColumns: `repeat(${daysInMonth.length}, minmax(42px, 1fr))` }}>
                      {daysInMonth.map(day => {
                          const isToday = isSameDay(day, new Date());
                          return (
                              <div key={day.toString()} className={`flex flex-col items-center justify-center border-r border-slate-50 ${isToday ? 'bg-[#6D2158]/5' : ''}`}>
                                  <span className={`text-xs font-black ${isToday ? 'text-[#6D2158]' : 'text-slate-600'}`}>{format(day, 'd')}</span>
                                  <span className={`text-[9px] font-bold uppercase tracking-wider ${isToday ? 'text-[#6D2158]' : 'text-slate-400'}`}>{format(day, 'EEE')}</span>
                              </div>
                          );
                      })}
                  </div>

                  <div className="flex-1 relative">
                      {Object.entries(groupedHosts).map(([jettyName, jettyHosts]) => {
                          if (jettyHosts.length === 0) return null;

                          return (
                              <React.Fragment key={`grid-${jettyName}`}>
                                  
                                  {/* 1. JETTY CAPACITY CALCULATION ROW */}
                                  <div className="h-12 border-y border-slate-100 bg-slate-50/50 flex relative" style={{ display: 'grid', gridTemplateColumns: `repeat(${daysInMonth.length}, minmax(42px, 1fr))` }}>
                                      {daysInMonth.map(day => {
                                          const dateStr = format(day, 'yyyy-MM-dd');
                                          
                                          // Available VAs calculation
                                          let availableVAs = 0;
                                          jettyHosts.forEach(h => {
                                              if (!isHostOnLeave(h.id, day)) availableVAs++;
                                          });

                                          // Dynamic Capacity vs Occupied
                                          const dailyCapacity = availableVAs * VILLA_RULE_PER_VA;
                                          const occupiedToday = dailyOccupancy[dateStr]?.[jettyName] || 0;
                                          
                                          const isShortage = occupiedToday > dailyCapacity;

                                          return (
                                              <div key={day.toString()} className={`flex flex-col items-center justify-center border-r border-slate-100 transition-colors ${isShortage ? 'bg-rose-50' : ''}`}>
                                                  <span className={`text-[9px] font-black ${isShortage ? 'text-rose-600' : 'text-slate-600'}`}>
                                                      Occ: {occupiedToday > 0 ? occupiedToday : '-'}
                                                  </span>
                                                  <span className={`text-[8px] font-bold uppercase ${isShortage ? 'text-rose-400' : 'text-slate-400'}`}>
                                                      Cap: {dailyCapacity}
                                                  </span>
                                              </div>
                                          );
                                      })}
                                  </div>

                                  {/* 2. STAFF TIMELINE ROWS */}
                                  {jettyHosts.map(host => {
                                      const hostLeaves = leaveRecords.filter(r => r.host_id === host.id);

                                      return (
                                          <div key={host.id} className="h-10 border-b border-slate-50 flex relative hover:bg-slate-50/30" style={{ display: 'grid', gridTemplateColumns: `repeat(${daysInMonth.length}, minmax(42px, 1fr))` }}>
                                              
                                              {/* Empty Grid Cells */}
                                              {daysInMonth.map(day => (
                                                  <div key={format(day, 'yyyy-MM-dd')} className="border-r border-slate-50/50"></div>
                                              ))}

                                              {/* Leave Timeline Pills */}
                                              {hostLeaves.map(leave => {
                                                  const leaveStart = parseISO(leave.start_date);
                                                  const leaveEnd = parseISO(leave.return_date);
                                                  const monthStart = startOfMonth(currentMonth);
                                                  const monthEnd = endOfMonth(currentMonth);

                                                  if (isAfter(leaveStart, monthEnd) || isBefore(leaveEnd, monthStart)) return null;

                                                  const startIdx = differenceInDays(leaveStart, monthStart) + 1;
                                                  const endIdx = differenceInDays(leaveEnd, monthStart) + 1;

                                                  const actualStart = Math.max(1, startIdx);
                                                  const actualEnd = Math.min(daysInMonth.length, endIdx);
                                                  const span = actualEnd - actualStart + 1;

                                                  let bgColor = 'bg-slate-100 text-slate-600';
                                                  if (leave.status === 'Requested') bgColor = 'bg-amber-100 text-amber-700 border border-amber-200';
                                                  else if (leave.status === 'Assigned') bgColor = 'bg-indigo-100 text-indigo-700 border border-indigo-200';
                                                  else if (leave.status === 'Approved') bgColor = 'bg-blue-100 text-blue-700 border border-blue-200';
                                                  else if (leave.status === 'Active') bgColor = 'bg-[#6D2158] text-white shadow-sm';

                                                  const roundLeft = startIdx >= 1 ? 'rounded-l-full ml-1' : '-ml-1 border-l-0';
                                                  const roundRight = endIdx <= daysInMonth.length ? 'rounded-r-full mr-1' : '-mr-1 border-r-0';

                                                  return (
                                                      <div 
                                                          key={leave.id}
                                                          onClick={(e) => { e.stopPropagation(); openEditModal(leave); }}
                                                          className={`absolute top-1.5 bottom-1.5 z-20 flex items-center px-3 cursor-pointer overflow-hidden transition-transform hover:scale-[1.02] hover:z-30 ${bgColor} ${roundLeft} ${roundRight}`}
                                                          style={{ gridColumn: `${actualStart} / span ${span}` }}
                                                      >
                                                          <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap truncate">
                                                              {leave.status === 'Requested' ? 'Requested' : leave.status === 'Assigned' ? 'Assigned' : leave.leave_type}
                                                          </span>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                      );
                                  })}
                              </React.Fragment>
                          );
                      })}
                  </div>
              </div>
          </div>
      </div>

      {/* --- ADD / EDIT REQUEST MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl flex flex-col relative animate-in zoom-in-95">
                
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-black text-lg text-slate-800 tracking-tight flex items-center gap-2">
                        {editingRecord ? 'Manage Plan' : 'Log New Plan'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="bg-slate-100 p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"><X size={16}/></button>
                </div>
                
                <div className="p-6 space-y-5">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">Villa Attendant</label>
                        <select 
                            className="w-full bg-slate-50 border border-slate-200 text-sm font-bold rounded-xl p-3.5 outline-none focus:border-[#6D2158] cursor-pointer"
                            value={selectedHostId}
                            onChange={e => setSelectedHostId(e.target.value)}
                            disabled={!!editingRecord}
                        >
                            <option value="" disabled>Select a VA...</option>
                            {hosts.map(h => <option key={h.id} value={h.id}>{h.full_name} ({h.assigned_jetty})</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">Leave Type</label>
                        <select 
                            className="w-full bg-slate-50 border border-slate-200 text-sm font-bold rounded-xl p-3.5 outline-none focus:border-[#6D2158] cursor-pointer"
                            value={leaveType}
                            onChange={e => setLeaveType(e.target.value)}
                        >
                            <option value="Annual Leave">Annual Leave</option>
                            <option value="Emergency Leave">Emergency Leave</option>
                            <option value="Sick Leave">Long-Term Sick (Off Island)</option>
                            <option value="Unpaid Leave">Unpaid Leave</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">Going Date</label>
                            <input 
                                type="date"
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158]"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block ml-1">Return Date</label>
                            <input 
                                type="date"
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158]"
                                value={returnDate}
                                onChange={e => setReturnDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2.5 block ml-1">Plan Status</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setLeaveStatus('Requested')} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${leaveStatus === 'Requested' ? 'bg-amber-100 border-amber-300 text-amber-800 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Requested</button>
                            <button onClick={() => setLeaveStatus('Assigned')} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${leaveStatus === 'Assigned' ? 'bg-indigo-100 border-indigo-300 text-indigo-800 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Assigned / Forced</button>
                            <button onClick={() => setLeaveStatus('Approved')} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${leaveStatus === 'Approved' ? 'bg-blue-100 border-blue-300 text-blue-800 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Approved</button>
                            <button onClick={() => setLeaveStatus('Active')} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${leaveStatus === 'Active' ? 'bg-[#6D2158] border-[#6D2158] text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Departed</button>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-6 mt-2">
                        {editingRecord && (
                            <button onClick={() => handleDelete(editingRecord.id)} className="flex-1 py-4 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-2xl font-black uppercase tracking-widest text-xs transition-colors border border-rose-100">
                                Delete
                            </button>
                        )}
                        <button 
                            onClick={handleSaveLeave}
                            className="flex-[2] py-4 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-colors shadow-lg flex items-center justify-center gap-2"
                        >
                            <Save size={16}/> Save Plan
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}
"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, Sparkles, CheckCircle2, DoorClosed, 
  Clock, User, AlertCircle, BedDouble, Loader2, RefreshCw, Calendar, Search, X, Maximize, Minimize, TableProperties, LayoutGrid, ChevronDown, ZoomIn
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO, isToday } from 'date-fns';
import { getDhakaTime, getDhakaDateStr } from '@/lib/dateUtils';

type LiveTask = {
    villa: string;
    status: 'Pending' | 'In Progress' | 'Completed' | 'DND' | 'Refused';
    attendant: string;
    type: string;
    startTime?: string;
    endTime?: string;
    timeSpent?: string;
    timeLogged?: string;
};

// Reusable villa parser
const parseVillas = (input: string, doubleVillas: string[] = []) => {
    const result = new Set<string>();
    const parts = (input || '').split(',').map(s => s.trim());
    
    for (const p of parts) {
        if (p.includes('-') && !p.includes('-1') && !p.includes('-2')) {
            const [start, end] = p.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    const v = String(i);
                    if (doubleVillas.includes(v)) { result.add(`${v}-1`); result.add(`${v}-2`); } 
                    else { result.add(v); }
                }
            }
        } else if (p) {
            const baseV = p.replace('-1', '').replace('-2', '');
            if (!p.includes('-') && doubleVillas.includes(p)) { result.add(`${p}-1`); result.add(`${p}-2`); } 
            else { result.add(p); }
        }
    }
    return Array.from(result).sort((a,b) => parseFloat(a.replace('-', '.')) - parseFloat(b.replace('-', '.')));
};

export default function LiveCleaningBoard() {
  const [isLoading, setIsLoading] = useState(true);
  const [liveData, setLiveData] = useState<LiveTask[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'DND' | 'REFUSED'>('ALL');
  
  // ⚡ View Modes & Fullscreen & Zoom
  const [boardDate, setBoardDate] = useState(getDhakaDateStr());
  const [hostSearch, setHostSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'GRID' | 'SHEET'>('GRID');
  const [gridColumns, setGridColumns] = useState(8);

  useEffect(() => {
      const savedZoom = localStorage.getItem('hk_pulse_board_zoom');
      if (savedZoom) {
          setGridColumns(Number(savedZoom));
      }
  }, []);

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setGridColumns(val);
      localStorage.setItem('hk_pulse_board_zoom', String(val));
  };

  const fetchBoardData = useCallback(async (showLoader = true) => {
      if (showLoader) setIsLoading(true);

      const [allocRes, hostsRes, guestsRes, logsRes] = await Promise.all([
          supabase.from('hsk_allocations').select('host_id, task_details').eq('report_date', boardDate),
          supabase.from('hsk_hosts').select('id, host_id, full_name, nicknames'),
          supabase.from('hsk_daily_summary').select('villa_number, status').eq('report_date', boardDate),
          supabase.from('hsk_cleaning_logs').select('*').eq('report_date', boardDate)
      ]);

      const allocations = allocRes.data || [];
      const hosts = hostsRes.data || [];
      const guests = guestsRes.data || [];
      const logs = logsRes.data || [];

      // Map Hosts
      const hostMap: Record<string, string> = {};
      hosts.forEach(h => {
          const nickname = h.nicknames ? h.nicknames.split(',')[0].trim() : h.full_name;
          hostMap[h.id] = nickname; 
          hostMap[h.host_id] = nickname; 
      });

      // Map Guests
      const guestMap: Record<string, string> = {};
      guests.forEach(g => {
          let type = 'Occupied'; // ⚡ Changed to Occupied
          const st = g.status?.toUpperCase() || '';
          if (st.includes('DEP')) type = 'Departure';
          if (st.includes('ARR')) type = 'Arrival';
          if (st.includes('VAC') || st === 'VM/VAC') type = 'Touch Up';
          guestMap[g.villa_number] = type;
      });

      // Map Logs to easily attach to villas
      const logsMap: Record<string, any> = {};
      logs.forEach(log => {
          logsMap[log.villa_number] = log;
      });

      const allTasks: LiveTask[] = [];

      allocations.forEach(alloc => {
          const attendantName = hostMap[alloc.host_id] || "Unknown Host";
          const assignedVillas = parseVillas(alloc.task_details);

          assignedVillas.forEach(v => {
              const log = logsMap[v];
              
              allTasks.push({
                  villa: v,
                  status: log ? log.status : 'Pending', 
                  attendant: attendantName,
                  type: guestMap[v] || 'Occupied', // ⚡ Changed to Occupied
                  startTime: log?.start_time ? format(parseISO(log.start_time), 'hh:mm a') : undefined,
                  endTime: log?.end_time ? format(parseISO(log.end_time), 'hh:mm a') : undefined,
                  timeSpent: log?.time_spent_minutes ? `${log.time_spent_minutes}m` : undefined,
                  // Fallback to updated_at if dnd_time is null (for Refused)
                  timeLogged: log?.dnd_time ? format(parseISO(log.dnd_time), 'hh:mm a') : log?.updated_at ? format(parseISO(log.updated_at), 'hh:mm a') : undefined,
              });
          });
      });

      allTasks.sort((a,b) => parseFloat(a.villa.replace('-', '.')) - parseFloat(b.villa.replace('-', '.')));
      
      setLiveData(allTasks);
      if (showLoader) setIsLoading(false);
  }, [boardDate]);

  useEffect(() => {
      fetchBoardData();
  }, [fetchBoardData]);

  // SUPABASE REALTIME LISTENER
  useEffect(() => {
      const channel = supabase.channel('realtime-cleaning-board')
          .on(
              'postgres_changes', 
              { event: '*', schema: 'public', table: 'hsk_cleaning_logs' }, 
              (payload) => {
                  const newLog = payload.new as any;
                  
                  if (newLog.report_date === boardDate) {
                      setLiveData(prevData => prevData.map(task => {
                          if (task.villa === newLog.villa_number) {
                              return {
                                  ...task,
                                  status: newLog.status,
                                  startTime: newLog.start_time ? format(parseISO(newLog.start_time), 'hh:mm a') : task.startTime,
                                  endTime: newLog.end_time ? format(parseISO(newLog.end_time), 'hh:mm a') : task.endTime,
                                  timeSpent: newLog.time_spent_minutes ? `${newLog.time_spent_minutes}m` : task.timeSpent,
                                  timeLogged: newLog.dnd_time ? format(parseISO(newLog.dnd_time), 'hh:mm a') : newLog.updated_at ? format(parseISO(newLog.updated_at), 'hh:mm a') : task.timeLogged,
                              };
                          }
                          return task;
                      }));
                  }
              }
          )
          .subscribe();

      return () => {
          supabase.removeChannel(channel);
      };
  }, [boardDate]);

  const uniqueAttendants = useMemo(() => {
      return Array.from(new Set(liveData.map(t => t.attendant))).sort();
  }, [liveData]);

  const filteredVillas = useMemo(() => {
    let result = liveData;

    if (filter === 'IN_PROGRESS') result = result.filter(v => v.status === 'In Progress');
    if (filter === 'COMPLETED') result = result.filter(v => v.status === 'Completed');
    if (filter === 'DND') result = result.filter(v => v.status === 'DND');
    if (filter === 'REFUSED') result = result.filter(v => v.status === 'Refused');

    if (hostSearch) {
        result = result.filter(v => v.attendant === hostSearch);
    }

    return result;
  }, [filter, liveData, hostSearch]);

  const baseVillas = hostSearch ? liveData.filter(v => v.attendant === hostSearch) : liveData;
  const total = baseVillas.length;
  const completed = baseVillas.filter(v => v.status === 'Completed').length;
  const inProgress = baseVillas.filter(v => v.status === 'In Progress').length;
  const dnd = baseVillas.filter(v => v.status === 'DND').length;
  const refused = baseVillas.filter(v => v.status === 'Refused').length;
  const progressPct = total === 0 ? 0 : (completed / total) * 100;

  const isViewingHistory = !isToday(parseISO(boardDate));

  // ⚡ DYNAMIC ZOOM THRESHOLDS
  const isExtreme = gridColumns >= 14;
  const isUltraDense = gridColumns >= 11;
  const isDense = gridColumns >= 8;

  if (isLoading) {
      return <div className="min-h-screen flex items-center justify-center bg-slate-50 z-[9999] relative"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-[9999] bg-[#FDFBFD] overflow-hidden flex flex-col' : 'min-h-screen bg-slate-50 pb-24 w-full flex flex-col'} font-sans text-slate-800 transition-all duration-300`}>
      
      {/* HEADER */}
      <div className={`bg-[#6D2158] text-white shadow-lg shrink-0 ${isFullscreen ? 'p-3 md:p-4 z-20' : 'p-6 md:p-8 rounded-b-[2.5rem] sticky top-0 z-20'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
          <div className="flex-1 flex flex-col gap-2 w-full">
            <div className="flex flex-wrap items-center justify-between md:justify-start gap-4 w-full">
                <h1 className={`${isFullscreen ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'} font-black tracking-tight flex items-center gap-2 md:gap-3`}>
                    <LayoutDashboard size={isFullscreen ? 24 : 28} className="text-pink-300"/> 
                    {isViewingHistory ? 'Historical Log' : 'Live Cleaning Board'}
                </h1>
                
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {/* ZOOM SLIDER */}
                    {viewMode === 'GRID' && (
                        <div className="flex items-center bg-white/10 px-3 py-1.5 md:py-2 rounded-full border border-white/20 gap-2 transition-colors focus-within:ring-2 focus-within:ring-white/50">
                            <ZoomIn size={14} className="text-white/70 hidden sm:block"/>
                            <input 
                                type="range" 
                                min="4" max="18" step="1"
                                value={gridColumns}
                                onChange={handleZoomChange}
                                className="w-20 md:w-24 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                                title="Adjust Grid Zoom"
                            />
                            <span className="text-[10px] md:text-xs font-black w-4 text-center">{gridColumns}</span>
                        </div>
                    )}

                    <div className="flex bg-white/10 p-0.5 rounded-full">
                        <button onClick={() => setViewMode('GRID')} className={`p-1.5 rounded-full transition-all ${viewMode === 'GRID' ? 'bg-white text-[#6D2158] shadow-sm' : 'text-white hover:bg-white/20'}`} title="Grid View"><LayoutGrid size={14}/></button>
                        <button onClick={() => setViewMode('SHEET')} className={`p-1.5 rounded-full transition-all ${viewMode === 'SHEET' ? 'bg-white text-[#6D2158] shadow-sm' : 'text-white hover:bg-white/20'}`} title="Sheet View"><TableProperties size={14}/></button>
                    </div>
                    
                    <button onClick={() => fetchBoardData(true)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 active:scale-95 transition-all" title="Refresh Data"><RefreshCw size={14} className={isLoading ? 'animate-spin' : ''}/></button>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 active:scale-95 transition-all hidden md:flex items-center justify-center" title="Toggle Fullscreen">
                        {isFullscreen ? <Minimize size={14}/> : <Maximize size={14}/>}
                    </button>
                </div>
            </div>

            {/* Date Picker */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1">
                <div className={`flex items-center bg-white/10 px-3 ${isFullscreen ? 'py-1 md:py-1.5' : 'py-1.5 md:py-2'} rounded-xl border border-white/20 gap-2 transition-colors hover:bg-white/20 cursor-pointer focus-within:ring-2 focus-within:ring-white/50 max-w-[160px]`}>
                    <Calendar size={14} className="text-white shrink-0"/>
                    <input 
                        type="date" 
                        className="bg-transparent text-white font-bold text-[10px] md:text-xs outline-none w-full cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 uppercase tracking-widest"
                        value={boardDate}
                        onChange={e => e.target.value && setBoardDate(e.target.value)}
                    />
                </div>
                {isViewingHistory && <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest bg-rose-500 text-white px-2 py-1 md:py-1.5 rounded-lg shadow-sm">Archive</span>}
            </div>
          </div>
          
          {/* MASTER PROGRESS */}
          <div className={`w-full ${isFullscreen ? 'md:w-56 p-2.5' : 'md:w-64 p-3 md:p-4'} bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10 shrink-0`}>
            <div className="flex justify-between items-end mb-1.5">
            <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-white/70">Resort Progress</span>
            <span className={`${isFullscreen ? 'text-base' : 'text-lg md:text-xl'} font-black leading-none`}>{Math.round(progressPct)}%</span>
            </div>
            <div className="h-1.5 md:h-2 w-full bg-black/20 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 transition-all duration-1000" style={{ width: `${progressPct}%` }}></div>
            </div>
          </div>
        </div>

        {/* METRIC CARDS & FILTERS */}
        <div className={`flex flex-col lg:flex-row gap-3 md:gap-4 justify-between items-end ${isFullscreen ? 'mt-3' : 'mt-6'}`}>
            
            {/* ⚡ 5 METRIC COLUMNS */}
            <div className="grid grid-cols-5 gap-2 w-full lg:w-auto flex-1 max-w-3xl">
                <button onClick={() => setFilter('ALL')} className={`p-1.5 md:p-2 rounded-xl flex flex-col items-center justify-center transition-all ${filter === 'ALL' ? 'bg-white text-[#6D2158] shadow-md scale-[1.02]' : 'bg-white/10 hover:bg-white/20'}`}>
                    <span className={`${isFullscreen ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-black leading-none`}>{total}</span>
                    <span className="text-[7px] md:text-[9px] font-bold uppercase tracking-widest opacity-80 mt-1">Total</span>
                </button>
                <button onClick={() => setFilter('IN_PROGRESS')} className={`p-1.5 md:p-2 rounded-xl flex flex-col items-center justify-center transition-all ${filter === 'IN_PROGRESS' ? 'bg-emerald-400 text-emerald-950 shadow-md scale-[1.02] ring-2 ring-emerald-300 ring-offset-1 ring-offset-[#6D2158]' : 'bg-white/10 hover:bg-white/20'}`}>
                    <span className={`${isFullscreen ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-black leading-none`}>{inProgress}</span>
                    <span className="text-[7px] md:text-[9px] font-bold uppercase tracking-widest opacity-80 mt-1 flex items-center gap-1"><Sparkles size={8} className="animate-pulse"/> Active</span>
                </button>
                <button onClick={() => setFilter('COMPLETED')} className={`p-1.5 md:p-2 rounded-xl flex flex-col items-center justify-center transition-all ${filter === 'COMPLETED' ? 'bg-blue-400 text-blue-950 shadow-md scale-[1.02]' : 'bg-white/10 hover:bg-white/20'}`}>
                    <span className={`${isFullscreen ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-black leading-none`}>{completed}</span>
                    <span className="text-[7px] md:text-[9px] font-bold uppercase tracking-widest opacity-80 mt-1 flex items-center gap-1"><CheckCircle2 size={8}/> Done</span>
                </button>
                <button onClick={() => setFilter('DND')} className={`p-1.5 md:p-2 rounded-xl flex flex-col items-center justify-center transition-all ${filter === 'DND' ? 'bg-rose-400 text-rose-950 shadow-md scale-[1.02]' : 'bg-white/10 hover:bg-white/20'}`}>
                    <span className={`${isFullscreen ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-black leading-none`}>{dnd}</span>
                    <span className="text-[7px] md:text-[9px] font-bold uppercase tracking-widest opacity-80 mt-1 flex items-center gap-1"><DoorClosed size={8}/> DND</span>
                </button>
                <button onClick={() => setFilter('REFUSED')} className={`p-1.5 md:p-2 rounded-xl flex flex-col items-center justify-center transition-all ${filter === 'REFUSED' ? 'bg-orange-400 text-orange-950 shadow-md scale-[1.02]' : 'bg-white/10 hover:bg-white/20'}`}>
                    <span className={`${isFullscreen ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-black leading-none`}>{refused}</span>
                    <span className="text-[7px] md:text-[9px] font-bold uppercase tracking-widest opacity-80 mt-1 flex items-center gap-1"><X size={8}/> Refused</span>
                </button>
            </div>

            {/* Attendant Dropdown Filter */}
            <div className="relative w-full lg:w-56 shrink-0 group">
                <User className="absolute left-3 top-2.5 text-white/50" size={14}/>
                <select 
                    className="w-full pl-9 pr-8 py-2 bg-white/10 border border-white/20 text-white rounded-xl font-bold text-xs outline-none focus:bg-white focus:text-[#6D2158] transition-colors appearance-none cursor-pointer"
                    value={hostSearch}
                    onChange={e => setHostSearch(e.target.value)} 
                >
                    <option value="" className="text-slate-800">All Attendants</option>
                    {uniqueAttendants.map(att => (
                        <option key={att} value={att} className="text-slate-800">{att}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-2.5 text-white/50 pointer-events-none group-focus-within:text-[#6D2158]" size={14}/>
            </div>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className={`${isFullscreen ? 'flex-1 overflow-y-auto p-2 md:p-4 custom-scrollbar' : 'p-4 md:p-8 flex-1'}`}>
        
        {filteredVillas.length === 0 ? (
             <div className={`text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm mx-auto max-w-lg ${isFullscreen ? 'mt-4' : 'mt-10'}`}>
                <BedDouble size={40} className="mx-auto mb-3 text-slate-300"/>
                <h3 className="text-base font-black text-slate-500">No Allocations Found</h3>
                <p className="text-xs font-bold text-slate-400 mt-1 px-4">
                    {hostSearch ? `No villas assigned to "${hostSearch}".` : 'Villas have not been allocated for this date.'}
                </p>
             </div>
        ) : viewMode === 'SHEET' ? (
            
            // --- EXCEL SHEET VIEW ---
            <div className={`bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col ${isFullscreen ? 'rounded-2xl h-full' : 'rounded-3xl'}`}>
                <div className="overflow-auto custom-scrollbar flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200 text-center w-12">#</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200">Villa</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200">Attendant</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200 text-center">Type</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200 text-center">Status</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200">Time Log (Exact)</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Duration</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredVillas.map((item, idx) => {
                                const isCleaning = item.status === 'In Progress';
                                const isDone = item.status === 'Completed';
                                const isDND = item.status === 'DND';
                                const isRefused = item.status === 'Refused';
                                
                                return (
                                    <tr key={`${item.villa}-${idx}`} className={`hover:bg-slate-50 transition-colors ${isDone ? 'bg-emerald-50/50 opacity-90' : isDND ? 'bg-rose-50/30' : isRefused ? 'bg-orange-50/40' : isCleaning ? 'bg-emerald-50/30' : ''}`}>
                                        <td className="p-2 border-r border-slate-100 text-center text-xs font-bold text-slate-400">{idx + 1}</td>
                                        <td className={`p-2 border-r border-slate-100 font-black text-lg ${isDone ? 'text-emerald-700' : 'text-[#6D2158]'}`}>{item.villa}</td>
                                        <td className={`p-2 border-r border-slate-100 text-xs font-bold flex items-center gap-2 ${isDone ? 'text-emerald-700' : 'text-slate-700'}`}>
                                            <User size={12} className={isDone ? 'text-emerald-500' : 'text-slate-400 hidden md:block'}/> {item.attendant}
                                        </td>
                                        <td className="p-2 border-r border-slate-100 text-center">
                                            <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
                                                isDone ? 'bg-white/50 text-emerald-800' :
                                                item.type === 'Departure' ? 'bg-amber-100 text-amber-700' : 
                                                item.type === 'Arrival' ? 'bg-blue-100 text-blue-700' : 
                                                item.type === 'Touch Up' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {item.type}
                                            </span>
                                        </td>
                                        <td className="p-2 border-r border-slate-100 text-center">
                                            <span className={`flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${
                                                isCleaning ? 'text-emerald-600' : isDone ? 'text-emerald-600' : isDND ? 'text-rose-500' : isRefused ? 'text-orange-600' : 'text-slate-400'
                                            }`}>
                                                {isCleaning && <Sparkles size={10} className="animate-pulse hidden md:block"/>}
                                                {isDone && <CheckCircle2 size={10} className="hidden md:block"/>}
                                                {isDND && <DoorClosed size={10} className="hidden md:block"/>}
                                                {isRefused && <X size={10} className="hidden md:block"/>}
                                                {!isCleaning && !isDone && !isDND && !isRefused && <BedDouble size={10} className="hidden md:block"/>}
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className={`p-2 border-r border-slate-100 text-[10px] md:text-xs font-mono font-bold ${isDone ? 'text-emerald-700' : 'text-slate-500'}`}>
                                            {isDone ? `${item.startTime || '-'} to ${item.endTime || '-'}` : 
                                             isCleaning ? `Start: ${item.startTime}` : 
                                             (isDND || isRefused) ? `Log: ${item.timeLogged}` : '-'}
                                        </td>
                                        <td className={`p-2 text-center text-sm font-black ${isDone ? 'text-emerald-700' : 'text-[#6D2158]'}`}>
                                            {isDone ? item.timeSpent : isCleaning ? 'Active' : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

        ) : (
            // --- ⚡ DYNAMIC ZOOM GRID VIEW ---
            <div 
                className={`grid content-start ${isExtreme ? 'gap-1' : isUltraDense ? 'gap-1.5' : 'gap-2 md:gap-3'}`} 
                style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
            >
            {filteredVillas.map((item, idx) => {
                const isCleaning = item.status === 'In Progress';
                const isDone = item.status === 'Completed';
                const isDND = item.status === 'DND';
                const isRefused = item.status === 'Refused';
                const isPending = item.status === 'Pending';

                // Formatters to shrink data for high zooms
                const typeLabel = isUltraDense ? item.type.substring(0, 3).toUpperCase() : item.type;
                const attendantLabel = isUltraDense ? item.attendant.split(' ')[0] : item.attendant;
                const timeIn = item.startTime?.replace(/ (AM|PM)/, (match) => match.trim().charAt(0).toLowerCase()) || '--:--';
                const timeOut = item.endTime?.replace(/ (AM|PM)/, (match) => match.trim().charAt(0).toLowerCase()) || '--:--';

                return (
                <div 
                    key={`${item.villa}-${idx}`} 
                    className={`shadow-sm transition-all flex flex-col justify-between rounded-xl overflow-hidden ${
                        isExtreme ? 'p-1 min-h-[45px] border' :
                        isUltraDense ? 'p-1.5 min-h-[60px] border' :
                        isDense ? 'p-2 min-h-[85px] border' : 
                        'p-2.5 md:p-3 min-h-[105px] border-2'
                    } ${
                        isDone ? 'bg-emerald-500 border-emerald-600 text-white shadow-emerald-500/20' :
                        isCleaning ? 'border-emerald-400 ring-2 ring-emerald-500/10 bg-emerald-50/20 bg-white' : 
                        isDND ? 'border-rose-300 bg-rose-50/40 bg-white' : 
                        isRefused ? 'border-orange-300 bg-orange-50/40 bg-white' : 
                        'border-slate-200 hover:border-[#6D2158]/40 hover:shadow-md bg-white'
                    }`}
                >
                    {/* Top Row: Villa Number & Status Icon */}
                    <div className="flex justify-between items-start mb-0.5 md:mb-1">
                        <span className={`font-black tracking-tighter leading-none ${
                            isExtreme ? 'text-xs' :
                            isUltraDense ? 'text-sm' : 
                            isDense ? 'text-lg' : 
                            'text-2xl'
                        } ${isDone ? 'text-white' : 'text-[#6D2158]'}`}>
                            {item.villa}
                        </span>
                        <div>
                            {/* ⚡ ELEGANT BREATHING SPARKLE */}
                            {isCleaning && <Sparkles size={isExtreme ? 8 : isUltraDense ? 10 : isDense ? 14 : 16} className="text-emerald-500 animate-pulse drop-shadow-sm" />}
                            {isDone && <CheckCircle2 size={isExtreme ? 8 : isUltraDense ? 10 : isDense ? 14 : 16} className="text-white"/>}
                            {isDND && <DoorClosed size={isExtreme ? 8 : isUltraDense ? 10 : isDense ? 14 : 16} className="text-rose-500"/>}
                            {isRefused && <X size={isExtreme ? 8 : isUltraDense ? 10 : isDense ? 14 : 16} className="text-orange-500"/>}
                            {isPending && <BedDouble size={isExtreme ? 8 : isUltraDense ? 10 : isDense ? 12 : 14} className="text-slate-300"/>}
                        </div>
                    </div>

                    {/* Middle: Badges */}
                    <div className="flex flex-wrap gap-0.5 md:gap-1 mb-0.5">
                        <span className={`rounded font-black uppercase tracking-widest truncate ${
                            isExtreme ? 'px-0.5 py-[1px] text-[5px]' :
                            isUltraDense ? 'px-1 py-0.5 text-[6px]' : 
                            isDense ? 'px-1.5 py-0.5 text-[7px]' : 
                            'px-1.5 py-0.5 text-[8px] md:text-[9px]'
                        } ${
                            isDone ? 'bg-white/20 text-white' :
                            item.type === 'Departure' ? 'bg-amber-100 text-amber-700' : 
                            item.type === 'Arrival' ? 'bg-blue-100 text-blue-700' : 
                            item.type === 'Touch Up' ? 'bg-sky-100 text-sky-700' :
                            'bg-slate-100 text-slate-600'
                        }`}>
                            {typeLabel}
                        </span>
                        {(isDND || isRefused) && !isExtreme && (
                            <span className={`rounded font-black uppercase tracking-widest flex items-center gap-0.5 ${
                                isUltraDense ? 'px-1 py-0.5 text-[6px]' : 'px-1.5 py-0.5 text-[7px] md:text-[8px]'
                            } ${isDND ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>
                                {isDND ? <AlertCircle size={6}/> : <X size={6}/>} {isDND ? 'DND' : 'REF'}
                            </span>
                        )}
                    </div>

                    {/* ⚡ Bottom: Attendant & Exact Finish Time Log */}
                    <div className={`mt-auto border-t flex flex-col ${isDone ? 'border-emerald-400/50' : 'border-slate-100'} ${isExtreme ? 'pt-0.5 gap-0' : isUltraDense ? 'pt-1 gap-0.5' : 'pt-1.5 gap-1'}`}>
                        <span className={`flex items-center gap-1 font-bold truncate leading-none ${
                            isExtreme ? 'text-[5px]' :
                            isUltraDense ? 'text-[6px]' : 
                            isDense ? 'text-[8px]' : 
                            'text-[9px] md:text-[10px]'
                        } ${isDone ? 'text-emerald-50' : 'text-slate-500'}`}>
                            {!isUltraDense && <User size={isDense ? 8 : 10} className="shrink-0"/>} <span className="truncate">{attendantLabel}</span>
                        </span>

                        {isCleaning && (
                            <div className={`flex items-center justify-between text-emerald-700 bg-emerald-50 rounded border border-emerald-100 ${
                                isExtreme ? 'px-0.5 py-[1px] mt-0.5' : isUltraDense ? 'px-1 py-0.5 mt-0.5' : 'px-1.5 py-0.5 mt-1'
                            }`}>
                                <span className={`${isExtreme ? 'text-[5px]' : isUltraDense ? 'text-[6px]' : 'text-[8px]'} font-black uppercase tracking-widest leading-none`}>
                                    {!isUltraDense && <Sparkles size={8} className="inline mr-1"/>}Active
                                </span>
                                <span className={`${isExtreme ? 'text-[5px]' : isUltraDense ? 'text-[7px]' : 'text-[9px]'} font-bold leading-none`}>{timeIn}</span>
                            </div>
                        )}

                        {/* EXPLICIT FINISH TIME */}
                        {isDone && (
                            <div className={`flex flex-col ${isExtreme ? 'gap-0 mt-0' : 'gap-0.5 mt-0.5'}`}>
                                <div className="flex items-center justify-between leading-none">
                                    {!isExtreme && <span className={`${isUltraDense ? 'text-[5px]' : 'text-[7px]'} font-black uppercase tracking-widest text-emerald-100`}>Finished:</span>}
                                    <span className={`${isExtreme ? 'text-[6px]' : isUltraDense ? 'text-[7px]' : 'text-[9px]'} font-bold text-white`}>
                                        {timeOut}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between leading-none mt-0.5">
                                    <span className={`${isExtreme ? 'text-[5px]' : isUltraDense ? 'text-[6px]' : 'text-[8px]'} text-emerald-100`}>
                                        {isExtreme ? timeIn : `In: ${timeIn}`}
                                    </span>
                                    <span className={`${isExtreme ? 'text-[5px] px-0.5' : isUltraDense ? 'text-[6px] px-1' : 'text-[8px] px-1'} font-black text-emerald-700 bg-white rounded`}>
                                        {item.timeSpent || '0m'}
                                    </span>
                                </div>
                            </div>
                        )}

                        {(isDND || isRefused) && (
                            <div className={`flex items-center justify-between ${isDND ? 'text-rose-500' : 'text-orange-500'} ${isUltraDense ? 'mt-0' : 'mt-0.5'}`}>
                                {!isExtreme && <span className={`${isUltraDense ? 'text-[5px]' : 'text-[7px]'} font-black uppercase tracking-widest`}>Log:</span>}
                                <span className={`${isExtreme ? 'text-[5px] ml-auto' : isUltraDense ? 'text-[6px]' : 'text-[8px]'} font-bold ${isDND ? 'bg-rose-50 border-rose-100' : 'bg-orange-50 border-orange-100'} px-1 py-0.5 rounded border leading-none`}>
                                    {item.timeLogged || '--:--'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                );
            })}
            </div>
        )}
      </div>
    </div>
  );
}
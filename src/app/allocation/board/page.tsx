"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, Sparkles, CheckCircle2, DoorClosed, 
  Clock, User, AlertCircle, BedDouble, Loader2, RefreshCw, Calendar, Search, X, Maximize, Minimize, TableProperties, LayoutGrid, ChevronDown, ZoomIn, Edit, Trash2, Plus, Save, LineChart
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO, isToday } from 'date-fns';
import { getDhakaTime, getDhakaDateStr } from '@/lib/dateUtils';
import toast from 'react-hot-toast';

type LiveTask = {
    villa: string;
    status: 'Pending' | 'In Progress' | 'Completed' | 'DND' | 'Refused';
    attendant: string;
    type: string;
    startTime?: string;
    endTime?: string;
    timeSpent?: string;
    timeLogged?: string;
    sessionHistory?: any[];
    pendingEditRequest?: any;
};

type EditState = {
    villa: string;
    status: string;
    timeSpent: number;
    sessionHistory: any[];
    pendingEditRequest?: any;
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

// Helper to parse 12-hour time string into timestamp for sorting
const parseTimeString = (timeStr: string | undefined) => {
    if (!timeStr) return 0;
    const today = new Date();
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return 0;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const period = match[3] ? match[3].toUpperCase() : '';
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    today.setHours(hours, mins, 0, 0);
    return today.getTime();
};

// ⚡ Helper to calculate minutes between two 12-hour times
const calculateMinutes = (startStr: string, endStr: string) => {
    const parseMins = (s: string) => {
        const m = s.match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const mins = parseInt(m[2], 10);
        const p = m[3] ? m[3].toUpperCase() : '';
        if (p === 'PM' && h < 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return h * 60 + mins;
    };

    const sMins = parseMins(startStr);
    const eMins = parseMins(endStr);
    
    if (sMins !== null && eMins !== null) {
        let diff = eMins - sMins;
        if (diff < 0) diff += 24 * 60; // Handle cross-midnight
        return diff;
    }
    return null;
};

// ⚡ Refined Styles with Reset Logic & Unified Colors
const getDoneStyles = (history: any[], isPastTurndown: boolean = false) => {
    const latestSession = history && history.length > 0 ? history[history.length - 1] : null;
    const reason = latestSession ? latestSession.reason : 'Morning Service';
    
    let label = 'Done';
    if (reason === 'TD Service') label = 'TD Done';
    else if (reason === 'Minibar Refill') label = 'MB Done';
    else if (reason === 'Guest Request') label = 'Req Done';
    else if (reason === 'Arrival') label = 'Arr Done';
    else if (reason === 'Dep') label = 'Dep Done';
    else label = 'Morn Done';

    // Reset visual background for Daytime tasks after 17:00
    if (isPastTurndown && reason !== 'TD Service') {
        return {
            bg: 'bg-white',
            border: 'border-slate-200',
            text: 'text-slate-500',
            badge: 'bg-slate-100',
            label: label,
            colorHex: 'text-slate-500',
            rowBg: 'bg-white',
            isReset: true
        };
    }

    if (reason === 'TD Service') {
        return { bg: 'bg-indigo-500', border: 'border-indigo-600', text: 'text-indigo-100', badge: 'bg-indigo-700', label, colorHex: 'text-indigo-600', rowBg: 'bg-indigo-50/50', isReset: false };
    } else if (['Morning Service', 'Arrival', 'Dep'].includes(reason)) {
        return { bg: 'bg-emerald-500', border: 'border-emerald-600', text: 'text-emerald-100', badge: 'bg-emerald-700', label, colorHex: 'text-emerald-600', rowBg: 'bg-emerald-50/50', isReset: false };
    } else {
        return { bg: 'bg-slate-500', border: 'border-slate-600', text: 'text-slate-100', badge: 'bg-slate-700', label, colorHex: 'text-slate-600', rowBg: 'bg-slate-50', isReset: false };
    }
};

export default function LiveCleaningBoard() {
  const [isLoading, setIsLoading] = useState(true);
  const [liveData, setLiveData] = useState<LiveTask[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'DND' | 'REFUSED'>('ALL');
  
  // View Modes & Fullscreen & Zoom
  const [boardDate, setBoardDate] = useState(getDhakaDateStr());
  const [hostSearch, setHostSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'GRID' | 'SHEET'>('GRID');
  const [gridColumns, setGridColumns] = useState(8);
  
  // Current time tracker for 17:00 Turndown reset
  const [currentTime, setCurrentTime] = useState(getDhakaTime());

  // Admin Edit Modal State
  const [editModal, setEditModal] = useState<EditState | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  // Insights State
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);

  useEffect(() => {
      const savedZoom = localStorage.getItem('hk_pulse_board_zoom');
      if (savedZoom) {
          setGridColumns(Number(savedZoom));
      }
      const interval = setInterval(() => setCurrentTime(getDhakaTime()), 60000);
      return () => clearInterval(interval);
  }, []);

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setGridColumns(val);
      localStorage.setItem('hk_pulse_board_zoom', String(val));
  };

  const fetchBoardData = useCallback(async (showLoader = true) => {
      if (showLoader) setIsLoading(true);

      const [allocRes, hostsRes, guestsRes, logsRes, reqsRes] = await Promise.all([
          supabase.from('hsk_allocations').select('host_id, task_details').eq('report_date', boardDate),
          supabase.from('hsk_hosts').select('id, host_id, full_name, nicknames'),
          supabase.from('hsk_daily_summary').select('villa_number, status').eq('report_date', boardDate),
          supabase.from('hsk_cleaning_logs').select('*').eq('report_date', boardDate),
          supabase.from('hsk_daily_requests').select('*').eq('request_type', 'Time Edit Request').eq('is_done', false)
      ]);

      const allocations = allocRes.data || [];
      const hosts = hostsRes.data || [];
      const guests = guestsRes.data || [];
      const logs = logsRes.data || [];
      const reqs = reqsRes.data || [];

      const hostMap: Record<string, string> = {};
      hosts.forEach(h => {
          const nickname = h.nicknames ? h.nicknames.split(',')[0].trim() : h.full_name;
          hostMap[h.id] = nickname; 
          hostMap[h.host_id] = nickname; 
      });

      const guestMap: Record<string, string> = {};
      guests.forEach(g => {
          let type = 'Occupied';
          const st = g.status?.toUpperCase() || '';
          if (st.includes('DEP')) type = 'Departure';
          if (st.includes('ARR')) type = 'Arrival';
          if (st.includes('VAC') || st === 'VM/VAC') type = 'Touch Up';
          guestMap[g.villa_number] = type;
      });

      const logsMap: Record<string, any> = {};
      logs.forEach(log => { logsMap[log.villa_number] = log; });

      const reqsMap: Record<string, any> = {};
      reqs.forEach(req => { reqsMap[req.villa_number] = req; });

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
                  type: guestMap[v] || 'Occupied',
                  startTime: log?.start_time ? format(parseISO(log.start_time), 'hh:mm a') : undefined,
                  endTime: log?.end_time ? format(parseISO(log.end_time), 'hh:mm a') : undefined,
                  timeSpent: log?.time_spent_minutes ? `${log.time_spent_minutes}` : undefined,
                  timeLogged: log?.dnd_time ? format(parseISO(log.dnd_time), 'hh:mm a') : log?.updated_at ? format(parseISO(log.updated_at), 'hh:mm a') : undefined,
                  sessionHistory: log?.session_history || [],
                  pendingEditRequest: reqsMap[v]
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
      const logChannel = supabase.channel('realtime-cleaning-board')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_cleaning_logs' }, () => fetchBoardData(false))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests', filter: "request_type=eq.Time Edit Request" }, () => fetchBoardData(false))
          .subscribe();

      return () => {
          supabase.removeChannel(logChannel);
      };
  }, [boardDate, fetchBoardData]);

  // ⚡ INSIGHTS GENERATOR
  const getInsights = () => {
      const hostStats: Record<string, { assigned: number, completed: number, validDurations: number[], autoStops: number }> = {};
      
      liveData.forEach(task => {
          if (!hostStats[task.attendant]) {
              hostStats[task.attendant] = { assigned: 0, completed: 0, validDurations: [], autoStops: 0 };
          }
          const stats = hostStats[task.attendant];
          
          if (['Arrival', 'Departure', 'Occupied'].includes(task.type)) {
              stats.assigned++;
              if (task.status === 'Completed') stats.completed++;
          }

          if (task.sessionHistory) {
              task.sessionHistory.forEach(s => {
                  if (s.autoStopped) stats.autoStops++;
                  if (s.duration > 0 && s.duration < 90) {
                      stats.validDurations.push(s.duration);
                  }
              });
          }
      });

      const insights = [];
      for (const [host, stats] of Object.entries(hostStats)) {
          if (host === 'Unknown Host') continue;

          const avgTime = stats.validDurations.length > 0 
              ? Math.round(stats.validDurations.reduce((a,b)=>a+b,0) / stats.validDurations.length) 
              : 0;

          const completionRate = stats.assigned > 0 ? Math.round((stats.completed / stats.assigned) * 100) : 0;

          let flag = null;
          if (avgTime > 45) flag = 'Slow Service';
          if (stats.assigned > 3 && completionRate < 30 && getDhakaTime().getHours() >= 14) flag = 'Inactive / Not Updating';
          if (stats.autoStops > 0) flag = 'Forgetting Timer';

          if (flag || avgTime > 0) {
              insights.push({ host, avgTime, completionRate, flag, autoStops: stats.autoStops });
          }
      }

      return insights.sort((a, b) => b.avgTime - a.avgTime);
  };


  // Admin Edit Functions
  const openEditModal = (task: LiveTask) => {
      setEditModal({
          villa: task.villa,
          status: task.status,
          timeSpent: parseInt(task.timeSpent || '0', 10),
          sessionHistory: JSON.parse(JSON.stringify(task.sessionHistory || [])),
          pendingEditRequest: task.pendingEditRequest
      });
  };

  const handleSessionChange = (index: number, field: string, value: string | number) => {
      if (!editModal) return;
      const newHistory = [...editModal.sessionHistory];
      newHistory[index] = { ...newHistory[index], [field]: value };
      
      // ⚡ Auto Calculate Duration
      if (field === 'start' || field === 'end') {
          const calcMins = calculateMinutes(newHistory[index].start, newHistory[index].end);
          if (calcMins !== null) {
              newHistory[index].duration = calcMins;
              
              // Automatically update the global timeSpent sum
              let newTotal = 0;
              newHistory.forEach(s => newTotal += (s.duration || 0));
              
              setEditModal({ ...editModal, timeSpent: newTotal, sessionHistory: newHistory });
              return;
          }
      }

      setEditModal({ ...editModal, sessionHistory: newHistory });
  };

  const addSession = () => {
      if (!editModal) return;
      const newHistory = [...editModal.sessionHistory, { reason: 'Other', start: '', end: '', duration: 0 }];
      setEditModal({ ...editModal, sessionHistory: newHistory });
  };

  const removeSession = (index: number) => {
      if (!editModal) return;
      const newHistory = editModal.sessionHistory.filter((_, i) => i !== index);
      // Update global timeSpent sum
      let newTotal = 0;
      newHistory.forEach(s => newTotal += (s.duration || 0));

      setEditModal({ ...editModal, timeSpent: newTotal, sessionHistory: newHistory });
  };

  // ⚡ Auto-Approve & Apply VA Edit Request Logic
  const acceptEditRequest = async () => {
      if (!editModal || !editModal.pendingEditRequest) return;
      setIsSavingEdit(true);
      
      const details = editModal.pendingEditRequest.item_details;
      const serviceTypeMatch = details.match(/(.*) time edit requested/i);
      const startMatch = details.match(/Start:\s*([0-9:]+)/i);
      const endMatch = details.match(/End:\s*([0-9:]+)/i);
      const durationMatch = details.match(/New Duration:\s*(\d+)/i);

      const serviceType = serviceTypeMatch ? serviceTypeMatch[1].trim() : 'Morning Service';
      
      const formatTo12H = (time24: string) => {
          if (!time24) return '';
          const parts = time24.split(':');
          if(parts.length < 2) return time24;
          let h = parseInt(parts[0], 10);
          const period = h >= 12 ? 'PM' : 'AM';
          h = h % 12 || 12;
          return `${h.toString().padStart(2, '0')}:${parts[1]} ${period}`;
      };

      const startTime = formatTo12H(startMatch ? startMatch[1].trim() : '');
      const endTime = formatTo12H(endMatch ? endMatch[1].trim() : '');
      const newDuration = durationMatch ? parseInt(durationMatch[1], 10) : 0;

      let newHistory = [...editModal.sessionHistory];
      const existingIndex = newHistory.findIndex(s => s.reason === serviceType);
      
      if (existingIndex >= 0) {
          newHistory[existingIndex] = { ...newHistory[existingIndex], start: startTime, end: endTime, duration: newDuration };
      } else {
          newHistory.push({ reason: serviceType, start: startTime, end: endTime, duration: newDuration });
      }

      const newTotalSpent = newHistory.reduce((total, s) => total + (s.duration || 0), 0);
      
      const payload = {
          status: 'Completed',
          time_spent_minutes: newTotalSpent,
          session_history: newHistory,
          updated_at: new Date().toISOString()
      };

      const { error: logError } = await supabase.from('hsk_cleaning_logs')
          .update(payload)
          .match({ report_date: boardDate, villa_number: editModal.villa });

      if (!logError) {
           await supabase.from('hsk_daily_requests')
              .update({is_done: true, is_sent: true})
              .eq('id', editModal.pendingEditRequest.id);
           
           toast.success('Time Edit Approved & Saved!');
           setEditModal(null);
           fetchBoardData(false);
      } else {
           toast.error('Failed to apply edit: ' + logError.message);
      }
      setIsSavingEdit(false);
  };

  const saveEditModal = async () => {
      if (!editModal) return;
      setIsSavingEdit(true);

      const payload = {
          status: editModal.status,
          time_spent_minutes: editModal.timeSpent,
          session_history: editModal.sessionHistory,
          updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('hsk_cleaning_logs')
          .update(payload)
          .match({ report_date: boardDate, villa_number: editModal.villa });

      setIsSavingEdit(false);

      if (error) {
          toast.error("Failed to save changes: " + error.message);
      } else {
          toast.success(`Room ${editModal.villa} updated successfully.`);
          setEditModal(null);
      }
  };

  const uniqueAttendants = useMemo(() => {
      return Array.from(new Set(liveData.map(t => t.attendant))).sort();
  }, [liveData]);

  const filteredVillas = useMemo(() => {
    let result = [...liveData];

    if (filter === 'IN_PROGRESS') result = result.filter(v => v.status === 'In Progress');
    if (filter === 'COMPLETED') result = result.filter(v => v.status === 'Completed');
    if (filter === 'DND') result = result.filter(v => v.status === 'DND');
    if (filter === 'REFUSED') result = result.filter(v => v.status === 'Refused');

    if (hostSearch) {
        result = result.filter(v => v.attendant === hostSearch);
    }

    result.sort((a,b) => parseFloat(a.villa.replace('-', '.')) - parseFloat(b.villa.replace('-', '.')));
    return result;
  }, [filter, liveData, hostSearch]);

  const sheetRows = useMemo(() => {
      let rows: any[] = [];
      filteredVillas.forEach(villa => {
          if (villa.sessionHistory && villa.sessionHistory.length > 0) {
              villa.sessionHistory.forEach((session, sIdx) => {
                  rows.push({
                      id: `${villa.villa}-hist-${sIdx}`,
                      villa: villa.villa,
                      attendant: villa.attendant,
                      type: villa.type,
                      status: 'Completed',
                      reason: session.reason || 'Service',
                      startTime: session.start,
                      endTime: session.end,
                      duration: session.duration,
                      autoStopped: session.autoStopped,
                      rawTime: parseTimeString(session.start) || parseTimeString(session.end),
                      originalTask: villa
                  });
              });
          }
          
          if (villa.status !== 'Completed' && villa.status !== 'Pending') {
             rows.push({
                 id: `${villa.villa}-active`,
                 villa: villa.villa,
                 attendant: villa.attendant,
                 type: villa.type,
                 status: villa.status,
                 reason: villa.status,
                 startTime: villa.startTime,
                 endTime: villa.endTime,
                 duration: villa.timeSpent,
                 rawTime: parseTimeString(villa.startTime) || parseTimeString(villa.timeLogged) || 0,
                 timeLogged: villa.timeLogged,
                 originalTask: villa
             });
          }
      });

      rows.sort((a, b) => a.rawTime - b.rawTime);
      return rows;
  }, [filteredVillas]);


  const baseVillas = hostSearch ? liveData.filter(v => v.attendant === hostSearch) : liveData;
  
  const progressVillas = baseVillas.filter(v => ['Arrival', 'Departure', 'Occupied'].includes(v.type));
  const total = progressVillas.length;
  const completed = progressVillas.filter(v => v.status === 'Completed').length;
  const progressPct = total === 0 ? 0 : (completed / total) * 100;
  
  const inProgress = baseVillas.filter(v => v.status === 'In Progress').length;
  const dnd = baseVillas.filter(v => v.status === 'DND').length;
  const refused = baseVillas.filter(v => v.status === 'Refused').length;

  const isViewingHistory = !isToday(parseISO(boardDate));

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
                    {/* INSIGHTS BUTTON */}
                    <button onClick={() => setIsInsightsOpen(true)} className="p-2 bg-amber-500/20 text-amber-300 rounded-full hover:bg-amber-500/30 active:scale-95 transition-all" title="View Insights">
                        <LineChart size={14}/>
                    </button>

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
            <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-white/70">Cleaning Progress</span>
            <span className={`${isFullscreen ? 'text-base' : 'text-lg md:text-xl'} font-black leading-none`}>{Math.round(progressPct)}%</span>
            </div>
            <div className="h-1.5 md:h-2 w-full bg-black/20 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 transition-all duration-1000" style={{ width: `${progressPct}%` }}></div>
            </div>
          </div>
        </div>

        {/* METRIC CARDS & FILTERS */}
        <div className={`flex flex-col lg:flex-row gap-3 md:gap-4 justify-between items-end ${isFullscreen ? 'mt-3' : 'mt-6'}`}>
            
            <div className="grid grid-cols-5 gap-2 w-full lg:w-auto flex-1 max-w-3xl">
                <button onClick={() => setFilter('ALL')} className={`p-1.5 md:p-2 rounded-xl flex flex-col items-center justify-center transition-all ${filter === 'ALL' ? 'bg-white text-[#6D2158] shadow-md scale-[1.02]' : 'bg-white/10 hover:bg-white/20'}`}>
                    <span className={`${isFullscreen ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-black leading-none`}>{baseVillas.length}</span>
                    <span className="text-[7px] md:text-[9px] font-bold uppercase tracking-widest opacity-80 mt-1">Total</span>
                </button>
                <button onClick={() => setFilter('IN_PROGRESS')} className={`p-1.5 md:p-2 rounded-xl flex flex-col items-center justify-center transition-all ${filter === 'IN_PROGRESS' ? 'bg-emerald-400 text-emerald-950 shadow-md scale-[1.02] ring-2 ring-emerald-300 ring-offset-1 ring-offset-[#6D2158]' : 'bg-white/10 hover:bg-white/20'}`}>
                    <span className={`${isFullscreen ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-black leading-none`}>{inProgress}</span>
                    <span className="text-[7px] md:text-[9px] font-bold uppercase tracking-widest opacity-80 mt-1 flex items-center gap-1"><Sparkles size={8} className="animate-pulse"/> Active</span>
                </button>
                <button onClick={() => setFilter('COMPLETED')} className={`p-1.5 md:p-2 rounded-xl flex flex-col items-center justify-center transition-all ${filter === 'COMPLETED' ? 'bg-blue-400 text-blue-950 shadow-md scale-[1.02]' : 'bg-white/10 hover:bg-white/20'}`}>
                    <span className={`${isFullscreen ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-black leading-none`}>{baseVillas.filter(v => v.status === 'Completed').length}</span>
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
            
            // --- EXCEL SHEET VIEW (CHRONOLOGICAL SESSIONS) ---
            <div className={`bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col ${isFullscreen ? 'rounded-2xl h-full' : 'rounded-3xl'}`}>
                <div className="overflow-auto custom-scrollbar flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200 text-center w-12">#</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200">Start Time</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200">Villa</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200">Attendant</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200 text-center">Type</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200 text-center">Session / Status</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200">Time Log</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center border-r border-slate-200">Duration</th>
                                <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sheetRows.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">No sessions logged yet.</td>
                                </tr>
                            )}
                            {sheetRows.map((row, idx) => {
                                const isCleaning = row.status === 'In Progress';
                                const isDone = row.status === 'Completed';
                                const isDND = row.status === 'DND';
                                const isRefused = row.status === 'Refused';
                                
                                const doneStyles = getDoneStyles([{ reason: row.reason }]);
                                
                                return (
                                    <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${isDone ? `${doneStyles.rowBg} opacity-90` : isDND ? 'bg-rose-50/30' : isRefused ? 'bg-orange-50/40' : isCleaning ? 'bg-emerald-50/30' : ''}`}>
                                        <td className="p-2 border-r border-slate-100 text-center text-xs font-bold text-slate-400">{idx + 1}</td>
                                        <td className={`p-2 border-r border-slate-100 text-xs font-bold text-slate-500`}>
                                            {row.startTime || row.timeLogged || '--:--'}
                                        </td>
                                        <td className={`p-2 border-r border-slate-100 font-black text-lg flex items-center gap-2 ${isDone ? doneStyles.colorHex : 'text-[#6D2158]'}`}>
                                            {row.villa}
                                            {row.originalTask.pendingEditRequest && (
                                                <span className="bg-purple-600 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded shadow animate-pulse border border-purple-400">Edit Req</span>
                                            )}
                                        </td>
                                        <td className={`p-2 border-r border-slate-100 text-xs font-bold flex items-center gap-2 ${isDone ? doneStyles.colorHex : 'text-slate-700'}`}>
                                            <User size={12} className={isDone ? doneStyles.colorHex : 'text-slate-400 hidden md:block'}/> {row.attendant}
                                        </td>
                                        <td className="p-2 border-r border-slate-100 text-center">
                                            <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
                                                row.type === 'Departure' ? 'bg-amber-100 text-amber-700' : 
                                                row.type === 'Arrival' ? 'bg-blue-100 text-blue-700' : 
                                                row.type === 'Touch Up' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {row.type}
                                            </span>
                                        </td>
                                        <td className="p-2 border-r border-slate-100 text-center">
                                            <span className={`flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${
                                                isCleaning ? 'text-emerald-600' : isDone ? doneStyles.colorHex : isDND ? 'text-rose-500' : isRefused ? 'text-orange-600' : 'text-slate-400'
                                            }`}>
                                                {isCleaning && <Sparkles size={10} className="animate-pulse hidden md:block"/>}
                                                {isDone && <CheckCircle2 size={10} className="hidden md:block"/>}
                                                {isDND && <DoorClosed size={10} className="hidden md:block"/>}
                                                {isRefused && <X size={10} className="hidden md:block"/>}
                                                {!isCleaning && !isDone && !isDND && !isRefused && <BedDouble size={10} className="hidden md:block"/>}
                                                {isDone ? row.reason : row.status}
                                            </span>
                                        </td>
                                        <td className={`p-2 border-r border-slate-100 text-[10px] md:text-xs font-mono font-bold flex flex-col items-start ${isDone ? doneStyles.colorHex : 'text-slate-500'}`}>
                                            {isDone ? `${row.startTime || '--:--'} to ${row.endTime || '--:--'}` : 
                                             isCleaning ? `Start: ${row.startTime || '--:--'}` : 
                                             (isDND || isRefused) ? `Log: ${row.timeLogged || '--:--'}` : '-'}
                                            {row.autoStopped && <span className="bg-rose-500 text-white text-[8px] px-1 rounded uppercase tracking-widest mt-0.5">Auto Stop</span>}
                                        </td>
                                        <td className={`p-2 text-center border-r border-slate-100 text-sm font-black ${isDone ? doneStyles.colorHex : 'text-[#6D2158]'}`}>
                                            {isDone ? `${row.duration || '0'}m` : isCleaning ? 'Active' : '-'}
                                        </td>
                                        <td className="p-2 text-center">
                                            <button onClick={() => openEditModal(row.originalTask)} className="p-1.5 bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-blue-600 hover:border-blue-300 rounded-md transition-all active:scale-95 mx-auto flex items-center justify-center" title="Edit Master Record">
                                                <Edit size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

        ) : (
            // --- GRID VIEW (VILLA CENTRIC) ---
            <div 
                className={`grid content-start ${isExtreme ? 'gap-1' : isUltraDense ? 'gap-1.5' : 'gap-2 md:gap-3'}`} 
                style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
            >
            {filteredVillas.map((item, idx) => {
                const isDone = item.status === 'Completed';
                const isPastTurndown = currentTime.getHours() >= 17;
                const doneStyles = getDoneStyles(item.sessionHistory || [], isPastTurndown);
                
                const isResetDone = isDone && doneStyles.isReset;

                const isCleaning = item.status === 'In Progress';
                const isDND = item.status === 'DND';
                const isRefused = item.status === 'Refused';
                const isPending = item.status === 'Pending';

                const typeLabel = isUltraDense ? item.type.substring(0, 3).toUpperCase() : item.type;
                const attendantLabel = isUltraDense ? item.attendant.split(' ')[0] : item.attendant;
                const timeIn = item.startTime?.replace(/ (AM|PM)/, (match) => match.trim().charAt(0).toLowerCase()) || '--:--';
                const timeOut = item.endTime?.replace(/ (AM|PM)/, (match) => match.trim().charAt(0).toLowerCase()) || '--:--';

                return (
                <div 
                    key={`${item.villa}-${idx}`} 
                    className={`shadow-sm transition-all flex flex-col justify-between rounded-xl overflow-hidden relative group ${
                        isExtreme ? 'p-1 min-h-[45px] border' :
                        isUltraDense ? 'p-1.5 min-h-[60px] border' :
                        isDense ? 'p-2 min-h-[85px] border' : 
                        'p-2.5 md:p-3 min-h-[105px] border-2'
                    } ${
                        isDone && !isResetDone ? `${doneStyles.bg} ${doneStyles.border} text-white shadow-sm` :
                        isResetDone ? 'bg-white border-slate-200 border-2 hover:border-[#6D2158]/40 hover:shadow-md' :
                        isCleaning ? 'border-emerald-400 ring-2 ring-emerald-500/10 bg-emerald-50/20 bg-white' : 
                        isDND ? 'border-rose-300 bg-rose-50/40 bg-white' : 
                        isRefused ? 'border-orange-300 bg-orange-50/40 bg-white' : 
                        'border-slate-200 hover:border-[#6D2158]/40 hover:shadow-md bg-white'
                    }`}
                >
                    {/* VA TIME EDIT REQUEST BADGE */}
                    {item.pendingEditRequest && (
                        <div className="absolute top-1 left-1 z-20">
                            <span className="bg-purple-600 text-white text-[8px] md:text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm animate-pulse border border-purple-400">Edit Req</span>
                        </div>
                    )}

                    {/* EDIT BUTTON (Visible permanently on touch devices, hover on desktop) */}
                    <button 
                        onClick={() => openEditModal(item)}
                        className={`absolute top-1.5 right-1.5 rounded-md bg-white/90 backdrop-blur-sm border border-slate-200 text-slate-500 shadow-sm opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-10 hover:text-blue-600 ${isExtreme || isUltraDense ? 'p-0.5' : 'p-1.5'}`}
                        title="Edit Log"
                    >
                        <Edit size={isExtreme || isUltraDense ? 10 : 12}/>
                    </button>

                    {/* Top Row: Villa Number & Status Icon */}
                    <div className="flex justify-between items-start mb-0.5 md:mb-1">
                        <span className={`font-black tracking-tighter leading-none ${
                            isExtreme ? 'text-xs' :
                            isUltraDense ? 'text-sm' : 
                            isDense ? 'text-lg' : 
                            'text-2xl'
                        } ${isDone && !isResetDone ? 'text-white' : 'text-[#6D2158]'}`}>
                            {item.villa}
                        </span>
                        <div>
                            {isCleaning && <Sparkles size={isExtreme ? 8 : isUltraDense ? 10 : isDense ? 14 : 16} className="text-emerald-500 animate-pulse drop-shadow-sm" />}
                            {isDone && !isResetDone && <CheckCircle2 size={isExtreme ? 8 : isUltraDense ? 10 : isDense ? 14 : 16} className="text-white"/>}
                            {isResetDone && <CheckCircle2 size={isExtreme ? 8 : isUltraDense ? 10 : isDense ? 14 : 16} className="text-slate-300"/>}
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
                            isDone && !isResetDone ? 'bg-white/20 text-white' :
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

                    {/* Bottom: Attendant & Session History Log */}
                    <div className={`mt-auto border-t flex flex-col ${isDone && !isResetDone ? 'border-white/20' : 'border-slate-100'} ${isExtreme ? 'pt-0.5 gap-0' : isUltraDense ? 'pt-1 gap-0.5' : 'pt-1.5 gap-1'}`}>
                        <span className={`flex items-center gap-1 font-bold truncate leading-none ${
                            isExtreme ? 'text-[5px]' :
                            isUltraDense ? 'text-[6px]' : 
                            isDense ? 'text-[8px]' : 
                            'text-[9px] md:text-[10px]'
                        } ${isDone && !isResetDone ? doneStyles.text : 'text-slate-500'}`}>
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

                        {isDone && (
                            <div className={`flex flex-col ${isExtreme ? 'gap-0 mt-0' : 'gap-0.5 mt-0.5'} max-h-24 overflow-y-auto custom-scrollbar pr-1 -mr-1`}>
                                {item.sessionHistory && item.sessionHistory.length > 0 ? (
                                    item.sessionHistory.map((session, sIdx) => (
                                        <div key={sIdx} className={`border-b ${isResetDone ? 'border-slate-100' : 'border-white/10'} last:border-0 pb-1 mb-1 last:pb-0 last:mb-0`}>
                                            <div className="flex items-center justify-between leading-none">
                                                {!isExtreme && <span className={`${isUltraDense ? 'text-[4px]' : 'text-[6px]'} font-black uppercase tracking-widest ${isResetDone ? 'text-slate-400' : doneStyles.text} truncate mr-1`}>
                                                    {session.reason || 'Service'}
                                                    {session.autoStopped && <span className="text-rose-400 ml-0.5 font-black">(Auto)</span>}
                                                </span>}
                                                <span className={`${isExtreme ? 'text-[5px]' : isUltraDense ? 'text-[6px]' : 'text-[8px]'} font-bold ${isResetDone ? 'text-slate-700' : 'text-white'} ml-auto`}>
                                                    {session.end?.replace(/ (AM|PM)/, (match: string) => match.trim().charAt(0).toLowerCase()) || '--:--'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between leading-none mt-0.5">
                                                <span className={`${isExtreme ? 'text-[4px]' : isUltraDense ? 'text-[5px]' : 'text-[7px]'} ${isResetDone ? 'text-slate-400' : doneStyles.text}`}>
                                                    {isExtreme ? session.start?.replace(/ (AM|PM)/, (match: string) => match.trim().charAt(0).toLowerCase()) : `In: ${session.start?.replace(/ (AM|PM)/, (match: string) => match.trim().charAt(0).toLowerCase()) || '--:--'}`}
                                                </span>
                                                <span className={`${isExtreme ? 'text-[4px] px-0.5' : isUltraDense ? 'text-[5px] px-1' : 'text-[7px] px-1'} font-black ${doneStyles.colorHex} ${isResetDone ? 'bg-slate-100' : 'bg-white'} rounded`}>
                                                    {session.duration || '0'}m
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col">
                                        <div className="flex items-center justify-between leading-none">
                                            {!isExtreme && <span className={`${isUltraDense ? 'text-[5px]' : 'text-[7px]'} font-black uppercase tracking-widest ${isResetDone ? 'text-slate-400' : doneStyles.text}`}>{doneStyles.label}:</span>}
                                            <span className={`${isExtreme ? 'text-[6px]' : isUltraDense ? 'text-[7px]' : 'text-[9px]'} font-bold ${isResetDone ? 'text-slate-700' : 'text-white'}`}>
                                                {timeOut}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between leading-none mt-0.5">
                                            <span className={`${isExtreme ? 'text-[5px]' : isUltraDense ? 'text-[6px]' : 'text-[8px]'} ${isResetDone ? 'text-slate-400' : doneStyles.text}`}>
                                                {isExtreme ? timeIn : `In: ${timeIn}`}
                                            </span>
                                            <span className={`${isExtreme ? 'text-[5px] px-0.5' : isUltraDense ? 'text-[6px] px-1' : 'text-[8px] px-1'} font-black ${doneStyles.colorHex} ${isResetDone ? 'bg-slate-100' : 'bg-white'} rounded`}>
                                                {item.timeSpent || '0'}m
                                            </span>
                                        </div>
                                    </div>
                                )}
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

      {/* ADMIN EDIT MODAL OVERLAY */}
      {editModal && (
          <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div>
                          <h2 className="text-xl font-black text-[#6D2158]">Edit Room {editModal.villa}</h2>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Manual Override</p>
                      </div>
                      <button onClick={() => setEditModal(null)} className="p-2 bg-white rounded-full text-slate-400 hover:text-rose-500 shadow-sm transition-colors">
                          <X size={20}/>
                      </button>
                  </div>
                  
                  <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-6">

                      {/* --- VA EDIT REQUEST BANNER --- */}
                      {editModal.pendingEditRequest && (
                          <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 shadow-inner">
                              <div className="flex items-center gap-2 mb-2 text-purple-800">
                                  <AlertCircle size={16}/>
                                  <h4 className="text-xs font-black uppercase tracking-widest">VA Requested Time Edit</h4>
                              </div>
                              <p className="text-sm font-bold text-purple-900 whitespace-pre-wrap bg-white/60 p-3 rounded-xl border border-purple-100">{editModal.pendingEditRequest.item_details}</p>
                              
                              <div className="flex gap-2 mt-3">
                                  <button 
                                      onClick={acceptEditRequest}
                                      disabled={isSavingEdit}
                                      className="flex-1 py-2.5 bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md hover:bg-purple-700 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                                  >
                                      {isSavingEdit ? <Loader2 className="animate-spin" size={14}/> : <CheckCircle2 size={14}/>}
                                      Accept & Apply
                                  </button>
                                  <button 
                                      onClick={async () => {
                                          await supabase.from('hsk_daily_requests').update({is_done: true, is_sent: true}).eq('id', editModal.pendingEditRequest.id);
                                          setEditModal({...editModal, pendingEditRequest: null});
                                          fetchBoardData(false);
                                          toast.success('Request declined & cleared.');
                                      }}
                                      disabled={isSavingEdit}
                                      className="flex-1 py-2.5 bg-white text-purple-700 border border-purple-200 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-purple-50 active:scale-95 transition-all flex justify-center items-center disabled:opacity-50"
                                  >
                                      Decline
                                  </button>
                              </div>
                          </div>
                      )}
                      
                      {/* Global Overrides */}
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Global Status</label>
                              <select 
                                  value={editModal.status}
                                  onChange={(e) => setEditModal({...editModal, status: e.target.value})}
                                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-[#6D2158]"
                              >
                                  <option value="Pending">Pending</option>
                                  <option value="In Progress">In Progress</option>
                                  <option value="Completed">Completed</option>
                                  <option value="DND">DND</option>
                                  <option value="Refused">Refused</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Total Duration (Mins)</label>
                              <input 
                                  type="number"
                                  value={editModal.timeSpent}
                                  onChange={(e) => setEditModal({...editModal, timeSpent: parseInt(e.target.value || '0', 10)})}
                                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-[#6D2158]"
                              />
                          </div>
                      </div>

                      {/* Session Logs Manager */}
                      <div className="border-t border-slate-100 pt-5">
                          <div className="flex justify-between items-center mb-3">
                              <label className="text-xs font-black uppercase tracking-widest text-[#6D2158]">Session Logs</label>
                              <button onClick={addSession} className="text-[10px] font-black uppercase tracking-widest bg-[#6D2158] text-white px-2 py-1 rounded-md flex items-center gap-1 active:scale-95 transition-transform">
                                  <Plus size={12}/> Add Session
                              </button>
                          </div>
                          
                          {editModal.sessionHistory.length === 0 ? (
                              <p className="text-sm font-bold text-slate-400 text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">No session logs recorded.</p>
                          ) : (
                              <div className="space-y-3">
                                  {editModal.sessionHistory.map((session, index) => (
                                      <div key={index} className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2 relative group">
                                          <button onClick={() => removeSession(index)} className="absolute -top-2 -right-2 bg-white text-rose-500 p-1.5 rounded-full shadow-md border border-slate-100 hover:bg-rose-50 hover:text-rose-700 transition-colors opacity-0 group-hover:opacity-100">
                                              <Trash2 size={14}/>
                                          </button>
                                          
                                          <div>
                                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reason</label>
                                              <input 
                                                  type="text" 
                                                  value={session.reason}
                                                  onChange={(e) => handleSessionChange(index, 'reason', e.target.value)}
                                                  className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                                              />
                                          </div>
                                          <div className="grid grid-cols-3 gap-2">
                                              <div>
                                                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">In (e.g. 10:30 AM)</label>
                                                  <input 
                                                      type="text" 
                                                      value={session.start}
                                                      onChange={(e) => handleSessionChange(index, 'start', e.target.value)}
                                                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-center"
                                                      placeholder="10:00 AM"
                                                  />
                                              </div>
                                              <div>
                                                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Out</label>
                                                  <input 
                                                      type="text" 
                                                      value={session.end}
                                                      onChange={(e) => handleSessionChange(index, 'end', e.target.value)}
                                                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-center"
                                                      placeholder="10:45 AM"
                                                  />
                                              </div>
                                              <div>
                                                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Mins (Auto)</label>
                                                  <input 
                                                      type="number" 
                                                      value={session.duration}
                                                      onChange={(e) => handleSessionChange(index, 'duration', parseInt(e.target.value || '0', 10))}
                                                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-emerald-700 text-center"
                                                  />
                                              </div>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="p-5 border-t border-slate-100 bg-white">
                      <button 
                          onClick={saveEditModal} 
                          disabled={isSavingEdit}
                          className="w-full py-3.5 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                      >
                          {isSavingEdit ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}
                          Save Overrides
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- INSIGHTS MODAL --- */}
      {isInsightsOpen && (
          <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div>
                          <h2 className="text-xl font-black text-amber-600 flex items-center gap-2"><LineChart size={20}/> Daily Insights</h2>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Attendant Performance</p>
                      </div>
                      <button onClick={() => setIsInsightsOpen(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-rose-500 shadow-sm transition-colors">
                          <X size={20}/>
                      </button>
                  </div>
                  
                  <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
                      {getInsights().length === 0 ? (
                          <div className="text-center py-10">
                              <p className="text-sm font-bold text-slate-400">No notable insights generated yet.</p>
                          </div>
                      ) : (
                          <div className="space-y-3">
                              {getInsights().map((insight, idx) => (
                                  <div key={idx} className={`p-4 rounded-2xl border ${insight.flag === 'Inactive / Not Updating' ? 'bg-rose-50 border-rose-200' : insight.flag === 'Slow Service' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                                      <h4 className="font-black text-slate-800 text-base">{insight.host}</h4>
                                      <div className="flex gap-2 mt-2">
                                          {insight.flag && <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${insight.flag === 'Inactive / Not Updating' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}`}>{insight.flag}</span>}
                                          {insight.autoStops > 0 && <span className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-700">{insight.autoStops} Auto Stops</span>}
                                      </div>
                                      <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-black/5">
                                          <div>
                                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Time</p>
                                              <p className={`text-lg font-black ${insight.avgTime > 45 ? 'text-amber-600' : 'text-slate-700'}`}>{insight.avgTime}m</p>
                                          </div>
                                          <div>
                                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Completion</p>
                                              <p className={`text-lg font-black ${insight.completionRate < 50 ? 'text-rose-600' : 'text-emerald-600'}`}>{insight.completionRate}%</p>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
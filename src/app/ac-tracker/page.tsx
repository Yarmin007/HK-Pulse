"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wind, Power, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, 
  Loader2, ZapOff, MapPin, User, RefreshCw, Timer, LayoutGrid, BarChart3,
  TrendingDown, Zap, Trophy, Leaf, Activity, History
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';

const TOTAL_VILLAS = 97;
const JETTY_A = Array.from({length: 35}, (_, i) => i + 1);
const JETTY_B = Array.from({length: 14}, (_, i) => i + 37);
const JETTY_C = Array.from({length: 21}, (_, i) => i + 59);
const BEACH = [36, ...Array.from({length: 8}, (_, i) => i + 51), ...Array.from({length: 18}, (_, i) => i + 80)];

// Strictly enforce Maldives time
const getLocalToday = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};

// Calculate duration and prevent negative time bugs
const getDuration = (dateString?: string, currentMs?: number) => {
    if (!dateString) return null;
    const past = new Date(dateString).getTime();
    const now = currentMs || new Date().getTime();
    
    const diffMs = Math.max(0, now - past); 
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    if (diffMins === 0) return `Just now`;
    return `${diffMins}m`;
};

const parseVillas = (str: string): number[] => {
    if (!str) return [];
    const parts = str.split(',');
    const villas = new Set<number>();
    parts.forEach(p => {
        p = p.trim();
        if (p.includes('-')) {
            const [start, end] = p.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) villas.add(i);
            }
        } else {
            const v = parseInt(p, 10);
            if (!isNaN(v)) villas.add(v);
        }
    });
    return Array.from(villas).sort((a,b) => a-b);
};

type VillaStatus = {
    villa_number: string;
    guest_status: string; 
    ac_status: 'ON' | 'OFF';
    updated_at?: string;
    updated_by_name?: string;
};

type HistoryLog = {
    id: string;
    villa_number: string;
    status: string;
    host_name: string;
    logged_at: string;
};

export default function ACTrackerPage() {
  const [activeTab, setActiveTab] = useState<'matrix' | 'insights'>('matrix');
  const [selectedDate, setSelectedDate] = useState(getLocalToday());
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string, name: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  
  const [villasData, setVillasData] = useState<Record<string, VillaStatus>>({});
  const [myAllocatedVillas, setMyAllocatedVillas] = useState<number[]>([]);
  const [historyData, setHistoryData] = useState<HistoryLog[]>([]);
  
  // NEW: Holds the all-time saved milliseconds from the database trigger
  const [baseAllTimeMs, setBaseAllTimeMs] = useState(0);

  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
      const timer = setInterval(() => setCurrentTime(new Date()), 60000);
      return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const sessionData = localStorage.getItem('hk_pulse_session');
    if (sessionData) {
        const parsed = JSON.parse(sessionData);
        setIsAdmin(parsed.system_role === 'admin');
        setCurrentUser({ id: parsed.id || parsed.host_id, name: parsed.full_name || 'Staff' });
    } else if (localStorage.getItem('hk_pulse_admin_auth') === 'true') {
        setIsAdmin(true);
        setCurrentUser({ id: 'admin', name: 'Admin' });
    }
  }, []);

  const fetchData = useCallback(async (silent = false) => {
      if (!silent) setIsProcessing(true);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [summaryRes, acRes, historyRes, constRes] = await Promise.all([
          supabase.from('hsk_daily_summary').select('villa_number, status').eq('report_date', selectedDate),
          supabase.from('hsk_ac_tracker').select('*'),
          isAdmin ? supabase.from('hsk_ac_history').select('*').gte('logged_at', sevenDaysAgo.toISOString()).order('logged_at', { ascending: false }) : Promise.resolve({ data: [] }),
          isAdmin ? supabase.from('hsk_constants').select('label').eq('type', 'ac_energy_saved_ms').maybeSingle() : Promise.resolve({ data: null })
      ]);

      const summaryData = summaryRes.data || [];
      const acData = acRes.data || [];
      const hData = historyRes.data || [];

      // Set the all-time base MS from database trigger
      if (constRes.data && constRes.data.label) {
          setBaseAllTimeMs(parseInt(constRes.data.label, 10) || 0);
      }

      const dataMap: Record<string, VillaStatus> = {};
      
      for (let i = 1; i <= TOTAL_VILLAS; i++) {
          const vNum = i.toString();
          const guestState = summaryData?.find(s => parseInt(s.villa_number) === i)?.status || 'VAC';
          const acState = acData?.find(a => parseInt(a.villa_number) === i);
          
          dataMap[vNum] = {
              villa_number: vNum,
              guest_status: guestState,
              ac_status: acState ? acState.status : 'ON', 
              updated_at: acState?.updated_at,
              updated_by_name: acState?.host_name,
          };
      }
      setVillasData(dataMap);
      if (isAdmin) setHistoryData(hData);

      if (!isAdmin && currentUser && currentUser.id !== 'admin') {
          const { data: allocData } = await supabase
              .from('hsk_allocations')
              .select('task_details')
              .eq('report_date', selectedDate)
              .eq('host_id', currentUser.id)
              .eq('area', 'villa')
              .maybeSingle();

          if (allocData && allocData.task_details) {
              setMyAllocatedVillas(parseVillas(allocData.task_details));
          } else {
              setMyAllocatedVillas([]);
          }
      }

      if (!silent) setIsProcessing(false);
  }, [selectedDate, isAdmin, currentUser]);

  useEffect(() => {
    if (currentUser) fetchData();
  }, [fetchData, currentUser]);

  useEffect(() => {
      const channel = supabase
          .channel('ac-live-updates')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_ac_tracker' }, (payload) => {
              const newRecord = payload.new as any;
              if (newRecord && newRecord.villa_number) {
                  setVillasData(prev => {
                      const existing = prev[newRecord.villa_number];
                      if (!existing) return prev;
                      return {
                          ...prev,
                          [newRecord.villa_number]: {
                              ...existing,
                              ac_status: newRecord.status,
                              updated_at: newRecord.updated_at,
                              updated_by_name: newRecord.host_name
                          }
                      };
                  });
              }
          })
          .subscribe();

      return () => {
          supabase.removeChannel(channel);
      };
  }, []);

  const toggleAC = async (villaNum: string, currentAcStatus: string) => {
      const newStatus = currentAcStatus === 'ON' ? 'OFF' : 'ON';
      
      setVillasData(prev => ({
          ...prev,
          [villaNum]: { ...prev[villaNum], ac_status: newStatus, updated_by_name: currentUser?.name, updated_at: new Date().toISOString() }
      }));

      const { error } = await supabase.from('hsk_ac_tracker').upsert({
          report_date: selectedDate,
          villa_number: villaNum,
          status: newStatus,
          host_id: currentUser?.id,
          host_name: currentUser?.name,
          updated_at: new Date().toISOString()
      }, { onConflict: 'villa_number' });

      if (error) {
          toast.error("Failed to update AC status");
          fetchData(true); 
      } else {
          await supabase.from('hsk_ac_history').insert({
              villa_number: villaNum,
              status: newStatus,
              host_id: currentUser?.id,
              host_name: currentUser?.name,
              logged_at: new Date().toISOString()
          });

          toast.success(`V${villaNum} AC marked ${newStatus}`);
      }
  };

  const changeDate = (days: number) => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      setSelectedDate(d.toISOString().split('T')[0]);
  };

  const totalVacant = Object.values(villasData).filter(v => v.guest_status === 'VAC' || v.guest_status === 'VM/VAC' || v.guest_status === 'DEP').length;
  const vacantWithAcOn = Object.values(villasData).filter(v => (v.guest_status === 'VAC' || v.guest_status === 'VM/VAC' || v.guest_status === 'DEP') && v.ac_status === 'ON').length;
  const totalAcOff = Object.values(villasData).filter(v => v.ac_status === 'OFF').length;

  const generateChartData = () => {
      const days = Array.from({ length: 7 }, (_, i) => {
          const d = subDays(new Date(), 6 - i);
          return format(d, 'MMM dd');
      });

      const counts = days.map(dayStr => {
          return historyData.filter(log => format(new Date(log.logged_at), 'MMM dd') === dayStr && log.status === 'OFF').length;
      });

      const maxCount = Math.max(...counts, 5);

      return days.map((day, i) => ({
          day, count: counts[i], heightPercent: (counts[i] / maxCount) * 100
      }));
  };
  
  const chartData = generateChartData();

  // --- UPDATED ALL-TIME CALCULATION ---
  let totalOffMs = baseAllTimeMs; // Start with the all-time database amount
  const villaOffStats: Record<string, number> = {};

  if (isAdmin) {
      for (let i = 1; i <= TOTAL_VILLAS; i++) {
          const vNum = i.toString();
          villaOffStats[vNum] = 0;
          
          const vLogs = historyData.filter(log => log.villa_number === vNum).sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
          let currentOffTime: number | null = null;

          // 7-Day loop ONLY for the leaderboard (not added to totalOffMs)
          vLogs.forEach(log => {
              if (log.status === 'OFF') {
                  currentOffTime = new Date(log.logged_at).getTime();
              } else if (log.status === 'ON' && currentOffTime !== null) {
                  const duration = new Date(log.logged_at).getTime() - currentOffTime;
                  villaOffStats[vNum] += duration; 
                  currentOffTime = null;
              }
          });

          const liveData = villasData[vNum];
          if (liveData && liveData.ac_status === 'OFF') {
               let offStart: number | null = currentOffTime;
               if (offStart === null && liveData.updated_at) {
                   offStart = new Date(liveData.updated_at).getTime();
               }
               if (offStart !== null) {
                   const duration = Math.max(0, currentTime.getTime() - offStart);
                   totalOffMs += duration; // Add live actively-running time to All-Time Total
                   villaOffStats[vNum] += duration; // Add live actively-running time to 7-Day Leaderboard
               }
          }
      }
  }

  const totalHoursSaved = Math.floor(totalOffMs / (1000 * 60 * 60));
  
  const topSavers = Object.entries(villaOffStats)
      .filter(([_, ms]) => ms > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([vNum, ms]) => {
          const h = Math.floor(ms / (1000 * 60 * 60));
          const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
          return { villa: vNum, formatted: h > 0 ? `${h}h ${m}m` : `${m}m`, rawMs: ms };
      });
  const maxSaverMs = topSavers.length > 0 ? topSavers[0].rawMs : 1;

  const renderVillaCard = (vNum: number) => {
      const data = villasData[vNum.toString()];
      if (!data) return null;

      const isVacant = data.guest_status === 'VAC' || data.guest_status === 'VM/VAC' || data.guest_status.includes('DEP');
      const isWastingEnergy = isVacant && data.ac_status === 'ON';
      const isSaved = isVacant && data.ac_status === 'OFF';
      const durationStr = getDuration(data.updated_at, currentTime.getTime());

      return (
          <div key={vNum} className={`flex flex-col bg-white rounded-xl border-2 p-3 shadow-sm transition-all ${
              isWastingEnergy ? 'border-rose-400 bg-rose-50/30' : 
              isSaved ? 'border-emerald-400 bg-emerald-50/30' : 
              'border-slate-200'
          }`}>
              <div className="flex justify-between items-start mb-3">
                  <div>
                      <span className="text-lg font-black text-slate-800 leading-none block">V{vNum}</span>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded mt-1 inline-block ${
                          isVacant ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'
                      }`}>{data.guest_status}</span>
                  </div>
                  {isWastingEnergy && <AlertTriangle size={18} className="text-rose-500 animate-pulse" />}
                  {isSaved && <CheckCircle size={18} className="text-emerald-500" />}
              </div>

              <button 
                  onClick={() => toggleAC(vNum.toString(), data.ac_status)}
                  className={`w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-sm ${
                      data.ac_status === 'ON' 
                        ? 'bg-slate-100 text-slate-600 hover:bg-rose-100 hover:text-rose-700' 
                        : 'bg-emerald-500 text-white shadow-emerald-500/20'
                  }`}
              >
                  <Power size={14} />
                  {data.ac_status === 'ON' ? 'AC IS ON' : 'AC TURNED OFF'}
              </button>

              {(data.updated_by_name || durationStr) && (
                  <div className="flex justify-between items-center mt-2 px-1">
                      {data.updated_by_name && data.ac_status === 'OFF' ? (
                          <span className="text-[9px] text-slate-400 font-medium truncate max-w-[60%]">
                              By {data.updated_by_name.split(' ')[0]}
                          </span>
                      ) : <span />}
                      {durationStr && (
                          <span className={`text-[9px] font-bold flex items-center gap-1 ${data.ac_status === 'ON' ? 'text-rose-400' : 'text-emerald-600'}`}>
                              <Timer size={10} /> {durationStr}
                          </span>
                      )}
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-32">
        <div className="max-w-7xl mx-auto space-y-6">
            
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-1.5 bg-emerald-500 rounded-full shrink-0"></div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-[#6D2158]">Energy & AC Tracker</h1>
                        <p className="text-xs font-bold text-slate-500 mt-0.5 uppercase tracking-widest">Ensure all vacant villas are powered off.</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* TAB NAVIGATION FOR ADMINS */}
                    {isAdmin && (
                        <div className="hidden md:flex bg-slate-100 p-1 mr-2 rounded-xl">
                            <button onClick={() => setActiveTab('matrix')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'matrix' ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <LayoutGrid size={14}/> Matrix
                            </button>
                            <button onClick={() => setActiveTab('insights')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'insights' ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <BarChart3 size={14}/> Insights
                            </button>
                        </div>
                    )}

                    {activeTab === 'matrix' && (
                        <>
                            <button onClick={() => fetchData()} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 transition-colors" title="Force Sync">
                                <RefreshCw size={18} className={isProcessing ? 'animate-spin' : ''}/>
                            </button>
                            <div className="flex items-center bg-slate-100 rounded-xl p-1 shadow-inner">
                                <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white rounded-lg text-slate-500 shadow-sm"><ChevronLeft size={16}/></button>
                                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none px-2 cursor-pointer"/>
                                <button onClick={() => changeDate(1)} className="p-2 hover:bg-white rounded-lg text-slate-500 shadow-sm"><ChevronRight size={16}/></button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* MOBILE TAB NAV */}
            {isAdmin && (
                <div className="md:hidden flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm mb-4">
                    <button onClick={() => setActiveTab('matrix')} className={`flex-1 flex justify-center items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'matrix' ? 'bg-slate-100 text-[#6D2158]' : 'text-slate-400'}`}>
                        <LayoutGrid size={16}/> Matrix
                    </button>
                    <button onClick={() => setActiveTab('insights')} className={`flex-1 flex justify-center items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'insights' ? 'bg-slate-100 text-[#6D2158]' : 'text-slate-400'}`}>
                        <BarChart3 size={16}/> Insights
                    </button>
                </div>
            )}

            {isProcessing ? (
                <div className="py-20 flex justify-center"><Loader2 size={48} className="text-[#6D2158] animate-spin" /></div>
            ) : activeTab === 'matrix' ? (
                <>
                    {/* MATRIX TAB */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-bottom-4">
                        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-lg border border-slate-700 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Total Vacant Villas</p>
                                <p className="text-4xl font-black text-white mt-1">{totalVacant}</p>
                            </div>
                            <Wind size={40} className="text-white/20" />
                        </div>
                        
                        <div className={`p-6 rounded-2xl shadow-lg border flex items-center justify-between transition-colors ${vacantWithAcOn > 0 ? 'bg-rose-500 border-rose-600' : 'bg-emerald-500 border-emerald-600'}`}>
                            <div>
                                <p className="text-xs font-black uppercase text-white/70 tracking-widest">Vacant & AC Left ON</p>
                                <p className="text-4xl font-black text-white mt-1 flex items-center gap-3">
                                    {vacantWithAcOn} 
                                    {vacantWithAcOn > 0 && <span className="text-[10px] font-bold bg-white text-rose-600 px-2 py-1 rounded-md uppercase tracking-wider">Action Required</span>}
                                </p>
                            </div>
                            <AlertTriangle size={40} className="text-white/20" />
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-black uppercase text-emerald-600 tracking-widest">ACs Logged OFF</p>
                                <p className="text-4xl font-black text-slate-800 mt-1">{totalAcOff}</p>
                            </div>
                            <ZapOff size={40} className="text-emerald-100" />
                        </div>
                    </div>

                    {!isAdmin && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-in slide-in-from-bottom-4">
                            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-6 border-b border-slate-100 pb-3">
                                <User size={20} className="text-[#6D2158]"/> My Allocated Villas
                            </h2>
                            {myAllocatedVillas.length === 0 ? (
                                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                                    <p className="text-sm font-bold text-slate-500">No villas allocated to you today.</p>
                                    <p className="text-xs text-slate-400 mt-1">Check the Allocation Sheet or contact your supervisor.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {myAllocatedVillas.map(v => renderVillaCard(v))}
                                </div>
                            )}
                        </div>
                    )}

                    {isAdmin && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-6">
                            {[
                                { title: 'Jetty A', villas: JETTY_A },
                                { title: 'Jetty B', villas: JETTY_B },
                                { title: 'Jetty C', villas: JETTY_C },
                                { title: 'Beach Villas', villas: BEACH }
                            ].map(jetty => (
                                <div key={jetty.title} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
                                    <h3 className="text-sm font-black uppercase text-slate-700 tracking-widest mb-6 flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <MapPin size={18} className="text-[#6D2158]" /> {jetty.title}
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                                        {jetty.villas.map(v => renderVillaCard(v))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                /* INSIGHTS TAB (Admins Only) - FIXED RESPONSIVE GRID */
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        
                        {/* High Impact: All-Time Energy Saved */}
                        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-8 rounded-[2.5rem] shadow-xl text-white flex flex-col justify-between relative overflow-hidden col-span-1">
                            <div className="absolute top-0 right-0 p-8 opacity-10"><Leaf size={160} /></div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-emerald-100 mb-2 flex items-center gap-2"><Zap size={18}/> All-Time Hours Saved</h3>
                                <p className="text-7xl font-black mt-2 tracking-tighter">{totalHoursSaved}<span className="text-3xl text-emerald-200">h</span></p>
                                <p className="text-sm font-medium text-emerald-100 mt-4 max-w-[90%]">Total runtime saved across all properties by proactively powering down AC units.</p>
                            </div>
                            <div className="mt-8 bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Currently Active</p>
                                    <p className="text-xl font-bold">{totalAcOff} Villas Offline</p>
                                </div>
                                <Activity size={24} className="text-emerald-200"/>
                            </div>
                        </div>

                        {/* Top 5 Leaderboard (7-Day) */}
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 col-span-1">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-6 flex items-center gap-2"><Trophy size={18} className="text-[#6D2158]"/> Top 5 Savers (7 Days)</h3>
                            <div className="space-y-4">
                                {topSavers.map((saver, idx) => (
                                    <div key={saver.villa} className="flex items-center gap-4">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${idx === 0 ? 'bg-amber-100 text-amber-600' : idx === 1 ? 'bg-slate-200 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'}`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-black text-slate-700">V{saver.villa}</span>
                                                <span className="text-xs font-bold text-[#6D2158]">{saver.formatted}</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-[#6D2158] to-purple-400 rounded-full" style={{ width: `${(saver.rawMs / maxSaverMs) * 100}%` }}/>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {topSavers.length === 0 && <p className="text-sm text-slate-400 font-medium text-center py-10">Waiting for data...</p>}
                            </div>
                        </div>

                        {/* 7-Day Chart Card */}
                        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-200 col-span-1 lg:col-span-2 xl:col-span-1 flex flex-col">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-2 flex items-center gap-2">
                                <BarChart3 size={18} className="text-[#6D2158]"/> 7-Day Action Trend
                            </h3>
                            <p className="text-xs text-slate-400 font-medium mb-6">Times AC was turned OFF per day.</p>
                            
                            <div className="flex-1 flex items-end justify-between gap-1 sm:gap-2 border-b border-slate-100 pb-2 min-h-[150px] pt-8">
                                {chartData.map((data, index) => (
                                    <div key={index} className="flex flex-col items-center flex-1 h-full group justify-end">
                                        <div className="w-full flex justify-center items-end flex-1 relative">
                                            <div 
                                                className="w-full max-w-[40px] bg-emerald-100 group-hover:bg-emerald-300 rounded-t-md transition-all duration-500 relative"
                                                style={{ height: `${data.heightPercent}%`, minHeight: data.count > 0 ? '12px' : '4px' }}
                                            >
                                                {data.count > 0 && (
                                                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-black text-emerald-700 bg-white shadow-sm border border-emerald-100 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                        {data.count}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-widest text-center truncate w-full">
                                            {data.day}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Audit Feed */}
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-6 flex items-center gap-2"><History size={18} className="text-[#6D2158]"/> AC Activity Log</h3>
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-4 custom-scrollbar">
                            {historyData.slice(0, 30).map((log) => (
                                <div key={log.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${log.status === 'OFF' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                            <Wind size={16} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-800">Villa {log.villa_number}</p>
                                            <p className="text-xs font-bold text-slate-500">By {log.host_name}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg shadow-sm ${log.status === 'OFF' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                            {log.status === 'OFF' ? 'Turned OFF' : 'Turned ON'}
                                        </span>
                                        <p className="text-[10px] font-bold text-slate-400 mt-2">{format(new Date(log.logged_at), 'MMM dd, hh:mm a')}</p>
                                    </div>
                                </div>
                            ))}
                            {historyData.length === 0 && <div className="text-center py-10 text-slate-400 font-bold">No telemetry history logged yet.</div>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
}
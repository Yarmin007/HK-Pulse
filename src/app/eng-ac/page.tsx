"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wind, AlertTriangle, CheckCircle, ZapOff, MapPin, Loader2, Clock, MonitorPlay, Timer, 
  BarChart3, LayoutGrid, History, TrendingDown, Zap, Trophy, Leaf, Activity
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, subDays } from 'date-fns';

const TOTAL_VILLAS = 97;
const JETTY_A = Array.from({length: 35}, (_, i) => i + 1);
const JETTY_B = Array.from({length: 14}, (_, i) => i + 37);
const JETTY_C = Array.from({length: 21}, (_, i) => i + 59);
const BEACH = [36, ...Array.from({length: 8}, (_, i) => i + 51), ...Array.from({length: 18}, (_, i) => i + 80)];

const getLocalToday = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};

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

export default function EngineeringACBoard() {
  const [activeTab, setActiveTab] = useState<'matrix' | 'insights'>('matrix');
  const [isProcessing, setIsProcessing] = useState(true);
  const [villasData, setVillasData] = useState<Record<string, VillaStatus>>({});
  const [historyData, setHistoryData] = useState<HistoryLog[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Live Clock (Ticks every 60 seconds)
  useEffect(() => {
      const timer = setInterval(() => setCurrentTime(new Date()), 60000); 
      return () => clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
      const todayStr = getLocalToday();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [summaryRes, acRes, historyRes] = await Promise.all([
          supabase.from('hsk_daily_summary').select('villa_number, status').eq('report_date', todayStr),
          supabase.from('hsk_ac_tracker').select('*'),
          supabase.from('hsk_ac_history').select('*').gte('logged_at', sevenDaysAgo.toISOString()).order('logged_at', { ascending: false })
      ]);

      const summaryData = summaryRes.data || [];
      const acData = acRes.data || [];
      const hData = historyRes.data || [];

      const dataMap: Record<string, VillaStatus> = {};
      
      for (let i = 1; i <= TOTAL_VILLAS; i++) {
          const vNum = i.toString();
          const guestState = summaryData.find(s => parseInt(s.villa_number) === i)?.status || 'VAC';
          const acState = acData.find(a => parseInt(a.villa_number) === i);
          
          dataMap[vNum] = {
              villa_number: vNum,
              guest_status: guestState,
              ac_status: acState ? acState.status : 'ON',
              updated_at: acState?.updated_at,
              updated_by_name: acState?.host_name,
          };
      }
      
      setVillasData(dataMap);
      setHistoryData(hData);
      setLastUpdated(new Date());
      setIsProcessing(false);
  }, []);

  useEffect(() => {
      fetchData();
  }, [fetchData]);

  // --- LIVE REAL-TIME SYNC ---
  useEffect(() => {
      const channel = supabase
          .channel('eng-ac-live-updates')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_ac_tracker' }, () => {
              fetchData(); 
          })
          .subscribe();

      return () => {
          supabase.removeChannel(channel);
      };
  }, [fetchData]);

  const vacantWithAcOn = Object.values(villasData).filter(v => (v.guest_status === 'VAC' || v.guest_status === 'VM/VAC' || v.guest_status === 'DEP') && v.ac_status === 'ON').length;
  const totalAcOff = Object.values(villasData).filter(v => v.ac_status === 'OFF').length;

  // --- CHART & ANALYTICS CALCULATION ---
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

  // --- DEEP INSIGHTS CALCULATION (Total Time & Top 5) ---
  let totalOffMs = 0;
  const villaOffStats: Record<string, number> = {};

  for (let i = 1; i <= TOTAL_VILLAS; i++) {
      const vNum = i.toString();
      villaOffStats[vNum] = 0;
      
      // Sort logs oldest to newest for this villa
      const vLogs = historyData.filter(log => log.villa_number === vNum).sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
      let currentOffTime: number | null = null;

      vLogs.forEach(log => {
          if (log.status === 'OFF') {
              currentOffTime = new Date(log.logged_at).getTime();
          } else if (log.status === 'ON' && currentOffTime !== null) {
              const duration = new Date(log.logged_at).getTime() - currentOffTime;
              totalOffMs += duration;
              villaOffStats[vNum] += duration;
              currentOffTime = null;
          }
      });

      // Handle if it is CURRENTLY OFF
      const liveData = villasData[vNum];
      if (liveData && liveData.ac_status === 'OFF') {
           let offStart: number | null = currentOffTime;
           
           if (offStart === null && liveData.updated_at) {
               offStart = new Date(liveData.updated_at).getTime();
           }
           
           if (offStart !== null) {
               const duration = Math.max(0, currentTime.getTime() - offStart);
               totalOffMs += duration;
               villaOffStats[vNum] += duration;
           }
      }
  }

  const totalHoursSaved = Math.floor(totalOffMs / (1000 * 60 * 60));
  
  // Rank Top 5 Villas
  const topSavers = Object.entries(villaOffStats)
      .filter(([_, ms]) => ms > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([vNum, ms]) => {
          const h = Math.floor(ms / (1000 * 60 * 60));
          const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
          return {
              villa: vNum,
              formatted: h > 0 ? `${h}h ${m}m` : `${m}m`,
              rawMs: ms
          };
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
          <div key={vNum} className={`flex flex-col bg-white rounded-2xl border p-3 shadow-sm transition-all ${
              isWastingEnergy ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-100' : 
              isSaved ? 'border-emerald-300 bg-emerald-50/30' : 
              'border-slate-200'
          }`}>
              <div className="flex justify-between items-start mb-3">
                  <div>
                      <span className="text-lg font-black text-slate-800 leading-none block">V{vNum}</span>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded mt-1 inline-block ${
                          isVacant ? 'bg-slate-100 text-slate-500' : 'bg-[#6D2158]/10 text-[#6D2158]'
                      }`}>{data.guest_status}</span>
                  </div>
                  {isWastingEnergy && <AlertTriangle size={18} className="text-rose-500 animate-pulse" />}
                  {isSaved && <CheckCircle size={18} className="text-emerald-500" />}
              </div>

              <div className={`w-full py-2 rounded-lg flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-widest border ${
                  data.ac_status === 'ON' 
                    ? isWastingEnergy ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-[#6D2158]/5 text-[#6D2158] border-[#6D2158]/10'
                    : 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
              }`}>
                  <div className="flex items-center gap-1.5">
                      <Wind size={12} className={data.ac_status === 'ON' ? 'animate-pulse' : ''} />
                      {data.ac_status === 'ON' ? 'AC IS ON' : 'AC IS OFF'}
                  </div>
                  
                  {durationStr && (
                      <div className={`mt-1 text-[8px] flex items-center gap-1 opacity-90 ${data.ac_status === 'ON' ? '' : 'text-emerald-100'}`}>
                          <Timer size={10}/> {durationStr}
                      </div>
                  )}
              </div>
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-8 font-sans pb-24 text-slate-800">
        
        <style dangerouslySetInnerHTML={{__html: `
            aside { display: none !important; }
            .md\\:ml-64 { margin-left: 0 !important; }
            .fixed.bottom-0 { display: none !important; }
            body { background-color: #FDFBFD !important; }
        `}} />

        <div className="max-w-[1600px] mx-auto space-y-6">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 gap-6">
               <div className="flex items-center gap-5">
                   <div className="w-16 h-16 rounded-2xl bg-[#6D2158] text-white flex items-center justify-center shrink-0 shadow-lg">
                      <MonitorPlay size={32} />
                   </div>
                   <div>
                     <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#6D2158]">Live AC Status Dashboard</h1>
                     <div className="flex items-center gap-2 mt-1 text-slate-400 text-xs font-bold uppercase tracking-widest">
                         <span className="flex items-center gap-1.5">
                             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> 
                             Live Sync
                         </span>
                         <span>•</span>
                         <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
                     </div>
                   </div>
               </div>

               {/* TAB NAVIGATION */}
               <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                   <button 
                       onClick={() => setActiveTab('matrix')}
                       className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'matrix' ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                       <LayoutGrid size={18}/> Live Matrix
                   </button>
                   <button 
                       onClick={() => setActiveTab('insights')}
                       className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'insights' ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                       <BarChart3 size={18}/> Insights
                   </button>
               </div>
               
               <div className="hidden lg:flex bg-slate-50 px-6 py-3 rounded-2xl border border-slate-200 shadow-sm items-center gap-3">
                   <Clock size={20} className="text-[#6D2158]" />
                   <span className="text-2xl font-black text-slate-800 tabular-nums tracking-tight">
                       {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                   </span>
               </div>
            </div>

            {isProcessing ? (
                <div className="py-20 flex justify-center"><Loader2 size={48} className="text-[#6D2158] animate-spin" /></div>
            ) : activeTab === 'matrix' ? (
                <>
                    {/* LIVE MATRIX VIEW */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-bottom-4">
                        <div className={`p-8 rounded-[2rem] shadow-sm border flex items-center justify-between transition-colors ${vacantWithAcOn > 0 ? 'bg-rose-500 border-rose-600 text-white shadow-rose-500/20' : 'bg-white border-slate-200 text-slate-800'}`}>
                            <div>
                                <p className={`text-xs font-black uppercase tracking-widest ${vacantWithAcOn > 0 ? 'text-rose-100' : 'text-slate-400'}`}>Vacant Villas with AC ON</p>
                                <p className="text-5xl font-black mt-2 flex items-center gap-4">
                                    {vacantWithAcOn} 
                                    {vacantWithAcOn > 0 && <span className="text-sm font-bold bg-white text-rose-600 px-3 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">Action Required</span>}
                                    {vacantWithAcOn === 0 && <span className="text-sm font-bold bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg uppercase tracking-wider shadow-sm border border-emerald-100"><CheckCircle size={16} className="inline mr-1 mb-0.5"/> All Clear</span>}
                                </p>
                            </div>
                            <AlertTriangle size={64} className={vacantWithAcOn > 0 ? 'text-white/20' : 'text-slate-100'} />
                        </div>

                        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200 flex items-center justify-between animate-in slide-in-from-bottom-4">
                            <div>
                                <p className="text-xs font-black uppercase text-emerald-600 tracking-widest">ACs Successfully Turned OFF</p>
                                <p className="text-5xl font-black text-slate-800 mt-2">{totalAcOff}</p>
                            </div>
                            <ZapOff size={64} className="text-emerald-100" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in slide-in-from-bottom-6">
                        {[
                            { title: 'Jetty A', villas: JETTY_A },
                            { title: 'Jetty B', villas: JETTY_B },
                            { title: 'Jetty C', villas: JETTY_C },
                            { title: 'Beach Villas', villas: BEACH }
                        ].map(jetty => (
                            <div key={jetty.title} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-6 md:p-8">
                                <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                                    <MapPin size={18} className="text-[#6D2158]" /> {jetty.title}
                                </h3>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
                                    {jetty.villas.map(v => renderVillaCard(v))}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                /* INSIGHTS & ANALYTICS VIEW */
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        {/* High Impact: Energy Saved */}
                        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-8 rounded-[2.5rem] shadow-xl text-white flex flex-col justify-between relative overflow-hidden col-span-1 md:col-span-2 lg:col-span-1">
                            <div className="absolute top-0 right-0 p-8 opacity-10">
                                <Leaf size={160} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-emerald-100 mb-2 flex items-center gap-2">
                                    <Zap size={18}/> Energy Hours Saved
                                </h3>
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

                        {/* Top 5 Leaderboard */}
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 col-span-1 lg:col-span-1">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-6 flex items-center gap-2">
                                <Trophy size={18} className="text-[#6D2158]"/> Top 5 Energy Savers
                            </h3>
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
                                                <div 
                                                    className="h-full bg-gradient-to-r from-[#6D2158] to-purple-400 rounded-full" 
                                                    style={{ width: `${(saver.rawMs / maxSaverMs) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {topSavers.length === 0 && <p className="text-sm text-slate-400 font-medium text-center py-10">Waiting for data...</p>}
                            </div>
                        </div>

                        {/* 7-Day Chart Card */}
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 col-span-1 md:col-span-3 lg:col-span-1">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-8 flex items-center gap-2">
                                <BarChart3 size={18} className="text-[#6D2158]"/> 7-Day Action Trend
                            </h3>
                            
                            <div className="h-56 flex items-end justify-between gap-2 lg:gap-4 mt-4 border-b border-slate-100 pb-2">
                                {chartData.map((data, index) => (
                                    <div key={index} className="flex flex-col items-center flex-1 group">
                                        <div className="w-full flex flex-col justify-end h-40 relative">
                                            <div 
                                                className="w-full bg-emerald-100 group-hover:bg-emerald-300 rounded-t-lg transition-all duration-500 relative flex justify-center"
                                                style={{ height: `${data.heightPercent}%`, minHeight: data.count > 0 ? '16px' : '4px' }}
                                            >
                                                {data.count > 0 && (
                                                    <span className="absolute -top-6 text-[10px] font-black text-emerald-700 bg-white shadow-sm border border-emerald-100 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {data.count}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-400 mt-3 uppercase tracking-widest text-center truncate">{data.day}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-center text-xs text-slate-400 font-medium mt-4">Number of times AC was turned OFF per day.</p>
                        </div>
                    </div>

                    {/* Audit Feed */}
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-6 flex items-center gap-2">
                            <History size={18} className="text-[#6D2158]"/> AC Activity Log
                        </h3>
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
                            {historyData.length === 0 && (
                                <div className="text-center py-10 text-slate-400 font-bold">No telemetry history logged yet.</div>
                            )}
                        </div>
                    </div>

                </div>
            )}
        </div>
    </div>
  );
}
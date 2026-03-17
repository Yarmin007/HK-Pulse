"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wind, Power, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, 
  Loader2, ZapOff, MapPin, User, RefreshCw 
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const TOTAL_VILLAS = 97;
const JETTY_A = Array.from({length: 35}, (_, i) => i + 1);
const JETTY_B = Array.from({length: 14}, (_, i) => i + 37);
const JETTY_C = Array.from({length: 21}, (_, i) => i + 59);
const BEACH = [36, ...Array.from({length: 8}, (_, i) => i + 51), ...Array.from({length: 18}, (_, i) => i + 80)];

// Strictly enforce Maldives time to match the Mobile app
const getLocalToday = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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

export default function ACTrackerPage() {
  const [selectedDate, setSelectedDate] = useState(getLocalToday());
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string, name: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  
  const [villasData, setVillasData] = useState<Record<string, VillaStatus>>({});
  const [myAllocatedVillas, setMyAllocatedVillas] = useState<number[]>([]);

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

      const [summaryRes, acRes] = await Promise.all([
          supabase.from('hsk_daily_summary').select('villa_number, status').eq('report_date', selectedDate),
          supabase.from('hsk_ac_tracker').select('*').eq('report_date', selectedDate)
      ]);

      const summaryData = summaryRes.data;
      const acData = acRes.data;

      const dataMap: Record<string, VillaStatus> = {};
      
      for (let i = 1; i <= TOTAL_VILLAS; i++) {
          const vNum = i.toString();
          const guestState = summaryData?.find(s => parseInt(s.villa_number) === i)?.status || 'VAC';
          const acState = acData?.find(a => parseInt(a.villa_number) === i);
          
          dataMap[vNum] = {
              villa_number: vNum,
              guest_status: guestState,
              ac_status: acState ? acState.status : 'ON', // Assume ON unless explicitly marked OFF
              updated_at: acState?.updated_at,
              updated_by_name: acState?.host_name,
          };
      }
      setVillasData(dataMap);

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

  // --- LIVE REAL-TIME SYNC ---
  // This magically updates the Admin board the second a VA changes it on their phone
  useEffect(() => {
      const channel = supabase
          .channel('ac-live-updates')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_ac_tracker' }, (payload: any) => {
              if (payload.new && payload.new.report_date === selectedDate) {
                  fetchData(true); // Silently refresh the data without showing a spinner
              }
          })
          .subscribe();

      return () => {
          supabase.removeChannel(channel);
      };
  }, [selectedDate, fetchData]);

  const toggleAC = async (villaNum: string, currentAcStatus: string) => {
      const newStatus = currentAcStatus === 'ON' ? 'OFF' : 'ON';
      
      setVillasData(prev => ({
          ...prev,
          [villaNum]: { ...prev[villaNum], ac_status: newStatus, updated_by_name: currentUser?.name }
      }));

      // No spaces allowed in onConflict! This is strictly checked by Postgres
      const { error } = await supabase.from('hsk_ac_tracker').upsert({
          report_date: selectedDate,
          villa_number: villaNum,
          status: newStatus,
          host_id: currentUser?.id,
          host_name: currentUser?.name,
          updated_at: new Date().toISOString()
      }, { onConflict: 'report_date,villa_number' });

      if (error) {
          toast.error("Failed to update AC status");
          fetchData(true); 
      } else {
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

  const renderVillaCard = (vNum: number) => {
      const data = villasData[vNum.toString()];
      if (!data) return null;

      const isVacant = data.guest_status === 'VAC' || data.guest_status === 'VM/VAC' || data.guest_status.includes('DEP');
      const isWastingEnergy = isVacant && data.ac_status === 'ON';
      const isSaved = isVacant && data.ac_status === 'OFF';

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

              {data.updated_by_name && data.ac_status === 'OFF' && (
                  <p className="text-[8px] text-slate-400 text-center mt-2 font-medium truncate">
                      Logged by {data.updated_by_name.split(' ')[0]}
                  </p>
              )}
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-32">
        <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Header */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-1 bg-emerald-500 rounded-full shrink-0"></div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Energy & AC Tracker</h1>
                        <p className="text-xs font-bold text-slate-500 mt-0.5">Ensure all vacant villas are powered off.</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <button onClick={() => fetchData()} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors" title="Force Sync">
                        <RefreshCw size={16} className={isProcessing ? 'animate-spin' : ''}/>
                    </button>
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                        <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronLeft size={16}/></button>
                        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none px-2 cursor-pointer"/>
                        <button onClick={() => changeDate(1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronRight size={16}/></button>
                    </div>
                </div>
            </div>

            {/* Smart Statistics Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl shadow-lg border border-slate-700 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Vacant Villas</p>
                        <p className="text-3xl font-black text-white mt-1">{totalVacant}</p>
                    </div>
                    <Wind size={32} className="text-white/20" />
                </div>
                
                <div className={`p-5 rounded-2xl shadow-lg border flex items-center justify-between transition-colors ${vacantWithAcOn > 0 ? 'bg-rose-500 border-rose-600' : 'bg-emerald-500 border-emerald-600'}`}>
                    <div>
                        <p className="text-[10px] font-black uppercase text-white/70 tracking-widest">Vacant & AC Left ON</p>
                        <p className="text-3xl font-black text-white mt-1 flex items-center gap-3">
                            {vacantWithAcOn} 
                            {vacantWithAcOn > 0 && <span className="text-xs font-bold bg-white text-rose-600 px-2 py-1 rounded-md uppercase tracking-wider">Action Required</span>}
                        </p>
                    </div>
                    <AlertTriangle size={32} className="text-white/20" />
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">ACs Successfully Logged OFF</p>
                        <p className="text-3xl font-black text-slate-800 mt-1">{totalAcOff}</p>
                    </div>
                    <ZapOff size={32} className="text-emerald-100" />
                </div>
            </div>

            {/* LOADING STATE */}
            {isProcessing && <div className="py-20 flex justify-center"><Loader2 size={32} className="text-slate-300 animate-spin" /></div>}

            {/* VA SPECIFIC VIEW */}
            {!isAdmin && !isProcessing && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
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

            {/* ADMIN MATRIX VIEW */}
            {isAdmin && !isProcessing && (
                <div className="space-y-6">
                    {[
                        { title: 'Jetty A', villas: JETTY_A },
                        { title: 'Jetty B', villas: JETTY_B },
                        { title: 'Jetty C', villas: JETTY_C },
                        { title: 'Beach Villas', villas: BEACH }
                    ].map(jetty => (
                        <div key={jetty.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <h3 className="text-sm font-black uppercase text-slate-700 tracking-widest mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                                <MapPin size={16} className="text-[#6D2158]" /> {jetty.title}
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                {jetty.villas.map(v => renderVillaCard(v))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

        </div>
    </div>
  );
}
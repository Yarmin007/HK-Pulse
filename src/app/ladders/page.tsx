"use client";
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Waves, Droplets, Home, CheckCircle2, AlertTriangle, 
  Sun, Moon, Filter, Info, Wrench, ChevronRight, Lock, Loader2
} from 'lucide-react';
import { format } from 'date-fns';

// --- CONFIGURATION ---
const JETTY_CONFIG = {
  A: { ladders: 4, pots: 20 },
  B: { ladders: 3, pots: 9 },
  C: { ladders: 2, pots: 12 },
};

// Mocking the PMS data that will eventually come from your database
// Rooms: 1-35, 37-50, 59-79
const MOCK_VILLA_TASKS = [
  { room: '12', type: 'Today Arrival', jetty: 'A' },
  { room: '15', type: 'Tomorrow Arrival', jetty: 'A' },
  { room: '32', type: '5th Day Stay', jetty: 'B' },
  { room: '42', type: 'Today Arrival', jetty: 'B' },
  { room: '65', type: '5th Day Stay', jetty: 'C' },
  { room: '71', type: 'Tomorrow Arrival', jetty: 'C' },
];

export default function LadderCleaningPage() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState<'VILLAS' | 'JETTIES' | 'POTS'>('VILLAS');
  const [filter, setFilter] = useState<'ALL' | 'ARRIVALS' | 'STAYOVERS'>('ALL');

  // Task States (In production, these save to Supabase)
  const [completedVillas, setCompletedVillas] = useState<Record<string, { shower: boolean, veranda: boolean }>>({});
  const [completedJettyLadders, setCompletedJettyLadders] = useState<Record<string, { am: boolean, pm: boolean }>>({});
  const [potCounts, setPotCounts] = useState<Record<string, number>>({ A: 0, B: 0, C: 0 });
  const [reportedLadles, setReportedLadles] = useState<string[]>([]);

  // --- AUTHENTICATION CHECK ---
  useEffect(() => {
    const sessionData = localStorage.getItem('hk_pulse_session');
    const adminAuth = localStorage.getItem('hk_pulse_admin_auth') === 'true';
    
    let hasAccess = adminAuth;
    
    if (sessionData) {
      try {
        const parsed = JSON.parse(sessionData);
        const isStepCleaner = String(parsed.role || '').toLowerCase().includes('step cleaner');
        const isAdminRole = parsed.system_role === 'admin';
        if (isAdminRole || isStepCleaner) {
          hasAccess = true;
        }
      } catch (e) {}
    }
    
    setIsAuthorized(hasAccess);
    setIsLoadingAuth(false);
  }, []);

  // --- HANDLERS ---
  const toggleVillaLadder = (room: string, type: 'shower' | 'veranda') => {
    setCompletedVillas(prev => ({
      ...prev,
      [room]: {
        ...prev[room],
        [type]: !prev[room]?.[type]
      }
    }));
  };

  const toggleJettyLadder = (jetty: string, shift: 'am' | 'pm') => {
    setCompletedJettyLadders(prev => ({
      ...prev,
      [jetty]: {
        ...prev[jetty],
        [shift]: !prev[jetty]?.[shift]
      }
    }));
  };

  const incrementPots = (jetty: string, max: number) => {
    setPotCounts(prev => ({
      ...prev,
      [jetty]: Math.min((prev[jetty] || 0) + 1, max)
    }));
  };

  const reportBrokenLadle = (jetty: string) => {
    const prompt = window.prompt(`Report broken/missing ladle at Jetty ${jetty}. Enter specific location or details:`);
    if (prompt) {
      setReportedLadles(prev => [...prev, `Jetty ${jetty}: ${prompt}`]);
    }
  };

  // --- FILTERING ---
  const filteredVillas = useMemo(() => {
    return MOCK_VILLA_TASKS.filter(v => {
      if (filter === 'ARRIVALS') return v.type.includes('Arrival');
      if (filter === 'STAYOVERS') return v.type.includes('5th Day');
      return true;
    });
  }, [filter]);

  if (isLoadingAuth) {
     return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;
  }

  if (!isAuthorized) {
     return (
       <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500">
         <Lock size={48} className="mb-4 opacity-20"/>
         <h2 className="text-xl font-black text-slate-700">Access Restricted</h2>
         <p className="text-sm font-bold mt-2 text-center px-4">Only Admins and assigned Step Cleaners <br/> can view this module.</p>
       </div>
     );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-24 md:pl-64">
      
      {/* HEADER */}
      <div className="bg-[#6D2158] text-white p-6 rounded-b-[2.5rem] shadow-lg sticky top-0 z-20">
        <h1 className="text-2xl font-black flex items-center gap-3 tracking-tight">
          <Waves size={28} className="text-cyan-300"/> Over-Water Operations
        </h1>
        <p className="text-xs text-white/70 font-bold uppercase tracking-widest mt-1">
          {format(new Date(), 'EEEE, dd MMM yyyy')}
        </p>

        {/* TABS */}
        <div className="flex gap-2 mt-6 overflow-x-auto custom-scrollbar pb-1">
          <button 
            onClick={() => setActiveTab('VILLAS')}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === 'VILLAS' ? 'bg-white text-[#6D2158] shadow-md' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            Villa Ladders
          </button>
          <button 
            onClick={() => setActiveTab('JETTIES')}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === 'JETTIES' ? 'bg-white text-[#6D2158] shadow-md' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            Jetty Ladders
          </button>
          <button 
            onClick={() => setActiveTab('POTS')}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === 'POTS' ? 'bg-white text-[#6D2158] shadow-md' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            Water Pots
          </button>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-6">

        {/* ==========================================
            TAB 1: VILLA LADDERS (Targeted Rooms)
        ========================================== */}
        {activeTab === 'VILLAS' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
            
            <div className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-2">
                <Filter size={14}/> Filter By
              </span>
              <select 
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2 outline-none focus:border-[#6D2158]"
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
              >
                <option value="ALL">All Scheduled Tasks</option>
                <option value="ARRIVALS">Arrivals Only</option>
                <option value="STAYOVERS">5th Day Stay Only</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVillas.map((task) => {
                const isShowerDone = completedVillas[task.room]?.shower;
                const isVerandaDone = completedVillas[task.room]?.veranda;
                const isAllDone = isShowerDone && isVerandaDone;

                return (
                  <div key={task.room} className={`bg-white rounded-3xl p-5 border-2 transition-all shadow-sm ${isAllDone ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-black text-[#6D2158] flex items-center gap-2">
                          <Home size={20}/> {task.room}
                        </h3>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 px-2 py-0.5 rounded-md inline-block ${task.type.includes('Arrival') ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {task.type}
                        </p>
                      </div>
                      <span className="text-xl font-black text-slate-200">J{task.jetty}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-6">
                      <button 
                        onClick={() => toggleVillaLadder(task.room, 'shower')}
                        className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 transition-all active:scale-95 ${isShowerDone ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-[#6D2158]/50'}`}
                      >
                        {isShowerDone ? <CheckCircle2 size={24}/> : <Droplets size={24}/>}
                        <span className="text-[10px] font-black uppercase tracking-widest">Shower Side</span>
                      </button>

                      <button 
                        onClick={() => toggleVillaLadder(task.room, 'veranda')}
                        className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 transition-all active:scale-95 ${isVerandaDone ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-[#6D2158]/50'}`}
                      >
                        {isVerandaDone ? <CheckCircle2 size={24}/> : <Waves size={24}/>}
                        <span className="text-[10px] font-black uppercase tracking-widest">Veranda Side</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==========================================
            TAB 2: JETTY LADDERS (2x Daily Routine)
        ========================================== */}
        {activeTab === 'JETTIES' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
            
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3">
              <Info className="text-blue-500 shrink-0 mt-0.5" size={20}/>
              <div>
                <h4 className="text-sm font-black text-blue-900">Twice Daily Cleaning</h4>
                <p className="text-xs font-bold text-blue-700/70 mt-1">All public ladders on Jetties A, B, and C must be scrubbed once in the morning and once in the afternoon to prevent algae build-up.</p>
              </div>
            </div>

            <div className="space-y-4">
              {Object.entries(JETTY_CONFIG).map(([jetty, config]) => {
                const isAmDone = completedJettyLadders[jetty]?.am;
                const isPmDone = completedJettyLadders[jetty]?.pm;

                return (
                  <div key={jetty} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">Jetty {jetty}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{config.ladders} Public Ladders</p>
                    </div>

                    <div className="flex gap-3 w-full md:w-auto">
                      <button 
                        onClick={() => toggleJettyLadder(jetty, 'am')}
                        className={`flex-1 md:w-32 py-3 md:py-4 rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all active:scale-95 ${isAmDone ? 'bg-cyan-500 border-cyan-600 text-white shadow-lg shadow-cyan-200' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                      >
                        <Sun size={20} className={isAmDone ? 'text-white' : 'text-amber-500'}/>
                        <span className="text-[10px] font-black uppercase tracking-widest mt-1">AM Shift</span>
                      </button>

                      <button 
                        onClick={() => toggleJettyLadder(jetty, 'pm')}
                        className={`flex-1 md:w-32 py-3 md:py-4 rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all active:scale-95 ${isPmDone ? 'bg-[#6D2158] border-[#4a163c] text-white shadow-lg shadow-purple-900/20' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                      >
                        <Moon size={20} className={isPmDone ? 'text-white' : 'text-[#6D2158]'}/>
                        <span className="text-[10px] font-black uppercase tracking-widest mt-1">PM Shift</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==========================================
            TAB 3: WATER POTS & LADLES
        ========================================== */}
        {activeTab === 'POTS' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(JETTY_CONFIG).map(([jetty, config]) => {
                const currentCount = potCounts[jetty];
                const isComplete = currentCount === config.pots;
                const progressPct = (currentCount / config.pots) * 100;

                return (
                  <div key={jetty} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex flex-col">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-2xl font-black text-slate-800">Jetty {jetty}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Water Pots</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-3xl font-black ${isComplete ? 'text-emerald-500' : 'text-[#6D2158]'}`}>{currentCount}</span>
                        <span className="text-sm font-bold text-slate-300">/{config.pots}</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-3 w-full bg-slate-100 rounded-full mb-6 overflow-hidden">
                      <div className={`h-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : 'bg-[#6D2158]'}`} style={{ width: `${progressPct}%` }}></div>
                    </div>

                    <button 
                      onClick={() => incrementPots(jetty, config.pots)}
                      disabled={isComplete}
                      className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 flex items-center justify-center gap-2 ${isComplete ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 opacity-70 cursor-not-allowed' : 'bg-[#6D2158] text-white shadow-lg shadow-purple-900/20 hover:bg-[#5a1b49]'}`}
                    >
                      {isComplete ? <><CheckCircle2 size={16}/> All Cleaned</> : <><Droplets size={16}/> Mark 1 Cleaned</>}
                    </button>

                    <div className="mt-6 pt-4 border-t border-slate-100">
                      <button 
                        onClick={() => reportBrokenLadle(jetty)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors border border-rose-100"
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Wrench size={14}/> Report Ladle Issue</span>
                        <ChevronRight size={14}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ladle Issues Log */}
            {reportedLadles.length > 0 && (
              <div className="bg-rose-600 text-white p-5 rounded-3xl shadow-lg shadow-rose-200">
                <h3 className="text-sm font-black flex items-center gap-2 mb-3"><AlertTriangle size={18}/> Ladles Needing Replacement</h3>
                <ul className="space-y-2">
                  {reportedLadles.map((report, idx) => (
                    <li key={idx} className="bg-black/10 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-300"></div> {report}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
"use client";
import React, { useState, useEffect } from 'react';
import { 
  Users, Plane, ArrowRight, ArrowDown, ArrowUp, 
  CheckCircle2, AlertTriangle, Calendar, Plus, X, 
  Loader2, Save, UserPlus, Clock, Lock, Unlock, MapPin
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

// --- TYPES ---
type Host = {
  id: string;
  host_id: string;
  full_name: string;
  role: string;
  image_url?: string;
};

type LeaveRecord = {
  host_id: string;
  return_date: string;
};

type JettyQueue = {
  name: string;
  currently_away: LeaveRecord | null;
  queue: string[]; // Array of host_ids waiting in line
};

type QueueConfig = Record<string, JettyQueue>;

// Default Jetties
const DEFAULT_JETTIES: QueueConfig = {
  'Jetty A': { name: 'Jetty A', currently_away: null, queue: [] },
  'Jetty B': { name: 'Jetty B', currently_away: null, queue: [] },
  'Jetty C': { name: 'Jetty C', currently_away: null, queue: [] },
  'Beach': { name: 'Beach Villas', currently_away: null, queue: [] },
};

export default function LeavePlannerPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [hosts, setHosts] = useState<Host[]>([]);
  const [queues, setQueues] = useState<QueueConfig>(DEFAULT_JETTIES);
  const [configId, setConfigId] = useState<string | null>(null);

  // Modals
  const [isAssignOpen, setIsAssignOpen] = useState<string | null>(null); // holds jetty name
  const [isSendLeaveOpen, setIsSendLeaveOpen] = useState<{ jetty: string, host_id: string } | null>(null);
  const [returnDateInput, setReturnDateInput] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    
    // 1. Fetch Active Hosts
    const { data: hostData } = await supabase
      .from('hsk_hosts')
      .select('id, host_id, full_name, role, image_url')
      .eq('status', 'Active')
      .order('full_name');
      
    if (hostData) setHosts(hostData);

    // 2. Fetch Queue Configuration
    const { data: configData } = await supabase
      .from('hsk_constants')
      .select('*')
      .eq('type', 'leave_pipeline')
      .maybeSingle();

    if (configData) {
      setConfigId(configData.id);
      try {
        const parsed = JSON.parse(configData.label);
        // Merge with defaults in case new jetties were added
        setQueues({ ...DEFAULT_JETTIES, ...parsed });
      } catch(e) {
        setQueues(DEFAULT_JETTIES);
      }
    } else {
      setQueues(DEFAULT_JETTIES);
    }

    setIsLoading(false);
  };

  const saveQueuesToDB = async (updatedQueues: QueueConfig) => {
    setIsSaving(true);
    const payload = JSON.stringify(updatedQueues);
    
    if (configId) {
      await supabase.from('hsk_constants').update({ label: payload }).eq('id', configId);
    } else {
      const { data } = await supabase.from('hsk_constants').insert({ type: 'leave_pipeline', label: payload }).select().single();
      if (data) setConfigId(data.id);
    }
    
    setQueues(updatedQueues);
    setIsSaving(false);
  };

  // --- QUEUE MANAGEMENT LOGIC ---

  const handleAddHostToQueue = async (jettyName: string, hostId: string) => {
    const newQueues = { ...queues };
    
    // Safety check: remove from any other queue first to prevent duplicates
    Object.keys(newQueues).forEach(j => {
      newQueues[j].queue = newQueues[j].queue.filter(id => id !== hostId);
    });

    newQueues[jettyName].queue.push(hostId);
    await saveQueuesToDB(newQueues);
    setIsAssignOpen(null);
    toast.success("Added to waiting list");
  };

  const handleRemoveFromQueue = async (jettyName: string, hostId: string) => {
    const newQueues = { ...queues };
    newQueues[jettyName].queue = newQueues[jettyName].queue.filter(id => id !== hostId);
    await saveQueuesToDB(newQueues);
  };

  const handleMoveQueue = async (jettyName: string, index: number, direction: 'UP' | 'DOWN') => {
    const newQueues = { ...queues };
    const q = [...newQueues[jettyName].queue];
    
    if (direction === 'UP' && index > 0) {
      [q[index - 1], q[index]] = [q[index], q[index - 1]];
    } else if (direction === 'DOWN' && index < q.length - 1) {
      [q[index + 1], q[index]] = [q[index], q[index + 1]];
    }

    newQueues[jettyName].queue = q;
    await saveQueuesToDB(newQueues);
  };

  const handleSendOnLeave = async () => {
    if (!isSendLeaveOpen || !returnDateInput) return toast.error("Please set a return date.");
    
    const { jetty, host_id } = isSendLeaveOpen;
    const newQueues = { ...queues };

    // 1. Remove from the waiting queue
    newQueues[jetty].queue = newQueues[jetty].queue.filter(id => id !== host_id);
    
    // 2. Set as Currently Away
    newQueues[jetty].currently_away = {
      host_id,
      return_date: returnDateInput
    };

    await saveQueuesToDB(newQueues);
    setIsSendLeaveOpen(null);
    setReturnDateInput('');
    toast.success("Staff member sent on leave. Pipeline locked.");
  };

  const handleMarkReturned = async (jettyName: string) => {
    if (!confirm(`Are you sure they have returned? This will open the slot for the next person.`)) return;

    const newQueues = { ...queues };
    const returningHostId = newQueues[jettyName].currently_away?.host_id;

    // 1. Clear the away slot
    newQueues[jettyName].currently_away = null;

    // 2. Put the returning person at the VERY BOTTOM of the queue to restart the cycle
    if (returningHostId) {
       newQueues[jettyName].queue.push(returningHostId);
    }

    await saveQueuesToDB(newQueues);
    toast.success("Pipeline open! Next person can now go.");
  };

  // --- HELPERS ---
  const getHostDetails = (hostId: string) => hosts.find(h => h.host_id === hostId);

  // Get all hosts that are NOT in ANY queue and NOT currently away
  const unassignedHosts = hosts.filter(h => {
    let isAssigned = false;
    Object.values(queues).forEach(q => {
      if (q.queue.includes(h.host_id)) isAssigned = true;
      if (q.currently_away?.host_id === h.host_id) isAssigned = true;
    });
    return !isAssigned;
  });

  if (isLoading) return <div className="min-h-screen bg-[#FDFBFD] flex items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-6 pb-24 font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-6 mb-6 gap-4">
        <div>
           <h1 className="text-3xl font-black tracking-tight">Leave & Rotation Pipeline</h1>
           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
               <AlertTriangle size={12} className="text-amber-500"/> Strict 1-In, 1-Out System
           </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
           {isSaving && <span className="text-blue-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Saving State...</span>}
        </div>
      </div>

      {/* PIPELINE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-6">
        {Object.values(queues).map(jetty => {
            const isLocked = jetty.currently_away !== null;
            const awayHost = isLocked ? getHostDetails(jetty.currently_away!.host_id) : null;
            const nextInLineId = jetty.queue.length > 0 ? jetty.queue[0] : null;
            const nextHost = nextInLineId ? getHostDetails(nextInLineId) : null;

            return (
                <div key={jetty.name} className={`bg-white rounded-[2rem] border-2 shadow-sm flex flex-col overflow-hidden transition-all ${isLocked ? 'border-amber-300' : 'border-emerald-300'}`}>
                    
                    {/* Jetty Header */}
                    <div className={`p-4 flex justify-between items-center border-b ${isLocked ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                        <div className="flex items-center gap-2">
                            <MapPin size={18} className={isLocked ? 'text-amber-600' : 'text-emerald-600'}/>
                            <h2 className={`font-black text-lg ${isLocked ? 'text-amber-900' : 'text-emerald-900'}`}>{jetty.name}</h2>
                        </div>
                        <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1 border shadow-sm bg-white ${isLocked ? 'text-amber-600 border-amber-200' : 'text-emerald-600 border-emerald-200'}`}>
                            {isLocked ? <><Lock size={12}/> Locked</> : <><Unlock size={12}/> Open</>}
                        </div>
                    </div>

                    {/* CURRENTLY AWAY SLOT (The Lock) */}
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1">
                            <Plane size={14}/> Currently On Leave
                        </h4>
                        
                        {isLocked && awayHost && jetty.currently_away ? (
                            <div className="bg-white p-4 rounded-2xl border-2 border-amber-200 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-400"></div>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center font-black text-lg shrink-0 border border-amber-200">
                                        {awayHost.image_url ? <img src={awayHost.image_url} className="w-full h-full rounded-full object-cover"/> : awayHost.full_name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-800">{awayHost.full_name}</p>
                                        <p className="text-[10px] font-bold text-amber-600 uppercase mt-0.5">Returns: {format(parseISO(jetty.currently_away.return_date), 'dd MMM yyyy')}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleMarkReturned(jetty.name)}
                                    className="w-full py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border border-amber-300"
                                >
                                    <CheckCircle2 size={14}/> Mark Returned
                                </button>
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-emerald-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-emerald-50/50">
                                <CheckCircle2 size={24} className="text-emerald-400 mb-2"/>
                                <p className="text-xs font-black text-emerald-700 uppercase tracking-widest">Clear</p>
                                <p className="text-[10px] font-bold text-emerald-600/70 mt-1">Next person can go.</p>
                            </div>
                        )}
                    </div>

                    {/* UP NEXT SLOT */}
                    <div className="p-5 flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                                <Users size={14}/> Waiting List
                            </h4>
                            <button 
                                onClick={() => setIsAssignOpen(jetty.name)}
                                className="w-6 h-6 rounded-full bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center hover:bg-[#6D2158] hover:text-white transition-colors"
                            >
                                <Plus size={14}/>
                            </button>
                        </div>

                        {jetty.queue.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 py-8">
                                <Users size={32} className="mb-2 opacity-50"/>
                                <p className="text-xs font-bold uppercase tracking-widest">Queue Empty</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {jetty.queue.map((queuedId, index) => {
                                    const qHost = getHostDetails(queuedId);
                                    if (!qHost) return null;
                                    
                                    const isFirst = index === 0;

                                    return (
                                        <div key={queuedId} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isFirst ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                            <div className="flex items-center gap-3 min-w-0 pr-2">
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${isFirst ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                    {index + 1}
                                                </div>
                                                <div className="truncate">
                                                    <p className={`text-sm font-bold truncate leading-tight ${isFirst ? 'text-blue-900' : 'text-slate-700'}`}>{qHost.full_name}</p>
                                                    <p className={`text-[9px] font-bold uppercase tracking-widest truncate leading-tight mt-0.5 ${isFirst ? 'text-blue-600/70' : 'text-slate-400'}`}>{qHost.host_id}</p>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-1 shrink-0">
                                                {isFirst ? (
                                                    <button 
                                                        onClick={() => setIsSendLeaveOpen({ jetty: jetty.name, host_id: queuedId })}
                                                        disabled={isLocked}
                                                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center gap-1"
                                                    >
                                                        {isLocked ? <Lock size={12}/> : <Plane size={12}/>} 
                                                        Send
                                                    </button>
                                                ) : (
                                                    <div className="flex flex-col gap-1">
                                                        <button onClick={() => handleMoveQueue(jetty.name, index, 'UP')} className="p-1 text-slate-300 hover:text-[#6D2158] hover:bg-[#6D2158]/10 rounded"><ArrowUp size={12}/></button>
                                                        <button onClick={() => handleMoveQueue(jetty.name, index, 'DOWN')} className="p-1 text-slate-300 hover:text-[#6D2158] hover:bg-[#6D2158]/10 rounded"><ArrowDown size={12}/></button>
                                                    </div>
                                                )}
                                                <button onClick={() => handleRemoveFromQueue(jetty.name, queuedId)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg ml-1">
                                                    <X size={14}/>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </div>
            );
        })}
      </div>

      {/* --- ADD TO QUEUE MODAL --- */}
      {isAssignOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95">
                <div className="p-5 bg-[#6D2158] text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-black text-lg tracking-tight">Add to Queue</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-purple-200 mt-0.5">{isAssignOpen}</p>
                    </div>
                    <button onClick={() => setIsAssignOpen(null)} className="bg-black/20 p-2 rounded-full hover:bg-black/30 transition-colors"><X size={16}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1">
                        <UserPlus size={12}/> Available Staff
                    </p>
                    {unassignedHosts.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 font-bold text-sm italic">All active staff are already in a pipeline.</div>
                    ) : (
                        <div className="space-y-2">
                            {unassignedHosts.map(h => (
                                <button 
                                    key={h.id}
                                    onClick={() => handleAddHostToQueue(isAssignOpen, h.host_id)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-[#6D2158] hover:bg-[#6D2158]/5 transition-all text-left group"
                                >
                                    <div>
                                        <p className="text-sm font-bold text-slate-700 group-hover:text-[#6D2158]">{h.full_name}</p>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">{h.role}</p>
                                    </div>
                                    <ArrowRight size={16} className="text-slate-300 group-hover:text-[#6D2158]"/>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* --- SEND ON LEAVE MODAL --- */}
      {isSendLeaveOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col relative animate-in zoom-in-95">
                <button onClick={() => setIsSendLeaveOpen(null)} className="absolute top-4 right-4 text-slate-400 hover:text-rose-500"><X size={18}/></button>
                
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <Plane size={24}/>
                </div>
                
                <h3 className="font-black text-xl text-center text-slate-800 mb-1">Send on Leave</h3>
                <p className="text-xs font-bold text-center text-slate-500 mb-6">
                    {getHostDetails(isSendLeaveOpen.host_id)?.full_name} will lock {isSendLeaveOpen.jetty}.
                </p>

                <div className="mb-6">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                        <Calendar size={14}/> Expected Return Date
                    </label>
                    <input 
                        type="date"
                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 transition-colors"
                        value={returnDateInput}
                        onChange={e => setReturnDateInput(e.target.value)}
                    />
                </div>

                <button 
                    onClick={handleSendOnLeave}
                    disabled={!returnDateInput}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Confirm & Lock Pipeline
                </button>
            </div>
        </div>
      )}

    </div>
  );
}
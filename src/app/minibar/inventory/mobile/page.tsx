"use client";
import React, { useState, useEffect } from 'react';
import { 
  Lock, ArrowRight, User, MapPin, Search, 
  Plus, Minus, Save, CheckCircle2, Loader2, ChevronLeft, Wine, AlertCircle, Trash2, AlertTriangle, Clock, ListChecks
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// DYNAMIC DAY TIMEZONE FIX
const getLocalToday = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    const str = new Intl.DateTimeFormat('en-CA', { 
        timeZone: tz, 
        year: 'numeric', month: '2-digit', day: '2-digit' 
    }).format(new Date());
    return str; 
};

// --- CUSTOM SORTING LOGIC ---
const getCategoryWeight = (cat: string) => {
  const c = (cat || '').toLowerCase();
  if (c.includes('bite') || c.includes('sweet') || c.includes('food') || c.includes('snack')) return 1;
  if (c.includes('soft') || c.includes('juice') || c.includes('water') || c.includes('beverage')) return 2;
  if (c.includes('beer')) return 3;
  if (c.includes('wine')) return 4;
  if (c.includes('spirit') || c.includes('liquor') || c.includes('hard') || c.includes('alcohol')) return 5;
  return 6;
};

// --- TYPES ---
type Host = {
  id: string;
  full_name: string;
  host_id: string;
};

type MasterItem = {
  article_number: string;
  article_name: string;
  generic_name?: string;
  category: string;
  image_url?: string;
};

const parseVillas = (input: string, doubleVillas: string[]) => {
    const result = new Set<string>();
    const parts = input.split(',').map(s => s.trim());
    
    for (const p of parts) {
        if (p.includes('-') && !p.includes('-1') && !p.includes('-2')) {
            const [start, end] = p.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    const v = String(i);
                    if (doubleVillas.includes(v)) {
                        result.add(`${v}-1`);
                        result.add(`${v}-2`);
                    } else {
                        result.add(v);
                    }
                }
            }
        } else if (p) {
            const baseV = p.replace('-1', '').replace('-2', '');
            if (!p.includes('-') && doubleVillas.includes(p)) {
                result.add(`${p}-1`);
                result.add(`${p}-2`);
            } else {
                result.add(p);
            }
        }
    }
    
    return Array.from(result).sort((a,b) => {
        const numA = parseFloat(a.replace('-', '.'));
        const numB = parseFloat(b.replace('-', '.'));
        return numA - numB;
    });
};

export default function MyTasksResponsive() {
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<2 | 3>(2);
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentHost, setCurrentHost] = useState<Host | null>(null);
  const [dailyTask, setDailyTask] = useState<{shift_type?: string, shift_note?: string} | null>(null);

  const [invStatus, setInvStatus] = useState<'OPEN' | 'CLOSED'>('CLOSED');
  const [activePeriod, setActivePeriod] = useState<string>('');

  const [assignedVillas, setAssignedVillas] = useState<string[]>([]);
  const [completedVillas, setCompletedVillas] = useState<string[]>([]);
  const [selectedVilla, setSelectedVilla] = useState('');
  
  const [previousSubmissions, setPreviousSubmissions] = useState<Record<string, Record<string, number>>>({});

  const [catalog, setCatalog] = useState<MasterItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState('All');

  const [showSuccess, setShowSuccess] = useState(false);
  const [toastMsg, setToastMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      confirmText: string;
      isDestructive: boolean;
      onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', confirmText: '', isDestructive: false, onConfirm: () => {} });

  useEffect(() => {
    const syncTimezone = async () => {
        const { data } = await supabase.from('hsk_constants').select('label').eq('type', 'system_timezone').maybeSingle();
        if (data && data.label) localStorage.setItem('hk_pulse_timezone', data.label);
    };
    syncTimezone();

    const sessionData = localStorage.getItem('hk_pulse_session');
    if (sessionData) {
        const parsed = JSON.parse(sessionData);
        setCurrentHost({ id: parsed.id, full_name: parsed.full_name, host_id: parsed.host_id });
        loadInitialData(parsed.host_id);
    } else {
        window.location.href = '/';
    }

    setIsMounted(true);
    fetchCatalog();
  }, []);

  const loadInitialData = async (hostId: string) => {
      setIsLoading(true);

      const todayStr = getLocalToday();
      const { data: att } = await supabase.from('hsk_attendance')
        .select('shift_type, shift_note')
        .eq('host_id', hostId)
        .eq('date', todayStr)
        .maybeSingle();

      if (att) setDailyTask(att);

      const { data: constData } = await supabase.from('hsk_constants').select('*').in('type', ['mb_inv_status', 'mb_active_period', 'double_mb_villas']);
      const status = constData?.find(c => c.type === 'mb_inv_status')?.label || 'CLOSED';
      const period = constData?.find(c => c.type === 'mb_active_period')?.label;
      const dvStr = constData?.find(c => c.type === 'double_mb_villas')?.label || '';
      const dvList = dvStr.split(',').map((s: string) => s.trim()).filter(Boolean);

      setInvStatus(status as 'OPEN' | 'CLOSED');
      if (period) setActivePeriod(period);

      if (period) {
          const allocDate = `${period}-01`;
          const { data: allocations } = await supabase
              .from('hsk_minibar_allocations')
              .select('villas')
              .eq('date', allocDate)
              .eq('host_id', hostId)
              .maybeSingle();

          if (allocations && allocations.villas) {
              const parsed = parseVillas(allocations.villas, dvList);
              setAssignedVillas(parsed);
          }

          const [y, m] = period.split('-').map(Number);
          const startOfMonthUTC = new Date(y, m - 1, 1).toISOString();
          const startOfNextMonthUTC = new Date(y, m, 1).toISOString();
          
          const { data: submissions } = await supabase
              .from('hsk_villa_minibar_inventory')
              .select('villa_number, inventory_data, logged_at')
              .gte('logged_at', startOfMonthUTC)
              .lt('logged_at', startOfNextMonthUTC)
              .eq('host_id', hostId)
              .order('logged_at', { ascending: false }); 

          if (submissions) {
              const done = Array.from(new Set(submissions.map(s => s.villa_number)));
              setCompletedVillas(done);

              const prevData: Record<string, Record<string, number>> = {};
              submissions.forEach(sub => {
                  if (!prevData[sub.villa_number]) {
                      const itemMap: Record<string, number> = {};
                      if (sub.inventory_data && Array.isArray(sub.inventory_data)) {
                          sub.inventory_data.forEach((item: any) => {
                              itemMap[item.article_number] = item.qty;
                          });
                      }
                      prevData[sub.villa_number] = itemMap;
                  }
              });
              setPreviousSubmissions(prevData);
          }
      }

      setIsLoading(false);
  };

  const fetchCatalog = async () => {
    const { data: catRes } = await supabase.from('hsk_master_catalog').select('*').eq('is_minibar_item', true);
    const { data: constRes } = await supabase.from('hsk_constants').select('*').eq('type', 'hidden_mb_item');
    
    if (catRes) {
        const hiddenList = constRes ? constRes.map(h => h.label) : [];
        const filteredAndSorted = catRes
            .filter(i => !hiddenList.includes(i.article_number))
            .sort((a, b) => getCategoryWeight(a.category) - getCategoryWeight(b.category) || a.article_name.localeCompare(b.article_name));
        
        setCatalog(filteredAndSorted);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
      setToastMsg({ type, text });
      setTimeout(() => setToastMsg(null), 4000);
  };

  const startAudit = (villa: string) => {
    setSelectedVilla(villa);
    
    const initialCounts: Record<string, number> = {};
    const previousData = previousSubmissions[villa] || {};
    
    catalog.forEach(item => { 
        initialCounts[item.article_number] = previousData[item.article_number] || 0; 
    });
    
    setCounts(initialCounts);
    setStep(3);
  };

  const requestAllOk = () => {
      setConfirmModal({
          isOpen: true,
          title: "Fill & Submit?",
          message: `This will auto-fill standard PAR and submit immediately.`,
          confirmText: "Fill & Submit",
          isDestructive: false,
          onConfirm: () => {
              const newCounts: Record<string, number> = {};
              catalog.forEach(item => {
                  const cat = (item.category || '').toLowerCase();
                  const name = (item.generic_name || item.article_name || '').toLowerCase();
                  let par = 1; 
                  
                  if (cat.includes('soft') || cat.includes('juice') || cat.includes('water') || cat.includes('beverage') || cat.includes('beer')) par = 2;
                  else if (cat.includes('wine') || cat.includes('spirit') || cat.includes('liquor') || cat.includes('hard') || cat.includes('alcohol') || cat.includes('bite') || cat.includes('sweet') || cat.includes('food') || cat.includes('snack')) par = 1;
                  
                  if (name.includes('light tonic') || name.includes('indian tonic') || name.includes('ginger beer') || name.includes('ginger ale')) par = 1;
                  if (name.includes('zero') || name.includes('fanta')) par = 0;
                  
                  newCounts[item.article_number] = par;
              });
              setCounts(newCounts);
              setConfirmModal(prev => ({ ...prev, isOpen: false }));
              executeSaveInventory(newCounts);
          }
      });
  };

  const requestEmptyMinibar = () => {
      setConfirmModal({
          isOpen: true,
          title: "Empty & Submit?",
          message: "This will set all items to 0 and submit immediately.",
          confirmText: "Empty & Submit",
          isDestructive: true,
          onConfirm: () => {
              const newCounts: Record<string, number> = {};
              catalog.forEach(item => { newCounts[item.article_number] = 0; });
              setCounts(newCounts);
              setConfirmModal(prev => ({ ...prev, isOpen: false }));
              executeSaveInventory(newCounts);
          }
      });
  };

  const updateCount = (article_number: string, delta: number) => {
    setCounts(prev => {
      const current = prev[article_number] || 0;
      const next = current + delta;
      return { ...prev, [article_number]: next < 0 ? 0 : next };
    });
  };

  const requestSaveInventory = () => {
      setConfirmModal({
          isOpen: true,
          title: `Submit Villa ${selectedVilla}?`,
          message: "Are you sure you want to save this inventory record?",
          confirmText: "Submit Record",
          isDestructive: false,
          onConfirm: () => {
              setConfirmModal(prev => ({ ...prev, isOpen: false }));
              executeSaveInventory(); 
          }
      });
  };

  const executeSaveInventory = async (overrideCounts?: Record<string, number>) => {
    setIsLoading(true);

    const finalCounts = overrideCounts || counts;
    const countedItems = Object.entries(finalCounts)
        .filter(([_, qty]) => qty > 0)
        .map(([artNo, qty]) => {
            const item = catalog.find(c => c.article_number === artNo);
            return { article_number: artNo, name: item?.generic_name || item?.article_name, qty };
        });

    const payload = {
        villa_number: selectedVilla,
        host_id: currentHost?.host_id,
        host_name: currentHost?.full_name,
        inventory_data: countedItems,
        logged_at: new Date().toISOString() 
    };

    const { error } = await supabase.from('hsk_villa_minibar_inventory').insert(payload);

    setIsLoading(false);

    if (error) {
        showNotification('error', `DB Error: Please contact Admin. Make sure table & RLS exist!`);
    } else {
        setCompletedVillas(prev => Array.from(new Set([...prev, selectedVilla])));
        setPreviousSubmissions(prev => ({ ...prev, [selectedVilla]: finalCounts }));
        setShowSuccess(true);
    }
  };

  const resetFlow = () => {
    setShowSuccess(false);
    setSelectedVilla('');
    setStep(2);
  };

  const categories = ['All', ...Array.from(new Set(catalog.map(i => i.category)))];

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-8 font-antiqua text-slate-800 pb-24">
      
      <div className="max-w-5xl mx-auto w-full flex flex-col animate-in fade-in">
        
        {/* --- STEP 2: DASHBOARD / VILLA SELECTION --- */}
        {step === 2 && currentHost && (
            <>
                <div className="flex items-center gap-5 mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                   <div className="w-16 h-16 rounded-2xl bg-[#6D2158] text-white flex items-center justify-center text-2xl font-black shadow-lg shrink-0">
                      {currentHost.full_name.charAt(0)}
                   </div>
                   <div>
                     <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#6D2158]">My Tasks</h1>
                     <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">
                        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                     </p>
                   </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
                ) : (
                    <div className="space-y-6">
                        
                        {/* TODAY'S ALLOCATION CARD */}
                        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-2">
                            <h3 className="text-xl font-bold text-slate-800 mb-1">Today's Allocation</h3>
                            <p className="text-xs text-slate-400 mb-6 font-medium">Your assigned duty for today.</p>
                            
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><Clock size={20} className="text-[#6D2158]" /></div>
                                    <div>
                                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duty Time</span>
                                        <span className="font-bold text-lg text-slate-700">{dailyTask?.shift_type || 'No duty assigned'}</span>
                                    </div>
                                </div>
                                {dailyTask?.shift_note && (
                                    <div className="flex items-start gap-4 bg-blue-50 p-4 rounded-2xl border border-blue-100">
                                        <div className="p-3 bg-white rounded-xl shadow-sm"><ListChecks size={20} className="text-blue-600" /></div>
                                        <div>
                                            <span className="block text-[10px] font-bold text-blue-400 uppercase tracking-widest">Task / Area</span>
                                            <span className="font-bold text-lg text-blue-900 leading-snug">{dailyTask.shift_note}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* MINIBAR INVENTORY CARD (ONLY VISIBLE IF ASSIGNED) */}
                        {assignedVillas.length > 0 && (
                            <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 mb-1">Minibar Inventory</h3>
                                        <p className="text-xs text-slate-400 font-medium">
                                            {invStatus === 'OPEN' ? 'Tap a villa to begin auditing.' : `Locked • Upcoming: ${activePeriod}`}
                                        </p>
                                    </div>
                                    {invStatus === 'CLOSED' && (
                                        <div className="bg-rose-50 text-rose-600 p-3 rounded-2xl border border-rose-100">
                                            <Lock size={20}/>
                                        </div>
                                    )}
                                </div>

                                {invStatus === 'CLOSED' ? (
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-center">
                                        <AlertCircle size={32} className="mx-auto text-slate-300 mb-3"/>
                                        <p className="text-base font-bold text-slate-600 mb-2">Inventory is currently Locked.</p>
                                        <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">
                                            Assigned Villas: {assignedVillas.join(', ')}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
                                        {assignedVillas.map(villa => {
                                            const isDone = completedVillas.includes(villa);
                                            return (
                                                <button 
                                                    key={villa}
                                                    onClick={() => startAudit(villa)}
                                                    className={`aspect-square rounded-3xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${isDone ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#6D2158] hover:shadow-md'}`}
                                                >
                                                    {isDone && <CheckCircle2 size={16} className="absolute top-3 right-3 text-emerald-500"/>}
                                                    <span className={`font-black ${villa.includes('-') ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl'}`}>{villa}</span>
                                                    <span className="text-[10px] md:text-xs font-bold uppercase mt-1 opacity-60">{isDone ? 'Done' : 'Pending'}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}
            </>
        )}

        {/* --- STEP 3: INVENTORY ENTRY GRID --- */}
        {step === 3 && currentHost && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-8 duration-300">
                
                {/* Header */}
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setStep(2)} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-500"><ChevronLeft size={20}/></button>
                        <div>
                            <h2 className="text-2xl font-black text-[#6D2158]">Villa {selectedVilla}</h2>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Audit Mode</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={requestEmptyMinibar} className="flex-1 md:flex-none px-6 py-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all flex items-center justify-center gap-2">
                            <Trash2 size={16}/> Empty
                        </button>
                        <button onClick={requestAllOk} className="flex-1 md:flex-none px-6 py-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center justify-center gap-2">
                            <CheckCircle2 size={16}/> All OK
                        </button>
                    </div>
                </div>

                {/* Category Filters */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-4 mb-2">
                    {categories.map(cat => (
                        <button 
                            key={cat} 
                            onClick={() => setActiveCategory(cat)}
                            className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border shadow-sm ${activeCategory === cat ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Items Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-32">
                    {catalog.filter(i => activeCategory === 'All' || i.category === activeCategory).map(item => (
                        <div key={item.article_number} className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between gap-4">
                            
                            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <Wine size={24} className="text-slate-300"/>}
                            </div>
                            
                            <div className="flex-1 pr-2 min-w-0">
                                <h4 className="text-sm font-bold text-slate-800 leading-tight truncate" title={item.generic_name || item.article_name}>{item.generic_name || item.article_name}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{item.category}</p>
                            </div>

                            {/* Counter Controls */}
                            <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 p-1 shrink-0">
                                <button onClick={() => updateCount(item.article_number, -1)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all">
                                    <Minus size={18}/>
                                </button>
                                <span className="w-10 text-center font-black text-[#6D2158] text-xl">
                                    {counts[item.article_number] || 0}
                                </span>
                                <button onClick={() => updateCount(item.article_number, 1)} className="w-10 h-10 flex items-center justify-center bg-[#6D2158] rounded-lg shadow-sm text-white active:scale-95 transition-all">
                                    <Plus size={18}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Fixed Bottom Submit Bar */}
                <div className="fixed bottom-0 left-0 right-0 md:left-64 p-4 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                    <div className="max-w-5xl mx-auto">
                        <button onClick={requestSaveInventory} disabled={isLoading} className="w-full py-4 md:py-5 bg-[#6D2158] text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-purple-900/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                            {isLoading ? <Loader2 className="animate-spin" size={24}/> : <><Save size={20}/> Submit Audit for Villa {selectedVilla}</>}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- CUSTOM TOAST NOTIFICATION --- */}
        {toastMsg && (
            <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toastMsg.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
                {toastMsg.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
                <p className="text-sm font-bold leading-tight">{toastMsg.text}</p>
            </div>
        )}

        {/* --- CUSTOM CONFIRMATION MODAL --- */}
        {confirmModal.isOpen && (
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 text-center">
                    <h3 className={`text-2xl font-black mb-2 tracking-tight ${confirmModal.isDestructive ? 'text-rose-600' : 'text-[#6D2158]'}`}>
                        {confirmModal.title}
                    </h3>
                    <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed">
                        {confirmModal.message}
                    </p>
                    <div className="flex flex-col gap-3">
                        <button onClick={confirmModal.onConfirm} className={`w-full py-4 text-white rounded-2xl font-black uppercase tracking-wider text-xs shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2 ${confirmModal.isDestructive ? 'bg-rose-600 shadow-rose-200' : 'bg-[#6D2158] shadow-purple-200'}`}>
                            <Save size={16}/> {confirmModal.confirmText}
                        </button>
                        <button onClick={() => setConfirmModal(prev => ({...prev, isOpen: false}))} className="w-full py-4 bg-slate-50 text-slate-500 rounded-2xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all hover:bg-slate-100">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- SUCCESS OVERLAY --- */}
        {showSuccess && (
            <div className="fixed inset-0 z-[90] bg-emerald-600 flex flex-col items-center justify-center text-white p-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 size={64} className="text-white"/>
                </div>
                <h2 className="text-4xl font-black text-center mb-2">Saved!</h2>
                <p className="text-center font-medium text-emerald-100 mb-12 text-lg">Villa {selectedVilla} inventory has been logged.</p>
                
                <button onClick={resetFlow} className="px-10 py-5 bg-white text-emerald-700 rounded-2xl font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all hover:scale-105">
                    Log Next Villa
                </button>
            </div>
        )}

      </div>
    </div>
  );
}
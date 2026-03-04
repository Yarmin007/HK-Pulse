"use client";
import React, { useState, useEffect } from 'react';
import { 
  Lock, User, Search, Plus, Minus, Save, CheckCircle2, 
  Loader2, ChevronLeft, Wine, AlertCircle, Trash2, AlertTriangle, 
  Clock, ListChecks, Target, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

// DYNAMIC DAY/MONTH TIMEZONE FIX
const getLocalToday = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};

const getLocalMonth = () => {
    return getLocalToday().substring(0, 7);
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
type Host = { id: string; full_name: string; host_id: string; };
type MasterItem = { article_number: string; article_name: string; generic_name?: string; category: string; image_url?: string; };

const parseVillas = (input: string, doubleVillas: string[]) => {
    const result = new Set<string>();
    const parts = input.split(',').map(s => s.trim());
    
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

export default function MyTasksResponsive() {
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<2 | 3>(2);
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentHost, setCurrentHost] = useState<Host | null>(null);
  const [dailyTask, setDailyTask] = useState<{shift_type?: string, shift_note?: string} | null>(null);

  // --- MINIBAR STATE ---
  const [invStatus, setInvStatus] = useState<'OPEN' | 'CLOSED'>('CLOSED');
  const [activePeriod, setActivePeriod] = useState<string>('');
  const [assignedVillas, setAssignedVillas] = useState<string[]>([]);
  const [completedVillas, setCompletedVillas] = useState<string[]>([]);
  const [selectedVilla, setSelectedVilla] = useState('');
  const [previousSubmissions, setPreviousSubmissions] = useState<Record<string, Record<string, number>>>({});
  const [catalog, setCatalog] = useState<MasterItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState('All');

  // --- EXPIRY AUDIT STATE ---
  const [isExpiryMode, setIsExpiryMode] = useState(false);
  const [expiryTargets, setExpiryTargets] = useState<any[]>([]);
  const [expiryAssignedVillas, setExpiryAssignedVillas] = useState<string[]>([]);
  const [expiryVillaData, setExpiryVillaData] = useState<Record<string, any>>({}); 
  const [expiryCounts, setExpiryCounts] = useState<Record<string, number>>({});
  
  // NEW: State to track how many items are *actually* refilled during phase 2
  const [refillCounts, setRefillCounts] = useState<Record<string, number>>({});

  const [showSuccess, setShowSuccess] = useState(false);
  const [toastMsg, setToastMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; confirmText: string; isDestructive: boolean; onConfirm: () => void;}>({ isOpen: false, title: '', message: '', confirmText: '', isDestructive: false, onConfirm: () => {} });

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
        loadInitialData(parsed.host_id, false);
    } else {
        window.location.href = '/';
    }

    setIsMounted(true);
    fetchCatalog();
  }, []);

  // Initialize Refill Counts when entering Amber "Awaiting Refill" screen
  useEffect(() => {
      if (step === 3 && isExpiryMode && selectedVilla && expiryVillaData[selectedVilla]?.status === 'Removed') {
          const initialRefills: Record<string, number> = {};
          expiryVillaData[selectedVilla].removal_data.forEach((item: any) => {
              initialRefills[item.article_number] = item.qty; // Default to full replacement
          });
          setRefillCounts(initialRefills);
      }
  }, [step, isExpiryMode, selectedVilla, expiryVillaData]);

  const loadInitialData = async (hostId: string, isManualRefresh: boolean) => {
      setIsLoading(true);

      const todayStr = getLocalToday();
      const currentMonth = getLocalMonth();

      // 1. Fetch Today's Duty
      const { data: att } = await supabase.from('hsk_attendance').select('shift_type, shift_note').eq('host_id', hostId).eq('date', todayStr).maybeSingle();
      if (att) setDailyTask(att);

      // 2. Minibar Settings & Allocations
      const { data: constData } = await supabase.from('hsk_constants').select('*').in('type', ['mb_inv_status', 'mb_active_period', 'double_mb_villas']);
      const status = constData?.find(c => c.type === 'mb_inv_status')?.label || 'CLOSED';
      const period = constData?.find(c => c.type === 'mb_active_period')?.label;
      const dvStr = constData?.find(c => c.type === 'double_mb_villas')?.label || '';
      const dvList = dvStr.split(',').map((s: string) => s.trim()).filter(Boolean);

      setInvStatus(status as 'OPEN' | 'CLOSED');
      if (period) setActivePeriod(period);

      if (period) {
          const allocDate = `${period}-01`;
          const { data: allocations } = await supabase.from('hsk_minibar_allocations').select('villas').eq('date', allocDate).eq('host_id', hostId).maybeSingle();
          if (allocations && allocations.villas) setAssignedVillas(parseVillas(allocations.villas, dvList));

          const [y, m] = period.split('-').map(Number);
          const startOfMonthUTC = new Date(y, m - 1, 1).toISOString();
          const startOfNextMonthUTC = new Date(y, m, 1).toISOString();
          
          const { data: submissions } = await supabase.from('hsk_villa_minibar_inventory').select('villa_number, inventory_data, logged_at').gte('logged_at', startOfMonthUTC).lt('logged_at', startOfNextMonthUTC).eq('host_id', hostId).order('logged_at', { ascending: false }); 

          if (submissions) {
              const done = Array.from(new Set(submissions.map(s => s.villa_number)));
              setCompletedVillas(done);

              const prevData: Record<string, Record<string, number>> = {};
              submissions.forEach(sub => {
                  if (!prevData[sub.villa_number]) {
                      const itemMap: Record<string, number> = {};
                      if (sub.inventory_data && Array.isArray(sub.inventory_data)) {
                          sub.inventory_data.forEach((item: any) => { itemMap[item.article_number] = item.qty; });
                      }
                      prevData[sub.villa_number] = itemMap;
                  }
              });
              setPreviousSubmissions(prevData);
          }
      }

      // 3. Expiry Audit Data
      const [expiryTargetRes, expiryAllocRes, expiryRemRes] = await Promise.all([
          supabase.from('hsk_expiry_targets').select('*').eq('month_period', currentMonth),
          supabase.from('hsk_expiry_allocations').select('villas').eq('month_period', currentMonth).eq('host_id', hostId).maybeSingle(),
          supabase.from('hsk_expiry_removals').select('*').eq('month_period', currentMonth).eq('host_id', hostId)
      ]);

      if (expiryAllocRes.error && expiryAllocRes.error.code !== 'PGRST116') toast.error("DB Error on Expiry Allocations.");

      if (expiryTargetRes.data) setExpiryTargets(expiryTargetRes.data);
      
      if (expiryAllocRes.data && expiryAllocRes.data.villas) {
          const parsedExpiryVillas = parseVillas(expiryAllocRes.data.villas, dvList);
          setExpiryAssignedVillas(parsedExpiryVillas);
          if (isManualRefresh) toast.success(`Found ${parsedExpiryVillas.length} Expiry Villas!`);
      } else {
          setExpiryAssignedVillas([]);
          if (isManualRefresh) toast.error(`0 Expiry Villas assigned.`);
      }

      if (expiryRemRes.data) {
          const villaMap: Record<string, any> = {};
          expiryRemRes.data.forEach((r: any) => { villaMap[r.villa_number] = r; });
          setExpiryVillaData(villaMap);
      }

      setIsLoading(false);
  };

  const fetchCatalog = async () => {
    const { data: catRes } = await supabase.from('hsk_master_catalog').select('*').eq('is_minibar_item', true);
    const { data: constRes } = await supabase.from('hsk_constants').select('*').eq('type', 'hidden_mb_item');
    if (catRes) {
        const hiddenList = constRes ? constRes.map(h => h.label) : [];
        const filteredAndSorted = catRes.filter(i => !hiddenList.includes(i.article_number)).sort((a, b) => getCategoryWeight(a.category) - getCategoryWeight(b.category) || a.article_name.localeCompare(b.article_name));
        setCatalog(filteredAndSorted);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
      setToastMsg({ type, text });
      setTimeout(() => setToastMsg(null), 4000);
  };

  // --- MINIBAR FUNCTIONS ---
  const startAudit = (villa: string) => {
    setSelectedVilla(villa);
    setIsExpiryMode(false);
    const initialCounts: Record<string, number> = {};
    const previousData = previousSubmissions[villa] || {};
    catalog.forEach(item => { initialCounts[item.article_number] = previousData[item.article_number] || 0; });
    setCounts(initialCounts);
    setStep(3);
  };

  const updateCount = (article_number: string, delta: number) => {
    setCounts(prev => {
      const next = (prev[article_number] || 0) + delta;
      return { ...prev, [article_number]: next < 0 ? 0 : next };
    });
  };

  const requestAllOk = () => {
      setConfirmModal({
          isOpen: true, title: "Fill & Submit?", message: `This will auto-fill standard PAR and submit immediately.`, confirmText: "Fill & Submit", isDestructive: false,
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
          isOpen: true, title: "Empty & Submit?", message: "This will set all items to 0 and submit immediately.", confirmText: "Empty & Submit", isDestructive: true,
          onConfirm: () => {
              const newCounts: Record<string, number> = {};
              catalog.forEach(item => { newCounts[item.article_number] = 0; });
              setCounts(newCounts);
              setConfirmModal(prev => ({ ...prev, isOpen: false }));
              executeSaveInventory(newCounts);
          }
      });
  };

  const requestSaveInventory = () => {
      setConfirmModal({
          isOpen: true, title: `Submit Villa ${selectedVilla}?`, message: "Are you sure you want to save this inventory record?", confirmText: "Submit Record", isDestructive: false,
          onConfirm: () => { setConfirmModal(prev => ({ ...prev, isOpen: false })); executeSaveInventory(); }
      });
  };

  const executeSaveInventory = async (overrideCounts?: Record<string, number>) => {
    setIsLoading(true);
    const finalCounts = overrideCounts || counts;
    const countedItems = Object.entries(finalCounts).filter(([_, qty]) => qty > 0).map(([artNo, qty]) => {
            const item = catalog.find(c => c.article_number === artNo);
            return { article_number: artNo, name: item?.generic_name || item?.article_name, qty };
        });

    const payload = {
        villa_number: selectedVilla, host_id: currentHost?.host_id, host_name: currentHost?.full_name,
        inventory_data: countedItems, logged_at: new Date().toISOString() 
    };

    const { error } = await supabase.from('hsk_villa_minibar_inventory').insert(payload);
    setIsLoading(false);

    if (error) { showNotification('error', `DB Error: Please contact Admin.`); } 
    else {
        setCompletedVillas(prev => Array.from(new Set([...prev, selectedVilla])));
        setPreviousSubmissions(prev => ({ ...prev, [selectedVilla]: finalCounts }));
        setShowSuccess(true);
    }
  };

  // --- EXPIRY FUNCTIONS ---
  const startExpiryAudit = (villa: string) => {
      setSelectedVilla(villa);
      setIsExpiryMode(true);
      const initialCounts: Record<string, number> = {};
      expiryTargets.forEach(t => { initialCounts[`${t.article_number}_${t.expiry_date}`] = 0; });
      setExpiryCounts(initialCounts);
      setStep(3);
  };

  const updateExpiryCount = (key: string, delta: number) => {
      setExpiryCounts(prev => {
          const next = (prev[key] || 0) + delta;
          return { ...prev, [key]: next < 0 ? 0 : next };
      });
  };

  const updateRefillCount = (artNo: string, delta: number, maxAllowed: number) => {
      setRefillCounts(prev => {
          const next = (prev[artNo] || 0) + delta;
          return { ...prev, [artNo]: Math.max(0, Math.min(next, maxAllowed)) };
      });
  };

  const submitExpiryRemovals = async (statusOverride: 'All OK' | 'Removed') => {
      setIsLoading(true);
      
      const removalData = Object.entries(expiryCounts).filter(([_, qty]) => qty > 0).map(([key, qty]) => {
              const [article_number, expiry_date] = key.split('_');
              const target = expiryTargets.find(t => t.article_number === article_number && t.expiry_date === expiry_date);
              return { article_number, expiry_date, name: target?.article_name, qty, refilled_qty: 0 };
          });

      const payload = {
          month_period: getLocalMonth(),
          villa_number: selectedVilla,
          host_id: currentHost?.host_id,
          host_name: currentHost?.full_name,
          removal_data: statusOverride === 'All OK' ? [] : removalData,
          status: statusOverride,
          logged_at: new Date().toISOString()
      };

      const { error } = await supabase.from('hsk_expiry_removals').insert(payload);
      setIsLoading(false);

      if (error) { 
          toast.error("Failed to save expiry audit."); 
      } else {
          setExpiryVillaData(prev => ({ ...prev, [selectedVilla]: payload }));
          if (statusOverride === 'All OK') toast.success("Cleared! No items found.");
          else toast.success("Removals Recorded! Now fetch replacements.");
          setShowSuccess(true);
      }
  };

  const confirmExpiryRefill = async () => {
      setIsLoading(true);
      
      // Merge the actual refilled quantities back into the JSON data
      const currentData = expiryVillaData[selectedVilla].removal_data;
      const updatedRemovalData = currentData.map((item: any) => ({
          ...item,
          refilled_qty: refillCounts[item.article_number] !== undefined ? refillCounts[item.article_number] : item.qty
      }));

      const { error } = await supabase.from('hsk_expiry_removals')
          .update({ 
              status: 'Refilled', 
              removal_data: updatedRemovalData,
              logged_at: new Date().toISOString() 
          })
          .match({ villa_number: selectedVilla, month_period: getLocalMonth() });

      setIsLoading(false);

      if (error) {
          toast.error("Failed to confirm refill.");
      } else {
          const currentRecord = expiryVillaData[selectedVilla];
          setExpiryVillaData(prev => ({ ...prev, [selectedVilla]: { ...currentRecord, status: 'Refilled', removal_data: updatedRemovalData }}));
          toast.success("Replacements Confirmed!");
          setShowSuccess(true);
      }
  };

  const resetFlow = () => {
    setShowSuccess(false);
    setSelectedVilla('');
    setIsExpiryMode(false);
    setStep(2);
  };

  const categories = ['All', ...Array.from(new Set(catalog.map(i => i.category)))];

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-8 font-antiqua text-slate-800 pb-24">
      
      <div className="max-w-5xl mx-auto w-full flex flex-col animate-in fade-in">
        
        {/* --- DASHBOARD --- */}
        {step === 2 && currentHost && (
            <>
                <div className="flex items-center justify-between mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                   <div className="flex items-center gap-5">
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
                   <button onClick={() => loadInitialData(currentHost.host_id, true)} className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full transition-colors active:scale-95" title="Refresh Tasks">
                       <RefreshCw size={20} className={isLoading ? 'animate-spin text-[#6D2158]' : ''}/>
                   </button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
                ) : (
                    <div className="space-y-6">
                        
                        {/* EXPIRY AUDIT CARD */}
                        {expiryAssignedVillas.length > 0 && (
                            <div className="bg-rose-50 p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-rose-100 animate-in slide-in-from-bottom-3">
                                <div className="mb-6">
                                    <h3 className="text-xl font-bold text-rose-800 mb-1 flex items-center gap-2"><AlertTriangle size={20}/> Expiry Audit</h3>
                                    <p className="text-xs text-rose-600/70 font-medium">Check these villas for expiring items.</p>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
                                    {expiryAssignedVillas.map(villa => {
                                        const vData = expiryVillaData[villa];
                                        const status = vData?.status;
                                        
                                        const isNeedsRefill = status === 'Removed';
                                        const isDone = status === 'All OK' || status === 'Refilled';

                                        return (
                                            <button 
                                                key={villa}
                                                onClick={() => !isDone && startExpiryAudit(villa)}
                                                className={`aspect-square rounded-3xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${
                                                    isDone ? 'bg-emerald-50 border-emerald-500 text-emerald-700 cursor-default' : 
                                                    isNeedsRefill ? 'bg-amber-100 border-amber-400 text-amber-700 animate-pulse' : 
                                                    'bg-white border-rose-200 text-rose-700 hover:border-rose-400 hover:shadow-md'
                                                }`}
                                            >
                                                {isDone && <CheckCircle2 size={16} className="absolute top-3 right-3 text-emerald-500"/>}
                                                <span className={`font-black ${villa.includes('-') ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl'}`}>{villa}</span>
                                                <span className="text-[10px] md:text-xs font-bold uppercase mt-1 opacity-60">
                                                    {isDone ? 'Done' : isNeedsRefill ? 'Refill' : 'Pending'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* MINIBAR INVENTORY CARD */}
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
                                                    onClick={() => !isDone && startAudit(villa)}
                                                    className={`aspect-square rounded-3xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${isDone ? 'bg-emerald-50 border-emerald-500 text-emerald-700 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#6D2158] hover:shadow-md'}`}
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

                    </div>
                )}
            </>
        )}

        {/* --- STEP 3: ENTRY GRID (ROUTER) --- */}
        {step === 3 && currentHost && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-8 duration-300">
                
                {/* Router Header */}
                <div className={`${isExpiryMode ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-white border-slate-100'} p-6 rounded-[2.5rem] shadow-sm border mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
                    <div className="flex items-center gap-4">
                        <button onClick={() => { setStep(2); setIsExpiryMode(false); }} className={`p-3 rounded-full transition-colors ${isExpiryMode ? 'bg-white hover:bg-rose-100 text-rose-600' : 'bg-slate-50 hover:bg-slate-100 text-slate-500'}`}><ChevronLeft size={20}/></button>
                        <div>
                            <h2 className={`text-2xl font-black ${isExpiryMode ? 'text-rose-700' : 'text-[#6D2158]'}`}>Villa {selectedVilla}</h2>
                            <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${isExpiryMode ? 'text-rose-500' : 'text-slate-400'}`}>{isExpiryMode ? 'Expiry Removal Task' : 'Audit Mode'}</p>
                        </div>
                    </div>
                    
                    {!isExpiryMode && (
                        <div className="flex gap-2 w-full md:w-auto">
                            <button onClick={requestEmptyMinibar} className="flex-1 md:flex-none px-6 py-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all flex items-center justify-center gap-2">
                                <Trash2 size={16}/> Empty
                            </button>
                            <button onClick={requestAllOk} className="flex-1 md:flex-none px-6 py-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center justify-center gap-2">
                                <CheckCircle2 size={16}/> All OK
                            </button>
                        </div>
                    )}
                </div>

                {/* UI Content based on Mode */}
                {isExpiryMode ? (
                    expiryVillaData[selectedVilla]?.status === 'Removed' ? (
                        
                        // --- AWAITING REFILL SCREEN ---
                        <div className="space-y-4 pb-32 animate-in fade-in">
                            <div className="bg-amber-50 border border-amber-200 p-6 md:p-8 rounded-[2rem] text-center shadow-sm mb-6">
                                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
                                    <AlertTriangle size={32}/>
                                </div>
                                <h3 className="text-2xl font-black text-amber-700 tracking-tight">Awaiting Refill</h3>
                                <p className="text-sm font-medium text-amber-600 mt-2 leading-relaxed">
                                    Please adjust the counters below if you could not replace all items.
                                </p>
                            </div>
                                
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {expiryVillaData[selectedVilla].removal_data.map((item: any) => {
                                    const masterItem = catalog.find(c => c.article_number === item.article_number);
                                    const currentRefill = refillCounts[item.article_number] !== undefined ? refillCounts[item.article_number] : item.qty;
                                    const isNotRefilled = currentRefill === 0;
                                    const isPartial = currentRefill > 0 && currentRefill < item.qty;

                                    return (
                                        <div key={item.article_number} className={`bg-white rounded-3xl p-3 shadow-sm border flex flex-col gap-3 relative transition-all ${isNotRefilled ? 'border-rose-300 bg-rose-50/30' : isPartial ? 'border-amber-300' : 'border-slate-200'}`}>
                                            
                                            {/* Image container */}
                                            <div className="w-full aspect-square bg-slate-50 rounded-2xl overflow-hidden flex items-center justify-center p-4">
                                                {masterItem?.image_url ? <img src={masterItem.image_url} className={`w-full h-full object-contain drop-shadow-sm transition-all ${isNotRefilled ? 'grayscale opacity-50' : ''}`} /> : <Wine size={32} className="text-slate-300"/>}
                                            </div>
                                            
                                            {/* Text */}
                                            <div className="flex flex-col flex-1 px-1">
                                                <h4 className="text-sm font-black text-slate-800 leading-tight line-clamp-2">{item.name}</h4>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Target: {item.qty} items</p>
                                                
                                                {isNotRefilled && <span className="text-[10px] font-black text-rose-500 uppercase mt-2">Not Refilled</span>}
                                                {isPartial && <span className="text-[10px] font-black text-amber-500 uppercase mt-2">Partial Refill</span>}
                                            </div>

                                            {/* Refill Stepper */}
                                            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1 border border-slate-200 mt-auto">
                                                <button onClick={() => updateRefillCount(item.article_number, -1, item.qty)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={18}/></button>
                                                <span className={`font-black text-lg ${isNotRefilled ? 'text-rose-600' : 'text-emerald-600'}`}>{currentRefill}</span>
                                                <button onClick={() => updateRefillCount(item.article_number, 1, item.qty)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:text-emerald-600 active:scale-95 transition-all"><Plus size={18}/></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            <div className="fixed bottom-0 left-0 right-0 md:left-64 p-4 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                                <div className="max-w-5xl mx-auto">
                                    <button 
                                        onClick={confirmExpiryRefill} 
                                        disabled={isLoading} 
                                        className="w-full py-5 text-white bg-emerald-500 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <Loader2 className="animate-spin" size={24}/> : <><CheckCircle2 size={20}/> Confirm Replacements</>}
                                    </button>
                                </div>
                            </div>
                        </div>

                    ) : (

                        // --- RECORD REMOVAL SCREEN (Vertical Cards) ---
                        <div className="space-y-4 pb-32 animate-in fade-in">
                            {expiryTargets.length === 0 ? (
                                <p className="text-center font-bold text-slate-400 italic mt-10">No targets set by admin.</p>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {expiryTargets.map(t => {
                                        const key = `${t.article_number}_${t.expiry_date}`;
                                        const masterItem = catalog.find(c => c.article_number === t.article_number);
                                        const qty = expiryCounts[key] || 0;

                                        return (
                                            <div key={key} className={`bg-white rounded-3xl p-3 shadow-sm border flex flex-col gap-3 relative transition-all ${qty > 0 ? 'border-rose-400 ring-4 ring-rose-50' : 'border-slate-200'}`}>
                                                
                                                <div className="w-full aspect-square bg-slate-50 rounded-2xl overflow-hidden flex items-center justify-center p-4">
                                                    {masterItem?.image_url ? <img src={masterItem.image_url} className="w-full h-full object-contain drop-shadow-sm" /> : <Wine size={32} className="text-slate-300"/>}
                                                </div>
                                                
                                                <div className="flex flex-col flex-1 px-1 text-center">
                                                    <h4 className="text-sm font-black text-slate-800 leading-tight line-clamp-2">{t.article_name}</h4>
                                                    <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mt-1 bg-rose-50 px-2 py-1 rounded-lg w-fit mx-auto">Exp: {format(parseISO(t.expiry_date), 'MMM yyyy')}</p>
                                                </div>

                                                <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1 border border-slate-200 mt-auto">
                                                    <button onClick={() => updateExpiryCount(key, -1)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={18}/></button>
                                                    <span className={`font-black text-lg ${qty > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{qty}</span>
                                                    <button onClick={() => updateExpiryCount(key, 1)} className="w-10 h-10 flex items-center justify-center bg-rose-600 rounded-lg shadow-sm text-white active:scale-95 transition-all"><Plus size={18}/></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            
                            <div className="fixed bottom-0 left-0 right-0 md:left-64 p-4 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                                <div className="max-w-5xl mx-auto flex gap-3">
                                    <button 
                                        onClick={() => submitExpiryRemovals('All OK')} 
                                        disabled={isLoading} 
                                        className="flex-1 py-5 text-emerald-700 bg-emerald-50 rounded-2xl font-black uppercase tracking-widest border border-emerald-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 leading-none"
                                    >
                                        {isLoading ? <Loader2 className="animate-spin" size={24}/> : <><span>None Found</span><span className="text-[9px] opacity-70">(All OK)</span></>}
                                    </button>
                                    <button 
                                        onClick={() => submitExpiryRemovals('Removed')} 
                                        disabled={isLoading || expiryTargets.length === 0 || Object.values(expiryCounts).every(v => v === 0)} 
                                        className="flex-[1.5] py-5 text-white bg-rose-600 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-rose-600/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 leading-none disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? <Loader2 className="animate-spin" size={24}/> : <><span>Record Removals</span><span className="text-[9px] opacity-70">(Needs Refill)</span></>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                ) : (
                    // --- STANDARD MINIBAR MODE (Vertical Image Cards) ---
                    <>
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

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-32">
                            {catalog.filter(i => activeCategory === 'All' || i.category === activeCategory).map(item => {
                                const qty = counts[item.article_number] || 0;
                                
                                return (
                                <div key={item.article_number} className={`bg-white rounded-3xl p-3 shadow-sm border flex flex-col gap-3 relative transition-all ${qty > 0 ? 'border-[#6D2158] ring-4 ring-[#6D2158]/5' : 'border-slate-200'}`}>
                                    
                                    <div className="w-full aspect-square bg-slate-50 rounded-2xl overflow-hidden flex items-center justify-center p-3">
                                        {item.image_url ? <img src={item.image_url} className="w-full h-full object-contain drop-shadow-sm"/> : <Wine size={32} className="text-slate-300"/>}
                                    </div>
                                    
                                    <div className="flex flex-col flex-1 px-1">
                                        <h4 className="text-[11px] font-black text-slate-800 leading-tight line-clamp-2">{item.generic_name || item.article_name}</h4>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.category}</p>
                                    </div>

                                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1 border border-slate-200 mt-auto">
                                        <button onClick={() => updateCount(item.article_number, -1)} className="w-9 h-9 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all">
                                            <Minus size={16}/>
                                        </button>
                                        <span className={`w-8 text-center font-black text-lg ${qty > 0 ? 'text-[#6D2158]' : 'text-slate-400'}`}>
                                            {qty}
                                        </span>
                                        <button onClick={() => updateCount(item.article_number, 1)} className="w-9 h-9 flex items-center justify-center bg-[#6D2158] rounded-lg shadow-sm text-white active:scale-95 transition-all">
                                            <Plus size={16}/>
                                        </button>
                                    </div>
                                </div>
                            )})}
                        </div>

                        {/* Fixed Bottom Submit Bar */}
                        <div className="fixed bottom-0 left-0 right-0 md:left-64 p-4 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                            <div className="max-w-5xl mx-auto">
                                <button 
                                    onClick={requestSaveInventory} 
                                    disabled={isLoading} 
                                    className="w-full py-4 md:py-5 text-white bg-[#6D2158] shadow-purple-900/20 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" size={24}/> : <><Save size={20}/> Submit Audit</>}
                                </button>
                            </div>
                        </div>
                    </>
                )}
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
                <p className="text-center font-medium text-emerald-100 mb-12 text-lg">Villa {selectedVilla} record has been logged.</p>
                
                <button onClick={resetFlow} className="px-10 py-5 bg-white text-emerald-700 rounded-2xl font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all hover:scale-105">
                    Log Next Villa
                </button>
            </div>
        )}

      </div>
    </div>
  );
}
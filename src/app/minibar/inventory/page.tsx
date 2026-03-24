"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, CheckCircle2, User, Save, Lock, Unlock,
  RefreshCw, Loader2, Smartphone, LayoutGrid, Users, Settings, EyeOff, Eye, Search, Home, Wine, X, Download
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { getDhakaDateStr } from '@/lib/dateUtils';

const TOTAL_VILLAS = 97;

// DYNAMIC MONTH TIMEZONE FIX
const getLocalMonth = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    const str = new Intl.DateTimeFormat('en-CA', { 
        timeZone: tz, 
        year: 'numeric', month: '2-digit', day: '2-digit' 
    }).format(new Date());
    return str.substring(0, 7);
};

// Helper to get previous month string
const getPrevMonth = (yyyy_mm: string) => {
    const [y, m] = yyyy_mm.split('-').map(Number);
    let prevM = m - 1;
    let prevY = y;
    if (prevM === 0) { prevM = 12; prevY--; }
    return `${prevY}-${String(prevM).padStart(2, '0')}`;
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
type FinancialRecord = {
    opening_stock: number;
    transfer_in: number;
    transfer_out: number;
    sales: number;
    minibar_store: number;
    comments: string;
};

// --- CUSTOM VILLA TAG INPUT ---
const VillaTagInput = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const tags = value.split(',').map(s => s.trim()).filter(Boolean);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const newTag = e.currentTarget.value.trim();
            if (newTag && !tags.includes(newTag)) {
                onChange([...tags, newTag].join(', '));
            }
            e.currentTarget.value = '';
        } else if (e.key === 'Backspace' && e.currentTarget.value === '' && tags.length > 0) {
            onChange(tags.slice(0, -1).join(', '));
        }
    };

    const removeTag = (tagToRemove: string) => {
        onChange(tags.filter(t => t !== tagToRemove).join(', '));
    };

    return (
        <div className="flex flex-wrap gap-2 items-center bg-slate-50 border border-slate-200 p-2 rounded-xl focus-within:border-[#6D2158] focus-within:ring-2 focus-within:ring-[#6D2158]/10 transition-all cursor-text min-h-[50px]">
            {tags.map(t => (
                <span key={t} className="flex items-center gap-1 bg-white border border-slate-300 px-3 py-1.5 rounded-lg text-sm font-black text-[#6D2158] shadow-sm animate-in zoom-in-95 duration-200">
                    {t} <X size={14} className="cursor-pointer text-slate-300 hover:text-rose-50 ml-1" onClick={() => removeTag(t)} />
                </span>
            ))}
            <input 
                type="text" 
                className="bg-transparent outline-none flex-1 min-w-[80px] font-bold text-sm text-slate-700" 
                placeholder={tags.length === 0 ? "Type # and press Enter..." : "Add..."}
                onKeyDown={handleKeyDown} 
                onBlur={(e) => {
                    const newTag = e.target.value.trim();
                    if (newTag && !tags.includes(newTag)) {
                        onChange([...tags, newTag].join(', '));
                        e.target.value = '';
                    }
                }}
            />
        </div>
    );
};

// --- STRICT COLUMN WIDTHS FOR MATRIX ---
const MASTER_WIDTHS = {
    microsName: 'w-[160px] min-w-[160px] shrink-0',
    artNo: 'w-[60px] min-w-[60px] shrink-0',
    artName: 'w-[240px] min-w-[240px] shrink-0',
    unit: 'w-[45px] min-w-[45px] shrink-0',
    cost: 'w-[65px] min-w-[65px] shrink-0',
    price: 'w-[65px] min-w-[65px] shrink-0',
};
const TOTAL_MASTER_WIDTH = 160 + 60 + 240 + 45 + 65 + 65; // 635px

export default function MinibarInventoryAdmin() {
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'ASSIGNMENTS' | 'SETUP'>('MATRIX');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingMatrix, setIsSavingMatrix] = useState(false);
  
  // MONTHLY STATE
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonth());
  const [activePeriod, setActivePeriod] = useState('');
  const [invStatus, setInvStatus] = useState<'OPEN' | 'CLOSED'>('CLOSED');
  
  // Data
  const [catalog, setCatalog] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [financials, setFinancials] = useState<Record<string, FinancialRecord>>({});
  const [previousClosing, setPreviousClosing] = useState<Record<string, number>>({});
  
  const [hosts, setHosts] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [doubleVillasStr, setDoubleVillasStr] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Search State for Hosts
  const [hostSearch, setHostSearch] = useState('');
  const [showHostDropdown, setShowHostDropdown] = useState(false);

  // Extraction State
  const [extractDate, setExtractDate] = useState(getDhakaDateStr());
  const [isExtracting, setIsExtracting] = useState(false);

  // --- DYNAMIC VILLA LIST (Splits double villas) ---
  const activeVillaList = useMemo(() => {
      const doubleList = doubleVillasStr.split(',').map(s => s.trim()).filter(Boolean);
      const list: string[] = [];
      for (let i = 1; i <= TOTAL_VILLAS; i++) {
          const v = String(i);
          if (doubleList.includes(v)) {
              list.push(`${v}-1`, `${v}-2`);
          } else {
              list.push(v);
          }
      }
      return list;
  }, [doubleVillasStr]);

  const fetchMonthlyData = useCallback(async () => {
    setIsLoading(true);
    
    // Bounds for the whole month
    const [y, m] = selectedMonth.split('-').map(Number);
    const startOfMonth = new Date(y, m - 1, 1).toISOString();
    const startOfNextMonth = new Date(y, m, 1).toISOString();
    const allocDate = `${selectedMonth}-01`;
    const prevMonth = getPrevMonth(selectedMonth);

    const [subRes, allocRes, finRes, prevFinRes] = await Promise.all([
        supabase.from('hsk_villa_minibar_inventory').select('*').gte('logged_at', startOfMonth).lt('logged_at', startOfNextMonth),
        supabase.from('hsk_minibar_allocations').select('*').eq('date', allocDate),
        supabase.from('hsk_monthly_minibar').select('*').eq('month_period', selectedMonth),
        supabase.from('hsk_monthly_minibar').select('*').eq('month_period', prevMonth) // Get Previous Month
    ]);

    if (subRes.data) {
      const latestSubmissions: Record<string, any> = {};
      subRes.data.forEach(sub => {
        const existing = latestSubmissions[sub.villa_number];
        if (!existing || new Date(sub.logged_at) > new Date(existing.logged_at)) {
            latestSubmissions[sub.villa_number] = sub;
        }
      });
      setSubmissions(Object.values(latestSubmissions));
    }

    if (allocRes.data) {
        const allocMap: Record<string, string> = {};
        allocRes.data.forEach(a => { allocMap[a.host_id] = a.villas; });
        setAllocations(allocMap);
    } else {
        setAllocations({});
    }

    // 1. Calculate Previous Month Closing Balances
    const pMap: Record<string, number> = {};
    if (prevFinRes.data) {
        prevFinRes.data.forEach(f => {
            pMap[f.article_number] = (f.opening_stock || 0) + (f.transfer_in || 0) - (f.transfer_out || 0) - (f.sales || 0);
        });
    }
    setPreviousClosing(pMap);

    // 2. Map Current Month Financials
    if (finRes.data && finRes.data.length > 0) {
        const finMap: Record<string, FinancialRecord> = {};
        finRes.data.forEach(f => {
            finMap[f.article_number] = {
                opening_stock: f.opening_stock || 0,
                transfer_in: f.transfer_in || 0,
                transfer_out: f.transfer_out || 0,
                sales: f.sales || 0,
                minibar_store: f.minibar_store || 0,
                comments: f.comments || ''
            };
        });
        setFinancials(finMap);
    } else {
        // If NO financials exist for this month yet, it's totally clean!
        setFinancials({});
    }

    setIsLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    setIsMounted(true);
    fetchCatalogAndSettings();
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    fetchMonthlyData();

    const channel = supabase
        .channel('realtime_inventory')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'hsk_villa_minibar_inventory' }, 
            (payload) => {
                const newRecord = payload.new as any;
                if (!newRecord || !newRecord.logged_at) return;
                
                const recordDateObj = new Date(newRecord.logged_at);
                const ry = recordDateObj.getFullYear();
                const rm = String(recordDateObj.getMonth() + 1).padStart(2, '0');
                const recordMonth = `${ry}-${rm}`;
                
                if (recordMonth === selectedMonth) {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        toast.success(`${newRecord.host_name.split(' ')[0] || 'Attendant'} updated Villa ${newRecord.villa_number}!`, {
                            icon: '🔔',
                            style: { background: '#FDFBFD', color: '#6D2158', border: '1px solid #6D2158', fontWeight: 'bold' },
                            duration: 4000,
                        });
                    }
                    fetchMonthlyData();
                }
            }
        )
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedMonth, isMounted, fetchMonthlyData]);

  const fetchCatalogAndSettings = async () => {
    const [catRes, hostRes, constRes] = await Promise.all([
        supabase.from('hsk_master_catalog').select('*').eq('is_minibar_item', true),
        supabase.from('hsk_hosts').select('*').order('full_name'),
        supabase.from('hsk_constants').select('*').in('type', ['hidden_mb_item', 'double_mb_villas', 'mb_inv_status', 'mb_active_period']) 
    ]);

    if (catRes.data) {
        const sortedCatalog = catRes.data.sort((a, b) => {
            const orderA = a.sort_order || 9999;
            const orderB = b.sort_order || 9999;
            if (orderA !== orderB) return orderA - orderB;
            return getCategoryWeight(a.category) - getCategoryWeight(b.category) || a.article_name.localeCompare(b.article_name);
        });
        setCatalog(sortedCatalog);
    }
    
    if (hostRes.data) setHosts(hostRes.data);
    
    if (constRes.data) {
        setHiddenItems(constRes.data.filter(h => h.type === 'hidden_mb_item').map(h => h.label));
        const dv = constRes.data.find(h => h.type === 'double_mb_villas');
        if (dv) setDoubleVillasStr(dv.label);

        const status = constRes.data.find(h => h.type === 'mb_inv_status')?.label as 'OPEN' | 'CLOSED' || 'CLOSED';
        setInvStatus(status);
        
        const period = constRes.data.find(h => h.type === 'mb_active_period')?.label;
        if (period) {
            setActivePeriod(period);
            // PERFECT FIX: Removed setSelectedMonth(period) entirely so it stays on the live month!
        }
    }
  };

  const toggleInventoryStatus = async () => {
      const newStatus = invStatus === 'OPEN' ? 'CLOSED' : 'OPEN';
      setIsSaving(true);
      
      await supabase.from('hsk_constants').delete().eq('type', 'mb_inv_status');
      await supabase.from('hsk_constants').insert({ type: 'mb_inv_status', label: newStatus });
      setInvStatus(newStatus);
      
      if (newStatus === 'OPEN' && selectedMonth !== activePeriod) {
          await supabase.from('hsk_constants').delete().eq('type', 'mb_active_period');
          await supabase.from('hsk_constants').insert({ type: 'mb_active_period', label: selectedMonth });
          setActivePeriod(selectedMonth);
      }

      setIsSaving(false);
      toast.success(`Inventory is now ${newStatus}`);
  };

  const handleExtractAllocations = async () => {
      setIsExtracting(true);
      const { data, error } = await supabase.from('hsk_allocations').select('host_id, task_details').eq('report_date', extractDate);
      
      if (error) {
          toast.error("Extraction Error: " + error.message);
      } else if (data && data.length > 0) {
          const newAlloc: Record<string, string> = { ...allocations };
          let matchCount = 0;
          
          data.forEach(d => {
              const taskDetails = d.task_details || '';
              // Skip extraction for this attendant if they don't have any villas assigned
              if (taskDetails.trim() === '') return;

              // Cross-reference with the hosts array to safely map either UUID or SSL number
              const matchedHost = hosts.find(h => h.id === d.host_id || h.host_id === d.host_id);
              if (matchedHost) {
                  newAlloc[matchedHost.host_id] = taskDetails;
                  matchCount++;
              }
          });
          
          setAllocations(newAlloc);
          if (matchCount > 0) {
              toast.success(`${matchCount} allocations imported from ${extractDate}! (Remember to save)`);
          } else {
              toast.error("Data extracted, but couldn't find any staff with valid villa assignments.");
          }
      } else {
          toast.error(`No daily allocations found for ${extractDate}.`);
      }
      setIsExtracting(false);
  };

  const handleSaveAllocations = async () => {
      setIsSaving(true);
      const toInsert = [];
      const allocDate = `${selectedMonth}-01`;

      for (const [host_id, villas] of Object.entries(allocations)) {
          if (villas.trim() !== '') {
              toInsert.push({ date: allocDate, host_id, villas });
          }
      }

      let hasError = false;
      const { error: delErr } = await supabase.from('hsk_minibar_allocations').delete().eq('date', allocDate);
      if (delErr) { toast.error("DB Wipe Error: " + delErr.message); hasError = true; }

      if (toInsert.length > 0) {
          const { error: insErr } = await supabase.from('hsk_minibar_allocations').insert(toInsert);
          if (insErr) { toast.error("DB Save Error: " + insErr.message); hasError = true; }
      }
      
      if (!hasError) toast.success(`Allocations saved for ${selectedMonth}!`);
      setIsSaving(false);
  };

  const handleSaveDoubleVillas = async () => {
      setIsSaving(true);
      await supabase.from('hsk_constants').delete().eq('type', 'double_mb_villas');
      if (doubleVillasStr.trim()) {
          await supabase.from('hsk_constants').insert({ type: 'double_mb_villas', label: doubleVillasStr.trim() });
      }
      setIsSaving(false);
      toast.success("Villa splits saved!");
  };

  const toggleHiddenItem = async (articleNo: string, isCurrentlyHidden: boolean) => {
      if (isCurrentlyHidden) {
          await supabase.from('hsk_constants').delete().match({ type: 'hidden_mb_item', label: articleNo });
          setHiddenItems(prev => prev.filter(a => a !== articleNo));
      } else {
          await supabase.from('hsk_constants').insert({ type: 'hidden_mb_item', label: articleNo });
          setHiddenItems(prev => [...prev, articleNo]);
      }
  };

  const copyMobileLink = () => {
    const url = `${window.location.origin}/minibar/inventory/mobile`;
    navigator.clipboard.writeText(url);
    toast.success("Mobile App link copied to clipboard!");
  };

  // --- MATRIX STATE UPDATERS ---
  const updateFin = (artNo: string, field: keyof FinancialRecord, val: any) => {
      setFinancials(prev => ({
          ...prev,
          [artNo]: {
              ...(prev[artNo] || { opening_stock: previousClosing[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' }),
              [field]: val
          }
      }));
  };

  const updateCat = (artNo: string, field: string, val: any) => {
      setCatalog(prev => prev.map(c => c.article_number === artNo ? {...c, [field]: val} : c));
  };

  // --- SAVE ENTIRE MATRIX ---
  const handleSaveMatrix = async () => {
      setIsSavingMatrix(true);
      
      try {
          // 1. Prepare Catalog Updates (Prices/Micros Info)
          const catalogUpdates = catalog.map(c => ({
              article_number: c.article_number,
              article_name: c.article_name,
              generic_name: c.generic_name || c.article_name,
              category: c.category,
              unit: c.unit || 'Each',
              is_minibar_item: true,
              micros_no: c.micros_no || '',
              sales_price: parseFloat(c.sales_price) || 0,
              avg_cost: parseFloat(c.avg_cost) || 0,
              sort_order: parseInt(c.sort_order) || 0,
          }));
          
          // Upsert Catalog
          const { error: catErr } = await supabase.from('hsk_master_catalog').upsert(catalogUpdates, { onConflict: 'article_number' });
          if (catErr) throw new Error("Catalog Error: " + catErr.message);

          // 2. Prepare Financials Updates
          const finUpdates = catalog.map(c => {
              const artNo = c.article_number;
              const fin = financials[artNo] || { opening_stock: previousClosing[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
              return {
                  month_period: selectedMonth,
                  article_number: artNo,
                  opening_stock: fin.opening_stock || 0,
                  transfer_in: fin.transfer_in || 0,
                  transfer_out: fin.transfer_out || 0,
                  sales: fin.sales || 0,
                  minibar_store: fin.minibar_store || 0,
                  comments: fin.comments || ''
              };
          });

          if (finUpdates.length > 0) {
              const { error: finErr } = await supabase.from('hsk_monthly_minibar').upsert(finUpdates, { onConflict: 'month_period, article_number' });
              if (finErr) throw new Error("Financials Error: " + finErr.message);
          }

          toast.success(`Matrix saved successfully for ${selectedMonth}!`);
      } catch (err: any) {
          toast.error(err.message || "Failed to save Matrix.");
      }
      
      setIsSavingMatrix(false);
  };

  const matrixDict = useMemo(() => {
      const dict: Record<string, Record<string, number>> = {};
      
      activeVillaList.forEach(v => dict[v] = {});
      submissions.forEach(sub => {
          if (!dict[sub.villa_number]) dict[sub.villa_number] = {};
          if (sub.inventory_data && Array.isArray(sub.inventory_data)) {
              sub.inventory_data.forEach((item: any) => {
                  dict[sub.villa_number][item.article_number] = item.qty;
              });
          }
      });
      return dict;
  }, [submissions, activeVillaList]);

  if (!isMounted) return null;

  const visibleCatalogItems = catalog.filter(c => !hiddenItems.includes(c.article_number));
  const activeHostsForBoard = hosts.filter(h => allocations[h.host_id] !== undefined);
  const availableHostsToAdd = hosts.filter(h => allocations[h.host_id] === undefined);

  return (
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-[#FDFBFD] font-antiqua text-[#6D2158] overflow-hidden">
      
      {/* HEADER SECTION (STATIC) */}
      <div className="flex-none flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 p-4 md:p-6 pb-4 gap-4 bg-[#FDFBFD] z-10">
        <div>
           <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Minibar Inventory</h1>
           <div className="flex items-center gap-3 mt-2">
               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Monthly Tracking Period</p>
               {selectedMonth === activePeriod && invStatus === 'OPEN' && (
                   <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full animate-pulse text-[9px] font-black shadow-sm flex items-center gap-1"><Unlock size={10}/> OPEN & LIVE</span>
               )}
               {(selectedMonth !== activePeriod || invStatus === 'CLOSED') && (
                   <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-[9px] font-black shadow-sm flex items-center gap-1"><Lock size={10}/> CLOSED</span>
               )}
           </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
           <div className="flex items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm gap-2">
              <Calendar size={16} className="text-slate-400 ml-2"/>
              <input 
                  type="month" 
                  className="bg-transparent text-sm font-bold text-[#6D2158] outline-none cursor-pointer p-1"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
              />
           </div>
           
           <button onClick={toggleInventoryStatus} disabled={isSaving} className={`flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg transition-all ${invStatus === 'OPEN' && selectedMonth === activePeriod ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {isSaving ? <Loader2 size={16} className="animate-spin"/> : (invStatus === 'OPEN' && selectedMonth === activePeriod ? <Lock size={16}/> : <Unlock size={16}/>)}
              <span className="hidden md:inline">{invStatus === 'OPEN' && selectedMonth === activePeriod ? 'Lock Inventory' : 'Open This Month'}</span>
           </button>
           
           <button onClick={copyMobileLink} className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-[#6D2158] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:bg-[#5a1b49] transition-all">
              <Smartphone size={16}/> <span className="hidden md:inline">App Link</span>
           </button>
        </div>
      </div>

      {/* TABS SECTION (STATIC) */}
      <div className="flex-none flex justify-between items-center px-4 md:px-6 py-4 bg-[#FDFBFD] z-10">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 w-full md:w-auto">
              <button onClick={() => setActiveTab('MATRIX')} className={`px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold text-[10px] md:text-xs uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'MATRIX' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158]'}`}>
                  <LayoutGrid size={16}/> Matrix View
              </button>
              <button onClick={() => setActiveTab('ASSIGNMENTS')} className={`px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold text-[10px] md:text-xs uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'ASSIGNMENTS' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158]'}`}>
                  <Users size={16}/> Allocations
              </button>
              <button onClick={() => setActiveTab('SETUP')} className={`px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold text-[10px] md:text-xs uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'SETUP' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158]'}`}>
                  <Settings size={16}/> Setup
              </button>
          </div>
          {activeTab === 'MATRIX' && (
              <button onClick={handleSaveMatrix} disabled={isSavingMatrix} className="hidden md:flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:bg-emerald-500 transition-all">
                  {isSavingMatrix ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Save P&L Report
              </button>
          )}
      </div>

      {/* CONTENT AREA (SCROLLABLE) */}
      <div className="flex-1 overflow-hidden px-4 md:px-6 pb-4 md:pb-6 relative flex flex-col">
        {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
        ) : activeTab === 'MATRIX' ? (
            
            /* --- LIVE MATRIX VIEW --- */
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full w-full animate-in fade-in relative">
                
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Financial Variance Report: {selectedMonth}</span>
                    <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200 shadow-sm">{submissions.length} / {activeVillaList.length} Villas Logged</span>
                </div>
                
                {/* STRICTLY CONSTRAINED TABLE WRAPPER */}
                <div className="overflow-auto flex-1 relative w-full custom-scrollbar">
                    <table className="w-max min-w-full border-collapse text-[10px] whitespace-nowrap bg-white">
                        
                        {/* --- THEAD --- */}
                        <thead className="sticky top-0 z-40 bg-white">
                            {/* ROW 1: MASTER GROUPS */}
                            <tr>
                                <th rowSpan={2} className="sticky left-0 z-50 bg-slate-200 border-r-2 border-b-2 border-slate-300 p-0 shadow-[2px_0_5px_rgba(0,0,0,0.05)] align-top" style={{ width: TOTAL_MASTER_WIDTH, minWidth: TOTAL_MASTER_WIDTH, maxWidth: TOTAL_MASTER_WIDTH }}>
                                    <div className="flex w-full h-full items-stretch text-center font-black text-slate-600 uppercase tracking-widest divide-x divide-slate-300">
                                        <div className={`${MASTER_WIDTHS.microsName} p-2 flex items-center justify-center break-words whitespace-normal leading-tight`}>Micros Name</div>
                                        <div className={`${MASTER_WIDTHS.artNo} p-2 flex items-center justify-center break-words whitespace-normal leading-tight`}>Art #</div>
                                        <div className={`${MASTER_WIDTHS.artName} p-2 flex items-center justify-center break-words whitespace-normal leading-tight text-left`}>Article Name</div>
                                        <div className={`${MASTER_WIDTHS.unit} p-2 flex items-center justify-center break-words whitespace-normal leading-tight`}>Unit</div>
                                        <div className={`${MASTER_WIDTHS.cost} p-2 text-rose-700 bg-rose-50 flex items-center justify-center break-words whitespace-normal leading-tight`}>Avg Cost</div>
                                        <div className={`${MASTER_WIDTHS.price} p-2 text-emerald-700 bg-emerald-50 flex items-center justify-center break-words whitespace-normal leading-tight`}>Sell Price</div>
                                    </div>
                                </th>
                                <th colSpan={10} className="bg-blue-50 text-blue-800 border-r-2 border-slate-300 p-2 text-center text-xs uppercase tracking-widest font-black">System & Financials</th>
                                <th colSpan={activeVillaList.length} className="bg-indigo-50 text-indigo-800 border-r-2 border-slate-300 p-2 text-center text-xs uppercase tracking-widest font-black">Physical Villa Counts</th>
                                <th colSpan={3} className="bg-purple-50 text-purple-800 border-r-2 border-slate-300 p-2 text-center text-xs uppercase tracking-widest font-black">Store & Totals</th>
                                <th colSpan={3} className="bg-rose-50 text-rose-800 border-r border-slate-300 p-2 text-center text-xs uppercase tracking-widest font-black">Variance & Audit</th>
                            </tr>
                            
                            {/* ROW 2: SUB COLUMNS (Note: Left sticky column is excluded here because it uses rowSpan=2) */}
                            <tr className="bg-slate-100 text-[9px] uppercase text-slate-500 font-bold border-b-2 border-slate-300">
                                {/* System & Financials */}
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center text-blue-600 bg-blue-50/80">Open Stk</th>
                                <th className="w-[70px] min-w-[70px] p-2 border-r border-slate-200 text-center">Open Val</th>
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center text-emerald-600 bg-emerald-50/80">Trans IN</th>
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center text-rose-600 bg-rose-50/80">Trans OUT</th>
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center text-amber-600 bg-amber-50/80">Sales</th>
                                <th className="w-[70px] min-w-[70px] p-2 border-r border-slate-200 text-center">Sales Val</th>
                                <th className="w-[70px] min-w-[70px] p-2 border-r border-slate-200 text-center">COS</th>
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center">COS %</th>
                                <th className="w-[70px] min-w-[70px] p-2 border-r border-slate-200 text-center text-[#6D2158] font-black bg-[#6D2158]/10">SOH Clos</th>
                                <th className="w-20 min-w-[80px] p-2 border-r-2 border-slate-300 text-center font-black">Close Val</th>
                                
                                {/* Villas */}
                                {activeVillaList.map(v => <th key={v} className="w-10 min-w-[40px] p-2 border-r border-slate-200 text-center">{v}</th>)}
                                
                                {/* Store & Totals */}
                                <th className="w-20 min-w-[80px] p-2 border-r border-slate-200 text-center bg-purple-50/80">Villa Total</th>
                                <th className="w-20 min-w-[80px] p-2 border-r border-slate-200 text-center text-purple-700 bg-purple-100/80">MB Store</th>
                                <th className="w-20 min-w-[80px] p-2 border-r-2 border-slate-300 text-center font-black text-[#6D2158] bg-[#6D2158]/10">Total Phys</th>
                                
                                {/* Variance */}
                                <th className="w-20 min-w-[80px] p-2 border-r border-slate-200 text-center font-black text-rose-600 bg-rose-50/80">Var Qty</th>
                                <th className="w-20 min-w-[80px] p-2 border-r border-slate-200 text-center font-black">Var Val</th>
                                <th className="w-48 min-w-[192px] p-2 border-r border-slate-200 text-left pl-4">Comments</th>
                            </tr>
                        </thead>

                        {/* --- TBODY --- */}
                        <tbody className="divide-y divide-slate-100 font-medium">
                            {visibleCatalogItems.map(item => {
                                const artNo = item.article_number;
                                
                                // Auto Fill Opening Stock from Previous Month!
                                const fin = financials[artNo] || { 
                                    opening_stock: previousClosing[artNo] || 0, 
                                    transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' 
                                };
                                
                                const avgCost = parseFloat(item.avg_cost) || 0;
                                const salePrice = parseFloat(item.sales_price) || 0;
                                
                                // Math
                                const opVal = fin.opening_stock * avgCost;
                                const salesVal = fin.sales * salePrice;
                                const cos = fin.sales * avgCost;
                                const cosPct = salesVal > 0 ? (cos / salesVal) * 100 : 0;
                                const soh = fin.opening_stock + fin.transfer_in - fin.transfer_out - fin.sales;
                                const closingVal = soh * avgCost;
                                
                                const villaTotal = activeVillaList.reduce((sum, v) => sum + (matrixDict[v]?.[artNo] || 0), 0);
                                const physTotal = villaTotal + fin.minibar_store;
                                const physVal = physTotal * avgCost;
                                
                                const varQty = physTotal - soh;
                                const varVal = varQty * avgCost;

                                return (
                                    <tr key={artNo} className="hover:bg-slate-50 transition-colors group">
                                        
                                        {/* FROZEN MASTER COLUMNS */}
                                        <td className="sticky left-0 z-30 bg-white p-0 border-r-2 border-slate-300 shadow-[2px_0_5px_rgba(0,0,0,0.05)] group-hover:bg-slate-50 transition-colors" style={{ width: TOTAL_MASTER_WIDTH, minWidth: TOTAL_MASTER_WIDTH, maxWidth: TOTAL_MASTER_WIDTH }}>
                                            <div className="flex w-full h-full items-stretch text-left divide-x divide-slate-100">
                                                <div className={`${MASTER_WIDTHS.microsName} p-2 flex items-center truncate`} title={item.micros_name}>{item.micros_name || '-'}</div>
                                                <div className={`${MASTER_WIDTHS.artNo} p-2 flex items-center justify-center text-slate-400 font-mono`}>{artNo}</div>
                                                <div className={`${MASTER_WIDTHS.artName} p-2 flex items-center font-bold text-slate-800 truncate whitespace-normal leading-tight`} title={item.article_name}>{item.article_name}</div>
                                                <div className={`${MASTER_WIDTHS.unit} p-2 flex items-center justify-center`}>{item.unit}</div>
                                                <div className={`${MASTER_WIDTHS.cost} p-0 bg-rose-50/30`}>
                                                    <input type="number" className="w-full h-full min-w-0 p-2 bg-transparent outline-none focus:bg-rose-100 text-center text-rose-700 font-bold" value={item.avg_cost || ''} onChange={e => updateCat(artNo, 'avg_cost', e.target.value)} />
                                                </div>
                                                <div className={`${MASTER_WIDTHS.price} p-0 bg-emerald-50/30`}>
                                                    <input type="number" className="w-full h-full min-w-0 p-2 bg-transparent outline-none focus:bg-emerald-100 text-center text-emerald-700 font-bold" value={item.sales_price || ''} onChange={e => updateCat(artNo, 'sales_price', e.target.value)} />
                                                </div>
                                            </div>
                                        </td>

                                        {/* SYSTEM & FINANCIALS */}
                                        <td className="p-0 border-r border-slate-200 bg-blue-50/20">
                                            <input type="number" className="w-full h-full min-w-0 p-2 bg-transparent outline-none text-center font-bold text-blue-700 focus:bg-blue-100" value={fin.opening_stock === 0 ? '' : fin.opening_stock} onChange={e => updateFin(artNo, 'opening_stock', Number(e.target.value))} placeholder="0" />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-500">${opVal.toFixed(2)}</td>
                                        <td className="p-0 border-r border-slate-200 bg-emerald-50/20">
                                            <input type="number" className="w-full h-full min-w-0 p-2 bg-transparent outline-none text-center font-bold text-emerald-700 focus:bg-emerald-100" value={fin.transfer_in === 0 ? '' : fin.transfer_in} onChange={e => updateFin(artNo, 'transfer_in', Number(e.target.value))} placeholder="0" />
                                        </td>
                                        <td className="p-0 border-r border-slate-200 bg-rose-50/20">
                                            <input type="number" className="w-full h-full min-w-0 p-2 bg-transparent outline-none text-center font-bold text-rose-700 focus:bg-rose-100" value={fin.transfer_out === 0 ? '' : fin.transfer_out} onChange={e => updateFin(artNo, 'transfer_out', Number(e.target.value))} placeholder="0" />
                                        </td>
                                        <td className="p-0 border-r border-slate-200 bg-amber-50/20">
                                            <input type="number" className="w-full h-full min-w-0 p-2 bg-transparent outline-none text-center font-bold text-amber-700 focus:bg-amber-100" value={fin.sales === 0 ? '' : fin.sales} onChange={e => updateFin(artNo, 'sales', Number(e.target.value))} placeholder="0" />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-700 font-bold">${salesVal.toFixed(2)}</td>
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-500">${cos.toFixed(2)}</td>
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-500">{cosPct.toFixed(1)}%</td>
                                        <td className="p-2 border-r border-slate-200 text-center font-black text-[#6D2158] bg-[#6D2158]/5">{soh}</td>
                                        <td className="p-2 border-r-2 border-slate-300 text-center font-black">${closingVal.toFixed(2)}</td>

                                        {/* VILLA COUNTS (READ ONLY) */}
                                        {activeVillaList.map(v => {
                                            const qty = matrixDict[v]?.[artNo] || 0;
                                            return (
                                                <td key={v} className={`p-2 border-r border-slate-50 text-center ${qty > 0 ? 'font-black text-[#6D2158] bg-[#6D2158]/5' : 'text-slate-300'}`}>
                                                    {qty > 0 ? qty : '-'}
                                                </td>
                                            );
                                        })}

                                        {/* STORE & TOTALS */}
                                        <td className="p-2 border-x border-slate-200 text-center bg-purple-50/30 font-bold text-purple-800">{villaTotal}</td>
                                        <td className="p-0 border-r border-slate-200 bg-purple-100/30">
                                            <input type="number" className="w-full h-full min-w-0 p-2 bg-transparent outline-none text-center font-bold text-purple-700 focus:bg-purple-200" value={fin.minibar_store === 0 ? '' : fin.minibar_store} onChange={e => updateFin(artNo, 'minibar_store', Number(e.target.value))} placeholder="0" />
                                        </td>
                                        <td className="p-2 border-r-2 border-slate-300 text-center font-black text-[#6D2158] bg-[#6D2158]/5">{physTotal}</td>

                                        {/* VARIANCE & AUDIT */}
                                        <td className={`p-2 border-r border-slate-200 text-center font-black ${varQty < 0 ? 'text-rose-600 bg-rose-50' : varQty > 0 ? 'text-amber-600 bg-amber-50' : 'text-emerald-500'}`}>
                                            {varQty > 0 ? `+${varQty}` : varQty === 0 ? '-' : varQty}
                                        </td>
                                        <td className={`p-2 border-r border-slate-200 text-center font-bold ${varVal < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                            ${varVal.toFixed(2)}
                                        </td>
                                        <td className="p-0 border-r border-slate-200">
                                            <input type="text" className="w-full h-full min-w-0 p-2 bg-transparent outline-none text-left focus:bg-slate-100 text-slate-600 italic px-4" value={fin.comments || ''} onChange={e => updateFin(artNo, 'comments', e.target.value)} placeholder="Add note..." />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

        ) : activeTab === 'ASSIGNMENTS' ? (

            /* --- ASSIGNMENTS VIEW --- */
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[75vh] animate-in fade-in">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-0 z-50">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Monthly Attendant Allocations</h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">Type standard villa number. The app will split it automatically.</p>
                        
                        {/* NEW EXTRACTION TOOL */}
                        <div className="flex items-center gap-2 mt-3 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm w-max">
                            <Calendar size={14} className="text-slate-400 ml-1"/>
                            <input 
                                type="date" 
                                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                                value={extractDate}
                                onChange={(e) => setExtractDate(e.target.value)}
                            />
                            <button 
                                onClick={handleExtractAllocations} 
                                disabled={isExtracting}
                                className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1"
                            >
                                {isExtracting ? <Loader2 size={12} className="animate-spin"/> : <Download size={12}/>}
                                Extract Daily
                            </button>
                        </div>
                    </div>
                    
                    {/* SMART SEARCHABLE HOST INPUT */}
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-3.5 text-slate-400" size={16}/>
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] transition-all shadow-sm"
                            placeholder="Search & Add Attendant..."
                            value={hostSearch}
                            onChange={(e) => {
                                setHostSearch(e.target.value);
                                setShowHostDropdown(true);
                            }}
                            onFocus={() => setShowHostDropdown(true)}
                            onBlur={() => setTimeout(() => setShowHostDropdown(false), 200)}
                        />
                        {showHostDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto z-[100]">
                                {availableHostsToAdd.filter(h => h.full_name.toLowerCase().includes(hostSearch.toLowerCase()) || (h.host_id || '').includes(hostSearch)).map(h => (
                                    <button 
                                        key={h.id}
                                        onClick={() => {
                                            setAllocations(prev => ({...prev, [h.host_id]: ''}));
                                            setHostSearch('');
                                            setShowHostDropdown(false);
                                        }}
                                        className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-50 flex flex-col transition-colors"
                                    >
                                        <span className="font-bold text-slate-700 text-sm">{h.full_name}</span>
                                        <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">SSL {h.host_id}</span>
                                    </button>
                                ))}
                                {availableHostsToAdd.length === 0 && <div className="p-3 text-xs text-slate-400 italic">No more staff to add.</div>}
                            </div>
                        )}
                    </div>

                    <button onClick={handleSaveAllocations} disabled={isSaving} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md hover:bg-emerald-500 transition-all w-full sm:w-auto justify-center">
                        {isSaving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Save All
                    </button>
                </div>

                <div className="p-0 overflow-y-auto relative z-0 flex-1">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 sticky top-0 border-b border-slate-100 z-10">
                            <tr>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 whitespace-nowrap">Villa Attendant</th>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 whitespace-nowrap">Host No</th>
                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 w-full">Assigned Villas (For {selectedMonth})</th>
                                <th className="p-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {activeHostsForBoard.map(host => (
                                <tr key={host.id} className="hover:bg-slate-50/50">
                                    <td className="p-4 font-bold text-slate-700 flex items-center gap-2 whitespace-nowrap"><User size={14} className="text-slate-300"/> {host.full_name}</td>
                                    <td className="p-4 font-mono text-xs font-bold text-slate-400 whitespace-nowrap">SSL {host.host_id}</td>
                                    <td className="p-4">
                                        <VillaTagInput 
                                            value={allocations[host.host_id] || ''} 
                                            onChange={(newVal) => setAllocations({...allocations, [host.host_id]: newVal})} 
                                        />
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => {
                                            const updated = {...allocations};
                                            delete updated[host.host_id];
                                            setAllocations(updated);
                                        }} className="text-slate-300 hover:text-rose-500 transition-colors p-2"><X size={16}/></button>
                                    </td>
                                </tr>
                            ))}
                            {activeHostsForBoard.length === 0 && (
                                <tr><td colSpan={4} className="p-10 text-center text-slate-400 italic font-bold">No attendants added to the board. Search and add above.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        ) : (

            /* --- SETUP VIEW --- */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in flex-1 overflow-y-auto">
                
                {/* DOUBLE MINIBAR SETUP */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-fit">
                    <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-[#6D2158] uppercase tracking-widest text-sm flex items-center gap-2"><Home size={16}/> Split Minibar Villas</h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-1">These villas will appear as -1 and -2 on the Mobile App.</p>
                        </div>
                        <button onClick={handleSaveDoubleVillas} disabled={isSaving} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase hover:bg-emerald-500 transition-all flex gap-1 items-center">
                            {isSaving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Save
                        </button>
                    </div>
                    <div className="p-6 flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Villa Numbers (Comma Separated)</label>
                        <input 
                            type="text" 
                            className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] transition-all text-[#6D2158]"
                            placeholder="e.g. 1, 2, 50, 87"
                            value={doubleVillasStr}
                            onChange={(e) => setDoubleVillasStr(e.target.value)}
                        />
                    </div>
                </div>

                {/* ITEMS VISIBILITY */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[70vh]">
                    <div className="p-5 border-b border-slate-100 bg-slate-50 shrink-0">
                        <h3 className="font-bold text-[#6D2158] uppercase tracking-widest text-sm flex items-center gap-2"><Wine size={16}/> Active Items</h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">Select items to appear on the attendant's screen.</p>
                    </div>
                    <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 content-start flex-1">
                        {catalog.map(item => {
                            const isHidden = hiddenItems.includes(item.article_number);
                            return (
                                <button 
                                    key={item.article_number} 
                                    onClick={() => toggleHiddenItem(item.article_number, isHidden)} 
                                    className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left group shrink-0 ${!isHidden ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300 opacity-60 hover:opacity-100'}`}
                                >
                                    <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 transition-colors ${!isHidden ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-slate-50 text-slate-400'}`}>
                                        {!isHidden ? <Eye size={12} strokeWidth={3}/> : <EyeOff size={12}/>}
                                    </div>
                                    <div className="flex-1 truncate">
                                        <p className={`font-bold text-sm ${!isHidden ? 'text-emerald-800' : 'text-slate-500'}`}>{item.generic_name || item.article_name}</p>
                                        <p className={`text-[10px] uppercase font-bold tracking-widest mt-1 ${!isHidden ? 'text-emerald-600/70' : 'text-slate-400'}`}>{item.category}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

            </div>

        )}
      </div>
    </div>
  );
}
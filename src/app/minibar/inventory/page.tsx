"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, CheckCircle2, User, Save, Lock, Unlock,
  RefreshCw, Loader2, Smartphone, LayoutGrid, Users, Settings, Check, X, Wine, EyeOff, Eye, Search, AlertCircle, Home
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const TOTAL_VILLAS = 97;

// Get Local Month (YYYY-MM)
const getLocalMonth = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - offset);
    return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}`;
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
                    {t} <X size={14} className="cursor-pointer text-slate-300 hover:text-rose-500 ml-1" onClick={() => removeTag(t)} />
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

export default function MinibarInventoryAdmin() {
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'ASSIGNMENTS' | 'SETUP'>('MATRIX');
  const [isLoading, setIsLoading] = useState(true);
  
  // MONTHLY STATE
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonth());
  const [activePeriod, setActivePeriod] = useState('');
  const [invStatus, setInvStatus] = useState<'OPEN' | 'CLOSED'>('CLOSED');
  
  // Data
  const [catalog, setCatalog] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [hosts, setHosts] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [doubleVillasStr, setDoubleVillasStr] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Search State for Hosts
  const [hostSearch, setHostSearch] = useState('');
  const [showHostDropdown, setShowHostDropdown] = useState(false);

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

    // Use "-01" as a standard date to store allocations for the month
    const allocDate = `${selectedMonth}-01`;

    const [subRes, allocRes] = await Promise.all([
        supabase.from('hsk_villa_minibar_inventory').select('*').gte('logged_at', startOfMonth).lt('logged_at', startOfNextMonth),
        supabase.from('hsk_minibar_allocations').select('*').eq('date', allocDate)
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
        const sortedCatalog = catRes.data.sort((a, b) => getCategoryWeight(a.category) - getCategoryWeight(b.category) || a.article_name.localeCompare(b.article_name));
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
            setSelectedMonth(period); // Auto-jump to active period on load
        }
    }
  };

  // --- BUG FIX: BULLETPROOF SAVE FOR OPEN/CLOSE STATUS ---
  const toggleInventoryStatus = async () => {
      const newStatus = invStatus === 'OPEN' ? 'CLOSED' : 'OPEN';
      setIsSaving(true);
      
      // Wipe the old status and insert the new one to prevent unique constraint failures
      await supabase.from('hsk_constants').delete().eq('type', 'mb_inv_status');
      await supabase.from('hsk_constants').insert({ type: 'mb_inv_status', label: newStatus });
      setInvStatus(newStatus);
      
      // If we are opening, ensure the active period is safely set to the selected month
      if (newStatus === 'OPEN' && selectedMonth !== activePeriod) {
          await supabase.from('hsk_constants').delete().eq('type', 'mb_active_period');
          await supabase.from('hsk_constants').insert({ type: 'mb_active_period', label: selectedMonth });
          setActivePeriod(selectedMonth);
      }

      setIsSaving(false);
      toast.success(`Inventory is now ${newStatus}`);
  };

  // --- BUG FIX: BULLETPROOF ALLOCATION SAVING ---
  const handleSaveAllocations = async () => {
      setIsSaving(true);
      const toInsert = [];
      const allocDate = `${selectedMonth}-01`;

      for (const [host_id, villas] of Object.entries(allocations)) {
          // We only save hosts that have actual text in their assigned box
          if (villas.trim() !== '') {
              toInsert.push({ date: allocDate, host_id, villas });
          }
      }

      let hasError = false;

      // 1. Wipe ALL allocations for this specific month date to ensure a completely clean slate
      const { error: delErr } = await supabase.from('hsk_minibar_allocations').delete().eq('date', allocDate);
      if (delErr) { toast.error("DB Wipe Error: " + delErr.message); hasError = true; }

      // 2. Insert the fresh data from the screen
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
  
  // --- BUG FIX: RESTORED CORRECT HOST FILTERING ---
  // If it's not undefined, they are on the board! (Even if the string is empty, we keep them on board so they can type)
  const activeHostsForBoard = hosts.filter(h => allocations[h.host_id] !== undefined);
  const availableHostsToAdd = hosts.filter(h => allocations[h.host_id] === undefined);

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-6 pb-24 font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-6 mb-6 gap-6">
        <div>
           <h1 className="text-3xl font-bold tracking-tight">Minibar Inventory</h1>
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
           
           <button onClick={toggleInventoryStatus} disabled={isSaving} className={`flex items-center gap-2 px-6 py-3 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg transition-all ${invStatus === 'OPEN' && selectedMonth === activePeriod ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {isSaving ? <Loader2 size={16} className="animate-spin"/> : (invStatus === 'OPEN' && selectedMonth === activePeriod ? <Lock size={16}/> : <Unlock size={16}/>)}
              {invStatus === 'OPEN' && selectedMonth === activePeriod ? 'Lock Inventory' : 'Open This Month'}
           </button>
           
           <button onClick={copyMobileLink} className="flex items-center gap-2 px-4 py-3 bg-[#6D2158] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:bg-[#5a1b49] transition-all">
              <Smartphone size={16}/> App Link
           </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-6">
          <button onClick={() => setActiveTab('MATRIX')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'MATRIX' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158]'}`}>
              <LayoutGrid size={16}/> Matrix View
          </button>
          <button onClick={() => setActiveTab('ASSIGNMENTS')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'ASSIGNMENTS' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158]'}`}>
              <Users size={16}/> Set Monthly Allocations
          </button>
          <button onClick={() => setActiveTab('SETUP')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'SETUP' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158]'}`}>
              <Settings size={16}/> System Setup
          </button>
      </div>

      {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
      ) : activeTab === 'MATRIX' ? (
          
          /* --- LIVE MATRIX VIEW --- */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col max-h-[75vh] animate-in fade-in">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Period: {selectedMonth}</span>
                  <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">{submissions.length} / {activeVillaList.length} Records Logged</span>
              </div>
              <div className="overflow-auto flex-1 relative">
                  <table className="w-full text-center border-collapse text-xs whitespace-nowrap">
                      <thead className="sticky top-0 z-30 shadow-sm">
                          <tr>
                              <th className="sticky left-0 z-40 bg-slate-100 border-r border-b border-slate-200 p-3 text-left min-w-[200px] shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                  <span className="font-black uppercase text-slate-500 tracking-wider text-[10px]">Minibar Item</span>
                              </th>
                              {activeVillaList.map(v => (
                                  <th key={v} className={`p-2 border-r border-b border-slate-200 font-black ${submissions.some(s => s.villa_number === v) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>
                                      {v}
                                  </th>
                              ))}
                          </tr>
                      </thead>
                      <tbody>
                          {visibleCatalogItems.map(item => (
                              <tr key={item.article_number} className="hover:bg-blue-50 transition-colors">
                                  <td className="sticky left-0 z-20 bg-white border-r border-b border-slate-100 p-3 text-left shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                      <p className="font-bold text-slate-700 truncate max-w-[180px]">{item.generic_name || item.article_name}</p>
                                      <p className="text-[9px] text-slate-400 uppercase tracking-widest">{item.category}</p>
                                  </td>
                                  {activeVillaList.map(v => {
                                      const qty = matrixDict[v][item.article_number] || 0;
                                      return (
                                          <td key={v} className={`p-2 border-r border-b border-slate-50 ${qty > 0 ? 'font-black text-[#6D2158] bg-[#6D2158]/5' : 'text-slate-300'}`}>
                                              {qty > 0 ? qty : '-'}
                                          </td>
                                      );
                                  })}
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>

      ) : activeTab === 'ASSIGNMENTS' ? (

          /* --- ASSIGNMENTS VIEW --- */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col max-h-[75vh] animate-in fade-in">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-0 z-50">
                  <div>
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Monthly Attendant Allocations</h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">Type standard villa number. The app will split it automatically.</p>
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

              <div className="p-0 overflow-y-auto relative z-0">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
              
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
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[75vh]">
                  <div className="p-5 border-b border-slate-100 bg-slate-50">
                      <h3 className="font-bold text-[#6D2158] uppercase tracking-widest text-sm flex items-center gap-2"><Wine size={16}/> Active Items</h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">Select items to appear on the attendant's screen.</p>
                  </div>
                  <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
                      {catalog.map(item => {
                          const isHidden = hiddenItems.includes(item.article_number);
                          return (
                              <button 
                                  key={item.article_number} 
                                  onClick={() => toggleHiddenItem(item.article_number, isHidden)} 
                                  className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left group ${!isHidden ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300 opacity-60 hover:opacity-100'}`}
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
  );
}
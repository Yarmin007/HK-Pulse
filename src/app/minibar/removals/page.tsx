"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, Loader2, Save, X, Search, CheckCircle2, 
  Trash2, Bell, LayoutGrid, Users, Target, User, Plus, 
  RefreshCw, Send, MessageCircle, Box, AlertTriangle, ScanSearch
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

const TOTAL_VILLAS = 97;

const getLocalMonth = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    const str = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return str.substring(0, 7);
};

// --- CUSTOM VILLA TAG INPUT ---
const VillaTagInput = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const tags = value.split(',').map(s => s.trim()).filter(Boolean);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const newTag = e.currentTarget.value.trim();
            if (newTag && !tags.includes(newTag)) onChange([...tags, newTag].join(', '));
            e.currentTarget.value = '';
        } else if (e.key === 'Backspace' && e.currentTarget.value === '' && tags.length > 0) {
            onChange(tags.slice(0, -1).join(', '));
        }
    };

    const removeTag = (tagToRemove: string) => onChange(tags.filter(t => t !== tagToRemove).join(', '));

    return (
        <div className="flex flex-wrap gap-2 items-center bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus-within:border-[#6D2158] focus-within:bg-white transition-all cursor-text min-h-[56px] shadow-inner">
            {tags.map(t => (
                <span key={t} className="flex items-center gap-1 bg-white border-2 border-slate-200 px-3 py-1.5 rounded-lg text-sm font-black text-[#6D2158] shadow-sm transition-all hover:border-rose-200 group">
                    {t} <X size={14} className="cursor-pointer text-slate-300 group-hover:text-rose-500 ml-1 transition-colors" onClick={() => removeTag(t)} />
                </span>
            ))}
            <input 
                type="text" 
                className="bg-transparent outline-none flex-1 min-w-[100px] font-bold text-sm text-slate-700" 
                placeholder={tags.length === 0 ? "Type Villa # & hit Enter..." : "Add..."}
                onKeyDown={handleKeyDown} 
                onBlur={(e) => {
                    const newTag = e.target.value.trim();
                    if (newTag && !tags.includes(newTag)) { onChange([...tags, newTag].join(', ')); e.target.value = ''; }
                }}
            />
        </div>
    );
};

export default function ExpiryRemovalsAdmin() {
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'ALLOCATIONS' | 'TARGETS'>('MATRIX');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonth());
  const [targets, setTargets] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [allocationOrder, setAllocationOrder] = useState<string[]>([]); 
  const [removals, setRemovals] = useState<any[]>([]);
  
  const [hosts, setHosts] = useState<any[]>([]);
  const [masterCatalog, setMasterCatalog] = useState<any[]>([]);
  
  // Search States
  const [hostSearch, setHostSearch] = useState('');
  const [showHostDropdown, setShowHostDropdown] = useState(false);
  const [assignedSearch, setAssignedSearch] = useState(''); 
  const [matrixSearch, setMatrixSearch] = useState(''); 
  const [catalogSearch, setCatalogSearch] = useState('');
  
  const [allBatches, setAllBatches] = useState<any[]>([]);
  const [doubleVillasStr, setDoubleVillasStr] = useState<string>('');

  const [notifyModal, setNotifyModal] = useState<{isOpen: boolean, host_id: string, name: string, msg: string}>({ isOpen: false, host_id: '', name: '', msg: '' });

  const dvList = useMemo(() => doubleVillasStr.split(',').map(s => s.trim()).filter(Boolean), [doubleVillasStr]);

  const activeVillaList = useMemo(() => {
      const list: string[] = [];
      for (let i = 1; i <= TOTAL_VILLAS; i++) {
          const v = String(i);
          if (dvList.includes(v)) { 
              list.push(`${v}-1`, `${v}-2`); 
          } else { 
              list.push(v); 
          }
      }
      return list;
  }, [dvList]);

  const parseVillas = useCallback((input: string, doubleVillas: string[]) => {
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
              if (!p.includes('-') && doubleVillas.includes(p)) { 
                  result.add(`${p}-1`); 
                  result.add(`${p}-2`); 
              } else { 
                  result.add(p); 
              }
          }
      }
      return Array.from(result).sort((a,b) => parseFloat(a.replace('-', '.')) - parseFloat(b.replace('-', '.')));
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    const [targetRes, allocRes, remRes, batchRes, masterRes, hostRes, constRes] = await Promise.all([
        supabase.from('hsk_expiry_targets').select('*').eq('month_period', selectedMonth),
        supabase.from('hsk_expiry_allocations').select('*').eq('month_period', selectedMonth).order('created_at', { ascending: true }),
        supabase.from('hsk_expiry_removals').select('*').eq('month_period', selectedMonth),
        supabase.from('hsk_expiry_batches').select('*').neq('status', 'Archived'),
        supabase.from('hsk_master_catalog').select('*').eq('is_minibar_item', true),
        supabase.from('hsk_hosts').select('*').neq('status', 'Resigned').order('full_name'),
        supabase.from('hsk_constants').select('*').eq('type', 'double_mb_villas').maybeSingle()
    ]);

    if (targetRes.data) setTargets(targetRes.data);
    if (remRes.data) setRemovals(remRes.data);
    if (hostRes.data) setHosts(hostRes.data);
    if (constRes.data) setDoubleVillasStr(constRes.data.label);
    if (masterRes.data) setMasterCatalog(masterRes.data);

    if (allocRes.data) {
        const allocMap: Record<string, string> = {};
        const order: string[] = [];
        allocRes.data.forEach(a => { 
            allocMap[a.host_id] = a.villas; 
            order.push(a.host_id);
        });
        setAllocations(allocMap);
        setAllocationOrder(order);
    } else { 
        setAllocations({}); 
        setAllocationOrder([]);
    }

    if (batchRes.data && masterRes.data) {
        const mappedBatches = batchRes.data.map(b => {
            const master = masterRes.data.find((m: any) => m.article_number === b.article_number);
            return { ...b, article_name: master?.generic_name || master?.article_name || b.article_number };
        });
        setAllBatches(mappedBatches);
    }

    setIsLoading(false);
  }, [selectedMonth]);

  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => { if (isMounted) fetchData(); }, [selectedMonth, isMounted, fetchData]);

  const handleSaveAllocations = async () => {
      setIsSaving(true);
      const now = Date.now();
      
      const toInsert = allocationOrder
          .filter(id => allocations[id] && allocations[id].trim() !== '')
          .map((host_id, idx) => ({ 
              month_period: selectedMonth, 
              host_id, 
              villas: allocations[host_id],
              created_at: new Date(now + (idx * 1000)).toISOString() 
          }));

      await supabase.from('hsk_expiry_allocations').delete().eq('month_period', selectedMonth);
      if (toInsert.length > 0) await supabase.from('hsk_expiry_allocations').insert(toInsert);
      
      toast.success(`Allocations saved for ${selectedMonth}!`);
      setIsSaving(false);
  };

  const handleAddBatchTarget = async (batch: any) => {
      const exists = targets.find(t => t.article_number === batch.article_number && t.expiry_date === batch.expiry_date);
      if (exists) return toast.error("Batch already in target list!");

      const { error } = await supabase.from('hsk_expiry_targets').insert({
          month_period: selectedMonth,
          article_number: batch.article_number,
          article_name: batch.article_name,
          expiry_date: batch.expiry_date
      });

      if (!error) { toast.success("Added Expiry Batch to Targets!"); fetchData(); }
  };

  const handleAddCatalogTarget = async (item: any, type: 'MISSING' | 'REFILL') => {
      const exists = targets.find(t => t.article_number === item.article_number && (t.expiry_date === type || (!t.expiry_date && type === 'MISSING')));
      if (exists) return toast.error(`Already active as a ${type} task!`);

      const { error } = await supabase.from('hsk_expiry_targets').insert({
          month_period: selectedMonth,
          article_number: item.article_number,
          article_name: item.generic_name || item.article_name,
          expiry_date: type === 'MISSING' ? null : type
      });

      if (!error) { toast.success(`Added ${type} Task!`); fetchData(); }
  };

  const handleRemoveTarget = async (id: string) => {
      await supabase.from('hsk_expiry_targets').delete().eq('id', id);
      fetchData();
  };

  const handleSendPush = async () => {
      await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              title: `Expiry Check Assigned!`,
              body: notifyModal.msg
          })
      });
      toast.success("Notification Sent!");
      setNotifyModal({ isOpen: false, host_id: '', name: '', msg: '' });
  };

  const sendWhatsAppLink = (hostName: string, villas: string) => {
      const appLink = `${window.location.origin}/minibar/inventory/mobile`;
      const firstName = hostName.split(' ')[0];
      const text = `*Expiry Audit Assigned* 🚨\n\nHi ${firstName},\nPlease check the following villas for expiring items this month:\n*Villas:* ${villas}\n\nTap here to open your task board and record the removals:\n${appLink}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const matrixDict = useMemo(() => {
      const dict: Record<string, any> = {};
      activeVillaList.forEach(v => dict[v] = { status: null, items: {} });
      
      removals.forEach(rem => {
          if (!dict[rem.villa_number]) dict[rem.villa_number] = { status: null, items: {} };
          
          dict[rem.villa_number].status = rem.status;
          if (rem.removal_data && Array.isArray(rem.removal_data)) {
              rem.removal_data.forEach((item: any) => {
                  const key = item.article_number; // Map precisely by article number now
                  dict[rem.villa_number].items[key] = {
                      removed: item.qty,
                      refilled: item.refilled_qty !== undefined ? item.refilled_qty : item.qty
                  };
              });
          }
      });
      return dict;
  }, [removals, activeVillaList]);

  // Safely collect all assigned villas to isolate unassigned records later
  const assignedVillasSet = useMemo(() => {
      const set = new Set<string>();
      Object.values(allocations).forEach(villasStr => {
          if (villasStr) {
              parseVillas(villasStr, dvList).forEach(v => set.add(v));
          }
      });
      return set;
  }, [allocations, dvList, parseVillas]);

  const groupedTargets = useMemo(() => {
      const map: Record<string, any> = {};
      targets.forEach(t => {
          if (!map[t.article_number]) {
              map[t.article_number] = { article_number: t.article_number, article_name: t.article_name, dates: [] };
          }
          if (t.expiry_date) {
              map[t.article_number].dates.push(t.expiry_date);
          }
      });
      return Object.values(map);
  }, [targets]);

  if (!isMounted) return null;

  const availableHostsToAdd = hosts.filter(h => allocations[h.host_id] === undefined);
  
  const filteredAllocationOrder = allocationOrder.filter(hostId => {
      const host = hosts.find(h => h.id === hostId || h.host_id === hostId);
      if (!host) return false;
      if (!assignedSearch) return true;
      return host.full_name.toLowerCase().includes(assignedSearch.toLowerCase()) || host.host_id.includes(assignedSearch);
  });

  const filteredMatrixOrder = allocationOrder.filter(hostId => {
      const host = hosts.find(h => h.id === hostId || h.host_id === hostId);
      if (!host) return false;
      if (!matrixSearch) return true;
      return host.full_name.toLowerCase().includes(matrixSearch.toLowerCase()) || host.host_id.includes(matrixSearch);
  });

  // Filter out batches that have already been added to current targets
  const availableBatches = allBatches.filter(b => !targets.some(t => t.article_number === b.article_number && t.expiry_date === b.expiry_date));

  return (
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-[#FDFBFD] font-antiqua text-[#6D2158] overflow-hidden">
      
      {/* HEADER */}
      <div className="flex-none flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 p-4 md:p-6 pb-4 gap-4 bg-[#FDFBFD] z-10">
        <div>
           <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2"><RefreshCw size={24}/> Expiry Removals</h1>
           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Audit & Tracking Matrix</p>
        </div>
        <div className="flex items-center bg-slate-50 p-2 rounded-xl border border-slate-200 gap-2">
           <Calendar size={16} className="text-slate-400 ml-2"/>
           <input type="month" className="bg-transparent text-sm font-bold text-[#6D2158] outline-none cursor-pointer p-1" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
        </div>
      </div>

      <div className="flex-none flex justify-between items-center px-4 md:px-6 py-4 bg-[#FDFBFD] z-10">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 w-full md:w-auto">
              <button onClick={() => setActiveTab('MATRIX')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'MATRIX' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158]'}`}><LayoutGrid size={16}/> Removal Matrix</button>
              <button onClick={() => setActiveTab('ALLOCATIONS')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'ALLOCATIONS' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158]'}`}><Users size={16}/> Allocations</button>
              <button onClick={() => setActiveTab('TARGETS')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'TARGETS' ? 'bg-[#6D2158] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158]'}`}><Target size={16}/> Target Items</button>
          </div>
      </div>

      <div className="flex-1 overflow-hidden px-4 md:px-6 pb-4 md:pb-6 relative flex flex-col min-h-0">
        {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
        ) : activeTab === 'MATRIX' ? (
            
            /* --- MATRIX TAB (CARD UI) --- */
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full w-full animate-in fade-in min-h-0">
                
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] transition-colors shadow-sm" 
                            placeholder="Filter attendants..." 
                            value={matrixSearch}
                            onChange={(e) => setMatrixSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap gap-4 items-center">
                        <span className="text-[10px] font-bold uppercase text-slate-400"><span className="text-slate-300 text-sm">●</span> Pending</span>
                        <span className="text-[10px] font-bold uppercase text-slate-400"><span className="text-amber-500 text-sm">●</span> Needs Refill</span>
                        <span className="text-[10px] font-bold uppercase text-slate-400"><span className="text-blue-500 text-sm">●</span> Refilled</span>
                        <span className="text-[10px] font-bold uppercase text-slate-400"><span className="text-emerald-500 text-sm">●</span> All OK</span>
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full shadow-sm border border-emerald-200">{removals.length} Villas Audited</span>
                    </div>
                </div>
                
                <div className="overflow-y-auto flex-1 custom-scrollbar p-4 md:p-6 space-y-6 bg-slate-50/50">
                    
                    {filteredMatrixOrder.map(hostId => {
                        const host = hosts.find(h => h.id === hostId || h.host_id === hostId);
                        if (!host) return null;
                        
                        const villasStr = allocations[hostId];
                        if (!villasStr) return null;
                        
                        const parsedVillas = parseVillas(villasStr, dvList);
                        if (parsedVillas.length === 0) return null;

                        // Calculate Host Aggregated Totals globally by Article Number
                        const itemAggregates: Record<string, { name: string, qty: number }> = {};

                        targets.forEach(t => {
                            if (!itemAggregates[t.article_number]) {
                                itemAggregates[t.article_number] = { name: t.article_name, qty: 0 };
                            }
                        });

                        parsedVillas.forEach(v => {
                            const villaData = matrixDict[v];
                            if (villaData && villaData.items) {
                                targets.forEach(t => {
                                    const key = t.article_number;
                                    if (villaData.items[key]) {
                                        const removed = villaData.items[key].removed || 0;
                                        itemAggregates[key].qty += removed;
                                    }
                                });
                            }
                        });

                        return (
                            <div key={hostId} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
                                {/* HOST HEADER */}
                                <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 border-b border-slate-100 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-[#6D2158]/10 text-[#6D2158] rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                                            {host.full_name.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-lg leading-tight">{host.full_name}</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 font-mono">SSL {host.host_id}</p>
                                        </div>
                                    </div>
                                    
                                    {/* PANTRY PULL LIST (Aggregated Totals) */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mr-2 flex items-center gap-1">
                                            <Box size={14}/> Total Items to Refill:
                                        </span>
                                        {Object.values(itemAggregates).every(v => v.qty === 0) ? (
                                            <span className="text-xs font-bold text-slate-300 italic">No items removed yet.</span>
                                        ) : (
                                            Object.values(itemAggregates).filter(item => item.qty > 0).map(item => (
                                                <div key={item.name} className="bg-rose-50 border border-rose-100 text-rose-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">
                                                    {item.qty}x {item.name}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* VILLAS GRID */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {parsedVillas.map(v => {
                                        const villaData = matrixDict[v];
                                        const status = villaData?.status;
                                        
                                        let bgClass = 'bg-slate-50 border-slate-200';
                                        let textClass = 'text-slate-500';
                                        let statusText = 'Pending';

                                        if (status === 'All OK') { 
                                            bgClass = 'bg-emerald-50 border-emerald-200'; 
                                            textClass = 'text-emerald-700'; 
                                            statusText = 'All OK';
                                        } else if (status === 'Removed') { 
                                            bgClass = 'bg-amber-50 border-amber-300 ring-2 ring-amber-100 shadow-md'; 
                                            textClass = 'text-amber-700'; 
                                            statusText = 'Needs Refill';
                                        } else if (status === 'Refilled') { 
                                            bgClass = 'bg-blue-50 border-blue-200 shadow-sm'; 
                                            textClass = 'text-blue-700'; 
                                            statusText = 'Refilled';
                                        }

                                        return (
                                            <div key={v} className={`p-3 rounded-xl border flex flex-col transition-colors ${bgClass}`}>
                                                <div className="flex justify-between items-center border-b border-black/5 pb-2 mb-2">
                                                    <span className={`font-black text-lg ${textClass}`}>V{v}</span>
                                                    <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white shadow-sm ${textClass}`}>{statusText}</span>
                                                </div>
                                                
                                                <div className="space-y-1">
                                                    {!status ? (
                                                        <p className="text-[10px] font-bold text-slate-300 italic text-center py-2">Waiting for audit...</p>
                                                    ) : status === 'All OK' ? (
                                                        <div className="flex items-center justify-center py-2 text-emerald-500 opacity-70">
                                                            <CheckCircle2 size={24}/>
                                                        </div>
                                                    ) : (
                                                        targets.map((t: any, idx: number) => {
                                                            const key = t.article_number;
                                                            const itemData = villaData?.items?.[key];
                                                            const removedQty = itemData?.removed || 0;
                                                            const refilledQty = itemData?.refilled || 0;
                                                            
                                                            if (removedQty > 0) {
                                                                const warning = status === 'Refilled' && refilledQty < removedQty;
                                                                return (
                                                                    <div key={`${key}_${idx}`} className={`flex justify-between items-center text-xs font-bold ${warning ? 'bg-red-50 text-red-600 px-1 -mx-1 rounded' : textClass}`}>
                                                                        <span className="truncate pr-2" title={t.article_name}>{t.article_name}</span>
                                                                        <span className="shrink-0 text-right">
                                                                            -{removedQty}
                                                                            {warning && <span className="block text-[8px] uppercase tracking-tighter -mt-0.5">Refilled: {refilledQty}</span>}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {filteredMatrixOrder.length === 0 && (
                        <div className="py-20 text-center text-slate-400 font-bold italic text-sm">
                            {allocationOrder.length === 0 ? "No allocations set for this month yet." : "No staff found matching search."}
                        </div>
                    )}

                    {/* UNASSIGNED CATCH-ALL */}
                    {Object.keys(matrixDict).filter(v => !assignedVillasSet.has(v) && matrixDict[v].status !== null).length > 0 && (
                        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4 mt-8">
                            <h3 className="font-bold text-rose-800 text-lg uppercase tracking-widest flex items-center gap-2">
                                <AlertTriangle size={20}/> Unassigned / Other Logs
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                {Object.keys(matrixDict).filter(v => !assignedVillasSet.has(v) && matrixDict[v].status !== null).map(v => {
                                    const vData = matrixDict[v];
                                    const status = vData?.status;
                                    
                                    let bgClass = 'bg-white border-slate-200';
                                    let textClass = 'text-slate-500';
                                    let statusText = 'Pending';

                                    if (status === 'All OK') { 
                                        bgClass = 'bg-emerald-50 border-emerald-200'; 
                                        textClass = 'text-emerald-700'; 
                                        statusText = 'All OK'; 
                                    } else if (status === 'Removed') { 
                                        bgClass = 'bg-amber-50 border-amber-300 ring-2 ring-amber-100 shadow-md'; 
                                        textClass = 'text-amber-700'; 
                                        statusText = 'Needs Refill'; 
                                    } else if (status === 'Refilled') { 
                                        bgClass = 'bg-blue-50 border-blue-200 shadow-sm'; 
                                        textClass = 'text-blue-700'; 
                                        statusText = 'Refilled'; 
                                    }

                                    return (
                                        <div key={v} className={`p-3 rounded-xl border flex flex-col transition-colors ${bgClass}`}>
                                            <div className="flex justify-between items-center border-b border-black/5 pb-2 mb-2">
                                                <span className={`font-black text-lg ${textClass}`}>V{v}</span>
                                                <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white shadow-sm ${textClass}`}>{statusText}</span>
                                            </div>
                                            <div className="space-y-1">
                                                {status === 'All OK' ? (
                                                    <div className="flex items-center justify-center py-2 text-emerald-500 opacity-70"><CheckCircle2 size={24}/></div>
                                                ) : (
                                                    targets.map((t: any, idx: number) => {
                                                        const key = t.article_number;
                                                        const itemData = vData?.items?.[key];
                                                        const removedQty = itemData?.removed || 0;
                                                        const refilledQty = itemData?.refilled || 0;
                                                        
                                                        if (removedQty > 0) {
                                                            const warning = status === 'Refilled' && refilledQty < removedQty;
                                                            return (
                                                                <div key={`${key}_${idx}`} className={`flex justify-between items-center text-xs font-bold ${warning ? 'bg-red-50 text-red-600 px-1 -mx-1 rounded' : textClass}`}>
                                                                    <span className="truncate pr-2" title={t.article_name}>{t.article_name}</span>
                                                                    <span className="shrink-0 text-right">
                                                                        -{removedQty}
                                                                        {warning && <span className="block text-[8px] uppercase tracking-tighter -mt-0.5">Refilled: {refilledQty}</span>}
                                                                    </span>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

        ) : activeTab === 'ALLOCATIONS' ? (
            
            /* --- ALLOCATIONS TAB --- */
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[75vh] animate-in fade-in min-h-0">
                
                {/* Header & Add User */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-50 shrink-0">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Assign Audit Villas</h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">Type standard villa number. The app will split it automatically.</p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-3.5 text-[#6D2158]" size={16}/>
                            <input 
                                type="text" 
                                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-[#6D2158]/20 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] shadow-sm" 
                                placeholder="Add Attendant..." 
                                value={hostSearch} 
                                onChange={(e) => { setHostSearch(e.target.value); setShowHostDropdown(true); }} 
                                onFocus={() => setShowHostDropdown(true)} 
                                onBlur={() => setTimeout(() => setShowHostDropdown(false), 200)} 
                            />
                            {showHostDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto z-[100]">
                                    {availableHostsToAdd.filter(h => h.full_name.toLowerCase().includes(hostSearch.toLowerCase()) || h.host_id.includes(hostSearch)).map(h => (
                                        <button key={h.id} onClick={() => { 
                                            setAllocations(prev => ({...prev, [h.host_id]: ''})); 
                                            setAllocationOrder(prev => [...prev, h.host_id]); 
                                            setHostSearch(''); 
                                            setShowHostDropdown(false); 
                                        }} className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-50 flex flex-col transition-colors">
                                            <span className="font-bold text-slate-700 text-sm">{h.full_name}</span>
                                            <span className="text-[10px] text-slate-400 font-mono uppercase">SSL {h.host_id}</span>
                                        </button>
                                    ))}
                                    {availableHostsToAdd.length === 0 && <div className="p-3 text-xs italic text-slate-400">No staff found.</div>}
                                </div>
                            )}
                        </div>

                        <button onClick={() => setNotifyModal({ isOpen: true, host_id: '', name: '', msg: "Please check your assigned villas for new tasks." })} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-500 shadow-md transition-all w-full sm:w-auto justify-center">
                            <Bell size={16}/> Notify Team
                        </button>
                        <button onClick={handleSaveAllocations} disabled={isSaving} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-500 shadow-md transition-all w-full sm:w-auto justify-center">
                            {isSaving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Save Grid
                        </button>
                    </div>
                </div>

                {/* Filter Grid */}
                <div className="p-4 bg-white border-b border-slate-100 shrink-0">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-slate-300 transition-colors" 
                            placeholder="Filter assigned staff..." 
                            value={assignedSearch}
                            onChange={(e) => setAssignedSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* Card Grid */}
                <div className="p-4 overflow-y-auto flex-1 min-h-0 custom-scrollbar bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {filteredAllocationOrder.map(hostId => {
                            const host = hosts.find(h => h.id === hostId || h.host_id === hostId);
                            if (!host) return null;

                            return (
                            <div key={hostId} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4 relative hover:shadow-md transition-shadow group">
                                
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-[#6D2158]/5 border border-[#6D2158]/10 rounded-full flex items-center justify-center text-[#6D2158] shadow-inner shrink-0">
                                            <User size={20}/>
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-800 text-base leading-tight">{host.full_name}</h4>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 font-mono">SSL {host.host_id}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => sendWhatsAppLink(host.full_name, allocations[hostId] || '')} className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors" title="Send WhatsApp Link">
                                            <MessageCircle size={16}/>
                                        </button>
                                        <button onClick={() => setNotifyModal({ isOpen: true, host_id: hostId, name: host.full_name, msg: `Please check your assigned villas for expiring items. Open the HK Pulse app to see the targets.` })} className="p-2 text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors" title="Send Push Notification">
                                            <Bell size={16}/>
                                        </button>
                                        <button onClick={() => { 
                                            const updated = {...allocations}; delete updated[hostId]; setAllocations(updated); 
                                            setAllocationOrder(prev => prev.filter(id => id !== hostId));
                                        }} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                                
                                <div className="flex-1 mt-2">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Assigned Villas</label>
                                    <VillaTagInput value={allocations[hostId] || ''} onChange={(newVal) => setAllocations({...allocations, [hostId]: newVal})} />
                                </div>
                            </div>
                        )})}
                        
                        {filteredAllocationOrder.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-400 font-bold italic text-sm">
                                {allocationOrder.length === 0 ? "No staff assigned yet. Use the search bar above to add." : "No matches found."}
                            </div>
                        )}
                    </div>
                </div>
            </div>

        ) : (
            /* --- TARGETS TAB --- */
            <div className="flex-1 flex flex-col min-h-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in h-full min-h-0">
                    
                    {/* CURRENT MONTH TARGETS */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full min-h-0 overflow-hidden">
                        <div className="p-5 border-b border-slate-100 bg-slate-50 shrink-0">
                            <h3 className="font-bold text-[#6D2158] uppercase tracking-widest text-sm flex items-center gap-2"><Target size={16}/> Target List: {selectedMonth}</h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-1">These items appear on the staff mobile screens for auditing.</p>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-3 bg-slate-50/50">
                            {targets.map(t => (
                                <div key={t.id} className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-sm group">
                                    <div>
                                        <span className="font-bold text-slate-800 text-sm">{t.article_name}</span>
                                        {t.expiry_date === 'REFILL' ? (
                                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1 block">Refill Task</span>
                                        ) : (!t.expiry_date || t.expiry_date === 'MISSING') ? (
                                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1 block">Missing Check</span>
                                        ) : (
                                            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-1 block">Exp: {format(parseISO(t.expiry_date), 'dd MMM yyyy')}</span>
                                        )}
                                    </div>
                                    <button onClick={() => handleRemoveTarget(t.id)} className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white flex items-center justify-center transition-all"><Trash2 size={14}/></button>
                                </div>
                            ))}
                            {targets.length === 0 && <p className="text-center text-slate-400 italic text-sm py-10">No targets set for this month.</p>}
                        </div>
                    </div>

                    {/* ITEM FINDER / BATCH SELECTOR */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full min-h-0 overflow-hidden">
                        <div className="p-5 border-b border-slate-100 bg-slate-50 shrink-0">
                            <h3 className="font-bold text-slate-800 uppercase tracking-widest text-sm flex items-center gap-2"><Search size={16}/> Available Items & Batches</h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-1">Select known batches, or search to add a missing/refill check.</p>
                            
                            <div className="relative w-full mt-4">
                                <ScanSearch className="absolute left-3 top-3 text-slate-400" size={16}/>
                                <input 
                                    type="text" 
                                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] transition-colors shadow-sm" 
                                    placeholder="Search catalog to add a task..." 
                                    value={catalogSearch}
                                    onChange={(e) => setCatalogSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-3 bg-slate-50/50">
                            
                            {/* IF SEARCHING -> SHOW CATALOG */}
                            {catalogSearch.length > 0 ? (
                                masterCatalog
                                    .filter(m => m.article_name.toLowerCase().includes(catalogSearch.toLowerCase()) || m.article_number.includes(catalogSearch))
                                    .filter(item => {
                                        const hasMissing = targets.some(t => t.article_number === item.article_number && (!t.expiry_date || t.expiry_date === 'MISSING'));
                                        const hasRefill = targets.some(t => t.article_number === item.article_number && t.expiry_date === 'REFILL');
                                        return !(hasMissing && hasRefill);
                                    })
                                    .map(item => {
                                        const hasMissing = targets.some(t => t.article_number === item.article_number && (!t.expiry_date || t.expiry_date === 'MISSING'));
                                        const hasRefill = targets.some(t => t.article_number === item.article_number && t.expiry_date === 'REFILL');
                                        
                                        return (
                                            <div key={item.article_number} className="p-4 bg-white border border-slate-200 rounded-xl hover:border-[#6D2158] hover:shadow-md transition-all flex flex-col gap-3 group">
                                                <div className="font-bold text-slate-800 text-sm">{item.generic_name || item.article_name}</div>
                                                <div className="flex gap-2">
                                                    {!hasMissing && <button onClick={() => handleAddCatalogTarget(item, 'MISSING')} className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase hover:bg-blue-100 transition-colors">Add Missing</button>}
                                                    {!hasRefill && <button onClick={() => handleAddCatalogTarget(item, 'REFILL')} className="flex-1 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase hover:bg-emerald-100 transition-colors">Add Refill</button>}
                                                </div>
                                            </div>
                                        );
                                })
                            ) : (
                                /* IF NOT SEARCHING -> SHOW KNOWN EXPIRY BATCHES */
                                availableBatches.length > 0 ? (
                                    availableBatches.sort((a,b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()).map(b => (
                                        <div key={b.id} className="p-4 bg-white border border-rose-100 rounded-xl hover:border-rose-300 hover:shadow-md transition-all flex items-center justify-between group">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-rose-900 text-sm">{b.article_name}</span>
                                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-1">Exp: {format(parseISO(b.expiry_date), 'dd MMM yyyy')}</span>
                                            </div>
                                            <button onClick={() => handleAddBatchTarget(b)} className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 group-hover:bg-rose-600 group-hover:text-white flex items-center justify-center transition-all shadow-sm active:scale-95"><Plus size={18}/></button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-slate-400 italic text-sm py-10">No available batches to add.</p>
                                )
                            )}
                        </div>
                    </div>

                </div>
            </div>
        )}
      </div>

      {/* PUSH NOTIFICATION MODAL */}
      {notifyModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95">
           <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
               <h3 className="text-lg font-black text-[#6D2158] mb-1">Notify Assigned Team</h3>
               <p className="text-xs text-slate-400 font-bold uppercase mb-4">Send Push Notification to all active devices</p>
               <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none h-32 resize-none mb-4 shadow-inner focus:border-[#6D2158] transition-colors" value={notifyModal.msg} onChange={e => setNotifyModal({...notifyModal, msg: e.target.value})} />
               <div className="flex gap-2">
                   <button onClick={() => setNotifyModal({isOpen: false, host_id: '', name: '', msg: ''})} className="flex-1 py-3 text-slate-500 font-bold bg-slate-100 hover:bg-slate-200 rounded-xl text-xs uppercase transition-colors">Cancel</button>
                   <button onClick={handleSendPush} className="flex-[1.5] py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs uppercase shadow-md flex justify-center items-center gap-2 transition-colors"><Send size={14}/> Send to All</button>
               </div>
           </div>
        </div>
      )}
    </div>
  );
}
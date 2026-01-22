"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, X, Wine, Wrench, Trash2, 
  Coffee, Droplet, Cookie, Beer, Zap,
  Calendar, UtensilsCrossed, Cloud, Baby, Box, List, 
  CheckCircle2, ArrowUpDown, Clock, MapPin, Send, Split,
  MoreHorizontal, AlertCircle, Check, User, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- CONFIG ---
const ICON_MAP: any = {
  'Coffee': Coffee, 'Droplet': Droplet, 'Beer': Beer, 
  'Wine': Wine, 'Cookie': Cookie, 'Zap': Zap,
  'Utensils': UtensilsCrossed, 'Cloud': Cloud, 'Baby': Baby
};

// --- TYPES ---
type RequestRecord = {
  id: string;
  villa_number: string;
  request_type: string;
  item_details: string;
  is_sent: boolean;
  is_posted: boolean; 
  is_done: boolean;
  request_time: string;
  created_at: string;
  attendant_name: string;
  guest_name?: string;     
  package_tag?: string;    
};

type MasterItem = {
  article_number: string;
  article_name: string;
  category: string;
  is_minibar_item: boolean;
  micros_name?: string;
  icon?: string;
};

// --- HELPERS ---
const getDaysArray = (centerDate: Date) => {
  const days = [];
  for (let i = -2; i <= 2; i++) {
    const d = new Date(centerDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
};

const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Analyze Meal Plan
const analyzePackage = (mp: string) => {
  const plan = (mp || '').toUpperCase();
  if (plan.includes('SA')) return { type: 'Saint', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (plan.includes('SI')) return { type: 'Sinner', color: 'bg-orange-100 text-orange-700 border-orange-200' };
  return { type: mp || 'Std', color: 'bg-slate-100 text-slate-500 border-slate-200' };
};

// Extract Main Name
const extractMainGuest = (fullString: string) => {
  if (!fullString) return 'Guest';
  const parts = fullString.split(/[\/&]/).map(s => s.trim());
  const main = parts.find(p => p.includes('Mr.') || p.includes('Mrs.') || p.includes('Dr.'));
  return main || parts[0];
};

export default function CoordinatorLog() {
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [masterCatalog, setMasterCatalog] = useState<MasterItem[]>([]);
  const [requesters, setRequesters] = useState<string[]>([]);
  
  // UI State
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPartialOpen, setIsPartialOpen] = useState(false);
  
  // Notification State
  const [toastMsg, setToastMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('All');

  // Date Picker Ref
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Forms
  const [villaNumber, setVillaNumber] = useState('');
  const [guestInfo, setGuestInfo] = useState<any>(null); // NEW: Store fetched guest data
  const [manualTime, setManualTime] = useState('');
  
  // Requester Search State
  const [requesterSearch, setRequesterSearch] = useState('');
  const [showRequesterSuggestions, setShowRequesterSuggestions] = useState(false);
  
  // Minibar Logic
  const [mbCart, setMbCart] = useState<{name: string, qty: number}[]>([]);
  const [mbCategory, setMbCategory] = useState('All');
  
  // Other Logic
  const [otherMode, setOtherMode] = useState<'Catalog' | 'Note'>('Catalog');
  const [otherCategory, setOtherCategory] = useState('All');
  const [otherCart, setOtherCart] = useState<{name: string, qty: number}[]>([]);
  const [customNote, setCustomNote] = useState('');

  // Partial Send Logic
  const [partialTarget, setPartialTarget] = useState<RequestRecord | null>(null);
  const [partialSelection, setPartialSelection] = useState<string[]>([]);

  // History Sort
  const [sortCol, setSortCol] = useState('time');
  const [sortAsc, setSortAsc] = useState(false);

  // --- INIT ---
  useEffect(() => { 
    fetchRecords(); 
    fetchCatalog();
    fetchSettings();
  }, [selectedDate]);

  // --- SMART GUEST FETCH ---
  useEffect(() => {
    const fetchGuest = async () => {
      if (!villaNumber || villaNumber.length < 1) { setGuestInfo(null); return; }
      
      const { data } = await supabase
        .from('hsk_daily_summary')
        .select('*')
        .eq('report_date', getTodayStr()) // Always look at TODAY for guest info
        .eq('villa_number', villaNumber)
        .maybeSingle();

      if (data) {
        const todayStr = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
        const isCheckout = data.status.includes('DEP') || (data.stay_dates && data.stay_dates.includes(todayStr));
        
        setGuestInfo({
          ...data,
          mainName: extractMainGuest(data.guest_name),
          pkg: analyzePackage(data.meal_plan),
          isCheckout
        });
        
        // Auto-fill requester if GEM name exists and field is empty
        if(data.gem_name && !requesterSearch) setRequesterSearch(data.gem_name);
      } else {
        setGuestInfo(null);
      }
    };
    const timer = setTimeout(fetchGuest, 400);
    return () => clearTimeout(timer);
  }, [villaNumber]);

  // --- FETCHING ---
  const fetchCatalog = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) {
        setMasterCatalog(data);
        const nonMb = data.filter((i: any) => !i.is_minibar_item);
        if(nonMb.length > 0) setOtherCategory(nonMb[0].category);
    }
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('hsk_constants').select('label').eq('type', 'requester').order('label');
    if (data) setRequesters(data.map((c: any) => c.label));
  };

  const fetchRecords = async () => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    const { data } = await supabase
      .from('hsk_daily_requests')
      .select('*')
      .gte('request_time', `${dateStr}T00:00:00`)
      .lte('request_time', `${dateStr}T23:59:59`)
      .order('request_time', { ascending: false });
      
    if (data) setRecords(data);
  };

  // --- ACTIONS ---
  const handleOpenModal = (type: 'Minibar' | 'Other') => {
    const now = new Date();
    setManualTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    setVillaNumber('');
    setGuestInfo(null);
    setMbCart([]); setOtherCart([]);
    setCustomNote('');
    setRequesterSearch(''); 
    
    if (type === 'Minibar') setIsMinibarOpen(true);
    else setIsOtherOpen(true);
  };

  const addToCart = (item: string, type: 'MB' | 'Other') => {
    const cart = type === 'MB' ? mbCart : otherCart;
    const setter = type === 'MB' ? setMbCart : setOtherCart;
    const existing = cart.find(i => i.name === item);
    if (existing) {
      setter(cart.map(i => i.name === item ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setter([...cart, { name: item, qty: 1 }]);
    }
  };

  const submitRequest = async (type: 'Minibar' | 'Other') => {
    if (!villaNumber) {
        showNotification('error', "Please enter a Villa Number");
        return;
    }

    let details = "";
    let reqType: string = type;
    let requester = requesterSearch || (guestInfo ? guestInfo.gem_name : "Guest");

    if (type === 'Minibar') {
       if (mbCart.length === 0) {
           showNotification('error', "Cart is empty");
           return;
       }
       details = mbCart.map(i => `${i.qty}x ${i.name}`).join('\n');
    } else {
       if (otherMode === 'Catalog') {
          if (otherCart.length === 0) {
              showNotification('error', "No items selected");
              return;
          }
          details = otherCart.map(i => `${i.qty}x ${i.name}`).join('\n');
          reqType = otherCategory === 'All' ? 'Guest Request' : otherCategory;
       } else {
          if (!customNote) {
              showNotification('error', "Please enter note details");
              return;
          }
          details = customNote;
          reqType = "General";
       }
    }

    const dateStr = selectedDate.toISOString().split('T')[0];
    const fullTimeStr = `${dateStr}T${manualTime}:00`;

    // 1. SAVE TO DAILY REQUESTS (Main Log)
    const payload = {
       villa_number: villaNumber,
       request_type: reqType,
       item_details: details,
       request_time: fullTimeStr,
       attendant_name: requester,
       guest_name: guestInfo ? guestInfo.mainName : '',
       package_tag: guestInfo?.pkg?.type || '',
       is_sent: false, is_posted: false, is_done: false
    };

    const { data: newReq, error } = await supabase
        .from('hsk_daily_requests')
        .insert(payload)
        .select()
        .single();

    if (error) {
        showNotification('error', "Database Error: " + error.message);
        return;
    }

    // 2. SAVE TO GUEST PROFILE (History)
    if (guestInfo?.id) {
        const historyEntry = {
            date: fullTimeStr,
            type: reqType,
            items: type === 'Minibar' ? mbCart : (otherMode === 'Catalog' ? otherCart : [{name: customNote, qty: 1}]),
            req_id: newReq.id
        };
        
        // Fetch current to append
        const { data: currentData } = await supabase.from('hsk_daily_summary').select('request_log').eq('id', guestInfo.id).single();
        const currentLog = currentData?.request_log && Array.isArray(currentData.request_log) ? currentData.request_log : [];
        
        await supabase
            .from('hsk_daily_summary')
            .update({ request_log: [historyEntry, ...currentLog] })
            .eq('id', guestInfo.id);
    }

    setIsMinibarOpen(false); 
    setIsOtherOpen(false);
    fetchRecords();
    showNotification('success', "Request Saved Successfully");
  };

  const deleteRecord = async (id: string) => {
    if(!confirm("Delete this log?")) return;
    setRecords(records.filter(r => r.id !== id));
    await supabase.from('hsk_daily_requests').delete().eq('id', id);
  };

  const toggleStatus = async (id: string, field: 'is_sent' | 'is_posted' | 'is_done') => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    const newValue = !record[field];
    setRecords(records.map(r => r.id === id ? { ...r, [field]: newValue } : r));
    await supabase.from('hsk_daily_requests').update({ [field]: newValue }).eq('id', id);
  };

  // --- PARTIAL SEND LOGIC ---
  const openPartialModal = (record: RequestRecord) => {
      setPartialTarget(record);
      const items = record.item_details.split(/\n|,/).map(s => s.trim()).filter(Boolean);
      setPartialSelection(items);
      setIsPartialOpen(true);
  };

  const submitPartial = async () => {
      if (!partialTarget) return;
      
      const allItems = partialTarget.item_details.split(/\n|,/).map(s => s.trim()).filter(Boolean);
      const sentItems = partialSelection;
      const pendingItems = allItems.filter(i => !sentItems.includes(i));

      if (sentItems.length === 0) {
          showNotification('error', "Select at least one item to send.");
          return;
      }

      // 1. Update current record to "Sent"
      await supabase.from('hsk_daily_requests').update({
          item_details: sentItems.join('\n'),
          is_sent: true
      }).eq('id', partialTarget.id);

      // 2. Create new record for pending items
      if (pendingItems.length > 0) {
          await supabase.from('hsk_daily_requests').insert({
              villa_number: partialTarget.villa_number,
              request_type: partialTarget.request_type,
              item_details: pendingItems.join('\n'),
              request_time: partialTarget.request_time,
              attendant_name: partialTarget.attendant_name,
              is_sent: false, is_posted: false, is_done: false
          });
      }

      setIsPartialOpen(false);
      fetchRecords();
      showNotification('success', "Partial Send Confirmed");
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
      setToastMsg({ type, text });
      setTimeout(() => setToastMsg(null), 3000);
  };

  // --- FILTERING ---
  const minibarItems = masterCatalog.filter(i => i.is_minibar_item);
  const minibarCats = ['All', ...Array.from(new Set(minibarItems.map(i => i.category))) as string[]];

  const amenityItems = masterCatalog.filter(i => !i.is_minibar_item);
  const amenityCats = Array.from(new Set(amenityItems.map(i => i.category)));

  const filteredRequesters = requesters.filter(r => r.toLowerCase().includes(requesterSearch.toLowerCase()));

  const visibleRecords = records.filter(r => {
      if (statusFilter === 'All') return true;
      if (statusFilter === 'Pending') return !r.is_done && !r.is_posted;
      if (statusFilter === 'Done') return r.is_done || r.is_posted;
      return true;
  });

  const sortedHistory = [...records].sort((a, b) => {
      let valA = sortCol === 'time' ? a.request_time : a.villa_number;
      let valB = sortCol === 'time' ? b.request_time : b.villa_number;
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  // --- RENDER GUEST CARD (Reusable) ---
  const GuestCard = () => {
      if (!guestInfo) return null;
      return (
        <div className={`mt-3 p-3 rounded-xl border-l-4 shadow-sm animate-in zoom-in-95 ${guestInfo.isCheckout ? 'bg-rose-50 border-rose-500' : 'bg-blue-50 border-blue-500'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <User size={14} className="text-slate-400"/>
                        {guestInfo.mainName}
                    </h3>
                    <p className="text-[10px] text-slate-400 ml-5">{guestInfo.guest_name}</p>
                </div>
                {guestInfo.pkg && (
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${guestInfo.pkg.color}`}>
                        {guestInfo.pkg.type}
                    </span>
                )}
            </div>
            {guestInfo.isCheckout && (
                <div className="mt-2 flex items-center gap-1 text-rose-600 font-bold text-[10px]">
                    <AlertTriangle size={12}/> CHECKOUT TODAY
                </div>
            )}
        </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#FDFBFD] font-antiqua text-[#6D2158] pb-32">
      
      {/* 1. TOP HEADER & CONTROLS */}
      <div className="bg-white shadow-sm sticky top-0 z-30 pb-2">
        <div className="px-4 pt-4 pb-2 flex justify-between items-center">
           <div>
             <h1 className="text-xl font-bold text-slate-800">Logbook</h1>
             <div className="flex items-center gap-2 mt-1">
                <button onClick={() => dateInputRef.current?.showPicker()} className="flex items-center gap-1 text-xs text-slate-500 font-bold uppercase bg-slate-100 px-2 py-1 rounded-lg">
                    <Calendar size={12}/> {selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </button>
                <input ref={dateInputRef} type="date" className="absolute opacity-0 w-0 h-0" onChange={(e) => setSelectedDate(new Date(e.target.value))}/>
             </div>
           </div>
           
           {/* ACTIONS */}
           <div className="flex gap-2">
                <button onClick={() => handleOpenModal('Minibar')} className="bg-rose-600 text-white px-3 py-2 rounded-lg font-bold uppercase text-[10px] flex items-center gap-1 shadow-md hover:bg-rose-700">
                    <Wine size={14}/> MB
                </button>
                <button onClick={() => handleOpenModal('Other')} className="bg-[#6D2158] text-white px-3 py-2 rounded-lg font-bold uppercase text-[10px] flex items-center gap-1 shadow-md hover:bg-[#5a1b49]">
                    <Wrench size={14}/> Req
                </button>
                <button onClick={() => setIsHistoryOpen(true)} className="p-2 bg-slate-100 rounded-lg text-slate-500 hover:text-[#6D2158]">
                    <List size={20}/>
                </button>
           </div>
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 no-scrollbar mt-1">
           {['All', 'Pending', 'Done'].map(f => (
               <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border transition-all whitespace-nowrap ${statusFilter === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}>
                  {f}
               </button>
           ))}
           <div className="w-px h-6 bg-slate-200 mx-1"></div>
           {getDaysArray(selectedDate).map((d, i) => {
             const isSelected = d.toDateString() === selectedDate.toDateString();
             return (
               <button key={i} onClick={() => setSelectedDate(d)} className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all whitespace-nowrap ${isSelected ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-400 border-slate-200'}`}>
                 {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
               </button>
             )
           })}
        </div>
      </div>

      {/* 2. MASONRY LIST */}
      <div className="p-3 columns-2 md:columns-3 lg:columns-4 xl:columns-6 gap-3 space-y-3">
         {visibleRecords.length === 0 && <div className="py-12 text-center text-slate-300 font-bold italic col-span-full">No requests found.</div>}
         {visibleRecords.map(r => (
            <div key={r.id} className={`break-inside-avoid rounded-xl border p-3 flex flex-col bg-white shadow-sm relative ${r.request_type === 'Minibar' ? 'border-rose-100' : 'border-amber-100'}`}>
               <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-slate-800">{r.villa_number}</span>
                      {r.package_tag?.includes('Saint') && <div className="w-2 h-2 rounded-full bg-emerald-500" title="Saint Pkg"></div>}
                      {r.package_tag?.includes('Sinner') && <div className="w-2 h-2 rounded-full bg-orange-500" title="Sinner Pkg"></div>}
                  </div>
                  <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase truncate max-w-[80px] ${r.request_type === 'Minibar' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                     {r.request_type}
                  </div>
               </div>
               
               {/* Items */}
               <div className="mb-3">
                   {r.item_details.split(/\n|,/).map((item, idx) => (
                       <div key={idx} className="flex items-start gap-1 text-[11px] font-bold text-slate-600 leading-tight mb-1">
                           <span className="text-slate-300 mt-0.5">•</span> {item.trim()}
                       </div>
                   ))}
               </div>
               
               <div className="mt-auto pt-2 border-t border-slate-50">
                  <div className="flex justify-between items-end mb-2">
                     <div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[80px]">{r.attendant_name}</p>
                        <p className="text-[9px] text-slate-400 font-bold">{new Date(r.request_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                     </div>
                     <button onClick={() => deleteRecord(r.id)} className="text-slate-200 hover:text-rose-500"><Trash2 size={14}/></button>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-1">
                    {r.request_type === 'Minibar' ? (
                        <>
                            {!r.is_sent ? (
                                <>
                                    <button onClick={() => openPartialModal(r)} className="flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase bg-slate-100 text-slate-500 hover:bg-slate-200">Part.</button>
                                    <button onClick={() => toggleStatus(r.id, 'is_sent')} className="flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase bg-blue-50 text-blue-600 hover:bg-blue-100">Send</button>
                                </>
                            ) : (
                                <button onClick={() => toggleStatus(r.id, 'is_sent')} className="flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase bg-blue-600 text-white">Sent</button>
                            )}
                            <button onClick={() => toggleStatus(r.id, 'is_posted')} className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase ${r.is_posted ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`}>Post</button>
                        </>
                    ) : (
                        <button onClick={() => toggleStatus(r.id, 'is_done')} className={`w-full py-1.5 rounded-lg text-[9px] font-bold uppercase ${r.is_done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {r.is_done ? 'Done' : 'Do'}
                        </button>
                    )}
                  </div>
               </div>
            </div>
         ))}
      </div>

      {/* --- MINIBAR MODAL --- */}
      {isMinibarOpen && (
         <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="bg-[#FDFBFD] w-full sm:w-[500px] h-[85vh] sm:rounded-3xl rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-10">
               <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center rounded-t-3xl">
                  <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2"><Wine size={20}/> Minibar</h3>
                  <button onClick={() => setIsMinibarOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500"><X size={18}/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex gap-3 mb-4">
                     <input type="number" placeholder="Villa" autoFocus className="w-24 p-3 bg-white border border-slate-200 rounded-xl text-center font-bold text-xl outline-none" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     <div className="flex-1 relative">
                        <input type="text" placeholder="Requested By..." className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none" 
                           value={requesterSearch} 
                           onChange={e => { setRequesterSearch(e.target.value); setShowRequesterSuggestions(true); }}
                           onFocus={() => setShowRequesterSuggestions(true)}
                        />
                        {showRequesterSuggestions && filteredRequesters.length > 0 && (
                           <div className="absolute top-full left-0 w-full bg-white border border-slate-100 shadow-xl rounded-xl mt-1 z-20 max-h-40 overflow-y-auto">
                              {filteredRequesters.map(r => (
                                 <div key={r} onClick={() => { setRequesterSearch(r); setShowRequesterSuggestions(false); }} className="p-3 text-sm font-bold text-slate-600 hover:bg-slate-50 border-b border-slate-50">{r}</div>
                              ))}
                           </div>
                        )}
                     </div>
                  </div>

                  {/* SMART GUEST CARD */}
                  <GuestCard />

                  {mbCart.length > 0 && (
                     <div className="flex flex-wrap gap-2 mb-4 bg-white p-2 rounded-xl border border-slate-100 mt-4">
                        {mbCart.map(i => (
                           <button key={i.name} onClick={() => setMbCart(mbCart.filter(c => c.name !== i.name))} className="bg-rose-600 text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 animate-in zoom-in">{i.qty} {i.name} <X size={10}/></button>
                        ))}
                     </div>
                  )}
                  
                  {/* CATEGORIES */}
                  <div className="flex flex-wrap gap-2 mb-4 mt-4">
                     {minibarCats.map((c: any) => (
                        <button key={c} onClick={() => setMbCategory(c)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border ${mbCategory === c ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border-slate-200 text-slate-400'}`}>{c}</button>
                     ))}
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pb-20">
                     {(mbCategory === 'All' ? minibarItems : minibarItems.filter(i => i.category === mbCategory)).map(item => (
                        <button key={item.article_number} onClick={() => addToCart(item.micros_name || item.article_name, 'MB')} className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-transform">
                           <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-500"><Wine size={14}/></div>
                           <span className="text-[9px] font-bold text-slate-600 text-center leading-tight line-clamp-2 h-6">{item.micros_name || item.article_name}</span>
                        </button>
                     ))}
                  </div>
               </div>
               <div className="p-4 bg-white border-t border-slate-100">
                  <button onClick={() => submitRequest('Minibar')} className="w-full bg-rose-600 text-white py-3 rounded-xl font-bold uppercase text-sm shadow-lg active:scale-95 transition-transform">Save Log</button>
               </div>
            </div>
         </div>
      )}

      {/* --- OTHER REQUEST MODAL --- */}
      {isOtherOpen && (
         <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="bg-[#FDFBFD] w-full sm:w-[500px] h-[85vh] sm:rounded-3xl rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-10">
               <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center rounded-t-3xl">
                  <h3 className="text-lg font-bold text-[#6D2158] flex items-center gap-2"><Wrench size={20}/> Request</h3>
                  <button onClick={() => setIsOtherOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500"><X size={18}/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex gap-2 mb-4">
                     <input type="number" placeholder="Villa" autoFocus className="w-24 p-3 bg-white border border-slate-200 rounded-xl text-center font-bold text-xl outline-none" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     <div className="flex-1 relative">
                        <input type="text" placeholder="Requested By..." className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none" 
                           value={requesterSearch} 
                           onChange={e => { setRequesterSearch(e.target.value); setShowRequesterSuggestions(true); }}
                           onFocus={() => setShowRequesterSuggestions(true)}
                        />
                        {showRequesterSuggestions && filteredRequesters.length > 0 && (
                           <div className="absolute top-full left-0 w-full bg-white border border-slate-100 shadow-xl rounded-xl mt-1 z-20 max-h-40 overflow-y-auto">
                              {filteredRequesters.map(r => (
                                 <div key={r} onClick={() => { setRequesterSearch(r); setShowRequesterSuggestions(false); }} className="p-3 text-sm font-bold text-slate-600 hover:bg-slate-50 border-b border-slate-50">{r}</div>
                              ))}
                           </div>
                        )}
                     </div>
                  </div>

                  <GuestCard />

                  <div className="flex bg-slate-200 p-1 rounded-xl mb-4 mt-4">
                     <button onClick={() => setOtherMode('Catalog')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${otherMode === 'Catalog' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500'}`}>Items</button>
                     <button onClick={() => setOtherMode('Note')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${otherMode === 'Note' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500'}`}>Note / Task</button>
                  </div>

                  {otherMode === 'Catalog' ? (
                     <>
                        {otherCart.length > 0 && (
                           <div className="flex flex-wrap gap-2 mb-4 bg-white p-2 rounded-xl border border-slate-100">
                              {otherCart.map(i => (
                                 <button key={i.name} onClick={() => setOtherCart(otherCart.filter(c => c.name !== i.name))} className="bg-[#6D2158] text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 animate-in zoom-in">{i.qty} {i.name} <X size={10}/></button>
                              ))}
                           </div>
                        )}
                        <div className="mb-4">
                           <select className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={otherCategory} onChange={e => setOtherCategory(e.target.value)}>
                              {amenityCats.map((c: any) => <option key={c} value={c}>{c}</option>)}
                           </select>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pb-20">
                           {(otherCategory === 'All' ? amenityItems : amenityItems.filter(i => i.category === otherCategory)).map(item => (
                              <button key={item.article_number} onClick={() => addToCart(item.article_name, 'Other')} className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-transform">
                                 <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500"><Box size={14}/></div>
                                 <span className="text-[9px] font-bold text-slate-600 text-center leading-tight line-clamp-2 h-6">{item.article_name}</span>
                              </button>
                           ))}
                        </div>
                     </>
                  ) : (
                     <textarea className="w-full h-40 p-4 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none resize-none" placeholder="Type details here..." value={customNote} onChange={e => setCustomNote(e.target.value)}/>
                  )}
               </div>
               <div className="p-4 bg-white border-t border-slate-100">
                  <button onClick={() => submitRequest('Other')} className="w-full bg-[#6D2158] text-white py-3 rounded-xl font-bold uppercase text-sm shadow-lg active:scale-95 transition-transform">Save Request</button>
               </div>
            </div>
         </div>
      )}

      {/* --- PARTIAL SEND MODAL --- */}
      {isPartialOpen && partialTarget && (
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
                  <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><Split size={20}/> Partial Dispatch</h3>
                  <p className="text-xs text-slate-500 mb-4">Select items to mark as <b>SENT</b>. Unselected items will remain <b>PENDING</b>.</p>
                  
                  <div className="space-y-2 mb-6">
                      {partialTarget.item_details.split(/\n|,/).map((item, i) => {
                          const itemStr = item.trim();
                          if(!itemStr) return null;
                          const isSelected = partialSelection.includes(itemStr);
                          return (
                              <button 
                                key={i} 
                                onClick={() => isSelected ? setPartialSelection(partialSelection.filter(x => x !== itemStr)) : setPartialSelection([...partialSelection, itemStr])}
                                className={`w-full p-3 rounded-xl flex items-center justify-between border font-bold text-sm transition-all ${isSelected ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-400'}`}
                              >
                                  {itemStr}
                                  {isSelected ? <CheckCircle2 size={18} className="text-blue-600"/> : <div className="w-4 h-4 rounded-full border-2 border-slate-200"/>}
                              </button>
                          )
                      })}
                  </div>
                  
                  <button onClick={submitPartial} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold uppercase text-sm shadow-lg mb-2">Confirm Dispatch</button>
                  <button onClick={() => setIsPartialOpen(false)} className="w-full py-3 text-slate-400 font-bold text-xs uppercase">Cancel</button>
              </div>
          </div>
      )}

      {/* --- HISTORY MODAL --- */}
      {isHistoryOpen && (
          <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-right-10">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><List size={20}/> Log History</h3>
                  <button onClick={() => setIsHistoryOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500"><X size={20}/></button>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-2">
                  {sortedHistory.map(r => (
                      <div key={r.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold text-slate-700 ${r.request_type === 'Minibar' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {r.villa_number}
                              </div>
                              <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase">{r.request_type} • {new Date(r.request_time).toLocaleDateString()}</p>
                                  <p className="text-xs font-bold text-slate-700 line-clamp-1">{r.item_details.replace(/\n/g, ', ')}</p>
                              </div>
                          </div>
                          <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded ${r.is_done || r.is_posted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                              {r.is_done || r.is_posted ? 'Done' : 'Pending'}
                          </span>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* --- TOAST --- */}
      {toastMsg && (
          <div className={`fixed top-4 right-4 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-5 z-[100] border-2 ${
              toastMsg.type === 'success' 
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
              : 'bg-rose-50 border-rose-100 text-rose-700'
          }`}>
              {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
              <span className="text-sm font-bold uppercase">{toastMsg.text}</span>
          </div>
      )}

    </div>
  );
}
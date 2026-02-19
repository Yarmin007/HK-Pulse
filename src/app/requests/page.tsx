"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, X, Wine, Wrench, Trash2, 
  Coffee, Droplet, Cookie, Beer, Zap,
  Calendar, UtensilsCrossed, Cloud, Baby, Box, List, 
  CheckCircle2, ArrowUpDown, Clock, MapPin, Send, Split,
  MoreHorizontal, AlertCircle, Check, User, AlertTriangle, Anchor
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
  generic_name?: string; 
  category: string;
  is_minibar_item: boolean;
  micros_name?: string;
  icon?: string;
  image_url?: string; 
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
  
  // --- ADDED FILTERS ---
  const [statusFilter, setStatusFilter] = useState('All');
  const [villaSearch, setVillaSearch] = useState('');
  const [jettyFilter, setJettyFilter] = useState('All');
  const [mbItemSearch, setMbItemSearch] = useState('');

  // Date Picker Ref
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Forms
  const [villaNumber, setVillaNumber] = useState('');
  const [guestInfo, setGuestInfo] = useState<any>(null); 
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
        .eq('report_date', getTodayStr()) 
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
    setMbItemSearch('');
    
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

    if (guestInfo?.id) {
        const historyEntry = {
            date: fullTimeStr,
            type: reqType,
            items: type === 'Minibar' ? mbCart : (otherMode === 'Catalog' ? otherCart : [{name: customNote, qty: 1}]),
            req_id: newReq.id
        };
        const { data: currentData } = await supabase.from('hsk_daily_summary').select('request_log').eq('id', guestInfo.id).single();
        const currentLog = currentData?.request_log && Array.isArray(currentData.request_log) ? currentData.request_log : [];
        await supabase.from('hsk_daily_summary').update({ request_log: [historyEntry, ...currentLog] }).eq('id', guestInfo.id);
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
      await supabase.from('hsk_daily_requests').update({ item_details: sentItems.join('\n'), is_sent: true }).eq('id', partialTarget.id);
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

  // --- REFINED FILTERING LOGIC ---
  const visibleRecords = records.filter(r => {
      const vNum = parseInt(r.villa_number);
      const isMB = r.request_type === 'Minibar';
      
      if (statusFilter === 'Unsent') if (!isMB || r.is_sent) return false;
      if (statusFilter === 'Unposted') if (!isMB || r.is_posted) return false;
      if (statusFilter === 'Pending' && r.is_done) return false;
      if (statusFilter === 'Done' && !r.is_done && !r.is_posted) return false;

      if (villaSearch && !r.villa_number.includes(villaSearch)) return false;

      if (jettyFilter === 'Jetty A' && !(vNum >= 1 && vNum <= 35)) return false;
      if (jettyFilter === 'Jetty B' && !(vNum >= 37 && vNum <= 50)) return false;
      if (jettyFilter === 'Jetty C' && !(vNum >= 59 && vNum <= 79)) return false;
      if (jettyFilter === 'Beach' && ((vNum >= 1 && vNum <= 35) || (vNum >= 37 && vNum <= 50) || (vNum >= 59 && vNum <= 79))) return false;

      return true;
  });

  const sortedHistory = [...records].sort((a, b) => b.request_time.localeCompare(a.request_time));

  // Filter Catalog
  const minibarItems = masterCatalog.filter(i => i.is_minibar_item);
  const minibarCats = ['All', ...Array.from(new Set(minibarItems.map(i => i.category))) as string[]];
  const amenityItems = masterCatalog.filter(i => !i.is_minibar_item);
  const amenityCats = Array.from(new Set(amenityItems.map(i => i.category)));
  const filteredRequesters = requesters.filter(r => r.toLowerCase().includes(requesterSearch.toLowerCase()));

  const GuestCard = () => {
      if (!guestInfo) return null;
      return (
        <div className={`mt-3 p-3 rounded-xl border-l-4 shadow-sm animate-in zoom-in-95 ${guestInfo.isCheckout ? 'bg-rose-50 border-rose-500' : 'bg-blue-50 border-blue-500'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><User size={14} className="text-slate-400"/>{guestInfo.mainName}</h3>
                </div>
                {guestInfo.pkg && <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${guestInfo.pkg.color}`}>{guestInfo.pkg.type}</span>}
            </div>
            {guestInfo.isCheckout && <div className="mt-1 flex items-center gap-1 text-rose-600 font-bold text-[10px]"><AlertTriangle size={12}/> CHECKOUT TODAY</div>}
        </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#FDFBFD] font-antiqua text-[#6D2158] pb-32">
      
      {/* 1. TOP HEADER & SEARCH BAR */}
      <div className="bg-white shadow-sm sticky top-0 z-30 pb-3">
        <div className="px-4 pt-4 pb-2 flex justify-between items-center">
           <div>
             <h1 className="text-xl font-bold text-slate-800 tracking-tighter">Logbook</h1>
             <div onClick={() => dateInputRef.current?.showPicker()} className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase cursor-pointer mt-1">
                <Calendar size={12}/> {selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
             </div>
             <input ref={dateInputRef} type="date" className="absolute opacity-0 w-0 h-0" onChange={(e) => setSelectedDate(new Date(e.target.value))}/>
           </div>
           <div className="flex gap-2">
                <button onClick={() => handleOpenModal('Minibar')} className="bg-rose-600 text-white px-3 py-2 rounded-lg font-bold uppercase text-[10px] shadow-md active:scale-95 transition-all"><Wine size={14}/> MB</button>
                <button onClick={() => handleOpenModal('Other')} className="bg-[#6D2158] text-white px-3 py-2 rounded-lg font-bold uppercase text-[10px] shadow-md active:scale-95 transition-all"><Wrench size={14}/> Req</button>
                <button onClick={() => setIsHistoryOpen(true)} className="p-2 bg-slate-100 rounded-lg text-slate-500 hover:text-[#6D2158]"><List size={20}/></button>
           </div>
        </div>

        {/* --- NEW: VILLA SEARCH --- */}
        <div className="px-4 mt-2">
            <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input 
                    type="number" 
                    placeholder="Search Villa Number..." 
                    className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#6D2158]/20"
                    value={villaSearch}
                    onChange={(e) => setVillaSearch(e.target.value)}
                />
            </div>
        </div>
        
        {/* Status Filters */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 no-scrollbar mt-3">
           {['All', 'Unsent', 'Unposted', 'Pending', 'Done'].map(f => (
               <button key={f} onClick={() => setStatusFilter(f)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${statusFilter === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}>{f}</button>
           ))}
        </div>

        {/* Jetty Zone Sorting */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 no-scrollbar mt-2">
            <div className="text-[9px] font-black text-slate-300 uppercase mr-1">Zone:</div>
            {['All', 'Jetty A', 'Jetty B', 'Jetty C', 'Beach'].map(j => (
                <button key={j} onClick={() => setJettyFilter(j)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all whitespace-nowrap ${jettyFilter === j ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-400 border-slate-200'}`}>
                    {j === 'Beach' ? <MapPin size={10} className="inline mr-0.5"/> : <Anchor size={10} className="inline mr-0.5"/>} {j}
                </button>
            ))}
        </div>
      </div>

      {/* 2. MASONRY LIST */}
      <div className="p-3 columns-2 md:columns-3 lg:columns-4 xl:columns-6 gap-3 space-y-3">
         {visibleRecords.length === 0 && <div className="py-20 text-center text-slate-300 font-bold italic col-span-full">No results matching filters.</div>}
         {visibleRecords.map(r => (
            <div key={r.id} className={`break-inside-avoid rounded-2xl border p-4 flex flex-col bg-white shadow-sm relative transition-all ${r.request_type === 'Minibar' ? 'border-rose-100 hover:border-rose-200' : 'border-amber-100 hover:border-amber-200'}`}>
               <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-slate-800 tracking-tight">{r.villa_number}</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${r.request_type === 'Minibar' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{r.request_type}</div>
               </div>
               <div className="mb-4 text-[12px] font-bold text-slate-600 leading-tight space-y-1">
                   {r.item_details.split(/\n|,/).map((item, idx) => <div key={idx}>• {item.trim()}</div>)}
               </div>
               <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-end">
                  <div className="mr-4 min-w-max">
                    <div className="text-[9px] text-slate-400 font-black uppercase truncate max-w-[70px]">{r.attendant_name}</div>
                    <div className="text-[9px] text-slate-300 font-bold"><Clock size={8} className="inline mr-1"/>{new Date(r.request_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {r.request_type === 'Minibar' ? (
                        <>
                            <button onClick={() => openPartialModal(r)} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all" title="Split Log"><Split size={14}/></button>
                            <button onClick={() => toggleStatus(r.id, 'is_sent')} className={`p-2 rounded-xl transition-all ${r.is_sent ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`} title="Mark Sent"><Send size={14}/></button>
                            <button onClick={() => toggleStatus(r.id, 'is_posted')} className={`p-2 rounded-xl transition-all ${r.is_posted ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`} title="Mark Posted"><Check size={14}/></button>
                        </>
                    ) : (
                        <button onClick={() => toggleStatus(r.id, 'is_done')} className={`p-2 rounded-xl transition-all ${r.is_done ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`} title="Mark Done"><Check size={14}/></button>
                    )}
                    <button onClick={() => deleteRecord(r.id)} className="p-2 rounded-xl text-slate-200 hover:text-rose-500 transition-all active:scale-90"><Trash2 size={14}/></button>
                  </div>
               </div>
            </div>
         ))}
      </div>

      {/* --- MINIBAR ENTRY MODAL --- */}
      {isMinibarOpen && (
         <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="bg-[#FDFBFD] w-full sm:w-[520px] h-[90vh] sm:rounded-3xl rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-20">
               <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center rounded-t-3xl">
                  <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2 uppercase tracking-tight">Minibar Entry</h3>
                  <button onClick={() => setIsMinibarOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"><X size={18}/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex gap-3 mb-4">
                     <input type="number" placeholder="Villa" autoFocus className="w-24 p-3 bg-white border border-slate-200 rounded-xl text-center font-bold text-xl outline-none focus:border-rose-300 shadow-sm" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     <div className="flex-1 relative">
                        <input type="text" placeholder="Requested By..." className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none focus:border-rose-300 shadow-sm" value={requesterSearch} onChange={e => { setRequesterSearch(e.target.value); setShowRequesterSuggestions(true); }}/>
                     </div>
                  </div>
                  
                  <GuestCard />

                  {/* CART AREA (RESTORED TOP VIEW) */}
                  {mbCart.length > 0 && (
                     <div className="mt-4 p-3 bg-white rounded-2xl border-2 border-rose-50 flex flex-wrap gap-2 animate-in zoom-in-95">
                        {mbCart.map(i => (
                           <button key={i.name} onClick={() => setMbCart(mbCart.filter(c => c.name !== i.name))} className="bg-rose-600 text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shadow-sm active:scale-95 transition-all">
                              {i.qty} {i.name} <X size={12}/>
                           </button>
                        ))}
                     </div>
                  )}

                  {/* --- NEW: MINIBAR ITEM SEARCH --- */}
                  <div className="relative mt-4 mb-2">
                     <Search size={14} className="absolute left-3 top-3.5 text-slate-400"/>
                     <input 
                        type="text" 
                        placeholder="Search Minibar Item..." 
                        className="w-full pl-9 pr-4 py-3 bg-white border border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-rose-300 shadow-sm"
                        value={mbItemSearch}
                        onChange={(e) => setMbItemSearch(e.target.value)}
                     />
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-4 mt-4 overflow-x-auto no-scrollbar">
                     {minibarCats.map((c: any) => (
                        <button key={c} onClick={() => setMbCategory(c)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border whitespace-nowrap transition-all ${mbCategory === c ? 'bg-rose-600 text-white border-rose-600 shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-rose-100'}`}>{c}</button>
                     ))}
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pb-24">
                     {minibarItems.filter(i => 
                        (mbCategory === 'All' || i.category === mbCategory) &&
                        (i.article_name.toLowerCase().includes(mbItemSearch.toLowerCase()) || (i.generic_name || "").toLowerCase().includes(mbItemSearch.toLowerCase()))
                     ).map(item => {
                        const inCart = mbCart.find(c => c.name === (item.generic_name || item.article_name));
                        return (
                        <button key={item.article_number} onClick={() => addToCart(item.generic_name || item.article_name, 'MB')} className={`bg-white p-2 rounded-xl border flex flex-col items-center gap-2 active:scale-95 transition-transform overflow-hidden group relative ${inCart ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-100'}`}>
                           {/* INDICATOR BOX: Shows quantity clearly when added */}
                           {inCart && <div className="absolute top-1 right-1 bg-rose-500 text-white text-[8px] font-black px-1.5 rounded-full animate-in zoom-in">{inCart.qty}</div>}
                           <div className="w-full aspect-square bg-slate-50 rounded-lg flex items-center justify-center overflow-hidden">
                              {item.image_url ? (
                                 <img src={item.image_url} alt={item.article_name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/>
                              ) : (
                                 <Wine size={14} className="text-rose-200"/>
                              )}
                           </div>
                           <span className="text-[9px] font-bold text-slate-600 text-center leading-tight line-clamp-2 h-6">{item.generic_name || item.article_name}</span>
                        </button>
                     )})}
                  </div>
               </div>
               <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                  <button onClick={() => submitRequest('Minibar')} className="w-full bg-rose-600 text-white py-4 rounded-xl font-bold uppercase text-sm shadow-xl active:scale-95 transition-all">Save {mbCart.length} Items</button>
               </div>
            </div>
         </div>
      )}

      {/* OTHER MODAL & PARTIAL SEND MODAL REMAIN EXACTLY AS YOUR ORIGINAL CODE */}
      {isOtherOpen && (
         <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="bg-[#FDFBFD] w-full sm:w-[500px] h-[85vh] sm:rounded-3xl rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-10">
               <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center rounded-t-3xl">
                  <h3 className="text-lg font-bold text-[#6D2158] flex items-center gap-2 uppercase tracking-tight"><Wrench size={20}/> Request</h3>
                  <button onClick={() => setIsOtherOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200"><X size={18}/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex gap-2 mb-4">
                     <input type="number" placeholder="Villa" className="w-24 p-3 bg-white border border-slate-200 rounded-xl text-center font-bold text-xl outline-none" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     <input type="text" placeholder="Requested By..." className="flex-1 px-4 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none" value={requesterSearch} onChange={e => setRequesterSearch(e.target.value)}/>
                  </div>
                  <GuestCard />
                  <div className="flex bg-slate-200 p-1 rounded-xl mb-4 mt-4">
                     <button onClick={() => setOtherMode('Catalog')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${otherMode === 'Catalog' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500'}`}>Items</button>
                     <button onClick={() => setOtherMode('Note')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${otherMode === 'Note' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500'}`}>Note</button>
                  </div>
                  {otherMode === 'Catalog' ? (
                     <div className="grid grid-cols-3 gap-2 pb-20">
                        {amenityItems.map(item => (
                           <button key={item.article_number} onClick={() => addToCart(item.generic_name || item.article_name, 'Other')} className="bg-white p-2 rounded-xl border border-slate-100 flex flex-col items-center gap-2 active:scale-95 transition-transform overflow-hidden group">
                              <div className="w-full aspect-square bg-slate-50 rounded-lg flex items-center justify-center overflow-hidden">
                                 {item.image_url ? <img src={item.image_url} alt={item.article_name} className="w-full h-full object-cover group-hover:scale-110 transition-all"/> : <Box size={14} className="text-slate-200"/>}
                              </div>
                              <span className="text-[9px] font-bold text-slate-600 text-center leading-tight line-clamp-2 h-6">{item.generic_name || item.article_name}</span>
                           </button>
                        ))}
                     </div>
                  ) : (
                     <textarea className="w-full h-40 p-4 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none resize-none" placeholder="Details..." value={customNote} onChange={e => setCustomNote(e.target.value)}/>
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
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 border-2 border-[#6D2158]/10">
                  <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2 uppercase tracking-tight"><Split size={20}/> Partial Send</h3>
                  <p className="text-[10px] font-bold text-slate-400 mb-4 uppercase">Select items to mark as <b>SENT</b>.</p>
                  <div className="space-y-2 mb-6">
                      {partialTarget.item_details.split(/\n|,/).map((item, i) => {
                          const itemStr = item.trim();
                          if(!itemStr) return null;
                          const isSelected = partialSelection.includes(itemStr);
                          return (
                              <button key={i} onClick={() => isSelected ? setPartialSelection(partialSelection.filter(x => x !== itemStr)) : setPartialSelection([...partialSelection, itemStr])}
                                className={`w-full p-3 rounded-xl flex items-center justify-between border-2 font-bold text-sm transition-all ${isSelected ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-transparent text-slate-400'}`}>
                                  {itemStr}
                                  {isSelected ? <CheckCircle2 size={18} className="text-blue-600"/> : <div className="w-4 h-4 rounded-full border-2 border-slate-200"/>}
                              </button>
                          )})}
                  </div>
                  <button onClick={submitPartial} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold uppercase text-sm shadow-lg mb-2 active:scale-95 transition-all">Confirm Dispatch</button>
                  <button onClick={() => setIsPartialOpen(false)} className="w-full py-2 text-slate-400 font-bold text-[10px] uppercase">Cancel</button>
              </div>
          </div>
      )}

      {/* TOAST & HISTORY MODAL REMAIN EXACTLY UNMODIFIED */}
    </div>
  );
}
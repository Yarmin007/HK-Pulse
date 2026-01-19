"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, X, Send, 
  Wine, Wrench, Trash2, Filter,
  Coffee, Droplet, Cookie, Beer, Zap,
  ArrowRight, Clock, CheckCircle2, User,
  Calendar, MapPin, Tag, UtensilsCrossed, Bell,
  Cloud, Baby, Box
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- ICONS & CONFIG ---
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
};

type MasterItem = {
  article_number: string;
  article_name: string;
  category: string;
  is_minibar_item: boolean;
  micros_name?: string;
  icon?: string;
};

// --- HELPER: DAYS ---
const getDaysArray = (centerDate: Date) => {
  const days = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(centerDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
};

const getVillaAttendant = (villa: string) => {
  const v = parseInt(villa);
  if (isNaN(v)) return "Duty";
  return v < 20 ? "Ali M." : v < 40 ? "Sarah" : "Team";
};

export default function CoordinatorLog() {
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [masterCatalog, setMasterCatalog] = useState<MasterItem[]>([]);
  const [requesters, setRequesters] = useState<string[]>([]);
  
  // UI State
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Date Picker Ref
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Forms
  const [villaNumber, setVillaNumber] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [selectedRequester, setSelectedRequester] = useState('');
  
  // Minibar Logic
  const [mbCart, setMbCart] = useState<{name: string, qty: number}[]>([]);
  const [mbCategory, setMbCategory] = useState('All');
  
  // Other Logic
  const [otherMode, setOtherMode] = useState<'Catalog' | 'Note'>('Catalog');
  const [otherCategory, setOtherCategory] = useState('Pillow Menu');
  const [otherCart, setOtherCart] = useState<{name: string, qty: number}[]>([]);
  const [customNote, setCustomNote] = useState('');

  // --- INIT ---
  useEffect(() => { 
    fetchRecords(); 
    fetchCatalog();
    fetchSettings();
  }, [selectedDate]);

  const fetchCatalog = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) setMasterCatalog(data);
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
    setMbCart([]); setOtherCart([]);
    setCustomNote('');
    setSelectedRequester('');
    
    if (type === 'Minibar') {
       setSelectedRequester(getVillaAttendant(villaNumber) || "Villa Attendant");
       setIsMinibarOpen(true);
    } else {
       setIsOtherOpen(true);
    }
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
    if (!villaNumber) return alert("Enter Villa Number");

    let details = "";
    // FIX: Explicitly type as string to allow overwriting with "General" or categories
    let reqType: string = type; 
    let requester = selectedRequester;

    if (type === 'Minibar') {
       if (mbCart.length === 0) return alert("Cart empty");
       details = mbCart.map(i => `${i.qty}x ${i.name}`).join(', ');
       if (!requester) requester = getVillaAttendant(villaNumber);
    } else {
       if (otherMode === 'Catalog') {
          if (otherCart.length === 0) return alert("Select items");
          details = otherCart.map(i => `${i.qty}x ${i.name}`).join(', ');
          reqType = otherCategory; // e.g., "Pillow Menu"
       } else {
          if (!customNote) return alert("Enter details");
          details = customNote;
          reqType = "General";
       }
       if (!requester) requester = "Guest"; 
    }

    const dateStr = selectedDate.toISOString().split('T')[0];
    const fullTimeStr = `${dateStr}T${manualTime}:00`;

    const payload = {
       villa_number: villaNumber,
       request_type: reqType,
       item_details: details,
       request_time: fullTimeStr,
       attendant_name: requester,
       is_sent: false, is_posted: false, is_done: false
    };

    // Optimistic UI
    const newRec = { ...payload, id: Math.random().toString(), created_at: new Date().toISOString() };
    setRecords([newRec as RequestRecord, ...records]);
    setIsMinibarOpen(false); setIsOtherOpen(false);

    await supabase.from('hsk_daily_requests').insert(payload);
    fetchRecords();
  };

  const deleteRecord = async (id: string) => {
    if(!confirm("Delete?")) return;
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

  // --- CATALOG FILTERING ---
  const minibarItems = masterCatalog.filter(i => i.is_minibar_item);
  const minibarCats = Array.from(new Set(minibarItems.map(i => i.category)));

  const amenityItems = masterCatalog.filter(i => !i.is_minibar_item && i.category === otherCategory);
  const amenityCats = Array.from(new Set(masterCatalog.filter(i => !i.is_minibar_item).map(i => i.category)));

  return (
    <div className="min-h-screen bg-[#FDFBFD] font-antiqua text-[#6D2158] pb-32">
      
      {/* 1. HEADER & DATE SCROLLER */}
      <div className="bg-white shadow-sm sticky top-0 z-30">
        <div className="px-4 pt-4 pb-2 flex justify-between items-center">
           <div>
             <h1 className="text-xl font-bold text-slate-800">Coordinator Log</h1>
             <p className="text-xs text-slate-400 font-bold uppercase">{selectedDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
           </div>
           <div className="relative">
              <button onClick={() => dateInputRef.current?.showPicker()} className="p-2 bg-slate-100 rounded-lg text-slate-500"><Calendar size={20}/></button>
              <input 
                ref={dateInputRef} type="date" className="absolute opacity-0 w-full h-full left-0 top-0 cursor-pointer" 
                onChange={(e) => setSelectedDate(new Date(e.target.value))}
              />
           </div>
        </div>
        
        {/* Date Scroller */}
        <div className="flex items-center gap-2 overflow-x-auto py-3 px-4 no-scrollbar border-b border-slate-100">
          {getDaysArray(selectedDate).map((d, i) => {
             const isSelected = d.toDateString() === selectedDate.toDateString();
             return (
               <button 
                 key={i} onClick={() => setSelectedDate(d)}
                 className={`flex-shrink-0 flex flex-col items-center justify-center w-12 h-14 rounded-xl transition-all ${isSelected ? 'bg-[#6D2158] text-white shadow-lg scale-105' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
               >
                 <span className="text-[9px] font-bold uppercase">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                 <span className="text-lg font-bold">{d.getDate()}</span>
               </button>
             )
          })}
        </div>
      </div>

      {/* 2. COMPACT GRID LIST */}
      <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
         {records.map(r => (
            <div key={r.id} className={`rounded-xl border p-3 flex flex-col justify-between bg-white shadow-sm relative ${r.request_type === 'Minibar' ? 'border-rose-100' : 'border-amber-100'}`}>
               
               <div className="flex justify-between items-start mb-2">
                  <span className="text-xl font-bold text-slate-800">{r.villa_number}</span>
                  <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${r.request_type === 'Minibar' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                     {r.request_type}
                  </div>
               </div>
               
               <p className="text-xs font-bold text-slate-600 line-clamp-2 leading-tight mb-2 h-8">{r.item_details}</p>
               
               <div className="flex items-end justify-between">
                  <div>
                     <p className="text-[9px] text-slate-400 font-bold uppercase">{r.attendant_name}</p>
                     <p className="text-[9px] text-slate-400 font-bold">{new Date(r.request_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                  </div>
                  <div className="flex gap-2">
                    {r.request_type === 'Minibar' ? (
                       <button onClick={() => toggleStatus(r.id, 'is_posted')} className={`text-[10px] font-bold px-2 py-1 rounded ${r.is_posted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {r.is_posted ? 'POSTED' : 'POST'}
                       </button>
                    ) : (
                       <button onClick={() => toggleStatus(r.id, 'is_done')} className={`text-[10px] font-bold px-2 py-1 rounded ${r.is_done ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          {r.is_done ? 'DONE' : 'DO'}
                       </button>
                    )}
                    <button onClick={() => deleteRecord(r.id)} className="text-slate-200 hover:text-rose-500"><Trash2 size={14}/></button>
                  </div>
               </div>
            </div>
         ))}
      </div>

      {/* 3. COMPACT BOTTOM ACTIONS */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 px-6 py-3 z-40 flex gap-4 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
         <button onClick={() => handleOpenModal('Minibar')} className="flex-1 bg-rose-600 text-white h-12 rounded-xl font-bold uppercase text-xs flex items-center justify-center gap-2 hover:bg-rose-700 active:scale-95 transition-all">
            <Wine size={18}/> Minibar
         </button>
         <button onClick={() => handleOpenModal('Other')} className="flex-1 bg-[#6D2158] text-white h-12 rounded-xl font-bold uppercase text-xs flex items-center justify-center gap-2 hover:bg-[#5a1b49] active:scale-95 transition-all">
            <Wrench size={18}/> Request
         </button>
      </div>

      {/* --- MINIBAR MODAL --- */}
      {isMinibarOpen && (
         <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="bg-[#FDFBFD] w-full sm:w-[500px] h-[90vh] sm:rounded-3xl rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-10">
               
               <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center rounded-t-3xl">
                  <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2"><Wine size={20}/> Minibar</h3>
                  <button onClick={() => setIsMinibarOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500"><X size={18}/></button>
               </div>

               <div className="flex-1 overflow-y-auto p-4">
                  {/* Villa & Time */}
                  <div className="flex gap-3 mb-4">
                     <input type="number" placeholder="Villa #" autoFocus className="w-20 p-3 bg-white border border-slate-200 rounded-xl text-center font-bold text-xl outline-none" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     <input type="time" className="flex-1 p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none" value={manualTime} onChange={e => setManualTime(e.target.value)}/>
                  </div>

                  {/* Cart */}
                  {mbCart.length > 0 && (
                     <div className="flex flex-wrap gap-2 mb-4">
                        {mbCart.map(i => (
                           <button key={i.name} onClick={() => setMbCart(mbCart.filter(c => c.name !== i.name))} className="bg-rose-600 text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 animate-in zoom-in">
                              {i.qty} {i.name} <X size={10}/>
                           </button>
                        ))}
                     </div>
                  )}

                  {/* Category Select (Replaces Scroll) */}
                  <div className="mb-4">
                     <select className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none appearance-none" value={mbCategory} onChange={e => setMbCategory(e.target.value)}>
                        <option value="All">All Categories</option>
                        {minibarCats.map((c: any) => <option key={c} value={c}>{c}</option>)}
                     </select>
                  </div>

                  {/* Grid */}
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
            <div className="bg-[#FDFBFD] w-full sm:w-[500px] h-[90vh] sm:rounded-3xl rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-10">
               
               <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center rounded-t-3xl">
                  <h3 className="text-lg font-bold text-[#6D2158] flex items-center gap-2"><Wrench size={20}/> Request</h3>
                  <button onClick={() => setIsOtherOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500"><X size={18}/></button>
               </div>

               <div className="flex-1 overflow-y-auto p-4">
                  {/* Top Inputs */}
                  <div className="flex gap-2 mb-4">
                     <input type="number" placeholder="Villa" autoFocus className="w-20 p-3 bg-white border border-slate-200 rounded-xl text-center font-bold text-xl outline-none" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     <select className="flex-1 p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none" value={selectedRequester} onChange={e => setSelectedRequester(e.target.value)}>
                        <option value="">Requested By...</option>
                        {requesters.map(r => <option key={r} value={r}>{r}</option>)}
                        <option value="Guest">Guest</option>
                     </select>
                  </div>

                  {/* Mode Toggle */}
                  <div className="flex bg-slate-200 p-1 rounded-xl mb-4">
                     <button onClick={() => setOtherMode('Catalog')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${otherMode === 'Catalog' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500'}`}>Items</button>
                     <button onClick={() => setOtherMode('Note')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${otherMode === 'Note' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500'}`}>Note / Task</button>
                  </div>

                  {otherMode === 'Catalog' ? (
                     <>
                        {/* Cart */}
                        {otherCart.length > 0 && (
                           <div className="flex flex-wrap gap-2 mb-4">
                              {otherCart.map(i => (
                                 <button key={i.name} onClick={() => setOtherCart(otherCart.filter(c => c.name !== i.name))} className="bg-[#6D2158] text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 animate-in zoom-in">
                                    {i.qty} {i.name} <X size={10}/>
                                 </button>
                              ))}
                           </div>
                        )}
                        
                        {/* Category Select */}
                        <div className="mb-4">
                           <select className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={otherCategory} onChange={e => setOtherCategory(e.target.value)}>
                              {amenityCats.map((c: any) => <option key={c} value={c}>{c}</option>)}
                           </select>
                        </div>

                        {/* Amenity Grid */}
                        <div className="grid grid-cols-3 gap-2 pb-20">
                           {amenityItems.map(item => (
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

    </div>
  );
}
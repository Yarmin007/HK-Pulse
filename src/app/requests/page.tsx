"use client";
import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, X, Send, 
  Wine, Wrench, Trash2, Filter,
  Coffee, Droplet, Cookie, Beer,
  ArrowRight, Clock, CheckCircle2, User,
  Calendar, ChevronLeft, ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

type MinibarItem = {
  id: string;
  name: string;
  category: string;
  icon: any;
  color: string;
};

// --- CONFIG ---
const MINIBAR_CATALOG: MinibarItem[] = [
  { id: '1', name: 'Coke', category: 'Drinks', icon: Coffee, color: 'text-red-600' },
  { id: '2', name: 'Sprite', category: 'Drinks', icon: Droplet, color: 'text-green-600' },
  { id: '3', name: 'Fanta', category: 'Drinks', icon: Droplet, color: 'text-orange-600' },
  { id: '4', name: 'Water (L)', category: 'Drinks', icon: Droplet, color: 'text-blue-600' },
  { id: '5', name: 'Water (S)', category: 'Drinks', icon: Droplet, color: 'text-cyan-600' },
  { id: '6', name: 'Beer', category: 'Alcohol', icon: Beer, color: 'text-amber-600' },
  { id: '7', name: 'Wine', category: 'Alcohol', icon: Wine, color: 'text-rose-600' },
  { id: '8', name: 'Chips', category: 'Snacks', icon: Cookie, color: 'text-yellow-600' },
  { id: '9', name: 'Nuts', category: 'Snacks', icon: Cookie, color: 'text-amber-700' },
];

const OTHER_TYPES = ["Maintenance", "Housekeeping", "Front Office", "IT"];

const getAttendant = (villa: string) => {
  const v = parseInt(villa);
  if (isNaN(v)) return "Duty";
  return v < 20 ? "Ali M." : v < 40 ? "Sarah" : "Team";
};

export default function CoordinatorLog() {
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  // Form
  const [mode, setMode] = useState<'Minibar' | 'Other'>('Minibar');
  const [villaNumber, setVillaNumber] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [cart, setCart] = useState<{name: string, qty: number}[]>([]);
  const [otherCategory, setOtherCategory] = useState('');
  const [customNote, setCustomNote] = useState('');

  // --- INIT ---
  useEffect(() => { fetchRecords(); }, [selectedDate]);

  const openModal = () => {
    const now = new Date();
    setManualTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    setVillaNumber('');
    setCart([]);
    setOtherCategory('');
    setCustomNote('');
    setIsModalOpen(true);
  };

  const fetchRecords = async () => {
    // Logic: Fetch ALL records for Selected Date OR any 'Pending' records from before (Carry Forward)
    const { data } = await supabase
      .from('hsk_daily_requests')
      .select('*')
      .order('request_time', { ascending: false });
      
    if (data) {
       const enriched = data.map((r: any) => ({
          ...r,
          attendant_name: getAttendant(r.villa_number)
       }));

       // Client-side filtering for complex "Carry Forward" logic
       const filtered = enriched.filter((r: RequestRecord) => {
          const rDate = r.request_time.split('T')[0];
          const isToday = rDate === selectedDate;
          
          // If Minibar: Show if Today OR (Before Today AND Not Posted)
          const isPendingMinibar = r.request_type === 'Minibar' && !r.is_posted && rDate < selectedDate;
          
          // If Other: Show if Today OR (Before Today AND Not Done)
          const isPendingOther = r.request_type !== 'Minibar' && !r.is_done && rDate < selectedDate;

          return isToday || isPendingMinibar || isPendingOther;
       });

       setRecords(filtered);
    }
  };

  // --- ACTIONS ---
  const addToCart = (itemName: string) => {
    const existing = cart.find(i => i.name === itemName);
    if (existing) {
      setCart(cart.map(i => i.name === itemName ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setCart([...cart, { name: itemName, qty: 1 }]);
    }
  };

  const submitRequest = async () => {
    if (!villaNumber) return alert("Enter Villa Number");

    let type: string = mode; 
    let details = "";

    if (mode === 'Minibar') {
       if (cart.length === 0) return alert("Cart empty");
       details = cart.map(i => `${i.qty}x ${i.name}`).join(', ');
    } else {
       if (!otherCategory) return alert("Select Category");
       type = otherCategory; 
       details = customNote || "General Request";
    }

    const fullTimeStr = `${selectedDate}T${manualTime}:00`;

    // --- FIX APPLIED HERE: Added 'id' property ---
    const newRecord = {
      id: Math.random().toString(), // Generates a temp ID to fix React Warning
      villa_number: villaNumber,
      request_type: type,
      item_details: details,
      request_time: fullTimeStr,
      is_sent: false,
      is_posted: false,
      is_done: false,
      created_at: new Date().toISOString(),
      attendant_name: getAttendant(villaNumber)
    };

    setRecords([newRecord as RequestRecord, ...records]);
    setIsModalOpen(false);

    await supabase.from('hsk_daily_requests').insert({
       villa_number: newRecord.villa_number,
       request_type: newRecord.request_type,
       item_details: newRecord.item_details,
       request_time: newRecord.request_time,
       is_sent: false,
       is_posted: false,
       is_done: false
    });
    fetchRecords();
  };

  const toggleStatus = async (id: string, field: 'is_sent' | 'is_posted' | 'is_done') => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    const newValue = !record[field as keyof RequestRecord];
    setRecords(records.map(r => r.id === id ? { ...r, [field]: newValue } : r));
    await supabase.from('hsk_daily_requests').update({ [field]: newValue }).eq('id', id);
  };

  const deleteRecord = async (id: string) => {
    if(!confirm("Delete this log?")) return;
    setRecords(records.filter(r => r.id !== id));
    await supabase.from('hsk_daily_requests').delete().eq('id', id);
  };

  // --- VIEW LOGIC ---
  const visibleRecords = records.filter(r => {
     const matchesSearch = r.villa_number.includes(searchQuery);
     const matchesType = filterType === 'All' || 
                        (filterType === 'Minibar' && r.request_type === 'Minibar') || 
                        (filterType === 'Other' && r.request_type !== 'Minibar');
     const matchesStatus = filterStatus === 'All' ||
                          (filterStatus === 'Pending' && (!r.is_posted && !r.is_done)) ||
                          (filterStatus === 'Done' && (r.is_posted || r.is_done));
     return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusColor = (r: RequestRecord) => {
     if (r.request_type === 'Minibar') {
        if (r.is_posted) return 'border-emerald-500 bg-emerald-50/50';
        if (r.is_sent) return 'border-blue-500 bg-blue-50/50';
        return 'border-rose-500 bg-white';
     } else {
        if (r.is_done) return 'border-slate-500 bg-slate-50';
        if (r.is_sent) return 'border-blue-500 bg-blue-50/50';
        return 'border-amber-500 bg-white';
     }
  };

  return (
    <div className="min-h-screen bg-[#FDFBFD] font-antiqua text-[#6D2158] pb-32">
      
      {/* 1. COMPACT HEADER & FILTERS */}
      <div className="sticky top-0 z-30 bg-white shadow-sm border-b border-slate-200">
         <div className="p-3 flex items-center justify-between gap-3">
            {/* Date Picker */}
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 cursor-pointer">
               <Calendar size={16} className="text-slate-500"/>
               <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-transparent text-sm font-bold text-slate-700 outline-none w-32"
               />
            </div>
            
            {/* Search */}
            <div className="flex-1 relative">
               <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
               <input 
                  type="text" 
                  placeholder="Search Villa..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-[#6D2158]"
               />
            </div>

            {/* Filter Toggle (Simple) */}
            <div className="flex bg-slate-100 rounded-lg p-1">
               <button onClick={() => setFilterType('All')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${filterType === 'All' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400'}`}>All</button>
               <button onClick={() => setFilterType('Minibar')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${filterType === 'Minibar' ? 'bg-white shadow-sm text-[#6D2158]' : 'text-slate-400'}`}>Mini</button>
               <button onClick={() => setFilterType('Other')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${filterType === 'Other' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-400'}`}>Other</button>
            </div>
         </div>
         
         {/* Status Filter Bar */}
         <div className="px-3 pb-2 flex gap-2">
            <button onClick={() => setFilterStatus('All')} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${filterStatus === 'All' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}>All</button>
            <button onClick={() => setFilterStatus('Pending')} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${filterStatus === 'Pending' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-400 border-slate-200'}`}>Pending</button>
            <button onClick={() => setFilterStatus('Done')} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${filterStatus === 'Done' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-200'}`}>Done</button>
         </div>
      </div>

      {/* 2. LOG LIST (COMPACT ROW STYLE) */}
      <div className="p-3 space-y-2">
         {visibleRecords.length === 0 && <div className="text-center py-12 text-slate-400 text-sm italic">No records found.</div>}
         
         {visibleRecords.map(record => (
            <div key={record.id} className={`bg-white rounded-lg shadow-sm border-l-4 p-3 flex gap-3 animate-in slide-in-from-bottom-2 ${getStatusColor(record)}`}>
               
               {/* Col 1: Villa & Time */}
               <div className="flex flex-col items-center justify-center w-14 border-r border-slate-100 pr-3">
                  <span className="text-xl font-bold text-slate-800">{record.villa_number}</span>
                  <span className="text-[10px] font-bold text-slate-400">{new Date(record.request_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
               </div>

               {/* Col 2: Details (Vertical Stack) */}
               <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                     <span className={`text-[9px] uppercase font-bold px-1.5 rounded-sm ${record.request_type === 'Minibar' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{record.request_type}</span>
                     <span className="text-[10px] text-slate-400 font-bold truncate">{record.attendant_name}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                     {record.item_details.split(', ').map((item, i) => (
                        <span key={i} className="text-sm font-bold text-slate-700 block truncate leading-tight">
                           {item.trim()}
                        </span>
                     ))}
                  </div>
               </div>

               {/* Col 3: Actions (Compact) */}
               <div className="flex flex-col items-end justify-between gap-2">
                  <button onClick={() => deleteRecord(record.id)} className="text-slate-300 hover:text-rose-400"><Trash2 size={14}/></button>
                  
                  <div className="flex gap-1">
                     <button 
                        onClick={() => toggleStatus(record.id, 'is_sent')}
                        className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${record.is_sent ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                     >
                        <Send size={14}/>
                     </button>
                     
                     {record.request_type === 'Minibar' ? (
                        <button 
                           onClick={() => toggleStatus(record.id, 'is_posted')}
                           className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${record.is_posted ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                        >
                           <CheckCircle2 size={14}/>
                        </button>
                     ) : (
                        <button 
                           onClick={() => toggleStatus(record.id, 'is_done')}
                           className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${record.is_done ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'}`}
                        >
                           <CheckCircle2 size={14}/>
                        </button>
                     )}
                  </div>
               </div>
            </div>
         ))}
      </div>

      {/* 3. FAB (COMPACT) */}
      <button onClick={openModal} className="fixed bottom-6 right-6 w-14 h-14 bg-[#6D2158] text-white rounded-full shadow-xl shadow-[#6D2158]/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40">
         <Plus size={28}/>
      </button>

      {/* 4. MODAL (CLEANER) */}
      {isModalOpen && (
         <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="bg-white w-full sm:w-[400px] h-[80vh] sm:h-auto sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-10">
               
               <div className="flex justify-between items-center p-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-700">New Request</h3>
                  <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400"/></button>
               </div>

               <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Top Inputs */}
                  <div className="flex gap-2">
                     <input 
                       type="number" placeholder="Villa #" autoFocus
                       className="w-20 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold text-xl outline-none focus:border-[#6D2158] h-12"
                       value={villaNumber} onChange={e => setVillaNumber(e.target.value)}
                     />
                     <input 
                       type="time" 
                       className="flex-1 bg-slate-50 border border-slate-200 rounded-xl text-center font-bold text-sm outline-none h-12"
                       value={manualTime} onChange={e => setManualTime(e.target.value)}
                     />
                  </div>

                  {/* Mode Tabs */}
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                     <button onClick={() => setMode('Minibar')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase ${mode === 'Minibar' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-400'}`}>Minibar</button>
                     <button onClick={() => setMode('Other')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase ${mode === 'Other' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-400'}`}>Other</button>
                  </div>

                  {mode === 'Minibar' ? (
                     <>
                        {cart.length > 0 && (
                           <div className="flex flex-wrap gap-2">
                              {cart.map(i => (
                                 <button key={i.name} onClick={() => { 
                                     setCart(cart.filter(c => c.name !== i.name)); 
                                 }} className="bg-[#6D2158] text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                                    {i.qty} {i.name} <X size={10}/>
                                 </button>
                              ))}
                           </div>
                        )}
                        <div className="grid grid-cols-4 gap-2">
                           {MINIBAR_CATALOG.map(item => (
                              <button key={item.id} onClick={() => addToCart(item.name)} className="aspect-square bg-slate-50 rounded-xl flex flex-col items-center justify-center gap-1 active:bg-slate-200">
                                 <item.icon size={18} className={item.color}/>
                                 <span className="text-[9px] font-bold text-slate-600 leading-none">{item.name}</span>
                              </button>
                           ))}
                        </div>
                     </>
                  ) : (
                     <>
                        <div className="grid grid-cols-2 gap-2">
                           {OTHER_TYPES.map(cat => (
                              <button key={cat} onClick={() => setOtherCategory(cat)} className={`py-3 rounded-xl border text-xs font-bold ${otherCategory === cat ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white border-slate-200 text-slate-500'}`}>
                                 {cat}
                              </button>
                           ))}
                        </div>
                        <textarea 
                           placeholder="Type details..." 
                           className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none"
                           value={customNote} onChange={e => setCustomNote(e.target.value)}
                        />
                     </>
                  )}
               </div>

               <div className="p-4 border-t border-slate-100">
                  <button onClick={submitRequest} className="w-full py-3 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-sm shadow-lg">Save</button>
               </div>
            </div>
         </div>
      )}

    </div>
  );
}
"use client";
import React, { useState, useEffect } from 'react';
import { 
  Coffee, ClipboardList, Calendar, CheckCircle2, 
  Receipt, AlertCircle, PackageMinus, X, Plus, Minus,
  Flame, Megaphone, User, ChevronLeft, ChevronRight,
  Filter, Image as ImageIcon, CheckSquare
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- CONFIGURATION: PRESETS ---
const MINIBAR_PRESETS = [
  { name: 'Coke', image: 'https://img.icons8.com/color/96/coke-bottle.png' },
  { name: 'Diet Coke', image: 'https://img.icons8.com/color/96/diet-coke.png' },
  { name: 'Sprite', image: 'https://img.icons8.com/color/96/sprite.png' },
  { name: 'Soda Water', image: 'https://img.icons8.com/color/96/sparkling-water.png' },
  { name: 'Heineken', image: 'https://img.icons8.com/color/96/beer-bottle.png' },
  { name: 'Corona', image: 'https://img.icons8.com/color/96/beer.png' },
  { name: 'Red Wine', image: 'https://img.icons8.com/color/96/wine-bottle.png' },
  { name: 'White Wine', image: 'https://img.icons8.com/color/96/white-wine.png' },
  { name: 'Chips', image: 'https://img.icons8.com/color/96/potato-chips.png' },
  { name: 'Nuts', image: 'https://img.icons8.com/color/96/peanuts.png' },
  { name: 'Chocolate', image: 'https://img.icons8.com/color/96/chocolate-bar.png' },
  { name: 'Water (L)', image: 'https://img.icons8.com/color/96/bottle-of-water.png' },
];

const SERVICE_PRESETS = [
  "Make Up Room", "Turn Down Service", "Extra Towels", 
  "Extra Bed", "Baby Cot", "Buggy Request", 
  "Laundry Pick-up", "Ironing Board", "Amenities Refill"
];

// --- TYPES ---
type RequestItem = { id?: string; name: string; is_sent: boolean };
type HSKRequest = {
  id: string;
  room_number: string;
  request_type: 'Service' | 'Minibar'; // We standardized on 'Service'
  request_details: string;
  is_dispatched: boolean;
  is_posted: boolean;
  is_completed: boolean; // This matches your new DB column
  created_at: string;
  request_items: RequestItem[];
};

// --- HELPER: ATTENDANT ALLOCATION ---
const getAttendantInfo = (villaStr: string) => {
  const num = parseInt(villaStr, 10);
  if (isNaN(num)) return { name: "Duty Team", jetty: "General" };

  if (num >= 1 && num <= 35) return { name: "Elena Rodriguez", jetty: "Jetty A" };
  if (num >= 37 && num <= 50) return { name: "Marcus Thorne", jetty: "Jetty B" };
  if (num >= 59 && num <= 79) return { name: "Sarah Miller", jetty: "Jetty C" };
  return { name: "David Smith", jetty: "Beach Villas" };
};

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [requests, setRequests] = useState<HSKRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // FILTERS
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Completed'>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Service' | 'Minibar'>('All');

  // MODALS & INPUTS
  const [modalType, setModalType] = useState<'Service' | 'Minibar' | null>(null);
  const [roomInput, setRoomInput] = useState('');
  const [detailInput, setDetailInput] = useState('');
  
  // POS STATE
  const [posItems, setPosItems] = useState<Record<string, number>>({});

  // --- 1. FETCH DATA ---
  const fetchRequests = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('hsk_requests')
      .select(`*, request_items (id, item_name, is_sent)`)
      .order('created_at', { ascending: true });

    if (!error && data) {
      const formattedData = data.map((r: any) => ({
        ...r,
        request_type: r.request_type === 'Normal' ? 'Service' : r.request_type, // Handle legacy
        request_items: r.request_items.map((i: any) => ({
          id: i.id, name: i.item_name, is_sent: i.is_sent
        }))
      }));
      setRequests(formattedData);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  // --- 2. ACTIONS ---
  const handleDateChange = (days: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const updatePosItem = (name: string, delta: number) => {
    setPosItems(prev => {
      const current = prev[name] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [name]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [name]: next };
    });
  };

  const handleSaveRequest = async () => {
    if (!roomInput) return alert("Villa Number is required");
    const cleanRoom = roomInput.replace(/[^0-9]/g, '');

    const minibarString = Object.entries(posItems)
      .map(([name, qty]) => `${qty}x ${name}`)
      .join(', ');

    const newRequest = {
      room_number: cleanRoom,
      request_type: modalType,
      request_details: modalType === 'Service' ? detailInput : minibarString,
      is_dispatched: false, is_posted: false, is_completed: false, status: 'Pending'
    };

    const { data: requestData, error } = await supabase.from('hsk_requests').insert(newRequest).select().single();
    if (error) return alert(error.message);

    if (modalType === 'Minibar' && Object.keys(posItems).length > 0) {
      const itemsToInsert = Object.entries(posItems).map(([name, qty]) => ({
        request_id: requestData.id, 
        item_name: `${qty}x ${name}`, 
        is_sent: true
      }));
      await supabase.from('request_items').insert(itemsToInsert);
    }
    
    setModalType(null); setRoomInput(''); setDetailInput(''); setPosItems({});
    fetchRequests();
  };

  const updateStatus = async (id: string, field: string, val: boolean) => {
    await supabase.from('hsk_requests').update({ [field]: val }).eq('id', id);
    fetchRequests();
  };

  // --- DERIVED STATS ---
  const urgentCount = requests.filter(r => !r.is_dispatched && !r.is_completed).length;
  const overdueRequest = requests.find(r => !r.is_dispatched && !r.is_completed && new Date(r.created_at).getTime() < Date.now() - 1800000);

  return (
    <div className="min-h-screen pb-24 font-antiqua text-[#6D2158] bg-[#FDFBFD] p-4 md:p-8">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-6 gap-6">
        <div>
          <h1 className="text-4xl font-bold italic tracking-tight text-[#6D2158]">Operations Deck</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#6D2158]/60 mt-2 font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            System Live
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
          {/* Date Scroller */}
          <div className="flex items-center bg-white p-1 rounded-full shadow-sm border border-[#6D2158]/10 w-full sm:w-auto justify-between sm:justify-start">
            <button onClick={() => handleDateChange(-1)} className="p-2 hover:bg-slate-50 rounded-full text-[#6D2158]"><ChevronLeft size={16}/></button>
            <div className="flex items-center gap-2 px-4 border-x border-slate-100">
               <Calendar size={14} className="text-[#6D2158]/50" />
               <span className="text-xs font-bold uppercase text-[#6D2158] min-w-[90px] text-center">
                 {new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
               </span>
            </div>
            <button onClick={() => handleDateChange(1)} className="p-2 hover:bg-slate-50 rounded-full text-[#6D2158]"><ChevronRight size={16}/></button>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={() => setModalType('Service')} className="flex-1 sm:flex-none px-6 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white border border-[#6D2158]/20 text-[#6D2158] hover:bg-[#6D2158]/5 transition-colors shadow-sm">
              + Service
            </button>
            <button onClick={() => setModalType('Minibar')} className="flex-1 sm:flex-none px-6 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#6D2158] text-white hover:shadow-lg shadow-md transition-all">
              + Minibar
            </button>
          </div>
        </div>
      </div>

      {/* --- ALERTS & FILTERS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Urgent Alert */}
        <div className="bg-rose-50 rounded-xl p-4 border border-rose-100 flex items-center gap-4">
           <div className="p-3 bg-rose-100 text-rose-600 rounded-full shrink-0"><Flame size={20}/></div>
           <div>
              <h3 className="text-lg font-bold text-rose-800 leading-none">{overdueRequest ? `Room ${overdueRequest.room_number}` : `${urgentCount} Pending`}</h3>
              <p className="text-[10px] text-rose-600 font-bold uppercase tracking-wide mt-1">{overdueRequest ? 'Overdue Request' : 'Awaiting Dispatch'}</p>
           </div>
        </div>

        {/* Filter Bar */}
        <div className="lg:col-span-2 bg-white rounded-xl p-2 border border-slate-100 flex flex-col sm:flex-row items-center gap-2 justify-between">
           <div className="flex gap-1 bg-slate-50 p-1 rounded-lg w-full sm:w-auto overflow-x-auto">
             {['All', 'Pending', 'Completed'].map(f => (
               <button key={f} onClick={() => setStatusFilter(f as any)} className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${statusFilter === f ? 'bg-white shadow text-[#6D2158]' : 'text-slate-400'}`}>{f}</button>
             ))}
           </div>
           <div className="flex gap-1 w-full sm:w-auto justify-end">
             <button onClick={() => setTypeFilter(typeFilter === 'Service' ? 'All' : 'Service')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border flex items-center gap-2 transition-all ${typeFilter === 'Service' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-100 text-slate-400'}`}>
                <ClipboardList size={12}/> Service
             </button>
             <button onClick={() => setTypeFilter(typeFilter === 'Minibar' ? 'All' : 'Minibar')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border flex items-center gap-2 transition-all ${typeFilter === 'Minibar' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-100 text-slate-400'}`}>
                <Coffee size={12}/> Minibar
             </button>
           </div>
        </div>
      </div>

      {/* --- GRID --- */}
      {isLoading ? (
        <div className="text-center py-20 opacity-50 animate-pulse"><p className="text-lg font-bold italic">Loading Grid...</p></div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {requests
          .filter(r => r.created_at.startsWith(selectedDate) || (!r.is_completed && !r.is_posted))
          .filter(r => statusFilter === 'All' ? true : statusFilter === 'Pending' ? (!r.is_dispatched && !r.is_completed) : (r.is_completed || r.is_posted))
          .filter(r => typeFilter === 'All' ? true : r.request_type === typeFilter)
          .map((req) => {
            const isMinibar = req.request_type === 'Minibar';
            const attendant = getAttendantInfo(req.room_number);
            const isCarryOver = !req.created_at.startsWith(selectedDate);
            
            const theme = isMinibar ? { bg: 'bg-blue-50/50', border: 'border-blue-100', accent: 'text-blue-600', strip: 'bg-blue-500' } 
                                    : { bg: 'bg-amber-50/50', border: 'border-amber-100', accent: 'text-amber-600', strip: 'bg-amber-500' };

            return (
            <div key={req.id} className={`rounded-xl border ${isCarryOver ? 'border-rose-300 ring-2 ring-rose-500/10' : theme.border} ${theme.bg} shadow-sm relative group overflow-hidden`}>
                
                {isCarryOver && <div className="absolute top-0 right-0 bg-rose-500 text-white text-[8px] font-bold px-2 py-1 rounded-bl-lg z-10">Previous Day</div>}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.strip}`}></div>

                {/* Header */}
                <div className="pl-5 pr-4 pt-4 pb-2 flex justify-between items-start">
                    <div>
                        <span className="text-3xl font-bold text-[#6D2158] block leading-none">{req.room_number}</span>
                        <div className="mt-2">
                           <p className="text-xs font-bold text-slate-700">{attendant.name}</p>
                           <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{attendant.jetty}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className={`text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-wide inline-block bg-white border border-slate-100 ${theme.accent}`}>
                            {req.request_type}
                        </div>
                        <p className="text-[10px] font-bold text-slate-300 mt-1">
                            {new Date(req.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="pl-5 pr-4 py-3 min-h-[60px]">
                    {isMinibar ? (
                        <div className="flex flex-wrap gap-1.5">
                            {req.request_items?.map((item, idx) => (
                                <span key={idx} className="bg-white border border-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded-md shadow-sm">
                                    {item.name}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-700 italic font-medium leading-tight">"{req.request_details}"</p>
                    )}
                </div>

                {/* Actions */}
                <div className="p-2 bg-white/60 border-t border-slate-100/50 flex gap-2">
                    <button 
                        onClick={() => updateStatus(req.id, 'is_dispatched', !req.is_dispatched)}
                        disabled={req.is_completed || req.is_posted}
                        className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-all ${
                            req.is_dispatched 
                            ? 'bg-slate-800 text-white border-slate-800' 
                            : 'bg-white text-slate-400 border-slate-200 hover:border-[#6D2158] hover:text-[#6D2158]'
                        }`}
                    >
                        {req.is_dispatched ? 'Dispatched' : 'Dispatch'}
                    </button>

                    {isMinibar ? (
                        <button 
                            onClick={() => updateStatus(req.id, 'is_posted', !req.is_posted)}
                            disabled={!req.is_dispatched}
                            className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-all ${
                                req.is_posted 
                                ? 'bg-emerald-600 text-white border-emerald-600' 
                                : 'bg-white text-slate-400 border-slate-200 hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-50'
                            }`}
                        >
                            {req.is_posted ? 'Posted' : 'Post'}
                        </button>
                    ) : (
                        <button 
                            onClick={() => updateStatus(req.id, 'is_completed', !req.is_completed)}
                            disabled={!req.is_dispatched}
                            className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest border transition-all ${
                                req.is_completed 
                                ? 'bg-emerald-600 text-white border-emerald-600' 
                                : 'bg-white text-slate-400 border-slate-200 hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-50'
                            }`}
                        >
                            {req.is_completed ? 'Done' : 'Complete'}
                        </button>
                    )}
                </div>
            </div>
            );
          })}
      </div>
      )}

      {/* --- UNIVERSAL MODAL --- */}
      {modalType && (
        <div className="fixed inset-0 bg-[#6D2158]/40 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-lg ${modalType === 'Minibar' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                    {modalType === 'Minibar' ? <Coffee size={20}/> : <ClipboardList size={20}/>}
                 </div>
                 <h3 className="font-bold uppercase tracking-widest text-sm text-slate-700">New {modalType} Request</h3>
              </div>
              <button onClick={() => setModalType(null)} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-full transition-colors"><X size={24}/></button>
            </div>
            
            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto">
              <div className="mb-6">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Villa Number</label>
                <input 
                  type="number" 
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="e.g. 101" 
                  className="w-full bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:border-[#6D2158] outline-none text-4xl font-bold text-[#6D2158] text-center"
                  autoFocus
                />
              </div>

              {modalType === 'Service' ? (
                <div className="space-y-4">
                   <div>
                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Quick Presets</label>
                     <div className="flex flex-wrap gap-2">
                       {SERVICE_PRESETS.map(preset => (
                         <button 
                           key={preset}
                           onClick={() => setDetailInput(preset)}
                           className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${detailInput === preset ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white border-slate-200 text-slate-600 hover:border-[#6D2158]'}`}
                         >
                           {preset}
                         </button>
                       ))}
                     </div>
                   </div>
                   <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Custom Note</label>
                      <textarea 
                        value={detailInput}
                        onChange={(e) => setDetailInput(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg focus:border-[#6D2158] outline-none"
                        rows={2}
                        placeholder="Type request details..."
                      />
                   </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">POS Menu</label>
                  
                  {/* POS GRID */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {MINIBAR_PRESETS.map((item) => {
                      const count = posItems[item.name] || 0;
                      return (
                        <button 
                          key={item.name}
                          onClick={() => updatePosItem(item.name, 1)}
                          className={`relative p-3 rounded-2xl border transition-all flex flex-col items-center gap-2 group ${count > 0 ? 'border-[#6D2158] bg-[#6D2158]/5' : 'border-slate-100 bg-white hover:border-[#6D2158]/30'}`}
                        >
                          {count > 0 && <div className="absolute top-2 right-2 bg-[#6D2158] text-white text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md">{count}</div>}
                          <img src={item.image} alt={item.name} className="w-12 h-12 object-contain group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-bold text-slate-700 text-center leading-tight">{item.name}</span>
                          
                          {count > 0 && (
                             <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                               <div onClick={() => updatePosItem(item.name, -1)} className="p-1 bg-slate-200 rounded-full hover:bg-rose-100 hover:text-rose-600"><Minus size={12}/></div>
                             </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Action */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 shrink-0">
               <button 
                onClick={handleSaveRequest}
                className="w-full bg-[#6D2158] text-white py-4 rounded-xl font-bold uppercase tracking-widest text-sm shadow-xl shadow-[#6D2158]/20 hover:shadow-[#6D2158]/40 hover:-translate-y-1 transition-all"
              >
                Confirm Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
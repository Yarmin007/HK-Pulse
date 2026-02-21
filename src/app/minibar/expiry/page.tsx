"use client";
import React, { useState, useEffect } from 'react';
import { 
  Calendar, Plus, Trash2, Search, AlertTriangle, 
  CheckCircle, Clock, X, Save, Filter, ArrowRight, AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, differenceInDays, parseISO } from 'date-fns';

// --- TYPES ---
type MasterItem = {
  article_number: string;
  article_name: string;
  unit: string;
  image_url?: string;
  dates: ExpiryRecord[]; // Group dates inside the item
};

type ExpiryRecord = {
  id: string;
  expiry_date: string;
  status: string;
};

export default function ExpiryPage() {
  const [inventory, setInventory] = useState<MasterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MasterItem | null>(null);
  const [newDate, setNewDate] = useState('');

  // --- INIT ---
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    
    // 1. Get Master Items that HAVE expiry enabled in Settings
    const { data: masterData } = await supabase
      .from('hsk_master_catalog')
      .select('article_number, article_name, unit, image_url')
      .eq('has_expiry', true)
      .order('article_name');
    
    if (!masterData) { setIsLoading(false); return; }

    // 2. Get All Active Batches
    const { data: batchData } = await supabase
      .from('hsk_expiry_batches')
      .select('id, article_number, expiry_date, status')
      .neq('status', 'Archived');

    // 3. Merge Data: Group batches under their Master Item
    const mergedData = masterData.map(item => {
      const itemDates = batchData
        ?.filter(b => b.article_number === item.article_number)
        .map(b => ({ id: b.id, expiry_date: b.expiry_date, status: b.status }))
        .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()) || []; // Sort oldest date first

      return { ...item, dates: itemDates };
    });

    // 4. Sort Items by "Urgency" (Items with earliest expiry dates appear first)
    const sortedData = mergedData.sort((a, b) => {
      const dateA = a.dates[0]?.expiry_date || '2099-12-31';
      const dateB = b.dates[0]?.expiry_date || '2099-12-31';
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    setInventory(sortedData);
    setIsLoading(false);
  };

  // --- HANDLERS ---
  const openAddModal = (item: MasterItem) => {
    setSelectedItem(item);
    setNewDate('');
    setIsModalOpen(true);
  };

  const handleAddDate = async () => {
    if (!selectedItem || !newDate) return alert("Please select a date.");

    // Check Duplicate locally to prevent double entry
    const exists = selectedItem.dates.some(d => d.expiry_date === newDate);
    if (exists) {
      alert("This date is already tracked for this item.");
      return;
    }

    const { error } = await supabase.from('hsk_expiry_batches').insert({
      article_number: selectedItem.article_number,
      expiry_date: newDate,
      quantity: 0, // Ignored as per your request
      location: 'General', 
      status: 'Active'
    });
    
    if (error) {
      alert("Error adding date: " + error.message);
    } else {
      setIsModalOpen(false);
      fetchData(); // Refresh list
    }
  };

  const handleRemoveDate = async (id: string) => {
    if (!confirm("Remove this date from tracking?")) return;
    
    const { error } = await supabase.from('hsk_expiry_batches').delete().eq('id', id);
    if (!error) fetchData();
  };

  // --- HELPERS ---
  const getDaysRemaining = (dateStr: string) => {
    return differenceInDays(parseISO(dateStr), new Date());
  };

  // Logic: < 0 is Expired, < 60 days is Warning (2 Months), > 60 is Safe
  const getStatusColor = (days: number) => {
    if (days < 0) return 'bg-rose-100 text-rose-700 border-rose-200'; // Expired
    if (days <= 60) return 'bg-orange-100 text-orange-700 border-orange-200'; // Warning
    return 'bg-emerald-50 text-emerald-600 border-emerald-100'; // Good
  };

  // Filter View
  const filteredInventory = inventory.filter(item => 
    item.article_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.article_number.includes(searchQuery)
  );

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-[#6D2158] flex items-center gap-2">
            <Calendar className="text-rose-500"/> Expiry Dates
          </h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
            Tracking Active Batches
          </p>
        </div>
        
        {/* Search */}
        <div className="relative w-full md:w-64 mt-4 md:mt-0">
           <Search className="absolute left-3 top-3 text-slate-400" size={18}/>
           <input 
              type="text" 
              placeholder="Search Items..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158]"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
           />
        </div>
      </div>

      {/* ITEM GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredInventory.map(item => {
          // Determine Overall Item Status based on worst date
          const worstDate = item.dates[0]; // Dates are sorted, so first is soonest
          const worstDays = worstDate ? getDaysRemaining(worstDate.expiry_date) : 999;
          const isCritical = worstDays <= 60; // 2 Months Highlight

          return (
            <div key={item.article_number} className={`bg-white rounded-2xl border shadow-sm transition-all overflow-hidden flex flex-col ${isCritical && item.dates.length > 0 ? 'border-orange-200 shadow-orange-100' : 'border-slate-100 hover:shadow-md'}`}>
               
               {/* ITEM HEADER */}
               <div className="p-4 flex gap-4 items-center bg-slate-50/50 border-b border-slate-100">
                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 overflow-hidden flex-shrink-0">
                      {item.image_url ? (
                          <img src={item.image_url} className="w-full h-full object-cover"/>
                      ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300"><Calendar size={20}/></div>
                      )}
                  </div>
                  <div className="flex-1">
                      <h3 className="font-bold text-slate-700 text-sm leading-tight">{item.article_name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{item.unit}</p>
                  </div>
                  <button onClick={() => openAddModal(item)} className="w-8 h-8 flex items-center justify-center bg-[#6D2158] text-white rounded-lg shadow-md hover:bg-[#5a1b49] transition-all">
                      <Plus size={16}/>
                  </button>
               </div>

               {/* DATES LIST */}
               <div className="p-4 flex-1">
                  {item.dates.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-300 py-4">
                          <CheckCircle size={24} className="mb-2 opacity-20"/>
                          <span className="text-xs font-bold">No dates tracked</span>
                      </div>
                  ) : (
                      <div className="space-y-2">
                          {item.dates.map(date => {
                              const days = getDaysRemaining(date.expiry_date);
                              const style = getStatusColor(days);
                              
                              return (
                                  <div key={date.id} className={`flex justify-between items-center px-3 py-2 rounded-lg border ${style}`}>
                                      <div className="flex items-center gap-3">
                                          {/* Show Warning Icon if <= 60 Days */}
                                          {days <= 60 && <AlertCircle size={14} className={days < 0 ? 'text-rose-600' : 'text-orange-600'}/>}
                                          <div>
                                              <p className="text-xs font-black tracking-wide">{format(parseISO(date.expiry_date), 'dd MMM yyyy')}</p>
                                              <p className="text-[9px] uppercase font-bold opacity-80">
                                                  {days < 0 ? `${Math.abs(days)} Days Expired` : `${days} Days Remaining`}
                                              </p>
                                          </div>
                                      </div>
                                      <button onClick={() => handleRemoveDate(date.id)} className="opacity-60 hover:opacity-100 p-1 hover:bg-black/10 rounded">
                                          <Trash2 size={14}/>
                                      </button>
                                  </div>
                              );
                          })}
                      </div>
                  )}
               </div>
            </div>
          );
        })}
      </div>

      {/* ADD DATE MODAL */}
      {isModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
              <div className="bg-[#6D2158] p-4 flex justify-between items-center text-white">
                 <h3 className="font-bold text-sm">Add Expiry Date</h3>
                 <button onClick={() => setIsModalOpen(false)}><X size={18}/></button>
              </div>
              
              <div className="p-6">
                 <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden border border-slate-200">
                        {selectedItem.image_url && <img src={selectedItem.image_url} className="w-full h-full object-cover"/>}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-700">{selectedItem.article_name}</p>
                        <p className="text-[10px] text-slate-400">Adding new batch date</p>
                    </div>
                 </div>

                 <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Expiry Date</label>
                 <input 
                   type="date" 
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white transition-colors"
                   value={newDate}
                   onChange={e => setNewDate(e.target.value)}
                 />

                 <button 
                   onClick={handleAddDate} 
                   className="w-full mt-6 py-3 bg-[#6D2158] text-white rounded-xl font-bold uppercase shadow-lg hover:bg-[#5a1b49] transition-all flex justify-center gap-2"
                 >
                    <Save size={18}/> Save Date
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Package, Droplets, Plus, 
  ArrowRight, ArrowLeft, Calendar, 
  TrendingDown, TrendingUp, Layers, FileText,
  PieChart, Zap, Snail, Activity, MapPin, X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- TYPES ---
type MasterItem = {
  id: string;
  article_number: string;
  item_name: string;
  category: string;
  unit: string;
};

type MonthlyRecord = {
  id: string;
  month_year: string;
  master_id: string;
  store_name: string;
  added_stock: number;
  consumed: number;
  damaged: number;
  transferred: number;
  rack?: string;
  shelf_level?: string;
  expiry_date?: string;
};

type InventoryRow = {
  masterId: string;
  articleNumber: string;
  itemName: string;
  category: string;
  unit: string;
  openingStock: number; 
  added: number;
  consumed: number;
  others: number;
  closingStock: number;
  rack: string;
  level: string;
  expiry: string;
  recordId?: string;
};

export default function PerpetualInventory() {
  const [activeView, setActiveView] = useState<'Inventory' | 'Master List' | 'Insights'>('Inventory');
  const [activeStore, setActiveStore] = useState<'All' | 'HK Main Store' | 'HK Chemical Store'>('All');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [masterList, setMasterList] = useState<MasterItem[]>([]);
  const [allHistory, setAllHistory] = useState<MonthlyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'Transaction' | 'Create Article'>('Transaction');

  // --- SMART SEARCH STATE ---
  const [articleSearch, setArticleSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<MasterItem | null>(null);

  const [transData, setTransData] = useState({
    qty: 0,
    type: 'In', 
    expiry: '',
    rack: '',
    level: ''
  });
  const [newArticle, setNewArticle] = useState({
    article_number: '', item_name: '', category: '', unit: 'Pcs'
  });

  // --- HELPERS ---
  const getMonthKey = (d: Date) => d.toISOString().slice(0, 7); 

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsLoading(true);
    const { data: masters } = await supabase.from('hsk_master_catalog').select('*').order('item_name');
    if (masters) setMasterList(masters);

    let query = supabase.from('hsk_monthly_stock').select('*');
    if (activeStore !== 'All') query = query.eq('store_name', activeStore);
    const { data: history } = await query;
    if (history) setAllHistory(history);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, [activeStore]);

  // --- CALCULATE INVENTORY ---
  const inventoryRows = useMemo(() => {
    const targetMonthKey = getMonthKey(currentDate);
    const rows: InventoryRow[] = [];

    masterList.forEach(item => {
      const itemHistory = allHistory.filter(r => r.master_id === item.id);
      let opening = 0;
      let lastKnownRack = '', lastKnownLevel = '', lastKnownExpiry = '';
      let currentRecord: MonthlyRecord | undefined;

      itemHistory.forEach(rec => {
        if (rec.rack) lastKnownRack = rec.rack;
        if (rec.shelf_level) lastKnownLevel = rec.shelf_level;
        if (rec.expiry_date) lastKnownExpiry = rec.expiry_date;

        if (rec.month_year < targetMonthKey) {
           const netChange = (rec.added_stock || 0) - (rec.consumed || 0) - (rec.damaged || 0) - (rec.transferred || 0);
           opening += netChange;
        } else if (rec.month_year === targetMonthKey) {
           currentRecord = rec;
        }
      });

      const added = currentRecord?.added_stock || 0;
      const consumed = currentRecord?.consumed || 0;
      const others = (currentRecord?.damaged || 0) + (currentRecord?.transferred || 0);
      const closing = opening + added - consumed - others;
      const hasActivity = added > 0 || consumed > 0 || others > 0;
      const hasStock = closing > 0 || opening > 0;
      
      if (hasStock || hasActivity || searchQuery) {
        rows.push({
          masterId: item.id,
          articleNumber: item.article_number,
          itemName: item.item_name,
          category: item.category,
          unit: item.unit,
          openingStock: opening,
          added, consumed, others, closingStock: closing,
          rack: currentRecord?.rack || lastKnownRack,
          level: currentRecord?.shelf_level || lastKnownLevel,
          expiry: currentRecord?.expiry_date || lastKnownExpiry,
          recordId: currentRecord?.id
        });
      }
    });
    return rows.sort((a,b) => a.itemName.localeCompare(b.itemName));
  }, [masterList, allHistory, currentDate, searchQuery]);

  // --- SMART SEARCH FILTER ---
  const filteredSuggestions = useMemo(() => {
    if (!articleSearch) return [];
    const lower = articleSearch.toLowerCase();
    return masterList.filter(m => 
      m.item_name.toLowerCase().includes(lower) || 
      m.article_number.toLowerCase().includes(lower)
    ).slice(0, 5); // Limit to 5 suggestions
  }, [articleSearch, masterList]);

  // --- ACTIONS ---
  const handleSelectArticle = (item: MasterItem) => {
    setSelectedArticle(item);
    setArticleSearch(`${item.item_name} (#${item.article_number})`);
    setShowSuggestions(false);
    
    // Auto-fill location if known
    const row = inventoryRows.find(r => r.masterId === item.id);
    if(row) setTransData(prev => ({ ...prev, rack: row.rack, level: row.level }));
  };

  const handleSwitchToCreate = () => {
    setNewArticle({ ...newArticle, item_name: articleSearch, article_number: '' });
    setModalMode('Create Article');
    setShowSuggestions(false);
  };

  const handleSaveTransaction = async () => {
    if (!selectedArticle) return alert("Select an item");
    
    const targetMonthKey = getMonthKey(currentDate);
    const existingRow = inventoryRows.find(r => r.masterId === selectedArticle.id);
    const existingRecordId = existingRow?.recordId;
    const targetStore = activeStore === 'All' ? 'HK Main Store' : activeStore;
    const deltaQty = transData.qty;
    const updates: any = {};
    
    if (transData.type === 'In') updates.added_stock = (existingRow?.added || 0) + deltaQty;
    else if (transData.type === 'Consumed') updates.consumed = (existingRow?.consumed || 0) + deltaQty;
    else if (transData.type === 'Damaged') updates.damaged = (existingRow?.others || 0) + deltaQty;
    else if (transData.type === 'Transferred') updates.transferred = (existingRow?.others || 0) + deltaQty; 
    
    if (transData.rack) updates.rack = transData.rack;
    if (transData.level) updates.shelf_level = transData.level;
    if (transData.expiry) updates.expiry_date = transData.expiry;

    if (existingRecordId) {
      await supabase.from('hsk_monthly_stock').update(updates).eq('id', existingRecordId);
    } else {
      await supabase.from('hsk_monthly_stock').insert({
        month_year: targetMonthKey,
        master_id: selectedArticle.id,
        store_name: targetStore,
        opening_stock: 0, 
        added_stock: transData.type === 'In' ? deltaQty : 0,
        consumed: transData.type === 'Consumed' ? deltaQty : 0,
        damaged: transData.type === 'Damaged' ? deltaQty : 0,
        transferred: transData.type === 'Transferred' ? deltaQty : 0,
        rack: transData.rack,
        shelf_level: transData.level,
        expiry_date: transData.expiry
      });
    }

    setIsModalOpen(false);
    setTransData({ qty: 0, type: 'In', expiry: '', rack: '', level: '' });
    setArticleSearch('');
    setSelectedArticle(null);
    fetchData(); 
  };

  const handleCreateArticle = async () => {
    if(!newArticle.item_name || !newArticle.article_number) return alert("Details required");
    const { data, error } = await supabase.from('hsk_master_catalog').insert(newArticle).select().single();
    if (!error && data) {
       await fetchData(); // Refresh master list
       // Auto select the new item
       const newItem = data as MasterItem;
       setSelectedArticle(newItem);
       setArticleSearch(`${newItem.item_name} (#${newItem.article_number})`);
       setModalMode('Transaction');
    }
  };

  // --- STATS ---
  const fastMovers = inventoryRows.sort((a,b) => b.consumed - a.consumed).slice(0, 5).filter(i => i.consumed > 0);
  const totalIn = inventoryRows.reduce((s, i) => s + i.added, 0);
  const totalConsumed = inventoryRows.reduce((s, i) => s + i.consumed, 0);

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6 gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Control</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
            Perpetual • {activeStore}
          </p>
        </div>
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-100 p-1">
           <button onClick={() => setActiveView('Inventory')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 ${activeView === 'Inventory' ? 'bg-[#6D2158] text-white' : 'text-slate-400 hover:text-[#6D2158]'}`}><FileText size={14}/> Log</button>
           <button onClick={() => setActiveView('Insights')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 ${activeView === 'Insights' ? 'bg-[#6D2158] text-white' : 'text-slate-400 hover:text-[#6D2158]'}`}><PieChart size={14}/> Insights</button>
           <button onClick={() => setActiveView('Master List')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 ${activeView === 'Master List' ? 'bg-[#6D2158] text-white' : 'text-slate-400 hover:text-[#6D2158]'}`}><Layers size={14}/> Catalog</button>
        </div>
      </div>

      {activeView === 'Inventory' && (
      <>
        {/* CONTROLS */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
           {/* Store */}
           <div className="bg-white p-2 rounded-xl border border-slate-100 flex items-center justify-between">
              {['All', 'HK Main Store', 'HK Chemical Store'].map(s => (
                  <button key={s} onClick={() => setActiveStore(s as any)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase ${activeStore === s ? 'bg-slate-100 text-[#6D2158]' : 'text-slate-400'}`}>
                    {s === 'All' ? 'All' : s.replace('HK ', '')}
                  </button>
              ))}
           </div>
           {/* Month Slider */}
           <div className="bg-[#6D2158] text-white p-2 rounded-xl flex items-center justify-between shadow-lg shadow-[#6D2158]/20">
              <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()-1); setCurrentDate(d); }} className="p-2 hover:bg-white/10 rounded-full"><ArrowLeft size={18}/></button>
              <div className="text-center">
                 <span className="block text-xs font-bold uppercase opacity-70">Current View</span>
                 <span className="text-lg font-bold">{currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
              </div>
              <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()+1); setCurrentDate(d); }} className="p-2 hover:bg-white/10 rounded-full"><ArrowRight size={18}/></button>
           </div>
           {/* Stats */}
           <div className="grid grid-cols-2 gap-2">
              <div className="bg-white p-3 rounded-xl border border-slate-100 flex items-center gap-2 text-emerald-600">
                  <TrendingUp size={20}/><span className="text-xl font-bold">+{totalIn}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100 flex items-center gap-2 text-rose-600">
                  <TrendingDown size={20}/><span className="text-xl font-bold">-{totalConsumed}</span>
              </div>
           </div>
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-6 overflow-x-auto">
           <div className="p-4 border-b border-slate-100 flex justify-between items-center">
               <div className="relative w-64">
                  <Search className="absolute left-3 top-2.5 text-slate-300" size={16} />
                  <input type="text" placeholder="Search..." className="w-full pl-10 pr-4 py-2 border rounded-xl text-xs font-bold" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
               </div>
               <button onClick={() => { setModalMode('Transaction'); setIsModalOpen(true); }} className="px-6 py-2 bg-[#6D2158] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-[#6D2158]/40">
                  + Transaction
               </button>
           </div>
           
           <table className="w-full text-left min-w-[1000px]">
              <thead>
                 <tr className="bg-slate-50/50 text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
                    <th className="p-4">Article</th>
                    <th className="p-4">Location</th>
                    <th className="p-4 text-center">Opening</th>
                    <th className="p-4 text-center text-emerald-600">In</th>
                    <th className="p-4 text-center text-rose-600">Consumed</th>
                    <th className="p-4 text-center text-amber-600">Other</th>
                    <th className="p-4 text-center text-[#6D2158]">Closing</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {inventoryRows
                    .filter(r => r.itemName.toLowerCase().includes(searchQuery.toLowerCase()) || r.articleNumber.includes(searchQuery))
                    .map(row => (
                   <tr key={row.masterId} className="hover:bg-slate-50">
                      <td className="p-4">
                         <span className="block text-sm font-bold text-slate-800">{row.itemName}</span>
                         <span className="text-[10px] font-bold text-slate-400">#{row.articleNumber} • {row.unit}</span>
                      </td>
                      <td className="p-4">
                         {(row.rack || row.level) ? (
                            <div className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded w-fit">
                                <MapPin size={10}/> {row.rack || '-'}/{row.level || '-'}
                            </div>
                         ) : <span className="text-slate-300 text-xs">-</span>}
                      </td>
                      <td className="p-4 text-center font-bold text-slate-400">{row.openingStock}</td>
                      <td className="p-4 text-center font-bold text-emerald-600">+{row.added}</td>
                      <td className="p-4 text-center font-bold text-rose-600">-{row.consumed}</td>
                      <td className="p-4 text-center font-bold text-amber-600">-{row.others}</td>
                      <td className="p-4 text-center">
                         <span className="px-3 py-1 bg-[#6D2158]/10 text-[#6D2158] rounded-lg font-bold">
                            {row.closingStock}
                         </span>
                      </td>
                   </tr>
                 ))}
              </tbody>
           </table>
        </div>
      </>
      )}

      {/* --- MASTER LIST VIEW --- */}
      {activeView === 'Master List' && (
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
           <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Article Catalog</h2>
              <button onClick={() => { setModalMode('Create Article'); setIsModalOpen(true); }} className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider">+ New Article</button>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {masterList.map(item => (
                 <div key={item.id} className="p-4 border border-slate-100 rounded-xl hover:border-[#6D2158] group">
                    <div className="flex justify-between">
                       <span className="text-xs font-bold text-slate-400">#{item.article_number}</span>
                       <span className="text-[10px] font-bold uppercase bg-slate-100 px-2 rounded text-slate-500">{item.unit}</span>
                    </div>
                    <h3 className="text-lg font-bold mt-1 text-[#6D2158]">{item.item_name}</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1">{item.category}</p>
                 </div>
              ))}
           </div>
        </div>
      )}

      {/* --- INSIGHTS VIEW --- */}
      {activeView === 'Insights' && (
         <div className="mt-6">
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                <h3 className="text-lg font-bold text-emerald-700 flex items-center gap-2"><Zap size={20}/> Fast Moving (Top 5)</h3>
                <div className="space-y-3 mt-4">
                    {fastMovers.map((item, i) => (
                       <div key={item.masterId} className="flex justify-between items-center border-b border-slate-50 pb-2">
                           <div className="flex items-center gap-3">
                               <span className="text-lg font-bold text-emerald-200">0{i+1}</span>
                               <p className="text-sm font-bold text-slate-700">{item.itemName}</p>
                           </div>
                           <span className="font-bold text-emerald-600">{item.consumed} {item.unit}</span>
                       </div>
                    ))}
                    {fastMovers.length === 0 && <p className="text-sm italic text-slate-400">No consumption data for this month.</p>}
                </div>
             </div>
         </div>
      )}

      {/* --- SMART MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#6D2158]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 relative">
              <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500"><X size={20}/></button>

              <div className="mb-6">
                 <h3 className="text-lg font-bold text-[#6D2158]">{modalMode === 'Transaction' ? 'Record Transaction' : 'Register New Article'}</h3>
                 {modalMode === 'Transaction' && <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{currentDate.toLocaleDateString('en-GB', { month: 'long' })} Activity</p>}
              </div>
              
              {/* TRANSACTION FORM */}
              {modalMode === 'Transaction' ? (
                <div className="space-y-4">
                   
                   {/* SMART SEARCH FIELD */}
                   <div className="relative">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Search Article (Name or #)</label>
                      <input 
                         type="text" 
                         value={articleSearch} 
                         onChange={(e) => { setArticleSearch(e.target.value); setShowSuggestions(true); }}
                         className="w-full p-3 border rounded-xl font-bold mt-1 text-sm bg-slate-50 focus:border-[#6D2158] outline-none"
                         placeholder="Type to search..."
                      />
                      {/* Auto-Complete Dropdown */}
                      {showSuggestions && articleSearch.length > 0 && (
                        <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                           {filteredSuggestions.map(item => (
                              <div 
                                 key={item.id} 
                                 onClick={() => handleSelectArticle(item)}
                                 className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
                              >
                                 <p className="text-sm font-bold text-slate-700">{item.item_name}</p>
                                 <p className="text-[10px] text-slate-400">#{item.article_number}</p>
                              </div>
                           ))}
                           {filteredSuggestions.length === 0 && (
                              <button 
                                onClick={handleSwitchToCreate}
                                className="w-full p-3 text-left text-emerald-600 font-bold text-xs hover:bg-emerald-50"
                              >
                                + Create New Article: "{articleSearch}"
                              </button>
                           )}
                        </div>
                      )}
                   </div>

                   {selectedArticle && (
                   <>
                       <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                          <div>
                             <label className="text-[10px] font-bold text-slate-400 uppercase">Rack</label>
                             <input type="text" placeholder="A1" className="w-full p-3 border rounded-xl font-bold mt-1 text-sm" value={transData.rack} onChange={e => setTransData({...transData, rack: e.target.value})}/>
                          </div>
                          <div>
                             <label className="text-[10px] font-bold text-slate-400 uppercase">Level</label>
                             <input type="text" placeholder="2" className="w-full p-3 border rounded-xl font-bold mt-1 text-sm" value={transData.level} onChange={e => setTransData({...transData, level: e.target.value})}/>
                          </div>
                       </div>
                       <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-3">
                          <div>
                             <label className="text-[10px] font-bold text-slate-400 uppercase">Action</label>
                             <select className="w-full p-3 border rounded-xl font-bold mt-1 text-sm" onChange={e => setTransData({...transData, type: e.target.value})}>
                                <option value="In">Stock In (+)</option>
                                <option value="Consumed">Consumption (-)</option>
                                <option value="Damaged">Damaged (-)</option>
                                <option value="Transferred">Transfer Out (-)</option>
                             </select>
                          </div>
                          <div>
                             <label className="text-[10px] font-bold text-slate-400 uppercase">Quantity</label>
                             <input type="number" className="w-full p-3 border rounded-xl font-bold mt-1 text-sm" onChange={e => setTransData({...transData, qty: Number(e.target.value)})}/>
                          </div>
                       </div>
                       <button onClick={handleSaveTransaction} className="w-full py-3 bg-[#6D2158] text-white rounded-xl font-bold mt-4 uppercase tracking-wider text-xs animate-in zoom-in">Save Record</button>
                   </>
                   )}
                </div>
              ) : (
                /* CREATE NEW ARTICLE FORM */
                <div className="space-y-4">
                   <input type="text" placeholder="Article # (Unique)" className="w-full p-3 border rounded-xl font-bold text-sm" value={newArticle.article_number} onChange={e => setNewArticle({...newArticle, article_number: e.target.value})} />
                   <input type="text" placeholder="Item Name" className="w-full p-3 border rounded-xl font-bold text-sm" value={newArticle.item_name} onChange={e => setNewArticle({...newArticle, item_name: e.target.value})} />
                   <div className="grid grid-cols-2 gap-4">
                      <input type="text" placeholder="Category" className="w-full p-3 border rounded-xl font-bold text-sm" onChange={e => setNewArticle({...newArticle, category: e.target.value})} />
                      <input type="text" placeholder="Unit (Pcs)" className="w-full p-3 border rounded-xl font-bold text-sm" onChange={e => setNewArticle({...newArticle, unit: e.target.value})} />
                   </div>
                   <div className="flex gap-2 mt-4">
                      <button onClick={() => setModalMode('Transaction')} className="flex-1 py-3 text-slate-400 font-bold uppercase text-xs border border-slate-200 rounded-xl">Back</button>
                      <button onClick={handleCreateArticle} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-xs">Create Article</button>
                   </div>
                </div>
              )}
           </div>
        </div>
      )}

    </div>
  );
}
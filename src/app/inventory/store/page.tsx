"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Package, Plus, ArrowRight, ArrowLeft, Calendar, 
  Layers, FileText, PieChart, Zap, MapPin, X, Printer, PackagePlus, ArrowDownUp
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  opening_stock: number;
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
  storeName: string;
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
  const [activeView, setActiveView] = useState<'Inventory' | 'Insights'>('Inventory');
  const [activeStore, setActiveStore] = useState<'HK Main Store' | 'HK Chemical Store'>('HK Main Store');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [masterList, setMasterList] = useState<MasterItem[]>([]);
  const [allHistory, setAllHistory] = useState<MonthlyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'Initialize' | 'Log'>('Log');

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

  // --- HELPERS ---
  const getMonthKey = (d: Date) => d.toISOString().slice(0, 7); 

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsLoading(true);
    const { data: masters } = await supabase.from('hsk_master_catalog').select('id:article_number, article_number, item_name:article_name, category, unit').eq('is_minibar_item', false).order('article_name');
    if (masters) setMasterList(masters as MasterItem[]);

    const { data: history } = await supabase.from('hsk_monthly_stock').select('*');
    if (history) setAllHistory(history as MonthlyRecord[]);
    
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // --- CALCULATE INVENTORY FOR ACTIVE STORE ---
  const inventoryRows = useMemo(() => {
    const targetMonthKey = getMonthKey(currentDate);
    const storeHistory = allHistory.filter(h => h.store_name === activeStore);
    const rows: InventoryRow[] = [];

    // Group history by master_id
    const historyByMaster = new Map<string, MonthlyRecord[]>();
    storeHistory.forEach(rec => {
        if (!historyByMaster.has(rec.master_id)) historyByMaster.set(rec.master_id, []);
        historyByMaster.get(rec.master_id)!.push(rec);
    });

    // Only process items that actually have history in THIS store
    masterList.forEach(item => {
      const itemHistory = historyByMaster.get(item.id) || [];
      if (itemHistory.length === 0) return; // NOT INITIALIZED IN THIS STORE

      let opening = 0;
      let lastKnownRack = '', lastKnownLevel = '', lastKnownExpiry = '';
      let currentRecord: MonthlyRecord | undefined;

      itemHistory.forEach(rec => {
        if (rec.rack) lastKnownRack = rec.rack;
        if (rec.shelf_level) lastKnownLevel = rec.shelf_level;
        if (rec.expiry_date) lastKnownExpiry = rec.expiry_date;

        if (rec.month_year < targetMonthKey) {
           const netChange = (rec.opening_stock || 0) + (rec.added_stock || 0) - (rec.consumed || 0) - (rec.damaged || 0) - (rec.transferred || 0);
           opening = netChange; // Rollover opening stock
        } else if (rec.month_year === targetMonthKey) {
           currentRecord = rec;
           if (currentRecord.opening_stock !== undefined && currentRecord.opening_stock !== null) {
               opening = currentRecord.opening_stock;
           }
        }
      });

      const added = currentRecord?.added_stock || 0;
      const consumed = currentRecord?.consumed || 0;
      const others = (currentRecord?.damaged || 0) + (currentRecord?.transferred || 0);
      const closing = opening + added - consumed - others;
      
      rows.push({
        masterId: item.id,
        articleNumber: item.article_number,
        itemName: item.item_name,
        category: item.category,
        unit: item.unit,
        storeName: activeStore,
        openingStock: opening,
        added, consumed, others, closingStock: closing,
        rack: currentRecord?.rack || lastKnownRack,
        level: currentRecord?.shelf_level || lastKnownLevel,
        expiry: currentRecord?.expiry_date || lastKnownExpiry,
        recordId: currentRecord?.id
      });
    });
    return rows.sort((a,b) => a.itemName.localeCompare(b.itemName));
  }, [masterList, allHistory, currentDate, activeStore]);

  // --- FILTERED SUGGESTIONS FOR MODALS ---
  const filteredSuggestions = useMemo(() => {
    if (!articleSearch) return [];
    const lower = articleSearch.toLowerCase();
    
    if (modalMode === 'Initialize') {
        // Show master catalog items that are NOT currently in the store's inventory
        const existingIds = new Set(inventoryRows.map(r => r.masterId));
        return masterList.filter(m => !existingIds.has(m.id) && (m.item_name.toLowerCase().includes(lower) || m.article_number.includes(lower))).slice(0, 5);
    } else {
        // Show items ALREADY initialized in this store
        const existingIds = new Set(inventoryRows.map(r => r.masterId));
        return masterList.filter(m => existingIds.has(m.id) && (m.item_name.toLowerCase().includes(lower) || m.article_number.includes(lower))).slice(0, 5);
    }
  }, [articleSearch, masterList, inventoryRows, modalMode]);

  const handleSelectArticle = (item: MasterItem) => {
    setSelectedArticle(item);
    setArticleSearch(`${item.item_name} (#${item.article_number})`);
    setShowSuggestions(false);
    
    if (modalMode === 'Log') {
        const row = inventoryRows.find(r => r.masterId === item.id);
        if(row) setTransData(prev => ({ ...prev, rack: row.rack, level: row.level }));
    }
  };

  const handleSaveTransaction = async () => {
    if (!selectedArticle) return alert("Select an item");
    
    const targetMonthKey = getMonthKey(currentDate);
    const existingRow = inventoryRows.find(r => r.masterId === selectedArticle.id);
    const existingRecordId = existingRow?.recordId;
    
    if (modalMode === 'Initialize') {
        // Creating the very first record for this item in this store
        await supabase.from('hsk_monthly_stock').insert({
            month_year: targetMonthKey,
            master_id: selectedArticle.id,
            store_name: activeStore,
            opening_stock: transData.qty, 
            added_stock: 0,
            consumed: 0,
            damaged: 0,
            transferred: 0,
            rack: transData.rack,
            shelf_level: transData.level,
            expiry_date: transData.expiry
        });
    } else {
        // Logging an In/Out Activity
        const deltaQty = transData.qty;
        const updates: any = {};
        
        if (transData.type === 'In') updates.added_stock = (existingRow?.added || 0) + deltaQty;
        else if (transData.type === 'Consumed') updates.consumed = (existingRow?.consumed || 0) + deltaQty;
        else if (transData.type === 'Damaged') updates.damaged = (existingRow?.others || 0) + deltaQty;
        else if (transData.type === 'Transferred') updates.transferred = (existingRow?.others || 0) + deltaQty; 
        
        if (existingRecordId) {
          // Update existing month record
          await supabase.from('hsk_monthly_stock').update(updates).eq('id', existingRecordId);
        } else {
          // Carry over to new month if logging on an item that has history but no row for THIS month yet
          await supabase.from('hsk_monthly_stock').insert({
            month_year: targetMonthKey,
            master_id: selectedArticle.id,
            store_name: activeStore,
            opening_stock: existingRow?.closingStock || 0, // Carry over stock
            added_stock: transData.type === 'In' ? deltaQty : 0,
            consumed: transData.type === 'Consumed' ? deltaQty : 0,
            damaged: transData.type === 'Damaged' ? deltaQty : 0,
            transferred: transData.type === 'Transferred' ? deltaQty : 0,
            rack: existingRow?.rack || '',
            shelf_level: existingRow?.level || '',
          });
        }
    }

    setIsModalOpen(false);
    setTransData({ qty: 0, type: 'In', expiry: '', rack: '', level: '' });
    setArticleSearch('');
    setSelectedArticle(null);
    fetchData(); 
  };

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
        </div>
      </div>

      {activeView === 'Inventory' && (
      <>
        {/* CONTROLS */}
        <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4">
           {/* Store & Month */}
           <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
               <div className="bg-white p-2 rounded-xl border border-slate-100 flex items-center justify-between w-full md:w-64">
                  {['HK Main Store', 'HK Chemical Store'].map(s => (
                      <button key={s} onClick={() => setActiveStore(s as any)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase ${activeStore === s ? 'bg-slate-100 text-[#6D2158]' : 'text-slate-400 hover:bg-slate-50'}`}>
                        {s.replace('HK ', '')}
                      </button>
                  ))}
               </div>
               <div className="bg-[#6D2158] text-white p-2 rounded-xl flex items-center justify-between shadow-lg shadow-[#6D2158]/20 w-full md:w-64">
                  <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()-1); setCurrentDate(d); }} className="p-2 hover:bg-white/10 rounded-full"><ArrowLeft size={18}/></button>
                  <div className="text-center">
                     <span className="block text-xs font-bold uppercase opacity-70">Current View</span>
                     <span className="text-lg font-bold">{currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
                  </div>
                  <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()+1); setCurrentDate(d); }} className="p-2 hover:bg-white/10 rounded-full"><ArrowRight size={18}/></button>
               </div>
           </div>
           
           {/* Actions */}
           <div className="flex gap-2">
               <button onClick={() => { setModalMode('Initialize'); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-[#6D2158] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 shadow-sm">
                  <PackagePlus size={16}/> Add To Store
               </button>
               <button onClick={() => { setModalMode('Log'); setIsModalOpen(true); }} className="flex items-center gap-2 px-6 py-3 bg-[#6D2158] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-[#6D2158]/40">
                  <ArrowDownUp size={16}/> Log Activity
               </button>
           </div>
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-6 overflow-x-auto">
           <div className="p-4 border-b border-slate-100 flex justify-between items-center">
               <div className="relative w-64">
                  <Search className="absolute left-3 top-2.5 text-slate-300" size={16} />
                  <input type="text" placeholder="Search..." className="w-full pl-10 pr-4 py-2 border rounded-xl text-xs font-bold" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
               </div>
               <div className="flex gap-4 text-xs font-bold text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> In: {totalIn}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Out: {totalConsumed}</span>
               </div>
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
                      <td className="p-4 text-center font-bold text-emerald-600">{row.added > 0 ? `+${row.added}` : '-'}</td>
                      <td className="p-4 text-center font-bold text-rose-600">{row.consumed > 0 ? `-${row.consumed}` : '-'}</td>
                      <td className="p-4 text-center font-bold text-amber-600">{row.others > 0 ? `-${row.others}` : '-'}</td>
                      <td className="p-4 text-center">
                         <span className="px-3 py-1 bg-[#6D2158]/10 text-[#6D2158] rounded-lg font-bold">
                            {row.closingStock}
                         </span>
                      </td>
                   </tr>
                 ))}
                 {inventoryRows.length === 0 && (
                     <tr><td colSpan={7} className="p-10 text-center text-slate-400 italic font-bold">No items initialized in this store yet. Click "Add To Store" to begin.</td></tr>
                 )}
              </tbody>
           </table>
        </div>
      </>
      )}

      {activeView === 'Insights' && (
         <div className="mt-6">
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden max-w-md">
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
                 <h3 className="text-lg font-bold text-[#6D2158]">{modalMode === 'Log' ? 'Record Activity (In/Out)' : `Initialize Item in ${activeStore}`}</h3>
                 {modalMode === 'Log' && <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{currentDate.toLocaleDateString('en-GB', { month: 'long' })} Ledger</p>}
              </div>
              
              <div className="space-y-4">
                 <div className="relative">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Search Article (Name or #)</label>
                    <input 
                       type="text" 
                       value={articleSearch} 
                       onChange={(e) => { setArticleSearch(e.target.value); setShowSuggestions(true); }}
                       className="w-full p-3 border rounded-xl font-bold mt-1 text-sm bg-slate-50 focus:border-[#6D2158] outline-none"
                       placeholder={modalMode === 'Initialize' ? "Search Master Catalog..." : "Search items currently in store..."}
                    />
                    {showSuggestions && articleSearch.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                         {filteredSuggestions.map(item => (
                            <div key={item.id} onClick={() => handleSelectArticle(item)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0">
                               <p className="text-sm font-bold text-slate-700">{item.item_name}</p>
                               <p className="text-[10px] text-slate-400">#{item.article_number}</p>
                            </div>
                         ))}
                         {filteredSuggestions.length === 0 && (
                            <div className="p-3 text-xs italic text-slate-400">No items found matching criteria.</div>
                         )}
                      </div>
                    )}
                 </div>

                 {selectedArticle && (
                 <>
                     {modalMode === 'Initialize' && (
                         <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                             <div><label className="text-[10px] font-bold text-slate-400 uppercase">Rack</label><input type="text" placeholder="A1" className="w-full p-3 border rounded-xl font-bold mt-1 text-sm" value={transData.rack} onChange={e => setTransData({...transData, rack: e.target.value})}/></div>
                             <div><label className="text-[10px] font-bold text-slate-400 uppercase">Level</label><input type="text" placeholder="2" className="w-full p-3 border rounded-xl font-bold mt-1 text-sm" value={transData.level} onChange={e => setTransData({...transData, level: e.target.value})}/></div>
                             <div className="col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase">Opening Stock</label><input type="number" placeholder="0" className="w-full p-3 border rounded-xl font-bold mt-1 text-sm" onChange={e => setTransData({...transData, qty: Number(e.target.value)})}/></div>
                         </div>
                     )}

                     {modalMode === 'Log' && (
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
                     )}
                     
                     <button onClick={handleSaveTransaction} className="w-full py-3 bg-[#6D2158] text-white rounded-xl font-bold mt-4 uppercase tracking-wider text-xs animate-in zoom-in shadow-lg">
                         {modalMode === 'Initialize' ? 'Initialize Item' : 'Save Record'}
                     </button>
                 </>
                 )}
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
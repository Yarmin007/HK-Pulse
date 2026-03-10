"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Plus, ArrowRight, ArrowLeft, FileText, PieChart, Zap, MapPin, X, 
  PackagePlus, ArrowDownUp, Loader2, Save, ScanBarcode, CheckCircle2, Trash2, Edit3, Download, Barcode
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// --- STRICT TYPES ---
type MasterItem = {
  article_number: string;
  article_name: string; 
  generic_name: string | null; 
  hk_no: string | null;
  category: string;
  unit: string;
};

type MonthlyRecord = {
  id: string;
  month_year: string;
  article_number: string; 
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
  articleNumber: string;
  articleName: string;
  genericName: string; 
  hkNo: string;
  category: string;
  unit: string;
  storeName: string;
  openingStock: number; 
  added: number;
  consumed: number;
  others: number;
  damaged: number;
  transferred: number;
  closingStock: number;
  rack: string;
  level: string;
  expiry: string;
  recordId?: string;
};

type StoreType = 'HK Main Store' | 'HK Chemical Store';

export default function PerpetualInventory() {
  const [activeView, setActiveView] = useState<'Inventory' | 'Insights'>('Inventory');
  const [activeStore, setActiveStore] = useState<StoreType>('HK Main Store');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [masterList, setMasterList] = useState<MasterItem[]>([]);
  const [allHistory, setAllHistory] = useState<MonthlyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'Initialize' | 'Log'>('Log');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<InventoryRow> | null>(null);

  // --- SMART SEARCH STATE ---
  const [articleSearch, setArticleSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<MasterItem | null>(null);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  const [transData, setTransData] = useState({
    qty: 0,
    type: 'Count', 
    expiry: '',
    rack: '',
    level: '',
    store: 'HK Main Store' as StoreType
  });

  const getMonthKey = (d: Date) => format(d, 'yyyy-MM'); 

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsLoading(true);
    const { data: masters, error: masterError } = await supabase.from('hsk_master_catalog')
      .select('article_number, article_name, generic_name, hk_no, category, unit')
      .eq('is_minibar_item', false)
      .order('article_name');
      
    if (masterError) toast.error("Error loading master catalog: " + masterError.message);
    if (masters) setMasterList(masters as MasterItem[]);

    const { data: history, error: historyError } = await supabase.from('hsk_monthly_stock').select('*');
    if (historyError) toast.error("Error loading history: " + historyError.message);
    if (history) setAllHistory(history as MonthlyRecord[]);
    
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // --- CALCULATE INVENTORY FOR ACTIVE STORE ---
  const inventoryRows = useMemo(() => {
    const targetMonthKey = getMonthKey(currentDate);
    const storeHistory = allHistory.filter(h => h.store_name === activeStore);
    const rows: InventoryRow[] = [];

    const historyByMaster = new Map<string, MonthlyRecord[]>();
    storeHistory.forEach(rec => {
        if (!historyByMaster.has(rec.article_number)) historyByMaster.set(rec.article_number, []);
        historyByMaster.get(rec.article_number)!.push(rec);
    });

    masterList.forEach(item => {
      const itemHistory = historyByMaster.get(item.article_number) || [];
      if (itemHistory.length === 0) return; 

      let opening = 0;
      let lastKnownRack = '', lastKnownLevel = '', lastKnownExpiry = '';
      let currentRecord: MonthlyRecord | undefined;

      itemHistory.forEach(rec => {
        if (rec.rack) lastKnownRack = rec.rack;
        if (rec.shelf_level) lastKnownLevel = rec.shelf_level;
        if (rec.expiry_date) lastKnownExpiry = rec.expiry_date;

        if (rec.month_year < targetMonthKey) {
           // Ensure these are treated as numbers
           const os = Number(rec.opening_stock || 0);
           const a = Number(rec.added_stock || 0);
           const c = Number(rec.consumed || 0);
           const d = Number(rec.damaged || 0);
           const t = Number(rec.transferred || 0);
           opening = os + a - c - d - t; 
        } else if (rec.month_year === targetMonthKey) {
           currentRecord = rec;
           if (currentRecord.opening_stock !== undefined && currentRecord.opening_stock !== null) {
               opening = Number(currentRecord.opening_stock);
           }
        }
      });

      const added = Number(currentRecord?.added_stock || 0);
      const consumed = Number(currentRecord?.consumed || 0);
      const damaged = Number(currentRecord?.damaged || 0);
      const transferred = Number(currentRecord?.transferred || 0);
      const others = damaged + transferred;
      const closing = opening + added - consumed - others;
      
      rows.push({
        articleNumber: item.article_number,
        articleName: item.article_name,
        genericName: item.generic_name || '', 
        hkNo: item.hk_no || '',
        category: item.category,
        unit: item.unit,
        storeName: activeStore,
        openingStock: opening,
        added, consumed, damaged, transferred, others, closingStock: closing,
        rack: currentRecord?.rack || lastKnownRack,
        level: currentRecord?.shelf_level || lastKnownLevel,
        expiry: currentRecord?.expiry_date || lastKnownExpiry,
        recordId: currentRecord?.id
      });
    });
    
    return rows.sort((a,b) => {
        const nameA = a.genericName || a.articleName || '';
        const nameB = b.genericName || b.articleName || '';
        return nameA.localeCompare(nameB);
    });
  }, [masterList, allHistory, currentDate, activeStore]);

  // --- FILTERED SUGGESTIONS ---
  const filteredSuggestions = useMemo(() => {
    if (!articleSearch) return [];
    const lower = articleSearch.toLowerCase();
    
    if (modalMode === 'Initialize') {
        const existingIds = new Set(allHistory.filter(h => h.store_name === transData.store).map(h => h.article_number));
        return masterList.filter(m => !existingIds.has(m.article_number) && (
            (m.hk_no || '').toLowerCase().includes(lower) || 
            (m.generic_name || '').toLowerCase().includes(lower) || 
            (m.article_name || '').toLowerCase().includes(lower) || 
            (m.article_number || '').includes(lower)
        )).slice(0, 5);
    } else {
        const existingIds = new Set(inventoryRows.map(r => r.articleNumber));
        return masterList.filter(m => existingIds.has(m.article_number) && (
            (m.hk_no || '').toLowerCase().includes(lower) ||
            (m.generic_name || '').toLowerCase().includes(lower) || 
            (m.article_name || '').toLowerCase().includes(lower) || 
            (m.article_number || '').includes(lower)
        )).slice(0, 5);
    }
  }, [articleSearch, masterList, inventoryRows, modalMode, allHistory, transData.store]);

  const handleSelectArticle = (item: MasterItem) => {
    setSelectedArticle(item);
    setArticleSearch(`${item.generic_name || item.article_name || 'Unnamed Item'} (${item.hk_no ? item.hk_no : '#' + item.article_number})`);
    setShowSuggestions(false);
    
    if (modalMode === 'Log') {
        const row = inventoryRows.find(r => r.articleNumber === item.article_number);
        if(row) setTransData(prev => ({ ...prev, rack: row.rack || '', level: row.level || '', type: 'Count', qty: row.closingStock }));
    }
  };

  const handleOpenInitialize = () => {
      setModalMode('Initialize');
      setTransData(prev => ({ ...prev, store: activeStore, qty: 0, rack: '', level: '' }));
      setIsModalOpen(true);
  };

  const openScanner = () => {
      setIsScannerOpen(true);
      setTimeout(() => { scanInputRef.current?.focus(); }, 100);
  };

  const handleScanInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          const code = scanInput.trim().toLowerCase();
          const matchedItem = masterList.find(m => 
              (m.hk_no || '').toLowerCase() === code || 
              (m.article_number || '').toLowerCase() === code
          );
          
          if (matchedItem) {
              const inCurrentStore = inventoryRows.some(r => r.articleNumber === matchedItem.article_number);
              if (inCurrentStore) {
                  setModalMode('Log');
                  handleSelectArticle(matchedItem);
                  setIsScannerOpen(false);
                  setIsModalOpen(true);
                  setScanInput('');
              } else {
                  toast.error(`Found ${matchedItem.generic_name || matchedItem.article_name}, but it is not in ${activeStore} yet.`);
                  setScanInput('');
              }
          } else {
              toast.error("Item not found in master catalog.");
              setScanInput('');
          }
      }
  };

  const handleSaveTransaction = async () => {
    if (!selectedArticle) return toast.error("Please select an item first.");
    setIsSaving(true);
    
    const targetMonthKey = getMonthKey(currentDate);
    const existingRow = inventoryRows.find(r => r.articleNumber === selectedArticle.article_number);
    const existingRecordId = existingRow?.recordId;
    
    try {
        if (modalMode === 'Initialize') {
            const { error } = await supabase.from('hsk_monthly_stock').insert({
                month_year: targetMonthKey,
                article_number: selectedArticle.article_number, 
                store_name: transData.store,
                opening_stock: Number(transData.qty), 
                added_stock: 0,
                consumed: 0,
                damaged: 0,
                transferred: 0,
                rack: transData.rack,
                shelf_level: transData.level,
                expiry_date: transData.expiry
            });
            if (error) throw error;
            toast.success(`${selectedArticle.generic_name || selectedArticle.article_name || 'Item'} added to ${transData.store}!`);

        } else {
            if (Number(transData.qty) < 0) {
                toast.error("Quantity cannot be negative");
                setIsSaving(false);
                return;
            }

            // GUARANTEED NUMBER TYPES
            let updatedAdded = Number(existingRow?.added || 0);
            let updatedConsumed = Number(existingRow?.consumed || 0);
            let updatedDamaged = Number(existingRow?.damaged || 0);
            let updatedTransferred = Number(existingRow?.transferred || 0);
            const deltaQty = Number(transData.qty);
            
            if (transData.type === 'Count') {
                const theoretical = Number(existingRow?.closingStock || 0);
                const actual = deltaQty;
                const diff = theoretical - actual;

                if (diff === 0) {
                    toast.success("Count matches exactly! No adjustments needed.", { icon: '✅' });
                    setIsSaving(false);
                    setIsModalOpen(false);
                    return;
                } else if (diff > 0) {
                    updatedConsumed += diff;
                    toast.success(`Adjusted! Added ${diff} to Consumed.`, { icon: '📉' });
                } else if (diff < 0) {
                    updatedAdded += Math.abs(diff);
                    toast.success(`Adjusted! Added ${Math.abs(diff)} to Stock In.`, { icon: '📈' });
                }
            } else {
                if (transData.type === 'In') updatedAdded += deltaQty;
                else if (transData.type === 'Consumed') updatedConsumed += deltaQty;
                else if (transData.type === 'Damaged') updatedDamaged += deltaQty;
                else if (transData.type === 'Transferred') updatedTransferred += deltaQty; 
                toast.success("Activity logged successfully!");
            }
            
            if (existingRecordId) {
              const { error } = await supabase.from('hsk_monthly_stock').update({
                  added_stock: updatedAdded,
                  consumed: updatedConsumed,
                  damaged: updatedDamaged,
                  transferred: updatedTransferred
              }).eq('id', existingRecordId);
              if (error) throw error;
            } else {
              const baseInsert = {
                month_year: targetMonthKey,
                article_number: selectedArticle.article_number, 
                store_name: activeStore,
                opening_stock: Number(existingRow?.closingStock || 0), 
                added_stock: updatedAdded,
                consumed: updatedConsumed,
                damaged: updatedDamaged,
                transferred: updatedTransferred,
                rack: existingRow?.rack || '',
                shelf_level: existingRow?.level || '',
              };
              const { error } = await supabase.from('hsk_monthly_stock').insert(baseInsert);
              if (error) throw error;
            }
        }

        setIsModalOpen(false);
        setTransData({ qty: 0, type: 'Count', expiry: '', rack: '', level: '', store: activeStore });
        setArticleSearch('');
        setSelectedArticle(null);
        fetchData(); 

    } catch (error: any) {
        toast.error("Database Error: " + error.message);
    } finally {
        setIsSaving(false);
    }
  };

  const handleOpenEdit = (row: InventoryRow) => {
      setEditData({ ...row });
      setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
      if (!editData) return;
      setIsSaving(true);
      
      try {
          if (editData.recordId) {
              const { error } = await supabase.from('hsk_monthly_stock').update({
                  opening_stock: Number(editData.openingStock),
                  added_stock: Number(editData.added),
                  consumed: Number(editData.consumed),
                  damaged: Number(editData.damaged),
                  transferred: Number(editData.transferred),
                  rack: editData.rack,
                  shelf_level: editData.level
              }).eq('id', editData.recordId);
              if (error) throw error;
          } else {
              const { error } = await supabase.from('hsk_monthly_stock').insert({
                  month_year: getMonthKey(currentDate),
                  article_number: editData.articleNumber,
                  store_name: activeStore,
                  opening_stock: Number(editData.openingStock),
                  added_stock: Number(editData.added),
                  consumed: Number(editData.consumed),
                  damaged: Number(editData.damaged),
                  transferred: Number(editData.transferred),
                  rack: editData.rack,
                  shelf_level: editData.level
              });
              if (error) throw error;
          }
          
          toast.success("Record updated successfully.");
          setIsEditModalOpen(false);
          fetchData();
      } catch (err: any) {
          toast.error("Error updating: " + err.message);
      } finally {
          setIsSaving(false);
      }
  };

  const handleDeleteItem = async (row: InventoryRow) => {
      if (!row.recordId) return toast.error("No data logged for this month yet to delete.");
      if (!confirm(`Are you sure you want to completely remove ${row.genericName || row.articleName} from this month's ledger?`)) return;

      setIsSaving(true);
      try {
          const { error } = await supabase.from('hsk_monthly_stock').delete().eq('id', row.recordId);
          if (error) throw error;
          toast.success("Item removed from store.");
          setIsEditModalOpen(false);
          fetchData();
      } catch (err: any) {
          toast.error("Error deleting: " + err.message);
      } finally {
          setIsSaving(false);
      }
  };

  const downloadExcel = () => {
      const targetData = inventoryRows.filter(r => 
          (r.genericName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
          (r.articleName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
          (r.articleNumber || '').includes(searchQuery)
      );

      if (targetData.length === 0) return toast.error("No data to export.");

      const headers = ["HK No", "Generic Name", "Article Name", "Article Number", "Category", "Unit", "Location (Rack/Level)", "Opening Stock", "Added In (+)", "Consumed Out (-)", "Spoilage/Transferred (-)", "Closing Stock"];
      const csvRows = targetData.map(r => [
          `"${r.hkNo || ''}"`, `"${r.genericName || ''}"`, `"${r.articleName || ''}"`, `"${r.articleNumber}"`,
          `"${r.category}"`, `"${r.unit}"`, `"${(r.rack || '') + '/' + (r.level || '')}"`,
          r.openingStock, r.added, r.consumed, r.others, r.closingStock
      ].join(','));

      const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = `Inventory_${activeStore.replace(' ', '_')}_${format(currentDate, 'MMM_yyyy')}.csv`;
      a.click();
      toast.success("Export Downloaded successfully!");
  };

  const fastMovers = inventoryRows.sort((a,b) => b.consumed - a.consumed).slice(0, 5).filter(i => i.consumed > 0);
  const totalIn = inventoryRows.reduce((s, i) => s + i.added, 0);
  const totalConsumed = inventoryRows.reduce((s, i) => s + i.consumed, 0);

  return (
    <div className="min-h-screen p-4 md:p-6 pb-28 md:pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* MOBILE-FRIENDLY HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-4 md:pb-6 gap-4 md:gap-6">
        <div className="w-full flex justify-between items-center md:block">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Store Inventory</h1>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 md:mt-2">
              Perpetual • {activeStore}
            </p>
          </div>
          {/* Top Mobile Export Button */}
          <button onClick={downloadExcel} className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl md:hidden shadow-sm border border-emerald-100">
             <Download size={18}/>
          </button>
        </div>

        <div className="flex w-full md:w-auto gap-2">
            <button onClick={downloadExcel} className="hidden md:flex px-5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold uppercase tracking-wide items-center gap-2 shadow-sm hover:bg-emerald-100 transition-colors">
                <Download size={16}/> Export
            </button>
            <button onClick={openScanner} className="hidden md:flex px-5 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold uppercase tracking-wide items-center gap-2 shadow-sm hover:bg-indigo-100 transition-colors">
                <ScanBarcode size={16}/> Scan Item
            </button>
            <div className="flex bg-white rounded-xl shadow-sm border border-slate-100 p-1 w-full md:w-auto">
               <button onClick={() => setActiveView('Inventory')} className={`flex-1 md:flex-none justify-center px-4 py-2.5 md:py-2 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-colors ${activeView === 'Inventory' ? 'bg-[#6D2158] text-white' : 'text-slate-400 hover:text-[#6D2158]'}`}><FileText size={14}/> Log</button>
               <button onClick={() => setActiveView('Insights')} className={`flex-1 md:flex-none justify-center px-4 py-2.5 md:py-2 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-colors ${activeView === 'Insights' ? 'bg-[#6D2158] text-white' : 'text-slate-400 hover:text-[#6D2158]'}`}><PieChart size={14}/> Insights</button>
            </div>
        </div>
      </div>

      {activeView === 'Inventory' && (
      <>
        {/* RESPONSIVE CONTROLS */}
        <div className="mt-4 md:mt-6 flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4">
           {/* Store & Month (Full width on mobile) */}
           <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
               <div className="bg-white p-1.5 rounded-xl border border-slate-200 flex items-center justify-between w-full md:w-64 shadow-sm">
                  {['HK Main Store', 'HK Chemical Store'].map(s => (
                      <button key={s} onClick={() => setActiveStore(s as StoreType)} className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${activeStore === s ? 'bg-slate-100 text-[#6D2158] shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}>
                        {s.replace('HK ', '')}
                      </button>
                  ))}
               </div>
               <div className="bg-[#6D2158] text-white p-2 rounded-xl flex items-center justify-between shadow-lg w-full md:w-64">
                  <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()-1); setCurrentDate(d); }} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-95"><ArrowLeft size={18}/></button>
                  <div className="text-center">
                     <span className="block text-[9px] font-bold uppercase tracking-widest text-white/70">Viewing</span>
                     <span className="text-base font-black">{format(currentDate, 'MMM yyyy')}</span>
                  </div>
                  <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()+1); setCurrentDate(d); }} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-95"><ArrowRight size={18}/></button>
               </div>
           </div>
           
           {/* Actions (Full width grid on mobile) */}
           <div className="grid grid-cols-2 md:flex gap-3 w-full md:w-auto">
               <button onClick={handleOpenInitialize} className="flex justify-center items-center gap-2 px-2 py-3.5 md:py-3 bg-white border border-slate-200 text-[#6D2158] rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider hover:bg-slate-50 shadow-sm active:scale-95 transition-all">
                  <PackagePlus size={16}/> Add Item
               </button>
               <button onClick={() => { setModalMode('Log'); setIsModalOpen(true); }} className="flex justify-center items-center gap-2 px-2 py-3.5 md:py-3 bg-[#6D2158] text-white rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider shadow-lg active:scale-95 transition-all">
                  <ArrowDownUp size={16}/> Log Entry
               </button>
           </div>
        </div>

        {/* SEARCH & TOTALS */}
        <div className="mt-6 p-4 bg-white rounded-t-2xl md:rounded-2xl border-b md:border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                type="text" 
                placeholder="Search name, HK No, or ID..." 
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[16px] md:text-sm font-bold outline-none focus:border-[#6D2158] focus:bg-white transition-colors" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                />
            </div>
            <div className="flex gap-4 text-[10px] md:text-xs font-bold text-slate-500 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 w-full md:w-auto justify-center">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> In: {totalIn}</span>
                <div className="w-px h-4 bg-slate-300"></div>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Out: {totalConsumed}</span>
            </div>
        </div>
        
        {/* DESKTOP TABLE VIEW (Hidden on Mobile) */}
        <div className="hidden md:block bg-white rounded-b-2xl shadow-sm border border-t-0 border-slate-200 overflow-x-auto">
           <table className="w-full text-left min-w-[1000px]">
              <thead>
                 <tr className="bg-slate-50/80 text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-200">
                    <th className="p-4">Article Details</th>
                    <th className="p-4">Location</th>
                    <th className="p-4 text-center">Opening</th>
                    <th className="p-4 text-center text-emerald-600">Added (+)</th>
                    <th className="p-4 text-center text-rose-600">Consumed (-)</th>
                    <th className="p-4 text-center text-amber-600">Spoilage/Trf (-)</th>
                    <th className="p-4 text-center text-[#6D2158] bg-[#6D2158]/5">Closing Stock</th>
                    <th className="p-4"></th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {isLoading ? (<tr><td colSpan={8} className="p-10 text-center"><Loader2 className="animate-spin text-[#6D2158] mx-auto" size={28}/></td></tr>) : 
                 inventoryRows.filter(r => (r.hkNo||'').toLowerCase().includes(searchQuery.toLowerCase()) || (r.genericName||'').toLowerCase().includes(searchQuery.toLowerCase()) || (r.articleName||'').toLowerCase().includes(searchQuery.toLowerCase()) || r.articleNumber.includes(searchQuery))
                 .map(row => (
                   <tr key={row.articleNumber} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4">
                         <div className="flex items-start gap-3">
                             <div className="bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[10px] font-black px-2 py-1 rounded mt-0.5 min-w-[50px] text-center">{row.hkNo || 'NO-HK'}</div>
                             <div>
                                 <span className="block text-sm font-black text-slate-800">{row.genericName || row.articleName || 'Unnamed Item'}</span>
                                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{row.articleName || 'N/A'} • #{row.articleNumber} • {row.unit}</span>
                             </div>
                         </div>
                      </td>
                      <td className="p-4">
                         {(row.rack || row.level) ? (
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg w-fit"><MapPin size={12}/> {row.rack || '-'}/{row.level || '-'}</div>
                         ) : <span className="text-slate-300 text-xs font-bold">-</span>}
                      </td>
                      <td className="p-4 text-center font-black text-slate-400 text-sm">{row.openingStock}</td>
                      <td className="p-4 text-center font-black text-emerald-600 text-sm">{row.added > 0 ? `+${row.added}` : '-'}</td>
                      <td className="p-4 text-center font-black text-rose-600 text-sm">{row.consumed > 0 ? `-${row.consumed}` : '-'}</td>
                      <td className="p-4 text-center font-black text-amber-600 text-sm">{row.others > 0 ? `-${row.others}` : '-'}</td>
                      <td className="p-4 text-center bg-[#6D2158]/5"><span className="inline-block px-4 py-1.5 bg-[#6D2158] text-white rounded-xl font-black text-sm shadow-md">{row.closingStock}</span></td>
                      <td className="p-4 text-right">
                         <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={() => handleOpenEdit(row)} className="p-2 text-slate-300 hover:bg-blue-50 hover:text-blue-600 rounded-lg"><Edit3 size={16}/></button>
                             <button onClick={() => handleDeleteItem(row)} className="p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg"><Trash2 size={16}/></button>
                         </div>
                      </td>
                   </tr>
                 ))}
                 {!isLoading && inventoryRows.length === 0 && (<tr><td colSpan={8} className="p-10 text-center text-slate-400 italic font-bold">No items found.</td></tr>)}
              </tbody>
           </table>
        </div>

        {/* MOBILE CARD VIEW (Hidden on Desktop) */}
        <div className="md:hidden space-y-4 mt-4">
            {isLoading ? (<div className="p-10 text-center"><Loader2 className="animate-spin text-[#6D2158] mx-auto" size={28}/></div>) : 
            inventoryRows.filter(r => (r.hkNo||'').toLowerCase().includes(searchQuery.toLowerCase()) || (r.genericName||'').toLowerCase().includes(searchQuery.toLowerCase()) || (r.articleName||'').toLowerCase().includes(searchQuery.toLowerCase()) || r.articleNumber.includes(searchQuery))
            .map(row => (
                <div key={row.articleNumber} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4 relative">
                    <div className="flex justify-between items-start z-10">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[10px] font-black px-2 py-0.5 rounded">{row.hkNo || 'NO-HK'}</span>
                                {(row.rack || row.level) && (
                                    <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                                        <MapPin size={10}/> {row.rack || '-'}/{row.level || '-'}
                                    </span>
                                )}
                            </div>
                            <h4 className="text-base font-black text-slate-800 leading-tight">{row.genericName || row.articleName || 'Unnamed Item'}</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">#{row.articleNumber} • {row.unit}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => handleOpenEdit(row)} className="p-2 text-slate-400 hover:text-blue-500 bg-slate-50 rounded-lg active:scale-95 transition-all border border-slate-100"><Edit3 size={14}/></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center items-center z-10">
                        <div>
                            <span className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Open</span>
                            <span className="text-xs font-black text-slate-600">{row.openingStock}</span>
                        </div>
                        <div>
                            <span className="block text-[9px] uppercase font-bold text-emerald-500 mb-1">In</span>
                            <span className="text-xs font-black text-emerald-600">{row.added > 0 ? `+${row.added}` : '-'}</span>
                        </div>
                        <div>
                            <span className="block text-[9px] uppercase font-bold text-rose-500 mb-1">Out</span>
                            <span className="text-xs font-black text-rose-600">{row.consumed + row.others > 0 ? `-${row.consumed + row.others}` : '-'}</span>
                        </div>
                        <div className="bg-[#6D2158]/10 rounded-lg p-1.5 shadow-sm border border-[#6D2158]/20">
                            <span className="block text-[9px] uppercase font-black text-[#6D2158] mb-0.5">Total</span>
                            <span className="text-sm font-black text-[#6D2158]">{row.closingStock}</span>
                        </div>
                    </div>

                    {/* Invisible full-card click target for Logging Activity */}
                    <button onClick={() => { handleSelectArticle(masterList.find(m => m.article_number === row.articleNumber)!); setModalMode('Log'); setIsModalOpen(true); }} className="absolute inset-0 z-0 bg-transparent rounded-2xl active:bg-slate-50/50 transition-colors"></button>
                </div>
            ))}
        </div>
      </>
      )}

      {activeView === 'Insights' && (
         <div className="mt-6">
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden w-full md:max-w-md">
                <h3 className="text-lg font-bold text-emerald-700 flex items-center gap-2"><Zap size={20}/> Fast Moving (Top 5)</h3>
                <div className="space-y-3 mt-4">
                    {fastMovers.map((item, i) => (
                       <div key={item.articleNumber} className="flex justify-between items-center border-b border-slate-50 pb-2">
                           <div className="flex items-center gap-3">
                               <span className="text-lg font-black text-emerald-200">0{i+1}</span>
                               <p className="text-sm font-bold text-slate-700">{item.genericName || item.articleName}</p>
                           </div>
                           <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded text-xs">{item.consumed} {item.unit}</span>
                       </div>
                    ))}
                    {fastMovers.length === 0 && <p className="text-sm italic text-slate-400">No consumption data for this month.</p>}
                </div>
             </div>
         </div>
      )}

      {/* --- FLOATING ACTION BUTTON (SCANNER - MOBILE ONLY) --- */}
      <button onClick={openScanner} className="fixed bottom-6 right-6 md:hidden z-40 bg-indigo-600 text-white p-4 rounded-full shadow-[0_8px_30px_rgb(79,70,229,0.4)] active:scale-95 transition-all flex items-center justify-center border-4 border-white">
          <Barcode size={24} />
      </button>

      {/* --- SMART LOGGING MODAL (BOTTOM SHEET ON MOBILE) --- */}
      {isModalOpen && (
        <div className="fixed inset-x-0 bottom-0 md:inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-end md:items-center justify-center md:p-4 animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-lg rounded-t-[2rem] md:rounded-[2rem] shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto relative animate-in slide-in-from-bottom-8 md:zoom-in-95">
              
              {/* Mobile Drag Handle */}
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 md:hidden"></div>
              
              <button onClick={() => setIsModalOpen(false)} className="absolute top-4 md:top-6 right-6 text-slate-400 hover:text-rose-500 bg-slate-100 p-2 rounded-full transition-colors"><X size={18}/></button>

              <div className="mb-6">
                 <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                     {modalMode === 'Log' ? <ArrowDownUp size={22} className="text-[#6D2158]"/> : <PackagePlus size={22} className="text-[#6D2158]"/>}
                     {modalMode === 'Log' ? 'Log Store Activity' : `Add Item To Store`}
                 </h3>
                 {modalMode === 'Log' && <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">For {format(currentDate, 'MMMM yyyy')} Ledger</p>}
              </div>
              
              <div className="space-y-5">

                 {modalMode === 'Initialize' && (
                     <div>
                         <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Target Store</label>
                         <select 
                             className="w-full p-4 border border-slate-200 rounded-xl font-bold mt-1 text-[16px] md:text-sm bg-slate-50 focus:border-[#6D2158] outline-none"
                             value={transData.store}
                             onChange={(e) => setTransData({...transData, store: e.target.value as StoreType})}
                         >
                             <option value="HK Main Store">HK Main Store</option>
                             <option value="HK Chemical Store">HK Chemical Store</option>
                         </select>
                     </div>
                 )}

                 <div className="relative">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Find Item (HK No, Name, or ID)</label>
                    <div className="relative">
                        <Search className="absolute left-4 top-4 text-slate-400" size={18} />
                        <input 
                           type="text" 
                           value={articleSearch} 
                           onChange={(e) => { setArticleSearch(e.target.value); setShowSuggestions(true); }}
                           className="w-full p-4 pl-12 border border-slate-200 rounded-xl font-bold mt-1 text-[16px] md:text-sm bg-white focus:border-[#6D2158] outline-none shadow-sm"
                           placeholder={modalMode === 'Initialize' ? "Search Master Catalog..." : `Search items in ${activeStore}...`}
                        />
                    </div>
                    {showSuggestions && articleSearch.length > 0 && (
                      <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-2xl mt-2 max-h-56 overflow-y-auto custom-scrollbar">
                         {filteredSuggestions.map(item => (
                            <div key={item.article_number} onClick={() => handleSelectArticle(item)} className="p-4 hover:bg-purple-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors group">
                               <p className="text-sm font-bold text-slate-800 group-hover:text-[#6D2158] flex items-center justify-between">
                                   {item.generic_name || item.article_name}
                                   <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-mono font-black">{item.hk_no || 'NO-HK'}</span>
                               </p>
                               <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1.5">{item.article_name} • #{item.article_number}</p>
                            </div>
                         ))}
                         {filteredSuggestions.length === 0 && (
                            <div className="p-5 text-xs font-bold text-slate-400 text-center bg-slate-50">No items found matching your search.</div>
                         )}
                      </div>
                    )}
                 </div>

                 {selectedArticle && (
                 <div className="pt-2 border-t border-slate-100 mt-2">
                     {modalMode === 'Initialize' && (
                         <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-2">
                             <div className="col-span-2">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Initial Opening Stock</label>
                                 <input type="number" placeholder="Enter starting quantity..." className="w-full p-4 border border-slate-200 rounded-xl font-black text-[20px] text-[#6D2158] mt-1 shadow-inner focus:border-[#6D2158] outline-none text-center" value={transData.qty || ''} onChange={e => setTransData({...transData, qty: Number(e.target.value)})}/>
                             </div>
                             <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Rack (Optional)</label><input type="text" placeholder="e.g. A1" className="w-full p-4 border border-slate-200 bg-slate-50 rounded-xl font-bold mt-1 text-[16px] md:text-sm outline-none focus:border-[#6D2158]" value={transData.rack} onChange={e => setTransData({...transData, rack: e.target.value})}/></div>
                             <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Level (Optional)</label><input type="text" placeholder="e.g. 2" className="w-full p-4 border border-slate-200 bg-slate-50 rounded-xl font-bold mt-1 text-[16px] md:text-sm outline-none focus:border-[#6D2158]" value={transData.level} onChange={e => setTransData({...transData, level: e.target.value})}/></div>
                         </div>
                     )}

                     {modalMode === 'Log' && (
                         <div className="grid grid-cols-1 gap-5 animate-in slide-in-from-bottom-2">
                             
                             <div className="flex bg-slate-100 p-1.5 rounded-xl">
                                 <button onClick={() => setTransData({...transData, type: 'Count'})} className={`flex-1 py-3 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all ${transData.type === 'Count' ? 'bg-white text-indigo-600 shadow-sm scale-100' : 'text-slate-400 hover:text-slate-600 scale-95'}`}>Physical Count</button>
                                 <button onClick={() => setTransData({...transData, type: 'In'})} className={`flex-1 py-3 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all ${transData.type === 'In' ? 'bg-white text-emerald-600 shadow-sm scale-100' : 'text-slate-400 hover:text-slate-600 scale-95'}`}>Add Stock (+)</button>
                                 <button onClick={() => setTransData({...transData, type: 'Consumed'})} className={`flex-1 py-3 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all ${['Consumed', 'Damaged', 'Transferred'].includes(transData.type) && transData.type !== 'Count' ? 'bg-white text-rose-600 shadow-sm scale-100' : 'text-slate-400 hover:text-slate-600 scale-95'}`}>Deduct (-)</button>
                             </div>

                             {['Consumed', 'Damaged', 'Transferred'].includes(transData.type) && (
                                 <select className="w-full p-4 border border-rose-200 bg-rose-50 text-rose-700 rounded-xl font-bold text-[16px] md:text-sm outline-none focus:border-rose-400" value={transData.type} onChange={e => setTransData({...transData, type: e.target.value})}>
                                     <option value="Consumed">Deduct: Consumed in Operations</option>
                                     <option value="Damaged">Deduct: Damaged / Spoilage</option>
                                     <option value="Transferred">Deduct: Transferred to other Dept</option>
                                 </select>
                             )}

                             <div>
                                 <div className="flex justify-between items-end mb-2 px-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        {transData.type === 'Count' ? 'Actual Count on Shelf' : 'Quantity'}
                                    </label>
                                    {transData.type === 'Count' && (
                                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">Smart Reconciliation</span>
                                    )}
                                 </div>
                                 <input 
                                     type="number" 
                                     placeholder="0" 
                                     className={`w-full p-5 border-2 rounded-2xl font-black text-[32px] md:text-4xl text-center shadow-inner outline-none transition-colors ${
                                         transData.type === 'Count' ? 'border-indigo-200 focus:border-indigo-500 text-indigo-700 bg-indigo-50/50' : 
                                         transData.type === 'In' ? 'border-emerald-200 focus:border-emerald-500 text-emerald-700 bg-emerald-50/50' : 
                                         'border-rose-200 focus:border-rose-500 text-rose-700 bg-rose-50/50'
                                     }`} 
                                     value={transData.qty || ''} 
                                     onChange={e => setTransData({...transData, qty: Number(e.target.value)})}
                                 />
                                 
                                 {transData.type === 'Count' && (
                                     <p className="text-[10px] text-slate-400 font-bold mt-4 text-center px-2 leading-relaxed">
                                         Input the total amount currently sitting on the shelf. The system will calculate the difference and adjust the <span className="text-rose-500">Consumed</span> or <span className="text-emerald-500">Added</span> buckets automatically.
                                     </p>
                                 )}
                             </div>
                         </div>
                     )}
                     
                     <div className="pb-4">
                        <button onClick={handleSaveTransaction} disabled={isSaving || transData.qty === null || transData.qty === undefined || (transData.qty === 0 && transData.type !== 'Count')} className="w-full py-5 bg-[#6D2158] text-white rounded-xl font-black mt-6 uppercase tracking-widest text-[16px] md:text-sm shadow-[0_8px_30px_rgb(109,33,88,0.4)] hover:bg-[#5a1b49] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none">
                            {isSaving ? <Loader2 size={20} className="animate-spin"/> : <CheckCircle2 size={20}/>}
                            {modalMode === 'Initialize' ? 'Save & Add To Store' : 'Commit to Ledger'}
                        </button>
                     </div>
                 </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* --- EDIT / DELETE MODAL (GOD MODE) --- */}
      {isEditModalOpen && editData && (
          <div className="fixed inset-x-0 bottom-0 md:inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-end md:items-center justify-center md:p-4 animate-in fade-in duration-200">
             <div className="bg-white w-full max-w-md rounded-t-[2rem] md:rounded-[2rem] shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto relative animate-in slide-in-from-bottom-8 md:zoom-in-95 border-t-4 border-slate-100">
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 md:hidden"></div>
                <button onClick={() => setIsEditModalOpen(false)} className="absolute top-4 md:top-6 right-6 text-slate-400 hover:text-rose-500 bg-slate-100 p-2 rounded-full transition-colors"><X size={18}/></button>

                <div className="mb-6">
                   <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2"><Edit3 size={20} className="text-blue-500"/> Edit Record</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{editData.genericName || editData.articleName} • {format(currentDate, 'MMM yyyy')}</p>
                </div>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Opening Stock</label>
                            <input type="number" className="w-full p-4 border border-slate-200 rounded-xl font-bold mt-1 text-[16px] md:text-sm bg-slate-50 outline-none" value={editData.openingStock} onChange={e => setEditData({...editData, openingStock: Number(e.target.value)})}/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-emerald-600 uppercase ml-1">Added (+)</label>
                            <input type="number" className="w-full p-4 border border-emerald-200 rounded-xl font-bold mt-1 text-[16px] md:text-sm bg-emerald-50 text-emerald-700 outline-none focus:border-emerald-400" value={editData.added} onChange={e => setEditData({...editData, added: Number(e.target.value)})}/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-rose-600 uppercase ml-1">Consumed (-)</label>
                            <input type="number" className="w-full p-4 border border-rose-200 rounded-xl font-bold mt-1 text-[16px] md:text-sm bg-rose-50 text-rose-700 outline-none focus:border-rose-400" value={editData.consumed} onChange={e => setEditData({...editData, consumed: Number(e.target.value)})}/>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-amber-600 uppercase ml-1">Damaged / Transferred (-)</label>
                            <div className="grid grid-cols-2 gap-4 mt-1">
                                <input type="number" placeholder="Damaged" className="w-full p-4 border border-amber-200 rounded-xl font-bold text-[16px] md:text-sm bg-amber-50 text-amber-700 outline-none focus:border-amber-400" value={editData.damaged} onChange={e => setEditData({...editData, damaged: Number(e.target.value)})}/>
                                <input type="number" placeholder="Transferred" className="w-full p-4 border border-amber-200 rounded-xl font-bold text-[16px] md:text-sm bg-amber-50 text-amber-700 outline-none focus:border-amber-400" value={editData.transferred} onChange={e => setEditData({...editData, transferred: Number(e.target.value)})}/>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Rack</label><input type="text" className="w-full p-4 border border-slate-200 rounded-xl font-bold mt-1 text-[16px] md:text-sm bg-slate-50 outline-none" value={editData.rack} onChange={e => setEditData({...editData, rack: e.target.value})}/></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Level</label><input type="text" className="w-full p-4 border border-slate-200 rounded-xl font-bold mt-1 text-[16px] md:text-sm bg-slate-50 outline-none" value={editData.level} onChange={e => setEditData({...editData, level: e.target.value})}/></div>
                    </div>
                    
                    <div className="flex flex-col gap-3 mt-6 pb-4">
                        <button onClick={handleSaveEdit} disabled={isSaving} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[16px] md:text-sm shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                            {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} Save Overrides
                        </button>
                        <button onClick={() => handleDeleteItem(editData as InventoryRow)} disabled={isSaving} className="w-full py-4 bg-white border border-rose-200 text-rose-600 rounded-xl font-black uppercase tracking-widest text-[16px] md:text-sm active:scale-95 transition-all flex items-center justify-center gap-2">
                            <Trash2 size={18}/> Remove from List
                        </button>
                    </div>
                </div>
             </div>
          </div>
      )}

      {/* --- FULL SCREEN SCANNER OVERLAY --- */}
      {isScannerOpen && (
          <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-6 animate-in fade-in">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-12 right-8 text-white/50 hover:text-white bg-white/10 p-3 rounded-full transition-colors"><X size={28}/></button>
              
              <div className="w-full max-w-sm bg-white rounded-[2rem] p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-indigo-500 animate-pulse"></div>
                  <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-6 text-indigo-500 shadow-inner">
                      <ScanBarcode size={48}/>
                  </div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Scan Barcode</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8 leading-relaxed">Aim your scanner at the item or type the code below.</p>
                  
                  <input 
                      ref={scanInputRef}
                      type="text" 
                      className="w-full p-5 border-4 border-indigo-100 rounded-2xl text-center font-mono font-black text-[20px] md:text-2xl text-indigo-800 focus:border-indigo-500 outline-none shadow-sm"
                      placeholder="Waiting for code..."
                      value={scanInput}
                      onChange={(e) => setScanInput(e.target.value)}
                      onKeyDown={handleScanInput}
                      autoFocus
                      onBlur={() => setTimeout(() => scanInputRef.current?.focus(), 100)} 
                  />
              </div>
          </div>
      )}

    </div>
  );
}
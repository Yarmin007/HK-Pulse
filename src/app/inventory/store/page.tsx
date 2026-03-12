"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Plus, ArrowRight, ArrowLeft, FileText, PieChart, Zap, MapPin, X, 
  PackagePlus, ArrowDownUp, Loader2, Save, CheckCircle2, Trash2, Edit3, Download, Camera, Delete, Copy, Image as ImageIcon,
  Layers
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { format, subMonths } from 'date-fns';
import { Scanner } from '@yudiel/react-qr-scanner'; 

// --- STRICT TYPES ---
type MasterItem = {
  article_number: string;
  article_name: string; 
  generic_name: string | null; 
  hk_no: string | null;
  category: string;
  unit: string;
  image_url?: string;
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
  villa_assets: number;
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
  imageUrl?: string;
  openingStock: number; 
  added: number;
  consumed: number;
  others: number;
  damaged: number;
  transferred: number;
  closingStock: number;
  villaAssets: number;
  grandTotal: number;
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
  const [liveVillaCounts, setLiveVillaCounts] = useState<Record<string, number>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  
  // MODALS
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'Initialize' | 'Log'>('Log');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<InventoryRow> | null>(null);

  // --- SMART SEARCH & SCAN STATE ---
  const [articleSearch, setArticleSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<MasterItem | null>(null);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  // --- CUSTOM CALCULATOR STATE ---
  const [keypadValue, setKeypadValue] = useState('');

  const [transData, setTransData] = useState({
    type: 'Count', // 'Count', 'In', 'Consumed', 'Damaged', 'Transferred', 'Villa'
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
      .select('article_number, article_name, generic_name, hk_no, category, unit, image_url')
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

  // --- FETCH LIVE VILLA COUNTS WHENEVER MONTH CHANGES ---
  useEffect(() => {
      const fetchLiveCounts = async () => {
          const monthKey = getMonthKey(currentDate);
          const { data: schedules } = await supabase.from('hsk_inventory_schedules').select('id').eq('month_year', monthKey);
          
          let counts: Record<string, number> = {};
          if (schedules && schedules.length > 0) {
              const scheduleIds = schedules.map(s => s.id);
              const { data: records } = await supabase.from('hsk_inventory_records').select('article_number, counted_qty').in('schedule_id', scheduleIds);
              
              if (records) {
                  records.forEach(r => {
                      counts[r.article_number] = (counts[r.article_number] || 0) + (r.counted_qty || 0);
                  });
              }
          }
          setLiveVillaCounts(counts);
      };
      fetchLiveCounts();
  }, [currentDate]);


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
      const liveVillaQty = liveVillaCounts[item.article_number] || 0;
      
      // If it's never been in this store AND nobody counted it in the villas this month, skip it.
      if (itemHistory.length === 0 && liveVillaQty === 0) return; 

      let opening = 0;
      let lastKnownRack = '', lastKnownLevel = '', lastKnownExpiry = '';
      let currentRecord: MonthlyRecord | undefined;

      itemHistory.forEach(rec => {
        if (rec.rack) lastKnownRack = rec.rack;
        if (rec.shelf_level) lastKnownLevel = rec.shelf_level;
        if (rec.expiry_date) lastKnownExpiry = rec.expiry_date;

        if (rec.month_year < targetMonthKey) {
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
      
      // VILLA ASSET MAGIC: Combine manual saved record with live count data
      const villaAssets = Math.max(Number(currentRecord?.villa_assets || 0), liveVillaQty);

      const others = damaged + transferred;
      const closingStock = opening + added - consumed - others;
      const grandTotal = closingStock + villaAssets;
      
      rows.push({
        articleNumber: item.article_number,
        articleName: item.article_name,
        genericName: item.generic_name || '', 
        hkNo: item.hk_no || '',
        category: item.category,
        unit: item.unit,
        imageUrl: item.image_url,
        storeName: activeStore,
        openingStock: opening,
        added, consumed, damaged, transferred, others, closingStock, villaAssets, grandTotal,
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
  }, [masterList, allHistory, currentDate, activeStore, liveVillaCounts]);

  const categories = ['All', ...Array.from(new Set(inventoryRows.map(r => r.category))).filter(Boolean)];

  // --- FILTERED SUGGESTIONS ---
  const filteredSuggestions = useMemo(() => {
    if (!articleSearch) return [];
    const lower = articleSearch.toLowerCase();
    
    const existingIds = new Set(inventoryRows.map(r => r.articleNumber));
    
    return masterList.filter(m => {
        const match = (m.hk_no || '').toLowerCase().includes(lower) || 
                      (m.generic_name || '').toLowerCase().includes(lower) || 
                      (m.article_name || '').toLowerCase().includes(lower) || 
                      (m.article_number || '').includes(lower);
        
        if (!match) return false;
        if (modalMode === 'Log') return existingIds.has(m.article_number);
        return true;
    }).slice(0, 6).map(m => ({
        ...m,
        isAlreadyAdded: modalMode === 'Initialize' ? existingIds.has(m.article_number) : false
    }));

  }, [articleSearch, masterList, inventoryRows, modalMode]);

  const handleSelectArticle = (item: MasterItem) => {
    setSelectedArticle(item);
    setArticleSearch(`${item.generic_name || item.article_name || 'Unnamed Item'} (${item.hk_no ? item.hk_no : '#' + item.article_number})`);
    setShowSuggestions(false);
    setKeypadValue(''); 
    
    if (modalMode === 'Log') {
        const row = inventoryRows.find(r => r.articleNumber === item.article_number);
        if(row) setTransData(prev => ({ ...prev, rack: row.rack || '', level: row.level || '', type: 'Count' }));
    }
  };

  const handleOpenInitialize = () => {
      setModalMode('Initialize');
      setTransData(prev => ({ ...prev, store: activeStore, rack: '', level: '' }));
      setKeypadValue('');
      setIsModalOpen(true);
  };

  const openScanner = () => {
      setIsScannerOpen(true);
      setTimeout(() => { scanInputRef.current?.focus(); }, 100);
  };

  const handleCodeScanned = (code: string) => {
      const cleanCode = code.trim().toLowerCase();
      if (!cleanCode) return;

      const matchedItem = masterList.find(m => 
          (m.hk_no || '').toLowerCase() === cleanCode || 
          (m.article_number || '').toLowerCase() === cleanCode
      );
      
      if (matchedItem) {
          const inCurrentStore = inventoryRows.some(r => r.articleNumber === matchedItem.article_number);
          if (inCurrentStore) {
              setModalMode('Log');
              handleSelectArticle(matchedItem);
              setIsScannerOpen(false);
              setIsModalOpen(true);
          } else {
              toast.error(`Found ${matchedItem.generic_name || matchedItem.article_name}, but it is not in ${activeStore} yet.`);
          }
      } else {
          toast.error(`Item code "${code}" not found.`);
      }
      setScanInput('');
  };

  const handleKeypadPress = (val: string) => {
      if (val === 'C') {
          setKeypadValue('');
      } else if (val === 'DEL') {
          setKeypadValue(prev => prev.slice(0, -1));
      } else {
          setKeypadValue(prev => {
              if (prev === '0') return val;
              if (prev.length >= 6) return prev; 
              return prev + val;
          });
      }
  };

  const handleSaveTransaction = async () => {
    if (!selectedArticle) return toast.error("Please select an item first.");
    const qtyNum = parseInt(keypadValue || '0', 10);

    if (modalMode === 'Initialize' && qtyNum < 0) return toast.error("Quantity cannot be negative.");
    if (modalMode === 'Log' && qtyNum === 0 && transData.type !== 'Count' && transData.type !== 'Villa') return toast.error("Enter a quantity greater than 0.");
    
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
                opening_stock: qtyNum, 
                added_stock: 0,
                consumed: 0,
                damaged: 0,
                transferred: 0,
                villa_assets: 0,
                rack: transData.rack,
                shelf_level: transData.level,
                expiry_date: transData.expiry
            });
            if (error) throw error;
            toast.success(`${selectedArticle.generic_name || selectedArticle.article_name} initialized!`);

        } else {
            let updatedAdded = Number(existingRow?.added || 0);
            let updatedConsumed = Number(existingRow?.consumed || 0);
            let updatedDamaged = Number(existingRow?.damaged || 0);
            let updatedTransferred = Number(existingRow?.transferred || 0);
            let updatedVillaAssets = Number(existingRow?.villaAssets || 0);
            
            if (transData.type === 'Count') {
                const opening = Number(existingRow?.openingStock || 0);
                const added = Number(existingRow?.added || 0);
                const damaged = Number(existingRow?.damaged || 0);
                const transferred = Number(existingRow?.transferred || 0);
                
                const calculatedConsumed = opening + added - damaged - transferred - qtyNum;

                if (calculatedConsumed < 0) {
                    toast.error("Error: Count is higher than possible stock.", { icon: '❌' });
                    setIsSaving(false);
                    return;
                }

                updatedConsumed = calculatedConsumed; 
                toast.success(`Store count reconciled! System logged ${calculatedConsumed} as consumed.`, { icon: '✅' });
            } 
            else if (transData.type === 'Villa') {
                updatedVillaAssets = qtyNum;
                toast.success("Villa/Circulation count updated!");
            }
            else {
                if (transData.type === 'In') updatedAdded += qtyNum;
                else if (transData.type === 'Consumed') updatedConsumed += qtyNum;
                else if (transData.type === 'Damaged') updatedDamaged += qtyNum;
                else if (transData.type === 'Transferred') updatedTransferred += qtyNum; 
                toast.success("Activity logged successfully!");
            }
            
            if (existingRecordId) {
              const { error } = await supabase.from('hsk_monthly_stock').update({
                  added_stock: updatedAdded,
                  consumed: updatedConsumed,
                  damaged: updatedDamaged,
                  transferred: updatedTransferred,
                  villa_assets: updatedVillaAssets
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
                villa_assets: updatedVillaAssets,
                rack: existingRow?.rack || '',
                shelf_level: existingRow?.level || '',
              };
              const { error } = await supabase.from('hsk_monthly_stock').insert(baseInsert);
              if (error) throw error;
            }
        }

        setIsModalOpen(false);
        setTransData({ type: 'Count', expiry: '', rack: '', level: '', store: activeStore });
        setArticleSearch('');
        setKeypadValue('');
        setSelectedArticle(null);
        fetchData(); 

    } catch (error: any) {
        toast.error("Database Error: " + error.message);
    } finally {
        setIsSaving(false);
    }
  };

  const handleOpenEdit = (e: React.MouseEvent, row: InventoryRow) => {
      e.stopPropagation(); 
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
                  villa_assets: Number(editData.villaAssets),
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
                  villa_assets: Number(editData.villaAssets),
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

  const handleCopyPreviousVillaAssets = async () => {
      if (!confirm("Are you sure you want to copy all Villa Asset counts from last month into this month? This will overwrite existing numbers.")) return;
      
      setIsLoading(true);
      const currentMonthKey = getMonthKey(currentDate);
      const lastMonthDate = subMonths(currentDate, 1);
      const lastMonthKey = getMonthKey(lastMonthDate);

      const lastMonthRecords = allHistory.filter(h => h.month_year === lastMonthKey && h.store_name === activeStore);
      
      if (lastMonthRecords.length === 0) {
          toast.error(`No records found for ${format(lastMonthDate, 'MMMM yyyy')}`);
          setIsLoading(false);
          return;
      }

      let updatesCount = 0;
      let insertsCount = 0;

      for (const oldRec of lastMonthRecords) {
          if (!oldRec.villa_assets || oldRec.villa_assets <= 0) continue;

          const existingThisMonth = inventoryRows.find(r => r.articleNumber === oldRec.article_number);
          
          if (existingThisMonth && existingThisMonth.recordId) {
              await supabase.from('hsk_monthly_stock').update({ villa_assets: oldRec.villa_assets }).eq('id', existingThisMonth.recordId);
              updatesCount++;
          } else if (existingThisMonth) {
              await supabase.from('hsk_monthly_stock').insert({
                  month_year: currentMonthKey,
                  article_number: oldRec.article_number,
                  store_name: activeStore,
                  opening_stock: existingThisMonth.closingStock,
                  added_stock: 0, consumed: 0, damaged: 0, transferred: 0,
                  villa_assets: oldRec.villa_assets,
                  rack: existingThisMonth.rack,
                  shelf_level: existingThisMonth.level
              });
              insertsCount++;
          }
      }

      toast.success(`Copied Assets for ${updatesCount + insertsCount} items!`);
      fetchData(); 
  };

  const downloadExcel = () => {
      const targetData = inventoryRows.filter(r => 
          (activeCategory === 'All' || r.category === activeCategory) &&
          ((r.genericName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
          (r.articleName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
          (r.articleNumber || '').includes(searchQuery))
      );

      if (targetData.length === 0) return toast.error("No data to export.");

      const headers = ["HK No", "Generic Name", "Article Name", "Article Number", "Category", "Unit", "Location (Rack/Level)", "Opening Stock", "Added In (+)", "Consumed Out (-)", "Spoilage/Transferred (-)", "Closing Store Stock", "Villa / Circulation", "GRAND TOTAL"];
      const csvRows = targetData.map(r => [
          `"${r.hkNo || ''}"`, `"${r.genericName || ''}"`, `"${r.articleName || ''}"`, `"${r.articleNumber}"`,
          `"${r.category}"`, `"${r.unit}"`, `"${(r.rack || '') + '/' + (r.level || '')}"`,
          r.openingStock, r.added, r.consumed, r.others, r.closingStock, r.villaAssets, r.grandTotal
      ].join(','));

      const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = `Inventory_${activeStore.replace(' ', '_')}_${format(currentDate, 'MMM_yyyy')}.csv`;
      a.click();
      toast.success("Export Downloaded successfully!");
  };

  const filteredRows = inventoryRows.filter(r => 
      (activeCategory === 'All' || r.category === activeCategory) &&
      ((r.hkNo||'').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (r.genericName||'').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (r.articleName||'').toLowerCase().includes(searchQuery.toLowerCase()) || 
      r.articleNumber.includes(searchQuery))
  );

  // --- INSIGHTS CALCULATIONS ---
  const fastMovers = inventoryRows.sort((a,b) => b.consumed - a.consumed).slice(0, 5).filter(i => i.consumed > 0);
  const maxConsumed = Math.max(...fastMovers.map(i => i.consumed), 1);
  
  const totalIn = filteredRows.reduce((s, i) => s + i.added, 0);
  const totalConsumed = filteredRows.reduce((s, i) => s + i.consumed, 0);
  const totalStoreStock = inventoryRows.reduce((s, i) => s + i.closingStock, 0);
  const totalVillaAssets = inventoryRows.reduce((s, i) => s + i.villaAssets, 0);
  
  const categoryCounts = inventoryRows.reduce((acc, row) => {
      acc[row.category] = (acc[row.category] || 0) + row.closingStock;
      return acc;
  }, {} as Record<string, number>);

  return (
    // Natural scroll layout for mobile, Viewport lock for desktop (w-full removes forcing off screen)
    <div className="flex flex-col min-h-screen md:h-screen w-full bg-[#FDFBFD] font-antiqua text-[#6D2158] md:overflow-hidden pb-[80px] md:pb-6">
      
      {/* STATIC/STICKY TOP SECTION */}
      <div className="sticky top-0 z-30 bg-[#FDFBFD] shrink-0 px-3 md:px-6 pt-4 md:pt-6 pb-2 md:pb-0 shadow-sm md:shadow-none border-b border-slate-200 md:border-none">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-3 md:pb-4 gap-3">
          <div className="w-full flex justify-between items-center md:block">
            <div>
              <h1 className="text-xl md:text-3xl font-bold tracking-tight">Store Inventory</h1>
              <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5 md:mt-2">
                Perpetual • {activeStore}
              </p>
            </div>
            <button onClick={downloadExcel} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg md:hidden shadow-sm border border-emerald-100">
               <Download size={18}/>
            </button>
          </div>

          <div className="flex w-full md:w-auto gap-2">
              <button onClick={downloadExcel} className="hidden md:flex px-5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold uppercase tracking-wide items-center gap-2 shadow-sm hover:bg-emerald-100 transition-colors">
                  <Download size={16}/> Export
              </button>
              <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 w-full md:w-auto">
                 <button onClick={() => setActiveView('Inventory')} className={`flex-1 md:flex-none justify-center px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-colors ${activeView === 'Inventory' ? 'bg-[#6D2158] text-white shadow-md' : 'text-slate-400 hover:text-[#6D2158]'}`}><FileText size={14}/> Log</button>
                 <button onClick={() => setActiveView('Insights')} className={`flex-1 md:flex-none justify-center px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-colors ${activeView === 'Insights' ? 'bg-[#6D2158] text-white shadow-md' : 'text-slate-400 hover:text-[#6D2158]'}`}><PieChart size={14}/> Insights</button>
              </div>
          </div>
        </div>

        {activeView === 'Inventory' && (
        <div>
          {/* CONTROLS */}
          <div className="mt-3 flex flex-col md:flex-row justify-between items-center gap-3">
             <div className="flex flex-row gap-2 w-full md:w-auto">
                 <div className="bg-white p-1 rounded-xl border border-slate-200 flex items-center justify-between flex-1 md:w-64 shadow-sm">
                    {['HK Main Store', 'HK Chemical Store'].map(s => (
                        <button key={s} onClick={() => setActiveStore(s as StoreType)} className={`flex-1 py-2 rounded-lg text-[9px] md:text-xs font-bold uppercase transition-colors ${activeStore === s ? 'bg-slate-100 text-[#6D2158] shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}>
                          {s.replace('HK ', '')}
                        </button>
                    ))}
                 </div>
                 <div className="bg-[#6D2158] text-white p-1.5 rounded-xl flex items-center justify-between shadow-sm flex-1 md:w-64">
                    <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()-1); setCurrentDate(d); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors active:scale-95"><ArrowLeft size={16}/></button>
                    <div className="text-center leading-tight">
                       <span className="block text-[8px] md:text-[9px] font-bold uppercase tracking-widest text-white/70">Viewing</span>
                       <span className="text-sm md:text-base font-black">{format(currentDate, 'MMM yyyy')}</span>
                    </div>
                    <button onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth()+1); setCurrentDate(d); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors active:scale-95"><ArrowRight size={16}/></button>
                 </div>
             </div>
             
             <div className="grid grid-cols-3 gap-2 md:flex md:gap-3 w-full md:w-auto">
                 <button onClick={handleCopyPreviousVillaAssets} className="flex flex-col md:flex-row justify-center items-center gap-1.5 md:gap-2 py-2 md:px-4 bg-white border border-slate-200 text-blue-600 rounded-xl text-[9px] md:text-xs font-bold uppercase tracking-wider hover:bg-blue-50 shadow-sm active:scale-95 transition-all" title="Copy last month's Villa Counts">
                    <Copy size={14} className="md:w-4 md:h-4"/> <span className="text-center">Pull Assets</span>
                 </button>
                 <button onClick={handleOpenInitialize} className="flex flex-col md:flex-row justify-center items-center gap-1.5 md:gap-2 py-2 md:px-4 bg-white border border-slate-200 text-[#6D2158] rounded-xl text-[9px] md:text-xs font-bold uppercase tracking-wider hover:bg-slate-50 shadow-sm active:scale-95 transition-all">
                    <PackagePlus size={14} className="md:w-4 md:h-4"/> <span className="text-center">Add Item</span>
                 </button>
                 <button onClick={() => { setModalMode('Log'); setIsModalOpen(true); }} className="flex flex-col md:flex-row justify-center items-center gap-1.5 md:gap-2 py-2 md:px-5 bg-[#6D2158] text-white rounded-xl text-[9px] md:text-xs font-bold uppercase tracking-wider shadow-md active:scale-95 transition-all">
                    <ArrowDownUp size={14} className="md:w-4 md:h-4"/> <span className="text-center">Quick Log</span>
                 </button>
             </div>
          </div>

          {/* SEARCH & CATEGORY FILTER */}
          <div className="mt-3 p-3 md:p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
              <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                  <div className="relative w-full md:w-[400px]">
                      <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                      <input 
                      type="text" 
                      placeholder="Search name, HK No, or ID..." 
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] focus:bg-white transition-colors" 
                      value={searchQuery} 
                      onChange={e => setSearchQuery(e.target.value)} 
                      />
                  </div>
              </div>
              
              {/* Category Strip */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar w-full border-t border-slate-100 pt-3">
                  {categories.map(cat => (
                      <button 
                          key={cat} 
                          onClick={() => setActiveCategory(cat)}
                          className={`px-4 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border ${activeCategory === cat ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}
                      >
                          {cat}
                      </button>
                  ))}
              </div>
          </div>
        </div>
        )}
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 px-0 md:px-6 pt-2 overflow-hidden flex flex-col">
        {activeView === 'Inventory' && (
          <>
            {/* DESKTOP TABLE VIEW (Fits nicely without scrolling out of frame) */}
            <div className="hidden md:flex flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative w-full flex-col">
               <div className="flex-1 overflow-auto custom-scrollbar w-full">
                 <table className="w-full text-left border-collapse relative table-auto">
                    <thead className="bg-slate-50/95 backdrop-blur-sm shadow-sm text-[10px] uppercase tracking-widest text-slate-400 font-bold sticky top-0 z-20">
                       <tr>
                          <th className="px-3 py-4 w-14 text-center border-b border-slate-200">Pic</th>
                          <th className="px-3 py-4 border-b border-slate-200">Article Details</th>
                          <th className="px-3 py-4 border-b border-slate-200 w-24">Location</th>
                          <th className="px-3 py-4 text-center border-b border-slate-200 w-20">Opening</th>
                          <th className="px-3 py-4 text-center text-emerald-600 border-b border-slate-200 w-20">Added (+)</th>
                          <th className="px-3 py-4 text-center text-rose-600 border-b border-slate-200 w-24">Consumed (-)</th>
                          <th className="px-3 py-4 text-center text-amber-600 border-b border-slate-200 w-24">Spoilage (-)</th>
                          <th className="px-3 py-4 text-center text-indigo-600 bg-indigo-50/80 border-b border-slate-200 w-24">Store Stock</th>
                          <th className="px-3 py-4 text-center text-blue-600 bg-blue-50/80 border-l border-white border-b border-slate-200 w-24">Villa Asset</th>
                          <th className="px-3 py-4 text-center text-[#6D2158] bg-[#6D2158]/10 border-l border-white border-b border-slate-200 w-24">Grand Total</th>
                          <th className="px-3 py-4 border-b border-slate-200 w-12"></th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {isLoading ? (<tr><td colSpan={11} className="p-10 text-center"><Loader2 className="animate-spin text-[#6D2158] mx-auto" size={28}/></td></tr>) : 
                       filteredRows.map(row => (
                         <tr key={row.articleNumber} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => { handleSelectArticle(masterList.find(m => m.article_number === row.articleNumber)!); setModalMode('Log'); setIsModalOpen(true); }}>
                            <td className="px-3 py-3 align-middle">
                                <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 mx-auto shadow-sm">
                                    {row.imageUrl ? <img src={row.imageUrl} className="w-full h-full object-cover"/> : <ImageIcon size={18} className="text-slate-300"/>}
                                </div>
                            </td>
                            <td className="px-3 py-3 align-middle max-w-[200px]">
                               <div className="flex items-start gap-2">
                                   <div className="bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[9px] font-black px-1.5 py-0.5 rounded-md mt-0.5 shrink-0">{row.hkNo || 'NO-HK'}</div>
                                   <div className="min-w-0">
                                       <span className="block text-xs md:text-sm font-black text-slate-800 group-hover:text-[#6D2158] transition-colors truncate" title={row.genericName || row.articleName}>{row.genericName || row.articleName || 'Unnamed Item'}</span>
                                       <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate block" title={`${row.articleName} • #${row.articleNumber}`}>{row.articleName || 'N/A'} • #{row.articleNumber}</span>
                                   </div>
                               </div>
                            </td>
                            <td className="px-3 py-3 align-middle">
                               {(row.rack || row.level) ? (
                                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md w-fit whitespace-nowrap"><MapPin size={10}/> {row.rack || '-'}/{row.level || '-'}</div>
                               ) : <span className="text-slate-300 text-xs font-bold">-</span>}
                            </td>
                            <td className="px-3 py-3 text-center align-middle font-black text-slate-400 text-sm whitespace-nowrap">{row.openingStock}</td>
                            <td className="px-3 py-3 text-center align-middle font-black text-emerald-600 text-sm whitespace-nowrap">{row.added > 0 ? `+${row.added}` : '-'}</td>
                            <td className="px-3 py-3 text-center align-middle font-black text-rose-600 text-sm whitespace-nowrap">{row.consumed > 0 ? `-${row.consumed}` : '-'}</td>
                            <td className="px-3 py-3 text-center align-middle font-black text-amber-600 text-sm whitespace-nowrap">{row.others > 0 ? `-${row.others}` : '-'}</td>
                            <td className="px-3 py-3 text-center align-middle bg-indigo-50/20 text-indigo-700 font-black text-base whitespace-nowrap border-l border-white">{row.closingStock}</td>
                            <td className="px-3 py-3 text-center align-middle bg-blue-50/20 text-blue-700 font-black text-base whitespace-nowrap border-l border-white">{row.villaAssets > 0 ? row.villaAssets : '-'}</td>
                            <td className="px-3 py-3 text-center align-middle bg-[#6D2158]/5 border-l border-white whitespace-nowrap"><span className="inline-block px-3 py-1 bg-[#6D2158] text-white rounded-xl font-black text-base shadow-sm">{row.grandTotal}</span></td>
                            <td className="px-3 py-3 text-right align-middle">
                               <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                   <button onClick={(e) => handleOpenEdit(e, row)} className="p-2 text-slate-300 hover:bg-blue-50 hover:text-blue-600 rounded-lg"><Edit3 size={16}/></button>
                               </div>
                            </td>
                         </tr>
                       ))}
                       {!isLoading && filteredRows.length === 0 && (<tr><td colSpan={11} className="p-10 text-center text-slate-400 italic font-bold">No items found.</td></tr>)}
                    </tbody>
                 </table>
               </div>
            </div>

            {/* EDGE-TO-EDGE MOBILE LIST VIEW */}
            <div className="md:hidden flex-1 overflow-y-auto w-full border-t border-slate-200 custom-scrollbar pb-6">
                {isLoading ? (<div className="p-10 text-center"><Loader2 className="animate-spin text-[#6D2158] mx-auto" size={28}/></div>) : 
                filteredRows.map(row => (
                    <div 
                        key={row.articleNumber} 
                        onClick={() => { handleSelectArticle(masterList.find(m => m.article_number === row.articleNumber)!); setModalMode('Log'); setIsModalOpen(true); }}
                        className="p-4 border-b border-slate-100 bg-white flex flex-col gap-3 active:bg-slate-50 transition-colors cursor-pointer"
                    >
                        <div className="flex justify-between items-start gap-3">
                            <div className="w-14 h-14 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                                {row.imageUrl ? <img src={row.imageUrl} className="w-full h-full object-cover"/> : <ImageIcon size={20} className="text-slate-300"/>}
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[9px] font-black px-1.5 py-0.5 rounded">{row.hkNo || 'NO-HK'}</span>
                                    {(row.rack || row.level) && (
                                        <span className="flex items-center gap-1 text-[8px] uppercase tracking-widest font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">
                                            <MapPin size={8}/> {row.rack || '-'}/{row.level || '-'}
                                        </span>
                                    )}
                                </div>
                                <h4 className="text-sm font-black text-slate-800 leading-tight truncate">{row.genericName || row.articleName || 'Unnamed Item'}</h4>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                                <button onClick={(e) => handleOpenEdit(e, row)} className="p-1.5 text-slate-400 hover:text-blue-500 bg-slate-50 rounded-full active:scale-95 transition-all border border-slate-100"><Edit3 size={14}/></button>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 bg-slate-50 border border-slate-100 rounded-xl p-2 text-center items-center">
                            <div className="flex flex-col justify-center">
                                <span className="block text-[8px] uppercase font-bold text-slate-400 mb-0.5">Open</span>
                                <span className="text-[11px] font-black text-slate-600">{row.openingStock}</span>
                            </div>
                            <div className="flex flex-col justify-center">
                                <span className="block text-[8px] uppercase font-bold text-emerald-500 mb-0.5">In</span>
                                <span className="text-[11px] font-black text-emerald-600">{row.added > 0 ? `+${row.added}` : '-'}</span>
                            </div>
                            <div className="flex flex-col justify-center">
                                <span className="block text-[8px] uppercase font-bold text-rose-500 mb-0.5">Out</span>
                                <span className="text-[11px] font-black text-rose-600">{row.consumed + row.others > 0 ? `-${row.consumed + row.others}` : '-'}</span>
                            </div>
                            <div className="bg-indigo-100 rounded-lg p-1 shadow-sm border border-indigo-200 flex flex-col justify-center">
                                <span className="block text-[8px] uppercase font-black text-indigo-600 mb-0.5">Store</span>
                                <span className="text-xs font-black text-indigo-700">{row.closingStock}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-1.5 flex justify-between items-center">
                                <span className="text-[8px] uppercase font-bold text-blue-500 tracking-widest">Villa Asset</span>
                                <span className="text-xs font-black text-blue-700">{row.villaAssets > 0 ? row.villaAssets : '-'}</span>
                            </div>
                            <div className="bg-[#6D2158]/10 border border-[#6D2158]/20 rounded-lg p-1.5 flex justify-between items-center shadow-sm">
                                <span className="text-[8px] uppercase font-black text-[#6D2158] tracking-widest">Grand Total</span>
                                <span className="text-sm font-black text-[#6D2158]">{row.grandTotal}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
          </>
        )}

        {activeView === 'Insights' && (
           <div className="flex-1 overflow-y-auto custom-scrollbar md:pb-6">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 px-4 md:px-0 mb-6">
                   <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-center items-center text-center">
                       <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-1"><Layers size={14} className="inline mb-0.5 mr-1"/> Store Stock</span>
                       <span className="text-3xl font-black text-slate-800">{totalStoreStock}</span>
                   </div>
                   <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-center items-center text-center">
                       <span className="text-[10px] font-black uppercase text-blue-500 tracking-widest mb-1"><MapPin size={14} className="inline mb-0.5 mr-1"/> Villa Assets</span>
                       <span className="text-3xl font-black text-slate-800">{totalVillaAssets}</span>
                   </div>
                   <div className="bg-emerald-50 p-5 rounded-[2rem] border border-emerald-100 flex flex-col justify-center items-center text-center shadow-sm">
                       <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-1">Total Inward</span>
                       <span className="text-3xl font-black text-emerald-700">+{totalIn}</span>
                   </div>
                   <div className="bg-rose-50 p-5 rounded-[2rem] border border-rose-100 flex flex-col justify-center items-center text-center shadow-sm">
                       <span className="text-[10px] font-black uppercase text-rose-600 tracking-widest mb-1">Total Outward</span>
                       <span className="text-3xl font-black text-rose-700">-{totalConsumed}</span>
                   </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 md:px-0 pb-6">
                   <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
                      <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-6"><Zap size={24} className="text-amber-500"/> Highest Consumption</h3>
                      <div className="space-y-4 flex-1">
                          {fastMovers.map((item, i) => (
                             <div key={item.articleNumber} className="relative group">
                                 <div className="flex justify-between items-end mb-1.5">
                                     <div className="min-w-0 pr-4">
                                        <span className="text-sm font-black text-slate-700 block truncate">{item.genericName || item.articleName}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.category}</span>
                                     </div>
                                     <span className="text-sm font-black text-rose-600 shrink-0 bg-rose-50 px-3 py-1 rounded-lg border border-rose-100">{item.consumed} {item.unit}</span>
                                 </div>
                                 <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-inner">
                                     <div className="bg-gradient-to-r from-amber-400 to-rose-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.max((item.consumed / maxConsumed) * 100, 5)}%` }}></div>
                                 </div>
                             </div>
                          ))}
                          {fastMovers.length === 0 && <p className="text-sm font-bold text-slate-400 text-center py-10 border-2 border-dashed border-slate-200 rounded-3xl">No consumption data for this month.</p>}
                      </div>
                   </div>

                   <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col h-full lg:max-h-[500px]">
                      <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-6"><PieChart size={24} className="text-indigo-500"/> Stock by Category</h3>
                      <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                          {Object.entries(categoryCounts).sort((a,b) => b[1] - a[1]).map(([cat, count]) => {
                              if (count === 0) return null;
                              const totalCombined = totalStoreStock + totalVillaAssets;
                              const pct = totalCombined > 0 ? ((count / totalCombined) * 100).toFixed(1) : '0.0';
                              return (
                                  <div key={cat} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors group">
                                      <div className="flex items-center gap-4">
                                          <div className="w-12 h-12 rounded-[1rem] bg-white border border-slate-200 text-indigo-600 flex items-center justify-center font-black text-xs shadow-sm group-hover:bg-indigo-50 transition-colors">
                                              {pct}%
                                          </div>
                                          <div>
                                              <span className="font-black text-sm text-slate-800 block">{cat}</span>
                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Valuation</span>
                                          </div>
                                      </div>
                                      <span className="font-black text-lg text-slate-700 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200">{count}</span>
                                  </div>
                              );
                          })}
                      </div>
                   </div>
               </div>
           </div>
        )}
      </div>

      {/* --- CAMERA SCANNER FAB (MOBILE ONLY) --- */}
      <button onClick={() => setIsScannerOpen(true)} className="fixed bottom-24 right-4 md:hidden z-40 bg-[#6D2158] text-white p-3.5 rounded-full shadow-xl shadow-purple-900/30 active:scale-95 transition-all flex items-center justify-center border-[3px] border-white">
          <Camera size={22} />
      </button>

      {/* --- NATIVE CAMERA SCANNER OVERLAY --- */}
      {isScannerOpen && (
          <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-4 animate-in fade-in">
              <button onClick={() => setIsScannerOpen(false)} className="absolute top-10 right-6 text-white/50 hover:text-white bg-white/10 p-2.5 rounded-full transition-colors z-10"><X size={24}/></button>
              
              <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-5 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-1 mt-2">Scan Label</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Point camera at item QR code</p>
                  
                  {/* LIVE CAMERA COMPONENT */}
                  <div className="w-full overflow-hidden rounded-2xl border-[6px] border-indigo-50 bg-slate-900 min-h-[250px] relative flex justify-center items-center shadow-inner">
                      <Scanner
                          onScan={(result) => {
                              if (Array.isArray(result) && result[0]?.rawValue) {
                                  handleCodeScanned(result[0].rawValue);
                              } else if (typeof result === 'string') {
                                  handleCodeScanned(result as string);
                              } else if (result && (result as any).text) {
                                  handleCodeScanned((result as any).text);
                              }
                          }}
                          styles={{ container: { width: '100%', height: '100%' } }}
                      />
                  </div>

                  <div className="mt-6 w-full">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Or type code manually</p>
                    <input 
                      type="text" 
                      className="w-full p-4 border-2 border-slate-200 rounded-xl text-center font-mono font-bold text-base text-slate-700 focus:border-[#6D2158] outline-none"
                      placeholder="e.g. HK-1001"
                      value={scanInput}
                      onChange={(e) => setScanInput(e.target.value)}
                      onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCodeScanned(scanInput);
                      }}
                    />
                  </div>
              </div>
          </div>
      )}

      {/* --- SMART LOGGING MODAL WITH TIGHTER VERTICAL SPACING --- */}
      {isModalOpen && (
        <div className="fixed inset-x-0 bottom-0 md:inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-end md:items-center justify-center md:p-4 animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-lg rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl p-5 md:p-6 max-h-[90vh] overflow-y-auto relative animate-in slide-in-from-bottom-8 md:zoom-in-95 pb-10 md:pb-6 custom-scrollbar">
              
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 md:hidden"></div>
              <button onClick={() => setIsModalOpen(false)} className="absolute top-5 right-5 text-slate-400 hover:text-rose-500 bg-slate-100 p-2 rounded-full transition-colors"><X size={18}/></button>

              <div className="mb-3 pr-8">
                 <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                     {modalMode === 'Log' ? <ArrowDownUp size={22} className="text-[#6D2158]"/> : <PackagePlus size={22} className="text-[#6D2158]"/>}
                     {modalMode === 'Log' ? 'Quick Calculator' : `Add Item`}
                 </h3>
                 {modalMode === 'Log' && <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">For {format(currentDate, 'MMMM yyyy')} Ledger</p>}
              </div>
              
              <div className="space-y-3">

                 {modalMode === 'Initialize' && (
                     <div>
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Target Store</label>
                         <select 
                             className="w-full p-3 border border-slate-200 rounded-xl font-bold text-sm bg-slate-50 focus:border-[#6D2158] outline-none"
                             value={transData.store}
                             onChange={(e) => setTransData({...transData, store: e.target.value as StoreType})}
                         >
                             <option value="HK Main Store">HK Main Store</option>
                             <option value="HK Chemical Store">HK Chemical Store</option>
                         </select>
                     </div>
                 )}

                 {/* SEARCH / ITEM DISPLAY */}
                 <div className="relative">
                    {!selectedArticle ? (
                        <>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Find Item (HK No, Name, or ID)</label>
                            <div className="relative">
                                <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
                                <input 
                                type="text" 
                                value={articleSearch} 
                                onChange={(e) => { setArticleSearch(e.target.value); setShowSuggestions(true); }}
                                className="w-full p-3 pl-10 border border-slate-200 rounded-xl font-bold text-sm bg-white focus:border-[#6D2158] outline-none shadow-sm"
                                placeholder="Search Master Catalog..."
                                />
                            </div>
                        </>
                    ) : (
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                {selectedArticle.image_url && (
                                    <img src={selectedArticle.image_url} className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"/>
                                )}
                                <div className="min-w-0">
                                    <span className="bg-slate-200 text-slate-600 font-mono text-[9px] font-black px-2 py-0.5 rounded mr-1.5">{selectedArticle.hk_no || 'NO-HK'}</span>
                                    <span className="text-sm font-black text-slate-800">{selectedArticle.generic_name || selectedArticle.article_name}</span>
                                </div>
                            </div>
                            <button onClick={() => {setSelectedArticle(null); setArticleSearch(''); setKeypadValue('');}} className="p-1.5 text-slate-400 hover:bg-white rounded-lg shrink-0 border border-transparent hover:border-slate-200 shadow-sm transition-all"><X size={16}/></button>
                        </div>
                    )}

                    {showSuggestions && articleSearch.length > 0 && (
                      <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl mt-2 max-h-56 overflow-y-auto custom-scrollbar">
                         {filteredSuggestions.map(item => (
                            <div key={item.article_number} onClick={() => !item.isAlreadyAdded && handleSelectArticle(item)} className={`p-3 border-b border-slate-50 last:border-0 transition-colors flex items-center gap-3 ${item.isAlreadyAdded ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-purple-50 cursor-pointer group'}`}>
                               {item.image_url ? <img src={item.image_url} className={`w-10 h-10 rounded-xl object-cover border border-slate-100 ${item.isAlreadyAdded ? 'grayscale' : ''}`}/> : <div className="w-10 h-10 rounded-xl bg-slate-100 flex shrink-0"></div>}
                               <div className="flex-1 min-w-0">
                                   <p className={`text-sm font-black flex items-center justify-between ${item.isAlreadyAdded ? 'text-slate-500' : 'text-slate-800 group-hover:text-[#6D2158]'}`}>
                                       <span className="truncate pr-2">{item.generic_name || item.article_name}</span>
                                       {item.isAlreadyAdded ? (
                                           <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black uppercase tracking-widest shrink-0">Added</span>
                                       ) : (
                                           <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono font-black shrink-0">{item.hk_no || 'NO-HK'}</span>
                                       )}
                                   </p>
                                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">{item.article_name}</p>
                               </div>
                            </div>
                         ))}
                         {filteredSuggestions.length === 0 && (
                            <div className="p-4 text-xs font-bold text-slate-400 text-center bg-slate-50">No items found.</div>
                         )}
                      </div>
                    )}
                 </div>

                 {selectedArticle && (
                 <div className="pt-2 border-t border-slate-100">
                     {modalMode === 'Initialize' && (
                         <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-bottom-2 mt-2">
                             <div className="col-span-2">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Opening Store Stock</label>
                                 <div className="w-full p-2 border border-slate-200 rounded-xl font-black text-2xl text-[#6D2158] shadow-inner bg-slate-50 text-center h-12 flex items-center justify-center">
                                     {keypadValue || '0'}
                                 </div>
                             </div>
                             <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Rack (Opt)</label><input type="text" placeholder="A1" className="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158]" value={transData.rack} onChange={e => setTransData({...transData, rack: e.target.value})}/></div>
                             <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1">Level (Opt)</label><input type="text" placeholder="2" className="w-full p-3 border border-slate-200 bg-slate-50 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158]" value={transData.level} onChange={e => setTransData({...transData, level: e.target.value})}/></div>
                         </div>
                     )}

                     {modalMode === 'Log' && (
                         <div className="grid grid-cols-1 gap-3 animate-in slide-in-from-bottom-2 mt-2">
                             
                             <div className="flex bg-slate-100 p-1.5 rounded-xl gap-1">
                                 <button onClick={() => setTransData({...transData, type: 'Count'})} className={`flex-1 py-2 px-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${transData.type === 'Count' ? 'bg-white text-indigo-600 shadow-sm scale-100' : 'text-slate-400 hover:text-slate-600 scale-95'}`}>Store</button>
                                 <button onClick={() => setTransData({...transData, type: 'Villa'})} className={`flex-1 py-2 px-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${transData.type === 'Villa' ? 'bg-white text-blue-600 shadow-sm scale-100' : 'text-slate-400 hover:text-slate-600 scale-95'}`}>Villa</button>
                                 <button onClick={() => setTransData({...transData, type: 'In'})} className={`flex-1 py-2 px-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${transData.type === 'In' ? 'bg-white text-emerald-600 shadow-sm scale-100' : 'text-slate-400 hover:text-slate-600 scale-95'}`}>Add (+)</button>
                                 <button onClick={() => setTransData({...transData, type: 'Consumed'})} className={`flex-1 py-2 px-1 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${['Consumed', 'Damaged', 'Transferred'].includes(transData.type) && transData.type !== 'Count' ? 'bg-white text-rose-600 shadow-sm scale-100' : 'text-slate-400 hover:text-slate-600 scale-95'}`}>Deduct</button>
                             </div>

                             {['Consumed', 'Damaged', 'Transferred'].includes(transData.type) && (
                                 <select className="w-full p-3 border border-rose-200 bg-rose-50 text-rose-700 rounded-xl font-bold text-sm outline-none focus:border-rose-400" value={transData.type} onChange={e => setTransData({...transData, type: e.target.value})}>
                                     <option value="Consumed">Deduct: Consumed in Ops</option>
                                     <option value="Damaged">Deduct: Damaged/Spoilage</option>
                                     <option value="Transferred">Deduct: Transferred out</option>
                                 </select>
                             )}

                             <div>
                                 <div className="flex justify-between items-end mb-1 px-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        {transData.type === 'Count' ? 'Actual Store Stock' : transData.type === 'Villa' ? 'Total Assets in Villas' : 'Quantity'}
                                    </label>
                                    {transData.type === 'Count' && (
                                        <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Auto-Math</span>
                                    )}
                                 </div>
                                 
                                 {/* Custom Calculator Display */}
                                 <div className={`w-full p-2 border-2 rounded-xl font-black text-3xl text-center shadow-inner h-14 flex items-center justify-center overflow-hidden transition-colors ${
                                     transData.type === 'Count' ? 'border-indigo-200 text-indigo-700 bg-indigo-50/50' : 
                                     transData.type === 'Villa' ? 'border-blue-200 text-blue-700 bg-blue-50/50' : 
                                     transData.type === 'In' ? 'border-emerald-200 text-emerald-700 bg-emerald-50/50' : 
                                     'border-rose-200 text-rose-700 bg-rose-50/50'
                                 }`}>
                                     {keypadValue || '0'}
                                 </div>
                             </div>
                         </div>
                     )}

                     {/* COMPACT NATIVE NUMPAD */}
                     <div className="grid grid-cols-3 gap-2 mt-3 animate-in slide-in-from-bottom-4">
                        {['1','2','3','4','5','6','7','8','9'].map(num => (
                            <button key={num} onClick={() => handleKeypadPress(num)} className="bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-xl font-black py-2.5 rounded-xl transition-colors select-none">{num}</button>
                        ))}
                        <button onClick={() => handleKeypadPress('C')} className="bg-rose-50 text-rose-500 hover:bg-rose-100 active:bg-rose-200 text-lg font-black py-2.5 rounded-xl transition-colors select-none">C</button>
                        <button onClick={() => handleKeypadPress('0')} className="bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-xl font-black py-2.5 rounded-xl transition-colors select-none">0</button>
                        <button onClick={() => handleKeypadPress('DEL')} className="bg-slate-200 text-slate-600 hover:bg-slate-300 active:bg-slate-400 py-2.5 rounded-xl transition-colors select-none flex items-center justify-center"><Delete size={20}/></button>
                     </div>
                     
                     <div className="pt-4 pb-0">
                        <button 
                            onClick={() => { setTransData(prev => ({...prev, qty: parseInt(keypadValue || '0', 10)})); setTimeout(handleSaveTransaction, 50); }} 
                            disabled={isSaving || keypadValue === '' || (keypadValue === '0' && transData.type !== 'Count' && transData.type !== 'Villa')} 
                            className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-[13px] md:text-sm shadow-md hover:bg-[#5a1b49] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none"
                        >
                            {isSaving ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
                            {modalMode === 'Initialize' ? 'Save to Store' : 'Commit to Ledger'}
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
             <div className="bg-white w-full max-w-md rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl p-6 max-h-[90vh] overflow-y-auto relative animate-in slide-in-from-bottom-8 md:zoom-in-95 border-t-4 border-slate-100 pb-12 md:pb-8 custom-scrollbar">
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5 md:hidden"></div>
                <button onClick={() => setIsEditModalOpen(false)} className="absolute top-5 right-5 text-slate-400 hover:text-rose-500 bg-slate-100 p-2 rounded-full transition-colors"><X size={18}/></button>

                <div className="mb-6 flex items-center gap-4">
                   {editData.imageUrl ? (
                       <img src={editData.imageUrl} className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0 shadow-sm"/>
                   ) : (
                       <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 shadow-sm"><ImageIcon size={24} className="text-slate-300"/></div>
                   )}
                   <div className="flex-1 min-w-0">
                       <h3 className="text-base font-black text-slate-800 tracking-tight leading-tight truncate">{editData.genericName || editData.articleName}</h3>
                       <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{format(currentDate, 'MMM yyyy')}</p>
                   </div>
                </div>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Opening Stock</label>
                            <input type="number" className="w-full p-3 border border-slate-200 rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-[#6D2158]" value={editData.openingStock} onChange={e => setEditData({...editData, openingStock: Number(e.target.value)})}/>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1 mb-1 block">Villa Assets</label>
                            <input type="number" className="w-full p-3 border border-blue-200 rounded-xl font-bold text-sm bg-blue-50 text-blue-700 outline-none focus:border-blue-400" value={editData.villaAssets} onChange={e => setEditData({...editData, villaAssets: Number(e.target.value)})}/>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1 mb-1 block">Added (+)</label>
                            <input type="number" className="w-full p-3 border border-emerald-200 rounded-xl font-bold text-sm bg-emerald-50 text-emerald-700 outline-none focus:border-emerald-400" value={editData.added} onChange={e => setEditData({...editData, added: Number(e.target.value)})}/>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest ml-1 mb-1 block">Consumed (-)</label>
                            <input type="number" className="w-full p-3 border border-rose-200 rounded-xl font-bold text-sm bg-rose-50 text-rose-700 outline-none focus:border-rose-400" value={editData.consumed} onChange={e => setEditData({...editData, consumed: Number(e.target.value)})}/>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest ml-1 mb-1 block">Damaged / Transferred (-)</label>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" placeholder="Damaged" className="w-full p-3 border border-amber-200 rounded-xl font-bold text-sm bg-amber-50 text-amber-700 outline-none focus:border-amber-400" value={editData.damaged} onChange={e => setEditData({...editData, damaged: Number(e.target.value)})}/>
                                <input type="number" placeholder="Transferred" className="w-full p-3 border border-amber-200 rounded-xl font-bold text-sm bg-amber-50 text-amber-700 outline-none focus:border-amber-400" value={editData.transferred} onChange={e => setEditData({...editData, transferred: Number(e.target.value)})}/>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Rack</label><input type="text" className="w-full p-3 border border-slate-200 rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-[#6D2158]" value={editData.rack} onChange={e => setEditData({...editData, rack: e.target.value})}/></div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Level</label><input type="text" className="w-full p-3 border border-slate-200 rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-[#6D2158]" value={editData.level} onChange={e => setEditData({...editData, level: e.target.value})}/></div>
                    </div>
                    
                    <div className="flex flex-col gap-3 mt-6 pb-2">
                        <button onClick={handleSaveEdit} disabled={isSaving} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-[#5a1b49] active:scale-95 transition-all flex items-center justify-center gap-2">
                            {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} Save Overrides
                        </button>
                        <button onClick={() => handleDeleteItem(editData as InventoryRow)} disabled={isSaving} className="w-full py-4 bg-white border border-rose-200 text-rose-600 rounded-xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-rose-50">
                            <Trash2 size={18}/> Remove from List
                        </button>
                    </div>
                </div>
             </div>
          </div>
      )}

    </div>
  );
}
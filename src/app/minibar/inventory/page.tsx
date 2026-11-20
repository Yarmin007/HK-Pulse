"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Calendar, CheckCircle2, User, Save, Lock, Unlock,
  RefreshCw, Loader2, Smartphone, LayoutGrid, Users, Settings, EyeOff, Eye, Search, Home, Wine, X, Download,
  PackageSearch, Minus, Plus, ChevronLeft, ChevronRight, Upload, AlertCircle, ArrowRight, FileSpreadsheet, Link2, TrendingDown, Columns3
} from 'lucide-react';
import { useConfirm } from '@/components/ConfirmProvider';
import { isExcelFile, excelFileToCsv } from '@/lib/memoExcel';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { getDhakaDateStr } from '@/lib/dateUtils';
import * as ExcelJS from 'exceljs';
import { EMPTY_MB_TYPE, MB_EXCLUDE_TYPE, loadMbSubmissions, latestByVilla, loadOpeningDefaults, parseMbVillas, splitList, villaList } from '@/lib/minibarCounts';

const TOTAL_VILLAS = 97;

// DYNAMIC MONTH TIMEZONE FIX
const getLocalMonth = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    const str = new Intl.DateTimeFormat('en-CA', { 
        timeZone: tz, 
        year: 'numeric', month: '2-digit', day: '2-digit' 
    }).format(new Date());
    return str.substring(0, 7);
};

// Helper to get previous month string
const getPrevMonth = (yyyy_mm: string) => {
    const [y, m] = yyyy_mm.split('-').map(Number);
    let prevM = m - 1;
    let prevY = y;
    if (prevM === 0) { prevM = 12; prevY--; }
    return `${prevY}-${String(prevM).padStart(2, '0')}`;
};

// --- CUSTOM SORTING LOGIC ---
const getCategoryWeight = (cat: string) => {
  const c = (cat || '').toLowerCase();
  if (c.includes('bite') || c.includes('sweet') || c.includes('food') || c.includes('snack')) return 1;
  if (c.includes('soft') || c.includes('juice') || c.includes('water') || c.includes('beverage')) return 2;
  if (c.includes('beer')) return 3;
  if (c.includes('wine')) return 4;
  if (c.includes('spirit') || c.includes('liquor') || c.includes('hard') || c.includes('alcohol')) return 5;
  return 6;
};

// --- TYPES ---
type FinancialRecord = {
    opening_stock: number;
    transfer_in: number;
    transfer_out: number;
    sales: number;
    minibar_store: number;
    comments: string;
};

type ImportRow = {
    id: string;
    originalName: string;
    matchedArticleNo: string | null;
    val1: number; // Sales Qty or Transfer In
    val2: number; // Transfer Out
};

// --- CUSTOM VILLA TAG INPUT ---
const VillaTagInput = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const tags = value.split(',').map(s => s.trim()).filter(Boolean);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const newTag = e.currentTarget.value.trim();
            if (newTag && !tags.includes(newTag)) {
                onChange([...tags, newTag].join(', '));
            }
            e.currentTarget.value = '';
        } else if (e.key === 'Backspace' && e.currentTarget.value === '' && tags.length > 0) {
            onChange(tags.slice(0, -1).join(', '));
        }
    };

    const removeTag = (tagToRemove: string) => {
        onChange(tags.filter(t => t !== tagToRemove).join(', '));
    };

    return (
        <div className="flex flex-wrap gap-2 items-center bg-slate-50 border border-slate-200 p-2 rounded-xl focus-within:border-[#6D2158] focus-within:ring-2 focus-within:ring-[#6D2158]/10 transition-all cursor-text min-h-[50px]">
            {tags.map(t => (
                <span key={t} className="flex items-center gap-1 bg-white border border-slate-300 px-3 py-1.5 rounded-lg text-sm font-black text-[#6D2158] shadow-sm animate-in zoom-in-95 duration-200">
                    {t} <X size={14} className="cursor-pointer text-slate-300 hover:text-rose-50 ml-1" onClick={() => removeTag(t)} />
                </span>
            ))}
            <input 
                type="text" 
                className="bg-transparent outline-none flex-1 min-w-[80px] font-bold text-sm text-slate-700" 
                placeholder={tags.length === 0 ? "Type # and press Enter..." : "Add..."}
                onKeyDown={handleKeyDown} 
                onBlur={(e) => {
                    const newTag = e.target.value.trim();
                    if (newTag && !tags.includes(newTag)) {
                        onChange([...tags, newTag].join(', '));
                        e.target.value = '';
                    }
                }}
            />
        </div>
    );
};

// --- STRICT COLUMN WIDTHS FOR MATRIX ---
const MASTER_WIDTHS = {
    microsName: 'w-[160px] min-w-[160px] shrink-0',
    artNo: 'w-[60px] min-w-[60px] shrink-0',
    artName: 'w-[240px] min-w-[240px] shrink-0',
    unit: 'w-[45px] min-w-[45px] shrink-0',
    cost: 'w-[65px] min-w-[65px] shrink-0',
    price: 'w-[65px] min-w-[65px] shrink-0',
};
const TOTAL_MASTER_WIDTH = 160 + 60 + 240 + 45 + 65 + 65; // 635px

export default function MinibarInventoryAdmin() {
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'ASSIGNMENTS' | 'SETUP'>('MATRIX');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingMatrix, setIsSavingMatrix] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // MONTHLY STATE
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonth());
  const [activePeriod, setActivePeriod] = useState('');
  const [invStatus, setInvStatus] = useState<'OPEN' | 'CLOSED'>('CLOSED');
  
  // Data
  const [catalog, setCatalog] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [financials, setFinancials] = useState<Record<string, FinancialRecord>>({});
  // Opening stock for items not saved yet this month: last month's physical count (default) or book closing
  const [openingDefaults, setOpeningDefaults] = useState<{ book: Record<string, number>; physical: Record<string, number>; prev: string; prevSaved: boolean; prevCounted: number }>({ book: {}, physical: {}, prev: '', prevSaved: false, prevCounted: 0 });
  const [openingBasis, setOpeningBasis] = useState<'physical' | 'book'>('physical');
  const previousClosing = openingBasis === 'physical' ? openingDefaults.physical : openingDefaults.book;
  // Unsaved edits: a VA submitting a villa must not reload (and wipe) them
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [allocDirty, setAllocDirty] = useState(false);
  const [emptyVillasStr, setEmptyVillasStr] = useState<string>('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Matrix view options
  const [showVillas, setShowVillas] = useState(false);
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [showMissing, setShowMissing] = useState(false);
  const [setupItemSearch, setSetupItemSearch] = useState('');
  const { confirmAction } = useConfirm();
  
  const [hosts, setHosts] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [excludedItems, setExcludedItems] = useState<string[]>([]);
  const [fullCatalog, setFullCatalog] = useState<any[]>([]);
  const [doubleVillasStr, setDoubleVillasStr] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Search State for Hosts
  const [hostSearch, setHostSearch] = useState('');
  const [showHostDropdown, setShowHostDropdown] = useState(false);

  // Extraction State
  const [extractDate, setExtractDate] = useState(getDhakaDateStr());
  const [isExtracting, setIsExtracting] = useState(false);

  // CSV Import Refs & State
  const salesFileInputRef = useRef<HTMLInputElement>(null);
  const transfersFileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<{ isOpen: boolean, type: 'sales' | 'transfers', rows: ImportRow[] }>({
      isOpen: false,
      type: 'sales',
      rows: []
  });

  // --- STORE AUDIT STATE ---
  const [isStoreAuditOpen, setIsStoreAuditOpen] = useState(false);
  const [storeCounts, setStoreCounts] = useState<Record<string, number>>({});
  const [storeKeypadTarget, setStoreKeypadTarget] = useState<string | null>(null);
  const [storeKeypadValue, setStoreKeypadValue] = useState<string>('');
  const [storeSearchQuery, setStoreSearchQuery] = useState('');

  // --- DYNAMIC VILLA LIST (Splits double villas) ---
  const doubleList = useMemo(() => splitList(doubleVillasStr), [doubleVillasStr]);
  const activeVillaList = useMemo(() => villaList(doubleList), [doubleList]);
  // Villas with no minibar (kept on the list, shown as "empty", never counted as missing)
  const emptyVillas = useMemo(() => new Set(parseMbVillas(emptyVillasStr, doubleList)), [emptyVillasStr, doubleList]);

  // VA counts only (safe to reload any time: it never touches unsaved P&L or allocation edits)
  const fetchSubmissions = useCallback(async () => {
    try {
      const subs = await loadMbSubmissions(selectedMonth);
      setSubmissions(Object.values(latestByVilla(subs)));
    } catch (e: any) {
      toast.error('Could not load villa counts: ' + (e?.message || 'error'));
    }
  }, [selectedMonth]);

  const fetchMonthlyData = useCallback(async () => {
    setIsLoading(true);
    const allocDate = `${selectedMonth}-01`;

    const [, allocRes, finRes, openDef] = await Promise.all([
        fetchSubmissions(),
        supabase.from('hsk_minibar_allocations').select('*').eq('date', allocDate),
        supabase.from('hsk_monthly_minibar').select('*').eq('month_period', selectedMonth),
        loadOpeningDefaults(selectedMonth, activeVillaList).catch(() => null),
    ]);

    const allocMap: Record<string, string> = {};
    (allocRes.data || []).forEach(a => { allocMap[a.host_id] = a.villas; });
    setAllocations(allocMap);
    setAllocDirty(false);

    if (openDef) setOpeningDefaults(openDef);

    const finMap: Record<string, FinancialRecord> = {};
    (finRes.data || []).forEach(f => {
        finMap[f.article_number] = {
            opening_stock: f.opening_stock || 0,
            transfer_in: f.transfer_in || 0,
            transfer_out: f.transfer_out || 0,
            sales: f.sales || 0,
            minibar_store: f.minibar_store || 0,
            comments: f.comments || ''
        };
    });
    setFinancials(finMap);
    setMatrixDirty(false);

    setIsLoading(false);
  }, [selectedMonth, fetchSubmissions, activeVillaList]);

  useEffect(() => {
    setIsMounted(true);
    fetchCatalogAndSettings();
  }, []);

  useEffect(() => {
    if (!isMounted || !settingsLoaded) return;
    fetchMonthlyData();
  // Not on every Setup keystroke: that would reload and wipe unsaved Matrix edits
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, isMounted, settingsLoaded]);

  useEffect(() => {
    if (!isMounted) return;

    const channel = supabase
        .channel('realtime_inventory')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'hsk_villa_minibar_inventory' }, 
            (payload) => {
                const newRecord = payload.new as any;
                if (!newRecord || !newRecord.logged_at) return;
                
                const recordMonth = newRecord.month_period || new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Maldives', year: 'numeric', month: '2-digit' }).format(new Date(newRecord.logged_at)).slice(0, 7);
                
                if (recordMonth === selectedMonth) {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        toast.success(`${String(newRecord.host_name || 'Attendant').split(' ')[0]} counted Villa ${newRecord.villa_number}`, {
                            icon: '🔔',
                            style: { background: '#FDFBFD', color: '#6D2158', border: '1px solid #6D2158', fontWeight: 'bold' },
                            duration: 4000,
                        });
                    }
                    // Only the villa counts reload: unsaved P&L / allocation edits stay
                    fetchSubmissions();
                }
            }
        )
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedMonth, isMounted, fetchSubmissions]);

  const fetchCatalogAndSettings = async () => {
    const [catRes, hostRes, constRes] = await Promise.all([
        supabase.from('hsk_master_catalog').select('*').eq('is_minibar_item', true),
        supabase.from('hsk_hosts').select('*').order('full_name'),
        supabase.from('hsk_constants').select('*').in('type', ['hidden_mb_item', 'double_mb_villas', 'mb_inv_status', 'mb_active_period', EMPTY_MB_TYPE, MB_EXCLUDE_TYPE]) 
    ]);

    if (catRes.data) {
        const sortedCatalog = catRes.data.sort((a, b) => {
            const orderA = a.sort_order || 9999;
            const orderB = b.sort_order || 9999;
            if (orderA !== orderB) return orderA - orderB;
            return getCategoryWeight(a.category) - getCategoryWeight(b.category) || a.article_name.localeCompare(b.article_name);
        });
        // Items marked "Not in inventory" (complimentary / not minibar) stay out of the matrix
        const excluded = (constRes.data || []).filter(c => c.type === MB_EXCLUDE_TYPE).map(c => c.label);
        setExcludedItems(excluded);
        setFullCatalog(sortedCatalog);
        setCatalog(sortedCatalog.filter(i => !excluded.includes(i.article_number)));
    }
    
    if (hostRes.data) setHosts(hostRes.data);
    
    if (constRes.data) {
        setHiddenItems(constRes.data.filter(h => h.type === 'hidden_mb_item').map(h => h.label));
        const dv = constRes.data.find(h => h.type === 'double_mb_villas');
        if (dv) setDoubleVillasStr(dv.label);
        const ev = constRes.data.find(h => h.type === EMPTY_MB_TYPE);
        setEmptyVillasStr(ev ? ev.label : '');

        const status = constRes.data.find(h => h.type === 'mb_inv_status')?.label as 'OPEN' | 'CLOSED' || 'CLOSED';
        setInvStatus(status);
        
        const period = constRes.data.find(h => h.type === 'mb_active_period')?.label;
        if (period) {
            setActivePeriod(period);
        }
    }
    setSettingsLoaded(true);
  };

  const toggleInventoryStatus = async () => {
      const newStatus = invStatus === 'OPEN' ? 'CLOSED' : 'OPEN';
      setIsSaving(true);
      
      // Write the new value first, then remove the old one: a failure never leaves it blank
      const swap = async (type: string, label: string) => {
          const { data: old } = await supabase.from('hsk_constants').select('id').eq('type', type);
          const { error } = await supabase.from('hsk_constants').insert({ type, label });
          if (error) throw error;
          const ids = (old || []).map(o => o.id);
          if (ids.length) await supabase.from('hsk_constants').delete().in('id', ids);
      };
      try {
          if (newStatus === 'OPEN' && selectedMonth !== activePeriod) {
              await swap('mb_active_period', selectedMonth);
              setActivePeriod(selectedMonth);
          }
          await swap('mb_inv_status', newStatus);
          setInvStatus(newStatus);
          toast.success(newStatus === 'OPEN' ? `${selectedMonth} inventory is open: VAs can count` : 'Inventory locked');
      } catch (e: any) {
          toast.error('Could not change: ' + (e?.message || 'error'));
      }
      setIsSaving(false);
  };

  const handleExtractAllocations = async () => {
      setIsExtracting(true);
      // Villa board only: water room, PA, laundry etc. also list villa numbers but don't count minibars
      const { data, error } = await supabase.from('hsk_allocations').select('host_id, task_details, area').eq('report_date', extractDate).eq('area', 'villa');
      
      if (error) {
          toast.error("Extraction Error: " + error.message);
      } else if (data && data.length > 0) {
          const newAlloc: Record<string, string> = { ...allocations };
          let matchCount = 0;
          
          data.forEach(d => {
              const villasOnly = parseMbVillas(d.task_details || '', doubleList).filter(v => !emptyVillas.has(v));
              if (!villasOnly.length) return;

              const matchedHost = hosts.find(h => h.id === d.host_id || h.host_id === d.host_id);
              if (matchedHost) {
                  newAlloc[matchedHost.host_id] = villasOnly.join(', ');
                  matchCount++;
              }
          });
          
          setAllocations(newAlloc);
          setAllocDirty(true);
          if (matchCount > 0) {
              toast.success(`${matchCount} allocations imported from ${extractDate}! (Remember to save)`);
          } else {
              toast.error("Data extracted, but couldn't find any staff with valid villa assignments.");
          }
      } else {
          toast.error(`No daily allocations found for ${extractDate}.`);
      }
      setIsExtracting(false);
  };

  const handleSaveAllocations = async () => {
      setIsSaving(true);
      const toInsert = [];
      const allocDate = `${selectedMonth}-01`;

      for (const [host_id, villas] of Object.entries(allocations)) {
          if (villas.trim() !== '') {
              toInsert.push({ date: allocDate, host_id, villas });
          }
      }

      // New rows first, then remove the old ones: a failed save never leaves the month empty
      let hasError = false;
      const { data: oldRows, error: readErr } = await supabase.from('hsk_minibar_allocations').select('id').eq('date', allocDate);
      if (readErr) { toast.error("Could not read allocations: " + readErr.message); setIsSaving(false); return; }
      if (toInsert.length > 0) {
          const { error: insErr } = await supabase.from('hsk_minibar_allocations').insert(toInsert);
          if (insErr) { toast.error("Save failed, nothing changed: " + insErr.message); hasError = true; }
      }
      const oldIds = (oldRows || []).map((r: any) => r.id);
      if (!hasError && oldIds.length) {
          const { error: delErr } = await supabase.from('hsk_minibar_allocations').delete().in('id', oldIds);
          if (delErr) { toast.error("Saved, but old rows remain: " + delErr.message); hasError = true; }
      }
      
      if (!hasError) { toast.success(`Allocations saved for ${selectedMonth}`); setAllocDirty(false); }
      setIsSaving(false);
  };

  const saveListConstant = async (type: string, value: string, done: string) => {
      setIsSaving(true);
      try {
          const { data: old } = await supabase.from('hsk_constants').select('id').eq('type', type);
          if (value.trim()) {
              const { error } = await supabase.from('hsk_constants').insert({ type, label: value.trim() });
              if (error) throw error;
          }
          const ids = (old || []).map(o => o.id);
          if (ids.length) await supabase.from('hsk_constants').delete().in('id', ids);
          toast.success(done);
      } catch (e: any) {
          toast.error('Could not save: ' + (e?.message || 'error'));
      }
      setIsSaving(false);
  };
  const handleSaveDoubleVillas = () => saveListConstant('double_mb_villas', doubleVillasStr, 'Villa splits saved');
  // Saved even when cleared (an empty label row would be skipped, so keep a placeholder "-")
  const handleSaveEmptyVillas = () => saveListConstant(EMPTY_MB_TYPE, emptyVillasStr.trim() || '-', 'Villas without minibar saved');

  // Counted (VAs count it) → Hidden from VAs (still in the P&L) → Not in inventory (left out everywhere)
  const setItemState = async (articleNo: string, state: 'counted' | 'hidden' | 'excluded') => {
      const ops: PromiseLike<{ error: any }>[] = [
          supabase.from('hsk_constants').delete().match({ type: 'hidden_mb_item', label: articleNo }),
          supabase.from('hsk_constants').delete().match({ type: MB_EXCLUDE_TYPE, label: articleNo }),
      ];
      const results = await Promise.all(ops);
      let err = results.find(r => r.error)?.error;
      if (!err && state !== 'counted') err = (await supabase.from('hsk_constants').insert({ type: state === 'hidden' ? 'hidden_mb_item' : MB_EXCLUDE_TYPE, label: articleNo })).error;
      if (err) { toast.error('Could not change: ' + err.message); return; }
      setHiddenItems(prev => [...prev.filter(a => a !== articleNo), ...(state === 'hidden' ? [articleNo] : [])]);
      setExcludedItems(prev => [...prev.filter(a => a !== articleNo), ...(state === 'excluded' ? [articleNo] : [])]);
      setCatalog(fullCatalog.filter(i => (i.article_number === articleNo ? state !== 'excluded' : !excludedItems.includes(i.article_number))));
  };

  const toggleHiddenItem = async (articleNo: string, isCurrentlyHidden: boolean) => {
      const { error } = isCurrentlyHidden
          ? await supabase.from('hsk_constants').delete().match({ type: 'hidden_mb_item', label: articleNo })
          : await supabase.from('hsk_constants').insert({ type: 'hidden_mb_item', label: articleNo });
      if (error) { toast.error('Could not change: ' + error.message); return; }
      setHiddenItems(prev => isCurrentlyHidden ? prev.filter(a => a !== articleNo) : [...prev, articleNo]);
  };

  // VAs count their villas on My Tasks (the old /minibar/inventory/mobile page no longer exists)
  const copyMobileLink = () => {
    const url = `${window.location.origin}/my-tasks`;
    navigator.clipboard.writeText(url).then(() => toast.success("VA count link (My Tasks) copied")).catch(() => toast(url));
  };

  const matrixDict = useMemo(() => {
    const dict: Record<string, Record<string, number>> = {};
    
    activeVillaList.forEach(v => dict[v] = {});
    submissions.forEach(sub => {
        if (!dict[sub.villa_number]) dict[sub.villa_number] = {};
        if (sub.inventory_data && Array.isArray(sub.inventory_data)) {
            sub.inventory_data.forEach((item: any) => {
                dict[sub.villa_number][item.article_number] = item.qty;
            });
        }
    });
    return dict;
  }, [submissions, activeVillaList]);

  // --- EXCEL EXPORT LOGIC ---
  const exportToExcel = async () => {
      setIsExporting(true);
      try {
          const wb = new ExcelJS.Workbook();
          const ws = wb.addWorksheet('Minibar P&L Matrix', {
              views: [{ state: 'frozen', xSplit: 6, ySplit: 2 }]
          });

          const headerRow = [
              "Category", "Micros Name", "Art #", "Article Name", "Unit", "Avg Cost", "Sell Price",
              "Open Stk", "Open Val", "Trans IN", "Trans OUT", "Sales", "Sales Val", "COS", "COS %", "SOH Clos", "Close Val",
              ...activeVillaList,
              "Villa Total", "MB Store", "Total Phys", "Var Qty", "Var Val", "Comments"
          ];

          // 1. Add Main Title
          ws.addRow(['MINIBAR P&L MATRIX - ' + selectedMonth]);
          ws.mergeCells(1, 1, 1, headerRow.length);
          const titleCell = ws.getCell(1, 1);
          titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
          titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D2158' } };
          titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
          ws.getRow(1).height = 35;

          // 2. Add Table Headers
          const headerRowObj = ws.addRow(headerRow);
          headerRowObj.eachCell((cell) => {
              cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
              cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
              cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          });
          ws.getRow(2).height = 25;

          // 3. Widths
          const baseWidths = [15, 25, 10, 35, 8, 12, 12, 10, 12, 10, 10, 10, 12, 12, 10, 12, 12];
          const villaWidths = activeVillaList.map(() => 6);
          const endWidths = [12, 12, 12, 10, 12, 40];
          const allWidths = [...baseWidths, ...villaWidths, ...endWidths];
          allWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

          // 4. Rows
          catalog.forEach(item => {
              const artNo = item.article_number;
              const fin = financials[artNo] || { opening_stock: previousClosing[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
              const avgCost = parseFloat(item.avg_cost) || 0;
              const salePrice = parseFloat(item.sales_price) || 0;
              
              const opVal = fin.opening_stock * avgCost;
              const salesVal = fin.sales * salePrice;
              const cos = fin.sales * avgCost;
              const cosPct = salesVal > 0 ? (cos / salesVal) : 0; 
              const soh = fin.opening_stock + fin.transfer_in - fin.transfer_out - fin.sales;
              const closingVal = soh * avgCost;
              
              const villaTotal = activeVillaList.reduce((sum, v) => sum + (matrixDict[v]?.[artNo] || 0), 0);
              const physTotal = villaTotal + fin.minibar_store;
              const varQty = physTotal - soh;
              const varVal = varQty * avgCost;

              const rowData = [
                  item.category, item.micros_name || '', artNo, item.article_name, item.unit,
                  avgCost, salePrice,
                  fin.opening_stock, opVal, fin.transfer_in, fin.transfer_out,
                  fin.sales, salesVal, cos, cosPct,
                  soh, closingVal,
                  ...activeVillaList.map(v => matrixDict[v]?.[artNo] || 0),
                  villaTotal, fin.minibar_store, physTotal,
                  varQty, varVal, fin.comments || ''
              ];

              const row = ws.addRow(rowData);
              row.height = 22;

              row.getCell(6).numFmt = '"$"#,##0.00'; 
              row.getCell(7).numFmt = '"$"#,##0.00'; 
              row.getCell(9).numFmt = '"$"#,##0.00'; 
              row.getCell(13).numFmt = '"$"#,##0.00'; 
              row.getCell(14).numFmt = '"$"#,##0.00'; 
              row.getCell(15).numFmt = '0.0%'; 
              row.getCell(17).numFmt = '"$"#,##0.00'; 

              const offset = 17 + activeVillaList.length;
              row.getCell(offset + 5).numFmt = '"$"#,##0.00'; 

              row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                  cell.alignment = { vertical: 'middle', horizontal: colNumber <= 4 || colNumber === offset + 6 ? 'left' : 'center' };
                  cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
              });

              row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; 
              row.getCell(8).font = { color: { argb: 'FF1D4ED8' }, bold: true };
              
              row.getCell(16).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF4FF' } }; 
              row.getCell(16).font = { color: { argb: 'FF86198F' }, bold: true };

              row.getCell(offset + 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF4FF' } }; 
              row.getCell(offset + 3).font = { color: { argb: 'FF86198F' }, bold: true };

              const varQtyCell = row.getCell(offset + 4);
              if (varQty < 0) {
                  varQtyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
                  varQtyCell.font = { color: { argb: 'FFE11D48' }, bold: true };
              } else if (varQty > 0) {
                  varQtyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFEF3' } };
                  varQtyCell.font = { color: { argb: 'FFD97706' }, bold: true };
              } else {
                  varQtyCell.font = { color: { argb: 'FF10B981' }, bold: true };
              }
          });

          const buffer = await wb.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Minibar_Working_Matrix_${selectedMonth}.xlsx`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

      } catch (error) {
          console.error("Excel generation error:", error);
          toast.error("Error generating the Excel file.");
      } finally {
          setIsExporting(false);
      }
  };

  // --- CSV IMPORT LOGIC (WITH REVIEW MODAL) ---
  const downloadCSVTemplate = (type: 'sales' | 'transfers') => {
      let csvContent = "";
      let filename = "";

      if (type === 'sales') {
          csvContent = "Micros Name,Qty\nCoca Cola 330ml,10\nSnickers Bar,5";
          filename = "Minibar_Sales_Import_Format.csv";
      } else {
          csvContent = "Article Name,In,Out\nCoca Cola 330ml,24,0\nSnickers Bar,0,10";
          filename = "Minibar_Transfers_Import_Format.csv";
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const parseCSVLine = (line: string) => {
      // Properly splits by commas, respecting quotes, and keeping spaces inside values
      return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/(^"|"$)/g, '').trim());
  };

  // Sales come straight from the Micros export (.xlsx / .xls / .csv); transfers from a simple CSV.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'sales' | 'transfers') => {
      const file = e.target.files?.[0];
      e.target.value = ''; // same file can be picked again
      if (!file) return;
      let csv = '';
      try {
          csv = isExcelFile(file.name) ? await excelFileToCsv(file) : await file.text();
      } catch {
          toast.error('Could not read that file');
          return;
      }
      processImport(csv, type, file.name);
  };

  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchItem = (name: string, fields: ('micros_name' | 'article_name' | 'generic_name')[]) => {
      const n = norm(name);
      if (!n) return null;
      for (const f of fields) { const hit = catalog.find(c => norm(c[f]) === n); if (hit) return hit; }
      // Unique partial match ("Coca Cola MB 330" ↔ "Coca Cola MB")
      const partial = catalog.filter(c => fields.some(f => { const v = norm(c[f]); return v.length > 3 && (n.includes(v) || v.includes(n)); }));
      return partial.length === 1 ? partial[0] : null;
  };

  const processImport = (csv: string, type: 'sales' | 'transfers', fileName: string) => {
      const lines = csv.split(/\r?\n/);
      const parsedRows: ImportRow[] = [];

      if (type === 'sales') {
          // Micros reports start with title lines: find the header row (an item/name column and a quantity column)
          const isQtyHeader = (h: string) => /qty|quantity|count|sold|\bno\b|^#$/.test(h) && !/amount|value|price|\$|net|gross|%/.test(h);
          const isNameHeader = (h: string) => /micros|menu ?item|item|name|description|article/.test(h) && !/number|no\.|#|group|class|category/.test(h);
          let headerAt = -1, nameIdx = -1, qtyIdx = -1;
          for (let i = 0; i < Math.min(lines.length, 40) && headerAt < 0; i++) {
              const h = parseCSVLine(lines[i].toLowerCase());
              const ni = h.findIndex(isNameHeader);
              const qi = h.findIndex(isQtyHeader);
              if (ni > -1 && qi > -1) { headerAt = i; nameIdx = ni; qtyIdx = qi; }
          }
          if (headerAt < 0) {
              toast.error(`${fileName}: no item name + quantity columns found. The file needs columns like “Menu Item” and “Qty”.`);
              return;
          }
          // Same item on several lines (per day / revenue centre) → add them up
          const sums = new Map<string, number>();
          for (let i = headerAt + 1; i < lines.length; i++) {
              const cols = parseCSVLine(lines[i]);
              const name = (cols[nameIdx] || '').trim();
              const qty = parseFloat(String(cols[qtyIdx] || '').replace(/,/g, '')) || 0;
              if (!name || /^(sub)?total|grand total/i.test(name) || qty <= 0) continue;
              sums.set(name, (sums.get(name) || 0) + qty);
          }
          Array.from(sums.entries()).forEach(([originalName, qty], i) => {
              const hit = matchItem(originalName, ['micros_name', 'article_name', 'generic_name']);
              parsedRows.push({ id: `row-${i}`, originalName, matchedArticleNo: hit ? hit.article_number : null, val1: Math.round(qty), val2: 0 });
          });
      } else {
          const headers = parseCSVLine((lines[0] || '').toLowerCase());
          const nameIdx = headers.findIndex(h => h.includes('article') || h.includes('name') || h.includes('item'));
          const inIdx = headers.findIndex(h => h === 'in' || h.includes('transfer in'));
          const outIdx = headers.findIndex(h => h === 'out' || h.includes('transfer out'));
          if (nameIdx === -1 || (inIdx === -1 && outIdx === -1)) {
              toast.error("Transfers file must contain 'Article Name' and 'In'/'Out' columns.");
              return;
          }
          for (let i = 1; i < lines.length; i++) {
              const cols = parseCSVLine(lines[i]);
              const originalName = cols[nameIdx] || '';
              if (!originalName) continue;
              const tIn = inIdx !== -1 && cols[inIdx] ? (parseInt(cols[inIdx], 10) || 0) : 0;
              const tOut = outIdx !== -1 && cols[outIdx] ? (parseInt(cols[outIdx], 10) || 0) : 0;
              if (tIn > 0 || tOut > 0) {
                  const hit = matchItem(originalName, ['article_name', 'generic_name', 'micros_name']);
                  parsedRows.push({ id: `row-${i}`, originalName, matchedArticleNo: hit ? hit.article_number : null, val1: tIn, val2: tOut });
              }
          }
      }

      if (parsedRows.length === 0) toast.error("No quantities found to import.");
      else setImportState({ isOpen: true, type, rows: parsedRows });
  };

  const updateImportRowMapping = (id: string, articleNo: string | null) => {
      setImportState(prev => ({
          ...prev,
          rows: prev.rows.map(r => r.id === id ? { ...r, matchedArticleNo: articleNo } : r)
      }));
  };

  const finalizeCSVImport = () => {
      const { type, rows } = importState;
      let updatedCount = 0;
      
      setFinancials(prev => {
          const next = { ...prev };
          
          rows.forEach(row => {
              if (row.matchedArticleNo) {
                  const artNo = row.matchedArticleNo;
                  if (!next[artNo]) {
                      next[artNo] = { opening_stock: previousClosing[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
                  } else {
                      // Deep copy the existing item to avoid React Strict Mode double-mutation
                      next[artNo] = { ...next[artNo] };
                  }
                  
                  if (type === 'sales') {
                      next[artNo].sales = row.val1;
                      updatedCount++;
                  } else if (type === 'transfers') {
                      if (row.val1 > 0) next[artNo].transfer_in = row.val1;
                      if (row.val2 > 0) next[artNo].transfer_out = row.val2;
                      updatedCount++;
                  }
              }
          });
          
          return next;
      });

      setImportState({ isOpen: false, type: 'sales', rows: [] });
      setMatrixDirty(true);
      toast.success(`Successfully mapped and imported ${updatedCount} items into the matrix.`);
  };

  // --- MATRIX STATE UPDATERS ---
  const updateFin = (artNo: string, field: keyof FinancialRecord, val: any) => {
      setMatrixDirty(true);
      setFinancials(prev => ({
          ...prev,
          [artNo]: {
              ...(prev[artNo] || { opening_stock: previousClosing[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' }),
              [field]: val
          }
      }));
  };

  const updateCat = (artNo: string, field: string, val: any) => {
      setMatrixDirty(true);
      setCatalog(prev => prev.map(c => c.article_number === artNo ? {...c, [field]: val} : c));
  };

  // --- SAVE ENTIRE MATRIX ---
  const handleSaveMatrix = async () => {
      setIsSavingMatrix(true);
      
      try {
          // 1. Prepare Catalog Updates (Prices/Micros Info)
          const catalogUpdates = catalog.map(c => ({
              article_number: c.article_number,
              article_name: c.article_name,
              generic_name: c.generic_name || c.article_name,
              category: c.category,
              unit: c.unit || 'Each',
              is_minibar_item: true,
              micros_no: c.micros_no || '',
              sales_price: parseFloat(c.sales_price) || 0,
              avg_cost: parseFloat(c.avg_cost) || 0,
              sort_order: parseInt(c.sort_order) || 0,
          }));
          
          // Upsert Catalog
          const { error: catErr } = await supabase.from('hsk_master_catalog').upsert(catalogUpdates, { onConflict: 'article_number' });
          if (catErr) throw new Error("Catalog Error: " + catErr.message);

          // 2. Prepare Financials Updates
          const finUpdates = catalog.map(c => {
              const artNo = c.article_number;
              const fin = financials[artNo] || { opening_stock: previousClosing[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
              return {
                  month_period: selectedMonth,
                  article_number: artNo,
                  opening_stock: fin.opening_stock || 0,
                  transfer_in: fin.transfer_in || 0,
                  transfer_out: fin.transfer_out || 0,
                  sales: fin.sales || 0,
                  minibar_store: fin.minibar_store || 0,
                  comments: fin.comments || ''
              };
          });

          if (finUpdates.length > 0) {
              const { error: finErr } = await supabase.from('hsk_monthly_minibar').upsert(finUpdates, { onConflict: 'month_period, article_number' });
              if (finErr) throw new Error("Financials Error: " + finErr.message);
          }

          setMatrixDirty(false);
          toast.success(`Matrix saved successfully for ${selectedMonth}!`);
      } catch (err: any) {
          toast.error(err.message || "Failed to save Matrix.");
      }
      
      setIsSavingMatrix(false);
  };

  // Fill every item's opening stock from last month (physical count or book closing)
  const applyOpening = (basis: 'physical' | 'book') => {
      const src = basis === 'physical' ? openingDefaults.physical : openingDefaults.book;
      setOpeningBasis(basis);
      setFinancials(prev => {
          const next = { ...prev };
          catalog.forEach(c => {
              const a = c.article_number;
              next[a] = { ...(next[a] || { transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' }), opening_stock: src[a] || 0 } as FinancialRecord;
          });
          return next;
      });
      setMatrixDirty(true);
      toast.success(`Opening stock filled from ${openingDefaults.prev} ${basis === 'physical' ? 'physical count' : 'book closing'}. Save to keep it.`);
  };

  // Coverage: which villas with a minibar are counted
  const coverage = useMemo(() => {
      const counted = new Set(submissions.map(s => s.villa_number));
      const withMb = activeVillaList.filter(v => !emptyVillas.has(v));
      return { withMb: withMb.length, counted: withMb.filter(v => counted.has(v)).length, missing: withMb.filter(v => !counted.has(v)), empty: activeVillaList.length - withMb.length };
  }, [submissions, activeVillaList, emptyVillas]);

  // Allocation checks: villas given to two people / villas with a minibar given to nobody
  const allocCheck = useMemo(() => {
      const owner: Record<string, string[]> = {};
      Object.entries(allocations).forEach(([hid, v]) => parseMbVillas(v || '', doubleList).forEach(x => (owner[x] ||= []).push(hid)));
      const twice = Object.entries(owner).filter(([, o]) => o.length > 1).map(([v]) => v);
      const nobody = activeVillaList.filter(v => !emptyVillas.has(v) && !owner[v]);
      return { twice, nobody };
  }, [allocations, doubleList, activeVillaList, emptyVillas]);

  // --- MB STORE AUDIT LOGIC (WITH CALCULATOR) ---
  const startStoreAudit = () => {
      const initialCounts: Record<string, number> = {};
      catalog.forEach(item => {
          initialCounts[item.article_number] = financials[item.article_number]?.minibar_store || 0;
      });
      setStoreCounts(initialCounts);
      setStoreSearchQuery('');
      setIsStoreAuditOpen(true);
  };

  const updateStoreCount = (article_number: string, delta: number) => {
      setStoreCounts(prev => {
          const next = (prev[article_number] || 0) + delta;
          return { ...prev, [article_number]: next < 0 ? 0 : next };
      });
  };

  const handleStoreKeypadPress = (val: string) => {
      if (val === 'DEL') {
          setStoreKeypadValue(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
      } else if (val === 'CLR') {
          setStoreKeypadValue('0');
      } else if (val === '=') {
          try {
              const sanitized = storeKeypadValue.replace(/[^-()\d/*+.]/g, '');
              if (sanitized) {
                  const result = new Function('return ' + sanitized)();
                  setStoreKeypadValue(String(Math.max(0, Math.floor(result))));
              }
          } catch(e) {
              toast.error("Invalid calculation");
          }
      } else {
          setStoreKeypadValue(prev => {
              const isOp = ['+', '-', '*'].includes(val);
              const lastChar = prev.slice(-1);
              const isLastOp = ['+', '-', '*'].includes(lastChar);
              
              if (isOp && isLastOp) {
                  return prev.slice(0, -1) + val;
              }
              if (prev === '0' && !isOp) return val;
              return prev + val;
          });
      }
  };

  const saveStoreKeypadValue = () => {
      if (storeKeypadTarget) {
          try {
              const sanitized = storeKeypadValue.replace(/[^-()\d/*+.]/g, '');
              const result = sanitized ? new Function('return ' + sanitized)() : 0;
              const num = Math.max(0, Math.floor(result));
              setStoreCounts(prev => ({ ...prev, [storeKeypadTarget]: isNaN(num) ? 0 : num }));
          } catch(e) {
              setStoreCounts(prev => ({ ...prev, [storeKeypadTarget]: 0 }));
          }
      }
      setStoreKeypadTarget(null);
  };

  const confirmStoreAudit = async () => {
      // 1. Prepare next state
      const nextFin = { ...financials };
      Object.entries(storeCounts).forEach(([artNo, count]) => {
          if (!nextFin[artNo]) {
              nextFin[artNo] = { opening_stock: previousClosing[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
          } else {
              nextFin[artNo] = { ...nextFin[artNo] };
          }
          nextFin[artNo].minibar_store = count;
      });

      // 2. Update local state immediately & Close modal
      setFinancials(nextFin);
      setIsStoreAuditOpen(false);

      // 3. Force Database Save so amounts don't disappear on reload
      setIsSavingMatrix(true);
      try {
          const finUpdates = catalog.map(c => {
              const artNo = c.article_number;
              const fin = nextFin[artNo] || { opening_stock: previousClosing[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
              return {
                  month_period: selectedMonth,
                  article_number: artNo,
                  opening_stock: fin.opening_stock || 0,
                  transfer_in: fin.transfer_in || 0,
                  transfer_out: fin.transfer_out || 0,
                  sales: fin.sales || 0,
                  minibar_store: fin.minibar_store || 0,
                  comments: fin.comments || ''
              };
          });

          if (finUpdates.length > 0) {
              const { error: finErr } = await supabase.from('hsk_monthly_minibar').upsert(finUpdates, { onConflict: 'month_period, article_number' });
              if (finErr) throw new Error("Database Error: " + finErr.message);
          }

          toast.success("MB Store counts saved to Matrix & Database!");
      } catch (err: any) {
          toast.error(err.message || "Failed to save Store Counts.");
      }
      setIsSavingMatrix(false);
  };

  const displayStoreCatalog = useMemo(() => {
      let list = catalog;
      if (storeSearchQuery.trim()) {
          const q = storeSearchQuery.toLowerCase();
          list = list.filter(i => 
              (i.article_name || '').toLowerCase().includes(q) || 
              (i.generic_name || '').toLowerCase().includes(q) ||
              (i.article_number || '').includes(q)
          );
      }
      return list;
  }, [catalog, storeSearchQuery]);


  // ---- Matrix rows (one calculation for KPIs, table and totals) ----
  const rows = useMemo(() => catalog.map(item => {
      const artNo = item.article_number;
      const fin: FinancialRecord = financials[artNo] || { opening_stock: previousClosing[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
      const avgCost = parseFloat(item.avg_cost) || 0;
      const salePrice = parseFloat(item.sales_price) || 0;
      const soh = fin.opening_stock + fin.transfer_in - fin.transfer_out - fin.sales;
      const villaTotal = activeVillaList.reduce((sum, v) => sum + (matrixDict[v]?.[artNo] || 0), 0);
      const physTotal = villaTotal + fin.minibar_store;
      const varQty = physTotal - soh;
      return {
          item, artNo, fin, avgCost, soh, villaTotal, physTotal, varQty,
          opVal: fin.opening_stock * avgCost, salesVal: fin.sales * salePrice, cos: fin.sales * avgCost,
          closeVal: soh * avgCost, physVal: physTotal * avgCost, varVal: varQty * avgCost,
      };
  }), [catalog, financials, previousClosing, activeVillaList, matrixDict]);

  const sumRows = (list: typeof rows) => list.reduce((t, r) => ({
      open: t.open + r.fin.opening_stock, opVal: t.opVal + r.opVal, inQ: t.inQ + r.fin.transfer_in, outQ: t.outQ + r.fin.transfer_out,
      salesQty: t.salesQty + r.fin.sales, salesVal: t.salesVal + r.salesVal, cos: t.cos + r.cos, soh: t.soh + r.soh, closeVal: t.closeVal + r.closeVal,
      villaTotal: t.villaTotal + r.villaTotal, store: t.store + r.fin.minibar_store, physTotal: t.physTotal + r.physTotal, physVal: t.physVal + r.physVal,
      varQty: t.varQty + r.varQty, varVal: t.varVal + r.varVal, shortVal: t.shortVal + Math.min(0, r.varVal), varItems: t.varItems + (r.varQty !== 0 ? 1 : 0),
  }), { open: 0, opVal: 0, inQ: 0, outQ: 0, salesQty: 0, salesVal: 0, cos: 0, soh: 0, closeVal: 0, villaTotal: 0, store: 0, physTotal: 0, physVal: 0, varQty: 0, varVal: 0, shortVal: 0, varItems: 0 });
  const totals = useMemo(() => sumRows(rows), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleRows = useMemo(() => {
      const q = itemSearch.trim().toLowerCase();
      return rows.filter(r => {
          if (varianceOnly && r.varQty === 0) return false;
          if (!q) return true;
          return `${r.item.generic_name || ''} ${r.item.article_name} ${r.artNo} ${r.item.micros_name || ''} ${r.item.category || ''}`.toLowerCase().includes(q);
      });
  }, [rows, itemSearch, varianceOnly]);
  const visTotals = useMemo(() => sumRows(visibleRows), [visibleRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before leaving the page with unsaved edits
  useEffect(() => {
      if (!matrixDirty && !allocDirty) return;
      const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
      window.addEventListener('beforeunload', h);
      return () => window.removeEventListener('beforeunload', h);
  }, [matrixDirty, allocDirty]);

  if (!isMounted) return null;

  const activeHostsForBoard = hosts.filter(h => allocations[h.host_id] !== undefined);
  const availableHostsToAdd = hosts.filter(h => allocations[h.host_id] === undefined);

  const isLive = invStatus === 'OPEN' && selectedMonth === activePeriod;
  const monthLabel = (() => { const [y, m] = selectedMonth.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); })();
  const shiftMonth = (d: number) => {
      if ((matrixDirty || allocDirty) && !window.confirm('You have unsaved changes. Switch month and lose them?')) return;
      const [y, m] = selectedMonth.split('-').map(Number);
      const dt = new Date(y, m - 1 + d, 1);
      setSelectedMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };
  const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const money2 = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
  const counted = new Set(submissions.map(s => s.villa_number));
  const countedByHost = (villas: string) => {
      const list = parseMbVillas(villas || '', doubleList).filter(v => !emptyVillas.has(v));
      return { total: list.length, done: list.filter(v => counted.has(v)).length };
  };
  const villaCols = showVillas ? activeVillaList : [];
  const shownItems = setupItemSearch.trim()
      ? fullCatalog.filter(i => `${i.generic_name || ''} ${i.article_name} ${i.article_number}`.toLowerCase().includes(setupItemSearch.trim().toLowerCase()))
      : fullCatalog;

  const tabBtn = (key: 'MATRIX' | 'ASSIGNMENTS' | 'SETUP', label: string, Icon: React.ElementType, badge?: string) => (
      <button onClick={() => setActiveTab(key)}
          className={`h-10 px-4 rounded-xl text-xs font-black flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === key ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Icon size={15}/> {label}{badge ? <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${activeTab === key ? 'bg-[#6D2158]/10' : 'bg-slate-200/70'}`}>{badge}</span> : null}
      </button>
  );

  return (
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-slate-50 font-sans text-slate-800 overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="flex-none bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex flex-wrap items-center gap-3 z-20">
          <div className="flex items-center gap-3 min-w-0 mr-auto">
              <div className="w-10 h-10 rounded-xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center shrink-0"><Wine size={20}/></div>
              <div className="min-w-0">
                  <h1 className="text-lg font-black text-[#6D2158] leading-tight">Minibar Inventory</h1>
                  <div className="flex items-center gap-1.5 mt-0.5">
                      {isLive
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> Open: VAs can count</span>
                          : <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-500"><Lock size={10}/> {invStatus === 'OPEN' && activePeriod ? `Locked here · ${activePeriod} is open` : 'Locked'}</span>}
                  </div>
              </div>
          </div>

          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
              <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-lg hover:bg-white text-slate-500 flex items-center justify-center" aria-label="Previous month"><ChevronLeft size={16}/></button>
              <label className="relative w-36 text-center cursor-pointer">
                  <span className="text-sm font-black text-[#6D2158]">{monthLabel}</span>
                  <input type="month" value={selectedMonth} onChange={e => { if (!e.target.value) return; if ((matrixDirty || allocDirty) && !window.confirm('You have unsaved changes. Switch month and lose them?')) return; setSelectedMonth(e.target.value); }}
                      className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Month" />
              </label>
              <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-lg hover:bg-white text-slate-500 flex items-center justify-center" aria-label="Next month"><ChevronRight size={16}/></button>
          </div>

          <button onClick={async () => {
                  if (isLive && !(await confirmAction({ title: `Lock ${monthLabel}?`, message: 'VAs will no longer be able to submit counts.', confirmText: 'Lock', isDestructive: true, icon: 'warning' }))) return;
                  if (!isLive && invStatus === 'OPEN' && activePeriod && activePeriod !== selectedMonth && !(await confirmAction({ title: `Open ${monthLabel}?`, message: `${activePeriod} is open now. Opening ${monthLabel} moves VAs to this month.`, confirmText: 'Open this month', icon: 'question' }))) return;
                  toggleInventoryStatus();
              }} disabled={isSaving}
              className={`h-10 px-4 rounded-xl text-xs font-black flex items-center gap-2 text-white shadow-sm disabled:opacity-50 ${isLive ? 'bg-slate-700 hover:bg-slate-800' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {isSaving ? <Loader2 size={15} className="animate-spin"/> : isLive ? <Lock size={15}/> : <Unlock size={15}/>} {isLive ? 'Lock counting' : 'Open for counting'}
          </button>
          <button onClick={copyMobileLink} title="Copy the VA counting link (My Tasks)" className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-[#6D2158] flex items-center justify-center" aria-label="Copy VA link">
              <Link2 size={16}/>
          </button>
      </div>

      {/* ===== TABS ===== */}
      <div className="flex-none px-4 md:px-6 pt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-2xl overflow-x-auto no-scrollbar">
              {tabBtn('MATRIX', 'Matrix', LayoutGrid, `${coverage.counted}/${coverage.withMb}`)}
              {tabBtn('ASSIGNMENTS', 'Allocations', Users, String(activeHostsForBoard.length))}
              {tabBtn('SETUP', 'Setup', Settings)}
          </div>
          {(matrixDirty || allocDirty) && (
              <span className="text-[11px] font-black text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg">Unsaved changes</span>
          )}
      </div>

      {/* ===== CONTENT ===== */}
      <div className="flex-1 overflow-hidden px-4 md:px-6 py-3 flex flex-col gap-3">
        {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={30}/></div>
        ) : activeTab === 'MATRIX' ? (
          <>
            {/* KPI strip */}
            <div className="flex-none grid grid-cols-2 md:grid-cols-5 gap-2">
                <button onClick={() => setShowMissing(s => !s)} className={`text-left bg-white rounded-2xl border p-3 ${coverage.missing.length ? 'border-amber-200' : 'border-emerald-200'}`}>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Minibars counted</p>
                    <p className="text-xl font-black text-slate-800">{coverage.counted}<span className="text-sm text-slate-400">/{coverage.withMb}</span></p>
                    <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className={`h-full ${coverage.missing.length ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${coverage.withMb ? (coverage.counted / coverage.withMb) * 100 : 0}%` }}/></div>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">{coverage.missing.length ? `${coverage.missing.length} to go · tap to see` : 'All counted'}{coverage.empty ? ` · ${coverage.empty} no minibar` : ''}</p>
                </button>
                <div className="bg-white rounded-2xl border border-slate-200 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sales</p>
                    <p className="text-xl font-black text-slate-800">{money(totals.salesVal)}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">{totals.salesQty} items sold</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cost of sales</p>
                    <p className="text-xl font-black text-slate-800">{totals.salesVal ? `${((totals.cos / totals.salesVal) * 100).toFixed(1)}%` : '–'}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">{money(totals.cos)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Closing stock (book)</p>
                    <p className="text-xl font-black text-slate-800">{money(totals.closeVal)}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">Physical {money(totals.physVal)}</p>
                </div>
                <div className={`rounded-2xl border p-3 col-span-2 md:col-span-1 ${totals.varVal < -0.5 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Variance (net)</p>
                    <p className={`text-xl font-black ${totals.varVal < -0.5 ? 'text-rose-600' : totals.varVal > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>{totals.varVal > 0 ? '+' : ''}{money(totals.varVal)}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">{totals.varItems} item{totals.varItems === 1 ? '' : 's'} off · short {money(totals.shortVal)}</p>
                </div>
            </div>

            {(showMissing && coverage.missing.length > 0) && (
                <div className="flex-none bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-amber-900">
                    Not counted yet: {coverage.missing.join(', ')}. Their stock is missing from the physical total, so it shows as variance.
                </div>
            )}
            {!openingDefaults.prevSaved && Object.keys(financials).length === 0 && (
                <div className="flex-none bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-rose-800">
                    {openingDefaults.prev} P&amp;L was never saved: opening stock comes from its villa counts only (no MB Store). Check it before saving.
                </div>
            )}

            {/* Toolbar */}
            <div className="flex-none bg-white rounded-2xl border border-slate-200 p-2 flex flex-wrap items-center gap-2">
                <input type="file" accept=".xlsx,.xls,.xlsm,.csv" ref={salesFileInputRef} onChange={(e) => handleFileUpload(e, 'sales')} className="hidden" />
                <input type="file" accept=".csv" ref={transfersFileInputRef} onChange={(e) => handleFileUpload(e, 'transfers')} className="hidden" />
                <div className="relative w-full sm:w-56">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Find item or Art #" className="w-full h-9 pl-8 pr-7 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#6D2158] focus:bg-white"/>
                    {itemSearch && <button onClick={() => setItemSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear"><X size={13}/></button>}
                </div>
                <button onClick={() => setVarianceOnly(v => !v)} className={`h-9 px-3 rounded-lg text-[11px] font-black flex items-center gap-1.5 border ${varianceOnly ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    <TrendingDown size={13}/> Variance only
                </button>
                <button onClick={() => setShowVillas(v => !v)} className={`h-9 px-3 rounded-lg text-[11px] font-black flex items-center gap-1.5 border ${showVillas ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    <Columns3 size={13}/> {showVillas ? 'Hide villa columns' : 'Show villa columns'}
                </button>
                <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5" title={`Opening stock for items not saved yet, from ${openingDefaults.prev || 'last month'}`}>
                    <span className="text-[10px] font-bold text-slate-400 px-1.5 whitespace-nowrap">Opening from {openingDefaults.prev}</span>
                    {(['physical', 'book'] as const).map(b => (
                        <button key={b} onClick={() => applyOpening(b)} className={`h-7 px-2 rounded-md text-[10px] font-black ${openingBasis === b ? 'bg-[#6D2158] text-white' : 'text-slate-500 hover:bg-white'}`}>
                            {b === 'physical' ? 'Physical' : 'Book'}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-lg border border-blue-200 overflow-hidden">
                        <button onClick={() => salesFileInputRef.current?.click()} title="Upload the Micros sales export (.xlsx or .csv)" className="h-9 px-3 bg-blue-50 text-blue-700 text-[11px] font-black flex items-center gap-1.5 hover:bg-blue-100"><Upload size={13}/> Micros sales</button>
                        <button onClick={() => downloadCSVTemplate('sales')} title="Sales CSV template" className="h-9 px-2 bg-blue-50 text-blue-500 border-l border-blue-200 hover:bg-blue-100"><Download size={12}/></button>
                    </div>
                    <div className="flex items-center rounded-lg border border-amber-200 overflow-hidden">
                        <button onClick={() => transfersFileInputRef.current?.click()} className="h-9 px-3 bg-amber-50 text-amber-700 text-[11px] font-black flex items-center gap-1.5 hover:bg-amber-100"><Upload size={13}/> Transfers</button>
                        <button onClick={() => downloadCSVTemplate('transfers')} title="Transfers CSV template" className="h-9 px-2 bg-amber-50 text-amber-500 border-l border-amber-200 hover:bg-amber-100"><Download size={12}/></button>
                    </div>
                    <button onClick={startStoreAudit} className="h-9 px-3 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-black flex items-center gap-1.5 hover:bg-purple-100"><PackageSearch size={13}/> Count MB Store</button>
                    <button onClick={exportToExcel} disabled={isExporting} className="h-9 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-black flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50">
                        {isExporting ? <Loader2 size={13} className="animate-spin"/> : <FileSpreadsheet size={13}/>} Excel
                    </button>
                    <button onClick={handleSaveMatrix} disabled={isSavingMatrix}
                        className={`h-9 px-4 rounded-lg text-[11px] font-black flex items-center gap-1.5 text-white disabled:opacity-50 ${matrixDirty ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300 animate-pulse' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                        {isSavingMatrix ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} Save P&amp;L
                    </button>
                </div>
            </div>

            {/* Matrix */}
            <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 overflow-auto custom-scrollbar">
                <table className="w-max min-w-full border-separate border-spacing-0 text-[11px] whitespace-nowrap">
                    <thead className="sticky top-0 z-30">
                        <tr className="text-[9px] uppercase tracking-wider font-black">
                            <th rowSpan={2} className="sticky left-0 z-40 bg-slate-100 border-b-2 border-r-2 border-slate-300 px-3 text-left text-slate-500 w-[170px] min-w-[170px] md:w-[250px] md:min-w-[250px]">Item</th>
                            <th rowSpan={2} className="bg-rose-50 text-rose-700 border-b-2 border-r border-slate-200 px-1 w-16 min-w-[64px]">Avg cost</th>
                            <th rowSpan={2} className="bg-emerald-50 text-emerald-700 border-b-2 border-r-2 border-slate-300 px-1 w-16 min-w-[64px]">Sell price</th>
                            <th colSpan={10} className="bg-blue-50 text-blue-800 border-b border-r-2 border-slate-300 py-1.5">Book stock &amp; sales</th>
                            {villaCols.length > 0 && <th colSpan={villaCols.length} className="bg-indigo-50 text-indigo-800 border-b border-r-2 border-slate-300 py-1.5">Villa counts</th>}
                            <th colSpan={3} className="bg-purple-50 text-purple-800 border-b border-r-2 border-slate-300 py-1.5">Physical</th>
                            <th colSpan={3} className="bg-rose-50 text-rose-800 border-b border-slate-300 py-1.5">Variance</th>
                        </tr>
                        <tr className="text-[9px] uppercase text-slate-500 font-black">
                            {[
                                ['Open', 'bg-blue-50 text-blue-700'], ['Open $', 'bg-slate-50'], ['In', 'bg-emerald-50 text-emerald-700'], ['Out', 'bg-rose-50 text-rose-700'],
                                ['Sales', 'bg-amber-50 text-amber-700'], ['Sales $', 'bg-slate-50'], ['COS', 'bg-slate-50'], ['COS %', 'bg-slate-50'], ['Book close', 'bg-[#6D2158]/10 text-[#6D2158]'],
                            ].map(([l, c]) => <th key={l} className={`${c} border-b-2 border-r border-slate-200 px-1.5 py-1.5 min-w-[58px]`}>{l}</th>)}
                            <th className="bg-slate-50 border-b-2 border-r-2 border-slate-300 px-1.5 min-w-[70px]">Close $</th>
                            {villaCols.map(v => (
                                <th key={v} title={emptyVillas.has(v) ? 'No minibar' : counted.has(v) ? undefined : 'Not counted yet'}
                                    className={`border-b-2 border-r border-slate-200 px-0.5 min-w-[34px] ${emptyVillas.has(v) ? 'bg-slate-200 text-slate-400 line-through' : counted.has(v) ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-100 text-amber-800'}`}>{v}</th>
                            ))}
                            <th className="bg-purple-50 border-b-2 border-r border-slate-200 px-1.5 min-w-[58px]">Villas</th>
                            <th className="bg-purple-100 text-purple-700 border-b-2 border-r border-slate-200 px-1.5 min-w-[58px]">MB Store</th>
                            <th className="bg-[#6D2158]/10 text-[#6D2158] border-b-2 border-r-2 border-slate-300 px-1.5 min-w-[58px]">Total</th>
                            <th className="bg-rose-50 text-rose-700 border-b-2 border-r border-slate-200 px-1.5 min-w-[58px]">Qty</th>
                            <th className="bg-slate-50 border-b-2 border-r border-slate-200 px-1.5 min-w-[70px]">Value</th>
                            <th className="bg-slate-50 border-b-2 border-slate-200 px-3 text-left min-w-[200px]">Comment</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.length === 0 && (
                            <tr><td colSpan={16 + villaCols.length} className="p-10 text-center text-slate-400 font-bold">{varianceOnly ? 'No variance. Everything tallies.' : 'No items match.'}</td></tr>
                        )}
                        {visibleRows.map(r => {
                            const { item, artNo, fin } = r;
                            const cellIn = 'w-full h-9 px-1 bg-transparent outline-none text-center font-bold focus:bg-white focus:ring-2 focus:ring-inset focus:ring-[#6D2158]/40';
                            return (
                                <tr key={artNo} className="group">
                                    <td className="sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-b border-r-2 border-slate-200 px-3 py-1 w-[170px] min-w-[170px] max-w-[170px] md:w-[250px] md:min-w-[250px] md:max-w-[250px]">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-slate-800 truncate" title={item.article_name}>{item.generic_name || item.article_name}</span>
                                            {hiddenItems.includes(artNo) && <span className="shrink-0 text-[8px] font-black uppercase bg-slate-200 text-slate-500 px-1 py-0.5 rounded" title="Hidden from VAs (Setup): villas are not counted for this item">Not counted</span>}
                                        </div>
                                        <div className="text-[9px] text-slate-400 font-semibold truncate">{artNo}{item.micros_name ? ` · ${item.micros_name}` : ''} · {item.category}{item.unit ? ` · ${item.unit}` : ''}</div>
                                    </td>
                                    <td className="border-b border-r border-slate-100 bg-rose-50/40 p-0"><input type="number" className={`${cellIn} text-rose-700`} value={item.avg_cost || ''} onChange={e => updateCat(artNo, 'avg_cost', e.target.value)} /></td>
                                    <td className="border-b border-r-2 border-slate-200 bg-emerald-50/40 p-0"><input type="number" className={`${cellIn} text-emerald-700`} value={item.sales_price || ''} onChange={e => updateCat(artNo, 'sales_price', e.target.value)} /></td>
                                    <td className="border-b border-r border-slate-100 bg-blue-50/40 p-0"><input type="number" className={`${cellIn} text-blue-700`} value={fin.opening_stock === 0 ? '' : fin.opening_stock} placeholder="0" onChange={e => updateFin(artNo, 'opening_stock', Number(e.target.value))} /></td>
                                    <td className="border-b border-r border-slate-100 px-1.5 text-center text-slate-400">{money2(r.opVal)}</td>
                                    <td className="border-b border-r border-slate-100 bg-emerald-50/40 p-0"><input type="number" className={`${cellIn} text-emerald-700`} value={fin.transfer_in === 0 ? '' : fin.transfer_in} placeholder="0" onChange={e => updateFin(artNo, 'transfer_in', Number(e.target.value))} /></td>
                                    <td className="border-b border-r border-slate-100 bg-rose-50/40 p-0"><input type="number" className={`${cellIn} text-rose-700`} value={fin.transfer_out === 0 ? '' : fin.transfer_out} placeholder="0" onChange={e => updateFin(artNo, 'transfer_out', Number(e.target.value))} /></td>
                                    <td className="border-b border-r border-slate-100 bg-amber-50/40 p-0"><input type="number" className={`${cellIn} text-amber-700`} value={fin.sales === 0 ? '' : fin.sales} placeholder="0" onChange={e => updateFin(artNo, 'sales', Number(e.target.value))} /></td>
                                    <td className="border-b border-r border-slate-100 px-1.5 text-center font-bold text-slate-700">{money2(r.salesVal)}</td>
                                    <td className="border-b border-r border-slate-100 px-1.5 text-center text-slate-400">{money2(r.cos)}</td>
                                    <td className="border-b border-r border-slate-100 px-1.5 text-center text-slate-400">{r.salesVal > 0 ? `${((r.cos / r.salesVal) * 100).toFixed(1)}%` : '–'}</td>
                                    <td className="border-b border-r border-slate-100 px-1.5 text-center font-black text-[#6D2158] bg-[#6D2158]/5">{r.soh}</td>
                                    <td className="border-b border-r-2 border-slate-200 px-1.5 text-center font-bold text-slate-600">{money2(r.closeVal)}</td>
                                    {villaCols.map(v => {
                                        const qty = matrixDict[v]?.[artNo] || 0;
                                        return <td key={v} className={`border-b border-r border-slate-100 text-center ${qty > 0 ? 'font-black text-indigo-700 bg-indigo-50/50' : emptyVillas.has(v) ? 'bg-slate-100' : 'text-slate-200'}`}>{qty > 0 ? qty : '·'}</td>;
                                    })}
                                    <td className="border-b border-r border-slate-100 px-1.5 text-center font-bold text-purple-800 bg-purple-50/50">{r.villaTotal}</td>
                                    <td className="border-b border-r border-slate-100 bg-purple-100/40 p-0"><input type="number" className={`${cellIn} text-purple-700`} value={fin.minibar_store === 0 ? '' : fin.minibar_store} placeholder="0" onChange={e => updateFin(artNo, 'minibar_store', Number(e.target.value))} /></td>
                                    <td className="border-b border-r-2 border-slate-200 px-1.5 text-center font-black text-[#6D2158] bg-[#6D2158]/5">{r.physTotal}</td>
                                    <td className={`border-b border-r border-slate-100 px-1.5 text-center font-black ${r.varQty < 0 ? 'text-rose-600 bg-rose-50' : r.varQty > 0 ? 'text-amber-700 bg-amber-50' : 'text-emerald-500'}`}>{r.varQty > 0 ? `+${r.varQty}` : r.varQty === 0 ? '✓' : r.varQty}</td>
                                    <td className={`border-b border-r border-slate-100 px-1.5 text-center font-bold ${r.varVal < 0 ? 'text-rose-600' : r.varVal > 0 ? 'text-amber-700' : 'text-slate-300'}`}>{r.varVal === 0 ? '–' : money2(r.varVal)}</td>
                                    <td className="border-b border-slate-100 p-0"><input type="text" className="w-full h-9 px-3 bg-transparent outline-none text-left text-slate-600 italic focus:bg-white focus:ring-2 focus:ring-inset focus:ring-[#6D2158]/40" value={fin.comments || ''} onChange={e => updateFin(artNo, 'comments', e.target.value)} placeholder="Add note…" /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-30">
                        <tr className="text-[11px] font-black text-slate-700">
                            <td className="sticky left-0 z-40 bg-slate-100 border-t-2 border-r-2 border-slate-300 px-3 py-2">Total · {visibleRows.length} item{visibleRows.length === 1 ? '' : 's'}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300" />
                            <td className="bg-slate-100 border-t-2 border-r-2 border-slate-300" />
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{visTotals.open}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{money(visTotals.opVal)}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{visTotals.inQ}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{visTotals.outQ}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{visTotals.salesQty}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{money(visTotals.salesVal)}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{money(visTotals.cos)}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{visTotals.salesVal ? `${((visTotals.cos / visTotals.salesVal) * 100).toFixed(1)}%` : '–'}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center text-[#6D2158]">{visTotals.soh}</td>
                            <td className="bg-slate-100 border-t-2 border-r-2 border-slate-300 text-center">{money(visTotals.closeVal)}</td>
                            {villaCols.map(v => <td key={v} className="bg-slate-100 border-t-2 border-slate-300" />)}
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{visTotals.villaTotal}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300 text-center">{visTotals.store}</td>
                            <td className="bg-slate-100 border-t-2 border-r-2 border-slate-300 text-center text-[#6D2158]">{visTotals.physTotal}</td>
                            <td className={`bg-slate-100 border-t-2 border-slate-300 text-center ${visTotals.varQty < 0 ? 'text-rose-600' : ''}`}>{visTotals.varQty > 0 ? '+' : ''}{visTotals.varQty}</td>
                            <td className={`bg-slate-100 border-t-2 border-slate-300 text-center ${visTotals.varVal < 0 ? 'text-rose-600' : ''}`}>{money(visTotals.varVal)}</td>
                            <td className="bg-slate-100 border-t-2 border-slate-300" />
                        </tr>
                    </tfoot>
                </table>
            </div>
          </>
        ) : activeTab === 'ASSIGNMENTS' ? (

            /* --- ALLOCATIONS --- */
            <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex-none bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-end gap-3">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Copy villas from the daily allocation</label>
                        <div className="flex items-center gap-2 mt-1">
                            <input type="date" value={extractDate} onChange={(e) => setExtractDate(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold outline-none focus:border-[#6D2158]" />
                            <button onClick={handleExtractAllocations} disabled={isExtracting} className="h-10 px-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-black flex items-center gap-1.5 hover:bg-blue-100 disabled:opacity-50">
                                {isExtracting ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Pull villas
                            </button>
                        </div>
                    </div>
                    <div className="relative flex-1 min-w-[220px]">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Add a person</label>
                        <div className="relative mt-1">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input type="text" placeholder="Name or SSL" className="w-full h-10 pl-8 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold outline-none focus:border-[#6D2158] focus:bg-white"
                                value={hostSearch} onChange={(e) => { setHostSearch(e.target.value); setShowHostDropdown(true); }} onFocus={() => setShowHostDropdown(true)} onBlur={() => setTimeout(() => setShowHostDropdown(false), 200)} />
                        </div>
                        {showHostDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto z-[100]">
                                {availableHostsToAdd.filter(h => h.status !== 'Resigned' && (h.full_name.toLowerCase().includes(hostSearch.toLowerCase()) || (h.host_id || '').toLowerCase().includes(hostSearch.toLowerCase()))).map(h => (
                                    <button key={h.id} onClick={() => { setAllocations(prev => ({ ...prev, [h.host_id]: '' })); setAllocDirty(true); setHostSearch(''); setShowHostDropdown(false); }}
                                        className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 flex items-center justify-between">
                                        <span className="font-bold text-slate-700 text-sm">{h.full_name}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">{h.host_id} · {h.role}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button onClick={handleSaveAllocations} disabled={isSaving}
                        className={`h-10 px-5 rounded-xl text-white text-xs font-black flex items-center gap-2 disabled:opacity-50 ${allocDirty ? 'bg-emerald-600 ring-2 ring-emerald-300' : 'bg-emerald-600'} hover:bg-emerald-700`}>
                        {isSaving ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>} Save allocations
                    </button>
                </div>

                {(allocCheck.twice.length > 0 || allocCheck.nobody.length > 0) && (
                    <div className="flex-none grid md:grid-cols-2 gap-2">
                        {allocCheck.twice.length > 0 && <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-rose-800"><span className="font-black">Given to two people:</span> {allocCheck.twice.join(', ')}</div>}
                        {allocCheck.nobody.length > 0 && <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-amber-900"><span className="font-black">Minibars given to nobody:</span> {allocCheck.nobody.join(', ')}</div>}
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 xl:grid-cols-2 gap-2 content-start pb-2">
                    {activeHostsForBoard.length === 0 && (
                        <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-400">Nobody assigned for {monthLabel}. Pull villas from a day&apos;s allocation, or add people above.</div>
                    )}
                    {activeHostsForBoard.map(host => {
                        const p = countedByHost(allocations[host.host_id] || '');
                        const pct = p.total ? (p.done / p.total) * 100 : 0;
                        return (
                            <div key={host.id} className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-[#6D2158]/10 text-[#6D2158] font-black text-sm flex items-center justify-center shrink-0">{(host.full_name || '?').charAt(0)}</div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-black text-slate-800 text-sm truncate">{host.full_name}</p>
                                        <p className="text-[10px] font-bold text-slate-400">{host.host_id} · {p.total} villa{p.total === 1 ? '' : 's'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-xs font-black ${p.total && p.done === p.total ? 'text-emerald-600' : 'text-slate-600'}`}>{p.done}/{p.total} counted</p>
                                        <div className="w-24 h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className={`h-full ${p.total && p.done === p.total ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }}/></div>
                                    </div>
                                    <button onClick={() => { const u = { ...allocations }; delete u[host.host_id]; setAllocations(u); setAllocDirty(true); }} className="p-2 text-slate-300 hover:text-rose-500" aria-label={`Remove ${host.full_name}`}><X size={16}/></button>
                                </div>
                                <VillaTagInput value={allocations[host.host_id] || ''} onChange={(newVal) => { setAllocations({ ...allocations, [host.host_id]: newVal }); setAllocDirty(true); }} />
                            </div>
                        );
                    })}
                </div>
            </div>

        ) : (

            /* --- SETUP --- */
            <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-3 content-start pb-2">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Home size={17}/></div>
                        <div className="flex-1">
                            <h3 className="font-black text-slate-800 text-sm">Villas with two minibars</h3>
                            <p className="text-[11px] font-semibold text-slate-400">Counted separately as -1 and -2 (e.g. 36-1, 36-2).</p>
                        </div>
                        <button onClick={handleSaveDoubleVillas} disabled={isSaving} className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-black flex items-center gap-1.5 disabled:opacity-50">{isSaving ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} Save</button>
                    </div>
                    <input type="text" className="h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158] focus:bg-white text-[#6D2158]"
                        placeholder="e.g. 36, 57, 87" value={doubleVillasStr} onChange={(e) => setDoubleVillasStr(e.target.value)} />
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 lg:col-span-2 lg:order-first">
                    <div className="flex flex-wrap items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center shrink-0"><Wine size={17}/></div>
                        <div className="flex-1 min-w-[200px]">
                            <h3 className="font-black text-slate-800 text-sm">Minibar items <span className="text-slate-400 font-bold">· {fullCatalog.length - excludedItems.length} in inventory</span></h3>
                            <p className="text-[11px] font-semibold text-slate-400"><b className="text-emerald-700">Counted</b>: VAs count it. <b className="text-slate-600">Hidden</b>: in the P&amp;L but VAs don&apos;t count it (shows as variance). <b className="text-rose-700">Not inventory</b>: complimentary or not minibar, left out everywhere.</p>
                        </div>
                        <div className="relative w-full sm:w-56">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input value={setupItemSearch} onChange={e => setSetupItemSearch(e.target.value)} placeholder="Find item" className="w-full h-9 pl-8 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#6D2158]"/>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                        {shownItems.map(item => {
                            const state: 'counted' | 'hidden' | 'excluded' = excludedItems.includes(item.article_number) ? 'excluded' : hiddenItems.includes(item.article_number) ? 'hidden' : 'counted';
                            return (
                                <div key={item.article_number} className={`flex items-center gap-3 p-2.5 rounded-xl border ${state === 'counted' ? 'bg-emerald-50/50 border-emerald-200' : state === 'hidden' ? 'bg-white border-slate-200' : 'bg-rose-50/40 border-rose-200'}`}>
                                    <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                                        {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-contain"/> : <Wine size={16} className="text-slate-300"/>}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-xs font-bold truncate ${state === 'counted' ? 'text-slate-800' : 'text-slate-500'} ${state === 'excluded' ? 'line-through' : ''}`}>{item.generic_name || item.article_name}</p>
                                        <p className="text-[10px] font-semibold text-slate-400 truncate">{item.category} · {item.article_number}</p>
                                    </div>
                                    <div className="shrink-0 flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-black">
                                        {([['counted', 'Counted', 'bg-emerald-500'], ['hidden', 'Hidden', 'bg-slate-600'], ['excluded', 'Not inv.', 'bg-rose-600']] as const).map(([k, l, on]) => (
                                            <button key={k} onClick={() => state !== k && setItemState(item.article_number, k)} title={k === 'excluded' ? 'Not part of minibar inventory' : undefined}
                                                className={`px-2 py-1.5 ${state === k ? `${on} text-white` : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{l}</button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* --- CSV IMPORT REVIEW MODAL --- */}
      {importState.isOpen && (
          <div className="fixed inset-0 z-[150] bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col animate-in fade-in zoom-in-95 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                      <div>
                          <h2 className="text-xl font-black text-[#6D2158]">Review {importState.type === 'sales' ? 'Sales' : 'Transfers'} Import</h2>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Please map any unidentified items below</p>
                      </div>
                      <button onClick={() => setImportState({ isOpen: false, type: 'sales', rows: [] })} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                          <X size={20}/>
                      </button>
                  </div>

                  <div className="overflow-auto p-0 flex-1 bg-slate-50 custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                          <thead className="bg-white sticky top-0 shadow-sm z-10">
                              <tr>
                                  <th className="p-4 text-[10px] font-black uppercase text-slate-400 w-1/3">Original Name from CSV</th>
                                  <th className="p-4 text-[10px] font-black uppercase text-slate-400 w-1/3">Matched Matrix Catalog Item</th>
                                  {importState.type === 'sales' ? (
                                      <th className="p-4 text-[10px] font-black uppercase text-slate-400 w-1/3 text-right">Sales Qty</th>
                                  ) : (
                                      <>
                                          <th className="p-4 text-[10px] font-black uppercase text-slate-400 text-right">Trans In</th>
                                          <th className="p-4 text-[10px] font-black uppercase text-slate-400 text-right pr-6">Trans Out</th>
                                      </>
                                  )}
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                              {importState.rows.map((row) => (
                                  <tr key={row.id} className={!row.matchedArticleNo ? 'bg-amber-50/50' : 'hover:bg-slate-50'}>
                                      <td className="p-4">
                                          <div className="flex items-center gap-2">
                                              {!row.matchedArticleNo && <AlertCircle size={14} className="text-amber-500 shrink-0"/>}
                                              <span className={`text-sm font-bold ${!row.matchedArticleNo ? 'text-amber-900' : 'text-slate-700'}`}>{row.originalName}</span>
                                          </div>
                                      </td>
                                      <td className="p-4 relative">
                                          <div className="flex items-center gap-2">
                                              <ArrowRight size={14} className="text-slate-300 shrink-0"/>
                                              <select 
                                                  className={`w-full p-2 text-xs font-bold rounded-lg border outline-none transition-colors ${!row.matchedArticleNo ? 'border-amber-300 bg-amber-50 text-amber-900 focus:border-amber-500' : 'border-slate-200 bg-white text-slate-700 focus:border-[#6D2158]'}`}
                                                  value={row.matchedArticleNo || ''}
                                                  onChange={(e) => updateImportRowMapping(row.id, e.target.value || null)}
                                              >
                                                  <option value="">-- Select Matrix Item to Map --</option>
                                                  {catalog.map(c => (
                                                      <option key={c.article_number} value={c.article_number}>
                                                          {c.article_number} - {c.generic_name || c.article_name}
                                                      </option>
                                                  ))}
                                              </select>
                                          </div>
                                      </td>
                                      {importState.type === 'sales' ? (
                                          <td className="p-4 text-right font-black text-amber-600">{row.val1}</td>
                                      ) : (
                                          <>
                                              <td className="p-4 text-right font-black text-emerald-600">{row.val1 > 0 ? row.val1 : '-'}</td>
                                              <td className="p-4 text-right font-black text-rose-600 pr-6">{row.val2 > 0 ? row.val2 : '-'}</td>
                                          </>
                                      )}
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white shrink-0">
                      <button 
                          onClick={() => setImportState({ isOpen: false, type: 'sales', rows: [] })} 
                          className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={finalizeCSVImport}
                          className="px-6 py-3 bg-[#6D2158] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-[#5a1b49] transition-all flex items-center gap-2 disabled:opacity-50"
                          disabled={importState.rows.every(r => r.matchedArticleNo === null)}
                      >
                          <Save size={16}/> Confirm Import
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- MB STORE AUDIT MODAL --- */}
      {isStoreAuditOpen && (
          <div className="fixed inset-0 z-[100] bg-[#FDFBFD] flex flex-col h-[100dvh] w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {/* Header Flex None */}
              <div className="flex-none bg-white p-4 md:p-6 border-b border-slate-200 flex flex-col gap-4 shadow-sm z-20">
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <button onClick={() => setIsStoreAuditOpen(false)} className="p-2.5 md:p-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full transition-colors">
                              <ChevronLeft size={18}/>
                          </button>
                          <div>
                              <h2 className="text-xl md:text-2xl font-black text-[#6D2158]">MB Store Inventory</h2>
                              <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-400 mt-0.5">Physical Count</p>
                          </div>
                      </div>
                  </div>
                  
                  <div className="relative">
                      <Search className="absolute left-4 top-3 text-slate-400" size={16}/>
                      <input 
                          type="text" 
                          placeholder="Search items..." 
                          className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] focus:bg-white transition-all shadow-sm"
                          value={storeSearchQuery}
                          onChange={(e) => setStoreSearchQuery(e.target.value)}
                      />
                      {storeSearchQuery && (
                          <button onClick={() => setStoreSearchQuery('')} className="absolute right-4 top-3 text-slate-300 hover:text-slate-500">
                              <X size={16}/>
                          </button>
                      )}
                  </div>
              </div>

              {/* Scrollable Middle Area Flex 1 */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                  <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                      {displayStoreCatalog.length === 0 ? (
                          <div className="col-span-full py-10 text-center text-slate-400 font-bold">No items found.</div>
                      ) : displayStoreCatalog.map(item => {
                          const qty = storeCounts[item.article_number] || 0;
                          const isKeypadActive = storeKeypadTarget === item.article_number;
                          
                          return (
                          <div key={item.article_number} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${qty > 0 || isKeypadActive ? 'border-[#6D2158] ring-2 ring-[#6D2158]/10' : 'border-slate-200'}`}>
                              <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-3 relative">
                                  {item.image_url ? <img src={item.image_url} className="w-full h-full object-contain drop-shadow-sm"/> : <Wine size={24} className="text-slate-300"/>}
                              </div>
                              <div className="flex flex-col flex-1 px-1">
                                  <h4 className="text-[10px] font-black text-slate-800 leading-tight line-clamp-2">{item.generic_name || item.article_name}</h4>
                                  <div className="flex items-center justify-between mt-1">
                                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">{item.category}</p>
                                  </div>
                              </div>
                              <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                                  <button onClick={() => updateStoreCount(item.article_number, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all">
                                      <Minus size={14}/>
                                  </button>
                                  <button 
                                      onClick={() => { setStoreKeypadTarget(item.article_number); setStoreKeypadValue(String(qty)); }} 
                                      className={`w-10 text-center font-black text-lg py-1 rounded-md transition-colors ${qty > 0 ? 'text-[#6D2158]' : 'text-slate-400 hover:bg-slate-200'} ${isKeypadActive ? 'bg-[#6D2158]/10 text-[#6D2158] ring-1 ring-[#6D2158]' : ''}`}
                                  >
                                      {qty}
                                  </button>
                                  <button onClick={() => updateStoreCount(item.article_number, 1)} className="w-8 h-8 flex items-center justify-center bg-[#6D2158] rounded-md shadow-sm text-white active:scale-95 transition-all">
                                      <Plus size={14}/>
                                  </button>
                              </div>
                          </div>
                      )})}
                  </div>
              </div>

              {/* Footer Actions Flex None */}
              <div className="flex-none bg-white border-t border-slate-200 p-4 md:p-6 pb-28 md:pb-6 z-20 shadow-[0_-15px_40px_rgba(0,0,0,0.08)]">
                  <div className="max-w-5xl mx-auto flex gap-3">
                      <button 
                          onClick={() => setIsStoreAuditOpen(false)} 
                          className="py-4 px-6 bg-slate-100 text-slate-600 rounded-xl font-black uppercase tracking-widest text-xs shadow-sm active:scale-95 transition-all"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={confirmStoreAudit} 
                          disabled={isSavingMatrix}
                          className="flex-1 py-4 text-white bg-[#6D2158] shadow-purple-900/20 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-[#5a1b49] disabled:opacity-70 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                          {isSavingMatrix ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Confirm Store Count
                      </button>
                  </div>
              </div>

              {/* Fixed Keypad Overlay */}
              {storeKeypadTarget && (
                  <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
                      <div className="absolute inset-0" onClick={saveStoreKeypadValue}></div>
                      <div className="bg-[#FDFBFD] w-full rounded-t-[2rem] p-5 md:p-6 pb-28 md:pb-6 shadow-2xl animate-in slide-in-from-bottom-8 relative z-10 max-w-md mx-auto">
                          <div className="flex justify-between items-center mb-5">
                              <div>
                                  <h4 className="font-black text-slate-800 text-base">Direct Input</h4>
                                  <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                      {catalog.find(c => c.article_number === storeKeypadTarget)?.generic_name || 'Item'}
                                  </p>
                              </div>
                              <div className="text-3xl font-black text-[#6D2158] bg-purple-50 px-5 py-1.5 rounded-xl border border-purple-100">
                                  {storeKeypadValue}
                              </div>
                          </div>

                          <div className="grid grid-cols-4 gap-2 md:gap-3 mb-5">
                              {[1,2,3,'+'].map(num => (
                                  <button key={num} onClick={() => handleStoreKeypadPress(String(num))} className="py-3 md:py-4 bg-white rounded-xl shadow-sm border border-slate-200 text-xl md:text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">
                                      {num}
                                  </button>
                              ))}
                              {[4,5,6,'-'].map(num => (
                                  <button key={num} onClick={() => handleStoreKeypadPress(String(num))} className="py-3 md:py-4 bg-white rounded-xl shadow-sm border border-slate-200 text-xl md:text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">
                                      {num}
                                  </button>
                              ))}
                              {[7,8,9,'*'].map(num => (
                                  <button key={num} onClick={() => handleStoreKeypadPress(String(num))} className="py-3 md:py-4 bg-white rounded-xl shadow-sm border border-slate-200 text-xl md:text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">
                                      {num}
                                  </button>
                              ))}
                              <button onClick={() => handleStoreKeypadPress('CLR')} className="py-3 md:py-4 bg-rose-50 rounded-xl border border-rose-100 text-xs font-black text-rose-600 uppercase tracking-widest active:scale-95 transition-all">
                                  CLR
                              </button>
                              <button onClick={() => handleStoreKeypadPress('0')} className="py-3 md:py-4 bg-white rounded-xl shadow-sm border border-slate-200 text-xl md:text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">
                                  0
                              </button>
                              <button onClick={() => handleStoreKeypadPress('DEL')} className="py-3 md:py-4 bg-slate-100 rounded-xl border border-slate-200 text-xs font-black text-slate-600 uppercase tracking-widest active:scale-95 transition-all">
                                  DEL
                              </button>
                              <button onClick={() => handleStoreKeypadPress('=')} className="py-3 md:py-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xl md:text-2xl font-black text-emerald-700 active:scale-95 transition-all">
                                  =
                              </button>
                          </div>

                          <button onClick={saveStoreKeypadValue} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all">
                              Confirm Amount
                          </button>
                      </div>
                  </div>
              )}
          </div>
      )}
    </div>
  );
}
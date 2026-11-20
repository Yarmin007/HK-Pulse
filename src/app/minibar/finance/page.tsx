"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, FileSpreadsheet, Lock, Wine, ChevronLeft, ChevronRight, Search, TrendingDown, Columns3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as ExcelJS from 'exceljs';
import { loadMbSubmissions, latestByVilla, loadOpeningDefaults, splitList, villaList, MB_EXCLUDE_TYPE } from '@/lib/minibarCounts';


const getLocalMonth = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    const str = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return str.substring(0, 7);
};

const getCategoryWeight = (cat: string) => {
  const c = (cat || '').toLowerCase();
  if (c.includes('bite') || c.includes('sweet') || c.includes('food') || c.includes('snack')) return 1;
  if (c.includes('soft') || c.includes('juice') || c.includes('water') || c.includes('beverage')) return 2;
  if (c.includes('beer')) return 3;
  if (c.includes('wine')) return 4;
  if (c.includes('spirit') || c.includes('liquor') || c.includes('hard') || c.includes('alcohol')) return 5;
  return 6;
};

type FinancialRecord = {
    opening_stock: number; transfer_in: number; transfer_out: number;
    sales: number; minibar_store: number; comments: string;
};

const MASTER_WIDTHS = {
    microsName: 'w-[160px] min-w-[160px] shrink-0',
    artNo: 'w-[60px] min-w-[60px] shrink-0',
    artName: 'w-[240px] min-w-[240px] shrink-0',
    unit: 'w-[45px] min-w-[45px] shrink-0',
    cost: 'w-[65px] min-w-[65px] shrink-0',
    price: 'w-[65px] min-w-[65px] shrink-0',
};
const TOTAL_MASTER_WIDTH = 635;

export default function FinanceMinibarPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonth());
  
  const [catalog, setCatalog] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [financials, setFinancials] = useState<Record<string, FinancialRecord>>({});
  // Same rule as the Live Inventory Matrix: a month not saved yet opens with last month's physical count
  const [openingDefault, setOpeningDefault] = useState<Record<string, number>>({});
  const [itemSearch, setItemSearch] = useState('');
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [showVillas, setShowVillas] = useState(false);
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [doubleVillasStr, setDoubleVillasStr] = useState<string>('');

  const activeVillaList = useMemo(() => villaList(splitList(doubleVillasStr)), [doubleVillasStr]);

  const fetchMonthlyData = useCallback(async () => {
    setIsLoading(true);
    const [subs, finRes, openDef] = await Promise.all([
        loadMbSubmissions(selectedMonth).catch(() => []),
        supabase.from('hsk_monthly_minibar').select('*').eq('month_period', selectedMonth),
        loadOpeningDefaults(selectedMonth, activeVillaList).catch(() => null),
    ]);
    setSubmissions(Object.values(latestByVilla(subs)));
    setOpeningDefault(openDef?.physical || {});

    if (finRes.data) {
        const finMap: Record<string, FinancialRecord> = {};
        finRes.data.forEach(f => {
            finMap[f.article_number] = {
                opening_stock: f.opening_stock || 0, transfer_in: f.transfer_in || 0,
                transfer_out: f.transfer_out || 0, sales: f.sales || 0,
                minibar_store: f.minibar_store || 0, comments: f.comments || ''
            };
        });
        setFinancials(finMap);
    } else { setFinancials({}); }

    setIsLoading(false);
  }, [selectedMonth, activeVillaList]);

  useEffect(() => {
    setIsMounted(true);
    fetchCatalogAndSettings();
  }, []);

  useEffect(() => {
    if (isMounted) fetchMonthlyData();
  }, [selectedMonth, isMounted, fetchMonthlyData]);

  const fetchCatalogAndSettings = async () => {
    const [catRes, constRes] = await Promise.all([
        supabase.from('hsk_master_catalog').select('*').eq('is_minibar_item', true),
        supabase.from('hsk_constants').select('*').in('type', ['hidden_mb_item', 'double_mb_villas', 'mb_active_period', MB_EXCLUDE_TYPE]) 
    ]);

    if (catRes.data) {
        const sortedCatalog = catRes.data.sort((a, b) => {
            const orderA = a.sort_order || 9999;
            const orderB = b.sort_order || 9999;
            if (orderA !== orderB) return orderA - orderB;
            return getCategoryWeight(a.category) - getCategoryWeight(b.category) || a.article_name.localeCompare(b.article_name);
        });
        // Complimentary / non-minibar items (Setup → Not in inventory) are left out
        const excluded = new Set((constRes.data || []).filter(c => c.type === MB_EXCLUDE_TYPE).map(c => c.label));
        setCatalog(sortedCatalog.filter(i => !excluded.has(i.article_number)));
    }
    
    if (constRes.data) {
        setHiddenItems(constRes.data.filter(h => h.type === 'hidden_mb_item').map(h => h.label));
        const dv = constRes.data.find(h => h.type === 'double_mb_villas');
        if (dv) setDoubleVillasStr(dv.label);
        const period = constRes.data.find(h => h.type === 'mb_active_period')?.label;
        if (period) setSelectedMonth(period);
    }
  };

  const matrixDict = useMemo(() => {
      const dict: Record<string, Record<string, number>> = {};
      activeVillaList.forEach(v => dict[v] = {});
      submissions.forEach(sub => {
          if (!dict[sub.villa_number]) dict[sub.villa_number] = {};
          if (sub.inventory_data && Array.isArray(sub.inventory_data)) {
              sub.inventory_data.forEach((item: any) => { dict[sub.villa_number][item.article_number] = item.qty; });
          }
      });
      return dict;
  }, [submissions, activeVillaList]);

  // FULLY DESIGNED TRUE EXCEL FILE GENERATOR
  const exportToRealExcel = async () => {
      setIsExporting(true);
      try {
          const wb = new ExcelJS.Workbook();
          const ws = wb.addWorksheet('Minibar Finance', {
              views: [{ state: 'frozen', xSplit: 6, ySplit: 2 }] // Freezes the top 2 rows and first 6 item columns!
          });

          const headerRow = [
              "Category", "Micros Name", "Art #", "Article Name", "Unit", "Avg Cost", "Sell Price",
              "Open Stk", "Open Val", "Trans IN", "Trans OUT", "Sales", "Sales Val", "COS", "COS %", "SOH Clos", "Close Val",
              ...activeVillaList,
              "Villa Total", "MB Store", "Total Phys", "Var Qty", "Var Val", "Comments"
          ];

          // 1. Add Main Title
          ws.addRow(['MINIBAR FINANCIAL VARIANCE REPORT - ' + selectedMonth]);
          ws.mergeCells(1, 1, 1, headerRow.length);
          const titleCell = ws.getCell(1, 1);
          titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
          titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D2158' } }; // Brand purple
          titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
          ws.getRow(1).height = 35;

          // 2. Add Table Headers
          const headerRowObj = ws.addRow(headerRow);
          headerRowObj.eachCell((cell) => {
              cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } }; // Slate-600
              cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
              cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          });
          ws.getRow(2).height = 25;

          // 3. Define Clean Column Widths
          const baseWidths = [15, 25, 10, 35, 8, 12, 12, 10, 12, 10, 10, 10, 12, 12, 10, 12, 12];
          const villaWidths = activeVillaList.map(() => 6);
          const endWidths = [12, 12, 12, 10, 12, 40];
          const allWidths = [...baseWidths, ...villaWidths, ...endWidths];
          allWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

          // 4. Fill in Data & Colors
          catalog.forEach(item => {
              const artNo = item.article_number;
              const fin = financials[artNo] || { opening_stock: openingDefault[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
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

              // Force strict Accounting/Currency formatting
              row.getCell(6).numFmt = '"$"#,##0.00'; 
              row.getCell(7).numFmt = '"$"#,##0.00'; 
              row.getCell(9).numFmt = '"$"#,##0.00'; 
              row.getCell(13).numFmt = '"$"#,##0.00'; 
              row.getCell(14).numFmt = '"$"#,##0.00'; 
              row.getCell(15).numFmt = '0.0%'; 
              row.getCell(17).numFmt = '"$"#,##0.00'; 

              const offset = 17 + activeVillaList.length;
              row.getCell(offset + 5).numFmt = '"$"#,##0.00'; // Var Val

              // Apply Borders and Center Align by default
              row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                  cell.alignment = { vertical: 'middle', horizontal: colNumber <= 4 || colNumber === offset + 6 ? 'left' : 'center' };
                  cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
              });

              // Apply Highlight Colors
              row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; // Blue for Open Stk
              row.getCell(8).font = { color: { argb: 'FF1D4ED8' }, bold: true };
              
              row.getCell(16).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF4FF' } }; // Purple for SOH
              row.getCell(16).font = { color: { argb: 'FF86198F' }, bold: true };

              row.getCell(offset + 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF4FF' } }; // Purple for Phys Total
              row.getCell(offset + 3).font = { color: { argb: 'FF86198F' }, bold: true };

              const varQtyCell = row.getCell(offset + 4);
              if (varQty < 0) {
                  varQtyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } }; // Red
                  varQtyCell.font = { color: { argb: 'FFE11D48' }, bold: true };
              } else if (varQty > 0) {
                  varQtyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFEF3' } }; // Amber
                  varQtyCell.font = { color: { argb: 'FFD97706' }, bold: true };
              } else {
                  varQtyCell.font = { color: { argb: 'FF10B981' }, bold: true }; // Green check (Zero)
              }
          });

          // 5. Build and Trigger Download
          const buffer = await wb.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Minibar_Finance_Report_${selectedMonth}.xlsx`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

      } catch (error) {
          console.error("Excel generation error:", error);
          alert("There was an error generating the Excel file.");
      } finally {
          setIsExporting(false);
      }
  };

  // ---- one calculation for summary, table and totals ----
  const rows = useMemo(() => catalog.map(item => {
      const artNo = item.article_number;
      const fin: FinancialRecord = financials[artNo] || { opening_stock: openingDefault[artNo] || 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
      const avgCost = parseFloat(item.avg_cost) || 0;
      const salePrice = parseFloat(item.sales_price) || 0;
      const soh = fin.opening_stock + fin.transfer_in - fin.transfer_out - fin.sales;
      const villaTotal = activeVillaList.reduce((sum, v) => sum + (matrixDict[v]?.[artNo] || 0), 0);
      const physTotal = villaTotal + fin.minibar_store;
      const varQty = physTotal - soh;
      return { item, artNo, fin, avgCost, salePrice, soh, villaTotal, physTotal, varQty,
          opVal: fin.opening_stock * avgCost, salesVal: fin.sales * salePrice, cos: fin.sales * avgCost,
          closeVal: soh * avgCost, physVal: physTotal * avgCost, varVal: varQty * avgCost };
  }), [catalog, financials, openingDefault, activeVillaList, matrixDict]);
  const visibleRows = useMemo(() => {
      const q = itemSearch.trim().toLowerCase();
      return rows.filter(r => (!varianceOnly || r.varQty !== 0) && (!q || `${r.item.generic_name || ''} ${r.item.article_name} ${r.artNo} ${r.item.micros_name || ''}`.toLowerCase().includes(q)));
  }, [rows, itemSearch, varianceOnly]);
  const sum = (list: typeof rows) => list.reduce((t, r) => ({
      open: t.open + r.fin.opening_stock, opVal: t.opVal + r.opVal, inQ: t.inQ + r.fin.transfer_in, outQ: t.outQ + r.fin.transfer_out,
      salesQty: t.salesQty + r.fin.sales, salesVal: t.salesVal + r.salesVal, cos: t.cos + r.cos, soh: t.soh + r.soh, closeVal: t.closeVal + r.closeVal,
      villaTotal: t.villaTotal + r.villaTotal, store: t.store + r.fin.minibar_store, physTotal: t.physTotal + r.physTotal, physVal: t.physVal + r.physVal,
      varQty: t.varQty + r.varQty, varVal: t.varVal + r.varVal, shortVal: t.shortVal + Math.min(0, r.varVal), varItems: t.varItems + (r.varQty !== 0 ? 1 : 0),
  }), { open: 0, opVal: 0, inQ: 0, outQ: 0, salesQty: 0, salesVal: 0, cos: 0, soh: 0, closeVal: 0, villaTotal: 0, store: 0, physTotal: 0, physVal: 0, varQty: 0, varVal: 0, shortVal: 0, varItems: 0 });
  const totals = sum(rows);
  const visTotals = sum(visibleRows);

  if (!isMounted) return null;

  const monthLabel = (() => { const [y, m] = selectedMonth.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); })();
  const shiftMonth = (d: number) => { const [y, m] = selectedMonth.split('-').map(Number); const dt = new Date(y, m - 1 + d, 1); setSelectedMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`); };
  const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const money2 = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
  const villaCols = showVillas ? activeVillaList : [];
  const countedVillas = submissions.length;
  const th = 'border-b-2 border-r border-slate-200 px-1.5 py-1.5 min-w-[58px]';
  const td = 'border-b border-r border-slate-100 px-1.5 text-center h-9';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-50 font-sans text-slate-800 overflow-hidden">

      {/* HEADER */}
      <div className="flex-none bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 mr-auto min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center shrink-0"><Wine size={20}/></div>
            <div className="min-w-0">
                <h1 className="text-lg font-black text-[#6D2158] leading-tight">Minibar P&amp;L</h1>
                <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Lock size={10} className="text-emerald-500"/> Read-only view</p>
            </div>
        </div>
        <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
            <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-lg hover:bg-white text-slate-500 flex items-center justify-center" aria-label="Previous month"><ChevronLeft size={16}/></button>
            <label className="relative w-36 text-center cursor-pointer">
                <span className="text-sm font-black text-[#6D2158]">{monthLabel}</span>
                <input type="month" value={selectedMonth} onChange={e => e.target.value && setSelectedMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Month"/>
            </label>
            <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-lg hover:bg-white text-slate-500 flex items-center justify-center" aria-label="Next month"><ChevronRight size={16}/></button>
        </div>
        <button onClick={exportToRealExcel} disabled={isExporting} className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50">
            {isExporting ? <Loader2 size={15} className="animate-spin"/> : <FileSpreadsheet size={15}/>} {isExporting ? 'Preparing…' : 'Download Excel'}
        </button>
      </div>

      <div className="flex-1 overflow-hidden px-4 md:px-6 py-3 flex flex-col gap-3">
        {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={30}/></div>
        ) : (
          <>
            <div className="flex-none grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                    ['Villas counted', `${countedVillas}`, `of ${activeVillaList.length} minibar spots`, ''],
                    ['Sales', money(totals.salesVal), `${totals.salesQty} items sold`, ''],
                    ['Cost of sales', totals.salesVal ? `${((totals.cos / totals.salesVal) * 100).toFixed(1)}%` : '–', money(totals.cos), ''],
                    ['Closing stock (book)', money(totals.closeVal), `Physical ${money(totals.physVal)}`, ''],
                    ['Variance (net)', `${totals.varVal > 0 ? '+' : ''}${money(totals.varVal)}`, `${totals.varItems} items off · short ${money(totals.shortVal)}`, totals.varVal < -0.5 ? 'neg' : ''],
                ].map(([label, value, sub, tone]) => (
                    <div key={label} className={`rounded-2xl border p-3 ${tone === 'neg' ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                        <p className={`text-xl font-black ${tone === 'neg' ? 'text-rose-600' : 'text-slate-800'}`}>{value}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1">{sub}</p>
                    </div>
                ))}
            </div>

            <div className="flex-none bg-white rounded-2xl border border-slate-200 p-2 flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-56">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Find item or Art #" className="w-full h-9 pl-8 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#6D2158] focus:bg-white"/>
                </div>
                <button onClick={() => setVarianceOnly(v => !v)} className={`h-9 px-3 rounded-lg text-[11px] font-black flex items-center gap-1.5 border ${varianceOnly ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200'}`}><TrendingDown size={13}/> Variance only</button>
                <button onClick={() => setShowVillas(v => !v)} className={`h-9 px-3 rounded-lg text-[11px] font-black flex items-center gap-1.5 border ${showVillas ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}><Columns3 size={13}/> {showVillas ? 'Hide villa columns' : 'Show villa columns'}</button>
                {Object.keys(financials).length === 0 && <span className="text-[11px] font-bold text-amber-700">Not saved yet for {monthLabel}: opening stock is last month&apos;s physical count.</span>}
            </div>

            <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 overflow-auto custom-scrollbar">
                <table className="w-max min-w-full border-separate border-spacing-0 text-[11px] whitespace-nowrap">
                    <thead className="sticky top-0 z-30">
                        <tr className="text-[9px] uppercase tracking-wider font-black">
                            <th rowSpan={2} className="sticky left-0 z-40 bg-slate-100 border-b-2 border-r-2 border-slate-300 px-3 text-left text-slate-500 w-[170px] min-w-[170px] md:w-[250px] md:min-w-[250px]">Item</th>
                            <th rowSpan={2} className="bg-rose-50 text-rose-700 border-b-2 border-r border-slate-200 px-1 min-w-[64px]">Avg cost</th>
                            <th rowSpan={2} className="bg-emerald-50 text-emerald-700 border-b-2 border-r-2 border-slate-300 px-1 min-w-[64px]">Sell price</th>
                            <th colSpan={10} className="bg-blue-50 text-blue-800 border-b border-r-2 border-slate-300 py-1.5">Book stock &amp; sales</th>
                            {villaCols.length > 0 && <th colSpan={villaCols.length} className="bg-indigo-50 text-indigo-800 border-b border-r-2 border-slate-300 py-1.5">Villa counts</th>}
                            <th colSpan={3} className="bg-purple-50 text-purple-800 border-b border-r-2 border-slate-300 py-1.5">Physical</th>
                            <th colSpan={3} className="bg-rose-50 text-rose-800 border-b border-slate-300 py-1.5">Variance</th>
                        </tr>
                        <tr className="text-[9px] uppercase text-slate-500 font-black">
                            {['Open', 'Open $', 'In', 'Out', 'Sales', 'Sales $', 'COS', 'COS %', 'Book close'].map(l => <th key={l} className={`bg-slate-50 ${th}`}>{l}</th>)}
                            <th className="bg-slate-50 border-b-2 border-r-2 border-slate-300 px-1.5 min-w-[70px]">Close $</th>
                            {villaCols.map(v => <th key={v} className="bg-indigo-50 text-indigo-700 border-b-2 border-r border-slate-200 px-0.5 min-w-[34px]">{v}</th>)}
                            <th className={`bg-purple-50 ${th}`}>Villas</th>
                            <th className={`bg-purple-100 text-purple-700 ${th}`}>MB Store</th>
                            <th className="bg-[#6D2158]/10 text-[#6D2158] border-b-2 border-r-2 border-slate-300 px-1.5 min-w-[58px]">Total</th>
                            <th className={`bg-rose-50 text-rose-700 ${th}`}>Qty</th>
                            <th className={`bg-slate-50 ${th} min-w-[70px]`}>Value</th>
                            <th className="bg-slate-50 border-b-2 border-slate-200 px-3 text-left min-w-[200px]">Comment</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.length === 0 && <tr><td colSpan={16 + villaCols.length} className="p-10 text-center text-slate-400 font-bold">{varianceOnly ? 'No variance. Everything tallies.' : 'No items match.'}</td></tr>}
                        {visibleRows.map(r => (
                            <tr key={r.artNo} className="group">
                                <td className="sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-b border-r-2 border-slate-200 px-3 py-1 w-[170px] min-w-[170px] max-w-[170px] md:w-[250px] md:min-w-[250px] md:max-w-[250px]">
                                    <div className="font-bold text-slate-800 truncate" title={r.item.article_name}>{r.item.generic_name || r.item.article_name}</div>
                                    <div className="text-[9px] text-slate-400 font-semibold truncate">{r.artNo}{r.item.micros_name ? ` · ${r.item.micros_name}` : ''} · {r.item.category}{r.item.unit ? ` · ${r.item.unit}` : ''}</div>
                                </td>
                                <td className={`${td} text-rose-700`}>{money2(r.avgCost)}</td>
                                <td className={`${td} border-r-2 border-r-slate-200 text-emerald-700`}>{money2(r.salePrice)}</td>
                                <td className={`${td} font-bold text-blue-700`}>{r.fin.opening_stock || '–'}</td>
                                <td className={`${td} text-slate-400`}>{money2(r.opVal)}</td>
                                <td className={`${td} text-emerald-700`}>{r.fin.transfer_in || '–'}</td>
                                <td className={`${td} text-rose-700`}>{r.fin.transfer_out || '–'}</td>
                                <td className={`${td} font-bold text-amber-700`}>{r.fin.sales || '–'}</td>
                                <td className={`${td} font-bold`}>{money2(r.salesVal)}</td>
                                <td className={`${td} text-slate-400`}>{money2(r.cos)}</td>
                                <td className={`${td} text-slate-400`}>{r.salesVal > 0 ? `${((r.cos / r.salesVal) * 100).toFixed(1)}%` : '–'}</td>
                                <td className={`${td} font-black text-[#6D2158] bg-[#6D2158]/5`}>{r.soh}</td>
                                <td className={`${td} border-r-2 border-r-slate-200 font-bold text-slate-600`}>{money2(r.closeVal)}</td>
                                {villaCols.map(v => { const q = matrixDict[v]?.[r.artNo] || 0; return <td key={v} className={`border-b border-r border-slate-100 text-center ${q > 0 ? 'font-black text-indigo-700 bg-indigo-50/50' : 'text-slate-200'}`}>{q > 0 ? q : '·'}</td>; })}
                                <td className={`${td} font-bold text-purple-800 bg-purple-50/50`}>{r.villaTotal}</td>
                                <td className={`${td} font-bold text-purple-700`}>{r.fin.minibar_store || '–'}</td>
                                <td className={`${td} border-r-2 border-r-slate-200 font-black text-[#6D2158] bg-[#6D2158]/5`}>{r.physTotal}</td>
                                <td className={`${td} font-black ${r.varQty < 0 ? 'text-rose-600 bg-rose-50' : r.varQty > 0 ? 'text-amber-700 bg-amber-50' : 'text-emerald-500'}`}>{r.varQty > 0 ? `+${r.varQty}` : r.varQty === 0 ? '✓' : r.varQty}</td>
                                <td className={`${td} font-bold ${r.varVal < 0 ? 'text-rose-600' : r.varVal > 0 ? 'text-amber-700' : 'text-slate-300'}`}>{r.varVal === 0 ? '–' : money2(r.varVal)}</td>
                                <td className="border-b border-slate-100 px-3 text-slate-500 italic">{r.fin.comments}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-30">
                        <tr className="text-[11px] font-black text-slate-700 [&>td]:bg-slate-100 [&>td]:border-t-2 [&>td]:border-slate-300 [&>td]:text-center [&>td]:py-2">
                            <td className="sticky left-0 z-40 !text-left px-3 border-r-2">Total · {visibleRows.length} items</td>
                            <td /><td className="border-r-2" />
                            <td>{visTotals.open}</td><td>{money(visTotals.opVal)}</td><td>{visTotals.inQ}</td><td>{visTotals.outQ}</td>
                            <td>{visTotals.salesQty}</td><td>{money(visTotals.salesVal)}</td><td>{money(visTotals.cos)}</td>
                            <td>{visTotals.salesVal ? `${((visTotals.cos / visTotals.salesVal) * 100).toFixed(1)}%` : '–'}</td>
                            <td className="!text-[#6D2158]">{visTotals.soh}</td><td className="border-r-2">{money(visTotals.closeVal)}</td>
                            {villaCols.map(v => <td key={v} />)}
                            <td>{visTotals.villaTotal}</td><td>{visTotals.store}</td><td className="border-r-2 !text-[#6D2158]">{visTotals.physTotal}</td>
                            <td className={visTotals.varQty < 0 ? '!text-rose-600' : ''}>{visTotals.varQty > 0 ? '+' : ''}{visTotals.varQty}</td>
                            <td className={visTotals.varVal < 0 ? '!text-rose-600' : ''}>{money(visTotals.varVal)}</td>
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

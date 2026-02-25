"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Loader2, FileSpreadsheet, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as ExcelJS from 'exceljs';

const TOTAL_VILLAS = 97;

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
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [doubleVillasStr, setDoubleVillasStr] = useState<string>('');

  const activeVillaList = useMemo(() => {
      const doubleList = doubleVillasStr.split(',').map(s => s.trim()).filter(Boolean);
      const list: string[] = [];
      for (let i = 1; i <= TOTAL_VILLAS; i++) {
          const v = String(i);
          if (doubleList.includes(v)) { list.push(`${v}-1`, `${v}-2`); } 
          else { list.push(v); }
      }
      return list;
  }, [doubleVillasStr]);

  const fetchMonthlyData = useCallback(async () => {
    setIsLoading(true);
    const [y, m] = selectedMonth.split('-').map(Number);
    const startOfMonth = new Date(y, m - 1, 1).toISOString();
    const startOfNextMonth = new Date(y, m, 1).toISOString();

    const [subRes, finRes] = await Promise.all([
        supabase.from('hsk_villa_minibar_inventory').select('*').gte('logged_at', startOfMonth).lt('logged_at', startOfNextMonth),
        supabase.from('hsk_monthly_minibar').select('*').eq('month_period', selectedMonth)
    ]);

    if (subRes.data) {
      const latestSubmissions: Record<string, any> = {};
      subRes.data.forEach(sub => {
        const existing = latestSubmissions[sub.villa_number];
        if (!existing || new Date(sub.logged_at) > new Date(existing.logged_at)) {
            latestSubmissions[sub.villa_number] = sub;
        }
      });
      setSubmissions(Object.values(latestSubmissions));
    }

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
  }, [selectedMonth]);

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
        supabase.from('hsk_constants').select('*').in('type', ['hidden_mb_item', 'double_mb_villas', 'mb_active_period']) 
    ]);

    if (catRes.data) {
        const sortedCatalog = catRes.data.sort((a, b) => {
            const orderA = a.sort_order || 9999;
            const orderB = b.sort_order || 9999;
            if (orderA !== orderB) return orderA - orderB;
            return getCategoryWeight(a.category) - getCategoryWeight(b.category) || a.article_name.localeCompare(b.article_name);
        });
        setCatalog(sortedCatalog);
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
          const visibleCatalogItems = catalog.filter(c => !hiddenItems.includes(c.article_number));
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
          visibleCatalogItems.forEach(item => {
              const artNo = item.article_number;
              const fin = financials[artNo] || { opening_stock: 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
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

  if (!isMounted) return null;
  const visibleCatalogItems = catalog.filter(c => !hiddenItems.includes(c.article_number));

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#FDFBFD] font-sans text-slate-800 overflow-hidden">
      
      {/* HEADER */}
      <div className="flex-none flex justify-between items-center border-b border-slate-200 p-4 md:p-6 bg-white z-10 shadow-sm">
        <div>
           <h1 className="text-2xl font-black text-[#6D2158]">Finance P&L Portal</h1>
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1">
               <Lock size={10} className="text-emerald-500" /> Secure Read-Only Access
           </p>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center bg-slate-50 p-2 rounded-xl border border-slate-200 gap-2">
              <Calendar size={16} className="text-slate-400 ml-2"/>
              <input type="month" className="bg-transparent text-sm font-bold text-[#6D2158] outline-none cursor-pointer p-1" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
           </div>
           <button onClick={exportToRealExcel} disabled={isExporting} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
               {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16}/>}
               {isExporting ? 'Generating...' : 'Download Excel'}
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4 md:p-6 relative flex flex-col">
        {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
        ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full w-full relative overflow-hidden">
                <div className="overflow-auto flex-1 w-full bg-slate-50 custom-scrollbar relative">
                    <table className="w-max min-w-full border-collapse text-[10px] whitespace-nowrap bg-white" style={{ tableLayout: 'fixed', width: 'max-content' }}>
                        <thead className="sticky top-0 z-40 bg-white">
                            <tr>
                                <th rowSpan={2} className="sticky left-0 z-50 bg-slate-200 border-r-2 border-b-2 border-slate-300 p-0 shadow-[2px_0_5px_rgba(0,0,0,0.05)] align-top" style={{ width: TOTAL_MASTER_WIDTH, minWidth: TOTAL_MASTER_WIDTH, maxWidth: TOTAL_MASTER_WIDTH }}>
                                    <div className="flex w-full h-full items-stretch text-center font-black text-slate-600 uppercase tracking-widest divide-x divide-slate-300">
                                        <div className={`${MASTER_WIDTHS.microsName} p-2 flex items-center justify-center break-words whitespace-normal leading-tight`}>Micros Name</div>
                                        <div className={`${MASTER_WIDTHS.artNo} p-2 flex items-center justify-center break-words whitespace-normal leading-tight`}>Art #</div>
                                        <div className={`${MASTER_WIDTHS.artName} p-2 flex items-center justify-center break-words whitespace-normal leading-tight text-left`}>Article Name</div>
                                        <div className={`${MASTER_WIDTHS.unit} p-2 flex items-center justify-center break-words whitespace-normal leading-tight`}>Unit</div>
                                        <div className={`${MASTER_WIDTHS.cost} p-2 text-rose-700 bg-rose-50 flex items-center justify-center break-words whitespace-normal leading-tight`}>Avg Cost</div>
                                        <div className={`${MASTER_WIDTHS.price} p-2 text-emerald-700 bg-emerald-50 flex items-center justify-center break-words whitespace-normal leading-tight`}>Sell Price</div>
                                    </div>
                                </th>
                                <th colSpan={10} className="bg-blue-50 text-blue-800 border-r-2 border-slate-300 p-2 text-center text-xs uppercase tracking-widest font-black">System & Financials</th>
                                <th colSpan={activeVillaList.length} className="bg-indigo-50 text-indigo-800 border-r-2 border-slate-300 p-2 text-center text-xs uppercase tracking-widest font-black">Physical Villa Counts</th>
                                <th colSpan={3} className="bg-purple-50 text-purple-800 border-r-2 border-slate-300 p-2 text-center text-xs uppercase tracking-widest font-black">Store & Totals</th>
                                <th colSpan={3} className="bg-rose-50 text-rose-800 border-r border-slate-300 p-2 text-center text-xs uppercase tracking-widest font-black">Variance & Audit</th>
                            </tr>
                            <tr className="bg-slate-100 text-[9px] uppercase text-slate-500 font-bold border-b-2 border-slate-300">
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center text-blue-600 bg-blue-50/80">Open Stk</th>
                                <th className="w-[70px] min-w-[70px] p-2 border-r border-slate-200 text-center">Open Val</th>
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center text-emerald-600 bg-emerald-50/80">Trans IN</th>
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center text-rose-600 bg-rose-50/80">Trans OUT</th>
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center text-amber-600 bg-amber-50/80">Sales</th>
                                <th className="w-[70px] min-w-[70px] p-2 border-r border-slate-200 text-center">Sales Val</th>
                                <th className="w-[70px] min-w-[70px] p-2 border-r border-slate-200 text-center">COS</th>
                                <th className="w-16 min-w-[64px] p-2 border-r border-slate-200 text-center">COS %</th>
                                <th className="w-[70px] min-w-[70px] p-2 border-r border-slate-200 text-center text-[#6D2158] font-black bg-[#6D2158]/10">SOH Clos</th>
                                <th className="w-20 min-w-[80px] p-2 border-r-2 border-slate-300 text-center font-black">Close Val</th>
                                {activeVillaList.map(v => <th key={v} className="w-10 min-w-[40px] p-2 border-r border-slate-200 text-center">{v}</th>)}
                                <th className="w-20 min-w-[80px] p-2 border-r border-slate-200 text-center bg-purple-50/80">Villa Total</th>
                                <th className="w-20 min-w-[80px] p-2 border-r border-slate-200 text-center text-purple-700 bg-purple-100/80">MB Store</th>
                                <th className="w-20 min-w-[80px] p-2 border-r-2 border-slate-300 text-center font-black text-[#6D2158] bg-[#6D2158]/10">Total Phys</th>
                                <th className="w-20 min-w-[80px] p-2 border-r border-slate-200 text-center font-black text-rose-600 bg-rose-50/80">Var Qty</th>
                                <th className="w-20 min-w-[80px] p-2 border-r border-slate-200 text-center font-black">Var Val</th>
                                <th className="w-48 min-w-[192px] p-2 border-r border-slate-200 text-left pl-4">Comments</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                            {visibleCatalogItems.map(item => {
                                const artNo = item.article_number;
                                const fin = financials[artNo] || { opening_stock: 0, transfer_in: 0, transfer_out: 0, sales: 0, minibar_store: 0, comments: '' };
                                const avgCost = parseFloat(item.avg_cost) || 0;
                                const salePrice = parseFloat(item.sales_price) || 0;
                                
                                const opVal = fin.opening_stock * avgCost;
                                const salesVal = fin.sales * salePrice;
                                const cos = fin.sales * avgCost;
                                const cosPct = salesVal > 0 ? (cos / salesVal) * 100 : 0;
                                const soh = fin.opening_stock + fin.transfer_in - fin.transfer_out - fin.sales;
                                const closingVal = soh * avgCost;
                                
                                const villaTotal = activeVillaList.reduce((sum, v) => sum + (matrixDict[v]?.[artNo] || 0), 0);
                                const physTotal = villaTotal + fin.minibar_store;
                                const physVal = physTotal * avgCost;
                                
                                const varQty = physTotal - soh;
                                const varVal = varQty * avgCost;

                                return (
                                    <tr key={artNo} className="hover:bg-slate-50 transition-colors group">
                                        <td className="sticky left-0 z-30 bg-white p-0 border-r-2 border-slate-300 shadow-[2px_0_5px_rgba(0,0,0,0.05)] group-hover:bg-slate-50 transition-colors" style={{ width: TOTAL_MASTER_WIDTH, minWidth: TOTAL_MASTER_WIDTH, maxWidth: TOTAL_MASTER_WIDTH }}>
                                            <div className="flex w-full h-full items-stretch text-left divide-x divide-slate-100">
                                                <div className={`${MASTER_WIDTHS.microsName} p-2 flex items-center truncate`} title={item.micros_name}>{item.micros_name || '-'}</div>
                                                <div className={`${MASTER_WIDTHS.artNo} p-2 flex items-center justify-center text-slate-400 font-mono`}>{artNo}</div>
                                                <div className={`${MASTER_WIDTHS.artName} p-2 flex items-center font-bold text-slate-800 truncate text-left`} title={item.article_name}>{item.article_name}</div>
                                                <div className={`${MASTER_WIDTHS.unit} p-2 flex items-center justify-center`}>{item.unit}</div>
                                                <div className={`${MASTER_WIDTHS.cost} p-2 flex items-center justify-center text-rose-700 font-bold bg-rose-50/30`}>{item.avg_cost || 0}</div>
                                                <div className={`${MASTER_WIDTHS.price} p-2 flex items-center justify-center text-emerald-700 font-bold bg-emerald-50/30`}>{item.sales_price || 0}</div>
                                            </div>
                                        </td>
                                        <td className="p-2 border-r border-slate-200 text-center font-bold text-blue-700 bg-blue-50/20">{fin.opening_stock}</td>
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-500">${opVal.toFixed(2)}</td>
                                        <td className="p-2 border-r border-slate-200 text-center font-bold text-emerald-700 bg-emerald-50/20">{fin.transfer_in}</td>
                                        <td className="p-2 border-r border-slate-200 text-center font-bold text-rose-700 bg-rose-50/20">{fin.transfer_out}</td>
                                        <td className="p-2 border-r border-slate-200 text-center font-bold text-amber-700 bg-amber-50/20">{fin.sales}</td>
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-700 font-bold">${salesVal.toFixed(2)}</td>
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-500">${cos.toFixed(2)}</td>
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-500">{cosPct.toFixed(1)}%</td>
                                        <td className="p-2 border-r border-slate-200 text-center font-black text-[#6D2158] bg-[#6D2158]/5">{soh}</td>
                                        <td className="p-2 border-r-2 border-slate-300 text-center font-black">${closingVal.toFixed(2)}</td>
                                        {activeVillaList.map(v => {
                                            const qty = matrixDict[v]?.[artNo] || 0;
                                            return (
                                                <td key={v} className={`p-2 border-r border-slate-50 text-center ${qty > 0 ? 'font-black text-[#6D2158] bg-[#6D2158]/5' : 'text-slate-300'}`}>{qty > 0 ? qty : '-'}</td>
                                            );
                                        })}
                                        <td className="p-2 border-x border-slate-200 text-center bg-purple-50/30 font-bold text-purple-800">{villaTotal}</td>
                                        <td className="p-2 border-r border-slate-200 text-center font-bold text-purple-700 bg-purple-100/30">{fin.minibar_store}</td>
                                        <td className="p-2 border-r-2 border-slate-300 text-center font-black text-[#6D2158] bg-[#6D2158]/5">{physTotal}</td>
                                        <td className={`p-2 border-r border-slate-200 text-center font-black ${varQty < 0 ? 'text-rose-600 bg-rose-50' : varQty > 0 ? 'text-amber-600 bg-amber-50' : 'text-emerald-500'}`}>{varQty > 0 ? `+${varQty}` : varQty === 0 ? '-' : varQty}</td>
                                        <td className={`p-2 border-r border-slate-200 text-center font-bold ${varVal < 0 ? 'text-rose-600' : 'text-slate-500'}`}>${varVal.toFixed(2)}</td>
                                        <td className="p-2 border-r border-slate-200 text-left text-slate-500 italic px-4 truncate max-w-[192px]" title={fin.comments}>{fin.comments || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
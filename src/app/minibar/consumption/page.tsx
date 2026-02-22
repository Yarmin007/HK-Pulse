"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, UploadCloud, Loader2, ArrowRight, ArrowLeft, 
  BarChart3, RefreshCw, AlertTriangle, CheckCircle2, Zap, AlertCircle, ShoppingCart
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

// --- TYPES ---
type MasterItem = {
  article_number: string;
  article_name: string;
  generic_name?: string;
  micros_name?: string;
  category: string;
};

type ConsumptionRow = {
  articleNumber: string;
  itemName: string;
  category: string;
  appQty: number;
  posQty: number;
  variance: number; // posQty - appQty (positive means App missed some)
};

// Helper to get standard cutoff period (26th to 25th)
const getDefaultPeriod = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = today.getDate();

  let start, end;
  if (date >= 26) {
    start = new Date(year, month, 26);
    end = new Date(year, month + 1, 25);
  } else {
    start = new Date(year, month - 1, 26);
    end = new Date(year, month, 25);
  }

  const formatYMD = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return { startStr: formatYMD(start), endStr: formatYMD(end) };
};

export default function MinibarConsumptionPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Date Range (Defaults to 26th - 25th)
  const initialPeriod = getDefaultPeriod();
  const [startDate, setStartDate] = useState(initialPeriod.startStr);
  const [endDate, setEndDate] = useState(initialPeriod.endStr);

  const [catalog, setCatalog] = useState<MasterItem[]>([]);
  const [appSales, setAppSales] = useState<Record<string, number>>({});
  const [posSales, setPosSales] = useState<Record<string, number>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
    fetchBaseData();
  }, []);

  useEffect(() => {
    if (isMounted && catalog.length > 0 && startDate && endDate) {
      fetchAppSales();
    }
  }, [startDate, endDate, catalog, isMounted]);

  const fetchBaseData = async () => {
    setIsLoading(true);
    // Fetch Minibar Catalog
    const { data: masters } = await supabase
      .from('hsk_master_catalog')
      .select('article_number, article_name, generic_name, micros_name, category')
      .eq('is_minibar_item', true);
    
    if (masters) setCatalog(masters);
    setIsLoading(false);
  };

  const fetchAppSales = async () => {
    setIsLoading(true);

    const { data: reqs } = await supabase
      .from('hsk_daily_requests')
      .select('item_details, is_posted')
      .eq('request_type', 'Minibar')
      .eq('is_posted', true)
      .gte('request_time', `${startDate}T00:00:00`)
      .lte('request_time', `${endDate}T23:59:59`);

    const aggregated: Record<string, number> = {};

    if (reqs) {
      reqs.forEach(r => {
        if (!r.item_details) return;
        r.item_details.split(/\n|,/).forEach((line: string) => {
           if (line.includes('(Refill)')) return; // Ignore unposted refills
           const match = line.match(/(\d+)\s*x\s+(.+)/i);
           if (match) {
              const qty = parseInt(match[1]);
              const name = match[2].trim().toLowerCase();
              aggregated[name] = (aggregated[name] || 0) + qty;
           }
        });
      });
    }
    
    setAppSales(aggregated);
    setIsLoading(false);
  };

  // --- XLSX / CSV UPLOAD PARSER ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        const posData: Record<string, number> = {};
        let isDataSection = false;
        let nameIdx = -1;
        let soldIdx = -1;

        for (const row of rows) {
          if (!row || row.length === 0) continue;

          // Find the header row to start parsing
          if (!isDataSection) {
            const strRow = row.map(String).map(s => s.toLowerCase().trim());
            nameIdx = strRow.findIndex(s => s === 'item name');
            soldIdx = strRow.findIndex(s => s === '# sold');

            if (nameIdx > -1 && soldIdx > -1) {
              isDataSection = true;
            }
            continue;
          }

          if (row[soldIdx] !== undefined && row[soldIdx] !== '') {
            const col0 = String(row[0] || '').toLowerCase();
            const colName = String(row[nameIdx] || '').toLowerCase();
            if (col0.includes('subtotal') || colName.includes('subtotal')) continue; // Skip subtotal rows

            const itemName = colName.trim();
            const qty = parseInt(String(row[soldIdx]).replace(/,/g, '')) || 0;

            if (itemName && qty > 0) {
              posData[itemName] = (posData[itemName] || 0) + qty;
            }
          }
        }
        
        setPosSales(posData);
      } catch (error) {
        alert("Error parsing file. Please ensure it is a valid export.");
      }
      setIsLoading(false);
      // Reset input so same file can be uploaded again if needed
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    };

    reader.readAsBinaryString(file);
  };

  // --- MERGE LOGIC ---
  const mergedData = useMemo(() => {
    const rows: ConsumptionRow[] = [];

    catalog.forEach(item => {
      // 1. Calculate App Qty (Matching generic_name or article_name)
      const possibleAppNames = [
        item.generic_name?.toLowerCase(), 
        item.article_name.toLowerCase()
      ].filter(Boolean) as string[];

      let aQty = 0;
      for (const [appName, qty] of Object.entries(appSales)) {
        if (possibleAppNames.includes(appName)) aQty += qty;
      }

      // 2. Calculate POS Qty (Matching micros_name or article_name)
      const possiblePosNames = [
        item.micros_name?.toLowerCase(),
        item.article_name.toLowerCase(),
        item.generic_name?.toLowerCase()
      ].filter(Boolean) as string[];

      let pQty = 0;
      for (const [posName, qty] of Object.entries(posSales)) {
        if (possiblePosNames.some(pn => posName.includes(pn) || pn.includes(posName))) {
          pQty += qty;
        }
      }

      // Only add to table if there is consumption in either system
      if (aQty > 0 || pQty > 0) {
        rows.push({
          articleNumber: item.article_number,
          itemName: item.generic_name || item.article_name,
          category: item.category,
          appQty: aQty,
          posQty: pQty,
          variance: pQty - aQty
        });
      }
    });

    return rows.sort((a, b) => b.posQty - a.posQty); // Sort by highest POS consumption
  }, [catalog, appSales, posSales]);

  const stats = useMemo(() => {
    let totalApp = 0;
    let totalPos = 0;
    let totalMissing = 0;

    mergedData.forEach(r => {
      totalApp += r.appQty;
      totalPos += r.posQty;
      if (r.variance > 0) totalMissing += r.variance;
    });

    return { totalApp, totalPos, totalMissing };
  }, [mergedData]);

  const topItems = [...mergedData].sort((a,b) => Math.max(b.appQty, b.posQty) - Math.max(a.appQty, a.posQty)).slice(0, 5);

  // --- AUTO SYNC LOGIC ---
  const handleSyncToSystem = async () => {
    const itemsToSync = mergedData.filter(r => r.variance > 0);
    if (itemsToSync.length === 0) return;

    if (!confirm(`This will generate a system log for ${stats.totalMissing} missing items to align the app with the POS. Proceed?`)) return;
    
    setIsSyncing(true);

    const detailsString = itemsToSync.map(i => `${i.variance}x ${i.itemName}`).join('\n');
    const syncTime = endDate + 'T23:59:00'; // Log it at the end of the selected period

    const { error } = await supabase.from('hsk_daily_requests').insert({
      villa_number: 'SYS',
      request_type: 'Minibar',
      item_details: detailsString,
      is_posted: true,
      is_sent: true,
      is_done: true,
      chk_number: `SYNC-${Date.now().toString().slice(-6)}`,
      attendant_name: 'System Auto-Sync',
      request_time: syncTime
    });

    if (error) {
       alert("Sync Failed: " + error.message);
    } else {
       alert("Successfully synchronized! The missing items have been added to the system logs.");
       fetchAppSales(); // Refresh App data so variance becomes 0
    }
    
    setIsSyncing(false);
  };

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-6 pb-20 font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-4 mb-6 gap-4">
        <div>
           <h1 className="text-3xl font-bold tracking-tight">Minibar Consumption</h1>
           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Variance & Sync Analytics</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
           <div className="flex items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm gap-2">
              <input type="date" className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer" value={startDate} onChange={e => setStartDate(e.target.value)}/>
              <span className="text-slate-300 font-black">-</span>
              <input type="date" className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer" value={endDate} onChange={e => setEndDate(e.target.value)}/>
           </div>
           
           <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
           <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-5 py-2.5 bg-[#6D2158] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md hover:bg-[#5a1b49] transition-all">
              <UploadCloud size={16}/> Upload POS (CSV)
           </button>
        </div>
      </div>

      {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
      ) : (
        <div className="space-y-6">
           
           {/* KPI ROW */}
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><ShoppingCart size={12}/> App Recorded</p>
                 <p className="text-3xl font-black text-slate-800">{stats.totalApp}</p>
                 <p className="text-[10px] font-bold text-slate-400 mt-1">Items posted in app</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
                 <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1 flex items-center gap-1"><BarChart3 size={12}/> POS System</p>
                 <p className="text-3xl font-black text-blue-700">{stats.totalPos}</p>
                 <p className="text-[10px] font-bold text-slate-400 mt-1">Items sold per Micros</p>
              </div>
              <div className={`p-5 rounded-2xl shadow-sm border flex flex-col justify-center ${stats.totalMissing > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                 <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1 ${stats.totalMissing > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                     {stats.totalMissing > 0 ? <AlertCircle size={12}/> : <CheckCircle2 size={12}/>} Uncaptured
                 </p>
                 <p className={`text-3xl font-black ${stats.totalMissing > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{stats.totalMissing}</p>
                 <p className={`text-[10px] font-bold mt-1 ${stats.totalMissing > 0 ? 'text-rose-400' : 'text-emerald-500'}`}>Items missing from app</p>
              </div>
              <div className="bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-700 flex flex-col justify-center text-white relative overflow-hidden">
                 <div className="relative z-10">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">System Action</p>
                     {stats.totalMissing > 0 ? (
                         <button onClick={handleSyncToSystem} disabled={isSyncing} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
                             {isSyncing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Sync {stats.totalMissing} Items
                         </button>
                     ) : (
                         <div className="flex items-center gap-2 text-emerald-400 font-bold bg-white/10 px-4 py-3 rounded-xl justify-center">
                             <CheckCircle2 size={16}/> Perfectly Synced
                         </div>
                     )}
                 </div>
              </div>
           </div>

           {/* INSIGHTS & TABLE GRID */}
           <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* TOP 5 CHART */}
              <div className="xl:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-fit">
                 <h3 className="font-bold text-[#6D2158] mb-6 flex items-center gap-2"><Zap size={18}/> Top Consumed Items</h3>
                 <div className="space-y-5">
                    {topItems.map(item => {
                        const max = Math.max(...topItems.map(i => Math.max(i.appQty, i.posQty)));
                        const appPct = (item.appQty / max) * 100;
                        const posPct = (item.posQty / max) * 100;

                        return (
                           <div key={item.articleNumber} className="space-y-1">
                               <div className="flex justify-between text-xs font-bold text-slate-700">
                                   <span className="truncate pr-2">{item.itemName}</span>
                                   <span className="text-slate-400 shrink-0">{Math.max(item.appQty, item.posQty)}</span>
                               </div>
                               <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex flex-col gap-0.5 bg-transparent">
                                   {item.appQty > 0 && <div className="h-full bg-[#6D2158] rounded-full" style={{ width: `${appPct}%` }}></div>}
                               </div>
                               <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex flex-col gap-0.5 bg-transparent">
                                   {item.posQty > 0 && <div className="h-full bg-blue-500 rounded-full" style={{ width: `${posPct}%` }}></div>}
                               </div>
                           </div>
                        );
                    })}
                    {topItems.length === 0 && <p className="text-xs text-slate-400 italic">Upload POS data or post bills to see insights.</p>}
                 </div>
                 {topItems.length > 0 && (
                     <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-100 text-[9px] font-bold uppercase text-slate-400">
                         <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#6D2158]"></div> App Logged</span>
                         <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> POS System</span>
                     </div>
                 )}
              </div>

              {/* DETAILS TABLE */}
              <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto">
                 <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-200">
                       <tr>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider">Item</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-[#6D2158] tracking-wider text-center">App Qty</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-blue-600 tracking-wider text-center">POS Qty</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">Variance</th>
                          <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider text-right">Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {mergedData.map(row => (
                          <tr key={row.articleNumber} className="hover:bg-slate-50 transition-colors">
                             <td className="px-4 py-3">
                                 <p className="font-bold text-slate-800">{row.itemName}</p>
                                 <p className="text-[10px] text-slate-400">{row.category} • #{row.articleNumber}</p>
                             </td>
                             <td className="px-4 py-3 text-center font-bold text-[#6D2158]">{row.appQty}</td>
                             <td className="px-4 py-3 text-center font-bold text-blue-600">{row.posQty > 0 ? row.posQty : '-'}</td>
                             <td className="px-4 py-3 text-center">
                                 <span className={`font-black ${row.variance > 0 ? 'text-rose-600' : row.variance < 0 ? 'text-amber-600' : 'text-emerald-500'}`}>
                                     {row.variance > 0 ? `+${row.variance}` : row.variance === 0 ? '-' : row.variance}
                                 </span>
                             </td>
                             <td className="px-4 py-3 text-right">
                                 {row.variance > 0 ? (
                                     <span className="inline-block px-2 py-1 bg-rose-50 text-rose-700 text-[9px] font-black uppercase rounded">Missing</span>
                                 ) : row.variance < 0 ? (
                                     <span className="inline-block px-2 py-1 bg-amber-50 text-amber-700 text-[9px] font-black uppercase rounded">Over-Logged</span>
                                 ) : (
                                     <span className="inline-block px-2 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase rounded">Matched</span>
                                 )}
                             </td>
                          </tr>
                       ))}
                       {mergedData.length === 0 && (
                           <tr>
                               <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm italic">
                                   Select a date range with posted bills, or upload a POS CSV to view consumption.
                               </td>
                           </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
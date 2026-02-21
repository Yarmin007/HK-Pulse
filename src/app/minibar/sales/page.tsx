"use client";
import React, { useState, useEffect } from 'react';
import { Calendar, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// EXACT CATEGORY MAPPINGS REQUESTED
const CATEGORY_GROUPS = [
  { group: 'Foods and Other', cats: ['Bites', 'Sweets', 'Retail', 'Pillow Menu', 'Baby Items', 'General Requests'] },
  { group: 'Beverages', cats: ['Soft Drinks', 'Juices', 'Water'] },
  { group: 'Beer', cats: ['Beer'] },
  { group: 'Wine and liquor', cats: ['Wines', 'Spirits'] }
];

export default function MinibarSalesPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  
  const [catalog, setCatalog] = useState<any[]>([]);
  const [salesColumns, setSalesColumns] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
    setIsLoading(true);

    // 1. Fetch Minibar Master Catalog
    const { data: masters, error: masterError } = await supabase
        .from('hsk_master_catalog')
        .select('*')
        .eq('is_minibar_item', true)
        .order('article_name');

    if (masters) {
        setCatalog(masters);
    } else {
        console.error("Failed to load catalog", masterError);
        setCatalog([]);
    }

    // 2. Fetch Posted Requests for selected Date
    const dateStr = selectedDate.toISOString().split('T')[0];
    const { data: reqs, error: reqError } = await supabase
        .from('hsk_daily_requests')
        .select('*')
        .eq('request_type', 'Minibar')
        .eq('is_posted', true)
        .gte('request_time', `${dateStr}T00:00:00`)
        .lte('request_time', `${dateStr}T23:59:59`);

    if (reqs) {
        // Parse raw string details into itemized counts, ignoring Refills
        const columns = reqs.map(r => {
            const parsedItems: Record<string, number> = {};
            
            if (r.item_details) {
                r.item_details.split(/\n|,/).forEach((line: string) => {
                    if (line.includes('(Refill)')) return; // IGNORING REFILLS COMPLETELY
                    
                    const match = line.match(/(\d+)\s*x\s+(.+)/i);
                    if (match) {
                        const qty = parseInt(match[1]);
                        const itemName = match[2].trim();
                        parsedItems[itemName] = (parsedItems[itemName] || 0) + qty;
                    }
                });
            }

            return {
                chk: r.chk_number || 'No Bill',
                villa: r.villa_number || '?',
                items: parsedItems
            };
        }).filter(col => Object.keys(col.items).length > 0); // Ignore columns that only had refills

        // Sort by CHK number numerically
        columns.sort((a, b) => {
            const numA = parseInt(a.chk);
            const numB = parseInt(b.chk);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.chk.localeCompare(b.chk);
        });
        
        setSalesColumns(columns);
    } else {
        console.error("Failed to load requests", reqError);
        setSalesColumns([]);
    }
    
    setIsLoading(false);
  };

  const changeDate = (days: number) => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      setSelectedDate(d);
  };

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-6 pb-20 font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-4 mb-6 gap-4">
        <div>
           <h1 className="text-3xl font-bold tracking-tight">Minibar Sales</h1>
           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Posted Billing Record</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
           <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500"><ArrowLeft size={16}/></button>
           <div className="flex items-center gap-2 text-sm font-bold text-[#6D2158] min-w-[140px] justify-center">
              <Calendar size={14}/> {selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
           </div>
           <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500"><ArrowRight size={16}/></button>
        </div>
      </div>

      {isLoading ? (
          <div className="flex justify-center py-20 text-[#6D2158]"><Loader2 className="animate-spin" size={32}/></div>
      ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto relative max-w-full">
             {/* COMPACT TABLE */}
             <table className="w-full text-left border-collapse text-[11px] whitespace-nowrap min-w-max">
                <thead className="bg-slate-50 sticky top-0 z-30 shadow-sm">
                   <tr>
                      {/* STICKY LEFT HEADER */}
                      <th className="px-3 py-2 border-r border-b border-slate-200 sticky left-0 bg-slate-50 z-40 min-w-[140px] max-w-[140px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                         <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Bill No.</span>
                         <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider mt-1">Villa No.</span>
                      </th>
                      
                      {/* DYNAMIC BILL COLUMNS */}
                      {salesColumns.map((col, idx) => (
                         <th key={`header-${idx}`} className="px-2 py-2 border-r border-b border-slate-200 text-center min-w-[55px]">
                            <span className="block text-xs font-black text-[#6D2158]">{col.chk}</span>
                            <span className="block text-[10px] font-bold text-slate-500 mt-1">{col.villa}</span>
                         </th>
                      ))}
                      {salesColumns.length === 0 && <th className="p-3 border-b border-slate-200 text-slate-400 font-bold italic text-xs">No sales posted today.</th>}
                      
                      {/* STICKY RIGHT HEADER (TOTAL) */}
                      {salesColumns.length > 0 && (
                         <th className="px-3 py-2 border-l border-b border-slate-200 sticky right-0 bg-slate-100 z-40 min-w-[60px] text-center shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                            <span className="block text-[10px] font-black uppercase text-[#6D2158] tracking-wider mt-2">Total</span>
                         </th>
                      )}
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                   {CATEGORY_GROUPS.map((group) => {
                      const groupItems = catalog.filter(i => group.cats.includes(i.category));
                      if (groupItems.length === 0) return null;
                      
                      return (
                         <React.Fragment key={`group-${group.group}`}>
                            {/* Group Header Row */}
                            <tr className="bg-slate-100/50">
                               <td colSpan={salesColumns.length > 0 ? salesColumns.length + 2 : 2} className="px-3 py-1.5 font-black text-[9px] uppercase tracking-widest text-[#6D2158] sticky left-0 border-r border-slate-200 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                  {group.group}
                               </td>
                            </tr>

                            {/* Item Rows */}
                            {groupItems.map(item => {
                               const itemNameMatch = item.generic_name || item.article_name || 'Unknown Item';
                               
                               // Calculate row total
                               const rowTotal = salesColumns.reduce((sum, col) => {
                                   const qty = (col.items && col.items[itemNameMatch]) || (col.items && col.items[item.article_name]) || 0;
                                   return sum + qty;
                               }, 0);

                               return (
                                 <tr key={`item-${item.article_number}`} className={`hover:bg-blue-50 transition-colors ${rowTotal === 0 ? 'opacity-40' : ''}`}>
                                    {/* STICKY LEFT ITEM NAME */}
                                    <td className="px-3 py-1.5 border-r border-slate-200 font-bold text-slate-700 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)] truncate max-w-[140px]" title={itemNameMatch}>
                                       {itemNameMatch}
                                    </td>
                                    
                                    {/* DYNAMIC QTY CELLS */}
                                    {salesColumns.map((col, idx) => {
                                       const qty = (col.items && col.items[itemNameMatch]) || (col.items && col.items[item.article_name]) || 0;
                                       return (
                                          <td key={`cell-${idx}-${item.article_number}`} className={`px-2 py-1.5 border-r border-slate-100 text-center font-black ${qty > 0 ? 'text-emerald-600 bg-emerald-50/50' : 'text-slate-200'}`}>
                                             {qty > 0 ? qty : '-'}
                                          </td>
                                       );
                                    })}
                                    {salesColumns.length === 0 && <td></td>}

                                    {/* STICKY RIGHT TOTAL CELL */}
                                    {salesColumns.length > 0 && (
                                       <td className="px-3 py-1.5 border-l border-slate-200 text-center font-black text-lg text-[#6D2158] sticky right-0 bg-slate-50 z-10 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                                          {rowTotal > 0 ? rowTotal : '-'}
                                       </td>
                                    )}
                                 </tr>
                               );
                            })}
                         </React.Fragment>
                      );
                   })}
                </tbody>
             </table>
          </div>
      )}
    </div>
  );
}
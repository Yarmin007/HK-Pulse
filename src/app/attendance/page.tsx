"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, FileSpreadsheet, Loader2, UserCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- CONSTANTS & CONFIG ---
const YEAR = 2026;

const MONTHS = [
  { name: "January", days: 31 }, { name: "February", days: 28 },
  { name: "March", days: 31 }, { name: "April", days: 30 },
  { name: "May", days: 31 }, { name: "June", days: 30 },
  { name: "July", days: 31 }, { name: "August", days: 31 },
  { name: "September", days: 30 }, { name: "October", days: 31 },
  { name: "November", days: 30 }, { name: "December", days: 31 },
];

// Define frozen columns with exact widths to calculate sticky positions
const FROZEN_COLS = [
  { id: 'no', label: 'No.', width: 35, bg: 'bg-slate-100 text-slate-500' },
  { id: 'join', label: 'Join Date', width: 70, bg: 'bg-white text-slate-500 font-mono' },
  { id: 'name', label: 'Host Name', width: 140, bg: 'bg-white text-slate-800' },
  { id: 'hostNo', label: 'Host No.', width: 60, bg: 'bg-slate-50 text-slate-600 font-mono' },
  { id: 'desig', label: 'Designation', width: 110, bg: 'bg-white text-slate-500' },
  { id: 'off', label: 'OFF', width: 40, bg: 'bg-blue-50 text-blue-700' },
  { id: 'ph', label: 'PH', width: 40, bg: 'bg-emerald-50 text-emerald-700' },
  { id: 'vac', label: 'VAC', width: 40, bg: 'bg-amber-50 text-amber-700' },
  { id: 'rr', label: 'RR', width: 40, bg: 'bg-purple-50 text-purple-700' },
  { id: 'total', label: 'Total', width: 50, bg: 'bg-slate-200 text-[#6D2158]' },
];

export default function AttendancePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [hosts, setHosts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Calculate the exact left offset for each frozen column
  const frozenColumns = useMemo(() => {
    let currentLeft = 0;
    return FROZEN_COLS.map((col, index) => {
      const left = currentLeft;
      currentLeft += col.width;
      const isLast = index === FROZEN_COLS.length - 1;
      return { ...col, left, isLast };
    });
  }, []);

  const totalFrozenWidth = frozenColumns[frozenColumns.length - 1].left + frozenColumns[frozenColumns.length - 1].width;

  // 2. Generate 365 Days
  const { monthsData, allDays } = useMemo(() => {
    const mData = [];
    const aDays = [];
    for (let m = 0; m < 12; m++) {
        const monthName = MONTHS[m].name.substring(0, 3).toUpperCase();
        const daysInMonth = MONTHS[m].days;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(YEAR, m, d);
            const dayOfWeek = dateObj.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6; // Sun = 0, Sat = 6
            const dayData = { day: d, dayOfWeek, isWeekend, month: m };
            aDays.push(dayData);
        }
        mData.push({ name: monthName, days: daysInMonth });
    }
    return { monthsData: mData, allDays: aDays };
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('hsk_hosts').select('*').order('full_name');
    
    if (data) {
        const mappedHosts = data.map((h, i) => ({
            id: h.id,
            no: i + 1,
            join: '01/01/2025', 
            name: h.full_name,
            hostNo: h.host_id,
            desig: h.role,
            off: Math.floor(Math.random() * 5),
            ph: Math.floor(Math.random() * 3),
            vac: Math.floor(Math.random() * 14),
            rr: 0,
        })).map(h => ({
            ...h,
            total: h.off + h.ph + h.vac + h.rr
        }));
        setHosts(mappedHosts);
    }
    setIsLoading(false);
  };

  const filteredHosts = hosts.filter(h => 
      h.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      h.hostNo.includes(searchQuery)
  );

  return (
    // 'absolute inset-0' kills the page scrolling and forces the app to fit the screen exactly
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-[#FDFBFD] font-sans text-slate-800 overflow-hidden">
      
      {/* COMPACT HEADER (No scrolling here) */}
      <div className="flex-none flex flex-col md:flex-row justify-between items-center bg-white border-b border-slate-200 px-4 py-3 z-10 shadow-sm gap-3">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-blue-50 p-2 rounded-lg text-blue-600 shadow-inner hidden md:block">
             <UserCheck size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#6D2158] uppercase tracking-tight">Master Roster {YEAR}</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Attendance & Leave Balances
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-2 text-slate-400" size={14}/>
                <input 
                    type="text" 
                    placeholder="Search Staff..." 
                    className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg font-bold text-xs bg-slate-50 focus:bg-white focus:border-[#6D2158] outline-none transition-all shadow-inner"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>
            <button className="bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm hover:bg-slate-50 transition-all">
                <Filter size={12}/> Filter
            </button>
            <button className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md hover:bg-emerald-700 transition-all">
                <FileSpreadsheet size={12}/> Export
            </button>
        </div>
      </div>

      {/* SPREADSHEET AREA */}
      <div className="flex-1 p-3 md:p-4 flex flex-col relative overflow-hidden bg-slate-100">
          <div className="bg-white rounded-xl shadow-md border border-slate-300 flex-1 overflow-hidden flex flex-col relative">
              {isLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                      <Loader2 size={32} className="animate-spin text-[#6D2158] mb-4"/>
                      <span className="font-bold tracking-widest uppercase text-xs">Loading Roster...</span>
                  </div>
              ) : (
                  // The actual scrolling container
                  <div className="overflow-auto flex-1 custom-scrollbar w-full relative">
                      {/* border-separate border-spacing-0 prevents borders from disappearing on sticky cells */}
                      <table className="w-max border-separate border-spacing-0 text-[10px] whitespace-nowrap bg-white">
                          
                          {/* --- THEAD (Sticky Top) --- */}
                          <thead className="sticky top-0 z-40 bg-white">
                              
                              {/* ROW 1: Super Headers (Months) */}
                              <tr>
                                  <th colSpan={5} className="sticky left-0 z-50 bg-slate-100 border-b border-r border-slate-300 p-1.5 text-center text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                      Host Information
                                  </th>
                                  <th colSpan={5} className="sticky z-50 bg-slate-100 border-b border-r-2 border-slate-300 p-1.5 text-center text-[10px] font-black uppercase text-blue-800 tracking-widest shadow-[2px_0_5px_rgba(0,0,0,0.05)]" style={{ left: frozenColumns[5].left }}>
                                      Leave Balance
                                  </th>
                                  {monthsData.map((month, idx) => (
                                      <th key={idx} colSpan={month.days} className="border-b border-r border-slate-300 p-1.5 text-center text-[11px] font-black uppercase text-[#6D2158] tracking-widest bg-white">
                                          {month.name} {YEAR}
                                      </th>
                                  ))}
                              </tr>

                              {/* ROW 2: Frozen Headers + Days of Week */}
                              <tr>
                                  {/* Frozen Column Headers (Span down to row 3) */}
                                  {frozenColumns.map(col => (
                                      <th 
                                        key={col.id} 
                                        rowSpan={2}
                                        className={`sticky z-50 p-2 text-[9px] uppercase tracking-wider font-black text-center align-middle border-b-2 border-slate-300 ${col.isLast ? 'border-r-2 shadow-[2px_0_5px_rgba(0,0,0,0.05)]' : 'border-r'} ${col.bg}`}
                                        style={{ left: col.left, minWidth: col.width, maxWidth: col.width }}
                                      >
                                          {col.label}
                                      </th>
                                  ))}

                                  {/* Scrollable Day of Week */}
                                  {allDays.map((d, idx) => (
                                      <th 
                                        key={`dow-${idx}`} 
                                        className={`p-1 text-center border-b border-r border-slate-200 w-[28px] min-w-[28px] max-w-[28px] text-[8px] font-bold ${d.isWeekend ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400'}`}
                                      >
                                          {d.dayOfWeek}
                                      </th>
                                  ))}
                              </tr>

                              {/* ROW 3: Date Numbers */}
                              <tr>
                                  {/* Note: Frozen columns are handled by rowSpan=2 above, so this row ONLY contains the dates */}
                                  {allDays.map((d, idx) => (
                                      <th 
                                        key={`date-${idx}`} 
                                        className={`p-1 text-center border-b-2 border-r border-slate-300 w-[28px] min-w-[28px] max-w-[28px] text-[10px] font-black ${d.isWeekend ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-700'}`}
                                      >
                                          {d.day}
                                      </th>
                                  ))}
                              </tr>
                          </thead>

                          {/* --- TBODY --- */}
                          <tbody className="font-medium">
                              {filteredHosts.map((host, rowIndex) => (
                                  <tr key={host.id} className="group hover:bg-blue-50/50 transition-colors">
                                      
                                      {/* Frozen Data Cells */}
                                      {frozenColumns.map((col, colIndex) => {
                                          let cellContent = host[col.id];
                                          let isBold = colIndex >= 5; // Make leave balances bolder
                                          
                                          return (
                                              <td 
                                                key={`${host.id}-${col.id}`}
                                                className={`sticky z-30 p-2 text-center border-b border-slate-200 group-hover:bg-blue-50/80 transition-colors ${col.isLast ? 'border-r-2 border-slate-300 shadow-[2px_0_5px_rgba(0,0,0,0.05)]' : 'border-r border-slate-200'} ${col.bg} ${isBold ? 'font-black' : ''} ${col.id === 'name' ? 'text-left truncate text-xs font-bold' : ''}`}
                                                style={{ left: col.left, width: col.width, maxWidth: col.width }}
                                                title={col.id === 'name' || col.id === 'desig' ? cellContent : undefined}
                                              >
                                                  {cellContent}
                                              </td>
                                          );
                                      })}

                                      {/* Scrollable Day Cells (Grid) */}
                                      {allDays.map((d, idx) => (
                                          <td 
                                            key={`cell-${host.id}-${idx}`} 
                                            className={`p-0 border-b border-r border-slate-200 text-center cursor-pointer transition-colors hover:bg-blue-100 ${d.isWeekend ? 'bg-rose-50/30' : 'bg-white'}`}
                                          >
                                              <div className="w-full h-8 flex items-center justify-center font-bold text-slate-700 hover:text-blue-700">
                                                  {/* Future Logic: Display 'P', 'OFF', 'PH' here based on database */}
                                              </div>
                                          </td>
                                      ))}
                                  </tr>
                              ))}
                              
                              {filteredHosts.length === 0 && (
                                  <tr>
                                      {/* We just need one cell to span the entire frozen width so it doesn't look broken */}
                                      <td colSpan={FROZEN_COLS.length} className="sticky left-0 z-30 p-10 text-center text-slate-400 italic font-bold bg-white border-b border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)]" style={{ width: totalFrozenWidth, minWidth: totalFrozenWidth, maxWidth: totalFrozenWidth }}>
                                          No staff found matching search.
                                      </td>
                                      <td colSpan={allDays.length} className="p-10 bg-white border-b border-slate-200"></td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      </div>

    </div>
  );
}
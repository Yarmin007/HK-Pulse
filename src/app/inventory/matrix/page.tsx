"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Calendar, Search, Loader2, Shield, 
  CheckCircle2, Clock, AlertCircle, FileSpreadsheet, Image as ImageIcon
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

type MasterItem = { article_number: string; article_name: string; category: string; image_url?: string; };
type Assignment = { id: string; villa_number: string; host_id: string; host_name?: string; status: string; };
type CountRecord = { villa_number: string; article_number: string; counted_qty: number; };

export default function InventoryMatrix() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);

  // Time & Schedules
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [monthSchedules, setMonthSchedules] = useState<any[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');

  // Matrix Data
  const [items, setItems] = useState<MasterItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [records, setRecords] = useState<CountRecord[]>([]);
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => {
    const session = localStorage.getItem('hk_pulse_session');
    const adminFlag = localStorage.getItem('hk_pulse_admin_auth') === 'true' || (session && JSON.parse(session).system_role === 'admin');
    setIsAdmin(!!adminFlag);
    
    if (adminFlag) {
        fetchSchedulesForMonth();
    } else {
        setIsLoading(false);
    }
  }, [selectedMonth]);

  const fetchSchedulesForMonth = async () => {
      setIsLoading(true);
      const { data, error } = await supabase.from('hsk_inventory_schedules')
          .select('*')
          .eq('month_year', selectedMonth)
          .order('created_at', { ascending: false });

      if (data && data.length > 0) {
          setMonthSchedules(data);
          setSelectedScheduleId(data[0].id); // Auto-select first schedule
      } else {
          setMonthSchedules([]);
          setSelectedScheduleId('');
          setItems([]);
          setAssignments([]);
          setRecords([]);
      }
      setIsLoading(false);
  };

  useEffect(() => {
      if (selectedScheduleId) loadMatrixData(selectedScheduleId);
  }, [selectedScheduleId]);

  const loadMatrixData = async (scheduleId: string) => {
      setIsFetchingData(true);
      
      const targetSchedule = monthSchedules.find(s => s.id === scheduleId);
      if (!targetSchedule) return;

      // 1. Fetch Items
      const { data: catData } = await supabase.from('hsk_master_catalog')
          .select('article_number, article_name, category, image_url')
          .eq('inventory_type', targetSchedule.inventory_type)
          .order('article_name');
      setItems(catData || []);

      // 2. Fetch Assignments & Hosts safely
      const { data: assignData } = await supabase.from('hsk_inventory_assignments')
          .select('id, villa_number, host_id, status')
          .eq('schedule_id', scheduleId);
          
      const { data: hostsData } = await supabase.from('hsk_hosts').select('host_id, full_name');
      
      const mappedAssigns = (assignData || []).map((a: any) => {
          const host = hostsData?.find(h => h.host_id === a.host_id);
          return {
              ...a,
              host_name: host ? host.full_name : a.host_id
          };
      });
      setAssignments(mappedAssigns);

      // 3. Fetch Records (BYPASS 1000 ROW LIMIT - INFINITE LOOP FETCHER)
      let allRecords: CountRecord[] = [];
      let hasMore = true;
      let from = 0;
      const step = 1000;

      while (hasMore) {
          const { data, error } = await supabase.from('hsk_inventory_records')
              .select('villa_number, article_number, counted_qty')
              .eq('schedule_id', scheduleId)
              .range(from, from + step - 1);
          
          if (error) {
              console.error("Error fetching records:", error);
              break;
          }
          
          if (data && data.length > 0) {
              allRecords.push(...data);
              from += step;
              if (data.length < step) hasMore = false;
          } else {
              hasMore = false;
          }
      }
      setRecords(allRecords);

      // Realtime Listener
      const channel = supabase.channel(`matrix_${scheduleId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_inventory_records', filter: `schedule_id=eq.${scheduleId}` }, (payload) => {
              if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                  setRecords(prev => {
                      const newRec = payload.new as CountRecord;
                      const filtered = prev.filter(r => !(r.villa_number === newRec.villa_number && r.article_number === newRec.article_number));
                      return [...filtered, newRec];
                  });
              }
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hsk_inventory_assignments', filter: `schedule_id=eq.${scheduleId}` }, (payload) => {
              setAssignments(prev => prev.map(a => a.id === payload.new.id ? { ...a, status: payload.new.status } : a));
          })
          .subscribe();

      setIsFetchingData(false);
      return () => { supabase.removeChannel(channel); };
  };

  // --- DATA AGGREGATION ---
  
  // 1. Unique Locations (Merges multiple pantries into ONE column)
  const uniqueLocations = useMemo(() => {
      const locs = Array.from(new Set(assignments.map(a => a.villa_number)));
      return locs.sort((a, b) => {
          const numA = parseInt(a);
          const numB = parseInt(b);
          const isNumA = !isNaN(numA);
          const isNumB = !isNaN(numB);

          // Numbers first, strings (Pantries) last
          if (isNumA && isNumB) return numA - numB;
          if (isNumA && !isNumB) return -1;
          if (!isNumA && isNumB) return 1;
          return a.localeCompare(b);
      });
  }, [assignments]);

  // 2. Fast Lookup Map for Data (Sums up quantities if multiple people counted the same location)
  const recordsMap = useMemo(() => {
      const map: Record<string, number> = {};
      records.forEach(r => { 
          const key = `${r.article_number}_${r.villa_number}`;
          map[key] = (map[key] || 0) + (r.counted_qty || 0); 
      });
      return map;
  }, [records]);

  // Helper to get status of a merged location
  const getLocStatus = (loc: string) => {
      const assigns = assignments.filter(a => a.villa_number === loc);
      if (assigns.length === 0) return 'Pending';
      if (assigns.every(a => a.status === 'Submitted')) return 'Submitted';
      if (assigns.some(a => a.status === 'Submitted' || a.status === 'In Progress')) return 'In Progress';
      return 'Pending';
  };

  // Helper to get assigned names for a tooltip
  const getLocAssignees = (loc: string) => {
      return assignments.filter(a => a.villa_number === loc).map(a => a.host_name).join(', ');
  };

  const filteredItems = items.filter(i => 
      i.article_name.toLowerCase().includes(itemSearch.toLowerCase()) || 
      i.category.toLowerCase().includes(itemSearch.toLowerCase()) ||
      i.article_number.includes(itemSearch)
  );

  // --- EXCEL EXPORT ---
  const downloadExcel = () => {
      if (items.length === 0 || uniqueLocations.length === 0) return toast.error("No data to export");
      const activeSchedObj = monthSchedules.find(s => s.id === selectedScheduleId);

      const headerRow1 = ['Item Picture', 'Article Code', 'Article Name', 'Category', 'Total Count'];
      const headerRow2 = ['', '', '', '', '']; 
      
      uniqueLocations.forEach(loc => {
          headerRow1.push(loc);
          headerRow2.push(getLocStatus(loc));
      });

      const excelData = [headerRow1, headerRow2];

      items.forEach(item => {
          const total = uniqueLocations.reduce((sum, loc) => sum + (recordsMap[`${item.article_number}_${loc}`] || 0), 0);
          
          const rowData: any[] = [
              item.image_url ? 'Yes' : 'No', 
              item.article_number,
              item.article_name,
              item.category,
              total
          ];

          uniqueLocations.forEach(loc => {
              const val = recordsMap[`${item.article_number}_${loc}`];
              const status = getLocStatus(loc);
              if (val !== undefined && val > 0) {
                  rowData.push(val);
              } else if (status === 'Submitted') {
                  rowData.push(0); 
              } else {
                  rowData.push(''); 
              }
          });

          excelData.push(rowData);
      });

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 35 }, { wch: 20 }, { wch: 12 }]; 
      for (let i = 0; i < uniqueLocations.length; i++) ws['!cols'].push({ wch: 10 });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Matrix");
      XLSX.writeFile(wb, `Inventory_${activeSchedObj?.inventory_type || 'Report'}_${selectedMonth}.xlsx`);
      
      toast.success("Excel Downloaded!");
  };

  if (isLoading) return <div className="flex-1 flex items-center justify-center h-screen bg-[#FDFBFD]"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

  if (!isAdmin) return (
      <div className="flex flex-col items-center justify-center h-screen text-center p-8 bg-[#FDFBFD]">
          <div className="w-24 h-24 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6"><Shield size={40} /></div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Access Restricted</h2>
      </div>
  );

  return (
    // STRICT VIEWPORT LOCK: The page body will never scroll globally.
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-[#FDFBFD] font-sans text-slate-800 overflow-hidden">
      
      {/* 1. Header (Fixed) */}
      <div className="shrink-0">
          <PageHeader 
              title="Live Inventory Matrix" 
              date={parseISO(selectedMonth + '-01')} 
              onDateChange={(newDate) => setSelectedMonth(format(newDate, 'yyyy-MM'))} 
          />
      </div>

      {/* 2. Controls (Fixed) */}
      <div className="shrink-0 px-4 md:px-8 mt-4 w-full">
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
              <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mr-2">Active Counts:</span>
                  {monthSchedules.length === 0 && <span className="text-sm font-bold text-slate-400 italic">No schedules active.</span>}
                  
                  {monthSchedules.map(sched => (
                      <button 
                          key={sched.id}
                          onClick={() => setSelectedScheduleId(sched.id)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                              selectedScheduleId === sched.id 
                                  ? 'bg-[#6D2158] text-white border-[#6D2158] shadow-md' 
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                      >
                          {sched.inventory_type}
                      </button>
                  ))}
                  {isFetchingData && <Loader2 size={16} className="animate-spin text-[#6D2158] ml-2 shrink-0"/>}
              </div>

              <div className="flex items-center gap-3 w-full lg:w-auto">
                  <div className="relative w-full lg:w-64">
                      <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                      <input 
                        type="text" 
                        placeholder="Search Item..." 
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-xs font-bold outline-none focus:border-[#6D2158] transition-colors" 
                        value={itemSearch} 
                        onChange={e => setItemSearch(e.target.value)} 
                      />
                  </div>
                  <button onClick={downloadExcel} disabled={!selectedScheduleId || items.length === 0} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 whitespace-nowrap shrink-0">
                      <FileSpreadsheet size={16}/> Export
                  </button>
              </div>
          </div>
      </div>

      {/* 3. Matrix Table Area (Flexible Height, ONLY this scrolls) */}
      <div className="flex-1 min-h-0 w-full px-4 md:px-8 py-4 flex flex-col pb-24 md:pb-6">
          
          {monthSchedules.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-white">
                  <AlertCircle size={48} className="text-slate-300 mb-4"/>
                  <h3 className="font-black text-xl text-slate-700 mb-2">No Schedules Found</h3>
                  <p className="text-slate-500 font-bold text-sm max-w-md">There are no inventory counts initialized for {format(parseISO(selectedMonth + '-01'), 'MMMM yyyy')}. Go to Setup to create one.</p>
              </div>
          ) : items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-white">
                  <Box size={48} className="text-amber-300 mb-4"/>
                  <h3 className="font-black text-xl text-slate-700 mb-2">No Items Found</h3>
                  <p className="text-slate-500 font-bold text-sm max-w-md">There are no items linked to this specific inventory type in the Master Catalog.</p>
              </div>
          ) : (
              
              <div className="h-full w-full bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
                  
                  {/* Inner Status Bar */}
                  <div className="shrink-0 px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                      <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest">
                          <span className="text-slate-500 bg-white px-3 py-1 rounded shadow-sm border border-slate-200">Catalog: {items.length} Items</span>
                          <span className="text-emerald-600 bg-emerald-50 px-3 py-1 rounded shadow-sm border border-emerald-100">Locations: {uniqueLocations.length}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Live Sync
                      </div>
                  </div>

                  {/* STRICT SCROLLING WRAPPER FOR TABLE */}
                  <div className="flex-1 overflow-auto bg-slate-50 custom-scrollbar relative">
                      <table className="border-collapse text-left bg-white w-max min-w-full table-fixed" style={{ borderSpacing: 0 }}>
                          <thead>
                              <tr>
                                  {/* FROZEN HEADER 1: Item Name */}
                                  <th className="sticky top-0 left-0 z-[60] bg-slate-100 border-b-2 border-r-2 border-slate-300 p-4 w-[280px] min-w-[280px] max-w-[280px] shadow-[4px_0_10px_rgba(0,0,0,0.05)] align-bottom box-border">
                                      <div className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Inventory Item</div>
                                  </th>
                                  
                                  {/* FROZEN HEADER 2: Total */}
                                  <th className="sticky top-0 left-[280px] z-[60] bg-slate-800 text-white border-b-2 border-r-2 border-slate-900 p-4 w-[100px] min-w-[100px] max-w-[100px] text-center shadow-[4px_0_10px_rgba(0,0,0,0.05)] align-bottom box-border">
                                      <div className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Total</div>
                                  </th>
                                  
                                  {/* SCROLLING HEADERS: Locations */}
                                  {uniqueLocations.map(loc => {
                                      const status = getLocStatus(loc);
                                      const assignees = getLocAssignees(loc);
                                      
                                      return (
                                          <th key={loc} className="sticky top-0 z-[50] bg-slate-50 border-b-2 border-r border-slate-200 p-4 w-[100px] min-w-[100px] max-w-[100px] align-bottom hover:bg-slate-100 transition-colors cursor-default box-border" title={`Assigned to: ${assignees || 'Nobody'}`}>
                                              <div className="flex flex-col items-center justify-end h-full w-full">
                                                  <div className="font-black text-base text-[#6D2158] leading-none mb-2 text-center whitespace-normal break-words">{loc}</div>
                                                  <div className="flex flex-col items-center gap-1">
                                                      {status === 'Submitted' ? <CheckCircle2 size={16} className="text-emerald-500"/> : status === 'In Progress' ? <Clock size={16} className="text-amber-500"/> : <div className="w-3 h-3 rounded-full bg-slate-300"/>}
                                                  </div>
                                              </div>
                                          </th>
                                      );
                                  })}
                              </tr>
                          </thead>
                          
                          <tbody className="divide-y divide-slate-100">
                              {filteredItems.map(item => {
                                  const rowTotal = uniqueLocations.reduce((sum, loc) => sum + (recordsMap[`${item.article_number}_${loc}`] || 0), 0);

                                  return (
                                      <tr key={item.article_number} className="hover:bg-blue-50/40 transition-colors group">
                                          
                                          {/* FROZEN CELL 1: Item Name */}
                                          <td className="sticky left-0 z-[40] bg-white group-hover:bg-blue-50 border-r-2 border-slate-200 p-3 w-[280px] min-w-[280px] max-w-[280px] shadow-[4px_0_10px_rgba(0,0,0,0.03)] transition-colors box-border">
                                              <div className="flex items-center gap-3 w-full">
                                                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                                                      {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="text-slate-300"/>}
                                                  </div>
                                                  <div className="min-w-0 pr-2">
                                                      <div className="font-black text-sm text-slate-800 leading-tight truncate" title={item.article_name}>{item.article_name}</div>
                                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate mt-0.5">{item.category}</div>
                                                  </div>
                                              </div>
                                          </td>

                                          {/* FROZEN CELL 2: Total */}
                                          <td className="sticky left-[280px] z-[40] bg-slate-50 group-hover:bg-blue-100/50 border-r-2 border-slate-200 p-3 w-[100px] min-w-[100px] max-w-[100px] text-center shadow-[4px_0_10px_rgba(0,0,0,0.03)] transition-colors box-border">
                                              <span className="font-black text-xl text-slate-700">{rowTotal > 0 ? rowTotal : '-'}</span>
                                          </td>

                                          {/* SCROLLING CELLS: Villa Counts */}
                                          {uniqueLocations.map(loc => {
                                              const val = recordsMap[`${item.article_number}_${loc}`];
                                              const hasValue = val !== undefined && val > 0;
                                              const isSubmitted = getLocStatus(loc) === 'Submitted';

                                              // IF SUBMITTED BUT NO VALUE = EXPLICIT ZERO
                                              // IF NOT SUBMITTED AND NO VALUE = PENDING (-)
                                              const displayValue = hasValue ? val : (isSubmitted ? '0' : '-');

                                              return (
                                                  <td key={`${item.article_number}_${loc}`} className={`z-[10] p-4 text-center font-black border-r border-slate-100 w-[100px] min-w-[100px] max-w-[100px] text-lg transition-colors box-border ${hasValue ? 'text-slate-800 bg-emerald-50/50' : (isSubmitted ? 'text-slate-400 bg-slate-50/80' : 'text-slate-200 bg-transparent')}`}>
                                                      {displayValue}
                                                  </td>
                                              );
                                          })}
                                      </tr>
                                  );
                              })}
                              
                              {/* Empty State */}
                              {filteredItems.length === 0 && (
                                  <tr>
                                      <td colSpan={uniqueLocations.length + 2} className="p-12 text-center text-slate-400 font-bold text-sm bg-white">
                                          No items match your search.
                                      </td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>

              </div>
          )}
      </div>
    </div>
  );
}
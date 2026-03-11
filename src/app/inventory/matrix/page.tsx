"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Calendar, Search, Loader2, Shield, 
  CheckCircle2, Clock, AlertCircle, FileSpreadsheet, Image as ImageIcon
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, parseISO } from 'date-fns';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

type MasterItem = { article_number: string; article_name: string; category: string; image_url?: string; };
type Assignment = { id: string; villa_number: string; host_id: string; status: string; };
type CountRecord = { villa_number: string; article_number: string; counted_qty: number; };

export default function InventoryMatrix() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
  const [selectedType, setSelectedType] = useState('');
  const [invTypes, setInvTypes] = useState<any[]>([]);
  const [itemSearch, setItemSearch] = useState('');

  // Matrix Data
  const [activeSchedule, setActiveSchedule] = useState<any | null>(null);
  const [items, setItems] = useState<MasterItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [records, setRecords] = useState<CountRecord[]>([]);

  useEffect(() => {
    const session = localStorage.getItem('hk_pulse_session');
    const adminFlag = localStorage.getItem('hk_pulse_admin_auth') === 'true' || (session && JSON.parse(session).system_role === 'admin');
    setIsAdmin(!!adminFlag);
    
    if (adminFlag) {
        fetchTypes();
    } else {
        setIsLoading(false);
    }
  }, []);

  const fetchTypes = async () => {
      const { data } = await supabase.from('hsk_constants').select('*').eq('type', 'inv_type').order('label');
      if (data) {
          setInvTypes(data);
          if (data.length > 0) setSelectedType(data[0].label);
      }
      setIsLoading(false);
  };

  useEffect(() => {
      if (selectedMonth && selectedType) loadMatrixData();
  }, [selectedMonth, selectedType]);

  const loadMatrixData = async () => {
      setIsFetchingData(true);
      
      const { data: schedule } = await supabase.from('hsk_inventory_schedules')
          .select('*').eq('month_year', selectedMonth).eq('inventory_type', selectedType).maybeSingle();
      
      setActiveSchedule(schedule);

      if (schedule) {
          const { data: catData } = await supabase.from('hsk_master_catalog')
              .select('article_number, article_name, category, image_url')
              .eq('inventory_type', selectedType)
              .order('article_name');
          setItems(catData || []);

          const { data: assignData } = await supabase.from('hsk_inventory_assignments')
              .select('id, villa_number, host_id, status')
              .eq('schedule_id', schedule.id)
              .order('villa_number');
          
          // Sort numeric villas properly
          const sortedAssigns = (assignData || []).sort((a, b) => {
              const numA = parseInt(a.villa_number) || 9999;
              const numB = parseInt(b.villa_number) || 9999;
              return numA - numB;
          });
          setAssignments(sortedAssigns);

          const { data: recData } = await supabase.from('hsk_inventory_records')
              .select('villa_number, article_number, counted_qty')
              .eq('schedule_id', schedule.id);
          setRecords(recData || []);

          // Super-Optimized Realtime Listener
          const channel = supabase.channel(`matrix_${schedule.id}`)
              .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_inventory_records', filter: `schedule_id=eq.${schedule.id}` }, (payload) => {
                  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                      setRecords(prev => {
                          const newRec = payload.new as CountRecord;
                          const filtered = prev.filter(r => !(r.villa_number === newRec.villa_number && r.article_number === newRec.article_number));
                          return [...filtered, newRec];
                      });
                  }
              })
              .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hsk_inventory_assignments', filter: `schedule_id=eq.${schedule.id}` }, (payload) => {
                  setAssignments(prev => prev.map(a => a.id === payload.new.id ? { ...a, status: payload.new.status } : a));
              })
              .subscribe();

          setIsFetchingData(false);
          return () => { supabase.removeChannel(channel); };
      } else {
          setItems([]);
          setAssignments([]);
          setRecords([]);
          setIsFetchingData(false);
      }
  };

  const recordsMap = useMemo(() => {
      const map: Record<string, number> = {};
      records.forEach(r => { map[`${r.article_number}_${r.villa_number}`] = r.counted_qty; });
      return map;
  }, [records]);

  const filteredItems = items.filter(i => 
      i.article_name.toLowerCase().includes(itemSearch.toLowerCase()) || 
      i.category.toLowerCase().includes(itemSearch.toLowerCase())
  );

  // --- PRO EXCEL EXPORT (XLSX) ---
  const downloadExcel = () => {
      if (items.length === 0 || assignments.length === 0) return toast.error("No data to export");

      // 1. Build Header Rows
      const headerRow1 = ['Item Picture', 'Article Name', 'Category', 'Total Count'];
      const headerRow2 = ['', '', '', '']; // Status Row
      
      assignments.forEach(loc => {
          headerRow1.push(loc.villa_number);
          headerRow2.push(loc.status);
      });

      const excelData = [headerRow1, headerRow2];

      // 2. Build Data Rows (Items)
      items.forEach(item => {
          const total = assignments.reduce((sum, loc) => sum + (recordsMap[`${item.article_number}_${loc.villa_number}`] || 0), 0);
          
          const rowData: any[] = [
              item.image_url ? 'Yes' : 'No', // Picture placeholder
              item.article_name,
              item.category,
              total
          ];

          assignments.forEach(loc => {
              const val = recordsMap[`${item.article_number}_${loc.villa_number}`];
              rowData.push(val !== undefined ? val : 0);
          });

          excelData.push(rowData);
      });

      // 3. Create Workbook
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
      // Styling & Formatting
      ws['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 20 }, { wch: 12 }]; // Set widths for first 4 columns
      for (let i = 0; i < assignments.length; i++) ws['!cols'].push({ wch: 8 }); // Tighten villa columns

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory Matrix");
      XLSX.writeFile(wb, `Inventory_${selectedType}_${selectedMonth}.xlsx`);
      
      toast.success("Excel Downloaded!");
  };

  if (isLoading) return <div className="flex-1 flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

  if (!isAdmin) return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center p-8">
          <div className="w-24 h-24 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6"><Shield size={40} /></div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Access Restricted</h2>
      </div>
  );

  return (
    // STRICT LOCK: max-w-[100vw] and overflow-hidden prevent the entire page from scrolling sideways!
    <div className="flex flex-col h-[100dvh] md:h-screen w-full max-w-[100vw] bg-slate-50 font-sans text-slate-800 overflow-hidden pb-[80px] md:pb-0">
      
      <div className="shrink-0">
          <PageHeader title="Live Inventory Matrix" date={new Date()} onDateChange={() => {}} />
      </div>

      {/* MAIN WRAPPER: min-w-0 prevents it from stretching past screen width */}
      <div className="flex-1 flex flex-col px-4 md:px-8 mt-4 max-w-[1800px] mx-auto w-full min-w-0 min-h-0 pb-4 overflow-hidden">
          
          {/* RESPONSIVE CONTROL BAR (Scrolls internally if it gets too small) */}
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center shrink-0 mb-4 z-20 w-full overflow-x-auto no-scrollbar">
              
              <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto shrink-0">
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 flex-1 sm:flex-none">
                      <Calendar size={16} className="text-slate-400 ml-2 shrink-0"/>
                      <input type="month" className="bg-transparent font-black text-sm outline-none text-slate-700 w-full" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 flex-1 sm:flex-none">
                      <Box size={16} className="text-slate-400 ml-2 shrink-0"/>
                      <select className="bg-transparent font-black text-sm outline-none text-slate-700 pr-2 w-full truncate" value={selectedType} onChange={e=>setSelectedType(e.target.value)}>
                          <option value="" disabled>Select Type...</option>
                          {invTypes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                      </select>
                  </div>
                  {isFetchingData && <Loader2 size={16} className="animate-spin text-[#6D2158] ml-2 shrink-0"/>}
              </div>

              <div className="flex items-center gap-3 w-full xl:w-auto shrink-0">
                  <div className="relative w-full xl:w-64 flex-1">
                      <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                      <input type="text" placeholder="Search Item..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-xs font-bold outline-none focus:border-[#6D2158] transition-colors" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
                  </div>
                  <button onClick={downloadExcel} disabled={!activeSchedule || items.length === 0} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-emerald-600/20 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap shrink-0">
                      <FileSpreadsheet size={16}/> Export Excel
                  </button>
              </div>
          </div>

          {/* EMPTY STATES */}
          {!activeSchedule ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50 mx-4 min-h-0">
                  <AlertCircle size={48} className="text-slate-300 mb-4"/>
                  <h3 className="font-black text-xl text-slate-700 mb-2">No Schedule Found</h3>
                  <p className="text-slate-500 font-bold text-sm max-w-md">There is no inventory count initialized for {selectedType} in {format(parseISO(selectedMonth + '-01'), 'MMMM yyyy')}. Go to Setup to create it.</p>
              </div>
          ) : items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50 mx-4 min-h-0">
                  <Box size={48} className="text-amber-300 mb-4"/>
                  <h3 className="font-black text-xl text-slate-700 mb-2">No Items Linked</h3>
                  <p className="text-slate-500 font-bold text-sm max-w-md">You have not linked any items from the Master Catalog to "{selectedType}". Go to Setup to link items.</p>
              </div>
          ) : (
              <>
                  {/* --- DESKTOP MATRIX VIEW --- */}
                  {/* min-w-0 ensures it doesn't push the screen bounds */}
                  <div className="hidden md:flex flex-1 bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden flex-col relative z-0 min-h-0 min-w-0 w-full">
                      
                      {/* Status Bar (Pinned) */}
                      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0 w-full">
                          <div className="flex gap-6 text-[10px] font-black uppercase tracking-widest">
                              <span className="text-slate-500 bg-white px-3 py-1 rounded shadow-sm border border-slate-200">Items: {items.length}</span>
                              <span className="text-emerald-600 bg-emerald-50 px-3 py-1 rounded shadow-sm border border-emerald-100">Completed: {assignments.filter(a => a.status === 'Submitted').length} / {assignments.length}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Live Sync Active
                          </div>
                      </div>

                      {/* Scrollable Matrix (Strict bounds, this is the ONLY part that scrolls sideways) */}
                      <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50/30 relative w-full">
                          
                          {/* min-w-max prevents table from squishing itself, forcing the parent to scroll instead */}
                          <table className="text-left border-collapse min-w-max">
                              <thead className="sticky top-0 z-30 bg-white shadow-sm">
                                  <tr>
                                      <th className="p-4 border-b border-r border-slate-200 sticky left-0 z-40 bg-white w-[280px] min-w-[280px] max-w-[280px] shadow-[4px_0_10px_rgba(0,0,0,0.03)]">
                                          <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Inventory Item</div>
                                      </th>
                                      <th className="p-4 border-b border-r border-slate-200 sticky left-[280px] z-40 bg-slate-800 text-white w-[100px] min-w-[100px] max-w-[100px] shadow-[4px_0_10px_rgba(0,0,0,0.03)] text-center">
                                          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Grand Total</div>
                                      </th>
                                      {assignments.map(loc => (
                                          <th key={loc.id} className="p-0 border-b border-slate-200 w-[100px] min-w-[100px] max-w-[100px] align-bottom bg-slate-50">
                                              <div className="flex flex-col items-center justify-end h-full w-full p-3 group hover:bg-slate-100 transition-colors cursor-default" title={loc.host_id}>
                                                  <div className="font-black text-base text-[#6D2158] leading-none mb-2">{loc.villa_number}</div>
                                                  <div className="flex flex-col items-center gap-1">
                                                      {loc.status === 'Submitted' ? <CheckCircle2 size={16} className="text-emerald-500"/> : loc.status === 'In Progress' ? <Clock size={16} className="text-amber-500"/> : <div className="w-3 h-3 rounded-full bg-slate-300"/>}
                                                  </div>
                                              </div>
                                          </th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {filteredItems.map((item) => {
                                      const rowTotal = assignments.reduce((sum, loc) => sum + (recordsMap[`${item.article_number}_${loc.villa_number}`] || 0), 0);

                                      return (
                                          <tr key={item.article_number} className="hover:bg-blue-50/30 transition-colors group">
                                              
                                              {/* ITEM DETAILS (Sticky Left, Strict Width) */}
                                              <td className="p-3 border-r border-slate-100 sticky left-0 z-20 bg-white group-hover:bg-blue-50/50 shadow-[4px_0_10px_rgba(0,0,0,0.02)] transition-colors w-[280px] min-w-[280px] max-w-[280px]">
                                                  <div className="flex items-center gap-3 w-full">
                                                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                                                          {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={20} className="text-slate-300"/>}
                                                      </div>
                                                      <div className="min-w-0 pr-2 flex-1">
                                                          <div className="font-black text-sm text-slate-800 leading-tight truncate" title={item.article_name}>{item.article_name}</div>
                                                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate mt-1">{item.category}</div>
                                                      </div>
                                                  </div>
                                              </td>

                                              {/* GRAND TOTAL CELL (Sticky Left, Strict Width, calculates placement) */}
                                              <td className="p-3 border-r border-slate-200 sticky left-[280px] z-20 bg-slate-50 font-black text-xl text-center text-slate-700 shadow-[4px_0_10px_rgba(0,0,0,0.02)] w-[100px] min-w-[100px] max-w-[100px]">
                                                  {rowTotal > 0 ? rowTotal : '-'}
                                              </td>

                                              {/* VILLA CELLS (Strict Widths) */}
                                              {assignments.map(loc => {
                                                  const val = recordsMap[`${item.article_number}_${loc.villa_number}`];
                                                  const hasValue = val !== undefined && val > 0;
                                                  return (
                                                      <td key={`${item.article_number}_${loc.villa_number}`} className={`p-4 text-center font-black border-l border-slate-50 transition-colors w-[100px] min-w-[100px] max-w-[100px] ${hasValue ? 'text-slate-800 bg-emerald-50/40 text-lg' : 'text-slate-300 bg-transparent'}`}>
                                                          {hasValue ? val : ''}
                                                      </td>
                                                  );
                                              })}
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                          {filteredItems.length === 0 && (
                              <div className="p-12 text-center text-slate-400 font-bold text-sm absolute inset-0">No items found.</div>
                          )}
                      </div>
                  </div>

                  {/* --- MOBILE LIST VIEW --- */}
                  <div className="flex md:hidden flex-1 flex-col min-h-0 min-w-0 overflow-hidden w-full">
                      
                      {/* Mobile Status Bar (Pinned) */}
                      <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 shadow-sm flex justify-between items-center mb-3 shrink-0 mx-1">
                           <div>
                               <div className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-1">Status</div>
                               <div className="font-black text-emerald-800">{assignments.filter(a => a.status === 'Submitted').length} of {assignments.length} Completed</div>
                           </div>
                           <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-white px-3 py-1.5 rounded-full shadow-sm">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Live Sync
                           </div>
                      </div>

                      {/* Mobile Scrollable Item List */}
                      <div className="flex-1 overflow-y-auto pb-4 space-y-4 px-1 custom-scrollbar w-full">
                          {filteredItems.map(item => {
                              const rowTotal = assignments.reduce((sum, loc) => sum + (recordsMap[`${item.article_number}_${loc.villa_number}`] || 0), 0);
                              
                              return (
                                  <div key={item.article_number} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 w-full overflow-hidden">
                                      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                                          <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden border border-slate-200 shrink-0 shadow-inner">
                                              {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={20} className="text-slate-300"/>}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                              <div className="font-black text-sm text-slate-800 leading-tight">{item.article_name}</div>
                                              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.category}</div>
                                          </div>
                                          <div className="shrink-0 text-center bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                                              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total</div>
                                              <div className="font-black text-lg text-[#6D2158]">{rowTotal}</div>
                                          </div>
                                      </div>

                                      <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar w-full">
                                          {assignments.map(loc => {
                                              const val = recordsMap[`${item.article_number}_${loc.villa_number}`];
                                              const hasValue = val !== undefined && val > 0;
                                              if (!hasValue) return null; 
                                              
                                              return (
                                                  <div key={loc.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 shrink-0 min-w-[60px] text-center flex flex-col justify-center shadow-sm">
                                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{loc.villa_number}</span>
                                                      <span className="font-black text-base text-slate-700">{val}</span>
                                                  </div>
                                              );
                                          })}
                                          {rowTotal === 0 && <div className="text-xs text-slate-400 italic font-bold p-2">Not counted yet.</div>}
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              </>
          )}
      </div>
    </div>
  );
}
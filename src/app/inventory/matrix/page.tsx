"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Calendar, Search, Download, Loader2, Shield, 
  CheckCircle2, Clock, AlertCircle, FileSpreadsheet
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, parseISO } from 'date-fns';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';

type MasterItem = { article_number: string; article_name: string; category: string; };
type Assignment = { id: string; villa_number: string; host_id: string; status: string; };
// FIXED: Renamed from Record to CountRecord to prevent TypeScript conflicts
type CountRecord = { villa_number: string; article_number: string; counted_qty: number; };

export default function InventoryMatrix() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
  const [selectedType, setSelectedType] = useState('');
  const [invTypes, setInvTypes] = useState<any[]>([]);
  const [locationSearch, setLocationSearch] = useState('');

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
      
      // 1. Get Schedule
      const { data: schedule } = await supabase.from('hsk_inventory_schedules')
          .select('*').eq('month_year', selectedMonth).eq('inventory_type', selectedType).maybeSingle();
      
      setActiveSchedule(schedule);

      if (schedule) {
          // 2. Get Items linked to this type
          const { data: catData } = await supabase.from('hsk_master_catalog')
              .select('article_number, article_name, category')
              .eq('inventory_type', selectedType)
              .order('article_name');
          setItems(catData || []);

          // 3. Get Assignments (Rows)
          const { data: assignData } = await supabase.from('hsk_inventory_assignments')
              .select('id, villa_number, host_id, status')
              .eq('schedule_id', schedule.id)
              .order('villa_number');
          setAssignments(assignData || []);

          // 4. Get Records (Cells)
          const { data: recData } = await supabase.from('hsk_inventory_records')
              .select('villa_number, article_number, counted_qty')
              .eq('schedule_id', schedule.id);
          setRecords(recData || []);

          // 5. Setup Realtime Listener for live counting
          const channel = supabase.channel(`matrix_${schedule.id}`)
              .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_inventory_records', filter: `schedule_id=eq.${schedule.id}` }, () => {
                  refreshRecords(schedule.id);
                  refreshAssignments(schedule.id);
              })
              .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_inventory_assignments', filter: `schedule_id=eq.${schedule.id}` }, () => {
                  refreshAssignments(schedule.id);
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

  const refreshRecords = async (scheduleId: string) => {
      const { data } = await supabase.from('hsk_inventory_records').select('villa_number, article_number, counted_qty').eq('schedule_id', scheduleId);
      if (data) setRecords(data);
  };

  const refreshAssignments = async (scheduleId: string) => {
      const { data } = await supabase.from('hsk_inventory_assignments').select('id, villa_number, host_id, status').eq('schedule_id', scheduleId).order('villa_number');
      if (data) setAssignments(data);
  };

  // Create a fast lookup dictionary for cells
  const recordsMap = useMemo(() => {
      const map: Record<string, number> = {};
      records.forEach(r => { map[`${r.villa_number}_${r.article_number}`] = r.counted_qty; });
      return map;
  }, [records]);

  const filteredAssignments = assignments.filter(a => a.villa_number.toLowerCase().includes(locationSearch.toLowerCase()) || a.host_id.toLowerCase().includes(locationSearch.toLowerCase()));

  const downloadCSV = () => {
      if (items.length === 0 || assignments.length === 0) return toast.error("No data to export");

      let csv = 'Location,Assigned Staff,Status,';
      // Header Row
      csv += items.map(i => `"${i.article_name.replace(/"/g, '""')}"`).join(',') + '\n';
      
      // Data Rows
      assignments.forEach(loc => {
          csv += `"${loc.villa_number}","${loc.host_id}","${loc.status}",`;
          const rowData = items.map(item => {
              const val = recordsMap[`${loc.villa_number}_${item.article_number}`];
              return val !== undefined ? val : 0;
          });
          csv += rowData.join(',') + '\n';
      });
      
      // Total Row
      csv += `"TOTALS","","",`;
      const totalsRow = items.map(item => {
          return assignments.reduce((sum, loc) => sum + (recordsMap[`${loc.villa_number}_${item.article_number}`] || 0), 0);
      });
      csv += totalsRow.join(',') + '\n';

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedType}_Inventory_${selectedMonth}.csv`;
      a.click();
      toast.success("Download started!");
  };

  if (isLoading) return <div className="flex-1 flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

  if (!isAdmin) return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center p-8">
          <div className="w-24 h-24 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6"><Shield size={40} /></div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Access Restricted</h2>
      </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      
      <PageHeader title="Live Inventory Matrix" date={new Date()} onDateChange={() => {}} />

      <div className="px-4 md:px-8 mt-4 max-w-[1600px] mx-auto w-full flex flex-col h-[calc(100vh-140px)]">
          
          {/* CONTROL BAR */}
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 justify-between md:items-center shrink-0 mb-6 z-20">
              <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                      <Calendar size={16} className="text-slate-400 ml-2"/>
                      <input type="month" className="bg-transparent font-black text-sm outline-none text-slate-700" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                      <Box size={16} className="text-slate-400 ml-2"/>
                      <select className="bg-transparent font-black text-sm outline-none text-slate-700 pr-2" value={selectedType} onChange={e=>setSelectedType(e.target.value)}>
                          <option value="" disabled>Select Type...</option>
                          {invTypes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                      </select>
                  </div>
                  {isFetchingData && <Loader2 size={16} className="animate-spin text-[#6D2158]"/>}
              </div>

              <div className="flex items-center gap-3">
                  <div className="relative w-full md:w-64">
                      <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                      <input type="text" placeholder="Search Location..." className="w-full pl-10 pr-4 py-2 border border-slate-200 bg-slate-50 rounded-xl text-xs font-bold outline-none focus:border-[#6D2158]" value={locationSearch} onChange={e => setLocationSearch(e.target.value)} />
                  </div>
                  <button onClick={downloadCSV} disabled={!activeSchedule || items.length === 0} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50 whitespace-nowrap">
                      <FileSpreadsheet size={16}/> Export
                  </button>
              </div>
          </div>

          {/* MATRIX AREA */}
          {!activeSchedule ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50">
                  <AlertCircle size={48} className="text-slate-300 mb-4"/>
                  <h3 className="font-black text-xl text-slate-700 mb-2">No Schedule Found</h3>
                  <p className="text-slate-500 font-bold text-sm max-w-md">There is no inventory count initialized for {selectedType} in {format(parseISO(selectedMonth + '-01'), 'MMMM yyyy')}. Go to Setup to create it.</p>
              </div>
          ) : items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50/50">
                  <Box size={48} className="text-amber-300 mb-4"/>
                  <h3 className="font-black text-xl text-slate-700 mb-2">No Items Linked</h3>
                  <p className="text-slate-500 font-bold text-sm max-w-md">You have not linked any items from the Master Catalog to "{selectedType}". Go to Setup to link items.</p>
              </div>
          ) : (
              <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col relative z-0">
                  
                  {/* Status Bar */}
                  <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                      <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest">
                          <span className="text-slate-500">Total Locations: {assignments.length}</span>
                          <span className="text-emerald-600">Completed: {assignments.filter(a => a.status === 'Submitted').length}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Live Sync Active
                      </div>
                  </div>

                  {/* Scrollable Matrix */}
                  <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50/30">
                      <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 z-20 bg-white shadow-sm">
                              <tr>
                                  <th className="p-4 border-b border-r border-slate-200 sticky left-0 z-30 bg-white min-w-[150px] shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Location & Status</div>
                                  </th>
                                  {items.map(item => (
                                      <th key={item.article_number} className="p-4 border-b border-slate-200 min-w-[120px] max-w-[150px]">
                                          <div className="text-xs font-bold text-slate-800 leading-tight truncate" title={item.article_name}>{item.article_name}</div>
                                          <div className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{item.category}</div>
                                      </th>
                                  ))}
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {filteredAssignments.map((loc) => (
                                  <tr key={loc.id} className="hover:bg-blue-50/30 transition-colors group">
                                      <td className="p-4 border-r border-slate-100 sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 shadow-[4px_0_10px_rgba(0,0,0,0.02)] transition-colors">
                                          <div className="font-black text-sm text-[#6D2158]">{loc.villa_number}</div>
                                          <div className="flex items-center gap-1 mt-1">
                                              {loc.status === 'Submitted' ? <CheckCircle2 size={12} className="text-emerald-500"/> : loc.status === 'In Progress' ? <Clock size={12} className="text-amber-500"/> : <div className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-0.5 mr-1"/>}
                                              <span className={`text-[9px] font-bold uppercase tracking-widest ${loc.status === 'Submitted' ? 'text-emerald-600' : loc.status === 'In Progress' ? 'text-amber-600' : 'text-slate-400'}`}>{loc.status}</span>
                                          </div>
                                      </td>
                                      {items.map(item => {
                                          const val = recordsMap[`${loc.villa_number}_${item.article_number}`];
                                          const hasValue = val !== undefined && val > 0;
                                          return (
                                              <td key={item.article_number} className={`p-4 text-center font-black border-l border-slate-50 ${hasValue ? 'text-slate-800 bg-emerald-50/20' : 'text-slate-300'}`}>
                                                  {hasValue ? val : '-'}
                                              </td>
                                          );
                                      })}
                                  </tr>
                              ))}
                              
                              {/* TOTALS ROW */}
                              {filteredAssignments.length > 0 && (
                                  <tr className="bg-slate-800 text-white sticky bottom-0 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                                      <td className="p-4 border-r border-slate-700 sticky left-0 z-30 bg-slate-800">
                                          <div className="font-black text-sm uppercase tracking-widest text-slate-300">Grand Totals</div>
                                      </td>
                                      {items.map(item => {
                                          const total = filteredAssignments.reduce((sum, loc) => sum + (recordsMap[`${loc.villa_number}_${item.article_number}`] || 0), 0);
                                          return (
                                              <td key={item.article_number} className="p-4 text-center font-black text-lg border-l border-slate-700 text-emerald-400">
                                                  {total}
                                              </td>
                                          );
                                      })}
                                  </tr>
                              )}
                          </tbody>
                      </table>
                      {filteredAssignments.length === 0 && (
                          <div className="p-12 text-center text-slate-400 font-bold text-sm">No locations found.</div>
                      )}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
}
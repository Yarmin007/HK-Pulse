"use client";
import React, { useState, useEffect } from 'react';
import { 
  Calendar, Upload, ChevronLeft, ChevronRight, X, Edit3, 
  Users, FileSpreadsheet, Loader2, Star, CalendarDays,
  Utensils
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

// --- TYPES ---
type DailyRecord = {
  id: string;
  report_date: string;
  villa_number: string;
  guest_name: string;
  status: string;
  gem_name: string;
  stay_dates: string;
  meal_plan: string;
  pax_adults: number;
  pax_kids: number;
  remarks: string;
};

// --- HELPERS ---
const getStatusColor = (status: string) => {
  const s = status?.toUpperCase() || '';
  if (s.includes('OCC')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (s.includes('ARR')) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (s.includes('DEP')) return 'bg-rose-100 text-rose-700 border-rose-200';
  if (s.includes('VAC')) return 'bg-slate-100 text-slate-500 border-slate-200';
  if (s.includes('TMA')) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-gray-50 text-gray-500 border-gray-200';
};

export default function DailyOperationsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Import Modal
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importDate, setImportDate] = useState(new Date().toISOString().split('T')[0]);

  // Edit Modal
  const [editingRecord, setEditingRecord] = useState<DailyRecord | null>(null);

  useEffect(() => {
    fetchDailyRecords();
  }, [selectedDate]);

  // --- DATABASE FETCH ---
  const fetchDailyRecords = async () => {
    setIsLoading(true);
    const dateStr = selectedDate.toISOString().split('T')[0];
    const { data } = await supabase
      .from('hsk_daily_summary')
      .select('*')
      .eq('report_date', dateStr);
    
    // Numeric Sort for Villas
    const sorted = (data || []).sort((a, b) => {
       const va = parseInt(a.villa_number) || 0;
       const vb = parseInt(b.villa_number) || 0;
       return va - vb;
    });

    setRecords(sorted);
    setIsLoading(false);
  };

  // --- EXCEL UPLOAD HANDLER ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);

    try {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const data = evt.target?.result;
          if (!data) return;
          
          const wb = XLSX.read(data, { type: 'array' });
          const wsname = wb.SheetNames[0]; 
          const ws = wb.Sheets[wsname];
          const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
          
          const csvPreview = jsonData.map((row: any) => (row as any[]).join(',')).join('\n');
          setImportText(csvPreview);
        };
        reader.readAsArrayBuffer(file);
    } catch (err: any) {
      alert("Error reading Excel file: " + err.message);
    }
    setIsProcessing(false);
  };

  // --- SMART PARSER ---
  const handleProcessImport = async () => {
    if (!importText) return alert("No data to process.");
    
    setIsLoading(true);
    const lines = importText.split('\n');
    const newRecords = [];

    // DETECT FORMAT
    let format = 'UNKNOWN';
    let startIdx = -1;

    for(let i=0; i<Math.min(30, lines.length); i++) {
        const line = lines[i].toUpperCase();
        if(line.includes('VILLA')) {
            startIdx = i + 1; 
            if(line.includes('STATUS')) format = 'DAILY_SUMMARY';
            else if(line.includes('MP') || line.includes('GEM')) format = 'GUEST_LIST';
            break;
        }
    }
    
    if (startIdx === -1) {
        startIdx = lines[0].includes(',') ? 4 : 0; 
    }

    for (let i = startIdx; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        let cols = line.split(',').map(c => c ? c.replace(/"/g, '').trim() : '');
        
        if (cols.length < 2) continue;

        // Use temporary object for parsing
        let tempRecord: any = {
            villa_number: '',
            status: 'OCC',
            guest_name: 'Unknown',
            pax: 0,
            gem_name: '',
            stay_dates: '',
            meal_plan: '',
            remarks: ''
        };

        if (format === 'GUEST_LIST') {
            // Converted Guest List Excel
            tempRecord.villa_number = cols[0];
            tempRecord.gem_name = cols[1];
            tempRecord.meal_plan = cols[2];
            tempRecord.guest_name = cols[4] || cols[3]; 
            tempRecord.pax = (parseInt(cols[6]) || 0) + (parseInt(cols[7]) || 0);
            
            const arr = cols[12] ? cols[12].replace('January', 'Jan') : '';
            const dep = cols[14] ? cols[14].replace('January', 'Jan') : '';
            tempRecord.stay_dates = arr && dep ? `${arr} - ${dep}` : '';
            
        } else {
            // Daily Summary Excel
            tempRecord.villa_number = cols[1];
            tempRecord.status = cols[2];
            tempRecord.guest_name = cols[4];
            tempRecord.pax = parseInt(cols[5]) || 0;
            tempRecord.gem_name = cols[6];
            tempRecord.stay_dates = cols[7];
        }

        if(!tempRecord.villa_number || isNaN(parseInt(tempRecord.villa_number))) continue;

        // PUSH ONLY VALID DB COLUMNS
        newRecords.push({
            report_date: importDate,
            villa_number: tempRecord.villa_number,
            status: tempRecord.status || 'OCC',
            guest_name: tempRecord.guest_name || 'Unknown',
            gem_name: tempRecord.gem_name || '',
            meal_plan: tempRecord.meal_plan || '',
            stay_dates: tempRecord.stay_dates || '',
            pax_adults: tempRecord.pax || 0, // MAP 'pax' -> 'pax_adults'
            pax_kids: 0,
            remarks: tempRecord.remarks || ''
        });
    }

    if (newRecords.length > 0) {
        await supabase.from('hsk_daily_summary').delete().eq('report_date', importDate);
        const { error } = await supabase.from('hsk_daily_summary').insert(newRecords);
        
        if (!error) {
            setIsImportOpen(false);
            setImportText('');
            setSelectedDate(new Date(importDate)); 
            alert(`Success! Imported ${newRecords.length} records.`);
        } else {
            alert("Database Error: " + error.message);
        }
    } else {
        alert("Could not find valid data rows. Please convert PDF to Excel first.");
    }
    fetchDailyRecords();
    setIsLoading(false);
  };

  // --- SAVE EDITS ---
  const handleSaveEdit = async () => {
      if (!editingRecord) return;
      await supabase.from('hsk_daily_summary').update({
          guest_name: editingRecord.guest_name,
          status: editingRecord.status,
          gem_name: editingRecord.gem_name,
          pax_adults: editingRecord.pax_adults, 
          pax_kids: editingRecord.pax_kids,
          meal_plan: editingRecord.meal_plan,
          remarks: editingRecord.remarks
      }).eq('id', editingRecord.id);
      
      setEditingRecord(null);
      fetchDailyRecords();
  };

  const changeDate = (days: number) => {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() + days);
      setSelectedDate(newDate);
  };

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-6 pb-24 font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-8 gap-4 border-b border-slate-200 pb-6">
        <div>
           <h1 className="text-3xl font-bold tracking-tight">Guest Operations</h1>
           <div className="flex items-center gap-4 mt-2">
              <button onClick={() => changeDate(-1)} className="p-1 rounded-full hover:bg-slate-100 text-slate-400"><ChevronLeft/></button>
              <div className="flex items-center gap-2 text-lg font-bold text-slate-700 bg-white px-4 py-1 rounded-xl shadow-sm border border-slate-100">
                 <Calendar size={18} className="text-[#6D2158]"/>
                 {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <button onClick={() => changeDate(1)} className="p-1 rounded-full hover:bg-slate-100 text-slate-400"><ChevronRight/></button>
           </div>
        </div>
        
        <button 
          onClick={() => { setImportDate(selectedDate.toISOString().split('T')[0]); setIsImportOpen(true); }}
          className="bg-[#6D2158] text-white px-6 py-3 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg hover:bg-[#5a1b49] transition-all"
        >
          <Upload size={18}/> Import List
        </button>
      </div>

      {/* STATS SUMMARY */}
      <div className="flex gap-4 mb-6 overflow-x-auto pb-2 no-scrollbar">
          <div className="bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm min-w-[140px]">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Occupancy</p>
              <p className="text-xl font-bold text-slate-800">{records.filter(r => ['OCC','ARR'].some(s => r.status.toUpperCase().includes(s))).length}</p>
          </div>
          <div className="bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm min-w-[140px]">
              <p className="text-[10px] font-bold text-emerald-500 uppercase">Arrivals</p>
              <p className="text-xl font-bold text-emerald-600">{records.filter(r => r.status.toUpperCase().includes('ARR')).length}</p>
          </div>
          <div className="bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm min-w-[140px]">
              <p className="text-[10px] font-bold text-rose-500 uppercase">Departures</p>
              <p className="text-xl font-bold text-rose-600">{records.filter(r => r.status.toUpperCase().includes('DEP')).length}</p>
          </div>
          <div className="bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm min-w-[140px]">
              <p className="text-[10px] font-bold text-amber-500 uppercase">TMA / Trans</p>
              <p className="text-xl font-bold text-amber-600">{records.filter(r => r.status.toUpperCase().includes('TMA')).length}</p>
          </div>
      </div>

      {/* MAIN GRID */}
      {records.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100">
              <Users size={48} className="text-slate-200 mb-4"/>
              <p className="text-slate-400 font-bold text-lg">No data for this date</p>
              <p className="text-slate-300 text-xs mb-4">Upload the "Daily Summery" or "Guest List" Excel.</p>
              <button onClick={() => setIsImportOpen(true)} className="text-[#6D2158] font-bold text-sm underline">Import Data</button>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {records.map(r => (
                  <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow relative group">
                      
                      <div className="flex justify-between items-start mb-3">
                          <span className="text-2xl font-bold text-slate-800">{r.villa_number}</span>
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase border ${getStatusColor(r.status)}`}>
                              {r.status}
                          </span>
                      </div>

                      <div className="mb-4">
                          <h3 className="text-sm font-bold text-slate-700 line-clamp-2 min-h-[1.25rem] flex items-center gap-2">
                              {r.guest_name || 'Vacant'}
                          </h3>
                          <div className="flex gap-2 mt-2 flex-wrap">
                              {r.pax_adults > 0 && <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500 border border-slate-100"><Users size={10}/> {r.pax_adults}</span>}
                              {r.gem_name && <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded text-[10px] font-bold border border-amber-100"><Star size={10}/> {r.gem_name}</span>}
                              {r.meal_plan && <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded text-[10px] font-bold border border-blue-100"><Utensils size={10}/> {r.meal_plan}</span>}
                          </div>
                      </div>

                      {r.remarks ? (
                          <div className="mt-3 text-[10px] font-bold text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 line-clamp-2 flex items-start gap-2">
                              <CalendarDays size={12} className="shrink-0 mt-0.5 text-slate-400"/>
                              {r.remarks.replace('Stay: ', '')}
                          </div>
                      ) : <div className="h-8"></div>}

                      <button onClick={() => setEditingRecord({...r, pax: r.pax_adults} as any)} className="absolute top-4 right-4 text-slate-300 hover:text-[#6D2158] opacity-0 group-hover:opacity-100 transition-opacity">
                          <Edit3 size={16}/>
                      </button>
                  </div>
              ))}
          </div>
      )}

      {/* --- IMPORT MODAL --- */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Upload size={20}/> Import Data</h3>
                 <button onClick={() => setIsImportOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500"><X size={18}/></button>
              </div>
              
              <div className="space-y-4">
                  <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Target Date</label>
                      <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={importDate} onChange={e => setImportDate(e.target.value)} />
                  </div>

                  <div className={`border-2 border-dashed border-slate-200 rounded-xl p-6 text-center transition-colors relative ${isProcessing ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                      <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        onChange={handleFileUpload} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        disabled={isProcessing}
                      />
                      {isProcessing ? (
                          <div className="flex flex-col items-center gap-2 text-slate-500">
                              <Loader2 size={32} className="animate-spin text-[#6D2158]"/>
                              <p className="text-xs font-bold uppercase">Reading Excel...</p>
                          </div>
                      ) : (
                          <>
                            <div className="flex justify-center gap-4 mb-2">
                                <FileSpreadsheet size={32} className="text-emerald-500"/>
                            </div>
                            <p className="text-sm font-bold text-slate-700">Click to upload Excel</p>
                            <p className="text-[10px] text-slate-400">Supports Daily Summary & Guest List</p>
                          </>
                      )}
                  </div>

                  <div className="relative">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-300 font-bold">OR Paste Text</span></div>
                  </div>

                  <textarea 
                    className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-mono text-slate-600 outline-none focus:border-[#6D2158] resize-none"
                    placeholder="Extracted data will appear here..."
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                  />

                  <button 
                     onClick={handleProcessImport} 
                     disabled={isLoading || isProcessing}
                     className="w-full bg-[#6D2158] text-white py-3 rounded-xl font-bold uppercase text-sm shadow-lg hover:bg-[#5a1b49] transition-all disabled:opacity-50"
                  >
                     {isLoading ? 'Saving...' : 'Process & Save'}
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-xl font-bold text-slate-800">Edit Guest Info</h3>
                    <p className="text-sm font-bold text-slate-400">Villa {editingRecord.villa_number}</p>
                 </div>
                 <button onClick={() => setEditingRecord(null)} className="bg-slate-100 p-2 rounded-full text-slate-500"><X size={18}/></button>
              </div>

              <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase">Status</label>
                          <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={editingRecord.status} onChange={e => setEditingRecord({...editingRecord, status: e.target.value})}/>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase">GEM</label>
                          <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={editingRecord.gem_name} onChange={e => setEditingRecord({...editingRecord, gem_name: e.target.value})}/>
                      </div>
                  </div>
                  <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Guest Name</label>
                      <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={editingRecord.guest_name} onChange={e => setEditingRecord({...editingRecord, guest_name: e.target.value})}/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase">Total Pax</label>
                          <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={editingRecord.pax_adults} onChange={e => setEditingRecord({...editingRecord, pax_adults: parseInt(e.target.value)})}/>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase">Meal Plan</label>
                          <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={editingRecord.meal_plan} onChange={e => setEditingRecord({...editingRecord, meal_plan: e.target.value})}/>
                      </div>
                  </div>
                  <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Stay Dates / Remarks</label>
                      <textarea className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none resize-none" value={editingRecord.remarks} onChange={e => setEditingRecord({...editingRecord, remarks: e.target.value})}/>
                  </div>
                  <button onClick={handleSaveEdit} className="w-full bg-[#6D2158] text-white py-3 rounded-xl font-bold uppercase text-sm shadow-lg hover:bg-[#5a1b49] transition-all mt-2">Save Changes</button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
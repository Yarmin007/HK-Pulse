"use client";
import React, { useState, useEffect } from 'react';
import { 
  Edit3, X, ChevronLeft, ChevronRight,
  FileSpreadsheet, Printer, Heart, ArrowRight, AlertTriangle, CheckCircle, Loader2, RotateCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- CONFIGURATION ---
const TOTAL_VILLAS = 97;

const getToday = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatGuestName = (rawName: string) => {
  if (!rawName) return "";
  let name = String(rawName).trim();
  
  // Clean Prefixes
  name = name
    .replace(/Alfaalil\s+/gi, "Mr. ")
    .replace(/Alfaalila\s+/gi, "Ms. ")
    .replace(/Kokko\s+/gi, "Kid ");

  // Remove common artifacts from Memo
  name = name.replace(/\n/g, " ").replace(/\s+/g, " ");

  return name.trim();
};

const extractVilla = (raw: any) => {
    if(!raw) return null;
    const match = String(raw).match(/(\d+)/);
    return match ? match[0] : null;
};

// --- TYPES ---
type GuestRecord = {
  id?: string;
  report_date: string;
  villa_number: string;
  status: string;
  guest_name: string; 
  pax_adults: number;
  pax_kids: number;
  gem_name: string;
  meal_plan: string;
  stay_dates: string; 
  remarks: string;
  preferences?: string;
};

type ChangeLog = {
    villa: string;
    type: 'NEW' | 'CHANGE' | 'DEPARTURE' | 'ARRIVAL';
    oldGuest: string;
    newGuest: string;
    oldStatus: string;
    newStatus: string;
};

export default function HousekeepingSummaryPage() {
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [masterList, setMasterList] = useState<GuestRecord[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0); 
  
  // Diff Modal
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [changes, setChanges] = useState<ChangeLog[]>([]);
  const [pendingData, setPendingData] = useState<GuestRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRollingOver, setIsRollingOver] = useState(false);

  // Edit Modal
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GuestRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'prefs'>('details');

  useEffect(() => {
    fetchDailyData();
  }, [selectedDate]);

  // --- 1. FETCH ---
  const fetchDailyData = async () => {
    const { data: dbRecords } = await supabase
      .from('hsk_daily_summary')
      .select('*')
      .eq('report_date', selectedDate);

    const fullList: GuestRecord[] = [];
    for (let i = 1; i <= TOTAL_VILLAS; i++) {
      const villaNum = i.toString();
      const match = dbRecords?.find(r => r.villa_number === villaNum);
      if (match) {
        fullList.push(match);
      } else {
        fullList.push({
          report_date: selectedDate,
          villa_number: villaNum,
          status: 'VAC',
          guest_name: '',
          pax_adults: 0,
          pax_kids: 0,
          gem_name: '',
          meal_plan: '',
          stay_dates: '',
          remarks: '',
          preferences: ''
        });
      }
    }
    fullList.sort((a, b) => parseInt(a.villa_number) - parseInt(b.villa_number));
    setMasterList(fullList);
  };

  // --- 2. ROLL OVER ---
  const handleRollOver = async () => {
      if(!confirm(`Overwrite ${selectedDate} with previous day's data?`)) return;
      setIsRollingOver(true);

      const { data: recentRecords } = await supabase
          .from('hsk_daily_summary')
          .select('*')
          .lt('report_date', selectedDate)
          .order('report_date', { ascending: false })
          .limit(200);

      if (!recentRecords || recentRecords.length === 0) {
          alert("No history found.");
          setIsRollingOver(false);
          return;
      }

      const lastDate = recentRecords[0].report_date;
      const sourceData = recentRecords.filter(r => r.report_date === lastDate);

      const newDayData = sourceData.map(r => {
          let newStatus = r.status;
          let newGuest = r.guest_name;
          let newPaxAdults = r.pax_adults;
          let newPaxKids = r.pax_kids;
          let newGem = r.gem_name;
          let newMeal = r.meal_plan;
          let newDates = r.stay_dates;
          let newPref = r.preferences;

          // Logic: If left yesterday, VAC today. If Arrived yesterday, OCC today.
          if (r.status.includes('DEP')) {
              newStatus = 'VAC';
              newGuest = '';
              newPaxAdults = 0;
              newPaxKids = 0;
              newGem = '';
              newMeal = '';
              newDates = '';
              newPref = ''; 
          } else if (r.status.includes('ARR')) {
              newStatus = 'OCC';
          } 

          return {
              report_date: selectedDate,
              villa_number: r.villa_number,
              status: newStatus,
              guest_name: newGuest,
              pax_adults: newPaxAdults,
              pax_kids: newPaxKids,
              gem_name: newGem,
              meal_plan: newMeal,
              stay_dates: newDates,
              remarks: '',
              preferences: newPref
          };
      });

      await supabase.from('hsk_daily_summary').delete().eq('report_date', selectedDate);
      await supabase.from('hsk_daily_summary').insert(newDayData);
      
      fetchDailyData();
      setIsRollingOver(false);
  };

  // --- 3. IMPORT HANDLER ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = evt.target?.result;
            const wb = XLSX.read(data, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
            
            // DECIDE: OCC REPORT or MEMO?
            const firstRowStr = rows[0]?.join(' ').toUpperCase() + rows[1]?.join(' ').toUpperCase();
            
            if (firstRowStr.includes('OCCUPANCY REPORT')) {
                processOccupancyReport(rows);
            } else {
                processDailyMemo(rows);
            }

        } catch (err) { 
            alert("Error reading file."); 
            setIsProcessing(false); 
        }
    };
    reader.readAsBinaryString(file);
    setFileInputKey(prev => prev + 1);
  };

  // --- PARSER A: DAILY MEMO (New) ---
  const processDailyMemo = (rows: any[][]) => {
      // 1. Convert MasterList to Map for easy update
      const currentMap = new Map(masterList.map(r => [r.villa_number, { ...r }]));
      const diffs: ChangeLog[] = [];

      let currentSection = '';
      
      rows.forEach(row => {
          const rowStr = row.join(' ').toUpperCase();
          const col8 = String(row[8] || '').toUpperCase();

          // Detect Section
          if (col8.includes('ARRIVALS')) currentSection = 'ARRIVALS';
          else if (col8.includes('DEPARTURES')) currentSection = 'DEPARTURES';
          else if (rowStr.includes('ROOM MOVES')) currentSection = 'MOVES';

          if (!currentSection) return;

          // Parse
          const rawVilla = row[1];
          const rawName = row[8];
          const rawNotes = row[12]; // Col 12/M often has "Age" for kids
          
          if (currentSection === 'MOVES') {
              // Row 118 headers usually. Row 119 data.
              // Col 1 = FROM, Col 2 = TO
              const fromV = extractVilla(row[1]);
              const toV = extractVilla(row[2]);
              
              if(fromV && toV && currentMap.has(fromV) && currentMap.has(toV)) {
                  const fromRec = currentMap.get(fromV)!;
                  const toRec = currentMap.get(toV)!;
                  
                  // Move Guest
                  toRec.guest_name = fromRec.guest_name;
                  toRec.status = 'OCC'; 
                  toRec.preferences = fromRec.preferences;
                  
                  fromRec.guest_name = '';
                  fromRec.status = 'VAC';
                  fromRec.preferences = '';

                  diffs.push({
                      villa: `${fromV} -> ${toV}`,
                      type: 'CHANGE',
                      oldGuest: `Move from ${fromV}`,
                      newGuest: toRec.guest_name,
                      oldStatus: 'OCC',
                      newStatus: 'OCC'
                  });
              }
              return;
          }

          // Skip headers
          if(String(rawVilla).includes('VILLA') || String(rawName).includes('GUEST')) return;

          const villa = extractVilla(rawVilla);
          if (!villa || !currentMap.has(villa)) return;

          const record = currentMap.get(villa)!;
          let cleanName = formatGuestName(rawName);

          // Add Age if Master/Miss
          if ((cleanName.includes('Master') || cleanName.includes('Miss')) && rawNotes) {
             const ageMatch = String(rawNotes).match(/(\d+)\s*(yo|years|yrs|age)/i);
             if (ageMatch) {
                 cleanName += ` (${ageMatch[1]} yrs)`;
             }
          }

          if (cleanName.length < 2) return;

          if (currentSection === 'ARRIVALS') {
             // If already occupied, it becomes DEP/ARR
             const oldStatus = record.status;
             record.guest_name = cleanName; // Overwrite or Append? Usually Overwrite for arrival
             record.status = (oldStatus === 'OCC' || oldStatus === 'DEP') ? 'DEP/ARR' : 'ARR';
             
             diffs.push({
                 villa,
                 type: 'ARRIVAL',
                 oldGuest: oldStatus === 'OCC' ? 'Occupied' : 'Vacant',
                 newGuest: cleanName,
                 oldStatus,
                 newStatus: record.status
             });
          } 
          else if (currentSection === 'DEPARTURES') {
             // Mark as Departure
             const oldStatus = record.status;
             if (!oldStatus.includes('DEP')) {
                 record.status = oldStatus === 'ARR' ? 'DEP/ARR' : 'DEP';
                 
                 diffs.push({
                     villa,
                     type: 'DEPARTURE',
                     oldGuest: record.guest_name,
                     newGuest: record.guest_name, // Name stays until they leave
                     oldStatus,
                     newStatus: record.status
                 });
             }
          }
      });

      setChanges(diffs);
      setPendingData(Array.from(currentMap.values()));
      setDiffModalOpen(true);
      setIsProcessing(false);
  };

  // --- PARSER B: FULL OCCUPANCY REPORT (Old) ---
  const processOccupancyReport = (rows: any[][]) => {
      // (Keep your existing robust logic here for full overwrite)
      let headerIdx = -1;
      let colMap: any = {};
      
      for(let i=0; i<Math.min(rows.length, 30); i++) {
          const rowStr = rows[i].join(' ').toUpperCase();
          if(rowStr.includes('VILLA') && (rowStr.includes('NAME') || rowStr.includes('NO.'))) {
              headerIdx = i;
              rows[i].forEach((cell: any, idx: number) => {
                  const c = String(cell).toUpperCase().trim();
                  if(c.includes('VILLA') || c === 'NO.') colMap.villa = idx;
                  else if(c.includes('NAME')) colMap.name = idx;
                  else if(c === 'GEM') colMap.gem = idx;
                  else if(c === 'MP') colMap.mp = idx;
                  else if(c === 'ADULTS') colMap.adults = idx;
                  else if(c === 'CHILDREN') colMap.kids = idx;
                  else if(c.includes('ARR') && c.includes('DATE')) colMap.arrDate = idx;
                  else if(c.includes('DEP') && c.includes('DATE')) colMap.depDate = idx;
              });
              break;
          }
      }

      if (headerIdx === -1) {
          // Fallback
          headerIdx = 1; 
          colMap = { villa: 0, gem: 1, mp: 2, name: 3, adults: 6, kids: 7, arrDate: 19, depDate: 25 };
      }

      const newMap = new Map<string, GuestRecord>();
      // Init empty map based on current masterList structure
      masterList.forEach(r => newMap.set(r.villa_number, { ...r, status: 'VAC', guest_name: '', pax_adults: 0, pax_kids: 0, gem_name: '', meal_plan: '', stay_dates: '' }));

      for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const villa = extractVilla(row[colMap.villa]);
          if (!villa || !newMap.has(villa)) continue;

          const rec = newMap.get(villa)!;
          
          const name = formatGuestName(row[colMap.name]);
          rec.guest_name = name;
          rec.gem_name = row[colMap.gem] || '';
          rec.meal_plan = row[colMap.mp] || '';
          rec.pax_adults = parseInt(row[colMap.adults] || 0);
          rec.pax_kids = parseInt(row[colMap.kids] || 0);

          // Calc Status
          let status = 'OCC';
          if (colMap.arrDate && colMap.depDate) {
               // (Add logic to compare dates with selectedDate)
               // Simple version:
               const arrRaw = row[colMap.arrDate];
               const depRaw = row[colMap.depDate];
               // ... date parsing logic ... 
               // For now assume OCC unless date matches today
          }
          rec.status = status;
      }
      
      const newRecords = Array.from(newMap.values());
      calculateDiff(newRecords);
      setIsProcessing(false);
  };

  // --- 4. COMPARE & FINALIZE ---
  const calculateDiff = (newRecords: GuestRecord[]) => {
      const diffs: ChangeLog[] = [];
      const currentMap = new Map(masterList.map(r => [r.villa_number, r]));

      newRecords.forEach(newRec => {
          const oldRec = currentMap.get(newRec.villa_number);
          if (!oldRec) return;

          const oldName = oldRec.guest_name.trim();
          const newName = newRec.guest_name.trim();
          const oldStatus = oldRec.status;
          const newStatus = newRec.status;
          
          if (oldStatus !== newStatus || oldName !== newName) {
              let type: ChangeLog['type'] = 'CHANGE';
              if (oldStatus === 'VAC' && newStatus !== 'VAC') type = 'NEW';
              if (oldStatus !== 'VAC' && newStatus === 'VAC') type = 'DEPARTURE';

              diffs.push({
                  villa: newRec.villa_number,
                  type,
                  oldGuest: oldName || 'Vacant',
                  newGuest: newName || 'Vacant',
                  oldStatus,
                  newStatus
              });
          }
      });

      setChanges(diffs);
      setPendingData(newRecords);
      setDiffModalOpen(true);
  };

  const handleApproveUpdate = async () => {
      setIsProcessing(true);
      await supabase.from('hsk_daily_summary').delete().eq('report_date', selectedDate);
      
      // Preserve IDs if possible? No, insert creates new IDs usually. 
      // Just insert cleanly.
      const payload = pendingData.map(r => {
          const { id, ...rest } = r; // remove ID to create new
          return rest;
      });

      const { error } = await supabase.from('hsk_daily_summary').insert(payload);
      
      if (!error) {
          fetchDailyData();
      } else {
          alert("Error: " + error.message);
      }
      setDiffModalOpen(false);
      setIsProcessing(false);
  };

  // --- UI HELPERS ---
  const changeDate = (days: number) => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      setSelectedDate(`${y}-${m}-${dy}`);
  };

  const exportPDF = () => {
      const doc = new jsPDF('p', 'mm', 'a4');
      autoTable(doc, {
          head: [['Villa', 'Status', 'Guest', 'Pax', 'GEM']],
          body: masterList.map(r => [r.villa_number, r.status, r.guest_name, r.pax_adults+r.pax_kids, r.gem_name]),
      });
      doc.save(`HK_Summary_${selectedDate}.pdf`);
  };
  
  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    const { id, ...payload } = editingRecord;
    // Update or Insert
    if (id) await supabase.from('hsk_daily_summary').update(payload).eq('id', id);
    else await supabase.from('hsk_daily_summary').insert(payload);
    setIsEditOpen(false);
    fetchDailyData();
  };

  const getStatusColor = (s: string) => {
      const st = s?.toUpperCase() || 'VAC';
      if(st.includes('DEP') && st.includes('ARR')) return 'text-purple-700 bg-purple-50';
      if(st.includes('OCC')) return 'text-emerald-700 bg-emerald-50';
      if(st.includes('ARR')) return 'text-blue-700 bg-blue-50';
      if(st.includes('DEP')) return 'text-rose-700 bg-rose-50';
      if(st === 'VAC') return 'text-slate-300';
      return 'text-slate-600 bg-slate-50';
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 pb-32 font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
           <div className="h-10 w-1 bg-[#6D2158] rounded-full"></div>
           <div>
             <h1 className="text-xl font-bold text-slate-800">Housekeeping Summary</h1>
             <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}
             </p>
           </div>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronLeft size={16}/></button>
              <span className="px-4 text-xs font-bold text-slate-600 w-24 text-center">{new Date(selectedDate).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})}</span>
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronRight size={16}/></button>
           </div>
           
           <button 
                onClick={handleRollOver} 
                disabled={isRollingOver}
                className="flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 hover:bg-amber-100 px-4 py-2 rounded-lg text-xs font-bold transition-all"
           >
                {isRollingOver ? <Loader2 size={16} className="animate-spin"/> : <RotateCw size={16}/>} Roll Over
           </button>

           <input 
              key={fileInputKey}
              type="file" 
              id="fileInput"
              className="hidden" 
              accept=".xlsx,.xls,.xlsm,.csv" 
              onChange={handleFileUpload} 
           />
           <button onClick={() => document.getElementById('fileInput')?.click()} className="flex items-center gap-2 bg-white border border-slate-200 hover:border-[#6D2158] text-slate-600 hover:text-[#6D2158] px-4 py-2 rounded-lg text-xs font-bold transition-all">
              {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <FileSpreadsheet size={16}/>} Import
           </button>
           <button onClick={exportPDF} className="flex items-center gap-2 bg-[#6D2158] text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-[#5a1b49] transition-all"><Printer size={16}/> Print PDF</button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="py-3 px-4 w-20">Villa</th>
                <th className="py-3 px-4 w-24">Status</th>
                <th className="py-3 px-4">Guest Profile</th>
                <th className="py-3 px-4 w-16 text-center">Pax</th>
                <th className="py-3 px-4 w-32">GEM</th>
                <th className="py-3 px-4 w-24">Meal</th>
                <th className="py-3 px-4 w-32 text-right">Dates</th>
                <th className="py-3 px-4 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {masterList.map((row) => (
                <tr key={row.villa_number} className={`hover:bg-slate-50 transition-colors group ${row.status === 'VAC' ? 'bg-slate-50/30' : ''}`}>
                  <td className="py-2 px-4"><span className="font-bold text-sm text-slate-700">{row.villa_number}</span></td>
                  <td className="py-2 px-4"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${getStatusColor(row.status)}`}>{row.status}</span></td>
                  <td className="py-2 px-4 cursor-pointer" onClick={() => { setEditingRecord(row); setIsEditOpen(true); }}>
                    <div className="flex flex-col">
                        <span className={`text-xs font-bold ${row.status === 'VAC' ? 'text-slate-200' : 'text-slate-700'} group-hover:text-[#6D2158] transition-colors`}>
                            {row.guest_name ? row.guest_name.substring(0, 30) : '-'}
                        </span>
                        {row.preferences && (<div className="flex items-center gap-1 mt-1 text-[9px] text-rose-500 font-bold"><Heart size={8} fill="currentColor"/> Note</div>)}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-center">{row.pax_adults > 0 && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{row.pax_adults + row.pax_kids}</span>}</td>
                  <td className="py-2 px-4 text-[10px] font-bold text-slate-500 uppercase">{row.gem_name}</td>
                  <td className="py-2 px-4 text-[10px] text-slate-500 font-medium">{row.meal_plan}</td>
                  <td className="py-2 px-4 text-right text-[10px] font-mono text-slate-400">{row.stay_dates}</td>
                  <td className="py-2 px-4 text-right"><button onClick={() => { setEditingRecord(row); setIsEditOpen(true); }} className="p-1.5 text-slate-300 hover:text-[#6D2158] hover:bg-[#6D2158]/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Edit3 size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHANGES MODAL */}
      {diffModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
              <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {changes.length > 0 ? <AlertTriangle className="text-amber-500"/> : <CheckCircle className="text-emerald-500"/>}
                        Review Changes
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                          {changes.length === 0 ? "No differences detected from current data." : `Found ${changes.length} updates.`}
                      </p>
                  </div>
                  <button onClick={() => setDiffModalOpen(false)}><X size={24} className="text-slate-400 hover:text-slate-600"/></button>
              </div>

              <div className="overflow-y-auto p-0">
                  {changes.length === 0 ? (
                      <div className="p-12 text-center text-slate-400">
                          <p>The uploaded file matches the current database exactly.</p>
                      </div>
                  ) : (
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-400 sticky top-0">
                              <tr>
                                  <th className="p-4 w-20">Villa</th>
                                  <th className="p-4 w-24">Type</th>
                                  <th className="p-4">Current Data</th>
                                  <th className="p-4 w-8"></th>
                                  <th className="p-4">New Data</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {changes.map((c, i) => (
                                  <tr key={i} className="hover:bg-slate-50">
                                      <td className="p-4 font-bold text-slate-700">{c.villa}</td>
                                      <td className="p-4">
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                              c.type === 'NEW' ? 'bg-emerald-100 text-emerald-700' :
                                              c.type === 'DEPARTURE' ? 'bg-rose-100 text-rose-700' :
                                              'bg-blue-100 text-blue-700'
                                          }`}>{c.type}</span>
                                      </td>
                                      <td className="p-4 text-slate-500">
                                          <div className="text-xs">{c.oldGuest ? c.oldGuest.substring(0, 15) : 'Vacant'}</div>
                                          <div className="text-[10px] font-bold uppercase opacity-50">{c.oldStatus}</div>
                                      </td>
                                      <td className="p-4 text-slate-300"><ArrowRight size={16}/></td>
                                      <td className="p-4 text-slate-800 font-medium">
                                          <div className="text-xs">{c.newGuest ? c.newGuest.substring(0, 15) : 'Vacant'}</div>
                                          <div className="text-[10px] font-bold uppercase text-[#6D2158]">{c.newStatus}</div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  )}
              </div>

              <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                  <button onClick={() => setDiffModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-white hover:shadow-sm transition-all">Cancel</button>
                  <button 
                      onClick={handleApproveUpdate} 
                      className="px-6 py-3 rounded-xl font-bold bg-[#6D2158] text-white shadow-lg hover:bg-[#5a1b49] transition-all flex items-center gap-2"
                  >
                      {changes.length === 0 ? "Force Overwrite" : "Approve & Update"}
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditOpen && editingRecord && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-[#6D2158] p-6 text-white">
                  <div className="flex justify-between items-start">
                     <div><h3 className="text-2xl font-bold">Villa {editingRecord.villa_number}</h3><p className="text-white/80 text-xs font-bold uppercase mt-1">Guest Profile</p></div>
                     <button onClick={() => setIsEditOpen(false)} className="bg-white/10 p-1.5 rounded-lg hover:bg-white/20"><X size={18}/></button>
                  </div>
                  <div className="flex gap-4 mt-6 text-xs font-bold uppercase tracking-wider">
                      <button onClick={() => setActiveTab('details')} className={`pb-2 border-b-2 ${activeTab === 'details' ? 'border-white text-white' : 'border-transparent text-white/50'}`}>Details</button>
                      <button onClick={() => setActiveTab('prefs')} className={`pb-2 border-b-2 ${activeTab === 'prefs' ? 'border-white text-white' : 'border-transparent text-white/50'}`}>Preferences</button>
                  </div>
              </div>
              <div className="p-6 overflow-y-auto">
                 {activeTab === 'details' ? (
                     <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Status</label><select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" value={editingRecord.status} onChange={e => setEditingRecord({...editingRecord, status: e.target.value})}>{['VAC','OCC','ARR','DEP','DEP/ARR','TMA','H/U'].map(s=><option key={s}>{s}</option>)}</select></div>
                            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">GEM</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" value={editingRecord.gem_name} onChange={e => setEditingRecord({...editingRecord, gem_name: e.target.value})}/></div>
                        </div>
                        <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Guest Names (Group)</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={editingRecord.guest_name} onChange={e => setEditingRecord({...editingRecord, guest_name: e.target.value})}/></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dates</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" value={editingRecord.stay_dates} onChange={e => setEditingRecord({...editingRecord, stay_dates: e.target.value})}/></div>
                            <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pax</label><input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" value={editingRecord.pax_adults} onChange={e => setEditingRecord({...editingRecord, pax_adults: parseInt(e.target.value)})}/></div>
                        </div>
                     </div>
                 ) : (
                     <div className="h-full">
                         <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Guest Preferences & Notes</label>
                         <textarea className="w-full h-48 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-slate-700 outline-none focus:border-amber-300 resize-none" placeholder="e.g. Likes extra water, allergic to nuts..." value={editingRecord.preferences || ''} onChange={e => setEditingRecord({...editingRecord, preferences: e.target.value})}/>
                     </div>
                 )}
              </div>
              <div className="p-6 pt-0"><button onClick={handleSaveEdit} className="w-full bg-[#6D2158] text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-md hover:bg-[#5a1b49] transition-all">Save Profile</button></div>
           </div>
        </div>
      )}
    </div>
  );
}
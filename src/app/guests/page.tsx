"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, Edit3, X, ChevronLeft, ChevronRight,
  FileSpreadsheet, Printer, Heart, ArrowRight, AlertTriangle, CheckCircle, Loader2, RefreshCw, RotateCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- CONFIGURATION ---
const TOTAL_VILLAS = 97;

const getVillaCategory = (num: number) => {
  if (num >= 1 && num <= 20) return "Water";
  if (num >= 21 && num <= 40) return "Beach";
  if (num >= 41 && num <= 60) return "Ocean";
  if (num >= 61 && num <= 80) return "Family";
  return "Reserve";
};

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
  name = name.replace(/\s+/g, ' '); 
  name = name
    .replace(/Alfaalil\s+/gi, "Mr. ")
    .replace(/Alfaalila\s+/gi, "Ms. ")
    .replace(/Kokko\s+/gi, "Kid ")
    .replace(/\//g, " / ");
  return name;
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
    type: 'NEW' | 'CHANGE' | 'DEPARTURE';
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

  // --- 2. ROLL OVER / REGENERATE FUNCTION ---
  const handleRollOver = async () => {
      if(!confirm(`Are you sure you want to generate data for ${selectedDate} based on previous history? This will overwrite any existing data for today.`)) return;
      
      setIsRollingOver(true);

      // 1. Find most recent previous date with data
      const { data: recentRecords } = await supabase
          .from('hsk_daily_summary')
          .select('*')
          .lt('report_date', selectedDate)
          .order('report_date', { ascending: false })
          .limit(200); // Fetch enough to cover at least one full day (97 villas)

      if (!recentRecords || recentRecords.length === 0) {
          alert("No previous history found to generate from.");
          setIsRollingOver(false);
          return;
      }

      // Get the date of the most recent record found
      const lastDate = recentRecords[0].report_date;
      const sourceData = recentRecords.filter(r => r.report_date === lastDate);

      console.log(`Rolling over from ${lastDate} to ${selectedDate}`);

      // 2. Transform Logic
      const newDayData = sourceData.map(r => {
          let newStatus = r.status;
          let newGuest = r.guest_name;
          let newPaxAdults = r.pax_adults;
          let newPaxKids = r.pax_kids;
          let newGem = r.gem_name;
          let newMeal = r.meal_plan;
          let newDates = r.stay_dates;
          let newPref = r.preferences;

          // LOGIC: Shift Status forward
          if (r.status === 'DEP' || r.status === 'VM/VAC') {
              // Guest left -> Now Vacant
              newStatus = 'VAC';
              newGuest = '';
              newPaxAdults = 0;
              newPaxKids = 0;
              newGem = '';
              newMeal = '';
              newDates = '';
              newPref = ''; // Clear pref for vacant room
          } else if (r.status === 'ARR' || r.status === 'VM/ARR' || r.status === 'DEP/ARR') {
              // Arrived yesterday -> Occupied today
              newStatus = 'OCC';
          } 
          // 'OCC' stays 'OCC'
          // 'VAC' stays 'VAC'

          // Don't carry over rows that became VAC to save DB space? 
          // Actually, strict structure requires 1-97, but DB only stores occupied usually.
          // Let's stick to inserting everything to be safe, or just occupied.
          // For cleanliness, we insert the calculated state.

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
              remarks: '', // Clear daily remarks
              preferences: newPref
          };
      });

      // 3. Database Update
      // First, clear today's existing data (if any re-run)
      await supabase.from('hsk_daily_summary').delete().eq('report_date', selectedDate);
      
      // Insert new
      const { error } = await supabase.from('hsk_daily_summary').insert(newDayData);

      if (error) {
          alert("Error generating data: " + error.message);
      } else {
          // alert("Day generated successfully! Now you can import today's Arrival/Departure list.");
          fetchDailyData();
      }
      setIsRollingOver(false);
  };

  // --- 3. FILE UPLOAD & PARSE ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);

    try {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const data = evt.target?.result;
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          
          processExcelData(rows);
        };
        reader.readAsArrayBuffer(file);
    } catch (err) { 
        alert("Error reading file"); 
        setIsProcessing(false); 
    }
    setFileInputKey(prev => prev + 1);
  };

  const processExcelData = (rows: any[][]) => {
      let headerIdx = -1;
      let colMap: any = {};
      let isOccupancyReport = false;

      // DETECT HEADER
      for(let i=0; i<Math.min(rows.length, 30); i++) {
          const rowStr = rows[i].join(' ').toUpperCase();
          if (rowStr.includes('OCCUPANCY REPORT')) {
              isOccupancyReport = true;
              continue; 
          }
          if(rowStr.includes('VILLA') && (rowStr.includes('GEM') || rowStr.includes('NAME') || rowStr.includes('NO.'))) {
              headerIdx = i;
              rows[i].forEach((cell: any, idx: number) => {
                  const c = String(cell).toUpperCase().trim();
                  if(c.includes('VILLA') || c === 'NO.') colMap.villa = idx;
                  else if(c === 'GEM') colMap.gem = idx;
                  else if(c === 'MP') colMap.mp = idx;
                  else if(c.includes('NAME') || c.includes('TITLE')) colMap.name = idx; 
                  else if(c.includes('ARR') && c.includes('DATE')) colMap.arrDate = idx;
                  else if(c.includes('DEP') && c.includes('DATE')) colMap.depDate = idx;
                  else if(c === 'ADULTS') colMap.adults = idx;
                  else if(c === 'CHILDREN') colMap.kids = idx;
              });
              break;
          }
      }

      if (isOccupancyReport && (headerIdx === -1 || colMap.villa === undefined)) {
          // Fallback map for known Occ Report structure
          headerIdx = 1; 
          colMap = { villa: 0, gem: 1, mp: 2, name: 3, adults: 6, kids: 7, arrDate: 19, depDate: 25 };
      }

      if (headerIdx === -1 || colMap.villa === undefined) {
          alert("Could not detect 'Villa' column.");
          setIsProcessing(false);
          return;
      }

      // PARSE
      const villaMap = new Map<string, GuestRecord>();
      
      for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const villa = row[colMap.villa];
          
          if (!villa || String(villa).toUpperCase().includes('NO') || isNaN(parseInt(villa))) continue;
          
          const vKey = parseInt(villa).toString();
          const cleanName = formatGuestName(row[colMap.name]);
          const gem = colMap.gem !== undefined ? row[colMap.gem] : '';
          const mp = colMap.mp !== undefined ? row[colMap.mp] : '';
          const ad = colMap.adults !== undefined ? (parseInt(row[colMap.adults]) || 0) : 0;
          const ch = colMap.kids !== undefined ? (parseInt(row[colMap.kids]) || 0) : 0;

          let dates = '';
          let status = 'OCC'; 
          
          if (colMap.arrDate !== undefined && colMap.depDate !== undefined) {
              const arr = row[colMap.arrDate];
              const dep = row[colMap.depDate];
              
              if(arr && dep) {
                  const fmt = (v: any) => {
                      try {
                          if (typeof v === 'number') { 
                              const d = new Date(Math.round((v - 25569) * 86400 * 1000));
                              return d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
                          }
                          const d = new Date(v);
                          if(isNaN(d.getTime())) return String(v);
                          return d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
                      } catch (e) { return ''; }
                  };
                  dates = `${fmt(arr)} - ${fmt(dep)}`;

                  const sDate = new Date(selectedDate).setHours(0,0,0,0);
                  const parseC = (v: any) => {
                      if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000));
                      return new Date(v);
                  }
                  const aDate = parseC(arr).setHours(0,0,0,0);
                  const dDate = parseC(dep).setHours(0,0,0,0);
                  
                  if (aDate === sDate && dDate === sDate) status = 'DEP/ARR';
                  else if (aDate === sDate) status = 'ARR';
                  else if (dDate === sDate) status = 'DEP';
              }
          }

          if (villaMap.has(vKey)) {
              const existing = villaMap.get(vKey)!;
              if (cleanName && !existing.guest_name.includes(cleanName)) {
                  existing.guest_name += ` & ${cleanName}`;
              }
              existing.pax_adults += ad;
              existing.pax_kids += ch;
          } else {
              villaMap.set(vKey, {
                  report_date: selectedDate,
                  villa_number: vKey,
                  status: status,
                  guest_name: cleanName,
                  pax_adults: ad,
                  pax_kids: ch,
                  gem_name: gem,
                  meal_plan: mp,
                  stay_dates: dates,
                  remarks: '',
                  preferences: ''
              });
          }
      }
      
      const newRecords = Array.from(villaMap.values());
      if (newRecords.length === 0) {
          alert(`0 records found. Debug: HeaderIdx=${headerIdx}`);
          setIsProcessing(false);
          return;
      }

      calculateDiff(newRecords);
      setIsProcessing(false);
  };

  // --- 4. COMPARE ---
  const calculateDiff = (newRecords: GuestRecord[]) => {
      const diffs: ChangeLog[] = [];
      const currentMap = new Map(masterList.map(r => [r.villa_number, r]));

      newRecords.forEach(newRec => {
          const oldRec = currentMap.get(newRec.villa_number);
          
          const oldName = (oldRec?.guest_name || '').trim();
          const newName = (newRec.guest_name || '').trim();
          const oldStatus = oldRec?.status || 'VAC';
          const newStatus = newRec.status || 'VAC';
          
          if (oldStatus !== newStatus || oldName !== newName) {
              let type: ChangeLog['type'] = 'CHANGE';
              if (oldStatus === 'VAC' && newStatus !== 'VAC') type = 'NEW';
              if (oldStatus !== 'VAC' && newStatus === 'VAC') type = 'DEPARTURE';

              diffs.push({
                  villa: newRec.villa_number,
                  type: type,
                  oldGuest: oldName,
                  newGuest: newName,
                  oldStatus: oldStatus,
                  newStatus: newStatus
              });
          }
      });

      setChanges(diffs);
      setPendingData(newRecords);
      setDiffModalOpen(true);
  };

  // --- 5. APPROVE ---
  const handleApproveUpdate = async () => {
      setIsProcessing(true);
      
      const prefMap = new Map(masterList.map(r => [r.villa_number, r.preferences || '']));
      
      const finalInsert = pendingData.map(r => ({
          ...r,
          preferences: prefMap.get(r.villa_number) || r.preferences || ''
      }));

      await supabase.from('hsk_daily_summary').delete().eq('report_date', selectedDate);
      const { error } = await supabase.from('hsk_daily_summary').insert(finalInsert);
      
      if (!error) {
          fetchDailyData();
      } else {
          alert("❌ Error: " + error.message);
      }
      
      setDiffModalOpen(false);
      setIsProcessing(false);
  };

  // --- EXPORTS ---
  const exportPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const splitIndex = Math.ceil(TOTAL_VILLAS / 2);
    
    doc.setFillColor(109, 33, 88);
    doc.rect(0, 0, 210, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("HOUSEKEEPING SUMMARY", 10, 10);
    doc.setFontSize(10);
    doc.text(new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'long' }), 195, 10, { align: 'right' });

    const leftList = masterList.slice(0, splitIndex);
    const rightList = masterList.slice(splitIndex);
    const combinedRows = [];
    
    for(let i=0; i < Math.max(leftList.length, rightList.length); i++) {
        const L = leftList[i] || {};
        const R = rightList[i] || {};
        
        const getShortName = (n: string) => n ? n.split(',')[0].substring(0, 20) : '';

        combinedRows.push([
            L.villa_number || '', L.status || '', getShortName(L.guest_name), L.pax_adults ? `${L.pax_adults}` : '', '',
            R.villa_number || '', R.status || '', getShortName(R.guest_name), R.pax_adults ? `${R.pax_adults}` : ''
        ]);
    }

    autoTable(doc, {
        head: [['No', 'Stat', 'Guest', 'Px', '', 'No', 'Stat', 'Guest', 'Px']],
        body: combinedRows,
        startY: 18,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1, valign: 'middle', lineWidth: 0.1 },
        headStyles: { fillColor: [240, 240, 240], textColor: [50, 50, 50], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 7, fontStyle: 'bold', halign: 'center' }, 1: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 45 }, 3: { cellWidth: 7, halign: 'center' }, 4: { cellWidth: 2 }, 5: { cellWidth: 7, fontStyle: 'bold', halign: 'center' }, 6: { cellWidth: 10, halign: 'center' }, 7: { cellWidth: 45 }, 8: { cellWidth: 7, halign: 'center' } },
        margin: { left: 10, right: 10 }
    });
    doc.save(`HK_Summary_${selectedDate}.pdf`);
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    const payload = { ...editingRecord, report_date: selectedDate };
    delete payload.id;
    if (editingRecord.id) await supabase.from('hsk_daily_summary').update(payload).eq('id', editingRecord.id);
    else await supabase.from('hsk_daily_summary').insert(payload);
    setIsEditOpen(false);
    fetchDailyData();
  };

  const changeDate = (days: number) => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      setSelectedDate(`${y}-${m}-${dy}`);
  };

  const getStatusColor = (s: string) => {
      const st = s?.toUpperCase() || 'VAC';
      if(st.includes('OCC')) return 'text-emerald-700 bg-emerald-50';
      if(st.includes('ARR')) return 'text-blue-700 bg-blue-50';
      if(st.includes('DEP')) return 'text-rose-700 bg-rose-50';
      if(st === 'VAC') return 'text-slate-300';
      if(st === 'TMA') return 'text-amber-700 bg-amber-50';
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
              accept=".xlsx,.csv" 
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
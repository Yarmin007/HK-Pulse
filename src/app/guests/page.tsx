"use client";
import React, { useState, useEffect } from 'react';
import { 
  Edit3, X, ChevronLeft, ChevronRight,
  FileSpreadsheet, Printer, Heart, ArrowRight, AlertTriangle, CheckCircle, Loader2, RotateCw, FileText, Clock, Users, Briefcase, Calendar
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

// --- HELPERS ---

const normalizeVilla = (raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw).trim();
    // Match only numeric part (e.g. "Villa 10" -> "10", "01" -> "1")
    const match = str.match(/^(\d{1,3})$/); 
    if (!match) return null;
    return parseInt(match[0], 10).toString();
};

const parseAnyDate = (val: any) => {
    if (!val) return null;
    // Excel Serial
    if (typeof val === 'number' && val > 35000) {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    // Text Date
    if (typeof val === 'string') {
        const clean = val.trim().toUpperCase().split(' ')[0]; // Remove time
        const parts = clean.split(/[-/]/);
        if (parts.length === 3) {
            let d = parts[0].padStart(2, '0');
            let mStr = parts[1];
            let y = parts[2];
            if (y.length === 2) y = "20" + y;
            const months: {[key:string]: string} = {
                'JAN':'01', 'FEB':'02', 'MAR':'03', 'APR':'04', 'MAY':'05', 'JUN':'06',
                'JUL':'07', 'AUG':'08', 'SEP':'09', 'OCT':'10', 'NOV':'11', 'DEC':'12'
            };
            const m = months[mStr] || (parseInt(mStr) < 13 ? mStr.padStart(2,'0') : null);
            if (m && !isNaN(Number(d)) && !isNaN(Number(y))) {
                return `${y}-${m}-${d}`;
            }
        }
    }
    return null;
};

const extractTime = (val: any) => {
    if (!val) return "";
    const str = String(val).trim();
    const matchColon = str.match(/(\d{1,2}[:.]\d{2})/);
    if (matchColon) return matchColon[1].replace('.', ':');
    if (str.match(/^\d{4}$/)) return str.slice(0,2) + ":" + str.slice(2);
    return "";
};

const formatGuestName = (rawName: string, rawTitle: string = "", rawAgeNote: any = null) => {
  if (!rawName) return "";
  let name = String(rawName).trim();
  const upper = name.toUpperCase();
  let title = String(rawTitle || "").trim();
  
  if (upper.includes("ALFAALILA")) { title = "Ms"; name = name.replace(/ALFAALILA/ig, ""); }
  else if (upper.includes("ALFAALIL")) { title = "Mr"; name = name.replace(/ALFAALIL/ig, ""); }
  else if (upper.includes("KOKKO")) { title = "Mstr/Miss"; name = name.replace(/KOKKO/ig, ""); }

  let age = "";
  const nameAgeMatch = name.match(/(\d+)\s*(Y|YR|YRS)/i);
  if (nameAgeMatch) {
      age = nameAgeMatch[1];
      name = name.replace(nameAgeMatch[0], ""); 
  }
  if (!age && rawAgeNote) {
      const noteMatch = String(rawAgeNote).match(/(\d+)\s*(Y|YR|YRS|AP|AG)/i);
      if (noteMatch) age = noteMatch[1];
      else if (String(rawAgeNote).match(/^\d+$/)) age = String(rawAgeNote);
  }

  name = name.replace(/[^a-zA-Z\s,]/g, "").replace(/\s+/g, " ").trim();
  if (name.includes(',')) {
      const [last, first] = name.split(',');
      name = `${first.trim()} ${last.trim()}`;
  }
  name = name.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  let final = name;
  if (title && !final.toLowerCase().startsWith(title.toLowerCase())) final = `${title} ${final}`;
  if (age) final += ` (${age} yrs)`;

  return final;
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
  arrival_time?: string;
  departure_time?: string;
};

type ChangeLog = {
    villa: string;
    type: 'NEW' | 'CHANGE' | 'DEPARTURE' | 'ARRIVAL' | 'SYNC' | 'TMA' | 'DAY USE';
    oldGuest: string;
    newGuest: string;
    oldStatus: string;
    newStatus: string;
};

type MemoStats = {
    fileDate: string; 
    quote: string;
    dailyOcc: string;
    guestInHouse: string;
    children: string;
    arrVillas: string;
    depVillas: string;
    moveVillas: string;
    occVillas: string;
    instructions: string[];
};

export default function HousekeepingSummaryPage() {
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [masterList, setMasterList] = useState<GuestRecord[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0); 
  
  const [memoStats, setMemoStats] = useState<MemoStats | null>(null);
  const [showMemoModal, setShowMemoModal] = useState(false);

  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [changes, setChanges] = useState<ChangeLog[]>([]);
  const [pendingData, setPendingData] = useState<GuestRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRollingOver, setIsRollingOver] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GuestRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'prefs'>('details');

  useEffect(() => {
    fetchDailyData();
  }, [selectedDate]);

  const fetchDailyData = async () => {
    const { data: dbRecords, error } = await supabase
      .from('hsk_daily_summary')
      .select('*')
      .eq('report_date', selectedDate);

    if (error) console.error(error);

    const fullList: GuestRecord[] = [];
    for (let i = 1; i <= TOTAL_VILLAS; i++) {
      const villaNum = i.toString();
      const match = dbRecords?.find(r => normalizeVilla(r.villa_number) === villaNum);
      if (match) {
        fullList.push({ ...match, villa_number: villaNum });
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
          preferences: '',
          arrival_time: '',
          departure_time: ''
        });
      }
    }
    fullList.sort((a, b) => parseInt(a.villa_number) - parseInt(b.villa_number));
    setMasterList(fullList);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    reader.onload = (evt) => {
        try {
            const data = evt.target?.result;
            if (fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
                processInHouseList(data as string);
            } else {
                const wb = XLSX.read(data, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                processDailyMemo(rows);
            }
        } catch (err) {
            alert("Error reading file.");
            setIsProcessing(false);
        }
    };

    if (fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsBinaryString(file);
    }
    setFileInputKey(prev => prev + 1);
  };

  // --- PARSER A: TEXT FILE ---
  const processInHouseList = (text: string) => {
      const lines = text.split('\n');
      const newMap = new Map<string, GuestRecord>();

      masterList.forEach(r => newMap.set(r.villa_number, { 
          ...r, status: 'VAC', guest_name: '', pax_adults: 0, pax_kids: 0, gem_name: '', meal_plan: '', stay_dates: '', arrival_time: '', departure_time: '' 
      }));

      lines.forEach(line => {
          if (!line.trim() || line.startsWith('C9')) return; 
          const cols = line.split('\t');
          if (cols.length < 5) return;

          const villa = normalizeVilla(cols[0]); 
          if (!villa || !newMap.has(villa)) return;

          const rec = newMap.get(villa)!;
          const gem = cols[1]; 
          const meal = cols[2]; 
          const title = cols[3]; 
          const nameRaw = cols[4]; 
          const arrDateRaw = cols[17]; 
          const depDateRaw = cols[19]; 

          const fullName = formatGuestName(nameRaw, title);
          
          if (rec.guest_name) rec.guest_name += `, ${fullName}`;
          else {
              rec.guest_name = fullName;
              rec.gem_name = gem;
              rec.meal_plan = meal;
              const d1 = parseAnyDate(arrDateRaw);
              const d2 = parseAnyDate(depDateRaw);
              if (d1 && d2) rec.stay_dates = `${d1.slice(5).replace('-','/')} - ${d2.slice(5).replace('-','/')}`;
          }

          const t = title ? title.toUpperCase() : "";
          if (t.includes('MASTER') || t.includes('MISS') || t.includes('INF') || t.includes('BABY')) {
              rec.pax_kids += 1;
          } else {
              rec.pax_adults += 1;
          }

          const arrISO = parseAnyDate(arrDateRaw);
          const depISO = parseAnyDate(depDateRaw);
          
          if (arrISO === selectedDate) rec.status = 'ARR';
          else if (depISO === selectedDate) rec.status = 'DEP';
          else rec.status = 'OCC';
      });

      const newRecords = Array.from(newMap.values());
      calculateDiff(newRecords, 'SYNC'); 
      setIsProcessing(false);
  };

  // --- PARSER B: DYNAMIC HEADER MAPPING FOR MEMO ---
  const processDailyMemo = (rows: any[][]) => {
      const currentMap = new Map(masterList.map(r => [r.villa_number, { ...r }]));
      const diffs: ChangeLog[] = [];
      const stats: MemoStats = { fileDate:'', quote: '', dailyOcc: '', guestInHouse: '', children: '', arrVillas: '', depVillas: '', moveVillas: '', occVillas: '', instructions: [] };

      // --- 1. PRE-SCAN: Find Section Start Rows ---
      let idxMoves = -1, idxArr = -1, idxDep = -1;
      
      rows.forEach((row, i) => {
          const rowStr = row.map(c => String(c).toUpperCase()).join(' ');
          
          // Date Detection (Top of file)
          if (i < 10 && !stats.fileDate) {
              const dateMatch = rowStr.match(/(\d{1,2})[\/\s-](JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\/\s-](\d{2,4})/i);
              if (dateMatch) stats.fileDate = dateMatch[0];
          }

          if (rowStr.includes('ROOM MOVES')) idxMoves = i;
          else if (rowStr.includes('ARRIVALS') && !rowStr.includes('VS')) idxArr = i;
          else if (rowStr.includes('DEPARTURES')) idxDep = i;
      });

      // --- 2. COLUMN FINDER HELPER ---
      const findColumns = (startRow: number, scanLimit: number = 5) => {
          // Defaults
          let map = { villa: 1, toVilla: 2, name: 8, time: 10, date: 15 }; 
          
          for(let r = startRow; r < startRow + scanLimit && r < rows.length; r++) {
              const row = rows[r].map(c => String(c).toUpperCase().trim());
              // Look for "VILLA" or "NO"
              const vIdx = row.findIndex(c => c === 'VILLA' || c === 'VILLA NO' || c === 'NO');
              if (vIdx > -1) {
                  map.villa = vIdx;
                  // Try to find Name
                  const nIdx = row.findIndex(c => c.includes('NAME') || c.includes('GUEST'));
                  if (nIdx > -1) map.name = nIdx;
                  // Try to find TO (for moves)
                  const tIdx = row.findIndex(c => c === 'TO' || c.includes('TO VILLA'));
                  if (tIdx > -1) map.toVilla = tIdx;
                  return { map, headerRow: r };
              }
          }
          return { map, headerRow: startRow }; // Fallback to defaults
      };

      const getEndRow = (startIdx: number) => {
          const indices = [idxMoves, idxArr, idxDep].filter(i => i > startIdx).sort((a,b) => a-b);
          return indices[0] || rows.length;
      };

      // --- 3. PROCESS SECTIONS WITH DYNAMIC COLUMNS ---

      // >>> MOVES <<<
      if (idxMoves !== -1) {
          const { map } = findColumns(idxMoves); // Find where "VILLA" column is
          const endRow = getEndRow(idxMoves);
          let lastToVilla: string | null = null;

          for (let i = idxMoves + 1; i < endRow; i++) {
              const row = rows[i];
              if (!row || row.length === 0) { lastToVilla = null; continue; }
              const rowStr = row.map(c => String(c).toUpperCase()).join(' ');
              if (rowStr.includes('VILLA') || rowStr.includes('FROM')) continue; // Skip Header row

              const fromV = normalizeVilla(row[map.villa]);
              let toV = normalizeVilla(row[map.toVilla]); // Use detected column

              if (fromV && !toV && lastToVilla) toV = lastToVilla;
              if (toV) lastToVilla = toV;

              if (fromV && toV && currentMap.has(fromV) && currentMap.has(toV)) {
                  const fromRec = currentMap.get(fromV)!;
                  const toRec = currentMap.get(toV)!;
                  
                  const isDayUse = rowStr.includes('DAY USE') || rowStr.includes('D/U');
                  const isTMA = rowStr.includes('TMA') || rowStr.includes('SHUT');

                  let newStatus = 'OCC';
                  if (isTMA) newStatus = 'TMA';
                  else if (isDayUse) newStatus = 'DAY USE';

                  toRec.guest_name = fromRec.guest_name;
                  toRec.status = newStatus; 
                  toRec.preferences = fromRec.preferences;
                  
                  fromRec.guest_name = '';
                  fromRec.status = 'VAC';
                  
                  diffs.push({ villa: `${fromV} -> ${toV}`, type: isTMA ? 'TMA' : (isDayUse ? 'DAY USE' : 'CHANGE'), oldGuest: `Move from ${fromV}`, newGuest: toRec.guest_name, oldStatus: 'OCC', newStatus });
              }
          }
      }

      // >>> ARRIVALS <<<
      if (idxArr !== -1) {
          const { map } = findColumns(idxArr);
          const endRow = getEndRow(idxArr);

          for (let i = idxArr + 1; i < endRow; i++) {
              const row = rows[i];
              if (!row || row.length === 0) continue;
              const rowStr = row.map(c => String(c).toUpperCase()).join(' ');
              if (rowStr.includes('VILLA') || rowStr.includes('STATUS')) continue;

              const villa = normalizeVilla(row[map.villa]); // Use detected column
              if (!villa || !currentMap.has(villa)) continue;

              const record = currentMap.get(villa)!;
              const rawName = row[map.name];
              let cleanName = formatGuestName(String(rawName), "", row[12]); // Age usually around col 12

              if (!cleanName || cleanName.length < 2) continue;

              let timeFound = "";
              let futureDate = "";
              // Scan broadly for Time/Date
              for (let c = 5; c < row.length; c++) {
                  const val = row[c];
                  const t = extractTime(val);
                  if (t && !timeFound) timeFound = t;
                  const d = parseAnyDate(val);
                  if (d && d > selectedDate) futureDate = d;
              }

              const isTMA = rowStr.includes('TMA') || rowStr.includes('SHUT') || rowStr.includes('CREW');
              
              const oldStatus = record.status;
              record.guest_name = cleanName;
              record.status = isTMA ? 'TMA' : ((oldStatus === 'OCC' || oldStatus === 'DEP') ? 'DEP/ARR' : 'ARR');
              record.arrival_time = timeFound;
              
              if (futureDate) {
                  const arrShort = selectedDate.slice(5).replace('-','/');
                  const depShort = futureDate.slice(5).replace('-','/');
                  record.stay_dates = `${arrShort} - ${depShort}`;
              }

              diffs.push({ villa, type: isTMA ? 'TMA' : 'ARRIVAL', oldGuest: oldStatus, newGuest: cleanName, oldStatus, newStatus: record.status });
          }
      }

      // >>> DEPARTURES <<<
      if (idxDep !== -1) {
          const { map } = findColumns(idxDep);
          const endRow = getEndRow(idxDep);

          for (let i = idxDep + 1; i < endRow; i++) {
              const row = rows[i];
              if (!row || row.length === 0) continue;
              const rowStr = row.map(c => String(c).toUpperCase()).join(' ');
              if (rowStr.includes('VILLA')) continue;

              const villa = normalizeVilla(row[map.villa]);
              if (!villa || !currentMap.has(villa)) continue;

              const record = currentMap.get(villa)!;
              const oldStatus = record.status;
              if (!oldStatus.includes('DEP')) {
                  record.status = oldStatus === 'ARR' ? 'DEP/ARR' : 'DEP';
                  for (let c = 5; c < row.length; c++) {
                      const t = extractTime(row[c]);
                      if (t) { record.departure_time = t; break; }
                  }
                  diffs.push({ villa, type: 'DEPARTURE', oldGuest: record.guest_name, newGuest: record.guest_name, oldStatus, newStatus: record.status });
              }
          }
      }

      // 4. STATS extraction (same as before)
      // ... (Keep existing stats logic)

      setMemoStats(stats);
      setChanges(diffs);
      setPendingData(Array.from(currentMap.values()));
      setDiffModalOpen(true);
      setIsProcessing(false);
  };

  const calculateDiff = (newRecords: GuestRecord[], mode: 'NORMAL' | 'SYNC' = 'NORMAL') => {
      const diffs: ChangeLog[] = [];
      const currentMap = new Map(masterList.map(r => [r.villa_number, r]));

      newRecords.forEach(newRec => {
          const oldRec = currentMap.get(newRec.villa_number);
          if (!oldRec) return;
          if (oldRec.status !== newRec.status || oldRec.guest_name !== newRec.guest_name) {
              diffs.push({
                  villa: newRec.villa_number,
                  type: mode === 'SYNC' ? 'SYNC' : (oldRec.status === 'VAC' ? 'ARRIVAL' : 'CHANGE'),
                  oldGuest: oldRec.guest_name || 'Vacant',
                  newGuest: newRec.guest_name || 'Vacant',
                  oldStatus: oldRec.status,
                  newStatus: newRec.status
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
      const payload = pendingData.map(r => { 
          const { id, ...rest } = r; 
          return {
              ...rest,
              report_date: selectedDate,
              arrival_time: rest.arrival_time || '',
              departure_time: rest.departure_time || ''
          };
      });
      await supabase.from('hsk_daily_summary').insert(payload);
      fetchDailyData();
      setDiffModalOpen(false);
      setIsProcessing(false);
  };

  const handleRollOver = async () => {
      if(!confirm(`Overwrite ${selectedDate} with previous day's data?`)) return;
      setIsRollingOver(true);
      const { data: recentRecords } = await supabase.from('hsk_daily_summary').select('*').lt('report_date', selectedDate).order('report_date', { ascending: false }).limit(200);
      if (!recentRecords || recentRecords.length === 0) { alert("No history found."); setIsRollingOver(false); return; }
      const lastDate = recentRecords[0].report_date;
      const sourceData = recentRecords.filter(r => r.report_date === lastDate);
      const newDayData = sourceData.map(r => {
          let newStatus = 'VAC';
          if (r.status.includes('ARR') || r.status === 'OCC') newStatus = 'OCC';
          else if (r.status === 'DEP') newStatus = 'VAC';
          else if (r.status === 'TMA') newStatus = 'TMA'; 
          else if (r.status === 'DAY USE') newStatus = 'VAC'; 
          let newGuest = (newStatus === 'VAC') ? '' : r.guest_name;
          return {
              report_date: selectedDate, villa_number: r.villa_number, status: newStatus, guest_name: newGuest,
              pax_adults: (newStatus === 'VAC') ? 0 : r.pax_adults, pax_kids: (newStatus === 'VAC') ? 0 : r.pax_kids,
              gem_name: r.gem_name, meal_plan: r.meal_plan, stay_dates: (newStatus === 'VAC') ? '' : r.stay_dates,
              remarks: '', preferences: r.preferences, arrival_time: '', departure_time: ''
          };
      });
      await supabase.from('hsk_daily_summary').delete().eq('report_date', selectedDate);
      await supabase.from('hsk_daily_summary').insert(newDayData);
      fetchDailyData();
      setIsRollingOver(false);
  };

  const exportPDF = () => {
      const doc = new jsPDF('p', 'mm', 'a4');
      autoTable(doc, { head: [['Villa', 'Status', 'Guest', 'Pax', 'GEM']], body: masterList.map(r => [r.villa_number, r.status, r.guest_name, r.pax_adults+r.pax_kids, r.gem_name]) });
      doc.save(`HK_Summary_${selectedDate}.pdf`);
  };
  
  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    const { id, ...payload } = editingRecord;
    const { error } = id ? await supabase.from('hsk_daily_summary').update(payload).eq('id', id) : await supabase.from('hsk_daily_summary').insert(payload);
    if (!error) { setIsEditOpen(false); fetchDailyData(); }
  };

  const getStatusColor = (s: string) => {
      const st = s?.toUpperCase() || 'VAC';
      if(st.includes('DEP') && st.includes('ARR')) return 'text-purple-700 bg-purple-50';
      if(st === 'TMA') return 'text-orange-700 bg-orange-50'; 
      if(st === 'DAY USE') return 'text-amber-700 bg-amber-50'; 
      if(st.includes('OCC')) return 'text-emerald-700 bg-emerald-50';
      if(st.includes('ARR')) return 'text-blue-700 bg-blue-50';
      if(st.includes('DEP')) return 'text-rose-700 bg-rose-50';
      return 'text-slate-300';
  };

  const changeDate = (days: number) => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      setSelectedDate(`${y}-${m}-${dy}`);
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
                {memoStats?.fileDate && <span className="ml-2 text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px]">File: {memoStats.fileDate}</span>}
             </p>
           </div>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronLeft size={16}/></button>
              <span className="px-4 text-xs font-bold text-slate-600 w-24 text-center">{new Date(selectedDate).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})}</span>
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronRight size={16}/></button>
           </div>
           
           <button onClick={handleRollOver} disabled={isRollingOver} className="flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 hover:bg-amber-100 px-4 py-2 rounded-lg text-xs font-bold transition-all">
                {isRollingOver ? <Loader2 size={16} className="animate-spin"/> : <RotateCw size={16}/>} Roll Over
           </button>

           {memoStats && (
               <button onClick={() => setShowMemoModal(true)} className="flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-lg text-xs font-bold transition-all">
                   <FileText size={16}/> Memo Info
               </button>
           )}

           <input key={fileInputKey} type="file" id="fileInput" className="hidden" accept=".xlsx,.xls,.xlsm,.csv,.txt" onChange={handleFileUpload} />
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
                <th className="py-3 px-4 w-32 text-right">Time</th>
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
                        <span className={`text-xs font-bold ${row.status === 'VAC' ? 'text-slate-200' : 'text-slate-700'} group-hover:text-[#6D2158] transition-colors leading-relaxed`}>{row.guest_name || '-'}</span>
                        {row.preferences && (<div className="flex items-center gap-1 mt-1 text-[9px] text-rose-500 font-bold"><Heart size={8} fill="currentColor"/> Note</div>)}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-center">{row.pax_adults > 0 && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{row.pax_adults + row.pax_kids}</span>}</td>
                  <td className="py-2 px-4 text-[10px] font-bold text-slate-500 uppercase">{row.gem_name}</td>
                  <td className="py-2 px-4 text-[10px] text-slate-500 font-medium">{row.meal_plan}</td>
                  <td className="py-2 px-4 text-right text-[10px] font-mono text-slate-400">{row.stay_dates}</td>
                  <td className="py-2 px-4 text-right text-[10px] font-mono text-slate-500">
                      {row.arrival_time && <span className="block text-emerald-600">Arr: {row.arrival_time}</span>}
                      {row.departure_time && <span className="block text-rose-600">Dep: {row.departure_time}</span>}
                  </td>
                  <td className="py-2 px-4 text-right"><button onClick={() => { setEditingRecord(row); setIsEditOpen(true); }} className="p-1.5 text-slate-300 hover:text-[#6D2158] hover:bg-[#6D2158]/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Edit3 size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MEMO MODAL */}
      {showMemoModal && memoStats && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden p-6 relative">
                  <button onClick={() => setShowMemoModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  <h3 className="text-xl font-bold text-[#6D2158] mb-4 flex items-center gap-2"><FileText/> Memo Insights</h3>
                  
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
                      <p className="text-xs font-bold text-slate-400 uppercase">Quote of the Day</p>
                      <p className="text-sm font-medium text-slate-700 italic">"{memoStats.quote}"</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="p-3 bg-blue-50 rounded-lg"><p className="text-[10px] font-bold text-blue-400 uppercase">Occupancy</p><p className="text-lg font-black text-blue-700">{memoStats.dailyOcc}</p></div>
                      <div className="p-3 bg-emerald-50 rounded-lg"><p className="text-[10px] font-bold text-emerald-400 uppercase">In House</p><p className="text-lg font-black text-emerald-700">{memoStats.guestInHouse} <span className="text-xs text-emerald-500 font-medium">({memoStats.children} Kids)</span></p></div>
                      <div className="p-3 bg-purple-50 rounded-lg"><p className="text-[10px] font-bold text-purple-400 uppercase">Arrivals</p><p className="text-lg font-black text-purple-700">{memoStats.arrVillas}</p></div>
                      <div className="p-3 bg-rose-50 rounded-lg"><p className="text-[10px] font-bold text-rose-400 uppercase">Departures</p><p className="text-lg font-black text-rose-700">{memoStats.depVillas}</p></div>
                  </div>

                  {memoStats.instructions.length > 0 && (
                      <div>
                          <p className="text-xs font-bold text-slate-400 uppercase mb-2">Special Instructions</p>
                          <ul className="list-disc pl-4 space-y-1 text-xs font-medium text-slate-600">
                              {memoStats.instructions.map((inst, i) => <li key={i}>{inst}</li>)}
                          </ul>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* CHANGES MODAL & EDIT MODAL (Keep Existing) */}
      {diffModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
              <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {changes.length > 0 ? <AlertTriangle className="text-amber-500"/> : <CheckCircle className="text-emerald-500"/>}
                        {changes[0]?.type === 'SYNC' ? 'Full Sync Detected' : 'Review Updates'}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                          {changes.length === 0 ? "No updates detected." : `Found ${changes.length} changes to apply.`}
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
                                              c.type === 'SYNC' ? 'bg-purple-100 text-purple-700' :
                                              c.type === 'ARRIVAL' ? 'bg-blue-100 text-blue-700' :
                                              c.type === 'DEPARTURE' ? 'bg-rose-100 text-rose-700' :
                                              c.type === 'TMA' ? 'bg-orange-100 text-orange-700' :
                                              c.type === 'DAY USE' ? 'bg-amber-100 text-amber-700' :
                                              'bg-emerald-100 text-emerald-700'
                                          }`}>{c.type}</span>
                                      </td>
                                      <td className="p-4 text-slate-500">
                                          <div className="text-xs">{c.oldGuest ? c.oldGuest.substring(0, 15) : 'Vacant'}</div>
                                          <div className="text-[10px] font-bold uppercase opacity-50">{c.oldStatus}</div>
                                      </td>
                                      <td className="p-4 text-slate-300"><ArrowRight size={16}/></td>
                                      <td className="p-4 text-slate-800 font-medium">
                                          <div className="text-xs">{c.newGuest ? c.newGuest.substring(0, 30) : 'Vacant'}</div>
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
                        <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Guest Names (Group)</label><textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold h-24 resize-none" value={editingRecord.guest_name} onChange={e => setEditingRecord({...editingRecord, guest_name: e.target.value})}/></div>
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
"use client";
import React, { useState, useEffect } from 'react';
import { 
  Calendar, Search, Edit3, ArrowRightLeft, 
  X, Copy, Loader2, FileDown, ChevronLeft, ChevronRight,
  User, Baby, FileSpreadsheet, Download
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- CONFIGURATION ---
const TOTAL_VILLAS = 97;

const getVillaCategory = (num: number) => {
  if (num >= 1 && num <= 20) return "Water Villa";
  if (num >= 21 && num <= 40) return "Beach Villa";
  if (num >= 41 && num <= 60) return "Ocean Pool";
  if (num >= 61 && num <= 80) return "Family Villa";
  return "Reserve";
};

// --- NAME FORMATTER ---
const formatGuestName = (rawName: string, rawTitle?: string) => {
  if (!rawName) return "";
  let name = String(rawName).trim();

  // 1. Handle "Lastname, Firstname" (Guest List)
  if (name.includes(',')) {
    const parts = name.split(',');
    if (parts.length >= 2) {
      const firstName = parts[1].trim(); 
      // Ensure title has a dot if it exists
      const title = rawTitle ? rawTitle.replace(/\.?$/, '. ') : ''; 
      return `${title}${firstName}`;
    }
  }

  // 2. Handle "Mr.Name/Ms.Name" (Daily Summary) cleanup
  return name
    .replace(/Alfaalil\s+/gi, "Mr. ")
    .replace(/Alfaalila\s+/gi, "Ms. ")
    .replace(/Kokko\s+/gi, "Kid ")
    .replace(/\//g, " / ");
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
};

export default function GuestListPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [masterList, setMasterList] = useState<GuestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Import/Export
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [parsedData, setParsedData] = useState<any[]>([]); 
  const [isProcessing, setIsProcessing] = useState(false);

  // Modals
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GuestRecord | null>(null);
  
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferData, setTransferData] = useState<{from: string, to: string, guest: string} | null>(null);

  useEffect(() => {
    fetchDailyData();
  }, [selectedDate]);

  // --- 1. FETCH & MERGE ---
  const fetchDailyData = async () => {
    setIsLoading(true);
    
    const { data: dbRecords } = await supabase
      .from('hsk_daily_summary')
      .select('*')
      .eq('report_date', selectedDate);

    const fullList: GuestRecord[] = [];
    
    for (let i = 1; i <= TOTAL_VILLAS; i++) {
      const villaNum = i.toString();
      // Handle duplicates (e.g. Day Use DEP/ARR) by prioritizing OCC/ARR
      const matches = dbRecords?.filter(r => r.villa_number === villaNum) || [];
      
      let primary = null;
      if (matches.length > 0) {
          // Priority: OCC > ARR > DEP > VAC
          primary = matches.find(r => r.status === 'OCC') || 
                    matches.find(r => r.status === 'ARR') || 
                    matches[0];
      }

      if (primary) {
        fullList.push(primary);
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
          remarks: ''
        });
      }
    }
    
    fullList.sort((a, b) => parseInt(a.villa_number) - parseInt(b.villa_number));
    setMasterList(fullList);
    setIsLoading(false);
  };

  // --- 2. SMART EXCEL IMPORT (HEADER DETECTION) ---
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
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          
          // 1. Find Header Row & Map Columns
          let headerIdx = -1;
          let colMap: any = {};
          
          for(let i=0; i<Math.min(rows.length, 20); i++) {
              const rowStr = rows[i].join(' ').toUpperCase();
              if(rowStr.includes('VILLA') || rowStr.includes('NO.')) {
                  headerIdx = i;
                  // Build Map
                  rows[i].forEach((cell: any, idx: number) => {
                      const c = String(cell).toUpperCase().trim();
                      if(c.includes('VILLA') || c === 'NO.') colMap.villa = idx;
                      else if(c === 'GEM' || c === 'BUTLER') colMap.gem = idx;
                      else if(c === 'STATUS') colMap.status = idx;
                      else if(c === 'NAME' || c.includes('GUEST')) colMap.name = idx;
                      else if(c === 'MP' || c.includes('MEAL')) colMap.mp = idx;
                      else if(c === 'TITLE') colMap.title = idx;
                      else if(c.includes('ARR') && c.includes('DATE')) colMap.arrDate = idx;
                      else if(c.includes('DEP') && c.includes('DATE')) colMap.depDate = idx;
                      else if(c === 'ADULTS' || c === 'PAX') colMap.adults = idx;
                      else if(c === 'CHILDREN' || c === 'KIDS') colMap.kids = idx;
                  });
                  break;
              }
          }

          if (headerIdx === -1 || colMap.villa === undefined) {
              alert("Could not find 'Villa' header. Please check Excel file.");
              setIsProcessing(false);
              return;
          }

          const extracted = [];
          for (let i = headerIdx + 1; i < rows.length; i++) {
              const row = rows[i];
              const villa = row[colMap.villa];
              if (!villa || isNaN(parseInt(villa))) continue;

              // Parse Fields
              const rawName = colMap.name !== undefined ? row[colMap.name] : '';
              const rawTitle = colMap.title !== undefined ? row[colMap.title] : '';
              const gem = colMap.gem !== undefined ? row[colMap.gem] : '';
              const mp = colMap.mp !== undefined ? row[colMap.mp] : '';
              const statusRaw = colMap.status !== undefined ? row[colMap.status] : '';
              
              // Pax
              const ad = colMap.adults !== undefined ? (parseInt(row[colMap.adults]) || 0) : 0;
              const ch = colMap.kids !== undefined ? (parseInt(row[colMap.kids]) || 0) : 0;

              // Dates & Status Calculation
              let status = statusRaw || 'OCC';
              let dates = '';
              
              if (colMap.arrDate !== undefined && colMap.depDate !== undefined) {
                  const arr = row[colMap.arrDate];
                  const dep = row[colMap.depDate];
                  
                  // Simple string check for dates (Excel dates can be complex, assuming strings/formatted for now)
                  // Enhanced Logic: If dates match selectedDate, set ARR/DEP
                  if (arr && String(arr).includes(selectedDate)) status = 'ARR';
                  if (dep && String(dep).includes(selectedDate)) {
                      status = status === 'ARR' ? 'DEP/ARR' : 'DEP';
                  }
                  if(arr && dep) dates = `${arr} - ${dep}`;
              }

              extracted.push({
                  villa_number: villa.toString(),
                  status: status,
                  guest_name: formatGuestName(rawName, rawTitle),
                  pax_adults: ad + ch, // Total Pax
                  pax_kids: ch,
                  gem_name: gem,
                  meal_plan: mp,
                  stay_dates: dates,
                  remarks: ''
              });
          }
          setParsedData(extracted);
          setImportText(`Ready to import ${extracted.length} rows.`);
        };
        reader.readAsArrayBuffer(file);
    } catch (err) { alert("Error reading file"); }
    setIsProcessing(false);
  };

  const handleConfirmImport = async () => {
      if(parsedData.length === 0) return;
      setIsLoading(true);
      await supabase.from('hsk_daily_summary').delete().eq('report_date', selectedDate);
      
      // Filter out invalid rows before insert
      const toInsert = parsedData.map(r => ({ ...r, report_date: selectedDate }));
      
      await supabase.from('hsk_daily_summary').insert(toInsert);
      setIsImportOpen(false);
      fetchDailyData();
  };

  // --- 3. PDF EXPORT ---
  const exportPDF = () => {
    const doc = new jsPDF();
    
    // Nice Header
    doc.setFillColor(109, 33, 88); // #6D2158
    doc.rect(0, 0, 210, 20, 'F'); // Top bar
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text("Housekeeping Daily Summary", 14, 13);
    
    doc.setTextColor(100);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Report Date: ${selectedDate}`, 14, 28);

    const data = masterList
      .filter(r => r.status !== 'VAC') 
      .map(r => [
         r.villa_number, 
         r.status, 
         r.guest_name, 
         `${r.pax_adults} (${r.pax_kids} ch)`, 
         r.gem_name, 
         r.meal_plan
      ]);

    autoTable(doc, {
        head: [['Villa', 'Status', 'Guest Name', 'Pax', 'GEM', 'Meal']],
        body: data,
        startY: 32,
        theme: 'grid',
        headStyles: { fillColor: [109, 33, 88] },
        styles: { fontSize: 8, cellPadding: 2 }
    });
    doc.save(`HK_Summary_${selectedDate}.pdf`);
  };

  // --- 4. ACTIONS ---
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
      setSelectedDate(d.toISOString().split('T')[0]);
  };

  const getStatusStyle = (status: string) => {
    const s = status?.toUpperCase() || 'VAC';
    if (s === 'OCC') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (s === 'VAC') return 'text-slate-200 bg-slate-50/50';
    if (s.includes('ARR')) return 'bg-blue-50 text-blue-700 border-blue-100';
    if (s.includes('DEP')) return 'bg-rose-50 text-rose-700 border-rose-100';
    if (s === 'TMA') return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-slate-50 text-slate-600 border-slate-100';
  };

  const filteredList = masterList.filter(r => 
    r.villa_number.includes(searchTerm) || 
    r.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 pb-32 font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-4 gap-4 border-b border-slate-100 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#6D2158]">Guest List</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 flex items-center gap-2">
             <Calendar size={12}/> {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
           <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm h-8">
              <button onClick={() => changeDate(-1)} className="px-2 hover:bg-slate-50 text-slate-500 rounded-l-lg"><ChevronLeft size={14}/></button>
              <span className="px-3 text-[10px] font-bold text-slate-700">{new Date(selectedDate).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})}</span>
              <button onClick={() => changeDate(1)} className="px-2 hover:bg-slate-50 text-slate-500 rounded-r-lg"><ChevronRight size={14}/></button>
           </div>

           <button onClick={() => setIsImportOpen(true)} className="bg-white border border-slate-200 text-slate-600 px-3 h-8 rounded-lg text-[10px] font-bold shadow-sm hover:bg-slate-50 flex items-center gap-2">
              <FileSpreadsheet size={14}/> Import
           </button>
           <button onClick={exportPDF} className="bg-[#6D2158] text-white px-3 h-8 rounded-lg text-[10px] font-bold shadow-md hover:bg-[#5a1b49] flex items-center gap-2">
              <Download size={14}/> PDF
           </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/50 border-b border-slate-200">
            <tr>
              <th className="py-2 px-3 text-[9px] font-bold text-slate-400 uppercase w-14">Villa</th>
              <th className="py-2 px-3 text-[9px] font-bold text-slate-400 uppercase w-16">Status</th>
              <th className="py-2 px-3 text-[9px] font-bold text-slate-400 uppercase">Guest Name</th>
              <th className="py-2 px-3 text-[9px] font-bold text-slate-400 uppercase w-10">Pax</th>
              <th className="py-2 px-3 text-[9px] font-bold text-slate-400 uppercase w-24">GEM</th>
              <th className="py-2 px-3 text-[9px] font-bold text-slate-400 uppercase w-12">Meal</th>
              <th className="py-2 px-3 text-[9px] font-bold text-slate-400 uppercase w-20">Dates</th>
              <th className="py-2 px-3 text-right w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredList.map((row) => (
              <tr key={row.villa_number} className={`hover:bg-slate-50 group ${row.status === 'VAC' ? 'bg-slate-50/20' : ''}`}>
                
                <td className="py-1.5 px-3">
                   <div className="font-bold text-xs text-slate-700">{row.villa_number}</div>
                   <div className="text-[7px] font-bold text-slate-300 uppercase">{getVillaCategory(parseInt(row.villa_number)).split(' ')[0]}</div>
                </td>

                <td className="py-1.5 px-3">
                  <span className={`px-1.5 py-0.5 rounded-[3px] text-[8px] font-bold uppercase border ${getStatusStyle(row.status)}`}>
                    {row.status}
                  </span>
                </td>

                <td className="py-1.5 px-3">
                  <div className={`text-[11px] font-bold truncate ${row.status === 'VAC' ? 'text-slate-200' : 'text-slate-700'}`}>
                    {row.guest_name || '-'}
                  </div>
                </td>

                <td className="py-1.5 px-3 text-[10px] text-slate-500">
                  {row.pax_adults > 0 ? `${row.pax_adults}` : ''}
                </td>

                <td className="py-1.5 px-3 text-[10px] font-bold text-slate-500 uppercase truncate max-w-[100px]">
                  {row.gem_name}
                </td>

                <td className="py-1.5 px-3 text-[9px] font-bold text-slate-500">
                  {row.meal_plan}
                </td>

                <td className="py-1.5 px-3 text-[8px] font-mono text-slate-400 whitespace-nowrap overflow-hidden">
                  {row.stay_dates}
                </td>

                <td className="py-1.5 px-3 text-right">
                  <button onClick={() => { setEditingRecord(row); setIsEditOpen(true); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 text-slate-400 hover:text-[#6D2158] rounded">
                    <Edit3 size={12}/>
                  </button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* IMPORT MODAL */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-4">Import Excel</h3>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center mb-4 hover:bg-slate-50 relative">
                  <input type="file" accept=".xlsx" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                  <FileSpreadsheet className="mx-auto text-slate-300 mb-2"/>
                  <p className="text-xs font-bold text-slate-500">Click to upload Guest List or Daily Summary</p>
              </div>
              <div className="bg-slate-50 p-2 rounded mb-4 text-[10px] text-slate-500 font-mono overflow-hidden h-16">
                  {importText || 'Waiting for file...'}
              </div>
              <div className="flex gap-2">
                  <button onClick={handleConfirmImport} disabled={parsedData.length === 0} className="flex-1 bg-[#6D2158] text-white py-2 rounded-lg text-xs font-bold disabled:opacity-50">Confirm Import</button>
                  <button onClick={() => setIsImportOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-bold">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditOpen && editingRecord && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-4 text-[#6D2158]">Edit Villa {editingRecord.villa_number}</h3>
              <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[10px] font-bold text-slate-400">Status</label><select className="w-full p-2 border rounded text-xs font-bold" value={editingRecord.status} onChange={e => setEditingRecord({...editingRecord, status: e.target.value})}>{['VAC','OCC','ARR','DEP','DEP/ARR','TMA','H/U'].map(s=><option key={s}>{s}</option>)}</select></div>
                      <div><label className="text-[10px] font-bold text-slate-400">GEM</label><input className="w-full p-2 border rounded text-xs" value={editingRecord.gem_name} onChange={e => setEditingRecord({...editingRecord, gem_name: e.target.value})}/></div>
                  </div>
                  <div><label className="text-[10px] font-bold text-slate-400">Guest Name</label><input className="w-full p-2 border rounded text-sm font-bold" value={editingRecord.guest_name} onChange={e => setEditingRecord({...editingRecord, guest_name: e.target.value})}/></div>
                  <button onClick={handleSaveEdit} className="w-full bg-[#6D2158] text-white py-2 rounded-lg text-xs font-bold mt-2">Save</button>
                  <button onClick={() => setIsEditOpen(false)} className="w-full bg-slate-100 text-slate-500 py-2 rounded-lg text-xs font-bold">Cancel</button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
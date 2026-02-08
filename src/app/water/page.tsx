"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClipboardPaste, X, Check, ChevronLeft, ChevronRight, Loader2, Droplets, Activity, FileSpreadsheet, AlertCircle, Printer, Download, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- TYPES ---
type DailyRecord = {
  dateStr: string; 
  day: number;
  b1000_fnb_still: number; b1000_fnb_spk: number; b1000_ret_still: number; b1000_ret_spk: number; b1000_break: number;
  b500_hsk_still: number; b500_tropic_still: number; b500_ret_still: number; b500_break: number;
  b350_spa_still: number; b350_ws_still: number; b350_hsk_spk: number; b350_ret_still: number; b350_ret_spk: number; b350_break: number;
  b250_tma_still: number; b250_break: number; b200_break: number;
  [key: string]: any; 
};

interface ColumnConfig {
  key: keyof DailyRecord;
  bg?: string;
  isBreak?: boolean;
  dim?: boolean;
  end?: boolean;
}

const COLUMN_CONFIG: ColumnConfig[] = [
  { key: 'b1000_fnb_still' }, { key: 'b1000_fnb_spk' }, { key: 'b1000_ret_spk', dim: true }, { key: 'b1000_ret_still', dim: true }, { key: 'b1000_break', isBreak: true, end: true },
  { key: 'b500_hsk_still' }, { key: 'b500_tropic_still' }, { key: 'b500_ret_still', dim: true }, { key: 'b500_break', isBreak: true, end: true },
  { key: 'b350_spa_still' }, { key: 'b350_ws_still' }, { key: 'b350_hsk_spk' }, { key: 'b350_ret_still', dim: true }, { key: 'b350_ret_spk', dim: true }, { key: 'b350_break', isBreak: true, end: true },
  { key: 'b250_tma_still' }, { key: 'b250_break', isBreak: true }, { key: 'b200_break', isBreak: true, end: true },
];

const createDefaultRecord = (year: number, month: number, day: number): DailyRecord => ({
  dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, day: day,
  b1000_fnb_still: 0, b1000_fnb_spk: 0, b1000_ret_still: 0, b1000_ret_spk: 0, b1000_break: 0,
  b500_hsk_still: 0, b500_tropic_still: 0, b500_ret_still: 0, b500_break: 0,
  b350_spa_still: 0, b350_ws_still: 0, b350_hsk_spk: 0, b350_ret_still: 0, b350_ret_spk: 0, b350_break: 0,
  b250_tma_still: 0, b250_break: 0, b200_break: 0,
});

const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
const formatDateStr = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const getDailyStats = (r: DailyRecord) => {
  const prodStillL = (r.b1000_fnb_still * 1) + ((r.b500_hsk_still + r.b500_tropic_still) * 0.5) + ((r.b350_spa_still + r.b350_ws_still) * 0.35) + (r.b250_tma_still * 0.25);
  const prodSpkL = (r.b1000_fnb_spk * 1) + (r.b350_hsk_spk * 0.35);
  return { prodStillL, prodSpkL };
};

const hasRowData = (r: DailyRecord) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dateStr, day, ...nums } = r;
  return Object.values(nums).some(val => (val as number) > 0);
};

export default function WaterProductionPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [records, setRecords] = useState<DailyRecord[]>([]);
  
  // UI States
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedDate, setSavedDate] = useState(""); // Stores date string for prompt
  const [errorMessage, setErrorMessage] = useState("");
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirty = useRef(false);

  useEffect(() => { setIsMounted(true); }, []);

  // Fetch Data on Date Change
  useEffect(() => {
    if (isMounted) {
        isDirty.current = false;
        fetchMonthData(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, isMounted]);

  // --- AUTO SAVE LOGIC ---
  useEffect(() => {
    if (!isMounted || records.length === 0 || !isDirty.current) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    if (saveStatus === 'idle') {
        setSaveStatus("saving");
        autoSaveTimerRef.current = setTimeout(() => {
            saveToDatabase(records);
        }, 1500); 
    }
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, saveStatus]);

  // Pass date as argument to allow manual fetching
  const fetchMonthData = async (targetDate: Date) => {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const daysInMonth = getDaysInMonth(month, year);
    const skeleton = Array.from({ length: daysInMonth }, (_, i) => createDefaultRecord(year, month, i + 1));
    const startStr = formatDateStr(year, month, 1);
    const endStr = formatDateStr(year, month, daysInMonth);
    
    const { data, error } = await supabase.from('water_records').select('*').gte('date', startStr).lte('date', endStr);
    
    if (error) setErrorMessage("DB Connection Error: " + error.message);

    if (data) {
      data.forEach((row: any) => {
        const dayIndex = new Date(row.date).getDate() - 1;
        if (skeleton[dayIndex]) skeleton[dayIndex] = { ...skeleton[dayIndex], ...row }; 
      });
    }
    setRecords(skeleton);
    setSaveStatus("saved");
  };

  const saveToDatabase = async (dataToSave: DailyRecord[]) => {
    const payload = dataToSave.map(r => ({
        date: r.dateStr,
        b1000_fnb_still: r.b1000_fnb_still, b1000_fnb_spk: r.b1000_fnb_spk, b1000_ret_still: r.b1000_ret_still, b1000_ret_spk: r.b1000_ret_spk, b1000_break: r.b1000_break,
        b500_hsk_still: r.b500_hsk_still, b500_tropic_still: r.b500_tropic_still, b500_ret_still: r.b500_ret_still, b500_break: r.b500_break,
        b350_spa_still: r.b350_spa_still, b350_ws_still: r.b350_ws_still, b350_hsk_spk: r.b350_hsk_spk, b350_ret_still: r.b350_ret_still, b350_ret_spk: r.b350_ret_spk, b350_break: r.b350_break,
        b250_tma_still: r.b250_tma_still, b250_break: r.b250_break, b200_break: r.b200_break
    }));

    const { error } = await supabase.from('water_records').upsert(payload, { onConflict: 'date' });

    if (error) {
      console.error("Save Failed:", error);
      setErrorMessage("Save Failed: " + error.message);
      setSaveStatus("error");
    } else {
      isDirty.current = false;
      setSaveStatus("saved");
      setErrorMessage("");
    }
  };

  const handleChange = (dayIndex: number, field: string, value: string) => {
    isDirty.current = true;
    const val = parseInt(value) || 0;
    const newRecords = [...records];
    newRecords[dayIndex] = { ...newRecords[dayIndex], [field]: val };
    setRecords(newRecords);
  };

  const changeMonth = (offset: number) => {
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() + offset);
    setSelectedDate(d);
  };

  // --- ANALYTICS ---
  const stats = useMemo(() => {
    let totals = { 
        l_still: 0, l_spk: 0, bottles: 0, breakage: 0,
        stillDist: { fnb: 0, hsk: 0, spa: 0, ws: 0, tropic: 0, tma: 0 },
        spkDist: { fnb: 0, hsk: 0 }
    };

    records.forEach(r => {
      const fnbS = r.b1000_fnb_still * 1;
      const hskS = r.b500_hsk_still * 0.5;
      const tropicS = r.b500_tropic_still * 0.5;
      const spaS = r.b350_spa_still * 0.35;
      const wsS = r.b350_ws_still * 0.35;
      const tmaS = r.b250_tma_still * 0.25;

      const fnbSpk = r.b1000_fnb_spk * 1;
      const hskSpk = r.b350_hsk_spk * 0.35;

      totals.stillDist.fnb += fnbS;
      totals.stillDist.hsk += hskS;
      totals.stillDist.tropic += tropicS;
      totals.stillDist.spa += spaS;
      totals.stillDist.ws += wsS;
      totals.stillDist.tma += tmaS;

      totals.spkDist.fnb += fnbSpk;
      totals.spkDist.hsk += hskSpk;

      totals.l_still += fnbS + hskS + tropicS + spaS + wsS + tmaS;
      totals.l_spk += fnbSpk + hskSpk;
      
      totals.bottles += (r.b1000_fnb_still + r.b1000_fnb_spk + r.b500_hsk_still + r.b500_tropic_still + r.b350_spa_still + r.b350_ws_still + r.b350_hsk_spk + r.b250_tma_still);
      totals.breakage += (r.b1000_break + r.b500_break + r.b350_break + r.b250_break + r.b200_break);
    });
    return totals;
  }, [records]);

  // Chart Data
  const chartData = useMemo(() => {
    const totalS = stats.l_still || 1;
    const totalSpk = stats.l_spk || 1;
    
    const still = [
      { label: 'F&B', val: stats.stillDist.fnb, pct: (stats.stillDist.fnb / totalS) * 100, color: 'bg-emerald-500' },
      { label: 'HSK', val: stats.stillDist.hsk, pct: (stats.stillDist.hsk / totalS) * 100, color: 'bg-blue-500' },
      { label: 'SPA', val: stats.stillDist.spa, pct: (stats.stillDist.spa / totalS) * 100, color: 'bg-purple-500' },
      { label: 'WS', val: stats.stillDist.ws, pct: (stats.stillDist.ws / totalS) * 100, color: 'bg-cyan-500' },
      { label: 'Tropic', val: stats.stillDist.tropic, pct: (stats.stillDist.tropic / totalS) * 100, color: 'bg-teal-500' },
      { label: 'TMA', val: stats.stillDist.tma, pct: (stats.stillDist.tma / totalS) * 100, color: 'bg-amber-500' },
    ].filter(x => x.val > 0).sort((a,b) => b.val - a.val);

    const spk = [
      { label: 'F&B', val: stats.spkDist.fnb, pct: (stats.spkDist.fnb / totalSpk) * 100, color: 'bg-emerald-500' },
      { label: 'HSK', val: stats.spkDist.hsk, pct: (stats.spkDist.hsk / totalSpk) * 100, color: 'bg-blue-500' },
    ].filter(x => x.val > 0).sort((a,b) => b.val - a.val);

    return { still, spk };
  }, [stats]);

  const handleExportCSV = () => {
    const headers = [ "Date", "1000ML F&B Still", "1000ML F&B Spk", "1000ML Return Spk", "1000ML Return Still", "1000ML Breakage", "500ML HSK Still", "500ML Tropic", "500ML Return", "500ML Breakage", "350ML SPA", "350ML WaterSports", "350ML HSK Spk", "350ML Return Still", "350ML Return Spk", "350ML Breakage", "250ML TMA", "250ML Breakage", "200ML Breakage" ];
    const rows = records.map(r => [ r.dateStr, r.b1000_fnb_still, r.b1000_fnb_spk, r.b1000_ret_spk, r.b1000_ret_still, r.b1000_break, r.b500_hsk_still, r.b500_tropic_still, r.b500_ret_still, r.b500_break, r.b350_spa_still, r.b350_ws_still, r.b350_hsk_spk, r.b350_ret_still, r.b350_ret_spk, r.b350_break, r.b250_tma_still, r.b250_break, r.b200_break ]);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Water_Log_${selectedDate.toISOString().slice(0,7)}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  // --- SMART PARSER ---
  const handleParseAndApply = async () => {
    const lines = pasteText.split('\n').map(l => l.trim().toLowerCase());
    const dateLine = lines.find(l => l.includes('date'));
    let manualDateStr: string | null = null;
    let targetYear = 0;
    let targetMonth = 0;

    if (dateLine) {
        // Regex to find DD/MM/YYYY or DD-MM-YYYY
        const match = dateLine.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if (match) {
            const day = String(match[1]).padStart(2, '0');
            const month = String(match[2]).padStart(2, '0');
            let yearStr = match[3];
            if (yearStr.length === 2) yearStr = "20" + yearStr;
            
            // STRICT STRING CONSTRUCTION: YYYY-MM-DD
            manualDateStr = `${yearStr}-${month}-${day}`;
            
            targetYear = parseInt(yearStr);
            targetMonth = parseInt(month) - 1; 
        }
    }

    if (!manualDateStr) {
        alert("Could not find a valid date (DD/MM/YYYY) in the report.");
        return;
    }

    // 2. USE THE STRING FOR DATABASE ID
    const newRecord: any = { date: manualDateStr };
    let currentSection = "";

    lines.forEach(line => {
        const valMatch = line.match(/:?\s*(\d+)$/);
        const val = valMatch ? parseInt(valMatch[1]) : 0;
        
        if(line.includes("1000 ml") && !line.includes("breakage")) currentSection = "1000";
        else if(line.includes("500 ml") && !line.includes("breakage")) currentSection = "500";
        else if(line.includes("350 ml") && !line.includes("breakage")) currentSection = "350";
        else if(line.includes("seaplane") || line.includes("tma")) currentSection = "TMA";
        else if(line.includes("breakage")) currentSection = "BREAK";

        if (currentSection === "1000") {
            if (line.includes("still")) newRecord.b1000_fnb_still = val;
            if (line.includes("sparkling") && !line.includes("unused")) newRecord.b1000_fnb_spk = val;
            if (line.includes("unused") || line.includes("return")) {
                if(line.includes("sparkling")) newRecord.b1000_ret_spk = val;
                else newRecord.b1000_ret_still = val; 
            }
        } else if (currentSection === "500") {
            if (line.includes("still") && !line.includes("unused")) newRecord.b500_hsk_still = val;
            if (line.includes("tropic")) newRecord.b500_tropic_still = val;
            if (line.includes("unused") || line.includes("return")) newRecord.b500_ret_still = val;
        } else if (currentSection === "350") {
            if (line.includes("sparkling") && !line.includes("unused")) newRecord.b350_hsk_spk = val;
            if (line.includes("spa")) newRecord.b350_spa_still = val;
            if (line.includes("water") && line.includes("sports")) newRecord.b350_ws_still = val;
            if (line.includes("unused") || line.includes("return")) {
                 if(line.includes("sparkling")) newRecord.b350_ret_spk = val;
                 else newRecord.b350_ret_still = val;
            }
        } else if (currentSection === "TMA") { if (val > 0) newRecord.b250_tma_still = val; }
        else if (currentSection === "BREAK") {
            if (line.includes("1000")) newRecord.b1000_break = val;
            if (line.includes("500")) newRecord.b500_break = val;
            if (line.includes("350")) newRecord.b350_break = val;
        }
    });

    const { error } = await supabase.from('water_records').upsert(newRecord, { onConflict: 'date' });

    if (error) {
        alert("Failed to save paste data: " + error.message);
    } else {
        setIsPasteModalOpen(false);
        setPasteText("");
        
        // Show Popup with EXACT date used
        setSavedDate(manualDateStr || "");
        
        // Switch view to that month instantly
        setSelectedDate(new Date(targetYear, targetMonth, 1));
    }
  };

  if (!isMounted) return null;

  return (
    <div className="h-screen flex flex-col bg-white text-slate-900 font-sans text-xs print-area-wrapper">
      
      {/* ERROR POPUP */}
      {errorMessage && (
        <div className="bg-red-500 text-white text-center py-1 text-[10px] font-bold flex justify-center items-center gap-2 print:hidden">
            <AlertTriangle size={12}/> {errorMessage}
        </div>
      )}

      {/* DASHBOARD */}
      <div className="bg-white border-b border-slate-300 shadow-sm shrink-0 z-40 print:border-none print:shadow-none">
        <div className="px-6 py-4 flex justify-between items-center print:hidden">
            <div className="flex items-center gap-4">
                <div className="bg-[#6D2158] p-2.5 rounded-lg text-white shadow-md"><Droplets size={24} /></div>
                <div>
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">Water Production</h1>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                        <button onClick={() => changeMonth(-1)} className="hover:text-blue-600"><ChevronLeft size={16}/></button>
                        <span className="w-32 text-center">{selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                        <button onClick={() => changeMonth(1)} className="hover:text-blue-600"><ChevronRight size={16}/></button>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                {/* AUTO SAVE INDICATOR */}
                <div className="text-[10px] font-bold uppercase tracking-wider mr-2 min-w-[100px] text-right">
                    {saveStatus === 'saving' && <span className="text-blue-500 flex items-center justify-end gap-1"><Loader2 size={10} className="animate-spin"/> Saving...</span>}
                    {saveStatus === 'saved' && <span className="text-emerald-600 flex items-center justify-end gap-1"><Check size={10}/> Auto Saved</span>}
                    {saveStatus === 'error' && <span className="text-red-500">Not Saved</span>}
                </div>
                <button onClick={() => setIsPasteModalOpen(true)} className="btn-secondary"><ClipboardPaste size={16}/> Paste</button>
                <button onClick={handleExportCSV} className="btn-secondary"><Download size={16}/> CSV</button>
                <button onClick={() => window.print()} className="btn-secondary"><Printer size={16}/> Print</button>
            </div>
        </div>
        
        {/* DASHBOARD STATS & GRAPHS */}
        <div className="flex gap-6 px-6 py-4 bg-slate-50 border-t border-slate-200 print:bg-white print:border-none print:px-0 print:py-2">
            <div className="flex gap-3 print:hidden">
                <StatCard label="Total Production" val={stats.l_still.toFixed(0)} unit="L" color="text-blue-700" bg="bg-blue-100" />
                <StatCard label="Sparkling" val={stats.l_spk.toFixed(0)} unit="L" color="text-purple-700" bg="bg-purple-100" />
                <StatCard label="Bottles Filled" val={stats.bottles.toLocaleString()} unit="Qty" color="text-emerald-700" bg="bg-emerald-100" />
                <StatCard label="Breakage" val={stats.breakage} unit="Qty" color="text-red-700" bg="bg-red-100" />
            </div>
            
            {/* GRAPHS */}
            <div className="flex-1 flex gap-6 border-l border-slate-200 pl-6 print:border-none print:pl-0">
                {/* Still */}
                <div className="flex-1 flex flex-col justify-center gap-2">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400"><span>Still Breakdown</span></div>
                    <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex print:border print:border-slate-300">
                        {chartData.still.map((item, i) => (<div key={i} className={`h-full ${item.color} print:bg-slate-400`} style={{ width: `${item.pct}%` }}></div>))}
                    </div>
                    <div className="flex flex-wrap gap-2 text-[9px] font-bold text-slate-500">
                        {chartData.still.map((item, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${item.color} print:bg-slate-800`}></div>
                                {item.label} 
                                <span className="text-slate-400 font-normal">({item.pct.toFixed(0)}%)</span>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Sparkling */}
                <div className="flex-1 flex flex-col justify-center gap-2 border-l border-slate-200 pl-6 print:border-none">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400"><span>Sparkling Breakdown</span></div>
                    <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex print:border print:border-slate-300">
                        {chartData.spk.map((item, i) => (<div key={i} className={`h-full ${item.color} print:bg-slate-400`} style={{ width: `${item.pct}%` }}></div>))}
                    </div>
                    <div className="flex flex-wrap gap-2 text-[9px] font-bold text-slate-500">
                        {chartData.spk.map((item, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${item.color} print:bg-slate-800`}></div>
                                {item.label}
                                <span className="text-slate-400 font-normal">({item.pct.toFixed(0)}%)</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-auto bg-slate-100 p-4 print:p-0 print:bg-white print:overflow-visible print:w-full">
        <div className="bg-white shadow rounded-lg overflow-hidden border border-slate-300 print:shadow-none print:border-none print:w-full h-full flex flex-col">
            
            {/* PRINT HEADER ONLY */}
            <div className="hidden print:block mb-4">
                <h1 className="text-2xl font-bold text-black uppercase">Water Production Report</h1>
                <p className="text-sm text-black">{selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                <div className="flex gap-4 mt-2 text-xs font-bold border-b border-black pb-2">
                    <span>Total Production: {stats.l_still.toFixed(0)} L</span>
                    <span>Sparkling: {stats.l_spk.toFixed(0)} L</span>
                    <span>Bottles: {stats.bottles.toLocaleString()}</span>
                    <span>Breakage: {stats.breakage}</span>
                </div>
            </div>

            <div className="overflow-auto flex-1 print:overflow-visible">
                <table className="w-full table-fixed border-collapse text-[10px] print:text-[9px]">
                    <thead className="bg-slate-50 border-b-2 border-slate-300 print:bg-white print:border-black">
                        <tr>
                            <th rowSpan={3} className="sticky left-0 z-20 bg-slate-100 border-r border-slate-300 w-8 p-1 text-xs font-bold text-slate-500 uppercase print:bg-white print:border-black print:text-black">Day</th>
                            <GroupHeader label="1000 ML" color="bg-emerald-50 text-emerald-900 border-emerald-200" span={5} /><GroupHeader label="500 ML" color="bg-blue-50 text-blue-900 border-blue-200" span={4} /><GroupHeader label="350 ML" color="bg-purple-50 text-purple-900 border-purple-200" span={6} /><GroupHeader label="250 / 200 ML" color="bg-amber-50 text-amber-900 border-amber-200" span={3} />
                        </tr>
                        <tr className="text-[9px] font-bold text-slate-600 uppercase print:text-black">
                            <SubGroupHeader label="F&B" span={2} /><SubGroupHeader label="RETURN" span={2} dim /><SubGroupHeader label="BRK" span={1} end isRed />
                            <SubGroupHeader label="HSK" span={1} /><SubGroupHeader label="TROPIC" span={1} /><SubGroupHeader label="RETURN" span={1} dim /><SubGroupHeader label="BRK" span={1} end isRed />
                            <SubGroupHeader label="SPA" span={1} /><SubGroupHeader label="WS" span={1} /><SubGroupHeader label="HSK" span={1} /><SubGroupHeader label="RETURN" span={2} dim /><SubGroupHeader label="BRK" span={1} end isRed />
                            <SubGroupHeader label="TMA" span={1} /><SubGroupHeader label="BRK" span={2} end isRed />
                        </tr>
                        <tr className="text-[9px] font-bold text-slate-500 uppercase print:text-black">
                            <ColHeader label="STILL" /><ColHeader label="SPK" /><ColHeader label="SPK" dim /><ColHeader label="STILL" dim /><ColHeader label="-" brk end />
                            <ColHeader label="STILL" /><ColHeader label="TROPIC" /><ColHeader label="STILL" dim /><ColHeader label="-" brk end />
                            <ColHeader label="STILL" /><ColHeader label="STILL" /><ColHeader label="SPK" /><ColHeader label="STILL" dim /><ColHeader label="SPK" dim /><ColHeader label="-" brk end />
                            <ColHeader label="250" /><ColHeader label="250" brk /><ColHeader label="200" brk end />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 print:divide-black">
                        {records.map((r, i) => {
                            const isRowActive = hasRowData(r);
                            return (
                                <tr key={i} className="hover:bg-blue-50 transition-colors print:hover:bg-transparent">
                                    <td className="sticky left-0 z-10 border-r border-slate-300 p-1 text-center font-bold text-slate-600 bg-slate-50 print:bg-white print:border-black print:text-black">{r.day}</td>
                                    {COLUMN_CONFIG.map((col, idx) => (
                                        <Cell 
                                            key={idx} 
                                            val={r[col.key]} 
                                            onChange={(v) => handleChange(i, col.key as string, v)} 
                                            bg={col.bg} isBreak={col.isBreak} dim={col.dim} end={col.end} 
                                            showDash={isRowActive} 
                                        />
                                    ))}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      {/* SAVE SUCCESS PROMPT (Bottom Right) */}
      {savedDate && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 print:hidden" onClick={() => setSavedDate("")}>
            <div className="bg-white/20 p-2 rounded-full"><Check size={24} /></div>
            <div><p className="font-black text-sm">Update Successful</p><p className="text-xs opacity-90">Saved to {savedDate}</p></div>
        </div>
      )}

      {isPasteModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 print:hidden">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50"><h3 className="font-bold text-slate-700">Paste Report</h3><button onClick={() => setIsPasteModalOpen(false)}><X size={18}/></button></div>
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="w-full h-48 p-4 text-sm outline-none resize-none font-mono" placeholder="WATER FILLING RECORD..." />
                <div className="p-3 border-t bg-slate-50 flex justify-end"><button onClick={handleParseAndApply} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm">Apply</button></div>
            </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
            @page { size: landscape; margin: 5mm; }
            body { 
                background: white; 
                color: black; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
                font-size: 9px;
            }
            /* Hide EVERYTHING by default */
            body > * { display: none !important; }
            /* Only show the main container */
            .print-area-wrapper, .print-area-wrapper * { display: block !important; }
            .print-area-wrapper .flex { display: flex !important; }
            .print-area-wrapper .hidden { display: none !important; }
            
            /* Clean up UI for print */
            .print\\:hidden { display: none !important; }
            .print\\:block { display: block !important; }
            .print\\:text-black { color: black !important; }
            .print\\:bg-white { background-color: white !important; }
            .print\\:border-black { border-color: black !important; }
            
            /* Table Adjustments */
            table { width: 100% !important; border-collapse: collapse; font-size: 8px; }
            td, th { padding: 2px !important; border: 1px solid black !important; }
            input { display: none !important; } 
            .print-val { display: block !important; width: 100%; text-align: center; font-weight: bold; }
        }
        .btn-secondary { @apply flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all; }
      `}</style>
    </div>
  );
}

// --- COMPONENTS ---
interface StatCardProps { label: string; val: string | number; unit: string; color: string; bg: string; }
const StatCard = ({ label, val, unit, color, bg }: StatCardProps) => (
    <div className={`flex flex-col p-3 rounded-lg ${bg} border border-slate-200 min-w-[120px]`}>
        <span className="text-[10px] uppercase font-bold text-slate-500">{label}</span>
        <span className={`text-2xl font-black ${color} tracking-tight`}>{val} <span className="text-xs text-slate-400 font-medium">{unit}</span></span>
    </div>
);
interface GroupHeaderProps { label: string; color: string; span: number; }
const GroupHeader = ({ label, color, span }: GroupHeaderProps) => (
    <th colSpan={span} className={`border-r border-b border-slate-300 py-1 text-center text-[10px] font-bold uppercase tracking-wider print:bg-white print:text-black print:border-black ${color}`}>{label}</th>
);
interface SubGroupHeaderProps { label: string; span: number; dim?: boolean; end?: boolean; isRed?: boolean; }
const SubGroupHeader = ({ label, span, dim, end, isRed }: SubGroupHeaderProps) => (
    <th colSpan={span} className={`border-b border-slate-300 py-0.5 text-center text-[9px] print:bg-white print:border-black ${end ? 'border-r-2 border-slate-300 print:border-black' : 'border-r border-slate-200'} ${dim ? 'text-slate-400 font-medium print:text-black' : 'text-slate-700 font-bold print:text-black'} ${isRed ? 'text-red-500 print:text-black' : ''}`}>{label}</th>
);
interface ColHeaderProps { label: string; sub?: string; dim?: boolean; brk?: boolean; end?: boolean; highlight?: boolean; small?: boolean; }
const ColHeader = ({ label, sub, dim, brk, end, highlight }: ColHeaderProps) => (
    <th className={`border-b border-slate-300 p-1 bg-white print:bg-white print:border-black ${end ? 'border-r-2 border-slate-300' : 'border-r border-slate-200'} ${dim ? 'text-slate-400 font-medium' : 'text-slate-700'} ${brk ? 'text-red-500' : ''} ${highlight ? 'bg-slate-50 print:bg-white' : ''}`}><div className="flex flex-col items-center leading-none"><span>{label}</span></div></th>
);
interface CellProps { val: number; onChange: (v: string) => void; bg?: string; isBreak?: boolean; dim?: boolean; end?: boolean; showDash?: boolean; }
const Cell = ({ val, onChange, bg, isBreak, dim, end, showDash }: CellProps) => (
    <td className={`border-b border-slate-300 p-0 h-7 print:h-5 ${end ? 'border-r-2 border-slate-300' : 'border-r border-slate-200'} ${bg || 'bg-white'} ${isBreak ? 'bg-red-50 print:bg-white' : ''} print:border-black`}>
        <input type="number" value={val === 0 ? '' : val} onChange={(e) => onChange(e.target.value)} placeholder={showDash && val === 0 ? '-' : ''} className={`w-full h-full text-center outline-none bg-transparent font-medium text-[10px] print:text-[9px] ${val > 0 ? 'text-slate-800' : 'text-transparent hover:text-slate-300 focus:text-slate-500 placeholder:text-slate-300 placeholder:font-bold'} ${isBreak && val > 0 ? 'text-red-600 font-bold' : ''} ${dim ? 'text-slate-400' : ''} focus:bg-blue-50 transition-colors print:hidden`}/>
        <span className="hidden print:block text-center w-full font-bold text-black text-[8px] print-val">{val > 0 ? val : (showDash ? '-' : '')}</span>
    </td>
);
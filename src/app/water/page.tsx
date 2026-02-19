"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClipboardPaste, X, Check, ChevronLeft, ChevronRight, Loader2, Droplets, Download, AlertTriangle, Calendar, FileText } from 'lucide-react';
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

const hasRowData = (r: DailyRecord) => {
  const { dateStr, day, ...nums } = r;
  return Object.values(nums).some(val => (val as number) > 0);
};

export default function WaterProductionPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedDate, setSavedDate] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [mobileEditIndex, setMobileEditIndex] = useState<number | null>(null);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirty = useRef(false);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (isMounted) {
        isDirty.current = false;
        fetchMonthData(selectedDate);
    }
  }, [selectedDate, isMounted]);

  useEffect(() => {
    if (!isMounted || records.length === 0 || !isDirty.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    
    setSaveStatus("saving");
    autoSaveTimerRef.current = setTimeout(() => {
        saveToDatabase(records);
    }, 1500); 
    
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [records, isMounted]);

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
    isDirty.current = false;
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
    const val = value === '' ? 0 : parseInt(value);
    const newRecords = [...records];
    newRecords[dayIndex] = { ...newRecords[dayIndex], [field]: isNaN(val) ? 0 : val };
    setRecords(newRecords);
  };

  const changeMonth = (offset: number) => {
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() + offset);
    setSelectedDate(d);
  };

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

  const handleParseAndApply = async () => {
    const lines = pasteText.split('\n').map(l => l.trim().toLowerCase());
    const dateLine = lines.find(l => l.includes('date'));
    let manualDateStr: string | null = null;
    let targetYear = 0, targetMonth = 0;

    if (dateLine) {
        const match = dateLine.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if (match) {
            const day = String(match[1]).padStart(2, '0');
            const month = String(match[2]).padStart(2, '0');
            let yearStr = match[3];
            if (yearStr.length === 2) yearStr = "20" + yearStr;
            manualDateStr = `${yearStr}-${month}-${day}`;
            targetYear = parseInt(yearStr); targetMonth = parseInt(month) - 1; 
        }
    }

    if (!manualDateStr) { alert("Invalid date in report."); return; }

    const newRecord: any = { date: manualDateStr };
    let currentSection = "";

    lines.forEach(line => {
        // Robust number extraction: ignores symbols like ~ : x and spaces
        const valMatch = line.match(/(\d+)/);
        const val = valMatch ? parseInt(valMatch[1]) : 0;
        
        if(line.includes("1000 ml")) currentSection = "1000";
        else if(line.includes("500 ml")) currentSection = "500";
        else if(line.includes("350 ml")) currentSection = "350";
        else if(line.includes("200 ml")) currentSection = "200";
        else if(line.includes("seaplane") || line.includes("tma")) currentSection = "TMA";

        const isBreak = line.includes("breakage") || line.includes("damaged") || line.includes("~");

        if (currentSection === "1000") {
            if (isBreak) newRecord.b1000_break = val;
            else if (line.includes("still")) newRecord.b1000_fnb_still = val;
            else if (line.includes("sparkling") && !line.includes("unused")) newRecord.b1000_fnb_spk = val;
            else if (line.includes("unused") || line.includes("return")) {
                if(line.includes("sparkling")) newRecord.b1000_ret_spk = val;
                else newRecord.b1000_ret_still = val; 
            }
        } else if (currentSection === "500") {
            if (isBreak) newRecord.b500_break = val;
            else if (line.includes("still") && !line.includes("unused")) newRecord.b500_hsk_still = val;
            else if (line.includes("tropic")) newRecord.b500_tropic_still = val;
            else if (line.includes("unused") || line.includes("return")) newRecord.b500_ret_still = val;
        } else if (currentSection === "350") {
            if (isBreak) newRecord.b350_break = val;
            else if (line.includes("sparkling") && !line.includes("unused")) newRecord.b350_hsk_spk = val;
            else if (line.includes("spa") && !line.includes("sparkling")) newRecord.b350_spa_still = val;
            else if (line.includes("water") || line.includes("sports")) newRecord.b350_ws_still = val;
            else if (line.includes("unused") || line.includes("return")) {
                 if(line.includes("sparkling")) newRecord.b350_ret_spk = val;
                 else newRecord.b350_ret_still = val;
            }
        } else if (currentSection === "200") {
            if (isBreak) newRecord.b200_break = val;
        } else if (currentSection === "TMA") {
             if (isBreak) newRecord.b250_break = val;
             else if (val > 0) newRecord.b250_tma_still = val; 
        }
    });

    const { error } = await supabase.from('water_records').upsert(newRecord, { onConflict: 'date' });
    if (error) { alert("Failed to save: " + error.message); } 
    else {
        setIsPasteModalOpen(false); setPasteText(""); setSavedDate(manualDateStr || "");
        setSelectedDate(new Date(targetYear, targetMonth, 1)); fetchMonthData(new Date(targetYear, targetMonth, 1));
    }
  };

  const handleExportCSV = () => {
    const headers = [ "Date", "1000ML F&B Still", "1000ML F&B Spk", "1000ML Return Spk", "1000ML Return Still", "1000ML Breakage", "500ML HSK Still", "500ML Tropic", "500ML Return", "500ML Breakage", "350ML SPA", "350ML WaterSports", "350ML HSK Spk", "350ML Return Still", "350ML Return Spk", "350ML Breakage", "250ML TMA", "250ML Breakage", "200ML Breakage" ];
    const rows = records.map(r => [ r.dateStr, r.b1000_fnb_still, r.b1000_fnb_spk, r.b1000_ret_spk, r.b1000_ret_still, r.b1000_break, r.b500_hsk_still, r.b500_tropic_still, r.b500_ret_still, r.b500_break, r.b350_spa_still, r.b350_ws_still, r.b350_hsk_spk, r.b350_ret_still, r.b350_ret_spk, r.b350_break, r.b250_tma_still, r.b250_break, r.b200_break ]);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Water_Log_${selectedDate.toISOString().slice(0,7)}.csv`);
    document.body.appendChild(link); link.click();
  };

  const handleDownloadPDF = async () => {
    const monthYearStr = selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
    let baseSvg = "";
    try {
        const res = await fetch('/water-template.svg');
        if (!res.ok) throw new Error("File not found");
        baseSvg = await res.text();
    } catch (e) { alert("Make sure 'water-template.svg' is saved in your 'public' folder!"); return; }
    baseSvg = baseSvg.replace('</svg>', '');
    let overlays = `<style>.svg-txt { font-family: 'Book Antiqua', serif; font-size: 7.5px; font-weight: bold; fill: #231f20; text-anchor: middle; }</style><text x="272" y="115" font-family="'Book Antiqua', serif" font-size="13px" font-weight="bold" fill="#231f20" text-anchor="middle">${monthYearStr}</text><text x="297" y="645" fill="#6b1b51" font-family="'Book Antiqua', serif" font-size="17px" font-weight="bold" text-anchor="middle">TOTAL PRODUCTION</text><rect x="49.74" y="661.93" width="79.83" height="44.47" rx="10.94" ry="10.94" fill="#ddeafe"/><rect x="153.16" y="661.93" width="79.83" height="44.47" rx="10.94" ry="10.94" fill="#f1e8ff"/><rect x="256.58" y="661.93" width="79.83" height="44.47" rx="10.94" ry="10.94" fill="#f1e8ff"/><rect x="359.99" y="661.93" width="79.83" height="44.47" rx="10.94" ry="10.94" fill="#d7fae7"/><rect x="463.41" y="661.93" width="79.83" height="44.47" rx="10.94" ry="10.94" fill="#fae2e2"/><text x="89.65" y="678" fill="#747d94" font-family="Helvetica, Arial, sans-serif" font-size="6.5px" font-weight="bold" text-anchor="middle">TOTAL L</text><text x="193.07" y="678" fill="#747d94" font-family="Helvetica, Arial, sans-serif" font-size="6.5px" font-weight="bold" text-anchor="middle">STILL L</text><text x="296.49" y="678" fill="#747d94" font-family="Helvetica, Arial, sans-serif" font-size="6.5px" font-weight="bold" text-anchor="middle">SPARKLING L</text><text x="399.90" y="678" fill="#747d94" font-family="Helvetica, Arial, sans-serif" font-size="6.5px" font-weight="bold" text-anchor="middle">BOTTLES FILLED</text><text x="503.32" y="678" fill="#747d94" font-family="Helvetica, Arial, sans-serif" font-size="6.5px" font-weight="bold" text-anchor="middle">BREAKAGE</text>`;
    const colCenters = [54.5, 84.1, 113.7, 143.3, 172.9, 202.5, 232.1, 261.7, 291.3, 320.9, 350.5, 380.1, 409.7, 439.3, 468.9, 498.5, 528.1, 557.7];
    let gridSVG = `<g fill="none" stroke="#231f20" stroke-miterlimit="10" stroke-width=".25px">`;
    let numbersSVG = `<g font-family="'Book Antiqua', serif" font-size="7.5px" font-weight="bold" fill="#231f20" text-anchor="middle">`;
    records.forEach((r, i) => {
        const yPos = 183.5 + (i * 13.07); const hasData = hasRowData(r);
        numbersSVG += `<text x="31" y="${yPos}">${r.day}</text>`;
        const values = [ r.b1000_fnb_still, r.b1000_fnb_spk, r.b1000_ret_spk, r.b1000_ret_still, r.b1000_break, r.b500_hsk_still, r.b500_tropic_still, r.b500_ret_still, r.b500_break, r.b350_spa_still, r.b350_ws_still, r.b350_hsk_spk, r.b350_ret_still, r.b350_ret_spk, r.b350_break, r.b250_tma_still, r.b250_break, r.b200_break ];
        values.forEach((val, colIdx) => { if (val > 0 || (hasData && val === 0)) { numbersSVG += `<text x="${colCenters[colIdx]}" y="${yPos}">${val}</text>`; } });
        const rectY = 174.59 + (i * 13.07);
        const xStarts = [22.42, 39.68, 69.3, 98.93, 128.55, 158.17, 187.79, 217.41, 247.03, 276.65, 306.27, 335.89, 365.51, 395.13, 424.76, 454.38, 484, 513.62, 543.24];
        const widths = [17.27, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62, 29.62];
        xStarts.forEach((x, idx) => { gridSVG += `<rect x="${x}" y="${rectY}" width="${widths[idx]}" height="13.07"/>`; });
    });
    gridSVG += `</g>`; numbersSVG += `</g>`;
    const totalL = stats.l_still + stats.l_spk;
    overlays += `<text x="89.6" y="696" fill="#3e4cd6" font-family="'Book Antiqua', serif" font-size="16px" font-weight="bold" text-anchor="middle">${totalL.toFixed(0)}</text><text x="193.07" y="696" fill="#7817cc" font-family="'Book Antiqua', serif" font-size="16px" font-weight="bold" text-anchor="middle">${stats.l_still.toFixed(0)}</text><text x="296.49" y="696" fill="#7817cc" font-family="'Book Antiqua', serif" font-size="16px" font-weight="bold" text-anchor="middle">${stats.l_spk.toFixed(0)}</text><text x="399.90" y="696" fill="#2e7959" font-family="'Book Antiqua', serif" font-size="16px" font-weight="bold" text-anchor="middle">${stats.bottles.toLocaleString()}</text><text x="503.32" y="696" fill="#ad1003" font-family="'Book Antiqua', serif" font-size="16px" font-weight="bold" text-anchor="middle">${stats.breakage}</text>`;
    const colorMap: Record<string, string> = { 'bg-emerald-500': '#4cbb85', 'bg-blue-500': '#5280f4', 'bg-purple-500': '#a24ff3', 'bg-cyan-500': '#4db6d4', 'bg-teal-500': '#14b8a6', 'bg-amber-500': '#ea9d00' };
    overlays += `<text x="49.74" y="726" fill="#747d94" font-family="Helvetica, Arial, sans-serif" font-size="7px" font-weight="bold" text-anchor="start">STILL BREAKDOWN</text><text x="341.31" y="726" fill="#747d94" font-family="Helvetica, Arial, sans-serif" font-size="7px" font-weight="bold" text-anchor="start">SPARKLING BREAKDOWN</text><rect x="49.74" y="735" width="202.08" height="8.47" rx="4.24" ry="4.24" fill="#e2e8f0"/><rect x="341.31" y="735" width="202.08" height="8.47" rx="4.24" ry="4.24" fill="#e2e8f0"/>`;
    overlays += `<clipPath id="still-clip"><rect x="49.74" y="735" width="202.08" height="8.47" rx="4.24" ry="4.24" /></clipPath><g clip-path="url(#still-clip)">`;
    let curX = 49.74; chartData.still.forEach(item => { const barW = (item.pct / 100) * 202.08; if(barW > 0) { overlays += `<rect x="${curX}" y="735" width="${barW}" height="8.47" fill="${colorMap[item.color] || '#000'}"/>`; curX += barW; } });
    overlays += `</g>`;
    chartData.still.forEach((item, idx) => { const lx = 52 + (idx * 38); overlays += `<circle cx="${lx}" cy="761" r="2.8" fill="${colorMap[item.color] || '#000'}"/><text x="${lx + 5}" y="762.5" font-family="'Book Antiqua', serif" font-size="5px" font-weight="bold" fill="#747d94" text-anchor="start">${item.label} (${item.pct.toFixed(0)}%)</text>`; });
    overlays += `<clipPath id="spk-clip"><rect x="341.31" y="735" width="202.08" height="8.47" rx="4.24" ry="4.24" /></clipPath><g clip-path="url(#spk-clip)">`;
    let spkX = 341.31; chartData.spk.forEach(item => { const barW = (item.pct / 100) * 202.08; if(barW > 0) { overlays += `<rect x="${spkX}" y="735" width="${barW}" height="8.47" fill="${colorMap[item.color] || '#000'}"/>`; spkX += barW; } });
    overlays += `</g>`;
    chartData.spk.forEach((item, idx) => { const lx = 344 + (idx * 38); overlays += `<circle cx="${lx}" cy="761" r="2.8" fill="${colorMap[item.color] || '#000'}"/><text x="${lx + 5}" y="762.5" font-family="'Book Antiqua', serif" font-size="5px" font-weight="bold" fill="#747d94" text-anchor="start">${item.label} (${item.pct.toFixed(0)}%)</text>`; });
    const finalSVG = baseSvg + gridSVG + overlays + numbersSVG + '</svg>';
    const win = window.open('', 'Print', 'height=800,width=600');
    if(win) {
        win.document.write(`<html><head><title>Water Log ${monthYearStr}</title><style>@page { size: A4 portrait; margin: 0; } body, html { margin: 0; padding: 0; width: 100vw; height: 100vh; display: flex; justify-content: center; align-items: center; overflow: hidden; background: white; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } svg { max-width: 100%; max-height: 100vh; object-fit: contain; }</style></head><body>${finalSVG}<script>setTimeout(() => { window.print(); window.close(); }, 500);</script></body></html>`);
        win.document.close();
    }
  };

  if (!isMounted) return null;

  return (
    <div className="h-screen flex flex-col bg-white text-slate-900 font-sans text-xs">
      <style dangerouslySetInnerHTML={{__html: `
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}} />

      {errorMessage && <div className="bg-red-500 text-white text-center py-1 font-bold flex justify-center items-center gap-2"><AlertTriangle size={12}/> {errorMessage}</div>}

      <div className="bg-white border-b border-slate-300 shadow-sm shrink-0 z-40">
        <div className="px-4 md:px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                <div className="flex items-center gap-3">
                    <div className="bg-[#6D2158] p-2 rounded-lg text-white shadow-md"><Droplets size={20} /></div>
                    <div>
                        <h1 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-tight">Water Production</h1>
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                            <button onClick={() => changeMonth(-1)} className="hover:text-blue-600"><ChevronLeft size={16}/></button>
                            <span className="w-28 text-center">{selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                            <button onClick={() => changeMonth(1)} className="hover:text-blue-600"><ChevronRight size={16}/></button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                <div className="text-[10px] font-bold uppercase tracking-wider mr-2 text-right hidden md:block">
                    {saveStatus === 'saving' && <span className="text-blue-500 flex items-center justify-end gap-1"><Loader2 size={10} className="animate-spin"/> Saving...</span>}
                    {saveStatus === 'saved' && <span className="text-emerald-600 flex items-center justify-end gap-1"><Check size={10}/> Saved</span>}
                </div>
                <button onClick={() => setIsPasteModalOpen(true)} className="btn-secondary"><ClipboardPaste size={16}/> <span className="hidden md:inline">Paste</span></button>
                <button onClick={handleExportCSV} className="btn-secondary"><Download size={16}/> <span className="hidden md:inline">CSV</span></button>
                <button onClick={handleDownloadPDF} className="btn-secondary text-[#6D2158] border-[#6D2158]/30 hover:bg-[#6D2158]/5"><FileText size={16}/> <span className="hidden md:inline">PDF</span></button>
            </div>
        </div>
        
        {/* STATS AREA */}
        <div className="flex gap-6 px-6 py-4 bg-slate-50 border-t border-slate-200 overflow-x-auto">
            <div className="flex gap-3 min-w-max">
                <StatCard label="Total L" val={(stats.l_still + stats.l_spk).toFixed(0)} unit="L" color="text-blue-700" bg="bg-blue-100" />
                <StatCard label="Still L" val={stats.l_still.toFixed(0)} unit="L" color="text-purple-700" bg="bg-purple-100" />
                <StatCard label="Sparkling L" val={stats.l_spk.toFixed(0)} unit="L" color="text-purple-700" bg="bg-purple-100" />
                <StatCard label="Bottles Filled" val={stats.bottles.toLocaleString()} unit="Qty" color="text-emerald-700" bg="bg-emerald-100" />
                <StatCard label="Breakage" val={stats.breakage} unit="Qty" color="text-red-700" bg="bg-red-100" />
            </div>
            
            {/* GRAPHS */}
            <div className="flex-1 flex gap-6 border-l border-slate-200 pl-6 min-w-[300px]">
                <div className="flex-1 flex flex-col justify-center gap-2">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400"><span>Still Breakdown</span></div>
                    <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        {chartData.still.map((item, i) => (<div key={i} className={`h-full ${item.color}`} style={{ width: `${item.pct}%` }}></div>))}
                    </div>
                    <div className="flex flex-wrap gap-2 text-[9px] font-bold text-slate-500">
                        {chartData.still.map((item, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                                {item.label} 
                                <span className="text-slate-400 font-normal">({item.pct.toFixed(0)}%)</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-2 border-l border-slate-200 pl-6">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400"><span>Sparkling Breakdown</span></div>
                    <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        {chartData.spk.map((item, i) => (<div key={i} className={`h-full ${item.color}`} style={{ width: `${item.pct}%` }}></div>))}
                    </div>
                    <div className="flex flex-wrap gap-2 text-[9px] font-bold text-slate-500">
                        {chartData.spk.map((item, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                                {item.label}
                                <span className="text-slate-400 font-normal">({item.pct.toFixed(0)}%)</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* --- DESKTOP VIEW: SPREADSHEET --- */}
      <div className="hidden md:block flex-1 overflow-auto bg-slate-100 p-4">
        <div className="bg-white shadow rounded-lg overflow-hidden border border-slate-300 h-full flex flex-col">
            <div className="overflow-auto flex-1">
                <table className="w-full table-fixed border-collapse text-[10px]">
                    <thead className="bg-slate-50 border-b-2 border-slate-300">
                        <tr>
                            <th rowSpan={3} className="sticky left-0 z-20 bg-slate-100 border-r border-slate-300 w-8 p-1 text-xs font-bold text-slate-500 uppercase">Day</th>
                            <GroupHeader label="1000 ML" color="bg-emerald-50 text-emerald-900 border-emerald-200" span={5} /><GroupHeader label="500 ML" color="bg-blue-50 text-blue-900 border-blue-200" span={4} /><GroupHeader label="350 ML" color="bg-purple-50 text-purple-900 border-purple-200" span={6} /><GroupHeader label="250 / 200 ML" color="bg-amber-50 text-amber-900 border-amber-200" span={3} />
                        </tr>
                        <tr className="text-[9px] font-bold text-slate-600 uppercase">
                            <SubGroupHeader label="F&B" span={2} /><SubGroupHeader label="RETURN" span={2} dim /><SubGroupHeader label="BRK" span={1} end isRed />
                            <SubGroupHeader label="HSK" span={1} /><SubGroupHeader label="TROPIC" span={1} /><SubGroupHeader label="RETURN" span={1} dim /><SubGroupHeader label="BRK" span={1} end isRed />
                            <SubGroupHeader label="SPA" span={1} /><SubGroupHeader label="WS" span={1} /><SubGroupHeader label="HSK" span={1} /><SubGroupHeader label="RETURN" span={2} dim /><SubGroupHeader label="BRK" span={1} end isRed />
                            <SubGroupHeader label="TMA" span={1} /><SubGroupHeader label="BRK" span={2} end isRed />
                        </tr>
                        <tr className="text-[9px] font-bold text-slate-500 uppercase">
                            <ColHeader label="STILL" /><ColHeader label="SPK" /><ColHeader label="SPK" dim /><ColHeader label="STILL" dim /><ColHeader label="-" brk end />
                            <ColHeader label="STILL" /><ColHeader label="STILL" /><ColHeader label="STILL" dim /><ColHeader label="-" brk end />
                            <ColHeader label="STILL" /><ColHeader label="STILL" /><ColHeader label="SPK" /><ColHeader label="STILL" dim /><ColHeader label="SPK" dim /><ColHeader label="-" brk end />
                            <ColHeader label="250" /><ColHeader label="250" brk /><ColHeader label="200" brk end />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {records.map((r, i) => (
                            <tr key={i} className="hover:bg-blue-50 transition-colors">
                                <td className="sticky left-0 z-10 border-r border-slate-300 p-1 text-center font-bold text-slate-600 bg-slate-50">{r.day}</td>
                                {COLUMN_CONFIG.map((col, idx) => (
                                    <Cell key={idx} val={r[col.key]} onChange={(v) => handleChange(i, col.key as string, v)} bg={col.bg} isBreak={col.isBreak} dim={col.dim} end={col.end} showDash={hasRowData(r)} />
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      {/* --- MOBILE VIEW: CARD LIST --- */}
      <div className="md:hidden flex-1 overflow-auto bg-slate-100 p-4 space-y-3">
        {records.map((r, i) => {
            const hasData = hasRowData(r);
            const totalBottles = (r.b1000_fnb_still + r.b1000_fnb_spk + r.b500_hsk_still + r.b500_tropic_still + r.b350_spa_still + r.b350_ws_still + r.b350_hsk_spk);
            return (
                <div key={i} onClick={() => setMobileEditIndex(i)} className={`bg-white rounded-xl p-4 shadow-sm border border-slate-200 active:scale-95 transition-transform ${hasData ? 'border-l-4 border-l-[#6D2158]' : 'opacity-70'}`}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${hasData ? 'bg-[#6D2158] text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {r.day}
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-700">{selectedDate.toLocaleString('default', { month: 'short' })} {r.day}</div>
                                <div className="text-[10px] text-slate-400">{hasData ? `${totalBottles} bottles logged` : 'No data'}</div>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-300"/>
                    </div>
                </div>
            )
        })}
      </div>

      {/* --- MOBILE EDIT MODAL --- */}
      {mobileEditIndex !== null && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col md:hidden animate-in slide-in-from-bottom-full duration-200">
            <div className="bg-[#6D2158] text-white p-4 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <Calendar size={18}/>
                    <span className="font-bold text-lg">{selectedDate.toLocaleString('default', { month: 'long' })} {records[mobileEditIndex].day}</span>
                </div>
                <button onClick={() => setMobileEditIndex(null)} className="p-2 bg-white/20 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="font-bold text-emerald-700 mb-3 border-b pb-2 flex items-center gap-2"><Droplets size={14}/> 1000 ML</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <MobileInput label="F&B Still" val={records[mobileEditIndex].b1000_fnb_still} onChange={(v) => handleChange(mobileEditIndex, 'b1000_fnb_still', v)} />
                        <MobileInput label="F&B Spk" val={records[mobileEditIndex].b1000_fnb_spk} onChange={(v) => handleChange(mobileEditIndex, 'b1000_fnb_spk', v)} />
                        <MobileInput label="Return Still" val={records[mobileEditIndex].b1000_ret_still} onChange={(v) => handleChange(mobileEditIndex, 'b1000_ret_still', v)} dim />
                        <MobileInput label="Return Spk" val={records[mobileEditIndex].b1000_ret_spk} onChange={(v) => handleChange(mobileEditIndex, 'b1000_ret_spk', v)} dim />
                        <MobileInput label="Breakage" val={records[mobileEditIndex].b1000_break} onChange={(v) => handleChange(mobileEditIndex, 'b1000_break', v)} isRed />
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="font-bold text-blue-700 mb-3 border-b pb-2 flex items-center gap-2"><Droplets size={14}/> 500 ML</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <MobileInput label="HSK Still" val={records[mobileEditIndex].b500_hsk_still} onChange={(v) => handleChange(mobileEditIndex, 'b500_hsk_still', v)} />
                        <MobileInput label="Tropic Still" val={records[mobileEditIndex].b500_tropic_still} onChange={(v) => handleChange(mobileEditIndex, 'b500_tropic_still', v)} />
                        <MobileInput label="Return" val={records[mobileEditIndex].b500_ret_still} onChange={(v) => handleChange(mobileEditIndex, 'b500_ret_still', v)} dim />
                        <MobileInput label="Breakage" val={records[mobileEditIndex].b500_break} onChange={(v) => handleChange(mobileEditIndex, 'b500_break', v)} isRed />
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="font-bold text-purple-700 mb-3 border-b pb-2 flex items-center gap-2"><Droplets size={14}/> 350 ML</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <MobileInput label="SPA Still" val={records[mobileEditIndex].b350_spa_still} onChange={(v) => handleChange(mobileEditIndex, 'b350_spa_still', v)} />
                        <MobileInput label="WS Still" val={records[mobileEditIndex].b350_ws_still} onChange={(v) => handleChange(mobileEditIndex, 'b350_ws_still', v)} />
                        <MobileInput label="HSK Spk" val={records[mobileEditIndex].b350_hsk_spk} onChange={(v) => handleChange(mobileEditIndex, 'b350_hsk_spk', v)} />
                        <MobileInput label="Return Still" val={records[mobileEditIndex].b350_ret_still} onChange={(v) => handleChange(mobileEditIndex, 'b350_ret_still', v)} dim />
                        <MobileInput label="Return Spk" val={records[mobileEditIndex].b350_ret_spk} onChange={(v) => handleChange(mobileEditIndex, 'b350_ret_spk', v)} dim />
                        <MobileInput label="Breakage" val={records[mobileEditIndex].b350_break} onChange={(v) => handleChange(mobileEditIndex, 'b350_break', v)} isRed />
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="font-bold text-amber-700 mb-3 border-b pb-2 flex items-center gap-2"><Droplets size={14}/> TMA / 200ML</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <MobileInput label="TMA 250ml" val={records[mobileEditIndex].b250_tma_still} onChange={(v) => handleChange(mobileEditIndex, 'b250_tma_still', v)} />
                        <MobileInput label="Break 250ml" val={records[mobileEditIndex].b250_break} onChange={(v) => handleChange(mobileEditIndex, 'b250_break', v)} isRed />
                        <MobileInput label="Break 200ml" val={records[mobileEditIndex].b200_break} onChange={(v) => handleChange(mobileEditIndex, 'b200_break', v)} isRed />
                    </div>
                </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                <button onClick={() => { saveToDatabase(records); setMobileEditIndex(null); }} className="w-full bg-[#6D2158] text-white py-3 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform">
                    Save & Close
                </button>
            </div>
        </div>
      )}

      {/* SAVE SUCCESS PROMPT */}
      {savedDate && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4" onClick={() => setSavedDate("")}>
            <div className="bg-white/20 p-2 rounded-full"><Check size={24} /></div>
            <div><p className="font-black text-sm">Update Successful</p><p className="text-xs opacity-90">Saved to {savedDate}</p></div>
        </div>
      )}

      {isPasteModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50"><h3 className="font-bold text-slate-700">Paste Report</h3><button onClick={() => setIsPasteModalOpen(false)}><X size={18}/></button></div>
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="w-full h-48 p-4 text-sm outline-none resize-none font-mono" placeholder="WATER FILLING RECORD..." />
                <div className="p-3 border-t bg-slate-50 flex justify-end"><button onClick={handleParseAndApply} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-sm">Apply</button></div>
            </div>
        </div>
      )}

      <style jsx global>{`
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
    <th colSpan={span} className={`border-r border-b border-slate-300 py-1 text-center text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</th>
);
interface SubGroupHeaderProps { label: string; span: number; dim?: boolean; end?: boolean; isRed?: boolean; }
const SubGroupHeader = ({ label, span, dim, end, isRed }: SubGroupHeaderProps) => (
    <th colSpan={span} className={`border-b border-slate-300 py-0.5 text-center text-[9px] ${end ? 'border-r-2 border-slate-300' : 'border-r border-slate-200'} ${dim ? 'text-slate-400 font-medium' : 'text-slate-700 font-bold'} ${isRed ? 'text-red-500' : ''}`}>{label}</th>
);
interface ColHeaderProps { label: string; sub?: string; dim?: boolean; brk?: boolean; end?: boolean; highlight?: boolean; small?: boolean; }
const ColHeader = ({ label, sub, dim, brk, end, highlight }: ColHeaderProps) => (
    <th className={`border-b border-slate-300 p-1 bg-white ${end ? 'border-r-2 border-slate-300' : 'border-r border-slate-200'} ${dim ? 'text-slate-400 font-medium' : 'text-slate-700'} ${brk ? 'text-red-500' : ''} ${highlight ? 'bg-slate-50' : ''}`}><div className="flex flex-col items-center leading-none"><span>{label}</span></div></th>
);
interface CellProps { val: number; onChange: (v: string) => void; bg?: string; isBreak?: boolean; dim?: boolean; end?: boolean; showDash?: boolean; }
const Cell = ({ val, onChange, bg, isBreak, dim, end, showDash }: CellProps) => (
    <td className={`border-b border-slate-300 p-0 h-7 ${end ? 'border-r-2 border-slate-300' : 'border-r border-slate-200'} ${bg || 'bg-white'} ${isBreak ? 'bg-red-50' : ''}`}>
        <input type="number" value={val === 0 ? '' : val} onChange={(e) => onChange(e.target.value)} placeholder={showDash && val === 0 ? '0' : ''} className={`w-full h-full text-center outline-none bg-transparent font-medium text-[10px] ${val > 0 ? 'text-slate-800' : 'text-transparent hover:text-slate-300 focus:text-slate-500 placeholder:text-slate-800 placeholder:font-bold'} ${isBreak && val > 0 ? 'text-red-600 font-bold' : ''} ${dim ? 'text-slate-400' : ''} focus:bg-blue-50 transition-colors`}/>
    </td>
);

interface MobileInputProps { label: string; val: number; onChange: (v: string) => void; dim?: boolean; isRed?: boolean; }
const MobileInput = ({ label, val, onChange, dim, isRed }: MobileInputProps) => (
    <div className="flex flex-col gap-1">
        <label className={`text-[10px] uppercase font-bold ${isRed ? 'text-red-500' : dim ? 'text-slate-400' : 'text-slate-600'}`}>{label}</label>
        <input 
            type="number" 
            value={val === 0 ? '' : val} 
            onChange={(e) => onChange(e.target.value)} 
            placeholder="-" 
            className={`w-full p-3 rounded-lg border outline-none font-bold text-lg text-center transition-all focus:border-[#6D2158] focus:bg-[#6D2158]/5 ${isRed ? 'bg-red-50 border-red-100 text-red-600' : 'bg-white border-slate-200 text-slate-800'}`}
        />
    </div>
);
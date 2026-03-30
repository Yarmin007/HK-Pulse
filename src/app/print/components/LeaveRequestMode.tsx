"use client";
import React, { useState, useEffect } from 'react';
import { 
  Users, CalendarDays, Loader2, Scissors, EyeOff, Search, FileText
} from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { supabase } from '@/lib/supabase';
import { parseISO, addDays, eachDayOfInterval, subMonths, addMonths, format } from 'date-fns';
import toast from 'react-hot-toast';

const FONT_FILENAME = 'book_antiqua.ttf';

type Host = { 
    id: string; 
    host_id: string; 
    full_name: string; 
    role: string; 
    department?: string;
    joining_date?: string;
    personal_mobile?: string;
};

type DetectedLeave = {
    hash: string;
    host: Host;
    start_date: string;
    end_date: string;
    total_days: number;
    duty_date: string;
    breakdown: Record<string, number>;
};

const getToday = () => {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatDateForPDF = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
};

export default function LeaveRequestMode() {
  const [fontBytes, setFontBytes] = useState<ArrayBuffer | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostSearch, setHostSearch] = useState('');
  const [isHostDropdownOpen, setIsHostDropdownOpen] = useState(false);

  const [isLoadingLeaves, setIsLoadingLeaves] = useState(false);
  const [detectedLeaves, setDetectedLeaves] = useState<DetectedLeave[]>([]);
  const [leaveData, setLeaveData] = useState<{
      name: string; host_id: string; designation: string; department: string; joining_date: string; contact_no: string;
      total_days: number | string; start_date: string; end_date: string; duty_date: string; breakdown: Record<string, number>
  }>({
      name: '', host_id: '', designation: '', department: '', joining_date: '', contact_no: '',
      total_days: '', start_date: '', end_date: '', duty_date: '', breakdown: {}
  });

  useEffect(() => {
      loadFont();
      fetchLeaveDetectionData();
  }, []);

  const addToLog = (msg: string) => setLogs(prev => [msg, ...prev]);

  const loadFont = async () => {
      const { data } = await supabase.storage.from('templates').download(FONT_FILENAME);
      if (data) {
          const buf = await data.arrayBuffer();
          setFontBytes(buf);
      }
  };

  // --- LEAVE REQUEST LOGIC WITH AUTO-DETECTION ENGINE ---
  const fetchLeaveDetectionData = async () => {
      setIsLoadingLeaves(true);
      try {
          const { data: hostsData } = await supabase.from('hsk_hosts').select('*').neq('status', 'Resigned');
          const hostsList = hostsData || [];
          setHosts(hostsList as Host[]);

          // Check 1 month ago to 3 months forward
          const today = new Date();
          const startStr = format(subMonths(today, 1), 'yyyy-MM-dd');
          const endStr = format(addMonths(today, 3), 'yyyy-MM-dd');

          // PAGINATION FIX: Supabase limits to 1000 rows by default. We must loop to get all future dates.
          let allAttData: any[] = [];
          let from = 0;
          const step = 1000;
          let hasMore = true;

          while (hasMore) {
              const { data: attData, error } = await supabase
                  .from('hsk_attendance')
                  .select('host_id, date, status_code')
                  .gte('date', startStr)
                  .lte('date', endStr)
                  .range(from, from + step - 1);

              if (error) {
                  console.error("Error fetching attendance:", error);
                  break;
              }

              if (attData && attData.length > 0) {
                  allAttData.push(...attData);
                  from += step;
                  if (attData.length < step) hasMore = false;
              } else {
                  hasMore = false;
              }
          }

          const attMap = new Map();
          allAttData.forEach(a => {
              const dStr = a.date.split('T')[0];
              attMap.set(`${a.host_id}_${dStr}`, a.status_code);
          });

          const allDates = eachDayOfInterval({ start: subMonths(today, 1), end: addMonths(today, 3) })
              .map(d => format(d, 'yyyy-MM-dd'));

          const detected: DetectedLeave[] = [];
          const HARD_CUTOFF_DATE = '2026-03-31';

          hostsList.forEach(host => {
              let currentBlock: any = null;

              allDates.forEach(date => {
                  const status = attMap.get(`${host.host_id}_${date}`);
                  // Valid Leaves: Anything that is not P, SL, OT, or empty
                  const isLeave = status && !['P', 'SL', 'OT'].includes(status);

                  if (isLeave) {
                      if (!currentBlock) {
                          currentBlock = { start_date: date, end_date: date, total_days: 1, breakdown: { [status]: 1 } };
                      } else {
                          currentBlock.end_date = date;
                          currentBlock.total_days++;
                          currentBlock.breakdown[status] = (currentBlock.breakdown[status] || 0) + 1;
                      }
                  } else {
                      if (currentBlock) {
                          currentBlock.duty_date = date; // The very first non-leave day is the duty date
                          if (currentBlock.total_days > 2) {
                              detected.push({
                                  ...currentBlock,
                                  host,
                                  hash: `${host.host_id}_${currentBlock.start_date}_${currentBlock.end_date}_${currentBlock.total_days}`
                              });
                          }
                          currentBlock = null;
                      }
                  }
              });
              
              if (currentBlock && currentBlock.total_days > 2) {
                  currentBlock.duty_date = format(addDays(parseISO(currentBlock.end_date), 1), 'yyyy-MM-dd');
                  detected.push({
                      ...currentBlock,
                      host,
                      hash: `${host.host_id}_${currentBlock.start_date}_${currentBlock.end_date}_${currentBlock.total_days}`
                  });
              }
          });

          const ignored = JSON.parse(localStorage.getItem('ignored_leaves') || '[]');
          
          // Apply hard cutoff filter (March 31, 2026 onwards) and remove ignored blocks
          setDetectedLeaves(
              detected.filter(d => d.start_date >= HARD_CUTOFF_DATE && !ignored.includes(d.hash))
          );

      } catch (e) {
          console.error(e);
      }
      setIsLoadingLeaves(false);
  };

  const ignoreLeaveBlock = (hash: string) => {
      const ignored = JSON.parse(localStorage.getItem('ignored_leaves') || '[]');
      if (!ignored.includes(hash)) {
          ignored.push(hash);
          localStorage.setItem('ignored_leaves', JSON.stringify(ignored));
      }
      setDetectedLeaves(prev => prev.filter(d => d.hash !== hash));
      toast.success("Leave alert ignored.");
  };

  const selectDetectedLeave = (leave: DetectedLeave) => {
      setLeaveData({
          name: leave.host.full_name || '',
          host_id: leave.host.host_id || '',
          designation: leave.host.role || '',
          department: leave.host.department || 'Housekeeping',
          joining_date: leave.host.joining_date?.split('T')[0] || '',
          contact_no: leave.host.personal_mobile || '',
          total_days: leave.total_days,
          start_date: leave.start_date,
          end_date: leave.end_date,
          duty_date: leave.duty_date,
          breakdown: leave.breakdown
      });
      toast.success('Form pre-filled from roster data!');
  };

  const selectManualHostForLeave = (host: Host) => {
      setHostSearch('');
      setIsHostDropdownOpen(false);
      setLeaveData({
          name: host.full_name || '',
          host_id: host.host_id || '',
          designation: host.role || '',
          department: host.department || 'Housekeeping',
          joining_date: host.joining_date?.split('T')[0] || '',
          contact_no: host.personal_mobile || '',
          total_days: '', start_date: '', end_date: '', duty_date: '', breakdown: {}
      });
  };

  const generateLeavePdf = async () => {
      setIsProcessing(true);
      setLogs([]);
      addToLog(`🚀 Drawing Custom Leave Request for ${leaveData.name}...`);

      try {
          const pdfDoc = await PDFDocument.create();
          let font = await pdfDoc.embedFont(StandardFonts.Helvetica);
          let boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

          if (fontBytes) {
              const fontkit = (await import('@pdf-lib/fontkit')).default;
              pdfDoc.registerFontkit(fontkit);
              font = await pdfDoc.embedFont(fontBytes);
              boldFont = font; 
              addToLog("Using Uploaded Font for rendering.");
          }

          const page = pdfDoc.addPage([595.28, 841.89]); 
          const { width, height } = page.getSize();
          const margin = 40;

          const themeColor = rgb(109/255, 33/255, 88/255); 
          const lightGray = rgb(0.95, 0.95, 0.95);
          const black = rgb(0, 0, 0);

          // 1. HEADER
          page.drawRectangle({ x: margin, y: height - 80, width: width - 2 * margin, height: 40, color: themeColor });
          page.drawText("HOST LEAVE REQUEST FORM", { x: margin + 15, y: height - 65, size: 16, font: boldFont, color: rgb(1,1,1) });
          page.drawText("Generated on: " + getToday(), { x: width - margin - 120, y: height - 62, size: 9, font: font, color: rgb(1,1,1) });

          const drawCell = (label: string, value: string, x: number, y: number, w: number, h: number) => {
              page.drawRectangle({ x, y, width: w, height: h, borderColor: black, borderWidth: 0.5 });
              page.drawRectangle({ x, y: y + h - 15, width: w, height: 15, color: lightGray, borderColor: black, borderWidth: 0.5 });
              page.drawText(label.toUpperCase(), { x: x + 5, y: y + h - 11, size: 8, font: boldFont, color: themeColor });
              page.drawText(value || "-", { x: x + 5, y: y + 10, size: 10, font: font, color: black });
          };

          // 2. HOST DETAILS
          let currentY = height - 130;
          page.drawText("1. HOST DETAILS", { x: margin, y: currentY + 5, size: 11, font: boldFont, color: themeColor });
          
          currentY -= 40;
          drawCell("Host Name", leaveData.name, margin, currentY, 250, 40);
          drawCell("Host No (SSL)", leaveData.host_id, margin + 250, currentY, 130, 40);
          drawCell("Contact No", leaveData.contact_no, margin + 380, currentY, 135, 40);

          currentY -= 40;
          drawCell("Designation", leaveData.designation, margin, currentY, 250, 40);
          drawCell("Department", leaveData.department, margin + 250, currentY, 130, 40);
          drawCell("Date of Join", formatDateForPDF(leaveData.joining_date), margin + 380, currentY, 135, 40);

          // 3. LEAVE DETAILS
          currentY -= 30;
          page.drawText("2. LEAVE DETAILS", { x: margin, y: currentY + 5, size: 11, font: boldFont, color: themeColor });

          currentY -= 50;
          page.drawRectangle({ x: margin, y: currentY, width: width - 2 * margin, height: 50, borderColor: black, borderWidth: 0.5 });
          page.drawRectangle({ x: margin, y: currentY + 35, width: width - 2 * margin, height: 15, color: lightGray, borderColor: black, borderWidth: 0.5 });
          page.drawText("LEAVE BREAKDOWN", { x: margin + 5, y: currentY + 39, size: 8, font: boldFont, color: themeColor });

          let boxX = margin + 10;
          const boxY = currentY + 12;
          
          const allLeavesArray = Object.entries(leaveData.breakdown || {});
          
          if (allLeavesArray.length > 0) {
              allLeavesArray.forEach(([code, count]) => {
                  const displayCode = code === 'O' ? 'OFF' : code;
                  page.drawRectangle({ x: boxX, y: boxY, width: 10, height: 10, borderColor: black, borderWidth: 1 });
                  page.drawText("X", { x: boxX + 2, y: boxY + 2, size: 8, font: boldFont });
                  
                  page.drawText(`${displayCode}:`, { x: boxX + 15, y: boxY + 1, size: 9, font: boldFont });
                  page.drawText(`${count} Days`, { x: boxX + 35, y: boxY + 1, size: 9, font, color: themeColor });
                  
                  boxX += 90;
              });
          } else {
              page.drawText("Manual Leave Request - No Database Breakdown Available.", { x: boxX, y: boxY + 1, size: 9, font: font, color: rgb(0.4, 0.4, 0.4) });
          }

          currentY -= 40;
          drawCell("Total Days Requested", String(leaveData.total_days), margin, currentY, 150, 40);
          drawCell("Start Date", formatDateForPDF(leaveData.start_date), margin + 150, currentY, 120, 40);
          drawCell("End Date", formatDateForPDF(leaveData.end_date), margin + 270, currentY, 120, 40);
          drawCell("Return to Duty Date", formatDateForPDF(leaveData.duty_date), margin + 390, currentY, 125, 40);

          // 4. SIGNATURES
          currentY -= 30;
          page.drawText("3. AUTHORIZATION", { x: margin, y: currentY + 5, size: 11, font: boldFont, color: themeColor });

          currentY -= 70;
          const sigWidth = (width - 2 * margin - 20) / 3;
          
          page.drawRectangle({ x: margin, y: currentY, width: sigWidth, height: 60, borderColor: black, borderWidth: 0.5 });
          page.drawText("Host Signature", { x: margin + 5, y: currentY + 45, size: 8, font: boldFont });
          page.drawText("Date: ________________", { x: margin + 5, y: currentY + 10, size: 8, font });

          page.drawRectangle({ x: margin + sigWidth + 10, y: currentY, width: sigWidth, height: 60, borderColor: black, borderWidth: 0.5 });
          page.drawText("Supervisor Signature", { x: margin + sigWidth + 15, y: currentY + 45, size: 8, font: boldFont });
          page.drawText("Date: ________________", { x: margin + sigWidth + 15, y: currentY + 10, size: 8, font });

          page.drawRectangle({ x: margin + 2 * sigWidth + 20, y: currentY, width: sigWidth, height: 60, borderColor: black, borderWidth: 0.5 });
          page.drawText("HOD Signature", { x: margin + 2 * sigWidth + 25, y: currentY + 45, size: 8, font: boldFont });
          page.drawText("Date: ________________", { x: margin + 2 * sigWidth + 25, y: currentY + 10, size: 8, font });

          // 5. CUT LINE
          currentY -= 40;
          page.drawLine({ start: { x: 20, y: currentY }, end: { x: width - 20, y: currentY }, thickness: 1, dashArray: [5, 5], color: rgb(0.5, 0.5, 0.5) });
          page.drawText("✂ TEAR HERE ✂", { x: width / 2 - 40, y: currentY - 3, size: 10, font: boldFont, color: rgb(0.5, 0.5, 0.5), opacity: 0.8 });

          // 6. TEAR OFF SLIP
          currentY -= 40;
          page.drawRectangle({ x: margin, y: currentY - 140, width: width - 2 * margin, height: 160, borderColor: themeColor, borderWidth: 1 });
          page.drawRectangle({ x: margin, y: currentY, width: width - 2 * margin, height: 20, color: themeColor });
          page.drawText("LEAVE APPROVAL SLIP (HOST COPY)", { x: margin + 10, y: currentY + 5, size: 12, font: boldFont, color: rgb(1,1,1) });

          currentY -= 20;
          page.drawText(`Host Name: ${leaveData.name}  |  SSL No: ${leaveData.host_id}`, { x: margin + 10, y: currentY - 15, size: 10, font });
          page.drawText(`Designation: ${leaveData.designation}  |  Department: ${leaveData.department}`, { x: margin + 10, y: currentY - 35, size: 10, font });
          
          page.drawLine({ start: { x: margin + 10, y: currentY - 45 }, end: { x: width - margin - 10, y: currentY - 45 }, thickness: 0.5, color: lightGray });

          const breakdownStr = allLeavesArray.map(([k,v]) => `${v} ${k==='O'?'OFF':k}`).join(', ');
          page.drawText(`Leaves Approved: ${breakdownStr || 'Manual Entry'}  |  Total Days: ${leaveData.total_days}`, { x: margin + 10, y: currentY - 65, size: 10, font: boldFont });
          page.drawText(`Start Date: ${formatDateForPDF(leaveData.start_date)}  |  End Date: ${formatDateForPDF(leaveData.end_date)}`, { x: margin + 10, y: currentY - 85, size: 10, font });
          page.drawText(`Return to Duty: ${formatDateForPDF(leaveData.duty_date)}`, { x: margin + 10, y: currentY - 105, size: 10, font: boldFont, color: themeColor });

          page.drawText("Authorized HR / HOD Stamp & Signature: _______________________", { x: margin + 10, y: currentY - 130, size: 9, font: boldFont });

          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          
          setPreviewUrl(url);
          addToLog("✅ Leave Form Generated Successfully!");
          setIsProcessing(false);

      } catch (e: any) {
          console.error(e);
          toast.error("Generation Error: " + e.message);
          setIsProcessing(false);
      }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6 overflow-y-auto md:overflow-hidden animate-in slide-in-from-bottom-4">
        
        {/* LEFT CONTROLS */}
        <div className="w-full md:w-[50%] lg:w-[45%] flex flex-col md:overflow-y-auto md:pr-3 pb-4 md:pb-10 custom-scrollbar space-y-4 shrink-0">
            
            {/* 1. AUTO DETECTED ALERTS */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-emerald-700 mb-3 text-sm flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="flex items-center gap-2"><CalendarDays size={16}/> Roster Auto-Detection</span>
                    {isLoadingLeaves && <Loader2 size={14} className="animate-spin text-emerald-500" />}
                </h3>
                
                <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                    {detectedLeaves.length === 0 && !isLoadingLeaves ? (
                        <div className="text-center py-6">
                            <p className="text-xs text-slate-400 italic font-bold">No unhandled leaves {"(>2 days)"} detected in the roster.</p>
                        </div>
                    ) : (
                        detectedLeaves.map((leave) => (
                            <div key={leave.hash} className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-black text-emerald-900 text-sm">{leave.host.full_name}</p>
                                        <p className="text-[10px] font-bold text-emerald-700 mt-0.5">{formatDateForPDF(leave.start_date)} - {formatDateForPDF(leave.end_date)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-emerald-700 text-sm">{leave.total_days} Days</p>
                                    </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {Object.entries(leave.breakdown).map(([code, count]) => {
                                        const displayCode = code === 'O' ? 'OFF' : code;
                                        return (
                                        <span key={code} className="text-[9px] bg-white text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-bold uppercase">
                                            {count} {displayCode}
                                        </span>
                                    )})}
                                </div>

                                <div className="flex gap-2 mt-2 pt-2 border-t border-emerald-100/50">
                                    <button onClick={() => selectDetectedLeave(leave)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest py-2 rounded-lg transition-colors">
                                        Review & Print
                                    </button>
                                    <button onClick={() => ignoreLeaveBlock(leave.hash)} className="px-3 bg-white text-emerald-600 hover:text-rose-600 hover:bg-rose-50 text-[10px] font-black uppercase tracking-widest py-2 rounded-lg transition-colors border border-emerald-100">
                                        <EyeOff size={14}/>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 2. MANUAL OVERRIDE / SEARCH */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative">
                <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><Users size={16} className="text-[#6D2158]"/> Manual Search (Override)</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                    <input 
                        type="text" 
                        className="w-full pl-10 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] transition-colors" 
                        placeholder="Search host name to manually draft..."
                        value={hostSearch}
                        onChange={e => setHostSearch(e.target.value)}
                        onFocus={() => setIsHostDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsHostDropdownOpen(false), 200)}
                    />
                    {isHostDropdownOpen && (
                        <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-2xl mt-2 max-h-56 overflow-y-auto custom-scrollbar">
                            {hosts.filter(h => (h.full_name || '').toLowerCase().includes(hostSearch.toLowerCase()) || (h.host_id || '').toLowerCase().includes(hostSearch.toLowerCase())).map(h => (
                                <div key={h.id} onMouseDown={() => selectManualHostForLeave(h)} className="p-3 hover:bg-[#6D2158]/5 cursor-pointer border-b border-slate-50 text-xs font-bold text-slate-700 flex justify-between items-center group transition-colors">
                                    <span className="group-hover:text-[#6D2158]">{h.full_name}</span> 
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{h.host_id}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 3. HOST DETAILS (Editable) */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 border-b border-slate-100 pb-3"><FileText size={16}/> Form Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Host Name</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors" value={leaveData.name} onChange={e=>setLeaveData({...leaveData, name: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">SSL No</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors" value={leaveData.host_id} onChange={e=>setLeaveData({...leaveData, host_id: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Contact No</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors" value={leaveData.contact_no} onChange={e=>setLeaveData({...leaveData, contact_no: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Start Date</label><input type="date" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors text-slate-700" value={leaveData.start_date} onChange={e=>setLeaveData({...leaveData, start_date: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">End Date</label><input type="date" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors text-slate-700" value={leaveData.end_date} onChange={e=>setLeaveData({...leaveData, end_date: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Total Days</label><input type="number" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors" value={leaveData.total_days} onChange={e=>setLeaveData({...leaveData, total_days: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Duty Date (Return)</label><input type="date" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors text-slate-700" value={leaveData.duty_date} onChange={e=>setLeaveData({...leaveData, duty_date: e.target.value})}/></div>
                </div>
            </div>

            {/* GENERATE */}
            <button onClick={generateLeavePdf} disabled={isProcessing || !leaveData.name} className="w-full bg-[#6D2158] text-white py-4 md:py-5 rounded-xl font-black tracking-widest uppercase shadow-lg hover:bg-[#5a1b49] disabled:opacity-50 transition-all flex justify-center items-center gap-2 text-sm shrink-0 active:scale-95 mt-4">
                {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <Scissors size={18} className="transform rotate-90"/>}
                Generate Request Form
            </button>

            {/* DESKTOP LOGS (Hidden on mobile) */}
            <div className="hidden md:block bg-slate-100 p-3 rounded-xl h-24 overflow-y-auto text-[10px] font-mono text-slate-500 shrink-0 custom-scrollbar">
                {logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
            </div>
        </div>

        {/* RIGHT PREVIEW */}
        <div className="w-full md:w-[50%] lg:w-[55%] h-[500px] md:h-auto md:flex-1 bg-slate-200 rounded-2xl border border-slate-300 shadow-inner flex flex-col overflow-hidden relative shrink-0">
            {previewUrl ? (
                <iframe src={previewUrl} className="w-full h-full" title="PDF Preview"/>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <FileText size={48} className="mb-4 opacity-30"/>
                    <p className="text-sm font-bold">No Preview Generated</p>
                    <p className="text-[10px] uppercase tracking-widest mt-2 max-w-[200px] text-center">Select an auto-detected leave or fill out the manual form to draw the PDF.</p>
                </div>
            )}
        </div>
    </div>
  );
}
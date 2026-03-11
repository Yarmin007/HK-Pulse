"use client";
import React, { useState, useEffect } from 'react';
import { 
  Printer, Upload, Settings, CheckCircle2, X, 
  Download, Cloud, Loader2, AlertCircle, Eye, 
  ArrowRight, Search, Type, Trash2, FileText, Plane, History as HistoryIcon, Users, UserPlus 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, PDFTextField, PDFCheckBox, PDFFont } from 'pdf-lib';
import { supabase } from '@/lib/supabase';

// --- CONFIG ---
const DEPARTURE_TEMPLATE = 'dep_laundry_template.pdf';
const FLIGHT_TEMPLATE = 'flight_template.pdf';
const FONT_FILENAME = 'book_antiqua.ttf';

type Mode = 'DASHBOARD' | 'DEPARTURE' | 'FLIGHT';

type Host = { 
    id: string; 
    host_id: string; 
    full_name: string; 
    role: string; 
    department?: string;
    joining_date?: string;
    contact_no?: string;
};

const getToday = () => {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const getTargetDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2); 
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatDateForPDF = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
};

const cleanName = (fullName: string) => {
    if (!fullName) return '';
    let cleaned = fullName.replace(/\*/g, ''); 
    cleaned = cleaned.replace(/\"/g, '');      
    cleaned = cleaned.replace(/\n/g, ' ').replace(/\r/g, ''); 
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/Name$/, '').trim(); 

    if (cleaned.includes(',')) {
        const parts = cleaned.split(',').map(s => s.trim());
        let firstname = parts[1] || '';
        firstname = firstname.replace(/Ms$|Mr$|Mrs$/, '').trim();

        let title = parts[2] || ''; 
        title = title.replace(/Alfaalil/gi, "Mr.").replace(/Alfaalila/gi, "Ms.");

        if (title && title.length < 6 && !title.match(/\d/)) { 
            return `${title} ${firstname}`; 
        } else {
            return firstname; 
        }
    }
    return cleaned;
};

const formatSalutation = (guests: string[]) => {
    const unique = Array.from(new Set(guests.filter(g => g && g.length > 1)));
    if (unique.length === 0) return 'Guest';
    if (unique.length === 1) return unique[0]; 
    if (unique.length === 2) return `${unique[0]} & ${unique[1]}`;
    return `${unique[0]} & ${unique[1]} & Family`;
};

// --- EXPANDED FLIGHT MAPPING OPTIONS ---
const FLIGHT_MAPPING_OPTIONS = [
    { label: 'Host Name', value: 'name' },
    { label: 'SSL No', value: 'host_id' },
    { label: 'Designation', value: 'designation' },
    { label: 'Department', value: 'department' },
    { label: 'Hire Date', value: 'hire_date' },
    { label: 'Contact No', value: 'contact_no' },
    
    { label: 'P1 Name', value: 'p1_name' }, { label: 'P1 ID', value: 'p1_id' }, { label: 'P1 Rel', value: 'p1_rel' },
    { label: 'P2 Name', value: 'p2_name' }, { label: 'P2 ID', value: 'p2_id' }, { label: 'P2 Rel', value: 'p2_rel' },
    { label: 'P3 Name', value: 'p3_name' }, { label: 'P3 ID', value: 'p3_id' }, { label: 'P3 Rel', value: 'p3_rel' },
    { label: 'P4 Name', value: 'p4_name' }, { label: 'P4 ID', value: 'p4_id' }, { label: 'P4 Rel', value: 'p4_rel' },

    { label: 'Tick: AL', value: 'tick_al' },
    { label: 'Tick: Business', value: 'tick_business' },
    { label: 'Tick: R&R', value: 'tick_rr' },
    { label: 'Tick: HET', value: 'tick_het' },
    { label: 'Tick: Other', value: 'tick_other' },
    { label: 'Tick: Personal', value: 'tick_personal' },
    { label: 'Tick: Payroll YES', value: 'tick_payroll_yes' },
    { label: 'Tick: Payroll NO', value: 'tick_payroll_no' },

    { label: 'Int. Destination', value: 'int_destination' },
    { label: 'Payroll Month', value: 'payroll_month' },
    { label: 'Dom. Flight Cost', value: 'domestic_flight' },
    { label: 'Int. Flight Cost', value: 'int_flight' },
    { label: 'Total Deductable', value: 'total_deductable' },

    { label: 'Dom. Dep Date', value: 'dom_dep_date' },
    { label: 'Dom. Dep Time', value: 'dom_dep_time' },
    { label: 'Dom. Arr Date', value: 'dom_arr_date' },
    { label: 'Dom. Arr Time', value: 'dom_arr_time' },
    
    { label: 'Int. Dep Date', value: 'int_dep_date' },
    { label: 'Int. Dep Time', value: 'int_dep_time' },
    { label: 'Int. Arr Date', value: 'int_arr_date' },
    { label: 'Int. Arr Time', value: 'int_arr_time' },
];

export default function PrintHubPage() {
  const [activeMode, setActiveMode] = useState<Mode>('DASHBOARD');
  
  // Resources Shared
  const [fontBytes, setFontBytes] = useState<ArrayBuffer | null>(null);
  const [fontStatus, setFontStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [toast, setToast] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  // --- DEPARTURE STATE ---
  const [villaGroups, setVillaGroups] = useState<{id: string, villa: string, salutation: string}[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [templateBytes, setTemplateBytes] = useState<ArrayBuffer | null>(null);
  const [templateStatus, setTemplateStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  const [pdfFields, setPdfFields] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  // --- FLIGHT STATE ---
  const [flightTemplateBytes, setFlightTemplateBytes] = useState<ArrayBuffer | null>(null);
  const [flightTemplateStatus, setFlightTemplateStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  const [flightPdfFields, setFlightPdfFields] = useState<string[]>([]);
  const [flightFieldMapping, setFlightFieldMapping] = useState<Record<string, string>>({});
  
  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostSearch, setHostSearch] = useState('');
  const [isHostDropdownOpen, setIsHostDropdownOpen] = useState(false);
  
  const [flightData, setFlightData] = useState({ 
      name: '', host_id: '', designation: '', department: 'Housekeeping', hire_date: '', contact_no: '',
      p1_name: '', p1_id: '', p1_rel: '',
      p2_name: '', p2_id: '', p2_rel: '',
      p3_name: '', p3_id: '', p3_rel: '',
      p4_name: '', p4_id: '', p4_rel: '',
      leave_types: [] as string[], 
      payroll_deduction: '',
      int_destination: '',
      payroll_month: '', domestic_flight: '', int_flight: '', total_deductable: '',
      dom_dep_date: '', dom_dep_time: '', dom_arr_date: '', dom_arr_time: '',
      int_dep_date: '', int_dep_time: '', int_arr_date: '', int_arr_time: ''
  });
  
  const [flightHistory, setFlightHistory] = useState<any[]>([]);

  useEffect(() => {
    if (activeMode === 'DEPARTURE') {
        loadResource(DEPARTURE_TEMPLATE, setTemplateBytes, setTemplateStatus, 'DEPARTURE');
        loadResource(FONT_FILENAME, setFontBytes, setFontStatus);
    } else if (activeMode === 'FLIGHT') {
        loadResource(FLIGHT_TEMPLATE, setFlightTemplateBytes, setFlightTemplateStatus, 'FLIGHT');
        loadResource(FONT_FILENAME, setFontBytes, setFontStatus);
        fetchHosts();
        fetchFlightHistory();
        
        // Restore mappings from localStorage for BOTH modes
        const savedFlightMap = localStorage.getItem('flight_field_mapping');
        if (savedFlightMap) {
            try { setFlightFieldMapping(JSON.parse(savedFlightMap)); } catch(e) {}
        }
    } else {
        setPreviewUrl(null);
        setLogs([]);
    }
  }, [activeMode]);

  const showToast = (type: 'success' | 'error', msg: string) => {
      setToast({ type, msg });
      setTimeout(() => setToast(null), 4000);
  };

  const addToLog = (msg: string) => setLogs(prev => [msg, ...prev]);

  const loadResource = async (filename: string, setBytes: any, setStatus: any, mode?: Mode) => {
      setStatus('LOADING');
      const { data } = await supabase.storage.from('templates').download(filename);
      if (data) {
          const buf = await data.arrayBuffer();
          setBytes(buf);
          setStatus('READY');
          if (mode) analyzePdf(buf, mode);
      } else {
          setStatus('MISSING');
      }
  };

  const fetchHosts = async () => {
      try {
          const { data } = await supabase.from('hsk_hosts').select('*').order('full_name');
          if (data) setHosts(data as Host[]);
      } catch (err) {
          console.warn("Could not fetch hosts:", err);
      }
  };

  const fetchFlightHistory = async () => {
      try {
          const { data, error } = await supabase.from('hsk_flight_requests').select('*').order('created_at', { ascending: false }).limit(20);
          if (!error && data) setFlightHistory(data);
      } catch(e) { console.warn(e); }
  };

  const analyzePdf = async (buffer: ArrayBuffer, mode: Mode) => {
      const pdfDoc = await PDFDocument.load(buffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields().map(f => f.getName());
      
      if (mode === 'DEPARTURE') {
          setPdfFields(fields);
          
          // Auto-Load from Local Storage for Departure
          const savedDepMap = localStorage.getItem('dep_field_mapping');
          if (savedDepMap) {
              try { setFieldMapping(JSON.parse(savedDepMap)); } catch(e) {}
          } else {
              const initialMap: Record<string, string> = {};
              fields.forEach(f => {
                  const lower = f.toLowerCase();
                  if (lower.includes('text3')) initialMap[f] = 'villa'; 
                  else if (lower.includes('text4')) initialMap[f] = 'targetDate'; 
                  else if (lower.includes('name') || lower.includes('guest')) initialMap[f] = 'salutation'; 
                  else if (lower.includes('date') && !lower.includes('target')) initialMap[f] = 'todayDate'; 
              });
              setFieldMapping(initialMap);
          }
      } else if (mode === 'FLIGHT') {
          setFlightPdfFields(fields);
      }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>, filename: string, setBytes: any, setStatus: any, mode: Mode) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setStatus('LOADING');
      const { error } = await supabase.storage.from('templates').upload(filename, file, { upsert: true });
      if (error) { setStatus('MISSING'); showToast('error', "Upload Failed"); return; }
      
      const buf = await file.arrayBuffer();
      setBytes(buf);
      setStatus('READY');
      analyzePdf(buf, mode);
      showToast('success', "Template Saved!");
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFontStatus('LOADING');
      const { error } = await supabase.storage.from('templates').upload(FONT_FILENAME, file, { upsert: true });
      if (error) { setFontStatus('MISSING'); showToast('error', "Font Upload Failed"); return; }
      const buf = await file.arrayBuffer();
      setFontBytes(buf);
      setFontStatus('READY');
      showToast('success', "Book Antiqua Loaded!");
  };

  const identifyFields = async (bytes: ArrayBuffer | null) => {
      if (!bytes) return;
      setIsProcessing(true);
      try {
          const pdfDoc = await PDFDocument.load(bytes);
          const form = pdfDoc.getForm();
          const fields = form.getFields();
          
          let identifyFont: PDFFont | undefined;
          try {
             if (fontBytes) {
                 const fontkit = (await import('@pdf-lib/fontkit')).default;
                 pdfDoc.registerFontkit(fontkit);
                 identifyFont = await pdfDoc.embedFont(fontBytes);
             } else {
                 identifyFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
             }
          } catch(e) {}
          
          fields.forEach(field => {
               if (field instanceof PDFTextField) {
                   try {
                       field.setText('');
                       field.setText(field.getName()); 
                       field.setFontSize(7); 
                       if (identifyFont) field.updateAppearances(identifyFont);
                   } catch (e) {}
               } else if (field instanceof PDFCheckBox) {
                   try {
                       field.uncheck(); 
                       field.check();   
                   } catch(e) {}
               }
          });
          
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          addToLog("🕵️ DETECTIVE MODE: Check preview to see Field Names!");
      } catch(e) { console.error(e); showToast('error', "Identification Failed"); }
      setIsProcessing(false);
  }

  // --- DEPARTURE PARSING LOGIC ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.name.toLowerCase().endsWith('.pdf')) parsePDF(file);
      else parseExcel(file);
  };

  const parseExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
            processRawData(rows);
        } catch (err) { showToast('error', "Excel Parse Error"); }
    };
    reader.readAsArrayBuffer(file);
  };

  const parsePDF = async (file: File) => {
      addToLog("📄 Parsing PDF...");
      try {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument(arrayBuffer);
          const pdf = await loadingTask.promise;
          
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              fullText += content.items.map((item: any) => item.str).join('\n') + '\n';
          }

          const villaMatches = fullText.match(/(?:\n|^)(\d{2,3})(?:\n|$)/gm) || [];
          const villas = villaMatches.map(v => v.trim()).filter(v => v.length < 4);

          const nameRegex = /(?:\*|^")?[A-Za-z \-\']+,[A-Za-z \-\']+(?:,[A-Za-z \-\'\.]+)?/gm;
          const nameMatches = fullText.match(nameRegex) || [];

          if (villas.length === 0 || nameMatches.length === 0) {
              showToast('error', "Parse Failed: No data found");
              return;
          }

          const rawGroups = new Map<string, string[]>();
          const count = Math.min(villas.length, nameMatches.length);

          for (let i = 0; i < count; i++) {
              const v = villas[i];
              const n = cleanName(nameMatches[i]); 
              if (rawGroups.has(v)) rawGroups.get(v)!.push(n);
              else rawGroups.set(v, [n]);
          }

          const processed = Array.from(rawGroups.entries()).map(([villa, guests], idx) => ({
              id: idx.toString(),
              villa,
              salutation: formatSalutation(guests)
          }));

          setVillaGroups(processed);
          showToast('success', `Found ${processed.length} villas.`);
          addToLog(`✅ Extracted ${processed.length} villas.`);

      } catch (err: any) {
          console.error(err);
          showToast('error', "PDF Parse Failed: " + err.message);
      }
  };

  const processRawData = (rows: any[][]) => {
      let headerIdx = -1;
      let colMap: any = {};
      
      for(let i=0; i<Math.min(rows.length, 30); i++) {
          const rowStr = rows[i].join(' ').toUpperCase();
          if(rowStr.includes('VILLA') && (rowStr.includes('NAME') || rowStr.includes('NO.'))) {
              headerIdx = i;
              rows[i].forEach((cell: any, idx: number) => {
                  const c = String(cell).toUpperCase();
                  if(c.includes('VILLA') || c === 'NO.') colMap.villa = idx;
                  else if(c.includes('NAME')) colMap.name = idx;
              });
              break;
          }
      }

      if (headerIdx === -1 || colMap.villa === undefined) {
          headerIdx = 1; colMap = { villa: 0, name: 3 }; 
      }

      const groups = new Map<string, string[]>();
      for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i];
          const villa = r[colMap.villa];
          if(!villa || isNaN(parseInt(villa))) continue;
          
          const vStr = parseInt(villa).toString();
          const name = cleanName(String(r[colMap.name] || ''));
          
          if (groups.has(vStr)) groups.get(vStr)!.push(name);
          else groups.set(vStr, [name]);
      }

      const processed = Array.from(groups.entries()).map(([villa, guests], idx) => ({
          id: idx.toString(),
          villa,
          salutation: formatSalutation(guests)
      }));

      setVillaGroups(processed);
      showToast('success', `Found ${processed.length} villas.`);
  };

  const updateDepartureMapping = (field: string, val: string) => {
      const newMap = { ...fieldMapping, [field]: val };
      setFieldMapping(newMap);
      localStorage.setItem('dep_field_mapping', JSON.stringify(newMap));
  };

  const generateMergedPdf = async () => {
      if (!templateBytes || villaGroups.length === 0) return showToast('error', "Missing Data");
      
      setIsProcessing(true);
      setLogs([]);
      addToLog(`🚀 Generating Master PDF for ${villaGroups.length} villas...`);

      try {
          const fontkit = (await import('@pdf-lib/fontkit')).default;
          const mergedPdf = await PDFDocument.create();
          mergedPdf.registerFontkit(fontkit);

          let loadedFont;
          if (fontBytes) {
              loadedFont = await mergedPdf.embedFont(fontBytes);
              addToLog("Using Uploaded Font (Book Antiqua)");
          } else {
              loadedFont = await mergedPdf.embedFont(StandardFonts.TimesRoman);
              addToLog("⚠️ No Font Uploaded. Using Times Roman.");
          }

          for (const group of villaGroups) {
              const srcDoc = await PDFDocument.load(templateBytes);
              const form = srcDoc.getForm();

              Object.keys(fieldMapping).forEach(pdfField => {
                  const dataKey = fieldMapping[pdfField]; 
                  let val = '';
                  let fontSize = 10; 

                  if (dataKey === 'salutation') { val = group.salutation; fontSize = 10; }
                  if (dataKey === 'villa') { val = group.villa; fontSize = 6; }
                  if (dataKey === 'todayDate') { val = getToday(); fontSize = 10; }
                  if (dataKey === 'targetDate') { val = getTargetDate(); fontSize = 8; }

                  try {
                      const field = form.getTextField(pdfField);
                      field.setText(val);
                      field.updateAppearances(loadedFont);
                      field.setFontSize(fontSize);
                  } catch (err) {}
              });

              form.flatten();
              const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
              copiedPages.forEach((page) => mergedPdf.addPage(page));
          }

          const pdfBytes = await mergedPdf.save();
          const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          
          setPreviewUrl(url);
          addToLog("✅ PDF Generated. Ready to Print.");
          setIsProcessing(false);

      } catch (e: any) {
          console.error(e);
          showToast('error', "Generation Error: " + e.message);
          setIsProcessing(false);
      }
  };

  // --- FLIGHT REQUISITION LOGIC ---
  const selectHostForFlight = async (host: Host) => {
      setHostSearch('');
      setIsHostDropdownOpen(false);

      // 1. COMPLETELY RESET STATE FIRST (So passenger data doesn't bleed over)
      const resetData = {
          name: host.full_name || '',
          host_id: host.host_id || '',
          designation: host.role || '',
          department: host.department || 'Housekeeping',
          hire_date: host.joining_date?.split('T')[0] || '', 
          contact_no: host.contact_no || '',
          p1_name: '', p1_id: '', p1_rel: '',
          p2_name: '', p2_id: '', p2_rel: '',
          p3_name: '', p3_id: '', p3_rel: '',
          p4_name: '', p4_id: '', p4_rel: '',
          leave_types: [] as string[], 
          payroll_deduction: '',
          int_destination: '',
          payroll_month: '', domestic_flight: '', int_flight: '', total_deductable: '',
          dom_dep_date: '', dom_dep_time: '', dom_arr_date: '', dom_arr_time: '',
          int_dep_date: '', int_dep_time: '', int_arr_date: '', int_arr_time: ''
      };

      setFlightData(resetData);

      // 2. Fetch history from DB to auto-fill previous passengers/contact info
      try {
          const { data } = await supabase
              .from('hsk_flight_requests')
              .select('form_data')
              .eq('host_id', host.host_id)
              .not('form_data', 'is', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

          if (data && data.form_data) {
              const prev = data.form_data;
              setFlightData(current => ({
                  ...current,
                  hire_date: prev.hire_date || current.hire_date,
                  contact_no: prev.contact_no || current.contact_no,
                  int_destination: prev.int_destination || '',
                  leave_types: prev.leave_types || [],
                  p1_name: prev.p1_name || '', p1_id: prev.p1_id || '', p1_rel: prev.p1_rel || '',
                  p2_name: prev.p2_name || '', p2_id: prev.p2_id || '', p2_rel: prev.p2_rel || '',
                  p3_name: prev.p3_name || '', p3_id: prev.p3_id || '', p3_rel: prev.p3_rel || '',
                  p4_name: prev.p4_name || '', p4_id: prev.p4_id || '', p4_rel: prev.p4_rel || '',
              }));
              showToast('success', 'Loaded previous passenger details!');
          }
      } catch (err) {
          console.warn("Could not fetch history data", err);
      }
  };

  const updateFlightMapping = (field: string, val: string) => {
      const newMap = { ...flightFieldMapping, [field]: val };
      setFlightFieldMapping(newMap);
      localStorage.setItem('flight_field_mapping', JSON.stringify(newMap));
  };

  const toggleLeaveType = (opt: string) => {
      setFlightData(prev => {
          const types = prev.leave_types || [];
          if (types.includes(opt)) return { ...prev, leave_types: types.filter(t => t !== opt) };
          return { ...prev, leave_types: [...types, opt] };
      });
  };

  const generateFlightPdf = async () => {
      if (!flightTemplateBytes) return showToast('error', "Missing Template");
      
      setIsProcessing(true);
      setLogs([]);
      addToLog(`🚀 Generating Flight Request for ${flightData.name}...`);

      try {
          const fontkit = (await import('@pdf-lib/fontkit')).default;
          
          const srcDoc = await PDFDocument.load(flightTemplateBytes);
          srcDoc.registerFontkit(fontkit);

          let loadedFont;
          if (fontBytes) {
              loadedFont = await srcDoc.embedFont(fontBytes);
              addToLog("Using Uploaded Font (Book Antiqua)");
          } else {
              loadedFont = await srcDoc.embedFont(StandardFonts.Helvetica);
              addToLog("⚠️ No Font Uploaded. Using Default.");
          }

          const form = srcDoc.getForm();

          // 1. CLEAR ALL PRE-FILLED DATA IN THE UPLOADED PDF TEMPLATE
          const allFields = form.getFields();
          allFields.forEach(f => {
              try {
                  if (f instanceof PDFTextField) f.setText('');
                  if (f instanceof PDFCheckBox) f.uncheck();
              } catch (e) {}
          });

          // 2. FILL OUR NEW DATA
          Object.keys(flightFieldMapping).forEach(pdfField => {
              const dataKey = flightFieldMapping[pdfField]; 
              let val = '';
              
              if (dataKey.startsWith('tick_')) {
                  // Advanced Checkbox / X logic (Allows Multi-Select)
                  if (dataKey === 'tick_al' && flightData.leave_types.includes('AL')) val = 'X';
                  if (dataKey === 'tick_business' && flightData.leave_types.includes('Business')) val = 'X';
                  if (dataKey === 'tick_rr' && flightData.leave_types.includes('R&R')) val = 'X';
                  if (dataKey === 'tick_het' && flightData.leave_types.includes('HET')) val = 'X';
                  if (dataKey === 'tick_other' && flightData.leave_types.includes('Other')) val = 'X';
                  if (dataKey === 'tick_personal' && flightData.leave_types.includes('Personal')) val = 'X';
                  if (dataKey === 'tick_payroll_yes' && flightData.payroll_deduction === 'Yes') val = 'X';
                  if (dataKey === 'tick_payroll_no' && flightData.payroll_deduction === 'No') val = 'X';
              } else {
                  // Standard Text values
                  val = (flightData as any)[dataKey] || '';
                  
                  // Auto-format dates for the PDF
                  if (['hire_date', 'dom_dep_date', 'dom_arr_date', 'int_dep_date', 'int_arr_date'].includes(dataKey)) {
                      val = formatDateForPDF(val);
                  }
              }

              if (val) {
                  try {
                      const field = form.getField(pdfField);
                      if (field instanceof PDFTextField) {
                          field.setText(val);
                          field.updateAppearances(loadedFont);
                      } else if (field instanceof PDFCheckBox) {
                          field.check();
                      }
                  } catch (err) {}
              }
          });

          form.flatten();
          
          const pdfBytes = await srcDoc.save();
          const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          
          setPreviewUrl(url);
          addToLog("✅ Flight Form Generated.");
          setIsProcessing(false);

          // 3. Save History and Form Data Payload to Database
          try {
              await supabase.from('hsk_flight_requests').insert({
                  host_name: flightData.name,
                  host_id: flightData.host_id,
                  form_data: flightData
              });
              fetchFlightHistory();
          } catch(e) {}

      } catch (e: any) {
          console.error(e);
          showToast('error', "Generation Error: " + e.message);
          setIsProcessing(false);
      }
  };

  const updateVillaGroup = (id: string, field: 'villa' | 'salutation', val: string) => {
      setVillaGroups(prev => prev.map(g => g.id === id ? { ...g, [field]: val } : g));
  };

  const removeVillaGroup = (id: string) => {
      setVillaGroups(prev => prev.filter(g => g.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800 relative flex flex-col h-screen overflow-hidden">
      
      {/* HEADER */}
      <div className="flex-none mb-4 flex justify-between items-center">
          <div>
              <h1 className="text-2xl font-bold text-[#6D2158] flex items-center gap-2"><Printer/> Print Hub</h1>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">Automated PDF Generation</p>
          </div>
          {activeMode !== 'DASHBOARD' && (
              <button onClick={() => setActiveMode('DASHBOARD')} className="bg-slate-200 hover:bg-slate-300 text-slate-600 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2">
                  <X size={16}/> Close Tool
              </button>
          )}
      </div>

      {/* DASHBOARD */}
      {activeMode === 'DASHBOARD' && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 content-start animate-in fade-in">
               <button onClick={() => setActiveMode('DEPARTURE')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-[#6D2158]/10 hover:border-[#6D2158] text-left transition-all group h-40">
                  <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Download size={28}/></div>
                  <h3 className="text-lg font-bold text-slate-800">Dep. Laundry Letter</h3>
                  <p className="text-xs text-slate-400 mt-2">Bulk Generate (PDF/Excel)</p>
              </button>

              <button onClick={() => setActiveMode('FLIGHT')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-[#6D2158]/10 hover:border-[#6D2158] text-left transition-all group h-40">
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Plane size={28}/></div>
                  <h3 className="text-lg font-bold text-slate-800">Flight Request Form</h3>
                  <p className="text-xs text-slate-400 mt-2">Generate Host Ticket Requisition</p>
              </button>
          </div>
      )}

      {/* DEPARTURE LAUNDRY MODE */}
      {activeMode === 'DEPARTURE' && (
          <div className="flex-1 flex gap-6 overflow-hidden animate-in slide-in-from-bottom-4">
              
              {/* LEFT: CONTROLS */}
              <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-10 custom-scrollbar">
                  
                  {/* 1. UPLOAD */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><span className="bg-slate-100 w-5 h-5 flex items-center justify-center rounded-full text-[10px]">1</span> Data Source</h3>
                      <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:bg-slate-50 relative cursor-pointer group">
                          <input type="file" accept=".xlsx,.pdf" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                          <p className="text-xs font-bold text-slate-500 group-hover:text-[#6D2158]">Upload List (PDF/Excel)</p>
                      </div>
                  </div>

                  {/* 2. RESOURCES */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><span className="bg-slate-100 w-5 h-5 flex items-center justify-center rounded-full text-[10px]">2</span> Resources</h3>
                      
                      <div className="flex justify-between items-center mb-3">
                          <span className="text-[10px] font-bold text-slate-400">Template (PDF)</span>
                          {templateStatus === 'READY' ? (
                              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 size={10}/> Ready</span>
                          ) : (
                              <div className="relative overflow-hidden">
                                  <input type="file" accept=".pdf" onChange={e => handleTemplateUpload(e, DEPARTURE_TEMPLATE, setTemplateBytes, setTemplateStatus, 'DEPARTURE')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                                  <span className="text-[10px] bg-slate-100 px-2 py-1 rounded hover:bg-slate-200 cursor-pointer">Upload</span>
                              </div>
                          )}
                      </div>

                      <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400">Font (Book Antiqua)</span>
                          {fontStatus === 'READY' ? (
                              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1"><Type size={10}/> Loaded</span>
                          ) : (
                              <div className="relative overflow-hidden">
                                  <input type="file" accept=".ttf" onChange={handleFontUpload} className="absolute inset-0 opacity-0 cursor-pointer"/>
                                  <span className="text-[10px] bg-slate-100 px-2 py-1 rounded hover:bg-slate-200 cursor-pointer">Upload .ttf</span>
                              </div>
                          )}
                      </div>
                  </div>

                  {/* 3. EDIT LIST */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-1 min-h-[200px] flex flex-col">
                      <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Eye size={14}/> Guests ({villaGroups.length})</h3>
                          <button onClick={() => setIsEditing(!isEditing)} className="text-[10px] font-bold text-slate-400 hover:text-[#6D2158]">{isEditing ? 'Done' : 'Edit'}</button>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                          {villaGroups.map(g => (
                              <div key={g.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-100 text-[11px]">
                                  {isEditing ? (
                                      <>
                                          <input className="w-8 p-0.5 bg-white border rounded text-center font-bold" value={g.villa} onChange={e => updateVillaGroup(g.id, 'villa', e.target.value)}/>
                                          <input className="flex-1 p-0.5 bg-white border rounded" value={g.salutation} onChange={e => updateVillaGroup(g.id, 'salutation', e.target.value)}/>
                                          <button onClick={() => removeVillaGroup(g.id)} className="text-rose-500"><Trash2 size={12}/></button>
                                      </>
                                  ) : (
                                      <>
                                          <span className="font-bold text-slate-400 w-8 text-center">{g.villa}</span>
                                          <span className="font-bold text-slate-700 truncate">{g.salutation}</span>
                                      </>
                                  )}
                              </div>
                          ))}
                          {villaGroups.length === 0 && <div className="text-center py-8 text-slate-300 text-xs italic">No guests loaded.</div>}
                      </div>
                  </div>

                  {/* 4. MAPPING */}
                  {pdfFields.length > 0 && (
                      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                          <div className="flex justify-between items-center mb-2">
                              <h3 className="font-bold text-slate-700 text-sm"><Settings size={14}/> Map Fields</h3>
                              <button onClick={() => identifyFields(templateBytes)} className="flex items-center gap-1 text-[10px] bg-slate-100 px-2 py-1 rounded hover:bg-slate-200">
                                  <Search size={10}/> Identify
                              </button>
                          </div>
                          
                          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                              {pdfFields.map(field => (
                                  <div key={field} className="flex justify-between items-center pr-2">
                                      <span className="text-[10px] font-bold text-slate-400 truncate max-w-[80px]" title={field}>{field}</span>
                                      <select className="w-24 p-1 text-[10px] border rounded bg-slate-50" value={fieldMapping[field] || ''} onChange={(e) => updateDepartureMapping(field, e.target.value)}>
                                          <option value="">Skip</option>
                                          <option value="salutation">Name</option>
                                          <option value="villa">Villa (Sz 6)</option>
                                          <option value="targetDate">Dep Date (Sz 8)</option>
                                          <option value="todayDate">Today's Date</option>
                                      </select>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
                  
                  {/* GENERATE */}
                  <button onClick={generateMergedPdf} disabled={isProcessing || templateStatus !== 'READY' || villaGroups.length === 0} className="w-full bg-[#6D2158] text-white py-3 rounded-xl font-bold uppercase shadow-lg hover:bg-[#5a1b49] disabled:opacity-50 transition-all flex justify-center items-center gap-2 text-sm shrink-0">
                      {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <ArrowRight size={16}/>}
                      {isProcessing ? 'Generating...' : 'Generate PDFs'} 
                  </button>

                  {/* LOGS */}
                  <div className="bg-slate-100 p-2 rounded-lg h-24 overflow-y-auto text-[10px] font-mono text-slate-500 shrink-0 custom-scrollbar">
                      {logs.map((log, i) => <div key={i}>{log}</div>)}
                  </div>
              </div>

              {/* RIGHT: LIVE PREVIEW */}
              <div className="w-2/3 bg-slate-200 rounded-2xl border border-slate-300 shadow-inner flex flex-col overflow-hidden relative">
                  {previewUrl ? (
                      <iframe src={previewUrl} className="w-full h-full" title="PDF Preview"/>
                  ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400">
                          <FileText size={48} className="mb-2 opacity-50"/>
                          <p className="text-sm font-bold">No Preview Generated</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* FLIGHT REQUISITION MODE */}
      {activeMode === 'FLIGHT' && (
          <div className="flex-1 flex gap-6 overflow-hidden animate-in slide-in-from-bottom-4">
              
              {/* LEFT CONTROLS (TALL SCROLLABLE) */}
              <div className="w-[45%] flex flex-col overflow-y-auto pr-3 pb-10 custom-scrollbar space-y-4">
                  
                  {/* 1. HOST SEARCH */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative">
                      <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><Users size={16} className="text-[#6D2158]"/> Auto-Fill Database Search</h3>
                      <div className="relative">
                          <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                          <input 
                              type="text" 
                              className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#6D2158]" 
                              placeholder="Search host name or SSL to auto-fill..."
                              value={hostSearch}
                              onChange={e => setHostSearch(e.target.value)}
                              onFocus={() => setIsHostDropdownOpen(true)}
                              onBlur={() => setTimeout(() => setIsHostDropdownOpen(false), 200)}
                          />
                          {isHostDropdownOpen && (
                              <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-2xl mt-1 max-h-48 overflow-y-auto custom-scrollbar">
                                  {hosts.filter(h => (h.full_name || '').toLowerCase().includes(hostSearch.toLowerCase()) || (h.host_id || '').toLowerCase().includes(hostSearch.toLowerCase())).map(h => (
                                      <div key={h.id} onMouseDown={() => selectHostForFlight(h)} className="p-3 hover:bg-purple-50 cursor-pointer border-b border-slate-50 text-xs font-bold text-slate-700 flex justify-between items-center group">
                                          <span className="group-hover:text-[#6D2158]">{h.full_name}</span> 
                                          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{h.host_id}</span>
                                      </div>
                                  ))}
                                  {hosts.length === 0 && <div className="p-3 text-xs text-slate-400 italic">No hosts found. Type manually below.</div>}
                              </div>
                          )}
                      </div>
                  </div>

                  {/* 2. HOST DETAILS (Editable) */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
                      <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 border-b border-slate-100 pb-2"><FileText size={16}/> Host Details</h3>
                      <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Host Name</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none" value={flightData.name} onChange={e=>setFlightData({...flightData, name: e.target.value})}/></div>
                          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">SSL No</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none" value={flightData.host_id} onChange={e=>setFlightData({...flightData, host_id: e.target.value})}/></div>
                          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Contact No</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none" value={flightData.contact_no} onChange={e=>setFlightData({...flightData, contact_no: e.target.value})}/></div>
                          <div className="col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Designation</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none" value={flightData.designation} onChange={e=>setFlightData({...flightData, designation: e.target.value})}/></div>
                          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Department</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none" value={flightData.department} onChange={e=>setFlightData({...flightData, department: e.target.value})}/></div>
                          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Hire Date</label><input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none text-slate-700" value={flightData.hire_date} onChange={e=>setFlightData({...flightData, hire_date: e.target.value})}/></div>
                      </div>
                  </div>

                  {/* 3. ADDITIONAL PASSENGERS */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
                      <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 border-b border-slate-100 pb-2"><UserPlus size={16}/> Additional Passengers</h3>
                      
                      {[1,2,3,4].map(num => (
                          <div key={num} className="grid grid-cols-12 gap-2 pb-2 mb-2 border-b border-slate-50 last:border-0 last:mb-0 last:pb-0">
                              <div className="col-span-5"><input placeholder={`P${num} Name`} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none" value={(flightData as any)[`p${num}_name`]} onChange={e=>setFlightData({...flightData, [`p${num}_name`]: e.target.value})}/></div>
                              <div className="col-span-4"><input placeholder={`ID / Passport`} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none" value={(flightData as any)[`p${num}_id`]} onChange={e=>setFlightData({...flightData, [`p${num}_id`]: e.target.value})}/></div>
                              <div className="col-span-3"><input placeholder={`Rel`} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none" value={(flightData as any)[`p${num}_rel`]} onChange={e=>setFlightData({...flightData, [`p${num}_rel`]: e.target.value})}/></div>
                          </div>
                      ))}
                  </div>

                  {/* 4. REQUEST OPTIONS */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
                      <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 border-b border-slate-100 pb-2">Request Options</h3>
                      
                      <div className="grid grid-cols-3 gap-2">
                          {['AL', 'Business', 'R&R', 'HET', 'Personal', 'Other'].map(opt => (
                              <label key={opt} className={`text-[10px] font-bold border rounded-lg p-2 flex items-center justify-center cursor-pointer transition-colors ${flightData.leave_types.includes(opt) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-inner' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                                  <input type="checkbox" className="hidden" checked={flightData.leave_types.includes(opt)} onChange={() => toggleLeaveType(opt)}/> {opt}
                              </label>
                          ))}
                      </div>

                      <div className="mt-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Int. Destination / Route</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none" value={flightData.int_destination} onChange={e=>setFlightData({...flightData, int_destination: e.target.value})}/></div>

                      <div className="flex gap-4 items-center bg-slate-50 p-3 rounded-xl border border-slate-200 mt-2">
                          <span className="text-xs font-bold text-slate-600">Payroll Deduction?</span>
                          <label className="text-xs font-bold flex items-center gap-1 cursor-pointer"><input type="radio" name="payroll" checked={flightData.payroll_deduction === 'Yes'} onChange={() => setFlightData({...flightData, payroll_deduction: 'Yes'})}/> Yes</label>
                          <label className="text-xs font-bold flex items-center gap-1 cursor-pointer"><input type="radio" name="payroll" checked={flightData.payroll_deduction === 'No'} onChange={() => setFlightData({...flightData, payroll_deduction: 'No'})}/> No</label>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                          <div><label className="text-[9px] font-bold text-slate-400 uppercase">Payroll Month</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none" value={flightData.payroll_month} onChange={e=>setFlightData({...flightData, payroll_month: e.target.value})}/></div>
                          <div><label className="text-[9px] font-bold text-slate-400 uppercase">Total Deductable</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none" value={flightData.total_deductable} onChange={e=>setFlightData({...flightData, total_deductable: e.target.value})}/></div>
                          <div><label className="text-[9px] font-bold text-slate-400 uppercase">Domestic Cost</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none" value={flightData.domestic_flight} onChange={e=>setFlightData({...flightData, domestic_flight: e.target.value})}/></div>
                          <div><label className="text-[9px] font-bold text-slate-400 uppercase">Int. Cost</label><input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none" value={flightData.int_flight} onChange={e=>setFlightData({...flightData, int_flight: e.target.value})}/></div>
                      </div>
                  </div>

                  {/* 5. FLIGHT SCHEDULE */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
                      <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 border-b border-slate-100 pb-2"><Plane size={16}/> Flight Schedule</h3>
                      
                      <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 mb-2">
                          <p className="text-[10px] font-black text-blue-600 mb-2">DOMESTIC</p>
                          <div className="grid grid-cols-2 gap-2">
                              <div><label className="text-[9px] font-bold text-slate-400 uppercase">Dep Date</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700" value={flightData.dom_dep_date} onChange={e=>setFlightData({...flightData, dom_dep_date: e.target.value})}/></div>
                              <div><label className="text-[9px] font-bold text-slate-400 uppercase">Dep Time</label><input type="text" placeholder="HH:MM" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none" value={flightData.dom_dep_time} onChange={e=>setFlightData({...flightData, dom_dep_time: e.target.value})}/></div>
                              <div><label className="text-[9px] font-bold text-slate-400 uppercase">Arr Date</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700" value={flightData.dom_arr_date} onChange={e=>setFlightData({...flightData, dom_arr_date: e.target.value})}/></div>
                              <div><label className="text-[9px] font-bold text-slate-400 uppercase">Arr Time</label><input type="text" placeholder="HH:MM" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none" value={flightData.dom_arr_time} onChange={e=>setFlightData({...flightData, dom_arr_time: e.target.value})}/></div>
                          </div>
                      </div>

                      <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                          <p className="text-[10px] font-black text-amber-600 mb-2">INTERNATIONAL</p>
                          <div className="grid grid-cols-2 gap-2">
                              <div><label className="text-[9px] font-bold text-slate-400 uppercase">Dep Date</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700" value={flightData.int_dep_date} onChange={e=>setFlightData({...flightData, int_dep_date: e.target.value})}/></div>
                              <div><label className="text-[9px] font-bold text-slate-400 uppercase">Dep Time</label><input type="text" placeholder="HH:MM" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none" value={flightData.int_dep_time} onChange={e=>setFlightData({...flightData, int_dep_time: e.target.value})}/></div>
                              <div><label className="text-[9px] font-bold text-slate-400 uppercase">Arr Date</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700" value={flightData.int_arr_date} onChange={e=>setFlightData({...flightData, int_arr_date: e.target.value})}/></div>
                              <div><label className="text-[9px] font-bold text-slate-400 uppercase">Arr Time</label><input type="text" placeholder="HH:MM" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none" value={flightData.int_arr_time} onChange={e=>setFlightData({...flightData, int_arr_time: e.target.value})}/></div>
                          </div>
                      </div>
                  </div>

                  {/* 6. RESOURCES & MAPPING */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center justify-between">
                          <span className="flex items-center gap-2"><Settings size={16}/> Template & Map</span>
                          {flightTemplateStatus === 'READY' ? <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded font-bold">Ready</span> : (
                              <div className="relative cursor-pointer text-[10px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded font-bold">
                                  Upload Template
                                  <input type="file" accept=".pdf" onChange={e => handleTemplateUpload(e, FLIGHT_TEMPLATE, setFlightTemplateBytes, setFlightTemplateStatus, 'FLIGHT')} className="absolute inset-0 opacity-0 cursor-pointer"/>
                              </div>
                          )}
                      </h3>
                      
                      {flightPdfFields.length > 0 && (
                          <div className="space-y-2 mt-4 border-t border-slate-100 pt-3 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                              <div className="flex justify-end"><button onClick={() => identifyFields(flightTemplateBytes)} className="text-[10px] bg-slate-100 px-2 py-1 rounded hover:bg-slate-200 flex items-center gap-1"><Search size={10}/> Identify Fields</button></div>
                              {flightPdfFields.map(field => (
                                  <div key={field} className="flex justify-between items-center">
                                      <span className="text-[10px] font-bold text-slate-400 truncate max-w-[100px]" title={field}>{field}</span>
                                      <select className="w-32 p-1 text-[10px] border rounded bg-slate-50 outline-none font-bold" value={flightFieldMapping[field] || ''} onChange={(e) => updateFlightMapping(field, e.target.value)}>
                                          <option value="">Skip</option>
                                          {FLIGHT_MAPPING_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                      </select>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>

                  {/* GENERATE */}
                  <button onClick={generateFlightPdf} disabled={isProcessing || flightTemplateStatus !== 'READY' || !flightData.name} className="w-full bg-[#6D2158] text-white py-4 rounded-xl font-black tracking-widest uppercase shadow-lg hover:bg-[#5a1b49] disabled:opacity-50 transition-all flex justify-center items-center gap-2 text-sm shrink-0">
                      {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <Printer size={18}/>}
                      Generate Request
                  </button>

                  {/* HISTORY */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-1 min-h-[150px] flex flex-col">
                      <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 mb-3"><HistoryIcon size={16}/> Generated History</h3>
                      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                          {flightHistory.map(h => (
                              <div key={h.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex justify-between items-center group">
                                  <span className="font-bold text-xs text-slate-700">{h.host_name} <span className="text-[10px] text-slate-400 font-normal ml-1">{h.host_id}</span></span>
                                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{new Date(h.created_at).toLocaleDateString('en-GB')}</span>
                              </div>
                          ))}
                          {flightHistory.length === 0 && <div className="text-center text-xs text-slate-400 py-4 font-bold italic">No history yet.</div>}
                      </div>
                  </div>

              </div>

              {/* RIGHT PREVIEW */}
              <div className="w-[55%] bg-slate-200 rounded-2xl border border-slate-300 shadow-inner flex flex-col overflow-hidden relative">
                  {previewUrl ? (
                      <iframe src={previewUrl} className="w-full h-full" title="PDF Preview"/>
                  ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400">
                          <FileText size={48} className="mb-2 opacity-50"/>
                          <p className="text-sm font-bold">No Preview Generated</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* TOAST */}
      {toast && (
          <div className={`fixed top-6 right-6 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in z-50 ${
              toast.type === 'success' ? 'toast-success' : 'toast-error'
          }`}>
              {toast.type === 'success' ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}
              <span className="font-bold text-sm">{toast.msg}</span>
          </div>
      )}
    </div>
  );
}
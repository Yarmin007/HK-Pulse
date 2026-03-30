"use client";
import React, { useState, useEffect } from 'react';
import { 
  Printer, Settings, CheckCircle2, X, 
  Loader2, Search, Type, FileText, Plane, History as HistoryIcon, Users, UserPlus
} from 'lucide-react';
import { PDFDocument, StandardFonts, PDFTextField, PDFCheckBox, PDFFont } from 'pdf-lib';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// --- CONFIG ---
const FLIGHT_TEMPLATE = 'flight_template.pdf';
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

const formatDateForPDF = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
};

// --- FLIGHT MAPPING OPTIONS ---
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

export default function FlightRequestMode() {
  // --- STATE ---
  const [fontBytes, setFontBytes] = useState<ArrayBuffer | null>(null);
  const [fontStatus, setFontStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
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

  // --- INIT ---
  useEffect(() => {
      loadResource(FLIGHT_TEMPLATE, setFlightTemplateBytes, setFlightTemplateStatus, true);
      loadResource(FONT_FILENAME, setFontBytes, setFontStatus);
      fetchHosts();
      fetchFlightHistory();
      
      const savedMap = localStorage.getItem('flight_field_mapping');
      if (savedMap) {
          try { setFlightFieldMapping(JSON.parse(savedMap)); } catch(e) {}
      }
  }, []);

  // --- METHODS ---
  const addToLog = (msg: string) => setLogs(prev => [msg, ...prev]);

  const loadResource = async (filename: string, setBytes: any, setStatus: any, isTemplate: boolean = false) => {
      setStatus('LOADING');
      const { data } = await supabase.storage.from('templates').download(filename);
      if (data) {
          const buf = await data.arrayBuffer();
          setBytes(buf);
          setStatus('READY');
          if (isTemplate) analyzePdf(buf);
      } else {
          setStatus('MISSING');
      }
  };

  const fetchHosts = async () => {
      try {
          const { data } = await supabase.from('hsk_hosts').select('*').neq('status', 'Resigned').order('full_name');
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

  const analyzePdf = async (buffer: ArrayBuffer) => {
      const pdfDoc = await PDFDocument.load(buffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields().map(f => f.getName());
      setFlightPdfFields(fields);
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>, filename: string, setBytes: any, setStatus: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setStatus('LOADING');
      const { error } = await supabase.storage.from('templates').upload(filename, file, { upsert: true });
      if (error) { setStatus('MISSING'); toast.error("Upload Failed"); return; }
      
      const buf = await file.arrayBuffer();
      setBytes(buf);
      setStatus('READY');
      analyzePdf(buf);
      toast.success("Template Saved!");
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFontStatus('LOADING');
      const { error } = await supabase.storage.from('templates').upload(FONT_FILENAME, file, { upsert: true });
      if (error) { setFontStatus('MISSING'); toast.error("Font Upload Failed"); return; }
      const buf = await file.arrayBuffer();
      setFontBytes(buf);
      setFontStatus('READY');
      toast.success("Book Antiqua Loaded!");
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
      } catch(e) { console.error(e); toast.error("Identification Failed"); }
      setIsProcessing(false);
  }

  const selectHostForFlight = async (host: Host) => {
      setHostSearch('');
      setIsHostDropdownOpen(false);

      const resetData = {
          name: host.full_name || '',
          host_id: host.host_id || '',
          designation: host.role || '',
          department: host.department || 'Housekeeping',
          hire_date: host.joining_date?.split('T')[0] || '', 
          contact_no: host.personal_mobile || '',
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
              toast.success('Loaded previous passenger details!');
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
      if (!flightTemplateBytes) return toast.error("Missing Template");
      
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
                  if (dataKey === 'tick_al' && flightData.leave_types.includes('AL')) val = 'X';
                  if (dataKey === 'tick_business' && flightData.leave_types.includes('Business')) val = 'X';
                  if (dataKey === 'tick_rr' && flightData.leave_types.includes('R&R')) val = 'X';
                  if (dataKey === 'tick_het' && flightData.leave_types.includes('HET')) val = 'X';
                  if (dataKey === 'tick_other' && flightData.leave_types.includes('Other')) val = 'X';
                  if (dataKey === 'tick_personal' && flightData.leave_types.includes('Personal')) val = 'X';
                  if (dataKey === 'tick_payroll_yes' && flightData.payroll_deduction === 'Yes') val = 'X';
                  if (dataKey === 'tick_payroll_no' && flightData.payroll_deduction === 'No') val = 'X';
              } else {
                  val = (flightData as any)[dataKey] || '';
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
          toast.error("Generation Error: " + e.message);
          setIsProcessing(false);
      }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6 overflow-y-auto md:overflow-hidden animate-in slide-in-from-bottom-4">
        {/* LEFT CONTROLS (TALL SCROLLABLE) */}
        <div className="w-full md:w-[50%] lg:w-[45%] flex flex-col md:overflow-y-auto md:pr-3 pb-4 md:pb-10 custom-scrollbar space-y-4 shrink-0">
            
            {/* 1. HOST SEARCH */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative">
                <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><Users size={16} className="text-[#6D2158]"/> Auto-Fill Database Search</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                    <input 
                        type="text" 
                        className="w-full pl-10 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] transition-colors" 
                        placeholder="Search host name or SSL to auto-fill..."
                        value={hostSearch}
                        onChange={e => setHostSearch(e.target.value)}
                        onFocus={() => setIsHostDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsHostDropdownOpen(false), 200)}
                    />
                    {isHostDropdownOpen && (
                        <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-2xl mt-2 max-h-56 overflow-y-auto custom-scrollbar">
                            {hosts.filter(h => (h.full_name || '').toLowerCase().includes(hostSearch.toLowerCase()) || (h.host_id || '').toLowerCase().includes(hostSearch.toLowerCase())).map(h => (
                                <div key={h.id} onMouseDown={() => selectHostForFlight(h)} className="p-3 hover:bg-purple-50 cursor-pointer border-b border-slate-50 text-xs font-bold text-slate-700 flex justify-between items-center group transition-colors">
                                    <span className="group-hover:text-[#6D2158]">{h.full_name}</span> 
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{h.host_id}</span>
                                </div>
                            ))}
                            {hosts.length === 0 && <div className="p-4 text-xs text-slate-400 italic text-center">No hosts found. Type manually below.</div>}
                        </div>
                    )}
                </div>
            </div>

            {/* 2. HOST DETAILS (Editable) */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 border-b border-slate-100 pb-3"><FileText size={16}/> Host Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Host Name</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors" value={flightData.name} onChange={e=>setFlightData({...flightData, name: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">SSL No</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors" value={flightData.host_id} onChange={e=>setFlightData({...flightData, host_id: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Contact No</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors" value={flightData.contact_no} onChange={e=>setFlightData({...flightData, contact_no: e.target.value})}/></div>
                    <div className="sm:col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Designation</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors" value={flightData.designation} onChange={e=>setFlightData({...flightData, designation: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Department</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors" value={flightData.department} onChange={e=>setFlightData({...flightData, department: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Hire Date</label><input type="date" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:border-[#6D2158] outline-none transition-colors text-slate-700" value={flightData.hire_date} onChange={e=>setFlightData({...flightData, hire_date: e.target.value})}/></div>
                </div>
            </div>

            {/* 3. ADDITIONAL PASSENGERS */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 border-b border-slate-100 pb-3"><UserPlus size={16}/> Additional Passengers</h3>
                
                {[1,2,3,4].map(num => (
                    <div key={num} className="grid grid-cols-12 gap-2 pb-3 mb-3 border-b border-slate-50 last:border-0 last:mb-0 last:pb-0">
                        <div className="col-span-12 sm:col-span-5"><input placeholder={`P${num} Name`} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-300" value={(flightData as any)[`p${num}_name`]} onChange={e=>setFlightData({...flightData, [`p${num}_name`]: e.target.value})}/></div>
                        <div className="col-span-7 sm:col-span-4"><input placeholder={`ID / Passport`} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-300" value={(flightData as any)[`p${num}_id`]} onChange={e=>setFlightData({...flightData, [`p${num}_id`]: e.target.value})}/></div>
                        <div className="col-span-5 sm:col-span-3"><input placeholder={`Relation`} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-300" value={(flightData as any)[`p${num}_rel`]} onChange={e=>setFlightData({...flightData, [`p${num}_rel`]: e.target.value})}/></div>
                    </div>
                ))}
            </div>

            {/* 4. REQUEST OPTIONS */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-4">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">Request Options</h3>
                
                <div className="grid grid-cols-3 gap-2">
                    {['AL', 'Business', 'R&R', 'HET', 'Personal', 'Other'].map(opt => (
                        <label key={opt} className={`text-[10px] font-bold border rounded-lg p-2.5 flex items-center justify-center cursor-pointer transition-all ${flightData.leave_types.includes(opt) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-inner' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                            <input type="checkbox" className="hidden" checked={flightData.leave_types.includes(opt)} onChange={() => toggleLeaveType(opt)}/> {opt}
                        </label>
                    ))}
                </div>

                <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Int. Destination / Route</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#6D2158]" placeholder="e.g. MLE - CMB" value={flightData.int_destination} onChange={e=>setFlightData({...flightData, int_destination: e.target.value})}/></div>

                <div className="flex gap-6 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-600">Payroll Deduction?</span>
                    <label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer text-slate-700"><input type="radio" name="payroll" checked={flightData.payroll_deduction === 'Yes'} onChange={() => setFlightData({...flightData, payroll_deduction: 'Yes'})}/> Yes</label>
                    <label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer text-slate-700"><input type="radio" name="payroll" checked={flightData.payroll_deduction === 'No'} onChange={() => setFlightData({...flightData, payroll_deduction: 'No'})}/> No</label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Payroll Month</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#6D2158]" value={flightData.payroll_month} onChange={e=>setFlightData({...flightData, payroll_month: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Total Deductable</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#6D2158]" value={flightData.total_deductable} onChange={e=>setFlightData({...flightData, total_deductable: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Domestic Cost</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#6D2158]" value={flightData.domestic_flight} onChange={e=>setFlightData({...flightData, domestic_flight: e.target.value})}/></div>
                    <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Int. Cost</label><input className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#6D2158]" value={flightData.int_flight} onChange={e=>setFlightData({...flightData, int_flight: e.target.value})}/></div>
                </div>
            </div>

            {/* 5. FLIGHT SCHEDULE */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 border-b border-slate-100 pb-3"><Plane size={16}/> Flight Schedule</h3>
                
                <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 mb-3">
                    <p className="text-[10px] font-black text-blue-600 mb-2">DOMESTIC SECTOR</p>
                    <div className="grid grid-cols-2 gap-2.5">
                        <div><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Dep Date</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400 text-slate-700" value={flightData.dom_dep_date} onChange={e=>setFlightData({...flightData, dom_dep_date: e.target.value})}/></div>
                        <div><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Dep Time</label><input type="text" placeholder="HH:MM" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400" value={flightData.dom_dep_time} onChange={e=>setFlightData({...flightData, dom_dep_time: e.target.value})}/></div>
                        <div><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Arr Date</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400 text-slate-700" value={flightData.dom_arr_date} onChange={e=>setFlightData({...flightData, dom_arr_date: e.target.value})}/></div>
                        <div><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Arr Time</label><input type="text" placeholder="HH:MM" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400" value={flightData.dom_arr_time} onChange={e=>setFlightData({...flightData, dom_arr_time: e.target.value})}/></div>
                    </div>
                </div>

                <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                    <p className="text-[10px] font-black text-amber-600 mb-2">INTERNATIONAL SECTOR</p>
                    <div className="grid grid-cols-2 gap-2.5">
                        <div><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Dep Date</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-400 text-slate-700" value={flightData.int_dep_date} onChange={e=>setFlightData({...flightData, int_dep_date: e.target.value})}/></div>
                        <div><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Dep Time</label><input type="text" placeholder="HH:MM" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-400" value={flightData.int_dep_time} onChange={e=>setFlightData({...flightData, int_dep_time: e.target.value})}/></div>
                        <div><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Arr Date</label><input type="date" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-400 text-slate-700" value={flightData.int_arr_date} onChange={e=>setFlightData({...flightData, int_arr_date: e.target.value})}/></div>
                        <div><label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Arr Time</label><input type="text" placeholder="HH:MM" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-400" value={flightData.int_arr_time} onChange={e=>setFlightData({...flightData, int_arr_time: e.target.value})}/></div>
                    </div>
                </div>
            </div>

            {/* 6. RESOURCES & MAPPING */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><Settings size={16}/> Template & Map</span>
                    {flightTemplateStatus === 'READY' ? <span className="text-[10px] text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded font-bold">Ready</span> : (
                        <div className="relative cursor-pointer text-[10px] bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded font-bold transition-colors">
                            Upload Template
                            <input type="file" accept=".pdf" onChange={e => handleTemplateUpload(e, FLIGHT_TEMPLATE, setFlightTemplateBytes, setFlightTemplateStatus)} className="absolute inset-0 opacity-0 cursor-pointer"/>
                        </div>
                    )}
                </h3>
                
                {flightPdfFields.length > 0 && (
                    <div className="space-y-2 mt-4 border-t border-slate-100 pt-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                        <div className="flex justify-end"><button onClick={() => identifyFields(flightTemplateBytes)} className="text-[10px] bg-slate-100 px-3 py-1.5 font-bold rounded hover:bg-slate-200 flex items-center gap-1 transition-colors"><Search size={12}/> Identify Fields</button></div>
                        {flightPdfFields.map(field => (
                            <div key={field} className="flex justify-between items-center bg-slate-50 p-1.5 rounded border border-transparent hover:border-slate-200 transition-colors">
                                <span className="text-[10px] font-bold text-slate-500 truncate max-w-[120px]" title={field}>{field}</span>
                                <select className="w-32 p-1.5 text-[10px] border border-slate-200 rounded-lg bg-white outline-none font-bold shadow-sm" value={flightFieldMapping[field] || ''} onChange={(e) => updateFlightMapping(field, e.target.value)}>
                                    <option value="">Skip</option>
                                    {FLIGHT_MAPPING_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* GENERATE */}
            <button onClick={generateFlightPdf} disabled={isProcessing || flightTemplateStatus !== 'READY' || !flightData.name} className="w-full bg-[#6D2158] text-white py-4 md:py-5 rounded-xl font-black tracking-widest uppercase shadow-lg hover:bg-[#5a1b49] disabled:opacity-50 transition-all flex justify-center items-center gap-2 text-sm shrink-0 active:scale-95">
                {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <Printer size={18}/>}
                Generate Request
            </button>

            {/* DESKTOP HISTORY (Hidden on mobile) */}
            <div className="hidden md:flex bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-1 min-h-[200px] flex-col shrink-0">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 mb-3 border-b border-slate-100 pb-2"><HistoryIcon size={16}/> Generated History</h3>
                <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                    {flightHistory.map(h => (
                        <div key={h.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center group">
                            <span className="font-bold text-sm text-slate-700">{h.host_name} <span className="text-[10px] text-slate-400 font-normal ml-1">{h.host_id}</span></span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(h.created_at).toLocaleDateString('en-GB')}</span>
                        </div>
                    ))}
                    {flightHistory.length === 0 && <div className="text-center text-xs text-slate-400 py-6 font-bold italic">No history yet.</div>}
                </div>
            </div>
        </div>

        {/* RIGHT PREVIEW (Stacks below form on mobile) */}
        <div className="w-full md:w-[50%] lg:w-[55%] h-[500px] md:h-auto md:flex-1 bg-slate-200 rounded-2xl border border-slate-300 shadow-inner flex flex-col overflow-hidden relative shrink-0">
            {previewUrl ? (
                <iframe src={previewUrl} className="w-full h-full" title="PDF Preview"/>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <FileText size={48} className="mb-4 opacity-30"/>
                    <p className="text-sm font-bold">No Preview Generated</p>
                    <p className="text-[10px] uppercase tracking-widest mt-2 max-w-[200px] text-center">Fill out the form and hit generate to see the PDF.</p>
                </div>
            )}
        </div>

        {/* MOBILE HISTORY (Hidden on desktop, placed after preview on mobile) */}
        <div className="flex md:hidden bg-white p-4 rounded-xl shadow-sm border border-slate-200 min-h-[200px] flex-col shrink-0 mt-2">
            <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 mb-3 border-b border-slate-100 pb-2"><HistoryIcon size={16}/> Generated History</h3>
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                {flightHistory.map(h => (
                    <div key={h.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center group">
                        <span className="font-bold text-sm text-slate-700">{h.host_name} <span className="block text-[10px] text-slate-400 font-normal mt-0.5">{h.host_id}</span></span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(h.created_at).toLocaleDateString('en-GB')}</span>
                    </div>
                ))}
                {flightHistory.length === 0 && <div className="text-center text-xs text-slate-400 py-6 font-bold italic">No history yet.</div>}
            </div>
        </div>
    </div>
  );
}
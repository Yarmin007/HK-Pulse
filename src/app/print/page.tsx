"use client";
import React, { useState, useEffect } from 'react';
import { 
  Printer, Upload, Settings, CheckCircle2, X, 
  Download, Cloud, Loader2, AlertCircle, Eye, 
  ArrowRight, Search, Type, Trash2, FileText 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, PDFTextField } from 'pdf-lib';
import { supabase } from '@/lib/supabase';

// --- CONFIG ---
const TEMPLATE_FILENAME = 'dep_laundry_template.pdf';
const FONT_FILENAME = 'book_antiqua.ttf';

const getToday = () => {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const getTargetDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2); // Always +2 days
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

// --- SMART NAME LOGIC ---
const cleanName = (fullName: string) => {
    if (!fullName) return '';
    
    // 1. Clean PDF Artifacts
    let cleaned = fullName.replace(/\*/g, ''); // KILL ALL ASTERISKS
    cleaned = cleaned.replace(/\"/g, '');      // Kill quotes
    cleaned = cleaned.replace(/\n/g, ' ').replace(/\r/g, ''); 
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/Name$/, '').trim(); 

    // 2. Strict Comma Split: "Surname, Firstname, Title"
    if (cleaned.includes(',')) {
        const parts = cleaned.split(',').map(s => s.trim());
        
        // parts[0] is Surname -> DISCARD
        // parts[1] is Firstname -> KEEP
        let firstname = parts[1] || '';
        
        // Clean merged titles like "AmyMs" -> "Amy"
        firstname = firstname.replace(/Ms$|Mr$|Mrs$/, '').trim();

        // parts[2] is Title -> KEEP
        let title = parts[2] || ''; 
        
        // Fix local titles
        title = title.replace(/Alfaalil/gi, "Mr.").replace(/Alfaalila/gi, "Ms.");

        if (title && title.length < 6 && !title.match(/\d/)) { 
            return `${title} ${firstname}`; 
        } else {
            return firstname; 
        }
    }

    // Fallback
    return cleaned;
};

const formatSalutation = (guests: string[]) => {
    const unique = Array.from(new Set(guests.filter(g => g && g.length > 1)));
    if (unique.length === 0) return 'Guest';
    if (unique.length === 1) return unique[0]; 
    if (unique.length === 2) return `${unique[0]} & ${unique[1]}`;
    return `${unique[0]} & ${unique[1]} & Family`;
};

export default function PrintHubPage() {
  const [activeMode, setActiveMode] = useState<'DASHBOARD' | 'DEPARTURE'>('DASHBOARD');
  const [villaGroups, setVillaGroups] = useState<{id: string, villa: string, salutation: string}[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  
  // Resources
  const [templateBytes, setTemplateBytes] = useState<ArrayBuffer | null>(null);
  const [fontBytes, setFontBytes] = useState<ArrayBuffer | null>(null);
  
  const [templateStatus, setTemplateStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  const [fontStatus, setFontStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  
  const [pdfFields, setPdfFields] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  
  // Output
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [toast, setToast] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  useEffect(() => {
    if (activeMode === 'DEPARTURE') {
        loadResource(TEMPLATE_FILENAME, setTemplateBytes, setTemplateStatus, true);
        loadResource(FONT_FILENAME, setFontBytes, setFontStatus, false);
    }
  }, [activeMode]);

  const showToast = (type: 'success' | 'error', msg: string) => {
      setToast({ type, msg });
      setTimeout(() => setToast(null), 4000);
  };

  const addToLog = (msg: string) => setLogs(prev => [msg, ...prev]);

  const loadResource = async (filename: string, setBytes: any, setStatus: any, analyze: boolean) => {
      setStatus('LOADING');
      const { data } = await supabase.storage.from('templates').download(filename);
      if (data) {
          const buf = await data.arrayBuffer();
          setBytes(buf);
          setStatus('READY');
          if (analyze) analyzePdf(buf);
      } else {
          setStatus('MISSING');
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.name.toLowerCase().endsWith('.pdf')) parsePDF(file);
      else parseExcel(file);
  };

  // --- FONT UPLOAD HANDLER ---
  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setFontStatus('LOADING');
      const { error } = await supabase.storage.from('templates').upload(FONT_FILENAME, file, { upsert: true });
      
      if (error) { 
          setFontStatus('MISSING'); 
          showToast('error', "Font Upload Failed"); 
          return; 
      }
      
      const buf = await file.arrayBuffer();
      setFontBytes(buf);
      setFontStatus('READY');
      showToast('success', "Book Antiqua Loaded!");
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

  const analyzePdf = async (buffer: ArrayBuffer) => {
      const pdfDoc = await PDFDocument.load(buffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields().map(f => f.getName());
      setPdfFields(fields);
      
      const initialMap: Record<string, string> = {};
      fields.forEach(f => {
          const lower = f.toLowerCase();
          if (lower.includes('text3')) initialMap[f] = 'villa'; 
          else if (lower.includes('text4')) initialMap[f] = 'targetDate'; 
          else if (lower.includes('name') || lower.includes('guest')) initialMap[f] = 'salutation'; 
          else if (lower.includes('date') && !lower.includes('target')) initialMap[f] = 'todayDate'; 
      });
      setFieldMapping(initialMap);
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setTemplateStatus('LOADING');
      const { error } = await supabase.storage.from('templates').upload(TEMPLATE_FILENAME, file, { upsert: true });
      if (error) { setTemplateStatus('MISSING'); showToast('error', "Upload Failed"); return; }
      
      const buf = await file.arrayBuffer();
      setTemplateBytes(buf);
      setTemplateStatus('READY');
      analyzePdf(buf);
      showToast('success', "Template Saved!");
  };

  const identifyFields = async () => {
      if (!templateBytes) return;
      setIsProcessing(true);
      try {
          const pdfDoc = await PDFDocument.load(templateBytes);
          const form = pdfDoc.getForm();
          const fields = form.getFields();
          const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
          
          fields.forEach(field => {
               if (field instanceof PDFTextField) {
                   try {
                       field.setText(field.getName()); 
                       field.updateAppearances(font);
                   } catch (e) {}
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

  // --- GENERATE ---
  const generateMergedPdf = async () => {
      if (!templateBytes || villaGroups.length === 0) return showToast('error', "Missing Data");
      
      setIsProcessing(true);
      setLogs([]);
      addToLog(`🚀 Generating Master PDF for ${villaGroups.length} villas...`);

      try {
          // --- FIXED IMPORT ---
          // Use .default to get the actual library from dynamic import
          const fontkit = (await import('@pdf-lib/fontkit')).default;
          
          const mergedPdf = await PDFDocument.create();
          mergedPdf.registerFontkit(fontkit);

          let loadedFont;
          if (fontBytes) {
              // CUSTOM FONT
              loadedFont = await mergedPdf.embedFont(fontBytes);
              addToLog("Using Uploaded Font (Book Antiqua)");
          } else {
              // FALLBACK
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
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">Departure Letters</p>
          </div>
          {activeMode === 'DEPARTURE' && (
              <button onClick={() => setActiveMode('DASHBOARD')} className="bg-slate-200 hover:bg-slate-300 text-slate-600 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2">
                  <X size={16}/> Close Tool
              </button>
          )}
      </div>

      {activeMode === 'DASHBOARD' && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 content-start">
               <button onClick={() => setActiveMode('DEPARTURE')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-[#6D2158]/10 hover:border-[#6D2158] text-left transition-all group h-40">
                  <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Download size={28}/></div>
                  <h3 className="text-lg font-bold text-slate-800">Dep. Laundry Letter</h3>
                  <p className="text-xs text-slate-400 mt-2">Bulk Generate (PDF/Excel)</p>
              </button>
          </div>
      )}

      {activeMode === 'DEPARTURE' && (
          <div className="flex-1 flex gap-6 overflow-hidden">
              
              {/* LEFT: CONTROLS */}
              <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 pb-10">
                  
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
                                  <input type="file" accept=".pdf" onChange={handleTemplateUpload} className="absolute inset-0 opacity-0 cursor-pointer"/>
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
                      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
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
                              <button onClick={identifyFields} className="flex items-center gap-1 text-[10px] bg-slate-100 px-2 py-1 rounded hover:bg-slate-200">
                                  <Search size={10}/> Identify
                              </button>
                          </div>
                          
                          <div className="space-y-2">
                              {pdfFields.map(field => (
                                  <div key={field} className="flex justify-between items-center">
                                      <span className="text-[10px] font-bold text-slate-400 truncate max-w-[80px]" title={field}>{field}</span>
                                      <select className="w-24 p-1 text-[10px] border rounded bg-slate-50" value={fieldMapping[field] || ''} onChange={(e) => setFieldMapping({...fieldMapping, [field]: e.target.value})}>
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
                  <button onClick={generateMergedPdf} disabled={isProcessing || templateStatus !== 'READY' || villaGroups.length === 0} className="w-full bg-[#6D2158] text-white py-3 rounded-xl font-bold uppercase shadow-lg hover:bg-[#5a1b49] disabled:opacity-50 transition-all flex justify-center items-center gap-2 text-sm">
                      {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <ArrowRight size={16}/>}
                      {isProcessing ? 'Generate' : 'Generate'} 
                  </button>

                  {/* LOGS */}
                  <div className="bg-slate-100 p-2 rounded-lg h-24 overflow-y-auto text-[10px] font-mono text-slate-500">
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
"use client";
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, Search, Type, Trash2, FileText, ArrowRight, Loader2, Settings, Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, PDFTextField, PDFCheckBox, PDFFont } from 'pdf-lib';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// --- CONFIG ---
const DEPARTURE_TEMPLATE = 'dep_laundry_template.pdf';
const FONT_FILENAME = 'book_antiqua.ttf';

// --- HELPERS ---
const getToday = () => {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const getTargetDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2); 
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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

export default function DepartureMode() {
  // --- STATE ---
  const [fontBytes, setFontBytes] = useState<ArrayBuffer | null>(null);
  const [fontStatus, setFontStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const [villaGroups, setVillaGroups] = useState<{id: string, villa: string, salutation: string}[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [templateBytes, setTemplateBytes] = useState<ArrayBuffer | null>(null);
  const [templateStatus, setTemplateStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  const [pdfFields, setPdfFields] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  // --- INIT ---
  useEffect(() => {
      loadResource(DEPARTURE_TEMPLATE, setTemplateBytes, setTemplateStatus, true);
      loadResource(FONT_FILENAME, setFontBytes, setFontStatus);
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

  const analyzePdf = async (buffer: ArrayBuffer) => {
      const pdfDoc = await PDFDocument.load(buffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields().map(f => f.getName());
      
      setPdfFields(fields);
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
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setTemplateStatus('LOADING');
      const { error } = await supabase.storage.from('templates').upload(DEPARTURE_TEMPLATE, file, { upsert: true });
      if (error) { setTemplateStatus('MISSING'); toast.error("Upload Failed"); return; }
      
      const buf = await file.arrayBuffer();
      setTemplateBytes(buf);
      setTemplateStatus('READY');
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

  const identifyFields = async () => {
      if (!templateBytes) return;
      setIsProcessing(true);
      try {
          const pdfDoc = await PDFDocument.load(templateBytes);
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
  };

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
        } catch (err) { toast.error("Excel Parse Error"); }
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
              toast.error("Parse Failed: No data found");
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
          toast.success(`Found ${processed.length} villas.`);
          addToLog(`✅ Extracted ${processed.length} villas.`);

      } catch (err: any) {
          console.error(err);
          toast.error("PDF Parse Failed: " + err.message);
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
      toast.success(`Found ${processed.length} villas.`);
  };

  const updateDepartureMapping = (field: string, val: string) => {
      const newMap = { ...fieldMapping, [field]: val };
      setFieldMapping(newMap);
      localStorage.setItem('dep_field_mapping', JSON.stringify(newMap));
  };

  const updateVillaGroup = (id: string, field: 'villa' | 'salutation', val: string) => {
      setVillaGroups(prev => prev.map(g => g.id === id ? { ...g, [field]: val } : g));
  };

  const removeVillaGroup = (id: string) => {
      setVillaGroups(prev => prev.filter(g => g.id !== id));
  };

  const generateMergedPdf = async () => {
      if (!templateBytes || villaGroups.length === 0) return toast.error("Missing Data");
      
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
          toast.error("Generation Error: " + e.message);
          setIsProcessing(false);
      }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6 overflow-y-auto md:overflow-hidden animate-in slide-in-from-bottom-4">
        {/* LEFT: CONTROLS */}
        <div className="w-full md:w-[45%] flex flex-col gap-4 md:overflow-y-auto md:pr-2 pb-4 md:pb-10 custom-scrollbar shrink-0">
            
            {/* 1. UPLOAD */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><span className="bg-slate-100 w-5 h-5 flex items-center justify-center rounded-full text-[10px]">1</span> Data Source</h3>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:bg-slate-50 relative cursor-pointer group transition-colors">
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
                            <span className="text-[10px] bg-slate-100 px-3 py-1.5 rounded hover:bg-slate-200 cursor-pointer font-bold">Upload</span>
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
                            <span className="text-[10px] bg-slate-100 px-3 py-1.5 rounded hover:bg-slate-200 cursor-pointer font-bold">Upload .ttf</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 3. EDIT LIST */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-1 min-h-[250px] flex flex-col">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Eye size={14}/> Guests ({villaGroups.length})</h3>
                    <button onClick={() => setIsEditing(!isEditing)} className="text-[10px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded hover:text-[#6D2158] transition-colors">{isEditing ? 'Done' : 'Edit'}</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {villaGroups.map(g => (
                        <div key={g.id} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px]">
                            {isEditing ? (
                                <>
                                    <input type="text" className="w-10 p-1 bg-white border border-slate-200 rounded text-center font-bold outline-none" value={g.villa || ''} onChange={(e) => updateVillaGroup(g.id, 'villa', e.target.value)}/>
                                    <input type="text" className="flex-1 p-1 bg-white border border-slate-200 rounded outline-none" value={g.salutation || ''} onChange={(e) => updateVillaGroup(g.id, 'salutation', e.target.value)}/>
                                    <button type="button" onClick={() => removeVillaGroup(g.id)} className="text-rose-400 hover:text-rose-600 p-1"><Trash2 size={14}/></button>
                                </>
                            ) : (
                                <>
                                    <span className="font-bold text-slate-400 w-8 text-center">{g.villa}</span>
                                    <span className="font-bold text-slate-700 truncate flex-1">{g.salutation}</span>
                                </>
                            )}
                        </div>
                    ))}
                    {villaGroups.length === 0 && <div className="text-center py-10 text-slate-300 text-xs italic">No guests loaded.</div>}
                </div>
            </div>

            {/* 4. MAPPING */}
            {pdfFields.length > 0 && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-slate-700 text-sm"><Settings size={14} className="inline mr-1"/> Map Fields</h3>
                        <button onClick={() => identifyFields()} className="flex items-center gap-1 text-[10px] bg-slate-100 px-3 py-1.5 font-bold rounded hover:bg-slate-200 transition-colors">
                            <Search size={10}/> Identify
                        </button>
                    </div>
                    
                    <div className="space-y-2.5 max-h-40 overflow-y-auto custom-scrollbar">
                        {pdfFields.map(field => (
                            <div key={field} className="flex justify-between items-center pr-2">
                                <span className="text-[10px] font-bold text-slate-500 truncate max-w-[120px]" title={field}>{field}</span>
                                <select className="w-28 p-1.5 text-[10px] border border-slate-200 rounded-lg bg-slate-50 font-bold outline-none" value={fieldMapping[field] || ''} onChange={(e) => updateDepartureMapping(field, e.target.value)}>
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
            <button onClick={generateMergedPdf} disabled={isProcessing || templateStatus !== 'READY' || villaGroups.length === 0} className="w-full bg-[#6D2158] text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg hover:bg-[#5a1b49] disabled:opacity-50 transition-all flex justify-center items-center gap-2 text-sm shrink-0 active:scale-95">
                {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <ArrowRight size={18}/>}
                {isProcessing ? 'Generating...' : 'Generate PDFs'} 
            </button>

            {/* DESKTOP LOGS (Hidden on mobile) */}
            <div className="hidden md:block bg-slate-100 p-3 rounded-xl h-24 overflow-y-auto text-[10px] font-mono text-slate-500 shrink-0 custom-scrollbar">
                {logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
            </div>
        </div>

        {/* RIGHT: LIVE PREVIEW (Stacks on mobile) */}
        <div className="w-full md:w-[55%] h-[500px] md:h-auto md:flex-1 bg-slate-200 rounded-2xl border border-slate-300 shadow-inner flex flex-col overflow-hidden relative shrink-0">
            {previewUrl ? (
                <iframe src={previewUrl} className="w-full h-full" title="PDF Preview"/>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <FileText size={48} className="mb-3 opacity-30"/>
                    <p className="text-sm font-bold">No Preview Generated</p>
                </div>
            )}
        </div>

        {/* MOBILE LOGS (Hidden on desktop) */}
        <div className="md:hidden w-full bg-slate-100 p-3 rounded-xl h-24 overflow-y-auto text-[10px] font-mono text-slate-500 shrink-0 custom-scrollbar mt-2">
            {logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
        </div>
    </div>
  );
}
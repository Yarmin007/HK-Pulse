"use client";
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, Search, Type, Trash2, FileText, ArrowRight, Loader2, Settings, Eye, CalendarDays, Download, Upload
} from 'lucide-react';
import { projectGuestDay, normalizeVilla, extractDepInfo } from '@/lib/guestDay';
import { getDhakaDateStr } from '@/lib/dateUtils';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, PDFTextField, PDFCheckBox, PDFFont, PDFButton } from 'pdf-lib';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// --- CONFIG ---
const DEPARTURE_TEMPLATE = 'dep_laundry_template.pdf';
const FONT_FILENAME = 'book_antiqua.ttf';
// Signature images: one per person, templates/signatures/<host id>
const signaturePath = (hostId: string) => `signatures/${hostId}`;

// Best guess of what a PDF form field is for, from its name
const guessFieldKey = (name: string, isButton: boolean) => {
  const n = name.toLowerCase();
  if (isButton) return /image|sign|sig/.test(n) ? 'signature' : '';
  if (/signature\s*name|executive|signed\s*by/.test(n)) return 'executive';
  if (/designation|position|title/.test(n)) return 'designation';
  if (/dep/.test(n)) return 'targetDate';
  if (/villa|text3/.test(n)) return 'villa';
  if (/guest|^name$|salutation/.test(n)) return 'salutation';
  if (/current|today|date/.test(n)) return 'todayDate';
  return '';
};

// --- HELPERS ---
// Letter dates read "Mar 27, 2025"
const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const getToday = () => shortDate(new Date());

// The letter goes out two days before departure
const addDaysYMD = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const longDate = (ymd: string) => shortDate(new Date(`${ymd}T00:00:00`));

// Guest List name "Mr Edmund Byers & Ms Imogen Byers (5 yrs)" → ["Mr. Edmund", "Ms. Imogen"] (adults only, like the letter)
const salutationsFromList = (names: string) =>
  String(names || '').split('&').map(n => n.trim()).filter(Boolean)
    .filter(n => !/\(\s*\d+\s*(yrs?|mths?)\s*\)/i.test(n) && !/^(mstr|master|kokko)\b/i.test(n))
    .map(n => {
      const m = n.match(/^(Mr|Mrs|Ms|Miss|Dr|Prof|Mme)\.?\s+(\S+)/i);
      return m ? `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()}. ${m[2]}` : n.split(/\s+/)[0];
    });

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

// One or two people: "Mr. X" / "Mr. X & Mrs. Y". More than a couple: "Mr. X & Mrs. Y & Family".
// `people` = everyone in the villa (children included) when it is known.
const formatSalutation = (guests: string[], people = 0) => {
    const unique = Array.from(new Set(guests.filter(g => g && g.length > 1)));
    const total = Math.max(people, unique.length);
    if (unique.length === 0) return 'Guest';
    const named = unique.slice(0, 2).join(' & ');
    return total > 2 || (unique.length === 1 && total > 1) ? `${named} & Family` : named;
};
const peopleIn = (names: string) => String(names || '').split('&').map(n => n.trim()).filter(Boolean).length;

export default function DepartureMode() {
  // --- STATE ---
  const [fontBytes, setFontBytes] = useState<ArrayBuffer | null>(null);
  const [fontStatus, setFontStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const [villaGroups, setVillaGroups] = useState<{id: string, villa: string, salutation: string}[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  // How to print: the Canon MF460 can't do double-sided A5, so print onto A4 and cut in half
  // The Canon MF460 can't print A5 double-sided, so by default: all letters first, then all laundry lists on the back
  const [printLayout, setPrintLayout] = useState<'manual' | 'a5'>('manual');
  const [reverseBacks, setReverseBacks] = useState(false);
  const [manualParts, setManualParts] = useState<{ letters: string; lists: string } | null>(null);
  const [manualStep, setManualStep] = useState<'letters' | 'lists'>('letters');
  useEffect(() => {
      try {
          const v = localStorage.getItem('dep_letter_layout');
          if (v === 'a5') setPrintLayout(v);
          setReverseBacks(localStorage.getItem('dep_letter_reverse') === '1');
      } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem('dep_letter_layout', printLayout); localStorage.setItem('dep_letter_reverse', reverseBacks ? '1' : ''); } catch {} }, [printLayout, reverseBacks]);
  const [templateBytes, setTemplateBytes] = useState<ArrayBuffer | null>(null);
  // Who signs the letter: picked from Hosts, designation = their role
  const [execs, setExecs] = useState<{ id: string; name: string; role: string }[]>([]);
  const [execId, setExecId] = useState<string>(() => { try { return localStorage.getItem('dep_letter_exec') || ''; } catch { return ''; } });
  const exec = execs.find(e => e.id === execId);
  useEffect(() => {
      supabase.from('hsk_hosts').select('id, full_name, role').eq('status', 'Active').order('full_name').then(({ data }) => {
          const rank = (r: string) => /executive|director|manager/i.test(r) ? 0 : /supervisor|assistant|coordinator/i.test(r) ? 1 : 2;
          setExecs((data || []).map(h => ({ id: String(h.id), name: h.full_name || '', role: h.role || '' })).sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name)));
      });
  }, []);
  const pickExec = (id: string) => { setExecId(id); try { localStorage.setItem('dep_letter_exec', id); } catch {} };
  // Signature image of the chosen person (goes into the PDF's image box)
  const [signature, setSignature] = useState<{ bytes: ArrayBuffer; url: string } | null>(null);
  const [sigLoading, setSigLoading] = useState(false);
  useEffect(() => {
      setSignature(null);
      if (!execId) return;
      setSigLoading(true);
      supabase.storage.from('templates').download(signaturePath(execId)).then(async ({ data }) => {
          if (data) { const bytes = await data.arrayBuffer(); setSignature({ bytes, url: URL.createObjectURL(data) }); }
          setSigLoading(false);
      });
  }, [execId]);
  const uploadSignature = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !execId) return;
      if (!/image\/(png|jpe?g)/.test(file.type)) return toast.error('Use a PNG or JPG image of the signature');
      const { error } = await supabase.storage.from('templates').upload(signaturePath(execId), file, { upsert: true, contentType: file.type });
      if (error) return toast.error('Signature not saved');
      setSignature({ bytes: await file.arrayBuffer(), url: URL.createObjectURL(file) });
      toast.success(`Signature saved for ${exec?.name || 'this person'}`);
  };
  const [templateStatus, setTemplateStatus] = useState<'MISSING' | 'LOADING' | 'READY'>('LOADING');
  const [pdfFields, setPdfFields] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [depDate, setDepDate] = useState(() => addDaysYMD(getDhakaDateStr(), 2));
  const [loadingList, setLoadingList] = useState(false);

  // Departing guests of that day straight from the Guest List (DEP, and the departing side of DEP/ARR)
  const loadFromGuestList = async () => {
      setLoadingList(true);
      try {
          const { rows, isProjected } = await projectGuestDay(depDate);
          const out: { villa: string; names: string }[] = [];
          rows.forEach((r: any) => {
              const v = normalizeVilla(r.villa_number);
              const st = String(r.status || '').toUpperCase();
              if (!v || Number(v) <= 0 || /TMA|HOUSE|SHOW|FUMIG/.test(st)) return;
              if (st === 'DEP') out.push({ villa: v, names: r.guest_name || '' });
              else if (st === 'DEP/ARR') {
                  const dep = extractDepInfo(r.remarks).depInfo?.name || r.dep_guest_name || '';
                  if (dep) out.push({ villa: v, names: dep });
              }
          });
          out.sort((a, b) => Number(a.villa) - Number(b.villa));
          setVillaGroups(out.map((o, i) => ({ id: `gl-${i}`, villa: o.villa, salutation: formatSalutation(salutationsFromList(o.names), peopleIn(o.names)) })));
          addToLog(`📋 ${out.length} departing villas on ${longDate(depDate)}${isProjected ? ' (projected from the latest Guest List)' : ''}`);
          if (out.length) toast.success(`Loaded ${out.length} departing villas`); else toast.error(`No departures found for ${longDate(depDate)}`);
      } catch (e: any) {
          toast.error('Could not load the Guest List: ' + (e?.message || e));
      }
      setLoadingList(false);
  };

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
      const allFields = form.getFields();
      const fields = allFields.map(f => f.getName());
      const isButton = (name: string) => allFields.find(f => f.getName() === name) instanceof PDFButton;

      setPdfFields(fields);
      // Saved mapping for fields this PDF still has; fields of a new / replaced PDF get a best guess
      let saved: Record<string, string> = {};
      try { saved = JSON.parse(localStorage.getItem('dep_field_mapping') || '{}'); } catch(e) {}
      const map: Record<string, string> = {};
      fields.forEach(f => {
          if (f in saved) { map[f] = saved[f]; return; }
          map[f] = guessFieldKey(f, isButton(f));
      });
      setFieldMapping(map);
      localStorage.setItem('dep_field_mapping', JSON.stringify(map));
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!/\.pdf$/i.test(file.name)) { toast.error('Upload the letter as a PDF with form fields'); e.target.value = ''; return; }
      const buf = await file.arrayBuffer();
      setTemplateStatus('LOADING');
      const { error } = await supabase.storage.from('templates').upload(DEPARTURE_TEMPLATE, file, { upsert: true });
      if (error) { setTemplateStatus('MISSING'); toast.error("Upload Failed"); return; }
      setTemplateBytes(buf);
      setTemplateStatus('READY');
      setPreviewUrl(null);
      analyzePdf(buf);
      toast.success("New letter saved — check the fields in step 4, then Generate to preview");
      e.target.value = '';
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
      if (Object.values(fieldMapping).some(k => k === 'executive' || k === 'designation' || k === 'signature') && !exec) return toast.error('Choose who signs the letter first (step 1)');

      setIsProcessing(true);
      setLogs([]);
      addToLog(`🚀 Generating Master PDF for ${villaGroups.length} villas...`);

      try {
          const fontkit = (await import('@pdf-lib/fontkit')).default;
          const mergedPdf = await PDFDocument.create();
          addToLog(fontBytes ? "Using Uploaded Font (Book Antiqua)" : "⚠️ No Font Uploaded. Using Times Roman.");
          if (Object.values(fieldMapping).includes('signature') && !signature) addToLog("⚠️ No signature image for this person — the box stays empty.");

          const filled: PDFDocument[] = [];
          for (const group of villaGroups) {
              const srcDoc = await PDFDocument.load(templateBytes);
              // The font has to live in the same document as the form it fills
              srcDoc.registerFontkit(fontkit);
              const loadedFont = fontBytes ? await srcDoc.embedFont(fontBytes) : await srcDoc.embedFont(StandardFonts.TimesRoman);
              const form = srcDoc.getForm();

              for (const pdfField of Object.keys(fieldMapping)) {
                  const dataKey = fieldMapping[pdfField];
                  if (!dataKey) continue;
                  if (dataKey === 'signature') {
                      // Draw the signature straight onto the page and drop the image box,
                      // so no square / border is printed (with or without a signature).
                      try {
                          const field = form.getField(pdfField);
                          let img: any = null;
                          if (signature) {
                              const b = new Uint8Array(signature.bytes);
                              const isPng = b[0] === 0x89 && b[1] === 0x50;
                              img = isPng ? await srcDoc.embedPng(signature.bytes) : await srcDoc.embedJpg(signature.bytes);
                          }
                          const pages = srcDoc.getPages();
                          for (const widget of field.acroField.getWidgets()) {
                              if (!img) break;
                              const r = widget.getRectangle();
                              const ref = srcDoc.context.getObjectRef(widget.dict);
                              const page = pages.find(pg => pg.node.Annots()?.asArray().some(a => a === ref)) || pages[0];
                              const scale = Math.min(r.width / img.width, r.height / img.height);
                              const w = img.width * scale, h = img.height * scale;
                              page.drawImage(img, { x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, width: w, height: h });
                          }
                          form.removeField(field);
                      } catch (err) { console.error(err); }
                      continue;
                  }
                  let val = '';
                  // Book Antiqua 10 everywhere, except the laundry list: Dep Date 7.5, Villa No 6
                  let fontSize = 10;
                  if (dataKey === 'salutation') { val = group.salutation; }
                  if (dataKey === 'villa') { val = group.villa; fontSize = 6; }
                  if (dataKey === 'todayDate') { val = getToday(); }
                  if (dataKey === 'targetDate') { val = longDate(depDate); fontSize = 7.5; }
                  if (dataKey === 'executive') { val = exec?.name || ''; }
                  if (dataKey === 'designation') { val = exec?.role || ''; }
                  try {
                      const field = form.getTextField(pdfField);
                      // Only if it would not fit (e.g. a long family name), shrink it to fit the box
                      const w = field.acroField.getWidgets()[0]?.getRectangle().width || 0;
                      const textW = loadedFont.widthOfTextAtSize(val, 1);
                      if (w && textW && textW * fontSize > w - 4) fontSize = Math.max(Math.min(6, fontSize), (w - 4) / textW);
                      field.setFontSize(fontSize);
                      field.setText(val);
                  } catch (err) {}
              }
              try { form.updateFieldAppearances(loadedFont); } catch (err) { console.error(err); }

              form.flatten();
              filled.push(srcDoc);
          }

          const toUrl = async (doc: PDFDocument) => URL.createObjectURL(new Blob([(await doc.save()) as any], { type: 'application/pdf' }));
          if (printLayout === 'a5') {
              for (const doc of filled) {
                  const copied = await mergedPdf.copyPages(doc, doc.getPageIndices());
                  copied.forEach(pg => mergedPdf.addPage(pg));
              }
              setManualParts(null);
              setPreviewUrl(await toUrl(mergedPdf));
          } else {
              // Double-sided by hand (A5): print every letter, put the stack back in the tray, print every laundry list
              const letters = await PDFDocument.create();
              const lists = await PDFDocument.create();
              const order = reverseBacks ? [...filled].reverse() : filled;
              for (const doc of filled) { const [pg] = await letters.copyPages(doc, [0]); letters.addPage(pg); }
              for (const doc of order) {
                  if (doc.getPageCount() < 2) continue;
                  const [pg] = await lists.copyPages(doc, [1]); lists.addPage(pg);
              }
              const parts = { letters: await toUrl(letters), lists: await toUrl(lists) };
              setManualParts(parts);
              setManualStep('letters');
              setPreviewUrl(parts.letters);
          }
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
                <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><span className="bg-slate-100 w-5 h-5 flex items-center justify-center rounded-full text-[10px]">1</span> Departing guests</h3>
                <div className="flex flex-wrap items-end gap-2">
                    <label className="flex-1 min-w-[150px]">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Departure date</span>
                        <span className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                            <CalendarDays size={14} className="text-[#6D2158] shrink-0"/>
                            <input type="date" value={depDate} onChange={e => e.target.value && setDepDate(e.target.value)} className="bg-transparent text-xs font-black text-[#6D2158] outline-none w-full"/>
                        </span>
                    </label>
                    <button onClick={loadFromGuestList} disabled={loadingList} className="px-4 py-2.5 rounded-lg bg-[#6D2158] text-white text-xs font-black flex items-center gap-1.5 hover:bg-[#5a1b49] disabled:opacity-60 active:scale-95 transition-all">
                        {loadingList ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} Load from Guest List
                    </button>
                </div>
                <p className="text-[10px] font-semibold text-slate-400 mt-2">Defaults to 2 days from today. The letter shows this date. Crew, house use and show villas are left out.</p>
                <label className="block mt-3">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Signed by (Executive)</span>
                    <select value={execId} onChange={e => pickExec(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-[#6D2158]">
                        <option value="">Choose a person…</option>
                        {execs.map(x => <option key={x.id} value={x.id}>{x.name}{x.role ? ` — ${x.role}` : ''}</option>)}
                    </select>
                    {exec && <span className="block text-[10px] font-semibold text-slate-500 mt-1">Designation on the letter: <b className="text-slate-700">{exec.role || '—'}</b></span>}
                </label>
                {exec && (
                    <div className="mt-2 flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                        <div className="w-24 h-14 rounded-md bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                            {sigLoading ? <Loader2 size={14} className="animate-spin text-slate-300"/> : signature ? <img src={signature.url} alt="Signature" className="max-w-full max-h-full object-contain"/> : <span className="text-[9px] font-bold text-slate-300">No signature</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black text-slate-700">Signature</p>
                            <p className="text-[10px] font-semibold text-slate-400">PNG or JPG, best on a white or clear background</p>
                        </div>
                        <label className="shrink-0 px-3 py-2 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-[#6D2158] cursor-pointer hover:border-[#6D2158]">
                            {signature ? 'Replace' : 'Upload'}
                            <input type="file" accept="image/png,image/jpeg" onChange={uploadSignature} className="hidden"/>
                        </label>
                    </div>
                )}
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-3 mt-3 text-center hover:bg-slate-50 relative cursor-pointer group transition-colors">
                    <input type="file" accept=".xlsx,.pdf" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                    <p className="text-[11px] font-bold text-slate-400 group-hover:text-[#6D2158]">or upload a list (PDF / Excel)</p>
                </div>
            </div>

            {/* 2. LETTER TEMPLATE */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><span className="bg-slate-100 w-5 h-5 flex items-center justify-center rounded-full text-[10px]">2</span> Letter template</h3>

                <div className={`flex items-center gap-3 p-3 rounded-xl border mb-3 ${templateStatus === 'READY' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    <FileText size={22} className={templateStatus === 'READY' ? 'text-emerald-600 shrink-0' : 'text-amber-600 shrink-0'}/>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-800">{templateStatus === 'READY' ? 'Letter PDF ready' : templateStatus === 'LOADING' ? 'Loading template…' : 'No letter template yet'}</p>
                        <p className="text-[10px] font-semibold text-slate-500">New housekeeper or signature? Upload the updated letter here.</p>
                    </div>
                    {templateStatus === 'LOADING' && <Loader2 size={14} className="animate-spin text-slate-400 shrink-0"/>}
                </div>

                <label className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-[#6D2158]/30 bg-[#6D2158]/5 text-[#6D2158] text-xs font-black cursor-pointer hover:bg-[#6D2158]/10 transition-colors">
                    <Upload size={16}/> {templateStatus === 'READY' ? 'Upload new letter PDF' : 'Upload letter PDF'}
                    <input type="file" accept=".pdf,application/pdf" onChange={handleTemplateUpload} className="hidden"/>
                </label>
                <p className="text-[10px] font-semibold text-slate-400 mt-2 leading-relaxed">
                    A PDF with form fields (date, guest name, signature name, designation, dep date, villa no) and an image box for the signature. Check the fields in step 4.
                </p>

                <div className="h-px bg-slate-100 my-3"/>
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
                                    <option value="executive">Executive name</option>
                                    <option value="designation">Designation</option>
                                    <option value="signature">Signature image</option>
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {/* GENERATE */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 shrink-0">
                <h3 className="font-bold text-slate-700 mb-3 text-sm">How to print</h3>
                <div className="grid gap-2">
                    {([
                        ['manual', 'A5, double-sided by hand', 'Print all the letters, put the stack back in the tray, then print all the laundry lists on the back.'],
                        ['a5', 'A5, one file', 'Letter and laundry list one after the other (for a printer that can do A5 double-sided).'],
                    ] as const).map(([k, label, hint]) => (
                        <label key={k} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${printLayout === k ? 'border-[#6D2158] bg-[#6D2158]/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <input type="radio" name="dep-layout" className="mt-0.5 accent-[#6D2158]" checked={printLayout === k} onChange={() => { setPrintLayout(k); setPreviewUrl(null); }}/>
                            <span>
                                <span className="block text-xs font-bold text-slate-700">{label}</span>
                                <span className="block text-[10px] text-slate-500">{hint}</span>
                            </span>
                        </label>
                    ))}
                </div>
                {printLayout === 'manual' && (
                    <label className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-slate-500 cursor-pointer">
                        <input type="checkbox" className="accent-[#6D2158]" checked={reverseBacks} onChange={(e) => { setReverseBacks(e.target.checked); setPreviewUrl(null); setManualParts(null); }}/>
                        Laundry lists land on the wrong villa's letter: print them in reverse order
                    </label>
                )}
                <p className="mt-2 text-[10px] text-slate-400">In the print window choose A5, Portrait, Actual size (100%).</p>
            </div>

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
            {previewUrl && manualParts && (
                <div className="flex gap-2 p-2 bg-white border-b border-slate-200 shrink-0">
                    {([['letters', '1. Print letters'], ['lists', '2. Then laundry lists']] as const).map(([k, label]) => (
                        <button key={k} onClick={() => { setManualStep(k); setPreviewUrl(manualParts[k]); }}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${manualStep === k ? 'bg-[#6D2158] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            )}
            {previewUrl ? (
                <iframe key={previewUrl} src={previewUrl} className="w-full flex-1" title="PDF Preview"/>
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
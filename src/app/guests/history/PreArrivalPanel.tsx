"use client";
// Pre-arrival form for one stay: drop the guest's PDF (or tick by hand from a paper form), check, save.
// A scanned PDF or a photo has no form fields: its pages are shown beside the form to fill in by hand,
// The scan itself is never stored.
// Only housekeeping items are kept; passport, contact and flight details are never stored.
import React, { useRef, useState } from 'react';
import { X, Upload, Loader2, Save, Trash2, AlertTriangle, FileText, Check, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { readSession } from '@/lib/requestsShared';
import {
  PA_COMFORT, PA_DIET, PA_ENTERTAINMENT, PA_MINIBAR, PA_SCENTS, emptyPreArrival, readPreArrivalPdf, savePreArrival, deletePreArrival, scanImages,
  type PreArrival,
} from '@/lib/preArrival';

type Props = {
  stay: { key: string; villa: string; arr: string; name: string };
  existing: PreArrival | null;
  onClose: () => void;
  onSaved: (pa: PreArrival | null) => void;
};

export default function PreArrivalPanel({ stay, existing, onClose, onSaved }: Props) {
  const { confirmAction } = useConfirm();
  const [pa, setPa] = useState<PreArrival>(() => existing ? JSON.parse(JSON.stringify(existing)) : emptyPreArrival(stay));
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<string[]>([]);       // page images of a scanned form (not saved)
  const [zoom, setZoom] = useState<string | null>(null);

  const set = <K extends keyof PreArrival>(k: K, v: PreArrival[K]) => setPa(p => ({ ...p, [k]: v }));
  const toggle = (k: 'diet' | 'minibar' | 'comfort' | 'entertainment', v: string) =>
    setPa(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }));
  const pillowOf = (scent: string) => pa.pillow.find(p => p.scent === scent);
  const setPillow = (scent: string, freq: 'Once' | 'Daily' | '' | null) =>
    setPa(p => ({ ...p, pillow: freq === null ? p.pillow.filter(x => x.scent !== scent) : [...p.pillow.filter(x => x.scent !== scent), { scent, freq }] }));

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) { toast.error('Choose the PDF form or a photo of it'); return; }
    setReading(true); setWarning(''); setScan([]);
    try {
      if (isPdf) {
        const { data, surnames, recognised } = await readPreArrivalPdf(file);
        if (recognised) {
          setPa(p => ({ ...emptyPreArrival(stay), ...data, _id: p._id, file_name: file.name } as PreArrival));
          const stayName = stay.name.toLowerCase();
          const other = surnames.filter(s => s.trim() && !stayName.includes(s.trim().toLowerCase()));
          if (surnames.length && other.length === surnames.length) setWarning(`The form is for "${surnames.join(' / ')}" but this stay is ${stay.name}. Check it is the right guest.`);
          toast.success('Form read: check and save');
          return;
        }
      }
      // Scanned PDF or photo: show the pages beside the form
      const pages = await scanImages(file);
      setScan(pages);
      setPa(p => ({ ...p, file_name: file.name }));
      setWarning('Scanned copy: fill in the form from the pages shown (tap a page to zoom).');
    } catch (e: any) {
      setWarning('Could not read this file: ' + (e?.message || e) + '. Tick the items by hand below.');
    } finally { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const save = async () => {
    setSaving(true);
    try {
      const me = readSession();
      const saved = await savePreArrival({ ...pa, stay_key: stay.key, villa: stay.villa, arr: stay.arr, saved_by: me.full_name || '', saved_at: new Date().toISOString() });
      toast.success('Pre-arrival form saved');
      onSaved(saved);
    } catch (e: any) { toast.error('Not saved: ' + (e?.message || e)); }
    setSaving(false);
  };

  const remove = async () => {
    if (!pa._id) return;
    if (!(await confirmAction({ title: 'Remove pre-arrival form?', message: 'Its items disappear from this profile and from the VA task list.', confirmText: 'Remove', isDestructive: true, icon: 'warning' }))) return;
    setSaving(true);
    try { await deletePreArrival(pa._id); toast.success('Removed'); onSaved(null); } catch (e: any) { toast.error('Not removed: ' + (e?.message || e)); }
    setSaving(false);
  };

  const chip = (on: boolean, label: string, onClick: () => void, tone = 'bg-[#6D2158] border-[#6D2158]') => (
    <button key={label} type="button" onClick={onClick}
      className={`h-9 px-3 rounded-xl border text-xs font-black flex items-center gap-1.5 ${on ? `${tone} text-white` : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
      {on && <Check size={13} strokeWidth={3} />}{label}
    </button>
  );
  const section = (title: string, children: React.ReactNode) => (
    <section>
      <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">{title}</h3>
      {children}
    </section>
  );
  const input = 'w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 outline-none focus:border-[#6D2158]';

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className={`bg-white w-full ${scan.length ? 'sm:max-w-6xl' : 'sm:max-w-2xl'} max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex-none px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[#6D2158]">Pre-arrival form</h2>
            <p className="text-xs font-bold text-slate-400 truncate">V{stay.villa} · {stay.name}{pa.saved_at ? ` · saved by ${pa.saved_by || '—'}` : ''}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {scan.length > 0 && (
          <div className="flex-none lg:flex-1 lg:min-w-0 max-h-[38vh] lg:max-h-none overflow-y-auto bg-slate-100 border-b lg:border-b-0 lg:border-r border-slate-200 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><ScanLine size={13} /> Scanned form ({scan.length} page{scan.length > 1 ? 's' : ''})</p>
            </div>
            {scan.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`Page ${i + 1}`} onClick={() => setZoom(src)} className="w-full rounded-lg border border-slate-200 bg-white cursor-zoom-in" />
            ))}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* Upload */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files?.[0]); }}
            onClick={() => fileRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-4 flex items-center gap-3 cursor-pointer transition-colors ${dragOver ? 'border-[#6D2158] bg-[#6D2158]/5' : 'border-slate-200 hover:border-slate-300'}`}>
            <div className="w-11 h-11 rounded-xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center shrink-0">
              {reading ? <Loader2 size={20} className="animate-spin" /> : pa.file_name ? <FileText size={20} /> : <Upload size={20} />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800 truncate">{reading ? 'Reading the form…' : pa.file_name || 'Drop the guest\'s PDF, a scan or a photo here, or tap to choose'}</p>
              <p className="text-[11px] font-bold text-slate-400">Only housekeeping items are kept. Passport, contact and flight details are not saved.</p>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf,image/*" className="hidden" onChange={e => readFile(e.target.files?.[0])} />
          </div>
          {warning && <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{warning}</p>}

          {section('Celebration', (
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <input value={pa.celebration} onChange={e => set('celebration', e.target.value)} placeholder="e.g. Annette's birthday" className={input} />
              <input value={pa.celebration_date} onChange={e => set('celebration_date', e.target.value)} placeholder="Date" className={input} />
            </div>
          ))}

          {section('Service & ice times', (
            <div className="grid grid-cols-3 gap-2">
              {([['service_morning', 'Morning service'], ['service_td', 'Turndown'], ['ice_time', 'Daily ice']] as const).map(([k, label]) => (
                <label key={k} className="text-[11px] font-black text-slate-500">{label}
                  <input type="time" value={pa[k] || ''} onChange={e => setPa(p => ({ ...p, [k]: e.target.value, ...(k === 'ice_time' && e.target.value && !p.comfort.includes('Ice') ? { comfort: [...p.comfort, 'Ice'] } : {}) }))}
                    className="mt-1 w-full h-10 px-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 outline-none focus:border-[#6D2158]" />
                </label>
              ))}
            </div>
          ))}

          {section('Diet & allergies', (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">{PA_DIET.map(d => chip(pa.diet.includes(d), d, () => toggle('diet', d), 'bg-rose-600 border-rose-600'))}</div>
              <input value={pa.allergies} onChange={e => set('allergies', e.target.value)} placeholder="Allergies" className={input} />
            </div>
          ))}

          {section('Minibar', <div className="flex flex-wrap gap-1.5">{PA_MINIBAR.map(m => chip(pa.minibar.includes(m), m, () => toggle('minibar', m), 'bg-purple-600 border-purple-600'))}</div>)}

          {section('Items for the villa', (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">{PA_COMFORT.map(c => chip(pa.comfort.includes(c), c, () => toggle('comfort', c)))}</div>
            </div>
          ))}

          {section('Pillow fragrance', (
            <div className="grid sm:grid-cols-2 gap-2">
              {PA_SCENTS.map(sc => {
                const p = pillowOf(sc);
                return (
                  <div key={sc} className={`rounded-xl border px-3 py-2 flex items-center gap-2 ${p ? 'border-[#6D2158]/40 bg-[#6D2158]/5' : 'border-slate-200'}`}>
                    <span className="text-sm font-black text-slate-700 flex-1">{sc}</span>
                    {(['Once', 'Daily'] as const).map(f => (
                      <button key={f} type="button" onClick={() => setPillow(sc, p?.freq === f ? null : f)}
                        className={`h-8 px-2.5 rounded-lg text-[11px] font-black ${p?.freq === f ? 'bg-[#6D2158] text-white' : 'bg-slate-100 text-slate-500'}`}>{f}</button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          {section('In-villa entertainment', <div className="flex flex-wrap gap-1.5">{PA_ENTERTAINMENT.map(m => chip(pa.entertainment.includes(m), m, () => toggle('entertainment', m)))}</div>)}

          {section('Additional bedding', <input value={pa.bedding} onChange={e => set('bedding', e.target.value)} placeholder="e.g. extra bed, rollaway" className={input} />)}

          {section('Other preferences', (
            <textarea value={pa.other} onChange={e => set('other', e.target.value)} rows={3} placeholder="Anything else the guest asked for"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 outline-none focus:border-[#6D2158]" />
          ))}

          {section('Stayed at another Six Senses', <input value={pa.six_senses_before} onChange={e => set('six_senses_before', e.target.value)} placeholder="Which one (leave empty if not)" className={input} />)}
        </div>
        </div>

        <div className="flex-none p-4 border-t border-slate-100 flex gap-2">
          {pa._id && <button onClick={remove} disabled={saving} className="h-11 w-11 rounded-xl border border-rose-200 text-rose-600 flex items-center justify-center disabled:opacity-40" aria-label="Remove form" title="Remove form"><Trash2 size={16} /></button>}
          <button onClick={onClose} className="h-11 px-4 rounded-xl border border-slate-200 text-xs font-black text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving || reading} className="flex-1 h-11 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save form
          </button>
        </div>
      </div>
      {zoom && (
        <div className="fixed inset-0 z-[80] bg-slate-900/80 overflow-auto p-4" onClick={e => { e.stopPropagation(); setZoom(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Page" className="mx-auto max-w-none w-[min(1400px,200%)] rounded-lg bg-white" />
        </div>
      )}
    </div>
  );
}

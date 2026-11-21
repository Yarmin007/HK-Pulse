"use client";
// Cake Request Form: fill it here (pick the host to fill name / designation / department / ID / phone),
// see the exact form with the details, then print or save it. A blank fillable PDF is also available.
import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Download, FileText, Loader2, Search, Check, Eraser } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import {
  CAKE_SIZES, CAKE_CHARGE, CAKE_FLAVORS, emptyCakeForm, buildFilledCakePdf, buildFillableCakePdf, printPdf, downloadPdf, type CakeForm,
} from '@/lib/cakeForm';

type Host = { id: string; host_id: string; full_name: string; role: string | null; sub_department: string | null; company_mobile: string | null; personal_mobile: string | null; phone: string | null };

const niceDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const niceTime = (hhmm: string) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });

export default function CakeRequestMode() {
  const [f, setF] = useState<CakeForm>(() => ({ ...emptyCakeForm(), requestedDate: todayIso() }));
  const [hosts, setHosts] = useState<Host[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<'' | 'print' | 'save' | 'blank'>('');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    supabase.from('hsk_hosts').select('id, host_id, full_name, role, sub_department, company_mobile, personal_mobile, phone').eq('status', 'Active').order('full_name')
      .then(({ data }) => setHosts((data || []) as Host[]));
  }, []);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return hosts.filter(h => `${h.full_name} ${h.host_id}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, hosts]);

  const pickHost = (h: Host) => {
    setF(p => ({
      ...p, fullName: h.full_name, designation: h.role || '', hostId: h.host_id || '',
      department: h.sub_department ? `Housekeeping (${h.sub_department})` : 'Housekeeping',
      phone: h.company_mobile || h.personal_mobile || h.phone || p.phone,
    }));
    setQ('');
  };

  // Dates / time typed with pickers, written on the form the way people write them
  const [dates, setDates] = useState({ pickupDate: '', requestedDate: todayIso(), pickupTime: '' });
  const filled: CakeForm = { ...f, pickupDate: niceDate(dates.pickupDate), requestedDate: niceDate(dates.requestedDate), pickupTime: niceTime(dates.pickupTime) };

  // Live preview (desktop), rebuilt shortly after typing stops
  const key = JSON.stringify(filled);
  useEffect(() => {
    let url = '';
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const bytes = await buildFilledCakePdf(JSON.parse(key));
        if (!alive) return;
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
        setPreview(url);
      } catch { /* preview is optional */ }
    }, 400);
    return () => { alive = false; clearTimeout(t); if (url) URL.revokeObjectURL(url); };
  }, [key]);

  const missing = [!f.fullName.trim() && 'name', !f.hostId.trim() && 'host ID', !dates.pickupDate && 'pick-up date', !f.size && 'cake size', !f.charge && 'who pays'].filter(Boolean) as string[];

  const run = async (what: 'print' | 'save' | 'blank') => {
    setBusy(what);
    try {
      if (what === 'blank') { downloadPdf(await buildFillableCakePdf(), 'Cake Request Form 2025 (fillable).pdf'); toast.success('Blank fillable form downloaded'); return; }
      const bytes = await buildFilledCakePdf(filled);
      if (what === 'print') printPdf(bytes);
      else { downloadPdf(bytes, `Cake Request ${f.fullName || 'form'}${dates.pickupDate ? ` ${dates.pickupDate}` : ''}.pdf`); toast.success('PDF saved'); }
    } catch (e) { toast.error('Could not make the PDF: ' + ((e as Error)?.message || e)); }
    finally { setBusy(''); }
  };

  const set = <K extends keyof CakeForm>(k: K, v: CakeForm[K]) => setF(p => ({ ...p, [k]: v }));
  const input = 'w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 outline-none focus:border-[#6D2158]';
  const label = 'block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1';
  const choice = (on: boolean) => `h-11 px-3 rounded-xl border-2 text-xs font-black flex items-center justify-center gap-1.5 transition-colors ${on ? 'bg-[#6D2158] border-[#6D2158] text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 pb-24 md:pb-4">
      {/* Form */}
      <div className="lg:overflow-y-auto lg:pr-1 space-y-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="relative">
            <label className={label}>Find the host</label>
            <Search size={15} className="absolute left-3 top-[34px] text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name or Host ID — fills the details below" className={`${input} pl-9`} />
            {matches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                {matches.map(h => (
                  <li key={h.id}><button onClick={() => pickHost(h)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800 flex-1 truncate">{h.full_name}</span>
                    <span className="text-[11px] font-bold text-slate-400">{h.host_id} · {h.role}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Full name</label><input value={f.fullName} onChange={e => set('fullName', e.target.value)} className={input} /></div>
            <div><label className={label}>Designation</label><input value={f.designation} onChange={e => set('designation', e.target.value)} className={input} /></div>
            <div><label className={label}>Department</label><input value={f.department} onChange={e => set('department', e.target.value)} className={input} /></div>
            <div><label className={label}>Host ID No.</label><input value={f.hostId} onChange={e => set('hostId', e.target.value)} className={input} /></div>
            <div className="sm:col-span-2"><label className={label}>Phone number</label><input value={f.phone} onChange={e => set('phone', e.target.value)} inputMode="tel" className={input} /></div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className={label}>Occasion / purpose</label><input value={f.occasion} onChange={e => set('occasion', e.target.value)} placeholder="e.g. Birthday" className={input} /></div>
            <div><label className={label}>Requested date</label><input type="date" value={dates.requestedDate} onChange={e => setDates(d => ({ ...d, requestedDate: e.target.value }))} className={input} /></div>
            <div><label className={label}>Pick up date</label><input type="date" value={dates.pickupDate} onChange={e => setDates(d => ({ ...d, pickupDate: e.target.value }))} className={input} /></div>
            <div><label className={label}>Pick up time</label><input type="time" value={dates.pickupTime} onChange={e => setDates(d => ({ ...d, pickupTime: e.target.value }))} className={input} /></div>
            <div>
              <label className={label}>Flavor</label>
              <div className="grid grid-cols-2 gap-2">{CAKE_FLAVORS.map(fl => <button key={fl} type="button" onClick={() => set('flavor', f.flavor === fl ? '' : fl)} className={choice(f.flavor === fl)}>{f.flavor === fl && <Check size={13} strokeWidth={3} />}{fl}</button>)}</div>
            </div>
            <div className="sm:col-span-2"><label className={label}>Wording for the cake</label><input value={f.wording} onChange={e => set('wording', e.target.value)} placeholder="e.g. Happy Birthday Aisha" className={input} /></div>
          </div>
          {dates.pickupDate && dates.requestedDate && dates.pickupDate < new Date(new Date(`${dates.requestedDate}T12:00:00`).getTime() + 3 * 86400000).toISOString().slice(0, 10) && (
            <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Pastry needs the form at least 3 days before the pick-up date.</p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div><label className={label}>Size of the cake</label>
            <div className="grid grid-cols-3 gap-2">{CAKE_SIZES.map(s => <button key={s} type="button" onClick={() => set('size', f.size === s ? '' : s)} className={choice(f.size === s)}>{f.size === s && <Check size={13} strokeWidth={3} />}{s}</button>)}</div>
          </div>
          <div><label className={label}>To be charged to</label>
            <div className="grid grid-cols-3 gap-2">{CAKE_CHARGE.map(c => <button key={c} type="button" onClick={() => set('charge', f.charge === c ? '' : c)} className={choice(f.charge === c)}>{f.charge === c && <Check size={13} strokeWidth={3} />}{c}</button>)}</div>
          </div>
          <p className="text-[11px] font-semibold text-slate-400">&ldquo;Approved by&rdquo; stays blank for signing by hand.</p>
        </section>

        <section className="space-y-2">
          {missing.length > 0 && <p className="text-[11px] font-bold text-slate-400 text-center">Still empty: {missing.join(', ')}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => run('print')} disabled={!!busy} className="h-12 rounded-xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">{busy === 'print' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Print</button>
            <button onClick={() => run('save')} disabled={!!busy} className="h-12 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">{busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Save PDF</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => run('blank')} disabled={!!busy} className="h-10 rounded-xl bg-slate-100 text-slate-600 text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50">{busy === 'blank' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Blank fillable PDF</button>
            <button onClick={() => { setF({ ...emptyCakeForm() }); setDates({ pickupDate: '', requestedDate: todayIso(), pickupTime: '' }); }} className="h-10 rounded-xl bg-slate-100 text-slate-600 text-xs font-black flex items-center justify-center gap-1.5"><Eraser size={14} /> Clear</button>
          </div>
        </section>
      </div>

      {/* Preview (desktop) */}
      <div className="hidden lg:flex flex-col min-h-0 bg-slate-200/60 rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><FileText size={13} /> Preview — exactly what prints</div>
        {preview ? <iframe key={preview} src={`${preview}#toolbar=0&navpanes=0&view=FitH`} title="Cake request form preview" className="flex-1 w-full bg-white" />
          : <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>}
      </div>
    </div>
  );
}

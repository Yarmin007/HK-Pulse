"use client";
// Pest Control: log treatments per outlet and auto-generate the PestEX
// Phone: outlet cards + a bottom sheet per outlet. Desktop (lg+): sidebar (date, shift, sign-off) and the
// worksheet as a table — click the tick boxes, type chemical / remarks in place; every change saves.
// "Pest Control Day & Night Worksheet" as PDF — daily, monthly or for any date range.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bug, Sun, Moon, Loader2, CheckCircle2, ChevronRight, ChevronLeft, X, Search, Copy, FileDown,
  ClipboardList, FileText, Wind, CalendarDays, CalendarRange, Calendar, Share2, Eye, Trash2, PenLine, Eraser, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminOnly from '@/components/AdminOnly';
import FumigationTab from './FumigationTab';
import { getDhakaDateStr } from '@/lib/dateUtils';
import {
  PEST_TARGETS, PEST_METHODS, PEST_OUTLETS, PestShift, PestWorksheet, PestRow,
  emptyWorksheet, emptyPestRow, loadWorksheet, saveWorksheet, deleteWorksheet, loadPestControl,
  loadWorksheetsInRange, loadPreviousWorksheet, collectChemicals, pestRowHasData, canUsePestControl, isPestAccount,
} from '@/lib/pestControl';

// ---------- helpers ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nice = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d} ${MONTHS[+m - 1]} ${y}`; };
const niceShort = (iso: string) => { const [, m, d] = iso.split('-'); return `${d} ${MONTHS[+m - 1]}`; };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const errMsg = (err: unknown) => (err instanceof Error ? err.message : (err as { message?: string })?.message) || 'Unknown error';
const sessionName = () => { try { return JSON.parse(localStorage.getItem('hk_pulse_session') || '{}').full_name || ''; } catch { return ''; } };

const PEST_ICON: Record<string, string> = { Cockroach: '🪳', Rats: '🐀', Flies: '🪰', Ants: '🐜', Mosquitoes: '🦟', Others: '🐛' };
const METHOD_ICON: Record<string, string> = { 'Hand Spray': '🧴', Fog: '🌫️', 'Mist Blow': '💨', 'Bait Station': '📦', Fumigation: '☁️' };
const COMMON_CHEMICALS = ['Cypermethrin', 'Deltamethrin (K-Othrine)', 'Fipronil Gel', 'Bromadiolone Bait', 'Imidacloprid'];

type Tab = 'log' | 'reports' | 'fumigation';

function Chip({ on, onClick, children, tone = 'brand' }: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: 'brand' | 'teal' }) {
  const onCls = tone === 'teal' ? 'bg-teal-600 border-teal-600 text-white shadow-sm' : 'bg-[#6D2158] border-[#6D2158] text-white shadow-sm';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[48px] px-3 py-2 rounded-2xl border-2 text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${on ? onCls : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
    >
      {children}
    </button>
  );
}

// Desktop worksheet tick box
function TickBox({ on, onClick, tone, label }: { on: boolean; onClick: () => void; tone: string; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} title={label}
      className={`w-8 h-8 mx-auto rounded-lg border-2 flex items-center justify-center transition-colors ${on ? `${tone} text-white` : 'border-slate-200 text-transparent hover:border-slate-400'}`}>
      <Check size={15} strokeWidth={3} />
    </button>
  );
}

// ======================================================================================
function PestControlApp() {
  const today = getDhakaDateStr();
  const [tab, setTab] = useState<Tab>('log');

  // ---- LOG STATE ----
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState<PestShift>(() => (new Date().getHours() >= 18 || new Date().getHours() < 5 ? 'Night' : 'Day'));
  const [sheet, setSheet] = useState<PestWorksheet>(() => emptyWorksheet(today, 'Day'));
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [signoffDirty, setSignoffDirty] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PestRow>(emptyPestRow());
  const [chemicals, setChemicals] = useState<string[]>(COMMON_CHEMICALS);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async (d: string, s: PestShift) => {
    setLoading(true);
    setConfirmDelete(false);
    setSignoffDirty(false);
    try {
      const { id, sheet: loaded } = await loadWorksheet(d, s);
      if (!id) {
        try { const { team } = await loadPestControl(); if (team[0]?.name) loaded.technician.name = team[0].name; } catch { /* optional */ }
        // The shared Pest Control login isn't a resort representative — leave that name for the resort to fill
        if (!isPestAccount()) loaded.representative.name = sessionName();
      }
      setSheet(loaded);
      setIsSaved(!!id);
      setSaveState(id ? 'saved' : 'idle');
    } catch (err) {
      toast.error('Could not load sheet: ' + errMsg(err));
      setSheet(emptyWorksheet(d, s));
      setIsSaved(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date, shift); }, [date, shift, load]);

  // Chemical quick-picks from the last 90 days
  useEffect(() => {
    loadWorksheetsInRange(addDays(today, -90), today)
      .then(sheets => {
        const used = collectChemicals(sheets);
        setChemicals(Array.from(new Set([...used, ...COMMON_CHEMICALS])).slice(0, 10));
      })
      .catch(() => { /* keep defaults */ });
  }, [today]);

  // Saves are chained so quick taps never overwrite each other out of order
  const persist = useCallback((next: PestWorksheet) => {
    setSaveState('saving');
    saveChain.current = saveChain.current
      .then(() => saveWorksheet({ ...next, savedBy: sessionName() }))
      .then(() => { setIsSaved(true); setSaveState('saved'); })
      .catch(err => { setSaveState('error'); toast.error('Save failed: ' + errMsg(err)); });
    return saveChain.current;
  }, []);

  // Desktop table edits a row in place (saves at once, like the phone editor)
  const updateRow = (outlet: string, patch: Partial<PestRow>) => {
    const row = { ...emptyPestRow(), ...(sheet.rows[outlet] || {}), ...patch };
    const next = { ...sheet, rows: { ...sheet.rows, [outlet]: row } };
    setSheet(next);
    persist(next);
  };

  const doneCount = useMemo(() => PEST_OUTLETS.filter(o => pestRowHasData(sheet.rows[o])).length, [sheet]);
  const pct = Math.round((doneCount / PEST_OUTLETS.length) * 100);

  const q = search.trim().toLowerCase();
  const visible = PEST_OUTLETS.filter(o => {
    const done = pestRowHasData(sheet.rows[o]);
    if (filter === 'done' && !done) return false;
    if (filter === 'pending' && done) return false;
    return !q || o.toLowerCase().includes(q);
  });

  // ---- editor ----
  const openEditor = (outlet: string) => { setEditing(outlet); setDraft({ ...emptyPestRow(), ...(sheet.rows[outlet] || {}) }); };
  const closeEditor = () => setEditing(null);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  const commitDraft = (thenOpen?: string | null) => {
    if (!editing) return;
    const prev = sheet.rows[editing] || emptyPestRow();
    const changed = JSON.stringify(prev) !== JSON.stringify(draft);
    if (changed) {
      const next = { ...sheet, rows: { ...sheet.rows, [editing]: { ...draft, chemical: draft.chemical.trim(), remarks: draft.remarks.trim() } } };
      setSheet(next);
      persist(next);
    }
    if (thenOpen) openEditor(thenOpen); else closeEditor();
  };

  const editingIdx = editing ? PEST_OUTLETS.indexOf(editing) : -1;
  const nextOutlet = editingIdx >= 0 ? PEST_OUTLETS[editingIdx + 1] : undefined;
  const prevOutlet = editingIdx > 0 ? PEST_OUTLETS[editingIdx - 1] : undefined;

  // Lock page scroll behind the bottom sheet
  useEffect(() => {
    if (!editing) return;
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = o; };
  }, [editing]);

  const copyPrevious = async () => {
    try {
      const prev = await loadPreviousWorksheet(date, shift);
      if (!prev) { toast.error(`No earlier ${shift} sheet to copy`); return; }
      const rows = { ...sheet.rows };
      let n = 0;
      PEST_OUTLETS.forEach(o => {
        if (!pestRowHasData(rows[o]) && pestRowHasData(prev.rows[o])) { rows[o] = { ...prev.rows[o], remarks: '' }; n++; }
      });
      if (n === 0) { toast('Nothing new to copy — all filled outlets kept'); return; }
      const next = { ...sheet, rows, technician: { ...sheet.technician, name: sheet.technician.name || prev.technician.name } };
      setSheet(next);
      await persist(next);
      toast.success(`Copied ${n} outlets from ${nice(prev.date)}`);
    } catch (err) {
      toast.error('Copy failed: ' + errMsg(err));
    }
  };

  const saveSignoff = async () => { await persist(sheet); setSignoffDirty(false); toast.success('Sign-off saved'); };

  const removeSheet = async () => {
    try {
      await saveChain.current;
      await deleteWorksheet(date, shift);
      toast.success('Sheet deleted');
      load(date, shift);
    } catch (err) { toast.error('Delete failed: ' + errMsg(err)); }
  };

  // ======================================================================================
  // REPORTS
  const [mode, setMode] = useState<'daily' | 'monthly' | 'range'>('daily');
  const [rDay, setRDay] = useState(today);
  const [rMonth, setRMonth] = useState(today.slice(0, 7));
  const [rFrom, setRFrom] = useState(addDays(today, -6));
  const [rTo, setRTo] = useState(today);
  const [rShift, setRShift] = useState<PestShift | 'Both'>('Both');
  const [withSummary, setWithSummary] = useState(true);
  const [found, setFound] = useState<PestWorksheet[] | null>(null);
  const [busy, setBusy] = useState<'' | 'download' | 'share' | 'preview'>('');

  const range = useMemo(() => {
    if (mode === 'daily') return { from: rDay, to: rDay, label: nice(rDay), file: rDay };
    if (mode === 'monthly') { const [y, m] = rMonth.split('-'); return { from: `${rMonth}-01`, to: monthEnd(rMonth), label: `${MONTHS_LONG[+m - 1]} ${y}`, file: rMonth }; }
    const [from, to] = rFrom <= rTo ? [rFrom, rTo] : [rTo, rFrom];
    return { from, to, label: `${niceShort(from)} – ${nice(to)}`, file: `${from}_to_${to}` };
  }, [mode, rDay, rMonth, rFrom, rTo]);

  useEffect(() => {
    if (tab !== 'reports') return;
    let alive = true;
    setFound(null);
    loadWorksheetsInRange(range.from, range.to, rShift)
      .then(s => { if (alive) setFound(s); })
      .catch(err => { if (alive) { setFound([]); toast.error(errMsg(err)); } });
    return () => { alive = false; };
  }, [tab, range.from, range.to, rShift]);

  const makePdf = async () => {
    const sheets = found ?? await loadWorksheetsInRange(range.from, range.to, rShift);
    const { buildPestControlPdf } = await import('@/lib/pestControlPdf');
    const { doc } = buildPestControlPdf(sheets, {
      from: range.from, to: range.to, shift: rShift, label: range.label,
      includeSummary: withSummary, blankWhenEmpty: mode === 'daily',
    });
    const name = `PestControl_${range.file}${rShift === 'Both' ? '' : '_' + rShift}.pdf`;
    return { doc, name };
  };

  const canShareFiles = typeof navigator !== 'undefined' && !!navigator.canShare && (() => {
    try { return navigator.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] }); } catch { return false; }
  })();

  const runPdf = async (action: 'download' | 'share' | 'preview') => {
    if (mode !== 'daily' && found && found.length === 0) { toast.error('No saved sheets in this period'); return; }
    setBusy(action);
    try {
      const { doc, name } = await makePdf();
      if (action === 'download') { doc.save(name); toast.success('PDF downloaded'); }
      else if (action === 'preview') { window.open(URL.createObjectURL(doc.output('blob')), '_blank'); }
      else {
        const file = new File([doc.output('blob')], name, { type: 'application/pdf' });
        await navigator.share({ files: [file], title: `Pest Control – ${range.label}` });
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') toast.error('PDF failed: ' + errMsg(err));
    } finally {
      setBusy('');
    }
  };

  const openSheetFromReport = (s: PestWorksheet) => { setDate(s.date); setShift(s.shift); setTab('log'); window.scrollTo({ top: 0 }); };

  const signoff = (
<section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-5 lg:gap-y-3">
            <h2 className="lg:col-span-2 text-sm font-black text-slate-800 flex items-center gap-2"><PenLine size={16} className="text-[#6D2158]" /> Sign-off</h2>
            {([['extraWork', 'Extra work done', 'e.g. Fogging around host village drains'], ['repComments', "Representative's comments", 'Any feedback for PestEX']] as const).map(([k, label, ph]) => (
              <label key={k} className="block">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</span>
                <textarea rows={2} value={sheet[k]} placeholder={ph} onChange={e => { setSheet({ ...sheet, [k]: e.target.value }); setSignoffDirty(true); }} className="mt-1 w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold outline-none focus:border-[#6D2158] resize-none" />
              </label>
            ))}
            <div className="grid sm:grid-cols-2 gap-3">
              {([['technician', 'PestEX technician'], ['representative', 'Resort representative']] as const).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</span>
                  <input value={sheet[k].name} onChange={e => { setSheet({ ...sheet, [k]: { ...sheet[k], name: e.target.value } }); setSignoffDirty(true); }} className="mt-1 w-full h-12 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                </label>
              ))}
            </div>
            <div className="space-y-2 lg:self-end">
            <p className="text-[11px] font-semibold text-slate-400">Signatures are left blank on the PDF for signing by hand.</p>
            <button onClick={saveSignoff} disabled={!signoffDirty || saveState === 'saving'} className="w-full h-12 rounded-2xl bg-[#6D2158] text-white text-sm font-black disabled:opacity-40 active:scale-[0.99]">
              {signoffDirty ? 'Save sign-off' : 'Sign-off saved'}
            </button>

            </div>
            {isSaved && (
              <div className="pt-1 flex justify-center lg:col-span-2">
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-rose-600">Delete this {shift} sheet?</span>
                    <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-black text-slate-600">Cancel</button>
                    <button onClick={removeSheet} className="px-3 py-2 rounded-xl bg-rose-600 text-xs font-black text-white">Delete</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="px-3 py-2 rounded-xl text-xs font-black text-rose-500 flex items-center gap-1.5"><Trash2 size={13} /> Delete sheet</button>
                )}
              </div>
            )}
          </section>
  );

  // ======================================================================================
  return (
    <div className="min-h-screen bg-slate-50 pb-32 md:pb-12">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-3xl lg:max-w-[1400px] mx-auto px-4 lg:px-6 pt-3 pb-2 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><Bug size={20} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-[#6D2158] leading-tight">Pest Control</h1>
            <p className="text-[11px] font-bold text-slate-400 truncate">PestEX Day &amp; Night Worksheet</p>
          </div>
        </div>
        <div className="max-w-3xl lg:max-w-[1400px] mx-auto px-4 lg:px-6 pb-3">
          <div className="grid grid-cols-3 p-1 rounded-2xl bg-slate-100 lg:max-w-xl">
            {([['log', 'Log', ClipboardList], ['fumigation', 'Fumigation', Wind], ['reports', 'Reports', FileText]] as const).map(([k, label, Icon]) => (
              <button key={k} onClick={() => setTab(k)} className={`py-2.5 rounded-xl text-[13px] sm:text-sm font-black flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${tab === k ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500'}`}>
                <Icon size={16} className="shrink-0" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl lg:max-w-[1400px] mx-auto px-4 lg:px-6 pt-4 space-y-4">
        {tab === 'fumigation' ? <FumigationTab /> : tab === 'log' ? (
          <div className="space-y-4">
            {/* Date + shift + progress (desktop: one bar) */}
            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-3">
              <div className="flex items-center gap-2 lg:w-[290px]">
                <button onClick={() => setDate(addDays(date, -1))} className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 active:scale-95" aria-label="Previous day"><ChevronLeft size={18} /></button>
                <label className="relative flex-1 h-11 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-sm font-black text-slate-800 cursor-pointer">
                  <Calendar size={15} className="text-[#6D2158]" />
                  {nice(date)}{date === today && <span className="text-[10px] font-black text-emerald-600 uppercase">Today</span>}
                  <input type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                </label>
                <button onClick={() => setDate(addDays(date, 1))} disabled={date >= today} className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 active:scale-95 disabled:opacity-30" aria-label="Next day"><ChevronRight size={18} /></button>
              </div>

              <div className="grid grid-cols-2 gap-2 lg:w-[250px]">
                {(['Day', 'Night'] as PestShift[]).map(s => (
                  <button key={s} onClick={() => setShift(s)} className={`h-12 rounded-2xl text-sm font-black flex items-center justify-center gap-2 border-2 transition-all active:scale-[0.98] ${shift === s ? (s === 'Day' ? 'bg-amber-50 border-amber-400 text-amber-800' : 'bg-indigo-50 border-indigo-400 text-indigo-800') : 'bg-white border-slate-200 text-slate-500'}`}>
                    {s === 'Day' ? <Sun size={17} /> : <Moon size={17} />} {s} shift
                  </button>
                ))}
              </div>

              <div className="lg:flex-1 lg:min-w-[180px]">
                <div className="flex items-center justify-between gap-2 text-xs font-bold mb-1.5 whitespace-nowrap">
                  <span className="text-slate-500">{loading ? 'Loading…' : `${doneCount} of ${PEST_OUTLETS.length} outlets logged`}</span>
                  <span className={`flex items-center gap-1 ${saveState === 'error' ? 'text-rose-600' : saveState === 'saving' ? 'text-slate-400' : isSaved ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {saveState === 'saving' ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : saveState === 'error' ? 'Not saved' : isSaved ? <><CheckCircle2 size={12} /> Saved</> : 'New sheet'}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#6D2158] to-fuchsia-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 lg:flex">
                <button onClick={copyPrevious} disabled={loading} className="h-11 lg:px-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-black text-slate-700 flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"><Copy size={14} /> Copy last {shift.toLowerCase()} sheet</button>
                <button onClick={() => { setMode('daily'); setRDay(date); setRShift('Both'); setTab('reports'); }} className="h-11 lg:px-3 rounded-2xl bg-[#6D2158]/5 border border-[#6D2158]/20 text-xs font-black text-[#6D2158] flex items-center justify-center gap-1.5 active:scale-[0.98] whitespace-nowrap"><FileDown size={14} /> PDF of this day</button>
              </div>
            </section>

            {/* Filter + search */}
            <section className="flex flex-col sm:flex-row gap-2">
              <div className="grid grid-cols-3 p-1 rounded-2xl bg-white border border-slate-200 sm:w-72 shrink-0">
                {([['all', 'All', PEST_OUTLETS.length], ['pending', 'To do', PEST_OUTLETS.length - doneCount], ['done', 'Done', doneCount]] as const).map(([k, label, n]) => (
                  <button key={k} onClick={() => setFilter(k)} className={`py-2 rounded-xl text-xs font-black transition-all ${filter === k ? 'bg-[#6D2158] text-white' : 'text-slate-500'}`}>
                    {label} <span className="opacity-60">{n}</span>
                  </button>
                ))}
              </div>
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find outlet" className="w-full h-11 pl-10 pr-10 rounded-2xl bg-white border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear search"><X size={15} /></button>}
              </div>
            </section>

            {/* Desktop: the worksheet as a table */}
            <section className="hidden lg:block bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div> : (
              <div className="max-h-[calc(100vh-300px)] min-h-[420px] overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <th rowSpan={2} className="sticky left-0 bg-white text-left px-3 py-2 border-b border-slate-200 min-w-[230px]">Outlet</th>
                      <th colSpan={PEST_TARGETS.length} className="py-1.5 border-b border-l border-slate-100 text-[#6D2158]">Target pest</th>
                      <th colSpan={PEST_METHODS.length} className="py-1.5 border-b border-l border-slate-100 text-teal-700">Method</th>
                      <th rowSpan={2} className="px-2 py-2 border-b border-l border-slate-200 text-left min-w-[170px]">Chemical used</th>
                      <th rowSpan={2} className="px-2 py-2 border-b border-l border-slate-200 text-left min-w-[170px]">Remarks</th>
                    </tr>
                    <tr className="text-[10px] font-bold text-slate-500">
                      {PEST_TARGETS.map((p, i) => <th key={p} className={`w-11 px-0.5 py-1.5 border-b border-slate-200 ${i === 0 ? 'border-l border-slate-100' : ''}`} title={p}><span className="block text-base leading-none">{PEST_ICON[p]}</span><span className="block mt-0.5 leading-tight">{p === 'Mosquitoes' ? 'Mosq.' : p === 'Cockroach' ? 'Roach' : p}</span></th>)}
                      {PEST_METHODS.map((m, i) => <th key={m} className={`w-11 px-0.5 py-1.5 border-b border-slate-200 ${i === 0 ? 'border-l border-slate-100' : ''}`} title={m}><span className="block text-base leading-none">{METHOD_ICON[m]}</span><span className="block mt-0.5 leading-tight">{m === 'Bait Station' ? 'Bait' : m === 'Hand Spray' ? 'Spray' : m === 'Fumigation' ? 'Fumig.' : m}</span></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 && <tr><td colSpan={3 + PEST_TARGETS.length + PEST_METHODS.length} className="py-12 text-center text-sm font-bold text-slate-400">{filter === 'pending' ? 'All outlets logged 🎉' : 'No outlets match.'}</td></tr>}
                    {visible.map(outlet => {
                      const r = { ...emptyPestRow(), ...(sheet.rows[outlet] || {}) };
                      const done = pestRowHasData(r);
                      return (
                        <tr key={outlet} className={`group border-b border-slate-100 ${done ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}`}>
                          <td className={`sticky left-0 px-3 py-1.5 ${done ? 'bg-emerald-50' : 'bg-white group-hover:bg-slate-50'}`}>
                            <button onClick={() => openEditor(outlet)} className="flex items-center gap-2 text-left w-full" title="Open the full form">
                              <span className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-black ${done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{done ? <Check size={13} strokeWidth={3} /> : PEST_OUTLETS.indexOf(outlet) + 1}</span>
                              <span className="text-[13px] font-bold text-slate-800 leading-snug">{outlet}</span>
                            </button>
                          </td>
                          {PEST_TARGETS.map((p, i) => <td key={p} className={`py-1 ${i === 0 ? 'border-l border-slate-100' : ''}`}><TickBox on={r.pests.includes(p)} onClick={() => updateRow(outlet, { pests: toggle(r.pests, p) })} tone="bg-[#6D2158] border-[#6D2158]" label={`${outlet}: ${p}`} /></td>)}
                          {PEST_METHODS.map((m, i) => <td key={m} className={`py-1 ${i === 0 ? 'border-l border-slate-100' : ''}`}><TickBox on={r.methods.includes(m)} onClick={() => updateRow(outlet, { methods: toggle(r.methods, m) })} tone="bg-teal-600 border-teal-600" label={`${outlet}: ${m}`} /></td>)}
                          {(['chemical', 'remarks'] as const).map(k => (
                            <td key={k} className="px-1.5 py-1 border-l border-slate-100">
                              <input key={`${date}|${shift}|${outlet}|${r[k]}`} defaultValue={r[k]} list={k === 'chemical' ? 'pest-chemicals' : undefined}
                                onBlur={e => { const v = e.target.value.trim(); if (v !== r[k]) updateRow(outlet, { [k]: v }); }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.target as HTMLInputElement).value = r[k]; (e.target as HTMLInputElement).blur(); } }}
                                placeholder={k === 'chemical' ? 'e.g. Cytrol 100 ml' : '—'}
                                className="w-full h-8 px-2 rounded-lg bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-[#6D2158] text-[13px] font-semibold text-slate-700 outline-none" />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="pest-chemicals">{chemicals.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              )}
            </section>

            {/* Phone: outlet cards */}
            <section className="space-y-2 lg:hidden">
              {loading ? (
                <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>
              ) : visible.length === 0 ? (
                <p className="py-12 text-center text-sm font-bold text-slate-400">{filter === 'pending' ? 'All outlets logged 🎉' : 'No outlets match.'}</p>
              ) : visible.map(outlet => {
                const r = sheet.rows[outlet];
                const done = pestRowHasData(r);
                const name = outlet.trim();
                return (
                  <button key={outlet} onClick={() => openEditor(outlet)} className={`w-full text-left rounded-2xl border p-3.5 flex items-center gap-3 transition-all active:scale-[0.99] ${done ? 'bg-white border-emerald-200 shadow-sm' : 'bg-white border-slate-200'}`}>
                    <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-xs font-black ${done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {done ? <CheckCircle2 size={18} /> : PEST_OUTLETS.indexOf(outlet) + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-slate-800 truncate">{name}</span>
                      </span>
                      {done ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {r!.pests.map(p => <span key={p} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#6D2158]/10 text-[#6D2158]">{PEST_ICON[p]} {p}</span>)}
                          {r!.methods.map(m => <span key={m} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700">{m}</span>)}
                          {r!.chemical && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 truncate max-w-[160px]">{r!.chemical}</span>}
                        </span>
                      ) : <span className="block text-[11px] font-semibold text-slate-400 mt-0.5">Tap to log</span>}
                    </span>
                    <ChevronRight size={18} className="text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </section>

            {!loading && signoff}
          </div>
        ) : (
          /* ============================ REPORTS ============================ */
          <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-5 lg:items-start lg:max-w-5xl">
            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Report period</p>
                <div className="grid grid-cols-3 gap-2">
                  {([['daily', 'Daily', CalendarDays], ['monthly', 'Monthly', Calendar], ['range', 'Date range', CalendarRange]] as const).map(([k, label, Icon]) => (
                    <button key={k} onClick={() => setMode(k)} className={`h-16 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 text-xs font-black transition-all active:scale-[0.98] ${mode === k ? 'bg-[#6D2158]/5 border-[#6D2158] text-[#6D2158]' : 'bg-white border-slate-200 text-slate-500'}`}>
                      <Icon size={18} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'daily' && (
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Date</span>
                  <input type="date" value={rDay} max={today} onChange={e => e.target.value && setRDay(e.target.value)} className="mt-1 w-full h-12 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                </label>
              )}
              {mode === 'monthly' && (
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Month</span>
                  <input type="month" value={rMonth} max={today.slice(0, 7)} onChange={e => e.target.value && setRMonth(e.target.value)} className="mt-1 w-full h-12 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                </label>
              )}
              {mode === 'range' && (
                <div className="grid grid-cols-2 gap-2">
                  {([['From', rFrom, setRFrom], ['To', rTo, setRTo]] as const).map(([label, val, set]) => (
                    <label key={label} className="block">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</span>
                      <input type="date" value={val} max={today} onChange={e => e.target.value && set(e.target.value)} className="mt-1 w-full h-12 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                    </label>
                  ))}
                </div>
              )}

              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Shift</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['Both', 'Day', 'Night'] as const).map(s => (
                    <button key={s} onClick={() => setRShift(s)} className={`h-11 rounded-2xl border-2 text-xs font-black flex items-center justify-center gap-1.5 ${rShift === s ? 'bg-[#6D2158] border-[#6D2158] text-white' : 'bg-white border-slate-200 text-slate-500'}`}>
                      {s === 'Day' ? <Sun size={14} /> : s === 'Night' ? <Moon size={14} /> : null} {s === 'Both' ? 'Day + Night' : s}
                    </button>
                  ))}
                </div>
              </div>

              {mode !== 'daily' && (
                <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <span>
                    <span className="block text-sm font-black text-slate-700">Summary page first</span>
                    <span className="block text-[11px] font-semibold text-slate-400">Visits per outlet, pests, methods &amp; chemicals for the period</span>
                  </span>
                  <input type="checkbox" checked={withSummary} onChange={e => setWithSummary(e.target.checked)} className="w-5 h-5 accent-[#6D2158] shrink-0" />
                </label>
              )}
            </section>

            <div className="space-y-4">
            {/* What will be in the PDF */}
            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-black text-slate-800">{range.label}</p>
                  <p className="text-[11px] font-bold text-slate-400">
                    {found === null ? 'Checking saved sheets…'
                      : found.length === 0 ? (mode === 'daily' ? 'Nothing saved — PDF will be a blank form' : 'No saved sheets in this period')
                      : (() => { const days = new Set(found.map(f => f.date)).size; return `${found.length} sheet${found.length > 1 ? 's' : ''} → ${days} page${days > 1 ? 's' : ''} (Day & Night of a date share one page)${mode !== 'daily' && withSummary ? ' + summary page' : ''}`; })()}
                  </p>
                </div>
                {found === null && <Loader2 size={16} className="animate-spin text-slate-400" />}
              </div>

              {found && found.length > 0 && (
                <div className="space-y-1.5 max-h-72 lg:max-h-[50vh] overflow-y-auto -mx-1 px-1">
                  {found.map(s => {
                    const n = PEST_OUTLETS.filter(o => pestRowHasData(s.rows[o])).length;
                    return (
                      <button key={`${s.date}-${s.shift}`} onClick={() => openSheetFromReport(s)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50 border border-slate-100 text-left active:scale-[0.99]">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${s.shift === 'Day' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>{s.shift === 'Day' ? <Sun size={14} /> : <Moon size={14} />}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-black text-slate-700">{nice(s.date)} · {s.shift}</span>
                          <span className="block text-[11px] font-bold text-slate-400">{n}/{PEST_OUTLETS.length} outlets{s.technician.name ? ` · ${s.technician.name}` : ''}</span>
                        </span>
                        <ChevronRight size={16} className="text-slate-300" />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Actions */}
            <section className="grid gap-2">
              <button onClick={() => runPdf('download')} disabled={!!busy || found === null} className="h-14 rounded-2xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-[#6D2158]/20 disabled:opacity-50 active:scale-[0.99]">
                {busy === 'download' ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />} Download PDF
              </button>
              <div className={`grid ${canShareFiles ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                <button onClick={() => runPdf('preview')} disabled={!!busy || found === null} className="h-12 rounded-2xl bg-white border border-slate-200 text-slate-700 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy === 'preview' ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />} Preview
                </button>
                {canShareFiles && (
                  <button onClick={() => runPdf('share')} disabled={!!busy || found === null} className="h-12 rounded-2xl bg-white border border-slate-200 text-slate-700 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50">
                    {busy === 'share' ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />} Share
                  </button>
                )}
              </div>
            </section>
            </div>
          </div>
        )}
      </div>

      {/* ===================== OUTLET EDITOR (bottom sheet) ===================== */}
      {editing && (
        <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => commitDraft(null)} />
          <div className="relative w-full md:max-w-lg bg-white rounded-t-[28px] md:rounded-[28px] shadow-2xl max-h-[92vh] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="pt-2 pb-1 flex justify-center md:hidden"><span className="w-10 h-1.5 rounded-full bg-slate-200" /></div>
            <div className="px-5 pt-2 pb-3 flex items-start gap-3 border-b border-slate-100">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Outlet {editingIdx + 1} of {PEST_OUTLETS.length} · {shift}</p>
                <h3 className="text-lg font-black text-slate-800 leading-snug">{editing.trim()}</h3>
              </div>
              <button onClick={() => commitDraft(null)} className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0" aria-label="Close"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Target pest</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PEST_TARGETS.map(p => (
                    <Chip key={p} on={draft.pests.includes(p)} onClick={() => setDraft(d => ({ ...d, pests: toggle(d.pests, p) }))}>
                      <span className="text-base leading-none">{PEST_ICON[p]}</span> {p}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Method of application</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PEST_METHODS.map(m => (
                    <Chip key={m} tone="teal" on={draft.methods.includes(m)} onClick={() => setDraft(d => ({ ...d, methods: toggle(d.methods, m) }))}>
                      <span className="text-base leading-none">{METHOD_ICON[m]}</span> {m}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Chemical used</p>
                <input value={draft.chemical} onChange={e => setDraft(d => ({ ...d, chemical: e.target.value }))} placeholder="Type or pick below" className="w-full h-12 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chemicals.map(c => {
                    const on = draft.chemical.split(',').map(x => x.trim()).filter(Boolean).includes(c);
                    return (
                      <button key={c} type="button" onClick={() => setDraft(d => {
                        const cur = d.chemical.split(',').map(x => x.trim()).filter(Boolean);
                        return { ...d, chemical: (cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]).join(', ') };
                      })} className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${on ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                        {on ? '✓ ' : '+ '}{c}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Remarks</p>
                <textarea rows={2} value={draft.remarks} onChange={e => setDraft(d => ({ ...d, remarks: e.target.value }))} placeholder="Activity seen, follow-up needed…" className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold outline-none focus:border-[#6D2158] resize-none" />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 grid grid-cols-[auto_auto_1fr] gap-2">
              <button onClick={() => setDraft(emptyPestRow())} className="h-12 px-3 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center gap-1 text-xs font-black" title="Clear this outlet" aria-label="Clear this outlet"><Eraser size={15} /></button>
              <button onClick={() => prevOutlet && commitDraft(prevOutlet)} disabled={!prevOutlet} className="h-12 px-3 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center disabled:opacity-30" aria-label="Previous outlet"><ChevronLeft size={18} /></button>
              <button onClick={() => commitDraft(nextOutlet || null)} className="h-12 rounded-2xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-1.5 active:scale-[0.99]">
                {nextOutlet ? <>Save &amp; next <ChevronRight size={17} /></> : <>Save &amp; finish <CheckCircle2 size={17} /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PestControlPage() {
  return (
    <AdminOnly what="Pest Control" allow={canUsePestControl} audience="admins, the Pest Control account and the garden team">
      <PestControlApp />
    </AdminOnly>
  );
}

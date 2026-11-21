"use client";
// Pest Control → Fumigation: log villas fumigated (date & time filled in, remarks), see where every villa
// stands (days since the last fumigation), monthly stats, villa history, and download reports (PDF / Excel).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Wind, Clock, Check, FileDown, FileSpreadsheet, Upload, X, Trash2, CalendarDays, Calendar, CalendarRange, History, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { getDhakaDateStr } from '@/lib/dateUtils';
import {
  TOTAL_VILLAS, DUE_DAYS, FUMIGATION_REMARKS, BAND_LABEL, band, daysBetween, lastByVilla, parseVillaList, parseTrackerRows,
  loadFumigations, addFumigations, deleteFumigation, type FumigationEntry,
} from '@/lib/fumigation';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dm = (iso: string) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;
const dmy = (iso: string) => `${dm(iso)} ${iso.slice(0, 4)}`;
const nowHHMM = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const sessionName = () => { try { return JSON.parse(localStorage.getItem('hk_pulse_session') || '{}').full_name || ''; } catch { return ''; } };

const BAND_STYLE = {
  fresh: 'bg-emerald-500 text-white border-emerald-500',
  ok: 'bg-lime-200 text-lime-900 border-lime-300',
  soon: 'bg-amber-300 text-amber-950 border-amber-400',
  due: 'bg-rose-500 text-white border-rose-500',
  never: 'bg-slate-100 text-slate-400 border-slate-200',
} as const;

export default function FumigationTab() {
  const { confirmAction } = useConfirm();
  const today = getDhakaDateStr();
  const [entries, setEntries] = useState<FumigationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // log form
  const [villaText, setVillaText] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(nowHHMM());
  const [timeTouched, setTimeTouched] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  // view
  const [year, setYear] = useState(today.slice(0, 4));
  const [openVilla, setOpenVilla] = useState<string | null>(null);

  // report
  const [mode, setMode] = useState<'month' | 'year' | 'range'>('month');
  const [rMonth, setRMonth] = useState(today.slice(0, 7));
  const [rYear, setRYear] = useState(today.slice(0, 4));
  const [rFrom, setRFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [rTo, setRTo] = useState(today);
  const [busy, setBusy] = useState<'' | 'pdf' | 'xlsx' | 'import'>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setEntries(await loadFumigations()); } catch (e) { toast.error('Could not load fumigations: ' + ((e as Error)?.message || e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let alive = true;
    loadFumigations().then(list => { if (alive) setEntries(list); })
      .catch(e => toast.error('Could not load fumigations: ' + ((e as Error)?.message || e)))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Time follows the clock until someone changes it
  useEffect(() => {
    if (timeTouched) return;
    const t = setInterval(() => setTime(nowHHMM()), 30_000);
    return () => clearInterval(t);
  }, [timeTouched]);

  const parsed = parseVillaList(villaText);
  const last = useMemo(() => lastByVilla(entries, today), [entries, today]);
  const recentRepeat = parsed.villas.filter(v => { const l = last.get(v); return l && daysBetween(l.date, date) >= 0 && daysBetween(l.date, date) < 7; });

  const save = async () => {
    if (!parsed.villas.length) { toast.error('Enter the villa number'); return; }
    if (parsed.bad.length) { toast.error(`Not a villa: ${parsed.bad.join(', ')}`); return; }
    setSaving(true);
    try {
      const by = sessionName();
      const at = new Date().toISOString();
      const list = parsed.villas.map(v => ({ villa: v, date, time, remarks: remarks.trim(), by, at, source: 'app' as const }));
      await addFumigations(list);
      toast.success(`Logged ${list.map(e => `V${e.villa}`).join(', ')} · ${dm(date)} ${time}`);
      setVillaText(''); setRemarks(''); setDate(today); setTimeTouched(false); setTime(nowHHMM());
      load();
    } catch (e) { toast.error('Not saved: ' + ((e as Error)?.message || e)); }
    setSaving(false);
  };

  const remove = async (e: FumigationEntry) => {
    if (!e.id) return;
    if (!(await confirmAction({ title: 'Delete this fumigation?', message: `V${e.villa} · ${dmy(e.date)}${e.time ? ` ${e.time}` : ''}`, confirmText: 'Delete', isDestructive: true, icon: 'warning' }))) return;
    try { await deleteFumigation(e.id); setEntries(p => p.filter(x => x.id !== e.id)); toast.success('Deleted'); }
    catch (err) { toast.error('Not deleted: ' + ((err as Error)?.message || err)); }
  };

  // ---- stats ----
  const yearEntries = entries.filter(e => e.date.startsWith(year));
  const thisMonth = entries.filter(e => e.date.startsWith(today.slice(0, 7)));
  const villasThisMonth = new Set(thisMonth.map(e => e.villa)).size;
  const villas = Array.from({ length: TOTAL_VILLAS }, (_, i) => String(i + 1));
  const bands = villas.map(v => { const l = last.get(v); return band(l ? daysBetween(l.date, today) : null); });
  const dueCount = bands.filter(b => b === 'due' || b === 'never').length;
  const perMonth = MON.map((_, i) => yearEntries.filter(e => +e.date.slice(5, 7) === i + 1).length);
  const maxMonth = Math.max(1, ...perMonth);
  const years = Array.from(new Set([today.slice(0, 4), ...entries.map(e => e.date.slice(0, 4))])).sort().reverse();

  // ---- report ----
  const range = mode === 'month' ? { from: `${rMonth}-01`, to: monthEnd(rMonth), label: `${MONTHS_LONG[+rMonth.slice(5) - 1]} ${rMonth.slice(0, 4)}`, file: rMonth }
    : mode === 'year' ? { from: `${rYear}-01-01`, to: `${rYear}-12-31`, label: `Year ${rYear}`, file: rYear }
    : (() => { const [a, b] = rFrom <= rTo ? [rFrom, rTo] : [rTo, rFrom]; return { from: a, to: b, label: `${dmy(a)} – ${dmy(b)}`, file: `${a}_to_${b}` }; })();
  const inRange = entries.filter(e => e.date >= range.from && e.date <= range.to).length;

  const download = async (kind: 'pdf' | 'xlsx') => {
    setBusy(kind);
    try {
      const { buildFumigationPdf, buildFumigationXlsx } = await import('@/lib/fumigationReport');
      const opts = { ...range, asOf: today };
      const name = `Villa_Fumigation_${range.file}`;
      if (kind === 'pdf') buildFumigationPdf(entries, opts).save(`${name}.pdf`);
      else {
        const url = URL.createObjectURL(await buildFumigationXlsx(entries, opts));
        const a = document.createElement('a'); a.href = url; a.download = `${name}.xlsx`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (e) { toast.error('Report failed: ' + ((e as Error)?.message || e)); }
    setBusy('');
  };

  // ---- import the Excel tracker ----
  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy('import');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }) as string[][];
      const { entries: found, year: y } = parseTrackerRows(rows);
      const have = new Set(entries.map(e => `${e.villa}|${e.date}`));
      const fresh = found.filter(e => !have.has(`${e.villa}|${e.date}`));
      if (!fresh.length) { toast(`Nothing new: all ${found.length} visits are already logged`); return; }
      const ok = await confirmAction({
        title: `Import ${fresh.length} fumigations?`,
        message: `${file.name} (${y}): ${found.length} visits found, ${found.length - fresh.length} already logged and skipped. Imported visits have no time.`,
        confirmText: `Import ${fresh.length}`,
      });
      if (!ok) return;
      const by = sessionName(); const at = new Date().toISOString();
      await addFumigations(fresh.map(e => ({ ...e, by, at })));
      toast.success(`Imported ${fresh.length} fumigations`);
      load();
    } catch (e) { toast.error('Import failed: ' + ((e as Error)?.message || e)); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };

  const villaHistory = openVilla ? entries.filter(e => e.villa === openVilla) : [];
  const card = 'bg-white rounded-3xl border border-slate-200 shadow-sm p-4';
  const label = 'text-[11px] font-black uppercase tracking-wider text-slate-400';

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>;

  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-5 lg:items-start">
      {/* ===== Left: log + report ===== */}
      <div className="space-y-4 lg:sticky lg:top-[132px]">
        <section className={`${card} space-y-3`}>
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2"><Wind size={16} className="text-[#6D2158]" /> Log fumigation</h2>
          <div>
            <span className={label}>Villa no.</span>
            <input value={villaText} onChange={e => setVillaText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} inputMode="text" autoComplete="off"
              placeholder="e.g. 12  or  12, 14, 20-22"
              className="mt-1 w-full h-14 px-4 rounded-2xl bg-slate-50 border-2 border-slate-200 text-2xl font-black font-mono text-slate-800 outline-none focus:border-[#6D2158] focus:bg-white placeholder:text-sm placeholder:font-sans placeholder:font-semibold placeholder:text-slate-400" />
            {(parsed.villas.length > 0 || parsed.bad.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {parsed.villas.map(v => { const l = last.get(v); return (
                  <span key={v} className="text-[11px] font-black px-2 py-1 rounded-lg bg-[#6D2158]/10 text-[#6D2158]">V{v}<span className="font-bold text-slate-500"> · {l ? `last ${dm(l.date)}` : 'first time'}</span></span>
                ); })}
                {parsed.bad.map(b => <span key={b} className="text-[11px] font-black px-2 py-1 rounded-lg bg-rose-50 text-rose-600">{b}?</span>)}
              </div>
            )}
            {recentRepeat.length > 0 && <p className="mt-2 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />Done in the last 7 days: {recentRepeat.map(v => `V${v} (${dm(last.get(v)!.date)})`).join(', ')}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label><span className={`${label} flex items-center h-4`}>Date</span>
              <input type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
            </label>
            <label><span className={`${label} flex items-center justify-between h-4`}>Time {timeTouched && <button type="button" onClick={() => { setTimeTouched(false); setTime(nowHHMM()); }} className="normal-case tracking-normal text-[#6D2158]">now</button>}</span>
              <input type="time" value={time} onChange={e => { setTime(e.target.value); setTimeTouched(true); }} className="mt-1 w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" />
            </label>
          </div>
          <div>
            <span className={label}>Remarks</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {FUMIGATION_REMARKS.map(r => {
                const on = remarks.split(/\s*,\s*/).includes(r);
                return <button key={r} type="button" onClick={() => setRemarks(p => { const cur = p.split(/\s*,\s*/).filter(Boolean); return (on ? cur.filter(x => x !== r) : [...cur, r]).join(', '); })}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold ${on ? 'bg-[#6D2158] border-[#6D2158] text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{on && '✓ '}{r}</button>;
              })}
            </div>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} placeholder="Anything else (optional)" className="mt-2 w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold outline-none focus:border-[#6D2158] resize-none" />
          </div>
          <button onClick={save} disabled={saving || !parsed.villas.length} className="w-full h-12 rounded-2xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
            {parsed.villas.length > 1 ? `Log ${parsed.villas.length} villas` : 'Log fumigation'}
          </button>
        </section>

        <section className={`${card} space-y-3`}>
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2"><FileDown size={16} className="text-[#6D2158]" /> Report</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {([['month', 'Monthly', CalendarDays], ['year', 'Yearly', Calendar], ['range', 'Period', CalendarRange]] as const).map(([k, l, Icon]) => (
              <button key={k} onClick={() => setMode(k)} className={`h-12 rounded-xl border-2 text-[11px] font-black flex flex-col items-center justify-center gap-0.5 ${mode === k ? 'bg-[#6D2158]/5 border-[#6D2158] text-[#6D2158]' : 'bg-white border-slate-200 text-slate-500'}`}><Icon size={15} />{l}</button>
            ))}
          </div>
          {mode === 'month' && <input type="month" value={rMonth} max={today.slice(0, 7)} onChange={e => e.target.value && setRMonth(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none" />}
          {mode === 'year' && <select value={rYear} onChange={e => setRYear(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none">{years.map(y => <option key={y}>{y}</option>)}</select>}
          {mode === 'range' && (
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={rFrom} max={today} onChange={e => e.target.value && setRFrom(e.target.value)} className="h-11 px-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none" />
              <input type="date" value={rTo} max={today} onChange={e => e.target.value && setRTo(e.target.value)} className="h-11 px-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none" />
            </div>
          )}
          <p className="text-[11px] font-bold text-slate-400">{range.label} · {inRange} fumigation{inRange === 1 ? '' : 's'}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => download('pdf')} disabled={!!busy} className="h-11 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50">{busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} PDF</button>
            <button onClick={() => download('xlsx')} disabled={!!busy} className="h-11 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50">{busy === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel</button>
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="w-full h-10 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-[11px] font-black text-slate-500 flex items-center justify-center gap-1.5">
            {busy === 'import' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Import the Excel tracker
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => importFile(e.target.files?.[0])} />
        </section>
      </div>

      {/* ===== Right: stats, villas, months, recent ===== */}
      <div className="space-y-4 min-w-0">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            ['This month', String(thisMonth.length), `${villasThisMonth} villas`],
            [`Year ${year}`, String(yearEntries.length), `${new Set(yearEntries.map(e => e.villa)).size} / ${TOTAL_VILLAS} villas`],
            [`Due (> ${DUE_DAYS} d)`, String(dueCount), 'or no record'],
            ['Done ≤ 30 days', String(bands.filter(b => b === 'fresh').length), `of ${TOTAL_VILLAS} villas`],
          ] as const).map(([k, v, sub], i) => (
            <div key={k} className={`${card} !p-3`}>
              <p className={label}>{k}</p>
              <p className={`text-2xl font-black ${i === 2 && dueCount ? 'text-rose-600' : 'text-slate-800'}`}>{v}</p>
              <p className="text-[11px] font-bold text-slate-400">{sub}</p>
            </div>
          ))}
        </section>

        <section className={card}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-black text-slate-800">Villas · days since last fumigation</h2>
          </div>
          <div className="grid grid-cols-8 sm:grid-cols-10 lg:grid-cols-12 xl:grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5">
            {villas.map((v, i) => {
              const l = last.get(v);
              const d = l ? daysBetween(l.date, today) : null;
              return (
                <button key={v} onClick={() => setOpenVilla(v)} title={l ? `V${v} · last ${dmy(l.date)} (${d} days)` : `V${v} · no record`}
                  className={`aspect-square rounded-xl border flex flex-col items-center justify-center leading-none hover:ring-2 hover:ring-[#6D2158]/40 ${BAND_STYLE[bands[i]]}`}>
                  <span className="text-sm font-black">{v}</span>
                  <span className="text-[9px] font-bold opacity-80 mt-0.5">{d === null ? '—' : `${d}d`}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {(Object.keys(BAND_LABEL) as (keyof typeof BAND_LABEL)[]).map(b => (
              <span key={b} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><span className={`w-3 h-3 rounded border ${BAND_STYLE[b]}`} />{BAND_LABEL[b]} <span className="text-slate-400">({bands.filter(x => x === b).length})</span></span>
            ))}
          </div>
        </section>

        <section className={card}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-black text-slate-800">Fumigations per month</h2>
            <select value={year} onChange={e => setYear(e.target.value)} className="h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold outline-none">{years.map(y => <option key={y}>{y}</option>)}</select>
          </div>
          <div className="flex items-end gap-1.5 h-40">
            {perMonth.map((n, i) => {
              const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
              const vs = new Set(yearEntries.filter(e => e.date.startsWith(ym)).map(e => e.villa)).size;
              return (
                <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-1" title={`${MONTHS_LONG[i]}: ${n} fumigations, ${vs} villas`}>
                  <span className="text-[10px] font-black text-slate-600">{n || ''}</span>
                  <div className={`w-full rounded-t-lg ${ym === today.slice(0, 7) ? 'bg-[#6D2158]' : 'bg-[#6D2158]/35'}`} style={{ height: `${(n / maxMonth) * 100}%`, minHeight: n ? 4 : 0 }} />
                  <span className="text-[10px] font-bold text-slate-400">{MON[i]}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2"><History size={15} className="text-[#6D2158]" /> Recent</h2>
          {entries.length === 0 ? <p className="py-6 text-center text-sm font-bold text-slate-400">Nothing logged yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {entries.slice(0, 15).map(e => (
                <li key={e.id} className="py-2 flex items-center gap-3">
                  <button onClick={() => setOpenVilla(e.villa)} className="w-11 h-9 rounded-xl bg-[#6D2158]/10 text-[#6D2158] text-sm font-black shrink-0">V{e.villa}</button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">{dmy(e.date)}{e.time && <span className="text-slate-400"> · {e.time}</span>}</p>
                    <p className="text-[11px] font-semibold text-slate-400 truncate">{[e.remarks, e.source === 'import' ? 'imported' : e.by].filter(Boolean).join(' · ')}</p>
                  </div>
                  <button onClick={() => remove(e)} className="w-8 h-8 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0" aria-label="Delete"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ===== Villa history ===== */}
      {openVilla && (
        <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center" onClick={() => setOpenVilla(null)}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <div className="relative w-full md:max-w-md bg-white rounded-t-[28px] md:rounded-[28px] shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
              <div className="flex-1">
                <h3 className="text-lg font-black text-slate-800">Villa {openVilla}</h3>
                <p className="text-xs font-bold text-slate-400">
                  {villaHistory.length} fumigation{villaHistory.length === 1 ? '' : 's'}{last.get(openVilla) ? ` · last ${dmy(last.get(openVilla)!.date)} (${daysBetween(last.get(openVilla)!.date, today)} days ago)` : ' · no record'}
                </p>
              </div>
              <button onClick={() => { setVillaText(openVilla); setOpenVilla(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="h-9 px-3 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center gap-1"><Wind size={13} /> Log</button>
              <button onClick={() => setOpenVilla(null)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Close"><X size={17} /></button>
            </div>
            <ul className="overflow-y-auto px-5 py-2 divide-y divide-slate-100">
              {villaHistory.length === 0 && <li className="py-8 text-center text-sm font-bold text-slate-400">No fumigation logged.</li>}
              {villaHistory.map((e, i) => {
                const gap = villaHistory[i + 1] ? daysBetween(villaHistory[i + 1].date, e.date) : null;
                return (
                  <li key={e.id} className="py-2.5 flex items-center gap-3">
                    <Clock size={14} className="text-slate-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{dmy(e.date)}{e.time && <span className="text-slate-400"> · {e.time}</span>}{gap !== null && <span className="ml-1.5 text-[10px] font-black text-slate-400">+{gap}d</span>}</p>
                      <p className="text-[11px] font-semibold text-slate-400 truncate">{[e.remarks, e.source === 'import' ? 'imported' : e.by].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <button onClick={() => remove(e)} className="w-8 h-8 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center" aria-label="Delete"><Trash2 size={14} /></button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

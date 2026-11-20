"use client";
// Daily milk: paste the jetties' WhatsApp message, check it against who is in house, save it for the day.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Milk, X, AlertTriangle, Check, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { pantryShort } from '@/lib/pantrySupply';
import { searchStays, type Stay } from '@/lib/guestHistory';
import { parseMilkMessage, loadMilkList, saveMilkList, groupByPantry, type MilkList } from '@/lib/milkRequests';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso: string) => (iso ? `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}` : '');

export default function MilkPanel({ today, onClose, onSaved }: { today: string; onClose: () => void; onSaved: (l: MilkList | null) => void }) {
  const [date, setDate] = useState(today);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<MilkList | null>(null);
  const [inHouse, setInHouse] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([loadMilkList(date), searchStays('', date)]).then(([l, stays]) => {
      if (!alive) return;
      setSaved(l); setText(l?.raw || '');
      setInHouse(stays.filter(s => s.arr <= date && (s.dep || s.lastSeen) >= date));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [date]);

  const parsed = useMemo(() => parseMilkMessage(text, date), [text, date]);
  const stayOf = (villa: string) => inHouse.find(s => s.days.some(d => d.report_date <= date && d.villa_number === villa) && s.villas[s.villas.length - 1] === villa) || inHouse.find(s => s.villas.includes(villa));
  const groups = useMemo(() => groupByPantry(parsed.entries), [parsed]);
  const dupes = parsed.entries.filter((e, i) => parsed.entries.findIndex(x => x.villa === e.villa) !== i).map(e => e.villa);

  const save = async () => {
    setSaving(true);
    try {
      const s = JSON.parse(localStorage.getItem('hk_pulse_session') || 'null');
      const list: MilkList = { date, entries: parsed.entries, raw: text, saved_by: s?.full_name || '', saved_at: new Date().toISOString() };
      await saveMilkList(list);
      toast.success(parsed.entries.length ? `Milk for ${parsed.entries.length} villas saved (${short(date)})` : `Milk list for ${short(date)} cleared`);
      onSaved(date === today ? (parsed.entries.length ? list : null) : null);
      onClose();
    } catch (e) {
      toast.error('Could not save: ' + ((e as Error)?.message || 'error'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full md:max-w-3xl bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center"><Milk size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-800">Daily milk</p>
            <p className="text-xs font-semibold text-slate-400">Paste the jetties&apos; message · the date in brackets is check-out</p>
          </div>
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="h-10 px-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold" aria-label="Date" />
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto grid md:grid-cols-2 gap-4 p-5">
          <div>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'Jetty - A\n# 02 Full cream milk ( 24/11 )\n# 07 Skimmed milk ( 21/11 )\n\nJetty - B\n# 38 Skim milk & Coconut milk ( 23/11) - Every 2 days'}
              className="w-full h-64 md:h-[420px] p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-mono outline-none focus:border-[#6D2158] resize-none" />
            {saved && <p className="mt-1.5 text-[11px] font-semibold text-slate-400">Saved {saved.saved_by ? `by ${saved.saved_by}` : ''}{saved.saved_at ? ` at ${new Date(saved.saved_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}. Saving again replaces the {short(date)} list.</p>}
          </div>

          <div className="space-y-3">
            {loading ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>
              : !parsed.entries.length && !parsed.skipped.length ? <p className="py-16 text-center text-sm font-semibold text-slate-400">Paste the message on the left to check it.</p>
              : (
                <>
                  {Object.entries(groups).map(([pantry, list]) => (
                    <div key={pantry} className="rounded-2xl border border-slate-200">
                      <p className="px-3 py-2 border-b border-slate-100 text-xs font-black text-slate-500 uppercase tracking-wide">{pantryShort(pantry)} · {list.length}</p>
                      <div className="divide-y divide-slate-100">
                        {list.map(e => {
                          const st = stayOf(e.villa);
                          const depDiff = st && st.dep && st.dep !== e.until;
                          return (
                            <div key={e.villa + e.line} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="w-10 text-sm font-black text-slate-800">V{e.villa}</span>
                                <span className="flex-1 min-w-0 text-sm font-bold text-slate-700 truncate">{e.items.join(' + ')}</span>
                                <span className="text-xs font-bold text-slate-500 shrink-0">till {short(e.until)}</span>
                              </div>
                              <div className="pl-12 flex flex-wrap gap-x-2 text-[11px] font-semibold">
                                {e.note && <span className="text-sky-700">{e.note}</span>}
                                {st ? <span className="text-slate-400 truncate">{st.name.split('&')[0].trim()}</span> : <span className="text-rose-600 flex items-center gap-1"><AlertTriangle size={11} /> No guest in house</span>}
                                {depDiff && <span className="text-amber-700 flex items-center gap-1"><AlertTriangle size={11} /> Guest list check-out {short(st!.dep)}</span>}
                                {dupes.includes(e.villa) && <span className="text-amber-700">listed twice</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {parsed.skipped.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-black text-amber-800 mb-1">Not understood (not saved): {parsed.skipped.length}</p>
                      {parsed.skipped.map(l => <p key={l} className="text-xs font-mono text-amber-900 truncate">{l}</p>)}
                      <p className="mt-1 text-[11px] font-semibold text-amber-700">Write it like “# 12 Skimmed milk ( 24/11 )”.</p>
                    </div>
                  )}
                </>
              )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3">
          <p className="flex-1 text-xs font-bold text-slate-500">{parsed.entries.length} villa{parsed.entries.length === 1 ? '' : 's'} for {short(date)}</p>
          <button onClick={save} disabled={saving || loading || (!parsed.entries.length && !saved)} className="h-11 px-5 rounded-xl bg-[#6D2158] text-white text-sm font-black flex items-center gap-2 disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : parsed.entries.length ? <Save size={16} /> : <Check size={16} />} {parsed.entries.length ? 'Save milk list' : 'Clear the day'}
          </button>
        </div>
      </div>
    </div>
  );
}

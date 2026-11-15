"use client";
import React, { useMemo, useState } from 'react';
import { Loader2, Minus, Plus, Search, X } from 'lucide-react';
import { itemName, type MinibarItem } from '@/lib/minibarLedgerData';

// Item list with a qty per item — used for counts, stock in, transfers, removals and office checks.
export default function QtyEditor({
  title, subtitle, items, initial, hint, header, presets, saveLabel, onSave, onClose, allowZeroSave = false, onlyListed = false,
}: {
  title: string;
  subtitle?: string;
  items: MinibarItem[];
  initial: Record<string, number>;
  hint?: (article: string) => string; // small text under the item, e.g. "now 2 · par 2"
  header?: React.ReactNode;
  presets?: { label: string; values: Record<string, number> }[];
  saveLabel: string;
  onSave: (qty: Record<string, number>) => Promise<boolean | void>;
  onClose: () => void;
  allowZeroSave?: boolean; // counts save every item, zeros included
  onlyListed?: boolean; // show only items that are in `initial`
}) {
  const [qty, setQty] = useState<Record<string, number>>(initial);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter(i => (!onlyListed || i.article_number in initial) && (!s || `${i.article_name} ${i.generic_name} ${i.category}`.toLowerCase().includes(s)));
  }, [items, q, onlyListed, initial]);
  const total = Object.values(qty).reduce((a, b) => a + (b || 0), 0);
  const set = (a: string, v: number) => setQty(prev => ({ ...prev, [a]: Math.max(0, Math.min(999, Math.round(v || 0))) }));

  const save = async () => {
    if (!allowZeroSave && total === 0) return;
    setSaving(true);
    const ok = await onSave(qty);
    setSaving(false);
    if (ok !== false) onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full md:max-w-2xl h-[92dvh] md:h-[86vh] rounded-t-3xl md:rounded-3xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-800">{title}</h3>
            {subtitle && <p className="text-[11px] font-semibold text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-slate-100 text-slate-500 shrink-0" aria-label="Close"><X size={16} /></button>
        </div>
        {header && <div className="px-4 pt-3 shrink-0">{header}</div>}
        <div className="px-4 pt-3 flex gap-2 shrink-0">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-sm font-bold outline-none focus:border-[#6D2158]" />
          </div>
          {presets?.map(p => (
            <button key={p.label} onClick={() => setQty({ ...p.values })} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold whitespace-nowrap hover:bg-slate-200">{p.label}</button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1.5">
          {shown.length === 0 && <p className="text-center text-xs font-bold text-slate-400 py-10">No items</p>}
          {shown.map(i => {
            const v = qty[i.article_number] || 0;
            return (
              <div key={i.article_number} className={`flex items-center gap-3 p-2 rounded-xl border ${v ? 'bg-[#6D2158]/[0.04] border-[#6D2158]/20' : 'bg-white border-slate-100'}`}>
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden">
                  {i.image_url ? <img src={i.image_url} alt="" className="w-full h-full object-contain" /> : <span className="text-[9px] font-black text-slate-300 uppercase">{(i.category || '').slice(0, 4)}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate">{itemName(i)}</p>
                  {hint && <p className="text-[10px] font-semibold text-slate-400">{hint(i.article_number)}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => set(i.article_number, v - 1)} className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600" aria-label="Less"><Minus size={14} /></button>
                  <input inputMode="numeric" value={v} onChange={e => set(i.article_number, parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
                    className="w-12 h-9 text-center font-mono font-black text-base bg-white border border-slate-200 rounded-lg outline-none focus:border-[#6D2158]" />
                  <button onClick={() => set(i.article_number, v + 1)} className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600" aria-label="More"><Plus size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t border-slate-200 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button onClick={save} disabled={saving || (!allowZeroSave && total === 0)}
            className="w-full py-3.5 rounded-2xl bg-[#6D2158] text-white text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />} {saveLabel} {total > 0 ? `(${total})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

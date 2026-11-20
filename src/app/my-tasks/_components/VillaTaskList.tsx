"use client";
// The villa's to-do list for today on My Tasks: requests, ice, milk, guest preferences. Tap to tick done.
import React from 'react';
import { Check, Milk, Snowflake, Sparkles, MessageSquare, Loader2 } from 'lucide-react';
import type { VaTask, VaTaskKind } from '@/lib/vaDailyTasks';

const META: Record<VaTaskKind, { icon: React.ElementType; label: string; tint: string }> = {
  request: { icon: MessageSquare, label: 'Request', tint: 'text-[#6D2158] bg-[#6D2158]/10' },
  ice: { icon: Snowflake, label: 'Ice', tint: 'text-cyan-700 bg-cyan-50' },
  milk: { icon: Milk, label: 'Milk', tint: 'text-sky-700 bg-sky-50' },
  pref: { icon: Sparkles, label: 'Preference', tint: 'text-amber-700 bg-amber-50' },
};
const hhmm = (ts?: string | null) => (ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

export default function VillaTaskList({ tasks, busyKey, onToggle }: { tasks: VaTask[]; busyKey: string; onToggle: (t: VaTask) => void }) {
  if (!tasks.length) return <p className="py-2 text-center text-[11px] font-bold text-slate-300">Nothing extra today</p>;
  return (
    <ul className="space-y-1.5">
      {tasks.map(t => {
        const m = META[t.kind];
        const busy = busyKey === `${t.villa}|${t.key}`;
        return (
          <li key={t.key}>
            <button onClick={() => onToggle(t)} disabled={busy}
              className={`w-full text-left flex items-start gap-2.5 rounded-xl border px-2.5 py-2 transition-colors active:scale-[0.99] ${t.done ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
              <span className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 ${t.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                {busy ? <Loader2 size={12} className="animate-spin text-slate-400" /> : t.done && <Check size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black ${m.tint}`}><m.icon size={10} /> {m.label}</span>
                  {t.time && <span className="text-[11px] font-black text-slate-700">{t.time}</span>}
                </span>
                <span className={`block mt-0.5 text-sm font-bold leading-snug whitespace-pre-line ${t.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{t.title}</span>
                {(t.detail || t.done) && (
                  <span className="block text-[11px] font-semibold text-slate-400">
                    {t.detail}{t.detail && t.done ? ' · ' : ''}{t.done ? `Done ${hhmm(t.doneAt)}${t.doneBy ? ` · ${t.doneBy.split(' ')[0]}` : ''}` : ''}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

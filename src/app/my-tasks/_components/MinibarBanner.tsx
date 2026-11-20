"use client";
// My Tasks: the month's minibar count in one place: progress and one button per villa.
import React from 'react';
import { Wine, Check, ChevronRight } from 'lucide-react';

type Task = { villa_number: string; status: string };

export default function MinibarBanner({ tasks, periodLabel, onStart }: { tasks: Task[]; periodLabel: string; onStart: (villa: string) => void }) {
  if (!tasks.length) return null;
  const done = tasks.filter(t => t.status === 'Submitted').length;
  const next = tasks.find(t => t.status !== 'Submitted');
  const allDone = done === tasks.length;
  return (
    <div className={`rounded-3xl border p-4 md:p-5 shadow-sm ${allDone ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-purple-200'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${allDone ? 'bg-emerald-500 text-white' : 'bg-[#6D2158] text-white'}`}>
          {allDone ? <Check size={22} /> : <Wine size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-slate-800">{periodLabel} minibar count</p>
          <p className="text-xs font-bold text-slate-500">{allDone ? 'All your minibars are counted. Thank you!' : `${done} of ${tasks.length} done · count every item in the minibar`}</p>
        </div>
        {next && (
          <button onClick={() => onStart(next.villa_number)} className="h-11 px-4 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center gap-1.5 shrink-0 active:scale-95">
            {done ? 'Next' : 'Start'} V{next.villa_number} <ChevronRight size={16} />
          </button>
        )}
      </div>
      <div className="h-2 rounded-full bg-slate-100 mt-3 overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / tasks.length) * 100}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {tasks.map(t => {
          const isDone = t.status === 'Submitted';
          return (
            <button key={t.villa_number} onClick={() => onStart(t.villa_number)}
              className={`h-10 min-w-[56px] px-3 rounded-xl text-sm font-black border flex items-center justify-center gap-1 active:scale-95 ${isDone ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-700 hover:border-[#6D2158]'}`}
              title={isDone ? 'Counted: tap to check or recount' : 'Not counted yet'}>
              {isDone && <Check size={13} />}{t.villa_number}
            </button>
          );
        })}
      </div>
    </div>
  );
}

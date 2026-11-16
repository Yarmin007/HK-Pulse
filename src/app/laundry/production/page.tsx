"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, WashingMachine, Sheet, Download, Copy, Check, X, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getDhakaDateStr } from "@/lib/dateUtils";
import { readSession, isAdminSession } from "@/lib/requestsShared";
import {
  CHEMICALS, MACHINES, PROGRAMMES, machineById, programmeFor, usageOf, addDose, emptyDose, fmtMl,
  minutesBetween, fmtDuration, hhmm, PRODUCTION_SQL, isOnLaundryDuty, type ProductionEntry, type Dose,
} from "@/lib/laundryProduction";

const BRAND = "#6D2158";
const TABLE = "laundry_production";

const shiftDay = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const dayLabel = (ymd: string, today: string) => {
  if (ymd === today) return "Today";
  if (ymd === shiftDay(today, -1)) return "Yesterday";
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};
const shortDay = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
const monthBounds = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
};
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const nowHHMM = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const isMissingTable = (err: { message?: string; code?: string } | null) =>
  !!err && (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST204" || err.code === "42703" || /relation .* does not exist|could not find the table|column .* (does not exist|not find)/i.test(err.message || ""));

export default function LaundryProductionPage() {
  const today = getDhakaDateStr();
  const [tab, setTab] = useState<"enter" | "sheet">("enter");
  const [missingTable, setMissingTable] = useState(false);
  const session = useMemo(() => readSession(), []);
  const me = session.full_name || "";
  const admin = isAdminSession(session);
  const onMissingTable = useCallback(() => setMissingTable(true), []);
  const [allowed, setAllowed] = useState<boolean | null>(admin ? true : null);
  useEffect(() => {
    if (admin) return;
    isOnLaundryDuty(session.id, today).then(setAllowed).catch(() => setAllowed(false));
  }, [admin, session.id, today]);

  // Phones open on Enter, computers on the Sheet
  useEffect(() => { if (window.matchMedia("(min-width: 1024px)").matches) setTab("sheet"); }, []);

  if (allowed === null) return <div className="p-16 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>;
  if (!allowed) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16 text-center">
        <WashingMachine size={40} className="mx-auto mb-3 text-slate-300" />
        <h1 className="text-lg font-black" style={{ color: BRAND }}>Laundry Production</h1>
        <p className="mt-1 text-sm text-slate-500">This page is for whoever is on laundry duty today. Ask the coordinator to put you on the laundry allocation.</p>
      </div>
    );
  }

  return (
    <div className={`mx-auto px-4 pt-3 text-slate-800 ${tab === "enter" ? "max-w-xl pb-24 md:pb-10" : "max-w-[1600px] pb-24 md:pb-10"}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: BRAND }}>Laundry Production</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">One entry = one load</p>
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 shrink-0">
          {([["enter", "Enter", WashingMachine], ["sheet", "Sheet", Sheet]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${tab === k ? "bg-white shadow-sm" : "text-slate-500"}`}
              style={tab === k ? { color: BRAND } : undefined}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {missingTable && (
        <div className="mb-3 p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <p className="font-bold mb-1">The production table isn&apos;t in the database yet.</p>
          <p className="mb-2">Run this once in Supabase → SQL Editor:</p>
          <pre className="text-[10px] bg-white/70 p-2 rounded-lg overflow-x-auto whitespace-pre">{PRODUCTION_SQL}</pre>
          <button onClick={() => { navigator.clipboard?.writeText(PRODUCTION_SQL); toast.success("SQL copied"); }}
            className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 text-white font-bold"><Copy size={12} /> Copy SQL</button>
        </div>
      )}

      {tab === "enter"
        ? <EntryTab today={today} me={me} admin={admin} onMissingTable={onMissingTable} />
        : <SheetTab today={today} me={me} admin={admin} onMissingTable={onMissingTable} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Entering a load (phone)
// ---------------------------------------------------------------------------------------------

function EntryTab({ today, me, admin, onMissingTable }: { today: string; me: string; admin: boolean; onMissingTable: () => void }) {
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [running, setRunning] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startFor, setStartFor] = useState<string | null>(null);   // machine id → "start a load" sheet
  const [editing, setEditing] = useState<ProductionEntry | null>(null);
  const [, tick] = useState(0);
  const isToday = date === today;

  // Timers on running machines
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [day, run] = await Promise.all([
      supabase.from(TABLE).select("*").eq("prod_date", date).order("time_in", { ascending: false }).order("created_at", { ascending: false }),
      // Still in a machine (also from yesterday, for overnight loads)
      supabase.from(TABLE).select("*").is("time_out", null).gte("prod_date", shiftDay(today, -1)),
    ]);
    const err = day.error || run.error;
    if (err) { if (isMissingTable(err)) onMissingTable(); else toast.error(err.message); }
    setEntries((day.data || []) as ProductionEntry[]);
    setRunning((run.data || []) as ProductionEntry[]);
    setLoading(false);
  }, [date, today, onMissingTable]);
  useEffect(() => { load(); }, [load]);

  const runningOn = (machineId: string) => running.find(r => r.machine === machineId);
  const loadsToday = (machineId: string) => entries.filter(e => e.machine === machineId).length;
  const dayKg = entries.reduce((s, e) => s + (Number(e.weight_kg) || 0), 0);

  const upsertLocal = (row: ProductionEntry) => {
    setEntries(prev => (row.prod_date === date ? [row, ...prev.filter(x => x.id !== row.id)].sort((a, b) => hhmm(b.time_in).localeCompare(hhmm(a.time_in))) : prev.filter(x => x.id !== row.id)));
    setRunning(prev => (row.time_out ? prev.filter(x => x.id !== row.id) : [row, ...prev.filter(x => x.id !== row.id)]));
  };

  const start = async (machine: string, item: string, kg: number, timeIn: string, timeOut: string, forDate: string) => {
    const prog = programmeFor(machine, item);
    const row = { prod_date: forDate, machine, item, weight_kg: kg, time_in: timeIn, time_out: timeOut || null, operator: me || null, dose: prog?.dose || null };
    const { data, error } = await supabase.from(TABLE).insert(row).select().single();
    if (error) { if (isMissingTable(error)) onMissingTable(); toast.error(isMissingTable(error) ? "Run the SQL shown above first" : error.message); return false; }
    upsertLocal(data as ProductionEntry);
    toast.success(timeOut ? `Saved · ${machineById(machine)?.label} · ${item}` : `${machineById(machine)?.label} started · ${item}`);
    return true;
  };

  const finish = async (e: ProductionEntry) => {
    const t = nowHHMM();
    const { data, error } = await supabase.from(TABLE).update({ time_out: t }).eq("id", e.id).select().single();
    if (error) return toast.error(error.message);
    upsertLocal(data as ProductionEntry);
    toast((tt) => (
      <span className="flex items-center gap-3 text-sm">
        <span><b>{machineById(e.machine)?.label}</b> finished · {t}</span>
        <button className="font-black" style={{ color: BRAND }} onClick={async () => {
          toast.dismiss(tt.id);
          const r = await supabase.from(TABLE).update({ time_out: null }).eq("id", e.id).select().single();
          if (!r.error) upsertLocal(r.data as ProductionEntry);
        }}>Undo</button>
      </span>
    ), { duration: 6000 });
  };

  const saveEdit = async (e: ProductionEntry, patch: Partial<ProductionEntry>) => {
    const { data, error } = await supabase.from(TABLE).update(patch).eq("id", e.id).select().single();
    if (error) { toast.error(error.message); return false; }
    upsertLocal(data as ProductionEntry);
    return true;
  };

  const remove = async (e: ProductionEntry) => {
    if (!confirm(`Delete ${machineById(e.machine)?.label} · ${e.item}?`)) return false;
    const { error } = await supabase.from(TABLE).delete().eq("id", e.id);
    if (error) { toast.error(error.message); return false; }
    setEntries(prev => prev.filter(x => x.id !== e.id));
    setRunning(prev => prev.filter(x => x.id !== e.id));
    return true;
  };

  const canEdit = (e: ProductionEntry) => admin || (!!me && e.operator === me);

  return (
    <div className="flex flex-col gap-3">
      {/* Day */}
      <div className="flex items-center gap-2">
        <button onClick={() => setDate(shiftDay(date, -1))} className="p-2 rounded-xl bg-white border border-slate-200 active:scale-95"><ChevronLeft size={16} /></button>
        <label className="flex-1 relative text-center bg-white border border-slate-200 rounded-xl py-1.5">
          <span className="text-sm font-black" style={{ color: BRAND }}>{dayLabel(date, today)}</span>
          <span className="ml-2 text-[11px] font-bold text-slate-400">{entries.length} loads{dayKg ? ` · ${Math.round(dayKg)} kg` : ""}</span>
          <input type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <button onClick={() => setDate(shiftDay(date, 1))} disabled={isToday} className="p-2 rounded-xl bg-white border border-slate-200 active:scale-95 disabled:opacity-30"><ChevronRight size={16} /></button>
      </div>

      {/* Machines */}
      {isToday ? (
        <div className="grid grid-cols-2 gap-3">
          {MACHINES.map((m, i) => {
            const r = runningOn(m.id);
            const mins = r ? minutesBetween(r.time_in, nowHHMM()) : null;
            const wide = i === MACHINES.length - 1 && MACHINES.length % 2 === 1;
            return r ? (
              <div key={m.id} className={`rounded-3xl p-4 text-white shadow-lg relative overflow-hidden ${wide ? "col-span-2" : ""}`} style={{ background: BRAND }}>
                <span className="absolute -right-6 -top-6 w-24 h-24 rounded-full border-[10px] border-white/10 animate-spin [animation-duration:6s]" />
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black">{m.label}</span>
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" /> Running</span>
                </div>
                <button onClick={() => canEdit(r) && setEditing(r)} className="block text-left mt-1 w-full">
                  <p className="text-sm font-bold leading-tight truncate">{r.item}</p>
                  <p className="text-[11px] text-white/70">{r.weight_kg} kg · in {hhmm(r.time_in)} · <b className="text-white">{fmtDuration(mins)}</b></p>
                </button>
                <button onClick={() => finish(r)} className="mt-3 w-full h-12 rounded-2xl bg-white font-black text-sm uppercase tracking-wider active:scale-[0.98]" style={{ color: BRAND }}>
                  Finish
                </button>
              </div>
            ) : (
              <button key={m.id} onClick={() => setStartFor(m.id)}
                className={`rounded-3xl p-4 bg-white border-2 border-dashed border-slate-200 text-left active:scale-[0.98] hover:border-[#6D2158]/40 transition-colors ${wide ? "col-span-2" : ""}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-slate-700">{m.label}</span>
                  <span className="text-[10px] font-bold text-slate-400">{m.size}</span>
                </div>
                <p className="text-[11px] font-bold text-slate-400 mt-1">Idle{loadsToday(m.id) ? ` · ${loadsToday(m.id)} today` : ""}</p>
                <span className="mt-3 h-12 rounded-2xl flex items-center justify-center gap-1.5 font-black text-sm uppercase tracking-wider text-white" style={{ background: BRAND }}>
                  <Plus size={16} /> Start
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <button onClick={() => setStartFor(MACHINES[0].id)} className="h-12 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2" style={{ background: BRAND }}>
          <Plus size={16} /> Add a missed load for {dayLabel(date, today)}
        </button>
      )}

      {/* Log */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
          <h2 className="text-xs font-black text-slate-700">{dayLabel(date, today)}&apos;s loads</h2>
          {isToday && <button onClick={() => setStartFor(MACHINES[0].id + "|past")} className="text-[11px] font-bold" style={{ color: BRAND }}>+ Missed load</button>}
        </div>
        {loading ? (
          <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
        ) : entries.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-400">{isToday ? "Tap a machine to start the first load." : "Nothing entered."}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map(e => (
              <li key={e.id}>
                <button onClick={() => canEdit(e) && setEditing(e)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-slate-50">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0" style={{ background: `${BRAND}14`, color: BRAND }}>
                    {machineById(e.machine)?.label || e.machine}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-700 truncate">{e.item}</span>
                    <span className="block text-[10px] text-slate-400 truncate">
                      {hhmm(e.time_in)} – {e.time_out ? hhmm(e.time_out) : <b className="text-emerald-600">running</b>}
                      {e.time_out ? ` · ${fmtDuration(minutesBetween(e.time_in, e.time_out))}` : ""}{e.operator ? ` · ${e.operator}` : ""}
                    </span>
                  </span>
                  <span className="text-sm font-black shrink-0 text-slate-700">{e.weight_kg ?? "–"}<span className="text-[10px] text-slate-400"> kg</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {startFor && (
        <StartSheet
          initialMachine={startFor.split("|")[0]}
          past={!isToday || startFor.endsWith("|past")}
          busy={new Set(running.map(r => r.machine))}
          forDate={date}
          operator={me}
          onClose={() => setStartFor(null)}
          onStart={async (...a) => { if (await start(...a)) setStartFor(null); }}
        />
      )}
      {editing && (
        <EditSheet entry={editing} onClose={() => setEditing(null)}
          onSave={async patch => { if (await saveEdit(editing, patch)) setEditing(null); }}
          onDelete={async () => { if (await remove(editing)) setEditing(null); }} />
      )}
    </div>
  );
}

// Bottom sheet above everything (incl. the phone's bottom bar)
function BottomSheet({ title, onClose, children, footer }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; }, []);
  return (
    <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-3xl max-h-[92vh] flex flex-col animate-in slide-in-from-bottom-8 duration-200">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <div className="text-lg font-black text-slate-800">{title}</div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-3 flex-1">{children}</div>
        <div className="px-5 pt-3 border-t border-slate-100 shrink-0" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>{footer}</div>
      </div>
    </div>
  );
}

const WEIGHT_CHIPS: Record<string, number[]> = { "55kg": [25, 30, 35, 40, 45, 50, 55], "23kg": [10, 12, 15, 18, 20, 23] };
const recentKey = (machine: string) => `lp_recent_${machineById(machine)?.size}`;

function StartSheet({ initialMachine, past, busy, forDate, operator, onClose, onStart }: {
  initialMachine: string; past: boolean; busy: Set<string>; forDate: string; operator: string;
  onClose: () => void; onStart: (machine: string, item: string, kg: number, timeIn: string, timeOut: string, forDate: string) => Promise<void>;
}) {
  const [machine, setMachine] = useState(initialMachine);
  const [item, setItem] = useState("");
  const [kg, setKg] = useState("");
  const [timeIn, setTimeIn] = useState(nowHHMM());
  const [timeOut, setTimeOut] = useState(past ? nowHHMM() : "");
  const [saving, setSaving] = useState(false);
  const size = machineById(machine)?.size || "55kg";
  const recent = useMemo(() => { try { return JSON.parse(localStorage.getItem(recentKey(machine)) || "[]") as string[]; } catch { return []; } }, [machine]);
  const programmes = useMemo(() => {
    const list = PROGRAMMES[size];
    return [...list].sort((a, b) => (recent.indexOf(a.item) + 1 || 99) - (recent.indexOf(b.item) + 1 || 99));
  }, [size, recent]);

  const ok = !!item && Number(kg) > 0 && (!past || (!!timeIn && !!timeOut));
  const go = async () => {
    if (!ok) return;
    setSaving(true);
    try { localStorage.setItem(recentKey(machine), JSON.stringify([item, ...recent.filter(r => r !== item)].slice(0, 4))); } catch {}
    await onStart(machine, item, Number(kg), past ? timeIn : nowHHMM(), past ? timeOut : "", forDate);
    setSaving(false);
  };

  return (
    <BottomSheet
      title={past ? "Add a missed load" : <>Start <span style={{ color: BRAND }}>{machineById(machine)?.label}</span></>}
      onClose={onClose}
      footer={
        <button onClick={go} disabled={!ok || saving}
          className="w-full h-14 rounded-2xl text-white font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.99]" style={{ background: BRAND }}>
          {saving ? <Loader2 className="animate-spin" size={18} /> : past ? <Check size={18} /> : <Play size={18} />}
          {!item ? "Pick the items" : !(Number(kg) > 0) ? "Enter the weight" : past ? "Save load" : `Start now · ${nowHHMM()}`}
        </button>
      }>
      {past && (
        <div className="grid grid-cols-5 gap-1.5 mb-4">
          {MACHINES.map(m => (
            <button key={m.id} onClick={() => { setMachine(m.id); if (machineById(m.id)?.size !== size) setItem(""); }}
              className={`py-2 rounded-xl text-sm font-black ${m.id === machine ? "text-white" : "bg-slate-100 text-slate-600"}`}
              style={m.id === machine ? { background: BRAND } : undefined}>{m.label}</button>
          ))}
        </div>
      )}
      {!past && busy.has(machine) && <p className="mb-3 text-xs font-bold text-amber-600">This machine already has a load running.</p>}

      <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Items</p>
      <div className="flex flex-col gap-1.5">
        {programmes.map(p => {
          const on = p.item === item;
          return (
            <button key={p.item} onClick={() => setItem(p.item)}
              className={`flex items-center justify-between px-4 h-12 rounded-2xl text-left text-sm font-bold transition-colors ${on ? "text-white" : "bg-slate-50 text-slate-700 active:bg-slate-100"}`}
              style={on ? { background: BRAND } : undefined}>
              <span className="truncate">{p.item}</span>
              {on ? <Check size={18} /> : recent.includes(p.item) ? <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">recent</span> : null}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-5 mb-2">Weight</p>
      <div className="flex items-center gap-2">
        <input type="number" inputMode="decimal" min={0} step="0.1" value={kg} onChange={e => setKg(e.target.value)} placeholder="0"
          className="w-28 h-14 px-3 text-3xl font-black text-center rounded-2xl border-2 border-slate-200 outline-none focus:border-[#6D2158]" style={{ color: BRAND }} />
        <span className="text-lg font-black text-slate-400">kg</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {WEIGHT_CHIPS[size].map(w => (
          <button key={w} onClick={() => setKg(String(w))}
            className={`px-3.5 h-10 rounded-xl text-sm font-black ${Number(kg) === w ? "text-white" : "bg-slate-100 text-slate-600 active:bg-slate-200"}`}
            style={Number(kg) === w ? { background: BRAND } : undefined}>{w}</button>
        ))}
      </div>

      {past && (
        <div className="grid grid-cols-2 gap-3 mt-5">
          <TimeField label="In" value={timeIn} onChange={setTimeIn} />
          <TimeField label="Out" value={timeOut} onChange={setTimeOut} />
        </div>
      )}
      <p className="mt-4 text-[11px] text-slate-400">Operator: <b className="text-slate-600">{operator || "—"}</b>{!past && " · in time is set when you tap Start, out time when you tap Finish"}</p>
    </BottomSheet>
  );
}

function EditSheet({ entry, onClose, onSave, onDelete }: { entry: ProductionEntry; onClose: () => void; onSave: (p: Partial<ProductionEntry>) => Promise<void>; onDelete: () => Promise<void> }) {
  const [kg, setKg] = useState(String(entry.weight_kg ?? ""));
  const [timeIn, setTimeIn] = useState(hhmm(entry.time_in));
  const [timeOut, setTimeOut] = useState(hhmm(entry.time_out));
  return (
    <BottomSheet title={<>{machineById(entry.machine)?.label} · <span className="text-slate-500 text-base">{entry.item}</span></>} onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onDelete} className="h-14 px-4 rounded-2xl bg-rose-50 text-rose-600 font-black"><Trash2 size={18} /></button>
          <button onClick={() => onSave({ weight_kg: kg ? Number(kg) : null, time_in: timeIn || null, time_out: timeOut || null })}
            className="flex-1 h-14 rounded-2xl text-white font-black uppercase tracking-widest text-sm" style={{ background: BRAND }}>Save</button>
        </div>
      }>
      <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Weight</p>
      <div className="flex items-center gap-2">
        <input type="number" inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)}
          className="w-28 h-14 px-3 text-3xl font-black text-center rounded-2xl border-2 border-slate-200 outline-none focus:border-[#6D2158]" style={{ color: BRAND }} />
        <span className="text-lg font-black text-slate-400">kg</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <TimeField label="In" value={timeIn} onChange={setTimeIn} />
        <TimeField label="Out" value={timeOut} onChange={setTimeOut} allowEmpty />
      </div>
      <p className="mt-4 text-[11px] text-slate-400">Entered by <b className="text-slate-600">{entry.operator || "—"}</b></p>
    </BottomSheet>
  );
}

function TimeField({ label, value, onChange, allowEmpty }: { label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        <span className="flex gap-2">
          {allowEmpty && value && <button type="button" onClick={() => onChange("")} className="text-[11px] font-bold text-slate-400">Clear</button>}
          <button type="button" onClick={() => onChange(nowHHMM())} className="text-[11px] font-bold" style={{ color: BRAND }}>Now</button>
        </span>
      </div>
      <input type="time" value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-14 px-3 text-xl font-black rounded-2xl border-2 border-slate-200 outline-none focus:border-[#6D2158] text-slate-700" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Main sheet (PC)
// ---------------------------------------------------------------------------------------------

type EditField = "weight_kg" | "time_in" | "time_out";

function SheetTab({ today, me, admin, onMissingTable }: { today: string; me: string; admin: boolean; onMissingTable: () => void }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [machineFilter, setMachineFilter] = useState("");
  const [rows, setRows] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string; field: EditField; value: string } | null>(null);
  const { from, to } = monthBounds(month);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const all: ProductionEntry[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase.from(TABLE).select("*").gte("prod_date", from).lte("prod_date", to)
          .order("prod_date").order("time_in").order("created_at").range(page * 1000, page * 1000 + 999);
        if (error) { if (isMissingTable(error)) onMissingTable(); else toast.error(error.message); break; }
        all.push(...((data || []) as ProductionEntry[]));
        if (!data || data.length < 1000) break;
      }
      if (alive) { setRows(all); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [from, to, onMissingTable]);

  const shown = useMemo(() => (machineFilter ? rows.filter(r => r.machine === machineFilter) : rows), [rows, machineFilter]);

  const totals = useMemo(() => {
    let kg = 0, minutes = 0, timed = 0, chem = emptyDose();
    const byMachine: Record<string, { loads: number; kg: number }> = {};
    shown.forEach(r => {
      kg += Number(r.weight_kg) || 0;
      chem = addDose(chem, usageOf(r));
      const d = minutesBetween(r.time_in, r.time_out);
      if (d != null) { minutes += d; timed++; }
      const m = (byMachine[r.machine] ||= { loads: 0, kg: 0 });
      m.loads++; m.kg += Number(r.weight_kg) || 0;
    });
    return { kg, chem, avg: timed ? Math.round(minutes / timed) : null, byMachine };
  }, [shown]);

  // Rows grouped by day, with a subtotal after each day
  const days = useMemo(() => {
    const g: { date: string; rows: ProductionEntry[]; kg: number; chem: Dose }[] = [];
    shown.forEach(r => {
      let d = g[g.length - 1];
      if (!d || d.date !== r.prod_date) { d = { date: r.prod_date, rows: [], kg: 0, chem: emptyDose() }; g.push(d); }
      d.rows.push(r); d.kg += Number(r.weight_kg) || 0; d.chem = addDose(d.chem, usageOf(r));
    });
    return g;
  }, [shown]);

  const saveEdit = async () => {
    if (!editing) return;
    const v = editing.value.trim();
    const patch = { [editing.field]: editing.field === "weight_kg" ? (v ? Number(v) : null) : v || null };
    const { error } = await supabase.from(TABLE).update(patch).eq("id", editing.id);
    if (error) return toast.error(error.message);
    setRows(prev => prev.map(r => (r.id === editing.id ? ({ ...r, ...patch } as ProductionEntry) : r)));
    setEditing(null);
  };

  const remove = async (r: ProductionEntry) => {
    if (!confirm(`Delete ${shortDay(r.prod_date)} · ${machineById(r.machine)?.label} · ${r.item}?`)) return;
    const { error } = await supabase.from(TABLE).delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    setRows(prev => prev.filter(x => x.id !== r.id));
  };

  const downloadCsv = () => {
    const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [
      ["Date", "Machine", "Items", "Weight (kg)", "In", "Out", "Duration", "Operator", ...CHEMICALS.map(c => `${c} (ml)`)].map(q).join(","),
      ...shown.map(r => {
        const u = usageOf(r);
        return [r.prod_date, machineById(r.machine)?.label || r.machine, r.item, r.weight_kg ?? "", hhmm(r.time_in), hhmm(r.time_out),
          fmtDuration(minutesBetween(r.time_in, r.time_out)), r.operator || "", ...CHEMICALS.map(c => u[c])].map(q).join(",");
      }),
      ["Total", `${shown.length} loads`, "", Math.round(totals.kg * 10) / 10, "", "", "", "", ...CHEMICALS.map(c => totals.chem[c])].map(q).join(","),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Laundry Production ${monthLabel(month)}${machineFilter ? ` ${machineById(machineFilter)?.label}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const canEdit = (r: ProductionEntry) => admin || (!!me && r.operator === me);
  const cell = (r: ProductionEntry, field: EditField, display: React.ReactNode) => {
    if (editing && editing.id === r.id && editing.field === field) {
      return (
        <span className="inline-flex items-center gap-1">
          <input autoFocus type={field === "weight_kg" ? "number" : "time"} value={editing.value}
            onChange={e => setEditing({ ...editing, value: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }}
            className="w-20 px-1 py-0.5 border border-[#6D2158] rounded text-xs outline-none" />
          <button onClick={saveEdit} className="text-emerald-600"><Check size={13} /></button>
          <button onClick={() => setEditing(null)} className="text-slate-400"><X size={13} /></button>
        </span>
      );
    }
    const raw = field === "weight_kg" ? String(r.weight_kg ?? "") : hhmm(r[field]);
    return canEdit(r)
      ? <button onClick={() => setEditing({ id: r.id, field, value: raw })} className="hover:underline decoration-dotted min-w-[2rem]">{display || <span className="text-slate-300">—</span>}</button>
      : <>{display}</>;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-200 p-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-2 rounded-xl bg-slate-50 active:scale-95"><ChevronLeft size={18} /></button>
        <span className="w-40 text-center text-sm font-black" style={{ color: BRAND }}>{monthLabel(month)}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= today.slice(0, 7)} className="p-2 rounded-xl bg-slate-50 active:scale-95 disabled:opacity-30"><ChevronRight size={18} /></button>
        <div className="flex gap-1 ml-2 flex-wrap">
          {[{ id: "", label: "All machines" }, ...MACHINES].map(m => (
            <button key={m.id} onClick={() => setMachineFilter(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${machineFilter === m.id ? "text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
              style={machineFilter === m.id ? { background: BRAND } : undefined}>{m.label}</button>
          ))}
        </div>
        <button onClick={downloadCsv} disabled={!shown.length} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-30" style={{ background: BRAND }}>
          <Download size={14} /> CSV
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <Stat label="Loads" value={String(shown.length)} strong />
        <Stat label="Weight" value={`${Math.round(totals.kg).toLocaleString()} kg`} />
        <Stat label="Avg cycle" value={totals.avg != null ? fmtDuration(totals.avg) : "—"} />
        {MACHINES.map(m => (
          <Stat key={m.id} label={`${m.label} · ${m.size}`} value={`${totals.byMachine[m.id]?.loads || 0}`} sub={`${Math.round(totals.byMachine[m.id]?.kg || 0)} kg`} />
        ))}
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {CHEMICALS.map(c => <Stat key={c} label={c} value={fmtMl(totals.chem[c])} />)}
      </div>

      {/* Sheet */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
        ) : !shown.length ? (
          <p className="p-10 text-center text-xs text-slate-400">No loads entered for {monthLabel(month)}.</p>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="text-white text-[10px] uppercase tracking-wider" style={{ background: BRAND }}>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Machine</th>
                  <th className="px-2 py-2 text-left">Items</th>
                  <th className="px-2 py-2 text-right">Weight kg</th>
                  <th className="px-2 py-2 text-left">In</th>
                  <th className="px-2 py-2 text-left">Out</th>
                  <th className="px-2 py-2 text-left">Duration</th>
                  <th className="px-2 py-2 text-left">Operator</th>
                  {CHEMICALS.map(c => <th key={c} className="px-2 py-2 text-right font-semibold normal-case">{c}</th>)}
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {days.map(day => (
                  <React.Fragment key={day.date}>
                    {day.rows.map((r, i) => {
                      const u = usageOf(r);
                      return (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                          <td className="px-3 py-1.5 font-bold text-slate-600">{i === 0 ? shortDay(r.prod_date) : ""}</td>
                          <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded font-black text-[10px]" style={{ background: `${BRAND}14`, color: BRAND }}>{machineById(r.machine)?.label || r.machine}</span></td>
                          <td className="px-2 py-1.5 font-semibold text-slate-700">{r.item}</td>
                          <td className="px-2 py-1.5 text-right font-bold">{cell(r, "weight_kg", r.weight_kg ?? "")}</td>
                          <td className="px-2 py-1.5">{cell(r, "time_in", hhmm(r.time_in))}</td>
                          <td className="px-2 py-1.5">{cell(r, "time_out", r.time_out ? hhmm(r.time_out) : <span className="text-emerald-600 font-bold">running</span>)}</td>
                          <td className="px-2 py-1.5 text-slate-500">{fmtDuration(minutesBetween(r.time_in, r.time_out))}</td>
                          <td className="px-2 py-1.5 text-slate-600">{r.operator || ""}</td>
                          {CHEMICALS.map(c => <td key={c} className={`px-2 py-1.5 text-right ${u[c] ? "text-slate-600" : "text-slate-300"}`}>{u[c] || "–"}</td>)}
                          <td className="px-2 py-1.5 text-right">
                            {canEdit(r) && <button onClick={() => remove(r)} className="p-1 rounded text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50 border-b-2 border-slate-200 font-black text-slate-700">
                      <td className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400" colSpan={3}>{shortDay(day.date)} · {day.rows.length} loads</td>
                      <td className="px-2 py-1.5 text-right">{Math.round(day.kg * 10) / 10}</td>
                      <td colSpan={4} />
                      {CHEMICALS.map(c => <td key={c} className="px-2 py-1.5 text-right">{fmtMl(day.chem[c])}</td>)}
                      <td />
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="text-white font-black" style={{ background: BRAND }}>
                  <td className="px-3 py-2" colSpan={3}>Month total · {shown.length} loads</td>
                  <td className="px-2 py-2 text-right">{Math.round(totals.kg * 10) / 10}</td>
                  <td colSpan={4} />
                  {CHEMICALS.map(c => <td key={c} className="px-2 py-2 text-right">{fmtMl(totals.chem[c])}</td>)}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-400">Chemicals are ml per load from the dosing sheet. Click a weight or time to correct it.</p>
    </div>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${strong ? "text-white" : "bg-white border border-slate-200"}`} style={strong ? { background: BRAND } : undefined}>
      <span className={`block text-[10px] font-bold truncate ${strong ? "text-white/60" : "text-slate-400"}`}>{label}</span>
      <span className={`block text-lg font-black ${strong ? "" : "text-slate-800"}`}>{value}</span>
      {sub && <span className="block text-[10px] font-bold text-slate-400">{sub}</span>}
    </div>
  );
}

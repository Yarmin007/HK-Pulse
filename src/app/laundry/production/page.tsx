"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, WashingMachine, Sheet, Download, Copy, Clock, Check, X } from "lucide-react";
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
    <div className={`mx-auto px-4 pt-3 text-slate-800 ${tab === "enter" ? "max-w-xl pb-44 md:pb-10" : "max-w-[1600px] pb-24 md:pb-10"}`}>
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
  const [machine, setMachine] = useState("M1");
  const [item, setItem] = useState("");
  const [kg, setKg] = useState("");
  const [timeIn, setTimeIn] = useState(nowHHMM());
  const [timeOut, setTimeOut] = useState("");
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const size = machineById(machine)?.size || "55kg";
  const programmes = PROGRAMMES[size];

  // Each phone remembers its last machine
  useEffect(() => { try { const m = localStorage.getItem("lp_machine"); if (m && machineById(m)) setMachine(m); } catch {} }, []);
  const pickMachine = (id: string) => { setMachine(id); try { localStorage.setItem("lp_machine", id); } catch {} };
  useEffect(() => { if (item && !programmes.some(p => p.item === item)) setItem(""); }, [programmes, item]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(TABLE).select("*").eq("prod_date", date).order("time_in", { ascending: false }).order("created_at", { ascending: false });
    if (error) { if (isMissingTable(error)) onMissingTable(); else toast.error(error.message); setEntries([]); }
    else setEntries((data || []) as ProductionEntry[]);
    setLoading(false);
  }, [date, onMissingTable]);
  useEffect(() => { load(); }, [load]);

  const prog = programmeFor(machine, item);

  const save = async () => {
    if (!prog) return toast.error("Pick the item");
    if (!kg || Number(kg) <= 0) return toast.error("Enter the weight");
    if (!timeIn) return toast.error("Enter the In time");
    setSaving(true);
    const row = { prod_date: date, machine, item, weight_kg: Number(kg), time_in: timeIn, time_out: timeOut || null, operator: me || null, dose: prog.dose };
    const { data, error } = await supabase.from(TABLE).insert(row).select().single();
    setSaving(false);
    if (error) { if (isMissingTable(error)) onMissingTable(); return toast.error(isMissingTable(error) ? "Run the SQL shown above first" : error.message); }
    setEntries(prev => [data as ProductionEntry, ...prev]);
    toast.success(`${machineById(machine)?.label} · ${item} · ${kg} kg`);
    setKg(""); setTimeOut(""); setTimeIn(nowHHMM());
  };

  const finish = async (e: ProductionEntry) => {
    const t = nowHHMM();
    const { error } = await supabase.from(TABLE).update({ time_out: t }).eq("id", e.id);
    if (error) return toast.error(error.message);
    setEntries(prev => prev.map(x => (x.id === e.id ? { ...x, time_out: t } : x)));
  };

  const remove = async (e: ProductionEntry) => {
    if (!confirm(`Delete ${machineById(e.machine)?.label} · ${e.item}?`)) return;
    const { error } = await supabase.from(TABLE).delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    setEntries(prev => prev.filter(x => x.id !== e.id));
  };

  const dayKg = entries.reduce((s, e) => s + (Number(e.weight_kg) || 0), 0);
  const perMachine = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach(e => { m[e.machine] = (m[e.machine] || 0) + 1; });
    return m;
  }, [entries]);
  const busy = useMemo(() => new Set(entries.filter(e => !e.time_out).map(e => e.machine)), [entries]);

  return (
    <div className="flex flex-col gap-3">
      {/* Day */}
      <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-200 p-2">
        <button onClick={() => setDate(shiftDay(date, -1))} className="p-2.5 rounded-xl bg-slate-50 active:scale-95"><ChevronLeft size={18} /></button>
        <label className="flex-1 text-center relative">
          <span className="block text-sm font-black" style={{ color: BRAND }}>{dayLabel(date, today)}</span>
          <span className="block text-[10px] font-bold text-slate-400">{new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
          <input type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <button onClick={() => setDate(shiftDay(date, 1))} disabled={date >= today} className="p-2.5 rounded-xl bg-slate-50 active:scale-95 disabled:opacity-30"><ChevronRight size={18} /></button>
      </div>

      {/* Machine */}
      <section className="bg-white rounded-2xl border border-slate-200 p-3">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Machine</h2>
        <div className="grid grid-cols-5 gap-2">
          {MACHINES.map(m => {
            const on = m.id === machine;
            return (
              <button key={m.id} onClick={() => pickMachine(m.id)}
                className={`relative rounded-xl py-3 border-2 transition-all active:scale-95 ${on ? "text-white shadow-md" : "bg-slate-50 border-slate-100 text-slate-700"}`}
                style={on ? { background: BRAND, borderColor: BRAND } : undefined}>
                <span className="block text-base font-black leading-none">{m.label}</span>
                <span className={`block text-[9px] font-bold mt-1 ${on ? "text-white/70" : "text-slate-400"}`}>{busy.has(m.id) ? "running" : m.size}</span>
                {!!perMachine[m.id] && (
                  <span className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center ${on ? "bg-white" : "text-white"}`}
                    style={on ? { color: BRAND } : { background: BRAND }}>{perMachine[m.id]}</span>
                )}
                {busy.has(m.id) && <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Item */}
      <section className="bg-white rounded-2xl border border-slate-200 p-3">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Name of the item</h2>
        <div className="grid grid-cols-2 gap-2">
          {programmes.map(p => {
            const on = p.item === item;
            return (
              <button key={p.item} onClick={() => setItem(p.item)}
                className={`text-left rounded-xl px-3 py-2.5 border-2 text-xs font-bold leading-tight transition-all active:scale-[0.98] ${on ? "text-white" : "bg-slate-50 border-slate-100 text-slate-700"}`}
                style={on ? { background: BRAND, borderColor: BRAND } : undefined}>
                {p.item}
              </button>
            );
          })}
        </div>
      </section>

      {/* Weight, times, operator */}
      <section className="bg-white rounded-2xl border border-slate-200 p-3 grid grid-cols-3 gap-2">
        <label className="col-span-3">
          <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Weight (kg)</span>
          <input type="number" inputMode="decimal" min={0} step="0.1" value={kg} onChange={e => setKg(e.target.value)} placeholder="0"
            className="w-full h-14 px-4 text-2xl font-black rounded-2xl border-2 border-slate-100 outline-none focus:border-[#6D2158]" style={{ color: BRAND }} />
        </label>
        <TimeBox label="In time" value={timeIn} onChange={setTimeIn} />
        <TimeBox label="Out time" value={timeOut} onChange={setTimeOut} />
        <div className="min-w-0">
          <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Operator</span>
          <span className="h-12 px-2 rounded-xl bg-slate-50 flex items-center text-xs font-bold text-slate-600 truncate">{me || "—"}</span>
        </div>
        <p className="col-span-3 text-[10px] text-slate-400">Out time can be left empty and filled with “Out now” when the machine finishes.</p>
      </section>

      {/* Save — sits above the phone's bottom bar */}
      <div className="fixed md:static bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 z-30 p-3 md:p-0 bg-white/95 md:bg-transparent backdrop-blur border-t md:border-0 border-slate-200">
        <button onClick={save} disabled={saving || !prog}
          className="w-full max-w-xl mx-auto h-14 rounded-2xl text-white font-black uppercase tracking-widest text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]"
          style={{ background: BRAND }}>
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
          {prog ? `Save load · ${machineById(machine)?.label}` : "Pick machine & item"}
        </button>
      </div>

      {/* The day so far */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
          <h2 className="text-xs font-black text-slate-700">{dayLabel(date, today)}&apos;s loads</h2>
          <span className="text-[11px] font-bold text-slate-500">{entries.length} load{entries.length === 1 ? "" : "s"}{dayKg ? ` · ${Math.round(dayKg * 10) / 10} kg` : ""}</span>
        </div>
        {loading ? (
          <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
        ) : entries.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-400">Nothing entered yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map(e => {
              const mine = admin || (!!me && e.operator === me);
              return (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-[11px] font-black shrink-0" style={{ background: BRAND }}>
                    {machineById(e.machine)?.label || e.machine}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{e.item}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {hhmm(e.time_in)} → {e.time_out ? hhmm(e.time_out) : <span className="text-emerald-600 font-bold">running</span>}
                      {e.operator ? ` · ${e.operator}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-black shrink-0" style={{ color: BRAND }}>{e.weight_kg ?? "–"} kg</span>
                  {!e.time_out && mine && (
                    <button onClick={() => finish(e)} className="px-2.5 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-black flex items-center gap-1 active:scale-95"><Clock size={12} /> Out now</button>
                  )}
                  {mine && <button onClick={() => remove(e)} className="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={15} /></button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function TimeBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</span>
      <input type="time" value={value} onChange={e => onChange(e.target.value)}
        className="w-full min-w-0 h-12 px-2 text-sm font-black rounded-xl border-2 border-slate-100 outline-none focus:border-[#6D2158] text-slate-700" />
      <button type="button" onClick={() => onChange(nowHHMM())} className="mt-1 text-[10px] font-bold" style={{ color: BRAND }}>Now</button>
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

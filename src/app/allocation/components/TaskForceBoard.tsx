"use client";
// Special Task Force: who does which special task in which villa today. Printed on the allocation
// sheet (bottom left, "SPECIAL TASK FORCE": host | task | villa — 3 rows).
// Stored as hsk_allocations rows: area 'taskforce', host_id = the host, task_details = "villa::task".
import React, { useMemo, useState } from "react";
import { Plus, Trash2, Search, ShieldCheck, X } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { AREAS } from "@/app/allocation/lib/constants";
import { isOffShift } from "@/app/allocation/lib/riders";

export const TASK_FORCE_AREA = "taskforce";
export const SHEET_TASK_FORCE_ROWS = 3;
export const packTaskForce = (villa: string, task: string) => `${villa.trim()}::${task.trim()}`;
export const unpackTaskForce = (details?: string | null) => {
  const [villa, ...rest] = String(details || "").split("::");
  return rest.length ? { villa: villa.trim(), task: rest.join("::").trim() } : { villa: "", task: String(details || "").trim() };
};

type Host = { id: string; full_name: string; nicknames?: string; role?: string };
type Allocation = { id?: string; host_id: string | null; area: string; shift: string; task_details: string; report_date: string };

const label = (h?: Host) => (h ? (h.nicknames ? h.nicknames.split(",")[0].trim() : h.full_name) : "");

function HostPicker({ hosts, value, onPick }: { hosts: Host[]; value: string | null; onPick: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = hosts.find((h) => h.id === value);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? hosts.filter((h) => h.full_name.toLowerCase().includes(t) || (h.nicknames || "").toLowerCase().includes(t) || (h.role || "").toLowerCase().includes(t)) : hosts).slice(0, 40);
  }, [hosts, q]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`w-full h-10 px-3 rounded-xl border text-left text-sm font-bold truncate ${current ? "bg-white border-slate-300 text-slate-800" : "bg-slate-50 border-dashed border-slate-300 text-slate-400"}`}>
        {current ? label(current) : "Pick host"}
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 w-72 max-w-[85vw] bg-white rounded-xl border border-slate-200 shadow-2xl p-2">
          <div className="relative mb-1.5">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or role"
              className="w-full pl-8 pr-2 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#6D2158]" />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {value && (
              <button onClick={() => { onPick(null); setOpen(false); }} className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1"><X size={12} /> Clear</button>
            )}
            {list.map((h) => (
              <button key={h.id} onClick={() => { onPick(h.id); setOpen(false); setQ(""); }}
                className={`w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#6D2158]/5 ${h.id === value ? "bg-[#6D2158]/10" : ""}`}>
                <span className="block text-xs font-black text-slate-800">{label(h)}</span>
                <span className="block text-[10px] font-semibold text-slate-400 truncate">{h.full_name}{h.role ? ` · ${h.role}` : ""}</span>
              </button>
            ))}
            {list.length === 0 && <p className="text-center text-xs text-slate-400 py-3">No match</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaskForceBoard({ hosts, allocations, setAllocations, setIsDirty, selectedDate }: {
  hosts: Host[];
  allocations: Allocation[];
  setAllocations: (a: Allocation[]) => void;
  setIsDirty: (v: boolean) => void;
  selectedDate: string;
}) {
  const { confirmAction } = useConfirm();
  const rows = allocations.filter((a) => a.area === TASK_FORCE_AREA);
  const others = allocations.filter((a) => a.area !== TASK_FORCE_AREA);
  const write = (next: Allocation[], rest: Allocation[] = others) => { setAllocations([...rest, ...next]); setIsDirty(true); };

  const areaName = (area: string) => AREAS.find((x) => x.id === area || (area === "gardening" && x.id === "garden") || (area === "tailor" && x.id === "laundry_tailor") || (area === "laundry" && x.id === "laundry_tailor"))?.label || area;

  // Picking a host who already has a duty today: ask whether to take them off it, or keep both
  const pickHost = async (i: number, hostId: string | null) => {
    if (!hostId) return update(i, { host_id: null });
    const duties = others.filter((a) => String(a.host_id) === String(hostId) && !isOffShift(a.shift));
    if (duties.length === 0) return update(i, { host_id: hostId });
    const h = hosts.find((x) => x.id === hostId);
    const where = [...new Set(duties.map((a) => `${areaName(a.area)}${a.shift && a.shift !== "Unassigned" ? ` (${a.shift})` : ""}${a.area === "villa" && a.task_details ? ` · villas ${a.task_details}` : ""}`))].join(", ");
    const move = await confirmAction({
      title: `${label(h)} already has a duty`,
      message: `${label(h)} is allocated to ${where}. Remove them from there and move to the Special Task Force, or keep both?`,
      confirmText: "Move to Task Force",
      cancelText: "Keep both",
      icon: "question",
    });
    const rest = move ? others.filter((a) => !(String(a.host_id) === String(hostId) && !isOffShift(a.shift))) : others;
    update(i, { host_id: hostId }, rest);
  };

  const update = (i: number, patch: { host_id?: string | null; villa?: string; task?: string }, rest: Allocation[] = others) => {
    const next = rows.map((r, k) => {
      if (k !== i) return r;
      const cur = unpackTaskForce(r.task_details);
      return {
        ...r,
        host_id: patch.host_id !== undefined ? patch.host_id : r.host_id,
        task_details: packTaskForce(patch.villa ?? cur.villa, patch.task ?? cur.task),
      };
    });
    write(next, rest);
  };
  const add = () => write([...rows, { host_id: null, area: TASK_FORCE_AREA, shift: "Task Force", task_details: packTaskForce("", ""), report_date: selectedDate }]);
  const remove = (i: number) => write(rows.filter((_, k) => k !== i));

  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5"><ShieldCheck size={16} className="text-[#6D2158]" /> Special Task Force</h2>
            <p className="text-[11px] font-semibold text-slate-400">Host, task and villa. The first {SHEET_TASK_FORCE_ROWS} print on the allocation sheet (bottom left).</p>
          </div>
          <button onClick={add} className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-[#6D2158] text-white text-xs font-black active:scale-95"><Plus size={14} /> Add</button>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No special task force today. Tap <b>Add</b>.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="hidden sm:grid grid-cols-[1.2fr_1.6fr_0.8fr_auto] gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span>Host</span><span>Task</span><span>Villa</span><span className="w-8" />
            </div>
            {rows.map((r, i) => {
              const { villa, task } = unpackTaskForce(r.task_details);
              return (
                <div key={i} className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1.2fr_1.6fr_0.8fr_auto] gap-2 px-4 py-2.5 items-center ${i >= SHEET_TASK_FORCE_ROWS ? "bg-amber-50/50" : ""}`}>
                  <div className="col-span-1"><HostPicker hosts={hosts} value={r.host_id} onPick={(id) => pickHost(i, id)} /></div>
                  <button onClick={() => remove(i)} className="sm:order-last p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 justify-self-end" title="Remove"><Trash2 size={15} /></button>
                  <input value={task} onChange={(e) => update(i, { task: e.target.value })} placeholder="Task, e.g. Deep clean"
                    className="col-span-2 sm:col-span-1 h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold outline-none focus:border-[#6D2158] focus:bg-white" />
                  <input value={villa} onChange={(e) => update(i, { villa: e.target.value })} placeholder="Villa" inputMode="numeric"
                    className="col-span-2 sm:col-span-1 h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-black outline-none focus:border-[#6D2158] focus:bg-white" />
                </div>
              );
            })}
          </div>
        )}
        {rows.length > SHEET_TASK_FORCE_ROWS && (
          <p className="px-4 py-2 text-[11px] font-bold text-amber-700 bg-amber-50 border-t border-amber-100">The sheet has room for {SHEET_TASK_FORCE_ROWS}: rows after that are saved but not printed.</p>
        )}
      </div>
      <p className="mt-2 text-[11px] font-semibold text-slate-400">Remember to press <b>Save changes</b> at the top.</p>
    </div>
  );
}

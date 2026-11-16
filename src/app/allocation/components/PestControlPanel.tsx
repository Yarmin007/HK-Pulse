"use client";

import React, { useEffect, useState } from "react";
import { Bug, Save, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { loadPestControl, savePestControl, PEST_CONTROL_ROWS, type PestControlPerson } from "@/lib/pestControl";

const emptyRows = (team: PestControlPerson[]) =>
  Array.from({ length: PEST_CONTROL_ROWS }, (_, i) => team[i] || { name: "", no: "" });

/** Pest control team for the allocation sheet. Not per day: stays the same until changed here. */
export default function PestControlPanel() {
  const [rows, setRows] = useState<PestControlPerson[]>(emptyRows([]));
  const [saved, setSaved] = useState<string>("[]");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPestControl()
      .then(({ team }) => { setRows(emptyRows(team)); setSaved(JSON.stringify(emptyRows(team))); })
      .catch(() => toast.error("Could not load pest control team"))
      .finally(() => setLoading(false));
  }, []);

  const dirty = JSON.stringify(rows) !== saved;

  const update = (i: number, field: keyof PestControlPerson, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const handleSave = async () => {
    setSaving(true);
    try {
      const team = await savePestControl(rows);
      const next = emptyRows(team);
      setRows(next);
      setSaved(JSON.stringify(next));
      toast.success("Pest control team saved: it prints on every day until you change it");
    } catch (err: any) {
      toast.error("Not saved: " + (err?.message || "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm max-w-xl">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-[#6D2158] flex items-center gap-1.5">
            <Bug size={15} /> Pest Control Team
          </span>
          <p className="text-[10px] text-slate-400 font-bold mt-0.5">
            Outside team, not in the staff list. Prints on every allocation sheet until you change it.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading || !dirty}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black shadow-sm transition-all ${
            dirty ? "bg-[#6D2158] text-white hover:bg-[#5a1b49] cursor-pointer" : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {dirty ? "Save" : "Saved"}
        </button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs font-bold text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_140px] gap-2 text-[9px] font-black uppercase text-slate-400 px-1">
            <span>Name</span>
            <span>Contact No.</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_140px] gap-2">
              <input
                value={r.name}
                onChange={(e) => update(i, "name", e.target.value)}
                placeholder={`Person ${i + 1}`}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-xs text-slate-800 outline-none focus:border-[#6D2158]"
              />
              <input
                value={r.no}
                onChange={(e) => update(i, "no", e.target.value)}
                placeholder="Number"
                inputMode="tel"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-xs text-slate-800 outline-none focus:border-[#6D2158]"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

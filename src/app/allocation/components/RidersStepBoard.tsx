"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Car, 
  Sun, 
  Sunset, 
  Clock, 
  UserPlus, 
  Trash2, 
  Search, 
  AlertTriangle, 
  UserCheck, 
  Calendar, 
  Plus, 
  Plane,
  Bike,
  Luggage,
  Footprints,
  X
} from "lucide-react";
import toast from "react-hot-toast";
import { isAway } from "@/lib/leavePeriods";
import { isSpecialTaskRow } from "@/lib/specialTasks";
import { RIDER_DUTIES, RIDER_SHIFTS, shiftsForDuty, shiftTimeFor, defaultDutyForHost, riderDutyOf, isOffShift, isRiderPoolHost, type RiderDuty } from "@/app/allocation/lib/riders";

interface Host {
  id: string;
  host_id?: string;
  full_name: string;
  nicknames?: string;
  mvpn?: string;
  company_mobile?: string;
  personal_mobile?: string;
  role?: string;
  sub_department?: string;
}

interface Allocation {
  id?: string;
  host_id: string;
  area: string;
  shift: string;
  task_details: string;
  report_date: string;
}

interface ActiveLeaveRecord {
  id?: string;
  host_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
}

interface RidersStepBoardProps {
  hosts: Host[];
  setHosts?: React.Dispatch<React.SetStateAction<any[]>>;
  allocations: Allocation[];
  setAllocations: React.Dispatch<React.SetStateAction<Allocation[]>>;
  activeLeaves?: any[];
  setIsDirty: (val: boolean) => void;
  selectedDate: string;
}

const LEAVE_TYPES = [
  { value: "AL", label: "Annual Leave (AL)" },
  { value: "OFF", label: "Day Off (OFF)" },
  { value: "PH", label: "Public Holiday (PH)" },
  { value: "NPL", label: "No Pay Leave (NPL)" },
  { value: "PL", label: "Paternity Leave (PL)" },
  { value: "ML", label: "Maternity Leave (ML)" },
  { value: "SL", label: "Sick Leave (SL)" },
  { value: "EL", label: "Emergency Leave (EL)" },
];

export default function RidersStepBoard({
  hosts,
  setHosts,
  allocations,
  setAllocations,
  setIsDirty,
  selectedDate,
}: RidersStepBoardProps) {
  const [activeLeaveRecords, setActiveLeaveRecords] = useState<ActiveLeaveRecord[]>([]);
  // Off / leave codes in the main attendance for this day, by SSL no (e.g. "SSL 1232" → "O")
  const [attendanceOff, setAttendanceOff] = useState<Record<string, string>>({});

  // Host Leave Modal
  const [selectedHostForLeave, setSelectedHostForLeave] = useState<Host | null>(null);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "AL",
    start_date: selectedDate,
    end_date: selectedDate,
  });

  // Borrow Modal & Search
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [searchHostTerm, setSearchHostTerm] = useState("");

  // Conflict Modal
  const [conflictModal, setConflictModal] = useState<{
    host: Host;
    targetArea: string;
    targetShift: string;
    targetTask: string;
    existingAreas: string[];
    leaveWarning?: string;
  } | null>(null);

  useEffect(() => {
    fetchActiveLeaves();
  }, [selectedDate]);

  const fetchActiveLeaves = async () => {
    try {
      const { data: att } = await supabase
        .from("hsk_attendance")
        .select("host_id, date, status_code, shift_note")
        .eq("date", selectedDate);
      const off: Record<string, string> = {};
      (att || []).forEach((r: any) => { if (isAway(r)) off[String(r.host_id).trim()] = String(r.status_code).trim().toUpperCase(); });
      setAttendanceOff(off);

      const { data, error } = await supabase
        .from("hsk_leave_requests")
        .select("*")
        .lte("start_date", selectedDate)
        .gte("end_date", selectedDate);

      if (!error && data) {
        setActiveLeaveRecords(data as ActiveLeaveRecord[]);
      }
    } catch (err) {
      console.warn("Error fetching leave records:", err);
    }
  };

  // Riders pool: runners, luggage porters and step cleaners
  const currentPool = React.useMemo(() => hosts.filter((h) => isRiderPoolHost(h)), [hosts]);

  const getHostLabel = (h: Host) => {
    return h.nicknames ? h.nicknames.split(",")[0].trim() : h.full_name;
  };

  const getHostLeaveRecord = (hostId: string) => {
    const targetHost = hosts.find((h) => h.id === hostId);
    return activeLeaveRecords.find((l) => 
      l.host_id === hostId || (targetHost?.host_id && l.host_id === targetHost.host_id)
    );
  };

  // Why a host can't work today (leave set on the board, or an off/leave code in the attendance), else null
  const offReason = (hostId: string): string | null => {
    const leave = getHostLeaveRecord(hostId);
    if (leave) return `${leave.leave_type} (till ${leave.end_date})`;
    const ssl = hosts.find((h) => h.id === hostId)?.host_id;
    const code = ssl ? attendanceOff[String(ssl).trim()] : undefined;
    return code ? `${code} in attendance` : null;
  };

  const getLeaveBadge = (hostId: string) => {
    const rec = getHostLeaveRecord(hostId);
    if (!rec) {
      const why = offReason(hostId);
      return why ? <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-black">{why}</span> : null;
    }

    if (rec.leave_type === "AL") {
      return (
        <span className="text-[9px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-black flex items-center gap-1">
          <Plane size={9} /> AL (till {rec.end_date})
        </span>
      );
    }
    if (["OFF", "PH"].includes(rec.leave_type)) {
      return (
        <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-black">
          {rec.leave_type} (till {rec.end_date})
        </span>
      );
    }
    return (
      <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-black">
        {rec.leave_type} (till {rec.end_date})
      </span>
    );
  };

  const handleSaveLeave = async () => {
    if (!selectedHostForLeave) return;

    try {
      const dStart = new Date(leaveForm.start_date);
      const dEnd = new Date(leaveForm.end_date);
      const diffTime = Math.abs(dEnd.getTime() - dStart.getTime());
      const daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      const hostKey = String(selectedHostForLeave.id || selectedHostForLeave.host_id || "");
      const hostNameVal = selectedHostForLeave.full_name || getHostLabel(selectedHostForLeave);

      await supabase
        .from("hsk_leave_requests")
        .delete()
        .eq("host_id", hostKey)
        .lte("start_date", leaveForm.end_date)
        .gte("end_date", leaveForm.start_date);

      const payload = {
        host_id: hostKey,
        host_name: hostNameVal,
        leave_type: String(leaveForm.leave_type),
        start_date: String(leaveForm.start_date),
        end_date: String(leaveForm.end_date),
        total_days: Number(daysCount),
        days_count: Number(daysCount),
        status: "Approved",
        reason: `${leaveForm.leave_type} applied from board`,
      };

      const { error } = await supabase.from("hsk_leave_requests").insert([payload]);

      if (error) {
        throw new Error(error.message || error.details || "Database constraint error");
      }

      // Off / on leave today → can't stay on duty today
      const coversToday = leaveForm.start_date <= selectedDate && leaveForm.end_date >= selectedDate;
      const hadDuty = allocations.some((a) => a.host_id === selectedHostForLeave.id && a.area === "riders" && !isOffShift(a.shift));
      if (coversToday && hadDuty) {
        setAllocations(allocations.filter((a) => !(a.host_id === selectedHostForLeave.id && a.area === "riders" && !isOffShift(a.shift))));
        toast(`${getHostLabel(selectedHostForLeave)} taken off today's duty — save the board`, { icon: "ℹ️" });
      }
      toast.success(`${getHostLabel(selectedHostForLeave)} set to ${leaveForm.leave_type} until ${leaveForm.end_date}!`);
      setSelectedHostForLeave(null);
      fetchActiveLeaves();
      setIsDirty(true);
    } catch (err: any) {
      console.error("Leave save error:", err);
      toast.error("Failed to save leave: " + (err?.message || "Check database table"));
    }
  };

  const handleRemoveLeave = async (leaveId?: string) => {
    if (!leaveId) return;
    try {
      const { error } = await supabase.from("hsk_leave_requests").delete().eq("id", leaveId);
      if (error) throw error;
      toast.success("Leave removed!");
      fetchActiveLeaves();
      setIsDirty(true);
    } catch (err: any) {
      toast.error("Error clearing leave: " + (err?.message || "Could not delete"));
    }
  };

  const handleAddToPool = async (hostId: string) => {
    if (setHosts) {
      setHosts((prev: Host[]) =>
        prev.map((h) => (h.id === hostId ? { ...h, sub_department: "Riders" } : h))
      );
    }

    const { error } = await supabase
      .from("hsk_hosts")
      .update({ sub_department: "Riders" })
      .eq("id", hostId);

    if (error) {
      toast.error("Could not save to pool: " + error.message);
    } else {
      toast.success("Host added to Riders pool!");
    }

    setShowDraftModal(false);
  };

  const handleRemoveFromPool = async (hostId: string) => {
    if (setHosts) {
      setHosts((prev: Host[]) =>
        prev.map((h) => (h.id === hostId ? { ...h, sub_department: "General" } : h))
      );
    }

    await supabase
      .from("hsk_hosts")
      .update({ sub_department: "General" })
      .eq("id", hostId);

    setAllocations(allocations.filter((a) => !(a.host_id === hostId && a.area === "riders")));
    setIsDirty(true);
    toast.success("Host removed from pool");
  };

  // Luggage joined with Public Area: morning luggage = a Public Area Morning BOH host, afternoon luggage =
  // a Public Area afternoon host (they keep their PA duty). Saved once for everyone (hsk_constants).
  const JOIN_TYPE = "luggage_join_pa";
  const [joinLuggage, setJoinLuggage] = useState(false);
  useEffect(() => {
    supabase.from("hsk_constants").select("label").eq("type", JOIN_TYPE).limit(1).maybeSingle()
      .then(({ data }) => setJoinLuggage(data?.label === "true"));
  }, []);
  const toggleJoin = async () => {
    const next = !joinLuggage;
    setJoinLuggage(next);
    const { data: row } = await supabase.from("hsk_constants").select("id").eq("type", JOIN_TYPE).limit(1).maybeSingle();
    const { error } = row?.id
      ? await supabase.from("hsk_constants").update({ label: String(next) }).eq("id", row.id)
      : await supabase.from("hsk_constants").insert([{ type: JOIN_TYPE, label: String(next) }]);
    if (error) { setJoinLuggage(!next); toast.error("Could not save the setting"); }
    else toast.success(next ? "Luggage joined with Public Area" : "Luggage kept separate");
  };
  const paRows = allocations.filter((a) => a.area === "public" && a.host_id && !isSpecialTaskRow(a as any) && !isOffShift(a.shift));
  const paMorningBoh = paRows.filter((a) => /morning|06:30/i.test(a.shift || "") && /boh/i.test(`${a.shift} ${a.task_details}`));
  const paAfternoon = paRows.filter((a) => /afternoon|14:30/i.test(a.shift || ""));
  const hostsOf = (rows: Allocation[]) => [...new Set(rows.map((r) => r.host_id))].map((id) => hosts.find((h) => h.id === id)).filter(Boolean) as Host[];

  // Duty rows on this tab (ignores Off / leave rows)
  const dutyAllocs = allocations.filter((a) => a.area === "riders" && !isOffShift(a.shift));
  const hostById = (id: string) => hosts.find((h) => h.id === id);
  const dutyOfAlloc = (a: Allocation) => riderDutyOf(a, hostById(a.host_id));
  const shiftKeyOf = (shift: string) => RIDER_SHIFTS.find((s) => shift.toLowerCase().includes(s.key.toLowerCase()))?.key || shift;

  const requestAssignDuty = (host: Host, shift: string, duty: RiderDuty) => {
    // Someone who is off or on leave today can't be put on duty
    const off = offReason(host.id);
    if (off) {
      toast.error(`${getHostLabel(host)} is off today (${off}). Clear the leave / attendance first.`);
      return;
    }
    const existingOtherAllocs = allocations.filter((a) => a.host_id === host.id && a.area !== "riders" && !isOffShift(a.shift));

    if (existingOtherAllocs.length > 0) {
      const existingAreas = Array.from(new Set(existingOtherAllocs.map((a) => a.area.toUpperCase())));
      setConflictModal({ host, targetArea: "riders", targetShift: shift, targetTask: duty, existingAreas });
      return;
    }

    executeAssignment(host.id, shift, duty, false);
  };

  // One duty per host per shift: assigning again moves them to the new duty.
  const executeAssignment = (hostId: string, shift: string, task: string, removeOtherAreas: boolean) => {
    // Runner Split = one runner for the whole day: never together with an AM / PM runner
    if (task === "Runner") {
      const otherRunners = allocations.filter((a) => a.area === "riders" && !isOffShift(a.shift) && a.host_id !== hostId && dutyOfAlloc(a) === "Runner");
      const otherKeys = new Set(otherRunners.map((a) => shiftKeyOf(a.shift || "")));
      if (shift === "Split" && otherRunners.length) {
        toast.error("Split is one runner for the whole day. Remove the other runner(s) first.");
        return;
      }
      if (shift !== "Split" && otherKeys.has("Split")) {
        toast.error("There is a split runner today. Remove them first to use AM / PM runners.");
        return;
      }
    }
    let cleanAllocs = [...allocations];
    // Moving a runner to / from Split replaces their other runner shift
    if (task === "Runner") cleanAllocs = cleanAllocs.filter((a) => !(a.host_id === hostId && a.area === "riders" && dutyOfAlloc(a) === "Runner" && (shift === "Split" || shiftKeyOf(a.shift || "") === "Split")));
    if (removeOtherAreas) cleanAllocs = cleanAllocs.filter((a) => a.host_id !== hostId);
    cleanAllocs = cleanAllocs.filter(
      (a) => !(a.host_id === hostId && a.area === "riders" && (isOffShift(a.shift) || shiftKeyOf(a.shift || "") === shift))
    );
    cleanAllocs.push({ host_id: hostId, area: "riders", shift, task_details: task, report_date: selectedDate });
    setAllocations(cleanAllocs);
    setIsDirty(true);
    setConflictModal(null);
  };

  const handleRemoveAllocation = (target: Allocation) => {
    setAllocations(allocations.filter((a) => a !== target));
    setIsDirty(true);
  };

  const DUTY_META: Record<RiderDuty, { icon: React.ReactNode; color: string; soft: string; desc: string }> = {
    Runner: { icon: <Bike size={16} />, color: "text-orange-700", soft: "bg-orange-50 border-orange-200", desc: "Delivers guest requests — sees the Runner page" },
    Luggage: { icon: <Luggage size={16} />, color: "text-sky-700", soft: "bg-sky-50 border-sky-200", desc: "Arrival & departure luggage" },
    Step: { icon: <Footprints size={16} />, color: "text-emerald-700", soft: "bg-emerald-50 border-emerald-200", desc: "Jetty & villa steps / ladders" },
  };

  const renderDutyColumn = (duty: RiderDuty) => {
    const meta = DUTY_META[duty];
    const total = dutyAllocs.filter((a) => dutyOfAlloc(a) === duty).length;
    return (
      <div key={duty} className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${meta.soft}`}>
          <div className="min-w-0">
            <div className={`text-sm font-black flex items-center gap-1.5 ${meta.color}`}>{meta.icon} {duty}{duty === "Runner" ? "s" : ""}</div>
            <p className="text-[10px] font-semibold text-slate-500 truncate">{meta.desc}</p>
          </div>
          <span className="text-[10px] font-black bg-white text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 shrink-0">{total} on duty</span>
        </div>

        <div className="p-3 space-y-3">
          {duty === "Luggage" && (
            <label className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 px-2.5 py-2 cursor-pointer select-none">
              <input type="checkbox" checked={joinLuggage} onChange={toggleJoin} className="mt-0.5 accent-sky-600" />
              <span className="text-[11px] font-bold text-sky-900 leading-snug">
                Join with Public Area
                <span className="block text-[10px] font-semibold text-sky-700/80">Morning: a PA Morning BOH host · Afternoon: a PA afternoon host (they keep their PA duty)</span>
              </span>
            </label>
          )}
          {(duty === "Luggage" && joinLuggage ? RIDER_SHIFTS.filter((s) => s.key !== "Split") : shiftsForDuty(duty)).map((sh) => {
            const joined = duty === "Luggage" && joinLuggage;
            // Step is morning-only: any older Step row on another shift is shown here too
            const assigned = dutyAllocs.filter((a) => dutyOfAlloc(a) === duty && (duty === "Step" || shiftKeyOf(a.shift || "") === sh.key));
            const busyThisShift = new Set(dutyAllocs.filter((a) => shiftKeyOf(a.shift || "") === sh.key).map((a) => a.host_id));
            // People who normally do this duty first
            const candidates = joined
              ? hostsOf(sh.key === "Morning" ? paMorningBoh : paAfternoon).filter((h) => !assigned.some((a) => a.host_id === h.id))
              : currentPool
                  .filter((h) => !busyThisShift.has(h.id))
                  .sort((x, y) => Number(defaultDutyForHost(y) === duty) - Number(defaultDutyForHost(x) === duty));
            // Runners: Split (one person, whole day) and AM / PM exclude each other
            const runnerKeys = duty === "Runner" ? new Set(dutyAllocs.filter((a) => dutyOfAlloc(a) === "Runner").map((a) => shiftKeyOf(a.shift || ""))) : new Set<string>();
            const runnerBlock = duty !== "Runner" ? ""
              : sh.key === "Split" ? (runnerKeys.has("Morning") || runnerKeys.has("Afternoon") ? "Not with AM / PM runners: remove them to use one split runner." : assigned.length ? "One split runner covers the day." : "")
              : runnerKeys.has("Split") ? "The split runner covers the day." : "";
            const shown = runnerBlock ? [] : candidates;
            return (
              <div key={sh.key} className={`rounded-xl border p-2.5 ${runnerBlock && !assigned.length ? "border-dashed border-slate-200 bg-white opacity-70" : "border-slate-100 bg-slate-50/60"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-black text-slate-700 flex items-center gap-1">
                    {sh.key === "Morning" ? <Sun size={12} className="text-amber-500" /> : sh.key === "Split" ? <Clock size={12} className="text-indigo-500" /> : <Sunset size={12} className="text-orange-500" />}
                    {sh.label}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">{shiftTimeFor(duty, sh.key)}</span>
                </div>

                <div className="space-y-1">
                  {assigned.map((a) => {
                    const h = hostById(a.host_id);
                    const contact = h?.mvpn || h?.company_mobile || "";
                    const off = offReason(a.host_id);
                    return (
                      <div key={`${a.host_id}-${a.shift}`} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${off ? "bg-rose-50 border-rose-300" : "bg-white border-slate-200"}`}
                        title={off ? "Off today: remove from duty. Not printed on the sheet." : undefined}>
                        <span className="w-6 h-6 rounded-md bg-slate-800 text-white flex items-center justify-center text-[10px] font-black shrink-0">{(h ? getHostLabel(h) : "?").charAt(0)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-slate-800 truncate">{h ? getHostLabel(h) : "Unknown host"}</p>
                          <div className="flex items-center gap-1.5">{contact && <span className="text-[9px] font-bold text-slate-400">{contact}</span>}{getLeaveBadge(a.host_id)}</div>
                          {off && <p className="text-[9px] font-black text-rose-700 flex items-center gap-1"><AlertTriangle size={9} /> Off today: remove from duty</p>}
                        </div>
                        <button onClick={() => handleRemoveAllocation(a)} className="p-1 text-slate-300 hover:text-rose-600" title="Remove"><X size={14} /></button>
                      </div>
                    );
                  })}
                </div>

                {joined && candidates.length === 0 && assigned.length === 0 && (
                  <p className="mt-1.5 text-[10px] font-semibold text-slate-400">No one on Public Area {sh.key === "Morning" ? "Morning BOH" : "afternoon"} yet: allocate them above first.</p>
                )}
                {runnerBlock && <p className="mt-1 text-[10px] font-semibold text-slate-400">{runnerBlock}</p>}
                {shown.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {shown.map((h) => {
                      const off = offReason(h.id);
                      const leave = getHostLeaveRecord(h.id);
                      const usual = defaultDutyForHost(h) === duty;
                      return (
                        <button key={h.id} onClick={() => joined ? (off ? toast.error(`${getHostLabel(h)} is off today (${off})`) : executeAssignment(h.id, sh.key, duty, false)) : requestAssignDuty(h, sh.key, duty)} title={off ? `Off today: ${off}` : joined ? "Keeps their Public Area duty" : undefined}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-0.5 transition-colors ${
                            off ? "bg-rose-50 border-rose-200 text-rose-400 line-through cursor-not-allowed" : usual ? "bg-white border-slate-300 text-slate-700 hover:bg-slate-800 hover:text-white" : "bg-transparent border-dashed border-slate-300 text-slate-400 hover:text-slate-700 hover:border-slate-400"
                          }`}>
                          <Plus size={9} /> {getHostLabel(h)}{(leave || off) && <span className="text-[8px] font-black ml-0.5 no-underline">{leave?.leave_type || off?.split(" ")[0]}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-6">
      
      {/* HEADER BAR */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl border border-orange-100">
            <Car size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800">Runners, Luggage & Step</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              Three separate duties — pick a person under each shift
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setSearchHostTerm("");
            setShowDraftModal(true);
          }}
          className="flex items-center gap-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm"
        >
          <UserPlus size={14} />
          <span>Add host to pool</span>
        </button>
      </div>

      {/* POOL DRAWER */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <UserCheck size={16} className="text-[#ea580c]" /> 
              Pool
            </span>
            <span className="text-[10px] font-black bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
              {currentPool.length} Hosts
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold">
            💡 Click any host pill to set leave/off & return date
          </span>
        </div>

        <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto p-1">
          {currentPool.map((h) => {
            const isAssigned = dutyAllocs.some((a) => a.host_id === h.id);
            const leave = getHostLeaveRecord(h.id);

            return (
              <div
                key={h.id}
                onClick={() => {
                  setSelectedHostForLeave(h);
                  setLeaveForm({
                    leave_type: leave?.leave_type || "AL",
                    start_date: leave?.start_date || selectedDate,
                    end_date: leave?.end_date || selectedDate,
                  });
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all shadow-sm ${
                  leave
                    ? "bg-rose-50/80 border-rose-300 text-rose-900"
                    : isAssigned
                    ? "bg-orange-50 border-orange-400 text-orange-900"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span>{getHostLabel(h)}</span>
                {getLeaveBadge(h.id)}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFromPool(h.id);
                  }}
                  className="text-slate-400 hover:text-rose-600 ml-1"
                  title="Remove from pool"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* THREE DUTIES, EACH WITH ITS SHIFTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {RIDER_DUTIES.map(renderDutyColumn)}
      </div>

      {/* MODAL: SET LEAVE & RETURN DATE */}
      {selectedHostForLeave && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col p-5 gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-50 text-rose-700 rounded-lg">
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    Set Leave for {getHostLabel(selectedHostForLeave)}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                    Persists across days until Return Date
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedHostForLeave(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-black"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Status / Leave Type</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {LEAVE_TYPES.map((lt) => (
                    <button
                      key={lt.value}
                      type="button"
                      onClick={() => setLeaveForm({ ...leaveForm, leave_type: lt.value })}
                      className={`p-2 rounded-xl text-xs font-black border text-left transition-all ${
                        leaveForm.leave_type === lt.value
                          ? "bg-[#ea580c] text-white border-[#ea580c] shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {lt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Start Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#ea580c]"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Return / End Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#ea580c]"
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
              {getHostLeaveRecord(selectedHostForLeave.id) ? (
                <button
                  type="button"
                  onClick={() => handleRemoveLeave(getHostLeaveRecord(selectedHostForLeave.id)?.id)}
                  className="text-rose-600 hover:text-rose-800 text-xs font-black"
                >
                  Clear Active Leave
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedHostForLeave(null)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLeave}
                  className="bg-[#ea580c] hover:bg-[#c2410c] text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-sm"
                >
                  Apply Leave
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BORROW HOST TO POOL */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  Add Host to Riders Pool
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                  Select from any resort host
                </p>
              </div>
              <button
                onClick={() => setShowDraftModal(false)}
                className="text-slate-400 hover:text-slate-600 font-black text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search staff name..."
                  value={searchHostTerm}
                  onChange={(e) => setSearchHostTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#ea580c]"
                />
              </div>
            </div>

            <div className="p-3 overflow-y-auto space-y-2 flex-1">
              {hosts
                .filter((h) => {
                  if (!searchHostTerm.trim()) return true;
                  const term = searchHostTerm.toLowerCase();
                  return (
                    h.full_name.toLowerCase().includes(term) ||
                    (h.nicknames || "").toLowerCase().includes(term) ||
                    (h.sub_department || "").toLowerCase().includes(term)
                  );
                })
                .map((h) => {
                  const alreadyInPool = currentPool.some((p) => p.id === h.id);

                  return (
                    <div
                      key={h.id}
                      onClick={() => {
                        if (!alreadyInPool) handleAddToPool(h.id);
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                        alreadyInPool
                          ? "bg-slate-100 opacity-60 cursor-not-allowed border-slate-200"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200 cursor-pointer"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-black text-slate-800">{getHostLabel(h)}</p>
                        <span className="text-[9px] text-slate-400 font-bold">
                          {h.sub_department || h.role || "Host"}
                        </span>
                      </div>

                      <span className="text-[10px] font-black text-[#ea580c]">
                        {alreadyInPool ? "In Pool" : "+ Add to Pool"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* CONFLICT MODAL */}
      {conflictModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-5 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  {conflictModal.leaveWarning ? "Leave / Off Notice" : "Allocation Conflict"}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                  Confirm assignment
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 leading-relaxed space-y-2">
              <p>
                <span className="font-black text-[#ea580c]">{getHostLabel(conflictModal.host)}</span>
              </p>

              {conflictModal.leaveWarning && (
                <div className="text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                  ⚠️ This host is recorded as <strong>{conflictModal.leaveWarning}</strong>.
                </div>
              )}

              {conflictModal.existingAreas.length > 0 && (
                <p className="text-slate-600">
                  Already assigned to: <span className="font-black text-amber-700 underline">{conflictModal.existingAreas.join(", ")}</span>.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {conflictModal.existingAreas.length > 0 ? (
                <>
                  <button
                    onClick={() =>
                      executeAssignment(
                        conflictModal.host.id,
                        conflictModal.targetShift,
                        conflictModal.targetTask,
                        true
                      )
                    }
                    className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm"
                  >
                    Move to RIDERS (Remove from {conflictModal.existingAreas.join(", ")})
                  </button>

                  <button
                    onClick={() =>
                      executeAssignment(
                        conflictModal.host.id,
                        conflictModal.targetShift,
                        conflictModal.targetTask,
                        false
                      )
                    }
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-black transition-all"
                  >
                    Keep in Both Areas
                  </button>
                </>
              ) : (
                <button
                  onClick={() =>
                    executeAssignment(
                      conflictModal.host.id,
                      conflictModal.targetShift,
                      conflictModal.targetTask,
                      false
                    )
                  }
                  className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm"
                >
                  Assign
                </button>
              )}

              <button
                onClick={() => setConflictModal(null)}
                className="w-full text-slate-400 hover:text-slate-600 py-1 text-xs font-bold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
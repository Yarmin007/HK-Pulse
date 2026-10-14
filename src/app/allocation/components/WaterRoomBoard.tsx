"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Waves, 
  Sun, 
  Moon, 
  Clock, 
  ShieldCheck, 
  UserPlus, 
  Trash2, 
  Search, 
  AlertTriangle, 
  UserCheck, 
  Calendar, 
  Plus,
  Plane
} from "lucide-react";
import toast from "react-hot-toast";

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

interface WaterRoomBoardProps {
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

export default function WaterRoomBoard({
  hosts,
  setHosts,
  allocations,
  setAllocations,
  setIsDirty,
  selectedDate,
}: WaterRoomBoardProps) {
  const [activeLeaveRecords, setActiveLeaveRecords] = useState<ActiveLeaveRecord[]>([]);

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

  // Water Room Pool directly loaded from database sub_department
  const currentPool = React.useMemo(() => {
    return hosts.filter((h) => {
      const sub = (h.sub_department || "").toLowerCase();
      const role = (h.role || "").toLowerCase();
      return sub.includes("water") || sub.includes("pool") || role.includes("water") || role.includes("pool");
    });
  }, [hosts]);

  const getHostLabel = (h: Host) => {
    return h.nicknames ? h.nicknames.split(",")[0].trim() : h.full_name;
  };

  const getHostLeaveRecord = (hostId: string) => {
    const targetHost = hosts.find((h) => h.id === hostId);
    return activeLeaveRecords.find((l) => 
      l.host_id === hostId || (targetHost?.host_id && l.host_id === targetHost.host_id)
    );
  };

  const getLeaveBadge = (hostId: string) => {
    const rec = getHostLeaveRecord(hostId);
    if (!rec) return null;

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

  // Permanently persists host in Water Room pool in DB and updates state instantly
  const handleAddToPool = async (hostId: string) => {
    if (setHosts) {
      setHosts((prev: Host[]) =>
        prev.map((h) => (h.id === hostId ? { ...h, sub_department: "Water Room" } : h))
      );
    }

    const { error } = await supabase
      .from("hsk_hosts")
      .update({ sub_department: "Water Room" })
      .eq("id", hostId);

    if (error) {
      toast.error("Could not save to pool: " + error.message);
    } else {
      toast.success("Host added to Water Room pool!");
    }

    setShowDraftModal(false);
  };

  // Resets host back to general if removed from pool
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

    setAllocations(allocations.filter((a) => !(a.host_id === hostId && a.area === "water")));
    setIsDirty(true);
    toast.success("Host removed from pool");
  };

  const requestAssignDuty = (host: Host, shift: string, task: string) => {
    const leave = getHostLeaveRecord(host.id);
    const existingOtherAllocs = allocations.filter((a) => a.host_id === host.id && a.area !== "water");

    if (leave || existingOtherAllocs.length > 0) {
      const existingAreas = Array.from(new Set(existingOtherAllocs.map((a) => a.area.toUpperCase())));
      setConflictModal({
        host,
        targetArea: "water",
        targetShift: shift,
        targetTask: task,
        existingAreas,
        leaveWarning: leave ? `${leave.leave_type} (till ${leave.end_date})` : undefined,
      });
      return;
    }

    executeAssignment(host.id, shift, task, false);
  };

  const executeAssignment = (
    hostId: string,
    shift: string,
    task: string,
    removeOtherAreas: boolean
  ) => {
    let cleanAllocs = [...allocations];

    if (removeOtherAreas) {
      cleanAllocs = cleanAllocs.filter((a) => a.host_id !== hostId);
    }

    const alreadyThere = cleanAllocs.some(
      (a) => a.host_id === hostId && a.area === "water" && a.shift === shift
    );

    if (!alreadyThere) {
      cleanAllocs.push({
        host_id: hostId,
        area: "water",
        shift,
        task_details: task,
        report_date: selectedDate,
      });
    }

    setAllocations(cleanAllocs);
    setIsDirty(true);
    setConflictModal(null);
  };

  const handleUpdateVillas = (hostId: string, villasStr: string) => {
    const updated = allocations.map((a) => {
      if (a.area === "water" && a.shift === "Morning" && a.host_id === hostId) {
        return { ...a, task_details: villasStr.replace(/,/g, " ") };
      }
      return a;
    });
    setAllocations(updated);
    setIsDirty(true);
  };

  const handleRemoveAllocation = (hostId: string, shift: string) => {
    const updated = allocations.filter(
      (a) => !(a.host_id === hostId && a.area === "water" && a.shift === shift)
    );
    setAllocations(updated);
    setIsDirty(true);
  };

  const morningAllocs = allocations.filter((a) => a.area === "water" && (a.shift || "").toLowerCase().includes("morning"));
  const nightAllocs = allocations.filter((a) => a.area === "water" && (a.shift || "").toLowerCase().includes("night"));
  const modAllocs = allocations.filter((a) => a.area === "water" && (a.shift || "").toLowerCase().includes("mod"));
  const continueAllocs = allocations.filter((a) => a.area === "water" && (a.shift || "").toLowerCase().includes("continue"));

  const morningAssignedHostIds = morningAllocs.map((a) => a.host_id);
  const availableForMorning = currentPool.filter((h) => !morningAssignedHostIds.includes(h.id));

  const renderSimpleDutySlot = (title: string, icon: React.ReactNode, shiftName: string, allocList: Allocation[], badgeColor: string) => {
    const assignedIds = allocList.map((a) => a.host_id);
    const available = currentPool.filter((h) => !assignedIds.includes(h.id));

    return (
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${badgeColor}`}>
            {icon} {title}
          </span>
          <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {allocList.length} assigned
          </span>
        </div>

        <div className="space-y-1.5 min-h-[40px]">
          {allocList.length === 0 ? (
            <div className="text-center py-2 text-[10px] font-bold text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No host assigned
            </div>
          ) : (
            allocList.map((a) => {
              const h = hosts.find((host) => host.id === a.host_id);
              const name = h ? getHostLabel(h) : "Unknown Host";
              const contact = h?.mvpn || h?.company_mobile || h?.personal_mobile || "";

              return (
                <div
                  key={a.host_id}
                  className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-lg bg-[#0284c7] text-white flex items-center justify-center font-black text-[10px]">
                      {name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-800">{name}</p>
                      <div className="flex items-center gap-1.5">
                        {contact && <span className="text-[9px] font-bold text-slate-400">{contact}</span>}
                        {getLeaveBadge(a.host_id)}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveAllocation(a.host_id, shiftName)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
          <span className="text-[9px] font-black uppercase text-slate-400">Click to assign:</span>
          {available.length === 0 ? (
            <span className="text-[10px] text-slate-400 font-bold italic">All pool members assigned</span>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto">
              {available.map((h) => {
                const leave = getHostLeaveRecord(h.id);
                return (
                  <button
                    key={h.id}
                    onClick={() => requestAssignDuty(h, shiftName, shiftName)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 shadow-sm ${
                      leave
                        ? "bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100"
                        : "bg-slate-100 hover:bg-[#0284c7] hover:text-white border-slate-200 text-slate-700"
                    }`}
                  >
                    <Plus size={10} />
                    <span>{getHostLabel(h)}</span>
                    {leave && <span className="text-[8px] bg-rose-200 px-1 rounded font-black">{leave.leave_type}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-700 rounded-xl border border-sky-100">
            <Waves size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800">Water Room & Pool Operations</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              Morning Villa Allocations, Night Duty, MOD & Continue Shift Coverage
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setSearchHostTerm("");
            setShowDraftModal(true);
          }}
          className="flex items-center gap-1.5 bg-[#0284c7] hover:bg-[#0369a1] text-white px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm"
        >
          <UserPlus size={14} />
          <span>Add Host to Pool</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <UserCheck size={16} className="text-[#0284c7]" /> 
              Water Room Staff Pool
            </span>
            <span className="text-[10px] font-black bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full">
              {currentPool.length} Hosts
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold">
            💡 Click any host pill to set leave/off & return date
          </span>
        </div>

        <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto p-1">
          {currentPool.map((h) => {
            const isAssigned = allocations.some((a) => a.host_id === h.id && a.area === "water");
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
                    ? "bg-sky-50 border-sky-400 text-sky-900"
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-amber-700 tracking-wider flex items-center gap-1.5">
                <Sun size={16} /> Morning Duty (All On Duty Staff)
              </span>
              <span className="text-[10px] font-black bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full">
                {morningAllocs.length} on duty
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-bold">
              Assign villas/zones separated by spaces
            </span>
          </div>

          <div className="space-y-3 min-h-[140px]">
            {morningAllocs.length === 0 ? (
              <div className="text-center py-8 text-xs font-bold text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No water room attendants assigned for morning duty yet. Click staff below to add.
              </div>
            ) : (
              morningAllocs.map((a) => {
                const h = hosts.find((host) => host.id === a.host_id);
                const name = h ? getHostLabel(h) : "Unknown Host";
                const contact = h?.mvpn || h?.company_mobile || h?.personal_mobile || "";

                return (
                  <div
                    key={a.host_id}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-[200px]">
                      <div className="w-7 h-7 rounded-xl bg-sky-600 text-white flex items-center justify-center font-black text-xs">
                        {name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">{name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {contact && <span className="text-[9px] font-bold text-slate-400">{contact}</span>}
                          {getLeaveBadge(a.host_id)}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Assigned Villas / Area (e.g. 10 12 14 or Jetty A)"
                          value={a.task_details || ""}
                          onChange={(e) => handleUpdateVillas(a.host_id, e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#0284c7]"
                        />
                      </div>

                      <button
                        onClick={() => handleRemoveAllocation(a.host_id, "Morning")}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white transition-colors"
                        title="Remove attendant"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase text-slate-400">
              Click available staff to assign to Morning Duty:
            </span>
            {availableForMorning.length === 0 ? (
              <span className="text-xs text-slate-400 font-bold italic">All pool members assigned to morning duty</span>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
                {availableForMorning.map((h) => {
                  const leave = getHostLeaveRecord(h.id);
                  return (
                    <button
                      key={h.id}
                      onClick={() => requestAssignDuty(h, "Morning", "")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-sm ${
                        leave
                          ? "bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100"
                          : "bg-slate-100 hover:bg-[#0284c7] hover:text-white border-slate-200 text-slate-700"
                      }`}
                    >
                      <Plus size={12} />
                      <span>{getHostLabel(h)}</span>
                      {leave && <span className="text-[8px] bg-rose-200 px-1 rounded font-black">{leave.leave_type}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 flex flex-col">
          {renderSimpleDutySlot("Night Duty", <Moon size={14} />, "Night", nightAllocs, "text-indigo-700")}
          {renderSimpleDutySlot("MOD Duty", <ShieldCheck size={14} />, "MOD", modAllocs, "text-emerald-700")}
          {renderSimpleDutySlot("Continue Shift", <Clock size={14} />, "Continue", continueAllocs, "text-amber-700")}
        </div>
      </div>

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
                          ? "bg-[#0284c7] text-white border-[#0284c7] shadow-sm"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#0284c7]"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Return / End Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#0284c7]"
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
                  className="bg-[#0284c7] hover:bg-[#0369a1] text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-sm"
                >
                  Apply Leave
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDraftModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  Add Host to Water Room Pool
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#0284c7]"
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

                      <span className="text-[10px] font-black text-[#0284c7]">
                        {alreadyInPool ? "In Pool" : "+ Add to Pool"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

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
                <span className="font-black text-[#0284c7]">{getHostLabel(conflictModal.host)}</span>
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
                    className="w-full bg-[#0284c7] hover:bg-[#0369a1] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm"
                  >
                    Move to WATER ROOM (Remove from {conflictModal.existingAreas.join(", ")})
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
                  className="w-full bg-[#0284c7] hover:bg-[#0369a1] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm"
                >
                  Assign Anyway (Override Leave)
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
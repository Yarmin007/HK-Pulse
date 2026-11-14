"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Trees, 
  Sun, 
  Crown, 
  MapPin, 
  UserPlus, 
  Trash2, 
  Search, 
  AlertTriangle, 
  UserCheck, 
  Calendar, 
  Plus, 
  Plane,
  ClipboardPaste,
  CheckCircle2,
  ChevronDown,
  X,
  Sparkles
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

interface GardeningBoardProps {
  hosts: Host[];
  setHosts?: React.Dispatch<React.SetStateAction<any[]>>;
  allocations: Allocation[];
  setAllocations: React.Dispatch<React.SetStateAction<Allocation[]>>;
  activeLeaves?: any[];
  setIsDirty: (val: boolean) => void;
  selectedDate: string;
}

interface ParsedGardeningItem {
  rawName: string;
  matchedHost: Host | null;
  type: "DIC" | "DUTY" | "OFF";
  dutyArea?: string;
  label: string;
  isManuallyChanged?: boolean;
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

// Clean whatsapp hidden symbols & zero-width spaces
const sanitizeText = (txt: string) => {
  return txt.replace(/[\u200B-\u200F\u2060-\u206F\uFEFF\u00A0]/g, " ");
};

// --- SEARCHABLE COMBOBOX COMPONENT FOR CONNECTING STAFF (NICKNAMES HIDDEN) ---
function HostSearchSelect({
  selectedHost,
  allHosts,
  poolHosts,
  onSelect,
}: {
  selectedHost: Host | null;
  allHosts: Host[];
  poolHosts: Host[];
  onSelect: (hostId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(selectedHost?.full_name || "");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selectedHost?.full_name || "");
  }, [selectedHost]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery(selectedHost?.full_name || "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedHost]);

  const cleanQuery = query.toLowerCase().trim();

  const filteredPool = poolHosts.filter((h) =>
    h.full_name.toLowerCase().includes(cleanQuery)
  );
  const filteredOther = allHosts
    .filter((h) => !poolHosts.some((p) => p.id === h.id))
    .filter((h) => h.full_name.toLowerCase().includes(cleanQuery));

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder="Type staff name..."
          className={`w-full py-1.5 pl-2.5 pr-7 rounded-xl text-xs font-bold outline-none border transition-colors ${
            selectedHost
              ? "bg-white border-slate-300 text-slate-800 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500"
              : "bg-rose-50 border-rose-300 text-rose-800 placeholder:text-rose-400"
          }`}
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
        >
          <ChevronDown size={13} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
          {filteredPool.length === 0 && filteredOther.length === 0 ? (
            <div className="p-2.5 text-[11px] text-slate-400 font-bold text-center">
              No staff found matching &quot;{query}&quot;
            </div>
          ) : (
            <>
              {filteredPool.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
                    Gardening Team Pool
                  </div>
                  {filteredPool.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        onSelect(h.id);
                        setQuery(h.full_name);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-xs font-bold text-slate-800 flex items-center justify-between transition-colors"
                    >
                      <span>{h.full_name}</span>
                      {selectedHost?.id === h.id && (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {filteredOther.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-400">
                    Other Resort Staff
                  </div>
                  {filteredOther.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        onSelect(h.id);
                        setQuery(h.full_name);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-xs font-bold text-slate-700 flex items-center justify-between transition-colors"
                    >
                      <span>{h.full_name}</span>
                      {selectedHost?.id === h.id && (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function GardeningBoard({
  hosts,
  setHosts,
  allocations,
  setAllocations,
  setIsDirty,
  selectedDate,
}: GardeningBoardProps) {
  const [activeLeaveRecords, setActiveLeaveRecords] = useState<ActiveLeaveRecord[]>([]);

  // Leave Modal State
  const [selectedHostForLeave, setSelectedHostForLeave] = useState<Host | null>(null);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "AL",
    start_date: selectedDate,
    end_date: selectedDate,
  });

  // Add Host Modal
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

  // --- AUTO ROSTER IMPORT STATE ---
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [rosterRawText, setRosterRawText] = useState("");
  const [parsedSchedule, setParsedSchedule] = useState<{
    detectedDate: string;
    dicHost: Host | null;
    rawDicName?: string;
    items: ParsedGardeningItem[];
    activities: string[];
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

  // Gardening Team Pool
  const currentPool = React.useMemo(() => {
    return hosts.filter((h) => {
      const sub = (h.sub_department || "").toLowerCase();
      const role = (h.role || "").toLowerCase();
      return (
        sub.includes("garden") || 
        sub.includes("landscap") || 
        role.includes("garden") || 
        role.includes("landscap")
      );
    });
  }, [hosts]);

  const getHostLabel = (h: Host) => {
    return h.full_name;
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

  // --- SAFE & ACCURATE MATCHER (GARDENING POOL FIRST) ---
  const findMatchingHost = (rawSearch: string): Host | null => {
    if (!rawSearch) return null;
    const cleanSearch = rawSearch.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanSearch.length < 2) return null;

    const candidateLists = [currentPool, hosts];

    for (const pool of candidateLists) {
      // 1. Exact match on clean full name
      for (const h of pool) {
        const fullClean = (h.full_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (fullClean && fullClean === cleanSearch) return h;
      }

      // 2. Exact match on stored nicknames (non-empty)
      for (const h of pool) {
        if (!h.nicknames) continue;
        const nicks = h.nicknames
          .toLowerCase()
          .split(",")
          .map((n) => n.trim().replace(/[^a-z0-9]/g, ""))
          .filter((n) => n.length >= 2);

        if (nicks.includes(cleanSearch)) return h;
      }

      // 3. Name abbreviation matching (e.g., "M Haneef" -> "Mohamed Haneef")
      for (const h of pool) {
        const parts = (h.full_name || "").toLowerCase().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          const firstInitialLast = `${parts[0].charAt(0)}${parts[parts.length - 1]}`;
          if (cleanSearch === firstInitialLast) return h;
          if (cleanSearch === parts[parts.length - 1] && parts[parts.length - 1].length >= 3) return h;
        }
      }

      // 4. Safe word match (at least 3 characters)
      if (cleanSearch.length >= 3) {
        for (const h of pool) {
          const full = (h.full_name || "").toLowerCase();
          const words = full.split(/\s+/);
          if (words.some((w) => w === cleanSearch)) return h;
        }
      }
    }

    return null;
  };

  // --- SMART GARDENING ROSTER PARSER ---
  const handleParseGardeningRoster = () => {
    if (!rosterRawText.trim()) {
      toast.error("Please paste the roster text first");
      return;
    }

    let text = sanitizeText(rosterRawText);

    // Rule: IGNORE CASUAL GROUP (Truncate everything from "Casual Group" onwards)
    const casualMatch = text.search(/\bcasual\s+group\b/i);
    if (casualMatch !== -1) {
      text = text.substring(0, casualMatch);
    }

    // 1. Extract Target Date
    let detectedDate = selectedDate;
    const dateMatch = text.match(/(\d{1,2})[\.\/\-]\s*(\d{1,2})[\.\/\-]\s*(\d{2,4})/);
    if (dateMatch) {
      const d = dateMatch[1].padStart(2, "0");
      const m = dateMatch[2].padStart(2, "0");
      let y = dateMatch[3].trim();
      if (y.length === 2) y = `20${y}`;
      detectedDate = `${y}-${m}-${d}`;
    }

    // 2. Extract Duty In-Charge (DIC)
    let dicHost: Host | null = null;
    let rawDicName = "";
    const dicMatch = text.match(/duty\s+in[\s\-]*charge\s*[-:]\s*(.+)/i);
    if (dicMatch) {
      rawDicName = dicMatch[1].split("\n")[0].trim();
      dicHost = findMatchingHost(rawDicName);
    }

    // 3. Extract Days Off
    const offMatch = text.match(/\boff\s*:\s*(.+)/i);
    const offNames: string[] = [];
    if (offMatch) {
      const offLine = offMatch[1].split("\n")[0].trim();
      const rawParts = offLine.split(/[,&]|\band\b/i);
      rawParts.forEach((p) => {
        const cn = p.trim();
        if (cn) offNames.push(cn);
      });
    }

    // 4. Extract Activities
    const activities: string[] = [];
    const actMatch = text.match(/activities\s*:\s*([\s\S]*?)(?=\boff\s*:|\bcasual\b|$)/i);
    if (actMatch) {
      actMatch[1].split("\n").forEach((l) => {
        const clean = l.replace(/^[•\-\*\d\.\s]+/, "").trim();
        if (clean && !clean.toUpperCase().startsWith("OFF")) {
          activities.push(clean);
        }
      });
    }

    // 5. Extract Duty Areas (Section before Activities or Off)
    let contentBeforeAct = text;
    if (actMatch && actMatch.index !== undefined) {
      contentBeforeAct = text.substring(0, actMatch.index);
    } else if (offMatch && offMatch.index !== undefined) {
      contentBeforeAct = text.substring(0, offMatch.index);
    }

    const items: ParsedGardeningItem[] = [];

    // Add DIC as first item
    if (rawDicName) {
      items.push({
        rawName: rawDicName,
        matchedHost: dicHost,
        type: "DIC",
        dutyArea: "Duty In-Charge",
        label: "Duty In-Charge (DIC)",
      });
    }

    // Parse Duty Area lines
    contentBeforeAct.split("\n").forEach((line) => {
      const l = line.trim();
      if (!l) return;
      const upper = l.toUpperCase();
      if (
        upper.includes("DUTY ROSTER") ||
        upper.includes("DUTY INCHARGE") ||
        upper.includes("DUTY IN-CHARGE") ||
        upper.includes("MORNING DUTY") ||
        (dateMatch && l.includes(dateMatch[0]))
      ) {
        return;
      }

      // Match area line pattern (e.g. "1. Spa cleaning: Haidher, Hussainka, Noor" or "SHELL Area - Nizaam")
      const areaMatch = l.match(/^(?:\d+[\.\-\)]\s*)?([^:\-]+)\s*[:\-]\s*(.+)$/);
      if (areaMatch) {
        const areaTitle = areaMatch[1].trim();
        const namesPart = areaMatch[2].trim();

        if (areaTitle.toUpperCase() === "OFF" || areaTitle.toUpperCase().includes("DUTY INCHARGE")) {
          return;
        }

        const rawPeople = namesPart.split(/[,&]|\band\b/i);
        rawPeople.forEach((p) => {
          const personName = p.trim();
          // Filter out phrases like "3 ladies +casual", "casual", "ladies"
          if (/\d+\s*ladies|\bcasual\b/i.test(personName)) return;
          if (!personName) return;

          items.push({
            rawName: personName,
            matchedHost: findMatchingHost(personName),
            type: "DUTY",
            dutyArea: areaTitle,
            label: areaTitle,
          });
        });
      }
    });

    // Add Offs
    offNames.forEach((name) => {
      items.push({
        rawName: name,
        matchedHost: findMatchingHost(name),
        type: "OFF",
        dutyArea: "Day Off",
        label: "Day Off (OFF)",
      });
    });

    setParsedSchedule({
      detectedDate,
      dicHost,
      rawDicName,
      items,
      activities,
    });
  };

  const handleUpdateMatchedHost = (index: number, hostId: string) => {
    if (!parsedSchedule) return;
    const selected = hosts.find((h) => h.id === hostId) || null;
    const updated = [...parsedSchedule.items];
    updated[index] = {
      ...updated[index],
      matchedHost: selected,
      isManuallyChanged: true,
    };
    setParsedSchedule({ ...parsedSchedule, items: updated });
  };

  // --- CONFIRM, SAVE ASSIGNMENTS & SILENTLY REMEMBER NICKNAMES ---
  const handleConfirmGardeningSchedule = async () => {
    if (!parsedSchedule) return;

    try {
      // The board only holds the day being viewed. A roster dated for another day
      // is applied to the viewed day (after asking), never mixed in under its own date.
      if (parsedSchedule.detectedDate && parsedSchedule.detectedDate !== selectedDate &&
          !confirm(`This roster is dated ${parsedSchedule.detectedDate}, but you are viewing ${selectedDate}.\n\nApply it to ${selectedDate}?`)) {
        return;
      }
      const targetDate = selectedDate;
      const newAllocs: Allocation[] = [...allocations.filter((a) => a.report_date !== targetDate || a.area !== "gardening")];

      for (const item of parsedSchedule.items) {
        if (!item.matchedHost) continue;

        const host = item.matchedHost;
        const rawName = item.rawName.trim();

        // 1. SILENT NICKNAME MEMORY
        const existingNicks = (host.nicknames || "").split(",").map((n) => n.trim().toLowerCase());
        const isDifferentName = host.full_name.toLowerCase() !== rawName.toLowerCase();

        if (rawName.length >= 2 && !existingNicks.includes(rawName.toLowerCase()) && isDifferentName) {
          const updatedNicks = host.nicknames ? `${host.nicknames}, ${rawName}` : rawName;

          await supabase
            .from("hsk_hosts")
            .update({ nicknames: updatedNicks })
            .eq("id", host.id);

          if (setHosts) {
            setHosts((prev: Host[]) =>
              prev.map((h) => (h.id === host.id ? { ...h, nicknames: updatedNicks } : h))
            );
          }
        }

        // 2. Commit DIC
        if (item.type === "DIC") {
          newAllocs.push({
            host_id: host.id,
            area: "gardening",
            shift: "Incharge",
            task_details: "Duty In-Charge",
            report_date: targetDate,
          });
        }

        // 3. Commit Duty Area
        if (item.type === "DUTY" && item.dutyArea) {
          newAllocs.push({
            host_id: host.id,
            area: "gardening",
            shift: "Morning",
            task_details: item.dutyArea,
            report_date: targetDate,
          });
        }

        // 4. Commit Day Off (OFF)
        if (item.type === "OFF") {
          const hostKey = String(host.id || host.host_id || "");
          const hostNameVal = host.full_name;

          await supabase
            .from("hsk_leave_requests")
            .delete()
            .eq("host_id", hostKey)
            .lte("start_date", targetDate)
            .gte("end_date", targetDate);

          await supabase.from("hsk_leave_requests").insert([{
            host_id: hostKey,
            host_name: hostNameVal,
            leave_type: "OFF",
            start_date: targetDate,
            end_date: targetDate,
            total_days: 1,
            days_count: 1,
            status: "Approved",
            reason: "Auto scheduled Day Off from Gardening Roster",
          }]);
        }
      }

      setAllocations(newAllocs);
      setIsDirty(true);
      fetchActiveLeaves();
      setShowRosterModal(false);
      setParsedSchedule(null);
      setRosterRawText("");
      toast.success(`Gardening Roster for ${targetDate} applied!`);
    } catch (err: any) {
      console.error("Gardening confirm error:", err);
      toast.error("Failed to commit schedule: " + (err?.message || "Unknown error"));
    }
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

  const handleAddToPool = async (hostId: string) => {
    if (setHosts) {
      setHosts((prev: Host[]) =>
        prev.map((h) => (h.id === hostId ? { ...h, sub_department: "Gardening" } : h))
      );
    }

    const { error } = await supabase
      .from("hsk_hosts")
      .update({ sub_department: "Gardening" })
      .eq("id", hostId);

    if (error) {
      toast.error("Could not save to pool: " + error.message);
    } else {
      toast.success("Host added to Gardening pool!");
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

    setAllocations(allocations.filter((a) => !(a.host_id === hostId && a.area === "gardening")));
    setIsDirty(true);
    toast.success("Host removed from pool");
  };

  const currentDicAlloc = allocations.find(
    (a) => a.area === "gardening" && (a.shift || "").toLowerCase().includes("incharge")
  );

  const handleSetDic = (hostId: string) => {
    let cleanAllocs = allocations.filter(
      (a) => !(a.area === "gardening" && (a.shift || "").toLowerCase().includes("incharge"))
    );

    if (hostId) {
      cleanAllocs.push({
        host_id: hostId,
        area: "gardening",
        shift: "Incharge",
        task_details: "Duty In-Charge",
        report_date: selectedDate,
      });
    }

    setAllocations(cleanAllocs);
    setIsDirty(true);
  };

  const requestAssignDuty = (host: Host, area: string, shift: string, task: string) => {
    const leave = getHostLeaveRecord(host.id);
    const existingOtherAllocs = allocations.filter((a) => a.host_id === host.id && a.area !== area);

    if (leave || existingOtherAllocs.length > 0) {
      const existingAreas = Array.from(new Set(existingOtherAllocs.map((a) => a.area.toUpperCase())));
      setConflictModal({
        host,
        targetArea: area,
        targetShift: shift,
        targetTask: task,
        existingAreas,
        leaveWarning: leave ? `${leave.leave_type} (till ${leave.end_date})` : undefined,
      });
      return;
    }

    executeAssignment(host.id, area, shift, task, false);
  };

  const executeAssignment = (
    hostId: string,
    area: string,
    shift: string,
    task: string,
    removeOtherAreas: boolean
  ) => {
    let cleanAllocs = [...allocations];

    if (removeOtherAreas) {
      cleanAllocs = cleanAllocs.filter((a) => a.host_id !== hostId);
    }

    const alreadyThere = cleanAllocs.some(
      (a) => a.host_id === hostId && a.area === area && a.shift === shift
    );

    if (!alreadyThere) {
      cleanAllocs.push({
        host_id: hostId,
        area,
        shift,
        task_details: task,
        report_date: selectedDate,
      });
    }

    setAllocations(cleanAllocs);
    setIsDirty(true);
    setConflictModal(null);
  };

  const handleUpdateDutyArea = (hostId: string, areaDesc: string) => {
    const updated = allocations.map((a) => {
      if (a.area === "gardening" && a.shift === "Morning" && a.host_id === hostId) {
        return { ...a, task_details: areaDesc };
      }
      return a;
    });
    setAllocations(updated);
    setIsDirty(true);
  };

  const handleRemoveAllocation = (hostId: string, area: string, shift: string) => {
    const updated = allocations.filter(
      (a) => !(a.host_id === hostId && a.area === area && a.shift === shift)
    );
    setAllocations(updated);
    setIsDirty(true);
  };

  const morningAllocs = allocations.filter(
    (a) => a.area === "gardening" && (a.shift || "").toLowerCase().includes("morning")
  );
  const morningAssignedIds = morningAllocs.map((a) => a.host_id);
  const availableForMorning = currentPool.filter((h) => !morningAssignedIds.includes(h.id));

  return (
    <div className="w-full flex flex-col gap-6">
      
      {/* HEADER BAR */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
            <Trees size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800">Gardening & Landscaping Operations</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              Morning Duty Area Assignments & Supervisor In-Charge
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setRosterRawText("");
              setParsedSchedule(null);
              setShowRosterModal(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
          >
            <ClipboardPaste size={15} />
            <span>Import Gardening Roster</span>
          </button>

          <button
            onClick={() => {
              setSearchHostTerm("");
              setShowDraftModal(true);
            }}
            className="flex items-center gap-1.5 bg-[#059669] hover:bg-[#047857] text-white px-3 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
          >
            <UserPlus size={14} />
            <span>Add Host to Pool</span>
          </button>
        </div>
      </div>

      {/* POOL DRAWER */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <UserCheck size={16} className="text-[#059669]" /> 
              Gardening Staff Pool
            </span>
            <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
              {currentPool.length} Hosts
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold">
            💡 Click any host pill to set leave/off & return date
          </span>
        </div>

        <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto p-1">
          {currentPool.map((h) => {
            const isAssigned = allocations.some((a) => a.host_id === h.id && a.area === "gardening");
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
                    ? "bg-emerald-50 border-emerald-400 text-emerald-900"
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
                  className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer"
                  title="Remove from pool"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* SUPERVISOR IN-CHARGE (DIC) SELECTOR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
            <Crown size={18} />
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Gardening Duty In-Charge (DIC)
            </h3>
            <p className="text-[10px] text-slate-400 font-bold">
              Team leader responsible for morning deployment & daily attendance
            </p>
          </div>
        </div>

        <div className="w-full sm:w-72">
          <select
            value={currentDicAlloc ? currentDicAlloc.host_id : ""}
            onChange={(e) => handleSetDic(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs text-slate-700 outline-none focus:border-[#059669] cursor-pointer"
          >
            <option value="">-- Choose Duty In-Charge --</option>
            {currentPool.map((h) => {
              const leave = getHostLeaveRecord(h.id);
              const tag = leave ? ` [${leave.leave_type}]` : "";
              return (
                <option key={h.id} value={h.id}>
                  {getHostLabel(h)}{tag}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* MAIN MORNING DUTY BOARD WITH AREA ASSIGNMENTS */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase text-emerald-800 tracking-wider flex items-center gap-1.5">
              <Sun size={16} /> Morning Duty (06:30 - 15:00)
            </span>
            <span className="text-[10px] font-black bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full">
              {morningAllocs.length} gardeners on duty
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold">
            Specify landscaping area / focus zone for each attendant
          </span>
        </div>

        {/* Assigned Gardeners List */}
        <div className="space-y-3 min-h-[140px]">
          {morningAllocs.length === 0 ? (
            <div className="text-center py-8 text-xs font-bold text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              No gardeners assigned for morning duty yet. Click staff below or use &quot;Import Gardening Roster&quot;.
            </div>
          ) : (
            morningAllocs.map((a) => {
              const h = hosts.find((host) => host.id === a.host_id);
              const name = h ? getHostLabel(h) : "Unknown Host";
              const contact = h?.mvpn || h?.company_mobile || h?.personal_mobile || "";
              const isDic = currentDicAlloc && currentDicAlloc.host_id === a.host_id;

              return (
                <div
                  key={a.host_id}
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-[220px]">
                    <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-xs">
                      {name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-black text-slate-800">{name}</p>
                        {isDic && (
                          <span className="text-[8px] bg-amber-100 text-amber-800 font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Crown size={8} /> DIC
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {contact && <span className="text-[9px] font-bold text-slate-400">{contact}</span>}
                        {getLeaveBadge(a.host_id)}
                      </div>
                    </div>
                  </div>

                  {/* Dedicated Duty Area Input */}
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 relative">
                      <MapPin size={13} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Duty Area (e.g. Spa cleaning, Sip Sip, SHELL Area, BOH)"
                        value={a.task_details || ""}
                        onChange={(e) => handleUpdateDutyArea(a.host_id, e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#059669]"
                      />
                    </div>

                    <button
                      onClick={() => handleRemoveAllocation(a.host_id, "gardening", "Morning")}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white transition-colors cursor-pointer"
                      title="Remove gardener"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Click to add attendants to Morning Duty */}
        <div className="pt-3 border-t border-slate-100 flex flex-col gap-1.5">
          <span className="text-[10px] font-black uppercase text-slate-400">
            Click available staff to assign to Morning Duty:
          </span>
          {availableForMorning.length === 0 ? (
            <span className="text-xs text-slate-400 font-bold italic">All pool members deployed</span>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
              {availableForMorning.map((h) => {
                const leave = getHostLeaveRecord(h.id);
                return (
                  <button
                    key={h.id}
                    onClick={() => requestAssignDuty(h, "gardening", "Morning", "Landscaping Area")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                      leave
                        ? "bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100"
                        : "bg-slate-100 hover:bg-[#059669] hover:text-white border-slate-200 text-slate-700"
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

      {/* --- AUTO-DETECT GARDENING ROSTER IMPORT MODAL --- */}
      {showRosterModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-700 text-white rounded-xl shadow-sm">
                  <Trees size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-800">
                    Auto-Detect Gardening Duty Roster
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    Parses DIC, area deployments & Offs • Ignores casual group automatically
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowRosterModal(false);
                  setParsedSchedule(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {!parsedSchedule ? (
                <div className="space-y-3">
                  <label className="text-[11px] font-black uppercase text-slate-500 block">
                    Paste WhatsApp Gardening Roster
                  </label>
                  <textarea
                    rows={12}
                    value={rosterRawText}
                    onChange={(e) => setRosterRawText(e.target.value)}
                    placeholder={`Duty Roster.\n06/11/2026 - Friday\nMorning duty at 7:30 am\nDuty Incharge - Allu\n\n1. Spa cleaning: Haidher, Hussainka, Noor\n2. Sip Sip: Waheedh, Haleel\n3. Pathway cleaning - 3 ladies +casual\n4. SHELL Area and back office - Nizaam\n\nActivities:\n• Beach cleaning at 7:30am\n• Waste loading to Hithadhoo\n• jetty C work\n• jetty C area planting\n\nOff: Idrees, Fahudh, Atholhey, Haneef\n\nCasual Group.\n1.Beach cleaning: Ariful, Shakib, Haug, Himu\n...`}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 font-mono text-xs text-slate-800 outline-none focus:border-emerald-600 focus:bg-white resize-none"
                  />
                  <button
                    onClick={handleParseGardeningRoster}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 size={16} />
                    <span>Analyze & Match Gardeners</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Target Roster Date</span>
                      <span className="text-sm font-black text-emerald-800 font-mono">{parsedSchedule.detectedDate}</span>
                    </div>
                    <button
                      onClick={() => setParsedSchedule(null)}
                      className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                    >
                      ← Re-paste text
                    </button>
                  </div>

                  {/* Editable Staff Mapping Table with Type & Search */}
                  <div className="border border-slate-200 rounded-2xl overflow-visible">
                    <div className="bg-slate-100 p-2.5 border-b border-slate-200 flex justify-between items-center text-[10px] font-black uppercase text-slate-500">
                      <span className="w-1/3">Message Name</span>
                      <span className="w-1/4">Assigned Area / Role</span>
                      <span className="w-5/12 text-right">Connected Staff (Type & Search)</span>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto overflow-x-visible">
                      {parsedSchedule.items.map((item, idx) => {
                        return (
                          <div key={idx} className="p-2.5 flex items-center justify-between gap-2.5 text-xs bg-white hover:bg-slate-50">
                            <div className="w-1/3 min-w-0">
                              <span className="font-bold text-slate-800 block truncate">{item.rawName}</span>
                              <span className="text-[9px] text-slate-400 block truncate">From Schedule</span>
                            </div>

                            <div className="w-1/4">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                item.type === "DIC"
                                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                                  : item.type === "OFF"
                                  ? "bg-slate-200 text-slate-700"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}>
                                {item.label}
                              </span>
                            </div>

                            {/* TYPE & SEARCH COMBOBOX: Click and type directly (Clean Names Only) */}
                            <div className="w-5/12 min-w-0">
                              <HostSearchSelect
                                selectedHost={item.matchedHost}
                                allHosts={hosts}
                                poolHosts={currentPool}
                                onSelect={(hostId) => handleUpdateMatchedHost(idx, hostId)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {parsedSchedule.activities.length > 0 && (
                    <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                      <span className="text-[10px] font-black uppercase text-emerald-800 block mb-1">
                        Detected Daily Activities:
                      </span>
                      <ul className="text-xs text-slate-700 space-y-0.5 list-disc list-inside font-bold">
                        {parsedSchedule.activities.map((act, i) => (
                          <li key={i}>{act}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowRosterModal(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmGardeningSchedule}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 size={15} />
                      <span>Confirm & Apply Schedule</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                className="text-slate-400 hover:text-slate-600 text-sm font-black cursor-pointer"
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
                      className={`p-2 rounded-xl text-xs font-black border text-left transition-all cursor-pointer ${
                        leaveForm.leave_type === lt.value
                          ? "bg-[#059669] text-white border-[#059669] shadow-sm"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#059669]"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Return / End Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#059669]"
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
                  className="text-rose-600 hover:text-rose-800 text-xs font-black cursor-pointer"
                >
                  Clear Active Leave
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedHostForLeave(null)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLeave}
                  className="bg-[#059669] hover:bg-[#047857] text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-sm cursor-pointer"
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
                  Add Host to Gardening Pool
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                  Select from any resort host
                </p>
              </div>
              <button
                onClick={() => setShowDraftModal(false)}
                className="text-slate-400 hover:text-slate-600 font-black text-sm px-2 py-1 cursor-pointer"
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#059669]"
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

                      <span className="text-[10px] font-black text-[#059669]">
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
                <span className="font-black text-[#059669]">{getHostLabel(conflictModal.host)}</span>
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
                        conflictModal.targetArea,
                        conflictModal.targetShift,
                        conflictModal.targetTask,
                        true
                      )
                    }
                    className="w-full bg-[#059669] hover:bg-[#047857] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                  >
                    Move to GARDENING (Remove from {conflictModal.existingAreas.join(", ")})
                  </button>

                  <button
                    onClick={() =>
                      executeAssignment(
                        conflictModal.host.id,
                        conflictModal.targetArea,
                        conflictModal.targetShift,
                        conflictModal.targetTask,
                        false
                      )
                    }
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-black transition-all cursor-pointer"
                  >
                    Keep in Both Areas
                  </button>
                </>
              ) : (
                <button
                  onClick={() =>
                    executeAssignment(
                      conflictModal.host.id,
                      conflictModal.targetArea,
                      conflictModal.targetShift,
                      conflictModal.targetTask,
                      false
                    )
                  }
                  className="w-full bg-[#059669] hover:bg-[#047857] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                >
                  Assign Anyway (Override Leave)
                </button>
              )}

              <button
                onClick={() => setConflictModal(null)}
                className="w-full text-slate-400 hover:text-slate-600 py-1 text-xs font-bold transition-all cursor-pointer"
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
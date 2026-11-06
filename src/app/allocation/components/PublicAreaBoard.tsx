"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { 
  MapPin, 
  Home, 
  Sun, 
  Sunset, 
  Sparkles, 
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
  X,
  ChevronDown
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

interface PublicAreaBoardProps {
  hosts: Host[];
  setHosts?: React.Dispatch<React.SetStateAction<any[]>>;
  allocations: Allocation[];
  setAllocations: React.Dispatch<React.SetStateAction<Allocation[]>>;
  activeLeaves?: any[];
  setIsDirty: (val: boolean) => void;
  selectedDate: string;
}

interface ParsedScheduleItem {
  rawName: string;
  matchedHost: Host | null;
  sectionType: "DUTY" | "LEAVE" | "SPECIAL";
  shift?: string;
  task?: string;
  leaveType?: string;
  endDate?: string;
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

// Helper to determine if a line contains an actual task or just empty symbols / dashes
const isMeaningfulTask = (line: string): boolean => {
  const clean = line.trim();
  if (!clean) return false;

  // Filter out lines made solely of dashes, underscores, dots, slashes, or whitespace
  const strippedSymbols = clean.replace(/[\s\-=_~\.*#:/|\\]/g, "");
  if (!strippedSymbols || strippedSymbols.length < 2) return false;

  // Filter out terms representing "none"
  const upper = clean.toUpperCase();
  const NONE_WORDS = [
    "NONE", "NIL", "N/A", "NA", "NO", "NOTHING", 
    "NO TASK", "NO TASKS", "NO DEEP CLEANING", "OFF"
  ];
  if (NONE_WORDS.includes(upper)) return false;

  return true;
};

// --- SEARCHABLE COMBOBOX COMPONENT FOR CONNECTING STAFF ---
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
          placeholder="Type to search staff..."
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
                    Public Area Team Pool
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

export default function PublicAreaBoard({
  hosts,
  setHosts,
  allocations,
  setAllocations,
  setIsDirty,
  selectedDate,
}: PublicAreaBoardProps) {
  const [activeSubTab, setActiveSubTab] = useState<"public" | "housemate">("public");
  const [activeLeaveRecords, setActiveLeaveRecords] = useState<ActiveLeaveRecord[]>([]);

  // Host Leave Modal
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

  // Special tasks list
  const [specialTasks, setSpecialTasks] = useState(["", "", "", ""]);

  // --- AUTO ROSTER IMPORT STATE ---
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [rosterRawText, setRosterRawText] = useState("");
  const [parsedSchedule, setParsedSchedule] = useState<{
    detectedDate: string;
    items: ParsedScheduleItem[];
    deepCleanTasks: string[];
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

  useEffect(() => {
    const existingSpecial = allocations
      .filter((a) => a.area === "public" && (a.task_details || "").toLowerCase().includes("special"))
      .map((a) => a.task_details.replace(/^special:\s*/i, ""));

    setSpecialTasks([
      existingSpecial[0] || "",
      existingSpecial[1] || "",
      existingSpecial[2] || "",
      existingSpecial[3] || "",
    ]);
  }, [allocations]);

  const currentPool = React.useMemo(() => {
    if (activeSubTab === "public") {
      return hosts.filter((h) => {
        const sub = (h.sub_department || "").toLowerCase();
        const role = (h.role || "").toLowerCase();
        return sub.includes("public") || sub.includes("pa") || role.includes("public") || role.includes("pa");
      });
    } else {
      return hosts.filter((h) => {
        const sub = (h.sub_department || "").toLowerCase();
        const role = (h.role || "").toLowerCase();
        return sub.includes("housemate") || sub.includes("mate") || role.includes("housemate") || role.includes("mate");
      });
    }
  }, [activeSubTab, hosts]);

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

  // --- SAFE & ACCURATE MATCHER (PA POOL FIRST) ---
  const findMatchingHost = (rawSearch: string): Host | null => {
    if (!rawSearch) return null;
    const cleanSearch = rawSearch.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanSearch.length < 2) return null;

    // Search in PA Pool first, then fallback to general staff
    const candidateLists = [currentPool, hosts];

    for (const pool of candidateLists) {
      // 1. Exact match on clean full name
      for (const h of pool) {
        const fullClean = (h.full_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (fullClean && fullClean === cleanSearch) return h;
      }

      // 2. Exact match on stored nicknames (only non-empty entries)
      for (const h of pool) {
        if (!h.nicknames) continue;
        const nicks = h.nicknames
          .toLowerCase()
          .split(",")
          .map((n) => n.trim().replace(/[^a-z0-9]/g, ""))
          .filter((n) => n.length >= 2);

        if (nicks.includes(cleanSearch)) return h;
      }

      // 3. Maldivian name matching (e.g., "M Moosa" matches "Mohamed Moosa")
      for (const h of pool) {
        const parts = (h.full_name || "").toLowerCase().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          const firstInitialLast = `${parts[0].charAt(0)}${parts[parts.length - 1]}`;
          if (cleanSearch === firstInitialLast) return h;
          if (cleanSearch === parts[parts.length - 1] && parts[parts.length - 1].length >= 3) return h;
        }
      }

      // 4. Safe word boundary match (only if search word is at least 3 characters)
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

  // --- PARSE ROSTER TEXT ENGINE (SMART DETECTOR) ---
  const handleParseRoster = () => {
    if (!rosterRawText.trim()) {
      toast.error("Please paste the roster text first");
      return;
    }

    const lines = rosterRawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    
    // Detect Target Date (DD.MM.YY or DD/MM/YY or DD-MM-YY)
    let detectedDate = selectedDate;
    const dateMatch = rosterRawText.match(/(\d{1,2})[\.\/\-]\s*(\d{1,2})[\.\/\-]\s*(\d{2,4})/);
    if (dateMatch) {
      const d = dateMatch[1].padStart(2, "0");
      const m = dateMatch[2].padStart(2, "0");
      let y = dateMatch[3].trim();
      if (y.length === 2) y = `20${y}`;
      detectedDate = `${y}-${m}-${d}`;
    }

    let currentSection: "NONE" | "MORN_OW" | "MORN_BOH" | "AFT_SHIFT" | "OFF" | "DEEP_CLEAN" | "VACATION" = "NONE";
    const items: ParsedScheduleItem[] = [];
    const deepClean: string[] = [];

    for (const line of lines) {
      const upper = line.toUpperCase().trim();

      if (upper.includes("DUTY SCHEDULE") || (dateMatch && upper.includes(dateMatch[0]))) {
        continue;
      }

      // Detect Section Headers flexibly
      if (upper.includes("MORN") && (upper.includes("OW") || upper.includes("SHIFT") || upper.includes("FOH"))) {
        currentSection = "MORN_OW";
        continue;
      }
      if (upper.includes("BACK OF HOUSE") || upper.includes("BOH")) {
        currentSection = "MORN_BOH";
        continue;
      }
      if (upper.includes("AFTERNOON") || upper.includes("NIGHT") || upper.includes("EVENING")) {
        currentSection = "AFT_SHIFT";
        continue;
      }
      if (upper.startsWith("OFF") || upper === "OFF" || upper === "DAYS OFF") {
        currentSection = "OFF";
        continue;
      }
      if (upper.includes("DEEP CLEAN") || upper.includes("SPECIAL TASK") || upper.includes("PROJECT")) {
        currentSection = "DEEP_CLEAN";
        continue;
      }
      if (upper.includes("VACATION") || upper.includes("ANNUAL LEAVE") || upper === "AL" || upper.includes("LEAVE")) {
        currentSection = "VACATION";
        continue;
      }

      // If the line is purely decorative symbols (dashes, underscores, equals), skip it entirely
      if (!isMeaningfulTask(line)) continue;

      if (currentSection === "DEEP_CLEAN") {
        deepClean.push(line);
        continue;
      }

      if (currentSection !== "NONE") {
        let cleanName = line;
        let returnDate = detectedDate;

        // Parse return date if present (e.g., "Ali Maah (D,17/11/26)")
        const retDateMatch = line.match(/\((?:D,)?\s*(\d{1,2})[\.\/\-]\s*(\d{1,2})[\.\/\-]\s*(\d{2,4})\)/i);
        if (retDateMatch) {
          const rd = retDateMatch[1].padStart(2, "0");
          const rm = retDateMatch[2].padStart(2, "0");
          let ry = retDateMatch[3].trim();
          if (ry.length === 2) ry = `20${ry}`;
          returnDate = `${ry}-${rm}-${rd}`;
          cleanName = line.replace(/\([^)]*\)/g, "").trim();
        }

        const matched = findMatchingHost(cleanName);

        if (currentSection === "MORN_OW") {
          items.push({
            rawName: cleanName,
            matchedHost: matched,
            sectionType: "DUTY",
            shift: "Morning",
            task: "FOH",
            label: "Morning FOH (OW)",
          });
        } else if (currentSection === "MORN_BOH") {
          items.push({
            rawName: cleanName,
            matchedHost: matched,
            sectionType: "DUTY",
            shift: "Morning",
            task: "BOH",
            label: "Morning BOH",
          });
        } else if (currentSection === "AFT_SHIFT") {
          items.push({
            rawName: cleanName,
            matchedHost: matched,
            sectionType: "DUTY",
            shift: "Afternoon",
            task: "FOH",
            label: "Afternoon Shift",
          });
        } else if (currentSection === "OFF") {
          items.push({
            rawName: cleanName,
            matchedHost: matched,
            sectionType: "LEAVE",
            leaveType: "OFF",
            endDate: returnDate,
            label: "Day Off (OFF)",
          });
        } else if (currentSection === "VACATION") {
          items.push({
            rawName: cleanName,
            matchedHost: matched,
            sectionType: "LEAVE",
            leaveType: "AL",
            endDate: returnDate,
            label: "Vacation (AL)",
          });
        }
      }
    }

    setParsedSchedule({
      detectedDate,
      items,
      deepCleanTasks: deepClean,
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

  // --- CONFIRM, SAVE ALLOCATIONS & SILENTLY REMEMBER NICKNAMES ---
  const handleConfirmSchedule = async () => {
    if (!parsedSchedule) return;

    try {
      const targetDate = parsedSchedule.detectedDate;
      const newAllocs: Allocation[] = [...allocations.filter((a) => a.report_date !== targetDate || a.area !== "public")];

      for (const item of parsedSchedule.items) {
        if (!item.matchedHost) continue;

        const host = item.matchedHost;
        const rawName = item.rawName.trim();

        // SILENT NICKNAME MEMORY
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

        // Commit Leaves (OFF, AL)
        if (item.sectionType === "LEAVE" && item.leaveType) {
          const dStart = targetDate;
          const dEnd = item.endDate || targetDate;
          const diffTime = Math.abs(new Date(dEnd).getTime() - new Date(dStart).getTime());
          const daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

          const hostKey = String(host.id || host.host_id || "");
          const hostNameVal = host.full_name;

          await supabase
            .from("hsk_leave_requests")
            .delete()
            .eq("host_id", hostKey)
            .lte("start_date", dEnd)
            .gte("end_date", dStart);

          await supabase.from("hsk_leave_requests").insert([{
            host_id: hostKey,
            host_name: hostNameVal,
            leave_type: item.leaveType,
            start_date: dStart,
            end_date: dEnd,
            total_days: daysCount,
            days_count: daysCount,
            status: "Approved",
            reason: `Auto scheduled from roster: ${item.leaveType}`,
          }]);
        }

        // Commit Duty Shifts
        if (item.sectionType === "DUTY" && item.shift && item.task) {
          newAllocs.push({
            host_id: host.id,
            area: "public",
            shift: item.shift,
            task_details: item.task,
            report_date: targetDate,
          });
        }
      }

      // Commit Deep Cleaning Tasks cleanly (wipes old dashes/empty lines if none present)
      const newSpecials = ["", "", "", ""];
      if (parsedSchedule.deepCleanTasks.length > 0) {
        parsedSchedule.deepCleanTasks.slice(0, 4).forEach((task, i) => {
          newSpecials[i] = task;
          newAllocs.push({
            host_id: "special_task_placeholder",
            area: "public",
            shift: "Special Task",
            task_details: `Special: ${task.trim()}`,
            report_date: targetDate,
          });
        });
      }
      setSpecialTasks(newSpecials);

      setAllocations(newAllocs);
      setIsDirty(true);
      fetchActiveLeaves();
      setShowRosterModal(false);
      setParsedSchedule(null);
      setRosterRawText("");
      toast.success(`Schedule for ${targetDate} applied!`);
    } catch (err: any) {
      console.error("Schedule confirm error:", err);
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
      const hostNameVal = selectedHostForLeave.full_name;

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

      toast.success(`${selectedHostForLeave.full_name} set to ${leaveForm.leave_type} until ${leaveForm.end_date}!`);
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
    const newDepartment = activeSubTab === "public" ? "Public Area" : "Housemate";
    
    if (setHosts) {
      setHosts((prev: Host[]) =>
        prev.map((h) => (h.id === hostId ? { ...h, sub_department: newDepartment } : h))
      );
    }

    const { error } = await supabase
      .from("hsk_hosts")
      .update({ sub_department: newDepartment })
      .eq("id", hostId);

    if (error) {
      toast.error("Could not save to pool: " + error.message);
    } else {
      toast.success("Host added to pool!");
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

    setAllocations(allocations.filter((a) => !(a.host_id === hostId && a.area === activeSubTab)));
    setIsDirty(true);
    toast.success("Host removed from pool");
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
      (a) => a.host_id === hostId && a.area === area && a.shift === shift && a.task_details === task
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

  const handleRemoveAllocation = (hostId: string, area: string, shift: string, task: string) => {
    const updated = allocations.filter(
      (a) => !(a.host_id === hostId && a.area === area && a.shift === shift && a.task_details === task)
    );
    setAllocations(updated);
    setIsDirty(true);
  };

  const handleSpecialChange = (index: number, val: string) => {
    const updated = [...specialTasks];
    updated[index] = val;
    setSpecialTasks(updated);

    const nonSpecials = allocations.filter(
      (a) => !(a.area === "public" && (a.task_details || "").toLowerCase().includes("special"))
    );

    const newSpecials: Allocation[] = updated.filter(Boolean).map((t) => ({
      host_id: "special_task_placeholder",
      area: "public",
      shift: "Special Task",
      task_details: `Special: ${t.trim()}`,
      report_date: selectedDate,
    }));

    setAllocations([...nonSpecials, ...newSpecials]);
    setIsDirty(true);
  };

  const renderDynamicSlotCard = (
    title: string,
    icon: React.ReactNode,
    area: string,
    shift: string,
    taskMatch: string,
    badgeColor: string
  ) => {
    const assigned = allocations.filter(
      (a) => a.area === area && (a.shift || "").toLowerCase().includes(shift.toLowerCase()) && (a.task_details || "").toLowerCase().includes(taskMatch.toLowerCase())
    );

    const assignedHostIds = assigned.map((a) => a.host_id);
    const availableFromPool = currentPool.filter((h) => !assignedHostIds.includes(h.id));

    return (
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${badgeColor}`}>
            {icon} {title}
          </span>
          <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {assigned.length} on duty
          </span>
        </div>

        <div className="space-y-1.5 min-h-[40px]">
          {assigned.length === 0 ? (
            <div className="text-center py-2 text-[10px] font-bold text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No attendants assigned
            </div>
          ) : (
            assigned.map((a) => {
              const h = hosts.find((host) => host.id === a.host_id);
              const name = h ? getHostLabel(h) : "Unknown Host";
              const contact = h?.mvpn || h?.company_mobile || h?.personal_mobile || "";

              return (
                <div
                  key={a.host_id}
                  className="flex items-center justify-between p-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-lg bg-[#6D2158] text-white flex items-center justify-center font-black text-[10px]">
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
                    onClick={() => handleRemoveAllocation(a.host_id, area, shift, a.task_details)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    title="Remove from shift"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
          <span className="text-[9px] font-black uppercase text-slate-400">Click to assign from pool:</span>
          {availableFromPool.length === 0 ? (
            <span className="text-[10px] text-slate-400 font-bold italic">All pool members assigned</span>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-[90px] overflow-y-auto">
              {availableFromPool.map((h) => {
                const leave = getHostLeaveRecord(h.id);
                return (
                  <button
                    key={h.id}
                    onClick={() => requestAssignDuty(h, area, shift, taskMatch)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 shadow-sm cursor-pointer ${
                      leave
                        ? "bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100"
                        : "bg-slate-100 hover:bg-[#6D2158] hover:text-white border-slate-200 text-slate-700"
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
      {/* SUB-TABS & ACTION BUTTONS */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab("public")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeSubTab === "public"
                ? "bg-[#6D2158] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <MapPin size={15} />
            <span>Public Area Operations</span>
          </button>

          <button
            onClick={() => setActiveSubTab("housemate")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeSubTab === "housemate"
                ? "bg-[#6D2158] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Home size={15} />
            <span>Housemate Team</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === "public" && (
            <button
              onClick={() => {
                setRosterRawText("");
                setParsedSchedule(null);
                setShowRosterModal(true);
              }}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
            >
              <ClipboardPaste size={15} />
              <span>Import Roster Schedule</span>
            </button>
          )}

          <button
            onClick={() => {
              setSearchHostTerm("");
              setShowDraftModal(true);
            }}
            className="flex items-center gap-1.5 bg-[#6D2158] hover:bg-[#521643] text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
          >
            <UserPlus size={15} />
            <span>Add Host to Pool</span>
          </button>
        </div>
      </div>

      {/* STAFF POOL PILLS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <UserCheck size={16} className="text-[#6D2158]" /> 
              {activeSubTab === "public" ? "Public Area Staff Pool" : "Housemate Staff Pool"}
            </span>
            <span className="text-[10px] font-black bg-[#6D2158]/10 text-[#6D2158] px-2 py-0.5 rounded-full">
              {currentPool.length} Hosts
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold">
            💡 Click any host pill to set leave/off & return date
          </span>
        </div>

        <div className="flex flex-wrap gap-2 max-h-[180px] overflow-y-auto p-1">
          {currentPool.map((h) => {
            const isAssigned = allocations.some((a) => a.host_id === h.id && a.area === activeSubTab);
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
                    ? "bg-purple-50 border-[#6D2158] text-[#6D2158]"
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

      {activeSubTab === "public" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="bg-slate-50/50 p-2 rounded-xl border border-slate-200 text-xs font-black uppercase text-amber-800 tracking-wider flex items-center gap-2">
              <Sun size={15} /> Morning Shifts (06:30 - 14:30)
            </div>
            {renderDynamicSlotCard("Morning FOH (Front of House)", <Sun size={14} />, "public", "Morning", "FOH", "text-amber-700")}
            {renderDynamicSlotCard("Morning BOH (Back of House)", <Sun size={14} />, "public", "Morning", "BOH", "text-amber-800")}
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50/50 p-2 rounded-xl border border-slate-200 text-xs font-black uppercase text-indigo-800 tracking-wider flex items-center gap-2">
              <Sunset size={15} /> Afternoon / Night Shifts (14:30 - 23:00)
            </div>
            {renderDynamicSlotCard("Afternoon / Night FOH", <Sunset size={14} />, "public", "Afternoon", "FOH", "text-indigo-700")}
            {renderDynamicSlotCard("Afternoon / Night BOH", <Sunset size={14} />, "public", "Afternoon", "BOH", "text-indigo-800")}
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-xs font-black uppercase text-[#6D2158] tracking-wider flex items-center gap-2">
                <Sparkles size={15} /> Special Tasks & Deep Clean
              </span>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                Printed directly into Special Tasks #1 to #4 on the report
              </p>
            </div>

            <div className="space-y-3 flex-1">
              {specialTasks.map((task, idx) => (
                <div key={idx}>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                    Special Task #{idx + 1}
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. Task ${idx + 1}`}
                    value={task}
                    onChange={(e) => handleSpecialChange(idx, e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-xs text-slate-800 outline-none focus:border-[#6D2158]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "housemate" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-slate-50/50 p-2 rounded-xl border border-slate-200 text-xs font-black uppercase text-[#6D2158] tracking-wider flex items-center gap-2">
              <Home size={15} /> Housemate Duty Attendants
            </div>
            {renderDynamicSlotCard(
              "Housemate Attendants",
              <Home size={14} />,
              "housemate",
              "Straight",
              "Housemate",
              "text-[#6D2158]"
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center p-8 gap-3">
            <div className="p-4 bg-purple-50 text-[#6D2158] rounded-2xl">
              <Home size={32} />
            </div>
            <h3 className="text-sm font-black text-slate-800">Housemate Team Roster</h3>
            <p className="text-xs text-slate-400 font-bold max-w-sm">
              Click hosts in the pool to set leave, or click their pills in the shift card to place them on duty.
            </p>
          </div>
        </div>
      )}

      {/* --- AUTO-DETECT ROSTER IMPORT MODAL WITH TYPE & SEARCH COMBOBOX --- */}
      {showRosterModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-sm">
                  <ClipboardPaste size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-800">
                    Auto-Detect Roster & Schedule
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    Type to search any staff member to quickly connect[cite: 21]
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
                    Paste Schedule Text Below
                  </label>
                  <textarea
                    rows={12}
                    value={rosterRawText}
                    onChange={(e) => setRosterRawText(e.target.value)}
                    placeholder={`TOMORROW DUTY SCHEDULE\n06.11.26\n\nMORNIG SHIFT(OW 2842\nM Moosa\nThoha\n\nBACK OF HOUSE (2848)\nMode\nJallu\n\nAFTERNOON SHIFT\nNafiu\nFaruhan\nRobi\n\nOFF\nBakuru\n\nDEEP CLEANING SCHEDULE\n--------------------  ----------------\n\nVACATION\nAli Maah (D,17/11/26)`}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 font-mono text-xs text-slate-800 outline-none focus:border-emerald-600 focus:bg-white resize-none"
                  />
                  <button
                    onClick={handleParseRoster}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 size={16} />
                    <span>Analyze & Match Staff</span>
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
                      <span className="w-1/4">Assigned Shift</span>
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
                                item.sectionType === "LEAVE"
                                  ? item.leaveType === "AL" ? "bg-rose-100 text-rose-800" : "bg-slate-200 text-slate-700"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}>
                                {item.label}
                              </span>
                              {item.endDate && item.endDate !== parsedSchedule.detectedDate && (
                                <span className="block text-[8px] font-mono text-slate-400 mt-0.5">
                                  Till: {item.endDate}
                                </span>
                              )}
                            </div>

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

                  {parsedSchedule.deepCleanTasks.length > 0 ? (
                    <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100">
                      <span className="text-[10px] font-black uppercase text-[#6D2158] block mb-1">
                        Detected Deep Cleaning Tasks:
                      </span>
                      <ul className="text-xs text-slate-700 space-y-0.5 list-disc list-inside font-bold">
                        {parsedSchedule.deepCleanTasks.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-400 font-bold text-center">
                      No deep cleaning tasks scheduled (Dashes & empty separators filtered out)
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
                      onClick={handleConfirmSchedule}
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

      {/* --- LEAVE MODAL --- */}
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
                          ? "bg-[#6D2158] text-white border-[#6D2158] shadow-sm"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#6D2158]"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Return / End Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#6D2158]"
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
                  className="bg-[#6D2158] hover:bg-[#521643] text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-sm cursor-pointer"
                >
                  Apply Leave
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD TO POOL MODAL --- */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  Add Host to {activeSubTab === "public" ? "Public Area Pool" : "Housemate Pool"}
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#6D2158]"
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

                      <span className="text-[10px] font-black text-[#6D2158]">
                        {alreadyInPool ? "In Pool" : "+ Add to Pool"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* --- CONFLICT MODAL --- */}
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
                <span className="font-black text-[#6D2158]">{getHostLabel(conflictModal.host)}</span>
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
                    className="w-full bg-[#6D2158] hover:bg-[#521643] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                  >
                    Move to {conflictModal.targetArea.toUpperCase()} (Remove from {conflictModal.existingAreas.join(", ")})
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
                  className="w-full bg-[#6D2158] hover:bg-[#521643] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
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
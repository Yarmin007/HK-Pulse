"use client";

import React, { useState, useEffect, useRef } from "react";
import { useConfirm } from '@/components/ConfirmProvider';
import { supabase } from "@/lib/supabase";
import { 
  Shirt, 
  Scissors, 
  Sun, 
  Clock, 
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
  X
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

interface LaundryTailorBoardProps {
  hosts: Host[];
  setHosts?: React.Dispatch<React.SetStateAction<any[]>>;
  allocations: Allocation[];
  setAllocations: React.Dispatch<React.SetStateAction<Allocation[]>>;
  activeLeaves?: any[];
  setIsDirty: (val: boolean) => void;
  selectedDate: string;
}

interface ParsedLaundryItem {
  rawName: string;
  matchedHost: Host | null;
  sectionType: "DUTY" | "LEAVE";
  shift?: string;
  task?: string;
  leaveType?: string;
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
              ? "bg-white border-slate-300 text-slate-800 focus:border-teal-600 focus:ring-1 focus:ring-teal-500"
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
                    Laundry Team Pool
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
                      className="w-full text-left px-3 py-1.5 hover:bg-teal-50 text-xs font-bold text-slate-800 flex items-center justify-between transition-colors"
                    >
                      <span>{h.full_name}</span>
                      {selectedHost?.id === h.id && (
                        <CheckCircle2 size={13} className="text-teal-600" />
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
                      className="w-full text-left px-3 py-1.5 hover:bg-teal-50 text-xs font-bold text-slate-700 flex items-center justify-between transition-colors"
                    >
                      <span>{h.full_name}</span>
                      {selectedHost?.id === h.id && (
                        <CheckCircle2 size={13} className="text-teal-600" />
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

export default function LaundryTailorBoard({
  hosts,
  setHosts,
  allocations,
  setAllocations,
  setIsDirty,
  selectedDate,
}: LaundryTailorBoardProps) {
  const { confirmAction } = useConfirm();
  const [activeSubTab, setActiveSubTab] = useState<"laundry" | "tailor">("laundry");
  const [activeLeaveRecords, setActiveLeaveRecords] = useState<ActiveLeaveRecord[]>([]);

  // Leave Modal State
  const [selectedHostForLeave, setSelectedHostForLeave] = useState<Host | null>(null);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "AL",
    start_date: selectedDate,
    end_date: selectedDate,
  });

  // Add Host to Pool Modal
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
    items: ParsedLaundryItem[];
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

  // Dedicated pool per sub-department
  const currentPool = React.useMemo(() => {
    if (activeSubTab === "laundry") {
      return hosts.filter((h) => {
        const sub = (h.sub_department || "").toLowerCase();
        const role = (h.role || "").toLowerCase();
        return sub.includes("laundry") || role.includes("laundry") || role.includes("presser") || role.includes("washer");
      });
    } else {
      return hosts.filter((h) => {
        const sub = (h.sub_department || "").toLowerCase();
        const role = (h.role || "").toLowerCase();
        return sub.includes("tailor") || role.includes("tailor") || role.includes("seamstress");
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

  // --- SAFE & ACCURATE MATCHER (LAUNDRY POOL FIRST) ---
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

      // 3. Name abbreviation matching (e.g., "M Nazim" -> "Mohamed Nazim")
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

  // Helper to parse dates like "06 Nov, 2026" or "06/11/2026" or "06.11.26"
  const parseRosterDate = (text: string, fallback: string): string => {
    const monthNames: Record<string, string> = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"
    };

    // "06 Nov, 2026" or "6 November 2026"
    const textMonthMatch = text.match(/(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{2,4})/);
    if (textMonthMatch) {
      const d = textMonthMatch[1].padStart(2, "0");
      const mPrefix = textMonthMatch[2].substring(0, 3).toUpperCase();
      let y = textMonthMatch[3].trim();
      if (y.length === 2) y = `20${y}`;
      if (monthNames[mPrefix]) {
        return `${y}-${monthNames[mPrefix]}-${d}`;
      }
    }

    // Numbered format: DD/MM/YYYY or DD.MM.YY
    const numMatch = text.match(/(\d{1,2})[\.\/\-]\s*(\d{1,2})[\.\/\-]\s*(\d{2,4})/);
    if (numMatch) {
      const d = numMatch[1].padStart(2, "0");
      const m = numMatch[2].padStart(2, "0");
      let y = numMatch[3].trim();
      if (y.length === 2) y = `20${y}`;
      return `${y}-${m}-${d}`;
    }

    return fallback;
  };

  // --- SMART LAUNDRY ROSTER PARSER ---
  const handleParseLaundryRoster = () => {
    if (!rosterRawText.trim()) {
      toast.error("Please paste the roster text first");
      return;
    }

    const text = sanitizeText(rosterRawText);
    const detectedDate = parseRosterDate(text, selectedDate);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    let currentSection: "NONE" | "MORNING" | "SPLIT" | "OFF" = "NONE";
    const items: ParsedLaundryItem[] = [];

    for (const line of lines) {
      const upper = line.toUpperCase();

      // Skip generic title/date lines
      if (upper.includes("DUTY ROSTER") || (detectedDate && upper.includes(detectedDate))) {
        continue;
      }

      // 1. Detect Shift Headers
      if (
        /\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)?/i.test(upper) ||
        upper === "MORNING" || upper === "MORNING SHIFT" || upper === "STRAIGHT" || upper === "STRAIGHT DUTY"
      ) {
        currentSection = "MORNING";
        continue;
      }

      if (upper === "SPLIT" || upper === "SPLIT DUTY" || upper === "SPLIT SHIFT") {
        currentSection = "SPLIT";
        continue;
      }

      if (
        upper === "DAY OFF" || upper === "DAYS OFF" || upper === "OFF" || 
        upper === "LEAVE" || upper === "VACATION" || upper === "ANNUAL LEAVE"
      ) {
        currentSection = "OFF";
        continue;
      }

      // Handle single-line off header e.g. "Off: Maumoon, Issey"
      const inlineOffMatch = line.match(/^(?:DAY\s+OFF|OFF|LEAVE|VACATION)\s*[:\-]\s*(.+)$/i);
      if (inlineOffMatch) {
        const names = inlineOffMatch[1].split(/[,&]|\band\b/i);
        names.forEach((n) => {
          const rawName = n.trim();
          if (!rawName) return;
          const isVacation = /\b(vacation|al|annual)\b/i.test(rawName);
          const cleanName = rawName.replace(/\([^)]*\)/g, "").trim();

          items.push({
            rawName: cleanName,
            matchedHost: findMatchingHost(cleanName),
            sectionType: "LEAVE",
            leaveType: isVacation ? "AL" : "OFF",
            label: isVacation ? "Vacation (AL)" : "Day Off (OFF)",
          });
        });
        continue;
      }

      // Ignore divider lines
      if (/^[-=_*]{2,}$/.test(line)) continue;

      if (currentSection !== "NONE") {
        let cleanName = line;
        let leaveType = "OFF";

        // Detect inline status like "Maumoon (OFF)" or "Issey ( vacation )"
        if (/\b(vacation|al|annual)\b/i.test(line)) {
          leaveType = "AL";
        } else if (/\b(sl|sick)\b/i.test(line)) {
          leaveType = "SL";
        }

        cleanName = line.replace(/\([^)]*\)/g, "").trim();
        if (!cleanName) continue;

        if (currentSection === "MORNING") {
          items.push({
            rawName: cleanName,
            matchedHost: findMatchingHost(cleanName),
            sectionType: "DUTY",
            shift: "Morning",
            task: "Laundry Operations",
            label: "Morning Duty (7:30 - 16:30)",
          });
        } else if (currentSection === "SPLIT") {
          items.push({
            rawName: cleanName,
            matchedHost: findMatchingHost(cleanName),
            sectionType: "DUTY",
            shift: "Split",
            task: "Split Shift Coverage",
            label: "Split Duty",
          });
        } else if (currentSection === "OFF") {
          items.push({
            rawName: cleanName,
            matchedHost: findMatchingHost(cleanName),
            sectionType: "LEAVE",
            leaveType,
            label: leaveType === "AL" ? "Vacation (AL)" : "Day Off (OFF)",
          });
        }
      }
    }

    setParsedSchedule({
      detectedDate,
      items,
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
  const handleConfirmLaundrySchedule = async () => {
    if (!parsedSchedule) return;

    try {
      // The board only holds the day being viewed. A roster dated for another day
      // is applied to the viewed day (after asking), never mixed in under its own date.
      if (parsedSchedule.detectedDate && parsedSchedule.detectedDate !== selectedDate &&
          !(await confirmAction({ title: 'Different roster date', message: `This roster is dated ${parsedSchedule.detectedDate}, but you are viewing ${selectedDate}. Apply it to ${selectedDate}?`, confirmText: `Apply to ${selectedDate}`, icon: 'warning' }))) {
        return;
      }
      const targetDate = selectedDate;
      const newAllocs: Allocation[] = [...allocations.filter((a) => a.report_date !== targetDate || a.area !== "laundry")];

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

        // 2. Commit Duty Shifts (Morning, Split)
        if (item.sectionType === "DUTY" && item.shift) {
          newAllocs.push({
            host_id: host.id,
            area: "laundry",
            shift: item.shift,
            task_details: item.task || "Laundry Operations",
            report_date: targetDate,
          });
        }

        // 3. Commit Leaves (OFF, AL)
        if (item.sectionType === "LEAVE" && item.leaveType) {
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
            leave_type: item.leaveType,
            start_date: targetDate,
            end_date: targetDate,
            total_days: 1,
            days_count: 1,
            status: "Approved",
            reason: `Auto scheduled from Laundry Roster: ${item.leaveType}`,
          }]);
        }
      }

      setAllocations(newAllocs);
      setIsDirty(true);
      fetchActiveLeaves();
      setShowRosterModal(false);
      setParsedSchedule(null);
      setRosterRawText("");
      toast.success(`Laundry Roster for ${targetDate} applied!`);
    } catch (err: any) {
      console.error("Laundry confirm error:", err);
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
    const newDepartment = activeSubTab === "laundry" ? "Laundry" : "Tailor";

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
      toast.success(`Host added to ${newDepartment} pool!`);
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

  const handleRemoveAllocation = (hostId: string, area: string, shift: string) => {
    const updated = allocations.filter(
      (a) => !(a.host_id === hostId && a.area === area && a.shift === shift)
    );
    setAllocations(updated);
    setIsDirty(true);
  };

  const renderDutySlotCard = (
    title: string,
    icon: React.ReactNode,
    area: string,
    shift: string,
    taskDesc: string,
    badgeColor: string
  ) => {
    const assigned = allocations.filter(
      (a) => a.area === area && (a.shift || "").toLowerCase().includes(shift.toLowerCase())
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

        <div className="space-y-1.5 min-h-[44px]">
          {assigned.length === 0 ? (
            <div className="text-center py-2.5 text-[10px] font-bold text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No staff assigned
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
                    <div className="w-5 h-5 rounded-lg bg-[#0d9488] text-white flex items-center justify-center font-black text-[10px]">
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
                    onClick={() => handleRemoveAllocation(a.host_id, area, a.shift)}
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
                    onClick={() => requestAssignDuty(h, area, shift, taskDesc)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 shadow-sm cursor-pointer ${
                      leave
                        ? "bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100"
                        : "bg-slate-100 hover:bg-[#0d9488] hover:text-white border-slate-200 text-slate-700"
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
      
      {/* HEADER & SUB-TABS */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab("laundry")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeSubTab === "laundry"
                ? "bg-[#0d9488] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Shirt size={15} />
            <span>Laundry Operations</span>
          </button>

          <button
            onClick={() => setActiveSubTab("tailor")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeSubTab === "tailor"
                ? "bg-[#0d9488] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Scissors size={15} />
            <span>Tailor Team</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === "laundry" && (
            <button
              onClick={() => {
                setRosterRawText("");
                setParsedSchedule(null);
                setShowRosterModal(true);
              }}
              className="flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
            >
              <ClipboardPaste size={15} />
              <span>Import Laundry Roster</span>
            </button>
          )}

          <button
            onClick={() => {
              setSearchHostTerm("");
              setShowDraftModal(true);
            }}
            className="flex items-center gap-1.5 bg-[#0d9488] hover:bg-[#0f766e] text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
          >
            <UserPlus size={14} />
            <span>Add Host to {activeSubTab === "laundry" ? "Laundry" : "Tailor"} Pool</span>
          </button>
        </div>
      </div>

      {/* STAFF POOL DRAWER */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <UserCheck size={16} className="text-[#0d9488]" /> 
              {activeSubTab === "laundry" ? "Laundry Staff Pool" : "Tailor Staff Pool"}
            </span>
            <span className="text-[10px] font-black bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">
              {currentPool.length} Hosts
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold">
            💡 Click any host pill to set leave/off & return date
          </span>
        </div>

        <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto p-1">
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
                    ? "bg-teal-50 border-teal-400 text-teal-900"
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

      {/* SHIFT BOARDS */}
      {activeSubTab === "laundry" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderDutySlotCard(
            "Morning Duty (07:00 - 15:30)",
            <Sun size={15} />,
            "laundry",
            "Morning",
            "Laundry Operations",
            "text-amber-700"
          )}

          {renderDutySlotCard(
            "Split Duty (Shift Coverage)",
            <Clock size={15} />,
            "laundry",
            "Split",
            "Split Shift Coverage",
            "text-indigo-700"
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderDutySlotCard(
            "Tailor Morning Duty",
            <Scissors size={15} />,
            "tailor",
            "Morning",
            "Tailoring & Alterations",
            "text-[#0d9488]"
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center p-8 gap-3">
            <div className="p-4 bg-teal-50 text-[#0d9488] rounded-2xl">
              <Scissors size={32} />
            </div>
            <h3 className="text-sm font-black text-slate-800">Tailoring Department</h3>
            <p className="text-xs text-slate-400 font-bold max-w-sm">
              Tailors operate on standard morning duty for guest uniforms, resort linen maintenance, and alterations.
            </p>
          </div>
        </div>
      )}

      {/* --- AUTO-DETECT LAUNDRY ROSTER IMPORT MODAL --- */}
      {showRosterModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-teal-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-700 text-white rounded-xl shadow-sm">
                  <Shirt size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-800">
                    Auto-Detect Laundry Duty Roster
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    Matches with Laundry Pool first • Connect or re-assign any staff member
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
                    Paste WhatsApp Laundry Roster Below
                  </label>
                  <textarea
                    rows={12}
                    value={rosterRawText}
                    onChange={(e) => setRosterRawText(e.target.value)}
                    placeholder={`Duty Roster - 06 Nov, 2026\n\n7:30 AM - 4:30 PM\nIlham\nSameer\nShaah\nNazim\n\nSplit Duty\nNiyaz\n\nDay Off\n    Maumoon (OFF)\n  Issey ( vacation )`}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 font-mono text-xs text-slate-800 outline-none focus:border-teal-600 focus:bg-white resize-none"
                  />
                  <button
                    onClick={handleParseLaundryRoster}
                    className="w-full bg-teal-700 hover:bg-teal-800 text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 size={16} />
                    <span>Analyze & Match Laundry Staff</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Target Roster Date</span>
                      <span className="text-sm font-black text-teal-800 font-mono">{parsedSchedule.detectedDate}</span>
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
                      <span className="w-1/4">Assigned Duty / Shift</span>
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
                                  ? item.leaveType === "AL"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-slate-200 text-slate-700"
                                  : item.shift === "Split"
                                  ? "bg-indigo-100 text-indigo-800"
                                  : "bg-amber-100 text-amber-800"
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

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowRosterModal(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmLaundrySchedule}
                      className="bg-teal-700 hover:bg-teal-800 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-md flex items-center gap-1.5 cursor-pointer"
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
                          ? "bg-[#0d9488] text-white border-[#0d9488] shadow-sm"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#0d9488]"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Return / End Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-xs outline-none focus:border-[#0d9488]"
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
                  className="bg-[#0d9488] hover:bg-[#0f766e] text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-sm cursor-pointer"
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
                  Add Host to {activeSubTab === "laundry" ? "Laundry" : "Tailor"} Pool
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#0d9488]"
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

                      <span className="text-[10px] font-black text-[#0d9488]">
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
                <span className="font-black text-[#0d9488]">{getHostLabel(conflictModal.host)}</span>
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
                    className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                  >
                    Move to LAUNDRY (Remove from {conflictModal.existingAreas.join(", ")})
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
                  className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
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
"use client";

import React, { useState, useEffect } from "react";
import { riderDutyOf, isOffShift, runnerShiftLabel } from "@/app/allocation/lib/riders";
import { supabase } from "@/lib/supabase";
import { Printer, Calendar, RefreshCw, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { getDhakaDateStr } from "@/lib/dateUtils";
import AllocationSheetSvg, { AllocationSheetData } from "@/components/AllocationSheetSvg";
import { parseVillas } from "../lib/constants";
import { ZONES, ZoneKey, majorityZone, loadVillaLayout, slotBySections } from "../lib/villaLayout";
import { isServiceDay, modCheckoutOf } from "@/lib/specialVillas";
import { isSpecialTaskRow, specialTaskText } from "@/lib/specialTasks";
import { loadSinnerSaint } from "@/lib/sinnerSaint";
import { loadPestControl } from "@/lib/pestControl";
import { loadLeavePeriods, LeaveCategory } from "@/lib/leavePeriods";
import { shortHostName } from "@/lib/hostProfile";
import { projectGuestDay, rowsByVilla, deriveHKStatus, villaStatusMap, movementTime, sheetColours } from "@/lib/guestDay";

const ordinal = (n: number) => {
  const v = n % 100;
  return n + (v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
};
// "2026-11-17" → "Housekeeping Allocation - 17th November 2026"
const allocationPdfName = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return `Housekeeping Allocation - ${ordinal(d)} ${month} ${y}`;
};

export default function AllocationSheetPage() {
  const [selectedDate, setSelectedDate] = useState<string>(getDhakaDateStr());
  const [loading, setLoading] = useState(false);
  const [sheetData, setSheetData] = useState<AllocationSheetData | null>(null);

  // Zoom control state (0.7x to 2.0x)
  // Opens bigger on desktop (the A4 sheet is small at 100%); phones keep 100%.
  const [defaultZoom, setDefaultZoom] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1);
  useEffect(() => {
    const z = window.innerWidth >= 768 ? 1.35 : 1;
    setDefaultZoom(z);
    setZoom(z);
  }, []);

  // Date helpers: ‹ › step a day, quick Yesterday / Today / Tomorrow
  const shiftDate = (ymd: string, days: number) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const x = new Date(y, m - 1, d + days);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const todayStr = getDhakaDateStr();
  const QUICK_DAYS = [
    { label: "Yesterday", date: shiftDate(todayStr, -1) },
    { label: "Today", date: todayStr },
    { label: "Tomorrow", date: shiftDate(todayStr, 1) },
  ];

  const handleZoomIn = () => setZoom((prev) => Math.min(2.0, +(prev + 0.15).toFixed(2)));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.7, +(prev - 0.15).toFixed(2)));
  const handleResetZoom = () => setZoom(defaultZoom);

  useEffect(() => {
    fetchSheetData();
  }, [selectedDate]);

  // Browsers name a "Save as PDF" file after the page title, e.g. "Housekeeping Allocation - 17th November 2026".
  // Set it for the duration of the print (button or Cmd/Ctrl+P), then put the normal title back.
  useEffect(() => {
    let previous = "";
    const before = () => { previous = document.title; document.title = allocationPdfName(selectedDate); };
    const after = () => { if (previous) document.title = previous; previous = ""; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, [selectedDate]);

  const fetchSheetData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Overall Daily Summary Row
      const { data: sumRows } = await supabase
        .from("hsk_daily_summary")
        .select("*")
        .eq("report_date", selectedDate)
        .or("villa_number.is.null,villa_number.eq.0")
        .limit(1);

      const summaryData = sumRows && sumRows.length > 0 ? sumRows[0] : null;

      let finalSummary = summaryData ? { ...summaryData } : { report_date: selectedDate };
      // Sinner / Saint: same list as the Summary board (carried until the guests depart, following villa moves)
      const ss = await loadSinnerSaint(selectedDate);
      finalSummary.sinner_villa = ss.sinners.map((e) => e.villa).join(" ");
      finalSummary.saint_villa = ss.saints.map((e) => e.villa).join(" ");

      // 2. Villa statuses: same guest list and same combined statuses (DEP/ARR, JOIN, TMA N…) as the Villa board
      const prevDay = new Date(`${selectedDate}T00:00:00`);
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDate = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, "0")}-${String(prevDay.getDate()).padStart(2, "0")}`;
      const [{ rows: todayGuestRows }, { rows: prevGuestRows }, { layout }] = await Promise.all([
        projectGuestDay(selectedDate),
        projectGuestDay(prevDate),
        loadVillaLayout(),
      ]);
      const todayByVilla = rowsByVilla(todayGuestRows);
      const prevByVilla = rowsByVilla(prevGuestRows);
      const timesByVilla = villaStatusMap(todayGuestRows);
      const prevTimesByVilla = villaStatusMap(prevGuestRows);

      // 3. Fetch Persistent Daily Ice Requests
      const { data: rawIceReqs } = await supabase
        .from("hsk_daily_requests")
        .select("villa_number, request_time, item_details")
        .eq("request_type", "Ice")
        .order("created_at", { ascending: true });

      const activeIce = (rawIceReqs || []).filter((r: any) => {
        const dep = r.item_details ? r.item_details.trim() : "";
        return !dep || dep >= selectedDate;
      });

      const formattedIce = activeIce.slice(0, 6).map((r: any) => {
        let timeStr = "";
        if (r.request_time) {
          if (r.request_time.includes("T")) {
            timeStr = r.request_time.split("T")[1]?.substring(0, 5) || "";
          } else {
            timeStr = r.request_time.substring(0, 5);
          }
        }
        return {
          villa: r.villa_number || "",
          time: timeStr,
          dep: r.item_details || "",
        };
      });

      // 4. Fetch Allocations joined with Host details
      const { data: allocs } = await supabase
        .from("hsk_allocations")
        .select("*, hosts:hsk_hosts(id, host_id, full_name, nicknames, mvpn, company_mobile, personal_mobile, role, sub_department, status)")
        .eq("report_date", selectedDate);

      // Pre-scan host IDs that are actively allocated to operational areas
      const operationalHostIds = new Set<string>();
      (allocs || []).forEach((a: any) => {
        if (a.area && a.area !== "admin" && a.host_id) {
          operationalHostIds.add(String(a.host_id));
        }
      });

      const villaByZone: Record<ZoneKey, any[]> = { jettyA: [], jettyB: [], jettyC: [], beach: [] };

      const poolHosts: any[] = [];
      const poolNight: string[] = [];
      const poolMod: string[] = [];
      const poolContinue: string[] = [];

      const paMorningFoh: string[] = [];
      const paMorningBoh: string[] = [];
      const paAfternoonFoh: string[] = [];
      const paAfternoonBoh: string[] = [];
      const paSpecialTasks: string[] = [];

      const adminList: any[] = [];
      const tailorList: any[] = [];
      const housemateList: any[] = [];
      const runnerList: any[] = [];
      const stepList: any[] = [];
      const luggageList: any[] = [];
      const gardenList: any[] = [];
      let gardenIncharge = { name: "", contact: "" };
      const gardenInchargeHosts: any[] = []; // built into one line further down, once all hosts are loaded
      const laundryList: any[] = [];
      const laundrySplitList: any[] = [];
      let laundryTitle1 = "MORNING";
      let laundryTitle2 = "SPLIT";

      (allocs || []).forEach((a: any) => {
        const hostObj = a.hosts;

        // Strictly ignore resigned or inactive hosts
        if (hostObj?.status && hostObj.status.toLowerCase() !== "active") {
          return;
        }
        // People marked Off / on leave are not on duty, so they are not printed
        if (isOffShift(a.shift)) {
          return;
        }

        const rawName = hostObj?.nicknames ? hostObj.nicknames.split(",")[0].trim() : hostObj?.full_name || "Unknown";
        const name = rawName.toUpperCase();

        // Standard contact for VA & general: MVPN + Company Mobile
        const contactNums = [
          hostObj?.mvpn,
          hostObj?.company_mobile,
        ]
          .map((n: any) => String(n || "").trim())
          .filter(Boolean);

        const contact = contactNums.join(" / ");

        // Runner and Luggage: MVPN ONLY
        const mvpnOnly = hostObj?.mvpn ? String(hostObj.mvpn).trim() : "";

        // Laundry: Personal Mobile ONLY
        const personalOnly = hostObj?.personal_mobile ? String(hostObj.personal_mobile).trim() : "";

        if (a.area === "villa") {
          const vNums = parseVillas(a.task_details || "");
          
          // Exclude attendants with NO assigned villas
          if (!vNums || vNums.length === 0) {
            return;
          }

          const villaList = vNums.map((v) => {
            const hk = deriveHKStatus(todayByVilla[v], prevByVilla[v], selectedDate);
            const c = sheetColours(hk);
            return { number: v, status: hk.label, bg: c.bg, textColor: c.text, time: hk.code === 'H/U' ? (isServiceDay(todayByVilla[v]?.remarks) ? 'SERVICE DAY' : '')
              : hk.code === 'MOD' ? (modCheckoutOf(todayByVilla[v]?.remarks) ? `C/O ${modCheckoutOf(todayByVilla[v]?.remarks).slice(8, 10)}/${modCheckoutOf(todayByVilla[v]?.remarks).slice(5, 7)}` : '')
              : movementTime(hk, timesByVilla[v], prevTimesByVilla[v]) };
          });

          // Same area as on the board: the jetty holding most of their villas
          villaByZone[majorityZone(vNums) || "jettyA"].push({ name, contact, villas: villaList, vNums });
        } else if (a.area === "water") {
          const sh = (a.shift || "").toLowerCase();
          if (sh.includes("night")) {
            poolNight.push(rawName);
          } else if (sh.includes("mod")) {
            poolMod.push(rawName);
          } else if (sh.includes("continue")) {
            poolContinue.push(rawName);
          } else {
            poolHosts.push({
              name: rawName,
              mvpn: mvpnOnly,
              allocation: a.task_details || a.shift || "",
            });
          }
        } else if (a.area === "public") {
          if (isSpecialTaskRow(a)) {
            const task = specialTaskText(a.task_details);
            if (task) paSpecialTasks.push(task);
            if (!a.host_id) return; // special-task row, not an attendant
          }
          const sh = (a.shift || "").toLowerCase();
          if (sh.includes("morning") || sh.includes("06:30")) {
            if (sh.includes("boh") || a.task_details?.toLowerCase().includes("boh")) paMorningBoh.push(rawName);
            else paMorningFoh.push(rawName);
          } else if (sh.includes("afternoon") || sh.includes("14:30")) {
            if (sh.includes("boh") || a.task_details?.toLowerCase().includes("boh")) paAfternoonBoh.push(rawName);
            else paAfternoonFoh.push(rawName);
          } else {
            paMorningFoh.push(rawName);
          }
        } else if (a.area === "admin") {
          // Exclude if already assigned to Water Room or any other operational area
          if (operationalHostIds.has(String(a.host_id))) {
            return;
          }
          // Display actual contact number (no "8 AM" fallback)
          adminList.push({ name: rawName, contact });
        } else if (a.area === "tailor") {
          tailorList.push({ name: rawName, no: personalOnly || contact }); // tailors: personal number
        } else if (a.area === "housemate") {
          housemateList.push({ name: rawName, no: mvpnOnly || contact });
        } else if (a.area === "riders") {
          const duty = riderDutyOf(a, hostObj);
          // key/shift are used below: people who are off are dropped, runners get AM / PM / Split
          const entry = { name: rawName, mvpn: mvpnOnly, key: String(hostObj?.host_id || a.host_id || ""), shift: a.shift || "" };
          if (duty === "Step") stepList.push({ ...entry, duty: "Step" });
          else if (duty === "Luggage") luggageList.push({ ...entry, duty: "Luggage" });
          else runnerList.push({ ...entry, duty: "Runner" });
        } else if (a.area === "garden" || a.area === "gardening") {
          if (a.shift?.toLowerCase().includes("incharge") || hostObj?.role?.toLowerCase().includes("supervisor")) {
            if (hostObj) gardenInchargeHosts.push(hostObj);
          } else {
            // Garden hosts: personal number only (the in-charge line shows MVPNs)
            gardenList.push({ name: rawName, contact: personalOnly, area: a.task_details || a.shift || "" });
          }
        } else if (a.area === "laundry") {
          // Personal contact ONLY for laundry
          // Split shift goes in the second (SPLIT) section, everyone else under MORNING
          if ((a.shift || "").toLowerCase().includes("split")) laundrySplitList.push({ name: rawName, no: personalOnly });
          else laundryList.push({ name: rawName, no: personalOnly });
          if (a.shift && a.shift.includes("/")) {
            const parts = a.shift.split("/");
            if (parts[0]) laundryTitle1 = parts[0].trim().toUpperCase();
            if (parts[1]) laundryTitle2 = parts[1].trim().toUpperCase();
          }
        }
      });

      // Same left-to-right order as the board's sections (preset villas first, then by first villa)
      const ordered = {} as Record<ZoneKey, any[]>;
      ZONES.forEach((z) => {
        ordered[z.key] = slotBySections(villaByZone[z.key], layout[z.key] || [], (x: any) => x.vNums).filter(Boolean);
      });

      // Pack left-to-right; pad any remaining empty slots to the far right
      const expandAttendants = (list: any[], maxRows: number, maxCols: number) => {
        const slots: any[] = [];
        list.forEach((item) => {
          let vils = [...item.villas];
          if (vils.length <= maxRows) {
            slots.push({ name: item.name, contact: item.contact, villas: vils });
          } else {
            while (vils.length > 0) {
              const chunk = vils.splice(0, maxRows);
              slots.push({ name: item.name, contact: item.contact, villas: chunk });
            }
          }
        });
        while (slots.length < maxCols) {
          slots.push({ name: "", contact: "", villas: [] });
        }
        return slots.slice(0, maxCols);
      };

      const finalJA = expandAttendants(ordered.jettyA, 9, 7);
      const finalJB = expandAttendants(ordered.jettyB, 8, 3);
      const finalJC = expandAttendants(ordered.jettyC, 8, 4);
      const finalBeach = expandAttendants(ordered.beach, 7, 7);

      // 5. Leaves & Off Days — From → To worked out from the main attendance sheet (see lib/leavePeriods):
      //    O/RO/PH = off (O with a "working day" comment doesn't count), a run with any AL is Annual Leave,
      //    otherwise SL/EL is Sick/Emergency. Approved leave requests are merged in (widest dates win).
      const [{ data: leaveReqs }, periods, { data: allHostsList }, { data: teamCfg }] = await Promise.all([
        supabase
          .from("hsk_leave_requests")
          .select("host_id, host_name, leave_type, start_date, end_date")
          .eq("status", "Approved")
          .lte("start_date", selectedDate)
          .gte("end_date", selectedDate),
        loadLeavePeriods(selectedDate),
        // No foreign key between attendance and hosts, so hosts are looked up by SSL number below
        supabase.from("hsk_hosts").select("id, host_id, full_name, nicknames, personal_mobile, mvpn, status"),
        supabase.from("hsk_constants").select("label").eq("type", "team_viewer_config").limit(1).maybeSingle(),
      ]);
      // Display names set in Host Profiles (team_viewer_config.nicknames, keyed by SSL no)
      let displayNames: Record<string, string> = {};
      try { displayNames = JSON.parse(teamCfg?.label || "{}").nicknames || {}; } catch { /* none */ }

      const hostMap = new Map();
      (allHostsList || []).forEach((h: any) => {
        if (h.id) hostMap.set(String(h.id), h);
        if (h.host_id) hostMap.set(String(h.host_id), h);
      });

      // Garden in-charge: one line for everyone in charge, "Adam & Allu", with each person's MVPN ("2731 / 2915").
      // A nickname like "Adam & Allu" names a second person: they are looked up by nickname so their MVPN is shown too.
      {
        const people: { id: string; name: string; mvpn: string }[] = [];
        const add = (h: any, name: string) => {
          if (!h || people.some((p) => p.id === h.id)) return;
          people.push({ id: h.id, name, mvpn: String(h.mvpn || "").trim() });
        };
        const activeHosts = (allHostsList || []).filter((h: any) => !h.status || h.status.toLowerCase() === "active");
        const byNickname = (n: string) => {
          const key = n.trim().toLowerCase();
          return activeHosts.find((h: any) => String(h.nicknames || "").split(",").some((x: string) => x.trim().toLowerCase() === key))
            || activeHosts.find((h: any) => String(h.full_name || "").trim().toLowerCase() === key);
        };
        gardenInchargeHosts.forEach((h) => {
          const nick = String(h.nicknames || "").split(",")[0].trim();
          const parts = nick.includes("&") ? nick.split("&").map((x) => x.trim()).filter(Boolean) : [];
          if (parts.length > 1) {
            add(h, parts[0]);
            parts.slice(1).forEach((p) => { const other = byNickname(p); if (other) add(other, p); else people.push({ id: p, name: p, mvpn: "" }); });
          } else {
            add(h, shortHostName(h, h.full_name || "", displayNames));
          }
        });
        if (people.length) {
          gardenIncharge = {
            name: people.map((p) => p.name).join(" & "),
            contact: people.map((p) => p.mvpn).filter(Boolean).join(" / "),
          };
        }
      }

      type Away = { key: string; name: string; contact: string; category: LeaveCategory; from: string; to: string };
      const RANK: Record<LeaveCategory, number> = { AL: 3, SICK: 2, OFF: 1 };
      const away = new Map<string, Away>();
      // One entry per person: the stronger category wins (AL > Sick > Off) and the dates are widened to cover both
      const addAway = (rawId: string, fallbackName: string, category: LeaveCategory, from: string, to: string) => {
        const h = hostMap.get(String(rawId).trim());
        if (h?.status && h.status.toLowerCase() !== "active") return;
        const key = String(h?.host_id || rawId).trim();
        const name = shortHostName(h, fallbackName || "Unknown", displayNames);
        const prev = away.get(key);
        if (!prev) { away.set(key, { key, name, contact: h?.personal_mobile || "", category, from, to }); return; }
        prev.category = RANK[category] > RANK[prev.category] ? category : prev.category;
        if (from < prev.from) prev.from = from;
        if (to > prev.to) prev.to = to;
      };

      periods.forEach((p) => addAway(p.host_id, p.host_id, p.category, p.from, p.to));

      (leaveReqs || []).forEach((lr: any) => {
        const lt = (lr.leave_type || "").toUpperCase();
        const cat: LeaveCategory | null = ["OFF", "O", "PH", "RO"].includes(lt) ? "OFF" : ["AL", "VAC"].includes(lt) ? "AL" : ["SL", "EL"].includes(lt) ? "SICK" : null;
        if (!cat) return;
        addAway(lr.host_id, lr.host_name, cat, lr.start_date || selectedDate, lr.end_date || lr.start_date || selectedDate);
      });

      const pad = (n: number) => String(n).padStart(2, "0");
      const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
      const all = Array.from(away.values()).sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
      // Two people with the same short name (e.g. two "Niyaz") → print their full names so they can be told apart
      const nameCount = new Map<string, number>();
      all.forEach((a) => nameCount.set(a.name.toLowerCase(), (nameCount.get(a.name.toLowerCase()) || 0) + 1));
      const label = (a: Away) => ((nameCount.get(a.name.toLowerCase()) || 0) > 1 ? hostMap.get(a.key)?.full_name || a.name : a.name);
      const toRow = (a: Away) => ({ name: label(a), contact: a.contact, from: a.from, to: a.to, duration: pad(daysBetween(a.from, a.to)) });
      const alList = all.filter((a) => a.category === "AL").map(toRow);
      const slList = all.filter((a) => a.category === "SICK").map(toRow);
      const offList = all.filter((a) => a.category === "OFF").map(toRow);

      // Runners / step / luggage who are off or on leave today are not on duty, even if the board still has them
      const onDuty = (r: any) => !away.has(r.key) && !away.has(String(hostMap.get(r.key)?.host_id || ""));
      const shiftRank = (sh: string) => (/afternoon|14:30|pm/i.test(sh) ? 2 : /split/i.test(sh) ? 1 : 0);
      const runners = runnerList.filter(onDuty).sort((a, b) => shiftRank(a.shift) - shiftRank(b.shift));
      const runnersOut = runners.map((r) => ({ name: r.name, mvpn: r.mvpn, duty: runnerShiftLabel(r.shift, runners.length) }));
      const stepsOut = stepList.filter(onDuty).map(({ name, mvpn, duty }) => ({ name, mvpn, duty }));
      const luggageOut = luggageList.filter(onDuty).map(({ name, mvpn, duty }) => ({ name, mvpn, duty }));

      setSheetData({
        summary: finalSummary,
        iceRequests: formattedIce,
        jettyA: finalJA,
        jettyB: finalJB,
        jettyC: finalJC,
        beach: finalBeach,
        pool: {
          hosts: poolHosts,
          night: poolNight,
          mod: poolMod,
          continueShift: poolContinue,
        },
        publicArea: {
          morningFoh: paMorningFoh,
          morningBoh: paMorningBoh,
          afternoonFoh: paAfternoonFoh,
          afternoonBoh: paAfternoonBoh,
          specialTasks: paSpecialTasks,
        },
        admin: adminList,
        tailor: tailorList,
        housemate: housemateList,
        runnerStepLuggage: {
          runner: runnersOut,
          step: stepsOut,
          luggage: luggageOut,
        },
        garden: {
          incharge: gardenIncharge,
          hosts: gardenList,
        },
        laundry: laundryList,
        laundrySplit: laundrySplitList,
        laundryDutyTitle1: laundryTitle1,
        laundryDutyTitle2: laundryTitle2,
        pestControl: (await loadPestControl()).team,
        specialTasks: {
          task1: paSpecialTasks[0] || "",
          task2: paSpecialTasks[1] || "",
          task3: paSpecialTasks[2] || "",
          task4: paSpecialTasks[3] || "",
          deepVilla: finalSummary?.deep_clean || "",
          oooVilla: finalSummary?.oos_villas || "",
          huVilla: "",
        },
        annualLeave: alList,
        sickLeave: slList,
        dayOff: offList,
      });
    } catch (err) {
      console.error("Failed to load allocation sheet", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-200 p-2 md:p-6 print:p-0 print:bg-white flex flex-col items-center">
      {/* SCREEN CONTROLS BAR WITH INTERACTIVE ZOOM */}
      <div className="print:hidden w-full max-w-[210mm] mb-4 bg-white p-3 rounded-2xl shadow-sm border border-slate-300 flex flex-wrap items-center justify-between gap-3 sticky top-2 z-50">
        <h1 className="text-sm font-black text-slate-800">Housekeeping Allocation Report</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom In, Zoom Out, Reset Controls */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="px-2 text-[10px] font-black text-slate-700 min-w-[42px] text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            {zoom !== defaultZoom && (
              <button
                onClick={handleResetZoom}
                className="p-1.5 hover:bg-white rounded-lg text-[#691c56] border-l border-slate-200 ml-1 transition-colors cursor-pointer"
                title="Reset zoom"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>

          {/* Quick days */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            {QUICK_DAYS.map((q) => (
              <button
                key={q.label}
                onClick={() => setSelectedDate(q.date)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${selectedDate === q.date ? "bg-[#691c56] text-white shadow-sm" : "text-slate-500 hover:bg-white"}`}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Date: step back / pick / step forward */}
          <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200">
            <button onClick={() => setSelectedDate((d) => shiftDate(d, -1))} className="p-1.5 hover:bg-white rounded-l-xl text-slate-600 cursor-pointer" title="Previous day">
              <ChevronLeft size={15} />
            </button>
            <div className="flex items-center gap-1.5 px-1.5 py-1.5 border-x border-slate-200">
              <Calendar size={14} className="text-[#691c56]" />
              <input
                type="date"
                className="bg-transparent font-black text-xs text-[#691c56] outline-none cursor-pointer"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              />
            </div>
            <button onClick={() => setSelectedDate((d) => shiftDate(d, 1))} className="p-1.5 hover:bg-white rounded-r-xl text-slate-600 cursor-pointer" title="Next day">
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={fetchSheetData}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Sheet"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-[#691c56]" : ""} />
          </button>

          {/* Print Sheet */}
          <button
            onClick={() => window.print()}
            className="bg-[#691c56] text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm hover:bg-[#521643] active:scale-95 transition-all cursor-pointer"
          >
            <Printer size={15} />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* RENDER EXACT A4 SVG COMPONENT WITH DYNAMIC ZOOM CONTAINER */}
      {/* CSS zoom (not transform) so a bigger sheet scrolls properly instead of being cut off at the sides */}
      <div className="w-full overflow-auto print:overflow-visible">
        <div
          className="sheet-zoom mx-auto bg-white border border-slate-300 shadow-xl print:border-0 print:shadow-none"
          style={{ width: "210mm", zoom }}
        >
          {sheetData && <AllocationSheetSvg data={sheetData} />}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .sheet-zoom {
            zoom: 1 !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
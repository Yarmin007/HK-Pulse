"use client";

import React, { useState, useEffect } from "react";
import { riderDutyOf, isOffShift } from "@/app/allocation/lib/riders";
import { supabase } from "@/lib/supabase";
import { Printer, Calendar, RefreshCw, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { getDhakaDateStr } from "@/lib/dateUtils";
import { isWorkedLeave } from "@/lib/attendanceData";
import AllocationSheetSvg, { AllocationSheetData } from "@/components/AllocationSheetSvg";
import { parseVillas } from "../lib/constants";
import { ZONES, ZoneKey, majorityZone, loadVillaLayout, slotBySections } from "../lib/villaLayout";
import { isServiceDay } from "@/lib/specialVillas";
import { projectGuestDay, rowsByVilla, deriveHKStatus, villaStatusMap, movementTime, sheetColours } from "@/lib/guestDay";

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
      if (!finalSummary.sinner_villa || !finalSummary.saint_villa) {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() - 1);
        const yesterday = d.toISOString().split("T")[0];

        const { data: yestRows } = await supabase
          .from("hsk_daily_summary")
          .select("sinner_villa, sinner_dep, saint_villa, saint_dep")
          .eq("report_date", yesterday)
          .or("villa_number.is.null,villa_number.eq.0")
          .limit(1);

        const yestSummary = yestRows && yestRows.length > 0 ? yestRows[0] : null;

        if (yestSummary) {
          if (!finalSummary.sinner_villa && yestSummary.sinner_villa && (!yestSummary.sinner_dep || yestSummary.sinner_dep >= selectedDate)) {
            finalSummary.sinner_villa = yestSummary.sinner_villa;
          }
          if (!finalSummary.saint_villa && yestSummary.saint_villa && (!yestSummary.saint_dep || yestSummary.saint_dep >= selectedDate)) {
            finalSummary.saint_villa = yestSummary.saint_villa;
          }
        }
      }

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
      const laundryList: any[] = [];
      let laundryTitle1 = "MORNING";
      let laundryTitle2 = "EVENING";
      const pestList: any[] = [];

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
            return { number: v, status: hk.label, bg: c.bg, textColor: c.text, time: hk.code === 'H/U' ? (isServiceDay(todayByVilla[v]?.remarks) ? 'SERVICE DAY' : '') : movementTime(hk, timesByVilla[v], prevTimesByVilla[v]) };
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
          if (a.task_details && a.task_details.toLowerCase().includes("special")) {
            paSpecialTasks.push(a.task_details);
          }
        } else if (a.area === "admin") {
          // Exclude if already assigned to Water Room or any other operational area
          if (operationalHostIds.has(String(a.host_id))) {
            return;
          }
          // Display actual contact number (no "8 AM" fallback)
          adminList.push({ name: rawName, contact });
        } else if (a.area === "tailor") {
          tailorList.push({ name: rawName, no: contact });
        } else if (a.area === "housemate") {
          housemateList.push({ name: rawName, no: mvpnOnly || contact });
        } else if (a.area === "riders") {
          const duty = riderDutyOf(a, hostObj);
          if (duty === "Step") stepList.push({ name: rawName, duty: "Step", mvpn: mvpnOnly });
          else if (duty === "Luggage") luggageList.push({ name: rawName, duty: "Luggage", mvpn: mvpnOnly });
          else runnerList.push({ name: rawName, duty: "Runner", mvpn: mvpnOnly });
        } else if (a.area === "garden" || a.area === "gardening") {
          if (a.shift?.toLowerCase().includes("incharge") || hostObj?.role?.toLowerCase().includes("supervisor")) {
            gardenIncharge = { name: rawName, contact };
          } else {
            gardenList.push({ name: rawName, contact, area: a.task_details || a.shift || "" });
          }
        } else if (a.area === "laundry") {
          // Personal contact ONLY for laundry
          laundryList.push({ name: rawName, no: personalOnly });
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

      // 5. Fetch Attendance (Leaves & Off Days)
      const { data: leaveReqs } = await supabase
        .from("hsk_leave_requests")
        .select("host_id, host_name, leave_type, start_date, end_date")
        .eq("status", "Approved")
        .lte("start_date", selectedDate)
        .gte("end_date", selectedDate);

      const { data: attList } = await supabase
        .from("hsk_attendance")
        // No foreign key between attendance and hosts, so hosts are looked up by SSL number below
        .select("host_id, status_code, shift_note")
        .eq("date", selectedDate);

      const { data: allHostsList } = await supabase
        .from("hsk_hosts")
        .select("id, host_id, full_name, nicknames, personal_mobile, status");

      const hostMap = new Map();
      (allHostsList || []).forEach((h: any) => {
        if (h.id) hostMap.set(String(h.id), h);
        if (h.host_id) hostMap.set(String(h.host_id), h);
      });

      const alList: any[] = [];
      const slList: any[] = [];
      const offMap = new Map<string, any>();

      (leaveReqs || []).forEach((lr: any) => {
        const h = hostMap.get(String(lr.host_id));
        if (h?.status && h.status.toLowerCase() !== "active") return;

        const displayName = h?.nicknames ? h.nicknames.split(",")[0].trim() : h?.full_name || lr.host_name || "Unknown";
        const personalNo = h?.personal_mobile || "";
        const lt = (lr.leave_type || "").toUpperCase();

        const fromDate = lr.start_date || selectedDate;
        const toDate = lr.end_date && lr.end_date !== lr.start_date ? lr.end_date : "NA";

        if (lt === "OFF" || lt === "PH" || lt === "O") {
          offMap.set(String(lr.host_id), {
            name: displayName,
            contact: personalNo,
            from: fromDate,
            to: toDate,
            duration: "01",
          });
        } else if (lt === "AL" || lt === "VAC") {
          alList.push({ name: displayName, from: fromDate, to: lr.end_date || selectedDate, duration: "01" });
        } else if (lt === "SL" || lt === "EL") {
          slList.push({ name: displayName, from: fromDate, to: lr.end_date || selectedDate, duration: "01" });
        }
      });

      (attList || []).forEach((att: any) => {
        const hObj = hostMap.get(String(att.host_id).trim());
        if (isWorkedLeave(att)) return; // "working day" comment: they are on duty
        if (hObj?.status && hObj.status.toLowerCase() !== "active") return;

        const displayName = hObj?.nicknames ? hObj.nicknames.split(",")[0].trim() : hObj?.full_name || att.host_id;
        const personalNo = hObj?.personal_mobile || "";
        const sc = (att.status_code || "").toUpperCase();

        if (["O", "OFF", "PH", "RO"].includes(sc)) {
          if (!offMap.has(String(att.host_id))) {
            offMap.set(String(att.host_id), {
              name: displayName,
              contact: personalNo,
              from: selectedDate,
              to: "NA",
              duration: "01",
            });
          }
        } else if (sc === "AL" || sc === "VAC") {
          if (!alList.some((x) => x.name === displayName)) {
            alList.push({ name: displayName, from: selectedDate, to: selectedDate, duration: "01" });
          }
        } else if (sc === "SL" || sc === "EL") {
          if (!slList.some((x) => x.name === displayName)) {
            slList.push({ name: displayName, from: selectedDate, to: selectedDate, duration: "01" });
          }
        }
      });

      const offList = Array.from(offMap.values());

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
          runner: runnerList,
          step: stepList,
          luggage: luggageList,
        },
        garden: {
          incharge: gardenIncharge,
          hosts: gardenList,
        },
        laundry: laundryList,
        laundryDutyTitle1: laundryTitle1,
        laundryDutyTitle2: laundryTitle2,
        pestControl: pestList,
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
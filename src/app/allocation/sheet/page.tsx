"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Printer, Calendar, RefreshCw, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { getDhakaDateStr } from "@/lib/dateUtils";
import AllocationSheetSvg, { AllocationSheetData } from "@/components/AllocationSheetSvg";
import { parseVillas, JETTY_A, JETTY_B, JETTY_C, BEACH, getDefaultArea } from "../lib/constants";

// Exact status colors:
// ARR: Green with Black text
// DEP: Red with White text
// VAC: Blue with Black text
// OCC: Normal (White with Dark text, no effect)
export const getStatusColors = (status: string) => {
  const st = String(status || "").trim().toUpperCase();

  if (st.includes("ARR")) {
    return {
      bg: "#22c55e",
      text: "#000000",
      colorClass: "bg-green-500 text-black",
    };
  }

  if (st.includes("DEP")) {
    return {
      bg: "#ef4444",
      text: "#ffffff",
      colorClass: "bg-rose-500 text-white",
    };
  }

  if (st.includes("VAC") || st === "VM/VAC") {
    return {
      bg: "#38bdf8",
      text: "#000000",
      colorClass: "bg-sky-400 text-black",
    };
  }

  if (st.includes("TMA")) {
    return {
      bg: "#facc15",
      text: "#0f172a",
      colorClass: "bg-yellow-400 text-slate-900",
    };
  }

  return {
    bg: "#ffffff",
    text: "#1e293b",
    colorClass: "bg-white text-slate-800",
  };
};

export default function AllocationSheetPage() {
  const [selectedDate, setSelectedDate] = useState<string>(getDhakaDateStr());
  const [loading, setLoading] = useState(false);
  const [sheetData, setSheetData] = useState<AllocationSheetData | null>(null);

  // Zoom control state (0.7x to 2.0x)
  const [zoom, setZoom] = useState<number>(1);

  const handleZoomIn = () => setZoom((prev) => Math.min(2.0, +(prev + 0.15).toFixed(2)));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.7, +(prev - 0.15).toFixed(2)));
  const handleResetZoom = () => setZoom(1);

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

      // 2. Fetch Master Guest / Villa Statuses
      const { data: masterVillas } = await supabase
        .from("hsk_daily_summary")
        .select("villa_number, status, arrival_time, departure_time")
        .eq("report_date", selectedDate)
        .gt("villa_number", 0);

      const statusMap: Record<string, string> = {};
      const timeMap: Record<string, string> = {};

      (masterVillas || []).forEach((m: any) => {
        const vKey = String(m.villa_number);
        statusMap[vKey] = m.status || "VAC";
        if (m.arrival_time) timeMap[vKey] = m.arrival_time;
        else if (m.departure_time) timeMap[vKey] = m.departure_time;
      });

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

      const rawJA: any[] = [];
      const rawJB: any[] = [];
      const rawJC: any[] = [];
      const rawBeach: any[] = [];

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
        const defaultArea = getDefaultArea(hostObj);

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
            const rawStatus = statusMap[String(v)] || "VAC";
            const colors = getStatusColors(rawStatus);
            return {
              number: v,
              status: rawStatus,
              time: timeMap[String(v)] || "",
              bg: colors.bg,
              textColor: colors.text,
              colorClass: colors.colorClass,
            };
          });

          const firstV = vNums[0];

          if (defaultArea === "beach" || hostObj?.sub_department?.toLowerCase().includes("beach")) {
            rawBeach.push({ name, contact, villas: villaList, firstV: firstV || 999 });
          } else {
            if (firstV && JETTY_A.includes(firstV)) {
              rawJA.push({ name, contact, villas: villaList, firstV });
            } else if (firstV && JETTY_B.includes(firstV)) {
              rawJB.push({ name, contact, villas: villaList, firstV });
            } else if (firstV && JETTY_C.includes(firstV)) {
              rawJC.push({ name, contact, villas: villaList, firstV });
            } else if (firstV && BEACH.includes(firstV)) {
              rawBeach.push({ name, contact, villas: villaList, firstV });
            } else {
              rawJA.push({ name, contact, villas: villaList, firstV: firstV || 999 });
            }
          }
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
          const sh = (a.shift || "").toLowerCase();
          if (sh.includes("step")) stepList.push({ name: rawName, duty: "Step", mvpn: mvpnOnly });
          else if (sh.includes("luggage")) luggageList.push({ name: rawName, duty: "Luggage", mvpn: mvpnOnly });
          else runnerList.push({ name: rawName, duty: "Runner", mvpn: mvpnOnly });
        } else if (a.area === "garden") {
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

      // Sort attendants ascending by first villa number to guarantee clean left-to-right alignment
      rawJA.sort((a, b) => a.firstV - b.firstV);
      rawJB.sort((a, b) => a.firstV - b.firstV);
      rawJC.sort((a, b) => a.firstV - b.firstV);
      rawBeach.sort((a, b) => a.firstV - b.firstV);

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

      const finalJA = expandAttendants(rawJA, 9, 7);
      const finalJB = expandAttendants(rawJB, 8, 3);
      const finalJC = expandAttendants(rawJC, 8, 4);
      const finalBeach = expandAttendants(rawBeach, 7, 7);

      // 5. Fetch Attendance (Leaves & Off Days)
      const { data: leaveReqs } = await supabase
        .from("hsk_leave_requests")
        .select("host_id, host_name, leave_type, start_date, end_date")
        .eq("status", "Approved")
        .lte("start_date", selectedDate)
        .gte("end_date", selectedDate);

      const { data: attList } = await supabase
        .from("hsk_attendance")
        .select("host_id, status_code, hosts:hsk_hosts(id, full_name, nicknames, personal_mobile, status)")
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
        const hObj = att.hosts || hostMap.get(String(att.host_id));
        if (hObj?.status && hObj.status.toLowerCase() !== "active") return;

        const displayName = hObj?.nicknames ? hObj.nicknames.split(",")[0].trim() : hObj?.full_name || att.host_id;
        const personalNo = hObj?.personal_mobile || "";
        const sc = (att.status_code || "").toUpperCase();

        if (["O", "OFF", "PH"].includes(sc)) {
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
        <div>
          <h1 className="text-sm font-black text-slate-800">Housekeeping Allocation Report</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Live Bound to Board Data</p>
        </div>

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
            {zoom !== 1 && (
              <button
                onClick={handleResetZoom}
                className="p-1.5 hover:bg-white rounded-lg text-[#691c56] border-l border-slate-200 ml-1 transition-colors cursor-pointer"
                title="Reset to 100%"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>

          {/* Date Picker */}
          <div className="flex items-center bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 gap-2">
            <Calendar size={14} className="text-[#691c56]" />
            <input
              type="date"
              className="bg-transparent font-black text-xs text-[#691c56] outline-none cursor-pointer"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
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
      <div className="w-full flex justify-center overflow-auto print:overflow-visible">
        <div
          className="bg-white border border-slate-300 shadow-xl print:border-0 print:shadow-none transition-transform duration-150 origin-top"
          style={{
            width: "210mm",
            transform: `scale(${zoom})`,
            marginBottom: zoom > 1 ? `${(zoom - 1) * 1180}px` : "0px",
          }}
        >
          {sheetData && <AllocationSheetSvg data={sheetData} />}
        </div>
      </div>

      <style jsx global>{`
        @media print {
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
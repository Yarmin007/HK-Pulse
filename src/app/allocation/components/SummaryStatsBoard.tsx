"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  BarChart3, 
  Save, 
  RefreshCw, 
  Percent, 
  Sparkles, 
  Sun, 
  Moon, 
  Coffee, 
  Copy,
  Plus,
  Trash2
} from "lucide-react";
import toast from "react-hot-toast";

interface SummaryStatsBoardProps {
  selectedDate: string;
  setIsDirty: (val: boolean) => void;
}

interface SpecialGuestVilla {
  villa: string;
  dep_date: string;
}

export default function SummaryStatsBoard({ selectedDate, setIsDirty }: SummaryStatsBoardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Core Summary Metrics
  const [summary, setSummary] = useState({
    occupancy_pct: "",
    occupied_count: "",
    arrivals_count: "",
    departures_count: "",
    villa_moves: "",
    repeater_villas: "",
    birthday_villas: "",
    anniversary_villas: "",
    honeymoon_villas: "",
    children_count: "",
    guest_in_house: "",
    deep_clean: "",
    deck_clean: "",
    oos_villas: "",
    maintenance_villas: "",
    pmp_villas: "",
    show_villa: "",
  });

  // Multiple Sinner & Multiple Saint Villa Lists
  const [sinnerList, setSinnerList] = useState<SpecialGuestVilla[]>([{ villa: "", dep_date: "" }]);
  const [saintList, setSaintList] = useState<SpecialGuestVilla[]>([{ villa: "", dep_date: "" }]);

  // 3 Boxes for Day Shut, Night Shut 1, Night Shut 2
  const [dayShutBoxes, setDayShutBoxes] = useState(["", "", ""]);
  const [nightShut1Boxes, setNightShut1Boxes] = useState(["", "", ""]);
  const [nightShut2Boxes, setNightShut2Boxes] = useState(["", "", ""]);

  // Persistent Daily Ice Requests
  const [iceRequests, setIceRequests] = useState<Array<{ id?: string; villa: string; time: string; dep_date: string }>>([
    { villa: "", time: "", dep_date: "" },
    { villa: "", time: "", dep_date: "" },
    { villa: "", time: "", dep_date: "" },
    { villa: "", time: "", dep_date: "" },
    { villa: "", time: "", dep_date: "" },
    { villa: "", time: "", dep_date: "" },
  ]);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const parseGuestPairs = (villasStr?: string, depsStr?: string): SpecialGuestVilla[] => {
    if (!villasStr) return [];
    try {
      if (depsStr && depsStr.startsWith("[")) {
        return JSON.parse(depsStr);
      }
    } catch {}

    const vList = (villasStr || "").split(" ").filter(Boolean);
    const dList = (depsStr || "").split(" ").filter(Boolean);
    return vList.map((v, i) => ({
      villa: v,
      dep_date: dList[i] || "",
    }));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Today's Overall Summary Row
      const { data: sumRows, error: sumErr } = await supabase
        .from("hsk_daily_summary")
        .select("*")
        .eq("report_date", selectedDate)
        .or("villa_number.is.null,villa_number.eq.0")
        .limit(1);

      if (sumErr) console.error("Summary fetch error:", sumErr);
      const sumData = sumRows && sumRows.length > 0 ? sumRows[0] : null;

      // 2. Fetch Yesterday's Summary to carry forward active Sinners and Saints
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      const yesterday = d.toISOString().split("T")[0];

      const { data: yestRows } = await supabase
        .from("hsk_daily_summary")
        .select("*")
        .eq("report_date", yesterday)
        .or("villa_number.is.null,villa_number.eq.0")
        .limit(1);

      const yestData = yestRows && yestRows.length > 0 ? yestRows[0] : null;

      if (sumData) {
        setSummary({
          occupancy_pct: sumData.occupancy_pct !== null && sumData.occupancy_pct !== undefined ? String(sumData.occupancy_pct) : "",
          occupied_count: sumData.occupied_count !== null && sumData.occupied_count !== undefined ? String(sumData.occupied_count) : "",
          arrivals_count: sumData.arrivals_count !== null && sumData.arrivals_count !== undefined ? String(sumData.arrivals_count) : "",
          departures_count: sumData.departures_count !== null && sumData.departures_count !== undefined ? String(sumData.departures_count) : "",
          villa_moves: sumData.villa_moves !== null && sumData.villa_moves !== undefined ? String(sumData.villa_moves) : "",
          repeater_villas: sumData.repeater_villas || "",
          birthday_villas: sumData.birthday_villas || "",
          anniversary_villas: sumData.anniversary_villas || "",
          honeymoon_villas: sumData.honeymoon_villas || "",
          children_count: sumData.children_count !== null && sumData.children_count !== undefined ? String(sumData.children_count) : "",
          guest_in_house: sumData.guest_in_house !== null && sumData.guest_in_house !== undefined ? String(sumData.guest_in_house) : "",
          deep_clean: sumData.deep_clean || "",
          deck_clean: sumData.deck_clean || "",
          oos_villas: sumData.oos_villas || "",
          maintenance_villas: sumData.maintenance_villas || "",
          pmp_villas: sumData.pmp_villas || "",
          show_villa: sumData.show_villa || "",
        });

        const loadedSinners = parseGuestPairs(sumData.sinner_villa, sumData.sinner_dep);
        setSinnerList(loadedSinners.length > 0 ? loadedSinners : [{ villa: "", dep_date: "" }]);

        const loadedSaints = parseGuestPairs(sumData.saint_villa, sumData.saint_dep);
        setSaintList(loadedSaints.length > 0 ? loadedSaints : [{ villa: "", dep_date: "" }]);

        const ds = (sumData.day_shut || "").split(" ").filter(Boolean);
        setDayShutBoxes([ds[0] || "", ds[1] || "", ds[2] || ""]);

        const ns1 = (sumData.night_shut_1 || "").split(" ").filter(Boolean);
        setNightShut1Boxes([ns1[0] || "", ns1[1] || "", ns1[2] || ""]);

        const ns2 = (sumData.night_shut_2 || "").split(" ").filter(Boolean);
        setNightShut2Boxes([ns2[0] || "", ns2[1] || "", ns2[2] || ""]);
      } else {
        let carriedSinners: SpecialGuestVilla[] = [];
        let carriedSaints: SpecialGuestVilla[] = [];

        if (yestData) {
          const ySinners = parseGuestPairs(yestData.sinner_villa, yestData.sinner_dep);
          carriedSinners = ySinners.filter(s => !s.dep_date || s.dep_date >= selectedDate);

          const ySaints = parseGuestPairs(yestData.saint_villa, yestData.saint_dep);
          carriedSaints = ySaints.filter(s => !s.dep_date || s.dep_date >= selectedDate);
        }

        setSummary({
          occupancy_pct: "",
          occupied_count: "",
          arrivals_count: "",
          departures_count: "",
          villa_moves: "",
          repeater_villas: "",
          birthday_villas: "",
          anniversary_villas: "",
          honeymoon_villas: "",
          children_count: "",
          guest_in_house: "",
          deep_clean: "",
          deck_clean: "",
          oos_villas: "",
          maintenance_villas: "",
          pmp_villas: "",
          show_villa: "",
        });
        setSinnerList(carriedSinners.length > 0 ? carriedSinners : [{ villa: "", dep_date: "" }]);
        setSaintList(carriedSaints.length > 0 ? carriedSaints : [{ villa: "", dep_date: "" }]);
        setDayShutBoxes(["", "", ""]);
        setNightShut1Boxes(["", "", ""]);
        setNightShut2Boxes(["", "", ""]);
      }

      // 3. Persistent Daily Ice Requests
      const { data: rawIceData, error: rawIceErr } = await supabase
        .from("hsk_daily_requests")
        .select("*")
        .eq("request_type", "Ice")
        .order("created_at", { ascending: true });

      if (rawIceErr) console.error("Ice fetch error:", rawIceErr);

      const activeIce = (rawIceData || []).filter((item: any) => {
        const dep = item.item_details ? item.item_details.trim() : "";
        return !dep || dep >= selectedDate;
      });

      const mappedIce = Array.from({ length: 6 }).map((_, i) => {
        const item = activeIce[i];
        if (!item) return { villa: "", time: "", dep_date: "" };
        const timeStr = item.request_time ? (item.request_time.includes("T") ? item.request_time.split("T")[1]?.substring(0, 5) : item.request_time.substring(0, 5)) : "";
        return {
          id: item.id,
          villa: item.villa_number || "",
          time: timeStr || "",
          dep_date: item.item_details || "",
        };
      });

      setIceRequests(mappedIce);
    } catch (err: any) {
      console.error("Failed to load summary stats:", err);
      toast.error(err?.message || "Failed to load summary stats");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (field: string, value: string) => {
    let formattedVal = value;
    if (field.includes("villas") || field.includes("clean") || field === "show_villa") {
      formattedVal = value.replace(/,/g, " ");
    }
    setSummary((prev) => ({ ...prev, [field]: formattedVal }));
    setIsDirty(true);
  };

  // Sinner Row Handlers
  const handleSinnerChange = (index: number, field: "villa" | "dep_date", value: string) => {
    const updated = [...sinnerList];
    updated[index] = { ...updated[index], [field]: value };
    setSinnerList(updated);
    setIsDirty(true);
  };

  const addSinnerRow = () => {
    setSinnerList([...sinnerList, { villa: "", dep_date: "" }]);
    setIsDirty(true);
  };

  const removeSinnerRow = (index: number) => {
    if (sinnerList.length === 1) {
      setSinnerList([{ villa: "", dep_date: "" }]);
    } else {
      setSinnerList(sinnerList.filter((_, i) => i !== index));
    }
    setIsDirty(true);
  };

  // Saint Row Handlers
  const handleSaintChange = (index: number, field: "villa" | "dep_date", value: string) => {
    const updated = [...saintList];
    updated[index] = { ...updated[index], [field]: value };
    setSaintList(updated);
    setIsDirty(true);
  };

  const addSaintRow = () => {
    setSaintList([...saintList, { villa: "", dep_date: "" }]);
    setIsDirty(true);
  };

  const removeSaintRow = (index: number) => {
    if (saintList.length === 1) {
      setSaintList([{ villa: "", dep_date: "" }]);
    } else {
      setSaintList(saintList.filter((_, i) => i !== index));
    }
    setIsDirty(true);
  };

  // Ice Update Handler
  const handleIceUpdate = (idx: number, field: "villa" | "time" | "dep_date", value: string) => {
    const updated = [...iceRequests];
    updated[idx] = { ...updated[idx], [field]: value };
    setIceRequests(updated);
    setIsDirty(true);
  };

  // Shut copy functions
  const copyPreviousDayShut = async (type: "day" | "night1" | "night2") => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split("T")[0];

    const { data: yestRows } = await supabase
      .from("hsk_daily_summary")
      .select("day_shut, night_shut_1, night_shut_2")
      .eq("report_date", yesterday)
      .or("villa_number.is.null,villa_number.eq.0")
      .limit(1);

    const yest = yestRows && yestRows.length > 0 ? yestRows[0] : null;

    if (!yest) {
      toast.error("No data found for yesterday.");
      return;
    }

    if (type === "day") {
      const parts = (yest.day_shut || "").split(" ").filter(Boolean);
      setDayShutBoxes([parts[0] || "", parts[1] || "", parts[2] || ""]);
      toast.success("Day Shut copied from yesterday!");
    } else if (type === "night1") {
      const parts = (yest.night_shut_1 || "").split(" ").filter(Boolean);
      setNightShut1Boxes([parts[0] || "", parts[1] || "", parts[2] || ""]);
      toast.success("Night Shut #1 copied from yesterday!");
    } else if (type === "night2") {
      const parts = (yest.night_shut_2 || "").split(" ").filter(Boolean);
      setNightShut2Boxes([parts[0] || "", parts[1] || "", parts[2] || ""]);
      toast.success("Night Shut #2 copied from yesterday!");
    }
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dayShutStr = dayShutBoxes.filter(Boolean).join(" ");
      const nightShut1Str = nightShut1Boxes.filter(Boolean).join(" ");
      const nightShut2Str = nightShut2Boxes.filter(Boolean).join(" ");

      const validSinners = sinnerList.filter(s => s.villa.trim() !== "");
      const sinnerVillaStr = validSinners.map(s => s.villa.trim()).join(" ");
      const sinnerDepStr = JSON.stringify(validSinners);

      const validSaints = saintList.filter(s => s.villa.trim() !== "");
      const saintVillaStr = validSaints.map(s => s.villa.trim()).join(" ");
      const saintDepStr = JSON.stringify(validSaints);

      const payload: any = {
        report_date: selectedDate,
        villa_number: 0,
        occupancy_pct: summary.occupancy_pct ? Number(summary.occupancy_pct) : null,
        occupied_count: summary.occupied_count ? Number(summary.occupied_count) : null,
        arrivals_count: summary.arrivals_count ? Number(summary.arrivals_count) : null,
        departures_count: summary.departures_count ? Number(summary.departures_count) : null,
        villa_moves: summary.villa_moves ? Number(summary.villa_moves) : null,
        repeater_villas: summary.repeater_villas.trim(),
        birthday_villas: summary.birthday_villas.trim(),
        anniversary_villas: summary.anniversary_villas.trim(),
        honeymoon_villas: summary.honeymoon_villas.trim(),
        children_count: summary.children_count ? Number(summary.children_count) : null,
        guest_in_house: summary.guest_in_house ? Number(summary.guest_in_house) : null,
        deep_clean: summary.deep_clean.trim(),
        deck_clean: summary.deck_clean.trim(),
        oos_villas: summary.oos_villas.trim(),
        maintenance_villas: summary.maintenance_villas.trim(),
        pmp_villas: summary.pmp_villas.trim(),
        sinner_villa: sinnerVillaStr,
        sinner_dep: sinnerDepStr,
        saint_villa: saintVillaStr,
        saint_dep: saintDepStr,
        show_villa: summary.show_villa.trim(),
        day_shut: dayShutStr,
        night_shut_1: nightShut1Str,
        night_shut_2: nightShut2Str,
      };

      const { data: existingRows } = await supabase
        .from("hsk_daily_summary")
        .select("id")
        .eq("report_date", selectedDate)
        .or("villa_number.is.null,villa_number.eq.0")
        .limit(1);

      const existingRecord = existingRows && existingRows.length > 0 ? existingRows[0] : null;

      let sumError = null;
      if (existingRecord?.id) {
        const { error } = await supabase
          .from("hsk_daily_summary")
          .update(payload)
          .eq("id", existingRecord.id);
        sumError = error;
      } else {
        const { error } = await supabase
          .from("hsk_daily_summary")
          .insert([payload]);
        sumError = error;
      }

      if (sumError) {
        throw new Error(sumError.message || JSON.stringify(sumError));
      }

      // Sync Ice Requests
      for (const item of iceRequests) {
        if (!item.villa.trim()) {
          if (item.id) {
            await supabase.from("hsk_daily_requests").delete().eq("id", item.id);
          }
          continue;
        }

        const dateTimeStr = item.time ? `${selectedDate}T${item.time}:00` : `${selectedDate}T12:00:00`;
        const icePayload: any = {
          request_type: "Ice",
          villa_number: item.villa.trim(),
          request_time: dateTimeStr,
          item_details: item.dep_date.trim(),
        };

        if (item.id) {
          const { error: eErr } = await supabase
            .from("hsk_daily_requests")
            .update(icePayload)
            .eq("id", item.id);
          if (eErr) console.warn("Ice update error:", eErr);
        } else {
          const { error: iErr } = await supabase
            .from("hsk_daily_requests")
            .insert([icePayload]);
          if (iErr) console.warn("Ice insert error:", iErr);
        }
      }

      setIsDirty(false);
      toast.success("Daily Stats & Ice Requests saved!");
      fetchData();
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Error saving stats: " + (err?.message || "Database update failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 items-start">
      <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
        {/* HEADER BAR */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-[#6D2158]">
              <BarChart3 size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Daily Operations Stats & Special Villas</h2>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">
                Ice, Sinner & Saint persist automatically until Guest Departure Date
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-all shadow-sm"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-[#6D2158] hover:bg-[#521643] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              <span>Save Stats</span>
            </button>
          </div>
        </div>

        {/* BOARD CONTENT */}
        <div className="p-5 flex-1 overflow-y-auto bg-slate-50/30 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* 1. OCCUPANCY & DAILY COUNTS */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
              <div className="border-b border-slate-100 pb-2">
                <span className="text-xs font-black uppercase text-[#6D2158] tracking-wider flex items-center gap-1.5">
                  <Percent size={14} /> Occupancy & Counts
                </span>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Two-digit numbers on print template</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Daily Occ %</label>
                  <input
                    type="number"
                    placeholder="e.g. 85"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-black text-center text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.occupancy_pct}
                    onChange={(e) => handleUpdate("occupancy_pct", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Villa Occupied</label>
                  <input
                    type="number"
                    placeholder="e.g. 74"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-black text-center text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.occupied_count}
                    onChange={(e) => handleUpdate("occupied_count", e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">No of Villa Arr</label>
                  <input
                    type="number"
                    placeholder="e.g. 12"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-black text-center text-emerald-700 outline-none focus:border-[#6D2158]"
                    value={summary.arrivals_count}
                    onChange={(e) => handleUpdate("arrivals_count", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">No of Villa Dep</label>
                  <input
                    type="number"
                    placeholder="e.g. 08"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-black text-center text-rose-700 outline-none focus:border-[#6D2158]"
                    value={summary.departures_count}
                    onChange={(e) => handleUpdate("departures_count", e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">No of Villa Moves</label>
                  <input
                    type="number"
                    placeholder="e.g. 03"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-black text-center text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.villa_moves}
                    onChange={(e) => handleUpdate("villa_moves", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Children in House</label>
                  <input
                    type="number"
                    placeholder="e.g. 15"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-black text-center text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.children_count}
                    onChange={(e) => handleUpdate("children_count", e.target.value)}
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Guest in House</label>
                  <input
                    type="number"
                    placeholder="e.g. 182"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-black text-center text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.guest_in_house}
                    onChange={(e) => handleUpdate("guest_in_house", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* 2. SPECIAL VILLA GROUPS */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
              <div className="border-b border-slate-100 pb-2">
                <span className="text-xs font-black uppercase text-[#6D2158] tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} /> Special Villa Groups
                </span>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Separate multiple villas with spaces</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="col-span-2">
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Repeater Villas</label>
                  <input
                    type="text"
                    placeholder="e.g. 12 45 67"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.repeater_villas}
                    onChange={(e) => handleUpdate("repeater_villas", e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">B-day Villas</label>
                  <input
                    type="text"
                    placeholder="e.g. 24 51"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.birthday_villas}
                    onChange={(e) => handleUpdate("birthday_villas", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Anniversary Villas</label>
                  <input
                    type="text"
                    placeholder="e.g. 14 38"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.anniversary_villas}
                    onChange={(e) => handleUpdate("anniversary_villas", e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Honeymoon Villas</label>
                  <input
                    type="text"
                    placeholder="e.g. 05 60"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.honeymoon_villas}
                    onChange={(e) => handleUpdate("honeymoon_villas", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Deep Cleaning</label>
                  <input
                    type="text"
                    placeholder="e.g. 42"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.deep_clean}
                    onChange={(e) => handleUpdate("deep_clean", e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Deck Cleaning</label>
                  <input
                    type="text"
                    placeholder="e.g. 18 20"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.deck_clean}
                    onChange={(e) => handleUpdate("deck_clean", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Out of Service (OOS)</label>
                  <input
                    type="text"
                    placeholder="e.g. 31"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.oos_villas}
                    onChange={(e) => handleUpdate("oos_villas", e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Maintenance</label>
                  <input
                    type="text"
                    placeholder="e.g. 09"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.maintenance_villas}
                    onChange={(e) => handleUpdate("maintenance_villas", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">PMP Villas</label>
                  <input
                    type="text"
                    placeholder="e.g. 71"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.pmp_villas}
                    onChange={(e) => handleUpdate("pmp_villas", e.target.value)}
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Show Villa</label>
                  <input
                    type="text"
                    placeholder="e.g. 21"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.show_villa}
                    onChange={(e) => handleUpdate("show_villa", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* 3. MULTI-SINNER & MULTI-SAINT, 3-BOX SHUT & PERSISTENT ICE REQUESTS */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
              
              {/* Dynamic Multiple Sinner Villas */}
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-black uppercase text-[#6D2158] tracking-wider flex items-center gap-1.5">
                    <Sun size={14} /> Sinner Villas
                  </span>
                  <button
                    type="button"
                    onClick={addSinnerRow}
                    className="text-[9px] font-bold text-[#6D2158] hover:bg-[#6D2158]/10 flex items-center gap-1 px-2 py-0.5 rounded border border-[#6D2158]/20 transition-colors"
                  >
                    <Plus size={10} /> Add Sinner
                  </button>
                </div>

                <div className="space-y-1.5">
                  {sinnerList.map((item, idx) => (
                    <div key={`sinner-${idx}`} className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      <input
                        type="text"
                        placeholder="Villa #"
                        className="w-20 bg-white border border-slate-300 rounded p-1 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
                        value={item.villa}
                        onChange={(e) => handleSinnerChange(idx, "villa", e.target.value)}
                      />
                      <input
                        type="date"
                        className="flex-1 bg-white border border-slate-300 rounded p-1 text-[10px] font-bold outline-none focus:border-[#6D2158]"
                        value={item.dep_date}
                        onChange={(e) => handleSinnerChange(idx, "dep_date", e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeSinnerRow(idx)}
                        className="p-1 text-slate-400 hover:text-rose-500 rounded"
                        title="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Multiple Saint Villas */}
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-black uppercase text-[#6D2158] tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} /> Saint Villas
                  </span>
                  <button
                    type="button"
                    onClick={addSaintRow}
                    className="text-[9px] font-bold text-[#6D2158] hover:bg-[#6D2158]/10 flex items-center gap-1 px-2 py-0.5 rounded border border-[#6D2158]/20 transition-colors"
                  >
                    <Plus size={10} /> Add Saint
                  </button>
                </div>

                <div className="space-y-1.5">
                  {saintList.map((item, idx) => (
                    <div key={`saint-${idx}`} className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      <input
                        type="text"
                        placeholder="Villa #"
                        className="w-20 bg-white border border-slate-300 rounded p-1 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
                        value={item.villa}
                        onChange={(e) => handleSaintChange(idx, "villa", e.target.value)}
                      />
                      <input
                        type="date"
                        className="flex-1 bg-white border border-slate-300 rounded p-1 text-[10px] font-bold outline-none focus:border-[#6D2158]"
                        value={item.dep_date}
                        onChange={(e) => handleSaintChange(idx, "dep_date", e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeSaintRow(idx)}
                        className="p-1 text-slate-400 hover:text-rose-500 rounded"
                        title="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3-BOX DAY SHUT, NIGHT SHUT 1 & 2 */}
              <div className="border-b border-slate-100 pb-3 space-y-3">
                <span className="text-xs font-black uppercase text-[#6D2158] tracking-wider flex items-center gap-1.5">
                  <Moon size={14} /> Shut Villas (3 Box Slots)
                </span>

                {/* Day Shut */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] font-black uppercase text-slate-500">Day Shut</label>
                    <button
                      type="button"
                      onClick={() => copyPreviousDayShut("day")}
                      className="text-[9px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                    >
                      <Copy size={10} /> Copy Yesterday
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((idx) => (
                      <input
                        key={`ds-${idx}`}
                        type="text"
                        placeholder={`Villa ${idx + 1}`}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
                        value={dayShutBoxes[idx]}
                        onChange={(e) => {
                          const updated = [...dayShutBoxes];
                          updated[idx] = e.target.value.trim();
                          setDayShutBoxes(updated);
                          setIsDirty(true);
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Night Shut 1 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] font-black uppercase text-slate-500">Night Shut #1</label>
                    <button
                      type="button"
                      onClick={() => copyPreviousDayShut("night1")}
                      className="text-[9px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                    >
                      <Copy size={10} /> Copy Yesterday
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((idx) => (
                      <input
                        key={`ns1-${idx}`}
                        type="text"
                        placeholder={`Villa ${idx + 1}`}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
                        value={nightShut1Boxes[idx]}
                        onChange={(e) => {
                          const updated = [...nightShut1Boxes];
                          updated[idx] = e.target.value.trim();
                          setNightShut1Boxes(updated);
                          setIsDirty(true);
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Night Shut 2 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] font-black uppercase text-slate-500">Night Shut #2</label>
                    <button
                      type="button"
                      onClick={() => copyPreviousDayShut("night2")}
                      className="text-[9px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                    >
                      <Copy size={10} /> Copy Yesterday
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((idx) => (
                      <input
                        key={`ns2-${idx}`}
                        type="text"
                        placeholder={`Villa ${idx + 1}`}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
                        value={nightShut2Boxes[idx]}
                        onChange={(e) => {
                          const updated = [...nightShut2Boxes];
                          updated[idx] = e.target.value.trim();
                          setNightShut2Boxes(updated);
                          setIsDirty(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* PERSISTENT DAILY ICE REQUESTS */}
              <div className="flex flex-col gap-2">
                <div>
                  <span className="text-xs font-black uppercase text-[#6D2158] tracking-wider flex items-center gap-1.5">
                    <Coffee size={14} /> Daily Ice Requests
                  </span>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                    Persists every day until Departure Date is reached
                  </p>
                </div>

                <div className="grid grid-cols-12 gap-1.5 text-[9px] font-black uppercase text-slate-400 px-1">
                  <span className="col-span-3 text-center">Villa</span>
                  <span className="col-span-4 text-center">Time</span>
                  <span className="col-span-5 text-center">Dep Date</span>
                </div>

                <div className="space-y-1.5">
                  {iceRequests.map((req, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      <input
                        type="text"
                        placeholder={`#${i + 1}`}
                        className="col-span-3 bg-white border border-slate-300 rounded p-1 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
                        value={req.villa}
                        onChange={(e) => handleIceUpdate(i, "villa", e.target.value)}
                      />
                      <input
                        type="time"
                        className="col-span-4 bg-white border border-slate-300 rounded p-1 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
                        value={req.time}
                        onChange={(e) => handleIceUpdate(i, "time", e.target.value)}
                      />
                      <input
                        type="date"
                        className="col-span-5 bg-white border border-slate-300 rounded p-1 text-[10px] font-bold outline-none focus:border-[#6D2158]"
                        value={req.dep_date}
                        onChange={(e) => handleIceUpdate(i, "dep_date", e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
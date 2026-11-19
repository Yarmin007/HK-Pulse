"use client";

import React, { useState, useEffect, useRef } from "react";
import { isExcelFile, excelFileToCsv } from "@/lib/memoExcel";
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
  Trash2,
  Upload,
  CheckCircle2,
  X,
  Plane
} from "lucide-react";
import toast from "react-hot-toast";
import { parseMemoSummary, type ExtractedMemoData, type SpecialGuestVilla } from "@/lib/memoSummary";
import { projectGuestDay, normalizeVilla, stayDepartureIso } from "@/lib/guestDay";
import { followGuest } from "@/lib/followGuest";
import { loadSinnerSaint, latestDep } from "@/lib/sinnerSaint";

interface SummaryStatsBoardProps {
  selectedDate: string;
  setIsDirty: (val: boolean) => void;
}



export default function SummaryStatsBoard({ selectedDate, setIsDirty }: SummaryStatsBoardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    mod_villa: "",
  });

  // Multiple Sinner & Multiple Saint Villa Lists
  // Today's guest list, kept so typing a villa can fill its departure date straight away
  const guestRowsRef = useRef<any[]>([]);
  const guestAt = (villa: string) => {
    const v = normalizeVilla(villa);
    if (!v || !/^\d+$/.test(villa.trim())) return null;
    const row = guestRowsRef.current.find((r) => normalizeVilla(r.villa_number) === v);
    const dep = row ? stayDepartureIso(row.stay_dates || "", selectedDate) : "";
    return row && (dep || row.guest_name) ? { dep_date: dep, guest_name: String(row.guest_name || "") } : null;
  };
  const [sinnerList, setSinnerList] = useState<SpecialGuestVilla[]>([{ villa: "", dep_date: "" }]);
  const [saintList, setSaintList] = useState<SpecialGuestVilla[]>([{ villa: "", dep_date: "" }]);

  // 3 Boxes for Day Shut, Night Shut 1, Night Shut 2 + Timings
  const [dayShutBoxes, setDayShutBoxes] = useState(["", "", ""]);
  const [dayShutTimes, setDayShutTimes] = useState({ arr: "", dep: "" });

  const [nightShut1Boxes, setNightShut1Boxes] = useState(["", "", ""]);
  const [nightShut1Arr, setNightShut1Arr] = useState("");

  const [nightShut2Boxes, setNightShut2Boxes] = useState(["", "", ""]);
  const [nightShut2Arr, setNightShut2Arr] = useState("");

  // Memo Confirmation Modal
  const [extractedPreview, setExtractedPreview] = useState<ExtractedMemoData | null>(null);

  // Persistent Daily Ice Requests
  const [iceRequests, setIceRequests] = useState<Array<{ id?: string; villa: string; time: string; dep_date: string; guest_name?: string }>>([
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sumRows, error: sumErr } = await supabase
        .from("hsk_daily_summary")
        .select("*")
        .eq("report_date", selectedDate)
        .or("villa_number.is.null,villa_number.eq.0")
        .limit(1);

      if (sumErr) console.error("Summary fetch error:", sumErr);
      const sumData = sumRows && sumRows.length > 0 ? sumRows[0] : null;

      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      const yesterday = d.toISOString().split("T")[0];


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
          mod_villa: sumData.mod_villa || "",
        });



        const ds = (sumData.day_shut || "").split(" ").filter(Boolean);
        setDayShutBoxes([ds[0] || "", ds[1] || "", ds[2] || ""]);
        setDayShutTimes({
          arr: sumData.day_shut_arr || "",
          dep: sumData.day_shut_dep || "",
        });

        const ns1 = (sumData.night_shut_1 || "").split(" ").filter(Boolean);
        setNightShut1Boxes([ns1[0] || "", ns1[1] || "", ns1[2] || ""]);
        setNightShut1Arr(sumData.night_shut_1_arr || "");

        const ns2 = (sumData.night_shut_2 || "").split(" ").filter(Boolean);
        setNightShut2Boxes([ns2[0] || "", ns2[1] || "", ns2[2] || ""]);
        setNightShut2Arr(sumData.night_shut_2_arr || "");
      } else {
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
          mod_villa: "",
        });
        setDayShutBoxes(["", "", ""]);
        setDayShutTimes({ arr: "", dep: "" });
        setNightShut1Boxes(["", "", ""]);
        setNightShut1Arr("");
        setNightShut2Boxes(["", "", ""]);
        setNightShut2Arr("");
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
          guest_name: item.guest_name || "",
        };
      });

      // Follow each guest on the guest list: new villa after a move, departure date from their stay
      const [{ rows: todayGuests }, { rows: prevGuests }] = await Promise.all([projectGuestDay(selectedDate), projectGuestDay(yesterday)]);
      guestRowsRef.current = todayGuests;

      // Sinner / Saint: kept until the guest departs, carried over from the last saved day
      const { sinners, saints } = await loadSinnerSaint(selectedDate, { today: todayGuests, prev: prevGuests });
      setSinnerList(sinners.length > 0 ? sinners : [{ villa: "", dep_date: "" }]);
      setSaintList(saints.length > 0 ? saints : [{ villa: "", dep_date: "" }]);

      // Ice: rows live across days, so a move / new dep date is written straight back (no Save needed)
      const fIce = mappedIce.map((item) => {
        if (!item.villa.trim()) return item;
        const g = followGuest(item.villa, selectedDate, todayGuests, prevGuests, item.guest_name);
        if (!g) return item;
        return { ...item, villa: g.villa, dep_date: g.dep_date || item.dep_date, guest_name: g.guest_name || item.guest_name };
      });
      setIceRequests(fIce);
      const iceUpdates = fIce.filter((it, i) => it.id && (it.villa !== mappedIce[i].villa || it.dep_date !== mappedIce[i].dep_date || it.guest_name !== mappedIce[i].guest_name));
      await Promise.all(iceUpdates.map((it) =>
        supabase.from("hsk_daily_requests").update({ villa_number: it.villa, item_details: it.dep_date, guest_name: it.guest_name || null }).eq("id", it.id!)
      ));
      const moved = iceUpdates.filter((it) => it.villa !== mappedIce.find((m) => m.id === it.id)?.villa);
      if (moved.length > 0) toast.success(`Ice moved with guest: ${moved.map((it) => `${mappedIce.find((m) => m.id === it.id)?.villa} → ${it.villa}`).join(", ")}`);
    } catch (err: any) {
      console.error("Failed to load summary stats:", err);
      toast.error(err?.message || "Failed to load summary stats");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (field: string, value: string) => {
    let formattedVal = value;
    if (field.includes("villas") || field.includes("clean") || field === "show_villa" || field === "mod_villa") {
      formattedVal = value.replace(/,/g, " ");
    }
    setSummary((prev) => ({ ...prev, [field]: formattedVal }));
    setIsDirty(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // The memo's Excel file works too (converted to the same CSV text)
    if (isExcelFile(file.name)) {
      excelFileToCsv(file)
        .then((csv) => setExtractedPreview(parseMemoCSV(csv)))
        .catch((err: any) => toast.error("Failed to read the Excel memo: " + (err?.message || err)));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const csvText = event.target?.result as string;
      if (!csvText) return;
      try {
        const parsed = parseMemoCSV(csvText);
        setExtractedPreview(parsed);
      } catch (err: any) {
        toast.error("Failed to parse memo: " + err.message);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parseMemoCSV = (csvText: string): ExtractedMemoData => parseMemoSummary(csvText, selectedDate);

  const applyExtractedData = () => {
    if (!extractedPreview) return;

    setSummary((prev) => ({
      ...prev,
      occupancy_pct: extractedPreview.occupancy_pct || prev.occupancy_pct,
      occupied_count: extractedPreview.occupied_count || prev.occupied_count,
      arrivals_count: extractedPreview.arrivals_count || prev.arrivals_count,
      departures_count: extractedPreview.departures_count || prev.departures_count,
      villa_moves: extractedPreview.villa_moves || prev.villa_moves,
      children_count: extractedPreview.children_count || prev.children_count,
      guest_in_house: extractedPreview.guest_in_house || prev.guest_in_house,
      repeater_villas: extractedPreview.repeater_villas || prev.repeater_villas,
      birthday_villas: extractedPreview.birthday_villas || prev.birthday_villas,
      anniversary_villas: extractedPreview.anniversary_villas || prev.anniversary_villas,
      honeymoon_villas: extractedPreview.honeymoon_villas || prev.honeymoon_villas,
      show_villa: extractedPreview.show_villa || prev.show_villa,
      mod_villa: extractedPreview.mod_villa || prev.mod_villa,
    }));

    if (extractedPreview.sinners && extractedPreview.sinners.length > 0) {
      setSinnerList((prev) => {
        const existing = prev.filter((s) => s.villa.trim() !== "");
        return [...existing, ...extractedPreview.sinners];
      });
    }

    if (extractedPreview.saints && extractedPreview.saints.length > 0) {
      setSaintList((prev) => {
        const existing = prev.filter((s) => s.villa.trim() !== "");
        return [...existing, ...extractedPreview.saints];
      });
    }

    if (extractedPreview.day_shut.some(Boolean)) {
      setDayShutBoxes(extractedPreview.day_shut);
      setDayShutTimes({
        arr: extractedPreview.day_shut_arr,
        dep: extractedPreview.day_shut_dep,
      });
    }

    if (extractedPreview.night_shut_1.some(Boolean)) {
      setNightShut1Boxes(extractedPreview.night_shut_1);
      setNightShut1Arr(extractedPreview.night_shut_1_arr);
    }

    if (extractedPreview.night_shut_2.some(Boolean)) {
      setNightShut2Boxes(extractedPreview.night_shut_2);
      setNightShut2Arr(extractedPreview.night_shut_2_arr);
    }

    setExtractedPreview(null);
    setIsDirty(true);
    toast.success("Memo data imported successfully! Remember to review and save.");
  };

  // Sinner Row Handlers
  const handleSinnerChange = (index: number, field: "villa" | "dep_date", value: string) => {
    const updated = [...sinnerList];
    updated[index] = { ...updated[index], [field]: value };
    // Typing a villa fills the departure date from the guest list
    if (field === "villa") { const g = guestAt(value); if (g?.dep_date) updated[index].dep_date = g.dep_date; }
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
    if (field === "villa") { const g = guestAt(value); if (g?.dep_date) updated[index].dep_date = g.dep_date; }
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
    // Typing a villa fills the departure date (and remembers the guest, so the ice follows them if they move)
    if (field === "villa") {
      const g = guestAt(value);
      updated[idx] = { ...updated[idx], dep_date: g?.dep_date || (value.trim() ? updated[idx].dep_date : ""), guest_name: g?.guest_name || "" };
    }
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
      .select("day_shut, day_shut_arr, day_shut_dep, night_shut_1, night_shut_1_arr, night_shut_2, night_shut_2_arr")
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
      setDayShutTimes({ arr: yest.day_shut_arr || "", dep: yest.day_shut_dep || "" });
      toast.success("Day Shut copied from yesterday!");
    } else if (type === "night1") {
      const parts = (yest.night_shut_1 || "").split(" ").filter(Boolean);
      setNightShut1Boxes([parts[0] || "", parts[1] || "", parts[2] || ""]);
      setNightShut1Arr(yest.night_shut_1_arr || "");
      toast.success("Night Shut #1 copied from yesterday!");
    } else if (type === "night2") {
      const parts = (yest.night_shut_2 || "").split(" ").filter(Boolean);
      setNightShut2Boxes([parts[0] || "", parts[1] || "", parts[2] || ""]);
      setNightShut2Arr(yest.night_shut_2_arr || "");
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

      const validSinners = sinnerList.filter((s) => s.villa.trim() !== "");
      const sinnerVillaStr = validSinners.map((s) => s.villa.trim()).join(" ");
      const sinnerDepDate = latestDep(validSinners);

      const validSaints = saintList.filter((s) => s.villa.trim() !== "");
      const saintVillaStr = validSaints.map((s) => s.villa.trim()).join(" ");
      const saintDepDate = latestDep(validSaints);

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
        sinner_dep: sinnerDepDate,
        saint_villa: saintVillaStr,
        saint_dep: saintDepDate,
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
          guest_name: item.guest_name || null,
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
                Upload the daily memo (Excel or CSV) or enter stats manually
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.xlsx,.xlsm,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
              title="Upload Daily Memo CSV"
            >
              <Upload size={14} />
              <span>Upload Memo (.csv)</span>
            </button>

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
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                    Arrival Repeaters (Today Only)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1 8 11 15 22 44 91 92"
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
                    placeholder="e.g. 15"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.anniversary_villas}
                    onChange={(e) => handleUpdate("anniversary_villas", e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Honeymoon Villas</label>
                  <input
                    type="text"
                    placeholder="e.g. 37"
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

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Show Villa</label>
                  <input
                    type="text"
                    placeholder="e.g. 21"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800 outline-none focus:border-[#6D2158]"
                    value={summary.show_villa}
                    onChange={(e) => handleUpdate("show_villa", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Weekend MOD Villa</label>
                  <input
                    type="text"
                    placeholder="e.g. 45"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-purple-900 outline-none focus:border-[#6D2158]"
                    value={summary.mod_villa}
                    onChange={(e) => handleUpdate("mod_villa", e.target.value)}
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
                    <Sun size={14} /> Sinner Villas (HBSI / FBSI)
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
                    <Sparkles size={14} /> Saint Villas (HBSA / FBSA)
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
                  <Moon size={14} /> Seaplane Shut Villas
                </span>

                {/* Day Shut */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Plane size={12} className="text-amber-700" />
                      <label className="text-[10px] font-black uppercase text-slate-700">Day Shut</label>
                    </div>
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
                        className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
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
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 font-bold">Resort Arr:</span>
                      <input
                        type="text"
                        placeholder="e.g. 1:30 PM"
                        className="flex-1 bg-white border border-slate-300 rounded px-1.5 py-0.5 font-bold text-slate-700 outline-none"
                        value={dayShutTimes.arr}
                        onChange={(e) => {
                          setDayShutTimes((p) => ({ ...p, arr: e.target.value }));
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 font-bold">Leave to Apt:</span>
                      <input
                        type="text"
                        placeholder="e.g. 3:50 PM"
                        className="flex-1 bg-white border border-slate-300 rounded px-1.5 py-0.5 font-bold text-slate-700 outline-none"
                        value={dayShutTimes.dep}
                        onChange={(e) => {
                          setDayShutTimes((p) => ({ ...p, dep: e.target.value }));
                          setIsDirty(true);
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Night Shut 1 */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Plane size={12} className="text-indigo-700" />
                      <label className="text-[10px] font-black uppercase text-slate-700">Night Shut #1</label>
                    </div>
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
                        className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
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
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-slate-400 font-bold">Resort Arr:</span>
                    <input
                      type="text"
                      placeholder="e.g. 4:45 PM"
                      className="w-32 bg-white border border-slate-300 rounded px-1.5 py-0.5 font-bold text-slate-700 outline-none"
                      value={nightShut1Arr}
                      onChange={(e) => {
                        setNightShut1Arr(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </div>
                </div>

                {/* Night Shut 2 */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Plane size={12} className="text-indigo-700" />
                      <label className="text-[10px] font-black uppercase text-slate-700">Night Shut #2</label>
                    </div>
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
                        className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-center font-bold text-xs outline-none focus:border-[#6D2158]"
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
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-slate-400 font-bold">Resort Arr:</span>
                    <input
                      type="text"
                      placeholder="e.g. 5:15 PM"
                      className="w-32 bg-white border border-slate-300 rounded px-1.5 py-0.5 font-bold text-slate-700 outline-none"
                      value={nightShut2Arr}
                      onChange={(e) => {
                        setNightShut2Arr(e.target.value);
                        setIsDirty(true);
                      }}
                    />
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

      {/* CONFIRMATION MODAL FOR MEMO IMPORT */}
      {extractedPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-[#6D2158]" />
                <h3 className="text-sm font-bold text-slate-800">Confirm Memo Data Extraction</h3>
              </div>
              <button
                onClick={() => setExtractedPreview(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs text-slate-700 max-h-[70vh] overflow-y-auto">
              <p className="text-[11px] text-slate-500 font-bold">
                Review the parameters parsed from your uploaded memo before applying them:
              </p>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Daily Occupancy:</span>
                  <strong className="text-slate-800">{extractedPreview.occupancy_pct}%</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Villa Occupied:</span>
                  <strong className="text-slate-800">{extractedPreview.occupied_count}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Arrivals / Departures:</span>
                  <strong className="text-slate-800">{extractedPreview.arrivals_count} Arr / {extractedPreview.departures_count} Dep</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Villa Moves:</span>
                  <strong className="text-slate-800">{extractedPreview.villa_moves}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Guest / Children in House:</span>
                  <strong className="text-slate-800">{extractedPreview.guest_in_house} / {extractedPreview.children_count}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Weekend MOD Villa:</span>
                  <strong className="text-purple-900">{extractedPreview.mod_villa || "None"}</strong>
                </div>
              </div>

              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Arrival Repeaters (SSLM Only):</span>
                  <strong className="text-[#6D2158]">{extractedPreview.repeater_villas || "None"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Anniversary Villas:</span>
                  <strong>{extractedPreview.anniversary_villas || "None"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Honeymoon Villas:</span>
                  <strong>{extractedPreview.honeymoon_villas || "None"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Birthday Villas:</span>
                  <strong>{extractedPreview.birthday_villas || "None"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Sinners (HBSI / FBSI):</span>
                  <strong>
                    {extractedPreview.sinners && extractedPreview.sinners.length > 0
                      ? extractedPreview.sinners.map((s) => `#${s.villa} (Dep: ${s.dep_date || "N/A"})`).join(", ")
                      : "None"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Saints (HBSA / FBSA):</span>
                  <strong>
                    {extractedPreview.saints && extractedPreview.saints.length > 0
                      ? extractedPreview.saints.map((s) => `#${s.villa} (Dep: ${s.dep_date || "N/A"})`).join(", ")
                      : "None"}
                  </strong>
                </div>
              </div>

              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-800 block text-[11px]">Seaplane Shutdown Villas:</span>
                <div className="text-[11px]">
                  <strong>Day Shut:</strong> {extractedPreview.day_shut.filter(Boolean).join(" ") || "None"} 
                  {extractedPreview.day_shut_arr && ` (Resort Arr: ${extractedPreview.day_shut_arr} / Leave to Apt: ${extractedPreview.day_shut_dep})`}
                </div>
                <div className="text-[11px]">
                  <strong>Night Shut #1:</strong> {extractedPreview.night_shut_1.filter(Boolean).join(" ") || "None"} 
                  {extractedPreview.night_shut_1_arr && ` (Resort Arr: ${extractedPreview.night_shut_1_arr})`}
                </div>
                <div className="text-[11px]">
                  <strong>Night Shut #2:</strong> {extractedPreview.night_shut_2.filter(Boolean).join(" ") || "None"} 
                  {extractedPreview.night_shut_2_arr && ` (Resort Arr: ${extractedPreview.night_shut_2_arr})`}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExtractedPreview(null)}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyExtractedData}
                className="px-4 py-1.5 bg-[#6D2158] hover:bg-[#521643] text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                <span>Confirm & Apply</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
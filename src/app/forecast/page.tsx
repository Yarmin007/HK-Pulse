"use client";
import React, { useState, useEffect } from 'react';
import {
  UploadCloud, CalendarDays, Users, FileSpreadsheet, Loader2, PlaneLanding, MapPin, CheckCircle2, ChevronDown, ChevronRight, Baby, Utensils, Save, BarChart3, GanttChart
} from 'lucide-react';
import { format, parseISO, isAfter, isToday, isTomorrow, addDays, startOfToday } from 'date-fns';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

type FutureArrival = {
  villa: string;
  names: string;
  adults: number;
  kids: number;
  arrivalDate: string;
  departureDate: string;
  arrivalTime: string;
  flight: string;
  mealPlan: string;
  vipLevel: string;
  jetty: string;
};

type DailySummary = {
  date: string;
  dateLabel: string;
  totalVillas: number;
  totalAdults: number;
  totalKids: number;
  jettyCounts: { a: number; b: number; c: number; beach: number };
  arrivals: FutureArrival[];
};

const monthToNum = (mStr: string) => {
  const months: {[key:string]: string} = {
    'JAN':'01', 'FEB':'02', 'MAR':'03', 'APR':'04', 'MAY':'05', 'JUN':'06',
    'JUL':'07', 'AUG':'08', 'SEP':'09', 'OCT':'10', 'NOV':'11', 'DEC':'12'
  };
  return months[mStr.toUpperCase()] || mStr.padStart(2, '0');
};

const extractTime = (val: string) => {
  const match = val.match(/(\d{1,2}[:.]\d{2})/);
  return match ? match[1].replace('.', ':') : "";
};

// Map Villa Numbers to their Jetty/Beach Location
const getJettyLocation = (villaNumStr: string) => {
  const v = parseInt(villaNumStr, 10);
  if (isNaN(v)) return 'Unknown';
  if (v >= 1 && v <= 35) return 'Jetty A';
  if (v >= 37 && v <= 50) return 'Jetty B';
  if (v >= 59 && v <= 79) return 'Jetty C';
  return 'Beach';
};

export default function ArrivalsForecastPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [forecastData, setForecastData] = useState<DailySummary[]>([]);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [graphView, setGraphView] = useState<'daily' | 'weekly'>('daily');
  const [isAdmin, setIsAdmin] = useState(false);

  // Check user role on load
  useEffect(() => {
    const checkUserRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      // Adjust this condition if your admin role is stored differently (e.g., in a separate profiles table)
      if (session?.user?.user_metadata?.role === 'admin') {
        setIsAdmin(true);
      }
    };
    checkUserRole();
  }, []);

  // Fetch the last saved forecast on load
  useEffect(() => {
    const fetchExisting = async () => {
      const { data } = await supabase.from('hsk_constants').select('created_at, label').eq('type', 'arrivals_forecast').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) {
        if (data.created_at) {
          setLastSaved(format(parseISO(data.created_at), 'dd MMM, HH:mm'));
        }
        if (data.label) {
          try {
            setForecastData(JSON.parse(data.label));
          } catch (e) {
            console.error("Error parsing saved forecast data", e);
          }
        }
      }
    };
    fetchExisting();
  }, []);

  const handleFileProcess = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        processXML(evt.target?.result as string);
      } catch (err) {
        toast.error("Error parsing XML. Please ensure it is the correct Opera Arrivals export.");
        setIsProcessing(false);
      }
      e.target.value = ''; // reset input
    };
    reader.readAsText(file);
  };

  const processXML = (xmlText: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const reservations = Array.from(xmlDoc.querySelectorAll('G_RESERVATION'));
    const today = startOfToday();
    const arrivalsByDate: Record<string, FutureArrival[]> = {};

    const getText = (node: Element, tag: string) => {
      let el = node.querySelector(tag) || node.querySelector(tag.toLowerCase());
      return el ? el.textContent?.trim() || '' : '';
    };

    reservations.forEach((res: any) => {
      const arrDateRaw = getText(res, 'ARRIVAL'); // format: DD-MMM-YY
      if (!arrDateRaw) return;

      const parts = arrDateRaw.split('-');
      if (parts.length !== 3) return;

      const isoDate = `20${parts[2]}-${monthToNum(parts[1])}-${parts[0].padStart(2, '0')}`;
      const parsedDate = parseISO(isoDate);

      // Extract Departure Date
      const depDateRaw = getText(res, 'DEPARTURE');
      let depIsoDate = '';
      if (depDateRaw) {
        const dParts = depDateRaw.split('-');
        if (dParts.length === 3) {
          depIsoDate = `20${dParts[2]}-${monthToNum(dParts[1])}-${dParts[0].padStart(2, '0')}`;
        }
      }

      // Only care about Today and Future dates
      if (parsedDate < today) return;

      const villa = getText(res, 'DISP_ROOM_NO').replace(/\D/g, '');
      if (!villa) return;

      let mealPlan = 'RO';
      const rateCode = (getText(res, 'RATE_CODE') || '').toUpperCase();
      const products = (getText(res, 'PRODUCTS') || '').toUpperCase();
      if (products.includes('LUN') || rateCode.includes('FB')) mealPlan = 'FB';
      else if ((products.includes('DIN') || rateCode.includes('HB')) && mealPlan !== 'FB') mealPlan = 'HB';
      else if ((products.includes('BFS') || rateCode.includes('BB') || rateCode.includes('PR')) && mealPlan === 'RO') mealPlan = 'BB';

      const rawName = getText(res, 'FULL_NAME_NO_SHR_IND') || getText(res, 'FULL_NAME') || '';
      const adults = parseInt(getText(res, 'ADULTS') || '0', 10);
      const kids = parseInt(getText(res, 'CHILDREN') || '0', 10);
      const vip = getText(res, 'VIP') || '';
      const flight = getText(res, 'ARRIVAL_CARRIER_CODE') || '';
      const timeRaw = getText(res, 'ARRIVAL_TIME') || '';

      const newArrival: FutureArrival = {
        villa,
        names: rawName.replace(/[^a-zA-Z\s\-,]/g, "").trim(),
        adults,
        kids,
        arrivalDate: isoDate,
        departureDate: depIsoDate,
        arrivalTime: extractTime(timeRaw),
        flight,
        mealPlan,
        vipLevel: vip,
        jetty: getJettyLocation(villa)
      };

      if (!arrivalsByDate[isoDate]) arrivalsByDate[isoDate] = [];
      arrivalsByDate[isoDate].push(newArrival);
    });

    // Convert to Array, sort by date, and merge sharers
    const summaryArray: DailySummary[] = Object.keys(arrivalsByDate).sort().map(dateStr => {
      const rawArrivals = arrivalsByDate[dateStr];
      // Merge Sharers (Same Villa)
      const mergedMap = new Map<string, FutureArrival>();
      rawArrivals.forEach(arr => {
        if (mergedMap.has(arr.villa)) {
          const existing = mergedMap.get(arr.villa)!;
          existing.names += ` & ${arr.names}`;
          existing.adults += arr.adults;
          existing.kids += arr.kids;
        } else {
          mergedMap.set(arr.villa, { ...arr });
        }
      });

      const mergedArrivals = Array.from(mergedMap.values()).sort((a,b) => parseInt(a.villa) - parseInt(b.villa));
      const totalAdults = mergedArrivals.reduce((sum, a) => sum + a.adults, 0);
      const totalKids = mergedArrivals.reduce((sum, a) => sum + a.kids, 0);
      const jettyCounts = { a: 0, b: 0, c: 0, beach: 0 };
      mergedArrivals.forEach(arr => {
        if (arr.jetty === 'Jetty A') jettyCounts.a++;
        else if (arr.jetty === 'Jetty B') jettyCounts.b++;
        else if (arr.jetty === 'Jetty C') jettyCounts.c++;
        else if (arr.jetty === 'Beach') jettyCounts.beach++;
      });

      const parsedDate = parseISO(dateStr);
      let dateLabel = format(parsedDate, 'EEEE, dd MMM yyyy');
      if (isToday(parsedDate)) dateLabel = `Today (${format(parsedDate, 'dd MMM')})`;
      else if (isTomorrow(parsedDate)) dateLabel = `Tomorrow (${format(parsedDate, 'dd MMM')})`;

      return {
        date: dateStr,
        dateLabel,
        totalVillas: mergedArrivals.length,
        totalAdults,
        totalKids,
        jettyCounts,
        arrivals: mergedArrivals
      };
    });

    setForecastData(summaryArray);
    // Auto-expand the first two days
    if (summaryArray.length > 0) {
      setExpandedDays({
        [summaryArray[0].date]: true,
        [summaryArray[1]?.date]: true
      });
    }

    toast.success("XML Parsed Successfully!");
    setIsProcessing(false);
  };

  const handleSaveForecast = async () => {
    if (forecastData.length === 0) return;
    setIsSaving(true);
    try {
      const payload = JSON.stringify(forecastData);
      
      const { data: existingConfig, error: fetchError } = await supabase.from('hsk_constants').select('id').eq('type', 'arrivals_forecast').maybeSingle();
      if (fetchError) throw new Error(fetchError.message || "Failed to fetch existing configuration");

      if (existingConfig) {
        const { error: deleteError } = await supabase.from('hsk_constants').delete().eq('id', existingConfig.id);
        if (deleteError) throw new Error(deleteError.message || "Failed to delete old configuration");
      }
      
      const { error: insertError } = await supabase.from('hsk_constants').insert({ type: 'arrivals_forecast', label: payload });
      if (insertError) throw new Error(insertError.message || "Failed to insert configuration");

      setLastSaved(format(new Date(), 'dd MMM, HH:mm'));
      toast.success("Forecast published! Ready for Duty Planning.");
    } catch (error: any) {
      console.error("Database save error:", error);
      toast.error(error.message || "Failed to save data. Please check your database connection.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (dateStr: string) => {
    setExpandedDays(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };

  // --- Calculations for Visualizations ---
  let maxDate = startOfToday();
  forecastData.forEach(d => {
    const dDate = parseISO(d.date);
    if (isAfter(dDate, maxDate)) maxDate = dDate;
    d.arrivals.forEach(a => {
      if (a.departureDate) {
        const depDate = parseISO(a.departureDate);
        if (isAfter(depDate, maxDate)) maxDate = depDate;
      }
    });
  });

  const timelineDates: string[] = [];
  let curr = startOfToday();
  let daysCount = 0;
  // Safety limit of 180 days to prevent excessive rendering or infinite loops
  while (curr <= maxDate && daysCount < 180) {
    timelineDates.push(format(curr, 'yyyy-MM-dd'));
    curr = addDays(curr, 1);
    daysCount++;
  }
  
  if (timelineDates.length === 0) {
    timelineDates.push(...Array.from({ length: 14 }).map((_, i) => format(addDays(startOfToday(), i), 'yyyy-MM-dd')));
  }

  const allVillas = Array.from(new Set(forecastData.flatMap(d => d.arrivals.map(a => a.villa)))).sort((a,b) => parseInt(a) - parseInt(b));

  let chartData: any[] = [];
  if (graphView === 'daily') {
    // Map daily data to uniform format for the chart
    chartData = forecastData.slice(0, 14).map(d => ({
      label: d.dateLabel,
      a: d.jettyCounts.a,
      b: d.jettyCounts.b,
      c: d.jettyCounts.c,
      beach: d.jettyCounts.beach,
      date: d.date
    }));
  } else {
    let currentWeek = { label: 'Week 1', a: 0, b: 0, c: 0, beach: 0, date: '' };
    forecastData.forEach((d, i) => {
      const weekNum = Math.floor(i / 7) + 1;
      if (currentWeek.label !== `Week ${weekNum}`) {
        if (i !== 0) chartData.push(currentWeek);
        currentWeek = { label: `Week ${weekNum}`, a: 0, b: 0, c: 0, beach: 0, date: d.date };
      }
      currentWeek.a += d.jettyCounts.a;
      currentWeek.b += d.jettyCounts.b;
      currentWeek.c += d.jettyCounts.c;
      currentWeek.beach += d.jettyCounts.beach;
    });
    if (forecastData.length > 0) chartData.push(currentWeek);
  }
  const maxGraphVal = Math.max(...chartData.map(d => (d.a + d.b + d.c + d.beach) || 1));

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-3 md:p-6 pb-32 font-sans text-slate-800">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-6 mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#6D2158] flex items-center gap-3">
            <PlaneLanding size={28}/> Arrivals Forecast
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">
              Upload & Publish Future Arrivals
            </p>
            {lastSaved && (
              <span className="text-[9px] bg-emerald-50 text-emerald-600 font-bold uppercase px-2 py-0.5 rounded border border-emerald-100">
                Last Published: {lastSaved}
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <input type="file" id="forecastXml" className="hidden" accept=".xml" onChange={handleFileProcess} />
            
            <button
              onClick={() => document.getElementById('forecastXml')?.click()}
              disabled={isProcessing || isSaving}
              className="w-full sm:w-auto flex-1 md:flex-none bg-slate-100 text-slate-600 px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-slate-200 transition-all disabled:opacity-50"
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin"/> : <UploadCloud size={18}/>}
              Upload Upcoming Arrivals (XML)
            </button>

            <button
              onClick={handleSaveForecast}
              disabled={forecastData.length === 0 || isSaving || isProcessing}
              className="w-full sm:w-auto flex-1 md:flex-none bg-[#6D2158] text-white px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-[#6D2158]/20 hover:bg-[#5a1b49] transition-all disabled:opacity-50 disabled:shadow-none"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
              Save
            </button>
          </div>
        )}
      </div>

      {forecastData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed text-slate-400">
          <FileSpreadsheet size={64} className="mb-4 opacity-20"/>
          <p className="text-lg font-black text-slate-500">Awaiting Data File</p>
          {isAdmin ? (
            <p className="text-sm font-medium mt-2 max-w-sm text-center">Upload your Opera Arrivals XML. Review the parsed forecast, then click Save so it can be used in the Duty Planner.</p>
          ) : (
            <p className="text-sm font-medium mt-2 max-w-sm text-center">Awaiting an admin to upload and publish the arrivals forecast.</p>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          {/* Top KPI Banner */}
          <div className="bg-gradient-to-r from-[#6D2158] to-[#902468] p-5 md:p-6 rounded-3xl shadow-lg text-white grid grid-cols-2 md:grid-cols-4 lg:flex lg:flex-wrap gap-6 md:gap-8 items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Forecast Scope</p>
              <p className="text-xl md:text-2xl font-black">{forecastData.length} Days Detected</p>
            </div>
            <div className="w-px h-12 bg-white/20 hidden lg:block"></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Incoming Villas</p>
              <p className="text-xl md:text-2xl font-black">{forecastData.reduce((acc, curr) => acc + curr.totalVillas, 0)}</p>
            </div>
            <div className="w-px h-12 bg-white/20 hidden lg:block"></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Incoming Pax</p>
              <p className="text-xl md:text-2xl font-black flex items-center gap-2">
                {forecastData.reduce((acc, curr) => acc + curr.totalAdults + curr.totalKids, 0)}
                <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {forecastData.reduce((acc, curr) => acc + curr.totalKids, 0)} Kids
                </span>
              </p>
            </div>
            <div className="w-px h-12 bg-white/20 hidden lg:block"></div>
            <div className="col-span-2 md:col-span-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Location Breakdown</p>
              <div className="flex flex-wrap gap-2 text-xs md:text-sm font-bold mt-1">
                <span className="bg-white/20 px-2 py-0.5 rounded">A: {forecastData.reduce((acc, curr) => acc + curr.jettyCounts.a, 0)}</span>
                <span className="bg-white/20 px-2 py-0.5 rounded">B: {forecastData.reduce((acc, curr) => acc + curr.jettyCounts.b, 0)}</span>
                <span className="bg-white/20 px-2 py-0.5 rounded">C: {forecastData.reduce((acc, curr) => acc + curr.jettyCounts.c, 0)}</span>
                <span className="bg-white/20 px-2 py-0.5 rounded">Beach: {forecastData.reduce((acc, curr) => acc + curr.jettyCounts.beach, 0)}</span>
              </div>
            </div>
          </div>

          {/* Visualizations: Timeline & Graph */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6 mb-6">
            
            {/* Timeline View */}
            <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <h2 className="text-lg font-black text-[#6D2158] mb-4 flex items-center gap-2">
                <GanttChart size={20}/> Occupancy Timeline
              </h2>
              <div className="overflow-x-auto flex-1 custom-scrollbar pb-2">
                <div style={{ minWidth: `${Math.max(600, timelineDates.length * 45)}px` }}>
                  <div className="flex border-b border-slate-200 pb-2 mb-2">
                    <div className="w-16 shrink-0 font-bold text-slate-400 text-[10px] uppercase">Villa</div>
                    {timelineDates.map(d => (
                      <div key={d} className="flex-1 text-center font-bold text-[10px] text-slate-500 truncate px-1">
                        {format(parseISO(d), 'dd MMM')}
                      </div>
                    ))}
                  </div>
                  <div className="max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {allVillas.map(villa => {
                      const vArrivals = forecastData.flatMap(d => d.arrivals).filter(a => a.villa === villa);
                      return (
                        <div key={villa} className="flex items-center mb-1.5 relative h-8 bg-slate-50/50 rounded hover:bg-slate-100 transition-colors">
                          <div className="w-16 shrink-0 font-black text-sm text-slate-700 pl-1">V{villa}</div>
                          <div className="flex-1 relative h-full flex">
                            {timelineDates.map(d => (
                              <div key={d} className="flex-1 border-r border-slate-100 last:border-0 h-full"></div>
                            ))}
                            {vArrivals.map((arr, i) => {
                              const startIndex = timelineDates.indexOf(arr.arrivalDate);
                              const endIndex = timelineDates.indexOf(arr.departureDate);
                              if (startIndex === -1 && endIndex === -1) return null;

                              const start = startIndex !== -1 ? startIndex : 0;
                              const end = endIndex !== -1 ? endIndex : timelineDates.length;
                              const span = end - start;
                              if (span <= 0) return null;

                              return (
                                <div
                                  key={i}
                                  className="absolute top-1 bottom-1 bg-[#6D2158] text-white rounded-[4px] text-[9px] font-bold flex items-center px-1.5 truncate shadow-sm overflow-hidden z-10"
                                  style={{
                                    left: `${(start / timelineDates.length) * 100}%`,
                                    width: `${(span / timelineDates.length) * 100}%`
                                  }}
                                  title={`${arr.names} (${arr.arrivalDate} to ${arr.departureDate})`}
                                >
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Jetty-Wise Graph View */}
            <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-black text-[#6D2158] flex items-center gap-2">
                  <BarChart3 size={20}/> Jetty-Wise Arrivals
                </h2>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg shrink-0 ml-2">
                  <button onClick={() => setGraphView('daily')} className={`px-2 md:px-3 py-1 text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded transition-all ${graphView === 'daily' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Daily</button>
                  <button onClick={() => setGraphView('weekly')} className={`px-2 md:px-3 py-1 text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded transition-all ${graphView === 'weekly' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Weekly</button>
                </div>
              </div>
              
              <div className="flex items-end justify-between gap-2 h-48 mt-2 overflow-x-auto pb-6 px-2 flex-1 custom-scrollbar">
                {chartData.map((d, i) => (
                  <div key={i} className="flex flex-col items-center justify-end h-full gap-2 flex-1 min-w-[32px] group relative">
                    <div className="w-full max-w-[40px] h-full flex flex-col justify-end bg-slate-50 rounded-t-lg overflow-hidden relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 whitespace-nowrap">
                        Total: {d.a + d.b + d.c + d.beach}
                      </div>
                      
                      {d.beach > 0 && <div className="w-full bg-amber-400 transition-all hover:brightness-110" style={{ height: `${(d.beach / maxGraphVal) * 100}%` }} title={`Beach: ${d.beach}`}></div>}
                      {d.c > 0 && <div className="w-full bg-violet-500 transition-all hover:brightness-110" style={{ height: `${(d.c / maxGraphVal) * 100}%` }} title={`Jetty C: ${d.c}`}></div>}
                      {d.b > 0 && <div className="w-full bg-indigo-500 transition-all hover:brightness-110" style={{ height: `${(d.b / maxGraphVal) * 100}%` }} title={`Jetty B: ${d.b}`}></div>}
                      {d.a > 0 && <div className="w-full bg-blue-500 transition-all hover:brightness-110" style={{ height: `${(d.a / maxGraphVal) * 100}%` }} title={`Jetty A: ${d.a}`}></div>}
                    </div>
                    <div className="absolute -bottom-6 text-[9px] font-bold text-slate-500 whitespace-nowrap">
                      {d.date ? format(parseISO(d.date), 'dd MMM') : d.label}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex flex-wrap gap-2 md:gap-4 mt-8 justify-center text-[9px] md:text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-blue-500 rounded-sm"></div> Jetty A</span>
                <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-indigo-500 rounded-sm"></div> Jetty B</span>
                <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-violet-500 rounded-sm"></div> Jetty C</span>
                <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-amber-400 rounded-sm"></div> Beach</span>
              </div>
            </div>
          </div>

          {/* Day-by-Day List */}
          <div className="space-y-4">
            {forecastData.map((day) => {
              const isExpanded = expandedDays[day.date];
              const isTdy = isToday(parseISO(day.date));

              return (
                <div key={day.date} className={`bg-white rounded-2xl border transition-all shadow-sm overflow-hidden ${isTdy ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'}`}>
                  {/* Header Row (Clickable) */}
                  <div
                    className={`p-3 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer select-none transition-colors gap-3 ${isTdy ? 'bg-amber-50/50 hover:bg-amber-100/50' : 'hover:bg-slate-50'}`}
                    onClick={() => toggleDay(day.date)}
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <button className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center transition-colors ${isExpanded ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400'}`}>
                        {isExpanded ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                      </button>
                      <div>
                        <h3 className={`text-base md:text-lg font-black tracking-tight ${isTdy ? 'text-amber-800' : 'text-slate-800'}`}>{day.dateLabel}</h3>
                        <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center flex-wrap gap-1.5 md:gap-2">
                          <span>{day.totalVillas} Villas</span>
                          <span className="text-slate-200 hidden sm:inline">|</span>
                          <span className="text-blue-500">A:{day.jettyCounts.a}</span>
                          <span className="text-indigo-500">B:{day.jettyCounts.b}</span>
                          <span className="text-violet-500">C:{day.jettyCounts.c}</span>
                          <span className="text-amber-600">Beach:{day.jettyCounts.beach}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pl-11 sm:pl-0">
                      <div className="flex items-center gap-3 md:gap-4 text-xs font-bold text-slate-500 uppercase tracking-widest sm:border-r border-slate-200 sm:pr-6">
                        <span className="flex items-center gap-1"><Users size={14}/> {day.totalAdults}</span>
                        <span className="flex items-center gap-1 text-amber-500"><Baby size={14}/> {day.totalKids}</span>
                      </div>
                      {isTdy && <span className="bg-amber-500 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">Today</span>}
                    </div>
                  </div>

                  {/* Expanded Detail View */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/30 p-3 md:p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {day.arrivals.map((arr, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:border-[#6D2158]/30 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xl font-black text-slate-800 tracking-tighter">V{arr.villa}</span>
                                {arr.vipLevel && <span className="text-[9px] bg-rose-50 text-rose-600 font-black uppercase px-1.5 py-0.5 rounded border border-rose-100">{arr.vipLevel}</span>}
                              </div>
                              <div className="flex flex-wrap gap-1.5 justify-end">
                                {arr.mealPlan && <span className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{arr.mealPlan}</span>}
                                <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {arr.adults}A {arr.kids > 0 ? `+ ${arr.kids}C` : ''}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm font-bold text-slate-600 leading-tight mb-2 truncate" title={arr.names}>{arr.names.replace(/\//g, ', ')}</p>
                            {(arr.arrivalTime || arr.flight || arr.jetty) && (
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold font-mono text-slate-400 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100 mt-2">
                                <PlaneLanding size={12} className="text-slate-400 shrink-0"/>
                                {arr.flight && <span>{arr.flight}</span>}
                                {arr.flight && arr.arrivalTime && <span>•</span>}
                                {arr.arrivalTime && <span className="text-emerald-600">ETA {arr.arrivalTime}</span>}
                                {(arr.flight || arr.arrivalTime) && arr.jetty && <span>•</span>}
                                {arr.jetty && <span className="text-slate-500 uppercase">{arr.jetty}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
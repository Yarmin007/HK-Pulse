"use client";
// Public page for Front Office: today's villa attendant allocation + work contact numbers.
// No login (the /share path is public in AuthGuard). Only work numbers are shown, never personal ones.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { JETTY_A, JETTY_B, JETTY_C, BEACH, parseVillas } from "@/app/allocation/lib/constants";
import { isOffShift } from "@/app/allocation/lib/riders";
import { projectGuestDay, villaStatusMap } from "@/lib/guestDay";
import { ChevronLeft, ChevronRight, Phone, Search, X, RefreshCw, LayoutGrid, Users, Loader2 } from "lucide-react";

type Host = { id: string; host_id: string; full_name: string; nicknames?: string | null; mvpn?: string | null; company_mobile?: string | null; status?: string | null };
type Attendant = { key: string; name: string; fullName: string; shift: string; villas: number[]; mvpn: string; mobile: string; zone: Zone };
type Zone = "Jetty A" | "Jetty B" | "Jetty C" | "Beach";
type VillaInfo = { status: string; arr?: string; dep?: string };

const ZONES: { name: Zone; villas: number[] }[] = [
  { name: "Jetty A", villas: JETTY_A },
  { name: "Jetty B", villas: JETTY_B },
  { name: "Jetty C", villas: JETTY_C },
  { name: "Beach", villas: [...BEACH].sort((a, b) => a - b) },
];
const zoneOf = (v: number): Zone => ZONES.find(z => z.villas.includes(v))?.name || "Beach";

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const shiftDate = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const prettyDate = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

// Guest status → short label + colours
const statusStyle = (raw: string) => {
  const s = raw.toUpperCase();
  if (s.includes("ARR")) return { label: "ARR", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" };
  if (s.includes("DEP")) return { label: "DEP", cls: "bg-rose-100 text-rose-700 ring-rose-200" };
  if (s.includes("TMA")) return { label: "TMA", cls: "bg-amber-100 text-amber-800 ring-amber-200" };
  if (s.includes("FUMIG")) return { label: "FUMIG", cls: "bg-teal-100 text-teal-800 ring-teal-200" };
  if (s.includes("OCC") || s.includes("STAY")) return { label: "OCC", cls: "bg-indigo-100 text-indigo-800 ring-indigo-200" };
  if (!s) return { label: "", cls: "" }; // no guest list loaded for this villa/day
  if (s.includes("HOUSE")) return { label: "H/U", cls: "bg-sky-100 text-sky-800 ring-sky-200" };
  if (s.includes("VAC")) return { label: "VAC", cls: "bg-slate-100 text-slate-500 ring-slate-200" };
  return { label: s.slice(0, 6), cls: "bg-violet-100 text-violet-800 ring-violet-200" };
};

const CallButtons = ({ a, big = false }: { a: Attendant; big?: boolean }) => (
  <div className={`flex flex-wrap gap-2 ${big ? "mt-4" : ""}`}>
    {a.mvpn && (
      <a href={`tel:${a.mvpn.replace(/\s/g, "")}`} className={`inline-flex items-center gap-1.5 rounded-xl bg-[#6D2158] text-white font-black active:scale-95 transition ${big ? "px-4 py-3 text-sm" : "px-3 py-1.5 text-xs"}`}>
        <Phone size={big ? 16 : 12} /> MVPN {a.mvpn}
      </a>
    )}
    {a.mobile && (
      <a href={`tel:${a.mobile.replace(/\s/g, "")}`} className={`inline-flex items-center gap-1.5 rounded-xl bg-white text-[#6D2158] ring-1 ring-[#6D2158]/30 font-black active:scale-95 transition ${big ? "px-4 py-3 text-sm" : "px-3 py-1.5 text-xs"}`}>
        <Phone size={big ? 16 : 12} /> {a.mobile}
      </a>
    )}
    {!a.mvpn && !a.mobile && <span className="text-xs font-bold text-slate-400">No work number on file</span>}
  </div>
);

async function fetchFO(d: string): Promise<{ list: Attendant[]; info: Record<number, VillaInfo> }> {
    const [allocRes, hostRes, sumRes] = await Promise.all([
      supabase.from("hsk_allocations").select("host_id, area, shift, task_details").eq("report_date", d).eq("area", "villa"),
      supabase.from("hsk_hosts").select("id, host_id, full_name, nicknames, mvpn, company_mobile, status"),
      projectGuestDay(d),
    ]);
    const hostMap = new Map<string, Host>();
    (hostRes.data || []).forEach((h: Host) => { hostMap.set(String(h.id), h); hostMap.set(String(h.host_id), h); });

    const list: Attendant[] = [];
    (allocRes.data || []).forEach((a: any) => {
      if (isOffShift(a.shift)) return;
      const h = hostMap.get(String(a.host_id));
      if (!h || (h.status && h.status.toLowerCase() !== "active")) return;
      const villas = parseVillas(a.task_details || "").sort((x, y) => x - y);
      if (villas.length === 0) return;
      // The zone that holds most of their villas
      const count: Record<string, number> = {};
      villas.forEach(v => { const z = zoneOf(v); count[z] = (count[z] || 0) + 1; });
      const zone = (Object.entries(count).sort((x, y) => y[1] - x[1])[0][0]) as Zone;
      const nick = h.nicknames ? h.nicknames.split(",")[0].trim() : "";
      list.push({
        key: `${h.id}-${a.shift}`,
        name: nick || h.full_name.split(" ")[0],
        fullName: h.full_name,
        shift: a.shift || "",
        villas,
        mvpn: String(h.mvpn || "").trim(),
        mobile: String(h.company_mobile || "").trim(),
        zone,
      });
    });
    list.sort((x, y) => x.villas[0] - y.villas[0]);

    // Same guest list as the Guest List page (projected from the last saved day if needed)
    const info: Record<number, VillaInfo> = {};
    Object.entries(villaStatusMap(sumRes.rows)).forEach(([v, st]) => {
      info[Number(v)] = { status: st.status, arr: st.arrival || undefined, dep: st.departure || undefined };
    });

    return { list, info };
}

export default function FrontOfficeSharePage() {
  const [date, setDate] = useState(localToday());
  const [loading, setLoading] = useState(true);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [villaInfo, setVillaInfo] = useState<Record<number, VillaInfo>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [view, setView] = useState<"villas" | "attendants">("villas");
  const [query, setQuery] = useState("");
  const [openVilla, setOpenVilla] = useState<number | null>(null);

  const apply = useCallback((r: { list: Attendant[]; info: Record<number, VillaInfo> }) => {
    setAttendants(r.list);
    setVillaInfo(r.info);
    setUpdatedAt(new Date());
    setLoading(false);
  }, []);
  const load = useCallback((d: string) => { setLoading(true); fetchFO(d).then(apply); }, [apply]);

  // Fetch on date change, then every 2 minutes while the page is open.
  useEffect(() => {
    let alive = true;
    const run = () => fetchFO(date).then(r => { if (alive) apply(r); });
    run();
    const t = setInterval(run, 120000);
    return () => { alive = false; clearInterval(t); };
  }, [date, apply]);
  const goTo = (d: string) => { setLoading(true); setDate(d); };

  const villaOwner = useMemo(() => {
    const m = new Map<number, Attendant[]>();
    attendants.forEach(a => a.villas.forEach(v => m.set(v, [...(m.get(v) || []), a])));
    return m;
  }, [attendants]);

  const q = query.trim().toLowerCase();
  const villaHit = /^\d{1,3}$/.test(q) ? parseInt(q, 10) : null;
  const filteredAttendants = q && villaHit === null
    ? attendants.filter(a => a.name.toLowerCase().includes(q) || a.fullName.toLowerCase().includes(q))
    : villaHit !== null ? attendants.filter(a => a.villas.includes(villaHit)) : attendants;

  const isToday = date === localToday();
  const published = attendants.length > 0;
  const selected = openVilla !== null ? { v: openVilla, owners: villaOwner.get(openVilla) || [], info: villaInfo[openVilla] } : null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#6D2158] text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Housekeeping · for Front Office</p>
              <h1 className="text-lg md:text-xl font-black leading-tight truncate">Villa Attendants</h1>
            </div>
            <button onClick={() => load(date)} className="shrink-0 p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95" aria-label="Refresh">
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => goTo(shiftDate(date, -1))} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95" aria-label="Previous day"><ChevronLeft size={18} /></button>
            <div className="flex-1 text-center">
              <p className="text-sm font-black">{prettyDate(date)}</p>
              <p className="text-[10px] font-bold text-white/60">{isToday ? "Today" : <button onClick={() => goTo(localToday())} className="underline">Back to today</button>}{updatedAt && ` · updated ${updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}</p>
            </div>
            <button onClick={() => goTo(shiftDate(date, 1))} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95" aria-label="Next day"><ChevronRight size={18} /></button>
          </div>

          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} inputMode="search" placeholder="Villa number or attendant name"
                className="w-full rounded-xl bg-white text-slate-800 pl-9 pr-9 py-2.5 text-sm font-bold outline-none placeholder:text-slate-400 placeholder:font-semibold" />
              {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400" aria-label="Clear"><X size={16} /></button>}
            </div>
            <div className="flex rounded-xl bg-white/10 p-1 shrink-0">
              <button onClick={() => setView("villas")} className={`px-3 rounded-lg flex items-center gap-1.5 text-xs font-black ${view === "villas" ? "bg-white text-[#6D2158]" : "text-white/80"}`}><LayoutGrid size={14} /><span className="hidden sm:inline">Villas</span></button>
              <button onClick={() => setView("attendants")} className={`px-3 rounded-lg flex items-center gap-1.5 text-xs font-black ${view === "attendants" ? "bg-white text-[#6D2158]" : "text-white/80"}`}><Users size={14} /><span className="hidden sm:inline">Attendants</span></button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        {loading ? (
          <div className="py-24 flex flex-col items-center text-slate-400"><Loader2 className="animate-spin mb-2" /> <span className="text-xs font-bold uppercase tracking-widest">Loading</span></div>
        ) : !published ? (
          <div className="py-20 text-center">
            <p className="text-base font-black text-slate-700">Allocation not published yet</p>
            <p className="text-sm text-slate-500 mt-1">Housekeeping hasn&rsquo;t saved the villa allocation for this day. Check again later.</p>
          </div>
        ) : (
          <>
            {/* Quick answer when a villa number is typed */}
            {villaHit !== null && (
              <div className="mb-4 rounded-2xl bg-white ring-1 ring-amber-300 shadow-sm p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-2xl font-black text-slate-800">Villa {villaHit}</p>
                  {statusStyle(villaInfo[villaHit]?.status || "").label && <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ring-1 ${statusStyle(villaInfo[villaHit].status).cls}`}>{statusStyle(villaInfo[villaHit].status).label}</span>}
                </div>
                {(villaOwner.get(villaHit) || []).length === 0
                  ? <p className="text-sm font-bold text-slate-500 mt-1">No attendant allocated.</p>
                  : (villaOwner.get(villaHit) || []).map(a => (
                    <div key={a.key} className="mt-2">
                      <p className="text-lg font-black text-[#6D2158]">{a.name} <span className="text-xs font-bold text-slate-400">{a.fullName}{a.shift ? ` · ${a.shift}` : ""}</span></p>
                      <CallButtons a={a} big />
                    </div>
                  ))}
              </div>
            )}

            {view === "villas" ? (
              <div className="space-y-5">
                {ZONES.map(z => (
                  <section key={z.name}>
                    <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{z.name}</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2">
                      {z.villas.map(v => {
                        const owners = villaOwner.get(v) || [];
                        const st = statusStyle(villaInfo[v]?.status || "");
                        const hit = villaHit === v || (q && villaHit === null && owners.some(o => o.name.toLowerCase().includes(q) || o.fullName.toLowerCase().includes(q)));
                        return (
                          <button key={v} onClick={() => setOpenVilla(v)}
                            className={`text-left rounded-xl bg-white p-2 ring-1 shadow-sm active:scale-95 transition ${hit ? "ring-2 ring-amber-400 bg-amber-50" : "ring-slate-200 hover:ring-[#6D2158]/40"} ${q && !hit ? "opacity-40" : ""}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-base font-black text-slate-800 leading-none">{v}</span>
                              {st.label && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ring-1 ${st.cls}`}>{st.label}</span>}
                            </div>
                            <p className={`mt-1.5 text-xs font-black truncate ${owners.length ? "text-[#6D2158]" : "text-slate-300"}`}>{owners.length ? owners.map(o => o.name).join(" / ") : "—"}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {ZONES.map(z => {
                  const list = filteredAttendants.filter(a => a.zone === z.name);
                  if (list.length === 0) return null;
                  return (
                    <section key={z.name}>
                      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{z.name}</h2>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {list.map(a => (
                          <div key={a.key} className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-base font-black text-slate-800 truncate">{a.name}</p>
                                <p className="text-[11px] font-bold text-slate-400 truncate">{a.fullName}</p>
                              </div>
                              {a.shift && <span className="shrink-0 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">{a.shift}</span>}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {a.villas.map(v => {
                                const st = statusStyle(villaInfo[v]?.status || "");
                                return (
                                  <button key={v} onClick={() => setOpenVilla(v)} className={`px-2 py-1 rounded-lg text-xs font-black ring-1 ${villaHit === v ? "ring-2 ring-amber-400 bg-amber-50 text-amber-900" : st.cls || "bg-slate-50 text-slate-600 ring-slate-200"}`}>
                                    {v}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-3"><CallButtons a={a} /></div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
                {filteredAttendants.length === 0 && <p className="py-12 text-center text-sm font-bold text-slate-400">No attendant matches &ldquo;{query}&rdquo;.</p>}
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-2 justify-center text-[10px] font-black">
              {["ARR", "DEP", "OCC", "TMA", "H/U", "VAC"].map(s => <span key={s} className={`px-2 py-0.5 rounded ring-1 ${statusStyle(s === "H/U" ? "HOUSE" : s).cls}`}>{s}</span>)}
            </div>
          </>
        )}
      </main>

      {/* Villa detail sheet */}
      {selected && (
        <div className="fixed inset-0 z-30 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setOpenVilla(null)}>
          <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{zoneOf(selected.v)}</p>
                <p className="text-3xl font-black text-slate-800">Villa {selected.v}</p>
              </div>
              <button onClick={() => setOpenVilla(null)} className="p-2 rounded-full bg-slate-100 text-slate-500" aria-label="Close"><X size={18} /></button>
            </div>
            {selected.info && statusStyle(selected.info.status).label && (
              <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                <span className={`px-2 py-0.5 rounded-md ring-1 font-black ${statusStyle(selected.info.status).cls}`}>{statusStyle(selected.info.status).label}</span>
                {selected.info.arr && statusStyle(selected.info.status).label === "ARR" && <span>Arrival {selected.info.arr}</span>}
                {selected.info.dep && statusStyle(selected.info.status).label === "DEP" && <span>Departure {selected.info.dep}</span>}
              </div>
            )}
            {selected.owners.length === 0 ? (
              <p className="mt-4 text-sm font-bold text-slate-500">No attendant allocated to this villa.</p>
            ) : selected.owners.map(a => (
              <div key={a.key} className="mt-4 rounded-2xl bg-slate-50 p-4">
                <p className="text-xl font-black text-[#6D2158]">{a.name}</p>
                <p className="text-xs font-bold text-slate-400">{a.fullName}{a.shift ? ` · ${a.shift}` : ""}</p>
                <CallButtons a={a} big />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

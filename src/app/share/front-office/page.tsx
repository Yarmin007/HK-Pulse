"use client";
// Public page for Front Office: today's villa attendant allocation (photo, villas, MVPN + personal number)
// and the In-Villa Directory — the documents placed in every villa (PDFs).
// No login (the /share path is public in AuthGuard). Admins manage the documents from this page.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { JETTY_A, JETTY_B, JETTY_C, BEACH, parseVillas } from "@/app/allocation/lib/constants";
import { isOffShift } from "@/app/allocation/lib/riders";
import { projectGuestDay, villaStatusMap } from "@/lib/guestDay";
import { ChevronLeft, ChevronRight, Phone, Search, X, RefreshCw, Users, Loader2, BookOpen } from "lucide-react";
import VillaDirectory from "./VillaDirectory";

type Host = { id: string; host_id: string; full_name: string; nicknames?: string | null; mvpn?: string | null; personal_mobile?: string | null; image_url?: string | null; status?: string | null };
type Attendant = { key: string; name: string; fullName: string; ssl: string; shift: string; villas: number[]; mvpn: string; mobile: string; photo: string; zone: Zone };
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

async function fetchFO(d: string): Promise<{ list: Attendant[]; info: Record<number, VillaInfo> }> {
    const [allocRes, hostRes, sumRes] = await Promise.all([
      supabase.from("hsk_allocations").select("host_id, area, shift, task_details").eq("report_date", d).eq("area", "villa"),
      supabase.from("hsk_hosts").select("id, host_id, full_name, nicknames, mvpn, personal_mobile, image_url, status"),
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
        ssl: String(h.host_id || "").trim(),
        shift: a.shift || "",
        villas,
        mvpn: String(h.mvpn || "").trim(),
        mobile: String(h.personal_mobile || "").trim(),
        photo: /\/storage\/v1\/object\//.test(h.image_url || "") ? String(h.image_url) : "",
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

const Avatar = ({ a }: { a: Attendant }) => (
  a.photo
    ? <img src={a.photo} alt={a.name} className="w-16 h-16 rounded-2xl object-cover bg-slate-100 shrink-0 ring-1 ring-slate-200" loading="lazy" />
    : <div className="w-16 h-16 rounded-2xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center text-xl font-black shrink-0">{a.name.slice(0, 1)}</div>
);

export default function FrontOfficeSharePage() {
  const [tab, setTab] = useState<"allocation" | "directory">("allocation");
  const [date, setDate] = useState(localToday());
  const [loading, setLoading] = useState(true);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [villaInfo, setVillaInfo] = useState<Record<number, VillaInfo>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState("");

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

  const q = query.trim().toLowerCase();
  const villaHit = /^\d{1,3}$/.test(q) ? parseInt(q, 10) : null;
  const shown = useMemo(() => (
    villaHit !== null ? attendants.filter(a => a.villas.includes(villaHit))
      : q ? attendants.filter(a => a.name.toLowerCase().includes(q) || a.fullName.toLowerCase().includes(q) || a.ssl.toLowerCase().includes(q))
      : attendants
  ), [attendants, q, villaHit]);

  const isToday = date === localToday();

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-50 text-slate-800 font-sans">
      <header className="sticky top-0 z-20 bg-[#6D2158] text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Housekeeping · for Front Office</p>
              <h1 className="text-lg md:text-xl font-black leading-tight truncate">{tab === "allocation" ? "Villa Attendants" : "In-Villa Directory"}</h1>
            </div>
            {tab === "allocation" && (
              <button onClick={() => load(date)} className="shrink-0 p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95" aria-label="Refresh">
                <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1">
            <button onClick={() => setTab("allocation")} className={`py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-black ${tab === "allocation" ? "bg-white text-[#6D2158]" : "text-white/80"}`}><Users size={14} /> Today&rsquo;s allocation</button>
            <button onClick={() => setTab("directory")} className={`py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-black ${tab === "directory" ? "bg-white text-[#6D2158]" : "text-white/80"}`}><BookOpen size={14} /> In-Villa Directory</button>
          </div>

          {tab === "allocation" && (
            <>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => goTo(shiftDate(date, -1))} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95" aria-label="Previous day"><ChevronLeft size={18} /></button>
                <div className="flex-1 text-center">
                  <p className="text-sm font-black">{prettyDate(date)}</p>
                  <p className="text-[10px] font-bold text-white/60">{isToday ? "Today" : <button onClick={() => goTo(localToday())} className="underline">Back to today</button>}{updatedAt && ` · updated ${updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}</p>
                </div>
                <button onClick={() => goTo(shiftDate(date, 1))} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95" aria-label="Next day"><ChevronRight size={18} /></button>
              </div>
              <div className="relative mt-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} inputMode="search" placeholder="Villa no., name or SSL"
                  className="w-full rounded-xl bg-white text-slate-800 pl-9 pr-9 py-2.5 text-sm font-bold outline-none placeholder:text-slate-400 placeholder:font-semibold" />
                {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400" aria-label="Clear"><X size={16} /></button>}
              </div>
            </>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        {tab === "directory" ? <VillaDirectory /> : loading ? (
          <div className="py-24 flex flex-col items-center text-slate-400"><Loader2 className="animate-spin mb-2" /> <span className="text-xs font-bold uppercase tracking-widest">Loading</span></div>
        ) : attendants.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-base font-black text-slate-700">Allocation not published yet</p>
            <p className="text-sm text-slate-500 mt-1">Housekeeping hasn&rsquo;t saved the villa allocation for this day. Check again later.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {ZONES.map(z => {
              const list = shown.filter(a => a.zone === z.name);
              if (list.length === 0) return null;
              return (
                <section key={z.name}>
                  <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{z.name}</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {list.map(a => (
                      <div key={a.key} className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4">
                        <div className="flex items-start gap-3">
                          <Avatar a={a} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-lg font-black text-slate-800 leading-tight truncate">{a.name}</p>
                                <p className="text-[11px] font-bold text-slate-400 truncate">{a.fullName}</p>
                                {a.ssl && <p className="mt-0.5 text-[10px] font-black text-slate-500 font-mono tracking-wide">SSL {a.ssl}</p>}
                              </div>
                              {a.shift && <span className="shrink-0 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">{a.shift}</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {a.villas.map(v => {
                                const st = statusStyle(villaInfo[v]?.status || "");
                                return (
                                  <span key={v} title={st.label || undefined} className={`px-2 py-1 rounded-lg text-sm font-black ring-1 ${villaHit === v ? "ring-2 ring-amber-400 bg-amber-50 text-amber-900" : st.cls || "bg-slate-50 text-slate-700 ring-slate-200"}`}>{v}</span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {a.mvpn ? (
                            <a href={`tel:${a.mvpn.replace(/\s/g, "")}`} className="flex flex-col items-center justify-center rounded-xl bg-[#6D2158] text-white py-2 active:scale-95 transition">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-white/70">MVPN</span>
                              <span className="text-sm font-black flex items-center gap-1"><Phone size={13} /> {a.mvpn}</span>
                            </a>
                          ) : <div className="flex items-center justify-center rounded-xl bg-slate-50 text-[11px] font-bold text-slate-400 py-2">No MVPN</div>}
                          {a.mobile ? (
                            <a href={`tel:${a.mobile.replace(/\s/g, "")}`} className="flex flex-col items-center justify-center rounded-xl bg-white ring-1 ring-[#6D2158]/30 text-[#6D2158] py-2 active:scale-95 transition">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-[#6D2158]/60">Personal</span>
                              <span className="text-sm font-black flex items-center gap-1"><Phone size={13} /> {a.mobile}</span>
                            </a>
                          ) : <div className="flex items-center justify-center rounded-xl bg-slate-50 text-[11px] font-bold text-slate-400 py-2">No personal no.</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
            {shown.length === 0 && <p className="py-12 text-center text-sm font-bold text-slate-400">No attendant for &ldquo;{query}&rdquo;.</p>}
            <div className="pt-2 flex flex-wrap gap-2 justify-center text-[10px] font-black">
              {["ARR", "DEP", "OCC", "TMA", "H/U", "VAC"].map(s => <span key={s} className={`px-2 py-0.5 rounded ring-1 ${statusStyle(s === "H/U" ? "HOUSE" : s).cls}`}>{s}</span>)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

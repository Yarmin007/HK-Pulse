"use client";
// Live Board: every villa today in one place: guest status, who has it, the VA's daily task list
// (requests, ice, milk, preferences ticked on My Tasks) and the service timer for VAs who use it.
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LayoutGrid, Users, ListChecks, Search, ChevronLeft, ChevronRight, RefreshCw, Maximize2, Minimize2, Loader2, X,
  CheckCircle2, Sparkles, DoorClosed, Ban, AlertTriangle, Plus, Trash2, Save, Rows3, Grid2x2, MessageSquare,
  Milk, Snowflake, Heart, Check, Circle, UserX, Timer, LayoutDashboard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDhakaTime, getDhakaDateStr, formatDisplayTime } from '@/lib/dateUtils';
import { projectGuestDay, normalizeVilla } from '@/lib/guestDay';
import { loadVaTasks, type VaTask } from '@/lib/vaDailyTasks';
import { TOTAL_VILLAS } from '@/lib/minibarCounts';
import toast from 'react-hot-toast';

// ---------- types ----------
type Session = { reason?: string; start?: string; end?: string; duration?: number; autoStopped?: boolean };
type GuestKind = 'ARR' | 'DEP' | 'DEPARR' | 'OCC' | 'HOUSE' | 'VAC' | 'OTHER';
type ServiceState = 'pending' | 'active' | 'done' | 'td-due' | 'dnd' | 'refused';
type Va = { name: string; full: string; ssl: string };
type VillaRow = {
  villa: string;
  guestKind: GuestKind; guestLabel: string; guestName: string;
  vas: Va[];
  log: any | null; sessions: Session[]; service: ServiceState; minutes: number;
  tasks: VaTask[]; tasksDone: number; openRequests: number;
  editReq: any | null;
};
type Filter = 'all' | 'guests' | 'arr' | 'dep' | 'open' | 'unassigned' | 'active' | 'done' | 'dnd' | 'refused';
type View = 'villas' | 'team' | 'log';

// ---------- helpers ----------
const SERVICED: GuestKind[] = ['ARR', 'DEP', 'DEPARR', 'OCC', 'HOUSE'];
const villaNum = (v: string) => parseFloat(v.replace('-', '.')) || 9999;

/** Villas in an allocation: "6,7,28", "10-12", "36-1" (a half of a double villa → 36). */
const parseAllocVillas = (input: string) => {
  const out = new Set<string>();
  for (const raw of String(input || '').replace(/\s*-\s*/g, '-').split(/[,;/\s]+/)) {
    const p = raw.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (b > a && b <= TOTAL_VILLAS) { for (let i = a; i <= b; i++) out.add(String(i)); }
      else if (a >= 1 && a <= TOTAL_VILLAS) out.add(String(a));
      continue;
    }
    if (/^\d+$/.test(p)) { const n = Number(p); if (n >= 1 && n <= TOTAL_VILLAS) out.add(String(n)); }
  }
  return [...out];
};

const guestOf = (status: string | null | undefined): { kind: GuestKind; label: string } => {
  const s = String(status || '').trim().toUpperCase();
  if (!s || s === 'VAC' || s === 'VM/VAC') return { kind: 'VAC', label: 'Vacant' };
  if (s === 'DEP/ARR') return { kind: 'DEPARR', label: 'Dep / Arr' };
  if (s.startsWith('ARR') || s === 'VM/ARR') return { kind: 'ARR', label: 'Arrival' };
  if (s.startsWith('DEP')) return { kind: 'DEP', label: 'Departure' };
  if (s === 'OCC' || s === 'VM/OCC') return { kind: 'OCC', label: 'In house' };
  if (s.includes('HOUSE')) return { kind: 'HOUSE', label: 'House use' };
  return { kind: 'OTHER', label: s.charAt(0) + s.slice(1).toLowerCase() };
};

const GUEST_STYLE: Record<GuestKind, string> = {
  ARR: 'bg-blue-100 text-blue-800',
  DEP: 'bg-amber-100 text-amber-800',
  DEPARR: 'bg-violet-100 text-violet-800',
  OCC: 'bg-slate-200 text-slate-700',
  HOUSE: 'bg-teal-100 text-teal-800',
  VAC: 'bg-slate-100 text-slate-400',
  OTHER: 'bg-pink-100 text-pink-800',
};
const GUEST_SHORT: Record<GuestKind, string> = { ARR: 'ARR', DEP: 'DEP', DEPARR: 'D/A', OCC: 'OCC', HOUSE: 'HU', VAC: 'VAC', OTHER: '•' };

const SERVICE_META: Record<ServiceState, { label: string; card: string; text: string; icon: React.ElementType | null }> = {
  pending: { label: 'Not started', card: 'bg-white border-slate-200', text: 'text-slate-400', icon: null },
  active: { label: 'In service', card: 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20', text: 'text-emerald-700', icon: Sparkles },
  done: { label: 'Done', card: 'bg-emerald-50/70 border-emerald-200', text: 'text-emerald-700', icon: CheckCircle2 },
  'td-due': { label: 'Turndown due', card: 'bg-white border-indigo-200', text: 'text-indigo-600', icon: CheckCircle2 },
  dnd: { label: 'DND', card: 'bg-rose-50 border-rose-300', text: 'text-rose-600', icon: DoorClosed },
  refused: { label: 'Refused', card: 'bg-orange-50 border-orange-300', text: 'text-orange-600', icon: Ban },
};

const shortTime = (t?: string | null) => (t ? t.replace(/^0/, '').replace(/\s?(AM|PM)$/i, m => m.trim()[0].toLowerCase()) : '');
const isoTime = (iso?: string | null) => (iso ? formatDisplayTime(iso) : '');
const reasonShort = (r?: string) => ({ 'Morning Service': 'Morning', 'TD Service': 'Turndown', 'Minibar Refill': 'Minibar', 'Guest Request': 'Request', Arrival: 'Arrival', Dep: 'Departure' } as Record<string, string>)[r || ''] || r || 'Service';

const minutesBetween = (start: string, end: string) => {
  const p = (s: string) => {
    const m = s.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!m) return null;
    let h = Number(m[1]);
    const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + Number(m[2]);
  };
  const a = p(start), b = p(end);
  if (a === null || b === null) return null;
  return (b - a + 1440) % 1440;
};
const toMinutesOfDay = (t?: string) => {
  const m = String(t || '').match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return 9999;
  let h = Number(m[1]);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + Number(m[2]);
};
const to12 = (t24: string) => {
  const [hh, mm] = t24.split(':');
  if (mm === undefined) return t24;
  let h = Number(hh);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${mm} ${ap}`;
};
const shiftDate = (d: string, days: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
};
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const TASK_ICON: Record<string, React.ElementType> = { request: MessageSquare, ice: Snowflake, milk: Milk, pref: Heart };

// ============================================================
export default function LiveBoard() {
  const [date, setDate] = useState(getDhakaDateStr());
  const [rows, setRows] = useState<VillaRow[]>([]);
  const [hasVillaAlloc, setHasVillaAlloc] = useState(false);
  const [tasksMissing, setTasksMissing] = useState(false);
  const [guestProjected, setGuestProjected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [now, setNow] = useState(getDhakaTime());

  const [view, setView] = useState<View>('villas');
  const [filter, setFilter] = useState<Filter>('guests');
  const [search, setSearch] = useState('');
  const [vaFilter, setVaFilter] = useState('');
  const [compact, setCompact] = useState(false);
  const [tv, setTv] = useState(false);
  const [openVilla, setOpenVilla] = useState<string | null>(null);

  const today = getDhakaDateStr();
  const isToday = date === today;
  const loadSeq = useRef(0);

  useEffect(() => {
    const v = store.get('hk_board_view'); if (v === 'villas' || v === 'team' || v === 'log') setView(v);
    setCompact(store.get('hk_board_compact') === '1');
    const t = setInterval(() => setNow(getDhakaTime()), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { store.set('hk_board_view', view); }, [view]);
  useEffect(() => { store.set('hk_board_compact', compact ? '1' : '0'); }, [compact]);
  useEffect(() => {
    if (!tv) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setTv(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [tv]);

  // ---------- load ----------
  const load = useCallback(async (quiet = false) => {
    const seq = ++loadSeq.current;
    if (quiet) setIsRefreshing(true); else setIsLoading(true);
    try {
      const [allocRes, hostsRes, guest, logsRes, editRes] = await Promise.all([
        supabase.from('hsk_allocations').select('host_id, area, task_details').eq('report_date', date).eq('area', 'villa'),
        supabase.from('hsk_hosts').select('id, host_id, full_name, nicknames'),
        projectGuestDay(date).catch(() => ({ rows: [] as any[], isProjected: false })),
        supabase.from('hsk_cleaning_logs').select('*').eq('report_date', date),
        supabase.from('hsk_daily_requests').select('*').eq('request_type', 'Time Edit Request').eq('is_done', false),
      ]);
      if (allocRes.error) throw allocRes.error;

      const hostBy: Record<string, Va> = {};
      (hostsRes.data || []).forEach((h: any) => {
        const nick = String(h.nicknames || '').split(',')[0].trim();
        const va = { name: nick || String(h.full_name || '').split(' ')[0] || h.full_name, full: h.full_name, ssl: h.host_id };
        if (h.id) hostBy[h.id] = va;
        if (h.host_id) hostBy[h.host_id] = va;
      });

      const vasBy: Record<string, Va[]> = {};
      const villaAllocs = (allocRes.data || []).filter((a: any) => a.host_id && String(a.task_details || '').trim());
      villaAllocs.forEach((a: any) => {
        const va = hostBy[a.host_id] || { name: 'Unknown', full: 'Unknown host', ssl: '' };
        parseAllocVillas(a.task_details).forEach(v => {
          (vasBy[v] ||= []);
          if (!vasBy[v].some(x => x.full === va.full)) vasBy[v].push(va);
        });
      });

      const guestBy: Record<string, any> = {};
      (guest.rows || []).forEach((r: any) => { const v = normalizeVilla(r.villa_number); if (v) guestBy[v] = r; });

      const logBy: Record<string, any> = {};
      (logsRes.data || []).forEach((l: any) => { const e = logBy[l.villa_number]; if (!e || String(l.updated_at) > String(e.updated_at)) logBy[l.villa_number] = l; });
      const editBy: Record<string, any> = {};
      (editRes.data || []).forEach((r: any) => { editBy[r.villa_number] = r; });

      const villas = new Set<string>();
      for (let i = 1; i <= TOTAL_VILLAS; i++) villas.add(String(i));
      Object.keys(logBy).forEach(v => villas.add(v));
      const list = [...villas].sort((a, b) => villaNum(a) - villaNum(b));

      const { byVilla, tableMissing } = await loadVaTasks(list, date).catch(() => ({ byVilla: {} as Record<string, VaTask[]>, tableMissing: false }));
      if (seq !== loadSeq.current) return;

      const hour = getDhakaTime().getHours();
      const out: VillaRow[] = list.map(v => {
        const g = guestOf(guestBy[v]?.status);
        const log = logBy[v] || null;
        const sessions: Session[] = Array.isArray(log?.session_history) ? log.session_history : [];
        const st = String(log?.status || 'Pending');
        let service: ServiceState = 'pending';
        if (st === 'In Progress') service = 'active';
        else if (st === 'DND') service = 'dnd';
        else if (st === 'Refused') service = 'refused';
        else if (st === 'Completed') {
          const lastReason = sessions[sessions.length - 1]?.reason;
          service = date === getDhakaDateStr() && hour >= 17 && lastReason !== 'TD Service' ? 'td-due' : 'done';
        }
        const tasks = byVilla[v] || [];
        return {
          villa: v, guestKind: g.kind, guestLabel: g.label, guestName: String(guestBy[v]?.guest_name || '').trim(),
          vas: vasBy[v] || [],
          log, sessions, service, minutes: Number(log?.time_spent_minutes) || 0,
          tasks, tasksDone: tasks.filter(t => t.done).length,
          openRequests: tasks.filter(t => t.kind === 'request' && !t.done).length,
          editReq: editBy[v] || null,
        };
      });
      setRows(out);
      setHasVillaAlloc(villaAllocs.length > 0);
      setTasksMissing(tableMissing);
      setGuestProjected(!!(guest as any).isProjected);
      setLastLoaded(new Date());
    } catch (e: any) {
      if (seq === loadSeq.current) toast.error('Could not load the board: ' + (e?.message || e));
    } finally {
      if (seq === loadSeq.current) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Live: VA ticks, service timer, requests, allocation / guest list changes
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const later = () => { clearTimeout(t); t = setTimeout(() => load(true), 700); };
    const ch = supabase.channel(`live-board-${date}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_cleaning_logs' }, later)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_va_task_done' }, later)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, later)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_allocations' }, later)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_summary' }, later)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [date, load]);

  // The turndown switch at 17:00 needs a re-evaluation without waiting for data
  const lastHour = useRef(now.getHours());
  useEffect(() => {
    if (lastHour.current < 17 && now.getHours() >= 17 && isToday) load(true);
    lastHour.current = now.getHours();
  }, [now, isToday, load]);

  // ---------- derived ----------
  const allVas = useMemo(() => [...new Set(rows.flatMap(r => r.vas.map(v => v.full)))].sort(), [rows]);
  const scoped = useMemo(() => (vaFilter ? rows.filter(r => r.vas.some(v => v.full === vaFilter)) : rows), [rows, vaFilter]);

  const stats = useMemo(() => {
    const guests = scoped.filter(r => SERVICED.includes(r.guestKind));
    const tasks = scoped.flatMap(r => r.tasks);
    return {
      guests: guests.length,
      arr: scoped.filter(r => r.guestKind === 'ARR' || r.guestKind === 'DEPARR').length,
      dep: scoped.filter(r => r.guestKind === 'DEP' || r.guestKind === 'DEPARR').length,
      vac: scoped.filter(r => r.guestKind === 'VAC').length,
      unassigned: hasVillaAlloc ? guests.filter(r => !r.vas.length).length : 0,
      doubled: scoped.filter(r => r.vas.length > 1).length,
      tasks: tasks.length, tasksDone: tasks.filter(t => t.done).length,
      open: scoped.filter(r => r.tasks.some(t => !t.done)).length,
      requests: scoped.reduce((n, r) => n + r.openRequests, 0),
      active: scoped.filter(r => r.service === 'active').length,
      done: scoped.filter(r => r.service === 'done' || r.service === 'td-due').length,
      dnd: scoped.filter(r => r.service === 'dnd').length,
      refused: scoped.filter(r => r.service === 'refused').length,
      serviceDone: guests.filter(r => r.service === 'done' || r.service === 'td-due').length,
      logs: scoped.filter(r => r.log).length,
      editReqs: scoped.filter(r => r.editReq).length,
    };
  }, [scoped, hasVillaAlloc]);

  const match = useCallback((r: VillaRow, f: Filter) => {
    switch (f) {
      case 'guests': return SERVICED.includes(r.guestKind);
      case 'arr': return r.guestKind === 'ARR' || r.guestKind === 'DEPARR';
      case 'dep': return r.guestKind === 'DEP' || r.guestKind === 'DEPARR';
      case 'open': return r.tasks.some(t => !t.done);
      case 'unassigned': return SERVICED.includes(r.guestKind) && !r.vas.length;
      case 'active': return r.service === 'active';
      case 'done': return r.service === 'done' || r.service === 'td-due';
      case 'dnd': return r.service === 'dnd';
      case 'refused': return r.service === 'refused';
      default: return true;
    }
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter(r => match(r, filter)).filter(r => !q
      || r.villa === q || r.villa.startsWith(q + '-')
      || (q.length > 1 && (r.guestName.toLowerCase().includes(q) || r.vas.some(v => v.full.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)))));
  }, [scoped, filter, search, match]);

  const team = useMemo(() => {
    const m = new Map<string, { va: Va; villas: VillaRow[] }>();
    rows.forEach(r => r.vas.forEach(va => { if (!m.has(va.full)) m.set(va.full, { va, villas: [] }); m.get(va.full)!.villas.push(r); }));
    return [...m.values()]
      .filter(t => !vaFilter || t.va.full === vaFilter)
      .map(t => {
        const tasks = t.villas.flatMap(v => v.tasks);
        const durations = t.villas.flatMap(v => v.sessions).map(s => Number(s.duration) || 0).filter(d => d > 0 && d < 90);
        return {
          ...t,
          tasks: tasks.length, tasksDone: tasks.filter(x => x.done).length,
          guestVillas: t.villas.filter(v => SERVICED.includes(v.guestKind)).length,
          serviced: t.villas.filter(v => v.service === 'done' || v.service === 'td-due').length,
          avg: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
          autoStops: t.villas.flatMap(v => v.sessions).filter(s => s.autoStopped).length,
          active: t.villas.find(v => v.service === 'active')?.villa || '',
        };
      })
      .sort((a, b) => villaNum(a.villas[0]?.villa || '999') - villaNum(b.villas[0]?.villa || '999'));
  }, [rows, vaFilter]);

  const unassignedGuests = useMemo(() => (hasVillaAlloc ? rows.filter(r => SERVICED.includes(r.guestKind) && !r.vas.length) : []), [rows, hasVillaAlloc]);

  const sessionsLog = useMemo(() => {
    const out: { key: string; row: VillaRow; s: Session; live?: boolean }[] = [];
    visible.forEach(r => {
      r.sessions.forEach((s, i) => out.push({ key: `${r.villa}-${i}`, row: r, s }));
      if (r.service === 'active') out.push({ key: `${r.villa}-live`, row: r, s: { reason: 'In service', start: isoTime(r.log?.start_time) }, live: true });
      if (r.service === 'dnd' || r.service === 'refused') out.push({ key: `${r.villa}-st`, row: r, s: { reason: r.service === 'dnd' ? 'DND' : 'Refused', start: isoTime(r.log?.dnd_time || r.log?.updated_at) } });
    });
    return out.sort((a, b) => toMinutesOfDay(a.s.start) - toMinutesOfDay(b.s.start));
  }, [visible]);

  const selected = rows.find(r => r.villa === openVilla) || null;
  const tasksPct = stats.tasks ? Math.round((stats.tasksDone / stats.tasks) * 100) : 0;

  // ---------- UI pieces ----------
  const chip = (f: Filter, label: string, n: number, tone = '') => (
    <button key={f} onClick={() => setFilter(f)}
      className={`h-8 px-3 rounded-full text-xs font-black whitespace-nowrap border transition-colors ${filter === f ? 'bg-[#6D2158] border-[#6D2158] text-white' : `bg-white border-slate-200 text-slate-600 hover:border-[#6D2158]/40 ${tone}`}`}>
      {label} <span className={filter === f ? 'text-white/70' : 'text-slate-400'}>{n}</span>
    </button>
  );

  const kpi = (label: string, value: React.ReactNode, sub: React.ReactNode, onClick?: () => void, tone = 'border-slate-200', bar?: number) => (
    <button onClick={onClick} disabled={!onClick} className={`text-left bg-white rounded-2xl border ${tone} p-3 min-w-0 enabled:hover:shadow-sm transition-shadow`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">{label}</p>
      <p className="text-2xl font-black text-slate-800 leading-tight mt-0.5">{value}</p>
      {bar !== undefined && <div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${bar}%` }} /></div>}
      <p className="text-[11px] font-bold text-slate-500 mt-1 truncate">{sub}</p>
    </button>
  );

  const taskDots = (r: VillaRow, max = 6) => {
    if (!r.tasks.length) return null;
    const shown = r.tasks.slice(0, max);
    return (
      <span className="inline-flex items-center gap-0.5">
        {shown.map(t => { const I = TASK_ICON[t.kind] || Circle; return <I key={t.key} size={11} className={t.done ? 'text-emerald-500' : t.kind === 'request' ? 'text-rose-500' : 'text-slate-400'} />; })}
        {r.tasks.length > max && <span className="text-[10px] font-black text-slate-400">+{r.tasks.length - max}</span>}
      </span>
    );
  };

  const villaCard = (r: VillaRow) => {
    const meta = SERVICE_META[r.service];
    const SIcon = meta.icon;
    const isVac = r.guestKind === 'VAC' && r.service === 'pending' && !r.tasks.length;
    const unassigned = hasVillaAlloc && SERVICED.includes(r.guestKind) && !r.vas.length;
    const allTasksDone = r.tasks.length > 0 && r.tasksDone === r.tasks.length;
    const border = unassigned ? 'bg-white border-amber-300 border-dashed' : isVac ? 'bg-slate-50 border-slate-200' : meta.card;

    if (compact) {
      return (
        <button key={r.villa} onClick={() => setOpenVilla(r.villa)}
          className={`relative rounded-xl border p-1.5 text-left min-h-[64px] flex flex-col ${border} hover:shadow-md transition-shadow`}>
          <div className="flex items-start justify-between gap-1">
            <span className={`text-lg font-black leading-none ${isVac ? 'text-slate-300' : 'text-[#6D2158]'}`}>{r.villa}</span>
            {SIcon ? <SIcon size={13} className={meta.text} /> : r.openRequests > 0 ? <MessageSquare size={12} className="text-rose-500" /> : null}
          </div>
          <span className={`mt-1 self-start text-[9px] font-black px-1 rounded ${GUEST_STYLE[r.guestKind]}`}>{GUEST_SHORT[r.guestKind]}</span>
          <div className="mt-auto flex items-center justify-between gap-1 pt-1">
            <span className="text-[10px] font-bold text-slate-500 truncate">{r.vas.map(v => v.name).join('/') || (unassigned ? '—' : '')}</span>
            {r.tasks.length > 0 && <span className={`text-[10px] font-black ${allTasksDone ? 'text-emerald-600' : 'text-slate-500'}`}>{r.tasksDone}/{r.tasks.length}</span>}
          </div>
          {r.editReq && <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-purple-600 ring-2 ring-white" title="Time edit request" />}
        </button>
      );
    }

    const lastSession = r.sessions[r.sessions.length - 1];
    return (
      <button key={r.villa} onClick={() => setOpenVilla(r.villa)}
        className={`relative rounded-2xl border-2 p-3 text-left min-h-[132px] flex flex-col gap-1.5 ${border} hover:shadow-md transition-shadow`}>
        <div className="flex items-start justify-between gap-2">
          <span className={`text-2xl font-black leading-none tracking-tight ${isVac ? 'text-slate-300' : 'text-[#6D2158]'}`}>{r.villa}</span>
          <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md ${GUEST_STYLE[r.guestKind]}`}>{r.guestLabel}</span>
        </div>
        {r.guestName && !isVac && <p className="text-[11px] font-bold text-slate-500 truncate -mt-0.5">{r.guestName}</p>}

        <div className="mt-auto space-y-1">
          <div className="flex items-center justify-between gap-2 min-h-[16px]">
            <span className={`text-[11px] font-black flex items-center gap-1 truncate ${unassigned ? 'text-amber-700' : 'text-slate-600'}`}>
              {unassigned ? <><UserX size={12} /> No VA</> : r.vas.length ? r.vas.map(v => v.name).join(' + ') : ''}
            </span>
            {taskDots(r)}
          </div>
          {r.service !== 'pending' && (
            <div className={`flex items-center justify-between gap-2 text-[11px] font-black ${meta.text}`}>
              <span className="flex items-center gap-1 truncate">
                {SIcon && <SIcon size={12} className={r.service === 'active' ? 'animate-pulse' : ''} />}
                {r.service === 'active' ? `Since ${shortTime(isoTime(r.log?.start_time))}`
                  : r.service === 'done' ? `${reasonShort(lastSession?.reason)} ${shortTime(lastSession?.end) || shortTime(isoTime(r.log?.end_time))}`
                  : r.service === 'td-due' ? 'Morning ✓ · TD due'
                  : `${meta.label} ${shortTime(isoTime(r.log?.dnd_time || r.log?.updated_at))}`}
              </span>
              {(r.service === 'done' || r.service === 'td-due') && r.minutes > 0 && <span className="bg-white/80 border border-emerald-200 rounded px-1">{r.minutes}m</span>}
            </div>
          )}
        </div>
        {r.editReq && <span className="absolute -top-2 left-3 bg-purple-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded shadow">Edit request</span>}
        {r.vas.length > 1 && <span className="absolute -top-2 right-3 bg-amber-500 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded shadow">2 VAs</span>}
      </button>
    );
  };

  // ---------- render ----------
  return (
    <div className={`${tv ? 'fixed inset-0 z-[9999]' : 'absolute inset-0 md:left-64 pt-16 md:pt-0'} flex flex-col bg-slate-50 font-sans text-slate-800 overflow-hidden`}>
      {/* HEADER */}
      <div className="flex-none bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex flex-wrap items-center gap-3 z-20">
        <div className="flex items-center gap-3 min-w-0 mr-auto">
          <div className="w-10 h-10 rounded-xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center shrink-0"><LayoutDashboard size={20} /></div>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-[#6D2158] leading-tight">Live Board</h1>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-black">
              {isToday
                ? <span className="inline-flex items-center gap-1 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live{lastLoaded ? ` · updated ${lastLoaded.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                : <span className="text-slate-500">Past day: as it was logged</span>}
              {guestProjected && <span className="text-amber-700">· guest list carried from last upload</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
          <button onClick={() => setDate(d => shiftDate(d, -1))} className="w-8 h-8 rounded-lg hover:bg-white text-slate-500 flex items-center justify-center" aria-label="Previous day"><ChevronLeft size={16} /></button>
          <label className="relative w-32 text-center cursor-pointer">
            <span className="text-sm font-black text-[#6D2158]">{dayLabel(date)}</span>
            <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Date" />
          </label>
          <button onClick={() => setDate(d => shiftDate(d, 1))} className="w-8 h-8 rounded-lg hover:bg-white text-slate-500 flex items-center justify-center" aria-label="Next day"><ChevronRight size={16} /></button>
        </div>
        {!isToday && <button onClick={() => setDate(today)} className="h-10 px-3 rounded-xl bg-[#6D2158] text-white text-xs font-black">Today</button>}
        <button onClick={() => load(true)} className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-[#6D2158] flex items-center justify-center" aria-label="Refresh" title="Refresh">
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => setTv(t => !t)} className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-[#6D2158] hidden md:flex items-center justify-center" title={tv ? 'Exit full screen (Esc)' : 'Full screen for a TV / office screen'} aria-label="Full screen">
          {tv ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-6 py-3 space-y-3">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={30} /></div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                {kpi('Guest villas', stats.guests, `${stats.arr} arrivals · ${stats.dep} departures · ${stats.vac} vacant`, () => setFilter('guests'))}
                {kpi('Task list', `${stats.tasksDone}/${stats.tasks}`, stats.tasks ? `${stats.open} villas with open tasks` : 'No requests, ice, milk or notes', () => setFilter('open'), 'border-slate-200', tasksPct)}
                {kpi('Open requests', stats.requests, stats.requests ? 'not delivered yet' : 'all delivered', () => setFilter('open'), stats.requests ? 'border-rose-200' : 'border-slate-200')}
                {kpi('Service timer', `${stats.serviceDone}/${stats.guests}`, stats.logs ? `${stats.active} in service · ${stats.dnd} DND · ${stats.refused} refused` : 'No VA used the timer', stats.logs ? () => setFilter('done') : undefined)}
                {kpi('Not allocated', stats.unassigned, !hasVillaAlloc ? 'No villa allocation for this day' : stats.unassigned ? 'guest villas without a VA' : `every guest villa has a VA${stats.doubled ? ` · ${stats.doubled} with 2 VAs` : ''}`,
                  stats.unassigned ? () => setFilter('unassigned') : undefined, stats.unassigned || !hasVillaAlloc ? 'border-amber-300 bg-amber-50/40' : 'border-emerald-200')}
              </div>

              {tasksMissing && (
                <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">VA ticks for milk, ice and preferences need supabase/va_daily_tasks.sql. Only requests show as done until it is run.</p>
              )}
              {stats.editReqs > 0 && (
                <button onClick={() => setOpenVilla(scoped.find(r => r.editReq)?.villa || null)} className="w-full text-left text-xs font-black text-purple-800 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Timer size={14} /> {stats.editReqs} time edit request{stats.editReqs > 1 ? 's' : ''} from VAs waiting: tap to review
                </button>
              )}

              {/* TOOLBAR */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-2xl">
                  {([['villas', 'Villas', LayoutGrid], ['team', 'By VA', Users], ['log', 'Time log', ListChecks]] as [View, string, React.ElementType][]).map(([v, label, I]) => (
                    <button key={v} onClick={() => setView(v)} className={`h-8 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 ${view === v ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      <I size={14} /> {label}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Villa, guest or VA"
                    className="w-full h-9 pl-8 pr-8 rounded-xl border border-slate-200 bg-white text-sm font-bold outline-none focus:border-[#6D2158]" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear search"><X size={14} /></button>}
                </div>
                <select value={vaFilter} onChange={e => setVaFilter(e.target.value)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] max-w-[200px]">
                  <option value="">All VAs</option>
                  {allVas.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {view === 'villas' && (
                  <button onClick={() => setCompact(c => !c)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 flex items-center gap-1.5" title="Card size">
                    {compact ? <Grid2x2 size={14} /> : <Rows3 size={14} />} {compact ? 'Large' : 'Compact'}
                  </button>
                )}
              </div>

              {view !== 'team' && (
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
                  {chip('guests', 'Guest villas', stats.guests)}
                  {chip('all', 'All villas', scoped.length)}
                  {chip('arr', 'Arrivals', stats.arr)}
                  {chip('dep', 'Departures', stats.dep)}
                  {chip('open', 'Open tasks', stats.open)}
                  {hasVillaAlloc && stats.unassigned > 0 && chip('unassigned', 'No VA', stats.unassigned, 'text-amber-700')}
                  {stats.logs > 0 && <>
                    {chip('active', 'In service', stats.active)}
                    {chip('done', 'Serviced', stats.done)}
                    {chip('dnd', 'DND', stats.dnd)}
                    {chip('refused', 'Refused', stats.refused)}
                  </>}
                </div>
              )}

              {/* VIEWS */}
              {view === 'villas' && (
                visible.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 text-sm font-bold text-slate-400">No villas match.</div>
                ) : (
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 78 : 158}px, 1fr))` }}>
                    {visible.map(villaCard)}
                  </div>
                )
              )}

              {view === 'team' && (
                <div className="space-y-3">
                  {unassignedGuests.length > 0 && !vaFilter && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                      <p className="text-xs font-black text-amber-800 flex items-center gap-1.5"><UserX size={14} /> Guest villas with no VA ({unassignedGuests.length})</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {unassignedGuests.map(r => (
                          <button key={r.villa} onClick={() => setOpenVilla(r.villa)} className="h-8 px-2.5 rounded-lg bg-white border border-amber-300 text-sm font-black text-amber-800">{r.villa} <span className="text-[10px]">{GUEST_SHORT[r.guestKind]}</span></button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!hasVillaAlloc && <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-sm font-bold text-slate-400">No villa allocation saved for this day.</div>}
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {team.map(t => {
                      const pct = t.tasks ? Math.round((t.tasksDone / t.tasks) * 100) : 0;
                      return (
                        <div key={t.va.full} className="bg-white border border-slate-200 rounded-2xl p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-800 truncate">{t.va.full}</p>
                              <p className="text-[11px] font-bold text-slate-400">{t.va.ssl} · {t.villas.length} villas · {t.guestVillas} with guests</p>
                            </div>
                            {t.active
                              ? <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg flex items-center gap-1 shrink-0"><Sparkles size={11} className="animate-pulse" /> In {t.active}</span>
                              : t.tasks > 0 && t.tasksDone === t.tasks ? <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg shrink-0">All done</span> : null}
                          </div>
                          <div className="flex items-center gap-2 mt-2.5">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                            <span className="text-[11px] font-black text-slate-600 shrink-0">{t.tasks ? `${t.tasksDone}/${t.tasks} tasks` : 'no tasks'}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {t.villas.map(v => {
                              const open = v.tasks.length - v.tasksDone;
                              const tone = v.service === 'active' ? 'bg-emerald-500 text-white border-emerald-500'
                                : v.service === 'dnd' ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : v.service === 'refused' ? 'bg-orange-50 text-orange-700 border-orange-200'
                                : v.service === 'done' || v.service === 'td-due' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : v.guestKind === 'VAC' ? 'bg-slate-50 text-slate-400 border-slate-200'
                                : 'bg-white text-slate-700 border-slate-200';
                              return (
                                <button key={v.villa} onClick={() => setOpenVilla(v.villa)} title={`${v.villa}: ${v.guestLabel}${open ? ` · ${open} open task${open > 1 ? 's' : ''}` : ''}`}
                                  className={`relative h-9 min-w-[44px] px-2 rounded-lg border text-sm font-black flex items-center justify-center gap-1 ${tone}`}>
                                  {v.villa}
                                  <span className={`text-[8px] font-black px-0.5 rounded ${GUEST_STYLE[v.guestKind]}`}>{GUEST_SHORT[v.guestKind]}</span>
                                  {open > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">{open}</span>}
                                </button>
                              );
                            })}
                          </div>
                          {(t.avg > 0 || t.autoStops > 0) && (
                            <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100 text-[11px] font-black">
                              {t.avg > 0 && <span className={`px-2 py-0.5 rounded-md ${t.avg > 45 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>Avg {t.avg}m / service</span>}
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{t.serviced}/{t.guestVillas} serviced</span>
                              {t.autoStops > 0 && <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">{t.autoStops} timer auto-stopped</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {view === 'log' && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  {sessionsLog.length === 0 ? (
                    <p className="p-10 text-center text-sm font-bold text-slate-400">No service times logged{stats.logs ? ' for these villas' : ' this day. VAs log them with the service timer'}.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="text-left px-3 py-2">Time</th>
                            <th className="text-left px-3 py-2">Villa</th>
                            <th className="text-left px-3 py-2 hidden sm:table-cell">VA</th>
                            <th className="text-left px-3 py-2">Service</th>
                            <th className="text-right px-3 py-2">Mins</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sessionsLog.map(({ key, row, s, live }) => (
                            <tr key={key} onClick={() => setOpenVilla(row.villa)} className="hover:bg-slate-50 cursor-pointer">
                              <td className="px-3 py-2 font-bold text-slate-600 whitespace-nowrap">{shortTime(s.start) || '—'}{s.end ? ` – ${shortTime(s.end)}` : ''}</td>
                              <td className="px-3 py-2"><span className="font-black text-[#6D2158]">{row.villa}</span> <span className={`text-[9px] font-black px-1 rounded ${GUEST_STYLE[row.guestKind]}`}>{GUEST_SHORT[row.guestKind]}</span></td>
                              <td className="px-3 py-2 font-bold text-slate-600 hidden sm:table-cell">{row.log?.host_name || row.vas.map(v => v.name).join(' + ')}</td>
                              <td className="px-3 py-2">
                                <span className={`font-black text-xs ${live ? 'text-emerald-600' : s.reason === 'DND' ? 'text-rose-600' : s.reason === 'Refused' ? 'text-orange-600' : 'text-slate-700'}`}>
                                  {live && <Sparkles size={11} className="inline mr-1 animate-pulse" />}{live || s.reason === 'DND' || s.reason === 'Refused' ? s.reason : reasonShort(s.reason)}
                                </span>
                                {s.autoStopped && <span className="ml-1.5 text-[9px] font-black uppercase bg-rose-100 text-rose-700 px-1 rounded">auto-stop</span>}
                              </td>
                              <td className="px-3 py-2 text-right font-black text-slate-700">{s.duration ? `${s.duration}` : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* LEGEND */}
              {view === 'villas' && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-bold text-slate-500 pt-1 pb-6">
                  <span className="flex items-center gap-1"><MessageSquare size={12} className="text-rose-500" /> request</span>
                  <span className="flex items-center gap-1"><Snowflake size={12} /> ice</span>
                  <span className="flex items-center gap-1"><Milk size={12} /> milk</span>
                  <span className="flex items-center gap-1"><Heart size={12} /> preference</span>
                  <span className="flex items-center gap-1"><Check size={12} className="text-emerald-500" /> green = ticked by the VA</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-dashed border-amber-300" /> guest villa, no VA</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selected && (
        <VillaDrawer key={selected.villa} row={selected} date={date} isToday={isToday} onClose={() => setOpenVilla(null)} onSaved={() => load(true)} />
      )}
    </div>
  );
}

// ============================================================
// Villa detail: guest, VA, today's tasks, service log (admin override) and VA time edit requests
function VillaDrawer({ row, date, isToday, onClose, onSaved }: { row: VillaRow; date: string; isToday: boolean; onClose: () => void; onSaved: () => void }) {
  const initial = () => ({
    status: String(row.log?.status || 'Pending'),
    sessions: JSON.parse(JSON.stringify(row.sessions || [])) as Session[],
  });
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const total = form.sessions.reduce((n, s) => n + (Number(s.duration) || 0), 0);
  const dirty = touched && JSON.stringify(form) !== JSON.stringify(initial());
  const edit = (fn: (f: typeof form) => typeof form) => { setTouched(true); setForm(fn); };

  // Fresh data for this villa (a VA finished, another admin saved) refreshes the form unless you are editing it
  const stamp = `${row.log?.updated_at || ''}`;
  useEffect(() => {
    if (!touched) setForm(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const setSession = (i: number, patch: Partial<Session>) => edit(f => {
    const sessions = f.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s));
    const s = sessions[i];
    if (('start' in patch || 'end' in patch) && s.start && s.end) {
      const m = minutesBetween(s.start, s.end);
      if (m !== null) sessions[i] = { ...s, duration: m };
    }
    return { ...f, sessions };
  });

  /** Update the day's log row, or create it when the VA never started the timer. */
  const writeLog = async (patch: Record<string, any>) => {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase.from('hsk_cleaning_logs').update({ ...patch, updated_at: nowIso }).match({ report_date: date, villa_number: row.villa }).select('id');
    if (error) throw error;
    if (!data?.length) {
      const va = row.vas[0];
      const { error: e2 } = await supabase.from('hsk_cleaning_logs').insert({ report_date: date, villa_number: row.villa, host_id: va?.ssl || null, host_name: va?.full || null, ...patch, updated_at: nowIso });
      if (e2) throw e2;
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await writeLog({ status: form.status, time_spent_minutes: total || null, session_history: form.sessions });
      toast.success(`Villa ${row.villa} saved`);
      setTouched(false);
      onSaved();
    } catch (e: any) { toast.error('Not saved: ' + (e?.message || e)); }
    setSaving(false);
  };

  const req = row.editReq;
  const parsedReq = useMemo(() => {
    if (!req) return null;
    const d = String(req.item_details || '');
    return {
      reason: (d.match(/(.*) time edit requested/i)?.[1] || 'Morning Service').trim(),
      start: to12((d.match(/Start:\s*([0-9:]+)/i)?.[1] || '').trim()),
      end: to12((d.match(/End:\s*([0-9:]+)/i)?.[1] || '').trim()),
      duration: Number(d.match(/New Duration:\s*(\d+)/i)?.[1] || 0),
    };
  }, [req]);

  const closeRequest = async () => {
    const { error } = await supabase.from('hsk_daily_requests').update({ is_done: true, is_sent: true }).eq('id', req.id);
    if (error) throw error;
  };
  const acceptRequest = async () => {
    if (!parsedReq) return;
    setSaving(true);
    try {
      const sessions = [...row.sessions];
      const i = sessions.findIndex(s => s.reason === parsedReq.reason);
      const s = { reason: parsedReq.reason, start: parsedReq.start, end: parsedReq.end, duration: parsedReq.duration };
      if (i >= 0) sessions[i] = { ...sessions[i], ...s }; else sessions.push(s);
      await writeLog({ status: 'Completed', time_spent_minutes: sessions.reduce((n, x) => n + (Number(x.duration) || 0), 0), session_history: sessions });
      await closeRequest();
      toast.success('Time edit approved');
      onSaved();
    } catch (e: any) { toast.error('Not saved: ' + (e?.message || e)); }
    setSaving(false);
  };
  const declineRequest = async () => {
    setSaving(true);
    try { await closeRequest(); toast.success('Request declined'); onSaved(); } catch (e: any) { toast.error('Not saved: ' + (e?.message || e)); }
    setSaving(false);
  };

  const tryClose = () => { if (dirty && !window.confirm('Close without saving your changes?')) return; onClose(); };

  return (
    <div className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/40 backdrop-blur-[2px]" onClick={tryClose}>
      <div className="w-full sm:max-w-md h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex-none px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-[#6D2158]">Villa {row.villa}</h2>
              <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md ${GUEST_STYLE[row.guestKind]}`}>{row.guestLabel}</span>
            </div>
            {row.guestName && <p className="text-sm font-bold text-slate-600 truncate">{row.guestName}</p>}
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              {row.vas.length ? row.vas.map(v => `${v.full}${v.ssl ? ` (${v.ssl})` : ''}`).join(' + ') : 'No VA allocated'}
            </p>
          </div>
          <button onClick={tryClose} className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:text-rose-500 flex items-center justify-center shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Edit request */}
          {req && parsedReq && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3.5">
              <p className="text-[11px] font-black uppercase tracking-wider text-purple-800 flex items-center gap-1.5"><Timer size={13} /> VA asked to change a time</p>
              <p className="text-sm font-black text-purple-900 mt-1.5">{reasonShort(parsedReq.reason)}: {shortTime(parsedReq.start)} – {shortTime(parsedReq.end)} · {parsedReq.duration}m</p>
              <p className="text-[11px] font-bold text-purple-700/80 mt-1 whitespace-pre-wrap">{req.item_details}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={acceptRequest} disabled={saving} className="flex-1 h-10 rounded-xl bg-purple-600 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50"><CheckCircle2 size={14} /> Approve</button>
                <button onClick={declineRequest} disabled={saving} className="flex-1 h-10 rounded-xl bg-white border border-purple-200 text-purple-700 text-xs font-black disabled:opacity-50">Decline</button>
              </div>
            </div>
          )}

          {/* Tasks */}
          <section>
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
              {isToday ? "Today's tasks" : 'Tasks'} {row.tasks.length > 0 && <span className="text-slate-500">· {row.tasksDone}/{row.tasks.length} done</span>}
            </h3>
            {row.tasks.length === 0 ? (
              <p className="text-sm font-bold text-slate-400 bg-slate-50 rounded-xl px-3 py-3">No requests, ice, milk or guest notes for this villa.</p>
            ) : (
              <ul className="space-y-1.5">
                {row.tasks.map(t => {
                  const I = TASK_ICON[t.kind] || Circle;
                  return (
                    <li key={t.key} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 ${t.done ? 'bg-emerald-50/60 border-emerald-100' : 'bg-white border-slate-200'}`}>
                      <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${t.done ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300'}`}>{t.done && <Check size={12} strokeWidth={3} />}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold ${t.done ? 'text-slate-500' : 'text-slate-800'}`}><I size={12} className={`inline mr-1 -mt-0.5 ${t.kind === 'request' && !t.done ? 'text-rose-500' : 'text-slate-400'}`} />{t.title}</p>
                        <p className="text-[11px] font-bold text-slate-400">
                          {[t.time, t.detail, t.done && t.doneBy ? `✓ ${t.doneBy}${t.doneAt ? ` ${shortTime(isoTime(t.doneAt))}` : ''}` : ''].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Service log */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Service log</h3>
              <button onClick={() => edit(f => ({ ...f, sessions: [...f.sessions, { reason: 'Morning Service', start: '', end: '', duration: 0 }] }))}
                className="h-7 px-2.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-black flex items-center gap-1 hover:bg-slate-200"><Plus size={12} /> Session</button>
            </div>
            <div className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-xl mb-3">
              {(['Pending', 'In Progress', 'Completed', 'DND', 'Refused'] as const).map(s => (
                <button key={s} onClick={() => edit(f => ({ ...f, status: s }))}
                  className={`h-8 rounded-lg text-[10px] font-black ${form.status === s ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500'}`}>
                  {s === 'In Progress' ? 'Active' : s === 'Completed' ? 'Done' : s === 'Pending' ? 'Not started' : s}
                </button>
              ))}
            </div>
            {form.sessions.length === 0 ? (
              <p className="text-sm font-bold text-slate-400 bg-slate-50 rounded-xl px-3 py-3">No service times logged.</p>
            ) : (
              <div className="space-y-2">
                {form.sessions.map((s, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-2.5">
                    <div className="flex items-center gap-2">
                      <select value={s.reason || ''} onChange={e => setSession(i, { reason: e.target.value })} className="flex-1 h-8 px-2 rounded-lg border border-slate-200 text-xs font-bold bg-white">
                        {[...new Set(['Morning Service', 'TD Service', 'Arrival', 'Dep', 'Guest Request', 'Minibar Refill', s.reason || 'Morning Service'])].map(r => <option key={r} value={r}>{reasonShort(r)}</option>)}
                      </select>
                      {s.autoStopped && <span className="text-[9px] font-black uppercase bg-rose-100 text-rose-700 px-1 rounded">auto-stop</span>}
                      <button onClick={() => edit(f => ({ ...f, sessions: f.sessions.filter((_, j) => j !== i) }))} className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center" aria-label="Remove session"><Trash2 size={14} /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <label className="text-[10px] font-black text-slate-400">In
                        <input value={s.start || ''} onChange={e => setSession(i, { start: e.target.value })} placeholder="10:00 AM" className="mt-0.5 w-full h-8 px-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700" />
                      </label>
                      <label className="text-[10px] font-black text-slate-400">Out
                        <input value={s.end || ''} onChange={e => setSession(i, { end: e.target.value })} placeholder="10:45 AM" className="mt-0.5 w-full h-8 px-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700" />
                      </label>
                      <label className="text-[10px] font-black text-slate-400">Mins
                        <input type="number" min={0} value={s.duration ?? 0} onChange={e => setSession(i, { duration: Math.max(0, parseInt(e.target.value || '0', 10)) })} className="mt-0.5 w-full h-8 px-2 rounded-lg border border-slate-200 text-xs font-black text-emerald-700" />
                      </label>
                    </div>
                  </div>
                ))}
                <p className="text-right text-xs font-black text-slate-500">Total {total}m</p>
              </div>
            )}
          </section>
        </div>

        <div className="flex-none p-4 border-t border-slate-100 flex gap-2">
          <button onClick={() => { setForm(initial()); setTouched(false); }} disabled={!dirty || saving} className="h-11 px-4 rounded-xl border border-slate-200 text-xs font-black text-slate-600 disabled:opacity-40">Reset</button>
          <button onClick={save} disabled={!dirty || saving} className="flex-1 h-11 rounded-xl bg-[#6D2158] text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save service log
          </button>
        </div>
      </div>
    </div>
  );
}

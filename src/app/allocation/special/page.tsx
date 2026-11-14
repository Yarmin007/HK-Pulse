"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plane, Moon, Sun, BedDouble, Key, SprayCan, ChevronLeft, ChevronRight, Loader2,
  ShieldAlert, Plus, Minus, Trash2, Pencil, X, Check, AlertTriangle, CalendarDays, Copy, LogOut, Briefcase,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
  SpecialKind, ServicePlan, SPECIAL_STATUS, SERVICE_TAG, WEEKDAYS, HOUSE_USE_HORIZON,
  getSpecialKind, hasFumigationTag, addFumigationTag, stripFumigationTag, isOpenStay,
  formatHouseUseNotes, parseHouseUseNotes, planLabel, isPlannedService,
  todayYMD, addDays, daysBetween, dateRange, toStayDates, prettyDate,
} from '@/lib/specialVillas';

const TABLE = 'hsk_daily_summary';
const errMsg = (err: unknown) => (err as { message?: string })?.message || 'database error';
const TOTAL_VILLAS = 97;
const ROW_FIELDS = 'id, report_date, villa_number, status, guest_name, arrival_time, departure_time, stay_dates, remarks, preferences';
// Guest details wiped when a villa is turned into a special villa.
const CLEAR_GUEST = { pax_adults: 0, pax_kids: 0, meal_plan: '', gem_name: '', preferences: '', stay_id: '' };
const VAC_PAYLOAD = { status: 'VAC', guest_name: '', arrival_time: '', departure_time: '', stay_dates: '', remarks: '', preferences: '' };

type Row = {
  id: string; report_date: string; villa_number: string; status: string; guest_name: string | null;
  arrival_time: string | null; departure_time: string | null; stay_dates: string | null;
  remarks: string | null; preferences: string | null;
};
type DayRow = { id: string; villa_number: string; status: string; guest_name: string | null };
type Booking = { key: string; kind: SpecialKind; villa: string; name: string; start: string; end: string; open: boolean; rows: Row[] };
type Tab = 'TMA' | 'HOUSE_USE' | 'SHOW_VILLA' | 'FUMIGATION';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'TMA', label: 'TMA', icon: Plane },
  { id: 'HOUSE_USE', label: 'House Use', icon: BedDouble },
  { id: 'SHOW_VILLA', label: 'Show Villa', icon: Key },
  { id: 'FUMIGATION', label: 'Fumigation', icon: SprayCan },
];

// Full class strings so Tailwind keeps them.
const THEME: Record<Tab, { solid: string; soft: string; text: string; border: string; ring: string }> = {
  TMA: { solid: 'bg-amber-500 text-white', soft: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', ring: 'ring-amber-400' },
  HOUSE_USE: { solid: 'bg-[#6D2158] text-white', soft: 'bg-fuchsia-50', text: 'text-[#6D2158]', border: 'border-fuchsia-200', ring: 'ring-[#6D2158]' },
  SHOW_VILLA: { solid: 'bg-sky-600 text-white', soft: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', ring: 'ring-sky-400' },
  FUMIGATION: { solid: 'bg-teal-600 text-white', soft: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200', ring: 'ring-teal-400' },
};
const tabOf = (kind: SpecialKind): Tab => (kind === 'TMA_NIGHT' || kind === 'TMA_DAY' ? 'TMA' : kind);
const DAILY_TABS: Tab[] = ['SHOW_VILLA', 'FUMIGATION']; // only for the day shown at the top

const parseVillas = (input: string) => {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const tok of input.split(/[\s,;/]+/).filter(Boolean)) {
    const raw = tok.replace(/^v/i, '');
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= TOTAL_VILLAS && String(n) === raw.replace(/^0+/, '')) {
      if (!valid.includes(String(n))) valid.push(String(n));
    } else invalid.push(tok);
  }
  return { valid, invalid };
};

const isFreeStatus = (status?: string | null) => {
  const st = String(status || '').toUpperCase().trim();
  return !st || st === 'VAC' || st === 'VM/VAC';
};

type SvcMode = ServicePlan['mode'];
type FormState = {
  villas: string; date: string; endDate: string; depKnown: boolean; nights: number;
  arrTime: string; depTime: string; name: string; pm: string;
  svcMode: SvcMode; svcDays: number[]; tmaMode: 'NIGHT' | 'DAY';
};
const blankForm = (date: string, keep?: Partial<FormState>): FormState => ({
  villas: '', date, endDate: addDays(date, 1), depKnown: false, nights: 1, arrTime: '', depTime: '',
  name: '', pm: '', svcMode: 'DAILY', svcDays: [], tmaMode: 'NIGHT', ...keep,
});

type ConfirmState = { title: string; body: string; lines?: string[]; confirmText: string; danger?: boolean; resolve: (ok: boolean) => void };

export default function SpecialVillasPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayYMD());
  const [tab, setTab] = useState<Tab>('TMA');
  const [rows, setRows] = useState<Row[]>([]);
  const [dayRows, setDayRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => blankForm(todayYMD()));
  const [editing, setEditing] = useState<Booking | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    let role = 'staff';
    try {
      const session = localStorage.getItem('hk_pulse_session');
      if (session) role = JSON.parse(session).system_role || role;
      if (localStorage.getItem('hk_pulse_admin_auth') === 'true') role = 'admin';
    } catch { /* ignore bad storage */ }
    setIsAdmin(role === 'admin');
    setAuthChecked(true);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [special, day] = await Promise.all([
      supabase.from(TABLE).select(ROW_FIELDS)
        .gte('report_date', addDays(selectedDate, -30)).lte('report_date', addDays(selectedDate, 120))
        .or('status.ilike.*TMA*,status.ilike.*HOUSE*,status.ilike.*SHOW*,status.ilike.*FUMIG*,remarks.ilike.*FUMIG*')
        .order('report_date'),
      supabase.from(TABLE).select('id, villa_number, status, guest_name').eq('report_date', selectedDate),
    ]);
    if (special.error || day.error) toast.error('Could not load special villas');
    setRows((special.data as Row[]) || []);
    setDayRows((day.data as DayRow[]) || []);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin, fetchAll]);

  const askConfirm = (opts: Omit<ConfirmState, 'resolve'>) =>
    new Promise<boolean>(resolve => setConfirmState({ ...opts, resolve }));
  const closeConfirm = (ok: boolean) => { confirmState?.resolve(ok); setConfirmState(null); };

  // ---------- Derived data ----------
  const bookings = useMemo(() => {
    const map = new Map<string, Booking>();
    const add = (kind: SpecialKind, r: Row) => {
      const villa = String(r.villa_number);
      const name = String(r.guest_name || '').trim();
      // Rows of one stay share stay_dates. Daily kinds and legacy rows group by day (House Use legacy: by guest).
      const daily = kind === 'SHOW_VILLA' || kind === 'FUMIGATION';
      const group = !daily && r.stay_dates ? r.stay_dates : kind === 'HOUSE_USE' ? name.toUpperCase() : r.report_date;
      const key = `${kind}|${villa}|${group}`;
      const b = map.get(key);
      map.set(key, b
        ? {
            ...b, rows: [...b.rows, r],
            start: r.report_date < b.start ? r.report_date : b.start,
            end: r.report_date > b.end ? r.report_date : b.end,
            open: b.open || isOpenStay(r.stay_dates),
          }
        : { key, kind, villa, name, start: r.report_date, end: r.report_date, open: isOpenStay(r.stay_dates), rows: [r] });
    };
    for (const r of rows) {
      const kind = getSpecialKind(r.status);
      if (kind) add(kind, r);
      if (kind !== 'FUMIGATION' && hasFumigationTag(r.remarks)) add('FUMIGATION', r);
    }
    return [...map.values()]
      .map(b => ({ ...b, rows: [...b.rows].sort((a, c) => a.report_date.localeCompare(c.report_date)) }))
      .sort((a, b) => a.start.localeCompare(b.start) || parseInt(a.villa) - parseInt(b.villa));
  }, [rows]);

  const onDate = useMemo(() => bookings.filter(b => b.rows.some(r => r.report_date === selectedDate)), [bookings, selectedDate]);
  const upcoming = useMemo(() => bookings.filter(b => b.start > selectedDate && !DAILY_TABS.includes(tabOf(b.kind))), [bookings, selectedDate]);
  const countFor = (t: Tab) => onDate.filter(b => tabOf(b.kind) === t).length;

  // Most recent earlier day that had show villas — offered as "copy".
  const lastShowDay = useMemo(() => {
    const earlier = bookings.filter(b => b.kind === 'SHOW_VILLA' && b.start < selectedDate);
    if (!earlier.length) return null;
    const day = earlier.reduce((m, b) => (b.start > m ? b.start : m), earlier[0].start);
    return { day, rows: earlier.filter(b => b.start === day).map(b => b.rows[0]) };
  }, [bookings, selectedDate]);

  const dayStatus = useMemo(() => new Map(dayRows.map(r => [String(r.villa_number), r])), [dayRows]);
  const parsed = parseVillas(form.villas);
  const previewDate = DAILY_TABS.includes(tab) ? selectedDate : form.date;
  const plan: ServicePlan = { mode: form.svcMode, weekdays: form.svcDays, anchor: form.date };

  // ---------- Navigation ----------
  const goToDate = (d: string) => {
    if (!d) return;
    setSelectedDate(d);
    if (!editing) setForm(f => ({ ...f, date: d, endDate: addDays(d, Math.max(1, daysBetween(f.date, f.endDate))) }));
  };
  const switchTab = (t: Tab) => { setTab(t); setEditing(null); setForm(f => blankForm(selectedDate, { villas: f.villas })); };
  const cancelEdit = () => { setEditing(null); setForm(blankForm(selectedDate)); };

  // ---------- Writes ----------
  const clearRows = async (rs: Row[]) => {
    const today = todayYMD();
    // Future days: delete, so the Guest List can still roll over/project that day normally.
    const del = rs.filter(r => r.report_date > today).map(r => r.id);
    const vac = rs.filter(r => r.report_date <= today).map(r => r.id);
    if (del.length) { const { error } = await supabase.from(TABLE).delete().in('id', del); if (error) throw error; }
    if (vac.length) { const { error } = await supabase.from(TABLE).update(VAC_PAYLOAD).in('id', vac); if (error) throw error; }
  };

  const writeRows = async (
    kind: SpecialKind, villas: string[], dates: string[],
    build: (villa: string, date: string) => Record<string, unknown>,
  ) => {
    const { data: existing, error } = await supabase.from(TABLE)
      .select('id, report_date, villa_number, status, guest_name').in('report_date', dates).in('villa_number', villas);
    if (error) throw error;

    const conflicts = (existing || []).filter(r => !isFreeStatus(r.status) && getSpecialKind(r.status) !== kind);
    if (conflicts.length) {
      const ok = await askConfirm({
        title: 'Villa not vacant',
        body: 'These villas already have something else in the Guest List. Saving will replace it.',
        lines: conflicts.slice(0, 8).map(r => `V${r.villa_number} · ${prettyDate(r.report_date)} · ${r.status}${r.guest_name ? ` — ${r.guest_name}` : ''}`),
        confirmText: 'Replace',
        danger: true,
      });
      if (!ok) return false;
    }

    const byKey = new Map<string, string>();
    for (const r of existing || []) {
      const k = `${r.report_date}|${String(r.villa_number)}`;
      if (!byKey.has(k)) byKey.set(k, r.id);
    }
    const updates: { id: string; payload: Record<string, unknown> }[] = [];
    const inserts: Record<string, unknown>[] = [];
    villas.forEach(v => dates.forEach(d => {
      const payload = { report_date: d, villa_number: v, ...CLEAR_GUEST, ...build(v, d) };
      const id = byKey.get(`${d}|${v}`);
      if (id) updates.push({ id, payload }); else inserts.push(payload);
    }));
    for (let i = 0; i < updates.length; i += 20) {
      const res = await Promise.all(updates.slice(i, i + 20).map(u => supabase.from(TABLE).update(u.payload).eq('id', u.id)));
      const err = res.find(r => r.error)?.error;
      if (err) throw err;
    }
    if (inserts.length) { const { error: insErr } = await supabase.from(TABLE).insert(inserts); if (insErr) throw insErr; }
    return true;
  };

  // Fumigation never wipes a guest: a departing villa keeps its details and just gets the FUMIGATION remark.
  const saveFumigation = async (villas: string[]) => {
    const { data: existing, error } = await supabase.from(TABLE)
      .select('id, villa_number, status, remarks').eq('report_date', selectedDate).in('villa_number', villas);
    if (error) throw error;
    const free = { status: SPECIAL_STATUS.FUMIGATION, guest_name: 'FUMIGATION', arrival_time: '', departure_time: '', stay_dates: '', remarks: 'FUMIGATION', ...CLEAR_GUEST };
    const ops = villas.map(v => {
      const r = (existing || []).find(x => String(x.villa_number) === v);
      if (!r) return supabase.from(TABLE).insert({ report_date: selectedDate, villa_number: v, ...free });
      if (isFreeStatus(r.status) || getSpecialKind(r.status) === 'FUMIGATION') return supabase.from(TABLE).update(free).eq('id', r.id);
      return supabase.from(TABLE).update({ remarks: addFumigationTag(r.remarks) }).eq('id', r.id);
    });
    const res = await Promise.all(ops);
    const err = res.find(r => r.error)?.error;
    if (err) throw err;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const villas = parsed.valid;
    if (!villas.length) return toast.error(`Enter villa numbers (1–${TOTAL_VILLAS})`);
    if (parsed.invalid.length) return toast.error(`Not a villa: ${parsed.invalid.join(', ')}`);

    const kind: SpecialKind = tab === 'TMA' ? (form.tmaMode === 'NIGHT' ? 'TMA_NIGHT' : 'TMA_DAY') : tab;
    const done = async () => {
      toast.success(`${editing ? 'Updated' : 'Saved'} ${villas.map(v => `V${v}`).join(', ')}`);
      setEditing(null);
      setForm(blankForm(selectedDate, { tmaMode: form.tmaMode }));
      await fetchAll();
    };

    setSaving(true);
    try {
      if (kind === 'FUMIGATION') { await saveFumigation(villas); await done(); return; }

      let dates: string[];
      let stay: string;
      if (kind === 'TMA_NIGHT') {
        dates = dateRange(form.date, addDays(form.date, Math.max(1, form.nights)));
        stay = toStayDates(dates[0], dates[dates.length - 1]);
      } else if (kind === 'HOUSE_USE') {
        if (!form.name.trim()) return toast.error('Enter the guest / staff name');
        if (form.depKnown && form.endDate < form.date) return toast.error('Departure is before arrival');
        if (form.svcMode === 'WEEKDAYS' && !form.svcDays.length) return toast.error('Pick at least one service day');
        // Open stay: write a month ahead; the Guest List rollover keeps carrying it after that.
        const openUntil = addDays([form.date, selectedDate, todayYMD()].sort().pop()!, HOUSE_USE_HORIZON);
        dates = dateRange(form.date, form.depKnown ? form.endDate : openUntil);
        stay = toStayDates(form.date, form.depKnown ? form.endDate : null);
      } else if (kind === 'TMA_DAY') {
        dates = [form.date];
        stay = toStayDates(form.date, form.date);
      } else {
        dates = [selectedDate]; // show villa: today only
        stay = '';
      }
      const first = dates[0];
      const last = dates[dates.length - 1];
      const status = SPECIAL_STATUS[kind];
      const notes = formatHouseUseNotes(form.pm, plan);

      const build = (_v: string, d: string): Record<string, unknown> => {
        switch (kind) {
          case 'TMA_NIGHT':
            return {
              status, guest_name: 'TMA NIGHT', stay_dates: stay,
              arrival_time: d === first ? form.arrTime : '', departure_time: d === last ? form.depTime : '',
              remarks: d === first ? 'TMA arrival' : d === last ? 'TMA departure' : 'TMA in-house',
            };
          case 'TMA_DAY':
            return { status, guest_name: 'TMA DAY', stay_dates: stay, arrival_time: form.arrTime, departure_time: form.depTime, remarks: '' };
          case 'HOUSE_USE':
            return {
              status, guest_name: form.name.trim(), stay_dates: stay, preferences: notes,
              arrival_time: d === first ? form.arrTime : '',
              departure_time: form.depKnown && d === last ? form.depTime : '',
              remarks: isPlannedService(plan, d, first) ? SERVICE_TAG : '',
            };
          default:
            return { status, guest_name: 'SHOW VILLA', stay_dates: '', arrival_time: form.arrTime, departure_time: '', remarks: '' };
        }
      };

      const saved = await writeRows(kind, villas, dates, build);
      if (!saved) return;
      if (editing) {
        // Drop days of the old booking that the edited one no longer covers.
        const leftover = editing.rows.filter(r => !(villas.includes(String(r.villa_number)) && dates.includes(r.report_date)));
        await clearRows(leftover);
      }
      await done();
    } catch (err) {
      toast.error(`Save failed: ${errMsg(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const copyShowVillas = async () => {
    if (!lastShowDay) return;
    const villas = lastShowDay.rows.map(r => String(r.villa_number));
    const times = new Map(lastShowDay.rows.map(r => [String(r.villa_number), r.arrival_time || '']));
    setSaving(true);
    try {
      const saved = await writeRows('SHOW_VILLA', villas, [selectedDate], v => ({
        status: SPECIAL_STATUS.SHOW_VILLA, guest_name: 'SHOW VILLA', stay_dates: '', arrival_time: times.get(v) || '', departure_time: '', remarks: '',
      }));
      if (saved) { toast.success(`Copied ${villas.length} show villa${villas.length > 1 ? 's' : ''}`); await fetchAll(); }
    } catch (err) {
      toast.error(`Copy failed: ${errMsg(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (b: Booking) => {
    setTab(tabOf(b.kind));
    setEditing(b);
    const { pm, plan: p } = parseHouseUseNotes(b.rows[0]?.preferences);
    setForm({
      villas: b.villa, date: b.start, endDate: b.open ? addDays(b.start, 1) : b.end, depKnown: !b.open,
      nights: Math.max(1, daysBetween(b.start, b.end)),
      arrTime: b.rows[0]?.arrival_time || '', depTime: b.rows[b.rows.length - 1]?.departure_time || '',
      name: b.kind === 'HOUSE_USE' ? b.name : '', pm,
      svcMode: p?.mode || 'DAILY', svcDays: p?.weekdays || [],
      tmaMode: b.kind === 'TMA_DAY' ? 'DAY' : 'NIGHT',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeBooking = async (b: Booking) => {
    if (b.kind === 'FUMIGATION') {
      const r = b.rows[0];
      try {
        if (getSpecialKind(r.status) === 'FUMIGATION') await clearRows([r]);
        else { const { error } = await supabase.from(TABLE).update({ remarks: stripFumigationTag(r.remarks) }).eq('id', r.id); if (error) throw error; }
        toast.success(`V${b.villa} removed from fumigation`);
        await fetchAll();
      } catch (err) { toast.error(`Remove failed: ${errMsg(err)}`); }
      return;
    }
    const fromStart = b.start >= selectedDate;
    const target = fromStart ? b.rows : b.rows.filter(r => r.report_date >= selectedDate);
    const ok = await askConfirm({
      title: `Remove V${b.villa}?`,
      body: fromStart
        ? 'The villa goes back to vacant in the Guest List for every day of this booking.'
        : `Earlier days are kept. From ${prettyDate(selectedDate)} onward the villa goes back to vacant.`,
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await clearRows(target);
      toast.success(`V${b.villa} removed`);
      if (editing?.key === b.key) cancelEdit();
      await fetchAll();
    } catch (err) {
      toast.error(`Remove failed: ${errMsg(err)}`);
    }
  };

  // House Use: departure becomes the selected day; later days are cleared.
  const checkOut = async (b: Booking) => {
    const ok = await askConfirm({
      title: `Check out V${b.villa}?`,
      body: `${b.name || 'House Use'} departs on ${prettyDate(selectedDate)}. The villa is free from the next day.`,
      confirmText: 'Check out',
    });
    if (!ok) return;
    try {
      const keep = b.rows.filter(r => r.report_date <= selectedDate).map(r => r.id);
      const stay = toStayDates(b.start, selectedDate);
      if (keep.length) { const { error } = await supabase.from(TABLE).update({ stay_dates: stay }).in('id', keep); if (error) throw error; }
      await clearRows(b.rows.filter(r => r.report_date > selectedDate));
      toast.success(`V${b.villa} checks out ${prettyDate(selectedDate)}`);
      await fetchAll();
    } catch (err) {
      toast.error(`Check out failed: ${errMsg(err)}`);
    }
  };

  const patchRow = async (id: string, patch: Partial<Row>) => {
    const prev = rows;
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
    if (error) { setRows(prev); toast.error('Could not save change'); }
  };

  // ---------- Render ----------
  if (!authChecked) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" /></div>;
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert size={56} className="text-rose-500 mb-4 opacity-60" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
        <p className="text-slate-500">This module is restricted to the Admin team.</p>
      </div>
    );
  }

  const theme = THEME[tab];
  const isToday = selectedDate === todayYMD();
  const tabLabel = TABS.find(t => t.id === tab)!.label;
  const tabBookings = onDate.filter(b => tabOf(b.kind) === tab);
  const tabUpcoming = upcoming.filter(b => tabOf(b.kind) === tab).slice(0, 12);
  const nextServices = form.depKnown
    ? dateRange(form.date, form.endDate).filter(d => isPlannedService(plan, d, form.date)).slice(0, 5)
    : dateRange(form.date, addDays(form.date, 21)).filter(d => isPlannedService(plan, d, form.date)).slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 md:px-6 md:py-6 pb-32">
      <div className="max-w-6xl mx-auto flex flex-col gap-5">
        {/* HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Special Villas</h1>
            <p className="text-sm text-slate-500 mt-1">TMA, house use, show villas and fumigation. Saves straight to the Guest List.</p>
          </div>
          <div className="flex items-center gap-2">
            {!isToday && (
              <button onClick={() => goToDate(todayYMD())} className="text-xs font-bold text-[#6D2158] px-3 py-2 rounded-xl hover:bg-[#6D2158]/10">Today</button>
            )}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm">
              <button onClick={() => goToDate(addDays(selectedDate, -1))} className="p-2.5 text-slate-500 hover:text-slate-800" aria-label="Previous day"><ChevronLeft size={18} /></button>
              <label className="relative px-2 py-1.5 text-center cursor-pointer min-w-[128px]">
                <span className="block text-sm font-bold text-slate-800">{prettyDate(selectedDate)}</span>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{isToday ? 'Today' : selectedDate.slice(0, 4)}</span>
                <input type="date" value={selectedDate} onChange={e => goToDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
              <button onClick={() => goToDate(addDays(selectedDate, 1))} className="p-2.5 text-slate-500 hover:text-slate-800" aria-label="Next day"><ChevronRight size={18} /></button>
            </div>
          </div>
        </header>

        {/* TABS */}
        <nav className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {TABS.map(t => {
            const active = tab === t.id;
            const th = THEME[t.id];
            const n = countFor(t.id);
            return (
              <button key={t.id} onClick={() => switchTab(t.id)}
                className={`flex items-center gap-3 p-3 md:p-4 rounded-2xl border text-left transition-all ${active ? `${th.soft} ${th.border} ring-2 ${th.ring} shadow-sm` : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? th.solid : 'bg-slate-100 text-slate-500'}`}><t.icon size={18} /></span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${active ? th.text : 'text-slate-700'}`}>{t.label}</span>
                  <span className="block text-xs text-slate-500">{loading ? '…' : n === 0 ? 'None' : `${n} villa${n > 1 ? 's' : ''}`}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">
          {/* FORM */}
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 flex flex-col gap-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">
                {editing ? `Edit V${editing.villa}` : DAILY_TABS.includes(tab) ? `${tabLabel} · ${prettyDate(selectedDate)}` : `Add ${tabLabel}`}
              </h2>
              {editing && <button type="button" onClick={cancelEdit} className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"><X size={14} /> Cancel</button>}
            </div>

            {tab === 'TMA' && (
              <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
                {(['NIGHT', 'DAY'] as const).map(m => (
                  <button key={m} type="button" disabled={!!editing} onClick={() => setForm(f => ({ ...f, tmaMode: m }))}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition-all disabled:cursor-not-allowed ${form.tmaMode === m ? 'bg-white shadow-sm text-amber-800' : 'text-slate-500'}`}>
                    {m === 'NIGHT' ? <Moon size={15} /> : <Sun size={15} />} TMA {m === 'NIGHT' ? 'Night' : 'Day'}
                  </button>
                ))}
              </div>
            )}

            <Field label={tab === 'HOUSE_USE' ? 'Villa' : 'Villas'}
              hint={tab === 'TMA' && form.tmaMode === 'NIGHT' ? 'Usually 3, e.g. 42, 43, 44' : tab === 'FUMIGATION' ? 'A departing villa keeps its guest details — it just gets a FUMIGATION remark' : 'Separate with commas or spaces'}>
              <input type="text" inputMode="numeric" value={form.villas} disabled={!!editing}
                onChange={e => setForm(f => ({ ...f, villas: e.target.value }))}
                placeholder={tab === 'HOUSE_USE' ? 'e.g. 60' : 'e.g. 42, 43, 44'}
                className={`${inputCls} text-base disabled:bg-slate-100 disabled:text-slate-500`} />
              {(parsed.valid.length > 0 || parsed.invalid.length > 0) && !editing && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {parsed.valid.map(v => {
                    const cur = previewDate === selectedDate ? dayStatus.get(v) : undefined;
                    const busy = cur && !isFreeStatus(cur.status);
                    return (
                      <span key={v} title={cur?.guest_name || ''} className={`text-xs font-bold px-2 py-1 rounded-lg border ${busy ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                        V{v}{cur && <span className="font-medium opacity-75"> · {cur.status}</span>}
                      </span>
                    );
                  })}
                  {parsed.invalid.map(v => <span key={v} className="text-xs font-bold px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 line-through">{v}</span>)}
                </div>
              )}
            </Field>

            {/* TMA NIGHT */}
            {tab === 'TMA' && form.tmaMode === 'NIGHT' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Arrival date"><input type="date" value={form.date} onChange={e => e.target.value && setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} /></Field>
                  <Field label="Nights">
                    <Stepper value={form.nights} min={1} max={30} onChange={n => setForm(f => ({ ...f, nights: n }))} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Arr · ${prettyDate(form.date, false)}`}><input type="time" value={form.arrTime} onChange={e => setForm(f => ({ ...f, arrTime: e.target.value }))} className={inputCls} /></Field>
                  <Field label={`Dep · ${prettyDate(addDays(form.date, form.nights), false)}`}><input type="time" value={form.depTime} onChange={e => setForm(f => ({ ...f, depTime: e.target.value }))} className={inputCls} /></Field>
                </div>
                <Summary>Arrive {prettyDate(form.date)}, leave {prettyDate(addDays(form.date, form.nights))} · {form.nights} night{form.nights > 1 ? 's' : ''}</Summary>
              </>
            )}

            {/* TMA DAY */}
            {tab === 'TMA' && form.tmaMode === 'DAY' && (
              <>
                <Field label="Date"><input type="date" value={form.date} onChange={e => e.target.value && setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Arr time"><input type="time" value={form.arrTime} onChange={e => setForm(f => ({ ...f, arrTime: e.target.value }))} className={inputCls} /></Field>
                  <Field label="Dep time"><input type="time" value={form.depTime} onChange={e => setForm(f => ({ ...f, depTime: e.target.value }))} className={inputCls} /></Field>
                </div>
                <Summary>Arrives and leaves {prettyDate(form.date)}</Summary>
              </>
            )}

            {/* HOUSE USE */}
            {tab === 'HOUSE_USE' && (
              <>
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <Field label="Guest / staff name"><input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Kevin" className={inputCls} /></Field>
                  <Field label="PM account"><input type="text" value={form.pm} onChange={e => setForm(f => ({ ...f, pm: e.target.value }))} placeholder="PM-1029" className={inputCls} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Arrival"><input type="date" value={form.date} onChange={e => e.target.value && setForm(f => ({ ...f, date: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))} className={inputCls} /></Field>
                  <Field label="Arr time (optional)"><input type="time" value={form.arrTime} onChange={e => setForm(f => ({ ...f, arrTime: e.target.value }))} className={inputCls} /></Field>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600 mb-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={form.depKnown} onChange={e => setForm(f => ({ ...f, depKnown: e.target.checked }))} className="w-4 h-4 accent-[#6D2158]" />
                    Departure date known
                  </label>
                  {form.depKnown ? (
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" value={form.endDate} min={form.date} onChange={e => e.target.value && setForm(f => ({ ...f, endDate: e.target.value }))} className={inputCls} />
                      <input type="time" value={form.depTime} onChange={e => setForm(f => ({ ...f, depTime: e.target.value }))} className={inputCls} aria-label="Departure time" />
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2">Stays in the Guest List every day until you set a departure or press <b>Check out</b>.</p>
                  )}
                </div>

                <Field label="Service">
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                    {([['DAILY', 'Full'], ['ALT', 'Every 2nd day'], ['WEEKDAYS', 'Weekdays']] as const).map(([m, l]) => (
                      <button key={m} type="button" onClick={() => setForm(f => ({ ...f, svcMode: m }))}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${form.svcMode === m ? 'bg-white shadow-sm text-[#6D2158]' : 'text-slate-500'}`}>{l}</button>
                    ))}
                  </div>
                  {form.svcMode === 'WEEKDAYS' && (
                    <div className="grid grid-cols-7 gap-1 mt-2">
                      {[1, 2, 3, 4, 5, 6, 0].map(d => {
                        const on = form.svcDays.includes(d);
                        return (
                          <button key={d} type="button" aria-pressed={on}
                            onClick={() => setForm(f => ({ ...f, svcDays: on ? f.svcDays.filter(x => x !== d) : [...f.svcDays, d] }))}
                            className={`py-2 rounded-lg border text-xs font-bold transition-all ${on ? 'bg-[#6D2158] border-[#6D2158] text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            {WEEKDAYS[d]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {nextServices.length > 0 && (
                    <p className="text-[11px] text-slate-500 mt-1.5">Next service: {nextServices.map(d => prettyDate(d)).join(', ')}</p>
                  )}
                </Field>
              </>
            )}

            {/* SHOW VILLA */}
            {tab === 'SHOW_VILLA' && (
              <>
                <Field label="Time"><input type="time" value={form.arrTime} onChange={e => setForm(f => ({ ...f, arrTime: e.target.value }))} className={inputCls} /></Field>
                {lastShowDay && !editing && (
                  <button type="button" onClick={copyShowVillas} disabled={saving}
                    className="flex items-center gap-2 text-left text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5 hover:bg-sky-100 disabled:opacity-60">
                    <Copy size={14} className="shrink-0" />
                    <span>Copy from {prettyDate(lastShowDay.day)} · {lastShowDay.rows.map(r => `V${r.villa_number}${r.arrival_time ? ` ${r.arrival_time}` : ''}`).join(', ')}</span>
                  </button>
                )}
              </>
            )}

            <button type="submit" disabled={saving}
              className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 ${theme.solid}`}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : editing ? <Check size={16} /> : <Plus size={16} />}
              {editing ? 'Save changes' : 'Add to Guest List'}
            </button>
          </form>

          {/* LISTS */}
          <section className="flex flex-col gap-4 min-w-0">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold text-slate-800">On {prettyDate(selectedDate)}</h2>
              {loading && <Loader2 size={16} className="animate-spin text-slate-400" />}
            </div>

            {!loading && tabBookings.length === 0 && (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl py-10 text-center text-sm text-slate-500">
                No {tabLabel.toLowerCase()} villas on this day.
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {tabBookings.map(b => (
                <BookingCard key={b.key} b={b} date={selectedDate} editing={editing?.key === b.key}
                  onEdit={() => startEdit(b)} onRemove={() => removeBooking(b)} onCheckOut={() => checkOut(b)} onPatch={patchRow} />
              ))}
            </div>

            {tabUpcoming.length > 0 && (
              <div className="mt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><CalendarDays size={13} /> Coming up</h3>
                <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                  {tabUpcoming.map(b => (
                    <div key={b.key} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="font-bold text-slate-800 w-12">V{b.villa}</span>
                      <span className="flex-1 min-w-0 text-sm text-slate-600 truncate">
                        {kindLabel(b.kind)}{b.kind === 'HOUSE_USE' && b.name ? ` · ${b.name}` : ''}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                        {prettyDate(b.start)}{b.open ? ' →' : b.end !== b.start ? ` → ${prettyDate(b.end, false)}` : ''}
                      </span>
                      <button onClick={() => startEdit(b)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label="Edit"><Pencil size={14} /></button>
                      <button onClick={() => removeBooking(b)} className="p-1.5 text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {confirmState && (
        <div className="modal-overlay" onClick={() => closeConfirm(false)}>
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${confirmState.danger ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'}`}><AlertTriangle size={18} /></span>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900">{confirmState.title}</h3>
                <p className="text-sm text-slate-600 mt-1">{confirmState.body}</p>
              </div>
            </div>
            {confirmState.lines && (
              <ul className="mt-3 bg-slate-50 rounded-xl p-3 text-xs font-semibold text-slate-700 space-y-1 max-h-48 overflow-y-auto">
                {confirmState.lines.map(l => <li key={l}>{l}</li>)}
              </ul>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => closeConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200">Cancel</button>
              <button onClick={() => closeConfirm(true)} className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-white ${confirmState.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#6D2158] hover:bg-[#5a1b49]'}`}>{confirmState.confirmText}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Small components ----------
const inputCls = 'w-full h-[42px] bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#6D2158] focus:bg-white transition-colors';

const kindLabel = (k: SpecialKind) =>
  ({ TMA_NIGHT: 'TMA Night', TMA_DAY: 'TMA Day', HOUSE_USE: 'House Use', SHOW_VILLA: 'Show Villa', FUMIGATION: 'Fumigation' })[k];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function Summary({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{children}</p>;
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 h-[42px]">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="px-3 h-full text-slate-500 hover:text-slate-800" aria-label="Fewer"><Minus size={14} /></button>
      <span className="flex-1 text-center font-bold text-slate-800">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="px-3 h-full text-slate-500 hover:text-slate-800" aria-label="More"><Plus size={14} /></button>
    </div>
  );
}

// Saves when the field loses focus. Parent remounts it (via key) when the stored value changes.
function TimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <input type="time" value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== value) onCommit(v); }}
        className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-2 text-sm font-bold text-slate-800 outline-none focus:border-[#6D2158] focus:bg-white w-full" />
    </label>
  );
}

function BookingCard({ b, date, editing, onEdit, onRemove, onCheckOut, onPatch }: {
  b: Booking; date: string; editing: boolean;
  onEdit: () => void; onRemove: () => void; onCheckOut: () => void; onPatch: (id: string, patch: Partial<Row>) => void;
}) {
  const t = THEME[tabOf(b.kind)];
  const first = b.rows[0];
  const last = b.rows[b.rows.length - 1];
  const multiDay = b.start !== b.end;
  const nights = daysBetween(b.start, b.end);
  const isFumig = b.kind === 'FUMIGATION';
  const fumigOnGuest = isFumig && getSpecialKind(first.status) !== 'FUMIGATION';
  const { pm, plan } = b.kind === 'HOUSE_USE' ? parseHouseUseNotes(first.preferences) : { pm: '', plan: null };
  const serviceToday = plan ? isPlannedService(plan, date, b.start) : false;

  let phase = '';
  if (b.kind === 'TMA_NIGHT' || b.kind === 'HOUSE_USE') {
    phase = date === b.start ? 'Arriving' : !b.open && date === b.end ? 'Departing' : 'In-house';
  }
  const Icon = b.kind === 'TMA_NIGHT' ? Moon : b.kind === 'TMA_DAY' ? Sun : TABS.find(x => x.id === tabOf(b.kind))!.icon;

  let dates = prettyDate(b.start);
  if (b.kind === 'HOUSE_USE' && b.open) dates = `Since ${prettyDate(b.start)} · departure not set`;
  else if (multiDay) dates = `${prettyDate(b.start)} → ${prettyDate(b.end)} · ${nights} night${nights > 1 ? 's' : ''}`;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${editing ? `ring-2 ${t.ring} ${t.border}` : 'border-slate-200'}`}>
      <div className="flex items-start gap-3 p-4">
        <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 ${t.soft} ${t.text}`}>
          <span className="text-[10px] font-bold opacity-70 leading-none">V</span>
          <span className="text-xl font-bold leading-tight">{b.villa}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${t.soft} ${t.text}`}><Icon size={12} />{kindLabel(b.kind)}</span>
            {phase && <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{phase}</span>}
          </div>
          {b.kind === 'HOUSE_USE' && (
            <p className="font-bold text-slate-800 mt-1 truncate">
              {b.name || 'House Use'}
              {pm && <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Briefcase size={11} />{pm}</span>}
            </p>
          )}
          {fumigOnGuest ? (
            <p className="text-xs text-slate-500 mt-1 truncate">After {first.status}{first.guest_name ? ` · ${first.guest_name}` : ''}</p>
          ) : !isFumig && b.kind !== 'SHOW_VILLA' && (
            <p className="text-xs text-slate-500 mt-1">{dates}</p>
          )}
        </div>
        <div className="flex gap-0.5 -mr-1 -mt-1">
          {!isFumig && <button onClick={onEdit} className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100" aria-label="Edit"><Pencil size={15} /></button>}
          <button onClick={onRemove} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label="Remove"><Trash2 size={15} /></button>
        </div>
      </div>

      {!isFumig && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* Arrival time lives on the first day's row, departure on the last day's row */}
          {b.kind === 'SHOW_VILLA' ? (
            <div className="w-40">
              <TimeField key={`${first.id}-${first.arrival_time}`} label="Time" value={first.arrival_time || ''} onCommit={v => onPatch(first.id, { arrival_time: v })} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <TimeField key={`${first.id}-${first.arrival_time}`} label={multiDay ? `Arr · ${prettyDate(b.start, false)}` : 'Arr'} value={first.arrival_time || ''} onCommit={v => onPatch(first.id, { arrival_time: v })} />
              {b.open ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dep</span>
                  <span className="h-9 flex items-center text-sm font-semibold text-slate-400">Not set</span>
                </div>
              ) : (
                <TimeField key={`${last.id}-${last.departure_time}`} label={multiDay ? `Dep · ${prettyDate(b.end, false)}` : 'Dep'} value={last.departure_time || ''} onCommit={v => onPatch(last.id, { departure_time: v })} />
              )}
            </div>
          )}

          {b.kind === 'HOUSE_USE' && (
            <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-50 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-600"><b>Service:</b> {plan ? planLabel(plan) : '—'}</span>
              <span className={`text-xs font-bold ${serviceToday ? 'text-emerald-700' : 'text-slate-400'}`}>
                {serviceToday ? '✓ Service today' : 'No service today'}
              </span>
            </div>
          )}

          {b.kind === 'HOUSE_USE' && (b.open || date < b.end) && (
            <button onClick={onCheckOut} className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#6D2158] border border-fuchsia-200 rounded-xl py-2 hover:bg-fuchsia-50">
              <LogOut size={14} /> Check out on {prettyDate(date)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

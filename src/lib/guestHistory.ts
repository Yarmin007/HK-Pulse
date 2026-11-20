// Guest History: turns the day-by-day guest list (hsk_daily_summary) back into STAYS — one stay = one guest
// party from arrival to departure, like a PMS folio (stay_id, or villa + arrival date for older rows).
// A stay keeps its villa moves, notes, requests / minibar and who looked after the villa each day.
// Past stays of the same guest are matched by name (isSameGuest), so repeaters show their earlier visits.
import { supabase } from '@/lib/supabase';
import { parseStayRange, stayIdOf, isSameGuest } from '@/lib/guestImport';

export type DayRow = {
  id: string; report_date: string; villa_number: string; guest_name: string; status: string;
  pax_adults: number | null; pax_kids: number | null; meal_plan: string | null; gem_name: string | null;
  stay_dates: string | null; stay_id: string | null; preferences: string | null; remarks: string | null;
  arrival_time: string | null; departure_time: string | null;
};
export type Stay = {
  key: string; name: string; names: string[]; villas: string[]; arr: string; dep: string; nights: number;
  adults: number; kids: number; mealPlan: string; gem: string; arrTime: string; depTime: string;
  notes: { text: string; first: string }[]; days: DayRow[]; firstSeen: string; lastSeen: string;
};

const COLS = 'id, report_date, villa_number, guest_name, status, pax_adults, pax_kids, meal_plan, gem_name, stay_dates, stay_id, preferences, remarks, arrival_time, departure_time';
// Not guests: staff use, crew, show / standby villas, fumigation, MOD checks
const NOT_GUEST = /HOUSE\s*USE|TMA|SHOW|FUMIG|STANDBY|MOD\s*CHECK|OOO|OOS/i;
export const isGuestRow = (r: Pick<DayRow, 'status' | 'guest_name'>) => !!String(r.guest_name || '').trim() && !NOT_GUEST.test(`${r.status} ${r.guest_name}`);

// Supabase returns max 1000 rows per call
export const fetchRows = async (build: (q: any) => any, cap = 5000): Promise<DayRow[]> => {
  const out: DayRow[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build(supabase.from('hsk_daily_summary').select(COLS)).order('report_date', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...((data || []) as DayRow[]));
    if (!data || data.length < 1000) break;
  }
  return out.filter(isGuestRow);
};

const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000));
// Older rows store "16_261111", newer "STAY_16_261111": both mean villa 16, arrived 11 Nov 26
const canonKey = (id: string) => { const m = String(id || '').trim().match(/^(?:STAY_)?(.+)_(\d{6})$/); return m ? `STAY_${m[1]}_${m[2]}` : String(id || '').trim(); };
const keyForms = (key: string) => [...new Set([key, key.replace(/^STAY_/, '')])];
const stayKeyOf = (r: DayRow) => {
  if (r.stay_id) return canonKey(r.stay_id);
  const { arr } = parseStayRange(r.stay_dates || '', r.report_date);
  return stayIdOf(r.villa_number, arr) || `ROW_${r.villa_number}_${r.guest_name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 20)}`;
};
const mostCommon = (xs: string[]) => { const m = new Map<string, number>(); xs.filter(Boolean).forEach(x => m.set(x, (m.get(x) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };
const last = (xs: (string | null | undefined)[]) => [...xs].reverse().find(x => x && String(x).trim()) || '';

// Notes worth keeping: preferences + remarks, split into lines, de-duplicated (first date seen)
const noteLines = (r: DayRow) => [r.preferences, r.remarks].flatMap(t => String(t || '').split(/\n|•|;(?=\s*[A-Z])/)).map(s => s.trim()).filter(s => s.length > 2 && !/^\[?DEP_INFO|^CHECKOUT \d/.test(s));

export const buildStays = (rows: DayRow[]): Stay[] => {
  const groups = new Map<string, DayRow[]>();
  rows.forEach(r => { const k = stayKeyOf(r); (groups.get(k) || groups.set(k, []).get(k)!).push(r); });
  const stays: Stay[] = [];
  groups.forEach((days, key) => {
    days.sort((a, b) => a.report_date.localeCompare(b.report_date));
    const firstSeen = days[0].report_date, lastSeen = days[days.length - 1].report_date;
    const ranges = days.map(d => parseStayRange(d.stay_dates || '', d.report_date));
    const arr = last(ranges.map(r => r.arr)) || firstSeen;
    const dep = last(ranges.map(r => r.dep)) || lastSeen;
    const villas: string[] = []; days.forEach(d => { if (!villas.includes(d.villa_number)) villas.push(d.villa_number); });
    const notes: Stay['notes'] = [];
    days.forEach(d => noteLines(d).forEach(t => { if (!notes.some(n => n.text.toLowerCase() === t.toLowerCase())) notes.push({ text: t, first: d.report_date }); }));
    const names = [...new Set(days.map(d => d.guest_name.trim()))];
    stays.push({
      key, names, name: last(days.map(d => d.guest_name)) || mostCommon(names), villas, arr, dep, nights: daysBetween(arr, dep),
      adults: Math.max(0, ...days.map(d => d.pax_adults || 0)), kids: Math.max(0, ...days.map(d => d.pax_kids || 0)),
      mealPlan: last(days.map(d => d.meal_plan)), gem: last(days.map(d => d.gem_name)),
      arrTime: last(days.map(d => d.arrival_time)), depTime: last(days.map(d => d.departure_time)),
      notes, days, firstSeen, lastSeen,
    });
  });
  // Room moves from before stay ids were carried over: same guest, same arrival, another villa → one stay
  const merged: Stay[] = [];
  stays.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen)).forEach(st => {
    const into = merged.find(m => m.arr === st.arr && isSameGuest(m.name, st.name) && !m.villas.some(v => st.villas.includes(v)));
    if (!into) { merged.push(st); return; }
    const days = [...into.days, ...st.days].sort((a, b) => a.report_date.localeCompare(b.report_date));
    const villas: string[] = []; days.forEach(d => { if (!villas.includes(d.villa_number)) villas.push(d.villa_number); });
    const dep = [into.dep, st.dep].sort().pop() || into.dep;
    Object.assign(into, {
      days, villas, dep, nights: daysBetween(into.arr, dep), lastSeen: days[days.length - 1].report_date,
      names: [...new Set([...into.names, ...st.names])], adults: Math.max(into.adults, st.adults), kids: Math.max(into.kids, st.kids),
      notes: [...into.notes, ...st.notes.filter(n => !into.notes.some(x => x.text.toLowerCase() === n.text.toLowerCase()))],
      name: st.lastSeen > into.lastSeen ? st.name : into.name, gem: st.gem || into.gem, mealPlan: st.mealPlan || into.mealPlan,
    });
  });
  return merged.sort((a, b) => b.arr.localeCompare(a.arr));
};

// Search: a name ("Latif"), a villa ("V50" / "50"), or blank = in house today + recent departures
export const searchStays = async (query: string, today: string): Promise<Stay[]> => {
  const q = query.trim();
  const villa = q.match(/^v?\s*(\d{1,2}(?:-[12])?)$/i)?.[1];
  const since = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  let rows: DayRow[];
  if (!q) rows = await fetchRows(b => b.gte('report_date', since(14)).lte('report_date', today));
  else if (villa) rows = await fetchRows(b => b.eq('villa_number', villa).gte('report_date', since(365)));
  else {
    const safe = q.replace(/[%,()*]/g, ' ').trim();
    rows = await fetchRows(b => b.ilike('guest_name', `%${safe}%`));
  }
  return buildStays(rows);
};

// Every row of one stay: its key, plus same-guest rows in its villas between arrival and departure
export const loadStay = async (key: string, hint?: { villas: string[]; arr: string; dep: string; name: string }): Promise<Stay | null> => {
  let rows: DayRow[] = [];
  if (key.startsWith('STAY_')) rows = await fetchRows(b => b.in('stay_id', keyForms(key)));
  if (hint?.villas.length) {
    const more = await fetchRows(b => b.in('villa_number', hint.villas).gte('report_date', hint.arr).lte('report_date', hint.dep || hint.arr));
    const seen = new Set(rows.map(r => r.id));
    more.forEach(r => { if (!seen.has(r.id) && (stayKeyOf(r) === key || isSameGuest(r.guest_name, hint.name))) rows.push(r); });
  }
  if (!rows.length && !key.startsWith('STAY_')) {
    const m = key.match(/^STAY_(.+)_(\d{2})(\d{2})(\d{2})$/);
    if (m) rows = (await fetchRows(b => b.eq('villa_number', m[1]))).filter(r => stayKeyOf(r) === key);
  }
  if (!rows.length) return null;
  // Rows of this stay only (same key, or the same guest in its villas)
  const keyed = rows.filter(r => stayKeyOf(r) === key);
  const base = keyed.length ? keyed : rows;
  const name = last(base.map(r => r.guest_name));
  const all = rows.filter(r => base.includes(r) || isSameGuest(r.guest_name, name));
  const stays = buildStays(all.map(r => ({ ...r, stay_id: key })));
  return stays[0] || null;
};

// Other stays of the same guest (repeaters), matched by name
export const pastStays = async (stay: Stay): Promise<Stay[]> => {
  const words = stay.name.replace(/\(.*?\)/g, ' ').split(/[^A-Za-zÀ-ÿ]+/).filter(w => w.length >= 3 && !/^(mr|ms|mrs|miss|mstr|master|dr|prof)$/i.test(w));
  const surname = [...words].sort((a, b) => b.length - a.length)[0];
  if (!surname) return [];
  const rows = await fetchRows(b => b.ilike('guest_name', `%${surname}%`));
  return buildStays(rows).filter(s => s.key !== stay.key && !s.villas.every(v => stay.villas.includes(v) && s.arr === stay.arr) && isSameGuest(s.name, stay.name));
};

export type StayRequest = { id: string; villa_number: string; request_type: string; item_details: string; request_time: string; package_tag: string | null; is_private: boolean | null; is_done: boolean | null; delivery_status: string | null; logged_by: string | null; attendant_name: string | null };
export const stayRequests = async (stay: Stay, canSeePrivate: boolean): Promise<StayRequest[]> => {
  const { data } = await supabase.from('hsk_daily_requests')
    .select('id, villa_number, request_type, item_details, request_time, package_tag, is_private, is_done, delivery_status, logged_by, attendant_name')
    .in('villa_number', stay.villas).gte('request_time', `${stay.arr}T00:00:00`).lte('request_time', `${stay.dep || stay.lastSeen}T23:59:59`)
    .order('request_time');
  // Only requests made while the guest was in that villa (a room move splits the dates)
  const villaOn = new Map(stay.days.map(d => [d.report_date, d.villa_number]));
  return ((data || []) as StayRequest[]).filter(r => (canSeePrivate || !r.is_private) && (() => { const v = villaOn.get(r.request_time.slice(0, 10)); return !v || v === r.villa_number; })());
};

// Who had the villa each day of the stay (Villa Attendant board)
export const stayAttendants = async (stay: Stay, parse: (s: string) => number[]): Promise<Record<string, string>> => {
  const [{ data: alloc }, { data: hosts }] = await Promise.all([
    supabase.from('hsk_allocations').select('report_date, host_id, task_details').eq('area', 'villa').gte('report_date', stay.arr).lte('report_date', stay.dep || stay.lastSeen),
    supabase.from('hsk_hosts').select('id, full_name, nicknames'),
  ]);
  const name = new Map((hosts || []).map((h: any) => [h.id, h.nicknames ? String(h.nicknames).split(',')[0].trim() : h.full_name]));
  const out: Record<string, string> = {};
  stay.days.forEach(d => {
    const n = parseInt(d.villa_number, 10);
    const who = (alloc || []).filter((a: any) => a.report_date === d.report_date && parse(String(a.task_details || '')).includes(n)).map((a: any) => name.get(a.host_id) || '');
    if (who.length) out[d.report_date] = [...new Set(who.filter(Boolean))].join(' & ');
  });
  return out;
};

// Occasions / flags found in the notes
export const occasionsOf = (stay: Stay) => {
  const t = stay.notes.map(n => n.text).join(' ').toLowerCase();
  const tags: string[] = [];
  if (/repeat|returning|loyal/.test(t)) tags.push('Repeater');
  if (/honeymoon/.test(t)) tags.push('Honeymoon');
  if (/anniversar/.test(t)) tags.push('Anniversary');
  if (/birthday|bday/.test(t)) tags.push('Birthday');
  if (/vip|vvip/.test(t)) tags.push('VIP');
  if (/allerg|gluten|lactose|vegan|vegetarian|nut free|halal/.test(t)) tags.push('Dietary');
  return tags;
};

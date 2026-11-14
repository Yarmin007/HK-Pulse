import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Working days & RO (replacement off)
//
// • A leave day (O / OFF / AL / VAC / PH) whose comment says "working day" means the host
//   actually WORKED that day. It counts as a working day everywhere and earns 1 RO.
// • RO is a leave: the day the host takes back a day they worked.
// • RO balance = RO earned − RO taken. A negative balance means RO days were given without the
//   matching "working day" comment being recorded — it is flagged, never taken from OFF.
// ---------------------------------------------------------------------------

export const RO_EARNING_CODES = ['O', 'OFF', 'AL', 'VAC', 'PH'];

type AttRow = { host_id: string; date: string; status_code?: string | null; shift_note?: string | null };

export const hasWorkingNote = (note?: string | null) => /working\s*day/i.test(String(note || ''));

/** Leave code on paper, but the host worked (comment says "working day"). */
export const isWorkedLeave = (r: { status_code?: string | null; shift_note?: string | null }) =>
  RO_EARNING_CODES.includes(String(r.status_code || '').trim().toUpperCase()) && hasWorkingNote(r.shift_note);

export const isRO = (r: { status_code?: string | null }) => String(r.status_code || '').trim().toUpperCase() === 'RO';

export type ROLedger = { earned: number; taken: number; balance: number; earnedDates: string[]; takenDates: string[] };

/** RO position of one host up to and including `uptoDate` (YYYY-MM-DD). */
export const computeRO = (rows: AttRow[], hostId: string, uptoDate: string): ROLedger => {
  const earnedDates: string[] = [];
  const takenDates: string[] = [];
  const id = String(hostId).trim();
  for (const r of rows) {
    if (String(r.host_id).trim() !== id) continue;
    const d = String(r.date || '').slice(0, 10);
    if (!d || d > uptoDate) continue;
    if (isRO(r)) takenDates.push(d);
    else if (isWorkedLeave(r)) earnedDates.push(d);
  }
  earnedDates.sort();
  takenDates.sort();
  const earned = earnedDates.length;
  const taken = takenDates.length;
  return { earned, taken, balance: earned - taken, earnedDates, takenDates };
};

/** Every RO / "working day" row (small — a few hundred rows), all years. */
export const fetchROEvents = async (hostId?: string): Promise<AttRow[]> => {
  const out: AttRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('hsk_attendance')
      .select('host_id, date, status_code, shift_note')
      .or('status_code.eq.RO,shift_note.ilike.*working*day*')
      .range(from, from + 999);
    if (hostId) q = q.eq('host_id', hostId);
    const { data, error } = await q;
    if (error || !data) break;
    out.push(...data.map(r => ({ ...r, date: String(r.date).slice(0, 10) })));
    if (data.length < 1000) break;
  }
  return out;
};

/**
 * Loads all attendance rows in a date range. Supabase returns at most 1,000 rows per request,
 * so this asks for the row count first and then fetches every page AT THE SAME TIME
 * (one after another took ~7 s for a full year).
 */
export const fetchAttendanceRange = async (
  start: string,
  end: string,
  columns = 'id, host_id, date, status_code, shift_type, shift_note'
): Promise<any[]> => {
  const { count, error } = await supabase.from('hsk_attendance')
    .select('id', { count: 'exact', head: true })
    .gte('date', start).lte('date', end);
  if (error) { console.error('Attendance count failed', error); return []; }
  const total = count || 0;
  const PAGE = 1000;
  const pages = Math.ceil(total / PAGE);
  const results = await Promise.all(Array.from({ length: pages }, (_, i) =>
    supabase.from('hsk_attendance').select(columns)
      .gte('date', start).lte('date', end)
      .order('id', { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1)
  ));
  const rows: any[] = [];
  for (const r of results) {
    if (r.error) console.error('Attendance page failed', r.error);
    if (r.data) rows.push(...r.data);
  }
  return rows.map(a => ({ ...a, date: a.date ? String(a.date).split('T')[0] : '' }));
};

// ---------------------------------------------------------------------------
// Linking an RO to the day it pays back. Both comments carry the other date:
//   worked day → "WORKING DAY · RO TAKEN ON 19 NOV 2026"
//   RO day     → "RO FOR DAY WORKED 14 NOV 2026"
// ---------------------------------------------------------------------------

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 2026-11-19 → "19 NOV 2026" */
export const fmtNoteDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const parseNoteDate = (s: string): string | null => {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[2].toUpperCase());
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};

const RO_TAKEN_RE = /\s*[-–·|,]?\s*RO\s+TAKEN\s+ON\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/gi;
const PENDING_RE = /\s*[-–·|,]?\s*PENDING(\s+LEAVE)?/gi;

/** Date of the RO that paid back this worked day, from its comment. */
export const roTakenOn = (note?: string | null) => {
  const m = String(note || '').match(/RO\s+TAKEN\s+ON\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  return m ? parseNoteDate(m[1]) : null;
};

/** Worked day this RO pays back, from its comment. */
export const roForDay = (note?: string | null) => {
  const m = String(note || '').match(/RO\s+FOR\s+DAY\s+WORKED\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  return m ? parseNoteDate(m[1]) : null;
};

export const roNoteFor = (workedIso: string) => `RO FOR DAY WORKED ${fmtNoteDate(workedIso)}`;

const workedBase = (note?: string | null) => {
  const base = String(note || '').replace(RO_TAKEN_RE, '').replace(PENDING_RE, '').trim();
  return hasWorkingNote(base) ? base : (base ? `WORKING DAY · ${base}` : 'WORKING DAY');
};

/** Comment for the worked day once its RO is taken. */
export const workedNoteWithRO = (note: string | null | undefined, roIso: string) =>
  `${workedBase(note)} · RO TAKEN ON ${fmtNoteDate(roIso)}`;

/** Comment for the worked day when its RO is removed again. */
export const workedNoteWithoutRO = (note?: string | null) => workedBase(note);

/**
 * Worked days of a host that still have no RO (oldest first). A link only counts while the RO row
 * it names still exists, so deleting an RO puts the worked day back on the list. Older RO days that
 * were entered without a link pay off the oldest worked days first. `editingRoDate` is the RO being
 * edited, so it doesn't count against the list it is choosing from.
 */
export const pendingWorkedDays = (rows: AttRow[], hostId: string, editingRoDate?: string) => {
  const id = String(hostId).trim();
  const mine = rows.filter(r => String(r.host_id).trim() === id);
  const roRows = mine.filter(isRO).filter(r => String(r.date).slice(0, 10) !== editingRoDate);
  const roDates = new Set(roRows.map(r => String(r.date).slice(0, 10)));
  const worked = mine.filter(r => isWorkedLeave(r));
  const workedDates = new Set(worked.map(r => String(r.date).slice(0, 10)));
  const unlinkedRO = roRows.filter(r => { const f = roForDay(r.shift_note); return !f || !workedDates.has(f); }).length;
  return worked
    .filter(r => { const t = roTakenOn(r.shift_note); return !t || !roDates.has(t); })
    .map(r => ({ date: String(r.date).slice(0, 10), status: String(r.status_code || ''), note: String(r.shift_note || '') }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(unlinkedRO);
};

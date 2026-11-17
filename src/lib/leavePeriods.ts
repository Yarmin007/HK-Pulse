// Leave periods for one day, worked out from the main attendance sheet.
// A person who is away on `date` is followed back and forward over consecutive away days to get From → To.
// Rules:
//   • O / OFF / PH / RO are days off — but an O (or AL/PH) with a "working day" / "to be utilized" comment is a
//     worked day: it doesn't count and it breaks the run.
//   • A run that contains any AL/VAC is Annual Leave for its whole length (e.g. O AL AL = AL from the O).
//   • Otherwise a run with SL/EL is Sick / Emergency leave; otherwise it is a Day off.
//   • A missing day (nothing entered) or any other code ends the run.
import { supabase } from '@/lib/supabase';
import { isWorkedLeave } from '@/lib/attendanceData';

export const OFF_CODES = ['O', 'OFF', 'PH', 'RO'];
export const AL_CODES = ['AL', 'VAC'];
export const SICK_CODES = ['SL', 'EL'];
const AWAY = [...OFF_CODES, ...AL_CODES, ...SICK_CODES];

export type LeaveCategory = 'AL' | 'SICK' | 'OFF';
export type LeavePeriod = { host_id: string; category: LeaveCategory; from: string; to: string; days: number; codes: string[] };
type Row = { host_id: string; date: string; status_code?: string | null; shift_note?: string | null };

const WINDOW_DAYS = 120; // long AL / sick blocks (2–3 months) still get their real From → To

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const isAway = (r?: Row) => !!r && AWAY.includes(String(r.status_code || '').trim().toUpperCase()) && !isWorkedLeave(r);

/** Pure: periods covering `date`, from rows of any hosts (rows outside the window are ignored). */
export const buildLeavePeriods = (rows: Row[], date: string): LeavePeriod[] => {
  const byHost = new Map<string, Map<string, Row>>();
  rows.forEach(r => {
    const h = String(r.host_id).trim();
    const d = String(r.date).slice(0, 10);
    if (!byHost.has(h)) byHost.set(h, new Map());
    byHost.get(h)!.set(d, r);
  });

  const out: LeavePeriod[] = [];
  byHost.forEach((days, host) => {
    if (!isAway(days.get(date))) return;
    let from = date, to = date;
    for (let i = 1; i <= WINDOW_DAYS && isAway(days.get(addDays(date, -i))); i++) from = addDays(date, -i);
    for (let i = 1; i <= WINDOW_DAYS && isAway(days.get(addDays(date, i))); i++) to = addDays(date, i);

    const codes: string[] = [];
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) { codes.push(String(days.get(d)!.status_code).trim().toUpperCase()); n++; }
    const category: LeaveCategory = codes.some(c => AL_CODES.includes(c)) ? 'AL' : codes.some(c => SICK_CODES.includes(c)) ? 'SICK' : 'OFF';
    out.push({ host_id: host, category, from, to, days: n, codes });
  });
  return out;
};

/** Loads the attendance window around `date` and returns everyone away that day with their From → To. */
export const loadLeavePeriods = async (date: string): Promise<LeavePeriod[]> => {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('hsk_attendance')
      .select('host_id, date, status_code, shift_note')
      .gte('date', addDays(date, -WINDOW_DAYS))
      .lte('date', addDays(date, WINDOW_DAYS))
      .in('status_code', AWAY) // only away days matter: anything else (or nothing) ends a run
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data.map(r => ({ ...r, date: String(r.date).slice(0, 10) })));
    if (data.length < 1000) break;
  }
  return buildLeavePeriods(rows, date);
};

// Sinner / Saint villas for a day. A guest stays on the list until they depart, following them
// when they move villa. New villas added on a day are kept on top of the ones carried over.
import { supabase } from '@/lib/supabase';
import { projectGuestDay } from '@/lib/guestDay';
import { followGuest } from '@/lib/followGuest';

export type GuestVillaEntry = { villa: string; dep_date: string };
export type SinnerSaintLists = { sinners: GuestVillaEntry[]; saints: GuestVillaEntry[] };

const LOOKBACK_DAYS = 30;

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "45 41 10" + one date (the column holds a single date) or a JSON list → entries. */
export const parseGuestPairs = (villasStr?: string | null, depsStr?: string | null): GuestVillaEntry[] => {
  if (!villasStr) return [];
  try {
    if (depsStr && depsStr.startsWith('[')) return JSON.parse(depsStr);
  } catch { /* fall through */ }
  const dList = (depsStr || '').split(' ').filter(Boolean);
  return villasStr.split(/[\s,]+/).filter(Boolean).map((v, i) => ({ villa: v, dep_date: dList[i] || '' }));
};

/** The single dep-date column keeps the latest departure, so a list is never dropped early. */
export const latestDep = (list: GuestVillaEntry[]) =>
  list.map(s => (s.dep_date || '').trim()).filter(Boolean).sort().pop() || null;

type Rows = { today: any[]; prev: any[] };

const resolve = (
  saved: GuestVillaEntry[],
  carried: GuestVillaEntry[],
  date: string,
  rows: Rows,
  sourceRows: any[],
): GuestVillaEntry[] => {
  const out: GuestVillaEntry[] = [];
  const seen = new Set<string>();
  const push = (e: GuestVillaEntry) => {
    const key = e.villa.trim();
    if (!key || seen.has(key)) return;
    if (e.dep_date && e.dep_date < date) return; // already departed
    seen.add(key);
    out.push(e);
  };

  // Carried from an earlier day: only while that guest is still in house
  for (const e of carried) {
    const g = followGuest(e.villa, date, rows.today, sourceRows);
    if (g) push({ villa: g.villa, dep_date: g.dep_date || e.dep_date });
  }
  // Saved for this day (new adds, or the full list saved from the board)
  for (const e of saved) {
    const g = followGuest(e.villa, date, rows.today, rows.prev);
    push(g ? { villa: g.villa, dep_date: g.dep_date || e.dep_date } : e);
  }
  return out;
};

/**
 * Sinner & Saint villas for `date`:
 * - a list saved for the day itself is used as it is (removals made on the board stick);
 * - otherwise the latest earlier list is carried over while those guests are still in house;
 * - villas follow guest moves and dep dates come from the guest list.
 * Pass the guest-list rows if you already have them.
 */
export const loadSinnerSaint = async (date: string, guestRows?: Rows): Promise<SinnerSaintLists> => {
  const yesterday = shift(date, -1);
  const rows: Rows = guestRows ?? await Promise.all([projectGuestDay(date), projectGuestDay(yesterday)])
    .then(([t, p]) => ({ today: t.rows, prev: p.rows }));

  const { data: todayRows } = await supabase
    .from('hsk_daily_summary')
    .select('sinner_villa, sinner_dep, saint_villa, saint_dep')
    .eq('report_date', date)
    .or('villa_number.is.null,villa_number.eq.0')
    .limit(1);
  const today = todayRows?.[0];

  const one = async (villaCol: 'sinner_villa' | 'saint_villa', depCol: 'sinner_dep' | 'saint_dep') => {
    const saved = parseGuestPairs(today?.[villaCol], today?.[depCol]);
    if (saved.length > 0) return resolve(saved, [], date, rows, rows.prev);

    // Nothing saved for this day: carry the latest earlier list
    const { data: src } = await supabase
      .from('hsk_daily_summary')
      .select(`report_date, ${villaCol}, ${depCol}`)
      .lt('report_date', date)
      .gte('report_date', shift(date, -LOOKBACK_DAYS))
      .or('villa_number.is.null,villa_number.eq.0')
      .not(villaCol, 'is', null)
      .neq(villaCol, '')
      .order('report_date', { ascending: false })
      .limit(1);
    const source = src?.[0] as any;
    if (!source) return [];
    const carried = parseGuestPairs(source[villaCol], source[depCol]);
    const sourceRows = source.report_date === yesterday ? rows.prev : (await projectGuestDay(source.report_date)).rows;
    return resolve([], carried, date, rows, sourceRows);
  };

  const [sinners, saints] = await Promise.all([one('sinner_villa', 'sinner_dep'), one('saint_villa', 'saint_dep')]);
  return { sinners, saints };
};

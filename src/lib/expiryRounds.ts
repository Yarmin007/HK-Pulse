// Expiry & refill removals run in ROUNDS, not months: there can be two (or more) removals in one month.
// A round is keyed by its start date ("2026-11-19") and stored in the existing `month_period` column of
// hsk_expiry_targets / hsk_expiry_allocations / hsk_expiry_removals. Older data is keyed by month
// ("2026-11") and still opens as a "monthly" round.
// The round staff see on My Tasks is the live round: hsk_constants type 'expiry_active_round'.
import { supabase } from '@/lib/supabase';

export const ACTIVE_ROUND_TYPE = 'expiry_active_round';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const isDateRound = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);

export const roundLabel = (k: string) => {
  if (!k) return '';
  const [y, m, d] = k.split('-');
  if (isDateRound(k)) return `${+d} ${MONTHS[+m - 1]} ${y}`;
  if (y && m) return `${MONTHS[+m - 1]} ${y} (monthly)`;
  return k;
};

export const loadActiveRound = async (): Promise<string> => {
  const { data } = await supabase.from('hsk_constants').select('label').eq('type', ACTIVE_ROUND_TYPE).limit(1).maybeSingle();
  return String(data?.label || '').trim();
};

export const saveActiveRound = async (round: string) => {
  // delete + insert (hsk_constants update trips an updated_at trigger)
  await supabase.from('hsk_constants').delete().eq('type', ACTIVE_ROUND_TYPE);
  const { error } = await supabase.from('hsk_constants').insert([{ type: ACTIVE_ROUND_TYPE, label: round }]);
  if (error) throw error;
};

// Every round that has targets, allocations or logs, newest first
export const listRounds = async (): Promise<string[]> => {
  const [t, a, r] = await Promise.all([
    supabase.from('hsk_expiry_targets').select('month_period'),
    supabase.from('hsk_expiry_allocations').select('month_period'),
    supabase.from('hsk_expiry_removals').select('month_period'),
  ]);
  const set = new Set<string>();
  [t.data, a.data, r.data].forEach(rows => (rows || []).forEach((x: { month_period: string | null }) => { if (x.month_period) set.add(x.month_period); }));
  // "2026-11" sorts as the start of November so a dated round in that month comes after it
  return [...set].sort((x, y) => (y.length === 7 ? `${y}-00` : y).localeCompare(x.length === 7 ? `${x}-00` : x));
};

// A real villa: "12", "57-1"/"57-2" (double minibar villas), 1–97
export const TOTAL_VILLAS = 97;
export const isVillaToken = (v: string) => {
  const m = String(v).trim().match(/^(\d+)(?:-[12])?$/);
  return !!m && +m[1] >= 1 && +m[1] <= TOTAL_VILLAS;
};
export const villaBase = (v: string) => String(v).trim().split('-')[0];

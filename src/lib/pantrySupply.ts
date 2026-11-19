// Pantry Supply: each pantry (Jetty A/B/C, Beach) has its own supply day(s) in the week. Villa attendants
// working there (or the PA on duty) tick what the pantry needs — no quantities — plus free text if needed.
// The houseman / store / supervisor packs the list and hands it to a runner.
// Tables: hsk_pantry_items, hsk_pantry_requests, hsk_pantry_request_lines (supabase/pantry_supply.sql).
// Supply days: hsk_constants type 'pantry_supply_days', JSON { "Jetty A Pantry": [0..6], ... } (0 = Sunday).
import { supabase } from '@/lib/supabase';

export const PANTRIES = ['Jetty A Pantry', 'Jetty B Pantry', 'Jetty C Pantry', 'Beach Pantry'] as const;
export type Pantry = typeof PANTRIES[number];
export const pantryShort = (p: string) => p.replace(/\s*Pantry$/i, '');

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Same split as linen / bottle setup: A 1–35, B 37–50, C 59–79, Beach = 36, 51–58, 80–97
export const pantryOfVilla = (v: string | number): Pantry | null => {
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  if (isNaN(n) || n < 1 || n > 97) return null;
  if (n <= 35) return 'Jetty A Pantry';
  if (n >= 37 && n <= 50) return 'Jetty B Pantry';
  if (n >= 59 && n <= 79) return 'Jetty C Pantry';
  return 'Beach Pantry';
};

export type PantryItem = { id: string; article_number: string | null; name: string; unit: string | null; image_url: string | null; category: string; sort_order: number; active: boolean };
export type PantryLine = { id: string; request_id: string; item_id: string | null; name: string; is_custom: boolean; requested_by_id: string | null; requested_by_name: string | null; status: 'Needed' | 'Packed' | 'Not available'; created_at: string };
export type PantryStatus = 'Open' | 'Packed' | 'With runner' | 'Delivered';
export type PantryRequest = {
  id: string; pantry: string; supply_date: string; kind: 'Scheduled' | 'Extra'; status: PantryStatus; notes: string | null;
  packed_by: string | null; packed_at: string | null; runner_id: string | null; runner_name: string | null; sent_at: string | null; delivered_at: string | null; created_at: string;
  lines?: PantryLine[];
};
export const STATUS_STEPS: PantryStatus[] = ['Open', 'Packed', 'With runner', 'Delivered'];

/* ---------- supply days ---------- */
export type SupplyDays = Record<string, number[]>;
const DAYS_TYPE = 'pantry_supply_days';

export const loadSupplyDays = async (): Promise<SupplyDays> => {
  const { data } = await supabase.from('hsk_constants').select('label').eq('type', DAYS_TYPE).limit(1).maybeSingle();
  try { const v = JSON.parse(data?.label || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};
export const saveSupplyDays = async (days: SupplyDays) => {
  await supabase.from('hsk_constants').delete().eq('type', DAYS_TYPE);
  const { error } = await supabase.from('hsk_constants').insert([{ type: DAYS_TYPE, label: JSON.stringify(days) }]);
  if (error) throw error;
};

const dow = (iso: string) => new Date(`${iso}T12:00:00`).getDay();
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const isSupplyDay = (days: SupplyDays, pantry: string, iso: string) => (days[pantry] || []).includes(dow(iso));
// The pantry's next supply date on or after `from` (null when no day is set)
export const nextSupplyDate = (days: SupplyDays, pantry: string, from: string): string | null => {
  const set = days[pantry] || [];
  if (!set.length) return null;
  for (let i = 0; i < 7; i++) { const d = addDays(from, i); if (set.includes(dow(d))) return d; }
  return null;
};
export const supplyDaysLabel = (days: SupplyDays, pantry: string) => (days[pantry] || []).slice().sort().map(d => WEEKDAYS_LONG[d]).join(' & ') || 'No day set';

/* ---------- requests ---------- */
export const loadRequests = async (date: string): Promise<PantryRequest[]> => {
  const { data, error } = await supabase.from('hsk_pantry_requests').select('*, lines:hsk_pantry_request_lines(*)').eq('supply_date', date);
  if (error) throw error;
  return (data || []) as PantryRequest[];
};

// The list for this pantry + date + kind; created on first use
export const getOrCreateRequest = async (pantry: string, date: string, kind: 'Scheduled' | 'Extra'): Promise<PantryRequest> => {
  const find = () => supabase.from('hsk_pantry_requests').select('*').match({ pantry, supply_date: date, kind }).maybeSingle();
  const { data: found } = await find();
  if (found) return found as PantryRequest;
  const { data, error } = await supabase.from('hsk_pantry_requests').insert([{ pantry, supply_date: date, kind, status: 'Open' }]).select('*').single();
  if (error) {
    // Someone else created it at the same moment
    const { data: again } = await find();
    if (again) return again as PantryRequest;
    throw error;
  }
  return data as PantryRequest;
};

export const loadPantryItems = async (activeOnly = true): Promise<PantryItem[]> => {
  let q = supabase.from('hsk_pantry_items').select('*').order('category').order('sort_order').order('name');
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as PantryItem[];
};

// "relation does not exist" → the SQL in supabase/pantry_supply.sql has not been run yet
export const isMissingTable = (err: unknown) => /does not exist|schema cache|42P01|PGRST205/i.test(String((err as { message?: string; code?: string })?.message || '') + String((err as { code?: string })?.code || ''));

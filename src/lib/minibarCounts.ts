// Minibar inventory: villa counts per inventory period, opening stock, villa lists.
// Shared by Live Inventory Matrix, Finance P&L and the VA count on My Tasks.
import { supabase } from '@/lib/supabase';

export const TOTAL_VILLAS = 97;
export const EMPTY_MB_TYPE = 'empty_mb_villas';   // villas with no minibar / kept empty (comma list)

export type MbSubmission = { id?: string; villa_number: string; host_id?: string; host_name?: string | null; inventory_data: { article_number: string; qty: number; name?: string }[]; logged_at: string; month_period?: string | null };
export type MbFin = { opening_stock: number; transfer_in: number; transfer_out: number; sales: number; minibar_store: number; comments: string };

export const prevPeriod = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const nextPeriod = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
// Month bounds in Maldives time
const bounds = (p: string) => ({
  from: new Date(`${p}-01T00:00:00+05:00`).toISOString(),
  to: new Date(`${nextPeriod(p)}-01T00:00:00+05:00`).toISOString(),
});

export const splitList = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

/** 1..97, with double villas split into "36-1", "36-2". */
export const villaList = (doubleVillas: string[]) => {
  const out: string[] = [];
  for (let i = 1; i <= TOTAL_VILLAS; i++) {
    const v = String(i);
    if (doubleVillas.includes(v)) out.push(`${v}-1`, `${v}-2`); else out.push(v);
  }
  return out;
};

/**
 * "1-5, 36, 57-2, 10-12" → villas. A "57-1"/"57-2" for a double villa is that half; any other
 * "a-b" with b > a is a range. (The old parser read "10-12" as one villa because it contains "-1".)
 */
export const parseMbVillas = (input: string, doubleVillas: string[]): string[] => {
  const result = new Set<string>();
  const add = (v: string) => { if (doubleVillas.includes(v)) { result.add(`${v}-1`); result.add(`${v}-2`); } else result.add(v); };
  for (const raw of String(input || '').split(',')) {
    const p = raw.trim().replace(/\s+/g, '');
    if (!p) continue;
    const m = p.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if ((m[2] === '1' || m[2] === '2') && doubleVillas.includes(m[1])) { result.add(p); continue; }
      if (b > a) { for (let i = a; i <= b; i++) add(String(i)); continue; }
      result.add(p);
      continue;
    }
    if (/^\d+$/.test(p)) add(String(Number(p)));
  }
  return [...result];
};

let periodColumn: boolean | null = null;
/** Does hsk_villa_minibar_inventory have month_period yet? (supabase/minibar_period.sql) */
export const hasPeriodColumn = async () => {
  if (periodColumn !== null) return periodColumn;
  const { error } = await supabase.from('hsk_villa_minibar_inventory').select('month_period').limit(1);
  periodColumn = !error;
  return periodColumn;
};

/** Every count of a period: tagged with the period, or (older rows / before the SQL) logged in that month. */
export const loadMbSubmissions = async (period: string): Promise<MbSubmission[]> => {
  const { from, to } = bounds(period);
  const out: MbSubmission[] = [];
  const withCol = await hasPeriodColumn();
  for (let i = 0; ; i += 1000) {
    let q = supabase.from('hsk_villa_minibar_inventory').select('*').order('logged_at').range(i, i + 999);
    q = withCol
      ? q.or(`month_period.eq.${period},and(month_period.is.null,logged_at.gte.${from},logged_at.lt.${to})`)
      : q.gte('logged_at', from).lt('logged_at', to);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data || []) as MbSubmission[]));
    if (!data || data.length < 1000) break;
  }
  return out;
};

/** Latest count per villa */
export const latestByVilla = (subs: MbSubmission[]) => {
  const m: Record<string, MbSubmission> = {};
  subs.forEach(s => { const e = m[s.villa_number]; if (!e || s.logged_at > e.logged_at) m[s.villa_number] = s; });
  return m;
};

/** villa → article → qty */
export const villaMatrix = (latest: Record<string, MbSubmission>) => {
  const d: Record<string, Record<string, number>> = {};
  Object.values(latest).forEach(s => {
    d[s.villa_number] = {};
    (Array.isArray(s.inventory_data) ? s.inventory_data : []).forEach(i => { d[s.villa_number][i.article_number] = Number(i.qty) || 0; });
  });
  return d;
};

/** Save one villa count for the open period. */
export const saveMbSubmission = async (row: Omit<MbSubmission, 'logged_at' | 'month_period'>, period: string) => {
  const payload: any = { ...row, logged_at: new Date().toISOString() };
  if (await hasPeriodColumn()) payload.month_period = period;
  const { error } = await supabase.from('hsk_villa_minibar_inventory').insert(payload);
  if (error) throw error;
};

/**
 * Opening stock for a period that has not been saved yet, from the previous period:
 *   physical = villas counted + MB Store (what was really there)   ← default
 *   book     = opening + in − out − sales
 */
export const loadOpeningDefaults = async (period: string, villas: string[]) => {
  const prev = prevPeriod(period);
  const [{ data: prevFin }, prevSubs] = await Promise.all([
    supabase.from('hsk_monthly_minibar').select('*').eq('month_period', prev),
    loadMbSubmissions(prev).catch(() => [] as MbSubmission[]),
  ]);
  const book: Record<string, number> = {};
  const physical: Record<string, number> = {};
  const store: Record<string, number> = {};
  (prevFin || []).forEach((f: any) => {
    book[f.article_number] = (f.opening_stock || 0) + (f.transfer_in || 0) - (f.transfer_out || 0) - (f.sales || 0);
    store[f.article_number] = f.minibar_store || 0;
    physical[f.article_number] = store[f.article_number];
  });
  const mx = villaMatrix(latestByVilla(prevSubs));
  villas.forEach(v => Object.entries(mx[v] || {}).forEach(([a, q]) => { physical[a] = (physical[a] || 0) + q; }));
  return { prev, book, physical, prevSaved: !!prevFin?.length, prevCounted: Object.keys(mx).length };
};

// Items in the minibar catalogue that are NOT part of the minibar inventory (complimentary / not minibar,
// e.g. baby wipes, diapers, hot chocolate): left out of the VA count, the Matrix and Finance.
// (They keep is_minibar_item, which the Requests page uses for posting.)
export const MB_EXCLUDE_TYPE = 'mb_inv_exclude';

export type VaMinibarTasks = {
  open: boolean;
  period: string;                       // open inventory period, '' when closed
  villas: { villa: string; done: boolean; countedBy?: string | null }[];
  hidden: string[];                     // items VAs don't count (hidden + not in inventory)
  excluded: string[];
};

/**
 * The minibar villas a VA has to count in the open period, and which are done.
 * `override` lets a simulation pretend the inventory is open without touching the live setting.
 */
export const loadVaMinibarTasks = async (
  host: { id: string; host_id: string },
  override?: { status?: 'OPEN' | 'CLOSED'; period?: string },
): Promise<VaMinibarTasks> => {
  const { data: c } = await supabase.from('hsk_constants').select('type, label')
    .in('type', ['mb_inv_status', 'mb_active_period', 'double_mb_villas', 'hidden_mb_item', MB_EXCLUDE_TYPE, EMPTY_MB_TYPE]);
  const get = (t: string) => (c || []).find(x => x.type === t)?.label || '';
  const all = (t: string) => (c || []).filter(x => x.type === t).map(x => x.label);
  const status = override?.status || get('mb_inv_status') || 'CLOSED';
  const period = override?.period || get('mb_active_period');
  const excluded = all(MB_EXCLUDE_TYPE);
  const hidden = [...new Set([...all('hidden_mb_item'), ...excluded])];
  const base = { hidden, excluded };
  if (status !== 'OPEN' || !period) return { open: false, period: '', villas: [], ...base };

  const doubleList = splitList(get('double_mb_villas'));
  const noMinibar = new Set(parseMbVillas(get(EMPTY_MB_TYPE), doubleList));
  const { data: alloc } = await supabase.from('hsk_minibar_allocations').select('host_id, villas').eq('date', `${period}-01`);
  const mine = (alloc || []).filter(a => a.host_id === host.id || a.host_id === host.host_id);
  const villas = [...new Set(mine.flatMap(a => parseMbVillas(a.villas || '', doubleList)))].filter(v => !noMinibar.has(v));
  const latest = latestByVilla(await loadMbSubmissions(period).catch(() => [] as MbSubmission[]));
  const num = (v: string) => parseFloat(v.replace('-', '.')) || 9999;
  return {
    open: true, period, ...base,
    villas: villas.sort((a, b) => num(a) - num(b)).map(v => ({ villa: v, done: !!latest[v], countedBy: latest[v]?.host_name || null })),
  };
};

// Helpers shared by the Requests page and the Runner page.

export const TOTAL_VILLAS = 97;

// Normalize villa numbers so "05" and "5" are always identical
export const normalizeVillaNumber = (raw: string): string => {
  if (!raw) return '';
  const str = raw.trim();
  if (str.includes('-')) {
    const [base, sub] = str.split('-');
    const parsedBase = parseInt(base, 10);
    return isNaN(parsedBase) ? str : `${parsedBase}-${sub}`;
  }
  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? str : parsed.toString();
};

// What the "villa" box holds: a real villa (1–97, or a split like 12-1), a complimentary / account
// code such as 9702, or free text such as "Beach".
export type Target = { kind: 'villa' | 'code' | 'other'; value: string; base: string; label: string };
export const classifyTarget = (raw: string): Target => {
  const v = normalizeVillaNumber(raw || '');
  const base = parseInt(v.split('-')[0], 10);
  if (/^\d+(-\d+)?$/.test(v) && base >= 1 && base <= TOTAL_VILLAS) return { kind: 'villa', value: v, base: String(base), label: `V${v}` };
  if (/^\d+$/.test(v)) return { kind: 'code', value: v, base: '', label: `Comp ${v}` };
  return { kind: 'other', value: v, base: '', label: v };
};

// "1-5, 8 & 12" → ["1","2","3","4","5","8","12"] (+ "-1"/"-2" halves for double villas)
export const parseVillas = (input: string, doubleVillas: string[] = []) => {
  if (!input) return [];
  const result = new Set<string>();
  const normalized = input.replace(/&|and/gi, ',').replace(/\s+/g, '');
  for (const p of normalized.split(',')) {
    if (!p) continue;
    if (p.includes('-')) {
      const [startStr, endStr] = p.split('-');
      const start = parseInt(startStr.replace(/\D/g, ''), 10);
      const end = parseInt(endStr.replace(/\D/g, ''), 10);
      if (!isNaN(start) && !isNaN(end) && start <= end && end - start < 200) {
        for (let i = start; i <= end; i++) result.add(String(i));
      }
    } else {
      const num = parseInt(p.replace(/\D/g, ''), 10);
      if (!isNaN(num)) result.add(String(num));
    }
  }
  const finalResult = new Set<string>();
  Array.from(result).forEach(v => {
    finalResult.add(v);
    if (doubleVillas.includes(v)) { finalResult.add(`${v}-1`); finalResult.add(`${v}-2`); }
  });
  return Array.from(finalResult);
};

export const isOnlyRefills = (details: string) => {
  const items = (details || '').split(/\n/).map(s => s.trim()).filter(Boolean);
  return items.length > 0 && items.every(item => item.includes('(Refill)'));
};

// Item lines of a request, with the "(SENT)" marker split out.
export const splitItems = (details: string) =>
  (details || '').split(/\n/).map(s => s.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean)
    .map(raw => ({ raw, name: raw.replace(/\s*\(SENT\)$/, ''), sent: /\(SENT\)$/.test(raw) }));

// ---------------------------------------------------------------------------------------------
// Who sees what
// ---------------------------------------------------------------------------------------------

// The coordinator alone sees private requests and the minibar banking ledger (not other admins).
export const COORDINATOR_HOST_IDS = ['3444a24c-8784-44bf-b65e-3b391f2d2189']; // Abdulla Yamin

export type Session = { id?: string; host_id?: string; full_name?: string; nicknames?: string; role?: string; system_role?: string; is_super_admin?: boolean; impersonating_from?: unknown };

export const readSession = (): Session => {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('hk_pulse_session') || '{}') || {}; } catch { return {}; }
};

// "Viewing as" someone else gives that person's view, like the rest of the app.
export const isCoordinator = (s: Session = readSession()) => !s.impersonating_from && !!s.id && COORDINATOR_HOST_IDS.includes(s.id);
export const isAdminSession = (s: Session = readSession()) => !s.impersonating_from && (s.system_role === 'admin' || s.is_super_admin === true);

// ---------------------------------------------------------------------------------------------
// Packages and spirits
// ---------------------------------------------------------------------------------------------

// HBSI / FBSI = Sinner, HBSA / FBSA = Saint.
export type GuestPackage = 'Sinner' | 'Saint' | null;
export const packageOf = (mealPlan?: string | null): GuestPackage => {
  const p = String(mealPlan || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (/SI$/.test(p) || p === 'SINNER') return 'Sinner';
  if (/SA$/.test(p) || p === 'SAINT') return 'Saint';
  return null;
};

// "Hard liquor" for the Sinner warning: the minibar spirits — Bacardi, Vodka, Gin (not Ginger Beer).
export const isHardLiquor = (item: string) => /\b(bacardi|rum|vodka|absolut|gin|gordon'?s?)\b/i.test(item || '');

// "2x Bacardi (Refill) (SENT)" → { qty: 2, name: 'Bacardi', refill: true }
export const parseItemLine = (line: string) => {
  const clean = (line || '').trim().replace(/^[•\-\*]\s*/, '').replace(/\s*\(SENT\)$/, '');
  const refill = /\(Refill\)/.test(clean);
  const noRefill = clean.replace(/\s*\(Refill\)/, '').trim();
  const m = noRefill.match(/^(\d+)\s*x\s+(.+)$/i);
  return { qty: m ? parseInt(m[1], 10) : 1, name: (m ? m[2] : noRefill).trim(), refill };
};

// ---------------------------------------------------------------------------------------------
// Delivery: at office → handed to Runner / handed to VA / left at pantry → in villa
// ---------------------------------------------------------------------------------------------
//  • new       — recorded, still at the office (not handed over)
//  • taken     — handed to a runner (taken_by = runner, or "Runner" when not named)
//  • va        — handed to the villa attendant (taken_by = VA)
//  • pantry    — runner left it at the pantry; the VA still has to put it in the villa
//  • delivered — in the villa
// Minibar "Sent" (is_sent) means it left the office; the villa step is delivery_status.
// Item lines ending in "(SENT)" are the items already handed over.

export type Delivery = 'new' | 'taken' | 'va' | 'pantry' | 'delivered';
export const GENERIC_RUNNER = 'Runner';

export type DeliveryFields = {
  request_type: string;
  item_details?: string;
  is_sent?: boolean | null;
  is_done?: boolean | null;
  delivery_status?: string | null;
  taken_by?: string | null;
  taken_at?: string | null;
  pantry_by?: string | null;
  pantry_at?: string | null;
  delivered_by?: string | null;
  delivered_at?: string | null;
  reassigned_on?: string | null;
};

const STEPS: Delivery[] = ['taken', 'va', 'pantry', 'delivered'];

export const deliveryOf = (r: DeliveryFields): Delivery => {
  if (r.delivery_status && (STEPS as string[]).includes(r.delivery_status)) return r.delivery_status as Delivery;
  // Before the delivery steps existed: Sent (minibar) / Done (requests) meant finished.
  return (r.request_type === 'Minibar' ? r.is_sent : r.is_done) ? 'delivered' : 'new';
};
export const isDeliveredReq = (r: DeliveryFields) => deliveryOf(r) === 'delivered';

// Mark every item line as handed over (or not).
export const markAllItems = (details: string, sent: boolean) =>
  (details || '').split('\n').map(l => l.replace(/\s*\(SENT\)$/, '')).map(l => (sent && l.trim() ? `${l} (SENT)` : l)).join('\n');
export const itemsPending = (details: string) => splitItems(details).filter(i => !i.sent).length;

// The database patch for moving a request to a step. `holder` = who now has it (runner / VA name).
export const deliveryPatch = (r: DeliveryFields, to: Delivery, who: string, holder?: string) => {
  const now = new Date().toISOString();
  const isMb = r.request_type === 'Minibar';
  const clear = { taken_by: null, taken_at: null, pantry_by: null, pantry_at: null, delivered_by: null, delivered_at: null };
  // Minibar: anything past "new" has left the office → Sent, all items handed over.
  const mb = (left: boolean) => (isMb ? { is_sent: left, item_details: markAllItems(r.item_details || '', left) } : {});
  const done = (d: boolean) => (isMb ? {} : { is_done: d });
  if (to === 'new') return { ...clear, delivery_status: null, ...mb(false), ...done(false) };
  if (to === 'taken' || to === 'va') return { ...clear, delivery_status: to, taken_by: holder || who, taken_at: now, ...mb(true), ...done(false) };
  const taken = { taken_by: r.taken_by || holder || who, taken_at: r.taken_at || now };
  if (to === 'pantry') return { ...clear, ...taken, delivery_status: 'pantry', pantry_by: r.pantry_by || who, pantry_at: r.pantry_at || now, ...mb(true), ...done(false) };
  return { ...taken, pantry_by: r.pantry_by || null, pantry_at: r.pantry_at || null, delivery_status: 'delivered', delivered_by: who, delivered_at: now, ...mb(true), ...done(true) };
};

// Runner / VA lists: today's requests, plus older open ones the coordinator re-assigned to today.
export const isForToday = (r: DeliveryFields & { request_time: string }, todayYmd: string) =>
  r.request_time >= `${todayYmd}T00:00:00+06:00` || r.reassigned_on === todayYmd;

// Message shown when a write fails because the new columns are not in Supabase yet.
export const MISSING_COLUMN_HINT = 'Database needs the new request columns — run the SQL from the update notes.';
export const isMissingColumn = (err: { message?: string; code?: string } | null) =>
  !!err && (err.code === 'PGRST204' || err.code === '42703' || /column .* (does not exist|not find)/i.test(err.message || ''));

export const shortHHMM = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '';

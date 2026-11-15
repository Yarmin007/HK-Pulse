// Minibar live ledger — pure logic, no imports (easy to test).
//
// Every bottle is always somewhere: the STORE, a villa (V:12, V:87-1), in TRANSIT with a runner/VA,
// at a PANTRY waiting for the VA, or at the OFFICE after a full minibar removal.
// Items leave the ledger to CONSUMED (guest), OUT (complimentary / non-villa), or MISSING.
//
// Two sources of movements:
//  1. Stored rows (hsk_minibar_movements): counts, stock in, transfers, removals, office checks.
//  2. Minibar requests (hsk_daily_requests), turned into movements on the fly, so they can never drift:
//       recorded   → villa → CONSUMED, and STORE → TRANSIT (the refill is on its way)
//       to pantry  → TRANSIT → PANTRY
//       in villa   → TRANSIT/PANTRY → villa
// A "count" sets a location's balance outright (opening stock or a recount); the difference is its variance.

export type Loc = string;
export const STORE = 'STORE';
export const TRANSIT = 'TRANSIT';
export const PANTRY = 'PANTRY';
export const OFFICE = 'OFFICE';
export const CONSUMED = 'CONSUMED';
export const OUT = 'OUT';
export const MISSING = 'MISSING';
export const SUPPLIER = 'SUPPLIER';

export const villaLoc = (v: string) => `V:${v}`;
export const isVillaLoc = (l?: Loc | null) => !!l && l.startsWith('V:');
export const villaOfLoc = (l: Loc) => l.slice(2);
export const locLabel = (l?: Loc | null) => {
  if (!l) return '—';
  if (isVillaLoc(l)) return `V${villaOfLoc(l)}`;
  return ({ STORE: 'Store', TRANSIT: 'In transit', PANTRY: 'Pantry', OFFICE: 'Office (removed)', CONSUMED: 'Guest', OUT: 'Out', MISSING: 'Missing', SUPPLIER: 'Supplier' } as Record<string, string>)[l] || l;
};
// Places that hold stock (shown with balances).
export const isHoldingLoc = (l: Loc) => l === STORE || l === TRANSIT || l === PANTRY || l === OFFICE || isVillaLoc(l);

export type MoveKind =
  | 'count' | 'stock_in' | 'transfer' | 'removal' | 'office_in' | 'missing' | 'adjust'
  | 'consumed' | 'issue' | 'to_pantry' | 'to_villa';

export const KIND_LABEL: Record<MoveKind, string> = {
  count: 'Count', stock_in: 'Stock in', transfer: 'Transfer', removal: 'Minibar removed', office_in: 'Office check',
  missing: 'Missing', adjust: 'Adjustment', consumed: 'Guest consumed', issue: 'Taken from store', to_pantry: 'Left at pantry', to_villa: 'Put in villa',
};

export type Movement = {
  id: string;
  at: string; // ISO time
  kind: MoveKind;
  article: string;
  qty: number;
  from: Loc | null;
  to: Loc | null;
  by?: string | null;
  note?: string | null;
  batch?: string | null;
  requestId?: string | null;
  derived?: boolean; // built from a request, not stored
};

// Stored row in hsk_minibar_movements.
export type MovementRow = {
  id: string; created_at: string; kind: string; article_number: string; item_name?: string | null;
  qty: number; from_loc: string | null; to_loc: string | null; by_name?: string | null; note?: string | null; batch_id?: string | null;
};
export const fromRow = (r: MovementRow): Movement => ({
  id: r.id, at: r.created_at, kind: r.kind as MoveKind, article: r.article_number, qty: Number(r.qty) || 0,
  from: r.from_loc, to: r.to_loc, by: r.by_name, note: r.note, batch: r.batch_id,
});

export type CatalogLite = { article_number: string; article_name: string; generic_name?: string | null };

// Request lines use the short (generic) name — "2x Corona". Map names back to articles.
export const buildNameIndex = (catalog: CatalogLite[]) => {
  const idx = new Map<string, string>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const c of catalog) {
    if (c.article_name) idx.set(norm(c.article_name), c.article_number);
  }
  for (const c of catalog) {
    if (c.generic_name) idx.set(norm(c.generic_name), c.article_number); // generic wins: that is what requests store
  }
  return (name: string) => idx.get(norm(name)) || null;
};

export const parseLine = (line: string) => {
  const raw = (line || '').trim().replace(/^[•\-\*]\s*/, '');
  const sent = /\(SENT\)$/.test(raw);
  const clean = raw.replace(/\s*\(SENT\)$/, '');
  const refill = /\(Refill\)/.test(clean);
  const noRefill = clean.replace(/\s*\(Refill\)/, '').trim();
  const m = noRefill.match(/^(\d+)\s*x\s+(.+)$/i);
  return { qty: m ? parseInt(m[1], 10) : 1, name: (m ? m[2] : noRefill).trim(), refill, sent };
};

export type RequestLite = {
  id: string; villa_number: string; request_type: string; item_details: string; request_time: string;
  is_sent?: boolean | null; delivery_status?: string | null;
  taken_by?: string | null; taken_at?: string | null; pantry_by?: string | null; pantry_at?: string | null;
  delivered_by?: string | null; delivered_at?: string | null; attendant_name?: string | null; logged_by?: string | null;
};

// Where a request's villa number lives. A bare double-minibar villa ("87") counts as its first bar.
export const requestLoc = (villa: string, doubleVillas: string[] = [], totalVillas = 97): Loc | null => {
  const v = String(villa || '').trim().replace(/^0+(\d)/, '$1');
  const base = parseInt(v.split('-')[0], 10);
  if (!/^\d+(-\d)?$/.test(v) || !(base >= 1 && base <= totalVillas)) return null;
  if (!v.includes('-') && doubleVillas.includes(v)) return villaLoc(`${v}-1`);
  return villaLoc(v);
};

// An item still on its way: taken from the store but not yet in the villa.
export type OpenLine = { requestId: string; article: string; name: string; qty: number; target: Loc | null; targetLabel: string; at: PANTRY_OR_TRANSIT; since: string; holder: string; requestedAt: string };
type PANTRY_OR_TRANSIT = 'TRANSIT' | 'PANTRY';

export const deriveFromRequests = (requests: RequestLite[], articleOf: (name: string) => string | null, doubleVillas: string[] = []) => {
  const moves: Movement[] = [];
  const open: OpenLine[] = [];
  const unmatched = new Set<string>();
  for (const r of requests) {
    if (r.request_type !== 'Minibar') continue;
    const target = requestLoc(r.villa_number, doubleVillas);
    const delivered = !!r.is_sent;
    const viaPantry = !!r.pantry_at;
    const lines = (r.item_details || '').split('\n').map(parseLine).filter(l => l.name);
    lines.forEach((l, i) => {
      const article = articleOf(l.name);
      if (!article) { unmatched.add(l.name); return; }
      const base = { article, qty: l.qty, requestId: r.id, derived: true as const };
      const id = (k: string) => `${r.id}:${i}:${k}`;
      if (target) moves.push({ ...base, id: id('c'), at: r.request_time, kind: 'consumed', from: target, to: CONSUMED, by: r.attendant_name || r.logged_by || null });
      moves.push({ ...base, id: id('i'), at: r.request_time, kind: 'issue', from: STORE, to: TRANSIT, by: r.taken_by || r.logged_by || null });
      const lineDone = delivered || l.sent;
      if (viaPantry) {
        moves.push({ ...base, id: id('p'), at: r.pantry_at!, kind: 'to_pantry', from: TRANSIT, to: PANTRY, by: r.pantry_by || null });
      }
      if (lineDone) {
        const at = r.delivered_at || (viaPantry ? r.pantry_at! : r.request_time);
        moves.push({ ...base, id: id('d'), at: at < r.request_time ? r.request_time : at, kind: 'to_villa', from: viaPantry ? PANTRY : TRANSIT, to: target || OUT, by: r.delivered_by || null });
      } else {
        open.push({
          requestId: r.id, article, name: l.name, qty: l.qty, target, targetLabel: target ? locLabel(target) : r.villa_number,
          at: viaPantry ? PANTRY : TRANSIT, since: viaPantry ? r.pantry_at! : (r.taken_at || r.request_time),
          holder: viaPantry ? (r.pantry_by || r.taken_by || '') : (r.taken_by || ''), requestedAt: r.request_time,
        });
      }
    });
  }
  return { moves, open, unmatched: [...unmatched] };
};

export type Balances = Map<Loc, Map<string, number>>;
export type CountVariance = { id: string; at: string; loc: Loc; article: string; expected: number; counted: number };

// Plays every movement in time order. Counts set the balance; everything else moves qty from → to.
export const computeBalances = (moves: Movement[]) => {
  const bal: Balances = new Map();
  const variances: CountVariance[] = [];
  const get = (l: Loc) => { let m = bal.get(l); if (!m) { m = new Map(); bal.set(l, m); } return m; };
  const order = (k: MoveKind) => (k === 'count' ? 1 : 0); // a count at the same instant comes after the moves
  const sorted = [...moves].sort((a, b) => a.at.localeCompare(b.at) || order(a.kind) - order(b.kind));
  for (const m of sorted) {
    if (m.kind === 'count') {
      if (!m.to) continue;
      const loc = get(m.to);
      const expected = loc.get(m.article) || 0;
      // The first count of an item at a place is its opening stock, not a variance.
      if (loc.has(m.article) && expected !== m.qty) variances.push({ id: m.id, at: m.at, loc: m.to, article: m.article, expected, counted: m.qty });
      loc.set(m.article, m.qty);
      continue;
    }
    if (m.from && isHoldingLoc(m.from)) { const f = get(m.from); f.set(m.article, (f.get(m.article) || 0) - m.qty); }
    if (m.to && isHoldingLoc(m.to)) { const t = get(m.to); t.set(m.article, (t.get(m.article) || 0) + m.qty); }
  }
  return { bal, variances, sorted };
};

export const qtyAt = (bal: Balances, loc: Loc, article: string) => bal.get(loc)?.get(article) || 0;
export const totalAt = (bal: Balances, loc: Loc) => [...(bal.get(loc)?.values() || [])].reduce((s, q) => s + q, 0);

// All minibar locations of the resort: 1–97, with double-minibar villas split into -1 / -2.
export const allVillaLocs = (doubleVillas: string[], totalVillas = 97): Loc[] => {
  const out: Loc[] = [];
  for (let i = 1; i <= totalVillas; i++) {
    const v = String(i);
    if (doubleVillas.includes(v)) { out.push(villaLoc(`${v}-1`), villaLoc(`${v}-2`)); } else out.push(villaLoc(v));
  }
  return out;
};

// Rows for "put these qtys at this location" — one count row per article.
export const countRows = (loc: Loc, counts: Record<string, number>, by: string, batch: string, note = '') =>
  Object.entries(counts).map(([article, qty]) => ({ kind: 'count', article_number: article, qty: Math.max(0, Math.round(qty || 0)), from_loc: null, to_loc: loc, by_name: by, note: note || null, batch_id: batch }));

export const moveRows = (kind: MoveKind, from: Loc, to: Loc, items: Record<string, number>, by: string, batch: string, note = '') =>
  Object.entries(items).filter(([, q]) => q > 0).map(([article, qty]) => ({ kind, article_number: article, qty: Math.round(qty), from_loc: from, to_loc: to, by_name: by, note: note || null, batch_id: batch }));

// Removal batches sent to the office and not yet checked in. Office checks carry the batch in their note ("check:<batch>").
export const pendingRemovals = (moves: Movement[]) => {
  const done = new Set(moves.filter(m => (m.kind === 'office_in' || m.kind === 'missing') && m.note?.startsWith('check:')).map(m => m.note!.slice(6)));
  const batches = new Map<string, { batch: string; at: string; from: Loc; by: string; items: Record<string, number> }>();
  for (const m of moves) {
    if (m.kind !== 'removal' || !m.batch || done.has(m.batch)) continue;
    const b = batches.get(m.batch) || { batch: m.batch, at: m.at, from: m.from || '', by: m.by || '', items: {} };
    b.items[m.article] = (b.items[m.article] || 0) + m.qty;
    batches.set(m.batch, b);
  }
  return [...batches.values()].sort((a, b) => a.at.localeCompare(b.at));
};

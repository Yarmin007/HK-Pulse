// Shared maths for water production and milk waste.

export type WaterRow = Record<string, any> & { date: string };
export type MilkRow = { date: string; total_ml: number };

const n = (v: unknown) => Number(v) || 0;

export const OUTLETS = [
  { key: 'fnb', label: 'F&B' },
  { key: 'hsk', label: 'HSK' },
  { key: 'tropic', label: 'Tropic' },
  { key: 'spa', label: 'Spa' },
  { key: 'ws', label: 'Water Sports' },
  { key: 'tma', label: 'TMA' },
] as const;
export type OutletKey = typeof OUTLETS[number]['key'];

// Bottle sizes: how many were filled and how many broke
export const SIZES = [
  { key: 's1000', label: '1000 ml' },
  { key: 's500', label: '500 ml' },
  { key: 's350', label: '350 ml' },
  { key: 's250', label: '250 ml' },
  { key: 's200', label: '200 ml' },
] as const;
export type SizeKey = typeof SIZES[number]['key'];
export type SizeStat = Record<SizeKey, number>;
const emptySizes = (): SizeStat => ({ s1000: 0, s500: 0, s350: 0, s250: 0, s200: 0 });

/** Litres produced in one day, split still / sparkling and by outlet. */
export const dayLitres = (r: WaterRow) => {
  const outlets: Record<OutletKey, number> = {
    fnb: n(r.b1000_fnb_still) + n(r.b1000_fnb_spk),
    hsk: n(r.b500_hsk_still) * 0.5 + n(r.b350_hsk_spk) * 0.35,
    tropic: n(r.b500_tropic_still) * 0.5,
    spa: n(r.b350_spa_still) * 0.35,
    ws: n(r.b350_ws_still) * 0.35,
    tma: n(r.b250_tma_still) * 0.25,
  };
  const still = n(r.b1000_fnb_still) + n(r.b500_hsk_still) * 0.5 + n(r.b500_tropic_still) * 0.5
    + n(r.b350_spa_still) * 0.35 + n(r.b350_ws_still) * 0.35 + n(r.b250_tma_still) * 0.25;
  const spk = n(r.b1000_fnb_spk) + n(r.b350_hsk_spk) * 0.35;
  const bottles = n(r.b1000_fnb_still) + n(r.b1000_fnb_spk) + n(r.b500_hsk_still) + n(r.b500_tropic_still)
    + n(r.b350_spa_still) + n(r.b350_ws_still) + n(r.b350_hsk_spk) + n(r.b250_tma_still);
  const breakage = n(r.b1000_break) + n(r.b500_break) + n(r.b350_break) + n(r.b250_break) + n(r.b200_break);
  const broken: SizeStat = { s1000: n(r.b1000_break), s500: n(r.b500_break), s350: n(r.b350_break), s250: n(r.b250_break), s200: n(r.b200_break) };
  const filled: SizeStat = {
    s1000: n(r.b1000_fnb_still) + n(r.b1000_fnb_spk),
    s500: n(r.b500_hsk_still) + n(r.b500_tropic_still),
    s350: n(r.b350_spa_still) + n(r.b350_ws_still) + n(r.b350_hsk_spk),
    s250: n(r.b250_tma_still),
    s200: 0, // 200 ml bottles are not filled here, only breakage is logged
  };
  return { still, spk, total: still + spk, bottles, breakage, outlets, broken, filled };
};

export type MonthAgg = {
  month: string; // YYYY-MM
  still: number; spk: number; total: number; bottles: number; breakage: number;
  days: number; // days with production logged
  outlets: Record<OutletKey, number>;
  daily: number[]; // litres by day (index 0 = day 1)
  milkL: number; milkDays: number;
  broken: SizeStat; filled: SizeStat; breakDays: number; // breakage by bottle size
  dayRecs: (ReturnType<typeof dayLitres> | null)[]; // per day, for like-for-like comparisons
  milkDaily: number[];
};

const emptyOutlets = (): Record<OutletKey, number> => ({ fnb: 0, hsk: 0, tropic: 0, spa: 0, ws: 0, tma: 0 });

export const emptyMonth = (month: string): MonthAgg => ({
  month, still: 0, spk: 0, total: 0, bottles: 0, breakage: 0, days: 0, outlets: emptyOutlets(),
  broken: emptySizes(), filled: emptySizes(), breakDays: 0,
  daily: Array(daysIn(month)).fill(0), milkL: 0, milkDays: 0, dayRecs: Array(daysIn(month)).fill(null), milkDaily: Array(daysIn(month)).fill(0),
});


const addSizes = (a: MonthAgg, l: ReturnType<typeof dayLitres>) => {
  (Object.keys(l.broken) as SizeKey[]).forEach(k => { a.broken[k] += l.broken[k]; a.filled[k] += l.filled[k]; });
  if (l.breakage > 0) a.breakDays++;
};
/** The same month cut to its first `n` days (to compare a month in progress fairly). */
export const firstDays = (m: MonthAgg, n: number): MonthAgg => {
  const out = emptyMonth(m.month);
  m.dayRecs.slice(0, n).forEach((l, i) => {
    if (!l) return;
    if (l.total > 0) out.days++;
    out.still += l.still; out.spk += l.spk; out.total += l.total; out.bottles += l.bottles; out.breakage += l.breakage;
    (Object.keys(l.outlets) as OutletKey[]).forEach(k => { out.outlets[k] += l.outlets[k]; });
    addSizes(out, l);
    out.daily[i] = l.total;
  });
  m.milkDaily.slice(0, n).forEach((ml, i) => { if (ml > 0) { out.milkL += ml / 1000; out.milkDays++; out.milkDaily[i] = ml; } });
  return out;
};

export const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const aggregateMonths = (water: WaterRow[], milk: MilkRow[]) => {
  const map = new Map<string, MonthAgg>();
  const get = (month: string) => {
    let a = map.get(month);
    if (!a) { a = emptyMonth(month); map.set(month, a); }
    return a;
  };
  water.forEach(r => {
    const d = String(r.date).slice(0, 10);
    const a = get(d.slice(0, 7));
    const l = dayLitres(r);
    if (l.total > 0) a.days++;
    a.still += l.still; a.spk += l.spk; a.total += l.total; a.bottles += l.bottles; a.breakage += l.breakage;
    (Object.keys(l.outlets) as OutletKey[]).forEach(k => { a.outlets[k] += l.outlets[k]; });
    addSizes(a, l);
    a.daily[Number(d.slice(8, 10)) - 1] += l.total;
    a.dayRecs[Number(d.slice(8, 10)) - 1] = l;
  });
  milk.forEach(r => {
    const ml = n(r.total_ml);
    if (ml <= 0) return;
    const a = get(String(r.date).slice(0, 7));
    a.milkL += ml / 1000; a.milkDays++;
    a.milkDaily[Number(String(r.date).slice(8, 10)) - 1] = ml;
  });
  return map;
};

export const monthLabel = (month: string, long = false) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' });
};

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const fmtL = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : Number.isInteger(v) ? String(v) : v.toFixed(1);

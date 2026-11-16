// Laundry production: machines, wash programmes and chemical dosing (ml per load).
// Source: "Monthly Laundry Production Report - 2026" dosing sheet.

import { supabase } from '@/lib/supabase';
import { isOffShift } from '@/app/allocation/lib/riders';

// Who may use the page: admins + whoever is on laundry duty in that day's allocation.
export const isOnLaundryDuty = async (hostId: string | undefined, ymd: string) => {
  if (!hostId) return false;
  const { data } = await supabase.from('hsk_allocations').select('area, shift').eq('report_date', ymd).eq('host_id', hostId);
  return (data || []).some((a: { area: string; shift?: string | null }) => a.area === 'laundry' && !isOffShift(a.shift));
};

export const CHEMICALS = ['Detergent', 'Oxy Brite', 'Sour', 'Softener', 'Builder C', 'Forward Enzyme'] as const;
export type Chemical = typeof CHEMICALS[number];
export type Dose = Record<Chemical, number>;

export type MachineSize = '55kg' | '23kg';
export const MACHINES: { id: string; label: string; size: MachineSize }[] = [
  { id: 'M1', label: 'M1', size: '55kg' },
  { id: 'M2', label: 'M2', size: '55kg' },
  { id: 'M3', label: 'M3', size: '55kg' },
  { id: 'M4', label: 'M4', size: '55kg' },
  { id: 'M23', label: '23kg', size: '23kg' },
];
export const machineById = (id: string) => MACHINES.find(m => m.id === id);

const d = (det: number, oxy: number, sour: number, soft: number, builder: number, enzyme: number): Dose =>
  ({ Detergent: det, 'Oxy Brite': oxy, Sour: sour, Softener: soft, 'Builder C': builder, 'Forward Enzyme': enzyme });

export const PROGRAMMES: Record<MachineSize, { item: string; dose: Dose }[]> = {
  '55kg': [
    { item: 'Host Linen - White', dose: d(110, 165, 55, 0, 165, 165) },
    { item: 'Bedsheet White / Pillow Cover - Guest', dose: d(110, 165, 55, 0, 165, 165) },
    { item: 'Towel White', dose: d(165, 220, 55, 110, 220, 0) },
    { item: 'Towel Color', dose: d(165, 55, 55, 110, 220, 0) },
    { item: 'Napkin / Placemat', dose: d(110, 220, 55, 0, 330, 165) },
    { item: 'Cushion / Curtain', dose: d(110, 55, 55, 0, 165, 110) },
    { item: 'Chef Uniform', dose: d(165, 275, 55, 0, 440, 220) },
    { item: 'White Uniform / Chef', dose: d(165, 165, 55, 110, 110, 110) },
    { item: 'Color Uniform', dose: d(165, 55, 55, 110, 110, 110) },
    { item: 'Spa', dose: d(165, 275, 55, 165, 440, 165) },
    { item: 'Cold Wash', dose: d(110, 0, 55, 110, 165, 0) },
    { item: 'Ramie Uniform', dose: d(110, 55, 55, 110, 220, 165) },
    { item: 'Duster', dose: d(110, 0, 55, 0, 220, 165) },
    { item: 'Rewash White', dose: d(165, 440, 55, 110, 550, 220) },
  ],
  '23kg': [
    { item: 'Bedsheet White', dose: d(50, 75, 25, 0, 75, 75) },
    { item: 'Bedsheet Beige', dose: d(50, 25, 25, 0, 75, 0) },
    { item: 'Towel White', dose: d(75, 100, 25, 50, 100, 0) },
    { item: 'Towel Color', dose: d(75, 25, 25, 50, 100, 0) },
    { item: 'Napkin / Placemat', dose: d(50, 100, 25, 0, 130, 75) },
    { item: 'Cushion / Curtain', dose: d(50, 25, 25, 0, 75, 50) },
    { item: 'Chef Uniform', dose: d(75, 125, 25, 0, 200, 100) },
    { item: 'White Uniform / Innersphere Uniform', dose: d(66, 66, 33, 66, 66, 0) },
    // Builder C is 5 ml in the sheet (every other 23kg programme is 50+) — check this one.
    { item: 'Color Uniform', dose: d(75, 25, 25, 50, 5, 50) },
    { item: 'Spa', dose: d(75, 125, 25, 75, 200, 75) },
    { item: 'Cold Wash', dose: d(50, 0, 25, 50, 75, 0) },
    { item: 'White Uniform', dose: d(75, 75, 25, 50, 125, 50) },
    { item: 'Duster', dose: d(50, 0, 25, 0, 100, 75) },
    { item: 'Rewash', dose: d(75, 200, 25, 50, 250, 100) },
  ],
};

export const programmeFor = (machineId: string, item: string) => {
  const m = machineById(machineId);
  return m ? PROGRAMMES[m.size].find(p => p.item === item) : undefined;
};

// One saved line = one load. `dose` is a copy of the ml/load at the time, so changing the sheet later keeps old months right.
export type ProductionEntry = {
  id: string;
  prod_date: string;
  machine: string;
  item: string;
  weight_kg: number | null;
  time_in: string | null;   // "HH:MM"
  time_out: string | null;  // "HH:MM", empty while the machine is still running
  operator: string | null;
  dose: Dose | null;
  created_at: string;
};

export const usageOf = (e: Pick<ProductionEntry, 'machine' | 'item' | 'dose'>): Dose => {
  const dose = e.dose || programmeFor(e.machine, e.item)?.dose;
  const out = {} as Dose;
  CHEMICALS.forEach(c => { out[c] = dose?.[c] || 0; });
  return out;
};

export const addDose = (a: Dose, b: Dose): Dose => {
  const out = {} as Dose;
  CHEMICALS.forEach(c => { out[c] = (a[c] || 0) + (b[c] || 0); });
  return out;
};
export const emptyDose = (): Dose => addDose({} as Dose, {} as Dose);

export const fmtMl = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toFixed(ml >= 10000 ? 1 : 2).replace(/\.?0+$/, '')} L` : `${Math.round(ml)} ml`);

// "08:10" → "09:05" = 55 min (past midnight wraps)
export const minutesBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
  let d = h2 * 60 + m2 - (h1 * 60 + m1);
  if (d < 0) d += 24 * 60;
  return d;
};
export const fmtDuration = (min: number | null) => (min == null ? '' : min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`);
export const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');

export const PRODUCTION_SQL = `create table if not exists laundry_production (
  id uuid primary key default gen_random_uuid(),
  prod_date date not null,
  machine text not null,
  item text not null,
  weight_kg numeric,
  time_in time,
  time_out time,
  operator text,
  dose jsonb,
  created_at timestamptz not null default now()
);
create index if not exists laundry_production_date_idx on laundry_production (prod_date);
alter table laundry_production enable row level security;
create policy "laundry_production all" on laundry_production for all using (true) with check (true);`;

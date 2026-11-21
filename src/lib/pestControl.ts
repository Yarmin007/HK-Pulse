// Pest control is an outside team that is not in the staff system. Their names and numbers are
// kept as one list (not per day) and printed on every allocation sheet until someone changes it.
import { supabase } from '@/lib/supabase';

export type PestControlPerson = { name: string; no: string };

export const PEST_CONTROL_ROWS = 5;
const TYPE = 'pest_control_team';

export const loadPestControl = async (): Promise<{ id: string | null; team: PestControlPerson[] }> => {
  const { data } = await supabase.from('hsk_constants').select('id, label').eq('type', TYPE).limit(1).maybeSingle();
  let team: PestControlPerson[] = [];
  try {
    const parsed = JSON.parse(data?.label || '[]');
    if (Array.isArray(parsed)) team = parsed.map((p) => ({ name: String(p?.name || ''), no: String(p?.no || '') }));
  } catch { /* empty list */ }
  return { id: data?.id ?? null, team };
};

export const savePestControl = async (team: PestControlPerson[]) => {
  const clean = team.map((p) => ({ name: p.name.trim(), no: p.no.trim() })).filter((p) => p.name || p.no);
  const label = JSON.stringify(clean);
  const { id } = await loadPestControl();
  const { error } = id
    ? await supabase.from('hsk_constants').update({ label }).eq('id', id)
    : await supabase.from('hsk_constants').insert([{ type: TYPE, label }]);
  if (error) throw error;
  return clean;
};

// ---------------------------------------------------------------------------------------------
// PestEX "Pest Control Day & Night Worksheet" — one saved sheet per date + shift, kept in
// hsk_constants as type `pest_worksheet:<YYYY-MM-DD>:<Day|Night>` with the sheet as JSON in label.
// ---------------------------------------------------------------------------------------------

export const PEST_TARGETS = ['Cockroach', 'Rats', 'Flies', 'Ants', 'Mosquitoes', 'Others'] as const;
export const PEST_METHODS = ['Hand Spray', 'Fog', 'Mist Blow', 'Bait Station', 'Fumigation'] as const;
export type PestShift = 'Day' | 'Night';

// Outlet rows in the same order as the PestEX template
export const PEST_OUTLETS: string[] = [
  'Traps, Box & Cages',
  'Arrival Villa',
  'Water Villa',
  'Beach Villa',
  'Host Accommodations',
  'Casual Accommodations',
  'HR, HK, ENG, Football Ground, Earth Lab & Kokuthu Village',
  'Spice House',
  'Mosque Area',
  'Organic Garden, Chili Table, Mushroom Hut, Water Sports, Den',
  'Leaf',
  'Sip Sip and Swimming Pool',
  'Surf Shack',
  'Six Senses Spa',
  'Cinema Under the Stars',
  'Sea Hub of Environmental Learning in Laamu (SHELL)',
  'Ice & Chocolate Studio',
  'Zen & Kaji',
  'Chill Bar',
  'The Cooking Hut',
  'Longitude Restaurant & Kitchen',
  'Altitude Cellar & Deli',
  'Welcome Pavilion and Library',
  'Deep Blue Divers, Tropicsurf & Surfboard Room',
  'Main Kitchen, Pastry & IVD',
  'Main Office',
  'Safety Tank',
];

// Sheets saved with the earlier template: their rows move to the new outlet names when read
// (several old rows can land on one new row; they are merged). Old rows with no new home are kept by name.
const OLD_OUTLET: Record<string, string[]> = {
  'HR, HK, ENG, Football Ground': ['HR, HK, ENG, Football Ground, Earth Lab & Kokuthu Village'],
  'Earth Lab & Kukulhu Village': ['HR, HK, ENG, Football Ground, Earth Lab & Kokuthu Village'],
  'Organic Garden, Chili Table &': ['Organic Garden, Chili Table, Mushroom Hut, Water Sports, Den'],
  'Mushroom Hut': ['Organic Garden, Chili Table, Mushroom Hut, Water Sports, Den'],
  'Water Sports': ['Organic Garden, Chili Table, Mushroom Hut, Water Sports, Den'],
  'The Den': ['Organic Garden, Chili Table, Mushroom Hut, Water Sports, Den'],
  'Spa Juice Bar': ['Six Senses Spa'],
  'Gym and Yoga Pavilion': ['Six Senses Spa'],
  'Ice & Chocolate Studio, Zen, Kaji, Chill Bar, Cooking Hut, Longitude & Toilet':
    ['Ice & Chocolate Studio', 'Zen & Kaji', 'Chill Bar', 'The Cooking Hut', 'Longitude Restaurant & Kitchen'],
  'Main Kitchen & IVD': ['Main Kitchen, Pastry & IVD'],
  Longitude: ['Longitude Restaurant & Kitchen'],
  'Deep Blue Divers': ['Deep Blue Divers, Tropicsurf & Surfboard Room'],
  'Host Village': ['Host Accommodations'],
};

const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
/** Two entries for the same outlet → one row (ticks combined, chemicals and remarks listed once). */
export const mergePestRows = (a: PestRow | undefined, b: PestRow | undefined): PestRow => ({
  pests: uniq([...(a?.pests || []), ...(b?.pests || [])]),
  methods: uniq([...(a?.methods || []), ...(b?.methods || [])]),
  chemical: uniq([...(a?.chemical || '').split(/\s*,\s*/), ...(b?.chemical || '').split(/\s*,\s*/)].map(c => c.trim())).join(', '),
  remarks: uniq([a?.remarks?.trim() || '', b?.remarks?.trim() || '']).join('; '),
});

/** Saved rows (any template) → rows keyed by the current outlet names. */
const migrateRows = (rows: Record<string, PestRow>): Record<string, PestRow> => {
  const out: Record<string, PestRow> = {};
  Object.entries(rows || {}).forEach(([key, row]) => {
    const name = key.trim();
    const targets = PEST_OUTLETS.includes(name) ? [name] : OLD_OUTLET[name] || [name];
    targets.forEach(t => { out[t] = out[t] ? mergePestRows(out[t], row) : row; });
  });
  return out;
};

/** Outlets of a sheet: the current list, plus any old outlet that has an entry. */
export const outletsOf = (sheet: PestWorksheet) =>
  [...PEST_OUTLETS, ...Object.keys(sheet.rows).filter(k => !PEST_OUTLETS.includes(k) && pestRowHasData(sheet.rows[k]))];

/** Day + Night sheets of one date → one sheet for printing (shift "Day & Night"). */
export const mergeDaySheets = (sheets: PestWorksheet[]): (PestWorksheet & { shiftLabel: string })[] => {
  const byDate = new Map<string, PestWorksheet[]>();
  sheets.forEach(s => byDate.set(s.date, [...(byDate.get(s.date) || []), s]));
  return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, list]) => {
    if (list.length === 1) return { ...list[0], shiftLabel: list[0].shift };
    const keys = uniq(list.flatMap(s => Object.keys(s.rows)));
    const join = (f: (s: PestWorksheet) => string) => uniq(list.map(s => f(s).trim())).join(' / ');
    return {
      ...list[0],
      shiftLabel: list.map(s => s.shift).join(' & '),
      rows: Object.fromEntries(keys.map(k => [k, list.reduce<PestRow | undefined>((acc, s) => (pestRowHasData(s.rows[k]) ? (acc ? mergePestRows(acc, s.rows[k]) : s.rows[k]) : acc), undefined) || emptyPestRow()])),
      extraWork: join(s => s.extraWork || ''),
      repComments: join(s => s.repComments || ''),
      technician: { name: join(s => s.technician?.name || ''), date: list[0].technician?.date || list[0].date },
      representative: { name: join(s => s.representative?.name || ''), date: list[0].representative?.date || list[0].date },
    };
  });
};

export type PestRow = { pests: string[]; methods: string[]; chemical: string; remarks: string };
export type PestWorksheet = {
  date: string;
  shift: PestShift;
  resort: string;
  rows: Record<string, PestRow>;
  extraWork: string;
  repComments: string;
  technician: { name: string; date: string };
  representative: { name: string; date: string };
  savedBy?: string;
  savedAt?: string;
};

export const emptyPestRow = (): PestRow => ({ pests: [], methods: [], chemical: '', remarks: '' });

export const emptyWorksheet = (date: string, shift: PestShift): PestWorksheet => ({
  date, shift, resort: 'SIX SENSES LAAMU',
  rows: Object.fromEntries(PEST_OUTLETS.map((o) => [o, emptyPestRow()])),
  extraWork: '', repComments: '',
  technician: { name: '', date }, representative: { name: '', date },
});

const sheetType = (date: string, shift: PestShift) => `pest_worksheet:${date}:${shift}`;

export const loadWorksheet = async (date: string, shift: PestShift): Promise<{ id: string | null; sheet: PestWorksheet }> => {
  const { data, error } = await supabase.from('hsk_constants').select('id, label').eq('type', sheetType(date, shift)).limit(1).maybeSingle();
  if (error) throw error;
  const base = emptyWorksheet(date, shift);
  if (!data) return { id: null, sheet: base };
  try {
    const parsed = JSON.parse(data.label || '{}');
    return {
      id: data.id,
      sheet: {
        ...base, ...parsed, date, shift,
        rows: { ...base.rows, ...migrateRows(parsed.rows || {}) },
        technician: { ...base.technician, ...(parsed.technician || {}) },
        representative: { ...base.representative, ...(parsed.representative || {}) },
      },
    };
  } catch {
    return { id: data.id, sheet: base };
  }
};

export const saveWorksheet = async (sheet: PestWorksheet) => {
  const type = sheetType(sheet.date, sheet.shift);
  const label = JSON.stringify({ ...sheet, savedAt: new Date().toISOString() });
  const { data: existing } = await supabase.from('hsk_constants').select('id').eq('type', type).limit(1).maybeSingle();
  const { error } = existing?.id
    ? await supabase.from('hsk_constants').update({ label }).eq('id', existing.id)
    : await supabase.from('hsk_constants').insert([{ type, label }]);
  if (error) throw error;
};

export const deleteWorksheet = async (date: string, shift: PestShift) => {
  const { error } = await supabase.from('hsk_constants').delete().eq('type', sheetType(date, shift));
  if (error) throw error;
};

// Recent saved sheets (newest first) for the history list
export const listWorksheets = async (limit = 30): Promise<{ date: string; shift: PestShift; outlets: number }[]> => {
  const { data, error } = await supabase.from('hsk_constants').select('type, label').like('type', 'pest_worksheet:%');
  if (error) throw error;
  return (data || [])
    .map((r: { type: string; label: string }) => {
      const [, date, shift] = r.type.split(':');
      let outlets = 0;
      try {
        const rows = JSON.parse(r.label || '{}').rows || {};
        outlets = Object.values(rows as Record<string, PestRow>).filter((x) => x.pests?.length || x.methods?.length || x.chemical || x.remarks).length;
      } catch { /* ignore */ }
      return { date, shift: shift as PestShift, outlets };
    })
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => (a.date === b.date ? a.shift.localeCompare(b.shift) : b.date.localeCompare(a.date)))
    .slice(0, limit);
};

const parseSheet = (date: string, shift: PestShift, label: string): PestWorksheet => {
  const base = emptyWorksheet(date, shift);
  try {
    const parsed = JSON.parse(label || '{}');
    return {
      ...base, ...parsed, date, shift,
      rows: { ...base.rows, ...migrateRows(parsed.rows || {}) },
      technician: { ...base.technician, ...(parsed.technician || {}) },
      representative: { ...base.representative, ...(parsed.representative || {}) },
    };
  } catch {
    return base;
  }
};

export const pestRowHasData = (r?: PestRow) =>
  !!r && (r.pests?.length > 0 || r.methods?.length > 0 || !!r.chemical?.trim() || !!r.remarks?.trim());

// All saved sheets between two dates (inclusive), sorted by date then Day before Night
export const loadWorksheetsInRange = async (from: string, to: string, shift: PestShift | 'Both' = 'Both'): Promise<PestWorksheet[]> => {
  const { data, error } = await supabase.from('hsk_constants').select('type, label').like('type', 'pest_worksheet:%');
  if (error) throw error;
  return (data || [])
    .map((r: { type: string; label: string }) => {
      const [, date, sh] = r.type.split(':');
      return { date, sh: sh as PestShift, label: r.label };
    })
    .filter((r) => r.date >= from && r.date <= to && (shift === 'Both' || r.sh === shift))
    .sort((a, b) => (a.date === b.date ? (a.sh === 'Day' ? -1 : 1) : a.date.localeCompare(b.date)))
    .map((r) => parseSheet(r.date, r.sh, r.label));
};

// Most recent saved sheet before `date` for the same shift (for "copy previous")
export const loadPreviousWorksheet = async (date: string, shift: PestShift): Promise<PestWorksheet | null> => {
  const { data, error } = await supabase.from('hsk_constants').select('type, label').like('type', `pest_worksheet:%:${shift}`);
  if (error) throw error;
  const prev = (data || [])
    .map((r: { type: string; label: string }) => ({ date: r.type.split(':')[1], label: r.label }))
    .filter((r) => r.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return prev ? parseSheet(prev.date, shift, prev.label) : null;
};

// Chemicals typed before, most used first (for quick-pick chips)
export const collectChemicals = (sheets: PestWorksheet[]): string[] => {
  const count = new Map<string, number>();
  sheets.forEach((s) => Object.values(s.rows).forEach((r) => {
    String(r.chemical || '').split(/[,/+]/).map((c) => c.trim()).filter(Boolean).forEach((c) => {
      const key = c.replace(/\s+/g, ' ');
      count.set(key, (count.get(key) || 0) + 1);
    });
  }));
  return Array.from(count.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c);
};

// ---------------------------------------------------------------------------------------------
// Who can open /pest-control: every admin, the shared "Pest Control" login (a non-person account),
// the garden team (Garden Supervisor / Gardeners), or anyone given the 'pest-control' module.
// ---------------------------------------------------------------------------------------------
type SessionLike = { full_name?: string; role?: string; system_role?: string; is_super_admin?: boolean; impersonating_from?: unknown; allowed_modules?: string[] } | null;

export const readSession = (): SessionLike => {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('hk_pulse_session') || 'null'); } catch { return null; }
};

export const isPestAccount = (s: SessionLike = readSession()) =>
  !!s && (/pest/i.test(s.full_name || '') || /pest/i.test(s.role || ''));

export const canUsePestControl = (s: SessionLike = readSession()): boolean => {
  if (typeof window !== 'undefined' && localStorage.getItem('hk_pulse_admin_auth') === 'true' && !s?.impersonating_from) return true;
  if (!s) return false;
  if (!s.impersonating_from && (s.system_role === 'admin' || s.is_super_admin === true)) return true;
  if (isPestAccount(s)) return true;
  if (/garden|landscap/i.test(s.role || '')) return true;
  return (s.allowed_modules || []).includes('pest-control');
};

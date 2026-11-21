// Villa fumigation log (Pest Control → Fumigation): one entry per villa per visit — villa, date, time,
// remarks, who logged it. Kept in hsk_constants (type 'villa_fumigation'), one row per entry, so no new table.
import { supabase } from '@/lib/supabase';

export const FUMIGATION_TYPE = 'villa_fumigation';
export const TOTAL_VILLAS = 97;

export type FumigationEntry = {
  id?: string;
  villa: string;      // "12"
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM ('' when not known, e.g. imported)
  remarks: string;
  by: string;
  at: string;         // when it was logged (ISO)
  source?: 'app' | 'import';
};

export const FUMIGATION_REMARKS = ['Good', 'Hole closed', 'Ants', 'Cockroach', 'Rats', 'Termites', 'Re-visit needed', 'Guest in villa'];

const parse = (r: { id: string; label: string }): FumigationEntry | null => {
  try {
    const v = JSON.parse(r.label);
    if (!v?.villa || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return null;
    return { id: r.id, villa: String(v.villa), date: v.date, time: v.time || '', remarks: v.remarks || '', by: v.by || '', at: v.at || '', source: v.source || 'app' };
  } catch { return null; }
};

export const loadFumigations = async (): Promise<FumigationEntry[]> => {
  const out: FumigationEntry[] = [];
  // Page through (Supabase returns 1000 rows at most per call)
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('hsk_constants').select('id, label').eq('type', FUMIGATION_TYPE).range(from, from + 999);
    if (error) throw error;
    (data || []).forEach(r => { const e = parse(r as { id: string; label: string }); if (e) out.push(e); });
    if (!data || data.length < 1000) break;
  }
  return out.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
};

const body = (e: FumigationEntry) => JSON.stringify({ villa: e.villa, date: e.date, time: e.time, remarks: e.remarks, by: e.by, at: e.at, source: e.source || 'app' });

export const addFumigations = async (entries: FumigationEntry[]) => {
  for (let i = 0; i < entries.length; i += 200) {
    const { error } = await supabase.from('hsk_constants').insert(entries.slice(i, i + 200).map(e => ({ type: FUMIGATION_TYPE, label: body(e) })));
    if (error) throw error;
  }
};

export const updateFumigation = async (e: FumigationEntry) => {
  if (!e.id) return;
  const { error } = await supabase.from('hsk_constants').update({ label: body(e) }).eq('id', e.id);
  if (error) throw error;
};

export const deleteFumigation = async (id: string) => {
  const { error } = await supabase.from('hsk_constants').delete().eq('id', id).eq('type', FUMIGATION_TYPE);
  if (error) throw error;
};

/** "12, 14 20-22" → ["12","14","20","21","22"] (only 1–97) */
export const parseVillaList = (raw: string): { villas: string[]; bad: string[] } => {
  const villas: string[] = []; const bad: string[] = [];
  String(raw || '').split(/[\s,;/&]+/).filter(Boolean).forEach(p => {
    const m = p.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
    if (!m) { bad.push(p); return; }
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b > TOTAL_VILLAS || b < a || b - a > 97) { bad.push(p); return; }
    for (let v = a; v <= b; v++) if (!villas.includes(String(v))) villas.push(String(v));
  });
  return { villas, bad };
};

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Last fumigation per villa (on or before `upTo`). */
export const lastByVilla = (entries: FumigationEntry[], upTo: string) => {
  const m = new Map<string, FumigationEntry>();
  entries.forEach(e => { if (e.date <= upTo && (!m.has(e.villa) || e.date > m.get(e.villa)!.date)) m.set(e.villa, e); });
  return m;
};

// Freshness bands (days since the last fumigation). Blocked villas (renovation) are their own band:
// never "due", and left out of the counts that are about active villas.
export const DUE_DAYS = 90;
export type Band = 'fresh' | 'ok' | 'soon' | 'due' | 'never' | 'blocked';
export const band = (days: number | null, blocked = false): Band =>
  blocked ? 'blocked' : days === null ? 'never' : days <= 30 ? 'fresh' : days <= 60 ? 'ok' : days <= DUE_DAYS ? 'soon' : 'due';
export const BAND_LABEL: Record<Band, string> = { fresh: '0–30 days', ok: '31–60 days', soon: '61–90 days', due: 'Over 90 days', never: 'No record', blocked: 'Blocked (renovation)' };

// ---------- blocked villas (closed for renovation etc.) ----------
export const BLOCKED_TYPE = 'fumigation_blocked';
export type BlockedVillas = { villas: string[]; note: string; since: string; by: string; at: string };
export const loadBlocked = async (): Promise<BlockedVillas> => {
  const { data, error } = await supabase.from('hsk_constants').select('label').eq('type', BLOCKED_TYPE).limit(1).maybeSingle();
  if (error) throw error;
  try { const v = JSON.parse(data?.label || '{}'); return { villas: (v.villas || []).map(String), note: v.note || '', since: v.since || '', by: v.by || '', at: v.at || '' }; }
  catch { return { villas: [], note: '', since: '', by: '', at: '' }; }
};
export const saveBlocked = async (b: BlockedVillas) => {
  const label = JSON.stringify(b);
  const { data } = await supabase.from('hsk_constants').select('id').eq('type', BLOCKED_TYPE).limit(1).maybeSingle();
  const { error } = data?.id
    ? await supabase.from('hsk_constants').update({ label }).eq('id', data.id)
    : await supabase.from('hsk_constants').insert({ type: BLOCKED_TYPE, label });
  if (error) throw error;
};
/** ["59","60",…,"82"] → "59–82" */
export const villaRanges = (villas: string[]) => {
  const n = Array.from(new Set(villas.map(Number))).filter(Boolean).sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < n.length; i++) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    out.push(j > i ? `${n[i]}–${n[j]}` : String(n[i]));
    i = j;
  }
  return out.join(', ');
};

// ---------- import of the Excel tracker ("VILLA FUMIGATION SCHEDULE — 2026") ----------
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const toIso = (raw: string, year: number): string => {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*(?:[-\s/](\d{2,4}))?$/);
  if (m) {
    const mo = MON.indexOf(m[2].toLowerCase());
    if (mo < 0) return '';
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year;
    return `${y}-${String(mo + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

/** Rows of the tracker sheet → entries. Notes go on the villa's last visit; "Prev: 30-Dec-2025" becomes a visit. */
export const parseTrackerRows = (rows: string[][]): { entries: Omit<FumigationEntry, 'by' | 'at'>[]; year: number } => {
  const title = rows.slice(0, 4).flat().join(' ');
  const year = +(title.match(/20\d{2}/)?.[0] || new Date().getFullYear());
  const head = rows.findIndex(r => /villa\s*no/i.test(String(r[0] || '')));
  if (head < 0) throw new Error('Could not find the "Villa No" column');
  const notesCol = rows[head].findIndex(c => /note|status/i.test(String(c || '')));
  const entries: Omit<FumigationEntry, 'by' | 'at'>[] = [];
  rows.slice(head + 1).forEach(r => {
    const villa = String(r[0] || '').trim();
    if (!/^\d{1,3}$/.test(villa) || +villa < 1 || +villa > TOTAL_VILLAS) return;
    const mine: Omit<FumigationEntry, 'by' | 'at'>[] = [];
    r.forEach((c, i) => {
      if (i === 0 || i === notesCol) return;
      const d = toIso(String(c || ''), year);
      if (d) mine.push({ villa, date: d, time: '', remarks: '', source: 'import' });
    });
    const note = notesCol >= 0 ? String(r[notesCol] || '').trim() : '';
    const prev = note.match(/prev[^:]*:\s*(.+)$/i);
    if (prev) { const d = toIso(prev[1], year); if (d) mine.push({ villa, date: d, time: '', remarks: 'Previous visit', source: 'import' }); }
    else if (note && mine.length) mine.sort((a, b) => a.date.localeCompare(b.date))[mine.length - 1].remarks = note.charAt(0).toUpperCase() + note.slice(1);
    entries.push(...mine);
  });
  return { entries, year };
};

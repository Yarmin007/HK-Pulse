// Daily milk requests, pasted from the WhatsApp message the jetties send:
//   Jetty - A
//   # 02 Full cream milk ( 24/11 )
//   # 38 Skim milk & Coconut milk ( 23/11) - Every 2 days
//   Beach pantry
//   NIL
// The date in brackets is the guest's check-out (checked against the guest list: all matched).
// One list per day, stored in hsk_constants (type 'milk_list', JSON) — no extra table needed.
import { supabase } from '@/lib/supabase';
import { pantryOfVilla } from '@/lib/pantrySupply';

export type MilkEntry = { villa: string; items: string[]; until: string; note: string; line: string };
export type MilkList = { date: string; entries: MilkEntry[]; raw: string; saved_by?: string; saved_at?: string };
const TYPE = 'milk_list';

const pad = (n: number) => String(n).padStart(2, '0');
// dd/mm → the nearest date on or after `ref` (a check-out is never long before today)
const untilIso = (d: number, m: number, ref: string) => {
  const y = +ref.slice(0, 4);
  let iso = `${y}-${pad(m)}-${pad(d)}`;
  if (iso < ref && (Date.parse(ref) - Date.parse(iso)) / 86400000 > 60) iso = `${y + 1}-${pad(m)}-${pad(d)}`;
  return iso;
};

// "Skim milk" / "skimmed" → Skimmed milk; "full cream" → Full cream milk; keeps anything else readable
export const milkName = (raw: string) => {
  const t = raw.trim().replace(/\s+/g, ' ').replace(/[‘’`]/g, "'");
  const l = t.toLowerCase();
  if (/skim/.test(l)) return 'Skimmed milk';
  if (/full\s*cream|whole\s*milk$/.test(l)) return 'Full cream milk';
  if (/coconut/.test(l)) return 'Coconut milk';
  if (/almond/.test(l)) return 'Almond milk';
  if (/oat/.test(l)) return 'Oat milk';
  if (/soy/.test(l)) return 'Soy milk';
  if (/lactose/.test(l)) return 'Lactose-free milk';
  if (/pasteuri[sz]ed.*cow|cow.*pasteuri[sz]ed/.test(l)) return "Pasteurised whole cow's milk";
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const parseMilkMessage = (text: string, ref: string): { entries: MilkEntry[]; skipped: string[] } => {
  const entries: MilkEntry[] = [];
  const skipped: string[] = [];
  String(text || '').split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    // Section titles ("Jetty - A", "Beach pantry") and "NIL" carry no villa
    if (/^(?:j?e?tty|jetty|beach|pantry)\b/i.test(line) || /^nil$/i.test(line) || /^#?\s*nil\s*$/i.test(line)) return;
    const m = line.match(/^#?\s*v?\s*(\d{1,2})\s*[-.:]?\s+(.+?)\s*\(\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*\)\s*(?:[-–,]\s*(.+))?$/i);
    if (!m) { skipped.push(line); return; }
    const villa = String(parseInt(m[1], 10));
    const items = m[2].split(/\s*(?:&|\+|,|\band\b)\s*/i).map(milkName).filter(Boolean);
    entries.push({ villa, items: [...new Set(items)], until: untilIso(+m[3], +m[4], ref), note: (m[5] || '').trim(), line });
  });
  return { entries, skipped };
};

export const loadMilkList = async (date: string): Promise<MilkList | null> => {
  const { data } = await supabase.from('hsk_constants').select('label').eq('type', TYPE).ilike('label', `%"date":"${date}"%`).limit(1).maybeSingle();
  try { return data ? (JSON.parse(data.label) as MilkList) : null; } catch { return null; }
};

export const saveMilkList = async (list: MilkList) => {
  const { error: delErr } = await supabase.from('hsk_constants').delete().eq('type', TYPE).ilike('label', `%"date":"${list.date}"%`);
  if (delErr) throw delErr;
  if (!list.entries.length && !list.raw.trim()) return;
  const { error } = await supabase.from('hsk_constants').insert([{ type: TYPE, label: JSON.stringify(list) }]);
  if (error) throw error;
};

// Every saved day between two dates (for a guest's stay)
export const loadMilkRange = async (from: string, to: string): Promise<MilkList[]> => {
  const { data } = await supabase.from('hsk_constants').select('label').eq('type', TYPE);
  return (data || []).map((r: { label: string }) => { try { return JSON.parse(r.label) as MilkList; } catch { return null; } })
    .filter((l): l is MilkList => !!l && l.date >= from && l.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const groupByPantry = (entries: MilkEntry[]) => {
  const g: Record<string, MilkEntry[]> = {};
  entries.forEach(e => { const p = pantryOfVilla(e.villa) || 'Other'; (g[p] ||= []).push(e); });
  Object.values(g).forEach(list => list.sort((a, b) => +a.villa - +b.villa));
  return g;
};

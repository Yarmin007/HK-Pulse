// Pre-arrival form (the PDF some guests send back to reservations): only what housekeeping needs is kept:
// celebration, diet & allergies, minibar requests, comfort items, pillow fragrance, in-villa entertainment,
// additional bedding and other preferences. Passport, contact, flights and activity interests are ignored.
// Saved per stay in hsk_constants (type 'pre_arrival'), one row per stay.
import { supabase } from '@/lib/supabase';
import { splitHkNotes, type HkNote } from '@/lib/hkNotes';

export const PRE_ARRIVAL_TYPE = 'pre_arrival';

export const PA_DIET = ['Vegan', 'Vegetarian', 'Dairy free', 'Gluten free'];
export const PA_MINIBAR = ['No alcohol in minibar', 'Empty minibar'];
export const PA_COMFORT = [
  'Alarm clock', 'Anti-slip mat for bathtub', 'Bathroom scale', 'Bed firming board', 'Comb', 'Earplugs', 'Magnifying mirror',
  'Nail clipper', 'Prayer mat with compass', 'Pumice stone', 'Sewing kit', 'Shaving kit', 'Shoe mitten', 'Shoe shine',
  'Eye mask', 'First aid supplies', 'Hot water bag', 'Ice', 'Toothbrush and paste', 'Yoga mat',
];
export const PA_SCENTS = ['Lemongrass', 'Ylang Ylang', 'Lavender', 'Peppermint'];
export const PA_ENTERTAINMENT = ['Music', 'Movies', 'WiFi'];

export type PreArrival = {
  stay_key: string; villa: string; arr: string;
  celebration: string; celebration_date: string;
  diet: string[]; allergies: string;
  minibar: string[];
  comfort: string[]; ice_time: string;      // daily ice, 'HH:MM'
  service_morning: string; service_td: string; // preferred service times, 'HH:MM'
  pillow: { scent: string; freq: 'Once' | 'Daily' | '' }[];
  entertainment: string[];
  bedding: string;
  other: string;
  six_senses_before: string;
  file_name: string; saved_by: string; saved_at: string;
  _id?: string;
};

export const emptyPreArrival = (stay: { key: string; villa: string; arr: string }): PreArrival => ({
  stay_key: stay.key, villa: stay.villa, arr: stay.arr,
  celebration: '', celebration_date: '', diet: [], allergies: '', minibar: [], comfort: [], ice_time: '', service_morning: '', service_td: '',
  pillow: [], entertainment: [], bedding: '', other: '', six_senses_before: '', file_name: '', saved_by: '', saved_at: '',
});

// ---------- reading the PDF ----------
// Field names of the Six Senses Laamu form. Other versions fall back to the label printed next to the box.
const CHECK_MAP: Record<string, [keyof PreArrival, string]> = {
  'Check Box12': ['entertainment', 'Music'], 'Check Box13': ['entertainment', 'Movies'], 'Check Box14': ['entertainment', 'WiFi'],
  'Check Box15': ['diet', 'Vegan'], 'Check Box16': ['diet', 'Vegetarian'], 'Check Box17': ['diet', 'Dairy free'], 'Check Box18': ['diet', 'Gluten free'],
  'Check Box21': ['minibar', 'No alcohol in minibar'], 'Check Box22': ['minibar', 'Empty minibar'],
  'Check Box23': ['comfort', 'Alarm clock'], 'Check Box24': ['comfort', 'Anti-slip mat for bathtub'], 'Check Box25': ['comfort', 'Bathroom scale'],
  'Check Box26': ['comfort', 'Bed firming board'], 'Check Box27': ['comfort', 'Comb'], 'Check Box28': ['comfort', 'Earplugs'], 'Check Box41': ['comfort', 'Magnifying mirror'],
  'Check Box33': ['comfort', 'Nail clipper'], 'Check Box34': ['comfort', 'Prayer mat with compass'], 'Check Box35': ['comfort', 'Pumice stone'],
  'Check Box36': ['comfort', 'Sewing kit'], 'Check Box37': ['comfort', 'Shaving kit'], 'Check Box38': ['comfort', 'Shoe mitten'], 'Check Box42': ['comfort', 'Shoe shine'],
  'Check Box29': ['comfort', 'Eye mask'], 'Check Box30': ['comfort', 'First aid supplies'], 'Check Box31': ['comfort', 'Hot water bag'],
  'Check Box32': ['comfort', 'Ice'], 'Check Box39': ['comfort', 'Toothbrush and paste'], 'Check Box40': ['comfort', 'Yoga mat'],
};
// Pillow fragrance: [scent, frequency]
const PILLOW_MAP: Record<string, [string, 'Once' | 'Daily' | '']> = {
  'Check Box43': ['Lemongrass', ''], 'Check Box44': ['Lemongrass', 'Once'], 'Check Box45': ['Lemongrass', 'Daily'],
  'Check Box46': ['Ylang Ylang', ''], 'Check Box47': ['Ylang Ylang', 'Once'], 'Check Box48': ['Ylang Ylang', 'Daily'],
  'Check Box49': ['Lavender', ''], 'Check Box50': ['Lavender', 'Once'], 'Check Box51': ['Lavender', 'Daily'],
  'Check Box52': ['Peppermint', ''], 'Check Box53': ['Peppermint', 'Once'], 'Check Box54': ['Peppermint', 'Daily'],
};
const TEXT_MAP: Record<string, keyof PreArrival> = {
  Box32: 'celebration', Box33: 'celebration_date', Box35: 'bedding', Box36: 'allergies', Box39: 'ice_h', Box40: 'ice_m', Box41: 'other', Box43: 'six_senses_before',
} as any;
const NAME_FIELDS = ['Box3', 'Box13'];   // surnames: only used to check the form belongs to this stay, never saved

// Some labels in the form are stored in a shifted font encoding ("<RJD 0DW" = "Yoga Mat")
const decode = (s: string) => {
  if (/[a-z]/.test(s) || s.trim().length < 3) return s;
  const d = [...s].map(c => (c === ' ' ? ' ' : String.fromCharCode(c.charCodeAt(0) + 29))).join('');
  return /^[A-Za-z][A-Za-z ,.&()'-]+$/.test(d) ? d : s;
};
/** "9.30", "09:30", "0930", "9:30 pm", "18h30" → "HH:MM" (24h), or '' */
export const normTime = (raw: string) => {
  const s = String(raw || '').trim().toLowerCase();
  const m = s.match(/(\d{1,2})\s*[:.h]?\s*(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!m) return '';
  let h = Number(m[1]); const min = Number(m[2] || 0);
  if (/^p/.test(m[3] || '') && h < 12) h += 12;
  if (/^a/.test(m[3] || '') && h === 12) h = 0;
  return h > 23 || min > 59 ? '' : `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};
// Text boxes of other form versions, by the label printed before them
const TEXT_LABELS: [RegExp, string][] = [
  [/morning|a\.?m\.? service|daily service|housekeeping service/i, 'service_morning'],
  [/turn ?-?down|\btd\b|evening|night service/i, 'service_td'],
  [/\bice\b/i, 'ice_time'],
  [/celebrat|occasion/i, 'celebration'],
  [/allerg/i, 'allergies'],
  [/bedding/i, 'bedding'],
];
const TIME_KEYS = ['service_morning', 'service_td', 'ice_time'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const findOption = (label: string, options: string[]) => {
  const n = norm(label);
  return options.find(o => n && (norm(o) === n || n.startsWith(norm(o)) || norm(o).startsWith(n))) || '';
};
const isChecked = (a: any) => a.checkBox && a.fieldValue && a.fieldValue !== 'Off';

export type ParsedForm = { data: Partial<PreArrival>; surnames: string[]; recognised: number };

export const readPreArrivalPdf = async (file: File, lib?: any): Promise<ParsedForm> => {
  const pdfjs: any = lib || await import('pdfjs-dist');
  if (!lib) pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  const d: any = { diet: [], minibar: [], comfort: [], entertainment: [], pillow: [] };
  const surnames: string[] = [];
  let recognised = 0, iceH = '', iceM = '';
  const addTo = (k: string, v: string) => { if (v && !d[k].includes(v)) d[k].push(v); };
  const addPillow = (scent: string, freq: 'Once' | 'Daily' | '') => {
    const e = d.pillow.find((p: any) => p.scent === scent);
    if (e) { if (freq) e.freq = freq; } else d.pillow.push({ scent, freq });
  };

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const [anns, tc] = await Promise.all([page.getAnnotations(), page.getTextContent()]);
    const texts = (tc.items as any[]).filter(i => String(i.str || '').trim()).map(i => ({ x: i.transform[4], y: i.transform[5], s: decode(String(i.str).trim()) }));
    // The label printed just right of a tick box (same line)
    const labelRight = (r: number[]) => texts.filter(t => Math.abs(t.y - (r[1] + 2)) < 6 && t.x > r[2] - 2 && t.x - r[2] < 60).sort((a, b) => a.x - b.x)[0]?.s || '';
    // The label before a text box on its line, skipping "h" / "m" / ":" between hour and minute boxes
    const labelBefore = (r: number[]) => texts.filter(t => Math.abs(t.y - (r[1] + 3)) < 7 && t.x < r[0] && !/^(h|m|hrs?|mins?|:|time)$/i.test(t.s.replace(/[:\s]/g, '') || ':')).sort((a, b) => b.x - a.x)[0]?.s || '';
    const extra: Record<string, { x: number; v: string }[]> = {};
    const labelLeftOnRow = (r: number[], pick: (s: string) => boolean) => texts.filter(t => Math.abs(t.y - (r[1] + 2)) < 6 && t.x < r[0] && pick(t.s)).sort((a, b) => b.x - a.x)[0]?.s || '';

    for (const a of anns as any[]) {
      if (!a.fieldName) continue;
      const name = String(a.fieldName);
      if (a.fieldType === 'Tx') {
        const v = String(a.fieldValue || '').trim();
        if (NAME_FIELDS.includes(name) && v) surnames.push(v);
        const key = (TEXT_MAP as any)[name];
        if (!key) {
          // Unknown version: service / ice times, celebration... by their label (passport, contact, flights are skipped)
          const k = v ? TEXT_LABELS.find(([re]) => re.test(labelBefore(a.rect)))?.[1] : undefined;
          if (k) (extra[k] ||= []).push({ x: a.rect[0], v });
          continue;
        }
        recognised++;
        if (!v || /^(n\/?a|none|not applicable|-)$/i.test(v)) continue;
        if (key === 'ice_h') iceH = v; else if (key === 'ice_m') iceM = v; else d[key] = v;
        continue;
      }
      if (!a.checkBox) continue;
      if (CHECK_MAP[name] || PILLOW_MAP[name]) recognised++;
      if (!isChecked(a)) continue;
      if (CHECK_MAP[name]) { addTo(CHECK_MAP[name][0] as string, CHECK_MAP[name][1]); continue; }
      if (PILLOW_MAP[name]) { addPillow(...PILLOW_MAP[name]); continue; }
      // Unknown form version: use the printed label
      const label = labelRight(a.rect);
      if (/^(once|daily)$/i.test(label)) {
        const scent = findOption(labelLeftOnRow(a.rect, s => !!findOption(s, PA_SCENTS)), PA_SCENTS);
        if (scent) { addPillow(scent, /once/i.test(label) ? 'Once' : 'Daily'); recognised++; }
        continue;
      }
      const opt = (list: string[], key: string) => { const o = findOption(label, list); if (o) { addTo(key, o); recognised++; } return !!o; };
      if (opt(PA_DIET, 'diet') || opt(PA_COMFORT, 'comfort') || opt(PA_ENTERTAINMENT, 'entertainment')) continue;
      if (/no alcohol/i.test(label)) addTo('minibar', 'No alcohol in minibar');
      else if (/empty mini/i.test(label)) addTo('minibar', 'Empty minibar');
      else { const sc = findOption(label, PA_SCENTS); if (sc) addPillow(sc, ''); }
    }
    // Hour + minute boxes after one label become one time
    Object.entries(extra).forEach(([k, parts]) => {
      const vals = parts.sort((a, b) => a.x - b.x).map(p => p.v);
      const v = TIME_KEYS.includes(k) ? normTime(vals.length === 2 && /^\d{1,2}$/.test(vals[0]) ? `${vals[0]}:${vals[1]}` : vals.join(' ')) : vals.join(' ');
      if (v && !d[k]) { d[k] = v; recognised++; }
    });
  }
  if (iceH || iceM) d.ice_time = normTime(`${iceH || '0'}:${(iceM || '00').padStart(2, '0')}`);
  if (d.ice_time && !d.comfort.includes('Ice')) d.comfort.push('Ice');
  return { data: d, surnames, recognised };
};

// ---------- storage ----------
export const loadPreArrivals = async (filter?: { stayKey?: string }): Promise<PreArrival[]> => {
  let q = supabase.from('hsk_constants').select('id, label').eq('type', PRE_ARRIVAL_TYPE);
  if (filter?.stayKey) q = q.ilike('label', `%"stay_key":${JSON.stringify(filter.stayKey).replace(/[%_]/g, m => `\\${m}`)}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).flatMap((r: any) => { try { return [{ ...JSON.parse(r.label), _id: r.id } as PreArrival]; } catch { return []; } });
};

export const savePreArrival = async (pa: PreArrival): Promise<PreArrival> => {
  const { _id, ...body } = pa;
  const label = JSON.stringify(body);
  if (_id) {
    const { error } = await supabase.from('hsk_constants').update({ label }).eq('id', _id);
    if (error) throw error;
    return pa;
  }
  const { data, error } = await supabase.from('hsk_constants').insert({ type: PRE_ARRIVAL_TYPE, label }).select('id').single();
  if (error) throw error;
  return { ...body, _id: data.id };
};

export const deletePreArrival = async (id: string) => {
  const { error } = await supabase.from('hsk_constants').delete().eq('id', id);
  if (error) throw error;
};

/** The form as housekeeping notes (same categories as the memo notes). */
export const preArrivalNotes = (pa: PreArrival | null | undefined): HkNote[] => {
  if (!pa) return [];
  const out: HkNote[] = [];
  if (pa.celebration) out.push({ cat: 'occasion', text: `${pa.celebration}${pa.celebration_date ? ` (${pa.celebration_date})` : ''}` });
  if (pa.diet.length) out.push({ cat: 'diet', text: pa.diet.join(', ') });
  if (pa.allergies) out.push({ cat: 'diet', text: `Allergies: ${pa.allergies}` });
  pa.minibar.forEach(m => out.push({ cat: 'minibar', text: m }));
  const items = pa.comfort.filter(c => c !== 'Ice');
  if (items.length) out.push({ cat: 'setup', text: `Place in villa: ${items.join(', ')}` });
  if (pa.service_morning) out.push({ cat: 'service', text: `Morning service at ${pa.service_morning}` });
  if (pa.service_td) out.push({ cat: 'service', text: `Turndown at ${pa.service_td}` });
  if (pa.comfort.includes('Ice') || pa.ice_time) out.push({ cat: 'setup', text: `Daily ice${pa.ice_time ? ` at ${pa.ice_time}` : ''}` });
  pa.pillow.forEach(p => out.push({ cat: 'setup', text: `Pillow fragrance: ${p.scent}${p.freq ? ` (${p.freq.toLowerCase()})` : ''}` }));
  if (pa.bedding) out.push({ cat: 'kids', text: `Additional bedding: ${pa.bedding}` });
  if (pa.entertainment.length) out.push({ cat: 'other', text: `In-villa entertainment: ${pa.entertainment.join(', ')}` });
  if (pa.other) splitHkNotes([pa.other]).keep.forEach(n => out.push(n));
  if (pa.six_senses_before) out.push({ cat: 'repeat', text: `Stayed at Six Senses before: ${pa.six_senses_before}` });
  return out;
};

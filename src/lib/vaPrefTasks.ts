// Which guest notes become a VA task, and on which day.
//   Every day    pre-arrival service / turndown / ice times; pillow fragrance at turndown (one scent once = arrival only,
//                daily = every turndown, several scents = a different one each day)
//   Arrival day  repeater banner (returning to this resort), anniversary / birthday bed runner (no date given),
//                bedding (pillows, duvet, twin beds, extra bed), baby cot / high chair / sterilizer,
//                minibar (no alcohol, empty, extra items, discount, not in the package), nut or gluten (beer),
//                in-villa items (iron, bathroom scale...), the pre-arrival form's items
//   On the date  a dated birthday / anniversary ("Celebrating Annette's birthday on 23 Nov") → bed runner that day
// Not tasks (still in Guest History): welcome notes / photos / cakes / wine / amenities (not housekeeping), other diets,
// VIP, honeymoon, Six Senses (other resort) repeaters, what the guest travels with (car seat, pushchair, surfboard),
// anything already celebrated ("Celebrated ...").
import type { PreArrival } from '@/lib/preArrival';

export type PrefTask = { title: string; detail?: string };

const NUTS = /\bnuts?\b|nut[- ]free|peanut|almond|cashew|walnut|hazelnut|pistachio|pecan|macadamia/i;
const GLUTEN = /gluten|celiac|coeliac/i;
const REPEATER = /\d+\s*(st|nd|rd|th)\s+(time\s+)?return(ing|ed)|return(ing|ed) guests?|\brepeat(er|ers)?\b(?! benefit)/i;
const OTHER_RESORT = /six senses repeaters?(\s*\([^)]*\))?/gi;
const BEDDING = /pillow|duvet|blanket|twin bed|extra bed|rollaway|sofa bed|mattress|bed firm|feather|hypoallergenic|bed linen/i;
const KIDS_KIT = /\bcot\b|crib|high ?chair|steril[iz]|baby bath|bed guard|bed rail|potty|nappy bin|diaper bin/i;
const ITEMS = /\biron(ing)?\b|iron ?board|scale|hair ?dryer|kettle|humidifier|adapter|yoga mat|mosquito|extra towels?|bath ?robe|slippers|magnifying mirror|alarm clock|ear ?plugs|eye mask|prayer mat|hot water bag|toothbrush|shaving kit/i;
const NOT_HK = /welcome note|note from|framed|photo|card|cake|sparkling|champagne|prosecco|wine|amenit|platter|bicycle|\bgift\b|travel(l)?ing with|own (dive|gear)|surfboard|car seat|push ?chair|stroller|pram|luggage|\bmilk\b/i;
const MINIBAR = /mini ?bar/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "23 Nov", "23rd of November", "Nov 5th", "23/11" → a YYYY-MM-DD inside the stay, or ''. */
export const occasionDate = (text: string, arr: string, dep: string): string => {
  let d = 0, m = 0;
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
  const a = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${mon}`, 'i'));
  const b = text.match(new RegExp(`\\b${mon}\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
  const c = text.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.]\d{2,4})?\b/);
  if (a) { d = +a[1]; m = MONTHS.indexOf(a[2].toLowerCase()) + 1; }
  else if (b) { d = +b[2]; m = MONTHS.indexOf(b[1].toLowerCase()) + 1; }
  else if (c) { d = +c[1]; m = +c[2]; }
  if (!d || !m || d > 31 || m > 12 || !arr) return '';
  const end = dep || arr;
  const y = +arr.slice(0, 4);
  for (const yy of [y, y + 1]) {
    const iso = `${yy}-${pad(m)}-${pad(d)}`;
    if (iso >= arr && iso <= end) return iso;
  }
  return '';
};

const short = (s: string) => s.length > 90 ? `${s.slice(0, 88)}…` : s;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tidy = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s,;.\-•:]+|[\s,;\-•:.]+$/g, '').trim();
/** "Req for two additional firm pillows" → "Two additional firm pillows" */
const asTask = (s: string) => cap(tidy(s.replace(/^(?:villa\s*)?#\s?\d+\s*[-:]\s*/i, '').replace(/\s*\(?#\s?\d+\)?\s*$/, '').replace(/^\s*(guests?\s+)?(strong\s+)?(req(uested|uest)?s?|asked)\b\.?\s*(for\s+|to\s+have\s+|to\s+)?(a\s+|an\s+)?/i, '').replace(/^to\s+/i, '')));

/** Memo → lines (newline, bullet, sentence end), each with the villa it is tagged to ("#43 - ...", "(#43)"), if any. */
const linesOf = (texts: (string | null | undefined)[]) => texts
  .flatMap(t => String(t || '').replace(/\[DEP_INFO\].*?\[\/DEP_INFO\]/g, '')
    .split(/\n|•|<br\s*\/?>|(?<=[a-z0-9)’'"])(?<!\b(?:Mr|Mrs|Ms|Mx|Dr|Prof|Jr|Sr|St|vs|No))[.?!]\s+(?=[A-Z#])/i))
  .map(tidy).filter(Boolean)
  .map(text => {
    const tag = text.match(/^(?:villa\s*)?#\s?(\d+)\s*[-:]|\(#\s?(\d+)\)/i);
    return { text, villa: tag ? (tag[1] || tag[2]) : '' };
  });

/** A line → clauses: commas, semicolons, " - ", and " and " before a new request ("... and extra pillows and to empty ..."). */
const clausesOf = (line: string) => {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    const dash = c === '-' && line[i - 1] === ' ' && line[i + 1] === ' ';
    if (depth === 0 && (c === ',' || c === ';' || dash)) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.flatMap(p => p.split(/\s+and\s+(?=(?:req|extra|to\s|empty|an?\s|no\s|two\s|additional))/i)).map(tidy).filter(Boolean);
};

/**
 * The preference tasks for one villa on `date`.
 * `notes` = the guest-list texts (preferences, remarks, the stay's memo lines); `pa` = the pre-arrival form.
 */
export const prefTasksFor = (date: string, villa: string, stay: { arr: string; dep: string } | null, notes: (string | null | undefined)[], pa?: PreArrival | null): PrefTask[] => {
  const out: PrefTask[] = [];
  const seen = new Set<string>();
  const push = (title: string, detail?: string) => {
    const k = title.toLowerCase();
    if (!title || seen.has(k)) return;
    seen.add(k); out.push({ title, ...(detail && detail !== title ? { detail: short(detail) } : {}) });
  };
  const arr = stay?.arr || pa?.arr || '';
  const dep = stay?.dep || '';
  const lines = linesOf([...notes, pa?.other]).filter(l => !l.villa || l.villa === String(villa));

  // Every day: times from the pre-arrival form
  if (pa?.service_morning) push(`Morning service at ${pa.service_morning}`);
  if (pa?.service_td) push(`Turndown at ${pa.service_td}`);
  if (pa && (pa.ice_time || pa.comfort.includes('Ice'))) push(`Daily ice${pa.ice_time ? ` at ${pa.ice_time}` : ''}`);
  // Pillow fragrance is always at turndown: one scent once → arrival day; one scent daily → every turndown;
  // more than one scent → every turndown, a different one each day (in turn)
  const scents = pa?.pillow.map(p => p.scent).filter(Boolean) || [];
  if (scents.length > 1 && arr) {
    const day = Math.max(0, Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${arr}T12:00:00Z`)) / 86400000));
    push(`Turndown: ${scents[day % scents.length]} pillow fragrance`, `Changes every day: ${scents.join(' → ')}`);
  } else if (scents.length === 1 && pa!.pillow[0].freq === 'Daily') push(`Turndown: ${scents[0]} pillow fragrance`, 'Every turndown');
  else if (scents.length === 1 && arr === date) push(`Turndown: ${scents[0]} pillow fragrance`, 'Arrival day only');

  // Birthday / anniversary bed runner: on its date, or on arrival when no date is given ("Celebrated ..." = already done)
  const occasions = [
    ...lines.map(l => l.text).filter(t => /birthday|b'?day|anniversar/i.test(t) && !/\bcelebrated\b/i.test(t)),
    ...(pa?.celebration ? [`${pa.celebration} ${pa.celebration_date}`] : []),
  ];
  occasions.forEach(t => {
    if ((occasionDate(t, arr, dep) || arr) !== date) return;
    push(/anniversar/i.test(t) && !/birthday|b'?day/i.test(t) ? 'Put anniversary bed runner' : 'Put birthday bed runner', t);
  });

  if (!arr || arr !== date) return out;

  // ── Arrival day only ──
  const rep = lines.find(l => REPEATER.test(l.text.replace(OTHER_RESORT, '')));
  if (rep) {
    const n = rep.text.match(/(\d+)\s*(st|nd|rd|th)\s+(time\s+)?return/i);
    push(n ? `Put repeater banner (${n[1]}${n[2]} stay)` : 'Put repeater banner', rep.text);
  }

  // Nut allergy / gluten (beer)
  const dietText = [...lines.map(l => l.text), ...(pa ? [...pa.diet, pa.allergies] : [])].filter(Boolean);
  const nut = dietText.find(t => NUTS.test(t) && !/coconut/i.test(t));
  const gluten = dietText.find(t => GLUTEN.test(t));
  if (nut) push('Nut allergy: no nuts in the minibar / villa', nut);
  if (gluten) push('Gluten free: take the beer out of the minibar', gluten);

  // Minibar in the package: not included / discount
  lines.forEach(({ text }, i) => {
    if (!MINIBAR.test(text)) return;
    const prev = lines[i - 1]?.text || '';
    if (/exclud(es|ing)?$|not applicable on$|not included$/i.test(prev)) { push('Minibar not in the package (chargeable)', `${prev} ${text}`); return; }
    if (/exclud|not applicable|not included|chargeable/i.test(text)) push('Minibar not in the package (chargeable)', text);
    else if (/discount|\d+\s?%/i.test(text)) push(`Minibar discount: ${text.match(/\d+\s?%/)?.[0] || 'see note'}`, text);
    else if (/inclusive|included|complimentary|\bcomp\b/i.test(text) && !/\bno alcohol|empty/i.test(text)) push('Minibar included in the package', text);
  });

  // Clause by clause: minibar requests, bedding, kids' equipment, in-villa items
  lines.forEach(({ text }, i) => {
    if (MINIBAR.test(text) && /exclud(es|ing)?$|not applicable on$|not included$/i.test(lines[i - 1]?.text || '')) return;
    if (MINIBAR.test(text) && /exclud|not applicable|not included|chargeable|discount|%|inclusive|included/i.test(text)) return;
    clausesOf(text).forEach(c => {
      if (NUTS.test(c) || GLUTEN.test(c)) return;
      if (MINIBAR.test(c)) { push(asTask(c), text); return; }
      if (NOT_HK.test(c)) return;
      if (BEDDING.test(c) || KIDS_KIT.test(c) || ITEMS.test(c)) push(asTask(c), text);
    });
  });

  if (pa) {
    pa.minibar.forEach(m => push(m));
    const items = pa.comfort.filter(c => c !== 'Ice');
    if (items.length) push(`Place in villa: ${items.join(', ')}`);
    if (pa.bedding) push(`Bedding: ${pa.bedding}`);
    if (pa.entertainment.length) push(`In-villa entertainment: ${pa.entertainment.join(', ')}`);
  }
  return out;
};


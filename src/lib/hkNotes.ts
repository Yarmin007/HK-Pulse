// Guest notes come straight from the Front Office memo: rates, tax, payments, spa / excursion benefits,
// transfers, upgrades, check-in times... Housekeeping only needs what changes the villa or the service:
// allergies & diet, occasions, in-villa set-up & amenities, kids' equipment, minibar instructions, repeaters.
// splitHkNotes() keeps those (with a category) and puts everything else in `hidden` (still viewable).

export type HkCat = 'diet' | 'occasion' | 'setup' | 'kids' | 'minibar' | 'repeat' | 'service' | 'other';
export type HkNote = { text: string; cat: HkCat };

export const HK_CAT_LABEL: Record<HkCat, string> = {
  diet: 'Allergy & diet', occasion: 'Occasion', setup: 'In-villa set-up', kids: 'Kids & baby',
  minibar: 'Minibar', repeat: 'Repeat / VIP', service: 'Service', other: 'Note',
};
export const HK_CAT_ORDER: HkCat[] = ['diet', 'minibar', 'occasion', 'setup', 'kids', 'service', 'repeat', 'other'];

// Not housekeeping: money, front office, reservations, transport, spa / activities, room allocation
const JUNK = new RegExp([
  'tax', 'pymt', 'payment', '\\bpaid\\b', '\\busd\\b', '\\$\\s?\\d', 'invoice', '\\brate\\b', 'price', 'deposit', 'credit card', 'billing', 'folio', 'voucher',
  'resort credit', 'discount', '\\d+\\s?%', 'f&b credit', 'dining credit',
  'split stay', 'booking', 'reservation', 'confirmation', '#\\s?\\d{5,}', '\\b\\d{6,}\\b',
  'transfer', 'seaplane', 'speed ?boat', 'domestic flight', 'airport', '\\bflight', 'arrival form', 'pre[- ]?arrival', 'passport', 'visa',
  '\\bspa\\b', 'massage', 'body scrub', 'facial', 'treatment', 'dolphin', 'cruise', 'excursion', 'snorkel', '\\bdiv(e|ing)\\b', 'sandbank', 'fishing', 'yoga', 'activity', 'activities',
  'dinner', 'lunch(?! box)', 'breakfast', 'restaurant', 'pre-?booked', 'beverages? inclusive', 'all[- ]inclusive', '\\bfb basis', '\\bhb basis', '\\bbb basis', 'meal plan',
  'upgrade', 'subject to availab', 'early check', 'late check', '\\blco\\b', '\\beci\\b', 'check[- ]?in', 'check[- ]?out', 'comp nights?', 'nights? on',
  'requested villa', 'req(uested)? (a |the )?(villa|room)', 'same villa', 'villa on jetty', 'jetty', 'further out', 'quiet (room|villa)', 'good views?', 'connecting',
  '\\bta\\b', 'travel agent', 'tour operator', 'general manager', '\\bgm\\b', 'ground operations', 'diamond ambassador', 'ambassador', 'club benefits?',
  'smith benefits?', 'tablet hotel', 'virtuoso', 'amex', 'fine hotels', 'luxury circle',
  'wellness platter', 'platter', 'handwritten card', 'bicycle tags?', 'bike tags?', '\\bcake\\b', 'dep(arture)? gif', 'welcome note', 'framed photo',
  'welcome amenit', 'sparkling wine', 'bottle of champagne', 'prosecco', 'personali[sz]ed amenit',
  'luggage', 'baggage', 'excess', 'experiences?', 'f&b', '\\d+\\.\\d{2}', '\\bbc\\s?\\d', '\\bhrs\\b', 'villa away', 'sea ?view', 'allocate', 'gem\\b',
].join('|'), 'i');

const CATS: [HkCat, RegExp][] = [
  ['minibar', /minibar|mini bar/i],
  ['diet', /diet|red meat|(does not|doesn.t|prefers not to|won.t) eat|allerg|intoleran|celiac|coeliac|gluten|lactose|dairy|vegan|vegetarian|pescatarian|\bnuts?\b|peanut|shellfish|seafood|halal|kosher|no pork|no beef|diabet|pregnan|sugar[- ]free/i],
  ['minibar', /minibar|mini bar|no alcohol|non[- ]alcoholic|alcohol free|soft drinks?|\bbeer\b|\bcoke\b|water (only|bottles?)/i],
  ['occasion', /honeymoon|birthday|b'?day|anniversar|wedding|celebrat|proposal|engage|babymoon|graduation|retire|surprise/i],
  ['kids', /\bcot\b|crib|high ?chair|baby|infant|toddler|child|kids?\b|push ?chair|stroller|pram|car seat|bottle steril|nappy|diaper|extra bed|rollaway|sofa bed/i],
  ['setup', /cake|wine|champagne|sparkling|prosecco|welcome (note|card|amenit)|handwritten|card|photo|frame|fruit|platter|amenit|bicycle|bike|flower|petal|decorat|balloon|turn ?down|pillow|duvet|blanket|twin|king bed|double bed|hypoallergenic|feather|towel|\bbath|\brobes?\b|slipper|gift|chocolate|cookies|dep(arture)? gift/i],
  ['repeat', /\bv?vip|repeat|returning|loyal|\d+(st|nd|rd|th) (time|visit|stay)|last visit|stayed in villa/i],
  ['service', /^service\s*:|service day|do not disturb|no service|dnd/i],
];

const LABEL_PREFIX = /^\s*(smith benefits?|tablet hotel benefits?|added values?|benefits?|hum club benefits?|[a-z ]{2,30} benefits?|welcome amenity)\s*[:,-]\s*/i;
const clean = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s,;.\-•]+|[\s,;\-•]+$/g, '').trim();
const catOf = (s: string): HkCat => CATS.find(([, re]) => re.test(s))?.[0] || 'other';

/** Split on commas, semicolons and " - " that are not inside brackets. */
const clauses = (line: string) => {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    const dash = c === '-' && (line[i - 1] === ' ' || line[i + 1] === ' ') && /\D/.test(line[i - 1] || ' ') && /\D/.test(line[i + 1] || ' ');
    if (depth === 0 && (c === ',' || c === ';' || dash)) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(clean).filter(Boolean);
};

const isNoise = (s: string) => s.length < 3 || /^\d[\d\s,.#/-]*$/.test(s) || /^(benefits?|welcome amenity|added values?|vip's?)$/i.test(s);

/**
 * One note (a memo line or a whole preferences text) → housekeeping notes + hidden front-office lines.
 * A line with nothing front-office in it is kept whole; a mixed line keeps only its housekeeping parts.
 */
export const splitHkNotes = (texts: (string | null | undefined)[]): { keep: HkNote[]; hidden: string[] } => {
  const keep: HkNote[] = [];
  const hidden: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = clean(s.replace(LABEL_PREFIX, '').replace(/,\s*(welcome amenity|benefits?)\s*$/i, ''));
    const k = t.toLowerCase();
    if (isNoise(t) || seen.has(k)) return;
    seen.add(k);
    keep.push({ text: t.charAt(0).toUpperCase() + t.slice(1), cat: catOf(t) });
  };
  const hide = (s: string) => { const t = clean(s); if (t && !isNoise(t) && !hidden.includes(t)) hidden.push(t); };

  texts.flatMap(t => String(t || '').replace(/\[DEP_INFO\].*?\[\/DEP_INFO\]/g, '')
      // long one-line memos: break before "Dietary:", "Minibar Requests:", "Pre-booking"... and at sentence ends
      .replace(/\s+(?=(special requests?|dietary(?: requirements?)?|minibar requests?|allerg(?:y|ies)|preferences?|notes?)\s*:)/gi, '\n')
      .replace(/\s+(?=pre-?book(?:ing|ed)\b)/gi, '\n')
      .split(/\n|•|<br\s*\/?>|(?<=[a-z0-9)’'"])(?<!\b(?:Mr|Mrs|Ms|Mx|Dr|Prof|Jr|Sr|St|vs|No))[.?!]\s+(?=[A-Z])/i))
    .map(clean).filter(Boolean)
    .forEach(line => {
      if (/^CHECKOUT \d/i.test(line)) return;
      const body = line.replace(LABEL_PREFIX, '')
        .replace(/\bVIP'?s?\s+of\s+(the\s+)?TA\b/gi, 'VIP')                          // "VIP of TA" → VIP
        .replace(/\bupgraded\s+(?=(wellness|fruit|welcome|amenit|platter))/gi, '');   // an upgraded platter is still set-up
      if (!JUNK.test(body)) { add(body); return; }
      // Mixed line: keep the housekeeping clauses, hide the rest
      const parts = clauses(body);
      const junk: string[] = [];
      parts.forEach(p => {
        const q = p.replace(LABEL_PREFIX, '');
        // An allergy is never hidden, even inside a front-office sentence
        if (/allerg|intoleran|celiac|coeliac/i.test(q)) add(q);
        else if (JUNK.test(q) || isNoise(q) || (catOf(q) === 'other' && q.split(/\s+/).length < 4)) junk.push(p);
        else add(q);
      });
      if (junk.length) hide(junk.join(', '));
    });

  return { keep: keep.sort((a, b) => HK_CAT_ORDER.indexOf(a.cat) - HK_CAT_ORDER.indexOf(b.cat)), hidden };
};

/** Just the housekeeping lines, as text (for the VA task list). */
export const hkNoteLines = (texts: (string | null | undefined)[]) => splitHkNotes(texts).keep.map(n => n.text);

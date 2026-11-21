// Guest List imports: Opera OCC XML (in-house), Opera Arrivals XML (RES_DETAIL) and the Arrivals & Departures memo (CSV / paste).
//
// A guest is one STAY, like a PMS folio: the villa they arrived in + their arrival date. Names, pax, GEM and notes are
// facts about that stay that each report may correct, but they never decide who the guest is (names are spelled
// differently in every report). The stay keeps its stay_id from day to day; a room move carries it to the new villa.
//
// Each source is trusted for what it knows best:
//   OCC XML       who is in house right now, names, pax, meal plan, stay dates. Today's arrivals appear here too: they are ARR, not OCC.
//   Arrivals XML  today's arrivals with arrival time and trace notes (anniversary, honeymoon...).
//   Memo          GEM, special instructions, arrival / check-out times, departures already gone from OCC, room moves, seaplane crew villas.
//
// Pure functions only (no Supabase, no DOM) so the same code runs in the browser and in tests.

export type GuestRow = {
    villa_number: string;
    status: string;
    guest_name: string;
    pax_adults: number;
    pax_kids: number;
    gem_name: string;
    meal_plan: string;
    stay_dates: string;
    remarks: string;
    preferences?: string;
    arrival_time?: string;
    departure_time?: string;
    stay_id?: string;
    dep_guest_name?: string;
    dep_stay_dates?: string;
    /** DEP/ARR: the departing guest's GEM (from the memo's DEPARTURES section). gem_name is the arriving guest's. */
    dep_gem_name?: string;
    [key: string]: unknown;
};

export type ImportChange = {
    villa: string;
    type: string;
    oldGuest: string;
    newGuest: string;
    oldStatus: string;
    newStatus: string;
    note?: string;
    /** Memo section that caused it (Arrival villas, Departure villas, Villa moves, Seaplane crew, GEM allocation) */
    group?: string;
};

/** Headings for the memo review list, in display order. */
export const MEMO_GROUPS = ['Amended — check these', 'Arrival villas', 'Departure villas', 'Villa moves', 'Seaplane crew', 'GEM allocation'] as const;

export type ImportResult = { rows: GuestRow[]; changes: ImportChange[]; warnings: string[] };

/** One party in one villa, as read from any report. Dates are YYYY-MM-DD. */
export type Party = {
    villa: string;
    names: string[];
    adults: number | null;
    kids: number | null;
    mealPlan: string;
    gem: string;
    arr: string;
    dep: string;
    arrTime?: string;
    depTime?: string;
    prefs?: string;
};

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

export const normalizeVilla = (raw: unknown): string | null => {
    const m = String(raw ?? '').trim().match(/^#?\s*(\d{1,3})(?![\d:.])/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n > 0 ? String(n) : null;
};

const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const monthNum = (s: string): number | null => {
    const u = String(s || '').trim().toUpperCase();
    if (/^\d{1,2}$/.test(u)) return parseInt(u, 10);
    return MONTHS[u.slice(0, 3)] || null;
};
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const validDate = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 2000;

/** Year for a day/month with no year: the one closest to the reference date. */
const nearestYear = (m: number, d: number, refIso: string) => {
    const ry = parseInt(refIso.slice(0, 4), 10);
    const ref = Date.UTC(ry, parseInt(refIso.slice(5, 7), 10) - 1, parseInt(refIso.slice(8, 10), 10));
    return [ry - 1, ry, ry + 1].reduce((best, y) =>
        Math.abs(Date.UTC(y, m - 1, d) - ref) < Math.abs(Date.UTC(best, m - 1, d) - ref) ? y : best, ry);
};

/** Opera dates: "12-NOV-26" (OCC) or "15-11-26" (arrivals). */
export const parseOperaDate = (raw: string): string => {
    const p = String(raw || '').trim().split('-');
    if (p.length !== 3) return '';
    const d = parseInt(p[0], 10), m = monthNum(p[1]);
    const y = p[2].length === 4 ? parseInt(p[2], 10) : 2000 + parseInt(p[2], 10);
    return m && validDate(y, m, d) ? iso(y, m, d) : '';
};

/** Memo dates without a year: "NOV 19", "19 NOV", "06-Nov", "19/11". */
export const parseLooseDate = (raw: string, refIso: string): string => {
    const s = String(raw || '').trim().toUpperCase();
    let m: number | null = null, d: number | null = null;
    let x = s.match(/\b([A-Z]{3})[A-Z]*[\s\-.]*(\d{1,2})\b/);
    if (x && monthNum(x[1])) { m = monthNum(x[1]); d = parseInt(x[2], 10); }
    if (!m) { x = s.match(/\b(\d{1,2})[\s\-.]*([A-Z]{3})/); if (x && monthNum(x[2])) { d = parseInt(x[1], 10); m = monthNum(x[2]); } }
    if (!m) { x = s.match(/\b(\d{1,2})\/(\d{1,2})\b/); if (x) { d = parseInt(x[1], 10); m = parseInt(x[2], 10); } }
    if (!m || !d) return '';
    const y = nearestYear(m, d, refIso);
    return validDate(y, m, d) ? iso(y, m, d) : '';
};

/** "1:25 PM" → "13:25", "9:25 AM" → "09:25", "13:45" → "13:45". "00:00" means "not set" in Opera. */
export const to24h = (raw: string): string => {
    const x = String(raw || '').toUpperCase().match(/(\d{1,2})[:.](\d{2})\s*(AM|PM)?/);
    if (!x) return '';
    let h = parseInt(x[1], 10);
    const min = x[2];
    if (x[3] === 'PM' && h < 12) h += 12;
    if (x[3] === 'AM' && h === 12) h = 0;
    if (h > 23) return '';
    const t = `${pad(h)}:${min}`;
    return t === '00:00' ? '' : t;
};

const dm = (isoDate: string) => (isoDate ? `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}` : '');
export const stayDatesOf = (arr: string, dep: string) => (arr && dep ? `${dm(arr)} - ${dm(dep)}` : arr ? `${dm(arr)} - ` : '');
export const stayIdOf = (villa: string, arr: string) => (arr ? `STAY_${villa}_${arr.slice(2, 4)}${arr.slice(5, 7)}${arr.slice(8, 10)}` : '');

/** "12/11 - 19/11" → { arr, dep } as ISO, years inferred around the reference date. */
export const parseStayRange = (stayDates: string, refIso: string): { arr: string; dep: string } => {
    const parts = String(stayDates || '').split('-').map(s => s.trim());
    const one = (s: string) => {
        const x = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (!x) return '';
        const d = parseInt(x[1], 10), m = parseInt(x[2], 10);
        const y = x[3] ? (x[3].length === 2 ? 2000 + parseInt(x[3], 10) : parseInt(x[3], 10)) : nearestYear(m, d, refIso);
        return validDate(y, m, d) ? iso(y, m, d) : '';
    };
    const arr = one(parts[0] || '');
    let dep = one(parts[1] || '');
    if (arr && dep && dep < arr) dep = iso(parseInt(dep.slice(0, 4), 10) + 1, parseInt(dep.slice(5, 7), 10), parseInt(dep.slice(8, 10), 10));
    return { arr, dep };
};

const stayIdArr = (stayId: string) => {
    const x = String(stayId || '').match(/_(\d{2})(\d{2})(\d{2})$/);
    return x ? `20${x[1]}-${x[2]}-${x[3]}` : '';
};

/** Arrival / departure of the stay a row holds. */
const rowStay = (row: GuestRow, refIso: string) => {
    const r = parseStayRange(row.stay_dates, refIso);
    return { arr: r.arr || stayIdArr(row.stay_id || ''), dep: r.dep };
};

// ---------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());

/**
 * "Whitefoord, Charles Alexander Anthony" + "Mr" → "Mr Charles Alexander Anthony Whitefoord"
 * "Rochester,Raymond,Mr" → "Mr Raymond Rochester"; "Alfaalila LATIF, MALIKA" → "Ms Malika Latif";
 * "Kokko SHAJID, LAITH (1 Year)" → "Mstr/Miss Laith Shajid (1 yrs)"
 */
export const formatGuestName = (rawName: string, rawTitle = '', rawAgeNote: unknown = null): string => {
    let name = String(rawName || '').replace(/^\*/, '').trim();
    if (!name) return '';
    let title = String(rawTitle || '').trim();
    let age = '';

    const ageInName = name.match(/\(\s*(\d+)\s*(years?|yrs?|y|months?|mths?|m)\s*\)/i);
    if (ageInName) {
        age = /^m/i.test(ageInName[2]) ? `${ageInName[1]} mths` : `${ageInName[1]} yrs`;
        name = name.replace(ageInName[0], ' ');
    }
    if (rawAgeNote && !age) {
        const n = String(rawAgeNote).match(/(\d+)/);
        if (n) age = `${n[1]} yrs`;
    }
    // "Mulot, Stella - F (3 Months)": a trailing gender marker
    name = name.replace(/\s-\s*[MF]\s*$/i, ' ');

    // Memo prefixes (also with the common typo "Alafaalil"): Alfaalil = Mr, Alfaalila = Ms, Kokko = child
    const upper = name.toUpperCase();
    if (/\b(AL)?A?FAALILA\b/.test(upper)) { title = title || 'Ms'; name = name.replace(/\b(al)?a?faalila\b/ig, ''); }
    else if (/\b(AL)?A?FAALIL\b/.test(upper)) { title = title || 'Mr'; name = name.replace(/\b(al)?a?faalil\b/ig, ''); }
    else if (/\bKOKKO\b/.test(upper)) { title = title || 'Mstr/Miss'; name = name.replace(/\bkokko\b/ig, ''); }

    if (name.includes(',')) {
        const parts = name.split(',').map(s => s.replace(/[^\p{L}\s\-']/gu, ' ').replace(/\s+/g, ' ').trim());
        if (parts.length > 2 && parts[2] && !title) title = parts[2];
        name = `${parts[1] || ''} ${parts[0]}`;
    } else {
        name = name.replace(/[^\p{L}\s\-']/gu, ' ');
    }
    name = titleCase(name.replace(/\s+/g, ' ').trim());
    let final = name;
    if (title && !final.toLowerCase().startsWith(title.toLowerCase())) final = `${title} ${final}`;
    if (age) final += ` (${age})`;
    return final;
};

export const cleanNameForMatch = (n: string) =>
    String(n || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\(\s*\d+\s*(yrs?|mths?)\s*\)/g, '')
        .replace(/\b(mr|ms|mrs|miss|mstr|master|dr|prof|mstr\/miss|(al)?a?faalila?|kokko)\b/g, '')
        .replace(/[^a-z]/g, '');

const splitGuests = (names: string): string[] =>
    String(names || '').split('&').map(cleanNameForMatch).filter(n => n.length >= 3);

/** Same person in both strings? Also matches when the words are the same in a different order ("Latif Malika" / "Malika Latif"). */
export const isSameGuest = (n1: string, n2: string) => {
    const words = (s: string) => String(s || '').split('&').map(p =>
        p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/\(.*?\)/g, ' ')
            .replace(/\b(mr|ms|mrs|miss|mstr|master|dr|prof|alfaalil|alfaalila|kokko)\b/g, ' ')
            .split(/[^a-z]+/).filter(w => w.length >= 3));
    const a = words(n1), b = words(n2);
    if (!a.length || !b.length) return false;
    // Two people match when they share a surname-sized word set: at least two words, or one word that is the whole name
    return a.some(x => b.some(y => {
        const shared = x.filter(w => y.includes(w)).length;
        return shared >= 2 || (shared === 1 && (x.length === 1 || y.length === 1));
    }));
};

/** Name words of 3+ letters, without titles / memo prefixes / ages. */
const cleanWords = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ').replace(/\b(mr|ms|mrs|miss|mstr|master|dr|prof|(al)?a?faalila?|kokko)\b/g, ' ')
    .split(/[^a-z]+/).filter(w => w.length >= 3);

/**
 * Stricter than isSameGuest: one person must have ALL the words of the shorter name in the other.
 * "Barbara Arese Lucini" and "Francesca Arese Lucini" share a surname but are different people, so two
 * families travelling together are not mistaken for each other when a revised memo swaps their villas.
 */
export const samePartyStrict = (n1: string, n2: string) => {
    const people = (s: string) => String(s || '').split('&').map(p =>
        p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/\(.*?\)/g, ' ')
            .replace(/\b(mr|ms|mrs|miss|mstr|master|dr|prof|(al)?a?faalila?|kokko)\b/g, ' ')
            .split(/[^a-z]+/).filter(w => w.length >= 2)).filter(w => w.length);
    const a = people(n1), b = people(n2);
    return a.some(x => b.some(y => {
        const [short, long] = x.length <= y.length ? [x, y] : [y, x];
        return short.every(w => long.includes(w));
    }));
};

// ---------------------------------------------------------------------------------------------------------------
// Meal plans
// ---------------------------------------------------------------------------------------------------------------

export const MEAL_PLAN_CODES = ['RO', 'BB', 'HB', 'HBSI', 'HBSA', 'FB', 'FBSI', 'FBSA', 'AI'];

export const parseMealPlan = (raw: string): string => {
    const u = String(raw || '').trim().toUpperCase();
    if (!u) return '';
    const compact = u.replace(/[\s\-_]/g, '');
    if (MEAL_PLAN_CODES.includes(compact)) return compact;
    const variant = u.match(/\b(HB|FB)\s*[-_]?\s*(SI|SA)\b/);
    if (variant) return `${variant[1]}${variant[2]}`;
    if (/\bAI\b|ALL\s*INC/.test(u)) return 'AI';
    if (/\bFB\b|FULL\s*BOARD/.test(u)) return 'FB';
    if (/\bHB\b|HALF\s*BOARD/.test(u)) return 'HB';
    if (/\bBB\b|BED\s*(AND|&)\s*BREAKFAST/.test(u)) return 'BB';
    if (/\bRO\b|ROOM\s*ONLY/.test(u)) return 'RO';
    return '';
};

/** Arrivals XML has no meal plan column: XBFS30RA = breakfast, XDIN30RA = dinner, LUN = lunch. */
export const mealPlanFromProducts = (products: string): string => {
    const codes = String(products || '').toUpperCase().split(',').map(c => c.trim().replace(/^-?\d+\*/, ''));
    if (codes.some(c => /^X?AI\d|ALLINC/.test(c))) return 'AI';
    const bf = codes.some(c => /^XBF/.test(c));
    const lunch = codes.some(c => /^X?LUN/.test(c));
    const dinner = codes.some(c => /^XDIN/.test(c));
    if (bf && lunch && dinner) return 'FB';
    if (bf && dinner) return 'HB';
    if (bf) return 'BB';
    return '';
};

/** HBSI from the OCC report is richer than HB from products: keep it for the same stay. */
const mergeMeal = (existing: string, incoming: string) =>
    !incoming ? existing : existing && existing.startsWith(incoming) ? existing : incoming;

// ---------------------------------------------------------------------------------------------------------------
// Readers: XML and delimited text
// ---------------------------------------------------------------------------------------------------------------

const decodeXml = (s: string) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&');

type XmlRecord = { get: (tag: string) => string; all: (tag: string) => string[] };

/** Every <tag>…</tag> block, with its leaf fields. Opera reports are flat enough for this. */
const xmlRecords = (xml: string, tag: string): XmlRecord[] => {
    const out: XmlRecord[] = [];
    const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
        const fields = new Map<string, string[]>();
        const leaf = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
        let f: RegExpExecArray | null;
        while ((f = leaf.exec(m[1]))) {
            const list = fields.get(f[1]) || [];
            list.push(decodeXml(f[2]).trim());
            fields.set(f[1], list);
        }
        out.push({ get: t => (fields.get(t) || [''])[0], all: t => fields.get(t) || [] });
    }
    return out;
};

/** RFC-4180 style: quoted cells may hold commas, quotes ("") and line breaks. */
export const parseDelimited = (text: string, delimiter = ','): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [], cell = '', quoted = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (quoted) {
            if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; }
        else if (ch === delimiter) { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && s[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
};

// ---------------------------------------------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------------------------------------------

const toInt = (v: string): number | null => {
    const n = parseInt(String(v || '').trim(), 10);
    return isNaN(n) ? null : n;
};

/** Parties with the same arrival and departure in one villa are one party (a couple, a family). */
const groupParties = (villa: string, list: Party[]): Party[] => {
    const byDates = new Map<string, Party>();
    list.forEach(p => {
        const key = `${p.arr}|${p.dep}`;
        const g = byDates.get(key);
        if (!g) { byDates.set(key, { ...p, villa, names: [...p.names] }); return; }
        p.names.forEach(n => { if (!g.names.some(x => cleanNameForMatch(x) === cleanNameForMatch(n))) g.names.push(n); });
        g.adults = (g.adults ?? 0) + (p.adults ?? 0);
        g.kids = (g.kids ?? 0) + (p.kids ?? 0);
        g.mealPlan = g.mealPlan || p.mealPlan;
        g.gem = g.gem || p.gem;
        g.arrTime = g.arrTime || p.arrTime;
        g.prefs = [g.prefs, p.prefs].filter(Boolean).join('\n');
    });
    return Array.from(byDates.values());
};

/** OCC XML (OSR_LANDSCAPE / G_C9): C9 villa, C27 GEM, C30 meal plan, C33 title, C36 name, C48 adults, C51 kids, C81 arrival, C87 departure. */
export const parseOccXml = (xml: string): Record<string, Party[]> => {
    const rows = xmlRecords(xml, 'G_C9');
    if (rows.length === 0) throw new Error('No in-house rows (G_C9) found: is this the OCC report?');
    const byVilla: Record<string, Party[]> = {};
    rows.forEach(r => {
        const villa = normalizeVilla(r.get('C9'));
        if (!villa) return;
        const name = formatGuestName(r.get('C36'), r.get('C33'));
        (byVilla[villa] ||= []).push({
            villa,
            names: name ? [name] : [],
            adults: toInt(r.get('C48')),
            kids: toInt(r.get('C51')),
            mealPlan: parseMealPlan(r.get('C30')),
            gem: r.get('C27'),
            arr: parseOperaDate(r.get('C81')),
            dep: parseOperaDate(r.get('C87')),
        });
    });
    const out: Record<string, Party[]> = {};
    Object.entries(byVilla).forEach(([v, list]) => { out[v] = groupParties(v, list); });
    return out;
};

const TRACE_SKIP = /^(\d+M)\*\*/; // "1M**1:00 PM - 2:00 PM" is an internal timing trace, not a guest note
const cleanTrace = (t: string) => t.replace(/^[A-Z0-9]{1,3}(\*\*|--)/, '').trim();

/** Arrivals XML (RES_DETAIL / G_RESERVATION). Returns the report's arrival date and today's parties per villa. */
export const parseArrivalsXml = (xml: string): { reportDate: string; byVilla: Record<string, Party[]> } => {
    const res = xmlRecords(xml, 'G_RESERVATION');
    if (res.length === 0) throw new Error('No reservations (G_RESERVATION) found: is this the Arrivals report?');
    const groupDate = parseOperaDate((xml.match(/<GROUPBY1_COL>([^<]*)<\/GROUPBY1_COL>/) || [])[1] || '');
    const byVilla: Record<string, Party[]> = {};
    res.forEach(r => {
        const status = r.get('SHORT_RESV_STATUS').toUpperCase();
        if (['CXL', 'CANCEL', 'NS', 'NOSHOW', 'WL'].includes(status)) return;
        const villa = normalizeVilla(r.get('DISP_ROOM_NO') || r.get('ROOM_NO'));
        if (!villa) return;
        const notes = [r.get('SPECIAL_REQUESTS'), r.get('PREFERENCES'), ...r.all('TRACE_TEXT').filter(t => !TRACE_SKIP.test(t)).map(cleanTrace)]
            .map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const name = formatGuestName(r.get('FULL_NAME_NO_SHR_IND') || r.get('FULL_NAME'));
        (byVilla[villa] ||= []).push({
            villa,
            names: name ? [name] : [],
            adults: toInt(r.get('ADULTS')),
            kids: toInt(r.get('CHILDREN')),
            mealPlan: parseMealPlan(r.get('MEAL_PLAN')) || mealPlanFromProducts(r.get('PRODUCTS')),
            gem: '',
            arr: parseOperaDate(r.get('ARRIVAL')),
            dep: parseOperaDate(r.get('DEPARTURE')),
            arrTime: to24h(r.get('ARRIVAL_TIME') || r.get('ARRIVAL_TIME1')),
            prefs: Array.from(new Set(notes)).join(', '),
        });
    });
    const out: Record<string, Party[]> = {};
    Object.entries(byVilla).forEach(([v, list]) => { out[v] = groupParties(v, list); });
    const reportDate = groupDate || Object.values(out).flat().map(p => p.arr).sort()[0] || '';
    return { reportDate, byVilla: out };
};

export type MemoData = {
    reportDate: string;
    arrivals: Party[];
    departures: Party[];
    /** reason: the memo's REASON column ("DAY USE TILL 2:50 PM", "STAY EXT", "PAID UPGRADE"...) */
    moves: { from: string; to: string; time: string; reason?: string }[];
    /** flight: the seaplane the crew stays for ("FLT242"), from the crew table heading, when given */
    crew: { villa: string; shift: 'Day' | 'Night'; flight?: string }[];
    /** GEMS ALLOCATION table: villa → GEM, for every villa in house (not only arrivals / departures) */
    gems: Record<string, string>;
    /** Seaplane crew (TMA) times, HH:MM. Departures use the group's CHECK OUT time, not "leave to airport".
     *  nightLeave = last night's crew leaving this morning (the aircraft that stayed overnight). */
    crewTimes?: { dayArr: string; dayDep: string; nightArr: string; nightLeave: string };
    /** Arrival time on the island per arriving flight ("FLT242" → "12:45"), for crews of a given flight */
    flightArr?: Record<string, string>;
};

/** "FLT-242", "FLT 242", "FLT242", "FLT: FLT242" → "FLT242" */
const flightId = (s: string) => {
    const m = String(s || '').toUpperCase().match(/FLT[\s:.-]*(\d+)/);
    return m ? `FLT${m[1]}` : '';
};

/** A flight group line in the memo: "FLT947 CKN @ ... ARR BY SPS (STANDARD) 8Q-MAF ... NIGHT SHUTDOWN" */
type FlightGroup = { flight: string; reg: string; shut: '' | 'DAY' | 'NIGHT'; time: string };

const FULL_DATE = /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2}),?\s+(\d{4})/i;

/** "2+1" → 2 adults 1 child, "2" → 2 adults, "" → unknown. */
const parsePax = (raw: string): { adults: number | null; kids: number | null } => {
    const x = String(raw || '').match(/(\d+)\s*(?:\+\s*(\d+))?/);
    return x ? { adults: parseInt(x[1], 10), kids: x[2] ? parseInt(x[2], 10) : 0 } : { adults: null, kids: null };
};

/**
 * The ARRIVALS & DEPARTURES memo. Columns are found from the two header rows under each section title, so moved or
 * added columns keep working. Continuation rows (2nd guest, child) have no villa and belong to the villa above.
 */
export const parseMemo = (rows: string[][], refIso: string): MemoData => {
    const cell = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
    const memo: MemoData = { reportDate: '', arrivals: [], departures: [], moves: [], crew: [], gems: {} };
    const arrGroups: FlightGroup[] = [], depGroups: FlightGroup[] = [];
    let group: FlightGroup | null = null;
    // SEAPLANE & DOMESTIC FLIGHT MOVEMENTS: Flight No. | MLE DEP | ARR | DEP | MLE ARR
    // MLE DEP + ARR empty = the aircraft slept at the resort and leaves this morning (last night's crew).
    const overnightOut = new Set<string>();
    const overnightIn = new Map<string, string>(); // night-stop flight → landing time at the resort
    for (let i = 0; i < rows.length; i++) {
        const c = rows[i].findIndex(x => String(x || '').trim().toUpperCase() === 'FLIGHT NO.');
        if (c < 0) continue;
        for (let j = i + 1; j < rows.length; j++) {
            const f = String(rows[j][c] ?? '').trim().toUpperCase();
            if (!f) break;
            const [mleDep, arr, dep] = [1, 2, 3].map(k => String(rows[j][c + k] ?? '').trim());
            if (!mleDep && !arr && dep) overnightOut.add(flightId(f) || f.replace(/\s+/g, ''));
            const mleArr = String(rows[j][c + 4] ?? '').trim();
            if (arr && !dep && !mleArr) overnightIn.set(flightId(f) || f.replace(/\s+/g, ''), to24h(arr.replace(/^(\d{1,2})(\d{2})$/, '$1:$2')));
        }
        break;
    }

    // GEMS ALLOCATION: a small table ("AFRAH  1 6 18 24 85") in its own column, beside other sections
    for (let i = 0; i < rows.length; i++) {
        const c = rows[i].findIndex(x => String(x || '').trim().toUpperCase() === 'GEMS ALLOCATION');
        if (c < 0) continue;
        for (let j = i + 1; j < rows.length; j++) {
            const v = String(rows[j][c] ?? '').trim();
            if (!v) continue;
            const g = v.match(/^([A-Za-z][A-Za-z .'-]*?)\s+((?:\d{1,3}\s*)+)$/);
            if (!g) break;
            g[2].trim().split(/\s+/).forEach(n => { const villa = normalizeVilla(n); if (villa) memo.gems[villa] = g[1].trim().toUpperCase(); });
        }
        break;
    }

    for (const r of rows.slice(0, 15)) {
        for (const c of r) {
            const x = String(c || '').match(FULL_DATE);
            if (x) { memo.reportDate = iso(parseInt(x[3], 10), monthNum(x[1])!, parseInt(x[2], 10)); break; }
        }
        if (memo.reportDate) break;
    }
    const ref = memo.reportDate || refIso;

    type Section = 'NONE' | 'ARR' | 'DEP' | 'MOVES' | 'CREW';
    let section: Section = 'NONE';
    // Crew tables sit side by side: "SEAPLANE NIGHT SHUTDOWN CREW VILLAS: FLT242" in B, "... FLT: FLT151" in D
    let crewCols: { col: number; shift: 'Day' | 'Night'; flight: string }[] = [];
    let label: string[] = [];
    let headerRows = 0;
    let current: Party | null = null;
    let groupTime = '';
    const col = (...keys: string[]) => {
        for (const k of keys) { const i = label.findIndex(l => l.startsWith(k)); if (i >= 0) return i; }
        return -1;
    };

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const c1 = cell(r, 1).toUpperCase();
        const c0 = cell(r, 0).toUpperCase();
        const head = c1 || c0;

        // Section titles
        if (head === 'ARRIVALS') { section = 'ARR'; label = []; headerRows = 0; current = null; groupTime = ''; continue; }
        if (head === 'DEPARTURES') { section = 'DEP'; label = []; headerRows = 0; current = null; groupTime = ''; continue; }
        if (head === 'ROOM MOVES') { section = 'MOVES'; continue; }
        const crewHeads = r.map((c, j) => ({ c: String(c || '').trim().toUpperCase(), j }))
            .filter(x => /^SEAPLANE (DAY|NIGHT) SHUTDOWN CREW/.test(x.c));
        if (crewHeads.length && /^SEAPLANE (DAY|NIGHT) SHUTDOWN CREW/.test(head)) {
            section = 'CREW';
            crewCols = crewHeads.map(x => ({ col: x.j, shift: /NIGHT/.test(x.c) ? 'Night' : 'Day', flight: flightId(x.c) }));
            continue;
        }
        const rowText = r.map(c => String(c || '').trim().toUpperCase()).filter(Boolean).join(' | ');
        if (/(^|\| )(HOST ARRIVAL|HOST DEPARTURE|ARR\/DEP ATTENDEES|REPEATERS INHOUSE|GI BY|WEEKEND MOD|\* VIP|MOD CHECKLIST|VILLAS ON STANDBY|HOUSEKEEPING ON DUTY)/.test(rowText)) {
            if (section !== 'NONE') section = 'NONE';
            current = null;
            continue;
        }

        if (section === 'ARR' || section === 'DEP') {
            // Two header rows: "VILLA | NO. OF | ..." then "NO. | PAX | ..."
            if (headerRows < 2 && (c1 === 'VILLA' || c1 === 'NO.' || (headerRows === 1 && !normalizeVilla(cell(r, 1))))) {
                const prev = label;
                label = r.map((c, j) => `${headerRows === 0 ? '' : (prev[j] || '')} ${String(c || '').trim()}`.replace(/\s+/g, ' ').trim().toUpperCase());
                headerRows++;
                continue;
            }
            // Flight group line: "FLT651 CKN @ 9:45 AM ..." resets the group time
            if (/^FLT|CKN @|^PAGE \d/.test(c1)) {
                current = null; groupTime = '';
                const fl = flightId(c1);
                if (fl) {
                    group = { flight: fl, reg: (rowText.match(/8Q-[A-Z]{3}/) || [''])[0], shut: /NIGHT SHUTDOWN/.test(rowText) ? 'NIGHT' : /DAY SHUTDOWN/.test(rowText) ? 'DAY' : '', time: '' };
                    (section === 'ARR' ? arrGroups : depGroups).push(group);
                } else group = null;
                continue;
            }

            const iVilla = col('VILLA NO');
            const iName = col('GUEST NAME');
            const villa = normalizeVilla(cell(r, iVilla >= 0 ? iVilla : 1));
            const rawName = cell(r, iName >= 0 ? iName : 8);

            if (!villa) {
                // Second guest / child of the villa above
                const notAGuest = /^PAGE |^(ARR|DEP)\s+BY\b|\bSP[BS]\b|SEAPLANE|SPEEDBOAT|DOMESTIC|^FLT/i.test(rawName);
                if (current && rawName && !notAGuest) {
                    const n = formatGuestName(rawName);
                    if (n) current.names.push(n);
                } else if (!rawName && !r.some(c => String(c || '').trim())) {
                    // blank row: keep the current villa open (memo leaves gaps between guests)
                }
                continue;
            }

            const gem = cell(r, col('GEM')).split('\n')[0].trim();
            const special = cell(r, col('SPECIAL')).replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean).join('\n');
            const meal = parseMealPlan(cell(r, col('M/P')));
            const name = formatGuestName(rawName);

            if (section === 'ARR') {
                const t = to24h(cell(r, col('SPB ARR SSLM', 'ARR SSLM')));
                if (t) groupTime = t;
                if (group && !group.time && t) group.time = t;
                const pax = parsePax(cell(r, col('NO. OF PAX', 'NO. OF')));
                const depCell = cell(r, col('DEPARTURE DATE', 'DEPARTURE'));
                current = {
                    villa, names: name ? [name] : [], adults: pax.adults, kids: pax.kids, mealPlan: meal, gem,
                    arr: ref, dep: parseLooseDate(depCell.split('\n').slice(1).join(' ') || depCell, ref),
                    arrTime: t || groupTime, prefs: special,
                };
                const same = memo.arrivals.find(a => a.villa === villa);
                if (same) {
                    current.names.forEach(n => { if (!same.names.some(x => cleanNameForMatch(x) === cleanNameForMatch(n))) same.names.push(n); });
                    same.adults = Math.max(same.adults ?? 0, current.adults ?? 0) || same.adults;
                    same.kids = Math.max(same.kids ?? 0, current.kids ?? 0);
                    if (current.arrTime && (!same.arrTime || current.arrTime < same.arrTime)) same.arrTime = current.arrTime;
                    same.prefs = same.prefs || current.prefs;
                    same.gem = same.gem || current.gem;
                    current = same;
                } else memo.arrivals.push(current);
            } else {
                const leave = to24h(cell(r, col('LEAVE TO AIRPORT', 'LEAVE TO')));
                if (leave) groupTime = leave;
                const checkout = to24h(cell(r, col('CHECK OUT TIME', 'CHECK OUT')));
                if (group && !group.time && checkout) group.time = checkout;
                current = {
                    villa, names: name ? [name] : [], adults: null, kids: null, mealPlan: meal, gem,
                    arr: parseLooseDate(cell(r, col('ARRIVAL DATE', 'ARRIVAL')), ref), dep: ref,
                    depTime: checkout || groupTime, prefs: special,
                };
                const same = memo.departures.find(a => a.villa === villa);
                if (same) {
                    current.names.forEach(n => { if (!same.names.some(x => cleanNameForMatch(x) === cleanNameForMatch(n))) same.names.push(n); });
                    if (current.depTime && (!same.depTime || current.depTime < same.depTime)) same.depTime = current.depTime;
                    current = same;
                } else memo.departures.push(current);
            }
            continue;
        }

        if (section === 'MOVES') {
            if (c1 === 'FROM') continue;
            const from = normalizeVilla(cell(r, 1)), to = normalizeVilla(cell(r, 2));
            if (from && to && from !== to) memo.moves.push({ from, to, time: to24h(cell(r, 3)), reason: cell(r, 4).replace(/\s+/g, ' ').trim() });
            else if (c1) section = 'NONE';
            continue;
        }

        if (section === 'CREW') {
            // "#52 | CAPT | #35 | CAPT": a villa under each crew heading. "#" alone = not given yet.
            let any = false, other = false;
            crewCols.forEach(cc => {
                const raw = cell(r, cc.col);
                const v = normalizeVilla(raw);
                if (v) { any = true; memo.crew.push({ villa: v, shift: cc.shift, flight: cc.flight || undefined }); }
                else if (raw && !raw.startsWith('#')) other = true;
            });
            if (!any && other) section = 'NONE';
            continue;
        }
    }

    // Crew times. Day crew: arrives with the DAY SHUTDOWN flight, leaves with the same flight / aircraft.
    const dayArr = arrGroups.find(g => g.shut === 'DAY');
    const nightArr = arrGroups.find(g => g.shut === 'NIGHT') || arrGroups.find(g => overnightIn.has(g.flight) && g.time)
        // No guests on the night-stop seaplane (crew only): its landing time from the movement table
        || (() => { const f = Array.from(overnightIn.entries()).find(([, t]) => t); return f ? { time: f[1] } : undefined; })();
    const dayDep = dayArr && (depGroups.find(g => g.flight === dayArr.flight) || depGroups.find(g => g.reg && g.reg === dayArr.reg && !overnightOut.has(g.flight)));
    const leave = depGroups.find(g => overnightOut.has(g.flight));
    memo.crewTimes = { dayArr: dayArr?.time || '', dayDep: dayDep?.time || '', nightArr: nightArr?.time || '', nightLeave: leave?.time || '' };
    memo.flightArr = Object.fromEntries(arrGroups.filter(g => g.time).map(g => [g.flight, g.time]));
    return memo;
};

// ---------------------------------------------------------------------------------------------------------------
// Merging into the day's villa rows
// ---------------------------------------------------------------------------------------------------------------

const IN_HOUSE = ['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR', 'DEP'];
/** Crew / house use / show villa / fumigation rows are managed elsewhere; reports never overwrite them. */
const isProtected = (status: string) => /TMA|HOUSE|SHOW|FUMIG|DAY USE/i.test(String(status || ''));

const EMPTY_STAY = {
    status: 'VAC', guest_name: '', pax_adults: 0, pax_kids: 0, meal_plan: '', stay_dates: '', gem_name: '', stay_id: '',
    preferences: '', arrival_time: '', departure_time: '', dep_guest_name: '', dep_stay_dates: '', dep_gem_name: '',
};

/** The departing side of a DEP/ARR row (or of a DEP row about to become one). */
const depSideOf = (row: GuestRow, fromMain = false) => fromMain
    ? { dep_guest_name: row.guest_name, dep_stay_dates: row.stay_dates, departure_time: row.departure_time || '', dep_gem_name: row.gem_name || '' }
    : { dep_guest_name: row.dep_guest_name || '', dep_stay_dates: row.dep_stay_dates || '', departure_time: row.departure_time || '', dep_gem_name: row.dep_gem_name || '' };

const joinNames = (names: string[]) => names.filter(Boolean).join(' & ');

/** Does this row already hold this party's stay? Arrival date decides; names only when the row has no dates. */
const holdsStay = (row: GuestRow, p: Party, D: string) => {
    if (!row.guest_name) return false;
    const s = rowStay(row, D);
    if (s.arr && p.arr) return s.arr === p.arr;
    return isSameGuest(row.guest_name, joinNames(p.names));
};

/** Is the row's (main) stay leaving today? */
const departsToday = (row: GuestRow, D: string) =>
    !!row.guest_name && (row.status === 'DEP' || rowStay(row, D).dep === D);

/** namesFromReport: Opera names/pax win. replacePrefs: memo special instructions replace the notes.
 *  timesIfEmpty: Opera's arrival time (often the pre-check-in time) only fills a gap; the memo's resort arrival time wins. */
type MergeOpts = { namesFromReport: boolean; replacePrefs?: boolean; timesIfEmpty?: boolean; gemIfEmpty?: boolean };

/** Exactly the same names, only listed in another order? */
const sameNamesAnyOrder = (a: string, b: string) => {
    const set = (s: string) => String(s || '').split('&').map(x => x.trim()).filter(Boolean).sort().join('|');
    return !!a && !!b && set(a) === set(b);
};

/** Correct an existing stay with what a report says about it. Nothing already known is wiped by an empty cell. */
const mergeStay = (row: GuestRow, p: Party, D: string, o: MergeOpts) => {
    const names = joinNames(p.names);
    if (names && (o.namesFromReport || !row.guest_name) && !sameNamesAnyOrder(row.guest_name, names)) row.guest_name = names;
    if (p.adults !== null && (o.namesFromReport || !row.pax_adults)) row.pax_adults = p.adults;
    if (p.kids !== null && (o.namesFromReport || !row.pax_kids)) row.pax_kids = p.kids;
    row.meal_plan = mergeMeal(row.meal_plan || '', p.mealPlan);
    if (p.gem && (!o.gemIfEmpty || !row.gem_name)) row.gem_name = p.gem;
    const cur = rowStay(row, D);
    const arr = p.arr || cur.arr, dep = p.dep || cur.dep;
    if (arr) row.stay_dates = stayDatesOf(arr, dep);
    if (p.arrTime && (!o.timesIfEmpty || !row.arrival_time)) row.arrival_time = p.arrTime;
    if (p.depTime && (!o.timesIfEmpty || !row.departure_time)) row.departure_time = p.depTime;
    if (p.prefs) {
        if (o.replacePrefs) row.preferences = p.prefs;
        else if (!String(row.preferences || '').includes(p.prefs)) row.preferences = [row.preferences, p.prefs].filter(Boolean).join('\n\n');
    }
    if (!row.stay_id) row.stay_id = stayIdOf(row.villa_number, arr);
};

/** Put a new stay in the row (a different party than before). */
const startStay = (row: GuestRow, p: Party, D: string, o: MergeOpts) => {
    Object.assign(row, { ...EMPTY_STAY, status: row.status });
    mergeStay(row, p, D, { ...o, namesFromReport: true });
    row.stay_id = stayIdOf(row.villa_number, p.arr || D);
};

const statusFor = (arr: string, dep: string, D: string, prev: string) =>
    arr === D ? (prev === 'VM/ARR' ? 'VM/ARR' : 'ARR') : dep === D ? 'DEP' : prev === 'VM/OCC' ? 'VM/OCC' : 'OCC';

/** Today's arrival into a villa: a new party (ARR), or DEP/ARR when the party there leaves today. */
const placeArrival = (row: GuestRow, p: Party, D: string, o: MergeOpts, notes: Map<string, string>) => {
    if (holdsStay(row, p, D)) {
        mergeStay(row, p, D, o);
        if (row.status !== 'DEP/ARR') row.status = statusFor(p.arr, p.dep, D, row.status);
        return;
    }
    if (row.status === 'DEP/ARR') {
        // A different arriving party than the one loaded before: replace the arriving side, keep the departing side
        const dep = depSideOf(row);
        startStay(row, p, D, o);
        Object.assign(row, { status: 'DEP/ARR', ...dep });
        return;
    }
    if (departsToday(row, D)) {
        // The departing guest keeps their own GEM; gem_name becomes the arriving guest's
        const dep = depSideOf(row, true);
        startStay(row, p, D, o);
        Object.assign(row, { status: 'DEP/ARR', ...dep });
        return;
    }
    if (row.guest_name && IN_HOUSE.includes(row.status)) {
        notes.set(row.villa_number, `Replaces ${row.guest_name}, who was not due to leave today`);
    }
    startStay(row, p, D, o);
    row.status = row.status === 'VM/ARR' ? 'VM/ARR' : 'ARR';
};

/** Same person listed in two villas: the villa from the report wins, the stale one is cleared. */
const enforceUniqueGuests = (rows: Map<string, GuestRow>, authoritative: Set<string>, notes: Map<string, string>) => {
    const owner = new Map<string, string>();
    authoritative.forEach(v => {
        const rec = rows.get(v);
        if (rec && IN_HOUSE.includes(rec.status)) splitGuests(rec.guest_name).forEach(n => { if (!owner.has(n)) owner.set(n, v); });
    });
    rows.forEach((rec, v) => {
        if (authoritative.has(v) || !IN_HOUSE.includes(rec.status) || !rec.guest_name || isProtected(rec.status)) return;
        const people = rec.guest_name.split('&').map(s => s.trim()).filter(Boolean);
        const kept = people.filter(n => !owner.has(cleanNameForMatch(n)));
        if (kept.length === people.length) return;
        const movedTo = owner.get(cleanNameForMatch(people.find(n => owner.has(cleanNameForMatch(n)))!));
        if (kept.length === 0) Object.assign(rec, EMPTY_STAY, { status: 'VM/VAC' });
        else rec.guest_name = kept.join(' & ');
        notes.set(v, `Same guest is in V${movedTo} in the report`);
    });
};

// ---------------------------------------------------------------------------------------------------------------
// Change list: compare before / after, only villas that really changed
// ---------------------------------------------------------------------------------------------------------------

const FIELD_LABELS: [keyof GuestRow, string][] = [
    ['guest_name', 'Name'], ['pax_adults', 'Adults'], ['pax_kids', 'Kids'], ['stay_dates', 'Dates'], ['meal_plan', 'Meal'],
    ['gem_name', 'GEM'], ['arrival_time', 'Arr time'], ['departure_time', 'Dep time'], ['dep_guest_name', 'Departing'],
    ['dep_gem_name', 'Departing GEM'],
];

const describeChanges = (before: Map<string, GuestRow>, after: Map<string, GuestRow>, notes: Map<string, string>, groups: Map<string, string>): ImportChange[] => {
    const out: ImportChange[] = [];
    after.forEach((n, v) => {
        const o = before.get(v);
        if (!o) return;
        const fields = FIELD_LABELS.filter(([k]) => String(o[k] ?? '') !== String(n[k] ?? ''));
        const prefsChanged = String(o.preferences || '') !== String(n.preferences || '');
        if (o.status === n.status && !fields.length && !prefsChanged && !notes.has(v)) return;

        const sameStay = !!o.stay_id && o.stay_id === n.stay_id;
        let type = 'UPDATE';
        if (n.status === 'VAC' && IN_HOUSE.includes(o.status)) type = 'NOT IN HOUSE';
        else if (n.status === 'VM/VAC') type = 'MOVED OUT';
        else if (n.status.startsWith('VM/') && o.status !== n.status) type = 'ROOM MOVE';
        else if (n.status === 'DEP/ARR' && o.status !== 'DEP/ARR') type = 'DEP/ARR';
        else if (/ARR/.test(n.status) && !/ARR/.test(o.status)) type = 'ARRIVAL';
        else if (n.status === 'DEP' && o.status !== 'DEP') type = 'DEPARTURE';
        else if (/TMA/.test(n.status) && o.status !== n.status) type = 'CREW';
        else if (n.guest_name && !sameStay && o.guest_name) type = 'NEW GUEST';
        else if (n.status === 'OCC' && o.status === 'DEP') type = 'EXTENDED';

        const detail = type === 'UPDATE' || type === 'EXTENDED'
            ? [...fields.filter(([k]) => k !== 'guest_name').map(([k, l]) => `${l}: ${o[k] || '–'} → ${n[k] || '–'}`), prefsChanged ? 'Notes updated' : '']
                .filter(Boolean).join(' · ')
            : '';
        out.push({
            villa: v, type,
            oldGuest: o.guest_name || (o.status === 'VAC' ? 'Vacant' : ''),
            newGuest: [n.guest_name || (n.status === 'VAC' ? 'Vacant' : ''), detail].filter(Boolean).join(' — '),
            oldStatus: o.status, newStatus: n.status,
            note: notes.get(v),
            group: groups.get(v),
        });
    });
    return out.sort((a, b) => parseInt(a.villa, 10) - parseInt(b.villa, 10));
};

const begin = (rows: GuestRow[]) => {
    const before = new Map(rows.map(r => [r.villa_number, r]));
    const after = new Map(rows.map(r => [r.villa_number, { ...r }]));
    return { before, after, notes: new Map<string, string>(), groups: new Map<string, string>(), warnings: [] as string[] };
};

const finish = (rows: GuestRow[], s: ReturnType<typeof begin>): ImportResult => ({
    rows: rows.map(r => s.after.get(r.villa_number)!),
    changes: describeChanges(s.before, s.after, s.notes, s.groups),
    warnings: s.warnings,
});

const prettyDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '?');

// ---------------------------------------------------------------------------------------------------------------
// Apply each report
// ---------------------------------------------------------------------------------------------------------------

/**
 * OCC = everyone in house at the time of the report. Guests who arrived today are in it too (status ARR, not OCC).
 * Guests already checked out today are NOT in it: they stay DEP, they are not "missing".
 */
export const applyOcc = (rows: GuestRow[], occ: Record<string, Party[]>, D: string, extensionVillas: string[] = []): ImportResult => {
    const s = begin(rows);
    const { after, before, notes } = s;
    const touched = new Set<string>();
    const movedFrom = new Set<string>();

    Object.entries(occ).forEach(([v, parties]) => {
        const row = after.get(v);
        if (!row || isProtected(row.status)) return;
        touched.add(v);
        const arriving = parties.find(p => p.arr === D);
        const leaving = parties.find(p => p.dep === D && p !== arriving);
        const others = parties.filter(p => p !== arriving && p !== leaving);

        if (arriving && leaving) {
            // Back-to-back and the departing party has not checked out yet
            if (!holdsStay(row, leaving, D) && !(row.status === 'DEP/ARR' && isSameGuest(row.dep_guest_name || '', joinNames(leaving.names)))) {
                startStay(row, leaving, D, { namesFromReport: true, gemIfEmpty: true });
                row.status = 'DEP';
            }
            placeArrival(row, arriving, D, { namesFromReport: true, gemIfEmpty: true }, notes);
            if (row.status === 'DEP/ARR') {
                row.dep_guest_name = joinNames(leaving.names);
                row.dep_stay_dates = stayDatesOf(leaving.arr, leaving.dep);
                if (leaving.gem) row.dep_gem_name = leaving.gem;
            }
            return;
        }

        // One party (sharers with different dates are folded into the longest stay)
        const p = others.length || !(arriving || leaving)
            ? parties.reduce((a, b) => ({ ...a, names: [...a.names, ...b.names.filter(n => !a.names.includes(n))], adults: (a.adults ?? 0) + (b.adults ?? 0), kids: (a.kids ?? 0) + (b.kids ?? 0), arr: a.arr < b.arr ? a.arr : b.arr, dep: a.dep > b.dep ? a.dep : b.dep, mealPlan: a.mealPlan || b.mealPlan, gem: a.gem || b.gem }))
            : (arriving || leaving)!;

        if (p.arr === D) { placeArrival(row, p, D, { namesFromReport: true, gemIfEmpty: true }, notes); return; }

        if (holdsStay(row, p, D)) {
            mergeStay(row, p, D, { namesFromReport: true, gemIfEmpty: true });
            if (row.status !== 'DEP/ARR') row.status = statusFor(p.arr, p.dep, D, row.status);
            return;
        }
        if (row.status === 'DEP/ARR' && isSameGuest(row.dep_guest_name || '', joinNames(p.names))) return; // departing side still in house

        // Not the stay we knew in this villa: moved here from another villa?
        const fromEntry = Array.from(before.entries()).find(([ov, orow]) =>
            ov !== v && IN_HOUSE.includes(orow.status) && holdsStay(orow, p, D) &&
            !(occ[ov] || []).some(op => holdsStay(orow, op, D)));
        if (fromEntry) {
            const [ov, orow] = fromEntry;
            Object.assign(row, { ...EMPTY_STAY }, {
                guest_name: orow.guest_name, pax_adults: orow.pax_adults, pax_kids: orow.pax_kids, meal_plan: orow.meal_plan,
                gem_name: orow.gem_name, stay_dates: orow.stay_dates, preferences: orow.preferences, stay_id: orow.stay_id,
                arrival_time: orow.arrival_time, departure_time: orow.departure_time,
            });
            mergeStay(row, p, D, { namesFromReport: true, gemIfEmpty: true });
            row.status = p.dep === D ? 'DEP' : 'VM/OCC';
            movedFrom.add(ov);
            notes.set(v, `Moved from V${ov}`);
            return;
        }
        // A party we did not know about (checked in without our list being updated)
        startStay(row, p, D, { namesFromReport: true, gemIfEmpty: true });
        row.status = statusFor(p.arr, p.dep, D, 'OCC');
    });

    // Two villas that only swapped guests: our list had them the wrong way round. Correct it, don't call it a move.
    const movedPairs = new Map<string, string>();
    notes.forEach((n, v) => { const x = n.match(/^Moved from V(\d+)$/); if (x) movedPairs.set(v, x[1]); });
    movedPairs.forEach((from, to) => {
        if (movedPairs.get(from) !== to) return;
        [to, from].forEach(v => {
            const row = after.get(v)!;
            const st = rowStay(row, D);
            row.status = statusFor(st.arr, st.dep, D, 'OCC');
            notes.set(v, `Corrected: Opera has this guest in V${v} (was listed in V${movedPairs.get(v)})`);
        });
        movedFrom.delete(from); movedFrom.delete(to);
    });

    // Villas the report does not list
    after.forEach((row, v) => {
        if (touched.has(v) || extensionVillas.includes(v) || isProtected(row.status)) return;
        if (movedFrom.has(v)) { Object.assign(row, EMPTY_STAY, { status: 'VM/VAC' }); return; }
        if (!row.guest_name || !IN_HOUSE.includes(row.status)) return;
        if (['ARR', 'VM/ARR'].includes(row.status)) return;            // arriving today, not checked in yet
        if (row.status === 'DEP/ARR') return;                          // departed; the arrival is not in yet
        if (departsToday(row, D)) { row.status = 'DEP'; return; }      // already checked out today
        notes.set(v, 'Not in the OCC report (early check-out or no show?)');
        Object.assign(row, EMPTY_STAY);
    });

    enforceUniqueGuests(after, touched, notes);
    return finish(rows, s);
};

/** Arrivals XML: today's arrivals only. Arrival time and trace notes are added to the stay. */
export const applyArrivals = (rows: GuestRow[], data: ReturnType<typeof parseArrivalsXml>, D: string): ImportResult => {
    const s = begin(rows);
    if (data.reportDate && data.reportDate !== D) {
        s.warnings.push(`This arrivals report is for ${prettyDate(data.reportDate)}, but the list shows ${prettyDate(D)}. Open ${prettyDate(data.reportDate)} first.`);
        return finish(rows, s);
    }
    const touched = new Set<string>();
    Object.entries(data.byVilla).forEach(([v, parties]) => {
        const row = s.after.get(v);
        if (!row || isProtected(row.status)) return;
        parties.filter(p => p.arr === D).forEach(p => {
            placeArrival(row, p, D, { namesFromReport: true, timesIfEmpty: true }, s.notes);
            touched.add(v);
        });
    });
    enforceUniqueGuests(s.after, touched, s.notes);
    return finish(rows, s);
};

/**
 * Memo: departures first (who leaves today and when), then arrivals (GEM, times, special instructions),
 * then room moves and seaplane crew villas. Names already loaded from Opera are kept: memo names are only
 * used for a party Opera has not given us yet.
 */
export const applyMemo = (rows: GuestRow[], memo: MemoData, D: string, leavingCrew: string[] = []): ImportResult => {
    const s = begin(rows);
    const { after, notes, groups } = s;
    if (memo.reportDate && memo.reportDate !== D) {
        s.warnings.push(`This memo is for ${prettyDate(memo.reportDate)}, but the list shows ${prettyDate(D)}. Open ${prettyDate(memo.reportDate)} first.`);
        return finish(rows, s);
    }
    if (!memo.arrivals.length && !memo.departures.length && !memo.moves.length && !Object.keys(memo.gems).length) {
        s.warnings.push('No arrivals, departures or room moves found in this memo.');
        return finish(rows, s);
    }

    memo.departures.forEach(p => {
        const row = after.get(p.villa);
        if (!row || isProtected(row.status)) return;
        groups.set(p.villa, 'Departure villas');
        const names = joinNames(p.names);
        if (row.status === 'DEP/ARR') {
            if (p.depTime) row.departure_time = p.depTime;
            if (!row.dep_guest_name) row.dep_guest_name = names;
            if (!row.dep_stay_dates && p.arr) row.dep_stay_dates = stayDatesOf(p.arr, D);
            // DEPARTURES section GEM belongs to the departing guest (the GEM table has the arriving guest's)
            if (p.gem) row.dep_gem_name = p.gem;
            return;
        }
        if (row.guest_name && (holdsStay(row, p, D) || isSameGuest(row.guest_name, names) || departsToday(row, D))) {
            mergeStay(row, { ...p, adults: null, kids: null, gem: p.gem || '', prefs: '' }, D, { namesFromReport: false });
            row.status = 'DEP';
            return;
        }
        if (row.guest_name && ['ARR', 'VM/ARR'].includes(row.status)) {
            Object.assign(row, { status: 'DEP/ARR', dep_guest_name: names, dep_stay_dates: stayDatesOf(p.arr, D), departure_time: p.depTime || row.departure_time, dep_gem_name: p.gem || '' });
            return;
        }
        if (row.guest_name && IN_HOUSE.includes(row.status)) {
            notes.set(p.villa, `Memo says ${names} leaves today, but ${row.guest_name} is in this villa`);
            return;
        }
        // Already gone from the in-house list: show them as today's departure
        startStay(row, { ...p, prefs: '' }, D, { namesFromReport: true, gemIfEmpty: true });
        row.status = 'DEP';
    });

    // Room moves BEFORE arrivals: the in-house guest leaves the villa first, then today's arrival comes in.
    // (Done after arrivals, the move took the ARRIVING guest out of the villa.)
    const AMENDED = 'Amended — check these';
    const arrivingToday = (row: GuestRow) => !!row.guest_name && /ARR/.test(row.status) && rowStay(row, D).arr === D;
    const moveTargets = new Set(memo.moves.map(m => m.to));

    /** Put the moving guest's stay (taken from `src`) into villa `to`. False when someone else is in house there. */
    const moveInto = (src: GuestRow, to: GuestRow, m: { from: string; to: string; time: string }, moveNote: string[]) => {
        // A booking that ends on the move day is common when the move is re-booked: they are NOT leaving,
        // the stay continues in the new villa with a new departure date.
        const moved = { ...src };
        const fs = rowStay(src, D);
        if (src.status === 'DEP' || (fs.dep && fs.dep <= D)) {
            moved.stay_dates = stayDatesOf(fs.arr, '');
            moveNote.push('new booking after the move: set the new departure date');
        }
        const stayFields = {
            guest_name: moved.guest_name, pax_adults: moved.pax_adults, pax_kids: moved.pax_kids, meal_plan: moved.meal_plan,
            gem_name: moved.gem_name, stay_dates: moved.stay_dates, preferences: moved.preferences, stay_id: moved.stay_id,
        };
        if (!to.guest_name) {
            Object.assign(to, stayFields, { arrival_time: m.time || moved.arrival_time || '', departure_time: '' });
            to.status = /ARR/.test(to.status) ? 'VM/ARR' : 'VM/OCC';
            return true;
        }
        if (to.status === 'DEP' || departsToday(to, D)) {
            // The new villa's guest checks out today, then the moving guest comes in: back-to-back
            Object.assign(to, depSideOf(to, true), stayFields, { status: 'DEP/ARR', arrival_time: m.time || '' });
            moveNote.push(`after ${to.dep_guest_name} checks out`);
            return true;
        }
        notes.set(m.to, `Room move from V${m.from}, but ${to.guest_name} is in house here: check the move`);
        return false;
    };

    // Moves out of a villa that only gets today's arrival: the arriving guest is placed there first, then moved
    // (e.g. arrives in 97, moves to 8 at 13:00). Done after the arrivals below.
    const lateMoves: typeof memo.moves = [];
    const memoArrVillas = new Set(memo.arrivals.map(a => a.villa));

    memo.moves.forEach(m => {
        const from = after.get(m.from), to = after.get(m.to);
        if (!from || !to) return;
        groups.set(m.from, 'Villa moves'); groups.set(m.to, 'Villa moves');
        const moveNote = [`Room move from V${m.from}${m.time ? ` at ${m.time}` : ''}`];

        // Departing guest moved out of their villa until a late check-out: DAY USE in the new villa.
        // The memo still lists them under DEPARTURES, so the old villa keeps its departure (and any arrival).
        const dayUse = /DAY\s*USE/i.test(m.reason || '');
        const leaving = memo.departures.find(d => d.villa === m.from)
            || (dayUse ? { villa: m.from, names: [], adults: null, kids: null, mealPlan: '', gem: '', arr: '', dep: D, depTime: to24h((m.reason || '').replace(/.*TILL/i, '')) } as Party : undefined);
        if (leaving && from.guest_name && (from.status === 'DEP' || from.status === 'DEP/ARR' || departsToday(from, D) || dayUse)) {
            const b2b = from.status === 'DEP/ARR';
            const guest = b2b ? from.dep_guest_name || '' : from.guest_name;
            const free = !to.guest_name || ['VAC', 'VM/VAC'].includes(to.status) || (to.status === 'DAY USE' && isSameGuest(to.guest_name, guest));
            if (!free) {
                notes.set(m.to, `Day use for ${guest} from V${m.from}, but ${to.guest_name} is in this villa: check the move`);
                return;
            }
            Object.assign(to, EMPTY_STAY, {
                status: 'DAY USE', guest_name: guest,
                pax_adults: b2b ? 0 : from.pax_adults, pax_kids: b2b ? 0 : from.pax_kids, meal_plan: b2b ? '' : from.meal_plan,
                gem_name: (b2b ? from.dep_gem_name : from.gem_name) || leaving.gem || '',
                stay_dates: (b2b ? from.dep_stay_dates : from.stay_dates) || '',
                stay_id: b2b ? '' : from.stay_id || '',
                arrival_time: m.time || '', departure_time: leaving.depTime || from.departure_time || '',
            });
            notes.set(m.to, `Day use: ${guest} moves here from V${m.from}${m.time ? ` at ${m.time}` : ''} until check-out${to.departure_time ? ` (${to.departure_time})` : ''}`);
            return;
        }

        // The villa already holds today's arrival (or is empty): the move was applied by an earlier memo.
        // If the revised memo sends the guest to a different villa, they are in the old target: take them from there.
        if (!from.guest_name || arrivingToday(from)) {
            if (to.guest_name && /^VM\//.test(to.status) && !arrivingToday(to)) return; // already moved here
            const prev = Array.from(after.entries()).find(([v, r]) =>
                v !== m.to && v !== m.from && !moveTargets.has(v) && /^VM\/(OCC|ARR)$/.test(r.status) && !!r.guest_name && !arrivingToday(r) &&
                (!m.time || !r.arrival_time || r.arrival_time === m.time));
            if (prev) {
                const [pv, prow] = prev;
                if (!moveInto(prow, to, m, moveNote)) return;
                Object.assign(prow, EMPTY_STAY, { status: 'VAC' });
                groups.set(pv, AMENDED); groups.set(m.to, AMENDED);
                notes.set(pv, `Room move changed: ${to.guest_name} now moves to V${m.to}, not here (revised memo)`);
                notes.set(m.to, [...moveNote, `was V${pv} in the earlier memo`].join(' — '));
                return;
            }
            // The arriving guest moves only when the move is after their arrival (arrives 17:00, moves 20:00).
            // A move before the arrival is the in-house guest leaving the villa: we just don't have them in the list.
            const arrHere = memo.arrivals.find(a => a.villa === m.from);
            if (arrHere && m.time && arrHere.arrTime && m.time > arrHere.arrTime) { lateMoves.push(m); return; }
            if (arrHere || arrivingToday(from)) {
                groups.set(m.from, AMENDED);
                notes.set(m.from, `Room move V${m.from} → V${m.to}${m.time ? ` at ${m.time}` : ''}${m.reason ? ` (${m.reason})` : ''}: the guest moving out of V${m.from} is not in the list. Load the OCC report or move them by hand`);
                return;
            }
        }

        if (from.guest_name && isSameGuest(to.guest_name, from.guest_name)) {
            // OCC already has them in the new villa: just clear the old one
            Object.assign(from, EMPTY_STAY);
        } else if (from.guest_name) {
            if (!moveInto(from, to, m, moveNote)) return;
            Object.assign(from, EMPTY_STAY);
        } else if (to.guest_name && !['DEP/ARR', 'DEP'].includes(to.status)) {
            to.status = /ARR/.test(to.status) ? 'VM/ARR' : 'VM/OCC';
        }
        if (!from.guest_name) from.status = 'VM/VAC';
        notes.set(m.to, moveNote.join(' — '));
    });

    // Arrivals. A revised memo can give a villa to a different party (e.g. two families swap villas).
    // Every arrival today has the same arrival date, so the date alone can't tell stays apart: compare the
    // names strictly, and when the party was listed in another villa, bring that stay (Opera names, pax...) over.
    const snap = new Map(Array.from(after.entries()).map(([v, r]) => [v, { ...r }]));
    memo.arrivals.forEach(p => {
        const row = after.get(p.villa);
        if (!row || isProtected(row.status)) return;
        groups.set(p.villa, 'Arrival villas'); // DEP/ARR villas sit here: the arriving guest is the one staying
        const names = joinNames(p.names);
        const held = snap.get(p.villa)!;
        if (names && arrivingToday(held) && !samePartyStrict(held.guest_name, names)) {
            const src = Array.from(snap.entries()).find(([u, r]) => u !== p.villa && arrivingToday(r) && samePartyStrict(r.guest_name, names));
            // Without a source villa, only call it a different party when not even a surname is shared
            // ("Kate Gaskell" in Opera vs "Katherine Gaskell" in the memo is the same guest).
            const words = (x: string) => new Set(cleanWords(x));
            const shareWord = [...words(held.guest_name)].some(w => words(names).has(w));
            if (src || !shareWord) {
                const arriving = src
                    ? { guest_name: src[1].guest_name, pax_adults: src[1].pax_adults, pax_kids: src[1].pax_kids, meal_plan: src[1].meal_plan,
                        gem_name: src[1].gem_name, stay_dates: src[1].stay_dates, preferences: src[1].preferences, arrival_time: src[1].arrival_time || '' }
                    : { guest_name: '', pax_adults: 0, pax_kids: 0, meal_plan: '', gem_name: '', stay_dates: '', preferences: '', arrival_time: '' };
                Object.assign(row, arriving, { stay_id: src ? stayIdOf(p.villa, D) : '' });
                groups.set(p.villa, AMENDED);
                notes.set(p.villa, `Revised memo: was ${held.guest_name}${src ? ` — this party was in V${src[0]}` : ''}`);
            }
        }
        placeArrival(row, p, D, { namesFromReport: false, replacePrefs: true }, notes);

        // Same party already in house in another villa since an earlier day: the memo wrote a room move as an
        // arrival. Clear the old villa and keep the stay's real arrival / departure dates.
        if (names) {
            const old = Array.from(after.entries()).find(([u, r]) => u !== p.villa && !!r.guest_name &&
                ['OCC', 'VM/OCC', 'DEP'].includes(r.status) && rowStay(r, D).arr && rowStay(r, D).arr < D && samePartyStrict(r.guest_name, names));
            if (old) {
                const [u, orow] = old;
                const os = rowStay(orow, D);
                const ns = rowStay(row, D);
                row.stay_dates = stayDatesOf(os.arr, ns.dep && ns.dep !== D ? ns.dep : os.dep);
                if (orow.stay_id) row.stay_id = orow.stay_id;
                if (!row.gem_name) row.gem_name = orow.gem_name;
                if (row.status === 'ARR') row.status = 'VM/OCC';
                else if (row.status === 'VM/ARR') row.status = 'VM/OCC';
                Object.assign(orow, EMPTY_STAY, { status: 'VM/VAC' });
                groups.set(u, 'Villa moves'); groups.set(p.villa, 'Villa moves');
                notes.set(u, `${row.guest_name} moved to V${p.villa} (memo lists it as an arrival)`);
                notes.set(p.villa, `Moved from V${u}: in house since ${os.arr} (memo lists it as an arrival)`);
            }
        }
    });

    lateMoves.forEach(m => {
        const from = after.get(m.from)!, to = after.get(m.to)!;
        const moveNote = [`Arrives in V${m.from}, moves here${m.time ? ` at ${m.time}` : ''}`];
        if (!from.guest_name) return;
        if (isSameGuest(to.guest_name, from.guest_name)) {
            Object.assign(from, EMPTY_STAY, { status: 'VM/VAC' }); // moved by an earlier import of this memo
            return;
        }
        if (!moveInto(from, to, m, moveNote)) return;
        if (to.status === 'VM/OCC') to.status = 'VM/ARR';
        Object.assign(from, EMPTY_STAY, { status: 'VM/VAC' });
        notes.set(m.to, moveNote.join(' — '));
        notes.set(m.from, `${to.guest_name} arrives here, then moves to V${m.to}`);
    });

    // Amended memo: today's arrivals / departures in our list that the memo no longer has.
    // The memo lists every arrival and departure of the day, so a missing one was cancelled, moved or extended.
    const memoArr = new Set([...memo.arrivals.map(a => a.villa), ...lateMoves.map(m => m.to)]);
    if (memo.arrivals.length) after.forEach((row, v) => {
        if (memoArr.has(v) || isProtected(row.status) || !row.guest_name) return;
        if (!['ARR', 'VM/ARR', 'DEP/ARR'].includes(row.status) || rowStay(row, D).arr !== D) return;
        const movedTo = memo.arrivals.find(a => isSameGuest(joinNames(a.names), row.guest_name));
        const who = row.guest_name;
        if (row.status === 'DEP/ARR') {
            // Keep the departing guest, drop the arrival
            const dep = depSideOf(row);
            Object.assign(row, EMPTY_STAY, {
                status: 'DEP', guest_name: dep.dep_guest_name, stay_dates: dep.dep_stay_dates, departure_time: dep.departure_time,
                gem_name: dep.dep_gem_name, stay_id: stayIdOf(v, parseStayRange(dep.dep_stay_dates, D).arr),
            });
        } else Object.assign(row, EMPTY_STAY, { status: row.status === 'VM/ARR' ? 'VM/VAC' : 'VAC' });
        groups.set(v, AMENDED);
        notes.set(v, movedTo ? `${who} now arrives in V${movedTo.villa} (revised memo)` : `${who} is no longer in the memo arrivals: cancelled? Discard this line if they are still coming`);
    });
    const memoDep = new Set(memo.departures.map(d => d.villa));
    const movingOut = new Set(memo.moves.map(m => m.from)); // explained by the room move below
    if (memo.departures.length) after.forEach((row, v) => {
        if (memoDep.has(v) || movingOut.has(v) || isProtected(row.status) || !row.guest_name) return;
        if (row.status === 'DEP' || (row.status === 'DEP/ARR' && row.dep_guest_name)) {
            groups.set(v, AMENDED);
            notes.set(v, `${row.status === 'DEP' ? row.guest_name : row.dep_guest_name} is no longer in the memo departures: extended? Fix the dates in the list`);
        }
    });

    // GEM table covers every villa in house. On a DEP/ARR villa it is the ARRIVING guest's GEM (the row's gem_name).
    // A GEM given in the Arrivals section itself wins over the table.
    // A villa that only has a departure keeps the GEM from the DEPARTURES section.
    const arrGem = new Set(memo.arrivals.filter(a => a.gem).map(a => a.villa));
    const depGem = new Set(memo.departures.filter(d => d.gem).map(d => d.villa));
    Object.entries(memo.gems).forEach(([v, gem]) => {
        const row = after.get(v);
        if (!row || !row.guest_name || !IN_HOUSE.includes(row.status) || arrGem.has(v) || row.gem_name === gem) return;
        if (row.status === 'DEP' && depGem.has(v)) return;
        row.gem_name = gem;
        if (!groups.has(v)) groups.set(v, 'GEM allocation');
    });

    const crewSeen = new Map<string, string>();
    memo.crew.forEach(c => {
        const row = after.get(c.villa);
        if (!row) return;
        const label = c.flight || c.shift;
        if (crewSeen.has(c.villa)) {
            if (crewSeen.get(c.villa) !== label) s.warnings.push(`Memo puts two seaplane crews in villa ${c.villa} (${crewSeen.get(c.villa)} and ${label}). Check the crew villas.`);
            return;
        }
        crewSeen.set(c.villa, label);
        groups.set(c.villa, 'Seaplane crew');
        if (row.guest_name && IN_HOUSE.includes(row.status)) {
            const crew = `seaplane crew (${c.shift}${c.flight ? `, ${c.flight}` : ''})`;
            notes.set(c.villa, row.status === 'DEP'
                ? `Memo puts ${crew} here after ${row.guest_name} checks out${row.departure_time ? ` at ${row.departure_time}` : ''}: set the villa to TMA on the Allocation page if they come`
                : `Memo lists ${crew} but a guest is in this villa`);
            return;
        }
        row.status = c.shift === 'Day' ? 'TMA (Day)' : 'TMA (Night)';
        const t = memo.crewTimes;
        if (t && c.shift === 'Day') { if (t.dayArr) row.arrival_time = t.dayArr; if (t.dayDep) row.departure_time = t.dayDep; }
        // Night crew arrives with its own seaplane (the crew table heading names it), else the night-shutdown flight
        const nightArr = (c.flight && memo.flightArr?.[c.flight]) || t?.nightArr;
        if (c.shift === 'Night' && nightArr) row.arrival_time = nightArr;
    });

    // Last night's crew leaves this morning: their check-out time goes on today's row of that villa
    // (VAC / guest arriving / new crew), where the allocation board and sheet read it as the TMA departure.
    const leaveTime = memo.crewTimes?.nightLeave;
    if (leaveTime) leavingCrew.forEach(v => {
        const row = after.get(v);
        if (!row || row.status === 'DEP/ARR' || row.status === 'DEP' || ['OCC', 'VM/OCC'].includes(row.status)) return;
        if (row.departure_time === leaveTime) return;
        row.departure_time = leaveTime;
        if (!groups.has(v)) groups.set(v, 'Seaplane crew');
        notes.set(v, `Last night's seaplane crew checks out at ${leaveTime}`);
    });

    return finish(rows, s);
};

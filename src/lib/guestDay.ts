// One shared way to read the guest list for a day, used by the Guest List page, the allocation board
// and the Front Office page so they always show the same villa status.
import { supabase } from '@/lib/supabase';
import { getSpecialKind, isOpenStay, serviceRemarkFor } from '@/lib/specialVillas';

export const normalizeVilla = (raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw).trim();
    const match = str.match(/^(\d{1,3})/); 
    if (!match) return null;
    return parseInt(match[1], 10).toString();
};

type DepInfo = { name: string; time: string; dates: string };

export const extractDepInfo = (remarksStr?: string): { cleanRemarks: string; depInfo: DepInfo | null } => {
    const raw = String(remarksStr || '');
    const match = raw.match(/\[DEP_INFO\](.*?)\[\/DEP_INFO\]/);
    if (!match) return { cleanRemarks: raw.trim(), depInfo: null };
    const cleanRemarks = raw.replace(/\[DEP_INFO\].*?\[\/DEP_INFO\]/g, '').trim();
    try {
        const parsed = JSON.parse(match[1]);
        return {
            cleanRemarks,
            depInfo: {
                name: parsed.name || '',
                time: parsed.time || '',
                dates: parsed.dates || ''
            }
        };
    } catch {
        return { cleanRemarks, depInfo: null };
    }
};

// stay_dates is "DD/MM - DD/MM" (no year). Years are inferred relative to the selected date so Dec→Jan stays work.
export const checkStayStatusForDate = (stayDatesStr: string, selectedDateStr: string): { isActive: boolean; isDepartingToday: boolean } => {
    const inactive = { isActive: false, isDepartingToday: false };
    if (!stayDatesStr || !stayDatesStr.includes('-')) return inactive;
    const parts = stayDatesStr.split('-');
    if (parts.length !== 2) return inactive;

    const parseDM = (str: string) => {
        const p = str.trim().split('/').map(Number);
        if (p.length < 2 || p.some(isNaN)) return null;
        return { d: p[0], m: p[1], y: p.length === 3 ? (p[2] < 100 ? 2000 + p[2] : p[2]) : null as number | null };
    };

    const arr = parseDM(parts[0]);
    const dep = parseDM(parts[1]);
    if (!dep) return inactive;

    const [selY, selM, selD] = selectedDateStr.split('-').map(Number);
    const sel = new Date(selY, selM - 1, selD).getTime();
    const HALF_YEAR = 182 * 86400000;

    let arrTime: number | null = null;
    if (arr) {
        let arrY = arr.y ?? selY;
        if (arr.y === null && new Date(arrY, arr.m - 1, arr.d).getTime() - sel > HALF_YEAR) arrY -= 1;
        arrTime = new Date(arrY, arr.m - 1, arr.d).getTime();
    }

    let depY = dep.y ?? (arrTime !== null ? new Date(arrTime).getFullYear() : selY);
    let depTime = new Date(depY, dep.m - 1, dep.d).getTime();
    if (dep.y === null && arrTime !== null && depTime < arrTime) {
        depY += 1;
        depTime = new Date(depY, dep.m - 1, dep.d).getTime();
    }

    if (sel === depTime) return { isActive: true, isDepartingToday: true };
    if (sel < depTime && (arrTime === null || arrTime <= sel)) return { isActive: true, isDepartingToday: false };
    return inactive;
};

/**
 * Rows of hsk_daily_summary for `date`. When the day hasn't been saved yet (or only holds villas
 * pre-registered on Special Villas), it is projected from the latest saved day: guests still in house
 * stay OCC (or become DEP on their departure day), House Use carries on, everything else is VAC.
 */
export const projectGuestDay = async (date: string): Promise<{ rows: any[]; isProjected: boolean }> => {
    const { data: allRecords, error } = await supabase.from('hsk_daily_summary').select('*').eq('report_date', date);
    if (error) console.error(error);
    // The day's stats row (villa_number 0 / null, Summary board) shares this table: it is not a villa and must not
    // count as "this day is saved", or the projection is skipped and every villa shows vacant.
    const isVillaRow = (r: any) => Number(normalizeVilla(r.villa_number)) > 0;
    const dbRecords = (allRecords || []).filter(isVillaRow);
    const preRegistered = (dbRecords || []).filter(r => getSpecialKind(r.status));
    if (dbRecords && dbRecords.length > 0 && preRegistered.length !== dbRecords.length) return { rows: dbRecords, isProjected: false };

    // Source = the latest day with a real guest list. Days ahead can already hold only pre-registered special rows
    // (house use is written a month ahead, TMA departure days...): those days are not a guest list to copy.
    const { data: lastFull } = await supabase
        .from('hsk_daily_summary')
        .select('report_date')
        .lt('report_date', date)
        .not('status', 'ilike', '%HOUSE%').not('status', 'ilike', '%TMA%').not('status', 'ilike', '%SHOW%').not('status', 'ilike', '%FUMIG%')
        .not('villa_number', 'in', '("0")')
        .order('report_date', { ascending: false })
        .limit(1);
    const latestDate = lastFull?.[0]?.report_date;
    if (!latestDate) return { rows: dbRecords, isProjected: false };
    const { data: sourceRows } = await supabase.from('hsk_daily_summary').select('*').eq('report_date', latestDate);
    const sourceData = (sourceRows || []).filter(isVillaRow);
    const projected = sourceData.map(r => {
        const statusStr = String(r.status || 'VAC').trim().toUpperCase();
        if (['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR'].includes(statusStr)) {
            const check = checkStayStatusForDate(r.stay_dates || '', date);
            if (check.isActive) {
                const { cleanRemarks } = extractDepInfo(r.remarks);
                return {
                    ...r,
                    report_date: date,
                    status: check.isDepartingToday ? 'DEP' : (statusStr.includes('VM') ? statusStr : 'OCC'),
                    arrival_time: check.isDepartingToday ? '' : (r.arrival_time || ''),
                    departure_time: check.isDepartingToday ? (r.departure_time || '') : '',
                    remarks: cleanRemarks,
                };
            }
        } else if (statusStr.includes('HOUSE') && (!r.stay_dates || isOpenStay(r.stay_dates) || checkStayStatusForDate(r.stay_dates, date).isActive)) {
            // House Use carries until its departure date (or forever while open); Show Villa / TMA / Fumigation are one-off
            return { ...r, report_date: date, arrival_time: '', remarks: serviceRemarkFor(r.preferences, date) };
        }
        return {
            ...r, report_date: date, status: 'VAC', guest_name: '', pax_adults: 0, pax_kids: 0, arrival_time: '', departure_time: '',
            stay_dates: '', meal_plan: '', gem_name: '', preferences: '', remarks: '', stay_id: '',
        };
    // Drop the source day's ids: saving a projected row must insert for this day, not move the previous day's row.
    }).map(r => ({ ...r, id: undefined }));
    const preVillas = new Set(preRegistered.map(r => normalizeVilla(r.villa_number)));
    return { rows: [...preRegistered, ...projected.filter(r => !preVillas.has(normalizeVilla(r.villa_number)))], isProjected: true };
};

/** villa number → { status, arrival, departure } for the allocation board and Front Office page. */
export type VillaStatus = { status: string; arrival: string; departure: string };
export const villaStatusMap = (rows: any[]) => {
    const map: Record<number, VillaStatus> = {};
    rows.forEach(r => {
        const v = normalizeVilla(r.villa_number);
        if (!v) return;
        const { depInfo } = extractDepInfo(r.remarks);
        map[Number(v)] = {
            status: String(r.status || 'VAC').trim().toUpperCase(),
            arrival: r.arrival_time || '',
            departure: depInfo?.time || r.departure_time || '',
        };
    });
    return map;
};

// ---------------------------------------------------------------------------
// Housekeeping status of a villa for a day. The guest list keeps one status per villa; combined
// situations are worked out from today's row and yesterday's row:
//   DEP/FUM    guest departs today, villa is fumigated after
//   DEP/TMA N  guest departs today, TMA night crew arrives
//   TMA/TMA    last night's TMA leaves and a new TMA night crew arrives
//   TMA/ARR    last night's TMA leaves and a guest arrives
//   TMA DEP    last night's TMA leaves, villa is then vacant
//   JOIN       a joining guest arrives in an occupied villa
// ---------------------------------------------------------------------------
// bg / text are the same colours as `cls` in hex, for the printed allocation sheet (SVG).
export type HKStatus = { code: string; label: string; title: string; cls: string; bg: string; text: string };

const IN_HOUSE = ['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR'];
const look = (code: string, title: string, cls: string, bg: string, text = '#ffffff'): HKStatus => ({ code, label: code, title, cls, bg, text });

// Solid colours only (no gradients, no black); each status has its own colour.
export const HK_STATUS_KEY: HKStatus[] = [
    look('VAC', 'Vacant', 'bg-slate-100 text-slate-500', '#f1f5f9', '#64748b'),
    look('OCC', 'Occupied (stay-over)', 'bg-emerald-500 text-white', '#10b981'),
    look('ARR', 'Arrival to a vacant villa', 'bg-blue-600 text-white', '#2563eb'),
    look('JOIN', 'Joining guest arrives in an occupied villa', 'bg-cyan-600 text-white', '#0891b2'),
    look('DEP', 'Departure', 'bg-rose-500 text-white', '#f43f5e'),
    look('DEP/ARR', 'Back-to-back: departure then arrival', 'bg-purple-600 text-white', '#9333ea'),
    look('DEP/FUM', 'Departure, then fumigation', 'bg-red-700 text-white', '#b91c1c'),
    look('FUM', 'Fumigation', 'bg-teal-600 text-white', '#0d9488'),
    look('H/U', 'House use', 'bg-fuchsia-500 text-white', '#d946ef'),
    look('SHOW', 'Show villa', 'bg-pink-400 text-white', '#f472b6'),
    look('TMA D', 'TMA day shut', 'bg-orange-400 text-white', '#fb923c'),
    look('TMA N', 'TMA night shut (to a vacant villa)', 'bg-indigo-600 text-white', '#4f46e5'),
    look('DEP/TMA N', 'Departure, then TMA night shut', 'bg-violet-500 text-white', '#8b5cf6'),
    look('TMA/TMA', 'TMA leaves and a new TMA night shut arrives', 'bg-indigo-800 text-white', '#3730a3'),
    look('TMA/ARR', 'TMA leaves and a guest arrives', 'bg-sky-700 text-white', '#0369a1'),
    look('TMA DEP', 'TMA from last night leaves, villa vacant', 'bg-indigo-200 text-indigo-900', '#c7d2fe', '#312e81'),
    look('VM/DU', 'Day use: guest moved here until late check-out', 'bg-amber-400 text-amber-950', '#fbbf24', '#451a03'),
    look('VM/VAC', 'Villa move: guest moved out, villa vacant', 'bg-slate-300 text-slate-700', '#cbd5e1', '#334155'),
    look('VM/OCC', 'Villa move: guest moved in (stay-over)', 'bg-lime-600 text-white', '#65a30d'),
    look('VM/ARR', 'Villa move: guest moved out and an arrival comes in', 'bg-sky-500 text-white', '#0ea5e9'),
];
const BY_CODE = Object.fromEntries(HK_STATUS_KEY.map(s => [s.code, s]));

export const deriveHKStatus = (today: any | undefined, prev: any | undefined, date: string): HKStatus => {
    const st = String(today?.status || 'VAC').trim().toUpperCase();
    const ps = String(prev?.status || '').trim().toUpperCase();
    const prevTmaNight = ps.includes('TMA') && !ps.includes('DAY');
    const prevDepartsToday = !!prev && IN_HOUSE.includes(ps) && checkStayStatusForDate(prev.stay_dates || '', date).isDepartingToday;
    const prevStays = !!prev && IN_HOUSE.includes(ps) && checkStayStatusForDate(prev.stay_dates || '', date).isActive && !prevDepartsToday;
    const pick = (c: string) => BY_CODE[c];

    if (st.includes('FUMIG')) return pick(prevDepartsToday ? 'DEP/FUM' : 'FUM');
    if (st.includes('TMA') && st.includes('DAY')) return pick('TMA D');
    if (st.includes('TMA')) return pick(prevTmaNight ? 'TMA/TMA' : prevDepartsToday ? 'DEP/TMA N' : 'TMA N');
    if (st === 'DEP/ARR') return pick('DEP/ARR');
    if (st === 'VM/ARR') return pick('VM/ARR');
    if (st === 'VM/OCC') return pick('VM/OCC');
    if (st === 'VM/VAC') return pick('VM/VAC');
    if (st === 'DAY USE' || st === 'VM/DU') return pick('VM/DU');
    if (st === 'ARR') return pick(prevTmaNight ? 'TMA/ARR' : prevDepartsToday ? 'DEP/ARR' : prevStays ? 'JOIN' : 'ARR');
    if (st.includes('DEP')) return pick('DEP');
    if (st.includes('HOUSE')) return pick('H/U');
    if (st.includes('SHOW')) return pick('SHOW');
    if (st.includes('OCC')) return pick('OCC');
    if (prevTmaNight) return pick('TMA DEP');
    return pick('VAC');
};

/** Movement time shown next to a status: arrival / departure time, both for back-to-back (D 12:00 A 14:30).
 *  `prev` = yesterday's row for the villa: a TMA crew or guest leaving today may only have its time there. */
export const movementTime = (hk: HKStatus, info?: VillaStatus, prev?: VillaStatus) => {
    // TMA: crew arrival and / or departure (TMA D has both the same day)
    if (hk.code.includes('TMA')) {
        const dep = (hk.code !== 'TMA N' && (info?.departure || prev?.departure)) || '';
        const arr = hk.code === 'TMA DEP' ? '' : info?.arrival || '';
        return [dep && `D ${dep}`, arr && `A ${arr}`].filter(Boolean).join(' ');
    }
    if (!info) return '';
    if (hk.code === 'DEP/ARR') return [info.departure && `D ${info.departure}`, info.arrival && `A ${info.arrival}`].filter(Boolean).join(' ');
    if (hk.code.includes('ARR') || hk.code === 'JOIN') return info.arrival || '';
    if (hk.code.startsWith('DEP')) return info.departure || '';
    return '';
};

/** Printed allocation sheet: every TMA status is one orange, except TMA leaving + guest arriving (TMA/ARR). */
export const SHEET_TMA_BG = '#fb923c';
export const sheetColours = (hk: HKStatus) =>
    hk.code.includes('TMA') && hk.code !== 'TMA/ARR' ? { bg: SHEET_TMA_BG, text: '#ffffff' } : { bg: hk.bg, text: hk.text };

/** villa number → raw guest-list row */
export const rowsByVilla = (rows: any[]) => {
    const map: Record<number, any> = {};
    rows.forEach(r => { const v = normalizeVilla(r.villa_number); if (v) map[Number(v)] = r; });
    return map;
};

// Shared definitions for "special" villa statuses (TMA, House Use, Show Villa, Fumigation, Standby, MOD Check).
// These are written into hsk_daily_summary by /allocation/special and read by the Guest List and boards.

export type SpecialKind = 'TMA_NIGHT' | 'TMA_DAY' | 'HOUSE_USE' | 'SHOW_VILLA' | 'FUMIGATION' | 'STANDBY' | 'MOD_CHECK';

// Canonical status strings (match the Guest List status dropdown).
export const SPECIAL_STATUS: Record<SpecialKind, string> = {
  TMA_NIGHT: 'TMA (Night)',
  TMA_DAY: 'TMA (Day)',
  HOUSE_USE: 'HOUSE USE',
  SHOW_VILLA: 'SHOW VILLA',
  FUMIGATION: 'FUMIGATION',
  STANDBY: 'STANDBY',       // vacant villa kept ready (stand-by room)
  MOD_CHECK: 'MOD CHECK',   // vacant villa the MOD must check; checkout date kept in remarks ("CHECKOUT 2026-11-14")
};

// Also understands legacy spellings such as "TMA NIGHT" / "TMA DAY".
export const getSpecialKind = (status?: string | null): SpecialKind | null => {
  const st = String(status || '').toUpperCase();
  if (st.includes('TMA')) return st.includes('NIGHT') ? 'TMA_NIGHT' : 'TMA_DAY';
  if (st.includes('HOUSE')) return 'HOUSE_USE';
  if (st.includes('SHOW')) return 'SHOW_VILLA';
  if (st.includes('FUMIG')) return 'FUMIGATION';
  if (st.includes('STANDBY') || st.includes('STAND BY')) return 'STANDBY';
  if (/\bMOD\b/.test(st)) return 'MOD_CHECK';
  return null;
};

// MOD Check: the guest's checkout date, stored in remarks as "CHECKOUT YYYY-MM-DD"
export const modCheckoutRemark = (ymd: string) => (ymd ? `CHECKOUT ${ymd}` : '');
export const modCheckoutOf = (remarks?: string | null) => String(remarks || '').match(/CHECKOUT\s+(\d{4}-\d{2}-\d{2})/i)?.[1] || '';

export const SERVICE_TAG = 'SERVICE DAY';
export const isServiceDay = (remarks?: string | null) => String(remarks || '').toUpperCase().includes(SERVICE_TAG);

// ---- Date helpers (YYYY-MM-DD, local time, no timezone drift) ----
export const toYMD = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

export const todayYMD = () => toYMD(new Date());

export const parseYMD = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (ymd: string, n: number) => {
  const dt = parseYMD(ymd);
  dt.setDate(dt.getDate() + n);
  return toYMD(dt);
};

export const daysBetween = (from: string, to: string) =>
  Math.round((parseYMD(to).getTime() - parseYMD(from).getTime()) / 86400000);

// Inclusive list of dates. Capped to avoid runaway loops on bad input.
export const dateRange = (from: string, to: string, cap = 120) => {
  const out: string[] = [];
  if (!from || !to || to < from) return out;
  let cur = from;
  while (cur <= to && out.length < cap) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
};

// "DD/MM - DD/MM" — same format the Guest List uses for stay_dates.
// Without a departure it is open-ended: "DD/MM - ".
export const toStayDates = (from: string, to?: string | null) => {
  const dm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
  return to ? `${dm(from)} - ${dm(to)}` : `${dm(from)} - `;
};
export const isOpenStay = (stay?: string | null) => /^\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*-$/.test(String(stay || '').trim());

export const prettyDate = (ymd: string, withWeekday = true) =>
  parseYMD(ymd).toLocaleDateString('en-GB', {
    ...(withWeekday ? { weekday: 'short' as const } : {}),
    day: 'numeric',
    month: 'short',
  });

// ---- Fumigation ----
// A free villa gets status FUMIGATION. A villa with a guest (usually a departure) keeps its status
// and gets this tag in remarks, so departure details are not lost.
export const FUMIGATION_TAG = 'FUMIGATION';
export const hasFumigationTag = (remarks?: string | null) => String(remarks || '').toUpperCase().includes(FUMIGATION_TAG);
export const addFumigationTag = (remarks?: string | null) =>
  hasFumigationTag(remarks) ? String(remarks) : [String(remarks || '').trim(), FUMIGATION_TAG].filter(Boolean).join(' · ');
export const stripFumigationTag = (remarks?: string | null) =>
  String(remarks || '').replace(/\s*·?\s*FUMIGATION\s*·?\s*/gi, ' ').trim();

// ---- House Use: PM account + service plan, stored in `preferences` so Guest List rollover carries it ----
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const HOUSE_USE_HORIZON = 30; // open stays are written this many days ahead; rollover carries them after that

export type ServicePlan = { mode: 'DAILY' | 'ALT' | 'WEEKDAYS'; weekdays: number[]; anchor: string };

export const planLabel = (p: ServicePlan) =>
  p.mode === 'DAILY' ? 'Full service' : p.mode === 'ALT' ? 'Every 2nd day'
    : p.weekdays.length ? [...p.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => WEEKDAYS[d]).join(', ') : 'No service';

export const formatHouseUseNotes = (pm: string, plan: ServicePlan) => {
  const service = plan.mode === 'DAILY' ? 'Daily'
    : plan.mode === 'ALT' ? `Every 2nd day from ${plan.anchor}`
    : plan.weekdays.length ? planLabel(plan) : 'None';
  return [pm.trim() ? `PM: ${pm.trim()}` : '', `Service: ${service}`].filter(Boolean).join(' · ');
};

export const parseHouseUseNotes = (notes?: string | null): { pm: string; plan: ServicePlan | null } => {
  const text = String(notes || '');
  const pm = text.match(/PM:\s*([^·]+)/i)?.[1].trim() || '';
  const svc = text.match(/Service:\s*([^·]+)/i)?.[1].trim();
  if (!svc) return { pm, plan: null };
  if (/^daily/i.test(svc)) return { pm, plan: { mode: 'DAILY', weekdays: [], anchor: '' } };
  const alt = svc.match(/Every 2nd day from (\d{4}-\d{2}-\d{2})/i);
  if (alt) return { pm, plan: { mode: 'ALT', weekdays: [], anchor: alt[1] } };
  const days = svc.split(/[,\s]+/).map(w => WEEKDAYS.findIndex(d => d.toLowerCase() === w.slice(0, 3).toLowerCase())).filter(i => i >= 0);
  return { pm, plan: { mode: 'WEEKDAYS', weekdays: days, anchor: '' } };
};

// Arrival day is never a service day (villa is prepared for arrival).
export const isPlannedService = (plan: ServicePlan, date: string, arrival?: string) => {
  if (arrival && date <= arrival) return false;
  if (plan.mode === 'DAILY') return true;
  if (plan.mode === 'ALT') { const d = daysBetween(plan.anchor, date); return d > 0 && d % 2 === 0; }
  return plan.weekdays.includes(parseYMD(date).getDay());
};

// Remark for a carried-forward House Use row (used by Guest List rollover / projection).
export const serviceRemarkFor = (notes: string | null | undefined, date: string) => {
  const { plan } = parseHouseUseNotes(notes);
  return plan && isPlannedService(plan, date) ? SERVICE_TAG : '';
};

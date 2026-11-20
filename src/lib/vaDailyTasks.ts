// Villa attendant's daily task list (My Tasks), per villa, for one day:
//   Milk         today's milk list (Guest History → Daily milk)
//   Ice          daily ice requests (Allocation → Summary), until the guest departs
//   Preferences  the guest's preferences / notes from the guest list
//   Requests     anything sent from the Requests page for the villa today, except minibar
// Milk / ice / preference ticks live in hsk_va_task_done (supabase/va_daily_tasks.sql);
// a request is ticked on the request itself (delivered), so the Requests page shows it too.
import { supabase } from '@/lib/supabase';
import { projectGuestDay, extractDepInfo } from '@/lib/guestDay';
import { loadMilkList } from '@/lib/milkRequests';
import { deliveryPatch, undoPatch, isForToday, deliveryOf } from '@/lib/requestsShared';
import { fetchRows, buildStays } from '@/lib/guestHistory';

export type VaTaskKind = 'milk' | 'ice' | 'pref' | 'request';
export type VaTask = {
  key: string; kind: VaTaskKind; villa: string; title: string; detail?: string; time?: string;
  done: boolean; doneAt?: string | null; doneBy?: string | null; request?: any;
};

// Short stable id for a preference line (so its tick survives a re-upload of the same note)
const hash = (s: string) => { let h = 0; for (const c of s.toLowerCase().replace(/\s+/g, ' ').trim()) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const prefLines = (row: any) => {
  const notes = [row?.preferences, extractDepInfo(row?.remarks || '').cleanRemarks]
    .flatMap(t => String(t || '').split(/\n|•/)).map(s => s.trim())
    .filter(s => s.length > 2 && !/^\[?DEP_INFO|^CHECKOUT \d/i.test(s));
  return [...new Set(notes)];
};

export const loadVaTasks = async (villas: string[], date: string): Promise<{ byVilla: Record<string, VaTask[]>; tableMissing: boolean }> => {
  const byVilla: Record<string, VaTask[]> = {};
  villas.forEach(v => { byVilla[v] = []; });
  if (!villas.length) return { byVilla, tableMissing: false };
  const mine = new Set(villas);

  // Preferences usually sit only on the arrival day's row, so read the whole current stay
  const since = (() => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 45); return d.toISOString().slice(0, 10); })();
  const [guest, stayRows, milk, ice, reqs, ticks] = await Promise.all([
    projectGuestDay(date).catch(() => ({ rows: [] as any[] })),
    fetchRows(b => b.in('villa_number', villas).gte('report_date', since).lte('report_date', date)).catch(() => []),
    loadMilkList(date).catch(() => null),
    supabase.from('hsk_daily_requests').select('*').eq('request_type', 'Ice').in('villa_number', villas),
    supabase.from('hsk_daily_requests').select('*').in('villa_number', villas).gte('request_time', `${date}T00:00:00+06:00`).not('request_type', 'in', '("Minibar","Ice","Time Edit Request")'),
    supabase.from('hsk_va_task_done').select('*').eq('report_date', date).in('villa_number', villas),
  ]);
  const tableMissing = !!ticks.error && /does not exist|schema cache|PGRST205|42P01/i.test(`${ticks.error.message} ${ticks.error.code}`);
  const tick = new Map((ticks.data || []).map((t: any) => [`${t.villa_number}|${t.task_key}`, t]));
  const withTick = (v: string, key: string) => { const t: any = tick.get(`${v}|${key}`); return { done: !!t, doneAt: t?.done_at || null, doneBy: t?.host_name || null }; };

  // Milk
  (milk?.entries || []).filter(e => mine.has(e.villa)).forEach(e => {
    byVilla[e.villa].push({ key: 'milk', kind: 'milk', villa: e.villa, title: e.items.join(' + '), detail: [e.note, `until ${e.until.slice(8)}/${e.until.slice(5, 7)}`].filter(Boolean).join(' · '), ...withTick(e.villa, 'milk') });
  });

  // Ice: from the day it was asked, until check-out
  (ice.data || []).filter((r: any) => {
    const from = String(r.request_time || '').slice(0, 10);
    const dep = String(r.item_details || '').trim();
    return mine.has(r.villa_number) && (!from || from <= date) && (!dep || dep >= date);
  }).forEach((r: any) => {
    const time = String(r.request_time || '').includes('T') ? String(r.request_time).split('T')[1].slice(0, 5) : '';
    byVilla[r.villa_number].push({ key: 'ice', kind: 'ice', villa: r.villa_number, title: 'Ice', time, detail: r.item_details ? `until ${String(r.item_details).slice(8)}/${String(r.item_details).slice(5, 7)}` : undefined, ...withTick(r.villa_number, 'ice') });
  });

  // Guest preferences: today's row, plus every note from the guest's current stay
  const stays = buildStays(stayRows as any[]);
  villas.forEach(v => {
    const today = (guest.rows || []).find((r: any) => String(r.villa_number) === v);
    const stay = stays.find(st => st.villas[st.villas.length - 1] === v && st.arr <= date && (st.dep || st.lastSeen) >= date && st.lastSeen >= since);
    const lines = [...prefLines(today), ...(stay ? stay.notes.map(n => n.text).filter(t => !/^\[?DEP_INFO|^CHECKOUT \d/i.test(t)) : [])];
    const seen = new Set<string>();
    lines.forEach(line => {
      const id = line.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(id)) return; seen.add(id);
      const key = `pref:${hash(line)}`;
      byVilla[v].push({ key, kind: 'pref', villa: v, title: line, ...withTick(v, key) });
    });
  });

  // Requests sent today (not minibar)
  (reqs.data || []).filter((r: any) => !r.is_private && isForToday(r, date)).forEach((r: any) => {
    const time = new Date(r.request_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' });
    const delivered = deliveryOf(r) === 'delivered';
    byVilla[r.villa_number].push({
      key: `req:${r.id}`, kind: 'request', villa: r.villa_number, title: String(r.item_details || '').trim() || r.request_type,
      detail: [r.request_type, r.logged_by ? `from ${r.logged_by}` : ''].filter(Boolean).join(' · '), time,
      done: delivered, doneAt: r.delivered_at || null, doneBy: r.delivered_by || null, request: r,
    });
  });

  const order: Record<VaTaskKind, number> = { request: 0, ice: 1, milk: 2, pref: 3 };
  Object.values(byVilla).forEach(list => list.sort((a, b) => order[a.kind] - order[b.kind] || (a.time || '').localeCompare(b.time || '')));
  return { byVilla, tableMissing };
};

// Tick / untick. Returns an error message, or '' when saved.
export const setVaTaskDone = async (task: VaTask, done: boolean, date: string, me: { id: string; full_name: string }): Promise<string> => {
  if (task.kind === 'request') {
    const patch = done ? deliveryPatch(task.request, 'delivered', me.full_name) : undoPatch(task.request, me.full_name);
    const { error } = await supabase.from('hsk_daily_requests').update(patch).eq('id', task.request.id);
    return error ? error.message : '';
  }
  if (done) {
    const { error } = await supabase.from('hsk_va_task_done').upsert(
      [{ report_date: date, villa_number: task.villa, task_key: task.key, label: task.title, host_id: me.id, host_name: me.full_name, done_at: new Date().toISOString() }],
      { onConflict: 'report_date,villa_number,task_key' });
    return error ? error.message : '';
  }
  const { error } = await supabase.from('hsk_va_task_done').delete().match({ report_date: date, villa_number: task.villa, task_key: task.key });
  return error ? error.message : '';
};

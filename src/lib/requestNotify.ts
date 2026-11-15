"use client";
import { supabase } from '@/lib/supabase';
import { getDhakaDateStr } from '@/lib/dateUtils';
import { riderDutyOf, isOffShift } from '@/app/allocation/lib/riders';
import { notifyHosts } from '@/lib/push';
import { classifyTarget, parseVillas } from '@/lib/requestsShared';

// Allocation rows may hold hsk_hosts.id or the staff number (host_id) — resolve both to hsk_hosts.id.
async function hostsById() {
  const { data } = await supabase.from('hsk_hosts').select('id, host_id, role, sub_department').eq('status', 'Active');
  const m = new Map<string, { id: string; role?: string; sub_department?: string }>();
  for (const h of (data || []) as { id: string; host_id: string; role?: string; sub_department?: string }[]) { m.set(h.id, h); if (h.host_id) m.set(h.host_id, h); }
  return m;
}

const summary = (details: string) =>
  (details || '').split('\n').map(s => s.trim().replace(/^[•\-\*]\s*/, '').replace(/\s*\(SENT\)$/, '')).filter(Boolean).join(', ').slice(0, 140);

// New request → every Runner on duty today. Returns how many phones were reached.
export async function notifyRunners(villa: string, requestType: string, details: string) {
  const today = getDhakaDateStr();
  const [{ data: allocs }, hosts] = await Promise.all([
    supabase.from('hsk_allocations').select('host_id, area, shift, task_details').eq('report_date', today).eq('area', 'riders'),
    hostsById(),
  ]);
  const ids = (allocs || [])
    .filter(a => !isOffShift(a.shift) && riderDutyOf(a, hosts.get(a.host_id)) === 'Runner')
    .map(a => hosts.get(a.host_id)?.id || '')
    .filter(Boolean);
  const t = classifyTarget(villa);
  const kind = requestType === 'Minibar' ? 'Minibar' : requestType === 'GEM Request' ? 'GEM request' : 'Request';
  return notifyHosts(ids, `🛎️ ${kind} · ${t.label}`, summary(details), '/requests', `req-${Date.now()}`);
}

// Runner left it at the pantry → that villa's attendant.
export async function notifyVillaVA(villa: string, title: string, details: string, doubleVillas: string[] = []) {
  const t = classifyTarget(villa);
  if (t.kind !== 'villa') return 0;
  const [{ data: allocs }, hosts] = await Promise.all([
    supabase.from('hsk_allocations').select('host_id, area, shift, task_details').eq('report_date', getDhakaDateStr()).eq('area', 'villa'),
    hostsById(),
  ]);
  const ids = (allocs || [])
    .filter(a => !isOffShift(a.shift) && parseVillas(a.task_details || '', doubleVillas).some(v => v === t.value || v === t.base))
    .map(a => hosts.get(a.host_id)?.id || '')
    .filter(Boolean);
  return notifyHosts(ids, title, summary(details), '/requests', `pantry-${t.value}`);
}

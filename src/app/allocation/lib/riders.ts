// Riders tab has three separate duties. They are stored as hsk_allocations rows with
// area = 'riders', shift = Morning | Split | Afternoon, and task_details = the duty name.

export type RiderDuty = 'Runner' | 'Luggage' | 'Step';
export const RIDER_DUTIES: RiderDuty[] = ['Runner', 'Luggage', 'Step'];

export const RIDER_SHIFTS = [
  { key: 'Morning', label: 'Morning', time: '06:30 – 15:00' },
  { key: 'Split', label: 'Split', time: 'Shift cover' },
  { key: 'Afternoon', label: 'Afternoon', time: '14:30 – 23:00' },
] as const;

// Step is a morning-only duty; Runner and Luggage use all three shifts.
export const shiftsForDuty = (duty: RiderDuty) => (duty === 'Step' ? RIDER_SHIFTS.filter(s => s.key === 'Morning') : RIDER_SHIFTS);

// Runner hours differ from the other duties. Split = ONE runner for the whole day (two blocks),
// so a split runner never sits with an AM / PM runner.
const RUNNER_TIMES: Record<string, string> = {
  Morning: '08:00 – 16:00',
  Afternoon: '15:00 – 23:00',
  Split: '08:00 – 14:00 · 18:00 – 21:00',
};
export const shiftTimeFor = (duty: RiderDuty, key: string) =>
  (duty === 'Runner' ? RUNNER_TIMES[key] : undefined) || RIDER_SHIFTS.find(s => s.key === key)?.time || '';

// Runner label on the printed sheet, from the shift they are on: AM / PM / Split.
// (Older rows with a single runner and no split shift still print as Split.)
export const runnerShiftLabel = (shift: string | null | undefined, runnerCount: number) => {
  const s = String(shift || '').toLowerCase();
  if (s.includes('split')) return 'Split';
  if (runnerCount <= 1 && !s.includes('afternoon') && !s.includes('morning')) return 'Split';
  if (s.includes('afternoon') || s.includes('14:30') || s.includes('pm')) return 'PM';
  return 'AM';
};

type HostLike = { role?: string | null; sub_department?: string | null } | null | undefined;

// What a host normally does, from their designation.
export const defaultDutyForHost = (h: HostLike): RiderDuty => {
  const r = `${h?.role || ''} ${h?.sub_department || ''}`.toLowerCase();
  if (r.includes('step')) return 'Step';
  if (r.includes('luggage') || r.includes('porter')) return 'Luggage';
  return 'Runner';
};

// Duty of an allocation row. Older rows say "Rider/Step Operation" — fall back to the host's designation.
export const riderDutyOf = (a: { task_details?: string | null; shift?: string | null }, h?: HostLike): RiderDuty => {
  const t = String(a.task_details || '').toLowerCase();
  if (t && !t.includes('rider/step')) {
    if (t.includes('luggage') || t.includes('porter')) return 'Luggage';
    if (t.includes('step')) return 'Step';
    if (t.includes('runner') || t.includes('rider')) return 'Runner';
  }
  const s = String(a.shift || '').toLowerCase();
  if (s.includes('luggage')) return 'Luggage';
  if (s.includes('step')) return 'Step';
  return defaultDutyForHost(h);
};

// Off / leave rows are kept in allocations but are not duty.
export const isOffShift = (shift?: string | null) =>
  /^(off|annual leave|sick leave|leave|al|sl|ph|el)\b/i.test(String(shift || '').trim());

// Who belongs in the Riders pool.
export const isRiderPoolHost = (h: HostLike) => {
  const s = `${h?.sub_department || ''} ${h?.role || ''}`.toLowerCase();
  return ['rider', 'runner', 'step', 'luggage', 'porter', 'buggy', 'driver'].some(k => s.includes(k));
};

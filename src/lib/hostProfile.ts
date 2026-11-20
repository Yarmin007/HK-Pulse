// Extra host-profile settings kept in the `team_viewer_config` constant (hsk_constants),
// keyed by host_id (SSL No) like the existing nicknames / hostDepartments / excludeAttendance maps.

export type ProfileType = 'PERMANENT' | 'TEMPORARY' | 'ACCOUNT';

export const PROFILE_TYPES: { value: ProfileType; label: string; hint: string }[] = [
  { value: 'PERMANENT', label: 'Permanent host', hint: 'Shown in attendance, org chart and lists' },
  { value: 'TEMPORARY', label: 'Temporary / Intern', hint: 'Taskforce, intern, casual — not in attendance' },
  { value: 'ACCOUNT', label: 'Not a person', hint: 'Shared or system login (e.g. Pest Control) — not in attendance or org chart' },
];

export type TeamConfig = {
  hostDepartments?: Record<string, string>;
  supervisorAccess?: Record<string, unknown>;
  nicknames?: Record<string, string>;
  excludeAttendance?: Record<string, boolean>;
  profileTypes?: Record<string, ProfileType>;
  resignedOn?: Record<string, string>; // YYYY-MM-DD last working day
  [key: string]: unknown;
};

// Older profiles only have the "exclude from attendance" flag: treat those as "not a person".
export const getProfileType = (cfg: TeamConfig | null | undefined, hostId: string): ProfileType =>
  cfg?.profileTypes?.[hostId] || (cfg?.excludeAttendance?.[hostId] ? 'ACCOUNT' : 'PERMANENT');

export const getResignedOn = (cfg: TeamConfig | null | undefined, hostId: string) => cfg?.resignedOn?.[hostId] || '';

// Should this host appear on an attendance sheet covering `periodStart`..?
// Resigned hosts stay on sheets for periods that started on or before their last working day.
export const isOnAttendance = (
  cfg: TeamConfig | null | undefined,
  host: { host_id: string; status?: string | null },
  periodStart?: string
) => {
  if (getProfileType(cfg, host.host_id) !== 'PERMANENT') return false;
  if (host.status === 'Resigned') {
    const last = getResignedOn(cfg, host.host_id);
    return !!(periodStart && last && last >= periodStart);
  }
  return true;
};

// Move every per-host entry when a host's SSL No changes, so settings are not lost.
export const renameHostKey = (cfg: TeamConfig, oldId: string, newId: string): TeamConfig => {
  if (!oldId || oldId === newId) return cfg;
  const next: TeamConfig = { ...cfg };
  for (const key of ['hostDepartments', 'nicknames', 'excludeAttendance', 'profileTypes', 'resignedOn', 'supervisorAccess'] as const) {
    const map = cfg[key] as Record<string, unknown> | undefined;
    if (map && oldId in map) {
      const copy = { ...map };
      copy[newId] = copy[oldId];
      delete copy[oldId];
      (next as Record<string, unknown>)[key] = copy;
    }
  }
  return next;
};

/**
 * One short name for printed sheets: the Display name from Host Profiles, then the first nickname,
 * otherwise one name from the full name — the last one, because first names repeat a lot
 * ("Ahmed Niyaz" → "Niyaz", "Hussain Asif" → "Asif").
 */
export const shortHostName = (
  h?: { host_id?: string | null; nicknames?: string | null; full_name?: string | null } | null,
  fallback = '',
  displayNames?: Record<string, string>,
): string => {
  const display = h?.host_id ? String(displayNames?.[h.host_id] || '').trim() : '';
  // A display name that is just the full name again (e.g. "MOHAMED ILHAM") isn't a short name: fall through to the nickname
  const letters = (s: string) => s.toLowerCase().replace(/[^\p{L}]/gu, '');
  if (display && !/\d/.test(display) && letters(display) !== letters(String(h?.full_name || ''))) return display;
  // Skip entries that are really phone numbers or codes typed into the nickname box
  const nick = String(h?.nicknames || '').split(',').map(n => n.trim()).find(n => /\p{L}/u.test(n) && !/\d/.test(n)) || '';
  if (nick) return nick;
  const parts = String(h?.full_name || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : fallback;
};

// ---------------------------------------------------------------------------
// Sub-departments (Host Profiles → Sub-department). Attendance, Monthly Roster, Leave Clearance and the
// dashboard's team leave list group people by these, in this order.
// (The allocation boards keep their own working area in hsk_hosts.sub_department.)
// ---------------------------------------------------------------------------
export const SUB_DEPARTMENTS = ['HK Admin', 'Landscaping & Garden', 'Laundry & Tailor', 'PA', 'Pool, Runner & Housemate', 'Room Attendant'] as const;

// Old names / designations → one of the six
const groupFromText = (raw?: string | null): string => {
  const s = String(raw || '').toLowerCase();
  if (!s.trim() || s.trim() === 'general') return '';
  if (/garden|landscap|land use/.test(s)) return 'Landscaping & Garden';
  if (/laundry|tailor|seamstress|linen|valet/.test(s)) return 'Laundry & Tailor';
  if (/villa|room att|^va$|housekeeping attendant/.test(s)) return 'Room Attendant';
  if (/water|pool|rider|runner|step|house ?mate|porter|luggage|buggy/.test(s)) return 'Pool, Runner & Housemate';
  if (/public|^pa$|\bpa\b/.test(s)) return 'PA';
  if (/admin|office|coord|super|executive|manager|desk|asst/.test(s)) return 'HK Admin';
  return '';
};

/** The person's sub-department: the one set on their profile, else worked out from older settings and the designation. */
export const hostSubDept = (
  cfg: TeamConfig | null | undefined,
  host: { host_id: string; role?: string | null; sub_department?: string | null },
): string => {
  const set = String(cfg?.hostDepartments?.[host.host_id] || '').trim();
  if ((SUB_DEPARTMENTS as readonly string[]).includes(set)) return set;
  // Garden Supervisor / Landscape Manager belong with the garden team, not HK Admin
  if (/garden|landscap|land use/i.test(String(host.role || ''))) return 'Landscaping & Garden';
  return groupFromText(set) || groupFromText(host.sub_department) || groupFromText(host.role) || 'Unassigned';
};

export const subDeptOrder = (d: string) => { const i = (SUB_DEPARTMENTS as readonly string[]).indexOf(d); return i < 0 ? 99 : i; };

/**
 * What the allocation boards should get in hsk_hosts.sub_department when a profile's sub-department changes.
 * Mixed groups (Laundry & Tailor, Pool, Runner & Housemate) are left alone: the board can't tell which part.
 */
export const boardAreaFor = (subDept: string): string | null =>
  ({ 'HK Admin': 'Admin', 'Landscaping & Garden': 'Garden', PA: 'Public Area', 'Room Attendant': 'Room Attendant' } as Record<string, string>)[subDept] || null;

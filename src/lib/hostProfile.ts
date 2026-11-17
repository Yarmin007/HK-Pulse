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
  if (display && !/\d/.test(display)) return display;
  // Skip entries that are really phone numbers or codes typed into the nickname box
  const nick = String(h?.nicknames || '').split(',').map(n => n.trim()).find(n => /\p{L}/u.test(n) && !/\d/.test(n)) || '';
  if (nick) return nick;
  const parts = String(h?.full_name || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : fallback;
};

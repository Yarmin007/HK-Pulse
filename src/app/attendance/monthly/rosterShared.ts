// Shared by the Monthly Roster screen, its print sheet and its Excel export.

export type RosterHost = {
  host_id: string; full_name: string; role?: string; status?: string; joining_date?: string | null;
  cfOff?: string; cfPH?: string; balOff?: string; balPH?: string; balAL?: string;
};
export type RosterGroup = { dep: string; hosts: RosterHost[] };
export type RosterCell = { code: string; worked: boolean; note?: string; blocked: '' | 'join' | 'left' };

// Solid colours (no transparency): stay sharp in print and match in Excel.  [fill, text]
export const CODE_COLORS: Record<string, [string, string]> = {
  O: ['#D1FAE5', '#047857'], OFF: ['#D1FAE5', '#047857'],
  AL: ['#CFFAFE', '#0E7490'], VAC: ['#CFFAFE', '#0E7490'],
  PH: ['#DBEAFE', '#1D4ED8'],
  RR: ['#FAE8FF', '#A21CAF'],
  SL: ['#FFE4E6', '#BE123C'],
  NP: ['#FECDD3', '#9F1239'],
  A: ['#EF4444', '#FFFFFF'],
  RO: ['#FEF08A', '#854D0E'],
  CL: ['#FEF3C7', '#B45309'],
  PA: ['#CCFBF1', '#0F766E'],
  MA: ['#FCE7F3', '#BE185D'],
  EL: ['#FFEDD5', '#C2410C'],
  OT: ['#E2E8F0', '#1E293B'],
};

export const CODE_NAMES: Record<string, string> = {
  P: 'Present', O: 'Off', AL: 'Annual leave', PH: 'Public holiday', RR: 'R&R', SL: 'Sick leave',
  NP: 'No pay', A: 'Absent', CL: 'Circumcision leave', PA: 'Paternity', MA: 'Maternity', OT: 'Overtime', RO: 'Replacement off',
};

export const FRIDAY_FILL = '#FFF1F2';
export const PH_FILL = '#EFF6FF';
export const BLOCK_FILL = '#CBD5E1';

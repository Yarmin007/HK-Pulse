// Monthly Roster checklist: per person, per roster (21st → 20th, named after the month of the 20th):
//   Sheet   the signing sheet was checked against the roster, up to a date
//   Fusion  the days were entered in Fusion, up to a date
// Kept in hsk_constants (type 'roster_check'), one row per person per roster, so two people
// ticking different hosts at the same time never overwrite each other.
import { supabase } from '@/lib/supabase';

export const ROSTER_CHECK_TYPE = 'roster_check';

export type RosterCheck = {
  period: string;       // 'YYYY-MM' (the month of the roster's 20th)
  host_id: string;
  sheet_upto: string;   // 'YYYY-MM-DD' or ''
  fusion_upto: string;  // 'YYYY-MM-DD' or ''
  sheet_by?: string; sheet_at?: string;
  fusion_by?: string; fusion_at?: string;
  _id?: string;         // hsk_constants row id
};

export const loadRosterChecks = async (period: string): Promise<Record<string, RosterCheck>> => {
  const out: Record<string, RosterCheck> = {};
  const { data, error } = await supabase.from('hsk_constants').select('id, label')
    .eq('type', ROSTER_CHECK_TYPE).ilike('label', `%"period":"${period}"%`);
  if (error) throw error;
  (data || []).forEach((r: { id: string; label: string }) => {
    try {
      const c = JSON.parse(r.label) as RosterCheck;
      if (c.period === period && c.host_id) out[c.host_id] = { ...c, _id: r.id };
    } catch { /* skip broken row */ }
  });
  return out;
};

export const saveRosterCheck = async (c: RosterCheck): Promise<RosterCheck> => {
  const { _id, ...body } = c;
  const label = JSON.stringify(body);
  if (!body.sheet_upto && !body.fusion_upto) {
    if (_id) { const { error } = await supabase.from('hsk_constants').delete().eq('id', _id); if (error) throw error; }
    return { ...body };
  }
  if (_id) {
    const { error } = await supabase.from('hsk_constants').update({ label }).eq('id', _id);
    if (error) throw error;
    return c;
  }
  const { data, error } = await supabase.from('hsk_constants').insert({ type: ROSTER_CHECK_TYPE, label }).select('id').single();
  if (error) throw error;
  return { ...body, _id: data.id };
};

/** 'done' = up to the roster's last day, 'part' = some days, '' = not started */
export const checkState = (upto: string, periodEnd: string): 'done' | 'part' | '' =>
  !upto ? '' : upto >= periodEnd ? 'done' : 'part';

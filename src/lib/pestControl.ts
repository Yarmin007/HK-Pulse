// Pest control is an outside team that is not in the staff system. Their names and numbers are
// kept as one list (not per day) and printed on every allocation sheet until someone changes it.
import { supabase } from '@/lib/supabase';

export type PestControlPerson = { name: string; no: string };

export const PEST_CONTROL_ROWS = 5;
const TYPE = 'pest_control_team';

export const loadPestControl = async (): Promise<{ id: string | null; team: PestControlPerson[] }> => {
  const { data } = await supabase.from('hsk_constants').select('id, label').eq('type', TYPE).limit(1).maybeSingle();
  let team: PestControlPerson[] = [];
  try {
    const parsed = JSON.parse(data?.label || '[]');
    if (Array.isArray(parsed)) team = parsed.map((p) => ({ name: String(p?.name || ''), no: String(p?.no || '') }));
  } catch { /* empty list */ }
  return { id: data?.id ?? null, team };
};

export const savePestControl = async (team: PestControlPerson[]) => {
  const clean = team.map((p) => ({ name: p.name.trim(), no: p.no.trim() })).filter((p) => p.name || p.no);
  const label = JSON.stringify(clean);
  const { id } = await loadPestControl();
  const { error } = id
    ? await supabase.from('hsk_constants').update({ label }).eq('id', id)
    : await supabase.from('hsk_constants').insert([{ type: TYPE, label }]);
  if (error) throw error;
  return clean;
};

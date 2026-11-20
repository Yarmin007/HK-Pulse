// Comment edits per stay: the guest-list memo is read-only (it comes from Front Office every day), so housekeeping
// keeps its corrections beside it: comments removed, comments re-worded, comments added. Guest History and the
// VA task list both read the memo through applyCommentEdits(), so a change shows everywhere.
// Saved in hsk_constants (type 'stay_comments'), one row per stay.
import { supabase } from '@/lib/supabase';

export const STAY_COMMENTS_TYPE = 'stay_comments';

export type StayComments = {
  stay_key: string; villa: string; arr: string;
  removed: string[];                  // comment ids (see commentId)
  edited: Record<string, string>;     // comment id → new text
  added: string[];                    // new comments
  saved_by: string; saved_at: string;
  _id?: string;
};

export const emptyStayComments = (stay: { key: string; villa: string; arr: string }): StayComments =>
  ({ stay_key: stay.key, villa: stay.villa, arr: stay.arr, removed: [], edited: {}, added: [], saved_by: '', saved_at: '' });

const tidy = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s,;.\-•]+|[\s,;\-•]+$/g, '').trim();
/** Same comment on another day's row = same id */
export const commentId = (s: string) => tidy(s).toLowerCase();

/** Memo texts → one comment per line (the memo's own line breaks), duplicates across days merged. */
export const commentLines = (texts: (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  return texts.flatMap(t => String(t || '').replace(/\[DEP_INFO\].*?\[\/DEP_INFO\]/g, '').split(/\n|<br\s*\/?>/i))
    .map(tidy).filter(l => l.length > 1 && !/^CHECKOUT \d/i.test(l))
    .filter(l => { const k = commentId(l); if (seen.has(k)) return false; seen.add(k); return true; });
};

/** The memo as housekeeping sees it: removed lines dropped, edits applied, added comments at the end. */
export const applyCommentEdits = (texts: (string | null | undefined)[], ed?: StayComments | null): string[] => {
  const lines = commentLines(texts);
  if (!ed) return lines;
  const removed = new Set(ed.removed);
  return [
    ...lines.filter(l => !removed.has(commentId(l))).map(l => ed.edited[commentId(l)] ?? l),
    ...ed.added,
  ].map(tidy).filter(Boolean);
};

export const hasCommentEdits = (ed?: StayComments | null) => !!ed && (ed.removed.length + ed.added.length + Object.keys(ed.edited).length) > 0;

// ---------- storage ----------
export const loadStayComments = async (filter?: { stayKey?: string }): Promise<StayComments[]> => {
  let q = supabase.from('hsk_constants').select('id, label').eq('type', STAY_COMMENTS_TYPE);
  if (filter?.stayKey) q = q.ilike('label', `%"stay_key":${JSON.stringify(filter.stayKey).replace(/[%_]/g, m => `\\${m}`)}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).flatMap((r: any) => {
    try { const v = JSON.parse(r.label); return [{ removed: [], edited: {}, added: [], ...v, _id: r.id } as StayComments]; } catch { return []; }
  });
};

export const saveStayComments = async (ed: StayComments): Promise<StayComments> => {
  const { _id, ...body } = ed;
  const label = JSON.stringify(body);
  if (_id) {
    const { error } = await supabase.from('hsk_constants').update({ label }).eq('id', _id);
    if (error) throw error;
    return ed;
  }
  const { data, error } = await supabase.from('hsk_constants').insert({ type: STAY_COMMENTS_TYPE, label }).select('id').single();
  if (error) throw error;
  return { ...body, _id: data.id };
};

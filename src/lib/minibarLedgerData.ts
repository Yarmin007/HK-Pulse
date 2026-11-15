"use client";
import { supabase } from '@/lib/supabase';
import {
  buildNameIndex, computeBalances, deriveFromRequests, fromRow,
  type CatalogLite, type Movement, type MovementRow, type RequestLite,
} from '@/lib/minibarLedger';

export type MinibarItem = CatalogLite & { category: string; image_url?: string | null };

export type Ledger = {
  started: boolean;
  start: string | null;
  items: MinibarItem[];
  par: Record<string, number>;
  doubleVillas: string[];
  stored: Movement[];
  moves: Movement[];
  ledgerError: string | null;
} & ReturnType<typeof computeBalances> & Pick<ReturnType<typeof deriveFromRequests>, 'open' | 'unmatched'>;

// Supabase returns at most 1000 rows per call — page through.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) return { rows: out, error };
    out.push(...(data || []));
    if (!data || data.length < 1000) return { rows: out, error: null };
  }
}

export const CATEGORY_ORDER = ['bites', 'sweets', 'juices', 'soft drinks', 'water', 'beer', 'wines', 'spirits', 'retail', 'general requests'];
export const sortItems = (items: MinibarItem[]) => [...items].sort((a, b) => {
  const ca = CATEGORY_ORDER.indexOf((a.category || '').toLowerCase()), cb = CATEGORY_ORDER.indexOf((b.category || '').toLowerCase());
  return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) || (a.generic_name || a.article_name).localeCompare(b.generic_name || b.article_name);
});
export const itemName = (i?: MinibarItem | null) => (i ? (i.generic_name || i.article_name || '').trim() : '');

export async function loadLedger(): Promise<Ledger> {
  const [catRes, parRes, dvRes, movRes] = await Promise.all([
    supabase.from('hsk_master_catalog').select('article_number, article_name, generic_name, category, image_url').eq('is_minibar_item', true),
    supabase.from('hsk_minibar_par').select('article_number, par'),
    supabase.from('hsk_constants').select('label').eq('type', 'double_mb_villas'),
    fetchAll<MovementRow>((f, t) => supabase.from('hsk_minibar_movements').select('*').order('created_at', { ascending: true }).range(f, t)),
  ]);
  const items = sortItems(((catRes.data || []) as MinibarItem[]).filter(i => !/\bqr\b/i.test(`${i.article_name} ${i.generic_name}`)));
  const par: Record<string, number> = {};
  for (const p of (parRes.data || []) as { article_number: string; par: number }[]) par[p.article_number] = Number(p.par) || 0;
  const doubleVillas = (dvRes.data || []).flatMap((c: { label: string }) => c.label.split(',').map(v => v.trim())).filter(Boolean);
  const stored = movRes.rows.map(fromRow);
  const firstCount = stored.find(m => m.kind === 'count');
  const start = firstCount ? firstCount.at : null;

  let derived: ReturnType<typeof deriveFromRequests> = { moves: [], open: [], unmatched: [] };
  if (start) {
    const reqRes = await fetchAll<RequestLite>((f, t) => supabase.from('hsk_daily_requests').select('*').eq('request_type', 'Minibar').gte('request_time', start).order('request_time', { ascending: true }).range(f, t));
    derived = deriveFromRequests(reqRes.rows, buildNameIndex(items), doubleVillas);
  }
  const moves = [...stored, ...derived.moves];
  return {
    started: !!start, start, items, par, doubleVillas, stored, moves,
    ledgerError: movRes.error ? movRes.error.message : null,
    open: derived.open, unmatched: derived.unmatched,
    ...computeBalances(moves),
  };
}

export const newBatchId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });

export async function insertMovements(rows: Record<string, unknown>[]) {
  if (!rows.length) return { error: null };
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('hsk_minibar_movements').insert(rows.slice(i, i + 500));
    if (error) return { error };
  }
  return { error: null };
}

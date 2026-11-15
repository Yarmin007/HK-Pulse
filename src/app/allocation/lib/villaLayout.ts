// Villa areas (jetties) and the saved preset sections, shared by the Villa board and the printed sheet
// so both put every attendant in the same area and the same order.
import { supabase } from '@/lib/supabase';
import { JETTY_A, JETTY_B, JETTY_C, BEACH, parseVillas } from './constants';

export type ZoneKey = 'jettyA' | 'jettyB' | 'jettyC' | 'beach';
export const ZONES: { key: ZoneKey; label: string; short: string; villas: number[] }[] = [
    { key: 'jettyA', label: 'Jetty A', short: 'A', villas: JETTY_A },
    { key: 'jettyB', label: 'Jetty B', short: 'B', villas: JETTY_B },
    { key: 'jettyC', label: 'Jetty C', short: 'C', villas: JETTY_C },
    { key: 'beach', label: 'Beach Villas', short: 'BV', villas: BEACH },
];
export const zoneOfVilla = (v: number): ZoneKey => ZONES.find(z => z.villas.includes(v))?.key || 'beach';

/** The area that holds most of the attendant's villas (ties go to their first villa's area). */
export const majorityZone = (villas: number[]): ZoneKey | null => {
    if (villas.length === 0) return null;
    const count: Record<string, number> = {};
    villas.forEach(v => { const z = zoneOfVilla(v); count[z] = (count[z] || 0) + 1; });
    const best = Math.max(...Object.values(count));
    const first = zoneOfVilla(villas[0]);
    if (count[first] === best) return first;
    return (ZONES.find(z => count[z.key] === best)?.key) || first;
};

// Sections per area, each with optional preset villas (stored as hsk_constants type 'villa_board_layout').
export type Layout = Record<ZoneKey, { villas: string }[]>;
export const DEFAULT_LAYOUT: Layout = {
    jettyA: Array.from({ length: 7 }, () => ({ villas: '' })),
    jettyB: Array.from({ length: 3 }, () => ({ villas: '' })),
    jettyC: Array.from({ length: 4 }, () => ({ villas: '' })),
    beach: Array.from({ length: 7 }, () => ({ villas: '' })),
};
export const LAYOUT_TYPE = 'villa_board_layout';

export const loadVillaLayout = async (): Promise<{ id: string | null; layout: Layout }> => {
    const { data } = await supabase.from('hsk_constants').select('id, label').eq('type', LAYOUT_TYPE).limit(1);
    if (!data?.[0]) return { id: null, layout: DEFAULT_LAYOUT };
    try { return { id: data[0].id, layout: { ...DEFAULT_LAYOUT, ...JSON.parse(data[0].label) } }; }
    catch { return { id: data[0].id, layout: DEFAULT_LAYOUT }; }
};

/**
 * Order the attendants of one area the way the board lays them out: each section takes the attendant
 * sharing most of its preset villas, then everyone else fills the free sections by first villa,
 * then extra blocks. `pinned` (section index per item) wins first, for the board's in-session placements.
 */
export const slotBySections = <T>(
    items: T[],
    sections: { villas: string }[],
    villasOf: (item: T) => number[],
    pinned?: (item: T) => number | undefined,
): (T | null)[] => {
    const slots: (T | null)[] = Array(sections.length).fill(null);
    const left = [...items];
    const take = (it: T, i: number) => { slots[i] = it; left.splice(left.indexOf(it), 1); };
    if (pinned) [...left].forEach(it => { const i = pinned(it); if (i !== undefined && i < slots.length && !slots[i]) take(it, i); });
    sections.forEach((sec, i) => {
        if (slots[i]) return;
        const preset = parseVillas(sec.villas || '');
        if (!preset.length) return;
        let best: T | null = null, bestN = 0;
        left.forEach(it => {
            const n = villasOf(it).filter(v => preset.includes(v)).length;
            if (n > bestN) { best = it; bestN = n; }
        });
        if (best) take(best, i);
    });
    left.sort((a, b) => (villasOf(a)[0] || 999) - (villasOf(b)[0] || 999));
    left.forEach(it => { const i = slots.indexOf(null); if (i >= 0) slots[i] = it; else slots.push(it); });
    return slots;
};

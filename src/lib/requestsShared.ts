// Helpers shared by the Requests page and the Runner page.

export const TOTAL_VILLAS = 97;

// Normalize villa numbers so "05" and "5" are always identical
export const normalizeVillaNumber = (raw: string): string => {
  if (!raw) return '';
  const str = raw.trim();
  if (str.includes('-')) {
    const [base, sub] = str.split('-');
    const parsedBase = parseInt(base, 10);
    return isNaN(parsedBase) ? str : `${parsedBase}-${sub}`;
  }
  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? str : parsed.toString();
};

// What the "villa" box holds: a real villa (1–97, or a split like 12-1), a complimentary / account
// code such as 9702, or free text such as "Beach".
export type Target = { kind: 'villa' | 'code' | 'other'; value: string; base: string; label: string };
export const classifyTarget = (raw: string): Target => {
  const v = normalizeVillaNumber(raw || '');
  const base = parseInt(v.split('-')[0], 10);
  if (/^\d+(-\d+)?$/.test(v) && base >= 1 && base <= TOTAL_VILLAS) return { kind: 'villa', value: v, base: String(base), label: `V${v}` };
  if (/^\d+$/.test(v)) return { kind: 'code', value: v, base: '', label: `Comp ${v}` };
  return { kind: 'other', value: v, base: '', label: v };
};

// "1-5, 8 & 12" → ["1","2","3","4","5","8","12"] (+ "-1"/"-2" halves for double villas)
export const parseVillas = (input: string, doubleVillas: string[] = []) => {
  if (!input) return [];
  const result = new Set<string>();
  const normalized = input.replace(/&|and/gi, ',').replace(/\s+/g, '');
  for (const p of normalized.split(',')) {
    if (!p) continue;
    if (p.includes('-')) {
      const [startStr, endStr] = p.split('-');
      const start = parseInt(startStr.replace(/\D/g, ''), 10);
      const end = parseInt(endStr.replace(/\D/g, ''), 10);
      if (!isNaN(start) && !isNaN(end) && start <= end && end - start < 200) {
        for (let i = start; i <= end; i++) result.add(String(i));
      }
    } else {
      const num = parseInt(p.replace(/\D/g, ''), 10);
      if (!isNaN(num)) result.add(String(num));
    }
  }
  const finalResult = new Set<string>();
  Array.from(result).forEach(v => {
    finalResult.add(v);
    if (doubleVillas.includes(v)) { finalResult.add(`${v}-1`); finalResult.add(`${v}-2`); }
  });
  return Array.from(finalResult);
};

export const isOnlyRefills = (details: string) => {
  const items = (details || '').split(/\n/).map(s => s.trim()).filter(Boolean);
  return items.length > 0 && items.every(item => item.includes('(Refill)'));
};

// Item lines of a request, with the "(SENT)" marker split out.
export const splitItems = (details: string) =>
  (details || '').split(/\n/).map(s => s.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean)
    .map(raw => ({ raw, name: raw.replace(/\s*\(SENT\)$/, ''), sent: /\(SENT\)$/.test(raw) }));

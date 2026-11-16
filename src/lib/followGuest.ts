// Keeps villa-based lists (Daily Ice, Sinner, Saint) attached to the *guest*, not the villa:
// when the guest moves villa the entry follows them, and the departure date always comes
// from the guest list.
import { normalizeVilla, stayDepartureIso } from '@/lib/guestDay';

const IN_HOUSE = ['OCC', 'ARR', 'DEP', 'DEP/ARR', 'VM/OCC', 'VM/ARR', 'VM/DU', 'DAY USE'];

const isGuest = (r: any) => {
    const st = String(r?.status || '').trim().toUpperCase();
    return !!r && IN_HOUSE.includes(st) && !!(r.stay_id || r.guest_name);
};

const nameKey = (n?: string | null) => String(n || '').toLowerCase().replace(/[^a-z]/g, '');

const sameGuest = (a: any, b: any) => {
    if (!a || !b) return false;
    if (a.stay_id && b.stay_id) return a.stay_id === b.stay_id;
    return !!nameKey(a.guest_name) && nameKey(a.guest_name) === nameKey(b.guest_name);
};

export type FollowedGuest = {
    villa: string;      // villa the guest is in today
    dep_date: string;   // YYYY-MM-DD from the guest list ("" if unknown)
    guest_name: string;
    moved: boolean;     // true when the villa changed
};

/**
 * Where is the guest of `villa` today?
 * - `todayRows` / `prevRows`: guest-list rows for the viewed day and the day before (projectGuestDay).
 * - `guestName`: optional name saved with the entry; when given it is matched first.
 * Returns null when no guest can be matched (entry is left as it is).
 */
export const followGuest = (villa: string, date: string, todayRows: any[], prevRows: any[], guestName?: string | null): FollowedGuest | null => {
    const v = normalizeVilla(villa);
    if (!v) return null;
    const todayGuests = todayRows.filter(isGuest);
    const at = (rows: any[], vv: string) => rows.find(r => normalizeVilla(r.villa_number) === vv);

    const result = (row: any): FollowedGuest => {
        const nv = normalizeVilla(row.villa_number) || v;
        return { villa: nv, dep_date: stayDepartureIso(row.stay_dates || '', date), guest_name: row.guest_name || '', moved: nv !== v };
    };

    // 1. A guest name saved with the entry wins
    if (nameKey(guestName)) {
        const byName = todayGuests.find(r => nameKey(r.guest_name) === nameKey(guestName));
        if (byName) return result(byName);
    }

    const today = at(todayRows, v);
    const prev = at(prevRows, v);
    const todayIsGuest = isGuest(today);
    const prevIsGuest = isGuest(prev);

    // 2. Same guest as yesterday, a guest who just moved in here, or nothing to compare with → stays here
    if (todayIsGuest && (!prevIsGuest || sameGuest(today, prev) || String(today.status).toUpperCase() === 'VM/OCC')) {
        return result(today);
    }

    // 3. Yesterday's guest of this villa is now in another villa → they moved
    if (prevIsGuest) {
        const movedTo = todayGuests.find(r => sameGuest(r, prev) && normalizeVilla(r.villa_number) !== v);
        if (movedTo) return result(movedTo);
    }

    // 4. A different guest is in the villa now (or none): we can't tell who the entry belongs to, leave it
    return null;
};

import { Users, Droplets, Leaf, Truck, UserCheck, Settings, MapPin, Shirt, Scissors } from "lucide-react";

export const AREAS = [
  { id: 'admin', label: 'Admin & Office', icon: Settings },
  { id: 'villa', label: 'Villa Attendant', icon: Users },
  { id: 'public', label: 'Public Area', icon: MapPin },
  { id: 'water', label: 'Water Room', icon: Droplets },
  { id: 'laundry', label: 'Laundry', icon: Shirt },
  { id: 'tailor', label: 'Tailor', icon: Scissors },
  { id: 'garden', label: 'Garden', icon: Leaf },
  { id: 'riders', label: 'Riders & Step', icon: Truck },
  { id: 'housemate', label: 'Housemate', icon: UserCheck },
];

export const getShiftsForArea = (areaId: string) => {
    if (areaId === 'admin') return ['Straight (08:00 - 17:00)', 'Split (08:00-14:00 | 18:00-21:00)', 'Off', 'Annual Leave', 'Sick Leave'];
    // ⚡ ADDED PUBLIC AREA TIMINGS
    if (areaId === 'public') return ['Morning (06:30 - 14:30)', 'Afternoon (14:30 - 23:00)', 'Night', 'Split', 'Off', 'Annual Leave', 'Sick Leave', 'Unassigned'];
    return ['Morning', 'Afternoon', 'Evening', 'Night', 'Split', 'Off', 'Annual Leave', 'Sick Leave', 'Unassigned'];
};

export const TOTAL_VILLAS = 97;
export const JETTY_A = Array.from({length: 35}, (_, i) => i + 1);
export const JETTY_B = Array.from({length: 14}, (_, i) => i + 37);
export const JETTY_C = Array.from({length: 21}, (_, i) => i + 59);
export const BEACH = [36, ...Array.from({length: 8}, (_, i) => i + 51), ...Array.from({length: 18}, (_, i) => i + 80)];

export const parseVillas = (str: string): number[] => {
    if (!str) return [];
    const parts = str.split(',');
    const villas = new Set<number>();
    parts.forEach(p => {
        p = p.trim();
        if (!p) return;
        if (p.includes('-')) {
            const [start, end] = p.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) villas.add(i);
            }
        } else {
            const v = parseInt(p, 10);
            if (!isNaN(v)) villas.add(v);
        }
    });
    return Array.from(villas).sort((a,b) => a-b);
};

export const getDefaultArea = (host: any) => {
    const sub = (host.sub_department || '').toLowerCase().trim();
    const role = (host.role || '').toLowerCase().trim();
    
    const check = (str: string) => {
        if (!str) return null;
        if (str.includes('admin') || str.includes('desk') || str.includes('coord') || str.includes('manager') || str.includes('super') || str.includes('director') || str.includes('asst') || str.includes('assistant')) return 'admin';
        if (str.includes('tailor') || str.includes('seamstress')) return 'tailor';
        if (str === 'va' || str === 'v.a' || str.includes('villa attendant') || str.includes('room attendant') || str.includes('housekeeping attendant') || str === 'villa' || str === 'room') return 'villa';
        if (str.includes('public') || str === 'pa' || str.includes('pa ')) return 'public';
        if (str.includes('water') || str.includes('pool')) return 'water';
        if (str.includes('laundry') || str.includes('linen') || str.includes('valet')) return 'laundry';
        if (str.includes('garden') || str.includes('landscap')) return 'garden';
        if (str.includes('rider') || str.includes('step') || str.includes('buggy') || str.includes('driver')) return 'riders';
        if (str.includes('housemate') || str.includes('mate')) return 'housemate';
        return null;
    };
    return check(sub) || check(role) || 'admin'; 
};
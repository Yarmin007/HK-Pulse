"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { 
    Search, Plus, X, Pointer, RefreshCw, Users, Share2, 
    Calendar, Plane, UserCheck, Settings2, Wand2, Minus 
} from "lucide-react";
import { isServiceDay } from '@/lib/specialVillas';
import { isAway } from '@/lib/leavePeriods';
import { villaStatusMap, deriveHKStatus, rowsByVilla, HK_STATUS_KEY, movementTime, sheetColours } from '@/lib/guestDay';
import { modCheckoutOf } from '@/lib/specialVillas';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { TOTAL_VILLAS, parseVillas, getDefaultArea } from '../lib/constants';

import { ZONES, ZoneKey, zoneOfVilla, majorityZone, Layout, DEFAULT_LAYOUT, LAYOUT_TYPE, loadVillaLayout, slotBySections } from '../lib/villaLayout';

interface Host {
  id: string;
  host_id?: string;
  full_name: string;
  nicknames?: string;
  mvpn?: string;
  company_mobile?: string;
  personal_mobile?: string;
  role?: string;
  sub_department?: string;
}

interface Allocation {
  id?: string;
  host_id: string;
  area: string;
  shift: string;
  task_details: string;
  report_date: string;
}

interface ActiveLeaveRecord {
  id?: string;
  host_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
}

interface VillaBoardProps {
  hosts: Host[];
  setHosts?: React.Dispatch<React.SetStateAction<any[]>>;
  allocations: Allocation[];
  setAllocations: React.Dispatch<React.SetStateAction<Allocation[]>>;
  masterList: any[];
  prevMasterList?: any[];
  setIsDirty: (val: boolean) => void;
  selectedDate: string;
  activeArea?: string;
}

const LEAVE_TYPES = [
  { value: "AL", label: "Annual Leave (AL)" },
  { value: "OFF", label: "Day Off (OFF)" },
  { value: "PH", label: "Public Holiday (PH)" },
  { value: "NPL", label: "No Pay Leave (NPL)" },
  { value: "PL", label: "Paternity Leave (PL)" },
  { value: "ML", label: "Maternity Leave (ML)" },
  { value: "SL", label: "Sick Leave (SL)" },
  { value: "EL", label: "Emergency Leave (EL)" },
];

// --- SECTION PICKER: shows each preset section with its villas (coloured by status) and who has it ---
type PickerSection = { value: string; name: string; villas: number[]; owner?: string };
const SectionPicker = ({ value, groups, villaLook, onPick }: {
    value: string;
    groups: { label: string; sections: PickerSection[] }[];
    villaLook: (v: number) => { style: React.CSSProperties; title: string } | null;
    onPick: (value: string) => void;
}) => {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const current = groups.flatMap(g => g.sections).find(s => s.value === value);
    useEffect(() => {
        if (!pos) return;
        const close = () => setPos(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
    }, [pos]);
    return (
        <>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    const w = 288;
                    setPos(pos ? null : { top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
                }}
                title={current ? `${current.name}: ${current.villas.join(', ')}` : 'Choose a preset section'}
                className="shrink-0 min-w-[30px] px-1 py-0.5 rounded bg-white/15 hover:bg-white/30 text-white text-[9px] font-black"
            >
                {current ? current.name : 'Sec'}
            </button>
            {/* Portal to <body>: the block is a z-indexed grid item (own stacking context),
                so rendering inline let the sticky sidebar (z-20) paint over the popover. */}
            {pos && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[90]" onClick={(e) => { e.stopPropagation(); setPos(null); }}>
                    <div
                        className="absolute w-72 max-h-[60vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 animate-in zoom-in-95"
                        style={{ top: Math.min(pos.top, window.innerHeight - 320), left: pos.left }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button onClick={() => { onPick(''); setPos(null); }} className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-50">
                            Manual: type villa numbers in the block
                        </button>
                        {groups.map(g => g.sections.length > 0 && (
                            <div key={g.label} className="mt-1">
                                <p className="input-label !mb-0.5 !ml-2">{g.label}</p>
                                {g.sections.map(sec => (
                                    <button key={sec.value} onClick={() => { onPick(sec.value); setPos(null); }}
                                        className={`w-full text-left px-2 py-1.5 rounded-xl flex items-start gap-2 hover:bg-[#6D2158]/5 ${sec.value === value ? 'bg-[#6D2158]/10' : ''}`}>
                                        <span className="w-8 shrink-0 text-xs font-black text-[#6D2158] pt-0.5">{sec.name}</span>
                                        <span className="flex-1 min-w-0">
                                            {sec.villas.length ? (
                                                <span className="flex flex-wrap gap-0.5">
                                                    {sec.villas.map(v => { const l = villaLook(v); return <span key={v} title={l?.title} style={l?.style} className={`px-1 rounded text-[10px] font-black ${l ? 'ring-1 ring-inset ring-slate-300' : 'bg-slate-100 text-slate-600'}`}>{v}</span>; })}
                                                </span>
                                            ) : <span className="text-[10px] font-semibold text-slate-400">No preset villas</span>}
                                            {sec.owner && <span className="block text-[9px] font-bold text-amber-700 mt-0.5">With {sec.owner}</span>}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

// --- INLINE SEARCH COMPONENT FOR BLOCKS ---
const EmptyBlockSearch = ({ candidates, onAssign, placeholder = "+ Search & Add VA", onCancel }: any) => {
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);

    const filtered = candidates.filter((h: any) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return h.full_name.toLowerCase().includes(q) || (h.nicknames || '').toLowerCase().includes(q);
    });

    const displayList = query ? filtered : filtered.slice(0, 30);

    return (
        <div className="relative w-full flex justify-center items-center">
            <input 
                type="text"
                placeholder={placeholder}
                className="w-full bg-white/10 text-white placeholder-white/70 text-[10px] font-bold outline-none text-center rounded py-1 px-2 focus:bg-white focus:text-slate-800 focus:placeholder-slate-400 transition-colors"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => { setFocused(false); if (onCancel && !query) onCancel(); }, 200)}
            />
            {focused && (
                <div className="absolute top-full left-0 w-full max-h-48 overflow-y-auto bg-white border border-slate-300 shadow-2xl z-[60] rounded-b flex flex-col custom-scrollbar">
                    {displayList.length === 0 ? (
                        <span className="p-2 text-[10px] text-slate-500 text-center italic">No matches</span>
                    ) : (
                        displayList.map((h: any) => (
                            <button 
                                key={h.id}
                                className="p-2 text-left text-[10px] font-bold text-slate-800 hover:bg-[#6D2158]/10 border-b border-slate-100 flex flex-col leading-tight"
                                onClick={() => { onAssign(h.id); setQuery(''); setFocused(false); }}
                            >
                                <span>{h.nicknames ? h.nicknames.split(',')[0] : h.full_name}</span>
                                <span className="font-normal opacity-60 text-[8px] uppercase tracking-wider mt-0.5">{h.sub_department || h.role}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default function VillaBoard({
  hosts,
  setHosts,
  allocations,
  setAllocations,
  masterList,
  prevMasterList = [],
  setIsDirty,
  selectedDate,
}: VillaBoardProps) {
    const { confirmAction } = useConfirm();
    const [villaSearchQuery, setVillaSearchQuery] = useState('');
    const [selectedVA, setSelectedVA] = useState<string | null>(null);
    const [swappingHostId, setSwappingHostId] = useState<string | null>(null);
    // Where an attendant was placed before they have villas: zone + section index
    const [intendedJetties, setIntendedJetties] = useState<Record<string, { zone: ZoneKey; slot: number }>>({});
    const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
    const [layoutId, setLayoutId] = useState<string | null>(null);
    const [layoutDraft, setLayoutDraft] = useState<Layout | null>(null);
    const [layoutZone, setLayoutZone] = useState<ZoneKey>('jettyA');
    const [typingState, setTypingState] = useState<Record<string, string>>({});
    
    // Add Host to Pool Modal
    const [isAddHostModalOpen, setIsAddHostModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Leave Tracking
    const [activeLeaveRecords, setActiveLeaveRecords] = useState<ActiveLeaveRecord[]>([]);
    // Off / leave codes in the main attendance today, by SSL no
    const [attendanceOff, setAttendanceOff] = useState<Record<string, string>>({});
    const [selectedHostForLeave, setSelectedHostForLeave] = useState<Host | null>(null);
    const [leaveForm, setLeaveForm] = useState({
        leave_type: "AL",
        start_date: selectedDate,
        end_date: selectedDate,
    });

    useEffect(() => {
        fetchActiveLeaves();
    }, [selectedDate]);

    useEffect(() => {
        loadVillaLayout().then(({ id, layout }) => { if (id) { setLayoutId(id); setLayout(layout); } });
    }, []);

    const saveLayout = async (next: Layout) => {
        const label = JSON.stringify(next);
        const { data: existing } = await supabase.from('hsk_constants').select('id').eq('type', LAYOUT_TYPE).limit(1);
        const id = existing?.[0]?.id || layoutId;
        const { data, error } = id
            ? await supabase.from('hsk_constants').update({ label }).eq('id', id).select().single()
            : await supabase.from('hsk_constants').insert({ type: LAYOUT_TYPE, label }).select().single();
        if (error) { toast.error('Sections not saved: ' + error.message); return; }
        setLayoutId(data.id);
        setLayout(next);
        setLayoutDraft(null);
        toast.success('Sections saved');
    };

    // Guest status per villa, same source as the Guest List
    const statusByVilla = React.useMemo(() => villaStatusMap(masterList), [masterList]);
    const todayRows = React.useMemo(() => rowsByVilla(masterList), [masterList]);
    const prevRows = React.useMemo(() => rowsByVilla(prevMasterList), [prevMasterList]);
    const prevStatusByVilla = React.useMemo(() => villaStatusMap(prevMasterList), [prevMasterList]);
    const villaAllocOf = (hostId: string) => allocations.find((a: any) => String(a.host_id) === String(hostId) && a.area === 'villa');

    const fetchActiveLeaves = async () => {
        try {
            const { data: att } = await supabase.from("hsk_attendance").select("host_id, date, status_code, shift_note").eq("date", selectedDate);
            const off: Record<string, string> = {};
            (att || []).forEach((r: any) => { if (isAway(r)) off[String(r.host_id).trim()] = String(r.status_code).trim().toUpperCase(); });
            setAttendanceOff(off);
            const { data, error } = await supabase
                .from("hsk_leave_requests")
                .select("*")
                .lte("start_date", selectedDate)
                .gte("end_date", selectedDate);

            if (!error && data) {
                setActiveLeaveRecords(data as ActiveLeaveRecord[]);
            }
        } catch (err) {
            console.warn("Error fetching leave records:", err);
        }
    };

    const handleShareLink = () => {
        const url = `${window.location.origin}/share/allocation`;
        navigator.clipboard.writeText(url).then(() => {
            toast.success('Public link copied to clipboard!');
        }).catch(() => {
            toast.error('Failed to copy link.');
        });
    };

    // Filter staff belonging to Villa team
    const currentAreaHosts = React.useMemo(() => {
        return hosts.filter((h: any) => {
            const sub = (h.sub_department || '').toLowerCase();
            const role = (h.role || '').toLowerCase();
            return sub.includes('villa') || role.includes('villa') || getDefaultArea(h) === 'villa';
        });
    }, [hosts]);

    const getHostLabel = (h: Host) => {
        return h.nicknames ? h.nicknames.split(',')[0].trim() : h.full_name;
    };

    const getHostLeaveRecord = (hostId: string) => {
        const targetHost = hosts.find((h) => h.id === hostId);
        return activeLeaveRecords.find((l) => 
            l.host_id === hostId || (targetHost?.host_id && l.host_id === targetHost.host_id)
        );
    };

    const getLeaveBadge = (hostId: string) => {
        const rec = getHostLeaveRecord(hostId);
        if (!rec) return null;

        if (rec.leave_type === "AL") {
            return (
                <span className="text-[9px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-black flex items-center gap-1">
                    <Plane size={9} /> AL (till {rec.end_date})
                </span>
            );
        }
        if (["OFF", "PH"].includes(rec.leave_type)) {
            return (
                <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-black">
                    {rec.leave_type} (till {rec.end_date})
                </span>
            );
        }
        return (
            <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-black">
                {rec.leave_type} (till {rec.end_date})
            </span>
        );
    };

    const handleSaveLeave = async () => {
        if (!selectedHostForLeave) return;

        try {
            const dStart = new Date(leaveForm.start_date);
            const dEnd = new Date(leaveForm.end_date);
            const diffTime = Math.abs(dEnd.getTime() - dStart.getTime());
            const daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            const hostKey = String(selectedHostForLeave.id || selectedHostForLeave.host_id || "");
            const hostNameVal = selectedHostForLeave.full_name || getHostLabel(selectedHostForLeave);

            await supabase
                .from("hsk_leave_requests")
                .delete()
                .eq("host_id", hostKey)
                .lte("start_date", leaveForm.end_date)
                .gte("end_date", leaveForm.start_date);

            const payload = {
                host_id: hostKey,
                host_name: hostNameVal,
                leave_type: String(leaveForm.leave_type),
                start_date: String(leaveForm.start_date),
                end_date: String(leaveForm.end_date),
                total_days: Number(daysCount),
                days_count: Number(daysCount),
                status: "Approved",
                reason: `${leaveForm.leave_type} applied from board`,
            };

            const { error } = await supabase.from("hsk_leave_requests").insert([payload]);

            if (error) {
                throw new Error(error.message || error.details || "Database constraint error");
            }

            toast.success(`${getHostLabel(selectedHostForLeave)} set to ${leaveForm.leave_type} until ${leaveForm.end_date}!`);
            setSelectedHostForLeave(null);
            fetchActiveLeaves();
            setIsDirty(true);
        } catch (err: any) {
            console.error("Leave save error:", err);
            toast.error("Failed to save leave: " + (err?.message || "Check database table"));
        }
    };

    const handleRemoveLeave = async (leaveId?: string) => {
        if (!leaveId) return;
        try {
            const { error } = await supabase.from("hsk_leave_requests").delete().eq("id", leaveId);
            if (error) throw error;
            toast.success("Leave removed!");
            fetchActiveLeaves();
            setIsDirty(true);
        } catch (err: any) {
            toast.error("Error clearing leave: " + (err?.message || "Could not delete"));
        }
    };

    const handleAddToPool = async (hostId: string) => {
        if (setHosts) {
            setHosts((prev: Host[]) =>
                prev.map((h) => (h.id === hostId ? { ...h, sub_department: "Villa" } : h))
            );
        }

        const { error } = await supabase
            .from("hsk_hosts")
            .update({ sub_department: "Villa" })
            .eq("id", hostId);

        if (error) {
            toast.error("Could not save to pool: " + error.message);
        } else {
            toast.success("Host added to Villa pool!");
        }

        setIsAddHostModalOpen(false);
    };

    const handleRemoveFromPool = async (hostId: string) => {
        if (setHosts) {
            setHosts((prev: Host[]) =>
                prev.map((h) => (h.id === hostId ? { ...h, sub_department: "General" } : h))
            );
        }

        await supabase
            .from("hsk_hosts")
            .update({ sub_department: "General" })
            .eq("id", hostId);

        setAllocations(allocations.filter((a: any) => !(String(a.host_id) === String(hostId) && a.area === 'villa')));
        if (selectedVA === hostId) setSelectedVA(null);
        setIsDirty(true);
        toast.success("Host removed from pool");
    };

    const getVillaData = (vNum?: number) => {
        if (!vNum) return null;
        const info = statusByVilla[vNum];
        const hk = deriveHKStatus(todayRows[vNum], prevRows[vNum], selectedDate);
        // House use: show when today is one of its service days
        const co = modCheckoutOf(todayRows[vNum]?.remarks);
        const timeStr = hk.code === 'H/U' ? (isServiceDay(todayRows[vNum]?.remarks) ? 'Service day' : '')
            : hk.code === 'MOD' ? (co ? `C/O ${co.slice(8, 10)}/${co.slice(5, 7)}` : '')
            : movementTime(hk, info, prevStatusByVilla[vNum]);
        // Same colours as the printed allocation sheet
        const c = sheetColours(hk);
        return { status: hk.label, style: { backgroundColor: c.bg, color: c.text } as React.CSSProperties, timeStr, title: hk.title };
    };

    const allocatedVillaOwner = (v: number, exceptHost?: string) =>
        allocations.find((a: any) => a.area === 'villa' && String(a.host_id) !== String(exceptHost) && parseVillas(a.task_details || '').includes(v));

    const handleBlockAssign = (hostId: string, zone: ZoneKey, slot: number) => {
        if (!hostId) return;
        const existingAlloc = villaAllocOf(hostId);
        const otherAreas = allocations.filter((a: any) => String(a.host_id) === String(hostId) && a.area !== 'villa');
        if (otherAreas.length) toast(`Moved from ${otherAreas.map((a: any) => a.area).join(', ')} to villas`, { icon: '↪️' });

        // Preset villas of this section that nobody else has yet
        const preset = parseVillas(layout[zone]?.[slot]?.villas || '');
        const mine = parseVillas(existingAlloc?.task_details || '');
        const free = preset.filter(v => !allocatedVillaOwner(v, hostId) && !mine.includes(v));
        const taken = preset.length - free.length - preset.filter(v => mine.includes(v)).length;
        const villas = [...mine, ...free];
        if (taken > 0) toast(`${taken} preset villa${taken === 1 ? ' is' : 's are'} already with someone else`, { icon: 'ℹ️' });

        const rest = allocations.filter((a: any) => String(a.host_id) !== String(hostId));
        let shiftToSet = 'Split';
        if (existingAlloc && existingAlloc.shift !== 'Unassigned') shiftToSet = existingAlloc.shift;

        setAllocations([...rest, { report_date: selectedDate, host_id: hostId, area: 'villa', shift: shiftToSet, task_details: villas.join(',') }]);
        setIntendedJetties(prev => ({ ...prev, [hostId]: { zone, slot } }));
        setSelectedVA(hostId);
        setIsDirty(true);
    };

    // Give the attendant a whole section: its preset villas replace what they had (manual numbers still possible after)
    const handleSectionPick = async (hostId: string, value: string) => {
        if (!value) return;
        const [zone, slotStr] = value.split(':') as [ZoneKey, string];
        const slot = Number(slotStr);
        const preset = parseVillas(layout[zone]?.[slot]?.villas || '');
        const me = hosts.find(h => String(h.id) === String(hostId));
        if (preset.length === 0) {
            // No preset villas: only move the block into that section
            setIntendedJetties(prev => ({ ...prev, [hostId]: { zone, slot } }));
            return;
        }
        const clashes = preset.map(v => ({ v, owner: allocatedVillaOwner(v, hostId) })).filter(x => x.owner);
        let takeOver = false;
        if (clashes.length) {
            const names = [...new Set(clashes.map(c => { const h = hosts.find(x => String(x.id) === String(c.owner!.host_id)); return h ? getHostLabel(h) : 'someone'; }))].join(', ');
            takeOver = await confirmAction({
                title: 'Villas already allocated',
                message: `Villa${clashes.length === 1 ? '' : 's'} ${clashes.map(c => c.v).join(', ')} ${clashes.length === 1 ? 'is' : 'are'} with ${names}. Move ${clashes.length === 1 ? 'it' : 'them'} to ${me ? getHostLabel(me) : 'this attendant'}, or give only the free villas?`,
                confirmText: `Move to ${me ? getHostLabel(me) : 'them'}`,
                cancelText: 'Only free villas',
                icon: 'warning',
            });
        }
        const give = preset.filter(v => takeOver || !clashes.some(c => c.v === v));
        let next = allocations.map((a: any) => {
            if (a.area !== 'villa' || String(a.host_id) === String(hostId)) return a;
            const vs = parseVillas(a.task_details || '');
            return vs.some(v => give.includes(v)) ? { ...a, task_details: vs.filter(v => !give.includes(v)).join(',') } : a;
        });
        const mine = next.find((a: any) => String(a.host_id) === String(hostId) && a.area === 'villa');
        if (mine) next = next.map((a: any) => a === mine ? { ...a, task_details: give.join(',') } : a);
        else next = [...next.filter((a: any) => String(a.host_id) !== String(hostId)), { report_date: selectedDate, host_id: hostId, area: 'villa', shift: 'Split', task_details: give.join(',') }];
        setAllocations(next);
        setIntendedJetties(prev => ({ ...prev, [hostId]: { zone, slot } }));
        setSelectedVA(hostId);
        setIsDirty(true);
    };

    const villaLook = (v: number) => { const d = getVillaData(v); return d ? { style: d.style, title: d.title } : null; };
    const pickerGroups = (hostId: string) => ZONES.map(z => ({
        label: z.label,
        sections: (layout[z.key] || []).map((sec, i) => {
            const villas = parseVillas(sec.villas || '');
            const owners = [...new Set(villas.map(v => allocatedVillaOwner(v, hostId)).filter(Boolean).map((a: any) => {
                const h = hosts.find(x => String(x.id) === String(a.host_id)); return h ? getHostLabel(h) : '';
            }).filter(Boolean))];
            return { value: `${z.key}:${i}`, name: `${z.short}${i + 1}`, villas, owner: owners.join(', ') || undefined };
        }),
    }));

    // Section whose preset villas this attendant holds (all of them), for the picker
    const sectionOf = (hostId: string): string => {
        const mine = parseVillas(villaAllocOf(hostId)?.task_details || '');
        if (mine.length === 0) return '';
        for (const z of ZONES) {
            const secs = layout[z.key] || [];
            for (let i = 0; i < secs.length; i++) {
                const p = parseVillas(secs[i].villas || '');
                if (p.length && p.every(v => mine.includes(v))) return `${z.key}:${i}`;
            }
        }
        return '';
    };

    // Add this section's preset villas (the ones still free) to the attendant already in it
    const fillPreset = (hostId: string, zone: ZoneKey, slot: number) => {
        const alloc = villaAllocOf(hostId);
        if (!alloc) return;
        const mine = parseVillas(alloc.task_details || '');
        const free = parseVillas(layout[zone]?.[slot]?.villas || '').filter(v => !mine.includes(v) && !allocatedVillaOwner(v, hostId));
        if (free.length === 0) return toast('All preset villas are already allocated');
        setAllocations(allocations.map((a: any) => a === alloc ? { ...a, task_details: [...mine, ...free].join(',') } : a));
        setIsDirty(true);
        toast.success(`Added ${free.join(', ')}`);
    };

    const handleSwapHost = (oldHostId: string, newHostId: string) => {
        if (!newHostId || oldHostId === newHostId) return setSwappingHostId(null);
        
        const newAllocs = [...allocations];
        const idx = newAllocs.findIndex((a: any) => String(a.host_id) === String(oldHostId) && a.area === 'villa');
        const newHostExistingIdx = newAllocs.findIndex((a: any) => String(a.host_id) === String(newHostId));
        
        if (newHostExistingIdx >= 0) {
            toast.error("That host is already allocated elsewhere! Remove them first.");
            return setSwappingHostId(null);
        }

        if (idx >= 0) {
            newAllocs[idx] = { ...newAllocs[idx], host_id: newHostId };
            setAllocations(newAllocs);
            setIsDirty(true);
        }

        setIntendedJetties(prev => {
            const next = { ...prev };
            if (next[oldHostId]) { next[newHostId] = next[oldHostId]; delete next[oldHostId]; }
            return next;
        });

        if (selectedVA === oldHostId) setSelectedVA(newHostId);
        setSwappingHostId(null);
    };

    const handleRemove = (hostId: string) => {
        setAllocations(allocations.filter((a: any) => !(String(a.host_id) === String(hostId) && a.area === 'villa')));
        if (selectedVA === hostId) setSelectedVA(null);
        if (swappingHostId === hostId) setSwappingHostId(null);
        setIntendedJetties(prev => { const next = { ...prev }; delete next[hostId]; return next; });
        setIsDirty(true);
    };

    const handleVillaInputBlur = (hostId: string, index: number, value: string) => {
        const existingIndex = allocations.findIndex((a: any) => String(a.host_id) === String(hostId) && a.area === 'villa');
        if (existingIndex < 0) return;

        let newAllocs = [...allocations];
        let changed = false;
        const alloc = newAllocs[existingIndex];
        let currentVillas = (alloc.task_details || '').split(',').map((s: string) => s.trim());

        while(currentVillas.length <= index) currentVillas.push('');

        if (!value.trim() || isNaN(parseInt(value, 10))) {
            currentVillas[index] = '';
            newAllocs[existingIndex] = { ...alloc, task_details: currentVillas.filter((s: string) => s !== '').join(',') };
            setAllocations(newAllocs);
            if (!value.trim()) setIsDirty(true);
            return;
        }

        const vNum = parseInt(value, 10);
        newAllocs = newAllocs.map((a: any) => {
            if (String(a.host_id) === String(hostId) || a.area !== 'villa') return a;
            let otherVillas = (a.task_details || '').split(',').map((s: string) => s.trim());
            if (otherVillas.includes(String(vNum))) {
                otherVillas = otherVillas.filter((v: string) => v !== String(vNum));
                changed = true;
                return { ...a, task_details: otherVillas.join(',') };
            }
            return a;
        });

        currentVillas[index] = String(vNum);
        const firstIdx = currentVillas.indexOf(String(vNum));
        if (firstIdx !== -1 && firstIdx !== index) { currentVillas[firstIdx] = ''; changed = true; }
        
        newAllocs[existingIndex] = { ...newAllocs[existingIndex], task_details: currentVillas.filter((v: string) => v.trim() !== '').join(',') };
        if (changed) toast.success(`Villa ${vNum} reassigned to avoid duplicates.`);
        
        setAllocations(newAllocs);
        setIsDirty(true);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, hostId: string, index: number, maxIndex: number) => {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault();
            if (index < maxIndex - 1) document.getElementById(`input-${hostId}-${index + 1}`)?.focus();
            else e.currentTarget.blur();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (index > 0) document.getElementById(`input-${hostId}-${index - 1}`)?.focus();
        }
    };

    const handleVillaClick = (vNum: number) => {
        if (!selectedVA) return toast.error("Click a Villa Attendant's purple header first to select them!");
        
        let newAllocs = [...allocations];
        const myAllocIndex = newAllocs.findIndex((a: any) => String(a.host_id) === selectedVA && a.area === 'villa');
        if (myAllocIndex < 0) return;

        newAllocs = newAllocs.map((alloc: any) => {
            if (alloc.area !== 'villa') return alloc;
            let currentVillas = (alloc.task_details || '').split(',').map((s: string) => s.trim());
            if (currentVillas.includes(String(vNum))) {
                return { ...alloc, task_details: currentVillas.filter((v: string) => v !== String(vNum)).join(',') };
            }
            return alloc;
        });

        const myAlloc = newAllocs[myAllocIndex];
        let myVillas = (myAlloc.task_details || '').split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
        
        if (myVillas.includes(String(vNum))) myVillas = myVillas.filter((v: string) => v !== String(vNum)); 
        else myVillas.push(String(vNum));
        
        newAllocs[myAllocIndex] = { ...myAlloc, task_details: myVillas.join(',') };
        setAllocations(newAllocs);
        setIsDirty(true);
    };

    // --- DATA GROUPINGS ---
    // Each attendant sits in the area holding most of their villas, then in the section whose preset
    // villas they share most; nobody is hidden when an area has more attendants than sections.
    const zoneSlots: Record<ZoneKey, (any | null)[]> = { jettyA: [], jettyB: [], jettyC: [], beach: [] };
    const unassignedVAs: any[] = [];
    const allAllocatedVillas = new Set<number>();

    allocations.filter((a: any) => a.area === 'villa').forEach((a: any) => {
        parseVillas(a.task_details).forEach((v: any) => allAllocatedVillas.add(v));
    });

    const byZone: Record<ZoneKey, any[]> = { jettyA: [], jettyB: [], jettyC: [], beach: [] };
    currentAreaHosts.forEach((host: any) => {
        const alloc = villaAllocOf(host.id);
        if (!alloc) { unassignedVAs.push(host); return; }
        const zone = majorityZone(parseVillas(alloc.task_details || '')) || intendedJetties[host.id]?.zone;
        if (!zone) unassignedVAs.push(host);
        else byZone[zone].push(host);
    });

    ZONES.forEach(z => {
        const sections = layout[z.key] || [];
        const it = (h: any) => intendedJetties[h.id];
        const slots = slotBySections(byZone[z.key], sections, h => parseVillas(villaAllocOf(h.id)?.task_details || ''),
            h => (it(h) && it(h).zone === z.key ? it(h).slot : undefined));
        zoneSlots[z.key] = slots;
    });

    const unallocatedVillas: number[] = [];
    for (let i = 1; i <= TOTAL_VILLAS; i++) {
        if (!allAllocatedVillas.has(i)) unallocatedVillas.push(i);
    }

    let searchedVillaAllocatedTo: string | null = null;
    if (villaSearchQuery) {
        const vNum = parseInt(villaSearchQuery, 10);
        if (!isNaN(vNum)) {
            const allocMatch = allocatedVillaOwner(vNum);
            if (allocMatch) {
                const h = hosts.find((h: any) => String(h.id) === String(allocMatch.host_id));
                if (h) searchedVillaAllocatedTo = h.nicknames ? h.nicknames.split(',')[0] : h.full_name.split(' ')[0];
            }
        }
    }

    const renderBlock = (host: any, zone: ZoneKey, slot: number) => {
        const key = `${zone}-${slot}`;
        const preset = parseVillas(layout[zone]?.[slot]?.villas || '');
        const sectionName = `${ZONES.find(z => z.key === zone)?.short}${slot + 1}`;
        if (!host) {
            return (
                <div key={key} className="flex flex-col bg-slate-50 border w-full border-slate-400 rounded-sm overflow-hidden shadow-sm h-full">
                    <div className="bg-[#6D2158] p-1 border-b border-slate-400">
                        <EmptyBlockSearch candidates={unassignedVAs} onAssign={(hId: string) => handleBlockAssign(hId, zone, slot)} />
                    </div>
                    <div className="bg-slate-100 border-b border-slate-400 text-[8px] font-bold text-slate-500 px-1 py-0.5 text-center truncate" title={preset.length ? `Preset villas: ${preset.join(', ')}` : undefined}>
                        {sectionName}{preset.length ? ` · preset ${preset.join(', ')}` : ''}
                    </div>
                    <div className="grid grid-cols-2 bg-slate-200 border-b border-slate-400">
                        <div className="text-center font-black text-[8px] py-1 border-r border-slate-400 text-slate-700">VILLA NO</div>
                        <div className="text-center font-black text-[8px] py-1 text-slate-700">STATUS</div>
                    </div>
                    <div className="flex flex-col flex-1">
                        {Array.from({length: 9}).map((_, i) => {
                            const pv = preset[i];
                            const d = pv ? getVillaData(pv) : null;
                            return (
                                <div key={`empty-${i}`} className="grid grid-cols-2 border-b border-slate-400 min-h-[24px] bg-white">
                                    <div className="border-r border-slate-400 flex items-center justify-center text-[11px] font-bold text-slate-300">{pv || ''}</div>
                                    <div style={d ? d.style : undefined} className={`flex items-center justify-center text-[9px] font-bold ${d ? 'opacity-40' : ''}`}>{d?.status || ''}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        const alloc = villaAllocOf(host.id);
        const myVillas = (alloc?.task_details || '').split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
        const missingPreset = preset.filter(v => !myVillas.includes(String(v)) && !allocatedVillaOwner(v, host.id));
        
        const rowsCount = Math.max(9, myVillas.length + 1);
        const paddedVillas = Array.from({length: rowsCount}).map((_, i) => myVillas[i] || '');
        const isSelected = selectedVA === String(host.id);
        const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
        const contactInfo = [host.mvpn ? `MVPN: ${host.mvpn}` : '', host.company_mobile ? `Duty: ${host.company_mobile}` : '', host.personal_mobile ? `Per: ${host.personal_mobile}` : ''].filter(Boolean).join(' | ') || 'No Contact Info';
        const leave = getHostLeaveRecord(host.id);
        const attOff = host.host_id ? attendanceOff[String(host.host_id).trim()] : undefined;
        const offLabel = leave?.leave_type || attOff;

        return (
            <div key={key} onClick={() => setSelectedVA(host.id)} className={`flex flex-col bg-slate-50 border w-full rounded-sm overflow-hidden shadow-sm h-full cursor-pointer transition-all ${isSelected ? 'ring-2 ring-green-500 border-green-500 z-10' : 'border-slate-400 hover:border-slate-500'}`}>
                <div className={`p-1 flex justify-between items-center text-white border-b border-slate-400 ${isSelected ? 'bg-green-600' : 'bg-[#6D2158]'}`}>
                    {swappingHostId === host.id ? (
                        <div className="w-full">
                            <EmptyBlockSearch candidates={unassignedVAs} onAssign={(newHostId: string) => handleSwapHost(host.id, newHostId)} placeholder="Swap VA..." onCancel={() => setSwappingHostId(null)} />
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-1 min-w-0 pr-1">
                                <span className="text-[11px] font-bold pl-1 leading-tight truncate">{displayName}</span>
                                {offLabel && <span className="text-[8px] bg-rose-500 text-white px-1 rounded font-black animate-pulse" title={`Off today (${offLabel}${attOff && !leave ? ' in attendance' : ''}) but has villas: swap them or move the villas`}>OFF {offLabel}</span>}
                                <SectionPicker value={sectionOf(host.id)} groups={pickerGroups(host.id)} villaLook={villaLook} onPick={(v) => handleSectionPick(host.id, v)} />
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {missingPreset.length > 0 && (
                                    <button onClick={(e) => { e.stopPropagation(); fillPreset(host.id, zone, slot); }} className="text-white/70 hover:text-white px-0.5" title={`Add preset villas ${missingPreset.join(', ')}`}><Wand2 size={10}/></button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); setSwappingHostId(host.id); }} className="text-white/60 hover:text-white px-1" title="Swap VA"><RefreshCw size={10}/></button>
                                <button onClick={(e) => { e.stopPropagation(); handleRemove(host.id); }} className="text-white/60 hover:text-white px-1" title="Remove VA"><X size={12}/></button>
                            </div>
                        </>
                    )}
                </div>
                <div className="bg-slate-100 border-b border-slate-400 text-[7px] font-mono text-slate-600 px-1 py-0.5 text-center truncate" title={contactInfo}><span className="font-sans font-black text-slate-500 mr-1">{sectionName}</span>{contactInfo}</div>
                <div className="grid grid-cols-2 bg-slate-200 border-b border-slate-400">
                    <div className="text-center font-black text-[8px] py-1 border-r border-slate-400 text-slate-700">VILLA NO</div>
                    <div className="text-center font-black text-[8px] py-1 text-slate-700">STATUS</div>
                </div>
                <div className="flex flex-col flex-1">
                    {paddedVillas.map((v, i) => {
                        const inputKey = `${host.id}-${i}`;
                        const displayValue = typingState[inputKey] !== undefined ? typingState[inputKey] : v;
                        const vNum = parseInt(displayValue, 10);
                        const data = !isNaN(vNum) ? getVillaData(vNum) : null;
                        
                        return (
                            <div key={i} className={`grid grid-cols-2 min-h-[24px] bg-white ${i < rowsCount - 1 ? 'border-b border-slate-400' : ''}`}>
                                <div className="border-r border-slate-400 p-0">
                                    <input 
                                        id={`input-${host.id}-${i}`}
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        name={`villa-${host.id}-${i}-${selectedDate}`}
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                        className="w-full h-full text-center font-bold text-[12px] outline-none focus:bg-indigo-50 text-slate-800 bg-transparent"
                                        value={displayValue}
                                        onChange={(e) => setTypingState(prev => ({ ...prev, [inputKey]: e.target.value }))}
                                        onBlur={(e) => {
                                            handleVillaInputBlur(host.id, i, e.target.value);
                                            setTypingState(prev => { const next = { ...prev }; delete next[inputKey]; return next; });
                                        }}
                                        onKeyDown={(e) => handleInputKeyDown(e, host.id, i, rowsCount)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                                <div 
                                    title={data?.title}
                                    style={data?.style}
                                    className={`text-center flex flex-col items-center justify-center text-[10px] font-black leading-tight px-0.5 ${data ? '' : 'bg-slate-50 text-slate-400'}`}
                                    onClick={(e) => { if(vNum) { e.stopPropagation(); handleVillaClick(vNum); } }}
                                >
                                    <span>{data?.status || ''}</span>
                                    {data?.timeStr && <span className="text-[9px] font-bold tabular-nums tracking-tight leading-none mt-0.5">{data.timeStr}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col-reverse xl:flex-row gap-4 items-start w-full">
            <div className="flex-1 w-full min-w-0 flex flex-col gap-4">
                
                {/* AREAS: sections come from the saved layout (Sections button) */}
                {(() => {
                    const zoneCard = (z: typeof ZONES[number], cols: string) => (
                        <div key={z.key} className="flex-1 min-w-0 bg-white p-2 rounded-xl shadow-sm border border-slate-300">
                            <div className="bg-[#6D2158] text-white font-black py-1.5 px-2 text-[10px] tracking-widest uppercase rounded-sm mb-2 flex items-center justify-between">
                                <span className="w-16" />
                                <span>{z.label}</span>
                                <button onClick={() => { setLayoutDraft(JSON.parse(JSON.stringify(layout))); setLayoutZone(z.key); }}
                                    className="w-16 flex items-center justify-end gap-1 text-white/70 hover:text-white normal-case tracking-normal font-bold text-[10px]" title={`Set ${z.label} sections`}>
                                    <Settings2 size={12}/> Sections
                                </button>
                            </div>
                            <div className={`grid gap-2 w-full ${cols}`}>
                                {zoneSlots[z.key].map((h, i) => renderBlock(h, z.key, i))}
                            </div>
                        </div>
                    );
                    const [A, B, C, BV] = ZONES;
                    return (
                        <>
                            {zoneCard(A, 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7')}
                            <div className="flex flex-col xl:flex-row gap-4 w-full">
                                {zoneCard(B, 'grid-cols-2 xl:grid-cols-3')}
                                {zoneCard(C, 'grid-cols-2 xl:grid-cols-4')}
                            </div>
                            {zoneCard(BV, 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7')}
                        </>
                    );
                })()}

                {/* VILLA STAFF POOL & LEAVE MANAGEMENT */}
                <div className="mt-4 bg-white p-4 rounded-xl border border-slate-300 shadow-sm">
                    <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                                <UserCheck size={16} className="text-[#6D2158]" /> 
                                Villa Attendants Pool & Roster
                            </span>
                            <span className="text-[10px] font-black bg-[#6D2158]/10 text-[#6D2158] px-2 py-0.5 rounded-full">
                                {currentAreaHosts.length} Hosts
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsAddHostModalOpen(true)} className="text-[10px] bg-[#6D2158] hover:bg-[#581a47] text-white px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-all shadow-sm">
                                <Plus size={12}/> Add Host to Villa Pool
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto p-1">
                        {currentAreaHosts.map(h => {
                            const isAssigned = allocations.some((a: any) => String(a.host_id) === String(h.id) && a.area === 'villa');
                            const leave = getHostLeaveRecord(h.id);

                            return (
                                <div
                                    key={h.id}
                                    onClick={() => {
                                        setSelectedHostForLeave(h);
                                        setLeaveForm({
                                            leave_type: leave?.leave_type || "AL",
                                            start_date: leave?.start_date || selectedDate,
                                            end_date: leave?.end_date || selectedDate,
                                        });
                                    }}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all shadow-sm ${
                                        leave
                                            ? "bg-rose-50/80 border-rose-300 text-rose-900"
                                            : isAssigned
                                            ? "bg-purple-50 border-[#6D2158] text-[#6D2158]"
                                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                                    }`}
                                >
                                    <span>{getHostLabel(h)}</span>
                                    {getLeaveBadge(h.id)}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveFromPool(h.id);
                                        }}
                                        className="text-slate-400 hover:text-rose-600 ml-1"
                                        title="Remove from pool"
                                    >
                                        ✕
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* RIGHT SIDEBAR */}
            <div className="w-full xl:w-48 shrink-0 flex flex-col gap-4 relative xl:sticky xl:top-6 z-20">
                <button 
                    onClick={handleShareLink} 
                    className="w-full py-3 bg-[#6D2158] hover:bg-[#902468] text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    <Share2 size={14} /> Copy Public Link
                </button>

                <div className="bg-white p-3 rounded-xl border border-slate-300 shadow-sm">
                    <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-2 flex items-center gap-1.5"><Search size={12}/> Find Villa</h3>
                    <input type="number" placeholder="Villa No..." className="w-full bg-slate-50 border border-slate-300 text-xs font-bold rounded p-2 outline-none focus:border-[#6D2158] mb-2 text-center" value={villaSearchQuery} onChange={e => setVillaSearchQuery(e.target.value)} />
                    {villaSearchQuery && (
                        <div className={`p-2 rounded border flex flex-col text-center ${searchedVillaAllocatedTo ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-slate-100 border-slate-300 text-slate-500'}`}>
                            {searchedVillaAllocatedTo ? (
                                <><span className="text-[9px] uppercase font-black opacity-60">Allocated To</span><span className="text-xs font-black">{searchedVillaAllocatedTo}</span></>
                            ) : <span className="text-[10px] font-black uppercase">Unallocated</span>}
                        </div>
                    )}
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-300 shadow-sm flex flex-col xl:max-h-[600px]">
                    <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-2 flex items-center justify-between border-b border-slate-200 pb-1">
                        Unallocated <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">{unallocatedVillas.length}</span>
                    </h3>
                    <div className="text-[9px] font-bold text-slate-400 mb-2 leading-tight bg-slate-50 border border-slate-200 p-1.5 rounded text-center">
                        {!selectedVA ? <span className="text-amber-600 flex items-center justify-center gap-1"><Pointer size={10}/> Select VA Header</span> : <span className="text-emerald-600 flex items-center justify-center gap-1">✓ Click to assign</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 custom-scrollbar overflow-y-auto pb-2 justify-center max-h-48 xl:max-h-full">
                        {unallocatedVillas.map(v => {
                            const vData = getVillaData(v);
                            return (
                                <button key={v} title={`Villa ${v}: ${vData?.title || ''}`} onClick={() => handleVillaClick(v)} style={vData?.style} className={`w-[34px] h-[30px] rounded border border-slate-300 shadow-sm flex items-center justify-center transition-all ${vData ? '' : 'bg-white'} hover:scale-105 active:scale-95`}>
                                    <span className="text-[11px] font-black leading-none">{v}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <details className="bg-white p-3 rounded-xl border border-slate-300 shadow-sm group" open>
                    <summary className="text-[10px] font-black uppercase text-slate-700 tracking-widest cursor-pointer list-none flex items-center justify-between">Status key <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span></summary>
                    <div className="mt-2 space-y-1">
                        {HK_STATUS_KEY.map(st => (
                            <div key={st.code} className="flex items-center gap-2" title={st.title}>
                                <span style={{ backgroundColor: sheetColours(st).bg, color: sheetColours(st).text }} className="shrink-0 w-[62px] text-center text-[9px] font-black rounded py-0.5 ring-1 ring-inset ring-slate-200">{st.label}</span>
                                <span className="text-[9px] font-semibold text-slate-500 leading-tight">{st.title}</span>
                            </div>
                        ))}
                    </div>
                </details>
            </div>

            {/* SECTIONS (PRESET) SETTINGS */}
            {layoutDraft && (() => {
                const secs = layoutDraft[layoutZone] || [];
                const setSecs = (next: { villas: string }[]) => setLayoutDraft({ ...layoutDraft, [layoutZone]: next });
                const z = ZONES.find(x => x.key === layoutZone)!;
                // villas used by more than one section in this area
                const seen = new Map<number, number>();
                secs.forEach(sec => parseVillas(sec.villas).forEach(v => seen.set(v, (seen.get(v) || 0) + 1)));
                const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([v]) => v);
                const covered = new Set(seen.keys());
                const uncovered = z.villas.filter(v => !covered.has(v));
                return (
                    <div className="modal-overlay" onClick={() => setLayoutDraft(null)}>
                        <div className="modal-content !max-w-lg !p-0 !rounded-[2rem] max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="p-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-xl font-black text-[#6D2158] tracking-tight flex items-center gap-2"><Settings2 size={20}/> Sections &amp; preset villas</h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Set how many sections each area has and the villas each section usually covers. Putting an attendant into a section fills in its preset villas that are still free.</p>
                                </div>
                                <button onClick={() => setLayoutDraft(null)} className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 shrink-0"><X size={16}/></button>
                            </div>
                            <div className="px-6 pt-3 flex gap-1 border-b border-slate-100">
                                {ZONES.map(zz => (
                                    <button key={zz.key} onClick={() => setLayoutZone(zz.key)}
                                        className={`px-3 py-2 text-xs font-black border-b-2 -mb-px ${layoutZone === zz.key ? 'border-[#6D2158] text-[#6D2158]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                                        {zz.label} <span className="text-[10px] font-bold opacity-60">{(layoutDraft[zz.key] || []).length}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-2">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-bold text-slate-500">{z.label}: villas {z.villas[0]}–{z.villas[z.villas.length - 1]}{z.key === 'beach' ? ' (36, 51–58, 80–97)' : ''}</span>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => secs.length > 1 && setSecs(secs.slice(0, -1))} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Remove last section"><Minus size={14}/></button>
                                        <span className="w-8 text-center text-sm font-black text-slate-800">{secs.length}</span>
                                        <button onClick={() => secs.length < 14 && setSecs([...secs, { villas: '' }])} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Add a section"><Plus size={14}/></button>
                                    </div>
                                </div>
                                {secs.map((sec, i) => {
                                    const vs = parseVillas(sec.villas);
                                    const outside = vs.filter(v => zoneOfVilla(v) !== layoutZone);
                                    return (
                                        <div key={i} className="flex items-center gap-2">
                                            <span className="w-10 shrink-0 text-xs font-black text-[#6D2158]">{z.short}{i + 1}</span>
                                            <input value={sec.villas} onChange={e => setSecs(secs.map((x, k) => k === i ? { villas: e.target.value } : x))}
                                                autoComplete="off" placeholder="e.g. 1-5, 18, 34"
                                                className="input-field !p-2.5 !text-xs flex-1 min-w-0" />
                                            <span className={`w-16 shrink-0 text-right text-[10px] font-bold ${outside.length ? 'text-amber-600' : 'text-slate-400'}`} title={outside.length ? `Not in ${z.label}: ${outside.join(', ')}` : undefined}>
                                                {vs.length} villa{vs.length === 1 ? '' : 's'}{outside.length ? ' ⚠' : ''}
                                            </span>
                                        </div>
                                    );
                                })}
                                {dupes.length > 0 && <p className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded-lg px-3 py-2">In more than one section: {dupes.join(', ')}</p>}
                                {secs.some(x => x.villas.trim()) && uncovered.length > 0 && <p className="text-[11px] font-semibold text-slate-500 bg-slate-50 rounded-lg px-3 py-2">Not in any section: {uncovered.join(', ')}</p>}
                            </div>
                            <div className="p-6 pt-4 border-t border-slate-100 flex justify-end gap-2">
                                <button onClick={() => setLayoutDraft(null)} className="btn-secondary">Cancel</button>
                                <button onClick={() => saveLayout(layoutDraft)} className="btn-primary">Save sections</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* SET LEAVE & RETURN DATE MODAL */}
            {selectedHostForLeave && (
                <div className="modal-overlay" onClick={() => setSelectedHostForLeave(null)}>
                    <div className="modal-content !max-w-md !p-6 !rounded-[2rem] gap-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-rose-50 text-rose-700 rounded-lg">
                                    <Calendar size={18} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-[#6D2158] tracking-tight">
                                        Set Leave for {getHostLabel(selectedHostForLeave)}
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                                        Persists across days until Return Date
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedHostForLeave(null)}
                                className="text-slate-400 hover:text-slate-600 text-sm font-black"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="input-label">Status / Leave Type</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {LEAVE_TYPES.map((lt) => (
                                        <button
                                            key={lt.value}
                                            type="button"
                                            onClick={() => setLeaveForm({ ...leaveForm, leave_type: lt.value })}
                                            className={`p-2 rounded-xl text-xs font-black border text-left transition-all ${
                                                leaveForm.leave_type === lt.value
                                                    ? "bg-[#6D2158] text-white border-[#6D2158] shadow-sm"
                                                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                                            }`}
                                        >
                                            {lt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div>
                                    <label className="input-label">Start Date</label>
                                    <input
                                        type="date"
                                        className="input-field !p-3 !text-xs"
                                        value={leaveForm.start_date}
                                        onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="input-label">Return / End Date</label>
                                    <input
                                        type="date"
                                        className="input-field !p-3 !text-xs"
                                        value={leaveForm.end_date}
                                        onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                            {getHostLeaveRecord(selectedHostForLeave.id) ? (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveLeave(getHostLeaveRecord(selectedHostForLeave.id)?.id)}
                                    className="text-rose-600 hover:text-rose-800 text-xs font-black"
                                >
                                    Clear Active Leave
                                </button>
                            ) : <div />}

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSelectedHostForLeave(null)}
                                    className="btn-secondary !px-4"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveLeave}
                                    className="btn-primary !px-4"
                                >
                                    Apply Leave
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ADD HOST TO VILLA POOL MODAL */}
            {isAddHostModalOpen && (
                <div className="modal-overlay" onClick={() => setIsAddHostModalOpen(false)}>
                    <div className="modal-content !max-w-md !p-0 !rounded-[2rem] overflow-hidden max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#6D2158] p-5 text-white flex justify-between items-center">
                            <h3 className="text-lg font-bold flex items-center gap-2"><Users size={18}/> Add Staff to Villa Pool</h3>
                            <button onClick={() => setIsAddHostModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20"><X size={18}/></button>
                        </div>
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" placeholder="Search entire island staff..." autoComplete="off" className="input-field !pl-9 !py-2.5 !text-xs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus />
                            </div>
                        </div>
                        <div className="p-0 flex-1 overflow-y-auto custom-scrollbar">
                            <div className="pb-4">
                                {hosts
                                    .filter((h) => {
                                        const alreadyInPool = currentAreaHosts.some((p) => p.id === h.id);
                                        if (alreadyInPool) return false;
                                        if (!searchQuery.trim()) return true;
                                        const q = searchQuery.toLowerCase();
                                        return h.full_name.toLowerCase().includes(q) || (h.role || '').toLowerCase().includes(q) || (h.nicknames || '').toLowerCase().includes(q);
                                    })
                                    .map((host) => {
                                        return (
                                            <div key={host.id} className="flex items-center justify-between p-3 hover:bg-slate-50 border-b border-slate-100 transition-colors">
                                                <div className="truncate">
                                                    <p className="text-xs font-bold text-slate-800">{getHostLabel(host)}</p>
                                                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">{host.sub_department || host.role || 'Host'}</p>
                                                </div>
                                                <button 
                                                    onClick={() => handleAddToPool(host.id)} 
                                                    className="px-3 py-1.5 bg-[#6D2158] text-white hover:bg-[#521643] rounded-lg transition-all text-xs font-bold shadow-sm"
                                                >
                                                    + Add to Pool
                                                </button>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
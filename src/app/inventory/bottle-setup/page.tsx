"use client";
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Sparkles, Container, Lock, Unlock, Users, 
    ShieldCheck, MapPin, Plus, Trash2, DownloadCloud, 
    X, Search, Loader2, Save, Droplets, Utensils, Link as LinkIcon,
    ListOrdered, ImageIcon, Layers, RotateCcw, EyeOff
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';
import { format, startOfMonth } from 'date-fns';

type Host = { id: string; host_id: string; full_name: string; role: string; sub_department?: string; };
type Allocation = { id?: string; host_id: string; host_name: string; assigned_villas: string[]; };
type Constant = { id: string; type: string; label: string; };

const PANTRIES = ['Jetty A Pantry', 'Jetty B Pantry', 'Jetty C Pantry', 'Beach Pantry'] as const;
type PantryName = typeof PANTRIES[number];

const BOTTLE_OUTLETS = [
    'Food & Beverages',
    'SPA',
    'Tropic Surf',
    'Boat',
    'Sea Plane Lounge'
];

// Helper to identify departments
const isWaterStaff = (h: Host) => {
    const sub = (h.sub_department || '').toLowerCase();
    const role = (h.role || '').toLowerCase();
    return sub.includes('water') || sub.includes('pool') || role.includes('water') || role.includes('pool');
};

const isPaStaff = (h: Host) => {
    const sub = (h.sub_department || '').toLowerCase();
    const role = (h.role || '').toLowerCase();
    return sub.includes('public') || sub.includes('pa') || role.includes('public') || role.includes('pa');
};

// --- CUSTOM TAG INPUT FOR VILLAS ---
const TagInput = ({ values = [], onChange, placeholder }: { values: string[], onChange: (val: string[]) => void, placeholder: string }) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const newTag = e.currentTarget.value.trim();
            if (newTag && !values.includes(newTag)) {
                onChange([...values, newTag]);
            }
            e.currentTarget.value = '';
        } else if (e.key === 'Backspace' && e.currentTarget.value === '' && values.length > 0) {
            onChange(values.slice(0, -1));
        }
    };

    const removeTag = (tagToRemove: string) => {
        onChange(values.filter(t => t !== tagToRemove));
    };

    return (
        <div className="flex flex-wrap gap-1.5 items-center bg-slate-50 border border-slate-200 p-2 rounded-xl focus-within:border-[#6D2158] focus-within:ring-1 focus-within:ring-[#6D2158]/10 transition-all min-h-[42px] cursor-text">
            {values.map((t, idx) => (
                <span key={`${t}-${idx}`} className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-md text-[11px] font-black text-slate-700 shadow-sm animate-in zoom-in-95 duration-200">
                    {t} <X size={12} className="cursor-pointer text-slate-400 hover:text-rose-500 ml-0.5 transition-colors" onClick={(e) => { e.stopPropagation(); removeTag(t); }} />
                </span>
            ))}
            <input 
                type="text" 
                className="bg-transparent outline-none flex-1 min-w-[60px] font-bold text-xs text-slate-600" 
                placeholder={values.length === 0 ? placeholder : "Add..."}
                onKeyDown={handleKeyDown} 
                onBlur={(e) => {
                    const newTag = e.target.value.trim();
                    if (newTag && !values.includes(newTag)) {
                        onChange([...values, newTag]);
                        e.target.value = '';
                    }
                }}
            />
        </div>
    );
};

// --- WRITE-AND-SEARCH COMBOBOX COMPONENT (ZERO NATIVE DROPDOWNS) ---
const HostSearchCombobox = ({
    allHosts,
    selectedHostIds = [],
    onSelect,
    placeholder = "Type staff name to search..."
}: {
    allHosts: Host[];
    selectedHostIds: string[];
    onSelect: (hostId: string) => void;
    placeholder?: string;
}) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const cleanQuery = query.toLowerCase().trim();
    const filtered = allHosts.filter(h => 
        !selectedHostIds.includes(h.host_id) &&
        (h.full_name.toLowerCase().includes(cleanQuery) || 
         h.host_id.toLowerCase().includes(cleanQuery) ||
         (h.role || '').toLowerCase().includes(cleanQuery))
    );

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                    type="text"
                    value={query}
                    onFocus={() => setIsOpen(true)}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    placeholder={placeholder}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-[#6D2158] focus:ring-1 focus:ring-[#6D2158]/20 transition-all shadow-2xs"
                />
            </div>
            {isOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                    {filtered.length === 0 ? (
                        <div className="p-2.5 text-[11px] text-slate-400 font-bold text-center">
                            No staff found matching &quot;{query}&quot;
                        </div>
                    ) : (
                        filtered.map(h => (
                            <button
                                key={h.id || h.host_id}
                                type="button"
                                onClick={() => {
                                    onSelect(h.host_id);
                                    setQuery('');
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-[#6D2158]/5 text-xs font-bold text-slate-800 flex items-center justify-between transition-colors cursor-pointer"
                            >
                                <span>{h.full_name}</span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                    {h.role || h.sub_department || `ID: ${h.host_id}`}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

// Multi-Host Selector with Pills & Write-and-Search
const HostSelector = ({ 
    selectedHostIds = [], 
    allHosts = [], 
    onChange, 
    placeholder = "Type staff name to search & add..." 
}: { 
    selectedHostIds: string[]; 
    allHosts: Host[]; 
    onChange: (ids: string[]) => void; 
    placeholder?: string; 
}) => {
    const handleRemove = (idToRemove: string) => {
        onChange(selectedHostIds.filter(id => id !== idToRemove));
    };

    return (
        <div className="space-y-2 w-full">
            <div className="flex flex-wrap gap-1.5 items-center min-h-[30px]">
                {selectedHostIds.length === 0 ? (
                    <span className="text-[11px] text-slate-400 font-bold italic">No staff assigned</span>
                ) : (
                    selectedHostIds.map(id => {
                        const host = allHosts.find(h => h.host_id === id);
                        return (
                            <span key={id} className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-black text-slate-800 shadow-2xs">
                                <span>{host?.full_name || id}</span>
                                <button type="button" onClick={() => handleRemove(id)} className="text-slate-400 hover:text-rose-500 ml-0.5 cursor-pointer">
                                    <X size={11} />
                                </button>
                            </span>
                        );
                    })
                )}
            </div>

            <HostSearchCombobox
                allHosts={allHosts}
                selectedHostIds={selectedHostIds}
                onSelect={(id) => onChange([...selectedHostIds, id])}
                placeholder={placeholder}
            />
        </div>
    );
};

export default function BottleSetupPage() {
    const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
    const [isLocked, setIsLocked] = useState(true);
    const [bottleItems, setBottleItems] = useState<any[]>([]);
    const [hosts, setHosts] = useState<Host[]>([]);
    
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    const [extractDate, setExtractDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    
    // Core Allocations State
    const [parsedAllocations, setParsedAllocations] = useState<Allocation[]>([]);
    const [pantryAssignments, setPantryAssignments] = useState<Record<PantryName, string[]>>({
        'Jetty A Pantry': [],
        'Jetty B Pantry': [],
        'Jetty C Pantry': [],
        'Beach Pantry': []
    });
    const [selectedGlobalHost, setSelectedGlobalHost] = useState<string>('');
    const [paAssignedHosts, setPaAssignedHosts] = useState<string[]>([]);
    const [waterRoomAssignedHosts, setWaterRoomAssignedHosts] = useState<string[]>([]);

    const [paLocations, setPaLocations] = useState<Constant[]>([]);
    const [newPaLocation, setNewPaLocation] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDispatching, setIsDispatching] = useState(false);

    useEffect(() => { 
        fetchControlData(); 
    }, [selectedMonth]);

    const fetchControlData = async () => {
        setIsLoading(true);
        try {
            // 1. Hosts List
            const { data: hostData } = await supabase
                .from('hsk_hosts')
                .select('id, host_id, full_name, role, sub_department')
                .eq('status', 'Active')
                .order('full_name');
            
            const activeHosts = hostData || [];
            if (hostData) setHosts(activeHosts);

            // Calculate default departments
            const defaultWaterIds = activeHosts.filter(isWaterStaff).map(h => h.host_id);
            const defaultPaIds = activeHosts.filter(isPaStaff).map(h => h.host_id);

            // 2. Inventory Period Config
            const { data: periodData } = await supabase
                .from('hsk_inventory_periods')
                .select('bottle_is_locked, bottle_parsed_allocations')
                .eq('month_year', selectedMonth)
                .maybeSingle();

            let loadedVillas: Allocation[] = [];
            let loadedPantries: Record<PantryName, string[]> = {
                'Jetty A Pantry': [],
                'Jetty B Pantry': [],
                'Jetty C Pantry': [],
                'Beach Pantry': []
            };
            let loadedPa: string[] = [];
            let loadedWr: string[] = [];

            if (periodData) {
                setIsLocked(periodData.bottle_is_locked ?? true);
                const saved = periodData.bottle_parsed_allocations;
                if (Array.isArray(saved)) {
                    loadedVillas = saved;
                } else if (saved && typeof saved === 'object') {
                    loadedVillas = saved.villas || [];
                    if (saved.pantries) loadedPantries = saved.pantries;
                    if (saved.pa && saved.pa.length > 0) loadedPa = saved.pa;
                    if (saved.waterRoom && saved.waterRoom.length > 0) loadedWr = saved.waterRoom;
                }
            } else {
                setIsLocked(false);
            }

            // 3. Load Dispatched Assignments
            const { data: existingAssignments } = await supabase
                .from('hsk_bottle_assignments')
                .select('host_id, location_type, location_name')
                .eq('month_year', selectedMonth);

            if (existingAssignments && existingAssignments.length > 0) {
                const pMap: Record<PantryName, Set<string>> = {
                    'Jetty A Pantry': new Set(),
                    'Jetty B Pantry': new Set(),
                    'Jetty C Pantry': new Set(),
                    'Beach Pantry': new Set()
                };
                const paSet = new Set<string>();
                const wrSet = new Set<string>();

                existingAssignments.forEach(a => {
                    if (a.location_type === 'Pantry' && PANTRIES.includes(a.location_name as PantryName)) {
                        if (a.host_id && a.host_id !== 'SHARED_RUNNER') {
                            pMap[a.location_name as PantryName].add(a.host_id);
                        }
                    } else if (a.location_type === 'PA') {
                        if (a.host_id && a.host_id !== 'SHARED_PA') {
                            paSet.add(a.host_id);
                        }
                    } else if (a.location_type === 'Water Room') {
                        if (a.host_id && a.host_id !== 'SHARED_WATER_ROOM') {
                            wrSet.add(a.host_id);
                        }
                    }
                });

                PANTRIES.forEach(p => {
                    if (pMap[p].size > 0) loadedPantries[p] = Array.from(pMap[p]);
                });

                if (paSet.size > 0) loadedPa = Array.from(paSet);
                if (wrSet.size > 0) loadedWr = Array.from(wrSet);
            }

            setParsedAllocations(loadedVillas);
            setPantryAssignments(loadedPantries);

            // BY DEFAULT: If no explicit assignment exists, assign ALL staff in that department
            setPaAssignedHosts(loadedPa.length > 0 ? loadedPa : defaultPaIds);
            setWaterRoomAssignedHosts(loadedWr.length > 0 ? loadedWr : defaultWaterIds);

            // 4. Master Catalog Bottles
            const { data: items } = await supabase
                .from('hsk_master_catalog')
                .select('*')
                .eq('category', 'Bottle')
                .order('article_name', { ascending: true });
            if (items) setBottleItems(items);

            // 5. PA Bottle Locations
            const { data: locData } = await supabase
                .from('hsk_constants')
                .select('*')
                .eq('type', 'pa_bottle_location')
                .order('label', { ascending: true });
            if (locData) setPaLocations(locData);

        } catch (err: any) {
            console.error("Error fetching bottle control data:", err);
            toast.error("Failed to load setup configuration");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleLockStatus = async () => {
        const newStatus = !isLocked;
        const layoutPayload = {
            villas: parsedAllocations,
            pantries: pantryAssignments,
            pa: paAssignedHosts,
            waterRoom: waterRoomAssignedHosts
        };

        const { error } = await supabase.from('hsk_inventory_periods').upsert({ 
            month_year: selectedMonth, 
            bottle_is_locked: newStatus,
            bottle_parsed_allocations: layoutPayload 
        }, { onConflict: 'month_year' });

        if (!error) { 
            setIsLocked(newStatus); 
            toast.success(newStatus ? "Bottle Inventory Locked" : "Bottle Inventory Unlocked!"); 
        } else {
            toast.error("Could not update lock status: " + error.message);
        }
    };

    const handleSaveLayout = async () => {
        setIsSaving(true);
        try {
            const layoutPayload = {
                villas: parsedAllocations,
                pantries: pantryAssignments,
                pa: paAssignedHosts,
                waterRoom: waterRoomAssignedHosts
            };

            const { error } = await supabase.from('hsk_inventory_periods').upsert({
                month_year: selectedMonth,
                bottle_is_locked: isLocked,
                bottle_parsed_allocations: layoutPayload
            }, { onConflict: 'month_year' });

            if (error) throw error;
            toast.success("Layout & Staff Assignments Saved!");
        } catch (err: any) {
            console.error("Save layout error:", err);
            toast.error("Failed to save layout: " + (err?.message || "Check network"));
        } finally {
            setIsSaving(false);
        }
    };

    // --- STRICT EXTRACTION: ONLY VILLA ATTENDANTS + DEFAULT ALL PA & WATER ROOM ---
    const handleExtractAllocations = async () => {
        setIsExtracting(true);
        try {
            const { data: allocData, error } = await supabase
                .from('hsk_allocations')
                .select('*')
                .eq('report_date', extractDate);

            if (error) throw error;

            if (!allocData || allocData.length === 0) {
                toast.error(`No allocations found for date: ${extractDate}`);
                setIsExtracting(false);
                return;
            }

            // 1. Filter ONLY Villa Attendants (strict area === 'villa' and non-laundry/non-garden)
            const villaRows = allocData.filter(a => {
                const area = (a.area || '').toLowerCase();
                if (area !== 'villa' && area !== 'villas') return false;

                const host = hosts.find(h => h.id === a.host_id || h.host_id === a.host_id);
                const sub = (host?.sub_department || '').toLowerCase();
                const role = (host?.role || '').toLowerCase();
                
                if (sub.includes('laundry') || sub.includes('garden') || sub.includes('tailor')) return false;
                if (role.includes('laundry') || role.includes('garden') || role.includes('tailor')) return false;

                return Boolean(a.task_details && a.task_details.trim());
            });

            const hostVillaMap = new Map<string, { host_id: string; host_name: string; villas: Set<string> }>();

            villaRows.forEach(a => {
                const host = hosts.find(h => h.id === a.host_id || h.host_id === a.host_id);
                const hId = host ? host.host_id : a.host_id;
                const hName = host ? host.full_name : (a.host_name || 'Villa Attendant');

                if (!hostVillaMap.has(hId)) {
                    hostVillaMap.set(hId, { host_id: hId, host_name: hName, villas: new Set() });
                }

                const villaTokens = a.task_details.split(/[,\s]+/).map((s: string) => s.trim()).filter(Boolean);
                villaTokens.forEach((v: string) => hostVillaMap.get(hId)!.villas.add(v));
            });

            const parsedVillas: Allocation[] = Array.from(hostVillaMap.values()).map(v => ({
                host_id: v.host_id,
                host_name: v.host_name,
                assigned_villas: Array.from(v.villas)
            }));

            setParsedAllocations(parsedVillas);

            // 2. By default select ALL Water Room staff
            const allWater = hosts.filter(isWaterStaff).map(h => h.host_id);
            if (allWater.length > 0) {
                setWaterRoomAssignedHosts(allWater);
            }

            // 3. By default select ALL Public Area staff
            const allPa = hosts.filter(isPaStaff).map(h => h.host_id);
            if (allPa.length > 0) {
                setPaAssignedHosts(allPa);
            }

            toast.success(`Extracted ${parsedVillas.length} Villa Attendants (Defaulted all PA & Water Room staff)`);
        } catch (err: any) {
            console.error("Extract error:", err);
            toast.error("Failed to extract allocations: " + err.message);
        } finally {
            setIsExtracting(false);
        }
    };

    // Quick Apply to All 4 Pantries
    const handleApplyToAllPantries = (hostId: string) => {
        if (!hostId) return;
        setPantryAssignments({
            'Jetty A Pantry': [hostId],
            'Jetty B Pantry': [hostId],
            'Jetty C Pantry': [hostId],
            'Beach Pantry': [hostId]
        });
        const hostName = hosts.find(h => h.host_id === hostId)?.full_name || hostId;
        toast.success(`Assigned ${hostName} across all 4 pantries!`);
    };

    // Dispatch Tasks with Shared Counting Architecture
    const handleAutoAllocateBottles = async () => {
        if (parsedAllocations.length === 0) {
            return toast.error("Please extract or add villa allocations first.");
        }

        setIsDispatching(true);
        try {
            const allItems = bottleItems.map(i => i.article_number);
            const vaItems = bottleItems.filter(i => !i.is_va_excluded).map(i => i.article_number);
            const paItems = bottleItems.filter(i => i.is_pa_applicable).map(i => i.article_number);

            await supabase.from('hsk_bottle_assignments').delete().eq('month_year', selectedMonth);

            const inserts: any[] = [];

            // 1. Villa Attendants
            parsedAllocations.forEach(alloc => {
                alloc.assigned_villas.forEach(v => {
                    inserts.push({ 
                        month_year: selectedMonth, 
                        host_id: alloc.host_id, 
                        location_type: 'Villa', 
                        location_name: v, 
                        assigned_items: vaItems 
                    });
                });
            });

            // 2. Pantries (Shared single-count location)
            PANTRIES.forEach(pantry => {
                const assigned = pantryAssignments[pantry] || [];
                if (assigned.length === 0) {
                    inserts.push({ 
                        month_year: selectedMonth, 
                        host_id: 'SHARED_RUNNER', 
                        location_type: 'Pantry', 
                        location_name: pantry, 
                        assigned_items: allItems 
                    });
                } else {
                    assigned.forEach(hId => {
                        inserts.push({ 
                            month_year: selectedMonth, 
                            host_id: hId, 
                            location_type: 'Pantry', 
                            location_name: pantry, 
                            assigned_items: allItems 
                        });
                    });
                }
            });

            // 3. Public Area (Shared single-count locations)
            paLocations.forEach(loc => {
                if (paAssignedHosts.length === 0) {
                    inserts.push({ 
                        month_year: selectedMonth, 
                        host_id: 'SHARED_PA', 
                        location_type: 'PA', 
                        location_name: loc.label, 
                        assigned_items: paItems 
                    });
                } else {
                    paAssignedHosts.forEach(hId => {
                        inserts.push({ 
                            month_year: selectedMonth, 
                            host_id: hId, 
                            location_type: 'PA', 
                            location_name: loc.label, 
                            assigned_items: paItems 
                        });
                    });
                }
            });

            // 4. Water Room (Shared single-count location: 'Water Room Main')
            if (waterRoomAssignedHosts.length === 0) {
                inserts.push({ 
                    month_year: selectedMonth, 
                    host_id: 'SHARED_WATER_ROOM', 
                    location_type: 'Water Room', 
                    location_name: 'Water Room Main', 
                    assigned_items: allItems 
                });
            } else {
                waterRoomAssignedHosts.forEach(hId => {
                    inserts.push({ 
                        month_year: selectedMonth, 
                        host_id: hId, 
                        location_type: 'Water Room', 
                        location_name: 'Water Room Main', 
                        assigned_items: allItems 
                    });
                });
            }

            // 5. External Outlets
            BOTTLE_OUTLETS.forEach(outlet => {
                inserts.push({ 
                    month_year: selectedMonth, 
                    host_id: 'SHARED_OUTLET', 
                    location_type: 'Outlet', 
                    location_name: outlet, 
                    assigned_items: allItems 
                });
            });

            const { error } = await supabase.from('hsk_bottle_assignments').insert(inserts);
            if (error) throw error;

            await handleSaveLayout();
            toast.success(`Dispatched ${inserts.length} bottle tasks successfully!`);
        } catch (e: any) { 
            console.error("Dispatch error:", e);
            toast.error("Failed to dispatch tasks: " + (e?.message || "Database error")); 
        } finally {
            setIsDispatching(false);
        }
    };

    const toggleItemFlag = async (articleNo: string, field: 'is_pa_applicable' | 'is_va_excluded', val: boolean) => {
        const { error } = await supabase.from('hsk_master_catalog').update({ [field]: val }).eq('article_number', articleNo);
        if (!error) {
            setBottleItems(prev => prev.map(i => i.article_number === articleNo ? { ...i, [field]: val } : i));
            toast.success("Item List Updated");
        }
    };

    const updateSortOrder = async (articleNo: string, val: number | null) => {
        const { error } = await supabase.from('hsk_master_catalog').update({ sort_order: val }).eq('article_number', articleNo);
        if (!error) {
            setBottleItems(prev => prev.map(i => i.article_number === articleNo ? { ...i, sort_order: val } : i));
            toast.success("Sort order saved");
        } else {
            toast.error("Failed to save sort order");
        }
    };

    const handleCopyOutletLink = (outletName: string) => {
        const url = `${window.location.origin}/share/bottle?outlet=${encodeURIComponent(outletName)}&month=${selectedMonth}`;
        navigator.clipboard.writeText(url);
        toast.success(`Link for ${outletName} copied to clipboard!`);
    };

    const allWaterRoomHosts = hosts.filter(isWaterStaff);
    const allPublicAreaHosts = hosts.filter(isPaStaff);

    return (
        <div className="flex flex-col min-h-full bg-[#FDFBFD] pb-36 font-sans">
            <PageHeader title="Bottle Setup & Dispatch" date={new Date()} onDateChange={() => {}} />

            <div className="px-4 md:px-8 max-w-[1400px] mx-auto w-full mt-6 space-y-6">
                
                {/* STATUS BAR */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Inventory Month</label>
                        <input type="month" className="w-full md:w-64 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={toggleLockStatus} 
                            className={`flex items-center gap-3 px-6 py-3 rounded-xl font-black text-sm shadow-sm transition-all cursor-pointer ${
                                isLocked 
                                    ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100' 
                                    : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                            }`}
                        >
                            {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
                            {isLocked ? 'SYSTEM LOCKED' : 'SYSTEM UNLOCKED'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    
                    {/* WIDER LEFT COLUMN: Allocations & Sorting */}
                    <div className="xl:col-span-2 flex flex-col gap-6">
                        
                        {/* 1. VILLA ATTENDANT ALLOCATION TABLE */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col min-h-[380px]">
                            <div className="p-6 border-b bg-slate-50/50 flex flex-col gap-4 rounded-t-3xl">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-black text-lg flex items-center gap-2">
                                        <Users size={20} className="text-[#6D2158]"/> 
                                        <span>Villa Attendant Allocation</span>
                                    </h3>
                                    <span className="text-xs font-bold text-slate-400">
                                        {parsedAllocations.length} Villa Attendants
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
                                    <div className="flex gap-2 items-center">
                                        <input 
                                            type="date" 
                                            className="p-2 border rounded-xl text-sm font-bold bg-slate-50 outline-none" 
                                            value={extractDate} 
                                            onChange={e => setExtractDate(e.target.value)} 
                                        />
                                        <button 
                                            onClick={handleExtractAllocations} 
                                            disabled={isExtracting}
                                            className="bg-[#6D2158] hover:bg-[#581745] text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 cursor-pointer transition-all disabled:opacity-60"
                                        >
                                            {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14}/>}
                                            <span>Extract Villa Attendants</span>
                                        </button>
                                    </div>
                                    <button 
                                        onClick={handleSaveLayout} 
                                        disabled={isSaving}
                                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-60"
                                    >
                                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                        <span>Save Layout</span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar max-h-[460px]">
                                {parsedAllocations.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 font-bold text-xs bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                        No villa attendants loaded. Click &quot;Extract Villa Attendants&quot; above to pull active assignments.
                                    </div>
                                ) : (
                                    <table className="w-full text-left border-separate border-spacing-y-2">
                                        <thead className="text-[10px] uppercase text-slate-400 font-black">
                                            <tr>
                                                <th className="px-4 py-2">Attendant</th>
                                                <th className="px-4 py-2">Assigned Villas (Bottle Counting)</th>
                                                <th className="px-4 py-2 text-right"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsedAllocations.map((alloc, idx) => (
                                                <tr key={alloc.host_id || idx} className="bg-white shadow-2xs border rounded-xl">
                                                    <td className="p-3 font-bold text-sm text-slate-800 border-l rounded-l-xl whitespace-nowrap">
                                                        {alloc.host_name} 
                                                        <div className="text-[9px] text-slate-400 font-mono font-bold">ID: {alloc.host_id}</div>
                                                    </td>
                                                    <td className="p-2 w-full">
                                                        <TagInput 
                                                            values={alloc.assigned_villas} 
                                                            onChange={(v) => {
                                                                const updated = [...parsedAllocations];
                                                                updated[idx].assigned_villas = v;
                                                                setParsedAllocations(updated);
                                                            }} 
                                                            placeholder="Add villa..." 
                                                        />
                                                    </td>
                                                    <td className="p-3 text-right border-r rounded-r-xl">
                                                        <button 
                                                            onClick={() => {
                                                                const updated = [...parsedAllocations];
                                                                updated.splice(idx, 1);
                                                                setParsedAllocations(updated);
                                                            }} 
                                                            className="text-slate-300 hover:text-rose-500 cursor-pointer transition-colors p-1"
                                                            title="Remove attendant"
                                                        >
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>

                        {/* 2. PANTRIES, PUBLIC AREA & WATER ROOM ASSIGNMENTS */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-6">
                            <div>
                                <h3 className="font-black text-lg flex items-center gap-2 text-[#6D2158]">
                                    <Layers size={20}/> 
                                    <span>Area Staff Allocations (Pantries, PA & Water Room)</span>
                                </h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                                    Write and search staff below • Staff in same area share one live count
                                </p>
                            </div>

                            {/* PANTRIES SECTION */}
                            <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
                                    <div>
                                        <h4 className="font-black text-sm text-slate-800 flex items-center gap-2">
                                            <Container size={16} className="text-amber-600"/>
                                            <span>Pantries Setup</span>
                                        </h4>
                                        <span className="text-[10px] text-slate-400 font-bold">Search and assign staff per pantry or apply one person across all</span>
                                    </div>

                                    {/* SEARCH AND APPLY TO ALL PANTRIES */}
                                    <div className="w-full sm:w-72">
                                        <span className="text-[9px] font-black uppercase text-amber-800 block mb-1">
                                            Quick Apply 1 Staff to All 4 Pantries:
                                        </span>
                                        <HostSearchCombobox
                                            allHosts={hosts}
                                            selectedHostIds={[]}
                                            onSelect={handleApplyToAllPantries}
                                            placeholder="Type staff name to apply to all 4..."
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {PANTRIES.map(pantry => (
                                        <div key={pantry} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                                            <span className="text-xs font-black text-slate-800 block">{pantry}</span>
                                            <HostSelector
                                                selectedHostIds={pantryAssignments[pantry] || []}
                                                allHosts={hosts}
                                                onChange={(ids) => setPantryAssignments(prev => ({ ...prev, [pantry]: ids }))}
                                                placeholder={`Search staff for ${pantry}...`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* PUBLIC AREA & WATER ROOM SECTION (DEFAULTED TO ALL STAFF) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                
                                {/* Public Area (Defaulted to all PA staff) */}
                                <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-black text-sm text-indigo-900 flex items-center gap-1.5">
                                                <MapPin size={16} className="text-indigo-600"/>
                                                <span>Public Area Team</span>
                                            </h4>
                                            <span className="text-[10px] text-slate-500 font-medium">
                                                Defaulted to all {allPublicAreaHosts.length} PA staff members
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setPaAssignedHosts(allPublicAreaHosts.map(h => h.host_id))}
                                            className="text-[9px] font-black uppercase tracking-wider bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                                        >
                                            <RotateCcw size={10} /> Select All ({allPublicAreaHosts.length})
                                        </button>
                                    </div>

                                    <HostSelector
                                        selectedHostIds={paAssignedHosts}
                                        allHosts={hosts}
                                        onChange={setPaAssignedHosts}
                                        placeholder="Type name to add more staff..."
                                    />
                                </div>

                                {/* Water Room (Defaulted to all Water Room staff) */}
                                <div className="bg-sky-50/50 p-4 rounded-2xl border border-sky-100 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-black text-sm text-sky-900 flex items-center gap-1.5">
                                                <Droplets size={16} className="text-sky-600"/>
                                                <span>Water Room Team</span>
                                            </h4>
                                            <span className="text-[10px] text-slate-500 font-medium">
                                                Defaulted to all {allWaterRoomHosts.length} Water Room staff
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setWaterRoomAssignedHosts(allWaterRoomHosts.map(h => h.host_id))}
                                            className="text-[9px] font-black uppercase tracking-wider bg-sky-100 hover:bg-sky-200 text-sky-800 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                                        >
                                            <RotateCcw size={10} /> Select All ({allWaterRoomHosts.length})
                                        </button>
                                    </div>

                                    <HostSelector
                                        selectedHostIds={waterRoomAssignedHosts}
                                        allHosts={hosts}
                                        onChange={setWaterRoomAssignedHosts}
                                        placeholder="Type name to add more staff..."
                                    />
                                </div>
                            </div>

                            {/* DISPATCH ACTION BUTTON */}
                            <div className="pt-2">
                                <button 
                                    onClick={handleAutoAllocateBottles} 
                                    disabled={isDispatching}
                                    className="w-full py-4 bg-[#6D2158] hover:bg-[#581745] active:scale-[0.99] text-white rounded-2xl font-black uppercase tracking-widest text-sm flex justify-center items-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-60"
                                >
                                    {isDispatching ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                    <span>{isDispatching ? "Dispatching Tasks..." : "Save Layout & Dispatch Bottle Tasks"}</span>
                                </button>
                            </div>
                        </div>

                        {/* 3. SORTING LIST */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
                            <h3 className="font-black text-lg flex items-center gap-2 text-[#6D2158] mb-1">
                                <ListOrdered size={20}/> 
                                <span>Custom Sort Order</span>
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-4 tracking-widest">
                                Set the exact sequence items appear in counting forms
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {bottleItems.sort((a,b) => (a.sort_order || 999) - (b.sort_order || 999)).map(item => (
                                    <div key={item.article_number} className="flex items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm gap-3">
                                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden p-1">
                                            {item.image_url ? (
                                                <img src={item.image_url} alt="" className="w-full h-full object-contain rounded"/>
                                            ) : (
                                                <ImageIcon size={16} className="text-slate-300"/>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs font-black text-slate-700 leading-tight line-clamp-2" title={item.generic_name || item.article_name}>
                                                {item.generic_name || item.article_name}
                                            </div>
                                            <div className="text-[9px] font-bold text-slate-400 mt-0.5">{item.article_number}</div>
                                        </div>
                                        <input 
                                            type="number" 
                                            className="w-16 p-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-center outline-none focus:border-[#6D2158] shadow-inner shrink-0"
                                            placeholder="--"
                                            value={item.sort_order === null ? '' : item.sort_order}
                                            onChange={(e) => setBottleItems(prev => prev.map(i => i.article_number === item.article_number ? { ...i, sort_order: e.target.value === '' ? null : parseInt(e.target.value) } : i))}
                                            onBlur={(e) => updateSortOrder(item.article_number, e.target.value === '' ? null : parseInt(e.target.value))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* NARROWER RIGHT SIDEBAR: Settings & Links */}
                    <div className="space-y-6">
                        
                        {/* PA LOCATIONS */}
                        <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50">
                            <h3 className="font-black text-lg flex items-center gap-2 text-indigo-900"><MapPin size={18}/> Bottle PA Locations</h3>
                            <div className="flex gap-2 mt-4">
                                <input type="text" placeholder="Location Name" className="flex-1 p-2.5 border rounded-lg font-bold text-xs outline-none bg-white" value={newPaLocation} onChange={e => setNewPaLocation(e.target.value)} />
                                <button onClick={async () => {
                                    if (!newPaLocation.trim()) return;
                                    await supabase.from('hsk_constants').insert({ type: 'pa_bottle_location', label: newPaLocation.trim() });
                                    setNewPaLocation('');
                                    fetchControlData();
                                }} className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"><Plus size={16}/></button>
                            </div>
                            <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                {paLocations.map(loc => (
                                    <div key={loc.id} className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm border border-indigo-50">
                                        <span className="text-xs font-bold text-slate-700">{loc.label}</span>
                                        <button onClick={async () => { await supabase.from('hsk_constants').delete().eq('id', loc.id); fetchControlData(); }} className="text-slate-300 hover:text-rose-500 transition-colors cursor-pointer"><Trash2 size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* OUTLETS INFO & LINKS */}
                        <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100/50">
                            <h3 className="font-black text-lg flex items-center gap-2 text-amber-900"><Utensils size={18}/> External Outlets</h3>
                            <p className="text-[10px] text-amber-600/70 mt-1 font-bold uppercase tracking-widest">Click to copy submission link</p>
                            
                            <div className="mt-4 flex flex-col gap-2">
                                {BOTTLE_OUTLETS.map(outletName => (
                                    <button 
                                        key={outletName} 
                                        onClick={() => handleCopyOutletLink(outletName)}
                                        className="bg-white p-3.5 rounded-xl flex items-center justify-between group hover:bg-amber-100/50 transition-colors border border-amber-100/50 shadow-sm cursor-pointer"
                                    >
                                        <span className="text-xs font-black text-amber-900">{outletName}</span>
                                        <LinkIcon size={14} className="text-amber-400 group-hover:text-amber-600"/>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* VISIBILITY TOGGLES */}
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                            <div>
                                <h3 className="font-black text-sm mb-2 flex items-center gap-2 text-emerald-600"><ShieldCheck size={16}/> PA Bottle List</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-2 tracking-widest">Items tracked by PA Attendants</p>
                                <HostSearchCombobox
                                    allHosts={bottleItems.filter(i => !i.is_pa_applicable).map(i => ({ id: i.article_number, host_id: i.article_number, full_name: i.generic_name || i.article_name, role: i.article_number }))}
                                    selectedHostIds={[]}
                                    onSelect={(artNo) => toggleItemFlag(artNo, 'is_pa_applicable', true)}
                                    placeholder="Type item name to add..."
                                />
                                <div className="mt-3 flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                    {bottleItems.filter(i => i.is_pa_applicable).map(i => (
                                        <div key={i.article_number} className="flex items-center justify-between bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                                            <span className="text-xs font-bold text-slate-700">{i.generic_name || i.article_name}</span>
                                            <button onClick={() => toggleItemFlag(i.article_number, 'is_pa_applicable', false)} className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="h-px bg-slate-100 w-full"></div>

                            <div>
                                <h3 className="font-black text-sm mb-2 flex items-center gap-2 text-rose-500"><EyeOff size={16}/> VA Exclude List</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-2 tracking-widest">Hide these items from Villas</p>
                                <HostSearchCombobox
                                    allHosts={bottleItems.filter(i => !i.is_va_excluded).map(i => ({ id: i.article_number, host_id: i.article_number, full_name: i.generic_name || i.article_name, role: i.article_number }))}
                                    selectedHostIds={[]}
                                    onSelect={(artNo) => toggleItemFlag(artNo, 'is_va_excluded', true)}
                                    placeholder="Type item name to hide..."
                                />
                                <div className="mt-3 flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                    {bottleItems.filter(i => i.is_va_excluded).map(i => (
                                        <div key={i.article_number} className="flex items-center justify-between bg-rose-50/50 p-2 rounded-lg border border-rose-100">
                                            <span className="text-xs font-bold text-slate-700">{i.generic_name || i.article_name}</span>
                                            <button onClick={() => toggleItemFlag(i.article_number, 'is_va_excluded', false)} className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
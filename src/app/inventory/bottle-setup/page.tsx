"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Sparkles, Container, Lock, Unlock, AlertTriangle, Users, 
    ShieldCheck, MapPin, Plus, Trash2, DownloadCloud, EyeOff, 
    X, Search, Calendar, Loader2, Save, Droplets, Utensils, Ship, PlaneTakeoff, Link as LinkIcon
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';
import { format, startOfMonth, parse } from 'date-fns';

type Host = { id: string; host_id: string; full_name: string; role: string; };
type Allocation = { id?: string; host_id: string; host_name: string; assigned_villas: string[]; };
type Constant = { id: string; type: string; label: string; };

const PANTRIES = ['Jetty A Pantry', 'Jetty B Pantry', 'Jetty C Pantry', 'Beach Pantry'];

const BOTTLE_OUTLETS = [
    'Food & Beverages',
    'SPA',
    'Tropic Surf',
    'Boat',
    'Sea Plane Lounge'
];

// --- CUSTOM TAG INPUT ---
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

export default function BottleSetupPage() {
    const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
    const [isLocked, setIsLocked] = useState(true);
    const [bottleItems, setBottleItems] = useState<any[]>([]);
    const [hosts, setHosts] = useState<Host[]>([]);
    
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    const [extractDate, setExtractDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    const [parsedAllocations, setParsedAllocations] = useState<Allocation[]>([]);
    const [hostSearch, setHostSearch] = useState('');
    const [showHostDropdown, setShowHostDropdown] = useState(false);
    
    const [paLocations, setPaLocations] = useState<Constant[]>([]);
    const [newPaLocation, setNewPaLocation] = useState('');
    const [selectedPaItem, setSelectedPaItem] = useState('');
    const [selectedVaExcludedItem, setSelectedVaExcludedItem] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => { fetchControlData(); }, [selectedMonth]);

    const fetchControlData = async () => {
        setIsLoading(true);
        const { data: periodData } = await supabase.from('hsk_inventory_periods').select('bottle_is_locked, bottle_parsed_allocations').eq('month_year', selectedMonth).single();
        if (periodData) {
            setIsLocked(periodData.bottle_is_locked);
            setParsedAllocations(periodData.bottle_parsed_allocations || []);
        } else {
            setIsLocked(true);
            setParsedAllocations([]);
        }

        const { data: items } = await supabase.from('hsk_master_catalog').select('*').eq('category', 'Bottle').order('article_name', { ascending: true });
        if (items) setBottleItems(items);

        const { data: hostData } = await supabase.from('hsk_hosts').select('id, host_id, full_name, role').eq('status', 'Active');
        if (hostData) setHosts(hostData);

        const { data: locData } = await supabase.from('hsk_constants').select('*').eq('type', 'pa_bottle_location').order('label', { ascending: true });
        if (locData) setPaLocations(locData);

        setIsLoading(false);
    };

    const toggleLockStatus = async () => {
        const newStatus = !isLocked;
        const { error } = await supabase.from('hsk_inventory_periods').upsert({ 
            month_year: selectedMonth, 
            bottle_is_locked: newStatus,
            bottle_parsed_allocations: parsedAllocations 
        }, { onConflict: 'month_year' });

        if (!error) { setIsLocked(newStatus); toast.success(newStatus ? "Bottle Inventory Locked" : "Bottle Inventory Unlocked!"); }
    };

    const handleSaveLayout = async () => {
        setIsLoading(true);
        const { error } = await supabase.from('hsk_inventory_periods').upsert({
            month_year: selectedMonth,
            bottle_is_locked: isLocked,
            bottle_parsed_allocations: parsedAllocations
        }, { onConflict: 'month_year' });
        if (!error) toast.success("Layout Saved!");
        setIsLoading(false);
    };

    const handleExtractAllocations = async () => {
        setIsLoading(true);
        const { data: allocData, error } = await supabase.from('hsk_allocations').select('*').eq('report_date', extractDate);
        if (allocData) {
            const active = allocData.filter(a => a.task_details).map(a => {
                const host = hosts.find(h => h.id === a.host_id || h.host_id === a.host_id);
                return {
                    host_id: host ? host.host_id : a.host_id, 
                    host_name: host ? host.full_name : a.host_name,
                    assigned_villas: a.task_details.split(',').map((s: string) => s.trim()).filter(Boolean)
                };
            });
            setParsedAllocations(active);
            toast.success("Allocations Extracted!");
        }
        setIsLoading(false);
    };

    const handleAutoAllocateBottles = async () => {
        if (parsedAllocations.length === 0) return toast.error("No allocations to dispatch.");
        setIsLoading(true);
        try {
            const allItems = bottleItems.map(i => i.article_number);
            const vaItems = bottleItems.filter(i => !i.is_va_excluded).map(i => i.article_number);
            const paItems = bottleItems.filter(i => i.is_pa_applicable).map(i => i.article_number);

            await supabase.from('hsk_bottle_assignments').delete().eq('month_year', selectedMonth);

            const inserts: any[] = [];

            // 1. Villa Attendants (Villas Only)
            parsedAllocations.forEach(alloc => {
                alloc.assigned_villas.forEach(v => {
                    inserts.push({ month_year: selectedMonth, host_id: alloc.host_id, location_type: 'Villa', location_name: v, assigned_items: vaItems });
                });
            });

            // 2. Runner on Duty (All Pantries)
            PANTRIES.forEach(pantry => {
                inserts.push({ month_year: selectedMonth, host_id: 'SHARED_RUNNER', location_type: 'Pantry', location_name: pantry, assigned_items: allItems });
            });

            // 3. Outlets
            BOTTLE_OUTLETS.forEach(outlet => {
                inserts.push({ month_year: selectedMonth, host_id: 'SHARED_OUTLET', location_type: 'Outlet', location_name: outlet, assigned_items: allItems });
            });

            // 4. PA Locations
            paLocations.forEach(loc => {
                inserts.push({ month_year: selectedMonth, host_id: 'SHARED_PA', location_type: 'PA', location_name: loc.label, assigned_items: paItems });
            });

            // 5. Water Room (In Circulation & New)
            inserts.push({ month_year: selectedMonth, host_id: 'SHARED_WATER_ROOM', location_type: 'Water Room', location_name: 'Water Room Main', assigned_items: allItems });

            const { error } = await supabase.from('hsk_bottle_assignments').insert(inserts);
            if (error) throw error;
            toast.success("Bottle Assignments Dispatched!");
        } catch (e: any) { toast.error(e.message); }
        setIsLoading(false);
    };

    const toggleItemFlag = async (articleNo: string, field: 'is_pa_applicable' | 'is_va_excluded', val: boolean) => {
        const { error } = await supabase.from('hsk_master_catalog').update({ [field]: val }).eq('article_number', articleNo);
        if (!error) {
            setBottleItems(prev => prev.map(i => i.article_number === articleNo ? { ...i, [field]: val } : i));
            toast.success("Item List Updated");
        }
    };

    // Helper to generate the exact link and copy to clipboard
    const handleCopyOutletLink = (outletName: string) => {
        const url = `${window.location.origin}/share/bottle?outlet=${encodeURIComponent(outletName)}&month=${selectedMonth}`;
        navigator.clipboard.writeText(url);
        toast.success(`Link for ${outletName} copied to clipboard!`);
    };

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
                    <button onClick={toggleLockStatus} className={`flex items-center gap-3 px-6 py-3 rounded-xl font-black text-sm shadow-sm ${isLocked ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                        {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
                        {isLocked ? 'SYSTEM LOCKED' : 'SYSTEM UNLOCKED'}
                    </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* ALLOCATION TABLE */}
                    <div className="xl:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col h-[80vh]">
                        <div className="p-6 border-b bg-slate-50/50 flex flex-col gap-4">
                            <h3 className="font-black text-lg flex items-center gap-2"><Users size={20} className="text-[#6D2158]"/> Villa Attendant Allocation</h3>
                            <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex gap-2">
                                    <input type="date" className="p-2 border rounded-xl text-sm font-bold bg-slate-50" value={extractDate} onChange={e => setExtractDate(e.target.value)} />
                                    <button onClick={handleExtractAllocations} className="bg-[#6D2158] text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><DownloadCloud size={14}/> Extract</button>
                                </div>
                                <button onClick={handleSaveLayout} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest"><Save size={14} className="inline mr-1"/> Save Layout</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
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
                                        <tr key={idx} className="bg-white shadow-sm border rounded-xl">
                                            <td className="p-3 font-bold text-sm text-slate-800 border-l rounded-l-xl">
                                                {alloc.host_name} <div className="text-[9px] text-slate-400">SSL {alloc.host_id}</div>
                                            </td>
                                            <td className="p-2">
                                                <TagInput values={alloc.assigned_villas} onChange={(v) => {
                                                    const updated = [...parsedAllocations];
                                                    updated[idx].assigned_villas = v;
                                                    setParsedAllocations(updated);
                                                }} placeholder="Villas..." />
                                            </td>
                                            <td className="p-3 text-right border-r rounded-r-xl">
                                                <button onClick={() => {
                                                    const updated = [...parsedAllocations];
                                                    updated.splice(idx, 1);
                                                    setParsedAllocations(updated);
                                                }} className="text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="p-6 border-t bg-white">
                            <button onClick={handleAutoAllocateBottles} disabled={isLocked || parsedAllocations.length === 0} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-sm flex justify-center items-center gap-2 disabled:opacity-50">
                                <Sparkles size={18} /> Dispatch Bottle Tasks
                            </button>
                        </div>
                    </div>

                    {/* SETTINGS SIDEBAR */}
                    <div className="space-y-6">
                        {/* PA LOCATIONS */}
                        <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50">
                            <h3 className="font-black text-lg flex items-center gap-2 text-indigo-900"><MapPin size={18}/> Bottle PA Locations</h3>
                            <div className="flex gap-2 mt-4">
                                <input type="text" placeholder="Location Name" className="flex-1 p-2.5 border rounded-lg font-bold text-xs" value={newPaLocation} onChange={e => setNewPaLocation(e.target.value)} />
                                <button onClick={async () => {
                                    await supabase.from('hsk_constants').insert({ type: 'pa_bottle_location', label: newPaLocation });
                                    setNewPaLocation('');
                                    fetchControlData();
                                }} className="bg-indigo-600 text-white p-2 rounded-lg"><Plus size={16}/></button>
                            </div>
                            <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                {paLocations.map(loc => (
                                    <div key={loc.id} className="flex justify-between items-center p-2 bg-white rounded-lg shadow-sm">
                                        <span className="text-xs font-bold text-slate-700">{loc.label}</span>
                                        <button onClick={async () => { await supabase.from('hsk_constants').delete().eq('id', loc.id); fetchControlData(); }} className="text-slate-300 hover:text-rose-500"><Trash2 size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* OUTLETS INFO & LINKS */}
                        <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100/50">
                            <h3 className="font-black text-lg flex items-center gap-2 text-amber-900"><Utensils size={18}/> External Outlets</h3>
                            <p className="text-[10px] text-amber-600/70 mt-1 font-bold uppercase">Click to copy submission link</p>
                            
                            <div className="mt-4 flex flex-col gap-2">
                                {BOTTLE_OUTLETS.map(outletName => (
                                    <button 
                                        key={outletName} 
                                        onClick={() => handleCopyOutletLink(outletName)}
                                        className="bg-white p-3 rounded-xl flex items-center justify-between group hover:bg-amber-100/50 transition-colors border border-amber-100"
                                    >
                                        <span className="text-xs font-bold text-amber-900">{outletName}</span>
                                        <LinkIcon size={14} className="text-amber-500 group-hover:text-amber-700"/>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ITEM CONFIGS */}
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                            <div>
                                <h3 className="font-black text-sm mb-2 flex items-center gap-2 text-emerald-600"><ShieldCheck size={16}/> PA Bottle List</h3>
                                <select className="w-full p-2 border rounded-xl text-xs font-bold bg-slate-50" onChange={e => toggleItemFlag(e.target.value, 'is_pa_applicable', true)} value="">
                                    <option value="">Add to PA List...</option>
                                    {bottleItems.filter(i => !i.is_pa_applicable).map(i => <option key={i.article_number} value={i.article_number}>{i.generic_name}</option>)}
                                </select>
                            </div>

                            <div>
                                <h3 className="font-black text-sm mb-2 flex items-center gap-2 text-rose-500"><EyeOff size={16}/> VA Exclude List</h3>
                                <select className="w-full p-2 border rounded-xl text-xs font-bold bg-slate-50" onChange={e => toggleItemFlag(e.target.value, 'is_va_excluded', true)} value="">
                                    <option value="">Hide from VA...</option>
                                    {bottleItems.filter(i => !i.is_va_excluded).map(i => <option key={i.article_number} value={i.article_number}>{i.generic_name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
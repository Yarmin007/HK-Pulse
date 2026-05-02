"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Sparkles, Layers, Lock, Unlock, AlertTriangle, Users, 
    ShieldCheck, MapPin, Plus, Trash2, DownloadCloud, EyeOff, 
    X, Search, Calendar, Loader2, Save
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';
import { format, startOfMonth, parse } from 'date-fns';

type Host = { id: string; host_id: string; full_name: string; role: string; };
type Allocation = { id?: string; host_id: string; host_name: string; assigned_villas: string[]; assigned_pantries: string[]; };
type Constant = { id: string; type: string; label: string; };

const PANTRIES = [
    'Jetty A Pantry',
    'Jetty B Pantry',
    'Jetty C Pantry',
    'Beach Pantry'
];

// --- HELPER: VILLA TO PANTRY LOGIC ---
const determinePantries = (villas: string[]): string[] => {
    const pantries = new Set<string>();
    
    villas.forEach(vStr => {
        const v = parseInt(vStr.replace(/\D/g, ''), 10);
        if (isNaN(v)) return;

        if (v >= 1 && v <= 35) pantries.add('Jetty A Pantry');
        else if (v >= 37 && v <= 50) pantries.add('Jetty B Pantry');
        else if (v >= 59 && v <= 79) pantries.add('Jetty C Pantry');
        else if (v <= 97) pantries.add('Beach Pantry'); // Catches 36, 51-58, 80-97
    });

    return Array.from(pantries);
};

// --- CUSTOM VILLA/PANTRY TAG INPUT COMPONENTS ---
const TagInput = ({ values = [], onChange, placeholder, options }: { values: string[], onChange: (val: string[]) => void, placeholder: string, options?: string[] }) => {
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
            
            {options ? (
                <select 
                    className="bg-transparent outline-none flex-1 min-w-[100px] font-bold text-xs text-slate-600 cursor-pointer"
                    value=""
                    onChange={(e) => {
                        const newTag = e.target.value;
                        if (newTag && !values.includes(newTag)) {
                            onChange([...values, newTag]);
                        }
                    }}
                >
                    <option value="" disabled>{values.length === 0 ? placeholder : "Add..."}</option>
                    {options.filter(o => !values.includes(o)).map(o => (
                        <option key={o} value={o}>{o}</option>
                    ))}
                </select>
            ) : (
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
            )}
        </div>
    );
};


export default function LinenControlPanel() {
    const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
    const [isLocked, setIsLocked] = useState(true);
    const [linenItems, setLinenItems] = useState<any[]>([]);
    const [hosts, setHosts] = useState<Host[]>([]);
    
    // --- Allocation Parser State ---
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    const [extractDate, setExtractDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    const [parsedAllocations, setParsedAllocations] = useState<Allocation[]>([]);
    const [hostSearch, setHostSearch] = useState('');
    const [showHostDropdown, setShowHostDropdown] = useState(false);
    
    // PA Locations State
    const [paLocations, setPaLocations] = useState<Constant[]>([]);
    const [newPaLocation, setNewPaLocation] = useState('');
    
    // Item Selection States
    const [selectedPaItem, setSelectedPaItem] = useState('');
    const [selectedVaExcludedItem, setSelectedVaExcludedItem] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        fetchControlData();
    }, [selectedMonth]);

    const fetchControlData = async () => {
        setIsLoading(true);
        
        // Fetch Lock Status and Saved Allocations
        const { data: periodData } = await supabase.from('hsk_inventory_periods').select('is_locked, parsed_allocations').eq('month_year', selectedMonth).single();
        if (periodData) {
            setIsLocked(periodData.is_locked);
            if (periodData.parsed_allocations && Array.isArray(periodData.parsed_allocations)) {
                setParsedAllocations(periodData.parsed_allocations);
            } else {
                setParsedAllocations([]);
            }
        } else {
            setIsLocked(true);
            setParsedAllocations([]);
        }

        const { data: items } = await supabase.from('hsk_master_catalog').select('*').eq('category', 'Linen').order('article_name', { ascending: true });
        if (items) setLinenItems(items);

        const { data: hostData } = await supabase.from('hsk_hosts').select('id, host_id, full_name, role').eq('status', 'Active');
        if (hostData) setHosts(hostData);

        const { data: locData } = await supabase.from('hsk_constants').select('*').eq('type', 'pa_linen_location').order('label', { ascending: true });
        if (locData) setPaLocations(locData);

        setIsLoading(false);
    };

    const toggleLockStatus = async () => {
        const newStatus = !isLocked;
        const { error } = await supabase.from('hsk_inventory_periods').upsert({ 
            month_year: selectedMonth, 
            is_locked: newStatus,
            parsed_allocations: parsedAllocations // Preserve layout
        }, { onConflict: 'month_year' });

        if (error) toast.error("Failed to update lock status.");
        else {
            setIsLocked(newStatus);
            toast.success(newStatus ? "Inventory Locked. Staff cannot see tasks." : "Inventory Unlocked! Tasks are live.");
        }
    };

    // --- SAVE ALLOCATIONS TO DB ---
    const handleSaveLayout = async () => {
        setIsLoading(true);
        const { error } = await supabase.from('hsk_inventory_periods').upsert({
            month_year: selectedMonth,
            is_locked: isLocked,
            parsed_allocations: parsedAllocations
        }, { onConflict: 'month_year' });

        if (error) {
            toast.error("Failed to save layout: " + error.message);
        } else {
            toast.success(`Allocation layout saved for ${selectedMonth}!`);
        }
        setIsLoading(false);
    };

    // --- ALLOCATION PARSER ---
    const handleExtractAllocations = async () => {
        setIsLoading(true);

        const { data: allocData, error } = await supabase.from('hsk_allocations').select('*').eq('report_date', extractDate);
        
        if (error) {
            toast.error("Extraction Error: " + error.message);
        } else if (allocData && allocData.length > 0) {
            const activeAllocations = allocData.filter(a => a.task_details && a.task_details.trim() !== '').map(a => {
                const matchedHost = hosts.find(h => h.id === a.host_id || h.host_id === a.host_id);
                
                const rawVillas = a.task_details.split(',').map((s: string) => s.trim()).filter(Boolean) as string[];
                const assignedVillas: string[] = Array.from(new Set<string>(rawVillas));
                
                const assignedPantries = determinePantries(assignedVillas);

                return {
                    id: a.id,
                    host_id: matchedHost ? matchedHost.host_id : a.host_id, 
                    host_name: matchedHost ? matchedHost.full_name : (a.host_name || 'Unknown'),
                    assigned_villas: assignedVillas,
                    assigned_pantries: assignedPantries
                } as Allocation;
            });

            setParsedAllocations(activeAllocations);
            toast.success(`Parsed ${activeAllocations.length} VAs from ${format(parse(extractDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}. Remember to save!`);
        } else {
            toast.error(`No daily allocations found for ${format(parse(extractDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}.`);
        }
        setIsLoading(false);
    };

    const updateParsedAllocation = (index: number, field: 'assigned_villas' | 'assigned_pantries', value: string[]) => {
        const newAllocations = [...parsedAllocations];
        newAllocations[index] = { ...newAllocations[index], [field]: value };
        
        if (field === 'assigned_villas') {
             newAllocations[index].assigned_pantries = determinePantries(value);
        }

        setParsedAllocations(newAllocations);
    };

    const removeParsedAllocation = (index: number) => {
        const newAllocations = [...parsedAllocations];
        newAllocations.splice(index, 1);
        setParsedAllocations(newAllocations);
    };

    // --- PA LOCATION MANAGER ---
    const handleAddPaLocation = async () => {
        if (!newPaLocation.trim()) return;
        setIsLoading(true);
        const { error } = await supabase.from('hsk_constants').insert({ type: 'pa_linen_location', label: newPaLocation.trim() });
        if (!error) { setNewPaLocation(''); toast.success("Location added!"); await fetchControlData(); } 
        else { toast.error("Failed to add location"); setIsLoading(false); }
    };

    const handleDeletePaLocation = async (id: string) => {
        setIsLoading(true);
        await supabase.from('hsk_constants').delete().eq('id', id);
        toast.success("Location removed");
        await fetchControlData();
    };

    // --- ITEM CONFIGURATION (WHITELIST / BLACKLIST) ---
    const toggleItemFlag = async (articleNo: string, field: 'is_pa_applicable' | 'is_va_excluded', newValue: boolean) => {
        const { error } = await supabase.from('hsk_master_catalog').update({ [field]: newValue }).eq('article_number', articleNo);
        if (!error) {
            setLinenItems(items => items.map(i => i.article_number === articleNo ? { ...i, [field]: newValue } : i));
            toast.success("List updated successfully");
        } else toast.error("Failed to update item list");
        setSelectedPaItem(''); setSelectedVaExcludedItem('');
    };

    // --- SMART DISPATCH ---
    const handleAutoAllocateLinen = async () => {
        if (parsedAllocations.length === 0) return toast.error("Please parse and review allocations before dispatching.");

        setIsLoading(true);
        try {
            if (linenItems.length === 0) {
                toast.error("No items found under 'Linen' category in Master Catalog.");
                setIsLoading(false);
                return;
            }
            
            // Auto-save the layout right before dispatching just to be safe
            await supabase.from('hsk_inventory_periods').upsert({ month_year: selectedMonth, is_locked: isLocked, parsed_allocations: parsedAllocations }, { onConflict: 'month_year' });

            const allLinenArticleNumbers = linenItems.map(i => i.article_number);
            const vaLinenArticleNumbers = linenItems.filter(i => !i.is_va_excluded).map(i => i.article_number);
            const paLinenArticleNumbers = linenItems.filter(i => i.is_pa_applicable).map(i => i.article_number);

            await supabase.from('hsk_linen_assignments').delete().eq('month_year', selectedMonth);

            const inserts: any[] = [];
            
            // 1. Process Pantry Splits based on the custom assigned_pantries array
            PANTRIES.forEach(pantryName => {
                const assignedVAs = parsedAllocations.filter(a => a.assigned_pantries && a.assigned_pantries.includes(pantryName));
                
                if (assignedVAs.length > 0) {
                    const shuffledLinen = [...allLinenArticleNumbers].sort(() => 0.5 - Math.random());
                    const chunkSize = Math.ceil(shuffledLinen.length / assignedVAs.length);
                    const chunks = Array.from({ length: assignedVAs.length }, (v, i) =>
                        shuffledLinen.slice(i * chunkSize, i * chunkSize + chunkSize)
                    );

                    assignedVAs.forEach((va, index) => {
                        if (chunks[index] && chunks[index].length > 0) {
                            inserts.push({
                                month_year: selectedMonth,
                                host_id: va.host_id,
                                location_type: 'Pantry',
                                location_name: pantryName,
                                assigned_items: chunks[index],
                                assigned_at: new Date().toISOString()
                            });
                        }
                    });
                }
            });

            // 2. Assign standard Villa counts (Filtered by VA exclusion list)
            parsedAllocations.forEach(alloc => {
                 if (alloc.assigned_villas) {
                     alloc.assigned_villas.forEach(v => {
                         inserts.push({
                             month_year: selectedMonth,
                             host_id: alloc.host_id,
                             location_type: 'Villa',
                             location_name: v,
                             assigned_items: vaLinenArticleNumbers,
                             assigned_at: new Date().toISOString()
                         });
                     });
                 }
            });

            // 3. Assign Laundry counts (Full linen list)
            const laundryHosts = hosts.filter(h => h.role.toLowerCase().includes('laundry'));
            laundryHosts.forEach(host => {
                inserts.push({
                    month_year: selectedMonth,
                    host_id: host.host_id,
                    location_type: 'Laundry',
                    location_name: 'Laundry & Store',
                    assigned_items: allLinenArticleNumbers,
                    assigned_at: new Date().toISOString()
                });
            });

            // 4. Assign Public Area counts (Filtered by PA whitelist)
            const paHosts = hosts.filter(h => h.role.toLowerCase().includes('public area') || h.role.toLowerCase() === 'pa');
            paHosts.forEach(host => {
                inserts.push({
                    month_year: selectedMonth,
                    host_id: host.host_id,
                    location_type: 'PA',
                    location_name: 'Public Area',
                    assigned_items: paLinenArticleNumbers,
                    assigned_at: new Date().toISOString()
                });
            });

            const { error } = await supabase.from('hsk_linen_assignments').insert(inserts);

            if (error) throw error;
            toast.success(`Successfully dispatched ${inserts.length} assignments across all teams!`);

        } catch (error: any) {
            toast.error("Error generating allocations: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const paItemsList = linenItems.filter(i => i.is_pa_applicable);
    const vaExcludedItemsList = linenItems.filter(i => i.is_va_excluded);

    const parsedHostIds = parsedAllocations.map(a => a.host_id);
    const availableHostsToAdd = hosts.filter(h => !parsedHostIds.includes(h.host_id));

    return (
        <div className="flex flex-col min-h-full bg-[#FDFBFD] pb-36 font-sans">
            <PageHeader title="Linen Setup & Dispatch" date={new Date()} onDateChange={() => {}} />

            <div className="px-4 md:px-8 max-w-[1400px] mx-auto w-full mt-6 space-y-6">
                
                {/* TOP BAR: Month & Lock Status */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="w-full md:w-auto">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 ml-1">Ledger Month</label>
                        <input type="month" className="w-full md:w-64 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-[#6D2158]" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                    </div>

                    <div className="w-full md:w-auto flex flex-col items-center md:items-end">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 mr-1">System Status</label>
                        <button 
                            onClick={toggleLockStatus}
                            className={`flex items-center gap-3 px-6 py-3 rounded-xl font-black text-sm transition-all shadow-sm w-full md:w-auto justify-center ${
                                isLocked 
                                ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100' 
                                : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                            }`}
                        >
                            {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
                            {isLocked ? 'LOCKED (HIDDEN FROM STAFF)' : 'UNLOCKED (LIVE FOR STAFF)'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    
                    {/* LEFT COLUMN: Allocation Parser & Dispatch */}
                    <div className="xl:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[85vh]">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col justify-between gap-4 sticky top-0 z-20">
                            <div>
                                <h3 className="font-black text-lg text-slate-800 flex items-center gap-2"><Users size={20} className="text-[#6D2158]"/> Villa Attendant Allocations</h3>
                                <p className="text-xs font-bold text-slate-500 mt-1">Review and modify assigned villas and pantries before dispatching.</p>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mt-2">
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm flex-1">
                                        <Calendar size={16} className="text-slate-400 ml-2 shrink-0"/>
                                        <input 
                                            type="date" 
                                            className="bg-transparent text-sm font-bold text-[#6D2158] outline-none cursor-pointer flex-1 px-2"
                                            value={extractDate}
                                            onChange={(e) => setExtractDate(e.target.value)}
                                        />
                                        <button 
                                            onClick={handleExtractAllocations} 
                                            disabled={isLoading}
                                            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1 whitespace-nowrap shrink-0"
                                        >
                                            {isLoading ? <Loader2 size={14} className="animate-spin"/> : <DownloadCloud size={14}/>}
                                            Extract Board
                                        </button>
                                    </div>
                                    <button 
                                        onClick={handleSaveLayout}
                                        disabled={isLoading}
                                        className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm transition-colors flex items-center justify-center gap-1 shrink-0"
                                    >
                                        <Save size={14}/> Save Layout
                                    </button>
                                </div>

                                {/* ADD HOST SEARCH DROPDOWN */}
                                <div className="relative w-full sm:w-72">
                                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                                    <input 
                                        type="text" 
                                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] transition-all shadow-sm"
                                        placeholder="Search & Add Attendant..."
                                        value={hostSearch}
                                        onChange={(e) => {
                                            setHostSearch(e.target.value);
                                            setShowHostDropdown(true);
                                        }}
                                        onFocus={() => setShowHostDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowHostDropdown(false), 200)}
                                    />
                                    {showHostDropdown && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto z-[100]">
                                            {availableHostsToAdd.filter(h => h.full_name.toLowerCase().includes(hostSearch.toLowerCase()) || (h.host_id || '').includes(hostSearch)).map(h => (
                                                <button 
                                                    key={h.id}
                                                    onClick={() => {
                                                        setParsedAllocations(prev => [...prev, { host_id: h.host_id, host_name: h.full_name, area: '', assigned_villas: [], assigned_pantries: [] }]);
                                                        setHostSearch('');
                                                        setShowHostDropdown(false);
                                                    }}
                                                    className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-50 flex flex-col transition-colors"
                                                >
                                                    <span className="font-bold text-slate-700 text-sm">{h.full_name}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">SSL {h.host_id}</span>
                                                </button>
                                            ))}
                                            {availableHostsToAdd.length === 0 && <div className="p-3 text-xs text-slate-400 italic">No more staff to add.</div>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-x-auto p-6 bg-slate-50/20 custom-scrollbar">
                            {parsedAllocations.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-16 h-16 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4"><Users size={32}/></div>
                                    <h4 className="font-black text-slate-600 mb-1">No Allocations Loaded</h4>
                                    <p className="text-xs font-bold text-slate-400">Click "Extract Board" to pull today's active roster, or search to add manually.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left border-separate border-spacing-y-2">
                                    <thead className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
                                        <tr>
                                            <th className="px-4 py-2 w-48 shrink-0">Attendant</th>
                                            <th className="px-4 py-2 w-1/3">Assigned Villas</th>
                                            <th className="px-4 py-2 w-1/3">Assigned Pantries</th>
                                            <th className="px-4 py-2 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedAllocations.map((alloc, idx) => (
                                            <tr key={idx} className="bg-white shadow-sm border border-slate-100 rounded-xl">
                                                <td className="p-3 rounded-l-xl border-t border-b border-l border-slate-100 align-top">
                                                    <div className="font-bold text-sm text-slate-800 truncate" title={alloc.host_name}>{alloc.host_name}</div>
                                                    <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mt-0.5">SSL {alloc.host_id}</div>
                                                </td>
                                                <td className="p-2 border-t border-b border-slate-100 align-top">
                                                    <TagInput 
                                                        values={alloc.assigned_villas || []} 
                                                        onChange={(newVillas) => updateParsedAllocation(idx, 'assigned_villas', newVillas)} 
                                                        placeholder="Type #" 
                                                    />
                                                </td>
                                                <td className="p-2 border-t border-b border-slate-100 align-top">
                                                    <TagInput 
                                                        values={alloc.assigned_pantries || []} 
                                                        onChange={(newPantries) => updateParsedAllocation(idx, 'assigned_pantries', newPantries)} 
                                                        placeholder="Select Pantry..."
                                                        options={PANTRIES}
                                                    />
                                                </td>
                                                <td className="p-3 rounded-r-xl border-t border-b border-r border-slate-100 text-right align-top">
                                                    <button onClick={() => removeParsedAllocation(idx)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-white shrink-0">
                            {isLocked && parsedAllocations.length > 0 && (
                                <div className="mb-4 inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200">
                                    <AlertTriangle size={14} /> Unlock system first to dispatch tasks
                                </div>
                            )}
                            <button onClick={handleAutoAllocateLinen} disabled={isLoading || isLocked || parsedAllocations.length === 0} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-sm shadow-md hover:bg-[#5a1b49] active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                {isLoading ? <span className="animate-pulse">Dispatching...</span> : <Sparkles size={18} />} 
                                {isLoading ? '' : 'Dispatch Active Allocations to Staff App'}
                            </button>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Settings Lists */}
                    <div className="xl:col-span-1 space-y-6">
                        
                        {/* PA Location Manager */}
                        <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50 shadow-sm">
                            <h3 className="font-black text-lg mb-2 flex items-center gap-2 text-indigo-900"><MapPin size={18} className="text-indigo-600"/> PA Locations</h3>
                            <p className="text-[10px] font-bold text-indigo-500/80 uppercase tracking-widest mb-4">Locations staff will select</p>
                            
                            <div className="flex gap-2 mb-4">
                                <input 
                                    type="text" 
                                    placeholder="e.g. Public Restaurant" 
                                    className="flex-1 p-2.5 border border-white rounded-lg font-bold text-xs bg-white shadow-sm outline-none focus:border-indigo-400" 
                                    value={newPaLocation} 
                                    onChange={(e) => setNewPaLocation(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddPaLocation()}
                                />
                                <button onClick={handleAddPaLocation} className="px-3 py-2 bg-indigo-600 text-white rounded-lg font-bold uppercase text-xs shadow-sm hover:bg-indigo-700 transition-colors"><Plus size={16}/></button>
                            </div>

                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                {paLocations.map((loc) => (
                                    <div key={loc.id} className="flex justify-between items-center p-2.5 bg-white rounded-lg shadow-sm border border-transparent hover:border-indigo-100 transition-all group">
                                        <span className="font-bold text-slate-700 text-xs pl-1">{loc.label}</span>
                                        <button onClick={() => handleDeletePaLocation(loc.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* PA Whitelist Config */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                            <h3 className="font-black text-lg mb-2 flex items-center gap-2 text-slate-800"><ShieldCheck size={18} className="text-emerald-500"/> PA Item List</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Items visible to Public Area</p>
                            
                            <div className="flex gap-2 mb-4">
                                <select 
                                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs outline-none focus:border-emerald-500 text-slate-700"
                                    value={selectedPaItem}
                                    onChange={e => setSelectedPaItem(e.target.value)}
                                >
                                    <option value="">Select Item to Add...</option>
                                    {linenItems.filter(i => !i.is_pa_applicable).map(i => (
                                        <option key={i.article_number} value={i.article_number}>{i.generic_name || i.article_name}</option>
                                    ))}
                                </select>
                                <button onClick={() => selectedPaItem && toggleItemFlag(selectedPaItem, 'is_pa_applicable', true)} className="px-3 py-2 bg-emerald-500 text-white rounded-lg font-bold uppercase text-xs shadow-sm hover:bg-emerald-600 transition-colors"><Plus size={16}/></button>
                            </div>

                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                {paItemsList.map((item) => (
                                    <div key={item.article_number} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-800 text-[10px] font-black tracking-widest uppercase">
                                        {item.generic_name || item.article_name}
                                        <button onClick={() => toggleItemFlag(item.article_number, 'is_pa_applicable', false)} className="text-emerald-400 hover:text-rose-500 ml-1"><X size={12}/></button>
                                    </div>
                                ))}
                                {paItemsList.length === 0 && <p className="text-xs font-bold text-slate-400 w-full text-center py-2">No items added.</p>}
                            </div>
                        </div>

                        {/* VA Blacklist Config */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                            <h3 className="font-black text-lg mb-2 flex items-center gap-2 text-slate-800"><EyeOff size={18} className="text-rose-500"/> VA Exclude List</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Hide these items from Villa Attendants</p>
                            
                            <div className="flex gap-2 mb-4">
                                <select 
                                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs outline-none focus:border-rose-500 text-slate-700"
                                    value={selectedVaExcludedItem}
                                    onChange={e => setSelectedVaExcludedItem(e.target.value)}
                                >
                                    <option value="">Select Item to Hide...</option>
                                    {linenItems.filter(i => !i.is_va_excluded).map(i => (
                                        <option key={i.article_number} value={i.article_number}>{i.generic_name || i.article_name}</option>
                                    ))}
                                </select>
                                <button onClick={() => selectedVaExcludedItem && toggleItemFlag(selectedVaExcludedItem, 'is_va_excluded', true)} className="px-3 py-2 bg-rose-500 text-white rounded-lg font-bold uppercase text-xs shadow-sm hover:bg-rose-600 transition-colors"><Plus size={16}/></button>
                            </div>

                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                {vaExcludedItemsList.map((item) => (
                                    <div key={item.article_number} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-800 text-[10px] font-black tracking-widest uppercase">
                                        {item.generic_name || item.article_name}
                                        <button onClick={() => toggleItemFlag(item.article_number, 'is_va_excluded', false)} className="text-rose-400 hover:text-rose-600 ml-1"><X size={12}/></button>
                                    </div>
                                ))}
                                {vaExcludedItemsList.length === 0 && <p className="text-xs font-bold text-slate-400 w-full text-center py-2">No items excluded.</p>}
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
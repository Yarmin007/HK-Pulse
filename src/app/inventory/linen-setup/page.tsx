"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Sparkles, Layers, Lock, Unlock, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';
import { format, startOfMonth } from 'date-fns';

type Host = { id: string; host_id: string; full_name: string; role: string; };

const PANTRIES = [
    { name: 'Jetty A Pantry', keyword: 'Jetty A' },
    { name: 'JB Pantry', keyword: 'Jetty B' },
    { name: 'JC Pantry', keyword: 'Jetty C' },
    { name: 'Beach Pantry', keyword: 'Beach' }
];

export default function LinenControlPanel() {
    const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
    const [isLocked, setIsLocked] = useState(true);
    const [linenItems, setLinenItems] = useState<any[]>([]);
    const [hosts, setHosts] = useState<Host[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        fetchControlData();
    }, [selectedMonth]);

    const fetchControlData = async () => {
        setIsLoading(true);
        
        // 1. Fetch Lock Status
        const { data: periodData } = await supabase.from('hsk_inventory_periods').select('is_locked').eq('month_year', selectedMonth).single();
        setIsLocked(periodData ? periodData.is_locked : true); // Default to locked if no record

        // 2. Fetch Linen Items for PA Toggling
        const { data: items } = await supabase.from('hsk_master_catalog').select('*').eq('category', 'Linen').order('hk_no', { ascending: true });
        if (items) setLinenItems(items);

        // 3. Fetch Active Hosts
        const { data: hostData } = await supabase.from('hsk_hosts').select('id, host_id, full_name, role').eq('status', 'Active');
        if (hostData) setHosts(hostData);
        
        setIsLoading(false);
    };

    const toggleLockStatus = async () => {
        const newStatus = !isLocked;
        const { error } = await supabase.from('hsk_inventory_periods').upsert({ 
            month_year: selectedMonth, 
            is_locked: newStatus 
        });

        if (error) {
            toast.error("Failed to update lock status.");
        } else {
            setIsLocked(newStatus);
            toast.success(newStatus ? "Inventory Locked. Staff cannot see tasks." : "Inventory Unlocked! Tasks are live.");
        }
    };

    const togglePAApplicable = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase.from('hsk_master_catalog').update({ is_pa_applicable: !currentStatus }).eq('id', id);
        if (!error) {
            setLinenItems(items => items.map(i => i.id === id ? { ...i, is_pa_applicable: !currentStatus } : i));
            toast.success("PA Status updated");
        } else {
            toast.error("Failed to update PA Status");
        }
    };

    const handleAutoAllocateLinen = async () => {
        setIsLoading(true);
        try {
            if (linenItems.length === 0) {
                toast.error("No items found under 'Linen' category in Master Catalog.");
                setIsLoading(false);
                return;
            }
            
            const linenArticleNumbers = linenItems.map(i => i.article_number);
            const paLinenArticleNumbers = linenItems.filter(i => i.is_pa_applicable).map(i => i.article_number);

            const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
            const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

            const { data: allocData } = await supabase.from('hsk_allocations').select('host_id, task_details, area').eq('report_date', todayStr);
            if (!allocData || allocData.length === 0) {
                toast.error("No daily allocations found for today. Cannot map VAs.");
                setIsLoading(false);
                return;
            }

            // Optional: Wipe existing assignments for this month so we don't duplicate on re-run
            await supabase.from('hsk_linen_assignments').delete().eq('month_year', selectedMonth);

            const inserts: any[] = [];
            
            // 1. Process Pantry Splits per Jetty
            PANTRIES.forEach(pantry => {
                const areaVAs = allocData.filter(a => a.area?.includes(pantry.keyword));
                
                if (areaVAs.length > 0) {
                    const shuffledLinen = [...linenArticleNumbers].sort(() => 0.5 - Math.random());
                    const chunkSize = Math.ceil(shuffledLinen.length / areaVAs.length);
                    const chunks = Array.from({ length: areaVAs.length }, (v, i) =>
                        shuffledLinen.slice(i * chunkSize, i * chunkSize + chunkSize)
                    );

                    areaVAs.forEach((va, index) => {
                        if (chunks[index] && chunks[index].length > 0) {
                            inserts.push({
                                month_year: selectedMonth,
                                host_id: va.host_id,
                                location_type: 'Pantry',
                                location_name: pantry.name,
                                assigned_items: chunks[index],
                                assigned_at: new Date().toISOString()
                            });
                        }
                    });
                }
            });

            // 2. Assign standard Villa counts (Full linen list)
            allocData.forEach(alloc => {
                 if (alloc.task_details) {
                     const villas = alloc.task_details.split(',').map((s: string) => s.trim()).filter(Boolean);
                     villas.forEach((v: string) => {
                         inserts.push({
                             month_year: selectedMonth,
                             host_id: alloc.host_id,
                             location_type: 'Villa',
                             location_name: v,
                             assigned_items: linenArticleNumbers,
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
                    assigned_items: linenArticleNumbers,
                    assigned_at: new Date().toISOString()
                });
            });

            // 4. Assign Public Area counts (Filtered by is_pa_applicable)
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
            toast.success(`Successfully dispatched allocations for Villas, Pantries, Laundry, and PA!`);

        } catch (error: any) {
            toast.error("Error generating allocations: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col min-h-full bg-[#FDFBFD] pb-36 font-sans">
            <PageHeader title="Linen Setup & Dispatch" date={new Date()} onDateChange={() => {}} />

            <div className="px-4 md:px-8 max-w-5xl mx-auto w-full mt-6 space-y-6">
                
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

                {/* MIDDLE: Smart Dispatch */}
                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6 items-center">
                    <div className="flex-1">
                        <h3 className="font-black text-xl mb-3 flex items-center gap-2 text-slate-800"><Layers size={22} className="text-[#6D2158]"/> Auto-Allocation Dispatch</h3>
                        <p className="text-xs font-bold text-slate-500 leading-relaxed max-w-xl">
                            Pulls today's Roster. Maps specific Villas to assigned VAs, randomly distributes Pantry items among Jetty teams, deploys PA sheets (filtered by your configuration below), and sends dual-input sheets to Laundry.
                        </p>
                        {isLocked && (
                            <div className="mt-4 inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200">
                                <AlertTriangle size={14} /> Unlock system first to dispatch
                            </div>
                        )}
                    </div>
                    <button onClick={handleAutoAllocateLinen} disabled={isLoading || isLocked} className="w-full md:w-auto px-8 py-5 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-sm shadow-md hover:bg-[#5a1b49] active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isLoading ? <span className="animate-pulse">Dispatching...</span> : <Sparkles size={18} />} 
                        {isLoading ? '' : 'Dispatch Tasks'}
                    </button>
                </div>

                {/* BOTTOM: Linen Item PA Configuration */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-black text-lg text-slate-800 flex items-center gap-2"><ShieldCheck size={20} className="text-indigo-600"/> Public Area Configuration</h3>
                        <p className="text-xs font-bold text-slate-500 mt-1">Select which linen items should appear on the Public Area checklist.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-white text-[10px] uppercase tracking-widest text-slate-400 font-black border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4">HK No.</th>
                                    <th className="px-6 py-4">Item Name</th>
                                    <th className="px-6 py-4 text-center">Appears in PA Sheet?</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {isLoading && linenItems.length === 0 ? (
                                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 font-bold text-sm">Loading catalog...</td></tr>
                                ) : linenItems.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-[#6D2158]">{item.hk_no}</td>
                                        <td className="px-6 py-4 font-bold text-sm text-slate-700">{item.generic_name || item.article_name}</td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => togglePAApplicable(item.id, item.is_pa_applicable)}
                                                className={`inline-flex items-center justify-center w-12 h-6 rounded-full transition-colors ${
                                                    item.is_pa_applicable ? 'bg-indigo-500' : 'bg-slate-200'
                                                }`}
                                            >
                                                <span className={`transform transition-transform bg-white w-4 h-4 rounded-full shadow-sm ${
                                                    item.is_pa_applicable ? 'translate-x-3' : '-translate-x-3'
                                                }`} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {linenItems.length === 0 && !isLoading && (
                                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 font-bold text-sm">No Linen items found. Add them in Settings.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
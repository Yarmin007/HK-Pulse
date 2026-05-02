"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, Loader2, Layers, MapPin, Users, LayoutGrid, ListTree, CheckCircle2, Clock } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';
import { format, startOfMonth } from 'date-fns';

type LinenRecord = {
    article_number: string;
    location_type: 'Villa' | 'Pantry' | 'Laundry' | 'PA';
    location_name: string;
    host_id: string;
    counted_qty_used: number;
    counted_qty_new?: number; // Only for laundry
};

type LinenAssignment = {
    id: string;
    host_id: string;
    location_type: string;
    location_name: string;
    assigned_items: string[];
};

type Host = {
    host_id: string;
    full_name: string;
    role: string;
};

export default function LinenMasterInventory() {
    const [isLoading, setIsLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
    const [activeTab, setActiveTab] = useState<'SUMMARY' | 'DETAILS' | 'ATTENDANTS'>('SUMMARY');
    
    const [masterList, setMasterList] = useState<any[]>([]);
    const [records, setRecords] = useState<LinenRecord[]>([]);
    const [assignments, setAssignments] = useState<LinenAssignment[]>([]);
    const [hosts, setHosts] = useState<Host[]>([]);

    useEffect(() => {
        const loadLinenData = async () => {
            setIsLoading(true);
            
            // Fetch Linen Master Catalog
            const { data: masters } = await supabase.from('hsk_master_catalog').select('*').eq('category', 'Linen').order('article_name');
            if (masters) setMasterList(masters);

            // Fetch this month's submitted linen records
            const { data: counts } = await supabase.from('hsk_linen_records').select('*').eq('month_year', selectedMonth);
            if (counts) setRecords(counts);

            // Fetch Assignments to track progress and locations
            const { data: allocs } = await supabase.from('hsk_linen_assignments').select('*').eq('month_year', selectedMonth);
            if (allocs) setAssignments(allocs);

            // Fetch Hosts
            const { data: hData } = await supabase.from('hsk_hosts').select('host_id, full_name, role').eq('status', 'Active');
            if (hData) setHosts(hData);

            setIsLoading(false);
        };
        loadLinenData();
    }, [selectedMonth]);

    // --- 1. SUMMARY DATA (Original Logic) ---
    const aggregatedLinen = useMemo(() => {
        return masterList.map(item => {
            const itemRecords = records.filter(r => r.article_number === item.article_number);
            
            const villaCount = itemRecords.filter(r => r.location_type === 'Villa').reduce((sum, r) => sum + (r.counted_qty_used || 0), 0);
            const pantryCount = itemRecords.filter(r => r.location_type === 'Pantry').reduce((sum, r) => sum + (r.counted_qty_used || 0), 0);
            const paCount = itemRecords.filter(r => r.location_type === 'PA').reduce((sum, r) => sum + (r.counted_qty_used || 0), 0);
            
            const laundryRecords = itemRecords.filter(r => r.location_type === 'Laundry');
            const laundryUsed = laundryRecords.reduce((sum, r) => sum + (r.counted_qty_used || 0), 0);
            const laundryNew = laundryRecords.reduce((sum, r) => sum + (r.counted_qty_new || 0), 0);

            const grandTotal = villaCount + pantryCount + paCount + laundryUsed + laundryNew;

            return { ...item, villaCount, pantryCount, paCount, laundryUsed, laundryNew, grandTotal };
        });
    }, [masterList, records]);

    // --- 2. LOCATION BREAKDOWN DATA ---
    const locationColumns = useMemo(() => {
        const locs = Array.from(new Set([
            ...records.map(r => r.location_name),
            ...assignments.map(a => a.location_name)
        ]));
        
        // Sort numerically for villas, alphabetically for others
        return locs.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, ''), 10);
            const numB = parseInt(b.replace(/\D/g, ''), 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
    }, [records, assignments]);

    // --- 3. ATTENDANT PROGRESS DATA ---
    const attendantProgress = useMemo(() => {
        const grouped: Record<string, { host: Host | undefined, tasks: { location: string, type: string, isDone: boolean }[] }> = {};
        
        assignments.forEach(a => {
            if (!grouped[a.host_id]) {
                grouped[a.host_id] = { host: hosts.find(h => h.host_id === a.host_id), tasks: [] };
            }
            // A task is done if there is at least one record submitted for this location
            const isDone = records.some(r => r.location_name === a.location_name && r.location_type === a.location_type);
            grouped[a.host_id].tasks.push({ location: a.location_name, type: a.location_type, isDone });
        });

        // Sort by host name
        return Object.values(grouped).sort((a,b) => (a.host?.full_name || '').localeCompare(b.host?.full_name || ''));
    }, [assignments, records, hosts]);

    return (
        <div className="flex flex-col min-h-full bg-[#FDFBFD] pb-36 font-sans">
            <PageHeader title="Linen Master Inventory" date={new Date()} onDateChange={() => {}} />

            <div className="px-4 md:px-8 max-w-[1600px] mx-auto w-full mt-6">
                
                {/* CONTROLS HEADER */}
                <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex-wrap gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Ledger Month</label>
                        <input type="month" className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm outline-none focus:border-[#6D2158] text-slate-700" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                    </div>

                    {/* TABS */}
                    <div className="flex gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 overflow-x-auto">
                        <button onClick={() => setActiveTab('SUMMARY')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'SUMMARY' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <LayoutGrid size={16}/> Summary Matrix
                        </button>
                        <button onClick={() => setActiveTab('DETAILS')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'DETAILS' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <MapPin size={16}/> Location Details
                        </button>
                        <button onClick={() => setActiveTab('ATTENDANTS')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'ATTENDANTS' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Users size={16}/> Attendant Progress
                        </button>
                    </div>

                    <button className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-emerald-100 transition-colors shrink-0">
                        <Download size={16}/> Export Excel
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
                ) : (
                    <>
                        {/* TAB 1: SUMMARY (ORIGINAL VIEW) */}
                        {activeTab === 'SUMMARY' && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in">
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left table-auto">
                                        <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400 font-black">
                                            <tr>
                                                <th className="px-6 py-4 border-b border-slate-200">Item</th>
                                                <th className="px-4 py-4 border-b border-slate-200 text-center bg-blue-50/50 text-blue-600">Villas</th>
                                                <th className="px-4 py-4 border-b border-slate-200 text-center bg-indigo-50/50 text-indigo-600">Pantries</th>
                                                <th className="px-4 py-4 border-b border-slate-200 text-center bg-amber-50/50 text-amber-600">Public Area</th>
                                                <th className="px-4 py-4 border-b border-slate-200 text-center bg-rose-50/50 text-rose-600">Laundry (Used)</th>
                                                <th className="px-4 py-4 border-b border-slate-200 text-center bg-emerald-50/50 text-emerald-600">Laundry (New)</th>
                                                <th className="px-6 py-4 border-b border-slate-200 text-center text-[#6D2158] bg-[#6D2158]/5">Grand Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {aggregatedLinen.map(row => (
                                                <tr key={row.article_number} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="font-black text-sm text-slate-800">{row.generic_name || row.article_name}</div>
                                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{row.hk_no || 'NO-HK'}</div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center font-black text-blue-700 bg-blue-50/20">{row.villaCount || '-'}</td>
                                                    <td className="px-4 py-4 text-center font-black text-indigo-700 bg-indigo-50/20">{row.pantryCount || '-'}</td>
                                                    <td className="px-4 py-4 text-center font-black text-amber-700 bg-amber-50/20">{row.paCount || '-'}</td>
                                                    <td className="px-4 py-4 text-center font-black text-rose-700 bg-rose-50/20">{row.laundryUsed || '-'}</td>
                                                    <td className="px-4 py-4 text-center font-black text-emerald-700 bg-emerald-50/20">{row.laundryNew || '-'}</td>
                                                    <td className="px-6 py-4 text-center bg-[#6D2158]/5">
                                                        <span className="inline-block px-3 py-1 bg-[#6D2158] text-white rounded-lg font-black text-sm shadow-sm">{row.grandTotal}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: DETAILED LOCATION BREAKDOWN */}
                        {activeTab === 'DETAILS' && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in flex flex-col h-[70vh]">
                                <div className="p-4 bg-slate-50 border-b border-slate-100 shrink-0">
                                    <h3 className="font-black text-[#6D2158] text-sm uppercase tracking-widest">Master Location Matrix</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scroll right to view all Villas, Pantries, and Areas</p>
                                </div>
                                <div className="overflow-auto custom-scrollbar flex-1 relative">
                                    <table className="w-max min-w-full text-left table-fixed border-collapse">
                                        <thead className="bg-white text-[10px] uppercase tracking-widest text-slate-500 font-black sticky top-0 z-20 shadow-sm">
                                            <tr>
                                                <th className="px-4 py-3 border-b border-r border-slate-200 sticky left-0 bg-slate-100 z-30 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Linen Item</th>
                                                {locationColumns.map(col => (
                                                    <th key={col} className="px-3 py-3 border-b border-slate-200 text-center bg-slate-50 min-w-[80px] truncate max-w-[120px]" title={col}>
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {masterList.map(item => (
                                                <tr key={item.article_number} className="hover:bg-purple-50/30 transition-colors">
                                                    <td className="px-4 py-2 border-r border-slate-200 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                        <div className="font-bold text-xs text-slate-800 truncate w-56" title={item.generic_name || item.article_name}>{item.generic_name || item.article_name}</div>
                                                    </td>
                                                    {locationColumns.map(col => {
                                                        const cellRecord = records.find(r => r.article_number === item.article_number && r.location_name === col);
                                                        
                                                        let displayVal: React.ReactNode = '-';
                                                        if (cellRecord) {
                                                            if (cellRecord.location_type === 'Laundry') {
                                                                displayVal = (
                                                                    <div className="flex flex-col gap-0.5 text-[9px] leading-tight">
                                                                        <span className="text-amber-700 bg-amber-50 px-1 rounded">U: {cellRecord.counted_qty_used}</span>
                                                                        <span className="text-emerald-700 bg-emerald-50 px-1 rounded">N: {cellRecord.counted_qty_new}</span>
                                                                    </div>
                                                                );
                                                            } else {
                                                                displayVal = <span className="font-black text-slate-700">{cellRecord.counted_qty_used}</span>;
                                                            }
                                                        }

                                                        return (
                                                            <td key={`${item.article_number}-${col}`} className="px-3 py-2 text-center text-xs border-r border-slate-50">
                                                                {displayVal}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* TAB 3: ATTENDANT PROGRESS */}
                        {activeTab === 'ATTENDANTS' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 animate-in fade-in">
                                {attendantProgress.length === 0 ? (
                                    <div className="col-span-full py-20 text-center text-slate-400 font-bold">No assignments found for this month.</div>
                                ) : attendantProgress.map(data => {
                                    const totalTasks = data.tasks.length;
                                    const completedTasks = data.tasks.filter(t => t.isDone).length;
                                    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                                    const isAllDone = totalTasks > 0 && completedTasks === totalTasks;

                                    return (
                                        <div key={data.host?.host_id || 'unknown'} className={`bg-white rounded-3xl p-5 shadow-sm border transition-all ${isAllDone ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100'}`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="font-black text-slate-800 text-base">{data.host?.full_name || 'Unknown Staff'}</h3>
                                                    <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">SSL {data.host?.host_id || '---'}</p>
                                                </div>
                                                <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm ${isAllDone ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                                                    {progress}% Done
                                                </div>
                                            </div>

                                            {/* Custom Progress Bar */}
                                            <div className="w-full h-1.5 bg-slate-100 rounded-full mb-5 overflow-hidden">
                                                <div className={`h-full rounded-full transition-all duration-500 ${isAllDone ? 'bg-emerald-500' : 'bg-[#6D2158]'}`} style={{ width: `${progress}%` }}></div>
                                            </div>

                                            <div className="space-y-2">
                                                {data.tasks.map((task, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/50">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded bg-white shadow-sm flex items-center justify-center shrink-0 text-slate-400">
                                                                {task.type === 'Villa' ? <Layers size={12}/> : <ListTree size={12}/>}
                                                            </div>
                                                            <span className="font-bold text-xs text-slate-700 truncate">{task.location}</span>
                                                        </div>
                                                        {task.isDone ? (
                                                            <CheckCircle2 size={16} className="text-emerald-500 shrink-0"/>
                                                        ) : (
                                                            <Clock size={16} className="text-amber-400 shrink-0"/>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
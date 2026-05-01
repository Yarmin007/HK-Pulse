"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, Loader2, Layers, MapPin, Users } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';
import { format, startOfMonth } from 'date-fns';

type LinenRecord = {
    article_number: string;
    location_type: 'Villa' | 'Pantry' | 'Laundry' | 'PA';
    counted_qty_used: number;
    counted_qty_new?: number; // Only for laundry
};

export default function LinenMasterInventory() {
    const [isLoading, setIsLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
    const [masterList, setMasterList] = useState<any[]>([]);
    const [records, setRecords] = useState<LinenRecord[]>([]);

    useEffect(() => {
        const loadLinenData = async () => {
            setIsLoading(true);
            
            // Fetch Linen Master Catalog
            const { data: masters } = await supabase.from('hsk_master_catalog').select('*').eq('category', 'Linen').order('article_name');
            if (masters) setMasterList(masters);

            // Fetch this month's submitted linen records
            // Note: Requires a dedicated table for submitted linen counts (e.g. `hsk_linen_records`)
            const { data: counts } = await supabase.from('hsk_linen_records').select('*').eq('month_year', selectedMonth);
            if (counts) setRecords(counts);

            setIsLoading(false);
        };
        loadLinenData();
    }, [selectedMonth]);

    const aggregateData = () => {
        return masterList.map(item => {
            const itemRecords = records.filter(r => r.article_number === item.article_number);
            
            const villaCount = itemRecords.filter(r => r.location_type === 'Villa').reduce((sum, r) => sum + (r.counted_qty_used || 0), 0);
            const pantryCount = itemRecords.filter(r => r.location_type === 'Pantry').reduce((sum, r) => sum + (r.counted_qty_used || 0), 0);
            const paCount = itemRecords.filter(r => r.location_type === 'PA').reduce((sum, r) => sum + (r.counted_qty_used || 0), 0);
            
            const laundryRecords = itemRecords.filter(r => r.location_type === 'Laundry');
            const laundryUsed = laundryRecords.reduce((sum, r) => sum + (r.counted_qty_used || 0), 0);
            const laundryNew = laundryRecords.reduce((sum, r) => sum + (r.counted_qty_new || 0), 0);

            const grandTotal = villaCount + pantryCount + paCount + laundryUsed + laundryNew;

            return {
                ...item,
                villaCount,
                pantryCount,
                paCount,
                laundryUsed,
                laundryNew,
                grandTotal
            };
        });
    };

    const aggregatedLinen = aggregateData();

    return (
        <div className="flex flex-col min-h-full bg-[#FDFBFD] pb-36 font-sans">
            <PageHeader title="Linen Master Inventory" date={new Date()} onDateChange={() => {}} />

            <div className="px-4 md:px-8 max-w-7xl mx-auto w-full mt-6">
                
                <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Ledger Month</label>
                        <input type="month" className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-sm outline-none focus:border-[#6D2158]" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                    </div>
                    <button className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-emerald-100 transition-colors">
                        <Download size={16}/> Export Excel
                    </button>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
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
                                {isLoading ? (
                                    <tr><td colSpan={7} className="p-10 text-center"><Loader2 className="animate-spin text-[#6D2158] mx-auto" size={28}/></td></tr>
                                ) : aggregatedLinen.map(row => (
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

            </div>
        </div>
    );
}
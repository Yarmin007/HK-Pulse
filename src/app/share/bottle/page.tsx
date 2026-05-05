"use client";
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Droplet, Save, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

function BottleCountForm() {
    const searchParams = useSearchParams();
    const outletName = searchParams.get('outlet');
    const monthYear = searchParams.get('month');

    const [masterItems, setMasterItems] = useState<any[]>([]);
    const [inventoryData, setInventoryData] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLocked, setIsLocked] = useState(false);

    useEffect(() => {
        if (!outletName || !monthYear) {
            setIsLoading(false);
            return;
        }

        const loadData = async () => {
            // 1. Check if the month is locked
            const { data: period } = await supabase.from('hsk_inventory_periods')
                .select('bottle_is_locked')
                .eq('month_year', monthYear)
                .single();
            
            if (period?.bottle_is_locked) {
                setIsLocked(true);
                setIsLoading(false);
                return;
            }

            // 2. Fetch all Bottle Items
            const { data: items } = await supabase.from('hsk_master_catalog')
                .select('*')
                .eq('category', 'Bottle')
                .order('article_name');
            setMasterItems(items || []);

            // 3. Fetch existing counts for this specific outlet and month
            const { data: existing } = await supabase.from('hsk_bottle_counts')
                .select('*')
                .eq('month_year', monthYear)
                .eq('location_name', outletName);

            const countMap: Record<string, any> = {};
            existing?.forEach(c => {
                countMap[c.article_number] = { in_circulation: c.in_circulation };
            });
            setInventoryData(countMap);

            setIsLoading(false);
        };

        loadData();
    }, [outletName, monthYear]);

    const handleSave = async () => {
        setIsSaving(true);

        const updates = masterItems.map((item) => {
            const data = inventoryData[item.article_number] || { in_circulation: 0 };
            return {
                month_year: monthYear,
                location_name: outletName,
                location_type: 'Outlet',
                article_number: item.article_number,
                in_circulation: parseFloat(data.in_circulation) || 0,
                new_stock: 0, // Outlets only have circulation
                counted_by: `${outletName} Manager`,
                updated_at: new Date().toISOString()
            };
        });

        const { error } = await supabase.from('hsk_bottle_counts').upsert(updates, { onConflict: 'month_year,location_name,article_number' });

        if (error) {
            toast.error("Failed to submit: " + error.message);
        } else {
            toast.success("Inventory Submitted!");
            setIsSubmitted(true);
        }
        
        setIsSaving(false);
    };

    if (isLoading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-[#6D2158]" size={40}/></div>;

    if (!outletName || !monthYear) {
        return (
            <div className="flex flex-col items-center justify-center h-screen px-6 text-center bg-[#FDFBFD]">
                <AlertTriangle size={40} className="text-amber-500 mb-4" />
                <h2 className="text-2xl font-black text-slate-800">Invalid Link</h2>
                <p className="text-slate-500 font-bold mt-2">This inventory link is broken or missing information. Please request a new link from Housekeeping.</p>
            </div>
        );
    }

    if (isLocked) {
        return (
            <div className="flex flex-col items-center justify-center h-screen px-6 text-center bg-[#FDFBFD]">
                <Lock size={40} className="text-rose-500 mb-4" />
                <h2 className="text-2xl font-black text-slate-800">Inventory Locked</h2>
                <p className="text-slate-500 font-bold mt-2">The inventory period for {monthYear} has been closed by Housekeeping.</p>
            </div>
        );
    }

    if (isSubmitted) {
        return (
            <div className="flex flex-col items-center justify-center h-screen px-6 text-center bg-emerald-50">
                <CheckCircle size={60} className="text-emerald-500 mb-4" />
                <h2 className="text-2xl font-black text-emerald-800">Successfully Submitted!</h2>
                <p className="text-emerald-600 font-bold mt-2">Thank you! Your bottle inventory for {outletName} has been sent to Housekeeping.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FDFBFD] pb-32 font-sans">
            <div className="p-6 bg-[#6D2158] text-white shadow-md rounded-b-3xl mb-6">
                <h1 className="text-2xl font-black">{outletName}</h1>
                <p className="text-xs font-bold text-white/70 uppercase tracking-widest mt-1">Bottle Inventory • {monthYear}</p>
            </div>

            <div className="px-4 max-w-2xl mx-auto space-y-4">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-6">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Instructions</p>
                    <p className="text-sm font-bold text-amber-900 mt-1">Please enter the total physical count of bottles currently in your outlet. Leave as 0 if none.</p>
                </div>

                {masterItems.map((item) => (
                    <div key={item.article_number} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 border border-slate-200">
                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover rounded-xl"/> : <Droplet size={20} className="text-slate-400"/>}
                            </div>
                            <div>
                                <div className="font-black text-slate-800 text-sm">{item.generic_name || item.article_name}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Art: {item.article_number}</div>
                            </div>
                        </div>
                        <input 
                            type="number" 
                            className="w-20 p-3 bg-slate-50 border-2 border-transparent focus:border-[#6D2158] rounded-xl font-black text-center text-lg outline-none transition-all"
                            value={inventoryData[item.article_number]?.in_circulation || ''}
                            onChange={(e) => setInventoryData({
                                ...inventoryData,
                                [item.article_number]: { in_circulation: e.target.value }
                            })}
                            placeholder="0"
                        />
                    </div>
                ))}

                <button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="w-full mt-6 py-4 bg-[#6D2158] text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-[#5a1b49] active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                >
                    {isSaving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                    Submit Inventory
                </button>
            </div>
        </div>
    );
}

export default function ExternalBottlePage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-[#6D2158]" size={40}/></div>}>
            <BottleCountForm />
        </Suspense>
    );
}
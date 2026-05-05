"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Download, Loader2, Droplet, MapPin, Users, LayoutGrid, 
    ListTree, CheckCircle2, Clock, ChevronLeft, ChevronRight,
    Edit3, Save, X, Plus, Trash2, Search, ImageIcon, Layers 
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';
import { format, startOfMonth, addMonths, subMonths, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

type BottleRecord = {
    id?: string;
    article_number: string;
    location_type: 'Villa' | 'Pantry' | 'Water Room' | 'Outlet' | 'PA' | 'NEW_STOCK' | 'DISCARDED';
    location_name: string;
    host_id: string;
    counted_by?: string;
    in_circulation: number;
    new_stock?: number; 
    month_year: string;
};

type BottleAssignment = {
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

export default function BottleMasterInventory() {
    const [isLoading, setIsLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
    const [activeTab, setActiveTab] = useState<'SUMMARY' | 'DETAILS' | 'ATTENDANTS'>('SUMMARY');
    
    const [masterList, setMasterList] = useState<any[]>([]);
    const [records, setRecords] = useState<BottleRecord[]>([]);
    const [prevRecords, setPrevRecords] = useState<BottleRecord[]>([]);
    const [assignments, setAssignments] = useState<BottleAssignment[]>([]);
    const [hosts, setHosts] = useState<Host[]>([]);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any[]>([]);
    const [editSearch, setEditSearch] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // New Stock Modal State
    const [isNewStockModalOpen, setIsNewStockModalOpen] = useState(false);
    const [newStockForm, setNewStockForm] = useState<any[]>([]);
    const [newStockSearch, setNewStockSearch] = useState("");

    // Discard Modal State
    const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
    const [discardForm, setDiscardForm] = useState<any[]>([]);
    const [discardSearch, setDiscardSearch] = useState("");

    useEffect(() => {
        loadBottleData();
    }, [selectedMonth]);

    const loadBottleData = async () => {
        setIsLoading(true);
        
        const prevMonth = format(subMonths(parseISO(`${selectedMonth}-01`), 1), 'yyyy-MM');

        // Fetch all required data concurrently
        const [mastersRes, countsRes, prevCountsRes, allocsRes, hostsRes] = await Promise.all([
            supabase.from('hsk_master_catalog').select('*').eq('category', 'Bottle').order('article_name'),
            supabase.from('hsk_bottle_counts').select('*').eq('month_year', selectedMonth),
            supabase.from('hsk_bottle_counts').select('*').eq('month_year', prevMonth),
            supabase.from('hsk_bottle_assignments').select('*').eq('month_year', selectedMonth),
            supabase.from('hsk_hosts').select('host_id, full_name, role').eq('status', 'Active')
        ]);

        if (mastersRes.data) setMasterList(mastersRes.data);
        if (countsRes.data) setRecords(countsRes.data);
        if (prevCountsRes.data) setPrevRecords(prevCountsRes.data);
        if (allocsRes.data) setAssignments(allocsRes.data);
        if (hostsRes.data) setHosts(hostsRes.data);

        setIsLoading(false);
    };

    // --- 1. SUMMARY DATA ---
    const aggregatedBottles = useMemo(() => {
        const newStockRecords = records.filter(r => r.location_type === 'NEW_STOCK');
        const discardedRecords = records.filter(r => r.location_type === 'DISCARDED');

        return masterList.map(item => {
            const itemRecords = records.filter(r => r.article_number === item.article_number);
            
            const villaCount = itemRecords.filter(r => r.location_type === 'Villa').reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const pantryCount = itemRecords.filter(r => r.location_type === 'Pantry').reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const paCount = itemRecords.filter(r => r.location_type === 'PA' || (r.location_type as string) === 'Public Area').reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const outletCount = itemRecords.filter(r => r.location_type === 'Outlet').reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            
            const waterRoomRecords = itemRecords.filter(r => r.location_type === 'Water Room');
            const wrCirculating = waterRoomRecords.reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const wrNew = waterRoomRecords.reduce((sum, r) => sum + (r.new_stock || 0), 0);

            const newStock = newStockRecords.filter(r => r.article_number === item.article_number).reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const discardedCount = discardedRecords.filter(r => r.article_number === item.article_number).reduce((sum, r) => sum + (r.in_circulation || 0), 0);

            const totalCirculating = villaCount + pantryCount + paCount + outletCount + wrCirculating;

            // Previous month calculation
            const prevItemRecords = prevRecords.filter(r => r.article_number === item.article_number);
            const prevVillaCount = prevItemRecords.filter(r => r.location_type === 'Villa').reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const prevPantryCount = prevItemRecords.filter(r => r.location_type === 'Pantry').reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const prevPaCount = prevItemRecords.filter(r => r.location_type === 'PA' || (r.location_type as string) === 'Public Area').reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const prevOutletCount = prevItemRecords.filter(r => r.location_type === 'Outlet').reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const prevWRRecords = prevItemRecords.filter(r => r.location_type === 'Water Room');
            const prevWRCirculating = prevWRRecords.reduce((sum, r) => sum + (r.in_circulation || 0), 0);
            const prevWRNew = prevWRRecords.reduce((sum, r) => sum + (r.new_stock || 0), 0);
            
            const prevTotalCirculating = prevVillaCount + prevPantryCount + prevPaCount + prevOutletCount + prevWRCirculating;
            const prevClosingTotal = prevTotalCirculating + prevWRNew;

            const openingStock = prevClosingTotal > 0 ? prevClosingTotal : (item.initial_stock || 0); 
            const closingTotal = totalCirculating + wrNew;

            return { 
                ...item, 
                openingStock, 
                newStock, 
                discardedCount, 
                villaCount, 
                pantryCount, 
                paCount, 
                outletCount, 
                wrCirculating, 
                totalCirculating,
                wrNew, 
                closingTotal 
            };
        });
    }, [masterList, records, prevRecords]);

    // --- 2. LOCATION BREAKDOWN DATA ---
    const locationColumns = useMemo(() => {
        const locs = Array.from(new Set([
            ...records.map(r => r.location_name),
            ...assignments.map(a => a.location_name)
        ])).filter(name => name !== 'NEW_STOCK' && name !== 'DISCARDED'); 
        
        return locs.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, ''), 10);
            const numB = parseInt(b.replace(/\D/g, ''), 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
    }, [records, assignments]);

    // --- 3. ATTENDANT PROGRESS DATA ---
    const attendantProgress = useMemo(() => {
        const grouped: Record<string, { host_name: string, host_id: string, tasks: { location: string, type: string, isDone: boolean, personName?: string }[] }> = {};
        
        assignments.forEach(a => {
            const host = hosts.find(h => h.host_id === a.host_id);
            const hostId = a.host_id || 'unassigned';
            
            let hostName = host?.full_name || 'Unknown Staff';
            if (hostId === 'SHARED_PA') hostName = 'Public Area Team';
            if (hostId === 'SHARED_RUNNER') hostName = 'Runners / Pantry Team';
            if (hostId === 'SHARED_OUTLET') hostName = 'Outlet Representatives';
            if (hostId === 'SHARED_WATER_ROOM') hostName = 'Water Room Team';

            if (!grouped[hostId]) {
                grouped[hostId] = { host_name: hostName, host_id: hostId, tasks: [] };
            }
            
            const record = records.find(r => r.location_name === a.location_name && r.location_type === a.location_type);
            const submitterHostId = record?.host_id;
            const personWhoEntered = hosts.find(h => h.host_id === submitterHostId)?.full_name || record?.counted_by;

            grouped[hostId].tasks.push({ 
                location: a.location_name, 
                type: a.location_type, 
                isDone: !!record,
                personName: personWhoEntered
            });
        });

        return Object.values(grouped).sort((a,b) => a.host_name.localeCompare(b.host_name));
    }, [assignments, records, hosts]);

    // --- MONTH NAVIGATION ---
    const handleMonthSlider = (direction: 'prev' | 'next') => {
        const current = parseISO(`${selectedMonth}-01`);
        const updated = direction === 'prev' ? subMonths(current, 1) : addMonths(current, 1);
        setSelectedMonth(format(updated, 'yyyy-MM'));
    };

    // --- EXCEL EXPORT ---
    const handleExportExcel = () => {
        const hasNewStock = aggregatedBottles.some(r => r.newStock > 0);
        const hasDiscards = aggregatedBottles.some(r => r.discardedCount > 0);
        
        const worksheetData = [
            [`BOTTLE INVENTORY REPORT - ${format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy').toUpperCase()}`],
            [],
            [
                "Article Name", "HK Code", "Opening Stock", 
                ...(hasNewStock ? ["New Stock"] : []),
                ...(hasDiscards ? ["Discarded/Damaged"] : []),
                "Villas", "Pantries", "Public Area", "Outlets", "Water Room (Circ.)", "Total Circulating", "Unused Stock (New)", "Closing Total", "Variance"
            ]
        ];

        aggregatedBottles.forEach(item => {
            const expectedClosing = item.openingStock + item.newStock - item.discardedCount;
            const row = [
                item.generic_name || item.article_name,
                item.hk_no || 'NO-HK',
                item.openingStock,
                ...(hasNewStock ? [item.newStock] : []),
                ...(hasDiscards ? [item.discardedCount] : []),
                item.villaCount,
                item.pantryCount,
                item.paCount,
                item.outletCount,
                item.wrCirculating,
                item.totalCirculating,
                item.wrNew,
                item.closingTotal,
                item.closingTotal - expectedClosing
            ];
            worksheetData.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(worksheetData);
        
        let colCount = 11;
        if (hasNewStock) colCount++;
        if (hasDiscards) colCount++;

        if(!ws["!merges"]) ws["!merges"] = [];
        ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount } });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Bottle Inventory");
        
        const maxWidth = aggregatedBottles.reduce((w, r) => Math.max(w, (r.generic_name || r.article_name || "").length), 20);
        ws["!cols"] = [
            { wch: maxWidth + 5 }, { wch: 15 }, { wch: 15 },
            ...(hasNewStock ? [{ wch: 15 }] : []),
            ...(hasDiscards ? [{ wch: 20 }] : []),
            { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 12 }
        ];

        XLSX.writeFile(wb, `Bottle_Inventory_${selectedMonth}.xlsx`);
    };

    // --- MODAL TRIGGERS ---
    const openNewStockModal = () => {
        const newStockRecords = records.filter(r => r.location_type === 'NEW_STOCK');
        const initialForm = masterList.map(item => {
            const existing = newStockRecords.find(r => r.article_number === item.article_number);
            return {
                article_number: item.article_number,
                article_name: item.article_name,
                image_url: item.image_url,
                id: existing?.id,
                in_circulation: existing?.in_circulation || 0,
                location_type: 'NEW_STOCK'
            };
        });
        setNewStockForm(initialForm);
        setNewStockSearch("");
        setIsNewStockModalOpen(true);
    };

    const openDiscardModal = () => {
        const discardedRecords = records.filter(r => r.location_type === 'DISCARDED');
        const initialForm = masterList.map(item => {
            const existing = discardedRecords.find(r => r.article_number === item.article_number);
            return {
                article_number: item.article_number,
                article_name: item.article_name,
                image_url: item.image_url,
                id: existing?.id,
                in_circulation: existing?.in_circulation || 0,
                location_type: 'DISCARDED'
            };
        });
        setDiscardForm(initialForm);
        setDiscardSearch("");
        setIsDiscardModalOpen(true);
    };

    const openEditModal = (locationName: string) => {
        setEditingLocation(locationName);
        const locationRecords = records.filter(r => r.location_name === locationName);
        const initialForm = masterList.map(item => {
            const existing = locationRecords.find(r => r.article_number === item.article_number);
            return {
                article_number: item.article_number,
                article_name: item.article_name,
                image_url: item.image_url,
                id: existing?.id,
                in_circulation: existing?.in_circulation || 0,
                new_stock: existing?.new_stock || 0,
                location_type: locationRecords[0]?.location_type || (locationName.toLowerCase().includes('villa') ? 'Villa' : 'Pantry')
            };
        });
        setEditForm(initialForm);
        setEditSearch("");
        setIsEditModalOpen(true);
    };

    // --- SAVE HANDLERS ---
    const handleSaveNewStock = async () => {
        setIsSaving(true);
        try {
            const updates = newStockForm
                .filter(item => item.in_circulation > 0 || item.id) 
                .map(item => ({
                    id: item.id || crypto.randomUUID(), 
                    article_number: item.article_number,
                    location_name: 'NEW_STOCK',
                    location_type: 'NEW_STOCK',
                    in_circulation: item.in_circulation,
                    new_stock: 0,
                    month_year: selectedMonth,
                    host_id: 'ADJUSTMENT'
                }));

            if (updates.length > 0) {
                const { error } = await supabase.from('hsk_bottle_counts').upsert(updates);
                if (error) throw error;
            }

            toast.success(`New Stock recorded successfully`);
            setIsNewStockModalOpen(false);
            loadBottleData();
        } catch (err: any) {
            console.error("New Stock Save Error:", err);
            toast.error(`Error: ${err?.message || "Failed to save new stock"}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveDiscard = async () => {
        setIsSaving(true);
        try {
            const updates = discardForm
                .filter(item => item.in_circulation > 0 || item.id) 
                .map(item => ({
                    id: item.id || crypto.randomUUID(), 
                    article_number: item.article_number,
                    location_name: 'DISCARDED',
                    location_type: 'DISCARDED',
                    in_circulation: item.in_circulation,
                    new_stock: 0,
                    month_year: selectedMonth,
                    host_id: 'ADJUSTMENT'
                }));

            if (updates.length > 0) {
                const { error } = await supabase.from('hsk_bottle_counts').upsert(updates);
                if (error) throw error;
            }

            toast.success(`Discarded items recorded successfully`);
            setIsDiscardModalOpen(false);
            loadBottleData();
        } catch (err: any) {
            console.error("Discard Save Error:", err);
            toast.error(`Error: ${err?.message || "Failed to save discarded items"}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveEdits = async () => {
        setIsSaving(true);
        try {
            const updates = editForm
                .filter(item => item.in_circulation > 0 || item.new_stock > 0 || item.id) 
                .map(item => ({
                    id: item.id || crypto.randomUUID(), 
                    article_number: item.article_number,
                    location_name: editingLocation,
                    location_type: item.location_type,
                    in_circulation: item.in_circulation,
                    new_stock: item.new_stock,
                    month_year: selectedMonth,
                    host_id: 'ADJUSTMENT'
                }));

            if (updates.length > 0) {
                const { error } = await supabase.from('hsk_bottle_counts').upsert(updates);
                if (error) throw error;
            }

            toast.success(`Updated ${editingLocation} successfully`);
            setIsEditModalOpen(false);
            loadBottleData();
        } catch (err: any) {
            console.error("Edit Save Error:", err);
            toast.error(`Error: ${err?.message || "Failed to save inventory updates"}`);
        } finally {
            setIsSaving(false);
        }
    };

    // --- FILTERED FORM DATA ---
    const filteredNewStockForm = newStockForm.filter(item => 
        item.article_name.toLowerCase().includes(newStockSearch.toLowerCase()) || 
        item.article_number.toLowerCase().includes(newStockSearch.toLowerCase())
    );

    const filteredDiscardForm = discardForm.filter(item => 
        item.article_name.toLowerCase().includes(discardSearch.toLowerCase()) || 
        item.article_number.toLowerCase().includes(discardSearch.toLowerCase())
    );

    const filteredEditForm = editForm.filter(item => 
        item.article_name.toLowerCase().includes(editSearch.toLowerCase()) || 
        item.article_number.toLowerCase().includes(editSearch.toLowerCase())
    );

    const hasNewStockData = aggregatedBottles.some(r => r.newStock > 0);
    const hasDiscardData = aggregatedBottles.some(r => r.discardedCount > 0);

    return (
        <div className="flex flex-col min-h-full bg-[#FDFBFD] pb-36 font-sans">
            <PageHeader title="Bottle Master Inventory" date={new Date()} onDateChange={() => {}} />

            <div className="px-4 md:px-8 max-w-[1600px] mx-auto w-full mt-6">
                
                {/* CONTROLS HEADER */}
                <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex-wrap gap-4">
                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <button onClick={() => handleMonthSlider('prev')} className="p-2 hover:bg-white rounded-lg transition-all text-slate-400 hover:text-[#6D2158]"><ChevronLeft size={18}/></button>
                        <div className="text-center min-w-[140px]">
                            <label className="text-[9px] font-black text-slate-400 uppercase block">Ledger Month</label>
                            <span className="text-sm font-black text-slate-700">{format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')}</span>
                        </div>
                        <button onClick={() => handleMonthSlider('next')} className="p-2 hover:bg-white rounded-lg transition-all text-slate-400 hover:text-[#6D2158]"><ChevronRight size={18}/></button>
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

                    <div className="flex gap-3">
                        <button onClick={openNewStockModal} className="flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-purple-100 transition-colors shrink-0">
                            <Plus size={16}/> Add New Stock
                        </button>
                        <button onClick={openDiscardModal} className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-red-100 transition-colors shrink-0">
                            <Trash2 size={16}/> Discard/Damage
                        </button>
                        <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-emerald-100 transition-colors shrink-0">
                            <Download size={16}/> Export Excel
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
                ) : (
                    <>
                        {/* TAB 1: SUMMARY */}
                        {activeTab === 'SUMMARY' && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in">
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left table-auto">
                                        <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400 font-black">
                                            <tr>
                                                <th className="px-4 py-3 border-b border-slate-200">Bottle Item</th>
                                                <th className="px-2 py-3 border-b border-slate-200 text-center bg-slate-100/50 leading-tight">Opening</th>
                                                {hasNewStockData && (
                                                    <th className="px-2 py-3 border-b border-slate-200 text-center bg-purple-50/50 text-purple-600 leading-tight">New Stock</th>
                                                )}
                                                {hasDiscardData && (
                                                    <th className="px-2 py-3 border-b border-slate-200 text-center bg-red-50/50 text-red-600 leading-tight">Discarded</th>
                                                )}
                                                <th className="px-2 py-3 border-b border-slate-200 text-center bg-blue-50/50 text-blue-600 leading-tight">Villas</th>
                                                <th className="px-2 py-3 border-b border-slate-200 text-center bg-indigo-50/50 text-indigo-600 leading-tight">Pantries</th>
                                                <th className="px-2 py-3 border-b border-slate-200 text-center bg-amber-50/50 text-amber-600 leading-tight">Public Area</th>
                                                <th className="px-2 py-3 border-b border-slate-200 text-center bg-cyan-50/50 text-cyan-600 leading-tight">Outlets</th>
                                                <th className="px-2 py-3 border-b border-slate-200 text-center bg-rose-50/50 text-rose-600 leading-tight">Water Room<br/>(Circ.)</th>
                                                <th className="px-2 py-3 border-b border-slate-200 text-center bg-fuchsia-50/50 text-fuchsia-600 leading-tight">Total<br/>Circulating</th>
                                                <th className="px-2 py-3 border-b border-slate-200 text-center bg-emerald-50/50 text-emerald-600 leading-tight">Unused Stock<br/>(New)</th>
                                                <th className="px-3 py-3 border-b border-slate-200 text-center text-[#6D2158] bg-[#6D2158]/5 leading-tight">Closing Total</th>
                                                <th className="px-2 py-3 border-b border-slate-200 text-center bg-slate-100/50 text-slate-700 leading-tight">Variance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {aggregatedBottles.map(row => {
                                                const expectedClosing = row.openingStock + row.newStock - row.discardedCount;
                                                const variance = row.closingTotal - expectedClosing;
                                                const hasVariance = variance !== 0;

                                                return (
                                                    <tr key={row.article_number} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3 w-[200px] xl:w-[250px]">
                                                                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 border border-slate-200">
                                                                    {row.image_url ? <img src={row.image_url} className="w-full h-full object-cover rounded-lg"/> : <Droplet size={18} className="text-slate-400"/>}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="font-black text-sm text-slate-800 line-clamp-2 leading-tight" title={row.generic_name || row.article_name}>{row.generic_name || row.article_name}</div>
                                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{row.hk_no || 'NO-HK'}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-3 text-center font-black text-slate-400 bg-slate-100/20">{row.openingStock || '-'}</td>
                                                        {hasNewStockData && (
                                                            <td className="px-2 py-3 text-center font-black text-purple-700 bg-purple-50/20">{row.newStock > 0 ? row.newStock : '-'}</td>
                                                        )}
                                                        {hasDiscardData && (
                                                            <td className="px-2 py-3 text-center font-black text-red-700 bg-red-50/20">{row.discardedCount > 0 ? row.discardedCount : '-'}</td>
                                                        )}
                                                        <td className="px-2 py-3 text-center font-black text-blue-700 bg-blue-50/20">{row.villaCount || '-'}</td>
                                                        <td className="px-2 py-3 text-center font-black text-indigo-700 bg-indigo-50/20">{row.pantryCount || '-'}</td>
                                                        <td className="px-2 py-3 text-center font-black text-amber-700 bg-amber-50/20">{row.paCount || '-'}</td>
                                                        <td className="px-2 py-3 text-center font-black text-cyan-700 bg-cyan-50/20">{row.outletCount || '-'}</td>
                                                        <td className="px-2 py-3 text-center font-black text-rose-700 bg-rose-50/20">{row.wrCirculating || '-'}</td>
                                                        <td className="px-2 py-3 text-center font-black text-fuchsia-700 bg-fuchsia-50/20">{row.totalCirculating || '-'}</td>
                                                        <td className="px-2 py-3 text-center font-black text-emerald-700 bg-emerald-50/20">{row.wrNew || '-'}</td>
                                                        <td className="px-3 py-3 text-center bg-[#6D2158]/5">
                                                            <span className="inline-block px-3 py-1 bg-[#6D2158] text-white rounded-lg font-black text-sm shadow-sm">{row.closingTotal}</span>
                                                        </td>
                                                        <td className={`px-2 py-3 text-center font-black ${hasVariance ? (variance > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50') : 'text-slate-400 bg-slate-100/20'}`}>
                                                            {hasVariance ? (variance > 0 ? `+${variance}` : variance) : '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: DETAILED LOCATION BREAKDOWN */}
                        {activeTab === 'DETAILS' && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in flex flex-col h-[70vh]">
                                <div className="p-4 bg-slate-50 border-b border-slate-100 shrink-0 flex justify-between items-center">
                                    <div>
                                        <h3 className="font-black text-[#6D2158] text-sm uppercase tracking-widest">Master Location Matrix</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Click location name to see details or edit entries</p>
                                    </div>
                                </div>
                                <div className="overflow-auto custom-scrollbar flex-1 relative">
                                    <table className="w-max min-w-full text-left table-fixed border-collapse">
                                        <thead className="bg-white text-[10px] uppercase tracking-widest text-slate-500 font-black sticky top-0 z-20 shadow-sm">
                                            <tr>
                                                <th className="px-4 py-3 border-b border-r border-slate-200 sticky left-0 bg-slate-100 z-30 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Bottle Item</th>
                                                {locationColumns.map(col => (
                                                    <th key={col} 
                                                        onClick={() => openEditModal(col)}
                                                        className="px-3 py-3 border-b border-slate-200 text-center bg-slate-50 min-w-[80px] truncate max-w-[120px] cursor-pointer hover:bg-[#6D2158] hover:text-white transition-all group" 
                                                        title={col}
                                                    >
                                                        {col}
                                                        <Edit3 size={10} className="inline-block ml-1 opacity-0 group-hover:opacity-100"/>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {masterList.map(item => (
                                                <tr key={item.article_number} className="hover:bg-purple-50/30 transition-colors">
                                                    <td className="px-4 py-2 border-r border-slate-200 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)] w-64 min-w-[200px]">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="w-8 h-8 bg-slate-100 rounded flex items-center justify-center shrink-0">
                                                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover rounded"/> : <Droplet size={14} className="text-slate-400"/>}
                                                            </div>
                                                            <div className="font-bold text-xs text-slate-800 line-clamp-2 leading-tight flex-1" title={item.generic_name || item.article_name}>{item.generic_name || item.article_name}</div>
                                                        </div>
                                                    </td>
                                                    {locationColumns.map(col => {
                                                        const cellRecord = records.find(r => r.article_number === item.article_number && r.location_name === col);
                                                        
                                                        let displayVal: React.ReactNode = '-';
                                                        if (cellRecord) {
                                                            if (cellRecord.location_type === 'Water Room') {
                                                                displayVal = (
                                                                    <div className="flex flex-col gap-0.5 text-[9px] leading-tight">
                                                                        <span className="text-amber-700 bg-amber-50 px-1 rounded">C: {cellRecord.in_circulation}</span>
                                                                        <span className="text-emerald-700 bg-emerald-50 px-1 rounded">N: {cellRecord.new_stock}</span>
                                                                    </div>
                                                                );
                                                            } else {
                                                                displayVal = <span className="font-black text-slate-700">{cellRecord.in_circulation}</span>;
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
                                {attendantProgress.map(data => {
                                    const totalTasks = data.tasks.length;
                                    const completedTasks = data.tasks.filter(t => t.isDone).length;
                                    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                                    const isAllDone = totalTasks > 0 && completedTasks === totalTasks;

                                    return (
                                        <div key={data.host_id} className={`bg-white rounded-3xl p-5 shadow-sm border transition-all ${isAllDone ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100'}`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="font-black text-slate-800 text-base">{data.host_name}</h3>
                                                    <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">SSL {data.host_id !== 'unassigned' && !data.host_id.includes('SHARED') ? data.host_id : '---'}</p>
                                                </div>
                                                <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm ${isAllDone ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                                                    {progress}% Done
                                                </div>
                                            </div>

                                            <div className="w-full h-1.5 bg-slate-100 rounded-full mb-5 overflow-hidden">
                                                <div className={`h-full rounded-full transition-all duration-500 ${isAllDone ? 'bg-emerald-500' : 'bg-[#6D2158]'}`} style={{ width: `${progress}%` }}></div>
                                            </div>

                                            <div className="space-y-2">
                                                {data.tasks.map((task, idx) => (
                                                    <div key={idx} className="flex flex-col p-2.5 rounded-xl border border-slate-100 bg-slate-50/50">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded bg-white shadow-sm flex items-center justify-center shrink-0 text-slate-400">
                                                                    {task.type === 'Villa' ? <Layers size={12}/> : <ListTree size={12}/>}
                                                                </div>
                                                                <span className="font-bold text-xs text-slate-700 truncate">{task.location}</span>
                                                            </div>
                                                            {task.isDone ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0"/> : <Clock size={16} className="text-amber-400 shrink-0"/>}
                                                        </div>
                                                        {task.isDone && (
                                                            <div className="text-[9px] font-bold text-slate-400 mt-1 flex justify-between border-t border-slate-100 pt-1">
                                                                <span>{task.type === 'Villa' || task.type === 'Pantry' ? 'COMPLETED' : `BY: ${task.personName || 'SYSTEM'}`}</span>
                                                                <button onClick={() => openEditModal(task.location)} className="text-[#6D2158] hover:underline uppercase">Edit</button>
                                                            </div>
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

            {/* NEW STOCK MODAL */}
            {isNewStockModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-purple-100 flex flex-col gap-4 bg-purple-50">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-black text-purple-800 flex items-center gap-2 uppercase tracking-tight"><Plus className="text-purple-600"/> Add New Stock</h2>
                                    <p className="text-xs font-bold text-purple-400 tracking-widest">{format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')} Ledger</p>
                                </div>
                                <button onClick={() => setIsNewStockModalOpen(false)} className="p-2 bg-white rounded-xl shadow-sm text-purple-400 hover:text-purple-600"><X size={20}/></button>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-purple-400" size={16}/>
                                <input 
                                    type="text" 
                                    placeholder="Search item name or code..." 
                                    value={newStockSearch} 
                                    onChange={e => setNewStockSearch(e.target.value)} 
                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-purple-100 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all shadow-inner"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-3">
                            {filteredNewStockForm.length === 0 ? (
                                <p className="text-center text-slate-400 font-bold py-10">No items match your search.</p>
                            ) : (
                                filteredNewStockForm.map((item) => (
                                    <div key={item.article_number} className="grid grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                                        <div className="col-span-8 flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center overflow-hidden shrink-0">
                                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="text-slate-400"/>}
                                            </div>
                                            <div>
                                                <div className="text-xs font-black text-slate-700 uppercase tracking-tight">{item.article_name}</div>
                                                <div className="text-[9px] font-bold text-slate-400">{item.article_number}</div>
                                            </div>
                                        </div>
                                        <div className="col-span-4">
                                            <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">New Received Qty</label>
                                            <input 
                                                type="number" 
                                                value={item.in_circulation} 
                                                onChange={e => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    setNewStockForm(prev => prev.map(p => 
                                                        p.article_number === item.article_number ? { ...p, in_circulation: val } : p
                                                    ));
                                                }}
                                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-black text-center focus:border-purple-600 outline-none"
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                            <button 
                                onClick={handleSaveNewStock}
                                disabled={isSaving}
                                className="flex-1 bg-purple-600 text-white py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Save New Stock
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DISCARD MODAL */}
            {isDiscardModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-red-100 flex flex-col gap-4 bg-red-50">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-black text-red-800 flex items-center gap-2 uppercase tracking-tight"><Trash2 className="text-red-600"/> Discard/Damage Items</h2>
                                    <p className="text-xs font-bold text-red-400 tracking-widest">{format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')} Ledger</p>
                                </div>
                                <button onClick={() => setIsDiscardModalOpen(false)} className="p-2 bg-white rounded-xl shadow-sm text-red-400 hover:text-red-600"><X size={20}/></button>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-red-400" size={16}/>
                                <input 
                                    type="text" 
                                    placeholder="Search item name or code..." 
                                    value={discardSearch} 
                                    onChange={e => setDiscardSearch(e.target.value)} 
                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-red-100 rounded-xl text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all shadow-inner"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-3">
                            {filteredDiscardForm.length === 0 ? (
                                <p className="text-center text-slate-400 font-bold py-10">No items match your search.</p>
                            ) : (
                                filteredDiscardForm.map((item) => (
                                    <div key={item.article_number} className="grid grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                                        <div className="col-span-8 flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center overflow-hidden shrink-0">
                                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="text-slate-400"/>}
                                            </div>
                                            <div>
                                                <div className="text-xs font-black text-slate-700 uppercase tracking-tight">{item.article_name}</div>
                                                <div className="text-[9px] font-bold text-slate-400">{item.article_number}</div>
                                            </div>
                                        </div>
                                        <div className="col-span-4">
                                            <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Discarded Qty</label>
                                            <input 
                                                type="number" 
                                                value={item.in_circulation} 
                                                onChange={e => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    setDiscardForm(prev => prev.map(p => 
                                                        p.article_number === item.article_number ? { ...p, in_circulation: val } : p
                                                    ));
                                                }}
                                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-black text-center focus:border-red-600 outline-none"
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                            <button 
                                onClick={handleSaveDiscard}
                                disabled={isSaving}
                                className="flex-1 bg-red-600 text-white py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Save Discarded Items
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT MODAL */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-200 flex flex-col gap-4 bg-slate-100/50">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight"><Edit3 className="text-[#6D2158]"/> {editingLocation} Ledger</h2>
                                    <p className="text-xs font-bold text-slate-400 tracking-widest">{format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')} Adjustment</p>
                                </div>
                                <button onClick={() => setIsEditModalOpen(false)} className="p-2 bg-white rounded-xl shadow-sm text-slate-400 hover:text-slate-600"><X size={20}/></button>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                                <input 
                                    type="text" 
                                    placeholder="Search item name or code..." 
                                    value={editSearch} 
                                    onChange={e => setEditSearch(e.target.value)} 
                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-[#6D2158] shadow-inner"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-3">
                            {filteredEditForm.length === 0 ? (
                                <p className="text-center text-slate-400 font-bold py-10">No items match your search.</p>
                            ) : (
                                filteredEditForm.map((item) => (
                                    <div key={item.article_number} className="grid grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                                        <div className="col-span-6 flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white rounded flex items-center justify-center overflow-hidden shrink-0 border border-slate-200">
                                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="text-slate-400"/>}
                                            </div>
                                            <div>
                                                <div className="text-xs font-black text-slate-700 uppercase tracking-tight">{item.article_name}</div>
                                                <div className="text-[9px] font-bold text-slate-400">{item.article_number}</div>
                                            </div>
                                        </div>
                                        <div className="col-span-3">
                                            <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">{item.location_type === 'Water Room' ? 'Water Room (Circulating)' : 'Counted Qty'}</label>
                                            <input 
                                                type="number" 
                                                value={item.in_circulation} 
                                                onChange={e => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    setEditForm(prev => prev.map(p => 
                                                        p.article_number === item.article_number ? { ...p, in_circulation: val } : p
                                                    ));
                                                }}
                                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-black text-center focus:border-[#6D2158] outline-none"
                                            />
                                        </div>
                                        {item.location_type === 'Water Room' && (
                                            <div className="col-span-3">
                                                <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Unused Stock (New)</label>
                                                <input 
                                                    type="number" 
                                                    value={item.new_stock} 
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value) || 0;
                                                        setEditForm(prev => prev.map(p => 
                                                            p.article_number === item.article_number ? { ...p, new_stock: val } : p
                                                        ));
                                                    }}
                                                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-black text-center focus:border-[#6D2158] outline-none"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                            <button 
                                onClick={handleSaveEdits}
                                disabled={isSaving}
                                className="flex-1 bg-[#6D2158] text-white py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-[#6D2158]/20 flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Save Inventory Updates
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
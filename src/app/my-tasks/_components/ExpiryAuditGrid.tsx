"use client";
import React from 'react';
import { AlertTriangle, CheckCircle, CheckCircle2, Edit3, Wine, Minus, Plus, Loader2, Clock, RefreshCw } from 'lucide-react';
import type { MasterItem } from '../page';
import { format, parseISO } from 'date-fns';

interface ExpiryAuditGridProps {
    step: 2 | 3;
    // Step 2 specific
    expiryAssignedVillas?: string[];
    expiryVillaData?: Record<string, any>;
    startExpiryAudit?: (v: string) => void;
    // Step 3 specific
    selectedVilla?: string;
    handleEditRemovals?: () => void;
    groupedTargets?: { expiry: any[], refill: any[] };
    expiryCounts?: Record<string, number>;
    refillCounts?: Record<string, number>;
    updateExpiryCount?: (artNo: string, delta: number) => void;
    updateRefillCount?: (artNo: string, delta: number) => void;
    masterCatalog?: MasterItem[];
    submitExpiryRemovals?: (status: 'All OK' | 'Removed') => void;
    confirmExpiryRefill?: () => void;
    isSaving?: boolean;
}

export default function ExpiryAuditGrid({
    step, expiryAssignedVillas, expiryVillaData, startExpiryAudit, selectedVilla, handleEditRemovals, 
    groupedTargets, expiryCounts, refillCounts, updateExpiryCount, updateRefillCount, masterCatalog, 
    submitExpiryRemovals, confirmExpiryRefill, isSaving
}: ExpiryAuditGridProps) {

    if (step === 2) {
        if (!expiryAssignedVillas || expiryAssignedVillas.length === 0) return null;

        return (
            <div className="bg-rose-50 p-4 md:p-6 rounded-3xl shadow-sm border border-rose-100 animate-in slide-in-from-bottom-3">
                <div className="mb-4 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg md:text-xl font-bold text-rose-800 mb-1 flex items-center gap-2"><AlertTriangle size={18}/> Expiry & Refills</h3>
                        <p className="text-[10px] md:text-xs text-rose-600/70 font-medium">Check these villas for targeted items.</p>
                    </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                    {expiryAssignedVillas.map(villa => {
                        const vData = expiryVillaData?.[villa];
                        const status = vData?.status;
                        
                        const isNeedsRefill = status === 'Removed';
                        const isSent = status === 'Sent';
                        const isDone = status === 'All OK' || status === 'Refilled';

                        return (
                            <button 
                                key={villa}
                                onClick={() => startExpiryAudit?.(villa)}
                                className={`aspect-square rounded-2xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${
                                    isDone ? 'bg-emerald-50 border-emerald-500 text-emerald-700 hover:bg-emerald-100' : 
                                    isSent ? 'bg-indigo-100 border-indigo-400 text-indigo-700 animate-pulse' : 
                                    isNeedsRefill ? 'bg-amber-100 border-amber-400 text-amber-700 animate-pulse' : 
                                    'bg-white border-rose-200 text-rose-700 hover:border-rose-400 hover:shadow-md'
                                }`}
                            >
                                {isDone && <CheckCircle2 size={14} className="absolute top-2 right-2 text-emerald-500"/>}
                                <span className={`font-black ${villa.includes('-') ? 'text-xl' : 'text-2xl md:text-3xl'}`}>{villa}</span>
                                <span className="text-[9px] md:text-[10px] font-bold uppercase mt-1 opacity-60">
                                    {isDone ? 'Done' : isSent ? 'Sent' : isNeedsRefill ? 'Refill' : 'Pending'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (step === 3 && selectedVilla && expiryVillaData && groupedTargets && expiryCounts && refillCounts && masterCatalog && submitExpiryRemovals && confirmExpiryRefill) {
        return ['Removed', 'Sent', 'Refilled'].includes(expiryVillaData[selectedVilla]?.status) ? (
            // --- AWAITING REFILL / REFILLED SCREEN ---
            <div className="space-y-4 pb-40 animate-in fade-in">
                <div className={`${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'bg-indigo-50 border-indigo-200' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'} border p-6 md:p-8 rounded-3xl text-center shadow-sm mb-6 relative`}>
                    <button onClick={handleEditRemovals} className={`absolute top-4 right-4 p-2 bg-white rounded-full shadow-sm transition-colors ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'text-indigo-600 hover:bg-indigo-100' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'text-blue-600 hover:bg-blue-100' : 'text-amber-600 hover:bg-amber-100'}`} title="Edit Removals">
                        <Edit3 size={14} />
                    </button>
                    <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'bg-indigo-100 text-indigo-600' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                        {expiryVillaData[selectedVilla]?.status === 'Sent' ? <CheckCircle size={24}/> : expiryVillaData[selectedVilla]?.status === 'Refilled' ? <CheckCircle2 size={24}/> : <AlertTriangle size={24}/>}
                    </div>
                    <h3 className={`text-xl md:text-2xl font-black tracking-tight ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'text-indigo-700' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'text-blue-700' : 'text-amber-700'}`}>
                        {expiryVillaData[selectedVilla]?.status === 'Sent' ? 'Items Dispatched!' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'Refill Confirmed' : 'Awaiting Refill'}
                    </h3>
                    <p className={`text-xs md:text-sm font-medium mt-2 leading-relaxed ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'text-indigo-600' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'text-blue-600' : 'text-amber-600'}`}>
                        {expiryVillaData[selectedVilla]?.status === 'Sent' ? 'The items have been sent to you. Please confirm when placed.' : 'Please adjust the counters below if you could not replace all items.'}
                    </p>
                </div>
                    
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {(expiryVillaData[selectedVilla]?.removal_data || []).map((item: any) => {
                        const masterItem = masterCatalog.find(c => c.article_number === item.article_number);
                        const currentRefill = refillCounts[item.article_number] !== undefined ? refillCounts[item.article_number] : item.qty;
                        const isNotRefilled = currentRefill === 0;
                        const isPartial = currentRefill > 0 && currentRefill < item.qty;

                        return (
                            <div key={item.article_number} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${isNotRefilled ? 'border-rose-300 bg-rose-50/30' : isPartial ? 'border-amber-300' : 'border-slate-200'}`}>
                                
                                <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-3">
                                    {masterItem?.image_url ? <img src={masterItem.image_url} className={`w-full h-full object-contain drop-shadow-sm transition-all ${isNotRefilled ? 'grayscale opacity-50' : ''}`} /> : <Wine size={24} className="text-slate-300"/>}
                                </div>
                                
                                <div className="flex flex-col flex-1 px-1 text-center">
                                    <h4 className="text-xs font-black text-slate-800 leading-tight line-clamp-2">{item.name}</h4>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Req: {item.qty}</p>
                                    
                                    {isNotRefilled && <span className="text-[9px] font-black text-rose-500 uppercase mt-1">Not Refilled</span>}
                                    {isPartial && <span className="text-[9px] font-black text-amber-500 uppercase mt-1">Partial</span>}
                                </div>

                                <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                                    <button onClick={() => updateRefillCount?.(item.article_number, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={14}/></button>
                                    <span className={`font-black text-base ${isNotRefilled ? 'text-rose-600' : 'text-emerald-600'}`}>{currentRefill}</span>
                                    <button onClick={() => updateRefillCount?.(item.article_number, 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-600 hover:text-emerald-600 active:scale-95 transition-all"><Plus size={14}/></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                <div className="fixed bottom-20 md:bottom-0 left-0 right-0 md:left-64 p-3 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                    <div className="max-w-5xl mx-auto">
                        <button 
                            onClick={confirmExpiryRefill} 
                            disabled={isSaving || expiryVillaData[selectedVilla]?.status === 'Removed'} 
                            className={`w-full py-4 text-white rounded-xl font-black uppercase tracking-widest text-xs md:text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${
                                expiryVillaData[selectedVilla]?.status === 'Removed' ? 'bg-slate-400 shadow-none cursor-not-allowed' :
                                expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'bg-blue-600 shadow-blue-600/20' : 
                                'bg-emerald-500 shadow-emerald-500/20'}`}
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={20}/> : 
                             expiryVillaData[selectedVilla]?.status === 'Removed' ? <><Clock size={16}/> Waiting for Dispatch</> :
                            <><CheckCircle2 size={16}/> {expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'Update Confirmation' : 'Confirm Replacements'}</>}
                        </button>
                    </div>
                </div>
            </div>
        ) : (
            // --- RECORD REMOVAL SCREEN (Split Sections) ---
            <div className="space-y-6 pb-40 animate-in fade-in">
                {groupedTargets.expiry.length === 0 && groupedTargets.refill.length === 0 ? (
                    <p className="text-center font-bold text-slate-400 italic mt-10">No targets set by admin.</p>
                ) : (
                    <>
                        {/* EXPIRY & MISSING CHECKS */}
                        {groupedTargets.expiry.length > 0 && (
                            <div>
                                <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <AlertTriangle size={14}/> Expiry & Missing Checks
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {groupedTargets.expiry.map((t: any) => {
                                        const key = t.article_number;
                                        const masterItem = masterCatalog.find(c => c.article_number === t.article_number);
                                        const qty = expiryCounts[key] || 0;

                                        return (
                                            <div key={key} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${qty > 0 ? 'border-rose-400 ring-4 ring-rose-50' : 'border-slate-200'}`}>
                                                
                                                <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-3">
                                                    {masterItem?.image_url ? <img src={masterItem.image_url} className="w-full h-full object-contain drop-shadow-sm" /> : <Wine size={24} className="text-slate-300"/>}
                                                </div>
                                                
                                                <div className="flex flex-col flex-1 px-1 text-center">
                                                    <h4 className="text-xs font-black text-slate-800 leading-tight line-clamp-2">{t.article_name}</h4>
                                                    
                                                    {t.dates && t.dates.length > 0 ? (
                                                        <div className="flex flex-wrap justify-center gap-1 mt-1">
                                                            {t.dates.map((d: string) => (
                                                                <span key={d} className="text-[8px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                                                    {format(parseISO(d), 'dd MMM')}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="mt-1">
                                                            <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                                Missing Check
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                                                    <button onClick={() => updateExpiryCount?.(key, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={14}/></button>
                                                    <span className={`font-black text-base ${qty > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{qty}</span>
                                                    <button onClick={() => updateExpiryCount?.(key, 1)} className="w-8 h-8 flex items-center justify-center bg-rose-600 rounded-md shadow-sm text-white active:scale-95 transition-all"><Plus size={14}/></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* SEPARATE REFILL TASKS */}
                        {groupedTargets.refill.length > 0 && (
                            <div className="pt-4 border-t border-slate-200">
                                <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <RefreshCw size={12}/> Pure Refill Tasks
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {groupedTargets.refill.map((t: any) => {
                                        const key = t.article_number;
                                        const masterItem = masterCatalog.find(c => c.article_number === t.article_number);
                                        const qty = expiryCounts[key] || 0;

                                        return (
                                            <div key={key} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${qty > 0 ? 'border-emerald-400 ring-4 ring-emerald-50' : 'border-slate-200'}`}>
                                                <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-3">
                                                    {masterItem?.image_url ? <img src={masterItem.image_url} className="w-full h-full object-contain drop-shadow-sm" /> : <Wine size={24} className="text-slate-300"/>}
                                                </div>
                                                <div className="flex flex-col flex-1 px-1 text-center">
                                                    <h4 className="text-xs font-black text-slate-800 leading-tight line-clamp-2">{t.article_name}</h4>
                                                    <div className="mt-1">
                                                        <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                                            Refill Needed
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                                                    <button onClick={() => updateExpiryCount?.(key, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={14}/></button>
                                                    <span className={`font-black text-base ${qty > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{qty}</span>
                                                    <button onClick={() => updateExpiryCount?.(key, 1)} className="w-8 h-8 flex items-center justify-center bg-emerald-600 rounded-md shadow-sm text-white active:scale-95 transition-all"><Plus size={14}/></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
                
                <div className="fixed bottom-20 md:bottom-0 left-0 right-0 md:left-64 p-3 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                    <div className="max-w-5xl mx-auto flex gap-2 md:gap-3">
                        <button 
                            onClick={() => submitExpiryRemovals('All OK')} 
                            disabled={isSaving} 
                            className="flex-1 py-4 text-emerald-700 bg-emerald-50 rounded-xl font-black uppercase tracking-widest border border-emerald-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 md:gap-1 leading-none"
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={20}/> : <><span className="text-[10px] md:text-xs">{expiryVillaData[selectedVilla]?.status === 'All OK' ? 'Confirm OK' : 'None Found'}</span><span className="text-[8px] opacity-70">(All OK)</span></>}
                        </button>
                        <button 
                            onClick={() => submitExpiryRemovals('Removed')} 
                            disabled={isSaving || (groupedTargets.expiry.length === 0 && groupedTargets.refill.length === 0) || Object.values(expiryCounts).every(v => v === 0)} 
                            className="flex-[1.5] py-4 text-white bg-rose-600 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-rose-600/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 md:gap-1 leading-none disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={20}/> : <><span className="text-[10px] md:text-xs">Record Actions</span><span className="text-[8px] opacity-70">(Needs Refill)</span></>}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
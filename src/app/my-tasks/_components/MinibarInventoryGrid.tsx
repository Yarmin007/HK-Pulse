"use client";
import React from 'react';
import { Search, X, MapPin, Wine, Minus, Plus, Loader2, Save } from 'lucide-react';
import type { MasterItem } from '../page';

interface MinibarInventoryGridProps {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    locationFilters: string[];
    activeLocation: string;
    setActiveLocation: (l: string) => void;
    displayCatalog: MasterItem[];
    counts: Record<string, number>;
    keypadTarget: string | null;
    openKeypad: (artNo: string) => void;
    updateCount: (artNo: string, delta: number) => void;
    requestSaveInventory: () => void;
    isSaving: boolean;
    activeTaskType?: string;
}

export default function MinibarInventoryGrid({
    searchQuery, setSearchQuery, locationFilters, activeLocation, setActiveLocation, 
    displayCatalog, counts, keypadTarget, openKeypad, updateCount, requestSaveInventory, 
    isSaving, activeTaskType
}: MinibarInventoryGridProps) {
    const catalogToDisplay = displayCatalog || [];

    return (
        <>
            {/* SEARCH BAR */}
            <div className="relative mb-3 md:mb-4">
                <Search className="absolute left-4 top-3 text-slate-400" size={16}/>
                <input 
                    type="text" 
                    placeholder="Search minibar items..." 
                    className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] shadow-sm"
                    value={searchQuery || ''}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-4 top-3 text-slate-300 hover:text-slate-500">
                        <X size={16}/>
                    </button>
                )}
            </div>

            {/* DYNAMIC VILLA LOCATION TABS */}
            {locationFilters && locationFilters.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-2 border-b border-slate-100">
                    {locationFilters.map(loc => (
                        <button 
                            key={loc} 
                            onClick={() => setActiveLocation(loc)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border shadow-sm flex items-center gap-1.5 ${activeLocation === loc ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                        >
                            {loc !== 'All' && loc !== 'Unassigned' && <MapPin size={10}/>}
                            {loc}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 pb-40">
                {catalogToDisplay.length === 0 ? (
                    <div className="col-span-full py-10 text-center text-slate-400 font-bold">No minibar items found.</div>
                ) : catalogToDisplay.map(item => {
                    const qty = counts[item.article_number] || 0;
                    const isKeypadActive = keypadTarget === item.article_number;
                    
                    return (
                    <div key={item.article_number} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${qty > 0 || isKeypadActive ? 'border-[#6D2158] ring-2 ring-[#6D2158]/10' : 'border-slate-200'}`}>
                        
                        <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-3 relative">
                            {item.image_url ? <img src={item.image_url} className="w-full h-full object-contain drop-shadow-sm"/> : <Wine size={24} className="text-slate-300"/>}
                        </div>
                        
                        <div className="flex flex-col flex-1 px-1">
                            <h4 className="text-[10px] font-black text-slate-800 leading-tight line-clamp-2">{item.generic_name || item.article_name}</h4>
                            <div className="flex items-center justify-between mt-1">
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">{item.category}</p>
                                {item.villa_location && activeLocation === 'All' && (
                                    <p className="text-[7px] font-black text-[#6D2158] uppercase tracking-widest bg-purple-50 px-1.5 py-0.5 rounded truncate max-w-[60px]">{item.villa_location}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                            <button onClick={() => updateCount(item.article_number, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all">
                                <Minus size={14}/>
                            </button>
                            
                            <button 
                                onClick={() => openKeypad(item.article_number)} 
                                className={`w-10 text-center font-black text-lg py-1 rounded-md transition-colors ${qty > 0 ? 'text-[#6D2158]' : 'text-slate-400 hover:bg-slate-200'} ${isKeypadActive ? 'bg-[#6D2158]/10 text-[#6D2158] ring-1 ring-[#6D2158]' : ''}`}
                            >
                                {qty}
                            </button>

                            <button onClick={() => updateCount(item.article_number, 1)} className="w-8 h-8 flex items-center justify-center bg-[#6D2158] rounded-md shadow-sm text-white active:scale-95 transition-all">
                                <Plus size={14}/>
                            </button>
                        </div>
                    </div>
                )})}
            </div>

            {/* Fixed Bottom Submit Bar */}
            <div className="fixed bottom-20 md:bottom-0 left-0 right-0 md:left-64 p-3 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                <div className="max-w-5xl mx-auto">
                    <button 
                        onClick={requestSaveInventory} 
                        disabled={isSaving} 
                        className="w-full py-4 text-white bg-[#6D2158] shadow-purple-900/20 rounded-xl font-black uppercase tracking-widest text-xs md:text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={20}/> : <><Save size={16}/> {activeTaskType === 'Legacy Minibar' ? 'Confirm Minibar Inventory' : 'Submit Audit'}</>}
                    </button>
                </div>
            </div>
        </>
    );
}
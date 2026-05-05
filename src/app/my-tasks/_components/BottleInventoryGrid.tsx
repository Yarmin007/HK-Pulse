import React from 'react';
import { MasterItem } from '../page';
import { Search, Loader2, Save, Droplet, ImageIcon, Plus } from 'lucide-react';

export default function BottleInventoryGrid({
    searchQuery,
    setSearchQuery,
    displayCatalog,
    counts,
    updateCount,
    requestSaveInventory,
    isSaving,
    locationType
}: {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    displayCatalog: MasterItem[];
    counts: Record<string, any>;
    updateCount: (artNo: string, val: any) => void;
    requestSaveInventory: () => void;
    isSaving: boolean;
    locationType?: string;
}) {

    const isWaterRoom = locationType === 'Water Room';

    const handleCountChange = (artNo: string, field: 'in_circulation' | 'new_stock', valStr: string) => {
        const val = parseInt(valStr) || 0;
        
        if (isWaterRoom) {
            let current = { in_circulation: 0, new_stock: 0 };
            try {
                if (counts[artNo]) current = JSON.parse(counts[artNo]);
            } catch(e){}
            
            const updated = { ...current, [field]: val };
            updateCount(artNo, JSON.stringify(updated));
        } else {
            updateCount(artNo, val);
        }
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300">
            {/* Search Bar */}
            <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 mb-4 md:mb-6 shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input 
                        type="text" 
                        placeholder="Search bottle item..." 
                        className="w-full pl-10 md:pl-12 pr-4 py-3 md:py-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-sm font-bold outline-none focus:border-[#6D2158] transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* List of Items */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pb-24 md:pb-32">
                {displayCatalog.length === 0 ? (
                    <div className="text-center py-12 md:py-20 bg-white rounded-3xl border border-slate-100 shadow-sm mx-2">
                        <Droplet size={40} className="mx-auto text-slate-200 mb-4"/>
                        <p className="font-bold text-slate-400 text-sm md:text-base">No items found.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 px-1 md:px-0">
                        {displayCatalog.map(item => {
                            let circ = 0;
                            let newQty = 0;

                            if (isWaterRoom) {
                                try {
                                    if (counts[item.article_number]) {
                                        const parsed = JSON.parse(counts[item.article_number]);
                                        circ = parsed.in_circulation || 0;
                                        newQty = parsed.new_stock || 0;
                                    }
                                } catch(e){}
                            } else {
                                circ = Number(counts[item.article_number]) || 0;
                            }

                            return (
                                <div key={item.article_number} className="bg-white border border-slate-100 p-4 md:p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 md:w-16 md:h-16 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden p-1">
                                            {item.image_url ? <img src={item.image_url} className="w-full h-full object-contain rounded-lg"/> : <ImageIcon size={24} className="text-slate-300"/>}
                                        </div>
                                        <div>
                                            <div className="font-black text-slate-800 text-sm md:text-base leading-tight">{item.generic_name || item.article_name}</div>
                                            <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Art: {item.article_number}</div>
                                        </div>
                                    </div>

                                    {isWaterRoom ? (
                                        <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
                                            <div>
                                                <label className="text-[9px] md:text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-1">In Circulation</label>
                                                <input 
                                                    type="number" 
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    className="w-full md:w-28 p-3 md:p-4 bg-amber-50 border-2 border-transparent focus:border-amber-400 rounded-xl md:rounded-2xl font-black text-amber-900 text-center text-lg md:text-xl outline-none transition-all shadow-inner"
                                                    value={circ === 0 ? '' : circ}
                                                    onChange={e => handleCountChange(item.article_number, 'in_circulation', e.target.value)}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] md:text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1">New Stock</label>
                                                <input 
                                                    type="number" 
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    className="w-full md:w-28 p-3 md:p-4 bg-emerald-50 border-2 border-transparent focus:border-emerald-400 rounded-xl md:rounded-2xl font-black text-emerald-900 text-center text-lg md:text-xl outline-none transition-all shadow-inner"
                                                    value={newQty === 0 ? '' : newQty}
                                                    onChange={e => handleCountChange(item.article_number, 'new_stock', e.target.value)}
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full md:w-32 shrink-0">
                                            <input 
                                                type="number" 
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                className="w-full p-4 bg-slate-50 border-2 border-slate-200 focus:border-[#6D2158] rounded-2xl font-black text-center text-xl md:text-2xl outline-none transition-all shadow-inner"
                                                value={circ === 0 ? '' : circ}
                                                onChange={e => handleCountChange(item.article_number, 'in_circulation', e.target.value)}
                                                placeholder="0"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Sticky Save Button */}
            <div className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-[80] pb-safe flex justify-center">
                <button 
                    onClick={requestSaveInventory} 
                    disabled={isSaving}
                    className="w-full max-w-xl py-4 md:py-5 bg-[#6D2158] text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl flex justify-center items-center gap-2 hover:bg-[#5a1b49] active:scale-95 transition-all disabled:opacity-50"
                >
                    {isSaving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                    Save Counts
                </button>
            </div>
        </div>
    );
}
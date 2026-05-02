"use client";
import React, { useState, useEffect } from 'react';
import { Search, X, Layers, Minus, Plus, Loader2, Save, Info } from 'lucide-react';
import type { MasterItem } from '../page';

interface LinenInventoryGridProps {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    displayCatalog: MasterItem[];
    counts: Record<string, any>;
    updateCount: (artNo: string, val: any) => void;
    requestSaveInventory: () => void;
    isSaving: boolean;
    locationType?: string;
}

export default function LinenInventoryGrid({
    searchQuery, setSearchQuery, displayCatalog, counts, updateCount, requestSaveInventory, 
    isSaving, locationType
}: LinenInventoryGridProps) {
    const catalogToDisplay = displayCatalog || [];
    const isLaundry = locationType === 'Laundry';

    // Local State for Keypad & Guides
    const [keypadTarget, setKeypadTarget] = useState<{ artNo: string, field: 'standard' | 'used' | 'new' } | null>(null);
    const [keypadValue, setKeypadValue] = useState<string>('');
    const [showGuideModal, setShowGuideModal] = useState(false);

    useEffect(() => {
        if (!localStorage.getItem('hk_pulse_linen_guide_seen')) {
            setShowGuideModal(true);
        }
    }, []);

    const closeGuide = () => {
        localStorage.setItem('hk_pulse_linen_guide_seen', 'true');
        setShowGuideModal(false);
    };

    // --- State Handlers ---
    const getLaundryCount = (artNo: string) => {
        try {
            const val = counts[artNo];
            if (typeof val === 'string') return JSON.parse(val);
            if (typeof val === 'object' && val !== null) return val;
        } catch(e) {}
        return { used: 0, new: 0 };
    };

    const handleStandardUpdate = (artNo: string, deltaOrValue: number, isAbsolute = false) => {
        const current = parseInt(counts[artNo] as any) || 0;
        const nextVal = isAbsolute ? deltaOrValue : Math.max(0, current + deltaOrValue);
        updateCount(artNo, nextVal);
    };

    const handleLaundryUpdate = (artNo: string, type: 'used' | 'new', deltaOrValue: number, isAbsolute = false) => {
        const current = getLaundryCount(artNo);
        const nextVal = isAbsolute ? deltaOrValue : Math.max(0, current[type] + deltaOrValue);
        updateCount(artNo, JSON.stringify({ ...current, [type]: nextVal }));
    };

    // --- Keypad Handlers ---
    const openKeypad = (artNo: string, field: 'standard' | 'used' | 'new') => {
        setKeypadTarget({ artNo, field });
        if (field === 'standard') {
            setKeypadValue(String(counts[artNo] || 0));
        } else {
            const current = getLaundryCount(artNo);
            setKeypadValue(String(current[field] || 0));
        }
    };

    const handleKeypadPress = (val: string) => {
        if (val === 'DEL') setKeypadValue(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
        else if (val === 'CLR') setKeypadValue('0');
        else setKeypadValue(prev => prev === '0' ? val : prev + val);
    };

    const saveKeypadValue = () => {
        if (keypadTarget) {
            const num = parseInt(keypadValue, 10);
            const finalNum = isNaN(num) ? 0 : num;
            
            if (keypadTarget.field === 'standard') {
                handleStandardUpdate(keypadTarget.artNo, finalNum, true);
            } else {
                handleLaundryUpdate(keypadTarget.artNo, keypadTarget.field, finalNum, true);
            }
        }
        setKeypadTarget(null);
    };

    return (
        <>
            <div className="flex justify-between items-center mb-6">
                {/* SEARCH BAR */}
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-4 top-3 text-slate-400" size={16}/>
                    <input 
                        type="text" 
                        placeholder="Search linen items..." 
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
                
                <button onClick={() => setShowGuideModal(true)} className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158] hover:bg-purple-50 rounded-xl transition-colors shadow-sm active:scale-95 ml-2" title="How to Count">
                    <Info size={20}/>
                </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 pb-40">
                {catalogToDisplay.length === 0 ? (
                    <div className="col-span-full py-10 text-center text-slate-400 font-bold">No linen items found for this location.</div>
                ) : catalogToDisplay.map(item => {
                    const artNo = item.article_number;
                    const isAnyKeypadActive = keypadTarget?.artNo === artNo;

                    // Standard values
                    const stdQty = parseInt(counts[artNo] as any) || 0;
                    
                    // Laundry values
                    const laundryData = getLaundryCount(artNo);
                    const hasLaundryCount = laundryData.used > 0 || laundryData.new > 0;

                    const isActive = isLaundry ? hasLaundryCount : stdQty > 0;
                    
                    return (
                    <div key={artNo} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${isActive || isAnyKeypadActive ? 'border-[#6D2158] ring-2 ring-[#6D2158]/10' : 'border-slate-200'}`}>
                        
                        <div className="flex flex-col flex-1 px-1 mb-2">
                            <h4 className="text-xs font-black text-slate-800 leading-tight">{item.generic_name || item.article_name}</h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Art: {artNo}</p>
                        </div>

                        {/* RENDER DUAL INPUTS FOR LAUNDRY */}
                        {isLaundry ? (
                            <div className="flex gap-1.5 mt-auto">
                                <button 
                                    onClick={() => openKeypad(artNo, 'used')}
                                    className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg border transition-colors ${laundryData.used > 0 || keypadTarget?.field === 'used' ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200 hover:border-amber-300'}`}
                                >
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${laundryData.used > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Used</span>
                                    <span className={`text-base font-black ${laundryData.used > 0 ? 'text-amber-700' : 'text-slate-600'}`}>{laundryData.used}</span>
                                </button>
                                <button 
                                    onClick={() => openKeypad(artNo, 'new')}
                                    className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg border transition-colors ${laundryData.new > 0 || keypadTarget?.field === 'new' ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200 hover:border-emerald-300'}`}
                                >
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${laundryData.new > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>New</span>
                                    <span className={`text-base font-black ${laundryData.new > 0 ? 'text-emerald-700' : 'text-slate-600'}`}>{laundryData.new}</span>
                                </button>
                            </div>
                        ) : (
                            /* RENDER STANDARD INPUT FOR EVERYONE ELSE */
                            <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                                <button onClick={() => handleStandardUpdate(artNo, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all">
                                    <Minus size={14}/>
                                </button>
                                
                                <button 
                                    onClick={() => openKeypad(artNo, 'standard')} 
                                    className={`w-10 text-center font-black text-lg py-1 rounded-md transition-colors ${stdQty > 0 ? 'text-[#6D2158]' : 'text-slate-400 hover:bg-slate-200'} ${keypadTarget?.field === 'standard' && keypadTarget?.artNo === artNo ? 'bg-[#6D2158]/10 text-[#6D2158] ring-1 ring-[#6D2158]' : ''}`}
                                >
                                    {stdQty}
                                </button>

                                <button onClick={() => handleStandardUpdate(artNo, 1)} className="w-8 h-8 flex items-center justify-center bg-[#6D2158] rounded-md shadow-sm text-white active:scale-95 transition-all">
                                    <Plus size={14}/>
                                </button>
                            </div>
                        )}
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
                        {isSaving ? <Loader2 className="animate-spin" size={20}/> : <><Save size={16}/> Confirm Linen Count</>}
                    </button>
                </div>
            </div>

            {/* --- CUSTOM KEYPAD OVERLAY --- */}
            {keypadTarget && (
                <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
                    <div className="absolute inset-0" onClick={saveKeypadValue}></div>
                    <div className="bg-[#FDFBFD] w-full rounded-t-[2rem] p-5 md:p-6 pb-safe shadow-2xl animate-in slide-in-from-bottom-8 relative z-10 max-w-md mx-auto">
                        
                        <div className="flex justify-between items-center mb-5">
                            <div>
                                <h4 className="font-black text-slate-800 text-base">Direct Input</h4>
                                <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                    {catalogToDisplay.find(c => c.article_number === keypadTarget.artNo)?.generic_name || 'Item'}
                                    {keypadTarget.field !== 'standard' && <span className="ml-1 text-[#6D2158]">({keypadTarget.field})</span>}
                                </p>
                            </div>
                            <div className="text-3xl font-black text-[#6D2158] bg-purple-50 px-5 py-1.5 rounded-xl border border-purple-100">
                                {keypadValue}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
                            {[1,2,3,4,5,6,7,8,9].map(num => (
                                <button key={num} onClick={() => handleKeypadPress(String(num))} className="py-3 md:py-4 bg-white rounded-xl shadow-sm border border-slate-200 text-xl md:text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">
                                    {num}
                                </button>
                            ))}
                            <button onClick={() => handleKeypadPress('CLR')} className="py-3 md:py-4 bg-rose-50 rounded-xl border border-rose-100 text-xs font-black text-rose-600 uppercase tracking-widest active:scale-95 transition-all">Clear</button>
                            <button onClick={() => handleKeypadPress('0')} className="py-3 md:py-4 bg-white rounded-xl shadow-sm border border-slate-200 text-xl md:text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">0</button>
                            <button onClick={() => handleKeypadPress('DEL')} className="py-3 md:py-4 bg-slate-100 rounded-xl border border-slate-200 text-xs font-black text-slate-600 uppercase tracking-widest active:scale-95 transition-all">Del</button>
                        </div>

                        <button onClick={saveKeypadValue} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all">
                            Confirm Amount
                        </button>
                    </div>
                </div>
            )}

            {/* --- LINEN SPECIFIC GUIDE MODAL --- */}
            {showGuideModal && (
                <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 shrink-0 shadow-inner">
                            <Layers size={24} />
                        </div>
                        <h3 className="text-lg md:text-xl font-black text-slate-800 mb-4 tracking-tight text-center shrink-0">
                            Linen Counting Guide
                        </h3>
                        
                        <div className="text-xs md:text-sm text-slate-600 font-medium mb-6 space-y-4 bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-100 overflow-y-auto custom-scrollbar flex-1">
                            <div className="text-left">
                                <p className="font-black text-slate-800 mb-2">🇬🇧 English:</p>
                                <div className="space-y-3">
                                    <p>1. Count the exact number of clean linen items physically present in your location.</p>
                                    <p>2. If an item is completely missing, leave it as <b className="text-slate-800 text-sm">'0'</b>.</p>
                                    <p>3. Do not count soiled items waiting for pickup (unless you are in Laundry tracking Used/New).</p>
                                    <p>4. Double-check all quantities before submitting.</p>
                                </div>
                            </div>
                            <div className="border-t border-slate-200 pt-4" dir="rtl">
                                <p className="text-slate-800 mb-3 font-bold" style={{ fontFamily: 'Faruma, sans-serif' }}>🇲🇻 ދިވެހި:</p>
                                <div className="space-y-3 leading-loose text-justify" style={{ fontFamily: 'Faruma, sans-serif' }}>
                                    <p>1. ވިލާ އަދި ޕޭންޓްރީގައި ހުރި ސާފު ލިނެން އަދި އިންވެންޓްރީގައި ހިމެނޭ އެހެނިހެން އެއްޗެތީގެ ސީދާ އަދަދު ގުނާށެވެ</p>
                                    <p>2. އިންވެންޓްރީގައި ހިމެނޭ އެއްޗެއް ނެއްނަމަ <span className="font-bold text-slate-800 text-base">'0'</span> ޖަހާށެވެ.</p>
                                    <p>3. ލިނެން ބާސްކެޓްގައި ހަޑިވެފައި ހުރި ނުވަތަ މިއަދު ލޯންޑްރީއަށް ފޮނުވަން ހުރި އެއްޗެހި ނުގުނާށެވެ.</p>
                                    <p>4. އިންވެންޓްރީ ސަބްމިޓް ކުރުމުގެ ކުރިން އަދަދުތައް ސައްޚަތޯ ޗެކް ކޮށްލާށެވެ. އިތުރު މައްސަލައެއް އުޅޭނަމަ އަލުން ސަބްމިޓް ކުރުމަށްފަހުވެސް އުނިއިތުރު ގެނެވޭނެއެވެ.</p>
                                </div>
                            </div>
                        </div>

                        <button onClick={closeGuide} className="w-full py-4 text-white bg-[#6D2158] rounded-xl font-black uppercase tracking-wider text-xs shadow-lg shadow-purple-900/20 active:scale-95 transition-all shrink-0 flex items-center justify-center gap-2">
                            I Understand
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
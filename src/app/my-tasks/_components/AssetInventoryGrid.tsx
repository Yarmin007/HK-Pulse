"use client";
import React, { useState } from 'react';
import { PackageSearch, CheckCircle2, Search, X, MapPin, Wine, Minus, Plus, Loader2, Save, Info } from 'lucide-react';
import type { UniversalTask, MasterItem } from '../page';

interface AssetInventoryGridProps {
    step: 2 | 3;
    // Step 2 specific
    universalTasks?: Record<string, UniversalTask[]>;
    startAudit?: (v: string, taskType: string, scheduleId: string) => void;
    // Step 3 specific
    searchQuery?: string;
    setSearchQuery?: (q: string) => void;
    locationFilters?: string[];
    activeLocation?: string;
    setActiveLocation?: (l: string) => void;
    displayCatalog?: MasterItem[];
    counts?: Record<string, number>;
    updateCount?: (artNo: string, delta: number) => void;
    requestSaveInventory?: () => void;
    isSaving?: boolean;
    activeTaskType?: string;
}

export default function AssetInventoryGrid({
    step, universalTasks, startAudit, searchQuery, setSearchQuery, locationFilters, 
    activeLocation, setActiveLocation, displayCatalog, counts, 
    updateCount, requestSaveInventory, isSaving, activeTaskType
}: AssetInventoryGridProps) {

    // Local State for this specific grid
    const [keypadTarget, setKeypadTarget] = useState<string | null>(null);
    const [keypadValue, setKeypadValue] = useState<string>('');
    const [showGuideModal, setShowGuideModal] = useState(false);

    // Keypad Logic
    const openKeypad = (article_number: string) => {
        setKeypadTarget(article_number);
        setKeypadValue(String(counts?.[article_number] || 0));
    };

    const handleKeypadPress = (val: string) => {
        if (val === 'DEL') setKeypadValue(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
        else if (val === 'CLR') setKeypadValue('0');
        else setKeypadValue(prev => prev === '0' ? val : prev + val);
    };

    const saveKeypadValue = () => {
        if (keypadTarget && updateCount && counts) {
            const num = parseInt(keypadValue, 10);
            updateCount(keypadTarget, isNaN(num) ? -counts[keypadTarget] : num - (counts[keypadTarget] || 0));
        }
        setKeypadTarget(null);
    };

    if (step === 2) {
        return (
            <>
                {Object.entries(universalTasks || {})
                    .filter(([taskType]) => taskType !== 'Legacy Minibar') // HIDE MINIBAR FROM BOTTOM GRID
                    .map(([taskType, assignments]) => {
                    return (
                        <div key={taskType} className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                                        <PackageSearch size={18} className="text-[#6D2158]"/> {taskType} Count
                                    </h3>
                                    <p className="text-[10px] md:text-xs text-slate-400 font-medium">Tap a location to begin auditing.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                {assignments.map(task => {
                                    const isDone = task.status === 'Submitted';
                                    return (
                                        <button 
                                            key={task.villa_number}
                                            onClick={() => startAudit?.(task.villa_number, taskType, task.schedule_id)}
                                            className={`aspect-square rounded-2xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${isDone ? 'bg-emerald-50 border-emerald-400 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#6D2158] hover:shadow-md'}`}
                                        >
                                            {isDone && <CheckCircle2 size={14} className="absolute top-2 right-2 text-emerald-500"/>}
                                            <span className={`font-black ${task.villa_number.includes('-') ? 'text-xl' : 'text-2xl md:text-3xl'}`}>{task.villa_number}</span>
                                            <span className="text-[9px] md:text-[10px] font-bold uppercase mt-1 opacity-60">{isDone ? 'Done' : 'Pending'}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )
                })}
            </>
        );
    }

    if (step === 3 && setSearchQuery && setActiveLocation && displayCatalog && counts && updateCount && requestSaveInventory) {
        const catalogToDisplay = displayCatalog || [];

        return (
            <>
                <div className="flex justify-between items-center mb-4">
                    {/* SEARCH BAR */}
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-4 top-3 text-slate-400" size={16}/>
                        <input 
                            type="text" 
                            placeholder="Search items..." 
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
                        <div className="col-span-full py-10 text-center text-slate-400 font-bold">No items found.</div>
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

                {/* --- CUSTOM KEYPAD OVERLAY --- */}
                {keypadTarget && (
                    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
                        <div className="absolute inset-0" onClick={saveKeypadValue}></div>
                        <div className="bg-[#FDFBFD] w-full rounded-t-[2rem] p-5 md:p-6 pb-safe shadow-2xl animate-in slide-in-from-bottom-8 relative z-10 max-w-md mx-auto">
                            
                            <div className="flex justify-between items-center mb-5">
                                <div>
                                    <h4 className="font-black text-slate-800 text-base">Direct Input</h4>
                                    <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                        {displayCatalog.find(c => c.article_number === keypadTarget)?.generic_name || 'Item'}
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

                {/* --- ASSET INVENTORY SPECIFIC GUIDE MODAL --- */}
                {showGuideModal && (
                    <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                            <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 shrink-0 shadow-inner">
                                <Info size={24} />
                            </div>
                            <h3 className="text-lg md:text-xl font-black text-slate-800 mb-4 tracking-tight text-center shrink-0">
                                How to count / <span style={{ fontFamily: 'Faruma, sans-serif', fontWeight: 'normal' }}>ގުނާނެ ގޮތް</span>
                            </h3>
                            
                            <div className="text-xs md:text-sm text-slate-600 font-medium mb-6 space-y-4 bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-100 overflow-y-auto custom-scrollbar flex-1">
                                <div className="text-left">
                                    <p className="font-black text-slate-800 mb-2">🇬🇧 English:</p>
                                    <div className="space-y-3">
                                        <p>1. This is an inventory count. You must count exactly what is physically present. If there is 1 item, enter <b className="text-slate-800 text-sm">'1'</b>. If it is missing or empty, enter <b className="text-slate-800 text-sm">'0'</b>.</p>
                                        <p>2. Use the <b className="text-slate-800 text-sm">Location Tabs</b> at the top (e.g. Wardrobe, Bathroom) to check items room-by-room so nothing is missed.</p>
                                        <p>3. Tap the <b className="text-[#6D2158] text-sm">large number</b> to open the fast keypad, or use the <b className="text-slate-800 text-sm">+/-</b> buttons to adjust the count.</p>
                                        <p>4. Make sure you have checked every location before tapping <b className="text-[#6D2158] text-sm">Submit Audit</b>.</p>
                                    </div>
                                </div>
                                <div className="border-t border-slate-200 pt-4" dir="rtl">
                                    <p className="text-slate-800 mb-3 font-bold" style={{ fontFamily: 'Faruma, sans-serif' }}>🇲🇻 ދިވެހި:</p>
                                    <div className="space-y-3 leading-loose text-justify" style={{ fontFamily: 'Faruma, sans-serif' }}>
                                        <p>1. މިއީ އެސެޓް އިންވެންޓުރީއެވެ. ހުރިހާ އެންމެންވެސް އިންވެންޓްރީގައި ޖަހާނީ އެވަގުތު އެތަނުގައި ހުރި ތަކެތީގެ ސީދާ އަދަދެވެ. އެއްޗެއް ހުރިނަމަ <span className="font-bold text-slate-800 text-base">'1'</span>  ނުވަތަ އެހުރި އަދަދެއް ޖަހާށެވެ. އަދި އެއްޗެއް  ހުސްވެފައިވާނަމަ <span className="font-bold text-slate-800 text-base">'0'</span> ޖަހާށެވެ.</p>
                                        <p>2. އިންވެންޓްރީ ނެގުމަށް ފަސޭހަ ކުރުމަށްޓަކައި، މަތީގައިވާ <span className="font-bold text-slate-800 text-base">Location Tabs</span> (މިސާލަކަށް: ވެނިޓީ އޭރިއާ) ބޭނުންކޮށްގެން ލޮކޭޝަންތައް ވަކިވަކިން ބަލައި ފާސްކުރާށެވެ.</p>
                                        <p>3. ކީޕޭޑް ބޭނުންކޮށްގެން އަވަހަށް ނަންބަރު ޖެހުމަށްޓަކައި ބޮޑުކޮށް ފެންނަ <span className="font-bold text-[#6D2158] text-base">ނަންބަރަށް</span> ފިއްތާލާށެވެ. ނުވަތަ <span className="font-bold text-slate-800 text-base">+/-</span> ބަޓަން ބޭނުންކޮށްގެން އަދަދުތަކަށް ބަދަލު ގެންނާށެވެ.</p>
                                        <p>4. <span className="font-bold text-[#6D2158] text-base">'ސަބްމިޓް އޮޑިޓް'</span> އަށް ފިއްތުމުގެ ކުރިން، ހުރިހާ ތަންތަނެއް ބަލައި ފާސްކުރެވުނުކަން ޔަގީންކުރާށެވެ.</p>
                                    </div>
                                </div>
                            </div>

                            <button onClick={() => setShowGuideModal(false)} className="w-full py-4 text-white bg-[#6D2158] rounded-xl font-black uppercase tracking-wider text-xs shadow-lg shadow-purple-900/20 active:scale-95 transition-all shrink-0 flex items-center justify-center gap-2">
                                I Understand <span className="opacity-50">/</span> <span style={{ fontFamily: 'Faruma, sans-serif', fontWeight: 'normal', fontSize: '14px' }} className="mt-1">ވިސްނިއްޖެ</span>
                            </button>
                        </div>
                    </div>
                )}
            </>
        );
    }

    return null;
}
"use client";
import React from 'react';
import { User, Clock, Wind, Wine, CheckSquare, CheckCircle2, DoorClosed, X, Play, BedDouble, AlertTriangle, PackageSearch } from 'lucide-react';

export type UniversalTask = { schedule_id: string; inventory_type: string; villa_number: string; status: string; };
export type CleaningTask = { villa_number: string; status: 'Pending' | 'In Progress' | 'Completed' | 'DND' | 'Refused'; start_time?: string; raw_start_time?: string; end_time?: string; time_spent?: string; reenter_reason?: string; morning_time: number; night_time: number; has_morning_completed: boolean; has_night_completed: boolean; };

interface RoomCleaningGridProps {
    displayVillas: string[];
    myCleaningVillas: string[];
    cleaningTasks: Record<string, CleaningTask>;
    activeCleaningVilla: string | null;
    getVillaCardData: (v: string) => { status: string; headerColor: string; timeStr: string; guestName: string; acStatus: string; cleaningType: string; };
    handleAcStatusChange: (v: string, status: string) => void;
    startAudit: (v: string, taskType: string, scheduleId: string) => void;
    handleFinishRoom: (v: string) => void;
    setReenterModal: (val: { isOpen: boolean, villa: string }) => void;
    handleDND: (v: string) => void;
    handleRefused: (v: string) => void;
    resetRoomStatus: (v: string) => void;
    isNightShift: boolean;
    universalTasks: Record<string, UniversalTask[]>;
    cleaningElapsedSeconds: number;
    formatTimer: (s: number) => string;
    expiryAssignedVillas: string[];
    expiryVillaData: Record<string, any>;
    startExpiryAudit: (v: string) => void;
}

export default function RoomCleaningGrid({
    displayVillas, myCleaningVillas, cleaningTasks, activeCleaningVilla, getVillaCardData, handleAcStatusChange,
    startAudit, handleFinishRoom, setReenterModal, handleDND, handleRefused, resetRoomStatus,
    isNightShift, universalTasks, cleaningElapsedSeconds, formatTimer, expiryAssignedVillas, expiryVillaData, startExpiryAudit
}: RoomCleaningGridProps) {

    if (!displayVillas || displayVillas.length === 0) return null;

    return (
        <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                        <BedDouble size={20} className="text-[#6D2158]" /> My Villa Tasks
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">All assigned cleaning and audit locations.</p>
                </div>
                <div className="text-right">
                    <span className="text-2xl font-black text-[#6D2158]">
                        {displayVillas.length}
                    </span>
                    <span className="text-sm font-bold text-slate-300"> Total Villas</span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayVillas.map(v => {
                    const isCleaningAssigned = myCleaningVillas.includes(v);
                    const hasExpiry = expiryAssignedVillas.includes(v);
                    const cardData = getVillaCardData(v);
                    const displayType = isCleaningAssigned ? cardData.cleaningType : 'Audit Only';

                    // Cleaning State
                    const taskState = cleaningTasks[v] || { status: 'Pending', morning_time: 0, night_time: 0, has_morning_completed: false, has_night_completed: false };
                    const isActive = v === activeCleaningVilla;
                    const isCompleted = taskState.status === 'Completed';
                    const isDND = taskState.status === 'DND';
                    const isRefused = taskState.status === 'Refused';

                    // Expiry State
                    const expData = expiryVillaData[v];
                    const isExpDone = expData?.status === 'All OK' || expData?.status === 'Refilled';
                    const isExpSent = expData?.status === 'Sent';
                    const isExpNeedsRefill = expData?.status === 'Removed';
                    const expStatusLabel = isExpDone ? 'Expiry Done' : isExpSent ? 'Dispatched' : isExpNeedsRefill ? 'Refill Task' : 'Check Expiry';

                    // Inventory Tasks
                    const minibarTasksForVilla = universalTasks['Legacy Minibar']?.filter(t => t.villa_number === v || t.villa_number === `${v}-1` || t.villa_number === `${v}-2`) || [];
                    const otherInventoryTasks = Object.entries(universalTasks)
                        .filter(([key]) => key !== 'Legacy Minibar')
                        .flatMap(([key, tasks]) => tasks.filter(t => t.villa_number === v || t.villa_number === `${v}-1` || t.villa_number === `${v}-2`).map(t => ({...t, taskType: key})));

                    let cardStyle = "bg-white border-slate-200";
                    if (isActive) cardStyle = "bg-emerald-50/50 border-emerald-400 ring-4 ring-emerald-500/10";
                    else if (isCleaningAssigned && isCompleted) cardStyle = "bg-slate-50 border-slate-200 opacity-60";
                    else if (isCleaningAssigned && (isDND || isRefused)) cardStyle = "bg-rose-50 border-rose-200";
                    else if (!isCleaningAssigned) cardStyle = "bg-slate-50 border-dashed border-slate-300";

                    return (
                        <div key={v} className={`p-4 md:p-5 rounded-2xl border-2 shadow-sm transition-all duration-300 flex flex-col ${cardStyle}`}>
                            
                            {/* Card Header */}
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className={`text-2xl md:text-3xl font-black tracking-tighter ${isCompleted && isCleaningAssigned ? 'text-slate-400' : 'text-[#6D2158]'}`}>
                                            {v}
                                        </h3>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                        <User size={10}/> {cardData.guestName || 'No Guest Info'}
                                    </p>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                    <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-white shadow-sm ${!isCleaningAssigned ? 'bg-slate-500' : cardData.headerColor.replace('bg-', 'bg-').replace('text-', 'text-')}`}>
                                        {displayType}
                                    </div>
                                    {cardData.timeStr && isCleaningAssigned && (
                                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                            <Clock size={10} className="text-slate-400"/>
                                            <span>{cardData.timeStr}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ACTION AREA */}
                            <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                                
                                {/* Utilities Row: AC, Minibar, Expiry, Asset Inventory */}
                                <div className="flex flex-wrap gap-2">
                                    <button 
                                        onClick={() => handleAcStatusChange(v, cardData.acStatus === 'ON' ? 'OFF' : 'ON')}
                                        className={`flex-1 min-w-[100px] py-2 rounded-xl flex items-center justify-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                                            cardData.acStatus === 'ON' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-500 border-emerald-600 text-white'
                                        }`}
                                    >
                                        <Wind size={12} className={`shrink-0 ${cardData.acStatus === 'ON' ? 'animate-pulse' : ''}`}/>
                                        {cardData.acStatus === 'ON' ? 'Turn AC OFF' : 'Turn AC ON'}
                                    </button>

                                    {/* MINIBAR */}
                                    {minibarTasksForVilla.map(mbTask => {
                                        const isMbDone = mbTask.status === 'Submitted';
                                        const mbLabel = mbTask.villa_number.includes('-') ? `MB ${mbTask.villa_number.split('-')[1]}` : 'Minibar';
                                        return (
                                            <button 
                                                key={`mb-${mbTask.villa_number}`}
                                                onClick={() => startAudit(mbTask.villa_number, 'Legacy Minibar', 'legacy_minibar')}
                                                className={`flex-1 min-w-[100px] py-2 rounded-xl flex items-center justify-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                                                    isMbDone ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-purple-50 border-purple-200 text-[#6D2158]'
                                                }`}
                                            >
                                                <Wine size={12} className="shrink-0" />
                                                <span className="truncate">{isMbDone ? `${mbLabel} Done` : `Count ${mbLabel}`}</span>
                                            </button>
                                        );
                                    })}

                                    {/* EXPIRY */}
                                    {hasExpiry && (
                                        <button
                                            onClick={() => startExpiryAudit(v)}
                                            className={`flex-1 min-w-[100px] py-2 rounded-xl flex items-center justify-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                                                isExpDone ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 
                                                isExpSent ? 'bg-indigo-50 border-indigo-200 text-indigo-700 animate-pulse' : 
                                                isExpNeedsRefill ? 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse' : 
                                                'bg-rose-50 border-rose-200 text-rose-700'
                                            }`}
                                        >
                                            <AlertTriangle size={12} className="shrink-0" />
                                            <span className="truncate">{expStatusLabel}</span>
                                        </button>
                                    )}

                                    {/* OTHER INVENTORY (ASSETS) */}
                                    {otherInventoryTasks.map(invTask => {
                                        const isInvDone = invTask.status === 'Submitted';
                                        return (
                                            <button
                                                key={invTask.schedule_id}
                                                onClick={() => startAudit(invTask.villa_number, invTask.taskType, invTask.schedule_id)}
                                                className={`flex-1 min-w-[100px] py-2 rounded-xl flex items-center justify-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                                                    isInvDone ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-700'
                                                }`}
                                            >
                                                <PackageSearch size={12} className="shrink-0" />
                                                <span className="truncate">{isInvDone ? `${invTask.taskType} Done` : `Count ${invTask.taskType}`}</span>
                                            </button>
                                        )
                                    })}
                                </div>

                                {/* Room Cleaning Controls (Only show if actually assigned to clean) */}
                                {isCleaningAssigned ? (
                                    isActive ? (
                                        <div className="flex justify-between items-center bg-white border border-emerald-200 rounded-xl p-1.5 shadow-sm flex-wrap gap-2 mt-1">
                                            <div className="flex items-center gap-2 text-[#6D2158] font-black text-sm px-2">
                                                <span className="relative flex h-2 w-2 mr-1">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                </span>
                                                {formatTimer(cleaningElapsedSeconds)}
                                            </div>
                                            {taskState.reenter_reason && (
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] uppercase font-black tracking-widest shrink-0">
                                                    {taskState.reenter_reason}
                                                </span>
                                            )}
                                            <button 
                                                onClick={() => handleFinishRoom(v)}
                                                className="bg-emerald-500 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm active:scale-95 flex items-center gap-1 ml-auto"
                                            >
                                                <CheckSquare size={14}/> Finish
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2 mt-1">
                                            {taskState.has_morning_completed && (
                                                <div className="flex items-center justify-between text-emerald-600 font-black uppercase tracking-widest text-[10px] md:text-xs py-2 bg-emerald-50 px-3 rounded-xl border border-emerald-100 opacity-80">
                                                    <span className="flex items-center gap-1.5"><CheckCircle2 size={14}/> Morning ({taskState.morning_time}m)</span>
                                                    <button onClick={() => resetRoomStatus(v)} className="text-emerald-700 hover:text-emerald-900 text-[9px] bg-emerald-100/50 px-2 py-0.5 rounded shadow-sm">Undo</button>
                                                </div>
                                            )}
                                            {taskState.has_night_completed && (
                                                <div className="flex items-center justify-between text-indigo-600 font-black uppercase tracking-widest text-[10px] md:text-xs py-2 bg-indigo-50 px-3 rounded-xl border border-indigo-100 opacity-80">
                                                    <span className="flex items-center gap-1.5"><CheckCircle2 size={14}/> TD Service ({taskState.night_time}m)</span>
                                                    <button onClick={() => resetRoomStatus(v)} className="text-indigo-700 hover:text-indigo-900 text-[9px] bg-indigo-100/50 px-2 py-0.5 rounded shadow-sm">Undo</button>
                                                </div>
                                            )}
                                            
                                            {(isDND || isRefused) && (
                                                <div className={`flex items-center justify-between font-black uppercase tracking-widest text-[10px] md:text-xs py-2 px-1 ${isDND ? 'text-rose-600' : 'text-orange-600'}`}>
                                                    <span className="flex items-center gap-1.5">
                                                        {isDND ? <DoorClosed size={14}/> : <X size={14}/>} 
                                                        {isDND ? 'DND Logged' : 'Service Refused'}
                                                    </span>
                                                    <button onClick={() => resetRoomStatus(v)} className="text-slate-400 hover:text-slate-600 underline text-[9px] md:text-[10px] bg-slate-100 px-2 py-0.5 rounded">Undo</button>
                                                </div>
                                            )}

                                            {/* ⚡ ALLOW ADDING MORE SERVICES EVEN IF COMPLETED */}
                                            <button 
                                                onClick={() => setReenterModal({ isOpen: true, villa: v })}
                                                disabled={!!activeCleaningVilla}
                                                className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                                                    activeCleaningVilla 
                                                    ? 'bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed' 
                                                    : 'bg-[#6D2158] text-white hover:bg-[#5a1b49] active:scale-95'
                                                }`}
                                            >
                                                <Play size={14}/> {isCompleted ? 'Add Service' : 'Start Service'}
                                            </button>

                                            {!isCompleted && (
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleDND(v)}
                                                        disabled={!!activeCleaningVilla}
                                                        className="flex-1 py-2.5 rounded-xl bg-rose-50 text-rose-600 font-black uppercase tracking-widest text-[9px] md:text-[10px] border border-rose-100 flex items-center justify-center gap-1 hover:bg-rose-100 transition-all active:scale-95 disabled:opacity-50"
                                                    >
                                                        <DoorClosed size={12}/> DND
                                                    </button>
                                                    
                                                    <button 
                                                        onClick={() => handleRefused(v)}
                                                        disabled={!!activeCleaningVilla}
                                                        className="flex-1 py-2.5 rounded-xl bg-orange-50 text-orange-600 font-black uppercase tracking-widest text-[9px] md:text-[10px] border border-orange-100 flex items-center justify-center gap-1 hover:bg-orange-100 transition-all active:scale-95 disabled:opacity-50"
                                                    >
                                                        <X size={12}/> Refused
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                ) : (
                                    <div className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 rounded-xl mt-1">
                                        Audit Only Location
                                    </div>
                                )}
                            </div>

                        </div>
                    );
                })}
            </div>
        </div>
    );
}
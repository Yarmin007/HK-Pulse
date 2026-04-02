"use client";
import React from 'react';
import { User, Clock, Wind, Wine, CheckSquare, CheckCircle2, DoorClosed, X, Play, BedDouble } from 'lucide-react';
import type { CleaningTask, UniversalTask } from '../page';

interface RoomCleaningGridProps {
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
}

export default function RoomCleaningGrid({
    myCleaningVillas, cleaningTasks, activeCleaningVilla, getVillaCardData, handleAcStatusChange,
    startAudit, handleFinishRoom, setReenterModal, handleDND, handleRefused, resetRoomStatus,
    isNightShift, universalTasks, cleaningElapsedSeconds, formatTimer
}: RoomCleaningGridProps) {

    if (!myCleaningVillas || myCleaningVillas.length === 0) return null;

    return (
        <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                        <BedDouble size={20} className="text-[#6D2158]" /> Room Service
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">Your assigned villas for today.</p>
                </div>
                <div className="text-right">
                    <span className="text-2xl font-black text-[#6D2158]">
                        {Object.values(cleaningTasks).filter(t => t.status === 'Completed').length}
                    </span>
                    <span className="text-sm font-bold text-slate-300">/{myCleaningVillas.length}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {myCleaningVillas.map(v => {
                    const cardData = getVillaCardData(v);
                    const taskState = cleaningTasks[v] || { status: 'Pending', morning_time: 0, night_time: 0, has_morning_completed: false, has_night_completed: false };
                    const isActive = v === activeCleaningVilla;
                    const isCompleted = taskState.status === 'Completed';
                    const isDND = taskState.status === 'DND';
                    const isRefused = taskState.status === 'Refused';
                    
                    const minibarTasksForVilla = universalTasks['Legacy Minibar']?.filter(t => t.villa_number === v || t.villa_number === `${v}-1` || t.villa_number === `${v}-2`) || [];

                    let cardStyle = "bg-white border-slate-200";
                    if (isActive) cardStyle = "bg-emerald-50/50 border-emerald-400 ring-4 ring-emerald-500/10";
                    if (isCompleted) cardStyle = "bg-slate-50 border-slate-200 opacity-60";
                    if (isDND || isRefused) cardStyle = "bg-rose-50 border-rose-200";

                    return (
                        <div key={v} className={`p-4 md:p-5 rounded-2xl border-2 shadow-sm transition-all duration-300 flex flex-col ${cardStyle}`}>
                            
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className={`text-2xl md:text-3xl font-black tracking-tighter ${isCompleted ? 'text-slate-400' : 'text-[#6D2158]'}`}>
                                    {v}
                                    </h3>
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                    <User size={10}/> {cardData.guestName || 'No Guest Info'}
                                </p>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                    <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-white shadow-sm ${cardData.headerColor.replace('bg-', 'bg-').replace('text-', 'text-')}`}>
                                    {cardData.cleaningType}
                                    </div>
                                    {cardData.timeStr && (
                                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                            <Clock size={10} className="text-slate-400"/>
                                            <span>{cardData.timeStr}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ACTION AREA */}
                            <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                                
                                {/* Utilities Row: AC & Minibar */}
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleAcStatusChange(v, cardData.acStatus === 'ON' ? 'OFF' : 'ON')}
                                        className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-2 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border shadow-sm ${
                                            cardData.acStatus === 'ON' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-500 border-emerald-600 text-white'
                                        }`}
                                    >
                                        <Wind size={12} className={`shrink-0 ${cardData.acStatus === 'ON' ? 'animate-pulse' : ''}`}/>
                                        {cardData.acStatus === 'ON' ? 'Turn AC OFF' : 'Turn AC ON'}
                                    </button>

                                    {minibarTasksForVilla.map(mbTask => {
                                        const isMbDone = mbTask.status === 'Submitted';
                                        const mbLabel = mbTask.villa_number.includes('-') ? `MB ${mbTask.villa_number.split('-')[1]}` : 'Minibar';
                                        return (
                                            <button 
                                                key={`mb-${mbTask.villa_number}`}
                                                onClick={() => startAudit(mbTask.villa_number, 'Legacy Minibar', 'legacy_minibar')}
                                                className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 md:gap-2 text-[9px] md:text-xs font-black uppercase tracking-wider transition-all border shadow-sm ${
                                                    isMbDone ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-purple-50 border-purple-200 text-[#6D2158]'
                                                }`}
                                            >
                                                <Wine size={12} className="shrink-0" />
                                                <span className="truncate">{isMbDone ? `${mbLabel} Done` : `Count ${mbLabel}`}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {isActive ? (
                                    <div className="flex justify-between items-center bg-white border border-emerald-200 rounded-xl p-1.5 shadow-sm flex-wrap gap-2">
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
                                    <div className="flex flex-col gap-2">
                                    {taskState.has_morning_completed && (
                                        <div className="flex items-center justify-between text-emerald-600 font-black uppercase tracking-widest text-[10px] md:text-xs py-2 bg-emerald-50 px-3 rounded-xl border border-emerald-100">
                                            <span className="flex items-center gap-1.5"><CheckCircle2 size={14}/> Morning Cleaned</span>
                                            <span>{taskState.morning_time}m</span>
                                        </div>
                                    )}
                                    {taskState.has_night_completed && (
                                        <div className="flex items-center justify-between text-indigo-600 font-black uppercase tracking-widest text-[10px] md:text-xs py-2 bg-indigo-50 px-3 rounded-xl border border-indigo-100">
                                            <span className="flex items-center gap-1.5"><CheckCircle2 size={14}/> Evening Cleaned</span>
                                            <span>{taskState.night_time}m</span>
                                        </div>
                                    )}
                                    
                                    {(isDND || isRefused) && (
                                        <div className={`flex items-center justify-between font-black uppercase tracking-widest text-[10px] md:text-xs py-2 px-1 ${isDND ? 'text-rose-600' : 'text-orange-600'}`}>
                                            <span className="flex items-center gap-1.5">
                                            {isDND ? <DoorClosed size={14}/> : <X size={14}/>} 
                                            {isDND ? 'DND Logged' : 'Service Refused'}
                                            </span>
                                            <button onClick={() => resetRoomStatus(v)} className="text-slate-400 hover:text-slate-600 underline text-[9px] md:text-[10px]">Undo</button>
                                        </div>
                                    )}

                                    {/* Hide start button only if CURRENT shift is completed */}
                                    {!isCompleted && (
                                        <button 
                                            onClick={() => setReenterModal({ isOpen: true, villa: v })}
                                            disabled={!!activeCleaningVilla}
                                            className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                                                activeCleaningVilla 
                                                ? 'bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed' 
                                                : 'bg-[#6D2158] text-white hover:bg-[#5a1b49] active:scale-95'
                                            }`}
                                        >
                                            <Play size={14}/> {isNightShift ? 'Start Evening Service' : 'Start Morning Service'}
                                        </button>
                                    )}

                                    {!isCompleted && (
                                        <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleDND(v)}
                                            disabled={!!activeCleaningVilla}
                                            className="flex-1 py-2.5 rounded-xl bg-rose-50 text-rose-600 font-black uppercase tracking-widest text-[9px] md:text-[10px] border border-rose-100 flex items-center justify-center gap-1 hover:bg-rose-100 transition-all active:scale-95 disabled:opacity-50"
                                            title="Do Not Disturb"
                                        >
                                            <DoorClosed size={12}/> DND
                                        </button>
                                        
                                        <button 
                                            onClick={() => handleRefused(v)}
                                            disabled={!!activeCleaningVilla}
                                            className="flex-1 py-2.5 rounded-xl bg-orange-50 text-orange-600 font-black uppercase tracking-widest text-[9px] md:text-[10px] border border-orange-100 flex items-center justify-center gap-1 hover:bg-orange-100 transition-all active:scale-95 disabled:opacity-50"
                                            title="Service Refused by Guest"
                                        >
                                            <X size={12}/> Refused
                                        </button>
                                        </div>
                                    )}
                                    </div>
                                )}
                            </div>

                        </div>
                    )
                })}
            </div>
        </div>
    );
}
import React from 'react';
import { User, Clock, Wine, BedDouble, AlertTriangle, PackageSearch, Layers, Building, WashingMachine, Droplet } from 'lucide-react';

export type UniversalTask = { schedule_id: string; inventory_type: string; villa_number: string; status: string; };
export type CleaningTask = { villa_number: string; status: 'Pending' | 'In Progress' | 'Completed' | 'DND' | 'Refused'; start_time?: string; raw_start_time?: string; end_time?: string; time_spent?: string; reenter_reason?: string; session_history: any[]; };

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
    confirmResetRoom: (v: string, serviceName: string) => void;
    openEditModal: (v: string, type: string) => void;
    isNightShift: boolean;
    universalTasks: Record<string, UniversalTask[]>;
    cleaningElapsedSeconds: number;
    formatTimer: (s: number) => string;
    expiryAssignedVillas: string[];
    expiryVillaData: Record<string, any>;
    startExpiryAudit: (v: string) => void;
    
    // NEW LINEN PROPS
    linenAssignments: any[];
    startLinenAudit: (taskObj: any) => void;

    // NEW BOTTLE PROPS
    bottleAssignments: any[];
    startBottleAudit: (taskObj: any) => void;

    // Daily task list per villa (requests, ice, milk, preferences) and its progress
    renderVillaTasks?: (v: string) => React.ReactNode;
    villaProgress?: (v: string) => { done: number; total: number };
}

export default function RoomCleaningGrid({
    displayVillas, myCleaningVillas, cleaningTasks, activeCleaningVilla, getVillaCardData, handleAcStatusChange,
    startAudit, handleFinishRoom, setReenterModal, handleDND, handleRefused, confirmResetRoom, openEditModal,
    isNightShift, universalTasks, cleaningElapsedSeconds, formatTimer, expiryAssignedVillas, expiryVillaData, startExpiryAudit,
    linenAssignments, startLinenAudit,
    bottleAssignments, startBottleAudit, renderVillaTasks, villaProgress
}: RoomCleaningGridProps) {

    // Separate Non-Villa Tasks (Pantries, Laundry, Water Room, Outlets, PA) from Villa Tasks
    const nonVillaLinenTasks = linenAssignments.filter(a => a.location_type !== 'Villa');
    const nonVillaBottleTasks = bottleAssignments.filter(a => a.location_type !== 'Villa');

    if (displayVillas.length === 0 && nonVillaLinenTasks.length === 0 && nonVillaBottleTasks.length === 0) return null;

    return (
        <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                        <BedDouble size={20} className="text-[#6D2158]" /> My Active Tasks
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">Requests, ice, milk and guest preferences for your villas today. Tap to tick done.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                
                {/* RENDER NON-VILLA LINEN TASKS FIRST (Pantry, Laundry, PA) */}
                {nonVillaLinenTasks.map(task => {
                    const isDone = task.is_submitted;
                    let Icon = Layers;
                    if (task.location_type === 'PA') Icon = Building;
                    if (task.location_type === 'Laundry') Icon = WashingMachine;

                    return (
                        <div key={task.id} className={`p-4 md:p-5 rounded-2xl border-2 shadow-sm transition-all duration-300 flex flex-col ${isDone ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-blue-200'}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className={`text-xl md:text-2xl font-black tracking-tighter ${isDone ? 'text-slate-400' : 'text-blue-600'}`}>
                                            {task.location_name}
                                        </h3>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                        <Icon size={10}/> {task.location_type} Inventory
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-white shadow-sm bg-blue-500">
                                        Linen Task
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                                <button 
                                    onClick={() => startLinenAudit(task)}
                                    className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border shadow-sm ${
                                        isDone ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                                    }`}
                                >
                                    <Layers size={14} className="shrink-0" />
                                    <span className="truncate">{isDone ? `Linen Counted` : `Count Linen`}</span>
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* RENDER NON-VILLA BOTTLE TASKS (Pantry, Water Room, PA, Outlets) */}
                {nonVillaBottleTasks.map(task => {
                    const isDone = task.is_submitted;

                    return (
                        <div key={task.id} className={`p-4 md:p-5 rounded-2xl border-2 shadow-sm transition-all duration-300 flex flex-col ${isDone ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-cyan-200'}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className={`text-xl md:text-2xl font-black tracking-tighter ${isDone ? 'text-slate-400' : 'text-cyan-600'}`}>
                                            {task.location_name}
                                        </h3>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                        <Droplet size={10}/> {task.location_type} Inventory
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-white shadow-sm bg-cyan-500">
                                        Bottle Task
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                                <button 
                                    onClick={() => startBottleAudit(task)}
                                    className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border shadow-sm ${
                                        isDone ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100'
                                    }`}
                                >
                                    <Droplet size={14} className="shrink-0" />
                                    <span className="truncate">{isDone ? `Bottles Counted` : `Count Bottles`}</span>
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* RENDER VILLA CARDS */}
                {displayVillas.map(v => {
                    const isCleaningAssigned = myCleaningVillas.includes(v);
                    const hasExpiry = expiryAssignedVillas.includes(v);
                    const cardData = getVillaCardData(v);
                    const displayType = isCleaningAssigned ? cardData.cleaningType : 'Audit Only';

                    // Cleaning State

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

                    // Linen & Bottle Tasks
                    const linenTaskForVilla = linenAssignments.find(a => a.location_type === 'Villa' && a.location_name === v);
                    const bottleTaskForVilla = bottleAssignments.find(a => a.location_type === 'Villa' && a.location_name === v);

                    const prog = villaProgress?.(v) || { done: 0, total: 0 };
                    const allDone = prog.total > 0 && prog.done === prog.total;
                    let cardStyle = "bg-white border-slate-200";
                    if (!isCleaningAssigned) cardStyle = "bg-slate-50 border-dashed border-slate-300";
                    else if (allDone) cardStyle = "bg-emerald-50/40 border-emerald-200";
                    else if (prog.total > 0) cardStyle = "bg-white border-[#6D2158]/30";

                    const hasAnyTasks = isCleaningAssigned || linenTaskForVilla || bottleTaskForVilla || hasExpiry || minibarTasksForVilla.length > 0 || otherInventoryTasks.length > 0;
                    
                    if (!hasAnyTasks) return null;

                    return (
                        <div key={v} className={`p-4 md:p-5 rounded-2xl border-2 shadow-sm transition-all duration-300 flex flex-col ${cardStyle}`}>
                            
                            {/* Card Header */}
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-2xl md:text-3xl font-black tracking-tighter text-[#6D2158]">
                                            {v}
                                        </h3>
                                        {isCleaningAssigned && prog.total > 0 && (
                                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${allDone ? 'bg-emerald-500 text-white' : 'bg-[#6D2158]/10 text-[#6D2158]'}`}>{prog.done}/{prog.total}</span>
                                        )}
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
                                
                                {/* Utilities Row: AC, Minibar, Expiry, Asset Inventory, LINEN, BOTTLE */}
                                <div className="flex flex-wrap gap-2">
                                    {/* LINEN VILLA TASK */}
                                    {linenTaskForVilla && (
                                        <button 
                                            onClick={() => startLinenAudit(linenTaskForVilla)}
                                            className={`flex-1 min-w-[100px] py-2 rounded-xl flex items-center justify-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                                                linenTaskForVilla.is_submitted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                                            }`}
                                        >
                                            <Layers size={12} className="shrink-0" />
                                            <span className="truncate">{linenTaskForVilla.is_submitted ? `Linen Done` : `Count Linen`}</span>
                                        </button>
                                    )}

                                    {/* BOTTLE VILLA TASK */}
                                    {bottleTaskForVilla && (
                                        <button 
                                            onClick={() => startBottleAudit(bottleTaskForVilla)}
                                            className={`flex-1 min-w-[100px] py-2 rounded-xl flex items-center justify-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                                                bottleTaskForVilla.is_submitted ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100'
                                            }`}
                                        >
                                            <Droplet size={12} className="shrink-0" />
                                            <span className="truncate">{bottleTaskForVilla.is_submitted ? `Bottle Done` : `Count Bottle`}</span>
                                        </button>
                                    )}

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

                                {/* Today's list for this villa (Start Service / timer is switched off for now) */}
                                {isCleaningAssigned ? (
                                    renderVillaTasks?.(v)
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
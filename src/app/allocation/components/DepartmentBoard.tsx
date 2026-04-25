import React, { useState } from 'react';
import { Users, UserCheck, Wand2, X, Search, Plus } from "lucide-react";
import toast from 'react-hot-toast';
import { AREAS, getDefaultArea, getShiftsForArea } from '../lib/constants';

export default function DepartmentBoard({ hosts, allocations, setAllocations, activeLeaves, setIsDirty, selectedDate, activeArea }: any) {
    const [searchQuery, setSearchQuery] = useState('');
    const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
    const [isAddHostModalOpen, setIsAddHostModalOpen] = useState(false);
    const [pastedText, setPastedText] = useState('');
    const isAdminView = activeArea === 'admin';

    const currentAreaHosts = hosts.filter((h: any) => {
        const existingAlloc = allocations.find((a: any) => String(a.host_id) === String(h.id));
        if (existingAlloc) return existingAlloc.area === activeArea;
        return getDefaultArea(h) === activeArea;
    }).sort((a: any, b: any) => {
        const idxA = allocations.findIndex((alloc: any) => String(alloc.host_id) === String(a.id));
        const idxB = allocations.findIndex((alloc: any) => String(alloc.host_id) === String(b.id));
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0; 
    });

    const handleAssign = (hostId: string) => {
        if (allocations.some((a: any) => String(a.host_id) === String(hostId))) return;
        const defaultShift = isAdminView ? 'Straight (08:00 - 17:00)' : activeArea === 'public' ? 'Morning (06:30 - 14:30)' : 'Morning';
        setAllocations([...allocations, { report_date: selectedDate, host_id: hostId, area: activeArea, shift: defaultShift, task_details: '' }]);
        setIsDirty(true);
        setIsAddHostModalOpen(false);
    };

    const handleAllocUpdate = (hostId: string, field: string, value: string) => {
        const existingIndex = allocations.findIndex((a: any) => String(a.host_id) === String(hostId));
        if (existingIndex >= 0) {
            const newAllocs = [...allocations];
            newAllocs[existingIndex] = { ...newAllocs[existingIndex], [field]: value };
            setAllocations(newAllocs);
        } else {
            const defaultShift = isAdminView ? 'Straight (08:00 - 17:00)' : activeArea === 'public' ? 'Morning (06:30 - 14:30)' : 'Morning';
            setAllocations([...allocations, { report_date: selectedDate, host_id: hostId, area: activeArea, shift: field === 'shift' ? value : defaultShift, task_details: field === 'task_details' ? value : '' }]);
        }
        setIsDirty(true);
    };

    const handleRemove = (hostId: string) => {
        setAllocations(allocations.filter((a: any) => String(a.host_id) !== String(hostId)));
        setIsDirty(true);
    };

    const handlePasteSubmit = () => {
        if (!pastedText.trim()) return;
        setIsPasteModalOpen(false);
        const lines = pastedText.split('\n');
        const newAllocs = [...allocations];
        let matchCount = 0;

        // Context Engine: Remembers the last heading it saw
        let currentShift = activeArea === 'admin' ? 'Straight (08:00 - 17:00)' : activeArea === 'public' ? 'Morning (06:30 - 14:30)' : 'Morning';

        lines.forEach((line: string) => {
            if (!line.trim()) return;
            const lineLower = line.toLowerCase();
            const upper = line.toUpperCase();

            // HEADING DETECTION (Changes the context for all names that follow, skips assigning)
            if (upper.includes('MORN')) {
                currentShift = activeArea === 'public' ? 'Morning (06:30 - 14:30)' : 'Morning';
                return; 
            } 
            else if (upper.includes('AFTERNOON')) {
                currentShift = activeArea === 'public' ? 'Afternoon (14:30 - 23:00)' : 'Afternoon';
                return;
            } 
            else if (upper.includes('BACK OF HOUSE') || upper.includes('BOH') || upper.includes('HEART OF HOUSE')) {
                currentShift = activeArea === 'public' ? 'Morning (06:30 - 14:30)' : 'Morning';
                return;
            } 
            else if (upper.match(/\bOFF\b/)) {
                currentShift = 'Off';
                return;
            } 
            else if (upper.match(/\bSICK\b/)) {
                currentShift = 'Sick Leave';
                return;
            } 
            else if (upper.includes('DEEP CLEANING') || upper.includes('SCHEDULE') || upper.includes('TOMORROW')) {
                return; // Just headings
            }

            // Clean the line of punctuation for strict word-boundary matching
            const lineClean = lineLower.replace(/[^a-z0-9 ]/g, ' ').trim();
            if (!lineClean) return;

            // STRICT HOST DETECTION
            const matchedHost = hosts.find((h: any) => {
                const nickname = (h.nicknames || '').toLowerCase().split(',')[0].trim();
                const fullParts = h.full_name.toLowerCase().split(' ').filter((p: string) => p.length >= 3);
                
                // 1. Check Exact Nickname Match
                if (nickname && nickname.length > 2 && new RegExp(`\\b${nickname}\\b`, 'i').test(lineClean)) return true;
                
                // 2. Check each 3+ letter part of their full name for an exact word match
                for (const part of fullParts) {
                    if (new RegExp(`\\b${part}\\b`, 'i').test(lineClean)) return true;
                }
                
                return false;
            });

            if (matchedHost) {
                const existingIndex = newAllocs.findIndex((a: any) => String(a.host_id) === String(matchedHost.id));
                const targetArea = existingIndex >= 0 ? newAllocs[existingIndex].area : (getDefaultArea(matchedHost) || activeArea);
                
                // Keep ONLY shift, clear task details per user request
                if (existingIndex >= 0) {
                    newAllocs[existingIndex] = { ...newAllocs[existingIndex], shift: currentShift, task_details: '', area: targetArea };
                } else {
                    newAllocs.push({ report_date: selectedDate, host_id: matchedHost.id, area: targetArea, shift: currentShift, task_details: '' });
                }
                matchCount++;
            }
        });

        setAllocations(newAllocs);
        setIsDirty(true);
        setPastedText('');
        toast.success(`AI Extracted and matched ${matchCount} hosts!`);
    };

    return (
        <div className="w-full flex flex-col gap-6 items-start">
            <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-[#6D2158]">
                            {(() => { const ActiveIcon = AREAS.find(a => a.id === activeArea)?.icon; return ActiveIcon ? <ActiveIcon size={20} /> : null; })()}
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-800">{AREAS.find(a => a.id === activeArea)?.label} Team</h2>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">{currentAreaHosts.length} Hosts Defaulted/Assigned</p>
                        </div>
                    </div>
                    
                    {/* ACTION BUTTONS */}
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsAddHostModalOpen(true)} className="flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                            <Plus size={16}/> <span className="hidden sm:inline">Add Staff</span>
                        </button>

                        {!isAdminView && (
                            <button onClick={() => setIsPasteModalOpen(true)} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                                <Wand2 size={16}/> <span className="hidden sm:inline">Smart Paste</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-4 flex-1 overflow-y-auto bg-slate-50/30 min-h-[500px]">
                    {currentAreaHosts.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 opacity-50 pt-20">
                            <UserCheck size={48} strokeWidth={1} />
                            <p className="text-sm font-bold">No hosts assigned to this area yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {currentAreaHosts.map((host: any) => {
                                const alloc = allocations.find((a: any) => String(a.host_id) === String(host.id));
                                const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
                                const shiftOptions = getShiftsForArea(activeArea);
                                
                                let returnDateStr = '';
                                const activeLeave = activeLeaves.find((l: any) => String(l.host_id) === String(host.id));
                                if (activeLeave) {
                                    const parts = activeLeave.end_date.split('-');
                                    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                                    d.setDate(d.getDate() + 1);
                                    returnDateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                                }
                                
                                return (
                                    <div key={host.id} className={`bg-white border ${alloc ? 'border-emerald-300 shadow-md' : 'border-slate-300 opacity-70'} rounded-xl p-3 flex flex-col md:flex-row gap-4 items-start md:items-center transition-all`}>
                                        <div className="flex items-center gap-3 w-full md:w-64 shrink-0">
                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 font-black ${alloc ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-300'}`}>
                                                {displayName.charAt(0)}
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-sm font-bold text-slate-800 truncate">{host.full_name}</p>
                                                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                    <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded truncate max-w-[120px] border border-slate-200">{host.sub_department || host.role}</span>
                                                    {activeLeave && (
                                                        <span className="text-[9px] font-black uppercase bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded border border-rose-200 shadow-sm whitespace-nowrap">
                                                            Returns: {returnDateStr}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className={`flex-1 w-full grid grid-cols-1 ${isAdminView ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3 lg:grid-cols-5'} gap-3`}>
                                            <div className={`sm:col-span-1 ${isAdminView ? 'sm:col-span-2 lg:col-span-4' : 'lg:col-span-2'}`}>
                                                <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 block mb-1">Shift</label>
                                                <select className={`w-full bg-white border border-slate-300 text-xs font-bold rounded-lg p-2.5 outline-none focus:border-[#6D2158] ${!alloc ? 'text-slate-400' : 'text-slate-700'}`} value={alloc?.shift || shiftOptions[0]} onChange={(e) => handleAllocUpdate(host.id, 'shift', e.target.value)}>
                                                    {shiftOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                                    {alloc?.shift && !shiftOptions.includes(alloc.shift) && <option value={alloc.shift}>{alloc.shift}</option>}
                                                </select>
                                            </div>
                                            {!isAdminView && (
                                                <div className="sm:col-span-2 lg:col-span-3">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 block mb-1">Task / Assignment</label>
                                                    <input type="text" className={`w-full bg-white border border-slate-300 text-xs rounded-lg p-2.5 outline-none focus:border-[#6D2158] ${!alloc ? 'text-slate-400' : 'text-slate-700'}`} placeholder="e.g. Buggy 42, Morning Clean..." value={alloc?.task_details || ''} onChange={(e) => handleAllocUpdate(host.id, 'task_details', e.target.value)} />
                                                </div>
                                            )}
                                        </div>
                                        {!isAdminView && (
                                            <button onClick={() => handleRemove(host.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0 md:self-center self-end absolute top-2 right-2 md:relative md:top-auto md:right-auto"><X size={18} /></button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            
            {/* ADD HOST MODAL */}
            {isAddHostModalOpen && (
                <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[80vh]">
                        <div className="bg-[#6D2158] p-5 text-white flex justify-between items-center">
                            <h3 className="text-lg font-bold flex items-center gap-2"><Users size={18}/> Pull Staff to {AREAS.find(a => a.id === activeArea)?.label}</h3>
                            <button onClick={() => setIsAddHostModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20"><X size={18}/></button>
                        </div>
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" placeholder="Search entire island staff..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-[#6D2158] shadow-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus />
                            </div>
                        </div>
                        <div className="p-0 flex-1 overflow-y-auto custom-scrollbar">
                            <div className="pb-4">
                                {AREAS.map(area => {
                                    const hostsInGroup = hosts.filter((h: any) => {
                                        const hasAlloc = allocations.some((a: any) => String(a.host_id) === String(h.id));
                                        if (hasAlloc || getDefaultArea(h) !== area.id) return false;
                                        if (!searchQuery) return true;
                                        const q = searchQuery.toLowerCase();
                                        return h.full_name.toLowerCase().includes(q) || h.role.toLowerCase().includes(q) || (h.nicknames || '').toLowerCase().includes(q);
                                    });
                                    if (hostsInGroup.length === 0) return null;
                                    return (
                                        <div key={area.id} className="mb-2">
                                            <div className="px-4 py-1.5 bg-slate-100 border-y border-slate-200 text-[9px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                                <area.icon size={12} /> {area.label}
                                            </div>
                                            <div className="px-2 space-y-0.5 mt-1">
                                                {hostsInGroup.map((host: any) => {
                                                    const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
                                                    return (
                                                        <div key={host.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-200">
                                                            <div className="flex items-center gap-3 overflow-hidden">
                                                                <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 text-xs font-bold">{displayName.charAt(0)}</div>
                                                                <div className="truncate">
                                                                    <p className="text-xs font-bold text-slate-700 truncate">{displayName}</p>
                                                                    <p className="text-[9px] text-slate-400 uppercase tracking-wider truncate mt-0.5">{host.sub_department || host.role}</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => handleAssign(host.id)} className="px-3 py-1.5 bg-white border border-slate-200 text-[#6D2158] hover:bg-[#6D2158]/10 rounded-lg transition-all shadow-sm text-xs font-bold">Pull to Team</button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SMART PASTE MODAL */}
            {isPasteModalOpen && (
                <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
                        <h3 className="font-black text-lg mb-1 text-slate-800">Smart Paste</h3>
                        <p className="text-xs text-slate-500 mb-4 font-medium">Paste lists under headings like MORNIG SHIFT, AFTERNOON SHIFT, OFF, or SICK.</p>
                        <textarea className="w-full h-48 p-4 border border-slate-300 rounded-xl text-sm outline-none focus:border-indigo-500 shadow-inner resize-none" placeholder="Paste schedule here..." value={pastedText} onChange={e => setPastedText(e.target.value)} />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setIsPasteModalOpen(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-all">Cancel</button>
                            <button onClick={handlePasteSubmit} disabled={!pastedText.trim()} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">Process List</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
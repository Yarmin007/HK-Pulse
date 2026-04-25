import React, { useState } from 'react';
import { Search, Plus, X, Pointer, RefreshCw, Users } from "lucide-react";
import toast from 'react-hot-toast';
import { 
    AREAS, TOTAL_VILLAS, JETTY_A, JETTY_B, JETTY_C, BEACH, 
    parseVillas, getDefaultArea 
} from '../lib/constants';

// --- INLINE SEARCH COMPONENT FOR BLOCKS ---
const EmptyBlockSearch = ({ jettyId, candidates, onAssign, placeholder = "+ Search & Add VA", onCancel }: any) => {
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);

    const filtered = candidates.filter((h: any) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return h.full_name.toLowerCase().includes(q) || (h.nicknames || '').toLowerCase().includes(q);
    });

    const displayList = query ? filtered : filtered.slice(0, 30);

    return (
        <div className="relative w-full flex justify-center items-center">
            <input 
                type="text"
                placeholder={placeholder}
                className="w-full bg-white/10 text-white placeholder-white/70 text-[10px] font-bold outline-none text-center rounded py-1 px-2 focus:bg-white focus:text-slate-800 focus:placeholder-slate-400 transition-colors"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => { setFocused(false); if (onCancel && !query) onCancel(); }, 200)}
            />
            {focused && (
                <div className="absolute top-full left-0 w-full max-h-48 overflow-y-auto bg-white border border-slate-300 shadow-2xl z-[60] rounded-b flex flex-col custom-scrollbar">
                    {displayList.length === 0 ? (
                        <span className="p-2 text-[10px] text-slate-500 text-center italic">No matches</span>
                    ) : (
                        displayList.map((h: any) => (
                            <button 
                                key={h.id}
                                className="p-2 text-left text-[10px] font-bold text-slate-800 hover:bg-[#6D2158]/10 border-b border-slate-100 flex flex-col leading-tight"
                                onClick={() => { onAssign(h.id); setQuery(''); setFocused(false); }}
                            >
                                <span>{h.nicknames ? h.nicknames.split(',')[0] : h.full_name}</span>
                                <span className="font-normal opacity-60 text-[8px] uppercase tracking-wider mt-0.5">{h.sub_department || h.role}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default function VillaBoard({ hosts, allocations, setAllocations, masterList, setIsDirty, selectedDate, activeArea }: any) {
    const [villaSearchQuery, setVillaSearchQuery] = useState('');
    const [selectedVA, setSelectedVA] = useState<string | null>(null);
    const [swappingHostId, setSwappingHostId] = useState<string | null>(null);
    const [intendedJetties, setIntendedJetties] = useState<Record<string, string>>({});
    const [typingState, setTypingState] = useState<Record<string, string>>({});
    const [isAddHostModalOpen, setIsAddHostModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const currentAreaHosts = hosts.filter((h: any) => {
        const existingAlloc = allocations.find((a: any) => String(a.host_id) === String(h.id));
        if (existingAlloc) return existingAlloc.area === 'villa';
        return getDefaultArea(h) === 'villa';
    }).sort((a: any, b: any) => {
        const idxA = allocations.findIndex((alloc: any) => String(alloc.host_id) === String(a.id));
        const idxB = allocations.findIndex((alloc: any) => String(alloc.host_id) === String(b.id));
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0; 
    });

    const getVillaData = (vNum?: number) => {
        if (!vNum) return null;
        const match = masterList.find((r: any) => parseInt(r.villa_number) === vNum);
        const st = match?.status?.toUpperCase() || 'VAC';
        
        let colorClass = 'bg-white text-slate-800'; 
        let shortStatus = st;
        let timeStr = '';

        if (st.includes('ARR')) { colorClass = 'bg-green-500 text-white'; if(match?.arrival_time) timeStr = match.arrival_time; }
        else if (st.includes('VAC') || st === 'VM/VAC') { colorClass = 'bg-sky-500 text-white'; shortStatus = 'VAC'; }
        else if (st.includes('TMA')) { colorClass = 'bg-yellow-400 text-slate-900'; }
        else if (st.includes('DEP')) { colorClass = 'bg-rose-500 text-white'; if(match?.departure_time) timeStr = match.departure_time; }

        return { status: shortStatus, colorClass, timeStr };
    };

    const handleBlockAssign = (hostId: string, jettyName: string) => {
        if (!hostId) return;
        const existingAlloc = allocations.find((a: any) => String(a.host_id) === String(hostId));
        const filteredAllocs = allocations.filter((a: any) => String(a.host_id) !== String(hostId));
        
        let shiftToSet = 'Split';
        if (existingAlloc && existingAlloc.shift !== 'Unassigned' && existingAlloc.shift !== 'Off') shiftToSet = existingAlloc.shift;

        setAllocations([...filteredAllocs, { report_date: selectedDate, host_id: hostId, area: 'villa', shift: shiftToSet, task_details: existingAlloc?.task_details || '' }]);
        setIntendedJetties(prev => ({ ...prev, [hostId]: jettyName }));
        setSelectedVA(hostId);
        setIsDirty(true);
    };

    const handleSwapHost = (oldHostId: string, newHostId: string) => {
        if (!newHostId || oldHostId === newHostId) return setSwappingHostId(null);
        
        const newAllocs = [...allocations];
        const idx = newAllocs.findIndex((a: any) => String(a.host_id) === String(oldHostId));
        const newHostExistingIdx = newAllocs.findIndex((a: any) => String(a.host_id) === String(newHostId));
        
        if (newHostExistingIdx >= 0) {
            toast.error("That host is already allocated elsewhere! Remove them first.");
            return setSwappingHostId(null);
        }

        if (idx >= 0) {
            newAllocs[idx] = { ...newAllocs[idx], host_id: newHostId };
            setAllocations(newAllocs);
            setIsDirty(true);
        }

        setIntendedJetties(prev => {
            const next = { ...prev };
            if (next[oldHostId]) { next[newHostId] = next[oldHostId]; delete next[oldHostId]; }
            return next;
        });

        if (selectedVA === oldHostId) setSelectedVA(newHostId);
        setSwappingHostId(null);
    };

    const handleRemove = (hostId: string) => {
        setAllocations(allocations.filter((a: any) => String(a.host_id) !== String(hostId)));
        if (selectedVA === hostId) setSelectedVA(null);
        if (swappingHostId === hostId) setSwappingHostId(null);
        setIntendedJetties(prev => { const next = { ...prev }; delete next[hostId]; return next; });
        setIsDirty(true);
    };

    const handleAllocUpdate = (hostId: string, field: string, value: string) => {
        const existingIndex = allocations.findIndex((a: any) => String(a.host_id) === String(hostId));
        if (field === 'shift' && ['Unassigned', 'Off', 'Annual Leave', 'Sick Leave'].includes(value)) {
            setIntendedJetties(prev => { const next = { ...prev }; delete next[hostId]; return next; });
        }

        if (existingIndex >= 0) {
            const newAllocs = [...allocations];
            newAllocs[existingIndex] = { ...newAllocs[existingIndex], [field]: value };
            setAllocations(newAllocs);
        } else {
            setAllocations([...allocations, { report_date: selectedDate, host_id: hostId, area: 'villa', shift: field === 'shift' ? value : 'Split', task_details: field === 'task_details' ? value : '' }]);
        }
        setIsDirty(true);
    };

    const handleVillaInputBlur = (hostId: string, index: number, value: string) => {
        const existingIndex = allocations.findIndex((a: any) => String(a.host_id) === String(hostId));
        if (existingIndex < 0) return;

        let newAllocs = [...allocations];
        let changed = false;
        const alloc = newAllocs[existingIndex];
        let currentVillas = (alloc.task_details || '').split(',').map((s: string) => s.trim());

        while(currentVillas.length <= index) currentVillas.push('');

        if (!value.trim() || isNaN(parseInt(value, 10))) {
            currentVillas[index] = '';
            newAllocs[existingIndex] = { ...alloc, task_details: currentVillas.filter((s: string) => s !== '').join(',') };
            setAllocations(newAllocs);
            if (!value.trim()) setIsDirty(true);
            return;
        }

        const vNum = parseInt(value, 10);
        newAllocs = newAllocs.map((a: any) => {
            if (String(a.host_id) === String(hostId) || a.area !== 'villa') return a;
            let otherVillas = (a.task_details || '').split(',').map((s: string) => s.trim());
            if (otherVillas.includes(String(vNum))) {
                otherVillas = otherVillas.filter((v: string) => v !== String(vNum));
                changed = true;
                return { ...a, task_details: otherVillas.join(',') };
            }
            return a;
        });

        currentVillas[index] = String(vNum);
        const firstIdx = currentVillas.indexOf(String(vNum));
        if (firstIdx !== -1 && firstIdx !== index) { currentVillas[firstIdx] = ''; changed = true; }
        
        newAllocs[existingIndex] = { ...newAllocs[existingIndex], task_details: currentVillas.filter((v: string) => v.trim() !== '').join(',') };
        if (changed) toast.success(`Villa ${vNum} reassigned to avoid duplicates.`);
        
        setAllocations(newAllocs);
        setIsDirty(true);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, hostId: string, index: number, maxIndex: number) => {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault();
            if (index < maxIndex - 1) document.getElementById(`input-${hostId}-${index + 1}`)?.focus();
            else e.currentTarget.blur();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (index > 0) document.getElementById(`input-${hostId}-${index - 1}`)?.focus();
        }
    };

    const handleVillaClick = (vNum: number) => {
        if (!selectedVA) return toast.error("Click a Villa Attendant's purple header first to select them!");
        
        let newAllocs = [...allocations];
        let myAllocIndex = newAllocs.findIndex((a: any) => String(a.host_id) === selectedVA);
        if (myAllocIndex < 0) return;

        newAllocs = newAllocs.map((alloc: any) => {
            if (alloc.area !== 'villa') return alloc;
            let currentVillas = (alloc.task_details || '').split(',').map((s: string) => s.trim());
            if (currentVillas.includes(String(vNum))) {
                return { ...alloc, task_details: currentVillas.filter((v: string) => v !== String(vNum)).join(',') };
            }
            return alloc;
        });

        const myAlloc = newAllocs[myAllocIndex];
        let myVillas = (myAlloc.task_details || '').split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
        
        if (myVillas.includes(String(vNum))) myVillas = myVillas.filter((v: string) => v !== String(vNum)); 
        else myVillas.push(String(vNum));
        
        newAllocs[myAllocIndex] = { ...myAlloc, task_details: myVillas.join(',') };
        setAllocations(newAllocs);
        setIsDirty(true);
    };

    const handleCleanUpPool = () => {
        if (!confirm("This will remove any staff from this Unallocated list who are NOT natively Villa Attendants. Proceed?")) return;
        const newAllocs = allocations.filter((a: any) => {
            if (a.area !== 'villa') return true; 
            const h = hosts.find((h: any) => String(h.id) === String(a.host_id));
            if (!h) return false;
            if (a.task_details && a.task_details.trim() !== '') return true;
            if (getDefaultArea(h) === 'villa') return true;
            return false;
        });
        setAllocations(newAllocs);
        setIsDirty(true);
        setSelectedVA(null);
        toast.success("Pool cleaned successfully!");
    };

    // --- DATA GROUPINGS ---
    const hostGroups = { jettyA: [] as any[], jettyB: [] as any[], jettyC: [] as any[], beach: [] as any[], leave: [] as any[] };
    const unassignedVAs: any[] = [];
    const allAllocatedVillas = new Set<number>();

    allocations.filter((a: any) => a.area === 'villa').forEach((a: any) => {
        parseVillas(a.task_details).forEach(v => allAllocatedVillas.add(v));
    });

    currentAreaHosts.forEach((host: any) => {
        const alloc = allocations.find((a: any) => String(a.host_id) === String(host.id));
        const shift = alloc?.shift || '';
        
        if (['Off', 'Annual Leave', 'Sick Leave'].includes(shift)) return hostGroups.leave.push(host);

        const myVillas = parseVillas(alloc?.task_details || '');
        const intended = intendedJetties[host.id];
        
        const targetJetty = intended || (
            myVillas.length === 0 ? null :
            JETTY_A.includes(myVillas[0]) ? 'jettyA' :
            JETTY_B.includes(myVillas[0]) ? 'jettyB' :
            JETTY_C.includes(myVillas[0]) ? 'jettyC' :
            BEACH.includes(myVillas[0]) ? 'beach' : 'jettyA'
        );

        if (!targetJetty || shift === 'Unassigned') unassignedVAs.push(host);
        else if (targetJetty === 'jettyA') hostGroups.jettyA.push(host);
        else if (targetJetty === 'jettyB') hostGroups.jettyB.push(host);
        else if (targetJetty === 'jettyC') hostGroups.jettyC.push(host);
        else if (targetJetty === 'beach') hostGroups.beach.push(host);
    });

    const unallocatedVillas: number[] = [];
    for (let i = 1; i <= TOTAL_VILLAS; i++) {
        if (!allAllocatedVillas.has(i)) unallocatedVillas.push(i);
    }

    let searchedVillaAllocatedTo: string | null = null;
    if (villaSearchQuery) {
        const vNum = parseInt(villaSearchQuery, 10);
        if (!isNaN(vNum)) {
            const allocMatch = allocations.find((a: any) => a.area === 'villa' && parseVillas(a.task_details).includes(vNum));
            if (allocMatch) {
                const h = hosts.find((h: any) => String(h.id) === String(allocMatch.host_id));
                if (h) searchedVillaAllocatedTo = h.nicknames ? h.nicknames.split(',')[0] : h.full_name.split(' ')[0];
            }
        }
    }

    const renderBlock = (host: any, jettyId: string, key: string) => {
        if (!host) {
            return (
                <div key={key} className="flex flex-col bg-slate-50 border w-full border-slate-400 rounded-sm overflow-hidden shadow-sm h-full">
                    <div className="bg-[#6D2158] p-1 border-b border-slate-400">
                        <EmptyBlockSearch jettyId={jettyId} candidates={unassignedVAs} onAssign={(hId: string) => handleBlockAssign(hId, jettyId)} />
                    </div>
                    <div className="bg-slate-100 border-b border-slate-400 text-[8px] font-mono text-slate-400 px-1 py-0.5 text-center truncate italic">No Contact Info</div>
                    <div className="grid grid-cols-2 bg-slate-200 border-b border-slate-400">
                        <div className="text-center font-black text-[8px] py-1 border-r border-slate-400 text-slate-700">VILLA NO</div>
                        <div className="text-center font-black text-[8px] py-1 text-slate-700">STATUS</div>
                    </div>
                    <div className="flex flex-col flex-1">
                        {Array.from({length: 9}).map((_, i) => (
                            <div key={`empty-${i}`} className="grid grid-cols-2 border-b border-slate-400 min-h-[24px] bg-white"><div className="border-r border-slate-400"></div><div></div></div>
                        ))}
                    </div>
                </div>
            );
        }

        const alloc = allocations.find((a: any) => String(a.host_id) === String(host.id));
        const myVillas = (alloc?.task_details || '').split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
        
        const rowsCount = Math.max(9, myVillas.length + 1);
        const paddedVillas = Array.from({length: rowsCount}).map((_, i) => myVillas[i] || '');
        const isSelected = selectedVA === String(host.id);
        const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
        const contactInfo = [host.mvpn ? `MVPN: ${host.mvpn}` : '', host.company_mobile ? `Duty: ${host.company_mobile}` : '', host.personal_mobile ? `Per: ${host.personal_mobile}` : ''].filter(Boolean).join(' | ') || 'No Contact Info';

        return (
            <div key={key} onClick={() => setSelectedVA(host.id)} className={`flex flex-col bg-slate-50 border w-full rounded-sm overflow-hidden shadow-sm h-full cursor-pointer transition-all ${isSelected ? 'ring-2 ring-green-500 border-green-500 z-10' : 'border-slate-400 hover:border-slate-500'}`}>
                <div className={`p-1 flex justify-between items-center text-white border-b border-slate-400 ${isSelected ? 'bg-green-600' : 'bg-[#6D2158]'}`}>
                    {swappingHostId === host.id ? (
                        <div className="w-full">
                            <EmptyBlockSearch jettyId={jettyId} candidates={unassignedVAs} onAssign={(newHostId: string) => handleSwapHost(host.id, newHostId)} placeholder="Swap VA..." onCancel={() => setSwappingHostId(null)} />
                        </div>
                    ) : (
                        <>
                            <span className="text-[11px] font-bold pl-1 leading-tight truncate">{displayName}</span>
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={(e) => { e.stopPropagation(); setSwappingHostId(host.id); }} className="text-white/60 hover:text-white px-1" title="Swap VA"><RefreshCw size={10}/></button>
                                <button onClick={(e) => { e.stopPropagation(); handleRemove(host.id); }} className="text-white/60 hover:text-white px-1" title="Remove VA"><X size={12}/></button>
                            </div>
                        </>
                    )}
                </div>
                <div className="bg-slate-100 border-b border-slate-400 text-[7px] font-mono text-slate-600 px-1 py-0.5 text-center truncate">{contactInfo}</div>
                <div className="grid grid-cols-2 bg-slate-200 border-b border-slate-400">
                    <div className="text-center font-black text-[8px] py-1 border-r border-slate-400 text-slate-700">VILLA NO</div>
                    <div className="text-center font-black text-[8px] py-1 text-slate-700">STATUS</div>
                </div>
                <div className="flex flex-col flex-1">
                    {paddedVillas.map((v, i) => {
                        const inputKey = `${host.id}-${i}`;
                        const displayValue = typingState[inputKey] !== undefined ? typingState[inputKey] : v;
                        const vNum = parseInt(displayValue, 10);
                        const data = !isNaN(vNum) ? getVillaData(vNum) : null;
                        
                        return (
                            <div key={i} className={`grid grid-cols-2 min-h-[24px] bg-white ${i < rowsCount - 1 ? 'border-b border-slate-400' : ''}`}>
                                <div className="border-r border-slate-400 p-0">
                                    <input 
                                        id={`input-${host.id}-${i}`}
                                        type="text"
                                        className="w-full h-full text-center font-bold text-[12px] outline-none focus:bg-indigo-50 text-slate-800 bg-transparent"
                                        value={displayValue}
                                        onChange={(e) => setTypingState(prev => ({ ...prev, [inputKey]: e.target.value }))}
                                        onBlur={(e) => {
                                            handleVillaInputBlur(host.id, i, e.target.value);
                                            setTypingState(prev => { const next = { ...prev }; delete next[inputKey]; return next; });
                                        }}
                                        onKeyDown={(e) => handleInputKeyDown(e, host.id, i, rowsCount)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                                <div 
                                    className={`text-center flex flex-col items-center justify-center text-[10px] font-bold leading-tight px-0.5 ${data?.colorClass || 'bg-slate-50 text-slate-400'}`}
                                    onClick={(e) => { if(vNum) { e.stopPropagation(); handleVillaClick(vNum); } }}
                                >
                                    <span>{data?.status || ''}</span>
                                    {data?.timeStr && <span className="text-[7px] opacity-90 leading-none mt-0.5">@{data.timeStr}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col-reverse xl:flex-row gap-4 items-start w-full">
            <div className="flex-1 w-full min-w-0 flex flex-col gap-4">
                {/* ROW 1: JETTY A */}
                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-300">
                    <div className="bg-[#6D2158] text-white font-black text-center py-1.5 text-[10px] tracking-widest uppercase rounded-sm mb-2">Jetty A</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 w-full">
                        {Array.from({length: 7}).map((_, i) => renderBlock(hostGroups.jettyA[i], 'jettyA', `A-${i}`))}
                    </div>
                </div>

                {/* ROW 2: JETTY B & C */}
                <div className="flex flex-col xl:flex-row gap-4 w-full">
                    <div className="flex-1 bg-white p-2 rounded-xl shadow-sm border border-slate-300">
                        <div className="bg-[#6D2158] text-white font-black text-center py-1.5 text-[10px] tracking-widest uppercase rounded-sm mb-2">Jetty B</div>
                        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 w-full">
                            {Array.from({length: 3}).map((_, i) => renderBlock(hostGroups.jettyB[i], 'jettyB', `B-${i}`))}
                        </div>
                    </div>
                    <div className="flex-1 bg-white p-2 rounded-xl shadow-sm border border-slate-300">
                        <div className="bg-[#6D2158] text-white font-black text-center py-1.5 text-[10px] tracking-widest uppercase rounded-sm mb-2">Jetty C</div>
                        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 w-full">
                            {Array.from({length: 4}).map((_, i) => renderBlock(hostGroups.jettyC[i], 'jettyC', `C-${i}`))}
                        </div>
                    </div>
                </div>

                {/* ROW 3: BEACH */}
                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-300">
                    <div className="bg-[#6D2158] text-white font-black text-center py-1.5 text-[10px] tracking-widest uppercase rounded-sm mb-2">Beach Villas</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 w-full">
                        {Array.from({length: 7}).map((_, i) => renderBlock(hostGroups.beach[i], 'beach', `Beach-${i}`))}
                    </div>
                </div>

                {/* UNALLOCATED POOL */}
                <div className="mt-4 bg-white p-4 rounded-xl border border-slate-300 shadow-sm">
                    <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                        <h3 className="text-xs font-black uppercase text-slate-700 tracking-widest">Unallocated & Leave Status</h3>
                        <div className="flex items-center gap-2">
                            <button onClick={handleCleanUpPool} className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 px-2 py-1 rounded font-bold transition-colors border border-rose-200 shadow-sm">Clean Up Pool</button>
                            <button onClick={() => setIsAddHostModalOpen(true)} className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded font-bold flex items-center gap-1 transition-colors border border-slate-200 shadow-sm"><Plus size={12}/> Pull Staff to Pool</button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {unassignedVAs.length === 0 && hostGroups.leave.length === 0 ? <span className="text-xs text-slate-400 italic">No unassigned staff.</span> : 
                            [...unassignedVAs, ...hostGroups.leave].map(h => {
                                const alloc = allocations.find((a: any) => String(a.host_id) === String(h.id));
                                const n = h.nicknames ? h.nicknames.split(',')[0] : h.full_name.split(' ')[0];
                                return (
                                    <div key={h.id} className="bg-slate-50 border border-slate-300 pl-2 pr-1 py-1 rounded flex items-center gap-2 shadow-sm">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-bold text-slate-800 leading-tight">{n}</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5 truncate max-w-[80px]">{h.sub_department || h.role}</span>
                                        </div>
                                        <select 
                                            className="bg-white border border-slate-200 text-[10px] font-bold outline-none text-slate-700 rounded p-1 cursor-pointer"
                                            value={alloc?.shift || 'Unassigned'}
                                            onChange={(e) => handleAllocUpdate(h.id, 'shift', e.target.value)}
                                        >
                                            <option value="Unassigned">Unassigned</option>
                                            <option value="Off">Off</option>
                                            <option value="Annual Leave">Annual Leave</option>
                                            <option value="Sick Leave">Sick Leave</option>
                                            <option value="Split">Split</option>
                                            <option value="Morning">Morning</option>
                                            <option value="Evening">Evening</option>
                                        </select>
                                        <button onClick={() => handleRemove(h.id)} className="text-slate-400 hover:text-rose-500 p-1"><X size={12}/></button>
                                    </div>
                                )
                            })
                        }
                    </div>
                </div>
            </div>

            {/* RIGHT SIDEBAR */}
            <div className="w-full xl:w-48 shrink-0 flex flex-col gap-4 relative xl:sticky xl:top-6 z-20">
                <div className="bg-white p-3 rounded-xl border border-slate-300 shadow-sm">
                    <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-2 flex items-center gap-1.5"><Search size={12}/> Find Villa</h3>
                    <input type="number" placeholder="Villa No..." className="w-full bg-slate-50 border border-slate-300 text-xs font-bold rounded p-2 outline-none focus:border-[#6D2158] mb-2 text-center" value={villaSearchQuery} onChange={e => setVillaSearchQuery(e.target.value)} />
                    {villaSearchQuery && (
                        <div className={`p-2 rounded border flex flex-col text-center ${searchedVillaAllocatedTo ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-slate-100 border-slate-300 text-slate-500'}`}>
                            {searchedVillaAllocatedTo ? (
                                <><span className="text-[9px] uppercase font-black opacity-60">Allocated To</span><span className="text-xs font-black">{searchedVillaAllocatedTo}</span></>
                            ) : <span className="text-[10px] font-black uppercase">Unallocated</span>}
                        </div>
                    )}
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-300 shadow-sm flex flex-col xl:max-h-[600px]">
                    <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-2 flex items-center justify-between border-b border-slate-200 pb-1">
                        Unallocated <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">{unallocatedVillas.length}</span>
                    </h3>
                    <div className="text-[9px] font-bold text-slate-400 mb-2 leading-tight bg-slate-50 border border-slate-200 p-1.5 rounded text-center">
                        {!selectedVA ? <span className="text-amber-600 flex items-center justify-center gap-1"><Pointer size={10}/> Select VA Header</span> : <span className="text-emerald-600 flex items-center justify-center gap-1">✓ Click to assign</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 custom-scrollbar overflow-y-auto pb-2 justify-center max-h-48 xl:max-h-full">
                        {unallocatedVillas.map(v => {
                            const vData = getVillaData(v);
                            return (
                                <button key={v} onClick={() => handleVillaClick(v)} className={`w-[34px] h-[30px] rounded border border-slate-300 shadow-sm flex items-center justify-center transition-all ${vData?.colorClass || 'bg-white'} hover:scale-105 active:scale-95`}>
                                    <span className="text-[11px] font-black leading-none">{v}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* PULL STAFF MODAL */}
            {isAddHostModalOpen && (
                <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[80vh]">
                        <div className="bg-[#6D2158] p-5 text-white flex justify-between items-center">
                            <h3 className="text-lg font-bold flex items-center gap-2"><Users size={18}/> Pull Staff to VA Pool</h3>
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
                                        if (hasAlloc) return false;
                                        if (getDefaultArea(h) !== area.id) return false;
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
                                                            <button onClick={() => { 
                                                                setAllocations([...allocations, { report_date: selectedDate, host_id: host.id, area: 'villa', shift: 'Unassigned', task_details: '' }]);
                                                                setIsDirty(true);
                                                                setIsAddHostModalOpen(false); 
                                                            }} className="px-3 py-1.5 bg-white border border-slate-200 text-[#6D2158] hover:bg-[#6D2158]/10 rounded-lg transition-all shadow-sm text-xs font-bold">Pull to Pool</button>
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
        </div>
    );
}
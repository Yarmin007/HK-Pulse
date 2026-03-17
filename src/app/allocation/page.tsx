"use client";
import React, { useState, useEffect } from 'react';
import { 
  Users, Droplets, Leaf, Truck, UserCheck, Settings, LayoutDashboard, 
  Search, Plus, X, Calendar, Save, Printer, MapPin, Shirt, Loader2, Contact, 
  Briefcase, CheckCircle, Copy, ChevronLeft, ChevronRight, Wand2, Scissors
} from "lucide-react";
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const AREAS = [
  { id: 'admin', label: 'Admin & Office', icon: Settings },
  { id: 'villa', label: 'Villa Attendant', icon: Users },
  { id: 'public', label: 'Public Area', icon: MapPin },
  { id: 'water', label: 'Water Room', icon: Droplets },
  { id: 'laundry', label: 'Laundry', icon: Shirt },
  { id: 'tailor', label: 'Tailor', icon: Scissors },
  { id: 'garden', label: 'Garden', icon: Leaf },
  { id: 'riders', label: 'Riders & Step', icon: Truck },
  { id: 'housemate', label: 'Housemate', icon: UserCheck },
];

const getShiftsForArea = (areaId: string) => {
    if (areaId === 'admin') {
        return ['Straight (08:00 - 17:00)', 'Split (08:00-14:00 | 18:00-21:00)', 'Off', 'Annual Leave', 'Sick Leave'];
    }
    if (areaId === 'villa') {
        return ['Split (08:00-14:00 | 18:00-21:00)', 'Off', 'Annual Leave', 'Sick Leave'];
    }
    return ['Morning', 'Afternoon', 'Evening', 'Night', 'Split', 'Off', 'Annual Leave', 'Sick Leave'];
};

const getToday = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// --- VILLA GROUPINGS ---
const JETTY_A = Array.from({length: 35}, (_, i) => i + 1);
const JETTY_B = Array.from({length: 14}, (_, i) => i + 37);
const JETTY_C = Array.from({length: 21}, (_, i) => i + 59);
const BEACH = [36, ...Array.from({length: 8}, (_, i) => i + 51), ...Array.from({length: 18}, (_, i) => i + 80)];

// Helper to parse strings like "1, 2, 10-12" into [1, 2, 10, 11, 12]
const parseVillas = (str: string): number[] => {
    if (!str) return [];
    const parts = str.split(',');
    const villas = new Set<number>();
    parts.forEach(p => {
        p = p.trim();
        if (p.includes('-')) {
            const [start, end] = p.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) villas.add(i);
            }
        } else {
            const v = parseInt(p, 10);
            if (!isNaN(v)) villas.add(v);
        }
    });
    return Array.from(villas).sort((a,b) => a-b);
};

type Host = {
  id: string;
  full_name: string;
  host_id: string;
  role: string;
  sub_department?: string;
  mvpn?: string;
  nicknames?: string;
};

type Allocation = {
  id?: string;
  report_date: string;
  host_id: string;
  area: string;
  shift: string;
  task_details: string;
};

type GuestRecord = {
    villa_number: string;
    status: string;
};

const getDefaultArea = (host: Host) => {
    const sub = (host.sub_department || '').toLowerCase();
    const role = (host.role || '').toLowerCase();
    
    const check = (str: string) => {
        if (str.includes('tailor') || str.includes('seamstress')) return 'tailor';
        if (str.includes('villa') || str === 'va') return 'villa';
        if (str.includes('public') || str.includes('pa ') || str === 'pa') return 'public';
        if (str.includes('water') || str.includes('pool')) return 'water';
        if (str.includes('laundry') || str.includes('linen')) return 'laundry';
        if (str.includes('garden') || str.includes('landscap')) return 'garden';
        if (str.includes('rider') || str.includes('step') || str.includes('buggy') || str.includes('driver')) return 'riders';
        if (str.includes('housemate') || str.includes('mate')) return 'housemate';
        if (str.includes('admin') || str.includes('desk') || str.includes('coord') || str.includes('manager') || str.includes('super') || str.includes('director')) return 'admin';
        return null;
    };

    return check(sub) || check(role) || 'villa'; 
};

export default function AllocationPage() {
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [hosts, setHosts] = useState<Host[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [masterList, setMasterList] = useState<GuestRecord[]>([]); // For Villa Status
  
  const [activeArea, setActiveArea] = useState('villa');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [isAddHostModalOpen, setIsAddHostModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
      setIsProcessing(true);
      
      const { data: hostsData, error: hostErr } = await supabase
          .from('hsk_hosts')
          .select('id, full_name, host_id, role, sub_department, mvpn, nicknames')
          .eq('status', 'Active')
          .order('full_name');
          
      if (hostsData) setHosts(hostsData);

      const { data: allocData } = await supabase
          .from('hsk_allocations')
          .select('*')
          .eq('report_date', selectedDate);
          
      if (allocData) setAllocations(allocData);
      else setAllocations([]);

      // Fetch guest summary for villa statuses
      const { data: guestData } = await supabase
          .from('hsk_daily_summary')
          .select('villa_number, status')
          .eq('report_date', selectedDate);
      
      if (guestData) setMasterList(guestData);

      setIsDirty(false);
      setIsProcessing(false);
  };

  const handleAssign = (hostId: string) => {
      if (allocations.some(a => String(a.host_id) === String(hostId))) return;
      
      const defaultShift = activeArea === 'admin' ? 'Straight (08:00 - 17:00)' : 
                           activeArea === 'villa' ? 'Split (08:00-14:00 | 18:00-21:00)' : 'Morning';

      setAllocations([...allocations, {
          report_date: selectedDate,
          host_id: hostId,
          area: activeArea,
          shift: defaultShift,
          task_details: ''
      }]);
      setIsDirty(true);
  };

  const handleRemove = (hostId: string) => {
      setAllocations(allocations.filter(a => String(a.host_id) !== String(hostId)));
      setIsDirty(true);
  };

  const handleAllocUpdate = (hostId: string, field: keyof Allocation, value: string) => {
      const existingIndex = allocations.findIndex(a => String(a.host_id) === String(hostId));
      if (existingIndex >= 0) {
          const newAllocs = [...allocations];
          newAllocs[existingIndex] = { ...newAllocs[existingIndex], [field]: value };
          setAllocations(newAllocs);
      } else {
          const defaultShift = activeArea === 'admin' ? 'Straight (08:00 - 17:00)' : 
                               activeArea === 'villa' ? 'Split (08:00-14:00 | 18:00-21:00)' : 'Morning';
          setAllocations([...allocations, {
              report_date: selectedDate,
              host_id: hostId,
              area: activeArea,
              shift: field === 'shift' ? value : defaultShift,
              task_details: field === 'task_details' ? value : ''
          }]);
      }
      setIsDirty(true);
  };

  const handleSave = async () => {
      setIsProcessing(true);
      await supabase.from('hsk_allocations').delete().eq('report_date', selectedDate);
      
      if (allocations.length > 0) {
          const payload = allocations.map(a => {
              const { id, ...rest } = a; 
              return rest;
          });
          const { error } = await supabase.from('hsk_allocations').insert(payload);
          if (error) toast.error("Error saving allocations: " + error.message);
          else toast.success("Allocations successfully saved!");
      } else {
          toast.success("Allocations cleared.");
      }
      
      setIsDirty(false);
      setIsProcessing(false);
  };

  const handleCopyYesterday = async () => {
      if (!confirm("This will pull yesterday's allocations into today. Proceed?")) return;
      setIsProcessing(true);
      
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      const yesterday = d.toISOString().split('T')[0];

      const { data: yesterdayAllocs } = await supabase.from('hsk_allocations').select('*').eq('report_date', yesterday);
      
      if (yesterdayAllocs && yesterdayAllocs.length > 0) {
          const newAllocs = yesterdayAllocs.map(a => {
              const { id, created_at, report_date, ...rest } = a;
              return { ...rest, report_date: selectedDate };
          });
          setAllocations(newAllocs);
          setIsDirty(true);
          toast.success(`Copied ${newAllocs.length} allocations! Click Save to confirm.`);
      } else {
          toast.error("No allocations found for yesterday.");
      }
      setIsProcessing(false);
  };

  const handlePasteSubmit = () => {
      if (!pastedText.trim()) {
          toast.error("Please paste some data first.");
          return;
      }
      setIsProcessing(true);
      setIsPasteModalOpen(false);
      
      const lines = pastedText.split('\n');
      const newAllocs = [...allocations];
      let matchCount = 0;

      lines.forEach(line => {
          if (!line.trim()) return;
          const lineLower = line.toLowerCase();
          
          const matchedHost = hosts.find(h => {
              const nameParts = h.full_name.toLowerCase().split(' ');
              const nickname = (h.nicknames || '').toLowerCase().split(',')[0];
              return (nameParts[0].length > 2 && lineLower.includes(nameParts[0])) || 
                     (nickname.length > 2 && lineLower.includes(nickname));
          });

          if (matchedHost) {
              let shift = activeArea === 'admin' ? 'Straight (08:00 - 17:00)' : 'Morning';
              if (lineLower.match(/\b(off|off duty|leave|al|sl)\b/)) shift = 'Off';
              else if (lineLower.match(/\b(pm|evening|night)\b/)) shift = 'Evening';
              else if (lineLower.match(/\b(split)\b/)) shift = activeArea === 'admin' ? 'Split (08:00-14:00 | 18:00-21:00)' : 'Split';

              const nameRegex = new RegExp(matchedHost.full_name.split(' ')[0], 'ig');
              const nickRegex = matchedHost.nicknames ? new RegExp(matchedHost.nicknames.split(',')[0], 'ig') : /###/;
              
              let task = line.replace(nameRegex, '').replace(nickRegex, '').replace(/\b(off|pm|morning|evening|night|split)\b/ig, '').trim();
              task = task.replace(/^[-:;,.\s]+/, '').replace(/[-:;,.\s]+$/, '');

              const existingIndex = newAllocs.findIndex(a => String(a.host_id) === String(matchedHost.id));
              if (existingIndex >= 0) {
                  newAllocs[existingIndex] = { ...newAllocs[existingIndex], shift, task_details: task, area: activeArea };
              } else {
                  newAllocs.push({
                      report_date: selectedDate,
                      host_id: matchedHost.id,
                      area: activeArea,
                      shift,
                      task_details: task
                  });
              }
              matchCount++;
          }
      });

      setAllocations(newAllocs);
      setIsDirty(true);
      setPastedText('');
      toast.success(`AI Extracted and matched ${matchCount} hosts!`);
      setIsProcessing(false);
  };

  const changeDate = (days: number) => {
      if (isDirty && !confirm("You have unsaved changes. Discard them?")) return;
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      setSelectedDate(d.toISOString().split('T')[0]);
  };

  const getVillaStatusColor = (vNum: number) => {
      const match = masterList.find(r => parseInt(r.villa_number) === vNum);
      const st = match?.status?.toUpperCase() || 'VAC';
      
      if(st === 'VM/VAC') return 'bg-slate-200 border-slate-300 text-slate-600';
      if(st === 'VM/OCC') return 'bg-indigo-100 border-indigo-300 text-indigo-700';
      if(st === 'VM/ARR') return 'bg-blue-100 border-blue-300 text-blue-700';
      if(st === 'DAY USE') return 'bg-amber-50 border-amber-300 text-amber-700';
      if(st.includes('DEP') && st.includes('ARR')) return 'bg-purple-100 border-purple-300 text-purple-700';
      if(st.includes('TMA')) return 'bg-orange-50 border-orange-300 text-orange-700'; 
      if(st.includes('OCC')) return 'bg-emerald-50 border-emerald-300 text-emerald-700';
      if(st.includes('ARR')) return 'bg-blue-50 border-blue-300 text-blue-700';
      if(st.includes('DEP')) return 'bg-rose-50 border-rose-300 text-rose-700';
      return 'bg-white border-slate-200 text-slate-400'; // VAC
  };

  // --- FILTER LOGIC: VISIBILITY CONTROL ---
  const currentAreaHosts = hosts.filter(h => {
      const existingAlloc = allocations.find(a => String(a.host_id) === String(h.id));
      if (existingAlloc) return existingAlloc.area === activeArea;
      return getDefaultArea(h) === activeArea;
  });
  
  currentAreaHosts.sort((a, b) => a.full_name.localeCompare(b.full_name));

  const availableHosts = hosts.filter(h => {
      const hasAlloc = allocations.some(a => String(a.host_id) === String(h.id));
      const isDefaultHere = getDefaultArea(h) === activeArea;
      return !hasAlloc && !isDefaultHere;
  });
  
  const filteredAvailable = availableHosts.filter(h => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return h.full_name.toLowerCase().includes(q) || h.role.toLowerCase().includes(q) || (h.nicknames || '').toLowerCase().includes(q);
  });

  // --- VILLA ATTENDANT: JETTY GROUPINGS ---
  const allAllocatedVillas = new Set<number>();
  if (activeArea === 'villa') {
      allocations.filter(a => a.area === 'villa').forEach(a => {
          parseVillas(a.task_details).forEach(v => allAllocatedVillas.add(v));
      });
  }

  const hostGroups = {
      jettyA: [] as Host[],
      jettyB: [] as Host[],
      jettyC: [] as Host[],
      beach: [] as Host[],
      unassigned: [] as Host[]
  };

  if (activeArea === 'villa') {
      currentAreaHosts.forEach(host => {
          const alloc = allocations.find(a => String(a.host_id) === String(host.id));
          const myVillas = parseVillas(alloc?.task_details || '');
          if (myVillas.length === 0) {
              hostGroups.unassigned.push(host);
          } else {
              const first = myVillas[0];
              if (JETTY_A.includes(first)) hostGroups.jettyA.push(host);
              else if (JETTY_B.includes(first)) hostGroups.jettyB.push(host);
              else if (JETTY_C.includes(first)) hostGroups.jettyC.push(host);
              else hostGroups.beach.push(host);
          }
      });
  }

  const renderJettySection = (title: string, villas: number[], hostsInGroup: Host[], bgColor: string) => {
      const unalloc = villas.filter(v => !allAllocatedVillas.has(v));
      if (villas.length === 0 && hostsInGroup.length === 0) return null;

      return (
          <div key={title} className={`mb-6 p-4 rounded-2xl border border-slate-200 ${bgColor}`}>
              <h3 className="text-sm font-black uppercase text-slate-700 tracking-widest mb-3 flex items-center justify-between">
                  {title}
                  {villas.length > 0 && <span className="text-[10px] bg-white px-2 py-1 rounded text-slate-500 shadow-sm border border-slate-100">{unalloc.length} Unallocated</span>}
              </h3>

              {villas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4 bg-white/60 p-3 rounded-xl border border-slate-200 shadow-sm items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase w-full mb-1">Unallocated Villas:</span>
                      {unalloc.length === 0 ? (
                          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle size={14}/> All villas assigned!</span>
                      ) : (
                          unalloc.map(v => (
                              <div key={v} className={`w-8 h-8 rounded-md border shadow-sm flex items-center justify-center transition-all opacity-80 ${getVillaStatusColor(v)}`}>
                                  <span className="text-[11px] font-black">{v}</span>
                              </div>
                          ))
                      )}
                  </div>
              )}

              {hostsInGroup.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 italic mt-2">No hosts assigned to this section yet.</p>
              ) : (
                  <div className="space-y-2">
                      {hostsInGroup.map(host => {
                          const alloc = allocations.find(a => String(a.host_id) === String(host.id));
                          const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
                          const shiftOptions = getShiftsForArea('villa');
                          const myVillas = parseVillas(alloc?.task_details || '');

                          return (
                              <div key={host.id} className="flex flex-col xl:flex-row gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200 items-start xl:items-center transition-all hover:border-[#6D2158]/30">
                                  <div className="flex items-center gap-3 w-full xl:w-56 shrink-0">
                                      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 font-black text-xs ${alloc ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                          {displayName.charAt(0)}
                                      </div>
                                      <div className="overflow-hidden">
                                          <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
                                          <p className="text-[9px] text-slate-400 uppercase tracking-wider truncate">{host.sub_department || host.role}</p>
                                      </div>
                                  </div>
                                  
                                  <div className="flex gap-2 w-full xl:w-auto shrink-0">
                                      <select 
                                          className="w-36 bg-slate-50 border border-slate-200 text-[10px] font-bold rounded-lg p-2 outline-none focus:border-[#6D2158]"
                                          value={alloc?.shift || shiftOptions[0]}
                                          onChange={(e) => handleAllocUpdate(host.id, 'shift', e.target.value)}
                                      >
                                          {shiftOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                          {alloc?.shift && !shiftOptions.includes(alloc.shift) && <option value={alloc.shift}>{alloc.shift}</option>}
                                      </select>
                                      <input 
                                          type="text" 
                                          className="w-32 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-lg p-2 outline-none focus:border-[#6D2158]"
                                          placeholder="e.g. 1-5, 10"
                                          value={alloc?.task_details || ''}
                                          onChange={(e) => handleAllocUpdate(host.id, 'task_details', e.target.value)}
                                      />
                                  </div>

                                  {/* INLINE VILLAS */}
                                  <div className="flex-1 flex flex-wrap gap-1.5 border-t xl:border-t-0 xl:border-l border-slate-100 pt-2 xl:pt-0 xl:pl-4 min-h-[36px] items-center w-full">
                                      {myVillas.length === 0 ? (
                                          <span className="text-[10px] font-bold text-slate-400 italic">No villas assigned</span>
                                      ) : (
                                          myVillas.map(v => (
                                              <div key={v} className={`w-8 h-8 rounded-md border shadow-sm flex items-center justify-center transition-all ${getVillaStatusColor(v)}`}>
                                                   <span className="text-[11px] font-black">{v}</span>
                                              </div>
                                          ))
                                      )}
                                  </div>

                                  <button 
                                      onClick={() => handleRemove(host.id)}
                                      className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                  >
                                      <X size={16} />
                                  </button>
                              </div>
                          );
                      })}
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-32">
      
      {/* 🖨️ PRINT VIEW */}
      <div className="hidden print:block bg-white text-black font-sans">
          <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
              <div>
                 <h1 className="text-3xl font-black uppercase tracking-widest">Daily Allocation Sheet</h1>
                 <p className="text-sm font-bold mt-1 text-gray-500">Date: {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}</p>
              </div>
              <div className="text-right text-xs">
                 <p>Total Staff Allocated: <strong>{allocations.length}</strong></p>
                 <p>Generated via HK Pulse</p>
              </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
              {AREAS.map(area => {
                  const areaAllocs = allocations.filter(a => a.area === area.id);
                  if (areaAllocs.length === 0) return null;
                  return (
                      <div key={area.id} className="break-inside-avoid mb-6">
                          <h2 className="text-lg font-black bg-gray-100 border border-gray-300 p-2 mb-2 uppercase">{area.label} <span className="text-sm font-normal normal-case float-right mt-1">({areaAllocs.length} Staff)</span></h2>
                          <table className="w-full text-left text-xs border-collapse border border-gray-300">
                              <thead>
                                  <tr className="bg-gray-50">
                                      <th className="border border-gray-300 p-2 w-1/3">Host Name</th>
                                      <th className="border border-gray-300 p-2 w-1/6">Shift</th>
                                      <th className="border border-gray-300 p-2 w-1/6">MVPN</th>
                                      <th className="border border-gray-300 p-2 w-1/3">{area.id === 'villa' ? 'Villas' : 'Task Details'}</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {areaAllocs.map(a => {
                                      const h = hosts.find(h => String(h.id) === String(a.host_id));
                                      if (!h) return null;
                                      const displayName = h.nicknames ? h.nicknames.split(',')[0] : h.full_name.split(' ')[0];
                                      return (
                                          <tr key={a.host_id}>
                                              <td className="border border-gray-300 p-2 font-bold">{displayName}</td>
                                              <td className="border border-gray-300 p-2">{a.shift}</td>
                                              <td className="border border-gray-300 p-2 font-mono">{h.mvpn || '-'}</td>
                                              <td className="border border-gray-300 p-2">{a.task_details || '-'}</td>
                                          </tr>
                                      )
                                  })}
                              </tbody>
                          </table>
                      </div>
                  );
              })}
          </div>
      </div>

      {/* 💻 SCREEN VIEW */}
      <div className="print:hidden max-w-7xl mx-auto space-y-6">
          
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                  <div className="h-10 w-1 bg-[#6D2158] rounded-full shrink-0"></div>
                  <div>
                      <h1 className="text-xl font-bold text-slate-800">Master Allocation Sheet</h1>
                      <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                             Total Deployed: {allocations.length} / {hosts.length}
                          </span>
                          {isDirty && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">Unsaved Changes</span>}
                      </div>
                  </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                      <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronLeft size={16}/></button>
                      <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none px-2 cursor-pointer"/>
                      <button onClick={() => changeDate(1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronRight size={16}/></button>
                  </div>
                  
                  <button onClick={handleCopyYesterday} className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 px-3 py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm">
                      <Copy size={16}/> <span className="hidden sm:inline">Copy Yesterday</span>
                  </button>

                  <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white hover:bg-slate-700 px-3 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md">
                      <Printer size={16}/> <span className="hidden sm:inline">Print</span>
                  </button>

                  <button onClick={handleSave} disabled={isProcessing || !isDirty} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md ${isDirty ? 'bg-[#6D2158] text-white hover:bg-[#5a1b49]' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                      {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                      Save Allocations
                  </button>
              </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 flex overflow-x-auto no-scrollbar gap-1">
              {AREAS.map(tab => {
                  const isActive = activeArea === tab.id;
                  const count = allocations.filter(a => a.area === tab.id).length;
                  return (
                      <button
                          key={tab.id}
                          onClick={() => setActiveArea(tab.id)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                            isActive 
                              ? "bg-[#6D2158]/10 text-[#6D2158]" 
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                          }`}
                      >
                          <tab.icon size={16} />
                          {tab.label}
                          {count > 0 && (
                             <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[9px] ${isActive ? 'bg-[#6D2158] text-white' : 'bg-slate-200 text-slate-500'}`}>{count}</span>
                          )}
                      </button>
                  );
              })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              
              {/* LEFT PANEL: ASSIGNED HOSTS */}
              <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px] ${activeArea === 'villa' ? 'xl:col-span-3' : 'xl:col-span-2'}`}>
                  <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-[#6D2158]">
                              {(() => {
                                  const ActiveIcon = AREAS.find(a => a.id === activeArea)?.icon;
                                  return ActiveIcon ? <ActiveIcon size={20} /> : null;
                              })()}
                          </div>
                          <div>
                              <h2 className="text-sm font-bold text-slate-800">{AREAS.find(a => a.id === activeArea)?.label} Team</h2>
                              <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">{currentAreaHosts.length} Hosts Defaulted/Assigned</p>
                          </div>
                      </div>
                      
                      <div className="flex gap-2">
                          {activeArea !== 'villa' && (
                              <button onClick={() => setIsPasteModalOpen(true)} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                                  <Wand2 size={16}/> <span className="hidden sm:inline">Smart Paste</span>
                              </button>
                          )}
                          {activeArea === 'villa' && (
                              <button onClick={() => setIsAddHostModalOpen(true)} className="flex items-center gap-2 bg-white border border-slate-200 text-[#6D2158] hover:bg-slate-50 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                                  <Users size={16}/> Add Other Host
                              </button>
                          )}
                      </div>
                  </div>

                  <div className={`p-4 bg-slate-50/30 ${activeArea === 'villa' ? '' : 'flex-1 overflow-y-auto min-h-[500px]'}`}>
                      {currentAreaHosts.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 opacity-50 pt-20">
                              <UserCheck size={48} strokeWidth={1} />
                              <p className="text-sm font-bold">No hosts assigned to this area yet.</p>
                              <p className="text-xs">Add them from the available list.</p>
                          </div>
                      ) : (
                          <>
                              {activeArea === 'villa' ? (
                                  <div>
                                      {renderJettySection("Jetty A", JETTY_A, hostGroups.jettyA, "bg-blue-50/40")}
                                      {renderJettySection("Jetty B", JETTY_B, hostGroups.jettyB, "bg-indigo-50/40")}
                                      {renderJettySection("Jetty C", JETTY_C, hostGroups.jettyC, "bg-purple-50/40")}
                                      {renderJettySection("Beach Villas", BEACH, hostGroups.beach, "bg-amber-50/40")}
                                      {hostGroups.unassigned.length > 0 && renderJettySection("Unassigned Hosts", [], hostGroups.unassigned, "bg-slate-50")}
                                  </div>
                              ) : (
                                  <div className="space-y-3">
                                      {currentAreaHosts.map(host => {
                                          const alloc = allocations.find(a => String(a.host_id) === String(host.id));
                                          const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
                                          const shiftOptions = getShiftsForArea(activeArea);
                                          
                                          return (
                                              <div key={host.id} className={`bg-white border ${alloc ? 'border-emerald-200 shadow-md' : 'border-slate-200 opacity-70'} rounded-xl p-3 flex flex-col md:flex-row gap-4 items-start md:items-center transition-all`}>
                                                  <div className="flex items-center gap-3 w-full md:w-56 shrink-0">
                                                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 font-black ${alloc ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                                                          {displayName.charAt(0)}
                                                      </div>
                                                      <div className="overflow-hidden">
                                                          <p className="text-sm font-bold text-slate-800 truncate">{host.full_name}</p>
                                                          <div className="flex items-center gap-2 mt-0.5">
                                                              <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded truncate max-w-[100px]">{host.sub_department || host.role}</span>
                                                          </div>
                                                      </div>
                                                  </div>

                                                  <div className={`flex-1 w-full grid grid-cols-1 ${activeArea === 'admin' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
                                                      <div className={`sm:col-span-1 ${activeArea === 'admin' ? 'sm:col-span-2' : ''}`}>
                                                          <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 block mb-1">Shift</label>
                                                          <select 
                                                              className={`w-full bg-white border border-slate-200 text-xs font-bold rounded-lg p-2.5 outline-none focus:border-[#6D2158] ${!alloc ? 'text-slate-400' : 'text-slate-700'}`}
                                                              value={alloc?.shift || shiftOptions[0]}
                                                              onChange={(e) => handleAllocUpdate(host.id, 'shift', e.target.value)}
                                                          >
                                                              {shiftOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                                              {alloc?.shift && !shiftOptions.includes(alloc.shift) && <option value={alloc.shift}>{alloc.shift}</option>}
                                                          </select>
                                                      </div>
                                                      {activeArea !== 'admin' && (
                                                          <div className="sm:col-span-2">
                                                              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 block mb-1">Task / Assignment Details</label>
                                                              <input 
                                                                  type="text" 
                                                                  className={`w-full bg-white border border-slate-200 text-xs rounded-lg p-2.5 outline-none focus:border-[#6D2158] ${!alloc ? 'text-slate-400' : 'text-slate-700'}`}
                                                                  placeholder="e.g. Buggy 42, Morning Clean..."
                                                                  value={alloc?.task_details || ''}
                                                                  onChange={(e) => handleAllocUpdate(host.id, 'task_details', e.target.value)}
                                                              />
                                                          </div>
                                                      )}
                                                  </div>

                                                  <button 
                                                      onClick={() => handleRemove(host.id)}
                                                      className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0 md:self-center self-end absolute top-2 right-2 md:relative md:top-auto md:right-auto"
                                                      title="Clear Allocation"
                                                  >
                                                      <X size={18} />
                                                  </button>
                                              </div>
                                          );
                                      })}
                                  </div>
                              )}
                          </>
                      )}
                  </div>
              </div>

              {/* RIGHT PANEL: AVAILABLE HOSTS (HIDDEN FOR VILLA ATTENDANT) */}
              {activeArea !== 'villa' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[600px]">
                      <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
                          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Users size={16} className="text-slate-400"/> Add Other Hosts</h2>
                          <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input 
                                  type="text" 
                                  placeholder="Search available hosts..." 
                                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-400 shadow-sm"
                                  value={searchQuery}
                                  onChange={e => setSearchQuery(e.target.value)}
                              />
                          </div>
                      </div>

                      <div className="p-0 flex-1 overflow-y-auto custom-scrollbar">
                          {filteredAvailable.length === 0 ? (
                              <div className="text-center text-slate-400 text-xs py-10 font-medium">
                                  No matching hosts available to add.
                              </div>
                          ) : (
                              <div className="pb-4">
                                  {AREAS.map(area => {
                                      const hostsInGroup = filteredAvailable.filter(h => getDefaultArea(h) === area.id);
                                      if (hostsInGroup.length === 0) return null;
                                      
                                      return (
                                          <div key={area.id} className="mb-2">
                                              <div className="px-4 py-1.5 bg-slate-100 border-y border-slate-200 text-[9px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                                  <area.icon size={12} /> {area.label}
                                              </div>
                                              <div className="px-2 space-y-0.5 mt-1">
                                                  {hostsInGroup.map(host => {
                                                      const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
                                                      return (
                                                          <div key={host.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-colors group border border-transparent hover:border-slate-200">
                                                              <div className="flex items-center gap-3 overflow-hidden">
                                                                  <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 text-xs font-bold">
                                                                      {displayName.charAt(0)}
                                                                  </div>
                                                                  <div className="truncate">
                                                                      <p className="text-xs font-bold text-slate-700 truncate">{displayName}</p>
                                                                      <p className="text-[9px] text-slate-400 uppercase tracking-wider truncate mt-0.5">{host.role}</p>
                                                                  </div>
                                                              </div>
                                                              <button 
                                                                  onClick={() => handleAssign(host.id)}
                                                                  className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-[#6D2158] hover:border-[#6D2158]/30 hover:bg-[#6D2158]/10 rounded-lg transition-all shadow-sm shrink-0 opacity-100 md:opacity-0 group-hover:opacity-100"
                                                              >
                                                                  <Plus size={14} />
                                                              </button>
                                                          </div>
                                                      );
                                                  })}
                                              </div>
                                          </div>
                                      )
                                  })}
                              </div>
                          )}
                      </div>
                      <div className="p-3 bg-slate-50 border-t border-slate-200 rounded-b-2xl text-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{availableHosts.length} Hosts Unassigned</span>
                      </div>
                  </div>
              )}

          </div>
      </div>

      {/* ADD HOST MODAL (FOR VILLA ATTENDANT FULL WIDTH VIEW) */}
      {isAddHostModalOpen && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[80vh]">
                  <div className="bg-[#6D2158] p-5 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center gap-2"><Users size={18}/> Add Team Member to Area</h3>
                      <button onClick={() => setIsAddHostModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20"><X size={18}/></button>
                  </div>
                  <div className="p-4 border-b border-slate-200 bg-slate-50">
                      <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                              type="text" 
                              placeholder="Search available hosts..." 
                              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-[#6D2158] shadow-sm"
                              value={searchQuery}
                              onChange={e => setSearchQuery(e.target.value)}
                              autoFocus
                          />
                      </div>
                  </div>
                  <div className="p-0 flex-1 overflow-y-auto custom-scrollbar">
                      {filteredAvailable.length === 0 ? (
                          <div className="text-center text-slate-400 text-xs py-10 font-medium">
                              No matching hosts available to add.
                          </div>
                      ) : (
                          <div className="pb-4">
                              {AREAS.map(area => {
                                  const hostsInGroup = filteredAvailable.filter(h => getDefaultArea(h) === area.id);
                                  if (hostsInGroup.length === 0) return null;
                                  return (
                                      <div key={area.id} className="mb-2">
                                          <div className="px-4 py-1.5 bg-slate-100 border-y border-slate-200 text-[9px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                              <area.icon size={12} /> {area.label}
                                          </div>
                                          <div className="px-2 space-y-0.5 mt-1">
                                              {hostsInGroup.map(host => {
                                                  const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
                                                  return (
                                                      <div key={host.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-200">
                                                          <div className="flex items-center gap-3 overflow-hidden">
                                                              <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 text-xs font-bold">
                                                                  {displayName.charAt(0)}
                                                              </div>
                                                              <div className="truncate">
                                                                  <p className="text-xs font-bold text-slate-700 truncate">{displayName}</p>
                                                                  <p className="text-[9px] text-slate-400 uppercase tracking-wider truncate mt-0.5">{host.sub_department || host.role}</p>
                                                              </div>
                                                          </div>
                                                          <button 
                                                              onClick={() => { handleAssign(host.id); setIsAddHostModalOpen(false); }}
                                                              className="px-3 py-1.5 bg-white border border-slate-200 text-[#6D2158] hover:bg-[#6D2158]/10 rounded-lg transition-all shadow-sm text-xs font-bold"
                                                          >
                                                              Assign
                                                          </button>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                      </div>
                                  )
                              })}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* SMART PASTE MODAL */}
      {isPasteModalOpen && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="bg-indigo-600 p-5 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center gap-2"><Wand2 size={18}/> Smart Paste Extraction</h3>
                      <button onClick={() => setIsPasteModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-4 bg-slate-50">
                      <div className="bg-blue-50 border border-blue-200 text-blue-700 p-4 rounded-xl text-xs font-bold">
                          Paste your {AREAS.find(a => a.id === activeArea)?.label} assignments here (e.g. from WhatsApp). The AI will scan the text, find the host names, and automatically assign their Shift and Tasks!
                      </div>
                      <textarea 
                          className="w-full h-64 p-4 bg-white border border-slate-200 rounded-xl text-sm font-mono text-slate-700 outline-none focus:border-indigo-500 resize-none shadow-sm" 
                          placeholder="e.g.&#10;Yamin - Buggy 42&#10;Hussain - Off Duty&#10;Jeeth - PM Shift" 
                          value={pastedText} 
                          onChange={(e) => setPastedText(e.target.value)}
                          autoFocus
                      />
                      <div className="flex justify-end gap-3 mt-4">
                          <button onClick={() => setIsPasteModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-white hover:shadow-sm transition-all border border-slate-200">Cancel</button>
                          <button onClick={handlePasteSubmit} className="px-6 py-3 rounded-xl font-bold bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2">
                              <Wand2 size={16}/> Extract & Assign
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
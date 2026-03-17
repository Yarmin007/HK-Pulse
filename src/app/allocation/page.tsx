"use client";
import React, { useState, useEffect } from 'react';
import { 
  Users, Droplets, Leaf, Truck, UserCheck, Settings, LayoutDashboard, 
  Search, Plus, X, Calendar, Save, Printer, MapPin, Shirt, Loader2, Contact, 
  Briefcase, CheckCircle, Copy, ChevronLeft, ChevronRight, Wand2, Scissors, Pointer, BedDouble
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
    return ['Morning', 'Afternoon', 'Evening', 'Night', 'Split', 'Off', 'Annual Leave', 'Sick Leave', 'Unassigned'];
};

const getToday = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// --- VILLA GROUPINGS ---
const TOTAL_VILLAS = 97;
const JETTY_A = Array.from({length: 35}, (_, i) => i + 1);
const JETTY_B = Array.from({length: 14}, (_, i) => i + 37);
const JETTY_C = Array.from({length: 21}, (_, i) => i + 59);
const BEACH = [36, ...Array.from({length: 8}, (_, i) => i + 51), ...Array.from({length: 18}, (_, i) => i + 80)];

const parseVillas = (str: string): number[] => {
    if (!str) return [];
    const parts = str.split(',');
    const villas = new Set<number>();
    parts.forEach(p => {
        p = p.trim();
        if (!p) return;
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
  company_mobile?: string;
  personal_mobile?: string;
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
    arrival_time?: string;
    departure_time?: string;
};

const getDefaultArea = (host: Host) => {
    const sub = (host.sub_department || '').toLowerCase().trim();
    const role = (host.role || '').toLowerCase().trim();
    
    const check = (str: string) => {
        if (str.includes('tailor') || str.includes('seamstress')) return 'tailor';
        if (str.includes('villa') || str === 'va') return 'villa';
        if (str.includes('public') || str === 'pa' || str.includes('pa ')) return 'public';
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

// --- INLINE SEARCH COMPONENT FOR EMPTY BLOCKS ---
const EmptyBlockSearch = ({ jettyId, candidates, onAssign }: { jettyId: string, candidates: Host[], onAssign: (h: string) => void }) => {
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);

    const filtered = candidates.filter((h: Host) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return h.full_name.toLowerCase().includes(q) || (h.nicknames || '').toLowerCase().includes(q);
    });

    const displayList = query ? filtered : filtered.slice(0, 30);

    return (
        <div className="relative bg-[#6D2158] p-1 flex justify-center items-center border-b border-slate-400">
            <input 
                type="text"
                placeholder="+ Search & Add VA"
                className="w-full bg-white/10 text-white placeholder-white/70 text-[10px] font-bold outline-none text-center rounded py-1 px-2 focus:bg-white focus:text-slate-800 focus:placeholder-slate-400 transition-colors"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 200)}
            />
            {focused && (
                <div className="absolute top-full left-0 w-full max-h-48 overflow-y-auto bg-white border border-slate-300 shadow-2xl z-[60] rounded-b flex flex-col custom-scrollbar">
                    {displayList.length === 0 ? (
                        <span className="p-2 text-[10px] text-slate-500 text-center italic">No matches in Pool</span>
                    ) : (
                        displayList.map((h: Host) => {
                            const n = h.nicknames ? h.nicknames.split(',')[0] : h.full_name;
                            return (
                                <button 
                                    key={h.id}
                                    className="p-2 text-left text-[10px] font-bold text-slate-800 hover:bg-[#6D2158]/10 border-b border-slate-100 flex flex-col leading-tight"
                                    onClick={() => {
                                        onAssign(h.id);
                                        setQuery('');
                                    }}
                                >
                                    <span>{n}</span>
                                    <span className="font-normal opacity-60 text-[8px] uppercase tracking-wider mt-0.5">{h.sub_department || h.role}</span>
                                </button>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    );
};

export default function AllocationPage() {
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [hosts, setHosts] = useState<Host[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [masterList, setMasterList] = useState<GuestRecord[]>([]); 
  
  const [activeArea, setActiveArea] = useState('villa');
  const [searchQuery, setSearchQuery] = useState('');
  const [villaSearchQuery, setVillaSearchQuery] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [isAddHostModalOpen, setIsAddHostModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');

  const [selectedVA, setSelectedVA] = useState<string | null>(null);
  const [intendedJetties, setIntendedJetties] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
    setSelectedVA(null);
  }, [selectedDate, activeArea]);

  const fetchData = async () => {
      setIsProcessing(true);
      
      const { data: hostsData } = await supabase
          .from('hsk_hosts')
          .select('id, full_name, host_id, role, sub_department, mvpn, personal_mobile, company_mobile, nicknames')
          .eq('status', 'Active')
          .order('full_name');
          
      if (hostsData) setHosts(hostsData);

      const { data: allocData } = await supabase
          .from('hsk_allocations')
          .select('*')
          .eq('report_date', selectedDate);
          
      if (allocData) setAllocations(allocData);
      else setAllocations([]);

      const { data: guestData } = await supabase
          .from('hsk_daily_summary')
          .select('villa_number, status, arrival_time, departure_time')
          .eq('report_date', selectedDate);
      
      if (guestData) setMasterList(guestData);

      setIsDirty(false);
      setIsProcessing(false);
  };

  const handleBlockAssign = (hostId: string, jettyName: string) => {
      if (!hostId) return;
      
      const existingAlloc = allocations.find((a: Allocation) => String(a.host_id) === String(hostId));
      const filteredAllocs = allocations.filter((a: Allocation) => String(a.host_id) !== String(hostId));
      
      let shiftToSet = 'Split';
      if (existingAlloc && existingAlloc.shift !== 'Unassigned' && existingAlloc.shift !== 'Off') {
          shiftToSet = existingAlloc.shift;
      }

      setAllocations([...filteredAllocs, {
          report_date: selectedDate,
          host_id: hostId,
          area: activeArea,
          shift: shiftToSet,
          task_details: existingAlloc?.task_details || ''
      }]);
      
      setIntendedJetties(prev => ({ ...prev, [hostId]: jettyName }));
      setSelectedVA(hostId);
      setIsDirty(true);
  };

  const handleAssign = (hostId: string) => {
      if (allocations.some((a: Allocation) => String(a.host_id) === String(hostId))) return;
      const defaultShift = activeArea === 'admin' ? 'Straight (08:00 - 17:00)' : 
                           activeArea === 'villa' ? 'Unassigned' : 'Morning';
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
      setAllocations(allocations.filter((a: Allocation) => String(a.host_id) !== String(hostId)));
      if (selectedVA === hostId) setSelectedVA(null);
      setIntendedJetties(prev => {
          const next = { ...prev };
          delete next[hostId];
          return next;
      });
      setIsDirty(true);
  };

  const handleAllocUpdate = (hostId: string, field: keyof Allocation, value: string) => {
      const existingIndex = allocations.findIndex((a: Allocation) => String(a.host_id) === String(hostId));
      
      if (field === 'shift' && ['Unassigned', 'Off', 'Annual Leave', 'Sick Leave'].includes(value)) {
          setIntendedJetties(prev => {
              const next = { ...prev };
              delete next[hostId];
              return next;
          });
      }

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

  // --- EXCEL KEYPAD LOGIC FOR VILLA ATTENDANT BLOCKS ---
  const handleVillaInputChange = (hostId: string, index: number, value: string) => {
      const existingIndex = allocations.findIndex((a: Allocation) => String(a.host_id) === String(hostId));
      if (existingIndex >= 0) {
          const newAllocs = [...allocations];
          const alloc = newAllocs[existingIndex];
          
          let currentVillas = (alloc.task_details || '').split(',').map((s: string) => s.trim()).filter(s => s !== '');
          while(currentVillas.length <= index) currentVillas.push('');
          
          currentVillas[index] = value;
          
          newAllocs[existingIndex] = { ...alloc, task_details: currentVillas.join(',') };
          setAllocations(newAllocs);
          setIsDirty(true);
      }
  };

  const handleVillaInputBlur = (hostId: string, index: number, value: string) => {
      const existingIndex = allocations.findIndex((a: Allocation) => String(a.host_id) === String(hostId));
      if (existingIndex < 0) return;

      let newAllocs = [...allocations];
      let changed = false;

      // 1. If empty, clean the array so the row collapses
      if (!value.trim()) {
          const alloc = newAllocs[existingIndex];
          const currentVillas = (alloc.task_details || '').split(',').map(s => s.trim()).filter(s => s !== '');
          if (currentVillas.length !== (alloc.task_details || '').split(',').length) {
              newAllocs[existingIndex] = { ...alloc, task_details: currentVillas.join(',') };
              setAllocations(newAllocs);
              setIsDirty(true);
          }
          return;
      }

      const vNum = parseInt(value, 10);
      if (isNaN(vNum)) return;

      // 2. Anti-Duplication: Steal from others
      newAllocs = newAllocs.map((alloc: Allocation) => {
          if (String(alloc.host_id) === String(hostId)) return alloc;
          if (alloc.area !== 'villa') return alloc;
          
          let currentVillas = (alloc.task_details || '').split(',').map((s: string) => s.trim());
          if (currentVillas.includes(String(vNum))) {
              currentVillas = currentVillas.filter((v: string) => v !== String(vNum));
              changed = true;
              return { ...alloc, task_details: currentVillas.join(',') };
          }
          return alloc;
      });

      // 3. Anti-Duplication: Remove internal duplicates in the same host's block
      let myVillas = (newAllocs[existingIndex].task_details || '').split(',').map((s: string) => s.trim());
      const firstIdx = myVillas.indexOf(String(vNum));
      if (firstIdx !== -1 && firstIdx !== index) {
          myVillas[index] = ''; 
          changed = true;
      }
      
      // Clean up empty gaps
      const finalVillas = myVillas.filter(v => v.trim() !== '');
      newAllocs[existingIndex] = { ...newAllocs[existingIndex], task_details: finalVillas.join(',') };

      if (changed) {
          toast.success(`Villa ${vNum} reassigned to avoid duplicates.`);
      }
      
      setAllocations(newAllocs);
      setIsDirty(true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, hostId: string, index: number, maxIndex: number) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          if (index < maxIndex - 1) {
              document.getElementById(`input-${hostId}-${index + 1}`)?.focus();
          }
      } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (index > 0) {
              document.getElementById(`input-${hostId}-${index - 1}`)?.focus();
          }
      }
  };

  const handleVillaClick = (vNum: number) => {
      if (!selectedVA) {
          toast.error("Click a Villa Attendant's purple header first to select them!");
          return;
      }
      
      let newAllocs = [...allocations];
      let myAllocIndex = newAllocs.findIndex((a: Allocation) => String(a.host_id) === selectedVA);
      if (myAllocIndex < 0) return;

      newAllocs = newAllocs.map((alloc: Allocation) => {
          if (alloc.area !== 'villa') return alloc;
          let currentVillas = (alloc.task_details || '').split(',').map((s: string) => s.trim());
          if (currentVillas.includes(String(vNum))) {
              currentVillas = currentVillas.filter((v: string) => v !== String(vNum));
              return { ...alloc, task_details: currentVillas.join(',') };
          }
          return alloc;
      });

      const myAlloc = newAllocs[myAllocIndex];
      let myVillas = (myAlloc.task_details || '').split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
      
      if (myVillas.includes(String(vNum))) {
          myVillas = myVillas.filter((v: string) => v !== String(vNum)); 
      } else {
          myVillas.push(String(vNum));
          // Note: we don't automatically sort here because we want to preserve their manual entry order
      }
      
      newAllocs[myAllocIndex] = { ...myAlloc, task_details: myVillas.join(',') };
      setAllocations(newAllocs);
      setIsDirty(true);
  };

  const handleSave = async () => {
      setIsProcessing(true);
      await supabase.from('hsk_allocations').delete().eq('report_date', selectedDate);
      
      if (allocations.length > 0) {
          const payload = allocations.map((a: Allocation) => {
              const { id, ...rest } = a; 
              const cleaned = rest.task_details.split(',').filter((s: string) => s.trim() !== '').join(',');
              return { ...rest, task_details: cleaned };
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
          const newAllocs = yesterdayAllocs.map((a: any) => {
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
      if (!pastedText.trim()) return;
      setIsProcessing(true);
      setIsPasteModalOpen(false);
      
      const lines = pastedText.split('\n');
      const newAllocs = [...allocations];
      let matchCount = 0;

      lines.forEach((line: string) => {
          if (!line.trim()) return;
          const lineLower = line.toLowerCase();
          const matchedHost = hosts.find((h: Host) => {
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

              const existingIndex = newAllocs.findIndex((a: Allocation) => String(a.host_id) === String(matchedHost.id));
              if (existingIndex >= 0) {
                  newAllocs[existingIndex] = { ...newAllocs[existingIndex], shift, task_details: task, area: activeArea };
              } else {
                  newAllocs.push({ report_date: selectedDate, host_id: matchedHost.id, area: activeArea, shift, task_details: task });
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

  // --- STRICT COLOR LOGIC ---
  const getVillaData = (vNum?: number) => {
      if (!vNum) return null;
      const match = masterList.find((r: GuestRecord) => parseInt(r.villa_number) === vNum);
      const st = match?.status?.toUpperCase() || 'VAC';
      
      let colorClass = 'bg-white text-slate-800'; 
      let shortStatus = st;
      let timeStr = '';

      if (st.includes('ARR')) {
          colorClass = 'bg-green-500 text-white';
          if(match?.arrival_time) timeStr = match.arrival_time;
      } else if (st.includes('VAC') || st === 'VM/VAC') {
          colorClass = 'bg-sky-500 text-white';
          shortStatus = 'VAC';
      } else if (st.includes('TMA')) {
          colorClass = 'bg-yellow-400 text-slate-900';
      } else if (st.includes('DEP')) {
          colorClass = 'bg-rose-500 text-white';
          if(match?.departure_time) timeStr = match.departure_time;
      }

      return { status: shortStatus, colorClass, timeStr };
  };

  // --- FILTER LOGIC ---
  const currentAreaHosts = hosts.filter((h: Host) => {
      const existingAlloc = allocations.find((a: Allocation) => String(a.host_id) === String(h.id));
      if (existingAlloc) return existingAlloc.area === activeArea;
      return getDefaultArea(h) === activeArea;
  });

  // Preserve insertion order instead of alphabetical sort
  currentAreaHosts.sort((a: Host, b: Host) => {
      const idxA = allocations.findIndex((alloc: Allocation) => String(alloc.host_id) === String(a.id));
      const idxB = allocations.findIndex((alloc: Allocation) => String(alloc.host_id) === String(b.id));
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0; 
  });

  const availableHosts = hosts.filter((h: Host) => {
      const hasAlloc = allocations.some((a: Allocation) => String(a.host_id) === String(h.id));
      const isDefaultHere = getDefaultArea(h) === activeArea;
      return !hasAlloc && !isDefaultHere;
  });

  const filteredAvailable = availableHosts.filter((h: Host) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return h.full_name.toLowerCase().includes(q) || h.role.toLowerCase().includes(q) || (h.nicknames || '').toLowerCase().includes(q);
  });

  // --- VILLA ATTENDANT DATA GROUPINGS ---
  const hostGroups = {
      jettyA: [] as Host[],
      jettyB: [] as Host[],
      jettyC: [] as Host[],
      beach: [] as Host[],
      leave: [] as Host[]
  };

  const unassignedVAs: Host[] = [];
  const allAllocatedVillas = new Set<number>();

  if (activeArea === 'villa') {
      allocations.filter((a: Allocation) => a.area === 'villa').forEach((a: Allocation) => {
          parseVillas(a.task_details).forEach(v => allAllocatedVillas.add(v));
      });

      currentAreaHosts.forEach((host: Host) => {
          const alloc = allocations.find((a: Allocation) => String(a.host_id) === String(host.id));
          const shift = alloc?.shift || '';
          
          if (['Off', 'Annual Leave', 'Sick Leave'].includes(shift)) {
              hostGroups.leave.push(host);
              return;
          }

          const myVillas = parseVillas(alloc?.task_details || '');
          const intended = intendedJetties[host.id];
          
          // Strict Jetty Resolution Logic
          const targetJetty = intended || (
              myVillas.length === 0 ? null :
              JETTY_A.includes(myVillas[0]) ? 'jettyA' :
              JETTY_B.includes(myVillas[0]) ? 'jettyB' :
              JETTY_C.includes(myVillas[0]) ? 'jettyC' :
              BEACH.includes(myVillas[0]) ? 'beach' : 'jettyA'
          );

          if (!targetJetty || shift === 'Unassigned') {
              unassignedVAs.push(host);
          } else if (targetJetty === 'jettyA') {
              hostGroups.jettyA.push(host);
          } else if (targetJetty === 'jettyB') {
              hostGroups.jettyB.push(host);
          } else if (targetJetty === 'jettyC') {
              hostGroups.jettyC.push(host);
          } else if (targetJetty === 'beach') {
              hostGroups.beach.push(host);
          }
      });
  }

  const unallocatedVillas: number[] = [];
  if (activeArea === 'villa') {
      for (let i = 1; i <= TOTAL_VILLAS; i++) {
          if (!allAllocatedVillas.has(i)) unallocatedVillas.push(i);
      }
  }

  let searchedVillaAllocatedTo: string | null = null;
  if (villaSearchQuery && activeArea === 'villa') {
      const vNum = parseInt(villaSearchQuery, 10);
      if (!isNaN(vNum)) {
          const allocMatch = allocations.find((a: Allocation) => a.area === 'villa' && parseVillas(a.task_details).includes(vNum));
          if (allocMatch) {
              const h = hosts.find((h: Host) => String(h.id) === String(allocMatch.host_id));
              if (h) searchedVillaAllocatedTo = h.nicknames ? h.nicknames.split(',')[0] : h.full_name.split(' ')[0];
          }
      }
  }

  // Generate candidates for the Empty Block Search (ONLY those in the Unassigned Pool)
  const searchCandidates = unassignedVAs;

  // --- DENSE EXCEL BLOCK COMPONENT RENDERER ---
  const renderBlock = (host: Host | undefined, jettyId: string, key: string) => {
      if (!host) {
          return (
              <div key={key} className="flex flex-col bg-slate-50 border w-full border-slate-400 rounded-sm overflow-hidden shadow-sm h-full">
                  <EmptyBlockSearch jettyId={jettyId} candidates={searchCandidates} onAssign={(hId) => handleBlockAssign(hId, jettyId)} />
                  
                  <div className="bg-slate-100 border-b border-slate-400 text-[8px] font-mono text-slate-400 px-1 py-0.5 text-center truncate italic">
                      No Contact Info
                  </div>
                  <div className="grid grid-cols-2 bg-slate-200 border-b border-slate-400">
                      <div className="text-center font-black text-[8px] py-1 border-r border-slate-400 text-slate-700">VILLA NO</div>
                      <div className="text-center font-black text-[8px] py-1 text-slate-700">STATUS</div>
                  </div>
                  <div className="flex flex-col flex-1">
                      {Array.from({length: 9}).map((_, i) => (
                          <div key={`empty-${i}`} className="grid grid-cols-2 border-b border-slate-400 min-h-[24px] bg-white">
                              <div className="border-r border-slate-400"></div>
                              <div></div>
                          </div>
                      ))}
                  </div>
              </div>
          );
      }

      const alloc = allocations.find((a: Allocation) => String(a.host_id) === String(host.id));
      const myVillas = (alloc?.task_details || '').split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
      
      // Calculate how many rows to render: Always at least 9, plus an empty row at the bottom!
      const rowsCount = Math.max(9, myVillas.length + 1);
      const paddedVillas = Array.from({length: rowsCount}).map((_, i) => myVillas[i] || '');
      
      const isSelected = selectedVA === String(host.id);
      const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;

      const mvpnStr = host.mvpn ? `MVPN: ${host.mvpn}` : '';
      const dutyStr = host.company_mobile ? `Duty: ${host.company_mobile}` : '';
      const perStr = host.personal_mobile ? `Per: ${host.personal_mobile}` : '';
      const contactInfo = [mvpnStr, dutyStr, perStr].filter(Boolean).join(' | ') || 'No Contact Info';

      return (
          <div 
              key={key}
              onClick={() => setSelectedVA(host.id)}
              className={`flex flex-col bg-slate-50 border w-full rounded-sm overflow-hidden shadow-sm h-full cursor-pointer transition-all ${isSelected ? 'ring-2 ring-green-500 border-green-500 z-10' : 'border-slate-400 hover:border-slate-500'}`}
          >
              <div className={`p-1 flex justify-between items-center text-white border-b border-slate-400 ${isSelected ? 'bg-green-600' : 'bg-[#6D2158]'}`}>
                  <span className="text-[11px] font-bold pl-1 leading-tight">{displayName}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleRemove(host.id); }} className="text-white/60 hover:text-white px-1 shrink-0"><X size={12}/></button>
              </div>
              
              <div className="bg-slate-100 border-b border-slate-400 text-[7px] font-mono text-slate-600 px-1 py-0.5 text-center truncate">
                  {contactInfo}
              </div>

              <div className="grid grid-cols-2 bg-slate-200 border-b border-slate-400">
                  <div className="text-center font-black text-[8px] py-1 border-r border-slate-400 text-slate-700">VILLA NO</div>
                  <div className="text-center font-black text-[8px] py-1 text-slate-700">STATUS</div>
              </div>
              
              <div className="flex flex-col flex-1">
                  {paddedVillas.map((v, i) => {
                      const vNum = parseInt(v, 10);
                      const data = !isNaN(vNum) ? getVillaData(vNum) : null;
                      return (
                          <div key={i} className={`grid grid-cols-2 min-h-[24px] bg-white ${i < rowsCount - 1 ? 'border-b border-slate-400' : ''}`}>
                              <div className="border-r border-slate-400 p-0">
                                  <input 
                                      id={`input-${host.id}-${i}`}
                                      type="text"
                                      className="w-full h-full text-center font-bold text-[12px] outline-none focus:bg-indigo-50 text-slate-800 bg-transparent"
                                      value={v}
                                      onChange={(e) => handleVillaInputChange(host.id, i, e.target.value)}
                                      onBlur={(e) => handleVillaInputBlur(host.id, i, e.target.value)}
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
    <div className="min-h-screen bg-slate-100 p-2 md:p-4 pb-32">
      
      {/* HEADER */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-[#6D2158] rounded-full shrink-0"></div>
              <div>
                  <h1 className="text-lg font-black text-slate-800">Master Allocation</h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                     {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}
                  </p>
              </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                  <button onClick={() => changeDate(-1)} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ChevronLeft size={16}/></button>
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none px-1 cursor-pointer"/>
                  <button onClick={() => changeDate(1)} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ChevronRight size={16}/></button>
              </div>
              
              <button onClick={handleCopyYesterday} className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">
                  Copy Yesterday
              </button>

              <button onClick={handleSave} disabled={isProcessing || !isDirty} className={`px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm ${isDirty ? 'bg-[#6D2158] text-white hover:bg-[#5a1b49]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                  {isProcessing ? <Loader2 size={14} className="animate-spin inline mr-1"/> : null}
                  Save
              </button>
          </div>
      </div>

      {/* TABS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1.5 flex overflow-x-auto no-scrollbar gap-1 mb-4">
          {AREAS.map(tab => {
              const isActive = activeArea === tab.id;
              return (
                  <button
                      key={tab.id}
                      onClick={() => setActiveArea(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                        isActive ? "bg-[#6D2158]/10 text-[#6D2158]" : "text-slate-500 hover:bg-slate-50"
                      }`}
                  >
                      <tab.icon size={14} />
                      {tab.label}
                  </button>
              );
          })}
      </div>

      {/* --- VILLA ATTENDANT BOARD (EXCEL FLUID GRID) --- */}
      {activeArea === 'villa' ? (
          <div className="flex flex-col-reverse xl:flex-row gap-4 items-start w-full">
              
              {/* LEFT: THE DISPATCH GRIDS */}
              <div className="flex-1 w-full min-w-0 flex flex-col gap-4">
                  
                  {/* ROW 1: JETTY A (7 Blocks) */}
                  <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-300">
                      <div className="bg-[#6D2158] text-white font-black text-center py-1.5 text-[10px] tracking-widest uppercase rounded-sm mb-2">Jetty A</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 w-full">
                          {Array.from({length: 7}).map((_, i) => renderBlock(hostGroups.jettyA[i], 'jettyA', `A-${i}`))}
                      </div>
                  </div>

                  {/* ROW 2: JETTY B (3 Blocks) & JETTY C (4 Blocks) */}
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

                  {/* ROW 3: BEACH (7 Blocks) */}
                  <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-300">
                      <div className="bg-[#6D2158] text-white font-black text-center py-1.5 text-[10px] tracking-widest uppercase rounded-sm mb-2">Beach Villas</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 w-full">
                          {Array.from({length: 7}).map((_, i) => renderBlock(hostGroups.beach[i], 'beach', `Beach-${i}`))}
                      </div>
                  </div>

                  {/* UNALLOCATED / LEAVE / STATUS DROPDOWN SECTION */}
                  <div className="mt-4 bg-white p-4 rounded-xl border border-slate-300 shadow-sm">
                      <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                          <h3 className="text-xs font-black uppercase text-slate-700 tracking-widest">Unallocated & Leave Status</h3>
                          <button onClick={() => setIsAddHostModalOpen(true)} className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded font-bold flex items-center gap-1 transition-colors border border-slate-200 shadow-sm">
                              <Plus size={12}/> Pull Staff to Pool
                          </button>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                          {unassignedVAs.length === 0 && hostGroups.leave.length === 0 ? <span className="text-xs text-slate-400 italic">No unassigned staff.</span> : 
                              [...unassignedVAs, ...hostGroups.leave].map(h => {
                                  const alloc = allocations.find((a: Allocation) => String(a.host_id) === String(h.id));
                                  const n = h.nicknames ? h.nicknames.split(',')[0] : h.full_name.split(' ')[0];
                                  return (
                                      <div key={h.id} className="bg-slate-50 border border-slate-300 px-2 py-1.5 rounded flex items-center gap-2 shadow-sm">
                                          <span className="text-[11px] font-bold text-slate-800 truncate max-w-[100px]">{n}</span>
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
                                          <button onClick={() => handleRemove(h.id)} className="text-slate-400 hover:text-rose-500 ml-1"><X size={12}/></button>
                                      </div>
                                  )
                              })
                          }
                      </div>
                  </div>
              </div>

              {/* RIGHT: SEARCH & UNALLOCATED VILLAS */}
              <div className="w-full xl:w-48 shrink-0 flex flex-col gap-4 relative xl:sticky xl:top-6 z-20">
                  
                  {/* Villa Search */}
                  <div className="bg-white p-3 rounded-xl border border-slate-300 shadow-sm">
                      <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-2 flex items-center gap-1.5"><Search size={12}/> Find Villa</h3>
                      <input 
                          type="number" 
                          placeholder="Villa No..." 
                          className="w-full bg-slate-50 border border-slate-300 text-xs font-bold rounded p-2 outline-none focus:border-[#6D2158] mb-2 text-center"
                          value={villaSearchQuery}
                          onChange={e => setVillaSearchQuery(e.target.value)}
                      />
                      {villaSearchQuery && (
                          <div className={`p-2 rounded border flex flex-col text-center ${searchedVillaAllocatedTo ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-slate-100 border-slate-300 text-slate-500'}`}>
                              {searchedVillaAllocatedTo ? (
                                  <>
                                      <span className="text-[9px] uppercase font-black opacity-60">Allocated To</span>
                                      <span className="text-xs font-black">{searchedVillaAllocatedTo}</span>
                                  </>
                              ) : (
                                  <span className="text-[10px] font-black uppercase">Unallocated</span>
                              )}
                          </div>
                      )}
                  </div>

                  {/* Unallocated Villas Box */}
                  <div className="bg-white p-3 rounded-xl border border-slate-300 shadow-sm flex flex-col xl:max-h-[600px]">
                      <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-2 flex items-center justify-between border-b border-slate-200 pb-1">
                          Unallocated <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">{unallocatedVillas.length}</span>
                      </h3>
                      
                      <div className="text-[9px] font-bold text-slate-400 mb-2 leading-tight bg-slate-50 border border-slate-200 p-1.5 rounded text-center">
                          {!selectedVA ? (
                              <span className="text-amber-600 flex items-center justify-center gap-1"><Pointer size={10}/> Select VA Header First</span>
                          ) : (
                              <span className="text-emerald-600 flex items-center justify-center gap-1">✓ Click to assign</span>
                          )}
                      </div>

                      <div className="flex flex-wrap gap-1 custom-scrollbar overflow-y-auto pb-2 justify-center max-h-48 xl:max-h-full">
                          {unallocatedVillas.map(v => {
                              const vData = getVillaData(v);
                              return (
                                  <button 
                                      key={v}
                                      onClick={() => handleVillaClick(v)}
                                      className={`w-[34px] h-[30px] rounded border border-slate-300 shadow-sm flex items-center justify-center transition-all ${vData?.colorClass || 'bg-white'} hover:scale-105 active:scale-95`}
                                  >
                                      <span className="text-[11px] font-black leading-none">{v}</span>
                                  </button>
                              )
                          })}
                      </div>
                  </div>
              </div>
          </div>
      ) : (
          /* --- STANDARD DASHBOARD FOR OTHER AREAS --- */
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
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
                      
                      <button onClick={() => setIsPasteModalOpen(true)} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                          <Wand2 size={16}/> <span className="hidden sm:inline">Smart Paste</span>
                      </button>
                  </div>

                  <div className="p-4 flex-1 overflow-y-auto bg-slate-50/30 min-h-[500px]">
                      {currentAreaHosts.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 opacity-50 pt-20">
                              <UserCheck size={48} strokeWidth={1} />
                              <p className="text-sm font-bold">No hosts assigned to this area yet.</p>
                              <p className="text-xs">Add them from the available list on the right.</p>
                          </div>
                      ) : (
                          <div className="space-y-3">
                              {currentAreaHosts.map((host: Host) => {
                                  const alloc = allocations.find((a: Allocation) => String(a.host_id) === String(host.id));
                                  const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
                                  const shiftOptions = getShiftsForArea(activeArea);
                                  
                                  return (
                                      <div key={host.id} className={`bg-white border ${alloc ? 'border-emerald-300 shadow-md' : 'border-slate-300 opacity-70'} rounded-xl p-3 flex flex-col md:flex-row gap-4 items-start md:items-center transition-all`}>
                                          <div className="flex items-center gap-3 w-full md:w-56 shrink-0">
                                              <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 font-black ${alloc ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-300'}`}>
                                                  {displayName.charAt(0)}
                                              </div>
                                              <div className="overflow-hidden">
                                                  <p className="text-sm font-bold text-slate-800 truncate">{host.full_name}</p>
                                                  <div className="flex items-center gap-2 mt-0.5">
                                                      <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded truncate max-w-[100px] border border-slate-200">{host.sub_department || host.role}</span>
                                                  </div>
                                              </div>
                                          </div>

                                          <div className={`flex-1 w-full grid grid-cols-1 ${activeArea === 'admin' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
                                              <div className={`sm:col-span-1 ${activeArea === 'admin' ? 'sm:col-span-2' : ''}`}>
                                                  <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 block mb-1">Shift</label>
                                                  <select 
                                                      className={`w-full bg-white border border-slate-300 text-xs font-bold rounded-lg p-2.5 outline-none focus:border-[#6D2158] ${!alloc ? 'text-slate-400' : 'text-slate-700'}`}
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
                                                          className={`w-full bg-white border border-slate-300 text-xs rounded-lg p-2.5 outline-none focus:border-[#6D2158] ${!alloc ? 'text-slate-400' : 'text-slate-700'}`}
                                                          placeholder="e.g. Buggy 42, Morning Clean..."
                                                          value={alloc?.task_details || ''}
                                                          onChange={(e) => handleAllocUpdate(host.id, 'task_details', e.target.value)}
                                                      />
                                                  </div>
                                              )}
                                          </div>

                                          <button 
                                              onClick={() => handleRemove(host.id)}
                                              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0 md:self-center self-end absolute top-2 right-2 md:relative md:top-auto md:right-auto"
                                          >
                                              <X size={18} />
                                          </button>
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              </div>

              {/* RIGHT PANEL: AVAILABLE HOSTS */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[600px]">
                  <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
                      <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Users size={16} className="text-slate-400"/> Add Other Hosts</h2>
                      <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                              type="text" 
                              placeholder="Search available hosts..." 
                              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs outline-none focus:border-indigo-400 shadow-sm"
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
                                  const hostsInGroup = filteredAvailable.filter((h: Host) => getDefaultArea(h) === area.id);
                                  if (hostsInGroup.length === 0) return null;
                                  
                                  return (
                                      <div key={area.id} className="mb-2">
                                          <div className="px-4 py-1.5 bg-slate-100 border-y border-slate-200 text-[9px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                              <area.icon size={12} /> {area.label}
                                          </div>
                                          <div className="px-2 space-y-0.5 mt-1">
                                              {hostsInGroup.map((host: Host) => {
                                                  const displayName = host.nicknames ? host.nicknames.split(',')[0] : host.full_name;
                                                  return (
                                                      <div key={host.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-colors group border border-transparent hover:border-slate-300">
                                                          <div className="flex items-center gap-3 overflow-hidden">
                                                              <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0 text-xs font-bold border border-slate-300">
                                                                  {displayName.charAt(0)}
                                                              </div>
                                                              <div className="truncate">
                                                                  <p className="text-xs font-bold text-slate-700 truncate">{displayName}</p>
                                                                  <p className="text-[9px] text-slate-400 uppercase tracking-wider truncate mt-0.5">{host.role}</p>
                                                              </div>
                                                          </div>
                                                          <button 
                                                              onClick={() => handleAssign(host.id)}
                                                              className="p-1.5 bg-white border border-slate-300 text-slate-500 hover:text-[#6D2158] hover:border-[#6D2158]/50 hover:bg-[#6D2158]/10 rounded-lg transition-all shadow-sm shrink-0 opacity-100 md:opacity-0 group-hover:opacity-100"
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
              </div>
          </div>
      )}

      {/* ADD HOST MODAL (FOR VILLA ATTENDANT VIEW - PULL TO POOL) */}
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
                          <input 
                              type="text" 
                              placeholder="Search entire island staff..." 
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
                                  const hostsInGroup = filteredAvailable.filter((h: Host) => getDefaultArea(h) === area.id);
                                  if (hostsInGroup.length === 0) return null;
                                  return (
                                      <div key={area.id} className="mb-2">
                                          <div className="px-4 py-1.5 bg-slate-100 border-y border-slate-200 text-[9px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                              <area.icon size={12} /> {area.label}
                                          </div>
                                          <div className="px-2 space-y-0.5 mt-1">
                                              {hostsInGroup.map((host: Host) => {
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
                                                              Pull to Pool
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
    </div>
  );
}
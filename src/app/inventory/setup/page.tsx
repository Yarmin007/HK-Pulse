"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Calendar, Users, Plus, CheckCircle2, X, Settings, 
  Shield, Loader2, Search, Trash2, MapPin, Building,
  Layers, Lock, Unlock, BellRing, PackagePlus, Edit3, AlertTriangle, ArrowRight, Image as ImageIcon
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth } from 'date-fns';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import PageHeader from '@/components/PageHeader';

type Host = { host_id: string; full_name: string; role: string; };
type MasterItem = { article_number: string; article_name: string; category: string; inventory_type: string; is_minibar_item: boolean; image_url?: string; villa_location?: string; };

type Assignment = {
    id: string;
    schedule_id: string;
    host_id: string;
    villa_number: string;
    inventory_type: string;
    assigned_at?: string;
};

export default function InventorySettings() {
  const { confirmAction } = useConfirm();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'Allocations' | 'Items' | 'Types'>('Allocations');

  // --- DATA STATES ---
  const [invTypes, setInvTypes] = useState<any[]>([]);
  const [invLocations, setInvLocations] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<MasterItem[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  
  // --- TYPES & LOCATIONS STATE ---
  const [newType, setNewType] = useState('');
  const [newLoc, setNewLoc] = useState('');

  // --- ITEMS STATE ---
  const [itemSearch, setItemSearch] = useState('');
  
  // Dynamic list of unique locations currently in use
  const availableVillaLocations = useMemo(() => {
      const used = new Set(catalog.map(c => c.villa_location).filter(Boolean));
      return Array.from(used).sort() as string[];
  }, [catalog]);

  // --- ALLOCATIONS STATE ---
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
  const [monthSchedules, setMonthSchedules] = useState<any[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<any | null>(null);
  const [newScheduleType, setNewScheduleType] = useState('');
  
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  
  const [hostSearch, setHostSearch] = useState('');
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [locMode, setLocMode] = useState<'Villa' | 'Custom'>('Villa');
  
  // VILLA MULTI-SELECT STATE
  const [villaInput, setVillaInput] = useState('');
  const [selectedVillas, setSelectedVillas] = useState<string[]>([]);
  const [selectedCustomLoc, setSelectedCustomLoc] = useState('');

  // NOTIFICATION STATE
  const [customNotifyMsg, setCustomNotifyMsg] = useState('');

  useEffect(() => {
    const session = localStorage.getItem('hk_pulse_session');
    const adminFlag = localStorage.getItem('hk_pulse_admin_auth') === 'true' || (session && JSON.parse(session).system_role === 'admin');
    setIsAdmin(!!adminFlag);
    if (adminFlag) fetchData();
    else setIsLoading(false);
  }, []);

  useEffect(() => {
      if (selectedMonth) {
          fetchMonthSchedules(selectedMonth);
      }
  }, [selectedMonth]);

  const fetchData = async () => {
    setIsLoading(true);
    const [constRes, catRes, hostRes] = await Promise.all([
        supabase.from('hsk_constants').select('*').in('type', ['inv_type', 'inv_location']),
        supabase.from('hsk_master_catalog').select('*').order('article_name'),
        supabase.from('hsk_hosts').select('host_id, full_name, role').eq('status', 'Active').order('full_name')
    ]);

    if (constRes.data) {
        setInvTypes(constRes.data.filter(c => c.type === 'inv_type'));
        setInvLocations(constRes.data.filter(c => c.type === 'inv_location'));
    }
    if (catRes.data) setCatalog(catRes.data);
    if (hostRes.data) setHosts(hostRes.data);
    
    setIsLoading(false);
  };

  const fetchMonthSchedules = async (month: string) => {
      const { data } = await supabase.from('hsk_inventory_schedules').select('*').eq('month_year', month);
      
      const schedules = data || [];
      setMonthSchedules(schedules);
      
      if (schedules.length > 0) {
          const stillExists = activeSchedule && schedules.find(s => s.id === activeSchedule.id);
          if (!stillExists) {
              selectSchedule(schedules[0]);
          } else {
              selectSchedule(stillExists);
          }
      } else {
          setActiveSchedule(null);
          setAssignments([]);
      }
  };

  const selectSchedule = async (sched: any) => {
      setActiveSchedule(sched);
      setNewScheduleType(''); 
      setCustomNotifyMsg(''); 
      refreshAssignments(sched.id);
  };

  const refreshAssignments = async (scheduleId: string = activeSchedule?.id) => {
      if (!scheduleId) return;
      const { data } = await supabase.from('hsk_inventory_assignments').select('*').eq('schedule_id', scheduleId).order('assigned_at', { ascending: false });
      setAssignments(data || []);
  };

  const addConstant = async (type: 'inv_type' | 'inv_location', val: string, setter: any) => {
      if (!val.trim()) return;
      const { error } = await supabase.from('hsk_constants').insert({ type, label: val.trim() });
      if (!error) { toast.success('Added!'); setter(''); fetchData(); }
  };
  
  const deleteConstant = async (id: string) => {
      await supabase.from('hsk_constants').delete().eq('id', id);
      fetchData();
  };

  const updateItemType = async (article_number: string, newInvType: string) => {
      await supabase.from('hsk_master_catalog').update({ inventory_type: newInvType }).eq('article_number', article_number);
      setCatalog(catalog.map(c => c.article_number === article_number ? { ...c, inventory_type: newInvType } : c));
      toast.success('Item linked to inventory count type!');
  };

  const updateItemVillaLocation = async (article_number: string, newLocation: string) => {
      await supabase.from('hsk_master_catalog').update({ villa_location: newLocation }).eq('article_number', article_number);
  };

  const initializeSchedule = async () => {
      if (!selectedMonth || !newScheduleType) return;
      const { data, error } = await supabase.from('hsk_inventory_schedules').insert({ month_year: selectedMonth, inventory_type: newScheduleType, status: 'Draft' }).select().single();
      if (!error && data) { 
          toast.success('Schedule Created!'); 
          setNewScheduleType('');
          await fetchMonthSchedules(selectedMonth);
          selectSchedule(data);
      }
  };

  const deleteSchedule = async () => {
      if (!activeSchedule) return;
      
      const confirmed = await confirmAction({ 
          title: 'Delete Schedule?', 
          message: `Are you sure you want to permanently delete the ${activeSchedule.inventory_type} schedule for ${selectedMonth}? All assignments and records will be lost.`, 
          confirmText: 'Delete Permanently' 
      });
      
      if (confirmed) {
          await supabase.from('hsk_inventory_assignments').delete().eq('schedule_id', activeSchedule.id);
          await supabase.from('hsk_inventory_schedules').delete().eq('id', activeSchedule.id);
          
          toast.success('Schedule deleted completely.');
          setActiveSchedule(null);
          fetchMonthSchedules(selectedMonth);
      }
  };

  const toggleScheduleStatus = async () => {
      if (!activeSchedule) return;
      const newStatus = activeSchedule.status === 'Draft' ? 'Active' : 'Draft';
      const msg = newStatus === 'Active' ? 'Are you sure you want to UNLOCK this count? Staff will now see it on their devices.' : 'Are you sure you want to LOCK this count? Staff will no longer be able to submit records.';
      
      const confirmed = await confirmAction({ title: `${newStatus === 'Active' ? 'Unlock' : 'Lock'} Inventory?`, message: msg, confirmText: 'Yes, Proceed' });
      if (confirmed) {
          await supabase.from('hsk_inventory_schedules').update({ status: newStatus }).eq('id', activeSchedule.id);
          
          const updatedSched = { ...activeSchedule, status: newStatus };
          setActiveSchedule(updatedSched);
          setMonthSchedules(monthSchedules.map(s => s.id === activeSchedule.id ? updatedSched : s));
          toast.success(`Inventory is now ${newStatus}`);
      }
  };

  const sendBulkNotification = async () => {
      const bodyMsg = customNotifyMsg.trim() || `Please check your My Tasks dashboard to complete your count.`;
      toast.success('Sending notifications to allocated staff...');
      try {
          await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  title: `${activeSchedule.inventory_type} Count is LIVE!`, 
                  body: bodyMsg 
              })
          });
          setCustomNotifyMsg('');
      } catch(e) {}
  };

  // --- VILLA INPUT LOGIC ---
  const handleVillaKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          let val = villaInput.trim();
          if (!val) return;

          if (val.includes('-')) {
              const [startStr, endStr] = val.split('-');
              const start = parseInt(startStr, 10);
              const end = parseInt(endStr, 10);
              if (!isNaN(start) && !isNaN(end) && start <= end) {
                  const newRange = [];
                  for (let i = start; i <= end; i++) {
                      const vString = i.toString().padStart(2, '0');
                      if (!selectedVillas.includes(vString) && !assignments.some(a => a.villa_number === vString)) {
                          newRange.push(vString);
                      }
                  }
                  setSelectedVillas([...selectedVillas, ...newRange]);
              }
          } else {
              const vString = parseInt(val, 10).toString().padStart(2, '0');
              if (vString !== 'NaN' && !selectedVillas.includes(vString) && !assignments.some(a => a.villa_number === vString)) {
                  setSelectedVillas([...selectedVillas, vString]);
              }
          }
          setVillaInput('');
      }
  };

  const removeVilla = (v: string) => {
      setSelectedVillas(selectedVillas.filter(item => item !== v));
  };


  // --- ASSIGNMENT SUBMIT LOGIC ---
  const handleAssign = async () => {
      if (!selectedHost || !activeSchedule) return toast.error("Select staff and location.");
      
      const locationsToAssign = locMode === 'Villa' ? selectedVillas : [selectedCustomLoc];
      if (locationsToAssign.length === 0 || !locationsToAssign[0]) return toast.error("Select at least one location.");

      setIsLoading(true);

      const inserts = locationsToAssign.map(loc => ({
          schedule_id: activeSchedule.id,
          host_id: selectedHost.host_id,
          villa_number: loc,
          inventory_type: activeSchedule.inventory_type
      }));

      const { error } = await supabase.from('hsk_inventory_assignments').insert(inserts);
      
      setIsLoading(false);

      if (!error) { 
          toast.success(`Assigned ${locationsToAssign.length} location(s) to ${selectedHost.full_name}!`); 
          setSelectedVillas([]);
          setSelectedCustomLoc('');
          setSelectedHost(null);
          setHostSearch('');
          refreshAssignments(); 
      } else {
          toast.error("Failed to assign: " + error.message);
      }
  };

  const handleRemoveSingleAssignment = async (id: string) => {
      await supabase.from('hsk_inventory_assignments').delete().eq('id', id);
      refreshAssignments();
  };

  const handleRemoveHostAssignments = async (hostId: string) => {
      if (!confirm(`Are you sure you want to remove ALL assignments for this staff member?`)) return;
      await supabase.from('hsk_inventory_assignments').delete().eq('schedule_id', activeSchedule.id).eq('host_id', hostId);
      refreshAssignments();
      toast.success("Assignments removed.");
  };

  const groupedAssignments = useMemo(() => {
      const groups: Record<string, { host: Host | undefined, items: Assignment[] }> = {};
      
      assignments.forEach((a: Assignment) => {
          if (!groups[a.host_id]) {
              groups[a.host_id] = {
                  host: hosts.find(h => h.host_id === a.host_id),
                  items: []
              };
          }
          groups[a.host_id].items.push(a);
      });

      Object.values(groups).forEach(g => {
          g.items.sort((a, b) => {
              const numA = parseInt(a.villa_number) || 9999;
              const numB = parseInt(b.villa_number) || 9999;
              return numA - numB;
          });
      });

      return Object.values(groups);
  }, [assignments, hosts]);


  if (isLoading && !invTypes.length) return <div className="flex-1 flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;
  if (!isAdmin) return <div className="flex-1 flex items-center justify-center h-full"><Shield size={40} className="text-rose-500 animate-pulse"/></div>;

  return (
    <div className="flex flex-col min-h-full bg-[#FDFBFD] font-sans text-slate-800 pb-36">
      
      <PageHeader title="Inventory Settings" date={new Date()} onDateChange={() => {}} />

      <div className="px-4 md:px-8 mt-4 mb-4 md:mb-6 overflow-x-auto no-scrollbar flex gap-2">
          {[
              { id: 'Allocations', label: '1. Allocations & Dispatch' },
              { id: 'Items', label: '2. Master Items' },
              { id: 'Types', label: '3. Types & Locations' }
          ].map(tab => (
              <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-sm ${activeTab === tab.id ? 'bg-[#6D2158] text-white shadow-[#6D2158]/20 border border-[#6D2158]' : 'bg-white text-slate-500 border border-slate-200 hover:border-[#6D2158]'}`}
              >
                  {tab.label}
              </button>
          ))}
      </div>

      <div className="px-4 md:px-8 max-w-7xl mx-auto w-full">
          
          {/* TAB 1: ALLOCATIONS */}
          {activeTab === 'Allocations' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 animate-in fade-in">
                  
                  {/* LEFT COLUMN: Selector & Status */}
                  <div className="lg:col-span-4 space-y-4 md:space-y-6">
                      <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
                          <h3 className="font-black text-base md:text-lg mb-4 md:mb-5 flex items-center gap-2"><Calendar size={20} className="text-[#6D2158]"/> Period & Schedule</h3>
                          
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Target Month</label>
                              <input type="month" className="w-full p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[16px] md:text-sm outline-none focus:border-[#6D2158] mb-4 md:mb-6" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} />
                          </div>

                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Created Schedules</label>
                              <div className="space-y-2 md:space-y-3 mb-4 md:mb-6">
                                  {monthSchedules.length === 0 && <div className="text-xs text-slate-400 italic font-bold p-4 bg-slate-50 rounded-xl text-center border border-slate-100">No schedules created yet.</div>}
                                  {monthSchedules.map(sched => (
                                      <div 
                                          key={sched.id} 
                                          onClick={() => selectSchedule(sched)}
                                          className={`p-3 md:p-4 rounded-xl md:rounded-2xl border cursor-pointer flex justify-between items-center transition-all ${activeSchedule?.id === sched.id ? 'bg-[#6D2158] text-white border-[#6D2158] shadow-md scale-[1.02]' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-[#6D2158]'}`}
                                      >
                                          <span className="font-black text-sm md:text-base">{sched.inventory_type}</span>
                                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 md:px-2.5 py-1 md:py-1.5 rounded-lg ${activeSchedule?.id === sched.id ? 'bg-white/20' : (sched.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500')}`}>{sched.status}</span>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          <div className="pt-4 md:pt-5 border-t border-slate-100">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Initialize New Type</label>
                              <div className="flex gap-2">
                                  <select className="flex-1 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[16px] md:text-sm outline-none focus:border-[#6D2158]" value={newScheduleType} onChange={e=>setNewScheduleType(e.target.value)}>
                                      <option value="">Select Type...</option>
                                      {invTypes.filter(t => !monthSchedules.some(ms => ms.inventory_type === t.label)).map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                                  </select>
                                  <button onClick={initializeSchedule} disabled={!newScheduleType} className="bg-amber-500 text-white px-4 md:px-5 py-3 md:py-4 rounded-xl font-black uppercase text-xs shadow-md hover:bg-amber-600 disabled:opacity-50 active:scale-95 transition-all"><Plus size={20}/></button>
                              </div>
                          </div>
                      </div>

                      {activeSchedule && (
                          <div className={`p-4 md:p-6 rounded-2xl md:rounded-3xl border shadow-sm transition-all animate-in fade-in ${activeSchedule.status === 'Active' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                              <div className="flex items-center justify-between mb-4 md:mb-6">
                                  <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 ${activeSchedule.status === 'Active' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-200 text-slate-500'}`}>
                                          {activeSchedule.status === 'Active' ? <Unlock size={18}/> : <Lock size={18}/>}
                                      </div>
                                      <div>
                                          <div className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">Current Status</div>
                                          <div className={`font-black text-lg md:text-xl ${activeSchedule.status === 'Active' ? 'text-emerald-700' : 'text-slate-700'}`}>{activeSchedule.status === 'Active' ? 'UNLOCKED / LIVE' : 'LOCKED / DRAFT'}</div>
                                      </div>
                                  </div>
                                  <button onClick={deleteSchedule} title="Delete Schedule" className="p-2 text-rose-400 hover:bg-rose-100 hover:text-rose-600 rounded-xl transition-colors">
                                      <Trash2 size={20}/>
                                  </button>
                              </div>

                              <div className="space-y-3">
                                  <button onClick={toggleScheduleStatus} className={`w-full py-3 md:py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-colors ${activeSchedule.status === 'Active' ? 'bg-slate-800 text-white hover:bg-slate-900 shadow-md' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'}`}>
                                      {activeSchedule.status === 'Active' ? 'Lock Inventory' : 'Unlock Inventory'}
                                  </button>

                                  {/* CUSTOM NOTIFICATION PANEL */}
                                  {activeSchedule.status === 'Active' && (
                                      <div className="bg-white p-3 rounded-xl md:rounded-2xl border border-slate-200 mt-3 md:mt-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Custom Message</label>
                                          <textarea 
                                              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-emerald-400 transition-colors resize-none mb-2 custom-scrollbar"
                                              rows={2}
                                              placeholder="e.g., 'Please complete by 5 PM today!'"
                                              value={customNotifyMsg}
                                              onChange={(e) => setCustomNotifyMsg(e.target.value)}
                                          />
                                          <button onClick={sendBulkNotification} className="w-full py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-black uppercase text-[10px] md:text-xs tracking-widest hover:bg-emerald-100 transition-colors flex justify-center items-center gap-2">
                                              <BellRing size={14}/> Notify Staff
                                          </button>
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>

                  {/* RIGHT COLUMN: Assigner */}
                  {activeSchedule ? (
                      <div className="lg:col-span-8 bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row overflow-hidden min-h-[500px] animate-in fade-in">
                          
                          {/* Assignment Panel */}
                          <div className="md:w-1/2 p-4 md:p-6 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col bg-white">
                              <h4 className="font-black text-slate-800 mb-4 md:mb-6 flex items-center gap-2"><ArrowRight size={18} className="text-[#6D2158]"/> Dispatch Tasks</h4>
                              
                              <div className="space-y-4 md:space-y-6 flex-1">
                                  
                                  {/* 1. SMART HOST SEARCH */}
                                  <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-1.5 md:mb-2">1. Select Staff Member</label>
                                      
                                      {!selectedHost ? (
                                          <div className="relative">
                                              <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18}/>
                                              <input 
                                                  type="text" 
                                                  placeholder="Type staff name..." 
                                                  className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] md:text-sm font-bold outline-none focus:border-[#6D2158]" 
                                                  value={hostSearch} 
                                                  onChange={e => setHostSearch(e.target.value)} 
                                              />
                                              
                                              {hostSearch.length > 0 && (
                                                  <div className="absolute z-20 w-full mt-2 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl custom-scrollbar">
                                                      {hosts.filter(h => h.full_name.toLowerCase().includes(hostSearch.toLowerCase()) || h.host_id.includes(hostSearch)).map(host => (
                                                          <div key={host.host_id} onClick={() => { setSelectedHost(host); setHostSearch(''); }} className="p-4 cursor-pointer hover:bg-purple-50 transition-colors border-b border-slate-50 last:border-0 flex justify-between items-center group">
                                                              <span className="font-bold text-sm text-slate-700 group-hover:text-[#6D2158]">{host.full_name}</span>
                                                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">{host.role}</span>
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
                                          </div>
                                      ) : (
                                          <div className="flex justify-between items-center p-3 md:p-4 bg-purple-50 border border-purple-200 rounded-xl md:rounded-2xl shadow-sm">
                                              <div>
                                                  <div className="font-black text-[#6D2158] text-sm md:text-base">{selectedHost.full_name}</div>
                                                  <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mt-0.5">{selectedHost.role}</div>
                                              </div>
                                              <button onClick={() => setSelectedHost(null)} className="p-2 bg-white text-rose-500 rounded-lg md:rounded-xl shadow-sm hover:bg-rose-50 transition-colors"><X size={16}/></button>
                                          </div>
                                      )}
                                  </div>

                                  {/* 2. VILLA / CUSTOM SELECTOR */}
                                  <div className="opacity-100 transition-opacity">
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 md:mb-2 block">2. Select Locations</label>
                                      
                                      <div className="flex bg-slate-100 p-1.5 rounded-xl mb-3 md:mb-4">
                                          <button onClick={() => setLocMode('Villa')} className={`flex-1 py-1.5 md:py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${locMode === 'Villa' ? 'bg-white shadow text-slate-800 scale-100' : 'text-slate-500 scale-95'}`}>Villas</button>
                                          <button onClick={() => setLocMode('Custom')} className={`flex-1 py-1.5 md:py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${locMode === 'Custom' ? 'bg-white shadow text-slate-800 scale-100' : 'text-slate-500 scale-95'}`}>Other Areas</button>
                                      </div>

                                      {locMode === 'Villa' ? (
                                          <div className="space-y-3">
                                              <div className="relative">
                                                  <MapPin className="absolute left-3.5 top-3.5 text-slate-400" size={18}/>
                                                  <input 
                                                      type="text" 
                                                      placeholder="Type villa (e.g. 05 or 1-10) & press Enter" 
                                                      className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] md:text-sm font-bold outline-none focus:border-[#6D2158]" 
                                                      value={villaInput} 
                                                      onChange={e => setVillaInput(e.target.value)} 
                                                      onKeyDown={handleVillaKeyDown}
                                                  />
                                              </div>
                                              
                                              {/* Selected Villa Tokens */}
                                              {selectedVillas.length > 0 && (
                                                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl min-h-[60px]">
                                                      {selectedVillas.map(v => (
                                                          <div key={v} className="flex items-center gap-1.5 bg-[#6D2158] text-white px-2.5 py-1 rounded-lg text-xs md:text-sm font-black shadow-sm animate-in zoom-in">
                                                              {v}
                                                              <button onClick={() => removeVilla(v)} className="text-white/60 hover:text-white transition-colors ml-1"><X size={14}/></button>
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
                                          </div>
                                      ) : (
                                          <div>
                                              <select className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] md:text-sm font-bold outline-none focus:border-[#6D2158]" value={selectedCustomLoc} onChange={e=>setSelectedCustomLoc(e.target.value)}>
                                                  <option value="">Select from list...</option>
                                                  {invLocations.map(l => <option key={l.id} value={l.label}>{l.label}</option>)}
                                              </select>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              <div className="pt-4 md:pt-6 mt-4 border-t border-slate-100">
                                  <button onClick={handleAssign} disabled={isLoading || !selectedHost || (locMode === 'Villa' ? selectedVillas.length === 0 : !selectedCustomLoc)} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-[16px] md:text-sm shadow-lg hover:bg-[#5a1b49] active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-2">
                                      {isLoading ? <Loader2 size={18} className="animate-spin"/> : <Plus size={18}/>} 
                                      Dispatch {locMode === 'Villa' && selectedVillas.length > 0 ? `(${selectedVillas.length})` : ''}
                                  </button>
                              </div>
                          </div>

                          {/* Current Assignments List (GROUPED BY HOST) */}
                          <div className="md:w-1/2 bg-slate-50 p-4 md:p-6 flex flex-col h-full shrink-0">
                              <div className="flex justify-between items-center mb-4 md:mb-6">
                                  <h4 className="font-black text-slate-800 flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-500"/> Dispatched</h4>
                                  <span className="bg-white px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[9px] md:text-[10px] font-black text-slate-500 shadow-sm border border-slate-200">{assignments.length} Locations</span>
                              </div>
                              
                              <div className="flex-1 overflow-y-auto space-y-3 pr-1 md:pr-2 custom-scrollbar">
                                  {groupedAssignments.length === 0 ? (
                                      <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                                          <Box size={32} className="mb-2 opacity-50"/>
                                          <p className="font-bold text-sm">No active tasks</p>
                                      </div>
                                  ) : groupedAssignments.map(group => (
                                      <div key={group.host?.host_id || 'unknown'} className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm animate-in slide-in-from-right-2">
                                          <div className="flex justify-between items-center mb-2 md:mb-3 border-b border-slate-100 pb-2">
                                              <div className="flex items-center gap-2 md:gap-3">
                                                  <div className="w-8 h-8 md:w-10 md:h-10 bg-purple-50 text-[#6D2158] rounded-lg flex items-center justify-center font-black text-sm md:text-base shadow-inner">
                                                      {(group.host?.full_name || 'U').charAt(0)}
                                                  </div>
                                                  <div>
                                                      <div className="font-black text-xs md:text-sm text-slate-800">{group.host?.full_name || 'Unknown Staff'}</div>
                                                      <div className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{group.items.length} locations</div>
                                                  </div>
                                              </div>
                                              <button onClick={() => handleRemoveHostAssignments(group.host?.host_id || '')} className="text-slate-300 hover:text-rose-500 transition-colors p-1.5 bg-slate-50 hover:bg-rose-50 rounded-md" title="Remove all assignments for this host">
                                                  <Trash2 size={14}/>
                                              </button>
                                          </div>
                                          
                                          <div className="flex flex-wrap gap-1.5 mt-2 md:mt-3">
                                              {group.items.map((a: Assignment) => {
                                                  const isNumber = /^\d+$/.test(a.villa_number);
                                                  return (
                                                      <div key={a.id} className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md text-[10px] md:text-xs font-black text-slate-700 shadow-sm group/item">
                                                          {!isNumber && <Building size={10} className="text-slate-400"/>}
                                                          {a.villa_number}
                                                          <button onClick={() => handleRemoveSingleAssignment(a.id)} className="text-slate-400 hover:text-rose-500 ml-0.5 opacity-100 md:opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                              <X size={12}/>
                                                          </button>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  ) : (
                      // Empty state when no schedule is active
                      <div className="lg:col-span-8 flex flex-col items-center justify-center bg-white rounded-2xl md:rounded-3xl border border-slate-100 min-h-[300px] md:min-h-[500px] text-slate-400 p-6 md:p-8 text-center animate-in fade-in">
                          <PackagePlus size={48} className="mb-3 opacity-20 text-[#6D2158]"/>
                          <h3 className="text-lg md:text-xl font-black text-slate-600 mb-1.5">No Schedule Selected</h3>
                          <p className="text-xs md:text-sm font-bold max-w-md leading-relaxed">Select a created schedule from the left, or initialize a new inventory type to start dispatching tasks.</p>
                      </div>
                  )}
              </div>
          )}

          {/* TAB 2: ITEMS */}
          {activeTab === 'Items' && (
              <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in">
                  <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between gap-3 md:gap-4 md:items-center bg-slate-50">
                      <div>
                          <h3 className="font-black text-base md:text-lg flex items-center gap-2"><Box size={18} className="text-[#6D2158]"/> Item Linker</h3>
                          <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 md:mt-1">Assign Master Items to Types & Villa Locations</p>
                      </div>
                      <div className="flex gap-2 md:gap-3 w-full md:w-auto">
                          <div className="relative w-full md:w-80">
                              <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                              <input type="text" placeholder="Search catalog..." className="w-full pl-9 pr-3 py-2.5 md:py-3 bg-white border border-slate-200 rounded-xl text-[16px] md:text-sm font-bold outline-none focus:border-[#6D2158] shadow-sm" value={itemSearch} onChange={e=>setItemSearch(e.target.value)} />
                          </div>
                      </div>
                  </div>

                  {/* DESKTOP TABLE VIEW */}
                  <div className="hidden md:block overflow-x-auto max-h-[65vh] custom-scrollbar">
                      <table className="w-full text-left min-w-[800px]">
                          <thead className="bg-slate-100 sticky top-0 z-10 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200">
                              <tr>
                                  <th className="p-4 w-16">Pic</th>
                                  <th className="p-4">Item Details</th>
                                  <th className="p-4">Inventory Type (Count Group)</th>
                                  <th className="p-4">Villa Location (Physical Spot)</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {catalog.filter(i => {
                                  if (i.is_minibar_item && !itemSearch) return false;
                                  return (i.article_name||'').toLowerCase().includes(itemSearch.toLowerCase()) || i.article_number.includes(itemSearch);
                              }).map(item => (
                                  <tr key={item.article_number} className="hover:bg-slate-50 transition-colors">
                                      <td className="p-4">
                                          <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                                              {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="text-slate-300"/>}
                                          </div>
                                      </td>
                                      <td className="p-4">
                                          <div className="font-bold text-sm text-slate-800">{item.article_name}</div>
                                          <div className="text-[10px] text-slate-400 uppercase tracking-widest">{item.article_number} • {item.category}</div>
                                      </td>
                                      <td className="p-4">
                                          <select 
                                              className={`w-full p-3 border rounded-xl text-[16px] md:text-xs font-bold outline-none cursor-pointer transition-colors ${item.inventory_type ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-indigo-300'}`}
                                              value={item.inventory_type || ''}
                                              onChange={(e) => updateItemType(item.article_number, e.target.value)}
                                          >
                                              <option value="">-- Unlinked --</option>
                                              {invTypes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                                          </select>
                                      </td>
                                      <td className="p-4">
                                          <div className="relative">
                                              <MapPin className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={14}/>
                                              <input 
                                                  type="text" 
                                                  list="villa-locations"
                                                  placeholder="e.g. Wardrobe"
                                                  className={`w-full p-3 pl-9 border rounded-xl text-[16px] md:text-xs font-bold outline-none transition-colors ${item.villa_location ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300'}`}
                                                  value={item.villa_location || ''}
                                                  onChange={(e) => {
                                                      setCatalog(catalog.map(c => c.article_number === item.article_number ? { ...c, villa_location: e.target.value } : c));
                                                  }}
                                                  onBlur={(e) => {
                                                      updateItemVillaLocation(item.article_number, e.target.value);
                                                  }}
                                                  onKeyDown={(e) => {
                                                      if (e.key === 'Enter') e.currentTarget.blur();
                                                  }}
                                              />
                                              <datalist id="villa-locations">
                                                  {availableVillaLocations.map(loc => <option key={loc} value={loc} />)}
                                              </datalist>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* MOBILE CARD VIEW */}
                  <div className="md:hidden flex flex-col divide-y divide-slate-100 max-h-[65vh] overflow-y-auto custom-scrollbar bg-slate-50/50">
                      {catalog.filter(i => {
                          if (i.is_minibar_item && !itemSearch) return false;
                          return (i.article_name||'').toLowerCase().includes(itemSearch.toLowerCase()) || i.article_number.includes(itemSearch);
                      }).map(item => (
                          <div key={item.article_number} className="p-4 flex flex-col gap-3 bg-white">
                              <div className="flex gap-3 items-center">
                                  <div className="w-12 h-12 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                                      {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={20} className="text-slate-300"/>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <h4 className="font-black text-sm text-slate-800 truncate leading-tight">{item.article_name}</h4>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">{item.article_number} • {item.category}</p>
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                  <div>
                                      <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">Inv Type</label>
                                      <select 
                                          className={`w-full p-2.5 rounded-lg border text-xs font-bold outline-none transition-colors ${item.inventory_type ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                                          value={item.inventory_type || ''}
                                          onChange={(e) => updateItemType(item.article_number, e.target.value)}
                                      >
                                          <option value="">Unlinked</option>
                                          {invTypes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                                      </select>
                                  </div>
                                  <div className="relative">
                                      <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">Location</label>
                                      <MapPin className="absolute left-2 top-[22px] text-slate-400 pointer-events-none" size={12}/>
                                      <input 
                                          type="text" 
                                          list={`mobile-villa-locations-${item.article_number}`}
                                          placeholder="Wardrobe"
                                          className={`w-full p-2.5 pl-6 rounded-lg border text-xs font-bold outline-none transition-colors ${item.villa_location ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                                          value={item.villa_location || ''}
                                          onChange={(e) => {
                                              setCatalog(catalog.map(c => c.article_number === item.article_number ? { ...c, villa_location: e.target.value } : c));
                                          }}
                                          onBlur={(e) => {
                                              updateItemVillaLocation(item.article_number, e.target.value);
                                          }}
                                          onKeyDown={(e) => {
                                              if (e.key === 'Enter') e.currentTarget.blur();
                                          }}
                                      />
                                      <datalist id={`mobile-villa-locations-${item.article_number}`}>
                                          {availableVillaLocations.map(loc => <option key={loc} value={loc} />)}
                                      </datalist>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {/* TAB 3: TYPES & LOCATIONS */}
          {activeTab === 'Types' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 animate-in fade-in">
                  <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
                      <div className="flex items-center gap-3 mb-4 md:mb-6">
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Layers size={20}/></div>
                          <div><h3 className="font-black text-base md:text-lg">Inventory Types</h3><p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">e.g., Linen, Assets, Cutlery</p></div>
                      </div>
                      <div className="flex gap-2 mb-3 md:mb-4">
                          <input type="text" placeholder="Add new type..." className="input-field flex-1 text-[16px] md:text-sm" value={newType} onChange={e=>setNewType(e.target.value)} />
                          <button onClick={() => addConstant('inv_type', newType, setNewType)} className="px-5 md:px-6 py-2 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs shadow-md"><Plus size={18}/></button>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                          {invTypes.map(t => (
                              <div key={t.id} className="flex justify-between items-center p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-100 group">
                                  <span className="font-bold text-slate-700 text-xs md:text-sm">{t.label}</span>
                                  <button onClick={() => deleteConstant(t.id)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={16} className="md:w-[18px] md:h-[18px]"/></button>
                              </div>
                          ))}
                      </div>
                  </div>

                  <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
                      <div className="flex items-center gap-3 mb-4 md:mb-6">
                          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center"><Building size={20}/></div>
                          <div><h3 className="font-black text-base md:text-lg">Custom Locations</h3><p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">e.g., F&B Main, Spa</p></div>
                      </div>
                      <div className="flex gap-2 mb-3 md:mb-4">
                          <input type="text" placeholder="Add new location..." className="input-field flex-1 text-[16px] md:text-sm" value={newLoc} onChange={e=>setNewLoc(e.target.value)} />
                          <button onClick={() => addConstant('inv_location', newLoc, setNewLoc)} className="px-5 md:px-6 py-2 bg-amber-500 text-white rounded-xl font-bold uppercase text-xs shadow-md hover:bg-amber-600"><Plus size={18}/></button>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                          {invLocations.map(t => (
                              <div key={t.id} className="flex justify-between items-center p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-100 group">
                                  <span className="font-bold text-slate-700 text-xs md:text-sm">{t.label}</span>
                                  <button onClick={() => deleteConstant(t.id)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={16} className="md:w-[18px] md:h-[18px]"/></button>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}

      </div>
    </div>
  );
}
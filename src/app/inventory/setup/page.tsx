"use client";
import React, { useState, useEffect } from 'react';
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
type MasterItem = { article_number: string; article_name: string; category: string; inventory_type: string; is_minibar_item: boolean; image_url?: string; };

const QUICK_LOCATIONS = [
    'Pantry A', 'Pantry B', 'Pantry C', 'Main Laundry', 'HK Store', 
    'Public Area', 'Water Room', 'SPA', 'Water Sport', 
    'Tropic Surf', 'F&B Main', 'Airport Lounge'
];

export default function InventorySettings() {
  const { confirmAction } = useConfirm();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Types' | 'Items' | 'Allocations'>('Types');

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
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({ article_number: '', article_name: '', category: 'General', inventory_type: '' });

  // --- ALLOCATIONS STATE ---
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
  const [selectedType, setSelectedType] = useState('');
  const [activeSchedule, setActiveSchedule] = useState<any | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  
  const [hostSearch, setHostSearch] = useState('');
  const [selectedHost, setSelectedHost] = useState('');
  const [locMode, setLocMode] = useState<'Villa' | 'Custom'>('Villa');
  const [selectedVilla, setSelectedVilla] = useState('');
  const [selectedCustomLoc, setSelectedCustomLoc] = useState('');

  const allVillas = Array.from({length: 80}, (_, i) => (i + 1).toString().padStart(2, '0'));

  useEffect(() => {
    const session = localStorage.getItem('hk_pulse_session');
    const adminFlag = localStorage.getItem('hk_pulse_admin_auth') === 'true' || (session && JSON.parse(session).system_role === 'admin');
    setIsAdmin(!!adminFlag);
    if (adminFlag) fetchData();
    else setIsLoading(false);
  }, []);

  useEffect(() => {
      if (selectedMonth && selectedType) loadSchedule(selectedMonth, selectedType);
      else { setActiveSchedule(null); setAssignments([]); }
  }, [selectedMonth, selectedType]);

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

  const loadSchedule = async (month: string, type: string) => {
      const { data } = await supabase.from('hsk_inventory_schedules').select('*').eq('month_year', month).eq('inventory_type', type).maybeSingle();
      setActiveSchedule(data);
      if (data) {
          const { data: aData } = await supabase.from('hsk_inventory_assignments').select('*').eq('schedule_id', data.id).order('assigned_at', { ascending: false });
          setAssignments(aData || []);
      } else {
          setAssignments([]);
      }
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
      toast.success('Item linked to inventory type!');
  };

  const handleAddNewItem = async () => {
      if (!newItem.article_number || !newItem.article_name) return toast.error('ID and Name required.');
      const { error } = await supabase.from('hsk_master_catalog').insert({ ...newItem, unit: 'Each', is_minibar_item: false });
      if (error) return toast.error(error.message);
      toast.success('Item added to Master Catalog!');
      setIsAddItemModalOpen(false);
      setNewItem({ article_number: '', article_name: '', category: 'General', inventory_type: '' });
      fetchData();
  };

  const initializeSchedule = async () => {
      const { data, error } = await supabase.from('hsk_inventory_schedules').insert({ month_year: selectedMonth, inventory_type: selectedType, status: 'Draft' }).select().single();
      if (!error && data) { toast.success('Schedule Created!'); setActiveSchedule(data); }
  };

  const toggleScheduleStatus = async () => {
      if (!activeSchedule) return;
      const newStatus = activeSchedule.status === 'Draft' ? 'Active' : 'Draft';
      const msg = newStatus === 'Active' ? 'Are you sure you want to UNLOCK this count? Staff will now see it on their devices.' : 'Are you sure you want to LOCK this count? Staff will no longer be able to submit records.';
      
      const confirmed = await confirmAction({ title: `${newStatus === 'Active' ? 'Unlock' : 'Lock'} Inventory?`, message: msg, confirmText: 'Yes, Proceed' });
      if (confirmed) {
          await supabase.from('hsk_inventory_schedules').update({ status: newStatus }).eq('id', activeSchedule.id);
          setActiveSchedule({ ...activeSchedule, status: newStatus });
          toast.success(`Inventory is now ${newStatus}`);
      }
  };

  const sendBulkNotification = async () => {
      toast.success('Sending notifications to allocated staff...');
      try {
          await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: `${selectedType} Count is LIVE!`, body: `Please check your My Tasks dashboard to complete your count.` })
          });
      } catch(e) {}
  };

  const handleAssign = async () => {
      const locationToAssign = locMode === 'Villa' ? selectedVilla : selectedCustomLoc;
      if (!selectedHost || !locationToAssign || !activeSchedule) return toast.error("Select staff and location.");
      if (assignments.some(a => a.villa_number.toLowerCase() === locationToAssign.toLowerCase())) return toast.error("Already assigned!");

      const { error } = await supabase.from('hsk_inventory_assignments').insert({ schedule_id: activeSchedule.id, host_id: selectedHost, villa_number: locationToAssign, inventory_type: activeSchedule.inventory_type });
      if (!error) { toast.success("Assigned!"); loadSchedule(selectedMonth, selectedType); }
  };

  const handleRemoveAssignment = async (id: string) => {
      await supabase.from('hsk_inventory_assignments').delete().eq('id', id);
      loadSchedule(selectedMonth, selectedType);
  };

  if (isLoading) return <div className="flex-1 flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;
  if (!isAdmin) return <div className="flex-1 flex items-center justify-center h-full"><Shield size={40} className="text-rose-500 animate-pulse"/></div>;

  return (
    <div className="flex flex-col min-h-full bg-slate-50 font-sans text-slate-800 pb-32">
      
      <PageHeader title="Inventory Settings" date={new Date()} onDateChange={() => {}} />

      {/* TABS */}
      <div className="px-4 md:px-8 mt-4 mb-6 overflow-x-auto no-scrollbar flex gap-2">
          {['Types', 'Items', 'Allocations'].map(tab => (
              <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === tab ? 'bg-[#6D2158] text-white shadow-lg shadow-[#6D2158]/20' : 'bg-white text-slate-500 border border-slate-200 hover:border-[#6D2158]'}`}
              >
                  {tab === 'Types' ? '1. Types & Locations' : tab === 'Items' ? '2. Master Items' : '3. Allocations & Dispatch'}
              </button>
          ))}
      </div>

      <div className="px-4 md:px-8 max-w-7xl mx-auto w-full">
          
          {/* TAB 1: TYPES & LOCATIONS */}
          {activeTab === 'Types' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                      <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Layers size={20}/></div>
                          <div><h3 className="font-black text-lg">Inventory Types</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">e.g., Linen, Assets, Cutlery</p></div>
                      </div>
                      <div className="flex gap-2 mb-4">
                          <input type="text" placeholder="Add new type..." className="input-field flex-1 text-sm" value={newType} onChange={e=>setNewType(e.target.value)} />
                          <button onClick={() => addConstant('inv_type', newType, setNewType)} className="btn-primary !px-4"><Plus size={18}/></button>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                          {invTypes.map(t => (
                              <div key={t.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                                  <span className="font-bold text-slate-700">{t.label}</span>
                                  <button onClick={() => deleteConstant(t.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                              </div>
                          ))}
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                      <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center"><Building size={20}/></div>
                          <div><h3 className="font-black text-lg">Custom Locations</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">e.g., F&B Main, Spa</p></div>
                      </div>
                      <div className="flex gap-2 mb-4">
                          <input type="text" placeholder="Add new location..." className="input-field flex-1 text-sm" value={newLoc} onChange={e=>setNewLoc(e.target.value)} />
                          <button onClick={() => addConstant('inv_location', newLoc, setNewLoc)} className="btn-primary !px-4 !bg-amber-500 !shadow-amber-500/20 hover:!bg-amber-600 text-white"><Plus size={18}/></button>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                          {invLocations.map(t => (
                              <div key={t.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                                  <span className="font-bold text-slate-700">{t.label}</span>
                                  <button onClick={() => deleteConstant(t.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}

          {/* TAB 2: ITEMS */}
          {activeTab === 'Items' && (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in">
                  <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between gap-4 md:items-center bg-slate-50">
                      <div>
                          <h3 className="font-black text-lg flex items-center gap-2"><Box size={20} className="text-[#6D2158]"/> Item Linker</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Assign Master Catalog items to Inventory Types</p>
                      </div>
                      <div className="flex gap-3">
                          <div className="relative">
                              <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                              <input type="text" placeholder="Search catalog..." className="input-field pl-10 text-sm w-full md:w-64" value={itemSearch} onChange={e=>setItemSearch(e.target.value)} />
                          </div>
                      </div>
                  </div>

                  <div className="overflow-x-auto max-h-[60vh] custom-scrollbar">
                      <table className="w-full text-left">
                          <thead className="bg-slate-100 sticky top-0 z-10 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                              <tr>
                                  <th className="p-4 w-16">Pic</th>
                                  <th className="p-4">Item Details</th>
                                  <th className="p-4">Linked Inventory Type</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {catalog.filter(i => {
                                  // HIDDEN by default if it's a minibar item, unless they specifically search for it
                                  if (i.is_minibar_item && !itemSearch) return false;
                                  return i.article_name.toLowerCase().includes(itemSearch.toLowerCase()) || i.article_number.includes(itemSearch);
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
                                              className={`p-2 border rounded-xl text-xs font-bold outline-none cursor-pointer transition-colors ${item.inventory_type ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-indigo-300'}`}
                                              value={item.inventory_type || ''}
                                              onChange={(e) => updateItemType(item.article_number, e.target.value)}
                                          >
                                              <option value="">-- Unlinked --</option>
                                              {invTypes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                                          </select>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {/* TAB 3: ALLOCATIONS */}
          {activeTab === 'Allocations' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in">
                  {/* Left Column: Selector */}
                  <div className="lg:col-span-4 space-y-6">
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                          <h3 className="font-black text-lg mb-4 flex items-center gap-2"><Calendar size={20} className="text-[#6D2158]"/> Select Period</h3>
                          <div className="space-y-4">
                              <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Target Month</label>
                                  <input type="month" className="input-field mt-1 font-bold text-sm" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} />
                              </div>
                              <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Inventory Type</label>
                                  <select className="input-field mt-1 font-bold text-sm" value={selectedType} onChange={e=>setSelectedType(e.target.value)}>
                                      <option value="" disabled>Select Type...</option>
                                      {invTypes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                                  </select>
                              </div>
                          </div>
                      </div>

                      {selectedMonth && selectedType && !activeSchedule && (
                          <div className="bg-amber-50 p-6 rounded-3xl border border-amber-200 text-center animate-in zoom-in-95">
                              <AlertTriangle size={32} className="text-amber-400 mx-auto mb-3"/>
                              <h4 className="font-black text-amber-800 mb-1">No Schedule Found</h4>
                              <p className="text-xs text-amber-700 mb-4">You have not initialized the {selectedType} count for this month yet.</p>
                              <button onClick={initializeSchedule} className="w-full py-3 bg-amber-500 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-amber-600 transition-colors">Initialize Now</button>
                          </div>
                      )}

                      {activeSchedule && (
                          <div className={`p-6 rounded-3xl border shadow-sm transition-all ${activeSchedule.status === 'Active' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                              <div className="flex items-center gap-3 mb-4">
                                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${activeSchedule.status === 'Active' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-200 text-slate-500'}`}>
                                      {activeSchedule.status === 'Active' ? <Unlock size={20}/> : <Lock size={20}/>}
                                  </div>
                                  <div>
                                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Status</div>
                                      <div className={`font-black text-xl ${activeSchedule.status === 'Active' ? 'text-emerald-700' : 'text-slate-700'}`}>{activeSchedule.status === 'Active' ? 'UNLOCKED / LIVE' : 'LOCKED / DRAFT'}</div>
                                  </div>
                              </div>
                              <div className="space-y-2">
                                  <button onClick={toggleScheduleStatus} className={`w-full py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-colors ${activeSchedule.status === 'Active' ? 'bg-slate-800 text-white hover:bg-slate-900' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'}`}>
                                      {activeSchedule.status === 'Active' ? 'Lock Inventory' : 'Unlock Inventory'}
                                  </button>
                                  {activeSchedule.status === 'Active' && (
                                      <button onClick={sendBulkNotification} className="w-full py-3 bg-white text-emerald-600 border border-emerald-200 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-100 transition-colors flex justify-center items-center gap-2">
                                          <BellRing size={16}/> Notify Staff
                                      </button>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>

                  {/* Right Column: Assigner */}
                  {activeSchedule && (
                      <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row overflow-hidden min-h-[500px] animate-in fade-in">
                          
                          {/* Assignment Panel */}
                          <div className="md:w-1/2 p-6 border-r border-slate-100 flex flex-col h-full bg-white shrink-0">
                              <h4 className="font-black text-slate-800 mb-4 flex items-center gap-2"><ArrowRight size={16} className="text-[#6D2158]"/> Assign Location</h4>
                              
                              <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                  <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">1. Select Staff</label>
                                      <div className="relative mt-1">
                                          <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                                          <input type="text" placeholder="Search..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] mb-2" value={hostSearch} onChange={e=>setHostSearch(e.target.value)} />
                                      </div>
                                      <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 custom-scrollbar">
                                          {hosts.filter(h => h.full_name.toLowerCase().includes(hostSearch.toLowerCase()) || h.host_id.includes(hostSearch)).map(host => (
                                              <div key={host.host_id} onClick={() => setSelectedHost(host.host_id)} className={`p-2.5 cursor-pointer transition-colors text-xs font-bold flex justify-between items-center ${selectedHost === host.host_id ? 'bg-purple-50 text-[#6D2158]' : 'hover:bg-slate-50 text-slate-600'}`}>
                                                  <span>{host.full_name}</span><span className="text-[9px] text-slate-400 uppercase">{host.role}</span>
                                              </div>
                                          ))}
                                      </div>
                                  </div>

                                  <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">2. Select Location</label>
                                      <div className="flex bg-slate-100 p-1 rounded-xl mb-3">
                                          <button onClick={() => setLocMode('Villa')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${locMode === 'Villa' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>Villas</button>
                                          <button onClick={() => setLocMode('Custom')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${locMode === 'Custom' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>Other</button>
                                      </div>

                                      {locMode === 'Villa' ? (
                                          <div className="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                                              {allVillas.map(v => {
                                                  const isAssigned = assignments.some(a => a.villa_number === v);
                                                  return (
                                                      <button key={v} disabled={isAssigned} onClick={() => setSelectedVilla(v)} className={`py-2 rounded-lg font-black text-xs transition-all border ${isAssigned ? 'bg-slate-50 text-slate-300 border-transparent' : selectedVilla === v ? 'bg-[#6D2158] text-white border-[#6D2158] shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-[#6D2158]'}`}>{v}</button>
                                                  );
                                              })}
                                          </div>
                                      ) : (
                                          <div>
                                              <select className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158] mb-2" value={selectedCustomLoc} onChange={e=>setSelectedCustomLoc(e.target.value)}>
                                                  <option value="">Select from list...</option>
                                                  {invLocations.map(l => <option key={l.id} value={l.label}>{l.label}</option>)}
                                              </select>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              <div className="pt-4 mt-auto shrink-0 border-t border-slate-100">
                                  <button onClick={handleAssign} disabled={!selectedHost || (locMode === 'Villa' ? !selectedVilla : !selectedCustomLoc)} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-[#5a1b49] active:scale-95 transition-all disabled:opacity-50 flex justify-center items-center gap-2">
                                      <Plus size={16}/> Assign Selection
                                  </button>
                              </div>
                          </div>

                          {/* Current Assignments List */}
                          <div className="md:w-1/2 bg-slate-50 p-6 flex flex-col h-full shrink-0">
                              <div className="flex justify-between items-center mb-4">
                                  <h4 className="font-black text-slate-800 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500"/> Allocations</h4>
                                  <span className="bg-white px-3 py-1 rounded-lg text-[10px] font-black text-slate-500 shadow-sm border border-slate-200">{assignments.length} Total</span>
                              </div>
                              
                              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                  {assignments.length === 0 ? <div className="text-center py-10 text-slate-400 font-bold italic text-sm">No locations assigned yet.</div> : assignments.map(a => {
                                      const assignedHost = hosts.find(h => h.host_id === a.host_id);
                                      const isNumber = /^\d+$/.test(a.villa_number);
                                      return (
                                          <div key={a.id} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center group">
                                              <div className="flex items-center gap-3">
                                                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-sm text-slate-700 shrink-0">{isNumber ? a.villa_number : <Building size={16}/>}</div>
                                                  <div>
                                                      <div className="font-bold text-sm text-slate-800 leading-tight">
                                                          {!isNumber && <span className="block text-[#6D2158]">{a.villa_number}</span>}
                                                          {assignedHost?.full_name || a.host_id}
                                                      </div>
                                                  </div>
                                              </div>
                                              <button onClick={() => handleRemoveAssignment(a.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={16}/></button>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          )}

      </div>
    </div>
  );
}
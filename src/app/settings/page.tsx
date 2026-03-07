"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Save, Plus, Trash2, X, Search, Edit3, Image as ImageIcon,
  Layers, MapPin, Briefcase, Tag, AlertTriangle, Calendar, Building,
  Coffee, Droplet, Beer, Wine, Cookie, Zap, User, Eye, CheckCircle2,
  Cloud, Moon, Sun, Umbrella, Baby, Star, Box, Users, CheckCircle, Loader2, UploadCloud, Lock, Clock, ShoppingCart,
  Shield, KeyRound, History, Plane
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

const CATEGORY_ICONS: any = {
  'Soft Drinks': Coffee, 'Juices': Coffee, 'Water': Droplet,
  'Beer': Beer, 'Wines': Wine, 'Spirits': Wine,
  'Bites': Cookie, 'Sweets': Cookie, 'Retail': Zap,
  'Pillow Menu': Cloud, 'Baby Items': Baby, 'Toiletries': Droplet,
  'General Requests': Box, 'Chemicals': AlertTriangle, 'Linen': Layers
};

const MASTER_CATEGORIES = [
  'Bites', 'Sweets', 'Soft Drinks', 'Juices', 'Water', 'Beer', 'Spirits', 'Wines', 'Retail',
  'Pillow Menu', 'Baby Items', 'Toiletries', 'General Requests',
  'Chemicals', 'Linen', 'Stationery', 'Engineering', 'Cleaning Supplies'
];

type MasterItem = {
  article_number: string;
  article_name: string;   
  generic_name: string;   
  unit: string;
  category: string;
  is_minibar_item: boolean;
  micros_name: string;    
  sales_price: number;
  avg_cost: number;
  sort_order: number;
  image_url?: string; 
  has_expiry: boolean; 
  par_level: number;
  reorder_qty: number;
  primary_supplier: string;
};

type Constant = {
  id: string;
  type: string;
  label: string;
};

type Host = {
  id: string;
  full_name: string;
  host_id: string;
  role: string;
  system_role?: string;
  pin?: string;
  requires_pin_change?: boolean;
};

// --- HELPER COMPONENTS (Moved outside to prevent focus loss) ---

const ListManager = ({ type, title, icon: Icon, placeholder, constants, newConstantValue, activeConstantType, setActiveConstantType, setNewConstantValue, handleAddConstant, handleDeleteConstant }: any) => {
  const list = constants.filter((c: any) => c.type === type);
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-fit">
      <div className="flex items-center gap-2 mb-4 text-[#6D2158]"><Icon size={20} /><h3 className="text-lg font-bold">{title}</h3></div>
      <div className="flex gap-2 mb-4">
        <input 
          type="text" 
          placeholder={placeholder} 
          className="flex-1 p-3 border rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-[#6D2158]" 
          value={activeConstantType === type ? newConstantValue : ''} 
          onChange={(e) => { setActiveConstantType(type); setNewConstantValue(e.target.value); }}
        />
        <button onClick={() => handleAddConstant(type)} className="px-4 py-2 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs">Add</button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
         {list.map((item: any) => (
           <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg group hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100 transition-all">
              <span className="font-bold text-slate-600 text-sm">{item.label}</span>
              <button onClick={() => handleDeleteConstant(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
           </div>
         ))}
      </div>
    </div>
  );
};

const RankManager = ({ type, title, icon: Icon, constants, hosts, fetchConstants, handleDeleteConstant }: any) => {
  const list = constants.filter((c: any) => c.type === type).sort((a: Constant, b: Constant) => {
      const rankA = parseInt(a.label.split('::')[1] || '999');
      const rankB = parseInt(b.label.split('::')[1] || '999');
      return rankA - rankB;
  });
  
  const [roleName, setRoleName] = useState('');
  const [roleRank, setRoleRank] = useState('');

  const uniqueRoles = Array.from(new Set(hosts.map((h: any) => h.role).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b));

  const handleAdd = async () => {
      if (!roleName.trim() || !roleRank.trim()) return;
      const label = `${roleName.trim()}::${roleRank.trim()}`;
      const { error } = await supabase.from('hsk_constants').insert({ type, label });
      if (!error) { setRoleName(''); setRoleRank(''); fetchConstants(); toast.success("Role rank added!"); }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-fit">
      <div className="flex items-center gap-2 mb-4 text-[#6D2158]"><Icon size={20} /><h3 className="text-lg font-bold">{title}</h3></div>
      <p className="text-[10px] text-slate-400 mb-3 font-bold">Assign a rank (1 = Top) to sort roles across all lists.</p>
      <div className="flex gap-2 mb-4">
        <select 
          className="flex-1 p-3 border rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-[#6D2158]" 
          value={roleName} 
          onChange={(e) => setRoleName(e.target.value)}
        >
            <option value="" disabled>Select Role...</option>
            {uniqueRoles.map((role: any) => (
                <option key={role} value={role}>{role}</option>
            ))}
        </select>
        <input type="number" placeholder="Rank" className="w-20 p-3 border rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-[#6D2158]" value={roleRank} onChange={(e) => setRoleRank(e.target.value)}/>
        <button onClick={handleAdd} className="px-4 py-2 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs hover:bg-[#5a1b49] transition-colors">Add</button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
         {list.map((item: any) => {
           const [name, rank] = item.label.split('::');
           return (
           <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg group hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100 transition-all">
              <div>
                <span className="font-bold text-[#6D2158] bg-[#6D2158]/10 px-3 py-1 rounded text-xs mr-3">Rank {rank}</span>
                <span className="font-bold text-slate-600 text-sm">{name}</span>
              </div>
              <button onClick={() => handleDeleteConstant(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
           </div>
         )})}
      </div>
    </div>
  );
};

// --- MAIN PAGE ---

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('Master List');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [masterList, setMasterList] = useState<MasterItem[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const defaultItemState: MasterItem = {
    article_number: '', article_name: '', generic_name: '', unit: 'Each', category: 'General Requests',
    is_minibar_item: false, micros_name: '', sales_price: 0, avg_cost: 0, sort_order: 0,
    image_url: '', has_expiry: false, par_level: 0, reorder_qty: 0, primary_supplier: ''
  };
  
  const [currentItem, setCurrentItem] = useState<MasterItem>(defaultItemState);
  const [constants, setConstants] = useState<Constant[]>([]);
  const [newConstantValue, setNewConstantValue] = useState('');
  const [activeConstantType, setActiveConstantType] = useState('');

  const [systemTimezone, setSystemTimezone] = useState('Indian/Maldives');

  const [gemName, setGemName] = useState('');
  const [gemMvpn, setGemMvpn] = useState('');

  // --- ACCESS CONTROL STATE ---
  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostSearch, setHostSearch] = useState('');
  const [selectedLogHost, setSelectedLogHost] = useState<Host | null>(null);
  const [hostLogs, setHostLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // --- DASHBOARD VIEW ACCESS STATE ---
  const [configId, setConfigId] = useState<string | null>(null);
  const [supervisorAccess, setSupervisorAccess] = useState<Record<string, string[]>>({});
  const [accessModalHost, setAccessModalHost] = useState<Host | null>(null);
  const [accessSearchQuery, setAccessSearchQuery] = useState('');

  // --- PUBLIC HOLIDAY STATE ---
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');

  // --- EXPIRY BATCH MANAGER STATE ---
  const [selectedExpiryItem, setSelectedExpiryItem] = useState<MasterItem | null>(null);
  const [itemBatches, setItemBatches] = useState<any[]>([]);
  const [newBatchDate, setNewBatchDate] = useState('');
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);

  useEffect(() => { fetchMasterList(); fetchConstants(); fetchHosts(); }, []);

  const fetchMasterList = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) setMasterList(data);
  };

  const fetchConstants = async () => {
    const { data } = await supabase.from('hsk_constants').select('*').order('label');
    if (data) {
        setConstants(data);
        const tz = data.find((c: Constant) => c.type === 'system_timezone')?.label || 'Indian/Maldives';
        setSystemTimezone(tz);

        const tConf = data.find((c: Constant) => c.type === 'team_viewer_config');
        if (tConf) {
            setConfigId(tConf.id);
            try { 
                const parsed = JSON.parse(tConf.label);
                setSupervisorAccess(parsed.supervisorAccess || {}); 
            } catch(e){}
        }
    }
  };

  const fetchHosts = async () => {
    const [hostRes, constRes] = await Promise.all([
        supabase.from('hsk_hosts').select('*'),
        supabase.from('hsk_constants').select('*').eq('type', 'role_rank')
    ]);
    
    if (hostRes.data) {
        let roleRanks: Record<string, number> = {};
        if (constRes.data) {
            constRes.data.forEach((c: Constant) => {
                const [role, rank] = c.label.split('::');
                if (role && rank) roleRanks[role.toLowerCase().trim()] = parseInt(rank, 10);
            });
        }

        const sortedHosts = [...hostRes.data].sort((a: any, b: any) => {
            const rankA = roleRanks[(a.role || '').toLowerCase().trim()] ?? 999;
            const rankB = roleRanks[(b.role || '').toLowerCase().trim()] ?? 999;
            if (rankA !== rankB) return rankA - rankB;
            const numA = parseInt((a.host_id || '').replace(/\D/g, ''), 10) || 999999;
            const numB = parseInt((b.host_id || '').replace(/\D/g, ''), 10) || 999999;
            return numA - numB;
        });
        setHosts(sortedHosts);
    }
  };

  const handleEditItem = (item: MasterItem) => {
    setCurrentItem(item);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setCurrentItem({ ...defaultItemState, is_minibar_item: activeTab === 'Minibar Menu' });
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) return;
      setIsUploading(true);
      const file = event.target.files[0];
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('item-images').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('item-images').getPublicUrl(fileName);
      setCurrentItem({ ...currentItem, image_url: data.publicUrl });
    } catch (error: any) {
      alert('Upload Error: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveItem = async () => {
    if (!currentItem.article_number || !currentItem.article_name) return alert("Article Number and Name are required.");
    const finalData = {
      ...currentItem,
      generic_name: currentItem.generic_name || currentItem.article_name,
      micros_name: currentItem.is_minibar_item && !currentItem.micros_name ? currentItem.article_name : currentItem.micros_name,
    };
    const { error } = await supabase.from('hsk_master_catalog').upsert(finalData, { onConflict: 'article_number' });
    if (error) { alert("Error saving: " + error.message); } 
    else { setIsFormOpen(false); setIsEditing(false); setCurrentItem(defaultItemState); fetchMasterList(); }
  };

  const handleDeleteItem = async (id: string) => {
    if(!confirm("Delete this item?")) return;
    await supabase.from('hsk_master_catalog').delete().eq('article_number', id);
    fetchMasterList();
  };

  const handleAddConstant = async (type: string) => {
    if (!newConstantValue.trim()) return;
    const { error } = await supabase.from('hsk_constants').insert({ type, label: newConstantValue });
    if (!error) { setNewConstantValue(''); fetchConstants(); }
  };

  const handleAddHoliday = async () => {
    if (!holidayName.trim() || !holidayDate) return toast.error("Please enter both the date and the name of the holiday.");
    const label = `${holidayDate}::${holidayName.trim()}`;
    const { error } = await supabase.from('hsk_constants').insert({ type: 'public_holiday', label });
    if (!error) { setHolidayName(''); setHolidayDate(''); fetchConstants(); toast.success("Public Holiday Added!"); }
  };

  const handleAddGem = async () => {
    if (!gemName.trim() || !gemMvpn.trim()) return alert("Please enter both Name and MVPN");
    const label = `${gemName.trim()} - ${gemMvpn.trim()}`;
    const { error } = await supabase.from('hsk_constants').insert({ type: 'gem', label });
    if (!error) { setGemName(''); setGemMvpn(''); fetchConstants(); }
  };

  const handleDeleteConstant = async (id: string) => {
    if (!confirm('Remove?')) return;
    await supabase.from('hsk_constants').delete().eq('id', id);
    fetchConstants();
  };

  const handleSaveSystemConfig = async (type: string, val: string) => {
    setIsUploading(true);
    await supabase.from('hsk_constants').delete().eq('type', type);
    await supabase.from('hsk_constants').insert({ type, label: val });
    if(type === 'system_timezone') localStorage.setItem('hk_pulse_timezone', val);
    setIsUploading(false);
    toast.success('System config updated successfully!');
  };

  const updateHostRole = async (id: string, newRole: string) => {
      await supabase.from('hsk_hosts').update({ system_role: newRole }).eq('id', id);
      setHosts(hosts.map(h => h.id === id ? { ...h, system_role: newRole } : h));
      toast.success("Role updated successfully!");
  };

  const resetHostPin = async (id: string, name: string) => {
      if(!confirm(`Reset PIN for ${name} to '0000'? They will be forced to change it on next login.`)) return;
      await supabase.from('hsk_hosts').update({ pin: '0000', requires_pin_change: true }).eq('id', id);
      setHosts(hosts.map(h => h.id === id ? { ...h, pin: '0000', requires_pin_change: true } : h));
      toast.success(`PIN reset to 0000 for ${name}`);
  };

  const viewHostLogs = async (host: Host) => {
      setSelectedLogHost(host);
      setHostLogs([]);
      setIsLoadingLogs(true);
      const { data } = await supabase.from('hsk_daily_requests')
          .select('*')
          .ilike('attendant_name', `%${host.full_name.split(' ')[0]}%`)
          .order('request_time', { ascending: false })
          .limit(50);
      setHostLogs(data || []);
      setIsLoadingLogs(false);
  };

  const saveTeamConfig = async () => {
      setIsUploading(true);
      let currentConfig: any = {};
      if (configId) {
          const { data } = await supabase.from('hsk_constants').select('label').eq('id', configId).single();
          if (data) { try { currentConfig = JSON.parse(data.label); } catch(e){} }
      }
      currentConfig.supervisorAccess = supervisorAccess;
      const payload = JSON.stringify(currentConfig);
      if (configId) {
          await supabase.from('hsk_constants').update({ label: payload }).eq('id', configId);
      } else {
          const { data } = await supabase.from('hsk_constants').insert({ type: 'team_viewer_config', label: payload }).select().single();
          if (data) setConfigId(data.id);
      }
      setIsUploading(false);
      toast.success("View Access Settings Saved!");
  };

  const handleOpenExpiryBatches = async (item: MasterItem) => {
      setSelectedExpiryItem(item);
      setIsLoadingBatches(true);
      const { data } = await supabase.from('hsk_expiry_batches').select('*').eq('article_number', item.article_number).neq('status', 'Archived').order('expiry_date', { ascending: true });
      setItemBatches(data || []);
      setIsLoadingBatches(false);
  };

  const handleAddBatchDate = async () => {
      if (!newBatchDate || !selectedExpiryItem) return;
      if (itemBatches.find(b => b.expiry_date === newBatchDate)) return toast.error('Batch date already exists!');
      const { error } = await supabase.from('hsk_expiry_batches').insert({ article_number: selectedExpiryItem.article_number, expiry_date: newBatchDate, status: 'Active' });
      if (!error) { setNewBatchDate(''); toast.success('Batch added!'); handleOpenExpiryBatches(selectedExpiryItem); }
      else toast.error('Failed to add batch');
  };

  const handleArchiveBatch = async (batchId: string) => {
      if (!confirm('Are you sure?')) return;
      const { error } = await supabase.from('hsk_expiry_batches').update({ status: 'Archived' }).eq('id', batchId);
      if (!error) { toast.success('Removed!'); if (selectedExpiryItem) handleOpenExpiryBatches(selectedExpiryItem); }
      else toast.error('Failed to remove batch');
  };

  const filteredList = masterList.filter(item => 
    item.article_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.article_number.includes(searchQuery)
  ).filter(item => {
    if (activeTab === 'Minibar Menu') return item.is_minibar_item;
    if (activeTab === 'Master List') return !item.is_minibar_item;
    if (activeTab === 'Expiry Setup') return item.has_expiry;
    return true;
  });

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      <div className="border-b border-slate-200 pb-6 mb-6 flex justify-between items-end">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-800">System Settings</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Configuration & Master Data</p>
        </div>
        {activeTab === 'Access Control' && (
            <button onClick={saveTeamConfig} disabled={isUploading} className="bg-emerald-600 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest shadow-md flex items-center gap-2 hover:bg-emerald-500 transition-colors">
                {isUploading ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Save View Access
            </button>
        )}
      </div>

      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar">
         {['Master List', 'Minibar Menu', 'Expiry Setup', 'GEM Directory', 'System Config', 'Access Control'].map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setIsFormOpen(false); }} className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${activeTab === tab ? 'bg-[#6D2158] text-white shadow-lg shadow-[#6D2158]/20' : 'bg-white text-slate-400 border border-slate-100 hover:border-[#6D2158]'}`}>{tab}</button>
         ))}
      </div>

      {activeTab === 'Access Control' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in slide-in-from-right-4 duration-300">
              <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between md:items-center gap-4 bg-slate-50">
                  <div>
                      <h3 className="font-bold text-[#6D2158] uppercase tracking-widest text-sm flex items-center gap-2"><Shield size={16}/> Access & Roles</h3>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">Manage admin privileges, Dashboard Team View Access, and logs.</p>
                  </div>
                  <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="relative w-full md:w-64">
                          <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                          <input type="text" placeholder="Search staff..." className="w-full pl-10 pr-4 py-2 border border-slate-200 bg-white rounded-xl text-xs font-bold outline-none focus:border-[#6D2158]" value={hostSearch} onChange={e => setHostSearch(e.target.value)} />
                      </div>
                  </div>
              </div>
              <div className="overflow-x-auto pb-32">
                  <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase">Staff Member</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase">Dashboard View Access</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase">System Role</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase">PIN Status</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase text-right">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                          {hosts.filter(h => h.full_name.toLowerCase().includes(hostSearch.toLowerCase()) || h.host_id.includes(hostSearch)).map(host => (
                              <tr key={host.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-4">
                                      <div className="font-bold text-slate-800 text-sm">{host.full_name}</div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{host.host_id} • {host.role}</div>
                                  </td>
                                  <td className="p-4">
                                      {host.system_role === 'admin' ? (
                                          <span className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 w-max">
                                              <CheckCircle2 size={14}/> Full Access
                                          </span>
                                      ) : (
                                          <button 
                                              onClick={() => { setAccessSearchQuery(''); setAccessModalHost(host); }}
                                              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors border ${
                                                  (supervisorAccess[host.host_id] || []).length > 0 
                                                  ? 'bg-purple-50 text-[#6D2158] border-purple-200 hover:bg-purple-100' 
                                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                              }`}
                                          >
                                              <Eye size={14}/> 
                                              {(supervisorAccess[host.host_id] || []).length} Visible
                                          </button>
                                      )}
                                  </td>
                                  <td className="p-4">
                                      <select className="p-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 outline-none focus:border-[#6D2158] cursor-pointer" value={host.system_role || 'staff'} onChange={(e) => updateHostRole(host.id, e.target.value)}>
                                          <option value="staff">Staff</option>
                                          <option value="admin">Admin</option>
                                      </select>
                                  </td>
                                  <td className="p-4">
                                      {host.requires_pin_change ? <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border border-amber-200">Needs Reset</span> : <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border border-emerald-200">Active</span>}
                                  </td>
                                  <td className="p-4 text-right flex justify-end gap-2">
                                      <button onClick={() => resetHostPin(host.id, host.full_name)} className={`p-2 bg-white border rounded-lg shadow-sm transition-colors ${host.requires_pin_change ? 'border-amber-300 text-amber-500' : 'border-slate-200 text-slate-400 hover:border-amber-200 hover:text-amber-600'}`} title="Reset PIN to 0000"><KeyRound size={16}/></button>
                                      <button onClick={() => viewHostLogs(host)} className="p-2 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-blue-200 transition-colors" title="View Logs"><History size={16}/></button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      ) : activeTab === 'System Config' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
           <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-2">
              <h3 className="text-lg font-bold text-[#6D2158] mb-4 flex items-center gap-2"><Settings size={20}/> Core System & Security</h3>
              <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Clock size={14}/> Global Website Timezone</label>
                      <div className="flex gap-2">
                          <select className="flex-1 p-3 rounded-lg border font-bold text-slate-700 outline-none focus:border-[#6D2158]" value={systemTimezone} onChange={e => setSystemTimezone(e.target.value)}>
                              <option value="Indian/Maldives">Maldives Time (GMT+5)</option>
                              <option value="Asia/Dhaka">Bangladesh Time (GMT+6)</option>
                              <option value="Asia/Colombo">Sri Lanka Time (GMT+5:30)</option>
                              <option value="UTC">Universal Time (UTC)</option>
                          </select>
                          <button onClick={() => handleSaveSystemConfig('system_timezone', systemTimezone)} className="px-6 bg-[#6D2158] text-white rounded-lg font-bold text-xs uppercase shadow-md hover:bg-[#5a1b49]">Save</button>
                      </div>
                  </div>
              </div>
           </div>

           <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-fit">
              <h3 className="text-lg font-bold text-[#6D2158] mb-4 flex items-center gap-2"><Plane size={20}/> Declared Public Holidays</h3>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                 <input type="date" className="p-3 border rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-[#6D2158] transition-colors" value={holidayDate} onChange={e=>setHolidayDate(e.target.value)} />
                 <input type="text" placeholder="Holiday Name" className="flex-1 p-3 border rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-[#6D2158] transition-colors" value={holidayName} onChange={e=>setHolidayName(e.target.value)} />
                 <button onClick={handleAddHoliday} className="px-6 py-3 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs shadow-md hover:bg-[#5a1b49]">Add</button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                 {constants.filter(c => c.type === 'public_holiday').map(item => {
                    const [d, n] = item.label.split('::');
                    return (
                     <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg group hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                        <div className="flex items-center gap-4">
                            <span className="font-bold text-[#6D2158] bg-[#6D2158]/10 px-3 py-1 rounded text-xs">{d}</span>
                            <span className="font-bold text-slate-700 text-sm">{n}</span>
                        </div>
                        <button onClick={() => handleDeleteConstant(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 p-2"><Trash2 size={16}/></button>
                     </div>
                    )
                 })}
              </div>
           </div>

           <ListManager 
              type="sub_department" 
              title="Sub Departments" 
              icon={Building} 
              placeholder="Add sub department..." 
              constants={constants}
              newConstantValue={newConstantValue}
              activeConstantType={activeConstantType}
              setActiveConstantType={setActiveConstantType}
              setNewConstantValue={setNewConstantValue}
              handleAddConstant={handleAddConstant}
              handleDeleteConstant={handleDeleteConstant}
           />
           
           <RankManager 
              type="role_rank" 
              title="Role Sorting Ranks" 
              icon={Briefcase} 
              constants={constants}
              hosts={hosts}
              fetchConstants={fetchConstants}
              handleDeleteConstant={handleDeleteConstant}
           />
           
           <ListManager 
              type="requester" 
              title="Staff List" 
              icon={Users} 
              placeholder="Add staff name..." 
              constants={constants}
              newConstantValue={newConstantValue}
              activeConstantType={activeConstantType}
              setActiveConstantType={setActiveConstantType}
              setNewConstantValue={setNewConstantValue}
              handleAddConstant={handleAddConstant}
              handleDeleteConstant={handleDeleteConstant}
           />
           
           <ListManager 
              type="category" 
              title="Categories" 
              icon={Layers} 
              placeholder="Add category..." 
              constants={constants}
              newConstantValue={newConstantValue}
              activeConstantType={activeConstantType}
              setActiveConstantType={setActiveConstantType}
              setNewConstantValue={setNewConstantValue}
              handleAddConstant={handleAddConstant}
              handleDeleteConstant={handleDeleteConstant}
           />
        </div>
      ) : activeTab === 'GEM Directory' ? (
        <div className="animate-in slide-in-from-right-4 duration-300">
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 max-w-2xl">
              <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                 <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                    <Briefcase size={20} />
                 </div>
                 <div>
                    <h3 className="text-lg font-bold text-slate-800">GEM Directory</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Manage Guest Experience Makers</p>
                 </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mb-6">
                <input type="text" placeholder="GEM Name" className="flex-1 p-4 border border-slate-200 rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-amber-500 transition-colors" value={gemName} onChange={(e) => setGemName(e.target.value)}/>
                <input type="number" placeholder="MVPN" className="w-full sm:w-48 p-4 border border-slate-200 rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-amber-500 transition-colors" value={gemMvpn} onChange={(e) => setGemMvpn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddGem(); }}/>
                <button onClick={handleAddGem} className="px-6 py-4 bg-amber-500 text-white rounded-xl font-bold uppercase text-xs shadow-md hover:bg-amber-600 whitespace-nowrap">Add</button>
              </div>
              <div className="space-y-2">
                 {constants.filter(c => c.type === 'gem').map(item => (
                   <div key={item.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl group hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                      <div className="flex items-center gap-3">
                         <User size={16} className="text-slate-400" />
                         <span className="font-bold text-slate-700">{item.label}</span>
                      </div>
                      <button onClick={() => handleDeleteConstant(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-2"><Trash2 size={18}/></button>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      ) : (
        <div className="animate-in slide-in-from-right-4 duration-300">
           <div className="flex justify-between items-center mb-6">
              <div className="relative w-full max-w-md">
                 <Search className="absolute left-3 top-3 text-slate-400" size={18}/>
                 <input type="text" placeholder={`Search ${activeTab}...`} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158]" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/>
              </div>
              <button onClick={() => isFormOpen ? setIsFormOpen(false) : handleAddNew()} className="ml-4 bg-[#6D2158] text-white px-5 py-3 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg whitespace-nowrap transition-all hover:bg-[#5a1b49]">
                 {isFormOpen ? <X size={18}/> : <Plus size={18}/>}
                 {isFormOpen ? 'Close Form' : 'Add Item'}
              </button>
           </div>

           {isFormOpen && (
              <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 mb-8 animate-in slide-in-from-top-4">
                 <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-700">{isEditing ? <Edit3 size={20}/> : <Plus size={20}/>}{isEditing ? `Edit: ${currentItem.article_name}` : `New Entry`}</h3>
                 <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-3 space-y-4">
                        <div onClick={() => fileInputRef.current?.click()} className={`w-full h-40 bg-slate-50 border-2 border-dashed ${isUploading ? 'border-[#6D2158]' : 'border-slate-200'} rounded-xl flex flex-col items-center justify-center text-slate-400 overflow-hidden relative cursor-pointer hover:border-[#6D2158] transition-all`}>
                            {isUploading ? <Loader2 className="animate-spin text-[#6D2158]" size={32}/> : currentItem.image_url ? <img src={currentItem.image_url} className="w-full h-full object-cover"/> : <><UploadCloud size={32} className="mb-2"/><span className="text-[10px] font-bold uppercase">Upload Image</span></>}
                        </div>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload}/>
                    </div>
                    <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Article Number</label>
                           <input disabled={isEditing} className={`w-full p-3 border rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158] ${isEditing ? 'bg-slate-100' : 'bg-slate-50'}`} value={currentItem.article_number || ''} onChange={e => setCurrentItem({...currentItem, article_number: e.target.value})} />
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Article Name</label>
                           <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" value={currentItem.article_name || ''} onChange={e => setCurrentItem({...currentItem, article_name: e.target.value})} />
                        </div>
                        <div className="md:col-span-2">
                           <label className="text-[10px] font-black text-[#6D2158] uppercase ml-1">Generic Name</label>
                           <input className="w-full p-3 bg-white border-2 border-[#6D2158]/20 rounded-xl font-black text-slate-800 outline-none focus:border-[#6D2158]" value={currentItem.generic_name || ''} onChange={e => setCurrentItem({...currentItem, generic_name: e.target.value})} />
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Category</label>
                           <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.category || ''} onChange={e => setCurrentItem({...currentItem, category: e.target.value})}>{MASTER_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Unit</label>
                           <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.unit || 'Each'} onChange={e => setCurrentItem({...currentItem, unit: e.target.value})}><option>Each</option><option>Kg</option><option>Ltr</option><option>Box</option></select>
                        </div>
                        <div className="md:col-span-2 flex gap-6 pt-4 border-t border-slate-100 mt-2">
                           <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${currentItem.is_minibar_item ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`} onClick={() => setCurrentItem({...currentItem, is_minibar_item: !currentItem.is_minibar_item})}><div className={`w-5 h-5 rounded border flex items-center justify-center ${currentItem.is_minibar_item ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>{currentItem.is_minibar_item && <CheckCircle size={14} className="text-white"/>}</div><span className="text-sm font-bold uppercase">Minibar Item</span></div>
                           <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${currentItem.has_expiry ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`} onClick={() => setCurrentItem({...currentItem, has_expiry: !currentItem.has_expiry})}><div className={`w-5 h-5 rounded border flex items-center justify-center ${currentItem.has_expiry ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>{currentItem.has_expiry && <CheckCircle size={14} className="text-white"/>}</div><span className="text-sm font-bold uppercase">Expiry Tracking</span></div>
                        </div>
                        {currentItem.is_minibar_item && (
                            <div className="md:col-span-2 p-4 bg-rose-50 rounded-xl border border-rose-100 grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in">
                               <div><label className="text-[10px] font-bold text-rose-400 uppercase">Micros Name</label><input className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.micros_name || ''} onChange={e => setCurrentItem({...currentItem, micros_name: e.target.value})} /></div>
                               <div><label className="text-[10px] font-bold text-rose-400 uppercase">Sort Order</label><input type="number" className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.sort_order ?? 0} onChange={e => setCurrentItem({...currentItem, sort_order: parseInt(e.target.value) || 0})} /></div>
                               <div><label className="text-[10px] font-bold text-rose-400 uppercase">Avg Cost</label><input type="number" className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.avg_cost ?? 0} onChange={e => setCurrentItem({...currentItem, avg_cost: parseFloat(e.target.value) || 0})} /></div>
                               <div><label className="text-[10px] font-bold text-rose-400 uppercase">Sales Price</label><input type="number" className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.sales_price ?? 0} onChange={e => setCurrentItem({...currentItem, sales_price: parseFloat(e.target.value) || 0})} /></div>
                            </div>
                        )}
                        {!currentItem.is_minibar_item && (
                            <div className="md:col-span-2 p-4 bg-blue-50 rounded-xl border border-blue-100 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in">
                                <div><label className="text-[10px] font-bold text-blue-500 uppercase">Par Level</label><input type="number" className="w-full p-3 bg-white border border-blue-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.par_level ?? 0} onChange={e => setCurrentItem({...currentItem, par_level: parseFloat(e.target.value) || 0})} /></div>
                                <div><label className="text-[10px] font-bold text-blue-500 uppercase">Reorder Qty</label><input type="number" className="w-full p-3 bg-white border border-blue-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.reorder_qty ?? 0} onChange={e => setCurrentItem({...currentItem, reorder_qty: parseFloat(e.target.value) || 0})} /></div>
                                <div><label className="text-[10px] font-bold text-blue-500 uppercase">Supplier</label><input type="text" className="w-full p-3 bg-white border border-blue-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.primary_supplier || ''} onChange={e => setCurrentItem({...currentItem, primary_supplier: e.target.value})} /></div>
                            </div>
                        )}
                    </div>
                 </div>
                 <button onClick={handleSaveItem} disabled={isUploading} className="w-full mt-6 py-4 bg-[#6D2158] text-white rounded-xl font-bold uppercase shadow-lg hover:bg-[#5a1b49] transition-all flex items-center justify-center gap-2"><Save size={18}/> {isEditing ? 'Update Catalog' : 'Save to Catalog'}</button>
              </div>
           )}

           <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-left">
                 <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase w-20">ID</th>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase">Item Details</th>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase">Category</th>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase text-right">Action</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredList.map(item => {
                       const Icon = CATEGORY_ICONS[item.category] || Box;
                       return (
                         <tr key={item.article_number} className="hover:bg-slate-50 group">
                            <td className="p-4 text-xs font-bold text-slate-400 font-mono">{item.article_number}</td>
                            <td className="p-4">
                               <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center border border-slate-100">{item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <Icon size={18} className="text-slate-400"/>}</div>
                                   <div>
                                       <div className="font-bold text-slate-700 text-sm">{item.generic_name || item.article_name}</div>
                                       <div className="text-[10px] text-slate-400 uppercase">{item.article_name} • {item.unit}</div>
                                   </div>
                               </div>
                            </td>
                            <td className="p-4 text-xs font-bold text-slate-500">{item.category}</td>
                            <td className="p-4 text-right flex justify-end gap-2 items-center">
                               {activeTab === 'Expiry Setup' && (<button onClick={() => handleOpenExpiryBatches(item)} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors text-[10px] font-bold uppercase flex items-center gap-1 shadow-sm"><Calendar size={14}/> Batches</button>)}
                               <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleEditItem(item)} className="p-2 text-blue-400 hover:text-blue-600 rounded-lg"><Edit3 size={16}/></button><button onClick={() => handleDeleteItem(item.article_number)} className="p-2 text-slate-300 hover:text-rose-500 rounded-lg"><Trash2 size={16}/></button></div>
                            </td>
                         </tr>
                       );
                    })}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {/* --- MODALS --- */}

      {selectedLogHost && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 bg-[#6D2158] text-white flex justify-between items-center">
                     <div><h3 className="font-bold text-xl tracking-tight flex items-center gap-2"><History size={20}/> {selectedLogHost.full_name}'s Activity</h3><p className="text-[10px] text-white/70 uppercase tracking-widest mt-1">Latest 50 System Actions</p></div>
                     <button onClick={() => setSelectedLogHost(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={18}/></button>
                  </div>
                  <div className="p-0 overflow-y-auto flex-1 bg-slate-50 custom-scrollbar">
                     {isLoadingLogs ? (<div className="flex justify-center items-center py-20 text-slate-400"><Loader2 className="animate-spin" size={28}/></div>) : hostLogs.length === 0 ? (<div className="flex justify-center items-center py-20 text-slate-400 font-bold italic text-sm">No recent activity.</div>) : (
                         <table className="w-full text-left text-xs">
                             <thead className="bg-white sticky top-0 border-b border-slate-200 shadow-sm z-10"><tr><th className="p-4 text-slate-400 font-bold uppercase text-[10px]">Time</th><th className="p-4 text-slate-400 font-bold uppercase text-[10px]">Type</th><th className="p-4 text-slate-400 font-bold uppercase text-[10px]">Villa</th><th className="p-4 text-slate-400 font-bold uppercase text-[10px]">Details</th></tr></thead>
                             <tbody className="divide-y divide-slate-100">{hostLogs.map(log => (<tr key={log.id} className="hover:bg-white transition-colors"><td className="p-4 font-medium text-slate-500 whitespace-nowrap">{new Date(log.request_time).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</td><td className="p-4"><span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${log.request_type === 'Minibar' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{log.request_type}</span></td><td className="p-4 font-black text-[#6D2158] text-sm">{log.villa_number}</td><td className="p-4 text-slate-600 truncate max-w-xs">{log.item_details.replace(/\n/g, ', ')}</td></tr>))}</tbody>
                         </table>
                     )}
                  </div>
              </div>
          </div>
      )}

      {selectedExpiryItem && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 bg-emerald-600 text-white flex justify-between items-center">
                     <div><h3 className="font-bold text-xl tracking-tight flex items-center gap-2"><Calendar size={20}/> Batch Tracking</h3><p className="text-[10px] text-white/70 uppercase tracking-widest mt-1">{selectedExpiryItem.article_name}</p></div>
                     <button onClick={() => setSelectedExpiryItem(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={18}/></button>
                  </div>
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex gap-2">
                      <input type="month" className="flex-1 p-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-emerald-500" value={newBatchDate} onChange={(e) => setNewBatchDate(e.target.value)}/>
                      <button onClick={handleAddBatchDate} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-xs shadow-md transition-colors flex items-center gap-2"><Plus size={16}/> Add</button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-3">
                     {isLoadingBatches ? (<div className="flex justify-center items-center py-10 text-slate-400"><Loader2 className="animate-spin" size={28}/></div>) : itemBatches.length === 0 ? (<div className="flex justify-center items-center py-10 text-slate-400 font-bold italic text-sm">No active batches.</div>) : (
                         itemBatches.map(batch => {
                             let displayDate = batch.expiry_date;
                             try { displayDate = format(parseISO(batch.expiry_date + "-01"), 'MMM yyyy'); } catch (e) {}
                             return (<div key={batch.id} className="flex justify-between items-center p-4 bg-white border border-slate-200 rounded-2xl shadow-sm group hover:border-rose-200"><div className="font-black text-slate-700">{displayDate}</div><button onClick={() => handleArchiveBatch(batch.id)} className="text-slate-300 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 p-2 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1"><Trash2 size={14}/> Remove</button></div>);
                         })
                     )}
                  </div>
              </div>
          </div>
      )}

      {accessModalHost && (
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-[#FDFBFD] w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 md:p-8 bg-[#6D2158] text-white flex justify-between items-center shrink-0">
                      <div><h3 className="font-black text-xl tracking-tight flex items-center gap-2"><Eye size={20}/> Manage View Access</h3><p className="text-[10px] text-white/70 uppercase tracking-widest mt-1">For: {accessModalHost.full_name}</p></div>
                      <button onClick={() => setAccessModalHost(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={18}/></button>
                  </div>
                  <div className="p-6 border-b border-slate-200 bg-white shrink-0 flex gap-4 items-center">
                       <div className="relative flex-1">
                           <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                           <input type="text" placeholder="Search by name..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158]" value={accessSearchQuery} onChange={e => setAccessSearchQuery(e.target.value)}/>
                       </div>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {hosts.filter(h => h.id !== accessModalHost.id && (h.full_name.toLowerCase().includes(accessSearchQuery.toLowerCase()) || h.host_id.includes(accessSearchQuery))).map(targetHost => {
                              const isSelected = (supervisorAccess[accessModalHost.host_id] || []).includes(targetHost.host_id);
                              return (
                                  <label key={targetHost.id} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-purple-50 border-purple-200 shadow-sm' : 'bg-white border-slate-200 hover:border-[#6D2158]'}`}>
                                      <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-[#6D2158] border-[#6D2158]' : 'bg-slate-50 border-slate-300'}`}>{isSelected && <CheckCircle2 size={14} className="text-white"/>}</div>
                                      <div className="flex-1 min-w-0"><div className="font-bold text-sm text-slate-800 truncate">{targetHost.full_name}</div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{targetHost.role}</div></div>
                                      <input type="checkbox" className="hidden" checked={isSelected} onChange={() => {
                                          setSupervisorAccess((prev: any) => {
                                              const current = prev[accessModalHost.host_id] || [];
                                              if (current.includes(targetHost.host_id)) return { ...prev, [accessModalHost.host_id]: current.filter((id: any) => id !== targetHost.host_id) };
                                              return { ...prev, [accessModalHost.host_id]: [...current, targetHost.host_id] };
                                          });
                                      }}/>
                                  </label>
                              );
                          })}
                      </div>
                  </div>
                  <div className="p-6 bg-white border-t border-slate-200 shrink-0"><button onClick={() => setAccessModalHost(null)} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all">Done</button></div>
              </div>
          </div>
      )}
    </div>
  );
}
"use client";
import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, Phone, X, CreditCard, Briefcase, 
  Smartphone, Hash, Building2, Save, Crown, Shield, User
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- TYPES ---
type Host = {
  id: string;
  full_name: string;
  host_id: string;
  role: string;
  host_level: 'DA' | 'DB' | 'ATM'; // New Level Field
  status: 'Active' | 'Inactive';
  personal_mobile: string;
  company_mobile: string;
  mvpn: string;
  image_url: string;
  jetty_allocation?: string;
};

export default function HostsProfilePage() {
  const [hostList, setHostList] = useState<Host[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const [newHost, setNewHost] = useState<Partial<Host>>({
    role: 'Room Attendant',
    host_level: 'ATM',
    status: 'Active',
    personal_mobile: '',
    company_mobile: '',
    mvpn: ''
  });

  // --- FETCH DATA ---
  const fetchHosts = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('hsk_hosts')
      .select('*')
      .order('full_name', { ascending: true });
    
    if (data) setHostList(data);
    setIsLoading(false);
  };

  useEffect(() => { fetchHosts(); }, []);

  // --- CREATE HOST ---
  const handleCreateHost = async () => {
    if (!newHost.full_name) return alert("Full Name is required");
    if (!newHost.host_id) return alert("Host No is required");

    const hostToSave = {
      ...newHost,
      image_url: newHost.image_url || `https://ui-avatars.com/api/?name=${newHost.full_name}&background=6D2158&color=fff`
    };

    const { error } = await supabase.from('hsk_hosts').insert(hostToSave);
    if (error) alert(error.message);
    else {
      setIsCreateModalOpen(false);
      setNewHost({ role: 'Room Attendant', host_level: 'ATM', status: 'Active', personal_mobile: '', company_mobile: '', mvpn: '' });
      fetchHosts();
    }
  };

  // --- UPDATE HOST ---
  const handleUpdateHost = async () => {
    if (!selectedHost) return;

    const { error } = await supabase
      .from('hsk_hosts')
      .update({
        full_name: selectedHost.full_name,
        host_id: selectedHost.host_id,
        role: selectedHost.role,
        host_level: selectedHost.host_level,
        status: selectedHost.status,
        personal_mobile: selectedHost.personal_mobile,
        company_mobile: selectedHost.company_mobile,
        mvpn: selectedHost.mvpn
      })
      .eq('id', selectedHost.id);

    if (error) alert(error.message);
    else {
      setIsEditing(false);
      setSelectedHost(null);
      fetchHosts();
    }
  };

  // --- FILTERING ---
  const filteredHosts = hostList.filter(host => {
    const query = searchQuery.toLowerCase();
    return (
      host.full_name.toLowerCase().includes(query) || 
      (host.host_id && host.host_id.toLowerCase().includes(query)) ||
      host.role.toLowerCase().includes(query)
    );
  });

  const stats = {
    total: hostList.length,
    da: hostList.filter(s => s.host_level === 'DA').length,
    db: hostList.filter(s => s.host_level === 'DB').length,
    atm: hostList.filter(s => s.host_level === 'ATM').length
  };

  // --- HELPER: LEVEL BADGE ---
  const LevelBadge = ({ level }: { level: string }) => {
    if (level === 'DA') return <span className="flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200"><Crown size={10}/> DA</span>;
    if (level === 'DB') return <span className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200"><Shield size={10}/> DB</span>;
    return <span className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100"><User size={10}/> ATM</span>;
  };

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6 gap-6">
        <div>
          <h1 className="text-4xl font-bold italic tracking-tight">Host Profiles</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
            Master Directory • {stats.total} Records
          </p>
        </div>
        
        <div className="flex gap-4 px-6 py-3 bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="text-center">
                <span className="block text-xl font-bold text-amber-600">{stats.da}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Exec (DA)</span>
            </div>
            <div className="w-px bg-slate-100"></div>
            <div className="text-center">
                <span className="block text-xl font-bold text-slate-600">{stats.db}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sup (DB)</span>
            </div>
            <div className="w-px bg-slate-100"></div>
            <div className="text-center">
                <span className="block text-xl font-bold text-blue-600">{stats.atm}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Hosts (ATM)</span>
            </div>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 text-slate-300" size={16} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Name, Level or Host No..." 
            className="w-full pl-10 pr-4 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:outline-none focus:border-[#6D2158] text-[#6D2158] placeholder-slate-300 transition-all"
          />
        </div>
        <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 px-6 py-2 bg-[#6D2158] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-[#6D2158]/40 transition-all w-full sm:w-auto justify-center">
             <Plus size={16} /> New Profile
        </button>
      </div>

      {/* --- GRID --- */}
      {isLoading ? (
         <div className="text-center py-20 opacity-50 italic">Loading Profiles...</div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
        {filteredHosts.map((host) => (
          <div key={host.id} onClick={() => { setSelectedHost(host); setIsEditing(false); }}
               className="group relative bg-white rounded-2xl p-0 shadow-sm border border-slate-100 hover:shadow-xl hover:border-[#6D2158]/30 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col">
             
             {/* Header */}
             <div className="h-20 bg-gradient-to-r from-[#6D2158] to-[#902468] relative">
                <div className="absolute -bottom-8 left-5">
                   <div className="w-16 h-16 rounded-2xl border-4 border-white shadow-md overflow-hidden bg-white">
                      <img src={host.image_url || `https://ui-avatars.com/api/?name=${host.full_name}&background=random`} className="w-full h-full object-cover"/>
                   </div>
                </div>
                <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
                    <span className="text-[10px] text-white/70 font-bold uppercase tracking-wider">HOST NO</span>
                    <span className="text-sm text-white font-bold font-mono">{host.host_id}</span>
                </div>
             </div>

             {/* Content */}
             <div className="pt-10 px-5 pb-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-1">
                    <h3 className="text-lg font-bold text-slate-800 leading-tight group-hover:text-[#6D2158] transition-colors">{host.full_name}</h3>
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{host.role}</p>
                <div className="mt-auto flex items-center justify-between">
                    <LevelBadge level={host.host_level || 'ATM'} />
                    {host.mvpn && <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">#{host.mvpn}</span>}
                </div>
             </div>
          </div>
        ))}
      </div>
      )}

      {/* --- MODALS (Create & Edit) --- */}
      {/* ... (Create Modal reused from previous, just add host_level dropdown) ... */}
      {/* ... (Edit Modal reused from previous, just add host_level dropdown) ... */}
      
      {/* I will include the updated modals below for completeness */}

      {/* EDIT MODAL */}
      {selectedHost && (
        <div className="fixed inset-0 bg-[#6D2158]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="h-32 bg-[#6D2158] relative shrink-0">
               <button onClick={() => setSelectedHost(null)} className="absolute top-6 right-6 p-2 bg-black/20 text-white rounded-full"><X size={20}/></button>
               <div className="absolute -bottom-10 left-8 flex items-end gap-6">
                  <div className="w-28 h-28 rounded-3xl border-4 border-white shadow-xl bg-white overflow-hidden">
                     <img src={selectedHost.image_url || `https://ui-avatars.com/api/?name=${selectedHost.full_name}`} className="w-full h-full object-cover"/>
                  </div>
                  <div className="mb-3 text-white">
                      <h2 className="text-3xl font-bold italic tracking-tight">{selectedHost.full_name}</h2>
                      <div className="flex gap-2 mt-1">
                          <LevelBadge level={selectedHost.host_level || 'ATM'} />
                          <span className="text-xs font-bold opacity-80 uppercase tracking-widest">{selectedHost.role}</span>
                      </div>
                  </div>
               </div>
            </div>
            <div className="pt-16 p-8 overflow-y-auto">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold uppercase tracking-widest text-sm text-slate-400">Profile Details</h3>
                  <button onClick={() => isEditing ? handleUpdateHost() : setIsEditing(true)} className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider ${isEditing ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {isEditing ? <><Save size={14} className="inline mr-1"/> Save</> : 'Edit Profile'}
                  </button>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                     <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><CreditCard size={16} /><span className="text-[10px] font-bold uppercase">Host No</span></div>
                     {isEditing ? <input className="w-full p-2 border rounded font-mono font-bold" value={selectedHost.host_id} onChange={(e) => setSelectedHost({...selectedHost, host_id: e.target.value})} /> : <p className="text-xl font-bold font-mono text-slate-700">{selectedHost.host_id}</p>}
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                     <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><Crown size={16} /><span className="text-[10px] font-bold uppercase">Level</span></div>
                     {isEditing ? (
                         <select className="w-full p-2 border rounded font-bold" value={selectedHost.host_level || 'ATM'} onChange={(e) => setSelectedHost({...selectedHost, host_level: e.target.value as any})}>
                            <option value="DA">DA (Dinomosphere A)</option>
                            <option value="DB">DB (Dinomosphere B)</option>
                            <option value="ATM">ATM (Atmosphere)</option>
                         </select>
                     ) : (
                        <p className="text-lg font-bold text-slate-700">{selectedHost.host_level || 'ATM'}</p>
                     )}
                  </div>
                  {/* Phone Fields Reuse... */}
                  <div className="md:col-span-2 space-y-3">
                     <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">Contact Information</h4>
                     <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                           <span className="text-[9px] font-bold uppercase text-slate-500 block mb-1">MVPN</span>
                           {isEditing ? <input className="w-full p-1 border rounded text-sm" value={selectedHost.mvpn || ''} onChange={(e) => setSelectedHost({...selectedHost, mvpn: e.target.value})} /> : <p className="font-bold text-[#6D2158]">{selectedHost.mvpn || '-'}</p>}
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2">
                           <span className="text-[9px] font-bold uppercase text-slate-500 block mb-1">Company Mobile</span>
                           {isEditing ? <input className="w-full p-1 border rounded text-sm" value={selectedHost.company_mobile || ''} onChange={(e) => setSelectedHost({...selectedHost, company_mobile: e.target.value})} /> : <p className="font-bold text-slate-700">{selectedHost.company_mobile || '-'}</p>}
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-[#6D2158]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in">
             <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold uppercase tracking-widest text-sm text-[#6D2158]">New Host</h3>
               <button onClick={() => setIsCreateModalOpen(false)}><X size={20}/></button>
            </div>
            <div className="p-8 space-y-4">
               <input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold" placeholder="Full Name" value={newHost.full_name || ''} onChange={e => setNewHost({...newHost, full_name: e.target.value})} />
               <div className="grid grid-cols-2 gap-4">
                   <input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold" placeholder="Host No (SSL)" value={newHost.host_id || ''} onChange={e => setNewHost({...newHost, host_id: e.target.value})} />
                   <select className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold" value={newHost.host_level} onChange={e => setNewHost({...newHost, host_level: e.target.value as any})}>
                        <option value="ATM">ATM (Atmosphere)</option>
                        <option value="DB">DB (Dinomosphere B)</option>
                        <option value="DA">DA (Dinomosphere A)</option>
                   </select>
               </div>
               <button onClick={handleCreateHost} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-bold uppercase tracking-widest mt-2">Create Profile</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
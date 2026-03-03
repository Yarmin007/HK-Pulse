"use client";
import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, X, CreditCard, Briefcase, 
  Smartphone, Building2, Save, Crown, Shield, User, Trash2, Calendar, Hash, Tag
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// --- TYPES ---
type Host = {
  id: string;
  full_name: string;
  host_id: string;
  role: string;
  host_level: 'DA' | 'DB' | 'ATM';
  status: 'Active' | 'Resigned'; 
  joining_date?: string; 
  personal_mobile?: string;
  company_mobile?: string;
  mvpn?: string;
  image_url?: string;
  nicknames?: string;
};

export default function HostsProfilePage() {
  const [hostList, setHostList] = useState<Host[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const [newHost, setNewHost] = useState<Partial<Host>>({
    role: '',
    host_level: 'ATM',
    status: 'Active',
    personal_mobile: '',
    company_mobile: '',
    mvpn: '',
    nicknames: '',
    joining_date: new Date().toISOString().split('T')[0] 
  });

  // --- FETCH DATA ---
  const fetchHosts = async () => {
    setIsLoading(true);
    const [hostRes, constRes] = await Promise.all([
        supabase.from('hsk_hosts').select('*'),
        supabase.from('hsk_constants').select('*').eq('type', 'role_rank')
    ]);
    
    if (hostRes.data) {
        let roleRanks: Record<string, number> = {};
        let roles: string[] = [];
        
        if (constRes.data) {
            constRes.data.forEach(c => {
                const [role, rank] = c.label.split('::');
                if (role && rank) {
                    roleRanks[role.toLowerCase().trim()] = parseInt(rank, 10);
                    roles.push(role.trim());
                }
            });
            setAvailableRoles(roles.sort((a,b) => a.localeCompare(b)));
        }

        const sortedHosts = hostRes.data.sort((a, b) => {
            const rankA = roleRanks[(a.role || '').toLowerCase().trim()] ?? 999;
            const rankB = roleRanks[(b.role || '').toLowerCase().trim()] ?? 999;
            
            if (rankA !== rankB) return rankA - rankB;

            const numA = parseInt((a.host_id || '').replace(/\D/g, ''), 10) || 999999;
            const numB = parseInt((b.host_id || '').replace(/\D/g, ''), 10) || 999999;
            return numA - numB;
        });

        setHostList(sortedHosts);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchHosts(); }, []);

  // --- CREATE HOST ---
  const handleCreateHost = async () => {
    if (!newHost.full_name) return toast.error("Full Name is required");
    if (!newHost.host_id) return toast.error("Host No is required");
    if (!newHost.role) return toast.error("Designation is required");

    const hostToSave = {
      ...newHost,
      image_url: newHost.image_url || `https://ui-avatars.com/api/?name=${newHost.full_name}&background=6D2158&color=fff`
    };

    const { error } = await supabase.from('hsk_hosts').insert(hostToSave);
    if (error) {
        toast.error(error.message);
    } else {
      setIsCreateModalOpen(false);
      setNewHost({ role: '', host_level: 'ATM', status: 'Active', personal_mobile: '', company_mobile: '', mvpn: '', nicknames: '', joining_date: new Date().toISOString().split('T')[0] });
      fetchHosts();
      toast.success("Host Profile Created");
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
        mvpn: selectedHost.mvpn,
        nicknames: selectedHost.nicknames,
        joining_date: selectedHost.joining_date
      })
      .eq('id', selectedHost.id);

    if (error) {
        toast.error(error.message);
    } else {
      setIsEditing(false);
      fetchHosts();
      toast.success("Profile Updated");
    }
  };

  // --- DELETE HOST ---
  const handleDeleteHost = async (id: string) => {
      if(!confirm("Are you sure you want to permanently delete this host? This cannot be undone.")) return;
      
      const { error } = await supabase.from('hsk_hosts').delete().eq('id', id);
      if (error) {
          toast.error("Error deleting host.");
      } else {
          setSelectedHost(null);
          fetchHosts();
          toast.success("Host permanently deleted.");
      }
  };

  // --- FILTERING ---
  const filteredHosts = hostList.filter(host => {
    const query = searchQuery.toLowerCase();
    return (
      host.full_name.toLowerCase().includes(query) || 
      (host.host_id && host.host_id.toLowerCase().includes(query)) ||
      host.role.toLowerCase().includes(query) ||
      (host.nicknames && host.nicknames.toLowerCase().includes(query))
    );
  });

  const activeHosts = hostList.filter(s => s.status !== 'Resigned');

  const stats = {
    total: activeHosts.length,
    da: activeHosts.filter(s => s.host_level === 'DA').length,
    db: activeHosts.filter(s => s.host_level === 'DB').length,
    atm: activeHosts.filter(s => s.host_level === 'ATM').length
  };

  // --- HELPER: LEVEL BADGE ---
  const LevelBadge = ({ level }: { level: string }) => {
    if (level === 'DA') return <span className="flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200"><Crown size={10}/> DA</span>;
    if (level === 'DB') return <span className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200"><Shield size={10}/> DB</span>;
    return <span className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100"><User size={10}/> ATM</span>;
  };

  return (
    <div className="min-h-screen p-4 md:p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-6 gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold italic tracking-tight">Host Profiles</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
            Master Directory • {stats.total} Active Staff
          </p>
        </div>
        
        <div className="flex gap-4 px-6 py-3 bg-white rounded-xl border border-slate-100 shadow-sm w-full md:w-auto justify-between md:justify-start">
            <div className="text-center flex-1 md:flex-none">
                <span className="block text-xl font-bold text-amber-600">{stats.da}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Exec (DA)</span>
            </div>
            <div className="w-px bg-slate-100 hidden md:block"></div>
            <div className="text-center flex-1 md:flex-none">
                <span className="block text-xl font-bold text-slate-600">{stats.db}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sup (DB)</span>
            </div>
            <div className="w-px bg-slate-100 hidden md:block"></div>
            <div className="text-center flex-1 md:flex-none">
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
            placeholder="Search Name, Level, Host No, or Nickname..." 
            className="w-full pl-10 pr-4 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:outline-none focus:border-[#6D2158] text-[#6D2158] placeholder-slate-300 transition-all shadow-inner"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
        {filteredHosts.map((host) => (
          <div key={host.id} onClick={() => { setSelectedHost(host); setIsEditing(false); }}
               className={`group relative rounded-2xl p-0 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden flex flex-col border-2 ${host.status === 'Resigned' ? 'border-rose-100 bg-rose-50/30 grayscale-[50%]' : 'bg-white border-slate-100 hover:border-[#6D2158]/30'}`}>
              
             {/* Header */}
             <div className={`h-20 relative ${host.status === 'Resigned' ? 'bg-slate-400' : 'bg-gradient-to-r from-[#6D2158] to-[#902468]'}`}>
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
                    <h3 className="text-lg font-bold text-slate-800 leading-tight group-hover:text-[#6D2158] transition-colors line-clamp-1">{host.full_name}</h3>
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 line-clamp-1">{host.role}</p>
                {host.nicknames && <p className="text-[10px] font-bold text-emerald-600 mb-2 italic">"{host.nicknames}"</p>}
                
                {host.status === 'Resigned' && <span className="text-[10px] font-black uppercase text-rose-500 tracking-widest mb-2">Resigned</span>}
                <div className="mt-auto pt-3 flex items-center justify-between">
                    <LevelBadge level={host.host_level || 'ATM'} />
                    {host.mvpn && <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">#{host.mvpn}</span>}
                </div>
             </div>
          </div>
        ))}
      </div>
      )}

      {/* --- EDIT MODAL --- */}
      {selectedHost && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
            <div className="h-32 bg-[#6D2158] relative shrink-0">
               <button onClick={() => setSelectedHost(null)} className="absolute top-6 right-6 p-2 bg-black/20 text-white rounded-full hover:bg-black/40 transition-colors"><X size={20}/></button>
               <div className="absolute -bottom-10 left-8 flex items-end gap-6">
                  <div className="w-28 h-28 rounded-3xl border-4 border-white shadow-xl bg-white overflow-hidden">
                     <img src={selectedHost.image_url || `https://ui-avatars.com/api/?name=${selectedHost.full_name}`} className="w-full h-full object-cover"/>
                  </div>
                  <div className="mb-3 text-white">
                      <h2 className="text-3xl font-bold italic tracking-tight drop-shadow-md">{selectedHost.full_name}</h2>
                      <div className="flex gap-2 mt-1 items-center">
                          <LevelBadge level={selectedHost.host_level || 'ATM'} />
                          <span className="text-xs font-bold opacity-80 uppercase tracking-widest drop-shadow-md">{selectedHost.role}</span>
                      </div>
                  </div>
               </div>
            </div>
            
            <div className="pt-16 p-8 overflow-y-auto custom-scrollbar">
               <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <h3 className="font-bold uppercase tracking-widest text-sm text-slate-400">Profile Details</h3>
                  <div className="flex gap-2">
                      {isEditing && (
                          <button onClick={() => handleDeleteHost(selectedHost.id)} className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center gap-1 transition-colors">
                              <Trash2 size={14}/> Delete
                          </button>
                      )}
                      <button onClick={() => isEditing ? handleUpdateHost() : setIsEditing(true)} className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm ${isEditing ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {isEditing ? <><Save size={14} className="inline mr-1"/> Save Profile</> : 'Edit Profile'}
                      </button>
                  </div>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* WORK INFO */}
                  <div className="space-y-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Work Information</h4>
                      
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                         <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><CreditCard size={16} /><span className="text-[10px] font-bold uppercase">Host No (SSL)</span></div>
                         {isEditing ? <input className="w-full p-2 border rounded-xl font-mono font-bold outline-none focus:border-[#6D2158]" value={selectedHost.host_id} onChange={(e) => setSelectedHost({...selectedHost, host_id: e.target.value})} /> : <p className="text-lg font-bold font-mono text-slate-700">{selectedHost.host_id}</p>}
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                         <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><Briefcase size={16} /><span className="text-[10px] font-bold uppercase">Designation</span></div>
                         {isEditing ? (
                             <select className="w-full p-2 border rounded-xl font-bold outline-none focus:border-[#6D2158]" value={selectedHost.role} onChange={(e) => setSelectedHost({...selectedHost, role: e.target.value})}>
                                 <option value="" disabled>Select Role</option>
                                 {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                             </select>
                         ) : <p className="text-sm font-bold text-slate-700">{selectedHost.role}</p>}
                      </div>

                      <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                         <div className="flex items-center gap-2 mb-2 text-emerald-700"><Tag size={16} /><span className="text-[10px] font-bold uppercase">Nicknames / AI Known As</span></div>
                         {isEditing ? <input className="w-full p-2 border rounded-xl font-bold outline-none focus:border-emerald-500" placeholder="e.g. Kappi, Abow" value={selectedHost.nicknames || ''} onChange={(e) => setSelectedHost({...selectedHost, nicknames: e.target.value})} /> : <p className="text-sm font-bold text-emerald-800">{selectedHost.nicknames || 'None set'}</p>}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                             <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><Crown size={16} /><span className="text-[10px] font-bold uppercase">Level</span></div>
                             {isEditing ? (
                                 <select className="w-full p-2 border rounded-xl font-bold outline-none focus:border-[#6D2158]" value={selectedHost.host_level || 'ATM'} onChange={(e) => setSelectedHost({...selectedHost, host_level: e.target.value as any})}>
                                    <option value="DA">DA (Dinomosphere A)</option>
                                    <option value="DB">DB (Dinomosphere B)</option>
                                    <option value="ATM">ATM (Atmosphere)</option>
                                 </select>
                             ) : (
                                <p className="text-sm font-bold text-slate-700">{selectedHost.host_level || 'ATM'}</p>
                             )}
                          </div>
                          
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                             <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><User size={16} /><span className="text-[10px] font-bold uppercase">Status</span></div>
                             {isEditing ? (
                                 <select className="w-full p-2 border rounded-xl font-bold outline-none focus:border-[#6D2158]" value={selectedHost.status || 'Active'} onChange={(e) => setSelectedHost({...selectedHost, status: e.target.value as any})}>
                                    <option value="Active">Active</option>
                                    <option value="Resigned">Resigned</option>
                                 </select>
                             ) : (
                                <p className={`text-sm font-bold ${selectedHost.status === 'Resigned' ? 'text-rose-600' : 'text-emerald-600'}`}>{selectedHost.status || 'Active'}</p>
                             )}
                          </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                         <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><Calendar size={16} /><span className="text-[10px] font-bold uppercase">Joining Date</span></div>
                         {isEditing ? <input type="date" className="w-full p-2 border rounded-xl font-bold outline-none focus:border-[#6D2158]" value={selectedHost.joining_date || ''} onChange={(e) => setSelectedHost({...selectedHost, joining_date: e.target.value})} /> : <p className="text-sm font-bold text-slate-700">{selectedHost.joining_date ? new Date(selectedHost.joining_date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '-'}</p>}
                      </div>
                  </div>

                  {/* CONTACT INFO */}
                  <div className="space-y-4">
                     <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contact Information</h4>
                     
                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                         <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><Smartphone size={16} /><span className="text-[10px] font-bold uppercase">Personal Mobile</span></div>
                         {isEditing ? <input className="w-full p-2 border rounded-xl font-bold outline-none focus:border-[#6D2158]" placeholder="+960..." value={selectedHost.personal_mobile || ''} onChange={(e) => setSelectedHost({...selectedHost, personal_mobile: e.target.value})} /> : <p className="text-sm font-bold text-slate-700">{selectedHost.personal_mobile || '-'}</p>}
                     </div>

                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                         <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><Building2 size={16} /><span className="text-[10px] font-bold uppercase">Company Mobile</span></div>
                         {isEditing ? <input className="w-full p-2 border rounded-xl font-bold outline-none focus:border-[#6D2158]" placeholder="+960..." value={selectedHost.company_mobile || ''} onChange={(e) => setSelectedHost({...selectedHost, company_mobile: e.target.value})} /> : <p className="text-sm font-bold text-slate-700">{selectedHost.company_mobile || '-'}</p>}
                     </div>

                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                         <div className="flex items-center gap-2 mb-2 text-[#6D2158]"><Hash size={16} /><span className="text-[10px] font-bold uppercase">MVPN (Short Code)</span></div>
                         {isEditing ? <input className="w-full p-2 border rounded-xl font-mono font-bold outline-none focus:border-[#6D2158]" placeholder="e.g. 2843" value={selectedHost.mvpn || ''} onChange={(e) => setSelectedHost({...selectedHost, mvpn: e.target.value})} /> : <p className="text-lg font-bold font-mono text-slate-700">{selectedHost.mvpn || '-'}</p>}
                     </div>
                  </div>

               </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CREATE MODAL --- */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-[#6D2158]/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-xl rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold uppercase tracking-widest text-sm text-[#6D2158] flex items-center gap-2"><Plus size={18}/> New Host Profile</h3>
               <button onClick={() => setIsCreateModalOpen(false)} className="p-2 bg-white rounded-full shadow-sm text-slate-400 hover:text-rose-500 transition-colors"><X size={18}/></button>
            </div>
            
            <div className="p-8 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
               
               {/* Core Info */}
               <div className="space-y-4">
                   <div>
                       <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Full Name</label>
                       <input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" placeholder="e.g. Abdulla Yamin" value={newHost.full_name || ''} onChange={e => setNewHost({...newHost, full_name: e.target.value})} />
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                       <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Host No (SSL)</label>
                           <input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold font-mono outline-none focus:border-[#6D2158]" placeholder="12345" value={newHost.host_id || ''} onChange={e => setNewHost({...newHost, host_id: e.target.value})} />
                       </div>
                       <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Host Level</label>
                           <select className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" value={newHost.host_level} onChange={e => setNewHost({...newHost, host_level: e.target.value as any})}>
                                <option value="ATM">ATM (Atmosphere)</option>
                                <option value="DB">DB (Dinomosphere B)</option>
                                <option value="DA">DA (Dinomosphere A)</option>
                           </select>
                       </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                       <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Designation</label>
                           <select className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" value={newHost.role || ''} onChange={e => setNewHost({...newHost, role: e.target.value})}>
                               <option value="" disabled>Select Role</option>
                               {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                           </select>
                       </div>
                       <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Joining Date</label>
                           <input type="date" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" value={newHost.joining_date || ''} onChange={e => setNewHost({...newHost, joining_date: e.target.value})} />
                       </div>
                   </div>

                   <div>
                       <label className="text-[10px] font-bold text-emerald-600 uppercase ml-1">Nicknames (Comma Separated)</label>
                       <input type="text" className="w-full p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-sm font-bold outline-none focus:border-emerald-500" placeholder="e.g. Kappi, Abow" value={newHost.nicknames || ''} onChange={e => setNewHost({...newHost, nicknames: e.target.value})} />
                   </div>
               </div>

               <div className="border-t border-slate-100 my-4"></div>

               {/* Contact Info */}
               <div className="space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                       <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Personal Mobile</label>
                           <input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" placeholder="+960..." value={newHost.personal_mobile || ''} onChange={e => setNewHost({...newHost, personal_mobile: e.target.value})} />
                       </div>
                       <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Company Mobile</label>
                           <input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158]" placeholder="+960..." value={newHost.company_mobile || ''} onChange={e => setNewHost({...newHost, company_mobile: e.target.value})} />
                       </div>
                   </div>
                   <div>
                       <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">MVPN</label>
                       <input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-[#6D2158] font-mono" placeholder="e.g. 2843" value={newHost.mvpn || ''} onChange={e => setNewHost({...newHost, mvpn: e.target.value})} />
                   </div>
               </div>

               <button onClick={handleCreateHost} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-bold uppercase tracking-widest mt-6 shadow-xl shadow-purple-900/20 hover:bg-[#5a1b49] transition-colors">
                   Create Profile
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
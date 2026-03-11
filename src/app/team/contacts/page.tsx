"use client";
import React, { useState, useEffect } from 'react';
import { 
  Search, Phone, Smartphone, PhoneCall, User, 
  Briefcase, Loader2, Hash
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Host = {
  id: string;
  host_id: string;
  full_name: string;
  role: string;
  personal_mobile?: string;
  mvpn?: string;
  company_mobile?: string;
};

export default function ContactList() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setIsLoading(true);
    const [hostRes, constRes] = await Promise.all([
        supabase.from('hsk_hosts').select('*').eq('status', 'Active'),
        supabase.from('hsk_constants').select('*').eq('type', 'role_rank')
    ]);

    if (hostRes.data) {
        let roleRanks: Record<string, number> = {};
        if (constRes.data) {
            constRes.data.forEach((c: any) => {
                const [role, rank] = c.label.split('::');
                if (role && rank) roleRanks[role.toLowerCase().trim()] = parseInt(rank, 10);
            });
        }

        const sortedHosts = [...hostRes.data].sort((a: any, b: any) => {
            const rankA = roleRanks[(a.role || '').toLowerCase().trim()] ?? 999;
            const rankB = roleRanks[(b.role || '').toLowerCase().trim()] ?? 999;
            if (rankA !== rankB) return rankA - rankB;
            return (a.full_name || '').localeCompare(b.full_name || '');
        });

        setHosts(sortedHosts as Host[]);
    }
    setIsLoading(false);
  };

  const formatForDialer = (num: string) => {
      return num.replace(/[\s-]/g, '');
  };

  const filteredHosts = hosts.filter(h => 
      (h.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (h.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.personal_mobile || '').includes(searchQuery) ||
      (h.mvpn || '').includes(searchQuery) ||
      (h.company_mobile || '').includes(searchQuery)
  );

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-6 pb-32 font-sans text-slate-800 animate-in fade-in">
      
      {/* HEADER & SEARCH */}
      <div className="max-w-5xl mx-auto mb-6">
        <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-black text-[#6D2158] tracking-tight">HK Directory</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Tap any number to call instantly</p>
        </div>

        <div className="relative w-full shadow-sm">
            <Search className="absolute left-4 top-4 text-slate-400" size={20}/>
            <input 
                type="text" 
                placeholder="Search by name, role, or number..." 
                className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-[16px] md:text-sm font-bold outline-none focus:border-[#6D2158] focus:ring-2 focus:ring-[#6D2158]/10 transition-all" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
            />
        </div>
      </div>

      {/* CONTACTS GRID */}
      <div className="max-w-5xl mx-auto">
        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#6D2158]">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p className="font-bold text-sm uppercase tracking-widest">Loading Directory...</p>
            </div>
        ) : filteredHosts.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <User size={48} className="mx-auto mb-4 text-slate-300"/>
                <p className="font-bold text-slate-500">No staff members found.</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredHosts.map(host => (
                    <div key={host.id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        
                        {/* CARD HEADER */}
                        <div className="flex items-center gap-4 mb-5 border-b border-slate-100 pb-4">
                            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-[#6D2158] flex items-center justify-center font-black text-xl shrink-0 shadow-inner">
                                {(host.full_name || 'U').charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-black text-lg text-slate-800 truncate leading-tight">{host.full_name}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate mt-0.5 flex items-center gap-1">
                                    <Briefcase size={10}/> {host.role}
                                </p>
                            </div>
                        </div>

                        {/* PHONE NUMBERS LIST */}
                        <div className="space-y-3">
                            
                            {/* PERSONAL NUMBER */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                                        <Smartphone size={14}/>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Personal</p>
                                        <p className="font-bold text-sm text-slate-700">{host.personal_mobile || '---'}</p>
                                    </div>
                                </div>
                                {host.personal_mobile ? (
                                    <a href={`tel:${formatForDialer(host.personal_mobile)}`} className="w-10 h-10 rounded-xl bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 transition-all active:scale-95">
                                        <Phone size={16} className="fill-current"/>
                                    </a>
                                ) : (
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center opacity-50"><Phone size={16} className="text-slate-300"/></div>
                                )}
                            </div>

                            {/* MVPN */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                                        <Hash size={14}/>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">MVPN</p>
                                        <p className="font-bold text-sm text-slate-700">{host.mvpn || '---'}</p>
                                    </div>
                                </div>
                                {host.mvpn ? (
                                    <a href={`tel:${formatForDialer(host.mvpn)}`} className="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 transition-all active:scale-95">
                                        <Phone size={16} className="fill-current"/>
                                    </a>
                                ) : (
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center opacity-50"><Phone size={16} className="text-slate-300"/></div>
                                )}
                            </div>

                            {/* COMPANY MOBILE */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                                        <PhoneCall size={14}/>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Company Mobile</p>
                                        <p className="font-bold text-sm text-slate-700">{host.company_mobile || '---'}</p>
                                    </div>
                                </div>
                                {host.company_mobile ? (
                                    <a href={`tel:${formatForDialer(host.company_mobile)}`} className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20 transition-all active:scale-95">
                                        <Phone size={16} className="fill-current"/>
                                    </a>
                                ) : (
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center opacity-50"><Phone size={16} className="text-slate-300"/></div>
                                )}
                            </div>

                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

    </div>
  );
}
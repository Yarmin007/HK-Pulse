"use client";
import React, { useState, useEffect } from 'react';
import { 
  Search, Phone, Smartphone, PhoneCall, User, 
  Briefcase, Loader2, Hash, X, Download
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Image from 'next/image';

type Host = {
  id: string;
  host_id: string;
  full_name: string;
  role: string;
  personal_mobile?: string;
  mvpn?: string;
  company_mobile?: string;
  image_url?: string;
};

export default function ContactList() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Lightbox State
  const [selectedImage, setSelectedImage] = useState<{url: string, name: string} | null>(null);

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

  const handleDownloadImage = async (e: React.MouseEvent, url: string, name: string) => {
      e.stopPropagation();
      try {
          const response = await fetch(url);
          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `${name.replace(/\s+/g, '_')}_Profile.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
      } catch (err) {
          // Fallback if browser blocks Blob download due to strict CORS
          window.open(url, '_blank');
      }
  };

  const filteredHosts = hosts.filter(h => 
      (h.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (h.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.personal_mobile || '').includes(searchQuery) ||
      (h.mvpn || '').includes(searchQuery) ||
      (h.company_mobile || '').includes(searchQuery)
  );

  return (
    // Removed mobile side padding (px-0), kept desktop padding (md:p-6)
    <div className="min-h-screen bg-[#FDFBFD] pt-4 md:p-6 pb-32 px-0 font-sans text-slate-800 animate-in fade-in">
      
      {/* HEADER & SEARCH (Kept padding on mobile so it doesn't touch edges) */}
      <div className="max-w-5xl mx-auto mb-4 md:mb-6 px-4 md:px-0">
        <div className="mb-4 md:mb-6">
            <h1 className="text-2xl md:text-3xl font-black text-[#6D2158] tracking-tight">HK Directory</h1>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Tap any number to call instantly</p>
        </div>

        <div className="relative w-full shadow-sm">
            <Search className="absolute left-4 top-3.5 md:top-4 text-slate-400" size={18}/>
            <input 
                type="text" 
                placeholder="Search name, role, or number..." 
                className="w-full pl-11 md:pl-12 pr-4 py-3 md:py-4 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-[16px] md:text-sm font-bold outline-none focus:border-[#6D2158] focus:ring-2 focus:ring-[#6D2158]/10 transition-all" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
            />
        </div>
      </div>

      {/* CONTACTS GRID / LIST */}
      <div className="max-w-5xl mx-auto w-full">
        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#6D2158]">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p className="font-bold text-sm uppercase tracking-widest">Loading Directory...</p>
            </div>
        ) : filteredHosts.length === 0 ? (
            <div className="text-center py-20 bg-white md:rounded-3xl border-t border-b md:border border-slate-100 shadow-sm mx-0 md:mx-4 lg:mx-0">
                <User size={48} className="mx-auto mb-4 text-slate-300"/>
                <p className="font-bold text-slate-500">No staff members found.</p>
            </div>
        ) : (
            // Native list on mobile (flex-col, bg-white), Grid on desktop (md:grid)
            <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 bg-white md:bg-transparent border-t border-slate-200 md:border-none">
                {filteredHosts.map(host => (
                    <div 
                        key={host.id} 
                        className="bg-white p-4 md:p-5 border-b border-slate-100 md:border md:border-slate-200 md:rounded-3xl md:shadow-sm md:hover:shadow-md transition-all active:bg-slate-50 md:active:bg-white"
                    >
                        
                        {/* CARD HEADER */}
                        <div className="flex items-center gap-4 mb-4 border-b border-slate-50 md:border-slate-100 pb-3 md:pb-4">
                            <button 
                                onClick={() => host.image_url && setSelectedImage({url: host.image_url, name: host.full_name})}
                                disabled={!host.image_url}
                                className={`relative w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-[1.25rem] bg-purple-50 text-[#6D2158] flex items-center justify-center font-black text-lg md:text-xl shrink-0 shadow-sm border border-slate-100 md:border-slate-200 overflow-hidden ${host.image_url ? 'cursor-pointer active:scale-95 transition-transform ring-2 ring-transparent hover:ring-[#6D2158]/30' : 'cursor-default'}`}
                                title={host.image_url ? "View Picture" : "No picture available"}
                            >
                                {host.image_url ? (
                                    <Image src={host.image_url} alt={host.full_name} fill sizes="(max-width: 768px) 48px, 56px" className="object-cover" />
                                ) : (
                                    (host.full_name || 'U').charAt(0)
                                )}
                            </button>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-black text-base md:text-lg text-slate-800 truncate leading-tight">{host.full_name}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate mt-0.5 flex items-center gap-1">
                                    <Briefcase size={10}/> {host.role}
                                </p>
                            </div>
                        </div>

                        {/* PHONE NUMBERS LIST */}
                        <div className="space-y-2 md:space-y-3">
                            
                            {/* PERSONAL NUMBER */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                                        <Smartphone size={14}/>
                                    </div>
                                    <div>
                                        <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">Personal</p>
                                        <p className="font-bold text-sm text-slate-700">{host.personal_mobile || '---'}</p>
                                    </div>
                                </div>
                                {host.personal_mobile ? (
                                    <a href={`tel:${formatForDialer(host.personal_mobile)}`} className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 transition-all active:scale-95">
                                        <Phone size={14} className="fill-current"/>
                                    </a>
                                ) : (
                                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-50 flex items-center justify-center opacity-50"><Phone size={14} className="text-slate-300"/></div>
                                )}
                            </div>

                            {/* MVPN */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                                        <Hash size={14}/>
                                    </div>
                                    <div>
                                        <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">MVPN</p>
                                        <p className="font-bold text-sm text-slate-700">{host.mvpn || '---'}</p>
                                    </div>
                                </div>
                                {host.mvpn ? (
                                    <a href={`tel:${formatForDialer(host.mvpn)}`} className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 transition-all active:scale-95">
                                        <Phone size={14} className="fill-current"/>
                                    </a>
                                ) : (
                                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-50 flex items-center justify-center opacity-50"><Phone size={14} className="text-slate-300"/></div>
                                )}
                            </div>

                            {/* COMPANY MOBILE */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                                        <PhoneCall size={14}/>
                                    </div>
                                    <div>
                                        <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">Company Mobile</p>
                                        <p className="font-bold text-sm text-slate-700">{host.company_mobile || '---'}</p>
                                    </div>
                                </div>
                                {host.company_mobile ? (
                                    <a href={`tel:${formatForDialer(host.company_mobile)}`} className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20 transition-all active:scale-95">
                                        <Phone size={14} className="fill-current"/>
                                    </a>
                                ) : (
                                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-50 flex items-center justify-center opacity-50"><Phone size={14} className="text-slate-300"/></div>
                                )}
                            </div>

                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* --- IMAGE LIGHTBOX MODAL --- */}
      {selectedImage && (
          <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200">
              
              {/* Top Controls */}
              <div className="absolute top-0 inset-x-0 p-4 md:p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
                  <div className="text-white">
                      <p className="font-black text-lg tracking-wide">{selectedImage.name}</p>
                      <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Profile Picture</p>
                  </div>
                  <div className="flex gap-3">
                      <button 
                          onClick={(e) => handleDownloadImage(e, selectedImage.url, selectedImage.name)} 
                          className="w-10 h-10 md:w-12 md:h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors active:scale-95"
                          title="Download Image"
                      >
                          <Download size={20}/>
                      </button>
                      <button 
                          onClick={() => setSelectedImage(null)} 
                          className="w-10 h-10 md:w-12 md:h-12 bg-white/10 hover:bg-rose-500 hover:text-white text-white/80 rounded-full flex items-center justify-center transition-colors active:scale-95"
                          title="Close"
                      >
                          <X size={20}/>
                      </button>
                  </div>
              </div>

              {/* Image Container */}
              <div className="w-full h-full flex items-center justify-center p-4 md:p-12 relative" onClick={() => setSelectedImage(null)}>
                  <div className="relative w-full h-full max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
                      <Image 
                          src={selectedImage.url} 
                          alt={selectedImage.name} 
                          fill
                          sizes="100vw"
                          className="object-contain drop-shadow-2xl animate-in zoom-in-95 duration-300"
                      />
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
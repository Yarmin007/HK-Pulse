"use client";
import React, { useState, useEffect } from 'react';
import { User, LogOut, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ProfilePage() {
  const [hostInfo, setHostInfo] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsMounted(true);
    fetchLiveProfile();
  }, []);

  const fetchLiveProfile = async () => {
      const sessionData = localStorage.getItem('hk_pulse_session');
      if (sessionData) {
          const parsed = JSON.parse(sessionData);
          
          // Fetch the freshest data from the DB so they see their new picture instantly!
          const { data } = await supabase
            .from('hsk_hosts')
            .select('*')
            .eq('host_id', parsed.host_id)
            .single();

          if (data) {
              setHostInfo(data);
          } else {
              setHostInfo(parsed); // Fallback to local storage if DB fails
          }
      }
      setIsLoading(false);
  };

  const handleLogout = () => {
      localStorage.removeItem('hk_pulse_session');
      localStorage.removeItem('hk_pulse_admin_auth');
      window.location.href = '/';
  };

  if (!isMounted) return null;
  
  if (isLoading) {
      return <div className="min-h-screen bg-[#FDFBFD] flex items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;
  }

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-6 pb-24 font-antiqua text-[#6D2158] max-w-2xl mx-auto flex flex-col justify-center">
      
      <div className="flex flex-col items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 mb-8 animate-in slide-in-from-top-4">
        
        {/* READ ONLY AVATAR */}
        <div className="w-32 h-32 bg-[#6D2158] text-white rounded-full flex items-center justify-center font-bold text-4xl shadow-xl shadow-[#6D2158]/20 mb-6 overflow-hidden border-4 border-white ring-1 ring-slate-100">
          {hostInfo?.image_url ? (
              <img src={hostInfo.image_url} alt="Profile" className="w-full h-full object-cover" />
          ) : (
              hostInfo?.full_name?.charAt(0) || <User size={40}/>
          )}
        </div>

        <h1 className="text-3xl font-black tracking-tight text-slate-800 text-center">{hostInfo?.full_name}</h1>
        
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-4 py-1.5 rounded-full border border-slate-200">
                SSL {hostInfo?.host_id}
            </span>
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-100 px-4 py-1.5 rounded-full border border-emerald-200">
                {hostInfo?.role || 'Staff'}
            </span>
        </div>
      </div>

      <button onClick={handleLogout} className="w-full py-5 bg-rose-50 text-rose-600 rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-rose-100 hover:text-rose-700 active:scale-95 transition-all shadow-sm border border-rose-100">
          <LogOut size={18}/> Sign Out Safely
      </button>
    </div>
  );
}
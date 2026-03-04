"use client";
import React, { useState, useEffect } from 'react';
import { User, LogOut } from 'lucide-react';

export default function ProfilePage() {
  const [hostInfo, setHostInfo] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const sessionData = localStorage.getItem('hk_pulse_session');
    if (sessionData) {
        setHostInfo(JSON.parse(sessionData));
    }
  }, []);

  const handleLogout = () => {
      localStorage.removeItem('hk_pulse_session');
      localStorage.removeItem('hk_pulse_admin_auth');
      window.location.href = '/';
  };

  if (!isMounted || !hostInfo) return null;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-6 pb-24 font-antiqua text-[#6D2158] max-w-2xl mx-auto">
      <div className="flex flex-col items-center bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 mb-8 animate-in slide-in-from-top-4">
        <div className="w-28 h-28 bg-[#6D2158] text-white rounded-full flex items-center justify-center font-bold text-4xl shadow-xl shadow-[#6D2158]/20 mb-6">
          {hostInfo.full_name?.charAt(0) || 'U'}
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-800">{hostInfo.full_name}</h1>
        <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                SSL {hostInfo.host_id}
            </span>
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                {hostInfo.role || 'Staff'}
            </span>
        </div>
      </div>

      <button onClick={handleLogout} className="w-full py-5 bg-rose-50 text-rose-600 rounded-3xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-rose-100 hover:text-rose-700 active:scale-95 transition-all">
          <LogOut size={18}/> Sign Out Safely
      </button>
    </div>
  );
}
"use client";
import React, { useEffect, useState } from 'react';
import { 
  Users, ShoppingCart, Clock, AlertTriangle, 
  ArrowRight, TrendingUp, CheckCircle2, Package,
  Zap
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalHosts: 0,
    pendingOrders: 0,
    pendingOT: 0,
    lowStock: 0
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);

      // 1. Staff Count
      const { count: hostCount } = await supabase.from('hsk_hosts').select('*', { count: 'exact', head: true });
      
      // 2. Pending Orders (Includes Minibar Requests)
      const { count: orderCount } = await supabase.from('hsk_orders').select('*', { count: 'exact', head: true }).eq('status', 'Pending');

      // 3. Pending Overtime
      const { count: otCount } = await supabase.from('hsk_overtime_logs').select('*', { count: 'exact', head: true }).eq('status', 'Pending');

      // 4. Recent Activity (Last 5 OT logs for now)
      const { data: logs } = await supabase
        .from('hsk_overtime_logs')
        .select(`*, host:hsk_hosts(full_name)`)
        .order('created_at', { ascending: false })
        .limit(4);

      setStats({
        totalHosts: hostCount || 0,
        pendingOrders: orderCount || 0,
        pendingOT: otCount || 0,
        lowStock: 3 // Placeholder
      });

      setRecentActivity(logs || []);
      setIsLoading(false);
    };

    fetchStats();
  }, []);

  // Time Based Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{greeting}, Team</h1>
          <p className="text-sm font-bold text-slate-400 mt-1">Here is the pulse of your operation today.</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm text-xs font-bold text-slate-500">
           {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* KPI GRID - INSIGHTS ONLY */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
         <Link href="/hosts" className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
               <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors"><Users size={20}/></div>
               <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">Active</span>
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-1">{stats.totalHosts}</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Staff</p>
         </Link>

         <Link href="/orders" className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
               <div className={`p-3 rounded-xl transition-colors ${stats.pendingOrders > 0 ? 'bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white' : 'bg-slate-50 text-slate-400'}`}>
                  <ShoppingCart size={20}/>
               </div>
               {stats.pendingOrders > 0 && <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg animate-pulse">Action Needed</span>}
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-1">{stats.pendingOrders}</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pending Requests</p>
         </Link>

         <Link href="/overtime" className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
               <div className={`p-3 rounded-xl transition-colors ${stats.pendingOT > 0 ? 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white' : 'bg-slate-50 text-slate-400'}`}>
                  <Clock size={20}/>
               </div>
               {stats.pendingOT > 0 && <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">{stats.pendingOT} Approval(s)</span>}
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-1">{stats.pendingOT}</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">OT Requests</p>
         </Link>

         <Link href="/inventory/store" className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
               <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors"><Package size={20}/></div>
               <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Stable</span>
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-1">98%</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Stock Health</p>
         </Link>
      </div>

      {/* QUICK ACTIONS & FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         
         {/* FEED */}
         <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-[#6D2158]">Recent Activity</h3>
               <button className="text-xs font-bold text-slate-400 hover:text-[#6D2158] uppercase tracking-wider">View All</button>
            </div>
            <div className="space-y-4">
               {recentActivity.length === 0 && <p className="text-sm text-slate-400 italic">No recent logs.</p>}
               {recentActivity.map((log: any) => (
                  <div key={log.id} className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                     <div className="w-10 h-10 rounded-full bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center font-bold text-sm">
                        {log.host?.full_name?.charAt(0) || '?'}
                     </div>
                     <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">{log.host?.full_name} <span className="text-slate-400 font-normal">logged overtime</span></p>
                        <p className="text-xs text-slate-400 font-bold uppercase">{log.total_hours} Hours • {log.reason}</p>
                     </div>
                     <span className="text-[10px] font-bold text-slate-300 bg-slate-50 px-2 py-1 rounded-lg">
                        {new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                     </span>
                  </div>
               ))}
            </div>
         </div>

         {/* SHORTCUTS - This replaces your forms */}
         <div className="bg-[#6D2158] text-white rounded-2xl shadow-xl shadow-[#6D2158]/20 p-6 flex flex-col justify-between relative overflow-hidden">
            <div className="relative z-10">
               <div className="flex items-center gap-2 mb-1">
                   <Zap size={20} className="text-amber-300"/>
                   <h3 className="text-xl font-bold">Quick Shortcuts</h3>
               </div>
               <p className="text-xs opacity-70 mb-6 uppercase tracking-wider">Tap to Create</p>
               
               <div className="space-y-3">
                  {/* Minibar & Service Requests now direct to Orders */}
                  <Link href="/orders" className="flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-colors cursor-pointer backdrop-blur-sm group">
                     <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform"><ShoppingCart size={14}/></div>
                     <span className="text-sm font-bold">Minibar / Store Request</span>
                     <ArrowRight size={14} className="ml-auto opacity-50"/>
                  </Link>
                  
                  <Link href="/overtime" className="flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-colors cursor-pointer backdrop-blur-sm group">
                     <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform"><Clock size={14}/></div>
                     <span className="text-sm font-bold">Log Overtime</span>
                     <ArrowRight size={14} className="ml-auto opacity-50"/>
                  </Link>
                  
                  {/* Placeholder for future Service Request */}
                  <button onClick={() => alert("Coming soon in Housekeeping Module!")} className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-colors cursor-pointer backdrop-blur-sm group text-left">
                     <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform"><AlertTriangle size={14}/></div>
                     <span className="text-sm font-bold">Service Request</span>
                     <ArrowRight size={14} className="ml-auto opacity-50"/>
                  </button>
               </div>
            </div>
            
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
         </div>
      </div>

    </div>
  );
}
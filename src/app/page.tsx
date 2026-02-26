"use client";
import React, { useEffect, useState } from 'react';
import { 
  Users, ShoppingCart, Clock, AlertTriangle, 
  ArrowRight, CheckCircle2, Package,
  Zap, Bell, ClipboardList, Wine, Calendar
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { differenceInDays, parseISO } from 'date-fns';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalHosts: 0, pendingOrders: 0, pendingReqs: 0, expiringBatches: 0 });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [criticalItems, setCriticalItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { 
      fetchDashboardData(); 

      // --- REALTIME COLLABORATION LISTENERS ---
      const reqChannel = supabase.channel('dashboard_reqs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, () => {
            fetchDashboardData(false); // Silently refresh data on any change
        }).subscribe();

      const orderChannel = supabase.channel('dashboard_orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_procurement_orders' }, () => {
            fetchDashboardData(false);
        }).subscribe();

      return () => {
          supabase.removeChannel(reqChannel);
          supabase.removeChannel(orderChannel);
      };
  }, []);

  const fetchDashboardData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    const todayStr = new Date().toISOString().split('T')[0];

    const { count: hostCount } = await supabase.from('hsk_hosts').select('*', { count: 'exact', head: true });
    const { count: orderCount } = await supabase.from('hsk_procurement_orders').select('*', { count: 'exact', head: true }).neq('status', 'Completed');
    
    const { data: reqs } = await supabase.from('hsk_daily_requests').select('*')
        .gte('request_time', `${todayStr}T00:00:00`)
        .lte('request_time', `${todayStr}T23:59:59`)
        .order('request_time', { ascending: false });

    const pendingReqsCount = reqs?.filter(r => (r.request_type === 'Minibar' ? !r.is_posted : !r.is_done)).length || 0;

    const { data: batches } = await supabase.from('hsk_expiry_batches').select(`*, master:article_number(article_name)`).neq('status', 'Archived');
    const { data: catalog } = await supabase.from('hsk_master_catalog').select('article_number, article_name');
    
    const expiringList = (batches || []).map((b: any) => {
        const days = differenceInDays(parseISO(String(b.expiry_date)), new Date());
        const masterItem = catalog?.find((c: any) => c.article_number === b.article_number);
        return { ...b, item_name: masterItem?.article_name || b.article_number, days };
    }).filter((b: any) => b.days <= 60).sort((a: any, b: any) => a.days - b.days);

    setStats({ totalHosts: hostCount || 0, pendingOrders: orderCount || 0, pendingReqs: pendingReqsCount, expiringBatches: expiringList.length });
    setCriticalItems(expiringList);
    setRecentActivity((reqs || []).slice(0, 6));
    if (showLoading) setIsLoading(false);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  if (isLoading) {
      return (
          <div className="flex-1 flex items-center justify-center text-[#6D2158] h-full">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-[#6D2158]/20 border-t-[#6D2158] rounded-full animate-spin"></div>
                  <p className="font-bold uppercase tracking-widest text-sm animate-pulse">Syncing Pulse...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col min-h-full bg-slate-50 font-sans text-slate-800">
      
      {/* NATIVE STICKY HEADER */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 py-5 md:px-8 md:py-6 shadow-sm flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#6D2158]">{greeting}</h1>
          <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Pulse of the Operation</p>
        </div>
        <div className="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 w-fit shadow-inner">
           <span className="relative flex h-2 w-2 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
           </span>
           Live Sync Active
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-6">
          {/* KPI GRID */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
             <Link href="/requests" className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all group flex flex-col">
                <div className="flex justify-between items-start mb-4">
                   <div className={`p-3 rounded-2xl transition-colors ${stats.pendingReqs > 0 ? 'bg-amber-100 text-amber-600 group-hover:bg-amber-500 group-hover:text-white' : 'bg-slate-50 text-slate-400'}`}>
                      <ClipboardList size={24}/>
                   </div>
                </div>
                <h3 className="text-4xl font-black text-slate-800 mb-1 tracking-tighter">{stats.pendingReqs}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pending Reqs</p>
             </Link>

             <Link href="/orders" className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all group flex flex-col">
                <div className="flex justify-between items-start mb-4">
                   <div className={`p-3 rounded-2xl transition-colors ${stats.pendingOrders > 0 ? 'bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white' : 'bg-slate-50 text-slate-400'}`}>
                      <ShoppingCart size={24}/>
                   </div>
                </div>
                <h3 className="text-4xl font-black text-slate-800 mb-1 tracking-tighter">{stats.pendingOrders}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Open Orders</p>
             </Link>

             <Link href="/minibar/expiry" className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all group flex flex-col">
                <div className="flex justify-between items-start mb-4">
                   <div className={`p-3 rounded-2xl transition-colors ${stats.expiringBatches > 0 ? 'bg-rose-100 text-rose-600 group-hover:bg-rose-600 group-hover:text-white' : 'bg-emerald-100 text-emerald-600'}`}>
                      {stats.expiringBatches > 0 ? <AlertTriangle size={24}/> : <CheckCircle2 size={24}/>}
                   </div>
                </div>
                <h3 className="text-4xl font-black text-slate-800 mb-1 tracking-tighter">{stats.expiringBatches}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expiry Alerts</p>
             </Link>

             <Link href="/hosts" className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all group flex flex-col">
                <div className="flex justify-between items-start mb-4">
                   <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl group-hover:bg-purple-600 group-hover:text-white transition-colors"><Users size={24}/></div>
                </div>
                <h3 className="text-4xl font-black text-slate-800 mb-1 tracking-tighter">{stats.totalHosts}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Staff</p>
             </Link>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
             {/* LEFT: LIVE ACTIVITY FEED */}
             <div className="xl:col-span-2 bg-white rounded-[2rem] shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                   <h3 className="text-sm font-black text-[#6D2158] uppercase tracking-widest flex items-center gap-2"><Bell size={16}/> Live Feed</h3>
                   <Link href="/requests" className="text-[10px] bg-white px-3 py-1.5 rounded-full shadow-sm font-bold text-slate-500 hover:text-[#6D2158] uppercase tracking-wider active:scale-95 transition-transform">View All</Link>
                </div>
                <div className="p-4 flex-1">
                   {recentActivity.length === 0 ? (
                       <div className="h-full flex flex-col items-center justify-center text-slate-300 py-10">
                           <CheckCircle2 size={48} className="mb-4 opacity-20"/>
                           <p className="text-sm font-bold">No requests logged today.</p>
                       </div>
                   ) : (
                       <div className="space-y-3">
                           {recentActivity.map((log: any) => (
                              <div key={log.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-2">
                                 <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center font-black text-lg shadow-sm ${log.request_type === 'Minibar' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {log.villa_number}
                                 </div>
                                 <div className="flex-1">
                                    <p className="text-sm font-bold text-slate-800 line-clamp-1">{log.item_details.replace(/\n/g, ', ')}</p>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{log.attendant_name}</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">•</span>
                                        <span className="text-[10px] font-bold text-[#6D2158] uppercase tracking-wider">{new Date(log.request_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZone: 'Asia/Dhaka'})}</span>
                                    </div>
                                 </div>
                                 <div>
                                     {(log.request_type === 'Minibar' ? log.is_posted : log.is_done) 
                                        ? <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase">Done</span>
                                        : <span className="bg-slate-200 text-slate-500 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase">Pending</span>
                                     }
                                 </div>
                              </div>
                           ))}
                       </div>
                   )}
                </div>
             </div>

             {/* RIGHT: ALERTS */}
             <div className="space-y-6 flex flex-col">
                 <div className={`p-6 rounded-[2rem] shadow-xl flex flex-col relative overflow-hidden ${criticalItems.length > 0 ? 'bg-rose-600 text-white shadow-rose-200' : 'bg-emerald-600 text-white shadow-emerald-200'}`}>
                    <div className="relative z-10">
                        <h3 className="text-lg font-black mb-1 flex items-center gap-2">
                            {criticalItems.length > 0 ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>} 
                            {criticalItems.length > 0 ? 'Expiry Action Required' : 'Stock Healthy'}
                        </h3>
                        <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-6">
                            {criticalItems.length > 0 ? 'Items expiring within 60 days' : 'No upcoming expirations'}
                        </p>
                        
                        <ul className="space-y-3">
                            {criticalItems.slice(0, 4).map(item => (
                                <li key={item.id} className="flex justify-between items-center bg-black/10 p-3 rounded-xl backdrop-blur-sm">
                                    <div className="flex-1 pr-4">
                                        <span className="text-sm font-bold block truncate">{item.item_name}</span>
                                        <span className="text-[10px] uppercase tracking-wider text-white/70">Batch: {new Date(item.expiry_date).toLocaleDateString('en-GB', {month:'short', year:'numeric'})}</span>
                                    </div>
                                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${item.days <= 0 ? 'bg-white text-rose-600 animate-pulse' : 'bg-white/20'}`}>
                                        {item.days < 0 ? 'Expired' : `${item.days} Days`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        
                        {criticalItems.length > 4 && (
                            <Link href="/minibar/expiry" className="block text-center mt-4 text-xs font-bold uppercase tracking-widest hover:text-white/70 transition-colors">
                                + {criticalItems.length - 4} More Items
                            </Link>
                        )}
                    </div>
                    <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                 </div>
             </div>
          </div>
      </div>
    </div>
  );
}
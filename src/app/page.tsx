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
  const [stats, setStats] = useState({
    totalHosts: 0,
    pendingOrders: 0,
    pendingReqs: 0,
    expiringBatches: 0
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [criticalItems, setCriticalItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Staff Count
    const { count: hostCount } = await supabase.from('hsk_hosts').select('*', { count: 'exact', head: true });
    
    // 2. Pending Orders (Procurement)
    const { count: orderCount } = await supabase.from('hsk_procurement_orders').select('*', { count: 'exact', head: true }).neq('status', 'Completed');

    // 3. Pending Guest Requests (Today)
    const { data: reqs } = await supabase
        .from('hsk_daily_requests')
        .select('*')
        .gte('request_time', `${todayStr}T00:00:00`)
        .lte('request_time', `${todayStr}T23:59:59`)
        .order('request_time', { ascending: false });

    // Calculate uncompleted/unposted requests
    const pendingReqsCount = reqs?.filter(r => (r.request_type === 'Minibar' ? !r.is_posted : !r.is_done)).length || 0;

    // 4. Expiry Alerts (Join with Master Catalog to get item names)
    const { data: batches } = await supabase
        .from('hsk_expiry_batches')
        .select(`*, master:article_number(article_name)`) // Assuming foreign key relation, if not we map it manually below
        .neq('status', 'Archived');

    // Fallback if foreign key isn't set up yet: we will just fetch the master catalog and map it
    const { data: catalog } = await supabase.from('hsk_master_catalog').select('article_number, article_name');
    
    const expiringList = (batches || []).map((b: any) => {
        const days = differenceInDays(parseISO(String(b.expiry_date)), new Date());
        const masterItem = catalog?.find((c: any) => c.article_number === b.article_number);
        return {
            ...b,
            item_name: masterItem?.article_name || b.article_number,
            days
        };
    }).filter((b: any) => b.days <= 60).sort((a: any, b: any) => a.days - b.days);

    setStats({
      totalHosts: hostCount || 0,
      pendingOrders: orderCount || 0,
      pendingReqs: pendingReqsCount,
      expiringBatches: expiringList.length
    });

    setCriticalItems(expiringList);
    setRecentActivity((reqs || []).slice(0, 6)); // Top 6 most recent requests today
    setIsLoading(false);
  };

  // Time Based Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  if (isLoading) {
      return (
          <div className="min-h-screen bg-[#FDFBFD] flex items-center justify-center text-[#6D2158]">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-[#6D2158]/20 border-t-[#6D2158] rounded-full animate-spin"></div>
                  <p className="font-bold uppercase tracking-widest text-sm animate-pulse">Syncing Pulse...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{greeting}, Team</h1>
          <p className="text-sm font-bold text-slate-400 mt-1">Here is the pulse of your operation today.</p>
        </div>
        <div className="bg-white px-5 py-3 rounded-xl border border-slate-100 shadow-sm text-xs font-bold text-[#6D2158] uppercase tracking-widest flex items-center gap-2">
           <Calendar size={16} className="text-slate-400"/>
           {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
         <Link href="/requests" className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
               <div className={`p-3 rounded-xl transition-colors ${stats.pendingReqs > 0 ? 'bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white' : 'bg-slate-50 text-slate-400'}`}>
                  <ClipboardList size={20}/>
               </div>
               {stats.pendingReqs > 0 && <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg animate-pulse">Action Needed</span>}
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-1">{stats.pendingReqs}</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pending Requests</p>
         </Link>

         <Link href="/orders" className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
               <div className={`p-3 rounded-xl transition-colors ${stats.pendingOrders > 0 ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white' : 'bg-slate-50 text-slate-400'}`}>
                  <ShoppingCart size={20}/>
               </div>
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-1">{stats.pendingOrders}</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Open Orders</p>
         </Link>

         <Link href="/minibar/expiry" className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
               <div className={`p-3 rounded-xl transition-colors ${stats.expiringBatches > 0 ? 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white' : 'bg-emerald-50 text-emerald-600'}`}>
                  {stats.expiringBatches > 0 ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}
               </div>
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-1">{stats.expiringBatches}</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Expiry Warnings</p>
         </Link>

         <Link href="/hosts" className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
               <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors"><Users size={20}/></div>
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-1">{stats.totalHosts}</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Staff</p>
         </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
         
         {/* LEFT: LIVE ACTIVITY FEED */}
         <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
               <h3 className="text-lg font-bold text-[#6D2158] flex items-center gap-2"><Bell size={18}/> Live Request Feed</h3>
               <Link href="/requests" className="text-xs font-bold text-slate-400 hover:text-[#6D2158] uppercase tracking-wider">View Logbook</Link>
            </div>
            <div className="p-6 flex-1">
               {recentActivity.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-slate-300 py-10">
                       <CheckCircle2 size={48} className="mb-4 opacity-20"/>
                       <p className="text-sm font-bold">No requests logged today yet.</p>
                   </div>
               ) : (
                   <div className="space-y-4">
                       {recentActivity.map((log: any) => (
                          <div key={log.id} className="flex items-center gap-4 p-4 bg-slate-50 hover:bg-[#6D2158]/5 rounded-xl transition-colors border border-slate-100">
                             <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${log.request_type === 'Minibar' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
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
                                    ? <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-bold uppercase">Done</span>
                                    : <span className="bg-slate-200 text-slate-500 px-3 py-1 rounded-lg text-[10px] font-bold uppercase">Pending</span>
                                 }
                             </div>
                          </div>
                       ))}
                   </div>
               )}
            </div>
         </div>

         {/* RIGHT: ALERTS & SHORTCUTS */}
         <div className="space-y-6 flex flex-col">
             
             {/* CRITICAL ALERTS BOX */}
             <div className={`p-6 rounded-2xl shadow-xl flex flex-col relative overflow-hidden ${criticalItems.length > 0 ? 'bg-rose-600 text-white shadow-rose-200' : 'bg-emerald-600 text-white shadow-emerald-200'}`}>
                <div className="relative z-10">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                        {criticalItems.length > 0 ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>} 
                        {criticalItems.length > 0 ? 'Expiry Action Required' : 'Stock is Healthy'}
                    </h3>
                    <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-6">
                        {criticalItems.length > 0 ? 'Items expiring within 60 days' : 'No upcoming expirations'}
                    </p>
                    
                    <ul className="space-y-3">
                        {criticalItems.slice(0, 4).map(item => (
                            <li key={item.id} className="flex justify-between items-center border-b border-white/10 pb-3">
                                <div className="flex-1 pr-4">
                                    <span className="text-sm font-bold block truncate">{item.item_name}</span>
                                    <span className="text-[10px] uppercase tracking-wider text-white/70">Batch: {new Date(item.expiry_date).toLocaleDateString('en-GB', {month:'short', year:'numeric'})}</span>
                                </div>
                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${item.days <= 0 ? 'bg-red-900 text-white animate-pulse' : 'bg-white/20'}`}>
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

             {/* QUICK SHORTCUTS */}
             <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex-1">
                <div className="flex items-center gap-2 mb-6">
                    <Zap size={18} className="text-amber-500"/>
                    <h3 className="text-md font-bold text-slate-800 uppercase tracking-widest">Shortcuts</h3>
                </div>
                
                <div className="space-y-3">
                  <Link href="/requests" className="flex items-center gap-4 bg-slate-50 hover:bg-[#6D2158]/5 p-3 rounded-xl transition-colors group">
                     <div className="w-10 h-10 rounded-lg bg-white shadow-sm border border-slate-100 flex items-center justify-center text-[#6D2158] group-hover:scale-105 transition-transform"><Wine size={18}/></div>
                     <div className="flex-1">
                         <span className="block text-sm font-bold text-slate-800">Log Request</span>
                         <span className="text-[10px] font-bold text-slate-400 uppercase">Minibar & Amenities</span>
                     </div>
                     <ArrowRight size={16} className="text-slate-300 group-hover:text-[#6D2158]"/>
                  </Link>
                  
                  <Link href="/orders" className="flex items-center gap-4 bg-slate-50 hover:bg-[#6D2158]/5 p-3 rounded-xl transition-colors group">
                     <div className="w-10 h-10 rounded-lg bg-white shadow-sm border border-slate-100 flex items-center justify-center text-[#6D2158] group-hover:scale-105 transition-transform"><ShoppingCart size={18}/></div>
                     <div className="flex-1">
                         <span className="block text-sm font-bold text-slate-800">Order Tracking</span>
                         <span className="text-[10px] font-bold text-slate-400 uppercase">Store / Purchasing</span>
                     </div>
                     <ArrowRight size={16} className="text-slate-300 group-hover:text-[#6D2158]"/>
                  </Link>
                  
                  <Link href="/overtime" className="flex items-center gap-4 bg-slate-50 hover:bg-[#6D2158]/5 p-3 rounded-xl transition-colors group">
                     <div className="w-10 h-10 rounded-lg bg-white shadow-sm border border-slate-100 flex items-center justify-center text-[#6D2158] group-hover:scale-105 transition-transform"><Clock size={18}/></div>
                     <div className="flex-1">
                         <span className="block text-sm font-bold text-slate-800">Log Overtime</span>
                         <span className="text-[10px] font-bold text-slate-400 uppercase">Timesheets & Offs</span>
                     </div>
                     <ArrowRight size={16} className="text-slate-300 group-hover:text-[#6D2158]"/>
                  </Link>
               </div>
             </div>

         </div>
      </div>

    </div>
  );
}
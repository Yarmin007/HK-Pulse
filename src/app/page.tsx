"use client";
import React, { useEffect, useState, useMemo } from 'react';
import { 
  Users, ShoppingCart, Clock, AlertTriangle, 
  ArrowRight, CheckCircle2,
  Zap, Bell, ClipboardList, Calendar, User,
  Coffee, Sun, Moon, Plane, X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { differenceInDays, parseISO, isAfter, isBefore, format } from 'date-fns';

export default function Dashboard() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- ADMIN STATE ---
  const [stats, setStats] = useState({ totalHosts: 0, pendingOrders: 0, pendingReqs: 0, expiringBatches: 0 });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [criticalItems, setCriticalItems] = useState<any[]>([]);

  // --- USER PROFILE & LEAVE BALANCES STATE ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userAttendance, setUserAttendance] = useState<any[]>([]);
  const [mySchedule, setMySchedule] = useState<any[]>([]);
  const [cutoffDate, setCutoffDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  
  // Dynamic Public Holidays
  const [publicHolidays, setPublicHolidays] = useState<{id: string, date: string, name: string}[]>([]);

  useEffect(() => { 
      fetchDashboardData(); 

      // --- REALTIME COLLABORATION LISTENERS ---
      const reqChannel = supabase.channel('dashboard_reqs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, () => {
            fetchDashboardData(false); 
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
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Fetch dynamic public holidays
    const { data: constData } = await supabase.from('hsk_constants').select('*').eq('type', 'public_holiday');
    if (constData) {
        const parsedHolidays = constData.map((c: any) => {
            const [d, n] = c.label.split('::');
            return { id: c.id, date: d, name: n };
        }).sort((a: any, b: any) => a.date.localeCompare(b.date));
        setPublicHolidays(parsedHolidays);
    }

    // 1. Fetch Logged-in User Profile & Determine Role
    const sessionData = localStorage.getItem('hk_pulse_session');
    let adminFlag = false;
    let loggedHostId = '';

    if (sessionData) {
        const parsed = JSON.parse(sessionData);
        adminFlag = parsed.system_role === 'admin' || localStorage.getItem('hk_pulse_admin_auth') === 'true';
        setIsAdmin(adminFlag);
        loggedHostId = parsed.host_id;
        
        const { data: hostData } = await supabase.from('hsk_hosts').select('*').eq('host_id', loggedHostId).single();
        if (hostData) setCurrentUser(hostData);
        
        const { data: attData } = await supabase.from('hsk_attendance').select('*').eq('host_id', loggedHostId);
        if (attData) setUserAttendance(attData);
    } else {
        adminFlag = localStorage.getItem('hk_pulse_admin_auth') === 'true';
        setIsAdmin(adminFlag);
    }

    // 2. Fetch Data based on Role
    if (adminFlag) {
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
    } else if (loggedHostId) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 6);
        const nextWeekStr = format(nextWeek, 'yyyy-MM-dd');
        
        const { data: roster } = await supabase.from('hsk_roster')
            .select('*')
            .eq('host_id', loggedHostId)
            .gte('date', todayStr)
            .lte('date', nextWeekStr);
            
        setMySchedule(roster || []);
    }

    if (showLoading) setIsLoading(false);
  };

  // --- LEAVE BALANCE MATH ENGINE FOR SINGLE USER ---
  const userBalances = useMemo(() => {
      if (!currentUser) return null;

      const targetDate = parseISO(cutoffDate);
      const targetYear = targetDate.getFullYear();
      const SYSTEM_START_DATE = new Date(2026, 0, 1); 
      
      const baseCfOff = currentUser.cf_off || 0;
      const baseCfAL = currentUser.cf_al || 0;
      const baseCfPH = currentUser.cf_ph || 0;

      const joinDate = currentUser.joining_date ? parseISO(currentUser.joining_date) : SYSTEM_START_DATE;
      const isExec = ['DA', 'DB'].includes(currentUser.host_level);
      const isIntern = (currentUser.role || '').toLowerCase().includes('intern');

      const recordsUpToTarget = userAttendance.filter(a => {
          const d = parseISO(a.date);
          return d >= SYSTEM_START_DATE && d <= targetDate;
      });

      // 1. Carried Forward (Calculated up to End of Previous Year)
      let cfOff = baseCfOff; let cfAL = baseCfAL; let cfPH = baseCfPH;
      if (targetYear > 2026) {
          const accrualStart = isAfter(joinDate, SYSTEM_START_DATE) ? joinDate : SYSTEM_START_DATE;
          const endOfPrevYear = new Date(targetYear - 1, 11, 31);
          if (isBefore(accrualStart, endOfPrevYear) || accrualStart.getTime() === endOfPrevYear.getTime()) {
              const daysBefore = differenceInDays(endOfPrevYear, accrualStart) + 1;
              const recordsBefore = userAttendance.filter(a => {
                  const d = parseISO(a.date);
                  return d >= accrualStart && d <= endOfPrevYear;
              });
              const penaltyBefore = recordsBefore.filter(a => ['SL', 'NP', 'A'].includes(a.status_code)).length;
              const eligibleBefore = Math.max(0, daysBefore - penaltyBefore);
              
              cfOff += (eligibleBefore / 7) - recordsBefore.filter(a => a.status_code === 'O').length;
              cfAL += (eligibleBefore / 12) - recordsBefore.filter(a => a.status_code === 'AL').length;
              cfPH -= recordsBefore.filter(a => a.status_code === 'PH').length;
          }
      } else if (targetYear < 2026) {
          cfOff = 0; cfAL = 0; cfPH = 0;
      }

      // 2. Accrual This Selected Year
      const startOfTargetYear = new Date(targetYear, 0, 1);
      const trackingStartThisYear = isAfter(joinDate, startOfTargetYear) ? joinDate : startOfTargetYear;
      
      let earnedOff = 0; let earnedAL = 0; let earnedPH = 0;
      
      if (targetDate >= trackingStartThisYear) {
          const daysActive = differenceInDays(targetDate, trackingStartThisYear) + 1;
          const recordsThisYear = recordsUpToTarget.filter(a => {
              const d = parseISO(a.date);
              return d >= trackingStartThisYear && d <= targetDate;
          });
          const penaltyDays = recordsThisYear.filter(a => ['SL', 'NP', 'A'].includes(a.status_code)).length;
          const eligibleDays = Math.max(0, daysActive - penaltyDays);
          
          earnedOff = eligibleDays / 7;
          earnedAL = eligibleDays / 12;
      }

      // Calculate PH based on passed declared holidays
      const accrualStartForPh = isAfter(joinDate, SYSTEM_START_DATE) ? joinDate : SYSTEM_START_DATE;
      publicHolidays.forEach(ph => {
          const phDate = parseISO(ph.date);
          if (phDate >= accrualStartForPh && phDate <= targetDate) {
              earnedPH += 1;
          }
      });

      // 3. Taken Leaves (Overall up to cutoff)
      const takenOff = recordsUpToTarget.filter(a => a.status_code === 'O').length;
      const takenAL = recordsUpToTarget.filter(a => a.status_code === 'AL').length;
      const takenPH = recordsUpToTarget.filter(a => a.status_code === 'PH').length;

      // 4. Fixed Quotas (Reset on Anniversary)
      let lastAnniversary = new Date(joinDate);
      lastAnniversary.setFullYear(targetYear);
      if (isAfter(lastAnniversary, targetDate)) {
          lastAnniversary.setFullYear(targetYear - 1);
      }
      
      const recordsSinceAnniversary = userAttendance.filter(a => {
          const d = parseISO(a.date);
          return d >= lastAnniversary && d <= targetDate;
      });
      
      const takenSL = recordsSinceAnniversary.filter(a => a.status_code === 'SL').length;
      const takenEL = recordsSinceAnniversary.filter(a => a.status_code === 'EL').length;
      const takenRR = recordsSinceAnniversary.filter(a => a.status_code === 'RR').length;

      const balOffVal = cfOff + earnedOff - takenOff;
      const balALVal = isIntern ? 0 : (cfAL + earnedAL - takenAL);
      const balPHVal = baseCfPH + earnedPH - takenPH;
      const balRRVal = isExec ? 7 - takenRR : 0;
      const totalBal = balOffVal + balALVal + balPHVal + balRRVal;

      return {
          balOff: balOffVal.toFixed(1),
          balAL: isIntern ? '0.0' : balALVal.toFixed(1),
          balPH: balPHVal.toFixed(1),
          balRR: isExec ? balRRVal.toString() : '-',
          balTotal: totalBal.toFixed(1),
          balSL: 30 - takenSL,
          balEL: 10 - takenEL
      };
  }, [currentUser, userAttendance, cutoffDate, publicHolidays]);

  const next7Days = useMemo(() => {
      return Array.from({ length: 7 }).map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() + i);
          return d;
      });
  }, []);

  const getShiftIcon = (shift: string) => {
      if (!shift) return <Calendar size={20} className="text-slate-400" />;
      if (shift.toUpperCase() === 'OFF' || shift.toUpperCase() === 'O') return <Coffee size={20} className="text-blue-500" />;
      if (shift.toUpperCase() === 'VAC' || shift === 'AL') return <Plane size={20} className="text-amber-500" />;
      if (shift.toLowerCase().includes('morn')) return <Sun size={20} className="text-emerald-500" />;
      if (shift.toLowerCase().includes('even') || shift.toLowerCase().includes('night')) return <Moon size={20} className="text-indigo-500" />;
      return <Clock size={20} className="text-[#6D2158]" />;
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

  // Quick helper for balance cards
  const BalanceCard = ({ label, value, color, isTotal = false }: any) => (
      <div className={`p-4 rounded-2xl border flex flex-col justify-center items-center ${
          isTotal ? 'bg-[#6D2158] text-white border-[#6D2158] shadow-lg shadow-purple-900/20 transform scale-105' : `bg-${color}-50 border-${color}-100`
      }`}>
          <span className={`text-[10px] font-bold uppercase tracking-widest text-center ${isTotal ? 'text-white/80' : `text-${color}-500`}`}>{label}</span>
          <span className={`text-2xl font-black mt-1 ${isTotal ? 'text-white' : `text-${color}-700`}`}>{value}</span>
      </div>
  );

  return (
    <div className="flex flex-col min-h-full bg-slate-50 font-sans text-slate-800">
      
      {/* NATIVE STICKY HEADER WITH PROFILE */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 py-5 md:px-8 md:py-6 shadow-sm flex flex-col xl:flex-row justify-between xl:items-end gap-6">
        <div className="flex items-center gap-5">
           <div className="w-16 h-16 md:w-20 md:h-20 rounded-[1.25rem] overflow-hidden bg-slate-100 border-2 border-slate-200 shrink-0 shadow-sm">
               {currentUser?.image_url ? (
                   <img src={currentUser.image_url} className="w-full h-full object-cover" alt="Profile" />
               ) : (
                   <User className="w-full h-full p-4 text-slate-300"/>
               )}
           </div>
           <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#6D2158]">
                  {greeting}, {currentUser?.full_name?.split(' ')[0] || 'User'}
              </h1>
              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
                 {currentUser?.role || 'Staff'} • {currentUser?.host_id || 'Unknown ID'}
                 <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Active</span>
              </p>
           </div>
        </div>

        <div className="flex flex-col items-start xl:items-end gap-2">
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">My Leave Balances As Of</span>
                <button onClick={() => setIsHolidayModalOpen(true)} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors uppercase tracking-wider border border-blue-200 relative z-30">
                    View Holidays
                </button>
            </div>
            
            {/* FULLY CLICKABLE DATE PICKER BOX */}
            <div className="relative cursor-pointer group w-fit">
                {/* The invisible input covers the entire visual div below it */}
                <input 
                    type="date" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    value={cutoffDate}
                    onChange={e => e.target.value && setCutoffDate(e.target.value)}
                />
                <div className="flex items-center bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm group-hover:border-[#6D2158] transition-colors gap-2">
                    <Calendar size={16} className="text-[#6D2158] shrink-0 group-focus-within:animate-pulse"/>
                    <span className="font-black text-sm text-[#6D2158] tracking-wide">{format(parseISO(cutoffDate), 'dd MMM yyyy')}</span>
                </div>
            </div>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-8 pb-32">
          
          {/* USER BALANCES STRIP */}
          {userBalances && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  <BalanceCard label="Off Days" value={userBalances.balOff} color="emerald" />
                  <BalanceCard label="Annual" value={userBalances.balAL} color="cyan" />
                  <BalanceCard label="Public Hol" value={userBalances.balPH} color="blue" />
                  {userBalances.balRR !== '-' && <BalanceCard label="Rest & Rec" value={userBalances.balRR} color="fuchsia" />}
                  <BalanceCard label="Total Owed" value={userBalances.balTotal} isTotal />
                  
                  <div className="hidden lg:flex items-center justify-center"><div className="h-10 w-px bg-slate-300"></div></div>
                  
                  <BalanceCard label="Sick Lvl" value={userBalances.balSL} color="rose" />
                  <BalanceCard label="Emergency" value={userBalances.balEL} color="orange" />
              </div>
          )}

          {isAdmin ? (
              <>
                  {/* ADMIN ONLY: KPI GRID */}
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

                  {/* ADMIN ONLY: LIVE FEED & ALERTS */}
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
              </>
          ) : (
              /* STAFF ONLY: UPCOMING SCHEDULE GRID */
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col animate-in fade-in">
                  <div className="p-6 md:p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                     <h3 className="text-sm font-black text-[#6D2158] uppercase tracking-widest flex items-center gap-3">
                        <Calendar size={18}/> My Upcoming Schedule
                     </h3>
                     <Link href="/schedule" className="text-[10px] bg-white px-4 py-2 rounded-full shadow-sm font-bold text-slate-500 hover:text-[#6D2158] hover:shadow-md uppercase tracking-wider active:scale-95 transition-all">Full Month</Link>
                  </div>
                  <div className="p-6 md:p-8 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
                      {next7Days.map((date, i) => {
                          const dateStr = format(date, 'yyyy-MM-dd');
                          const shift = mySchedule.find(s => s.date === dateStr)?.shift_type || 'TBA';
                          const isToday = i === 0;

                          return (
                              <div key={dateStr} className={`p-5 rounded-3xl border-2 flex flex-col items-center justify-center text-center transition-all ${
                                  isToday ? 'border-[#6D2158] bg-[#6D2158]/5 shadow-md transform scale-105' : 'border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm'
                              }`}>
                                  <div className="mb-4 bg-white p-3 rounded-full shadow-sm border border-slate-50">
                                      {getShiftIcon(shift)}
                                  </div>
                                  <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isToday ? 'text-[#6D2158]' : 'text-slate-400'}`}>
                                      {isToday ? 'Today' : format(date, 'EEEE')}
                                  </span>
                                  <span className="text-2xl font-black text-slate-800 mb-3">{format(date, 'd MMM')}</span>
                                  <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                                      shift === 'OFF' ? 'bg-blue-100 text-blue-700' :
                                      shift === 'VAC' ? 'bg-amber-100 text-amber-700' :
                                      shift === 'TBA' ? 'bg-slate-100 text-slate-500' :
                                      'bg-emerald-100 text-emerald-700'
                                  }`}>
                                      {shift}
                                  </span>
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}
      </div>

      {/* --- PUBLIC HOLIDAYS MODAL --- */}
      {isHolidayModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
                  <div className="p-6 bg-[#6D2158] text-white flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="font-black text-xl flex items-center gap-2 tracking-tight"><Plane size={20}/> Public Holidays</h3>
                          <p className="text-[10px] uppercase tracking-widest text-white/70 mt-1">Maldives</p>
                      </div>
                      <button onClick={() => setIsHolidayModalOpen(false)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar bg-slate-50">
                      {publicHolidays.length === 0 ? (
                          <p className="text-center text-slate-400 italic text-sm py-10">No public holidays have been configured.</p>
                      ) : (
                          publicHolidays.map((h) => (
                              <div key={h.id} className="flex justify-between items-center p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                  <span className="font-bold text-slate-700 text-sm">{h.name}</span>
                                  <span className="text-[10px] font-black text-[#6D2158] bg-[#6D2158]/10 px-3 py-1.5 rounded-lg uppercase tracking-wider">
                                      {format(parseISO(h.date), 'dd MMM yyyy')}
                                  </span>
                              </div>
                          ))
                      )}
                      <p className="text-[10px] text-slate-400 italic text-center pt-2">Note: Islamic holiday dates are estimates and subject to moon sighting.</p>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
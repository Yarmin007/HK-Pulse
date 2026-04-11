"use client";
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  Users, ShoppingCart, Clock, AlertTriangle, 
  CheckCircle2, BarChart2, Edit3, Loader2, Search,
  Bell, ClipboardList, Calendar, User, Plane, X, Timer, ChevronLeft,
  CheckSquare, RefreshCw, ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { parseISO, format, isSameDay, startOfWeek, endOfWeek, addDays, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

// --- IMPORTED LOGIC & COMPONENTS ---
import { getPayrollPeriod, getUpcomingLeave, computeLeaveBalancesRPC, LEAVE_CODES } from '@/lib/payrollMath';
import { getDhakaTime, getDhakaDateStr, formatDisplayTime } from '@/lib/dateUtils';

// =========================================================================
// ⚡ PERFORMANCE FIX: ISOLATED LIVE CLOCK
// =========================================================================
const LiveClock = () => {
    const [time, setTime] = useState<Date>(new Date());
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return <span className="font-black tracking-widest">{formatDisplayTime(time)}</span>;
};

// =========================================================================
// 🎨 PRODUCTION-SAFE TAILWIND FIX
// =========================================================================
const COLOR_MAP: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-500 text-emerald-700',
    cyan: 'bg-cyan-50 border-cyan-100 text-cyan-500 text-cyan-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-500 text-blue-700',
    fuchsia: 'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-500 text-fuchsia-700',
    rose: 'bg-rose-50 border-rose-100 text-rose-500 text-rose-700',
    orange: 'bg-orange-50 border-orange-100 text-orange-500 text-orange-700',
};

const BalanceCard = ({ label, value, color, isTotal = false }: any) => {
    const themeClasses = isTotal 
        ? 'bg-[#6D2158] text-white border-[#6D2158] shadow-lg shadow-purple-900/20 transform md:scale-105' 
        : COLOR_MAP[color] || 'bg-slate-50 border-slate-100 text-slate-500 text-slate-700';

    const labelColor = isTotal ? 'text-white/80' : themeClasses.split(' ')[2];
    const valueColor = isTotal ? 'text-white' : themeClasses.split(' ')[3];

    return (
        <div className={`p-3 md:p-4 rounded-2xl border flex flex-col justify-center items-center ${themeClasses.split(' ').slice(0,2).join(' ')} ${isTotal ? themeClasses : ''}`}>
            <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-center leading-tight ${labelColor}`}>{label}</span>
            <span className={`text-xl md:text-2xl font-black mt-1 ${valueColor}`}>{value}</span>
        </div>
    );
};

type TeamConfig = {
    hostDepartments: Record<string, string>;
    supervisorAccess: Record<string, string[]>;
    nicknames: Record<string, string>;
};

// =========================================================================
// 🖥️ MAIN DASHBOARD COMPONENT
// =========================================================================

export default function Dashboard() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [stats, setStats] = useState({ totalHosts: 0, pendingOrders: 0, pendingReqs: 0, expiringBatches: 0 });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [criticalItems, setCriticalItems] = useState<any[]>([]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [rpcStats, setRpcStats] = useState<any[]>([]);
  const [futureLeaves, setFutureLeaves] = useState<any[]>([]);
  const [anniversaryLeaves, setAnniversaryLeaves] = useState<any[]>([]);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [teamConfig, setTeamConfig] = useState<TeamConfig>({ hostDepartments: {}, supervisorAccess: {}, nicknames: {} });
  const [allHosts, setAllHosts] = useState<any[]>([]);
  const [allSubDepts, setAllSubDepts] = useState<string[]>([]);
  
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [teamBalances, setTeamBalances] = useState<any[]>([]);
  const [activeDeptTab, setActiveDeptTab] = useState<string>('All');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamSortBy, setTeamSortBy] = useState<'balTotal' | 'balOff' | 'balAL'>('balTotal');
  
  const [selectedTeamHost, setSelectedTeamHost] = useState<any | null>(null);
  const [selectedTeamHostAtt, setSelectedTeamHostAtt] = useState<any[]>([]);

  const [myAttendance, setMyAttendance] = useState<any[]>([]);
  const [payrollStart, setPayrollStart] = useState<Date>(getDhakaTime());
  const [payrollEnd, setPayrollEnd] = useState<Date>(getDhakaTime());

  // ⚡ FIX: This is the ONLY date state now. It controls everything.
  const [cutoffDate, setCutoffDate] = useState(getDhakaDateStr());
  const cutoffDateRef = useRef(cutoffDate); 

  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState<{id: string, date: string, name: string}[]>([]);

  const [adminTasks, setAdminTasks] = useState<any[]>([]);

  useEffect(() => {
      cutoffDateRef.current = cutoffDate;
  }, [cutoffDate]);

  useEffect(() => { 
      fetchDashboardData(); 
      const reqChannel = supabase.channel('dashboard_reqs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, () => { fetchDashboardData(false); }).subscribe();
      const orderChannel = supabase.channel('dashboard_orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_procurement_orders' }, () => { fetchDashboardData(false); }).subscribe();
      
      return () => { supabase.removeChannel(reqChannel); supabase.removeChannel(orderChannel); };
  }, []);

  // ⚡ FIX: Any time cutoffDate changes, instantly fetch new data from DB
  useEffect(() => {
      if (!isLoading) {
          const fetchRPC = async () => {
              const { data } = await supabase.rpc('get_all_attendance_stats', { p_target_date: cutoffDate });
              if (data) setRpcStats(data);
          };
          fetchRPC();
      }
  }, [cutoffDate, isLoading]);

  const handleHostClick = async (itemData: any) => {
      setSelectedTeamHost(itemData);
      setSelectedTeamHostAtt([]);
      // ⚡ FIX: Math is now correctly wired to the global cutoffDate
      const period = getPayrollPeriod(parseISO(cutoffDate));
      const { data } = await supabase.from('hsk_attendance')
          .select('*')
          .eq('host_id', itemData.host.host_id)
          .gte('date', format(period.start, 'yyyy-MM-dd'))
          .lte('date', format(period.end, 'yyyy-MM-dd'));
      setSelectedTeamHostAtt(data || []);
  };

  useEffect(() => {
      if (selectedTeamHost) handleHostClick(selectedTeamHost);
  }, [cutoffDate]);

  const fetchDashboardData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    const todayStr = getDhakaDateStr(); 
    const currentCutoff = cutoffDateRef.current;

    const [constRes, configRes] = await Promise.all([
        supabase.from('hsk_constants').select('*'),
        supabase.from('hsk_constants').select('label').eq('type', 'team_viewer_config').maybeSingle()
    ]);

    let loadedHolidays: any[] = [];
    if (constRes.data) {
        loadedHolidays = constRes.data.filter((c: any) => c.type === 'public_holiday').map((c: any) => {
            const [d, n] = c.label.split('::');
            return { id: c.id, date: d, name: n };
        }).sort((a: any, b: any) => a.date.localeCompare(b.date));
        setPublicHolidays(loadedHolidays);

        const depts = constRes.data.filter((c: any) => c.type === 'sub_department').map((c: any) => c.label).sort();
        setAllSubDepts(depts);
    }

    let config: TeamConfig = { hostDepartments: {}, supervisorAccess: {}, nicknames: {} };
    if (configRes.data && configRes.data.label) {
        try { 
            const parsed = JSON.parse(configRes.data.label); 
            const sAccess = parsed.supervisorAccess || (parsed['101'] ? parsed : {});
            config = { hostDepartments: parsed.hostDepartments || {}, supervisorAccess: sAccess, nicknames: parsed.nicknames || {} };
        } catch (e) {}
    }
    setTeamConfig(config);

    const sessionData = localStorage.getItem('hk_pulse_session');
    let adminFlag = false;
    let superFlag = false;
    let loggedHostId = '';

    if (sessionData) {
        const parsed = JSON.parse(sessionData);
        adminFlag = parsed.system_role === 'admin' || localStorage.getItem('hk_pulse_admin_auth') === 'true';
        loggedHostId = String(parsed.host_id || '').trim();
        
        let allowedHosts: string[] = [];
        for (const key in config.supervisorAccess) {
            if (String(key).trim() === loggedHostId) {
                const val = config.supervisorAccess[key];
                allowedHosts = Array.isArray(val) ? val.map(v => String(v).trim()) : [];
                break;
            }
        }
        
        superFlag = adminFlag || allowedHosts.length > 0;
        setIsAdmin(adminFlag);
        setIsSupervisor(superFlag);
        
        const { data: hostData } = await supabase.from('hsk_hosts').select('*').eq('host_id', loggedHostId).single();
        if (hostData) {
            setCurrentUser(hostData);
            const localNick = localStorage.getItem(`nickname_${hostData.host_id}`);
            setDisplayName(config.nicknames[hostData.host_id] || localNick || '');
        }
        
        if (superFlag) {
            const [hostsRes, rpcRes, futureRes, anniRes] = await Promise.all([
                supabase.from('hsk_hosts').select('*').neq('status', 'Resigned').order('full_name'), 
                supabase.rpc('get_all_attendance_stats', { p_target_date: currentCutoff }), 
                supabase.from('hsk_attendance').select('host_id, date, status_code').gte('date', todayStr).in('status_code', LEAVE_CODES),
                supabase.from('hsk_attendance').select('host_id, date, status_code').in('status_code', ['SL', 'EL', 'RR']).gte('date', '2025-01-01')
            ]);

            if (hostsRes.data) {
                let finalHosts = hostsRes.data;
                if (!adminFlag) {
                    finalHosts = finalHosts.filter((h: any) => allowedHosts.includes(String(h.host_id).trim()) || String(h.host_id).trim() === loggedHostId);
                }
                setAllHosts(finalHosts);
            }
            
            setRpcStats(rpcRes.data || []);
            setFutureLeaves(futureRes.data || []);
            setAnniversaryLeaves(anniRes.data || []);

        } else {
            const [rpcRes, futureRes, anniRes] = await Promise.all([
                supabase.rpc('get_all_attendance_stats', { p_target_date: currentCutoff }), 
                supabase.from('hsk_attendance').select('host_id, date, status_code').eq('host_id', loggedHostId).gte('date', todayStr).in('status_code', LEAVE_CODES),
                supabase.from('hsk_attendance').select('host_id, date, status_code').eq('host_id', loggedHostId).in('status_code', ['SL', 'EL', 'RR']).gte('date', '2025-01-01')
            ]);
            setRpcStats(rpcRes.data || []);
            setFutureLeaves(futureRes.data || []);
            setAnniversaryLeaves(anniRes.data || []);
        }

    } else {
        adminFlag = localStorage.getItem('hk_pulse_admin_auth') === 'true';
        setIsAdmin(adminFlag);
        setIsSupervisor(adminFlag);
        
        if (adminFlag) {
             const [hostsRes, rpcRes, futureRes, anniRes] = await Promise.all([
                supabase.from('hsk_hosts').select('*').neq('status', 'Resigned').order('full_name'), 
                supabase.rpc('get_all_attendance_stats', { p_target_date: currentCutoff }), 
                supabase.from('hsk_attendance').select('host_id, date, status_code').gte('date', todayStr).in('status_code', LEAVE_CODES),
                supabase.from('hsk_attendance').select('host_id, date, status_code').in('status_code', ['SL', 'EL', 'RR']).gte('date', '2025-01-01')
            ]);
            if (hostsRes.data) setAllHosts(hostsRes.data);
            setRpcStats(rpcRes.data || []);
            setFutureLeaves(futureRes.data || []);
            setAnniversaryLeaves(anniRes.data || []);
        }
    }

    if (adminFlag) {
        const { count: hostCount } = await supabase.from('hsk_hosts').select('*', { count: 'exact', head: true }).neq('status', 'Resigned');
        const { count: orderCount } = await supabase.from('hsk_procurement_orders').select('*', { count: 'exact', head: true }).neq('status', 'Completed');
        
        const { data: reqs } = await supabase.from('hsk_daily_requests').select('*')
            .gte('request_time', `${todayStr}T00:00:00`)
            .lte('request_time', `${todayStr}T23:59:59`)
            .order('request_time', { ascending: false });

        const pendingReqsCount = reqs?.filter(r => (r.request_type === 'Minibar' ? !r.is_posted : !r.is_done)).length || 0;

        const { data: batches } = await supabase.from('hsk_expiry_batches').select(`*, master:article_number(article_name)`).neq('status', 'Archived');
        const { data: catalog } = await supabase.from('hsk_master_catalog').select('article_number, article_name');
        
        const expiringList = (batches || []).map((b: any) => {
            const days = differenceInDays(parseISO(String(b.expiry_date)), getDhakaTime());
            const masterItem = catalog?.find((c: any) => c.article_number === b.article_number);
            return { ...b, item_name: masterItem?.article_name || b.article_number, days };
        }).filter((b: any) => b.days <= 60).sort((a: any, b: any) => a.days - b.days);

        const { data: tasksData } = await supabase.from('hsk_admin_tasks')
            .select('*')
            .eq('status', 'Pending')
            .order('due_date', { ascending: true });

        setStats({ totalHosts: hostCount || 0, pendingOrders: orderCount || 0, pendingReqs: pendingReqsCount, expiringBatches: expiringList.length });
        setCriticalItems(expiringList);
        setRecentActivity((reqs || []).slice(0, 6));
        setAdminTasks(tasksData || []);
    } 
    
    if (loggedHostId) {
        const { start, end } = getPayrollPeriod(getDhakaTime());
        setPayrollStart(start);
        setPayrollEnd(end);

        const { data: payrollAtt } = await supabase.from('hsk_attendance')
            .select('date, status_code, shift_type')
            .eq('host_id', loggedHostId)
            .gte('date', format(start, 'yyyy-MM-dd'))
            .lte('date', format(end, 'yyyy-MM-dd'));
            
        setMyAttendance(payrollAtt || []);
    }

    if (showLoading) setIsLoading(false);
  };

  const handleCompleteTask = async (id: string) => {
      const { error } = await supabase.from('hsk_admin_tasks').update({ 
          status: 'Completed', 
          completed_at: new Date().toISOString(), 
          completed_by: currentUser?.full_name || 'Admin' 
      }).eq('id', id);

      if (!error) {
          setAdminTasks(adminTasks.filter(t => t.id !== id));
          toast.success('Task Completed!');
      }
  };

  const saveNickname = async () => {
      if (!tempName.trim() || !currentUser) { setIsEditingName(false); return; }
      
      setDisplayName(tempName.trim());
      setIsEditingName(false);

      try {
          localStorage.setItem(`nickname_${currentUser.host_id}`, tempName.trim());
          const { data: constData } = await supabase.from('hsk_constants').select('*').eq('type', 'team_viewer_config').maybeSingle();
          if (constData) {
              const parsed = JSON.parse(constData.label);
              parsed.nicknames = parsed.nicknames || {};
              parsed.nicknames[currentUser.host_id] = tempName.trim();
              await supabase.from('hsk_constants').update({ label: JSON.stringify(parsed) }).eq('id', constData.id);
          }
      } catch (e) {
          console.error("Failed to save nickname globally", e);
      }
  };

  const loadTeamLeaves = useCallback(() => {
      setIsTeamModalOpen(true);
      if (allHosts.length === 0) return;
      setIsLoadingTeam(true);

      const computed = allHosts.map((h: any) => {
          const bal = computeLeaveBalancesRPC(h, [], rpcStats, cutoffDate, publicHolidays, anniversaryLeaves);
          const myFutureLeaves = futureLeaves.filter(l => String(l.host_id).trim() === String(h.host_id).trim());
          const upcoming = getUpcomingLeave(myFutureLeaves, getDhakaDateStr());
          const dept = teamConfig.hostDepartments?.[h.host_id] || 'Unassigned';
          
          return { host: h, department: dept, balances: bal, upcoming };
      }).filter((c: any) => c.balances !== null);

      computed.sort((a: any, b: any) => parseFloat(b.balances.balTotal) - parseFloat(a.balances.balTotal));
      setTeamBalances(computed);
      
      setIsLoadingTeam(false);
  }, [allHosts, rpcStats, futureLeaves, anniversaryLeaves, cutoffDate, publicHolidays, teamConfig]);

  // ⚡ FIX: Ensuring loadTeamLeaves reliably fires when cutoffDate or rpcStats update
  useEffect(() => {
      if (isTeamModalOpen) loadTeamLeaves();
  }, [rpcStats, cutoffDate, isTeamModalOpen, loadTeamLeaves]);

  const upcomingLeaveInfo = useMemo(() => {
      if (!currentUser) return null;
      const myFuture = futureLeaves.filter(l => String(l.host_id).trim() === String(currentUser.host_id).trim());
      return getUpcomingLeave(myFuture, getDhakaDateStr());
  }, [currentUser, futureLeaves]);

  const userBalances = useMemo(() => {
      return computeLeaveBalancesRPC(currentUser, [], rpcStats, cutoffDate, publicHolidays, anniversaryLeaves);
  }, [currentUser, rpcStats, cutoffDate, publicHolidays, anniversaryLeaves]);

  // FULLY RESPONSIVE CALENDAR GRID
  const renderPayrollGrid = (attendanceArray: any[], startDateObj: Date, endDateObj: Date) => {
      if (!attendanceArray) return null;
      
      const startDate = startOfWeek(startDateObj);
      const endDate = endOfWeek(endDateObj);

      const rows = [];
      let days = [];
      let day = startDate;

      while (day <= endDate) {
          for (let i = 0; i < 7; i++) {
              const dateStr = format(day, 'yyyy-MM-dd');
              const record = attendanceArray.find(a => a.date === dateStr);
              const isCurrentPeriod = day >= startDateObj && day <= endDateObj;
              const isToday = isSameDay(day, getDhakaTime());

              const status = String(record?.status_code || '').toUpperCase().trim();
              const duty = record?.shift_type || '';

              let bgClass = 'bg-white border-slate-200';
              let textClass = 'text-slate-700';
              let badgeClass = 'bg-slate-100 text-slate-500 border-slate-200';

              if (status === 'O' || status === 'OFF') { 
                  bgClass = 'bg-blue-50/50 border-blue-100'; 
                  textClass = 'text-blue-800'; 
                  badgeClass = 'bg-blue-100 text-blue-700 border-blue-200';
              } else if (status === 'AL' || status === 'VAC') { 
                  bgClass = 'bg-cyan-50/50 border-cyan-100'; 
                  textClass = 'text-cyan-800'; 
                  badgeClass = 'bg-cyan-100 text-cyan-700 border-cyan-200';
              } else if (status === 'P') { 
                  bgClass = 'bg-emerald-50/50 border-emerald-100'; 
                  textClass = 'text-emerald-800'; 
                  badgeClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
              } else if (status === 'SL' || status === 'A' || status === 'NP') { 
                  bgClass = 'bg-rose-50/50 border-rose-100'; 
                  textClass = 'text-rose-800'; 
                  badgeClass = 'bg-rose-100 text-rose-700 border-rose-200';
              } else if (status === 'PH' || status === 'RR') { 
                  bgClass = 'bg-fuchsia-50/50 border-fuchsia-100'; 
                  textClass = 'text-fuchsia-800'; 
                  badgeClass = 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200';
              }

              if (!isCurrentPeriod) {
                  bgClass = 'bg-slate-50/30 border-transparent opacity-40';
              }

              days.push(
                  <div key={dateStr} className={`min-h-[55px] md:min-h-[85px] p-1.5 md:p-2 flex flex-col rounded-xl md:rounded-2xl border-2 transition-all overflow-hidden ${bgClass} ${isToday ? 'ring-2 ring-[#6D2158] ring-offset-1 md:ring-offset-2 shadow-md transform md:scale-105 z-10 bg-white' : ''}`}>
                      <span className={`text-[10px] md:text-sm font-black mb-0.5 md:mb-1 ${isToday ? 'text-[#6D2158]' : textClass}`}>
                          {format(day, 'd')} <span className="hidden md:inline text-[9px] font-normal opacity-60 ml-0.5">{format(day, 'MMM')}</span>
                      </span>
                      {isCurrentPeriod && status && (
                          <span className={`px-1 py-0.5 rounded text-[8px] md:text-[9px] font-black uppercase tracking-widest w-fit mb-0.5 md:mb-1 border shadow-sm ${badgeClass}`}>
                              {status}
                          </span>
                      )}
                      {isCurrentPeriod && duty && (
                          <div className={`mt-auto flex items-center gap-0.5 md:gap-1 text-[8px] md:text-[9px] font-bold uppercase ${textClass} opacity-80 truncate`}>
                              <Clock size={8} className="shrink-0 hidden md:block"/> <span className="truncate">{duty}</span>
                          </div>
                      )}
                  </div>
              );
              day = addDays(day, 1);
          }
          rows.push(<div className="grid grid-cols-7 gap-1 md:gap-3 mb-1 md:mb-3 w-full" key={day.toString()}>{days}</div>);
          days = [];
      }
      return <div className="mt-2 w-full pb-4">{rows}</div>;
  };

  const hour = getDhakaTime().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  if (isLoading) {
      return (
          <div className="flex-1 flex items-center justify-center text-[#6D2158] h-full min-h-screen">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-[#6D2158]/20 border-t-[#6D2158] rounded-full animate-spin"></div>
                  <p className="font-bold uppercase tracking-widest text-sm animate-pulse">Syncing Pulse...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col min-h-full bg-slate-50 font-sans text-slate-800 pb-20">
      
      {/* REDESIGNED CENTERED PROFILE HEADER */}
      <div className="relative pt-10 md:pt-16 pb-8 px-4 md:px-8 flex flex-col items-center justify-center text-center bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-[0_4px_30px_rgba(0,0,0,0.02)] z-30 animate-in fade-in slide-in-from-top-4">
          
          <div 
              className="relative w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden bg-slate-100 border-[6px] border-white shadow-xl mb-5 text-[#6D2158] flex items-center justify-center cursor-pointer group transition-transform active:scale-95" 
              onClick={() => { setTempName(displayName); setIsEditingName(true); }}
          >
              {currentUser?.image_url ? (
                  <img src={currentUser.image_url} className="w-full h-full object-cover" alt="Profile" />
              ) : (
                  <span className="text-4xl font-black">{(currentUser?.full_name || 'U').charAt(0)}</span>
              )}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Edit3 size={24} className="text-white"/>
              </div>
          </div>

          {isEditingName ? (
              <div className="flex flex-col items-center justify-center gap-2 mb-3">
                  <div className="flex items-center gap-2">
                      <input 
                          type="text" 
                          autoFocus
                          placeholder="Set Nickname"
                          className="text-lg font-black tracking-tight text-[#6D2158] bg-white border-2 border-[#6D2158] rounded-xl px-3 py-1 text-center outline-none w-48 shadow-lg" 
                          value={tempName} 
                          onChange={(e) => setTempName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveNickname()}
                      />
                      <button onClick={saveNickname} className="p-2 bg-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-200 shadow-md transition-colors"><CheckCircle2 size={20}/></button>
                  </div>
              </div>
          ) : (
              <div className="flex flex-col items-center">
                  <h1 className="text-2xl md:text-4xl font-black tracking-tight text-[#6D2158] mb-1.5">
                      {greeting}, {(currentUser?.full_name || 'Host').split(' ')[0]}
                  </h1>
                  {displayName && displayName !== (currentUser?.full_name || 'Host').split(' ')[0] && (
                      <span className="text-[10px] font-black uppercase tracking-widest bg-purple-50 text-[#6D2158] px-3 py-1 rounded-full border border-purple-100 shadow-sm mb-2">
                          AKA: {displayName}
                      </span>
                  )}
              </div>
          )}
          
          <p className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-widest flex flex-wrap items-center justify-center gap-2 mt-1">
              {currentUser?.role || 'Staff'} • {currentUser?.host_id || 'Unknown ID'}
              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] flex items-center gap-1.5 shadow-sm border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Active
              </span>
          </p>

          <div className="mt-4 inline-flex items-center gap-2 bg-white/50 backdrop-blur-md px-4 py-2 rounded-2xl shadow-sm border border-slate-200 text-[#6D2158]">
              <Clock size={16} />
              <LiveClock />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Resort Time</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-6 w-full">
              {isSupervisor && (
                  <button onClick={loadTeamLeaves} className="text-[10px] md:text-xs font-black text-purple-600 bg-purple-50 px-4 md:px-5 py-2.5 md:py-3 rounded-xl hover:bg-purple-100 transition-colors uppercase tracking-widest border border-purple-200 flex items-center gap-2 shadow-sm">
                      <BarChart2 size={16}/> Team Leaves
                  </button>
              )}
              <button onClick={() => setIsHolidayModalOpen(true)} className="text-[10px] md:text-xs font-black text-blue-600 bg-blue-50 px-4 md:px-5 py-2.5 md:py-3 rounded-xl hover:bg-blue-100 transition-colors uppercase tracking-widest border border-blue-200 flex items-center gap-2 shadow-sm">
                  <Plane size={16}/> Holidays
              </button>
              
              <div className="flex items-center bg-white px-3 md:px-4 py-2 md:py-2.5 rounded-xl border border-slate-200 shadow-sm hover:border-[#6D2158] transition-colors gap-2">
                  <Calendar size={16} className="text-[#6D2158] shrink-0" />
                  <input 
                      type="date" 
                      className="bg-transparent font-black text-xs md:text-sm text-[#6D2158] uppercase tracking-widest outline-none cursor-pointer"
                      value={cutoffDate}
                      onChange={e => {
                          if (e.target.value) setCutoffDate(e.target.value);
                      }}
                  />
              </div>
          </div>
      </div>

      {/* Main Content Area */}
      <div className="p-0 md:p-8 space-y-6 md:space-y-8 pb-32">
          
          {/* USER BALANCES STRIP */}
          {userBalances && (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3 animate-in slide-in-from-bottom-4 px-2 md:px-0 pt-2 md:pt-0">
                  <BalanceCard label="Total Owed" value={userBalances.balTotal} isTotal />
                  <BalanceCard label="Off Days" value={userBalances.balOff} color="emerald" />
                  <BalanceCard label="Annual" value={userBalances.balAL} color="cyan" />
                  <BalanceCard label="Public Hol" value={userBalances.balPH} color="blue" />
                  {userBalances.balRR !== '-' && <BalanceCard label="Rest & Rec" value={userBalances.balRR} color="fuchsia" />}
                  
                  <div className="col-span-3 sm:col-span-4 lg:col-span-1 lg:flex items-center justify-center hidden"><div className="h-10 w-px bg-slate-300"></div></div>
                  
                  <BalanceCard label="Sick Lvl" value={userBalances.balSL} color="rose" />
                  <BalanceCard label="Emergency" value={userBalances.balEL} color="orange" />
              </div>
          )}

          {/* UPCOMING LEAVE WIDGET */}
          {upcomingLeaveInfo && (
              <div className="px-2 md:px-0">
                  <div className={`p-5 rounded-3xl shadow-sm border flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-bottom-5 ${upcomingLeaveInfo.isOnLeaveNow ? 'bg-cyan-50 border-cyan-200 shadow-cyan-100' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner border ${upcomingLeaveInfo.isOnLeaveNow ? 'bg-white border-cyan-100 text-cyan-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                              {upcomingLeaveInfo.isOnLeaveNow ? <Plane size={24}/> : <Timer size={24}/>}
                          </div>
                          <div>
                              <h3 className="font-black text-lg text-slate-800 tracking-tight">
                                  {upcomingLeaveInfo.isOnLeaveNow ? "You are currently on leave." : "Upcoming Leave Scheduled"}
                              </h3>
                              <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">
                                  <span className="text-[#6D2158]">{format(upcomingLeaveInfo.startDate, 'MMM d, yyyy')}</span>
                                  <span className="mx-2 text-slate-300">to</span>
                                  <span className="text-[#6D2158]">{format(upcomingLeaveInfo.endDate, 'MMM d, yyyy')}</span>
                              </p>
                          </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto text-center md:text-right">
                          {upcomingLeaveInfo.isOnLeaveNow ? (
                              <div className="px-6 py-3 bg-cyan-600 text-white rounded-xl shadow-lg font-black uppercase tracking-widest text-xs flex flex-col items-center">
                                  <span>Return to Duty</span>
                                  <span className="text-sm mt-0.5">{format(upcomingLeaveInfo.returnDate, 'EEEE, MMM d')}</span>
                              </div>
                          ) : (
                              <div className="px-6 py-3 bg-slate-800 text-white rounded-xl shadow-lg font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                  {upcomingLeaveInfo.daysUntilLeave === 1 ? 'Starts Tomorrow' : `Starts in ${upcomingLeaveInfo.daysUntilLeave} Days`}
                              </div>
                          )}
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                              {upcomingLeaveInfo.totalLeaveDays} Days Total
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {isAdmin ? (
              <div className="px-2 md:px-0 space-y-6 md:space-y-8">
                  {/* ADMIN ONLY: KPI GRID */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 animate-in slide-in-from-bottom-6">
                     <Link href="/requests" className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all group flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                           <div className={`p-3 rounded-2xl transition-colors ${stats.pendingReqs > 0 ? 'bg-amber-100 text-amber-600 group-hover:bg-amber-500 group-hover:text-white' : 'bg-slate-50 text-slate-400'}`}>
                              <ClipboardList size={24}/>
                           </div>
                        </div>
                        <h3 className="text-3xl md:text-4xl font-black text-slate-800 mb-1 tracking-tighter">{stats.pendingReqs}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pending Reqs</p>
                     </Link>

                     <Link href="/orders" className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all group flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                           <div className={`p-3 rounded-2xl transition-colors ${stats.pendingOrders > 0 ? 'bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white' : 'bg-slate-50 text-slate-400'}`}>
                              <ShoppingCart size={24}/>
                           </div>
                        </div>
                        <h3 className="text-3xl md:text-4xl font-black text-slate-800 mb-1 tracking-tighter">{stats.pendingOrders}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Open Orders</p>
                     </Link>

                     <Link href="/minibar/expiry" className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all group flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                           <div className={`p-3 rounded-2xl transition-colors ${stats.expiringBatches > 0 ? 'bg-rose-100 text-rose-600 group-hover:bg-rose-600 group-hover:text-white' : 'bg-emerald-100 text-emerald-600'}`}>
                              {stats.expiringBatches > 0 ? <AlertTriangle size={24}/> : <CheckCircle2 size={24}/>}
                           </div>
                        </div>
                        <h3 className="text-3xl md:text-4xl font-black text-slate-800 mb-1 tracking-tighter">{stats.expiringBatches}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expiry Alerts</p>
                     </Link>

                     <Link href="/hosts" className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md active:scale-95 transition-all group flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                           <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl group-hover:bg-purple-600 group-hover:text-white transition-colors"><Users size={24}/></div>
                        </div>
                        <h3 className="text-3xl md:text-4xl font-black text-slate-800 mb-1 tracking-tighter">{stats.totalHosts}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Staff</p>
                     </Link>
                  </div>

                  {/* ADMIN ONLY: MAIN DASHBOARD PANELS */}
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start animate-in slide-in-from-bottom-7">
                     
                     {/* LIVE FEED */}
                     <div className="xl:col-span-2 bg-white md:rounded-[2rem] shadow-sm border-t border-b md:border border-slate-100 flex flex-col overflow-hidden">
                        <div className="p-5 md:p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                           <h3 className="text-sm font-black text-[#6D2158] uppercase tracking-widest flex items-center gap-2"><Bell size={16}/> Live Feed</h3>
                           <Link href="/requests" className="text-[10px] bg-white px-3 py-1.5 rounded-full shadow-sm font-bold text-slate-500 hover:text-[#6D2158] uppercase tracking-wider active:scale-95 transition-transform">View All</Link>
                        </div>
                        <div className="p-2 md:p-4 flex-1">
                           {recentActivity.length === 0 ? (
                               <div className="h-full flex flex-col items-center justify-center text-slate-300 py-10">
                                   <CheckCircle2 size={48} className="mx-auto mb-4 opacity-20"/>
                                   <p className="text-sm font-bold">No requests logged today.</p>
                               </div>
                           ) : (
                               <div className="space-y-0 md:space-y-3">
                                   {recentActivity.map((log: any) => (
                                      <div key={log.id} className="flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-white md:bg-slate-50 border-b border-slate-100 md:border md:rounded-2xl last:border-0">
                                         <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full md:rounded-[1rem] flex items-center justify-center font-black text-base md:text-lg shadow-sm shrink-0 ${log.request_type === 'Minibar' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {log.villa_number}
                                         </div>
                                         <div className="flex-1 min-w-0">
                                            <p className="text-xs md:text-sm font-bold text-slate-800 truncate">{log.item_details.replace(/\n/g, ', ')}</p>
                                            <div className="flex gap-2 mt-1">
                                                <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{log.attendant_name}</span>
                                                <span className="text-[9px] md:text-[10px] font-bold text-[#6D2158] uppercase tracking-wider shrink-0">• {formatDisplayTime(log.request_time)}</span>
                                            </div>
                                         </div>
                                         <div className="shrink-0">
                                             {(log.request_type === 'Minibar' ? log.is_posted : log.is_done) 
                                                ? <span className="bg-emerald-100 text-emerald-700 px-2 md:px-3 py-1 md:py-1.5 rounded-xl text-[9px] md:text-[10px] font-bold uppercase">Done</span>
                                                : <span className="bg-slate-200 text-slate-500 px-2 md:px-3 py-1 md:py-1.5 rounded-xl text-[9px] md:text-[10px] font-bold uppercase">Pending</span>
                                             }
                                         </div>
                                      </div>
                                   ))}
                               </div>
                           )}
                        </div>
                     </div>

                     {/* RIGHT COLUMN STACK */}
                     <div className="space-y-6 flex flex-col">
                         
                         {/* DASHBOARD REMINDERS (MINI) */}
                         <div className="bg-white md:rounded-[2rem] shadow-sm border-t border-b md:border border-slate-100 flex flex-col overflow-hidden relative">
                            <div className="p-5 md:p-6 border-b border-slate-50 flex justify-between items-center bg-purple-50/30">
                                <div>
                                    <h3 className="text-sm font-black text-[#6D2158] uppercase tracking-widest flex items-center gap-2"><CheckSquare size={16}/> Daily Reminders</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Link href="/tasks" className="text-[10px] bg-white text-slate-600 px-3 py-1.5 rounded-full shadow-sm font-bold uppercase tracking-wider hover:text-[#6D2158] active:scale-95 transition-transform border border-slate-200">Hub</Link>
                                </div>
                            </div>
                            <div className="p-2 md:p-4">
                                {adminTasks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center text-slate-300 py-6">
                                        <CheckSquare size={32} className="mb-2 opacity-20"/>
                                        <p className="text-xs font-bold text-slate-400">All caught up!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {adminTasks.slice(0, 4).map(task => {
                                            const isOverdue = task.due_date ? parseISO(task.due_date) < new Date(getDhakaTime().setHours(0,0,0,0)) : false;
                                            
                                            return (
                                                <div key={task.id} className={`p-3 rounded-xl border flex items-center justify-between ${isOverdue ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                                                    <div className="min-w-0 pr-3">
                                                        <h4 className="font-bold text-xs md:text-sm text-slate-800 line-clamp-1">{task.title}</h4>
                                                        <p className={`text-[9px] font-black uppercase tracking-widest mt-1 flex items-center gap-1 ${isOverdue ? 'text-rose-500' : 'text-slate-400'}`}>
                                                            {task.frequency !== 'One-Off' && <RefreshCw size={8}/>} {task.due_date ? `Due: ${format(parseISO(task.due_date), 'MMM d')}` : 'Action Required'}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button onClick={() => handleCompleteTask(task.id)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-500 transition-colors shadow-sm">
                                                            <CheckCircle2 size={16}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                         </div>
                         
                         {/* EXPIRY ALERTS */}
                         <div className={`p-5 md:p-6 mx-2 md:mx-0 rounded-3xl md:rounded-[2rem] shadow-xl flex flex-col relative overflow-hidden ${criticalItems.length > 0 ? 'bg-rose-600 text-white shadow-rose-200' : 'bg-emerald-600 text-white shadow-emerald-200'}`}>
                            <div className="relative z-10">
                                <h3 className="text-base md:text-lg font-black mb-1 flex items-center gap-2">
                                    {criticalItems.length > 0 ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>} 
                                    {criticalItems.length > 0 ? 'Expiry Action Required' : 'Stock Healthy'}
                                </h3>
                                <p className="text-white/80 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-6">
                                    {criticalItems.length > 0 ? 'Items expiring within 60 days' : 'No upcoming expirations'}
                                </p>
                                
                                <ul className="space-y-2 md:space-y-3">
                                    {criticalItems.slice(0, 4).map((item: any) => (
                                        <li key={item.id} className="flex justify-between items-center bg-black/10 p-2.5 md:p-3 rounded-xl backdrop-blur-sm">
                                            <div className="flex-1 pr-3 min-w-0">
                                                <span className="text-xs md:text-sm font-bold block truncate">{item.item_name}</span>
                                                <span className="text-[9px] md:text-[10px] uppercase tracking-wider text-white/70">Batch: {new Date(item.expiry_date).toLocaleDateString('en-GB', {month:'short', year:'numeric'})}</span>
                                            </div>
                                            <span className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest shrink-0 ${item.days <= 0 ? 'bg-white text-rose-600 animate-pulse' : 'bg-white/20'}`}>
                                                {item.days < 0 ? 'Expired' : `${item.days} Days`}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                
                                {criticalItems.length > 4 && (
                                    <Link href="/minibar/expiry" className="block text-center mt-4 text-[10px] font-bold uppercase tracking-widest hover:text-white/70 transition-colors">
                                        + {criticalItems.length - 4} More Items
                                    </Link>
                                )}
                            </div>
                            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                         </div>
                     </div>
                  </div>
              </div>
          ) : (
              /* STAFF ONLY: PAYROLL MONTH ATTENDANCE GRID */
              <div className="bg-white md:rounded-[2.5rem] shadow-sm border-t border-b md:border border-slate-100 overflow-hidden flex flex-col animate-in fade-in mx-2 md:mx-0">
                  <div className="p-5 md:p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                     <h3 className="text-sm font-black text-[#6D2158] uppercase tracking-widest flex items-center gap-2">
                        <Calendar size={16}/> My Attendance
                     </h3>
                     <Link href="/schedule" className="text-[10px] bg-white px-3 py-1.5 rounded-full shadow-sm font-bold text-slate-500 hover:text-[#6D2158] uppercase tracking-wider active:scale-95 transition-all">Full History</Link>
                  </div>
                  
                  <div className="p-3 md:p-6 w-full overflow-hidden">
                      <div className="w-full">
                          <div className="grid grid-cols-7 gap-1 md:gap-3 mb-1 w-full">
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                  <div key={d} className="text-center text-[9px] md:text-xs font-black uppercase text-slate-400 tracking-widest">
                                      <span className="md:hidden">{d.substring(0, 1)}</span>
                                      <span className="hidden md:inline">{d}</span>
                                  </div>
                              ))}
                          </div>
                          {renderPayrollGrid(myAttendance, payrollStart, payrollEnd)}
                      </div>
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

      {/* --- GRAPHICAL TEAM LEAVE INSIGHTS MODAL --- */}
      {isTeamModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
              <div className="bg-[#FDFBFD] w-full max-w-6xl rounded-none md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[100dvh] md:h-[95vh] md:max-h-[90vh] animate-in zoom-in-95">
                  <div className="p-4 md:p-6 bg-[#6D2158] text-white flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 gap-4 pt-10 md:pt-6">
                      <div className="flex justify-between w-full md:w-auto items-start">
                          <div>
                              <h3 className="font-black text-xl md:text-3xl flex items-center gap-2 md:gap-3 tracking-tight"><BarChart2 className="w-6 h-6 md:w-8 md:h-8"/> Team Leaves</h3>
                              <p className="text-[9px] md:text-xs uppercase tracking-widest text-white/70 mt-1 font-bold">Leave Liability Overview</p>
                          </div>
                          <button onClick={() => {setIsTeamModalOpen(false); setSelectedTeamHost(null);}} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors active:scale-95 md:hidden"><X size={18}/></button>
                      </div>
                      
                      {/* ⚡ FIX: Restored invisible overlay trick for native clicking! */}
                      <div className="flex items-center gap-3 w-full md:w-auto justify-between">
                          <div className="relative cursor-pointer group w-full md:w-auto">
                              <input 
                                  type="date" 
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
                                  value={cutoffDate}
                                  onChange={e => e.target.value && setCutoffDate(e.target.value)}
                              />
                              <div className="flex items-center bg-white/10 px-3 md:px-4 py-2 md:py-2.5 rounded-xl border border-white/20 gap-2 w-full transition-colors group-hover:bg-white/20">
                                  <Calendar size={14} className="text-white shrink-0"/>
                                  <span className="text-white font-bold text-xs md:text-sm tracking-widest uppercase">{format(parseISO(cutoffDate), 'dd MMM yyyy')}</span>
                              </div>
                          </div>
                          <button onClick={() => {setIsTeamModalOpen(false); setSelectedTeamHost(null);}} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors active:scale-95 hidden md:block"><X size={20}/></button>
                      </div>
                  </div>

                  <div className="flex flex-col flex-1 overflow-hidden">
                      {isLoadingTeam ? (
                          <div className="flex flex-col items-center justify-center h-full text-[#6D2158]">
                               <Loader2 size={48} className="animate-spin mb-4"/>
                               <p className="font-bold uppercase tracking-widest text-sm">Analyzing Team Data...</p>
                          </div>
                      ) : teamBalances.length === 0 ? (
                          <div className="text-center py-32 text-slate-400">
                              <Users size={64} className="mx-auto mb-4 opacity-20"/>
                              <p className="font-bold text-lg">No team members found in your scope.</p>
                          </div>
                      ) : selectedTeamHost ? (
                          <div className="flex flex-col h-full bg-slate-50 animate-in slide-in-from-right-8">
                              <div className="p-4 md:p-6 border-b border-slate-200 bg-white shrink-0 flex items-center justify-between">
                                  <div>
                                      <button onClick={() => setSelectedTeamHost(null)} className="text-[10px] font-bold uppercase tracking-widest text-[#6D2158] flex items-center gap-1 mb-2 hover:opacity-70 transition-opacity">
                                          <ChevronLeft size={14}/> Back to Team List
                                      </button>
                                      <h3 className="font-black text-xl text-slate-800">{selectedTeamHost.host.full_name}</h3>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedTeamHost.host.role}</p>
                                  </div>
                                  <div className="text-right">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Leaves Owed</p>
                                      <p className="text-3xl font-black text-[#6D2158]">{selectedTeamHost.balances.balTotal}</p>
                                  </div>
                              </div>
                              <div className="p-4 md:p-8 overflow-y-auto flex-1 pb-32">
                                  <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
                                      <div className="grid grid-cols-7 gap-2 xl:gap-3 mb-2 min-w-[600px]">
                                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                              <div key={d} className="text-center text-[10px] xl:text-xs font-black uppercase text-slate-400 tracking-widest">
                                                  {d}
                                              </div>
                                          ))}
                                      </div>
                                      {(() => {
                                          const teamPeriod = getPayrollPeriod(parseISO(cutoffDate));
                                          return renderPayrollGrid(selectedTeamHostAtt, teamPeriod.start, teamPeriod.end);
                                      })()}
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="flex flex-col h-full">
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 md:p-6 border-b border-slate-200 bg-white shrink-0">
                                  <div className="flex-1 flex gap-2 overflow-x-auto custom-scrollbar pb-2 w-full min-w-0">
                                      <button onClick={() => setActiveDeptTab('All')} className={`shrink-0 px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest whitespace-nowrap transition-all shadow-sm ${activeDeptTab === 'All' ? 'bg-[#6D2158] text-white border border-[#6D2158]' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'}`}>All Staff</button>
                                      
                                      {(isAdmin ? allSubDepts : Array.from(new Set(teamBalances.map(c => c.department))).filter(d => d !== 'Unassigned').sort()).map((dept: any) => (
                                          <button key={dept} onClick={() => setActiveDeptTab(dept)} className={`shrink-0 px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest whitespace-nowrap transition-all shadow-sm ${activeDeptTab === dept ? 'bg-[#6D2158] text-white border border-[#6D2158]' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'}`}>{dept}</button>
                                      ))}
                                  </div>
                                  
                                  <div className="flex gap-2 w-full lg:w-auto shrink-0">
                                      <select 
                                          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[10px] md:text-xs outline-none focus:border-[#6D2158] transition-colors text-slate-600 uppercase tracking-widest cursor-pointer shrink-0"
                                          value={teamSortBy}
                                          onChange={(e) => setTeamSortBy(e.target.value as any)}
                                      >
                                          <option value="balTotal">Sort: Total</option>
                                          <option value="balOff">Sort: Off Days</option>
                                          <option value="balAL">Sort: Annual</option>
                                      </select>
                                      <div className="relative w-full sm:w-48">
                                          <Search className="absolute left-3 top-2.5 md:top-3 text-slate-400" size={16}/>
                                          <input type="text" placeholder="Search..." className="w-full pl-10 pr-4 py-2 md:py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs md:text-sm outline-none focus:border-[#6D2158] transition-colors" value={teamSearch} onChange={e => setTeamSearch(e.target.value)} />
                                      </div>
                                  </div>
                              </div>

                              <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 md:bg-white pb-32">
                                  {(() => {
                                      let deptData = [...teamBalances];
                                      if (activeDeptTab !== 'All') {
                                          deptData = deptData.filter((c: any) => c.department === activeDeptTab);
                                      }
                                      if (teamSearch) {
                                          deptData = deptData.filter((c: any) => c.host.full_name.toLowerCase().includes(teamSearch.toLowerCase()) || String(c.host.host_id).includes(teamSearch));
                                      }

                                      deptData.sort((a: any, b: any) => parseFloat(b.balances[teamSortBy]) - parseFloat(a.balances[teamSortBy]));

                                      const totalOff = deptData.reduce((acc: number, curr: any) => acc + parseFloat(curr.balances.balOff), 0);
                                      const totalAL = deptData.reduce((acc: number, curr: any) => acc + parseFloat(curr.balances.balAL), 0);
                                      const totalPH = deptData.reduce((acc: number, curr: any) => acc + parseFloat(curr.balances.balPH), 0);
                                      const overall = totalOff + totalAL + totalPH;
                                      
                                      const offPct = overall ? (totalOff / overall) * 100 : 0;
                                      const alPct = overall ? (totalAL / overall) * 100 : 0;

                                      return (
                                          <div className="p-4 md:p-8 space-y-6 md:space-y-8 animate-in fade-in duration-300">
                                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                                                  <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-center text-center relative overflow-hidden">
                                                      <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Liability</div>
                                                      <div className="text-2xl md:text-4xl font-black text-rose-600">{overall.toFixed(1)} <span className="text-[10px] md:text-sm text-slate-400 font-bold uppercase tracking-widest">Days</span></div>
                                                      <div className="absolute -bottom-4 -right-4 w-16 h-16 md:w-24 md:h-24 bg-rose-50 rounded-full blur-2xl"></div>
                                                  </div>
                                                  
                                                  <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-center text-center relative overflow-hidden">
                                                      <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Highest Balance</div>
                                                      <div className="text-2xl md:text-4xl font-black text-amber-600">{deptData[0]?.balances.balTotal || 0} <span className="text-[10px] md:text-sm text-slate-400 font-bold uppercase tracking-widest">Days</span></div>
                                                      <div className="text-[9px] md:text-xs font-bold text-slate-600 bg-amber-50 px-2 py-1 md:px-3 md:py-1.5 rounded-lg mt-2 inline-block mx-auto border border-amber-100 truncate max-w-[100px] md:max-w-full">{deptData[0]?.host.full_name || 'N/A'}</div>
                                                      <div className="absolute -bottom-4 -right-4 w-16 h-16 md:w-24 md:h-24 bg-amber-50 rounded-full blur-2xl"></div>
                                                  </div>

                                                  <div className="col-span-2 md:col-span-1 bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex items-center justify-around md:justify-start gap-4 md:gap-6">
                                                      <div style={{ background: `conic-gradient(#10b981 ${offPct}%, #06b6d4 0 ${offPct + alPct}%, #3b82f6 0)` }} className="w-16 h-16 md:w-24 md:h-24 rounded-full relative shadow-inner shrink-0">
                                                          <div className="absolute inset-2 md:inset-3 bg-white rounded-full flex items-center justify-center font-black text-slate-800 text-sm md:text-lg shadow-sm">{deptData.length}</div>
                                                      </div>
                                                      <div className="flex-1 space-y-1.5 md:space-y-2">
                                                          <div className="flex justify-between items-center text-[10px] md:text-xs font-bold"><span className="flex items-center gap-2"><span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500"></span> Off Days</span> <span>{totalOff.toFixed(1)}</span></div>
                                                          <div className="flex justify-between items-center text-[10px] md:text-xs font-bold"><span className="flex items-center gap-2"><span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-cyan-500"></span> Annual</span> <span>{totalAL.toFixed(1)}</span></div>
                                                          <div className="flex justify-between items-center text-[10px] md:text-xs font-bold"><span className="flex items-center gap-2"><span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500"></span> Pub Hol</span> <span>{totalPH.toFixed(1)}</span></div>
                                                      </div>
                                                  </div>
                                              </div>

                                              <div className="bg-white p-0 md:p-8 rounded-2xl md:rounded-[2rem] md:shadow-sm md:border border-slate-200">
                                                  <div className="flex flex-col space-y-0 md:space-y-3">
                                                      {deptData.length === 0 ? (
                                                          <div className="text-center py-10 text-slate-400 font-bold italic text-sm border border-slate-100 rounded-2xl">No matches found.</div>
                                                      ) : (
                                                          deptData.map((itemData: any, idx: number) => {
                                                              const { host, balances, upcoming } = itemData;
                                                              const total = parseFloat(balances.balTotal);
                                                              const max = Math.max(...deptData.map((t: any) => parseFloat(t.balances.balTotal)), 1);
                                                              const overallWidth = Math.max((total / max) * 100, 0);
                                                              
                                                              const oPct = total ? (parseFloat(balances.balOff) / total) * 100 : 0;
                                                              const aPct = total ? (parseFloat(balances.balAL) / total) * 100 : 0;
                                                              const pPct = total ? (parseFloat(balances.balPH) / total) * 100 : 0;

                                                              return (
                                                                  <div 
                                                                      key={host.host_id} 
                                                                      onClick={() => handleHostClick(itemData)}
                                                                      className="flex flex-col gap-2 md:gap-3 group p-4 border-b border-slate-100 md:border md:border-transparent md:rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer last:border-0"
                                                                  >
                                                                      
                                                                      <div className="flex justify-between items-start md:items-end gap-2">
                                                                          <div className="min-w-0 flex-1">
                                                                              <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5 md:gap-2 truncate group-hover:text-[#6D2158] transition-colors">
                                                                                  <span className="text-[10px] text-slate-400 font-mono w-4 shrink-0">{idx + 1}.</span> 
                                                                                  <span className="truncate">{host.full_name}</span>
                                                                                  {teamConfig.nicknames?.[host.host_id] && (
                                                                                      <span className="text-[9px] bg-purple-50 text-[#6D2158] px-1.5 py-0.5 rounded font-black uppercase tracking-widest shrink-0 ml-1">AKA: {teamConfig.nicknames[host.host_id]}</span>
                                                                                  )}
                                                                                  <span className="hidden sm:inline text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-white shadow-sm border border-slate-200 px-2 py-0.5 rounded-md shrink-0 ml-1">{host.role}</span>
                                                                              </div>
                                                                              
                                                                              <div className="pl-5 mt-1.5 flex flex-wrap gap-2">
                                                                                  {upcoming?.isOnLeaveNow && (
                                                                                      <span className="text-[9px] bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 w-max border border-cyan-200">
                                                                                          <Plane size={10}/> On Leave • Returns {format(upcoming.returnDate, 'MMM d')}
                                                                                      </span>
                                                                                  )}
                                                                                  {!upcoming?.isOnLeaveNow && upcoming && upcoming.daysUntilLeave <= 30 && (
                                                                                      <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 w-max border border-amber-200">
                                                                                          <Calendar size={10}/> Leave in {upcoming.daysUntilLeave}d
                                                                                      </span>
                                                                                  )}
                                                                              </div>
                                                                          </div>
                                                                          <div className="text-right shrink-0">
                                                                              <span className={`font-black text-base md:text-lg ${parseFloat(balances[teamSortBy]) > (teamSortBy === 'balTotal' ? 15 : 7) ? 'text-rose-600' : 'text-[#6D2158]'}`}>
                                                                                  {balances[teamSortBy]}
                                                                              </span>
                                                                              {teamSortBy !== 'balTotal' && (
                                                                                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{teamSortBy === 'balOff' ? 'Off Days' : 'Annual'}</div>
                                                                              )}
                                                                          </div>
                                                                      </div>
                                                                      
                                                                      <div className="h-3 md:h-4 w-full bg-slate-100 rounded-full flex shadow-inner p-0.5 mt-1">
                                                                          <div className="h-full flex gap-0.5" style={{width: `${overallWidth}%`}}>
                                                                              {oPct > 0 && <div className="h-full bg-emerald-500 rounded-l-full" style={{width: `${oPct}%`}}></div>}
                                                                              {aPct > 0 && <div className="h-full bg-cyan-500" style={{width: `${aPct}%`}}></div>}
                                                                              {pPct > 0 && <div className="h-full bg-blue-500 rounded-r-full" style={{width: `${pPct}%`}}></div>}
                                                                          </div>
                                                                      </div>

                                                                      <div className="flex gap-4 text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                                                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {balances.balOff}</span>
                                                                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span> {balances.balAL}</span>
                                                                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> {balances.balPH}</span>
                                                                      </div>
                                                                  </div>
                                                              );
                                                          })
                                                      )}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })()}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
"use client";
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  Users, ShoppingCart, Clock, AlertTriangle, 
  CheckCircle2, BarChart2, Edit3, Loader2, Search,
  Bell, ClipboardList, Calendar, User, Plane, X, Timer, ChevronLeft,
  CheckSquare, RefreshCw, ChevronRight, Eye, ArrowLeft, UserCog,
  ListChecks, LayoutGrid, KeyRound, UserCheck, Contact, Briefcase
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { parseISO, format, isSameDay, startOfWeek, endOfWeek, addDays, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

// --- IMPORTED LOGIC & COMPONENTS ---
import { getPayrollPeriod, getUpcomingLeave, computeLeaveBalancesRPC, LEAVE_CODES } from '@/lib/payrollMath';
import { getDhakaTime, getDhakaDateStr, formatDisplayTime } from '@/lib/dateUtils';
import OccasionBanner from '@/components/OccasionBanner';
import { getProfileType, type ProfileType } from '@/lib/hostProfile';
import { fetchROEvents, isWorkedLeave } from '@/lib/attendanceData';

// =========================================================================
// ⚡ PERFORMANCE FIX: LIVE CLOCK
// =========================================================================
const LiveClock = () => {
    const [time, setTime] = useState<Date>(getDhakaTime());
    useEffect(() => {
        const timer = setInterval(() => setTime(getDhakaTime()), 1000);
        return () => clearInterval(timer);
    }, []);
    return <span className="font-black tracking-widest">{formatDisplayTime(time)}</span>;
};

type TeamConfig = {
    hostDepartments: Record<string, string>;
    supervisorAccess: Record<string, string[]>;
    nicknames: Record<string, string>;
    excludeAttendance?: Record<string, boolean>;
    profileTypes?: Record<string, ProfileType>;
};

export default function Dashboard() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [stats, setStats] = useState({ totalHosts: 0, pendingOrders: 0, pendingReqs: 0, expiringBatches: 0 });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [criticalItems, setCriticalItems] = useState<any[]>([]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeService, setActiveService] = useState<{villa: string, start_time: string} | null>(null);
  const [cleaningElapsedSeconds, setCleaningElapsedSeconds] = useState(0);
  
  const [rpcStats, setRpcStats] = useState<any[]>([]);
  const [futureLeaves, setFutureLeaves] = useState<any[]>([]);
  const [anniversaryLeaves, setAnniversaryLeaves] = useState<any[]>([]);
  const [roEvents, setRoEvents] = useState<any[]>([]);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [teamConfig, setTeamConfig] = useState<TeamConfig>({ hostDepartments: {}, supervisorAccess: {}, nicknames: {} });
  const [allHosts, setAllHosts] = useState<any[]>([]);
  const [simulationHosts, setSimulationHosts] = useState<any[]>([]);
  const [allSubDepts, setAllSubDepts] = useState<string[]>([]);
  
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [teamBalances, setTeamBalances] = useState<any[]>([]);
  const [activeDeptTab, setActiveDeptTab] = useState<string>('All');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamSortBy, setTeamSortBy] = useState<'balTotal' | 'balOff' | 'balAL'>('balTotal');
  
  const [selectedTeamHost, setSelectedTeamHost] = useState<any | null>(null);
  const [selectedTeamHostAtt, setSelectedTeamHostAtt] = useState<any[]>([]);

  // ⚡ SEARCHABLE SIMULATION MODAL STATES
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simulateSearchTerm, setSimulateSearchTerm] = useState('');

  const [myAttendance, setMyAttendance] = useState<any[]>([]);
  const [payrollStart, setPayrollStart] = useState<Date>(getDhakaTime());
  const [payrollEnd, setPayrollEnd] = useState<Date>(getDhakaTime());

  const [cutoffDate, setCutoffDate] = useState(getDhakaDateStr());
  const cutoffDateRef = useRef(cutoffDate); 

  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState<{id: string, date: string, name: string}[]>([]);

  const [adminTasks, setAdminTasks] = useState<any[]>([]);

  useEffect(() => {
      cutoffDateRef.current = cutoffDate;
  }, [cutoffDate]);

  // Load all hosts for the simulation switcher unconditionally
  const loadSimulationHosts = async () => {
    const { data } = await supabase
      .from('hsk_hosts')
      .select('id, host_id, full_name, role, system_role, allowed_modules, jetty_allocation, status')
      .neq('status', 'Resigned')
      .order('full_name');
    if (data && data.length > 0) {
      setSimulationHosts(data);
    }
  };

  useEffect(() => { 
      fetchDashboardData(); 
      loadSimulationHosts();
      const reqChannel = supabase.channel('dashboard_reqs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, () => { fetchDashboardData(false); }).subscribe();
      const orderChannel = supabase.channel('dashboard_orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_procurement_orders' }, () => { fetchDashboardData(false); }).subscribe();
      
      return () => { supabase.removeChannel(reqChannel); supabase.removeChannel(orderChannel); };
  }, []);

  useEffect(() => {
      if (!isLoading) {
          const fetchRPC = async () => {
              const { data } = await supabase.rpc('get_all_attendance_stats', { p_target_date: cutoffDate });
              if (data) setRpcStats(data);
          };
          fetchRPC();
      }
  }, [cutoffDate, isLoading]);

  useEffect(() => {
      let interval: NodeJS.Timeout;
      const updateTimer = () => {
          if (activeService?.start_time) {
              const start = new Date(activeService.start_time).getTime();
              if (!isNaN(start)) {
                  setCleaningElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
              }
          }
      };

      if (activeService) {
          updateTimer();
          interval = setInterval(updateTimer, 1000);
      } else {
          setCleaningElapsedSeconds(0);
      }
      return () => clearInterval(interval);
  }, [activeService]);

  const formatTimer = (totalSeconds: number) => {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
      const s = (totalSeconds % 60).toString().padStart(2, '0');
      if (h > 0) return `${h}:${m}:${s}`;
      return `${m}:${s}`;
  };

  const handleHostClick = async (itemData: any) => {
      setSelectedTeamHost(itemData);
      setSelectedTeamHostAtt([]);
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

  const handleSimulateHost = (host: any) => {
    // ⚡ If not already simulating, back up the current true Super Admin session
    const existingRaw = localStorage.getItem('hk_pulse_session');
    let adminOrigin = currentUser?.impersonating_from;

    if (existingRaw && !adminOrigin) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (!parsed.impersonating_from) {
          localStorage.setItem('hk_pulse_true_admin_backup', existingRaw);
          adminOrigin = {
            id: parsed.id,
            host_id: parsed.host_id,
            full_name: parsed.full_name,
            system_role: 'admin'
          };
        }
      } catch (e) {}
    }

    const simulated = {
      id: host.id,
      host_id: host.host_id,
      full_name: host.full_name,
      role: host.role,
      system_role: host.system_role || 'staff',
      is_super_admin: false,
      allowed_modules: host.allowed_modules || ['allocation', 'tasks'],
      jetty_allocation: host.jetty_allocation,
      impersonating_from: adminOrigin || {
        id: currentUser?.id,
        full_name: currentUser?.full_name,
        system_role: 'admin'
      }
    };
    localStorage.setItem('hk_pulse_session', JSON.stringify(simulated));
    window.location.reload();
  };

  const handleExitSimulation = () => {
    if (!currentUser?.impersonating_from) return;
    const restored = {
      id: currentUser.impersonating_from.id,
      full_name: currentUser.impersonating_from.full_name,
      system_role: 'admin',
      is_super_admin: true,
      allowed_modules: ['all']
    };
    localStorage.setItem('hk_pulse_session', JSON.stringify(restored));
    window.location.reload();
  };

  const fetchDashboardData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    const todayStr = getDhakaDateStr(); 
    const currentCutoff = cutoffDateRef.current;

    fetchROEvents().then(setRoEvents);
    const [constRes, configRes, hostsListRes] = await Promise.all([
        supabase.from('hsk_constants').select('*'),
        supabase.from('hsk_constants').select('label').eq('type', 'team_viewer_config').maybeSingle(),
        supabase.from('hsk_hosts').select('id, host_id, full_name, role, system_role, allowed_modules, jetty_allocation, status').neq('status', 'Resigned').order('full_name')
    ]);

    if (hostsListRes.data) {
        setAllHosts(hostsListRes.data);
        setSimulationHosts(hostsListRes.data);
    }

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
            config = { hostDepartments: parsed.hostDepartments || {}, supervisorAccess: sAccess, nicknames: parsed.nicknames || {}, excludeAttendance: parsed.excludeAttendance || {}, profileTypes: parsed.profileTypes || {} };
        } catch (e) {}
    }
    setTeamConfig(config);

    const sessionData = localStorage.getItem('hk_pulse_session');
    let adminFlag = false;
    let superFlag = false;
    let loggedHostId = '';

    if (sessionData) {
        const parsed = JSON.parse(sessionData);
        const isCurrentlySimulating = !!parsed.impersonating_from;
        adminFlag = !isCurrentlySimulating && (parsed.system_role === 'admin' || parsed.is_super_admin === true || localStorage.getItem('hk_pulse_admin_auth') === 'true');
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
        
        const { data: hostData } = await supabase.from('hsk_hosts').select('*').eq('host_id', loggedHostId).maybeSingle();
        if (hostData) {
            setCurrentUser({ ...hostData, ...parsed });
            const localNick = localStorage.getItem(`nickname_${hostData.host_id}`);
            setDisplayName(config.nicknames[hostData.host_id] || localNick || '');
        } else {
            setCurrentUser(parsed);
        }
        
        if (superFlag) {
            const [hostsRes, rpcRes, futureRes, anniRes] = await Promise.all([
                supabase.from('hsk_hosts').select('*').neq('status', 'Resigned').order('full_name'), 
                supabase.rpc('get_all_attendance_stats', { p_target_date: currentCutoff }), 
                supabase.from('hsk_attendance').select('host_id, date, status_code, shift_note').gte('date', todayStr).in('status_code', LEAVE_CODES),
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
            setFutureLeaves((futureRes.data || []).filter((r: any) => !isWorkedLeave(r)));
            setAnniversaryLeaves(anniRes.data || []);
        } else {
            const [rpcRes, futureRes, anniRes] = await Promise.all([
                supabase.rpc('get_all_attendance_stats', { p_target_date: currentCutoff }), 
                supabase.from('hsk_attendance').select('host_id, date, status_code, shift_note').eq('host_id', loggedHostId).gte('date', todayStr).in('status_code', LEAVE_CODES),
                supabase.from('hsk_attendance').select('host_id, date, status_code').eq('host_id', loggedHostId).in('status_code', ['SL', 'EL', 'RR']).gte('date', '2025-01-01')
            ]);
            setRpcStats(rpcRes.data || []);
            setFutureLeaves((futureRes.data || []).filter((r: any) => !isWorkedLeave(r)));
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
                supabase.from('hsk_attendance').select('host_id, date, status_code, shift_note').gte('date', todayStr).in('status_code', LEAVE_CODES),
                supabase.from('hsk_attendance').select('host_id, date, status_code').in('status_code', ['SL', 'EL', 'RR']).gte('date', '2025-01-01')
            ]);
            if (hostsRes.data) {
                setAllHosts(hostsRes.data);
                setSimulationHosts(hostsRes.data);
            }
            setRpcStats(rpcRes.data || []);
            setFutureLeaves((futureRes.data || []).filter((r: any) => !isWorkedLeave(r)));
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

        const { data: activeLog } = await supabase.from('hsk_cleaning_logs')
            .select('villa_number, start_time')
            .eq('report_date', todayStr)
            .eq('host_id', loggedHostId)
            .eq('status', 'In Progress')
            .maybeSingle();
            
        if (activeLog) {
            setActiveService({ villa: activeLog.villa_number, start_time: activeLog.start_time });
        } else {
            setActiveService(null);
        }
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

      // Leave balances only apply to permanent hosts (not temporary staff or shared logins).
      const computed = allHosts.filter((h: any) => getProfileType(teamConfig, h.host_id) === 'PERMANENT').map((h: any) => {
          const bal = computeLeaveBalancesRPC(h, [], rpcStats, cutoffDate, publicHolidays, anniversaryLeaves, roEvents);
          const myFutureLeaves = futureLeaves.filter(l => String(l.host_id).trim() === String(h.host_id).trim());
          const upcoming = getUpcomingLeave(myFutureLeaves, getDhakaDateStr());
          const dept = teamConfig.hostDepartments?.[h.host_id] || 'Unassigned';
          
          return { host: h, department: dept, balances: bal, upcoming };
      }).filter((c: any) => c.balances !== null);

      computed.sort((a: any, b: any) => parseFloat(b.balances.balTotal) - parseFloat(a.balances.balTotal));
      setTeamBalances(computed);
      
      setIsLoadingTeam(false);
  }, [allHosts, rpcStats, futureLeaves, anniversaryLeaves, cutoffDate, publicHolidays, teamConfig, roEvents]);

  useEffect(() => {
      if (isTeamModalOpen) loadTeamLeaves();
  }, [rpcStats, cutoffDate, isTeamModalOpen, loadTeamLeaves]);

  const upcomingLeaveInfo = useMemo(() => {
      if (!currentUser) return null;
      const myFuture = futureLeaves.filter(l => String(l.host_id).trim() === String(currentUser.host_id).trim());
      return getUpcomingLeave(myFuture, getDhakaDateStr());
  }, [currentUser, futureLeaves]);

  const userBalances = useMemo(() => {
      return computeLeaveBalancesRPC(currentUser, [], rpcStats, cutoffDate, publicHolidays, anniversaryLeaves, roEvents);
  }, [currentUser, rpcStats, cutoffDate, publicHolidays, anniversaryLeaves, roEvents]);

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
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const isSuperAdminUser = currentUser?.is_super_admin || !!currentUser?.impersonating_from;
  const firstName = (currentUser?.full_name || 'Host').split(' ')[0];
  const todayStr = getDhakaDateStr();

  if (isLoading) {
      return (
          <div className="flex-1 flex items-center justify-center text-[#6D2158] min-h-[70dvh]">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-[#6D2158]/20 border-t-[#6D2158] rounded-full animate-spin"></div>
                  <p className="font-bold uppercase tracking-widest text-xs animate-pulse">Syncing Pulse…</p>
              </div>
          </div>
      );
  }

  const QUICK_LINKS = isAdmin ? [
      { label: 'Guest List', href: '/guests', icon: Users, tone: 'bg-violet-50 text-violet-700' },
      { label: 'Allocation', href: '/allocation', icon: ListChecks, tone: 'bg-[#6D2158]/10 text-[#6D2158]' },
      { label: 'Live Board', href: '/allocation/board', icon: LayoutGrid, tone: 'bg-sky-50 text-sky-700' },
      { label: 'Special Villas', href: '/allocation/special', icon: KeyRound, tone: 'bg-amber-50 text-amber-700' },
      { label: 'Attendance', href: '/attendance', icon: UserCheck, tone: 'bg-emerald-50 text-emerald-700' },
      { label: 'Hosts', href: '/hosts', icon: Contact, tone: 'bg-rose-50 text-rose-700' },
  ] : [
      { label: 'My Tasks', href: '/my-tasks', icon: ClipboardList, tone: 'bg-[#6D2158]/10 text-[#6D2158]' },
      { label: 'Schedule', href: '/schedule', icon: Calendar, tone: 'bg-sky-50 text-sky-700' },
      { label: 'Guest List', href: '/guests', icon: Users, tone: 'bg-violet-50 text-violet-700' },
      { label: 'Org Chart', href: '/org-chart', icon: Briefcase, tone: 'bg-emerald-50 text-emerald-700' },
      { label: 'Directory', href: '/team/contacts', icon: Contact, tone: 'bg-amber-50 text-amber-700' },
      { label: 'Profile', href: '/profile', icon: User, tone: 'bg-rose-50 text-rose-700' },
  ];

  const KPIS = [
      { label: 'Pending requests', value: stats.pendingReqs, href: '/requests', icon: ClipboardList, alert: stats.pendingReqs > 0, tone: 'text-amber-600 bg-amber-50' },
      { label: 'Open orders', value: stats.pendingOrders, href: '/orders', icon: ShoppingCart, alert: false, tone: 'text-blue-600 bg-blue-50' },
      { label: 'Expiry alerts', value: stats.expiringBatches, href: '/minibar/expiry', icon: AlertTriangle, alert: stats.expiringBatches > 0, tone: stats.expiringBatches > 0 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50' },
      { label: 'Active hosts', value: stats.totalHosts, href: '/hosts', icon: Users, alert: false, tone: 'text-[#6D2158] bg-[#6D2158]/10' },
  ];

  const BAL_ITEMS = userBalances ? [
      { label: 'Off days', value: userBalances.balOff, dot: 'bg-emerald-500' },
      { label: 'Annual', value: userBalances.balAL, dot: 'bg-cyan-500' },
      { label: 'Public hol.', value: userBalances.balPH, dot: 'bg-blue-500' },
      ...(userBalances.balRR !== '-' ? [{ label: 'R & R', value: userBalances.balRR, dot: 'bg-fuchsia-500' }] : []),
      { label: 'RO', value: userBalances.balRO, dot: 'bg-yellow-500' },
      { label: 'Sick', value: userBalances.balSL, dot: 'bg-rose-500' },
      { label: 'Emergency', value: userBalances.balEL, dot: 'bg-orange-500' },
  ] : [];

  const card = 'bg-white rounded-3xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
  const cardHead = 'flex items-center justify-between gap-3 px-5 pt-5 pb-3';
  const cardTitle = 'text-sm font-black text-slate-800 flex items-center gap-2';
  const pillLink = 'text-[11px] font-bold text-[#6D2158] bg-[#6D2158]/5 hover:bg-[#6D2158]/10 px-3 py-1.5 rounded-full transition-colors';

  const upcomingHolidays = publicHolidays.filter(h => h.date >= todayStr);
  const nextHoliday = upcomingHolidays[0];

  return (
    <div className="min-h-full bg-[#F7F5F8] font-sans text-slate-800">

      {currentUser?.impersonating_from && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 flex items-center justify-between gap-3 text-xs font-bold sticky top-0 z-40">
          <span className="flex items-center gap-2 min-w-0"><Eye size={15} className="shrink-0" /><span className="truncate">Viewing as <strong>{currentUser.full_name}</strong> · {currentUser.role}</span></span>
          <button onClick={handleExitSimulation} className="bg-black text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 shrink-0"><ArrowLeft size={12} /> Exit</button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 pt-3 md:pt-8 pb-10 space-y-4 md:space-y-6">

        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#6D2158] via-[#7a2763] to-[#9b3a7f] text-white p-5 md:p-7 shadow-lg shadow-[#6D2158]/20">
          <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-20 left-1/3 w-64 h-64 rounded-full bg-fuchsia-300/10 blur-3xl pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <button onClick={() => { setTempName(displayName); setIsEditingName(true); }} title="Set your nickname"
              className="relative w-14 h-14 md:w-[72px] md:h-[72px] rounded-2xl overflow-hidden bg-white/15 ring-2 ring-white/30 shrink-0 flex items-center justify-center group">
              {currentUser?.image_url
                ? <img src={currentUser.image_url} className="w-full h-full object-cover" alt="" />
                : <span className="text-2xl font-black">{firstName.charAt(0)}</span>}
              <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Edit3 size={18} /></span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs md:text-sm font-semibold text-white/70">{greeting},</p>
              {isEditingName ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <input autoFocus value={tempName} onChange={e => setTempName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNickname()} placeholder="Nickname"
                    className="w-40 md:w-56 bg-white/15 border border-white/30 rounded-xl px-3 py-1.5 text-lg font-black text-white placeholder-white/50 outline-none focus:bg-white/20" />
                  <button onClick={saveNickname} className="p-2 rounded-xl bg-white text-[#6D2158]"><CheckCircle2 size={18} /></button>
                  <button onClick={() => setIsEditingName(false)} className="p-2 rounded-xl bg-white/10"><X size={18} /></button>
                </div>
              ) : (
                <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight truncate">{displayName || firstName}</h1>
              )}
              <p className="text-[11px] md:text-xs font-semibold text-white/70 mt-0.5 truncate">{currentUser?.role || 'Staff'}{currentUser?.host_id ? ` · ${currentUser.host_id}` : ''}</p>
            </div>
            <div className="hidden sm:flex flex-col items-end shrink-0">
              <div className="text-2xl md:text-3xl font-black tabular-nums"><LiveClock /></div>
              <div className="text-[11px] font-semibold text-white/70">{format(getDhakaTime(), 'EEEE, d MMMM')}</div>
            </div>
          </div>

          <div className="relative flex items-center gap-2 mt-5 overflow-x-auto no-scrollbar -mx-1 px-1">
            <div className="sm:hidden flex items-center gap-1.5 bg-white/10 border border-white/15 px-3 py-2 rounded-xl text-xs font-bold shrink-0">
              <Clock size={13} /> <LiveClock />
            </div>
            {isSuperAdminUser && (currentUser?.impersonating_from ? (
              <button onClick={handleExitSimulation} className="flex items-center gap-1.5 bg-amber-400 text-amber-950 px-3 py-2 rounded-xl text-xs font-bold shrink-0"><ArrowLeft size={14} /> Exit view</button>
            ) : (
              <button onClick={() => { setSimulateSearchTerm(''); loadSimulationHosts(); setIsSimulateModalOpen(true); }} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-colors"><UserCog size={14} /> View as staff</button>
            ))}
            {isSupervisor && (
              <button onClick={loadTeamLeaves} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-colors"><BarChart2 size={14} /> Team leaves</button>
            )}
            <button onClick={() => setIsHolidayModalOpen(true)} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-colors">
              <Plane size={14} /> Holidays{nextHoliday ? <span className="font-semibold text-white/70">· next {format(parseISO(nextHoliday.date), 'd MMM')}</span> : null}
            </button>
          </div>
        </section>

        {/* LEAVE BALANCE — first thing under the profile */}
        {userBalances && (
          <section className={`${card} p-4 md:p-5`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className={cardTitle}><Briefcase size={16} className="text-[#6D2158]" /> Leave balance</h3>
              <label className="relative flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-full cursor-pointer">
                <Calendar size={12} /> as of {format(parseISO(cutoffDate), 'd MMM yyyy')}
                <input type="date" value={cutoffDate} onChange={e => e.target.value && setCutoffDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
            </div>
            <div className="flex flex-col md:flex-row md:items-stretch gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-[#6D2158] to-[#8E2C72] text-white px-4 py-3 md:px-6 md:py-4 flex md:flex-col items-center md:items-start justify-between md:justify-center gap-2 md:min-w-[170px] shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/75">Total owed</span>
                <span className="text-3xl md:text-4xl font-black tabular-nums leading-none">{userBalances.balTotal}<span className="text-sm font-bold text-white/70 ml-1">days</span></span>
              </div>
              <div className={`grid grid-cols-3 gap-2 flex-1 ${BAL_ITEMS.length > 6 ? 'md:grid-cols-7' : 'md:grid-cols-6'}`}>
                {BAL_ITEMS.map(b => (
                  <div key={b.label} className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-2.5 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.dot}`} /> {b.label}</div>
                    <div className={`text-lg md:text-xl font-black tabular-nums mt-0.5 ${String(b.value).startsWith('-') ? 'text-rose-600' : 'text-slate-800'}`} title={b.label === 'RO' && String(b.value).startsWith('-') ? 'RO taken without a "working day" comment on the day worked' : undefined}>{b.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <OccasionBanner />

        {/* UPCOMING / CURRENT LEAVE */}
        {upcomingLeaveInfo && (
          <section className={`${card} p-4 md:p-5 flex items-center gap-4 ${upcomingLeaveInfo.isOnLeaveNow ? '!bg-cyan-50 !border-cyan-200' : ''}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${upcomingLeaveInfo.isOnLeaveNow ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {upcomingLeaveInfo.isOnLeaveNow ? <Plane size={22} /> : <Timer size={22} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-800">{upcomingLeaveInfo.isOnLeaveNow ? 'You are on leave' : upcomingLeaveInfo.daysUntilLeave === 1 ? 'Leave starts tomorrow' : `Leave starts in ${upcomingLeaveInfo.daysUntilLeave} days`}</p>
              <p className="text-xs text-slate-500 mt-0.5">{format(upcomingLeaveInfo.startDate, 'd MMM')} – {format(upcomingLeaveInfo.endDate, 'd MMM yyyy')} · {upcomingLeaveInfo.totalLeaveDays} {upcomingLeaveInfo.totalLeaveDays === 1 ? 'day' : 'days'}</p>
            </div>
            {upcomingLeaveInfo.isOnLeaveNow && (
              <div className="text-right shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Back on</p>
                <p className="text-sm font-black text-cyan-900">{format(upcomingLeaveInfo.returnDate, 'EEE d MMM')}</p>
              </div>
            )}
          </section>
        )}

        {/* ADMIN KPIs */}
        {isAdmin && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {KPIS.map(k => (
              <Link key={k.label} href={k.href} className={`${card} p-4 md:p-5 flex items-center gap-3 md:gap-4 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all`}>
                <div className={`w-11 h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shrink-0 ${k.tone}`}><k.icon size={20} /></div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xl md:text-3xl font-black tracking-tight tabular-nums">{k.value}</span>
                    {k.alert && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
                  </div>
                  <p className="text-[11px] md:text-xs font-semibold text-slate-500 leading-tight">{k.label}</p>
                </div>
              </Link>
            ))}
          </section>
        )}

        {/* QUICK LINKS */}
        <section className="grid grid-cols-3 sm:grid-cols-6 gap-2 md:gap-3">
          {QUICK_LINKS.map(l => (
            <Link key={l.href} href={l.href} className={`${card} !rounded-2xl p-3 flex flex-col items-center justify-center gap-2 text-center hover:shadow-md active:scale-95 transition-all`}>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${l.tone}`}><l.icon size={19} /></span>
              <span className="text-[11px] md:text-xs font-bold text-slate-700 leading-tight">{l.label}</span>
            </Link>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 items-start">

          {/* SIDE COLUMN (first on phones for staff so balances are near the top) */}
          <div className={`space-y-4 md:space-y-6 lg:order-2 ${isAdmin ? 'order-2' : 'order-1'}`}>
            {isAdmin && (
              <section className={card}>
                <div className={cardHead}>
                  <h3 className={cardTitle}><CheckSquare size={16} className="text-[#6D2158]" /> Reminders {adminTasks.length > 0 && <span className="text-[10px] font-black bg-[#6D2158] text-white rounded-full px-2 py-0.5">{adminTasks.length}</span>}</h3>
                  <Link href="/tasks" className={pillLink}>Task Hub</Link>
                </div>
                <div className="px-3 pb-3">
                  {adminTasks.length === 0 ? (
                    <p className="text-center text-xs font-semibold text-slate-400 py-6">All caught up.</p>
                  ) : adminTasks.slice(0, 5).map(task => {
                    const isOverdue = task.due_date ? parseISO(task.due_date) < new Date(getDhakaTime().setHours(0, 0, 0, 0)) : false;
                    return (
                      <div key={task.id} className="flex items-center gap-3 px-2 py-2.5 rounded-2xl hover:bg-slate-50">
                        <button onClick={() => handleCompleteTask(task.id)} title="Mark done" className="w-6 h-6 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 flex items-center justify-center shrink-0 group">
                          <CheckCircle2 size={14} className="text-emerald-500 opacity-0 group-hover:opacity-100" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">{task.title}</p>
                          <p className={`text-[11px] font-semibold flex items-center gap-1 ${isOverdue ? 'text-rose-600' : 'text-slate-400'}`}>
                            {task.frequency !== 'One-Off' && <RefreshCw size={10} />}
                            {task.due_date ? `${isOverdue ? 'Overdue · ' : 'Due '}${format(parseISO(task.due_date), 'd MMM')}` : 'No due date'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {isAdmin && (
              <section className={`${card} overflow-hidden`}>
                <div className={`${cardHead} ${criticalItems.length ? 'bg-rose-50/60' : 'bg-emerald-50/60'} !pb-4`}>
                  <h3 className={cardTitle}>
                    {criticalItems.length ? <AlertTriangle size={16} className="text-rose-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
                    {criticalItems.length ? 'Expiring within 60 days' : 'No stock expiring soon'}
                  </h3>
                  <Link href="/minibar/expiry" className={pillLink}>Expiry</Link>
                </div>
                {criticalItems.length > 0 && (
                  <div className="px-3 py-2">
                    {criticalItems.slice(0, 5).map((item: any) => (
                      <div key={item.id} className="flex items-center gap-3 px-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">{item.item_name}</p>
                          <p className="text-[11px] text-slate-400">Batch {new Date(item.expiry_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</p>
                        </div>
                        <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg shrink-0 ${item.days <= 0 ? 'bg-rose-600 text-white' : item.days <= 14 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                          {item.days < 0 ? 'Expired' : item.days === 0 ? 'Today' : `${item.days}d`}
                        </span>
                      </div>
                    ))}
                    {criticalItems.length > 5 && <Link href="/minibar/expiry" className="block text-center text-[11px] font-bold text-slate-500 py-2 hover:text-[#6D2158]">+ {criticalItems.length - 5} more</Link>}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* MAIN COLUMN */}
          <div className={`lg:col-span-2 space-y-4 md:space-y-6 lg:order-1 ${isAdmin ? 'order-1' : 'order-2'}`}>
            {isAdmin ? (
              <section className={card}>
                <div className={cardHead}>
                  <h3 className={cardTitle}><Bell size={16} className="text-[#6D2158]" /> Today&apos;s requests</h3>
                  <Link href="/requests" className={pillLink}>View all</Link>
                </div>
                <div className="px-3 pb-3">
                  {recentActivity.length === 0 ? (
                    <div className="text-center text-slate-400 py-12">
                      <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-semibold">No requests logged today.</p>
                    </div>
                  ) : recentActivity.map((log: any) => {
                    const done = log.request_type === 'Minibar' ? log.is_posted : log.is_done;
                    return (
                      <div key={log.id} className="flex items-center gap-3 px-2 py-2.5 rounded-2xl hover:bg-slate-50">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${log.request_type === 'Minibar' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                          {log.villa_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">{String(log.item_details || '').replace(/\n/g, ', ')}</p>
                          <p className="text-[11px] text-slate-400 truncate">{log.request_type} · {log.attendant_name} · {formatDisplayTime(log.request_time)}</p>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg shrink-0 ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{done ? 'Done' : 'Pending'}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className={card}>
                <div className={cardHead}>
                  <h3 className={cardTitle}><Calendar size={16} className="text-[#6D2158]" /> My attendance <span className="text-[11px] font-semibold text-slate-400">{format(payrollStart, 'd MMM')} – {format(payrollEnd, 'd MMM')}</span></h3>
                  <Link href="/schedule" className={pillLink}>History</Link>
                </div>
                <div className="px-2.5 md:px-5 pb-3">
                  <div className="grid grid-cols-7 gap-1 md:gap-3 mb-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                      <div key={d} className="text-center text-[10px] md:text-xs font-black uppercase text-slate-400"><span className="md:hidden">{d[0]}</span><span className="hidden md:inline">{d}</span></div>
                    ))}
                  </div>
                  {renderPayrollGrid(myAttendance, payrollStart, payrollEnd)}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* --- HOLIDAYS --- */}
      {isHolidayModalOpen && (
        <div className="fixed inset-0 z-[1001] bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in" onClick={() => setIsHolidayModalOpen(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div><h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Plane size={18} className="text-[#6D2158]" /> Public holidays</h3><p className="text-[11px] text-slate-400">Islamic holiday dates depend on moon sighting.</p></div>
              <button onClick={() => setIsHolidayModalOpen(false)} className="p-2 rounded-full bg-slate-100 text-slate-500"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
              {publicHolidays.length === 0 && <p className="text-center text-sm text-slate-400 py-10">No public holidays set up yet.</p>}
              {[['Upcoming', upcomingHolidays], ['Earlier', publicHolidays.filter(h => h.date < todayStr).reverse()]].map(([title, list]) => (list as typeof publicHolidays).length > 0 && (
                <div key={title as string} className="mb-2">
                  <p className="px-2 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{title as string}</p>
                  {(list as typeof publicHolidays).map(h => {
                    const d = parseISO(h.date);
                    const days = differenceInDays(d, parseISO(todayStr));
                    return (
                      <div key={h.id} className={`flex items-center gap-3 px-2 py-2.5 rounded-2xl ${title === 'Earlier' ? 'opacity-50' : ''}`}>
                        <div className="w-12 h-12 rounded-2xl bg-[#6D2158]/5 text-[#6D2158] flex flex-col items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold uppercase leading-none">{format(d, 'MMM')}</span>
                          <span className="text-lg font-black leading-none mt-0.5">{format(d, 'd')}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-800 truncate">{h.name}</p>
                          <p className="text-[11px] text-slate-400">{format(d, 'EEEE, yyyy')}</p>
                        </div>
                        {title === 'Upcoming' && <span className="text-[11px] font-bold text-slate-500 shrink-0">{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`}</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- TEAM LEAVES --- */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-[1001] bg-black/50 backdrop-blur-[2px] flex items-end md:items-center justify-center md:p-4 animate-in fade-in">
          <div className="bg-[#F7F5F8] w-full md:max-w-5xl h-[100dvh] md:h-[90vh] md:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-4 md:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-3 shrink-0">
              <div className="flex items-center gap-3">
                {selectedTeamHost ? (
                  <button onClick={() => setSelectedTeamHost(null)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-500"><ChevronLeft size={20} /></button>
                ) : <div className="w-10 h-10 rounded-2xl bg-[#6D2158]/10 text-[#6D2158] flex items-center justify-center shrink-0"><BarChart2 size={18} /></div>}
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg md:text-xl font-black text-slate-800 truncate">{selectedTeamHost ? selectedTeamHost.host.full_name : 'Team leaves'}</h3>
                  <p className="text-[11px] text-slate-400 truncate">{selectedTeamHost ? `${selectedTeamHost.host.role} · ${selectedTeamHost.department}` : 'Days owed per host'}</p>
                </div>
                <label className="relative flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-full cursor-pointer shrink-0">
                  <Calendar size={13} /> {format(parseISO(cutoffDate), 'd MMM yyyy')}
                  <input type="date" value={cutoffDate} onChange={e => e.target.value && setCutoffDate(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                </label>
                <button onClick={() => { setIsTeamModalOpen(false); setSelectedTeamHost(null); }} className="p-2 rounded-full bg-slate-100 text-slate-500 shrink-0"><X size={18} /></button>
              </div>
              {!selectedTeamHost && (
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder="Search host" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 border border-transparent focus:border-[#6D2158] focus:bg-white outline-none text-sm font-semibold" />
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                    {([['balTotal', 'Total'], ['balOff', 'Off'], ['balAL', 'Annual']] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setTeamSortBy(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${teamSortBy === k ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500'}`}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {!selectedTeamHost && (
                <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar -mx-1 px-1">
                  {['All', ...Array.from(new Set(teamBalances.map((c: any) => c.department))).sort()].map((dept: any) => (
                    <button key={dept} onClick={() => setActiveDeptTab(dept)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border ${activeDeptTab === dept ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-500 border-slate-200'}`}>{dept}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-6" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
              {isLoadingTeam ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" /></div>
              ) : selectedTeamHost ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[['Total', selectedTeamHost.balances.balTotal, 'bg-[#6D2158] text-white'], ['Off', selectedTeamHost.balances.balOff, ''], ['Annual', selectedTeamHost.balances.balAL, ''], ['Public hol.', selectedTeamHost.balances.balPH, ''], ['RO', selectedTeamHost.balances.balRO, ''], ['Sick', selectedTeamHost.balances.balSL, '']].map(([l, v, c]) => (
                      <div key={l} className={`rounded-2xl px-3 py-2.5 border ${c || 'bg-white border-slate-200 text-slate-800'}`}>
                        <div className={`text-[10px] font-bold uppercase ${c ? 'text-white/70' : 'text-slate-400'}`}>{l}</div>
                        <div className="text-xl font-black tabular-nums">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className={`${card} p-3 md:p-5`}>
                    <p className="text-xs font-bold text-slate-500 mb-2">Attendance this payroll period</p>
                    <div className="grid grid-cols-7 gap-1 md:gap-3 mb-1">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="text-center text-[10px] font-black uppercase text-slate-400">{d.slice(0, 3)}</div>)}
                    </div>
                    {(() => { const pp = getPayrollPeriod(parseISO(cutoffDate)); return renderPayrollGrid(selectedTeamHostAtt, pp.start, pp.end); })()}
                  </div>
                </div>
              ) : (() => {
                let rows = [...teamBalances];
                if (activeDeptTab !== 'All') rows = rows.filter((c: any) => c.department === activeDeptTab);
                if (teamSearch) rows = rows.filter((c: any) => c.host.full_name.toLowerCase().includes(teamSearch.toLowerCase()) || String(c.host.host_id).toLowerCase().includes(teamSearch.toLowerCase()));
                rows.sort((a: any, b: any) => parseFloat(b.balances[teamSortBy]) - parseFloat(a.balances[teamSortBy]));
                const sum = (k: string) => rows.reduce((acc: number, r: any) => acc + (parseFloat(r.balances[k]) || 0), 0);
                const max = Math.max(1, ...rows.map((r: any) => parseFloat(r.balances.balTotal) || 0));
                if (rows.length === 0) return <p className="text-center text-sm text-slate-400 py-16">No hosts match.</p>;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[['Hosts', rows.length], ['Total owed', sum('balTotal').toFixed(1)], ['Off days', sum('balOff').toFixed(1)], ['Annual', sum('balAL').toFixed(1)]].map(([l, v]) => (
                        <div key={l} className="bg-white rounded-2xl border border-slate-200 px-3 py-2.5">
                          <div className="text-[10px] font-bold uppercase text-slate-400">{l}</div>
                          <div className="text-xl font-black text-slate-800 tabular-nums">{v}</div>
                        </div>
                      ))}
                    </div>
                    <div className={`${card} divide-y divide-slate-100 overflow-hidden`}>
                      {rows.map((r: any) => {
                        const b = r.balances;
                        const total = parseFloat(b.balTotal) || 0;
                        const seg = (v: string) => `${total > 0 ? Math.max(0, (parseFloat(v) || 0) / total) * 100 : 0}%`;
                        return (
                          <button key={r.host.host_id} onClick={() => handleHostClick(r)} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-slate-800 truncate">{r.host.full_name}</span>
                                <span className="text-sm font-black text-[#6D2158] tabular-nums shrink-0">{b.balTotal}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-slate-400 truncate">{r.department}</span>
                                {r.upcoming && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${r.upcoming.isOnLeaveNow ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'}`}>{r.upcoming.isOnLeaveNow ? 'On leave' : `Leave ${format(r.upcoming.startDate, 'd MMM')}`}</span>}
                              </div>
                              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden" style={{ width: `${Math.max(8, (total / max) * 100)}%` }}>
                                <div className="flex h-full">
                                  <span className="bg-emerald-500" style={{ width: seg(b.balOff) }} />
                                  <span className="bg-cyan-500" style={{ width: seg(b.balAL) }} />
                                  <span className="bg-blue-500" style={{ width: seg(b.balPH) }} />
                                </div>
                              </div>
                            </div>
                            <ChevronRight size={16} className="text-slate-300 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-center gap-4 text-[11px] font-semibold text-slate-500">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Off</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500" /> Annual</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Public hol.</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* --- SEARCHABLE HOST SIMULATION MODAL --- */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-700 to-emerald-800 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  <UserCog size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-black text-lg tracking-tight">Simulate Host View</h3>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-200">
                    Test Permissions & Experience
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsSimulateModalOpen(false)} 
                className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Live Search Input */}
            <div className="p-4 bg-slate-50 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Type name, role, or ID (e.g. 101, Laundry)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs sm:text-sm text-slate-800 outline-none focus:border-emerald-600 shadow-2xs placeholder:text-slate-400"
                  value={simulateSearchTerm}
                  onChange={(e) => setSimulateSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Filtered Host Results List */}
            <div className="p-3 max-h-72 overflow-y-auto space-y-1.5 custom-scrollbar bg-slate-50/50">
              {(() => {
                const term = simulateSearchTerm.toLowerCase().trim();
                const filtered = simulationHosts.filter((h: any) => 
                  !term || 
                  h.full_name?.toLowerCase().includes(term) ||
                  h.role?.toLowerCase().includes(term) ||
                  String(h.host_id || '').includes(term) ||
                  h.jetty_allocation?.toLowerCase().includes(term)
                );

                if (filtered.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 italic font-bold text-xs">
                      No host found matching &ldquo;{simulateSearchTerm}&rdquo;
                    </div>
                  );
                }

                return filtered.map((host: any) => (
                  <button
                    key={host.id}
                    onClick={() => {
                      setIsSimulateModalOpen(false);
                      handleSimulateHost(host);
                    }}
                    className="w-full text-left p-3 rounded-2xl bg-white hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 transition-all flex items-center justify-between group shadow-2xs cursor-pointer active:scale-98"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="font-black text-xs sm:text-sm text-slate-800 group-hover:text-emerald-800 truncate">
                        {host.full_name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        {host.role || 'Staff'} {host.host_id ? `• ID: ${host.host_id}` : ''}
                      </div>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700 shrink-0">
                      Switch →
                    </span>
                  </button>
                ));
              })()}
            </div>

            {/* Footer */}
            <div className="p-3 bg-white border-t border-slate-100 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {simulationHosts.length} Active Hosts Available
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ⚡ ACTIVE SERVICE FLOATING BANNER */}
      {activeService && (
          <Link href="/my-tasks" className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-8 left-1/2 w-[calc(100%-1.5rem)] max-w-md justify-between -translate-x-1/2 z-[100] px-4 md:px-6 py-3 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.2)] flex items-center gap-3 md:gap-5 animate-in slide-in-from-bottom-10 border-2 transition-colors ${
              cleaningElapsedSeconds > 3600 ? 'bg-rose-600 border-rose-400' : 'bg-emerald-600 border-emerald-400'
          }`}>
              <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 font-black text-white text-[10px] md:text-xs tracking-widest uppercase">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cleaningElapsedSeconds > 3600 ? 'bg-white' : 'bg-emerald-200'}`}></span>
                          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cleaningElapsedSeconds > 3600 ? 'bg-white' : 'bg-emerald-100'}`}></span>
                      </span>
                      <span className="truncate">{cleaningElapsedSeconds > 3600 ? 'Timer Warning' : 'Active Room'}</span>
                  </div>
                  <div className="text-xl md:text-2xl font-mono text-white font-black tracking-widest leading-none mt-1 whitespace-nowrap">
                      V{activeService.villa} - {formatTimer(cleaningElapsedSeconds)}
                  </div>
              </div>
              <div className="w-px h-8 bg-white/30 mx-1 md:mx-2 shrink-0"></div>
              <div className="bg-white text-slate-800 px-4 py-2.5 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest shadow-sm active:scale-95 flex items-center justify-center gap-2 hover:bg-slate-50 shrink-0">
                  Go to Tasks <ChevronRight size={16} className="shrink-0"/>
              </div>
          </Link>
      )}

    </div>
  );
}
"use client";
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Users, ShoppingCart, Clock, AlertTriangle, 
  CheckCircle2, BarChart2, Edit3, Loader2, Search,
  Bell, ClipboardList, Calendar, User, Plane, X, Timer, ChevronLeft
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { differenceInDays, parseISO, isAfter, isBefore, format, isSameDay, startOfWeek, endOfWeek, addDays } from 'date-fns';

// =========================================================================
// 🧠 FAST MATH ENGINE (Built directly into the file - No imports needed!)
// =========================================================================

const LEAVE_CODES = ['O', 'OFF', 'AL', 'VAC', 'PH', 'RR'];

const getPayrollPeriod = (date = new Date()) => {
  const d = new Date(date);
  let year = d.getFullYear();
  let month = d.getMonth();
  if (d.getDate() >= 21) {
      return { start: new Date(year, month, 21), end: new Date(year, month + 1, 20) };
  } else {
      return { start: new Date(year, month - 1, 21), end: new Date(year, month, 20) };
  }
};

const getUpcomingLeave = (futureLeaves: any[]) => {
    if (!futureLeaves || futureLeaves.length === 0) return null;
    const today = new Date();
    today.setHours(0,0,0,0); 

    const sorted = [...futureLeaves].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
    if (sorted.length === 0) return null;

    let blocks = [];
    let currentBlock = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const prevDate = parseISO(currentBlock[currentBlock.length - 1].date);
        const currDate = parseISO(sorted[i].date);
        
        if (differenceInDays(currDate, prevDate) === 1) {
            currentBlock.push(sorted[i]);
        } else {
            blocks.push([...currentBlock]);
            currentBlock = [sorted[i]];
        }
    }
    blocks.push([...currentBlock]);

    const nextLeaveBlock = blocks[0];
    const startDate = parseISO(nextLeaveBlock[0].date);
    const endDate = parseISO(nextLeaveBlock[nextLeaveBlock.length - 1].date);
    const returnDate = addDays(endDate, 1);
    const daysUntilLeave = differenceInDays(startDate, today);

    return {
        startDate, endDate, returnDate, daysUntilLeave,
        totalLeaveDays: nextLeaveBlock.length,
        isOnLeaveNow: daysUntilLeave === 0 || (today >= startDate && today <= endDate)
    };
};

const computeLeaveBalancesRPC = (host: any, rpcData: any[], targetDateStr: string, publicHolidays: any[], anniversaryLeaves: any[]) => {
    if (!host || !rpcData) return null;
    const targetDate = parseISO(targetDateStr);
    const targetYear = targetDate.getFullYear();
    const SYSTEM_START_DATE = new Date(2026, 0, 1); 
    
    const baseCfOff = host.cf_off || 0;
    const baseCfAL = host.cf_al || 0;
    const baseCfPH = host.cf_ph || 0;

    const joinDate = host.joining_date ? parseISO(host.joining_date) : SYSTEM_START_DATE;
    const isExec = ['DA', 'DB'].includes(host.host_level);
    const isIntern = (host.role || '').toLowerCase().includes('intern');

    const hostStats = rpcData.filter(r => String(r.host_id).trim() === String(host.host_id).trim());

    const getStat = (year: number, codes: string[]) => {
        return hostStats.filter(r => r.att_year === year && codes.includes(r.status_code)).reduce((sum, r) => sum + Number(r.total), 0);
    };

    let cfOff = baseCfOff; let cfAL = baseCfAL; let cfPH = baseCfPH;
    
    if (targetYear > 2026) {
        const accrualStart = isAfter(joinDate, SYSTEM_START_DATE) ? joinDate : SYSTEM_START_DATE;
        const endOfPrevYear = new Date(targetYear - 1, 11, 31);
        if (isBefore(accrualStart, endOfPrevYear) || accrualStart.getTime() === endOfPrevYear.getTime()) {
            const daysBefore = differenceInDays(endOfPrevYear, accrualStart) + 1;
            const penaltyBefore = getStat(targetYear - 1, ['NP', 'A']);
            const eligibleBefore = Math.max(0, daysBefore - penaltyBefore);
            
            cfOff += (eligibleBefore / 7) - getStat(targetYear - 1, ['O', 'OFF']);
            cfAL += (eligibleBefore / 12) - getStat(targetYear - 1, ['AL', 'VAC']);
            cfPH -= getStat(targetYear - 1, ['PH']);
        }
    } else if (targetYear < 2026) {
        cfOff = 0; cfAL = 0; cfPH = 0;
    }

    const startOfTargetYear = new Date(targetYear, 0, 1);
    const trackingStartThisYear = isAfter(joinDate, startOfTargetYear) ? joinDate : startOfTargetYear;
    
    let earnedOff = 0; let earnedAL = 0; let earnedPH = 0;
    
    if (targetDate >= trackingStartThisYear) {
        const daysActive = differenceInDays(targetDate, trackingStartThisYear) + 1;
        const penaltyDays = getStat(targetYear, ['NP', 'A']);
        const eligibleDays = Math.max(0, daysActive - penaltyDays);
        
        earnedOff = eligibleDays / 7;
        earnedAL = eligibleDays / 12;
    }

    publicHolidays.forEach(ph => {
        const phDate = parseISO(ph.date);
        if (phDate >= trackingStartThisYear && phDate <= targetDate) {
            earnedPH += 1;
        }
    });

    const takenOff = getStat(targetYear, ['O', 'OFF']);
    const takenAL = getStat(targetYear, ['AL', 'VAC']);
    const takenPH = getStat(targetYear, ['PH']);

    let lastAnniversary = new Date(joinDate);
    lastAnniversary.setFullYear(targetYear);
    if (isAfter(lastAnniversary, targetDate)) {
        lastAnniversary.setFullYear(targetYear - 1);
    }
    
    const myAnniversaryLeaves = anniversaryLeaves.filter(a => String(a.host_id).trim() === String(host.host_id).trim() && parseISO(a.date) >= lastAnniversary && parseISO(a.date) <= targetDate);
    const takenSL = myAnniversaryLeaves.filter(a => String(a.status_code).toUpperCase().trim() === 'SL').length;
    const takenEL = myAnniversaryLeaves.filter(a => String(a.status_code).toUpperCase().trim() === 'EL').length;
    const takenRR = myAnniversaryLeaves.filter(a => String(a.status_code).toUpperCase().trim() === 'RR').length;

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
};


// =========================================================================
// 🖥️ MAIN DASHBOARD COMPONENT
// =========================================================================

type TeamConfig = {
    hostDepartments: Record<string, string>;
    supervisorAccess: Record<string, string[]>;
    nicknames: Record<string, string>;
};

export default function Dashboard() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [stats, setStats] = useState({ totalHosts: 0, pendingOrders: 0, pendingReqs: 0, expiringBatches: 0 });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [criticalItems, setCriticalItems] = useState<any[]>([]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Fast Fetch States
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
  const [teamDate, setTeamDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [teamSortBy, setTeamSortBy] = useState<'balTotal' | 'balOff' | 'balAL'>('balTotal');
  
  const [selectedTeamHost, setSelectedTeamHost] = useState<any | null>(null);
  const [selectedTeamHostAtt, setSelectedTeamHostAtt] = useState<any[]>([]);

  const [myAttendance, setMyAttendance] = useState<any[]>([]);
  const [payrollStart, setPayrollStart] = useState<Date>(new Date());
  const [payrollEnd, setPayrollEnd] = useState<Date>(new Date());

  const [cutoffDate, setCutoffDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState<{id: string, date: string, name: string}[]>([]);

  useEffect(() => { 
      fetchDashboardData(); 
      const reqChannel = supabase.channel('dashboard_reqs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, () => { fetchDashboardData(false); }).subscribe();
      const orderChannel = supabase.channel('dashboard_orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_procurement_orders' }, () => { fetchDashboardData(false); }).subscribe();
      return () => { supabase.removeChannel(reqChannel); supabase.removeChannel(orderChannel); };
  }, []);

  // Update RPC stats dynamically when date picker changes
  useEffect(() => {
      if (!isLoading) {
          const fetchRPC = async () => {
              const { data } = await supabase.rpc('get_yearly_attendance_stats', { p_target_date: cutoffDate });
              setRpcStats(data || []);
          };
          fetchRPC();
      }
  }, [cutoffDate]);

  // Handle Team Modal Host Click (Fetches just 1 month of attendance instantly)
  const handleHostClick = async (itemData: any) => {
      setSelectedTeamHost(itemData);
      setSelectedTeamHostAtt([]);
      const period = getPayrollPeriod(parseISO(teamDate));
      const { data } = await supabase.from('hsk_attendance')
          .select('*')
          .eq('host_id', itemData.host.host_id)
          .gte('date', format(period.start, 'yyyy-MM-dd'))
          .lte('date', format(period.end, 'yyyy-MM-dd'));
      setSelectedTeamHostAtt(data || []);
  };

  useEffect(() => {
      if (selectedTeamHost) handleHostClick(selectedTeamHost);
  }, [teamDate]);

  const fetchDashboardData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    const [constRes, configRes] = await Promise.all([
        supabase.from('hsk_constants').select('*'),
        supabase.from('hsk_constants').select('label').eq('type', 'team_viewer_config').maybeSingle()
    ]);

    if (constRes.data) {
        const parsedHolidays = constRes.data.filter((c: any) => c.type === 'public_holiday').map((c: any) => {
            const [d, n] = c.label.split('::');
            return { id: c.id, date: d, name: n };
        }).sort((a: any, b: any) => a.date.localeCompare(b.date));
        setPublicHolidays(parsedHolidays);

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
            setDisplayName(config.nicknames[hostData.host_id] || localNick || hostData.full_name.split(' ')[0]);
        }
        
        if (superFlag) {
            const [hostsRes, rpcRes, futureRes, anniRes] = await Promise.all([
                supabase.from('hsk_hosts').select('*').order('full_name'),
                supabase.rpc('get_yearly_attendance_stats', { p_target_date: cutoffDate }),
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
                supabase.rpc('get_yearly_attendance_stats', { p_target_date: cutoffDate }),
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
                supabase.from('hsk_hosts').select('*').order('full_name'),
                supabase.rpc('get_yearly_attendance_stats', { p_target_date: cutoffDate }),
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
    } 
    
    if (loggedHostId) {
        const { start, end } = getPayrollPeriod(new Date());
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
          const bal = computeLeaveBalancesRPC(h, rpcStats, cutoffDate, publicHolidays, anniversaryLeaves);
          const myFutureLeaves = futureLeaves.filter(l => String(l.host_id).trim() === String(h.host_id).trim());
          const upcoming = getUpcomingLeave(myFutureLeaves);
          const dept = teamConfig.hostDepartments?.[h.host_id] || 'Unassigned';
          
          return { host: h, department: dept, balances: bal, upcoming };
      }).filter((c: any) => c.balances !== null);

      computed.sort((a: any, b: any) => parseFloat(b.balances.balTotal) - parseFloat(a.balances.balTotal));
      setTeamBalances(computed);
      
      setIsLoadingTeam(false);
  }, [allHosts, rpcStats, futureLeaves, anniversaryLeaves, cutoffDate, publicHolidays, teamConfig]);

  useEffect(() => {
      if (isTeamModalOpen) loadTeamLeaves();
  }, [rpcStats, isTeamModalOpen, loadTeamLeaves]);

  const upcomingLeaveInfo = useMemo(() => {
      if (!currentUser) return null;
      const myFuture = futureLeaves.filter(l => String(l.host_id).trim() === String(currentUser.host_id).trim());
      return getUpcomingLeave(myFuture);
  }, [currentUser, futureLeaves]);

  const userBalances = useMemo(() => {
      return computeLeaveBalancesRPC(currentUser, rpcStats, cutoffDate, publicHolidays, anniversaryLeaves);
  }, [currentUser, rpcStats, cutoffDate, publicHolidays, anniversaryLeaves]);

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
              const isToday = isSameDay(day, new Date());

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
                  <div key={dateStr} className={`min-h-[75px] xl:min-h-[95px] p-2 flex flex-col rounded-2xl border-2 transition-all ${bgClass} ${isToday ? 'ring-2 ring-[#6D2158] ring-offset-2 shadow-md transform scale-105 z-10 bg-white' : ''}`}>
                      <span className={`text-xs xl:text-sm font-black mb-1 ${isToday ? 'text-[#6D2158]' : textClass}`}>
                          {format(day, 'd')} <span className="text-[9px] font-normal opacity-60 ml-0.5">{format(day, 'MMM')}</span>
                      </span>
                      {isCurrentPeriod && status && (
                          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest w-fit mb-1 border shadow-sm ${badgeClass}`}>
                              {status}
                          </span>
                      )}
                      {isCurrentPeriod && duty && (
                          <div className={`mt-auto flex items-center gap-1 text-[9px] font-bold uppercase ${textClass} opacity-80`}>
                              <Clock size={10} className="shrink-0"/> <span className="truncate">{duty}</span>
                          </div>
                      )}
                  </div>
              );
              day = addDays(day, 1);
          }
          rows.push(<div className="grid grid-cols-7 gap-2 xl:gap-3 mb-2 xl:mb-3 min-w-[600px]" key={day.toString()}>{days}</div>);
          days = [];
      }
      return <div className="mt-2 overflow-x-auto custom-scrollbar pb-4">{rows}</div>;
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
           <div className="w-16 h-16 md:w-20 md:h-20 rounded-[1.25rem] overflow-hidden bg-slate-100 border-2 border-slate-200 shrink-0 shadow-sm flex items-center justify-center text-[#6D2158]">
               {currentUser?.image_url ? (
                   <img src={currentUser.image_url} className="w-full h-full object-cover" alt="Profile" />
               ) : (
                   <span className="text-3xl font-black">{displayName.charAt(0) || <User/>}</span>
               )}
           </div>
           <div>
              <div className="flex items-center gap-3">
                  {isEditingName ? (
                      <div className="flex items-center gap-2">
                          <span className="text-2xl md:text-3xl font-black tracking-tight text-[#6D2158]">{greeting},</span>
                          <input 
                              type="text" 
                              autoFocus
                              className="text-2xl md:text-3xl font-black tracking-tight text-[#6D2158] bg-white border border-[#6D2158] rounded-lg px-2 outline-none w-40 shadow-sm" 
                              value={tempName} 
                              onChange={(e) => setTempName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveNickname()}
                          />
                          <button onClick={saveNickname} className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 shadow-sm"><CheckCircle2 size={16}/></button>
                      </div>
                  ) : (
                      <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setTempName(displayName); setIsEditingName(true); }}>
                          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#6D2158]">
                              {greeting}, {displayName}
                          </h1>
                          <Edit3 size={16} className="text-slate-300 group-hover:text-[#6D2158] transition-colors opacity-0 group-hover:opacity-100"/>
                      </div>
                  )}
              </div>
              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
                 {currentUser?.role || 'Staff'} • {currentUser?.host_id || 'Unknown ID'}
                 <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Active</span>
              </p>
           </div>
        </div>

        <div className="flex flex-col items-start xl:items-end gap-2">
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">My Leave Balances As Of</span>
                
                {/* NEW TEAM LEAVES BUTTON */}
                {isSupervisor && (
                    <button onClick={loadTeamLeaves} className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full hover:bg-purple-100 transition-colors uppercase tracking-wider border border-purple-200 relative z-30 flex items-center gap-1 shadow-sm">
                        <BarChart2 size={12}/> Team Leaves
                    </button>
                )}

                <button onClick={() => setIsHolidayModalOpen(true)} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors uppercase tracking-wider border border-blue-200 relative z-30">
                    View Holidays
                </button>
            </div>
            
            {/* FULLY CLICKABLE DATE PICKER BOX */}
            <div className="relative cursor-pointer group w-fit">
                <input 
                    type="date" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    value={cutoffDate}
                    onChange={e => e.target.value && setCutoffDate(e.target.value)}
                />
                <div className="flex items-center bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm group-hover:border-[#6D2158] transition-colors gap-2 pointer-events-none">
                    <Calendar size={16} className="text-[#6D2158] shrink-0 group-focus-within:animate-pulse"/>
                    <span className="font-black text-sm text-[#6D2158] tracking-wide">{format(parseISO(cutoffDate), 'dd MMM yyyy')}</span>
                </div>
            </div>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-8 pb-32">
          
          {/* UPCOMING LEAVE WIDGET */}
          {upcomingLeaveInfo && (
              <div className={`p-5 rounded-3xl shadow-sm border flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-top-4 ${upcomingLeaveInfo.isOnLeaveNow ? 'bg-cyan-50 border-cyan-200 shadow-cyan-100' : 'bg-white border-slate-200'}`}>
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
          )}

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
                                    {criticalItems.slice(0, 4).map((item: any) => (
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
              /* STAFF ONLY: PAYROLL MONTH ATTENDANCE GRID */
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col animate-in fade-in">
                  <div className="p-6 md:p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                     <h3 className="text-sm font-black text-[#6D2158] uppercase tracking-widest flex items-center gap-3">
                        <Calendar size={18}/> My Attendance ({format(payrollStart, 'MMM d')} - {format(payrollEnd, 'MMM d')})
                     </h3>
                     <Link href="/schedule" className="text-[10px] bg-white px-4 py-2.5 rounded-full shadow-sm font-bold text-slate-500 hover:text-[#6D2158] hover:shadow-md uppercase tracking-wider active:scale-95 transition-all">Full History</Link>
                  </div>
                  
                  <div className="p-4 md:p-8 overflow-x-auto">
                      <div className="min-w-[600px]">
                          <div className="grid grid-cols-7 gap-2 xl:gap-3 mb-2">
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                  <div key={d} className="text-center text-[10px] xl:text-xs font-black uppercase text-slate-400 tracking-widest">
                                      {d}
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
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-4 animate-in fade-in duration-200">
              <div className="bg-[#FDFBFD] w-full max-w-6xl rounded-3xl md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[95vh] md:max-h-[90vh] animate-in zoom-in-95">
                  <div className="p-4 md:p-6 bg-[#6D2158] text-white flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 gap-4">
                      <div className="flex justify-between w-full md:w-auto items-start">
                          <div>
                              <h3 className="font-black text-xl md:text-3xl flex items-center gap-2 md:gap-3 tracking-tight"><BarChart2 className="w-6 h-6 md:w-8 md:h-8"/> Team Leaves</h3>
                              <p className="text-[9px] md:text-xs uppercase tracking-widest text-white/70 mt-1 font-bold">Leave Liability Overview</p>
                          </div>
                          <button onClick={() => {setIsTeamModalOpen(false); setSelectedTeamHost(null);}} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors active:scale-95 md:hidden"><X size={18}/></button>
                      </div>
                      <div className="flex items-center gap-3 w-full md:w-auto justify-between">
                          <div className="flex items-center bg-white/10 px-3 md:px-4 py-2 md:py-2.5 rounded-xl border border-white/20 gap-2 w-full md:w-auto">
                              <Calendar size={14} className="text-white shrink-0"/>
                              <input 
                                  type="date" 
                                  className="bg-transparent text-white font-bold text-xs md:text-sm outline-none w-full [&::-webkit-calendar-picker-indicator]:invert"
                                  value={teamDate}
                                  onChange={e => setTeamDate(e.target.value)}
                              />
                          </div>
                          <button onClick={() => {setIsTeamModalOpen(false); setSelectedTeamHost(null);}} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors active:scale-95 hidden md:block"><X size={20}/></button>
                      </div>
                  </div>

                  <div className="flex flex-col h-full overflow-hidden">
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
                          // CALENDAR VIEW FOR SPECIFIC HOST
                          <div className="flex flex-col h-full bg-slate-50 animate-in slide-in-from-right-8">
                              <div className="p-4 md:p-6 border-b border-slate-200 bg-white shrink-0 flex items-center justify-between">
                                  <div>
                                      <button onClick={() => setSelectedTeamHost(null)} className="text-[10px] font-bold uppercase tracking-widest text-[#6D2158] flex items-center gap-1 mb-2 hover:opacity-70 transition-opacity">
                                          <ChevronLeft size={14}/> Back to Team List
                                      </button>
                                      <h3 className="font-black text-xl text-slate-800">{teamConfig.nicknames?.[selectedTeamHost.host.host_id] || selectedTeamHost.host.full_name}</h3>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedTeamHost.host.role}</p>
                                  </div>
                                  <div className="text-right">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Leaves Owed</p>
                                      <p className="text-3xl font-black text-[#6D2158]">{selectedTeamHost.balances.balTotal}</p>
                                  </div>
                              </div>
                              <div className="p-4 md:p-8 overflow-y-auto flex-1">
                                  <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200">
                                      <div className="grid grid-cols-7 gap-2 xl:gap-3 mb-2 min-w-[600px]">
                                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                              <div key={d} className="text-center text-[10px] xl:text-xs font-black uppercase text-slate-400 tracking-widest">
                                                  {d}
                                              </div>
                                          ))}
                                      </div>
                                      {(() => {
                                          const teamPeriod = getPayrollPeriod(parseISO(teamDate));
                                          return renderPayrollGrid(selectedTeamHostAtt, teamPeriod.start, teamPeriod.end);
                                      })()}
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <>
                              {/* TABS & CONTROLS */}
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 md:p-6 border-b border-slate-200 bg-white shrink-0">
                                  
                                  {/* Horizontal Scroll Container for Tabs */}
                                  <div className="flex-1 flex gap-2 overflow-x-auto custom-scrollbar pb-2 w-full min-w-0">
                                      <button onClick={() => setActiveDeptTab('All')} className={`shrink-0 px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest whitespace-nowrap transition-all shadow-sm ${activeDeptTab === 'All' ? 'bg-[#6D2158] text-white border border-[#6D2158]' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'}`}>All Staff</button>
                                      
                                      {(isAdmin ? allSubDepts : Array.from(new Set(teamBalances.map(c => c.department))).filter(d => d !== 'Unassigned').sort()).map((dept: any) => (
                                          <button key={dept} onClick={() => setActiveDeptTab(dept)} className={`shrink-0 px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest whitespace-nowrap transition-all shadow-sm ${activeDeptTab === dept ? 'bg-[#6D2158] text-white border border-[#6D2158]' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'}`}>{dept}</button>
                                      ))}
                                  </div>
                                  
                                  {/* Sort and Search Block */}
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

                              {/* Content */}
                              <div className="p-4 md:p-8 overflow-y-auto flex-1 custom-scrollbar bg-slate-50 md:bg-white">
                                  {(() => {
                                      let deptData = [...teamBalances];
                                      if (activeDeptTab !== 'All') {
                                          deptData = deptData.filter((c: any) => c.department === activeDeptTab);
                                      }
                                      if (teamSearch) {
                                          deptData = deptData.filter((c: any) => c.host.full_name.toLowerCase().includes(teamSearch.toLowerCase()) || String(c.host.host_id).includes(teamSearch));
                                      }

                                      // DYNAMIC SORTING BASED ON USER SELECTION
                                      deptData.sort((a: any, b: any) => parseFloat(b.balances[teamSortBy]) - parseFloat(a.balances[teamSortBy]));

                                      const totalOff = deptData.reduce((acc: number, curr: any) => acc + parseFloat(curr.balances.balOff), 0);
                                      const totalAL = deptData.reduce((acc: number, curr: any) => acc + parseFloat(curr.balances.balAL), 0);
                                      const totalPH = deptData.reduce((acc: number, curr: any) => acc + parseFloat(curr.balances.balPH), 0);
                                      const overall = totalOff + totalAL + totalPH;
                                      
                                      const offPct = overall ? (totalOff / overall) * 100 : 0;
                                      const alPct = overall ? (totalAL / overall) * 100 : 0;

                                      return (
                                          <div className="space-y-6 md:space-y-8 animate-in fade-in duration-300">
                                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                                                  <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-center text-center relative overflow-hidden">
                                                      <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Liability</div>
                                                      <div className="text-2xl md:text-4xl font-black text-rose-600">{overall.toFixed(1)} <span className="text-[10px] md:text-sm text-slate-400 font-bold uppercase tracking-widest">Days</span></div>
                                                      <div className="absolute -bottom-4 -right-4 w-16 h-16 md:w-24 h-24 bg-rose-50 rounded-full blur-2xl"></div>
                                                  </div>
                                                  
                                                  <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-center text-center relative overflow-hidden">
                                                      <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Highest Balance</div>
                                                      <div className="text-2xl md:text-4xl font-black text-amber-600">{deptData[0]?.balances.balTotal || 0} <span className="text-[10px] md:text-sm text-slate-400 font-bold uppercase tracking-widest">Days</span></div>
                                                      <div className="text-[9px] md:text-xs font-bold text-slate-600 bg-amber-50 px-2 py-1 md:px-3 md:py-1.5 rounded-lg mt-2 inline-block mx-auto border border-amber-100 truncate max-w-[100px] md:max-w-full">{teamConfig.nicknames?.[deptData[0]?.host.host_id] || deptData[0]?.host.full_name || 'N/A'}</div>
                                                      <div className="absolute -bottom-4 -right-4 w-16 h-16 md:w-24 h-24 bg-amber-50 rounded-full blur-2xl"></div>
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

                                              <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-200">
                                                  <div className="space-y-3 md:space-y-5">
                                                      {deptData.length === 0 ? (
                                                          <div className="text-center py-10 text-slate-400 font-bold italic text-sm">No matches found.</div>
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
                                                                      className="flex flex-col gap-2 md:gap-3 group p-3 md:p-4 rounded-xl md:rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 cursor-pointer"
                                                                  >
                                                                      
                                                                      <div className="flex justify-between items-start md:items-end gap-2">
                                                                          <div className="min-w-0 flex-1">
                                                                              <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5 md:gap-2 truncate group-hover:text-[#6D2158] transition-colors">
                                                                                  <span className="text-[10px] text-slate-400 font-mono w-4 shrink-0">{idx + 1}.</span> 
                                                                                  <span className="truncate">{teamConfig.nicknames?.[host.host_id] || host.full_name}</span>
                                                                                  <span className="hidden sm:inline text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-white shadow-sm border border-slate-200 px-2 py-0.5 rounded-md shrink-0">{host.role}</span>
                                                                              </div>
                                                                              
                                                                              {/* UPCOMING LEAVE BADGE */}
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
                                                                          <div className="text-right">
                                                                              <span className={`font-black text-sm md:text-lg shrink-0 ${parseFloat(balances[teamSortBy]) > (teamSortBy === 'balTotal' ? 15 : 7) ? 'text-rose-600' : 'text-[#6D2158]'}`}>
                                                                                  {balances[teamSortBy]}
                                                                              </span>
                                                                              {teamSortBy !== 'balTotal' && (
                                                                                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{teamSortBy === 'balOff' ? 'Off Days' : 'Annual'}</div>
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
                                                              )
                                                          })
                                                      )}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })()}
                              </div>
                         </>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
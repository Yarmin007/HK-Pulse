"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Lock, Plus, Minus, Save, CheckCircle2, 
  Loader2, ChevronLeft, Wine, Trash2, AlertTriangle, 
  Clock, ListChecks, RefreshCw, Edit3, AlertCircle, CheckCircle, PackageSearch, Calculator, MapPin, Info, Search, X, Wind, User, Sparkles, BedDouble, ChevronDown, Play, CheckSquare, DoorClosed, Pause
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

// --- IMPORTED GLOBAL TIME ENGINE ---
import { getDhakaTime, getDhakaDateStr } from '@/lib/dateUtils';

type Host = { id: string; full_name: string; host_id: string; };
type MasterItem = { article_number: string; article_name: string; generic_name?: string; category: string; image_url?: string; inventory_type?: string; is_minibar_item: boolean; villa_location?: string; };

type UniversalTask = {
    schedule_id: string;
    inventory_type: string;
    villa_number: string;
    status: string;
};

type GuestRecord = {
    villa_number: string;
    status: string;
    arrival_time?: string;
    departure_time?: string;
    guest_name?: string;
};

type ACRecord = {
    villa_number: string;
    status: string;
};

// --- NEW CLEANING TASK TYPE ---
type CleaningTask = {
    villa_number: string;
    status: 'Pending' | 'In Progress' | 'Completed' | 'DND' | 'Refused';
    start_time?: string;
    raw_start_time?: string; 
    end_time?: string;
    time_spent?: string;
    reenter_reason?: string; 
    morning_time: number;
    night_time: number;
    has_morning_completed: boolean;
    has_night_completed: boolean;
};

const parseVillas = (input: string, doubleVillas: string[]) => {
    const result = new Set<string>();
    const parts = input.split(',').map(s => s.trim());
    
    for (const p of parts) {
        if (p.includes('-') && !p.includes('-1') && !p.includes('-2')) {
            const [start, end] = p.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    const v = String(i);
                    if (doubleVillas.includes(v)) { result.add(`${v}-1`); result.add(`${v}-2`); } 
                    else { result.add(v); }
                }
            }
        } else if (p) {
            const baseV = p.replace('-1', '').replace('-2', '');
            if (!p.includes('-') && doubleVillas.includes(p)) { result.add(`${p}-1`); result.add(`${p}-2`); } 
            else { result.add(p); }
        }
    }
    
    return Array.from(result).sort((a,b) => parseFloat(a.replace('-', '.')) - parseFloat(b.replace('-', '.')));
};

export default function MyTasksHub() {
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<2 | 3>(2);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [currentHost, setCurrentHost] = useState<Host | null>(null);
  const [dailyTask, setDailyTask] = useState<{shift_type?: string, shift_note?: string} | null>(null);

  // --- CLEANING ALLOCATION STATE ---
  const [myCleaningVillas, setMyCleaningVillas] = useState<string[]>([]);
  const [guestData, setGuestData] = useState<GuestRecord[]>([]);
  const [acData, setAcData] = useState<ACRecord[]>([]);
  
  // --- NEW: CLEANING WORKFLOW STATE ---
  const [cleaningTasks, setCleaningTasks] = useState<Record<string, CleaningTask>>({});
  const [activeCleaningVilla, setActiveCleaningVilla] = useState<string | null>(null);
  const [cleaningElapsedSeconds, setCleaningElapsedSeconds] = useState(0);
  const [reenterModal, setReenterModal] = useState<{isOpen: boolean, villa: string}>({isOpen: false, villa: ''}); 

  // --- UNIVERSAL TASK STATE ---
  const [universalTasks, setUniversalTasks] = useState<Record<string, UniversalTask[]>>({});
  const [activeTaskType, setActiveTaskType] = useState<string>(''); 
  const [activeScheduleId, setActiveScheduleId] = useState<string>('');
  const [masterCatalog, setMasterCatalog] = useState<MasterItem[]>([]);
  
  const [selectedVilla, setSelectedVilla] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeLocation, setActiveLocation] = useState('All');

  const [keypadTarget, setKeypadTarget] = useState<string | null>(null);
  const [keypadValue, setKeypadValue] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sharedAssignments, setSharedAssignments] = useState<string[]>([]);

  const [showGuideModal, setShowGuideModal] = useState(false);
  
  // Expiry Specific
  const [isExpiryMode, setIsExpiryMode] = useState(false);
  const [expiryTargets, setExpiryTargets] = useState<any[]>([]);
  const [expiryAssignedVillas, setExpiryAssignedVillas] = useState<string[]>([]);
  const [expiryVillaData, setExpiryVillaData] = useState<Record<string, any>>({}); 
  const [expiryCounts, setExpiryCounts] = useState<Record<string, number>>({});
  const [refillCounts, setRefillCounts] = useState<Record<string, number>>({});

  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; confirmText: string; isDestructive: boolean; onConfirm: () => void;}>({ isOpen: false, title: '', message: '', confirmText: '', isDestructive: false, onConfirm: () => {} });

  // --- LIVE CLEANING TIMER ---
  const activeStartTime = activeCleaningVilla ? cleaningTasks[activeCleaningVilla]?.raw_start_time : null;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const updateTimer = () => {
        if (activeStartTime) {
            const start = new Date(activeStartTime).getTime();
            if (!isNaN(start)) {
                setCleaningElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
            }
        }
    };

    if (activeCleaningVilla && activeStartTime) {
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setCleaningElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [activeCleaningVilla, activeStartTime]);

  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ⚡ BULLETPROOF DATA LOADING (NO DATABASE DB TYPE CRASHES)
  const loadInitialData = useCallback(async (host: Host, isManualRefresh: boolean, silent = false) => {
      if (!silent) setIsLoading(true);
      const todayStr = getDhakaDateStr();
      const currentMonth = todayStr.substring(0, 7);

      // 1. Fetch Shift Info (Safe Filter)
      const { data: allAtt } = await supabase.from('hsk_attendance').select('host_id, shift_type, shift_note').eq('date', todayStr);
      const att = allAtt?.find(a => a.host_id === host.id || a.host_id === host.host_id);
      if (att) setDailyTask(att as any);

      // 2. Fetch DAILY CLEANING ALLOCATION (Safe Filter)
      const { data: allAllocData } = await supabase.from('hsk_allocations').select('host_id, task_details').eq('report_date', todayStr);
      const allocData = allAllocData?.find(a => a.host_id === host.id || a.host_id === host.host_id);

      if (allocData && allocData.task_details) {
          const assignedCleanVillas = parseVillas(allocData.task_details, []);
          setMyCleaningVillas(assignedCleanVillas);

          // Initialize Cleaning Task State
          const { data: allExistingLogs } = await supabase.from('hsk_cleaning_logs').select('*').eq('report_date', todayStr);
          const existingLogs = allExistingLogs?.filter(l => l.host_id === host.id || l.host_id === host.host_id);

          let activeV: string | null = null;
          const newTasksState: Record<string, CleaningTask> = {};
          const isNightShift = getDhakaTime().getHours() >= 15;

          assignedCleanVillas.forEach(v => {
              const dbLog = existingLogs?.find(l => l.villa_number === v);
              const localTimer = typeof window !== 'undefined' ? localStorage.getItem(`hk_timer_${v}`) : null;
              
              let morningTime = 0;
              let nightTime = 0;
              let hasMorning = false;
              let hasNight = false;

              if (dbLog?.session_history && dbLog.session_history.length > 0) {
                  dbLog.session_history.forEach((s: any) => {
                      if (s.reason === 'TD Service' || s.reason === 'Night Service') {
                          nightTime += s.duration || 0;
                          hasNight = true;
                      } else {
                          morningTime += s.duration || 0;
                          hasMorning = true;
                      }
                  });
              } else if (dbLog?.status === 'Completed') {
                  hasMorning = true;
                  morningTime = dbLog.time_spent_minutes || 0;
              }

              const isInProgressLocally = !!localTimer && dbLog?.status !== 'Completed' && dbLog?.status !== 'DND' && dbLog?.status !== 'Refused';
              const isActuallyInProgress = dbLog?.status === 'In Progress' || isInProgressLocally;

              if (isActuallyInProgress) {
                  activeV = v;
              }

              if (localTimer && !isActuallyInProgress) {
                  localStorage.removeItem(`hk_timer_${v}`);
              }

              // Evaluate effective status based on Day/Night shift
              let effectiveStatus = dbLog?.status || 'Pending';
              if (!isActuallyInProgress && dbLog?.status === 'Completed') {
                  if (isNightShift && !hasNight) {
                      effectiveStatus = 'Pending';
                  } else if (!isNightShift && !hasMorning) {
                      effectiveStatus = 'Pending';
                  }
              }

              newTasksState[v] = { 
                  villa_number: v, 
                  status: isActuallyInProgress ? 'In Progress' : effectiveStatus as any, 
                  start_time: dbLog?.start_time ? format(parseISO(dbLog.start_time), 'hh:mm a') : (localTimer ? format(parseISO(localTimer), 'hh:mm a') : undefined),
                  raw_start_time: isActuallyInProgress ? (dbLog?.start_time || localTimer) : dbLog?.start_time,
                  time_spent: dbLog?.time_spent_minutes ? `${dbLog.time_spent_minutes}m` : undefined,
                  morning_time: morningTime,
                  night_time: nightTime,
                  has_morning_completed: hasMorning,
                  has_night_completed: hasNight
              };
          });
          
          setCleaningTasks(prev => ({ ...prev, ...newTasksState }));
          if (activeV) setActiveCleaningVilla(activeV);

      } else {
          setMyCleaningVillas([]);
      }

      // 3. Fetch Guest List for Daily Cleaning
      const { data: gData } = await supabase
          .from('hsk_daily_summary')
          .select('villa_number, status, arrival_time, departure_time, guest_name')
          .eq('report_date', todayStr);
      if (gData) setGuestData(gData);

      // 4. Fetch AC Tracker Status
      const { data: aData } = await supabase
          .from('hsk_ac_tracker')
          .select('villa_number, status');
      if (aData) setAcData(aData);

      // 5. Fetch UNIVERSAL Inventory Assignments 
      const { data: activeSchedules } = await supabase.from('hsk_inventory_schedules')
          .select('id, inventory_type')
          .eq('status', 'Active');
      
      const taskMap: Record<string, UniversalTask[]> = {};

      if (activeSchedules && activeSchedules.length > 0) {
          const scheduleIds = activeSchedules.map(s => s.id);
          const { data: allAssignments } = await supabase.from('hsk_inventory_assignments').select('*').in('schedule_id', scheduleIds);
          const assignments = allAssignments?.filter(a => a.host_id === host.id || a.host_id === host.host_id);

          if (assignments) {
              assignments.forEach(a => {
                  if (!taskMap[a.inventory_type]) taskMap[a.inventory_type] = [];
                  taskMap[a.inventory_type].push({
                      schedule_id: a.schedule_id,
                      inventory_type: a.inventory_type,
                      villa_number: a.villa_number,
                      status: a.status
                  });
              });
              
              Object.values(taskMap).forEach(arr => {
                  arr.sort((a,b) => {
                      const numA = parseInt(a.villa_number) || 9999;
                      const numB = parseInt(b.villa_number) || 9999;
                      return numA - numB;
                  });
              });
          }
      }

      // 6. Fetch Legacy MINIBAR Assignments
      const { data: constData } = await supabase.from('hsk_constants').select('*').in('type', ['mb_inv_status', 'mb_active_period', 'double_mb_villas']);
      const mbStatus = constData?.find(c => c.type === 'mb_inv_status')?.label || 'CLOSED';
      const mbPeriod = constData?.find(c => c.type === 'mb_active_period')?.label;
      const dvStr = constData?.find(c => c.type === 'double_mb_villas')?.label || '';
      const dvList = dvStr.split(',').map((s: string) => s.trim()).filter(Boolean);

      if (mbStatus === 'OPEN' && mbPeriod) {
          const allocDate = `${mbPeriod}-01`;
          const { data: allMbAlloc } = await supabase.from('hsk_minibar_allocations').select('host_id, villas').eq('date', allocDate);
          const mbAllocations = allMbAlloc?.find(a => a.host_id === host.id || a.host_id === host.host_id);
          
          if (mbAllocations && mbAllocations.villas) {
              const mbVillas = parseVillas(mbAllocations.villas, dvList);
              
              const [y, m] = mbPeriod.split('-').map(Number);
              const startOfMonthUTC = new Date(y, m - 1, 1).toISOString();
              const startOfNextMonthUTC = new Date(y, m, 1).toISOString();
              
              const { data: allMbSubs } = await supabase.from('hsk_villa_minibar_inventory').select('host_id, villa_number').gte('logged_at', startOfMonthUTC).lt('logged_at', startOfNextMonthUTC);
              const mbSubmissions = allMbSubs?.filter(s => s.host_id === host.id || s.host_id === host.host_id);
              
              const completedMbVillas = new Set((mbSubmissions || []).map(s => s.villa_number));

              taskMap['Legacy Minibar'] = mbVillas.map(v => ({
                  schedule_id: 'legacy_minibar',
                  inventory_type: 'Legacy Minibar',
                  villa_number: v,
                  status: completedMbVillas.has(v) ? 'Submitted' : 'Pending'
              }));
          }
      }

      setUniversalTasks(taskMap);

      // 7. Fetch EXPIRY Targets
      const { data: expiryTargetData } = await supabase.from('hsk_expiry_targets').select('*').eq('month_period', currentMonth);
      if (expiryTargetData) setExpiryTargets(expiryTargetData);
      
      const { data: allExpAlloc } = await supabase.from('hsk_expiry_allocations').select('host_id, villas').eq('month_period', currentMonth);
      const expiryAllocRes = allExpAlloc?.find(a => a.host_id === host.id || a.host_id === host.host_id);
      
      if (expiryAllocRes && expiryAllocRes.villas) {
          const parsedExpiryVillas = parseVillas(expiryAllocRes.villas, dvList);
          setExpiryAssignedVillas(parsedExpiryVillas);
      } else {
          setExpiryAssignedVillas([]);
      }

      const { data: allExpRem } = await supabase.from('hsk_expiry_removals').select('*').eq('month_period', currentMonth);
      const expiryRemRes = allExpRem?.filter(r => r.host_id === host.id || r.host_id === host.host_id);
      
      if (expiryRemRes) {
          const villaMap: Record<string, any> = {};
          expiryRemRes.forEach((r: any) => { villaMap[r.villa_number] = r; });
          setExpiryVillaData(villaMap);
      }

      if (!silent) setIsLoading(false);
  }, []);

  const fetchCatalog = useCallback(async () => {
    const { data: catRes } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (catRes) {
        setMasterCatalog(catRes);
    }
  }, []);

  useEffect(() => {
    const sessionData = localStorage.getItem('hk_pulse_session');
    if (sessionData) {
        const parsed = JSON.parse(sessionData);
        // Create full host object directly to ensure both IDs are available
        const hostObj = { id: parsed.id, full_name: parsed.full_name, host_id: parsed.host_id || parsed.id }; 
        setCurrentHost(hostObj);
        loadInitialData(hostObj, false);
    } else {
        window.location.href = '/';
    }

    setIsMounted(true);
    fetchCatalog();
  }, [loadInitialData, fetchCatalog]);


  // --- CLEANING TASK HANDLERS (CONNECTED TO SUPABASE) ---
  const handleStartService = async (villa: string, reason?: string) => {
    if (activeCleaningVilla) {
      toast.error("Please finish or pause your current room first!");
      return;
    }
    
    const now = new Date().toISOString();
    const todayStr = getDhakaDateStr();

    localStorage.setItem(`hk_timer_${villa}`, now);

    const isNightShift = getDhakaTime().getHours() >= 15;
    const defaultReason = isNightShift ? 'TD Service' : 'Morning Service';
    const finalReason = reason || defaultReason;

    // 1. Update UI instantly (Optimistic Update)
    setActiveCleaningVilla(villa);
    setCleaningTasks(prev => ({
        ...prev,
        [villa]: { 
            ...prev[villa], 
            status: 'In Progress', 
            start_time: format(parseISO(now), 'hh:mm a'),
            raw_start_time: now,
            reenter_reason: finalReason 
        }
    }));
    toast.success(`Service Started: Room ${villa}` + (finalReason ? ` (${finalReason})` : ''));

    // 2. Safe Supabase Save (Force update/insert to bypass schema constraints)
    const payload = {
        report_date: todayStr,
        villa_number: villa,
        host_id: currentHost?.host_id,
        host_name: currentHost?.full_name,
        status: 'In Progress',
        start_time: now,
        updated_at: now
    };

    const { data, error: updateError } = await supabase.from('hsk_cleaning_logs')
        .update(payload)
        .match({ report_date: todayStr, villa_number: villa })
        .select();

    if (updateError || !data || data.length === 0) {
        const { error: insertError } = await supabase.from('hsk_cleaning_logs').insert(payload);
        if (insertError) {
            console.error("SUPABASE SAVE FAILED:", insertError);
            toast.error("Database Error: Could not save start time to server.");
            resetRoomStatus(villa); 
        }
    }
  };

  const handleFinishRoom = async (villa: string) => {
    localStorage.removeItem(`hk_timer_${villa}`);
    const minutes = Math.max(1, Math.ceil(cleaningElapsedSeconds / 60));
    const now = new Date().toISOString();
    const todayStr = getDhakaDateStr();

    // ⚡ Logic for Re-Entering a Room: Create Session Log
    const currentTaskState = cleaningTasks[villa];
    const isNightShift = getDhakaTime().getHours() >= 15;
    const sessionReason = currentTaskState?.reenter_reason || (isNightShift ? 'TD Service' : 'Morning Service');
    const sessionStart = currentTaskState?.start_time || format(parseISO(now), 'hh:mm a');
    const sessionEnd = format(parseISO(now), 'hh:mm a');
    
    const previousTimeStr = currentTaskState?.time_spent || '0m';
    const previousMinutes = parseInt(previousTimeStr) || 0;
    const totalMinutes = previousMinutes + minutes;

    const newSessionLog = {
        reason: sessionReason,
        start: sessionStart,
        end: sessionEnd,
        duration: minutes
    };
    
    // Day vs Night duration logic
    let newMorningTime = currentTaskState?.morning_time || 0;
    let newNightTime = currentTaskState?.night_time || 0;
    let hasMorning = currentTaskState?.has_morning_completed || false;
    let hasNight = currentTaskState?.has_night_completed || false;

    if (sessionReason === 'TD Service' || sessionReason === 'Night Service') {
        newNightTime += minutes;
        hasNight = true;
    } else {
        newMorningTime += minutes;
        hasMorning = true;
    }

    // 1. Update UI instantly
    setCleaningTasks(prev => ({
        ...prev,
        [villa]: { 
            ...prev[villa], 
            status: 'Completed', 
            end_time: sessionEnd, 
            time_spent: `${totalMinutes}m`, 
            morning_time: newMorningTime,
            night_time: newNightTime,
            has_morning_completed: hasMorning,
            has_night_completed: hasNight,
            reenter_reason: undefined 
        }
    }));
    setActiveCleaningVilla(null);
    toast.success(`Service Completed: Room ${villa}`);

    // 2. Fetch existing history from Supabase
    const { data: existingData } = await supabase
        .from('hsk_cleaning_logs')
        .select('session_history')
        .eq('report_date', todayStr)
        .eq('villa_number', villa)
        .maybeSingle();

    const existingHistory = Array.isArray(existingData?.session_history) 
        ? existingData.session_history 
        : [];
        
    const updatedHistory = [...existingHistory, newSessionLog];

    // 3. Safe Supabase Save
    const payload = {
        report_date: todayStr,
        villa_number: villa,
        host_id: currentHost?.host_id,
        host_name: currentHost?.full_name,
        status: 'Completed',
        end_time: now,
        time_spent_minutes: totalMinutes,
        session_history: updatedHistory, 
        updated_at: now
    };

    const { data, error: updateError } = await supabase.from('hsk_cleaning_logs')
        .update(payload)
        .match({ report_date: todayStr, villa_number: villa })
        .select();

    if (updateError || !data || data.length === 0) {
        const { error: insertError } = await supabase.from('hsk_cleaning_logs').insert(payload);
        if (insertError) {
             console.error("SUPABASE SAVE FAILED:", insertError);
             toast.error("Warning: Service completion might not have saved properly.");
        }
    }
  };

  const handleDND = async (villa: string) => {
    localStorage.removeItem(`hk_timer_${villa}`);
    const now = new Date().toISOString();
    const todayStr = getDhakaDateStr();

    setCleaningTasks(prev => ({
        ...prev,
        [villa]: { ...prev[villa], status: 'DND', time_spent: undefined }
    }));
    toast.success(`DND Logged: Room ${villa}`);

    const payload = {
        report_date: todayStr,
        villa_number: villa,
        host_id: currentHost?.host_id,
        host_name: currentHost?.full_name,
        status: 'DND',
        dnd_time: now,
        updated_at: now
    };

    const { data, error: updateError } = await supabase.from('hsk_cleaning_logs')
        .update(payload)
        .match({ report_date: todayStr, villa_number: villa })
        .select();

    if (updateError || !data || data.length === 0) {
        await supabase.from('hsk_cleaning_logs').insert(payload);
    }
  };

  const handleRefused = async (villa: string) => {
    localStorage.removeItem(`hk_timer_${villa}`);
    const now = new Date().toISOString();
    const todayStr = getDhakaDateStr();

    setCleaningTasks(prev => ({
        ...prev,
        [villa]: { ...prev[villa], status: 'Refused', time_spent: undefined }
    }));
    toast.success(`Service Refused: Room ${villa}`);

    const payload = {
        report_date: todayStr,
        villa_number: villa,
        host_id: currentHost?.host_id,
        host_name: currentHost?.full_name,
        status: 'Refused',
        updated_at: now
    };

    const { data, error: updateError } = await supabase.from('hsk_cleaning_logs')
        .update(payload)
        .match({ report_date: todayStr, villa_number: villa })
        .select();

    if (updateError || !data || data.length === 0) {
        await supabase.from('hsk_cleaning_logs').insert(payload);
    }
  };


  const resetRoomStatus = async (villa: string) => {
      const todayStr = getDhakaDateStr();
      localStorage.removeItem(`hk_timer_${villa}`);
      
      if (activeCleaningVilla === villa) {
          setActiveCleaningVilla(null);
          setCleaningElapsedSeconds(0);
      }

      setCleaningTasks(prev => ({
          ...prev,
          [villa]: { ...prev[villa], status: 'Pending', time_spent: undefined }
      }));
      
      const { data } = await supabase.from('hsk_cleaning_logs')
        .update({ status: 'Pending', updated_at: new Date().toISOString() })
        .match({ report_date: todayStr, villa_number: villa })
        .select();

      if (!data || data.length === 0) {
          await supabase.from('hsk_cleaning_logs').insert({
              report_date: todayStr,
              villa_number: villa,
              host_id: currentHost?.host_id,
              host_name: currentHost?.full_name,
              status: 'Pending',
              updated_at: new Date().toISOString()
          });
      }
  };

  // --- AC STATUS UPDATE HANDLER ---
  const handleAcStatusChange = async (villaNumber: string, newStatus: string) => {
      const todayStr = getDhakaDateStr();
      
      setAcData(prev => {
          const filtered = prev.filter(a => a.villa_number !== villaNumber);
          return [...filtered, { villa_number: villaNumber, status: newStatus }];
      });

      const { error } = await supabase
          .from('hsk_ac_tracker')
          .upsert({
              report_date: todayStr,
              villa_number: villaNumber,
              status: newStatus,
              host_id: currentHost?.host_id,
              host_name: currentHost?.full_name,
              updated_at: new Date().toISOString()
          }, { onConflict: 'villa_number' });

      if (error) {
          toast.error(`Error: ${error.message}`);
          loadInitialData(currentHost!, false, true);
      } else {
          await supabase.from('hsk_ac_history').insert({
              villa_number: villaNumber,
              status: newStatus,
              host_id: currentHost?.host_id,
              host_name: currentHost?.full_name,
              logged_at: new Date().toISOString()
          });
          toast.success(`Room ${villaNumber} AC turned ${newStatus}`);
      }
  };

  const groupedTargets = useMemo(() => {
      const expMap: Record<string, any> = {};
      const refMap: Record<string, any> = {};

      expiryTargets.forEach(t => {
          if (t.expiry_date === 'REFILL') {
              if (!refMap[t.article_number]) refMap[t.article_number] = { ...t, type: 'REFILL' };
          } else {
              if (!expMap[t.article_number]) {
                  expMap[t.article_number] = { article_number: t.article_number, article_name: t.article_name, dates: [], isMissing: false, type: 'EXPIRY' };
              }
              if (!t.expiry_date || t.expiry_date === 'MISSING') {
                  expMap[t.article_number].isMissing = true;
              } else {
                  expMap[t.article_number].dates.push(t.expiry_date);
              }
          }
      });

      return {
          expiry: Object.values(expMap),
          refill: Object.values(refMap).filter(r => !expMap[r.article_number]) 
      };
  }, [expiryTargets]);

  useEffect(() => {
      if (step === 3 && isExpiryMode && selectedVilla && ['Removed', 'Sent', 'Refilled'].includes(expiryVillaData[selectedVilla]?.status)) {
          const initialRefills: Record<string, number> = {};
          const currentRemovalData = expiryVillaData[selectedVilla]?.removal_data || [];
          currentRemovalData.forEach((item: any) => {
              initialRefills[item.article_number] = item.refilled_qty !== undefined ? item.refilled_qty : item.qty; 
          });
          setRefillCounts(initialRefills);
      }
  }, [step, isExpiryMode, selectedVilla, expiryVillaData]);

  // --- START A TASK (UNIVERSAL INVENTORY) ---
  const startAudit = async (villa: string, taskType: string, scheduleId: string) => {
    setIsLoading(true);
    setSelectedVilla(villa);
    setActiveTaskType(taskType);
    setActiveScheduleId(scheduleId);
    setIsExpiryMode(false);
    setActiveLocation('All'); 
    setSearchQuery('');

    const { data: allAssigned } = await supabase.from('hsk_inventory_assignments')
        .select('host_id')
        .match({ schedule_id: scheduleId, villa_number: villa })
        .order('host_id');
    
    if (allAssigned) {
        setSharedAssignments(allAssigned.map(a => a.host_id));
    }
    
    const initialCounts: Record<string, number> = {};

    const relevantItems = taskType === 'Legacy Minibar' 
        ? masterCatalog.filter(i => i.is_minibar_item)
        : masterCatalog.filter(i => i.inventory_type === taskType);

    if (taskType === 'Legacy Minibar') {
        const mbPeriod = getDhakaDateStr().substring(0, 7);
        const [y, m] = mbPeriod.split('-').map(Number);
        const startOfMonthUTC = new Date(y, m - 1, 1).toISOString();
        const startOfNextMonthUTC = new Date(y, m, 1).toISOString();
        
        const { data: sub } = await supabase.from('hsk_villa_minibar_inventory').select('inventory_data').eq('villa_number', villa).gte('logged_at', startOfMonthUTC).lt('logged_at', startOfNextMonthUTC).order('logged_at', { ascending: false }).limit(1).maybeSingle();
        
        relevantItems.forEach(item => { initialCounts[item.article_number] = 0; });
        if (sub && sub.inventory_data) {
            sub.inventory_data.forEach((item: any) => { initialCounts[item.article_number] = item.qty; });
        }
    } else {
        const { data: recs, error: fetchErr } = await supabase.from('hsk_inventory_records').select('article_number, counted_qty').eq('schedule_id', scheduleId).eq('villa_number', villa);
        if (fetchErr) toast.error("Failed to load previous counts!");

        relevantItems.forEach(item => { initialCounts[item.article_number] = 0; });
        if (recs) {
            recs.forEach(r => { initialCounts[r.article_number] = r.counted_qty; });
        }
    }

    setCounts(initialCounts);
    setStep(3);
    setIsLoading(false);

    if (!localStorage.getItem('hk_pulse_inv_guide_seen')) {
        setShowGuideModal(true);
    }
  };

  const startExpiryAudit = (villa: string) => {
      setSelectedVilla(villa);
      setIsExpiryMode(true);
      const initialCounts: Record<string, number> = {};
      groupedTargets.expiry.forEach((t: any) => { initialCounts[t.article_number] = 0; });
      groupedTargets.refill.forEach((t: any) => { initialCounts[t.article_number] = 0; });

      const existingData = expiryVillaData[villa];
      if (existingData && existingData.removal_data) {
          existingData.removal_data.forEach((item: any) => {
              initialCounts[item.article_number] = item.qty || 0;
          });
      }
      setExpiryCounts(initialCounts);
      setStep(3);
  };

  const closeGuide = () => {
      localStorage.setItem('hk_pulse_inv_guide_seen', 'true');
      setShowGuideModal(false);
  };

  const updateCount = (article_number: string, delta: number) => {
    setCounts(prev => {
      const next = (prev[article_number] || 0) + delta;
      return { ...prev, [article_number]: next < 0 ? 0 : next };
    });
  };

  const updateExpiryCount = (artNo: string, delta: number) => {
      setExpiryCounts(prev => {
          const next = (prev[artNo] || 0) + delta;
          return { ...prev, [artNo]: next < 0 ? 0 : next };
      });
  };

  const updateRefillCount = (artNo: string, delta: number) => {
      setRefillCounts(prev => {
          const next = (prev[artNo] || 0) + delta;
          return { ...prev, [artNo]: Math.max(0, next) }; 
      });
  };

  // --- KEYPAD LOGIC ---
  const openKeypad = (article_number: string) => {
      setKeypadTarget(article_number);
      setKeypadValue(String(counts[article_number] || 0));
  };

  const handleKeypadPress = (val: string) => {
      if (val === 'DEL') {
          setKeypadValue(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
      } else if (val === 'CLR') {
          setKeypadValue('0');
      } else {
          setKeypadValue(prev => prev === '0' ? val : prev + val);
      }
  };

  const saveKeypadValue = () => {
      if (keypadTarget) {
          const num = parseInt(keypadValue, 10);
          setCounts(prev => ({ ...prev, [keypadTarget]: isNaN(num) ? 0 : num }));
      }
      setKeypadTarget(null);
  };

  const executeSaveInventory = async () => {
    setIsSaving(true);
    
    if (activeTaskType === 'Legacy Minibar') {
        const countedItems = Object.entries(counts).filter(([_, qty]) => qty > 0).map(([artNo, qty]) => {
                const item = masterCatalog.find(c => c.article_number === artNo);
                return { article_number: artNo, name: item?.generic_name || item?.article_name, qty };
        });

        const payload = {
            villa_number: selectedVilla, 
            host_id: currentHost?.host_id, 
            host_name: currentHost?.full_name,
            inventory_data: countedItems, 
            logged_at: new Date().toISOString() 
        };

        const { error } = await supabase.from('hsk_villa_minibar_inventory').insert(payload);
        if (error) {
            toast.error("Failed to save minibar: " + error.message);
            setIsSaving(false);
            return;
        }
        
        setUniversalTasks(prev => {
            const updated = { ...prev };
            if (updated['Legacy Minibar']) {
                updated['Legacy Minibar'] = updated['Legacy Minibar'].map(t => t.villa_number === selectedVilla ? { ...t, status: 'Submitted' } : t);
            }
            return updated;
        });
        
    } else {
        const recordsToInsert = Object.entries(counts)
            .filter(([_, qty]) => qty > 0)
            .map(([artNo, qty]) => ({
                schedule_id: activeScheduleId,
                villa_number: selectedVilla,
                article_number: artNo,
                counted_qty: qty,
                inventory_type: activeTaskType
            }));

        const { error: delErr } = await supabase.from('hsk_inventory_records')
            .delete()
            .match({ schedule_id: activeScheduleId, villa_number: selectedVilla });
            
        if (delErr) {
            toast.error("Database error (Clear): " + delErr.message);
            setIsSaving(false);
            return;
        }

        if (recordsToInsert.length > 0) {
            const { error: insErr } = await supabase.from('hsk_inventory_records').insert(recordsToInsert);
            if (insErr) {
                toast.error("Database error (Save): " + insErr.message);
                setIsSaving(false);
                return;
            }
        }

        const { error: updErr } = await supabase.from('hsk_inventory_assignments')
            .update({ status: 'Submitted' })
            .match({ schedule_id: activeScheduleId, villa_number: selectedVilla });
            
        if (updErr) {
             console.error("Assignment Update Error:", updErr);
        }
        
        setUniversalTasks(prev => {
            const updated = { ...prev };
            if (updated[activeTaskType]) {
                updated[activeTaskType] = updated[activeTaskType].map(t => t.villa_number === selectedVilla ? { ...t, status: 'Submitted' } : t);
            }
            return updated;
        });
    }

    setIsSaving(false);
    setShowSuccess(true);
  };

  const requestSaveInventory = () => {
      setConfirmModal({
          isOpen: true, 
          title: `Submit Location ${selectedVilla}?`, 
          message: "Are you sure you want to save this inventory record?", 
          confirmText: activeTaskType === 'Legacy Minibar' ? "Confirm Minibar Inventory" : "Submit Record", 
          isDestructive: false,
          onConfirm: () => { setConfirmModal(prev => ({ ...prev, isOpen: false })); executeSaveInventory(); }
      });
  };

  const handleEditRemovals = () => {
      const restoredCounts: Record<string, number> = {};
      const currentRemovals = expiryVillaData[selectedVilla]?.removal_data || [];
      
      currentRemovals.forEach((item: any) => {
          restoredCounts[item.article_number] = item.qty;
      });
      setExpiryCounts(restoredCounts);
      
      setExpiryVillaData(prev => ({
          ...prev,
          [selectedVilla]: { ...(prev[selectedVilla] || {}), status: 'Pending' } 
      }));
  };

  const submitExpiryRemovals = async (statusOverride: 'All OK' | 'Removed') => {
      setIsSaving(true);
      
      const removalData = Object.entries(expiryCounts).filter(([_, qty]) => qty > 0).map(([artNo, qty]) => {
              const target = groupedTargets.expiry.find((t: any) => t.article_number === artNo) || groupedTargets.refill.find((t: any) => t.article_number === artNo);
              return { article_number: artNo, name: target?.article_name, qty, refilled_qty: 0 };
          });

      const payload = {
          month_period: getDhakaDateStr().substring(0, 7),
          villa_number: selectedVilla,
          host_id: currentHost?.host_id,
          host_name: currentHost?.full_name,
          removal_data: statusOverride === 'All OK' ? [] : removalData,
          status: statusOverride,
          logged_at: new Date().toISOString()
      };

      const { data: existing } = await supabase.from('hsk_expiry_removals')
          .select('id').match({ villa_number: selectedVilla, month_period: getDhakaDateStr().substring(0, 7) }).maybeSingle();

      let error;
      if (existing && existing.id) {
          const res = await supabase.from('hsk_expiry_removals').update(payload).eq('id', existing.id);
          error = res.error;
      } else {
          const res = await supabase.from('hsk_expiry_removals').insert(payload);
          error = res.error;
      }

      setIsSaving(false);

      if (error) { 
          toast.error("Failed to save audit."); 
      } else {
          setExpiryVillaData(prev => ({ ...prev, [selectedVilla]: payload }));
          if (statusOverride === 'All OK') toast.success("Cleared! No items found.");
          else toast.success("Removals Recorded! Now fetch replacements.");
          
          if (statusOverride === 'All OK') setShowSuccess(true);
      }
  };

  const confirmExpiryRefill = async () => {
      setIsSaving(true);
      
      const currentData = expiryVillaData[selectedVilla]?.removal_data || [];
      const updatedRemovalData = currentData.map((item: any) => ({
          ...item,
          refilled_qty: refillCounts[item.article_number] !== undefined ? refillCounts[item.article_number] : item.qty
      }));

      const { error } = await supabase.from('hsk_expiry_removals')
          .update({ 
              status: 'Refilled', 
              removal_data: updatedRemovalData,
              logged_at: new Date().toISOString() 
          })
          .match({ villa_number: selectedVilla, month_period: getDhakaDateStr().substring(0, 7) });

      setIsSaving(false);

      if (error) {
          toast.error("Failed to confirm refill.");
      } else {
          const currentRecord = expiryVillaData[selectedVilla] || {};
          setExpiryVillaData(prev => ({ ...prev, [selectedVilla]: { ...currentRecord, status: 'Refilled', removal_data: updatedRemovalData }}));
          toast.success("Replacements Confirmed!");
          setShowSuccess(true);
      }
  };

  const resetFlow = () => {
    setShowSuccess(false);
    setSelectedVilla('');
    setIsExpiryMode(false);
    setKeypadTarget(null);
    setStep(2);
  };

  // --- CLEANING VILLA CARD COLOR LOGIC ---
  const getVillaCardData = (vNum: string) => {
      const match = guestData.find(r => r.villa_number === vNum);
      const st = match?.status?.toUpperCase() || 'VAC';
      
      let headerColor = 'bg-slate-200 text-slate-700'; 
      let shortStatus = st;
      let timeStr = '';
      let guestName = match?.guest_name || '';

      if (st.includes('ARR')) {
          headerColor = 'bg-green-500 text-white';
          if(match?.arrival_time) timeStr = match.arrival_time;
      } else if (st.includes('VAC') || st === 'VM/VAC') {
          headerColor = 'bg-sky-500 text-white';
          shortStatus = 'VAC';
      } else if (st.includes('TMA')) {
          headerColor = 'bg-yellow-400 text-slate-900';
      } else if (st.includes('DEP')) {
          headerColor = 'bg-rose-500 text-white';
          if(match?.departure_time) timeStr = match.departure_time;
      } else if (st.includes('HOUSE USE') || st.includes('SHOW')) {
          headerColor = 'bg-[#6D2158] text-white';
      }

      const acMatch = acData.find(a => a.villa_number === vNum);
      const acStatus = acMatch ? acMatch.status.toUpperCase() : 'ON'; // Matches Admin Board default

      // Determine explicit cleaning type based on PMS status
      let cleaningType = 'Occupied';
      if (st.includes('DEP')) cleaningType = 'Departure';
      if (st.includes('ARR')) cleaningType = 'Arrival';
      if (st.includes('VAC')) cleaningType = 'Touch Up';

      return { status: shortStatus, headerColor, timeStr, guestName, acStatus, cleaningType };
  };

  // Derive Catalog & Unique Locations
  const activeCatalog = activeTaskType === 'Legacy Minibar' 
      ? masterCatalog.filter(i => i.is_minibar_item) 
      : masterCatalog.filter(i => i.inventory_type === activeTaskType);
      
  const displayCatalog = useMemo(() => {
      let list = [...activeCatalog];
      
      const isVilla = /^\d+$/.test(selectedVilla) || selectedVilla.includes('-');
      if (!isVilla && sharedAssignments.length > 1 && currentHost) {
          const myIndex = sharedAssignments.indexOf(currentHost.host_id);
          if (myIndex !== -1) {
              const itemsPerPerson = Math.ceil(list.length / sharedAssignments.length);
              const start = myIndex * itemsPerPerson;
              list = list.slice(start, start + itemsPerPerson);
          }
      }
      
      if (activeLocation !== 'All') {
          if (activeLocation === 'Unassigned') list = list.filter(i => !i.villa_location);
          else list = list.filter(i => i.villa_location === activeLocation);
      }
      
      if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          list = list.filter(i => 
              (i.article_name || '').toLowerCase().includes(q) || 
              (i.generic_name || '').toLowerCase().includes(q) ||
              (i.article_number || '').includes(q)
          );
      }
      
      return list;
  }, [activeCatalog, selectedVilla, sharedAssignments, currentHost, activeLocation, searchQuery]);

  const uniqueLocations = Array.from(new Set(activeCatalog.map(i => i.villa_location).filter(Boolean))) as string[];
  const hasUnassignedLocations = activeCatalog.some(i => !i.villa_location);
  const locationFilters = ['All', ...uniqueLocations];
  if (hasUnassignedLocations) locationFilters.push('Unassigned');

  if (!isMounted) return null;
  const isNightShift = getDhakaTime().getHours() >= 15;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-2 md:p-4 font-sans text-slate-800 pb-24">
      
      <div className="max-w-7xl mx-auto w-full flex flex-col animate-in fade-in">
        
        {/* --- DASHBOARD VIEW (THE HUB) --- */}
        {step === 2 && currentHost && (
            <>
                <div className="flex items-center justify-between mb-6 bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                   <div className="flex items-center gap-4">
                       <div className="w-14 h-14 rounded-2xl bg-[#6D2158] text-white flex items-center justify-center text-xl font-black shadow-lg shrink-0">
                          {currentHost.full_name.charAt(0)}
                       </div>
                       <div>
                         <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#6D2158]">My Tasks</h1>
                         <p className="text-[10px] md:text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">
                            {format(getDhakaTime(), 'EEEE, d MMMM yyyy')}
                         </p>
                       </div>
                   </div>
                   <button onClick={() => loadInitialData(currentHost!, true)} className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full transition-colors active:scale-95" title="Refresh Tasks">
                       <RefreshCw size={18} className={isLoading ? 'animate-spin text-[#6D2158]' : ''}/>
                   </button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
                ) : (
                    <div className="space-y-6">
                        
                        {/* --- DAILY CLEANING ALLOCATION BLOCK (ALWAYS VISIBLE) --- */}
                        <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                                        <BedDouble size={20} className="text-[#6D2158]" /> Room Service
                                    </h3>
                                    <p className="text-xs text-slate-400 font-medium">Your assigned villas for today.</p>
                                </div>
                                {myCleaningVillas.length > 0 && (
                                    <div className="text-right">
                                        <span className="text-2xl font-black text-[#6D2158]">
                                            {Object.values(cleaningTasks).filter(t => t.status === 'Completed').length}
                                        </span>
                                        <span className="text-sm font-bold text-slate-300">/{myCleaningVillas.length}</span>
                                    </div>
                                )}
                            </div>

                            {myCleaningVillas.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {myCleaningVillas.map(v => {
                                        const cardData = getVillaCardData(v);
                                        const taskState = cleaningTasks[v] || { status: 'Pending', morning_time: 0, night_time: 0, has_morning_completed: false, has_night_completed: false };
                                        const isActive = v === activeCleaningVilla;
                                        const isCompleted = taskState.status === 'Completed';
                                        const isDND = taskState.status === 'DND';
                                        const isRefused = taskState.status === 'Refused';
                                        
                                        const minibarTask = universalTasks['Legacy Minibar']?.find(t => t.villa_number === v);
                                        const isMinibarDone = minibarTask?.status === 'Submitted';

                                        let cardStyle = "bg-white border-slate-200";
                                        if (isActive) cardStyle = "bg-emerald-50/50 border-emerald-400 ring-4 ring-emerald-500/10";
                                        if (isCompleted) cardStyle = "bg-slate-50 border-slate-200 opacity-60";
                                        if (isDND || isRefused) cardStyle = "bg-rose-50 border-rose-200";

                                        return (
                                            <div key={v} className={`p-4 md:p-5 rounded-2xl border-2 shadow-sm transition-all duration-300 flex flex-col ${cardStyle}`}>
                                                
                                                <div className="flex justify-between items-start mb-4">
                                                  <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                      <h3 className={`text-2xl md:text-3xl font-black tracking-tighter ${isCompleted ? 'text-slate-400' : 'text-[#6D2158]'}`}>
                                                        {v}
                                                      </h3>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                      <User size={10}/> {cardData.guestName || 'No Guest Info'}
                                                    </p>
                                                  </div>

                                                  <div className="flex flex-col items-end gap-2">
                                                      <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-white shadow-sm ${cardData.headerColor.replace('bg-', 'bg-').replace('text-', 'text-')}`}>
                                                        {cardData.cleaningType}
                                                      </div>
                                                      {cardData.timeStr && (
                                                          <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                                              <Clock size={10} className="text-slate-400"/>
                                                              <span>{cardData.timeStr}</span>
                                                          </div>
                                                      )}
                                                  </div>
                                                </div>

                                                {/* ACTION AREA */}
                                                <div className="mt-auto pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                                                  
                                                  {/* Utilities Row: AC & Minibar */}
                                                  <div className="flex gap-2">
                                                      <button 
                                                          onClick={() => handleAcStatusChange(v, cardData.acStatus === 'ON' ? 'OFF' : 'ON')}
                                                          className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-2 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border shadow-sm ${
                                                              cardData.acStatus === 'ON' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-500 border-emerald-600 text-white'
                                                          }`}
                                                      >
                                                          <Wind size={12} className={`shrink-0 ${cardData.acStatus === 'ON' ? 'animate-pulse' : ''}`}/>
                                                          {cardData.acStatus === 'ON' ? 'Turn AC OFF' : 'Turn AC ON'}
                                                      </button>

                                                      {minibarTask && (
                                                          <button 
                                                              onClick={() => startAudit(v, 'Legacy Minibar', 'legacy_minibar')}
                                                              className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-2 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border shadow-sm ${
                                                                  isMinibarDone ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-purple-50 border-purple-200 text-[#6D2158]'
                                                              }`}
                                                          >
                                                              <Wine size={12} />
                                                              {isMinibarDone ? 'Minibar Done' : 'Count Minibar'}
                                                          </button>
                                                      )}
                                                  </div>

                                                  {isActive ? (
                                                      <div className="flex justify-between items-center bg-white border border-emerald-200 rounded-xl p-1.5 shadow-sm flex-wrap gap-2">
                                                        <div className="flex items-center gap-2 text-[#6D2158] font-black text-sm px-2">
                                                            <span className="relative flex h-2 w-2 mr-1">
                                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                            </span>
                                                            {formatTimer(cleaningElapsedSeconds)}
                                                        </div>
                                                        {taskState.reenter_reason && (
                                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] uppercase font-black tracking-widest shrink-0">
                                                                {taskState.reenter_reason}
                                                            </span>
                                                        )}
                                                        <button 
                                                            onClick={() => handleFinishRoom(v)}
                                                            className="bg-emerald-500 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm active:scale-95 flex items-center gap-1 ml-auto"
                                                        >
                                                            <CheckSquare size={14}/> Finish
                                                        </button>
                                                      </div>
                                                  ) : (
                                                      <div className="flex flex-col gap-2">
                                                        {taskState.has_morning_completed && (
                                                            <div className="flex items-center justify-between text-emerald-600 font-black uppercase tracking-widest text-[10px] md:text-xs py-2 bg-emerald-50 px-3 rounded-xl border border-emerald-100">
                                                              <span className="flex items-center gap-1.5"><CheckCircle2 size={14}/> Morning Cleaned</span>
                                                              <span>{taskState.morning_time}m</span>
                                                            </div>
                                                        )}
                                                        {taskState.has_night_completed && (
                                                            <div className="flex items-center justify-between text-indigo-600 font-black uppercase tracking-widest text-[10px] md:text-xs py-2 bg-indigo-50 px-3 rounded-xl border border-indigo-100">
                                                              <span className="flex items-center gap-1.5"><CheckCircle2 size={14}/> Evening Cleaned</span>
                                                              <span>{taskState.night_time}m</span>
                                                            </div>
                                                        )}
                                                        
                                                        {(isDND || isRefused) && (
                                                            <div className={`flex items-center justify-between font-black uppercase tracking-widest text-[10px] md:text-xs py-2 px-1 ${isDND ? 'text-rose-600' : 'text-orange-600'}`}>
                                                              <span className="flex items-center gap-1.5">
                                                                {isDND ? <DoorClosed size={14}/> : <X size={14}/>} 
                                                                {isDND ? 'DND Logged' : 'Service Refused'}
                                                              </span>
                                                              <button onClick={() => resetRoomStatus(v)} className="text-slate-400 hover:text-slate-600 underline text-[9px] md:text-[10px]">Undo</button>
                                                            </div>
                                                        )}

                                                        {/* Hide start button only if CURRENT shift is completed */}
                                                        {!isCompleted && (
                                                            <button 
                                                              onClick={() => setReenterModal({ isOpen: true, villa: v })}
                                                              disabled={!!activeCleaningVilla}
                                                              className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                                                                  activeCleaningVilla 
                                                                    ? 'bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed' 
                                                                    : 'bg-[#6D2158] text-white hover:bg-[#5a1b49] active:scale-95'
                                                              }`}
                                                            >
                                                              <Play size={14}/> {isNightShift ? 'Start Evening Service' : 'Start Morning Service'}
                                                            </button>
                                                        )}

                                                        {!isCompleted && (
                                                          <div className="flex gap-2">
                                                            <button 
                                                              onClick={() => handleDND(v)}
                                                              disabled={!!activeCleaningVilla}
                                                              className="flex-1 py-2.5 rounded-xl bg-rose-50 text-rose-600 font-black uppercase tracking-widest text-[9px] md:text-[10px] border border-rose-100 flex items-center justify-center gap-1 hover:bg-rose-100 transition-all active:scale-95 disabled:opacity-50"
                                                              title="Do Not Disturb"
                                                            >
                                                              <DoorClosed size={12}/> DND
                                                            </button>
                                                            
                                                            <button 
                                                              onClick={() => handleRefused(v)}
                                                              disabled={!!activeCleaningVilla}
                                                              className="flex-1 py-2.5 rounded-xl bg-orange-50 text-orange-600 font-black uppercase tracking-widest text-[9px] md:text-[10px] border border-orange-100 flex items-center justify-center gap-1 hover:bg-orange-100 transition-all active:scale-95 disabled:opacity-50"
                                                              title="Service Refused by Guest"
                                                            >
                                                              <X size={12}/> Refused
                                                            </button>
                                                          </div>
                                                        )}
                                                      </div>
                                                  )}
                                                </div>

                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <p className="text-slate-400 font-bold text-sm">No rooms assigned for cleaning today.</p>
                                </div>
                            )}
                        </div>

                        {/* --- EXPIRY & REFILL AUDIT CARD --- */}
                        {expiryAssignedVillas.length > 0 && (
                            <div className="bg-rose-50 p-4 md:p-6 rounded-3xl shadow-sm border border-rose-100 animate-in slide-in-from-bottom-3">
                                <div className="mb-4 flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg md:text-xl font-bold text-rose-800 mb-1 flex items-center gap-2"><AlertTriangle size={18}/> Expiry & Refills</h3>
                                        <p className="text-[10px] md:text-xs text-rose-600/70 font-medium">Check these villas for targeted items.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                    {expiryAssignedVillas.map(villa => {
                                        const vData = expiryVillaData[villa];
                                        const status = vData?.status;
                                        
                                        const isNeedsRefill = status === 'Removed';
                                        const isSent = status === 'Sent';
                                        const isDone = status === 'All OK' || status === 'Refilled';

                                        return (
                                            <button 
                                                key={villa}
                                                onClick={() => startExpiryAudit(villa)}
                                                className={`aspect-square rounded-2xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${
                                                    isDone ? 'bg-emerald-50 border-emerald-500 text-emerald-700 hover:bg-emerald-100' : 
                                                    isSent ? 'bg-indigo-100 border-indigo-400 text-indigo-700 animate-pulse' : 
                                                    isNeedsRefill ? 'bg-amber-100 border-amber-400 text-amber-700 animate-pulse' : 
                                                    'bg-white border-rose-200 text-rose-700 hover:border-rose-400 hover:shadow-md'
                                                }`}
                                            >
                                                {isDone && <CheckCircle2 size={14} className="absolute top-2 right-2 text-emerald-500"/>}
                                                <span className={`font-black ${villa.includes('-') ? 'text-xl' : 'text-2xl md:text-3xl'}`}>{villa}</span>
                                                <span className="text-[9px] md:text-[10px] font-bold uppercase mt-1 opacity-60">
                                                    {isDone ? 'Done' : isSent ? 'Sent' : isNeedsRefill ? 'Refill' : 'Pending'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* --- DYNAMIC UNIVERSAL INVENTORY CARDS --- */}
                        {Object.entries(universalTasks)
                            .filter(([taskType]) => taskType !== 'Legacy Minibar') // HIDE MINIBAR FROM BOTTOM GRID
                            .map(([taskType, assignments]) => {
                            return (
                                <div key={taskType} className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                                                <PackageSearch size={18} className="text-[#6D2158]"/> {taskType} Count
                                            </h3>
                                            <p className="text-[10px] md:text-xs text-slate-400 font-medium">Tap a location to begin auditing.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                                        {assignments.map(task => {
                                            const isDone = task.status === 'Submitted';
                                            return (
                                                <button 
                                                    key={task.villa_number}
                                                    onClick={() => startAudit(task.villa_number, taskType, task.schedule_id)}
                                                    className={`aspect-square rounded-2xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${isDone ? 'bg-emerald-50 border-emerald-400 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#6D2158] hover:shadow-md'}`}
                                                >
                                                    {isDone && <CheckCircle2 size={14} className="absolute top-2 right-2 text-emerald-500"/>}
                                                    <span className={`font-black ${task.villa_number.includes('-') ? 'text-xl' : 'text-2xl md:text-3xl'}`}>{task.villa_number}</span>
                                                    <span className="text-[9px] md:text-[10px] font-bold uppercase mt-1 opacity-60">{isDone ? 'Done' : 'Pending'}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )
                        })}

                        {/* EMPTY STATE IF LITERALLY NO TASKS OF ANY KIND */}
                        {myCleaningVillas.length === 0 && Object.keys(universalTasks).length === 0 && expiryAssignedVillas.length === 0 && (
                            <div className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm max-w-lg mx-auto mt-10">
                                <CheckCircle size={40} className="mx-auto text-emerald-300 mb-3"/>
                                <p className="font-bold text-slate-500">You have no active tasks right now.</p>
                            </div>
                        )}

                    </div>
                )}
            </>
        )}

        {/* --- STEP 3: ENTRY GRID (ROUTER) --- */}
        {step === 3 && currentHost && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-8 duration-300">
                
                {/* Router Header */}
                <div className={`${isExpiryMode ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-white border-slate-100'} p-4 md:p-6 rounded-3xl shadow-sm border mb-4 md:mb-6 flex flex-col gap-4`}>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => { setStep(2); setIsExpiryMode(false); }} className={`p-2.5 md:p-3 rounded-full transition-colors ${isExpiryMode ? 'bg-white hover:bg-rose-100 text-rose-600' : 'bg-slate-50 hover:bg-slate-100 text-slate-500'}`}><ChevronLeft size={18}/></button>
                            <div>
                                <h2 className={`text-xl md:text-2xl font-black ${isExpiryMode ? 'text-rose-700' : 'text-[#6D2158]'}`}>{selectedVilla}</h2>
                                <p className={`text-[10px] md:text-xs font-bold uppercase tracking-widest mt-0.5 ${isExpiryMode ? 'text-rose-500' : 'text-slate-400'}`}>
                                    {isExpiryMode 
                                        ? 'Targeted Tasks' 
                                        : (activeTaskType === 'Legacy Minibar' ? `${format(getDhakaTime(), 'MMMM')} Minibar Inventory` : `${activeTaskType} Audit`)
                                    }
                                </p>
                            </div>
                        </div>
                        
                        {!isExpiryMode && (
                            <button onClick={() => setShowGuideModal(true)} className="p-2 md:p-3 text-slate-400 hover:text-[#6D2158] hover:bg-purple-50 rounded-xl transition-colors active:scale-95" title="How to Count">
                                <Info size={20}/>
                            </button>
                        )}
                    </div>

                    {/* ALWAYS VISIBLE CLEANING & AC CONTROLS FOR THIS VILLA */}
                    {(() => {
                        const v = selectedVilla.replace('-1', '').replace('-2', '');
                        const isVilla = /^\d+$/.test(v); 
                        
                        if (!isVilla) return null;

                        const cardData = getVillaCardData(v);
                        const taskState = cleaningTasks[v] || { status: 'Pending', morning_time: 0, night_time: 0, has_morning_completed: false, has_night_completed: false };
                        const isActive = v === activeCleaningVilla;
                        const isCompleted = taskState.status === 'Completed';

                        return (
                            <div className="flex flex-col md:flex-row items-center gap-2 pt-3 border-t border-slate-200/60 mt-1">
                                <button 
                                    onClick={() => handleAcStatusChange(v, cardData.acStatus === 'ON' ? 'OFF' : 'ON')}
                                    className={`w-full md:flex-1 py-3 md:py-2 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                                        cardData.acStatus === 'ON' 
                                            ? 'bg-rose-50 border-rose-200 text-rose-700' 
                                            : 'bg-emerald-500 border-emerald-600 text-white'
                                    }`}
                                >
                                    <Wind size={14} className={`shrink-0 ${cardData.acStatus === 'ON' ? 'animate-pulse' : ''}`}/>
                                    {cardData.acStatus === 'ON' ? 'AC is ON (Tap to Turn OFF)' : 'AC is OFF (Tap to Turn ON)'}
                                </button>

                                {isActive ? (
                                    <div className="w-full md:flex-1 flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded-xl p-1.5 shadow-sm">
                                        <div className="flex items-center gap-2 text-emerald-700 font-black text-[10px] px-3 uppercase tracking-widest">
                                            <span className="relative flex h-2 w-2 mr-1">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                            {formatTimer(cleaningElapsedSeconds)}
                                        </div>
                                        <button 
                                            onClick={() => handleFinishRoom(v)}
                                            className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm active:scale-95 flex items-center gap-1"
                                        >
                                            <CheckSquare size={14}/> Finish
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setReenterModal({ isOpen: true, villa: v })}
                                        disabled={!!activeCleaningVilla}
                                        className={`w-full md:flex-1 py-3 md:py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all shadow-md ${
                                            activeCleaningVilla 
                                            ? 'bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed' 
                                            : isCompleted ? 'bg-slate-800 text-white hover:bg-slate-700 active:scale-95' : 'bg-[#6D2158] text-white hover:bg-[#5a1b49] active:scale-95'
                                        }`}
                                    >
                                        <Play size={14}/> {isCompleted ? 'Re-enter Room' : (isNightShift ? 'Start Evening Service' : 'Start Morning Service')}
                                    </button>
                                )}
                            </div>
                        );
                    })()}
                </div>

                {/* UI Content based on Mode */}
                {isExpiryMode ? (
                    ['Removed', 'Sent', 'Refilled'].includes(expiryVillaData[selectedVilla]?.status) ? (
                        
                        // --- AWAITING REFILL / REFILLED SCREEN ---
                        <div className="space-y-4 pb-40 animate-in fade-in">
                            <div className={`${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'bg-indigo-50 border-indigo-200' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'} border p-6 md:p-8 rounded-3xl text-center shadow-sm mb-6 relative`}>
                                <button onClick={handleEditRemovals} className={`absolute top-4 right-4 p-2 bg-white rounded-full shadow-sm transition-colors ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'text-indigo-600 hover:bg-indigo-100' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'text-blue-600 hover:bg-blue-100' : 'text-amber-600 hover:bg-amber-100'}`} title="Edit Removals">
                                    <Edit3 size={14} />
                                </button>
                                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'bg-indigo-100 text-indigo-600' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                                    {expiryVillaData[selectedVilla]?.status === 'Sent' ? <CheckCircle size={24}/> : expiryVillaData[selectedVilla]?.status === 'Refilled' ? <CheckCircle2 size={24}/> : <AlertTriangle size={24}/>}
                                </div>
                                <h3 className={`text-xl md:text-2xl font-black tracking-tight ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'text-indigo-700' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'text-blue-700' : 'text-amber-700'}`}>
                                    {expiryVillaData[selectedVilla]?.status === 'Sent' ? 'Items Dispatched!' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'Refill Confirmed' : 'Awaiting Refill'}
                                </h3>
                                <p className={`text-xs md:text-sm font-medium mt-2 leading-relaxed ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'text-indigo-600' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'text-blue-600' : 'text-amber-600'}`}>
                                    {expiryVillaData[selectedVilla]?.status === 'Sent' ? 'The items have been sent to you. Please confirm when placed.' : 'Please adjust the counters below if you could not replace all items.'}
                                </p>
                            </div>
                                
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {(expiryVillaData[selectedVilla]?.removal_data || []).map((item: any) => {
                                    const masterItem = masterCatalog.find(c => c.article_number === item.article_number);
                                    const currentRefill = refillCounts[item.article_number] !== undefined ? refillCounts[item.article_number] : item.qty;
                                    const isNotRefilled = currentRefill === 0;
                                    const isPartial = currentRefill > 0 && currentRefill < item.qty;

                                    return (
                                        <div key={item.article_number} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${isNotRefilled ? 'border-rose-300 bg-rose-50/30' : isPartial ? 'border-amber-300' : 'border-slate-200'}`}>
                                            
                                            <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-3">
                                                {masterItem?.image_url ? <img src={masterItem.image_url} className={`w-full h-full object-contain drop-shadow-sm transition-all ${isNotRefilled ? 'grayscale opacity-50' : ''}`} /> : <Wine size={24} className="text-slate-300"/>}
                                            </div>
                                            
                                            <div className="flex flex-col flex-1 px-1 text-center">
                                                <h4 className="text-xs font-black text-slate-800 leading-tight line-clamp-2">{item.name}</h4>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Req: {item.qty}</p>
                                                
                                                {isNotRefilled && <span className="text-[9px] font-black text-rose-500 uppercase mt-1">Not Refilled</span>}
                                                {isPartial && <span className="text-[9px] font-black text-amber-500 uppercase mt-1">Partial</span>}
                                            </div>

                                            <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                                                <button onClick={() => updateRefillCount(item.article_number, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={14}/></button>
                                                <span className={`font-black text-base ${isNotRefilled ? 'text-rose-600' : 'text-emerald-600'}`}>{currentRefill}</span>
                                                <button onClick={() => updateRefillCount(item.article_number, 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-600 hover:text-emerald-600 active:scale-95 transition-all"><Plus size={14}/></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            <div className="fixed bottom-20 md:bottom-0 left-0 right-0 md:left-64 p-3 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                                <div className="max-w-5xl mx-auto">
                                    <button 
                                        onClick={confirmExpiryRefill} 
                                        disabled={isSaving || expiryVillaData[selectedVilla]?.status === 'Removed'} 
                                        className={`w-full py-4 text-white rounded-xl font-black uppercase tracking-widest text-xs md:text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${
                                            expiryVillaData[selectedVilla]?.status === 'Removed' ? 'bg-slate-400 shadow-none cursor-not-allowed' :
                                            expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'bg-blue-600 shadow-blue-600/20' : 
                                            'bg-emerald-500 shadow-emerald-500/20'}`}
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={20}/> : 
                                         expiryVillaData[selectedVilla]?.status === 'Removed' ? <><Clock size={16}/> Waiting for Dispatch</> :
                                        <><CheckCircle2 size={16}/> {expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'Update Confirmation' : 'Confirm Replacements'}</>}
                                    </button>
                                </div>
                            </div>
                        </div>

                    ) : (

                        // --- RECORD REMOVAL SCREEN (Split Sections) ---
                        <div className="space-y-6 pb-40 animate-in fade-in">
                            {groupedTargets.expiry.length === 0 && groupedTargets.refill.length === 0 ? (
                                <p className="text-center font-bold text-slate-400 italic mt-10">No targets set by admin.</p>
                            ) : (
                                <>
                                    {/* EXPIRY & MISSING CHECKS */}
                                    {groupedTargets.expiry.length > 0 && (
                                        <div>
                                            <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <AlertTriangle size={14}/> Expiry & Missing Checks
                                            </h3>
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                                {groupedTargets.expiry.map((t: any) => {
                                                    const key = t.article_number;
                                                    const masterItem = masterCatalog.find(c => c.article_number === t.article_number);
                                                    const qty = expiryCounts[key] || 0;

                                                    return (
                                                        <div key={key} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${qty > 0 ? 'border-rose-400 ring-4 ring-rose-50' : 'border-slate-200'}`}>
                                                            
                                                            <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-3">
                                                                {masterItem?.image_url ? <img src={masterItem.image_url} className="w-full h-full object-contain drop-shadow-sm" /> : <Wine size={24} className="text-slate-300"/>}
                                                            </div>
                                                            
                                                            <div className="flex flex-col flex-1 px-1 text-center">
                                                                <h4 className="text-xs font-black text-slate-800 leading-tight line-clamp-2">{t.article_name}</h4>
                                                                
                                                                {t.dates && t.dates.length > 0 ? (
                                                                    <div className="flex flex-wrap justify-center gap-1 mt-1">
                                                                        {t.dates.map((d: string) => (
                                                                            <span key={d} className="text-[8px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                                                                {format(parseISO(d), 'dd MMM')}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="mt-1">
                                                                        <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                                            Missing Check
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                                                                <button onClick={() => updateExpiryCount(key, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={14}/></button>
                                                                <span className={`font-black text-base ${qty > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{qty}</span>
                                                                <button onClick={() => updateExpiryCount(key, 1)} className="w-8 h-8 flex items-center justify-center bg-rose-600 rounded-md shadow-sm text-white active:scale-95 transition-all"><Plus size={14}/></button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* SEPARATE REFILL TASKS */}
                                    {groupedTargets.refill.length > 0 && (
                                        <div className="pt-4 border-t border-slate-200">
                                            <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <RefreshCw size={12}/> Pure Refill Tasks
                                            </h3>
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                                {groupedTargets.refill.map((t: any) => {
                                                    const key = t.article_number;
                                                    const masterItem = masterCatalog.find(c => c.article_number === t.article_number);
                                                    const qty = expiryCounts[key] || 0;

                                                    return (
                                                        <div key={key} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${qty > 0 ? 'border-emerald-400 ring-4 ring-emerald-50' : 'border-slate-200'}`}>
                                                            <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-3">
                                                                {masterItem?.image_url ? <img src={masterItem.image_url} className="w-full h-full object-contain drop-shadow-sm" /> : <Wine size={24} className="text-slate-300"/>}
                                                            </div>
                                                            <div className="flex flex-col flex-1 px-1 text-center">
                                                                <h4 className="text-xs font-black text-slate-800 leading-tight line-clamp-2">{t.article_name}</h4>
                                                                <div className="mt-1">
                                                                    <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                                                        Refill Needed
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                                                                <button onClick={() => updateExpiryCount(key, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={14}/></button>
                                                                <span className={`font-black text-base ${qty > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{qty}</span>
                                                                <button onClick={() => updateExpiryCount(key, 1)} className="w-8 h-8 flex items-center justify-center bg-emerald-600 rounded-md shadow-sm text-white active:scale-95 transition-all"><Plus size={14}/></button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                            
                            <div className="fixed bottom-20 md:bottom-0 left-0 right-0 md:left-64 p-3 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                                <div className="max-w-5xl mx-auto flex gap-2 md:gap-3">
                                    <button 
                                        onClick={() => submitExpiryRemovals('All OK')} 
                                        disabled={isSaving} 
                                        className="flex-1 py-4 text-emerald-700 bg-emerald-50 rounded-xl font-black uppercase tracking-widest border border-emerald-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 md:gap-1 leading-none"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={20}/> : <><span className="text-[10px] md:text-xs">{expiryVillaData[selectedVilla]?.status === 'All OK' ? 'Confirm OK' : 'None Found'}</span><span className="text-[8px] opacity-70">(All OK)</span></>}
                                    </button>
                                    <button 
                                        onClick={() => submitExpiryRemovals('Removed')} 
                                        disabled={isSaving || (groupedTargets.expiry.length === 0 && groupedTargets.refill.length === 0) || Object.values(expiryCounts).every(v => v === 0)} 
                                        className="flex-[1.5] py-4 text-white bg-rose-600 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-rose-600/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 md:gap-1 leading-none disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={20}/> : <><span className="text-[10px] md:text-xs">Record Actions</span><span className="text-[8px] opacity-70">(Needs Refill)</span></>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                ) : (
                    // --- STANDARD INVENTORY MODE (UNIVERSAL + KEYPAD) ---
                    <>
                        {/* SEARCH BAR */}
                        <div className="relative mb-3 md:mb-4">
                            <Search className="absolute left-4 top-3 text-slate-400" size={16}/>
                            <input 
                                type="text" 
                                placeholder="Search items..." 
                                className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158] shadow-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-4 top-3 text-slate-300 hover:text-slate-500">
                                    <X size={16}/>
                                </button>
                            )}
                        </div>

                        {/* DYNAMIC VILLA LOCATION TABS */}
                        {locationFilters.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-2 border-b border-slate-100">
                                {locationFilters.map(loc => (
                                    <button 
                                        key={loc} 
                                        onClick={() => setActiveLocation(loc)}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border shadow-sm flex items-center gap-1.5 ${activeLocation === loc ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                                    >
                                        {loc !== 'All' && loc !== 'Unassigned' && <MapPin size={10}/>}
                                        {loc}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 pb-40">
                            {displayCatalog.length === 0 ? (
                                <div className="col-span-full py-10 text-center text-slate-400 font-bold">No items found.</div>
                            ) : displayCatalog.map(item => {
                                const qty = counts[item.article_number] || 0;
                                const isKeypadActive = keypadTarget === item.article_number;
                                
                                return (
                                <div key={item.article_number} className={`bg-white rounded-2xl p-2.5 shadow-sm border flex flex-col gap-2 relative transition-all ${qty > 0 || isKeypadActive ? 'border-[#6D2158] ring-2 ring-[#6D2158]/10' : 'border-slate-200'}`}>
                                    
                                    <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center p-3 relative">
                                        {item.image_url ? <img src={item.image_url} className="w-full h-full object-contain drop-shadow-sm"/> : <Wine size={24} className="text-slate-300"/>}
                                    </div>
                                    
                                    <div className="flex flex-col flex-1 px-1">
                                        <h4 className="text-[10px] font-black text-slate-800 leading-tight line-clamp-2">{item.generic_name || item.article_name}</h4>
                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">{item.category}</p>
                                            {item.villa_location && activeLocation === 'All' && (
                                                <p className="text-[7px] font-black text-[#6D2158] uppercase tracking-widest bg-purple-50 px-1.5 py-0.5 rounded truncate max-w-[60px]">{item.villa_location}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between bg-slate-50 rounded-lg p-1 border border-slate-200 mt-auto">
                                        <button onClick={() => updateCount(item.article_number, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all">
                                            <Minus size={14}/>
                                        </button>
                                        
                                        <button 
                                            onClick={() => openKeypad(item.article_number)} 
                                            className={`w-10 text-center font-black text-lg py-1 rounded-md transition-colors ${qty > 0 ? 'text-[#6D2158]' : 'text-slate-400 hover:bg-slate-200'} ${isKeypadActive ? 'bg-[#6D2158]/10 text-[#6D2158] ring-1 ring-[#6D2158]' : ''}`}
                                        >
                                            {qty}
                                        </button>

                                        <button onClick={() => updateCount(item.article_number, 1)} className="w-8 h-8 flex items-center justify-center bg-[#6D2158] rounded-md shadow-sm text-white active:scale-95 transition-all">
                                            <Plus size={14}/>
                                        </button>
                                    </div>
                                </div>
                            )})}
                        </div>

                        {/* Fixed Bottom Submit Bar */}
                        <div className="fixed bottom-20 md:bottom-0 left-0 right-0 md:left-64 p-3 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                            <div className="max-w-5xl mx-auto">
                                <button 
                                    onClick={requestSaveInventory} 
                                    disabled={isSaving} 
                                    className="w-full py-4 text-white bg-[#6D2158] shadow-purple-900/20 rounded-xl font-black uppercase tracking-widest text-xs md:text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={20}/> : <><Save size={16}/> {activeTaskType === 'Legacy Minibar' ? 'Confirm Minibar Inventory' : 'Submit Audit'}</>}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        )}

        {/* --- RE-ENTER REASON MODAL ⚡ --- */}
        {reenterModal.isOpen && (
            <div className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 text-center">
                    <h3 className="text-xl md:text-2xl font-black mb-2 tracking-tight text-[#6D2158]">
                        Service Room {reenterModal.villa}
                    </h3>
                    <p className="text-xs md:text-sm text-slate-500 font-medium mb-6 md:mb-8 leading-relaxed">
                        Please select the type of service for this room.
                    </p>
                    <div className="flex flex-col gap-2.5">
                        {['Morning Service', 'TD Service', 'Arrival', 'Dep', 'Minibar Refill', 'Guest Request', 'Other'].map(reason => (
                            <button 
                                key={reason}
                                onClick={() => {
                                    handleStartService(reenterModal.villa, reason);
                                    setReenterModal({isOpen: false, villa: ''});
                                }}
                                className="w-full py-3.5 bg-slate-50 text-slate-700 hover:bg-[#6D2158] hover:text-white rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all border border-slate-200 hover:border-[#6D2158]"
                            >
                                {reason}
                            </button>
                        ))}
                        <button 
                            onClick={() => setReenterModal({ isOpen: false, villa: '' })} 
                            className="w-full mt-2 py-3.5 bg-white text-rose-500 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- BILINGUAL GUIDE MODAL --- */}
        {showGuideModal && (
            <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 shrink-0 shadow-inner">
                        <Info size={24} />
                    </div>
                    <h3 className="text-lg md:text-xl font-black text-slate-800 mb-4 tracking-tight text-center shrink-0">
                        How to count / <span style={{ fontFamily: 'Faruma, sans-serif', fontWeight: 'normal' }}>ގުނާނެ ގޮތް</span>
                    </h3>
                    
                    <div className="text-xs md:text-sm text-slate-600 font-medium mb-6 space-y-4 bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-100 overflow-y-auto custom-scrollbar flex-1">
                        <div className="text-left">
                            <p className="font-black text-slate-800 mb-2">🇬🇧 English:</p>
                            <div className="space-y-3">
                                <p>1. This is an inventory count. You must count exactly what is physically present. If there is 1 item, enter <b className="text-slate-800 text-sm">'1'</b>. If it is missing or empty, enter <b className="text-slate-800 text-sm">'0'</b>.</p>
                                <p>2. Use the <b className="text-slate-800 text-sm">Location Tabs</b> at the top (e.g. Wardrobe, Bathroom) to check items room-by-room so nothing is missed.</p>
                                <p>3. Tap the <b className="text-[#6D2158] text-sm">large number</b> to open the fast keypad, or use the <b className="text-slate-800 text-sm">+/-</b> buttons to adjust the count.</p>
                                <p>4. Make sure you have checked every location before tapping <b className="text-[#6D2158] text-sm">Submit Audit</b>.</p>
                            </div>
                        </div>
                        <div className="border-t border-slate-200 pt-4" dir="rtl">
                            <p className="text-slate-800 mb-3 font-bold" style={{ fontFamily: 'Faruma, sans-serif' }}>🇲🇻 ދިވެހި:</p>
                            <div className="space-y-3 leading-loose text-justify" style={{ fontFamily: 'Faruma, sans-serif' }}>
                                <p>1. މިއީ އެސެޓް އިންވެންޓުރީއެވެ. ހުރިހާ އެންމެންވެސް އިންވެންޓްރީގައި ޖަހާނީ އެވަގުތު އެތަނުގައި ހުރި ތަކެތީގެ ސީދާ އަދަދެވެ. އެއްޗެއް ހުރިނަމަ <span className="font-bold text-slate-800 text-base">'1'</span>  ނުވަތަ އެހުރި އަދަދެއް ޖަހާށެވެ. އަދި އެއްޗެއް  ހުސްވެފައިވާނަމަ <span className="font-bold text-slate-800 text-base">'0'</span> ޖަހާށެވެ.</p>
                                <p>2. އިންވެންޓްރީ ނެގުމަށް ފަސޭހަ ކުރުމަށްޓަކައި، މަތީގައިވާ <span className="font-bold text-slate-800 text-base">Location Tabs</span> (މިސާލަކަށް: ވެނިޓީ އޭރިއާ) ބޭނުންކޮށްގެން ލޮކޭޝަންތައް ވަކިވަކިން ބަލައި ފާސްކުރާށެވެ.</p>
                                <p>3. ކީޕޭޑް ބޭނުންކޮށްގެން އަވަހަށް ނަންބަރު ޖެހުމަށްޓަކައި ބޮޑުކޮށް ފެންނަ <span className="font-bold text-[#6D2158] text-base">ނަންބަރަށް</span> ފިއްތާލާށެވެ. ނުވަތަ <span className="font-bold text-slate-800 text-base">+/-</span> ބަޓަން ބޭނުންކޮށްގެން އަދަދުތަކަށް ބަދަލު ގެންނާށެވެ.</p>
                                <p>4. <span className="font-bold text-[#6D2158] text-base">'ސަބްމިޓް އޮޑިޓް'</span> އަށް ފިއްތުމުގެ ކުރިން، ހުރިހާ ތަންތަނެއް ބަލައި ފާސްކުރެވުނުކަން ޔަގީންކުރާށެވެ.</p>
                            </div>
                        </div>
                    </div>

                    <button onClick={closeGuide} className="w-full py-4 text-white bg-[#6D2158] rounded-xl font-black uppercase tracking-wider text-xs shadow-lg shadow-purple-900/20 active:scale-95 transition-all shrink-0 flex items-center justify-center gap-2">
                        I Understand <span className="opacity-50">/</span> <span style={{ fontFamily: 'Faruma, sans-serif', fontWeight: 'normal', fontSize: '14px' }} className="mt-1">ވިސްނިއްޖެ</span>
                    </button>
                </div>
            </div>
        )}

        {/* --- CUSTOM KEYPAD OVERLAY --- */}
        {keypadTarget && (
            <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
                <div className="absolute inset-0" onClick={saveKeypadValue}></div>
                <div className="bg-[#FDFBFD] w-full rounded-t-[2rem] p-5 md:p-6 pb-safe shadow-2xl animate-in slide-in-from-bottom-8 relative z-10 max-w-md mx-auto">
                    
                    <div className="flex justify-between items-center mb-5">
                        <div>
                            <h4 className="font-black text-slate-800 text-base">Direct Input</h4>
                            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                {activeCatalog.find(c => c.article_number === keypadTarget)?.generic_name || 'Item'}
                            </p>
                        </div>
                        <div className="text-3xl font-black text-[#6D2158] bg-purple-50 px-5 py-1.5 rounded-xl border border-purple-100">
                            {keypadValue}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
                        {[1,2,3,4,5,6,7,8,9].map(num => (
                            <button key={num} onClick={() => handleKeypadPress(String(num))} className="py-3 md:py-4 bg-white rounded-xl shadow-sm border border-slate-200 text-xl md:text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">
                                {num}
                            </button>
                        ))}
                        <button onClick={() => handleKeypadPress('CLR')} className="py-3 md:py-4 bg-rose-50 rounded-xl border border-rose-100 text-xs font-black text-rose-600 uppercase tracking-widest active:scale-95 transition-all">
                            Clear
                        </button>
                        <button onClick={() => handleKeypadPress('0')} className="py-3 md:py-4 bg-white rounded-xl shadow-sm border border-slate-200 text-xl md:text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">
                            0
                        </button>
                        <button onClick={() => handleKeypadPress('DEL')} className="py-3 md:py-4 bg-slate-100 rounded-xl border border-slate-200 text-xs font-black text-slate-600 uppercase tracking-widest active:scale-95 transition-all">
                            Del
                        </button>
                    </div>

                    <button onClick={saveKeypadValue} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all">
                        Confirm Amount
                    </button>
                </div>
            </div>
        )}

        {/* --- CUSTOM CONFIRMATION MODAL --- */}
        {confirmModal.isOpen && (
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 text-center">
                    <h3 className={`text-xl md:text-2xl font-black mb-2 tracking-tight ${confirmModal.isDestructive ? 'text-rose-600' : 'text-[#6D2158]'}`}>
                        {confirmModal.title}
                    </h3>
                    <p className="text-xs md:text-sm text-slate-500 font-medium mb-6 md:mb-8 leading-relaxed">
                        {confirmModal.message}
                    </p>
                    <div className="flex flex-col gap-2.5">
                        <button onClick={confirmModal.onConfirm} className={`w-full py-3.5 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2 ${confirmModal.isDestructive ? 'bg-rose-600 shadow-rose-200' : 'bg-[#6D2158] shadow-purple-200'}`}>
                            <Save size={16}/> {confirmModal.confirmText}
                        </button>
                        <button onClick={() => setConfirmModal(prev => ({...prev, isOpen: false}))} className="w-full py-3.5 bg-slate-50 text-slate-500 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all hover:bg-slate-100">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- SUCCESS OVERLAY --- */}
        {showSuccess && (
            <div className="fixed inset-0 z-[90] bg-emerald-600 flex flex-col items-center justify-center text-white p-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-5">
                    <CheckCircle2 size={48} className="text-white"/>
                </div>
                <h2 className="text-3xl font-black text-center mb-2">Saved!</h2>
                <p className="text-center font-medium text-emerald-100 mb-10 text-sm md:text-base">Location {selectedVilla} record has been logged.</p>
                
                <button onClick={resetFlow} className="px-8 py-4 bg-white text-emerald-700 rounded-xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all hover:scale-105">
                    Return to Hub
                </button>
            </div>
        )}

      </div>
    </div>
  );
}
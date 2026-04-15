"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Save, CheckCircle2, Loader2, ChevronLeft, RefreshCw, CheckCircle, CheckSquare
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

// --- IMPORTED GLOBAL TIME ENGINE ---
import { getDhakaTime, getDhakaDateStr } from '@/lib/dateUtils';

// --- SUBCOMPONENTS ---
import RoomCleaningGrid from './_components/RoomCleaningGrid';
import ExpiryAuditGrid from './_components/ExpiryAuditGrid';
import AssetInventoryGrid from './_components/AssetInventoryGrid';
import MinibarInventoryGrid from './_components/MinibarInventoryGrid';

export type Host = { id: string; full_name: string; host_id: string; };
export type MasterItem = { article_number: string; article_name: string; generic_name?: string; category: string; image_url?: string; inventory_type?: string; is_minibar_item: boolean; villa_location?: string; };

export type UniversalTask = {
    schedule_id: string;
    inventory_type: string;
    villa_number: string;
    status: string;
};

export type GuestRecord = {
    villa_number: string;
    status: string;
    arrival_time?: string;
    departure_time?: string;
    guest_name?: string;
};

export type ACRecord = {
    villa_number: string;
    status: string;
};

// --- CLEANING TASK TYPE ---
export type CleaningTask = {
    villa_number: string;
    status: 'Pending' | 'In Progress' | 'Completed' | 'DND' | 'Refused';
    start_time?: string;
    raw_start_time?: string; 
    end_time?: string;
    time_spent?: string;
    reenter_reason?: string; 
    session_history: any[]; // ⚡ Full session history now exposed to UI
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

const triggerSystemNotification = (villa: string) => {
    const title = "⏰ Service Time Alert";
    const options = {
        body: `Villa ${villa} timer has been running too long. Did you forget to finish it?`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [500, 250, 500, 250, 500, 250, 500],
        requireInteraction: true
    };

    if (typeof window !== 'undefined') {
        if ('vibrate' in navigator) navigator.vibrate(options.vibrate);
        if ('Notification' in window && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, options);
                }).catch(() => { new Notification(title, options); });
            } else { new Notification(title, options); }
        }
    }
};

export default function MyTasksHub() {
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<2 | 3>(2);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [currentHost, setCurrentHost] = useState<Host | null>(null);
  const [dailyTask, setDailyTask] = useState<{shift_type?: string, shift_note?: string} | null>(null);

  const [myCleaningVillas, setMyCleaningVillas] = useState<string[]>([]);
  const [guestData, setGuestData] = useState<GuestRecord[]>([]);
  const [acData, setAcData] = useState<ACRecord[]>([]);
  
  const [cleaningTasks, setCleaningTasks] = useState<Record<string, CleaningTask>>({});
  const [activeCleaningVilla, setActiveCleaningVilla] = useState<string | null>(null);
  const [cleaningElapsedSeconds, setCleaningElapsedSeconds] = useState(0);
  const [reenterModal, setReenterModal] = useState<{isOpen: boolean, villa: string}>({isOpen: false, villa: ''}); 
  const [hasWarnedTimer, setHasWarnedTimer] = useState(false); 

  const [editServiceModal, setEditServiceModal] = useState<{isOpen: boolean, villa: string, serviceType: string, startTime: string, endTime: string, duration: number}>({isOpen: false, villa: '', serviceType: '', startTime: '', endTime: '', duration: 0});

  const [universalTasks, setUniversalTasks] = useState<Record<string, UniversalTask[]>>({});
  const [activeTaskType, setActiveTaskType] = useState<string>(''); 
  const [activeScheduleId, setActiveScheduleId] = useState<string>('');
  const [masterCatalog, setMasterCatalog] = useState<MasterItem[]>([]);
  
  const [selectedVilla, setSelectedVilla] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeLocation, setActiveLocation] = useState('All');

  const [searchQuery, setSearchQuery] = useState('');
  const [sharedAssignments, setSharedAssignments] = useState<string[]>([]);

  const [isExpiryMode, setIsExpiryMode] = useState(false);
  const [expiryTargets, setExpiryTargets] = useState<any[]>([]);
  const [expiryAssignedVillas, setExpiryAssignedVillas] = useState<string[]>([]);
  const [expiryVillaData, setExpiryVillaData] = useState<Record<string, any>>({}); 
  const [expiryCounts, setExpiryCounts] = useState<Record<string, number>>({});
  const [refillCounts, setRefillCounts] = useState<Record<string, number>>({});

  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; confirmText: string; isDestructive: boolean; onConfirm: () => void;}>({ isOpen: false, title: '', message: '', confirmText: '', isDestructive: false, onConfirm: () => {} });

  const activeStartTime = activeCleaningVilla ? cleaningTasks[activeCleaningVilla]?.raw_start_time : null;

  // ⚡ TIMER LOGIC & 90-MINUTE AUTO-DISCONNECT
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const updateTimer = () => {
        if (activeStartTime) {
            const start = new Date(activeStartTime).getTime();
            if (!isNaN(start)) {
                const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
                
                // FORCE STOP AT 90 MINUTES
                if (elapsed >= 5400 && activeCleaningVilla) {
                     handleFinishRoom(activeCleaningVilla, true);
                } else {
                     setCleaningElapsedSeconds(elapsed);
                }
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

  // ⚡ BACKGROUND WAKE-UP CATCH (Handles locked phones)
  useEffect(() => {
      const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible' && activeStartTime && activeCleaningVilla) {
              const start = new Date(activeStartTime).getTime();
              const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
              
              if (elapsed >= 5400) {
                  handleFinishRoom(activeCleaningVilla, true);
              } else {
                  setCleaningElapsedSeconds(elapsed);
              }
          }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeStartTime, activeCleaningVilla]);

  useEffect(() => {
      if (cleaningElapsedSeconds > 2700 && !hasWarnedTimer && activeCleaningVilla) { // 45 Mins warning
          toast.error(`Reminder: Villa ${activeCleaningVilla} timer is at 45 minutes!`, { duration: 8000, icon: '⏰' });
          triggerSystemNotification(activeCleaningVilla);
          setHasWarnedTimer(true);
      } else if (cleaningElapsedSeconds === 0) {
          setHasWarnedTimer(false);
      }
  }, [cleaningElapsedSeconds, activeCleaningVilla, hasWarnedTimer]);

  useEffect(() => {
      if (editServiceModal.startTime && editServiceModal.endTime) {
          const [sh, sm] = editServiceModal.startTime.split(':').map(Number);
          const [eh, em] = editServiceModal.endTime.split(':').map(Number);
          let diff = (eh * 60 + em) - (sh * 60 + sm);
          if (diff < 0) diff += 24 * 60; 
          setEditServiceModal(prev => ({...prev, duration: diff}));
      }
  }, [editServiceModal.startTime, editServiceModal.endTime]);

  const formatTimer = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    if (h > 0) return `${h}:${m}:${s}`;
    return `${m}:${s}`;
  };

  const loadInitialData = useCallback(async (host: Host, isManualRefresh: boolean, silent = false) => {
      if (!silent) setIsLoading(true);
      const todayStr = getDhakaDateStr();
      const currentMonth = todayStr.substring(0, 7);

      const { data: allAtt } = await supabase.from('hsk_attendance').select('host_id, shift_type, shift_note').eq('date', todayStr);
      const att = allAtt?.find(a => a.host_id === host.id || a.host_id === host.host_id);
      if (att) setDailyTask(att as any);

      const { data: allAllocData } = await supabase.from('hsk_allocations').select('host_id, task_details').eq('report_date', todayStr);
      const allocData = allAllocData?.find(a => a.host_id === host.id || a.host_id === host.host_id);

      if (allocData && allocData.task_details) {
          const assignedCleanVillas = parseVillas(allocData.task_details, []);
          setMyCleaningVillas(assignedCleanVillas);

          const { data: allExistingLogs } = await supabase.from('hsk_cleaning_logs').select('*').eq('report_date', todayStr);
          const existingLogs = allExistingLogs?.filter(l => l.host_id === host.id || l.host_id === host.host_id);

          let activeV: string | null = null;
          const newTasksState: Record<string, CleaningTask> = {};

          assignedCleanVillas.forEach(v => {
              const dbLog = existingLogs?.find(l => l.villa_number === v);
              const localTimer = typeof window !== 'undefined' ? localStorage.getItem(`hk_timer_${v}`) : null;

              const isInProgressLocally = !!localTimer && dbLog?.status !== 'Completed' && dbLog?.status !== 'DND' && dbLog?.status !== 'Refused';
              const isActuallyInProgress = dbLog?.status === 'In Progress' || isInProgressLocally;

              if (isActuallyInProgress) activeV = v;
              if (localTimer && !isActuallyInProgress) localStorage.removeItem(`hk_timer_${v}`);

              let effectiveStatus = dbLog?.status || 'Pending';

              newTasksState[v] = { 
                  villa_number: v, status: isActuallyInProgress ? 'In Progress' : effectiveStatus as any, 
                  start_time: dbLog?.start_time ? format(parseISO(dbLog.start_time), 'hh:mm a') : (localTimer ? format(parseISO(localTimer), 'hh:mm a') : undefined),
                  raw_start_time: isActuallyInProgress ? (dbLog?.start_time || localTimer) : dbLog?.start_time,
                  time_spent: dbLog?.time_spent_minutes ? `${dbLog.time_spent_minutes}m` : undefined,
                  session_history: dbLog?.session_history || []
              };
          });
          setCleaningTasks(prev => ({ ...prev, ...newTasksState }));
          if (activeV) setActiveCleaningVilla(activeV);
      } else { setMyCleaningVillas([]); }

      const { data: gData } = await supabase.from('hsk_daily_summary').select('villa_number, status, arrival_time, departure_time, guest_name').eq('report_date', todayStr);
      if (gData) setGuestData(gData);

      const { data: aData } = await supabase.from('hsk_ac_tracker').select('villa_number, status');
      if (aData) setAcData(aData);

      const { data: activeSchedules } = await supabase.from('hsk_inventory_schedules').select('id, inventory_type').eq('status', 'Active');
      const taskMap: Record<string, UniversalTask[]> = {};

      if (activeSchedules && activeSchedules.length > 0) {
          const scheduleIds = activeSchedules.map(s => s.id);
          const { data: allAssignments } = await supabase.from('hsk_inventory_assignments').select('*').in('schedule_id', scheduleIds);
          const assignments = allAssignments?.filter(a => a.host_id === host.id || a.host_id === host.host_id);

          if (assignments) {
              assignments.forEach(a => {
                  if (!taskMap[a.inventory_type]) taskMap[a.inventory_type] = [];
                  taskMap[a.inventory_type].push({ schedule_id: a.schedule_id, inventory_type: a.inventory_type, villa_number: a.villa_number, status: a.status });
              });
              Object.values(taskMap).forEach(arr => { arr.sort((a,b) => (parseInt(a.villa_number) || 9999) - (parseInt(b.villa_number) || 9999)); });
          }
      }

      const { data: constData } = await supabase.from('hsk_constants').select('*').in('type', ['mb_inv_status', 'mb_active_period', 'double_mb_villas', 'expiry_inv_status']);
      const mbStatus = constData?.find(c => c.type === 'mb_inv_status')?.label || 'CLOSED';
      const mbPeriod = constData?.find(c => c.type === 'mb_active_period')?.label;
      const expiryStatus = constData?.find(c => c.type === 'expiry_inv_status')?.label || 'CLOSED';
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

              taskMap['Legacy Minibar'] = mbVillas.map(v => ({ schedule_id: 'legacy_minibar', inventory_type: 'Legacy Minibar', villa_number: v, status: completedMbVillas.has(v) ? 'Submitted' : 'Pending' }));
          }
      }
      setUniversalTasks(taskMap);

      const { data: expiryTargetData } = await supabase.from('hsk_expiry_targets').select('*').eq('month_period', currentMonth);
      if (expiryTargetData) setExpiryTargets(expiryTargetData);
      
      const { data: allExpAlloc } = await supabase.from('hsk_expiry_allocations').select('host_id, villas').eq('month_period', currentMonth);
      const expiryAllocRes = allExpAlloc?.find(a => a.host_id === host.id || a.host_id === host.host_id);
      
      if (expiryStatus === 'OPEN' && expiryAllocRes && expiryAllocRes.villas) {
          setExpiryAssignedVillas(parseVillas(expiryAllocRes.villas, dvList));
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
    if (catRes) setMasterCatalog(catRes);
  }, []);

  useEffect(() => {
    const sessionData = localStorage.getItem('hk_pulse_session');
    if (sessionData) {
        const parsed = JSON.parse(sessionData);
        const hostObj = { id: parsed.id, full_name: parsed.full_name, host_id: parsed.host_id || parsed.id }; 
        setCurrentHost(hostObj);
        loadInitialData(hostObj, false);
    } else { window.location.href = '/'; }
    setIsMounted(true);
    fetchCatalog();
  }, [loadInitialData, fetchCatalog]);

  const handleStartService = async (villa: string, reason?: string) => {
    if (activeCleaningVilla) { toast.error("Please finish or pause your current room first!"); return; }
    
    if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') Notification.requestPermission();
    }

    const now = new Date().toISOString();
    const todayStr = getDhakaDateStr();
    localStorage.setItem(`hk_timer_${villa}`, now);

    // ⚡ 17:00 CUTOFF FOR TURNDOWN
    const isTD = getDhakaTime().getHours() >= 17;
    let finalReason = reason;
    if (reason === 'Service' || !reason) {
        finalReason = isTD ? 'TD Service' : 'Morning Service';
    }

    setActiveCleaningVilla(villa);
    setCleaningTasks(prev => ({ ...prev, [villa]: { ...prev[villa], status: 'In Progress', start_time: format(parseISO(now), 'hh:mm a'), raw_start_time: now, reenter_reason: finalReason } }));
    toast.success(`Service Started: Room ${villa}`);

    const payload = { report_date: todayStr, villa_number: villa, host_id: currentHost?.host_id, host_name: currentHost?.full_name, status: 'In Progress', start_time: now, updated_at: now };
    const { data, error: updateError } = await supabase.from('hsk_cleaning_logs').update(payload).match({ report_date: todayStr, villa_number: villa }).select();
    if (updateError || !data || data.length === 0) {
        const { error: insertError } = await supabase.from('hsk_cleaning_logs').insert(payload);
        if (insertError) { toast.error("Database Error: Could not save start time to server."); resetRoomStatus(villa); }
    }
  };

  // ⚡ UPDATED TO ACCEPT isAutoStop OVERRIDE
  const handleFinishRoom = async (villa: string, isAutoStop = false) => {
    localStorage.removeItem(`hk_timer_${villa}`);
    
    let minutes = Math.max(1, Math.ceil(cleaningElapsedSeconds / 60));
    if (isAutoStop || minutes >= 90) {
        minutes = 90;
        isAutoStop = true;
    }

    const now = new Date().toISOString();
    const todayStr = getDhakaDateStr();

    setCleaningTasks(prev => {
        const currentTaskState = prev[villa];
        const sessionReason = currentTaskState?.reenter_reason || (getDhakaTime().getHours() >= 17 ? 'TD Service' : 'Morning Service');
        const sessionStart = currentTaskState?.start_time || format(parseISO(now), 'hh:mm a');
        const sessionEnd = format(parseISO(now), 'hh:mm a');
        const totalMinutes = (parseInt(currentTaskState?.time_spent || '0m') || 0) + minutes;

        const newSession = { reason: sessionReason, start: sessionStart, end: sessionEnd, duration: minutes, autoStopped: isAutoStop };
        const updatedHistory = [...(currentTaskState?.session_history || []), newSession];

        // Process database update in background
        supabase.from('hsk_cleaning_logs').select('session_history').eq('report_date', todayStr).eq('villa_number', villa).maybeSingle().then(({data}) => {
            const existingHistory = Array.isArray(data?.session_history) ? data.session_history : [];
            const dbHistory = [...existingHistory, newSession];
            const payload = { report_date: todayStr, villa_number: villa, host_id: currentHost?.host_id, host_name: currentHost?.full_name, status: 'Completed', end_time: now, time_spent_minutes: totalMinutes, session_history: dbHistory, updated_at: now };
            
            supabase.from('hsk_cleaning_logs').update(payload).match({ report_date: todayStr, villa_number: villa }).select().then(({data: updData}) => {
                if (!updData || updData.length === 0) supabase.from('hsk_cleaning_logs').insert(payload);
            });
        });

        if (isAutoStop) toast.error(`Timer for ${villa} auto-stopped at 90m limit.`, { duration: 6000 });
        else toast.success(`Service Completed: Room ${villa}`);

        setActiveCleaningVilla(null);
        setCleaningElapsedSeconds(0);

        return { 
            ...prev, 
            [villa]: { 
                ...prev[villa], 
                status: 'Completed', 
                end_time: sessionEnd, 
                time_spent: `${totalMinutes}m`, 
                session_history: updatedHistory, 
                reenter_reason: undefined 
            } 
        };
    });
  };

  const handleDND = async (villa: string) => {
    localStorage.removeItem(`hk_timer_${villa}`);
    const now = new Date().toISOString();
    setCleaningTasks(prev => ({ ...prev, [villa]: { ...prev[villa], status: 'DND', time_spent: undefined } }));
    toast.success(`DND Logged: Room ${villa}`);
    const payload = { report_date: getDhakaDateStr(), villa_number: villa, host_id: currentHost?.host_id, host_name: currentHost?.full_name, status: 'DND', dnd_time: now, updated_at: now };
    const { data, error } = await supabase.from('hsk_cleaning_logs').update(payload).match({ report_date: getDhakaDateStr(), villa_number: villa }).select();
    if (error || !data || data.length === 0) await supabase.from('hsk_cleaning_logs').insert(payload);
  };

  const handleRefused = async (villa: string) => {
    localStorage.removeItem(`hk_timer_${villa}`);
    const now = new Date().toISOString();
    setCleaningTasks(prev => ({ ...prev, [villa]: { ...prev[villa], status: 'Refused', time_spent: undefined } }));
    toast.success(`Service Refused: Room ${villa}`);
    const payload = { report_date: getDhakaDateStr(), villa_number: villa, host_id: currentHost?.host_id, host_name: currentHost?.full_name, status: 'Refused', updated_at: now };
    const { data, error } = await supabase.from('hsk_cleaning_logs').update(payload).match({ report_date: getDhakaDateStr(), villa_number: villa }).select();
    if (error || !data || data.length === 0) await supabase.from('hsk_cleaning_logs').insert(payload);
  };

  const resetRoomStatus = async (villa: string) => {
      localStorage.removeItem(`hk_timer_${villa}`);
      if (activeCleaningVilla === villa) { setActiveCleaningVilla(null); setCleaningElapsedSeconds(0); }
      
      setCleaningTasks(prev => ({ 
          ...prev, 
          [villa]: { 
              ...prev[villa], 
              status: 'Pending', 
              time_spent: undefined,
              session_history: []
          } 
      }));

      const { data } = await supabase.from('hsk_cleaning_logs').update({ 
          status: 'Pending', 
          time_spent_minutes: null,
          session_history: [],
          updated_at: new Date().toISOString() 
      }).match({ report_date: getDhakaDateStr(), villa_number: villa }).select();
      
      if (!data || data.length === 0) await supabase.from('hsk_cleaning_logs').insert({ report_date: getDhakaDateStr(), villa_number: villa, host_id: currentHost?.host_id, host_name: currentHost?.full_name, status: 'Pending', updated_at: new Date().toISOString() });
  };

  const confirmResetRoom = (villa: string, serviceName: string) => {
      setConfirmModal({
          isOpen: true,
          title: `Undo ${serviceName}?`,
          message: `Are you sure you want to undo the ${serviceName} for Villa ${villa}? This will delete the saved time and reset the status.`,
          confirmText: 'Yes, Undo Service',
          isDestructive: true,
          onConfirm: async () => {
              setConfirmModal(prev => ({ ...prev, isOpen: false }));
              await resetRoomStatus(villa);
          }
      });
  };

  const openEditModal = (villa: string, serviceType: string) => {
      setEditServiceModal({
          isOpen: true,
          villa,
          serviceType,
          startTime: '',
          endTime: '',
          duration: 0
      });
  };

  const submitEditRequest = async () => {
      setIsSaving(true);
      const payload = {
          villa_number: editServiceModal.villa,
          request_type: 'Time Edit Request',
          item_details: `${editServiceModal.serviceType} time edit requested.\nStart: ${editServiceModal.startTime}\nEnd: ${editServiceModal.endTime}\nNew Duration: ${editServiceModal.duration}m`,
          request_time: new Date().toISOString(),
          attendant_name: currentHost?.full_name || 'VA',
          logged_by: currentHost?.full_name || 'VA',
          is_sent: false,
          is_done: false
      };
      
      const { error } = await supabase.from('hsk_daily_requests').insert(payload);
      setIsSaving(false);
      
      if (error) {
          toast.error("Failed to send request.");
      } else {
          toast.success('Edit request sent to Admin!');
          setEditServiceModal({isOpen: false, villa: '', serviceType: '', startTime: '', endTime: '', duration: 0});
      }
  };

  const handleAcStatusChange = async (villaNumber: string, newStatus: string) => {
      setAcData(prev => { const filtered = prev.filter(a => a.villa_number !== villaNumber); return [...filtered, { villa_number: villaNumber, status: newStatus }]; });
      const { error } = await supabase.from('hsk_ac_tracker').upsert({ report_date: getDhakaDateStr(), villa_number: villaNumber, status: newStatus, host_id: currentHost?.host_id, host_name: currentHost?.full_name, updated_at: new Date().toISOString() }, { onConflict: 'villa_number' });
      if (error) { toast.error(`Error: ${error.message}`); loadInitialData(currentHost!, false, true); } 
      else { await supabase.from('hsk_ac_history').insert({ villa_number: villaNumber, status: newStatus, host_id: currentHost?.host_id, host_name: currentHost?.full_name, logged_at: new Date().toISOString() }); toast.success(`Room ${villaNumber} AC turned ${newStatus}`); }
  };

  const groupedTargets = useMemo(() => {
      const expMap: Record<string, any> = {};
      const refMap: Record<string, any> = {};
      expiryTargets.forEach(t => {
          if (t.expiry_date === 'REFILL') { if (!refMap[t.article_number]) refMap[t.article_number] = { ...t, type: 'REFILL' }; } 
          else {
              if (!expMap[t.article_number]) expMap[t.article_number] = { article_number: t.article_number, article_name: t.article_name, dates: [], isMissing: false, type: 'EXPIRY' };
              if (!t.expiry_date || t.expiry_date === 'MISSING') expMap[t.article_number].isMissing = true;
              else expMap[t.article_number].dates.push(t.expiry_date);
          }
      });
      return { expiry: Object.values(expMap), refill: Object.values(refMap).filter(r => !expMap[r.article_number]) };
  }, [expiryTargets]);

  useEffect(() => {
      if (step === 3 && isExpiryMode && selectedVilla && ['Removed', 'Sent', 'Refilled'].includes(expiryVillaData[selectedVilla]?.status)) {
          const initialRefills: Record<string, number> = {};
          const currentRemovalData = expiryVillaData[selectedVilla]?.removal_data || [];
          currentRemovalData.forEach((item: any) => { initialRefills[item.article_number] = item.refilled_qty !== undefined ? item.refilled_qty : item.qty; });
          setRefillCounts(initialRefills);
      }
  }, [step, isExpiryMode, selectedVilla, expiryVillaData]);

  const startAudit = async (villa: string, taskType: string, scheduleId: string) => {
    setIsLoading(true); setSelectedVilla(villa); setActiveTaskType(taskType); setActiveScheduleId(scheduleId); setIsExpiryMode(false); setActiveLocation('All'); setSearchQuery('');
    const { data: allAssigned } = await supabase.from('hsk_inventory_assignments').select('host_id').match({ schedule_id: scheduleId, villa_number: villa }).order('host_id');
    if (allAssigned) setSharedAssignments(allAssigned.map(a => a.host_id));
    
    const initialCounts: Record<string, number> = {};
    const relevantItems = taskType === 'Legacy Minibar' ? masterCatalog.filter(i => i.is_minibar_item) : masterCatalog.filter(i => i.inventory_type === taskType);

    if (taskType === 'Legacy Minibar') {
        const mbPeriod = getDhakaDateStr().substring(0, 7);
        const [y, m] = mbPeriod.split('-').map(Number);
        const { data: sub } = await supabase.from('hsk_villa_minibar_inventory').select('inventory_data').eq('villa_number', villa).gte('logged_at', new Date(y, m - 1, 1).toISOString()).lt('logged_at', new Date(y, m, 1).toISOString()).order('logged_at', { ascending: false }).limit(1).maybeSingle();
        relevantItems.forEach(item => { initialCounts[item.article_number] = 0; });
        if (sub && sub.inventory_data) sub.inventory_data.forEach((item: any) => { initialCounts[item.article_number] = item.qty; });
    } else {
        const { data: recs } = await supabase.from('hsk_inventory_records').select('article_number, counted_qty').eq('schedule_id', scheduleId).eq('villa_number', villa);
        relevantItems.forEach(item => { initialCounts[item.article_number] = 0; });
        if (recs) recs.forEach(r => { initialCounts[r.article_number] = r.counted_qty; });
    }
    setCounts(initialCounts); setStep(3); setIsLoading(false);
  };

  const startExpiryAudit = (villa: string) => {
      setSelectedVilla(villa); setIsExpiryMode(true);
      const initialCounts: Record<string, number> = {};
      groupedTargets.expiry.forEach((t: any) => { initialCounts[t.article_number] = 0; });
      groupedTargets.refill.forEach((t: any) => { initialCounts[t.article_number] = 0; });
      const existingData = expiryVillaData[villa];
      if (existingData && existingData.removal_data) { existingData.removal_data.forEach((item: any) => { initialCounts[item.article_number] = item.qty || 0; }); }
      setExpiryCounts(initialCounts); setStep(3);
  };

  const updateCount = (article_number: string, delta: number) => {
    setCounts(prev => { const next = (prev[article_number] || 0) + delta; return { ...prev, [article_number]: next < 0 ? 0 : next }; });
  };
  const updateExpiryCount = (artNo: string, delta: number) => {
      setExpiryCounts(prev => { const next = (prev[artNo] || 0) + delta; return { ...prev, [artNo]: next < 0 ? 0 : next }; });
  };
  const updateRefillCount = (artNo: string, delta: number) => {
      setRefillCounts(prev => { const next = (prev[artNo] || 0) + delta; return { ...prev, [artNo]: Math.max(0, next) }; });
  };

  const executeSaveInventory = async () => {
    setIsSaving(true);
    if (activeTaskType === 'Legacy Minibar') {
        const countedItems = Object.entries(counts).filter(([_, qty]) => qty > 0).map(([artNo, qty]) => {
                const item = masterCatalog.find(c => c.article_number === artNo); return { article_number: artNo, name: item?.generic_name || item?.article_name, qty };
        });
        const payload = { villa_number: selectedVilla, host_id: currentHost?.host_id, host_name: currentHost?.full_name, inventory_data: countedItems, logged_at: new Date().toISOString() };
        const { error } = await supabase.from('hsk_villa_minibar_inventory').insert(payload);
        if (error) { toast.error("Failed to save minibar: " + error.message); setIsSaving(false); return; }
        setUniversalTasks(prev => { const updated = { ...prev }; if (updated['Legacy Minibar']) { updated['Legacy Minibar'] = updated['Legacy Minibar'].map(t => t.villa_number === selectedVilla ? { ...t, status: 'Submitted' } : t); } return updated; });
    } else {
        const recordsToInsert = Object.entries(counts).filter(([_, qty]) => qty > 0).map(([artNo, qty]) => ({ schedule_id: activeScheduleId, villa_number: selectedVilla, article_number: artNo, counted_qty: qty, inventory_type: activeTaskType }));
        const { error: delErr } = await supabase.from('hsk_inventory_records').delete().match({ schedule_id: activeScheduleId, villa_number: selectedVilla });
        if (delErr) { toast.error("Database error (Clear): " + delErr.message); setIsSaving(false); return; }
        if (recordsToInsert.length > 0) {
            const { error: insErr } = await supabase.from('hsk_inventory_records').insert(recordsToInsert);
            if (insErr) { toast.error("Database error (Save): " + insErr.message); setIsSaving(false); return; }
        }
        await supabase.from('hsk_inventory_assignments').update({ status: 'Submitted' }).match({ schedule_id: activeScheduleId, villa_number: selectedVilla });
        setUniversalTasks(prev => { const updated = { ...prev }; if (updated[activeTaskType]) { updated[activeTaskType] = updated[activeTaskType].map(t => t.villa_number === selectedVilla ? { ...t, status: 'Submitted' } : t); } return updated; });
    }
    setIsSaving(false); setShowSuccess(true);
  };

  const handleEditRemovals = () => {
      const restoredCounts: Record<string, number> = {};
      const currentRemovals = expiryVillaData[selectedVilla]?.removal_data || [];
      currentRemovals.forEach((item: any) => { restoredCounts[item.article_number] = item.qty; });
      setExpiryCounts(restoredCounts);
      setExpiryVillaData(prev => ({ ...prev, [selectedVilla]: { ...(prev[selectedVilla] || {}), status: 'Pending' } }));
  };

  const submitExpiryRemovals = async (statusOverride: 'All OK' | 'Removed') => {
      setIsSaving(true);
      const removalData = Object.entries(expiryCounts).filter(([_, qty]) => qty > 0).map(([artNo, qty]) => {
              const target = groupedTargets.expiry.find((t: any) => t.article_number === artNo) || groupedTargets.refill.find((t: any) => t.article_number === artNo);
              return { article_number: artNo, name: target?.article_name, qty, refilled_qty: 0 };
          });
      const payload = { month_period: getDhakaDateStr().substring(0, 7), villa_number: selectedVilla, host_id: currentHost?.host_id, host_name: currentHost?.full_name, removal_data: statusOverride === 'All OK' ? [] : removalData, status: statusOverride, logged_at: new Date().toISOString() };
      const { data: existing } = await supabase.from('hsk_expiry_removals').select('id').match({ villa_number: selectedVilla, month_period: getDhakaDateStr().substring(0, 7) }).maybeSingle();

      let error;
      if (existing && existing.id) { error = (await supabase.from('hsk_expiry_removals').update(payload).eq('id', existing.id)).error; } 
      else { error = (await supabase.from('hsk_expiry_removals').insert(payload)).error; }

      setIsSaving(false);
      if (error) { toast.error("Failed to save audit."); } 
      else {
          setExpiryVillaData(prev => ({ ...prev, [selectedVilla]: payload }));
          if (statusOverride === 'All OK') { toast.success("Cleared! No items found."); setShowSuccess(true); }
          else toast.success("Removals Recorded! Now fetch replacements.");
      }
  };

  const confirmExpiryRefill = async () => {
      setIsSaving(true);
      const currentData = expiryVillaData[selectedVilla]?.removal_data || [];
      const updatedRemovalData = currentData.map((item: any) => ({ ...item, refilled_qty: refillCounts[item.article_number] !== undefined ? refillCounts[item.article_number] : item.qty }));
      const { error } = await supabase.from('hsk_expiry_removals').update({ status: 'Refilled', removal_data: updatedRemovalData, logged_at: new Date().toISOString() }).match({ villa_number: selectedVilla, month_period: getDhakaDateStr().substring(0, 7) });

      setIsSaving(false);
      if (error) { toast.error("Failed to confirm refill."); } 
      else {
          const currentRecord = expiryVillaData[selectedVilla] || {};
          setExpiryVillaData(prev => ({ ...prev, [selectedVilla]: { ...currentRecord, status: 'Refilled', removal_data: updatedRemovalData }}));
          toast.success("Replacements Confirmed!");
          setShowSuccess(true);
      }
  };

  const resetFlow = () => { setShowSuccess(false); setSelectedVilla(''); setIsExpiryMode(false); setStep(2); };

  const getVillaCardData = (vNum: string) => {
      const match = guestData.find(r => r.villa_number === vNum);
      const st = match?.status?.toUpperCase() || 'VAC';
      let headerColor = 'bg-slate-200 text-slate-700'; 
      let shortStatus = st, timeStr = '', guestName = match?.guest_name || '';

      if (st.includes('ARR')) { headerColor = 'bg-green-500 text-white'; if(match?.arrival_time) timeStr = match.arrival_time; } 
      else if (st.includes('VAC') || st === 'VM/VAC') { headerColor = 'bg-sky-500 text-white'; shortStatus = 'VAC'; } 
      else if (st.includes('TMA')) { headerColor = 'bg-yellow-400 text-slate-900'; } 
      else if (st.includes('DEP')) { headerColor = 'bg-rose-500 text-white'; if(match?.departure_time) timeStr = match.departure_time; } 
      else if (st.includes('HOUSE USE') || st.includes('SHOW')) { headerColor = 'bg-[#6D2158] text-white'; }

      const acMatch = acData.find(a => a.villa_number === vNum);
      const acStatus = acMatch ? acMatch.status.toUpperCase() : 'ON';

      let cleaningType = 'Occupied';
      if (st.includes('DEP')) cleaningType = 'Departure';
      if (st.includes('ARR')) cleaningType = 'Arrival';
      if (st.includes('VAC')) cleaningType = 'Touch Up';

      return { status: shortStatus, headerColor, timeStr, guestName, acStatus, cleaningType };
  };

  const displayVillas = useMemo(() => {
      const s = new Set<string>([...myCleaningVillas, ...expiryAssignedVillas]);
      Object.values(universalTasks).forEach(tasks => { tasks.forEach(t => s.add(t.villa_number)); });
      return Array.from(s).sort((a,b) => parseFloat(a.replace('-', '.')) - parseFloat(b.replace('-', '.')));
  }, [myCleaningVillas, expiryAssignedVillas, universalTasks]);

  const activeCatalog = activeTaskType === 'Legacy Minibar' ? masterCatalog.filter(i => i.is_minibar_item) : masterCatalog.filter(i => i.inventory_type === activeTaskType);
      
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
          list = list.filter(i => (i.article_name || '').toLowerCase().includes(q) || (i.generic_name || '').toLowerCase().includes(q) || (i.article_number || '').includes(q));
      }
      return list;
  }, [activeCatalog, selectedVilla, sharedAssignments, currentHost, activeLocation, searchQuery]);

  const uniqueLocations = Array.from(new Set(activeCatalog.map(i => i.villa_location).filter(Boolean))) as string[];
  const hasUnassignedLocations = activeCatalog.some(i => !i.villa_location);
  const locationFilters = ['All', ...uniqueLocations];
  if (hasUnassignedLocations) locationFilters.push('Unassigned');

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-2 md:p-4 font-sans text-slate-800 pb-24">
      <div className="max-w-7xl mx-auto w-full flex flex-col animate-in fade-in">
        
        {step === 2 && currentHost && (
            <>
                <div className="flex items-center justify-between mb-6 bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                   <div className="flex items-center gap-4">
                       <div className="w-14 h-14 rounded-2xl bg-[#6D2158] text-white flex items-center justify-center text-xl font-black shadow-lg shrink-0">{currentHost.full_name.charAt(0)}</div>
                       <div>
                         <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#6D2158]">My Tasks</h1>
                         <p className="text-[10px] md:text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{format(getDhakaTime(), 'EEEE, d MMMM yyyy')}</p>
                       </div>
                   </div>
                   <button onClick={() => loadInitialData(currentHost!, true)} className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full transition-colors active:scale-95" title="Refresh Tasks"><RefreshCw size={18} className={isLoading ? 'animate-spin text-[#6D2158]' : ''}/></button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
                ) : (
                    <div className="space-y-6">
                        <RoomCleaningGrid 
                            displayVillas={displayVillas}
                            myCleaningVillas={myCleaningVillas}
                            cleaningTasks={cleaningTasks}
                            activeCleaningVilla={activeCleaningVilla}
                            getVillaCardData={getVillaCardData}
                            handleAcStatusChange={handleAcStatusChange}
                            startAudit={startAudit}
                            handleFinishRoom={(v) => handleFinishRoom(v)}
                            setReenterModal={setReenterModal}
                            handleDND={handleDND}
                            handleRefused={handleRefused}
                            confirmResetRoom={confirmResetRoom}
                            openEditModal={openEditModal}
                            isNightShift={getDhakaTime().getHours() >= 17}
                            universalTasks={universalTasks}
                            cleaningElapsedSeconds={cleaningElapsedSeconds}
                            formatTimer={formatTimer}
                            expiryAssignedVillas={expiryAssignedVillas}
                            expiryVillaData={expiryVillaData}
                            startExpiryAudit={startExpiryAudit}
                        />

                        {displayVillas.length === 0 && (
                            <div className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm max-w-lg mx-auto mt-10">
                                <CheckCircle size={40} className="mx-auto text-emerald-300 mb-3"/>
                                <p className="font-bold text-slate-500">You have no active tasks right now.</p>
                            </div>
                        )}
                    </div>
                )}
            </>
        )}

        {step === 3 && currentHost && (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-8 duration-300">
                <div className={`${isExpiryMode ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-white border-slate-100'} p-4 md:p-6 rounded-3xl shadow-sm border mb-4 md:mb-6 flex flex-col gap-4`}>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => { setStep(2); setIsExpiryMode(false); }} className={`p-2.5 md:p-3 rounded-full transition-colors ${isExpiryMode ? 'bg-white hover:bg-rose-100 text-rose-600' : 'bg-slate-50 hover:bg-slate-100 text-slate-500'}`}><ChevronLeft size={18}/></button>
                            <div>
                                <h2 className={`text-xl md:text-2xl font-black ${isExpiryMode ? 'text-rose-700' : 'text-[#6D2158]'}`}>{selectedVilla}</h2>
                                <p className={`text-[10px] md:text-xs font-bold uppercase tracking-widest mt-0.5 ${isExpiryMode ? 'text-rose-500' : 'text-slate-400'}`}>
                                    {isExpiryMode ? 'Targeted Tasks' : (activeTaskType === 'Legacy Minibar' ? `${format(getDhakaTime(), 'MMMM')} Minibar Inventory` : `${activeTaskType} Audit`)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {isExpiryMode ? (
                    <ExpiryAuditGrid 
                        step={3}
                        selectedVilla={selectedVilla}
                        handleEditRemovals={handleEditRemovals}
                        groupedTargets={groupedTargets}
                        expiryCounts={expiryCounts}
                        refillCounts={refillCounts}
                        updateExpiryCount={updateExpiryCount}
                        updateRefillCount={updateRefillCount}
                        masterCatalog={masterCatalog}
                        submitExpiryRemovals={submitExpiryRemovals}
                        confirmExpiryRefill={confirmExpiryRefill}
                        isSaving={isSaving}
                        expiryVillaData={expiryVillaData}
                    />
                ) : activeTaskType === 'Legacy Minibar' ? (
                    <MinibarInventoryGrid 
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        locationFilters={locationFilters}
                        activeLocation={activeLocation}
                        setActiveLocation={setActiveLocation}
                        displayCatalog={displayCatalog}
                        counts={counts}
                        updateCount={updateCount}
                        requestSaveInventory={() => setConfirmModal({ isOpen: true, title: `Submit Location ${selectedVilla}?`, message: "Are you sure you want to save this inventory record?", confirmText: "Confirm Minibar Inventory", isDestructive: false, onConfirm: () => { setConfirmModal(prev => ({ ...prev, isOpen: false })); executeSaveInventory(); } })}
                        isSaving={isSaving}
                        activeTaskType={activeTaskType}
                    />
                ) : (
                    <AssetInventoryGrid 
                        step={3}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        locationFilters={locationFilters}
                        activeLocation={activeLocation}
                        setActiveLocation={setActiveLocation}
                        displayCatalog={displayCatalog}
                        counts={counts}
                        updateCount={updateCount}
                        requestSaveInventory={() => setConfirmModal({ isOpen: true, title: `Submit Location ${selectedVilla}?`, message: "Are you sure you want to save this inventory record?", confirmText: "Submit Record", isDestructive: false, onConfirm: () => { setConfirmModal(prev => ({ ...prev, isOpen: false })); executeSaveInventory(); } })}
                        isSaving={isSaving}
                        activeTaskType={activeTaskType}
                    />
                )}
            </div>
        )}

        {/* --- RE-ENTER REASON MODAL --- */}
        {reenterModal.isOpen && (
            <div className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 text-center">
                    <h3 className="text-xl md:text-2xl font-black mb-2 tracking-tight text-[#6D2158]">Service Room {reenterModal.villa}</h3>
                    <p className="text-xs md:text-sm text-slate-500 font-medium mb-6 md:mb-8 leading-relaxed">Please select the type of service for this room.</p>
                    <div className="flex flex-col gap-2.5">
                        {['Service', 'Arrival', 'Dep', 'Minibar Refill', 'Guest Request', 'Other'].map(reason => (
                            <button key={reason} onClick={() => { handleStartService(reenterModal.villa, reason); setReenterModal({isOpen: false, villa: ''}); }} className="w-full py-3.5 bg-slate-50 text-slate-700 hover:bg-[#6D2158] hover:text-white rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all border border-slate-200 hover:border-[#6D2158]">{reason}</button>
                        ))}
                        <button onClick={() => setReenterModal({ isOpen: false, villa: '' })} className="w-full mt-2 py-3.5 bg-white text-rose-500 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all">Cancel</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- EDIT SERVICE MODAL --- */}
        {editServiceModal.isOpen && (
            <div className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 text-center">
                    <h3 className="text-xl md:text-2xl font-black mb-2 tracking-tight text-[#6D2158]">Edit {editServiceModal.serviceType}</h3>
                    <p className="text-xs md:text-sm text-slate-500 font-medium mb-6 leading-relaxed">Villa {editServiceModal.villa}</p>
                    
                    <div className="space-y-4 mb-6 text-left">
                        <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block ml-1">Start Time</label>
                            <input type="time" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-[#6D2158]" value={editServiceModal.startTime} onChange={e => setEditServiceModal(prev => ({...prev, startTime: e.target.value}))} />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block ml-1">End Time</label>
                            <input type="time" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-[#6D2158]" value={editServiceModal.endTime} onChange={e => setEditServiceModal(prev => ({...prev, endTime: e.target.value}))} />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block ml-1">Duration (Auto)</label>
                            <input type="text" readOnly className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl font-black text-[#6D2158]" value={`${editServiceModal.duration} mins`} />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <button onClick={submitEditRequest} disabled={!editServiceModal.startTime || !editServiceModal.endTime || isSaving} className="w-full py-3.5 bg-[#6D2158] text-white rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all disabled:opacity-50">Send Request to Admin</button>
                        <button onClick={() => setEditServiceModal(prev => ({...prev, isOpen: false}))} className="w-full py-3.5 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all border border-slate-200">Cancel</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- CUSTOM CONFIRMATION MODAL --- */}
        {confirmModal.isOpen && (
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 text-center">
                    <h3 className={`text-xl md:text-2xl font-black mb-2 tracking-tight ${confirmModal.isDestructive ? 'text-rose-600' : 'text-[#6D2158]'}`}>{confirmModal.title}</h3>
                    <p className="text-xs md:text-sm text-slate-500 font-medium mb-6 md:mb-8 leading-relaxed">{confirmModal.message}</p>
                    <div className="flex flex-col gap-2.5">
                        <button onClick={confirmModal.onConfirm} className={`w-full py-3.5 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2 ${confirmModal.isDestructive ? 'bg-rose-600 shadow-rose-200' : 'bg-[#6D2158] shadow-purple-200'}`}><Save size={16}/> {confirmModal.confirmText}</button>
                        <button onClick={() => setConfirmModal(prev => ({...prev, isOpen: false}))} className="w-full py-3.5 bg-slate-50 text-slate-500 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all hover:bg-slate-100">Cancel</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- SUCCESS OVERLAY --- */}
        {showSuccess && (
            <div className="fixed inset-0 z-[90] bg-emerald-600 flex flex-col items-center justify-center text-white p-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-5"><CheckCircle2 size={48} className="text-white"/></div>
                <h2 className="text-3xl font-black text-center mb-2">Saved!</h2>
                <p className="text-center font-medium text-emerald-100 mb-10 text-sm md:text-base">Location {selectedVilla} record has been logged.</p>
                <button onClick={resetFlow} className="px-8 py-4 bg-white text-emerald-700 rounded-xl font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all hover:scale-105">Return to Hub</button>
            </div>
        )}

        {/* ⚡ ACTIVE SERVICE FLOATING BANNER */}
        {activeCleaningVilla && (
            <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-4 md:px-6 py-3 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.2)] flex items-center gap-3 md:gap-5 animate-in slide-in-from-bottom-10 border-2 transition-colors ${
                cleaningElapsedSeconds > 2700 ? 'bg-rose-600 border-rose-400' : 'bg-emerald-600 border-emerald-400'
            }`}>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 font-black text-white text-[10px] md:text-xs tracking-widest uppercase">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cleaningElapsedSeconds > 2700 ? 'bg-white' : 'bg-emerald-200'}`}></span>
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cleaningElapsedSeconds > 2700 ? 'bg-white' : 'bg-emerald-100'}`}></span>
                        </span>
                        <span className="truncate">{cleaningElapsedSeconds > 2700 ? 'Timer Warning' : 'Active Room'}</span>
                    </div>
                    <div className="text-xl md:text-2xl font-mono text-white font-black tracking-widest leading-none mt-1 whitespace-nowrap">
                        V{activeCleaningVilla} - {formatTimer(cleaningElapsedSeconds)}
                    </div>
                </div>
                <div className="w-px h-8 bg-white/30 mx-1 md:mx-2 shrink-0"></div>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleFinishRoom(activeCleaningVilla); }}
                    className="bg-white text-slate-800 px-4 py-2.5 md:py-3 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest shadow-sm active:scale-95 flex items-center justify-center gap-2 hover:bg-slate-50 shrink-0"
                >
                    <CheckSquare size={16} className="shrink-0"/> Finish
                </button>
            </div>
        )}

      </div>
    </div>
  );
}